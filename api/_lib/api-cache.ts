// ============================================================
// api-cache — thin TTL wrapper over Supabase `api_cache` table.
// Designed for responses that are safe to share across agents and across
// public dashboards (e.g. Polymarket leaderboard/consensus), not for
// per-user or per-wallet data.
//
// Fails open: if Supabase is unreachable, callers get a cache miss and
// fall through to the live fetch. Never throws.
// ============================================================

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function hasCreds(): boolean {
  return Boolean(SB_URL && SB_KEY);
}

function headers() {
  return {
    'Content-Type': 'application/json',
    apikey: SB_KEY as string,
    Authorization: `Bearer ${SB_KEY as string}`,
  };
}

export async function getCache<T>(key: string): Promise<T | null> {
  if (!hasCreds()) return null;
  try {
    const nowIso = new Date().toISOString();
    const url =
      `${SB_URL}/rest/v1/api_cache` +
      `?cache_key=eq.${encodeURIComponent(key)}` +
      `&expires_at=gt.${encodeURIComponent(nowIso)}` +
      `&select=payload&limit=1`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return (rows[0]?.payload ?? null) as T | null;
  } catch {
    return null;
  }
}

export async function setCache<T>(key: string, payload: T, ttlSec: number): Promise<void> {
  if (!hasCreds()) return;
  try {
    const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();
    // Upsert via PostgREST: merge-duplicates on the primary key.
    await fetch(`${SB_URL}/rest/v1/api_cache?on_conflict=cache_key`, {
      method: 'POST',
      headers: {
        ...headers(),
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        cache_key: key,
        payload,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }),
    });
  } catch {
    // fire-and-forget — a failed cache write must never break the caller
  }
}

/**
 * Wrap a fetcher with a TTL cache. On hit, returns the cached payload.
 * On miss, invokes `fetcher`, writes the result to cache, and returns it.
 * The fetcher is NOT called if a valid cached entry exists.
 */
export async function cached<T>(key: string, ttlSec: number, fetcher: () => Promise<T>): Promise<T> {
  const hit = await getCache<T>(key);
  if (hit !== null) return hit;
  const fresh = await fetcher();
  // Only cache non-empty results to avoid locking in an outage snapshot.
  if (fresh !== undefined && fresh !== null) {
    if (!Array.isArray(fresh) || fresh.length > 0) {
      await setCache(key, fresh, ttlSec);
    }
  }
  return fresh;
}
