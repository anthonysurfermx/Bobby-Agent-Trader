// ============================================================
// Bobby Pro market briefings — HTTP plumbing for the public router (api/briefings.ts).
// Contract: docs/product/pro-market-briefings-implementation.md §4 and pro-market-briefings-api-contracts.md.
// Invariants:
//   · An account is ONLY a verified Supabase (Apple/Google) session: carriesAccountToken + resolveIdentity with
//     via === 'supabase' and an authUserId. Wallet sessions, anonymous devices and unverified JWTs are 401. The
//     owner is always derived from that session; no body/query field can name an owner or identity.
//   · An unavailable dependency is never a permission or an empty answer: auth outage → 503 auth_unavailable,
//     entitlement or storage failure → 503 storage_unavailable (never "free", never "no reports").
//   · Bodies are measured on bytes before parsing and validated by strict zod schemas (unknown fields rejected).
//     Limitation: when the Vercel runtime already parsed the JSON (req.body is an object) the original bytes are
//     gone; we check Content-Length first and then measure the re-serialized value, which can only be smaller
//     than or equal to a whitespace-padded original — never a bypass of the semantic limits.
//   · Errors are {error, code} with a BriefErrorCode. Logs carry '[briefings]', the op and the code only: never a
//     bearer, an APNs token, an installation credential, an identity or report text.
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import type { ZodTypeAny, z } from 'zod';
import { checkPersistentLimit } from '../rate-limit-persistent.js';
import { saltedKey } from '../rate-limit.js';
import { resolveIdentity, type Identity } from '../user-identity.js';
import { carriesAccountToken } from '../user-memory.js';
import { BriefingStorageError, getSettings, isPro } from './db.js';
import { CONSENT_VERSIONS } from './config.js';
import type { BriefErrorCode } from './types.js';

export type BriefOp = 'inbox' | 'settings' | 'device' | 'report' | 'voice' | 'audio';
export const NO_STORE = 'private, no-store';

/** Plain, stable copy per code; clients localize from the code, never from this text. */
const MESSAGES: Record<BriefErrorCode, string> = {
  invalid_request: 'The request is not valid.',
  signin_required: 'Sign in with Apple or Google to use market briefings.',
  subscription_required: 'Market briefings are part of Bobby Pro.',
  not_found: 'Not found.',
  revision_conflict: 'This changed elsewhere. Reload and try again.',
  content_version_conflict: 'This briefing changed. Reload it and try again.',
  payload_too_large: 'The request body is too large.',
  revision_required: 'Send If-Match with the current revision.',
  rate_limited: 'Too many requests. Try again shortly.',
  auth_unavailable: 'Sign-in service is temporarily unavailable. Try again.',
  storage_unavailable: 'Briefings are temporarily unavailable. Try again.',
  budget_unavailable: 'Briefings are temporarily unavailable. Try again.',
  feature_disabled: 'This feature is not available right now.',
  voice_unavailable: 'Narration is unavailable right now. The text is still here.',
  consent_required: 'Accept the current consent first.',
  device_limit: 'Too many devices are registered for this account.',
  conflict: 'This could not be completed. Try again.',
  idempotency_key_required: 'Send an Idempotency-Key header.',
  idempotency_mismatch: 'This Idempotency-Key was used for a different request.',
  method_not_allowed: 'Method not allowed.',
};

/** A terminal HTTP answer. Handlers throw it; the router renders it once. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: BriefErrorCode,
    readonly extra: Record<string, unknown> = {},
    readonly headers: Record<string, string> = {},
  ) {
    super(code);
    this.name = 'HttpError';
  }
}

export const fail = (status: number, code: BriefErrorCode, extra?: Record<string, unknown>, headers?: Record<string, string>): never => {
  throw new HttpError(status, code, extra, headers);
};

export function errorBody(code: BriefErrorCode, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { error: MESSAGES[code], code, ...extra };
}

/** Render any thrown value. Storage-layer validation (SQLSTATE 22023 → PostgREST 400) is a 400, any other failure a 503. */
export function sendError(res: VercelResponse, op: string, e: unknown): void {
  let err: HttpError;
  if (e instanceof HttpError) err = e;
  else if (e instanceof BriefingStorageError) err = e.status === 400 ? new HttpError(400, 'invalid_request') : new HttpError(503, 'storage_unavailable', {}, { 'Retry-After': '5' });
  else {
    console.error('[briefings]', op, 'unexpected', e instanceof Error ? e.name : typeof e);
    err = new HttpError(503, 'storage_unavailable', {}, { 'Retry-After': '5' });
  }
  if (err.status >= 500) console.error('[briefings]', op, err.code);
  else console.warn('[briefings]', op, err.code);
  for (const [k, v] of Object.entries(err.headers)) res.setHeader(k, v);
  res.setHeader('Cache-Control', NO_STORE);
  res.status(err.status).json(errorBody(err.code, err.extra));
}

// ---- query ----

/** Only `allowed` keys, each a single string value (duplicates arrive as arrays and are refused). */
export function queryParams(req: VercelRequest, allowed: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const q = (req.query ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(q)) {
    if (!allowed.includes(k) || typeof v !== 'string' || v.length > 2048) fail(400, 'invalid_request');
    out[k] = v as string;
  }
  return out;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A canonical lowercase UUID, or a 400. */
export function uuidParam(v: string | undefined): string {
  if (typeof v !== 'string' || !UUID_RE.test(v)) fail(400, 'invalid_request');
  return (v as string).toLowerCase();
}

export function header(req: VercelRequest, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()];
  if (Array.isArray(v)) return v.length === 1 ? v[0] : undefined;
  return typeof v === 'string' ? v : undefined;
}

// ---- body ----

const STREAM_TIMEOUT_MS = 5000;

async function readStream(req: VercelRequest, maxBytes: number): Promise<Buffer> {
  const stream = req as unknown as AsyncIterable<Buffer | string> & { readableEnded?: boolean; destroy?: () => void };
  if (stream.readableEnded || typeof stream[Symbol.asyncIterator] !== 'function') return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const read = (async () => {
    for await (const chunk of stream) {
      const b = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
      size += b.length;
      if (size > maxBytes) return null;
      chunks.push(b);
    }
    return Buffer.concat(chunks);
  })();
  const timeout = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), STREAM_TIMEOUT_MS); });
  try {
    const out = await Promise.race([read, timeout]);
    if (out === 'timeout') fail(400, 'invalid_request');
    if (out === null) fail(413, 'payload_too_large');
    return out as Buffer;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The JSON body, measured on bytes against `maxBytes` (413) and parsed (400 on malformed JSON). Reads the stream
 * itself when the runtime has not; see the file header for the already-parsed case.
 */
export async function readJsonBody(req: VercelRequest, maxBytes: number): Promise<unknown> {
  const declared = Number(header(req, 'content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) fail(413, 'payload_too_large');
  let pre: unknown;
  try {
    pre = (req as { body?: unknown }).body; // the Vercel getter throws on malformed JSON
  } catch {
    fail(400, 'invalid_request');
  }
  let raw: Buffer;
  if (pre === undefined || pre === null) raw = await readStream(req, maxBytes);
  else if (typeof pre === 'string') raw = Buffer.from(pre, 'utf8');
  else if (Buffer.isBuffer(pre)) raw = pre;
  else {
    const serialized = JSON.stringify(pre);
    if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > maxBytes) fail(413, 'payload_too_large');
    return pre;
  }
  if (raw.length > maxBytes) fail(413, 'payload_too_large');
  const text = raw.toString('utf8');
  if (!text.trim()) fail(400, 'invalid_request');
  try {
    return JSON.parse(text);
  } catch {
    return fail(400, 'invalid_request');
  }
}

/** Strict schema parse; any issue is a 400 without echoing the input. */
export function parseWith<S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const r = schema.safeParse(value);
  if (!r.success) fail(400, 'invalid_request');
  return (r as { success: true; data: z.infer<S> }).data;
}

// ---- account ----

/** The verified Apple/Google account behind the request, or a 401 / 503. */
export async function requireAccount(req: VercelRequest): Promise<Identity> {
  const unauthenticated = () => fail(401, 'signin_required', {}, { 'WWW-Authenticate': 'Bearer realm="bobby-briefings"' });
  if (!carriesAccountToken(req)) unauthenticated();
  let identity: Identity | null;
  try {
    identity = await resolveIdentity(req);
  } catch {
    return fail(503, 'auth_unavailable', {}, { 'Retry-After': '5' });
  }
  if (!identity || identity.via !== 'supabase' || !identity.authUserId) return unauthenticated();
  return identity;
}

/**
 * Account-keyed persistent limit per minute. The key is a salted hash of the identity: api_cache is readable by
 * anon (unexpired rows), so a raw identity id must never appear in its keys.
 */
export async function accountLimit(scope: string, identityId: string, limit: number, failClosed = false): Promise<void> {
  const r = await checkPersistentLimit(scope, saltedKey(`brief:${identityId}`), limit, 60, { failClosed });
  if (r.limited) fail(429, 'rate_limited', {}, { 'Retry-After': String(Math.max(1, Math.ceil((r.resetAt - Date.now()) / 1000))) });
}

/** Feature paid ACTIVE Pro with verified current production paid-period evidence. Grants/trials are excluded. */
export async function requirePro(identityId: string): Promise<void> {
  if (!(await isPro(identityId))) fail(403, 'subscription_required');
}

/** Account audio consent at the CURRENT server version (voice and audio ops). */
export async function requireAudioConsent(identityId: string): Promise<void> {
  const s = await getSettings(identityId);
  if (!(s.audioConsentEnabled === true && s.audioConsentVersion === CONSENT_VERSIONS.audio)) fail(403, 'consent_required');
}

// ---- idempotency / revisions ----

const IDEM_KEY = /^[A-Za-z0-9_-]{8,64}$/;
/** Idempotency-Key: required (400 idempotency_key_required), UUID-ish, ≤ 64 chars. */
export function idempotencyKey(req: VercelRequest): string {
  const v = header(req, 'idempotency-key');
  if (v === undefined || v.trim() === '') fail(400, 'idempotency_key_required');
  if (!IDEM_KEY.test(v as string)) fail(400, 'invalid_request');
  return v as string;
}

/** JSON with object keys sorted at every level: the same request always digests the same way. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** sha256 hex over the canonical body plus anything else that defines the request (e.g. a proof's hash). */
export function requestDigest(body: unknown, extra = ''): string {
  return createHash('sha256').update(`${canonicalJson(body)}\n${extra}`, 'utf8').digest('hex');
}

/** If-Match: `"4"`, `W/"4"` or `4` → 4; undefined when absent; null when malformed. */
export function parseIfMatch(raw: string | undefined): number | null | undefined {
  if (raw === undefined) return undefined;
  const m = /^(?:(?:W\/)?"(\d{1,9})"|(\d{1,9}))$/.exec(raw.trim());
  return m ? Number(m[1] ?? m[2]) : null;
}

export const etag = (revision: number): string => `"${revision}"`;

/** A timestamp as UTC ISO (null stays null; an unparsable value is dropped to null rather than echoed). */
export function iso(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
