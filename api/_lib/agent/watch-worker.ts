// ============================================================
// Watches: one tick of the scheduler (api/agent-watch.ts ?tick=1, every fifteen minutes). In order, each bounded
// and aware of the deadline:
//   1. look     claim the watches whose next look is due; read each instrument ONCE for all who watch it (the
//               strict reader of read_assets); for each watch: met, quiet, unreadable, or past its last day.
//               A met watch gets what code writes about it (watch.ts) in the same write that ends it.
//   2. notify   claim the met watches that owe their notification and send it to the account's devices.
//   3. purge    remove what ended more than WATCH_KEEP_DAYS ago.
// Invariants:
//   · no model call, no provider money: a tick costs source requests and nothing else;
//   · a watch that cannot be read is never met and never silently dropped: it is looked at again, and when its
//     last day passes it ends saying it could not be followed;
//   · a notification is claimed before it is sent and never claimed twice: an ambiguous send is not repeated;
//   · without APNs credentials or the token key nothing is claimed: the notification stays owed;
//   · logs carry stage names, counts and codes: never an account, an asset or a token.
// Every dependency is injectable, so the tests run without a network, a database or a clock.
// ============================================================
import { createHash, randomUUID } from 'node:crypto';
import { apnsConfig, pushMasterKey, type ApnsConfig } from '../briefings/config.js';
import { closeApns, sendApnsPayload, type ApnsDelivery, type ApnsOutcome } from '../briefings/apns.js';
import { decryptToken } from '../briefings/push-crypto.js';
import { readAssets, readDaily, type ToolContext } from './tools.js';
import { WATCH_KEEP_DAYS, checkWatch, watchPayload, watchResult } from './watch.js';
import type { WatchClaim, WatchStore } from './watch-store.js';
import type { DailyBar } from '../harness/bars.js';

export interface WatchTickReport { looked: number; met: number; quiet: number; unreadable: number; expired: number; lost: number; notified: number; undelivered: number; purged: number; codes: string | null; stoppedEarly: boolean }
export interface WatchWorkerDeps {
  store: WatchStore; tools: ToolContext; now: () => number; worker: string;
  apnsConfig: () => ApnsConfig | null; pushMasterKey: () => Buffer | null;
  decryptToken: (sealed: string, master: Buffer) => string;
  send: (cfg: ApnsConfig, n: ApnsDelivery, payload: Record<string, unknown>, now: Date) => Promise<ApnsOutcome>;
  close: () => void;
  logger: { error: (...args: unknown[]) => void };
}

/** Watches looked at in one tick, and how long a worker may hold them. */
export const LOOK_BATCH = 200;
export const LOOK_LEASE_MS = 120_000;
/** How soon a watch is looked at again. A close arrives once a day; the source publishes it some time after the bell. */
export const LOOK_AGAIN_MS = 30 * 60_000;
export const PUSH_BATCH = 50;
/** How long Apple keeps trying a notification for a phone that is off. */
const PUSH_LIVES_MS = 24 * 3_600_000;
const STAGE_MIN_MS = 4_000, PUSH_MIN_MS = 12_000;

export function watchWorkerDeps(store: WatchStore, over: Partial<WatchWorkerDeps> = {}): WatchWorkerDeps {
  const now = over.now ?? (() => Date.now());
  return {
    store, now, worker: over.worker ?? `ww_${randomUUID().slice(0, 8)}`,
    tools: over.tools ?? {
      now: () => new Date(now()),
      fetchJson: async (url) => {
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BobbyAgentTrader/1.0)' } });
          return r.ok ? await r.json() : null;
        } catch { return null; }
      },
    },
    apnsConfig: over.apnsConfig ?? (() => apnsConfig()), pushMasterKey: over.pushMasterKey ?? (() => pushMasterKey()),
    decryptToken: over.decryptToken ?? decryptToken,
    send: over.send ?? ((cfg, n, payload, at) => sendApnsPayload(cfg, n, payload, undefined, at)),
    close: over.close ?? closeApns, logger: over.logger ?? console,
  };
}

/** A stable apns-id for one watch on one device: the same notification sent again is the same one to Apple. */
const apnsIdFor = (watchId: string, token: string) => {
  const h = createHash('sha256').update(`${watchId}\n${token}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

export async function runWatchTick(d: WatchWorkerDeps, deadlineAt: number): Promise<WatchTickReport> {
  const report: WatchTickReport = { looked: 0, met: 0, quiet: 0, unreadable: 0, expired: 0, lost: 0, notified: 0, undelivered: 0, purged: 0, codes: null, stoppedEarly: false };
  const codes = new Set<string>(), left = () => deadlineAt - d.now();

  // 1. look
  let claims: WatchClaim[] = [];
  try { claims = await d.store.claimDue(d.worker, LOOK_LEASE_MS, LOOK_BATCH, d.now()); } catch { d.logger.error('[agent-watch] claim', 'storage'); codes.add('storage'); }
  const series = new Map<string, Promise<DailyBar[] | null>>();
  const barsOf = (symbol: string) => {
    if (!series.has(symbol)) series.set(symbol, readDaily(symbol, d.tools).then((read) => read?.bars ?? null).catch(() => null));
    return series.get(symbol)!;
  };
  for (const { watch, fence } of claims) {
    // Out of time: what is left keeps its lease until it runs out and is looked at by the next tick.
    if (left() < STAGE_MIN_MS) { report.stoppedEarly = true; break; }
    report.looked++;
    try {
      const check = checkWatch(watch, await barsOf(watch.symbol));
      const over = d.now() >= Date.parse(watch.expiresAt);
      let wrote: boolean;
      if (check.kind === 'met') {
        // The plain reading of the asset's last thirty days, by code. When it does not come back the two closes are told alone.
        const analysis = await readAssets({ symbols: [watch.symbol], windowDays: 30 }, d.tools).then((out) => out.analysis ?? null).catch(() => null);
        wrote = await d.store.met(watch.id, fence, check.met, watchResult(watch, check.met, analysis), d.now());
        if (wrote) report.met++;
      } else if (over) {
        wrote = await d.store.expire(watch.id, fence, check.kind === 'unreadable', d.now());
        if (wrote) report.expired++;
      } else {
        wrote = await d.store.quiet(watch.id, fence, check.kind === 'quiet' ? check.through : null, check.kind === 'unreadable', d.now() + LOOK_AGAIN_MS);
        if (wrote) { if (check.kind === 'unreadable') report.unreadable++; else report.quiet++; }
      }
      // Cancelled meanwhile, or another worker holds it now: nothing was written, and nothing is owed.
      if (!wrote) report.lost++;
    } catch { d.logger.error('[agent-watch] look', 'storage'); codes.add('storage'); }
  }

  // 2. notify
  if (left() >= PUSH_MIN_MS) await notify(d, report, codes, left);
  else report.stoppedEarly = true;

  // 3. purge
  if (left() >= STAGE_MIN_MS) { try { report.purged = await d.store.purge(d.now(), WATCH_KEEP_DAYS, 500); } catch { d.logger.error('[agent-watch] purge', 'storage'); codes.add('storage'); } }
  report.codes = codes.size ? [...codes].sort().join(',') : null;
  return report;
}

async function notify(d: WatchWorkerDeps, report: WatchTickReport, codes: Set<string>, left: () => number): Promise<void> {
  const cfg = d.apnsConfig(), master = d.pushMasterKey();
  if (!cfg) { codes.add('apns_unconfigured'); return; }
  if (!master) { codes.add('push_key_unavailable'); return; }
  let owed: Awaited<ReturnType<WatchStore['claimPushes']>> = [];
  try { owed = await d.store.claimPushes(PUSH_BATCH, d.now()); } catch { d.logger.error('[agent-watch] push_claim', 'storage'); codes.add('storage'); return; }
  try {
    for (const watch of owed) {
      // Claimed and not sent for lack of time stays `sending`: it is never sent later. The answer is in the app either way.
      if (left() < PUSH_MIN_MS) { report.stoppedEarly = true; report.undelivered++; continue; }
      let accepted = false;
      try {
        for (const device of await d.store.devices(watch.identity)) {
          let token: string;
          try { token = d.decryptToken(device.tokenCiphertext, master); } catch { codes.add('token_unreadable'); continue; }
          let out: ApnsOutcome;
          try {
            out = await d.send(cfg, { token, environment: device.environment, topic: device.topic, apnsId: apnsIdFor(watch.id, token), collapseId: `watch-${watch.id.slice(6, 46)}`, expiresAt: new Date(d.now() + PUSH_LIVES_MS) }, watchPayload(watch), new Date(d.now()));
          } catch { out = { outcome: 'ambiguous', status: null, reason: 'send_threw' }; }
          if (out.outcome === 'accepted') accepted = true;
          else if (out.outcome === 'config') codes.add('apns_config');
        }
        await d.store.pushed(watch.id, accepted ? 'sent' : 'failed');
      } catch { d.logger.error('[agent-watch] push', 'storage'); codes.add('storage'); }
      if (accepted) report.notified++; else report.undelivered++;
    }
  } finally { try { d.close(); } catch { /* sessions are per instance */ } }
}
