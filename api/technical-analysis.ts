// ============================================================
// GET /api/technical-analysis?symbol=BTC&period=7d
// Calculates technical indicators from OKX candles
// Pure math — zero AI tokens, zero external dependencies
// Returns: SMA, RSI, Bollinger, Support/Resistance, candles
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

interface Candle {
  ts: number;
  o: number;
  h: number;
  l: number;
  c: number;
  vol: number;
}

interface TechnicalData {
  symbol: string;
  candles: Candle[];
  sma20: number[];
  sma50: number[];
  rsi14: number[];
  bollingerUpper: number[];
  bollingerLower: number[];
  bollingerMiddle: number[];
  support: number[];
  resistance: number[];
  currentRSI: number;
  currentPrice: number;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  bollingerSqueeze: boolean;
  summary: Record<string, unknown>;
}

// ---- Math helpers ----

function sma(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(NaN); continue; }
    const slice = data.slice(i - period + 1, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return result;
}

// EMA (Exponential Moving Average) — more responsive than SMA
function ema(data: number[], period: number): number[] {
  const result: number[] = [];
  const k = 2 / (period + 1);
  let prev = data[0];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(NaN); continue; }
    if (i === period - 1) {
      // First EMA = SMA of first 'period' values
      prev = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
      result.push(prev);
    } else {
      prev = data[i] * k + prev * (1 - k);
      result.push(prev);
    }
  }
  return result;
}

// MACD (Moving Average Convergence Divergence) — TradingView's #1 indicator
function macd(closes: number[]): { macdLine: number[]; signal: number[]; histogram: number[] } {
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (isNaN(ema12[i]) || isNaN(ema26[i])) { macdLine.push(NaN); continue; }
    macdLine.push(ema12[i] - ema26[i]);
  }
  // Signal line = 9-period EMA of MACD
  const validMacd = macdLine.filter(v => !isNaN(v));
  const signalRaw = ema(validMacd, 9);
  const signal: number[] = new Array(closes.length).fill(NaN);
  let si = 0;
  for (let i = 0; i < closes.length; i++) {
    if (!isNaN(macdLine[i])) {
      signal[i] = si < signalRaw.length ? signalRaw[si] : NaN;
      si++;
    }
  }
  // Histogram = MACD - Signal
  const histogram: number[] = macdLine.map((m, i) => isNaN(m) || isNaN(signal[i]) ? NaN : m - signal[i]);
  return { macdLine, signal, histogram };
}

// VWAP (Volume Weighted Average Price) — institutional favorite
function vwap(candles: Candle[]): number[] {
  let cumVol = 0;
  let cumTP = 0;
  return candles.map(c => {
    const tp = (c.h + c.l + c.c) / 3;
    cumVol += c.vol;
    cumTP += tp * c.vol;
    return cumVol > 0 ? parseFloat((cumTP / cumVol).toFixed(2)) : tp;
  });
}

function rsi(closes: number[], period: number = 14): number[] {
  const result: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return result;

  let avgGain = 0;
  let avgLoss = 0;

  // First average
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;

  result[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

  // Smoothed RSI
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }
  return result;
}

function bollingerBands(closes: number[], period: number = 20, stdDev: number = 2): { upper: number[]; middle: number[]; lower: number[] } {
  const middle = sma(closes, period);
  const upper: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { upper.push(NaN); lower.push(NaN); continue; }
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = middle[i];
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
    const std = Math.sqrt(variance);
    upper.push(mean + stdDev * std);
    lower.push(mean - stdDev * std);
  }
  return { upper, middle, lower };
}

function findSupportResistance(candles: Candle[], lookback: number = 20): { support: number[]; resistance: number[] } {
  const support: number[] = [];
  const resistance: number[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const low = candles[i].l;
    const high = candles[i].h;

    // Check if this is a local minimum (support)
    let isSupport = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j].l < low) { isSupport = false; break; }
    }
    if (isSupport) support.push(parseFloat(low.toFixed(2)));

    // Check if this is a local maximum (resistance)
    let isResistance = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j].h > high) { isResistance = false; break; }
    }
    if (isResistance) resistance.push(parseFloat(high.toFixed(2)));
  }

  // Deduplicate nearby levels (within 0.5%)
  const dedup = (levels: number[]): number[] => {
    const sorted = [...new Set(levels)].sort((a, b) => a - b);
    const result: number[] = [];
    for (const level of sorted) {
      if (result.length === 0 || Math.abs(level - result[result.length - 1]) / result[result.length - 1] > 0.005) {
        result.push(level);
      }
    }
    return result;
  };

  return { support: dedup(support).slice(-3), resistance: dedup(resistance).slice(-3) };
}

// ---- Fetch candles from OKX ----

async function fetchCandles(instId: string, bar: string = '1H', limit: number = 168): Promise<Candle[]> {
  const res = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=${limit}`);
  if (!res.ok) return [];
  const json = await res.json() as { code: string; data: string[][] };
  if (json.code !== '0' || !json.data) return [];

  return json.data.map(d => ({
    ts: parseInt(d[0]),
    o: parseFloat(d[1]),
    h: parseFloat(d[2]),
    l: parseFloat(d[3]),
    c: parseFloat(d[4]),
    vol: parseFloat(d[5]),
  })).reverse(); // OKX returns newest first
}

// ---- Handler ----

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const symbol = (req.query.symbol as string || 'BTC').toUpperCase();
  const instId = `${symbol}-USDT`;

  try {
    const candles = await fetchCandles(instId, '1H', 168); // 7 days of hourly candles
    if (candles.length < 50) return res.status(404).json({ error: `Not enough candle data for ${symbol}` });

    const closes = candles.map(c => c.c);
    const currentPrice = closes[closes.length - 1];

    // Calculate ALL indicators (TradingView's most popular)
    const sma20 = sma(closes, 20);
    const sma50 = sma(closes, 50);
    const ema12 = ema(closes, 12);
    const ema26 = ema(closes, 26);
    const rsi14 = rsi(closes, 14);
    const bb = bollingerBands(closes, 20, 2);
    const macdData = macd(closes);
    const vwapData = vwap(candles);
    const sr = findSupportResistance(candles, 10);
    const volumes = candles.map(c => c.vol);

    const currentRSI = rsi14.filter(v => !isNaN(v)).pop() || 50;
    const currentSMA20 = sma20.filter(v => !isNaN(v)).pop() || currentPrice;
    const currentSMA50 = sma50.filter(v => !isNaN(v)).pop() || currentPrice;
    const currentBBUpper = bb.upper.filter(v => !isNaN(v)).pop() || currentPrice;
    const currentBBLower = bb.lower.filter(v => !isNaN(v)).pop() || currentPrice;
    const currentMACD = macdData.macdLine.filter(v => !isNaN(v)).pop() || 0;
    const currentSignal = macdData.signal.filter(v => !isNaN(v)).pop() || 0;
    const macdCrossover = currentMACD > currentSignal ? 'BULLISH_CROSS' : currentMACD < currentSignal ? 'BEARISH_CROSS' : 'NEUTRAL';

    // Trend detection
    const trend = currentPrice > currentSMA20 && currentSMA20 > currentSMA50 ? 'BULLISH'
      : currentPrice < currentSMA20 && currentSMA20 < currentSMA50 ? 'BEARISH'
      : 'NEUTRAL';

    // Bollinger squeeze (bands narrow = breakout incoming)
    const bbWidth = (currentBBUpper - currentBBLower) / currentPrice;
    // Dynamic squeeze threshold based on asset volatility (altcoins wider bands)
    const avgChange = candles.slice(-20).reduce((s, c) => s + Math.abs((c.c - c.o) / c.o), 0) / 20;
    const squeezeThreshold = Math.max(0.02, avgChange * 3); // At least 2%, or 3x avg candle size
    const bollingerSqueeze = bbWidth < squeezeThreshold;

    // Summary for Bobby's prompt — TradingView-grade analysis
    const summary = {
      symbol,
      price: currentPrice,
      sma20: parseFloat(currentSMA20.toFixed(2)),
      sma50: parseFloat(currentSMA50.toFixed(2)),
      rsi: parseFloat(currentRSI.toFixed(1)),
      rsi_signal: currentRSI > 70 ? 'OVERBOUGHT' : currentRSI < 30 ? 'OVERSOLD' : 'NEUTRAL',
      macd: parseFloat(currentMACD.toFixed(2)),
      macd_signal: parseFloat(currentSignal.toFixed(2)),
      macd_crossover: macdCrossover,
      trend,
      bollinger_squeeze: bollingerSqueeze,
      bollinger_width_pct: parseFloat((bbWidth * 100).toFixed(2)),
      support: sr.support,
      resistance: sr.resistance,
      price_vs_sma20: parseFloat(((currentPrice / currentSMA20 - 1) * 100).toFixed(2)),
      price_vs_sma50: parseFloat(((currentPrice / currentSMA50 - 1) * 100).toFixed(2)),
      vwap: parseFloat(vwapData[vwapData.length - 1].toFixed(2)),
      price_vs_vwap: parseFloat(((currentPrice / vwapData[vwapData.length - 1] - 1) * 100).toFixed(2)),
    };

    // Only send last 72 candles to frontend (3 days for chart)
    const chartCandles = candles.slice(-72);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

    return res.status(200).json({
      ok: true,
      symbol,
      candles: chartCandles,
      indicators: {
        sma20: sma20.slice(-72).map(v => isNaN(v) ? null : parseFloat(v.toFixed(2))),
        sma50: sma50.slice(-72).map(v => isNaN(v) ? null : parseFloat(v.toFixed(2))),
        ema12: ema12.slice(-72).map(v => isNaN(v) ? null : parseFloat(v.toFixed(2))),
        ema26: ema26.slice(-72).map(v => isNaN(v) ? null : parseFloat(v.toFixed(2))),
        rsi14: rsi14.slice(-72).map(v => isNaN(v) ? null : parseFloat(v.toFixed(1))),
        macdLine: macdData.macdLine.slice(-72).map(v => isNaN(v) ? null : parseFloat(v.toFixed(2))),
        macdSignal: macdData.signal.slice(-72).map(v => isNaN(v) ? null : parseFloat(v.toFixed(2))),
        macdHistogram: macdData.histogram.slice(-72).map(v => isNaN(v) ? null : parseFloat(v.toFixed(2))),
        bollingerUpper: bb.upper.slice(-72).map(v => isNaN(v) ? null : parseFloat(v.toFixed(2))),
        bollingerLower: bb.lower.slice(-72).map(v => isNaN(v) ? null : parseFloat(v.toFixed(2))),
        vwap: vwapData.slice(-72).map(v => parseFloat(v.toFixed(2))),
        volume: volumes.slice(-72).map(v => parseFloat(v.toFixed(2))),
      },
      support: sr.support,
      resistance: sr.resistance,
      summary,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[TA] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
