// ============================================================
// GET /api/sandbox-runs — Public feed of recent pressure-tests
// Returns the last N runs from sandbox_runs, ordered desc, for the
// "Last 20 pressure-tests" section under the Sandbox.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 10 };

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '20'), 10) || 20));
  const playbook = typeof req.query.playbook === 'string' ? req.query.playbook : '';
  const verdict = typeof req.query.verdict === 'string' ? req.query.verdict : '';
  const full = req.query.full === '1' || req.query.full === 'true';

  // Feed projection: compact unless ?full=1 (transcript only on expand)
  const cols = full
    ? '*'
    : 'id,created_at,playbook_slug,ticker,market_snapshot,cio_action,cio_conviction,verdict_action,guardrails_passed,guardrails_failed,guardrails_total,status,error_phase';

  const filters: string[] = [];
  if (playbook) filters.push(`playbook_slug=eq.${encodeURIComponent(playbook)}`);
  if (verdict) filters.push(`verdict_action=eq.${encodeURIComponent(verdict)}`);
  filters.push(`order=created_at.desc`);
  filters.push(`limit=${limit}`);

  const url = `${SB_URL}/rest/v1/sandbox_runs?select=${cols}&${filters.join('&')}`;

  try {
    const r = await fetch(url, {
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
      },
    });
    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      return res.status(r.status).json({ error: `Supabase ${r.status}`, detail: errText.slice(0, 200) });
    }
    const rows = await r.json();
    res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');
    return res.status(200).json({ ok: true, runs: rows });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to fetch runs' });
  }
}
