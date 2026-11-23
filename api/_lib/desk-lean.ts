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
  /** Volume of the latest bars against what is usual for them (1 = usual); null when the feed cannot say. */
  volumeRatio: number | null;
  /** Where the price sits between the lowest low (0) and the highest high (100) of the last 30 bars. */
  rangePositionPct: number | null;
  /** The move of the session (or window) against the range usual over that many bars: how unusual it is. */
  moveInAtr: number | null;
  /** The price against the range of the 30 bars before the latest move: a breakout, a breakdown, or still inside it. */
  againstPriorRange: 'above' | 'below' | 'inside' | null;
  /** The previous session's high and low (a stock), and the price against them. */
  priorSessionHigh: number | null;
  priorSessionLow: number | null;
  againstPriorSession: 'above' | 'below' | 'inside' | null;
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

/** Longest pause inside one trading session (Asian lunch breaks run to 90 minutes); past it a new session began. */
const SESSION_PAUSE_SECONDS = 4 * 3600;
const DAY_SECONDS = 86_400;

/** What the latest move is measured from: the index of its first bar in `candles` and the close before it. */
interface MoveReference { start: number; close: number; from: NonNullable<PriceAction['sessionChangeFrom']>; session: boolean }

/**
 * The close 24 hours before the latest price, found by when each bar closed. Only hourly bars can say it: on 4H and
 * above the nearest close can be minutes or a full bar away from 24 hours, so those timeframes use their window.
 */
function dayAgoReference(traded: Candle[], barSeconds: number, priceTime: number): MoveReference | null {
  if (barSeconds > 3600) return null;
  const target = priceTime - DAY_SECONDS;
  for (let i = traded.length - 1; i >= 0; i--) {
    const closedAt = traded[i].time + barSeconds;
    if (closedAt > target) continue;
    // A hole in the feed around that time gives no honest 24-hour base.
    return target - closedAt > barSeconds * 1.5 ? null : { start: i + 1, close: traded[i].close, from: '24 hours ago', session: false };
  }
  return null;
}

/**
 * Where the latest session starts. A daily bar is a session by itself, so its base is the bar before, whatever the
 * calendar between them. Intraday, a session starts after a pause too long to be a missing bar or a lunch break. A
 * market with no such pause in the last day (a future trading around the clock) is read like crypto.
 */
function sessionReference(candles: Candle[], traded: Candle[], barSeconds: number, priceTime: number): MoveReference | null {
  if (barSeconds >= DAY_SECONDS) {
    const quote = candles.at(-1)!, last = traded.at(-1)!;
    const start = quote !== last && quote.time >= last.time + barSeconds ? candles.length - 1 : traded.length - 1;
    return start > 0 ? { start, close: candles[start - 1].close, from: 'previous session close', session: true } : null;
  }
  const pause = Math.max(SESSION_PAUSE_SECONDS, barSeconds * 1.5);
  for (let i = candles.length - 1; i > 0; i--) {
    if (candles.at(-1)!.time - candles[i].time > DAY_SECONDS) break;
    if (candles[i].time - candles[i - 1].time > pause) return { start: i, close: candles[i - 1].close, from: 'previous session close', session: true };
  }
  return dayAgoReference(traded, barSeconds, priceTime);
}

/** The high and low of the session before the one that starts at `start`. */
function priorSession(candles: Candle[], start: number, barSeconds: number): { high: number; low: number } | null {
  if (start < 1) return null;
  let from = start - 1;
  if (barSeconds < DAY_SECONDS) {
    const pause = Math.max(SESSION_PAUSE_SECONDS, barSeconds * 1.5);
    while (from > 0 && candles[from].time - candles[from - 1].time <= pause) from--;
  }
  const rows = candles.slice(from, start);
  return { high: Math.max(...rows.map(c => c.high)), low: Math.min(...rows.map(c => c.low)) };
}

/**
 * A finished stock session's volume against the same hours of the sessions before it: the first hour of any session
 * trades about twice the last, so a contiguous average would read every ordinary open as a surge. Bars with no
 * volume are holes in the feed (past first bars of several European and Brazilian listings) and are left out.
 */
function sessionVolumeRatio(closed: Candle[], barSeconds: number): number | null {
  const pause = Math.max(SESSION_PAUSE_SECONDS, barSeconds * 1.5);
  const sessions: Candle[][] = [];
  closed.forEach((bar, i) => {
    if (i === 0 || bar.time - closed[i - 1].time > pause) sessions.push([]);
    sessions.at(-1)!.push(bar);
  });
  const prior = sessions.slice(-21, -1);
  const current = (sessions.at(-1) ?? []).map((bar, position) => ({ bar, position })).filter(({ bar }) => bar.volume > 0).slice(-3);
  let traded = 0, usual = 0;
  for (const { bar, position } of current) {
    const same = prior.map(session => session[position]?.volume ?? 0).filter(volume => volume > 0);
    if (same.length < 5) continue;
    traded += bar.volume;
    usual += same.reduce((sum, volume) => sum + volume, 0) / same.length;
  }
  return usual > 0 ? Number((traded / usual).toFixed(2)) : null;
}

/**
 * Recent price behaviour, from the candles of one timeframe. `now` (seconds) tells a bar still in progress from a
 * closed one when the feed carries no live quote after it; without either, every bar counts as closed.
 */
export function priceAction(candles: Candle[], barSeconds: number, equity: boolean, opts: { now?: number } = {}): PriceAction {
  const empty: PriceAction = { lastBarPct: null, sessionChangePct: null, sessionChangeFrom: null, openingGapPct: null, windowChangePct: null, window: null, volumeRatio: null, rangePositionPct: null, moveInAtr: null, againstPriorRange: null, priorSessionHigh: null, priorSessionLow: null, againstPriorSession: null };
  if (candles.length < 3) return empty;
  const price = candles.at(-1)!.close;
  // Bars that really traded: the stub still gives the price, never a volume or a range.
  const stub = isStub(candles.at(-1)!) ? candles.at(-1)! : null;
  const traded = stub ? candles.slice(0, -1) : candles;
  const last = traded.at(-1)!, before = traded.at(-2);
  const lastBarPct = before ? pct(before.close, last.close) : null;

  // When the latest price is from: its live quote, or the close of its last bar, never later than now.
  const priceTime = Math.min(opts.now ?? Infinity, stub?.time ?? last.time + barSeconds);
  const reference = equity ? sessionReference(candles, traded, barSeconds, priceTime) : dayAgoReference(traded, barSeconds, priceTime);
  const sessionChangePct = reference ? pct(reference.close, price) : null;
  const sessionChangeFrom = reference?.from ?? null;
  let openingGapPct: number | null = null;
  if (reference?.session) {
    const atr = atrAt(candles, reference.start);
    const opened = candles[reference.start].open;
    // The range the instrument had before the gap: an ATR that already holds the gap bar hides the gap.
    if (atr !== null && Math.abs(opened - reference.close) >= atr * 0.5) openingGapPct = pct(reference.close, opened);
  }

  const windowBars = Math.min(10, traded.length - 1);
  const windowChangePct = windowBars >= 2 ? pct(traded[traded.length - 1 - windowBars].close, price) : null;

  // Volume compares closed bars. A bar still in progress can only understate its volume, so it joins them only
  // once it already holds more than the average: that is how a surge is seen before the bar closes.
  const asOf = opts.now ?? stub?.time ?? null;
  const inProgress = asOf !== null && last.time + barSeconds > asOf ? last : null;
  const closed = inProgress ? traded.slice(0, -1) : traded;
  let volumeRatio: number | null = null;
  if (equity && barSeconds < DAY_SECONDS && reference?.session) {
    // Yahoo's hourly bars of a session still trading are not usable: on 2026-11-23 they summed to 2-9 times that
    // day's own daily volume and changed between two fetches. They are read only once the session is over.
    const sessionLive = asOf !== null && asOf - last.time < barSeconds * 2;
    if (!sessionLive) volumeRatio = sessionVolumeRatio(closed, barSeconds);
  } else {
    const recentCount = reference?.session ? Math.min(3, Math.max(0, closed.length - reference.start)) : 3;
    const base = closed.slice(Math.max(0, closed.length - recentCount - 20), closed.length - recentCount).filter(c => c.volume > 0);
    const mean = (rows: Candle[]) => rows.reduce((sum, c) => sum + c.volume, 0) / rows.length;
    const baseMean = base.length >= 10 ? mean(base) : 0;
    const recent = (recentCount ? closed.slice(-recentCount) : []).filter(c => c.volume > 0);
    if (inProgress && baseMean > 0 && inProgress.volume >= baseMean) recent.push(inProgress);
    if (baseMean > 0 && recent.length) volumeRatio = Number((mean(recent) / baseMean).toFixed(2));
  }

  const window = candles.slice(-30);
  const low = Math.min(...window.map(c => c.low)), high = Math.max(...window.map(c => c.high));
  const rangePositionPct = high > low ? Number(((price - low) / (high - low) * 100).toFixed(1)) : null;

  // How unusual the move is: its distance in price against the range the instrument had before it started,
  // scaled to the bars it took (a range grows with the square root of time, so seven bars are not one).
  const moveFrom = reference ? reference.start : traded.length - windowBars;
  const moveBase = reference ? reference.close : traded[traded.length - 1 - windowBars]?.close ?? null;
  const moveBars = Math.max(1, reference ? traded.length - reference.start : windowBars);
  const atrBefore = atrAt(candles, moveFrom);
  let moveInAtr: number | null = null;
  if (atrBefore && moveBase !== null) {
    const distance = price - moveBase;
    // A gap happened at once: the part of it still standing is not diluted by the bars that followed.
    const gap = reference?.session ? candles[reference.start].open - reference.close : 0;
    const gapHeld = Math.sign(gap) === Math.sign(distance) ? Math.min(Math.abs(gap), Math.abs(distance)) : 0;
    moveInAtr = Number(Math.max(gapHeld / atrBefore, Math.abs(distance) / (atrBefore * Math.sqrt(moveBars))).toFixed(1));
  }

  // The range that stood before the move: leaving it is a breakout, moving inside it is not.
  const rangeAgainst = (hi: number, lo: number): 'above' | 'below' | 'inside' => price > hi ? 'above' : price < lo ? 'below' : 'inside';
  const prior = traded.slice(Math.max(0, moveFrom - 30), moveFrom);
  const againstPriorRange: PriceAction['againstPriorRange'] = prior.length < 10 ? null
    : rangeAgainst(Math.max(...prior.map(c => c.high)), Math.min(...prior.map(c => c.low)));
  // The narrower test beside it: a price can clear yesterday's high and still sit inside the month's range.
  const session = reference?.session ? priorSession(candles, reference.start, barSeconds) : null;

  return { lastBarPct, sessionChangePct, sessionChangeFrom, openingGapPct, windowChangePct, window: windowChangePct === null ? null : { bars: windowBars }, volumeRatio, rangePositionPct, moveInAtr, againstPriorRange,
    priorSessionHigh: session ? Number(session.high.toFixed(4)) : null, priorSessionLow: session ? Number(session.low.toFixed(4)) : null, againstPriorSession: session ? rangeAgainst(session.high, session.low) : null };
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
    // Without a full range from before the move there is no size to give it, and the reading is left out.
    const size = action.moveInAtr !== null ? clamp(action.moveInAtr / 2, 0, 1) : null;
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
