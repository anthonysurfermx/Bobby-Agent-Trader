// The web side of metered access (api/_lib/access.ts): who is asking and what they have left.
// Every desk read and every /api/bobby-access call carries the install id, the platform and the
// account credential (Apple/Google session first, the wallet session second).
import { bobbySupabase } from '@/lib/bobby-db-client';
import { progressHeaders } from '@/lib/companions/sync';
import { t } from '@/lib/companions/i18n';
import { clientLanguage, clientLocale } from '@/lib/client-language';
import { browserDeviceId } from './device-id';

export type Tier = 'anon' | 'free' | 'pro';
/** `bonus`: gifted Quick reads, separate from `remaining`; Pro keeps its balance while reads are unlimited. */
export interface Access { tier: Tier; used: number | null; limit: number | null; remaining: number | null; resetsAt: string | null; paywall: boolean; bonus?: number }
/** The analysis levels (api/_lib/desk-levels.ts). Rápido rides the read meter; Profundo and Máximo have their own. */
export type DeskLevel = 'rapido' | 'profundo' | 'maximo';
export type PremiumLevel = Exclude<DeskLevel, 'rapido'>;
export interface LevelMeter { used: number; limit: number; remaining: number; windowDays: number; resetsAt: string | null; bonus?: number }
export interface LevelState { tier: Tier; levels: Record<PremiumLevel, LevelMeter> }
/** Your invite link: each friend who creates an account through it adds `rewardDays` of Bobby Pro, up to `max`. */
export interface Referral { code: string; url: string; accepted: number; max: number; rewardDays: number; proUntil: string | null; proSource?: 'admin' | 'referral' | null; friends: Array<{ joinedAt: string }> }
export interface AccessState {
  access: Access; signedIn: boolean;
  subscription: { provider: 'stripe' | 'apple'; status: string; currentPeriodEnd: string | null; cardPlan?: boolean; appleActive?: boolean } | null;
  payments: { stripe: boolean; apple: boolean };
  levels?: LevelState | null; referral?: Referral | null;
  /** [uses, window days] per plan and premium level, and the invite terms (api/_lib/desk-levels.ts). */
  plans?: { limits: Record<Tier, Record<PremiumLevel, [number, number]>>; referral: { maxFriends: number; rewardDays: number }; freeReadsPerWeek: number | null };
}

export function deviceId(): string {
  return browserDeviceId();
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

export async function fetchAccess(headers?: Record<string, string>): Promise<AccessState | null> {
  try {
    const r = await fetch('/api/bobby-access', { headers: headers ?? await accessHeaders() });
    if (!r.ok) return null;
    return (await r.json()) as AccessState;
  } catch { return null; }
}

/** Opens Stripe Checkout (or the billing portal) for Bobby Pro; returns an error message when it cannot. */
function billingFailure(status?: number, error?: string, code?: string): string {
  if (code === 'already_pro') return t('You already have Bobby Pro.', 'Ya tienes Bobby Pro.', 'Você já tem o Bobby Pro.', 'Tu as déjà Bobby Pro.', 'Hai già Bobby Pro.', 'Du hast Bobby Pro bereits.');
  if (status === 401 || status === 403) return t('Sign in first: Bobby Pro belongs to your Bobby account.', 'Inicia sesión primero: Bobby Pro pertenece a tu cuenta de Bobby.', 'Entre primeiro: o Bobby Pro pertence à sua conta Bobby.', 'Connecte-toi d’abord : Bobby Pro est lié à ton compte Bobby.', 'Accedi prima: Bobby Pro appartiene al tuo account Bobby.', 'Melde dich zuerst an: Bobby Pro gehört zu deinem Bobby-Konto.');
  if (error === 'Card payments are not switched on yet.') return t('Card payments are not available yet.', 'Los pagos con tarjeta aún no están disponibles.', 'Os pagamentos com cartão ainda não estão disponíveis.', 'Les paiements par carte ne sont pas encore disponibles.', 'I pagamenti con carta non sono ancora disponibili.', 'Kartenzahlungen sind noch nicht verfügbar.');
  if (error === 'No card subscription on this account.') return t('This account has no card subscription to manage.', 'Esta cuenta no tiene una suscripción con tarjeta que administrar.', 'Esta conta não tem uma assinatura paga com cartão para gerenciar.', 'Ce compte n’a pas d’abonnement payé par carte à gérer.', 'Questo account non ha un abbonamento pagato con carta da gestire.', 'Für dieses Konto gibt es kein per Karte bezahltes Abo zu verwalten.');
  return t('Payments are temporarily unavailable. Please try again.', 'Los pagos no están disponibles por ahora. Inténtalo de nuevo.', 'Os pagamentos estão temporariamente indisponíveis. Tente novamente.', 'Les paiements sont momentanément indisponibles. Réessaie.', 'I pagamenti non sono disponibili al momento. Riprova.', 'Zahlungen sind vorübergehend nicht verfügbar. Versuche es erneut.');
}
export async function startBilling(action: 'checkout' | 'portal', market?: { symbol: string; timeframe: string }): Promise<string | null> {
  try {
    if (action === 'checkout') {
      // Load after this module initializes: the tracker shares accessHeaders and the install id.
      void import('@/lib/track').then(({ track }) => track('purchase_start', 'desk')).catch(() => {});
    }
    const params = new URLSearchParams(window.location.search);
    const r = await fetch('/api/bobby-access', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await accessHeaders()) }, body: JSON.stringify({ action, language: clientLanguage(), locale: clientLocale(), country: params.get('country'), symbol: market?.symbol ?? params.get('symbol'), timeframe: market?.timeframe ?? params.get('timeframe') }) });
    const body = (await r.json().catch(() => ({}))) as { url?: string; error?: string; code?: string; provider?: string };
    if (r.ok && body.url) { window.location.assign(body.url); return null; }
    // Already paying by card (e.g. a past_due renewal): open the billing portal to fix it instead of a dead end.
    if (action === 'checkout' && r.status === 409 && body.code === 'already_pro' && body.provider === 'stripe') return startBilling('portal', market);
    return billingFailure(r.status, body.error, body.code);
  } catch { return billingFailure(); }
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
    if (url.searchParams.has('ref')) {
      url.searchParams.delete('ref');
      if (url.searchParams.get('v') === '2') url.searchParams.delete('v');
      window.history.replaceState(window.history.state, '', url.toString());
    }
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
    // A wallet session is not an account yet: the code waits for the Apple/Google sign-in.
    if (body.result === 'account_required') return 'account_required';
    forgetReferral();
    return body.result ?? 'invalid_code';
  } catch { return null; }
}

// ---- coupons (api/_lib/coupons.ts): an Apple/Google account redeems a code once for extra reads ----
export type RedeemResult = 'redeemed' | 'invalid_code' | 'expired' | 'exhausted' | 'already_redeemed' | 'account_required' | 'rate_limited' | 'unavailable';
export interface UsageGift { reads: number; profundo: number; maximo: number }
export async function redeemCoupon(code: string): Promise<{ result: RedeemResult; granted: UsageGift | null }> {
  try {
    const r = await fetch('/api/bobby-access', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await accessHeaders()) }, body: JSON.stringify({ action: 'redeem-coupon', code }) });
    if (r.status === 429) return { result: 'rate_limited', granted: null };
    if (r.status === 401) return { result: 'account_required', granted: null };
    const body = (await r.json().catch(() => ({}))) as { result?: RedeemResult; granted?: UsageGift | null };
    if (r.status >= 500 || !body.result) return { result: 'unavailable', granted: null };
    return { result: body.result, granted: body.granted ?? null };
  } catch { return { result: 'unavailable', granted: null }; }
}

// After an Apple/Google sign-in started from /redeem or /admin, /auth/callback returns there instead of the desk.
const RETURN_KEY = 'bobby:return:v1';
const isReturnPath = (v: unknown): v is string =>
  typeof v === 'string' && (v === '/admin' || /^\/redeem(\?(code=[A-Z0-9-]{4,32}&)?lang=(en|es|pt|fr|it|de))?$/.test(v));
export function rememberReturn(path: string) { try { if (isReturnPath(path)) sessionStorage.setItem(RETURN_KEY, path); } catch { /* private mode */ } }
export function takeReturn(): string | null {
  try {
    const v = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return isReturnPath(v) ? v : null;
  } catch { return null; }
}
