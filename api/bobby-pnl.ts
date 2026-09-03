// ============================================================
// GET /api/bobby-pnl
// Bobby's public aggregate PnL — from agent_trades on Base (swaps the
// receipt verifier confirmed on-chain), never from an exchange account.
// Aggregates only: no wallet addresses, no per-user rows.
// Marks: the rail's own pool quote (what a wallet could sell for now).
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { enforcePublicRateLimit } from './_lib/request-security.js';
import { bobbyDbConfigured, bobbyRest, bobbyReadHeaders } from './_lib/bobby-db.js';
import { quoteBaseSwap } from './_lib/base-swap.js';
import { findBaseToken } from '../src/lib/base-swap/tokens.js';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!await enforcePublicRateLimit(req, res, 'bobby-pnl', 30, 600)) return;
  if (!bobbyDbConfigured()) {
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    return res.status(200).json({ ok: false, message: 'Database not configured' });
  }

  try {
    const r = await fetch(bobbyRest("agent_trades?chain=eq.base&status=eq.confirmed&select=token_symbol,direction,amount_usd,entry_price,exit_price,realized_pnl_pct,outcome,created_at,settled_at&order=created_at.desc&limit=500"), { headers: bobbyReadHeaders() });
    if (!r.ok) return res.status(502).json({ ok: false, error: 'Could not read trades' });
    const rows = (await r.json()) as TradeRow[];

    const open = rows.filter((t) => t.direction === 'BUY' && !t.settled_at);
    const closed = rows.filter((t) => t.direction === 'BUY' && t.settled_at && t.outcome);

    const symbols = Array.from(new Set(open.map((t) => t.token_symbol)));
    const marks = new Map(await Promise.all(symbols.map(async (s) => [s, await markPrice(s)] as const)));

    const openPositions = open.map((t) => {
      const mark = marks.get(t.token_symbol) ?? null;
      const entry = t.entry_price ?? null;
      const pct = mark && entry ? (mark / entry - 1) * 100 : 0;
      const usd = t.amount_usd ?? 0;
      return {
        symbol: t.token_symbol,
        direction: 'long' as const,
        amountUsd: usd,
        entryPrice: entry,
        markPrice: mark,
        unrealizedPnl: Number(((pct / 100) * usd).toFixed(4)),
        unrealizedPnlPct: Number(pct.toFixed(2)),
        openTime: t.created_at,
      };
    });
    const closedPositions = closed.map((t) => ({
      symbol: t.token_symbol,
      direction: 'long' as const,
      entryPrice: t.entry_price,
      exitPrice: t.exit_price,
      realizedPnl: Number((((t.realized_pnl_pct ?? 0) / 100) * (t.amount_usd ?? 0)).toFixed(4)),
      pnlPct: Number((t.realized_pnl_pct ?? 0).toFixed(2)),
      result: t.outcome === 'win' ? 'WIN' : t.outcome === 'loss' ? 'LOSS' : 'BREAK_EVEN',
      openTime: t.created_at,
      closeTime: t.settled_at,
    }));

    const wins = closedPositions.filter((p) => p.result === 'WIN').length;
    const losses = closedPositions.filter((p) => p.result === 'LOSS').length;
    const realizedPnl = closedPositions.reduce((s, p) => s + p.realizedPnl, 0);
    const unrealizedPnl = openPositions.reduce((s, p) => s + p.unrealizedPnl, 0);
    const invested = rows.filter((t) => t.direction === 'BUY').reduce((s, t) => s + (t.amount_usd ?? 0), 0);
    const openNotional = openPositions.reduce((s, p) => s + p.amountUsd, 0);
    const equity = openNotional + unrealizedPnl;
    const totalReturn = invested > 0 ? ((realizedPnl + unrealizedPnl) / invested) * 100 : 0;

    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
    return res.status(200).json({
      ok: true,
      timestamp: new Date().toISOString(),
      agent: 'Bobby Agent Trader',
      source: 'agent_trades (Base · Uniswap V3 · verified receipts)',
      summary: {
        totalTrades: closedPositions.length + openPositions.length,
        wins,
        losses,
        winRate: closedPositions.length ? Number(((wins / closedPositions.length) * 100).toFixed(1)) : 0,
        realizedPnl: Number(realizedPnl.toFixed(4)),
        unrealizedPnl: Number(unrealizedPnl.toFixed(4)),
        investedUsd: Number(invested.toFixed(2)),
        currentEquity: Number(equity.toFixed(2)),
        totalEquity: Number(equity.toFixed(2)),
        totalReturn: Number(totalReturn.toFixed(2)),
        openPositions: openPositions.length,
      },
      openPositions,
      closedPositions: closedPositions.slice(0, 50),
    });
  } catch (error) {
    console.error('[bobby-pnl]', error);
    return res.status(500).json({ ok: false, error: 'PnL unavailable' });
  }
}
