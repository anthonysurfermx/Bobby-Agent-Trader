// ============================================================
// GET /api/okx-candles?instId=BTC-USDT&bar=1D&limit=7
// Proxy to OKX V5 /market/candles — returns OHLCV data
// Used by Bobby's expandable price charts
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 10 };

const VALID_BARS = new Set(['1m','5m','15m','30m','1H','4H','1D','1W']);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const instId = (req.query.instId as string) || 'BTC-USDT';
  const bar = (req.query.bar as string) || '1D';
  const limit = Math.min(Number(req.query.limit) || 7, 100);

  // Validate bar parameter
  if (!VALID_BARS.has(bar)) {
    return res.status(400).json({ error: `Invalid bar. Use: ${[...VALID_BARS].join(', ')}` });
  }

  // Validate instId format (e.g. BTC-USDT, ETH-USDT)
  if (!/^[A-Z0-9]+-[A-Z0-9]+$/i.test(instId)) {
    return res.status(400).json({ error: 'Invalid instId format' });
  }

  try {
    const url = `https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(instId)}&bar=${bar}&limit=${limit}`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'BobbyAgentTrader/1.0' },
    });

    if (!response.ok) {
      return res.status(502).json({ error: `OKX API: ${response.status}` });
    }

    const json = await response.json() as { code: string; data: string[][] };

    if (json.code !== '0' || !json.data) {
      return res.status(502).json({ error: 'Invalid OKX response' });
    }

    // OKX candle format: [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]
    const candles = json.data.map((c: string[]) => ({
      ts: Number(c[0]),
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
    })).reverse(); // OKX returns newest first, we want chronological

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

    return res.status(200).json({ ok: true, instId, bar, candles });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[OKX Candles] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
