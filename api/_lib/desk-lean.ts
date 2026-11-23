// ============================================================
// desk-lean — what the price did lately and which way the evidence leans, computed by the desk.
//
// Why this exists (2026-11-23): the desk answered "wait" on 59 of the 64 answers of its own paired eval
// (docs/ai/2026-09-29-levels-paired-eval.md) and told a reader NVDA was "moving sideways" on a day it opened
// 33% above its last close on sixteen times its usual volume. The roles only saw an EMA cross and an RSI, so
// a gap, a session's change and a volume surge did not exist for them, and with nothing to weigh the CIO took
// the safe word. Two things are computed here, from the same candles the indicators are read from, so no
// model does arithmetic and none has to guess:
//   · priceAction: the last session's change, the opening gap, volume against its own average, where the
//     price sits inside its recent range and how far the last bars travelled;
//   · leanOf: one score from -100 (short) to 100 (long) per timeframe and for the whole read, with a label.
// The lean is an input to the CIO, never a verdict: the CIO still decides, and says why.
// ============================================================
import type { Candle } from '../../src/lib/market-indicators.js';

export interface PriceAction {
  /** Change of the last traded bar against the bar before it, in %. */
  lastBarPct: number | null;
  /** Change against the previous session's close (a stock) or against 24 hours ago (crypto), in %. */
  sessionChangePct: number | null;
  /** What sessionChangePct is measured from, in plain words for the roles. */
  sessionChangeFrom: 'previous session close' | '24 hours ago' | null;
  /** A stock's latest opening gap against the previous close, in % (null for crypto, or when under half an ATR). */
  openingGapPct: number | null;
  /** Change over the last `window.bars` bars, in %. */
  windowChangePct: number | null;
  window: { bars: number } | null;
  /** Volume of the latest bars against the average of the 20 before them (1 = usual). */
  volumeRatio: number | null;
  /** Where the price sits between the lowest low (0) and the highest high (100) of the last 30 bars. */
  rangePositionPct: number | null;
  /** The move of the session (or window) measured in ATRs: how unusual it is for this instrument. */
  moveInAtr: number | null;
  /** The price against the range of the 30 bars before the latest move: a breakout, a breakdown, or still inside it. */
  againstPriorRange: 'above' | 'below' | 'inside' | null;
}

const pct = (from: number, to: number) => Number(((to - from) / from * 100).toFixed(2));
const clamp = (v: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));

/** The feed's last point can be a live stub with no volume and no range: it carries a price, not a bar. */
const isStub = (c: Candle) => c.volume === 0 && c.high === c.low;

/** Average true range over `period` bars ending at `end` (exclusive), in price units. */
function atrAt(candles: Candle[], end: number, period = 14): number | null {
  if (end - period < 1) return null;
  let total = 0;
  for (let i = end - period; i < end; i++) {
    const prev = candles[i - 1].close;
    total += Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - prev), Math.abs(candles[i].low - prev));
  }
  return total / period;
}

/**
 * Recent price behaviour, from the candles of one timeframe. `barSeconds` is the timeframe's bar; a break
 * between two bars longer than 1.5 bars is a session boundary (a stock overnight), which crypto never has.
 */
export function priceAction(candles: Candle[], barSeconds: number, equity: boolean): PriceAction {
  const empty: PriceAction = { lastBarPct: null, sessionChangePct: null, sessionChangeFrom: null, openingGapPct: null, windowChangePct: null, window: null, volumeRatio: null, rangePositionPct: null, moveInAtr: null, againstPriorRange: null };
  if (candles.length < 3) return empty;
  const price = candles.at(-1)!.close;
  // Bars that really traded: the stub still gives the price, never a volume or a range.
  const traded = isStub(candles.at(-1)!) ? candles.slice(0, -1) : candles;
  const last = traded.at(-1)!, before = traded.at(-2);
  const lastBarPct = before ? pct(before.close, last.close) : null;

  // The latest session: the bars after the last break in time.
  let sessionStart = -1;
  if (equity) {
    for (let i = traded.length - 1; i > 0; i--) {
      if (traded[i].time - traded[i - 1].time > barSeconds * 1.5) { sessionStart = i; break; }
    }
  }
  let sessionChangePct: number | null = null, sessionChangeFrom: PriceAction['sessionChangeFrom'] = null, openingGapPct: number | null = null;
  let sessionBars = 0;
  if (equity && sessionStart > 0) {
    const prevClose = traded[sessionStart - 1].close;
    sessionChangePct = pct(prevClose, price);
    sessionChangeFrom = 'previous session close';
    sessionBars = traded.length - sessionStart;
    const gap = pct(prevClose, traded[sessionStart].open);
    // The range the instrument had before the gap: an ATR that already holds the gap bar hides the gap.
    const atr = atrAt(traded, sessionStart);
    if (atr !== null && Math.abs(traded[sessionStart].open - prevClose) >= atr * 0.5) openingGapPct = gap;
  } else if (!equity) {
    const bars24h = Math.round(86_400 / barSeconds);
    if (bars24h >= 1 && traded.length > bars24h) {
      sessionChangePct = pct(traded[traded.length - 1 - bars24h].close, price);
      sessionChangeFrom = '24 hours ago';
      sessionBars = bars24h;
    }
  }

  const windowBars = Math.min(10, traded.length - 1);
  const windowChangePct = windowBars >= 2 ? pct(traded[traded.length - 1 - windowBars].close, price) : null;

  // Volume: the latest session's bars (up to 3) against the 20 before them. A feed without volume gives none.
  const recentCount = Math.max(1, Math.min(3, sessionBars || 3));
  const recent = traded.slice(-recentCount), base = traded.slice(-recentCount - 20, -recentCount);
  const mean = (rows: Candle[]) => rows.reduce((sum, c) => sum + c.volume, 0) / rows.length;
  const baseMean = base.length >= 10 ? mean(base) : 0;
  const volumeRatio = baseMean > 0 ? Number((mean(recent) / baseMean).toFixed(2)) : null;

  const window = candles.slice(-30);
  const low = Math.min(...window.map(c => c.low)), high = Math.max(...window.map(c => c.high));
  const rangePositionPct = high > low ? Number(((price - low) / (high - low) * 100).toFixed(1)) : null;

  // How unusual the move is: against the ATR the instrument had before the move started.
  const moveFrom = sessionChangePct !== null && sessionBars > 0 ? traded.length - sessionBars : traded.length - windowBars;
  const atrBefore = atrAt(traded, Math.max(15, moveFrom));
  const moved = sessionChangePct ?? windowChangePct;
  const moveInAtr = atrBefore && moved !== null && price > 0 ? Number((Math.abs(moved) / (atrBefore / price * 100)).toFixed(1)) : null;

  // The range that stood before the move: leaving it is a breakout, moving inside it is not.
  const prior = traded.slice(Math.max(0, moveFrom - 30), moveFrom);
  const againstPriorRange: PriceAction['againstPriorRange'] = prior.length < 10 ? null
    : price > Math.max(...prior.map(c => c.high)) ? 'above' : price < Math.min(...prior.map(c => c.low)) ? 'below' : 'inside';

  return { lastBarPct, sessionChangePct, sessionChangeFrom, openingGapPct, windowChangePct, window: windowChangePct === null ? null : { bars: windowBars }, volumeRatio, rangePositionPct, moveInAtr, againstPriorRange };
}

/** What leanOf reads of one timeframe: its indicators and, when the candles were at hand, its price action. */
export interface LeanBlock {
  price?: number | null; rsi14?: number | null; ema20?: number | null; ema50?: number | null; atrPct?: number | null;
  trend?: string | null; action?: PriceAction | null;
}

export type LeanLabel = 'long' | 'short' | 'neutral';
export interface Lean {
  /** Which way the supplied evidence leans as a whole. */
  label: LeanLabel;
  /** -100 (everything points down) to 100 (everything points up). */
  score: number;
  strength: 'strong' | 'moderate' | 'weak';
  /** The same score per timeframe, so a disagreement between them is visible. */
  byTimeframe: Record<string, number>;
  /** True when two timeframes lean clearly in opposite directions. */
  timeframesDisagree: boolean;
  /** Facts that make the lean less reliable, each already computed: never a reason by itself to wait. */
  cautions: string[];
}

/** Score at or beyond which a read leans one way. Under it the evidence is balanced. */
export const LEAN_THRESHOLD = 25;
const STRONG = 55;

/**
 * One timeframe, from -100 to 100. Five readings, each from -1 to 1, weighed by how much they say about
 * direction: the move itself (in ATRs, counted fully only on volume at or above its average), the trend
 * the EMAs give, the price against both EMAs, RSI around its midline, and the place inside the recent range.
 * A reading the block lacks is left out and the rest are re-weighed: nothing is assumed for it.
 */
export function blockLean(block: LeanBlock): number | null {
  const parts: Array<[number, number]> = [];
  const { price, ema20, ema50, rsi14, action } = block;
  // Range-bound: the averages are flat and the price is still inside the range it had. Up there the top of the
  // range is as likely a ceiling as a start, so everything but the trend counts for half.
  const ranging = block.trend === 'lateral' && action?.againstPriorRange === 'inside' ? 0.5 : 1;
  if (block.trend === 'alcista' || block.trend === 'bajista' || block.trend === 'lateral') parts.push([block.trend === 'alcista' ? 1 : block.trend === 'bajista' ? -1 : 0, 0.22]);
  if (typeof price === 'number' && typeof ema20 === 'number' && typeof ema50 === 'number') {
    parts.push([(price > ema20 && price > ema50 ? 1 : price < ema20 && price < ema50 ? -1 : 0) * ranging, 0.2]);
  }
  if (typeof rsi14 === 'number') parts.push([clamp((rsi14 - 50) / 20) * ranging, 0.15]);
  const moved = action?.sessionChangePct ?? action?.windowChangePct ?? null;
  if (action && moved !== null) {
    // Two ATRs in one direction is a full reading; a move on thin volume counts for six tenths of itself.
    const size = action.moveInAtr !== null ? clamp(action.moveInAtr / 2, 0, 1) : typeof block.atrPct === 'number' && block.atrPct > 0 ? clamp(Math.abs(moved) / (block.atrPct * 2), 0, 1) : null;
    if (size !== null) {
      const volume = action.volumeRatio === null ? 0.8 : action.volumeRatio >= 1 ? 1 : 0.6;
      parts.push([Math.sign(moved) * size * volume * ranging, 0.31]);
    }
  }
  if (action && action.rangePositionPct !== null) parts.push([clamp((action.rangePositionPct - 50) / 50) * ranging, 0.12]);
  const weight = parts.reduce((sum, [, w]) => sum + w, 0);
  if (parts.length < 2 || weight <= 0) return null;
  return Math.round(parts.reduce((sum, [value, w]) => sum + value * w, 0) / weight * 100);
}

/** How much each timeframe counts when no one was asked for: the base read first, then the daily. */
const TIMEFRAME_WEIGHT: Record<string, number> = { '1H': 0.45, '4H': 0.2, '1D': 0.3, '1W': 0.15 };

/**
 * The lean of the whole read. `lead` is the timeframe the answer is built on (provenance.timeframe): it
 * counts for at least half. Two timeframes that lean clearly in opposite directions are reported, and the
 * read is then only long or short when the weighed score still clears the threshold by a wide margin.
 */
export function leanOf(blocks: Record<string, LeanBlock>, lead: string): Lean {
  const byTimeframe: Record<string, number> = {};
  for (const [tf, block] of Object.entries(blocks)) {
    const score = blockLean(block);
    if (score !== null) byTimeframe[tf] = score;
  }
  const names = Object.keys(byTimeframe);
  if (!names.length) return { label: 'neutral', score: 0, strength: 'weak', byTimeframe, timeframesDisagree: false, cautions: ['no timeframe had enough readings to score'] };
  const weights = Object.fromEntries(names.map(tf => [tf, TIMEFRAME_WEIGHT[tf] ?? 0.15]));
  if (lead in weights && names.length > 1) {
    const others = names.filter(tf => tf !== lead).reduce((sum, tf) => sum + weights[tf], 0);
    weights[lead] = Math.max(weights[lead], others);
  }
  const total = names.reduce((sum, tf) => sum + weights[tf], 0);
  const score = Math.round(names.reduce((sum, tf) => sum + byTimeframe[tf] * weights[tf], 0) / total);
  const ups = names.some(tf => byTimeframe[tf] >= LEAN_THRESHOLD), downs = names.some(tf => byTimeframe[tf] <= -LEAN_THRESHOLD);
  const timeframesDisagree = ups && downs;
  const needed = timeframesDisagree ? LEAN_THRESHOLD + 15 : LEAN_THRESHOLD;
  const label: LeanLabel = score >= needed ? 'long' : score <= -needed ? 'short' : 'neutral';
  const strength: Lean['strength'] = label === 'neutral' ? 'weak' : Math.abs(score) >= STRONG && !timeframesDisagree ? 'strong' : 'moderate';

  const cautions: string[] = [];
  const leadBlock = blocks[lead] ?? Object.values(blocks)[0];
  const action = leadBlock?.action;
  if (timeframesDisagree) cautions.push('timeframes lean in opposite directions');
  if (typeof leadBlock?.rsi14 === 'number' && leadBlock.rsi14 >= 75) cautions.push(`RSI ${leadBlock.rsi14} is stretched to the upside`);
  if (typeof leadBlock?.rsi14 === 'number' && leadBlock.rsi14 <= 25) cautions.push(`RSI ${leadBlock.rsi14} is stretched to the downside`);
  if (action?.openingGapPct !== null && action?.openingGapPct !== undefined && Math.abs(action.openingGapPct) >= 3) cautions.push(`the session opened with a ${action.openingGapPct > 0 ? '+' : ''}${action.openingGapPct}% gap: gaps can fill`);
  if (action?.moveInAtr !== null && action?.moveInAtr !== undefined && action.moveInAtr >= 4) cautions.push(`the latest move is ${action.moveInAtr} times the usual range: an event the indicators do not explain`);
  if (action && action.volumeRatio !== null && action.volumeRatio < 0.7 && label !== 'neutral') cautions.push(`volume is ${action.volumeRatio} times its average: the move is thinly traded`);
  return { label, score, strength, byTimeframe, timeframesDisagree, cautions };
}

/** Seconds per bar for the timeframes the desk reads. */
export const LEAN_BAR_SECONDS: Record<string, number> = { '1H': 3600, '4H': 4 * 3600, '1D': 86_400, '1W': 7 * 86_400 };
