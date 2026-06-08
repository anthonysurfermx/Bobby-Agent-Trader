// ============================================================
// api/_lib/indicators.ts — Standard technical indicators
// ------------------------------------------------------------
// RSI(14), SMA(20/50), recent support/resistance from OKX
// candles. Fed to the verdict so the audio cites REAL values,
// and surfaced so the chart can reflect them.
// ============================================================

export interface Indicators {
  rsi14: number | null;
  sma20: number | null;
  sma50: number | null;
  support: number | null;
  resistance: number | null;
  priceVsSma20: number | null; // % above/below
  priceVsSma50: number | null;
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  // Seed with the first `period` deltas.
  for (let i = closes.length - period; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return +(100 - 100 / (1 + rs)).toFixed(1);
}

/** Compute indicators from OKX candles (oldest-first [ts,o,h,l,c]). */
export function computeIndicators(candles: number[][]): Indicators {
  if (candles.length === 0) {
    return {
      rsi14: null, sma20: null, sma50: null, support: null,
      resistance: null, priceVsSma20: null, priceVsSma50: null,
    };
  }
  const closes = candles.map((c) => c[4]);
  const highs = candles.map((c) => c[2]);
  const lows = candles.map((c) => c[3]);
  const price = closes[closes.length - 1];

  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const window = candles.slice(-30);
  const resistance = window.length ? Math.max(...window.map((c) => c[2])) : Math.max(...highs);
  const support = window.length ? Math.min(...window.map((c) => c[3])) : Math.min(...lows);

  const pct = (a: number, b: number) => +(((a - b) / b) * 100).toFixed(2);

  return {
    rsi14: rsi(closes, 14),
    sma20: s20 != null ? +s20.toFixed(s20 > 100 ? 1 : 4) : null,
    sma50: s50 != null ? +s50.toFixed(s50 > 100 ? 1 : 4) : null,
    support: +support.toFixed(support > 100 ? 1 : 4),
    resistance: +resistance.toFixed(resistance > 100 ? 1 : 4),
    priceVsSma20: s20 ? pct(price, s20) : null,
    priceVsSma50: s50 ? pct(price, s50) : null,
  };
}
