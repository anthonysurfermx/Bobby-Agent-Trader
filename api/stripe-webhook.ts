// ============================================================
// /api/stripe-webhook — Stripe tells us when a Bobby Pro subscription starts, renews, changes
// or ends; bobby_subscriptions follows. The signature (Stripe-Signature, HMAC-SHA256 over the raw
// body with STRIPE_WEBHOOK_SECRET, 5-minute tolerance) is checked before anything is read.
// Events: checkout.session.completed, customer.subscription.created|updated|deleted; invoice.paid and
// charge.refunded become revenue rows (bobby_purchase_events) for the owner dashboard.
// The identity rides in metadata.identity_id (set by /api/bobby-access checkout).
// ============================================================
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { upsertSubscription } from './_lib/access.js';
import { recordPurchaseEvent } from './_lib/purchases.js';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';

export const config = { maxDuration: 60 };

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
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` }, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`stripe GET ${path} ${r.status}`);
  return (await r.json()) as Record<string, unknown>;
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
  const r = await fetch(bobbyRest(`bobby_brief_paid_periods?identity_id=eq.${identity}&proof_source=eq.stripe&select=*`),
    { headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`Stripe paid proof read ${r.status}`);
  return ((await r.json()) as StripePaidPeriod[])[0] ?? null;
}

async function deleteStripeProof(identity: string): Promise<void> {
  const r = await fetch(bobbyRest(`bobby_brief_paid_periods?identity_id=eq.${identity}&proof_source=eq.stripe`),
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
  const r = await fetch(bobbyRest('bobby_brief_paid_periods?on_conflict=identity_id'), {
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
  const price = subPrice(sub);
  await upsertSubscription({
    identity_id: identity, provider: 'stripe', status: String(sub.status ?? 'incomplete'), product_id: price,
    current_period_end: periodEnd(sub), stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : null,
    stripe_subscription_id: typeof sub.id === 'string' ? sub.id : null,
  });
  await reconcileStripeProof(identity, sub);
  return identity;
}

async function identityForSubscription(subscriptionId: unknown): Promise<string | null> {
  if (typeof subscriptionId !== 'string' || !subscriptionId) return null;
  const r = await fetch(bobbyRest(`bobby_subscriptions?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=identity_id`), { headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`subscriptions ${r.status}`);
  return ((await r.json()) as Array<{ identity_id: string }>)[0]?.identity_id ?? null;
}

/** Stripe's standard card fee (2.9% + $0.30) as the store share of a USD charge. */
const stripeTakehome = (usd: number) => (usd > 0 ? Math.max(0, (usd - (usd * 0.029 + 0.3)) / usd) : null);

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) return json(503, { error: 'Stripe is not configured' });
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get('stripe-signature'), secret)) return json(400, { error: 'bad signature' });
  let event: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  try { event = JSON.parse(raw); } catch { return json(400, { error: 'bad payload' }); }
  const obj = event.data?.object ?? {};
  try {
    if (event.type === 'checkout.session.completed' && obj.mode === 'subscription' && typeof obj.subscription === 'string') {
      const sub = await stripeGet(`subscriptions/${obj.subscription}`);
      await saveSubscription(sub, (obj.client_reference_id as string | null) ?? (obj.metadata as Record<string, string> | undefined)?.identity_id);
    } else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const sid = stripeId(obj.id);
      const sub = event.type === 'customer.subscription.deleted' || !sid ? obj : await stripeGet(`subscriptions/${sid}`);
      await saveSubscription(sub, await identityForSubscription(sid));
    } else if (event.type === 'invoice.paid' && typeof event.id === 'string') {
      const sid = subscriptionOfInvoice(obj);
      let identity: string | null = null;
      if (sid && stripeId(obj.id)) {
        const [sub, invoice] = await Promise.all([
          stripeGet(`subscriptions/${sid}`), stripeGet(`invoices/${obj.id}`),
        ]);
        const mapped = await identityForSubscription(sid);
        const metadataIdentity = (sub.metadata as Record<string, string> | undefined)?.identity_id;
        if (mapped && metadataIdentity && mapped !== metadataIdentity) throw new Error('Stripe subscription owner mismatch');
        identity = await saveSubscription(sub, mapped);
        if (identity) {
          const paid = stripePaidPeriodFromInvoice(identity, sub, invoice);
          if (paid) {
            const net = await netStripePaid(invoice);
            if (net > 0) await upsertStripeProof({ ...paid, paid_amount: Math.min(paid.paid_amount, net) });
            else if ((await stripeProof(identity))?.proof_id === paid.proof_id) await deleteStripeProof(identity);
          }
        }
      }
      if (Number(obj.amount_paid) > 0) {
        const usd = String(obj.currency ?? '').toLowerCase() === 'usd' ? Number(obj.amount_paid) / 100 : null;
        await recordPurchaseEvent({
          id: event.id, type: obj.billing_reason === 'subscription_create' ? 'INITIAL_PURCHASE' : 'RENEWAL', environment: obj.livemode === false ? 'SANDBOX' : 'PRODUCTION',
          store: 'STRIPE', priceUsd: usd, takehome: usd !== null ? stripeTakehome(usd) : null, currency: String(obj.currency ?? '').toUpperCase() || null,
          priceLocal: Number(obj.amount_paid) / 100, identityId: identity ?? await identityForSubscription(sid), at: Number(obj.created) * 1000 || null,
          country: (obj.customer_address as { country?: string } | null | undefined)?.country ?? null,
        });
      }
    } else if (event.type === 'charge.refunded' && typeof event.id === 'string' && Number(obj.amount_refunded) > 0) {
      const iid = stripeId(obj.invoice);
      if (obj.livemode === true && typeof obj.amount === 'number' && Number(obj.amount_refunded) >= obj.amount) {
        const pid = stripeId(obj.payment_intent);
        let linked = iid ? [iid] : [];
        if (!iid && pid) {
          const payments = await stripeGet(`invoice_payments?payment[payment_intent]=${encodeURIComponent(pid)}&limit=10`);
          if (payments.has_more === true) throw new Error('Stripe invoice payment list is incomplete');
          linked = ((payments.data as Array<{ invoice?: string }> | undefined) ?? [])
            .map((payment) => payment.invoice).filter((id): id is string => !!stripeId(id));
        }
        for (const invoiceId of linked) {
          const invoice = await stripeGet(`invoices/${invoiceId}`);
          const identity = await identityForSubscription(subscriptionOfInvoice(invoice));
          if (identity && (await stripeProof(identity))?.proof_id === invoiceId && await netStripePaid(invoice) <= 0)
            await deleteStripeProof(identity);
        }
      }
      const usd = String(obj.currency ?? '').toLowerCase() === 'usd' ? -Number(obj.amount_refunded) / 100 : null;
      await recordPurchaseEvent({
        id: event.id, type: 'REFUND', environment: obj.livemode === false ? 'SANDBOX' : 'PRODUCTION', store: 'STRIPE', priceUsd: usd,
        takehome: 1, currency: String(obj.currency ?? '').toUpperCase() || null, priceLocal: -Number(obj.amount_refunded) / 100, at: Date.now(),
        country: (obj.billing_details as { address?: { country?: string } } | null | undefined)?.address?.country ?? null,
      });
    }
  } catch (e) {
    console.error('[stripe-webhook]', event.type, e instanceof Error ? e.message : e);
    return json(500, { error: 'retry' }); // Stripe retries with backoff
  }
  return json(200, { received: true });
}
