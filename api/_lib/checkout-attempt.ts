import { bobbyRest, bobbyServiceHeaders } from './bobby-db.js';

type Claim =
  | { state: 'blocked' | 'pending' | 'deleting' }
  | { state: 'ready'; url: string; sessionId: string; expiresAt: number }
  | { state: 'create'; attemptId: string; customer: string; price: string; origin: string; expiresAt: number };

async function rpc(name: string, body: Record<string, unknown>): Promise<unknown> {
  const r = await fetch(bobbyRest(`rpc/${name}`), {
    method: 'POST', headers: bobbyServiceHeaders(), body: JSON.stringify(body), signal: AbortSignal.timeout(4000),
  });
  if (!r.ok) throw new Error(`${name} ${r.status}`);
  return r.json();
}

/** A persisted attempt locks checkout creation across serverless instances. Missing migration fails closed. */
export async function claimCheckout(identity: string, customer: string, price: string, origin: string): Promise<Claim> {
  const result = await rpc('bobby_checkout_claim', { p_identity: identity, p_customer: customer, p_price: price, p_origin: origin });
  if (!result || typeof result !== 'object') throw new Error('invalid checkout claim');
  const row = result as Record<string, unknown>;
  if (row.state === 'blocked' || row.state === 'pending' || row.state === 'deleting') return { state: row.state };
  if (row.state === 'ready' && typeof row.url === 'string' && row.url.startsWith('https://checkout.stripe.com/')
      && typeof row.sessionId === 'string' && /^cs_[A-Za-z0-9_]+$/.test(row.sessionId)
      && typeof row.expiresAt === 'number' && Number.isInteger(row.expiresAt)) {
    return { state: 'ready', url: row.url, sessionId: row.sessionId, expiresAt: row.expiresAt };
  }
  if (row.state === 'create' && typeof row.attemptId === 'string' && /^[0-9a-f-]{36}$/i.test(row.attemptId)
      && typeof row.customer === 'string' && /^cus_[A-Za-z0-9]+$/.test(row.customer)
      && typeof row.price === 'string' && /^price_[A-Za-z0-9]+$/.test(row.price)
      && typeof row.origin === 'string' && (/^https:\/\//.test(row.origin) || /^http:\/\/localhost:\d{2,5}$/.test(row.origin))
      && typeof row.expiresAt === 'number' && Number.isInteger(row.expiresAt)) {
    return row as Claim;
  }
  throw new Error('invalid checkout claim');
}

export async function completeCheckout(identity: string, attemptId: string, url: string, sessionId: string): Promise<void> {
  const ok = await rpc('bobby_checkout_complete', { p_identity: identity, p_attempt: attemptId, p_url: url, p_session: sessionId });
  if (ok !== true) throw new Error('checkout completion not stored');
}

/** Account deletion uses the reserved customer even before a subscription row exists. */
export async function blockCheckoutForDeletion(identity: string): Promise<{ customer: string | null; sessionId: string | null }> {
  const row = await rpc('bobby_checkout_block_for_deletion', { p_identity: identity });
  if (!row || typeof row !== 'object') throw new Error('invalid checkout deletion block');
  const value = row as Record<string, unknown>;
  if ((value.customer !== null && typeof value.customer !== 'string') ||
      (value.sessionId !== null && typeof value.sessionId !== 'string')) throw new Error('invalid checkout deletion block');
  return { customer: value.customer as string | null, sessionId: value.sessionId as string | null };
}
