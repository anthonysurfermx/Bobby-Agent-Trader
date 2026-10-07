import assert from 'node:assert/strict';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Authentication, entitlements and provider responses are fixtures. No remote requests or real credentials.
process.env.BOBBY_SUPABASE_URL = 'https://model-access.test';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
process.env.BOBBY_SUPABASE_ANON_KEY = 'test-anon';
process.env.BOBBY_AUTH_URL = 'https://model-access.test';
process.env.ANTHROPIC_API_KEY = 'test-anthropic';
process.env.RATE_LIMIT_SALT = 'test-model-access-salt';
delete process.env.BOBBY_LLM_PRIMARY;
delete process.env.BOBBY_APP_TEXT_MODEL;
delete process.env.BOBBY_PRO_TEXT_MODEL;

const { resolveAppRequestTier, resolveAppWalletTier } = await import('../api/_lib/app-model-access.ts');
const { default: explain } = await import('../api/explain.ts');
const { default: router } = await import('../api/bobby-router.ts');
const originalFetch = globalThis.fetch;
const proId = '11111111-1111-4111-8111-111111111111';
const freeId = '22222222-2222-4222-8222-222222222222';
const verifiedWallet = '0x1111111111111111111111111111111111111111';
let authUnavailable = false;
let planUnavailable = false;
let walletEntitlement: unknown = true;
let requests: Array<{ url: string; body: any; headers: Headers }> = [];
let checks = 0;
const eq = (got: unknown, want: unknown, message: string) => { assert.deepEqual(got, want, message); checks++; };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const url = String(input);
  const headers = new Headers(init?.headers);
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  requests.push({ url, body, headers });
  if (url === 'https://model-access.test/auth/v1/user') {
    if (authUnavailable) return json({}, 503);
    const token = headers.get('Authorization');
    if (token !== 'Bearer verified-pro' && token !== 'Bearer verified-free') return json({}, 401);
    return json({ id: token === 'Bearer verified-pro' ? proId : freeId, app_metadata: { provider: 'apple' } });
  }
  if (url.includes('/rest/v1/bobby_identities?')) {
    if (init?.method === 'POST') return json([{ id: body.auth_user_id, auth_user_id: body.auth_user_id, wallet_address: null }]);
    return json(url.includes(verifiedWallet) ? [{ id: proId }] : []);
  }
  if (url.endsWith('/rpc/bobby_read_access')) {
    if (planUnavailable) return json({}, 503);
    return json({ tier: body.p_identity === proId ? 'pro' : 'free', bonus: 999, used: 0, limit: 20 });
  }
  if (url.endsWith('/rpc/bobby_is_pro')) return planUnavailable ? json({}, 503) : json(walletEntitlement);
  if (url.startsWith('https://model-access.test/rest/v1/')) return json([]);
  assert.equal(url, 'https://api.anthropic.com/v1/messages', 'unexpected network request blocked');
  if (body.stream) {
    const events = [
      { type: 'message_start', message: { usage: { input_tokens: 8, output_tokens: 0 } } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Fixture explanation.' } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 4 } },
      { type: 'message_stop' },
    ];
    return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''));
  }
  const classification = { intent: 'trade_chat', confidence: 0.9, language: 'es', reason: 'Fixture classification.' };
  return body.output_config?.format?.type === 'json_schema'
    ? json({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(classification) }], usage: { input_tokens: 8, output_tokens: 4 } })
    : json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'classify_intent', input: classification }], usage: { input_tokens: 8, output_tokens: 4 } });
}) as typeof fetch;

let requestNumber = 0;
function request(token?: string, body: Record<string, unknown> = {}): VercelRequest {
  return { method: 'POST', body, headers: { origin: 'https://bobbyprotocol.xyz', 'x-forwarded-for': `192.0.2.${++requestNumber}`, 'x-bobby-device': 'model-access-fixture-device', ...(token ? { authorization: `Bearer ${token}` } : {}) } } as unknown as VercelRequest;
}
function response() {
  return { statusCode: 200, body: null as any, output: '', writableEnded: false, headersSent: false,
    setHeader() {}, once() {}, removeListener() {},
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    write(text: string) { this.output += text; this.headersSent = true; },
    end() { this.writableEnded = true; },
  };
}
const identity = { id: proId, authUserId: proId, wallet: null, via: 'supabase' as const };
const noMeterWrites = () => eq(requests.some(r => /rpc\/bobby_consume_(read|level|desk_quota)/.test(r.url)), false, 'tier checks never spend quota');

try {
  requests = [];
  eq(await resolveAppRequestTier(request(undefined, { tier: 'pro', isPro: true, model: 'claude-opus-5-5', level: 'maximo', bonus: 999 })), 'free', 'anonymous caller cannot select Pro through body fields');
  eq(requests.length, 0, 'anonymous tier needs no auth or entitlement lookup');
  eq(await resolveAppRequestTier(request('client-says-pro')), 'free', 'invalid bearer cannot select Pro');
  eq(await resolveAppRequestTier(request('verified-pro')), 'pro', 'verified account with server Pro entitlement selects Pro');
  eq(await resolveAppRequestTier(request('verified-free', { tier: 'pro', level: 'maximo' })), 'free', 'gifted credits and a premium level do not upgrade a free account');
  noMeterWrites();

  requests = [];
  eq(await resolveAppRequestTier(request(), { identity, access: { tier: 'pro' } }), 'pro', 'desk reuses its already-verified access result');
  eq(requests.length, 0, 'desk does not repeat auth or the read meter');
  eq(await resolveAppRequestTier(request(), { identity: null }), 'free', 'known anonymous caller remains free');
  eq(requests.length, 0, 'known anonymous caller is not resolved twice');
  eq(await resolveAppRequestTier(request(), { identity }), 'pro', 'verified identity can reuse only the entitlement lookup');
  eq(requests.some(r => r.url.includes('/auth/v1/user')), false, 'known identity is not authenticated twice');

  authUnavailable = true;
  eq(await resolveAppRequestTier(request('verified-pro')), 'free', 'authentication outage cannot grant expensive model access');
  authUnavailable = false;
  planUnavailable = true;
  eq(await resolveAppRequestTier(request('verified-pro')), 'free', 'entitlement outage cannot grant expensive model access');
  planUnavailable = false;

  requests = [];
  eq(await resolveAppWalletTier(null), 'free', 'missing verified owner stays free');
  eq(await resolveAppWalletTier('not-a-wallet'), 'free', 'malformed owner stays free');
  eq(requests.length, 0, 'invalid wallet never reaches storage');
  eq(await resolveAppWalletTier(verifiedWallet), 'pro', 'verified signer or persisted owner resolves through server entitlement');
  eq(requests.at(-1)?.body, { p_identity: proId }, 'owner entitlement is checked against the looked-up identity');
  walletEntitlement = 'true';
  eq(await resolveAppWalletTier(verifiedWallet), 'free', 'non-boolean entitlement fails closed');
  walletEntitlement = true;
  planUnavailable = true;
  eq(await resolveAppWalletTier(verifiedWallet), 'free', 'owner entitlement outage fails closed');
  planUnavailable = false;
  noMeterWrites();

  // Exercise the actual streaming and tool routes, not only their helper.
  for (const token of ['verified-pro', 'verified-free', undefined]) {
    for (const [handler, body] of [
      [explain, { context: 'wallet', data: {}, language: 'es', level: 'maximo', tier: 'pro' }],
      [router, { message: '¿Qué piensas de BTC?', tier: 'pro' }],
    ] as const) {
      requests = [];
      const res = response();
      await handler(request(token, body), res as unknown as VercelResponse);
      eq(res.statusCode, 200, 'valid text request completes');
      const calls = requests.filter(r => r.url === 'https://api.anthropic.com/v1/messages');
      eq(calls.length, 1, 'one provider request per text surface');
      eq(calls[0].body.model, token === 'verified-pro' ? 'claude-opus-5-5' : 'claude-haiku-5-5', 'text surface obeys verified plan rather than supplied body');
      if (handler === explain) eq(res.output.endsWith('data: [DONE]\n\n'), true, 'stream completes with the existing app marker');
      else eq(res.body.intent, 'trade_chat', 'tool contract survives tier routing');
      noMeterWrites();
    }
  }
  console.log(`App model access: ${checks} checks passed`);
} finally {
  globalThis.fetch = originalFetch;
}
