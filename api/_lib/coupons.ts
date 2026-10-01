// ============================================================
// Coupons that gift extra usage (migration 20261001160000). The owner creates a code by SQL
// (docs/infra/2026-10-01-release-15-handoff.md); an Apple/Google account redeems it once on the web
// (/redeem → POST /api/bobby-access { action: 'redeem-coupon', code }). The rules live in
// bobby_redeem_coupon: account only, once per account, cap and expiry, atomic at the last slot.
// ============================================================
import { bobbyRest, bobbyServiceHeaders } from './bobby-db.js';

export type RedeemResult = 'redeemed' | 'invalid_code' | 'expired' | 'exhausted' | 'already_redeemed' | 'account_required';
export interface UsageGift { reads: number; profundo: number; maximo: number }
export interface Redemption { result: RedeemResult; granted: UsageGift | null; bonus: UsageGift | null }

/** Uppercase, no spaces: "amigos 20" and "AMIGOS20" are the same code. */
export const normalizeCoupon = (v: unknown): string => (typeof v === 'string' ? v.toUpperCase().replace(/\s+/g, '') : '');
export const isCouponCode = (v: string): boolean => /^[A-Z0-9][A-Z0-9-]{3,31}$/.test(v);

const RESULTS: RedeemResult[] = ['redeemed', 'invalid_code', 'expired', 'exhausted', 'already_redeemed', 'account_required'];

function gift(raw: unknown): UsageGift | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  return { reads: n(g.reads), profundo: n(g.profundo), maximo: n(g.maximo) };
}

export async function redeemCoupon(identityId: string, code: string): Promise<Redemption> {
  const r = await fetch(bobbyRest('rpc/bobby_redeem_coupon'), {
    method: 'POST', headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(5000),
    body: JSON.stringify({ p_identity: identityId, p_code: code }),
  });
  if (!r.ok) throw new Error(`coupon redeem ${r.status}`);
  const body = (await r.json()) as { result?: string; granted?: unknown; bonus?: unknown };
  const result = RESULTS.includes(body.result as RedeemResult) ? (body.result as RedeemResult) : 'invalid_code';
  return { result, granted: result === 'redeemed' ? gift(body.granted) : null, bonus: gift(body.bonus) };
}
