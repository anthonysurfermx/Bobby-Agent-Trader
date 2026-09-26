// ============================================================
// GET /api/bobby-pnl
// PnL from confirmed Base receipts. Public figures include only unowned
// trades from explicitly public protocol cycles; a user's swaps must never
// become Bobby's public performance. Personal receipts require identity.
// Marks: the rail's own pool quote (what a wallet could sell for now).
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { enforcePublicRateLimit } from './_lib/request-security.js';
import { bobbyDbConfigured, bobbyRest, bobbyServiceHeaders, bobbyServiceKeyOptional } from './_lib/bobby-db.js';
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
  block_number: number | null;
  tx_index: number | null;
  owner_address: string | null;
  user_id: string | null;
  cycle_id: string | null;
  agent_cycles?: { visibility: string } | null;
}

const SELECT = 'token_symbol,direction,amount_usd,entry_price,exit_price,realized_pnl_pct,outcome,created_at,settled_at,units,units_remaining,block_number,tx_index,owner_address,user_id,cycle_id';
const PAGE = 1000;
const MAX_PAGES = 50;

/** The whole ledger, page by page: an accounting that stops at row 500 is not an accounting. */
async function readLedger(scope: 'public' | 'identity', identity?: { id: string; wallet: string | null }): Promise<{ rows: TradeRow[]; truncated: boolean }> {
  // The inner join makes provenance and ownership part of the database query,
  // before any rows are aggregated. A missing/private cycle cannot match.
  const query = scope === 'public'
    ? `&owner_address=is.null&user_id=is.null&agent_cycles.visibility=eq.public&select=${SELECT},agent_cycles!inner(visibility)`
    : `&or=(user_id.eq.${identity!.id}${identity!.wallet ? `,owner_address.eq.${identity!.wallet.toLowerCase()}` : ''})&select=${SELECT}`;
  const rows: TradeRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE;
    const r = await fetch(bobbyRest(`agent_trades?chain=eq.base&status=eq.confirmed${query}&order=block_number.asc,tx_index.asc,created_at.asc`), { headers: bobbyServiceHeaders({ Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' }) });
    if (!r.ok && r.status !== 206) throw new Error(`ledger read ${r.status}`);
    const batch = (await r.json()) as TradeRow[];
    // Keep the same positive provenance rule in the application as a second
    // guard against a future query edit or an unexpected API response.
    rows.push(...(scope === 'public'
      ? batch.filter((trade) => trade.owner_address === null && trade.user_id === null && Boolean(trade.cycle_id) && trade.agent_cycles?.visibility === 'public')
      : batch));
    if (batch.length < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
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

/** Open lots: BUY rows with units left after FIFO fills (the RPC keeps units_remaining). */
function openLots(rows: TradeRow[]) {
  return rows
    .filter((t) => t.direction === 'BUY' && (t.units_remaining ?? 0) > 0 && t.entry_price)
    .map((t) => ({ symbol: t.token_symbol, units: Number(t.units_remaining), entryPrice: Number(t.entry_price), amountUsd: Number(t.units_remaining) * Number(t.entry_price), openTime: t.created_at }));
}

const matchedUnits = (t: TradeRow) => Math.max(0, Number(t.units ?? 0) - Number(t.units_remaining ?? 0));

/**
 * Realizations are SELL rows: entry = FIFO cost of the MATCHED units, exit =
 * the sell price, realized = pct × entry × matched. BUY lots also carry an
 * outcome (scoring only); counting both would double-count.
 *
 * Capital: `capitalDeployed` is turnover (every buy, ever). What the book
 * actually needed is `capitalRequired` — the peak of the running net
 * investment (buys − sells) in chain order. Buy $100, sell $110, buy $100
 * again → net investment 100 → −10 → 90, peak 100. Equity is that peak
 * plus everything the book made: 100 + 10 realized + unrealized.
 */
function aggregates(rows: TradeRow[]) {
  const realizations = rows.filter((t) => t.direction === 'SELL' && t.outcome && t.entry_price && matchedUnits(t) > 0);
  const wins = realizations.filter((t) => t.outcome === 'win').length;
  const losses = realizations.filter((t) => t.outcome === 'loss').length;
  const realizedPnl = realizations.reduce((s, t) => s + ((t.realized_pnl_pct ?? 0) / 100) * Number(t.entry_price) * matchedUnits(t), 0);
  const capitalDeployed = rows.filter((t) => t.direction === 'BUY').reduce((s, t) => s + (t.amount_usd ?? 0), 0);
  const realizedCash = rows.filter((t) => t.direction === 'SELL').reduce((s, t) => s + (t.amount_usd ?? 0), 0);
  // Capital required is a per-wallet notion (one wallet's sale never funds
  // another wallet's purchase): peak of each wallet's running net investment
  // in chain order, then summed.
  const chainOrder = [...rows].sort((a, b) => (Number(a.block_number ?? 0) - Number(b.block_number ?? 0)) || (Number(a.tx_index ?? 0) - Number(b.tx_index ?? 0)) || a.created_at.localeCompare(b.created_at));
  const net = new Map<string, number>(); const peak = new Map<string, number>();
  for (const t of chainOrder) {
    const w = (t.owner_address ?? '').toLowerCase();
    const n = (net.get(w) ?? 0) + (t.direction === 'BUY' ? (t.amount_usd ?? 0) : -(t.amount_usd ?? 0));
    net.set(w, n);
    if (n > (peak.get(w) ?? 0)) peak.set(w, n);
  }
  const capitalRequired = [...peak.values()].reduce((s, v) => s + v, 0);
  const netInvested = [...net.values()].reduce((s, v) => s + v, 0);
  return { realizations, wins, losses, realizedPnl, capitalDeployed, realizedCash, capitalRequired, netInvested };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!await enforcePublicRateLimit(req, res, 'bobby-pnl', 30, 600)) return;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Authorization, x-bobby-session');
  if (!bobbyDbConfigured() || !bobbyServiceKeyOptional()) return res.status(503).json({ ok: false, error: 'Database not configured' });

  const requestedScope = typeof req.query.scope === 'string' ? req.query.scope : '';
  if (requestedScope && !['public', 'mine'].includes(requestedScope)) return res.status(400).json({ ok: false, error: 'Invalid scope' });

  try {
    const suppliedCredential = Boolean(req.headers['x-bobby-session'] || req.headers.authorization);
    const identity = requestedScope === 'public' || (!suppliedCredential && requestedScope !== 'mine')
      ? null
      : await resolveIdentity(req);
    if (requestedScope === 'mine' && !identity) return res.status(401).json({ ok: false, error: 'Sign in to view your receipts' });
    if (suppliedCredential && requestedScope !== 'public' && !identity) return res.status(401).json({ ok: false, error: 'Invalid session' });
    const scope = identity ? 'identity' : 'public';
    let rows: TradeRow[]; let truncated = false;
    try { ({ rows, truncated } = await readLedger(scope, identity ?? undefined)); } catch (error) {
      console.error('[bobby-pnl] ledger read', error);
      return res.status(502).json({ ok: false, error: 'Could not read trades' });
    }
    const { realizations, wins, losses, realizedPnl, capitalDeployed, realizedCash, capitalRequired, netInvested } = aggregates(rows);
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
    // Virtual portfolio = the capital the book ever needed, plus what it made.
    // Buy $100, sell $110, buy $100 again → 100 + 10 + unrealized, not 210.
    const netPnl = realizedPnl + unrealizedPnl;
    const portfolioEquity = capitalRequired + netPnl;
    const totalReturn = capitalRequired > 0 ? (netPnl / capitalRequired) * 100 : 0;

    const summary = {
      capitalRequired: Number(capitalRequired.toFixed(2)),
      netInvested: Number(netInvested.toFixed(2)),
      capitalDeployed: Number(capitalDeployed.toFixed(2)), // turnover: every buy ever
      openPositionValue: Number(openPositionValue.toFixed(2)),
      realizedCash: Number(realizedCash.toFixed(2)),
      realizedPnl: Number(realizedPnl.toFixed(4)),
      unrealizedPnl: Number(unrealizedPnl.toFixed(4)),
      netPnl: Number(netPnl.toFixed(4)),
      portfolioEquity: Number(portfolioEquity.toFixed(2)),
      // Names the existing screens read: start = capital required, current = portfolio equity.
      startingCapital: Number(capitalRequired.toFixed(2)),
      investedUsd: Number(capitalRequired.toFixed(2)),
      currentEquity: Number(portfolioEquity.toFixed(2)),
      totalEquity: Number(portfolioEquity.toFixed(2)),
      totalReturn: Number(totalReturn.toFixed(2)),
      totalTrades: realizations.length + openPositions.length,
      closedTrades: realizations.length,
      wins,
      losses,
      winRate: realizations.length ? Number(((wins / realizations.length) * 100).toFixed(1)) : 0,
      openPositions: openPositions.length,
      valuationComplete: lots.every((lot) => marks.get(lot.symbol) != null),
      /** true only if the ledger exceeded 50,000 rows; figures would then be partial. */
      truncated,
    };

    res.setHeader('Cache-Control', identity ? 'no-store' : 's-maxage=15, stale-while-revalidate=60');
    if (!identity) {
      // Anonymous: totals only. No per-trade rows leave the server.
      return res.status(200).json({ ok: true, timestamp: new Date().toISOString(), agent: 'Bobby Agent Trader', scope: 'public-aggregate', source: 'public protocol cycles · confirmed Base receipts', summary, openPositions: [], closedPositions: [] });
    }
    const closedPositions = [...realizations].reverse().map((t) => ({
      symbol: t.token_symbol,
      direction: 'long' as const,
      leverage: '1x',
      units: matchedUnits(t),
      unmatchedUnits: Number(t.units_remaining ?? 0),
      entryPrice: t.entry_price,
      exitPrice: t.exit_price,
      realizedPnl: Number((((t.realized_pnl_pct ?? 0) / 100) * Number(t.entry_price) * matchedUnits(t)).toFixed(4)),
      pnlPct: Number((t.realized_pnl_pct ?? 0).toFixed(2)),
      result: t.outcome === 'win' ? 'WIN' : t.outcome === 'loss' ? 'LOSS' : 'BREAK_EVEN',
      openTime: t.created_at,
      closeTime: t.settled_at,
    }));
    return res.status(200).json({ ok: true, timestamp: new Date().toISOString(), agent: 'Bobby Agent Trader', scope: 'identity', source: 'your confirmed Base receipts', summary, openPositions, closedPositions: closedPositions.slice(0, 50) });
  } catch (error) {
    console.error('[bobby-pnl]', error);
    return res.status(503).json({ ok: false, error: 'PnL or sign-in service unavailable' });
  }
}
