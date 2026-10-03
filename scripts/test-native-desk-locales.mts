/** The frozen native build's locales through the real HTTP handler and debate engine.
 * All storage, market and model fetches are stubbed; no request can leave this process.
 * Canned provider replies establish routing/prompt contracts, not AI translation quality.
 */
import assert from 'node:assert/strict';

process.env.OPENAI_API_KEY = 'test-only';
process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_ANON_KEY = 'test-anon';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
process.env.BOBBY_PROTOCOL_BASE_URL = 'https://bobby.test';
delete process.env.BOBBY_MEMORY;
delete process.env.ANTHROPIC_API_KEY;
const { default: desk } = await import('../api/desk-debate.ts');
const { appLocale, languageName } = await import('../src/lib/app-language.ts');

const cases = [
  ['es', 'es-ES', 'Spanish (Spain)'], ['es', 'es-US', 'Spanish (United States)'], ['es', 'es-MX', 'Mexican Spanish'],
  ['en', 'en-GB', 'British English'], ['en', 'en-AU', 'Australian English'], ['en', 'en-CA', 'Canadian English'],
  ['en', 'en-IE', 'Irish English'], ['en', 'en-US', 'English'], ['fr', 'fr-FR', 'French (France)'],
  ['pt', 'pt-PT', 'European Portuguese (Portugal)'], ['pt', 'pt-BR', 'Brazilian Portuguese'],
  ['it', 'it-IT', 'Italian (Italy)'], ['de', 'de-DE', 'German (Germany)'],
] as const;
const originals = { fetch: globalThis.fetch };
let checks = 0;
const eq = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks++; };
const ok = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const seen: { network: string[]; prompts: string[]; model: number; reads: number } = { network: [], prompts: [], model: 0, reads: 0 };
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
  seen.network.push(url.href);
  if (url.hostname === 'db.test') {
    if (url.pathname.endsWith('/rpc/bobby_llm_spend')) return json({ day: 0, month: 0 });
    if (url.pathname.endsWith('/rpc/bobby_consume_read')) { seen.reads++; return json({ allowed: true, readId: 7, tier: 'anon', used: 1, limit: 3, remaining: 2 }); }
    if (url.pathname.endsWith('/rpc/bobby_consume_desk_quota')) return json(true);
    if (url.pathname.endsWith('/rpc/bobby_record_outcome')) return json(null);
    if (url.pathname.endsWith('/bobby_llm_usage')) return new Response(null, { status: 204 });
  }
  if (url.hostname === 'bobby.test' && url.pathname === '/api/okx-candles') {
    return json({ candles: Array.from({ length: 100 }, (_, i) => ({ ts: Date.now() - (100 - i) * 3_600_000, open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 5 })) });
  }
  if (url.hostname === 'api.openai.com') {
    seen.prompts.push(String(init?.body));
    seen.model++;
    const reply = seen.model % 3 === 0 ? {
      analysis: 'The evidence is incomplete; wait for additional confirmation.', verdict: 'wait', direction: 'none',
      synthesis: { headline: 'The available evidence is still incomplete.', why: 'There is not enough confirmation.', risk: 'The structure could change.', watch: 'Observe the next complete session.', watchLevel: 0, followUp: 'What is missing for BTC?' },
    } : { analysis: 'The available structure requires confirmation from additional evidence.' };
    return json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(reply) } }] });
  }
  throw new Error(`Unexpected test-only fetch: ${url.hostname}${url.pathname}`);
}) as typeof fetch;

async function post(body: Record<string, unknown>) {
  const res = { statusCode: 200, body: null as any, setHeader() {}, status(value: number) { this.statusCode = value; return this; }, json(value: unknown) { this.body = value; return this; } };
  await desk({ method: 'POST', headers: { origin: 'https://bobbyprotocol.xyz', 'x-forwarded-for': '203.0.113.7', 'x-bobby-platform': 'ios', 'x-bobby-device': 'test-device-1234567890' }, body } as never, res as never);
  return res;
}

try {
  for (const [language, locale, expectedName] of cases) {
    const before = { models: seen.model, prompts: seen.prompts.length, reads: seen.reads };
    // iOS supplies country independently of output language; it must not rewrite BTC.
    const response = await post({ symbol: 'BTC', assetType: 'crypto', question: 'Is this trend confirmed?', language, locale, country: 'FR' });
    eq(response.statusCode, 200, `native ${locale} reaches the complete handler instead of invalid_request`);
    eq(response.body.agents.verdict, 'wait', `${locale} returns a guarded debate`);
    eq(response.body.agents.direction, 'none', `${locale} keeps wait directionless`);
    eq(seen.model - before.models, 3, `${locale} reaches all three real debate roles`);
    eq(seen.reads - before.reads, 1, `${locale} retains the metered access gate`);
    eq(appLocale(language, locale), locale, `${locale} survives shared locale normalization`);
    eq(languageName(language, locale), expectedName, `${locale} keeps regional output wording`);
    const prompts = seen.prompts.slice(before.prompts);
    ok(prompts.every(prompt => prompt.includes(`Write in ${expectedName}.`)), `${locale} reaches Alpha, Red and CIO prompts`);
    ok(prompts.every(prompt => prompt.includes('BTC-USDT')), `${locale} and independent country preserve the actual instrument`);
  }
  for (const body of [
    { language: 'en', locale: 'es-MX' }, { language: 'fr', locale: 'pt-BR' }, { language: 'pt', locale: 'fr-FR' },
    { language: 'it', locale: 'de-DE' }, { language: 'de', locale: 'it-IT' }, { language: 'es', locale: 'en-GB' },
    { language: 'ja', locale: 'ja-JP' }, { language: 'en', locale: 'en-NZ' }, { language: 'es', locale: 'es-AR' },
    { language: 'fr', locale: 'fr-CA' }, { language: 'pt', locale: 'pt-AO' }, { language: 'de', locale: 'de-CH' },
    { language: 'en', locale: 'en_US' }, { language: 'en', locale: 'en-us' }, { language: 'en', locale: ' en-US' },
    { language: 'en', locale: 'en-US<script>' }, { language: 'en', locale: null }, { language: 'en', locale: {} },
  ]) {
    const before = seen.network.length;
    const response = await post({ symbol: 'BTC', question: 'Is this trend confirmed?', ...body });
    eq([response.statusCode, response.body.code], [400, 'invalid_request'], `invalid or mismatched locale ${JSON.stringify(body)} is rejected`);
    eq(seen.network.length, before, 'invalid locales spend no storage/quota/model request');
  }
  for (const language of ['en', 'es', 'fr', 'pt', 'it', 'de'] as const) {
    eq((await post({ symbol: 'BTC', question: 'Is this trend confirmed?', language })).statusCode, 200, `${language} remains backward compatible without locale`);
  }
  eq((await post({ symbol: 'BTC', question: 'Is this trend confirmed?' })).statusCode, 200, 'legacy requests still default to English');
  console.log(`${checks} native locale handler/engine checks passed (stubbed storage, market and model; no live generation).`);
} finally { globalThis.fetch = originals.fetch; }
