// RevenueCat store guard (payments security audit 2026-10-02, RC-01 / RC-02). Mocked HTTP only.
//   RC-01  only a real-money store subscription grants Pro. RevenueCat's Test Store (its key ships in the public repo),
//          promotional grants, unknown stores and an entitlement with no subscription record never do, and a row an
//          earlier sync granted from them is revoked. A card plan from the Stripe webhook is never touched while it
//          grants Pro, and never blocks an App Store purchase once it does not.
//   RC-02  BOBBY_SANDBOX_PRO_UIDS, when set, limits Apple sandbox Pro to those auth users.
import assert from 'node:assert/strict';
process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
process.env.BOBBY_SUPABASE_ANON_KEY = 'test-anon';
process.env.REVENUECAT_SECRET_KEY = 'test-rc';
delete process.env.REVENUECAT_V2_SECRET_KEY;
let checks = 0;
const eq = (a: unknown, b: unknown, what: string) => { assert.deepEqual(a, b, what); checks++; };

const subs = new Map<string, Record<string, unknown>>();
let subscriber: Record<string, unknown> = {};
let writes: Array<Record<string, unknown>> = [];
globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const u = new URL(String(input));
  if (u.hostname === 'api.revenuecat.com') return Response.json({ subscriber });
  if (u.pathname === '/rest/v1/bobby_subscriptions') {
    if (init?.method === 'POST') { const b = JSON.parse(String(init.body)); writes.push(b); subs.set(b.identity_id, { ...subs.get(b.identity_id), ...b }); return new Response(null, { status: 204 }); }
    const id = (u.searchParams.get('identity_id') ?? '').replace('eq.', '');
    return Response.json(subs.has(id) ? [subs.get(id)] : []);
  }
  if (u.pathname === '/rest/v1/bobby_brief_paid_periods') return init?.method && init.method !== 'GET' ? new Response(null, { status: 204 }) : Response.json([]);
  throw new Error(`unexpected ${init?.method ?? 'GET'} ${u}`);
}) as typeof fetch;

const { syncRevenueCat } = await import('../api/_lib/revenuecat.ts');
const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
const later = new Date(Date.now() + 60 * 86_400_000).toISOString();
const past = new Date(Date.now() - 1000).toISOString();
const ent = (product = 'p') => ({ pro: { expires_date: future, product_identifier: product } });
const reset = () => { subs.clear(); writes = []; delete process.env.BOBBY_SANDBOX_PRO_UIDS; };
const UID = '00000000-0000-4000-8000-000000000001';

// ---------------- RC-01 ----------------
reset();
subscriber = { entitlements: ent(), subscriptions: { p: { store: 'test_store', expires_date: future } } };
eq(await syncRevenueCat(UID, 'id-a'), false, 'Test Store does not grant Pro');
eq(writes.length, 0, 'Test Store writes nothing on an account without a plan');

for (const store of ['promotional', 'play_store', 'amazon', 'TEST_STORE', '', undefined]) {
  reset();
  subscriber = { entitlements: ent(), subscriptions: { p: { store, expires_date: future } } };
  eq(await syncRevenueCat(UID, 'id-s'), false, `store ${store}: no Pro from RevenueCat`);
  eq(writes.length, 0, `store ${store}: nothing written`);
}

// RevenueCat Web Billing is real money: it grants Pro and is mirrored as a card plan without a direct Stripe id.
reset();
subscriber = { entitlements: ent(), subscriptions: { p: { store: 'rc_billing', expires_date: future } } };
eq(await syncRevenueCat(UID, 'id-web'), true, 'RevenueCat Web Billing grants Pro');
eq([subs.get('id-web')?.provider, subs.get('id-web')?.status], ['stripe', 'active'], 'and is mirrored as a card plan');
subscriber = { subscriptions: { p: { store: 'rc_billing', expires_date: future } } };
eq(await syncRevenueCat(UID, 'id-web'), false, 'and stops when the entitlement is gone');
eq(subs.get('id-web')?.status, 'expired', 'the mirrored row expires');

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
eq(await syncRevenueCat(UID, 'id-c'), false, 'a Test Store row an old sync labelled "stripe" (no Stripe id) is revoked too');
eq(subs.get('id-c')?.status, 'expired', 'and expires');

reset();
subs.set('id-d', { identity_id: 'id-d', provider: 'stripe', status: 'active', current_period_end: future, stripe_subscription_id: 'sub_real' });
subscriber = { entitlements: ent(), subscriptions: { p: { store: 'test_store', expires_date: future } } };
eq(await syncRevenueCat(UID, 'id-d'), true, 'a live card subscription keeps Pro');
eq(writes.length, 0, 'the live Stripe row is never touched by a RevenueCat sync');

reset();
subscriber = { entitlements: ent('p'), subscriptions: { p: { store: 'app_store', expires_date: future, period_type: 'normal', is_sandbox: false } } };
eq(await syncRevenueCat(UID, 'id-ok'), true, 'a real App Store subscription grants Pro');
eq([subs.get('id-ok')?.provider, subs.get('id-ok')?.status, subs.get('id-ok')?.product_id, subs.get('id-ok')?.environment, subs.get('id-ok')?.period_type],
  ['apple', 'active', 'p', 'production', 'normal'], 'and is recorded as a production Apple plan');

reset();
subscriber = { entitlements: ent('p'), subscriptions: { p: { store: 'mac_app_store', expires_date: future } } };
eq(await syncRevenueCat(UID, 'id-mac'), true, 'the Mac App Store counts as Apple');

reset();
subscriber = { entitlements: ent('t'), subscriptions: { t: { store: 'test_store', expires_date: later }, a: { store: 'app_store', expires_date: future } } };
eq(await syncRevenueCat(UID, 'id-e'), true, 'a real App Store subscription beside a Test Store one grants Pro');
eq([subs.get('id-e')?.provider, subs.get('id-e')?.product_id, subs.get('id-e')?.current_period_end], ['apple', 'a', future], 'the row comes from the App Store record, not the longer Test Store one');

reset();
subscriber = { entitlements: ent(), subscriptions: { p: { store: 'app_store', expires_date: future, refunded_at: new Date().toISOString() } } };
subs.set('id-f', { identity_id: 'id-f', provider: 'apple', status: 'active', current_period_end: future });
eq(await syncRevenueCat(UID, 'id-f'), false, 'a refunded App Store subscription is not Pro');
eq(subs.get('id-f')?.status, 'refunded', 'the refund is recorded as refunded');

reset();
subscriber = { subscriptions: { p: { store: 'app_store', expires_date: future } } };
subs.set('id-g', { identity_id: 'id-g', provider: 'apple', status: 'active', current_period_end: future });
eq(await syncRevenueCat(UID, 'id-g'), false, 'no entitlement means no Pro');
eq(subs.get('id-g')?.status, 'expired', 'the Apple row expires when the entitlement is gone');

reset();
subscriber = { entitlements: ent('a'), subscriptions: { a: { store: 'app_store', expires_date: past } } };
subs.set('id-x', { identity_id: 'id-x', provider: 'apple', status: 'active', current_period_end: past });
eq(await syncRevenueCat(UID, 'id-x'), false, 'an expired App Store subscription is not Pro');
eq(subs.get('id-x')?.status, 'expired', 'and is recorded as expired');

// A card row only shields itself while it grants Pro.
reset();
subs.set('id-k', { identity_id: 'id-k', provider: 'stripe', status: 'active', current_period_end: future, stripe_subscription_id: 'sub_live', stripe_customer_id: 'cus_k' });
subscriber = { entitlements: ent('a'), subscriptions: { a: { store: 'app_store', expires_date: later } } };
eq(await syncRevenueCat(UID, 'id-k'), true, 'card plan + Apple plan: Pro');
eq([writes.length, subs.get('id-k')?.provider], [0, 'stripe'], 'a live Stripe row is never rewritten by RevenueCat');

reset();
subs.set('id-r1', { identity_id: 'id-r1', provider: 'stripe', status: 'canceled', current_period_end: future, stripe_subscription_id: 'sub_1', stripe_customer_id: 'cus_r1' });
subscriber = { entitlements: ent('a'), subscriptions: { a: { store: 'app_store', expires_date: future } } };
eq(await syncRevenueCat(UID, 'id-r1'), true, 'an App Store purchase after an ended card plan grants Pro');
eq([subs.get('id-r1')?.provider, subs.get('id-r1')?.status, subs.get('id-r1')?.stripe_customer_id], ['apple', 'active', 'cus_r1'], 'the row becomes the Apple plan and keeps the Stripe customer');
subscriber = { entitlements: ent('a'), subscriptions: { a: { store: 'app_store', expires_date: later } } };
eq(await syncRevenueCat(UID, 'id-r1'), true, 'its renewal still syncs');
eq(subs.get('id-r1')?.current_period_end, later, 'and extends the period (an old Stripe id on the row never freezes it)');

reset();
subs.set('id-r2', { identity_id: 'id-r2', provider: 'stripe', status: 'canceled', current_period_end: future, stripe_subscription_id: 'sub_1' });
subscriber = { entitlements: ent('a'), subscriptions: { a: { store: 'app_store', expires_date: past } } };
eq(await syncRevenueCat(UID, 'id-r2'), false, 'expired Apple + ended card: no Pro');
eq([writes.length, subs.get('id-r2')?.provider], [0, 'stripe'], 'nothing is written over the card row');

reset();
subs.set('id-r3', { identity_id: 'id-r3', provider: 'stripe', status: 'past_due', current_period_end: future, stripe_subscription_id: 'sub_1', stripe_customer_id: 'cus_r3' });
subscriber = { entitlements: ent('a'), subscriptions: { a: { store: 'app_store', expires_date: future } } };
eq(await syncRevenueCat(UID, 'id-r3'), true, 'a past_due card plan never blocks an App Store purchase');
eq([subs.get('id-r3')?.provider, subs.get('id-r3')?.stripe_subscription_id], ['apple', 'sub_1'], 'it is recorded, and the Stripe ids stay on the row');

// Apple's billing grace period keeps Pro.
reset();
const grace = new Date(Date.now() + 10 * 86_400_000).toISOString();
subscriber = { entitlements: ent('a'), subscriptions: { a: { store: 'app_store', expires_date: new Date(Date.now() - 3600_000).toISOString(), grace_period_expires_date: grace } } };
eq(await syncRevenueCat(UID, 'id-m'), true, 'the billing grace period keeps Pro');
eq(subs.get('id-m')?.current_period_end, grace, 'the grace end is stored as the period end');

// ---------------- RC-02 ----------------
reset();
subscriber = { entitlements: ent(), subscriptions: { p: { store: 'app_store', expires_date: future, is_sandbox: true, period_type: 'normal' } } };
eq(await syncRevenueCat(UID, 'id-h'), true, 'sandbox grants Pro while no allowlist is set (App Review)');
eq(subs.get('id-h')?.environment, 'sandbox', 'sandbox is recorded as sandbox');
reset();
process.env.BOBBY_SANDBOX_PRO_UIDS = 'someone-else';
eq(await syncRevenueCat(UID, 'id-i'), false, 'sandbox outside the allowlist grants nothing');
reset();
process.env.BOBBY_SANDBOX_PRO_UIDS = `"x";${UID.toUpperCase()}\nother`;
eq(await syncRevenueCat(UID, 'id-j'), true, 'sandbox inside the allowlist grants Pro (quotes, semicolons, newlines and case tolerated)');
reset();
process.env.BOBBY_SANDBOX_PRO_UIDS = 'someone-else';
subscriber = { entitlements: ent(), subscriptions: { p: { store: 'app_store', expires_date: future, is_sandbox: false } } };
eq(await syncRevenueCat(UID, 'id-prod'), true, 'the allowlist never limits production purchases');
delete process.env.BOBBY_SANDBOX_PRO_UIDS;

console.log(`revenuecat-store-guard: ${checks} checks passed`);
