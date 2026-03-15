// ============================================================
// OKX CEX Market Data Service
// Fetches spot prices, funding rates, open interest from OKX
// Uses /api/okx-market and /api/okx-tickers Vercel proxies
// ============================================================

export interface OKXTicker {
  instId: string;
  symbol: string;
  last: number;
  high24h: number;
  low24h: number;
  vol24h: number;
  change24h: number;
  funding: {
    rate: number;
    annualized: number;
  } | null;
}

export interface OKXMarketDetail {
  instId: string;
  ticker: {
    last: number;
    high24h: number;
    low24h: number;
    vol24h: number;
    volCcy24h: number;
    change24h: number;
    ts: number;
  } | null;
  funding: {
    rate: number;
    nextRate: number;
    annualized: number;
    fundingTime: number;
    nextFundingTime: number;
  } | null;
  openInterest: {
    oi: number;
    oiCcy: number;
    ts: number;
  } | null;
}

// In-memory cache
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 30_000; // 30s

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data as T;
  return null;
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, ts: Date.now() });
}

/** Fetch all key tickers + funding rates in one call */
export async function fetchTickers(): Promise<OKXTicker[]> {
  const cached = getCached<OKXTicker[]>('tickers');
  if (cached) return cached;

  const res = await fetch('/api/okx-tickers');
  if (!res.ok) throw new Error('Failed to fetch OKX tickers');
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'OKX tickers error');

  const tickers = json.tickers as OKXTicker[];
  setCache('tickers', tickers);
  return tickers;
}

/** Fetch detailed market data for a specific instrument */
export async function fetchMarketDetail(instId: string): Promise<OKXMarketDetail> {
  const cacheKey = `detail:${instId}`;
  const cached = getCached<OKXMarketDetail>(cacheKey);
  if (cached) return cached;

  const res = await fetch(`/api/okx-market?instId=${encodeURIComponent(instId)}&type=all`);
  if (!res.ok) throw new Error('Failed to fetch OKX market data');
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'OKX market error');

  const detail: OKXMarketDetail = {
    instId: json.instId,
    ticker: json.ticker || null,
    funding: json.funding || null,
    openInterest: json.openInterest || null,
  };

  setCache(cacheKey, detail);
  return detail;
}

/** Format funding rate with color hint */
export function fundingColor(rate: number): 'green' | 'red' | 'neutral' {
  if (rate > 0.01) return 'green';  // Longs paying shorts — bullish shorts
  if (rate < -0.01) return 'red';   // Shorts paying longs — bearish shorts
  return 'neutral';
}

/** Format volume to human readable */
export function formatVolume(vol: number): string {
  if (vol >= 1_000_000_000) return `$${(vol / 1_000_000_000).toFixed(1)}B`;
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(0)}K`;
  return `$${vol.toFixed(0)}`;
}
