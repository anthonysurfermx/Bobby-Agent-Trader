import {
  buildTechnicalMarketSummary,
  type IndicatorSnapshot,
  type TechnicalAssetSignal,
  type TechnicalIndicatorBundle,
  type TechnicalIndicatorName,
  type TechnicalRegime,
} from './bobby-technical.js';
import type { OkxAssetInstrument } from './okx-asset-search.js';

const OKX_BASE = 'https://www.okx.com';

export const INDICATOR_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const OKX_TECHNICAL_REQUESTS: Array<{ name: TechnicalIndicatorName; params?: number[] }> = [
  { name: 'RSI', params: [14] },
  { name: 'MACD', params: [12, 26, 9] },
  { name: 'BB', params: [20, 2] },
  { name: 'MA', params: [50, 200] },
  { name: 'EMA', params: [12, 26] },
  { name: 'KDJ', params: [9, 3, 3] },
  { name: 'ATR', params: [14] },
  { name: 'SUPERTREND', params: [10, 3] },
  { name: 'AHR999' },
  { name: 'BTCRAINBOW' },
];

type FetchLike = typeof fetch;

export interface IndicatorCacheRecordInput {
  instId: string;
  timeframe?: string;
  indicators: Record<string, Record<string, string | number | null>>;
  currentPrice?: number | null;
  instrument?: OkxAssetInstrument | null;
  regime?: TechnicalRegime;
  source?: string | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function valueFrom(values: Record<string, string> | undefined, keys: string[]): number | null {
  if (!values) return null;
  for (const key of keys) {
    const direct = toNumber(values[key]);
    if (direct !== null) return direct;
  }
  const normalizedEntries = Object.entries(values).map(([key, raw]) => ({
    normalized: key.toLowerCase().replace(/[^a-z0-9]/g, ''),
    value: toNumber(raw),
  }));
  for (const key of keys) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const found = normalizedEntries.find((entry) => entry.normalized === normalizedKey);
    if (found?.value !== null && found?.value !== undefined) return found.value;
  }
  return null;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const current = cursor++;
      results[current] = await mapper(items[current]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function extractIndicatorSnapshot(payload: any, timeframe: string, indicator: TechnicalIndicatorName): IndicatorSnapshot | null {
  const records = payload?.data?.[0]?.data?.[0]?.timeframes?.[timeframe]?.indicators?.[indicator];
  if (!Array.isArray(records) || !records.length) return null;
  const latest = records[0];
  const rawValues = latest?.values && typeof latest.values === 'object' ? latest.values : {};
  return {
    ts: latest?.ts ? Number(latest.ts) : null,
    values: Object.fromEntries(
      Object.entries(rawValues).map(([key, value]) => [key, String(value)]),
    ),
  };
}

async function fetchIndicatorSnapshot(
  instId: string,
  timeframe: string,
  request: { name: TechnicalIndicatorName; params?: number[] },
  fetcher: FetchLike,
): Promise<[TechnicalIndicatorName, IndicatorSnapshot | null]> {
  try {
    const body = {
      instId,
      timeframes: [timeframe],
      indicators: {
        [request.name]: request.params ? { paramList: request.params } : {},
      },
    };
    const res = await fetcher(`${OKX_BASE}/api/v5/aigc/mcp/indicators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return [request.name, null];
    const data = await res.json();
    return [request.name, extractIndicatorSnapshot(data, timeframe, request.name)];
  } catch {
    return [request.name, null];
  }
}

export function extractSymbolFromInstId(instId: string): string {
  return instId.trim().toUpperCase().split('-')[0] || instId.trim().toUpperCase();
}

export async function fetchOkxIndicatorBundle(
  instId: string,
  timeframe = '1H',
  fetcher: FetchLike = fetch,
): Promise<TechnicalIndicatorBundle | null> {
  const pairs = await mapWithConcurrency(
    OKX_TECHNICAL_REQUESTS,
    2,
    (request) => fetchIndicatorSnapshot(instId, timeframe, request, fetcher),
  );
  const indicators = Object.fromEntries(pairs) as Partial<Record<TechnicalIndicatorName, IndicatorSnapshot | null>>;
  const available = Object.values(indicators).some(Boolean);
  return available ? { symbol: instId, timeframe, indicators } : null;
}

export async function fetchOkxLastPrice(instId: string, fetcher: FetchLike = fetch): Promise<number | null> {
  try {
    const res = await fetcher(`${OKX_BASE}/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`);
    if (!res.ok) return null;
    const payload = await res.json() as { code: string; data?: Array<{ last?: string }> };
    if (payload.code !== '0') return null;
    return toNumber(payload.data?.[0]?.last);
  } catch {
    return null;
  }
}

export function flattenIndicatorBundle(
  bundle: TechnicalIndicatorBundle | null,
): Record<string, Record<string, string | number | null>> {
  if (!bundle) return {};
  const entries = Object.entries(bundle.indicators) as Array<[string, IndicatorSnapshot | null | undefined]>;
  return Object.fromEntries(
    entries.flatMap(([indicator, snapshot]) => {
      if (!snapshot?.values) return [];
      return [[indicator, snapshot.values]];
    }),
  );
}

export function bundleFromFlatIndicators(
  instId: string,
  timeframe: string,
  indicators: Record<string, Record<string, string | number | null>>,
): TechnicalIndicatorBundle {
  const snapshots = Object.fromEntries(
    Object.entries(indicators).map(([indicator, values]) => [
      indicator,
      {
        ts: Date.now(),
        values: Object.fromEntries(
          Object.entries(values || {}).map(([key, value]) => [key, value == null ? '' : String(value)]),
        ),
      } satisfies IndicatorSnapshot,
    ]),
  ) as Partial<Record<TechnicalIndicatorName, IndicatorSnapshot | null>>;

  return {
    symbol: instId,
    timeframe,
    indicators: snapshots,
  };
}

export function inferTechnicalRegime(
  bundle: TechnicalIndicatorBundle,
  currentPrice: number | null,
): TechnicalRegime {
  if (!currentPrice || !Number.isFinite(currentPrice)) return 'normal';

  const atr = valueFrom(bundle.indicators.ATR?.values, ['14', 'atr']);
  const upper = valueFrom(bundle.indicators.BB?.values, ['upper']);
  const lower = valueFrom(bundle.indicators.BB?.values, ['lower']);

  const atrPct = atr !== null ? atr / currentPrice : null;
  const bbWidthPct = upper !== null && lower !== null ? Math.abs(upper - lower) / currentPrice : null;
  const volScore = Math.max(
    atrPct !== null ? clamp((atrPct - 0.01) / 0.015, -1, 1) : 0,
    bbWidthPct !== null ? clamp((bbWidthPct - 0.03) / 0.05, -1, 1) : 0,
  );

  if (volScore >= 0.45) return 'high_vol';
  if (volScore <= -0.3) return 'low_vol';
  return 'normal';
}

export function buildIndicatorCacheRecord(input: IndicatorCacheRecordInput) {
  const instId = input.instId.trim().toUpperCase();
  const timeframe = input.timeframe || '1H';
  const bundle = bundleFromFlatIndicators(instId, timeframe, input.indicators);
  const currentPrice = input.currentPrice ?? null;
  const regime = input.regime || inferTechnicalRegime(bundle, currentPrice);
  const symbol = extractSymbolFromInstId(instId);
  const summary = buildTechnicalMarketSummary(
    [bundle],
    currentPrice !== null ? { [symbol]: currentPrice } : {},
    regime,
  );
  const asset = summary.leader as TechnicalAssetSignal | null;
  const now = new Date().toISOString();

  return {
    inst_id: instId,
    timeframe,
    inst_type: input.instrument?.instType || null,
    asset_class: input.instrument?.assetClass || null,
    base_symbol: input.instrument?.symbol || symbol,
    quote_symbol: input.instrument?.quoteSymbol || null,
    display_symbol: input.instrument?.displaySymbol || symbol,
    current_price: currentPrice,
    regime,
    composite_score: asset?.compositeScore ?? null,
    conviction: asset?.conviction ?? null,
    agreement: asset?.agreement ?? null,
    signal: asset?.signal ?? null,
    direction: asset?.direction ?? null,
    indicators: input.indicators,
    technical: asset,
    trade_plan: asset?.tradePlan ?? null,
    instrument_meta: input.instrument || null,
    source: input.source || 'OKX Agent Trade Kit (browser universal search)',
    fetched_at: now,
    created_at: now,
    updated_at: now,
  };
}
