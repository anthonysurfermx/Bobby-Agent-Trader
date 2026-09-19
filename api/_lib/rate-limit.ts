// ============================================================
// rate-limit — per-IP rolling-window limiter, in-memory per lambda.
// Survives warm starts, resets on cold start. Good enough to blunt
// hammering without DB writes; upgrade to KV/Upstash if needed.
// ============================================================

import type { VercelRequest } from '@vercel/node';
import { createHash } from 'node:crypto';
import { isIPv4, isIPv6 } from 'node:net';

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

export class RateLimitConfigError extends Error {
  constructor() {
    super('RATE_LIMIT_SALT is required in production: a random secret of at least 16 characters, never the public development default');
    this.name = 'RateLimitConfigError';
  }
}

const DEV_SALT = 'bobby-rl-dev';

/**
 * The salt that makes IP hashes non-enumerable. In production it MUST come
 * from the environment (Codex review: a public fallback meant anyone could
 * recompute every persisted key from a list of IPs). Local and preview keep
 * a development default so the app runs without secrets there.
 */
export function rateLimitSalt(): string {
  const salt = process.env.RATE_LIMIT_SALT;
  if (salt && salt.length >= 16) return salt;
  if (process.env.VERCEL_ENV === 'production') throw new RateLimitConfigError();
  return DEV_SALT;
}

/** True when a real (non-default) salt is configured — reported by health. */
export function rateLimitSaltConfigured(): boolean {
  const salt = process.env.RATE_LIMIT_SALT;
  return Boolean(salt && salt.length >= 16 && salt !== DEV_SALT);
}

/**
 * Privacy-preserving rate-limit identity: a salted SHA-256 of the client IP.
 * Counters behave identically, but persisted rows (Supabase api_cache keys)
 * never contain a readable address — the raw IP stays in process memory only.
 * Throws RateLimitConfigError in production when RATE_LIMIT_SALT is missing.
 */
export function getClientIpKey(req: VercelRequest): string {
  const ip = getClientIp(req);
  if (ip === 'unknown') return ip;
  return saltedKey(ip);
}

function saltedKey(value: string): string {
  return createHash('sha256').update(`${rateLimitSalt()}:${value}`).digest('hex').slice(0, 24);
}

/** The eight 16-bit groups of a valid IPv6 address (zone dropped, dotted tail folded in). */
function ipv6Groups(ip: string): number[] | null {
  let text = ip.split('%')[0].toLowerCase();
  const dotted = text.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number);
    text = `${text.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...Array<string>(missing).fill('0'), ...tail].map(group => /^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : NaN);
  return groups.every(Number.isInteger) ? groups : null;
}

/**
 * Quota identities for a paid, shared budget. Both are salted hashes; no
 * address is persisted.
 *  - caller: an IPv4 address (the same key as getClientIpKey), or an IPv6 /64
 *    — one subscriber, who can rotate freely inside it;
 *  - network: the IPv4 /24 or IPv6 /48 around it, so many callers on one
 *    network share a budget of their own before they reach the global one.
 * IPv4-mapped IPv6 (::ffff:a.b.c.d) is treated as IPv4. null when the request
 * carries no usable address (the caller must fail closed).
 */
export function getClientQuotaKeys(req: VercelRequest): { caller: string; network: string } | null {
  const ip = getClientIp(req);
  if (ip === 'unknown') return null;
  const v4 = (address: string) => ({ caller: saltedKey(address), network: saltedKey(`v4/24:${address.split('.').slice(0, 3).join('.')}`) });
  if (isIPv4(ip)) return v4(ip);
  const groups = isIPv6(ip.split('%')[0]) ? ipv6Groups(ip) : null;
  if (!groups) return null;
  if (groups.slice(0, 5).every(group => group === 0) && groups[5] === 0xffff) {
    return v4(`${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`);
  }
  const prefix = (count: number) => groups.slice(0, count).map(group => group.toString(16)).join(':');
  return { caller: saltedKey(`v6/64:${prefix(4)}`), network: saltedKey(`v6/48:${prefix(3)}`) };
}
