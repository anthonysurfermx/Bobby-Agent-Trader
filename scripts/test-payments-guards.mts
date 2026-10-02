// Launch guards from the payments security audits (2026-10-02, our agents + Codex). Mocked HTTP only.
//   RC-01  only a real App Store subscription grants Pro; Test Store / no-store entitlements never do, and a row an
//          earlier sync granted from them is revoked; a card subscription from the Stripe webhook is never touched.
//   RC-02  BOBBY_SANDBOX_PRO_UIDS, when set, limits Apple sandbox Pro to those auth users.
//   STRIPE-04  checkout refuses an account that already has a live plan, and fails closed when it cannot tell.
//   STRIPE-01  subscription webhooks save the live subscription, not the event snapshot; a deleted account is no retry.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
process.env.BOBBY_SUPABASE_ANON_KEY = 'test-anon';
process.env.REVENUECAT_SECRET_KEY = 'test-rc';
let checks = 0;
const eq = (a: unknown, b: unknown, what: string) => { assert.deepEqual(a, b, what); checks++; };

const subs = new Map<string, Record<string, unknown>>();
let subscriber: Record<string, unknown> = {};
let writes: Array<Record<string, unknown>> = [];
let stripeCalls: string[] = [];
let stripeQueries: string[] = [];
let stripeSubscription: Record<string, unknown> = {};
let subscriptionReadFails = false;
let upsertStatus = 204;
let stripeDown = false;
let stripeSubsList: Array<Record<string, unknown>> = [];
let openSessions: Array<Record<string, unknown>> = [];
let lastSessionForm: URLSearchParams | null = null;
globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const u = new URL(String(input));
  if (u.hostname === 'api.revenuecat.com') return Response.json({ subscriber });
  if (u.hostname === 'api.stripe.com') {
    const m = init?.method ?? 'GET';
    stripeCalls.push(`${m} ${u.pathname}`);
    if (u.pathname === '/v1/customers/search' || u.pathname === '/v1/subscriptions/search') stripeQueries.push(u.searchParams.get('query') ?? '');
    if (stripeDown) return Response.json({ error: { message: 'down' } }, { status: 500 });
    if (u.pathname === '/v1/customers/search') return Response.json({ data: [] });
    if (u.pathname === '/v1/customers' && m === 'POST') return Response.json({ id: 'cus_new' });
    if (u.pathname === '/v1/subscriptions' && m === 'GET') return Response.json({ data: stripeSubsList });
    if (u.pathname === '/v1/checkout/sessions' && m === 'GET') return Response.json({ data: openSessions });
    if (u.pathname === '/v1/checkout/sessions' && m === 'POST') { lastSessionForm = new URLSearchParams(String(init?.body)); return Response.json({ url: 'https://checkout.stripe.test/s' }); }
    if (u.pathname.startsWith('/v1/subscriptions/') && m === 'DELETE') return Response.json({ id: u.pathname.split('/').pop(), status: 'canceled' });
    if (u.pathname.startsWith('/v1/subscriptions/')) return Response.json(stripeSubscription);
    return Response.json({});
  }
  if (u.pathname === '/auth/v1/user') return Response.json({ id: '11111111-1111-4111-8111-111111111111', email: 'buyer@example.test', app_metadata: { provider: 'google' } });
  if (u.pathname === '/rest/v1/bobby_identities') return Response.json([{ id: 'id-buyer', auth_user_id: '11111111-1111-4111-8111-111111111111', wallet_address: null }]);
  if (u.pathname === '/rest/v1/bobby_subscriptions') {
    if (init?.method === 'POST') {
      if (upsertStatus !== 204) return new Response(upsertStatus === 409 ? '{"code":"23503","message":"fk"}' : '{"code":"23505"}', { status: upsertStatus });
      const b = JSON.parse(String(init.body)); writes.push(b); subs.set(b.identity_id, { ...subs.get(b.identity_id), ...b }); return new Response(null, { status: 204 });
    }
    if (subscriptionReadFails) return new Response('{}', { status: 503 });
    const id = (u.searchParams.get('identity_id') ?? '').replace('eq.', '');
    return Response.json(subs.has(id) ? [subs.get(id)] : []);
  }
  return new Response(null, { status: 204 });
}) as typeof fetch;

const { syncRevenueCat } = await import('../api/_lib/revenuecat.ts');
const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
const later = new Date(Date.now() + 60 * 86_400_000).toISOString();
const ent = (product = 'p') => ({ pro: { expires_date: future, product_identifier: product } });
const reset = () => { subs.clear(); writes = []; stripeCalls = []; stripeQueries = []; subscriptionReadFails = false; upsertStatus = 204; stripeDown = false; stripeSubsList = []; openSessions = []; lastSessionForm = null; delete process.env.BOBBY_SANDBOX_PRO_UIDS; };
const UID = '00000000-0000-4000-8000-000000000001';

// ---------------- RC-01 ----------------
reset();
subscriber = { entitlements: ent(), subscriptions: { p: { store: 'test_store', expires_date: future } } };
eq(await syncRevenueCat(UID, 'id-a'), false, 'Test Store does not grant Pro');
eq(writes.length, 0, 'Test Store writes nothing on an account without a plan');

reset();
subscriber = { entitlements: ent(), subscriptions: { p: { expires_date: future } } };
eq(await syncRevenueCat(UID, 'id-a'), false, 'an entitlement without a store is never presumed App Store');

reset();
subscriber = { entitlements: ent(), subscriptions: {} };
eq(await syncRevenueCat(UID, 'id-a'), false, 'an entitlement without a subscription record grants nothing');

reset();
subs.set('id-b', { identity_id: 'id-b', provider: 'apple', status: 'active', current_period_end: future, stripe_subscription_id: null });
subscriber = { entitlements: ent(), subscriptions: { p: { store: 'test_store', expires_date: future } } };
eq(await syncRevenueCat(UID, 'id-b'), false, 'a Pro row granted earlier from the Test Store is revoked');
eq(subs.get('id-b')?.status, 'expired', 'revoked row is expired');

reset();
subs.set('id-c', { identity_id: 'id-c', provider: 'stripe', status: 'active', current_period_end: future, stripe_subscription_id: null });
subscriber = { entitlements: ent(), subscriptions: { p: { store: 'test_store', expires_date: future } } };
eq(await syncRevenueCat(UID, 'id-c'), false, 'a non-Apple row written by an old sync (no Stripe id) is revoked too');
eq(subs.get('id-c')?.status, 'expired', 'old test-store row labelled stripe is expired');

reset();
subs.set('id-d', { identity_id: 'id-d', provider: 'stripe', status: 'active', current_period_end: future, stripe_subscription_id: 'sub_real' });
subscriber = { entitlements: ent(), subscriptions: { p: { store: 'test_store', expires_date: future } } };
eq(await syncRevenueCat(UID, 'id-d'), true, 'a real card subscription keeps Pro');
eq(writes.length, 0, 'the Stripe row is never touched by a RevenueCat sync');

reset();
subscriber = { entitlements: ent('t'), subscriptions: { t: { store: 'test_store', expires_date: later }, a: { store: 'app_store', expires_date: future } } };
eq(await syncRevenueCat(UID, 'id-e'), true, 'a real App Store subscription beside a Test Store one grants Pro');
eq([subs.get('id-e')?.provider, subs.get('id-e')?.status, subs.get('id-e')?.product_id, subs.get('id-e')?.environment], ['apple', 'active', 'a', 'production'], 'row comes from the App Store record');

reset();
subscriber = { entitlements: ent(), subscriptions: { p: { store: 'app_store', expires_date: future, refunded_at: new Date().toISOString() } } };
subs.set('id-f', { identity_id: 'id-f', provider: 'apple', status: 'active', current_period_end: future });
eq(await syncRevenueCat(UID, 'id-f'), false, 'a refunded App Store subscription is not Pro');
eq(subs.get('id-f')?.status, 'refunded', 'refund is recorded as refunded');

reset();
subscriber = { subscriptions: { p: { store: 'app_store', expires_date: future } } };
subs.set('id-g', { identity_id: 'id-g', provider: 'apple', status: 'active', current_period_end: future });
eq(await syncRevenueCat(UID, 'id-g'), false, 'no entitlement means no Pro');
eq(subs.get('id-g')?.status, 'expired', 'Apple row expires when the entitlement is gone');

// Red team (2026-10-02): a live card plan is never relabelled 'apple' by a RevenueCat sync.
reset();
subs.set('id-k', { identity_id: 'id-k', provider: 'stripe', status: 'active', current_period_end: future, stripe_subscription_id: 'sub_live', stripe_customer_id: 'cus_k' });
subscriber = { entitlements: ent('a'), subscriptions: { a: { store: 'app_store', expires_date: later } } };
eq(await syncRevenueCat(UID, 'id-k'), true, 'card plan + Apple plan: Pro');
eq([writes.length, subs.get('id-k')?.provider], [0, 'stripe'], 'a live Stripe row is never rewritten by RevenueCat');
reset();
subs.set('id-l', { identity_id: 'id-l', provider: 'stripe', status: 'past_due', current_period_end: future, stripe_subscription_id: 'sub_live' });
subscriber = { entitlements: ent('a'), subscriptions: { a: { store: 'app_store', expires_date: new Date(Date.now() - 1000).toISOString() } } };
eq(await syncRevenueCat(UID, 'id-l'), false, 'past_due card + expired Apple: no Pro');
eq([writes.length, subs.get('id-l')?.provider], [0, 'stripe'], 'a past_due Stripe row stays Stripe');
// Apple billing grace period keeps Pro.
reset();
const grace = new Date(Date.now() + 10 * 86_400_000).toISOString();
subscriber = { entitlements: ent('a'), subscriptions: { a: { store: 'app_store', expires_date: new Date(Date.now() - 3600_000).toISOString(), grace_period_expires_date: grace } } };
eq(await syncRevenueCat(UID, 'id-m'), true, 'billing grace period keeps Pro');
eq(subs.get('id-m')?.current_period_end, grace, 'grace end stored as the period end');

// ---------------- RC-02 ----------------
reset();
subscriber = { entitlements: ent(), subscriptions: { p: { store: 'app_store', expires_date: future, is_sandbox: true, period_type: 'normal' } } };
eq(await syncRevenueCat(UID, 'id-h'), true, 'sandbox grants Pro while no allowlist is set (App Review)');
eq(subs.get('id-h')?.environment, 'sandbox', 'sandbox is recorded as sandbox');
reset();
process.env.BOBBY_SANDBOX_PRO_UIDS = 'someone-else';
eq(await syncRevenueCat(UID, 'id-i'), false, 'sandbox outside the allowlist grants nothing');
reset();
process.env.BOBBY_SANDBOX_PRO_UIDS = `x, ${UID}`;
eq(await syncRevenueCat(UID, 'id-j'), true, 'sandbox inside the allowlist grants Pro');
reset();
process.env.BOBBY_SANDBOX_PRO_UIDS = `"x";${UID.toUpperCase()}\nother`;
subscriber = { entitlements: ent(), subscriptions: { p: { store: 'app_store', expires_date: future, is_sandbox: true } } };
eq(await syncRevenueCat(UID, 'id-j2'), true, 'allowlist tolerates quotes, semicolons, newlines and case');
delete process.env.BOBBY_SANDBOX_PRO_UIDS;

// ---------------- STRIPE-04 ----------------
process.env.STRIPE_SECRET_KEY = 'sk_test_x'; process.env.STRIPE_PRICE_ID = 'price_x';
const { customerFor, subscriptionsFor } = await import('../api/_lib/stripe-api.ts');
reset();
const quotedIdentity = String.raw`id\'quoted`;
await customerFor(quotedIdentity, null);
await subscriptionsFor(quotedIdentity, null, null);
eq(stripeQueries, [String.raw`metadata['identity_id']:'id\\\'quoted'`, String.raw`metadata['identity_id']:'id\\\'quoted'`], 'Stripe customer and subscription searches escape backslashes before quotes');
const { default: access } = await import('../api/bobby-access.ts');
type Res = { statusCode: number; body: any; status(c: number): Res; json(b: unknown): Res; setHeader(): void };
let ip = 0;
const call = async () => {
  const res: Res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {} };
  await access({ method: 'POST', body: { action: 'checkout' }, query: {}, headers: { authorization: 'Bearer user-token', 'x-forwarded-for': `10.9.0.${++ip}`, host: 'bobbyprotocol.xyz' } } as never, res as never);
  return res;
};
reset();
subs.set('id-buyer', { identity_id: 'id-buyer', provider: 'apple', status: 'active', current_period_end: future });
let r = await call();
eq([r.statusCode, r.body?.code, stripeCalls.length], [409, 'already_pro', 0], 'Apple Pro is not sold a second plan');
reset();
subscriptionReadFails = true;
r = await call();
eq([r.statusCode, stripeCalls.length], [503, 0], 'checkout fails closed when the plan cannot be read');
reset();
stripeSubsList = [{ id: 'sub_x', status: 'incomplete' }];
r = await call();
eq([r.statusCode, r.body?.code, stripeCalls.includes('POST /v1/checkout/sessions')], [409, 'already_pro', false], 'a subscription still able to charge at Stripe blocks a second checkout');
reset();
openSessions = [{ url: 'https://checkout.stripe.test/open' }];
r = await call();
eq([r.statusCode, r.body?.url, stripeCalls.includes('POST /v1/checkout/sessions')], [200, 'https://checkout.stripe.test/open', false], 'an open checkout is reused, never a second one');
reset();
stripeDown = true;
r = await call();
eq(r.statusCode, 503, 'Stripe unavailable: checkout fails closed');
reset();
subs.set('id-buyer', { identity_id: 'id-buyer', provider: 'stripe', status: 'canceled', current_period_end: future, stripe_customer_id: 'cus_1' });
r = await call();
eq([r.statusCode, r.body?.url, lastSessionForm?.get('customer'), Boolean(lastSessionForm?.get('expires_at'))], [200, 'https://checkout.stripe.test/s', 'cus_1', true], 'a canceled plan buys again on the same customer, with a short-lived session');
reset();
r = await call();
eq([lastSessionForm?.get('customer'), stripeCalls.includes('POST /v1/customers')], ['cus_new', true], 'a first buyer gets one Stripe customer, created idempotently');

// ---------------- STRIPE-01 ----------------
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
const { POST: webhook } = await import('../api/stripe-webhook.ts');
const IDN = '22222222-2222-4222-8222-222222222222';
const deliver = async (event: Record<string, unknown>) => {
  const raw = JSON.stringify(event); const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', 'whsec_test').update(`${t}.${raw}`).digest('hex');
  return webhook(new Request('https://bobbyprotocol.xyz/api/stripe-webhook', { method: 'POST', body: raw, headers: { 'stripe-signature': `t=${t},v1=${sig}` } }));
};
const snap = (status: string) => ({ id: 'sub_1', status, customer: 'cus_9', livemode: true, metadata: { identity_id: IDN }, items: { data: [{ price: { id: 'price_x' }, current_period_end: Math.floor(Date.now() / 1000) + 86_400 * 30 }] } });
reset();
stripeSubscription = snap('canceled');
let w = await deliver({ id: 'evt_old', type: 'customer.subscription.updated', data: { object: snap('active') } });
eq(w.status, 200, 'webhook accepts the event');
eq([subs.get(IDN)?.status, stripeCalls.includes('GET /v1/subscriptions/sub_1')], ['canceled', true], 'a late "active" event saves the live state (canceled), not its snapshot');
eq(subs.get(IDN)?.environment, 'production', 'live subscription recorded as production');
reset();
stripeSubscription = snap('canceled');
upsertStatus = 409;
w = await deliver({ id: 'evt_gone', type: 'customer.subscription.deleted', data: { object: snap('canceled') } });
eq(w.status, 200, 'an event for a deleted account is acknowledged, not retried for days');

reset();
subs.set(IDN, { identity_id: IDN, provider: 'stripe', status: 'active', current_period_end: future, stripe_subscription_id: 'sub_new' });
stripeSubscription = { ...snap('canceled'), id: 'sub_old' };
w = await deliver({ id: 'evt_retry', type: 'customer.subscription.deleted', data: { object: { ...snap('canceled'), id: 'sub_old' } } });
eq([w.status, subs.get(IDN)?.stripe_subscription_id, subs.get(IDN)?.status], [200, 'sub_new', 'active'], 'a late event for an old subscription never overwrites the live one');
reset();
subs.set(IDN, { identity_id: IDN, provider: 'apple', status: 'active', current_period_end: future });
stripeSubscription = snap('canceled');
w = await deliver({ id: 'evt_card_end', type: 'customer.subscription.updated', data: { object: snap('canceled') } });
eq([w.status, subs.get(IDN)?.provider, subs.get(IDN)?.status], [200, 'apple', 'active'], 'an ended card plan never clobbers a live Apple plan');
reset();
stripeSubscription = snap('active');
upsertStatus = 409;
w = await deliver({ id: 'evt_orphan', type: 'customer.subscription.created', data: { object: snap('active') } });
eq([w.status, stripeCalls.includes('DELETE /v1/subscriptions/sub_1')], [200, true], 'a live plan for a deleted account is cancelled at Stripe');
reset();
stripeSubscription = snap('active');
upsertStatus = 500;
w = await deliver({ id: 'evt_err', type: 'customer.subscription.updated', data: { object: snap('active') } });
eq(w.status, 500, 'any other storage error is retried, never swallowed');
reset();
process.env.VERCEL_ENV = 'production';
stripeSubscription = { ...snap('active'), livemode: false };
w = await deliver({ id: 'evt_test', type: 'customer.subscription.updated', data: { object: { ...snap('active'), livemode: false } } });
eq([w.status, subs.has(IDN)], [200, false], 'a test-mode subscription never grants production Pro');
delete process.env.VERCEL_ENV;

console.log(`payments-guards: ${checks} checks passed`);
