// ============================================================
// Per-user memory (migrations 20260929190000 / 200000 / 230000): for an Apple/Google account, which assets it
// asks about (symbol, count, when, the horizon its question named, the price that read used and that price's own
// time), what Bobby answered on each delivered read (verdict, direction and the four synthesis lines the reader
// saw), the preferences it set itself and the name it asked to be called. Nothing is inferred: horizon /
// experience / risk / name exist only when the person chose or said them.
//   · Only a verified Apple/Google session has memory. Anonymous devices and wallet-only sessions get none,
//     and the desk makes no memory call for them at all (carriesAccountToken).
//   · The desk reads a compact summary before answering (short timeout, fail-open = no memory) and records
//     the read only after an answer was delivered.
//   · Memory never reaches the verdict: the debate runs without it; a separate note is written afterwards
//     (api/_lib/memory-note.ts). "Last time I told you" can only quote a stored read.
//   · Logs carry the RPC name and status only: never a symbol next to an identity.
// ============================================================
import type { VercelRequest } from '@vercel/node';
import { bobbyRest, bobbyServiceHeaders } from './bobby-db.js';
import { resolveIdentity, type Identity } from './user-identity.js';
import { EXPOSURE_LABEL, sharedExposures } from '../../src/lib/asset-exposures.js';
import { cleanName, preferredNameFrom } from '../../src/lib/preferred-name.js';

export { cleanName, preferredNameFrom };

export type MemoryHorizon = 'intraday' | 'week' | 'month' | 'long';
export type AskedHorizon = MemoryHorizon | 'unspecified';
export type Experience = 'new' | 'some' | 'experienced';
export type RiskPref = 'low' | 'medium' | 'high';
export type Lang = 'en' | 'es' | 'pt';
export type ReadLevel = 'rapido' | 'profundo' | 'maximo';
export interface MemoryPrefs { horizon: MemoryHorizon | null; experience: Experience | null; risk: RiskPref | null }
export interface MemoryAsset {
  symbol: string; asks: number; lastAskedAt: string; lastHorizon: AskedHorizon;
  /** The price the last read used and when that price was observed (never the ask time). */
  lastPrice?: number | null; lastPriceAt?: string | null;
}
/** One delivered answer, as the reader saw it. */
export interface MemoryRead {
  symbol?: string;
  deliveredAt: string; horizon: AskedHorizon; level: ReadLevel;
  verdict: 'wait' | 'review'; direction: 'long' | 'short' | 'none';
  headline: string; why: string; risk: string; watch: string; language: Lang;
  price: number | null; priceAt: string | null;
}
export interface MemorySummary {
  enabled: boolean; preferredName: string | null; prefs: MemoryPrefs; top: MemoryAsset[];
  thisAsset: (Omit<MemoryAsset, 'symbol'> & { recentAsks: string[] }) | null;
  lastRead: MemoryRead | null;
}
export interface MemoryList {
  enabled: boolean; preferredName: string | null; prefs: MemoryPrefs; assets: MemoryAsset[];
  /** The newest stored answers across assets. */
  reads: MemoryRead[];
  retentionDays: number;
}
export type PrefsPatch = Partial<MemoryPrefs> & { memoryEnabled?: boolean; preferredName?: string | null };

export const MEMORY_SYMBOL = /^[A-Z0-9.^=-]{1,20}$/;
export const MEMORY_RETENTION_DAYS = 90;
export const MEMORY_MAX_ASSETS = 50;
export const MEMORY_LIST_READS = 30;
/**
 * Platforms whose desk reads always use memory. The iPhone app joins per request: a build that has the memory
 * screen (view, pause, correct, delete) sends `X-Bobby-Memory: 1`; older builds never do.
 */
export const MEMORY_PLATFORMS: ReadonlySet<string> = new Set(['web']);
export function memoryPlatformAllowed(platform: string, req: VercelRequest): boolean {
  if (MEMORY_PLATFORMS.has(platform)) return true;
  const raw = req.headers['x-bobby-memory'];
  return platform === 'ios' && (Array.isArray(raw) ? raw[0] : raw) === '1';
}
/**
 * Kill switch: the desk personalizes with memory and records reads only when BOBBY_MEMORY is exactly 'on'.
 * Unset or anything else = off (no memory call from the desk at all). /api/memory (view, correct, delete)
 * works either way, so people can always see and erase what was stored. Read per request, never cached.
 */
export function memoryPersonalizationOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BOBBY_MEMORY === 'on';
}
/** How long the desk waits for the summary before answering without it. */
export const MEMORY_SUMMARY_TIMEOUT_MS = 800;
/** An asset counts as one the reader "often" looks at from this many asks. */
const OFTEN_MIN_ASKS = 2;

const HORIZONS = ['intraday', 'week', 'month', 'long'] as const;
const EXPERIENCES = ['new', 'some', 'experienced'] as const;
const RISKS = ['low', 'medium', 'high'] as const;
const LEVELS = ['rapido', 'profundo', 'maximo'] as const;
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | null => (typeof v === 'string' && (list as readonly string[]).includes(v) ? v as T : null);

/** A storage failure the memory endpoint reports (the desk never sees it: it fails open). */
export class MemoryUnavailableError extends Error {}

/** Only an Apple/Google account (a verified Supabase session, with an auth user) has memory. */
export function hasMemory(identity: Identity | null | undefined): identity is Identity {
  return !!identity && identity.via === 'supabase' && !!identity.authUserId;
}

/**
 * Whether the request carries an account token at all: a Supabase bearer, with no wallet session beside it.
 * Without one there is no memory and no network call is made.
 */
export function carriesAccountToken(req: VercelRequest): boolean {
  const session = req.headers['x-bobby-session'];
  if (session) return false;
  const raw = req.headers.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || !value.startsWith('Bearer ')) return false;
  const token = value.slice(7).trim();
  return token.length > 0 && !token.startsWith('bws.');
}

/**
 * The caller's identity when it can have memory, else null. `known` is an identity the request already
 * resolved (the premium meter does): null there means nobody, undefined means not resolved yet.
 */
export async function memoryIdentity(req: VercelRequest, known?: Identity | null): Promise<Identity | null> {
  if (known !== undefined) return hasMemory(known) ? known : null;
  if (!carriesAccountToken(req)) return null;
  try {
    const identity = await resolveIdentity(req);
    return hasMemory(identity) ? identity : null;
  } catch {
    return null;
  }
}

async function rpc(name: string, body: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
  const r = await fetch(bobbyRest(`rpc/${name}`), { method: 'POST', headers: bobbyServiceHeaders(), body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) {
    console.error('[user-memory]', name, r.status);
    throw new MemoryUnavailableError(`${name} ${r.status}`);
  }
  return r.json();
}

/** A usable price: finite and positive, else null. */
const positive = (v: unknown): number | null => { const n = Number(v); return v !== null && v !== '' && Number.isFinite(n) && n > 0 && n < 1e12 ? n : null; };
/** An ISO timestamp, or null. */
const isoOf = (v: unknown): string | null => { if (typeof v !== 'string') return null; const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString() : null; };

function prefsOf(raw: unknown): MemoryPrefs {
  const p = (raw ?? {}) as Record<string, unknown>;
  return { horizon: oneOf(HORIZONS, p.horizon), experience: oneOf(EXPERIENCES, p.experience), risk: oneOf(RISKS, p.risk) };
}

function assetOf(raw: unknown): MemoryAsset | null {
  const a = (raw ?? {}) as Record<string, unknown>;
  const at = isoOf(a.lastAskedAt ?? a.last_asked_at);
  const asks = Number(a.asks);
  if (typeof a.symbol !== 'string' || !MEMORY_SYMBOL.test(a.symbol) || !Number.isFinite(asks) || asks < 1 || !at) return null;
  const price = positive(a.lastPrice ?? a.last_price);
  const priceAt = price ? isoOf(a.lastPriceAt ?? a.last_price_at) : null;
  return {
    symbol: a.symbol, asks: Math.floor(asks), lastAskedAt: at,
    lastHorizon: oneOf([...HORIZONS, 'unspecified'] as const, a.lastHorizon ?? a.last_horizon) ?? 'unspecified',
    // A price without its own time is not usable.
    lastPrice: price && priceAt ? price : null, lastPriceAt: price && priceAt ? priceAt : null,
  };
}

function readOf(raw: unknown): MemoryRead | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const deliveredAt = isoOf(r.deliveredAt ?? r.delivered_at);
  const verdict = oneOf(['wait', 'review'] as const, r.verdict);
  const direction = oneOf(['long', 'short', 'none'] as const, r.direction);
  const lines = ['headline', 'why', 'risk', 'watch'].map((k) => (typeof r[k] === 'string' ? (r[k] as string).trim() : ''));
  if (!deliveredAt || !verdict || !direction || lines.some((l) => !l)) return null;
  const price = positive(r.price);
  const priceAt = price ? isoOf(r.priceAt ?? r.price_at) : null;
  return {
    ...(typeof r.symbol === 'string' && MEMORY_SYMBOL.test(r.symbol) ? { symbol: r.symbol } : {}),
    deliveredAt, horizon: oneOf([...HORIZONS, 'unspecified'] as const, r.horizon) ?? 'unspecified',
    level: oneOf(LEVELS, r.level) ?? 'rapido', verdict, direction: verdict === 'wait' ? 'none' : direction,
    headline: lines[0], why: lines[1], risk: lines[2], watch: lines[3],
    language: oneOf(['en', 'es', 'pt'] as const, r.language) ?? 'en',
    price: price && priceAt ? price : null, priceAt: price && priceAt ? priceAt : null,
  };
}

/** The summary the desk reads before answering. Null on any failure or timeout: the read runs without memory. */
export async function memorySummary(identityId: string, symbol: string, timeoutMs = MEMORY_SUMMARY_TIMEOUT_MS): Promise<MemorySummary | null> {
  try {
    const raw = (await rpc('bobby_memory_summary_v2', { p_identity: identityId, p_symbol: symbol }, timeoutMs)) as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object') return null;
    const top = Array.isArray(raw.top) ? raw.top.map(assetOf).filter((a): a is MemoryAsset => a !== null) : [];
    const thisRaw = raw.thisAsset ? assetOf({ ...(raw.thisAsset as Record<string, unknown>), symbol }) : null;
    const recent = Array.isArray((raw.thisAsset as Record<string, unknown> | null)?.recentAsks)
      ? ((raw.thisAsset as Record<string, unknown>).recentAsks as unknown[]).map(isoOf).filter((t): t is string => t !== null)
      : [];
    const enabled = raw.enabled === true;
    return {
      enabled,
      preferredName: enabled ? cleanName(raw.preferredName) : null,
      prefs: prefsOf(raw.prefs), top,
      thisAsset: thisRaw ? { asks: thisRaw.asks, lastAskedAt: thisRaw.lastAskedAt, lastHorizon: thisRaw.lastHorizon, lastPrice: thisRaw.lastPrice, lastPriceAt: thisRaw.lastPriceAt, recentAsks: recent } : null,
      lastRead: raw.lastRead ? readOf(raw.lastRead) : null,
    };
  } catch {
    return null;
  }
}

/** What a delivered read leaves in memory: the price it used (with that price's own time and source) and what Bobby said. */
export interface ReadRecord {
  price?: number | null; priceAt?: string | null; priceSource?: string | null;
  read?: {
    verdict: 'wait' | 'review'; direction: 'long' | 'short' | 'none';
    headline: string; why: string; risk: string; watch: string;
    level: ReadLevel; language: Lang; platform: string;
  } | null;
}

/** Record one delivered read. Best effort: false when it was not recorded (paused, not an account, storage down). */
export async function recordRead(identityId: string, symbol: string, horizon: AskedHorizon, record: ReadRecord = {}): Promise<boolean> {
  if (!MEMORY_SYMBOL.test(symbol)) return false;
  const price = positive(record.price);
  const priceAt = price ? isoOf(record.priceAt) : null;
  try {
    return (await rpc('bobby_memory_record_v2', {
      p_identity: identityId, p_symbol: symbol, p_horizon: horizon,
      p_price: price && priceAt ? price : null, p_price_at: price && priceAt ? priceAt : null,
      p_price_source: price && priceAt ? (record.priceSource ?? null) : null,
      p_read: record.read ?? null,
    }, 3000)) === true;
  } catch {
    return false;
  }
}

async function rest(path: string, init: RequestInit = {}): Promise<unknown> {
  const r = await fetch(bobbyRest(path), { ...init, headers: { ...bobbyServiceHeaders(), ...(init.headers as Record<string, string> | undefined) }, signal: AbortSignal.timeout(4000) });
  if (!r.ok) {
    console.error('[user-memory]', path.split('?')[0], r.status);
    throw new MemoryUnavailableError(`${path.split('?')[0]} ${r.status}`);
  }
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

/** Everything remembered for this account (GET /api/memory). Throws MemoryUnavailableError. */
export async function listMemory(identityId: string): Promise<MemoryList> {
  const cutoff = encodeURIComponent(new Date(Date.now() - MEMORY_RETENTION_DAYS * 86_400_000).toISOString());
  const [prefsRows, assetRows, readRows] = await Promise.all([
    rest(`bobby_user_prefs?identity_id=eq.${identityId}&select=horizon,experience,risk,memory_enabled,preferred_name`),
    rest(`bobby_user_assets?identity_id=eq.${identityId}&last_asked_at=gte.${cutoff}&select=symbol,asks,last_asked_at,last_horizon,last_price,last_price_at&order=last_asked_at.desc&limit=${MEMORY_MAX_ASSETS}`),
    rest(`bobby_user_reads?identity_id=eq.${identityId}&delivered_at=gte.${cutoff}&select=symbol,delivered_at,horizon,level,verdict,direction,headline,why,risk,watch,language,price,price_at&order=delivered_at.desc&limit=${MEMORY_LIST_READS}`),
  ]);
  const row = (Array.isArray(prefsRows) ? prefsRows[0] : null) as Record<string, unknown> | null;
  return {
    enabled: row ? row.memory_enabled !== false : true,
    preferredName: cleanName(row?.preferred_name),
    prefs: prefsOf(row),
    assets: (Array.isArray(assetRows) ? assetRows : []).map(assetOf).filter((a): a is MemoryAsset => a !== null),
    reads: (Array.isArray(readRows) ? readRows : []).map(readOf).filter((r): r is MemoryRead => r !== null),
    retentionDays: MEMORY_RETENTION_DAYS,
  };
}

/** An explicit correction: only the fields sent change; null clears one. */
export async function updatePrefs(identityId: string, patch: PrefsPatch): Promise<void> {
  const row: Record<string, unknown> = { identity_id: identityId, updated_at: new Date().toISOString() };
  if (patch.horizon !== undefined) row.horizon = patch.horizon;
  if (patch.experience !== undefined) row.experience = patch.experience;
  if (patch.risk !== undefined) row.risk = patch.risk;
  if (patch.memoryEnabled !== undefined) row.memory_enabled = patch.memoryEnabled;
  if (patch.preferredName !== undefined) row.preferred_name = patch.preferredName === null ? null : cleanName(patch.preferredName);
  await rest('bobby_user_prefs?on_conflict=identity_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
  });
}

/** Forget one asset (and its stored answers) or, only when asked explicitly, everything. Throws MemoryUnavailableError. */
export async function forgetMemory(identityId: string, target: { symbol: string } | 'all'): Promise<number> {
  if (target !== 'all' && !MEMORY_SYMBOL.test(target.symbol)) throw new MemoryUnavailableError('invalid symbol');
  const n = await rpc('bobby_memory_forget', { p_identity: identityId, p_symbol: target === 'all' ? null : target.symbol }, 4000);
  return typeof n === 'number' ? n : 0;
}

// ---------- calendar in the reader's time zone ----------
/** A valid IANA time zone, else UTC. */
export function readerTimeZone(tz: unknown): string {
  if (typeof tz !== 'string' || tz.length > 64) return 'UTC';
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return 'UTC'; }
}
/** Days since the epoch of the local calendar date of `ms` in `tz`. */
function dayNumber(ms: number, tz: string): number {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  return Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000);
}
/** Calendar days between two instants in `tz` (Mon 23:00 → Tue 09:00 is 1). */
export function calendarDaysBetween(fromMs: number, toMs: number, tz: string): number {
  return dayNumber(toMs, tz) - dayNumber(fromMs, tz);
}
const LOCALE: Record<Lang, string> = { en: 'en-US', es: 'es-MX', pt: 'pt-BR' };
/** "yesterday" / a weekday (2–6 days) / a date, in the reader's language and time zone; "today" for 0. */
export function dayLabel(ms: number, now: number, tz: string, lang: Lang): string {
  const days = calendarDaysBetween(ms, now, tz);
  if (days <= 1) return new Intl.RelativeTimeFormat(LOCALE[lang], { numeric: 'auto' }).format(-Math.max(0, days), 'day');
  if (days <= 6) return new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'long', timeZone: tz }).format(new Date(ms));
  return new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: 'long', timeZone: tz }).format(new Date(ms));
}

/** What the note writer may see about this reader: explicit choices, what they asked and what Bobby answered. */
export interface ReaderContext {
  /** The name to use: the one they asked to be called, else their Apple/Google first name. */
  name?: string;
  /**
   * `explainRiskDepth` is the profile's "risk" choice, named for what it means in the UI: how much risk
   * explanation the reader wants. Never a risk tolerance, suitability or sizing input.
   */
  prefs?: { horizon?: MemoryHorizon; experience?: Experience; explainRiskDepth?: RiskPref };
  /** The asset asked about now, when asked before. */
  thisAsset?: {
    asks: number;
    /** Calendar days since the last ask, in the reader's time zone. */
    lastAskedDaysAgo: number;
    /** "yesterday", a weekday or a date, in the reader's language and time zone. */
    lastAskedOn: string;
    lastHorizon: AskedHorizon;
    /** Asks in the reader's current calendar week (Monday first), this one included. */
    timesThisWeek: number;
    /** The price the last read used, when it was observed, and the change to the price this read uses. */
    priceThen?: number; priceThenOn?: string; priceNow?: number; changeSinceLastAskPct?: number;
  };
  /** The newest stored answer on this asset: exactly what the reader saw then. */
  previousRead?: {
    on: string; daysAgo: number; verdict: 'wait' | 'review'; direction: 'long' | 'short' | 'none';
    headline: string; why: string; risk: string; language: Lang;
  };
  /** Other assets asked about at least twice, most-weighted first, with the exposure they share with this one. */
  oftenAsks?: Array<{ symbol: string; asks: number; sharedExposure?: string }>;
}

export interface ReaderOptions {
  symbol: string; now?: number; name?: string | null;
  /** The price this read uses and its own observation time (the evidence's asOf). */
  priceNow?: number | null; priceNowAt?: string | null;
  language?: Lang; timeZone?: string;
}

/** Compact the summary for the note writer; null when memory is off or holds nothing useful. */
export function readerContext(summary: MemorySummary | null, opts: ReaderOptions): ReaderContext | null {
  if (!summary?.enabled) return null;
  const now = opts.now ?? Date.now();
  const lang = opts.language ?? 'en';
  const tz = readerTimeZone(opts.timeZone);
  const ctx: ReaderContext = {};
  const name = cleanName(opts.name);
  if (name) ctx.name = name;
  const prefs: NonNullable<ReaderContext['prefs']> = {};
  if (summary.prefs.horizon) prefs.horizon = summary.prefs.horizon;
  if (summary.prefs.experience) prefs.experience = summary.prefs.experience;
  if (summary.prefs.risk) prefs.explainRiskDepth = summary.prefs.risk;
  if (Object.keys(prefs).length) ctx.prefs = prefs;
  const t = summary.thisAsset;
  if (t) {
    const last = Date.parse(t.lastAskedAt);
    const days = Math.max(0, calendarDaysBetween(last, now, tz));
    const weekStart = dayNumber(now, tz) - ((new Date(dayNumber(now, tz) * 86_400_000).getUTCDay() + 6) % 7);
    const thisWeek = t.recentAsks.filter((iso) => { const ms = Date.parse(iso); return ms <= now && dayNumber(ms, tz) >= weekStart; }).length;
    ctx.thisAsset = { asks: t.asks, lastAskedDaysAgo: days, lastAskedOn: dayLabel(last, now, tz, lang), lastHorizon: t.lastHorizon, timesThisWeek: thisWeek + 1 };
    // A callback needs both prices with their own times, the old one from an earlier calendar day than this
    // ask and older than the new one; otherwise there is nothing honest to compare.
    const then = t.lastPrice ?? null;
    const thenAt = t.lastPriceAt ? Date.parse(t.lastPriceAt) : NaN;
    const nowPrice = positive(opts.priceNow);
    const nowAt = opts.priceNowAt ? Date.parse(opts.priceNowAt) : NaN;
    if (then && nowPrice && Number.isFinite(thenAt) && Number.isFinite(nowAt) && nowAt > thenAt && calendarDaysBetween(last, now, tz) >= 1) {
      ctx.thisAsset.priceThen = then;
      ctx.thisAsset.priceThenOn = dayLabel(thenAt, now, tz, lang);
      ctx.thisAsset.priceNow = nowPrice;
      ctx.thisAsset.changeSinceLastAskPct = Math.round((nowPrice / then - 1) * 1000) / 10;
    }
  }
  const r = summary.lastRead;
  if (r) {
    const at = Date.parse(r.deliveredAt);
    if (Number.isFinite(at) && at <= now) {
      ctx.previousRead = {
        on: dayLabel(at, now, tz, lang), daysAgo: Math.max(0, calendarDaysBetween(at, now, tz)),
        verdict: r.verdict, direction: r.direction, headline: r.headline, why: r.why, risk: r.risk, language: r.language,
      };
    }
  }
  // The asked asset is already in thisAsset; oftenAsks names the others the reader keeps coming back to.
  const often = summary.top.filter((a) => a.asks >= OFTEN_MIN_ASKS && a.symbol !== opts.symbol).slice(0, 5).map(({ symbol: s, asks }) => {
    const shared = sharedExposures(opts.symbol, s)[0];
    return shared ? { symbol: s, asks, sharedExposure: EXPOSURE_LABEL[shared][lang] } : { symbol: s, asks };
  });
  if (often.length) ctx.oftenAsks = often;
  return Object.keys(ctx).length ? ctx : null;
}
