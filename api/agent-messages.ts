// /api/agent-messages — the proactive inbox. Every method is scoped to the
// wallet proven by the session token (see _lib/wallet-session.ts); a caller
// can never name another wallet.
//   GET    ?unread=1&limit=N&order=asc|desc → the wallet's messages
//   PATCH  { id }                            → mark one message as read
//   DELETE {}                                → clear the wallet's history
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { requireWalletSession } from './_lib/wallet-session.js';
import { guardWrite, WALLET_RE } from './_lib/write-guard.js';

export const config = { maxDuration: 10 };

const Body = z.object({
  wallet: z.string().regex(WALLET_RE).optional(),
  id: z.string().uuid().optional(),
});

async function list(req: VercelRequest, res: VercelResponse) {
  const session = requireWalletSession(req, res);
  if (!session) return;
  const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '50'), 10) || 50));
  const order = req.query.order === 'desc' ? 'desc' : 'asc';
  const unread = req.query.unread === '1' || req.query.unread === 'true';
  const filter = `wallet_address=eq.${session.wallet}${unread ? '&read=eq.false' : ''}`;
  try {
    const r = await fetch(bobbyRest(`agent_messages?${filter}&order=created_at.${order}&limit=${limit}&select=id,wallet_address,advisor_name,message,read,created_at`), { headers: bobbyServiceHeaders() });
    if (!r.ok) return res.status(502).json({ error: 'Could not load messages' });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(await r.json());
  } catch (error) {
    console.error('[agent-messages] list', error);
    return res.status(500).json({ error: 'Inbox read failed' });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return list(req, res);
  const guarded = await guardWrite(req, res, {
    methods: ['PATCH', 'DELETE'],
    scope: 'agent-messages',
    schema: Body,
    perIp: { limit: 60, windowSec: 60 },
    perSubject: { key: (_b, wallet) => wallet, limit: 300, windowSec: 3600 },
  });
  if (!guarded || !guarded.wallet) return;
  const wallet = guarded.wallet;
  try {
    if (req.method === 'PATCH') {
      if (!guarded.body.id) return res.status(400).json({ error: 'id is required' });
      const r = await fetch(bobbyRest(`agent_messages?id=eq.${guarded.body.id}&wallet_address=eq.${wallet}`), { method: 'PATCH', headers: bobbyServiceHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ read: true }) });
      if (!r.ok) return res.status(502).json({ error: 'Could not update message' });
      return res.status(200).json({ ok: true });
    }
    const r = await fetch(bobbyRest(`agent_messages?wallet_address=eq.${wallet}`), { method: 'DELETE', headers: bobbyServiceHeaders({ Prefer: 'return=minimal' }) });
    if (!r.ok) return res.status(502).json({ error: 'Could not clear messages' });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[agent-messages]', error);
    return res.status(500).json({ error: 'Inbox write failed' });
  }
}
