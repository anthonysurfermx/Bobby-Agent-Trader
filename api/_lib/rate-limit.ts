// ============================================================
// rate-limit — per-IP rolling-window limiter, in-memory per lambda.
// Survives warm starts, resets on cold start. Good enough to blunt
// hammering without DB writes; upgrade to KV/Upstash if needed.
// ============================================================

import type { VercelRequest } from '@vercel/node';

interface Entry { count: number; resetAt: number; }

export interface Limiter {
  check: (ip: string) => { limited: boolean; remaining: number; resetAt: number };
}

/** Create a limiter with the given cap and window. Each instance has its own Map. */
export function createLimiter(limit: number, windowMs: number): Limiter {
  const map = new Map<string, Entry>();
  return {
    check(ip: string) {
      const now = Date.now();
      const entry = map.get(ip);
      if (!entry || now > entry.resetAt) {
        const resetAt = now + windowMs;
        map.set(ip, { count: 1, resetAt });
        return { limited: false, remaining: limit - 1, resetAt };
      }
      entry.count++;
      return {
        limited: entry.count > limit,
        remaining: Math.max(0, limit - entry.count),
        resetAt: entry.resetAt,
      };
    },
  };
}

/** Extract client IP from Vercel headers. Returns 'unknown' if absent. */
export function getClientIp(req: VercelRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') return fwd.split(',')[0]?.trim() || 'unknown';
  if (Array.isArray(fwd) && fwd.length > 0) return fwd[0].split(',')[0]?.trim() || 'unknown';
  return 'unknown';
}
