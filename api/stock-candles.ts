// ============================================================
// GET /api/stock-candles?symbol=NVDA&range=7d
// Yahoo Finance Spark API — returns OHLCV data for stock charts
// Used by Bobby's expandable price cards for stocks
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 10 };

const VALID_RANGES: Record<string, { range: string; interval: string }> = {
  '7d': { range: '7d', interval: '1d' },
  '30d': { range: '1mo', interval: '1d' },
  '90d': { range: '3mo', interval: '1d' },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const symbol = ((req.query.symbol as string) || 'NVDA').toUpperCase();
  const rangeKey = (req.query.range as string) || '7d';
  const config = VALID_RANGES[rangeKey] || VALID_RANGES['7d'];

  // Validate symbol (letters only, 1-5 chars)
  if (!/^[A-Z]{1,5}$/.test(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol' });
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${config.range}&interval=${config.interval}`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BobbyAgentTrader/1.0)' },
    });

    if (!response.ok) {
      return res.status(502).json({ error: `Yahoo Finance: ${response.status}` });
    }

    const data = await response.json() as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: {
            quote?: Array<{
              close?: (number | null)[];
              open?: (number | null)[];
              high?: (number | null)[];
              low?: (number | null)[];
              volume?: (number | null)[];
            }>;
          };
        }>;
      };
    };

    const result = data.chart?.result?.[0];
    if (!result?.timestamp) {
      return res.status(502).json({ error: 'No chart data' });
    }

    const timestamps = result.timestamp;
    const quote = result.indicators?.quote?.[0];
    if (!quote) {
      return res.status(502).json({ error: 'No quote data' });
    }

    const candles = timestamps.map((ts, i) => ({
      ts: ts * 1000, // Convert to milliseconds
      close: quote.close?.[i] ?? 0,
      open: quote.open?.[i] ?? 0,
      high: quote.high?.[i] ?? 0,
      low: quote.low?.[i] ?? 0,
      volume: quote.volume?.[i] ?? 0,
    })).filter(c => c.close > 0); // Remove null/zero entries

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

    return res.status(200).json({ ok: true, symbol, candles });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Stock Candles] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
