// The web side of the per-user memory (api/memory.ts): see what Bobby remembers, correct the preferences you
// set, forget one asset or everything. Only an Apple/Google account has memory; anyone else gets `signedOut`.
import { accessHeaders } from '@/lib/access-client';

export type MemoryHorizon = 'intraday' | 'week' | 'month' | 'long';
export type MemoryExperience = 'new' | 'some' | 'experienced';
export type MemoryRisk = 'low' | 'medium' | 'high';
export interface MemoryPrefs { horizon: MemoryHorizon | null; experience: MemoryExperience | null; risk: MemoryRisk | null }
export interface MemoryAsset {
  symbol: string; asks: number; lastAskedAt: string; lastHorizon: MemoryHorizon | 'unspecified';
  /** The price the last read used and when that price was observed. */
  lastPrice: number | null; lastPriceAt: string | null;
}
/** One answer Bobby gave, as the reader saw it. */
export interface MemoryRead {
  symbol: string; deliveredAt: string; verdict: 'wait' | 'review'; direction: 'long' | 'short' | 'none';
  headline: string; why: string; risk: string; watch: string; level: 'rapido' | 'profundo' | 'maximo';
  price: number | null; priceAt: string | null;
}
export interface MemoryState { enabled: boolean; preferredName: string | null; prefs: MemoryPrefs; assets: MemoryAsset[]; reads: MemoryRead[]; retentionDays: number }
export type MemoryPatch = Partial<MemoryPrefs> & { memoryEnabled?: boolean; preferredName?: string | null };
export type MemoryResult = { ok: true; state: MemoryState } | { ok: false; signedOut: boolean };

async function call(method: 'GET' | 'PATCH' | 'DELETE', path: string, body?: MemoryPatch): Promise<MemoryResult> {
  try {
    const r = await fetch(path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(await accessHeaders()) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401) return { ok: false, signedOut: true };
    if (!r.ok) return { ok: false, signedOut: false };
    const raw = (await r.json()) as Partial<MemoryState> | null;
    if (!raw || !Array.isArray(raw.assets)) return { ok: false, signedOut: false };
    const state: MemoryState = {
      enabled: raw.enabled !== false, preferredName: typeof raw.preferredName === 'string' ? raw.preferredName : null,
      prefs: raw.prefs ?? { horizon: null, experience: null, risk: null },
      assets: raw.assets.map((a) => ({ ...a, lastPrice: typeof a.lastPrice === 'number' ? a.lastPrice : null, lastPriceAt: typeof a.lastPriceAt === 'string' ? a.lastPriceAt : null })),
      reads: Array.isArray(raw.reads) ? raw.reads : [], retentionDays: typeof raw.retentionDays === 'number' ? raw.retentionDays : 90,
    };
    return { ok: true, state };
  } catch {
    return { ok: false, signedOut: false };
  }
}

export const fetchMemory = () => call('GET', '/api/memory');
export const patchMemory = (patch: MemoryPatch) => call('PATCH', '/api/memory', patch);
export const forgetAsset = (symbol: string) => call('DELETE', `/api/memory?symbol=${encodeURIComponent(symbol)}`);
// Erasing everything is never a default: the server refuses a DELETE without symbol or all=1.
export const forgetAllMemory = () => call('DELETE', '/api/memory?all=1');
