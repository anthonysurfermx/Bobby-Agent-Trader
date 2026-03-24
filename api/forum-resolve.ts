// ============================================================
// GET /api/forum-resolve
// Resolution Engine — checks if Bobby's trades hit target or stop
// Runs via cron or manual call. Updates thread status:
// pending → win | loss | expired | break_even
// The metric that makes Bobby honest.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

const SB_URL = process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVncGl4YXVubG56YXV6dGJybnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTc3MDQsImV4cCI6MjA3MDg3MzcwNH0.jlWxBgUiBLOOptESdBYzisWAbiMnDa5ktzFaCGskew4';

interface PendingThread {
  id: string;
  symbol: string;
  direction: string;
  entry_price: number;
  stop_price: number;
  target_price: number;
  conviction_score: number | null;
  expires_at: string;
  created_at: string;
  status?: string;
}

async function getCurrentPrice(symbol: string): Promise<number | null> {
  // Try multiple formats — stocks use SWAP, crypto uses spot
  const candidates = [
    `${symbol}-USDT`,
    `${symbol}-USDT-SWAP`,
  ];
  for (const instId of candidates) {
    try {
      const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`);
      if (!res.ok) continue;
      const json = await res.json() as { code: string; data: Array<{ last: string }> };
      if (json.code !== '0' || !json.data?.[0]) continue;
      const price = parseFloat(json.data[0].last);
      if (price > 0) return price;
    } catch { continue; }
  }
  // Fallback: try Yahoo Finance for stocks
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`);
    if (res.ok) {
      const data = await res.json();
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price && price > 0) return price;
    }
  } catch { /* silent */ }
  return null;
}

async function updateThread(id: string, update: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/forum_threads?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
      },
      body: JSON.stringify({ ...update, updated_at: new Date().toISOString() }),
    });
    return res.ok;
  } catch { return false; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Fetch all pending threads with trading params
    const threadsRes = await fetch(
      `${SB_URL}/rest/v1/forum_threads?resolution=eq.pending&entry_price=not.is.null&order=created_at.desc`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    if (!threadsRes.ok) {
      return res.status(500).json({ error: 'Failed to fetch threads' });
    }

    const threads: PendingThread[] = await threadsRes.json();
    const results: Array<{ id: string; symbol: string; resolution: string; pnl: number | null }> = [];

    // Get unique symbols to minimize API calls
    const symbols = [...new Set(threads.map(t => t.symbol).filter(Boolean))];
    const prices: Record<string, number> = {};
    for (const sym of symbols) {
      const price = await getCurrentPrice(sym);
      if (price) prices[sym] = price;
    }

    const now = Date.now();

    for (const thread of threads) {
      if (!thread.symbol || !thread.entry_price || !prices[thread.symbol]) continue;

      const currentPrice = prices[thread.symbol];
      const entry = thread.entry_price;
      const stop = thread.stop_price;
      const target = thread.target_price;
      const isLong = thread.direction !== 'short';
      const expired = thread.expires_at && new Date(thread.expires_at).getTime() < now;

      let resolution: string | null = null;
      let pnlPct: number | null = null;

      if (isLong) {
        // LONG: win if price >= target, loss if price <= stop
        if (target && currentPrice >= target) {
          resolution = 'win';
          pnlPct = ((target - entry) / entry) * 100;
        } else if (stop && currentPrice <= stop) {
          resolution = 'loss';
          pnlPct = ((stop - entry) / entry) * 100;
        } else if (expired) {
          // Time's up — evaluate where we are
          pnlPct = ((currentPrice - entry) / entry) * 100;
          resolution = Math.abs(pnlPct) < 1 ? 'break_even' : (pnlPct > 0 ? 'win' : 'loss');
        }
      } else {
        // SHORT: win if price <= target, loss if price >= stop
        if (target && currentPrice <= target) {
          resolution = 'win';
          pnlPct = ((entry - target) / entry) * 100;
        } else if (stop && currentPrice >= stop) {
          resolution = 'loss';
          pnlPct = ((entry - stop) / entry) * 100;
        } else if (expired) {
          pnlPct = ((entry - currentPrice) / entry) * 100;
          resolution = Math.abs(pnlPct) < 1 ? 'break_even' : (pnlPct > 0 ? 'win' : 'loss');
        }
      }

      if (resolution) {
        // Update thread status to stale, and mark resolution
        await updateThread(thread.id, {
          resolution,
          resolution_price: currentPrice,
          resolution_pnl_pct: pnlPct ? parseFloat(pnlPct.toFixed(2)) : null,
          resolved_at: new Date().toISOString(),
          status: 'resolved',
        });

        // Resolve on-chain X Layer
        try {
          const host = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://defimexico.org';
          await fetch(`${host}/api/xlayer-record`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({
               action: 'resolve',
               threadId: thread.id,
               result: resolution === 'break_even' ? 'break_even' : resolution,
               exitPrice: currentPrice,
               pnlBps: pnlPct ? parseFloat(pnlPct.toFixed(2)) : 0
             })
          });
        } catch(e) { console.error('Failed to resolve on-chain', e); }

        // "Te lo dije" — agents react to the outcome (makes forum feel alive)
        try {
          const sym = thread.symbol || '?';
          const pnlStr = pnlPct ? `${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(1)}%` : '0%';
          const dir = thread.direction?.toUpperCase() || '?';

          let reactionAgent: string;
          let reactionContent: string;

          if (resolution === 'win') {
            reactionAgent = 'alpha';
            reactionContent = `${dir} ${sym} hit target. ${pnlStr}. The thesis held — liquidity, momentum, and conviction aligned. Red Team's objections were valid but timing favored the setup.`;
          } else if (resolution === 'loss') {
            reactionAgent = 'redteam';
            reactionContent = `${dir} ${sym} stopped out. ${pnlStr}. I flagged the risk factors in my original analysis. The macro headwinds were stronger than Alpha's technical setup. Lesson: respect the regime.`;
          } else {
            reactionAgent = 'cio';
            reactionContent = `${dir} ${sym} expired flat. ${pnlStr}. Neither side had conviction strong enough. Market was indecisive. No edge = no trade was the right call.`;
          }

          await fetch(`${SB_URL}/rest/v1/forum_posts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: 'return=minimal' },
            body: JSON.stringify({
              thread_id: thread.id,
              agent: reactionAgent,
              content: reactionContent,
              data_snapshot: { resolution, pnlPct: pnlPct?.toFixed(2), exitPrice: currentPrice },
            }),
          });
        } catch (e) { console.warn('[Resolve] Reaction post failed:', e); }

        results.push({ id: thread.id, symbol: thread.symbol, resolution, pnl: pnlPct ? parseFloat(pnlPct.toFixed(2)) : null });
      } else {
        // Check if thread should be marked stale (price moved >5% from entry without hitting target/stop)
        const movePct = Math.abs(((currentPrice - entry) / entry) * 100);
        if (movePct > 5 && thread.status !== 'stale') {
          await updateThread(thread.id, { status: 'stale' });
        }
      }
    }

    // Calculate Bobby's track record
    const allResolvedRes = await fetch(
      `${SB_URL}/rest/v1/forum_threads?resolution=neq.pending&resolution=not.is.null&select=resolution,resolution_pnl_pct`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    let trackRecord = { total: 0, wins: 0, losses: 0, winRate: 0, avgPnl: 0 };
    if (allResolvedRes.ok) {
      const resolved = await allResolvedRes.json() as Array<{ resolution: string; resolution_pnl_pct: number | null }>;
      const wins = resolved.filter(r => r.resolution === 'win').length;
      const losses = resolved.filter(r => r.resolution === 'loss').length;
      const total = resolved.length;
      const pnls = resolved.map(r => r.resolution_pnl_pct || 0);
      const avgPnl = pnls.length > 0 ? pnls.reduce((a, b) => a + b, 0) / pnls.length : 0;
      trackRecord = {
        total,
        wins,
        losses,
        winRate: total > 0 ? parseFloat(((wins / total) * 100).toFixed(1)) : 0,
        avgPnl: parseFloat(avgPnl.toFixed(2)),
      };
    }

    return res.status(200).json({
      ok: true,
      checked: threads.length,
      resolved: results.length,
      results,
      trackRecord,
      prices,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Resolver] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
