// ============================================================
// llm — single OpenAI chat-completions wrapper for all agents.
// Replaces the per-endpoint copies of callClaude(): one place for
// timeout/abort, retry with backoff, and llm-health reporting.
//
// Retry policy: 429 and 5xx are transient (backoff and retry), other
// 4xx are permanent (fail immediately). Network errors and timeouts
// retry like 5xx.
//
// This module is also the reunification point if we ever move debates
// back to Anthropic: swap the provider here, not in every endpoint.
// ============================================================

import { recordLlmFailure, classifyHttpStatus } from './llm-health.js';
import { alertProviderCredit } from './provider-alert.js';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const BACKOFF_MS = [500, 1500];

export interface LlmToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmCallOptions {
  /** Caller name for llm-health logs, e.g. 'agent-run', 'bobby-cycle'. */
  endpoint: string;
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  /** When set, forces a function call and parses its arguments. */
  tool?: LlmToolSchema;
}

export interface LlmResult {
  text: string;
  toolInput: Record<string, unknown> | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Call OpenAI with retry/backoff. Throws after the last failed attempt. */
export async function callLlm(opts: LlmCallOptions): Promise<LlmResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const model = opts.model || 'gpt-4o';
  const timeoutMs = opts.timeoutMs ?? 30000;

  const body: Record<string, unknown> = {
    model,
    max_tokens: opts.maxTokens ?? 1024,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
  };
  if (opts.tool) {
    body.tools = [{
      type: 'function',
      function: {
        name: opts.tool.name,
        description: opts.tool.description,
        parameters: opts.tool.parameters,
      },
    }];
    body.tool_choice = { type: 'function', function: { name: opts.tool.name } };
  }

  let lastError: Error = new Error('LLM call failed');
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(OPENAI_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        recordLlmFailure({
          endpoint: opts.endpoint,
          provider: 'openai',
          model,
          kind: classifyHttpStatus(res.status),
          httpStatus: res.status,
          message: `http_${res.status}`,
        });
        // Exhausted credit never recovers through a retry: alert the owner and stop.
        const refusal = refusalCode((() => { try { return JSON.parse(errBody); } catch { return null; } })());
        // Status and refusal class only: provider bodies can echo the reader's question.
        console.error('[llm] provider error', 'openai', model, res.status, refusal ?? '');
        if (refusal === 'insufficient_quota' || refusal === 'billing_hard_limit_reached') {
          alertProviderCredit('openai', refusal, opts.endpoint);
          throw new LlmHttpError(res.status, `OpenAI ${model}: ${res.status} ${refusal}`, refusal);
        }
        const retriable = res.status === 429 || res.status >= 500;
        lastError = new Error(`OpenAI ${model}: ${res.status} ${errBody.slice(0, 200)}`);
        if (!retriable || attempt === BACKOFF_MS.length) throw lastError;
        await sleep(BACKOFF_MS[attempt]);
        continue;
      }

      const data = await res.json() as {
        choices: Array<{
          message: {
            content: string | null;
            tool_calls?: Array<{ function: { name: string; arguments: string } }>;
          };
        }>;
      };
      const message = data.choices?.[0]?.message;
      const text = message?.content || '';
      let toolInput: Record<string, unknown> | null = null;
      const args = message?.tool_calls?.[0]?.function?.arguments;
      if (args) {
        try {
          toolInput = JSON.parse(args);
        } catch {
          recordLlmFailure({
            endpoint: opts.endpoint,
            provider: 'openai',
            model,
            kind: 'parse_error',
            message: `tool_call args not valid JSON: ${args.slice(0, 200)}`,
          });
        }
      }
      return { text, toolInput };
    } catch (e: unknown) {
      const err = e as Error;
      if (err === lastError || err instanceof LlmHttpError) throw err; // non-retriable HTTP error re-thrown above
      const isTimeout = err.name === 'AbortError';
      lastError = isTimeout
        ? new Error(`LLM call timed out after ${timeoutMs}ms (${model})`)
        : err;
      recordLlmFailure({
        endpoint: opts.endpoint,
        provider: 'openai',
        model,
        kind: isTimeout ? 'timeout' : 'unknown',
        message: lastError.message.slice(0, 300),
      });
      if (attempt === BACKOFF_MS.length) throw lastError;
      await sleep(BACKOFF_MS[attempt]);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

// ============================================================
// completeJson — the per-model adapter for structured answers (the desk's analysis levels).
// Every provider and model family has its own request shape and the adapter owns it, so a model swap
// never reaches the wire with the wrong parameters (docs/ai/2026-09-29-bobby-intelligence-brief.md §2c:
// GPT-6 rejects `max_tokens` and any temperature but 1):
//   · GPT-6 / GPT-5 / o-series: max_completion_tokens (reasoning counts inside it), no temperature,
//     reasoning_effort, a strict JSON schema;
//   · GPT-4o family: max_tokens + temperature 0.2, a strict JSON schema;
//   · Claude: output_config { effort, format: json_schema }; max_tokens covers thinking and the answer.
// An answer cut by the token limit is an error, never a partial argument. Each call appends its tokens,
// cost and latency to `usage` (api/_lib/llm-usage.ts writes them to bobby_llm_usage).
// ============================================================

export interface ModelSpec {
  provider: 'openai' | 'anthropic';
  model: string;
  effort?: 'low' | 'medium' | 'high';
  /** Output ceiling: thinking/reasoning plus the answer. */
  maxTokens: number;
  timeoutMs: number;
}
export interface JsonSchemaSpec { name: string; schema: Record<string, unknown> }
export interface LlmUsage {
  provider: 'openai' | 'anthropic'; model: string; role: string | null;
  tokensIn: number; tokensOut: number; tokensCached: number; tokensReasoning: number;
  usd: number; latencyMs: number; stop: string | null; ok: boolean;
}
export class LlmIncompleteError extends Error {}
/** The provider refused the request; `status` lets a caller tell a model-access problem (401/403/404) from an outage. */
export type ProviderRefusal = 'insufficient_quota' | 'rate_limit_exceeded' | 'billing_hard_limit_reached';
const providerRefusals = new Set<ProviderRefusal>(['insufficient_quota', 'rate_limit_exceeded', 'billing_hard_limit_reached']);
/** Keep only known diagnostic codes; never retain the provider's prompt-bearing error message. */
function refusalCode(body: unknown): ProviderRefusal | null {
  const error = (body as { error?: { code?: unknown; type?: unknown; message?: unknown } } | null)?.error;
  // Anthropic reports exhausted credits as 400 invalid_request_error. Retain only the class.
  if (error?.type === 'invalid_request_error' && typeof error.message === 'string' && /credit balance is too low/i.test(error.message)) return 'insufficient_quota';
  for (const value of [error?.code, error?.type]) {
    if (typeof value === 'string' && providerRefusals.has(value as ProviderRefusal)) return value as ProviderRefusal;
  }
  return null;
}
export class LlmHttpError extends Error {
  constructor(readonly status: number, message: string, readonly providerCode: ProviderRefusal | null = null) { super(message); }
}

/** $ per million tokens [input, cached input, output]: list prices of 2026-09-29. An unknown model logs $0. */
export const MODEL_PRICES: Record<string, [number, number, number]> = {
  'gpt-6-luna': [0.10, 0.01, 0.50], 'gpt-6-sol': [2, 0.2, 10], 'gpt-4o-mini': [0.15, 0.075, 0.60], 'gpt-4o': [2.5, 1.25, 10],
  'claude-sonnet-5-5': [2, 0.2, 10], 'claude-haiku-4-5': [1, 0.1, 5], 'claude-opus-5-5': [4, 0.2, 20],
};
export function modelCost(model: string, uncachedIn: number, cachedIn: number, out: number): number {
  const [pIn, pCached, pOut] = MODEL_PRICES[model] ?? [0, 0, 0];
  return (uncachedIn * pIn + cachedIn * pCached + out * pOut) / 1e6;
}

const legacyOpenAi = (model: string) => /^gpt-4/.test(model);
const RETRY_STATUS = (s: number) => s === 429 || s === 529 || s >= 500;

/** Strict JSON first; a stray code fence around valid JSON is tolerated, prose is not. */
function parseJson(text: string): unknown {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  return JSON.parse(trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<Response> {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
}

export async function completeJson(
  spec: ModelSpec, system: string, user: string, schema: JsonSchemaSpec,
  opts: { endpoint: string; role?: string; usage?: LlmUsage[] },
): Promise<unknown> {
  const started = Date.now();
  const note = (u: Partial<LlmUsage>) => opts.usage?.push({
    provider: spec.provider, model: spec.model, role: opts.role ?? null, tokensIn: 0, tokensOut: 0, tokensCached: 0, tokensReasoning: 0,
    usd: 0, latencyMs: Date.now() - started, stop: null, ok: false, ...u,
  });

  let res: Response | null = null;
  let providerCode: ProviderRefusal | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const left = spec.timeoutMs - (Date.now() - started);
    if (left < 2000) break;
    try {
      if (spec.provider === 'openai') {
        const key = process.env.OPENAI_API_KEY;
        if (!key) throw new Error('OPENAI_API_KEY not configured');
        const body: Record<string, unknown> = {
          model: spec.model,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          response_format: { type: 'json_schema', json_schema: { name: schema.name, strict: true, schema: schema.schema } },
        };
        if (legacyOpenAi(spec.model)) { body.temperature = 0.2; body.max_tokens = spec.maxTokens; }
        else { body.max_completion_tokens = spec.maxTokens; if (spec.effort) body.reasoning_effort = spec.effort; }
        res = await postJson(OPENAI_URL, { Authorization: `Bearer ${key}` }, body, left);
      } else {
        const key = process.env.ANTHROPIC_API_KEY;
        if (!key) throw new Error('ANTHROPIC_API_KEY not configured');
        res = await postJson('https://api.anthropic.com/v1/messages', { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, {
          model: spec.model, max_tokens: spec.maxTokens, system,
          messages: [{ role: 'user', content: user }],
          output_config: { ...(spec.effort ? { effort: spec.effort } : {}), format: { type: 'json_schema', schema: schema.schema } },
        }, left);
      }
    } catch (e) {
      const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
      recordLlmFailure({ endpoint: opts.endpoint, provider: spec.provider, model: spec.model, kind: timeout ? 'timeout' : 'unknown', message: e instanceof Error ? e.message.slice(0, 200) : 'request failed' });
      note({ stop: timeout ? 'timeout' : 'network' });
      throw e;
    }
    providerCode = res.ok ? null : refusalCode(await res.clone().json().catch(() => null));
    // Billing exhaustion cannot recover through a retry or a cheaper-model fallback.
    if (providerCode === 'insufficient_quota' || providerCode === 'billing_hard_limit_reached') break;
    if (res.ok || !RETRY_STATUS(res.status) || attempt === 1) break;
    recordLlmFailure({ endpoint: opts.endpoint, provider: spec.provider, model: spec.model, kind: classifyHttpStatus(res.status), httpStatus: res.status });
    await sleep(BACKOFF_MS[0]);
  }
  if (!res) { note({ stop: 'deadline' }); throw new Error(`${spec.model}: no time left`); }
  if (!res.ok) {
    if (providerCode === 'insufficient_quota' || providerCode === 'billing_hard_limit_reached') alertProviderCredit(spec.provider, providerCode, opts.endpoint);
    // Logs and the public agent_events feed get class and status only: provider bodies can echo the question.
    console.error('[llm] provider error', spec.provider, spec.model, res.status, providerCode ?? '');
    recordLlmFailure({ endpoint: opts.endpoint, provider: spec.provider, model: spec.model, kind: classifyHttpStatus(res.status), httpStatus: res.status, message: providerCode ?? `http_${res.status}` });
    note({ stop: `http_${res.status}` });
    throw new LlmHttpError(res.status, `${spec.model}: ${res.status}`, providerCode);
  }

  if (spec.provider === 'openai') {
    const data = await res.json() as {
      choices?: Array<{ finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number }; completion_tokens_details?: { reasoning_tokens?: number } };
    };
    const choice = data.choices?.[0];
    const inTok = data.usage?.prompt_tokens ?? 0, cached = data.usage?.prompt_tokens_details?.cached_tokens ?? 0, outTok = data.usage?.completion_tokens ?? 0;
    const stop = choice?.finish_reason ?? null;
    note({ tokensIn: inTok, tokensCached: cached, tokensOut: outTok, tokensReasoning: data.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
      usd: modelCost(spec.model, inTok - cached, cached, outTok), stop, ok: stop === 'stop' });
    if (stop !== 'stop') throw new LlmIncompleteError(`${spec.model}: finished with ${stop}`);
    return parseJson(choice?.message?.content ?? '');
  }
  const data = await res.json() as {
    stop_reason?: string; content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; output_tokens_details?: { thinking_tokens?: number } };
  };
  const inTok = (data.usage?.input_tokens ?? 0) + (data.usage?.cache_creation_input_tokens ?? 0), cached = data.usage?.cache_read_input_tokens ?? 0, outTok = data.usage?.output_tokens ?? 0;
  const stop = data.stop_reason ?? null;
  note({ tokensIn: inTok + cached, tokensCached: cached, tokensOut: outTok, tokensReasoning: data.usage?.output_tokens_details?.thinking_tokens ?? 0,
    usd: modelCost(spec.model, inTok, cached, outTok), stop, ok: stop === 'end_turn' });
  if (stop !== 'end_turn') throw new LlmIncompleteError(`${spec.model}: finished with ${stop}`);
  return parseJson((data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join(''));
}
