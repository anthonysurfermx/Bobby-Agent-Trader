// ============================================================
// GET /api/stock-candles?symbol=NVDA&range=7d
// Yahoo Finance Spark API — returns OHLCV data for stock charts
// Used by Bobby's expandable price cards for stocks
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 10 };

const VALID_RANGES: Record<string, { range: string; interval: string }> = {
  '7d': { range: '7d', interval: '1h' },
  '30d': { range: '1mo', interval: '1d' },
  '90d': { range: '3mo', interval: '1d' },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const symbol = ((req.query.symbol as string) || 'NVDA').toUpperCase();
  const rangeKey = (req.query.range as string) || '7d';
  const requestedInterval = (req.query.interval as string) || '';
  const allowedIntervals = new Set(['15m', '1h', '1d']);
  const baseConfig = VALID_RANGES[rangeKey] || VALID_RANGES['7d'];
  const config = allowedIntervals.has(requestedInterval) ? { ...baseConfig, interval: requestedInterval } : baseConfig;

  // Bounded provider identifier: preserve exchange suffixes and share classes.
  if (!/^[A-Z0-9][A-Z0-9.^=-]{0,19}$/.test(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol' });
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${config.range}&interval=${config.interval}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BobbyAgentTrader/1.0)' },
    });

    if (!response.ok) {
      return res.status(502).json({ error: `Yahoo Finance: ${response.status}` });
    }

    const data = await response.json() as {
      chart?: {
        result?: Array<{
          meta?: { symbol?: string; currency?: string; exchangeName?: string; fullExchangeName?: string; regularMarketTime?: number };
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
    if (result?.meta?.symbol && result.meta.symbol.toUpperCase() !== symbol) return res.status(502).json({ error: 'Instrument mismatch' });
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
      close: quote.close?.[i] ?? null,
      open: quote.open?.[i] ?? null,
      high: quote.high?.[i] ?? null,
      low: quote.low?.[i] ?? null,
      volume: quote.volume?.[i] ?? 0,
    })).filter(c => [c.ts, c.close, c.open, c.high, c.low].every(v => typeof v === 'number' && Number.isFinite(v)) && c.close! > 0 && c.open! > 0 && c.low! > 0 && c.high! >= c.low!); // Remove null/zero entries

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

    return res.status(200).json({ ok: true, symbol, candles, currency: result.meta?.currency ?? null, exchange: result.meta?.fullExchangeName ?? result.meta?.exchangeName ?? null, asOf: candles.length ? new Date(candles.at(-1)!.ts).toISOString() : null, provider: 'Yahoo Finance' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Stock Candles] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
