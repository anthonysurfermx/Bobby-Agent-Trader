// Public last price for reviewing a thesis. Returns null when no venue answers.
import { getBaseVenues } from '../../src/lib/okx-asset-search.js';
import { isEquitySymbol, normalizeAssetSymbol } from '../../src/lib/voice-assets.js';

const OKX_TICKER = 'https://www.okx.com/api/v5/market/ticker';
const YAHOO_SPARK = 'https://query1.finance.yahoo.com/v7/finance/spark';
const TIMEOUT_MS = 6_000;

function positive(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function okxLast(instId: string): Promise<number | null> {
  try {
    const r = await fetch(`${OKX_TICKER}?instId=${encodeURIComponent(instId)}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) return null;
    const json = (await r.json()) as { code?: string; data?: Array<{ last?: string }> };
    return json.code === '0' ? positive(json.data?.[0]?.last) : null;
  } catch { return null; }
}

async function yahooLast(symbol: string): Promise<number | null> {
  try {
    const r = await fetch(`${YAHOO_SPARK}?symbols=${encodeURIComponent(symbol)}&range=1d&interval=1d`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BobbyAgentTrader/1.0)' }, signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) return null;
    const json = (await r.json()) as { spark?: { result?: Array<{ symbol: string; response?: Array<{ meta?: Record<string, unknown> }> }> } };
    const meta = json.spark?.result?.find((row) => row.symbol === symbol)?.response?.[0]?.meta;
    return positive(meta?.regularMarketPrice);
  } catch { return null; }
}

export async function publicLastPrice(rawSymbol: string, isEquity: boolean): Promise<number | null> {
  const symbol = normalizeAssetSymbol(rawSymbol);
  if (!symbol) return null;
  if (isEquity || isEquitySymbol(symbol)) {
    const listed = await yahooLast(symbol);
    if (listed) return listed;
    const venues = await getBaseVenues(symbol).catch(() => ({ spotId: null, swapId: null }));
    const instId = venues.swapId ?? venues.spotId;
    return instId ? okxLast(instId) : null;
  }
  return okxLast(`${symbol}-USDT`);
}
