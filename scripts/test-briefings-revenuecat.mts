// Paid weekly briefings require a positive provider purchase corroborated by the current subscriber.
// Exercise authenticated webhooks and recovery from original V2 events, including fail-closed boundaries.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.REVENUECAT_SECRET_KEY = 'test-secret';
delete process.env.REVENUECAT_V2_SECRET_KEY;
process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';

const { paidPeriodFromRevenueCat, paidPeriodFromRevenueCatHistory, syncRevenueCat } = await import('../api/_lib/revenuecat.ts');
let checks = 0;
const yes = (value: unknown, message: string) => { assert.ok(value, message); checks++; };
const no = (value: unknown, message: string) => { assert.equal(value, null, message); checks++; };
const equal = (got: unknown, expected: unknown, message: string) => { assert.deepEqual(got, expected, message); checks++; };
const identity = randomUUID(), auth = randomUUID(), product = 'xyz.bobbyprotocol.bobby.pro.monthly';
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

const historyEvent = () => {
  const { id, type: _type, ...body } = event();
  return { object: 'customer.event', id, app_id: 'app25c54ce720', type: 'PURCHASES_INITIAL_PURCHASE', body };
};
const history = () => ({ object: 'list', items: [historyEvent()], next_page: null });
const historical = (s: any = subscriber(), h: unknown = history()) => paidPeriodFromRevenueCatHistory(identity, auth, s, h);
yes(historical(), 'original paid V2 event plus current V1 subscriber recovers historical purchase');
equal(historical()?.proof_id, event().transaction_id, 'history proof binds exact store transaction');
equal(historical()?.paid_amount, 4.99, 'history preserves provider price without using the revenue ledger');
equal(historical()?.period_end, end, 'history proof uses current matching period');
const renewalHistory = history(); renewalHistory.items[0].type = 'PURCHASES_RENEWAL';
yes(historical(subscriber(), renewalHistory), 'current paid renewal event can be recovered');
for (const [label, change] of [
  ['different account even when aliases include owner', { app_user_id: randomUUID(), aliases: [auth], original_app_user_id: auth }],
  ['sandbox', { environment: 'SANDBOX' }], ['trial', { period_type: 'TRIAL' }],
  ['zero', { price_in_purchased_currency: 0 }], ['negative', { price_in_purchased_currency: -1 }],
  ['unknown price', { price_in_purchased_currency: undefined }], ['string price', { price_in_purchased_currency: '4.99' }],
  ['invalid currency', { currency: 'usd' }], ['different product', { product_id: 'other.pro' }],
  ['different transaction', { transaction_id: 'other-transaction' }],
  ['different period start', { purchased_at_ms: Date.parse(start) + 60000 }],
  ['different period end', { expiration_at_ms: Date.parse(end) + 60000 }],
  ['family share', { is_family_share: true }], ['unknown family share', { is_family_share: undefined }],
  ['promotional store', { store: 'PROMOTIONAL' }], ['wrong entitlement', { entitlement_ids: ['other'] }],
  ['malformed entitlements', { entitlement_ids: {} }], ['conflicting body event type', { type: 'RENEWAL' }],
  ['conflicting body event ID', { id: 'different-event' }],
] as const) {
  const bad = history(); Object.assign(bad.items[0].body, change);
  no(historical(subscriber(), bad), `V2 ${label} cannot create paid proof`);
}
for (const [label, change] of [
  ['wrong app', { app_id: 'other-app' }], ['unknown wrapper', { type: 'INITIAL_PURCHASE' }],
  ['non-purchase wrapper', { type: 'PURCHASES_CANCELLATION' }], ['unknown event object', { object: 'unknown' }],
  ['missing event ID', { id: '' }], ['malformed event body', { body: [] }],
] as const) {
  const bad = history(); Object.assign(bad.items[0], change);
  no(historical(subscriber(), bad), `${label} cannot create paid proof`);
}
for (const [label, s] of [
  ['free account', { entitlements: {}, subscriptions: {} }], ['gift', giftSub],
  ['trial subscriber', trialSub], ['sandbox subscriber', sandboxSub], ['shared subscription', familySub],
  ['refunded subscription', refundedSub], ['expired subscription', expiredSub], ['changed transaction', changedSub],
] as const) no(historical(s), `${label} cannot recover a paid history proof`);
const unknownProductSub = subscriber();
unknownProductSub.entitlements.pro.product_identifier = 'unknown.pro';
unknownProductSub.subscriptions['unknown.pro'] = unknownProductSub.subscriptions[product];
const unknownProductHistory = history(); unknownProductHistory.items[0].body.product_id = 'unknown.pro';
no(historical(unknownProductSub, unknownProductHistory), 'unknown product is excluded even if both provider responses match it');
const duplicateHistory = history();
duplicateHistory.items.push({ ...historyEvent(), id: 'another-event', body: { ...historyEvent().body, price_in_purchased_currency: 99 } });
no(historical(subscriber(), duplicateHistory), 'two contradictory positive events for one transaction fail closed');
const recentHistory = history();
recentHistory.items.unshift({ ...historyEvent(), id: 'stale-event', body: { ...historyEvent().body, transaction_id: 'stale-transaction' } });
yes(historical(subscriber(), recentHistory), 'stale history cannot replace the uniquely matching current transaction');
no(historical(subscriber(), { object: 'list', items: Array.from({ length: 21 }, historyEvent) }), 'history response exceeding bounded limit is rejected');
no(historical(subscriber(), { items: [historyEvent()] }), 'unknown history envelope is rejected');

let currentSubscriber: any = subscriber();
let currentSubscription: any = null;
let currentProof: any = null;
const methods: string[] = [];
let currentHistory: unknown = history();
let historyStatus = 200, historyThrows = false, historyRequests = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const url = String(input), method = init?.method ?? 'GET';
  methods.push(`${method} ${new URL(url).pathname}`);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.startsWith('https://api.revenuecat.com/v1/subscribers/')) {
    equal(String((init?.headers as Record<string, string>).Authorization), 'Bearer test-secret', 'subscriber fetch authenticates to RevenueCat');
    return json({ subscriber: currentSubscriber });
  }
  if (url.startsWith('https://api.revenuecat.com/v2/')) {
    historyRequests++;
    const target = new URL(url);
    equal(target.pathname, `/v2/projects/proj2d9c569b/customers/${auth}/events`, 'history fetch is scoped to Bobby project and authenticated customer');
    equal(target.searchParams.get('environment'), 'production', 'history requests production only');
    equal(target.searchParams.get('limit'), '20', 'history query has a bounded page');
    equal(String((init?.headers as Record<string, string>).Authorization), 'Bearer test-v2-secret', 'history uses existing V2 server key');
    equal(init?.redirect, 'error', 'history cannot redirect credentials to another host');
    yes(init?.signal instanceof AbortSignal, 'history request has a bounded timeout');
    if (historyThrows) throw new DOMException('timed out', 'TimeoutError');
    return json(currentHistory, historyStatus);
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

  process.env.REVENUECAT_V2_SECRET_KEY = 'test-v2-secret';
  currentSubscriber = subscriber(); currentSubscription = null; currentProof = null;
  equal(await syncRevenueCat(auth, identity), true, 'authenticated restore keeps basic Pro active');
  yes(currentProof, 'existing original provider event recovers proof without manual database writes');
  equal(currentProof.proof_id, event().transaction_id, 'recovered persisted proof uses current transaction');
  const recoveredHash = currentProof.proof_sha256, requestsAfterRecovery = historyRequests;
  await syncRevenueCat(auth, identity);
  equal(historyRequests, requestsAfterRecovery, 'matching existing proof avoids repeated history requests');
  equal(currentProof.proof_sha256, recoveredHash, 'repeat sync preserves idempotent proof');

  for (const status of [401, 403, 404, 429, 500]) {
    currentProof = null; historyStatus = status;
    equal(await syncRevenueCat(auth, identity), true, `V2 ${status} does not deny basic Pro`);
    no(currentProof, `V2 ${status} cannot create paid proof`);
  }
  historyStatus = 200; historyThrows = true; currentProof = null;
  equal(await syncRevenueCat(auth, identity), true, 'V2 timeout does not deny basic Pro');
  no(currentProof, 'V2 timeout cannot create paid proof');
  historyThrows = false;
  currentHistory = { object: 'list', items: [], next_page: 'https://attacker.invalid/steal' };
  const requestsBeforeNoMatch = historyRequests;
  equal(await syncRevenueCat(auth, identity), true, 'history with no current transaction preserves basic Pro');
  no(currentProof, 'missing current event is not guessed from another page');
  equal(historyRequests, requestsBeforeNoMatch + 1, 'arbitrary next_page is never fetched');

  delete process.env.REVENUECAT_V2_SECRET_KEY;
  const requestsBeforeMissingKey = historyRequests;
  equal(await syncRevenueCat(auth, identity), true, 'missing V2 key keeps basic Pro');
  no(currentProof, 'missing V2 key cannot create proof');
  equal(historyRequests, requestsBeforeMissingKey, 'missing V2 key does not issue a request');
  process.env.REVENUECAT_V2_SECRET_KEY = 'test-v2-secret'; currentHistory = history();
  const requestsBeforeWebhook = historyRequests;
  await syncRevenueCat(auth, identity, { ...event(), transaction_id: 'stale' });
  no(currentProof, 'contradictory webhook cannot be repaired from history');
  equal(historyRequests, requestsBeforeWebhook, 'webhook path never invokes optional authenticated restore backfill');

  currentSubscriber = subscriber(); await syncRevenueCat(auth, identity);
  yes(currentProof, 'valid history restores the original proof');
  currentSubscriber = refundedSub;
  const requestsBeforeRefund = historyRequests;
  equal(await syncRevenueCat(auth, identity), false, 'refund still revokes basic Pro after history recovery');
  no(currentProof, 'refund deletes recovered proof');
  equal(historyRequests, requestsBeforeRefund, 'refunded current subscriber never queries paid history');
} finally { globalThis.fetch = originalFetch; delete process.env.REVENUECAT_V2_SECRET_KEY; }

console.log(`Briefings RevenueCat adapter: ${checks} checks passed`);
