// ============================================================
// /api/agent-watch — the door of the watches (api/_lib/agent/watch*.ts): "tell me if this moves that much".
// It exists only when BOBBY_AGENT_WATCHES is exactly "on", and then for whom the agent engine exists
// (BOBBY_AGENT_ENGINE: the pilot's list, or everyone). Anyone else gets the 404 of a door that is not there.
//
//   GET                                   the account's watches: { version, watches, limit, active, options }
//   POST { op: "create", requestId, symbol, direction, percent, days, language, locale? }
//        starts a watch, or returns the one this requestId already started (the same id with other values: 409).
//        The close it is measured from is read HERE, by the strict reader, before anything is stored: an asset
//        that cannot be read now is refused, never watched blind.
//   POST { op: "cancel" | "seen", watchId }
//   GET  ?tick=1                          the scheduler only (Bearer CRON_SECRET): one tick of the worker.
// Every reply to a person is the whole list, so a client never has to merge.
//
// Whose watch it is: the account the sign-in service resolves from the request's bearer (Apple or Google). A
// watch needs an account because its notification does. A body field can never name an account, a limit or a
// reference close. What an account may have looking at once is WATCH_LIMIT: three, ten with Bobby Pro.
// A watch calls no model and spends no provider money; the engine's reads and dollar ceiling are not touched.
// Storage follows BOBBY_AGENT_STORE as the engine's does: "postgres" in production (agent-watches.sql, which is
// NOT applied anywhere yet), "memory" for a preview. With none, or with storage that does not answer: 503.
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { APP_LANGUAGES, APP_LOCALES } from '../src/lib/app-language.js';
import { agentEngineMode, inPilot } from './agent-task.js';
import { isPro } from './_lib/briefings/db.js';
import { HttpError, accountLimit, requireAccount } from './_lib/briefings/http.js';
import { requestOriginHost } from './_lib/origins.js';
import { requireInternalAuth } from './_lib/request-security.js';
import type { Identity } from './_lib/user-identity.js';
import { UNIVERSE, readDaily } from './_lib/agent/tools.js';
import { WATCH_DAYS, WATCH_DIRECTIONS, WATCH_LIMIT, WATCH_PERCENTS, WATCH_VERSION, watchView } from './_lib/agent/watch.js';
import { MemoryWatchStore, PgWatchStore, postgrestWatchRpc, type NewWatch, type WatchStore } from './_lib/agent/watch-store.js';
import { runWatchTick, watchWorkerDeps, type WatchWorkerDeps } from './_lib/agent/watch-worker.js';

export const config = { maxDuration: 60 };
/** A tick stops starting work this long after it began: the function's own limit is sixty seconds. */
const TICK_BUDGET_MS = 45_000;
export const agentWatchesOn = (env: NodeJS.ProcessEnv = process.env): boolean => env.BOBBY_AGENT_WATCHES === 'on';

let memory: MemoryWatchStore | null = null;
export interface WatchDoorDeps { store: WatchStore; account: (req: VercelRequest) => Promise<Identity>; isPro: (identity: string) => Promise<boolean>; limit: (identity: string) => Promise<void>; worker: Partial<WatchWorkerDeps> }
let testDeps: Partial<WatchDoorDeps> | null = null;
/** Tests only: the store, the account, the plan and the worker's sources; null restores the real ones and a fresh memory store. */
export function __setWatchTestDeps(over: typeof testDeps): void { testDeps = over; memory = null; }
export function watchStore(env: NodeJS.ProcessEnv = process.env): WatchStore | null {
  if (testDeps?.store) return testDeps.store;
  const where = env.BOBBY_AGENT_STORE?.trim();
  if (where === 'memory') return (memory ??= new MemoryWatchStore());
  return where === 'postgres' ? new PgWatchStore(postgrestWatchRpc) : null;
}

const one = <T extends readonly number[]>(values: T) => z.number().refine((n): n is T[number] => (values as readonly number[]).includes(n));
const Create = z.object({
  op: z.literal('create'), requestId: z.guid(), symbol: z.string().regex(/^[A-Z]{1,8}$/), direction: z.enum(WATCH_DIRECTIONS),
  percent: one(WATCH_PERCENTS), days: one(WATCH_DAYS), language: z.enum(APP_LANGUAGES).default('en'), locale: z.enum(APP_LOCALES).optional().catch(undefined),
}).strict();
const Act = z.object({ op: z.enum(['cancel', 'seen']), watchId: z.string().regex(/^watch_[a-f0-9]{32}$/) }).strict();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  try { return await door(req, res); } catch (error) {
    if (error instanceof HttpError) { for (const [k, v] of Object.entries(error.headers)) res.setHeader(k, v); return res.status(error.status).json({ version: WATCH_VERSION, error: { code: error.code } }); }
    // Storage that cannot answer is never guessed around.
    console.error(JSON.stringify({ route: 'agent-watch', event: 'storage_failed' }));
    return res.status(503).json({ version: WATCH_VERSION, error: { code: 'watch_storage_unavailable' } });
  }
}

async function door(req: VercelRequest, res: VercelResponse) {
  const refuse = (status: number, code: string) => res.status(status).json({ version: WATCH_VERSION, error: { code } });
  if (req.method === 'GET' && req.query.tick === '1') {
    if (!requireInternalAuth(req, res)) return;
    // Off, or nowhere to keep them: the scheduler is told so and nothing is read or sent.
    const kept = agentWatchesOn() ? watchStore() : null;
    if (!kept) return res.status(200).json({ enabled: false });
    // One clock for the tick: the deadline is counted on the worker's own.
    const worker = watchWorkerDeps(kept, testDeps?.worker ?? {});
    return res.status(200).json({ enabled: true, ...await runWatchTick(worker, worker.now() + TICK_BUDGET_MS) });
  }
  const mode = agentEngineMode();
  if (!agentWatchesOn() || mode === 'off' || (mode === 'pilot' && !await inPilot(req))) return res.status(404).json({ error: 'Not found' });
  if (req.method !== 'POST' && req.method !== 'GET') return refuse(405, 'method_not_allowed');
  if (!requestOriginHost(req.headers)) return refuse(403, 'origin_not_allowed');
  const identity = await (testDeps?.account ?? requireAccount)(req);
  // A notification needs a person who signed in with Apple or Google: a wallet session has no device to tell.
  if (!['apple', 'google'].includes(identity.provider ?? '')) return refuse(401, 'signin_required');
  const store = watchStore();
  if (!store) return refuse(503, 'watch_storage_unavailable');
  const limitOf = async () => { try { return await (testDeps?.isPro ?? isPro)(identity.id) ? WATCH_LIMIT.pro : WATCH_LIMIT.free; } catch { return WATCH_LIMIT.free; } };
  const list = async (status = 200, limit?: number) => {
    const watches = await store.list(identity.id);
    return res.status(status).json({
      version: WATCH_VERSION, watches: watches.map(watchView), limit: limit ?? await limitOf(), active: watches.filter((watch) => watch.state === 'active').length,
      options: { symbols: UNIVERSE.map((instrument) => instrument.symbol), directions: WATCH_DIRECTIONS, percents: WATCH_PERCENTS, days: WATCH_DAYS },
    });
  };
  if (req.method === 'GET') return list();

  await (testDeps?.limit ?? ((id: string) => accountLimit('agent-watch', id, 20)))(identity.id);
  let body: unknown = null;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return refuse(400, 'invalid_request'); }
  const create = Create.safeParse(body);
  if (create.success) {
    const { requestId, symbol, direction, percent, days, language } = create.data, locale = create.data.locale ?? null;
    if (!UNIVERSE.some((instrument) => instrument.symbol === symbol)) return refuse(400, 'watch_unknown_asset');
    const worker = watchWorkerDeps(store, testDeps?.worker ?? {}), now = worker.now();
    // The same request sent again returns its watch with the reference it was made with: what is read here is then discarded.
    const bodyDigest = createHash('sha256').update(JSON.stringify([symbol, direction, percent, days, language, locale])).digest('hex');
    const read = await readDaily(symbol, worker.tools);
    if (!read) return refuse(503, 'watch_unreadable');
    const last = read.bars.at(-1)!, limit = await limitOf();
    const input: NewWatch = {
      id: `watch_${randomUUID().replace(/-/g, '')}`, identity: identity.id, requestId, bodyDigest, symbol, direction, percent, days, language, locale,
      reference: { day: last.day, close: last.close, currency: read.currency }, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + days * 86_400_000).toISOString(),
    };
    const made = await store.create(input, limit, now);
    if (made.state === 'mismatch') return refuse(409, 'request_id_reused');
    if (made.state === 'limit') return refuse(409, 'watch_limit');
    return list(made.state === 'new' ? 201 : 200, limit);
  }
  const act = Act.safeParse(body);
  if (!act.success) return refuse(400, 'invalid_request');
  const done = act.data.op === 'cancel' ? await store.cancel(identity.id, act.data.watchId, Date.now()) : await store.seen(identity.id, act.data.watchId, Date.now());
  // Another account's watch, one that never existed and one that cannot be cancelled any more are the same answer.
  return done ? list() : refuse(404, 'not_found');
}
