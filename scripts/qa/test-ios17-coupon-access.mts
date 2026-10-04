// Offline handler regressions for the build-63 coupon receipt and access contract.
// Usage: node --import tsx scripts/qa/test-ios17-coupon-access.mts /absolute/candidate
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const source = process.argv[2];
assert.ok(source?.startsWith('/'), 'An explicit absolute candidate source is required');
process.env.BOBBY_SUPABASE_URL = 'https://qa-coupon.invalid';
process.env.BOBBY_SUPABASE_ANON_KEY = 'offline-anon';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'offline-service';
process.env.RATE_LIMIT_SALT = 'offline-coupon-isolation-salt-32';
for (const name of ['BOBBY_AUTH_URL', 'BOBBY_AUTH_ANON_KEY', 'BOBBY_PAYWALL']) delete process.env[name];
const { default: handler } = await import(pathToFileURL(resolve(source, 'api/bobby-access.ts')).href);

const AUTH = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const FOREIGN = '33333333-3333-4333-8333-333333333333';
const json = (body: unknown, status = 200) => Response.json(body, { status });
let checks = 0, scenarios = 0, sequence = 0;
const eq = (actual: unknown, expected: unknown, reason: string) => { assert.deepEqual(actual, expected, reason); checks++; };
const ok = (actual: unknown, reason: string) => { assert.ok(actual, reason); checks++; };
interface Fixture {
  authStatus?: number;
  token?: string | null;
  accountLimited?: boolean;
  networkLimited?: boolean;
  counterDown?: boolean;
  rpcStatus?: number;
  result?: string;
  accessDown?: boolean;
  levelsDown?: boolean;
  body?: Record<string, unknown>;
}
const original = globalThis.fetch;
async function call(fixture: Fixture = {}) {
  const outbound: Array<{ url: string; method: string; body: any }> = [];
  globalThis.fetch = (async (input, init = {}) => {
    const url = String(input), method = init.method ?? 'GET';
    assert.ok(url.startsWith('https://qa-coupon.invalid/'), 'Every outbound operation stays inside the test transport');
    const body = init.body ? JSON.parse(String(init.body)) : null;
    outbound.push({ url, method, body });
    if (url.endsWith('/auth/v1/user')) return json({ id: AUTH, app_metadata: { provider: 'apple' } }, fixture.authStatus ?? 200);
    if (url.includes('/bobby_identities?')) {
      eq(body.auth_user_id, AUTH, 'Identity mapping uses the verified token subject');
      return json([{ id: OWNER, auth_user_id: AUTH, wallet_address: null }]);
    }
    if (url.includes('/api_cache')) {
      const key = decodeURIComponent(url);
      const couponCounter = key.includes('bobby-coupon-') || String(body?.cache_key).includes('bobby-coupon-');
      if (fixture.counterDown && couponCounter) return json({}, 503);
      if (method === 'POST') return new Response(null, { status: 204 });
      const count = fixture.accountLimited && key.includes('bobby-coupon-account') ? 10
        : fixture.networkLimited && key.includes('bobby-coupon-network') ? 30 : null;
      return json(count === null ? [] : [{ payload: { count }, expires_at: new Date(Date.now() + 3600000).toISOString() }]);
    }
    if (url.endsWith('/rpc/bobby_redeem_coupon')) return json({
      result: fixture.result ?? 'redeemed',
      ...(fixture.result === 'already_redeemed' ? {} : { granted: { reads: 5, profundo: 2, maximo: 1 }, bonus: { reads: 7, profundo: 4, maximo: 2 } }),
    }, fixture.rpcStatus ?? 200);
    if (url.endsWith('/rpc/bobby_read_access')) return json({ tier: 'free', used: 10, limit: 10, remaining: 0, bonus: 6, paywall: true, resetsAt: null }, fixture.accessDown ? 503 : 200);
    if (url.endsWith('/rpc/bobby_level_state')) return json({ tier: 'free', levels: {
      profundo: { used: 3, limit: 3, remaining: 0, windowDays: 7, bonus: 3, resetsAt: null },
      maximo: { used: 1, limit: 1, remaining: 0, windowDays: 7, bonus: 1, resetsAt: null },
    } }, fixture.levelsDown ? 503 : 200);
    throw new Error(`Unexpected test route: ${method} ${url}`);
  }) as typeof fetch;
  const headers: Record<string, string> = { 'x-forwarded-for': `10.61.${Math.floor(++sequence / 250)}.${sequence % 250 + 1}`, 'x-bobby-platform': 'ios' };
  if (fixture.token !== null) headers.authorization = `Bearer ${fixture.token ?? 'offline-token'}`;
  const res = { statusCode: 200, body: null as any, headers: {} as Record<string, string>, setHeader(name: string, value: string) { this.headers[name.toLowerCase()] = value; }, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; } };
  await handler({ method: 'POST', headers, body: fixture.body ?? { action: 'redeem-coupon', code: 'QA-17' } } as never, res as never);
  scenarios++;
  return { res, outbound, redeem: outbound.filter(x => x.url.endsWith('/rpc/bobby_redeem_coupon')) };
}

try {
  for (const fixture of [{ token: null }, { authStatus: 401 }, { authStatus: 503 }]) {
    const r = await call(fixture);
    eq(r.res.statusCode, fixture.authStatus === 503 ? 503 : 401, 'Missing/invalid credentials and auth outages refuse redemption');
    eq(r.redeem.length, 0, 'No coupon RPC without a verified account');
  }
  const invalid = await call({ body: { action: 'redeem-coupon', code: 'x' } });
  eq([invalid.res.statusCode, invalid.res.body.result, invalid.redeem.length], [400, 'invalid_code', 0], 'Malformed code never reaches redemption');
  for (const fixture of [{ accountLimited: true }, { networkLimited: true }, { counterDown: true }]) {
    const r = await call(fixture);
    eq([r.res.statusCode, r.res.body.result, r.redeem.length], [429, 'rate_limited', 0], 'Account/network caps and counter outages fail closed');
  }
  const success = await call({ body: { action: 'redeem-coupon', code: ' q a - 1 7 ', identityId: FOREIGN, p_identity: FOREIGN } });
  eq([success.res.statusCode, success.res.body.result, success.redeem.length], [200, 'redeemed', 1], 'Confirmed coupon returns one receipt');
  eq(success.redeem[0].body, { p_identity: OWNER, p_code: 'QA-17' }, 'Body-supplied ownership is ignored and code is normalized');
  eq(success.res.body.granted, { reads: 5, profundo: 2, maximo: 1 }, 'Granted credits preserve the authoritative redemption receipt');
  for (const read of success.outbound.filter(x => /rpc\/bobby_(read_access|level_state)$/.test(x.url))) {
    eq(read.body.p_identity, OWNER, 'Post-redemption balances are scoped to the same verified owner');
    eq(read.body.p_device, null, 'Account quota reads never substitute another device');
  }
  eq(success.res.headers['cache-control'], 'private, no-store', 'Gift and quota receipts are never publicly cached');
  const replay = await call({ result: 'already_redeemed' });
  eq([replay.res.statusCode, replay.res.body.result, replay.res.body.granted, replay.res.body.bonus], [200, 'already_redeemed', null, null], 'Replay never invents a new grant or a missing RPC balance');
  eq([replay.res.body.access.bonus, replay.res.body.levels.levels.profundo.bonus, replay.res.body.levels.levels.maximo.bonus], [6, 3, 1], 'Replay reports separately observed current balances');
  const outage = await call({ rpcStatus: 503 });
  eq([outage.res.statusCode, outage.res.body.granted], [502, undefined], 'Failed redemption RPC cannot produce a success receipt');
  const partial = await call({ accessDown: true, levelsDown: true });
  eq([partial.res.statusCode, partial.res.body.result, partial.res.body.granted], [200, 'redeemed', { reads: 5, profundo: 2, maximo: 1 }], 'Already committed redemption keeps its confirmed grant through a later balance outage');
  eq(partial.res.body.levels, null, 'Failed premium balance is absent');
  eq(partial.res.body.access.tier, 'anon', 'Failed account balance is distinguishable from a verified account snapshot');
  ok(partial.res.body.access.tier !== 'free' && partial.res.body.access.tier !== 'pro', 'Native account-tier validation can discard the unavailable snapshot');
  for (const result of ['expired', 'exhausted', 'invalid_code', 'account_required']) {
    const refused = await call({ result });
    eq([refused.res.body.result, refused.res.body.granted], [result, null], 'Denied coupon outcome never becomes a grant');
  }
  console.log(JSON.stringify({ result: 'PASS', checks, scenarios, source, scope: 'Actual coupon/access handler with strict offline HTTP, verified-owner binding, rate and outage cases; no real coupon/account/purchase/production writes.' }));
} finally {
  globalThis.fetch = original;
}
