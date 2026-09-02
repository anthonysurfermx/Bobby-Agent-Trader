#!/usr/bin/env -S npx tsx
// Unit test for the shared progress rules. Exit 0 = all green.
import assert from 'node:assert/strict';
import { applyAward, dayKey, daysBetween, MAX_DAILY_AWARDS, type ProgressCounters } from '../../api/_lib/progress-rules.js';

const fresh = (): ProgressCounters => ({ xp: 0, streak: 0, lastDay: null, dailyAwards: null as unknown as number, dailyAwardsDay: null });
const at = (iso: string) => new Date(iso);

// day key honours the device offset: 23:30 local in Mexico City is still that day
assert.equal(dayKey(at('2026-09-03T05:30:00Z'), 360), '2026-09-02');
assert.equal(dayKey(at('2026-09-03T05:30:00Z'), 0), '2026-09-03');
assert.equal(dayKey(at('2026-09-03T05:30:00Z'), 99_999), '2026-09-02'); // clamped to 14h
assert.equal(daysBetween('2026-09-01', '2026-09-03'), 2);

// points per kind
let s: ProgressCounters = { ...fresh(), dailyAwards: 0 };
let r = applyAward(s, 'read_complete', at('2026-09-01T12:00:00Z'));
assert.equal(r.awarded, 10); assert.equal(r.state.xp, 10); assert.equal(r.state.streak, 1);
r = applyAward(r.state, 'no_trade_respected', at('2026-09-01T13:00:00Z'));
assert.equal(r.awarded, 20); assert.equal(r.state.xp, 30); assert.equal(r.state.dailyAwards, 2);

// daily cap: third award ok, fourth rejected with awarded 0 and state untouched
r = applyAward(r.state, 'read_complete', at('2026-09-01T14:00:00Z'));
assert.equal(r.state.dailyAwards, MAX_DAILY_AWARDS);
const capped = applyAward(r.state, 'read_complete', at('2026-09-01T15:00:00Z'));
assert.equal(capped.awarded, 0); assert.deepEqual(capped.state, r.state);

// streak: next day grows, one skipped day holds, two skipped days reset
r = applyAward(r.state, 'read_complete', at('2026-09-02T12:00:00Z'));
assert.equal(r.state.streak, 2);
r = applyAward(r.state, 'read_complete', at('2026-09-04T12:00:00Z')); // skipped the 3rd
assert.equal(r.state.streak, 2, 'grace day holds the streak');
r = applyAward(r.state, 'read_complete', at('2026-09-07T12:00:00Z')); // skipped 5th and 6th
assert.equal(r.state.streak, 1, 'two missed days reset');
assert.equal(r.state.xp, 10 + 20 + 10 + 10 + 10 + 10);

// same day never changes the streak
const same = applyAward(r.state, 'read_complete', at('2026-09-07T20:00:00Z'));
assert.equal(same.state.streak, 1);

console.log('progress-rules: all assertions passed');
