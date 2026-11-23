// Offline checks of api/_lib/desk-lean.ts: the price action the roles are given and the lean the CIO starts from.
// Run: npx tsx scripts/test-desk-lean.mts   (or: node scripts/test-desk-lean.mts on Node 23+)
// With --live it also prints the lean of a few real instruments from the desk's own candle endpoints.
import { priceAction, blockLean, leanOf, LEAN_THRESHOLD } from '../api/_lib/desk-lean.ts';
import { analyzeCandles, analysisSummary, type Candle } from '../src/lib/market-indicators.ts';

let failed = 0;
const ok = (cond: unknown, label: string) => { if (!cond) { failed++; console.error(`FAIL ${label}`); } else console.log(`ok   ${label}`); };

const HOUR = 3600, DAY = 86_400;
/** Hourly stock bars: 7 a session, an overnight break between sessions. `closes` is one close per bar. */
function stock(closes: number[], volume: (i: number) => number = () => 1_000_000): Candle[] {
  const out: Candle[] = [];
  let t = 1_790_000_000;
  closes.forEach((close, i) => {
    if (i > 0) t += i % 7 === 0 ? DAY - 6 * HOUR : HOUR;
    const open = i === 0 ? close : out[i - 1].close;
    out.push({ time: t, open, high: Math.max(open, close) * 1.002, low: Math.min(open, close) * 0.998, close, volume: volume(i) });
  });
  return out;
}
/** Hourly crypto bars with no breaks. */
function crypto(closes: number[], volume: (i: number) => number = () => 500): Candle[] {
  return closes.map((close, i) => {
    const open = i === 0 ? close : closes[i - 1];
    return { time: 1_790_000_000 + i * HOUR, open, high: Math.max(open, close) * 1.001, low: Math.min(open, close) * 0.999, close, volume: volume(i) };
  });
}
const block = (candles: Candle[], barSeconds: number, equity: boolean) => ({ ...analysisSummary(analyzeCandles(candles)), action: priceAction(candles, barSeconds, equity) });
const wave = (n: number, base: number, amp: number) => Array.from({ length: n }, (_, i) => base + Math.sin(i / 3) * amp);

// 1. The case that started this: a week of decline, then a session that opens a third higher on huge volume.
{
  const closes = [...Array.from({ length: 98 }, (_, i) => 160 - i * 0.35), 170.3];
  const candles = stock(closes, i => (i === 98 ? 16_000_000 : 1_000_000));
  // The gap is in the open of the new session's first bar.
  candles[98] = { ...candles[98], open: 167, high: 171.5, low: 156.9 };
  // And the feed's live stub after it: a price, no volume.
  candles.push({ time: candles[98].time + 3420, open: 170.5, high: 170.5, low: 170.5, close: 170.5, volume: 0 });
  const action = priceAction(candles, HOUR, true);
  ok(action.sessionChangeFrom === 'previous session close' && action.sessionChangePct! > 30, `gap day: session change is read against the previous close (${action.sessionChangePct}%)`);
  ok(action.openingGapPct! > 25, `gap day: the opening gap is reported (${action.openingGapPct}%)`);
  ok(action.volumeRatio! > 10, `gap day: the live stub does not hide the volume surge (${action.volumeRatio}x)`);
  ok(action.moveInAtr! >= 4, `gap day: the move is an event in ATRs (${action.moveInAtr})`);
  ok(action.rangePositionPct! > 90, `gap day: the price is at the top of its range (${action.rangePositionPct})`);
  const b = block(candles, HOUR, true);
  const lean = leanOf({ '1H': b }, '1H');
  ok(lean.label === 'long', `gap day: the read leans long, not "sideways" (score ${lean.score}, trend ${b.trend})`);
  ok(lean.cautions.some(c => c.includes('gap')), 'gap day: the gap is carried as a caution');
}

// 2. A steady decline on usual volume leans short.
{
  const candles = stock(Array.from({ length: 105 }, (_, i) => 200 - i * 0.6));
  const lean = leanOf({ '1H': block(candles, HOUR, true) }, '1H');
  ok(lean.label === 'short' && lean.score <= -LEAN_THRESHOLD, `decline: leans short (score ${lean.score})`);
}

// 3. A flat market is neutral: "wait" still exists, and it is a finding.
{
  // A range: closes swing a little around 100 and every bar is about as wide as the swing.
  const candles = crypto(wave(100, 100, 0.4)).map(c => ({ ...c, high: c.high + 0.35, low: c.low - 0.35 }));
  for (const end of [100, 94, 88]) {
    const lean = leanOf({ '1H': block(candles.slice(0, end), HOUR, false) }, '1H');
    ok(lean.label === 'neutral', `range-bound, bar ${end}: neutral whether the swing is at its top or its bottom (score ${lean.score})`);
  }
}

// 4. Crypto has no sessions: the change is against 24 hours ago and there is never a gap.
{
  const candles = crypto(Array.from({ length: 100 }, (_, i) => 100 + i * 0.5));
  const action = priceAction(candles, HOUR, false);
  ok(action.sessionChangeFrom === '24 hours ago' && action.openingGapPct === null, 'crypto: 24-hour change, no gap');
  ok(leanOf({ '1H': block(candles, HOUR, false) }, '1H').label === 'long', 'crypto: a steady rise leans long');
}

// 5. Timeframes that disagree are reported, and need a wider margin to lean.
{
  const up = block(crypto(Array.from({ length: 100 }, (_, i) => 100 + i * 0.3)), HOUR, false);
  const down = block(crypto(Array.from({ length: 100 }, (_, i) => 200 - i * 0.9)), DAY, false);
  const lean = leanOf({ '1H': up, '1D': down }, '1H');
  ok(lean.timeframesDisagree && lean.cautions.some(c => c.includes('opposite')), `disagreement is reported (1H ${lean.byTimeframe['1H']}, 1D ${lean.byTimeframe['1D']}, total ${lean.score})`);
  ok(lean.strength !== 'strong', 'a read whose timeframes disagree is never strong');
}

// 6. A move on thin volume counts for less than the same move on heavy volume.
{
  const closes = [...wave(92, 100, 0.3), 100.6, 101.2, 101.8, 102.4, 103, 103.6, 104.2, 104.8];
  const heavy = blockLean(block(crypto(closes, i => (i >= 97 ? 2000 : 500)), HOUR, false))!;
  const thin = blockLean(block(crypto(closes, i => (i >= 97 ? 100 : 500)), HOUR, false))!;
  ok(heavy > thin, `volume weighs the move (heavy ${heavy} > thin ${thin})`);
}

// 7. Too little to read is neutral with a stated reason, never a guess.
{
  const lean = leanOf({ '1H': { price: 10 } }, '1H');
  ok(lean.label === 'neutral' && lean.cautions.length === 1, 'nothing to score: neutral, and it says so');
  ok(priceAction([], HOUR, true).sessionChangePct === null, 'no candles: no figures');
}

// Opt-in reproductions against the current engine; each check states the expected invariant.
if (process.argv.includes('--regressions')) {
  // Seven hourly bars with a 2.6% session rise and a baseline true range of 0.95.
  const ordinary = stock([...Array(56).fill(100), ...Array.from({ length: 7 }, (_, i) => 100 + 2.6 * (i + 1) / 7)]);
  for (let i = 0; i < 56; i++) ordinary[i] = { ...ordinary[i], high: 100.475, low: 99.525 };
  const ordinaryAction = priceAction(ordinary, HOUR, true);
  const ordinaryLean = leanOf({ '1H': { trend: 'lateral', rsi14: 50, action: { ...ordinaryAction, rangePositionPct: 50 } } }, '1H');
  ok(ordinaryAction.moveInAtr! < 2 && ordinaryLean.label === 'neutral', `ordinary session: momentum alone does not give a directional lean (${ordinaryAction.moveInAtr} ATR, ${ordinaryLean.label} ${ordinaryLean.score})`);

  // The same dollar gap from the same close should have symmetric ATR magnitudes.
  const gap = (open: number) => {
    const series = stock([...Array(56).fill(100), open]);
    series[56] = { ...series[56], open, high: open + 0.2, low: open - 0.2 };
    return priceAction(series, HOUR, true);
  };
  const down = gap(90), up = gap(110);
  ok(down.openingGapPct === -10 && down.againstPriorRange === 'below', 'gap down: reports a signed opening gap and a breakdown');
  ok(down.moveInAtr === up.moveInAtr, `gap symmetry: identical absolute price moves (${down.moveInAtr} down, ${up.moveInAtr} up)`);

  const limited = stock([...Array(14).fill(100), 110, 111, 112]);
  const limitedAction = priceAction(limited, HOUR, true);
  ok(limitedAction.moveInAtr === null, `short history: no full ATR exists before the session (${limitedAction.moveInAtr})`);

  const missingBar = stock([...Array(56).fill(100), 101, 102, 103, 104]);
  missingBar.splice(57, 1);
  const missingAction = priceAction(missingBar, HOUR, true);
  ok(missingAction.sessionChangePct === 4, `missing hourly bar: a gap in the feed is not a new session (${missingAction.sessionChangePct}%)`);

  const partial = stock([...Array(56).fill(100), 101, 102, 103], i => i === 58 ? 100_000 : 1_000_000);
  const last = partial.at(-1)!;
  partial.push({ time: last.time + HOUR / 10, open: last.close, high: last.close, low: last.close, close: last.close, volume: 0 });
  const partialVolume = priceAction(partial, HOUR, true).volumeRatio;
  ok(partialVolume === 1, `partial bar: an in-progress bar should not discount the completed bars (${partialVolume}x)`);
  const zeroVolume = stock(Array(56).fill(100), () => 0);
  ok(priceAction(zeroVolume, HOUR, true).volumeRatio === null, 'zero-volume feed: no volume ratio');
  const afterWeekend = stock([...Array(56).fill(100), 102, 103]);
  for (const c of afterWeekend.slice(56)) c.time += 2 * DAY;
  ok(priceAction(afterWeekend, HOUR, true).sessionChangePct === 3, 'hourly equity: Monday uses Friday close after a weekend');

  // Daily equity bars are already separate sessions, including the bars after a weekend.
  const daily = stock([...Array(20).fill(100), 103, 104, 105]).map((c, i) => ({
    ...c, time: Date.UTC(2026, 9, 26) / 1000 + (i + 2 * Math.floor(i / 5)) * DAY,
  }));
  const dailyAction = priceAction(daily, DAY, true);
  ok(dailyAction.sessionChangePct === 0.96, `daily equity: Wednesday compares to Tuesday's close (${dailyAction.sessionChangePct}%)`);

  const withStub = crypto(Array.from({ length: 60 }, (_, i) => 100 + i));
  const nextTime = withStub.at(-1)!.time + HOUR;
  withStub.push({ time: nextTime, open: 160, high: 160, low: 160, close: 160, volume: 0 });
  const stubAction = priceAction(withStub, HOUR, false);
  ok(stubAction.sessionChangePct === 17.65, `crypto: a timestamped quote uses the matching 24-hour baseline (${stubAction.sessionChangePct}%)`);

  const rebound = stock([...Array.from({ length: 56 }, (_, i) => 140 - i * 0.7), 99, 101, 103, 105, 107, 109, 111]);
  const reboundBlock = block(rebound, HOUR, true);
  const reboundLean = leanOf({ '1H': reboundBlock }, '1H');
  ok(reboundLean.label !== 'long', `bearish rebound: a bounce inside the prior range should not imply a long continuation (${reboundBlock.trend}, ${reboundBlock.action.againstPriorRange}, ${reboundLean.label} ${reboundLean.score})`);

  const oldHigh = stock([...Array(56).fill(100), ...Array(7).fill(103)]);
  oldHigh[27] = { ...oldHigh[27], high: 110 };
  const oldRange = priceAction(oldHigh, HOUR, true);
  const recentHigh = Math.max(...oldHigh.slice(42, 56).map(c => c.high));
  ok(oldRange.againstPriorRange === 'inside' && oldHigh.at(-1)!.close > recentHigh, `long range: above the last two sessions but inside the 30-bar range (recent high ${recentHigh})`);
}

if (process.argv.includes('--live')) {
  const base = process.env.BOBBY_PROTOCOL_BASE_URL || 'https://bobbyprotocol.xyz';
  const cases: Array<[string, boolean]> = [['NVDA', true], ['AAPL', true], ['TSLA', true], ['MSFT', true], ['AMZN', true], ['BTC', false], ['ETH', false], ['SOL', false], ['DOGE', false]];
  for (const [symbol, equity] of cases) {
    try {
      const path = equity ? `/api/stock-candles?symbol=${symbol}&range=30d&interval=1h` : `/api/okx-candles?instId=${symbol}-USDT&bar=1H&limit=100`;
      const payload = await (await fetch(`${base}${path}`, { signal: AbortSignal.timeout(15000) })).json() as { candles?: Array<Record<string, unknown>> };
      const candles = (payload.candles ?? []).map(r => ({ time: Number(r.ts) / 1000, open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close), volume: Number(r.volume ?? 0) })).sort((a, b) => a.time - b.time);
      const b = block(candles, HOUR, equity);
      const lean = leanOf({ '1H': b }, '1H');
      if (symbol === 'TSLA') {
        // As long as the 30-day feed still contains November 5, replay the completed selloff.
        const start = candles.findIndex(c => new Date(c.time * 1000).toISOString().startsWith('2026-11-05'));
        const next = candles.findIndex((c, i) => i > start && c.time - candles[i - 1].time > HOUR * 1.5);
        if (start >= 50 && next > start) {
          const selloff = block(candles.slice(0, next), HOUR, true);
          const historicalLean = leanOf({ '1H': selloff }, '1H');
          ok(selloff.action.openingGapPct! < -3 && selloff.action.sessionChangePct! < -10
            && selloff.action.againstPriorRange === 'below' && historicalLean.label === 'short',
          `live TSLA 2026-11-05: opening gap ${selloff.action.openingGapPct}%, session ${selloff.action.sessionChangePct}%, ${historicalLean.label} ${historicalLean.score}`);
        }
      }
      console.log(`live ${symbol.padEnd(5)} price ${String(b.price).padEnd(9)} trend ${String(b.trend).padEnd(8)} rsi ${String(b.rsi14).padEnd(5)} session ${String(b.action.sessionChangePct).padStart(7)}%  vol ${String(b.action.volumeRatio).padStart(5)}x  ${String(b.action.againstPriorRange).padEnd(6)} range ${String(b.action.rangePositionPct).padStart(5)}  atr× ${String(b.action.moveInAtr).padStart(5)}  → ${lean.label.toUpperCase()} ${lean.score} (${lean.strength})${lean.cautions.length ? '  ⚠ ' + lean.cautions.join('; ') : ''}`);
    } catch (error) { console.log(`live ${symbol}: unavailable (${(error as Error).message})`); }
  }
}

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\ndesk-lean: all checks passed');
