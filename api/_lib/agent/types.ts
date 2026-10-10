// ============================================================
// The agent engine (sprint of 2026-10-10; off unless BOBBY_AGENT_ENGINE=on): what a task is.
//
// A person hands Bobby an errand ("compare these two") and Bobby does the work: it resolves what was meant,
// asks before anything is spent, fetches evidence with tools, computes in code, answers briefly, and can be
// asked again about the same result. This file is the vocabulary; nothing here calls a network.
//
// Rules the rest of the engine keeps:
//   · A task is a list of STEPS, facts written once and never edited. Its state is derived from them
//     (state.ts), so two readers can never disagree about what happened.
//   · Every economic number is a FIGURE computed by code from EVIDENCE that names its source, instrument,
//     reference date, retrieval time, unit, scale, currency and quality. The model never types a market number:
//     it writes a placeholder ({{f:id}}) and code puts the formatted figure there (present.ts).
//   · Quality is one of five words. A legitimate zero is `valid`; no data is `missing`, never zero.
//   · What a person consumes (a read of their allowance) and what a provider bills (dollars) are two ledgers.
//     A provider attempt whose cost cannot be known keeps its reservation (budget.ts): it is never freed as free.
//   · A task belongs to an owner the SERVER derived. Another owner asking for it gets nothing, not an error
//     that confirms it exists.
// ============================================================
import type { AppLanguage } from '../../../src/lib/app-language.js';

export const ENGINE_VERSION = 1;
/** Bumped with any change to the instructions or to a tool's meaning: every run records the pair it ran with. */
export const PROMPT_VERSION = 'agent-2026-10-11.1';
export const TOOLSET_VERSION = 'tools-2026-10-11.1';

export type TaskState = 'created' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancel_requested' | 'cancelled';
export type Quality = 'valid' | 'missing' | 'stale' | 'conflicting' | 'error';
export type Unit = 'price' | 'percent' | 'ratio' | 'count';

/** One thing a tool fetched, with everything needed to check it. `synthetic` marks a fixture: it proves a mechanism, never a market fact. */
export interface Evidence {
  id: string; tool: string;
  source: string; url: string | null; instrument: string | null;
  /** The date the data refers to: the last completed bar the figures use. Not when it was fetched. */
  asOf: string | null; retrievedAt: string;
  unit: Unit; scale: 1; currency: string | null;
  quality: Quality; note: string | null; synthetic?: true;
}

/** One number computed by code. `value` is null whenever quality is not `valid` or `stale`. */
export interface Figure {
  id: string;
  /** What was measured: total_return, daily_volatility, max_drawdown, worst_day, best_day, last_close, correlation. */
  metric: string;
  /** The instrument, or "A~B" for a figure about a pair. */
  subject: string;
  value: number | null; unit: Unit; currency: string | null;
  /** How it was computed, in words a reader can check: the window, the days used, the formula's name. */
  basis: string; from: string | null; to: string | null; days: number | null;
  /** For a figure that is one day's (the worst day, the best day): which day. Written by code as {{d:id}}. */
  day?: string | null;
  evidence: string[]; quality: Quality;
}

/** The full analysis, kept before anything is shortened. The presentation may not change a field of it. */
export interface Analysis {
  /** One instrument over a window, or two or three against each other. */
  kind: 'single' | 'comparison';
  subjects: string[]; windowDays: number;
  figures: Figure[]; evidence: Evidence[];
  /** What could not be established, in machine words: the presentation must say each one that matters. */
  limitations: string[];
  computedAt: string;
}

export interface Presentation {
  kind: 'explanation' | 'analysis' | 'clarification' | 'unavailable';
  /** One idea in front; the same text the voice opens with. */
  gist: string;
  /** The whole answer, figures already written in by code. */
  text: string;
  /** Figures the text used, by id, so a client can open each one's evidence. */
  figures: string[];
  references: Array<{ evidence: string; source: string; url: string | null; instrument: string | null; asOf: string | null; quality: Quality }>;
  limitations: string[];
  /** At most one thing the person could ask next; null is a normal ending. */
  next: string | null;
  /** True when code wrote the text because the model's could not be shown. */
  composedByCode: boolean;
}

/** What a metered action would do and use, shown to the person before it runs and bound to their yes. */
export interface ApprovalScope {
  action: 'read_assets';
  assets: string[]; windowDays: number; depth: 'standard';
  consumption: { reads: number };
  /** sha256 of the canonical form of the fields above together with the task and its owner. */
  digest: string;
}

export type StepKind =
  | 'received'            // the errand, as the person sent it
  | 'model_call'          // one provider attempt: its outcome, usage and cost, and what it asked for
  | 'tool_call'           // one tool run by the server: validated arguments, evidence, data
  | 'tool_refused'        // a tool the model asked for that the server did not run, and why
  | 'approval_requested'  // a metered action waits for the person
  | 'approval_granted' | 'approval_denied'
  | 'answer'              // the task's result
  | 'error'               // the task ended without a result; `code` says why
  | 'cancel_requested' | 'cancelled';

export interface Step { n: number; at: string; kind: StepKind; data: Record<string, unknown> }

export interface Task {
  id: string;
  /** Derived by the server (a salted device or session hash); never read from the request body. */
  owner: string;
  /** The salted address the errand came from, when the door knows it: what bounds a caller who invents owners. */
  address?: string | null;
  session: string; requestId: string;
  /** owner-scoped idempotency key and the digest of the body it was first used with. */
  idemKey: string; bodyDigest: string;
  language: AppLanguage; locale: string | null;
  question: string;
  /** The completed task this one follows up on, when the person is still looking at its answer. */
  parent: string | null;
  model: string; promptVersion: string; toolsetVersion: string;
  createdAt: string;
  steps: Step[];
  /** One runner at a time. `fence` grows with every claim: a stale runner's writes are refused. */
  lease: { worker: string; until: number; fence: number } | null;
  fence: number;
}

export interface TaskResult { presentation: Presentation; analysis: Analysis | null }

/** What the engine tells a client while it works. Real work only: no thoughts, no invented percentages. */
export type AgentEvent =
  | { type: 'received' }
  | { type: 'clarification_needed' }
  | { type: 'approval_pending'; scope: ApprovalScope }
  | { type: 'tool_started' | 'tool_finished'; tool: string }
  | { type: 'answer' }
  | { type: 'error'; code: string };

export interface Limits {
  /** Model calls in one task. */ maxRounds: number;
  /** Output tokens asked of the model in one call. */ maxTokens: number;
  /** Wall time of one run (a task may take several runs: before and after an approval). */ runMs: number;
  /** Provider dollars reserved by one task, all its calls together. */ taskUsd: number;
}
// 2,000 output tokens: an answer is about 400, and what the model thinks first is paid from the same allowance
// (found on 2026-10-11: at 1,200 the smaller model ran out mid-thought on one errand in three).
export const DEFAULT_LIMITS: Limits = { maxRounds: 6, maxTokens: 2000, runMs: 45_000, taskUsd: 0.25 };
