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
// General callers fail open. Paid-provider budget callers opt into fail-closed.
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
}

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
  options: { failClosed?: boolean } = {},
): Promise<PersistentLimitResult> {
  const openResult = { limited: false, remaining: limit, resetAt: Date.now() + windowSec * 1000 };
  const unavailable = options.failClosed ? { ...openResult, limited: true, remaining: 0 } : openResult;
  if (!SB_URL || !SB_KEY) return unavailable;

  const key = `rl:${scope}:${id}`;
  try {
    const nowIso = new Date().toISOString();
    const getUrl =
      `${SB_URL}/rest/v1/api_cache` +
      `?cache_key=eq.${encodeURIComponent(key)}` +
      `&expires_at=gt.${encodeURIComponent(nowIso)}` +
      `&select=payload,expires_at&limit=1`;
    const getRes = await fetch(getUrl, { headers: headers(), signal: AbortSignal.timeout(3000) });
    if (!getRes.ok) return unavailable;
    const rows = (await getRes.json()) as Array<{ payload: { count?: number }; expires_at: string }>;

    if (!Array.isArray(rows)) return unavailable;
    const row = rows.length > 0 ? rows[0] : null;
    if (row && (!Number.isSafeInteger(row.payload?.count) || Number(row.payload.count) < 0 || !Number.isFinite(Date.parse(row.expires_at)))) return unavailable;
    const count = (row?.payload?.count ?? 0) + 1;
    const expiresAt = row?.expires_at ?? new Date(Date.now() + windowSec * 1000).toISOString();

    const write = await fetch(`${SB_URL}/rest/v1/api_cache?on_conflict=cache_key`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
      headers: { ...headers(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        cache_key: key,
        payload: { count },
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!write.ok) return unavailable;
    return {
      limited: count > limit,
      remaining: Math.max(0, limit - count),
      resetAt: new Date(expiresAt).getTime(),
    };
  } catch {
    return unavailable;
  }
}
