// ============================================================
// wallet-session — proof that the caller owns the wallet it claims.
//
// Codex phase-0 review, blocker 3 (and review #2: no replay). Flow:
//
//   1. GET  /api/wallet-session?address=0x… → the server mints a single-use
//      nonce, stores its fields (address, domain, uri, chain, issued/expiry)
//      in api_cache for 10 minutes and returns the EIP-4361 message text.
//   2. The browser signs that text verbatim (wagmi signMessage).
//   3. POST /api/wallet-session { address, nonce, signature } → the server
//      CONSUMES the nonce atomically (single DELETE … RETURNING; a second
//      caller gets 0 rows), rebuilds the message from its stored fields,
//      recovers the signer and answers with an HMAC session token bound to
//      the wallet, valid 7 days.
//   4. The token travels as `x-bobby-session` (or Bearer) on later calls;
//      any wallet named in a request body must equal the token's wallet.
//
// Stateless after sign-in: BOBBY_SESSION_SECRET signs the token, nothing
// else is stored. Rotating the secret logs everyone out. Fail-closed when
// the secret or the database is missing.
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { recoverMessageAddress } from 'viem';
import { buildSignInMessage, type SignInFields } from '../../src/lib/wallet-session-message.js';
import { bobbyDbConfigured, bobbyRest, bobbyServiceHeaders } from './bobby-db.js';
import { DEFAULT_CHAIN } from './chains.js';
import { PRODUCTION_HOST } from './origins.js';

export const WALLET_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SIGN_IN_CHALLENGE_TTL_MS = 10 * 60 * 1000;
const TOKEN_PREFIX = 'bws';
const NONCE_KEY_PREFIX = 'ws-nonce:';
const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;
const NONCE_RE = /^[A-Za-z0-9_-]{16,64}$/;

export interface WalletSession {
  wallet: string;
  issuedAt: number;
  expiresAt: number;
}

export class WalletSessionConfigError extends Error {
  constructor(what = 'BOBBY_SESSION_SECRET is not configured') {
    super(what);
    this.name = 'WalletSessionConfigError';
  }
}

function secret(): Buffer {
  const raw = (process.env.BOBBY_SESSION_SECRET || '').trim();
  if (raw.length < 32) throw new WalletSessionConfigError();
  return Buffer.from(raw, 'utf8');
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(payload: string): Buffer {
  return createHmac('sha256', secret()).update(payload).digest();
}

// ---------- session token ----------

/** Mint a token for a wallet that has just proven ownership. */
export function issueWalletSession(wallet: string, now = Date.now()): { token: string; session: WalletSession } {
  const session: WalletSession = { wallet: wallet.toLowerCase(), issuedAt: now, expiresAt: now + WALLET_SESSION_TTL_MS };
  const payload = b64url(JSON.stringify({ w: session.wallet, i: session.issuedAt, e: session.expiresAt }));
  const token = `${TOKEN_PREFIX}.${payload}.${b64url(sign(payload))}`;
  return { token, session };
}

/** Parse and verify a token. Returns null for anything that is not a valid, unexpired session. */
export function verifyWalletSession(token: string, now = Date.now()): WalletSession | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return null;
  const [, payload, mac] = parts;
  let expected: Buffer;
  try { expected = sign(payload); } catch { return null; }
  let provided: Buffer;
  try { provided = Buffer.from(mac, 'base64url'); } catch { return null; }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { w?: unknown; i?: unknown; e?: unknown };
    if (typeof parsed.w !== 'string' || !WALLET_RE.test(parsed.w)) return null;
    if (typeof parsed.i !== 'number' || typeof parsed.e !== 'number') return null;
    if (parsed.e <= now || parsed.i > now + 60_000) return null;
    return { wallet: parsed.w.toLowerCase(), issuedAt: parsed.i, expiresAt: parsed.e };
  } catch {
    return null;
  }
}

/** Token from `x-bobby-session` or `Authorization: Bearer bws.…`. */
export function sessionTokenFromRequest(req: VercelRequest): string {
  const header = req.headers['x-bobby-session'];
  if (typeof header === 'string' && header) return header;
  const authorization = req.headers.authorization;
  if (typeof authorization === 'string' && authorization.startsWith(`Bearer ${TOKEN_PREFIX}.`)) {
    return authorization.slice('Bearer '.length);
  }
  return '';
}

/** Session on the request, or null (no response written). */
export function walletSessionFromRequest(req: VercelRequest): WalletSession | null {
  const token = sessionTokenFromRequest(req);
  return token ? verifyWalletSession(token) : null;
}

/** Fail-closed gate: answers 401 (or 503 when the secret is missing) and returns null. */
export function requireWalletSession(req: VercelRequest, res: VercelResponse): WalletSession | null {
  try {
    secret();
  } catch {
    res.status(503).json({ error: 'Wallet sessions are not configured (BOBBY_SESSION_SECRET)' });
    return null;
  }
  const session = walletSessionFromRequest(req);
  if (!session) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="bobby-wallet-session"');
    res.status(401).json({ error: 'Wallet session required', hint: 'GET /api/wallet-session?address=… then POST the signature' });
    return null;
  }
  return session;
}

// ---------- single-use sign-in challenge ----------

export function newSignInFields(address: string, domain: string, now = Date.now()): SignInFields {
  const host = domain || PRODUCTION_HOST;
  return {
    domain: host,
    address: address.toLowerCase(),
    uri: `${host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'}://${host}`,
    chainId: DEFAULT_CHAIN.id,
    nonce: randomBytes(18).toString('base64url'),
    issuedAt: new Date(now).toISOString(),
    expirationTime: new Date(now + SIGN_IN_CHALLENGE_TTL_MS).toISOString(),
  };
}

/** Store a fresh challenge (10 min) and return it with the text to sign. */
export async function createSignInChallenge(address: string, domain: string): Promise<{ nonce: string; message: string; expirationTime: string }> {
  if (!WALLET_RE.test(address)) throw new Error('Invalid address');
  if (!bobbyDbConfigured()) throw new WalletSessionConfigError('Sign-in challenges need the database (nonce store)');
  const fields = newSignInFields(address, domain);
  const r = await fetch(bobbyRest('api_cache'), {
    method: 'POST',
    headers: bobbyServiceHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ cache_key: `${NONCE_KEY_PREFIX}${fields.nonce}`, payload: fields, expires_at: fields.expirationTime, updated_at: fields.issuedAt }),
  });
  if (!r.ok) throw new Error(`Could not store sign-in challenge (HTTP ${r.status})`);
  return { nonce: fields.nonce, message: buildSignInMessage(fields), expirationTime: fields.expirationTime };
}

/**
 * Atomically consume a nonce: one DELETE … RETURNING. Returns the stored
 * fields exactly once; a replay (or an expired/unknown nonce) gets null.
 */
export async function consumeSignInChallenge(nonce: string, now = Date.now()): Promise<SignInFields | null> {
  if (!NONCE_RE.test(nonce)) return null;
  const r = await fetch(bobbyRest(`api_cache?cache_key=eq.${encodeURIComponent(`${NONCE_KEY_PREFIX}${nonce}`)}&expires_at=gt.${encodeURIComponent(new Date(now).toISOString())}&select=payload`), {
    method: 'DELETE',
    headers: bobbyServiceHeaders({ Prefer: 'return=representation' }),
  });
  if (!r.ok) return null;
  const rows = (await r.json()) as Array<{ payload?: SignInFields }>;
  const fields = rows[0]?.payload;
  return fields && typeof fields.nonce === 'string' && fields.nonce === nonce ? fields : null;
}

/** Pure check: the signature must be over the server-built message for these fields, by that address. */
export async function verifySignedChallenge(fields: SignInFields, address: string, signature: string, now = Date.now()): Promise<{ wallet: string } | { error: string }> {
  if (!WALLET_RE.test(address)) return { error: 'Invalid address' };
  if (fields.address !== address.toLowerCase()) return { error: 'Challenge was issued for another address' };
  if (Date.parse(fields.expirationTime) <= now) return { error: 'Challenge expired — sign in again' };
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return { error: 'Invalid signature' };
  let signer: string;
  try {
    signer = await recoverMessageAddress({ message: buildSignInMessage(fields), signature: signature as `0x${string}` });
  } catch {
    return { error: 'Signature could not be verified' };
  }
  if (signer.toLowerCase() !== address.toLowerCase()) return { error: 'Signature does not match address' };
  return { wallet: address.toLowerCase() };
}

/**
 * Consume the nonce, then verify. The nonce is burned even when the
 * signature is bad, so a captured signature cannot be retried. EOAs only —
 * smart-contract wallets (EIP-1271) are not supported yet.
 */
export async function verifyWalletProof(input: { address: string; nonce: string; signature: string }, now = Date.now()): Promise<{ wallet: string } | { error: string }> {
  const fields = await consumeSignInChallenge(String(input.nonce || ''), now);
  if (!fields) return { error: 'Unknown, expired or already used sign-in challenge' };
  return verifySignedChallenge(fields, String(input.address || ''), String(input.signature || ''), now);
}
