// The web side of metered access (api/_lib/access.ts): who is asking and what they have left.
// Every desk read and every /api/bobby-access call carries the install id, the platform and the
// account credential (Apple/Google session first, the wallet session second).
import { bobbySupabase } from '@/lib/bobby-db-client';
import { progressHeaders } from '@/lib/companions/sync';

export type Tier = 'anon' | 'free' | 'pro';
export interface Access { tier: Tier; used: number | null; limit: number | null; remaining: number | null; resetsAt: string | null; paywall: boolean }
export interface AccessState { access: Access; signedIn: boolean; subscription: { provider: 'stripe' | 'apple'; status: string; currentPeriodEnd: string | null } | null; payments: { stripe: boolean; apple: boolean } }

const DEVICE_KEY = 'bobby:device:v1';

export function deviceId(): string {
  try {
    const have = localStorage.getItem(DEVICE_KEY);
    if (have && /^[A-Za-z0-9-]{16,64}$/.test(have)) return have;
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export async function accessHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = { 'x-bobby-device': deviceId(), 'x-bobby-platform': 'web' };
  try {
    const { data } = await bobbySupabase().auth.getSession();
    if (data.session?.access_token) { h.Authorization = `Bearer ${data.session.access_token}`; return h; }
  } catch { /* not configured: wallet or anonymous */ }
  const wallet = progressHeaders();
  if (wallet?.['x-bobby-session']) h['x-bobby-session'] = wallet['x-bobby-session'];
  else if (wallet?.Authorization) h.Authorization = wallet.Authorization;
  return h;
}

export async function fetchAccess(): Promise<AccessState | null> {
  try {
    const r = await fetch('/api/bobby-access', { headers: await accessHeaders() });
    if (!r.ok) return null;
    return (await r.json()) as AccessState;
  } catch { return null; }
}

/** Opens Stripe Checkout (or the billing portal) for Bobby Pro; returns an error message when it cannot. */
export async function startBilling(action: 'checkout' | 'portal'): Promise<string | null> {
  try {
    const r = await fetch('/api/bobby-access', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await accessHeaders()) }, body: JSON.stringify({ action }) });
    const body = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
    if (r.ok && body.url) { window.location.assign(body.url); return null; }
    return body.error ?? 'Payments are temporarily unavailable.';
  } catch { return 'Payments are temporarily unavailable.'; }
}
