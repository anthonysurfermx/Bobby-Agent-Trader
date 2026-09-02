// ============================================================
// okx-indicators — per-instrument indicator bundle from OKX's public
// indicator API, in the exact shape bobby-technical scores.
//
// bobby-intel builds the same bundle for BTC/ETH/SOL only. This helper lets
// voice-tool build it on demand for ANY OKX instrument — including the
// tokenized-stock swaps (NVDA-USDT-SWAP, AAPL-USDT-SWAP...) — so an equity
// question gets the same signal/direction/conviction/trade-plan engine as
// bitcoin instead of a silent null that the app renders as NO TRADE.
// Read-only, no key required.
// ============================================================

import type {
  IndicatorSnapshot,
  TechnicalIndicatorBundle,
  TechnicalIndicatorName,
} from '../../src/lib/bobby-technical.js';

const OKX_INDICATORS_URL = 'https://www.okx.com/api/v5/aigc/mcp/indicators';

const TECHNICAL_REQUESTS: Array<{ name: TechnicalIndicatorName; params?: number[]; btcOnly?: boolean }> = [
  { name: 'RSI', params: [14] },
  { name: 'MACD', params: [12, 26, 9] },
  { name: 'BB', params: [20, 2] },
  { name: 'MA', params: [50, 200] },
  { name: 'EMA', params: [12, 26] },
  { name: 'KDJ', params: [9, 3, 3] },
  { name: 'ATR', params: [14] },
  { name: 'SUPERTREND', params: [10, 3] },
  { name: 'AHR999', btcOnly: true },
  { name: 'BTCRAINBOW', btcOnly: true },
];

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const current = cursor++;
      results[current] = await mapper(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function extractIndicatorSnapshot(payload: unknown, bar: string, indicator: TechnicalIndicatorName): IndicatorSnapshot | null {
  const root = payload as { data?: Array<{ data?: Array<{ timeframes?: Record<string, { indicators?: Record<string, unknown> }> }> }> };
  const records = root?.data?.[0]?.data?.[0]?.timeframes?.[bar]?.indicators?.[indicator];
  if (!Array.isArray(records) || !records.length) return null;
  const latest = records[0] as { ts?: string | number; values?: Record<string, unknown> };
  const rawValues = latest?.values && typeof latest.values === 'object' ? latest.values : {};
  return {
    ts: latest?.ts ? Number(latest.ts) : null,
    values: Object.fromEntries(Object.entries(rawValues).map(([key, value]) => [key, String(value)])),
  };
}

async function fetchIndicatorSnapshot(
  instId: string,
  bar: string,
  request: { name: TechnicalIndicatorName; params?: number[] },
  timeoutMs: number,
): Promise<[TechnicalIndicatorName, IndicatorSnapshot | null]> {
  try {
    const body = {
      instId,
      timeframes: [bar],
      indicators: { [request.name]: request.params ? { paramList: request.params } : {} },
    };
    const res = await fetch(OKX_INDICATORS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Bobby-Agent-Trader/1.0' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return [request.name, null];
    return [request.name, extractIndicatorSnapshot(await res.json(), bar, request.name)];
  } catch {
    return [request.name, null];
  }
}

/**
 * Indicator bundle for one OKX instrument, or null when OKX has nothing for it
 * (unlisted symbol, dead market). The BTC-only cycle indicators are skipped
 * for every other instrument — they would only add latency.
 */
export async function fetchOkxIndicatorBundle(
  instId: string,
  bar = '1H',
  options: { concurrency?: number; timeoutMs?: number } = {},
): Promise<TechnicalIndicatorBundle | null> {
  const isBtc = instId.toUpperCase().startsWith('BTC-');
  const requests = TECHNICAL_REQUESTS.filter((r) => !r.btcOnly || isBtc);
  const pairs = await mapWithConcurrency(
    requests,
    options.concurrency ?? 4,
    (request) => fetchIndicatorSnapshot(instId, bar, request, options.timeoutMs ?? 8_000),
  );
  const indicators = Object.fromEntries(pairs) as Partial<Record<TechnicalIndicatorName, IndicatorSnapshot | null>>;
  const available = Object.values(indicators).some(Boolean);
  return available ? { symbol: instId, timeframe: bar, indicators } : null;
}
