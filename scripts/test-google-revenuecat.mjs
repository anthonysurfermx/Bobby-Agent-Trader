// Independent actual RevenueCat sync/webhook regression. Local HTTP/RPC doubles only.
// Run from a dependency-equipped checkout: node /private/tmp/bobby-purchase-reservations-13e-patched/scripts/test-google-revenuecat.mjs
// These receipts do not prove SQL locking, real subscriptions, deployment or financial lifecycle.
import assert from 'node:assert/strict';
import { createHash, createHmac, generateKeyPairSync } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const work = mkdtempSync(path.join(tmpdir(), 'bobby-google-revenuecat-test-'));
const savedFetch = globalThis.fetch;
const savedError = console.error;
const envKeys = ['REVENUECAT_SECRET_KEY', 'REVENUECAT_V2_SECRET_KEY', 'REVENUECAT_WEBHOOK_AUTH',
  'BOBBY_SUPABASE_URL', 'BOBBY_SUPABASE_SERVICE_ROLE_KEY', 'BOBBY_PURCHASE_TOKEN_KEY',
  'BOBBY_GOOGLE_PUBLISHER_CLIENT_EMAIL', 'BOBBY_GOOGLE_PUBLISHER_PRIVATE_KEY', 'BOBBY_GOOGLE_PRODUCT_CATALOG',
  'STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','STRIPE_PRICE_ID','VERCEL_ENV'];
const savedEnvironment = new Map(envKeys.map(name => [name, process.env[name]]));
let checks = 0, scenarios = 0;
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const rejects = async (op, code, label) => { await assert.rejects(op, e => e?.code === code, label); checks++; };
const clone = value => value === null || value === undefined ? value : JSON.parse(JSON.stringify(value));
const compiledFiles = new Set();
const sourceHashes = new Map();
function compile(relative) {
  if (compiledFiles.has(relative)) return;
  compiledFiles.add(relative);
  const text = readFileSync(path.join(root, relative), 'utf8');
  sourceHashes.set(relative, createHash('sha256').update(text).digest('hex'));
  const compiled = ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true,
  });
  eq(compiled.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, `${relative} transpiles`);
  const target = path.join(work, relative.replace(/\.ts$/, '.js'));
  mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, compiled.outputText);
  for (const match of compiled.outputText.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+\.js)['"]/g)) {
    compile(path.normalize(path.join(path.dirname(relative), match[1])).replace(/\.js$/, '.ts'));
  }
}
let reservations;
try {
  writeFileSync(path.join(work, 'package.json'), '{"type":"module"}\n');
  symlinkSync(path.join(process.cwd(), 'node_modules'), path.join(work, 'node_modules'), 'dir');
  compile('api/_lib/revenuecat.ts'); compile('api/revenuecat-webhook.ts'); compile('api/stripe-webhook.ts');
  globalThis.fetch = async () => { throw new Error('Real network forbidden by isolated RevenueCat test'); };
  console.error = () => {}; // Expected webhook retry errors contain no credentials and stay out of evidence output.
  process.env.REVENUECAT_SECRET_KEY = 'local_revenuecat_fixture_not_a_credential';
  delete process.env.REVENUECAT_V2_SECRET_KEY;
  process.env.REVENUECAT_WEBHOOK_AUTH = 'local_webhook_fixture_authorization';
  process.env.BOBBY_SUPABASE_URL = 'https://database.review.invalid';
  process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'local_database_fixture_not_a_credential';
  process.env.BOBBY_PURCHASE_TOKEN_KEY = 'b'.repeat(64);
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.BOBBY_GOOGLE_PUBLISHER_CLIENT_EMAIL = 'review@fixture.iam.gserviceaccount.com';
  process.env.BOBBY_GOOGLE_PUBLISHER_PRIVATE_KEY = key.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const product = { productId: 'review_google_product', basePlanId: 'monthly', offerId: null };
  process.env.BOBBY_GOOGLE_PRODUCT_CATALOG = JSON.stringify([product]);
  const rc = await import(pathToFileURL(path.join(work, 'api/_lib/revenuecat.js')));
  const google = await import(pathToFileURL(path.join(work, 'api/_lib/google-publisher.js')));
  reservations = await import(pathToFileURL(path.join(work, 'api/_lib/purchase-reservations.js')));
  const webhook = (await import(pathToFileURL(path.join(work, 'api/revenuecat-webhook.js')))).default;
  const A = '00000000-0000-4000-8000-000000000001', B = '00000000-0000-4000-8000-000000000002';
  const identityA = '00000000-0000-4000-8000-000000000011', identityB = '00000000-0000-4000-8000-000000000012';
  const tokenA = 'local.owner.a.token', tokenB = 'local.owner.b.token';
  const orderA = 'GPA.0000-0000-0000-00001..0', orderB = 'GPA.0000-0000-0000-00002..0';
  const start = new Date(Date.now() - 86_400_000).toISOString();
  const end = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const expired = new Date(Date.now() - 60_000).toISOString();
  const authFor = identity => identity === identityA ? A : B;
  const providerSubscription = (owner = A, changes = {}) => ({
    kind: 'androidpublisher#subscriptionPurchaseV2',
    externalAccountIdentifiers: { obfuscatedExternalAccountId: google.googleAccountId(owner) },
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    startTime: start, lineItems: [{ productId: product.productId, expiryTime: end,
      offerDetails: { basePlanId: product.basePlanId }, latestSuccessfulOrderId: owner === A ? orderA : orderB }], ...changes,
  });
  const subscriber = (changes = {}) => ({
    entitlements: { pro: { product_identifier: product.productId, expires_date: end } },
    subscriptions: { [product.productId]: { store: 'play_store', is_sandbox: false, ownership_type: 'PURCHASED',
      purchase_date: start, expires_date: end, period_type: 'normal', store_transaction_id: orderA } }, ...changes,
  });
  const event = (owner = A, changes = {}) => ({ id: 'local-review-purchase-event', type: 'INITIAL_PURCHASE',
    app_user_id: owner, environment: 'PRODUCTION', store: 'PLAY_STORE', product_id: product.productId,
    period_type: 'NORMAL', is_family_share: false, transaction_id: orderA, purchased_at_ms: Date.parse(start),
    expiration_at_ms: Date.parse(end), price_in_purchased_currency: 9.99, currency: 'USD', entitlement_ids: ['pro'], ...changes,
  });
  const mirror = (identity = identityA, changes = {}) => ({ identity_id: identity, provider: 'google', status: 'active',
    product_id: product.productId, current_period_end: end, environment: 'production', period_type: 'normal',
    stripe_customer_id: null, stripe_subscription_id: null, apple_original_transaction_id: null,
    apple_status: null, apple_current_period_end: null, apple_product_id: null, apple_environment: null, apple_period_type: null, ...changes,
  });
  const attempt = (identity = identityA, token = tokenA, changes = {}) => ({
    id: '00000000-0000-4000-8000-000000000031', identity_id: identity,
    owner_key: createHash('sha256').update(`auth:${authFor(identity)}`).digest('hex'),
    operation_id: '00000000-0000-4000-8000-000000000041', provider: 'google', origin: 'adopted',
    product_id: product.productId, base_plan_id: product.basePlanId, offer_id: null,
    google_account_id: google.googleAccountId(authFor(identity)), phase: 'confirmed', revision: 3,
    dispatch_at: null, dispatch_payload: null, provider_reference: `google:${google.tokenFingerprint(token)}`,
    token_fingerprint: google.tokenFingerprint(token), token_ciphertext: reservations.sealPurchaseToken(token),
    candidate_ciphertext: null, provider_state: 'SUBSCRIPTION_STATE_ACTIVE', ...changes,
  });
  const paid = (identity = identityA, token = tokenA, changes = {}) => ({
    ...rc.paidPeriodFromRevenueCat(identity, authFor(identity), subscriber(), event(authFor(identity))),
    google_token_fingerprint: google.tokenFingerprint(token), ...changes,
  });
  const fixture = ({ subscribers = { [A]: subscriber(), [B]: subscriber() }, mirrors = {}, paidRows = {}, attempts = {},
      providers = { [tokenA]: providerSubscription(A), [tokenB]: providerSubscription(B) },
      orders = { [orderA]: tokenA, [orderB]: tokenB }, publisherStatus = 200, ordersStatus = 200,
      publisherTokenStatuses = null, providerThrows = false, beforeMirrorPatch = null } = {}) => {
    scenarios++;
    const state = { subscribers: clone(subscribers), mirrors: clone(mirrors), paidRows: clone(paidRows), attempts: clone(attempts),
      http: [], rpc: [], mirrorWrites: [], mirrorPatches: [], paidWrites: [], paidDeletes: [], events: [], publisherTokenStatuses: [] };
    google.resetPublisherCache();
    const rpc = async (name, body) => {
      state.rpc.push({ name, body: clone(body) });
      const identity = body.p_identity;
      if (name === 'bobby_purchase_attempt_get') return { attempt: clone(state.attempts[identity] ?? null) };
      if (name === 'bobby_purchase_adopt_google') {
        // Synthetic DB receipt only. Assert the ACTUAL helper's owner/token evidence before returning it.
        eq(body.p_google_account, google.googleAccountId(authFor(identity)), 'adoption carries exact current auth owner');
        eq(body.p_fingerprint, google.tokenFingerprint(reservations.openPurchaseToken(body.p_ciphertext)), 'adoption fingerprint binds its encrypted token');
        state.attempts[identity] = attempt(identity, reservations.openPurchaseToken(body.p_ciphertext), {
          phase: body.p_phase, provider_state: body.p_state, revision: 1,
        });
        return { attempt: clone(state.attempts[identity]) };
      }
      if (name === 'bobby_purchase_observe') {
        const previous = state.attempts[identity];
        eq(body.p_attempt, previous.id, 'observation remains on its captured durable attempt');
        eq(body.p_token_fingerprint, previous.token_fingerprint, 'observation cannot substitute another token');
        state.attempts[identity] = { ...previous, phase: body.p_phase, provider_state: body.p_state, revision: Number(previous.revision) + 1 };
        return { attempt: clone(state.attempts[identity]) };
      }
      if (name === 'bobby_purchase_acquire') {
        const existing = state.attempts[identity];
        if (existing && !['closed', 'terminal_no_charge'].includes(existing.phase)) return { code: 'purchase_pending', attempt: clone(existing) };
        throw new Error('Unexpected synthetic new charge acquisition');
      }
      throw new Error(`Unexpected isolated RPC ${name}`);
    };
    reservations.setPurchaseRpcForTests(rpc);
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input)), method = init.method ?? 'GET';
      state.http.push({ url: url.href, method });
      if (url.href === 'https://oauth2.googleapis.com/token') return Response.json({ token_type: 'Bearer', access_token: 'local-review-oauth', expires_in: 3600 });
      if (url.hostname === 'androidpublisher.googleapis.com') {
        eq(init.headers.Authorization, 'Bearer local-review-oauth', 'Publisher read requires actual helper OAuth result');
        eq(url.pathname.startsWith(`/androidpublisher/v3/applications/${google.GOOGLE_PACKAGE}/`), true, 'Publisher package is fixed');
        if (providerThrows) throw new Error('Synthetic publisher interruption');
        if (url.pathname.includes('/orders/')) {
          const id = decodeURIComponent(url.pathname.split('/orders/')[1]);
          return Response.json({ orderId: id, purchaseToken: orders[id] }, { status: ordersStatus });
        }
        const token = decodeURIComponent(url.pathname.split('/tokens/')[1] ?? '');
        if (!(token in providers)) throw new Error('Unexpected isolated Google token');
        const status = publisherTokenStatuses?.[Math.min(state.publisherTokenStatuses.length, publisherTokenStatuses.length - 1)] ?? publisherStatus;
        state.publisherTokenStatuses.push(status);
        return Response.json(clone(providers[token]), { status });
      }
      if (url.hostname === 'api.revenuecat.com' && url.pathname.startsWith('/v1/subscribers/')) {
        eq(init.headers.Authorization, `Bearer ${process.env.REVENUECAT_SECRET_KEY}`, 'subscriber is independently reread with server credential');
        const owner = decodeURIComponent(url.pathname.split('/subscribers/')[1]);
        if (!(owner in state.subscribers)) throw new Error('Unexpected isolated RevenueCat owner');
        return Response.json({ subscriber: clone(state.subscribers[owner]) });
      }
      if (url.hostname !== 'database.review.invalid') throw new Error(`Real or unexpected network forbidden: ${url.hostname}`);
      eq(init.headers.apikey, process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY, 'DB operation remains service scoped');
      const table = url.pathname.split('/rest/v1/')[1], body = init.body ? JSON.parse(init.body) : null;
      const identity = (url.searchParams.get('identity_id') ?? '').replace(/^eq\./, '');
      if (table === 'bobby_identities') {
        const auth = (url.searchParams.get('auth_user_id') ?? '').replace(/^eq\./, '');
        return Response.json([{ id: auth === A ? identityA : identityB }]);
      }
      if (table === 'bobby_subscriptions') {
        if (method === 'GET') return Response.json(state.mirrors[identity] ? [clone(state.mirrors[identity])] : []);
        if (method === 'PATCH') {
          beforeMirrorPatch?.(state);
          const expectedSubscription = (url.searchParams.get('stripe_subscription_id') ?? '').replace(/^eq\./, '');
          state.mirrorPatches.push({ identity, expectedSubscription, body: clone(body) });
          const row = state.mirrors[identity];
          if (!row || row.stripe_subscription_id !== expectedSubscription) return Response.json([]);
          state.mirrors[identity] = { ...row, ...body };
          return Response.json([{ identity_id: identity }]);
        }
        if (method === 'POST') {
          state.mirrorWrites.push(clone(body));
          state.mirrors[body.identity_id] = { ...(state.mirrors[body.identity_id] ?? mirror(body.identity_id)), ...body };
          return new Response(null, { status: 204 });
        }
      }
      if (table === 'bobby_brief_paid_periods') {
        const source = (url.searchParams.get('proof_source') ?? '').replace(/^eq\./, '');
        const matchesSource = Boolean(state.paidRows[identity] && (!source || state.paidRows[identity].proof_source === source));
        if (method === 'GET') return Response.json(matchesSource ? [clone(state.paidRows[identity])] : []);
        if (method === 'POST') { state.paidWrites.push(clone(body)); state.paidRows[body.identity_id] = clone(body); return new Response(null, { status: 204 }); }
        if (method === 'DELETE') { state.paidDeletes.push({ identity, source }); if (matchesSource) delete state.paidRows[identity]; return new Response(null, { status: 204 }); }
      }
      if (table === 'bobby_purchase_events' && method === 'POST') { state.events.push(clone(body)); return new Response(null, { status: 204 }); }
      throw new Error(`Unexpected isolated DB operation ${method} ${table}`);
    };
    return state;
  };
  const deliver = async (body, authorization = process.env.REVENUECAT_WEBHOOK_AUTH) => {
    const response = { code: null, payload: null, status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; return this; } };
    await webhook({ method: 'POST', headers: { authorization }, body: { event: body } }, response);
    return response;
  };

  let f = fixture();
  eq(await rc.syncRevenueCat(A, identityA, event()), true, 'matching production owner can receive actual verified membership');
  eq(f.mirrors[identityA].status, 'active', 'owner A membership is mirrored');
  eq(f.paidRows[identityA].google_token_fingerprint, google.tokenFingerprint(tokenA), 'paid receipt is bound to its exact owned token');
  eq(f.attempts[identityA].origin, 'adopted', 'legacy owner token adopts without pretending a new dispatch');
  await rejects(() => rc.syncRevenueCat(B, identityB, event()), 'google_owner_unverified', 'alias B cannot grant A Google token');
  eq(f.mirrors[identityB] ?? null, null, 'foreign alias receives no Pro mirror');
  eq(f.paidRows[identityB] ?? null, null, 'foreign alias receives no paid receipt');
  eq(f.attempts[identityB] ?? null, null, 'foreign alias cannot acquire ownership ledger');

  for (const key of ['original_app_user_id', 'aliases', 'transferred_to', 'transferred_from']) {
    f = fixture();
    const result = await deliver(event(A, { type: 'TRANSFER', [key]: key === 'original_app_user_id' ? B : [B] }));
    eq(result.code, 500, `actual ${key} webhook retries the rejected foreign ownership sync`);
    eq(f.mirrors[identityA]?.status, 'active', `${key} preserves legitimate owner A grant`);
    eq(f.mirrors[identityB] ?? null, null, `${key} cannot grant owner B`);
    eq(f.paidRows[identityB] ?? null, null, `${key} cannot grant B paid proof`);
  }
  f = fixture();
  let result = await deliver(event(), 'wrong-local-authorization');
  eq(result.code, 401, 'unauthenticated webhook cannot start sync');
  eq(f.http.length, 0, 'unauthenticated webhook performs no provider/DB reads');
  f = fixture({ mirrors: { [identityB]: mirror(identityB) }, paidRows: { [identityB]: paid(identityB) } });
  await rejects(() => rc.syncRevenueCat(B, identityB), 'google_owner_unverified', 'authoritative foreign owner rejects previously mirrored alias');
  eq(f.mirrors[identityB].status, 'expired', 'authoritative foreign owner revokes legacy unauthorized Google mirror');
  eq(f.paidRows[identityB] ?? null, null, 'authoritative foreign owner removes mismatched paid receipt');

  const aliasedPaid = subscriber(); aliasedPaid.subscriptions[product.productId].store_transaction_id = orderB;
  const ownedTrial = providerSubscription(A); ownedTrial.lineItems[0].offerPhase = { freeTrial: {} };
  const actualAccess = await import(pathToFileURL(path.join(work, 'api/_lib/access.js')));
  for (const existingPaid of [false, true]) {
    f = fixture({ providers: { [tokenA]: ownedTrial }, attempts: { [identityA]: attempt() },
      mirrors: existingPaid ? { [identityA]: mirror() } : {}, paidRows: existingPaid ? { [identityA]: paid() } : {} });
    eq(await rc.syncRevenueCat(A, identityA, event()), true, 'current Google free trial keeps legitimate basic access despite contradictory RC NORMAL event');
    eq(f.mirrors[identityA].status, 'trialing', 'current Google trial overrides RC normal mirror status');
    eq(f.mirrors[identityA].period_type, 'trial', 'current Google trial overrides RC normal period');
    eq(actualAccess.activeSubscription(f.mirrors[identityA]), true, 'trial mirror remains actual basic access');
    eq(f.attempts[identityA].phase, 'confirmed', 'acknowledged trial retains its confirmed chargeable obligation');
    eq(f.attempts[identityA].token_fingerprint, google.tokenFingerprint(tokenA), 'trial remains on the same owned token');
    eq(f.paidWrites.length, 0, 'current free trial cannot insert a positive paid proof for the same token and order');
    eq(f.paidRows[identityA] ?? null, null, 'current free trial excludes any prior same-token and current-period paid proof');
    eq(f.paidDeletes.length, existingPaid ? 1 : 0, 'only an existing contradicted paid proof is retired');
  }
  f = fixture({ providers: { [tokenA]: ownedTrial }, publisherTokenStatuses: [200, 503],
    attempts: { [identityA]: attempt() }, mirrors: { [identityA]: mirror() }, paidRows: { [identityA]: paid() } });
  await rejects(() => rc.syncRevenueCat(A, identityA, event()), 'google_proof_unavailable', 'second Publisher outage is an unavailable observation, not a fresh paid proof');
  eq(f.publisherTokenStatuses, [200, 503], 'current owned trial was verified before the actual second GET outage');
  eq(f.paidWrites.length, 0, 'later outage cannot create paid proof after an authoritative current trial');
  eq(f.paidRows[identityA] ?? null, null, 'later outage cannot preserve the contradicted same-token paid proof');
  eq(f.paidDeletes.length, 1, 'known current trial retires the prior exact paid proof despite the later outage');
  eq(f.attempts[identityA].phase, 'confirmed', 'first verified acknowledged trial keeps its confirmed obligation');
  eq(f.attempts[identityA].token_fingerprint, google.tokenFingerprint(tokenA), 'later outage cannot release or replace the known trial token');
  eq(f.mirrors[identityA].status, 'trialing', 'known current trial replaces the existing normal mirror despite a later unavailable observation');
  eq(f.mirrors[identityA].period_type, 'trial', 'known current trial retains trial period semantics despite a later outage');
  eq(actualAccess.activeSubscription(f.mirrors[identityA]), true, 'known current trial remains basic access after a later outage');

  f = fixture({ subscribers: { [A]: aliasedPaid }, providers: { [tokenA]: ownedTrial, [tokenB]: providerSubscription(B) },
    attempts: { [identityA]: attempt() }, paidRows: { [identityA]: paid(identityA, tokenA, { proof_id: orderB }) } });
  eq(await rc.syncRevenueCat(A, identityA, event(A, { transaction_id: orderB })), true, 'owned trial obligation may keep membership independently of an aliased paid order');
  eq(f.paidRows[identityA] ?? null, null, 'owned token cannot authenticate another owners paid order with same SKU and expiry');
  eq(f.paidWrites.length, 0, 'aliased paid order writes no new paid receipt');

  for (const options of [{ publisherStatus: 503 }, { providerThrows: true }]) {
    f = fixture({ ...options, attempts: { [identityA]: attempt() }, mirrors: { [identityA]: mirror() }, paidRows: { [identityA]: paid() } });
    await rejects(() => rc.syncRevenueCat(A, identityA, event()), 'google_proof_unavailable', 'transient Publisher outage remains unknown');
    eq(f.mirrors[identityA].status, 'active', 'transient Publisher outage preserves prior verified membership');
    eq(f.paidDeletes.length, 0, 'transient outage preserves exact owner-bound paid tuple');
    eq(f.paidWrites.length, 0, 'unknown observation cannot write fresh paid proof even with paid event');
  }
  for (const changes of [{ google_token_fingerprint: undefined }, { google_token_fingerprint: google.tokenFingerprint(tokenB) },
    { proof_id: orderB }, { period_end: new Date(Date.parse(end) + 60000).toISOString() }]) {
    f = fixture({ publisherStatus: 503, attempts: { [identityA]: attempt() }, mirrors: { [identityA]: mirror() }, paidRows: { [identityA]: paid(identityA, tokenA, changes) } });
    await rejects(() => rc.syncRevenueCat(A, identityA), 'google_proof_unavailable', 'unknown observation does not adopt unbound/mismatched old paid proof');
    eq(f.paidRows[identityA] ?? null, null, 'unknown observation removes unbound or mismatched financial proof');
  }
  f = fixture({ publisherStatus: 503 });
  await rejects(() => rc.syncRevenueCat(A, identityA, event()), 'google_proof_unavailable', 'new owner cannot grant from Publisher outage');
  eq(f.mirrorWrites.length, 0, 'unknown observation creates no new membership');
  eq(f.paidWrites.length, 0, 'unknown observation creates no new paid proof');

  for (const existing of [false, true]) {
    f = fixture({ ordersStatus: 503, attempts: { [identityA]: attempt() }, paidRows: existing ? { [identityA]: paid() } : {} });
    eq(await rc.syncRevenueCat(A, identityA, event()), true, 'verified current owned token can keep membership despite financial-order outage');
    eq(f.paidWrites.length, 0, 'unknown financial-order ownership never creates paid receipt');
    eq(Boolean(f.paidRows[identityA]), existing, 'only previously exact fingerprint-bound paid tuple survives order outage');
  }
  for (const state of ['SUBSCRIPTION_STATE_PAUSED', 'SUBSCRIPTION_STATE_ON_HOLD']) {
    const paused = subscriber({ entitlements: {} }); paused.subscriptions[product.productId].expires_date = expired;
    const p = providerSubscription(A, { subscriptionState: state }); p.lineItems[0].expiryTime = expired;
    f = fixture({ subscribers: { [A]: paused }, providers: { [tokenA]: p }, mirrors: { [identityA]: mirror() } });
    eq(await rc.syncRevenueCat(A, identityA), false, 'paused/on-hold cannot retain expired access entitlement');
    eq(f.attempts[identityA].phase, 'pending', 'actual Google obligation is adopted before absent entitlement return');
    eq(f.attempts[identityA].provider_state, state, 'adopted obligation retains actual recoverable provider state');
    eq(f.mirrors[identityA].status, 'expired', 'financial hold and access membership are independently represented');
    const acquisition = await reservations.acquire(identityA, '00000000-0000-4000-8000-000000000051', 'stripe', 'price_local_fixture', null);
    eq(acquisition.code, 'purchase_pending', 'synthetic durable pending receipt blocks participating second-provider acquisition');
    eq(f.rpc.findIndex(x => x.name === 'bobby_purchase_adopt_google') < f.rpc.findIndex(x => x.name === 'bobby_purchase_acquire'), true,
      'actual sync adopts observed hold before any later acquisition');
  }
  const sandbox = subscriber(); sandbox.subscriptions[product.productId].is_sandbox = true;
  f = fixture({ subscribers: { [A]: sandbox } });
  eq(await rc.syncRevenueCat(A, identityA, event()), false, 'Google sandbox never grants production subscription');
  eq(f.attempts[identityA] ?? null, null, 'Google sandbox never creates production owner ledger');
  eq(f.paidRows[identityA] ?? null, null, 'Google sandbox never creates production financial proof');
  const trial = subscriber(); trial.subscriptions[product.productId].period_type = 'trial';
  f = fixture({ subscribers: { [A]: trial } });
  eq(await rc.syncRevenueCat(A, identityA, event(A, { period_type: 'TRIAL', price_in_purchased_currency: 0 })), true, 'trial may grant basic membership');
  eq(f.mirrors[identityA].status, 'trialing', 'actual trial stays a trial in the membership mirror');
  eq(f.paidRows[identityA] ?? null, null, 'trial creates no manufactured paid receipt');

  const appleProduct = 'review_apple_product';
  const mixedApple = subscriber({
    entitlements: { pro: { product_identifier: appleProduct, expires_date: end } },
    subscriptions: {
      [appleProduct]: { store: 'app_store', is_sandbox: false, ownership_type: 'PURCHASED', purchase_date: start,
        expires_date: end, period_type: 'normal', store_transaction_id: 'local.apple.transaction' },
      [product.productId]: { store: 'play_store', is_sandbox: false, ownership_type: 'PURCHASED', purchase_date: start,
        expires_date: end, period_type: 'normal', store_transaction_id: orderB },
    },
  });
  f = fixture({ subscribers: { [A]: mixedApple } });
  eq(await rc.syncRevenueCat(A, identityA), true, 'a foreign Google alias cannot deny a separately eligible Apple membership');
  eq(f.mirrors[identityA].provider, 'apple', 'eligible Apple subscription remains owned by its existing provider path');
  eq(f.attempts[identityA] ?? null, null, 'foreign Google alias is never adopted while syncing the legitimate Apple record');
  process.env.BOBBY_GOOGLE_PRODUCT_CATALOG = '[]';
  f = fixture({ subscribers: { [A]: mixedApple } });
  eq(await rc.syncRevenueCat(A, identityA), true, 'disabled Google catalog cannot deny separately eligible deployed Apple membership');
  eq(f.mirrors[identityA].provider, 'apple', 'Apple eligibility remains available before optional Google configuration');
  process.env.BOBBY_GOOGLE_PRODUCT_CATALOG = JSON.stringify([product]);


  // 13e regression: actual PATCH-only Apple sidecar and provider-scoped proof cleanup.
  // This HTTP double enforces the exact Stripe-id filter, not SQL trigger behavior.
  const accessModule = await import(pathToFileURL(path.join(work, 'api/_lib/access.js')));
  const stripeCard = changes => mirror(identityA, { provider: 'stripe', product_id: 'price_local_review',
    stripe_customer_id: 'cus_localReview', stripe_subscription_id: 'sub_localReview', ...changes });
  const stripePaid = () => clone({ ...paid(), provider: 'stripe', product_id: 'price_local_review', proof_source: 'stripe',
    proof_id: 'in_localReview', google_token_fingerprint: undefined });
  const financialCardProof = stripePaid();
  const appleEvent = event(A, { product_id: appleProduct, store: 'APP_STORE', transaction_id: 'local.apple.transaction' });
  const primaryFields = value => Object.fromEntries(['identity_id','provider','status','product_id','current_period_end',
    'stripe_customer_id','stripe_subscription_id','environment','period_type'].map(name => [name,value[name]]));

  for (const status of ['active','past_due']) {
    const card = stripeCard({ status, ...(status === 'past_due' ? {current_period_end:expired} : {}) });
    f = fixture({ subscribers: { [A]: mixedApple }, mirrors: { [identityA]: card }, paidRows: { [identityA]: financialCardProof } });
    eq(await rc.syncRevenueCat(A, identityA, appleEvent), true, `${status} card coexists with independently live Apple sidecar`);
    eq(primaryFields(f.mirrors[identityA]), primaryFields(card), 'Apple sync preserves actual card references and primary state');
    eq(f.mirrors[identityA].apple_status, 'active', 'eligible Apple updates the actual sidecar');
    eq(f.mirrors[identityA].apple_product_id, appleProduct, 'sidecar retains exact Apple product');
    eq(f.mirrorWrites.length, 0, 'sidecar sync never replays a primary upsert');
    eq(f.mirrorPatches[0].expectedSubscription, card.stripe_subscription_id, 'PATCH fences the captured card subscription');
    eq(f.attempts[identityA] ?? null, null, 'foreign Google alias never adopts while actual Apple/card remains');
    if(status==='active') eq(f.paidRows[identityA], financialCardProof, 'live card keeps its Stripe invoice proof independently');
    else {eq(f.paidRows[identityA].provider,'apple','non-live card permits actual matching Apple financial proof as canonical13e');
      eq(f.paidRows[identityA].identity_id,identityA,'replacement proof belongs to current account');
      eq(f.paidRows[identityA].proof_id,'local.apple.transaction','replacement proof retains actual Apple transaction');}
  }
  for (const status of ['active','past_due','paused']) {
    const card = stripeCard({status,...(status !== 'active' ? {current_period_end:expired} : {})});
    const foreignGoogle = subscriber(); foreignGoogle.subscriptions[product.productId].store_transaction_id=orderB;
    f=fixture({subscribers:{[A]:foreignGoogle},mirrors:{[identityA]:card},paidRows:{[identityA]:financialCardProof}});
    eq(await rc.syncRevenueCat(A,identityA,event(A,{transaction_id:orderB})),status==='active', 'nonterminal card remains independent of unrelated Google access');
    eq(primaryFields(f.mirrors[identityA]),primaryFields(card),'foreign Google record never replaces recoverable card state');
    eq(f.mirrors[identityA].apple_status,'expired','Google record is never written into Apple sidecar');
    eq(f.attempts[identityA]??null,null,'foreign Google record creates no durable owner adoption');
    eq(f.paidRows[identityA],financialCardProof,'foreign Google alias never deletes or replaces Stripe invoice proof');
    eq(accessModule.activeSubscription(f.mirrors[identityA]),true,'recoverable card blocks duplicate purchase even without current access');
    eq(accessModule.publicSubscription(f.mirrors[identityA]).cardPlan,true,'portal/deletion obligation stays visible');
  }
  f=fixture({subscribers:{[A]:mixedApple},mirrors:{[identityA]:stripeCard({status:'canceled',current_period_end:expired})}});
  eq(await rc.syncRevenueCat(A,identityA,appleEvent),true,'Apple renewal beside a terminal historical card stays available');
  eq(f.mirrors[identityA].stripe_subscription_id,'sub_localReview','terminal card reference survives Apple renewal');
  eq(f.mirrors[identityA].status,'canceled','Apple renewal does not rewrite historical card status');
  eq(f.paidRows[identityA].provider,'apple','inactive card allows actual matching Apple financial proof');
  eq(f.paidRows[identityA].proof_id,'local.apple.transaction','Apple receipt keeps its own transaction identity');

  const refundedApple=clone(mixedApple);refundedApple.subscriptions[appleProduct].refunded_at=new Date().toISOString();
  const activeCard=stripeCard({apple_status:'active',apple_current_period_end:end,apple_product_id:appleProduct});
  f=fixture({subscribers:{[A]:refundedApple},mirrors:{[identityA]:activeCard},paidRows:{[identityA]:financialCardProof}});
  eq(await rc.syncRevenueCat(A,identityA,appleEvent),true,'Apple refund never revokes the independent live card');
  eq(primaryFields(f.mirrors[identityA]),primaryFields(activeCard),'refund keeps current card billing owner untouched');
  eq(f.mirrors[identityA].apple_status,'refunded','actual refunded Apple sidecar stops granting Apple access');
  eq(f.paidRows[identityA],financialCardProof,'Apple refund does not delete provider-scoped Stripe proof');
  eq(f.paidWrites.length,0,'refunded Apple writes no new paid receipt');

  f=fixture({subscribers:{[A]:mixedApple},mirrors:{[identityA]:activeCard},beforeMirrorPatch:state=>{
    state.mirrors[identityA]={...state.mirrors[identityA],stripe_subscription_id:'sub_replacedReview',status:'past_due'};
  }});
  await assert.rejects(()=>rc.syncRevenueCat(A,identityA,appleEvent),/apple mirror owner changed/);checks++;
  eq(f.mirrors[identityA].stripe_subscription_id,'sub_replacedReview','captured PATCH cannot overwrite a newer card owner');
  eq(f.mirrors[identityA].status,'past_due','concurrent actual card state remains intact');
  eq(f.paidWrites.length,0,'failed sidecar ownership fence does not create paid proof');

  f=fixture({subscribers:{[A]:mixedApple},mirrors:{[identityA]:activeCard},beforeMirrorPatch:state=>{
    state.mirrors[identityA]={...state.mirrors[identityA],status:'canceled',current_period_end:expired};
  }});
  eq(await rc.syncRevenueCat(A,identityA),true,'Apple sidecar remains valid beside concurrently canceled card');
  eq(f.mirrors[identityA].status,'canceled','Apple PATCH never restores stale prefetch Stripe status');
  eq(f.mirrors[identityA].current_period_end,expired,'Apple PATCH never restores stale prefetch card period');
  eq(f.mirrors[identityA].apple_status,'active','same captured Stripe identity still receives actual Apple sidecar');


  // Actual signed Stripe handler: keep current13e owner checks and invoice/refund semantics.
  // Local HMAC fixture authorization and strict provider doubles; never a real webhook/account write.
  const stripeWebhook=await import(pathToFileURL(path.join(work,'api/stripe-webhook.js')));
  process.env.STRIPE_SECRET_KEY='local_stripe_fixture_not_a_credential';
  process.env.STRIPE_WEBHOOK_SECRET='local_stripe_webhook_fixture_authorization';
  process.env.STRIPE_PRICE_ID='price_localReview';process.env.VERCEL_ENV='production';
  const startSeconds=Math.floor(Date.parse(start)/1000),endSeconds=Math.floor(Date.parse(end)/1000);
  const actualSub={id:'sub_localReview',customer:'cus_localReview',metadata:{identity_id:identityA},status:'active',livemode:true,
    current_period_start:startSeconds,current_period_end:endSeconds,latest_invoice:'in_localReview',
    items:{data:[{price:{id:'price_localReview'}}],has_more:false}};
  const actualInvoice={id:'in_localReview',subscription:actualSub.id,customer:actualSub.customer,status:'paid',livemode:true,
    amount_paid:490,currency:'usd',created:startSeconds,billing_reason:'subscription_create',
    lines:{data:[{type:'subscription',subscription:actualSub.id,price:{id:'price_localReview'},amount:490,
      period:{start:startSeconds,end:endSeconds}}]}};
  const actualCharge={id:'ch_localReview',payment_intent:'pi_localReview',customer:actualSub.customer,invoice:null,
    amount:490,amount_refunded:490,currency:'usd',livemode:true,paid:true,captured:true,disputed:false,
    billing_details:{address:{country:'MX'}}};
  const actualIntent={id:'pi_localReview',customer:actualSub.customer,status:'succeeded',livemode:true,latest_charge:actualCharge.id};
  const actualPayment={id:'ip_localReview',invoice:actualInvoice.id,status:'paid',livemode:true,currency:'usd',amount_paid:490,
    payment:{type:'payment_intent',payment_intent:actualIntent.id}};
  const actualProof=stripeWebhook.stripePaidPeriodFromInvoice(identityA,actualSub,actualInvoice);
  eq(actualProof?.proof_id,actualInvoice.id,'positive provider tuple creates real Stripe invoice proof before refund');
  const stripeFixture=({sub=actualSub,invoice=actualInvoice,charge=actualCharge,proof=actualProof,
    initialPurchase={id:'stripe-invoice-in_localReview',identity_id:null,price_local:4.90,type:'INITIAL_PURCHASE'}}={})=>{
    scenarios++;
    const state={sub:clone(sub),invoice:clone(invoice),charge:clone(charge),proof:clone(proof),
      mirror:stripeCard({product_id:process.env.STRIPE_PRICE_ID,apple_status:'active',apple_current_period_end:end,apple_product_id:appleProduct}),
      purchase:clone(initialPurchase),errors:[],http:[],mirrorWrites:[],paidWrites:[],paidDeletes:[],eventWrites:[],eventRepairs:[]};
    console.error=(...args)=>state.errors.push(args);
    reservations.setPurchaseRpcForTests(async(name)=>{throw new Error(`Unexpected durable RPC in canonical no-attempt Stripe event: ${name}`);});
    globalThis.fetch=async(input,init={})=>{
      const url=new URL(String(input)),method=init.method??'GET';state.http.push({url:url.href,method});
      if(url.hostname==='api.stripe.com'){
        eq(init.headers.Authorization,'Bearer local_stripe_fixture_not_a_credential','actual Stripe provider reads remain server-authenticated');
        const route=url.pathname.replace('/v1/','');
        if(route===`subscriptions/${actualSub.id}`)return Response.json(state.sub);
        if(route===`invoices/${actualInvoice.id}`)return Response.json(state.invoice);
        if(route===`charges/${actualCharge.id}`)return Response.json(state.charge);
        if(route===`payment_intents/${actualIntent.id}`)return Response.json(actualIntent);
        if(route==='invoice_payments'){
          if(url.searchParams.has('payment[payment_intent]')){
            eq(url.searchParams.get('payment[type]'),'payment_intent','modern refund invoice lookup supplies required discriminator');
            eq(url.searchParams.get('payment[payment_intent]'),actualIntent.id,'invoice lookup binds actual charge payment intent');
          }else eq(url.searchParams.get('invoice'),actualInvoice.id,'net paid evidence rereads exact invoice payments');
          return Response.json({object:'list',has_more:false,data:[actualPayment]});
        }
        if(route==='refunds'){
          eq(url.searchParams.get('charge'),actualCharge.id,'refund ledger retrieves exact owned charge');
          return Response.json({object:'list',has_more:false,data:[{id:'re_localReview',status:'succeeded',amount:490,
            currency:'usd',charge:actualCharge.id,created:startSeconds}]});
        }
        throw new Error(`Unexpected isolated Stripe route ${route}`);
      }
      if(url.hostname!=='database.review.invalid')throw new Error(`Real network forbidden by Stripe regression: ${url.hostname}`);
      eq(init.headers.apikey,process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY,'Stripe DB observations remain service scoped');
      const table=url.pathname.split('/rest/v1/')[1],body=init.body?JSON.parse(init.body):null;
      if(table==='bobby_subscriptions'){
        if(method==='GET'){
          const sid=url.searchParams.get('stripe_subscription_id'),customer=url.searchParams.get('stripe_customer_id'),identity=url.searchParams.get('identity_id');
          const match=(!sid||sid===`eq.${state.mirror.stripe_subscription_id}`)&&(!customer||customer===`eq.${state.mirror.stripe_customer_id}`)&&(!identity||identity===`eq.${identityA}`);
          return Response.json(match?[clone(state.mirror)]:[]);
        }
        if(method==='POST'){state.mirrorWrites.push(clone(body));state.mirror={...state.mirror,...body};return new Response(null,{status:204});}
      }
      if(table==='bobby_brief_paid_periods'){
        eq(url.searchParams.get('identity_id')??'eq.'+body?.identity_id,`eq.${identityA}`,'Stripe proof operations bind actual subscription owner');
        if(method==='GET')return Response.json(state.proof?[clone(state.proof)]:[]);
        if(method==='DELETE'){eq(url.searchParams.get('proof_source'),'eq.stripe','refund deletes only Stripe provider proof');state.paidDeletes.push(clone(state.proof));state.proof=null;return new Response(null,{status:204});}
        if(method==='POST'){state.paidWrites.push(clone(body));state.proof=clone(body);return new Response(null,{status:204});}
      }
      if(table==='bobby_purchase_events'){
        if(method==='POST'){
          eq(init.headers.Prefer,'resolution=ignore-duplicates,return=minimal','financial event retries keep original amounts idempotently');
          state.eventWrites.push(clone(body));if(!state.purchase||body.id!==state.purchase.id)state.purchase=clone(body);return new Response(null,{status:204});
        }
        if(method==='PATCH'){
          eq(url.searchParams.get('identity_id'),'is.null','identity repair never reassigns an existing financial owner');
          eq(Object.keys(body),['identity_id'],'identity repair cannot rewrite financial amount');
          state.eventRepairs.push(clone(body));if(state.purchase?.identity_id===null)state.purchase={...state.purchase,...body};return new Response(null,{status:204});
        }
      }
      throw new Error(`Unexpected isolated Stripe DB operation ${method} ${table}`);
    };return state;
  };
  const signedStripe=async(type,object)=>{
    const raw=JSON.stringify({id:'evt_localReview',type,data:{object}}),timestamp=Math.floor(Date.now()/1000);
    const signature=createHmac('sha256',process.env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${raw}`).digest('hex');
    return stripeWebhook.POST(new Request('https://handler.review.invalid/api/stripe-webhook',{method:'POST',body:raw,
      headers:{'stripe-signature':`t=${timestamp},v1=${signature}`}}));
  };
  let sf=stripeFixture({sub:{...actualSub,metadata:{identity_id:identityB}}});
  eq((await signedStripe('invoice.paid',actualInvoice)).status,500,'actual mapped/card owner mismatch requests provider retry');
  eq(sf.errors[0]?.[2],'Stripe subscription owner mismatch','500 is the actual owner guard, not a harness transport failure');
  eq(sf.mirrorWrites.length,0,'foreign invoice metadata cannot rewrite actual subscription owner');
  eq(sf.paidWrites.length,0,'foreign invoice metadata cannot create paid proof');
  eq(sf.eventWrites.length,0,'foreign invoice metadata cannot attribute financial event');

  sf=stripeFixture();
  eq((await signedStripe('charge.refunded',actualCharge)).status,200,'modern charge without invoice resolves exact paid invoice for full refund');
  eq(sf.proof,null,'current full refund removes actual invoice financial proof');
  eq(sf.paidDeletes.length,1,'refund deletes only one actual Stripe proof');
  eq(sf.eventWrites[0].identity_id,identityA,'refund financial row keeps actual card owner');
  eq(sf.eventWrites[0].id,'stripe-refund-re_localReview','refund ledger stays keyed to actual refund rather than webhook id');
  eq(sf.eventWrites[0].price_local,-4.90,'actual succeeded refund remains a negative financial row');

  sf=stripeFixture();
  eq((await signedStripe('invoice.paid',actualInvoice)).status,200,'replayed invoice uses current payment state');
  eq(sf.proof,null,'replayed fully refunded invoice never resurrects paid proof');
  eq(sf.paidWrites.length,0,'current zero net paid cannot create fresh invoice proof');
  eq(sf.purchase.identity_id,identityA,'out-of-order prior null identity repairs to actual subscription owner');
  eq(sf.purchase.price_local,4.90,'identity repair preserves original financial amount');
  eq(sf.eventWrites[0].id,'stripe-invoice-in_localReview','invoice id deduplicates distinct event objects');
  eq(sf.mirror.apple_status,'active','HTTP upsert carries no accidental sidecar clearing; real trigger locking is tested separately');

  sf=stripeFixture({initialPurchase:{id:'stripe-invoice-in_localReview',identity_id:identityB,price_local:4.90,type:'INITIAL_PURCHASE'}});
  eq((await signedStripe('invoice.paid',actualInvoice)).status,200,'replayed invoice processes without reassigning a preexisting financial identity');
  eq(sf.purchase.identity_id,identityB,'repair filter cannot replace existing non-null ledger attribution');
  eq(sf.purchase.price_local,4.90,'existing ledger amount is preserved on duplicate invoice');

  for (const [file, before] of sourceHashes) eq(createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex'), before,
    `review source ${file} stayed stable during this run`);
  console.log(`Google RevenueCat independent checks: ${scenarios} scenarios / ${checks} passed (actual sync and authenticated webhook; local HTTP/RPC doubles only).`);
} finally {
  reservations?.setPurchaseRpcForTests(null);
  globalThis.fetch = savedFetch; console.error = savedError;
  for (const [name, value] of savedEnvironment) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  rmSync(work, { recursive: true, force: true });
}
