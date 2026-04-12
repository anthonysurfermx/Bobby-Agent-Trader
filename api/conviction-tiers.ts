// ============================================================
// GET /api/conviction-tiers
// Conviction-tier stratified performance — proves Bobby's debate
// system produces calibrated confidence, not random conviction.
// High-conviction calls should outperform low-conviction ones.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 10 };

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

async function sbQuery(path: string) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
    },
  });
  if (!res.ok) return [];
  return res.json();
}

interface CycleRow {
  conviction_score: number | null;
  resolution: string | null;
  resolution_pnl_pct: number | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!SB_URL || !SB_KEY) {
    return res.status(200).json({ ok: false, message: 'Supabase not configured' });
  }

  // Fetch all resolved cycles with conviction scores
  const cycles: CycleRow[] = await sbQuery(
    'agent_cycles?resolution=not.is.null&resolution=neq.pending&conviction_score=not.is.null&select=conviction_score,resolution,resolution_pnl_pct&order=resolved_at.desc&limit=200'
  );

  // Define tiers: LOW (1-3), MEDIUM (4-6), HIGH (7-10)
  const tiers = [
    { label: 'LOW', range: '1-3', min: 0, max: 3.9 },
    { label: 'MEDIUM', range: '4-6', min: 4, max: 6.9 },
    { label: 'HIGH', range: '7-10', min: 7, max: 10 },
  ];

  const results = tiers.map((tier) => {
    const inTier = cycles.filter((c) => {
      const conv = c.conviction_score ?? 0;
      return conv >= tier.min && conv <= tier.max;
    });

    const wins = inTier.filter((c) => c.resolution === 'win').length;
    const losses = inTier.filter((c) => c.resolution === 'loss').length;
    const total = wins + losses;
    const winRate = total > 0 ? (wins / total) * 100 : null;
    const avgPnl = inTier.length > 0
      ? inTier.reduce((sum, c) => sum + (c.resolution_pnl_pct ?? 0), 0) / inTier.length
      : null;
    const totalPnl = inTier.reduce((sum, c) => sum + (c.resolution_pnl_pct ?? 0), 0);

    return {
      tier: tier.label,
      convictionRange: tier.range,
      trades: total,
      wins,
      losses,
      winRate: winRate !== null ? parseFloat(winRate.toFixed(1)) : null,
      avgPnlPct: avgPnl !== null ? parseFloat(avgPnl.toFixed(2)) : null,
      totalPnlPct: parseFloat(totalPnl.toFixed(2)),
    };
  });

  // Overall stats
  const totalTrades = results.reduce((s, r) => s + r.trades, 0);
  const totalWins = results.reduce((s, r) => s + r.wins, 0);
  const overallWinRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : null;

  // Calibration signal: is HIGH tier actually better than LOW?
  const highWinRate = results.find((r) => r.tier === 'HIGH')?.winRate ?? null;
  const lowWinRate = results.find((r) => r.tier === 'LOW')?.winRate ?? null;
  const isCalibrated =
    highWinRate !== null && lowWinRate !== null && highWinRate > lowWinRate;

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  return res.status(200).json({
    ok: true,
    fetchedAt: new Date().toISOString(),
    totalResolved: totalTrades,
    overallWinRate: overallWinRate !== null ? parseFloat(overallWinRate.toFixed(1)) : null,
    calibrationSignal: isCalibrated
      ? 'CALIBRATED — high-conviction calls outperform low-conviction'
      : totalTrades < 5
      ? 'INSUFFICIENT_DATA — need more resolved trades'
      : 'UNCALIBRATED — conviction does not predict outcome yet',
    tiers: results,
  });
}
