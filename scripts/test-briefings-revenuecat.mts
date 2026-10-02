// Paid weekly briefings require a positive, authenticated RevenueCat purchase webhook corroborated by the
// current subscriber. This exercises the real adapter and the subscription/proof DB writes with HTTP doubles.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.REVENUECAT_SECRET_KEY = 'test-secret';
process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';

const { paidPeriodFromRevenueCat, syncRevenueCat } = await import('../api/_lib/revenuecat.ts');
let checks = 0;
const yes = (value: unknown, message: string) => { assert.ok(value, message); checks++; };
const no = (value: unknown, message: string) => { assert.equal(value, null, message); checks++; };
const equal = (got: unknown, expected: unknown, message: string) => { assert.deepEqual(got, expected, message); checks++; };
const identity = randomUUID(), auth = randomUUID(), product = 'bobby.pro.monthly';
const start = new Date(Date.now() - 86400_000).toISOString();
const end = new Date(Date.now() + 29 * 86400_000).toISOString();
const subscriber = () => ({
  entitlements: { pro: { product_identifier: product, expires_date: end } },
  subscriptions: { [product]: {
    store: 'app_store', purchase_date: start, expires_date: end, period_type: 'normal',
    is_sandbox: false, ownership_type: 'PURCHASED', store_transaction_id: '200000001234567', refunded_at: null,
  } },
});
const event = () => ({
  id: 'evt-paid-1', type: 'INITIAL_PURCHASE', app_user_id: auth, environment: 'PRODUCTION',
  store: 'APP_STORE', product_id: product, entitlement_ids: ['pro'], period_type: 'NORMAL',
  is_family_share: false, transaction_id: '200000001234567',
  purchased_at_ms: Date.parse(start), expiration_at_ms: Date.parse(end),
  price_in_purchased_currency: 4.99, currency: 'USD',
});
const proof = (s: any = subscriber(), e: any = event()) => paidPeriodFromRevenueCat(identity, auth, s, e);

const valid = proof();
yes(valid, 'positive production purchase with matching live subscriber becomes a proof');
equal(valid?.provider, 'apple', 'App Store provider is Apple');
equal(valid?.proof_id, event().transaction_id, 'proof references current transaction');
equal(valid?.period_end, end, 'proof uses the current subscriber period');
equal(valid?.proof_sha256.length, 64, 'proof records a digest of the corroborated event');
const introSub = subscriber(); introSub.subscriptions[product].period_type = 'intro';
const introEvent = { ...event(), period_type: 'INTRO', price_in_purchased_currency: 1.99 };
equal(proof(introSub, introEvent)?.period_type, 'intro', 'positive paid introductory period is eligible');
const webBillingSub = subscriber(); webBillingSub.subscriptions[product].store = 'rc_billing';
equal(proof(webBillingSub, { ...event(), store: 'RC_BILLING' })?.provider, 'stripe',
      'RevenueCat Web Billing purchase uses the Stripe provider in the subscription mirror');
for (const [label, change] of [
  ['trial', { period_type: 'TRIAL' }], ['sandbox event', { environment: 'SANDBOX' }],
  ['webhook test', { type: 'TEST' }], ['transfer', { type: 'TRANSFER' }],
  ['non-purchase event', { type: 'PRODUCT_CHANGE' }], ['zero price', { price_in_purchased_currency: 0 }],
  ['missing local price', { price_in_purchased_currency: null }], ['wrong transaction', { transaction_id: 'other' }],
  ['wrong account', { app_user_id: randomUUID() }], ['wrong product', { product_id: 'other' }],
  ['wrong period start', { purchased_at_ms: Date.parse(start) + 60000 }],
  ['wrong period end', { expiration_at_ms: Date.parse(end) + 60000 }],
  ['family share', { is_family_share: true }], ['wrong entitlement', { entitlement_ids: ['other'] }],
  ['wrong store', { store: 'PROMOTIONAL' }],
] as const) no(proof(subscriber(), { ...event(), ...change }), `${label} is not paid proof`);
const trialSub = subscriber(); trialSub.subscriptions[product].period_type = 'trial';
no(proof(trialSub), 'active trial subscriber is excluded');
const sandboxSub = subscriber(); sandboxSub.subscriptions[product].is_sandbox = true;
no(proof(sandboxSub), 'sandbox subscriber is excluded even with production-looking event');
const giftSub = subscriber(); giftSub.subscriptions[product].store = 'promotional';
no(proof(giftSub), 'RevenueCat gift is excluded');
const familySub = subscriber(); familySub.subscriptions[product].ownership_type = 'FAMILY_SHARED';
no(proof(familySub), 'family shared entitlement is excluded');
const refundedSub = subscriber(); refundedSub.subscriptions[product].refunded_at = new Date().toISOString();
no(proof(refundedSub), 'refunded purchase is excluded');
const expiredSub = subscriber(); expiredSub.entitlements.pro.expires_date = new Date(Date.now() - 1000).toISOString();
expiredSub.subscriptions[product].expires_date = expiredSub.entitlements.pro.expires_date;
no(proof(expiredSub), 'expired subscription is excluded');
const changedSub = subscriber(); changedSub.subscriptions[product].store_transaction_id = 'new-transaction';
no(proof(changedSub), 'stale transaction event cannot authorize renewed period');
const earlyStart = new Date(Date.now() + 12 * 3600_000).toISOString();
const earlySub = subscriber(); earlySub.subscriptions[product].purchase_date = earlyStart;
yes(proof(earlySub, { ...event(), purchased_at_ms: Date.parse(earlyStart) }),
    'early App Store renewal proof can be stored before its period begins (SQL gates the start)');

let currentSubscriber: any = subscriber();
let currentSubscription: any = null;
let currentProof: any = null;
const methods: string[] = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const url = String(input), method = init?.method ?? 'GET';
  methods.push(`${method} ${new URL(url).pathname}`);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.startsWith('https://api.revenuecat.com/v1/subscribers/')) {
    equal(String((init?.headers as Record<string, string>).Authorization), 'Bearer test-secret', 'subscriber fetch authenticates to RevenueCat');
    return json({ subscriber: currentSubscriber });
  }
  if (url.includes('/bobby_subscriptions')) {
    if (method === 'GET') return json(currentSubscription ? [currentSubscription] : []);
    if (method === 'POST') { currentSubscription = JSON.parse(String(init?.body)); return json(null, 201); }
  }
  if (url.includes('/bobby_brief_paid_periods')) {
    if (method === 'GET') return json(currentProof ? [currentProof] : []);
    if (method === 'POST') { currentProof = JSON.parse(String(init?.body)); return json(null, 201); }
    if (method === 'DELETE') { currentProof = null; return new Response(null, { status: 204 }); }
  }
  throw new Error(`unexpected ${method} ${url}`);
}) as typeof fetch;

try {
  equal(await syncRevenueCat(auth, identity), true, 'purchase sync preserves global Pro before webhook');
  no(currentProof, 'a subscriber response alone cannot prove a positive paid price');
  equal(currentSubscription.status, 'active', 'existing global Pro mirror still works');
  equal(await syncRevenueCat(auth, identity, event()), true, 'webhook sync keeps Pro active');
  yes(currentProof, 'matching purchase webhook persists paid proof');
  equal(currentProof.proof_id, event().transaction_id, 'persisted proof records the matching transaction');
  const goodProof = currentProof;
  equal(await syncRevenueCat(auth, identity, { ...event(), transaction_id: 'stale' }), true, 'stale webhook does not revoke Pro');
  equal(currentProof.proof_sha256, goodProof.proof_sha256, 'stale webhook cannot replace a valid proof');

  currentSubscriber = refundedSub;
  equal(await syncRevenueCat(auth, identity), false, 'refund deactivates RevenueCat Pro');
  no(currentProof, 'refund deletes previously paid period');
  equal(currentSubscription.status, 'refunded', 'global subscription mirror marks refund');

  currentSubscriber = subscriber();
  await syncRevenueCat(auth, identity, event());
  yes(currentProof, 'new paid event restores proof');
  currentSubscriber = { entitlements: {}, subscriptions: {} };
  equal(await syncRevenueCat(auth, identity), false, 'transfer/removal of entitlement deactivates Pro');
  no(currentProof, 'transfer/removal deletes the former owner proof');

  currentSubscriber = subscriber();
  await syncRevenueCat(auth, identity, event());
  currentSubscriber = changedSub;
  equal(await syncRevenueCat(auth, identity, event()), true, 'renewed subscriber may remain globally Pro');
  no(currentProof, 'old purchase proof cannot authorize the new transaction');

  currentSubscriber = subscriber();
  currentProof = null;
  currentSubscription = { identity_id: identity, provider: 'stripe', status: 'active', stripe_subscription_id: 'sub_external', product_id: 'card.pro', current_period_end: end };
  const writesBefore = methods.filter(x => x === 'POST /rest/v1/bobby_subscriptions').length;
  equal(await syncRevenueCat(auth, identity), true, 'live external card subscription remains Pro');
  equal(methods.filter(x => x === 'POST /rest/v1/bobby_subscriptions').length, writesBefore,
        'RevenueCat sync does not overwrite an independent card subscription');
  no(currentProof, 'independent card subscription does not inherit RevenueCat proof');

  currentSubscription.current_period_end = new Date(Date.now() - 86400_000).toISOString();
  equal(await syncRevenueCat(auth, identity, event()), true,
        'expired card period cannot block a newly paid Apple subscriber');
  equal(currentSubscription.provider, 'apple', 'new Apple purchase replaces stale card mirror');
  yes(currentProof, 'new Apple purchase obtains its own verified paid proof');

  currentSubscriber = webBillingSub;
  currentSubscription = null;
  equal(await syncRevenueCat(auth, identity, { ...event(), store: 'RC_BILLING' }), true,
        'RevenueCat Web Billing paid period remains globally Pro');
  equal(currentSubscription.provider, 'stripe', 'Web Billing mirror retains provider');
  yes(currentProof, 'Web Billing paid proof is persisted');
  currentSubscriber = { entitlements: {}, subscriptions: {} };
  equal(await syncRevenueCat(auth, identity), false, 'removed Web Billing entitlement deactivates mirrored Pro');
  equal(currentSubscription.status, 'expired', 'removed Web Billing entitlement expires its mirror');
  no(currentProof, 'removed Web Billing entitlement deletes paid proof');
} finally { globalThis.fetch = originalFetch; }

console.log(`Briefings RevenueCat adapter: ${checks} checks passed`);
