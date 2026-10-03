import { regionalStock, regionalDefaults } from '../src/lib/regional-stocks.js';
// ============================================================
// GET /api/stock-price?symbols=NVDA,AAPL,TSLA
// Yahoo Finance Spark API — free, no API key, batch support
// Returns stock prices for Bobby's cross-market intelligence
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 10 };

// Major stocks Bobby can analyze
const KNOWN_STOCKS: Record<string, string> = {
  NVDA: 'NVIDIA',
  AAPL: 'Apple',
  TSLA: 'Tesla',
  META: 'Meta',
  GOOGL: 'Alphabet',
  AMZN: 'Amazon',
  MSFT: 'Microsoft',
  AMD: 'AMD',
  INTC: 'Intel',
  COIN: 'Coinbase',
  MSTR: 'MicroStrategy',
  PLTR: 'Palantir',
  NFLX: 'Netflix',
  DIS: 'Disney',
  JPM: 'JPMorgan',
  GS: 'Goldman Sachs',
  GLD: 'SPDR Gold ETF',
  SLV: 'iShares Silver ETF',
  SPY: 'S&P 500 ETF',
  QQQ: 'Nasdaq 100 ETF',
};

interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  previousClose: number | null;
  change24h: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  currency: string;
  exchange: string | null;
  asOf: string;
  provider: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const defaults = regionalDefaults(req.query.language ?? req.query.lang, req.query.locale);
  const symbolsParam = (req.query.symbols as string) || (defaults.length ? defaults.map(s => s.symbol).join(',') : 'NVDA,AAPL,TSLA,META,MSFT');
  const symbols = [...new Set(symbolsParam.split(',').map(s => s.trim().toUpperCase()))].slice(0, 10);
  if (!symbols.length || symbols.some(s => !/^[A-Z0-9][A-Z0-9.^=-]{0,19}$/.test(s))) return res.status(400).json({ error: 'Invalid symbols' });

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${encodeURIComponent(symbols.join(','))}&range=1d&interval=1d`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BobbyAgentTrader/1.0)',
      },
    });

    if (!response.ok) {
      return res.status(502).json({ error: `Yahoo Finance: ${response.status}` });
    }

    const data = await response.json() as Record<string, unknown>;
    const spark = data.spark as { result?: Array<{ symbol: string; response: Array<{ meta: Record<string, unknown> }> }> } | undefined;

    if (!spark?.result) {
      return res.status(502).json({ error: 'Invalid Yahoo Finance response' });
    }

    const quotes: StockQuote[] = [];
    const metric = (v: unknown): number | null => v === undefined || v === null || v === '' ? null : Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null;

    for (const item of spark.result) {
      const meta = item.response?.[0]?.meta;
      if (!meta || !symbols.includes(item.symbol) || (meta.symbol && meta.symbol !== item.symbol)) continue;

      const price = Number(meta.regularMarketPrice);
      const currency = typeof meta.currency === 'string' && /^[A-Z]{3}$/.test(meta.currency) ? meta.currency : null;
      const at = Number(meta.regularMarketTime) * 1000;
      if (!Number.isFinite(price) || price <= 0 || !currency || !Number.isFinite(at) || at <= 0 || at > Date.now() + 60_000) continue;
      const listing = regionalStock(item.symbol);
      if (listing && currency !== listing.currency) continue;
      const prev = Number(meta.chartPreviousClose ?? meta.previousClose);
      const previousClose = Number.isFinite(prev) && prev > 0 ? prev : null;
      const change = previousClose ? ((price - previousClose) / previousClose) * 100 : null;

      quotes.push({
        symbol: item.symbol, currency, asOf: new Date(at).toISOString(), exchange: typeof meta.fullExchangeName === 'string' ? meta.fullExchangeName : typeof meta.exchangeName === 'string' ? meta.exchangeName : listing?.exchange ?? null, provider: 'Yahoo Finance',
        name: listing?.name || KNOWN_STOCKS[item.symbol] || String(meta.longName || item.symbol),
        price,
        previousClose,
        change24h: change === null ? null : Number(change.toFixed(2)),
        dayHigh: metric(meta.regularMarketDayHigh),
        dayLow: metric(meta.regularMarketDayLow),
        volume: metric(meta.regularMarketVolume),
        fiftyTwoWeekHigh: metric(meta.fiftyTwoWeekHigh),
        fiftyTwoWeekLow: metric(meta.fiftyTwoWeekLow),
      });
    }

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60');

    return res.status(200).json({
      ok: true,
      quotes,
      unavailable: symbols.filter(s => !quotes.some(q => q.symbol === s)),
      ts: Date.now(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Stock Price] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
