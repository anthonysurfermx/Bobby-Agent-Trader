// ============================================================
// GET /api/bobby-pnl
// PnL from agent_trades on Base (swaps the receipt verifier confirmed
// on-chain). Two shapes:
//   · anonymous  → aggregates only (counts, totals, win rate). No rows: a
//                  symbol + amount + timestamp can be correlated on-chain.
//   · signed in  → that identity's own rows (wallet session or Supabase
//                  bearer, see user-identity), positions net of sells.
// Marks: the rail's own pool quote (what a wallet could sell for now).
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { enforcePublicRateLimit } from './_lib/request-security.js';
import { bobbyDbConfigured, bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { quoteBaseSwap } from './_lib/base-swap.js';
import { findBaseToken } from '../src/lib/base-swap/tokens.js';
import { resolveIdentity } from './_lib/user-identity.js';

export const config = { maxDuration: 20 };

interface TradeRow {
  token_symbol: string;
  direction: 'BUY' | 'SELL';
  amount_usd: number | null;
  entry_price: number | null;
  exit_price: number | null;
  realized_pnl_pct: number | null;
  outcome: string | null;
  created_at: string;
  settled_at: string | null;
}

const SELECT = 'token_symbol,direction,amount_usd,entry_price,exit_price,realized_pnl_pct,outcome,created_at,settled_at';

async function markPrice(symbol: string): Promise<number | null> {
  const token = findBaseToken(symbol);
  if (!token || token.stable) return null;
  try {
    const q = await quoteBaseSwap({ tokenIn: token.symbol, tokenOut: 'USDC', amount: token.decimals >= 8 ? '0.01' : '1' });
    return q.executionPrice > 0 ? q.executionPrice : null;
  } catch {
    return null;
  }
}

/** Open lots per symbol, net of later sells (units bought minus units sold, floored at 0). */
function netOpenLots(rows: TradeRow[]) {
  const bySymbol = new Map<string, { buys: TradeRow[]; soldUnits: number }>();
  for (const t of rows) {
    const e = bySymbol.get(t.token_symbol) ?? { buys: [], soldUnits: 0 };
    if (t.direction === 'BUY' && !t.settled_at) e.buys.push(t);
    if (t.direction === 'SELL' && t.entry_price && t.amount_usd) e.soldUnits += t.amount_usd / t.entry_price;
    bySymbol.set(t.token_symbol, e);
  }
  const lots: Array<{ symbol: string; units: number; entryPrice: number; amountUsd: number; openTime: string }> = [];
  for (const [symbol, e] of bySymbol) {
    let toDeduct = e.soldUnits;
    for (const b of [...e.buys].sort((a, c) => a.created_at.localeCompare(c.created_at))) {
      if (!b.entry_price || !b.amount_usd) continue;
      const units = b.amount_usd / b.entry_price;
      const remaining = Math.max(0, units - toDeduct);
      toDeduct = Math.max(0, toDeduct - units);
      if (remaining <= 0) continue;
      lots.push({ symbol, units: remaining, entryPrice: b.entry_price, amountUsd: remaining * b.entry_price, openTime: b.created_at });
    }
  }
  return lots;
}

function aggregates(rows: TradeRow[]) {
  const closed = rows.filter((t) => t.direction === 'BUY' && t.settled_at && t.outcome);
  const wins = closed.filter((t) => t.outcome === 'win').length;
  const losses = closed.filter((t) => t.outcome === 'loss').length;
  const realizedPnl = closed.reduce((s, t) => s + ((t.realized_pnl_pct ?? 0) / 100) * (t.amount_usd ?? 0), 0);
  const invested = rows.filter((t) => t.direction === 'BUY').reduce((s, t) => s + (t.amount_usd ?? 0), 0);
  return { closed, wins, losses, realizedPnl, invested };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!await enforcePublicRateLimit(req, res, 'bobby-pnl', 30, 600)) return;
  if (!bobbyDbConfigured()) {
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    return res.status(200).json({ ok: false, message: 'Database not configured' });
  }

  try {
    const identity = await resolveIdentity(req).catch(() => null);
    const scope = identity
      ? `&or=(user_id.eq.${identity.id}${identity.wallet ? `,owner_address.eq.${identity.wallet.toLowerCase()}` : ''})`
      : '';
    const r = await fetch(bobbyRest(`agent_trades?chain=eq.base&status=eq.confirmed${scope}&select=${SELECT}&order=created_at.desc&limit=500`), { headers: bobbyServiceHeaders() });
    if (!r.ok) return res.status(502).json({ ok: false, error: 'Could not read trades' });
    const rows = (await r.json()) as TradeRow[];
    const { closed, wins, losses, realizedPnl, invested } = aggregates(rows);
    const lots = netOpenLots(rows);

    const symbols = Array.from(new Set(lots.map((l) => l.symbol)));
    const marks = new Map(await Promise.all(symbols.map(async (s) => [s, await markPrice(s)] as const)));
    const openPositions = lots.map((l) => {
      const mark = marks.get(l.symbol) ?? null;
      const pct = mark ? (mark / l.entryPrice - 1) * 100 : 0;
      return {
        symbol: l.symbol,
        direction: 'long' as const,
        leverage: '1x',
        units: Number(l.units.toFixed(8)),
        amountUsd: Number(l.amountUsd.toFixed(2)),
        entryPrice: l.entryPrice,
        markPrice: mark,
        unrealizedPnl: Number(((pct / 100) * l.amountUsd).toFixed(4)),
        unrealizedPnlPct: Number(pct.toFixed(2)),
        openTime: l.openTime,
      };
    });
    const unrealizedPnl = openPositions.reduce((s, p) => s + p.unrealizedPnl, 0);
    const openNotional = openPositions.reduce((s, p) => s + p.amountUsd, 0);
    const equity = openNotional + unrealizedPnl;
    const totalReturn = invested > 0 ? ((realizedPnl + unrealizedPnl) / invested) * 100 : 0;

    const summary = {
      // Contract kept for the existing screens: startingCapital = capital ever
      // deployed into these swaps; currentEquity = open lots at mark.
      startingCapital: Number(invested.toFixed(2)),
      investedUsd: Number(invested.toFixed(2)),
      currentEquity: Number(equity.toFixed(2)),
      totalEquity: Number(equity.toFixed(2)),
      totalReturn: Number(totalReturn.toFixed(2)),
      realizedPnl: Number(realizedPnl.toFixed(4)),
      unrealizedPnl: Number(unrealizedPnl.toFixed(4)),
      totalTrades: closed.length + openPositions.length,
      wins,
      losses,
      winRate: closed.length ? Number(((wins / closed.length) * 100).toFixed(1)) : 0,
      openPositions: openPositions.length,
    };

    res.setHeader('Cache-Control', identity ? 'no-store' : 's-maxage=15, stale-while-revalidate=60');
    if (!identity) {
      // Anonymous: totals only. No per-trade rows leave the server.
      return res.status(200).json({ ok: true, timestamp: new Date().toISOString(), agent: 'Bobby Agent Trader', scope: 'public-aggregate', source: 'agent_trades (Base · verified receipts)', summary, openPositions: [], closedPositions: [] });
    }
    const closedPositions = closed.map((t) => ({
      symbol: t.token_symbol,
      direction: 'long' as const,
      leverage: '1x',
      entryPrice: t.entry_price,
      exitPrice: t.exit_price,
      realizedPnl: Number((((t.realized_pnl_pct ?? 0) / 100) * (t.amount_usd ?? 0)).toFixed(4)),
      pnlPct: Number((t.realized_pnl_pct ?? 0).toFixed(2)),
      result: t.outcome === 'win' ? 'WIN' : t.outcome === 'loss' ? 'LOSS' : 'BREAK_EVEN',
      openTime: t.created_at,
      closeTime: t.settled_at,
    }));
    return res.status(200).json({ ok: true, timestamp: new Date().toISOString(), agent: 'Bobby Agent Trader', scope: 'identity', source: 'agent_trades (Base · verified receipts)', summary, openPositions, closedPositions: closedPositions.slice(0, 50) });
  } catch (error) {
    console.error('[bobby-pnl]', error);
    return res.status(500).json({ ok: false, error: 'PnL unavailable' });
  }
}
