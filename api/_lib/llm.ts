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

import { recordLlmFailure, classifyHttpStatus } from './llm-health';

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
          message: errBody.slice(0, 300),
        });
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
      if (err === lastError) throw err; // non-retriable HTTP error re-thrown above
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
