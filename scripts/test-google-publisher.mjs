// Independent test of the actual Google helper. Local HTTP doubles only: no network, real accounts or credentials.
// Run from the project checkout: node /private/tmp/bobby-purchase-reservations-patched/scripts/test-google-publisher.mjs
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(scriptDir, '../api/_lib/google-publisher.ts');
const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const work = mkdtempSync(path.join(tmpdir(), 'bobby-google-publisher-test-'));
const modulePath = path.join(work, 'google-publisher.mjs');
const compiled = ts.transpileModule(readFileSync(source, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
writeFileSync(modulePath, compiled.outputText);
const savedEnvironment = new Map(['BOBBY_GOOGLE_PUBLISHER_CLIENT_EMAIL', 'BOBBY_GOOGLE_PUBLISHER_PRIVATE_KEY',
  'BOBBY_GOOGLE_PRODUCT_CATALOG'].map(key => [key, process.env[key]]));
const savedFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('Real network forbidden by isolated Google test'); };
let checks = 0;
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const reject = (operation, code, label) => { assert.throws(operation, error => error?.code === code, label); checks++; };
const rejectAsync = async (operation, code, label) => { await assert.rejects(operation, error => error?.code === code, label); checks++; };
const clone = value => JSON.parse(JSON.stringify(value));

try {
  const g = await import(pathToFileURL(modulePath));
  const owner = '00000000-0000-4000-8000-000000000001';
  const ownerB = '00000000-0000-4000-8000-000000000002';
  // Fixed public test vector independently matches pinned SDK SHA256 -> Android Base64.NO_WRAP.
  const account = 'EeWU9IGVjBDjAV0L8ER6IvBoqKZH9HXfFc4serS48/E=';
  const product = { productId: 'review_test_product', basePlanId: 'monthly', offerId: 'trial' };
  const localToken = 'local.review.fixture.token';
  const now = Date.parse('2026-10-03T12:00:00Z');
  const start = '2026-10-02T12:00:00Z', expiry = '2026-11-02T12:00:00Z';
  const orderId = 'GPA.0000-0000-0000-00000..3';
  const valid = {
    kind: 'androidpublisher#subscriptionPurchaseV2',
    externalAccountIdentifiers: { obfuscatedExternalAccountId: account },
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    startTime: start,
    lineItems: [{ productId: product.productId, expiryTime: expiry,
      offerDetails: { basePlanId: product.basePlanId, offerId: product.offerId },
      latestSuccessfulOrderId: orderId }],
  };
  const parse = (raw, notBefore = null, expected = product) =>
    g.googleProofFromSubscription(raw, localToken, expected, account, notBefore, now);

  eq(g.GOOGLE_PACKAGE, 'xyz.bobbyprotocol.bobby', 'provider requests use the actual Android application package');
  eq(g.googleAccountId(owner), account, 'owner hash is exact padded standard Base64');
  eq(account.length, 44, 'owner hash has 44 characters');
  eq(g.googleAccountId('AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA') ===
    g.googleAccountId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), false, 'SDK owner ID is not silently lowercased');
  eq(g.tokenFingerprint(localToken), createHash('sha256').update(`${g.GOOGLE_PACKAGE}|${localToken}`).digest('hex'),
    'token fingerprint is package scoped');
  eq(parse(valid).phase, 'confirmed', 'matching acknowledged production obligation can confirm');
  for (const candidate of [account.replace(/\//g, '_').replace(/=/g, ''),
    createHash('sha256').update(owner).digest('hex'), undefined, null, g.googleAccountId(ownerB)]) {
    const raw = clone(valid); raw.externalAccountIdentifiers.obfuscatedExternalAccountId = candidate;
    reject(() => parse(raw), 'google_owner_unverified', 'foreign/missing/hex/Base64URL owner never substitutes');
  }
  for (const marker of [{}, false, null]) {
    reject(() => parse({ ...clone(valid), testPurchase: marker }), 'google_owner_unverified',
      'presence of any testPurchase marker rejects production proof');
  }
  for (const variant of [
    { ...product, productId: `${product.productId}:${product.basePlanId}` },
    { ...product, productId: 'other' }, { ...product, basePlanId: 'annual' },
    { ...product, offerId: null }, { ...product, offerId: 'other' },
  ]) reject(() => parse(valid, null, variant), 'google_product_unverified', 'exact raw product/plan/offer binding');
  const noOffer = clone(valid); delete noOffer.lineItems[0].offerDetails.offerId;
  eq(parse(noOffer, null, { ...product, offerId: null }).phase, 'confirmed', 'base plan without offer is explicitly bound');
  reject(() => parse(noOffer), 'google_product_unverified', 'missing offer cannot satisfy a reserved offer');
  for (const field of ['deferredItemReplacement', 'deferredItemRemoval', 'itemReplacement']) {
    const raw = clone(valid); raw.lineItems[0][field] = { productId: 'other' };
    reject(() => parse(raw), 'google_product_unverified', 'unreserved replacement intent rejects');
  }
  for (const variant of [{ linkedPurchaseToken: 'old.local.token' }, { outOfAppPurchaseContext: {} }]) {
    reject(() => parse({ ...clone(valid), ...variant }), 'google_purchase_not_participating',
      'old linked/outside-app purchase cannot masquerade as participating initiation');
  }
  for (const lineItems of [[], null, [valid.lineItems[0], valid.lineItems[0]]]) {
    reject(() => parse({ ...clone(valid), lineItems }), 'google_purchase_not_participating', 'unexpected multiline shape rejects');
  }
  reject(() => parse({ ...clone(valid), kind: 'other' }), 'google_owner_unverified', 'unexpected provider resource rejects');
  reject(() => parse(valid, now - 60_000), 'google_purchase_precedes_attempt', 'old subscription start rejects even with recent renewal order');
  eq(parse(valid, null).phase, 'confirmed', 'adopted restore uses null initiation fence and verifies old owner token');
  reject(() => parse(valid, Number.NaN), 'google_purchase_precedes_attempt', 'invalid initiation fence fails closed');
  reject(() => parse(valid, now + 1), 'google_purchase_precedes_attempt', 'future initiation fence fails closed');
  for (const candidate of [undefined, 'invalid', '2026-10-03T12:02:00Z']) {
    const raw = clone(valid); raw.startTime = candidate;
    reject(() => parse(raw), 'google_time_unverified', 'active subscription needs a valid grant time');
  }
  const pending = clone(valid); pending.subscriptionState = 'SUBSCRIPTION_STATE_PENDING'; delete pending.startTime;
  eq(parse(pending, now - 30_000).phase, 'pending', 'signup pending without startTime remains chargeable');
  const unacknowledged = clone(valid); unacknowledged.acknowledgementState = 'ACKNOWLEDGEMENT_STATE_PENDING';
  eq(parse(unacknowledged).phase, 'pending', 'unacknowledged active purchase is not falsely confirmed');
  for (const state of ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_CANCELED', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD']) {
    const raw = clone(valid); raw.subscriptionState = state;
    eq(parse(raw).phase, 'confirmed', 'canceled-but-not-expired/grace/active still retain obligation');
    raw.lineItems[0].expiryTime = '2026-10-03T11:00:00Z';
    reject(() => parse(raw), 'google_expiry_unverified', 'ended period cannot appear as current confirmed subscription');
  }
  for (const state of ['SUBSCRIPTION_STATE_PAUSED', 'SUBSCRIPTION_STATE_ON_HOLD']) {
    const raw = clone(valid); raw.subscriptionState = state; raw.lineItems[0].expiryTime = '2026-10-03T11:00:00Z';
    eq(parse(raw).phase, 'pending', 'paused/on-hold retain obligation independently of expired entitlement');
  }
  const ended = clone(valid); ended.subscriptionState = 'SUBSCRIPTION_STATE_EXPIRED';
  reject(() => parse(ended), 'google_expiry_unverified', 'EXPIRED with future expiry remains unverifiable');
  ended.lineItems[0].expiryTime = '2026-10-03T11:00:00Z';
  eq(parse(ended).phase, 'closed', 'expired current state and past expiry can close an obligation');
  const canceled = clone(pending); canceled.subscriptionState = 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED';
  delete canceled.lineItems[0].latestSuccessfulOrderId;
  eq(parse(canceled).phase, 'terminal_no_charge', 'only confirmed terminal pending cancellation releases');
  reject(() => parse({ ...canceled, linkedPurchaseToken: 'old.local.token' }), 'google_purchase_not_participating',
    'canceled topup cannot release still-chargeable previous subscription');
  const ambiguous = clone(canceled); ambiguous.startTime = start;
  reject(() => parse(ambiguous), 'google_cancellation_ambiguous', 'pending cancellation after a grant stays ambiguous');
  const trial = clone(valid); trial.lineItems[0].offerPhase = { freeTrial: {} }; trial.price = 0;
  const trialProof = parse(trial);
  eq(trialProof.phase, 'confirmed', 'free trial can establish an obligation but not a paid receipt');
  eq(Object.keys(trialProof).some(key => /paid|amount|price|revenue/i.test(key)), false, 'Google obligation carries no invented paid amount');
  reject(() => parse({ ...clone(valid), subscriptionState: 'UNKNOWN_FUTURE_STATE' }), 'google_state_unknown',
    'unknown lifecycle state never releases or grants silently');

  eq(g.googleProducts({}), [], 'catalog absent cannot activate sales');
  eq(g.googleProducts({ BOBBY_GOOGLE_PRODUCT_CATALOG: JSON.stringify([product]) }), [product], 'explicit actual configured product catalog');
  for (const catalog of ['{}', 'null', '[null]', JSON.stringify([product, product]),
    JSON.stringify([{ ...product, unknown: true }]), JSON.stringify([{ ...product, productId: 123 }]),
    JSON.stringify([{ ...product, basePlanId: 123 }]), JSON.stringify([{ ...product, offerId: 123 }])]) {
    eq(g.googleProducts({ BOBBY_GOOGLE_PRODUCT_CATALOG: catalog }), [], 'malformed/duplicate/non-string product catalog fails closed');
  }

  // Ephemeral local key signs a synthetic OAuth assertion only to inspect the actual helper; never sent remotely.
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = key.privateKey.export({ type: 'pkcs8', format: 'pem' });
  process.env.BOBBY_GOOGLE_PUBLISHER_CLIENT_EMAIL = 'local-review@review-fixture.iam.gserviceaccount.com';
  process.env.BOBBY_GOOGLE_PUBLISHER_PRIVATE_KEY = pem;
  eq(g.publisherConfig({}), null, 'credentials absent disable verification');
  eq(g.publisherConfig({ BOBBY_GOOGLE_PUBLISHER_CLIENT_EMAIL: 'invalid', BOBBY_GOOGLE_PUBLISHER_PRIVATE_KEY: pem }), null,
    'invalid configured service account disables verification');
  eq(Boolean(g.publisherConfig()), true, 'ephemeral test-only RSA fixture is valid for local signing');

  const fixture = ({ subscription = valid, order = { orderId, purchaseToken: localToken }, oauthStatus = 200,
    oauthBody = { token_type: 'Bearer', access_token: 'local.access.token', expires_in: 3600 },
    providerStatus = 200, throwAt = null, invalidProviderJson = false } = {}) => {
    const calls = [];
    const http = async (input, init = {}) => {
      const url = new URL(String(input)); calls.push({ url: String(url), method: init.method ?? 'GET' });
      if (throwAt === url.hostname) throw new Error('synthetic local transport interruption');
      if (url.href === 'https://oauth2.googleapis.com/token') {
        eq(init.method, 'POST', 'OAuth assertion uses POST');
        const body = new URLSearchParams(init.body);
        eq(body.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'service OAuth assertion grant');
        const parts = body.get('assertion').split('.');
        const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        eq(claims.iss, process.env.BOBBY_GOOGLE_PUBLISHER_CLIENT_EMAIL, 'OAuth binds configured service account');
        eq([claims.aud, claims.scope], ['https://oauth2.googleapis.com/token', 'https://www.googleapis.com/auth/androidpublisher'],
          'OAuth target/scope are fixed Developer API only');
        eq(claims.exp - claims.iat, 3600, 'OAuth assertion bounds lifetime');
        eq(verify('RSA-SHA256', Buffer.from(parts.slice(0, 2).join('.')), key.publicKey, Buffer.from(parts[2], 'base64url')), true,
          'actual helper assertion is signed by its ephemeral configured key');
        return Response.json(oauthBody, { status: oauthStatus });
      }
      eq(url.hostname, 'androidpublisher.googleapis.com', 'no arbitrary provider host');
      eq(init.headers.Authorization, 'Bearer local.access.token', 'provider request uses the verified OAuth result');
      eq(url.pathname.startsWith(`/androidpublisher/v3/applications/${g.GOOGLE_PACKAGE}/`), true, 'provider package is pinned');
      if (invalidProviderJson) return new Response('not-json', { status: providerStatus });
      if (url.pathname.includes('/orders/')) return Response.json(order, { status: providerStatus });
      if (url.pathname.includes('/purchases/subscriptionsv2/tokens/')) return Response.json(subscription, { status: providerStatus });
      throw new Error('Unexpected local provider route');
    };
    return { calls, http };
  };
  g.resetPublisherCache();
  let f = fixture();
  eq((await g.verifyGoogleToken(localToken, product, account, null, f.http, now)).phase, 'confirmed',
    'actual OAuth+subscriptionsv2 helper verifies current token');
  eq(f.calls.length, 2, 'token verification performs exactly OAuth plus current subscription');
  await g.verifyGoogleToken(localToken, product, account, null, f.http, now + 1000);
  eq(f.calls.filter(call => call.url.includes('oauth2.googleapis.com')).length, 1, 'valid OAuth cached without extra auth requests');
  await g.verifyGoogleToken(localToken, product, account, null, f.http, now + 3_541_000);
  eq(f.calls.filter(call => call.url.includes('oauth2.googleapis.com')).length, 2, 'expired OAuth is refreshed before provider request');

  g.resetPublisherCache(); f = fixture();
  const viaOrder = await g.verifyGoogleOrder(orderId, product, account, null, f.http, now);
  eq([viaOrder.token, viaOrder.phase], [localToken, 'confirmed'], 'order recovers actual token then current ownership/state');
  eq(f.calls.map(call => new URL(call.url).pathname), ['/token',
    `/androidpublisher/v3/applications/${g.GOOGLE_PACKAGE}/orders/${orderId}`,
    `/androidpublisher/v3/applications/${g.GOOGLE_PACKAGE}/purchases/subscriptionsv2/tokens/${localToken}`],
    'order hint always receives independent CURRENT subscription verification');
  g.resetPublisherCache();
  const otherOwner = clone(valid); otherOwner.externalAccountIdentifiers.obfuscatedExternalAccountId = g.googleAccountId(ownerB);
  f = fixture({ subscription: otherOwner });
  await rejectAsync(() => g.verifyGoogleOrder(orderId, product, account, null, f.http, now), 'google_owner_unverified',
    'matching order ID does not authorize another Bobby owner');
  g.resetPublisherCache(); f = fixture({ order: { orderId: 'GPA.9999-9999-9999-99999', purchaseToken: localToken } });
  await rejectAsync(() => g.verifyGoogleOrder(orderId, product, account, null, f.http, now), 'google_order_unverified',
    'provider returned another order rejects before using its token');
  eq(f.calls.some(call => call.url.includes('/purchases/')), false, 'mismatched order never proceeds to token grant');
  g.resetPublisherCache(); f = fixture();
  await rejectAsync(() => g.verifyGoogleOrder('../arbitrary-path', product, account, null, f.http, now), 'google_order_unavailable',
    'invalid order input cannot change provider route');
  eq(f.calls.length, 0, 'invalid order input starts no OAuth/provider call');
  await rejectAsync(() => g.verifyGoogleToken('../bad token', product, account, null, f.http, now), 'invalid_google_token',
    'malformed token starts no provider requests');
  eq(f.calls.length, 0, 'malformed token starts no OAuth/provider call');
  for (const variation of [{ oauthStatus: 401 }, { oauthBody: { token_type: 'bearer', access_token: 'local.access.token', expires_in: 3600 } },
    { oauthBody: { token_type: 'Bearer', access_token: 'local.access.token', expires_in: 3601 } }, { throwAt: 'oauth2.googleapis.com' }]) {
    g.resetPublisherCache(); f = fixture(variation);
    await rejectAsync(() => g.verifyGoogleToken(localToken, product, account, null, f.http, now), 'google_authorization_unavailable',
      'OAuth denial/malformed reply/interruption fails closed');
    eq(f.calls.some(call => call.url.includes('androidpublisher')), false, 'failed OAuth cannot proceed to publisher proof');
  }
  for (const variation of [{ providerStatus: 404 }, { providerStatus: 503 }, { invalidProviderJson: true },
    { subscription: [] }, { throwAt: 'androidpublisher.googleapis.com' }]) {
    g.resetPublisherCache(); f = fixture(variation);
    await rejectAsync(() => g.verifyGoogleToken(localToken, product, account, null, f.http, now), 'google_proof_unavailable',
      'publisher missing/HTTP error/malformed response/interruption is UNKNOWN, never terminal no-charge');
  }
  console.log(`Google publisher independent checks: ${checks} passed (local HTTP doubles only; no store lifecycle evidence).`);
} finally {
  for (const [key, value] of savedEnvironment) value === undefined ? delete process.env[key] : process.env[key] = value;
  globalThis.fetch = savedFetch;
  rmSync(work, { recursive: true, force: true });
}
