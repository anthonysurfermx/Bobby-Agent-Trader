// PostgREST helpers shared by the migration tools. Both projects are reached
// the same way (URL + service key), so every tool takes a `--side` and the
// matching env: SOURCE_SUPABASE_URL/SOURCE_SUPABASE_SERVICE_KEY (legacy) and
// TARGET_SUPABASE_URL/TARGET_SUPABASE_SERVICE_KEY (bobby-protocol).
import { createHash } from 'node:crypto';

export type Side = 'source' | 'target';

export interface Project { side: Side; url: string; key: string; ref: string }

export function project(side: Side): Project {
  const prefix = side === 'source' ? 'SOURCE' : 'TARGET';
  const url = (process.env[`${prefix}_SUPABASE_URL`] || '').replace(/\/+$/, '');
  const key = process.env[`${prefix}_SUPABASE_SERVICE_KEY`] || '';
  if (!url || !key) throw new Error(`${prefix}_SUPABASE_URL and ${prefix}_SUPABASE_SERVICE_KEY are required`);
  const ref = url.match(/https:\/\/([a-z]+)\.supabase\.co/)?.[1] || url;
  return { side, url, key, ref };
}

export function headers(p: Project, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: p.key, Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json', ...extra };
}

export async function count(p: Project, table: string, filter = ''): Promise<number | null> {
  const r = await fetch(`${p.url}/rest/v1/${table}?select=*&limit=1${filter}`, { headers: headers(p, { Prefer: 'count=exact', Range: '0-0' }) });
  if (r.status === 404) return null; // table does not exist on this side
  if (!r.ok && r.status !== 206) throw new Error(`${table}: count HTTP ${r.status} ${await r.text()}`);
  const range = r.headers.get('content-range') || '';
  const total = range.split('/')[1];
  return total && total !== '*' ? Number(total) : 0;
}

/** Every row, in a stable order, page by page. */
export async function* rows<T = Record<string, unknown>>(p: Project, table: string, orderBy: string[], select = '*', pageSize = 1000): AsyncGenerator<T[]> {
  const order = orderBy.map((c) => `${c}.asc`).join(',');
  let offset = 0;
  for (;;) {
    const r = await fetch(`${p.url}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=${order}&offset=${offset}&limit=${pageSize}`, { headers: headers(p) });
    if (!r.ok) throw new Error(`${table}: page HTTP ${r.status} ${await r.text()}`);
    const page = (await r.json()) as T[];
    if (!page.length) return;
    yield page;
    if (page.length < pageSize) return;
    offset += page.length;
  }
}

/** Deterministic hash of a row set: sha256 over canonical JSON of each row, sorted by pk. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function pkOf(row: Record<string, unknown>, pk: string[]): string {
  return pk.map((c) => String(row[c])).join('|');
}

export class RollingHash {
  private h = createHash('sha256');
  private n = 0;
  add(row: Record<string, unknown>) { this.h.update(canonical(row)); this.h.update('\n'); this.n += 1; }
  digest() { return { rows: this.n, sha256: this.h.digest('hex') }; }
}

export function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }

/** Call a PostgREST RPC with the service key. */
export async function rpc<T = unknown>(p: Project, fn: string, args: Record<string, unknown> = {}): Promise<{ status: number; body: T | null; text: string }> {
  const r = await fetch(`${p.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: headers(p), body: JSON.stringify(args) });
  const text = await r.text();
  let body: T | null = null;
  try { body = JSON.parse(text) as T; } catch { /* not json */ }
  return { status: r.status, body, text };
}

export function log(msg: string) { console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`); }
