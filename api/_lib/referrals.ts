// ============================================================
// Invite a friend (docs/ai/2026-09-29-bobby-intelligence-brief.md, network test of 2026-09-29).
// Every account gets one invite code. A friend who opens the link and then creates a new Apple/Google
// account adds REFERRAL.rewardDays of Bobby Pro to the inviter, stacked, for at most REFERRAL.maxFriends
// friends. The rules are enforced in bobby_referral_claim (20260929150000): new account only, once per
// friend, never oneself or a two-way swap, atomic at the fifth slot.
// ============================================================
import { randomInt } from 'node:crypto';
import { bobbyRest, bobbyServiceHeaders } from './bobby-db.js';
import { REFERRAL } from './desk-levels.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1
export const isReferralCode = (v: unknown): v is string => typeof v === 'string' && /^[A-HJ-NP-Z2-9]{8}$/.test(v);
const newCode = () => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

export interface ReferralStatus { code: string; url: string; accepted: number; max: number; rewardDays: number; proUntil: string | null; proSource: 'admin' | 'referral' | null; friends: Array<{ joinedAt: string }> }
export type ClaimResult = 'claimed' | 'invalid_code' | 'self' | 'account_required' | 'not_new' | 'already_claimed' | 'inviter_full' | 'invalid_invitee';

async function rows<T>(path: string): Promise<T[]> {
  const r = await fetch(bobbyRest(path), { headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`referrals ${r.status}`);
  return (await r.json()) as T[];
}

/** This account's invite code, created on first use. */
export async function referralCode(identityId: string): Promise<string> {
  const have = await rows<{ code: string }>(`bobby_referral_codes?identity_id=eq.${identityId}&select=code`);
  if (have[0]) return have[0].code;
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(bobbyRest('bobby_referral_codes?on_conflict=identity_id'), {
      method: 'POST', headers: bobbyServiceHeaders({ Prefer: 'resolution=ignore-duplicates,return=minimal' }),
      body: JSON.stringify({ identity_id: identityId, code: newCode() }), signal: AbortSignal.timeout(4000),
    });
    // 409: the random code collided with someone else's (the identity conflict is ignored above).
    if (!r.ok && r.status !== 409) throw new Error(`referral code ${r.status}`);
    const now = await rows<{ code: string }>(`bobby_referral_codes?identity_id=eq.${identityId}&select=code`);
    if (now[0]) return now[0].code;
  }
  throw new Error('referral code unavailable');
}

export async function referralStatus(identityId: string, origin: string): Promise<ReferralStatus> {
  const code = await referralCode(identityId);
  const [friends, grant] = await Promise.all([
    rows<{ created_at: string }>(`bobby_referrals?inviter_id=eq.${identityId}&select=created_at&order=created_at.asc&limit=${REFERRAL.maxFriends}`),
    rows<{ pro_until: string; source: string }>(`bobby_pro_grants?identity_id=eq.${identityId}&select=pro_until,source`),
  ]);
  const until = grant[0]?.pro_until ? new Date(grant[0].pro_until) : null;
  const active = !!until && until.getTime() > Date.now();
  return {
    // A new URL lets messaging apps fetch the refreshed share card for an existing code.
    code, url: `${origin}/desk?ref=${code}&v=2`, accepted: friends.length, max: REFERRAL.maxFriends, rewardDays: REFERRAL.rewardDays,
    proUntil: active ? until!.toISOString() : null,
    proSource: active && (grant[0]?.source === 'admin' || grant[0]?.source === 'referral') ? grant[0].source : null,
    friends: friends.map((f) => ({ joinedAt: new Date(f.created_at).toISOString() })),
  };
}

export async function claimReferral(inviteeId: string, code: string): Promise<ClaimResult> {
  const r = await fetch(bobbyRest('rpc/bobby_referral_claim'), {
    method: 'POST', headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(5000),
    body: JSON.stringify({ p_invitee: inviteeId, p_code: code, p_reward_days: REFERRAL.rewardDays, p_max: REFERRAL.maxFriends, p_new_account_days: REFERRAL.newAccountDays }),
  });
  if (!r.ok) throw new Error(`referral claim ${r.status}`);
  const body = (await r.json()) as { code?: string };
  const known: ClaimResult[] = ['claimed', 'invalid_code', 'self', 'account_required', 'not_new', 'already_claimed', 'inviter_full', 'invalid_invitee'];
  return known.includes(body.code as ClaimResult) ? (body.code as ClaimResult) : 'invalid_code';
}
