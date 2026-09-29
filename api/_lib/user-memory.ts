// ============================================================
// Per-user memory (migration 20260929190000_user_memory.sql): which assets an Apple/Google account asks
// about (symbol, count, last date, the horizon its question named) and the preferences it set itself in the
// profile. Nothing is inferred: horizon / experience / risk exist only when the person chose them.
//   · Only a verified Apple/Google session has memory. Anonymous devices and wallet-only sessions get none,
//     and the desk makes no memory call for them at all (carriesAccountToken).
//   · The desk reads a compact summary before answering (short timeout, fail-open = no memory) and records
//     the ask only after an answer was delivered.
//   · Logs carry the RPC name and status only: never a symbol next to an identity.
// ============================================================
import type { VercelRequest } from '@vercel/node';
import { bobbyRest, bobbyServiceHeaders } from './bobby-db.js';
import { resolveIdentity, type Identity } from './user-identity.js';

export type MemoryHorizon = 'intraday' | 'week' | 'month' | 'long';
export type AskedHorizon = MemoryHorizon | 'unspecified';
export type Experience = 'new' | 'some' | 'experienced';
export type RiskPref = 'low' | 'medium' | 'high';
export interface MemoryPrefs { horizon: MemoryHorizon | null; experience: Experience | null; risk: RiskPref | null }
export interface MemoryAsset { symbol: string; asks: number; lastAskedAt: string; lastHorizon: AskedHorizon }
export interface MemorySummary { enabled: boolean; prefs: MemoryPrefs; top: MemoryAsset[]; thisAsset: Omit<MemoryAsset, 'symbol'> | null }
export interface MemoryList { enabled: boolean; prefs: MemoryPrefs; assets: MemoryAsset[]; retentionDays: number }
export type PrefsPatch = Partial<MemoryPrefs> & { memoryEnabled?: boolean };

export const MEMORY_SYMBOL = /^[A-Z0-9.^=-]{1,20}$/;
export const MEMORY_RETENTION_DAYS = 90;
export const MEMORY_MAX_ASSETS = 50;
/**
 * Platforms whose desk reads use memory: those whose app can show and delete it. The iPhone app already sends
 * its account token to the desk; it joins once it has the memory screen and its App Store privacy answers
 * cover this data. /api/memory itself serves every platform.
 */
export const MEMORY_PLATFORMS: ReadonlySet<string> = new Set(['web']);
/**
 * Kill switch: the desk personalizes with memory and records asks only when BOBBY_MEMORY is exactly 'on'.
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

function prefsOf(raw: unknown): MemoryPrefs {
  const p = (raw ?? {}) as Record<string, unknown>;
  return { horizon: oneOf(HORIZONS, p.horizon), experience: oneOf(EXPERIENCES, p.experience), risk: oneOf(RISKS, p.risk) };
}

function assetOf(raw: unknown): MemoryAsset | null {
  const a = (raw ?? {}) as Record<string, unknown>;
  const at = a.lastAskedAt ?? a.last_asked_at;
  const asks = Number(a.asks);
  if (typeof a.symbol !== 'string' || !MEMORY_SYMBOL.test(a.symbol) || !Number.isFinite(asks) || asks < 1 || typeof at !== 'string') return null;
  const when = Date.parse(at);
  if (!Number.isFinite(when)) return null;
  return { symbol: a.symbol, asks: Math.floor(asks), lastAskedAt: new Date(when).toISOString(), lastHorizon: oneOf([...HORIZONS, 'unspecified'] as const, a.lastHorizon ?? a.last_horizon) ?? 'unspecified' };
}

/** The summary the desk reads before answering. Null on any failure or timeout: the read runs without memory. */
export async function memorySummary(identityId: string, symbol: string, timeoutMs = MEMORY_SUMMARY_TIMEOUT_MS): Promise<MemorySummary | null> {
  try {
    const raw = (await rpc('bobby_memory_summary', { p_identity: identityId, p_symbol: symbol }, timeoutMs)) as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object') return null;
    const top = Array.isArray(raw.top) ? raw.top.map(assetOf).filter((a): a is MemoryAsset => a !== null) : [];
    const thisRaw = raw.thisAsset ? assetOf({ ...(raw.thisAsset as Record<string, unknown>), symbol }) : null;
    return { enabled: raw.enabled === true, prefs: prefsOf(raw.prefs), top, thisAsset: thisRaw ? { asks: thisRaw.asks, lastAskedAt: thisRaw.lastAskedAt, lastHorizon: thisRaw.lastHorizon } : null };
  } catch {
    return null;
  }
}

/** Record one answered ask. Best effort: false when it was not recorded (paused, not an account, storage down). */
export async function recordAsk(identityId: string, symbol: string, horizon: AskedHorizon): Promise<boolean> {
  if (!MEMORY_SYMBOL.test(symbol)) return false;
  try {
    return (await rpc('bobby_memory_record', { p_identity: identityId, p_symbol: symbol, p_horizon: horizon }, 3000)) === true;
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
  const cutoff = new Date(Date.now() - MEMORY_RETENTION_DAYS * 86_400_000).toISOString();
  const [prefsRows, assetRows] = await Promise.all([
    rest(`bobby_user_prefs?identity_id=eq.${identityId}&select=horizon,experience,risk,memory_enabled`),
    rest(`bobby_user_assets?identity_id=eq.${identityId}&last_asked_at=gte.${encodeURIComponent(cutoff)}&select=symbol,asks,last_asked_at,last_horizon&order=last_asked_at.desc&limit=${MEMORY_MAX_ASSETS}`),
  ]);
  const row = (Array.isArray(prefsRows) ? prefsRows[0] : null) as Record<string, unknown> | null;
  return {
    enabled: row ? row.memory_enabled !== false : true,
    prefs: prefsOf(row),
    assets: (Array.isArray(assetRows) ? assetRows : []).map(assetOf).filter((a): a is MemoryAsset => a !== null),
    retentionDays: MEMORY_RETENTION_DAYS,
  };
}

/** An explicit correction from the profile: only the fields sent change; null clears one. */
export async function updatePrefs(identityId: string, patch: PrefsPatch): Promise<void> {
  const row: Record<string, unknown> = { identity_id: identityId, updated_at: new Date().toISOString() };
  if (patch.horizon !== undefined) row.horizon = patch.horizon;
  if (patch.experience !== undefined) row.experience = patch.experience;
  if (patch.risk !== undefined) row.risk = patch.risk;
  if (patch.memoryEnabled !== undefined) row.memory_enabled = patch.memoryEnabled;
  await rest('bobby_user_prefs?on_conflict=identity_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
  });
}

/** Forget one asset, or (symbol null) everything. Throws MemoryUnavailableError. */
export async function forgetMemory(identityId: string, symbol: string | null): Promise<number> {
  const n = await rpc('bobby_memory_forget', { p_identity: identityId, p_symbol: symbol }, 4000);
  return typeof n === 'number' ? n : 0;
}

/** What the CIO may see about this reader: explicit preferences and how often they asked. Nothing else. */
export interface ReaderContext {
  /**
   * `explainRiskDepth` is the profile's "risk" choice, named for what it means in the UI: how much risk
   * explanation the reader wants. Never a risk tolerance, suitability or sizing input.
   */
  prefs?: { horizon?: MemoryHorizon; experience?: Experience; explainRiskDepth?: RiskPref };
  /** The asset asked about now, when asked before. */
  thisAsset?: { asks: number; lastAskedDaysAgo: number; lastHorizon: AskedHorizon };
  /** Other assets asked about at least twice, most-weighted first. */
  oftenAsks?: Array<{ symbol: string; asks: number }>;
}

/** Compact the summary for the model; null when memory is off or holds nothing useful. */
export function readerContext(summary: MemorySummary | null, symbol: string, now = Date.now()): ReaderContext | null {
  if (!summary?.enabled) return null;
  const ctx: ReaderContext = {};
  const prefs: NonNullable<ReaderContext['prefs']> = {};
  if (summary.prefs.horizon) prefs.horizon = summary.prefs.horizon;
  if (summary.prefs.experience) prefs.experience = summary.prefs.experience;
  if (summary.prefs.risk) prefs.explainRiskDepth = summary.prefs.risk;
  if (Object.keys(prefs).length) ctx.prefs = prefs;
  if (summary.thisAsset) {
    const days = Math.max(0, Math.floor((now - Date.parse(summary.thisAsset.lastAskedAt)) / 86_400_000));
    ctx.thisAsset = { asks: summary.thisAsset.asks, lastAskedDaysAgo: Number.isFinite(days) ? days : 0, lastHorizon: summary.thisAsset.lastHorizon };
  }
  // The asked asset is already in thisAsset; oftenAsks names the others the reader keeps coming back to.
  const often = summary.top.filter((a) => a.asks >= OFTEN_MIN_ASKS && a.symbol !== symbol).slice(0, 5).map(({ symbol: s, asks }) => ({ symbol: s, asks }));
  if (often.length) ctx.oftenAsks = often;
  return Object.keys(ctx).length ? ctx : null;
}
