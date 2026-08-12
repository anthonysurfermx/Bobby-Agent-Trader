// ============================================================
// market-indicators — the analysis the desk shows and the CIO says.
//
// One implementation, read by both the chart and /api/voice-tool, so the
// support the CIO names out loud is the exact same number drawn on screen.
// Everything here is derived from real candles — nothing is assumed.
// ============================================================

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SeriesPoint {
  time: number;
  value: number;
}

export interface MarketAnalysis {
  price: number | null;
  rsi14: number | null;
  ema20: number | null;
  ema50: number | null;
  /** Nearest swing low / high over the recent window — the structure levels. */
  support: number | null;
  resistance: number | null;
  /** Average true range as a % of price: how wide a zone has to be to matter. */
  atrPct: number | null;
  /** EMA20 vs EMA50 — the fast read a trader gives first. */
  trend: 'alcista' | 'bajista' | 'lateral';
  momentum: 'sobrecompra' | 'sobreventa' | 'neutral';
  ema20Series: SeriesPoint[];
  ema50Series: SeriesPoint[];
}

const EMPTY: MarketAnalysis = {
  price: null, rsi14: null, ema20: null, ema50: null, support: null,
  resistance: null, atrPct: null, trend: 'lateral', momentum: 'neutral',
  ema20Series: [], ema50Series: [],
};

/** Exponential moving average, one value per bar once the period is seeded. */
function emaSeries(candles: Candle[], period: number): SeriesPoint[] {
  if (candles.length < period) return [];
  const k = 2 / (period + 1);
  const out: SeriesPoint[] = [];
  // Seed with the SMA of the first `period` closes so the curve starts honest.
  let prev = candles.slice(0, period).reduce((sum, c) => sum + c.close, 0) / period;
  out.push({ time: candles[period - 1].time, value: prev });
  for (let i = period; i < candles.length; i++) {
    prev = candles[i].close * k + prev * (1 - k);
    out.push({ time: candles[i].time, value: prev });
  }
  return out;
}

function rsi14(candles: Candle[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const delta = candles[i].close - candles[i - 1].close;
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return +(100 - 100 / (1 + avgGain / avgLoss)).toFixed(1);
}

/** True range averaged over `period` bars, expressed as a % of the last close. */
function atrPct(candles: Candle[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  let total = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const prevClose = candles[i - 1].close;
    total += Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - prevClose),
      Math.abs(candles[i].low - prevClose),
    );
  }
  const price = candles[candles.length - 1].close;
  if (!price) return null;
  return +(((total / period) / price) * 100).toFixed(2);
}

function round(value: number): number {
  return +value.toFixed(value >= 100 ? 1 : value >= 1 ? 3 : 6);
}

export function analyzeCandles(candles: Candle[]): MarketAnalysis {
  if (!candles.length) return EMPTY;

  const window = candles.slice(-30);
  const price = candles[candles.length - 1].close;
  const ema20 = emaSeries(candles, 20);
  const ema50 = emaSeries(candles, 50);
  const last20 = ema20.at(-1)?.value ?? null;
  const last50 = ema50.at(-1)?.value ?? null;
  const rsi = rsi14(candles);

  // Lateral when the two EMAs are within a quarter of an ATR of each other —
  // a cross that tight is noise, not a trend.
  const atr = atrPct(candles);
  const spreadPct = last20 !== null && last50 !== null && price
    ? ((last20 - last50) / price) * 100
    : null;
  const flatBand = (atr ?? 0.4) * 0.25;
  const trend: MarketAnalysis['trend'] =
    spreadPct === null || Math.abs(spreadPct) < flatBand
      ? 'lateral'
      : spreadPct > 0 ? 'alcista' : 'bajista';

  return {
    price: round(price),
    rsi14: rsi,
    ema20: last20 === null ? null : round(last20),
    ema50: last50 === null ? null : round(last50),
    support: round(Math.min(...window.map((c) => c.low))),
    resistance: round(Math.max(...window.map((c) => c.high))),
    atrPct: atr,
    trend,
    momentum: rsi === null ? 'neutral' : rsi >= 70 ? 'sobrecompra' : rsi <= 30 ? 'sobreventa' : 'neutral',
    ema20Series: ema20,
    ema50Series: ema50,
  };
}

/** The analysis without the per-bar series — what a tool result should carry. */
export function analysisSummary(analysis: MarketAnalysis) {
  const { ema20Series: _s1, ema50Series: _s2, ...summary } = analysis;
  return summary;
}
