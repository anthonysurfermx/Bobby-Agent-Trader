// ============================================================
// RevenueCat as the source of truth for Bobby Pro bought in the app (and on the web through
// RevenueCat Web Billing). The app_user_id is the Supabase auth user id; we never trust an event
// body for the state — we ask RevenueCat's REST API for the subscriber and mirror the `pro`
// entitlement into bobby_subscriptions, which is what the read meter checks.
// Env: REVENUECAT_SECRET_KEY (secret API key), REVENUECAT_WEBHOOK_AUTH (the Authorization header
// value configured on the RevenueCat webhook).
// ============================================================
import { createHash } from 'node:crypto';
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

interface RcSubscription {
  store?: string;
  expires_date?: string | null;
  purchase_date?: string | null;
  period_type?: string | null;
  store_transaction_id?: string | number | null;
  is_sandbox?: boolean;
  ownership_type?: string | null;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
  refunded_at?: string | null;
}

export interface RevenueCatPaidEvent {
  id?: string;
  type?: string;
  app_user_id?: string;
  environment?: string;
  store?: string;
  product_id?: string;
  entitlement_id?: string;
  entitlement_ids?: string[];
  period_type?: string;
  is_family_share?: boolean;
  transaction_id?: string | number;
  purchased_at_ms?: number;
  expiration_at_ms?: number;
  price_in_purchased_currency?: number | null;
  currency?: string | null;
}

interface RcSubscriber {
  entitlements?: Record<string, { expires_date?: string | null; product_identifier?: string }>;
  subscriptions?: Record<string, RcSubscription>;
}

interface PaidPeriod {
  identity_id: string;
  provider: 'apple' | 'stripe';
  product_id: string;
  period_start: string;
  period_end: string;
  environment: 'production';
  period_type: 'normal' | 'intro';
  paid_amount: number;
  currency: string;
  proof_source: 'revenuecat';
  proof_id: string;
  proof_sha256: string;
  verification_state: 'confirmed';
  verified_at: string;
}

const paidEventTypes = new Set(['INITIAL_PURCHASE', 'RENEWAL']);
const storeProvider = (store: string | undefined): 'apple' | 'stripe' | null => {
  switch (store?.toLowerCase()) {
    case 'app_store': case 'mac_app_store': return 'apple';
    case 'rc_billing': case 'stripe': return 'stripe';
    default: return null;
  }
};
const paidPeriodType = (raw: string | null | undefined): 'normal' | 'intro' | null => {
  const value = raw?.toLowerCase();
  return value === 'normal' || value === 'intro' ? value : null;
};
const validTime = (value: string | null | undefined): number | null => {
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : null;
};
const sameTime = (left: string | null | undefined, right: string | null | undefined): boolean => {
  const a = validTime(left), b = validTime(right);
  return a !== null && b !== null && Math.abs(a - b) <= 1000;
};
const eventTimeMatches = (left: number | undefined, right: string | null | undefined): boolean => {
  const parsed = validTime(right);
  return Number.isSafeInteger(left) && parsed !== null && Math.abs((left as number) - parsed) <= 1000;
};
const transactionId = (value: string | number | null | undefined): string | null => {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
  const string = value === undefined || value === null ? '' : String(value);
  return string.length > 0 && string.length <= 160 ? string : null;
};

/** The current subscriber confirms ownership, live period, environment and transaction independently of the webhook. */
function currentPaidSubscription(subscriber: RcSubscriber | undefined): { product: string; sub: RcSubscription; provider: 'apple' | 'stripe'; start: string; end: string; txn: string; periodType: 'normal' | 'intro' } | null {
  const ent = subscriber?.entitlements?.[PRO_ENTITLEMENT];
  const product = ent?.product_identifier;
  if (!product || product.length > 120) return null;
  const sub = subscriber?.subscriptions?.[product];
  const provider = storeProvider(sub?.store);
  const start = sub?.purchase_date, end = sub?.expires_date;
  const txn = transactionId(sub?.store_transaction_id);
  const periodType = paidPeriodType(sub?.period_type);
  if (!sub || !provider || !start || !end || !txn || !periodType || sub.is_sandbox !== false ||
      sub.ownership_type !== 'PURCHASED' || sub.refunded_at || !sameTime(end, ent.expires_date) ||
      validTime(start) === null ||
      (validTime(end) as number) <= Date.now() || (validTime(start) as number) >= (validTime(end) as number)) return null;
  return { product, sub, provider, start, end, txn, periodType };
}

/** RevenueCat V1 omits the paid price; an authenticated paid webhook supplies it for exactly this transaction. */
export function paidPeriodFromRevenueCat(identityId: string, authUserId: string, subscriber: RcSubscriber | undefined,
                                         event: RevenueCatPaidEvent | undefined, now = new Date()): PaidPeriod | null {
  const live = currentPaidSubscription(subscriber);
  if (!live || !event || !paidEventTypes.has(event.type ?? '') || event.app_user_id !== authUserId ||
      event.environment !== 'PRODUCTION' || event.is_family_share !== false ||
      event.product_id !== live.product || storeProvider(event.store) !== live.provider ||
      event.store?.toLowerCase() !== live.sub.store?.toLowerCase() ||
      paidPeriodType(event.period_type) !== live.periodType ||
      transactionId(event.transaction_id) !== live.txn ||
      !eventTimeMatches(event.purchased_at_ms, live.start) || !eventTimeMatches(event.expiration_at_ms, live.end) ||
      !(typeof event.price_in_purchased_currency === 'number' && Number.isFinite(event.price_in_purchased_currency) &&
        event.price_in_purchased_currency > 0 && event.price_in_purchased_currency < 1e10) ||
      !/^[A-Z]{3}$/.test(event.currency ?? '') ||
      !event.id || event.id.length > 160 ||
      (event.entitlement_id && event.entitlement_id !== PRO_ENTITLEMENT) ||
      (event.entitlement_ids && !event.entitlement_ids.includes(PRO_ENTITLEMENT))) return null;
  const material = [event.id, live.txn, live.product, live.start, live.end, event.price_in_purchased_currency,
                    event.currency, event.environment, event.period_type].join('|');
  return {
    identity_id: identityId, provider: live.provider, product_id: live.product,
    period_start: live.start, period_end: live.end, environment: 'production', period_type: live.periodType,
    paid_amount: event.price_in_purchased_currency, currency: event.currency,
    proof_source: 'revenuecat', proof_id: live.txn,
    proof_sha256: createHash('sha256').update(material).digest('hex'),
    verification_state: 'confirmed', verified_at: now.toISOString(),
  };
}

function existingProofMatches(row: PaidPeriod, subscriber: RcSubscriber | undefined): boolean {
  const live = currentPaidSubscription(subscriber);
  return !!live && row.provider === live.provider && row.product_id === live.product &&
    sameTime(row.period_start, live.start) && sameTime(row.period_end, live.end) &&
    row.environment === 'production' && row.period_type === live.periodType &&
    row.proof_id === live.txn && Number(row.paid_amount) > 0 && row.verification_state === 'confirmed';
}

async function reconcilePaidPeriod(identityId: string, authUserId: string, subscriber: RcSubscriber | undefined,
                                   event?: RevenueCatPaidEvent): Promise<void> {
  const url = bobbyRest(`bobby_brief_paid_periods?identity_id=eq.${identityId}&proof_source=eq.revenuecat`);
  const read = await fetch(`${url}&select=*`, { headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(4000) });
  if (!read.ok) throw new Error(`paid period read ${read.status}`);
  const existing = ((await read.json()) as PaidPeriod[])[0];
  const fresh = paidPeriodFromRevenueCat(identityId, authUserId, subscriber, event);
  if (fresh) {
    const write = await fetch(bobbyRest('bobby_brief_paid_periods?on_conflict=identity_id'), {
      method: 'POST', headers: bobbyServiceHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ ...fresh, updated_at: new Date().toISOString() }), signal: AbortSignal.timeout(4000),
    });
    if (!write.ok) throw new Error(`paid period upsert ${write.status}`);
  } else if (existing && !existingProofMatches(existing, subscriber)) {
    const remove = await fetch(url, { method: 'DELETE', headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(4000) });
    if (!remove.ok) throw new Error(`paid period delete ${remove.status}`);
  }
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
export async function syncRevenueCat(authUserId: string, identityId: string, paidEvent?: RevenueCatPaidEvent): Promise<boolean> {
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
  // A separate card subscription is owned by Stripe's webhook. RevenueCat cannot overwrite it or use its
  // payment proof as this feature's RevenueCat proof.
  if (current?.provider === 'stripe' && current.stripe_subscription_id && ['active', 'trialing'].includes(current.status) &&
      (current.current_period_end === null || Date.parse(current.current_period_end) > Date.now())) {
    await reconcilePaidPeriod(identityId, authUserId, undefined);
    return true;
  }
  if (!ent) {
    // This row was mirrored from RevenueCat, including RevenueCat Web Billing (provider=stripe, no
    // stripe_subscription_id). It must expire when the entitlement disappears.
    if (current && ['active', 'trialing'].includes(current.status)) {
      await upsertSubscription({ identity_id: identityId, provider: current.provider, status: 'expired' });
    }
    await reconcilePaidPeriod(identityId, authUserId, subscriber, paidEvent);
    return false;
  }
  const product = ent.product_identifier ?? null;
  const sub = product ? subscriber?.subscriptions?.[product] : undefined;
  const expires = ent.expires_date ?? sub?.expires_date ?? null;
  const active = !sub?.refunded_at && (expires === null || Date.parse(expires) > Date.now());
  const store = sub?.store ?? 'app_store';
  const provider: 'apple' | 'stripe' = store === 'app_store' || store === 'mac_app_store' ? 'apple' : 'stripe';
  await upsertSubscription({
    identity_id: identityId, provider, status: sub?.refunded_at ? 'refunded' : active ? 'active' : 'expired',
    product_id: product, current_period_end: expires,
  });
  await reconcilePaidPeriod(identityId, authUserId, subscriber, paidEvent);
  return active;
}
