// POST /api/telegram-connect — start a Telegram DM connection: the server
// mints the one-time connect token and stores the pending row. Replaces the
// browser's direct PostgREST insert on telegram_connections (which also
// carried a hardcoded key). The token is what the user sends to the bot.
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
    perSubject: { key: (b) => b.wallet?.toLowerCase() ?? null, limit: 10, windowSec: 86400 },
  });
  if (!guarded) return;
  const token = randomUUID().replace(/-/g, '').slice(0, 12);
  try {
    const r = await fetch(bobbyRest('telegram_connections'), {
      method: 'POST',
      headers: bobbyServiceHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        wallet_address: guarded.body.wallet?.toLowerCase() ?? null,
        agent_profile_id: guarded.body.agentProfileId ?? null,
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
