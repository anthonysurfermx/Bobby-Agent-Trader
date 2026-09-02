// POST /api/wallet-session — exchange a signed message for a session token.
// GET  /api/wallet-session — describe the session on the request (for the
//                            browser to validate a cached token).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { checkPersistentLimit } from './_lib/rate-limit-persistent.js';
import { createLimiter, getClientIpKey } from './_lib/rate-limit.js';
import { issueWalletSession, verifyWalletProof, walletSessionFromRequest, WalletSessionConfigError } from './_lib/wallet-session.js';

export const config = { maxDuration: 10 };

const Body = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  timestamp: z.string().min(10).max(40),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
});

const memLimiter = createLimiter(30, 60_000);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const session = walletSessionFromRequest(req);
    if (!session) return res.status(401).json({ ok: false, error: 'No valid session' });
    return res.status(200).json({ ok: true, wallet: session.wallet, expiresAt: new Date(session.expiresAt).toISOString() });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const ipKey = getClientIpKey(req);
  if (memLimiter.check(ipKey).limited) return res.status(429).json({ error: 'Too many requests' });
  const persisted = await checkPersistentLimit('wallet-session', ipKey, 30, 60);
  if (persisted.limited) return res.status(429).json({ error: 'Too many requests' });

  let raw: unknown = req.body;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { return res.status(400).json({ error: 'Invalid JSON' }); } }
  const parsed = Body.safeParse(raw ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });

  const proof = await verifyWalletProof(parsed.data as { address: string; timestamp: string; signature: string });
  if ('error' in proof) return res.status(401).json({ error: proof.error });
  try {
    const { token, session } = issueWalletSession(proof.wallet);
    return res.status(200).json({ ok: true, token, wallet: session.wallet, expiresAt: new Date(session.expiresAt).toISOString() });
  } catch (error) {
    if (error instanceof WalletSessionConfigError) return res.status(503).json({ error: 'Wallet sessions are not configured (BOBBY_SESSION_SECRET)' });
    console.error('[wallet-session]', error);
    return res.status(500).json({ error: 'Could not create session' });
  }
}
