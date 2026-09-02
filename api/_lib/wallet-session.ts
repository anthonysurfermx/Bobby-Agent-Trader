// ============================================================
// wallet-session — proof that the caller owns the wallet it claims.
//
// Codex phase-0 review, blocker 3: origin and rate limits are not
// authorization. Every endpoint that reads or writes data belonging to a
// wallet now requires a session token:
//
//   1. POST /api/wallet-session { address, timestamp, signature } — the
//      browser signs buildWalletSessionMessage() once (wagmi signMessage).
//   2. The server recovers the signer, checks the timestamp window and
//      answers with an HMAC token bound to that wallet, valid 7 days.
//   3. The token travels as `x-bobby-session` (or Bearer) on later calls;
//      the wallet in the request body must equal the wallet in the token.
//
// Stateless: BOBBY_SESSION_SECRET signs the token, nothing is stored.
// Rotating the secret logs everyone out. Fail-closed when it is missing.
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { recoverMessageAddress } from 'viem';
import { buildWalletSessionMessage } from '../../src/lib/wallet-session-message.js';

export const WALLET_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const WALLET_SESSION_SIGN_WINDOW_MS = 10 * 60 * 1000;
const TOKEN_PREFIX = 'bws';
const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;

export interface WalletSession {
  wallet: string;
  issuedAt: number;
  expiresAt: number;
}

export class WalletSessionConfigError extends Error {
  constructor() {
    super('BOBBY_SESSION_SECRET is not configured');
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
    res.status(401).json({ error: 'Wallet session required', hint: 'POST /api/wallet-session with a signed message' });
    return null;
  }
  return session;
}

/**
 * Verify a fresh signature over buildWalletSessionMessage(). Returns the
 * wallet (lower-case) or an error string. Uses ecrecover, so EOAs only —
 * smart-contract wallets (EIP-1271) are not supported yet.
 */
export async function verifyWalletProof(input: { address: string; timestamp: string; signature: string }, now = Date.now()): Promise<{ wallet: string } | { error: string }> {
  const address = String(input.address || '');
  if (!WALLET_RE.test(address)) return { error: 'Invalid address' };
  const tsMs = Date.parse(String(input.timestamp || ''));
  if (!Number.isFinite(tsMs)) return { error: 'Invalid timestamp' };
  const age = now - tsMs;
  if (age > WALLET_SESSION_SIGN_WINDOW_MS || age < -60_000) return { error: 'Stale timestamp — sign again' };
  const signature = String(input.signature || '');
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return { error: 'Invalid signature' };
  const message = buildWalletSessionMessage(address, String(input.timestamp));
  let signer: string;
  try {
    signer = await recoverMessageAddress({ message, signature: signature as `0x${string}` });
  } catch {
    return { error: 'Signature could not be verified' };
  }
  if (signer.toLowerCase() !== address.toLowerCase()) return { error: 'Signature does not match address' };
  return { wallet: address.toLowerCase() };
}
