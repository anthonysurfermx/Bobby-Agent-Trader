// ============================================================
// Bobby Pro market briefings — New York calendar and canonical periods (spec §2, §8 "calendar.ts").
// Pure and deterministic: no I/O, no clock reads (every function takes `now`), no fixed UTC offset anywhere.
// Wall-clock conversions go through Intl.DateTimeFormat('America/New_York'), so 08:00 New York stays 08:00
// across DST (12:00 UTC in summer, 13:00 UTC in winter).
//   · A period's identity is (cadence, periodKey) — calendarVersion and policyVersion are evidence only, so
//     correcting the calendar never produces a second report for the same period.
//   · duePeriods() is a function of the instant alone: duplicate or missed cron ticks recompute the same
//     canonical periods; a tick at or after pushExpiresAt no longer sees that period.
//   · Equities are never labelled live outside a configured core session; outside calendar coverage the
//     equity state is 'unknown' and the close cadence is not scheduled at all.
//   · Weekly: Monday 08:00 NY, with prior Monday 08:00 → current Monday 08:00 as the historical interval.
//     The briefing looks ahead to the coming week; historical quotes are explicitly labelled retrospective.
//     Daily/close helpers remain for stored data, but they cannot become scheduled work.
// ============================================================
import type { Cadence, EquitySessionState, Period } from './types.js';
import { CADENCES } from './types.js';
import { adoptedCadences, morningDays } from './config.js';

export const NY_TIMEZONE = 'America/New_York' as const;
export const NYSE_CALENDAR_VERSION = 'nyse-2026-2027-v1';
export const POLICY_VERSION = 'weekly-monday-0800-v1';

/**
 * NYSE holidays and early closes, coverage 2026-01-01 … 2027-12-31.
 * Verified 2026-10-02 against the official NYSE page https://www.nyse.com/trade/hours-calendars (read-only fetch):
 * every holiday, observed date and 1:00 p.m. early close below matches the published 2026 and 2027 tables, and the
 * core trading session is 9:30 a.m.–4:00 p.m. ET. New Year's Day 2028 falls on a Saturday and is not observed on
 * Friday 2027-12-31 (NYSE rule), so that date is a normal session. Extend coverage with a new version string.
 */
export const NYSE_CALENDAR = {
  version: NYSE_CALENDAR_VERSION,
  coverage: { from: '2026-01-01', to: '2027-12-31' },
  coreOpen: '09:30',
  coreClose: '16:00',
  holidays: {
    '2026-01-01': "New Year's Day",
    '2026-01-19': 'Martin Luther King, Jr. Day',
    '2026-02-16': "Washington's Birthday",
    '2026-04-03': 'Good Friday',
    '2026-05-25': 'Memorial Day',
    '2026-06-19': 'Juneteenth',
    '2026-07-03': 'Independence Day (observed)',
    '2026-09-07': 'Labor Day',
    '2026-11-26': 'Thanksgiving Day',
    '2026-12-25': 'Christmas Day',
    '2027-01-01': "New Year's Day",
    '2027-01-18': 'Martin Luther King, Jr. Day',
    '2027-02-15': "Washington's Birthday",
    '2027-03-26': 'Good Friday',
    '2027-05-31': 'Memorial Day',
    '2027-06-18': 'Juneteenth (observed)',
    '2027-07-05': 'Independence Day (observed)',
    '2027-09-06': 'Labor Day',
    '2027-11-25': 'Thanksgiving Day',
    '2027-12-24': 'Christmas Day (observed)',
  } as Readonly<Record<string, string>>,
  /** Session date → official close (NY local HH:MM). */
  earlyCloses: {
    '2026-11-27': '13:00',
    '2026-12-24': '13:00',
    '2027-11-26': '13:00',
  } as Readonly<Record<string, string>>,
} as const;

/** NY local windows. Preparation/readiness/expiry remain operational proposals; weekly delivery is confirmed. */
const WINDOWS = {
  morning: { prepare: '07:30', readyBy: '07:59', scheduled: '08:00', expires: '08:30' },
  close: { delayMinutes: 15, readyByBeforeMinutes: 1, expiresAfterMinutes: 30 },
  weekly: { prepare: '07:30', readyBy: '07:59', scheduled: '08:00', expires: '08:30' },
} as const;

export interface SchedulePolicy { adopted: Set<Cadence>; morningDays: 'all' | 'sessions' }

export function schedulePolicy(env: NodeJS.ProcessEnv = process.env): SchedulePolicy {
  return { adopted: adoptedCadences(env), morningDays: morningDays(env) };
}

// ---- New York wall clock ----

const nyFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: NY_TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
});
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

interface WallClock { y: number; mo: number; d: number; h: number; mi: number; s: number; weekday: number }

function wallClock(instant: Date): WallClock {
  const ms = instant.getTime();
  if (!Number.isFinite(ms)) throw new RangeError('calendar: invalid instant');
  const parts: Record<string, string> = {};
  for (const p of nyFormatter.formatToParts(instant)) parts[p.type] = p.value;
  return {
    y: Number(parts.year), mo: Number(parts.month), d: Number(parts.day),
    // Some ICU builds still print midnight as "24" even with h23.
    h: Number(parts.hour) % 24, mi: Number(parts.minute), s: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday],
  };
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** NY local date/time of an instant. weekday: 0 = Sunday … 6 = Saturday. */
export function nyParts(instant: Date): { date: string; time: string; weekday: number; hour: number; minute: number } {
  const w = wallClock(instant);
  return { date: `${w.y}-${pad(w.mo)}-${pad(w.d)}`, time: `${pad(w.h)}:${pad(w.mi)}`, weekday: w.weekday, hour: w.h, minute: w.mi };
}

function parseDate(date: string): { y: number; mo: number; d: number } {
  const m = DATE_RE.exec(date);
  if (!m) throw new RangeError(`calendar: invalid date ${JSON.stringify(date)}`);
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    throw new RangeError(`calendar: invalid date ${JSON.stringify(date)}`);
  }
  return { y, mo, d };
}

/** Offset (ms) of New York wall clock vs UTC at an instant, derived from Intl (never assumed). */
function nyOffsetMs(ms: number): number {
  const w = wallClock(new Date(ms));
  return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000;
}

/**
 * The UTC instant of a NY local date and time. DST-safe and deterministic:
 *   · an ambiguous local time (fall-back overlap) resolves to its first occurrence (daylight time);
 *   · a non-existent local time (spring-forward gap) moves forward by the gap (02:30 → 03:30 EDT).
 */
export function nyLocalToUtc(date: string, time: string): Date {
  const { y, mo, d } = parseDate(date);
  const t = TIME_RE.exec(time);
  if (!t) throw new RangeError(`calendar: invalid time ${JSON.stringify(time)}`);
  const h = Number(t[1]), mi = Number(t[2]);
  const localAsUtc = Date.UTC(y, mo - 1, d, h, mi);
  // The offsets in force a day either side bracket any transition on this date.
  const offsets = [...new Set([nyOffsetMs(localAsUtc - DAY_MS), nyOffsetMs(localAsUtc), nyOffsetMs(localAsUtc + DAY_MS)])];
  const candidates = offsets.map((off) => localAsUtc - off);
  const exact = candidates.filter((ms) => {
    const w = wallClock(new Date(ms));
    return w.y === y && w.mo === mo && w.d === d && w.h === h && w.mi === mi;
  });
  if (exact.length > 0) return new Date(Math.min(...exact));
  // Gap: interpreting with the pre-transition (standard) offset lands after the gap, i.e. moved forward.
  return new Date(Math.max(...candidates));
}

/** Calendar arithmetic on a NY local date string (no time zone involved). */
export function addDays(date: string, days: number): string {
  const { y, mo, d } = parseDate(date);
  const p = new Date(Date.UTC(y, mo - 1, d + days));
  return `${p.getUTCFullYear()}-${pad(p.getUTCMonth() + 1)}-${pad(p.getUTCDate())}`;
}

/** 0 = Sunday … 6 = Saturday, for a local date string. */
export function weekdayOf(date: string): number {
  const { y, mo, d } = parseDate(date);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

const addMinutes = (instant: Date, minutes: number): Date => new Date(instant.getTime() + minutes * MINUTE_MS);
const iso = (instant: Date): string => instant.toISOString();

// ---- NYSE sessions ----

export const inCalendarCoverage = (date: string): boolean =>
  date >= NYSE_CALENDAR.coverage.from && date <= NYSE_CALENDAR.coverage.to;

/** true/false inside coverage; null outside it (unknown — never guessed). */
export function isSessionDay(date: string): boolean | null {
  parseDate(date);
  if (!inCalendarCoverage(date)) return null;
  const wd = weekdayOf(date);
  if (wd === 0 || wd === 6) return false;
  return !Object.prototype.hasOwnProperty.call(NYSE_CALENDAR.holidays, date);
}

/** Official open/close of a session day (early closes respected); null when not a known session day. */
export function sessionHours(date: string): { openAt: Date; closeAt: Date; earlyClose: boolean } | null {
  if (isSessionDay(date) !== true) return null;
  const early = NYSE_CALENDAR.earlyCloses[date];
  return {
    openAt: nyLocalToUtc(date, NYSE_CALENDAR.coreOpen),
    closeAt: nyLocalToUtc(date, early ?? NYSE_CALENDAR.coreClose),
    earlyClose: early !== undefined,
  };
}

/** The latest session day strictly before `date`, or null when that would leave calendar coverage. */
function previousSessionDay(date: string): string | null {
  let d = addDays(date, -1);
  while (inCalendarCoverage(d)) {
    if (isSessionDay(d) === true) return d;
    d = addDays(d, -1);
  }
  return null;
}

/**
 * Equity session label for a NY date as seen at `now`. Without `now` the label is taken at the start of that
 * day (a session day is then 'pre_market'). A session day reads 'open' only inside [open, close).
 */
export function equitySession(date: string, now?: Date): EquitySessionState {
  parseDate(date);
  const base: EquitySessionState = { date, state: 'unknown', lastSessionDate: null, closeAt: null, earlyClose: false, holidayName: null };
  const session = isSessionDay(date);
  if (session === null) return base;
  if (!session) {
    const wd = weekdayOf(date);
    const holidayName = NYSE_CALENDAR.holidays[date] ?? null;
    return {
      ...base,
      state: wd === 0 || wd === 6 ? 'closed_weekend' : 'closed_holiday',
      holidayName,
      lastSessionDate: previousSessionDay(date),
    };
  }
  const hours = sessionHours(date)!;
  const at = now?.getTime() ?? Number.NEGATIVE_INFINITY;
  const state: EquitySessionState['state'] =
    at < hours.openAt.getTime() ? 'pre_market' : at < hours.closeAt.getTime() ? 'open' : 'after_close';
  return {
    ...base,
    state,
    closeAt: iso(hours.closeAt),
    earlyClose: hours.earlyClose,
    lastSessionDate: state === 'after_close' ? date : previousSessionDay(date),
  };
}

// ---- periods ----

function buildPeriod(
  cadence: Cadence, periodKey: string, start: Date, end: Date, scheduled: Date,
  prepareFrom: Date, readyBy: Date, expires: Date, labelDate: string,
): Period {
  return {
    cadence,
    periodKey,
    periodStart: iso(start),
    periodEnd: iso(end),
    scheduledAt: iso(scheduled),
    prepareFrom: iso(prepareFrom),
    readyBy: iso(readyBy),
    pushExpiresAt: iso(expires),
    calendarVersion: NYSE_CALENDAR_VERSION,
    policyVersion: POLICY_VERSION,
    equitySession: equitySession(labelDate, scheduled),
  };
}

/**
 * The canonical period whose push is scheduled on NY date `date`, or null when that cadence has none that day.
 * Calendar only: adoption is not checked here (duePeriods / nextScheduled / periodFor apply it), so a stored
 * period can always be recomputed from its key's date.
 *   · morning: every day ('all') or only NYSE session days ('sessions'; unknown days outside coverage are skipped);
 *   · close: NYSE session days inside coverage only;
 *   · weekly: Mondays only; `date` is the cutoff Monday.
 */
export function periodForDate(cadence: Cadence, date: string, policy: SchedulePolicy): Period | null {
  parseDate(date);
  if (cadence === 'morning') {
    if (policy.morningDays === 'sessions' && isSessionDay(date) !== true) return null;
    const w = WINDOWS.morning;
    return buildPeriod(
      'morning', date,
      nyLocalToUtc(addDays(date, -1), w.scheduled), nyLocalToUtc(date, w.scheduled), nyLocalToUtc(date, w.scheduled),
      nyLocalToUtc(date, w.prepare), nyLocalToUtc(date, w.readyBy), nyLocalToUtc(date, w.expires), date,
    );
  }
  if (cadence === 'close') {
    const hours = sessionHours(date);
    if (!hours) return null;
    const w = WINDOWS.close;
    const scheduled = addMinutes(hours.closeAt, w.delayMinutes);
    return buildPeriod(
      'close', date, hours.openAt, hours.closeAt, scheduled,
      hours.closeAt, addMinutes(scheduled, -w.readyByBeforeMinutes), addMinutes(scheduled, w.expiresAfterMinutes), date,
    );
  }
  if (weekdayOf(date) !== 1) return null;
  const w = WINDOWS.weekly;
  const startDate = addDays(date, -7);
  return buildPeriod(
    'weekly', `${startDate}_${date}`,
    nyLocalToUtc(startDate, w.scheduled), nyLocalToUtc(date, w.scheduled), nyLocalToUtc(date, w.scheduled),
    nyLocalToUtc(date, w.prepare), nyLocalToUtc(date, w.readyBy), nyLocalToUtc(date, w.expires), date,
  );
}

/**
 * Every period of an adopted cadence whose [prepareFrom, pushExpiresAt) contains `now`: phase 'prepare' before
 * scheduledAt, 'dispatch' from it. All windows sit inside their scheduled NY date; neighbouring dates are
 * checked anyway so the result never depends on that assumption. Ordered by cadence, then scheduledAt.
 */
export function duePeriods(now: Date, policy: SchedulePolicy): Array<{ period: Period; phase: 'prepare' | 'dispatch' }> {
  const at = now.getTime();
  const today = nyParts(now).date;
  const out: Array<{ period: Period; phase: 'prepare' | 'dispatch' }> = [];
  for (const cadence of CADENCES) {
    if (cadence !== 'weekly') continue;
    if (!policy.adopted.has(cadence)) continue;
    for (const date of [addDays(today, -1), today, addDays(today, 1)]) {
      const period = periodForDate(cadence, date, policy);
      if (!period) continue;
      if (at < Date.parse(period.prepareFrom) || at >= Date.parse(period.pushExpiresAt)) continue;
      out.push({ period, phase: at < Date.parse(period.scheduledAt) ? 'prepare' : 'dispatch' });
    }
  }
  return out;
}

/** The period of `cadence` whose preparation/dispatch window contains `now`, or null. */
export function periodFor(cadence: Cadence, now: Date, policy: SchedulePolicy): Period | null {
  return duePeriods(now, policy).find((p) => p.period.cadence === cadence)?.period ?? null;
}

/** Days scanned forward for the next occurrence (a year covers any weekly/morning gap; close stops at coverage). */
const NEXT_SCAN_DAYS = 370;

/** The next period of an adopted cadence scheduled strictly after `now`; null when not adopted or not scheduled. */
export function nextScheduled(cadence: Cadence, now: Date, policy: SchedulePolicy): Period | null {
  if (cadence !== 'weekly' || !policy.adopted.has(cadence)) return null;
  const at = now.getTime();
  let date = nyParts(now).date;
  for (let i = 0; i <= NEXT_SCAN_DAYS; i++, date = addDays(date, 1)) {
    const period = periodForDate(cadence, date, policy);
    if (period && Date.parse(period.scheduledAt) > at) return period;
  }
  return null;
}

/** Effective schedules for the settings endpoint. Non-adopted cadences report configured:false and nextAt null. */
export function scheduleSummary(now: Date, policy: SchedulePolicy): {
  timezone: 'America/New_York'; policyVersion: string;
  opening: { configured: boolean; localTime: '08:00'; nextAt: string | null };
  close: { configured: boolean; delayMinutes: 15; nextAt: string | null };
  weekly: { configured: boolean; weekday: 'Monday'; localTime: '08:00'; nextAt: string | null };
} {
  const nextAt = (cadence: Cadence): string | null => nextScheduled(cadence, now, policy)?.scheduledAt ?? null;
  return {
    timezone: NY_TIMEZONE,
    policyVersion: POLICY_VERSION,
    opening: { configured: false, localTime: WINDOWS.morning.scheduled, nextAt: null },
    close: { configured: false, delayMinutes: WINDOWS.close.delayMinutes, nextAt: null },
    weekly: { configured: policy.adopted.has('weekly'), weekday: 'Monday', localTime: WINDOWS.weekly.scheduled, nextAt: nextAt('weekly') },
  };
}
