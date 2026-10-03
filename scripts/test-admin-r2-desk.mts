// The desk's outcomes for the owner's funnel (admin truth r2, WP4), without a network or a database:
//   · every exit of api/desk-debate.ts after validation records exactly one bobby_record_outcome, with the event
//     and detail of the exit table (spec 3.6); a 405, a foreign origin or a 400 records none (F11);
//   · the outcome is recorded after the response was sent, registered with waitUntil, and the handler only
//     resolves once the RPC answered (never on the reader's time, never lost when the instance freezes);
//   · a reader who closes the request before the answer is read_abandoned/left with the allowance given back,
//     never read_failed — whether the last call was in flight (returned) or the next role refused to start
//     (thrown) (F11);
//   · a signed-in account refused by the spend guard, from iOS without an install id, still carries its
//     account (F06).
import assert from 'node:assert/strict';

process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_ANON_KEY = 'test-anon';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
process.env.OPENAI_API_KEY = 'test-openai';
process.env.ANTHROPIC_API_KEY = 'test-anthropic';
process.env.BOBBY_PROTOCOL_BASE_URL = 'https://bobby.test';
process.env.RATE_LIMIT_SALT = 'test-salt';
process.env.BOBBY_LLM_PRIMARY = 'openai';
for (const key of ['BOBBY_DESK_MODEL', 'BOBBY_MEMORY', 'BOBBY_AUTH_URL', 'BOBBY_AUTH_ANON_KEY', 'BOBBY_PAYWALL', 'RESEND_API_KEY']) delete process.env[key];

// The Vercel request context @vercel/functions reads: what the handler hands to waitUntil.
const registered: Array<{ settled: boolean }> = [];
(globalThis as unknown as Record<symbol, unknown>)[Symbol.for('@vercel/request-context')] = {
  get: () => ({
    waitUntil: (p: Promise<unknown>) => {
      const entry = { settled: false };
      registered.push(entry);
      p.then(() => { entry.settled = true; }, () => { entry.settled = true; });
    },
  }),
};

const { default: deskHandler } = await import('../api/desk-debate.ts');
const { resetLlmSpendCache } = await import('../api/_lib/llm-usage.ts');

const original = globalThis.fetch;
const originalError = console.error;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const eq = (got: unknown, want: unknown, what: string) => { assert.deepEqual(got, want, what); checks++; };
const ok = (v: unknown, what: string) => { assert.ok(v, what); checks++; };
const H = 3600_000;
const hostOf = (url: string) => { try { return new URL(url).hostname; } catch { return ''; } };

const FIXTURE_AUTH_ID = '00000000-0000-4000-8000-000000000052';
const OWNER = '7c1d9e2f-3a4b-4c5d-8e6f-708192a3b4c5';
const ALPHA = 'The recent structure supports a conditional long if the range breaks.';
const RED = 'The break has not happened and the higher timeframes are still flat.';
const SYN = { headline: 'Not yet: BTC is still inside its range.', why: 'Alpha needs a break the chart has not shown.', risk: 'The weekly view is flat, so a break can fail.', watch: 'A 4H close above the range high.', watchLevel: 0, followUp: 'What if BTC loses the range low?' };
const CIO = { analysis: 'The evidence does not support a clear case yet; wait for the range to resolve.', verdict: 'wait', direction: 'none', synthesis: SYN };
const GUARANTEE = { ...CIO, analysis: 'The trend is strong and the return is guaranteed if support holds, so a long merits review.', verdict: 'review', direction: 'long' };
const candles = Array.from({ length: 100 }, (_, i) => ({ ts: Date.now() - (100 - i) * H, open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 5 }));

interface Call { url: string; body: any; method: string }
type Role = 'alpha' | 'red' | 'cio';
interface Scenario {
  spend?: { day: number; month: number };
  /** bobby_consume_level's answer; 'down' = storage unreachable. */
  level?: Record<string, unknown> | 'down';
  /** bobby_consume_read's answer; 'down' = storage unreachable. */
  read?: Record<string, unknown> | 'down';
  quota?: boolean | 'down';
  model?: 'ok' | 'http' | 'rejected' | 'incomplete';
  /** Runs when the given role's model call arrives (the reader closes the request there). */
  during?: { role: Role; run: () => void };
}

const response = () => ({
  statusCode: 200, body: null as any, headers: {} as Record<string, string>, chunks: [] as string[], writableEnded: false, writableFinished: false,
  closeListener: null as null | (() => void),
  setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; }, status(n: number) { this.statusCode = n; return this; },
  json(v: unknown) { this.body = v; this.writableEnded = true; this.writableFinished = true; return this; },
  on(event: string, fn: () => void) { if (event === 'close') this.closeListener = fn; return this; },
  flushHeaders() {}, write(c: string) { this.chunks.push(c); return true; }, end() { this.writableEnded = true; this.writableFinished = true; return this; },
  lines() { return this.chunks.join('').split('\n').filter(Boolean).map((l) => JSON.parse(l)); },
  /** The reader closes the connection before the response finished (what Node reports as 'close'). */
  leave() { this.closeListener?.(); },
});
type Res = ReturnType<typeof response>;

const request = (method: string, body: unknown, headers: Record<string, string | undefined> = {}) => ({
  method, body,
  headers: Object.fromEntries(Object.entries({ origin: 'https://bobbyprotocol.xyz', 'x-forwarded-for': '10.9.0.7', 'x-bobby-device': 'device-1234567890abcdef', ...headers }).filter(([, v]) => v !== undefined)),
});

let calls: Call[] = [];
let unexpected: string[] = [];
let release: (() => void) | null = null;
let outcomeAnswered = false;
const outcomeCalls = () => calls.filter((c) => c.url.includes('rpc/bobby_record_outcome'));
const byRole = (c: Call): Role => {
  const text = hostOf(c.url) === 'api.anthropic.com' ? c.body.system : c.body.messages[0].content;
  return /Your role is CIO/.test(text) ? 'cio' : /Red Team: challenge/.test(text) ? 'red' : 'alpha';
};
const openai = (content: unknown, finish = 'stop') => json({ choices: [{ finish_reason: finish, message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
const claude = (content: unknown) => json({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(content) }], usage: { input_tokens: 100, output_tokens: 20 } });

function mock(s: Scenario) {
  calls = []; unexpected = []; release = null; outcomeAnswered = false;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const call: Call = { url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null, method: init?.method ?? 'GET' };
    calls.push(call);
    const { url } = call;
    // The funnel RPC is held until the test releases it: the handler must already have answered the reader.
    if (url.includes('rpc/bobby_record_outcome')) {
      await new Promise<void>((resolve) => { release = resolve; });
      outcomeAnswered = true;
      return new Response(null, { status: 204 });
    }
    if (url === 'https://db.test/auth/v1/user') return json({ id: FIXTURE_AUTH_ID, email: 'owner@bobby.test', app_metadata: { provider: 'apple' }, user_metadata: {} });
    if (url.includes('bobby_identities?on_conflict=auth_user_id')) return json([{ id: OWNER, auth_user_id: FIXTURE_AUTH_ID, wallet_address: null }], 201);
    if (url.includes('rpc/bobby_llm_spend')) return json(s.spend ?? { day: 0, month: 0 });
    if (url.includes('rpc/bobby_consume_level')) {
      if (s.level === 'down') return json({ message: 'unavailable' }, 503);
      return json({ allowed: true, code: null, useId: 77, tier: 'free', used: 1, limit: 3, resetsAt: null, ...s.level });
    }
    if (url.includes('rpc/bobby_consume_read')) {
      if (s.read === 'down') return json({ message: 'unavailable' }, 503);
      return json({ allowed: true, code: null, readId: 88, tier: 'free', used: 1, limit: 10, ...s.read });
    }
    if (url.includes('bobby_reads?id=eq.') && call.method === 'DELETE') return json([]);
    if (url.includes('bobby_level_uses?id=eq.') && call.method === 'DELETE') return json([]);
    if (url.includes('rpc/bobby_consume_desk_quota')) return s.quota === 'down' ? json({}, 503) : json(s.quota ?? true);
    if (url.includes('bobby_desk_quotas?')) return json([]);
    if (url.includes('bobby_llm_usage') || url.includes('/rest/v1/agent_events')) return new Response(null, { status: 201 });
    if (url.includes('/api/okx-candles')) return json({ candles });
    if (url.includes('okx.com/api/v5/public')) return json({ data: [] });
    if (url.includes('forum_threads')) return json([]);
    if (hostOf(url) === 'api.openai.com' || hostOf(url) === 'api.anthropic.com') {
      const role = byRole(call);
      if (s.during?.role === role) s.during.run();
      if (s.model === 'http') return json({ error: { message: 'bad request' } }, 400);
      const content = role === 'alpha' ? { analysis: ALPHA } : role === 'red' ? { analysis: RED } : s.model === 'rejected' ? GUARANTEE : CIO;
      if (hostOf(url) === 'api.anthropic.com') return claude(content);
      return openai(content, s.model === 'incomplete' ? 'length' : 'stop');
    }
    unexpected.push(url);
    throw new Error(`Unexpected request ${url}`);
  }) as typeof fetch;
}

async function until(done: () => boolean, ms = 5000) {
  const end = Date.now() + ms;
  while (!done()) { if (Date.now() > end) throw new Error('timed out'); await sleep(1); }
}

interface Run { res: Res; outcomes: any[]; held: { finished: boolean; sent: boolean; pendingWaits: number } | null; allSettled: boolean; logs: string[] }
/** Drives one request; the outcome RPC is held until everything else settled, then released. */
async function drive(method: string, body: unknown, headers: Record<string, string | undefined> = {}, scenario: Scenario = {}, onRes?: (res: Res) => void): Promise<Run> {
  resetLlmSpendCache();
  mock(scenario);
  registered.length = 0;
  const res = response();
  onRes?.(res);
  const logs: string[] = [];
  console.error = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
  let finished = false;
  const run = deskHandler(request(method, body, headers) as never, res as never).then(() => { finished = true; });
  let held: Run['held'] = null;
  try {
    await until(() => outcomeCalls().length > 0 || finished);
    if (outcomeCalls().length > 0) {
      await sleep(25);
      held = { finished, sent: res.writableEnded, pendingWaits: registered.filter((e) => !e.settled).length };
      release!();
    }
    await run;
  } finally {
    console.error = originalError;
  }
  eq(unexpected, [], 'no unexpected request');
  return { res, outcomes: outcomeCalls().map((c) => c.body), held, allSettled: registered.every((e) => e.settled), logs };
}

/** Exactly one outcome with this event/detail, sent after the response, registered with waitUntil, awaited. */
function one(run: Run, event: string, detail: string | null, what: string, opts: { answered?: boolean } = {}) {
  eq(run.outcomes.map((o) => [o.p_event, o.p_detail]), [[event, detail]], `${what}: exactly one outcome ${event}/${detail}`);
  ok(run.held && !run.held.finished, `${what}: the handler waits for the outcome RPC`);
  if (opts.answered !== false) ok(run.held!.sent, `${what}: the reader was answered before the outcome RPC finished`);
  eq(run.held!.pendingWaits, 1, `${what}: the pending outcome is registered with waitUntil`);
  ok(outcomeAnswered && run.allSettled, `${what}: the RPC answered before the handler resolved`);
  ok(!run.logs.some((l) => l.includes('exit without outcome')), `${what}: no exit reached the safety net`);
}

const ASK = { symbol: 'BTC', question: 'Is this real?' };
const deviceHash = (o: any) => typeof o.p_device === 'string' && /^[0-9a-f]{24}$/.test(o.p_device);

try {
  // ---------- not a desk attempt: no outcome, no call at all ----------
  for (const [label, method, body, headers, status] of [
    ['405', 'GET', ASK, {}, 405],
    ['foreign origin', 'POST', ASK, { origin: 'https://evil.test' }, 403],
    ['invalid_request', 'POST', { symbol: 'BTC' }, {}, 400],
    ['question_too_long', 'POST', { symbol: 'BTC', question: 'x'.repeat(1201) }, {}, 400],
  ] as const) {
    const r = await drive(method, body, headers);
    eq([r.res.statusCode, r.held, calls.length], [status, null, 0], `${label}: ${status}, no outcome, no call`);
  }

  // ---------- refusals before any spend ----------
  delete process.env.OPENAI_API_KEY; delete process.env.ANTHROPIC_API_KEY;
  {
    const r = await drive('POST', ASK);
    eq([r.res.statusCode, r.res.body.code], [503, 'desk_unavailable'], 'no provider keys: desk_unavailable');
    one(r, 'desk_blocked', 'no_provider_keys', 'no provider keys');
    eq(calls.map((c) => c.url), ['https://db.test/rest/v1/rpc/bobby_record_outcome'], 'no provider keys: nothing but the outcome (no ledger, no meter)');
  }
  process.env.OPENAI_API_KEY = 'test-openai'; process.env.ANTHROPIC_API_KEY = 'test-anthropic';

  {
    const r = await drive('POST', ASK, {}, { spend: { day: 0, month: 400 } });
    eq([r.res.statusCode, r.res.body.code], [503, 'budget_paused'], 'monthly cap: budget_paused');
    one(r, 'desk_blocked', 'budget_paused', 'monthly cap');
    ok(deviceHash(r.outcomes[0]) && r.outcomes[0].p_identity === null, 'a guest pause keeps its install, no account');
  }
  {
    const r = await drive('POST', { ...ASK, level: 'maximo' }, {}, { spend: { day: 20, month: 20 } });
    eq([r.res.statusCode, r.res.body.code], [503, 'budget_paused'], 'daily cap: premium paused');
    one(r, 'desk_blocked', 'premium_paused', 'daily cap');
  }

  // F06: the owner's account on iOS (Bearer, no install id) paused by the spend guard is still the owner.
  for (const [spend, level, detail] of [[{ day: 0, month: 400 }, 'rapido', 'budget_paused'], [{ day: 20, month: 20 }, 'profundo', 'premium_paused']] as const) {
    const r = await drive('POST', { ...ASK, level }, { authorization: 'Bearer owner-access-token', 'x-bobby-platform': 'ios', 'x-bobby-device': undefined }, { spend });
    eq([r.res.statusCode, r.res.body.code], [503, 'budget_paused'], `F06 ${detail}: refused`);
    one(r, 'desk_blocked', detail, `F06 ${detail}`);
    eq([r.outcomes[0].p_identity, r.outcomes[0].p_device, r.outcomes[0].p_platform], [OWNER, null, 'ios'], `F06 ${detail}: the outcome carries the signed account (no install id to fall back on)`);
    eq(calls.filter((c) => c.url.includes('/auth/v1/user')).length, 1, `F06 ${detail}: the account is verified once`);
  }

  {
    const r = await drive('POST', ASK, { 'x-forwarded-for': undefined });
    eq([r.res.statusCode, r.res.body.code], [503, 'desk_unavailable'], 'no client address: desk_unavailable');
    one(r, 'desk_blocked', 'no_address', 'no client address');
  }
  {
    const r = await drive('POST', { ...ASK, level: 'profundo' }, {}, { level: 'down' });
    eq([r.res.statusCode, r.res.body.code], [503, 'desk_unavailable'], 'level meter down: desk_unavailable');
    one(r, 'desk_blocked', 'level_unavailable', 'level meter down');
    ok(!calls.some((c) => c.url.includes('rpc/bobby_consume_read')), 'level meter down: no general read spent');
  }

  // ---------- walls and meters ----------
  for (const [code, level, event, detail] of [
    ['signin_required', 'profundo', 'wall_signin', 'profundo'],
    ['upgrade_required', 'profundo', 'wall_level', 'profundo-upgrade_required'],
    ['level_exhausted', 'maximo', 'wall_level', 'maximo-level_exhausted'],
  ] as const) {
    const r = await drive('POST', { ...ASK, level }, {}, { level: { allowed: false, code, useId: null } });
    eq([r.res.statusCode, r.res.body.code], [403, code], `level refused (${code}): 403`);
    one(r, event, detail, `level refused (${code})`);
  }
  {
    // A signed account's level refusal carries the account resolved once, before the meter.
    const r = await drive('POST', { ...ASK, level: 'profundo' }, { authorization: 'Bearer owner-access-token' }, { level: { allowed: false, code: 'upgrade_required', useId: null } });
    one(r, 'wall_level', 'profundo-upgrade_required', 'signed level refusal');
    eq([r.outcomes[0].p_identity, calls.find((c) => c.url.includes('rpc/bobby_consume_level'))!.body.p_identity], [OWNER, OWNER], 'the meter and the outcome see the same account');
  }
  for (const [read, status, event, detail] of [
    [{ allowed: false, code: 'signin_required', readId: null }, 401, 'wall_signin', 'rapido'],
    [{ allowed: false, code: 'subscription_required', readId: null }, 402, 'wall_paywall', 'rapido'],
    ['down', 503, 'desk_blocked', 'unavailable'],
  ] as const) {
    const r = await drive('POST', ASK, {}, { read });
    eq(r.res.statusCode, status, `read refused (${detail}): ${status}`);
    one(r, event, detail, `read refused (${event})`);
  }
  {
    const r = await drive('POST', { ...ASK, level: 'profundo' }, {}, { read: { allowed: false, code: 'subscription_required', readId: null } });
    one(r, 'wall_paywall', 'profundo', 'read refused after a premium use');
    ok(calls.some((c) => c.method === 'DELETE' && c.url.includes('bobby_level_uses?id=eq.77')), 'the premium use is given back');
  }
  {
    const r = await drive('POST', ASK, {}, { quota: 'down' });
    eq([r.res.statusCode, r.res.body.code], [503, 'desk_unavailable'], 'quota storage down: desk_unavailable');
    one(r, 'desk_blocked', 'unavailable', 'quota storage down');
  }
  {
    const r = await drive('POST', ASK, {}, { quota: false });
    eq([r.res.statusCode, r.res.body.code], [429, 'daily_limit'], 'quota exhausted: 429');
    one(r, 'desk_blocked', 'daily_limit', 'quota exhausted');
  }

  // ---------- answered ----------
  {
    const r = await drive('POST', ASK);
    eq([r.res.statusCode, r.res.body.agents.verdict], [200, 'wait'], 'JSON answer');
    one(r, 'read_done', 'rapido', 'JSON answer');
  }
  {
    const r = await drive('POST', { ...ASK, level: 'profundo' }, { accept: 'application/x-ndjson' });
    eq([r.res.statusCode, r.res.lines().at(-1).type], [200, 'final'], 'streamed answer');
    one(r, 'read_done', 'profundo', 'streamed answer');
  }

  // ---------- failed: thrown, the reader still there ----------
  for (const [model, detail] of [['http', 'provider_http'], ['rejected', 'output_rejected'], ['incomplete', 'analysis_error']] as const) {
    const r = await drive('POST', ASK, {}, { model });
    eq([r.res.statusCode, r.res.body.code], [503, 'analysis_failed'], `${detail}: 503 analysis_failed`);
    one(r, 'read_failed', detail, `${detail}`);
    ok(calls.some((c) => c.method === 'DELETE' && c.url.includes('bobby_reads?id=eq.88')), `${detail}: the read is given back`);
  }
  {
    const r = await drive('POST', { ...ASK, level: 'profundo' }, { accept: 'application/x-ndjson' }, { model: 'incomplete' });
    eq([r.res.lines().at(-1).type, r.res.lines().at(-1).code], ['error', 'analysis_failed'], 'streamed failure ends on an error line');
    one(r, 'read_failed', 'analysis_error', 'streamed failure');
  }

  // ---------- abandoned: the reader closed the request (F11) ----------
  for (const [label, level, live, role] of [
    // The CIO call was in flight: the debate returns, nobody is there to read it.
    ['returned, JSON', 'rapido', false, 'cio'],
    ['returned, stream', 'profundo', true, 'cio'],
    // Closed during Alpha: Red Team refuses to start ('Desk request closed') and the debate throws.
    ['thrown, JSON', 'rapido', false, 'alpha'],
    ['thrown, stream', 'profundo', true, 'alpha'],
  ] as const) {
    let res: Res | null = null;
    const r = await drive('POST', { ...ASK, level }, live ? { accept: 'application/x-ndjson' } : {}, { during: { role, run: () => res!.leave() } }, (x) => { res = x; });
    one(r, 'read_abandoned', 'left', `abandoned (${label})`, { answered: false });
    ok(calls.some((c) => c.method === 'DELETE' && c.url.includes('bobby_reads?id=eq.88')), `abandoned (${label}): the read is given back`);
    if (level !== 'rapido') ok(calls.some((c) => c.method === 'DELETE' && c.url.includes('bobby_level_uses?id=eq.77')), `abandoned (${label}): the premium use is given back`);
    ok(!r.logs.some((l) => l.includes('analysis_failed')), `abandoned (${label}): not logged as a failed analysis`);
    ok(!r.res.chunks.join('').includes('"type":"final"') && !r.res.chunks.join('').includes('"type":"error"'), `abandoned (${label}): no verdict and no error line written for nobody`);
    eq(calls.filter((c) => hostOf(c.url) === 'api.openai.com' || hostOf(c.url) === 'api.anthropic.com').map(byRole), role === 'alpha' ? ['alpha'] : ['alpha', 'red', 'cio'], `abandoned (${label}): no model call after the reader left`);
    // The ledger batch carries one 'left' marker ($0, provider 'none'): the dashboard counts the run as abandoned,
    // never as an analysis that failed (deskRuns.abandoned).
    const ledger = calls.filter((c) => c.url.includes('/rest/v1/bobby_llm_usage') && c.method === 'POST').map((c) => c.body as Array<Record<string, unknown>>);
    eq(ledger.length, 1, `abandoned (${label}): one ledger batch`);
    eq(ledger[0].at(-1), { surface: 'desk', level, role: 'left', provider: 'none', model: 'none', tokens_in: 0, tokens_out: 0, tokens_cached: 0, tokens_reasoning: 0,
      usd: 0, latency_ms: 0, stop: 'left', ok: false }, `abandoned (${label}): the batch ends with the 'left' marker`);
    eq(ledger[0].filter((x) => x.role === 'left').length, 1, `abandoned (${label}): exactly one marker`);
  }
  {
    // A delivered read writes no marker.
    const r = await drive('POST', ASK);
    eq(r.res.statusCode, 200, 'delivered: 200');
    const ledger = calls.filter((c) => c.url.includes('/rest/v1/bobby_llm_usage') && c.method === 'POST').map((c) => c.body as Array<Record<string, unknown>>);
    ok(ledger.length === 1 && !ledger[0].some((x) => x.role === 'left'), 'delivered: no abandoned marker in the ledger');
  }

  // Client receipts are issued only for completed requests from the new instrumented client.
  {
    const salt = process.env.RATE_LIMIT_SALT;
    process.env.RATE_LIMIT_SALT = 'offline-desk-client-receipt-salt-32';
    const { clientBinding, verifyClientReadReceipt } = await import('../api/_lib/client-telemetry.ts');
    const requestId = '00000000-0000-4000-8000-00000000cccc';
    const telemetryHeaders = { 'x-bobby-platform': 'web' };
    const binding = clientBinding(request('POST', ASK, telemetryHeaders) as never, null)!
    try {
      const old = await drive('POST', ASK);
      eq(old.res.body.telemetry, undefined, 'legacy desk response shape unchanged');
      const unstamped = await drive('POST', { ...ASK, requestId });
      eq(unstamped.res.body.telemetry, undefined, 'missing platform cannot mint an invented web receipt');
      const jsonResult = await drive('POST', { ...ASK, requestId }, telemetryHeaders);
      eq(jsonResult.res.statusCode, 200, 'instrumented JSON completes');
      eq(verifyClientReadReceipt(jsonResult.res.body.telemetry.receipt, binding)?.requestId, requestId,
        'real successful desk endpoint signs matching client request');
      ok(!jsonResult.logs.some(l => l.includes(jsonResult.res.body.telemetry.receipt)), 'read receipt is not logged');
      const streamed = await drive('POST', { ...ASK, requestId }, { ...telemetryHeaders, accept: 'application/x-ndjson' });
      const final = streamed.res.lines().find(l => l.type === 'final')!;
      eq(verifyClientReadReceipt(final.data.telemetry.receipt, binding)?.requestId, requestId, 'streamed final contains same binding protocol');
      for (const scenario of [{ quota: false }, { model: 'http' }, { model: 'rejected' }] as const) {
        const r = await drive('POST', { ...ASK, requestId }, telemetryHeaders, scenario);
        eq(r.res.body?.telemetry, undefined, 'refusal/failure cannot mint response receipt');
      }
      let res: Res | null = null;
      const abandoned = await drive('POST', { ...ASK, requestId }, telemetryHeaders,
        { during: { role: 'cio', run: () => res!.leave() } }, x => { res = x; });
      eq(abandoned.res.body?.telemetry, undefined, 'interrupted reading cannot mint receipt');
      eq(abandoned.outcomes[0].p_event, 'read_abandoned', 'receipt instrumentation preserves interruption outcome');
    } finally { process.env.RATE_LIMIT_SALT = salt; }
  }

  console.log(`admin-r2-desk: ${checks} checks passed`);
} finally {
  globalThis.fetch = original;
  console.error = originalError;
}
