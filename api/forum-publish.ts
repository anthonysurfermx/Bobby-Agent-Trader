// POST /api/forum-publish — publish a Bobby debate from the chat to the
// public forum. The client sends ONLY { transcript, receipt, language }:
//   - the receipt (HMAC, issued by /api/openclaw-chat) carries the transcript
//     hash, the trade fields parsed server-side and the wallet that asked;
//   - the posts and their agent identities are parsed here from the
//     verified transcript;
//   - publication is ONE RPC (bobby_publish_debate) that records the receipt
//     id as a primary key and creates thread + posts atomically, so a
//     receipt can be used exactly once and a debate is never half-written.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { parseDebateSections, verifyTranscriptReceipt } from './_lib/transcript-receipt.js';
import { guardWrite, WALLET_RE } from './_lib/write-guard.js';

export const config = { maxDuration: 15 };

const Body = z.object({
  wallet: z.string().regex(WALLET_RE).optional(),
  language: z.enum(['es', 'en']).default('es'),
  /** The exact text streamed by /api/openclaw-chat … */
  transcript: z.string().min(40).max(60_000),
  /** … and the structured receipt it emitted for that text. */
  receipt: z.string().min(40).max(4000),
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
  const { payload } = verified;
  if (payload.wallet && payload.wallet !== guarded.wallet) return res.status(403).json({ error: 'Receipt belongs to another wallet' });
  if (!payload.p) return res.status(400).json({ error: 'Debate has no publishable trade fields' });
  const posts = parseDebateSections(b.transcript);
  if (posts.length < 2) return res.status(400).json({ error: 'Transcript has no debate sections' });

  const f = payload.f;
  const topic = `${f.symbol} ${f.direction === 'short' ? 'short' : f.direction === 'long' ? 'long' : 'call'} · ${f.conviction_score}%`;
  try {
    const r = await fetch(bobbyRest('rpc/bobby_publish_debate'), {
      method: 'POST',
      headers: bobbyServiceHeaders(),
      body: JSON.stringify({
        p_receipt_id: payload.id,
        p_wallet: guarded.wallet,
        p_thread: {
          topic,
          language: b.language,
          conviction_score: f.conviction_score,
          symbol: f.symbol,
          direction: f.direction,
          entry_price: f.entry_price,
          stop_price: f.stop_price,
          target_price: f.target_price,
          expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          trigger_data: { source: 'bobby-chat', published_by: guarded.wallet, receipt_id: payload.id, receipt_issued_at: new Date(payload.iat).toISOString(), fields_source: 'server-parsed', transcript_sha256: payload.th },
        },
        p_posts: posts,
      }),
    });
    if (r.status === 409) return res.status(409).json({ error: 'This debate was already published (receipt consumed)' });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      if (/23505|duplicate key/.test(text)) return res.status(409).json({ error: 'This debate was already published (receipt consumed)' });
      console.error('[forum-publish] rpc failed', r.status, text);
      return res.status(502).json({ error: 'Could not publish debate' });
    }
    const threadId = (await r.json()) as string;
    return res.status(200).json({ ok: true, threadId, posted: posts.length, receiptId: payload.id });
  } catch (error) {
    console.error('[forum-publish]', error);
    return res.status(500).json({ error: 'Publish failed' });
  }
}
