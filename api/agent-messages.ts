// /api/agent-messages — the proactive inbox, write side.
//   PATCH  { wallet, id }   → mark one message as read (scoped to the wallet)
//   DELETE { wallet }       → clear the wallet's history
// Replaces the browser's direct PostgREST PATCH/DELETE on agent_messages.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { guardWrite, WALLET_RE } from './_lib/write-guard.js';

export const config = { maxDuration: 10 };

const Body = z.object({
  wallet: z.string().regex(WALLET_RE),
  id: z.string().uuid().optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const guarded = await guardWrite(req, res, {
    methods: ['PATCH', 'DELETE'],
    scope: 'agent-messages',
    schema: Body,
    perIp: { limit: 60, windowSec: 60 },
    perSubject: { key: (b) => b.wallet.toLowerCase(), limit: 300, windowSec: 3600 },
  });
  if (!guarded) return;
  const wallet = guarded.body.wallet.toLowerCase();
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
