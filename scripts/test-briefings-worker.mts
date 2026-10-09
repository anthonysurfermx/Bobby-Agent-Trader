// Bobby Pro briefings worker (api/briefing-worker.ts + api/_lib/briefings/worker.ts) without a provider network:
//   (a) unit, fake database/providers/APNs/store:
//       · kill switch → zero database calls (handler and tick);
//       · cron auth accepts CRON_SECRET only (INTERNAL_API_SECRET / BOBBY_CYCLE_SECRET / x-internal-secret refused),
//         503 without the secret, 400 on any query parameter; ops POST with `at` only outside production;
//       · budget missing → facts-only narrative, still published; an unknown provider outcome → no second paid
//         attempt in the tick (deferred while ready-by is far, facts-only when it is not); ready-by fallback;
//         evidence without quotes → never a report; stale fence dropped; privacy_changed recomposed;
//       · dispatch: APNs config / push key missing → nothing claimed; outcomes mapped (invalid_token, config pauses
//         and releases); expired rows skipped; undecryptable token released; audio pre-synthesis bounded; purge
//         removes Storage objects; the tick deadline stops before provider attempts; logs carry no identity/token.
//   (b) end to end against the real SQL (local PostgreSQL 17 scratch database, scripts/briefings-pg-harness.mts):
//       3 Pro + 1 non-Pro + 1 opted-out → exactly 3 reports; duplicate cron creates nothing; one APNs per active
//       device; replayed dispatch sends nothing; A→B device rebind; Pro expiry before dispatch; memory pause before
//       publish → recomposed without memory; missed cron after expiry → nothing sent, rows expired / failed;
//       unknown provider attempt → reconcile (settle window) → settled_assumed → one more attempt allowed.
// Local scratch Postgres only:
//   psql postgres://postgres@127.0.0.1:55491/postgres -c 'create database briefings_worker'
//   DATABASE_URL=postgres://postgres@127.0.0.1:55491/briefings_worker npx tsx scripts/test-briefings-worker.mts
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
process.env.BOBBY_BRIEFINGS_ENABLED = 'on';
delete process.env.BOBBY_BRIEFINGS_DAILY_CAP_USD;
delete process.env.BOBBY_BRIEFINGS_MONTHLY_CAP_USD;
delete process.env.BOBBY_BRIEFINGS_LLM;
delete process.env.BOBBY_BRIEFINGS_MEMORY;
delete process.env.BOBBY_LEARNING_OPPORTUNITIES_ENABLED;
delete process.env.VERCEL_ENV;
process.env.OPENAI_API_KEY = 'test-openai';
process.env.ANTHROPIC_API_KEY = 'test-anthropic';

// No provider, APNs, Storage or PostgREST network in this file: any fetch is a test failure.
let fetchCalls = 0;
globalThis.fetch = (async () => { fetchCalls++; throw new Error('network disabled in tests'); }) as typeof fetch;

const dbMod = await import('../api/_lib/briefings/db.ts');
const cal = await import('../api/_lib/briefings/calendar.ts');
const { buildEvidence } = await import('../api/_lib/briefings/evidence.ts');
const { validateNarrative } = await import('../api/_lib/briefings/narrative.ts');
const { validateContent } = await import('../api/_lib/briefings/compose.ts');
const { withReservation } = await import('../api/_lib/briefings/budget.ts');
const { ensureAudio } = await import('../api/_lib/briefings/voice.ts');
const { encryptToken, tokenFingerprint } = await import('../api/_lib/briefings/push-crypto.ts');
const { detectRegime } = await import('../api/_lib/market-snapshot.ts');
const workerMod = await import('../api/_lib/briefings/worker.ts');
const { runTick, PERSONAL_MAX_ROUNDS } = workerMod;
const handlerMod = await import('../api/briefing-worker.ts');
type WorkerDeps = import('../api/_lib/briefings/worker.ts').WorkerDeps;
type TickReport = import('../api/_lib/briefings/worker.ts').TickReport;
type Period = import('../api/_lib/briefings/types.ts').Period;
type FrozenSettings = import('../api/_lib/briefings/types.ts').FrozenSettings;
type BriefEvidence = import('../api/_lib/briefings/types.ts').BriefEvidence;
type GlobalMarketSnapshot = import('../api/_lib/market-snapshot.ts').GlobalMarketSnapshot;
type ApnsNotification = import('../api/_lib/briefings/apns.ts').ApnsNotification;
type ApnsOutcome = import('../api/_lib/briefings/apns.ts').ApnsOutcome;
type ApnsConfig = import('../api/_lib/briefings/config.ts').ApnsConfig;
type OutboxItem = import('../api/_lib/briefings/db.ts').OutboxItem;
type ClaimedBrief = import('../api/_lib/briefings/db.ts').ClaimedBrief;

let checks = 0;
const eq = (got: unknown, want: unknown, what: string) => { assert.deepEqual(got, want, what); checks++; };
const ok = (v: unknown, what: string) => { assert.ok(v, what); checks++; };

const policy = { adopted: new Set(['weekly'] as const), morningDays: 'all' as const } as unknown as import('../api/_lib/briefings/calendar.ts').SchedulePolicy;
const MIN = 60_000;
const MASTER = randomBytes(32);
const APNS: ApnsConfig = { keyId: 'ABCDEFGHIJ', teamId: 'KLMNOPQRST', privateKey: '-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----', topic: 'xyz.bobbyprotocol.bobby', environments: new Set(['production']) };
const noUsage = async () => {};

/** A market snapshot fixture captured at `at` (crypto from OKX, equities with their own as-of). */
function snapshot(at: Date): GlobalMarketSnapshot {
  const fetchedAt = new Date(at.getTime() - MIN).toISOString();
  return {
    prices: [
      { symbol: 'BTC', price: 67450.12, change24h: 1.23, asOf: fetchedAt },
      { symbol: 'ETH', price: 2450.5, change24h: -0.84, asOf: fetchedAt },
      { symbol: 'SOL', price: 151.3, change24h: 2.1, asOf: fetchedAt },
    ],
    stocks: [
      { symbol: 'SPY', price: 571.32, change24h: 0.45, asOf: fetchedAt, prevClose: 568.76 },
      { symbol: 'NVDA', price: 181.2, change24h: -1.1, asOf: fetchedAt, prevClose: 183.22 },
    ],
    funding: [{ symbol: 'BTC', rate: 0.0001, annualized: 11, nextFundingTime: '0' }],
    fearGreed: { value: 54, classification: 'Neutral', asOf: fetchedAt },
    dxy: { dxy: 98.12, asOf: fetchedAt.slice(0, 10) },
    regime: detectRegime(1.23),
    fetchedAt,
    sources: [{ name: 'okx_spot', ok: true }, { name: 'yahoo_equities', ok: true }, { name: 'okx_funding', ok: true }, { name: 'fear_greed', ok: true }, { name: 'dxy_ecb', ok: true }],
  };
}
const emptySnapshot = (at: Date): GlobalMarketSnapshot => ({ prices: [], stocks: [], funding: [], fearGreed: null, dxy: null, regime: null, fetchedAt: at.toISOString(), sources: [] });

/** Real evidence code over a fixture snapshot (agenda: an empty stored calendar; no weekly history needed). */
const evidenceWith = (snap: (at: Date) => GlobalMarketSnapshot, at: () => Date) => (period: Period, symbols: string[]) =>
  buildEvidence(period, symbols, { now: at, snapshot: async () => snap(at()), agenda: async () => [], dailyCloses: async () => [...snap(at()).prices, ...snap(at()).stocks].map(q => ({ symbol: q.symbol, from: { at: period.periodStart, price: q.price }, to: { at: new Date(Math.min(at().getTime(), Date.parse(period.periodEnd)) - 60_000).toISOString(), price: q.price } })) });

/** A number-free model narrative (passes the grounding validator). */
const MODEL_NARRATIVE = {
  opening: 'Markets are calm going into the New York morning.',
  market: { title: 'Market', body: 'Crypto traded quietly overnight while equities wait for the session.' },
  assets: [{ symbol: 'BTC', title: 'Bitcoin', body: 'Bitcoin moved little overnight and funding stayed close to neutral.', explainer: '' }],
  risks: { title: 'Risks', body: 'Positioning looks balanced; a sharp move in the dollar would change the picture.' },
  agenda: { title: 'Agenda', body: 'Watch the recorded events during the upcoming week.' },
  week: { title: 'Previous week', body: 'Historical closing prices provide the context for the week ahead.' },
};

// ---------- fakes ----------
type Call = [string, unknown[]];
function fakeDb(over: Record<string, (...a: any[]) => any> = {}) {
  const calls: Call[] = [];
  const base: Record<string, (...a: any[]) => any> = {
    reconcile: async () => ({}),
    seedPeriod: async () => 1,
    openLanguages: async () => ['en'],
    neededAssets: async () => ['BTC', 'NVDA'],
    claimShared: async () => ({ state: 'claimed', id: SHARED_ID, fence: 1, attempts: 0 }),
    commitShared: async () => ({ ok: true }),
    claimBriefs: queue<ClaimedBrief[]>([[claimed()]], []),
    publishBrief: async () => ({ ok: true }),
    failBrief: async () => {},
    requestAudio: async () => ({ audioId: randomUUID(), state: 'queued' }),
    fillOutbox: async () => 0,
    claimOutbox: async () => [],
    outboxResult: async () => {},
    deliveryReport: async () => null,
    deliveredOpportunity: async () => false,
    reserveDeliveryOpportunity: async () => true,
    purge: async () => ({ storagePaths: [] }),
  };
  const db: Record<string, (...a: any[]) => any> = {};
  for (const [name, fn] of Object.entries({ ...base, ...over })) db[name] = async (...args: unknown[]) => { calls.push([name, args]); return fn(...args); };
  const named = (n: string) => calls.filter((c) => c[0] === n).map((c) => c[1]);
  return { db: db as unknown as WorkerDeps['db'], calls, named };
}
/** Successive answers, then `rest` forever. */
function queue<T>(answers: T[], rest: T) {
  const q = [...answers];
  return async () => (q.length ? q.shift()! : rest);
}

const SHARED_ID = randomUUID();
const IDENTITY = randomUUID();
const TOKEN_HEX = 'ab'.repeat(32);
const FROZEN: FrozenSettings = {
  settingsRevision: 1, privacyEpoch: 0, language: 'en', companionId: 'orb', voice: 'ash', assets: ['BTC', 'NVDA'],
  analysisConsent: false, analysisConsentVersion: null, audioConsent: true,
};
function claimed(over: Partial<ClaimedBrief> = {}): ClaimedBrief {
  return { id: randomUUID(), identityId: IDENTITY, fence: 1, frozen: { ...FROZEN }, memory: null, ...over };
}
function outboxItem(over: Partial<OutboxItem> = {}): OutboxItem {
  return {
    id: randomUUID(), fence: 1, briefId: randomUUID(), deviceId: randomUUID(), bindingRevision: 1, tokenCiphertext: encryptToken(TOKEN_HEX, MASTER),
    environment: 'production', topic: APNS.topic, apnsId: randomUUID(), collapseId: 'brief-x', language: 'en',
    expiresAt: new Date(Date.now() + 20 * MIN).toISOString(), attempts: 0, ...over,
  };
}

function budgetFake() {
  const calls: string[] = [];
  const db = {
    reserveAttempt: async () => { calls.push('reserve'); return { ok: true, attemptId: randomUUID() }; },
    dispatchAttempt: async () => { calls.push('dispatch'); },
    settleAttempt: async (_id: string, outcome: string) => { calls.push(`settle:${outcome}`); },
  };
  return { db: db as unknown as typeof import('../api/_lib/briefings/db.ts'), calls };
}

const logLines: string[] = [];
const logger = {
  log: (...a: unknown[]) => { logLines.push(a.map(String).join(' ')); },
  error: (...a: unknown[]) => { logLines.push(a.map(String).join(' ')); },
};

// The calendar period of a Monday morning; the tick runs at 07:35 NY unless a test moves it.
const P: Period = cal.periodForDate('weekly', '2026-10-05', policy)!;
const AT_0735 = cal.nyLocalToUtc('2026-10-05', '07:35');

interface Harness {
  db: ReturnType<typeof fakeDb>;
  llm: Array<{ model: string }>;
  apns: ApnsNotification[];
  audio: string[];
  budget: ReturnType<typeof budgetFake>;
  removed: string[][];
  run: (o?: { now?: Date; deadlineMs?: number }) => Promise<TickReport>;
}
function harness(o: {
  db?: Record<string, (...a: any[]) => any>;
  llm?: (n: number) => Awaited<ReturnType<WorkerDeps['llmJsonOnce']>>;
  apns?: (n: ApnsNotification) => ApnsOutcome;
  audio?: (cacheKey: string) => { state: 'ready' | 'queued' | 'processing' | 'failed' };
  deps?: Partial<WorkerDeps>;
  snap?: (at: Date) => GlobalMarketSnapshot;
  now?: Date;
} = {}): Harness {
  const db = fakeDb(o.db);
  const llm: Harness['llm'] = [];
  const apns: ApnsNotification[] = [];
  const audio: string[] = [];
  const removed: string[][] = [];
  const budget = budgetFake();
  let tickNow = o.now ?? AT_0735;
  const deps: Partial<WorkerDeps> = {
    enabled: () => true,
    db: db.db,
    schedulePolicy: () => policy,
    duePeriods: () => [{ period: P, phase: 'prepare' }],
    buildEvidence: evidenceWith(o.snap ?? snapshot, () => tickNow),
    llmChoices: () => [{ provider: 'anthropic', model: 'claude-sonnet-5-5' }, { provider: 'openai', model: 'gpt-4o-mini' }],
    withReservation: (p, call) => withReservation(p, call, { db: budget.db, logUsage: noUsage }),
    llmJsonOnce: async (choice) => {
      llm.push({ model: choice.model });
      return o.llm ? o.llm(llm.length) : { ok: false, outcome: 'no_charge', code: 'http_500', status: 500, latencyMs: 1 };
    },
    ensureAudio: async (p) => { audio.push(p.cacheKey); return o.audio ? o.audio(p.cacheKey) : { state: 'ready' }; },
    apnsConfig: () => APNS,
    sendApns: async (_cfg, n) => { apns.push(n); return o.apns ? o.apns(n) : { outcome: 'accepted', status: 200, reason: null }; },
    closeApns: () => {},
    pushMasterKey: () => MASTER,
    opportunitiesEnabled: () => false,
    audioStore: () => ({ put: async () => {}, get: async () => null, remove: async (paths) => { removed.push(paths); } }),
    logger,
    ...o.deps,
  };
  return {
    db, llm, apns, audio, budget, removed,
    run: (r = {}) => {
      tickNow = r.now ?? o.now ?? AT_0735;
      return runTick({ now: tickNow, worker: 'worker-test', deadlineAt: Date.now() + (r.deadlineMs ?? 45_000) }, deps);
    },
  };
}
const setCaps = (on: boolean) => {
  if (on) { process.env.BOBBY_BRIEFINGS_DAILY_CAP_USD = '5'; process.env.BOBBY_BRIEFINGS_MONTHLY_CAP_USD = '50'; }
  else { delete process.env.BOBBY_BRIEFINGS_DAILY_CAP_USD; delete process.env.BOBBY_BRIEFINGS_MONTHLY_CAP_USD; }
};
const commitStates = (h: Harness) => h.db.named('commitShared').map((a) => a[2]);
const committedNarrative = (h: Harness) => h.db.named('commitShared').find((a) => a[2] === 'ready')?.[4] as { source: string } | undefined;

// ================================================================ (a) unit

// ---- fixture sanity: the model narrative is valid for the fixture evidence ----
{
  const e = await evidenceWith(snapshot, () => AT_0735)(P, ['BTC', 'ETH', 'SPY', 'NVDA']);
  ok(validateNarrative(MODEL_NARRATIVE, e, 'en', ['BTC', 'ETH', 'SPY', 'NVDA'], 'gpt-4o-mini') !== null, 'fixture: model narrative validates against the evidence');
}

// ---- kill switch ----
{
  const h = harness({ deps: { enabled: () => false } });
  const r = await h.run();
  eq(r, { enabled: false, claimed: 0, seeded: 0, published: 0, failed: 0, sharedReady: 0, audioReady: 0, dispatched: 0, accepted: 0, expired: 0, purged: 0, budget: null, stoppedEarly: false }, 'tick disabled → empty report');
  eq(h.db.calls.length, 0, 'tick disabled → zero database calls');
}

// ---- HTTP handler: auth and kill switch ----
function mockRes() {
  const res = {
    statusCode: 0, headers: {} as Record<string, string>, body: undefined as unknown,
    setHeader(k: string, v: string) { res.headers[k.toLowerCase()] = v; return res; },
    status(c: number) { res.statusCode = c; return res; },
    json(b: unknown) { res.body = b; return res; },
  };
  return res;
}
const mkReq = (method: string, headers: Record<string, string> = {}, query: Record<string, string> = {}, body?: unknown) =>
  ({ method, headers, query, body }) as unknown as import('@vercel/node').VercelRequest;
async function call(h: (req: any, res: any) => Promise<unknown>, req: import('@vercel/node').VercelRequest) {
  const res = mockRes();
  await h(req, res);
  return res;
}
{
  process.env.CRON_SECRET = 'cron-secret-value';
  process.env.INTERNAL_API_SECRET = 'internal-secret-value';
  process.env.BOBBY_CYCLE_SECRET = 'cycle-secret-value';
  process.env.BOBBY_OPS_SECRET = 'ops-secret-value';
  const runs: Array<{ now: Date; worker: string; deadlineAt: number }> = [];
  const fakeReport = { enabled: true, claimed: 0, seeded: 0, published: 0, failed: 0, sharedReady: 0, audioReady: 0, dispatched: 0, accepted: 0, expired: 0, purged: 0, budget: null, stoppedEarly: false };
  const handler = handlerMod.createWorkerHandler(async (o) => { runs.push(o); return fakeReport; });
  const bearer = (s: string) => ({ authorization: `Bearer ${s}` });

  let r = await call(handler, mkReq('GET', bearer('cron-secret-value')));
  eq([r.statusCode, r.body, r.headers['cache-control']], [200, fakeReport, 'no-store'], 'cron with CRON_SECRET → tick report, no-store');
  ok(runs.length === 1 && Math.abs(runs[0].deadlineAt - Date.now() - 45_000) < 2_000 && runs[0].worker.length <= 64, 'cron tick: 45 s budget, bounded worker id');
  for (const [what, headers] of [
    ['INTERNAL_API_SECRET', bearer('internal-secret-value')], ['BOBBY_CYCLE_SECRET', bearer('cycle-secret-value')], ['BOBBY_OPS_SECRET', bearer('ops-secret-value')],
    ['x-internal-secret with CRON_SECRET', { 'x-internal-secret': 'cron-secret-value' }], ['no header', {}], ['wrong secret', bearer('cron-secret-valuX')],
    ['lower-case scheme', { authorization: 'bearer cron-secret-value' }], ['secret + suffix', bearer('cron-secret-value ')],
  ] as Array<[string, Record<string, string>]>) {
    r = await call(handler, mkReq('GET', headers));
    eq(r.statusCode, 401, `cron refuses ${what}`);
  }
  r = await call(handler, mkReq('GET', bearer('cron-secret-value'), { at: '2026-10-05T11:30:00Z' }));
  eq([r.statusCode, (r.body as { code: string }).code], [400, 'invalid_request'], 'cron with a query parameter → 400');
  r = await call(handler, mkReq('GET', {}, { x: '1' }));
  eq(r.statusCode, 401, 'unauthenticated query is refused before its shape is discussed');
  delete process.env.CRON_SECRET;
  r = await call(handler, mkReq('GET', bearer('cron-secret-value')));
  eq([r.statusCode, (r.body as { code: string }).code], [503, 'feature_disabled'], 'CRON_SECRET unset → 503');
  r = await call(handler, mkReq('GET', bearer('internal-secret-value')));
  eq(r.statusCode, 503, 'CRON_SECRET unset: the internal secret does not stand in');
  process.env.CRON_SECRET = 'cron-secret-value';
  r = await call(handler, mkReq('PUT', bearer('cron-secret-value')));
  eq([r.statusCode, r.headers.allow], [405, 'GET, POST'], 'other methods → 405');
  eq(runs.length, 1, 'no refused request ran a tick');

  // ops POST
  const ops = (body?: unknown, extra: Record<string, string> = {}, query: Record<string, string> = {}) => mkReq('POST', { 'x-bobby-ops': 'ops-secret-value', ...extra }, query, body);
  r = await call(handler, ops({ at: '2026-10-05T07:30:00-04:00' }));
  eq([r.statusCode, runs.at(-1)!.now.toISOString()], [200, '2026-10-05T11:30:00.000Z'], 'ops at= honored outside production');
  r = await call(handler, ops(JSON.stringify({ at: '2026-10-05T12:00:00Z' })));
  eq([r.statusCode, runs.at(-1)!.now.toISOString()], [200, '2026-10-05T12:00:00.000Z'], 'ops body as a JSON string');
  const before = Date.now();
  r = await call(handler, ops(undefined));
  ok(r.statusCode === 200 && Math.abs(runs.at(-1)!.now.getTime() - before) < 2_000, 'ops without a body runs at the real time');
  for (const [what, body] of [['extra key', { at: '2026-10-05T12:00:00Z', force: true }], ['not a date', { at: 'tomorrow' }], ['no offset', { at: '2026-10-05T12:00:00' }], ['bad JSON', '{"at":'], ['array', []]] as Array<[string, unknown]>) {
    r = await call(handler, ops(body));
    eq(r.statusCode, 400, `ops body refused: ${what}`);
  }
  r = await call(handler, ops({}, {}, { at: '2026-10-05T12:00:00Z' }));
  eq(r.statusCode, 400, 'ops with a query parameter → 400');
  for (const [what, headers] of [['cron secret', { 'x-bobby-ops': 'cron-secret-value' }], ['bearer ops', { authorization: 'Bearer ops-secret-value' }], ['none', {}]] as Array<[string, Record<string, string>]>) {
    r = await call(handler, mkReq('POST', headers, {}, {}));
    eq(r.statusCode, 401, `ops refuses ${what}`);
  }
  process.env.VERCEL_ENV = 'production';
  const n = runs.length;
  r = await call(handler, ops({ at: '2026-10-05T07:30:00-04:00' }));
  eq([r.statusCode, runs.length], [400, n], 'production: at= refused, no tick');
  r = await call(handler, ops({}));
  eq(r.statusCode, 200, 'production: ops run without at= is allowed');
  delete process.env.VERCEL_ENV;
  delete process.env.BOBBY_OPS_SECRET;
  r = await call(handler, ops({}));
  eq(r.statusCode, 503, 'BOBBY_OPS_SECRET unset → 503');
  process.env.BOBBY_OPS_SECRET = 'ops-secret-value';

  // Kill switch: the real tick makes no database call at all.
  let rpcCalls = 0;
  dbMod.setBriefingRpc(async () => { rpcCalls++; throw new Error('no db'); });
  process.env.BOBBY_BRIEFINGS_ENABLED = 'off';
  const runsBefore = runs.length;
  r = await call(handler, mkReq('GET', bearer('cron-secret-value')));
  eq([r.statusCode, r.body, runs.length], [200, { enabled: false, claimed: 0 }, runsBefore], 'disabled → 200 {enabled:false, claimed:0}, no tick');
  r = await call(handlerMod.default, mkReq('GET', bearer('cron-secret-value')));
  eq([r.statusCode, r.body, rpcCalls], [200, { enabled: false, claimed: 0 }, 0], 'default handler disabled → zero database calls');
  const direct = await runTick({ now: new Date(), worker: 'w', deadlineAt: Date.now() + 45_000 });
  eq([direct.enabled, rpcCalls], [false, 0], 'runTick with real deps disabled → zero database calls');
  process.env.BOBBY_BRIEFINGS_ENABLED = 'on';
  dbMod.setBriefingRpc(null);

  // A storage failure inside the tick is a JSON 503.
  const failing = handlerMod.createWorkerHandler(async () => { throw new dbMod.BriefingStorageError('bobby_brief_reconcile', 500); });
  r = await call(failing, mkReq('GET', bearer('cron-secret-value')));
  eq([r.statusCode, (r.body as { code: string }).code], [503, 'storage_unavailable'], 'storage error → 503 storage_unavailable');
}

// ---- happy path: model narrative, publish, audio, dispatch, purge ----
{
  setCaps(true);
  const h = harness({ llm: () => ({ ok: true, value: MODEL_NARRATIVE, usd: 0.001, estimated: false, usage: { tokensIn: 10, tokensOut: 10, latencyMs: 5 } }) });
  const r = await h.run();
  eq([r.seeded, r.sharedReady, r.claimed, r.published, r.failed, r.budget], [1, 1, 1, 1, 0, null], 'one shared narrative, one report published');
  eq(h.llm.map((x) => x.model), ['claude-sonnet-5-5'], 'first model answered: one paid attempt');
  eq(h.budget.calls, ['reserve', 'dispatch', 'settle:settled'], 'the attempt was reserved, dispatched and settled');
  eq(committedNarrative(h)?.source, 'model', 'shared narrative written by the model');
  const [pub] = h.db.named('publishBrief') as Array<[{ quality: string; usesMemory: boolean; sharedId: string; content: { narrationSegments: string[] } }]>;
  eq([pub[0].sharedId, pub[0].usesMemory], [SHARED_ID, false], 'published against the shared row, no memory');
  ok(['full', 'partial'].includes(pub[0].quality), `model quality is full/partial (${pub[0].quality})`);
  eq([h.audio.length, r.audioReady], [Math.min(pub[0].content.narrationSegments.length, workerMod.AUDIO_PRESYNTH_PER_TICK), h.audio.length], 'morning audio pre-synthesized per distinct segment');
  const needed = h.db.named('neededAssets');
  eq(needed.length, 0, 'no account-derived symbol union reaches evidence/providers');
  setCaps(false);
}

// The shared provider inputs are public and identical regardless of private activity or consent.
{
  const symbolsSeen: string[][] = [];
  for (const memoryOn of [false, true]) {
    const h = harness({ db: { neededAssets: async () => { throw new Error('private symbols must not be read'); } }, deps: {
      memoryOn: () => memoryOn,
      buildEvidence: async (period, symbols) => { symbolsSeen.push([...symbols]); return evidenceWith(snapshot, () => AT_0735)(period, symbols); },
    } });
    await h.run();
    eq(h.db.named('neededAssets').length, 0, 'account symbol union unused regardless memory flag');
  }
  eq(symbolsSeen[0], Object.keys((await import('../api/_lib/briefings/config.ts')).SUPPORTED_ASSETS), 'all17 public assets covered');
  eq(symbolsSeen[1], symbolsSeen[0], 'private memory cannot alter a provider request');
}

// ---- budget missing → facts-only, still published ----
{
  const h = harness();
  const r = await h.run();
  eq([h.llm.length, h.budget.calls.length], [0, 0], 'no caps → no reservation, no provider call');
  eq([committedNarrative(h)?.source, r.published, r.budget], ['facts_only', 1, 'budget_unavailable'], 'facts-only narrative committed and the report published');
  eq((h.db.named('publishBrief')[0][0] as { quality: string }).quality, 'facts_only', 'report quality facts_only');
}

// ---- every provider fails → facts-only after one attempt per model ----
{
  setCaps(true);
  const h = harness({ llm: () => ({ ok: false, outcome: 'no_charge', code: 'http_500', status: 500, latencyMs: 1 }) });
  const r = await h.run();
  eq([h.llm.map((x) => x.model), committedNarrative(h)?.source, r.published], [['claude-sonnet-5-5', 'gpt-4o-mini'], 'facts_only', 1], 'each model once, then facts-only');
  // An invalid model answer counts as a failed attempt too.
  const h2 = harness({ llm: () => ({ ok: true, value: { ...MODEL_NARRATIVE, opening: 'Bitcoin at 99999 now.' }, usd: 0.001, estimated: false, usage: { latencyMs: 1 } }) });
  await h2.run();
  eq([h2.llm.length, committedNarrative(h2)?.source], [2, 'facts_only'], 'an ungrounded narrative is rejected; facts-only instead');
  setCaps(false);
}

// ---- unknown provider outcome: never a second attempt in the same tick ----
{
  setCaps(true);
  const unknown = () => ({ ok: false as const, outcome: 'unknown' as const, code: 'timeout', status: null, latencyMs: 40_000 });
  const h = harness({ llm: unknown });
  const r = await h.run();
  eq(h.llm.length, 1, 'unknown → no second model attempt in this tick');
  eq(h.budget.calls, ['reserve', 'dispatch', 'settle:unknown'], 'the unknown attempt stays reserved for reconciliation');
  eq([commitStates(h), h.db.named('commitShared')[0][6]], [['retry'], 'provider_unknown'], 'ready-by is far: deferred to a later tick (no facts-only yet)');
  eq([h.db.named('claimBriefs').length, r.published], [0, 0], 'no personal claim while the narrative is pending (no attempt burned)');
  // The row's last deferrable attempt: facts-only now instead of risking a failed period.
  const h2 = harness({ llm: unknown, db: { claimShared: async () => ({ state: 'claimed', id: SHARED_ID, fence: 3, attempts: 2 }) } });
  const r2 = await h2.run();
  eq([h2.llm.length, commitStates(h2), r2.published], [1, ['ready'], 1], 'out of deferrals → facts-only after the one unknown attempt');
  // Too close to ready-by for another tick: facts-only in this tick.
  const h3 = harness({ llm: unknown, now: cal.nyLocalToUtc('2026-10-05', '07:55') });
  const r3 = await h3.run();
  eq([h3.llm.length, committedNarrative(h3)?.source, r3.published], [1, 'facts_only', 1], 'no later tick before ready-by → facts-only now');
  // A previous unknown attempt still unresolved for one model: the other model is tried.
  const h4 = harness({ llm: () => ({ ok: true, value: MODEL_NARRATIVE, usd: 0.001, estimated: false, usage: { latencyMs: 1 } }), deps: {
    withReservation: async (p, call) => (p.model === 'claude-sonnet-5-5' ? { ok: false, code: 'work_unresolved' } : withReservation(p, call, { db: budgetFake().db, logUsage: noUsage })),
  } });
  const r4 = await h4.run();
  eq([h4.llm.map((x) => x.model), committedNarrative(h4)?.source, r4.budget], [['gpt-4o-mini'], 'model', 'work_unresolved'], 'work_unresolved on one model → the next model answers');
  setCaps(false);
}

// ---- ready-by fallback ----
{
  setCaps(true);
  for (const [what, at] of [['07:58:30 (inside the margin)', new Date(Date.parse(P.readyBy) - 30_000)], ['08:05 (dispatch phase)', cal.nyLocalToUtc('2026-10-05', '08:05')]] as Array<[string, Date]>) {
    const h = harness({ now: at, llm: () => ({ ok: true, value: MODEL_NARRATIVE, usd: 0.001, estimated: false, usage: { latencyMs: 1 } }) });
    const r = await h.run();
    eq([h.llm.length, committedNarrative(h)?.source, r.published], [0, 'facts_only', 1], `ready-by near (${what}) → no model call, facts-only, published`);
  }
  setCaps(false);
}

// ---- tick deadline ----
{
  setCaps(true);
  const h = harness({ llm: () => ({ ok: true, value: MODEL_NARRATIVE, usd: 0.001, estimated: false, usage: { latencyMs: 1 } }) });
  const r = await h.run({ deadlineMs: 10_000 });
  eq([h.llm.length, h.db.named('claimShared').length, r.stoppedEarly, r.published], [0, 0, true, 0], 'little time left, ready-by far → no lease taken, no provider attempt, stopped early');
  const h2 = harness({ now: cal.nyLocalToUtc('2026-10-05', '07:56'), llm: () => ({ ok: true, value: MODEL_NARRATIVE, usd: 0.001, estimated: false, usage: { latencyMs: 1 } }) });
  const r2 = await h2.run({ deadlineMs: 10_000 });
  eq([h2.llm.length, committedNarrative(h2)?.source, r2.published], [0, 'facts_only', 1], 'little time left, ready-by near → facts-only without a provider attempt');
  const h3 = harness();
  const r3 = await h3.run({ deadlineMs: 1_000 });
  eq([h3.db.named('seedPeriod').length, h3.db.named('claimOutbox').length, h3.db.named('purge').length, r3.stoppedEarly], [0, 0, 0, true], 'almost no time → only reconcile ran');
  setCaps(false);
}

// ---- evidence without a single quote: never a report ----
{
  const h = harness({ snap: emptySnapshot });
  const r = await h.run();
  eq([commitStates(h), h.db.named('commitShared')[0][6], r.published, h.db.named('claimBriefs').length], [['retry'], 'no_evidence', 0, 0], 'no quotes → shared retry, nothing claimed or published');
  const h2 = harness({ snap: emptySnapshot, db: { claimShared: async () => ({ state: 'claimed', id: SHARED_ID, fence: 3, attempts: 2 }) } });
  const r2 = await h2.run();
  eq(commitStates(h2), ['failed'], 'at the attempt cap → shared failed');
  eq([h2.db.named('failBrief').map((a) => [a[2], a[3]]), r2.published, r2.failed], [[['shared_failed', true]], 0, 1], 'claimed reports of a failed language fail for good (honest unavailable), no publish');
  const h3 = harness({ db: { claimShared: async () => ({ state: 'busy' }) } });
  const r3 = await h3.run();
  eq([h3.db.named('claimBriefs').length, r3.published], [0, 0], 'shared busy (another worker) → personal stage waits');
}

// ---- languages: only the ones someone reads; a ready row is reused ----
{
  const h = harness({ db: { openLanguages: async () => [] } });
  const r = await h.run();
  eq([h.db.named('claimShared').length, h.db.named('neededAssets').length, h.db.named('claimBriefs').length, r.sharedReady], [0, 0, 0, 0], 'no open report → no evidence, no narrative, no claim');
  const ev = await evidenceWith(snapshot, () => AT_0735)(P, ['BTC']);
  const { factsOnlyNarrative } = await import('../api/_lib/briefings/narrative.ts');
  const ready = { state: 'ready', id: SHARED_ID, narrative: factsOnlyNarrative(ev, 'es', ['BTC']), evidence: ev };
  const h2 = harness({ db: { openLanguages: async () => ['es'], claimShared: async () => ready, claimBriefs: queue([[claimed({ frozen: { ...FROZEN, language: 'es' } })]], []) } });
  const r2 = await h2.run();
  eq([h2.db.named('commitShared').length, r2.sharedReady, r2.published], [0, 0, 1], 'ready shared row reused (no evidence capture, no commit)');
  // A report whose language changed after the scan gets its narrative settled inline.
  const h3 = harness({ db: { openLanguages: async () => ['en'], claimBriefs: queue([[claimed({ frozen: { ...FROZEN, language: 'es' } })]], []) } });
  const r3 = await h3.run();
  eq([h3.db.named('claimShared').map((a) => a[2]), r3.published], [['en', 'es'], 1], 'language changed since the scan → its narrative is written inline');
}

// ---- publish outcomes ----
{
  const h = harness({ db: { publishBrief: async () => ({ ok: false, code: 'stale_fence' }) } });
  const r = await h.run();
  eq([h.db.named('failBrief').length, r.published, r.failed, h.audio.length], [0, 0, 0, 0], 'stale fence → dropped silently (no fail, no audio)');
  let n = 0;
  const id = randomUUID();
  const h2 = harness({ db: {
    claimBriefs: queue([[claimed({ id, memory: { experience: 'new', explainRiskDepth: 'high', frequentAssets: ['SOL'] }, frozen: { ...FROZEN, analysisConsent: true } })], [claimed({ id, fence: 3 })]], []),
    publishBrief: async () => (++n === 1 ? { ok: false, code: 'privacy_changed' } : { ok: true }),
  }, deps: { memoryOn: () => true } });
  const r2 = await h2.run();
  const pubs = h2.db.named('publishBrief').map((a) => a[0] as { usesMemory: boolean; memoryAssets: string[]; fence: number });
  eq([pubs.length, pubs[0].usesMemory, pubs[0].memoryAssets, pubs[1].usesMemory, pubs[1].fence, r2.published], [2, true, ['SOL'], false, 3, 1], 'privacy_changed → re-claimed in the same tick and recomposed without memory');
  for (const code of ['not_pro', 'opted_out']) {
    const h3 = harness({ db: { publishBrief: async () => ({ ok: false, code }) } });
    const r3 = await h3.run();
    eq([h3.db.named('failBrief').length, r3.published, r3.failed], [0, 0, 0], `${code} → SQL already settled it; not a failure`);
  }
  // Memory is never used with the server flag off, even when SQL offers it.
  const h4 = harness({ db: { claimBriefs: queue([[claimed({ memory: { experience: 'new', explainRiskDepth: 'high', frequentAssets: ['SOL'] }, frozen: { ...FROZEN, analysisConsent: true } })]], []) } });
  await h4.run();
  eq((h4.db.named('publishBrief')[0][0] as { usesMemory: boolean }).usesMemory, false, 'BOBBY_BRIEFINGS_MEMORY off → memory ignored');
  // Invalid content → failed for good (deterministic).
  const h5 = harness({ deps: { validateContent: () => 'too_large' } });
  const r5 = await h5.run();
  eq([h5.db.named('failBrief').map((a) => [a[2], a[3]]), h5.db.named('publishBrief').length, r5.failed], [[['invalid_too_large', true]], 0, 1], 'invalid content → failBrief(final), no publish');
  // Bounded rounds even if SQL kept handing reports back.
  const h6 = harness({ db: { claimBriefs: async () => [claimed()], publishBrief: async () => ({ ok: false, code: 'privacy_changed' }) } });
  await h6.run();
  eq(h6.db.named('claimBriefs').length, PERSONAL_MAX_ROUNDS, 'personal rounds are bounded');
}

// ---- audio pre-synthesis bounds ----
{
  const many = Array.from({ length: 5 }, () => claimed());
  const h = harness({ db: { claimBriefs: queue([many], []) } });
  await h.run();
  ok(h.audio.length <= workerMod.AUDIO_PRESYNTH_PER_TICK && new Set(h.audio).size === h.audio.length, `audio: distinct keys, ≤ ${workerMod.AUDIO_PRESYNTH_PER_TICK} per tick (${h.audio.length})`);
  eq(h.db.named('requestAudio').map((a) => a[2]), Array(h.audio.length).fill(1), 'audio requested at content version 1');
  const h2 = harness({ db: { claimBriefs: queue([[claimed()]], []) }, audio: () => ({ state: 'queued' }) });
  const r2 = await h2.run();
  eq([h2.audio.length, r2.budget?.split(',').includes('tts_deferred')], [1, true], 'first refusal (caps/slots) stops the audio stage');
  const h3 = harness({ db: { claimBriefs: queue([[claimed({ frozen: { ...FROZEN, audioConsent: false } })]], []) } });
  await h3.run();
  eq(h3.audio.length, 0, 'no audio consent → no pre-synthesis');
  const closeP = cal.periodForDate('close', '2026-10-05', { ...policy, adopted: new Set(['close']) } as typeof policy)!;
  const h4 = harness({ deps: { duePeriods: () => [{ period: closeP, phase: 'prepare' }] }, now: cal.nyLocalToUtc('2026-10-05', '16:05') });
  const r4 = await h4.run();
  eq([r4.published, h4.audio.length], [0, 0], 'legacy close periods cannot generate reports or audio');
}

// ---- dispatch ----
{
  const h = harness({ deps: { apnsConfig: () => null }, db: { claimOutbox: async () => [outboxItem()] } });
  const r = await h.run();
  eq([h.db.named('fillOutbox').length, h.db.named('claimOutbox').length, h.apns.length], [1, 0, 0], 'APNs config missing → intents filled, nothing claimed or sent');
  ok(r.budget?.includes('apns_unconfigured'), 'report carries apns_unconfigured');
  const h2 = harness({ deps: { pushMasterKey: () => null }, db: { claimOutbox: async () => [outboxItem()] } });
  const r2 = await h2.run();
  eq([h2.db.named('claimOutbox').length, r2.budget?.includes('push_key_unavailable')], [0, true], 'push master key missing → nothing claimed');

  const items = [outboxItem(), outboxItem({ language: 'es' }), outboxItem({ expiresAt: new Date(Date.now() - 1_000).toISOString() }), outboxItem({ tokenCiphertext: encryptToken(TOKEN_HEX, randomBytes(32)) })];
  const h3 = harness({
    db: { claimBriefs: async () => [], claimOutbox: queue([items], []) },
    apns: (n) => (n.language === 'es' ? { outcome: 'invalid_token', status: 410, reason: 'Unregistered' } : { outcome: 'accepted', status: 200, reason: null }),
  });
  const r3 = await h3.run();
  eq(h3.apns.map((n) => [n.token, n.apnsId, n.collapseId, n.topic]), [[TOKEN_HEX, items[0].apnsId, 'brief-x', APNS.topic], [TOKEN_HEX, items[1].apnsId, 'brief-x', APNS.topic]], 'decrypted token, stable apns-id / collapse-id, server topic');
  const order = items.map((i) => i.id);
  const results = h3.db.named('outboxResult').map((a) => [a[0], a[2], a[3], a[4], a[5]]).sort((x, y) => order.indexOf(x[0] as string) - order.indexOf(y[0] as string));
  eq(results, [
    [items[0].id, 'accepted', 200, null, null],
    [items[1].id, 'invalid_token', 410, 'Unregistered', null],
    [items[3].id, 'config', null, 'token_unreadable', null],
  ], 'accepted / invalid_token mapped; undecryptable token released as config; the expired row untouched');
  eq([r3.dispatched, r3.accepted, r3.expired], [2, 1, 1], 'counts: 2 sent, 1 accepted, 1 expired skipped');

  // A configuration answer pauses the rest of the tick; unsent claimed rows are released without burning attempts.
  const batch = Array.from({ length: 7 }, () => outboxItem());
  const h4 = harness({ db: { claimBriefs: async () => [], claimOutbox: queue([batch], []) }, apns: () => ({ outcome: 'config', status: 403, reason: 'ExpiredProviderToken' }) });
  const r4 = await h4.run();
  eq(h4.apns.length, workerMod.APNS_CONCURRENCY, 'config outcome → the next batch is not sent');
  eq(h4.db.named('outboxResult').map((a) => [a[2], a[4]]), [...Array(5).fill(['config', 'ExpiredProviderToken']), ['config', 'released'], ['config', 'released']], 'remaining rows released (config: no attempt burned)');
  eq(h4.db.named('claimOutbox').length, 1, 'paused: no further claim in this tick');
  ok(r4.budget?.includes('apns_config'), 'report carries apns_config');
  // Retry-After travels to the outbox result.
  const h5 = harness({ db: { claimBriefs: async () => [], claimOutbox: queue([[outboxItem()]], []) }, apns: () => ({ outcome: 'retry', status: 429, reason: 'TooManyRequests', retryAfterSeconds: 60 }) });
  await h5.run();
  eq(h5.db.named('outboxResult').map((a) => [a[2], a[3], a[5]]), [['retry', 429, 60]], 'retry outcome keeps Retry-After');
  // Short of time before a send batch → claimed rows released.
  const h6 = harness({ db: { claimBriefs: async () => [], openLanguages: async () => [], claimOutbox: queue([[outboxItem()]], []) } });
  const r6 = await h6.run({ deadlineMs: workerMod.APNS_MIN_REMAINING_MS - 1_000 });
  eq([h6.apns.length, h6.db.named('claimOutbox').length, r6.stoppedEarly], [0, 0, true], 'no time for an APNs batch → nothing claimed');
}

// ---- learning → sourced analysis → useful window → current claimed delivery, all sinks mocked ----
{
  setCaps(false);
  const at = cal.nyLocalToUtc('2026-10-05', '07:55');
  const dueAt = cal.nyLocalToUtc('2026-10-05', '08:00');
  const fixtureEvidence = await buildEvidence(P, ['BTC'], {
    now: () => at, snapshot: async () => snapshot(at), agenda: async () => [],
    dailyCloses: async () => [{ symbol: 'BTC', from: { at: cal.nyLocalToUtc('2026-09-25', '16:00').toISOString(), price: 100 }, to: { at: cal.nyLocalToUtc('2026-10-02', '16:00').toISOString(), price: 102 } }],
  });
  const reader = claimed({ frozen: { ...FROZEN, assets: ['BTC'], analysisConsent: true, analysisConsentVersion: 1, audioConsent: false }, memory: { frequentAssets: ['BTC'], experience: null, explainRiskDepth: null } });
  const intent = outboxItem({ briefId: reader.id, expiresAt: P.pushExpiresAt });
  type Content = import('../api/_lib/briefings/types.ts').BriefContent;
  let published: Content | null = null;
  let clock = at.getTime();
  let rowState = 'pending';
  let claimedDelivery = false;
  let decryptions = 0;
  const h = harness({
    db: {
      claimBriefs: queue([[reader]], []),
      publishBrief: async (p) => { published = p.content; return { ok: true }; },
      claimOutbox: async () => clock >= dueAt.getTime() && rowState === 'pending' && !claimedDelivery ? (claimedDelivery = true, [intent]) : [],
      deliveryReport: async () => published ? { content: published, identityId: IDENTITY } : null,
      deliveredOpportunity: async () => rowState === 'sent',
      outboxResult: async (_id, _fence, outcome) => { if (outcome === 'accepted') rowState = 'sent'; },
    },
    deps: { opportunitiesEnabled: () => true, memoryOn: () => true, buildEvidence: async () => fixtureEvidence, now: () => clock,
      decryptToken: () => { decryptions++; return TOKEN_HEX; },
    },
  });
  const first = await h.run({ now: at });
  ok(published, 'learning integration publishes actual deterministic content');
  const content = published! as Content;
  eq([content.learningOpportunity?.interest.origin, content.learningOpportunity?.source.kind, h.db.named('publishBrief')[0][0] && (h.db.named('publishBrief')[0][0] as any).usesMemory], ['explicit_setting', 'dated_history', true], 'explicit follow + consented factual history → shared sourced content → metadata retains withdrawal markers');
  eq([first.accepted, h.apns.length, decryptions], [0, 0, 0], 'preparation does not push or decrypt');
  clock = dueAt.getTime();
  const delivery = await h.run({ now: dueAt });
  eq([delivery.accepted, h.apns.length, decryptions], [1, 1, 1], 'real worker guard allows one mocked APNs attempt in the source/useful window');
  eq(h.apns[0].briefId, reader.id, 'delivery refers to the published report, without exposing its personal content');
  eq(h.db.named('deliveredOpportunity')[0], [intent.deviceId, IDENTITY, content.learningOpportunity!.factKey], 'accepted-fact lookup uses server report owner and claimed device');
  const replay = await h.run({ now: dueAt });
  eq([replay.accepted, h.apns.length], [0, 1], 'existing sent-outbox state keeps repeated worker tick idempotent');

  const eventPushContent: Content = structuredClone(content);
  Object.assign(eventPushContent.learningOpportunity!, {
    trigger: 'event_triggered', reason: 'accepted_source_change',
    source: { ...content.learningOpportunity!.source, kind: 'accepted_event', documentDigest: 'a'.repeat(64), url: 'https://example.org/official-document' },
    novelty: { comparison: 'accepted_source_change', baselineAt: null, baselinePrice: null, price: null, changePct: null },
  });
  const dailyPushContent: Content = structuredClone(content);
  const dailyAsOf = new Date(dueAt.getTime() - MIN).toISOString();
  const dailyExpires = new Date(dueAt.getTime() + 14 * MIN).toISOString();
  dailyPushContent.cadence = 'morning';
  dailyPushContent.sources = [{ name: 'okx_spot', ok: true, freshness: '24_7' }];
  const dailyAsset = dailyPushContent.sections.find(s => s.kind === 'asset' && s.symbol === 'BTC')!;
  dailyAsset.asOf = dailyAsOf; dailyAsset.status = '24_7';
  Object.assign(dailyPushContent.learningOpportunity!, {
    source: { kind: 'live_quote', names: ['okx_spot'], asOf: dailyAsOf, expiresAt: dailyExpires },
    novelty: { comparison: 'reported_window', baselineAt: null, baselinePrice: null, price: 102, changePct: 2 },
    delivery: { ...content.learningOpportunity!.delivery, cadence: 'morning', periodKey: '2026-10-05', expiresAt: dailyExpires },
  });
  eq(validateContent(eventPushContent), null, 'event-push fixture is valid metadata, so channel policy must reject it');
  eq(validateContent(dailyPushContent), null, 'daily-push fixture is valid metadata, so adoption policy must reject it');

  const cases: Array<{ label: string; content?: unknown; report?: null; reportError?: boolean; dedupeError?: boolean; reserveError?: boolean; reserveConflict?: boolean; duplicate?: boolean; reason: string }> = [
    { label: 'ready content missing', report: null, reason: 'opportunity_ineligible' },
    { label: 'malformed stored content', content: { version: 99 }, reason: 'opportunity_ineligible' },
    { label: 'legacy report missing opportunity', content: { ...content, learningOpportunity: undefined }, reason: 'opportunity_ineligible' },
    { label: 'in-app preference', content: { ...content, learningOpportunity: { ...content.learningOpportunity!, delivery: { ...content.learningOpportunity!.delivery, preference: 'in_app', channel: 'in_app' } } }, reason: 'opportunity_ineligible' },
    { label: 'expired sourced opportunity', content: { ...content, learningOpportunity: { ...content.learningOpportunity!, source: { ...content.learningOpportunity!.source, expiresAt: dueAt.toISOString() }, delivery: { ...content.learningOpportunity!.delivery, expiresAt: dueAt.toISOString() } } }, reason: 'opportunity_ineligible' },
    { label: 'content storage failure', reportError: true, reason: 'opportunity_unavailable' },
    { label: 'unknown prior delivery', dedupeError: true, reason: 'opportunity_unavailable' },
    { label: 'same source fact already APNs-accepted', duplicate: true, reason: 'opportunity_duplicate' },
    { label: 'atomic reservation conflict', reserveConflict: true, reason: 'opportunity_duplicate' },
    { label: 'reservation outcome unknown', reserveError: true, reason: 'opportunity_unavailable' },
    { label: 'event metadata requests push without per-type consent', content: eventPushContent, reason: 'opportunity_ineligible' },
    { label: 'daily metadata requests push without adopted refresh strategy', content: dailyPushContent, reason: 'opportunity_ineligible' },
  ];
  for (const c of cases) {
    let decrypted = 0;
    const blocked = harness({ db: {
      claimBriefs: async () => [], openLanguages: async () => [], claimOutbox: queue([[intent]], []),
      deliveryReport: async () => { if (c.reportError) throw new dbMod.BriefingStorageError('delivery_report', 503); return c.report === null ? null : { content: c.content ?? content, identityId: IDENTITY }; },
      deliveredOpportunity: async () => { if (c.dedupeError) throw new dbMod.BriefingStorageError('delivered_opportunity', null); return !!c.duplicate; },
      reserveDeliveryOpportunity: async () => { if (c.reserveError) throw new dbMod.BriefingStorageError('reserve_opportunity', null); return !c.reserveConflict; },
    }, deps: { opportunitiesEnabled: () => true, now: () => dueAt.getTime(), decryptToken: () => { decrypted++; return TOKEN_HEX; } } });
    const r = await blocked.run({ now: dueAt });
    eq([r.accepted, r.dispatched, blocked.apns.length, decrypted], [0, 0, 0, 0], `${c.label}: no provider attempt or token decryption`);
    eq(blocked.db.named('outboxResult').map(a => [a[2], a[4]]), [['config', c.reason]], `${c.label}: release uses existing fenced outcome, never a success receipt`);
  }

  const another = outboxItem({ briefId: randomUUID(), deviceId: intent.deviceId, expiresAt: P.pushExpiresAt });
  const parallel = harness({ db: { claimBriefs: async () => [], openLanguages: async () => [], claimOutbox: queue([[intent, another]], []), deliveryReport: async () => ({ content, identityId: IDENTITY }), deliveredOpportunity: async () => false }, deps: { opportunitiesEnabled: () => true, now: () => dueAt.getTime() } });
  await parallel.run({ now: dueAt });
  eq(parallel.apns.length, 1, 'same account/device/fact in a parallel delivery batch gets one attempt');
  eq(parallel.db.named('outboxResult').filter(a => a[4] === 'opportunity_duplicate').length, 1, 'tick reservation rejects the concurrent duplicate before sending');

  // Two independent lambdas have separate Tick sets: the database primary key arbitrates them.
  const reservations = new Set<string>();
  const atomicReserve = async (identity: string, device: string, fact: string) => {
    const key = `${identity}:${device}:${fact}`;
    if (reservations.has(key)) return false;
    reservations.add(key);
    await Promise.resolve();
    return true;
  };
  const concurrent = () => harness({ db: { claimBriefs: async () => [], openLanguages: async () => [], claimOutbox: queue([[intent]], []), deliveryReport: async () => ({ content, identityId: IDENTITY }), deliveredOpportunity: async () => false, reserveDeliveryOpportunity: atomicReserve }, deps: { opportunitiesEnabled: () => true, now: () => dueAt.getTime() } });
  const workerA = concurrent(), workerB = concurrent();
  await Promise.all([workerA.run({ now: dueAt }), workerB.run({ now: dueAt })]);
  eq([workerA.apns.length + workerB.apns.length, reservations.size], [1, 1], 'atomic source reservation allows only one of two independent workers to attempt APNs');
  eq([...workerA.db.named('outboxResult'), ...workerB.db.named('outboxResult')].filter(a => a[4] === 'opportunity_duplicate').length, 1, 'losing worker releases without a claimed receipt');
  const crashed = concurrent();
  await crashed.run({ now: dueAt });
  eq(crashed.apns.length, 0, 'a consumed reservation never takes over after an uncertain/crashed worker');

  let lateClock = dueAt.getTime();
  let lateDecryptions = 0;
  const short = structuredClone(content);
  short.learningOpportunity!.source.expiresAt = cal.nyLocalToUtc('2026-10-05', '08:01').toISOString();
  short.learningOpportunity!.delivery.expiresAt = short.learningOpportunity!.source.expiresAt;
  const late = harness({ db: { claimBriefs: async () => [], openLanguages: async () => [], claimOutbox: queue([[intent]], []), deliveryReport: async () => ({ content: short, identityId: IDENTITY }), deliveredOpportunity: async () => { lateClock += 2 * MIN; return false; } }, deps: { opportunitiesEnabled: () => true, now: () => lateClock, decryptToken: () => { lateDecryptions++; return TOKEN_HEX; } } });
  const lateResult = await late.run({ now: dueAt });
  eq([late.apns.length, lateDecryptions, lateResult.expired], [0, 0, 1], 'useful source window is rechecked after slow storage, before decryption');

  const off = harness({ db: { claimBriefs: async () => [], openLanguages: async () => [], claimOutbox: queue([[intent]], []), deliveryReport: async () => { throw new Error('must not read'); } }, deps: { opportunitiesEnabled: () => false, now: () => dueAt.getTime() } });
  await off.run({ now: dueAt });
  eq([off.apns.length, off.db.named('deliveryReport').length, off.db.named('deliveredOpportunity').length], [1, 0, 0], 'rollout switch off leaves the authorized legacy delivery path unchanged');
}

// ---- purge ----
{
  const path = `v1/ab/${'ab'.repeat(32)}.mp3`;
  const h = harness({ db: { purge: async () => ({ storagePaths: [path] }) } });
  const r = await h.run();
  eq([h.removed, r.purged], [[[path]], 1], 'purged rows → their Storage objects removed');
  const h2 = harness({ db: { purge: async () => ({ storagePaths: [path] }) }, deps: { audioStore: () => ({ put: async () => {}, get: async () => null, remove: async () => { throw new dbMod.BriefingStorageError('storage:remove', 500); } }) } });
  const r2 = await h2.run();
  eq(r2.purged, 0, 'Storage removal failure: logged, not counted');
}

// ---- a failing database never throws out of the tick ----
{
  const boom = async () => { throw new dbMod.BriefingStorageError('x', 500); };
  const h = harness({ db: { reconcile: boom, seedPeriod: boom, fillOutbox: boom, claimOutbox: boom, purge: boom } });
  const r = await h.run();
  eq([r.enabled, r.published, r.dispatched], [true, 0, 0], 'storage errors are logged per stage; the tick still answers');
}

// ---- logs: stage names and codes only ----
{
  const joined = logLines.join('\n');
  ok(!joined.includes(TOKEN_HEX) && !joined.includes(IDENTITY) && !joined.includes(MODEL_NARRATIVE.opening) && !joined.includes('BTC'), 'logs carry no token, identity, report text or symbol');
}
eq(fetchCalls, 0, 'unit part: no network call');
const unitChecks = checks;

// ================================================================ (b) end to end, real SQL

const url = process.env.DATABASE_URL;
if (!url) {
  if (process.env.CI) throw new Error('DATABASE_URL is required in CI');
  console.log('briefings-worker: PG part SKIP (no DATABASE_URL)');
} else {
  const { assertLocalUrl, bootstrapBriefingsDb, makeIdentity, pgRpcTransport, setPro } = await import('./briefings-pg-harness.mjs');
  assertLocalUrl(url);
  const pool = await bootstrapBriefingsDb(url);
  dbMod.setBriefingRpc(pgRpcTransport(pool));
  const q = async (sql: string, args: unknown[] = []) => (await pool.query(sql, args)).rows;
  const one = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0];
  const sha = (s: string) => createHash('sha256').update(s).digest('hex');
  const hex = () => randomBytes(32).toString('hex');
  try {
    await q(`truncate public.bobby_brief_settings, public.bobby_brief_shared, public.bobby_briefs, public.bobby_push_devices, public.bobby_brief_outbox,
      public.bobby_brief_provider_attempts, public.bobby_brief_audio, public.bobby_brief_audio_links, public.bobby_brief_idempotency cascade`);
    await q('delete from public.bobby_identities');

    async function account(o: { pro: boolean; patch: Record<string, unknown> }) {
      const id = await makeIdentity(pool, { pro: o.pro });
      const cur = await dbMod.getSettings(id);
      const r = await dbMod.patchSettings(id, cur.revision, o.patch);
      assert.equal(r.ok, true, 'fixture settings');
      return id;
    }
    async function device(identity: string, permission: 'authorized' | 'denied' = 'authorized') {
      const token = hex();
      const proof = hex();
      const w = { tokenCiphertext: encryptToken(token, MASTER), tokenFingerprint: tokenFingerprint(token, APNS.topic, 'production', MASTER), environment: 'production' as const, topic: APNS.topic, permission, appBuild: 53 };
      const r = await dbMod.registerDevice(identity, randomUUID(), w, sha(proof), 5);
      assert.equal(r.ok, true, 'fixture device');
      return { token, proof, registrationId: (r as { registrationId: string }).registrationId };
    }
    let keySeq = 0;
    /** A morning period around the real clock (SQL decides windows with now()). Offsets in minutes from now. */
    function period(o: { prepare?: number; readyBy: number; scheduled: number; expires: number }): Period {
      keySeq++;
      const now = Date.now();
      const iso = (m: number) => new Date(now + m * MIN).toISOString();
      const parts = cal.nyParts(new Date(now));
      return {
        cadence: 'weekly', periodKey: `2031-01-01_2031-01-${String(8 + keySeq).padStart(2, '0')}`,
        periodStart: iso(-7 * 24 * 60 + (o.scheduled)), periodEnd: iso(o.scheduled), scheduledAt: iso(o.scheduled), prepareFrom: iso(o.prepare ?? -10),
        readyBy: iso(o.readyBy), pushExpiresAt: iso(o.expires), calendarVersion: cal.NYSE_CALENDAR_VERSION, policyVersion: cal.POLICY_VERSION,
        equitySession: cal.equitySession(parts.date, new Date(now)),
      };
    }
    const shift = (p: Period, minutes: number): Period => {
      const s = (v: string) => new Date(Date.parse(v) + minutes * MIN).toISOString();
      return { ...p, periodStart: s(p.periodStart), periodEnd: s(p.periodEnd), scheduledAt: s(p.scheduledAt), prepareFrom: s(p.prepareFrom), readyBy: s(p.readyBy), pushExpiresAt: s(p.pushExpiresAt) };
    };

    const sent: ApnsNotification[] = [];
    let apnsAnswer: (n: ApnsNotification) => ApnsOutcome = () => ({ outcome: 'accepted', status: 200, reason: null });
    let llmAnswer: (n: number) => Awaited<ReturnType<WorkerDeps['llmJsonOnce']>> = () => ({ ok: false, outcome: 'no_charge', code: 'http_500', status: 500, latencyMs: 1 });
    let llmCalls = 0;
    let audioCalls = 0;
    let due: Period[] = [];
    let apnsOn = true;
    let dbOverride: Partial<WorkerDeps['db']> = {};
    const tick = () => runTick({ now: new Date(), worker: 'worker-e2e', deadlineAt: Date.now() + 45_000 }, {
      enabled: () => true,
      db: { ...dbMod, ...dbOverride } as WorkerDeps['db'],
      schedulePolicy: () => policy,
      duePeriods: () => due.map((period) => ({ period, phase: Date.now() < Date.parse(period.scheduledAt) ? 'prepare' as const : 'dispatch' as const })),
      buildEvidence: evidenceWith(snapshot, () => new Date()),
      llmChoices: () => [{ provider: 'openai', model: 'gpt-4o-mini' }],
      withReservation: (p, call) => withReservation(p, call, { logUsage: noUsage }),
      llmJsonOnce: async () => llmAnswer(++llmCalls),
      ensureAudio: async (p) => { audioCalls++; return ensureAudio(p, { store: { put: async () => {}, get: async () => null, remove: async () => {} }, tts: async () => ({ ok: false, outcome: 'no_charge', code: 'http_500', status: 500, latencyMs: 1 }), withReservation: (rp, c) => withReservation(rp, c, { logUsage: noUsage }) }); },
      apnsConfig: () => (apnsOn ? APNS : null),
      sendApns: async (_cfg, n) => { sent.push(n); return apnsAnswer(n); },
      closeApns: () => {},
      pushMasterKey: () => MASTER,
      audioStore: () => ({ put: async () => {}, get: async () => null, remove: async () => {} }),
      logger,
    });
    const briefsOf = async (p: Period) => q('select identity_id, state, quality, uses_memory, memory_assets, language, content from bobby_briefs where period_key = $1 order by created_at', [p.periodKey]);

    // ---------- main scenario: 3 Pro (en/es/en) + non-Pro + opted-out, all with devices ----------
    const A = await account({ pro: true, patch: { weeklyEnabled: true, language: 'en', assets: ['BTC', 'NVDA'], audioConsentEnabled: true, audioConsentVersion: 1 } });
    const B = await account({ pro: true, patch: { weeklyEnabled: true, language: 'es', companionId: 'kora' } });
    const C = await account({ pro: true, patch: { weeklyEnabled: true, language: 'en', assets: ['ETH'] } });
    const N = await account({ pro: false, patch: { weeklyEnabled: true } });
    const O = await account({ pro: true, patch: { weeklyEnabled: false, closeEnabled: true } });
    const dA1 = await device(A); await device(A, 'denied'); const dAX = await device(A);
    const dB1 = await device(B); const dC1 = await device(C); const dC2 = await device(C);
    await device(N); await device(O);

    const e2eLogStart = logLines.length;
    const P1 = period({ readyBy: 20, scheduled: 21, expires: 50 });
    due = [P1];
    const t1 = await tick();
    const rows1 = await briefsOf(P1);
    eq([t1.seeded, t1.claimed, t1.published, t1.sharedReady, t1.failed], [3, 3, 3, 2, 0], 'prepare tick: 3 seeded, 3 published, one shared narrative per language (en, es)');
    eq(rows1.map((r) => [r.identity_id, r.state, r.quality, r.language]).sort(), [[A, 'ready', 'facts_only', 'en'], [B, 'ready', 'facts_only', 'es'], [C, 'ready', 'facts_only', 'en']].sort(), 'exactly the 3 Pro switched-on accounts, facts-only (no caps)');
    eq((await one('select count(*)::int as n from bobby_brief_shared where period_key = $1 and state = $2', [P1.periodKey, 'ready'])).n, 2, 'two shared rows (en, es)');
    const sectionsA = (rows1.find((r) => r.identity_id === A)!.content as { sections: Array<{ kind: string; symbol?: string }> }).sections.filter((s) => s.kind === 'asset').map((s) => s.symbol);
    eq(sectionsA, ['BTC', 'NVDA'], "A's followed assets, in order");
    eq([llmCalls, t1.budget?.includes('budget_unavailable')], [0, true], 'no caps → no provider call');
    eq([sent.length, (await one('select count(*)::int as n from bobby_brief_outbox')).n], [0, 0], 'prepare phase: nothing filled or sent before 08:00');
    ok(audioCalls >= 1, 'A (audio consent) got narration pre-synthesis attempted');
    eq((await one("select count(*)::int as n from bobby_brief_audio where state = 'queued' and last_error = 'budget_unavailable'")).n >= 1, true, 'audio without caps stays queued (no TTS spend)');

    const t2 = await tick();
    eq([t2.seeded, t2.claimed, t2.published, t2.sharedReady, llmCalls], [0, 0, 0, 0, 0], 'duplicate cron: nothing new');
    eq((await q('select count(*)::int as n from bobby_briefs where period_key = $1', [P1.periodKey]))[0].n, 3, 'still exactly 3 reports');

    // 08:00 arrives (time travel: the window moves, SQL reads it from the rows). APNs not configured yet → filled, not claimed.
    await q("update bobby_briefs set scheduled_at = now() - interval '1 minute' where period_key = $1", [P1.periodKey]);
    due = [shift(P1, -22)];
    apnsOn = false;
    const t3 = await tick();
    eq([t3.dispatched, sent.length, t3.budget?.includes('apns_unconfigured')], [0, 0, true], 'APNs config missing → nothing claimed or sent');
    const filled = await q("select identity_id, device_id, state from bobby_brief_outbox where state = 'pending'");
    eq(filled.length, 5, 'intents filled for A1, AX, B1, C1, C2 (denied device and non-Pro/opted-out excluded)');

    // A→B: A's extra device is re-bound to B (new owner, new token) before dispatch.
    const newToken = hex();
    const rebind = await dbMod.rebindDevice(B, dAX.registrationId, 1, sha(dAX.proof), sha(hex()), {
      tokenCiphertext: encryptToken(newToken, MASTER), tokenFingerprint: tokenFingerprint(newToken, APNS.topic, 'production', MASTER), environment: 'production', topic: APNS.topic, permission: 'authorized', appBuild: 53,
    }, 5);
    eq(rebind.ok, true, 'device re-bound A → B');
    eq((await one("select state from bobby_brief_outbox where device_id = $1 and identity_id = $2", [dAX.registrationId, A])).state, 'cancelled', "A's unsent intent for the re-bound device cancelled");

    apnsOn = true;
    apnsAnswer = (n) => (n.token === dC2.token ? { outcome: 'invalid_token', status: 410, reason: 'Unregistered' } : { outcome: 'accepted', status: 200, reason: null });
    const t4 = await tick();
    const briefOf = Object.fromEntries((await briefsOf(P1)).map((r) => [r.identity_id, r]));
    const ids = Object.fromEntries((await q('select id, identity_id from bobby_briefs where period_key = $1', [P1.periodKey])).map((r) => [r.identity_id, r.id]));
    eq(sent.map((n) => n.token).sort(), [dA1.token, newToken, dB1.token, dC1.token, dC2.token].sort(), 'one APNs per active authorized device (A1, AX→B new token, B1, C1, C2)');
    eq(sent.find((n) => n.token === newToken)?.briefId, ids[B], "the re-bound device received B's briefing only");
    eq(sent.find((n) => n.token === dB1.token)?.language, 'es', "B's push is in Spanish");
    ok(!sent.some((n) => n.briefId === ids[A] && n.token === newToken) && Object.keys(briefOf).length === 3, "A's report never went to B's device");
    eq([t4.dispatched, t4.accepted], [5, 4], 'tick counts: 5 sent, 4 accepted');
    eq((await q("select state, count(*)::int as n from bobby_brief_outbox group by state order by state")).map((r) => [r.state, r.n]), [['cancelled', 1], ['failed', 1], ['sent', 4]], 'outbox: 4 sent, 1 invalid token failed, 1 cancelled (A→B)');
    eq((await one('select status from bobby_push_devices where id = $1', [dC2.registrationId])).status, 'invalid', 'APNs 410 invalidated that binding');
    const apnsIds = new Set(sent.map((n) => n.apnsId));
    eq(apnsIds.size, 5, 'each delivery has its own stable apns-id');

    const sentBefore = sent.length;
    const t5 = await tick();
    eq([t5.dispatched, sent.length - sentBefore], [0, 0], 'replayed dispatch tick sends nothing');
    // Main-scenario accounts leave the morning cadence so the next scenarios stay readable.
    for (const id of [A, B, C]) { const s = await dbMod.getSettings(id); await dbMod.patchSettings(id, s.revision, { weeklyEnabled: false }); }

    // ---------- Pro expiry between publish and dispatch ----------
    const E = await account({ pro: true, patch: { weeklyEnabled: true } });
    const dE = await device(E);
    const P2 = period({ readyBy: 20, scheduled: 21, expires: 50 });
    due = [P2];
    const e1 = await tick();
    eq([e1.seeded, e1.published], [1, 1], 'E published while Pro');
    await q("update bobby_briefs set scheduled_at = now() - interval '1 minute' where period_key = $1", [P2.periodKey]);
    due = [shift(P2, -22)];
    apnsOn = false;
    await tick(); // fills E's intent
    eq((await one("select count(*)::int as n from bobby_brief_outbox o join bobby_briefs b on b.id = o.brief_id where b.period_key = $1 and o.state = 'pending'", [P2.periodKey])).n, 1, "E's intent filled while Pro");
    await setPro(pool, E, false);
    apnsOn = true;
    const before2 = sent.length;
    const e2 = await tick();
    eq([sent.length - before2, e2.dispatched, sent.some((n) => n.token === dE.token)], [0, 0, false], 'Pro expired → no push');
    eq((await one("select o.state from bobby_brief_outbox o join bobby_briefs b on b.id = o.brief_id where b.period_key = $1", [P2.periodKey])).state, 'cancelled', 'the intent was cancelled at claim');
    await setPro(pool, E, true);
    { const s = await dbMod.getSettings(E); await dbMod.patchSettings(E, s.revision, { weeklyEnabled: false }); }

    // ---------- memory pause before publish → recomposed without memory ----------
    process.env.BOBBY_BRIEFINGS_MEMORY = 'on';
    const M = await account({ pro: true, patch: { weeklyEnabled: true, analysisConsentEnabled: true, analysisConsentVersion: 1 } });
    await q("insert into bobby_user_prefs (identity_id, experience, risk) values ($1, 'new', 'high')", [M]);
    await q("insert into bobby_user_assets (identity_id, symbol, asks, last_asked_at) values ($1, 'SOL', 3, now())", [M]);
    const P3 = period({ readyBy: 20, scheduled: 21, expires: 50 });
    due = [P3];
    const codes: string[] = [];
    let paused = false;
    dbOverride = {
      publishBrief: async (p) => {
        if (!paused) { paused = true; await q('update bobby_user_prefs set memory_enabled = false where identity_id = $1', [M]); }
        const r = await dbMod.publishBrief(p);
        codes.push(r.ok ? 'ok' : (r as { code: string }).code);
        return r;
      },
    };
    const m1 = await tick();
    dbOverride = {};
    const [mRow] = await briefsOf(P3);
    const mAssets = (mRow.content as { sections: Array<{ kind: string; symbol?: string }> }).sections.filter((s) => s.kind === 'asset').map((s) => s.symbol);
    ok(codes.length === 2 && ['stale_fence', 'privacy_changed'].includes(codes[0]) && codes[1] === 'ok', `memory paused mid-flight: first publish refused (${codes.join(',')}), then republished`);
    eq([mRow.state, mRow.uses_memory, mRow.memory_assets, mAssets.includes('SOL'), m1.published], ['ready', false, [], false, 1], 'recomposed without memory: no SOL, uses_memory false');
    // Control: with memory on, the frequent asset shapes a report.
    await q('update bobby_user_prefs set memory_enabled = true where identity_id = $1', [M]);
    const P3b = period({ readyBy: 20, scheduled: 21, expires: 50 });
    due = [P3b];
    await tick();
    const [mRow2] = await briefsOf(P3b);
    eq([mRow2.uses_memory, mRow2.memory_assets], [true, ['SOL']], 'control: with memory on the report used SOL from memory');
    delete process.env.BOBBY_BRIEFINGS_MEMORY;
    { const s = await dbMod.getSettings(M); await dbMod.patchSettings(M, s.revision, { weeklyEnabled: false }); }

    // ---------- missed cron: the push window passed ----------
    const F = await account({ pro: true, patch: { weeklyEnabled: true } });
    const dF = await device(F);
    const P5 = period({ readyBy: 20, scheduled: 21, expires: 50 });
    due = [P5];
    await tick();
    await q("update bobby_briefs set scheduled_at = now() - interval '1 minute' where period_key = $1", [P5.periodKey]);
    due = [shift(P5, -22)];
    apnsOn = false;
    await tick(); // F's intent filled, APNs paused
    const G = await account({ pro: true, patch: { weeklyEnabled: true } });
    await dbMod.seedPeriod(shift(P5, -22)); // G's report seeded but never prepared
    // The crons stop; the window passes.
    await q("update bobby_briefs set push_expires_at = now() - interval '1 minute', scheduled_at = now() - interval '31 minutes' where period_key = $1", [P5.periodKey]);
    await q("update bobby_brief_outbox o set expires_at = now() - interval '1 minute' from bobby_briefs b where b.id = o.brief_id and b.period_key = $1", [P5.periodKey]);
    due = [];
    apnsOn = true;
    const before5 = sent.length;
    const f1 = await tick();
    eq([sent.length - before5, f1.dispatched, sent.some((n) => n.token === dF.token)], [0, 0, false], 'missed cron: nothing sent after expiry');
    eq((await one("select o.state from bobby_brief_outbox o join bobby_briefs b on b.id = o.brief_id where b.period_key = $1", [P5.periodKey])).state, 'expired', "F's intent marked expired");
    eq((await one('select state, last_error from bobby_briefs where period_key = $1 and identity_id = $2', [P5.periodKey, G])), { state: 'failed', last_error: 'deadline' }, "G's never-prepared report failed at its deadline");
    ok(f1.expired >= 1 && f1.failed >= 1, 'tick counts the expiry and the deadline');
    for (const id of [F, G]) { const s = await dbMod.getSettings(id); await dbMod.patchSettings(id, s.revision, { weeklyEnabled: false }); }

    // ---------- unknown provider attempt → reconcile → one more attempt ----------
    setCaps(true);
    const U = await account({ pro: true, patch: { weeklyEnabled: true } });
    const P4 = period({ readyBy: 60, scheduled: 61, expires: 90 });
    due = [P4];
    llmCalls = 0;
    llmAnswer = (n) => (n === 1
      ? { ok: false, outcome: 'unknown', code: 'timeout', status: null, latencyMs: 40_000 }
      : { ok: true, value: MODEL_NARRATIVE, usd: 0.0012, estimated: false, usage: { tokensIn: 900, tokensOut: 300, latencyMs: 800 } });
    const u1 = await tick();
    const shared1 = await one('select id, state, attempts, last_error from bobby_brief_shared where period_key = $1', [P4.periodKey]);
    const workRef = `shared:${shared1.id}:gpt-4o-mini`;
    eq([llmCalls, u1.published, shared1.state, shared1.last_error], [1, 0, 'pending', 'provider_unknown'], 'unknown outcome → no report yet, narrative deferred');
    eq((await q('select state from bobby_brief_provider_attempts where work_ref = $1', [workRef])).map((r) => r.state), ['unknown'], 'the attempt is recorded as unknown');
    const u2 = await tick();
    eq([llmCalls, u2.published], [1, 0], 'next tick before the settle window: still no second paid attempt (work_unresolved)');
    ok(u2.budget?.includes('work_unresolved'), 'report carries work_unresolved');
    await q("update bobby_brief_provider_attempts set updated_at = now() - interval '10 minutes' where work_ref = $1", [workRef]);
    const u3 = await tick();
    eq((await q('select state from bobby_brief_provider_attempts where work_ref = $1 order by created_at', [workRef])).map((r) => r.state), ['settled_assumed', 'settled'], 'reconcile assumed the charge; the one allowed retry settled');
    eq([llmCalls, u3.published, u3.sharedReady], [2, 1, 1], 'retry answered → narrative ready, report published');
    const shared3 = await one('select state, narrative from bobby_brief_shared where period_key = $1', [P4.periodKey]);
    eq([shared3.state, shared3.narrative.source], ['ready', 'model'], 'the shared narrative is the model one');
    const third = await dbMod.reserveAttempt({ kind: 'llm', workRef, provider: 'openai', model: 'gpt-4o-mini', reserveUsd: 0.01, dayCap: 5, monthCap: 50, maxSlots: 2, maxAttemptsPerWork: 2, worker: 'w' });
    eq(third, { ok: false, code: 'attempts_exhausted' }, 'a third attempt for the same work item is refused');
    setCaps(false);

    const e2eLogs = logLines.slice(e2eLogStart).join('\n');
    ok(![A, B, C, M, U, dA1.token, newToken, dB1.token].some((v) => e2eLogs.includes(v)), 'PG part: logs carry no identity or token');
    eq(fetchCalls, 0, 'PG part: no network call');
    console.log(`briefings-worker: PG part ${checks - unitChecks} checks`);
  } finally {
    dbMod.setBriefingRpc(null);
    await pool.end();
  }
}

// WORKER_TEST_LOGS=1 prints what the worker logged (stage names and codes only).
if (process.env.WORKER_TEST_LOGS) console.log(logLines.join('\n'));
console.log(`briefings-worker: ${checks} checks passed`);
