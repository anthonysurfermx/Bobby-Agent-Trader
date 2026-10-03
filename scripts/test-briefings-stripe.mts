// Signed Stripe invoice + fresh subscription/invoice proof for paid weekly briefings (real webhook and adapter,
// HTTP doubles only; no transaction or production credentials).
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';

process.env.STRIPE_WEBHOOK_SECRET = 'whsec-local-briefing-test';
process.env.STRIPE_SECRET_KEY = 'sk_test_local';
process.env.STRIPE_PRICE_ID = 'price_bobby_pro';
process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
const { POST, stripePaidPeriodFromInvoice } = await import('../api/stripe-webhook.ts');

let checks = 0;
const eq = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks++; };
const yes = (actual: unknown, label: string) => { assert.ok(actual, label); checks++; };
const no = (actual: unknown, label: string) => { assert.equal(actual, null, label); checks++; };
const owner = randomUUID(), otherOwner = randomUUID();
const startSec = Math.floor(Date.now() / 1000) - 86400;
const endSec = startSec + 30 * 86400;
const sid = 'sub_paid_54', iid = 'in_paid_54', price = 'price_bobby_pro', customer = 'cus_bobby_54';
const pid = 'pi_paid_54', cid = 'ch_paid_54';
const sub = () => ({
  id: sid, customer, status: 'active', livemode: true, metadata: { identity_id: owner },
  latest_invoice: iid, items: { data: [{ price: { id: price }, current_period_start: startSec, current_period_end: endSec }] },
});
const invoice = () => ({
  id: iid, subscription: sid, customer, status: 'paid', livemode: true,
  amount_paid: 499, currency: 'usd', created: startSec, billing_reason: 'subscription_create',
  lines: { data: [{ type: 'subscription', subscription: sid, price: { id: price }, amount: 499,
                     period: { start: startSec, end: endSec } }] },
});
const proof = (s: any = sub(), i: any = invoice()) => stripePaidPeriodFromInvoice(owner, s, i);
const valid = proof();
yes(valid, 'paid Production invoice and current subscription make a proof');
eq(valid?.provider, 'stripe', 'provider is direct Stripe');
eq(valid?.product_id, price, 'proof records the paid subscription price');
eq(valid?.period_end, new Date(endSec * 1000).toISOString(), 'period is the current service period');
eq(valid?.paid_amount, 499, 'minor units are positive (used only as an eligibility gate)');
for (const [label, s, i] of [
  ['trialing', { ...sub(), status: 'trialing' }, invoice()],
  ['expired subscription', { ...sub(), status: 'canceled' }, invoice()],
  ['Sandbox subscription', { ...sub(), livemode: false }, invoice()],
  ['Sandbox invoice', sub(), { ...invoice(), livemode: false }],
  ['unpaid invoice', sub(), { ...invoice(), status: 'open' }],
  ['zero-paid invoice', sub(), { ...invoice(), amount_paid: 0 }],
  ['different customer', sub(), { ...invoice(), customer: 'cus_other' }],
  ['unrelated subscription', sub(), { ...invoice(), subscription: 'sub_other' }],
  ['stale invoice', { ...sub(), latest_invoice: 'in_new' }, invoice()],
  ['supplemental paid invoice item', sub(), { ...invoice(), lines: { data: [{ ...invoice().lines.data[0], type: 'invoiceitem' }] } }],
  ['unpaid subscription line', sub(), { ...invoice(), lines: { data: [{ ...invoice().lines.data[0], amount: 0 }] } }],
  ['wrong price', sub(), { ...invoice(), lines: { data: [{ ...invoice().lines.data[0], price: { id: 'price_other' } }] } }],
  ['other subscription price', { ...sub(), items: { data: [{ price: { id: 'price_other' }, current_period_start: startSec, current_period_end: endSec }] } },
    { ...invoice(), lines: { data: [{ ...invoice().lines.data[0], price: { id: 'price_other' } }] } }],
  ['wrong service period', sub(), { ...invoice(), lines: { data: [{ ...invoice().lines.data[0], period: { start: startSec - 1, end: endSec } }] } }],
] as const) no(proof(s, i), `${label} is excluded`);
const newShape = invoice() as any;
delete newShape.subscription;
newShape.parent = { subscription_details: { subscription: sid } };
newShape.lines.data = [{ amount: 499, period: { start: startSec, end: endSec },
  parent: { subscription_item_details: { subscription: sid, proration: false } },
  pricing: { price_details: { price } } }];
yes(proof(sub(), newShape), 'new Stripe invoice parent/pricing fields are supported');
newShape.lines.data[0].parent.subscription_item_details.proration = true;
no(proof(sub(), newShape), 'proration alone is not a paid full subscription period');

let liveSub: any = sub(), liveInvoice: any = invoice();
let liveCharge: any = { id: cid, payment_intent: pid, customer, livemode: true,
                        paid: true, captured: true, disputed: false, amount: 499, amount_refunded: 0 };
let livePayments: any[] = [{
  invoice: iid, status: 'paid', livemode: true, currency: 'usd', amount_paid: 499,
  payment: { type: 'payment_intent', payment_intent: pid },
}];
let mirrored: any = null, paidProof: any = null;
let liveRefunds: Array<Record<string, unknown>> = [];
const purchaseRows: any[] = [], requests: string[] = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const url = String(input), method = init?.method ?? 'GET';
  requests.push(`${method} ${new URL(url).pathname}`);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.includes('api.stripe.com/v1/subscriptions/')) return json(liveSub);
  if (url.includes('api.stripe.com/v1/invoices/')) return json(liveInvoice);
  if (url.includes('api.stripe.com/v1/invoice_payments')) return json({ has_more: false, data: livePayments });
  if (url.includes('api.stripe.com/v1/payment_intents/'))
    return json({ id: pid, status: 'succeeded', customer, livemode: true, latest_charge: cid });
  if (url.includes('api.stripe.com/v1/charges/')) return json(liveCharge);
  // The revenue ledger lists the charge's refunds and records one row per refund.
  if (url.includes('api.stripe.com/v1/refunds?charge=')) return json({ has_more: false, data: liveRefunds });
  if (url.includes('api.stripe.com/v1/customers/')) return json({ id: customer, metadata: {} });
  if (url.includes('/bobby_subscriptions?stripe_customer_id'))
    return json(mirrored?.stripe_customer_id === customer ? [{ identity_id: mirrored.identity_id }] : []);
  if (url.includes('/bobby_subscriptions?stripe_subscription_id'))
    return json(mirrored?.stripe_subscription_id === sid ? [{ identity_id: mirrored.identity_id }] : []);
  // The webhook reads the account's current row before writing (a late state never overwrites another live plan).
  if (url.includes('/bobby_subscriptions?identity_id=eq.')) return json(mirrored ? [mirrored] : []);
  if (url.includes('/bobby_subscriptions?on_conflict')) {
    mirrored = JSON.parse(String(init?.body)); return json(null, 201);
  }
  if (url.includes('/bobby_brief_paid_periods')) {
    if (method === 'GET') return json(paidProof ? [paidProof] : []);
    if (method === 'POST') { paidProof = JSON.parse(String(init?.body)); return json(null, 201); }
    if (method === 'DELETE') { paidProof = null; return new Response(null, { status: 204 }); }
  }
  // The ledger falls back to the subscription's metadata owner while the row is not written yet.
  if (url.includes('/bobby_identities?id=eq.')) return json([{ id: new URL(url).searchParams.get('id')!.replace('eq.', '') }]);
  if (url.includes('/bobby_purchase_events')) {
    if (method === 'PATCH') return new Response(null, { status: 204 });
    purchaseRows.push(JSON.parse(String(init?.body))); return json(null, 201);
  }
  throw new Error(`unexpected ${method} ${url}`);
}) as typeof fetch;

const signed = (type: string, object: unknown, overrides: Record<string, unknown> = {}) => {
  const raw = JSON.stringify({ id: `evt_${type}_${purchaseRows.length}`, type, data: { object }, ...overrides });
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET!).update(`${t}.${raw}`).digest('hex');
  return new Request('https://bobbyprotocol.xyz/api/stripe-webhook', {
    method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${sig}` }, body: raw,
  });
};
try {
  const invalid = await POST(new Request('https://bobbyprotocol.xyz/api/stripe-webhook', { method: 'POST', body: '{}' }));
  eq(invalid.status, 400, 'unsigned invoice cannot grant a period');
  eq(requests.length, 0, 'unsigned payload never reaches Stripe or database');

  const purchase = await POST(signed('invoice.paid', liveInvoice));
  eq(purchase.status, 200, 'signed paid invoice processed');
  eq(mirrored.provider, 'stripe', 'global Pro subscription mirrored');
  eq(mirrored.status, 'active', 'paid subscription active');
  eq(mirrored.stripe_subscription_id, sid, 'mirror binds the exact Stripe subscription');
  yes(paidProof, 'signed invoice corroborated by live Stripe data writes paid proof');
  eq(paidProof.proof_id, iid, 'paid proof references the actual invoice');
  eq(purchaseRows.length, 1, 'owner revenue event remains recorded');

  liveSub = { ...sub(), status: 'trialing' };
  eq((await POST(signed('customer.subscription.updated', liveSub))).status, 200, 'trial update processed');
  eq(mirrored.status, 'trialing', 'global mirror retains trial status');
  no(paidProof, 'trial clears prior paid-period proof');

  liveSub = sub();
  livePayments = [];
  eq((await POST(signed('invoice.paid', liveInvoice))).status, 200, 'invoice marked paid without a captured payment is processed');
  no(paidProof, 'invoice with credit balance or manual payment cannot grant paid briefing');
  livePayments = [{ invoice: iid, status: 'paid', livemode: true, currency: 'usd', amount_paid: 499,
    payment: { type: 'payment_intent', payment_intent: pid } }];
  await POST(signed('invoice.paid', liveInvoice));
  yes(paidProof, 'new paid invoice restores proof');
  liveCharge = { ...liveCharge, amount_refunded: 499, refunded: true };
  const refunded = { id: cid, payment_intent: pid, customer, livemode: true, amount: 499, amount_refunded: 499, currency: 'usd' };
  liveRefunds = [{ id: 're_paid_54', status: 'succeeded', amount: 499, currency: 'usd', created: Math.floor(Date.now() / 1000), charge: cid }];
  const rowsBeforeRefund = purchaseRows.length;
  eq((await POST(signed('charge.refunded', refunded))).status, 200, 'signed full refund processed');
  no(paidProof, 'full refund removes proof even if subscription snapshot still says active');
  const refundRow = purchaseRows.slice(rowsBeforeRefund).find((row) => row.type === 'REFUND');
  eq([refundRow?.id, refundRow?.price_usd ?? refundRow?.priceUsd], ['stripe-refund-re_paid_54', -4.99], 'the refund is recorded once, keyed to the Stripe refund');
  eq((await POST(signed('invoice.paid', liveInvoice))).status, 200, 'late invoice replay is processed');
  no(paidProof, 'late invoice replay cannot resurrect fully refunded proof');

  liveSub = { ...sub(), status: 'canceled' };
  await POST(signed('customer.subscription.deleted', liveSub));
  eq(mirrored.status, 'canceled', 'cancellation mirrors to global subscription');
  no(paidProof, 'cancellation cannot leave paid proof');

  liveSub = { ...sub(), metadata: { identity_id: otherOwner } };
  const mismatch = await POST(signed('invoice.paid', liveInvoice));
  eq(mismatch.status, 500, 'changed metadata cannot transfer a paid subscription to another account');
  no(paidProof, 'owner mismatch cannot write proof');
} finally { globalThis.fetch = originalFetch; }

console.log(`Briefings Stripe adapter: ${checks} checks passed`);
