// Regression contracts for App Review remediation. All transport and Edge synthesis are mocked.
// Run from the repository: node --import tsx scripts/test-app-review-remediation.mts
import assert from 'node:assert/strict';

process.env.BOBBY_SUPABASE_URL = 'https://database.invalid';
process.env.BOBBY_SUPABASE_ANON_KEY = 'test-anon';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
process.env.BOBBY_PROTOCOL_BASE_URL = 'https://market.invalid';
process.env.OPENAI_API_KEY = 'test-openai';
process.env.ANTHROPIC_API_KEY = 'test-anthropic';
process.env.RATE_LIMIT_SALT = 'remediation-only-test-salt';
process.env.TTS_PROVIDER = 'openai';
for (const key of ['BOBBY_CONTROL_SOURCE', 'BOBBY_WRITE_FREEZE', 'PROTOCOL_CUTOVER_FREEZE', 'BOBBY_MEMORY']) delete process.env[key];

const { checkPersistentLimit } = await import('../api/_lib/rate-limit-persistent.ts');
const { resetLlmSpendCache } = await import('../api/_lib/llm-usage.ts');
const { default: voiceHandler } = await import('../api/bobby-voice-free.ts');
const { default: deskHandler } = await import('../api/desk-debate.ts');
const { default: feedbackHandler } = await import('../api/feedback.ts');
const { Communicate } = await import('edge-tts-universal');

const originalFetch = globalThis.fetch;
const originalStream = Communicate.prototype.stream;
const originalError = console.error;
interface Call { url: string; method: string; body: any }
let calls: Call[] = [];
let edgeCalls = 0;
let checks = 0;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function eq(actual: unknown, expected: unknown, name: string) { assert.deepEqual(actual, expected, name); checks++; }
function ok(value: unknown, name: string) { assert.ok(value, name); checks++; }
function mock(reply: (call: Call) => Response | Promise<Response>) {
  calls = []; edgeCalls = 0;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const call = { url: String(input), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    return reply(call);
  }) as typeof fetch;
}
const response = () => ({
  statusCode: 200, body: null as any, headers: {} as Record<string, string>, chunks: [] as string[], writableEnded: false, writableFinished: false,
  setHeader(key: string, value: string) { this.headers[key.toLowerCase()] = value; },
  status(code: number) { this.statusCode = code; return this; },
  json(body: unknown) { this.body = body; this.writableEnded = this.writableFinished = true; return this; },
  send(body: unknown) { this.body = body; this.writableEnded = this.writableFinished = true; return this; },
  on() { return this; }, flushHeaders() {}, write(chunk: string) { this.chunks.push(chunk); return true; },
  end() { this.writableEnded = this.writableFinished = true; return this; },
  lines() { return this.chunks.join('').split('\n').filter(Boolean).map(line => JSON.parse(line)); },
});
const request = (body: any, headers: Record<string, string> = {}) => ({ method: 'POST', body, headers: {
  origin: 'https://bobbyprotocol.xyz', 'x-forwarded-for': '10.35.0.1', 'x-bobby-device': 'test-device-1234567890abcdef', 'x-bobby-platform': 'ios', ...headers,
} });
const paidCalls = () => calls.filter(call => /api\.openai\.com|api\.anthropic\.com/.test(call.url));

try {
  console.error = () => {}; // Failure diagnostics are expected; assertions identify any regression.
  // eslint-disable-next-line require-yield -- the mock Edge stream fails before producing audio.
  Communicate.prototype.stream = async function* () { edgeCalls++; throw new Error('mock Edge unavailable'); };

  // The paid TTS budget must fail closed, while unrelated callers retain the default policy.
  const storageFailures: Array<{ name: string; reply: (call: Call) => Response }> = [
    { name: 'GET storage failure', reply: () => json({ error: 'storage' }, 503) },
    { name: 'POST storage failure', reply: call => call.method === 'GET' ? json([]) : json({ error: 'write' }, 503) },
    { name: 'transport failure', reply: () => { throw new Error('mock transport failed'); } },
    { name: 'malformed rows', reply: () => json({ unexpected: true }) },
    { name: 'malformed JSON', reply: () => new Response('invalid-json') },
    { name: 'invalid counter', reply: () => json([{ payload: { count: -1 }, expires_at: new Date(Date.now() + 10000).toISOString() }]) },
    { name: 'invalid expiry', reply: () => json([{ payload: { count: 1 }, expires_at: 'invalid' }]) },
  ];
  for (const scenario of storageFailures) {
    mock(scenario.reply);
    const budget = await checkPersistentLimit('tts-global', 'global', 3000, 86400, { failClosed: true });
    eq([budget.limited, budget.remaining], [true, 0], `${scenario.name}: paid budget refuses`);
    mock(call => {
      if (call.url.includes('tts-global') || call.body?.cache_key === 'rl:tts-global:global') return scenario.reply(call);
      if (call.url.includes('/api_cache')) return call.method === 'GET' ? json([]) : json(null, 201);
      throw new Error(`Unexpected mocked request ${call.url}`);
    });
    const result = response();
    await voiceHandler(request({ text: 'A short reply.', lang: 'en' }) as never, result as never);
    eq([result.statusCode, edgeCalls, paidCalls().length], [502, 1, 0], `${scenario.name}: unavailable Edge never retries paid synthesis`);
  }
  mock(() => json({ error: 'storage' }, 503));
  eq((await checkPersistentLimit('ordinary-public-limit', 'test', 5, 60)).limited, false, 'ordinary callers preserve default fail-open');
  mock(call => call.method === 'GET' ? json([]) : json(null, 201));
  const allowed = await checkPersistentLimit('tts-global', 'global', 3000, 86400, { failClosed: true });
  eq([allowed.limited, allowed.remaining], [false, 2999], 'read plus persisted increment permits synthesis');
  eq(calls.at(-1)?.body.payload.count, 1, 'first hit is persisted before paid permission');

  mock(call => {
    if (call.url.includes('/api_cache')) return call.method === 'GET' ? json([]) : json(null, 201);
    if (call.url === 'https://api.openai.com/v1/audio/speech') return new Response(new Uint8Array([1, 2, 3]));
    throw new Error(`Unexpected mocked request ${call.url}`);
  });
  const voiced = response();
  await voiceHandler(request({ text: 'A short reply.', lang: 'en' }) as never, voiced as never);
  eq([voiced.statusCode, voiced.headers['x-tts-provider'], paidCalls().length, edgeCalls], [200, 'openai', 1, 0], 'valid budget preserves successful paid synthesis');
  mock(call => {
    if (call.url.includes('tts-global') && call.method === 'GET') return json([{ payload: { count: 3000 }, expires_at: new Date(Date.now() + 10000).toISOString() }]);
    if (call.url.includes('/api_cache')) return call.method === 'GET' ? json([]) : json(null, 201);
    throw new Error(`Unexpected mocked request ${call.url}`);
  });
  Communicate.prototype.stream = async function* () { edgeCalls++; yield { type: 'audio', data: new Uint8Array([4, 5]) } as never; };
  const freeVoice = response();
  await voiceHandler(request({ text: 'A short reply.' }) as never, freeVoice as never);
  eq([freeVoice.statusCode, freeVoice.headers['x-tts-provider'], paidCalls().length], [200, 'edge', 0], 'exhausted budget retains free synthesis');

  const personaBudget = response();
  await voiceHandler(request({ text: 'A short reply.', voice: 'ballad', mode: 'persona' }) as never, personaBudget as never);
  eq([personaBudget.statusCode, paidCalls().length, edgeCalls], [503, 0, 1], 'persona budget exhaustion never changes identity or spends paid budget');
  mock(call => {
    if (call.url.includes('/api_cache')) return call.method === 'GET' ? json([]) : json(null, 201);
    if (call.url === 'https://api.openai.com/v1/audio/speech') return json({ error: 'provider unavailable' }, 503);
    throw new Error(`Unexpected mocked request ${call.url}`);
  });
  const personaFailure = response();
  await voiceHandler(request({ text: 'A short reply.', voice: 'ballad', mode: 'persona' }) as never, personaFailure as never);
  eq([personaFailure.statusCode, paidCalls().length, edgeCalls], [502, 1, 0], 'persona provider failure stays explicit without Edge substitution');

  // Strict general access cannot be bypassed by removing a device header or exhausting a premium level.
  const candles = Array.from({ length: 100 }, (_, index) => ({ ts: Date.now() - (100 - index) * 3600000, open: 100 + index, high: 102 + index, low: 99 + index, close: 101 + index, volume: 5 }));
  function deskMock(options: { generalDenied?: boolean; generalStorageFailed?: boolean; levelDenied?: boolean; refundFailed?: boolean; failModel?: boolean } = {}) {
    resetLlmSpendCache();
    mock(call => {
      if (call.url.includes('rpc/bobby_llm_spend')) return json({ day: 0, month: 0 });
      if (call.url.includes('rpc/bobby_consume_desk_quota')) return json(true);
      if (call.url.includes('rpc/bobby_consume_level')) return json({ allowed: !options.levelDenied, code: options.levelDenied ? 'upgrade_required' : null, useId: options.levelDenied ? null : 77, tier: 'anon', used: 1, limit: 1 });
      if (call.url.includes('rpc/bobby_consume_read')) return options.generalStorageFailed ? json({ error: 'storage' }, 503) : json({ allowed: !options.generalDenied, code: options.generalDenied ? 'signin_required' : null, readId: options.generalDenied ? null : 88, tier: 'anon', used: options.generalDenied ? 3 : 1, limit: 3, remaining: options.generalDenied ? 0 : 2 });
      if (call.method === 'DELETE') return options.refundFailed ? json({ error: 'refund storage' }, 503) : json([]);
      if (call.url.includes('bobby_llm_usage')) return json(null, 201);
      if (call.url.includes('/api/okx-candles')) return json({ candles });
      if (call.url.includes('okx.com/api/v5/public') || call.url.includes('forum_threads')) return json({ data: [] });
      if (call.url.includes('api.openai.com')) return json({ choices: [{ finish_reason: options.failModel ? 'length' : 'stop', message: { content: JSON.stringify({ analysis: 'The range remains unresolved, so more evidence is needed.' }) } }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
      throw new Error(`Unexpected mocked request ${call.url}`);
    });
  }
  const question = { symbol: 'BTC', question: 'What should I watch?', language: 'en' };
  for (const device of ['', 'invalid']) {
    deskMock();
    const result = response();
    await deskHandler(request(question, { 'x-bobby-device': device }) as never, result as never);
    eq([result.statusCode, result.body.code], [401, 'signin_required'], 'missing/invalid device does not gain anonymous access');
    eq(paidCalls().length, 0, 'missing/invalid device reaches no model');
    ok(!calls.some(call => call.url.includes('rpc/bobby_consume_read')), 'no install id is inferred from a network address');
  }
  deskMock({ generalDenied: true });
  const exhausted = response();
  await deskHandler(request(question) as never, exhausted as never);
  eq([exhausted.statusCode, exhausted.body.code, paidCalls().length], [401, 'signin_required', 0], 'exhausted general guest allowance stops analysis before provider calls');
  eq(calls.filter(call => call.url.includes('rpc/bobby_consume_read')).length, 1, 'one general meter debit per request');

  deskMock({ levelDenied: true });
  const premiumDenied = response();
  await deskHandler(request({ ...question, level: 'profundo' }) as never, premiumDenied as never);
  eq([premiumDenied.statusCode, premiumDenied.body.code, paidCalls().length], [403, 'upgrade_required', 0], 'premium refusal reaches no model');
  ok(!calls.some(call => call.url.includes('rpc/bobby_consume_read')), 'premium refusal consumes no general read');

  deskMock({ generalDenied: true });
  const deniedAfterPremium = response();
  await deskHandler(request({ ...question, level: 'profundo' }) as never, deniedAfterPremium as never);
  eq([deniedAfterPremium.statusCode, paidCalls().length], [401, 0], 'a Deep allowance does not bypass an exhausted general allowance');
  ok(calls.some(call => call.method === 'DELETE' && call.url.includes('bobby_level_uses?id=eq.77')), 'general refusal returns the pre-consumed premium use');

  deskMock({ generalStorageFailed: true });
  const unavailable = response();
  await deskHandler(request(question) as never, unavailable as never);
  eq([unavailable.statusCode, unavailable.body.code, paidCalls().length], [503, 'desk_unavailable', 0], 'unavailable strict general meter does not permit unmetered calls');

  for (const refundFailed of [false, true]) {
    deskMock({ failModel: true, refundFailed });
    const streamed = response();
    await deskHandler(request({ ...question, level: 'profundo' }, { accept: 'application/x-ndjson' }) as never, streamed as never);
    const error = streamed.lines().find(line => line.type === 'error');
    eq([error?.code, error?.refunded], ['analysis_failed', !refundFailed], 'streamed refund acknowledgment matches actual persistence');
    eq(calls.filter(call => call.method === 'DELETE' && call.url.includes('bobby_reads?id=eq.88')).length, refundFailed ? 2 : 1, 'failed analysis refunds general allowance and retries a failed delete once');
    eq(calls.filter(call => call.method === 'DELETE' && call.url.includes('bobby_level_uses?id=eq.77')).length, refundFailed ? 2 : 1, 'failed analysis refunds premium allowance and retries a failed delete once');
    ok(!streamed.lines().some(line => line.type === 'final'), 'failed analysis emits no verdict');
  }

  // A private support acknowledgment proves saving, rather than a fire-and-forget email attempt.
  for (const outcome of ['failed', 'network', 'saved']) {
    mock(call => {
      if (call.url.includes('/api_cache')) return call.method === 'GET' ? json([]) : json(null, 201);
      if (call.url.includes('/user_feedback')) {
        if (outcome === 'network') throw new Error('mock support storage unreachable');
        return outcome === 'saved' ? json(null, 201) : json({ error: 'insert failed' }, 503);
      }
      if (call.url.includes('api.brevo.com')) return json({ messageId: 'mock-message' }, 201);
      throw new Error(`Unexpected mocked request ${call.url}`);
    });
    const result = response();
    await feedbackHandler(request({ message: 'Please help with a privacy request.', page: '/support', user_email: 'reply@example.test', context: { request_kind: 'privacy' } }) as never, result as never);
    eq([result.statusCode, result.body.ok, result.body.saved], outcome === 'saved' ? [200, true, true] : [503, false, false], 'private support acknowledges only persisted requests');
    eq(calls.filter(call => call.url.includes('api.brevo.com')).length, outcome === 'saved' ? 1 : 0, 'notification is scheduled only after persistence');
    eq(result.headers['cache-control'], 'private, no-store', 'support receipt is not cached');
  }

  console.log(`${checks} App Review remediation regression checks passed; real network/DB calls: 0`);
} finally {
  globalThis.fetch = originalFetch;
  Communicate.prototype.stream = originalStream;
  console.error = originalError;
}
