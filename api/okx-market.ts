// ============================================================
// GET /api/okx-market
// Proxy for OKX V5 public market data — no API key required
// Returns: ticker, funding rate, open interest for a given instId
// Params: instId (e.g. BTC-USDT), type (ticker|funding|oi|all)
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

const OKX_BASE = 'https://www.okx.com';

interface TickerData {
  instId: string;
  last: string;
  lastSz: string;
  open24h: string;
  high24h: string;
  low24h: string;
  vol24h: string;
  volCcy24h: string;
  sodUtc0: string;
  ts: string;
}

interface FundingData {
  instId: string;
  fundingRate: string;
  nextFundingRate: string;
  fundingTime: string;
  nextFundingTime: string;
}

interface OIData {
  instId: string;
  oi: string;
  oiCcy: string;
  ts: string;
}

async function fetchOKX<T>(path: string): Promise<T[]> {
  const res = await fetch(`${OKX_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`OKX ${res.status}: ${await res.text()}`);
  const json = await res.json() as { code: string; msg: string; data: T[] };
  if (json.code !== '0') throw new Error(`OKX code ${json.code}: ${json.msg}`);
  return json.data;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { instId, type = 'all' } = req.query;

  if (!instId) {
    return res.status(400).json({
      error: 'Missing instId param. Example: BTC-USDT',
    });
  }

  const inst = String(instId);
  const queryType = String(type);

  try {
    const result: Record<string, unknown> = { instId: inst };

    // Spot ticker (works for all instrument types)
    if (queryType === 'all' || queryType === 'ticker') {
      const tickers = await fetchOKX<TickerData>(
        `/api/v5/market/ticker?instId=${inst}`
      );
      if (tickers.length > 0) {
        const t = tickers[0];
        const last = parseFloat(t.last);
        const open24h = parseFloat(t.open24h);
        const change24h = open24h > 0 ? ((last - open24h) / open24h) * 100 : 0;
        result.ticker = {
          last,
          high24h: parseFloat(t.high24h),
          low24h: parseFloat(t.low24h),
          vol24h: parseFloat(t.vol24h),
          volCcy24h: parseFloat(t.volCcy24h),
          change24h: parseFloat(change24h.toFixed(2)),
          ts: parseInt(t.ts),
        };
      }
    }

    // Funding rate (SWAP only)
    if (queryType === 'all' || queryType === 'funding') {
      const swapInstId = inst.includes('-SWAP') ? inst : `${inst}-SWAP`;
      try {
        const funding = await fetchOKX<FundingData>(
          `/api/v5/public/funding-rate?instId=${swapInstId}`
        );
        if (funding.length > 0) {
          const f = funding[0];
          result.funding = {
            rate: parseFloat(f.fundingRate),
            nextRate: parseFloat(f.nextFundingRate),
            fundingTime: parseInt(f.fundingTime),
            nextFundingTime: parseInt(f.nextFundingTime),
            annualized: parseFloat((parseFloat(f.fundingRate) * 3 * 365 * 100).toFixed(2)),
          };
        }
      } catch {
        // SWAP may not exist for all pairs — skip silently
      }
    }

    // Open interest (SWAP only)
    if (queryType === 'all' || queryType === 'oi') {
      const swapInstId = inst.includes('-SWAP') ? inst : `${inst}-SWAP`;
      try {
        const oi = await fetchOKX<OIData>(
          `/api/v5/public/open-interest?instType=SWAP&instId=${swapInstId}`
        );
        if (oi.length > 0) {
          result.openInterest = {
            oi: parseFloat(oi[0].oi),
            oiCcy: parseFloat(oi[0].oiCcy),
            ts: parseInt(oi[0].ts),
          };
        }
      } catch {
        // Skip silently
      }
    }

    // Cache 30 seconds
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=15');

    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[OKX Market] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
