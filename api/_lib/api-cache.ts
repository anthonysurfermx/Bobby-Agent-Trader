import { bobbyDbUrlOptional, bobbyServiceKeyOptional } from './bobby-db.js';
// ============================================================
// api-cache — thin TTL wrapper over Supabase `api_cache` table.
// Designed for responses that are safe to share across agents and across
// public dashboards (e.g. Polymarket leaderboard/consensus), not for
// per-user or per-wallet data.
//
// Fails open: if Supabase is unreachable, callers get a cache miss and
// fall through to the live fetch. Never throws.
// ============================================================

const SB_URL = bobbyDbUrlOptional();
const SB_KEY = bobbyServiceKeyOptional();

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
    const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(4000) });
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
      signal: AbortSignal.timeout(4000),
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
 * Atomically claims `key` for `ttlSec` (rpc/bobby_cache_claim): true = this caller holds it now, false = someone
 * else holds an unexpired claim, null = the claim could not be made (no credentials, storage down). Never throws.
 */
export async function claimCache(key: string, ttlSec: number, payload: unknown = {}): Promise<boolean | null> {
  if (!hasCreds()) return null;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/bobby_cache_claim`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ p_key: key, p_ttl_seconds: ttlSec, p_payload: payload }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const claimed = await res.json();
    return typeof claimed === 'boolean' ? claimed : null;
  } catch {
    return null;
  }
}

/** Drops `key` (a claim that did not lead anywhere). With `nonce`, only while the stored payload still carries that
 *  nonce: a claim that expired and was taken by someone else is never released by its former holder. False when the
 *  delete could not be confirmed. Never throws. */
export async function releaseCache(key: string, nonce?: string): Promise<boolean> {
  if (!hasCreds()) return false;
  try {
    const owner = nonce ? `&payload->>nonce=eq.${encodeURIComponent(nonce)}` : '';
    const res = await fetch(`${SB_URL}/rest/v1/api_cache?cache_key=eq.${encodeURIComponent(key)}${owner}`, {
      method: 'DELETE',
      headers: { ...headers(), Prefer: 'return=minimal' },
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
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
