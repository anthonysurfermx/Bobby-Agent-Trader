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

// Stripe Search uses backslashes to escape characters inside quoted values.
const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** The identity's Stripe customer: the stored one, else one found by metadata, else a new one (idempotent per identity). */
export async function customerFor(identityId: string, stored: string | null | undefined, email?: string | null): Promise<string> {
  if (stored) return stored;
  const found = await stripeApi<{ data?: Array<{ id: string }> }>('GET', `customers/search?query=${encodeURIComponent(`metadata['identity_id']:'${q(identityId)}'`)}&limit=1`).catch(() => null);
  if (found?.data?.[0]?.id) return found.data[0].id;
  const created = await stripeApi<{ id: string }>('POST', 'customers',
    { 'metadata[identity_id]': identityId, ...(email ? { email } : {}) }, `bobby-customer-${identityId}`);
  return created.id;
}

interface Sub { id: string; status: string }

/** An open subscription Checkout is payable even when no subscription exists yet. */
export async function expireCheckoutSession(sessionId: string): Promise<void> {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new Error('invalid Checkout session id');
  try { await stripeApi('POST', `checkout/sessions/${encodeURIComponent(sessionId)}/expire`); }
  catch (error) {
    // Expire can race completion or another expiry. Verify it is no longer payable.
    const session = await stripeApi<{ status?: string }>('GET', `checkout/sessions/${encodeURIComponent(sessionId)}`);
    if (session.status === 'open') throw error;
  }
}

async function customersFor(identityId: string, storedCustomerId: string | null | undefined): Promise<string[]> {
  const ids = new Set<string>();
  if (storedCustomerId) ids.add(storedCustomerId);
  let page: string | null = null;
  for (let i = 0; i < 100; i++) {
    const result = await stripeApi<{ data?: Array<{ id: string }>; next_page?: string | null }>('GET',
      `customers/search?query=${encodeURIComponent(`metadata['identity_id']:'${q(identityId)}'`)}&limit=100${page ? `&page=${encodeURIComponent(page)}` : ''}`);
    for (const customer of result.data ?? []) if (customer.id) ids.add(customer.id);
    if (!result.next_page) return [...ids];
    page = result.next_page;
  }
  throw new Error('Stripe customer pagination limit');
}

async function expireOpenCheckouts(customerId: string): Promise<void> {
  let after: string | null = null;
  for (let page = 0; page < 100; page++) {
    const result = await stripeApi<{ data?: Array<{ id: string; mode?: string }>; has_more?: boolean }>('GET',
      `checkout/sessions?customer=${encodeURIComponent(customerId)}&status=open&limit=100${after ? `&starting_after=${encodeURIComponent(after)}` : ''}`);
    const sessions = result.data ?? [];
    for (const session of sessions) if (session.mode === 'subscription') await expireCheckoutSession(session.id);
    if (!result.has_more) return;
    if (!sessions.length) throw new Error('Stripe Checkout pagination stalled');
    after = sessions[sessions.length - 1].id;
  }
  throw new Error('Stripe Checkout pagination limit');
}

/** Every Stripe subscription that belongs to the identity: by customer, by metadata, and the one we stored. */
export async function subscriptionsFor(identityId: string, customerId: string | null | undefined, storedSubId: string | null | undefined): Promise<Sub[]> {
  const seen = new Map<string, Sub>();
  if (customerId) {
    const list = await stripeApi<{ data?: Sub[] }>('GET', `subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=100`);
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
export async function cancelAllFor(identityId: string, customerId: string | null | undefined, storedSubId: string | null | undefined,
  checkoutCustomerId?: string | null): Promise<number> {
  const customers = await customersFor(identityId, customerId);
  if (checkoutCustomerId && !customers.includes(checkoutCustomerId)) customers.push(checkoutCustomerId);
  // Expire checkout first: otherwise deleting the account could leave a session
  // that charges an initial invoice after its owner and Pro access are gone.
  for (const id of customers) await expireOpenCheckouts(id);
  let cancelled = 0;
  const subscriptions = new Map<string, Sub>();
  for (const id of customers.length ? customers : [null]) {
    for (const sub of await subscriptionsFor(identityId, id, storedSubId)) subscriptions.set(sub.id, sub);
  }
  for (const s of subscriptions.values()) {
    if (STRIPE_TERMINAL.has(s.status)) continue;
    try { await stripeApi('DELETE', `subscriptions/${encodeURIComponent(s.id)}`); cancelled++; }
    catch (e) { if (!(e instanceof StripeError && e.status === 404)) throw e; }
  }
  return cancelled;
}
