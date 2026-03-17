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
  previousClose: number;
  change24h: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const symbolsParam = (req.query.symbols as string) || 'NVDA,AAPL,TSLA,META,MSFT';
  const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase()).slice(0, 10);

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${symbols.join(',')}&range=1d&interval=1d`;

    const response = await fetch(url, {
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

    for (const item of spark.result) {
      const meta = item.response?.[0]?.meta;
      if (!meta) continue;

      const price = Number(meta.regularMarketPrice || 0);
      const previousClose = Number(meta.chartPreviousClose || meta.previousClose || 0);
      const change = previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : 0;

      quotes.push({
        symbol: item.symbol,
        name: KNOWN_STOCKS[item.symbol] || String(meta.longName || item.symbol),
        price,
        previousClose,
        change24h: parseFloat(change.toFixed(2)),
        dayHigh: Number(meta.regularMarketDayHigh || 0),
        dayLow: Number(meta.regularMarketDayLow || 0),
        volume: Number(meta.regularMarketVolume || 0),
        fiftyTwoWeekHigh: Number(meta.fiftyTwoWeekHigh || 0),
        fiftyTwoWeekLow: Number(meta.fiftyTwoWeekLow || 0),
      });
    }

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60');

    return res.status(200).json({
      ok: true,
      quotes,
      ts: Date.now(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Stock Price] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
