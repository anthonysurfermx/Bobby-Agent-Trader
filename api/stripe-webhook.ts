// ============================================================
// /api/stripe-webhook — Stripe tells us when a Bobby Pro subscription starts, renews, changes
// or ends; bobby_subscriptions follows. The signature (Stripe-Signature, HMAC-SHA256 over the raw
// body with STRIPE_WEBHOOK_SECRET, 5-minute tolerance) is checked before anything is read.
// Events: checkout.session.completed, customer.subscription.created|updated|deleted; invoice.paid and
// charge.refunded become revenue rows (bobby_purchase_events) for the owner dashboard.
// The identity rides in metadata.identity_id (set by /api/bobby-access checkout).
// ============================================================
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { getSubscription, upsertSubscription } from './_lib/access.js';
import { notifyOwner } from './_lib/provider-alert.js';
import { STRIPE_TERMINAL, StripeError, stripeApi } from './_lib/stripe-api.js';
import { linkPurchaseIdentity, recordPurchaseEvent } from './_lib/purchases.js';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';

export const config = { maxDuration: 60 };

const stripeWork = new AsyncLocalStorage<{ deadline: number }>();
const PAGE_LIMIT = 3;
async function bounded<T>(load: () => Promise<T>, maximum = 5000): Promise<T> {
  const ms = Math.min(maximum, (stripeWork.getStore()?.deadline ?? Date.now() + maximum) - Date.now());
  if (ms <= 0) throw new Error('Stripe reconciliation budget exhausted');
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([load(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Stripe reconciliation budget exhausted')), ms); })]); }
  finally { clearTimeout(timer!); }
}
const stripeFetch = (url: string, init: RequestInit = {}) => {
  const ms = Math.max(1, Math.min(5000, (stripeWork.getStore()?.deadline ?? Date.now() + 5000) - Date.now()));
  return bounded(() => fetch(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms) }));
};
const purchaseTransport = { fetch: stripeFetch, body: bounded };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function validSignature(raw: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => { const i = kv.indexOf('='); return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()]; }));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${parts.t}.${raw}`).digest();
  return header.split(',').filter((kv) => kv.trim().startsWith('v1=')).some((kv) => {
    const got = Buffer.from(kv.trim().slice(3), 'hex');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

async function stripeGet(path: string): Promise<Record<string, unknown>> {
  const r = await stripeFetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` }, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`stripe GET ${path} ${r.status}`);
  const result = await bounded(() => r.json()) as Record<string, unknown>;
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Stripe response invalid');
  return result;
}

/** Newer API versions carry the period end on the subscription item, older ones on the subscription. */
function periodEnd(sub: Record<string, unknown>): string | null {
  const top = sub.current_period_end;
  const item = ((sub.items as { data?: Array<{ current_period_end?: number }> } | undefined)?.data ?? [])[0]?.current_period_end;
  const secs = typeof top === 'number' ? top : typeof item === 'number' ? item : null;
  return secs !== null ? new Date(secs * 1000).toISOString() : null;
}

function periodStart(sub: Record<string, unknown>): string | null {
  const top = sub.current_period_start;
  const item = ((sub.items as { data?: Array<{ current_period_start?: number }> } | undefined)?.data ?? [])[0]?.current_period_start;
  const secs = typeof top === 'number' ? top : typeof item === 'number' ? item : null;
  return secs !== null && Number.isFinite(secs) ? new Date(secs * 1000).toISOString() : null;
}

const stripeId = (value: unknown): string | null => typeof value === 'string' && /^[a-zA-Z0-9_]{3,160}$/.test(value) ? value : null;
const subPrice = (sub: Record<string, unknown>): string | null =>
  stripeId(((sub.items as { data?: Array<{ price?: { id?: string } }> } | undefined)?.data ?? [])[0]?.price?.id);
const subscriptionOfInvoice = (invoice: Record<string, unknown>): string | null =>
  stripeId(invoice.subscription ?? (invoice.parent as { subscription_details?: { subscription?: string } } | undefined)?.subscription_details?.subscription);
const invoiceId = (value: unknown): string | null => typeof value === 'string' ? stripeId(value) :
  stripeId((value as { id?: unknown } | null | undefined)?.id);
const seconds = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
const sameDate = (a: string | null | undefined, b: string | null | undefined): boolean =>
  !!a && !!b && Number.isFinite(Date.parse(a)) && Date.parse(a) === Date.parse(b);

interface StripePaidPeriod {
  identity_id: string; provider: 'stripe'; product_id: string; period_start: string; period_end: string;
  environment: 'production'; period_type: 'normal'; paid_amount: number; currency: string;
  proof_source: 'stripe'; proof_id: string; proof_sha256: string; verification_state: 'confirmed'; verified_at: string;
}

/** Live Stripe invoice + subscription, not webhook amount or an active/trial status alone, prove a paid period. */
export function stripePaidPeriodFromInvoice(identity: string, sub: Record<string, unknown>, invoice: Record<string, unknown>): StripePaidPeriod | null {
  const sid = stripeId(sub.id), iid = stripeId(invoice.id), price = subPrice(sub);
  const configuredPrice = process.env.STRIPE_PRICE_ID;
  const start = periodStart(sub), end = periodEnd(sub);
  const customer = stripeId(sub.customer);
  const amount = invoice.amount_paid;
  const currency = typeof invoice.currency === 'string' ? invoice.currency.toUpperCase() : '';
  const latest = invoiceId(sub.latest_invoice);
  if (!sid || !iid || !price || !configuredPrice || price !== configuredPrice ||
      !start || !end || !customer || !latest || latest !== iid ||
      !/^[0-9a-f-]{36}$/i.test(identity) || sub.status !== 'active' || sub.livemode !== true ||
      invoice.status !== 'paid' || invoice.livemode !== true || invoice.customer !== customer ||
      subscriptionOfInvoice(invoice) !== sid || !Number.isSafeInteger(amount) || (amount as number) <= 0 ||
      !/^[A-Z]{3}$/.test(currency) || Date.parse(end) <= Date.now() || Date.parse(start) >= Date.parse(end)) return null;
  const lines = ((invoice.lines as { data?: Array<Record<string, unknown>> } | undefined)?.data ?? []);
  const matching = lines.find((line) => {
    const lineSubscription = stripeId(line.subscription ??
      (line.parent as { subscription_item_details?: { subscription?: string } } | undefined)?.subscription_item_details?.subscription);
    const linePrice = stripeId((line.price as { id?: string } | undefined)?.id ??
      (line.pricing as { price_details?: { price?: string } } | undefined)?.price_details?.price);
    const linePeriod = line.period as { start?: unknown; end?: unknown } | undefined;
    const details = (line.parent as { subscription_item_details?: { proration?: boolean } } | undefined)?.subscription_item_details;
    const oldSubscriptionLine = line.type === 'subscription' && lineSubscription === sid;
    const newSubscriptionLine = details !== undefined && lineSubscription === sid;
    return (oldSubscriptionLine || newSubscriptionLine) && details?.proration !== true && linePrice === price &&
      typeof line.amount === 'number' && line.amount > 0 &&
      seconds(linePeriod?.start) === Date.parse(start) / 1000 && seconds(linePeriod?.end) === Date.parse(end) / 1000;
  });
  if (!matching) return null;
  // The amount is stored in Stripe's minor units and is used only as a positive-paid gate, never as UI revenue.
  const material = [iid, sid, customer, price, start, end, amount, currency].join('|');
  return {
    identity_id: identity, provider: 'stripe', product_id: price, period_start: start, period_end: end,
    environment: 'production', period_type: 'normal', paid_amount: amount as number, currency,
    proof_source: 'stripe', proof_id: iid, proof_sha256: createHash('sha256').update(material).digest('hex'),
    verification_state: 'confirmed', verified_at: new Date().toISOString(),
  };
}

async function stripeProof(identity: string): Promise<StripePaidPeriod | null> {
  const r = await stripeFetch(bobbyRest(`bobby_brief_paid_periods?identity_id=eq.${identity}&proof_source=eq.stripe&select=*`),
    { headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`Stripe paid proof read ${r.status}`);
  return ((await bounded(() => r.json())) as StripePaidPeriod[])[0] ?? null;
}

async function deleteStripeProof(identity: string): Promise<void> {
  const r = await stripeFetch(bobbyRest(`bobby_brief_paid_periods?identity_id=eq.${identity}&proof_source=eq.stripe`),
    { method: 'DELETE', headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`Stripe paid proof delete ${r.status}`);
}

async function reconcileStripeProof(identity: string, sub: Record<string, unknown>): Promise<void> {
  const existing = await stripeProof(identity);
  if (!existing) return;
  const current = sub.status === 'active' && sub.livemode === true &&
    existing.product_id === subPrice(sub) && sameDate(existing.period_start, periodStart(sub)) &&
    sameDate(existing.period_end, periodEnd(sub)) && existing.proof_id === invoiceId(sub.latest_invoice) &&
    existing.environment === 'production' && Number(existing.paid_amount) > 0;
  if (!current) await deleteStripeProof(identity);
}

async function upsertStripeProof(proof: StripePaidPeriod): Promise<void> {
  const r = await stripeFetch(bobbyRest('bobby_brief_paid_periods?on_conflict=identity_id'), {
    method: 'POST', headers: bobbyServiceHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ ...proof, updated_at: new Date().toISOString() }), signal: AbortSignal.timeout(4000),
  });
  if (!r.ok) throw new Error(`Stripe paid proof upsert ${r.status}`);
}

/** A paid invoice can later be refunded while its invoice status remains `paid`. Read the current charges so a
 * delayed/replayed invoice.paid event cannot resurrect a fully refunded proof. Credit/manual payments fail closed. */
async function netStripePaid(invoice: Record<string, unknown>): Promise<number> {
  const iid = stripeId(invoice.id);
  if (!iid) return 0;
  const payments = await stripeGet(`invoice_payments?invoice=${encodeURIComponent(iid)}&limit=10`);
  if (payments.has_more === true) return 0;
  const rows = (payments.data as Array<Record<string, unknown>> | undefined) ?? [];
  let net = 0;
  for (const row of rows) {
    const detail = row.payment as { type?: string; payment_intent?: unknown } | undefined;
    const pid = invoiceId(detail?.payment_intent);
    if (row.status !== 'paid' || row.livemode !== true || row.invoice !== iid ||
        String(row.currency ?? '').toLowerCase() !== String(invoice.currency ?? '').toLowerCase() ||
        detail?.type !== 'payment_intent' || !pid || !Number.isSafeInteger(row.amount_paid) || Number(row.amount_paid) <= 0) continue;
    const intent = await stripeGet(`payment_intents/${pid}`);
    const cid = invoiceId(intent.latest_charge);
    if (intent.status !== 'succeeded' || intent.livemode !== true || intent.customer !== invoice.customer || !cid) continue;
    const charge = await stripeGet(`charges/${cid}`);
    if (charge.id !== cid || charge.payment_intent !== pid || charge.customer !== invoice.customer ||
        charge.livemode !== true || charge.paid !== true || charge.captured !== true || charge.disputed === true ||
        !Number.isSafeInteger(charge.amount) || !Number.isSafeInteger(charge.amount_refunded)) continue;
    net += Math.max(0, Math.min(Number(row.amount_paid), Number(charge.amount) - Number(charge.amount_refunded)));
  }
  return net;
}

async function saveSubscription(sub: Record<string, unknown>, fallbackIdentity?: string | null) {
  const metadataIdentity = (sub.metadata as Record<string, string> | undefined)?.identity_id;
  if (metadataIdentity && fallbackIdentity && metadataIdentity !== fallbackIdentity) throw new Error('Stripe subscription owner mismatch');
  const identity = String(metadataIdentity ?? fallbackIdentity ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(identity)) { console.error('[stripe-webhook] subscription without identity', sub.id); return null; }
  // A test-mode subscription never touches production accounts (audit 2026-10-02, SEC-CFG-04).
  if (sub.livemode === false && process.env.VERCEL_ENV === 'production') { console.error('[stripe-webhook] test-mode subscription ignored', sub.id); return null; }
  const status = String(sub.status ?? 'incomplete');
  const incomingLive = ['active', 'trialing', 'past_due'].includes(status);
  // One row per account is shared with the App Store and with older subscriptions: a non-live state for this
  // subscription never overwrites a different plan that is still live (a late retry for an old subscription, or an
  // active Apple plan). STRIPE-01 / STRIPE-03.
  const current = await getSubscription(identity);
  if (current && !incomingLive) {
    const currentLive = ['active', 'trialing', 'past_due'].includes(current.status) && (!current.current_period_end || Date.parse(current.current_period_end) > Date.now());
    const otherPlan = current.provider === 'apple' || (current.stripe_subscription_id && current.stripe_subscription_id !== sub.id);
    // A nonterminal card plan must still be visible for portal/deletion and to
    // block another Apple purchase, even while an existing Apple plan is live.
    if (currentLive && otherPlan && (STRIPE_TERMINAL.has(status) || current.provider === 'stripe')) {
      console.error('[stripe-webhook] stale state for another plan ignored', sub.id); return identity;
    }
  }
  const price = subPrice(sub);
  try {
    await bounded(() => upsertSubscription({
      identity_id: identity, provider: 'stripe', status, product_id: price,
      current_period_end: periodEnd(sub), stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : null,
      stripe_subscription_id: typeof sub.id === 'string' ? sub.id : null,
      environment: sub.livemode === true ? 'production' : sub.livemode === false ? 'sandbox' : 'unknown',
      period_type: sub.status === 'trialing' ? 'trial' : periodEnd(sub) && periodStart(sub) ? 'normal' : 'unknown',
      store_checked_at: new Date().toISOString(),
    }));
  } catch (e) {
    // Foreign key: the account was deleted. Nobody can use this plan any more, so a subscription that can still
    // charge is cancelled at Stripe before acknowledging (otherwise it would bill a deleted account for ever).
    if (e instanceof Error && /"code"\s*:\s*"23503"/.test(e.message)) {
      if (typeof sub.id === 'string' && !STRIPE_TERMINAL.has(status)) {
        try { await stripeApi('DELETE', `subscriptions/${encodeURIComponent(sub.id)}`); }
        catch (c) { if (!(c instanceof StripeError && c.status === 404)) throw c; }
        // A charge may have gone through before the cancel (paid, then deleted before this event): refund by hand.
        notifyOwner('Bobby: suscripción de tarjeta de una cuenta borrada — revisar reembolso',
          `Stripe mandó ${sub.id} (cliente ${typeof sub.customer === 'string' ? sub.customer : '?'}) para una cuenta que ya no existe. La cancelé.\nSi la primera factura se cobró, reembólsala en Stripe → Pagos.`);
      }
      console.error('[stripe-webhook] subscription for a deleted account cancelled', sub.id);
      return null;
    }
    throw e;
  }
  await reconcileStripeProof(identity, sub);
  return identity;
}

async function subscriptionOwner(subscriptionId: unknown): Promise<{ identity: string | null; customer: string | null }> {
  if (typeof subscriptionId !== 'string' || !subscriptionId) return { identity: null, customer: null };
  const r = await stripeFetch(bobbyRest(`bobby_subscriptions?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=identity_id,stripe_customer_id`), { headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`subscriptions ${r.status}`);
  const rows = await bounded(() => r.json()) as Array<{ identity_id: string; stripe_customer_id?: string | null }>;
  if (!Array.isArray(rows) || rows.length > 1) throw new Error('Stripe subscription owner ambiguous');
  const row = rows[0];
  return { identity: row && /^[0-9a-f-]{36}$/i.test(row.identity_id) ? row.identity_id : null, customer: invoiceId(row?.stripe_customer_id) };
}
async function identityForSubscription(subscriptionId: unknown): Promise<string | null> { return (await subscriptionOwner(subscriptionId)).identity; }

/** Only USD scaling is explicitly supported here. Other currencies are retained without inventing major units. */
const localAmount = (minor: number, currency: string) => currency === 'USD' ? minor / 100 : null;
const mode = (value: unknown) => value === true ? 'PRODUCTION' : value === false ? 'SANDBOX' : null;
const currencyOf = (value: unknown) => typeof value === 'string' && /^[a-zA-Z]{3}$/.test(value) ? value.toUpperCase() : null;
const ledgerResourceId = (prefix: 'stripe-invoice' | 'stripe-refund', id: string) => {
  const canonical = `${prefix}-${id}`;
  return canonical.length <= 80 ? canonical : `${prefix}-${createHash('sha256').update(id).digest('hex')}`;
};
const ledgerInvoiceId = (id: string) => ledgerResourceId('stripe-invoice', id);
const ledgerRefundId = (id: string) => ledgerResourceId('stripe-refund', id);

async function recordInvoice(invoice: Record<string, unknown>, eventCreated: unknown): Promise<string | null> {
  const amount = invoice.amount_paid, currency = currencyOf(invoice.currency), id = stripeId(invoice.id);
  if (!Number.isSafeInteger(amount) || Number(amount) < 0 || !currency || !id) throw new Error('Stripe invoice money invalid');
  if (amount === 0) return null;
  const ledgerId = ledgerInvoiceId(id);
  const paidAt = seconds((invoice.status_transitions as { paid_at?: unknown } | undefined)?.paid_at) ?? seconds(eventCreated);
  await recordPurchaseEvent({ id: ledgerId, type: invoice.billing_reason === 'subscription_create' ? 'INITIAL_PURCHASE' : 'RENEWAL',
    environment: mode(invoice.livemode), store: 'STRIPE', priceUsd: currency === 'USD' ? Number(amount) / 100 : null,
    // A configured fee formula is not this charge's balance transaction. Keep the take-home unknown.
    takehome: null, currency, priceLocal: localAmount(Number(amount), currency),
    // Issuance can precede payment by days. The signed paid transition/event owns the revenue timestamp.
    at: paidAt !== null ? paidAt * 1000 : Date.now(),
    country: (invoice.customer_address as { country?: string } | null | undefined)?.country ?? null,
  }, purchaseTransport);
  return ledgerId;
}

const REFUND_STATUSES = new Set(['pending', 'requires_action', 'succeeded', 'failed', 'canceled']);
async function recordRefund(refund: Record<string, unknown>, charge: Record<string, unknown>, environment: unknown): Promise<string | null> {
  const id = stripeId(refund.id), chargeId = stripeId(charge.id), refundedCharge = invoiceId(refund.charge);
  const currency = currencyOf(refund.currency), chargeCurrency = currencyOf(charge.currency);
  if (!id?.startsWith('re_') || !chargeId || refundedCharge !== chargeId || !currency ||
      (chargeCurrency && currency !== chargeCurrency) || !Number.isSafeInteger(refund.amount) || Number(refund.amount) <= 0 ||
      !REFUND_STATUSES.has(String(refund.status ?? ''))) throw new Error('Stripe refund evidence invalid');
  if (refund.status !== 'succeeded') return null;
  const ledgerId = ledgerRefundId(id);
  await recordPurchaseEvent({ id: ledgerId, type: 'REFUND', environment: mode(environment), store: 'STRIPE',
    priceUsd: currency === 'USD' ? -Number(refund.amount) / 100 : null, takehome: 1,
    currency, priceLocal: localAmount(-Number(refund.amount), currency),
    at: seconds(refund.created) ? Number(refund.created) * 1000 : null,
    country: (charge.billing_details as { address?: { country?: string } } | null | undefined)?.address?.country ?? null,
  }, purchaseTransport);
  return ledgerId;
}

/** Persist every known individual refund before requesting another page or doing optional ownership/proof work. */
async function refundRows(charge: Record<string, unknown>): Promise<string[]> {
  const ids = new Set<string>();
  let invalid = false;
  const write = async (rows: unknown[]) => {
    for (const row of rows) {
      try {
        if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Stripe refund invalid');
        const id = await recordRefund(row as Record<string, unknown>, charge, charge.livemode);
        if (id) ids.add(id);
      } catch { invalid = true; }
    }
  };
  const embedded = charge.refunds as { data?: unknown[]; has_more?: unknown } | undefined;
  if (embedded?.data && Array.isArray(embedded.data)) {
    await write(embedded.data);
    if (invalid) throw new Error('Stripe refund evidence/write incomplete');
    if (embedded.has_more === false) {
      if (!embedded.data.length && Number(charge.amount_refunded) > 0) throw new Error('Stripe refund detail missing');
      return [...ids];
    }
  }
  const chargeId = stripeId(charge.id);
  if (!chargeId) throw new Error('Stripe charge id missing');
  let cursor: string | null = null;
  const seen = new Set<string>();
  for (let page = 0; page < PAGE_LIMIT; page++) {
    const list = await stripeGet(`refunds?charge=${encodeURIComponent(chargeId)}&limit=100${cursor ? `&starting_after=${encodeURIComponent(cursor)}` : ''}`);
    if (!Array.isArray(list.data)) throw new Error('Stripe refund page invalid');
    await write(list.data);
    if (invalid) throw new Error('Stripe refund evidence/write incomplete');
    if (list.has_more === false) {
      if (!ids.size && !list.data.length && Number(charge.amount_refunded) > 0) throw new Error('Stripe refund detail missing');
      return [...ids];
    }
    if (list.has_more !== true) throw new Error('Stripe refund pagination unknown');
    const next = stripeId((list.data.at(-1) as { id?: unknown } | undefined)?.id);
    if (!next || seen.has(next)) throw new Error('Stripe refund cursor invalid');
    seen.add(next); cursor = next;
  }
  throw new Error('Stripe refund list exceeds budget');
}

async function invoicesForCharge(charge: Record<string, unknown>): Promise<string[]> {
  const direct = invoiceId(charge.invoice);
  if (direct) return [direct];
  const intent = invoiceId(charge.payment_intent);
  if (!intent) return [];
  const invoices = new Set<string>();
  let cursor: string | null = null;
  const seen = new Set<string>();
  for (let page = 0; page < PAGE_LIMIT; page++) {
    const list = await stripeGet(`invoice_payments?payment[type]=payment_intent&payment[payment_intent]=${encodeURIComponent(intent)}&limit=100${cursor ? `&starting_after=${encodeURIComponent(cursor)}` : ''}`);
    if (!Array.isArray(list.data)) throw new Error('Stripe invoice payment page invalid');
    for (const item of list.data) {
      const row = item as Record<string, unknown>;
      const payment = row?.payment as { type?: unknown; payment_intent?: unknown } | undefined;
      const id = invoiceId(row?.invoice);
      if (id && payment?.type === 'payment_intent' && invoiceId(payment.payment_intent) === intent && row.livemode === charge.livemode) invoices.add(id);
      else throw new Error('Stripe invoice payment linkage unknown');
    }
    if (list.has_more === false) return [...invoices];
    if (list.has_more !== true) throw new Error('Stripe invoice payment pagination unknown');
    const next = stripeId((list.data.at(-1) as { id?: unknown } | undefined)?.id);
    if (!next || seen.has(next)) throw new Error('Stripe invoice payment cursor invalid');
    seen.add(next); cursor = next;
  }
  throw new Error('Stripe invoice payment list exceeds budget');
}

async function attributeRefunds(charge: Record<string, unknown>, ledgerIds: string[]) {
  const linked = await invoicesForCharge(charge);
  const owners = new Set<string>();
  const invoices: Array<{ invoice: Record<string, unknown>; identity: string | null }> = [];
  const customer = invoiceId(charge.customer);
  for (const iid of linked) {
    const invoice = await stripeGet(`invoices/${iid}`);
    if (invoice.id !== iid || !customer || invoiceId(invoice.customer) !== customer) throw new Error('Stripe refund invoice/customer mismatch');
    const sid = subscriptionOfInvoice(invoice);
    const mapping = await subscriptionOwner(sid);
    if (mapping.customer && mapping.customer !== customer) throw new Error('Stripe subscription customer mismatch');
    let identity = mapping.customer === customer ? mapping.identity : null;
    if (mapping.identity && !mapping.customer && sid) {
      const currentSub = await stripeGet(`subscriptions/${sid}`);
      const metadataIdentity = (currentSub.metadata as Record<string, string> | undefined)?.identity_id;
      if (currentSub.id !== sid || invoiceId(currentSub.customer) !== customer || (metadataIdentity && metadataIdentity !== mapping.identity)) throw new Error('Stripe refund subscription owner/customer mismatch');
      identity = mapping.identity;
    }
    if (identity) owners.add(identity);
    invoices.push({ invoice, identity });
  }
  if (owners.size > 1) throw new Error('Stripe refund owner ambiguous');
  const owner = owners.values().next().value as string | undefined;
  if (owner && invoices.every((i) => i.identity === owner)) for (const id of ledgerIds) await linkPurchaseIdentity(id, owner, purchaseTransport);
  // Paid-period eligibility is still decided by fresh captured payments, never by the refund ledger alone.
  if (charge.livemode === true && Number.isSafeInteger(charge.amount) && Number.isSafeInteger(charge.amount_refunded) &&
      Number(charge.amount_refunded) >= Number(charge.amount)) {
    for (const { invoice, identity } of invoices) {
      if (identity && (await stripeProof(identity))?.proof_id === invoice.id && await netStripePaid(invoice) <= 0) await deleteStripeProof(identity);
    }
  }
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) return json(503, { error: 'Stripe is not configured' });
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get('stripe-signature'), secret)) return json(400, { error: 'bad signature' });
  let event: { id?: string; type?: string; livemode?: boolean; created?: number; data?: { object?: Record<string, unknown> } };
  try { event = JSON.parse(raw); } catch { return json(400, { error: 'bad payload' }); }
  if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string') return json(400, { error: 'bad payload' });
  const obj = event.data?.object ?? {};
  return stripeWork.run({ deadline: Date.now() + 50_000 }, async () => {
    try {
      if (event.type === 'checkout.session.completed' && obj.mode === 'subscription' && typeof obj.subscription === 'string') {
        const sub = await stripeGet(`subscriptions/${obj.subscription}`);
        await saveSubscription(sub, (obj.client_reference_id as string | null) ?? (obj.metadata as Record<string, string> | undefined)?.identity_id);
      } else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
        const sid = stripeId(obj.id);
        // Even a late deleted event must use the provider's current state.
        const sub = sid ? await stripeGet(`subscriptions/${sid}`) : obj;
        await saveSubscription(sub, await identityForSubscription(sid));
      } else if (event.type === 'invoice.paid' && typeof event.id === 'string') {
        // The signed event is already evidence that this amount was received; provider reads establish access separately.
        const ledgerId = await recordInvoice(obj, event.created);
        const sid = subscriptionOfInvoice(obj);
        const mapping = await subscriptionOwner(sid), mapped = mapping.identity, customer = invoiceId(obj.customer);
        if (mapping.customer && mapping.customer !== customer) throw new Error('Stripe subscription customer mismatch');
        if (mapped && customer && mapping.customer === customer && ledgerId) await linkPurchaseIdentity(ledgerId, mapped, purchaseTransport);
        if (sid && stripeId(obj.id)) {
          const [sub, invoice] = await Promise.all([stripeGet(`subscriptions/${sid}`), stripeGet(`invoices/${obj.id}`)]);
          if (sub.id !== sid || invoice.id !== obj.id || invoiceId(sub.customer) !== invoiceId(obj.customer) ||
              invoiceId(invoice.customer) !== invoiceId(obj.customer) || subscriptionOfInvoice(invoice) !== sid) throw new Error('Stripe invoice subscription/customer mismatch');
          const metadataIdentity = (sub.metadata as Record<string, string> | undefined)?.identity_id;
          if (mapped && metadataIdentity && mapped !== metadataIdentity) throw new Error('Stripe subscription owner mismatch');
          const identity = await saveSubscription(sub, mapped);
          if (identity) {
            if (ledgerId) await linkPurchaseIdentity(ledgerId, identity, purchaseTransport);
            const paid = stripePaidPeriodFromInvoice(identity, sub, invoice);
            if (paid) {
              const net = await netStripePaid(invoice);
              if (net > 0) await upsertStripeProof({ ...paid, paid_amount: Math.min(paid.paid_amount, net) });
              else if ((await stripeProof(identity))?.proof_id === paid.proof_id) await deleteStripeProof(identity);
            }
          }
        }
      } else if (event.type === 'charge.refunded' && typeof event.id === 'string') {
        const cid = stripeId(obj.id);
        if (!cid) throw new Error('Stripe refunded charge missing');
        const ids = await refundRows(obj);
        const current = await stripeGet(`charges/${cid}`);
        if (current.id !== cid || (obj.livemode != null && current.livemode !== obj.livemode)) throw new Error('Stripe refunded charge mismatch');
        await attributeRefunds(current, ids);
      } else if (['refund.created', 'refund.updated', 'charge.refund.updated'].includes(event.type ?? '') && typeof event.id === 'string') {
        const cid = invoiceId(obj.charge);
        if (!cid) throw new Error('Stripe refund charge missing');
        const initialCharge = { id: cid, livemode: event.livemode };
        const id = await recordRefund(obj, initialCharge, event.livemode);
        if (id) {
          const current = await stripeGet(`charges/${cid}`);
          if (current.id !== cid || (event.livemode != null && current.livemode !== event.livemode)) throw new Error('Stripe refund charge mismatch');
          await attributeRefunds(current, [id]);
        }
      }
    } catch (e) {
      console.error('[stripe-webhook]', event.type, e instanceof Error ? e.message : e);
      return json(500, { error: 'retry' }); // Stripe retries with backoff
    }
    return json(200, { received: true });
  });
}
