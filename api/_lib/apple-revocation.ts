import { createPublicKey, sign, verify, type JsonWebKey } from 'node:crypto';

export const APPLE_MANUAL_REVOCATION_URL = 'https://support.apple.com/en-us/102571';
const APPLE = 'https://appleid.apple.com';

interface AppleConfig { teamId: string; keyId: string; clientId: string; privateKey: string }

/**
 * Every APPLE_SIGN_IN_* value, trimmed once. Values added with
 * `echo value | vercel env add` end in a newline, and Apple answers
 * invalid_client when the JWT's kid/iss/sub carry it.
 */
function appleConfig(): AppleConfig | null {
  const read = (name: string) => process.env[name]?.trim() ?? '';
  const config: AppleConfig = {
    teamId: read('APPLE_SIGN_IN_TEAM_ID'),
    keyId: read('APPLE_SIGN_IN_KEY_ID'),
    clientId: read('APPLE_SIGN_IN_CLIENT_ID'),
    privateKey: read('APPLE_SIGN_IN_PRIVATE_KEY').replace(/\\n/g, '\n'),
  };
  return Object.values(config).every(Boolean) ? config : null;
}

/**
 * Why a revocation did not happen, without secrets: never the code, a token,
 * the client secret or Apple's free-text description.
 *  - transient: Apple or the network failed (5xx, 429, timeout); a retry with a
 *    fresh authorization code can succeed.
 *  - rejected: configuration or the grant itself was refused (the key cannot
 *    sign, invalid_client, unauthorized_client, invalid_grant, a different
 *    Apple ID). Retrying cannot fix it, so account deletion must not wait on it.
 */
export class AppleRevocationError extends Error {
  constructor(readonly kind: 'transient' | 'rejected', readonly stage: 'config' | 'token' | 'keys' | 'identity' | 'revoke', readonly detail: string) {
    super(`Apple revocation ${kind} at ${stage}: ${detail}`);
    this.name = 'AppleRevocationError';
  }
}

function errorClass(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && /^[A-Z0-9_]{1,60}$/.test(code)) return code;
  const name = (error as { name?: unknown } | null)?.name;
  return typeof name === 'string' && /^[A-Za-z]{1,40}$/.test(name) ? name : 'Error';
}

/** A fetch to Apple; a thrown request (timeout, DNS, reset) is transient. */
async function appleFetch(stage: 'token' | 'keys' | 'revoke', url: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try { response = await fetch(url, init); } catch (error) { throw new AppleRevocationError('transient', stage, errorClass(error)); }
  if (response.ok) return response;
  // Apple's documented error body is {"error":"invalid_client"}; only that code is kept.
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  const code = typeof body?.error === 'string' && /^[a-z_]{1,40}$/.test(body.error) ? body.error : 'unknown';
  const transient = response.status >= 500 || response.status === 429;
  throw new AppleRevocationError(transient ? 'transient' : 'rejected', stage, `${response.status} ${code}`);
}

/**
 * A 2xx body from Apple, parsed. The request's timeout still runs while the
 * body streams in, so a read that aborts or resets is transient like the
 * request itself; only a complete body that is not JSON is a rejection.
 */
async function appleJson(stage: 'token' | 'keys', url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await appleFetch(stage, url, init);
  let text: string;
  try { text = await response.text(); } catch (error) { throw new AppleRevocationError('transient', stage, errorClass(error)); }
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new AppleRevocationError('rejected', stage, 'malformed_body'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppleRevocationError('rejected', stage, 'malformed_body');
  return body as Record<string, unknown>;
}

function clientSecret(config: AppleConfig): string {
  try {
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const input = `${encode({ alg: 'ES256', kid: config.keyId })}.${encode({ iss: config.teamId, iat: now, exp: now + 300, aud: APPLE, sub: config.clientId })}`;
    const signature = sign('sha256', Buffer.from(input), { key: config.privateKey, dsaEncoding: 'ieee-p1363' });
    return `${input}.${signature.toString('base64url')}`;
  } catch (error) {
    throw new AppleRevocationError('rejected', 'config', errorClass(error));
  }
}

export function appleRevocationConfigured(): boolean {
  return appleConfig() !== null;
}

/**
 * Configured AND able to sign a client secret. A malformed .p8 (no PEM armor,
 * wrong key type) is caught here, before the app asks the user to re-authorize
 * with Apple for a revocation that could never be sent.
 */
export function appleRevocationReady(): boolean {
  const config = appleConfig();
  if (!config) return false;
  try { clientSecret(config); return true; } catch (error) {
    console.error('[account-delete] apple revocation key unusable', error instanceof AppleRevocationError ? error.detail : 'unknown');
    return false;
  }
}

export async function verifyAppleIdentity(token: string, expectedSubject: string, clientId: string): Promise<void> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new AppleRevocationError('rejected', 'identity', 'malformed');
  let header: { alg?: unknown; kid?: unknown }, claims: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  } catch { throw new AppleRevocationError('rejected', 'identity', 'malformed'); }
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || claims.iss !== APPLE || claims.aud !== clientId || claims.sub !== expectedSubject ||
     typeof claims.exp !== 'number' || claims.exp <= now || typeof claims.iat !== 'number' || claims.iat > now + 60) {
    throw new AppleRevocationError('rejected', 'identity', claims.sub !== expectedSubject ? 'subject_mismatch' : 'claims');
  }
  const { keys } = await appleJson('keys', `${APPLE}/auth/keys`, { signal: AbortSignal.timeout(5000) }) as { keys?: unknown };
  if (!Array.isArray(keys)) throw new AppleRevocationError('rejected', 'keys', 'malformed_body');
  const key = (keys as Array<JsonWebKey & { kid?: string; alg?: string }>).find(key => key?.kid === header.kid && key.kty === 'RSA' && key.alg === 'RS256');
  let valid = false;
  try {
    valid = Boolean(key) && verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: key!, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
  } catch { valid = false; }
  if (!valid) throw new AppleRevocationError('rejected', 'identity', 'signature');
}

/**
 * Exchange a fresh, single-use native authorization code and revoke the
 * resulting token. Throws AppleRevocationError; no Apple token is logged or
 * persisted.
 */
export async function revokeAppleAuthorization(code: string, subject: string): Promise<void> {
  if (!code || code.length > 4096) throw new AppleRevocationError('rejected', 'token', 'missing_code');
  const config = appleConfig();
  if (!config) throw new AppleRevocationError('rejected', 'config', 'not_configured');
  const client_id = config.clientId;
  const client_secret = clientSecret(config);
  // A body read that times out after Apple answered 200 is transient (503,
  // nothing deleted): Apple already issued a token, and a retry with a fresh
  // code revokes it. It must not read as a missing id_token.
  const tokens = await appleJson('token', `${APPLE}/auth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(8000),
    body: new URLSearchParams({ client_id, client_secret, code, grant_type: 'authorization_code' }),
  });
  const text = (value: unknown) => typeof value === 'string' && value ? value : undefined;
  const idToken = text(tokens.id_token), refreshToken = text(tokens.refresh_token);
  if (!idToken) throw new AppleRevocationError('rejected', 'token', 'no_id_token');
  await verifyAppleIdentity(idToken, subject, client_id);
  const token = refreshToken ?? text(tokens.access_token);
  if (!token) throw new AppleRevocationError('rejected', 'token', 'no_revocable_token');
  // Apple's revoke answers 200 with an empty body; nothing is read from it.
  await appleFetch('revoke', `${APPLE}/auth/revoke`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(8000),
    body: new URLSearchParams({ client_id, client_secret, token, token_type_hint: refreshToken ? 'refresh_token' : 'access_token' }),
  });
}
