// ============================================================
// scripts/test-trader-land-thesis.mts
// Unit tests for the thesis loop that blooms Trader Land seeds:
//   · api/_lib/progress-rules.ts — the daily cap bounds plants, not closes
//   · api/_lib/thesis-rules.ts   — review window, verdict from public price,
//                                  tolerant thesis parsing
// Run: `npx tsx scripts/test-trader-land-thesis.mts`
// Zero runtime deps beyond tsx — same pattern as test-risk-gate.mts.
// ============================================================

import { applyAward, AWARD_POINTS, EXECUTION_BONUS, MAX_DAILY_AWARDS, type ProgressCounters } from '../api/_lib/progress-rules.ts';
import { resolveThesis, reviewAt, swapAsset, swapExecutesThesis, thesisFrom, THESIS_REVIEW_HOURS, ThesisSchema, type SwapCandidate, type Thesis } from '../api/_lib/thesis-rules.ts';
import { SEASON, seasonProgress } from '../api/_lib/trader-land-season.ts';

const failures: string[] = [];
let passed = 0;
const assert = (cond: unknown, msg: string) => {
  if (cond) passed++;
  else { failures.push(msg); console.error('  ✗', msg); }
};
const eq = (a: unknown, b: unknown, msg: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// ---------- daily cap ----------
{
  const day = new Date('2026-09-05T15:00:00Z');
  let s: ProgressCounters = { xp: 0, streak: 0, lastDay: null, dailyAwards: 0, dailyAwardsDay: null };
  for (let i = 0; i < MAX_DAILY_AWARDS; i++) s = applyAward(s, 'read_complete', day).state;
  const fourth = applyAward(s, 'read_complete', day);
  eq(fourth.awarded, 0, 'fourth plant of the day pays nothing');
  eq(fourth.state.xp, 30, 'xp untouched by the refused plant');

  const close = applyAward(s, 'thesis_closed', day);
  eq(close.awarded, AWARD_POINTS.thesis_closed, 'a close pays after the cap is spent');
  eq(close.state.xp, 45, 'close xp lands on top of the day');
  eq(close.state.dailyAwards, MAX_DAILY_AWARDS, 'a close does not consume the plant cap');
  const plantAfterClose = applyAward(close.state, 'no_trade_respected', day);
  eq(plantAfterClose.awarded, 0, 'the cap still holds for plants after a close');
}

// ---------- streak on a close ----------
{
  const s: ProgressCounters = { xp: 100, streak: 4, lastDay: '2026-09-04', dailyAwards: 3, dailyAwardsDay: '2026-09-04' };
  const next = applyAward(s, 'thesis_closed', new Date('2026-09-05T12:00:00Z'));
  eq(next.awarded, 15, 'close on a new day pays');
  eq(next.state.streak, 5, 'returning to review grows the streak');
  eq(next.state.dailyAwards, 0, 'new day, plant counter reset without consuming a slot');
  eq(next.state.dailyAwardsDay, '2026-09-05', 'counter day moves with the close');
  const later = applyAward(next.state, 'read_complete', new Date('2026-09-05T13:00:00Z'));
  eq(later.state.dailyAwards, 1, 'the next plant is the first of the day');
}

// ---------- review window ----------
{
  eq(THESIS_REVIEW_HOURS, 24, 'review window is one day');
  eq(reviewAt('2026-09-04T10:00:00.000Z'), '2026-09-05T10:00:00.000Z', 'reviewAt = seeded + window');
}

// ---------- verdicts ----------
{
  const long: Thesis = { symbol: 'BTC', isEquity: false, direction: 'long', price: 100, entry: 100, stop: 90, target: 120 };
  eq(resolveThesis(long, 125).outcome, 'hit', 'long past target = hit');
  eq(resolveThesis(long, 88).outcome, 'invalidated', 'long past stop = invalidated');
  eq(resolveThesis(long, 105).outcome, 'expired', 'long between levels = expired');
  eq(resolveThesis(long, 105).movePct, 5, 'move is measured from the entry');
  eq(resolveThesis(long, 100).movePct, 0, 'flat move is zero');

  const short: Thesis = { symbol: 'ETH', isEquity: false, direction: 'short', price: 200, entry: 200, stop: 210, target: 170 };
  eq(resolveThesis(short, 165).outcome, 'hit', 'short past target = hit');
  eq(resolveThesis(short, 215).outcome, 'invalidated', 'short past stop = invalidated');
  eq(resolveThesis(short, 190).outcome, 'expired', 'short between levels = expired');
  eq(resolveThesis(short, 190).movePct, -5, 'short move keeps the price sign');

  const noEntry: Thesis = { ...long, entry: null };
  eq(resolveThesis(noEntry, 125).referencePx, 100, 'price at read stands in for a missing entry');
  eq(resolveThesis(noEntry, 125).outcome, 'hit', 'verdict still works off the read price');

  const wrongSide: Thesis = { ...long, stop: 110 };
  eq(resolveThesis(wrongSide, 95).outcome, 'expired', 'a stop above a long entry is ignored, not trusted');
  const noLevels: Thesis = { ...long, stop: null, target: null };
  eq(resolveThesis(noLevels, 140).outcome, 'expired', 'no levels = expired even on a big move');
  eq(resolveThesis(noLevels, 140).movePct, 40, 'the move is still reported');

  const none: Thesis = { ...long, direction: 'none' };
  eq(resolveThesis(none, 125).outcome, 'expired', 'no direction = expired');
  eq(resolveThesis(null, 125), { outcome: 'expired', referencePx: null, movePct: null }, 'no thesis (older seed) = expired, nothing to compare');
  eq(resolveThesis(long, null).outcome, 'expired', 'no price = expired (caller refuses before this in practice)');
}

// ---------- tolerant parsing ----------
{
  const ok = ThesisSchema.safeParse({ symbol: 'NVDA', isEquity: true, direction: 'long', price: 120.5, entry: 121, stop: 115, target: 130 });
  assert(ok.success, 'a full thesis parses');
  const dirty = ThesisSchema.safeParse({ symbol: 'NVDA', isEquity: 'yes', direction: 'sideways', price: -3, entry: 'x', stop: 0, target: Infinity });
  assert(dirty.success, 'a dirty thesis still parses');
  if (dirty.success) {
    eq(dirty.data.isEquity, false, 'bad isEquity falls back to false');
    eq(dirty.data.direction, 'none', 'bad direction falls back to none');
    eq([dirty.data.price, dirty.data.entry, dirty.data.stop, dirty.data.target], [null, null, null, null], 'bad levels become null');
  }
  assert(!ThesisSchema.safeParse({ symbol: 'btc' }).success, 'a lowercase symbol is rejected');
  eq(thesisFrom({ thesis: { symbol: 'SOL', direction: 'short', price: 50 } })?.symbol, 'SOL', 'thesisFrom reads meta.thesis');
  eq(thesisFrom({ other: 1 }), null, 'no thesis in meta = null');
  eq(thesisFrom(null), null, 'null meta = null');
}

// ---------- execution on Base ----------
{
  const readAt = '2026-09-04T10:00:00.000Z';
  const closeAt = '2026-09-05T12:00:00.000Z';
  const during = '2026-09-04T15:00:00.000Z';
  const swap = (tokenIn: string, tokenOut: string, at: string | null = during): SwapCandidate => ({ id: 'r1', txHash: '0xabc', tokenIn, tokenOut, at });
  const nvdaLong: Thesis = { symbol: 'NVDA', isEquity: true, direction: 'long', price: 120, entry: 120, stop: 110, target: 135 };
  const nvdaShort: Thesis = { ...nvdaLong, direction: 'short' };

  eq(swapAsset(swap('USDC', 'NVDAc')), { symbol: 'NVDAc', address: swapAsset(swap('USDC', 'NVDAc'))!.address, side: 'BUY' }, 'USDC → NVDAc is a BUY of NVDAc');
  eq(swapAsset(swap('NVDAc', 'USDC'))?.side, 'SELL', 'NVDAc → USDC is a SELL');
  eq(swapAsset(swap('WETH', 'cbBTC')), null, 'asset → asset is not an execution');
  eq(swapAsset(swap('USDC', 'USDT')), null, 'stable → stable is not an execution');
  eq(swapAsset(swap('USDC', 'DOGE')), null, 'unknown token is not an execution');

  assert(swapExecutesThesis(nvdaLong, swap('USDC', 'NVDAc'), readAt, closeAt), 'long NVDA executed by buying NVDAc');
  assert(!swapExecutesThesis(nvdaLong, swap('NVDAc', 'USDC'), readAt, closeAt), 'selling NVDAc does not execute a long');
  assert(swapExecutesThesis(nvdaShort, swap('NVDAc', 'USDC'), readAt, closeAt), 'short NVDA executed by selling NVDAc');
  assert(!swapExecutesThesis(nvdaLong, swap('USDC', 'AAPLc'), readAt, closeAt), 'another asset does not execute it');
  assert(!swapExecutesThesis(nvdaLong, swap('USDC', 'NVDAc', '2026-09-04T09:00:00.000Z'), readAt, closeAt), 'a swap before the read does not count');
  assert(!swapExecutesThesis(nvdaLong, swap('USDC', 'NVDAc', '2026-09-05T13:00:00.000Z'), readAt, closeAt), 'a swap after the review does not count');
  assert(!swapExecutesThesis(nvdaLong, swap('USDC', 'NVDAc', null), readAt, closeAt), 'a swap without a time does not count');
  assert(swapExecutesThesis(nvdaLong, swap('USDC', 'NVDAc', readAt), readAt, closeAt), 'the window is inclusive at the read');

  const ethLong: Thesis = { symbol: 'ETH', isEquity: false, direction: 'long', price: 3000, entry: null, stop: null, target: null };
  assert(swapExecutesThesis(ethLong, swap('USDC', 'WETH'), readAt, closeAt), 'an ETH thesis is executed by buying WETH (same contract)');
  assert(swapExecutesThesis(ethLong, swap('USDC', 'ETH'), readAt, closeAt), 'or native ETH');
  const btcShort: Thesis = { symbol: 'BTC', isEquity: false, direction: 'short', price: 60000, entry: null, stop: null, target: null };
  assert(swapExecutesThesis(btcShort, swap('cbBTC', 'USDC'), readAt, closeAt), 'a BTC short is executed by selling cbBTC');
  assert(!swapExecutesThesis({ ...ethLong, direction: 'none' }, swap('USDC', 'WETH'), readAt, closeAt), 'no direction, nothing to execute');
  assert(!swapExecutesThesis({ ...ethLong, symbol: 'SOL' }, swap('USDC', 'WETH'), readAt, closeAt), 'an asset Bobby cannot swap on Base is never executed');
  assert(!swapExecutesThesis({ ...ethLong, symbol: 'USDC' }, swap('USDC', 'WETH'), readAt, closeAt), 'a stablecoin thesis is never executed');
  eq(EXECUTION_BONUS, { xp: 10, aura: 4 }, 'execution bonus is 10 XP / 4 Aura');
}

// ---------- season collection ----------
{
  eq(SEASON.pieces.length, 6, 'season I has six pieces');
  eq(new Set(SEASON.pieces).size, 6, 'no piece repeats in the season');
  const fresh = seasonProgress([]);
  eq([fresh.earned, fresh.total, fresh.next, fresh.complete], [0, 6, SEASON.pieces[0], false], 'a fresh identity starts at the first piece');
  const routeOnly = seasonProgress([{ item_id: SEASON.pieces[0], source: 'route' }]);
  eq(routeOnly.earned, 0, 'a route piece with the same id does not count for the season');
  const two = seasonProgress([{ item_id: SEASON.pieces[0], source: 'season' }, { item_id: SEASON.pieces[2], source: 'season' }]);
  eq([two.earned, two.next], [2, SEASON.pieces[1]], 'gaps are filled first, in season order');
  eq(two.owned, [SEASON.pieces[0], SEASON.pieces[2]], 'owned lists season pieces in season order');
  const done = seasonProgress(SEASON.pieces.map((item_id) => ({ item_id, source: 'season' })));
  eq([done.earned, done.next, done.complete], [6, null, true], 'all six = complete, nothing next');
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
