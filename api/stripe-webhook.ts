// ============================================================
// /api/stripe-webhook — Stripe tells us when a Bobby Pro subscription starts, renews, changes
// or ends; bobby_subscriptions follows. The signature (Stripe-Signature, HMAC-SHA256 over the raw
// body with STRIPE_WEBHOOK_SECRET, 5-minute tolerance) is checked before anything is read.
// Events: checkout.session.completed, customer.subscription.created|updated|deleted; invoice.paid and
// charge.refunded become revenue rows (bobby_purchase_events) for the owner dashboard.
// The identity rides in metadata.identity_id (set by /api/bobby-access checkout).
// ============================================================
import { createHmac, timingSafeEqual } from 'node:crypto';
import { upsertSubscription } from './_lib/access.js';
import { recordPurchaseEvent } from './_lib/purchases.js';
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
  const price = ((sub.items as { data?: Array<{ price?: { id?: string } }> } | undefined)?.data ?? [])[0]?.price?.id ?? null;
  await upsertSubscription({
    identity_id: identity, provider: 'stripe', status: String(sub.status ?? 'incomplete'), product_id: price,
    current_period_end: periodEnd(sub), stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : null,
    stripe_subscription_id: typeof sub.id === 'string' ? sub.id : null,
  });
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
      await saveSubscription(obj);
    } else if (event.type === 'invoice.paid' && typeof event.id === 'string' && Number(obj.amount_paid) > 0) {
      const usd = String(obj.currency ?? '').toLowerCase() === 'usd' ? Number(obj.amount_paid) / 100 : null;
      const subscription = obj.subscription ?? (obj.parent as { subscription_details?: { subscription?: string } } | undefined)?.subscription_details?.subscription;
      await recordPurchaseEvent({
        id: event.id, type: obj.billing_reason === 'subscription_create' ? 'INITIAL_PURCHASE' : 'RENEWAL', environment: obj.livemode === false ? 'SANDBOX' : 'PRODUCTION',
        store: 'STRIPE', priceUsd: usd, takehome: usd !== null ? stripeTakehome(usd) : null, currency: String(obj.currency ?? '').toUpperCase() || null,
        priceLocal: Number(obj.amount_paid) / 100, identityId: await identityForSubscription(subscription), at: Number(obj.created) * 1000 || null,
        country: (obj.customer_address as { country?: string } | null | undefined)?.country ?? null,
      });
    } else if (event.type === 'charge.refunded' && typeof event.id === 'string' && Number(obj.amount_refunded) > 0) {
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
