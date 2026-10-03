// Real signed Stripe webhook and ledger adapters with HTTP/DB doubles only; no live credentials or transactions.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec-dashboard-truth-offline';
process.env.STRIPE_SECRET_KEY = 'sk_test_dashboard_truth';
process.env.STRIPE_PRICE_ID = 'price_bobby_truth';
process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'offline-service';
const { POST } = await import('../api/stripe-webhook.ts');
const { linkPurchaseIdentity, recordPurchaseEvent } = await import('../api/_lib/purchases.ts');
const OWNER = '00000000-0000-4000-8000-000000000001', OTHER = '00000000-0000-4000-8000-000000000002';
const SID = 'sub_truth', IID = 'in_truth', CID = 'ch_truth', PID = 'pi_truth', CUSTOMER = 'cus_truth';
const START = Math.floor(Date.now() / 1000) - 86_400, END = START + 30 * 86_400;
let checks = 0;
const eq = (a: unknown, b: unknown, label: string) => { assert.deepEqual(a, b, label); checks++; };
const ok = (a: unknown, label: string) => { assert.ok(a, label); checks++; };
const json = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status });
const baseSub = () => ({ id: SID, customer: CUSTOMER, status: 'active', livemode: true, metadata: { identity_id: OWNER }, latest_invoice: IID,
  items: { data: [{ price: { id: 'price_bobby_truth' }, current_period_start: START, current_period_end: END }] } });
const baseInvoice = () => ({ id: IID, subscription: SID, customer: CUSTOMER, status: 'paid', livemode: true, amount_paid: 500, currency: 'usd', created: START,
  billing_reason: 'subscription_create', lines: { data: [{ type: 'subscription', subscription: SID, price: { id: 'price_bobby_truth' }, amount: 500, period: { start: START, end: END } }] } });
const baseCharge = () => ({ id: CID, invoice: IID, customer: CUSTOMER, payment_intent: PID, livemode: true, currency: 'usd', paid: true, captured: true,
  disputed: false, amount: 500, amount_refunded: 0, billing_details: { address: { country: 'MX' } } });
const refund = (id: string, amount: number, extra: Record<string, unknown> = {}) => ({ id, object: 'refund', charge: CID, payment_intent: PID, amount, currency: 'usd', status: 'succeeded', created: START + 100, ...extra });
interface Call { url: URL; method: string; body: any }
const ledger = new Map<string, any>(), subscriptions = new Map<string, any>(), proofs = new Map<string, any>();
let calls: Call[] = [], sub: any, invoice: any, charge: any;
let override: (call: Call) => Response | Promise<Response> | null = () => null;
const originalFetch = globalThis.fetch, originalError = console.error;
const diagnostics: string[] = [];
console.error = (...items: unknown[]) => { diagnostics.push(items.join(' ')); };
globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const call = { url: new URL(String(input)), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null };
  calls.push(call);
  const changed = override(call); if (changed) return await changed;
  const path = call.url.pathname;
  if (call.url.host === 'db.test') {
    if (path.endsWith('/bobby_purchase_events')) {
      if (call.method === 'POST') { if (!ledger.has(call.body.id)) ledger.set(call.body.id, { ...call.body }); return json(null, 201); }
      const id = call.url.searchParams.get('id')?.replace(/^eq\./, ''), row = id ? ledger.get(id) : null;
      if (call.method === 'PATCH') {
        if (!row || row.identity_id !== null || call.url.searchParams.get('identity_id') !== 'is.null') return json([]);
        row.identity_id = call.body.identity_id; return json([{ identity_id: row.identity_id }]);
      }
      return json(row ? [{ identity_id: row.identity_id }] : []);
    }
    if (path.endsWith('/bobby_subscriptions')) {
      if (call.method === 'POST') { subscriptions.set(call.body.stripe_subscription_id, { ...call.body }); return json(null, 201); }
      const sid = call.url.searchParams.get('stripe_subscription_id')?.replace(/^eq\./, '');
      const mapped = sid ? subscriptions.get(sid) : null;
      return json(mapped ? [{ identity_id: mapped.identity_id, stripe_customer_id: mapped.stripe_customer_id }] : []);
    }
    if (path.endsWith('/bobby_brief_paid_periods')) {
      if (call.method === 'POST') { proofs.set(call.body.identity_id, call.body); return json(null, 201); }
      const id = call.url.searchParams.get('identity_id')?.replace(/^eq\./, '');
      if (call.method === 'DELETE') { if (id) proofs.delete(id); return json(null, 204); }
      return json(id && proofs.has(id) ? [proofs.get(id)] : []);
    }
  }
  if (call.url.host === 'api.stripe.com') {
    if (path === `/v1/subscriptions/${SID}`) return json(sub);
    if (path === `/v1/invoices/${IID}`) return json(invoice);
    if (path === `/v1/charges/${CID}`) return json(charge);
    if (path === `/v1/payment_intents/${PID}`) return json({ id: PID, status: 'succeeded', customer: CUSTOMER, livemode: true, latest_charge: CID });
    if (path === '/v1/invoice_payments') return json({ has_more: false, data: [{ id: 'inpay_truth', invoice: IID, status: 'paid', livemode: true, currency: 'usd', amount_paid: 500, payment: { type: 'payment_intent', payment_intent: PID } }] });
    if (path === '/v1/refunds') return json({ has_more: false, data: [] });
  }
  throw new Error(`Unexpected offline transport ${call.method} ${call.url}`);
}) as typeof fetch;
function reset(mapped = true) {
  ledger.clear(); subscriptions.clear(); proofs.clear(); calls = []; diagnostics.length = 0; override = () => null;
  sub = baseSub(); invoice = baseInvoice(); charge = baseCharge();
  if (mapped) subscriptions.set(SID, { ...sub, identity_id: OWNER, stripe_subscription_id: SID, stripe_customer_id: CUSTOMER });
}
let sequence = 0;
function signed(type: string, object: unknown, extra: Record<string, unknown> = {}) {
  const body = JSON.stringify({ id: `evt_truth_${++sequence}`, type, livemode: true, created: Math.floor(Date.now() / 1000), data: { object }, ...extra });
  const t = Math.floor(Date.now() / 1000), signature = createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET!).update(`${t}.${body}`).digest('hex');
  return new Request('https://bobbyprotocol.xyz/api/stripe-webhook', { method: 'POST', body, headers: { 'stripe-signature': `t=${t},v1=${signature}` } });
}
const refundMoney = () => [...ledger.values()].filter((row) => row.type === 'REFUND').reduce((sum, row) => sum + (row.price_usd ?? 0), 0);
try {
  reset();
  eq((await POST(new Request('https://bobbyprotocol.xyz/api/stripe-webhook', { method: 'POST', body: '{}' }))).status, 400, 'unsigned event rejected');
  eq(calls.length, 0, 'unsigned event makes no storage/provider calls');

  override = (c) => c.url.host === 'api.stripe.com' ? json({ error: 'outage' }, 503) : null;
  eq((await POST(signed('invoice.paid', invoice))).status, 500, 'invoice reconciliation outage retries');
  eq(ledger.size, 1, 'authenticated invoice remains recorded despite provider outage');
  const chargeRow = ledger.get(`stripe-invoice-${IID}`);
  eq([chargeRow.price_usd, chargeRow.price_local, chargeRow.takehome, chargeRow.identity_id], [5, 5, null, OWNER], 'received dollars and corroborated existing owner persist; fee unknown');
  ok(calls.findIndex((c) => c.method === 'POST' && c.url.pathname.endsWith('bobby_purchase_events')) < calls.findIndex((c) => c.url.host === 'api.stripe.com'), 'invoice money stored before any remote reconciliation');
  eq(proofs.size, 0, 'outage cannot grant paid proof');
  ok(Date.parse(chargeRow.event_at) > (START + 86_000) * 1000, 'invoice issuance is not treated as payment time');
  reset();
  const paidAt = Math.floor(Date.now() / 1000) - 30, eventAt = paidAt + 10;
  invoice.created = START - 5 * 86_400; invoice.status_transitions = { paid_at: paidAt };
  override = (c) => c.url.host === 'api.stripe.com' ? json({}, 503) : null;
  await POST(signed('invoice.paid', invoice, { created: eventAt }));
  eq(ledger.get(`stripe-invoice-${IID}`).event_at, new Date(paidAt * 1000).toISOString(), 'confirmed paid transition owns payment window');
  reset();
  invoice.created = START - 5 * 86_400;
  override = (c) => c.url.host === 'api.stripe.com' ? json({}, 503) : null;
  await POST(signed('invoice.paid', invoice, { created: eventAt }));
  eq(ledger.get(`stripe-invoice-${IID}`).event_at, new Date(eventAt * 1000).toISOString(), 'authenticated event time backs up absent payment transition');
  override = () => null;
  eq((await POST(signed('invoice.paid', invoice))).status, 200, 'invoice retry reconciles');
  eq(ledger.size, 1, 'different delivery event id never duplicates same invoice');
  eq(proofs.get(OWNER)?.paid_amount, 500, 'strict captured-payment proof still grants');

  reset(false);
  override = (c) => c.url.host === 'api.stripe.com' ? json({}, 503) : null;
  eq((await POST(signed('invoice.paid', invoice))).status, 500, 'new-owner remote outage retries');
  eq(ledger.get(`stripe-invoice-${IID}`)?.identity_id, null, 'owner remains unknown until corroborated');
  override = () => null;
  eq((await POST(signed('invoice.paid', invoice))).status, 200, 'retry corroborates new subscription owner');
  eq([ledger.size, ledger.get(`stripe-invoice-${IID}`).identity_id], [1, OWNER], 'retry fills unknown owner without new money row');
  await assert.rejects(linkPurchaseIdentity(`stripe-invoice-${IID}`, OTHER), /owner mismatch/); checks++;
  eq(ledger.get(`stripe-invoice-${IID}`).identity_id, OWNER, 'owner linker cannot transfer already-owned money');

  reset();
  override = (c) => c.url.pathname.endsWith('bobby_subscriptions') && c.method === 'GET' ? json({}, 503) : null;
  eq((await POST(signed('invoice.paid', invoice))).status, 500, 'owner mapping storage outage retries');
  eq(ledger.size, 1, 'money received stays visible even when mapping unavailable');
  eq(ledger.get(`stripe-invoice-${IID}`).identity_id, null, 'mapping failure does not invent an owner');
  eq(calls.filter((c) => c.url.host === 'api.stripe.com').length, 0, 'failed mapping does not start remote paid reconciliation');

  reset();
  sub.metadata.identity_id = OTHER;
  eq((await POST(signed('invoice.paid', invoice))).status, 500, 'signed changed metadata cannot transfer subscription');
  eq([proofs.size, ledger.get(`stripe-invoice-${IID}`).identity_id], [0, OWNER], 'cross-owner case preserves ledger owner and grants no proof');

  reset();
  const first = refund('re_first', 100), second = refund('re_second', 150);
  charge.amount_refunded = 100;
  eq((await POST(signed('charge.refunded', { ...charge, refunds: { has_more: false, data: [first] } }))).status, 200, 'first partial refund processed');
  charge.amount_refunded = 250;
  eq((await POST(signed('charge.refunded', { ...charge, refunds: { has_more: false, data: [second, first] } }))).status, 200, 'second cumulative snapshot processed as individual refunds');
  eq([ledger.size, refundMoney()], [2, -2.5], 'two partial refunds count100+150 cents, not cumulative100+250');
  eq([...ledger.values()].map((r) => r.identity_id), [OWNER, OWNER], 'invoice/customer/subscription evidence attributes refunds to team/account');
  eq([...ledger.values()].map((r) => r.takehome), [1, 1], 'negative cash principal deducts100percent, with no invented15percent discount');
  eq([...ledger.values()].map((r) => r.event_at), [new Date((START + 100) * 1000).toISOString(), new Date((START + 100) * 1000).toISOString()], 'refund timestamp is refund creation, not processing time');
  eq((await POST(signed('charge.refunded', { ...charge, refunds: { has_more: false, data: [second, first] } }))).status, 200, 'different-event replay accepted');
  eq([ledger.size, refundMoney()], [2, -2.5], 'replay has no refund duplication');
  eq((await POST(signed('refund.updated', second))).status, 200, 'individual refund event supported');
  eq(ledger.size, 2, 'individual and charge snapshot use same refund resource id');

  reset();
  override = (c) => c.url.host === 'api.stripe.com' ? json({}, 503) : null;
  eq((await POST(signed('charge.refunded', { ...charge, amount_refunded: 100, refunds: { has_more: false, data: [first] } }))).status, 500, 'refund reconciliation outage retries');
  eq([ledger.size, refundMoney(), ledger.get('stripe-refund-re_first').identity_id], [1, -1, null], 'known refunded money persisted before optional attribution/proof outage');
  override = () => null;
  eq((await POST(signed('charge.refunded', { ...charge, amount_refunded: 100, refunds: { has_more: false, data: [first] } }))).status, 200, 'refund retry backfills owner');
  eq([ledger.size, ledger.get('stripe-refund-re_first').identity_id], [1, OWNER], 'retry does not duplicate refund');

  reset();
  override = (c) => c.url.pathname === '/v1/refunds' ? json({}, 503) : null;
  eq((await POST(signed('charge.refunded', { ...charge, amount_refunded: 250, refunds: { has_more: true, data: [second] } }))).status, 500, 'missing refund page retries');
  eq([ledger.size, refundMoney()], [1, -1.5], 'embedded known refund persisted before page failure');
  override = (c) => c.url.pathname === '/v1/refunds' ? json(c.url.searchParams.has('starting_after') ? { data: [first], has_more: false } : { data: [second], has_more: true }) : null;
  eq((await POST(signed('charge.refunded', { ...charge, amount_refunded: 250, refunds: { has_more: true, data: [second] } }))).status, 200, 'refund pagination retry loads all pages');
  eq([ledger.size, refundMoney()], [2, -2.5], 'pagination uses each refund once');
  ok(calls.some((c) => c.url.pathname === '/v1/refunds' && c.url.searchParams.get('starting_after') === 're_second'), 'refund pagination follows resource cursor');

  reset();
  let page = 0;
  override = (c) => c.url.pathname === '/v1/refunds' ? json({ data: [refund(`re_page_${++page}`, 1)], has_more: true }) : null;
  eq((await POST(signed('charge.refunded', { ...charge, amount_refunded: 100 }))).status, 500, 'unbounded refund list fails retryably');
  eq([page, ledger.size], [3, 3], 'bounded pagination records known pages before cap');

  reset();
  eq((await POST(signed('charge.refunded', { ...charge, amount_refunded: 200, refunds: { has_more: false, data: [refund('re_unknown', 100, { status: null }), first] } }))).status, 500, 'unknown refund status is unavailable');
  eq([ledger.size, refundMoney()], [1, -1], 'valid refund survives another row with unknown status');
  eq((await POST(signed('refund.created', refund('re_pending', 100, { status: 'pending' })))).status, 200, 'known pending status acknowledged without money');
  eq(ledger.size, 1, 'pending is not settled money');
  eq((await POST(signed('refund.updated', refund('re_pending', 100)))).status, 200, 'later success records pending refund');
  eq(ledger.size, 2, 'settled transition writes exactly once');
  eq((await POST(signed('refund.updated', refund('re_failed', 100, { status: 'failed' })))).status, 200, 'known failed refund acknowledged');
  eq(ledger.size, 2, 'failed refund is not money');

  reset();
  charge.customer = 'cus_unrelated';
  eq((await POST(signed('charge.refunded', { ...charge, amount_refunded: 100, refunds: { has_more: false, data: [first] } }))).status, 500, 'refund invoice/customer disagreement retries');
  eq(ledger.get('stripe-refund-re_first').identity_id, null, 'mismatched customer does not claim an owner');
  reset();
  delete subscriptions.get(SID).stripe_customer_id;
  override = (c) => c.url.host === 'api.stripe.com' ? json({}, 503) : null;
  eq((await POST(signed('invoice.paid', invoice))).status, 500, 'old mapping without customer needs corroboration');
  eq(ledger.get(`stripe-invoice-${IID}`).identity_id, null, 'incomplete old mapping does not prematurely claim owner');
  reset();
  delete charge.invoice; delete charge.payment_intent;
  eq((await POST(signed('charge.refunded', { ...charge, amount_refunded: 100, refunds: { has_more: false, data: [first] } }))).status, 200, 'unlinked charge remains unattributed');
  eq(ledger.get('stripe-refund-re_first').identity_id, null, 'never guesses owner from customer or refund metadata');

  reset();
  invoice.currency = 'jpy';
  override = (c) => c.url.host === 'api.stripe.com' ? json({}, 503) : null;
  eq((await POST(signed('invoice.paid', invoice))).status, 500, 'non-USD invoice still persists before outage');
  eq([ledger.get(`stripe-invoice-${IID}`).currency, ledger.get(`stripe-invoice-${IID}`).price_local, ledger.get(`stripe-invoice-${IID}`).price_usd], ['JPY', null, null], 'unsupported scale and exchange rate stay unknown');
  reset();
  charge.livemode = false;
  eq((await POST(signed('charge.refunded', { ...charge, amount_refunded: 100, refunds: { has_more: false, data: [first] } }, { livemode: false }))).status, 200, 'sandbox refund accepted');
  eq(ledger.get('stripe-refund-re_first').environment, 'SANDBOX', 'sandbox never relabeled as production money');

  reset();
  const longInvoice = { ...invoice, id: `in_${'x'.repeat(90)}` };
  override = (c) => c.url.host === 'api.stripe.com' ? json({}, 503) : null;
  await POST(signed('invoice.paid', longInvoice));
  const longKey = [...ledger.keys()][0];
  ok(longKey.length <= 80 && longKey.startsWith('stripe-invoice-'), 'long Stripe resource gets bounded hash key, never truncated');
  await POST(signed('invoice.paid', longInvoice));
  eq(ledger.size, 1, 'long resource hash stays idempotent');
  await POST(signed('invoice.paid', { ...longInvoice, id: `${longInvoice.id}y` }));
  eq(ledger.size, 2, 'distinct long resources have distinct keys');

  reset();
  await assert.rejects(recordPurchaseEvent({ id: 'x'.repeat(81), type: 'REFUND' }), /id invalid/); checks++;
  eq(calls.length, 0, 'long canonical id never truncates into a colliding money record');
} finally { globalThis.fetch = originalFetch; console.error = originalError; }
console.log(`admin-stripe-truth: ${checks} checks passed (offline; no provider transactions)`);
