// Execute the real release backend modules with HTTP doubles only: no account, store or network writes.
// Run: node --import tsx scripts/test-android-compatibility.mts
import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync, randomUUID } from 'node:crypto';
process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'local-service';
process.env.BOBBY_SUPABASE_ANON_KEY = 'local-anon';
process.env.REVENUECAT_SECRET_KEY = 'local-server-key';
process.env.REVENUECAT_WEBHOOK_AUTH = 'local-webhook-authorization';
process.env.STRIPE_SECRET_KEY = 'local-stripe-key';
process.env.STRIPE_WEBHOOK_SECRET = 'local-stripe-webhook';
process.env.STRIPE_PRICE_ID = 'price_local';
delete process.env.REVENUECAT_V2_SECRET_KEY;
delete process.env.BOBBY_GOOGLE_PAYMENTS_ENABLED;
delete process.env.BOBBY_REVENUECAT_ANDROID_APP_ID;
delete process.env.BOBBY_REVENUECAT_ANDROID_PRODUCT_ID;
const { revenueCatStoreProvider, googlePaymentsReady, paidPeriodFromRevenueCat, paidPeriodFromRevenueCatHistory, syncRevenueCat } = await import('../api/_lib/revenuecat.ts');
const { activeSubscription, getSubscription, upsertSubscription, SubscriptionProviderConflictError } = await import('../api/_lib/access.ts');
const { memoryDeskAllowed } = await import('../api/_lib/user-memory.ts');
const { default: accessHandler } = await import('../api/bobby-access.ts');
const { default: revenueCatHandler } = await import('../api/revenuecat-webhook.ts');
const { POST: stripeHandler } = await import('../api/stripe-webhook.ts');
let checks = 0;
const eq = (got: unknown, expected: unknown, label: string) => { assert.deepEqual(got, expected, label); checks++; };
const throws = async (operation: () => Promise<unknown>, error: any, label: string) => { await assert.rejects(operation, error, label); checks++; };
for (const store of ['PLAY_STORE', 'play_store', 'google_play', 'GOOGLE_PLAY']) eq(revenueCatStoreProvider(store), 'google', `explicit Google provider: ${store}`);
for (const store of ['TEST_STORE', 'PROMOTIONAL', 'AMAZON', '', undefined, null, 12, {}]) eq(revenueCatStoreProvider(store), null, 'unknown/test/missing stores cannot imply a provider');
eq(revenueCatStoreProvider('APP_STORE'), 'apple', 'existing Apple mapping');
eq(revenueCatStoreProvider('RC_BILLING'), 'stripe', 'existing Web Billing mapping');
eq(googlePaymentsReady(), false, 'new Google payments are disabled by default');
process.env.BOBBY_GOOGLE_PAYMENTS_ENABLED = 'on'; eq(googlePaymentsReady(), false, 'only exact true activates capability');
process.env.BOBBY_GOOGLE_PAYMENTS_ENABLED = 'true'; eq(googlePaymentsReady(), true, 'explicit capability needs configured server');
delete process.env.REVENUECAT_SECRET_KEY; eq(googlePaymentsReady(), false, 'flag cannot replace server configuration');
process.env.REVENUECAT_SECRET_KEY = 'local-server-key';
const req = (header?: unknown) => ({ headers: header === undefined ? {} : { 'x-bobby-memory-opt-in': header } }) as any;
for (const header of [undefined, '0', 'true', ['1'], 1]) eq(memoryDeskAllowed(req(header), 'android', { BOBBY_MEMORY: 'on' }), false, 'Android requires scalar explicit native opt-in');
eq(memoryDeskAllowed(req('1'), 'android', { BOBBY_MEMORY: 'on' }), true, 'Android affirmative native consent');
eq(memoryDeskAllowed(req('1'), 'android', {}), false, 'native consent cannot bypass memory kill switch');
eq(memoryDeskAllowed(req(), 'web', { BOBBY_MEMORY: 'on' }), true, 'web compatibility is retained');

const identity = randomUUID(), auth = randomUUID(), product = 'bobby_pro:monthly';
const start = new Date(Date.now() - 86400_000).toISOString(), end = new Date(Date.now() + 29 * 86400_000).toISOString();
const subscriber = () => ({ entitlements: { pro: { product_identifier: product, expires_date: end } }, subscriptions: { [product]: {
  store: 'play_store', purchase_date: start, expires_date: end, period_type: 'normal', is_sandbox: false,
  ownership_type: 'PURCHASED', store_transaction_id: 'GPA.1234-5678-9012-34567..0', refunded_at: null,
} } });
const event = () => ({ id: 'local-google-event', type: 'INITIAL_PURCHASE', app_user_id: auth, environment: 'PRODUCTION', store: 'PLAY_STORE',
  product_id: product, entitlement_ids: ['pro'], period_type: 'NORMAL', is_family_share: false,
  transaction_id: subscriber().subscriptions[product].store_transaction_id, purchased_at_ms: Date.parse(start), expiration_at_ms: Date.parse(end),
  price_in_purchased_currency: 5, price: 5, currency: 'USD', event_timestamp_ms: Date.now(),
});
eq(paidPeriodFromRevenueCat(identity, auth, subscriber(), event())?.provider, 'google', 'paid Play proof is Google, never Stripe');
eq(paidPeriodFromRevenueCat(identity, auth, subscriber(), { ...event(), store: 'google_play' })?.provider, 'google', 'compatibility alias still binds the same Play store');
for (const change of [{ environment: 'SANDBOX' }, { store: 'TEST_STORE' }, { store: undefined }, { store: 'unknown' }, { period_type: 'TRIAL' }, { price_in_purchased_currency: 0 }, { type: 'TEST' }]) {
  eq(paidPeriodFromRevenueCat(identity, auth, subscriber(), { ...event(), ...change }), null, 'sandbox/test/unknown/trial/free event is not paid proof');
}
const history = () => ({ object: 'list', items: [{ object: 'customer.event', id: 'local-google-event', app_id: 'appd6f3bca10f', type: 'PURCHASES_INITIAL_PURCHASE', body: { ...event(), id: undefined, type: undefined } }] });
eq(paidPeriodFromRevenueCatHistory(identity, auth, subscriber(), history()), null, 'Google history requires verified app and product configuration');
process.env.BOBBY_REVENUECAT_ANDROID_APP_ID = 'appd6f3bca10f';
process.env.BOBBY_REVENUECAT_ANDROID_PRODUCT_ID = product;
eq(paidPeriodFromRevenueCatHistory(identity, auth, subscriber(), history())?.provider, 'google', 'explicit verified Android app/product history can restore paid proof');
const foreign = history(); foreign.items[0].app_id = 'app-other';
eq(paidPeriodFromRevenueCatHistory(identity, auth, subscriber(), foreign), null, 'another app history cannot prove Bobby Play purchase');

Object.assign(process.env,{BOBBY_PURCHASE_RESERVATIONS_ENABLED:'true',BOBBY_PURCHASE_LEGACY_CHECKOUTS_DRAINED:'true',BOBBY_PURCHASE_TOKEN_KEY:'a'.repeat(64),
 BOBBY_GOOGLE_PUBLISHER_CLIENT_EMAIL:'fixture@fixture.iam.gserviceaccount.com',BOBBY_GOOGLE_PUBLISHER_PRIVATE_KEY:generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}).toString(),
 BOBBY_GOOGLE_PRODUCT_CATALOG:JSON.stringify([{productId:'bobby_pro',basePlanId:'monthly'}])});
const {setPurchaseRpcForTests,sealPurchaseToken}=await import('../api/_lib/purchase-reservations.ts');
const {googleAccountId,tokenFingerprint}=await import('../api/_lib/google-publisher.ts');
const fixtureToken='local-owner-proof-token';let attempt:any=null;
setPurchaseRpcForTests(async(name,body)=>{
 if(name==='bobby_purchase_capability')return {version:1,activated:!!attempt};
 if(name==='bobby_purchase_attempt_get')return {attempt};
 if(name==='bobby_purchase_adopt_google'){attempt={id:randomUUID(),identity_id:identity,owner_key:'b'.repeat(64),provider:'google',origin:'adopted',product_id:'bobby_pro',base_plan_id:'monthly',offer_id:null,google_account_id:googleAccountId(auth),phase:'confirmed',revision:1,dispatch_at:null,token_fingerprint:tokenFingerprint(fixtureToken),token_ciphertext:sealPurchaseToken(fixtureToken)};return {attempt};}
 if(name==='bobby_purchase_observe'){attempt={...attempt,phase:body.p_phase,revision:attempt.revision+1};return {attempt};}
 throw new Error(`Unexpected fixture RPC ${name}`);
});
let live: any = subscriber(), mirrored: any = null, proof: any = null;
let subscriptionFailure = false, malformedRows: unknown | undefined, writeConflict = false;
const ledger: any[] = []; const calls: string[] = [];
const originalFetch = globalThis.fetch;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = (async (input: any, init: RequestInit = {}) => {
  const url = String(input), method = init.method ?? 'GET'; calls.push(`${method} ${url}`);
  const body = typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : null;
  if (url === 'https://api.stripe.com/v1/subscriptions/sub_old' && method === 'GET') return json({id:'sub_old',status:'canceled',livemode:true,metadata:{identity_id:identity}});
  if(url==='https://oauth2.googleapis.com/token')return json({token_type:'Bearer',access_token:'local-publisher-access',expires_in:3600});
  if(url.startsWith('https://androidpublisher.googleapis.com/')){
   if(url.includes('/orders/'))return json({orderId:subscriber().subscriptions[product].store_transaction_id,purchaseToken:fixtureToken});
   return json({kind:'androidpublisher#subscriptionPurchaseV2',externalAccountIdentifiers:{obfuscatedExternalAccountId:googleAccountId(auth)},startTime:start,subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',acknowledgementState:'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',lineItems:[{productId:'bobby_pro',offerDetails:{basePlanId:'monthly'},expiryTime:end,latestSuccessfulOrderId:subscriber().subscriptions[product].store_transaction_id}]});
  }
  if (url.startsWith('https://api.revenuecat.com/v1/subscribers/')) return json({ subscriber: live });
  if (url === 'https://db.test/auth/v1/user') return json({ id: auth, app_metadata: { provider: 'google' } });
  if (url.includes('/bobby_identities')) return json([{ id: identity, auth_user_id: auth, wallet_address: null }]);
  if (url.includes('/bobby_checkout_attempts')) return json([]);
  if (url.includes('/bobby_subscriptions')) {
    if (method === 'GET') return subscriptionFailure ? json({}, 503) : json(malformedRows ?? (mirrored ? [mirrored] : []));
    if (method === 'POST') {
      if (writeConflict) return json({ code: '23514', message: 'subscription_provider_conflict' }, 400);
      mirrored = { ...mirrored, ...body }; return json(null, 201);
    }
  }
  if (url.includes('/bobby_brief_paid_periods')) {
    if (method === 'GET') return json(proof ? [proof] : []);
    if (method === 'POST') { proof = body; return json(null, 201); }
    if (method === 'DELETE') { proof = null; return new Response(null, { status: 204 }); }
  }
  if (url.includes('/bobby_purchase_events')) { ledger.push(body); return json(null, 201); }
  if (url.includes('/bobby_referral_codes')) return json([{ code: 'LOCAL123' }]);
  if (url.includes('/bobby_referrals') || url.includes('/bobby_pro_grants')) return json([]);
  if (url.includes('/api_cache')) return method === 'GET' ? json([]) : json(null, 201);
  if (url.includes('/rpc/bobby_read_access')) return json({ tier: mirrored?.status === 'active' ? 'pro' : 'free', used: 0, limit: 10, bonus: 0 });
  if (url.includes('/rpc/bobby_level_state')) return json({ tier: 'free', levels: {} });
  throw new Error(`Unexpected mocked fetch ${method} ${url}`);
}) as typeof fetch;
const call = async (handler: any, method: string, body?: unknown, authHeader = 'Bearer local-session') => {
  let status = 200, result: any;
  const response = { setHeader: () => undefined, status(code: number) { status = code; return this; }, json(value: unknown) { result = value; return this; } };
  await handler({ method, body, headers: { authorization: authHeader, 'x-bobby-platform': 'android', 'x-forwarded-for': '203.0.113.12', host: 'bobbyprotocol.xyz' } }, response);
  return { status, body: result };
};
try {
  eq(await syncRevenueCat(auth, identity, event()), true, 'production Play subscriber mirrors Pro');
  eq([mirrored.provider, proof.provider], ['google', 'google'], 'mirror and paid proof both identify Google');
  delete process.env.BOBBY_GOOGLE_PAYMENTS_ENABLED;
  const closed = await call(accessHandler, 'GET'); eq(closed.body.payments.google, false, 'GET explicitly advertises disabled sales');
  process.env.BOBBY_GOOGLE_PAYMENTS_ENABLED = 'true';
  eq((await call(accessHandler, 'GET')).body.payments.google, true, 'GET explicitly advertises enabled capability after activation');
  const blocked = await call(accessHandler, 'POST', { action: 'checkout' }); eq(blocked.status, 409, 'web checkout refuses active Google membership');
  eq(calls.some(url => url.includes('api.stripe.com')), false, 'duplicate checkout never reaches Stripe');
  for (const provider of ['apple', 'stripe', 'google', 'unknown']) {
    mirrored = { ...mirrored, provider, current_period_end: null };
    eq(activeSubscription(mirrored), true, `${provider} null-ended active state blocks another charge`);
    eq((await call(accessHandler, 'POST', { action: 'checkout' })).status, 409, `${provider} active membership blocks actual checkout route`);
  }
  mirrored = { ...mirrored, provider: 'google', current_period_end: end };
  subscriptionFailure = true;
  eq((await call(accessHandler, 'POST', { action: 'checkout' })).status, 503, 'subscription outage cannot start card checkout');
  eq((await call(accessHandler, 'GET')).status, 503, 'subscription outage cannot advertise null membership as purchasable');
  subscriptionFailure = false; malformedRows = {};
  await throws(() => getSubscription(identity), /Malformed subscription state/, 'malformed storage envelope fails closed');
  malformedRows = [{ identity_id: identity, provider: 'google', status: 'active' }];
  await throws(() => getSubscription(identity), /Malformed subscription state/, 'missing mirror expiration field fails closed');
  malformedRows = undefined;
  writeConflict = true;
  await throws(() => upsertSubscription({ identity_id: identity, provider: 'stripe', status: 'active' }), SubscriptionProviderConflictError, 'atomic database conflict becomes typed conflict');
  writeConflict = false;
  mirrored = { ...mirrored, provider: 'apple' };
  await throws(() => syncRevenueCat(auth, identity, event()), SubscriptionProviderConflictError, 'Play sync cannot replace active Apple provider');
  eq(mirrored.provider, 'apple', 'conflicting provider mirror is preserved');
  for (const change of [{ store: 'TEST_STORE' }, { store: undefined }, { store: 'AMAZON' }, { is_sandbox: true }, { is_sandbox: undefined }, { ownership_type: undefined }]) {
    mirrored = null; proof = null; live = subscriber(); Object.assign(live.subscriptions[product], change);
    eq(await syncRevenueCat(auth, identity, event()), false, 'unverified current store/environment/ownership never grants Pro');
    eq(mirrored, null, 'unverified customer cannot create subscription'); eq(proof, null, 'unverified customer cannot create paid proof');
  }
  // A sandbox allowlist only preserves the deployed Apple behavior; it cannot authorize Play test payments.
  process.env.BOBBY_SANDBOX_PRO_UIDS = auth;
  live = subscriber(); live.subscriptions[product].is_sandbox = true; mirrored = null; proof = null;
  eq(await syncRevenueCat(auth, identity, event()), false, 'allowlisted auth user cannot acquire Pro from Play Sandbox');
  eq(mirrored, null, 'Play Sandbox allowlist cannot create a membership');
  eq(proof, null, 'Play Sandbox allowlist cannot create paid evidence');
  delete process.env.BOBBY_SANDBOX_PRO_UIDS;
  for (const [change, entitlementChange] of [
    [{ expires_date: null }, { expires_date: null }],
    [{ expires_date: 'not-a-date' }, { expires_date: 'not-a-date' }],
    [{}, { product_identifier: 'another-product' }],
    [{}, { expires_date: new Date(Date.parse(end) + 60_000).toISOString() }],
    [{ expires_date: new Date(Date.now() - 60_000).toISOString(), grace_period_expires_date: end },
      { expires_date: new Date(Date.now() - 60_000).toISOString() }],
  ]) {
    live = subscriber(); Object.assign(live.subscriptions[product], change); Object.assign(live.entitlements.pro, entitlementChange);
    mirrored = null; proof = null;
    eq(await syncRevenueCat(auth, identity, event()), false, 'Play basic Pro requires its matching bounded live period');
    eq(mirrored?.status === 'active' || mirrored?.status === 'trialing', false, 'ineligible Play period cannot grant an active membership');
    eq(proof, null, 'ineligible Play period cannot produce paid evidence');
  }
  // Baseline Apple Sandbox/family/unbounded entitlements keep basic Pro for review/restore;
  // they never satisfy paid proof, even if an event falsely reports a positive price.
  for (const change of [{ is_sandbox: true }, { is_sandbox: true, ownership_type: 'FAMILY_SHARED' }, { expires_date: null }]) {
    live = subscriber(); live.subscriptions[product].store = 'app_store'; Object.assign(live.subscriptions[product], change);
    if (change.expires_date === null) live.entitlements.pro.expires_date = null;
    mirrored = null; proof = null;
    eq(await syncRevenueCat(auth, identity, { ...event(), store: 'APP_STORE', environment: 'SANDBOX' }), true, 'known Apple baseline entitlement still grants basic Pro');
    eq(mirrored.provider, 'apple', 'Apple preview remains explicitly Apple');
    eq(proof, null, 'Apple preview never creates paid evidence');
  }
  // Google cannot replace live Apple or RC Web Billing; the newer Apple/card sidecar remains independent.
  for (const [currentProvider, nextStore] of [['stripe', 'play_store'], ['apple', 'play_store']]) {
    live = subscriber(); live.subscriptions[product].store = nextStore;
    mirrored = { identity_id: identity, provider: currentProvider, status: 'active', current_period_end: end, stripe_subscription_id: null };
    await throws(() => syncRevenueCat(auth, identity), SubscriptionProviderConflictError, 'Google cannot replace an active Apple/RC Billing provider');
    eq(mirrored.provider, currentProvider, 'existing active Apple/RC Billing provider is retained');
  }
  process.env.BOBBY_SANDBOX_PRO_UIDS = auth;
  live = subscriber(); live.entitlements.pro.product_identifier = 'test-product';
  live.subscriptions[product].is_sandbox = true;
  live.subscriptions['test-product'] = { store: 'test_store', expires_date: end };
  live.subscriptions['apple-product'] = { store: 'app_store', expires_date: end, is_sandbox: true };
  mirrored = null; proof = null;
  eq(await syncRevenueCat(auth, identity), true, 'allowlisted Apple subscription survives beside Test Store and invalid Play Sandbox');
  eq([mirrored.provider, mirrored.product_id, mirrored.environment], ['apple', 'apple-product', 'sandbox'], 'deployed Apple fallback/allowlist metadata is retained');
  eq(proof, null, 'mixed Sandbox and Test Store still creates no paid evidence');
  delete process.env.BOBBY_SANDBOX_PRO_UIDS;
  live = subscriber(); live.subscriptions[product].store = 'app_store'; live.subscriptions[product].period_type = 'trial';
  mirrored = null; proof = null;
  eq(await syncRevenueCat(auth, identity), true, 'deployed Apple trial retains basic membership');
  eq([mirrored.status, mirrored.period_type], ['trialing', 'trial'], 'trial remains explicitly trialing');
  eq(proof, null, 'trial membership is not paid proof');
  live = subscriber(); mirrored = null; proof = null;
  for (const [store, environment, type, expected] of [
    ['PLAY_STORE', 'PRODUCTION', 'INITIAL_PURCHASE', 'PRODUCTION'], ['TEST_STORE', 'PRODUCTION', 'INITIAL_PURCHASE', 'SANDBOX'],
    ['AMAZON', 'PRODUCTION', 'INITIAL_PURCHASE', 'UNKNOWN'], [undefined, 'PRODUCTION', 'INITIAL_PURCHASE', 'UNKNOWN'],
    ['PLAY_STORE', undefined, 'INITIAL_PURCHASE', 'UNKNOWN'], ['PLAY_STORE', 'PRODUCTION', 'TEST', 'SANDBOX'],
  ] as const) {
    const answer = await call(revenueCatHandler, 'POST', { event: { id: randomUUID(), store, environment, type, price: 5 } }, process.env.REVENUECAT_WEBHOOK_AUTH);
    eq(answer.status, 200, 'authenticated ledger event processed locally'); eq(ledger.at(-1)?.environment, expected, 'unknown/test events never enter production ledger');
  }
  // Actual signed Stripe route: late cancellation cannot expire a current Google mirror.
  mirrored = { identity_id: identity, provider: 'google', status: 'active', current_period_end: end };
  const deleted = { id: 'evt_old_stripe', type: 'customer.subscription.deleted', data: { object: { id: 'sub_old', status: 'canceled', livemode: true, metadata: { identity_id: identity } } } };
  const raw = JSON.stringify(deleted), t = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET!).update(`${t}.${raw}`).digest('hex');
  const oldResponse = await stripeHandler(new Request('https://local.test/stripe-webhook', { method: 'POST', body: raw, headers: { 'Stripe-Signature': `t=${t},v1=${signature}` } }));
  eq(oldResponse.status, 200, 'late former Stripe cancellation acknowledged');
  eq([mirrored.provider, mirrored.status], ['google', 'active'], 'late Stripe event preserves current Play membership');
} finally { globalThis.fetch = originalFetch; }
console.log(`Android backend compatibility: ${checks} checks passed`);
