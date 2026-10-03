// ============================================================
// Small Stripe REST helpers shared by checkout, the webhook and account deletion (payments security audit
// 2026-10-02). One Stripe customer per Bobby identity, and "every live subscription of this identity" is
// answered by Stripe itself (customer list + metadata search), never by our single subscription row.
// ============================================================

const key = () => (process.env.STRIPE_SECRET_KEY || '').trim();
export const stripeConfigured = () => Boolean(key() && (process.env.STRIPE_PRICE_ID || '').trim());

/** Statuses after which a Stripe subscription can never charge again. */
export const STRIPE_TERMINAL = new Set(['canceled', 'incomplete_expired']);

export class StripeError extends Error { constructor(public status: number, message: string) { super(message); } }

export async function stripeApi<T = Record<string, unknown>>(method: 'GET' | 'POST' | 'DELETE', path: string,
  form?: Record<string, string>, idempotencyKey?: string): Promise<T> {
  const k = key();
  if (!k) throw new StripeError(0, 'stripe not configured');
  const body = form ? new URLSearchParams(form).toString() : undefined;
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method, body, signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${k}`, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
  });
  const json = (await r.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!r.ok) throw new StripeError(r.status, `stripe ${method} ${path.split('?')[0]} ${r.status} ${json?.error?.message ?? ''}`.trim());
  return json;
}

const q = (s: string) => s.replace(/'/g, "\\'");
const missingCustomer = (e: unknown) => e instanceof StripeError && (e.status === 404 || /no such customer/i.test(e.message));

/** The identity's Stripe customer without ever creating one: the stored id, else a metadata search. */
export async function findCustomer(identityId: string, stored: string | null | undefined): Promise<string | null> {
  if (stored) return stored;
  const found = await stripeApi<{ data?: Array<{ id: string }> }>('GET', `customers/search?query=${encodeURIComponent(`metadata['identity_id']:'${q(identityId)}'`)}&limit=1`);
  return found.data?.[0]?.id ?? null;
}

/** The identity's Stripe customer: the stored one, else one found by metadata, else a new one (idempotent per identity). */
export async function customerFor(identityId: string, stored: string | null | undefined, email?: string | null): Promise<string> {
  const known = await findCustomer(identityId, stored).catch(() => null);
  if (known) return known;
  const create = (key: string) => stripeApi<{ id: string }>('POST', 'customers',
    { 'metadata[identity_id]': identityId, ...(email ? { email } : {}) }, key);
  try { return (await create(`bobby-customer-${identityId}`)).id; }
  catch (e) {
    // Stripe caches a 5xx for an idempotency key for 24h: look again, then retry once under an hourly key.
    if (!(e instanceof StripeError && e.status >= 500)) throw e;
    const again = await findCustomer(identityId, null).catch(() => null);
    if (again) return again;
    return (await create(`bobby-customer-${identityId}-${Math.floor(Date.now() / 3_600_000)}`)).id;
  }
}

interface Sub { id: string; status: string }

/** Every Stripe subscription that belongs to the identity: by customer, by metadata, and the one we stored. */
export async function subscriptionsFor(identityId: string, customerId: string | null | undefined, storedSubId: string | null | undefined): Promise<Sub[]> {
  const seen = new Map<string, Sub>();
  if (customerId) {
    // A customer Stripe does not know (deleted, or a test-mode id) has no subscriptions under this key.
    const list = await stripeApi<{ data?: Sub[] }>('GET', `subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=100`)
      .catch((e) => { if (missingCustomer(e)) return { data: [] as Sub[] }; throw e; });
    for (const s of list.data ?? []) seen.set(s.id, s);
  }
  // Defense in depth (a second customer from an old double checkout). Search can be unavailable: not fatal.
  const searched = await stripeApi<{ data?: Sub[] }>('GET', `subscriptions/search?query=${encodeURIComponent(`metadata['identity_id']:'${q(identityId)}'`)}&limit=100`).catch(() => null);
  for (const s of searched?.data ?? []) seen.set(s.id, s);
  if (storedSubId && !seen.has(storedSubId)) {
    try { const s = await stripeApi<Sub>('GET', `subscriptions/${encodeURIComponent(storedSubId)}`); seen.set(s.id, s); }
    catch (e) { if (!(e instanceof StripeError && e.status === 404)) throw e; }
  }
  return [...seen.values()];
}

/** Cancels (immediately) every subscription of the identity that can still charge. Throws if any cannot be confirmed. */
export async function cancelAllFor(identityId: string, customerId: string | null | undefined, storedSubId: string | null | undefined): Promise<number> {
  let cancelled = 0;
  for (const s of await subscriptionsFor(identityId, customerId, storedSubId)) {
    if (STRIPE_TERMINAL.has(s.status)) continue;
    try { await stripeApi('DELETE', `subscriptions/${encodeURIComponent(s.id)}`); cancelled++; }
    catch (e) { if (!(e instanceof StripeError && e.status === 404)) throw e; }
  }
  return cancelled;
}

/** Expires every checkout of the customer that could still be paid (a tab left open before the account was deleted). */
export async function expireOpenCheckouts(customerId: string): Promise<number> {
  const open = await stripeApi<{ data?: Array<{ id: string }> }>('GET', `checkout/sessions?customer=${encodeURIComponent(customerId)}&status=open&limit=100`)
    .catch((e) => { if (missingCustomer(e)) return { data: [] as Array<{ id: string }> }; throw e; });
  let expired = 0;
  for (const s of open.data ?? []) {
    try { await stripeApi('POST', `checkout/sessions/${encodeURIComponent(s.id)}/expire`); expired++; }
    catch (e) { if (!(e instanceof StripeError && (e.status === 404 || e.status === 400))) throw e; }
  }
  return expired;
}

export interface BillingRow { provider?: string; status?: string; stripe_customer_id?: string | null; stripe_subscription_id?: string | null }

/**
 * Before an account is deleted: cancel every Stripe subscription that can still charge and expire open checkouts.
 * Throws only when a card plan may still charge and Stripe could not confirm it stopped, so the caller deletes nothing
 * and the user retries. Anything else Stripe could not confirm (an outage for an account whose card plan already
 * ended, or card payments switched off) is returned as `unverified` so the deletion goes ahead and the owner checks
 * it by hand: deletion is never blocked for good (App Store 5.1.1(v)). Red team 2026-10-02.
 */
export async function stopBillingFor(identityId: string, row: BillingRow | null): Promise<{ cancelled: number; unverified: string | null }> {
  const hasIds = Boolean(row?.stripe_customer_id || row?.stripe_subscription_id);
  if (!key() && !hasIds) return { cancelled: 0, unverified: null };
  // The row's own word that the card plan may still charge. An Apple-labelled row carrying a Stripe id says nothing
  // about that plan, so it counts as possibly live.
  const mayCharge = Boolean(row?.stripe_subscription_id) && (row?.provider !== 'stripe' || !STRIPE_TERMINAL.has(String(row?.status)));
  const problems: string[] = [];
  const note = (e: unknown) => problems.push(e instanceof Error ? e.message : String(e));
  let customer = row?.stripe_customer_id ?? null;
  if (!customer) customer = await findCustomer(identityId, null).catch((e) => { note(e); return null; });
  let cancelled = 0;
  try { cancelled = await cancelAllFor(identityId, customer, row?.stripe_subscription_id); }
  catch (e) {
    // No key at all cannot be retried into success: go ahead and report it rather than block deletion for ever.
    if (mayCharge && !(e instanceof StripeError && e.status === 0)) throw e;
    note(e);
  }
  if (customer) await expireOpenCheckouts(customer).catch(note);
  return { cancelled, unverified: problems.length ? problems.join('; ').slice(0, 300) : null };
}
