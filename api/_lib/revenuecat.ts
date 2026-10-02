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
import { getCache, setCache } from './api-cache.js';
import { notifyOwner } from './provider-alert.js';

export const PRO_ENTITLEMENT = 'pro';
const secretKey = () => (process.env.REVENUECAT_SECRET_KEY || '').trim();
export const revenueCatReady = () => Boolean(secretKey());

const KEY_ALERT_WINDOW_SEC = 6 * 3600;
let keyAlertAt = 0;

/** RevenueCat refused the secret key: every purchase stays unlinked until it is replaced, so tell the owner. */
async function alertRejectedKey(status: number): Promise<void> {
  if (Date.now() - keyAlertAt < KEY_ALERT_WINDOW_SEC * 1000) return;
  keyAlertAt = Date.now();
  try {
    if (await getCache('revenuecat-key-alert')) return;
    await setCache('revenuecat-key-alert', { status, at: new Date().toISOString() }, KEY_ALERT_WINDOW_SEC);
  } catch { /* the per-instance guard still holds */ }
  notifyOwner('Bobby: RevenueCat rechazó la llave secreta — las compras no se vinculan', [
    `RevenueCat respondió ${status} a GET /v1/subscribers con REVENUECAT_SECRET_KEY.`,
    '',
    'Mientras tanto Apple cobra, pero Bobby no puede confirmar Bobby Pro: la app muestra "no pudo confirmar tu suscripción" y el webhook falla (RevenueCat lo reintenta).',
    '',
    'Arreglo: RevenueCat → Project settings → API keys → nueva secret key versión V1 → reemplazar REVENUECAT_SECRET_KEY en Vercel (Production) y redesplegar.',
    '',
    'No vuelvo a avisar en las próximas 6 horas.',
  ].join('\n'));
}

interface RcSubscriber {
  entitlements?: Record<string, { expires_date?: string | null; product_identifier?: string }>;
  subscriptions?: Record<string, { store?: string; expires_date?: string | null; unsubscribe_detected_at?: string | null; billing_issues_detected_at?: string | null; refunded_at?: string | null; is_sandbox?: boolean; period_type?: string; grace_period_expires_date?: string | null }>;
}

/** Stores whose purchases are real money sold through RevenueCat. Stripe is handled by its own webhook. */
const PRO_STORES = new Set(['app_store', 'mac_app_store']);

/** Apple sandbox (TestFlight, App Review) grants Pro to everyone unless BOBBY_SANDBOX_PRO_UIDS lists the auth user ids
 *  allowed to (comma separated). Unset keeps App Review working; set it once the reviewer account is known. */
function sandboxProAllowed(authUserId: string): boolean {
  const list = (process.env.BOBBY_SANDBOX_PRO_UIDS || '').split(/[\s,;]+/).map((s) => s.replace(/^["']|["']$/g, '').trim().toLowerCase()).filter(Boolean);
  return list.length === 0 || list.includes(authUserId.toLowerCase());
}

/** The bobby_identities row behind a RevenueCat app_user_id (a Supabase auth user id). */
export async function identityForAuthUser(authUserId: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(authUserId)) return null;
  const r = await fetch(bobbyRest(`bobby_identities?auth_user_id=eq.${authUserId}&select=id`), { headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`identities ${r.status}`);
  const rows = (await r.json()) as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

/** Update only Apple's mirror: never replay a stale Stripe status over its webhook. */
async function storeAppleMirror(identityId: string, stripeSubscriptionId: string, row: {
  status: string; expires: string | null; product: string | null; environment: 'sandbox' | 'production' | null; periodType: string | null;
}): Promise<void> {
  const path = `bobby_subscriptions?identity_id=eq.${encodeURIComponent(identityId)}&stripe_subscription_id=eq.${encodeURIComponent(stripeSubscriptionId)}&select=identity_id`;
  const r = await fetch(bobbyRest(path), {
    method: 'PATCH', headers: bobbyServiceHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify({ apple_status: row.status, apple_current_period_end: row.expires,
      apple_product_id: row.product, apple_environment: row.environment, apple_period_type: row.periodType,
      updated_at: new Date().toISOString() }), signal: AbortSignal.timeout(4000),
  });
  if (!r.ok) throw new Error(`apple mirror ${r.status}`);
  const rows = (await r.json()) as Array<{ identity_id: string }>;
  if (rows.length !== 1) throw new Error('apple mirror owner changed');
}

/** Mirror the subscriber's `pro` entitlement into bobby_subscriptions; returns whether it is active. */
export async function syncRevenueCat(authUserId: string, identityId: string): Promise<boolean> {
  if (!revenueCatReady()) throw new Error('RevenueCat is not configured');
  const r = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(authUserId)}`, {
    headers: { Authorization: `Bearer ${secretKey()}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (r.status === 401 || r.status === 403) await alertRejectedKey(r.status);
  if (!r.ok) throw new Error(`revenuecat subscriber ${r.status}`);
  const { subscriber } = (await r.json()) as { subscriber?: RcSubscriber };
  const ent = subscriber?.entitlements?.[PRO_ENTITLEMENT];
  const current = await getSubscription(identityId);
  // Pro comes only from a real store subscription behind the entitlement: an App Store (or Mac App Store) record
  // with a known store, not refunded and not expired. RevenueCat's Test Store simulates purchases without payment
  // and its key ships in the public repo's Debug config; an entitlement with no subscription record or no store is
  // never presumed to be the App Store (payments security audit 2026-10-02, RC-01).
  // The entitlement names only its latest product; a real App Store subscription may sit beside a Test Store one,
  // so every eligible record is considered and the one that runs longest wins.
  // Apple's billing grace period keeps access after a failed renewal until grace_period_expires_date.
  const until = (s: { expires_date?: string | null; grace_period_expires_date?: string | null }) => {
    if (!s.expires_date) return null;
    const grace = s.grace_period_expires_date && Date.parse(s.grace_period_expires_date) > Date.parse(s.expires_date) ? s.grace_period_expires_date : null;
    return grace ?? s.expires_date;
  };
  const records = Object.entries(subscriber?.subscriptions ?? {})
    .filter(([, s]) => PRO_STORES.has(String(s?.store)) && !s?.refunded_at && (s?.is_sandbox !== true || sandboxProAllowed(authUserId)))
    .sort(([, x], [, y]) => (until(y) ? Date.parse(until(y)!) : Infinity) - (until(x) ? Date.parse(until(x)!) : Infinity));
  const [product, sub] = ent && records.length ? records[0] : [null, undefined];
  const expires = sub ? until(sub) : null;
  const sandbox = sub?.is_sandbox === true;
  const eligible = Boolean(ent && sub);
  const active = eligible && (expires === null || Date.parse(expires) > Date.now());
  const periodType = ['normal', 'trial', 'intro', 'prepaid'].includes(String(sub?.period_type)) ? String(sub?.period_type) : null;
  if (current?.stripe_subscription_id) {
    // A Stripe-owned row keeps its card references even after cancellation. Apple's
    // independent state is persisted for bobby_is_pro and cleared on refunds/expiry.
    const refunded = Object.values(subscriber?.subscriptions ?? {}).some((s) => PRO_STORES.has(String(s?.store)) && s?.refunded_at);
    await storeAppleMirror(identityId, current.stripe_subscription_id, {
      status: active ? periodType === 'trial' ? 'trialing' : 'active' : refunded ? 'refunded' : 'expired',
      expires, product, environment: eligible ? sandbox ? 'sandbox' : 'production' : null, periodType,
    });
    const cardLive = ['active', 'trialing'].includes(current.status) && (!current.current_period_end || Date.parse(current.current_period_end) > Date.now());
    return Boolean(cardLive || active);
  }
  const ownedRow = Boolean(current && !current.stripe_subscription_id);
  if (!eligible) {
    // Revoke what an earlier sync granted from an ineligible source (e.g. a Test Store row granted before this fix).
    if (ownedRow && ['active', 'trialing'].includes(current!.status)) {
      const refunded = Object.values(subscriber?.subscriptions ?? {}).some((s) => PRO_STORES.has(String(s?.store)) && s?.refunded_at);
      await upsertSubscription({ identity_id: identityId, provider: current!.provider, status: refunded ? 'refunded' : 'expired' });
    }
    return Boolean(current && !ownedRow && ['active', 'trialing'].includes(current.status));
  }
  await upsertSubscription({
    identity_id: identityId, provider: 'apple', status: sub?.refunded_at ? 'refunded' : !active ? 'expired' : periodType === 'trial' ? 'trialing' : 'active',
    product_id: product, current_period_end: expires, environment: sandbox ? 'sandbox' : 'production', period_type: periodType,
  });
  return active;
}
