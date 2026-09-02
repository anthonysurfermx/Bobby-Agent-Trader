// ============================================================
// GET/POST /api/ghost-wallet
// Ghost Wallet — tracks what would have happened if user followed Bobby
// "That doubt just cost you $4,200. Are you going to watch or play?"
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { bobbyDbUrl, bobbyReadKey } from './_lib/bobby-db.js';

const SB_URL = bobbyDbUrl();
const SB_KEY = bobbyReadKey();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    // Get ghost wallet performance for a user (or global)
    const wallet = req.query.wallet as string || 'global';

    try {
      // Get all resolved threads with trade params
      const threadsRes = await fetch(
        `${SB_URL}/rest/v1/forum_threads?resolution=neq.pending&entry_price=not.is.null&select=symbol,direction,entry_price,target_price,stop_price,conviction_score,resolution,resolution_pnl_pct,resolved_at,created_at&order=created_at.desc&limit=50`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
      );

      if (!threadsRes.ok) return res.status(500).json({ error: 'Failed to fetch' });
      const threads = await threadsRes.json() as Array<{
        symbol: string; direction: string; entry_price: number; target_price: number; stop_price: number;
        conviction_score: number; resolution: string; resolution_pnl_pct: number; resolved_at: string; created_at: string;
      }>;

      // Calculate ghost wallet performance
      let startingCapital = 10000; // $10K hypothetical
      let currentCapital = startingCapital;
      const trades: Array<{
        symbol: string; direction: string; conviction: number;
        pnl_pct: number; pnl_usd: number; resolution: string; date: string;
      }> = [];

      for (const t of threads.reverse()) { // oldest first
        if (!t.resolution_pnl_pct || t.resolution === 'pending') continue;

        // Position size based on conviction (Kelly-inspired)
        const conviction = t.conviction_score || 0.5;
        const positionPct = Math.min(conviction * 0.3, 0.25); // Max 25% of capital
        const positionSize = currentCapital * positionPct;
        const pnlUsd = positionSize * (t.resolution_pnl_pct / 100);

        currentCapital += pnlUsd;
        trades.push({
          symbol: t.symbol,
          direction: t.direction,
          conviction: t.conviction_score,
          pnl_pct: t.resolution_pnl_pct,
          pnl_usd: parseFloat(pnlUsd.toFixed(2)),
          resolution: t.resolution,
          date: t.resolved_at || t.created_at,
        });
      }

      const totalPnl = currentCapital - startingCapital;
      const totalPnlPct = ((currentCapital / startingCapital) - 1) * 100;
      const wins = trades.filter(t => t.resolution === 'win').length;
      const losses = trades.filter(t => t.resolution === 'loss').length;

      return res.status(200).json({
        ok: true,
        ghostWallet: {
          startingCapital,
          currentCapital: parseFloat(currentCapital.toFixed(2)),
          totalPnl: parseFloat(totalPnl.toFixed(2)),
          totalPnlPct: parseFloat(totalPnlPct.toFixed(2)),
          trades: trades.length,
          wins,
          losses,
          winRate: trades.length > 0 ? Math.round((wins / trades.length) * 100) : 0,
          recentTrades: trades.slice(-5).reverse(),
        },
      });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
