// Server-only HTTP v1 FID transport. No credential, target or provider response body is logged.
import { createHash, createPrivateKey, sign } from 'node:crypto';

export const FCM_PACKAGE = 'xyz.bobbyprotocol.bobby';
export const FCM_FID = /^[A-Za-z0-9_-]{1,256}$/;
const PROJECT = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const OAUTH_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
export const FCM_MIN_REMAINING_MS = 18_000;
export interface FcmConfig { projectId: string; packageName: string; clientEmail: string; privateKey: string }
export interface FcmNotification { fid: string; projectId: string; packageName: string; briefId: string; registrationId: string; bindingRevision: number; expiresAt: Date }
export interface FcmOutcome {
  outcome: 'accepted' | 'retry' | 'invalid_token' | 'ambiguous' | 'config';
  status: number | null; reason: string | null; retryAfterSeconds?: number; messageId?: string;
}
export type FcmFetch = typeof fetch;

/** The explicit operator flag, exact project/service-account pairing and usable RSA key are all required. */
export function fcmConfig(env: NodeJS.ProcessEnv = process.env): FcmConfig | null {
  if (env.BOBBY_FCM_PUSH_ENABLED !== 'true') return null;
  const projectId = env.BOBBY_FCM_PROJECT_ID ?? '';
  const clientEmail = env.BOBBY_FCM_CLIENT_EMAIL ?? '';
  const privateKey = (env.BOBBY_FCM_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
  if (!PROJECT.test(projectId) || !clientEmail.endsWith(`@${projectId}.iam.gserviceaccount.com`) || !/^[A-Za-z0-9._-]+@[a-z0-9.-]+$/.test(clientEmail)) return null;
  try {
    const key = createPrivateKey(privateKey);
    if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) return null;
  } catch { return null; }
  return { projectId, packageName: FCM_PACKAGE, clientEmail, privateKey };
}

const b64 = (text: string | Buffer) => Buffer.from(text).toString('base64url');
export function fcmAssertion(cfg: FcmConfig, now: Date): string {
  const iat = Math.floor(now.getTime() / 1000);
  const input = `${b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64(JSON.stringify({ iss: cfg.clientEmail, scope: SCOPE, aud: OAUTH_URL, iat, exp: iat + 3600 }))}`;
  return `${input}.${b64(sign('RSA-SHA256', Buffer.from(input), createPrivateKey(cfg.privateKey)))}`;
}
let cached: { key: string; token: string; until: number } | null = null;
export function resetFcmTokenCache(): void { cached = null; }
async function accessToken(cfg: FcmConfig, http: FcmFetch, now: Date): Promise<string | null> {
  const key = createHash('sha256').update(`${cfg.projectId}|${cfg.clientEmail}|${cfg.privateKey}`).digest('hex');
  if (cached?.key === key && cached.until > now.getTime()) return cached.token;
  try {
    const assertion = fcmAssertion(cfg, now);
    const r = await http(OAUTH_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(), signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const raw = await r.text(); if (raw.length > 8192) return null;
    const v = JSON.parse(raw);
    if (v.token_type !== 'Bearer' || typeof v.access_token !== 'string' || (v.access_token.length > 4096 || !/^[A-Za-z0-9._~+/-]+={0,2}$/.test(v.access_token))
      || !Number.isInteger(v.expires_in) || v.expires_in < 60 || v.expires_in > 3600) return null;
    cached = { key, token: v.access_token, until: now.getTime() + (v.expires_in - 60) * 1000 };
    return v.access_token;
  } catch { return null; }
}

/** Exactly six data fields: account and report contents stay in the authenticated inbox. */
export function fcmPayload(n: FcmNotification, now: Date): Record<string, unknown> {
  return { message: { fid: n.fid, data: { v: '1', kind: 'briefing', briefId: n.briefId, registrationId: n.registrationId,
    bindingRevision: String(n.bindingRevision), expiresAt: String(Math.floor(n.expiresAt.getTime() / 1000)) },
    android: { collapse_key: 'bobby-briefings', priority: 'NORMAL', ttl: `${Math.max(0, Math.min(86_400, Math.floor((n.expiresAt.getTime() - now.getTime()) / 1000)))}s`,
      restricted_package_name: n.packageName, direct_boot_ok: false } } };
}

function retryAfter(r: Response, now: Date, fallback: number): number {
  const raw = r.headers.get('retry-after');
  const seconds = raw && /^\d+$/.test(raw) ? Number(raw) : raw ? (Date.parse(raw) - now.getTime()) / 1000 : fallback;
  return Math.min(86400, Math.max(fallback, Number.isFinite(seconds) ? Math.ceil(seconds) : fallback));
}

/** One OAuth attempt when needed and one send per claim; ambiguous writes are never retried here. */
export async function sendFcm(cfg: FcmConfig, n: FcmNotification, http: FcmFetch = fetch, now: Date = new Date()): Promise<FcmOutcome> {
  if (!Number.isFinite(n.expiresAt.getTime()) || n.expiresAt.getTime() <= now.getTime()) return { outcome: 'retry', status: null, reason: 'expired' };
  if (n.projectId !== cfg.projectId || n.packageName !== cfg.packageName || cfg.packageName !== FCM_PACKAGE) return { outcome: 'config', status: null, reason: 'project_mismatch' };
  if (!FCM_FID.test(n.fid)) return { outcome: 'invalid_token', status: null, reason: 'invalid_fid' };
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(n.briefId) || !uuid.test(n.registrationId) || !Number.isSafeInteger(n.bindingRevision) || n.bindingRevision < 1) return { outcome: 'config', status: null, reason: 'invalid_binding' };
  const token = await accessToken(cfg, http, now);
  if (!token) return { outcome: 'config', status: null, reason: 'oauth_unavailable' };
  let r: Response;
  try {
    r = await http(`https://fcm.googleapis.com/v1/projects/${cfg.projectId}/messages:send`, { method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(fcmPayload(n, now)), signal: AbortSignal.timeout(10_000) });
  } catch { return { outcome: 'ambiguous', status: null, reason: 'send_ambiguous' }; }
  let body: any = null;
  try { const raw = await r.text(); if (raw.length <= 8192) body = JSON.parse(raw); } catch { /* no raw detail escapes */ }
  if (r.ok) {
    const prefix = `projects/${cfg.projectId}/messages/`;
    if (typeof body?.name !== 'string' || !body.name.startsWith(prefix) || !/^[A-Za-z0-9._:/-]{1,512}$/.test(body.name) || body.name.length <= prefix.length)
      return { outcome: 'ambiguous', status: r.status, reason: 'missing_receipt' };
    return { outcome: 'accepted', status: r.status, reason: null, messageId: body.name };
  }
  const details = Array.isArray(body?.error?.details) ? body.error.details : [];
  const error = details.find((d: any) => d?.['@type'] === 'type.googleapis.com/google.firebase.fcm.v1.FcmError')?.errorCode;
  if (r.status === 404 && error === 'UNREGISTERED') return { outcome: 'invalid_token', status: r.status, reason: 'unregistered' };
  if (r.status === 429) return { outcome: 'retry', status: r.status, reason: 'provider_quota', retryAfterSeconds: retryAfter(r, now, 60) };
  if (r.status >= 500) return { outcome: 'retry', status: r.status, reason: 'provider_unavailable', retryAfterSeconds: retryAfter(r, now, 30) };
  if (r.status === 401) resetFcmTokenCache();
  return { outcome: 'config', status: r.status, reason: error === 'SENDER_ID_MISMATCH' ? 'sender_mismatch' : 'provider_config' };
}
