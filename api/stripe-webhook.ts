// ============================================================
// /api/stripe-webhook — Stripe tells us when a Bobby Pro subscription starts, renews, changes
// or ends; bobby_subscriptions follows. The signature (Stripe-Signature, HMAC-SHA256 over the raw
// body with STRIPE_WEBHOOK_SECRET, 5-minute tolerance) is checked before anything is read.
// Events: checkout.session.completed, customer.subscription.created|updated|deleted; invoice.paid and
// charge.refunded and refund.created|updated become revenue rows (bobby_purchase_events) for the owner dashboard.
// The identity rides in metadata.identity_id (set by /api/bobby-access checkout).
// ============================================================
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { notifyOwner } from './_lib/provider-alert.js';
import { getSubscription, upsertSubscription } from './_lib/access.js';
import { STRIPE_TERMINAL, StripeError, stripeApi } from './_lib/stripe-api.js';
import { linkPurchaseIdentityIfMissing, recordPurchaseEvent } from './_lib/purchases.js';
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
    await upsertSubscription({
      identity_id: identity, provider: 'stripe', status, product_id: price,
      current_period_end: periodEnd(sub), stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : null,
      stripe_subscription_id: typeof sub.id === 'string' ? sub.id : null,
      environment: sub.livemode === true ? 'production' : sub.livemode === false ? 'sandbox' : null,
    });
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

async function identityForSubscription(subscriptionId: unknown): Promise<string | null> {
  if (typeof subscriptionId !== 'string' || !subscriptionId) return null;
  const r = await fetch(bobbyRest(`bobby_subscriptions?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=identity_id`), { headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`subscriptions ${r.status}`);
  const stored = ((await r.json()) as Array<{ identity_id: string }>)[0]?.identity_id;
  if (stored) return stored;
  const sub = await stripeApi<{ metadata?: { identity_id?: string } }>('GET', `subscriptions/${encodeURIComponent(subscriptionId)}`);
  return existingIdentity(sub.metadata?.identity_id);
}

async function existingIdentity(id: unknown): Promise<string | null> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const r = await fetch(bobbyRest(`bobby_identities?id=eq.${encodeURIComponent(id)}&select=id&limit=1`),
    { headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`identity ${r.status}`);
  return ((await r.json()) as Array<{ id: string }>)[0]?.id ?? null;
}

async function identityForCustomer(customerId: unknown): Promise<string | null> {
  if (typeof customerId !== 'string' || !/^cus_[A-Za-z0-9_]+$/.test(customerId)) return null;
  const r = await fetch(bobbyRest(`bobby_subscriptions?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=identity_id&limit=1`),
    { headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`subscriptions ${r.status}`);
  const stored = ((await r.json()) as Array<{ identity_id: string }>)[0]?.identity_id;
  if (stored) return stored;
  const customer = await stripeApi<{ metadata?: { identity_id?: string } }>('GET', `customers/${encodeURIComponent(customerId)}`);
  return existingIdentity(customer.metadata?.identity_id);
}

async function recordStripeRefunds(charge: Record<string, unknown>): Promise<void> {
  const chargeId = charge.id;
  if (typeof chargeId !== 'string' || !/^ch_[A-Za-z0-9_]+$/.test(chargeId)) throw new Error('refund without charge');
  const identityId = await identityForCustomer(charge.customer);
  const country = (charge.billing_details as { address?: { country?: string } } | null | undefined)?.address?.country ?? null;
  let after: string | null = null;
  for (let page = 0; page < 100; page++) {
    const path = `refunds?charge=${encodeURIComponent(chargeId)}&limit=100${after ? `&starting_after=${encodeURIComponent(after)}` : ''}`;
    const list = await stripeApi<{ data?: Array<{ id: string; status?: string; amount?: number; currency?: string; created?: number; charge?: string }>; has_more?: boolean }>('GET', path);
    const refunds = list.data ?? [];
    for (const refund of refunds) {
      if (refund.status !== 'succeeded' || !/^re_[A-Za-z0-9_]+$/.test(refund.id) || refund.charge !== chargeId || !Number.isSafeInteger(refund.amount) || (refund.amount ?? 0) <= 0) continue;
      const currency = String(refund.currency ?? charge.currency ?? '').toLowerCase();
      await recordPurchaseEvent({
        id: `stripe-refund-${refund.id}`, type: 'REFUND', environment: charge.livemode === false ? 'SANDBOX' : 'PRODUCTION', store: 'STRIPE',
        priceUsd: currency === 'usd' ? -refund.amount! / 100 : null, takehome: 1,
        currency: currency.toUpperCase() || null, priceLocal: -refund.amount! / 100,
        identityId, at: typeof refund.created === 'number' ? refund.created * 1000 : null, country,
      });
    }
    if (!list.has_more) return;
    if (!refunds.length) throw new Error('Stripe refund pagination stalled');
    after = refunds[refunds.length - 1].id;
  }
  throw new Error('Stripe refund pagination limit');
}

/** A fully refunded charge no longer proves a paid period: drop the proof built from its invoice. */
async function dropProofOfRefundedCharge(charge: Record<string, unknown>): Promise<void> {
  if (charge.livemode !== true || typeof charge.amount !== 'number' || Number(charge.amount_refunded) < charge.amount) return;
  const iid = stripeId(charge.invoice), pid = stripeId(charge.payment_intent);
  let linked = iid ? [iid] : [];
  if (!iid && pid) {
    // Stripe requires payment[type] with this filter ("Missing required param: payment[type]" otherwise, which made
    // every full refund of a charge without `invoice` answer 500 for ever). Checked against Stripe 2026-10-03.
    const payments = await stripeGet(`invoice_payments?payment[type]=payment_intent&payment[payment_intent]=${encodeURIComponent(pid)}&limit=10`);
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
      // Stripe does not deliver events in order: save the subscription as it is now, never the event's snapshot,
      // so a late or retried event cannot revive a cancelled plan or drop a paid one (audit 2026-10-02, STRIPE-01).
      const sid = stripeId(obj.id);
      const live = sid ? await stripeGet(`subscriptions/${sid}`) : obj;
      await saveSubscription(live, await identityForSubscription(sid));
    } else if (event.type === 'invoice.paid' && typeof obj.id === 'string' && /^in_[A-Za-z0-9_]+$/.test(obj.id)) {
      const sid = subscriptionOfInvoice(obj);
      let identity: string | null = null;
      if (sid) {
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
        // Two Stripe Event objects may refer to the same invoice. Key the ledger
        // to the invoice, then repair a missing identity on a later replay.
        const purchaseId = `stripe-invoice-${obj.id}`;
        const usd = String(obj.currency ?? '').toLowerCase() === 'usd' ? Number(obj.amount_paid) / 100 : null;
        const identityId = identity ?? await identityForSubscription(sid);
        await recordPurchaseEvent({
          id: purchaseId, type: obj.billing_reason === 'subscription_create' ? 'INITIAL_PURCHASE' : 'RENEWAL', environment: obj.livemode === false ? 'SANDBOX' : 'PRODUCTION',
          store: 'STRIPE', priceUsd: usd, takehome: usd !== null ? stripeTakehome(usd) : null, currency: String(obj.currency ?? '').toUpperCase() || null,
          priceLocal: Number(obj.amount_paid) / 100, identityId, at: Number(obj.created) * 1000 || null,
          country: (obj.customer_address as { country?: string } | null | undefined)?.country ?? null,
        });
        await linkPurchaseIdentityIfMissing(purchaseId, identityId);
      }
    } else if (event.type === 'charge.refunded' && typeof obj.id === 'string') {
      await dropProofOfRefundedCharge(obj);
      await recordStripeRefunds(obj);
    } else if ((event.type === 'refund.created' || event.type === 'refund.updated') && typeof obj.charge === 'string') {
      const charge = await stripeGet(`charges/${encodeURIComponent(obj.charge)}`);
      await dropProofOfRefundedCharge(charge);
      await recordStripeRefunds(charge);
    }
  } catch (e) {
    console.error('[stripe-webhook]', event.type, e instanceof Error ? e.message : e);
    return json(500, { error: 'retry' }); // Stripe retries with backoff
  }
  return json(200, { received: true });
}
