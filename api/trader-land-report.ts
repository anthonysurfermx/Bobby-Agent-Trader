// Anonymous visitors can report public content without creating an account.
// A report enters a private human-review queue; it cannot ban another user.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { guardWrite } from './_lib/write-guard.js';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { reporterHash } from './_lib/trader-land-moderation.js';

export const config = { maxDuration: 10 };
const Report = z.object({
  code: z.string().regex(/^[a-z0-9]{10}$/),
  installation: z.string().uuid(),
  reason: z.enum(['offensive', 'harassment', 'spam', 'other']),
  details: z.string().trim().max(500).default(''),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const guarded = await guardWrite(req, res, {
    methods: ['POST'], scope: 'trader-land-report', schema: Report, auth: 'none', allowNoOrigin: true,
    maxBodyBytes: 2048, perIp: { limit: 10, windowSec: 3600 },
    perSubject: { key: body => reporterHash(body.installation), limit: 5, windowSec: 3600 },
  });
  if (!guarded) return;
  const { code, installation, reason, details } = guarded.body;
  try {
    const read = await fetch(bobbyRest(`tl_lands?share_code=eq.${code}&visibility=eq.public&moderation_status=eq.approved&community_blocked=eq.false&select=identity_id,title&limit=1`), { headers: bobbyServiceHeaders() });
    if (!read.ok) throw new Error('Island lookup unavailable');
    const island = ((await read.json()) as Array<{ identity_id: string; title: string | null }>)[0];
    if (!island) return res.status(404).json({ error: 'Island unavailable' });
    const saved = await fetch(bobbyRest('tl_content_reports?on_conflict=reporter_hash,target_identity'), {
      method: 'POST', headers: bobbyServiceHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      // A later report reopens the same queue item instead of silently discarding
      // a new incident after an operator resolved the previous one.
      body: JSON.stringify({ reporter_hash: reporterHash(installation), target_identity: island.identity_id, code, title: island.title, reason, details, status: 'open', reviewed_at: null }),
    });
    if (!saved.ok) throw new Error('Report could not be saved');
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(503).json({ error: 'Report unavailable. Please try again.' });
  }
}
