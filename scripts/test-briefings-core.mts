// Briefings core adapters without a network or a database (api/_lib/briefings/{push-crypto,providers,budget,apns,
// audio-store,voice}.ts):
//   · push crypto: AES-256-GCM token/receipt round-trips, tamper and wrong-key rejection, per-purpose key
//     separation (HKDF), fingerprints, installation credentials, HMAC cursors verified in constant time;
//   · providers: exactly ONE HTTP attempt per call (never a retry), every outcome class (ok / no_charge /
//     charged / unknown), credit-exhaustion alert, request shapes per model family, reservation math;
//   · withReservation: fails closed (no caps, DB down → no provider call), settles every outcome, never retries
//     an unknown attempt, survives a failed settle, writes a numbers-only usage row under the briefing surface;
//   · APNs: generic payload with nothing else in it, headers, a verifiable ES256 provider token cached ≤ 40 min,
//     every status mapping, refusal of an expired notification, and the real HTTP/2 transport against a local
//     h2c server (loopback only);
//   · audio store: Supabase Storage request shapes and 404 handling;
//   · ensureAudio: two concurrent callers for one cache key → one TTS call (in-memory fake DB).
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import { createHash, createHmac, generateKeyPairSync, randomBytes, verify as cryptoVerify } from 'node:crypto';
import type { AddressInfo } from 'node:net';

process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
process.env.OPENAI_API_KEY = 'test-openai';
process.env.ANTHROPIC_API_KEY = 'test-anthropic';
process.env.BOBBY_BRIEFINGS_ENABLED = 'on';
process.env.BOBBY_BRIEFINGS_DAILY_CAP_USD = '5';
process.env.BOBBY_BRIEFINGS_MONTHLY_CAP_USD = '50';
for (const k of ['BOBBY_PUSH_TOKEN_KEY', 'TTS_OPENAI_MODEL', 'TTS_INSTRUCTIONS', 'BOBBY_BRIEFINGS_TTS_RESERVE_USD_PER_CHAR', 'BOBBY_BRIEFINGS_TTS_ESTIMATE_USD_PER_CHAR',
  'BOBBY_BRIEFINGS_LLM_SLOTS', 'BOBBY_BRIEFINGS_TTS_SLOTS', 'RESEND_API_KEY']) delete process.env[k];

// Nothing in this file may reach a real host: any un-injected fetch fails the run.
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL) => { throw new Error(`unexpected network call to ${String(input)}`); }) as typeof fetch;
const deferred: Promise<unknown>[] = [];
(globalThis as Record<symbol, unknown>)[Symbol.for('@vercel/request-context')] = { get: () => ({ waitUntil: (p: Promise<unknown>) => { deferred.push(p); } }) };

const crypto = await import('../api/_lib/briefings/push-crypto.ts');
const providers = await import('../api/_lib/briefings/providers.ts');
const { withReservation } = await import('../api/_lib/briefings/budget.ts');
const apns = await import('../api/_lib/briefings/apns.ts');
const { supabaseAudioStore, audioPath } = await import('../api/_lib/briefings/audio-store.ts');
const { ensureAudio } = await import('../api/_lib/briefings/voice.ts');
const { BriefingStorageError } = await import('../api/_lib/briefings/db.ts');
const { PUSH_COPY } = await import('../api/_lib/briefings/config.ts');
const { modelCost } = await import('../api/_lib/llm.ts');
const { buildInstructions } = await import('../api/_lib/tts.ts');

let checks = 0;
const eq = (got: unknown, want: unknown, what: string) => { assert.deepEqual(got, want, what); checks++; };
const ok = (v: unknown, what: string) => { assert.ok(v, what); checks++; };
const throws = (fn: () => unknown, what: string) => { assert.throws(fn, what); checks++; };
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

try {
  // ============================================================ push crypto
  {
    const master = randomBytes(32);
    const other = randomBytes(32);
    const token = 'AB'.repeat(32);
    const sealed = crypto.encryptToken(token, master);
    ok(sealed.startsWith('v1:') && /^[A-Za-z0-9_-]+$/.test(sealed.slice(3)), 'sealed token is v1:base64url');
    eq(Buffer.from(sealed.slice(3), 'base64url').length, 12 + 16 + 64, 'iv12 | tag16 | ct');
    eq(crypto.decryptToken(sealed, master), token.toLowerCase(), 'token round-trips lower-cased');
    ok(crypto.encryptToken(token, master) !== sealed, 'fresh IV per seal');
    ok(!sealed.toLowerCase().includes(token.toLowerCase()), 'ciphertext does not contain the token');
    const flipped = sealed.slice(0, -2) + (sealed.at(-2) === 'A' ? 'B' : 'A') + sealed.at(-1);
    throws(() => crypto.decryptToken(flipped, master), 'tampered ciphertext rejected');
    const mid = Math.floor(sealed.length / 2);
    throws(() => crypto.decryptToken(sealed.slice(0, mid) + (sealed[mid] === 'A' ? 'B' : 'A') + sealed.slice(mid + 1), master), 'tampered ciphertext (middle) rejected');
    throws(() => crypto.decryptToken(sealed, other), 'wrong master rejected');
    throws(() => crypto.decryptToken('v2:' + sealed.slice(3), master), 'unknown version rejected');
    throws(() => crypto.decryptToken('v1:AAAA', master), 'truncated blob rejected');
    throws(() => crypto.openReceipt(sealed, master), 'token ciphertext does not open as a receipt (key separation)');
    throws(() => crypto.encryptToken(token, Buffer.alloc(16)), 'short master refused');

    const fp = crypto.tokenFingerprint(token, 'xyz.bobbyprotocol.bobby', 'production', master);
    ok(/^[0-9a-f]{64}$/.test(fp), 'fingerprint is sha256 hex');
    eq(crypto.tokenFingerprint(token.toLowerCase(), 'xyz.bobbyprotocol.bobby', 'production', master), fp, 'fingerprint ignores token case');
    ok(crypto.tokenFingerprint(token, 'xyz.bobbyprotocol.bobby', 'sandbox', master) !== fp, 'environment is bound');
    ok(crypto.tokenFingerprint(token, 'other.topic', 'production', master) !== fp, 'topic is bound');
    ok(crypto.tokenFingerprint(token, 'xyz.bobbyprotocol.bobby', 'production', other) !== fp, 'master is bound');
    const raw = createHmac('sha256', master).update(`${token.toLowerCase()}|xyz.bobbyprotocol.bobby|production`).digest('hex');
    ok(raw !== fp, 'fingerprint key is derived, not the raw master');

    const cred = crypto.newInstallationCredential();
    ok(/^[A-Za-z0-9_-]{43}$/.test(cred), 'credential = 32 bytes base64url');
    ok(crypto.newInstallationCredential() !== cred, 'credentials are random');
    eq(crypto.credentialVerifier(cred), createHash('sha256').update(cred).digest('hex'), 'verifier is sha256 hex');

    const receipt = JSON.stringify({ status: 201, body: { installationCredential: cred } });
    const sealedReceipt = crypto.sealReceipt(receipt, master);
    ok(!sealedReceipt.includes(cred), 'receipt hides the credential');
    eq(crypto.openReceipt(sealedReceipt, master), receipt, 'receipt round-trips');
    throws(() => crypto.decryptToken(sealedReceipt, master), 'receipt does not open as a token (key separation)');
    throws(() => crypto.openReceipt(sealedReceipt.slice(0, -1) + (sealedReceipt.at(-1) === 'A' ? 'B' : 'A'), master), 'tampered receipt rejected');

    const ck = randomBytes(32);
    const cursor = crypto.signCursor({ s: '2026-10-02T12:00:00.000Z', i: 'abc', c: 'morning' }, ck);
    eq(crypto.verifyCursor(cursor, ck), { s: '2026-10-02T12:00:00.000Z', i: 'abc', c: 'morning' }, 'cursor round-trips');
    const [body, tag] = cursor.split('.');
    const forged = Buffer.from(JSON.stringify({ s: '2099-01-01', i: 'abc', c: 'morning' })).toString('base64url');
    eq(crypto.verifyCursor(`${forged}.${tag}`, ck), null, 'tampered cursor body → null');
    eq(crypto.verifyCursor(`${body}.${tag.slice(0, -1)}${tag.at(-1) === 'A' ? 'B' : 'A'}`, ck), null, 'tampered cursor tag → null');
    eq(crypto.verifyCursor(cursor, randomBytes(32)), null, 'cursor under another key → null');
    eq(crypto.verifyCursor('garbage', ck), null, 'garbage → null');
    eq(crypto.verifyCursor(`${body}.${tag}.x`, ck), null, 'extra segment → null');
    const arr = Buffer.from('[1,2]').toString('base64url');
    eq(crypto.verifyCursor(`${arr}.${createHmac('sha256', ck).update(arr).digest('base64url')}`, ck), null, 'signed non-object → null');

    const k1 = crypto.cursorKey({ BOBBY_PUSH_TOKEN_KEY: master.toString('base64') } as NodeJS.ProcessEnv);
    eq(k1.length, 32, 'cursor key is 32 bytes');
    ok(!k1.equals(master), 'cursor key is derived from the master');
    eq(crypto.cursorKey({ BOBBY_PUSH_TOKEN_KEY: master.toString('base64') } as NodeJS.ProcessEnv), k1, 'cursor key is stable');
    const k2 = crypto.cursorKey({ BOBBY_SUPABASE_SERVICE_ROLE_KEY: 'svc' } as NodeJS.ProcessEnv);
    ok(k2.length === 32 && !k2.equals(k1), 'fallback cursor key derived from the service key');
    eq(crypto.cursorKey({ SUPABASE_SERVICE_KEY: 'svc' } as NodeJS.ProcessEnv), k2, 'fallback depends only on the service key');
    throws(() => crypto.cursorKey({} as NodeJS.ProcessEnv), 'no secret → no cursor key');
    ok(crypto.cursorKey().length === 32, 'process env: falls back to the service key');
  }

  // ============================================================ providers
  interface Call { url: string; init: RequestInit; body: any }
  const fakeFetch = (reply: (c: Call) => Response | Promise<Response>) => {
    const calls: Call[] = [];
    const f = (async (input: string | URL, init?: RequestInit) => {
      const c = { url: String(input), init: init ?? {}, body: init?.body ? JSON.parse(String(init.body)) : null };
      calls.push(c);
      return reply(c);
    }) as typeof fetch;
    return { f, calls };
  };
  const alerts: unknown[][] = [];
  const alert = (...a: unknown[]) => { alerts.push(a); };
  const REQ = { system: 'SYSTEM-PROMPT-SECRET', user: 'USER-EVIDENCE-SECRET', schema: { name: 'brief', schema: { type: 'object', properties: { a: { type: 'number' } }, required: ['a'], additionalProperties: false } } };
  const mini = { provider: 'openai' as const, model: 'gpt-4o-mini' };
  const luna = { provider: 'openai' as const, model: 'gpt-6-luna' };
  const sonnet = { provider: 'anthropic' as const, model: 'claude-sonnet-5-5' };
  const O = { maxTokens: 1000, timeoutMs: 5000, alert };
  const openaiOk = (content: string, finish = 'stop', usage: unknown = { prompt_tokens: 1200, completion_tokens: 300, prompt_tokens_details: { cached_tokens: 200 } }) =>
    json({ choices: [{ finish_reason: finish, message: { content } }], ...(usage ? { usage } : {}) });

  {
    // request shapes + ok
    let { f, calls } = fakeFetch(() => openaiOk('{"a":1}'));
    let r: any = await providers.llmJsonOnce(mini, REQ, { ...O, fetchImpl: f });
    eq(calls.length, 1, 'one HTTP attempt');
    eq(calls[0].url, 'https://api.openai.com/v1/chat/completions', 'openai url');
    eq((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer test-openai', 'openai key');
    eq(calls[0].body.max_tokens, 1000, 'gpt-4o family: max_tokens');
    eq(calls[0].body.temperature, 0.2, 'gpt-4o family: temperature');
    eq(calls[0].body.response_format, { type: 'json_schema', json_schema: { name: 'brief', strict: true, schema: REQ.schema.schema } }, 'strict json schema');
    eq(calls[0].body.messages, [{ role: 'system', content: REQ.system }, { role: 'user', content: REQ.user }], 'messages');
    ok(calls[0].init.signal instanceof AbortSignal, 'timeout signal');
    eq(r.ok, true, 'ok');
    eq(r.value, { a: 1 }, 'parsed value');
    eq(r.usd, modelCost('gpt-4o-mini', 1000, 200, 300), 'usd from usage (cached split)');
    eq(r.estimated, false, 'not estimated');
    eq([r.usage.tokensIn, r.usage.tokensOut], [1200, 300], 'usage tokens');

    ({ f, calls } = fakeFetch(() => openaiOk('{"a":2}')));
    await providers.llmJsonOnce(luna, REQ, { ...O, fetchImpl: f });
    eq([calls[0].body.max_completion_tokens, 'max_tokens' in calls[0].body, 'temperature' in calls[0].body], [1000, false, false], 'newer family: max_completion_tokens only');

    ({ f, calls } = fakeFetch(() => json({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"a":3}' }], usage: { input_tokens: 900, output_tokens: 400, cache_read_input_tokens: 100 } })));
    r = await providers.llmJsonOnce(sonnet, REQ, { ...O, fetchImpl: f });
    eq(calls[0].url, 'https://api.anthropic.com/v1/messages', 'anthropic url');
    const ah = calls[0].init.headers as Record<string, string>;
    eq([ah['x-api-key'], ah['anthropic-version']], ['test-anthropic', '2023-06-01'], 'anthropic headers');
    eq(calls[0].body.output_config, { effort: 'low', format: { type: 'json_schema', schema: REQ.schema.schema } }, 'anthropic output_config');
    eq([calls[0].body.max_tokens, calls[0].body.system], [1000, REQ.system], 'anthropic max_tokens + system');
    eq(calls[0].body.messages, [{ role: 'user', content: REQ.user }], 'anthropic messages');
    eq([r.ok, r.value, r.usd], [true, { a: 3 }, modelCost('claude-sonnet-5-5', 900, 100, 400)], 'anthropic ok + usd');

    ({ f, calls } = fakeFetch(() => openaiOk('```json\n{"a":4}\n```')));
    r = await providers.llmJsonOnce(mini, REQ, { ...O, fetchImpl: f });
    eq([r.ok, r.value], [true, { a: 4 }], 'code fence tolerated');

    // not configured: no fetch
    delete process.env.OPENAI_API_KEY;
    ({ f, calls } = fakeFetch(() => openaiOk('{}')));
    r = await providers.llmJsonOnce(mini, REQ, { ...O, fetchImpl: f });
    eq([r.ok, r.outcome, r.code, calls.length], [false, 'no_charge', 'not_configured', 0], 'missing key → no_charge, no fetch');
    r = await providers.ttsOnce('hola', 'ash', 'es', { timeoutMs: 5000, fetchImpl: f, alert });
    eq([r.outcome, r.code, calls.length], ['no_charge', 'not_configured', 0], 'tts missing key → no fetch');
    process.env.OPENAI_API_KEY = 'test-openai';

    // non-200: exactly one attempt, no charge
    for (const status of [500, 502, 503, 429, 400, 401]) {
      ({ f, calls } = fakeFetch(() => json({ error: { type: 'server_error', message: 'echo of SYSTEM-PROMPT-SECRET' } }, status)));
      r = await providers.llmJsonOnce(mini, REQ, { ...O, fetchImpl: f });
      eq([r.ok, r.outcome, r.code, r.status, calls.length], [false, 'no_charge', `http_${status}`, status, 1], `${status} → no_charge, no retry`);
    }
    ({ f, calls } = fakeFetch(() => json({ error: { code: 'rate_limit_exceeded' } }, 429)));
    r = await providers.llmJsonOnce(mini, REQ, { ...O, fetchImpl: f });
    eq([r.code, calls.length, alerts.length], ['rate_limit_exceeded', 1, 0], 'rate limit: class kept, no alert');
    ({ f, calls } = fakeFetch(() => json({ error: { code: 'insufficient_quota', type: 'insufficient_quota' } }, 429)));
    r = await providers.llmJsonOnce(mini, REQ, { ...O, fetchImpl: f });
    eq([r.outcome, r.code, calls.length], ['no_charge', 'insufficient_quota', 1], 'exhausted credit → insufficient_quota');
    eq(alerts.pop(), ['openai', 'insufficient_quota', 'briefings'], 'owner alerted for OpenAI');
    ({ f, calls } = fakeFetch(() => json({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }, 400)));
    r = await providers.llmJsonOnce(sonnet, REQ, { ...O, fetchImpl: f });
    eq([r.code, calls.length], ['insufficient_quota', 1], 'anthropic credit → insufficient_quota');
    eq(alerts.pop(), ['anthropic', 'insufficient_quota', 'briefings'], 'owner alerted for Anthropic');

    // 200 but unusable → charged with the usage-based cost
    ({ f, calls } = fakeFetch(() => openaiOk('{"a":', 'length')));
    r = await providers.llmJsonOnce(mini, REQ, { ...O, fetchImpl: f });
    eq([r.ok, r.outcome, r.code, r.status, r.usd, calls.length], [false, 'charged', 'incomplete', 200, modelCost('gpt-4o-mini', 1000, 200, 300), 1], 'truncated → charged');
    ({ f, calls } = fakeFetch(() => openaiOk('not json at all')));
    r = await providers.llmJsonOnce(mini, REQ, { ...O, fetchImpl: f });
    eq([r.outcome, r.code, calls.length], ['charged', 'invalid_json', 1], 'prose → charged invalid_json');
    ({ f, calls } = fakeFetch(() => json({ choices: [{ finish_reason: 'stop', message: { content: null, refusal: 'no' } }], usage: { prompt_tokens: 10, completion_tokens: 2 } })));
    r = await providers.llmJsonOnce(mini, REQ, { ...O, fetchImpl: f });
    eq([r.outcome, r.code], ['charged', 'refusal'], 'model refusal → charged');
    ({ f, calls } = fakeFetch(() => json({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"a"' }], usage: { input_tokens: 10, output_tokens: 1000 } })));
    r = await providers.llmJsonOnce(sonnet, REQ, { ...O, fetchImpl: f });
    eq([r.outcome, r.code, r.usd], ['charged', 'incomplete', modelCost('claude-sonnet-5-5', 10, 0, 1000)], 'anthropic max_tokens → charged');
    ({ f, calls } = fakeFetch(() => openaiOk('{"a":5}', 'stop', null)));
    r = await providers.llmJsonOnce(mini, REQ, { ...O, fetchImpl: f });
    eq([r.ok, r.estimated, r.usd], [true, true, providers.llmReserveUsd(mini, REQ.system.length + REQ.user.length, 1000)], 'missing usage → reservation-sized estimate');

    // the request may have reached the provider → unknown
    ({ f, calls } = fakeFetch(() => new Response('{"choices": [', { status: 200 })));
    r = await providers.llmJsonOnce(mini, REQ, { ...O, fetchImpl: f });
    eq([r.outcome, r.code, r.status, calls.length], ['unknown', 'bad_envelope', 200, 1], 'unreadable 200 envelope → unknown');
    ({ f, calls } = fakeFetch(() => { throw Object.assign(new Error('timed out'), { name: 'TimeoutError' }); }));
    r = await providers.llmJsonOnce(mini, REQ, { ...O, fetchImpl: f });
    eq([r.outcome, r.code, r.status, calls.length], ['unknown', 'timeout', null, 1], 'timeout → unknown, no retry');
    ({ f, calls } = fakeFetch(() => { throw new TypeError('fetch failed'); }));
    r = await providers.llmJsonOnce(sonnet, REQ, { ...O, fetchImpl: f });
    eq([r.outcome, r.code, calls.length], ['unknown', 'network', 1], 'network error → unknown, no retry');
    // a real abort through the signal
    ({ f, calls } = fakeFetch((c) => new Promise<Response>((_, reject) => c.init.signal!.addEventListener('abort', () => reject(c.init.signal!.reason)))));
    const keepAlive = setTimeout(() => undefined, 5000); // AbortSignal.timeout's timer is unref'd; a real socket would hold the loop
    r = await providers.llmJsonOnce(mini, REQ, { ...O, timeoutMs: 30, fetchImpl: f });
    clearTimeout(keepAlive);
    eq([r.outcome, r.code, calls.length], ['unknown', 'timeout', 1], 'signal timeout → unknown');

    // TTS
    const mp3 = Buffer.alloc(2048, 7);
    ({ f, calls } = fakeFetch(() => new Response(mp3, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })));
    const text = 'El mercado abrió con calma.';
    r = await providers.ttsOnce(text, 'ash', 'es', { timeoutMs: 5000, fetchImpl: f, alert });
    eq(calls.length, 1, 'tts: one attempt');
    eq(calls[0].url, 'https://api.openai.com/v1/audio/speech', 'tts url');
    eq(calls[0].body, { model: 'gpt-4o-mini-tts', voice: 'verse', input: text, response_format: 'mp3', instructions: buildInstructions('es', 'analytical', 'verse', 'ash') }, 'tts body: persona voice, briefing vibe, mp3');
    eq([r.ok, r.value.length, r.estimated, r.usage.chars], [true, 2048, true, text.length], 'tts ok');
    ok(Math.abs(r.usd - text.length * 0.000017) < 1e-12, 'tts usd = chars × estimate');
    ({ f, calls } = fakeFetch(() => new Response(Buffer.alloc(100), { status: 200 })));
    r = await providers.ttsOnce(text, 'mellow', 'en', { timeoutMs: 5000, fetchImpl: f, alert });
    eq([r.ok, r.outcome, r.code], [false, 'charged', 'short_audio'], 'tiny audio → charged');
    eq(calls[0].body.voice, 'ash', 'mellow persona → ash voice');
    ({ f, calls } = fakeFetch(() => json({ error: { code: 'insufficient_quota' } }, 429)));
    r = await providers.ttsOnce(text, 'coral', 'en', { timeoutMs: 5000, fetchImpl: f, alert });
    eq([r.outcome, r.code, calls.length], ['no_charge', 'insufficient_quota', 1], 'tts credit → no_charge');
    eq(alerts.pop(), ['openai', 'insufficient_quota', 'briefings'], 'tts credit alert');
    ({ f, calls } = fakeFetch(() => json({}, 503)));
    r = await providers.ttsOnce(text, 'coral', 'en', { timeoutMs: 5000, fetchImpl: f, alert });
    eq([r.outcome, r.code, calls.length], ['no_charge', 'http_503', 1], 'tts 503 → no_charge, no retry');
    ({ f, calls } = fakeFetch(() => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); }));
    r = await providers.ttsOnce(text, 'coral', 'en', { timeoutMs: 5000, fetchImpl: f, alert });
    eq([r.outcome, r.code, calls.length], ['unknown', 'timeout', 1], 'tts abort → unknown');
    ({ f, calls } = fakeFetch(() => new Response(mp3)));
    r = await providers.ttsOnce('x'.repeat(4001), 'coral', 'en', { timeoutMs: 5000, fetchImpl: f, alert });
    eq([r.outcome, r.code, calls.length], ['no_charge', 'bad_input', 0], 'oversized text never sent (no silent truncation)');

    // reservation math
    eq(providers.llmReserveUsd(mini, 3000, 1000), 0.000938, 'mini: (1000×0.15 + 1000×0.60)/1e6 × 1.25 rounded up');
    eq(providers.llmReserveUsd(sonnet, 3000, 3000), 0.04, 'sonnet: (1000×2 + 3000×10)/1e6 × 1.25');
    eq(providers.llmReserveUsd({ provider: 'openai', model: 'gpt-unknown-x' }, 0, 1000), 0.025, 'unknown model at the dearest price');
    eq(providers.ttsReserveUsd(800), 0.032, 'tts reserve = chars × 0.00004');
    eq(providers.ttsReserveUsd(0), 0, 'tts reserve of nothing');
    eq(alerts.length, 0, 'no stray alerts');
  }

  // ============================================================ withReservation
  {
    type Op = [string, ...unknown[]];
    const fakeBudgetDb = (o: { reserve?: () => any; dispatchFails?: boolean; settleFails?: boolean } = {}) => {
      const ops: Op[] = [];
      const db = {
        reserveAttempt: async (p: unknown) => { ops.push(['reserve', p]); if (o.reserve) return o.reserve(); return { ok: true, attemptId: 'att-1' }; },
        dispatchAttempt: async (id: string) => { ops.push(['dispatch', id]); if (o.dispatchFails) throw new BriefingStorageError('bobby_brief_budget_dispatch', 503); },
        settleAttempt: async (...a: unknown[]) => { ops.push(['settle', ...a]); if (o.settleFails) throw new BriefingStorageError('bobby_brief_budget_settle', null); },
      };
      return { db: db as any, ops };
    };
    const rows: Array<{ rows: any[]; ctx: any }> = [];
    const logUsage = async (r: any[], ctx: any) => { rows.push({ rows: r, ctx }); };
    const P = { kind: 'llm' as const, workRef: 'shared:morning:2026-10-02:es', provider: 'openai', model: 'gpt-4o-mini', reserveUsd: 0.002, worker: 'w1' };
    let calls = 0;
    const okCall = async () => { calls++; return { ok: true as const, value: { a: 1 }, usd: 0.0007, estimated: false, usage: { tokensIn: 1200, tokensOut: 300, latencyMs: 812 } }; };

    // caps missing → no reserve, no call
    delete process.env.BOBBY_BRIEFINGS_DAILY_CAP_USD;
    let { db, ops } = fakeBudgetDb();
    let r: any = await withReservation(P, okCall, { db, logUsage });
    eq([r, calls, ops.length], [{ ok: false, code: 'budget_unavailable' }, 0, 0], 'no caps → budget_unavailable, no call');
    process.env.BOBBY_BRIEFINGS_DAILY_CAP_USD = 'abc';
    r = await withReservation(P, okCall, { db, logUsage });
    eq([r.code, calls], ['budget_unavailable', 0], 'invalid cap → budget_unavailable');
    process.env.BOBBY_BRIEFINGS_DAILY_CAP_USD = '5';

    // DB down at reserve → no call
    ({ db, ops } = fakeBudgetDb({ reserve: () => { throw new BriefingStorageError('bobby_brief_budget_reserve', null); } }));
    r = await withReservation(P, okCall, { db, logUsage });
    eq([r, calls], [{ ok: false, code: 'storage_unavailable' }, 0], 'reserve DB error → storage_unavailable, no call');
    ({ db, ops } = fakeBudgetDb({ reserve: () => null }));
    r = await withReservation(P, okCall, { db, logUsage });
    eq([r.code, calls], ['storage_unavailable', 0], 'malformed reserve → storage_unavailable');

    // refusals map, never call
    for (const [code, want] of [['not_configured', 'budget_unavailable'], ['slots_full', 'slots_full'], ['budget_exhausted', 'budget_exhausted'], ['work_unresolved', 'work_unresolved'], ['attempts_exhausted', 'attempts_exhausted']]) {
      ({ db, ops } = fakeBudgetDb({ reserve: () => ({ ok: false, code }) }));
      r = await withReservation(P, okCall, { db, logUsage });
      eq([r, calls, ops.map((o) => o[0])], [{ ok: false, code: want }, 0, ['reserve']], `refusal ${code} → ${want}, no call`);
    }

    // DB down at dispatch → no call, slot released best effort
    ({ db, ops } = fakeBudgetDb({ dispatchFails: true }));
    r = await withReservation(P, okCall, { db, logUsage });
    eq([r.code, calls], ['storage_unavailable', 0], 'dispatch DB error → no call');
    eq(ops.at(-1), ['settle', 'att-1', 'no_charge', 0, { latencyMs: 0 }], 'reserved slot released as no_charge');
    eq(rows.length, 0, 'no usage row without a call');

    // ok
    ({ db, ops } = fakeBudgetDb());
    r = await withReservation(P, okCall, { db, logUsage });
    eq([r, calls], [{ ok: true, value: { a: 1 } }, 1], 'ok returns the value');
    const reserveArgs = ops[0][1] as any;
    eq([reserveArgs.dayCap, reserveArgs.monthCap, reserveArgs.maxSlots, reserveArgs.maxAttemptsPerWork, reserveArgs.reserveUsd, reserveArgs.kind, reserveArgs.workRef],
      [5, 50, 2, 2, 0.002, 'llm', P.workRef], 'reserve carries caps, llm slots, attempt cap');
    eq(ops.map((o) => o[0]), ['reserve', 'dispatch', 'settle'], 'reserve → dispatch → settle');
    eq(ops[2], ['settle', 'att-1', 'settled', 0.0007, { tokensIn: 1200, tokensOut: 300, latencyMs: 812, estimated: false }], 'settled with the actual cost');
    let row = rows.pop()!;
    eq(row.ctx, { surface: 'briefing' }, 'llm usage surface');
    eq(Object.keys(row.rows[0]).sort(), ['latencyMs', 'model', 'ok', 'provider', 'role', 'stop', 'tokensCached', 'tokensIn', 'tokensOut', 'tokensReasoning', 'usd'], 'usage row has numbers only');
    eq([row.rows[0].role, row.rows[0].ok, row.rows[0].usd, row.rows[0].provider, row.rows[0].stop], ['narrative', true, 0.0007, 'openai', 'stop'], 'usage row values');
    ok(!JSON.stringify(row).includes('SECRET') && !JSON.stringify(row).includes(P.workRef), 'no prompt or work ref in the ledger');

    // unknown → settled unknown, never retried
    calls = 0;
    const unknownCall = async () => { calls++; return { ok: false as const, outcome: 'unknown' as const, code: 'timeout', status: null, latencyMs: 40000 }; };
    ({ db, ops } = fakeBudgetDb());
    r = await withReservation(P, unknownCall, { db, logUsage });
    eq([r, calls], [{ ok: false, code: 'provider_unknown' }, 1], 'unknown → provider_unknown, exactly one call');
    eq(ops[2], ['settle', 'att-1', 'unknown', null, { latencyMs: 40000, estimated: false }], 'settled unknown with no amount');
    row = rows.pop()!;
    eq([row.rows[0].ok, row.rows[0].usd, row.rows[0].stop], [false, 0.002, 'unknown:timeout'], 'unknown logged at the reserved amount');

    // charged / no_charge
    calls = 0;
    ({ db, ops } = fakeBudgetDb());
    r = await withReservation(P, async () => { calls++; return { ok: false as const, outcome: 'charged' as const, code: 'invalid_json', status: 200, latencyMs: 5, usd: 0.0004, estimated: false, usage: { tokensIn: 10, tokensOut: 20, latencyMs: 5 } }; }, { db, logUsage });
    eq([r, calls, ops[2]], [{ ok: false, code: 'provider_failed' }, 1, ['settle', 'att-1', 'settled', 0.0004, { tokensIn: 10, tokensOut: 20, latencyMs: 5, estimated: false }]], 'charged → settled actual, provider_failed');
    rows.pop();
    ({ db, ops } = fakeBudgetDb());
    r = await withReservation(P, async () => ({ ok: false as const, outcome: 'no_charge' as const, code: 'http_500', status: 500, latencyMs: 3 }), { db, logUsage });
    eq([r.code, ops[2]], ['provider_failed', ['settle', 'att-1', 'no_charge', 0, { latencyMs: 3, estimated: false }]], 'no_charge → settled no_charge');
    eq([rows.at(-1)!.rows[0].usd, rows.at(-1)!.rows[0].stop], [0, 'no_charge:http_500'], 'no_charge row costs nothing');
    rows.pop();

    // a throwing adapter is treated as unknown
    ({ db, ops } = fakeBudgetDb());
    r = await withReservation(P, async () => { throw new Error('boom'); }, { db, logUsage });
    eq([r.code, ops[2][2]], ['provider_unknown', 'unknown'], 'throwing call → unknown');
    rows.pop();

    // settle fails after a paid call: value still returned, left to reconcile
    calls = 0;
    ({ db, ops } = fakeBudgetDb({ settleFails: true }));
    r = await withReservation(P, okCall, { db, logUsage });
    eq([r, calls], [{ ok: true, value: { a: 1 } }, 1], 'settle failure keeps the paid value');
    eq(rows.pop()!.rows[0].ok, true, 'usage still logged');

    // ledger failure never changes the result
    ({ db, ops } = fakeBudgetDb());
    r = await withReservation(P, okCall, { db, logUsage: async () => { throw new Error('ledger down'); } });
    eq(r.ok, true, 'ledger failure ignored');

    // tts kind
    process.env.BOBBY_BRIEFINGS_TTS_SLOTS = '3';
    ({ db, ops } = fakeBudgetDb());
    r = await withReservation({ ...P, kind: 'tts', model: 'gpt-4o-mini-tts', workRef: 'audio:abc' }, async () => ({ ok: true as const, value: Buffer.alloc(1), usd: 0.01, estimated: true, usage: { chars: 600, latencyMs: 900 } }), { db, logUsage });
    eq([(ops[0][1] as any).maxSlots, ops[2][4]], [3, { chars: 600, latencyMs: 900, estimated: true }], 'tts slots + estimated settle');
    row = rows.pop()!;
    eq([row.ctx.surface, row.rows[0].role, row.rows[0].tokensIn, row.rows[0].tokensOut], ['briefing-voice', 'tts', 0, 0], 'tts usage row');
    delete process.env.BOBBY_BRIEFINGS_TTS_SLOTS;
  }

  // ============================================================ APNs
  {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const cfg = { keyId: 'KEY1234567', teamId: 'TEAM123456', privateKey: pem, topic: 'xyz.bobbyprotocol.bobby', environments: new Set<'production' | 'sandbox'>(['production']) };
    const NOW = new Date('2026-10-02T12:00:00.000Z');
    const token = 'a1'.repeat(32);
    const N = { token, environment: 'production' as const, topic: cfg.topic, apnsId: '7d7b5f3c-0c8f-4f43-9a7e-1b9a8f6e2c11', collapseId: 'brief-1b2c', expiresAt: new Date(NOW.getTime() + 30 * 60_000), language: 'es' as const, briefId: '1b2c3d4e-0000-4000-8000-000000000001' };
    type Sent = { origin: string; headers: Record<string, string>; body: string; timeoutMs: number };
    const fakeTransport = (reply: (s: Sent) => { status: number; headers?: Record<string, string>; body?: string } | Promise<never>) => {
      const sent: Sent[] = [];
      return {
        sent,
        t: { async request(origin: string, headers: Record<string, string>, body: string, timeoutMs: number) {
          const s = { origin, headers, body, timeoutMs }; sent.push(s);
          const r = await reply(s);
          return { status: r.status, headers: r.headers ?? {}, body: r.body ?? '' };
        } },
      };
    };

    // payload: generic and nothing else
    eq(apns.apnsPayload(N), { aps: { alert: { title: 'Bobby', body: PUSH_COPY.es.body }, sound: 'default', 'thread-id': 'bobby-briefings' }, briefId: N.briefId }, 'es payload exactly');
    eq(apns.apnsPayload({ ...N, language: 'en' }), { aps: { alert: { title: 'Bobby', body: 'Bobby has your market briefing ready' }, sound: 'default', 'thread-id': 'bobby-briefings' }, briefId: N.briefId }, 'en payload exactly');

    let { t, sent } = fakeTransport(() => ({ status: 200, headers: { 'apns-id': N.apnsId } }));
    let r = await apns.sendApns(cfg, N, t, NOW);
    eq(r, { outcome: 'accepted', status: 200, reason: null }, '200 accepted');
    eq(sent.length, 1, 'one request');
    eq(sent[0].origin, 'https://api.push.apple.com', 'production origin');
    eq(JSON.parse(sent[0].body), apns.apnsPayload(N), 'body is the generic payload');
    ok(!sent[0].body.includes(token) && !sent[0].body.includes(N.apnsId), 'body carries no token or delivery id');
    const h = sent[0].headers;
    eq(Object.keys(h).sort(), [':method', ':path', 'apns-collapse-id', 'apns-expiration', 'apns-id', 'apns-priority', 'apns-push-type', 'apns-topic', 'authorization', 'content-type'], 'header set');
    eq([h[':method'], h[':path'], h['apns-topic'], h['apns-push-type'], h['apns-priority'], h['apns-expiration'], h['apns-collapse-id'], h['apns-id']],
      ['POST', `/3/device/${token}`, cfg.topic, 'alert', '10', String(Math.floor(N.expiresAt.getTime() / 1000)), N.collapseId, N.apnsId], 'header values');

    // JWT
    ok(h.authorization.startsWith('bearer '), 'bearer provider token');
    const jwt = h.authorization.slice(7);
    const [jh, jc, js] = jwt.split('.');
    eq(JSON.parse(Buffer.from(jh, 'base64url').toString()), { alg: 'ES256', kid: cfg.keyId }, 'jwt header');
    eq(JSON.parse(Buffer.from(jc, 'base64url').toString()), { iss: cfg.teamId, iat: Math.floor(NOW.getTime() / 1000) }, 'jwt claims');
    eq(Buffer.from(js, 'base64url').length, 64, 'ES256 raw r|s signature');
    ok(cryptoVerify('sha256', Buffer.from(`${jh}.${jc}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(js, 'base64url')), 'jwt signature verifies');
    eq(apns.providerToken(cfg, new Date(NOW.getTime() + 39 * 60_000)), jwt, 'token reused within 40 min');
    const later = apns.providerToken(cfg, new Date(NOW.getTime() + 41 * 60_000));
    ok(later !== jwt, 'token refreshed after 40 min');
    eq(JSON.parse(Buffer.from(later.split('.')[1], 'base64url').toString()).iat, Math.floor(NOW.getTime() / 1000) + 41 * 60, 'refreshed iat');
    const other = apns.providerToken({ ...cfg, keyId: 'KEY7654321' }, NOW);
    eq(JSON.parse(Buffer.from(other.split('.')[0], 'base64url').toString()).kid, 'KEY7654321', 'cached per key id');

    // sandbox origin when allowed
    ({ t, sent } = fakeTransport(() => ({ status: 200 })));
    await apns.sendApns({ ...cfg, environments: new Set(['production', 'sandbox']) }, { ...N, environment: 'sandbox' }, t, NOW);
    eq(sent[0].origin, 'https://api.sandbox.push.apple.com', 'sandbox origin');

    // refusals before any request
    for (const [n, c, want, what] of [
      [{ ...N, expiresAt: new Date(NOW.getTime() - 1) }, cfg, { outcome: 'retry', status: null, reason: 'expired' }, 'expired → refused'],
      [{ ...N, expiresAt: NOW }, cfg, { outcome: 'retry', status: null, reason: 'expired' }, 'expiry instant → refused'],
      [{ ...N, environment: 'sandbox' as const }, cfg, { outcome: 'config', status: null, reason: 'environment_not_allowed' }, 'environment not allowed'],
      [{ ...N, topic: 'evil.topic' }, cfg, { outcome: 'config', status: null, reason: 'topic_mismatch' }, 'client topic ignored'],
      [{ ...N, token: 'zz-not-hex' }, cfg, { outcome: 'invalid_token', status: null, reason: 'BadDeviceToken' }, 'malformed token'],
      [N, { ...cfg, keyId: 'BADKEY0001', privateKey: '-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----' }, { outcome: 'config', status: null, reason: 'bad_provider_key' }, 'unusable key'],
    ] as const) {
      ({ t, sent } = fakeTransport(() => ({ status: 200 })));
      eq(await apns.sendApns(c as any, n as any, t, NOW), want, what);
      eq(sent.length, 0, `${what}: nothing sent`);
    }

    // status mapping
    const cases: Array<[number, string | null, Record<string, string>, unknown]> = [
      [410, 'Unregistered', {}, { outcome: 'invalid_token', status: 410, reason: 'Unregistered' }],
      [400, 'BadDeviceToken', {}, { outcome: 'invalid_token', status: 400, reason: 'BadDeviceToken' }],
      [400, 'DeviceTokenNotForTopic', {}, { outcome: 'invalid_token', status: 400, reason: 'DeviceTokenNotForTopic' }],
      [403, 'InvalidProviderToken', {}, { outcome: 'config', status: 403, reason: 'InvalidProviderToken' }],
      [403, 'ExpiredProviderToken', {}, { outcome: 'config', status: 403, reason: 'ExpiredProviderToken' }],
      [403, 'BadCertificateEnvironment', {}, { outcome: 'config', status: 403, reason: 'BadCertificateEnvironment' }],
      [400, 'BadTopic', {}, { outcome: 'config', status: 400, reason: 'BadTopic' }],
      [400, 'TopicDisallowed', {}, { outcome: 'config', status: 400, reason: 'TopicDisallowed' }],
      [400, 'BadCertificate', {}, { outcome: 'config', status: 400, reason: 'BadCertificate' }],
      [429, 'TooManyRequests', { 'Retry-After': '120' }, { outcome: 'retry', status: 429, reason: 'TooManyRequests', retryAfterSeconds: 120 }],
      [429, 'TooManyProviderTokenUpdates', {}, { outcome: 'retry', status: 429, reason: 'TooManyProviderTokenUpdates', retryAfterSeconds: 60 }],
      [429, 'TooManyRequests', { 'retry-after': '99999' }, { outcome: 'retry', status: 429, reason: 'TooManyRequests', retryAfterSeconds: 600 }],
      [429, 'TooManyRequests', { 'retry-after': new Date(NOW.getTime() + 90_000).toUTCString() }, { outcome: 'retry', status: 429, reason: 'TooManyRequests', retryAfterSeconds: 90 }],
      [500, 'InternalServerError', {}, { outcome: 'retry', status: 500, reason: 'InternalServerError', retryAfterSeconds: 30 }],
      [503, 'ServiceUnavailable', { 'retry-after': '5' }, { outcome: 'retry', status: 503, reason: 'ServiceUnavailable', retryAfterSeconds: 5 }],
      [400, 'BadCollapseId', {}, { outcome: 'retry', status: 400, reason: 'BadCollapseId' }],
      [400, null, {}, { outcome: 'retry', status: 400, reason: null }],
    ];
    for (const [status, reason, headers, want] of cases) {
      ({ t, sent } = fakeTransport(() => ({ status, headers, body: reason ? JSON.stringify({ reason }) : 'not json' })));
      eq(await apns.sendApns(cfg, N, t, NOW), want, `${status} ${reason ?? '(no reason)'}`);
    }
    // a rejected provider token is re-minted on the next send
    ({ t, sent } = fakeTransport(() => ({ status: 403, body: JSON.stringify({ reason: 'ExpiredProviderToken' }) })));
    apns.resetApnsTokenCache();
    await apns.sendApns(cfg, N, t, NOW);
    await apns.sendApns(cfg, N, t, NOW);
    ok(sent[0].headers.authorization !== sent[1].headers.authorization, 'provider token re-minted after a 403');

    // transport failures
    const failing = (e: unknown) => fakeTransport(() => Promise.reject(e) as Promise<never>);
    for (const [e, want, what] of [
      [new apns.ApnsTransportError('timeout', true), { outcome: 'ambiguous', status: null, reason: 'timeout' }, 'timeout after write → ambiguous'],
      [new apns.ApnsTransportError('stream', true), { outcome: 'ambiguous', status: null, reason: 'stream' }, 'stream reset after write → ambiguous'],
      [new apns.ApnsTransportError('connect', false), { outcome: 'retry', status: null, reason: 'connect', retryAfterSeconds: 5 }, 'connect failure → retry'],
      [new apns.ApnsTransportError('refused', false), { outcome: 'retry', status: null, reason: 'refused', retryAfterSeconds: 5 }, 'refused stream (GOAWAY) → retry'],
      [new Error('weird'), { outcome: 'ambiguous', status: null, reason: 'stream' }, 'unclassified error → ambiguous'],
    ] as const) {
      ({ t, sent } = failing(e));
      eq(await apns.sendApns(cfg, N, t, NOW), want, what);
    }

    // the real HTTP/2 transport against a local h2c server (loopback only)
    const seen: Array<Record<string, unknown>> = [];
    const server = http2.createServer();
    server.on('stream', (stream, headers) => {
      let body = '';
      stream.setEncoding('utf8');
      stream.on('data', (c: string) => { body += c; });
      stream.on('end', () => {
        seen.push({ path: headers[':path'], topic: headers['apns-topic'], body });
        if (String(headers[':path']).includes('slow')) return; // never answers
        if (String(headers[':path']).includes('gone')) { stream.respond({ ':status': 410, 'content-type': 'application/json' }); stream.end(JSON.stringify({ reason: 'Unregistered' })); return; }
        stream.respond({ ':status': 200, 'apns-id': String(headers['apns-id']) });
        stream.end();
      });
      stream.on('error', () => undefined);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const hdr = { ':method': 'POST', ':path': '/3/device/abc', 'apns-topic': cfg.topic, 'apns-id': N.apnsId, 'content-type': 'application/json' };
    const res1 = await apns.http2Transport.request(origin, hdr, '{"x":1}', 2000);
    eq([res1.status, res1.headers['apns-id']], [200, N.apnsId], 'h2 transport: status + headers');
    eq(seen[0], { path: '/3/device/abc', topic: cfg.topic, body: '{"x":1}' }, 'h2 transport: request delivered');
    const res2 = await apns.http2Transport.request(origin, { ...hdr, ':path': '/3/device/gone' }, '{}', 2000);
    eq([res2.status, JSON.parse(res2.body).reason], [410, 'Unregistered'], 'h2 transport: error body');
    let err: unknown = null;
    try { await apns.http2Transport.request(origin, { ...hdr, ':path': '/3/device/slow' }, '{}', 150); } catch (e) { err = e; }
    ok(err instanceof apns.ApnsTransportError && err.kind === 'timeout' && err.written === true, 'h2 transport: timeout after write is ambiguous');
    apns.closeApns();
    err = null;
    try { await apns.http2Transport.request('http://127.0.0.1:1', hdr, '{}', 2000); } catch (e) { err = e; }
    ok(err instanceof apns.ApnsTransportError && err.written === false, 'h2 transport: connect failure is not written');
    apns.closeApns();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // ============================================================ audio store
  {
    const key = 'ab' + 'c'.repeat(62);
    eq(audioPath(key), `v1/ab/${key}.mp3`, 'content-addressed path');
    throws(() => audioPath('../etc/passwd'), 'non-hex key refused');
    interface SCall { url: string; method: string; headers: Record<string, string>; body: unknown }
    const sCalls: SCall[] = [];
    let next: () => Response = () => new Response(null, { status: 200 });
    const sf = (async (input: string | URL, init?: RequestInit) => {
      sCalls.push({ url: String(input), method: init?.method ?? 'GET', headers: init?.headers as Record<string, string>, body: init?.body });
      return next();
    }) as typeof fetch;
    const store = supabaseAudioStore(sf);
    const bytes = Buffer.alloc(1500, 3);
    next = () => json({ Key: 'x' });
    await store.put(audioPath(key), bytes, 'audio/mpeg');
    eq([sCalls[0].url, sCalls[0].method], [`https://db.test/storage/v1/object/briefing-audio/v1/ab/${key}.mp3`, 'POST'], 'put url + method');
    eq([sCalls[0].headers['x-upsert'], sCalls[0].headers['Content-Type'], sCalls[0].headers.Authorization, sCalls[0].headers.apikey], ['true', 'audio/mpeg', 'Bearer test-service', 'test-service'], 'put headers (service role, upsert)');
    ok(Buffer.from(sCalls[0].body as Uint8Array).equals(bytes), 'put body is the audio');
    next = () => new Response(bytes, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
    const got = await store.get(audioPath(key));
    eq([sCalls[1].url, sCalls[1].method, got?.equals(bytes)], [`https://db.test/storage/v1/object/authenticated/briefing-audio/v1/ab/${key}.mp3`, 'GET', true], 'get url + bytes');
    next = () => json({ statusCode: '404', error: 'not_found', message: 'Object not found' }, 404);
    eq(await store.get(audioPath(key)), null, '404 → null');
    next = () => json({ statusCode: '404', error: 'not_found', message: 'Object not found' }, 400);
    eq(await store.get(audioPath(key)), null, 'legacy 400/statusCode 404 → null');
    next = () => json({ statusCode: '500', error: 'internal' }, 500);
    await assert.rejects(store.get(audioPath(key)), BriefingStorageError); checks++;
    next = () => json({ statusCode: '403', error: 'Unauthorized' }, 400);
    await assert.rejects(store.get(audioPath(key)), BriefingStorageError); checks++;
    next = () => json({}, 500);
    await assert.rejects(store.put(audioPath(key), bytes, 'audio/mpeg'), BriefingStorageError); checks++;
    next = () => { throw new TypeError('fetch failed'); };
    await assert.rejects(store.get(audioPath(key)), BriefingStorageError); checks++;
    await assert.rejects(store.put('v1/../../x.mp3', bytes, 'audio/mpeg')); checks++;
    sCalls.length = 0;
    next = () => json([]);
    const paths = Array.from({ length: 250 }, (_, i) => audioPath(createHash('sha256').update(String(i)).digest('hex')));
    await store.remove([...paths, 'v1/../../secret']);
    eq(sCalls.length, 3, 'bulk delete in batches of 100');
    eq([sCalls[0].url, sCalls[0].method], ['https://db.test/storage/v1/object/briefing-audio', 'DELETE'], 'delete url + method');
    eq(JSON.parse(String(sCalls[0].body)), { prefixes: paths.slice(0, 100) }, 'delete body {prefixes}');
    eq(JSON.parse(String(sCalls[2].body)).prefixes.length, 50, 'last batch, unsafe path dropped');
    next = () => json({}, 500);
    await assert.rejects(store.remove(paths.slice(0, 1)), BriefingStorageError); checks++;
  }

  // ============================================================ ensureAudio
  {
    const cacheKey = createHash('sha256').update('segment-1').digest('hex');
    // In-memory model of bobby_brief_audio_claim / _commit: a fenced lease per audio row.
    const fakeAudioDb = () => {
      const rows = new Map<string, { state: string; fence: number; leaseUntil: number; attempts: number; path: string | null; bytes: number | null }>();
      const ops: unknown[][] = [];
      const row = (id: string) => { if (!rows.has(id)) rows.set(id, { state: 'queued', fence: 0, leaseUntil: 0, attempts: 0, path: null, bytes: null }); return rows.get(id)!; };
      const db = {
        claimAudio: async (id: string, worker: string, lease: number) => {
          ops.push(['claim', id, worker, lease]);
          await new Promise((r) => setTimeout(r, 1));
          const x = row(id);
          if (x.state === 'ready') return { state: 'ready' };
          if (x.state === 'failed') return { state: 'failed' };
          if (x.leaseUntil > Date.now()) return { state: 'busy' };
          x.fence++; x.leaseUntil = Date.now() + lease * 1000; x.state = 'processing';
          return { state: 'claimed', fence: x.fence, attempts: x.attempts };
        },
        commitAudio: async (id: string, fence: number, state: string, path: string | null, bytes: number | null, error: string | null) => {
          ops.push(['commit', id, fence, state, path, bytes, error]);
          const x = row(id);
          if (x.fence !== fence) return { ok: false, code: 'stale_fence' };
          x.leaseUntil = 0;
          if (state === 'ready') Object.assign(x, { state: 'ready', path, bytes });
          else if (state === 'retry') Object.assign(x, { state: 'queued', attempts: x.attempts + 1 });
          else Object.assign(x, { state: 'failed', attempts: x.attempts + 1 });
          return { ok: true };
        },
      };
      return { db: db as any, rows, ops, row };
    };
    const budgetOps: unknown[][] = [];
    const budgetDb = {
      reserveAttempt: async (p: unknown) => { budgetOps.push(['reserve', p]); return { ok: true, attemptId: `att-${budgetOps.length}` }; },
      dispatchAttempt: async () => undefined,
      settleAttempt: async (...a: unknown[]) => { budgetOps.push(['settle', ...a]); },
    } as any;
    const usage: unknown[] = [];
    const reserveWith = (db = budgetDb) => ((p: any, call: any) => withReservation(p, call, { db, logUsage: async (r: any) => { usage.push(r); } })) as typeof withReservation;
    const stored: Array<{ path: string; bytes: Buffer; mime: string }> = [];
    const memStore = { put: async (path: string, bytes: Buffer, mime: string) => { stored.push({ path, bytes, mime }); }, get: async () => null, remove: async () => undefined };
    let ttsCalls = 0;
    const slowTts = (async (text: string, voice: string, language: string) => {
      ttsCalls++;
      await new Promise((r) => setTimeout(r, 30));
      return { ok: true as const, value: Buffer.alloc(4096, 1), usd: text.length * 0.000017, estimated: true, usage: { chars: text.length, latencyMs: 30 } };
    }) as any;
    const P = { audioId: 'aud-1', cacheKey, text: 'Bitcoin cotiza estable esta mañana.', voice: 'ash', language: 'es' as const, worker: 'w-a' };

    // single flight: two concurrent callers → one synthesis
    let fdb = fakeAudioDb();
    const [a, b] = await Promise.all([
      ensureAudio(P, { db: fdb.db, store: memStore, tts: slowTts, withReservation: reserveWith() }),
      ensureAudio({ ...P, worker: 'w-b' }, { db: fdb.db, store: memStore, tts: slowTts, withReservation: reserveWith() }),
    ]);
    eq(ttsCalls, 1, 'two concurrent callers → exactly one TTS call');
    eq([a, b].map((x) => x.state).sort(), ['processing', 'ready'], 'one synthesizes, the other joins');
    eq([a, b].find((x) => x.state === 'processing'), { state: 'processing', retryAfterSeconds: 2 }, 'joiner polls in 2 s');
    eq(stored.length, 1, 'stored once');
    eq([stored[0].path, stored[0].mime, stored[0].bytes.length], [audioPath(cacheKey), 'audio/mpeg', 4096], 'stored at the content-addressed path');
    eq(fdb.ops.filter((o) => o[0] === 'commit'), [['commit', 'aud-1', 1, 'ready', audioPath(cacheKey), 4096, null]], 'committed ready under its fence');
    const reserveArgs = budgetOps.find((o) => o[0] === 'reserve')![1] as any;
    eq([reserveArgs.kind, reserveArgs.workRef, reserveArgs.provider, reserveArgs.model, reserveArgs.reserveUsd], ['tts', `audio:${cacheKey}`, 'openai', 'gpt-4o-mini-tts', providers.ttsReserveUsd(P.text.length)], 'tts reservation for the cache key');
    eq(await ensureAudio(P, { db: fdb.db, store: memStore, tts: slowTts, withReservation: reserveWith() }), { state: 'ready' }, 'later caller: ready, no synthesis');
    eq(ttsCalls, 1, 'still one TTS call');

    // kill switch
    process.env.BOBBY_BRIEFINGS_ENABLED = 'off';
    fdb = fakeAudioDb();
    eq(await ensureAudio(P, { db: fdb.db, store: memStore, tts: slowTts, withReservation: reserveWith() }), { state: 'failed' }, 'disabled → failed');
    eq([fdb.ops.length, ttsCalls], [0, 1], 'disabled: no DB or provider call');
    process.env.BOBBY_BRIEFINGS_ENABLED = 'on';

    // failed row stays failed
    fdb = fakeAudioDb(); fdb.row('aud-1').state = 'failed';
    eq(await ensureAudio(P, { db: fdb.db, store: memStore, tts: slowTts, withReservation: reserveWith() }), { state: 'failed' }, 'failed row → failed');

    // budget refusal → retry, queued, no TTS
    fdb = fakeAudioDb();
    const refusing = { ...budgetDb, reserveAttempt: async () => ({ ok: false, code: 'slots_full' }) };
    eq(await ensureAudio(P, { db: fdb.db, store: memStore, tts: slowTts, withReservation: reserveWith(refusing) }), { state: 'queued', retryAfterSeconds: 3 }, 'slots full → queued');
    eq([fdb.ops.at(-1)![3], fdb.ops.at(-1)![6], ttsCalls], ['release', 'slots_full', 1], 'slots refusal releases the row without spending an attempt, no TTS');
    delete process.env.BOBBY_BRIEFINGS_MONTHLY_CAP_USD;
    fdb = fakeAudioDb();
    eq(await ensureAudio(P, { db: fdb.db, store: memStore, tts: slowTts, withReservation: reserveWith() }), { state: 'queued', retryAfterSeconds: 60 }, 'no caps → queued, no spend');
    eq(ttsCalls, 1, 'no caps: no TTS');
    process.env.BOBBY_BRIEFINGS_MONTHLY_CAP_USD = '50';
    fdb = fakeAudioDb();
    eq(await ensureAudio(P, { db: fdb.db, store: memStore, tts: slowTts, withReservation: reserveWith({ ...budgetDb, reserveAttempt: async () => ({ ok: false, code: 'attempts_exhausted' }) }) }), { state: 'failed' }, 'attempts exhausted → failed');
    eq(fdb.ops.at(-1)![3], 'failed', 'committed failed');

    // provider failures
    const failTts = (outcome: 'no_charge' | 'unknown') => (async () => { ttsCalls++; return { ok: false as const, outcome, code: outcome === 'unknown' ? 'timeout' : 'http_500', status: outcome === 'unknown' ? null : 500, latencyMs: 5 }; }) as any;
    fdb = fakeAudioDb();
    eq(await ensureAudio(P, { db: fdb.db, store: memStore, tts: failTts('no_charge'), withReservation: reserveWith() }), { state: 'queued', retryAfterSeconds: 5 }, 'first provider failure → retry');
    eq(fdb.ops.at(-1)![3], 'retry', 'committed retry');
    eq(await ensureAudio(P, { db: fdb.db, store: memStore, tts: failTts('no_charge'), withReservation: reserveWith() }), { state: 'failed' }, 'second provider failure → failed (cap 2)');
    eq(fdb.ops.at(-1)![3], 'failed', 'committed failed');
    fdb = fakeAudioDb();
    eq(await ensureAudio(P, { db: fdb.db, store: memStore, tts: failTts('unknown'), withReservation: reserveWith() }), { state: 'queued', retryAfterSeconds: 15 }, 'unknown → retry later (blocked until reconcile)');
    eq(fdb.ops.at(-1)![6], 'provider_unknown', 'unknown recorded');

    // storage put failure after synthesis → retry
    fdb = fakeAudioDb();
    const badStore = { ...memStore, put: async () => { throw new BriefingStorageError('storage:put', 500); } };
    const before = ttsCalls;
    eq(await ensureAudio(P, { db: fdb.db, store: badStore, tts: slowTts, withReservation: reserveWith() }), { state: 'queued', retryAfterSeconds: 5 }, 'upload failure → queued');
    eq([fdb.ops.at(-1)![3], fdb.ops.at(-1)![6], ttsCalls - before], ['retry', 'storage', 1], 'upload failure committed retry');

    // DB down at claim propagates (router answers 503)
    const downDb = { claimAudio: async () => { throw new BriefingStorageError('bobby_brief_audio_claim', null); } } as any;
    await assert.rejects(ensureAudio(P, { db: downDb, store: memStore, tts: slowTts, withReservation: reserveWith() }), BriefingStorageError); checks++;
    ok(usage.every((u: any) => !JSON.stringify(u).includes('Bitcoin')), 'narration text never reaches the ledger');
  }

  await Promise.all(deferred.splice(0));
  console.log(`briefings-core: ${checks} checks passed`);
} finally {
  globalThis.fetch = originalFetch;
}
