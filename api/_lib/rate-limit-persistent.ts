import { bobbyDbUrlOptional, bobbyServiceKeyOptional } from './bobby-db.js';
// ============================================================
// rate-limit-persistent — cross-instance rate limiter backed by the
// `api_cache` table. Complements _lib/rate-limit.ts (in-memory, per
// lambda): the in-memory limiter is the free first line, this one
// survives cold starts and covers all instances.
//
// Read-modify-write on PostgREST — not atomic, so a burst can slightly
// overshoot the cap. That's fine: this blunts abuse, it is not a
// strict quota.
//
// Fails open: if Supabase is unreachable, callers are not limited.
// ============================================================

const SB_URL = bobbyDbUrlOptional();
const SB_KEY = bobbyServiceKeyOptional();

function headers() {
  return {
    'Content-Type': 'application/json',
    apikey: SB_KEY as string,
    Authorization: `Bearer ${SB_KEY as string}`,
  };
}

export interface PersistentLimitResult {
  limited: boolean;
  remaining: number;
  resetAt: number; // epoch ms
  /** False when the backing store could not confirm this hit. */
  available: boolean;
}

// A voice request checks this store twice before synthesis. Keep both checks
// inside the mobile client's deadline, even when Supabase stalls.
const STORE_TIMEOUT_MS = 900;

/**
 * Count a hit against `scope:id` and report whether the caller is over
 * the cap. Window is fixed (starts at first hit, resets after windowSec).
 *
 * Use a stable `id` per caller (IP) or the literal 'global' for a
 * shared cap across all callers.
 */
export async function checkPersistentLimit(
  scope: string,
  id: string,
  limit: number,
  windowSec: number,
): Promise<PersistentLimitResult> {
  const openResult = { limited: false, remaining: limit, resetAt: Date.now() + windowSec * 1000, available: false };
  if (!SB_URL || !SB_KEY) return openResult;

  const key = `rl:${scope}:${id}`;
  try {
    const signal = AbortSignal.timeout(STORE_TIMEOUT_MS);
    const nowIso = new Date().toISOString();
    const getUrl =
      `${SB_URL}/rest/v1/api_cache` +
      `?cache_key=eq.${encodeURIComponent(key)}` +
      `&expires_at=gt.${encodeURIComponent(nowIso)}` +
      `&select=payload,expires_at&limit=1`;
    const getRes = await fetch(getUrl, { headers: headers(), signal });
    if (!getRes.ok) return openResult;
    const rows = (await getRes.json()) as Array<{ payload: { count?: number }; expires_at: string }>;

    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    const count = (row?.payload?.count ?? 0) + 1;
    const expiresAt = row?.expires_at ?? new Date(Date.now() + windowSec * 1000).toISOString();

    const saveRes = await fetch(`${SB_URL}/rest/v1/api_cache?on_conflict=cache_key`, {
      method: 'POST',
      headers: { ...headers(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      signal,
      body: JSON.stringify({
        cache_key: key,
        payload: { count },
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!saveRes.ok) return openResult;

    return {
      limited: count > limit,
      remaining: Math.max(0, limit - count),
      resetAt: new Date(expiresAt).getTime(),
      available: true,
    };
  } catch {
    return openResult;
  }
}
