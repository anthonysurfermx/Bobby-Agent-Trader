import assert from 'node:assert/strict';
import { Communicate } from 'edge-tts-universal';

// The paid provider is configured deliberately: explicit free mode must never use it.
process.env.OPENAI_API_KEY = 'test-only-paid-key-must-not-be-used';
process.env.TTS_PROVIDER = 'openai';
process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_ANON_KEY = 'test-anon';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
process.env.SUPABASE_URL = 'https://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service';
delete process.env.TTS_EDGE_VOICE_EN;
delete process.env.TTS_EDGE_VOICE_ES;
delete process.env.TTS_EDGE_VOICE_PT;

const originalFetch = globalThis.fetch;
const originalStream = Communicate.prototype.stream;
const voices: string[] = [];
const dbWrites: string[] = [];
let paidCalls = 0;
let budgetLimited = false;
let providerOutage = false;
let cases = 0;

globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.hostname !== 'db.test') {
    paidCalls++;
    throw new Error(`Unexpected external provider: ${url.hostname}`);
  }
  assert.equal(url.pathname, '/rest/v1/api_cache');
  if (init?.method === 'POST') {
    dbWrites.push(String(init.body));
    return new Response(null, { status: 201 });
  }
  const isBudget = url.searchParams.get('cache_key') === 'eq.rl:tts-global:global';
  const payload = isBudget && budgetLimited
    ? [{ payload: { count: 3000 }, expires_at: new Date(Date.now() + 60_000).toISOString() }]
    : [];
  return new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } });
};
Communicate.prototype.stream = async function* () {
  const wireVoice = (this as unknown as { ttsConfig: { voice: string } }).ttsConfig.voice;
  const match = wireVoice.match(/^Microsoft Server Speech Text to Speech Voice \(([a-z]{2}-[A-Z]{2}), ([A-Za-z]+Neural)\)$/);
  assert.ok(match, 'Communicate must receive a valid provider voice');
  voices.push(`${match[1]}-${match[2]}`);
  if (providerOutage) throw new Error('Simulated Edge outage');
  yield { type: 'audio', data: new Uint8Array(1024) };
} as typeof originalStream;

try {
  const { default: handler } = await import('../api/bobby-voice-free.ts');
  async function call(body: Record<string, unknown>, method = 'POST') {
    const response = {
      statusCode: 0, headers: {} as Record<string, string>, body: null as any,
      setHeader(name: string, value: string) { this.headers[name] = value; },
      status(code: number) { this.statusCode = code; return this; },
      json(body: unknown) { this.body = body; return this; },
      send(body: unknown) { this.body = body; return this; },
    };
    await handler({ method, headers: { 'x-forwarded-for': `192.0.2.${++cases}` }, socket: {}, body: { text: 'Bobby', mode: 'free', ...body } } as never, response as never);
    return response;
  }
  async function rejected(body: Record<string, unknown>, status = 400, error = 'Unsupported locale') {
    const before = voices.length;
    const writesBefore = dbWrites.length;
    const response = await call(body);
    assert.equal(response.statusCode, status);
    assert.deepEqual(response.body, { error });
    assert.equal(voices.length, before, 'Rejected input must not reach synthesis');
    assert.ok(dbWrites.slice(writesBefore).every((write) => !JSON.parse(write).cache_key.startsWith('rl:tts-global:')), 'Rejected input must not consume the synthesis budget');
  }
  // This is the regression: a supported locale from a different language must not be silently replaced.
  await rejected({ lang: 'fr', locale: 'pt-BR' });
  const regions = [
    ['en', 'en-US', 'en-US-AriaNeural'], ['en', 'en-GB', 'en-US-AriaNeural'],
    ['en', 'en-AU', 'en-US-AriaNeural'], ['en', 'en-CA', 'en-US-AriaNeural'],
    ['en', 'en-IE', 'en-US-AriaNeural'], ['es', 'es-MX', 'es-MX-DaliaNeural'],
    ['es', 'es-ES', 'es-MX-DaliaNeural'], ['es', 'es-US', 'es-MX-DaliaNeural'],
    ['fr', 'fr-FR', 'fr-FR-DeniseNeural'], ['pt', 'pt-PT', 'pt-PT-RaquelNeural'],
    ['pt', 'pt-BR', 'pt-BR-FranciscaNeural'], ['it', 'it-IT', 'it-IT-ElsaNeural'],
    ['de', 'de-DE', 'de-DE-KatjaNeural'],
  ] as const;
  async function synthesized(body: Record<string, unknown>, expectedVoice: string) {
    const before = voices.length;
    const response = await call(body);
    assert.equal(response.statusCode, 200);
    assert.equal(voices.length, before + 1);
    assert.equal(voices.at(-1), expectedVoice);
    assert.equal(response.headers['Content-Type'], 'audio/mpeg');
    assert.equal(response.headers['X-TTS-Provider'], 'edge');
    assert.equal(response.headers['Cache-Control'], 'private, no-store');
    assert.equal(response.headers['X-RateLimit-Limit'], '60');
    assert.ok(Buffer.isBuffer(response.body));
    assert.equal(response.body.length, 1024);
    assert.equal(paidCalls, 0);
  }
  for (const [lang, locale, expectedVoice] of regions) await synthesized({ lang, locale }, expectedVoice);
  for (const [lang, expectedVoice] of [
    ['en', 'en-US-AriaNeural'], ['es', 'es-MX-DaliaNeural'], ['fr', 'fr-FR-DeniseNeural'],
    ['pt', 'pt-PT-RaquelNeural'], ['it', 'it-IT-ElsaNeural'], ['de', 'de-DE-KatjaNeural'],
  ]) await synthesized({ lang }, expectedVoice);
  await synthesized({}, 'es-MX-DaliaNeural');
  for (const [lang, locale] of [['en', 'es-MX'], ['es', 'en-US'], ['pt', 'it-IT'], ['it', 'de-DE'], ['de', 'fr-FR']]) {
    await rejected({ lang, locale });
  }
  for (const locale of ['', null, ['fr-FR'], 'fr-CA', 'FR_fr', 'fr-FR<script>']) await rejected({ lang: 'fr', locale });
  for (const lang of ['ja', 'fr-FR', null, ['fr']]) await rejected({ lang }, 400, 'Unsupported language');
  await rejected({ lang: 'fr', locale: 'fr-FR', text: '' }, 400, 'text is required');
  await rejected({ lang: 'fr', locale: 'fr-FR', text: 'a'.repeat(801) }, 413, 'text exceeds 800 characters');
  const method = await call({ lang: 'fr', locale: 'fr-FR' }, 'GET');
  assert.equal(method.statusCode, 405);
  budgetLimited = true;
  await synthesized({ lang: 'fr', locale: 'fr-FR' }, 'fr-FR-DeniseNeural');
  const beforePersona = voices.length;
  const persona = await call({ lang: 'fr', locale: 'fr-FR', mode: 'persona' });
  assert.equal(persona.statusCode, 503);
  assert.equal(voices.length, beforePersona, 'Budget circuit breaker must still block paid persona synthesis');
  providerOutage = true;
  for (const locale of ['pt-PT', 'pt-BR']) {
    const outage = await call({ lang: 'pt', locale });
    assert.equal(outage.statusCode, 502);
    assert.deepEqual(outage.body, { error: 'TTS synthesis failed' });
  }
  assert.equal(paidCalls, 0, 'Neither free success, outage nor budget exhaustion may call a paid provider');
  assert.ok(dbWrites.some((write) => JSON.parse(write).cache_key.startsWith('rl:bobby-voice-free:')), 'Public rate limiter remains active');
  assert.ok(dbWrites.some((write) => JSON.parse(write).cache_key === 'rl:tts-global:global'), 'Global synthesis budget remains active');
  console.log(`free-voice locales: ${cases} mocked handler cases passed; six languages, 13 native locales, omission, mismatch/invalid controls, budget and Edge outage; zero paid requests`);
} finally {
  globalThis.fetch = originalFetch;
  Communicate.prototype.stream = originalStream;
}
