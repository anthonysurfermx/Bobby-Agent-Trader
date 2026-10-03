// First-party client reports. A signed receipt proves a successful server response was issued;
// receipt ACKs remain reports from the client, not independent proof that a person read the answer.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { VercelRequest } from '@vercel/node';
import { deviceHash } from './access.js';
import { rateLimitSalt, rateLimitSaltConfigured, saltedKey } from './rate-limit.js';
import type { Identity } from './user-identity.js';

export const CLIENT_RECEIPT_TTL_MS = 15 * 60_000;
export const CLIENT_EVENT_MAX_BYTES = 4096;
export const CLIENT_RECEIPT_MAX_BYTES = 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{24}$/;
const PREFIX = 'bcr1';
const KINDS = new Set(['foreground', 'heartbeat', 'background', 'read_started', 'read_received', 'read_rendered', 'webview_terminated']);
const LIFECYCLE = new Set(['foreground', 'heartbeat', 'background']);
export const telemetryUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

export interface ClientEvent {
  schemaVersion: 1;
  eventId: string;
  sessionId: string;
  sequence: number;
  event: string;
  occurredAt: string;
  version: string | null;
  build: string | null;
  requestId: string | null;
  receipt: string | null;
}

export function normalizeClientEvent(raw: unknown, now = Date.now()): ClientEvent | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (row.schemaVersion !== 1 || !telemetryUuid(row.eventId) || !telemetryUuid(row.sessionId) ||
      !Number.isSafeInteger(row.sequence) || Number(row.sequence) < 0 || Number(row.sequence) > 2_147_483_647 ||
      typeof row.event !== 'string' || !KINDS.has(row.event)) return null;
  let occurred = now;
  if (row.occurredAt !== undefined) {
    if (typeof row.occurredAt !== 'string' || row.occurredAt.length > 40) return null;
    occurred = Date.parse(row.occurredAt);
    // Logical capture time is needed to reject delayed lifecycle messages across foreground epochs.
    // Preserve capture order across epochs even with up to 30 s clock skew.
    // Database presence expiry uses the earlier of capture and server receipt time.
    if (!Number.isFinite(occurred) || occurred > now + 30_000 || occurred < now - 5 * 60_000) return null;
  } else if (LIFECYCLE.has(row.event)) return null;
  const label = (v: unknown): string | null | false => v == null ? null :
    typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,63}$/.test(v) ? v : false;
  const version = label(row.version), build = label(row.build);
  if (version === false || build === false) return null;
  if (row.requestId !== undefined && row.requestId !== null && !telemetryUuid(row.requestId)) return null;
  const ack = row.event === 'read_received' || row.event === 'read_rendered';
  if (ack && (typeof row.receipt !== 'string' || row.receipt.length > CLIENT_RECEIPT_MAX_BYTES || !row.receipt)) return null;
  if (!ack && row.receipt !== undefined && row.receipt !== null) return null;
  return { schemaVersion: 1, eventId: row.eventId.toLowerCase(), sessionId: row.sessionId.toLowerCase(),
    sequence: Number(row.sequence), event: row.event, occurredAt: new Date(occurred).toISOString(),
    version, build, requestId: typeof row.requestId === 'string' ? row.requestId.toLowerCase() : null,
    receipt: ack ? row.receipt as string : null };
}

export interface ClientBinding { device: string; owner: string | null; platform: 'ios' | 'web' }
export interface ReadReceiptPayload extends ClientBinding { id: string; requestId: string; iat: number }
export interface ReadReceipt { requestId: string; receipt: string }

export function clientBinding(req: VercelRequest, identity: Identity | null): ClientBinding | null {
  const device = deviceHash(req), header = req.headers['x-bobby-platform'];
  const platform = typeof header === 'string' ? header.trim().toLowerCase() : null;
  if (!device || (platform !== 'ios' && platform !== 'web')) return null;
  // A wallet session is bound too; account aggregates require a verified Supabase auth user.
  return { device, owner: identity ? saltedKey('telemetry-owner:' + identity.id) : null, platform };
}

function receiptKey(): Buffer | null {
  if (!rateLimitSaltConfigured()) return null;
  // Domain separation: this key cannot mint wallet, payment or transcript-publishing credentials.
  return createHmac('sha256', rateLimitSalt()).update('bobby/client-report/receipt-key/v1').digest();
}
function mac(b64: string, key: Buffer): Buffer {
  return createHmac('sha256', key).update(PREFIX + '\n' + b64).digest();
}

/** Only called after successful model completion, never for a refusal, failure or interruption. */
export function issueClientReadReceipt(binding: ClientBinding | null, requestId: unknown, now = Date.now()): ReadReceipt | null {
  const key = receiptKey();
  if (!key || !binding || !telemetryUuid(requestId)) return null;
  const payload: ReadReceiptPayload = { ...binding, id: randomUUID(), requestId: requestId.toLowerCase(), iat: now };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { requestId: payload.requestId, receipt: PREFIX + '.' + b64 + '.' + mac(b64, key).toString('base64url') };
}

export function verifyClientReadReceipt(token: string, binding: ClientBinding, now = Date.now()): ReadReceiptPayload | null {
  const key = receiptKey();
  if (!key || typeof token !== 'string' || token.length > CLIENT_RECEIPT_MAX_BYTES) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX || !/^[a-zA-Z0-9_-]+$/.test(parts[1]) || !/^[a-zA-Z0-9_-]+$/.test(parts[2])) return null;
  const expected = mac(parts[1], key), supplied = Buffer.from(parts[2], 'base64url');
  if (supplied.toString('base64url') !== parts[2] || Buffer.from(parts[1], 'base64url').toString('base64url') !== parts[1] ||
      supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) return null;
  let payload: ReadReceiptPayload;
  try { payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { return null; }
  if (!payload || !telemetryUuid(payload.id) || !telemetryUuid(payload.requestId) || !Number.isSafeInteger(payload.iat) ||
      payload.iat > now + 30_000 || now - payload.iat > CLIENT_RECEIPT_TTL_MS ||
      !HASH.test(payload.device) || (payload.owner !== null && !HASH.test(payload.owner)) ||
      payload.device !== binding.device || payload.owner !== binding.owner || payload.platform !== binding.platform) return null;
  return payload;
}
