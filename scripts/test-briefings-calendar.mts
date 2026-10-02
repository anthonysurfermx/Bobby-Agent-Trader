// Briefings calendar (api/_lib/briefings/calendar.ts) — pure, no network, no database:
//   · 08:00 New York is 12:00 UTC in summer and 13:00 UTC in winter; never a fixed offset;
//   · DST transitions 2026 (Mar 8, Nov 1) and 2027 (Mar 14, Nov 7): morning and weekly periods spanning them
//     have the exact elapsed hours (23/25 and 167/169); nyLocalToUtc resolves the gap forward and the overlap
//     to its first occurrence;
//   · the NYSE calendar: every 2026 holiday is closed, observed dates, Good Friday, early closes (close report at
//     13:15 NY), weekends labelled closed with the last session date, nothing scheduled outside coverage;
//   · duePeriods is a function of the instant: window edges, identical results on duplicate ticks;
//   · scheduleSummary: only morning adopted by default.
import assert from 'node:assert/strict';

const cal = await import('../api/_lib/briefings/calendar.ts');
const {
  NYSE_CALENDAR, NYSE_CALENDAR_VERSION, POLICY_VERSION, schedulePolicy, nyParts, nyLocalToUtc, addDays, weekdayOf,
  isSessionDay, equitySession, periodForDate, duePeriods, periodFor, nextScheduled, scheduleSummary,
} = cal;

let checks = 0;
const eq = (got: unknown, want: unknown, what: string) => { assert.deepEqual(got, want, what); checks++; };
const ok = (v: unknown, what: string) => { assert.ok(v, what); checks++; };

const utc = (s: string) => new Date(s);
const hoursBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 3_600_000;

const DEFAULT = schedulePolicy({} as NodeJS.ProcessEnv);
const ALL = { adopted: new Set(['morning', 'close', 'weekly'] as const), morningDays: 'all' as const };
const SESSIONS = { adopted: new Set(['morning'] as const), morningDays: 'sessions' as const };

// ---- policy from env ----
eq([...DEFAULT.adopted], ['morning'], 'only morning is adopted by default');
eq(DEFAULT.morningDays, 'all', 'morning runs every day by default');
const envPolicy = schedulePolicy({ BOBBY_BRIEFINGS_CADENCES: 'morning, weekly,bogus', BOBBY_BRIEFINGS_MORNING_DAYS: 'sessions' } as NodeJS.ProcessEnv);
eq([[...envPolicy.adopted].sort(), envPolicy.morningDays], [['morning', 'weekly'], 'sessions'], 'env adopts known cadences only');

// ---- wall clock ----
eq(nyLocalToUtc('2026-07-15', '08:00').toISOString(), '2026-07-15T12:00:00.000Z', '08:00 NY = 12:00 UTC in summer');
eq(nyLocalToUtc('2026-01-15', '08:00').toISOString(), '2026-01-15T13:00:00.000Z', '08:00 NY = 13:00 UTC in winter');
eq(nyParts(utc('2026-07-15T12:00:00Z')), { date: '2026-07-15', time: '08:00', weekday: 3, hour: 8, minute: 0 }, 'nyParts summer');
eq(nyParts(utc('2026-01-01T04:59:00Z')), { date: '2025-12-31', time: '23:59', weekday: 3, hour: 23, minute: 59 }, 'nyParts across the UTC date line');
eq(nyParts(utc('2026-01-01T05:00:00Z')).time, '00:00', 'midnight is 00:00, never 24:00');
eq([addDays('2026-12-31', 1), addDays('2026-03-01', -1), addDays('2028-02-28', 1)], ['2027-01-01', '2026-02-28', '2028-02-29'], 'addDays');
eq([weekdayOf('2026-03-08'), weekdayOf('2026-10-03')], [0, 6], 'weekdayOf');
assert.throws(() => nyLocalToUtc('2026-02-30', '08:00'), RangeError); checks++;
assert.throws(() => nyLocalToUtc('2026-02-10', '8:00'), RangeError); checks++;

// DST gap (spring forward) and overlap (fall back).
eq(nyLocalToUtc('2026-03-08', '02:30').toISOString(), '2026-03-08T07:30:00.000Z', '2026 gap 02:30 moves forward to 03:30 EDT');
eq(nyParts(nyLocalToUtc('2026-03-08', '02:30')).time, '03:30', 'gap resolves to 03:30 local');
eq(nyLocalToUtc('2026-03-08', '01:59').toISOString(), '2026-03-08T06:59:00.000Z', 'just before the gap is still EST');
eq(nyLocalToUtc('2026-03-08', '03:00').toISOString(), '2026-03-08T07:00:00.000Z', 'right after the gap is EDT');
eq(nyLocalToUtc('2026-11-01', '01:30').toISOString(), '2026-11-01T05:30:00.000Z', '2026 overlap 01:30 takes the first (EDT) occurrence');
eq(nyLocalToUtc('2027-03-14', '02:00').toISOString(), '2027-03-14T07:00:00.000Z', '2027 gap 02:00 moves forward to 03:00 EDT');
eq(nyLocalToUtc('2027-11-07', '01:00').toISOString(), '2027-11-07T05:00:00.000Z', '2027 overlap 01:00 takes the first occurrence');

// ---- DST: morning and weekly periods spanning the transitions ----
const transitions: Array<[string, number, number, string, string]> = [
  // [transition Sunday, morning hours, weekly hours, morning UTC before, morning UTC after]
  ['2026-03-08', 23, 167, '2026-03-07T13:00:00.000Z', '2026-03-08T12:00:00.000Z'],
  ['2026-11-01', 25, 169, '2026-10-31T12:00:00.000Z', '2026-11-01T13:00:00.000Z'],
  ['2027-03-14', 23, 167, '2027-03-13T13:00:00.000Z', '2027-03-14T12:00:00.000Z'],
  ['2027-11-07', 25, 169, '2027-11-06T12:00:00.000Z', '2027-11-07T13:00:00.000Z'],
];
for (const [day, mHours, wHours, before, after] of transitions) {
  const m = periodForDate('morning', day, ALL)!;
  eq([m.periodKey, m.periodStart, m.periodEnd, m.scheduledAt], [day, before, after, after], `morning ${day} interval`);
  eq(hoursBetween(m.periodStart, m.periodEnd), mHours, `morning ${day} spans ${mHours}h`);
  const w = periodForDate('weekly', day, ALL)!;
  eq(w.periodKey, `${addDays(day, -7)}_${day}`, `weekly key ending ${day}`);
  eq(hoursBetween(w.periodStart, w.periodEnd), wHours, `weekly ending ${day} spans ${wHours}h`);
  eq([nyParts(utc(w.periodStart)).time, nyParts(utc(w.periodEnd)).time], ['18:00', '18:00'], `weekly ${day} cut at 18:00 NY both ends`);
}
eq(hoursBetween(periodForDate('weekly', '2026-07-12', ALL)!.periodStart, periodForDate('weekly', '2026-07-12', ALL)!.periodEnd), 168, 'a week without DST is 168h');

// ---- morning period shape ----
const m1 = periodForDate('morning', '2026-10-02', ALL)!;
eq(m1, {
  cadence: 'morning',
  periodKey: '2026-10-02',
  periodStart: '2026-10-01T12:00:00.000Z',
  periodEnd: '2026-10-02T12:00:00.000Z',
  scheduledAt: '2026-10-02T12:00:00.000Z',
  prepareFrom: '2026-10-02T11:30:00.000Z',
  readyBy: '2026-10-02T11:59:00.000Z',
  pushExpiresAt: '2026-10-02T12:30:00.000Z',
  calendarVersion: NYSE_CALENDAR_VERSION,
  policyVersion: POLICY_VERSION,
  equitySession: { date: '2026-10-02', state: 'pre_market', lastSessionDate: '2026-10-01', closeAt: '2026-10-02T20:00:00.000Z', earlyClose: false, holidayName: null },
}, 'morning period on a Friday session day');
eq([NYSE_CALENDAR_VERSION, POLICY_VERSION], ['nyse-2026-2027-v1', 'proposed-v1'], 'versions');

// Saturday morning: equities closed_weekend, last session Friday.
const sat = periodForDate('morning', '2026-10-03', ALL)!;
eq([sat.equitySession.state, sat.equitySession.lastSessionDate, sat.equitySession.closeAt], ['closed_weekend', '2026-10-02', null], 'Saturday morning labels equities closed, last session Friday');
const holidayMorning = periodForDate('morning', '2026-07-03', ALL)!;
eq([holidayMorning.equitySession.state, holidayMorning.equitySession.holidayName, holidayMorning.equitySession.lastSessionDate],
  ['closed_holiday', 'Independence Day (observed)', '2026-07-02'], 'holiday morning labels equities closed_holiday');
eq(periodForDate('morning', '2028-03-01', ALL)!.equitySession.state, 'unknown', 'morning outside coverage: equities unknown');

// morningDays=sessions skips weekends and holidays.
eq(periodForDate('morning', '2026-10-03', SESSIONS), null, 'sessions: no Saturday morning');
eq(periodForDate('morning', '2026-10-04', SESSIONS), null, 'sessions: no Sunday morning');
eq(periodForDate('morning', '2026-11-26', SESSIONS), null, 'sessions: no Thanksgiving morning');
eq(periodForDate('morning', '2028-03-01', SESSIONS), null, 'sessions: no morning outside coverage');
ok(periodForDate('morning', '2026-11-27', SESSIONS), 'sessions: early-close day still has a morning');
eq(nextScheduled('morning', utc('2026-10-02T12:30:00Z'), SESSIONS)!.periodKey, '2026-10-05', 'sessions: Friday after 08:00 → next Monday');
eq(nextScheduled('morning', utc('2026-10-02T12:30:00Z'), DEFAULT)!.periodKey, '2026-10-03', 'all: Friday after 08:00 → Saturday');

// ---- NYSE calendar ----
const holidays2026 = ['2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25'];
eq(Object.keys(NYSE_CALENDAR.holidays).filter((d) => d.startsWith('2026')), holidays2026, 'the 2026 holiday list');
for (const d of holidays2026) {
  eq(isSessionDay(d), false, `${d} is not a session`);
  eq(equitySession(d).state, 'closed_holiday', `${d} labelled closed_holiday`);
  eq(periodForDate('close', d, ALL), null, `${d} has no close report`);
}
eq(equitySession('2026-04-03').holidayName, 'Good Friday', 'Good Friday 2026');
eq([isSessionDay('2027-03-26'), equitySession('2027-03-26').holidayName], [false, 'Good Friday'], 'Good Friday 2027');
eq([isSessionDay('2027-06-18'), equitySession('2027-06-18').holidayName], [false, 'Juneteenth (observed)'], 'Juneteenth observed 2027-06-18');
eq(isSessionDay('2027-06-17'), true, 'the day before observed Juneteenth trades');
eq(equitySession('2026-07-03').holidayName, 'Independence Day (observed)', 'Independence Day observed 2026-07-03');
eq(equitySession('2027-07-05').holidayName, 'Independence Day (observed)', 'Independence Day observed 2027-07-05');
eq(equitySession('2027-07-04').state, 'closed_weekend', 'July 4 2027 is a Sunday');
eq(isSessionDay('2027-12-31'), true, 'New Year 2028 (Saturday) is not observed on Friday 2027-12-31');
eq(isSessionDay('2027-12-24'), false, 'Christmas 2027 observed Friday Dec 24');
eq([isSessionDay('2028-01-03'), isSessionDay('2025-12-31')], [null, null], 'outside coverage is unknown');
eq(equitySession('2028-01-03'), { date: '2028-01-03', state: 'unknown', lastSessionDate: null, closeAt: null, earlyClose: false, holidayName: null }, 'unknown label');

// Early closes: close report at 13:15 NY.
for (const d of ['2026-11-27', '2026-12-24']) {
  const c = periodForDate('close', d, ALL)!;
  eq(nyParts(utc(c.scheduledAt)).time, '13:15', `${d} close report at 13:15 NY`);
  eq([nyParts(utc(c.periodStart)).time, nyParts(utc(c.periodEnd)).time, nyParts(utc(c.prepareFrom)).time, nyParts(utc(c.readyBy)).time, nyParts(utc(c.pushExpiresAt)).time],
    ['09:30', '13:00', '13:00', '13:14', '13:45'], `${d} close windows`);
  eq([c.equitySession.state, c.equitySession.earlyClose, c.equitySession.lastSessionDate], ['after_close', true, d], `${d} labelled after an early close`);
}
eq(periodForDate('close', '2026-11-27', ALL)!.scheduledAt, '2026-11-27T18:15:00.000Z', 'early close 13:15 EST = 18:15 UTC');
eq(periodForDate('close', '2027-11-26', ALL)!.periodEnd, '2027-11-26T18:00:00.000Z', '2027 early close 13:00 NY');

// A normal close.
const c1 = periodForDate('close', '2026-10-02', ALL)!;
eq([c1.periodKey, c1.periodStart, c1.periodEnd, c1.prepareFrom, c1.readyBy, c1.scheduledAt, c1.pushExpiresAt],
  ['2026-10-02', '2026-10-02T13:30:00.000Z', '2026-10-02T20:00:00.000Z', '2026-10-02T20:00:00.000Z', '2026-10-02T20:14:00.000Z', '2026-10-02T20:15:00.000Z', '2026-10-02T20:45:00.000Z'],
  'close: [09:30, 16:00] NY, scheduled 16:15');
eq(periodForDate('close', '2026-10-03', ALL), null, 'no close report on Saturday');
eq(periodForDate('close', '2028-03-01', ALL), null, 'no close report outside coverage (2028)');
eq(nextScheduled('close', utc('2027-12-31T22:00:00Z'), ALL), null, 'after the last covered close: nothing scheduled');
eq(nextScheduled('close', utc('2026-11-25T22:00:00Z'), ALL)!.periodKey, '2026-11-27', 'next close skips Thanksgiving');

// equitySession timeline on a session day.
eq(equitySession('2026-10-02', utc('2026-10-02T13:29:59Z')).state, 'pre_market', '09:29:59 NY pre_market');
eq(equitySession('2026-10-02', utc('2026-10-02T13:30:00Z')).state, 'open', '09:30 NY open');
eq(equitySession('2026-10-02', utc('2026-10-02T19:59:59Z')).state, 'open', '15:59:59 NY open');
eq(equitySession('2026-10-02', utc('2026-10-02T20:00:00Z')).lastSessionDate, '2026-10-02', 'after the close the date itself is the last session');
eq(equitySession('2026-10-05').lastSessionDate, '2026-10-02', 'Monday pre-market: last session Friday');

// ---- weekly across the year boundary ----
const yb = periodForDate('weekly', '2027-01-03', ALL)!;
eq([yb.periodKey, yb.periodStart, yb.periodEnd, yb.scheduledAt, yb.prepareFrom, yb.readyBy, yb.pushExpiresAt],
  ['2026-12-27_2027-01-03', '2026-12-27T23:00:00.000Z', '2027-01-03T23:00:00.000Z', '2027-01-03T23:00:00.000Z',
    '2027-01-03T22:30:00.000Z', '2027-01-03T22:59:00.000Z', '2027-01-03T23:30:00.000Z'], 'weekly 2026-12-27 → 2027-01-03');
eq([yb.equitySession.state, yb.equitySession.lastSessionDate], ['closed_weekend', '2026-12-31'], 'weekly label: last session Dec 31 (Jan 1 holiday)');
eq(periodForDate('weekly', '2027-01-02', ALL), null, 'weekly only on Sundays');

// ---- duePeriods: window edges and idempotence (Friday 2026-10-02, EDT) ----
const at = (ny: string) => nyLocalToUtc('2026-10-02', ny.slice(0, 5)).getTime() + Number(ny.slice(6) || 0) * 1000;
const due = (ms: number, p = DEFAULT) => duePeriods(new Date(ms), p).map((d) => [d.period.cadence, d.period.periodKey, d.phase]);
eq(due(at('07:29:59')), [], '07:29:59 → nothing');
eq(due(at('07:30')), [['morning', '2026-10-02', 'prepare']], '07:30 → prepare');
eq(due(at('07:59:59')), [['morning', '2026-10-02', 'prepare']], '07:59:59 → prepare');
eq(due(at('08:00')), [['morning', '2026-10-02', 'dispatch']], '08:00 → dispatch');
eq(due(at('08:29:59')), [['morning', '2026-10-02', 'dispatch']], '08:29:59 → dispatch');
eq(due(at('08:30')), [], '08:30 → nothing (push expired)');
eq(duePeriods(new Date(at('07:45')), DEFAULT), duePeriods(new Date(at('07:45')), DEFAULT), 'duplicate ticks compute identical periods');
eq(duePeriods(new Date(at('07:45')), DEFAULT)[0].period, m1, 'the due period is the canonical one');
eq(periodFor('morning', new Date(at('08:10')), DEFAULT)!.periodKey, '2026-10-02', 'periodFor inside the window');
eq(periodFor('morning', new Date(at('09:00')), DEFAULT), null, 'periodFor outside the window');
eq(due(at('16:00')), [], 'close not adopted by default → nothing at 16:00');
eq(due(at('15:59:59'), ALL), [], '15:59:59 with close adopted → nothing');
eq(due(at('16:00'), ALL), [['close', '2026-10-02', 'prepare']], '16:00 → close prepare');
eq(due(at('16:15'), ALL), [['close', '2026-10-02', 'dispatch']], '16:15 → close dispatch');
eq(due(at('16:45'), ALL), [], '16:45 → close expired');
const sun = (ny: string) => new Date(nyLocalToUtc('2026-10-04', ny).getTime());
eq(duePeriods(sun('17:30'), ALL).map((d) => [d.period.cadence, d.period.periodKey, d.phase]), [['weekly', '2026-09-27_2026-10-04', 'prepare']], 'Sunday 17:30 → weekly prepare');
eq(duePeriods(sun('18:00'), ALL).map((d) => d.phase), ['dispatch'], 'Sunday 18:00 → weekly dispatch');
eq(duePeriods(sun('18:30'), ALL), [], 'Sunday 18:30 → weekly expired');
eq(duePeriods(sun('18:00'), DEFAULT), [], 'weekly not adopted by default');
eq(duePeriods(sun('07:30'), SESSIONS), [], 'sessions policy: no Sunday morning prepare');
// Morning across DST: windows stay on NY wall clock.
eq(duePeriods(utc('2026-11-01T12:30:00Z'), DEFAULT).map((d) => d.phase), ['prepare'], 'Nov 1 2026 07:30 EST = 12:30 UTC → prepare');
eq(duePeriods(utc('2026-11-01T12:00:00Z'), DEFAULT), [], 'Nov 1 2026 12:00 UTC is 07:00 EST → nothing');
// Every 5-minute tick of a day yields each window exactly once per phase boundary (no gaps, no duplicates).
const seen = new Map<string, Set<string>>();
for (let ms = utc('2026-10-02T04:00:00Z').getTime(); ms < utc('2026-10-03T04:00:00Z').getTime(); ms += 5 * 60_000) {
  for (const d of duePeriods(new Date(ms), ALL)) {
    const k = `${d.period.cadence}:${d.period.periodKey}`;
    if (!seen.has(k)) seen.set(k, new Set());
    seen.get(k)!.add(d.phase);
  }
}
eq([...seen.entries()].map(([k, v]) => [k, [...v]]), [['morning:2026-10-02', ['prepare', 'dispatch']], ['close:2026-10-02', ['prepare', 'dispatch']]], 'a day of 5-min ticks sees each period in both phases');

// ---- scheduleSummary ----
const now = utc('2026-10-02T15:00:00Z'); // Friday 11:00 EDT
eq(scheduleSummary(now, DEFAULT), {
  timezone: 'America/New_York',
  policyVersion: 'proposed-v1',
  opening: { configured: true, localTime: '08:00', nextAt: '2026-10-03T12:00:00.000Z' },
  close: { configured: false, delayMinutes: 15, nextAt: null },
  weekly: { configured: false, weekday: 'Sunday', localTime: '18:00', nextAt: null },
}, 'default summary: only morning configured');
const full = scheduleSummary(now, ALL);
eq([full.close.configured, full.close.nextAt, full.weekly.configured, full.weekly.nextAt],
  [true, '2026-10-02T20:15:00.000Z', true, '2026-10-04T22:00:00.000Z'], 'all adopted: close today 16:15, weekly Sunday 18:00 EDT');
eq(nextScheduled('morning', utc('2026-10-02T12:00:00Z'), DEFAULT)!.periodKey, '2026-10-03', 'nextScheduled is strictly after now');
eq(nextScheduled('weekly', utc('2026-10-02T15:00:00Z'), DEFAULT), null, 'nextScheduled null for a non-adopted cadence');

console.log(`briefings-calendar: ${checks} checks passed`);
