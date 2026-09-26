// ============================================================
// RevenueCat as the source of truth for Bobby Pro bought in the app (and on the web through
// RevenueCat Web Billing). The app_user_id is the Supabase auth user id; we never trust an event
// body for the state — we ask RevenueCat's REST API for the subscriber and mirror the `pro`
// entitlement into bobby_subscriptions, which is what the read meter checks.
// Env: REVENUECAT_SECRET_KEY (secret API key), REVENUECAT_WEBHOOK_AUTH (the Authorization header
// value configured on the RevenueCat webhook).
// ============================================================
import { bobbyRest, bobbyServiceHeaders } from './bobby-db.js';
import { getSubscription, upsertSubscription } from './access.js';

export const PRO_ENTITLEMENT = 'pro';
export const revenueCatReady = () => Boolean(process.env.REVENUECAT_SECRET_KEY);

interface RcSubscriber {
  entitlements?: Record<string, { expires_date?: string | null; product_identifier?: string }>;
  subscriptions?: Record<string, { store?: string; expires_date?: string | null; unsubscribe_detected_at?: string | null; billing_issues_detected_at?: string | null; refunded_at?: string | null }>;
}

/** The bobby_identities row behind a RevenueCat app_user_id (a Supabase auth user id). */
export async function identityForAuthUser(authUserId: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(authUserId)) return null;
  const r = await fetch(bobbyRest(`bobby_identities?auth_user_id=eq.${authUserId}&select=id`), { headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`identities ${r.status}`);
  const rows = (await r.json()) as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

/** Mirror the subscriber's `pro` entitlement into bobby_subscriptions; returns whether it is active. */
export async function syncRevenueCat(authUserId: string, identityId: string): Promise<boolean> {
  if (!revenueCatReady()) throw new Error('RevenueCat is not configured');
  const r = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(authUserId)}`, {
    headers: { Authorization: `Bearer ${process.env.REVENUECAT_SECRET_KEY}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`revenuecat subscriber ${r.status}`);
  const { subscriber } = (await r.json()) as { subscriber?: RcSubscriber };
  const ent = subscriber?.entitlements?.[PRO_ENTITLEMENT];
  const current = await getSubscription(identityId).catch(() => null);
  if (!ent) {
    // Never erase a card subscription that did not come through RevenueCat.
    if (current && current.provider === 'apple' && ['active', 'trialing'].includes(current.status)) {
      await upsertSubscription({ identity_id: identityId, provider: 'apple', status: 'expired' });
    }
    return false;
  }
  const product = ent.product_identifier ?? null;
  const sub = product ? subscriber?.subscriptions?.[product] : undefined;
  const expires = ent.expires_date ?? sub?.expires_date ?? null;
  const active = !sub?.refunded_at && (expires === null || Date.parse(expires) > Date.now());
  const store = sub?.store ?? 'app_store';
  const provider: 'apple' | 'stripe' = store === 'app_store' || store === 'mac_app_store' ? 'apple' : 'stripe';
  if (current?.provider === 'stripe' && current.stripe_subscription_id && ['active', 'trialing'].includes(current.status) && !active) return true;
  await upsertSubscription({
    identity_id: identityId, provider, status: sub?.refunded_at ? 'refunded' : active ? 'active' : 'expired',
    product_id: product, current_period_end: expires,
  });
  return active;
}
