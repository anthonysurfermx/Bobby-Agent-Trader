// ============================================================
// GET /api/onchainos-price?symbol=BTC-USDT
// Consulta precio spot desde OKX Market API
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

const OKX_BASE_URL = 'https://www.okx.com/api/v5';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const symbol = req.query.symbol as string;

  if (!symbol) {
    return res.status(400).json({ error: 'Missing symbol parameter (e.g. ?symbol=BTC-USDT)' });
  }

  try {
    // Precio spot público — no requiere autenticación
    const url = `${OKX_BASE_URL}/market/ticker?instId=${encodeURIComponent(symbol)}`;

    console.log('[OnchainOS] PRICE REQUEST', symbol);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`OKX API HTTP ${response.status}`);
    }

    const json = await response.json() as {
      code: string;
      msg: string;
      data: Array<{
        instId: string;
        last: string;
        askPx: string;
        bidPx: string;
        high24h: string;
        low24h: string;
        vol24h: string;
        ts: string;
      }>;
    };

    if (json.code !== '0' || !json.data || json.data.length === 0) {
      throw new Error(`OKX API Error: ${json.msg || 'No data'}`);
    }

    const ticker = json.data[0];

    // Cache por 10 segundos en edge
    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=5');

    return res.status(200).json({
      symbol: ticker.instId,
      price: parseFloat(ticker.last),
      bid: parseFloat(ticker.bidPx),
      ask: parseFloat(ticker.askPx),
      high24h: parseFloat(ticker.high24h),
      low24h: parseFloat(ticker.low24h),
      volume24h: parseFloat(ticker.vol24h),
      timestamp: parseInt(ticker.ts, 10),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[OnchainOS] PRICE FETCH FAILED', msg);
    return res.status(500).json({ error: msg });
  }
}
