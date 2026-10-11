// ============================================================
// The agent engine: where tasks live, and the three ledgers that must be exact.
//
// `AgentStore` is the whole contract between the engine and its storage. Two implementations are here:
//   · MemoryAgentStore: every method is one synchronous critical section, so it is atomic the way a
//     Postgres function is. It is what the tests run against and what states the invariants.
//   · FileAgentStore: the same store written to one JSON file after every change, for local development:
//     a task survives the process that started it ("disconnect and come back").
// Production needs these methods as database functions (one transaction each). The draft is
// docs/agent-engine/agent-engine.sql; it is NOT a migration and nothing applies it.
//
// Invariants (each has a test in scripts/test-agent-engine.mts):
//   1. begin() is idempotent per (owner, requestId): the same key with the same body returns the same task;
//      the same key with another body is `mismatch`; two owners never see each other's keys.
//   2. get() is owner-scoped: a task read by another owner is null.
//   3. One runner at a time: claim() gives a fence that grows; append() with an older fence is refused.
//   4. A step is written once: steps are append-only and numbered without gaps.
//   5. approve() checks owner, task, the waiting approval and its exact digest, and takes the person's read
//      in the same critical section. The same approval twice takes one read.
//   6. Provider money: reserve() never lets reserved + settled + unknown exceed a cap; an attempt that was
//      dispatched and never settled, or settled `unknown`, keeps its reservation.
//   7. A read is taken once per task, and given back only in the same critical section as the fact that
//      justifies it: a metered tool_call that brought no figure (`refunded`), or a cancel that ends the task
//      before any metered tool_call. An accepted cancel beats whatever the runner writes next that would end
//      or advance the task (an answer, an error, a request for approval, the start of metered work).
// ============================================================
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ApprovalScope, Step, StepKind, Task } from './types.js';

export type Begin = { state: 'new' | 'replay'; task: Task } | { state: 'mismatch' | 'crowded' };
export type Approve = { state: 'granted' | 'already'; remaining: number | null } | { state: 'not_found' | 'not_waiting' | 'mismatch' | 'limit' };
export type ReserveRefusal = 'not_configured' | 'task_cap' | 'budget_exhausted' | 'work_unresolved';
export type Reserve = { ok: true; attemptId: string } | { ok: false; code: ReserveRefusal };
export type Outcome = 'settled' | 'no_charge' | 'unknown';
export interface Attempt { id: string; task: string; partition: string; model: string; reserveUsd: number; state: 'reserved' | 'dispatched' | Outcome; actualUsd: number | null; at: string }
export interface Budget { partition: string; capUsd: number; taskCapUsd: number }

export interface AgentStore {
  begin(task: Omit<Task, 'steps' | 'lease' | 'fence'>, received: Record<string, unknown>, now: number): Promise<Begin>;
  get(owner: string, id: string): Promise<Task | null>;
  /** The last completed task of this owner in this session, for a follow-up. */
  latestCompleted(owner: string, session: string): Promise<Task | null>;
  claim(id: string, worker: string, leaseMs: number, now: number): Promise<{ fence: number; task: Task } | null>;
  append(id: string, fence: number, kind: StepKind, data: Record<string, unknown>, now: number): Promise<Step | null>;
  release(id: string, fence: number): Promise<void>;
  approve(owner: string, id: string, digest: string, now: number): Promise<Approve>;
  deny(owner: string, id: string, now: number): Promise<boolean>;
  cancel(owner: string, id: string, now: number): Promise<boolean>;
  refund(id: string): Promise<void>;
  remaining(owner: string, now: number): Promise<number | null>;
  reserve(budget: Budget, task: string, model: string, reserveUsd: number, now: number): Promise<Reserve>;
  dispatch(attemptId: string): Promise<void>;
  settle(attemptId: string, outcome: Outcome, actualUsd: number | null): Promise<void>;
  /** What a partition holds: settled dollars, plus every reservation that is not known to be free. */
  committed(partition: string): Promise<number>;
}

const clone = <T>(value: T): T => structuredClone(value);
const DAY_MS = 86_400_000;
/** Steps after which a task takes no more steps from a runner. */
const FINAL: readonly StepKind[] = ['answer', 'error', 'cancelled', 'approval_denied'];
export const isFinal = (task: Pick<Task, 'steps'>) => task.steps.some((step) => FINAL.includes(step.kind));
/** What a runner may not write once the person's cancel was accepted: the cancel ends the task instead. */
const CANCEL_BEATS: readonly StepKind[] = ['answer', 'error', 'approval_requested', 'cancelled', 'tool_started'];
/** The approval a task is waiting on: requested, and neither granted nor denied since. */
export function waitingApproval(task: Pick<Task, 'steps'>): ApprovalScope | null {
  let scope: ApprovalScope | null = null;
  for (const step of task.steps) {
    if (step.kind === 'approval_requested') scope = step.data.scope as ApprovalScope;
    else if (step.kind === 'approval_granted' || step.kind === 'approval_denied') scope = null;
  }
  return scope;
}

interface State { tasks: Record<string, Task>; keys: Record<string, string>; reads: Record<string, { task: string; owner: string; address: string | null; day: string; units: number }>; attempts: Record<string, Attempt>; seq: number }

export class MemoryAgentStore implements AgentStore {
  protected state: State = { tasks: {}, keys: {}, reads: {}, attempts: {}, seq: 0 };
  /**
   * Reads a person may use in a UTC day; null: no allowance is enforced (the caller decides that, never the client).
   * An address (the network a request came from) may use four times that and start `tasksPerAddress` errands a day:
   * an owner is derived from a header a caller chooses, so the owner's own allowance is no bound by itself.
   */
  constructor(protected readonly readsPerDay: number | null = 6, protected readonly tasksPerAddress = 120) {}
  protected changed(): void { /* the file store writes here */ }
  protected load(): void { /* the file store reads here: two processes may share one file */ }

  async begin(input: Omit<Task, 'steps' | 'lease' | 'fence'>, received: Record<string, unknown>, now: number): Promise<Begin> {
    this.load();
    // One key and one clock, as in the database: the request's id, and the store's own `now` for the errand's day.
    const key = `${input.owner}\n${input.requestId}`;
    const known = this.state.keys[key];
    if (known) {
      const task = this.state.tasks[known];
      return task.bodyDigest === input.bodyDigest ? { state: 'replay', task: clone(task) } : { state: 'mismatch' };
    }
    if (this.state.tasks[input.id]) return { state: 'mismatch' };
    const today = new Date(now).toISOString().slice(0, 10);
    if (input.address && Object.values(this.state.tasks).filter((task) => task.address === input.address && task.createdAt.slice(0, 10) === today).length >= this.tasksPerAddress) return { state: 'crowded' };
    const task: Task = { ...clone(input), createdAt: new Date(now).toISOString(), steps: [{ n: 1, at: new Date(now).toISOString(), kind: 'received', data: clone(received) }], lease: null, fence: 0 };
    this.state.tasks[task.id] = task;
    this.state.keys[key] = task.id;
    this.changed();
    return { state: 'new', task: clone(task) };
  }

  async get(owner: string, id: string): Promise<Task | null> {
    this.load();
    const task = this.state.tasks[id];
    return task && task.owner === owner ? clone(task) : null;
  }

  async latestCompleted(owner: string, session: string): Promise<Task | null> {
    this.load();
    const done = Object.values(this.state.tasks).filter((task) => task.owner === owner && task.session === session && task.steps.some((step) => step.kind === 'answer'));
    done.sort((a, b) => a.steps.at(-1)!.at.localeCompare(b.steps.at(-1)!.at));
    return done.length ? clone(done.at(-1)!) : null;
  }

  async claim(id: string, worker: string, leaseMs: number, now: number): Promise<{ fence: number; task: Task } | null> {
    this.load();
    const task = this.state.tasks[id];
    if (!task || isFinal(task)) return null;
    if (task.lease && task.lease.until > now) return null;
    // A cancel that was accepted while a runner held the task, and that the runner never completed, is completed here.
    if (task.steps.some((step) => step.kind === 'cancel_requested')) { this.endCancelled(task, now, 'store'); this.changed(); return null; }
    if (waitingApproval(task)) return null;
    task.fence += 1;
    task.lease = { worker, until: now + leaseMs, fence: task.fence };
    this.changed();
    return { fence: task.fence, task: clone(task) };
  }

  async append(id: string, fence: number, kind: StepKind, data: Record<string, unknown>, now: number): Promise<Step | null> {
    this.load();
    const task = this.state.tasks[id];
    // A runner that lost its lease, or a task that already ended, writes nothing: a late result has nowhere to go.
    if (!task || !task.lease || task.lease.fence !== fence || isFinal(task)) return null;
    // The person's cancel and a runner's result can cross: the runner looked, the cancel was accepted, the result
    // arrives here. Decided in this critical section, not by the runner's earlier look: the cancel wins.
    // The result of a metered tool is one of those: the cancel was accepted while the sources were asked, the person
    // will see nothing of it, and so the read that paid for it goes back.
    if ((CANCEL_BEATS.includes(kind) || (kind === 'tool_call' && data.metered === true)) && task.steps.some((step) => step.kind === 'cancel_requested')) { this.endCancelled(task, now, 'runner', data.readerUsd); this.changed(); return null; }
    // A metered tool that brought no figure gives the read back in the write that says so.
    if (kind === 'tool_call' && data.metered === true && data.refunded === true) delete this.state.reads[id];
    const step: Step = { n: task.steps.length + 1, at: new Date(now).toISOString(), kind, data: clone(data) };
    task.steps.push(step);
    this.changed();
    return clone(step);
  }

  async release(id: string, fence: number): Promise<void> {
    this.load();
    const task = this.state.tasks[id];
    if (task?.lease?.fence !== fence) return;
    task.lease = null;
    if (!isFinal(task) && task.steps.some((step) => step.kind === 'cancel_requested')) this.endCancelled(task, Date.parse(task.steps.at(-1)!.at), 'store');
    this.changed();
  }

  async approve(owner: string, id: string, digest: string, now: number): Promise<Approve> {
    this.load();
    const task = this.state.tasks[id];
    if (!task || task.owner !== owner) return { state: 'not_found' };
    const granted = task.steps.findLast((step) => step.kind === 'approval_granted');
    if (granted && granted.data.digest === digest && !waitingApproval(task)) return { state: 'already', remaining: this.left(owner, now) };
    const scope = waitingApproval(task);
    if (!scope || isFinal(task) || task.steps.some((step) => step.kind === 'cancel_requested')) return { state: 'not_waiting' };
    if (scope.digest !== digest) return { state: 'mismatch' };
    // The person's read and the grant are one fact: neither exists without the other.
    const day = new Date(now).toISOString().slice(0, 10);
    if (!this.state.reads[id]) {
      if (this.readsPerDay !== null) {
        const used = Object.values(this.state.reads).filter((read) => read.owner === owner && read.day === day).reduce((sum, read) => sum + read.units, 0);
        if (used + scope.consumption.reads > this.readsPerDay) return { state: 'limit' };
        const around = task.address ? Object.values(this.state.reads).filter((read) => read.address === task.address && read.day === day).reduce((sum, read) => sum + read.units, 0) : 0;
        if (around + scope.consumption.reads > this.readsPerDay * 4) return { state: 'limit' };
      }
      this.state.reads[id] = { task: id, owner, address: task.address ?? null, day, units: scope.consumption.reads };
    }
    task.steps.push({ n: task.steps.length + 1, at: new Date(now).toISOString(), kind: 'approval_granted', data: { digest, scope: clone(scope) } });
    this.changed();
    return { state: 'granted', remaining: this.left(owner, now) };
  }

  async deny(owner: string, id: string, now: number): Promise<boolean> {
    this.load();
    const task = this.state.tasks[id];
    if (!task || task.owner !== owner || !waitingApproval(task) || isFinal(task)) return false;
    task.steps.push({ n: task.steps.length + 1, at: new Date(now).toISOString(), kind: 'approval_denied', data: {} });
    this.changed();
    return true;
  }

  async cancel(owner: string, id: string, now: number): Promise<boolean> {
    this.load();
    const task = this.state.tasks[id];
    if (!task || task.owner !== owner || isFinal(task)) return false;
    const asked = task.steps.some((step) => step.kind === 'cancel_requested');
    const idle = !task.lease || task.lease.until <= now;
    if (!asked) task.steps.push({ n: task.steps.length + 1, at: new Date(now).toISOString(), kind: 'cancel_requested', data: {} });
    // Nobody is running it (or whoever was never came back): it is cancelled now. A runner in flight sees the
    // request at its next step, and its release() or the next claim() completes it if it does not.
    if (idle) this.endCancelled(task, now, 'store');
    if (!asked || idle) this.changed();
    return true;
  }

  /** Writes `cancelled`. A read taken for a metered action that never ran asked no source: it goes back in the same critical section. */
  protected endCancelled(task: Task, now: number, by: string, readerUsd?: unknown): void {
    task.lease = null;
    const ran = task.steps.some((step) => step.kind === 'tool_call' && step.data.metered === true);
    const givenBack = !ran && Boolean(this.state.reads[task.id]);
    if (givenBack) delete this.state.reads[task.id];
    // What a second reader cost before the cancel discarded its result stays on the record.
    task.steps.push({ n: task.steps.length + 1, at: new Date(now).toISOString(), kind: 'cancelled', data: { by, ...(givenBack ? { readGivenBack: true } : {}), ...(typeof readerUsd === 'number' && Number.isFinite(readerUsd) && readerUsd > 0 ? { readerUsd } : {}) } });
  }

  async refund(id: string): Promise<void> {
    this.load();
    if (this.state.reads[id]) { delete this.state.reads[id]; this.changed(); }
  }

  async remaining(owner: string, now: number): Promise<number | null> { this.load(); return this.left(owner, now); }

  async reserve(budget: Budget, task: string, model: string, reserveUsd: number, now: number): Promise<Reserve> {
    this.load();
    // A cap that is not a number (NaN, Infinity) is no cap anybody set: refused, as the database refuses it.
    if (![budget.capUsd, budget.taskCapUsd, reserveUsd].every(Number.isFinite) || !(budget.capUsd > 0) || !(budget.taskCapUsd > 0) || !(reserveUsd > 0)) return { ok: false, code: 'not_configured' };
    const mine = Object.values(this.state.attempts).filter((attempt) => attempt.task === task);
    // An attempt that left and never came back may have been billed: no blind second attempt for the same task.
    if (mine.some((attempt) => attempt.state === 'dispatched' || attempt.state === 'unknown')) return { ok: false, code: 'work_unresolved' };
    if (mine.reduce((sum, attempt) => sum + held(attempt), 0) + reserveUsd > budget.taskCapUsd + 1e-9) return { ok: false, code: 'task_cap' };
    // No await between the check and the write: this method is one critical section (the test with thirty at once found the await that was here).
    if (this.held(budget.partition) + reserveUsd > budget.capUsd + 1e-9) return { ok: false, code: 'budget_exhausted' };
    const id = `att_${(++this.state.seq).toString(36)}_${now.toString(36)}`;
    this.state.attempts[id] = { id, task, partition: budget.partition, model, reserveUsd, state: 'reserved', actualUsd: null, at: new Date(now).toISOString() };
    this.changed();
    return { ok: true, attemptId: id };
  }

  async dispatch(attemptId: string): Promise<void> {
    this.load();
    const attempt = this.state.attempts[attemptId];
    if (!attempt || attempt.state !== 'reserved') throw new Error('attempt is not reserved');
    attempt.state = 'dispatched';
    this.changed();
  }

  async settle(attemptId: string, outcome: Outcome, actualUsd: number | null): Promise<void> {
    this.load();
    const attempt = this.state.attempts[attemptId];
    if (!attempt) throw new Error('unknown attempt');
    // Settled once. A second settle of the same attempt changes nothing: the first word stands.
    if (attempt.state !== 'reserved' && attempt.state !== 'dispatched') return;
    attempt.state = outcome;
    // A cost that is not a number is not known: the reservation stands for it, never NaN (which no cap can refuse).
    attempt.actualUsd = outcome === 'settled' ? Math.max(0, actualUsd !== null && Number.isFinite(actualUsd) ? actualUsd : attempt.reserveUsd) : outcome === 'no_charge' ? 0 : null;
    this.changed();
  }

  async committed(partition: string): Promise<number> { this.load(); return this.held(partition); }
  private held(partition: string): number { return Object.values(this.state.attempts).filter((attempt) => attempt.partition === partition).reduce((sum, attempt) => sum + held(attempt), 0); }
  private left(owner: string, now: number): number | null {
    if (this.readsPerDay === null) return null;
    const day = new Date(now).toISOString().slice(0, 10);
    return Math.max(0, this.readsPerDay - Object.values(this.state.reads).filter((read) => read.owner === owner && read.day === day).reduce((sum, read) => sum + read.units, 0));
  }

  /** For tests and reports: every attempt, as recorded. */
  attempts(): Attempt[] { this.load(); return Object.values(this.state.attempts).map(clone); }
  readsTaken(): number { this.load(); return Object.keys(this.state.reads).length; }
}

/** What an attempt holds of a cap: its real cost once known, nothing once known free, its whole reservation otherwise. */
const held = (attempt: Attempt): number => (attempt.state === 'settled' ? attempt.actualUsd ?? attempt.reserveUsd : attempt.state === 'no_charge' ? 0 : attempt.reserveUsd);

/** The same store on disk, for local development only: one process at a time writes; each reads before it acts. */
export class FileAgentStore extends MemoryAgentStore {
  constructor(private readonly path: string, readsPerDay: number | null = 6) { super(readsPerDay); this.load(); }
  protected load(): void { if (existsSync(this.path)) this.state = JSON.parse(readFileSync(this.path, 'utf8')) as State; }
  protected changed(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const next = `${this.path}.${process.pid}.tmp`;
    writeFileSync(next, JSON.stringify(this.state));
    renameSync(next, this.path);
  }
}

export { DAY_MS };
