// The web side of the per-user memory (api/memory.ts): see what Bobby remembers, correct the preferences you
// set, forget one asset or everything. Only an Apple/Google account has memory; anyone else gets `signedOut`.
import { accessHeaders } from '@/lib/access-client';

export type MemoryHorizon = 'intraday' | 'week' | 'month' | 'long';
export type MemoryExperience = 'new' | 'some' | 'experienced';
export type MemoryRisk = 'low' | 'medium' | 'high';
export interface MemoryPrefs { horizon: MemoryHorizon | null; experience: MemoryExperience | null; risk: MemoryRisk | null }
export interface MemoryAsset { symbol: string; asks: number; lastAskedAt: string; lastHorizon: MemoryHorizon | 'unspecified' }
export interface MemoryState { enabled: boolean; prefs: MemoryPrefs; assets: MemoryAsset[]; retentionDays: number }
export type MemoryPatch = Partial<MemoryPrefs> & { memoryEnabled?: boolean };
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
    const state = (await r.json()) as MemoryState;
    return state && Array.isArray(state.assets) ? { ok: true, state } : { ok: false, signedOut: false };
  } catch {
    return { ok: false, signedOut: false };
  }
}

export const fetchMemory = () => call('GET', '/api/memory');
export const patchMemory = (patch: MemoryPatch) => call('PATCH', '/api/memory', patch);
export const forgetAsset = (symbol: string) => call('DELETE', `/api/memory?symbol=${encodeURIComponent(symbol)}`);
export const forgetAllMemory = () => call('DELETE', '/api/memory');
