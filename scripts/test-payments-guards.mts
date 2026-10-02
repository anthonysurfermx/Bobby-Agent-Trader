// Launch guards from the payments security audit (2026-10-02): a RevenueCat Test Store entitlement never grants
// production Pro (RC-01), and checkout refuses an account that already has Bobby Pro (STRIPE-04). Mocked HTTP only.
import assert from 'node:assert/strict';
process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
process.env.BOBBY_SUPABASE_ANON_KEY = 'test-anon';
process.env.REVENUECAT_SECRET_KEY = 'test-rc';
let checks = 0;
const eq = (a: unknown, b: unknown, what: string) => { assert.deepEqual(a, b, what); checks++; };
const subs = new Map<string, Record<string, unknown>>();
let subscriber: Record<string, unknown> = {};
const writes: Array<Record<string, unknown>> = [];
globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const u = new URL(String(input));
  if (u.hostname === 'api.revenuecat.com') return Response.json({ subscriber });
  if (u.pathname === '/rest/v1/bobby_subscriptions') {
    if (init?.method === 'POST') { const b = JSON.parse(String(init.body)); writes.push(b); subs.set(b.identity_id, { ...subs.get(b.identity_id), ...b }); return new Response(null, { status: 204 }); }
    const id = (u.searchParams.get('identity_id') ?? '').replace('eq.', '');
    return Response.json(subs.has(id) ? [subs.get(id)] : []);
  }
  if (u.pathname === '/auth/v1/user') return Response.json({ id: '11111111-1111-4111-8111-111111111111', email: 'buyer@example.test', app_metadata: { provider: 'google' } });
  if (u.pathname === '/rest/v1/bobby_identities') return Response.json([{ id: 'id-buyer', auth_user_id: '11111111-1111-4111-8111-111111111111', wallet_address: null }]);
  if (u.hostname === 'api.stripe.com') { stripeCalls++; return Response.json({ url: 'https://checkout.stripe.test/s' }); }
  return new Response(null, { status: 204 });
}) as typeof fetch;
let stripeCalls = 0;
const { syncRevenueCat } = await import('../api/_lib/revenuecat.ts');
const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
const ent = (store: string) => ({ entitlements: { pro: { expires_date: future, product_identifier: 'p' } }, subscriptions: { p: { store, expires_date: future } } });

// RC-01: a Test Store "purchase" on an account with nothing grants nothing and writes nothing.
subscriber = ent('test_store');
eq(await syncRevenueCat('00000000-0000-4000-8000-000000000001', 'id-test'), false, 'Test Store does not grant Pro');
eq(writes.length, 0, 'Test Store writes no subscription');
// It does not overwrite a real Apple subscription either.
subs.set('id-apple', { identity_id: 'id-apple', provider: 'apple', status: 'active', current_period_end: future });
eq(await syncRevenueCat('00000000-0000-4000-8000-000000000002', 'id-apple'), true, 'real Pro stays');
eq(subs.get('id-apple')?.status, 'active', 'real Apple row untouched');
// A real App Store purchase still grants Pro.
subscriber = ent('app_store');
eq(await syncRevenueCat('00000000-0000-4000-8000-000000000003', 'id-real'), true, 'App Store grants Pro');
eq(subs.get('id-real')?.status, 'active', 'App Store row active');

// STRIPE-04: checkout refuses an account that already has Bobby Pro; sells to one that does not.
process.env.STRIPE_SECRET_KEY = 'sk_test_x'; process.env.STRIPE_PRICE_ID = 'price_x';
const { default: access } = await import('../api/bobby-access.ts');
const call = async () => {
  const res: { statusCode: number; body: any; status(c: number): any; json(b: unknown): any; setHeader(): void } = {
    statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {} };
  await access({ method: 'POST', body: { action: 'checkout' }, query: {}, headers: { authorization: 'Bearer user-token', 'x-forwarded-for': `10.9.0.${Math.floor(Math.random() * 200)}`, host: 'bobbyprotocol.xyz' } } as never, res as never);
  return res;
};
subs.set('id-buyer', { identity_id: 'id-buyer', provider: 'apple', status: 'active', current_period_end: future });
let r = await call();
eq([r.statusCode, r.body?.code, stripeCalls], [409, 'already_pro', 0], 'Apple Pro is not sold a second plan');
subs.set('id-buyer', { identity_id: 'id-buyer', provider: 'stripe', status: 'past_due', current_period_end: future, stripe_customer_id: 'cus_1' });
r = await call();
eq([r.statusCode, r.body?.code, stripeCalls], [409, 'already_pro', 0], 'a past_due card plan is not doubled');
subs.set('id-buyer', { identity_id: 'id-buyer', provider: 'stripe', status: 'canceled', current_period_end: future, stripe_customer_id: 'cus_1' });
r = await call();
eq([r.statusCode, r.body?.url, stripeCalls], [200, 'https://checkout.stripe.test/s', 1], 'a canceled plan can buy again');

console.log(`payments-guards: ${checks} checks passed`);
