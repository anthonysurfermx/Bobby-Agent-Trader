// ============================================================
// write-guard — the checklist every public write endpoint runs before it
// touches the database. Phase 0 replaced the browser's direct PostgREST
// writes (anon key) with these endpoints, so each one must carry its own
// protection: freeze switch, method, origin, body size, schema validation,
// per-IP and per-subject rate limits.
//
// Wallet ownership is NOT proven here (no signature yet). The limits and
// the schema blunt abuse; proving the wallet is the next step and is
// tracked in docs/infra.
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { ZodTypeAny, z } from 'zod';
import { checkPersistentLimit } from './rate-limit-persistent.js';
import { createLimiter, getClientIpKey } from './rate-limit.js';
import { requireWritesOpen } from './control.js';

const ALLOWED_ORIGIN_SUFFIXES = ['bobbyprotocol.xyz', 'localhost', '127.0.0.1', '.vercel.app'];

export const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;

export interface WriteGuardOptions<S extends ZodTypeAny> {
  /** Accepted HTTP methods, e.g. ['POST']. */
  methods: string[];
  /** Short scope name for rate-limit keys, e.g. 'forum-publish'. */
  scope: string;
  schema: S;
  /** Per-IP cap: hits per window (seconds). */
  perIp: { limit: number; windowSec: number };
  /** Optional per-subject cap (wallet, token…) computed from the parsed body. */
  perSubject?: { key: (body: z.infer<S>) => string | null; limit: number; windowSec: number };
  /** Max raw body size in bytes (default 16 KB). */
  maxBodyBytes?: number;
}

export interface WriteGuardResult<S extends ZodTypeAny> {
  body: z.infer<S>;
  ipKey: string;
}

const localLimiters = new Map<string, ReturnType<typeof createLimiter>>();

function originAllowed(req: VercelRequest): boolean {
  const raw = (req.headers.origin as string | undefined) || (req.headers.referer as string | undefined) || '';
  if (!raw) return false; // browsers always send Origin on cross-site POST; same-site fetch sends it too
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return ALLOWED_ORIGIN_SUFFIXES.some((s) => (s.startsWith('.') ? host.endsWith(s) : host === s || host.endsWith(`.${s}`)));
  } catch {
    return false;
  }
}

/**
 * Runs the full checklist. Returns the validated body, or null after having
 * written the error response. Order: method → freeze → origin → size →
 * schema → per-IP limit (memory then persistent) → per-subject limit.
 */
export async function guardWrite<S extends ZodTypeAny>(req: VercelRequest, res: VercelResponse, opts: WriteGuardOptions<S>): Promise<WriteGuardResult<S> | null> {
  if (!opts.methods.includes(req.method || '')) {
    res.setHeader('Allow', opts.methods.join(', '));
    res.status(405).json({ error: 'Method not allowed' });
    return null;
  }
  if (!(await requireWritesOpen(res))) return null;
  if (!originAllowed(req)) {
    res.status(403).json({ error: 'Origin not allowed' });
    return null;
  }
  const maxBytes = opts.maxBodyBytes ?? 16 * 1024;
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > maxBytes) {
    res.status(413).json({ error: `Body too large (max ${maxBytes} bytes)` });
    return null;
  }
  let raw: unknown = req.body;
  if (typeof raw === 'string') {
    if (raw.length > maxBytes) { res.status(413).json({ error: 'Body too large' }); return null; }
    try { raw = JSON.parse(raw); } catch { res.status(400).json({ error: 'Invalid JSON' }); return null; }
  }
  const parsed = opts.schema.safeParse(raw ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload', issues: parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join('.'), message: i.message })) });
    return null;
  }

  const ipKey = getClientIpKey(req);
  // First line: in-memory per instance (free). Second: persistent across instances.
  const memKey = `${opts.scope}:${opts.perIp.limit}:${opts.perIp.windowSec}`;
  let mem = localLimiters.get(memKey);
  if (!mem) { mem = createLimiter(opts.perIp.limit, opts.perIp.windowSec * 1000); localLimiters.set(memKey, mem); }
  if (mem.check(ipKey).limited) {
    res.setHeader('Retry-After', String(opts.perIp.windowSec));
    res.status(429).json({ error: 'Too many requests' });
    return null;
  }
  const ipLimit = await checkPersistentLimit(opts.scope, ipKey, opts.perIp.limit, opts.perIp.windowSec);
  if (ipLimit.limited) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((ipLimit.resetAt - Date.now()) / 1000))));
    res.status(429).json({ error: 'Too many requests' });
    return null;
  }
  if (opts.perSubject) {
    const subject = opts.perSubject.key(parsed.data);
    if (subject) {
      const subjectLimit = await checkPersistentLimit(`${opts.scope}:subject`, subject, opts.perSubject.limit, opts.perSubject.windowSec);
      if (subjectLimit.limited) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((subjectLimit.resetAt - Date.now()) / 1000))));
        res.status(429).json({ error: 'Too many requests for this wallet' });
        return null;
      }
    }
  }
  return { body: parsed.data, ipKey };
}

/** Lower-cased, validated wallet or null. */
export function normalizeWallet(value: unknown): string | null {
  return typeof value === 'string' && WALLET_RE.test(value) ? value.toLowerCase() : null;
}
