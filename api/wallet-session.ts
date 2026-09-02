// /api/wallet-session — sign in with the wallet (EIP-4361 style, single-use nonce).
//   GET  ?address=0x…            → { nonce, message, expirationTime } to sign
//   POST { address, nonce, signature } → { token, wallet, expiresAt }
//   GET  (with session header)   → describe the session on the request
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requestOriginHost } from './_lib/origins.js';
import { checkPersistentLimit } from './_lib/rate-limit-persistent.js';
import { createLimiter, getClientIpKey } from './_lib/rate-limit.js';
import { createSignInChallenge, issueWalletSession, verifyWalletProof, walletSessionFromRequest, WalletSessionConfigError } from './_lib/wallet-session.js';

export const config = { maxDuration: 10 };

const ADDRESS = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const Body = z.object({
  address: ADDRESS,
  nonce: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
});

const memLimiter = createLimiter(30, 60_000);

async function limited(req: VercelRequest, res: VercelResponse, scope: string): Promise<boolean> {
  const ipKey = getClientIpKey(req);
  if (memLimiter.check(ipKey).limited) { res.status(429).json({ error: 'Too many requests' }); return true; }
  const persisted = await checkPersistentLimit(scope, ipKey, 30, 60);
  if (persisted.limited) { res.status(429).json({ error: 'Too many requests' }); return true; }
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    const address = typeof req.query.address === 'string' ? req.query.address : '';
    if (!address) {
      const session = walletSessionFromRequest(req);
      if (!session) return res.status(401).json({ ok: false, error: 'No valid session' });
      return res.status(200).json({ ok: true, wallet: session.wallet, expiresAt: new Date(session.expiresAt).toISOString() });
    }
    if (!ADDRESS.safeParse(address).success) return res.status(400).json({ error: 'Invalid address' });
    if (await limited(req, res, 'wallet-session-challenge')) return;
    const domain = requestOriginHost(req.headers);
    if (!domain) return res.status(403).json({ error: 'Origin not allowed' });
    try {
      const challenge = await createSignInChallenge(address, domain);
      return res.status(200).json({ ok: true, ...challenge });
    } catch (error) {
      if (error instanceof WalletSessionConfigError) return res.status(503).json({ error: error.message });
      console.error('[wallet-session] challenge', error);
      return res.status(500).json({ error: 'Could not create sign-in challenge' });
    }
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (await limited(req, res, 'wallet-session')) return;
  let raw: unknown = req.body;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { return res.status(400).json({ error: 'Invalid JSON' }); } }
  const parsed = Body.safeParse(raw ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });

  const proof = await verifyWalletProof(parsed.data as { address: string; nonce: string; signature: string });
  if ('error' in proof) return res.status(401).json({ error: proof.error });
  try {
    const { token, session } = issueWalletSession(proof.wallet);
    return res.status(200).json({ ok: true, token, wallet: session.wallet, expiresAt: new Date(session.expiresAt).toISOString() });
  } catch (error) {
    if (error instanceof WalletSessionConfigError) return res.status(503).json({ error: error.message });
    console.error('[wallet-session]', error);
    return res.status(500).json({ error: 'Could not create session' });
  }
}
