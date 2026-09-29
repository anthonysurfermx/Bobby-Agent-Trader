// The web side of metered access (api/_lib/access.ts): who is asking and what they have left.
// Every desk read and every /api/bobby-access call carries the install id, the platform and the
// account credential (Apple/Google session first, the wallet session second).
import { bobbySupabase } from '@/lib/bobby-db-client';
import { progressHeaders } from '@/lib/companions/sync';

export type Tier = 'anon' | 'free' | 'pro';
export interface Access { tier: Tier; used: number | null; limit: number | null; remaining: number | null; resetsAt: string | null; paywall: boolean }
/** The analysis levels (api/_lib/desk-levels.ts). Rápido rides the read meter; Profundo and Máximo have their own. */
export type DeskLevel = 'rapido' | 'profundo' | 'maximo';
export type PremiumLevel = Exclude<DeskLevel, 'rapido'>;
export interface LevelMeter { used: number; limit: number; remaining: number; windowDays: number; resetsAt: string | null }
export interface LevelState { tier: Tier; levels: Record<PremiumLevel, LevelMeter> }
/** Your invite link: each friend who creates an account through it adds `rewardDays` of Bobby Pro, up to `max`. */
export interface Referral { code: string; url: string; accepted: number; max: number; rewardDays: number; proUntil: string | null; friends: Array<{ joinedAt: string }> }
export interface AccessState {
  access: Access; signedIn: boolean;
  subscription: { provider: 'stripe' | 'apple'; status: string; currentPeriodEnd: string | null } | null;
  payments: { stripe: boolean; apple: boolean };
  levels?: LevelState | null; referral?: Referral | null;
  /** [uses, window days] per plan and premium level, and the invite terms (api/_lib/desk-levels.ts). */
  plans?: { limits: Record<Tier, Record<PremiumLevel, [number, number]>>; referral: { maxFriends: number; rewardDays: number }; freeReadsPerWeek: number | null };
}

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

// ---- invite a friend: the link carries ?ref=CODE; the code waits here until the friend has an account ----
const REF_KEY = 'bobby:ref:v1';
const isCode = (v: unknown): v is string => typeof v === 'string' && /^[A-HJ-NP-Z2-9]{8}$/.test(v);

/** Keep an invite code from the URL (?ref=) and clean the address bar. Returns the stored code, if any. */
export function captureReferral(): string | null {
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get('ref')?.trim().toUpperCase();
    if (isCode(fromUrl)) localStorage.setItem(REF_KEY, fromUrl);
    if (url.searchParams.has('ref')) { url.searchParams.delete('ref'); window.history.replaceState(window.history.state, '', url.toString()); }
    const stored = localStorage.getItem(REF_KEY);
    return isCode(stored) ? stored : null;
  } catch { return null; }
}
export function pendingReferral(): string | null {
  try { const v = localStorage.getItem(REF_KEY); return isCode(v) ? v : null; } catch { return null; }
}
function forgetReferral() { try { localStorage.removeItem(REF_KEY); } catch { /* private mode */ } }

export type ClaimResult = 'claimed' | 'invalid_code' | 'self' | 'account_required' | 'not_new' | 'already_claimed' | 'inviter_full' | 'invalid_invitee';
/** Accept the stored invitation for the signed-in account. Forgets the code on any final answer; keeps it on a transient failure. */
export async function claimPendingReferral(): Promise<ClaimResult | null> {
  const code = pendingReferral();
  if (!code) return null;
  try {
    const r = await fetch('/api/bobby-access', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await accessHeaders()) }, body: JSON.stringify({ action: 'referral-claim', code }) });
    if (r.status === 401 || r.status >= 500) return null;
    const body = (await r.json().catch(() => ({}))) as { result?: ClaimResult };
    forgetReferral();
    return body.result ?? 'invalid_code';
  } catch { return null; }
}

