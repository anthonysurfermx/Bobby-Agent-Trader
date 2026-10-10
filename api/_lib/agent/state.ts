// ============================================================
// The agent engine: a task's state, derived from its steps and from nothing else.
// ============================================================
import { isFinal, waitingApproval } from './store.js';
import type { AgentEvent, ApprovalScope, Task, TaskResult, TaskState } from './types.js';

export function taskState(task: Pick<Task, 'steps' | 'lease'>, now: number): TaskState {
  const kinds = task.steps.map((step) => step.kind);
  if (kinds.includes('answer')) return 'completed';
  if (kinds.includes('cancelled') || kinds.includes('approval_denied')) return 'cancelled';
  if (kinds.includes('error')) return 'failed';
  if (kinds.includes('cancel_requested')) return 'cancel_requested';
  if (waitingApproval(task)) return 'waiting_approval';
  if (task.lease && task.lease.until > now) return 'running';
  // Steps beyond the first with nobody running it: a run ended without a result (a crash, a time limit). It can be run again.
  return task.steps.length > 1 ? 'running' : 'created';
}

export const taskResult = (task: Pick<Task, 'steps'>): TaskResult | null => (task.steps.find((step) => step.kind === 'answer')?.data.result as TaskResult | undefined) ?? null;
export const taskError = (task: Pick<Task, 'steps'>): string | null => (task.steps.find((step) => step.kind === 'error')?.data.code as string | undefined) ?? null;

/** What a client may be told of the work so far. Tool names only: never arguments, thoughts or provider text. */
export function taskEvents(task: Pick<Task, 'steps'>): AgentEvent[] {
  const events: AgentEvent[] = [];
  for (const step of task.steps) {
    if (step.kind === 'received') events.push({ type: 'received' });
    else if (step.kind === 'tool_call') events.push({ type: 'tool_started', tool: String(step.data.tool) }, { type: 'tool_finished', tool: String(step.data.tool) });
    else if (step.kind === 'approval_requested') events.push({ type: 'approval_pending', scope: step.data.scope as ApprovalScope });
    else if (step.kind === 'answer') events.push((step.data.result as TaskResult).presentation.kind === 'clarification' ? { type: 'clarification_needed' } : { type: 'answer' });
    else if (step.kind === 'error') events.push({ type: 'error', code: String(step.data.code) });
  }
  return events;
}

/** What the person consumed and what the providers were asked, as the steps recorded it. */
export function taskUsage(task: Pick<Task, 'steps'>): { modelCalls: number; toolCalls: number; usd: number; unknownUsd: number; reads: number } {
  let modelCalls = 0, toolCalls = 0, usd = 0, unknownUsd = 0, reads = 0;
  for (const step of task.steps) {
    if (step.kind === 'model_call') { modelCalls++; if (step.data.outcome === 'unknown') unknownUsd += Number(step.data.reservedUsd ?? 0); else usd += Number(step.data.usd ?? 0); }
    else if (step.kind === 'tool_call') toolCalls++;
    else if (step.kind === 'approval_granted') reads += Number((step.data.scope as ApprovalScope | undefined)?.consumption.reads ?? 0);
  }
  return { modelCalls, toolCalls, usd: Number(usd.toFixed(6)), unknownUsd: Number(unknownUsd.toFixed(6)), reads };
}

export { isFinal, waitingApproval };
