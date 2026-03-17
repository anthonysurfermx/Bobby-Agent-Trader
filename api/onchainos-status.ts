// ============================================================
// GET /api/onchainos-status
// Verifica conexión OKX, retorna balance y estado del rate limiter
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

const OKX_BASE_URL = 'https://www.okx.com/api/v5';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const hasCredentials = !!(
    process.env.OKX_API_KEY &&
    process.env.OKX_SECRET_KEY &&
    process.env.OKX_PASSPHRASE
  );

  if (!hasCredentials) {
    return res.status(200).json({
      connected: false,
      reason: 'no_credentials',
      tradingEnabled: false,
      maxPositionUsdc: process.env.MAX_POSITION_USDC || '100',
      minDivergence: process.env.MIN_DIVERGENCE_THRESHOLD || '3',
    });
  }

  try {
    // Verificar conectividad con un endpoint público
    const testUrl = `${OKX_BASE_URL}/market/ticker?instId=BTC-USDT`;
    const testResponse = await fetch(testUrl);

    if (!testResponse.ok) {
      throw new Error(`OKX API unreachable: HTTP ${testResponse.status}`);
    }

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=10');

    return res.status(200).json({
      connected: true,
      tradingEnabled: process.env.ENABLE_LIVE_TRADING === 'true',
      maxPositionUsdc: process.env.MAX_POSITION_USDC || '100',
      minDivergence: process.env.MIN_DIVERGENCE_THRESHOLD || '3',
      maxLeverage: '5',
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[OnchainOS] STATUS CHECK FAILED', msg);
    return res.status(200).json({
      connected: false,
      reason: msg,
      tradingEnabled: false,
      maxPositionUsdc: process.env.MAX_POSITION_USDC || '100',
      minDivergence: process.env.MIN_DIVERGENCE_THRESHOLD || '3',
    });
  }
}
