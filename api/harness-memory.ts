// ============================================================
// GET /api/harness-memory — Query Bobby's experiential memory
// Returns distilled episodes from the memory_objects table.
// Supports filtering by kind, symbol, outcome, and regime.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 10 };

const SB_URL = process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET only' });
  }

  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const kind = req.query.kind as string | undefined;
  const symbol = req.query.symbol as string | undefined;
  const outcome = req.query.outcome as string | undefined;

  let filters = '';
  if (kind) filters += `&kind=eq.${kind}`;
  if (symbol) filters += `&symbol=eq.${symbol}`;
  if (outcome) filters += `&outcome=eq.${outcome}`;

  try {
    const response = await fetch(
      `${SB_URL}/rest/v1/memory_objects?order=created_at.desc&limit=${limit}${filters}`,
      {
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
        },
      }
    );

    if (!response.ok) {
      // Table might not exist yet
      return res.status(200).json({
        ok: true,
        source: 'memory_objects',
        count: 0,
        memories: [],
        note: 'Table may not exist. Run the migration SQL in Supabase dashboard.',
      });
    }

    const memories = await response.json();

    // Compute memory stats
    const episodes = (memories as Array<Record<string, unknown>>).filter(m => m.kind === 'episode');
    const outcomes: Record<string, number> = {};
    const symbols: Record<string, number> = {};
    const regimes: Record<string, number> = {};

    for (const ep of episodes) {
      const o = ep.outcome as string || 'unknown';
      const s = ep.symbol as string || 'unknown';
      const r = ep.regime as string || 'unknown';
      outcomes[o] = (outcomes[o] || 0) + 1;
      symbols[s] = (symbols[s] || 0) + 1;
      regimes[r] = (regimes[r] || 0) + 1;
    }

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    return res.status(200).json({
      ok: true,
      source: 'memory_objects',
      count: (memories as unknown[]).length,
      memories,
      stats: {
        total_episodes: episodes.length,
        outcome_distribution: outcomes,
        symbol_distribution: symbols,
        regime_distribution: regimes,
      },
      memory_levels: {
        L0: 'Raw traces → agent_events',
        L1: 'Episodes → memory_objects (kind=episode)',
        L2: 'Heuristics → memory_objects (kind=heuristic) [future]',
        L3: 'Calibration priors → memory_objects (kind=calibration_prior) [future]',
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: msg });
  }
}
