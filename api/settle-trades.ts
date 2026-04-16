// ============================================================
// GET/POST /api/settle-trades
// Cron-driven settlement loop for agent_trades:
//   1. Pull trades with status='open' that have entry + (stop OR target).
//   2. Batch-fetch current OKX mid for unique symbols.
//   3. For each open trade:
//        - LONG:  price >= target → win   | price <= stop → loss
//        - SHORT: price <= target → win   | price >= stop → loss
//        - expires_at in the past → resolve at current price (break_even
//          if |pnl| < 1%, otherwise win/loss by sign).
//   4. UPDATE the row with outcome / exit_price / realized_pnl_pct / settled_at.
//   5. Re-aggregate per cycle: set agent_cycles.trades_successful =
//      count(agent_trades.outcome = 'win').
//
// This closes the loop so `agent_cycles.trades_successful` is actually
// written (previously only read) and the circuit breaker can stop being
// a proxy.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 60 };

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

interface OpenTrade {
  id: string;
  cycle_id: string | null;
  token_symbol: string;
  direction: string;
  entry_price: number | null;
  stop_price: number | null;
  target_price: number | null;
  expires_at: string | null;
  amount_usd: number | null;
}

function sbHeaders() {
  return {
    'Content-Type': 'application/json',
    apikey: SB_KEY as string,
    Authorization: `Bearer ${SB_KEY as string}`,
  };
}

async function fetchOpenTrades(): Promise<OpenTrade[]> {
  const url =
    `${SB_URL}/rest/v1/agent_trades` +
    `?status=eq.open` +
    `&entry_price=not.is.null` +
    `&select=id,cycle_id,token_symbol,direction,entry_price,stop_price,target_price,expires_at,amount_usd` +
    `&order=created_at.asc&limit=200`;
  const res = await fetch(url, { headers: sbHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function getCurrentPrice(symbol: string): Promise<number | null> {
  // OKX instruments in the order agent_trades is most likely to carry:
  // SPOT crypto uses `<SYM>-USDT`; perps use `<SYM>-USDT-SWAP`. Yahoo is a
  // stocks fallback for equity tickers that slip into the table.
  const candidates = [`${symbol}-USDT-SWAP`, `${symbol}-USDT`];
  for (const instId of candidates) {
    try {
      const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`);
      if (!res.ok) continue;
      const json = (await res.json()) as { code: string; data: Array<{ last: string }> };
      if (json.code !== '0' || !json.data?.[0]) continue;
      const price = parseFloat(json.data[0].last);
      if (price > 0) return price;
    } catch {
      continue;
    }
  }
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
    );
    if (res.ok) {
      const data = (await res.json()) as {
        chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> };
      };
      const p = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (p && p > 0) return p;
    }
  } catch {
    /* silent */
  }
  return null;
}

interface Decision {
  outcome: 'win' | 'loss' | 'break_even';
  exit_price: number;
  pnl_pct: number;
}

function decideOutcome(trade: OpenTrade, currentPrice: number, now: number): Decision | null {
  if (!trade.entry_price) return null;
  const entry = trade.entry_price;
  const isLong = trade.direction !== 'short';
  const expired = trade.expires_at ? new Date(trade.expires_at).getTime() < now : false;

  if (isLong) {
    if (trade.target_price && currentPrice >= trade.target_price) {
      return {
        outcome: 'win',
        exit_price: trade.target_price,
        pnl_pct: ((trade.target_price - entry) / entry) * 100,
      };
    }
    if (trade.stop_price && currentPrice <= trade.stop_price) {
      return {
        outcome: 'loss',
        exit_price: trade.stop_price,
        pnl_pct: ((trade.stop_price - entry) / entry) * 100,
      };
    }
    if (expired) {
      const pnl = ((currentPrice - entry) / entry) * 100;
      return {
        outcome: Math.abs(pnl) < 1 ? 'break_even' : pnl > 0 ? 'win' : 'loss',
        exit_price: currentPrice,
        pnl_pct: pnl,
      };
    }
  } else {
    if (trade.target_price && currentPrice <= trade.target_price) {
      return {
        outcome: 'win',
        exit_price: trade.target_price,
        pnl_pct: ((entry - trade.target_price) / entry) * 100,
      };
    }
    if (trade.stop_price && currentPrice >= trade.stop_price) {
      return {
        outcome: 'loss',
        exit_price: trade.stop_price,
        pnl_pct: ((entry - trade.stop_price) / entry) * 100,
      };
    }
    if (expired) {
      const pnl = ((entry - currentPrice) / entry) * 100;
      return {
        outcome: Math.abs(pnl) < 1 ? 'break_even' : pnl > 0 ? 'win' : 'loss',
        exit_price: currentPrice,
        pnl_pct: pnl,
      };
    }
  }
  return null;
}

async function updateTrade(id: string, decision: Decision): Promise<boolean> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/agent_trades?id=eq.${id}`, {
      method: 'PATCH',
      headers: sbHeaders(),
      body: JSON.stringify({
        status: 'closed',
        outcome: decision.outcome,
        exit_price: decision.exit_price,
        realized_pnl_pct: parseFloat(decision.pnl_pct.toFixed(2)),
        settled_at: new Date().toISOString(),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function recomputeCycleSuccess(cycleId: string): Promise<void> {
  try {
    const countRes = await fetch(
      `${SB_URL}/rest/v1/agent_trades?cycle_id=eq.${cycleId}&outcome=eq.win&select=id`,
      { headers: sbHeaders() },
    );
    if (!countRes.ok) return;
    const rows = await countRes.json();
    const wins = Array.isArray(rows) ? rows.length : 0;

    await fetch(`${SB_URL}/rest/v1/agent_cycles?id=eq.${cycleId}`, {
      method: 'PATCH',
      headers: sbHeaders(),
      body: JSON.stringify({ trades_successful: wins }),
    });
  } catch {
    /* non-fatal */
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Cron auth (same pattern agent-run uses): require bearer in prod, allow
  // manual runs without it so operators can trigger settlement ad-hoc.
  const cronSecret = process.env.CRON_SECRET;
  const isManual = req.query.manual === 'true';
  if (cronSecret && !isManual) {
    if (req.headers.authorization !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  if (!SB_URL || !SB_KEY) {
    return res.status(500).json({ error: 'Supabase credentials not configured' });
  }

  try {
    const trades = await fetchOpenTrades();
    if (trades.length === 0) {
      return res.status(200).json({ ok: true, checked: 0, settled: 0 });
    }

    // Dedupe symbols — one OKX call per symbol regardless of how many
    // open trades reference it.
    const symbols = Array.from(new Set(trades.map((t) => t.token_symbol).filter(Boolean)));
    const priceEntries = await Promise.all(
      symbols.map(async (s) => [s, await getCurrentPrice(s)] as const),
    );
    const prices = new Map(priceEntries);

    const now = Date.now();
    const affectedCycles = new Set<string>();
    const settlements: Array<{
      id: string;
      symbol: string;
      outcome: string;
      pnl_pct: number;
    }> = [];

    for (const trade of trades) {
      const currentPrice = prices.get(trade.token_symbol) ?? null;
      if (!currentPrice) continue;

      const decision = decideOutcome(trade, currentPrice, now);
      if (!decision) continue;

      const ok = await updateTrade(trade.id, decision);
      if (!ok) continue;

      settlements.push({
        id: trade.id,
        symbol: trade.token_symbol,
        outcome: decision.outcome,
        pnl_pct: parseFloat(decision.pnl_pct.toFixed(2)),
      });
      if (trade.cycle_id) affectedCycles.add(trade.cycle_id);
    }

    // Propagate win counts back to agent_cycles so the circuit breaker and
    // self-optimize prompt read real data instead of zeros.
    for (const cid of affectedCycles) {
      await recomputeCycleSuccess(cid);
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      checked: trades.length,
      settled: settlements.length,
      cyclesUpdated: affectedCycles.size,
      settlements,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[SettleTrades] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
