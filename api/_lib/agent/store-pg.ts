// ============================================================
// The agent engine on Postgres: AgentStore as calls to the functions of docs/agent-engine/agent-engine.sql.
// Every method is one function, so one transaction: the atomicity the memory store gets from being
// single-threaded, the database gives with row locks and advisory locks.
//
// The transport is injected: `rpc(name, args)` calls a function with named arguments and returns its value. In
// production it is PostgREST with the service role (`postgrestAgentRpc`, below); in the tests it is a
// node-postgres pool against a LOCAL scratch database. There is no production database for the engine yet: the
// SQL is a draft and nothing applies it (README, "What is missing"), so that transport answers 404 until it is.
// A transport failure throws: the engine's callers treat storage that cannot answer as "do not go on".
// ============================================================
import { bobbyRest, bobbyServiceHeaders } from '../bobby-db.js';
import type { AgentStore, Approve, Begin, Budget, Outcome, Reserve } from './store.js';
import type { Step, StepKind, Task } from './types.js';

export type AgentRpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
const at = (ms: number) => new Date(ms).toISOString();
const UNWRITABLE = /\u0000|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
/**
 * jsonb refuses U+0000 and half a surrogate pair. A question or a model's reply that holds one must not make an
 * errand unwritable (a paid call whose step cannot be stored would be paid again): each is written as U+FFFD.
 */
const clean = (text: string) => text.replace(UNWRITABLE, '\ufffd');
/** Values and KEYS: the keys of a tool's input are the model's too, stored before anything validates them. */
const writable = <T>(value: T): T => JSON.parse(JSON.stringify(value, (_key, part) => (typeof part === 'string' ? clean(part) : part && typeof part === 'object' && !Array.isArray(part) ? Object.fromEntries(Object.entries(part as Record<string, unknown>).map(([key, inner]) => [clean(key), inner])) : part))) as T;

/** Storage that did not answer, or answered something that is not an answer. Carries the function's name and the status, never an argument. */
export class AgentStorageError extends Error {
  constructor(readonly fn: string, readonly status: number | null) { super(`agent storage ${fn} ${status ?? 'network'}`); this.name = 'AgentStorageError'; }
}
/**
 * The production transport: PostgREST `rpc/<function>` with the service role, as api/_lib/briefings/db.ts does.
 * Named arguments travel as one JSON object (a jsonb argument is a nested object, not a string). Anything but a
 * 2xx with a readable body throws: the door answers 503 and the errand stays as the store last recorded it.
 */
export const postgrestAgentRpc: AgentRpc = async (name, args) => {
  let response: Response;
  try { response = await fetch(bobbyRest(`rpc/${name}`), { method: 'POST', headers: bobbyServiceHeaders(), body: JSON.stringify(args), signal: AbortSignal.timeout(6000) }); } catch { throw new AgentStorageError(name, null); }
  if (!response.ok) throw new AgentStorageError(name, response.status);
  const text = await response.text();
  if (!text) return null;   // a function that returns nothing
  try { return JSON.parse(text) as unknown; } catch { throw new AgentStorageError(name, response.status); }
};

export class PgAgentStore implements AgentStore {
  constructor(private readonly rpc: AgentRpc, private readonly readsPerDay: number | null = 6, private readonly tasksPerAddress = 120) {}

  async begin(task: Omit<Task, 'steps' | 'lease' | 'fence'>, received: Record<string, unknown>, now: number): Promise<Begin> {
    return await this.rpc('agent_begin', { p_task: writable(task), p_received: writable(received), p_now: at(now), p_tasks_per_address: this.tasksPerAddress }) as Begin;
  }
  async get(owner: string, id: string): Promise<Task | null> { return (await this.rpc('agent_get', { p_owner: owner, p_id: id }) as Task | null) ?? null; }
  async latestCompleted(owner: string, session: string): Promise<Task | null> { return (await this.rpc('agent_latest_completed', { p_owner: owner, p_session: session }) as Task | null) ?? null; }
  async claim(id: string, worker: string, leaseMs: number, now: number): Promise<{ fence: number; task: Task } | null> {
    return (await this.rpc('agent_claim', { p_id: id, p_worker: worker, p_lease_ms: Math.round(leaseMs), p_now: at(now) }) as { fence: number; task: Task } | null) ?? null;
  }
  async append(id: string, fence: number, kind: StepKind, data: Record<string, unknown>, now: number): Promise<Step | null> {
    return (await this.rpc('agent_append', { p_id: id, p_fence: fence, p_kind: kind, p_data: writable(data), p_now: at(now) }) as Step | null) ?? null;
  }
  async release(id: string, fence: number): Promise<void> { await this.rpc('agent_release', { p_id: id, p_fence: fence }); }
  async approve(owner: string, id: string, digest: string, now: number): Promise<Approve> {
    return await this.rpc('agent_approve', { p_owner: owner, p_id: id, p_digest: digest, p_now: at(now), p_reads_per_day: this.readsPerDay }) as Approve;
  }
  async deny(owner: string, id: string, now: number): Promise<boolean> { return await this.rpc('agent_deny', { p_owner: owner, p_id: id, p_now: at(now) }) === true; }
  async cancel(owner: string, id: string, now: number): Promise<boolean> { return await this.rpc('agent_cancel', { p_owner: owner, p_id: id, p_now: at(now) }) === true; }
  async refund(id: string): Promise<void> { await this.rpc('agent_refund', { p_id: id }); }
  async remaining(owner: string, now: number): Promise<number | null> {
    const left = await this.rpc('agent_remaining', { p_owner: owner, p_now: at(now), p_reads_per_day: this.readsPerDay });
    return left === null || left === undefined ? null : Number(left);
  }
  async reserve(budget: Budget, task: string, model: string, reserveUsd: number, now: number): Promise<Reserve> {
    // A number that is not one (NaN, Infinity) is refused here: it must never reach a cap as a null.
    if (![budget.capUsd, budget.taskCapUsd, reserveUsd].every(Number.isFinite)) return { ok: false, code: 'not_configured' };
    return await this.rpc('agent_reserve', { p_partition: budget.partition, p_cap: budget.capUsd, p_task_cap: budget.taskCapUsd, p_task: task, p_model: model, p_reserve: reserveUsd, p_now: at(now) }) as Reserve;
  }
  async dispatch(attemptId: string): Promise<void> { await this.rpc('agent_dispatch', { p_attempt: attemptId }); }
  async settle(attemptId: string, outcome: Outcome, actualUsd: number | null): Promise<void> {
    await this.rpc('agent_settle', { p_attempt: attemptId, p_outcome: outcome, p_actual: actualUsd !== null && Number.isFinite(actualUsd) ? actualUsd : null });
  }
  async committed(partition: string): Promise<number> { return Number(await this.rpc('agent_committed', { p_partition: partition })); }
}
