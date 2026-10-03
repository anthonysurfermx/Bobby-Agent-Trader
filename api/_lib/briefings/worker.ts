// ============================================================
// Bobby Pro market briefings — one worker tick (spec §5). Called by api/briefing-worker.ts every 5 minutes (cron)
// or by a manual ops run. Stages, in order, each bounded and deadline-aware:
//   1. reconcile   — expired leases back to claimable, unknown paid attempts assumed charged after the settle window
//                    (D8), past-deadline reports failed, overdue deliveries expired;
//   2. per due period (calendar.duePeriods: preparation or dispatch window of an adopted cadence):
//        seed      — one pending report per switched-on Pro account (idempotent: a replayed cron inserts nothing);
//        shared    — per language some open report is written in: one narrative for (cadence, period, language),
//                    by the model inside a reserved attempt (budget.ts), else the facts-only fallback (D1);
//        personal  — claim ≤ PREPARE_BATCH → deterministic composition → validate → fenced publish;
//        audio     — weekly: pre-synthesis of the narration of reports published in this tick whose owner
//                    gave audio consent, a few cache keys per tick (TTS slots and caps enforced by the reservation);
//   3. dispatch    — fill the outbox for due ready reports, claim ≤ DELIVERY_BATCH, decrypt, APNs, record outcome;
//   4. purge       — bounded retention deletes, then the returned Storage objects.
// Invariants:
//   · no report ⇒ no push: the outbox only ever holds rows for `ready` reports (SQL), and a shared narrative that
//     cannot be grounded in real evidence is never published — the period stays pending, then fails at its
//     deadline (honest "unavailable" in the inbox);
//   · when budget or providers fail, or the ready-by deadline is near, the report is still produced from the
//     facts-only narrative (quality 'facts_only'): numbers come from evidence, nothing is invented;
//   · an `unknown` provider outcome is never retried in the same tick (no second paid attempt for that narrative
//     while the first may still be billed); with time left before ready-by the row is deferred to a later tick;
//   · this module never calls trading/cycle routes nor /api/bobby-intel over HTTP: evidence comes from the
//     read-only market snapshot (evidence.ts → market-snapshot.ts);
//   · SQL decides "now" for leases, windows and expiry (now()); `opts.now` only selects the calendar periods (an
//     ops run outside production may shift it, see api/briefing-worker.ts);
//   · logs carry stage names, counts and codes only — never identities, symbols, tokens or report text.
// Every dependency is injectable (WorkerDeps) so tests run without a network, a database or a clock.
// ============================================================
import * as dbModule from './db.js';
import { BriefingStorageError } from './db.js';
import { closeApns, sendApns, type ApnsNotification, type ApnsOutcome } from './apns.js';
import { supabaseAudioStore, type AudioStore } from './audio-store.js';
import { withReservation, type ReservationFailure } from './budget.js';
import { duePeriods, schedulePolicy, type SchedulePolicy } from './calendar.js';
import { audioCacheKey, composeReport, validateContent } from './compose.js';
import {
  BRIEF_VIBE, DELIVERY_BATCH, LEASE_SECONDS, LLM_TIMEOUT_MS, PREPARE_BATCH, PROVIDER_MIN_REMAINING_MS, RETENTION, SUPPORTED_ASSETS,
  SHARED_MAX_ATTEMPTS, TTS_MODEL, WORKER_BUDGET_MS, WORKER_MAX_DURATION_S, apnsConfig, briefingsEnabled, briefingsMemoryOn,
  llmChoices, llmMaxTokens, pushMasterKey, settleSeconds, type ApnsConfig, type LlmChoice,
} from './config.js';
import { buildEvidence } from './evidence.js';
import { factsOnlyNarrative, narrativeRequest, validateNarrative } from './narrative.js';
import { decryptToken } from './push-crypto.js';
import { llmJsonOnce, llmReserveUsd } from './providers.js';
import { ensureAudio } from './voice.js';
import type { BriefEvidence, BriefLanguage, Period, SharedNarrative } from './types.js';

export interface TickReport {
  enabled: boolean; claimed: number; seeded: number; published: number; failed: number; sharedReady: number; audioReady: number;
  dispatched: number; accepted: number; expired: number; purged: number;
  /** Comma-separated budget/configuration codes met in this tick (e.g. 'budget_unavailable,apns_unconfigured'), or null. */
  budget: string | null;
  stoppedEarly: boolean;
}

export type WorkerDb = Pick<typeof dbModule,
  'reconcile' | 'seedPeriod' | 'openLanguages' | 'neededAssets' | 'claimShared' | 'commitShared' | 'claimBriefs' | 'publishBrief'
  | 'failBrief' | 'requestAudio' | 'fillOutbox' | 'claimOutbox' | 'outboxResult' | 'purge'>;

export interface WorkerDeps {
  enabled: () => boolean;
  db: WorkerDb;
  schedulePolicy: () => SchedulePolicy;
  duePeriods: (now: Date, policy: SchedulePolicy) => Array<{ period: Period; phase: 'prepare' | 'dispatch' }>;
  buildEvidence: (period: Period, symbols: string[]) => Promise<BriefEvidence>;
  narrativeRequest: typeof narrativeRequest;
  validateNarrative: typeof validateNarrative;
  factsOnlyNarrative: typeof factsOnlyNarrative;
  composeReport: typeof composeReport;
  validateContent: typeof validateContent;
  audioCacheKey: typeof audioCacheKey;
  llmChoices: () => LlmChoice[];
  llmMaxTokens: () => number;
  withReservation: typeof withReservation;
  llmJsonOnce: typeof llmJsonOnce;
  ensureAudio: typeof ensureAudio;
  ttsModel: () => string;
  memoryOn: () => boolean;
  settleSeconds: () => number;
  apnsConfig: () => ApnsConfig | null;
  sendApns: (cfg: ApnsConfig, n: ApnsNotification, now: Date) => Promise<ApnsOutcome>;
  closeApns: () => void;
  pushMasterKey: () => Buffer | null;
  decryptToken: (sealed: string, master: Buffer) => string;
  audioStore: () => AudioStore;
  /** Wall clock in epoch ms: elapsed time and the tick deadline (the period clock is opts.now). */
  now: () => number;
  logger: { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
}

const DEFAULT_DEPS: WorkerDeps = {
  enabled: () => briefingsEnabled(),
  db: dbModule,
  schedulePolicy: () => schedulePolicy(),
  duePeriods,
  buildEvidence: (period, symbols) => buildEvidence(period, symbols),
  narrativeRequest,
  validateNarrative,
  factsOnlyNarrative,
  composeReport,
  validateContent,
  audioCacheKey,
  llmChoices: () => llmChoices(),
  llmMaxTokens: () => llmMaxTokens(),
  withReservation,
  llmJsonOnce,
  ensureAudio,
  ttsModel: () => TTS_MODEL(),
  memoryOn: () => briefingsMemoryOn(),
  settleSeconds: () => settleSeconds(),
  apnsConfig: () => apnsConfig(),
  sendApns: (cfg, n, now) => sendApns(cfg, n, undefined, now),
  closeApns,
  pushMasterKey: () => pushMasterKey(),
  decryptToken,
  audioStore: () => supabaseAudioStore(),
  now: () => Date.now(),
  logger: console,
};

// ---- bounds (tick-local; config.ts holds the shared ones) ----
/** Cron cadence: a deferred shared narrative is picked up again by the next tick. */
export const TICK_INTERVAL_MS = 5 * 60_000;
/** Below this the model is skipped and the facts-only narrative is written (spec: readyBy − 60 s). */
export const READY_BY_MARGIN_MS = 60_000;
/** Do not start a database stage (claims hold leases) with less than this left. */
export const STAGE_MIN_REMAINING_MS = 3_000;
/** Personal claim rounds per period per tick (each ≤ PREPARE_BATCH). */
export const PERSONAL_MAX_ROUNDS = 20;
/** Distinct narration cache keys pre-synthesized per tick (each one reserved TTS attempt at most). */
export const AUDIO_PRESYNTH_PER_TICK = 6;
/** APNs requests in flight at once (repo rule: batch concurrent external calls by 5). */
export const APNS_CONCURRENCY = 5;
/** Leave the APNs per-request timeout plus a margin before starting a send batch. */
export const APNS_MIN_REMAINING_MS = 12_000;
/** Seconds before a released (unsent) delivery is due again. */
const RELEASE_RETRY_S = 5;
const OUTBOX_MAX_ROUNDS = 4;

/** Reservation refusals worth reporting as budget/config codes. */
const BUDGET_CODES = new Set<ReservationFailure>(['budget_unavailable', 'budget_exhausted', 'slots_full', 'work_unresolved', 'attempts_exhausted']);

type SharedState =
  | { state: 'ready'; id: string; narrative: SharedNarrative; evidence: BriefEvidence }
  | { state: 'failed' }
  | { state: 'pending' };

interface Tick {
  d: WorkerDeps;
  worker: string;
  report: TickReport;
  codes: Set<string>;
  /** The period clock: opts.now advanced by the wall-clock time spent in this tick. */
  nowAt: () => number;
  remaining: () => number;
}

interface PeriodCtx {
  period: Period;
  languages: BriefLanguage[];
  shared: Map<BriefLanguage, SharedState>;
  symbols: string[] | null;
  evidence: Promise<BriefEvidence | null> | null;
}

const emptyReport = (enabled: boolean): TickReport => ({
  enabled, claimed: 0, seeded: 0, published: 0, failed: 0, sharedReady: 0, audioReady: 0, dispatched: 0, accepted: 0, expired: 0,
  purged: 0, budget: null, stoppedEarly: false,
});

const errCode = (e: unknown): string => (e instanceof BriefingStorageError ? `storage:${e.status ?? 'network'}` : 'error');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export async function runTick(opts: { now: Date; worker: string; deadlineAt: number }, deps?: Partial<WorkerDeps>): Promise<TickReport> {
  const d: WorkerDeps = { ...DEFAULT_DEPS, ...deps };
  if (!d.enabled()) return emptyReport(false);
  const startedAt = d.now();
  const t: Tick = {
    d,
    worker: opts.worker,
    report: emptyReport(true),
    codes: new Set(),
    nowAt: () => opts.now.getTime() + (d.now() - startedAt),
    remaining: () => opts.deadlineAt - d.now(),
  };

  // 1. reconcile
  try {
    const r = await d.db.reconcile(d.settleSeconds());
    t.report.failed += num(r.deadline);
    t.report.expired += num(r.outboxExpired);
  } catch (e) {
    d.logger.error('[briefing-worker] reconcile', errCode(e));
  }

  // 2. due periods
  let due: Array<{ period: Period; phase: 'prepare' | 'dispatch' }> = [];
  try {
    due = d.duePeriods(opts.now, d.schedulePolicy());
  } catch (e) {
    d.logger.error('[briefing-worker] calendar', e instanceof RangeError ? 'range' : 'error');
  }
  for (const { period } of due) {
    if (period.cadence !== 'weekly') continue; // defense in depth against a legacy/injected scheduler
    if (t.remaining() < STAGE_MIN_REMAINING_MS) { t.report.stoppedEarly = true; break; }
    await preparePeriod(t, period);
  }

  // 3. dispatch
  if (t.remaining() >= STAGE_MIN_REMAINING_MS) await dispatchStage(t);
  else t.report.stoppedEarly = true;

  // 4. purge
  if (t.remaining() >= STAGE_MIN_REMAINING_MS) await purgeStage(t);
  else t.report.stoppedEarly = true;

  t.report.budget = t.codes.size ? [...t.codes].join(',') : null;
  return t.report;
}

// ============================================================ preparation

async function preparePeriod(t: Tick, period: Period): Promise<void> {
  const { d } = t;
  try {
    t.report.seeded += await d.db.seedPeriod(period);
  } catch (e) {
    d.logger.error('[briefing-worker] seed', period.cadence, errCode(e));
    return;
  }
  let languages: BriefLanguage[];
  try {
    languages = await d.db.openLanguages(period.cadence, period.periodKey);
  } catch (e) {
    d.logger.error('[briefing-worker] languages', period.cadence, errCode(e));
    return;
  }
  if (!languages.length) return; // nobody to write for: no evidence fetch, no paid call

  const p: PeriodCtx = { period, languages, shared: new Map(), symbols: null, evidence: null };
  for (const lang of languages) await ensureShared(t, p, lang);

  // Publish only once every open language is settled (ready, or failed for good): a claimed report whose
  // narrative is still being written would otherwise burn one of its attempts.
  const settled = languages.every((l) => { const s = p.shared.get(l)?.state; return s === 'ready' || s === 'failed'; });
  if (!settled) return;
  const published = await personalStage(t, p);
  if (period.cadence === 'weekly' && published.length) await audioStage(t, published);
}

/** A fixed public universe: no account's followed or asked assets influence a provider request. */
async function periodSymbols(t: Tick, p: PeriodCtx): Promise<string[]> {
  if (p.symbols) return p.symbols;
  p.symbols = Object.keys(SUPPORTED_ASSETS);
  return p.symbols;
}

/** One evidence capture per period per tick, shared by its languages (same numbers for every reader). */
function periodEvidence(t: Tick, p: PeriodCtx): Promise<BriefEvidence | null> {
  if (!p.evidence) {
    p.evidence = periodSymbols(t, p)
      .then((symbols) => t.d.buildEvidence(p.period, symbols))
      .catch(() => { t.d.logger.error('[briefing-worker] evidence', 'failed'); return null; });
  }
  return p.evidence;
}

const usableEvidence = (e: BriefEvidence | null): e is BriefEvidence =>
  !!e && Array.isArray(e.quotes) && e.quotes.some((q) => q && q.price !== null && q.freshness !== 'missing');

/**
 * Makes the shared narrative of (period, language) ready, or reports why it is not. Memoized per tick.
 *   · the model is tried only with time to spare: not within READY_BY_MARGIN_MS of ready-by and with
 *     PROVIDER_MIN_REMAINING_MS left in the tick; each choice is one reserved attempt (work ref per model);
 *   · budget refusal / every provider failing / ready-by near ⇒ facts-only narrative, committed ready;
 *   · an unknown outcome or a transient refusal with a later tick still before ready-by ⇒ deferred ('retry'),
 *     unless that would exhaust the row's attempts (then facts-only now);
 *   · evidence without a single real quote ⇒ 'retry' (failed at the attempt cap): never a report without data.
 */
async function ensureShared(t: Tick, p: PeriodCtx, lang: BriefLanguage): Promise<SharedState> {
  const memo = p.shared.get(lang);
  if (memo) return memo;
  const { d } = t;
  const set = (s: SharedState) => { p.shared.set(lang, s); return s; };
  const readyBy = Date.parse(p.period.readyBy);
  const nearDeadline = t.nowAt() >= readyBy - READY_BY_MARGIN_MS;
  const canDefer = t.nowAt() + TICK_INTERVAL_MS < readyBy - READY_BY_MARGIN_MS;

  if (t.remaining() < STAGE_MIN_REMAINING_MS || (t.remaining() < PROVIDER_MIN_REMAINING_MS && canDefer)) {
    // Too little time for a model attempt while a later tick can still make it: do not take the lease.
    t.report.stoppedEarly = true;
    return set({ state: 'pending' });
  }

  let claim: dbModule.SharedClaim;
  try {
    claim = await d.db.claimShared(p.period.cadence, p.period.periodKey, lang, t.worker, LEASE_SECONDS, SHARED_MAX_ATTEMPTS);
  } catch (e) {
    d.logger.error('[briefing-worker] shared_claim', errCode(e));
    return set({ state: 'pending' });
  }
  if (claim.state === 'ready') {
    return set({ state: 'ready', id: claim.id, narrative: claim.narrative as SharedNarrative, evidence: claim.evidence as BriefEvidence });
  }
  if (claim.state === 'failed') return set({ state: 'failed' });
  if (claim.state !== 'claimed') return set({ state: 'pending' }); // busy: another worker is writing it

  const { id, fence } = claim;
  const attempts = Number(claim.attempts) || 0;
  const commit = async (state: 'ready' | 'retry' | 'failed', evidence: BriefEvidence | null, narrative: SharedNarrative | null, error: string | null) => {
    try {
      const r = await d.db.commitShared(id, fence, state, evidence, narrative, evidence?.dataAsOf ?? null, error);
      return Boolean(r?.ok);
    } catch (e) {
      d.logger.error('[briefing-worker] shared_commit', errCode(e));
      return false;
    }
  };

  const evidence = await periodEvidence(t, p);
  if (!usableEvidence(evidence)) {
    const final = attempts + 1 >= SHARED_MAX_ATTEMPTS;
    d.logger.error('[briefing-worker] shared', p.period.cadence, lang, 'no_evidence', final ? 'failed' : 'retry');
    await commit(final ? 'failed' : 'retry', null, null, 'no_evidence');
    return set(final ? { state: 'failed' } : { state: 'pending' });
  }
  const symbols = await periodSymbols(t, p);

  let narrative: SharedNarrative | null = null;
  let unknownSeen = false;
  let transient = false;
  if (!nearDeadline) {
    const maxTokens = d.llmMaxTokens();
    for (const choice of d.llmChoices()) {
      if (t.remaining() < PROVIDER_MIN_REMAINING_MS) { t.report.stoppedEarly = true; transient = true; break; }
      const req = d.narrativeRequest(evidence, lang, symbols);
      // Never past the function's hard limit: the tick deadline plus the slack up to maxDuration, minus a margin.
      const timeoutMs = Math.max(1_000, Math.min(LLM_TIMEOUT_MS, t.remaining() + (WORKER_MAX_DURATION_S * 1000 - WORKER_BUDGET_MS) - 5_000));
      const r = await d.withReservation(
        {
          kind: 'llm', workRef: `shared:${id}:${choice.model}`, provider: choice.provider, model: choice.model,
          reserveUsd: llmReserveUsd(choice, req.system.length + req.user.length, maxTokens), worker: t.worker,
        },
        () => d.llmJsonOnce(choice, req, { maxTokens, timeoutMs }),
      );
      if (r.ok) {
        narrative = d.validateNarrative((r as { ok: true; value: unknown }).value, evidence, lang, symbols, choice.model);
        if (narrative) break;
        d.logger.error('[briefing-worker] shared', choice.provider, 'invalid_narrative');
        continue;
      }
      const code = (r as { ok: false; code: ReservationFailure }).code;
      if (BUDGET_CODES.has(code)) t.codes.add(code);
      if (code === 'provider_unknown') { unknownSeen = true; break; } // the attempt may still be billed: stop here
      if (code === 'budget_unavailable' || code === 'budget_exhausted') break; // no other model will pass the cap
      if (code === 'slots_full' || code === 'storage_unavailable') { transient = true; break; } // global, not per model
      if (code === 'work_unresolved') { transient = true; continue; } // only this model's previous attempt is open
      // provider_failed / attempts_exhausted: the next model may still answer.
    }
  }

  if (!narrative && (unknownSeen || transient) && canDefer && attempts + 2 <= SHARED_MAX_ATTEMPTS) {
    await commit('retry', evidence, null, unknownSeen ? 'provider_unknown' : 'deferred');
    return set({ state: 'pending' });
  }
  if (!narrative) narrative = d.factsOnlyNarrative(evidence, lang, symbols);
  if (!(await commit('ready', evidence, narrative, null))) return set({ state: 'pending' });
  t.report.sharedReady++;
  return set({ state: 'ready', id, narrative, evidence });
}

interface Published { identityId: string; briefId: string; segments: string[]; voice: string; language: BriefLanguage }

/** Claim → compose → validate → publish, in bounded rounds. Returns the reports published by this tick. */
async function personalStage(t: Tick, p: PeriodCtx): Promise<Published[]> {
  const { d } = t;
  const published: Published[] = [];
  const memoryOn = d.memoryOn();
  const fail = async (id: string, fence: number, code: string, final: boolean) => {
    t.report.failed += final ? 1 : 0;
    d.logger.error('[briefing-worker] brief', code, final ? 'final' : 'retry');
    try { await d.db.failBrief(id, fence, code, final); } catch (e) { d.logger.error('[briefing-worker] fail', errCode(e)); }
  };

  for (let round = 0; round < PERSONAL_MAX_ROUNDS; round++) {
    if (t.remaining() < STAGE_MIN_REMAINING_MS) { t.report.stoppedEarly = true; break; }
    let items: dbModule.ClaimedBrief[];
    try {
      items = await d.db.claimBriefs(p.period.cadence, p.period.periodKey, t.worker, LEASE_SECONDS, PREPARE_BATCH);
    } catch (e) {
      d.logger.error('[briefing-worker] claim', errCode(e));
      break;
    }
    if (!items.length) break;
    t.report.claimed += items.length;
    let retryLater = false;

    for (const item of items) {
      const lang: BriefLanguage = item.frozen?.language === 'es' ? 'es' : 'en';
      // The language may have changed since the open-language scan: settle it now (memoized otherwise).
      const shared = await ensureShared(t, p, lang);
      if (shared.state === 'failed') { await fail(item.id, item.fence, 'shared_failed', true); continue; }
      if (shared.state !== 'ready') { await fail(item.id, item.fence, 'shared_pending', false); retryLater = true; continue; }

      let composed: ReturnType<typeof composeReport>;
      try {
        composed = d.composeReport({
          period: p.period, frozen: item.frozen, memory: item.memory,
          memoryAllowed: memoryOn && item.memory !== null && item.frozen.analysisConsent === true,
          narrative: shared.narrative, evidence: shared.evidence,
        });
      } catch {
        await fail(item.id, item.fence, 'compose_error', true); // deterministic: the same input fails again
        continue;
      }
      const invalid = d.validateContent(composed.content);
      if (invalid) { await fail(item.id, item.fence, `invalid_${invalid}`, true); continue; }

      let r: dbModule.PublishResult;
      try {
        r = await d.db.publishBrief({
          id: item.id, fence: item.fence, sharedId: shared.id, content: composed.content, quality: composed.quality,
          dataAsOf: composed.content.dataAsOf, usesMemory: composed.usesMemory, memoryAssets: composed.memoryAssets,
          settingsRevision: item.frozen.settingsRevision, privacyEpoch: item.frozen.privacyEpoch,
        });
      } catch (e) {
        // The lease expires and reconcile re-queues the report (one attempt counted).
        d.logger.error('[briefing-worker] publish', errCode(e));
        continue;
      }
      if (r.ok) {
        t.report.published++;
        if (item.frozen.audioConsent) {
          published.push({ identityId: item.identityId, briefId: item.id, segments: composed.content.narrationSegments, voice: item.frozen.voice, language: lang });
        }
        continue;
      }
      // stale_fence: another worker or a privacy change re-fenced it (dropped, it is someone else's now);
      // privacy_changed: SQL re-queued it, a later round recomposes under the new settings;
      // not_pro / opted_out: SQL already marked it skipped / cancelled. None of these is a failure.
      const code = (r as { ok: false; code: string }).code;
      if (code !== 'stale_fence') d.logger.log('[briefing-worker] publish', code);
    }
    // A report that had to wait would be claimed again by the next round and burn its attempts in one tick.
    if (retryLater) break;
  }
  return published;
}

/**
 * Weekly narration pre-synthesis: the first segment of every fresh report first, then the next ones; one
 * ensureAudio per distinct cache key (readers with the same companion share it). Stops at the per-tick bound,
 * when the tick runs short, or at the first refusal (caps, slots) — the authenticated `voice` op covers the rest.
 */
async function audioStage(t: Tick, published: Published[]): Promise<void> {
  const { d } = t;
  const model = d.ttsModel();
  const jobs: Array<Published & { segment: number; text: string; cacheKey: string }> = [];
  const maxSeg = Math.max(0, ...published.map((x) => x.segments.length));
  for (let s = 0; s < maxSeg; s++) {
    for (const x of published) {
      const text = x.segments[s];
      if (text) jobs.push({ ...x, segment: s, text, cacheKey: d.audioCacheKey(text, x.voice, x.language, BRIEF_VIBE, model) });
    }
  }
  const done = new Set<string>();
  let synthesized = 0;
  for (const job of jobs) {
    if (done.has(job.cacheKey)) continue;
    if (synthesized >= AUDIO_PRESYNTH_PER_TICK) break;
    if (t.remaining() < PROVIDER_MIN_REMAINING_MS) { t.report.stoppedEarly = true; break; }
    done.add(job.cacheKey);
    try {
      const req = await d.db.requestAudio(job.identityId, job.briefId, 1, job.segment, job.cacheKey, job.voice, job.language);
      if ('code' in req) continue;
      if (req.state === 'ready') { t.report.audioReady++; continue; }
      if (req.state === 'failed') continue;
      synthesized++;
      const r = await d.ensureAudio({ audioId: req.audioId, cacheKey: job.cacheKey, text: job.text, voice: job.voice, language: job.language, worker: t.worker });
      if (r.state === 'ready') t.report.audioReady++;
      else if (r.state === 'queued') { t.codes.add('tts_deferred'); break; }
    } catch (e) {
      d.logger.error('[briefing-worker] audio', errCode(e));
      break;
    }
  }
}

// ============================================================ dispatch

/**
 * Fill → claim → APNs → result. Without APNs credentials or the push master key nothing is claimed (rows stay
 * pending until they expire). A claimed row is either answered or released ('config': no attempt burned): when the
 * tick runs short, when APNs reports a configuration problem (the rest of the tick is paused), or when the stored
 * token cannot be decrypted (key rotation; never invalidates the device on our side). A row already past its push
 * expiry is skipped and left for claim/reconcile to mark expired.
 */
async function dispatchStage(t: Tick): Promise<void> {
  const { d } = t;
  try {
    await d.db.fillOutbox(DELIVERY_BATCH * OUTBOX_MAX_ROUNDS);
  } catch (e) {
    d.logger.error('[briefing-worker] outbox_fill', errCode(e));
  }
  const cfg = d.apnsConfig();
  if (!cfg) { t.codes.add('apns_unconfigured'); return; }
  const master = d.pushMasterKey();
  if (!master) { t.codes.add('push_key_unavailable'); return; }

  const release = async (item: dbModule.OutboxItem, reason: string) => {
    try { await d.db.outboxResult(item.id, item.fence, 'config', null, reason, RELEASE_RETRY_S); } catch (e) { d.logger.error('[briefing-worker] release', errCode(e)); }
  };
  let paused = false;
  try {
    for (let round = 0; round < OUTBOX_MAX_ROUNDS && !paused; round++) {
      if (t.remaining() < APNS_MIN_REMAINING_MS) { t.report.stoppedEarly = true; break; }
      let items: dbModule.OutboxItem[];
      try {
        items = await d.db.claimOutbox(t.worker, LEASE_SECONDS, DELIVERY_BATCH);
      } catch (e) {
        d.logger.error('[briefing-worker] outbox_claim', errCode(e));
        break;
      }
      if (!items.length) break;
      for (let i = 0; i < items.length; i += APNS_CONCURRENCY) {
        const batch = items.slice(i, i + APNS_CONCURRENCY);
        if (paused || t.remaining() < APNS_MIN_REMAINING_MS) {
          if (!paused) t.report.stoppedEarly = true;
          for (const item of batch) await release(item, 'released');
          continue;
        }
        const outcomes = await Promise.all(batch.map((item) => deliver(t, cfg, master, item)));
        if (outcomes.some((o) => o === 'config')) { paused = true; t.codes.add('apns_config'); }
      }
      if (items.length < DELIVERY_BATCH) break;
    }
  } finally {
    try { d.closeApns(); } catch { /* sessions are per lambda; nothing to keep */ }
  }
}

async function deliver(t: Tick, cfg: ApnsConfig, master: Buffer, item: dbModule.OutboxItem): Promise<ApnsOutcome['outcome'] | 'skipped'> {
  const { d } = t;
  const expiresAt = new Date(item.expiresAt);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= d.now()) {
    t.report.expired++;
    return 'skipped'; // the lease runs out and the next claim (or reconcile) marks it expired
  }
  let token: string;
  try {
    token = d.decryptToken(item.tokenCiphertext, master);
  } catch {
    d.logger.error('[briefing-worker] token', 'unreadable');
    try { await d.db.outboxResult(item.id, item.fence, 'config', null, 'token_unreadable', null); } catch (e) { d.logger.error('[briefing-worker] result', errCode(e)); }
    return 'skipped';
  }
  let out: ApnsOutcome;
  try {
    out = await d.sendApns(cfg, {
      token, environment: item.environment, topic: item.topic, apnsId: item.apnsId, collapseId: item.collapseId,
      expiresAt, language: item.language === 'es' ? 'es' : 'en', briefId: item.briefId,
    }, new Date(d.now()));
  } catch {
    // sendApns classifies instead of throwing; if it ever throws the request may have been written.
    out = { outcome: 'ambiguous', status: null, reason: 'send_threw' };
  }
  if (out.outcome === 'retry' && out.status === null && out.reason === 'expired') {
    // Expired between the check above and the send: nothing went out.
    t.report.expired++;
    return 'skipped';
  }
  t.report.dispatched++;
  if (out.outcome === 'accepted') t.report.accepted++;
  try {
    await d.db.outboxResult(item.id, item.fence, out.outcome, out.status, out.reason, out.retryAfterSeconds ?? null);
  } catch (e) {
    // Unrecorded: the lease expires and the next claim treats it as an ambiguous attempt (same apns-id).
    d.logger.error('[briefing-worker] result', errCode(e));
  }
  return out.outcome;
}

// ============================================================ purge

/**
 * bobby_brief_purge deletes the expired audio rows and returns their Storage paths; the objects are removed
 * afterwards. Trade-off: if that removal fails the paths are not kept (no row points at them any more), so the
 * objects are orphaned until a bucket sweep — preferred over keeping playable rows whose object is already gone.
 * Paths are content-addressed: a key requested again later is simply synthesized again.
 */
async function purgeStage(t: Tick): Promise<void> {
  const { d } = t;
  let paths: string[];
  try {
    paths = (await d.db.purge(RETENTION)).storagePaths;
  } catch (e) {
    d.logger.error('[briefing-worker] purge', errCode(e));
    return;
  }
  if (!paths.length) return;
  try {
    await d.audioStore().remove(paths);
    t.report.purged += paths.length;
  } catch (e) {
    d.logger.error('[briefing-worker] purge_storage', errCode(e), paths.length);
  }
}
