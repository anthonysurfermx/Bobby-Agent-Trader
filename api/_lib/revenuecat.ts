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
// These are Bobby's verified API resource IDs, not the shorter dashboard project ID. Never choose
// the first project or accept a customer/project/app supplied by a client during paid reconciliation.
const BOBBY_RC_PROJECT = 'proj2d9c569b';
const BOBBY_RC_APP = 'app25c54ce720';
const BOBBY_RC_PRODUCT = 'xyz.bobbyprotocol.bobby.pro.monthly';
const PAID_HISTORY_LIMIT = 20;

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
  grace_period_expires_date?: string | null;
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

/** Recover a previously delivered purchase from provider history, with the same guards as a webhook.
 * The revenue ledger alone lacks transaction/period fields and must never supply a fabricated event.
 * Recent history is bounded to 20 events; ambiguous duplicates or missing fields fail closed. */
export function paidPeriodFromRevenueCatHistory(identityId: string, authUserId: string,
                                               subscriber: RcSubscriber | undefined, history: unknown,
                                               now = new Date()): PaidPeriod | null {
  const live = currentPaidSubscription(subscriber);
  if (!live || live.provider !== 'apple' || live.product !== BOBBY_RC_PRODUCT) return null;
  if (!history || typeof history !== 'object' || Array.isArray(history)) return null;
  const list = history as { object?: unknown; items?: unknown };
  if (list.object !== 'list' || !Array.isArray(list.items) || list.items.length > PAID_HISTORY_LIMIT) return null;
  const matches: PaidPeriod[] = [];
  for (const item of list.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as { object?: unknown; id?: unknown; app_id?: unknown; type?: unknown; body?: unknown };
    if (row.object !== 'customer.event' || row.app_id !== BOBBY_RC_APP || typeof row.id !== 'string' ||
        row.id.length === 0 || row.id.length > 160 || !row.body || typeof row.body !== 'object' || Array.isArray(row.body)) continue;
    const type = row.type === 'PURCHASES_INITIAL_PURCHASE' ? 'INITIAL_PURCHASE' :
                 row.type === 'PURCHASES_RENEWAL' ? 'RENEWAL' : null;
    if (!type) continue;
    const body = row.body as Record<string, unknown>;
    // A wrapper cannot repair a contradictory payload. Nullable deprecated entitlement fields are
    // allowed, but malformed arrays must not reach the webhook adapter's string-array operations.
    if ((body.type !== undefined && body.type !== type) ||
        (body.id !== undefined && (typeof body.id !== 'string' || body.id.toLowerCase() !== row.id.toLowerCase())) ||
        (body.entitlement_id != null && typeof body.entitlement_id !== 'string') ||
        (body.entitlement_ids != null && (!Array.isArray(body.entitlement_ids) || body.entitlement_ids.some(id => typeof id !== 'string'))) ||
        typeof body.app_user_id !== 'string' || typeof body.environment !== 'string' ||
        typeof body.store !== 'string' || typeof body.product_id !== 'string' || typeof body.period_type !== 'string' ||
        typeof body.is_family_share !== 'boolean' ||
        (typeof body.transaction_id !== 'string' && typeof body.transaction_id !== 'number') ||
        typeof body.purchased_at_ms !== 'number' || typeof body.expiration_at_ms !== 'number' ||
        typeof body.price_in_purchased_currency !== 'number' || typeof body.currency !== 'string') continue;
    const event: RevenueCatPaidEvent = {
      id: row.id, type, app_user_id: body.app_user_id, environment: body.environment,
      store: body.store, product_id: body.product_id, period_type: body.period_type,
      is_family_share: body.is_family_share, transaction_id: body.transaction_id,
      purchased_at_ms: body.purchased_at_ms, expiration_at_ms: body.expiration_at_ms,
      price_in_purchased_currency: body.price_in_purchased_currency, currency: body.currency,
      entitlement_id: typeof body.entitlement_id === 'string' ? body.entitlement_id : undefined,
      entitlement_ids: Array.isArray(body.entitlement_ids) ? body.entitlement_ids as string[] : undefined,
    };
    const proof = paidPeriodFromRevenueCat(identityId, authUserId, subscriber, event, now);
    if (proof) matches.push(proof);
  }
  return matches.length === 1 ? matches[0] : null;
}

async function paidPeriodFromHistory(identityId: string, authUserId: string,
                                     subscriber: RcSubscriber | undefined): Promise<PaidPeriod | null> {
  const key = process.env.REVENUECAT_V2_SECRET_KEY?.trim();
  const live = currentPaidSubscription(subscriber);
  if (!key || !/^[0-9a-f-]{36}$/i.test(authUserId) || !live || live.provider !== 'apple' || live.product !== BOBBY_RC_PRODUCT) return null;
  try {
    const response = await fetch(`https://api.revenuecat.com/v2/projects/${BOBBY_RC_PROJECT}/customers/${encodeURIComponent(authUserId)}/events?environment=production&limit=${PAID_HISTORY_LIMIT}`, {
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(2500),
    });
    // No arbitrary pagination or redirected URL is followed. Optional proof recovery never denies
    // basic Pro when V2 is unavailable or its existing key lacks customer read permission.
    if (!response.ok) return null;
    return paidPeriodFromRevenueCatHistory(identityId, authUserId, subscriber, await response.json());
  } catch { return null; }
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
  const fresh = paidPeriodFromRevenueCat(identityId, authUserId, subscriber, event) ??
    (!event && (!existing || !existingProofMatches(existing, subscriber))
      ? await paidPeriodFromHistory(identityId, authUserId, subscriber) : null);
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
  // Pro comes only from a real-money store subscription behind the entitlement (storeProvider: the App Store, the Mac
  // App Store, RevenueCat Web Billing), not refunded and not expired. RevenueCat's Test Store simulates purchases
  // without payment and its key ships in the public repo's Debug config; promotional grants, unknown stores and an
  // entitlement with no subscription record are never presumed to be the App Store (payments security audit
  // 2026-10-02, RC-01). The entitlement names only its latest product, and a real subscription may sit beside a Test
  // Store one, so every eligible record is considered and the one that runs longest wins.
  // Apple's billing grace period keeps access after a failed renewal until grace_period_expires_date.
  const until = (s: RcSubscription) => {
    if (!s.expires_date) return null;
    return s.grace_period_expires_date && Date.parse(s.grace_period_expires_date) > Date.parse(s.expires_date) ? s.grace_period_expires_date : s.expires_date;
  };
  const records = Object.entries(subscriber?.subscriptions ?? {})
    .filter(([, s]) => storeProvider(s?.store) && !s?.refunded_at && (s?.is_sandbox !== true || sandboxProAllowed(authUserId)))
    .sort(([, x], [, y]) => (until(y) ? Date.parse(until(y)!) : Infinity) - (until(x) ? Date.parse(until(x)!) : Infinity));
  const [product, sub] = ent && records.length ? records[0] : [null, undefined];
  const expires = sub ? until(sub) : null;
  const eligible = Boolean(ent && sub);
  const active = eligible && (expires === null || Date.parse(expires) > Date.now());
  // The row is this sync's to write unless it is a direct card plan (Stripe's webhook owns those). A card row that
  // reached this point is not granting Pro (ended, past_due, unpaid): an active App Store plan is recorded over it and
  // its Stripe ids survive the merge, so account deletion, checkout and the portal still find the customer, and the
  // webhook ignores late states for that plan while the Apple one is live. Red team 2026-10-02 (R1-R3).
  const cardRow = current?.provider === 'stripe' && Boolean(current.stripe_subscription_id);
  if (!eligible) {
    // The entitlement is gone, or it never came from a store that counts (a Test Store row granted before this fix):
    // a row mirrored from RevenueCat stops granting Pro.
    if (current && !cardRow && ['active', 'trialing'].includes(current.status)) {
      const refunded = Object.values(subscriber?.subscriptions ?? {}).some((s) => storeProvider(s?.store) && s?.refunded_at);
      await upsertSubscription({ identity_id: identityId, provider: current.provider, status: refunded ? 'refunded' : 'expired' });
    }
    await reconcilePaidPeriod(identityId, authUserId, subscriber, paidEvent);
    return false;
  }
  // Nothing to record over a card row: an expired store record never replaces the card plan's own state.
  if (cardRow && !active) {
    await reconcilePaidPeriod(identityId, authUserId, subscriber, paidEvent);
    return false;
  }
  const periodType = ['normal', 'trial', 'intro', 'prepaid'].includes(String(sub?.period_type)) ? String(sub?.period_type) : null;
  await upsertSubscription({
    identity_id: identityId, provider: storeProvider(sub?.store) ?? 'apple', status: !active ? 'expired' : periodType === 'trial' ? 'trialing' : 'active',
    product_id: product, current_period_end: expires, environment: sub?.is_sandbox === true ? 'sandbox' : 'production', period_type: periodType,
  });
  await reconcilePaidPeriod(identityId, authUserId, subscriber, paidEvent);
  return active;
}
