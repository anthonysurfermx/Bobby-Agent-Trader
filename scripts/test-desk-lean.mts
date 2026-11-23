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
  ok(action.volumeRatio === null, `gap day: a session still trading reports no hourly volume, the live feed is unreliable (${action.volumeRatio})`);
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

// The reproductions of the review of PR 220; each check states the invariant the engine must keep.
{
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

  // A session still trading gives no volume figure; once it is over, each hour is compared with the same hour before.
  const partial = stock([...Array(56).fill(100), 101, 102, 103], i => i === 58 ? 100_000 : 1_000_000);
  const last = partial.at(-1)!;
  partial.push({ time: last.time + HOUR / 10, open: last.close, high: last.close, low: last.close, close: last.close, volume: 0 });
  ok(priceAction(partial, HOUR, true).volumeRatio === null, 'live session: no volume ratio from its hourly bars');
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
  // The quote is at T60: the bar that CLOSED 24 hours before it is the one that opened at T35 (close 135).
  ok(stubAction.sessionChangePct === 18.52, `crypto: a timestamped quote uses the close from 24 hours before it (${stubAction.sessionChangePct}%)`);

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

// Volume: an ordinary open is not a surge, a real one is, and holes in the feed are not low volume.
{
  // Every session trades three times as much in its first hour as in the others.
  const shape = (i: number) => (i % 7 === 0 ? 3_000_000 : 1_000_000);
  const ordinaryOpen = stock(Array(98).fill(100), shape);
  ok(priceAction(ordinaryOpen, HOUR, true).volumeRatio === 1, 'finished session: its usual intraday shape reads as usual volume');
  const heavy = stock(Array(98).fill(100), i => (i >= 91 ? shape(i) * 4 : shape(i)));
  ok(priceAction(heavy, HOUR, true).volumeRatio === 4, 'finished session: four times the same hours reads as 4x');
  const holes = stock(Array(98).fill(100), i => (i % 7 === 6 && i % 2 === 0 ? 0 : 1_000_000));
  ok(priceAction(holes, HOUR, true).volumeRatio === 1, 'bars with no volume are holes in the feed, not a low base');
  const coin = crypto([...Array(79).fill(100), 110], i => (i === 79 ? 20_000 : 500));
  ok(priceAction(coin, HOUR, false, { now: coin.at(-1)!.time + 900 }).volumeRatio! > 5, 'crypto bar in progress: a surge is seen before it closes');
  const quietCoin = crypto([...Array(79).fill(100), 100.1], i => (i === 79 ? 10 : 500));
  ok(priceAction(quietCoin, HOUR, false, { now: quietCoin.at(-1)!.time + 60 }).volumeRatio === 1, 'crypto bar in progress: a quiet first minute does not discount the closed bars');
  // A daily bar read after its session ended counts as closed when the loader passes no clock.
  const days = stock(Array(40).fill(100)).map((c, i) => ({ ...c, time: 1_790_000_000 + i * DAY, volume: i === 39 ? 500_000 : 1_000_000 }));
  ok(priceAction(days, DAY, true).volumeRatio === 0.5, 'finished daily bar: its thin volume is reported');
}

// The 24-hour base only exists on hourly bars: on 1D the nearest close can be minutes old.
{
  const daily = crypto(Array.from({ length: 40 }, (_, i) => 100 + i)).map((c, i) => ({ ...c, time: 1_790_000_000 + i * DAY }));
  const action = priceAction(daily, DAY, false, { now: daily.at(-1)!.time + 600 });
  ok(action.sessionChangePct === null && action.windowChangePct !== null, 'crypto 1D: no "24 hours ago" figure, the window speaks instead');
}

// A gap that holds is not diluted by the bars after it; one that filled no longer counts.
{
  const atGap = (closes: number[]) => {
    const series = stock([...Array(56).fill(100), ...closes]);
    series[56] = { ...series[56], open: 110, high: Math.max(110, closes[0]) + 0.2, low: Math.min(110, closes[0]) - 0.2 };
    return priceAction(series, HOUR, true).moveInAtr!;
  };
  ok(atGap([110, 110, 110, 110, 110, 110, 110]) === atGap([110]), 'a held gap keeps its full size through the session');
  ok(atGap([110, 106, 103, 101, 100.2, 100.1, 100.1]) < 2, 'a filled gap no longer reads as unusual');
}

// A market with no overnight pause is read over 24 hours, and the prior session is reported beside the wide range.
{
  const future = stock(Array.from({ length: 80 }, (_, i) => 100 + i * 0.1)).map((c, i) => ({ ...c, time: 1_790_000_000 + i * HOUR }));
  ok(priceAction(future, HOUR, true).sessionChangeFrom === '24 hours ago', 'no overnight pause: the base is 24 hours ago');
  const twoDays = stock([...Array(56).fill(100), ...Array(7).fill(103)]);
  twoDays[27] = { ...twoDays[27], high: 110 };
  const action = priceAction(twoDays, HOUR, true);
  ok(action.againstPriorRange === 'inside' && action.againstPriorSession === 'above', `prior session: above yesterday's high (${action.priorSessionHigh}), inside the wide range`);
}

// The guard: what a market does is not a call to act; a call to act still is. Closed by default.
{
  const { publicTextViolation } = await import('../api/_lib/desk-debate.ts');
  for (const text of ['Abre la sesión con un hueco bajista.', 'Entra en sobrecompra tras el gap.', 'NVDA subió. Abre arriba de su resistencia.', 'Entra en juego el riesgo de que el hueco se cierre.', 'Entra ya en sobrecompra.', 'Entra ahora en zona de sobreventa.', 'Entra hoy en zona de soporte.', 'Entra en la EMA50 y rebota.', 'Entra a la EMA200 desde abajo.', 'Entra en RSI de 72.', 'Entra en ATR alto.', 'Abre la sesión con fuerte presión de venta.', 'Abre con gap a corto plazo.'])
    ok(publicTextViolation(text) === null, `guard passes a description: "${text}"`);
  for (const text of ['Abre un largo en NVDA.', 'Abre posición ya.', 'Entra ya.', 'Entra en NVDA antes del cierre.', 'El precio sube. Entra a comprar.', 'Abra uma posição comprada.', 'Entra con todo.', 'Entra al mercado.', 'Entra con 10x.', 'Abre tus posiciones.', 'Abre BTC ya.', 'Abran ya.', 'Abra comprado.', 'Abra posições.', 'Entra ya en zona de compra.', 'Entra en zona y compra.', 'Entra en la EMA50 con un largo.', 'Abre en 150 un largo.', 'Abre la semana con un largo.', 'Abre la sesión comprando BTC con 10x.', 'La tendencia es alcista. Abre posiciones con 10x en esta zona.'])
    ok(publicTextViolation(text) === 'advice', `guard stops a call to act: "${text}"`);
}

// A review must point somewhere, and not against the desk's own tally.
{
  const { verdictProblem } = await import('../api/_lib/desk-debate.ts');
  ok(verdictProblem('review', 'short', 'long') === 'against_lean', 'review against the lean is a problem');
  ok(verdictProblem('review', 'none', 'neutral') === 'no_direction', 'review with no direction is a problem');
  ok(verdictProblem('review', 'long', 'neutral') === null, 'review on a neutral lean may still make its case');
  ok(verdictProblem('wait', 'none', 'long') === null, 'wait is always coherent');

  // The repair, offline: every provider call is answered here.
  process.env.OPENAI_API_KEY ||= 'test-openai';
  process.env.BOBBY_LLM_PRIMARY = 'openai';
  const { runDeskDebate, DeskOutputRejected } = await import('../api/_lib/desk-debate.ts');
  const up = block(crypto(Array.from({ length: 100 }, (_, i) => 100 + i * 0.5), () => 500), HOUR, false);
  const evidence = () => ({ symbol: 'BTC', technicals: up, provenance: { provider: 'OKX', instrument: 'BTC-USDT', assetType: 'crypto', currency: 'USDT', exchange: null, timeframe: '1H', asOf: new Date().toISOString() } }) as never;
  const answer = (direction: string, headline: string) => ({ analysis: `The conditional case is ${direction}.`, verdict: 'review', direction, synthesis: { headline, why: 'Price holds above its averages.', risk: 'A gap can fill.', watch: 'Watch the prior high.', watchLevel: 0, followUp: 'How does BTC look on the daily chart?' } });
  const realFetch = globalThis.fetch, realLog = console.log, realError = console.error;
  const debate = async (repairWith: unknown) => {
    const calls: string[] = [];
    globalThis.fetch = (async (_url: unknown, init: { body: string }) => {
      const body = JSON.parse(init.body), system = String(body.messages?.[0]?.content ?? '');
      const kind = system.includes('repair holds your previous answer') ? 'repair' : system.includes('Your role is CIO') ? 'cio' : 'role';
      calls.push(kind);
      const content = kind === 'repair' ? repairWith : kind === 'cio' ? answer('short', 'BTC points down.') : { analysis: 'The evidence is as stated.' };
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
    console.log = () => {}; console.error = () => {};
    try { return { calls, result: await runDeskDebate('How is BTC?', evidence(), 'en', { level: 'rapido' }) as { agents: { verdict: string; direction: string; synthesis: { headline: string } } }, error: null }; }
    catch (error) { return { calls, result: null, error }; }
    finally { globalThis.fetch = realFetch; console.log = realLog; console.error = realError; }
  };
  const fixed = await debate(answer('long', 'BTC points up while it holds.'));
  ok(fixed.result?.agents.direction === 'long' && fixed.result.agents.synthesis.headline.includes('up') && fixed.calls.filter(c => c === 'repair').length === 1, 'repair: a review against the lean is rewritten whole, once');
  const toWait = await debate({ ...answer('short', 'The evidence is mixed.'), verdict: 'wait', direction: 'none' });
  ok(toWait.result?.agents.verdict === 'wait' && toWait.result.agents.synthesis.headline === 'The evidence is mixed.', 'repair: the CIO may answer wait with its own words');
  const stubborn = await debate(answer('short', 'BTC still points down.'));
  ok(stubborn.error instanceof DeskOutputRejected && stubborn.calls.filter(c => c === 'repair').length === 1, 'repair: still against the lean means no verdict, never a relabelled draft, and no second repair');
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
