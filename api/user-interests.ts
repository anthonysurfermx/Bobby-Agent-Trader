// /api/user-interests — which assets a wallet keeps asking about (feeds the
// proactive digest). Scoped to the wallet proven by the session token.
//   GET  ?limit=N → active interests of the session wallet
//   POST { assets, context } → upsert (wallet comes from the session)
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { requireWalletSession } from './_lib/wallet-session.js';
import { guardWrite, WALLET_RE } from './_lib/write-guard.js';

export const config = { maxDuration: 10 };

const Body = z.object({
  wallet: z.string().regex(WALLET_RE).optional(),
  assets: z.array(z.string().regex(/^[A-Z0-9][A-Z0-9.-]{0,19}$/)).min(1).max(10),
  context: z.string().max(500).default(''),
});

async function list(req: VercelRequest, res: VercelResponse) {
  const session = requireWalletSession(req, res);
  if (!session) return;
  const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '8'), 10) || 8));
  try {
    const r = await fetch(bobbyRest(`user_interests?wallet_address=eq.${session.wallet}&active=eq.true&order=created_at.desc&limit=${limit}&select=id,asset,context,last_conviction,target_threshold,created_at`), { headers: bobbyServiceHeaders() });
    if (!r.ok) return res.status(502).json({ error: 'Could not load interests' });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(await r.json());
  } catch (error) {
    console.error('[user-interests] list', error);
    return res.status(500).json({ error: 'Interests read failed' });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return list(req, res);
  const guarded = await guardWrite(req, res, {
    methods: ['POST'],
    scope: 'user-interests',
    schema: Body,
    perIp: { limit: 30, windowSec: 60 },
    perSubject: { key: (_b, wallet) => wallet, limit: 120, windowSec: 3600 },
  });
  if (!guarded || !guarded.wallet) return;
  const wallet = guarded.wallet;
  const context = guarded.body.context.slice(0, 500);
  let updated = 0;
  let inserted = 0;
  try {
    for (const raw of guarded.body.assets) {
      const asset = raw.split('-')[0]; // BTC-USDT → BTC
      const existing = await fetch(bobbyRest(`user_interests?wallet_address=eq.${wallet}&asset=eq.${encodeURIComponent(asset)}&active=eq.true&select=id&limit=1`), { headers: bobbyServiceHeaders() });
      const rows = existing.ok ? ((await existing.json()) as Array<{ id: string }>) : [];
      if (rows.length > 0) {
        const r = await fetch(bobbyRest(`user_interests?id=eq.${rows[0].id}`), { method: 'PATCH', headers: bobbyServiceHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ context, target_threshold: 0.75 }) });
        if (r.ok) updated += 1;
      } else {
        const r = await fetch(bobbyRest('user_interests'), { method: 'POST', headers: bobbyServiceHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ wallet_address: wallet, asset, context, target_threshold: 0.75, active: true }) });
        if (r.ok) inserted += 1;
      }
    }
    return res.status(200).json({ ok: true, updated, inserted });
  } catch (error) {
    console.error('[user-interests]', error);
    return res.status(500).json({ error: 'Could not save interests' });
  }
}
