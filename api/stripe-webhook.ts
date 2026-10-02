// ============================================================
// /api/stripe-webhook — Stripe tells us when a Bobby Pro subscription starts, renews, changes
// or ends; bobby_subscriptions follows. The signature (Stripe-Signature, HMAC-SHA256 over the raw
// body with STRIPE_WEBHOOK_SECRET, 5-minute tolerance) is checked before anything is read.
// Events: checkout.session.completed, customer.subscription.created|updated|deleted; invoice.paid and
// charge.refunded and refund.created|updated become revenue rows (bobby_purchase_events) for the owner dashboard.
// The identity rides in metadata.identity_id (set by /api/bobby-access checkout).
// ============================================================
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSubscription, upsertSubscription } from './_lib/access.js';
import { STRIPE_TERMINAL, StripeError, stripeApi } from './_lib/stripe-api.js';
import { linkPurchaseIdentityIfMissing, recordPurchaseEvent } from './_lib/purchases.js';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';

export const config = { maxDuration: 20 };

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
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` }, signal: AbortSignal.timeout(10000) });
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

async function saveSubscription(sub: Record<string, unknown>, fallbackIdentity?: string | null) {
  const identity = String((sub.metadata as Record<string, string> | undefined)?.identity_id ?? fallbackIdentity ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(identity)) { console.error('[stripe-webhook] subscription without identity', sub.id); return; }
  // A test-mode subscription never touches production accounts (audit 2026-10-02, SEC-CFG-04).
  if (sub.livemode === false && process.env.VERCEL_ENV === 'production') { console.error('[stripe-webhook] test-mode subscription ignored', sub.id); return; }
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
      console.error('[stripe-webhook] stale state for another plan ignored', sub.id); return;
    }
  }
  const price = ((sub.items as { data?: Array<{ price?: { id?: string } }> } | undefined)?.data ?? [])[0]?.price?.id ?? null;
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
      }
      console.error('[stripe-webhook] subscription for a deleted account cancelled', sub.id);
      return;
    }
    throw e;
  }
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
  if (typeof customerId !== 'string' || !/^cus_[A-Za-z0-9]+$/.test(customerId)) return null;
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
  if (typeof chargeId !== 'string' || !/^ch_[A-Za-z0-9]+$/.test(chargeId)) throw new Error('refund without charge');
  const identityId = await identityForCustomer(charge.customer);
  const country = (charge.billing_details as { address?: { country?: string } } | null | undefined)?.address?.country ?? null;
  let after: string | null = null;
  for (let page = 0; page < 100; page++) {
    const path = `refunds?charge=${encodeURIComponent(chargeId)}&limit=100${after ? `&starting_after=${encodeURIComponent(after)}` : ''}`;
    const list = await stripeApi<{ data?: Array<{ id: string; status?: string; amount?: number; currency?: string; created?: number; charge?: string }>; has_more?: boolean }>('GET', path);
    const refunds = list.data ?? [];
    for (const refund of refunds) {
      if (refund.status !== 'succeeded' || !/^re_[A-Za-z0-9]+$/.test(refund.id) || refund.charge !== chargeId || !Number.isSafeInteger(refund.amount) || (refund.amount ?? 0) <= 0) continue;
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
      const live = typeof obj.id === 'string' ? await stripeGet(`subscriptions/${obj.id}`) : obj;
      await saveSubscription(live);
    } else if (event.type === 'invoice.paid' && typeof obj.id === 'string' && /^in_[A-Za-z0-9]+$/.test(obj.id) && Number(obj.amount_paid) > 0) {
      // Two Stripe Event objects may refer to the same invoice. Key the ledger
      // to the invoice, then repair a missing identity on a later replay.
      const purchaseId = `stripe-invoice-${obj.id}`;
      const usd = String(obj.currency ?? '').toLowerCase() === 'usd' ? Number(obj.amount_paid) / 100 : null;
      const subscription = obj.subscription ?? (obj.parent as { subscription_details?: { subscription?: string } } | undefined)?.subscription_details?.subscription;
      const identityId = await identityForSubscription(subscription);
      await recordPurchaseEvent({
        id: purchaseId, type: obj.billing_reason === 'subscription_create' ? 'INITIAL_PURCHASE' : 'RENEWAL', environment: obj.livemode === false ? 'SANDBOX' : 'PRODUCTION',
        store: 'STRIPE', priceUsd: usd, takehome: usd !== null ? stripeTakehome(usd) : null, currency: String(obj.currency ?? '').toUpperCase() || null,
        priceLocal: Number(obj.amount_paid) / 100, identityId, at: Number(obj.created) * 1000 || null,
        country: (obj.customer_address as { country?: string } | null | undefined)?.country ?? null,
      });
      await linkPurchaseIdentityIfMissing(purchaseId, identityId);
    } else if (event.type === 'charge.refunded' && typeof obj.id === 'string') {
      await recordStripeRefunds(obj);
    } else if ((event.type === 'refund.created' || event.type === 'refund.updated') && typeof obj.charge === 'string') {
      const charge = await stripeGet(`charges/${encodeURIComponent(obj.charge)}`);
      await recordStripeRefunds(charge);
    }
  } catch (e) {
    console.error('[stripe-webhook]', event.type, e instanceof Error ? e.message : e);
    return json(500, { error: 'retry' }); // Stripe retries with backoff
  }
  return json(200, { received: true });
}
