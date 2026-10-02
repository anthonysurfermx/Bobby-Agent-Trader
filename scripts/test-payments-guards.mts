// Launch guards from the payments security audits (2026-10-02, our agents + Codex). Mocked HTTP only.
//   RC-01  only a real App Store subscription grants Pro; Test Store / no-store entitlements never do, and a row an
//          earlier sync granted from them is revoked; a card subscription from the Stripe webhook is never touched.
//   RC-02  BOBBY_SANDBOX_PRO_UIDS, when set, limits Apple sandbox Pro to those auth users.
//   STRIPE-04  checkout refuses an account that already has a live plan, and fails closed when it cannot tell.
//   STRIPE-01  subscription webhooks save the live subscription, not the event snapshot; a deleted account is no retry.
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
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
let sessionForms: string[] = [];
let sessionKeys: string[] = [];
let sessionGate: Promise<void> | null = null;
let failSessionOnce = false;
let failComplete = false;
let sessionStatus = 'open';
const attempts = new Map<string, { id: string; customer: string; price: string; origin: string; expiresAt: number; retryAt: number; url: string | null; sessionId: string | null }>();
const blockedForDeletion = new Set<string>();
const purchases = new Map<string, Record<string, unknown>>();
const checkoutEvents = new Map<string, Record<string, unknown>>();
let refunds: Array<Record<string, unknown>> = [];
let charge: Record<string, unknown> = {};
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
    if (u.pathname.startsWith('/v1/checkout/sessions/') && m === 'GET') return Response.json({ status: sessionStatus, url: 'https://checkout.stripe.com/s' });
    if (u.pathname.endsWith('/expire') && m === 'POST') return Response.json({ status: 'expired' });
    if (u.pathname === '/v1/checkout/sessions' && m === 'POST') {
      lastSessionForm = new URLSearchParams(String(init?.body)); sessionForms.push(String(init?.body));
      sessionKeys.push(new Headers(init?.headers).get('Idempotency-Key') ?? '');
      if (sessionGate) await sessionGate;
      if (failSessionOnce) { failSessionOnce = false; return Response.json({ error: { message: 'retry' } }, { status: 500 }); }
      return Response.json({ id: 'cs_test_session', url: 'https://checkout.stripe.com/s' });
    }
    if (u.pathname === '/v1/refunds' && m === 'GET') return Response.json({ data: refunds, has_more: false });
    if (u.pathname.startsWith('/v1/charges/')) return Response.json(charge);
    if (u.pathname.startsWith('/v1/customers/') && m === 'GET') return Response.json({ metadata: { identity_id: '22222222-2222-4222-8222-222222222222' } });
    if (u.pathname.startsWith('/v1/subscriptions/') && m === 'DELETE') return Response.json({ id: u.pathname.split('/').pop(), status: 'canceled' });
    if (u.pathname.startsWith('/v1/subscriptions/')) return Response.json(stripeSubscription);
    return Response.json({});
  }
  if (u.pathname === '/auth/v1/user') return Response.json({ id: '11111111-1111-4111-8111-111111111111', email: 'buyer@example.test', app_metadata: { provider: 'google' } });
  if (u.pathname === '/rest/v1/bobby_identities') return Response.json([u.searchParams.has('auth_user_id') || u.searchParams.get('on_conflict') === 'auth_user_id'
    ? { id: 'id-buyer', auth_user_id: '11111111-1111-4111-8111-111111111111', wallet_address: null }
    : { id: '22222222-2222-4222-8222-222222222222' }]);
  if (u.pathname === '/rest/v1/bobby_purchase_events' && init?.method === 'POST') {
    const b = JSON.parse(String(init.body)); if (!purchases.has(b.id)) purchases.set(b.id, b); return new Response(null, { status: 204 });
  }
  if (u.pathname === '/rest/v1/bobby_purchase_events' && init?.method === 'PATCH') {
    const id = (u.searchParams.get('id') ?? '').replace('eq.', ''); const row = purchases.get(id);
    if (row && row.identity_id === null) purchases.set(id, { ...row, ...JSON.parse(String(init.body)) });
    return new Response(null, { status: 204 });
  }
  if (u.pathname === '/rest/v1/rpc/bobby_checkout_claim') {
    const b = JSON.parse(String(init?.body));
    if (blockedForDeletion.has(b.p_identity)) return Response.json({ state: 'deleting' });
    let a = attempts.get(b.p_identity);
    if (!a) {
      a = { id: randomUUID(), customer: b.p_customer, price: b.p_price, origin: b.p_origin, expiresAt: Math.floor(Date.now() / 1000) + 2100, retryAt: Date.now() + 12000, url: null, sessionId: null };
      attempts.set(b.p_identity, a);
      return Response.json({ state: 'create', attemptId: a.id, customer: a.customer, price: a.price, origin: a.origin, expiresAt: a.expiresAt });
    }
    if (a.url) return Response.json({ state: 'ready', url: a.url, sessionId: a.sessionId, expiresAt: a.expiresAt });
    if (Date.now() < a.retryAt) return Response.json({ state: 'pending' });
    a.retryAt = Date.now() + 12000;
    return Response.json({ state: 'create', attemptId: a.id, customer: a.customer, price: a.price, origin: a.origin, expiresAt: a.expiresAt });
  }
  if (u.pathname === '/rest/v1/rpc/bobby_checkout_complete') {
    const b = JSON.parse(String(init?.body)); const a = attempts.get(b.p_identity);
    if (blockedForDeletion.has(b.p_identity) || failComplete || !a || a.id !== b.p_attempt) return Response.json(false);
    a.url = b.p_url; a.sessionId = b.p_session; return Response.json(Boolean(b.p_session));
  }
  if (u.pathname === '/rest/v1/rpc/bobby_checkout_block_for_deletion') {
    const b = JSON.parse(String(init?.body)); blockedForDeletion.add(b.p_identity);
    const a = attempts.get(b.p_identity);
    return Response.json({ customer: a?.customer ?? null, sessionId: a?.sessionId ?? null });
  }
  if (u.pathname === '/rest/v1/rpc/bobby_record_checkout_opened') {
    const b = JSON.parse(String(init?.body));
    if (!checkoutEvents.has(b.p_session)) checkoutEvents.set(b.p_session, b);
    return new Response(null, { status: 204 });
  }
  if (u.pathname === '/rest/v1/bobby_subscriptions') {
    if (init?.method === 'POST') {
      if (upsertStatus !== 204) return new Response(upsertStatus === 409 ? '{"code":"23503","message":"fk"}' : '{"code":"23505"}', { status: upsertStatus });
      const b = JSON.parse(String(init.body)); writes.push(b); subs.set(b.identity_id, { ...subs.get(b.identity_id), ...b }); return new Response(null, { status: 204 });
    }
    if (init?.method === 'PATCH') {
      const id = (u.searchParams.get('identity_id') ?? '').replace('eq.', '');
      const row = subs.get(id); const stripeId = (u.searchParams.get('stripe_subscription_id') ?? '').replace('eq.', '');
      if (!row || row.stripe_subscription_id !== stripeId) return Response.json([]);
      const b = JSON.parse(String(init.body)); writes.push(b); subs.set(id, { ...row, ...b }); return Response.json([{ identity_id: id }]);
    }
    if (subscriptionReadFails) return new Response('{}', { status: 503 });
    if (u.searchParams.has('stripe_customer_id')) {
      const customerId = (u.searchParams.get('stripe_customer_id') ?? '').replace('eq.', '');
      return Response.json([...subs.values()].filter((s) => s.stripe_customer_id === customerId).map((s) => ({ identity_id: s.identity_id })));
    }
    const id = (u.searchParams.get('identity_id') ?? '').replace('eq.', '');
    return Response.json(subs.has(id) ? [subs.get(id)] : []);
  }
  return new Response(null, { status: 204 });
}) as typeof fetch;

const { syncRevenueCat } = await import('../api/_lib/revenuecat.ts');
const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
const later = new Date(Date.now() + 60 * 86_400_000).toISOString();
const ent = (product = 'p') => ({ pro: { expires_date: future, product_identifier: product } });
const reset = () => { subs.clear(); writes = []; stripeCalls = []; stripeQueries = []; subscriptionReadFails = false; upsertStatus = 204; stripeDown = false; stripeSubsList = []; openSessions = []; lastSessionForm = null; sessionForms = []; sessionKeys = []; sessionGate = null; failSessionOnce = false; failComplete = false; sessionStatus = 'open'; attempts.clear(); blockedForDeletion.clear(); purchases.clear(); checkoutEvents.clear(); refunds = []; charge = {}; delete process.env.BOBBY_SANDBOX_PRO_UIDS; };
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
eq([writes.length, subs.get('id-d')?.provider, subs.get('id-d')?.apple_status], [1, 'stripe', 'expired'], 'RevenueCat records no Apple access without changing the card owner');

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
eq([writes.length, subs.get('id-k')?.provider, subs.get('id-k')?.apple_status], [1, 'stripe', 'active'], 'Apple is mirrored without rewriting a live Stripe plan');
reset();
subs.set('id-coexist', { identity_id: 'id-coexist', provider: 'stripe', status: 'past_due', current_period_end: future, stripe_subscription_id: 'sub_due', stripe_customer_id: 'cus_due' });
subscriber = { entitlements: ent('a'), subscriptions: { a: { store: 'app_store', expires_date: future } } };
eq(await syncRevenueCat(UID, 'id-coexist'), true, 'past_due card + paid Apple stays Pro');
const { publicSubscription } = await import('../api/_lib/access.ts');
eq([subs.get('id-coexist')?.status, subs.get('id-coexist')?.stripe_subscription_id, subs.get('id-coexist')?.apple_status,
  publicSubscription(subs.get('id-coexist') as never)?.provider, publicSubscription(subs.get('id-coexist') as never)?.cardPlan],
  ['past_due', 'sub_due', 'active', 'apple', true], 'Apple access is persisted while the card remains manageable');
subscriber = { entitlements: ent('a'), subscriptions: { a: { store: 'app_store', expires_date: future, refunded_at: new Date().toISOString() } } };
eq(await syncRevenueCat(UID, 'id-coexist'), false, 'a refund removes Apple access when the card is past due');
eq([subs.get('id-coexist')?.apple_status, publicSubscription(subs.get('id-coexist') as never)?.appleActive], ['refunded', false], 'refund revokes the Apple mirror');
reset();
subs.set('id-l', { identity_id: 'id-l', provider: 'stripe', status: 'past_due', current_period_end: future, stripe_subscription_id: 'sub_live' });
subscriber = { entitlements: ent('a'), subscriptions: { a: { store: 'app_store', expires_date: new Date(Date.now() - 1000).toISOString() } } };
eq(await syncRevenueCat(UID, 'id-l'), false, 'past_due card + expired Apple: no Pro');
eq([writes.length, subs.get('id-l')?.provider, subs.get('id-l')?.apple_status], [1, 'stripe', 'expired'], 'a past_due Stripe row stays Stripe and expired Apple is recorded');
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
  await access({ method: 'POST', body: { action: 'checkout' }, query: {}, headers: { authorization: 'Bearer user-token', 'x-bobby-device': '123e4567-e89b-12d3-a456-426614174000', 'x-forwarded-for': `10.9.0.${++ip}`, host: 'bobbyprotocol.xyz' } } as never, res as never);
  return res;
};
const accessGet = async () => {
  const res: Res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {} };
  await access({ method: 'GET', body: {}, query: {}, headers: { authorization: 'Bearer user-token', 'x-forwarded-for': `10.10.0.${++ip}`, host: 'bobbyprotocol.xyz' } } as never, res as never);
  return res;
};
reset();
subs.set('id-buyer', { identity_id: 'id-buyer', provider: 'stripe', status: 'paused', stripe_subscription_id: 'sub_paused', stripe_customer_id: 'cus_paused' });
eq((await accessGet()).body?.payments?.apple, false, 'Apple sales are closed for an account with a nonterminal card plan');
reset();
subscriptionReadFails = true;
eq((await accessGet()).body?.payments?.apple, false, 'Apple sales fail closed when account billing state cannot be read');
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
openSessions = [{ id: 'cs_test_open', url: 'https://checkout.stripe.com/open' }];
r = await call();
eq([r.statusCode, r.body?.url, stripeCalls.includes('POST /v1/checkout/sessions')], [200, 'https://checkout.stripe.com/open', false], 'an open checkout is reused, never a second one');
await new Promise((resolve) => setTimeout(resolve, 0));
eq([checkoutEvents.get('cs_test_open')?.p_identity, typeof checkoutEvents.get('cs_test_open')?.p_device], ['id-buyer', 'string'],
  'reused Checkout is observed with canonical account and salted install');
reset();
stripeDown = true;
r = await call();
eq(r.statusCode, 503, 'Stripe unavailable: checkout fails closed');
reset();
subs.set('id-buyer', { identity_id: 'id-buyer', provider: 'stripe', status: 'canceled', current_period_end: future, stripe_customer_id: 'cus_1' });
r = await call();
eq([r.statusCode, r.body?.url, lastSessionForm?.get('customer'), Boolean(lastSessionForm?.get('expires_at'))], [200, 'https://checkout.stripe.com/s', 'cus_1', true], 'a canceled plan buys again on the same customer, with a short-lived session');
reset();
r = await call();
eq([lastSessionForm?.get('customer'), stripeCalls.includes('POST /v1/customers')], ['cus_new', true], 'a first buyer gets one Stripe customer, created idempotently');
reset();
let releaseSession!: () => void;
sessionGate = new Promise<void>((resolve) => { releaseSession = resolve; });
const first = call();
while (!sessionKeys.length) await new Promise((resolve) => setTimeout(resolve, 1));
const second = await call();
eq([second.statusCode, stripeCalls.filter((c) => c === 'POST /v1/checkout/sessions').length], [503, 1], 'parallel checkout fails closed while the first session is being created');
releaseSession();
r = await first;
eq([r.statusCode, r.body?.url, sessionKeys[0]?.startsWith('bobby-checkout-')], [200, 'https://checkout.stripe.com/s', true], 'first checkout completes with an idempotency key');
await new Promise((resolve) => setTimeout(resolve, 0));
eq(checkoutEvents.has('cs_test_session'), true, 'new valid Checkout is observed');
const third = await call();
eq([third.statusCode, third.body?.url, sessionKeys.length], [200, 'https://checkout.stripe.com/s', 1], 'subsequent checkout reuses persisted URL');
await new Promise((resolve) => setTimeout(resolve, 0));
eq(checkoutEvents.size, 1, 'reopened session is deduplicated by durable session key');
sessionStatus = 'expired';
const expired = await call();
eq([expired.statusCode, expired.body?.url, stripeCalls.filter((c) => c === 'POST /v1/checkout/sessions').length], [503, undefined, 1],
  'an expired cached Checkout URL is refused without opening a second session');
eq(checkoutEvents.size, 1, 'expired Checkout does not emit another opening');
reset();
failSessionOnce = true;
r = await call();
eq([r.statusCode, sessionKeys.length], [502, 1], 'failed Stripe create is safe to retry');
attempts.get('id-buyer')!.retryAt = 0;
r = await call();
eq([r.statusCode, sessionKeys[0], sessionKeys[1], sessionForms[0], sessionForms[1]],
  [200, sessionKeys[0], sessionKeys[0], sessionForms[0], sessionForms[0]], 'retry uses identical Stripe key and form');
reset();
failComplete = true;
r = await call();
eq([r.statusCode, stripeCalls.includes('POST /v1/checkout/sessions/cs_test_session/expire')], [502, true],
  'a session whose reservation cannot be saved is expired immediately');
reset();
sessionGate = new Promise<void>((resolve) => { releaseSession = resolve; });
const whileDeleting = call();
while (!sessionKeys.length) await new Promise((resolve) => setTimeout(resolve, 1));
const { blockCheckoutForDeletion } = await import('../api/_lib/checkout-attempt.ts');
eq((await blockCheckoutForDeletion('id-buyer')).customer, 'cus_new', 'deletion captures customer while session creation is in flight');
releaseSession();
r = await whileDeleting;
eq([r.statusCode, stripeCalls.includes('POST /v1/checkout/sessions/cs_test_session/expire')], [502, true],
  'deletion marker forces an in-flight creator to expire its new session');
eq((await call()).body?.code, 'account_deleting', 'a later checkout cannot pass the deletion marker');
reset();
subs.set('id-buyer', { identity_id: 'id-buyer', provider: 'stripe', status: 'canceled', stripe_subscription_id: 'sub_old',
  stripe_customer_id: 'cus_old', apple_status: 'active', apple_current_period_end: future });
r = await call();
eq([r.statusCode, r.body?.provider, stripeCalls.length], [409, 'apple', 0], 'active Apple mirror blocks a new card checkout');
reset();
const { cancelAllFor } = await import('../api/_lib/stripe-api.ts');
openSessions = [{ id: 'cs_test_open', mode: 'subscription', url: 'https://checkout.stripe.com/open' }];
stripeSubsList = [{ id: 'sub_cancel', status: 'active' }];
eq(await cancelAllFor('id-buyer', 'cus_old', null), 1, 'deletion cancels card subscription');
eq(stripeCalls.indexOf('POST /v1/checkout/sessions/cs_test_open/expire') < stripeCalls.indexOf('DELETE /v1/subscriptions/sub_cancel'),
  true, 'deletion expires payable Checkout before cancelling subscriptions');

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

reset();
stripeSubscription = { id: 'sub_invoice', metadata: {} };
w = await deliver({ id: 'evt_invoice_early', type: 'invoice.paid', data: { object: { id: 'in_early', amount_paid: 490, currency: 'usd',
  subscription: 'sub_invoice', billing_reason: 'subscription_create', created: 1000, livemode: true } } });
eq([w.status, purchases.get('stripe-invoice-in_early')?.identity_id], [200, null], 'out-of-order invoice is recorded before ownership is known');
stripeSubscription = { id: 'sub_invoice', metadata: { identity_id: IDN } };
w = await deliver({ id: 'evt_invoice_distinct', type: 'invoice.paid', data: { object: { id: 'in_early', amount_paid: 490, currency: 'usd',
  subscription: 'sub_invoice', billing_reason: 'subscription_create', created: 1000, livemode: true } } });
eq([w.status, purchases.size, purchases.get('stripe-invoice-in_early')?.identity_id, purchases.get('stripe-invoice-in_early')?.price_usd], [200, 1, IDN, 4.9],
  'a distinct Stripe Event for one invoice dedupes and repairs identity without changing amount');

// Refund rows use each successful refund id and amount, even when cumulative
// charge.refunded events are repeated or arrive after a later partial refund.
reset();
subs.set(IDN, { identity_id: IDN, provider: 'stripe', status: 'active', stripe_subscription_id: 'sub_1', stripe_customer_id: 'cus_9' });
charge = { id: 'ch_1', customer: 'cus_9', currency: 'usd', livemode: true, billing_details: { address: { country: 'US' } } };
refunds = [
  { id: 're_first', charge: 'ch_1', status: 'succeeded', amount: 100, currency: 'usd', created: 1000 },
  { id: 're_second', charge: 'ch_1', status: 'succeeded', amount: 150, currency: 'usd', created: 2000 },
  { id: 're_pending', charge: 'ch_1', status: 'pending', amount: 50, currency: 'usd', created: 3000 },
];
const refundEvent = { id: 'evt_refund', type: 'charge.refunded', data: { object: { ...charge, amount_refunded: 250 } } };
w = await deliver(refundEvent);
eq([w.status, purchases.size, purchases.get('stripe-refund-re_first')?.price_usd, purchases.get('stripe-refund-re_second')?.price_usd],
  [200, 2, -1, -1.5], 'two partial refunds use their own amounts, not cumulative charge amount');
eq([purchases.get('stripe-refund-re_first')?.identity_id, purchases.get('stripe-refund-re_second')?.event_at],
  [IDN, new Date(2_000_000).toISOString()], 'refund rows retain account and refund time');
w = await deliver(refundEvent);
eq([w.status, purchases.size], [200, 2], 'repeated charge.refunded events dedupe by refund id');
refunds[2].status = 'succeeded';
w = await deliver({ id: 'evt_refund_update', type: 'refund.updated', data: { object: { id: 're_pending', charge: 'ch_1' } } });
eq([w.status, purchases.size, purchases.get('stripe-refund-re_pending')?.price_usd], [200, 3, -0.5], 'a later successful async refund is added once');

console.log(`payments-guards: ${checks} checks passed`);
