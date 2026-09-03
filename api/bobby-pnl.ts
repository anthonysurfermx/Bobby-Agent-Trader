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
  units: number | null;
  units_remaining: number | null;
}

const SELECT = 'token_symbol,direction,amount_usd,entry_price,exit_price,realized_pnl_pct,outcome,created_at,settled_at,units,units_remaining';

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

/** Open lots: BUY rows with units left after FIFO fills (the RPC keeps units_remaining). */
function openLots(rows: TradeRow[]) {
  return rows
    .filter((t) => t.direction === 'BUY' && (t.units_remaining ?? 0) > 0 && t.entry_price)
    .map((t) => ({ symbol: t.token_symbol, units: Number(t.units_remaining), entryPrice: Number(t.entry_price), amountUsd: Number(t.units_remaining) * Number(t.entry_price), openTime: t.created_at }));
}

/**
 * Realizations are SELL rows: entry = FIFO average cost of the matched units,
 * exit = the sell price, realized = pct × entry × matched units. Fully
 * consumed BUY lots also carry an outcome (for scoring), but counting both
 * would double-count; the SELL rows are the ledger here.
 */
function aggregates(rows: TradeRow[]) {
  const realizations = rows.filter((t) => t.direction === 'SELL' && t.outcome && t.entry_price && (t.units ?? 0) > 0);
  const wins = realizations.filter((t) => t.outcome === 'win').length;
  const losses = realizations.filter((t) => t.outcome === 'loss').length;
  const realizedPnl = realizations.reduce((s, t) => s + ((t.realized_pnl_pct ?? 0) / 100) * Number(t.entry_price) * Number(t.units), 0);
  const capitalDeployed = rows.filter((t) => t.direction === 'BUY').reduce((s, t) => s + (t.amount_usd ?? 0), 0);
  const realizedCash = rows.filter((t) => t.direction === 'SELL').reduce((s, t) => s + (t.amount_usd ?? 0), 0);
  return { realizations, wins, losses, realizedPnl, capitalDeployed, realizedCash };
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
    const { realizations, wins, losses, realizedPnl, capitalDeployed, realizedCash } = aggregates(rows);
    const lots = openLots(rows);

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
    const openPositionValue = openPositions.reduce((s, p) => s + p.amountUsd + p.unrealizedPnl, 0);
    // Virtual portfolio: everything ever deployed plus what it made. Buying $100
    // and selling for $110 shows $110, not $0.
    const portfolioEquity = capitalDeployed + realizedPnl + unrealizedPnl;
    const totalReturn = capitalDeployed > 0 ? ((realizedPnl + unrealizedPnl) / capitalDeployed) * 100 : 0;

    const summary = {
      capitalDeployed: Number(capitalDeployed.toFixed(2)),
      openPositionValue: Number(openPositionValue.toFixed(2)),
      realizedCash: Number(realizedCash.toFixed(2)),
      realizedPnl: Number(realizedPnl.toFixed(4)),
      unrealizedPnl: Number(unrealizedPnl.toFixed(4)),
      portfolioEquity: Number(portfolioEquity.toFixed(2)),
      // Names the existing screens read: start = capital deployed, current = portfolio equity.
      startingCapital: Number(capitalDeployed.toFixed(2)),
      investedUsd: Number(capitalDeployed.toFixed(2)),
      currentEquity: Number(portfolioEquity.toFixed(2)),
      totalEquity: Number(portfolioEquity.toFixed(2)),
      totalReturn: Number(totalReturn.toFixed(2)),
      totalTrades: realizations.length + openPositions.length,
      wins,
      losses,
      winRate: realizations.length ? Number(((wins / realizations.length) * 100).toFixed(1)) : 0,
      openPositions: openPositions.length,
    };

    res.setHeader('Cache-Control', identity ? 'no-store' : 's-maxage=15, stale-while-revalidate=60');
    if (!identity) {
      // Anonymous: totals only. No per-trade rows leave the server.
      return res.status(200).json({ ok: true, timestamp: new Date().toISOString(), agent: 'Bobby Agent Trader', scope: 'public-aggregate', source: 'agent_trades (Base · verified receipts)', summary, openPositions: [], closedPositions: [] });
    }
    const closedPositions = realizations.map((t) => ({
      symbol: t.token_symbol,
      direction: 'long' as const,
      leverage: '1x',
      units: Number(t.units),
      entryPrice: t.entry_price,
      exitPrice: t.exit_price,
      realizedPnl: Number((((t.realized_pnl_pct ?? 0) / 100) * Number(t.entry_price) * Number(t.units)).toFixed(4)),
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
