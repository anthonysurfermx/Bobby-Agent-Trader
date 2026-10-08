// ============================================================
// The harness, layer 2a (README.md in this folder): what a completed day did to an asset.
// Two dated facts, computed from validated bars and shared by everyone:
//   · a close-to-close change larger than the asset's own usual day (1.5 x the average true
//     range of the 20 bars before it, and at least 1% for equities, 2% for crypto);
//   · a close outside the previous 20-day range, reported on the day it enters that state.
// The newest bar never enters its own baseline. Whatever cannot be evaluated is null, never zero.
// These are observations about a finished day. Nothing here predicts or recommends anything.
// ============================================================
import { validateBars } from './bars.js';
import type { AssetClass, BarSeries, DailyBar } from './bars.js';

export interface AssetFact {
  v: 1; symbol: string; assetClass: AssetClass; currency: string | null; exchange: string | null;
  source: 'yahoo' | 'okx'; day: string; closedAt: string; close: number; previousClose: number;
  changePct: number; atr20: number; atrPct: number; unusualMove: boolean;
  rangeHigh20: number; rangeLow20: number; outsideRange: 'above' | 'below' | null;
  outsideRangeEntered: boolean; eventId: string | null;
}

export function trueRange(bar: DailyBar, previousClose: number): number | null {
  if (![bar.open, bar.high, bar.low, bar.close, previousClose].every(n => Number.isFinite(n) && n > 0) || bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close)) return null;
  const tr = Math.max(bar.high - bar.low, Math.abs(bar.high - previousClose), Math.abs(bar.low - previousClose));
  return Number.isFinite(tr) ? tr : null;
}

export function atr20Before(bars: DailyBar[], t: number): number | null {
  if (!Number.isInteger(t) || t < 21 || t >= bars.length) return null;
  let sum = 0;
  for (let i = t - 20; i < t; i++) {
    const tr = trueRange(bars[i], bars[i - 1].close);
    if (tr === null) return null;
    sum += tr;
  }
  const atr = sum / 20;
  return Number.isFinite(atr) && atr > 0 ? atr : null;
}

function rangeBefore(bars: DailyBar[], t: number): { high: number; low: number } | null {
  if (t < 20) return null;
  const prior = bars.slice(t - 20, t);
  return { high: Math.max(...prior.map(b => b.high)), low: Math.min(...prior.map(b => b.low)) };
}

export function assetFact(series: BarSeries, bars: DailyBar[], now: Date): AssetFact | null {
  // Recheck the supplied bars so an accidental unvalidated call cannot manufacture a fact.
  const validated = validateBars({ ...series, bars }, now);
  if (!validated.ok) return null;
  const t = bars.length - 1, current = bars[t], previous = bars[t - 1];
  const atr20 = atr20Before(bars, t), range = rangeBefore(bars, t);
  if (atr20 === null || !range) return null;
  const changePct = 100 * (current.close / previous.close - 1);
  const atrPct = atr20 / previous.close * 100;
  if (![changePct, atrPct, range.high + 0.1 * atr20, range.low - 0.1 * atr20].every(Number.isFinite)) return null;
  const unusualMove = Math.abs(current.close - previous.close) >= 1.5 * atr20 && Math.abs(changePct) >= (series.assetClass === 'equity' ? 1 : 2);
  const outsideRange = current.close > range.high + 0.1 * atr20 ? 'above' : current.close < range.low - 0.1 * atr20 ? 'below' : null;
  const previousRange = rangeBefore(bars, t - 1);
  // Entry requires yesterday to be inside its actual prior range, without today's buffer.
  const outsideRangeEntered = outsideRange !== null && previousRange !== null && previous.close >= previousRange.low && previous.close <= previousRange.high;
  const event = [unusualMove ? 'move' : null, outsideRangeEntered ? `range-${outsideRange}` : null].filter(s => s !== null).join('+');
  return { v: 1, symbol: series.symbol, assetClass: series.assetClass, currency: series.currency, exchange: series.exchange, source: series.source, day: current.day, closedAt: current.closedAt, close: current.close, previousClose: previous.close, changePct, atr20, atrPct, unusualMove, rangeHigh20: range.high, rangeLow20: range.low, outsideRange, outsideRangeEntered, eventId: event ? `${series.symbol}:${current.day}:${event}` : null };
}

export function sinceAsked(priceThen: number, askedAt: Date, fact: AssetFact): { pct: number; basis: 'close'; day: string } | null {
  if (![priceThen, fact.close].every(n => Number.isFinite(n) && n > 0) || !Number.isFinite(askedAt.getTime()) || !Number.isFinite(Date.parse(fact.closedAt)) || askedAt.getTime() >= Date.parse(fact.closedAt)) return null;
  const pct = 100 * (fact.close / priceThen - 1);
  return Number.isFinite(pct) && Math.abs(pct) < 1000 ? { pct, basis: 'close', day: fact.day } : null;
}
