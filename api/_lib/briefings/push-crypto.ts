// ============================================================
// Bobby Pro market briefings — push token and receipt cryptography.
// One 32-byte master (BOBBY_PUSH_TOKEN_KEY) never touches data directly: HKDF-SHA256 derives a separate key per
// purpose (token encryption, token fingerprint, idempotency receipt sealing, inbox cursor signing), so a leak or
// misuse of one derived key never exposes another purpose.
//   · APNs tokens are stored only as AES-256-GCM ciphertext 'v1:' + base64url(iv12 | tag16 | ct). The token is
//     lower-cased hex before sealing, so the same device always seals and fingerprints the same way.
//   · The fingerprint (uniqueness of an active binding) is HMAC over 'token|topic|environment': it never reveals
//     the token and cannot be recomputed without the master.
//   · Installation credentials are 32 random bytes (base64url); the database keeps only their sha256 verifier.
//   · Inbox cursors are base64url JSON plus an HMAC tag, verified in constant time; a tampered cursor is null.
// Nothing here logs: tokens, credentials and receipts never reach a log line, even on failure.
// Spec: docs/product/pro-market-briefings-implementation.md §1 and §8.
// ============================================================
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { bobbyServiceKeyOptional } from '../bobby-db.js';
import { pushMasterKey } from './config.js';
import type { DeviceEnvironment } from './types.js';

type Purpose = 'token-enc' | 'token-fp' | 'receipt' | 'cursor';
const SALT = Buffer.from('bobby-briefings-push-v1', 'utf8');
const SEAL_PREFIX = 'v1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Purpose-bound subkey. The info string is the only thing that differs, so the keys are independent. */
function subkey(master: Buffer, purpose: Purpose): Buffer {
  if (!Buffer.isBuffer(master) || master.length !== 32) throw new Error('push master key must be 32 bytes');
  return Buffer.from(hkdfSync('sha256', master, SALT, `bobby/briefings/${purpose}/v1`, 32));
}

function seal(plain: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return SEAL_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64url');
}

/** Throws on a wrong prefix, a short blob, a wrong key or any tampering (GCM tag check). */
function open(sealed: string, key: Buffer): string {
  if (typeof sealed !== 'string' || !sealed.startsWith(SEAL_PREFIX)) throw new Error('sealed value: unknown format');
  const text = sealed.slice(SEAL_PREFIX.length);
  const raw = Buffer.from(text, 'base64url');
  // One canonical spelling per sealed value (the decoder would ignore stray characters and padding bits).
  if (raw.toString('base64url') !== text) throw new Error('sealed value: non-canonical encoding');
  if (raw.length < IV_BYTES + TAG_BYTES + 1) throw new Error('sealed value: truncated');
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, IV_BYTES));
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8');
}

const normalizeToken = (hexToken: string): string => String(hexToken).trim().toLowerCase();

export function encryptToken(hexToken: string, master: Buffer): string {
  return seal(normalizeToken(hexToken), subkey(master, 'token-enc'));
}

export function decryptToken(sealed: string, master: Buffer): string {
  return open(sealed, subkey(master, 'token-enc'));
}

/** HMAC-SHA256 hex over 'token|topic|environment' (token lower-cased hex). */
export function tokenFingerprint(hexToken: string, topic: string, environment: DeviceEnvironment, master: Buffer): string {
  return createHmac('sha256', subkey(master, 'token-fp')).update(`${normalizeToken(hexToken)}|${topic}|${environment}`, 'utf8').digest('hex');
}

/** The secret an installation proves on rebind/revoke. Returned once to the client; only its verifier is stored. */
export function newInstallationCredential(): string {
  return randomBytes(32).toString('base64url');
}

export function credentialVerifier(credential: string): string {
  return createHash('sha256').update(String(credential), 'utf8').digest('hex');
}

/** Idempotency receipts (a stored response that may carry an installation credential) are sealed at rest. */
export function sealReceipt(json: string, master: Buffer): string {
  return seal(json, subkey(master, 'receipt'));
}

export function openReceipt(sealed: string, master: Buffer): string {
  return open(sealed, subkey(master, 'receipt'));
}

const cursorTag = (body: string, key: Buffer): Buffer => createHmac('sha256', key).update(body, 'utf8').digest();

/** '<base64url(json)>.<base64url(hmac)>'. The payload is opaque to the client but not secret (no PII in it). */
export function signCursor(payload: Record<string, unknown>, key: Buffer): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${cursorTag(body, key).toString('base64url')}`;
}

/** Null for anything not produced by signCursor with this key: wrong shape, bad tag, non-object JSON. */
export function verifyCursor(cursor: string, key: Buffer): Record<string, unknown> | null {
  if (typeof cursor !== 'string' || cursor.length > 1024) return null;
  const parts = cursor.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [body, tag] = parts;
  if (!/^[A-Za-z0-9_-]+$/.test(body) || !/^[A-Za-z0-9_-]+$/.test(tag)) return null;
  // Compare the canonical encodings: base64url decoding ignores the last character's padding bits, so
  // comparing decoded bytes would accept several spellings of one tag.
  const want = Buffer.from(cursorTag(body, key).toString('base64url'), 'utf8');
  const got = Buffer.from(tag, 'utf8');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const v = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * The inbox cursor key. From the push master when configured; otherwise derived from the service-role key, so
 * inbox paging works before push is configured. Throws when neither secret exists (callers answer 503): an
 * all-public key would let anyone forge cursors.
 */
export function cursorKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const master = pushMasterKey(env);
  if (master) return subkey(master, 'cursor');
  const service = env === process.env ? bobbyServiceKeyOptional() : (env.BOBBY_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || '').trim();
  if (!service) throw new Error('cursor key unavailable');
  return Buffer.from(hkdfSync('sha256', Buffer.from(service, 'utf8'), SALT, 'bobby/briefings/cursor-fallback/v1', 32));
}
