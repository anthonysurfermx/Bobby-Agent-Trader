// ============================================================
// Bobby Pro market briefings — APNs delivery (HTTP/2, token-based auth).
// Invariants:
//   · the payload is generic: a fixed title/body per language (config.PUSH_COPY) and the brief id. No name,
//     symbol, figure or account reference ever reaches Apple or the lock screen;
//   · one provider JWT (ES256, {iss: team, iat}) per key id, reused for 40 minutes: Apple rejects tokens older
//     than an hour and throttles refreshes more often than every 20 minutes (TooManyProviderTokenUpdates);
//   · the outbox row's stable apns-id / collapse-id travel on every attempt, so a retry after an ambiguous
//     result never shows the reader two notifications;
//   · sendApns refuses a notification already past its expiry (outcome 'retry', reason 'expired', nothing is
//     sent) — callers should skip expired rows themselves; outbox_claim expires them on the next pass;
//   · topic and environment come from server config only; a mismatch is a 'config' outcome, nothing is sent;
//   · the device token is never logged. Logs carry status and Apple's reason code only.
// Outcomes: 200 accepted; 410 and 400 BadDeviceToken/DeviceTokenNotForTopic → invalid_token; 403 provider-token
// and certificate/topic errors → config (does not burn attempts); 429 and 5xx → retry (Retry-After respected,
// bounded); a failure after the request was written (timeout, stream reset, GOAWAY past our stream) → ambiguous;
// a failure before it was written (connect error, refused stream) → retry.
// ============================================================
import http2 from 'node:http2';
import { createPrivateKey, sign as cryptoSign, type KeyObject } from 'node:crypto';
import { PUSH_COPY, type ApnsConfig } from './config.js';
import type { BriefLanguage, DeviceEnvironment } from './types.js';

export interface ApnsNotification { token: string; environment: DeviceEnvironment; topic: string; apnsId: string; collapseId: string; expiresAt: Date; language: BriefLanguage; briefId: string }
export interface ApnsOutcome { outcome: 'accepted' | 'retry' | 'invalid_token' | 'ambiguous' | 'config'; status: number | null; reason: string | null; retryAfterSeconds?: number }
export interface ApnsTransport { request(origin: string, headers: Record<string, string>, body: string, timeoutMs: number): Promise<{ status: number; headers: Record<string, string>; body: string }> }

/** Thrown by a transport. `written` = the request may have reached Apple (a retry could duplicate). */
export class ApnsTransportError extends Error {
  constructor(readonly kind: 'connect' | 'timeout' | 'stream' | 'refused', readonly written: boolean) {
    super(`apns transport ${kind}`);
    this.name = 'ApnsTransportError';
  }
}

export const APNS_ORIGINS: Readonly<Record<DeviceEnvironment, string>> = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
};
export const APNS_TIMEOUT_MS = 10_000;
const TOKEN_REFRESH_MS = 40 * 60_000;
const THREAD_ID = 'bobby-briefings';
const RETRY_AFTER_MIN_S = 1;
const RETRY_AFTER_MAX_S = 600;
const DEFAULT_RETRY_429_S = 60;
const DEFAULT_RETRY_5XX_S = 30;

const INVALID_TOKEN_400 = new Set(['BadDeviceToken', 'DeviceTokenNotForTopic']);
const CONFIG_400 = new Set(['BadTopic', 'TopicDisallowed', 'MissingTopic', 'BadCertificate', 'BadCertificateEnvironment']);

/** The whole payload. Tests assert there is nothing else in it. */
export function apnsPayload(n: ApnsNotification): Record<string, unknown> {
  const copy = PUSH_COPY[n.language] ?? PUSH_COPY.en;
  return { aps: { alert: { title: copy.title, body: copy.body }, sound: 'default', 'thread-id': THREAD_ID }, briefId: n.briefId };
}

// ---- provider token (JWT ES256) ----
interface CachedToken { teamId: string; keyFingerprint: string; jwt: string; issuedAtMs: number }
const tokenCache = new Map<string, CachedToken>();
const keyObjects = new Map<string, KeyObject>();

const b64url = (v: string | Buffer) => Buffer.from(v).toString('base64url');

function privateKey(pem: string): KeyObject {
  let k = keyObjects.get(pem);
  if (!k) { k = createPrivateKey(pem); keyObjects.set(pem, k); }
  return k;
}

/** Cached per key id; refreshed after 40 minutes or when the team/key changes. Throws on an unusable key. */
export function providerToken(cfg: ApnsConfig, now: Date = new Date()): string {
  const keyFingerprint = `${cfg.privateKey.length}:${cfg.privateKey.slice(-24)}`;
  const hit = tokenCache.get(cfg.keyId);
  if (hit && hit.teamId === cfg.teamId && hit.keyFingerprint === keyFingerprint && now.getTime() - hit.issuedAtMs < TOKEN_REFRESH_MS && now.getTime() >= hit.issuedAtMs) return hit.jwt;
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: cfg.keyId }));
  const claims = b64url(JSON.stringify({ iss: cfg.teamId, iat: Math.floor(now.getTime() / 1000) }));
  const input = `${header}.${claims}`;
  const signature = cryptoSign('sha256', Buffer.from(input), { key: privateKey(cfg.privateKey), dsaEncoding: 'ieee-p1363' });
  const jwt = `${input}.${b64url(signature)}`;
  tokenCache.set(cfg.keyId, { teamId: cfg.teamId, keyFingerprint, jwt, issuedAtMs: now.getTime() });
  return jwt;
}

/** Tests only (and after Apple rejects the token): forget cached provider tokens. */
export function resetApnsTokenCache(keyId?: string): void {
  if (keyId) tokenCache.delete(keyId); else tokenCache.clear();
}

// ---- default transport: one cached HTTP/2 session per origin ----
const sessions = new Map<string, http2.ClientHttp2Session>();

function dropSession(origin: string, s: http2.ClientHttp2Session): void {
  if (sessions.get(origin) === s) sessions.delete(origin);
  try { if (!s.destroyed) s.destroy(); } catch { /* already gone */ }
}

function sessionFor(origin: string): http2.ClientHttp2Session {
  const cached = sessions.get(origin);
  if (cached && !cached.closed && !cached.destroyed) return cached;
  const s = http2.connect(origin);
  s.on('error', () => dropSession(origin, s));
  // GOAWAY: stop routing new requests here but let in-flight streams finish (Apple's last-stream-id rule).
  s.on('goaway', () => { if (sessions.get(origin) === s) sessions.delete(origin); try { s.close(); } catch { /* closing */ } });
  s.on('close', () => { if (sessions.get(origin) === s) sessions.delete(origin); });
  // An idle session must never keep a serverless instance (or a test) alive.
  s.unref();
  sessions.set(origin, s);
  return s;
}

export const http2Transport: ApnsTransport = {
  request(origin, headers, body, timeoutMs) {
    return new Promise((resolve, reject) => {
      let written = false;
      let settled = false;
      const finish = (fn: () => void) => { if (!settled) { settled = true; clearTimeout(timer); fn(); } };
      let req: http2.ClientHttp2Stream;
      try {
        req = sessionFor(origin).request(headers);
      } catch {
        reject(new ApnsTransportError('connect', false));
        return;
      }
      const timer = setTimeout(() => {
        finish(() => reject(new ApnsTransportError('timeout', written)));
        try { req.close(http2.constants.NGHTTP2_CANCEL); } catch { /* closed */ }
      }, timeoutMs);
      let status = 0;
      const respHeaders: Record<string, string> = {};
      let data = '';
      req.on('response', (h) => {
        status = Number(h[':status']) || 0;
        for (const [k, v] of Object.entries(h)) if (!k.startsWith(':') && v !== undefined) respHeaders[k.toLowerCase()] = Array.isArray(v) ? v.join(',') : String(v);
      });
      req.setEncoding('utf8');
      req.on('data', (chunk: string) => { if (data.length < 8192) data += chunk; });
      req.on('end', () => finish(() => resolve({ status, headers: respHeaders, body: data })));
      req.on('error', () => {
        // REFUSED_STREAM (e.g. past a GOAWAY's last stream id) means Apple never processed it: safe to retry.
        const refused = req.rstCode === http2.constants.NGHTTP2_REFUSED_STREAM;
        finish(() => reject(new ApnsTransportError(refused ? 'refused' : 'stream', refused ? false : written)));
      });
      req.on('close', () => {
        if (!settled) {
          const refused = req.rstCode === http2.constants.NGHTTP2_REFUSED_STREAM;
          finish(() => reject(new ApnsTransportError(refused ? 'refused' : 'stream', refused ? false : written)));
        }
      });
      req.end(body, () => { written = true; });
      // From here the bytes may be on the wire even if the callback has not fired yet.
      written = written || !req.pending;
    });
  },
};

/** Closes every cached session (end of a tick, or after a connection error). Provider tokens stay cached. */
export function closeApns(): void {
  for (const [origin, s] of [...sessions]) dropSession(origin, s);
}

// ---- send ----
const appleReason = (body: string): string | null => {
  try {
    const r = (JSON.parse(body) as { reason?: unknown }).reason;
    return typeof r === 'string' && /^[A-Za-z]{1,48}$/.test(r) ? r : null;
  } catch {
    return null;
  }
};

function retryAfter(headers: Record<string, string>, fallback: number, now: Date): number {
  const raw = headers['retry-after'];
  let s = fallback;
  if (raw !== undefined && raw !== '') {
    if (/^\d+$/.test(raw.trim())) s = Number(raw.trim());
    else {
      const at = Date.parse(raw);
      if (Number.isFinite(at)) s = Math.ceil((at - now.getTime()) / 1000);
    }
  }
  return Math.min(RETRY_AFTER_MAX_S, Math.max(RETRY_AFTER_MIN_S, Number.isFinite(s) ? s : fallback));
}

export async function sendApns(cfg: ApnsConfig, n: ApnsNotification, transport: ApnsTransport = http2Transport, now: Date = new Date()): Promise<ApnsOutcome> {
  if (!(n.expiresAt instanceof Date) || !Number.isFinite(n.expiresAt.getTime()) || n.expiresAt.getTime() <= now.getTime()) {
    return { outcome: 'retry', status: null, reason: 'expired' };
  }
  if (!cfg.environments.has(n.environment)) return { outcome: 'config', status: null, reason: 'environment_not_allowed' };
  if (n.topic !== cfg.topic) return { outcome: 'config', status: null, reason: 'topic_mismatch' };
  const token = String(n.token).trim().toLowerCase();
  if (!/^[0-9a-f]{32,400}$/.test(token)) return { outcome: 'invalid_token', status: null, reason: 'BadDeviceToken' };

  let jwt: string;
  try {
    jwt = providerToken(cfg, now);
  } catch {
    console.error('[briefings-apns] provider key unusable');
    return { outcome: 'config', status: null, reason: 'bad_provider_key' };
  }

  const headers: Record<string, string> = {
    ':method': 'POST',
    ':path': `/3/device/${token}`,
    authorization: `bearer ${jwt}`,
    'apns-topic': cfg.topic,
    'apns-push-type': 'alert',
    'apns-priority': '10',
    'apns-expiration': String(Math.floor(n.expiresAt.getTime() / 1000)),
    'apns-collapse-id': n.collapseId,
    'apns-id': n.apnsId,
    'content-type': 'application/json',
  };
  const body = JSON.stringify(apnsPayload(n));

  let res: { status: number; headers: Record<string, string>; body: string };
  try {
    res = await transport.request(APNS_ORIGINS[n.environment], headers, body, APNS_TIMEOUT_MS);
  } catch (e) {
    const written = e instanceof ApnsTransportError ? e.written : true;
    const kind = e instanceof ApnsTransportError ? e.kind : 'stream';
    if (e instanceof ApnsTransportError && (e.kind === 'connect' || e.kind === 'stream' || e.kind === 'timeout')) closeApns();
    console.error('[briefings-apns]', kind, written ? 'after_write' : 'before_write');
    return written ? { outcome: 'ambiguous', status: null, reason: kind } : { outcome: 'retry', status: null, reason: kind, retryAfterSeconds: RETRY_AFTER_MIN_S * 5 };
  }

  const status = res.status;
  const reason = status === 200 ? null : appleReason(res.body);
  const lowerHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(res.headers ?? {})) lowerHeaders[k.toLowerCase()] = v;
  if (status !== 200) console.error('[briefings-apns]', status, reason ?? '');

  if (status === 200) return { outcome: 'accepted', status, reason: null };
  if (status === 410) return { outcome: 'invalid_token', status, reason };
  if (status === 400 && reason && INVALID_TOKEN_400.has(reason)) return { outcome: 'invalid_token', status, reason };
  if (status === 403) {
    // A rejected provider token must be re-minted, not reused for the rest of its 40 minutes.
    if (reason && /ProviderToken/.test(reason)) resetApnsTokenCache(cfg.keyId);
    return { outcome: 'config', status, reason };
  }
  if (status === 400 && reason && (CONFIG_400.has(reason) || reason.startsWith('BadCertificate'))) return { outcome: 'config', status, reason };
  if (status === 429) return { outcome: 'retry', status, reason, retryAfterSeconds: retryAfter(lowerHeaders, DEFAULT_RETRY_429_S, now) };
  if (status >= 500) return { outcome: 'retry', status, reason, retryAfterSeconds: retryAfter(lowerHeaders, DEFAULT_RETRY_5XX_S, now) };
  // Any other 4xx is a malformed request on our side: retry is bounded by the outbox attempt cap.
  return { outcome: 'retry', status, reason };
}
