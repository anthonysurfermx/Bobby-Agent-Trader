import { AsyncLocalStorage } from 'node:async_hooks';

export type AdminSourceStatus = 'ok' | 'error' | 'partial' | 'not_configured' | 'deferred';
export interface AdminSource {
  status: AdminSourceStatus;
  fetchedAt: string | null;
  error?: string;
  coveredFrom?: string | null;
  coveredTo?: string | null;
  missingDays?: string[];
  cacheAgeMs?: number;
}
export interface AdminReadMeta {
  generatedAt: string;
  durationMs: number;
  partial: boolean;
  sources: Record<string, AdminSource>;
}
interface ReadContext { started: number; deadline: number; sources: Record<string, AdminSource> }
const reads = new AsyncLocalStorage<ReadContext>();
export const ADMIN_READ_BUDGET_MS = 15_000;

/** Each request owns its deadline and evidence. Concurrent admins never share a mutable read context. */
export function withAdminRead<T>(load: () => Promise<T>, opts: { started?: number; budgetMs?: number } = {}): Promise<T> {
  const started = opts.started ?? Date.now();
  return reads.run({ started, deadline: started + (opts.budgetMs ?? ADMIN_READ_BUDGET_MS), sources: {} }, load);
}

/** Subloads use the shorter of their own budget and the enclosing request's remaining time. */
export function withAdminDeadline<T>(budgetMs: number, load: () => Promise<T>): Promise<T> {
  const parent = reads.getStore();
  const now = Date.now();
  return reads.run({ started: parent?.started ?? now, deadline: Math.min(parent?.deadline ?? Infinity, now + Math.max(1, budgetMs)), sources: parent?.sources ?? {} }, load);
}

export function remainingAdminMs(maxMs = 6000): number {
  const left = Math.min(maxMs, (reads.getStore()?.deadline ?? Date.now() + maxMs) - Date.now());
  if (left <= 0) throw new Error('read_budget_exhausted');
  return Math.max(1, Math.floor(left));
}

/** The fetch and response-body decoding both count against the request budget. */
export async function adminBounded<T>(load: () => Promise<T>, maxMs = 6000): Promise<T> {
  const ms = remainingAdminMs(maxMs);
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([load(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('read_budget_exhausted')), ms); })]);
  } finally { clearTimeout(timer!); }
}

export function adminFetch(url: string, init: RequestInit = {}, maxMs = 6000): Promise<Response> {
  const timeout = AbortSignal.timeout(remainingAdminMs(maxMs));
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return adminBounded(() => fetch(url, { ...init, signal }), maxMs);
}

export function markAdminSource(name: string, source: AdminSource): void { const c = reads.getStore(); if (c) c.sources[name] = source; }
export function deferAdminSources(...names: string[]): void {
  for (const name of names) markAdminSource(name, { status: 'deferred', fetchedAt: null });
}

/** Optional sources return null with explicit failure evidence. They never become empty tables or zero counts. */
export async function observeAdminSource<T>(name: string, load: () => Promise<T>, required = false): Promise<T | null> {
  try {
    const value = await adminBounded(load, remainingAdminMs(ADMIN_READ_BUDGET_MS));
    if (value == null) throw new Error('source_returned_no_data');
    const o = (typeof value === 'object' && value ? value : {}) as Record<string, unknown>;
    const error = typeof o.error === 'string' ? o.error : undefined;
    const source: AdminSource = {
      status: error ? 'error' : o.configured === false ? 'not_configured' : o.partial === true ? 'partial' : 'ok',
      fetchedAt: o.configured === false || o.fetchedAt === null || error ? null : typeof o.fetchedAt === 'string' ? o.fetchedAt : new Date().toISOString(),
      ...(error ? { error } : {}),
      ...(typeof o.coveredFrom === 'string' || o.coveredFrom === null ? { coveredFrom: o.coveredFrom as string | null } : {}),
      ...(typeof o.coveredTo === 'string' || o.coveredTo === null ? { coveredTo: o.coveredTo as string | null } : {}),
      ...(Array.isArray(o.missingDays) ? { missingDays: o.missingDays.filter((x): x is string => typeof x === 'string') } : {}),
    };
    if (source.fetchedAt && Number.isFinite(Date.parse(source.fetchedAt))) source.cacheAgeMs = Math.max(0, Date.now() - Date.parse(source.fetchedAt));
    markAdminSource(name, source);
    return value;
  } catch (e) {
    const error = e instanceof Error && /budget|Timeout|Abort/.test(`${e.name} ${e.message}`) ? 'read_budget_exhausted' : 'source_unavailable';
    markAdminSource(name, { status: 'error', fetchedAt: null, error });
    if (required) throw e;
    return null;
  }
}

export function adminReadMeta(): AdminReadMeta {
  const c = reads.getStore();
  const sources = { ...(c?.sources ?? {}) };
  return { generatedAt: new Date().toISOString(), durationMs: Math.max(0, Date.now() - (c?.started ?? Date.now())),
    partial: Object.values(sources).some((s) => s.status === 'error' || s.status === 'partial' || s.status === 'deferred'), sources };
}

/** SQL integer arguments are finite and bounded even for Infinity, decimals and enormous offsets. */
export function adminInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (value == null || value === '') return fallback;
  const parsed = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.trunc(parsed))) : fallback;
}
