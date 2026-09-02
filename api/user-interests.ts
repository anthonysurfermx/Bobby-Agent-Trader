// POST /api/user-interests — record which assets a wallet keeps asking about
// (feeds the proactive digest). Replaces the browser's direct PostgREST
// upsert on user_interests (phase 0: no more anon-key writes).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { guardWrite, WALLET_RE } from './_lib/write-guard.js';

export const config = { maxDuration: 10 };

const Body = z.object({
  wallet: z.string().regex(WALLET_RE),
  assets: z.array(z.string().regex(/^[A-Z0-9][A-Z0-9.-]{0,19}$/)).min(1).max(10),
  context: z.string().max(500).default(''),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const guarded = await guardWrite(req, res, {
    methods: ['POST'],
    scope: 'user-interests',
    schema: Body,
    perIp: { limit: 30, windowSec: 60 },
    perSubject: { key: (b) => b.wallet.toLowerCase(), limit: 120, windowSec: 3600 },
  });
  if (!guarded) return;
  const wallet = guarded.body.wallet.toLowerCase();
  const context = guarded.body.context.slice(0, 500);
  let updated = 0;
  let inserted = 0;
  try {
    for (const raw of guarded.body.assets) {
      const asset = raw.split('-')[0]; // BTC-USDT → BTC
      const existing = await fetch(bobbyRest(`user_interests?wallet_address=eq.${wallet}&asset=eq.${encodeURIComponent(asset)}&active=eq.true&select=id&limit=1`), { headers: bobbyServiceHeaders() });
      const rows = existing.ok ? ((await existing.json()) as Array<{ id: string }>) : [];
      if (rows.length > 0) {
        await fetch(bobbyRest(`user_interests?id=eq.${rows[0].id}`), { method: 'PATCH', headers: bobbyServiceHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ context, target_threshold: 0.75 }) });
        updated += 1;
      } else {
        await fetch(bobbyRest('user_interests'), { method: 'POST', headers: bobbyServiceHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ wallet_address: wallet, asset, context, target_threshold: 0.75, active: true }) });
        inserted += 1;
      }
    }
    return res.status(200).json({ ok: true, updated, inserted });
  } catch (error) {
    console.error('[user-interests]', error);
    return res.status(500).json({ error: 'Could not save interests' });
  }
}
