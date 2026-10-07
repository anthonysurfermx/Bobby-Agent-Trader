// What POST /api/desk-debate sends to the models and answers for a question WITHOUT a thesis, captured through
// the real handler with the clock frozen and every network call stubbed. The capture is compared with
// scripts/fixtures/desk-plain-snapshot.json, which was written from the code before the 1.8 thesis review
// existed (commit 5ee241a9): a request from a shipped client (iOS 1.5-1.7, Android, the web) must keep producing
// the same model calls, the same prompts and the same reply, byte for byte.
//
//   npx tsx scripts/desk-plain-snapshot.mts            compare (exit 1 on any difference)
//   npx tsx scripts/desk-plain-snapshot.mts --write    rewrite the fixture (only when a change to the plain
//                                                      desk is intended; say so in the commit)
//
// It uses nothing the 1.8 change added, so it also runs unchanged on the commit before it.
// Rewritten once since, on purpose (2026-10-07, the next question): the CIO's prompt gained the next-question
// rule, a next question that breaks it is replaced in the reply by the fixed one of the reply's language (this
// world's CIO always answers in English, so the five non-English scenarios carry the fixed question), and a
// remembered reader is handed the finished change since their last ask instead of the stored price.
// And once more the same day, after the adversarial review: the next-question rule the CIO is told names the
// ticker, other people, suggestions, forecasts and plain market words. Nothing else moved.
// One key is left out of the compared reply on purpose: `memory` (the receipt of what memory kept), which
// 1.8 adds for an account whose memory applies. Everything around it must stay identical.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('./fixtures/desk-plain-snapshot.json', import.meta.url));
/** A Tuesday, mid-session in New York. */
export const FROZEN_NOW = Date.parse('2026-10-06T15:00:00.000Z');
const H = 3600_000, DAY = 86_400_000;

const ENV: Record<string, string> = {
  BOBBY_SUPABASE_URL: 'https://db.test', BOBBY_SUPABASE_ANON_KEY: 'test-anon', BOBBY_SUPABASE_SERVICE_ROLE_KEY: 'test-service',
  OPENAI_API_KEY: 'test-openai', ANTHROPIC_API_KEY: 'test-anthropic', BOBBY_PROTOCOL_BASE_URL: 'https://bobby.test', RATE_LIMIT_SALT: 'test-salt',
};
/**
 * Every switch the desk path reads from the environment (api/desk-debate.ts and what it imports). A scenario may
 * set some; every other run has them unset, whatever the shell that runs the capture carries.
 */
const SWITCHES = ['BOBBY_LLM_PRIMARY', 'BOBBY_MEMORY', 'BOBBY_THESIS_REVIEW', 'BOBBY_DESK_MODEL', 'BOBBY_AUTH_URL', 'BOBBY_AUTH_ANON_KEY', 'BOBBY_PAYWALL',
  'BOBBY_CLIENT_TELEMETRY', 'BOBBY_LLM_DAILY_CAP_USD', 'BOBBY_LLM_MONTHLY_CAP_USD', 'BOBBY_LLM_ALERT_USD', 'VERCEL_ENV'] as const;

interface Scenario {
  name: string;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
  env?: Partial<Record<(typeof SWITCHES)[number], string>>;
  live?: boolean;
}
export const SCENARIOS: Scenario[] = [
  { name: 'rapido-equity-en-json', body: { symbol: 'NVDA', assetType: 'equity', question: 'Is NVDA worth a look this week?' } },
  { name: 'rapido-crypto-es-ndjson', body: { symbol: 'BTC', assetType: 'crypto', question: '¿Cómo ves BTC para hoy?', language: 'es', locale: 'es-MX' }, live: true },
  { name: 'rapido-equity-daily-chart-de', body: { symbol: 'NVDA', assetType: 'equity', question: 'Wie sieht NVDA im Tageschart aus?', language: 'de' } },
  { name: 'rapido-openai-first-fr', body: { symbol: 'NVDA', assetType: 'equity', question: 'Que penses-tu de NVDA ce mois-ci ?', language: 'fr' }, env: { BOBBY_LLM_PRIMARY: 'openai' } },
  { name: 'profundo-crypto-en-ndjson', body: { symbol: 'BTC', assetType: 'crypto', question: 'Is BTC still in an uptrend over the next months?', level: 'profundo' }, live: true },
  { name: 'maximo-equity-pt-json', body: { symbol: 'NVDA', assetType: 'equity', question: 'A NVDA merece uma revisão esta semana?', language: 'pt', level: 'maximo' } },
  { name: 'rapido-memory-web-it', body: { symbol: 'NVDA', assetType: 'equity', question: 'Come vedi NVDA adesso?', language: 'it' }, headers: { authorization: 'Bearer good-apple-token', 'x-bobby-platform': 'web' }, env: { BOBBY_MEMORY: 'on' } },
  { name: 'rapido-ios-no-optin-en', body: { symbol: 'NVDA', assetType: 'equity', question: 'Is NVDA worth a look?' }, headers: { authorization: 'Bearer good-apple-token', 'x-bobby-platform': 'ios' }, env: { BOBBY_MEMORY: 'on' } },
];

const ALPHA = 'The recent structure supports a conditional long if the range breaks.';
const RED = 'The break has not happened and the higher timeframes are still flat.';
const REBUTTAL = 'Red Team is right that the break is unconfirmed; the case only holds above the range.';
const SYNTHESIS = { headline: 'Not yet: the price is still inside its range.', why: 'Alpha needs a break the chart has not shown.', risk: 'The higher timeframes are flat, so a break can fail.', watch: 'A close above the range high.', watchLevel: 0, followUp: 'What if the price loses the range low?' };
const CIO = { analysis: 'The evidence does not support a clear case yet; wait for the range to resolve.', verdict: 'wait', direction: 'none', synthesis: SYNTHESIS };
const SCENARIOS_REPLY = { confirm: 'A daily close above the range high with rising volume.', invalidate: 'A close back below the range low.' };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const hostOf = (url: string) => { try { return new URL(url).hostname; } catch { return ''; } };
const bars = (n: number, step: number, base: number) => Array.from({ length: n }, (_, i) => ({ ts: FROZEN_NOW - (n - i) * step, open: base + i, high: base + 2 + i, low: base - 1 + i, close: base + 1 + i, volume: 500 + i }));

interface Captured { models: Array<{ host: string; body: unknown }>; status: number; contentType: string | null; reply: string }
export type Snapshot = Record<string, Captured>;

function world(models: Captured['models']) {
  return (async (input: string | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method ?? 'GET';
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const host = hostOf(url);
    if (host === 'api.openai.com' || host === 'api.anthropic.com') {
      models.push({ host, body });
      const system: string = host === 'api.anthropic.com' ? body.system : body.messages[0].content;
      const schema = host === 'api.anthropic.com' ? body.output_config?.format?.schema : body.response_format?.json_schema?.schema;
      const content = /second round/.test(system) ? { analysis: REBUTTAL }
        : /Your role is CIO/.test(system) ? (schema?.properties?.scenarios ? { ...CIO, scenarios: SCENARIOS_REPLY } : CIO)
        : /Red Team: challenge/.test(system) ? { analysis: RED } : { analysis: ALPHA };
      return host === 'api.anthropic.com'
        ? json({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(content) }], usage: { input_tokens: 100, output_tokens: 20 } })
        : json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
    }
    if (url.includes('/auth/v1/user')) return headers.authorization === 'Bearer good-apple-token' ? json({ id: 'a11ce000-0000-4000-8000-000000000001', email: 'reader@example.com', app_metadata: { provider: 'apple' }, user_metadata: { full_name: 'Ana Reader' } }) : json({ msg: 'bad token' }, 401);
    if (url.includes('bobby_identities?on_conflict=auth_user_id')) return json([{ id: '0b8f0a52-0000-4000-8000-00000000c0de', auth_user_id: 'a11ce000-0000-4000-8000-000000000001', wallet_address: null }]);
    if (url.includes('rpc/bobby_memory_summary')) return json({
      enabled: true, prefs: { horizon: 'month', experience: 'new', risk: 'high' },
      top: [{ symbol: 'NVDA', asks: 7, lastAskedAt: new Date(FROZEN_NOW - 3 * DAY).toISOString(), lastHorizon: 'week' }, { symbol: 'BTC', asks: 4, lastAskedAt: new Date(FROZEN_NOW - DAY).toISOString(), lastHorizon: 'unspecified' }],
      // 250 then, 280 now: +12%, a move a stock makes. (The capture before 2026-10-07 stored 180, a +55.6% that the
      // desk now refuses to quote: a move that size between two asks reads as a split.)
      thisAsset: { asks: 7, lastAskedAt: new Date(FROZEN_NOW - 3 * DAY).toISOString(), lastHorizon: 'week', asksThisWeek: 1, lastPrice: 250 },
    });
    if (url.includes('rpc/bobby_memory_record')) return json(true);
    if (url.includes('rpc/bobby_consume_desk_quota')) return json(true);
    if (url.includes('rpc/bobby_consume_read')) return json({ allowed: true, code: null, readId: 1, tier: 'free', used: 1, limit: 10 });
    if (url.includes('rpc/bobby_consume_level')) return json({ allowed: true, code: null, useId: 91, tier: 'free', used: 1, limit: 3, resetsAt: null });
    if (url.includes('rpc/bobby_llm_spend')) return json({ day: 0, month: 0 });
    if (url.includes('rpc/bobby_record_outcome')) return json(null);
    if (url.includes('bobby_llm_usage')) return json(null, 201);
    if (url.includes('bobby_reads?id=eq.') && method === 'DELETE') return json([]);
    if (url.includes('bobby_level_uses?id=eq.') && method === 'DELETE') return json([]);
    if (url.includes('/api/stock-candles')) return json({ symbol: 'NVDA', currency: 'USD', exchange: 'NasdaqGS', candles: url.includes('interval=1d') ? bars(63, DAY, 400) : bars(100, H, 180) });
    if (url.includes('/api/okx-candles')) return json({ candles: url.includes('bar=1W') ? bars(60, 7 * DAY, 30_000) : url.includes('bar=1D') ? bars(100, DAY, 60_000) : url.includes('bar=4H') ? bars(100, 4 * H, 64_000) : bars(100, H, 65_000) });
    if (url.includes('okx.com/api/v5/public/funding-rate')) return json({ data: [{ fundingRate: '0.0001', nextFundingTime: String(FROZEN_NOW + 4 * H) }] });
    if (url.includes('okx.com/api/v5/public/open-interest')) return json({ data: [{ oiCcy: '31250.5' }] });
    if (url.includes('forum_threads')) return url.includes('resolution=in.')
      ? json([{ direction: 'long', entry_price: 61_000, target_price: 66_000, stop_price: 59_000, resolution: 'win', created_at: new Date(FROZEN_NOW - 12 * DAY).toISOString(), resolved_at: new Date(FROZEN_NOW - 9 * DAY).toISOString() }])
      : json([{ direction: 'none', entry_price: null, target_price: null, stop_price: null, resolution: null, created_at: new Date(FROZEN_NOW - DAY).toISOString(), resolved_at: null }]);
    throw new Error(`desk-plain-snapshot: unexpected request ${method} ${url}`);
  }) as typeof fetch;
}

/** Runs every scenario through the real handler and returns what was sent to the models and what was answered. */
export async function capturePlainSnapshot(): Promise<Snapshot> {
  const savedEnv = Object.fromEntries([...Object.keys(ENV), ...SWITCHES].map((k) => [k, process.env[k]]));
  const savedFetch = globalThis.fetch, savedNow = Date.now, savedError = console.error;
  const contextKey = Symbol.for('@vercel/request-context');
  const savedContext = (globalThis as Record<symbol, unknown>)[contextKey];
  const deferred: Promise<unknown>[] = [];
  (globalThis as Record<symbol, unknown>)[contextKey] = { get: () => ({ waitUntil: (p: Promise<unknown>) => { deferred.push(p); } }) };
  Object.assign(process.env, ENV);
  Date.now = () => FROZEN_NOW;
  const snapshot: Snapshot = {};
  try {
    const { default: handler } = await import('../api/desk-debate.ts');
    const { resetLlmSpendCache } = await import('../api/_lib/llm-usage.ts');
    for (const scenario of SCENARIOS) {
      for (const key of SWITCHES) delete process.env[key];
      Object.assign(process.env, scenario.env ?? {});
      resetLlmSpendCache();
      const models: Captured['models'] = [];
      globalThis.fetch = world(models);
      const res = {
        statusCode: 200, sent: null as unknown, headers: {} as Record<string, string>, chunks: [] as string[], writableEnded: false, writableFinished: false,
        setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; }, status(n: number) { this.statusCode = n; return this; },
        json(v: unknown) { this.sent = v; this.writableEnded = true; this.writableFinished = true; return this; },
        on() { return this; }, flushHeaders() {}, write(c: string) { this.chunks.push(c); return true; }, end() { this.writableEnded = true; this.writableFinished = true; return this; },
      };
      const headers = { origin: 'https://bobbyprotocol.xyz', 'x-forwarded-for': '10.9.0.2', 'x-bobby-device': 'device-1234567890abcdef', ...(scenario.live ? { accept: 'application/x-ndjson' } : {}), ...(scenario.headers ?? {}) };
      await handler({ method: 'POST', headers, body: scenario.body } as never, res as never);
      await Promise.all(deferred.splice(0));
      // The memory receipt is new in 1.8 and additive; the rest of the reply is compared as sent.
      const withoutReceipt = (body: unknown) => { const copy = { ...(body as Record<string, unknown>) }; delete copy.memory; return copy; };
      const reply = scenario.live
        ? res.chunks.join('').split('\n').filter(Boolean).map((line) => { const event = JSON.parse(line); return JSON.stringify(event.type === 'final' ? { ...event, data: withoutReceipt(event.data) } : event); }).join('\n')
        : JSON.stringify(withoutReceipt(res.sent));
      snapshot[scenario.name] = { models, status: res.statusCode, contentType: res.headers['content-type'] ?? null, reply };
    }
  } finally {
    globalThis.fetch = savedFetch;
    Date.now = savedNow;
    console.error = savedError;
    (globalThis as Record<symbol, unknown>)[contextKey] = savedContext;
    for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
  return snapshot;
}

export const readPlainFixture = (): Snapshot => JSON.parse(readFileSync(FIXTURE, 'utf8')) as Snapshot;

/** The first difference between the capture and the fixture, as an assertion error; returns the number of comparisons. */
export function assertPlainSnapshot(got: Snapshot, want: Snapshot = readPlainFixture()): number {
  let compared = 0;
  assert.deepEqual(Object.keys(got), Object.keys(want), 'the same scenarios as the fixture');
  for (const name of Object.keys(want)) {
    assert.equal(got[name].models.length, want[name].models.length, `${name}: the same number of model calls`);
    got[name].models.forEach((call, i) => {
      assert.equal(JSON.stringify(call), JSON.stringify(want[name].models[i]), `${name}: model call ${i + 1} is byte-identical (model, ceiling, schema, system prompt, input)`);
      compared++;
    });
    assert.deepEqual([got[name].status, got[name].contentType], [want[name].status, want[name].contentType], `${name}: the same status and content type`);
    assert.equal(got[name].reply, want[name].reply, `${name}: the reply is byte-identical`);
    compared += 2;
  }
  return compared;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const got = await capturePlainSnapshot();
  if (process.argv.includes('--write')) {
    writeFileSync(FIXTURE, `${JSON.stringify(got, null, 1)}\n`);
    console.log(`desk-plain-snapshot: wrote ${Object.keys(got).length} scenarios`);
  } else {
    console.log(`desk-plain-snapshot: ${assertPlainSnapshot(got)} comparisons identical across ${Object.keys(got).length} scenarios`);
  }
}
