// ============================================================
// /api/revenuecat-webhook — RevenueCat tells us a subscriber changed (purchase, renewal,
// cancellation, billing issue, expiration, refund, transfer). The request must carry the
// Authorization value set on the RevenueCat webhook (REVENUECAT_WEBHOOK_AUTH). We don't trust the
// event's fields for the state: for every Supabase user id it names, we re-read the subscriber
// from RevenueCat and mirror the `pro` entitlement (api/_lib/revenuecat.ts).
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'node:crypto';
import { identityForAuthUser, revenueCatReady, syncRevenueCat } from './_lib/revenuecat.js';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';

export const config = { maxDuration: 20 };

function authorized(req: VercelRequest): boolean {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH ?? '';
  const raw = req.headers.authorization;
  const got = (Array.isArray(raw) ? raw[0] : raw) ?? '';
  if (expected.length < 16) return false;
  const a = Buffer.from(got), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface RevenueCatEvent {
  id?: string; type?: string; app_user_id?: string; original_app_user_id?: string; aliases?: string[];
  transferred_to?: string[]; transferred_from?: string[]; environment?: string; store?: string; product_id?: string;
  price?: number | null; takehome_percentage?: number | null; currency?: string | null;
  price_in_purchased_currency?: number | null; event_timestamp_ms?: number;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const text = (v: unknown, max: number) => (typeof v === 'string' && v ? v.slice(0, max) : null);

/** Revenue for the owner dashboard (bobby_purchase_events). A failure here never fails the sync. */
async function recordPurchaseEvent(event: RevenueCatEvent, identityId: string | null): Promise<void> {
  const id = text(event.id, 80);
  if (!id || !event.type) return;
  const at = num(event.event_timestamp_ms);
  try {
    const r = await fetch(bobbyRest('bobby_purchase_events?on_conflict=id'), {
      method: 'POST', headers: bobbyServiceHeaders({ Prefer: 'resolution=ignore-duplicates,return=minimal' }), signal: AbortSignal.timeout(4000),
      body: JSON.stringify({
        id, type: event.type.slice(0, 40), environment: text(event.environment, 20), store: text(event.store, 30),
        product_id: text(event.product_id, 120), price_usd: num(event.price), takehome: num(event.takehome_percentage),
        currency: text(event.currency, 8), price_local: num(event.price_in_purchased_currency), identity_id: identityId,
        event_at: new Date(at ?? Date.now()).toISOString(),
      }),
    });
    if (!r.ok) console.error('[revenuecat-webhook] purchase event', r.status);
  } catch (e) {
    console.error('[revenuecat-webhook] purchase event', e instanceof Error ? e.message : e);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!revenueCatReady() || !process.env.REVENUECAT_WEBHOOK_AUTH) return res.status(503).json({ error: 'RevenueCat is not configured' });
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });
  const event = ((req.body ?? {}) as { event?: RevenueCatEvent }).event ?? {};
  const ids = new Set([event.app_user_id, event.original_app_user_id, ...(event.aliases ?? []), ...(event.transferred_to ?? []), ...(event.transferred_from ?? [])]
    .filter((id): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)));
  try {
    let firstIdentity: string | null = null;
    for (const authUserId of ids) {
      const identity = await identityForAuthUser(authUserId);
      if (identity) { firstIdentity ??= identity; await syncRevenueCat(authUserId, identity); }
    }
    await recordPurchaseEvent(event, firstIdentity);
  } catch (e) {
    console.error('[revenuecat-webhook]', event.type, e instanceof Error ? e.message : e);
    return res.status(500).json({ error: 'retry' }); // RevenueCat retries failed deliveries
  }
  return res.status(200).json({ received: true });
}
