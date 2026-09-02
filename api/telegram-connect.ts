// POST /api/telegram-connect — start a Telegram DM connection: the server
// mints the one-time connect token and stores the pending row for the
// SESSION wallet. An optional agentProfileId must belong to that wallet.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { guardWrite, WALLET_RE } from './_lib/write-guard.js';

export const config = { maxDuration: 10 };

const Body = z.object({
  wallet: z.string().regex(WALLET_RE).optional(),
  agentProfileId: z.string().uuid().optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const guarded = await guardWrite(req, res, {
    methods: ['POST'],
    scope: 'telegram-connect',
    schema: Body,
    perIp: { limit: 5, windowSec: 3600 },
    perSubject: { key: (_b, wallet) => wallet, limit: 10, windowSec: 86400 },
  });
  if (!guarded || !guarded.wallet) return;
  const wallet = guarded.wallet;
  let agentProfileId: string | null = null;
  try {
    if (guarded.body.agentProfileId) {
      const check = await fetch(bobbyRest(`agent_profiles?id=eq.${guarded.body.agentProfileId}&wallet_address=eq.${wallet}&select=id&limit=1`), { headers: bobbyServiceHeaders() });
      const rows = check.ok ? ((await check.json()) as Array<{ id: string }>) : [];
      if (rows.length === 0) return res.status(403).json({ error: 'Agent profile does not belong to this wallet' });
      agentProfileId = rows[0].id;
    }
    const token = randomUUID().replace(/-/g, '').slice(0, 12);
    const r = await fetch(bobbyRest('telegram_connections'), {
      method: 'POST',
      headers: bobbyServiceHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        wallet_address: wallet,
        agent_profile_id: agentProfileId,
        telegram_user_id: 0,
        telegram_chat_id: 0,
        connect_token: token,
        status: 'pending',
      }),
    });
    if (!r.ok) {
      console.error('[telegram-connect] insert failed', r.status, await r.text().catch(() => ''));
      return res.status(502).json({ error: 'Could not start connection' });
    }
    return res.status(200).json({ ok: true, token });
  } catch (error) {
    console.error('[telegram-connect]', error);
    return res.status(500).json({ error: 'Connection failed' });
  }
}
