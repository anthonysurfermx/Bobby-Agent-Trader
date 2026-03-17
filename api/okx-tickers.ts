// ============================================================
// GET /api/okx-tickers
// Batch fetch OKX spot tickers + funding rates for key assets
// Returns: array of { instId, last, change24h, vol24h, funding }
// No API key required — public endpoints
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

const OKX_BASE = 'https://www.okx.com';

const DEFAULT_INSTRUMENTS = ['BTC-USDT', 'ETH-USDT', 'OKB-USDT', 'SOL-USDT', 'MATIC-USDT', 'XAUT-USDT', 'PAXG-USDT'];
// XAG (silver) is only available as SWAP, handled separately
const SWAP_INSTRUMENTS = ['XAG-USDT-SWAP'];

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`OKX ${res.status}`);
  const json = await res.json() as { code: string; msg: string; data: T };
  if (json.code !== '0') throw new Error(`OKX code ${json.code}: ${json.msg}`);
  return json.data;
}

interface RawTicker {
  instId: string;
  last: string;
  open24h: string;
  high24h: string;
  low24h: string;
  vol24h: string;
  volCcy24h: string;
}

interface RawFunding {
  instId: string;
  fundingRate: string;
  nextFundingRate: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Fetch all spot tickers at once (single call, very fast)
    const allTickers = await fetchJSON<RawTicker[]>(
      `${OKX_BASE}/api/v5/market/tickers?instType=SPOT`
    );

    // Filter to our target instruments
    const instruments = DEFAULT_INSTRUMENTS;
    const tickerMap = new Map(allTickers.map(t => [t.instId, t]));

    // Fetch funding rates for perpetual swaps
    let fundingMap = new Map<string, RawFunding>();
    try {
      const swapTickers = await fetchJSON<RawFunding[]>(
        `${OKX_BASE}/api/v5/public/funding-rate-all`
      );
      fundingMap = new Map(swapTickers.map(f => [f.instId, f]));
    } catch {
      // funding-rate-all may not be available, fetch individually
      const fundingPromises = instruments.map(async inst => {
        const swapId = `${inst}-SWAP`;
        try {
          const data = await fetchJSON<RawFunding[]>(
            `${OKX_BASE}/api/v5/public/funding-rate?instId=${swapId}`
          );
          if (data.length > 0) fundingMap.set(data[0].instId, data[0]);
        } catch { /* skip */ }
      });
      await Promise.all(fundingPromises);
    }

    // Also fetch SWAP tickers for commodities like XAG (silver)
    let swapTickerMap = new Map<string, RawTicker>();
    try {
      const swapTickers = await fetchJSON<RawTicker[]>(
        `${OKX_BASE}/api/v5/market/tickers?instType=SWAP`
      );
      swapTickerMap = new Map(swapTickers.map(t => [t.instId, t]));
    } catch { /* non-critical */ }

    const tickers = instruments.map(inst => {
      const t = tickerMap.get(inst);
      if (!t) return null;

      const last = parseFloat(t.last);
      const open24h = parseFloat(t.open24h);
      const change24h = open24h > 0 ? ((last - open24h) / open24h) * 100 : 0;
      const symbol = inst.split('-')[0];
      const swapId = `${inst}-SWAP`;
      const f = fundingMap.get(swapId);

      return {
        instId: inst,
        symbol,
        last,
        high24h: parseFloat(t.high24h),
        low24h: parseFloat(t.low24h),
        vol24h: parseFloat(t.volCcy24h), // volume in quote currency (USDT)
        change24h: parseFloat(change24h.toFixed(2)),
        funding: f ? {
          rate: parseFloat(f.fundingRate),
          annualized: parseFloat((parseFloat(f.fundingRate) * 3 * 365 * 100).toFixed(2)),
        } : null,
      };
    }).filter(Boolean);

    // Add SWAP-only instruments (XAG silver)
    for (const swapInst of SWAP_INSTRUMENTS) {
      const st = swapTickerMap.get(swapInst);
      if (!st) continue;
      const last = parseFloat(st.last);
      const open24h = parseFloat(st.open24h);
      const change24h = open24h > 0 ? ((last - open24h) / open24h) * 100 : 0;
      const symbol = swapInst.split('-')[0]; // XAG
      tickers.push({
        instId: swapInst,
        symbol,
        last,
        high24h: parseFloat(st.high24h),
        low24h: parseFloat(st.low24h),
        vol24h: parseFloat(st.volCcy24h),
        change24h: parseFloat(change24h.toFixed(2)),
        funding: null,
      });
    }

    // Cache 30 seconds
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=15');

    return res.status(200).json({ ok: true, tickers, ts: Date.now() });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[OKX Tickers] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
