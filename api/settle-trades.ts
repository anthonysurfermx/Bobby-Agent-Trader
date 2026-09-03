// ============================================================
// GET/POST /api/settle-trades
// Cron-driven settlement loop for agent_trades:
//   1. Pull confirmed, unsettled trades (agent_trades has no 'open' status).
//   2. Price each symbol from Bobby's own rail on Base (pool execution
//      price for allow-listed tokens; the underlying via Yahoo for anything else).
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
import { requireInternalAuth, requireOpsAuth } from './_lib/request-security.js';
import { bobbyDbUrl, bobbyServiceKey } from './_lib/bobby-db.js';
import { requireWritesOpen } from './_lib/control.js';
import { quoteBaseSwap } from './_lib/base-swap.js';
import { findBaseToken } from '../src/lib/base-swap/tokens.js';

export const config = { maxDuration: 60 };

const SB_URL = bobbyDbUrl();
const SB_KEY = bobbyServiceKey();

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
    `?status=eq.confirmed` +
    `&settled_at=is.null` +
    `&entry_price=not.is.null` +
    `&select=id,cycle_id,token_symbol,direction,entry_price,stop_price,target_price,expires_at,amount_usd` +
    `&order=created_at.asc&limit=200`;
  const res = await fetch(url, { headers: sbHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function getCurrentPrice(symbol: string): Promise<number | null> {
  // Allow-listed Base tokens settle at what the wallet could sell for now:
  // the rail's own execution price (USD per unit of the asset). Anything else
  // in the table is legacy; Yahoo answers for equity tickers, nothing for the rest.
  const token = findBaseToken(symbol);
  if (token && !token.stable) {
    try {
      const q = await quoteBaseSwap({ tokenIn: token.symbol, tokenOut: 'USDC', amount: token.decimals >= 8 ? '0.01' : '1' });
      if (q.executionPrice > 0) return q.executionPrice;
    } catch {
      /* fall through */
    }
    if (token.assetClass === 'tokenized-stock' && token.underlyingSymbol) symbol = token.underlyingSymbol;
    else return null;
  }
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
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
  const isLong = trade.direction !== 'short' && trade.direction !== 'SELL';
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
      // status stays 'confirmed' (the schema's check allows pending/confirmed/failed/simulated);
      // settled_at + outcome are what "closed" means everywhere else.
      body: JSON.stringify({
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

  if (!requireInternalAuth(req, res)) return;
  if (req.method === 'POST' && !requireOpsAuth(req, res)) return;
  if (!(await requireWritesOpen(res))) return;

  if (!SB_URL || !SB_KEY) {
    return res.status(500).json({ error: 'Supabase credentials not configured' });
  }

  try {
    const trades = await fetchOpenTrades();
    if (trades.length === 0) {
      return res.status(200).json({ ok: true, checked: 0, settled: 0 });
    }

    // Dedupe symbols — one price read per symbol regardless of how many
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
