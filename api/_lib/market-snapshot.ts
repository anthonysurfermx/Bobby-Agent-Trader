// ============================================================
// Global market snapshot — the read-only public market fetchers shared by /api/bobby-intel and the Bobby Pro
// briefing worker (api/_lib/briefings/evidence.ts).
//   · Moved out of api/bobby-intel.ts unchanged: every fetcher keeps its URL, parsing, rounding and fail-soft
//     behaviour ([] / null on any error), so bobby-intel's payload and its api_cache entry are identical.
//   · The `*Quotes` / `*Detailed` variants keep the provider timestamp the original functions drop (Yahoo
//     regularMarketTime, alternative.me timestamp, the ECB fix date). The original functions are thin wrappers
//     that strip those fields again, so their output objects are key-for-key what they were.
//   · loadGlobalMarketSnapshot() is read-only: public endpoints, no credentials, no LLM, no trading, no writes
//     (it does not touch api_cache either). Every quote carries an as-of so a consumer can label freshness and
//     never present a closed or stale value as live.
// ============================================================

// ---- Market Regime Detection ----
export type MarketRegime = 'high_vol' | 'low_vol' | 'normal';

export function detectRegime(btcChange24h: number): { regime: MarketRegime; label: string } {
  const abs = Math.abs(btcChange24h);
  if (abs > 5) return { regime: 'high_vol', label: `HIGH VOLATILITY (BTC ${btcChange24h > 0 ? '+' : ''}${btcChange24h.toFixed(1)}%)` };
  if (abs < 2) return { regime: 'low_vol', label: `LOW VOLATILITY (BTC ${btcChange24h > 0 ? '+' : ''}${btcChange24h.toFixed(1)}%)` };
  return { regime: 'normal', label: `NORMAL (BTC ${btcChange24h > 0 ? '+' : ''}${btcChange24h.toFixed(1)}%)` };
}

// ---- OKX CEX Prices (spot + commodities) ----
export async function fetchLivePrices(): Promise<Array<{ symbol: string; price: number; change24h: number }>> {
  const instruments = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'OKB-USDT', 'XAUT-USDT', 'PAXG-USDT'];
  try {
    const res = await fetch('https://www.okx.com/api/v5/market/tickers?instType=SPOT');
    if (!res.ok) return [];
    const json = await res.json() as { code: string; data: Array<{ instId: string; last: string; open24h: string }> };
    if (json.code !== '0') return [];

    const tickerMap = new Map(json.data.map(t => [t.instId, t]));
    const prices = instruments.map(inst => {
      const t = tickerMap.get(inst);
      if (!t) return null;
      const last = parseFloat(t.last);
      const open = parseFloat(t.open24h);
      return {
        symbol: inst.split('-')[0],
        price: last,
        change24h: open > 0 ? parseFloat((((last - open) / open) * 100).toFixed(2)) : 0,
      };
    }).filter(Boolean) as Array<{ symbol: string; price: number; change24h: number }>;

    // Also fetch silver (SWAP only)
    try {
      const swapRes = await fetch('https://www.okx.com/api/v5/market/ticker?instId=XAG-USDT-SWAP');
      const swapJson = await swapRes.json() as { code: string; data: Array<{ last: string; open24h: string }> };
      if (swapJson.code === '0' && swapJson.data?.[0]) {
        const s = swapJson.data[0];
        const last = parseFloat(s.last);
        const open = parseFloat(s.open24h);
        prices.push({
          symbol: 'XAG',
          price: last,
          change24h: open > 0 ? parseFloat((((last - open) / open) * 100).toFixed(2)) : 0,
        });
      }
    } catch { /* non-critical */ }

    return prices;
  } catch { return []; }
}

// ---- Funding Rates (Long/Short Squeeze Detection) ----
// Critical CIO-level data: high positive funding = everyone long → squeeze risk
export interface FundingRate { symbol: string; rate: number; annualized: number; nextFundingTime: string }

export async function fetchFundingRates(): Promise<FundingRate[]> {
  const instruments = ['BTC-USDT-SWAP', 'ETH-USDT-SWAP', 'SOL-USDT-SWAP'];
  try {
    const results = await Promise.all(instruments.map(async (instId) => {
      try {
        const res = await fetch(`https://www.okx.com/api/v5/public/funding-rate?instId=${instId}`);
        if (!res.ok) return null;
        const json = await res.json() as { code: string; data: Array<{ instId: string; fundingRate: string; nextFundingRate: string; nextFundingTime: string }> };
        if (json.code !== '0' || !json.data?.[0]) return null;
        const d = json.data[0];
        const rate = parseFloat(d.fundingRate);
        return {
          symbol: instId.split('-')[0],
          rate,
          annualized: parseFloat((rate * 3 * 365 * 100).toFixed(1)), // 3 settlements/day × 365
          nextFundingTime: d.nextFundingTime,
        };
      } catch { return null; }
    }));
    return results.filter(Boolean) as FundingRate[];
  } catch { return []; }
}

// ---- Open Interest (Crowded Trade Detection) ----
export interface OpenInterestData { symbol: string; oi: number; oiCcy: number }

export async function fetchOpenInterest(): Promise<OpenInterestData[]> {
  const instruments = ['BTC-USDT-SWAP', 'ETH-USDT-SWAP', 'SOL-USDT-SWAP'];
  try {
    const results = await Promise.all(instruments.map(async (instId) => {
      try {
        const res = await fetch(`https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=${instId}`);
        if (!res.ok) return null;
        const json = await res.json() as { code: string; data: Array<{ instId: string; oi: string; oiCcy: string; ts: string }> };
        if (json.code !== '0' || !json.data?.[0]) return null;
        return {
          symbol: instId.split('-')[0],
          oi: parseInt(json.data[0].oi),
          oiCcy: parseFloat(json.data[0].oiCcy),
        };
      } catch { return null; }
    }));
    return results.filter(Boolean) as OpenInterestData[];
  } catch { return []; }
}

// ---- Top Traders Long/Short Ratio (Smart Money Positioning) ----
export interface LongShortRatio { symbol: string; longRatio: number; shortRatio: number; ts: string }

export async function fetchTopTradersLSRatio(): Promise<LongShortRatio[]> {
  const instruments = [
    { symbol: 'BTC', instId: 'BTC-USDT-SWAP' },
    { symbol: 'ETH', instId: 'ETH-USDT-SWAP' },
    { symbol: 'SOL', instId: 'SOL-USDT-SWAP' },
  ];
  try {
    const results = await Promise.all(instruments.map(async ({ symbol, instId }) => {
      try {
        const res = await fetch(`https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio-contract-top-trader?instId=${instId}&period=1H`);
        if (!res.ok) return null;
        const json = await res.json() as { code: string; data: string[][] };
        if (json.code !== '0' || !json.data?.[0]) return null;
        const latest = json.data[0]; // [timestamp, ratio]
        const ratio = parseFloat(latest[1]);
        // ratio > 1 means more longs, < 1 means more shorts
        const longPct = parseFloat((ratio / (1 + ratio) * 100).toFixed(1));
        const shortPct = parseFloat((100 - longPct).toFixed(1));
        return {
          symbol,
          longRatio: longPct,
          shortRatio: shortPct,
          ts: latest[0],
        };
      } catch { return null; }
    }));
    return results.filter(Boolean) as LongShortRatio[];
  } catch { return []; }
}


// ---- Fear & Greed Index (Market Sentiment) ----
export interface FearGreedData { value: number; classification: string }

/** fetchFearGreed plus the index publication time (alternative.me `timestamp`, a daily index). */
export async function fetchFearGreedDetailed(): Promise<(FearGreedData & { asOf: string | null }) | null> {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1&format=json');
    if (!res.ok) return null;
    const json = await res.json() as { data: Array<{ value: string; value_classification: string; timestamp?: string }> };
    if (!json.data?.[0]) return null;
    return {
      value: parseInt(json.data[0].value),
      classification: json.data[0].value_classification,
      asOf: unixSecondsIso(json.data[0].timestamp),
    };
  } catch { return null; }
}

export async function fetchFearGreed(): Promise<FearGreedData | null> {
  const d = await fetchFearGreedDetailed();
  return d ? { value: d.value, classification: d.classification } : null;
}

// ---- DXY (US Dollar Index — calculated from ECB forex rates) ----
/** fetchDXY plus the ECB reference-rate date the value is computed from (`YYYY-MM-DD`, a daily fix). */
export async function fetchDXYDetailed(): Promise<{ dxy: number; asOf: string | null } | null> {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR,JPY,GBP,CAD,SEK,CHF');
    if (!res.ok) return null;
    const json = await res.json() as { date?: string; rates: { EUR: number; JPY: number; GBP: number; CAD: number; SEK: number; CHF: number } };
    const r = json.rates;
    // ICE DXY formula: 50.14348112 × (1/EUR)^0.576 × JPY^0.136 × (1/GBP)^0.119 × CAD^0.091 × SEK^0.042 × CHF^0.036
    const dxy = 50.14348112
      * Math.pow(1 / r.EUR, 0.576)
      * Math.pow(r.JPY, 0.136)
      * Math.pow(1 / r.GBP, 0.119)
      * Math.pow(r.CAD, 0.091)
      * Math.pow(r.SEK, 0.042)
      * Math.pow(r.CHF, 0.036);
    return { dxy: parseFloat(dxy.toFixed(2)), asOf: typeof json.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(json.date) ? json.date : null };
  } catch { return null; }
}

export async function fetchDXY(): Promise<{ dxy: number } | null> {
  const d = await fetchDXYDetailed();
  return d ? { dxy: d.dxy } : null;
}

// ---- Yahoo Finance (Top Stocks Integration) ----
/** A stock quote with the provider's regular-market time and the previous close the change is measured against. */
export interface StockQuote { symbol: string; price: number; change24h: number; prevClose: number | null; asOf: string | null }

/** fetchTopStocks plus Yahoo `regularMarketTime` (asOf) and the previous close (null when Yahoo gave none). */
export async function fetchTopStockQuotes(): Promise<StockQuote[]> {
  try {
    // 12 names, which puts the shell ticker at ~19 symbols alongside the
    // crypto and metals quotes. One request either way — Yahoo takes the
    // whole list in a single spark call.
    const url = 'https://query1.finance.yahoo.com/v7/finance/spark?symbols=NVDA,AAPL,TSLA,META,MSFT,COIN,SPY,GOOGL,AMZN,AMD,MSTR,QQQ&range=1d&interval=1d';
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) return [];
    const data = await response.json() as Record<string, unknown>;
    const spark = data.spark as { result?: Array<{ symbol: string; response: Array<{ meta: Record<string, unknown> }> }> } | undefined;
    const quotes: StockQuote[] = [];
    for (const item of spark?.result || []) {
      const meta = item.response?.[0]?.meta;
      if (!meta) continue;
      const price = Number(meta.regularMarketPrice || 0);
      const prev = Number(meta.chartPreviousClose || meta.previousClose || 0);
      quotes.push({
        symbol: item.symbol,
        price,
        change24h: prev > 0 ? parseFloat((((price - prev) / prev) * 100).toFixed(2)) : 0,
        prevClose: prev > 0 ? prev : null,
        asOf: unixSecondsIso(meta.regularMarketTime),
      });
    }
    return quotes;
  } catch { return []; }
}

export async function fetchTopStocks(): Promise<Array<{ symbol: string; price: number; change24h: number }>> {
  return (await fetchTopStockQuotes()).map(({ symbol, price, change24h }) => ({ symbol, price, change24h }));
}

/** Unix seconds (number or numeric string) → ISO; null for anything that is not a plausible timestamp. Never throws. */
function unixSecondsIso(raw: unknown): string | null {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(n) || n < 946_684_800 || n > 32_503_680_000) return null; // 2000-01-01 … 3000-01-01
  return new Date(n * 1000).toISOString();
}

// ============================================================
// Global market snapshot (briefings). Read-only and fail-soft per source: a failed source becomes an empty
// list / null plus `ok: false` in `sources`, never an invented value.
// ============================================================

/** A quote with its provider as-of. Crypto/metals: rolling 24h vs OKX open24h, asOf = fetch time. Stocks: vs previous close. */
export interface SnapshotQuote { symbol: string; price: number; change24h: number; asOf: string | null; prevClose?: number | null }

export type SnapshotSourceName = 'okx_spot' | 'yahoo_equities' | 'okx_funding' | 'fear_greed' | 'dxy_ecb';

export interface GlobalMarketSnapshot {
  /** Crypto + metals (OKX spot, XAG perpetual). asOf = the instant the fetch started (OKX gives no per-quote time here). */
  prices: SnapshotQuote[];
  /** Equities/ETFs (Yahoo). asOf = regularMarketTime when Yahoo provides it, else null. */
  stocks: SnapshotQuote[];
  funding: FundingRate[];
  fearGreed: (FearGreedData & { asOf: string | null }) | null;
  /** asOf is the ECB reference-rate date (YYYY-MM-DD). */
  dxy: { dxy: number; asOf: string | null } | null;
  /** From BTC's rolling 24h change; null when BTC is missing (never computed from a default 0). */
  regime: { regime: MarketRegime; label: string } | null;
  fetchedAt: string;
  sources: Array<{ name: SnapshotSourceName; ok: boolean }>;
}

export interface SnapshotFetchers {
  livePrices: typeof fetchLivePrices;
  stocks: typeof fetchTopStockQuotes;
  funding: typeof fetchFundingRates;
  fearGreed: typeof fetchFearGreedDetailed;
  dxy: typeof fetchDXYDetailed;
  now: () => Date;
}

const DEFAULT_FETCHERS: SnapshotFetchers = {
  livePrices: fetchLivePrices,
  stocks: fetchTopStockQuotes,
  funding: fetchFundingRates,
  fearGreed: fetchFearGreedDetailed,
  dxy: fetchDXYDetailed,
  now: () => new Date(),
};

/** One fan-out over the public sources. No credentials, no LLM, no trading, no writes. Fetchers injectable for tests. */
export async function loadGlobalMarketSnapshot(fetchers: Partial<SnapshotFetchers> = {}): Promise<GlobalMarketSnapshot> {
  const f = { ...DEFAULT_FETCHERS, ...fetchers };
  const fetchedAt = f.now().toISOString();
  const settled = await Promise.allSettled([f.livePrices(), f.stocks(), f.funding(), f.fearGreed(), f.dxy()]);
  const value = <T>(i: number, fallback: T): T => (settled[i].status === 'fulfilled' ? ((settled[i] as PromiseFulfilledResult<T>).value ?? fallback) : fallback);
  const crypto = value<Array<{ symbol: string; price: number; change24h: number }>>(0, []);
  const stocks = value<StockQuote[]>(1, []);
  const funding = value<FundingRate[]>(2, []);
  const fearGreed = value<GlobalMarketSnapshot['fearGreed']>(3, null);
  const dxy = value<GlobalMarketSnapshot['dxy']>(4, null);
  const btc = crypto.find((q) => q.symbol === 'BTC' && Number.isFinite(q.change24h));
  return {
    prices: crypto.map((q) => ({ symbol: q.symbol, price: q.price, change24h: q.change24h, asOf: fetchedAt })),
    stocks: stocks.map((q) => ({ symbol: q.symbol, price: q.price, change24h: q.change24h, asOf: q.asOf, prevClose: q.prevClose })),
    funding,
    fearGreed,
    dxy,
    regime: btc ? detectRegime(btc.change24h) : null,
    fetchedAt,
    sources: [
      { name: 'okx_spot', ok: crypto.length > 0 },
      { name: 'yahoo_equities', ok: stocks.length > 0 },
      { name: 'okx_funding', ok: funding.length > 0 },
      { name: 'fear_greed', ok: fearGreed !== null },
      { name: 'dxy_ecb', ok: dxy !== null },
    ],
  };
}
