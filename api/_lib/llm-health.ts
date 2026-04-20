// ============================================================
// llm-health — cheap observability for LLM provider outages.
// Reuses the existing agent_events pipeline (logHarnessEvent) with
// event_type='llm_failure'. No new migration required.
//
// Purpose: distinguish "market quiet, no signals" from "OpenAI 500s flooding
// us" in Vercel logs. COUNT of llm_failure rows in last 1h gives the alert.
// Fires-and-forgets — never blocks the caller.
// ============================================================

import { logHarnessEvent } from './harness-events';

export type LlmFailureKind =
  | 'rate_limit'     // 429
  | 'server_error'   // 5xx
  | 'auth'           // 401/403
  | 'timeout'        // fetch timeout
  | 'parse_error'    // response shape invalid
  | 'unknown';

export interface LlmFailureEvent {
  endpoint: string;      // e.g. 'agent-run', 'bobby-cycle' — goes into meta.endpoint
  provider: 'openai' | 'anthropic';
  model?: string;
  kind: LlmFailureKind;
  httpStatus?: number;
  message?: string;
  runId?: string;
}

/** Classify an HTTP status into a failure kind. */
export function classifyHttpStatus(status: number): LlmFailureKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server_error';
  return 'unknown';
}

/**
 * Fire-and-forget log of an LLM failure. Never throws. Safe to call in hot paths.
 * Writes to agent_events via the shared logger.
 */
export function recordLlmFailure(evt: LlmFailureEvent): void {
  logHarnessEvent({
    run_id: evt.runId || `llm-fail-${Date.now()}`,
    agent: 'harness',
    event_type: 'llm_failure',
    reason: evt.message ? evt.message.slice(0, 500) : `${evt.provider} ${evt.kind}`,
    meta: {
      provider: evt.provider,
      model: evt.model ?? null,
      kind: evt.kind,
      http_status: evt.httpStatus ?? null,
      endpoint: evt.endpoint,
    },
  });
}
