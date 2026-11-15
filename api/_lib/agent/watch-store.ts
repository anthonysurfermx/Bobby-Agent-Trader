// ============================================================
// Watches: where they live. `WatchStore` is the whole contract between the watch code and its storage, as
// AgentStore is for errands, with the same two implementations:
//   · MemoryWatchStore: every method one synchronous critical section. What the tests run against.
//   · PgWatchStore: one database function per method (docs/agent-engine/agent-watches.sql), so one transaction each.
//
// Invariants (each has a check in scripts/test-agent-watch.mts, run against both stores when a database is given):
//   1. create() is idempotent per (account, requestId): the same request returns the same watch; the same id with
//      another body is `mismatch`. An account never holds more active watches than its limit, whatever arrives at once.
//   2. Every read and every change is scoped to the account: another account's watch does not exist.
//   3. One worker looks at a watch at a time (lease and fence). A stale worker writes nothing.
//   4. A watch ends once: met, expired or cancelled. A cancel accepted before the worker's write wins.
//   5. A met watch owes exactly one notification. It is claimed before anything is sent (`sending`) and a claim
//      is never given twice: a worker that dies after claiming sends nothing more, so nobody is notified twice.
//   6. An ended watch is removed `keepDays` after it ended; an active one is never purged.
// ============================================================
import { bobbyRest, bobbyServiceHeaders } from '../bobby-db.js';
import type { TaskResult } from './types.js';
import type { Watch, WatchMet } from './watch.js';

export type WatchCreate = { state: 'new' | 'replay'; watch: Watch } | { state: 'mismatch' | 'limit' };
export interface WatchClaim { watch: Watch; fence: number }
export interface WatchDevice { tokenCiphertext: string; environment: 'production' | 'sandbox'; topic: string }
export type NewWatch = Omit<Watch, 'state' | 'endedAt' | 'checkedThrough' | 'unreadable' | 'met' | 'result' | 'seenAt' | 'push'>;

export interface WatchStore {
  create(watch: NewWatch, limit: number, now: number): Promise<WatchCreate>;
  /** The account's watches a person can still see: the active ones and those that ended, newest first. */
  list(identity: string): Promise<Watch[]>;
  get(identity: string, id: string): Promise<Watch | null>;
  cancel(identity: string, id: string, now: number): Promise<boolean>;
  seen(identity: string, id: string, now: number): Promise<boolean>;
  /** Active watches whose next look is due and that nobody holds: each comes with a lease. */
  claimDue(worker: string, leaseMs: number, limit: number, now: number): Promise<WatchClaim[]>;
  /** The look found nothing (or could not read): when to look again. */
  quiet(id: string, fence: number, through: string | null, unreadable: boolean, nextCheckAt: number): Promise<boolean>;
  met(id: string, fence: number, met: WatchMet, result: TaskResult, now: number): Promise<boolean>;
  expire(id: string, fence: number, unreadable: boolean, now: number): Promise<boolean>;
  /** Met watches that still owe their notification, each claimed for sending in the same step. */
  claimPushes(limit: number, now: number): Promise<Watch[]>;
  /** The account's devices that may be notified now: active, bound to it, with the system's permission. */
  devices(identity: string): Promise<WatchDevice[]>;
  pushed(id: string, outcome: 'sent' | 'failed'): Promise<void>;
  purge(now: number, keepDays: number, limit: number): Promise<number>;
}

const clone = <T>(value: T): T => structuredClone(value);
const at = (ms: number) => new Date(ms).toISOString();
interface Row { watch: Watch; nextCheckAt: number; lease: { worker: string; until: number } | null; fence: number }

export class MemoryWatchStore implements WatchStore {
  protected rows = new Map<string, Row>();
  protected keys = new Map<string, string>();
  /** Tests give an account its devices; nothing else does. */
  readonly deviceList = new Map<string, WatchDevice[]>();

  async create(input: NewWatch, limit: number, now: number): Promise<WatchCreate> {
    const key = `${input.identity}\n${input.requestId}`, known = this.keys.get(key);
    if (known) { const row = this.rows.get(known)!; return row.watch.bodyDigest === input.bodyDigest ? { state: 'replay', watch: clone(row.watch) } : { state: 'mismatch' }; }
    if (this.rows.has(input.id)) return { state: 'mismatch' };
    if ([...this.rows.values()].filter((row) => row.watch.identity === input.identity && row.watch.state === 'active').length >= limit) return { state: 'limit' };
    const watch: Watch = { ...clone(input), state: 'active', endedAt: null, checkedThrough: null, unreadable: false, met: null, result: null, seenAt: null, push: 'none' };
    this.rows.set(watch.id, { watch, nextCheckAt: now, lease: null, fence: 0 });
    this.keys.set(key, watch.id);
    return { state: 'new', watch: clone(watch) };
  }
  async list(identity: string): Promise<Watch[]> {
    return [...this.rows.values()].filter((row) => row.watch.identity === identity && row.watch.state !== 'cancelled').map((row) => clone(row.watch)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async get(identity: string, id: string): Promise<Watch | null> { const row = this.rows.get(id); return row && row.watch.identity === identity ? clone(row.watch) : null; }
  async cancel(identity: string, id: string, now: number): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.watch.identity !== identity) return false;
    if (row.watch.state === 'cancelled') return true;
    if (row.watch.state !== 'active') return false;
    row.watch.state = 'cancelled'; row.watch.endedAt = at(now); row.lease = null;
    return true;
  }
  async seen(identity: string, id: string, now: number): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.watch.identity !== identity || row.watch.state === 'active' || row.watch.state === 'cancelled') return false;
    row.watch.seenAt ??= at(now);
    return true;
  }
  async claimDue(worker: string, leaseMs: number, limit: number, now: number): Promise<WatchClaim[]> {
    const due = [...this.rows.values()].filter((row) => row.watch.state === 'active' && row.nextCheckAt <= now && !(row.lease && row.lease.until > now)).sort((a, b) => a.nextCheckAt - b.nextCheckAt).slice(0, limit);
    return due.map((row) => { row.fence += 1; row.lease = { worker, until: now + leaseMs }; return { watch: clone(row.watch), fence: row.fence }; });
  }
  /** The row a worker may still write to: it holds the lease and the watch has not ended meanwhile. */
  private held(id: string, fence: number): Row | null { const row = this.rows.get(id); return row && row.lease && row.fence === fence && row.watch.state === 'active' ? row : null; }
  async quiet(id: string, fence: number, through: string | null, unreadable: boolean, nextCheckAt: number): Promise<boolean> {
    const row = this.held(id, fence);
    if (!row) return false;
    if (through) row.watch.checkedThrough = through;
    row.watch.unreadable = unreadable; row.nextCheckAt = nextCheckAt; row.lease = null;
    return true;
  }
  async met(id: string, fence: number, met: WatchMet, result: TaskResult, now: number): Promise<boolean> {
    const row = this.held(id, fence);
    if (!row) return false;
    Object.assign(row.watch, { state: 'met', endedAt: at(now), met: clone(met), result: clone(result), checkedThrough: met.day, unreadable: false, push: 'pending' });
    row.lease = null;
    return true;
  }
  async expire(id: string, fence: number, unreadable: boolean, now: number): Promise<boolean> {
    const row = this.held(id, fence);
    if (!row) return false;
    Object.assign(row.watch, { state: 'expired', endedAt: at(now), unreadable });
    row.lease = null;
    return true;
  }
  async claimPushes(limit: number): Promise<Watch[]> {
    const owed = [...this.rows.values()].filter((row) => row.watch.state === 'met' && row.watch.push === 'pending').slice(0, limit);
    return owed.map((row) => { row.watch.push = 'sending'; return clone(row.watch); });
  }
  async devices(identity: string): Promise<WatchDevice[]> { return clone(this.deviceList.get(identity) ?? []); }
  async pushed(id: string, outcome: 'sent' | 'failed'): Promise<void> { const row = this.rows.get(id); if (row && row.watch.push === 'sending') row.watch.push = outcome; }
  async purge(now: number, keepDays: number, limit: number): Promise<number> {
    let gone = 0;
    for (const [id, row] of this.rows) {
      if (gone >= limit) break;
      if (row.watch.state === 'active' || !row.watch.endedAt || Date.parse(row.watch.endedAt) > now - keepDays * 86_400_000) continue;
      this.rows.delete(id); this.keys.delete(`${row.watch.identity}\n${row.watch.requestId}`); gone++;
    }
    return gone;
  }
}

export type WatchRpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
/** Storage that did not answer. Carries the function's name and the status, never an argument. */
export class WatchStorageError extends Error {
  constructor(readonly fn: string, readonly status: number | null) { super(`watch storage ${fn} ${status ?? 'network'}`); this.name = 'WatchStorageError'; }
}
/** The production transport: PostgREST with the service role, as the agent engine's (store-pg.ts). */
export const postgrestWatchRpc: WatchRpc = async (name, args) => {
  let response: Response;
  try { response = await fetch(bobbyRest(`rpc/${name}`), { method: 'POST', headers: bobbyServiceHeaders(), body: JSON.stringify(args), signal: AbortSignal.timeout(6000) }); } catch { throw new WatchStorageError(name, null); }
  if (!response.ok) throw new WatchStorageError(name, response.status);
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text) as unknown; } catch { throw new WatchStorageError(name, response.status); }
};

export class PgWatchStore implements WatchStore {
  constructor(private readonly rpc: WatchRpc) {}
  async create(watch: NewWatch, limit: number, now: number): Promise<WatchCreate> { return await this.rpc('agent_watch_create', { p_watch: watch, p_limit: limit, p_now: at(now) }) as WatchCreate; }
  async list(identity: string): Promise<Watch[]> { return (await this.rpc('agent_watch_list', { p_identity: identity }) as Watch[] | null) ?? []; }
  async get(identity: string, id: string): Promise<Watch | null> { return (await this.rpc('agent_watch_get', { p_identity: identity, p_id: id }) as Watch | null) ?? null; }
  async cancel(identity: string, id: string, now: number): Promise<boolean> { return await this.rpc('agent_watch_cancel', { p_identity: identity, p_id: id, p_now: at(now) }) === true; }
  async seen(identity: string, id: string, now: number): Promise<boolean> { return await this.rpc('agent_watch_seen', { p_identity: identity, p_id: id, p_now: at(now) }) === true; }
  async claimDue(worker: string, leaseMs: number, limit: number, now: number): Promise<WatchClaim[]> {
    return (await this.rpc('agent_watch_claim_due', { p_worker: worker, p_lease_ms: Math.round(leaseMs), p_limit: limit, p_now: at(now) }) as WatchClaim[] | null) ?? [];
  }
  async quiet(id: string, fence: number, through: string | null, unreadable: boolean, nextCheckAt: number): Promise<boolean> {
    return await this.rpc('agent_watch_quiet', { p_id: id, p_fence: fence, p_through: through, p_unreadable: unreadable, p_next: at(nextCheckAt) }) === true;
  }
  async met(id: string, fence: number, met: WatchMet, result: TaskResult, now: number): Promise<boolean> {
    return await this.rpc('agent_watch_met', { p_id: id, p_fence: fence, p_met: met, p_result: result, p_now: at(now) }) === true;
  }
  async expire(id: string, fence: number, unreadable: boolean, now: number): Promise<boolean> {
    return await this.rpc('agent_watch_expire', { p_id: id, p_fence: fence, p_unreadable: unreadable, p_now: at(now) }) === true;
  }
  async claimPushes(limit: number, now: number): Promise<Watch[]> { return (await this.rpc('agent_watch_claim_pushes', { p_limit: limit, p_now: at(now) }) as Watch[] | null) ?? []; }
  async devices(identity: string): Promise<WatchDevice[]> { return (await this.rpc('agent_watch_devices', { p_identity: identity }) as WatchDevice[] | null) ?? []; }
  async pushed(id: string, outcome: 'sent' | 'failed'): Promise<void> { await this.rpc('agent_watch_pushed', { p_id: id, p_outcome: outcome }); }
  async purge(now: number, keepDays: number, limit: number): Promise<number> { return Number(await this.rpc('agent_watch_purge', { p_now: at(now), p_keep_days: keepDays, p_limit: limit })) || 0; }
}
