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

export const config = { maxDuration: 20 };

function authorized(req: VercelRequest): boolean {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH ?? '';
  const raw = req.headers.authorization;
  const got = (Array.isArray(raw) ? raw[0] : raw) ?? '';
  if (expected.length < 16) return false;
  const a = Buffer.from(got), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!revenueCatReady() || !process.env.REVENUECAT_WEBHOOK_AUTH) return res.status(503).json({ error: 'RevenueCat is not configured' });
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });
  const event = ((req.body ?? {}) as { event?: { type?: string; app_user_id?: string; original_app_user_id?: string; aliases?: string[]; transferred_to?: string[]; transferred_from?: string[] } }).event ?? {};
  const ids = new Set([event.app_user_id, event.original_app_user_id, ...(event.aliases ?? []), ...(event.transferred_to ?? []), ...(event.transferred_from ?? [])]
    .filter((id): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)));
  try {
    for (const authUserId of ids) {
      const identity = await identityForAuthUser(authUserId);
      if (identity) await syncRevenueCat(authUserId, identity);
    }
  } catch (e) {
    console.error('[revenuecat-webhook]', event.type, e instanceof Error ? e.message : e);
    return res.status(500).json({ error: 'retry' }); // RevenueCat retries failed deliveries
  }
  return res.status(200).json({ received: true });
}
