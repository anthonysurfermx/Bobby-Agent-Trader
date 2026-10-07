// ============================================================
// The harness, layer 2a (README.md in this folder): the strict reader of daily bars.
// A market fact is only as true as the bars under it, so this module refuses more than it accepts:
// a session still in progress, a missing day, a stale series, impossible OHLC, a visible split or
// an implausible jump all end in "no series" or a named rejection, never in a repaired number.
//   · Equities: Yahoo chart v8, 1d bars, raw (unadjusted) OHLC, the exchange's own session day.
//   · Crypto: OKX spot candles on UTC days (`1Dutc`), completed bars only (`confirm === '1'`).
// Pure: `now` is always a parameter and nothing here touches the network.
// ============================================================
export type AssetClass = 'equity' | 'crypto';
export interface DailyBar {
  day: string; open: number; high: number; low: number; close: number;
  volume: number | null; closedAt: string;
}
export interface BarSeries {
  symbol: string; assetClass: AssetClass; currency: string | null; exchange: string | null;
  source: 'yahoo' | 'okx'; bars: DailyBar[]; fetchedAt: string;
  // Keep rejection evidence in the value, rather than in hidden state or adjusted prices.
  corporateActionDays?: string[];
}
export type BarsRejection = 'too_few' | 'invalid_ohlc' | 'unordered' | 'duplicate_day' | 'gap' | 'stale' | 'extreme_move' | 'corporate_action';
const DAY = 86_400_000;
const record = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const text = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v : null;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const dayTime = (day: string): number => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NaN;
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === day ? ms : NaN;
};
const instant = (v: string): number => Number.isFinite(dayTime(v.slice(0, 10))) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) ? Date.parse(v) : NaN;
function localDay(ms: number, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
/** The wall-clock time (HH:MM) an instant shows on the exchange's own clock. */
function localClock(ms: number, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  return `${part('hour')}:${part('minute')}`;
}
interface Session { start: number; end: number }
function session(v: unknown): Session | null {
  const r = record(v);
  if (!r || !finite(r.start) || !finite(r.end) || !Number.isSafeInteger(r.start) || !Number.isSafeInteger(r.end) || r.end <= r.start || r.end - r.start > 24 * 3600) return null;
  return { start: r.start * 1000, end: r.end * 1000 };
}
function historicalSessions(v: unknown): Session[] | null {
  if (v === undefined) return [];
  const regular = record(v)?.regular ?? v;
  if (!Array.isArray(regular)) return null;
  const rows = regular.flat();
  const sessions = rows.map(session);
  return sessions.every(s => s !== null) ? sessions as Session[] : null;
}

export function parseYahooDaily(json: unknown, symbol: string, now: Date): BarSeries | null {
  try {
    if (!Number.isFinite(now.getTime()) || !text(symbol)) return null;
    const chart = record(record(json)?.chart);
    if (!chart || chart.error != null || !Array.isArray(chart.result) || chart.result.length !== 1) return null;
    const result = record(chart.result[0]), meta = record(result?.meta);
    const tz = text(meta?.exchangeTimezoneName), providerSymbol = text(meta?.symbol);
    if (!result || !meta || !tz || !providerSymbol || providerSymbol.toUpperCase() !== symbol.toUpperCase() || (meta.dataGranularity !== undefined && meta.dataGranularity !== '1d')) return null;
    const current = session(record(meta.currentTradingPeriod)?.regular);
    const history = historicalSessions(result.tradingPeriods);
    if (!current || !history) return null;
    const sessions = [...history, current];
    const timestamps = result.timestamp, indicators = record(result.indicators);
    const quote = Array.isArray(indicators?.quote) && indicators.quote.length === 1 ? record(indicators.quote[0]) : null;
    if (!Array.isArray(timestamps) || !quote || !['open', 'high', 'low', 'close'].every(k => Array.isArray(quote[k]) && quote[k].length === timestamps.length) || (quote.volume !== undefined && (!Array.isArray(quote.volume) || quote.volume.length !== timestamps.length))) return null;
    const bars: DailyBar[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i];
      if (!finite(ts) || !Number.isSafeInteger(ts)) return null;
      const ms = ts * 1000, day = localDay(ms, tz);
      const matching = sessions.filter(s => localDay(s.start, tz) === day);
      const ends = new Set(matching.map(s => s.end));
      let end: number;
      if (ends.size === 1) {
        // A session whose timetable the payload states (today's, or a listed past one).
        end = matching[0].end;
        if (ms < matching[0].start || ms > end) return null;
      } else if (ends.size === 0 && localClock(ms, tz) === localClock(current.start, tz)) {
        // Yahoo's daily payload has no timetable for past sessions. A past bar stamped at the
        // exchange's regular opening time closed one regular session later. A shortened session
        // really closed earlier: that only makes `closedAt` a few hours late, never early, and the
        // day itself is exact. A bar stamped at any other time is not understood: no series.
        end = ms + (current.end - current.start);
      } else {
        return null;
      }
      if (now.getTime() <= end) continue;
      const values = ['open', 'high', 'low', 'close'].map(k => (quote[k] as unknown[])[i]);
      if (!values.every(finite)) return null;
      const volume = Array.isArray(quote.volume) ? quote.volume[i] : null;
      if (volume !== null && (!finite(volume) || volume < 0)) return null;
      bars.push({ day, open: values[0] as number, high: values[1] as number, low: values[2] as number, close: values[3] as number, volume, closedAt: new Date(end).toISOString() });
    }
    const corporateActionDays: string[] = [];
    const events = result.events === undefined ? null : record(result.events);
    if (result.events !== undefined && !events) return null;
    if (events?.splits !== undefined) {
      const splits = record(events.splits);
      if (!splits) return null;
      const days = timestamps.map(ts => localDay((ts as number) * 1000, tz)).sort();
      const firstDay = days[0], lastDay = days.at(-1);
      for (const value of Object.values(splits)) {
        const date = record(value)?.date;
        if (!finite(date) || !Number.isSafeInteger(date)) return null;
        const day = localDay(date * 1000, tz);
        if (firstDay && lastDay && day >= firstDay && day <= lastDay) corporateActionDays.push(day);
      }
    }
    return { symbol, assetClass: 'equity', currency: text(meta.currency), exchange: text(meta.exchangeName) ?? text(meta.fullExchangeName), source: 'yahoo', bars, fetchedAt: now.toISOString(), ...(corporateActionDays.length ? { corporateActionDays } : {}) };
  } catch { return null; }
}

function decimal(v: unknown): number | null {
  if (typeof v !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
export function parseOkxDaily(json: unknown, symbol: string, now: Date): BarSeries | null {
  try {
    const payload = record(json);
    // Spot identity is required; a derivative's volume and price basis are different.
    const instrument = /^([A-Z0-9]+)-([A-Z0-9]+)$/.exec(symbol);
    if (!Number.isFinite(now.getTime()) || !instrument || !payload || payload.code !== '0' || !Array.isArray(payload.data)) return null;
    const bars: DailyBar[] = [];
    for (const row of payload.data) {
      if (!Array.isArray(row) || row.length !== 9 || (row[8] !== '0' && row[8] !== '1')) return null;
      if (row[8] === '0') continue;
      const ts = decimal(row[0]), values = row.slice(1, 5).map(decimal);
      const volume = decimal(row[5]);
      if (ts === null || !Number.isSafeInteger(ts) || ts % DAY !== 0 || values.some(v => v === null) || volume === null || ts + DAY > now.getTime()) return null;
      bars.push({ day: new Date(ts).toISOString().slice(0, 10), open: values[0]!, high: values[1]!, low: values[2]!, close: values[3]!, volume, closedAt: new Date(ts + DAY).toISOString() });
    }
    // OKX returns newest first. Normalize that documented order, but never repair a mixed sequence.
    const descending = bars.every((b, i) => i === 0 || b.day < bars[i - 1].day);
    const ascending = bars.every((b, i) => i === 0 || b.day > bars[i - 1].day);
    if (!descending && !ascending) return null;
    if (descending) bars.reverse();
    return { symbol, assetClass: 'crypto', currency: instrument[2], exchange: 'OKX', source: 'okx', bars, fetchedAt: now.toISOString() };
  } catch { return null; }
}

export function validateBars(series: BarSeries, now: Date): { ok: true; bars: DailyBar[] } | { ok: false; reason: BarsRejection } {
  const reject = (reason: BarsRejection): { ok: false; reason: BarsRejection } => ({ ok: false, reason });
  if (series.corporateActionDays?.length) return reject('corporate_action');
  if (series.bars.length < 22) return reject('too_few');
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(instant(series.fetchedAt)) || instant(series.fetchedAt) > now.getTime() || (series.assetClass !== 'equity' && series.assetClass !== 'crypto') || (series.assetClass === 'crypto' ? series.source !== 'okx' : series.source !== 'yahoo')) return reject('stale');
  const seen = new Set<string>();
  for (let i = 0; i < series.bars.length; i++) {
    const b = series.bars[i], closeTime = instant(b.closedAt);
    if (![b.open, b.high, b.low, b.close].every(n => Number.isFinite(n) && n > 0) || b.high < Math.max(b.open, b.close) || b.low > Math.min(b.open, b.close) || !Number.isFinite(dayTime(b.day)) || (b.volume !== null && (!Number.isFinite(b.volume) || b.volume < 0))) return reject('invalid_ohlc');
    if (seen.has(b.day)) return reject('duplicate_day');
    seen.add(b.day);
    if (i > 0 && b.day < series.bars[i - 1].day) return reject('unordered');
    if (!Number.isFinite(closeTime) || (series.assetClass === 'equity' && (closeTime < dayTime(b.day) - 14 * 3600_000 || closeTime > dayTime(b.day) + 38 * 3600_000)) || closeTime > now.getTime() || closeTime > instant(series.fetchedAt) || (series.assetClass === 'crypto' && closeTime !== dayTime(b.day) + DAY)) return reject('stale');
    if (i > 0 && closeTime <= instant(series.bars[i - 1].closedAt)) return reject('unordered');
  }
  const start = series.bars.length - 22;
  for (let i = start + 1; i < series.bars.length; i++) {
    const current = series.bars[i], previous = series.bars[i - 1];
    const gap = (dayTime(current.day) - dayTime(previous.day)) / DAY;
    if (series.assetClass === 'crypto' ? gap !== 1 : gap > 5) return reject('gap');
    if (Math.abs(Math.log(current.close / previous.close)) > (series.assetClass === 'equity' ? 0.5 : 0.6)) return reject('extreme_move');
  }
  const age = now.getTime() - instant(series.bars.at(-1)!.closedAt);
  if (age > (series.assetClass === 'crypto' ? 30 * 3600_000 : 4 * DAY)) return reject('stale');
  return { ok: true, bars: series.bars };
}
