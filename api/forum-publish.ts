// POST /api/forum-publish — publish a user debate from the chat to the public
// forum (thread + agent posts). Replaces the browser's direct PostgREST
// inserts on forum_threads / forum_posts. The server fixes the provenance
// (trigger_reason, expiry, owner_wallet = the session wallet) and validates
// every field; the client cannot set status, resolution, prices at creation
// or ids. Requires a wallet session AND a transcript receipt: the posts and
// the agent identities are parsed here from the transcript Bobby actually
// streamed (HMAC-signed by openclaw-chat), never taken from the client.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { parseDebateSections, verifyTranscriptReceipt } from './_lib/transcript-receipt.js';
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
  /** The exact text streamed by /api/openclaw-chat … */
  transcript: z.string().min(40).max(60_000),
  /** … and the receipt it emitted for that text. */
  receipt: z.string().min(20).max(200),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const guarded = await guardWrite(req, res, {
    methods: ['POST'],
    scope: 'forum-publish',
    schema: Body,
    perIp: { limit: 6, windowSec: 3600 },
    perSubject: { key: (_b, wallet) => wallet, limit: 12, windowSec: 86400 },
    maxBodyBytes: 96 * 1024,
  });
  if (!guarded || !guarded.wallet) return;
  const b = guarded.body;
  const verified = verifyTranscriptReceipt(b.transcript, b.receipt);
  if (verified.ok !== true) return res.status(403).json({ error: `Transcript not accepted: ${(verified as { error: string }).error}` });
  const posts = parseDebateSections(b.transcript);
  if (posts.length < 2) return res.status(400).json({ error: 'Transcript has no debate sections' });
  // Metadata is client-parsed from the CIO text; require the symbol to be in the transcript at least.
  if (!b.transcript.toUpperCase().includes(b.symbol.toUpperCase())) return res.status(400).json({ error: 'Symbol not present in transcript' });
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  try {
    const threadRes = await fetch(bobbyRest('forum_threads'), {
      method: 'POST',
      headers: bobbyServiceHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({
        topic: b.topic,
        trigger_reason: 'User debate in Bobby Chat',
        trigger_data: { source: 'bobby-chat', published_by: guarded.wallet, transcript_receipt_issued_at: new Date(verified.issuedAt).toISOString(), fields_source: 'client-parsed-from-cio-text' },
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
    for (const post of posts) {
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
