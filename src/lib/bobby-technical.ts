export type TechnicalRegime = 'high_vol' | 'normal' | 'low_vol';

export type TechnicalIndicatorName =
  | 'RSI'
  | 'MACD'
  | 'BB'
  | 'MA'
  | 'EMA'
  | 'KDJ'
  | 'ATR'
  | 'SUPERTREND'
  | 'AHR999'
  | 'BTCRAINBOW';

export interface IndicatorSnapshot {
  ts: number | null;
  values: Record<string, string>;
}

export interface TechnicalIndicatorBundle {
  symbol: string;
  timeframe: string;
  indicators: Partial<Record<TechnicalIndicatorName, IndicatorSnapshot | null>>;
}

export interface TechnicalIndicatorReading {
  available: boolean;
  bias: 'bullish' | 'bearish' | 'neutral';
  score: number;
  confidence: number;
  weight: number;
  contribution: number;
  summary: string;
  values: Record<string, number | string | null>;
}

export interface TechnicalTradePlan {
  direction: 'long' | 'short' | 'none';
  entry: number | null;
  stop: number | null;
  target: number | null;
  rewardRisk: number | null;
  invalidation: string;
  basis: string[];
}

export interface TechnicalAssetSignal {
  symbol: string;
  timeframe: string;
  currentPrice: number | null;
  signal: 'strong_long' | 'long' | 'neutral' | 'short' | 'strong_short';
  direction: 'long' | 'short' | 'none';
  compositeScore: number;
  conviction: number;
  agreement: number;
  overview: string;
  weights: Partial<Record<TechnicalIndicatorName, number>>;
  breakdown: Record<TechnicalIndicatorName, TechnicalIndicatorReading>;
  tradePlan: TechnicalTradePlan;
}

export interface ConvictionSourceWeights {
  okx: number;
  polymarket: number;
  technical: number;
}

export interface TechnicalMarketSummary {
  regime: TechnicalRegime;
  sourceWeights: ConvictionSourceWeights;
  leader: TechnicalAssetSignal | null;
  assets: TechnicalAssetSignal[];
}

export const TECHNICAL_INDICATOR_ORDER: TechnicalIndicatorName[] = [
  'RSI',
  'MACD',
  'BB',
  'MA',
  'EMA',
  'KDJ',
  'ATR',
  'SUPERTREND',
  'AHR999',
  'BTCRAINBOW',
];

export const TECHNICAL_INDICATOR_LABELS: Record<TechnicalIndicatorName, string> = {
  RSI: 'RSI',
  MACD: 'MACD',
  BB: 'Bollinger',
  MA: 'MA 50/200',
  EMA: 'EMA 12/26',
  KDJ: 'KDJ',
  ATR: 'ATR',
  SUPERTREND: 'SuperTrend',
  AHR999: 'AHR999',
  BTCRAINBOW: 'BTC Rainbow',
};

const REGIME_WEIGHTS: Record<TechnicalRegime, Record<TechnicalIndicatorName, number>> = {
  high_vol: {
    RSI: 0.08,
    MACD: 0.12,
    BB: 0.15,
    MA: 0.10,
    EMA: 0.11,
    KDJ: 0.06,
    ATR: 0.16,
    SUPERTREND: 0.14,
    AHR999: 0.04,
    BTCRAINBOW: 0.04,
  },
  normal: {
    RSI: 0.11,
    MACD: 0.14,
    BB: 0.11,
    MA: 0.13,
    EMA: 0.13,
    KDJ: 0.08,
    ATR: 0.10,
    SUPERTREND: 0.10,
    AHR999: 0.05,
    BTCRAINBOW: 0.05,
  },
  low_vol: {
    RSI: 0.17,
    MACD: 0.15,
    BB: 0.10,
    MA: 0.12,
    EMA: 0.13,
    KDJ: 0.11,
    ATR: 0.08,
    SUPERTREND: 0.08,
    AHR999: 0.03,
    BTCRAINBOW: 0.03,
  },
};

const CONVICTION_WEIGHTS: Record<TechnicalRegime, ConvictionSourceWeights> = {
  high_vol: { okx: 0.40, polymarket: 0.20, technical: 0.40 },
  normal: { okx: 0.35, polymarket: 0.25, technical: 0.40 },
  low_vol: { okx: 0.25, polymarket: 0.30, technical: 0.45 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeBundleSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) return normalized;
  return normalized.split('-')[0] || normalized;
}

function sign(value: number): number {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
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
    key,
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

function textFrom(values: Record<string, string> | undefined, keys: string[]): string | null {
  if (!values) return null;
  for (const key of keys) {
    const direct = values[key];
    if (typeof direct === 'string' && direct.trim()) return direct;
  }
  const normalizedEntries = Object.entries(values).map(([key, raw]) => ({
    key,
    normalized: key.toLowerCase().replace(/[^a-z0-9]/g, ''),
    value: typeof raw === 'string' ? raw : String(raw),
  }));
  for (const key of keys) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const found = normalizedEntries.find((entry) => entry.normalized === normalizedKey);
    if (found?.value?.trim()) return found.value;
  }
  return null;
}

function deriveBias(score: number): 'bullish' | 'bearish' | 'neutral' {
  if (score >= 0.1) return 'bullish';
  if (score <= -0.1) return 'bearish';
  return 'neutral';
}

function formatPrice(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (Math.abs(value) >= 1000) return round(value, 1);
  if (Math.abs(value) >= 10) return round(value, 2);
  return round(value, 4);
}

function createReading(
  weight: number,
  score: number,
  confidence: number,
  summary: string,
  values: Record<string, number | string | null>,
  available = true,
): TechnicalIndicatorReading {
  const safeScore = clamp(score, -1, 1);
  const safeConfidence = clamp(confidence, 0, 1);
  return {
    available,
    bias: available ? deriveBias(safeScore) : 'neutral',
    score: round(available ? safeScore : 0, 3),
    confidence: round(available ? safeConfidence : 0, 3),
    weight: round(weight, 3),
    contribution: round(weight * (available ? safeScore : 0) * (available ? safeConfidence : 0), 3),
    summary,
    values,
  };
}

function emptyReading(weight = 0, summary = 'No data'): TechnicalIndicatorReading {
  return createReading(weight, 0, 0, summary, {}, false);
}

function average(values: Array<number | null>): number | null {
  const filtered = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!filtered.length) return null;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function buildSignalLabel(score: number): TechnicalAssetSignal['signal'] {
  if (score >= 0.6) return 'strong_long';
  if (score >= 0.2) return 'long';
  if (score <= -0.6) return 'strong_short';
  if (score <= -0.2) return 'short';
  return 'neutral';
}

function buildDirection(score: number): TechnicalAssetSignal['direction'] {
  if (score >= 0.2) return 'long';
  if (score <= -0.2) return 'short';
  return 'none';
}

function scoreRsi(snapshot: IndicatorSnapshot | null, weight: number): TechnicalIndicatorReading {
  const rsi = valueFrom(snapshot?.values, ['14', 'rsi']);
  if (rsi === null) return emptyReading(weight);
  const score = clamp((rsi - 50) / 25, -1, 1);
  const confidence = Math.abs(rsi - 50) / 50;
  const summary = rsi >= 70
    ? `RSI ${round(rsi, 2)} is stretched but still bullish momentum.`
    : rsi <= 30
      ? `RSI ${round(rsi, 2)} is washed out and bearish momentum is extreme.`
      : `RSI ${round(rsi, 2)} is centered around the momentum pivot.`;
  return createReading(weight, score, confidence, summary, { rsi: round(rsi, 2) });
}

function scoreMacd(snapshot: IndicatorSnapshot | null, weight: number, currentPrice: number | null): TechnicalIndicatorReading {
  const dif = valueFrom(snapshot?.values, ['dif']);
  const dea = valueFrom(snapshot?.values, ['dea', 'signal']);
  const hist = valueFrom(snapshot?.values, ['macd', 'hist', 'histogram']);
  if (dif === null || dea === null || hist === null) return emptyReading(weight);
  const scale = Math.max(Math.abs(dif) + Math.abs(dea), currentPrice ? currentPrice * 0.002 : 1, 1);
  const score = clamp((hist / scale) * 2, -1, 1);
  const confidence = clamp(Math.abs(hist) / scale, 0.15, 1);
  const summary = hist >= 0
    ? `MACD is above signal by ${round(Math.abs(dif - dea), 2)} with bullish histogram ${round(hist, 2)}.`
    : `MACD is below signal by ${round(Math.abs(dif - dea), 2)} with bearish histogram ${round(hist, 2)}.`;
  return createReading(weight, score, confidence, summary, {
    dif: round(dif, 2),
    dea: round(dea, 2),
    histogram: round(hist, 2),
  });
}

function scoreBollinger(snapshot: IndicatorSnapshot | null, weight: number, currentPrice: number | null): TechnicalIndicatorReading {
  const upper = valueFrom(snapshot?.values, ['upper']);
  const middle = valueFrom(snapshot?.values, ['middle', 'basis']);
  const lower = valueFrom(snapshot?.values, ['lower']);
  if (upper === null || middle === null || lower === null || currentPrice === null || upper === lower) {
    return emptyReading(weight);
  }
  const position = clamp((currentPrice - lower) / (upper - lower), 0, 1);
  const score = clamp((position - 0.5) * 2, -1, 1);
  const widthPct = ((upper - lower) / currentPrice) * 100;
  const summary = `Price is ${round(position * 100, 1)}% through the Bollinger channel with ${round(widthPct, 2)}% band width.`;
  return createReading(weight, score, Math.abs(score), summary, {
    upper: formatPrice(upper),
    middle: formatPrice(middle),
    lower: formatPrice(lower),
    position_pct: round(position * 100, 1),
  });
}

function scoreMovingAverages(snapshot: IndicatorSnapshot | null, weight: number, currentPrice: number | null): TechnicalIndicatorReading {
  const ma50 = valueFrom(snapshot?.values, ['50', 'ma50']);
  const ma200 = valueFrom(snapshot?.values, ['200', 'ma200']);
  if (ma50 === null || ma200 === null) return emptyReading(weight);
  const crossScore = ma50 > ma200 ? 1 : -1;
  const priceScore = currentPrice === null
    ? 0
    : average([
        currentPrice > ma50 ? 1 : -1,
        currentPrice > ma200 ? 1 : -1,
      ]) || 0;
  const score = clamp((crossScore * 0.65) + (priceScore * 0.35), -1, 1);
  const confidence = clamp((Math.abs(ma50 - ma200) / Math.max(ma200, 1)) * 30, 0.2, 1);
  const summary = ma50 > ma200
    ? `MA50 is above MA200, keeping the higher-timeframe trend constructive.`
    : `MA50 is below MA200, keeping the higher-timeframe trend defensive.`;
  return createReading(weight, score, confidence, summary, {
    ma50: formatPrice(ma50),
    ma200: formatPrice(ma200),
    cross: ma50 > ma200 ? 'golden_cross' : 'death_cross',
  });
}

function scoreEma(snapshot: IndicatorSnapshot | null, weight: number, currentPrice: number | null): TechnicalIndicatorReading {
  const ema12 = valueFrom(snapshot?.values, ['12', 'ema12']);
  const ema26 = valueFrom(snapshot?.values, ['26', 'ema26']);
  if (ema12 === null || ema26 === null) return emptyReading(weight);
  const cross = ema12 > ema26 ? 1 : -1;
  const priceConfirm = currentPrice === null ? 0 : currentPrice > average([ema12, ema26])! ? 1 : -1;
  const score = clamp((cross * 0.7) + (priceConfirm * 0.3), -1, 1);
  const confidence = clamp((Math.abs(ema12 - ema26) / Math.max(ema26, 1)) * 40, 0.2, 1);
  const summary = ema12 > ema26
    ? `Fast EMA is leading slow EMA, signaling short-term upside control.`
    : `Fast EMA is below slow EMA, signaling short-term downside control.`;
  return createReading(weight, score, confidence, summary, {
    ema12: formatPrice(ema12),
    ema26: formatPrice(ema26),
    crossover: ema12 > ema26 ? 'bullish' : 'bearish',
  });
}

function scoreKdj(snapshot: IndicatorSnapshot | null, weight: number): TechnicalIndicatorReading {
  const k = valueFrom(snapshot?.values, ['k']);
  const d = valueFrom(snapshot?.values, ['d']);
  const j = valueFrom(snapshot?.values, ['j']);
  if (k === null || d === null || j === null) return emptyReading(weight);
  const crossComponent = clamp((k - d) / 20, -1, 1);
  const momentumComponent = clamp((j - 50) / 40, -1, 1);
  const score = clamp((crossComponent * 0.6) + (momentumComponent * 0.4), -1, 1);
  const confidence = clamp((Math.abs(k - d) / 30) + (Math.abs(j - 50) / 100), 0.15, 1);
  const summary = `KDJ reads K ${round(k, 2)} / D ${round(d, 2)} / J ${round(j, 2)}.`;
  return createReading(weight, score, confidence, summary, {
    k: round(k, 2),
    d: round(d, 2),
    j: round(j, 2),
  });
}

function scoreSuperTrend(
  snapshot: IndicatorSnapshot | null,
  weight: number,
  currentPrice: number | null,
): TechnicalIndicatorReading {
  if (!snapshot?.values || !Object.keys(snapshot.values).length) {
    return emptyReading(weight, 'SuperTrend unavailable from OKX payload.');
  }
  const rawDirection = textFrom(snapshot.values, ['direction', 'trend', 'signal', 'state']);
  const numericDirection = valueFrom(snapshot.values, ['direction', 'trend', 'signal']);
  const level = valueFrom(snapshot.values, ['supertrend', 'value', 'level', 'trigger', 'line']);
  let directionScore = 0;
  if (rawDirection) {
    const normalized = rawDirection.toLowerCase();
    if (normalized.includes('bull') || normalized.includes('long') || normalized.includes('up')) directionScore = 1;
    if (normalized.includes('bear') || normalized.includes('short') || normalized.includes('down')) directionScore = -1;
  } else if (numericDirection !== null) {
    directionScore = sign(numericDirection);
  } else if (currentPrice !== null && level !== null) {
    directionScore = currentPrice >= level ? 1 : -1;
  }
  if (!directionScore) return emptyReading(weight, 'SuperTrend returned data without direction.');
  const distance = currentPrice !== null && level !== null
    ? Math.abs(currentPrice - level) / Math.max(currentPrice, 1)
    : 0.01;
  const confidence = clamp(distance * 80, 0.2, 1);
  const summary = level !== null
    ? `SuperTrend is ${directionScore > 0 ? 'bullish' : 'bearish'} with trigger ${formatPrice(level)}.`
    : `SuperTrend bias is ${directionScore > 0 ? 'bullish' : 'bearish'}.`;
  return createReading(weight, directionScore, confidence, summary, {
    direction: directionScore > 0 ? 'bullish' : 'bearish',
    level: formatPrice(level),
  });
}

function scoreAhr999(snapshot: IndicatorSnapshot | null, weight: number): TechnicalIndicatorReading {
  const value = valueFrom(snapshot?.values, ['ahr999']);
  if (value === null) return emptyReading(weight);
  const zone = valueFrom(snapshot?.values, ['zone']);
  const score = clamp((0.9 - value) / 0.9, -1, 1);
  const confidence = clamp(Math.abs(0.9 - value) / 1.2, 0.15, 1);
  const summary = zone !== null
    ? `AHR999 is ${round(value, 4)} in zone ${zone}, framing long-term BTC valuation.`
    : `AHR999 is ${round(value, 4)}, framing long-term BTC valuation.`;
  return createReading(weight, score, confidence, summary, {
    ahr999: round(value, 4),
    zone: zone !== null ? round(zone, 0) : null,
    dca_cost_200: formatPrice(valueFrom(snapshot?.values, ['dca_cost_200'])),
    fitted_price: formatPrice(valueFrom(snapshot?.values, ['fitted_price'])),
  });
}

function scoreRainbow(snapshot: IndicatorSnapshot | null, weight: number): TechnicalIndicatorReading {
  const deviation = valueFrom(snapshot?.values, ['deviation']);
  if (deviation === null) return emptyReading(weight);
  const band = valueFrom(snapshot?.values, ['band']);
  const score = clamp((-deviation) / 2.5, -1, 1);
  const confidence = clamp(Math.abs(deviation) / 2.5, 0.15, 1);
  const summary = band !== null
    ? `BTC Rainbow deviation ${round(deviation, 4)} in band ${band}.`
    : `BTC Rainbow deviation ${round(deviation, 4)}.`;
  return createReading(weight, score, confidence, summary, {
    deviation: round(deviation, 4),
    band: band !== null ? round(band, 0) : null,
    fair_value: formatPrice(valueFrom(snapshot?.values, ['fair_value'])),
  });
}

function scoreAtr(
  snapshot: IndicatorSnapshot | null,
  weight: number,
  currentPrice: number | null,
  trendBias: number,
): TechnicalIndicatorReading {
  const atr = valueFrom(snapshot?.values, ['14', 'atr']);
  if (atr === null || currentPrice === null || !trendBias) return emptyReading(weight);
  const atrPct = atr / currentPrice;
  const normalized = clamp((atrPct - 0.004) / 0.006, -1, 1);
  const score = clamp(normalized * sign(trendBias), -1, 1);
  const confidence = clamp(Math.abs(normalized), 0.2, 1);
  const summary = `ATR is ${round(atrPct * 100, 2)}% of price, amplifying ${trendBias > 0 ? 'bullish' : 'bearish'} follow-through.`;
  return createReading(weight, score, confidence, summary, {
    atr: formatPrice(atr),
    atr_pct: round(atrPct * 100, 2),
  });
}

function buildTradePlan(
  asset: {
    direction: 'long' | 'short' | 'none';
    currentPrice: number | null;
    conviction: number;
    breakdown: Record<TechnicalIndicatorName, TechnicalIndicatorReading>;
  },
  bundle: TechnicalIndicatorBundle,
  regime: TechnicalRegime,
): TechnicalTradePlan {
  const bb = bundle.indicators.BB?.values;
  const upper = valueFrom(bb, ['upper']);
  const middle = valueFrom(bb, ['middle']);
  const lower = valueFrom(bb, ['lower']);
  const atr = valueFrom(bundle.indicators.ATR?.values, ['14', 'atr']);
  const superTrendLevel = valueFrom(bundle.indicators.SUPERTREND?.values, ['supertrend', 'value', 'level', 'trigger', 'line']);
  const currentPrice = asset.currentPrice;
  const direction = asset.direction;

  if (!currentPrice || !atr || direction === 'none' || asset.conviction < 0.25) {
    return {
      direction: 'none',
      entry: null,
      stop: null,
      target: null,
      rewardRisk: null,
      invalidation: 'No edge: composite score is inside the neutral band.',
      basis: ['Wait for the technical composite to clear +/-0.20.'],
    };
  }

  const stopMult = regime === 'high_vol' ? 2.2 : regime === 'low_vol' ? 1.4 : 1.8;
  const rrMult = regime === 'high_vol' ? 2.3 : regime === 'low_vol' ? 1.6 : 2.0;
  const breakoutMode = regime === 'high_vol'
    || Math.abs(asset.breakdown.MACD.score) > 0.45
    || asset.breakdown.SUPERTREND.bias === (direction === 'long' ? 'bullish' : 'bearish');
  const pullbackReference = average([middle, superTrendLevel]) ?? currentPrice;

  const entry = direction === 'long'
    ? (breakoutMode ? currentPrice : Math.min(currentPrice, pullbackReference))
    : (breakoutMode ? currentPrice : Math.max(currentPrice, pullbackReference));

  let stop: number;
  if (direction === 'long') {
    stop = Math.min(
      entry - (stopMult * atr),
      lower !== null ? lower - (atr * 0.25) : Number.POSITIVE_INFINITY,
      superTrendLevel !== null ? superTrendLevel - (atr * 0.5) : Number.POSITIVE_INFINITY,
    );
    if (!Number.isFinite(stop) || stop >= entry) stop = entry - (stopMult * atr);
  } else {
    stop = Math.max(
      entry + (stopMult * atr),
      upper !== null ? upper + (atr * 0.25) : Number.NEGATIVE_INFINITY,
      superTrendLevel !== null ? superTrendLevel + (atr * 0.5) : Number.NEGATIVE_INFINITY,
    );
    if (!Number.isFinite(stop) || stop <= entry) stop = entry + (stopMult * atr);
  }

  const risk = Math.abs(entry - stop);
  let target: number;
  if (direction === 'long') {
    target = Math.max(
      entry + (rrMult * risk),
      upper !== null ? upper + (atr * 0.35) : Number.NEGATIVE_INFINITY,
    );
  } else {
    target = Math.min(
      entry - (rrMult * risk),
      lower !== null ? lower - (atr * 0.35) : Number.POSITIVE_INFINITY,
    );
  }
  if (!Number.isFinite(target)) target = direction === 'long' ? entry + (rrMult * risk) : entry - (rrMult * risk);

  const rewardRisk = risk > 0 ? Math.abs(target - entry) / risk : null;
  const invalidation = direction === 'long'
    ? `Lose ${formatPrice(stop)} or a bearish SuperTrend flip.`
    : `Lose ${formatPrice(stop)} or a bullish SuperTrend flip.`;

  return {
    direction,
    entry: formatPrice(entry),
    stop: formatPrice(stop),
    target: formatPrice(target),
    rewardRisk: rewardRisk !== null ? round(rewardRisk, 2) : null,
    invalidation,
    basis: [
      breakoutMode ? 'Breakout mode: entry defaults to current price.' : 'Pullback mode: entry anchored to BB middle / SuperTrend.',
      `Stop uses ${stopMult}x ATR with structure overlay.`,
      `Target uses ${rrMult}R or Bollinger expansion, whichever is wider.`,
    ],
  };
}

function normalizeWeights(
  regime: TechnicalRegime,
  breakdown: Record<TechnicalIndicatorName, TechnicalIndicatorReading>,
): Partial<Record<TechnicalIndicatorName, number>> {
  const base = REGIME_WEIGHTS[regime];
  const availableKeys = TECHNICAL_INDICATOR_ORDER.filter((key) => breakdown[key].available);
  const total = availableKeys.reduce((sum, key) => sum + base[key], 0);
  if (!total) return {};
  return Object.fromEntries(
    availableKeys.map((key) => [key, round(base[key] / total, 3)]),
  ) as Partial<Record<TechnicalIndicatorName, number>>;
}

export function getConvictionSourceWeights(regime: TechnicalRegime): ConvictionSourceWeights {
  return CONVICTION_WEIGHTS[regime];
}

export function buildTechnicalMarketSummary(
  bundles: TechnicalIndicatorBundle[],
  priceMap: Record<string, number>,
  regime: TechnicalRegime,
): TechnicalMarketSummary {
  const assets = bundles.map((bundle) => {
    const symbol = normalizeBundleSymbol(bundle.symbol);
    const currentPrice = priceMap[symbol] ?? null;
    const baseWeights = REGIME_WEIGHTS[regime];

    const provisional = {
      RSI: scoreRsi(bundle.indicators.RSI || null, baseWeights.RSI),
      MACD: scoreMacd(bundle.indicators.MACD || null, baseWeights.MACD, currentPrice),
      BB: scoreBollinger(bundle.indicators.BB || null, baseWeights.BB, currentPrice),
      MA: scoreMovingAverages(bundle.indicators.MA || null, baseWeights.MA, currentPrice),
      EMA: scoreEma(bundle.indicators.EMA || null, baseWeights.EMA, currentPrice),
      KDJ: scoreKdj(bundle.indicators.KDJ || null, baseWeights.KDJ),
      SUPERTREND: scoreSuperTrend(bundle.indicators.SUPERTREND || null, baseWeights.SUPERTREND, currentPrice),
      AHR999: symbol === 'BTC' ? scoreAhr999(bundle.indicators.AHR999 || null, baseWeights.AHR999) : emptyReading(baseWeights.AHR999, 'BTC-only indicator.'),
      BTCRAINBOW: symbol === 'BTC' ? scoreRainbow(bundle.indicators.BTCRAINBOW || null, baseWeights.BTCRAINBOW) : emptyReading(baseWeights.BTCRAINBOW, 'BTC-only indicator.'),
      ATR: emptyReading(baseWeights.ATR),
    } satisfies Record<TechnicalIndicatorName, TechnicalIndicatorReading>;

    const trendBias = average([
      provisional.MACD.score,
      provisional.MA.score,
      provisional.EMA.score,
      provisional.SUPERTREND.score,
    ]) || 0;

    provisional.ATR = scoreAtr(bundle.indicators.ATR || null, baseWeights.ATR, currentPrice, trendBias);

    const normalizedWeights = normalizeWeights(regime, provisional);
    for (const key of TECHNICAL_INDICATOR_ORDER) {
      const normalizedWeight = normalizedWeights[key] ?? 0;
      provisional[key] = createReading(
        normalizedWeight,
        provisional[key].score,
        provisional[key].confidence,
        provisional[key].summary,
        provisional[key].values,
        provisional[key].available,
      );
    }

    const activeReadings = TECHNICAL_INDICATOR_ORDER
      .map((key) => provisional[key])
      .filter((reading) => reading.available && reading.weight > 0);
    const denominator = activeReadings.reduce((sum, reading) => sum + (reading.weight * reading.confidence), 0);
    const rawComposite = denominator > 0
      ? activeReadings.reduce((sum, reading) => sum + reading.contribution, 0) / denominator
      : 0;
    const rawSign = sign(rawComposite) || 1;
    const agreementNumerator = activeReadings.reduce((sum, reading) => {
      const aligned = sign(reading.score) === rawSign || Math.abs(reading.score) < 0.08 ? 1 : 0;
      return sum + (reading.weight * reading.confidence * aligned);
    }, 0);
    const agreement = denominator > 0 ? agreementNumerator / denominator : 0;
    const compositeScore = clamp(rawComposite * (0.75 + (agreement * 0.25)), -1, 1);
    const conviction = clamp(Math.abs(compositeScore) * (0.65 + (agreement * 0.35)), 0, 1);
    const signal = buildSignalLabel(compositeScore);
    const direction = buildDirection(compositeScore);
    const topReadings = TECHNICAL_INDICATOR_ORDER
      .map((key) => ({ key, reading: provisional[key] }))
      .filter(({ reading }) => reading.available)
      .sort((a, b) => Math.abs(b.reading.contribution) - Math.abs(a.reading.contribution))
      .slice(0, 3)
      .map(({ key, reading }) => `${TECHNICAL_INDICATOR_LABELS[key]}: ${reading.summary}`);
    const tradePlan = buildTradePlan(
      { direction, currentPrice, conviction, breakdown: provisional },
      bundle,
      regime,
    );

    return {
      symbol,
      timeframe: bundle.timeframe,
      currentPrice: formatPrice(currentPrice),
      signal,
      direction,
      compositeScore: round(compositeScore, 3),
      conviction: round(conviction, 3),
      agreement: round(agreement, 3),
      overview: topReadings.join(' '),
      weights: normalizedWeights,
      breakdown: provisional,
      tradePlan,
    } satisfies TechnicalAssetSignal;
  }).sort((a, b) => b.conviction - a.conviction);

  return {
    regime,
    sourceWeights: getConvictionSourceWeights(regime),
    leader: assets[0] || null,
    assets,
  };
}
