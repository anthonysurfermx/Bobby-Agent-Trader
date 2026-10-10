// ============================================================
// GET /api/chat-analyze — RETIRED (2026-10-09)
// The Claw Trader chat scan (hackathon page): it took a person's budget
// and risk level and returned a side and a Kelly-sized bet per market.
// Bobby never sizes a position for a person.
// 410 so integrations fail loudly.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 5 };

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(410).json({ ok: false, code: 'chat_analyze_retired', error: 'chat-analyze is retired: Bobby does not size a position from a budget or risk level' });
}
