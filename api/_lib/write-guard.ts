// ============================================================
// write-guard — the checklist every public write endpoint runs before it
// touches the database. Phase 0 replaced the browser's direct PostgREST
// writes (anon key) with these endpoints, so each one must carry its own
// protection: freeze switch, method, origin, body size, schema validation,
// per-IP and per-subject rate limits — and, for anything that belongs to a
// wallet, PROOF that the caller owns that wallet (session token, see
// wallet-session.ts). Origin and rate limits are defense in depth, never
// authorization.
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { ZodTypeAny, z } from 'zod';
import { checkPersistentLimit } from './rate-limit-persistent.js';
import { createLimiter, getClientIpKey } from './rate-limit.js';
import { requireWritesOpen } from './control.js';
import { requireWalletSession, type WalletSession } from './wallet-session.js';
import { allowedOriginHosts, requestOriginHost } from './origins.js';

export { allowedOriginHosts };

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
  perSubject?: { key: (body: z.infer<S>, wallet: string | null) => string | null; limit: number; windowSec: number };
  /** Max raw body size in bytes (default 16 KB). */
  maxBodyBytes?: number;
  /**
   * 'wallet' (default): a valid wallet session is required and, when the
   * body carries `wallet`, it must be the session's wallet.
   * 'none': anonymous endpoint (e.g. an email form) — say so explicitly.
   */
  auth?: 'wallet' | 'none';
  /** Skip the origin check (server-to-server callers). Default false. */
  allowNoOrigin?: boolean;
}

export interface WriteGuardResult<S extends ZodTypeAny> {
  body: z.infer<S>;
  ipKey: string;
  /** Proven wallet (lower-case) when auth === 'wallet', else null. */
  wallet: string | null;
  session: WalletSession | null;
}

const localLimiters = new Map<string, ReturnType<typeof createLimiter>>();

function originAllowed(req: VercelRequest): boolean {
  return requestOriginHost(req.headers) !== null;
}

/** Bytes of a body as the runtime handed it over: text, raw bytes, or a parsed value re-serialized. */
function bodyBytes(body: unknown): number {
  if (body === undefined || body === null) return 0;
  if (typeof body === 'string') return Buffer.byteLength(body, 'utf8');
  if (Buffer.isBuffer(body)) return body.length;
  try {
    const text = JSON.stringify(body);
    return text === undefined ? 0 : Buffer.byteLength(text, 'utf8');
  } catch {
    return Number.POSITIVE_INFINITY; // not serializable, so not a JSON body: refused
  }
}

/**
 * Runs the full checklist. Returns the validated body, or null after having
 * written the error response. Order: method → freeze → origin → session →
 * size → schema → wallet match → per-IP limit (memory then persistent) →
 * per-subject limit.
 */
export async function guardWrite<S extends ZodTypeAny>(req: VercelRequest, res: VercelResponse, opts: WriteGuardOptions<S>): Promise<WriteGuardResult<S> | null> {
  if (!opts.methods.includes(req.method || '')) {
    res.setHeader('Allow', opts.methods.join(', '));
    res.status(405).json({ error: 'Method not allowed' });
    return null;
  }
  if (!(await requireWritesOpen(res))) return null;
  if (!opts.allowNoOrigin && !originAllowed(req)) {
    res.status(403).json({ error: 'Origin not allowed' });
    return null;
  }
  const auth = opts.auth ?? 'wallet';
  let session: WalletSession | null = null;
  if (auth === 'wallet') {
    session = requireWalletSession(req, res);
    if (!session) return null;
  }
  const maxBytes = opts.maxBodyBytes ?? 16 * 1024;
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > maxBytes) {
    res.status(413).json({ error: `Body too large (max ${maxBytes} bytes)` });
    return null;
  }
  // The header is only the cheap first answer: a chunked upload carries none, and the runtime may already have parsed
  // the body. What arrived is measured as well, before any schema walks it: zod 3 spends work on every element of an
  // oversized array (GHSA-mrhx-c7xc-m3w5), so the cap must hold whatever the headers say.
  let raw: unknown = req.body;
  if (bodyBytes(raw) > maxBytes) {
    res.status(413).json({ error: `Body too large (max ${maxBytes} bytes)` });
    return null;
  }
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { res.status(400).json({ error: 'Invalid JSON' }); return null; }
  }
  const parsed = opts.schema.safeParse(raw ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload', issues: parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join('.'), message: i.message })) });
    return null;
  }
  const wallet = session?.wallet ?? null;
  const bodyWallet = (parsed.data as { wallet?: unknown }).wallet;
  if (session && typeof bodyWallet === 'string' && bodyWallet.toLowerCase() !== session.wallet) {
    res.status(403).json({ error: 'Wallet does not match the session' });
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
  const subject = opts.perSubject ? opts.perSubject.key(parsed.data, wallet) : wallet;
  if (subject) {
    const limit = opts.perSubject?.limit ?? opts.perIp.limit;
    const windowSec = opts.perSubject?.windowSec ?? opts.perIp.windowSec;
    const subjectLimit = await checkPersistentLimit(`${opts.scope}:subject`, subject, limit, windowSec);
    if (subjectLimit.limited) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((subjectLimit.resetAt - Date.now()) / 1000))));
      res.status(429).json({ error: 'Too many requests for this wallet' });
      return null;
    }
  }
  return { body: parsed.data, ipKey, wallet, session };
}

/** Lower-cased, validated wallet or null. */
export function normalizeWallet(value: unknown): string | null {
  return typeof value === 'string' && WALLET_RE.test(value) ? value.toLowerCase() : null;
}
