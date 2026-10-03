// Actual helper regression with synthetic RPC receipts and HTTP responses only.
// Run from a dependency-equipped checkout: node scripts/test-purchase-reservations.mjs
// SQL concurrency, store lifecycle, real payment and deployment evidence are separate gates.
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const work = mkdtempSync(path.join(tmpdir(), 'bobby-purchase-helper-test-'));
const source = path.join(root, 'api/_lib/purchase-reservations.ts');
const sourceSha = createHash('sha256').update(readFileSync(source)).digest('hex');
let checks = 0, scenarios = 0;
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const reject = async (operation, code, label) => {
  await assert.rejects(operation, error => error?.code === code, label); checks++;
};
const clone = value => JSON.parse(JSON.stringify(value));
const savedEnvironment = new Map(['STRIPE_SECRET_KEY', 'BOBBY_PURCHASE_RESERVATIONS_ENABLED',
  'BOBBY_PURCHASE_TOKEN_KEY', 'BOBBY_GOOGLE_PUBLISHER_CLIENT_EMAIL',
  'BOBBY_GOOGLE_PUBLISHER_PRIVATE_KEY', 'BOBBY_SUPABASE_URL', 'BOBBY_SUPABASE_SERVICE_ROLE_KEY'].map(key => [key, process.env[key]]));
const savedFetch = globalThis.fetch;
let subject;

try {
  writeFileSync(path.join(work, 'package.json'), '{"type":"module"}\n');
  for (const name of ['purchase-reservations', 'bobby-db', 'google-publisher']) {
    const compiled = ts.transpileModule(readFileSync(path.join(root, `api/_lib/${name}.ts`), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      reportDiagnostics: true,
    });
    eq(compiled.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0,
      `actual ${name} source transpiles for isolated execution`);
    writeFileSync(path.join(work, `${name}.js`), compiled.outputText);
  }
  globalThis.fetch = async () => { throw new Error('Real network forbidden by reservation test'); };
  process.env.STRIPE_SECRET_KEY = 'sk_test_synthetic_not_a_credential';
  process.env.BOBBY_PURCHASE_TOKEN_KEY = 'a'.repeat(64);
  subject = await import(pathToFileURL(path.join(work, 'purchase-reservations.js')));

  const owner = '00000000-0000-4000-8000-000000000001';
  const attemptId = '00000000-0000-4000-8000-000000000003';
  const operationId = '00000000-0000-4000-8000-000000000004';
  const ownerKey = '1'.repeat(64);
  const form = {
    mode: 'subscription', 'line_items[0][price]': 'price_synthetic', 'line_items[0][quantity]': '1',
    client_reference_id: owner, 'metadata[identity_id]': owner,
    'subscription_data[metadata][identity_id]': owner,
    success_url: 'https://example.test/success', cancel_url: 'https://example.test/cancel',
  };
  const payload = { ...form, 'metadata[purchase_attempt_id]': attemptId,
    'subscription_data[metadata][purchase_attempt_id]': attemptId,
    'after_expiration[recovery][enabled]': 'false' };
  const attempt = (changes = {}) => ({
    id: attemptId, identity_id: owner, owner_key: ownerKey, operation_id: operationId,
    provider: 'stripe', origin: 'reserved', product_id: 'price_synthetic', base_plan_id: null,
    offer_id: null, google_account_id: null, phase: 'external_started', revision: 2,
    dispatch_at: '2026-10-03T12:00:00Z', dispatch_payload: clone(payload),
    provider_reference: null, token_fingerprint: null, token_ciphertext: null,
    candidate_ciphertext: null, provider_state: null, ...changes,
  });
  const session = (changes = {}) => ({
    id: 'cs_synthetic', object: 'checkout.session', mode: 'subscription', livemode: true, customer: 'cus_synthetic',
    client_reference_id: owner, metadata: { identity_id: owner, purchase_attempt_id: attemptId },
    recovered_from: null, after_expiration: null, status: 'open', payment_status: 'unpaid',
    subscription: null, payment_intent: null, url: 'https://checkout.stripe.com/c/synthetic', ...changes,
  });
  const subscription = (changes = {}) => ({
    id: 'sub_synthetic', customer: 'cus_synthetic', livemode: true, schedule: null,
    metadata: { identity_id: owner, purchase_attempt_id: attemptId },
    items: { data: [{ price: { id: 'price_synthetic', recurring: { usage_type: 'licensed' } } }], has_more: false },
    status: 'active', latest_invoice: 'in_synthetic', ...changes,
  });
  const invoice = (changes = {}) => ({
    id: 'in_synthetic', customer: 'cus_synthetic', subscription: 'sub_synthetic', livemode: true,
    status: 'paid', next_payment_attempt: null, ...changes,
  });
  const payment = (changes = {}) => ({ invoice: 'in_synthetic', livemode: true,
    payment: { type: 'payment_intent', payment_intent: 'pi_synthetic' }, ...changes });
  const intent = (changes = {}) => ({ id: 'pi_synthetic', customer: 'cus_synthetic',
    livemode: true, status: 'succeeded', ...changes });
  const list = (data, changes = {}) => ({ object: 'list', has_more: false, data, ...changes });
  const complete = (changes = {}) => session({ status: 'complete', subscription: 'sub_synthetic',
    payment_status: 'paid', ...changes });

  // These doubles supply preselected durable receipts; they do not implement or prove SQL locking/time policy.
  const fixture = ({ initial = attempt(), dispatchAllowed = true, activated = true, returnAllowed = true, closeLegacyAllowed = true } = {}) => {
    let current = clone(initial), failObserve = null, observeReceipt = null, permits = dispatchAllowed;
    let returnPermission = returnAllowed;
    const rpcCalls = [], httpCalls = [];
    let httpHandler = async () => { throw new Error('Unspecified synthetic HTTP response'); };
    const rpc = async (name, body) => {
      rpcCalls.push({ name, body: clone(body) });
      switch (name) {
        case 'bobby_purchase_capability': return { version: 1, activated };
        case 'bobby_purchase_close_legacy_checkout': return closeLegacyAllowed;
        case 'bobby_purchase_return_allowed': {
          if (returnPermission instanceof Error) throw returnPermission;
          return Array.isArray(returnPermission) ? returnPermission.shift() : returnPermission;
        }
        case 'bobby_purchase_attempt_get':
        case 'bobby_purchase_reference_get': return { attempt: clone(current) };
        case 'bobby_purchase_acquire': {
          current = attempt({ phase: 'reserved', revision: 1, dispatch_at: null, dispatch_payload: null });
          return { state: 'new', attempt: clone(current) };
        }
        case 'bobby_purchase_dispatch': {
          if (!current.dispatch_payload) current = { ...current, dispatch_payload: clone(body.p_payload),
            phase: 'external_started', dispatch_at: '2026-10-03T12:00:00Z', revision: 2 };
          const allowed = Array.isArray(permits) ? permits.shift() : permits;
          return { attempt: clone(current), dispatchAllowed: allowed };
        }
        case 'bobby_purchase_observe': {
          if (failObserve?.(body)) { failObserve = null; throw new subject.PurchaseProtocolError('purchase_storage_unavailable'); }
          if (observeReceipt) return clone(observeReceipt);
          if (Number(body.p_revision) !== Number(current.revision)) return { code: 'stale_revision' };
          if (['closed', 'terminal_no_charge'].includes(current.phase)) return { attempt: clone(current) };
          if (current.provider_reference && body.p_reference && current.provider_reference !== body.p_reference) return { code: 'reference_conflict' };
          current = { ...current, phase: body.p_phase, provider_state: body.p_state,
            provider_reference: body.p_reference ?? current.provider_reference,
            revision: Number(current.revision) + 1 };
          return { attempt: clone(current) };
        }
        default: throw new Error(`Unexpected synthetic RPC: ${name}`);
      }
    };
    subject.setPurchaseRpcForTests(rpc);
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      eq(url.origin, 'https://api.stripe.com', 'provider host is fixed; every request remains intercepted');
      eq(init.headers.Authorization, 'Bearer sk_test_synthetic_not_a_credential', 'only dummy local credential is used');
      const call = { path: url.pathname + url.search, method: init.method ?? 'GET',
        key: init.headers['Idempotency-Key'] ?? null,
        form: Object.fromEntries(new URLSearchParams(init.body ?? '')) };
      httpCalls.push(call);
      const result = await httpHandler(call);
      return result instanceof Response ? result : Response.json(result);
    };
    return { rpcCalls, httpCalls, get current() { return clone(current); },
      onHttp(handler) { httpHandler = handler; },
      failObserveOnce(predicate) { failObserve = predicate; },
      setObserveReceipt(receipt) { observeReceipt = receipt; } };
  };
  const observations = f => f.rpcCalls.filter(call => call.name === 'bobby_purchase_observe');
  const test = async (_name, operation) => { await operation(); scenarios++; };

  await test('New Checkout uses immutable attempt correlation and sanitized public receipt', async () => {
    const f = fixture({ initial: null }); f.onHttp(() => session());
    const reply = await subject.reservedStripeCheckout(owner, clone(form));
    eq(reply.url, session().url, 'open verified session returns its provider URL');
    eq(f.httpCalls.map(call => [call.method, call.path]), [['POST', '/v1/checkout/sessions'],
      ['GET', '/v1/checkout/sessions/cs_synthetic']], 'one provider create followed by authoritative current lookup');
    const gate = f.rpcCalls.find(call => call.name === 'bobby_purchase_return_allowed');
    eq(gate.body, { p_identity: owner, p_attempt: attemptId, p_revision: f.current.revision },
      'public URL is fenced by exact owner, attempt and latest durable revision');
    eq(f.httpCalls[0].key, `bobby-checkout-v1-${attemptId}`, 'attempt binds provider idempotency key');
    eq(f.httpCalls[0].form, payload, 'session and subscription metadata plus disabled recovery are persisted');
    eq(f.current.provider_reference, 'cs_synthetic', 'success requires durable provider reference');
    eq(Object.keys(reply.attempt).sort(), ['basePlanId', 'id', 'offerId', 'pending', 'phase', 'productId',
      'provider', 'requiresSupport', 'supportUrl'].sort(), 'public receipt contains no owner, payload, token or payment claim');
    eq(reply.attempt.pending, true, 'open Checkout continues to hold purchase obligation');
  });

  for (const loss of ['provider-response', 'database-write']) {
    await test(`Lost ${loss} retries exact key/payload after permitted durable receipt`, async () => {
      const f = fixture({ initial: null, dispatchAllowed: [true, true] }); let first = true;
      if (loss === 'database-write') f.failObserveOnce(body => body.p_state === 'checkout_created');
      f.onHttp(() => {
        if (loss === 'provider-response' && first) { first = false; throw new Error('synthetic reply lost after create'); }
        return session();
      });
      await reject(() => subject.reservedStripeCheckout(owner, clone(form)),
        loss === 'provider-response' ? 'stripe_verification_unavailable' : 'purchase_storage_unavailable',
        'ambiguous external creation cannot return success');
      eq(f.current.phase, 'needs_reconciliation', 'lost result retains durable obligation');
      eq(f.current.provider_reference, null, 'missing reference is not fabricated');
      const reply = await subject.reservedStripeCheckout(owner, { ...form,
        'line_items[0][price]': 'price_tampered', success_url: 'https://other.test/changed' });
      eq(reply.url, session().url, 'retry recovers original provider result');
      eq(f.httpCalls.filter(call => call.method === 'POST').map(call => call.key), [`bobby-checkout-v1-${attemptId}`, `bobby-checkout-v1-${attemptId}`],
        'retry uses the same provider key');
      const creates = f.httpCalls.filter(call => call.method === 'POST');
      eq(creates[0].form, creates[1].form, 'retry uses exact frozen parameters despite changed caller/config');
      eq(f.current.provider_reference, 'cs_synthetic', 'retry durably records the original session');
    });
  }

  for (const dispatchAt of ['2026-10-02T13:00:00Z', '2026-10-02T12:00:00Z', '2026-10-01T12:00:00Z']) {
    await test('SQL denial after safe idempotency window never initiates provider request', async () => {
      const f = fixture({ initial: attempt({ phase: 'needs_reconciliation', dispatch_at: dispatchAt }), dispatchAllowed: false });
      await reject(() => subject.reservedStripeCheckout(owner, clone(form)), 'purchase_pending', 'denied durable dispatch stays pending');
      eq(f.httpCalls.length, 0, 'no provider create after SQL denies safe dispatch');
      eq(observations(f).length, 0, 'no fabricated terminal evidence after denied dispatch');
    });
  }

  await test('Lost database write is recoverable by actual Checkout lookup from webhook hint', async () => {
    const f = fixture({ initial: null }); f.failObserveOnce(body => body.p_state === 'checkout_created');
    f.onHttp(() => session());
    await reject(() => subject.reservedStripeCheckout(owner, clone(form)), 'purchase_storage_unavailable', 'lost durable receipt remains failure');
    await subject.reconcileStripeWebhook(attemptId, 'cs_synthetic', null);
    eq(f.current.provider_reference, 'cs_synthetic', 'actual correlated session fills missing reference');
    eq(f.current.phase, 'external_started', 'session lookup retains chargeable obligation');
    eq(f.httpCalls.map(call => [call.method, call.path]), [['POST', '/v1/checkout/sessions'],
      ['GET', '/v1/checkout/sessions/cs_synthetic']], 'webhook recovery retrieves; it never creates another session');
  });

  await test('Subscription webhook can recover missing session reference after identity deletion', async () => {
    const f = fixture({ initial: attempt({ identity_id: null, phase: 'needs_reconciliation' }) });
    f.onHttp(call => {
      if (call.path === '/v1/checkout/sessions?subscription=sub_synthetic&limit=10') return list([complete()]);
      if (call.path === '/v1/checkout/sessions/cs_synthetic') return complete();
      if (call.path === '/v1/subscriptions/sub_synthetic') return subscription({ status: 'canceled' });
      if (call.path === '/v1/invoiceitems?customer=cus_synthetic&pending=true&limit=10') return list([]);
      if (call.path === '/v1/invoices?subscription=sub_synthetic&limit=10') return list([invoice()]);
      if (call.path === '/v1/invoice_payments?invoice=in_synthetic&limit=10') return list([payment()]);
      if (call.path === '/v1/payment_intents/pi_synthetic') return intent();
      throw new Error('Unexpected synthetic tombstone route');
    });
    await subject.reconcileStripeWebhook(attemptId, null, 'sub_synthetic');
    eq(f.current.phase, 'closed', 'complete terminal provider proof can close a deleted-owner tombstone');
    eq(f.current.provider_reference, 'cs_synthetic', 'actual session is retained for correlation');
    eq(f.httpCalls.every(call => call.method === 'GET'), true, 'webhook reconciliation is read-only at provider');
    eq(observations(f)[0].body.p_identity, null, 'deleted identity is not reassigned');
    eq(observations(f)[0].body.p_owner_key, ownerKey, 'retained owner binds terminal receipt');
    eq(observations(f)[0].body.p_resolution, 'stripe-authoritative:subscription-terminal', 'release requires explicit verified terminal reason');
  });

  for (const variation of [
    { value: list([]), code: 'purchase_pending' },
    { value: list([complete(), complete({ id: 'cs_duplicate' })]), code: 'purchase_pending' },
    { value: list([complete()], { has_more: true }), code: 'stripe_session_unverified' },
    { value: list([complete({ recovered_from: 'cs_parent' })]), code: 'purchase_pending' },
    { value: list([complete({ metadata: { identity_id: 'another_owner', purchase_attempt_id: attemptId } })]), code: 'purchase_pending' },
    { value: list([complete({ subscription: 'sub_other' })]), code: 'purchase_pending' },
  ]) {
    await test('Ambiguous subscription lookup never treats absence as no-charge evidence', async () => {
      const f = fixture(); f.onHttp(() => variation.value);
      await reject(() => subject.reconcileStripeWebhook(attemptId, null, 'sub_synthetic'), variation.code,
        'missing, duplicate, incomplete, recovered or foreign candidate cannot close');
      eq(observations(f).length, 0, 'no release or grant is persisted from ambiguous list');
      eq(f.httpCalls.length, 1, 'ambiguous candidates do not proceed to actual-session lookup');
    });
  }

  await test('Known provider reference overrides an unrelated event hint', async () => {
    const f = fixture({ initial: attempt({ provider_reference: 'cs_synthetic' }) }); f.onHttp(() => session());
    await subject.reconcileStripeWebhook(attemptId, 'cs_unrelated', 'sub_unrelated');
    eq(f.httpCalls.map(call => call.path), ['/v1/checkout/sessions/cs_synthetic'], 'known durable reference is used');
  });
  for (const initial of [null, attempt({ phase: 'closed' }), attempt({ phase: 'terminal_no_charge' })]) {
    await test('Absent/terminal ledger entry causes no webhook provider operation', async () => {
      const f = fixture({ initial }); await subject.reconcileStripeWebhook(attemptId, 'cs_synthetic', 'sub_synthetic');
      eq(f.httpCalls.length, 0, 'no provider lookup for closed or missing obligation');
      eq(observations(f).length, 0, 'no ledger mutation for closed or missing obligation');
    });
  }

  for (const [subStatus, paymentStatus, phase] of [
    ['active', 'paid', 'confirmed'], ['active', 'unpaid', 'pending'],
    ['trialing', 'no_payment_required', 'confirmed'], ['trialing', 'paid', 'confirmed'],
    ['past_due', 'paid', 'pending'], ['incomplete', 'unpaid', 'pending'],
  ]) {
    await test('Confirmed obligation is not fabricated paid revenue or paid briefing evidence', async () => {
      const f = fixture(); f.onHttp(() => subscription({ status: subStatus }));
      const result = await subject.observeStripeSession(f.current, complete({ payment_status: paymentStatus }));
      eq(result.phase, phase, 'current subscription and payment state jointly classify obligation');
      eq(subject.publicAttempt(result).pending, true, 'confirmed still blocks another provider initiation');
      eq(Object.keys(subject.publicAttempt(result)).some(key => /paid|amount|price|revenue/i.test(key)), false,
        'public obligation never claims revenue or paid-only eligibility');
    });
  }

  for (const changes of [{ recovered_from: 'cs_parent' }, { livemode: false }, { mode: 'payment' },
    { metadata: { identity_id: 'foreign', purchase_attempt_id: attemptId } },
    { metadata: { identity_id: owner, purchase_attempt_id: 'foreign' } }, { client_reference_id: 'foreign' }]) {
    await test('Session binding rejects recovered, sandbox and foreign owner attempts', async () => {
      const f = fixture(); await reject(() => subject.observeStripeSession(f.current, session(changes)),
        'stripe_session_unverified', 'actual correlated production session is required');
      eq(observations(f).length, 0, 'unverified session creates no ledger receipt');
      eq(f.httpCalls.length, 0, 'invalid session is rejected before subscription lookups');
    });
  }

  await test('Only expired unpaid no-recovery session without charge objects releases', async () => {
    const f = fixture(); const result = await subject.observeStripeSession(f.current, session({ status: 'expired' }));
    eq(result.phase, 'terminal_no_charge', 'verified session expiry can release a never-completed checkout');
    eq(observations(f)[0].body.p_resolution, 'stripe-authoritative:expired-no-recovery', 'terminal receipt records exact reason');
    eq(f.httpCalls.length, 0, 'no provider initiation is needed for already supplied terminal session proof');
  });
  for (const changes of [{ after_expiration: { recovery: { enabled: true } } },
    { subscription: 'sub_synthetic' }, { payment_intent: 'pi_synthetic' }, { payment_status: 'paid' },
    { subscription: undefined }, { payment_intent: undefined }]) {
    await test('Recovery or possible charge objects prevent expired-session release', async () => {
      const f = fixture(); const result = await subject.observeStripeSession(f.current, session({ status: 'expired', ...changes }));
      eq(result.phase, 'needs_reconciliation', 'ambiguous expired checkout remains held');
      eq(observations(f)[0].body.p_resolution, null, 'unknown state cannot fabricate terminal resolution');
    });
  }

  const terminalHttp = (call, changes = {}) => {
    if (call.path === '/v1/subscriptions/sub_synthetic') return subscription({ status: 'canceled', ...changes.sub });
    if (call.path === '/v1/invoiceitems?customer=cus_synthetic&pending=true&limit=10') return changes.pendingItems ?? list([]);
    if (call.path === '/v1/invoices?subscription=sub_synthetic&limit=10') return changes.invoiceList ?? list([invoice(changes.invoice)]);
    if (call.path === '/v1/invoice_payments?invoice=in_synthetic&limit=10') return changes.paymentList ?? list([payment(changes.payment)]);
    if (call.path === '/v1/payment_intents/pi_synthetic') return intent(changes.intent);
    throw new Error('Unexpected synthetic terminal-proof route');
  };
  await test('Canceled subscription closes only after complete correlated invoice and intent proof', async () => {
    const f = fixture(); f.onHttp(call => terminalHttp(call));
    eq((await subject.observeStripeSession(f.current, complete())).phase, 'closed', 'verified completed obligation can close');
    eq(f.httpCalls.map(call => call.path), ['/v1/subscriptions/sub_synthetic',
      '/v1/invoiceitems?customer=cus_synthetic&pending=true&limit=10',
      '/v1/invoices?subscription=sub_synthetic&limit=10', '/v1/invoice_payments?invoice=in_synthetic&limit=10',
      '/v1/payment_intents/pi_synthetic'], 'provider proof traverses subscription, pending items, invoices, payments and intents');
  });
  for (const changes of [
    { sub: { schedule: 'sub_sched_synthetic' } }, { sub: { schedule: undefined } },
    { sub: { latest_invoice: undefined } }, { sub: { customer: null } }, { sub: { customer: 'cus_foreign' } },
    { sub: { items: { data: [{ price: { id: 'price_synthetic', recurring: { usage_type: 'metered' } } }], has_more: false } } },
    { sub: { items: { data: [{ price: { id: 'price_synthetic' } }], has_more: false } } },
    { pendingItems: list([{ id: 'ii_pending_synthetic', customer: 'cus_synthetic' }]) },
    { pendingItems: list([], { has_more: true }) }, { pendingItems: { data: [] } },
    { pendingItems: list(null) },
    { invoiceList: list([]) }, { invoiceList: list([invoice()], { has_more: true }) },
    { invoice: { status: 'open' } }, { invoice: { status: 'uncollectible' } },
    { invoice: { next_payment_attempt: 1800000000 } }, { invoice: { subscription: 'sub_foreign' } },
    { invoice: { customer: 'cus_foreign' } }, { invoice: { livemode: false } },
    { paymentList: list([payment()], { has_more: true }) },
    { payment: { invoice: 'in_foreign' } }, { payment: { livemode: false } },
    { intent: { status: 'processing' } }, { intent: { status: 'requires_action' } },
    { intent: { customer: 'cus_foreign' } }, { intent: { livemode: false } },
  ]) {
    await test('Incomplete or recoverable invoice/intent proof retains canceled obligation', async () => {
      const f = fixture(); f.onHttp(call => terminalHttp(call, changes));
      if (changes.sub && Object.hasOwn(changes.sub, 'customer')) {
        await reject(() => subject.observeStripeSession(f.current, complete()), 'stripe_subscription_unverified',
          'subscription customer must match actual Checkout customer exactly');
        eq(observations(f).length, 0, 'foreign or missing customer creates no provider-state receipt');
      } else {
        eq((await subject.observeStripeSession(f.current, complete())).phase, 'pending', 'cancellation alone or incomplete scan cannot release');
        eq(observations(f)[0].body.p_resolution, null, 'nonterminal proof has no release reason');
      }
    });
  }
  await test('Legacy invoice intent is inspected even when modern payments list is empty', async () => {
    const f = fixture(); f.onHttp(call => terminalHttp(call, {
      invoice: { payment_intent: 'pi_synthetic' }, paymentList: list([]), intent: { status: 'processing' },
    }));
    eq((await subject.observeStripeSession(f.current, complete())).phase, 'pending', 'legacy recoverable intent still holds obligation');
    eq(f.httpCalls.at(-1).path, '/v1/payment_intents/pi_synthetic', 'legacy intent is independently retrieved');
  });

  await test('Provider interruption during terminal proof cannot fabricate no-charge receipt', async () => {
    const f = fixture(); f.onHttp(call => {
      if (call.path === '/v1/subscriptions/sub_synthetic') return subscription({ status: 'canceled' });
      return new Response('unavailable', { status: 503 });
    });
    await reject(() => subject.observeStripeSession(f.current, complete()), 'stripe_verification_unavailable',
      'provider failure is unknown rather than terminal');
    eq(observations(f).length, 0, 'unavailable proof persists no release');
  });
  await test('Stale durable receipt cannot produce checkout success', async () => {
    const f = fixture({ initial: null }); f.onHttp(() => session()); f.setObserveReceipt({ code: 'purchase_revision_conflict' });
    await reject(() => subject.reservedStripeCheckout(owner, clone(form)), 'purchase_revision_conflict', 'CAS denial must reach caller');
    eq(f.current.provider_reference, null, 'failed durable receipt is not successful persistence');
  });
  await test('Unsafe checkout URL cannot produce public redirect success', async () => {
    const f = fixture({ initial: null }); f.onHttp(() => session({ url: 'https://checkout.stripe.com.attacker.test/pay' }));
    await reject(() => subject.reservedStripeCheckout(owner, clone(form)), 'purchase_pending', 'only actual Stripe checkout host can redirect');
    eq(f.current.phase, 'external_started', 'unsafe redirect does not release existing provider obligation');
  });
  await test('Sales flag off cannot bypass sticky database capability', async () => {
    process.env.BOBBY_PURCHASE_RESERVATIONS_ENABLED = 'false'; const f = fixture();
    eq(await subject.stripeUsesReservations(), true, 'previously activated durable protocol remains enforced');
    eq(f.httpCalls.length, 0, 'capability reads cause no provider initiation');
    fixture({ activated: false });
    eq(await subject.stripeUsesReservations(), false, 'unactivated migration retains explicit legacy mode');
  });

  for (const state of ['expired', 'complete-unpaid', 'complete-paid']) {
    await test('Cached idempotent open response cannot replace current provider state', async () => {
      const f = fixture({ initial: null });
      f.onHttp(call => {
        if (call.method === 'POST') return session();
        if (call.path === '/v1/checkout/sessions/cs_synthetic') return state === 'expired'
          ? session({ status: 'expired' }) : complete({ payment_status: state === 'complete-unpaid' ? 'unpaid' : 'paid' });
        if (call.path === '/v1/subscriptions/sub_synthetic') return subscription();
        throw new Error('Unexpected cached-state fixture route');
      });
      await reject(() => subject.reservedStripeCheckout(owner, clone(form)), 'purchase_pending',
        'non-open actual state cannot emit a stale Checkout URL');
      eq(f.current.phase, state === 'expired' ? 'terminal_no_charge' : state === 'complete-paid' ? 'confirmed' : 'pending',
        'actual observation remains durable despite outer ambiguous-error handling');
      eq(f.rpcCalls.some(call => call.name === 'bobby_purchase_return_allowed'), false,
        'non-open session never reaches public URL authorization');
      eq(f.httpCalls.filter(call => call.method === 'POST').length, 1, 'state lookup causes no second provider initiation');
    });
  }
  await test('Public URL is taken from actual GET rather than cached create response', async () => {
    const f = fixture({ initial: null });
    f.onHttp(call => session({ url: call.method === 'POST'
      ? 'https://checkout.stripe.com/c/cached' : 'https://checkout.stripe.com/c/current' }));
    const reply = await subject.reservedStripeCheckout(owner, clone(form));
    eq(reply.url, 'https://checkout.stripe.com/c/current', 'only current provider URL is returned');
  });
  await test('Lost actual-state lookup keeps its saved reference and retry never re-creates', async () => {
    const f = fixture({ initial: null }); let failCurrent = true;
    f.onHttp(call => {
      if (call.method === 'GET' && failCurrent) { failCurrent = false; throw new Error('Synthetic GET outage'); }
      return session();
    });
    await reject(() => subject.reservedStripeCheckout(owner, clone(form)), 'stripe_verification_unavailable',
      'missing current lookup cannot return cached success');
    eq(f.current.provider_reference, 'cs_synthetic', 'bounded create reference was saved before current lookup');
    eq(f.current.phase, 'needs_reconciliation', 'unknown current state keeps the obligation');
    const reply = await subject.reservedStripeCheckout(owner, clone(form));
    eq(reply.url, session().url, 'retry verifies saved provider reference');
    eq(f.httpCalls.filter(call => call.method === 'POST').length, 1, 'retry with known reference performs no create');
  });
  await test('Lost current-state database receipt retries by known reference without another create', async () => {
    const f = fixture({ initial: null }); f.failObserveOnce(body => body.p_state === 'checkout_open');
    f.onHttp(() => session());
    await reject(() => subject.reservedStripeCheckout(owner, clone(form)), 'purchase_storage_unavailable',
      'saved reference alone cannot replace actual-state durable receipt');
    eq(f.current.provider_reference, 'cs_synthetic', 'created reference survives lost later observation');
    eq(f.current.phase, 'needs_reconciliation', 'unknown observation stays held');
    const reply = await subject.reservedStripeCheckout(owner, clone(form));
    eq(reply.url, session().url, 'known-reference retry obtains current state and exact durable gate');
    eq(f.httpCalls.filter(call => call.method === 'POST').length, 1, 'retry creates no additional provider operation');
  });
  await test('Current response cannot replace the immutable created session reference', async () => {
    const f = fixture({ initial: null });
    f.onHttp(call => session({ id: call.method === 'GET' ? 'cs_other' : 'cs_synthetic' }));
    await reject(() => subject.reservedStripeCheckout(owner, clone(form)), 'reference_conflict',
      'durable immutable-reference denial prevents a public URL');
    eq(f.current.provider_reference, 'cs_synthetic', 'original reference is retained for reconciliation');
    eq(f.rpcCalls.some(call => call.name === 'bobby_purchase_return_allowed'), false,
      'receipt conflict never reaches URL permission');
  });
  for (const stage of ['create', 'current']) {
    for (const customer of ['cus_foreign', null, { id: 'cus_synthetic' }]) {
      await test('Durable Stripe customer must match actual session customer exactly', async () => {
        const f = fixture({ initial: null });
        f.onHttp(call => session({ customer: (stage === 'create') === (call.method === 'POST') ? customer : 'cus_synthetic' }));
        await reject(() => subject.reservedStripeCheckout(owner, { ...form, customer: 'cus_synthetic' }),
          'stripe_session_unverified', 'foreign, absent or expanded customer cannot override durable customer');
        eq(f.rpcCalls.some(call => call.name === 'bobby_purchase_return_allowed'), false,
          'uncorrelated customer never reaches public URL gate');
      });
    }
  }
  for (const permission of [false, null, { allowed: true }, new subject.PurchaseProtocolError('purchase_storage_unavailable')]) {
    await test('Deletion denial and unknown durable URL permission reconcile without emitting a URL', async () => {
      const f = fixture({ initial: null, returnAllowed: permission }); let expired = false;
      f.onHttp(call => {
        if (call.path.endsWith('/expire')) { expired = true; return session({ status: 'expired' }); }
        return session({ status: expired ? 'expired' : 'open' });
      });
      await reject(() => subject.reservedStripeCheckout(owner, clone(form)),
        permission === false ? 'account_deleting' : 'purchase_storage_unavailable',
        'only a literal true durable permission can emit an open URL');
      eq(f.current.phase, 'terminal_no_charge', 'only actual post-expiry GET proves no-charge termination');
      const expire = f.httpCalls.filter(call => call.path.endsWith('/expire'));
      eq(expire.map(call => [call.method, call.key]), [['POST', `bobby-expire-${attemptId}`]],
        'denied URL expires only the exact known provider session');
      eq(f.httpCalls.at(-1).method, 'GET', 'expiry POST response is followed by actual retrieval');
      eq(observations(f).some(call => call.body.p_resolution === 'stripe-authoritative:expired-no-recovery'), true,
        'cleanup records actual terminal evidence instead of client cancellation');
    });
  }
  await test('Deletion denial cannot discard a session that completes with an unresolved invoice', async () => {
    const f = fixture({ initial: null, returnAllowed: false }); let sessionReads = 0;
    f.onHttp(call => {
      if (call.path === '/v1/subscriptions/sub_synthetic') return subscription();
      if (call.method === 'GET') return ++sessionReads === 1 ? session() : complete({ payment_status: 'unpaid' });
      return session();
    });
    await reject(() => subject.reservedStripeCheckout(owner, clone(form)), 'account_deleting',
      'completion concurrent with deletion still prevents public URL');
    eq(f.current.phase, 'pending', 'complete unpaid obligation remains held');
    eq(f.httpCalls.some(call => call.path.endsWith('/expire')), false, 'already completed session is not expired by intent');
    eq(observations(f).some(call => call.body.p_resolution), false, 'unpaid completion produces no no-charge proof');
  });
  await test('Deletion cleanup outage preserves the obligation and original denial', async () => {
    const f = fixture({ initial: null, returnAllowed: false });
    f.onHttp(call => {
      if (call.path.endsWith('/expire')) throw new Error('Synthetic expiry outage');
      return session();
    });
    await reject(() => subject.reservedStripeCheckout(owner, clone(form)), 'account_deleting',
      'cleanup failure cannot turn denied URL into success');
    eq(f.current.phase, 'external_started', 'unknown expiry keeps existing chargeable state');
    eq(f.current.provider_reference, 'cs_synthetic', 'recovery reference remains durable');
    eq(observations(f).some(call => call.body.p_resolution), false, 'failed expiry is not terminal proof');
  });
  await test('Retry of existing open session also respects account-deletion gate', async () => {
    const f = fixture({ initial: attempt({ provider_reference: 'cs_synthetic' }), returnAllowed: false }); let expired = false;
    f.onHttp(call => {
      if (call.path.endsWith('/expire')) { expired = true; return session({ status: 'expired' }); }
      return session({ status: expired ? 'expired' : 'open' });
    });
    await reject(() => subject.reservedStripeCheckout(owner, clone(form)), 'account_deleting',
      'known-reference retry cannot bypass deletion gate');
    eq(f.httpCalls.filter(call => call.path === '/v1/checkout/sessions' && call.method === 'POST').length, 0,
      'known-reference retry never creates a fresh Checkout');
    eq(f.current.phase, 'terminal_no_charge', 'post-expiry provider state closes existing obligation');
  });

  // Legacy inventory reads remain intercepted and service-side. No supplied expiry timestamp can
  // replace actual provider terminal evidence, nor can a caller hint replace the persisted tuple.
  process.env.BOBBY_SUPABASE_URL = 'https://inventory.example.test';
  process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'local_synthetic_service_key';
  const legacyAttemptId = '00000000-0000-4000-8000-000000000019';
  const legacyRow = (changes = {}) => ({ identity_id: owner, attempt_id: legacyAttemptId,
    customer_id: 'cus_synthetic', price_id: 'price_synthetic', checkout_session_id: 'cs_synthetic', ...changes });
  const legacyFixture = (rows = [legacyRow()], options = {}) => {
    const f = fixture(options), providerFetch = globalThis.fetch, inventoryCalls = [];
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      if (url.origin !== 'https://inventory.example.test') return providerFetch(input, init);
      inventoryCalls.push({ method: init.method ?? 'GET', path: url.pathname + url.search });
      eq(init.headers.Authorization, 'Bearer local_synthetic_service_key', 'only synthetic inventory service key is used');
      eq(url.pathname, '/rest/v1/bobby_checkout_attempts', 'legacy lookup reads only canonical private Checkout table');
      eq(url.searchParams.get('identity_id'), `eq.${owner}`, 'inventory query binds authenticated owner');
      eq(url.searchParams.get('limit'), '2', 'bounded query detects ambiguous multiple-row inventory');
      eq(init.method ?? 'GET', 'GET', 'inventory lookup has no mutation');
      if (rows instanceof Error) throw rows;
      return rows instanceof Response ? rows : Response.json(rows);
    };
    return { f, inventoryCalls };
  };
  const legacyCloses = f => f.rpcCalls.filter(call => call.name === 'bobby_purchase_close_legacy_checkout');
  await test('Empty authoritative legacy inventory performs no provider operation', async () => {
    const { f, inventoryCalls } = legacyFixture([]); await subject.reconcileLegacyCheckout(owner);
    eq(inventoryCalls.length, 1, 'one bounded owner inventory read');
    eq(f.httpCalls.length, 0, 'no provider lookup or create for empty authoritative inventory');
    eq(legacyCloses(f).length, 0, 'absence does not fabricate terminal receipt');
  });
  for (const rows of [null, { data: [] }, [legacyRow(), legacyRow()],
    new Error('Synthetic inventory timeout'), new Response('down', { status: 503 }), new Response('invalid-json')]) {
    await test('Unknown or ambiguous legacy inventory is fail closed', async () => {
      const { f } = legacyFixture(rows);
      await reject(() => subject.reconcileLegacyCheckout(owner), 'purchase_inventory_unavailable',
        'unavailable, malformed or multiple rows cannot imply an empty inventory');
      eq(f.httpCalls.length, 0, 'unknown inventory never reaches provider create or lookup');
      eq(legacyCloses(f).length, 0, 'unknown inventory never deletes a legacy gate');
    });
  }
  for (const changes of [{ checkout_session_id: null }, { checkout_session_id: 'invalid' },
    { identity_id: 'foreign' }, { attempt_id: 'invalid' }, { customer_id: null }, { price_id: 'invalid' },
    { checkout_session_id: null, expires_at: '2000-01-01T00:00:00Z' }]) {
    await test('Incomplete immutable legacy tuple stays blocked even after elapsed expiry', async () => {
      const { f } = legacyFixture([legacyRow(changes)]);
      await reject(() => subject.reconcileLegacyCheckout(owner), 'purchase_legacy_reconciliation_required',
        'missing provider reference or invalid ownership is not no-charge proof');
      eq(f.httpCalls.length, 0, 'missing immutable tuple cannot initiate provider verification');
      eq(legacyCloses(f).length, 0, 'legacy row remains until verified terminal evidence');
    });
  }
  for (const changes of [{ status: 'open' }, { status: 'expired', payment_status: 'paid' },
    { status: 'expired', after_expiration: { recovery: { enabled: true } } },
    { status: 'expired', payment_intent: 'pi_synthetic' }, { status: 'expired', subscription: 'sub_synthetic' },
    { status: 'expired', payment_intent: undefined }, { status: 'expired', subscription: undefined }]) {
    await test('Chargeable or recoverable actual legacy session cannot release gate', async () => {
      const { f } = legacyFixture(); f.onHttp(() => session({ customer: 'cus_synthetic', ...changes }));
      await reject(() => subject.reconcileLegacyCheckout(owner), 'purchase_legacy_reconciliation_required',
        'actual open/paid/recoverable state remains blocked');
      eq(legacyCloses(f).length, 0, 'no legacy deletion from chargeable state');
      eq(f.httpCalls.every(call => call.method === 'GET'), true, 'inventory reconciliation never initiates a charge');
    });
  }
  for (const changes of [{ id: 'cs_foreign' }, { customer: 'cus_foreign' }, { mode: 'payment' },
    { livemode: false }, { client_reference_id: 'foreign' }, { metadata: { identity_id: 'foreign' } },
    { recovered_from: 'cs_parent' }]) {
    await test('Actual legacy session must match exact production owner/customer/reference', async () => {
      const { f } = legacyFixture(); f.onHttp(() => session({ customer: 'cus_synthetic', status: 'expired', ...changes }));
      await reject(() => subject.reconcileLegacyCheckout(owner), 'purchase_inventory_unavailable',
        'foreign/sandbox/recovered actual session cannot release inventory');
      eq(legacyCloses(f).length, 0, 'correlation failure persists no terminal cleanup');
    });
  }
  for (const closeLegacyAllowed of [true, false, null, { ok: true }]) {
    await test('Only provider-verified expired legacy session and exact CAS can remove its row', async () => {
      const { f } = legacyFixture([legacyRow()], { closeLegacyAllowed });
      f.onHttp(() => session({ customer: 'cus_synthetic', status: 'expired' }));
      if (closeLegacyAllowed === true) await subject.reconcileLegacyCheckout(owner);
      else await reject(() => subject.reconcileLegacyCheckout(owner), 'purchase_inventory_unavailable',
        'nonliteral CAS acknowledgement cannot confirm cleanup');
      const receipt = legacyCloses(f)[0].body;
      eq({ ...receipt, p_evidence: '<digest>' }, { p_identity: owner, p_legacy_attempt: legacyAttemptId,
        p_session: 'cs_synthetic', p_evidence: '<digest>' }, 'cleanup binds exact owner, old attempt and actual session');
      eq(/^[0-9a-f]{64}$/.test(receipt.p_evidence), true, 'cleanup contains bounded terminal evidence digest');
      eq(f.httpCalls.map(call => [call.method, call.path]), [['GET', '/v1/checkout/sessions/cs_synthetic']],
        'expired-state verification performs no provider mutation');
    });
  }
  await test('Completed legacy subscription requires complete terminal future-charge scan', async () => {
    const { f } = legacyFixture(); f.onHttp(call => call.path === '/v1/checkout/sessions/cs_synthetic'
      ? complete({ customer: 'cus_synthetic' }) : terminalHttp(call));
    await subject.reconcileLegacyCheckout(owner);
    eq(legacyCloses(f).length, 1, 'known canceled completed obligation can clear only after actual terminal scan');
    eq(f.httpCalls.some(call => call.path.startsWith('/v1/invoiceitems?')), true, 'pending invoice items are inspected');
    eq(f.httpCalls.at(-1).path, '/v1/payment_intents/pi_synthetic', 'actual payment intent closes proof chain');
    eq(f.httpCalls.every(call => call.method === 'GET'), true, 'terminal scan remains read-only at provider');
  });
  for (const changes of [{ sub: { status: 'active' } },
    { sub: { schedule: undefined } }, { sub: { latest_invoice: undefined } },
    { pendingItems: list([{ id: 'ii_unsettled' }]) }, { invoiceList: list([]) },
    { intent: { status: 'processing' } }]) {
    await test('Completed legacy obligation with incomplete future-charge proof cannot clear', async () => {
      const { f } = legacyFixture(); f.onHttp(call => call.path === '/v1/checkout/sessions/cs_synthetic'
        ? complete({ customer: 'cus_synthetic', payment_status: 'unpaid' }) : terminalHttp(call, changes));
      await reject(() => subject.reconcileLegacyCheckout(owner), 'purchase_legacy_reconciliation_required',
        'active, incomplete or possibly chargeable legacy subscription remains blocked');
      eq(legacyCloses(f).length, 0, 'unknown billing obligations cause no ledger cleanup');
    });
  }

  await test('Omitted subscription item pagination cannot close shared obligation', async () => {
    const f = fixture(); f.onHttp(() => subscription({ status: 'canceled',
      items: { data: [{ price: { id: 'price_synthetic', recurring: { usage_type: 'licensed' } } }] } }));
    await reject(() => subject.observeStripeSession(f.current, complete()), 'stripe_subscription_unverified',
      'items.has_more must be explicitly false before complete-item proof');
    eq(observations(f).length, 0, 'unknown item pagination records no closure or grant');
  });
  await test('Omitted subscription item pagination cannot remove legacy Checkout', async () => {
    const { f } = legacyFixture(); f.onHttp(call => call.path === '/v1/checkout/sessions/cs_synthetic'
      ? complete({ customer: 'cus_synthetic' }) : subscription({ status: 'canceled',
        items: { data: [{ price: { id: 'price_synthetic', recurring: { usage_type: 'licensed' } } }] } }));
    await reject(() => subject.reconcileLegacyCheckout(owner), 'purchase_inventory_unavailable',
      'unknown complete-item pagination cannot release a previous Checkout gate');
    eq(legacyCloses(f).length, 0, 'ambiguous legacy item inventory persists no cleanup');
  });

  // Independent provider doubles exercise the persisted-candidate path, including a deleted identity.
  // The ephemeral signing key never leaves this intercepted test process.
  const google = await import(pathToFileURL(path.join(work, 'google-publisher.js')));
  const localKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.BOBBY_GOOGLE_PUBLISHER_CLIENT_EMAIL = 'local-review@review-fixture.iam.gserviceaccount.com';
  process.env.BOBBY_GOOGLE_PUBLISHER_PRIVATE_KEY = localKey.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const localToken = 'local.candidate.tombstone.synthetic.token';
  const googleOwner = google.googleAccountId(owner);
  const now = Date.now();
  const googleAttempt = () => attempt({ identity_id: null, provider: 'google', product_id: 'review_test_product',
    base_plan_id: 'monthly', google_account_id: googleOwner, phase: 'pending', dispatch_payload: null,
    dispatch_at: new Date(now - 120_000).toISOString(), candidate_ciphertext: subject.sealPurchaseToken(localToken) });
  const expiredGoogle = { kind: 'androidpublisher#subscriptionPurchaseV2',
    externalAccountIdentifiers: { obfuscatedExternalAccountId: googleOwner },
    subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    startTime: new Date(now - 60_000).toISOString(),
    lineItems: [{ productId: 'review_test_product', expiryTime: new Date(now - 1_000).toISOString(),
      offerDetails: { basePlanId: 'monthly' } }] };
  const googleFixture = (unavailable = false) => {
    google.resetPublisherCache(); const f = fixture({ initial: googleAttempt() }); const providerCalls = [];
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input)); providerCalls.push({ origin: url.origin, method: init.method ?? 'GET' });
      if (url.href === 'https://oauth2.googleapis.com/token') {
        eq(init.method, 'POST', 'synthetic Google OAuth uses fixed grant endpoint');
        return Response.json({ token_type: 'Bearer', access_token: 'local.access.token', expires_in: 3600 });
      }
      eq(url.origin, 'https://androidpublisher.googleapis.com', 'only fixed Google Publisher host is intercepted');
      eq(url.pathname, `/androidpublisher/v3/applications/${google.GOOGLE_PACKAGE}/purchases/subscriptionsv2/tokens/${localToken}`,
        'persisted candidate is verified against actual package/token route');
      eq(init.headers.Authorization, 'Bearer local.access.token', 'only synthetic OAuth receipt is used');
      if (unavailable) return new Response('synthetic outage', { status: 503 });
      return Response.json(expiredGoogle);
    };
    return { f, providerCalls };
  };
  await test('Already persisted Google candidate reconciles after identity deletion without a new receive', async () => {
    const { f, providerCalls } = googleFixture();
    const result = await subject.reconcileGoogleAttempt(f.current);
    eq(result.phase, 'closed', 'actual current provider expiry can close retained candidate obligation');
    eq(f.rpcCalls.some(call => call.name === 'bobby_purchase_receive_token'), false,
      'persisted identical candidate does not require nonexistent identity to receive it again');
    eq(observations(f)[0].body.p_identity, null, 'verification does not reattach deleted identity');
    eq(observations(f)[0].body.p_owner_key, ownerKey, 'retained private owner still binds the observation');
    eq(observations(f)[0].body.p_token_fingerprint, google.tokenFingerprint(localToken), 'provider-verified token establishes replay fingerprint');
    eq(providerCalls.length, 2, 'only OAuth and actual current subscription retrieval occur');
  });
  await test('Google outage preserves deleted-owner candidate without fabricated expiry', async () => {
    const { f, providerCalls } = googleFixture(true);
    await reject(() => subject.reconcileGoogleAttempt(f.current), 'google_proof_unavailable', 'provider interruption is not terminal proof');
    eq(f.current.phase, 'pending', 'unknown provider state retains obligation');
    eq(f.rpcCalls.length, 0, 'no redundant receive or fabricated terminal observation is persisted');
    eq(providerCalls.length, 2, 'candidate still reaches actual fixed Publisher verification path');
  });

  console.log(`Purchase reservation helper: ${scenarios} scenarios / ${checks} checks passed; source SHA256 ${sourceSha}.`);
  console.log('Synthetic RPC and intercepted HTTP only; no SQL, store lifecycle, payment or deployment claims.');
} finally {
  subject?.setPurchaseRpcForTests(null);
  for (const [key, value] of savedEnvironment) value === undefined ? delete process.env[key] : process.env[key] = value;
  globalThis.fetch = savedFetch;
  rmSync(work, { recursive: true, force: true });
}
