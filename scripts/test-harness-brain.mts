import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseYahooDaily, parseOkxDaily, validateBars } from '../api/_lib/harness/bars.js';
import type { BarSeries, BarsRejection } from '../api/_lib/harness/bars.js';
import { assetFact, atr20Before, trueRange, sinceAsked } from '../api/_lib/harness/facts.js';
import type { AssetFact } from '../api/_lib/harness/facts.js';
import { POPULATION_PRIOR, pooledMean, personalEstimate, shouldSuppress, score, choose, timeWindow } from '../api/_lib/harness/policy.js';
import type { Kind, Outcome, ChainCandidate, MarketCandidate, TimeWindow } from '../api/_lib/harness/policy.js';

let checks = 0, failures = 0;
function check(name: string, fn: () => void): void {
  try { fn(); checks++; console.log(`ok - ${name}`); }
  catch (error) { failures++; console.error(`not ok - ${name}`, error); }
}
const DAY = 86_400_000;
const now = new Date('2026-10-07T01:00:00Z');
interface FactCase { name: string; input: { series: BarSeries; now: string }; expected: AssetFact }
interface PolicyCase { name: string; input: { op: string; kind: Kind; pooled: number; outcomes: Array<{ kind: Kind; useful: boolean; at: string }>; now: string; successes: number; failures: number; candidates: Array<Omit<ChainCandidate, 'askedAt'> & { askedAt: string }> }; expected: number | boolean | string | null }
interface WindowCase { name: string; input: { tz: string; visits: string[] }; expected: TimeWindow | null }
const golden = JSON.parse(readFileSync(new URL('../shared/harness/golden.json', import.meta.url), 'utf8')) as { v: number; assetFacts: FactCase[]; policy: PolicyCase[]; timeWindows: WindowCase[] };
assert.equal(golden.v, 1);
assert.ok(golden.assetFacts.length >= 6 && golden.policy.length >= 6 && golden.timeWindows.length >= 4);
for (const c of golden.assetFacts) check(`golden fact: ${c.name}`, () => assert.deepEqual(assetFact(c.input.series, c.input.series.bars, new Date(c.input.now)), c.expected));
for (const c of golden.policy) check(`golden policy: ${c.name}`, () => {
  const input = c.input;
  const outcomes = input.outcomes?.map(o => ({ ...o, at: new Date(o.at) }));
  const clock = new Date(input.now);
  let result: unknown;
  if (input.op === 'estimate') result = personalEstimate(input.kind, input.pooled, outcomes, clock);
  else if (input.op === 'suppress') result = shouldSuppress(input.kind, input.pooled, outcomes, clock);
  else if (input.op === 'pool') result = pooledMean(input.successes, input.failures);
  else if (input.op === 'choose') {
    const [chain, market] = input.candidates.map(candidate => ({ ...candidate, askedAt: new Date(candidate.askedAt) }));
    result = choose([chain as ChainCandidate, market as unknown as MarketCandidate])?.id;
  } else assert.fail('Unknown golden operation');
  assert.deepEqual(result, c.expected);
});
for (const c of golden.timeWindows) check(`golden time: ${c.name}`, () => assert.deepEqual(timeWindow(c.input.visits.map(d => new Date(d)), c.input.tz), c.expected));
function fixture(crypto = false): BarSeries { return structuredClone(golden.assetFacts[crypto ? 5 : 0].input.series); }
function rejection(reason: BarsRejection, mutate: (series: BarSeries) => void, crypto = false): void {
  check(`reject ${reason}${crypto ? ' crypto' : ''}`, () => { const s = fixture(crypto); mutate(s); assert.deepEqual(validateBars(s, now), { ok: false, reason }); assert.equal(assetFact(s, s.bars, now), null); });
}
rejection('too_few', s => { s.bars = s.bars.slice(-21); });
rejection('invalid_ohlc', s => { s.bars[2].close = NaN; });
rejection('unordered', s => { [s.bars[2], s.bars[3]] = [s.bars[3], s.bars[2]]; });
rejection('duplicate_day', s => { s.bars[2] = { ...s.bars[1] }; });
rejection('gap', s => { s.bars = s.bars.filter((_, i) => i !== 10); }, true);
rejection('gap', s => { s.bars[0].day = '2026-09-09'; s.bars[1].day = '2026-09-10'; s.bars[0].closedAt = '2026-09-10T00:00:00Z'; s.bars[1].closedAt = '2026-09-11T00:00:00Z'; });
rejection('stale', s => { s.bars.at(-1)!.closedAt = '2026-10-08T00:00:00Z'; });
rejection('extreme_move', s => { Object.assign(s.bars.at(-1)!, { close: 200, high: 200 }); });
rejection('extreme_move', s => { Object.assign(s.bars.at(-1)!, { close: 200, high: 200 }); }, true);
rejection('corporate_action', s => { s.corporateActionDays = [s.bars[10].day]; });
for (const value of [0, -1, Infinity, NaN]) rejection('invalid_ohlc', s => { s.bars[2].open = value; });
rejection('invalid_ohlc', s => { s.bars[2].high = 99; });
rejection('invalid_ohlc', s => { s.bars[2].low = 101; });
rejection('invalid_ohlc', s => { s.bars[2].day = '2026-02-30'; });
rejection('invalid_ohlc', s => { s.bars[2].volume = -1; });
rejection('stale', s => { s.bars[2].closedAt = '2026-09-17'; });
rejection('stale', s => { s.fetchedAt = '2026-10-08T00:00:00Z'; });
rejection('stale', s => { s.bars[2].closedAt = '2026-09-17T01:00:00Z'; }, true);
check('freshness inclusive boundary and one millisecond after', () => {
  for (const crypto of [false, true]) {
    const s = fixture(crypto), end = Date.parse(s.bars.at(-1)!.closedAt), limit = crypto ? 30 * 3600_000 : 4 * DAY;
    assert.equal(validateBars(s, new Date(end + limit)).ok, true);
    assert.deepEqual(validateBars(s, new Date(end + limit + 1)), { ok: false, reason: 'stale' });
  }
});
check('five calendar days equity gap allowed', () => { const s = fixture(); s.bars[0].day = '2026-09-10'; s.bars[0].closedAt = '2026-09-11T00:00:00Z'; assert.equal(validateBars(s, now).ok, true); });
check('gap and extreme close checks are limited to last 22', () => {
  const s = fixture(); Object.assign(s.bars[0], { day: '2026-08-01', closedAt: '2026-08-02T00:00:00Z', open: 1, high: 1, low: 1, close: 1 }); assert.equal(validateBars(s, now).ok, true);
});
check('missing volume remains unknown; no mutation', () => { const s = fixture(); s.bars[4].volume = null; const before = structuredClone(s); assert.equal(validateBars(s, now).ok, true); assetFact(s, s.bars, now); assert.deepEqual(s, before); });
check('22 completed bars suffice', () => { const s = fixture(); s.bars.shift(); assert.ok(assetFact(s, s.bars, now)); });
function withClose(close: number, crypto = false, halfRange = 1): AssetFact {
  const s = fixture(crypto); for (const b of s.bars) Object.assign(b, { open: 100, high: 100 + halfRange, low: 100 - halfRange, close: 100 });
  Object.assign(s.bars.at(-1)!, { close, high: Math.max(100 + halfRange, close), low: Math.min(100 - halfRange, close) });
  const fact = assetFact(s, s.bars, now); assert.ok(fact); return fact;
}
for (const [name, close, expected] of [['below', 102.999999, false], ['exact', 103, true], ['above', 103.000001, true]] as const) {
  check(`move ATR boundary up ${name}`, () => assert.equal(withClose(close).unusualMove, expected));
  check(`move ATR boundary down ${name}`, () => assert.equal(withClose(200 - close).unusualMove, expected));
}
for (const crypto of [false, true]) for (const delta of [-0.000001, 0, 0.000001]) {
  check(`percentage floor ${crypto ? 'crypto' : 'equity'} ${delta}`, () => { const floor = crypto ? 2 : 1; assert.equal(withClose(100 + floor + delta, crypto, 0.1).unusualMove, delta >= 0); });
  check(`percentage floor down ${crypto ? 'crypto' : 'equity'} ${delta}`, () => { const floor = crypto ? 2 : 1; assert.equal(withClose(100 - floor - delta, crypto, 0.1).unusualMove, delta >= 0); });
}
for (const [name, delta] of [['below', -0.000001], ['exact', 0], ['above', 0.000001]] as const) {
  check(`range above boundary ${name}`, () => assert.equal(withClose(101 + 0.1 * 2 + delta).outsideRange, delta > 0 ? 'above' : null));
  check(`range below boundary ${name}`, () => assert.equal(withClose(99 - 0.1 * 2 - delta).outsideRange, delta > 0 ? 'below' : null));
}
check('newest OHLC never enters its own ATR or range', () => {
  const s = fixture(), baseline = assetFact(s, s.bars, now)!;
  Object.assign(s.bars.at(-1)!, { open: 105, high: 130, low: 70, close: 103 });
  const fact = assetFact(s, s.bars, now)!;
  assert.equal(fact.atr20, baseline.atr20); assert.equal(fact.rangeHigh20, baseline.rangeHigh20); assert.equal(fact.rangeLow20, baseline.rangeLow20);
});
check('true range includes previous close across a gap', () => { const b = fixture().bars[0]; assert.equal(trueRange(b, 95), 6); assert.equal(trueRange(b, 105), 6); assert.equal(trueRange(b, NaN), null); });
check('zero ATR and insufficient prior close fail closed', () => {
  const s = fixture(); for (const b of s.bars) Object.assign(b, { open: 100, high: 100, low: 100, close: 100, volume: 0 });
  assert.equal(atr20Before(s.bars, 20), null); assert.equal(atr20Before(s.bars, 22), null); assert.equal(assetFact(s, s.bars, now), null); assert.equal(atr20Before(s.bars, 23), null);
});
check('a prior close outside the raw range cannot enter again inside its buffer', () => {
  const s = fixture(); Object.assign(s.bars[21], { close: 101.1, high: 101.1 }); Object.assign(s.bars[22], { close: 102, high: 102 }); const f = assetFact(s, s.bars, now)!; assert.equal(f.outsideRange, 'above'); assert.equal(f.outsideRangeEntered, false);
});
check('since asked uses close and strict time/percentage bounds', () => {
  const fact = withClose(103); const close = new Date(fact.closedAt);
  assert.deepEqual(sinceAsked(100, new Date(close.getTime() - 1), fact), { pct: fact.changePct, basis: 'close', day: fact.day });
  for (const date of [close, new Date(close.getTime() + 1), new Date(NaN)]) assert.equal(sinceAsked(100, date, fact), null);
  for (const price of [0, -1, NaN, Infinity, fact.close / 11]) assert.equal(sinceAsked(price, new Date(close.getTime() - 1), fact), null);
  assert.ok(sinceAsked(fact.close / 10.999, new Date(close.getTime() - 1), fact));
});

function yahooInput(): { chart: { result: Array<{ meta: Record<string, unknown>; timestamp: number[]; indicators: { quote: Array<Record<string, unknown>>; adjclose: unknown }; tradingPeriods: unknown; events?: unknown }>; error: null } } {
  const s = fixture(), sessions = s.bars.map(b => { const ms = Date.parse(`${b.day}T00:00:00Z`); return { start: (ms + 13.5 * 3600_000) / 1000, end: (ms + 20 * 3600_000) / 1000 }; });
  return { chart: { error: null, result: [{ meta: { symbol: 'TEST', exchangeTimezoneName: 'America/New_York', currency: 'USD', exchangeName: 'NMS', dataGranularity: '1d', currentTradingPeriod: { regular: sessions.at(-1) } }, timestamp: sessions.map(s => s.start), tradingPeriods: { regular: sessions.map(s => [s]) }, indicators: { quote: [{ open: s.bars.map(b => b.open), high: s.bars.map(b => b.high), low: s.bars.map(b => b.low), close: s.bars.map(b => b.close), volume: s.bars.map(b => b.volume) }], adjclose: [{ adjclose: s.bars.map(() => 1) }] } }] } };
}
check('Yahoo exchange day, raw OHLC, provenance and exact historical close', () => {
  const parsed = parseYahooDaily(yahooInput(), 'TEST', now)!; assert.ok(parsed); assert.equal(parsed.bars[0].day, '2026-09-14'); assert.equal(parsed.bars[0].closedAt, '2026-09-14T20:00:00.000Z'); assert.equal(parsed.bars[0].close, 100); assert.equal(parsed.currency, 'USD'); assert.equal(parsed.exchange, 'NMS'); assert.equal(validateBars(parsed, now).ok, true);
});
check('Yahoo excludes session until strictly after close', () => {
  const input = yahooInput(), end = Date.parse('2026-10-06T20:00:00Z');
  for (const offset of [-1, 0, 1]) assert.equal(parseYahooDaily(input, 'TEST', new Date(end + offset))!.bars.length, offset > 0 ? 23 : 22);
});
check('Yahoo exact early close from history is preserved', () => {
  const input = yahooInput(), r = input.chart.result[0];
  const periods = r.tradingPeriods as { regular: Array<Array<{ start: number; end: number }>> }; periods.regular[3][0].end -= 3 * 3600;
  assert.equal(parseYahooDaily(input, 'TEST', now)!.bars[3].closedAt, '2026-09-17T17:00:00.000Z');
});
// The real daily payload states no timetable for past sessions (checked against the live source on
// 2026-10-07). A past bar stamped at the regular opening time closed one regular session later;
// a bar stamped at any other time is not understood.
check('Yahoo without past timetables: a bar at the regular open closes one regular session later', () => {
  const input = yahooInput(); const full = parseYahooDaily(input, 'TEST', now);
  input.chart.result[0].tradingPeriods = undefined;
  const derived = parseYahooDaily(input, 'TEST', now);
  assert.ok(full && derived);
  assert.deepEqual(derived.bars.map(b => [b.day, b.closedAt]), full.bars.map(b => [b.day, b.closedAt]));
});
check('Yahoo without past timetables: a past bar stamped off the regular open gives no series', () => {
  const input = yahooInput(); input.chart.result[0].tradingPeriods = undefined;
  input.chart.result[0].timestamp[3] += 45 * 60;
  assert.equal(parseYahooDaily(input, 'TEST', now), null);
});
check('Yahoo split evidence reaches corporate-action rejection', () => {
  const input = yahooInput(); input.chart.result[0].events = { splits: { event: { date: input.chart.result[0].timestamp[10], numerator: 1, denominator: 2 } } };
  const s = parseYahooDaily(input, 'TEST', now)!; assert.deepEqual(validateBars(s, now), { ok: false, reason: 'corporate_action' }); assert.equal(assetFact(s, s.bars, now), null);
});
check('Yahoo split outside window does not contaminate it', () => { const input = yahooInput(); input.chart.result[0].events = { splits: { event: { date: 1 } } }; assert.equal(validateBars(parseYahooDaily(input, 'TEST', now)!, now).ok, true); });
for (const [name, mutate] of [
  ['instrument mismatch', (r: ReturnType<typeof yahooInput>['chart']['result'][number]) => { r.meta.symbol = 'OTHER'; }],
  ['unknown timezone', (r: ReturnType<typeof yahooInput>['chart']['result'][number]) => { r.meta.exchangeTimezoneName = 'Mars/Olympus'; }],
  ['intraday granularity', (r: ReturnType<typeof yahooInput>['chart']['result'][number]) => { r.meta.dataGranularity = '1h'; }],
  ['missing OHLC', (r: ReturnType<typeof yahooInput>['chart']['result'][number]) => { r.indicators.quote[0].close = []; }],
  ['null OHLC', (r: ReturnType<typeof yahooInput>['chart']['result'][number]) => { (r.indicators.quote[0].open as unknown[])[3] = null; }],
  ['bad timestamp', (r: ReturnType<typeof yahooInput>['chart']['result'][number]) => { r.timestamp[3] = NaN; }],
  ['timestamp outside session', (r: ReturnType<typeof yahooInput>['chart']['result'][number]) => { r.timestamp[3] -= 12 * 3600; }],
  ['malformed splits', (r: ReturnType<typeof yahooInput>['chart']['result'][number]) => { r.events = { splits: { x: {} } }; }],
] as const) check(`Yahoo rejects ${name}`, () => { const input = yahooInput(); mutate(input.chart.result[0]); assert.equal(parseYahooDaily(input, 'TEST', now), null); });
check('Yahoo unsorted and duplicate days are never silently repaired', () => {
  const input = yahooInput(); [input.chart.result[0].timestamp[2], input.chart.result[0].timestamp[3]] = [input.chart.result[0].timestamp[3], input.chart.result[0].timestamp[2]];
  assert.deepEqual(validateBars(parseYahooDaily(input, 'TEST', now)!, now), { ok: false, reason: 'unordered' });
  input.chart.result[0].timestamp[3] = input.chart.result[0].timestamp[2]; assert.deepEqual(validateBars(parseYahooDaily(input, 'TEST', now)!, now), { ok: false, reason: 'duplicate_day' });
});
function okxInput(): { code: string; data: string[][] } { return { code: '0', data: fixture(true).bars.map(b => [String(Date.parse(`${b.day}T00:00:00Z`)), String(b.open), String(b.high), String(b.low), String(b.close), String(b.volume), '100', '10000', '1']).reverse() }; }
check('OKX reverses newest first and preserves UTC close and quote currency', () => { const s = parseOkxDaily(okxInput(), 'BTC-USDT', now)!; assert.deepEqual(s.bars, fixture(true).bars); assert.equal(s.currency, 'USDT'); assert.equal(validateBars(s, now).ok, true); });
check('OKX drops unconfirmed row without reading its unfinished OHLC', () => { const input = okxInput(); input.data.unshift(['broken', '', '', '', '', '', '', '', '0']); assert.equal(parseOkxDaily(input, 'BTC-USDT', now)!.bars.length, 23); });
for (const [name, mutate] of [
  ['local daily boundary', (p: ReturnType<typeof okxInput>) => { p.data[0][0] = String(Number(p.data[0][0]) + 8 * 3600_000); }],
  ['seconds timestamp', (p: ReturnType<typeof okxInput>) => { p.data[0][0] = String(Number(p.data[0][0]) / 1000); }],
  ['blank price', (p: ReturnType<typeof okxInput>) => { p.data[0][1] = ''; }],
  ['numeric confirm', (p: ReturnType<typeof okxInput>) => { (p.data[0] as unknown[])[8] = 1; }],
  ['missing confirm', (p: ReturnType<typeof okxInput>) => { p.data[0].pop(); }],
  ['bad code', (p: ReturnType<typeof okxInput>) => { p.code = '500'; }],
  ['mixed order', (p: ReturnType<typeof okxInput>) => { [p.data[2], p.data[3]] = [p.data[3], p.data[2]]; }],
  ['duplicate day', (p: ReturnType<typeof okxInput>) => { p.data[2] = [...p.data[3]]; }],
  ['confirmed future', (p: ReturnType<typeof okxInput>) => { p.data[0][0] = String(Date.parse('2026-10-07T00:00:00Z')); }],
] as const) check(`OKX rejects ${name}`, () => { const input = okxInput(); mutate(input); assert.equal(parseOkxDaily(input, 'BTC-USDT', now), null); });
check('OKX derivative identity is not silently treated as spot', () => assert.equal(parseOkxDaily(okxInput(), 'BTC-USDT-SWAP', now), null));
check('parsers fail closed on missing/error payloads and invalid time', () => { for (const payload of [null, {}, [], { chart: { error: {} } }]) { assert.equal(parseYahooDaily(payload, 'TEST', now), null); assert.equal(parseOkxDaily(payload, 'BTC-USDT', now), null); } assert.equal(parseOkxDaily(okxInput(), 'BTC-USDT', new Date(NaN)), null); assert.equal(parseYahooDaily(yahooInput(), 'TEST', new Date(NaN)), null); });
check('source and calendar cannot be mixed', () => { const s = fixture(true); s.source = 'yahoo'; assert.equal(assetFact(s, s.bars, now), null); });

const outcome = (age: number, useful: boolean, kind: Kind = 'asset'): Outcome => ({ kind, useful, at: new Date(now.getTime() - age * DAY) });
check('population prior and invalid counts', () => { assert.deepEqual(POPULATION_PRIOR, { alpha: 1, beta: 9 }); assert.equal(pooledMean(0, 0), 0.1); for (const n of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) assert.equal(pooledMean(n, 0), null); });
check('maturity at 72 hours, not a provisional ignored message', () => { assert.equal(personalEstimate('asset', 0.1, [outcome(3 - 1 / DAY, false)], now), 0.1); assert.ok(personalEstimate('asset', 0.1, [outcome(3, false)], now)! < 0.1); });
check('personal decay only and kind separation', () => { assert.equal(personalEstimate('asset', 0.1, [outcome(60, true)], now), 1.25 / 10.25); assert.equal(personalEstimate('asset', 0.1, [outcome(60, true, 'sector')], now), 0.1); assert.equal(personalEstimate('asset', 0.1, [outcome(30000, true)], now), 0.1); });
check('future or invalid personal evidence never yields an estimate', () => { assert.equal(personalEstimate('asset', 0.1, [outcome(-1, true)], now), null); assert.equal(personalEstimate('asset', 2, [], now), null); assert.equal(personalEstimate('asset', 0.1, [{ kind: 'asset', useful: true, at: new Date(NaN) }], now), null); assert.equal(shouldSuppress('asset', 0.1, [outcome(-1, false)], now), false); });
check('suppression strict probability boundary with mature count', () => {
  const ten = Array.from({ length: 10 }, () => outcome(3, false)); assert.equal(shouldSuppress('asset', 0.1, ten, now), false);
  assert.equal(shouldSuppress('asset', 0.1, [...ten, outcome(3, false)], now), true);
  assert.equal(shouldSuppress('asset', 0, Array.from({ length: 100 }, () => outcome(3, false)), now), false);
});
check('all score constants and invalid evidence', () => { for (const [variant, value] of [['market', 2], ['asset', 1], ['sector', 0.7], ['week', 0.6]] as const) assert.equal(score({ variant, interest: 2, maxInterest: 4, p: 0.1 }), 0.5 * value * 0.6); for (const max of [0, -1, NaN, Infinity]) assert.equal(score({ variant: 'asset', interest: 1, maxInterest: max, p: 0.1 }), null); assert.equal(score({ variant: 'asset', interest: 5, maxInterest: 4, p: 0.1 }), null); });
check('one chain slot required in types and at runtime', () => {
  const chain: ChainCandidate = { id: 'chain', origin: 'chain', variant: 'asset', interest: 1, maxInterest: 1, p: 0.1, askedAt: now };
  const market: MarketCandidate = { ...chain, id: 'market', origin: 'market', variant: 'market' };
  assert.equal(choose([chain]), chain);
  assert.equal(choose([chain, market]), market);
  // @ts-expect-error A standalone market fact has no permitted slot.
  assert.equal(choose([market]), null);
  // @ts-expect-error There cannot be a second market replacement.
  assert.equal(choose([chain, market, market]), null);
  assert.equal(choose([{ ...chain, interest: NaN }, market]), null);
  assert.equal(choose([chain, { ...market, interest: 0.5, askedAt: new Date(now.getTime() + DAY) }]), chain);
});
check('window boundaries, even median, excluded 21:00', () => {
  for (const [hour, window] of [[9, '09-12'], [12, '12-17'], [17, '17-21']] as const) assert.deepEqual(timeWindow([1, 2, 3].map(d => new Date(`2026-10-0${d}T${String(hour).padStart(2, '0')}:00:00Z`)), 'UTC'), { window, hour });
  assert.equal(timeWindow([1, 2, 3].map(d => new Date(`2026-10-0${d}T21:00:00Z`)), 'UTC'), null);
  assert.deepEqual(timeWindow(['2026-10-01T09:00:00Z', '2026-10-02T09:00:00Z', '2026-10-03T10:00:00Z', '2026-10-04T11:00:00Z'].map(s => new Date(s)), 'UTC'), { window: '09-12', hour: 9.5 });
});
check('local days, not UTC days, determine evidence count', () => { assert.equal(timeWindow(['2026-10-01T00:00:00Z', '2026-10-01T02:00:00Z', '2026-10-02T00:00:00Z'].map(s => new Date(s)), 'America/Los_Angeles'), null); });
check('duplicate and invalid visit evidence', () => { const d = new Date('2026-10-01T10:00:00Z'); assert.equal(timeWindow([d, d, d], 'UTC'), null); assert.equal(timeWindow([d, new Date(NaN)], 'UTC'), null); assert.equal(timeWindow([d], ''), null); });
check('spring and autumn DST do not turn repeated hours into distinct days', () => { assert.equal(timeWindow(['2026-11-01T05:00:00Z', '2026-11-01T06:00:00Z', '2026-11-02T15:00:00Z'].map(s => new Date(s)), 'America/New_York'), null); });
check('Yahoo exchange-local day can differ from its UTC date', () => {
  const input = yahooInput(), r = input.chart.result[0];
  const periods = r.timestamp.map(ts => ({ start: ts - 17.5 * 3600, end: ts - 11.5 * 3600 }));
  r.timestamp = periods.map(s => s.start); r.tradingPeriods = { regular: periods.map(s => [s]) }; r.meta.currentTradingPeriod = { regular: periods.at(-1) }; r.meta.exchangeTimezoneName = 'Pacific/Auckland';
  const parsed = parseYahooDaily(input, 'TEST', now)!; assert.ok(parsed); assert.equal(parsed.bars[0].day, '2026-09-14'); assert.equal(new Date(r.timestamp[0] * 1000).toISOString().slice(0, 10), '2026-09-13');
});
check('Yahoo historical DST sessions keep their own exact close', () => {
  const input = yahooInput(), r = input.chart.result[0];
  const periods: Array<{ start: number; end: number }> = [];
  for (let ms = Date.parse('2026-10-05T00:00:00Z'); periods.length < 23; ms += DAY) {
    if ([0, 6].includes(new Date(ms).getUTCDay())) continue;
    const hour = ms >= Date.parse('2026-11-01T00:00:00Z') ? 14.5 : 13.5;
    periods.push({ start: (ms + hour * 3600_000) / 1000, end: (ms + (hour + 6.5) * 3600_000) / 1000 });
  }
  r.timestamp = periods.map(s => s.start); r.tradingPeriods = { regular: periods.map(s => [s]) }; r.meta.currentTradingPeriod = { regular: periods.at(-1) };
  const parsed = parseYahooDaily(input, 'TEST', new Date('2026-11-05T01:00:00Z'))!;
  assert.equal(parsed.bars.find(b => b.day === '2026-10-30')!.closedAt, '2026-10-30T20:00:00.000Z');
  assert.equal(parsed.bars.find(b => b.day === '2026-11-02')!.closedAt, '2026-11-02T21:00:00.000Z');
});
check('all candle readers and policy helpers preserve their inputs', () => {
  const yahoo = yahooInput(), okx = okxInput(), yahooBefore = structuredClone(yahoo), okxBefore = structuredClone(okx);
  parseYahooDaily(yahoo, 'TEST', now); parseOkxDaily(okx, 'BTC-USDT', now); assert.deepEqual(yahoo, yahooBefore); assert.deepEqual(okx, okxBefore);
  const visits = [1, 2, 3].map(d => new Date(`2026-10-0${d}T10:00:00Z`)), before = visits.map(d => d.getTime());
  timeWindow(visits, 'UTC'); assert.deepEqual(visits.map(d => d.getTime()), before);
});
check('historical close contradictions fail closed', () => {
  const input = yahooInput(), r = input.chart.result[0]; const periods = r.tradingPeriods as { regular: Array<Array<{ start: number; end: number }>> };
  periods.regular[22][0] = { ...periods.regular[22][0], end: periods.regular[22][0].end - 3600 };
  assert.equal(parseYahooDaily(input, 'TEST', now), null);
});
check('a wide wick is not automatically labelled a bad tick', () => {
  const s = fixture(); s.bars[5].high = 150;
  const f = assetFact(s, s.bars, now)!; assert.ok(f); assert.ok(f.atr20 > 2);
});
check('zero reported volume is not proof that an index bar is invalid', () => {
  const s = fixture(); for (const b of s.bars) b.volume = 0; assert.equal(validateBars(s, now).ok, true); assert.ok(assetFact(s, s.bars, now));
});
check('impossible close dates and mismatched session days are rejected', () => {
  const s = fixture(); s.bars[2].closedAt = '2026-02-30T20:00:00Z'; assert.deepEqual(validateBars(s, now), { ok: false, reason: 'stale' });
  s.bars[2].closedAt = '2026-10-06T20:00:00Z'; assert.deepEqual(validateBars(s, now), { ok: false, reason: 'stale' });
});
console.log(`${checks} checks passed; ${failures} failed`);
if (failures) process.exitCode = 1;
