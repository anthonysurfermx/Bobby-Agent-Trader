// POST /api/forum-publish — publish a user debate from the chat to the public
// forum (thread + agent posts). Replaces the browser's direct PostgREST
// inserts on forum_threads / forum_posts. The server fixes the provenance
// (trigger_reason, expiry, owner_wallet = the session wallet) and validates
// every field; the client cannot set status, resolution, prices at creation
// or ids. Requires a wallet session: an anonymous caller could otherwise
// publish posts impersonating cio / red_team / bobby.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { guardWrite, WALLET_RE } from './_lib/write-guard.js';

export const config = { maxDuration: 15 };

const Price = z.number().finite().positive().nullable().optional();

const Body = z.object({
  wallet: z.string().regex(WALLET_RE).optional(),
  language: z.enum(['es', 'en']).default('es'),
  topic: z.string().trim().min(3).max(200),
  symbol: z.string().regex(/^[A-Z0-9][A-Z0-9.-]{0,11}$/),
  direction: z.enum(['long', 'short', 'neutral']),
  conviction_score: z.number().int().min(0).max(100),
  entry_price: Price,
  stop_price: Price,
  target_price: Price,
  posts: z.array(z.object({
    agent: z.enum(['alpha_hunter', 'red_team', 'cio', 'alpha', 'red', 'bobby']),
    content: z.string().trim().min(1).max(4000),
  })).min(1).max(6),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const guarded = await guardWrite(req, res, {
    methods: ['POST'],
    scope: 'forum-publish',
    schema: Body,
    perIp: { limit: 6, windowSec: 3600 },
    perSubject: { key: (_b, wallet) => wallet, limit: 12, windowSec: 86400 },
    maxBodyBytes: 40 * 1024,
  });
  if (!guarded || !guarded.wallet) return;
  const b = guarded.body;
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  try {
    const threadRes = await fetch(bobbyRest('forum_threads'), {
      method: 'POST',
      headers: bobbyServiceHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({
        topic: b.topic,
        trigger_reason: 'User debate in Bobby Chat',
        trigger_data: { source: 'bobby-chat', published_by: guarded.wallet },
        language: b.language,
        conviction_score: b.conviction_score,
        price_at_creation: {},
        symbol: b.symbol,
        direction: b.direction,
        entry_price: b.entry_price ?? null,
        stop_price: b.stop_price ?? null,
        target_price: b.target_price ?? null,
        expires_at: expiresAt,
        scope: 'public',
        owner_wallet: guarded.wallet,
      }),
    });
    if (!threadRes.ok) {
      console.error('[forum-publish] thread insert failed', threadRes.status, await threadRes.text().catch(() => ''));
      return res.status(502).json({ error: 'Could not create thread' });
    }
    const rows = (await threadRes.json()) as Array<{ id: string }>;
    const threadId = rows[0]?.id;
    if (!threadId) return res.status(502).json({ error: 'Thread id missing' });
    let posted = 0;
    for (const post of b.posts) {
      const r = await fetch(bobbyRest('forum_posts'), {
        method: 'POST',
        headers: bobbyServiceHeaders({ Prefer: 'return=minimal' }),
        body: JSON.stringify({ thread_id: threadId, agent: post.agent, content: post.content, data_snapshot: {} }),
      });
      if (r.ok) posted += 1;
    }
    return res.status(200).json({ ok: true, threadId, posted });
  } catch (error) {
    console.error('[forum-publish]', error);
    return res.status(500).json({ error: 'Publish failed' });
  }
}
