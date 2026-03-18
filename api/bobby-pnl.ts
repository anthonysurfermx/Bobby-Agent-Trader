// ============================================================
// GET /api/bobby-pnl
// Bobby's REAL PnL Dashboard — reads directly from OKX CEX
// Shows live positions, trade history, equity curve, win rate
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac } from 'crypto';

const OKX_BASE = 'https://www.okx.com';
const API_KEY = process.env.OKX_CEX_API_KEY || '';
const SECRET = process.env.OKX_CEX_SECRET_KEY || '';
const PASSPHRASE = process.env.OKX_CEX_PASSPHRASE || '';

function signOKX(ts: string, method: string, path: string, body: string): string {
  return createHmac('sha256', SECRET).update(ts + method.toUpperCase() + path + body).digest('base64');
}

async function okxGet(path: string): Promise<any> {
  const ts = new Date().toISOString();
  const sign = signOKX(ts, 'GET', path, '');
  const res = await fetch(`${OKX_BASE}${path}`, {
    headers: {
      'OK-ACCESS-KEY': API_KEY,
      'OK-ACCESS-SIGN': sign,
      'OK-ACCESS-TIMESTAMP': ts,
      'OK-ACCESS-PASSPHRASE': PASSPHRASE,
    },
  });
  const data = await res.json();
  return data.data || [];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!API_KEY) {
    return res.status(200).json({
      ok: false,
      message: 'OKX CEX API not configured. Set OKX_CEX_API_KEY env vars.',
    });
  }

  try {
    // Fetch everything in parallel
    const [balanceData, positionsData, historyData, fillsData] = await Promise.all([
      okxGet('/api/v5/account/balance'),
      okxGet('/api/v5/account/positions?instType=SWAP'),
      okxGet('/api/v5/account/positions-history?instType=SWAP&limit=50'),
      okxGet('/api/v5/trade/fills?instType=SWAP&limit=100'),
    ]);

    // ── Current Balance ──
    const balance = balanceData[0] || {};
    const totalEquity = parseFloat(balance.totalEq || '0');
    const currencies = (balance.details || [])
      .filter((d: any) => parseFloat(d.eq) > 0.001)
      .map((d: any) => ({
        currency: d.ccy,
        equity: parseFloat(d.eq),
        equityUsd: parseFloat(d.eqUsd),
        unrealizedPnl: parseFloat(d.upl || '0'),
      }));

    // ── Open Positions (Live PnL) ──
    const openPositions = positionsData
      .filter((p: any) => parseFloat(p.pos || '0') !== 0)
      .map((p: any) => ({
        symbol: p.instId.split('-')[0],
        instId: p.instId,
        direction: parseFloat(p.pos) > 0 ? 'long' : 'short',
        size: Math.abs(parseFloat(p.pos)),
        leverage: `${p.lever}x`,
        entryPrice: parseFloat(p.avgPx),
        markPrice: parseFloat(p.markPx),
        unrealizedPnl: parseFloat(p.upl),
        unrealizedPnlPct: parseFloat(p.uplRatio || '0') * 100,
        margin: parseFloat(p.margin || '0'),
        liquidationPrice: parseFloat(p.liqPx || '0'),
        openTime: p.cTime ? new Date(parseInt(p.cTime)).toISOString() : null,
      }));

    // ── Closed Positions (Historical PnL) ──
    const closedPositions = historyData.map((p: any) => ({
      symbol: p.instId.split('-')[0],
      instId: p.instId,
      direction: p.direction || (parseFloat(p.openAvgPx || '0') < parseFloat(p.closeAvgPx || '0') ? 'long' : 'short'),
      entryPrice: parseFloat(p.openAvgPx || '0'),
      exitPrice: parseFloat(p.closeAvgPx || '0'),
      realizedPnl: parseFloat(p.realizedPnl || p.pnl || '0'),
      pnlPct: parseFloat(p.pnlRatio || '0') * 100,
      leverage: p.lever || '?',
      openTime: p.cTime ? new Date(parseInt(p.cTime)).toISOString() : null,
      closeTime: p.uTime ? new Date(parseInt(p.uTime)).toISOString() : null,
      result: parseFloat(p.realizedPnl || p.pnl || '0') > 0 ? 'WIN' : parseFloat(p.realizedPnl || p.pnl || '0') < 0 ? 'LOSS' : 'BREAK_EVEN',
    }));

    // ── Trade Fills ──
    const fills = fillsData.map((f: any) => ({
      symbol: f.instId.split('-')[0],
      side: f.side,
      price: parseFloat(f.fillPx),
      size: parseFloat(f.fillSz),
      fee: parseFloat(f.fee),
      time: f.ts ? new Date(parseInt(f.ts)).toISOString() : null,
    }));

    // ── Stats ──
    const wins = closedPositions.filter((p: any) => p.result === 'WIN').length;
    const losses = closedPositions.filter((p: any) => p.result === 'LOSS').length;
    const totalClosed = closedPositions.length;
    const winRate = totalClosed > 0 ? (wins / totalClosed * 100) : 0;
    const totalRealizedPnl = closedPositions.reduce((sum: number, p: any) => sum + p.realizedPnl, 0);
    const totalUnrealizedPnl = openPositions.reduce((sum: number, p: any) => sum + p.unrealizedPnl, 0);

    // ── Starting capital estimation ──
    const startingCapital = 10; // $10 USDT initial deposit
    const currentValue = totalEquity;
    const totalReturn = ((currentValue - startingCapital) / startingCapital) * 100;

    return res.status(200).json({
      ok: true,
      timestamp: new Date().toISOString(),
      agent: 'Bobby Agent Trader',

      // Summary
      summary: {
        startingCapital,
        currentEquity: totalEquity,
        totalReturn: parseFloat(totalReturn.toFixed(2)),
        realizedPnl: parseFloat(totalRealizedPnl.toFixed(4)),
        unrealizedPnl: parseFloat(totalUnrealizedPnl.toFixed(4)),
        totalTrades: totalClosed,
        wins,
        losses,
        winRate: parseFloat(winRate.toFixed(1)),
      },

      // Live positions
      openPositions,

      // Historical trades
      closedPositions,

      // Recent fills
      recentFills: fills.slice(0, 20),

      // Balance breakdown
      balance: {
        totalEquity,
        currencies,
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: 'Failed to fetch Bobby PnL',
      details: error instanceof Error ? error.message : 'Unknown',
    });
  }
}
