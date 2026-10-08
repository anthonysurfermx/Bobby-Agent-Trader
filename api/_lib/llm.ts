// Shared app text transport. Free uses Haiku and verified Pro uses Opus; an explicit provider switch and
// credit/rate fallback retain availability without changing safety gates or leaking prompts.
import { recordLlmFailure, classifyHttpStatus } from './llm-health.js';
import { alertProviderCredit } from './provider-alert.js';
import { waitUntil } from '@vercel/functions';
import { logLlmUsage } from './llm-usage.js';
import { appPrimaryProvider, appTextModel, type AppTextTier } from './app-model.js';
import { appToolWireSchema, appToolInputValid } from './app-tool-schema.js';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const BACKOFF_MS = [500, 1500];

export interface LlmToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
export interface LlmCallOptions {
  endpoint: string;
  system: string;
  user: string;
  /** Kept for caller compatibility; the central app model setting selects Anthropic. */
  model?: string;
  /** Selected by server-verified account access, never by a request-body model or level. */
  tier?: AppTextTier;
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  tool?: LlmToolSchema;
}
export interface LlmResult {
  text: string; toolInput: Record<string, unknown> | null;
  provider?: ModelSpec['provider']; model?: string;
}
export interface TextMessage { role: 'user' | 'assistant'; content: string }
export interface StreamTextOptions extends Omit<LlmCallOptions, 'user' | 'tool'> {
  messages: TextMessage[];
  onDelta?: (text: string) => void | Promise<void>;
}
function sleep(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)); }

const adaptiveOnly = (model: string) => /^claude-(?:opus|sonnet)-5-5(?:$|-)/.test(model);
function textSpecs(opts: Pick<LlmCallOptions, 'model' | 'tier' | 'effort' | 'maxTokens' | 'timeoutMs'>): ModelSpec[] {
  const size = { maxTokens: opts.maxTokens ?? 4096, timeoutMs: opts.timeoutMs ?? 30_000 };
  const model = appTextModel(process.env, opts.tier);
  const claude: ModelSpec = { ...size, provider: 'anthropic', model, effort: opts.effort ?? 'low',
    // Opus always thinks; leave room for its reasoning as well as the small visible answer.
    maxTokens: adaptiveOnly(model) ? Math.max(size.maxTokens, 2048) : size.maxTokens };
  const openai: ModelSpec = { ...size, provider: 'openai', model: process.env.BOBBY_DESK_MODEL || 'gpt-6-luna' };
  return appPrimaryProvider() === 'openai' ? [openai, claude] : [claude, openai];
}
const keyFor = (provider: ModelSpec['provider']) => process.env[provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'];
const limited = (error: unknown) => error instanceof LlmHttpError && (error.status === 429
  || error.providerCode === 'insufficient_quota' || error.providerCode === 'billing_hard_limit_reached');
function stopped(signal?: AbortSignal) { if (signal?.aborted) throw new Error('App text request cancelled'); }
function requestSignal(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
}
function textRequest(spec: ModelSpec, system: string, messages: TextMessage[], stream: boolean, tool?: LlmToolSchema) {
  const key = keyFor(spec.provider);
  if (!key) throw new Error('App text provider not configured');
  if (spec.provider === 'anthropic') {
    const body: Record<string, unknown> = { model: spec.model, max_tokens: spec.maxTokens, system, messages,
      output_config: { effort: spec.effort ?? 'low' }, ...(stream ? { stream: true } : {}) };
    // Small text/tool ceilings belong to the answer; keep adaptive thinking for the desk adapter.
    if (!adaptiveOnly(spec.model) && ((spec.effort ?? 'low') === 'low' || tool)) body.thinking = { type: 'disabled' };
    if (tool && adaptiveOnly(spec.model)) {
      body.output_config = { effort: spec.effort ?? 'low', format: { type: 'json_schema', schema: appToolWireSchema(tool.parameters) } };
    } else if (tool) {
      body.tools = [{ name: tool.name, description: tool.description, input_schema: tool.parameters }];
      body.tool_choice = { type: 'tool', name: tool.name };
    }
    return { url: ANTHROPIC_URL, headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body };
  }
  const body: Record<string, unknown> = { model: spec.model, messages: [{ role: 'system', content: system }, ...messages] };
  body[legacyOpenAi(spec.model) ? 'max_tokens' : 'max_completion_tokens'] = spec.maxTokens;
  if (stream) { body.stream = true; body.stream_options = { include_usage: true }; }
  if (tool) {
    body.tools = [{ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } }];
    body.tool_choice = { type: 'function', function: { name: tool.name } };
  }
  return { url: OPENAI_URL, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body };
}
function usageRow(spec: ModelSpec, started: number, data: any, stop: string | null, ok: boolean): LlmUsage {
  const u = data?.usage;
  const cached = spec.provider === 'anthropic' ? u?.cache_read_input_tokens ?? 0 : u?.prompt_tokens_details?.cached_tokens ?? 0;
  const input = spec.provider === 'anthropic' ? (u?.input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0) : (u?.prompt_tokens ?? 0) - cached;
  const output = spec.provider === 'anthropic' ? u?.output_tokens ?? 0 : u?.completion_tokens ?? 0;
  return { provider: spec.provider, model: spec.model, role: null, tokensIn: input + cached, tokensCached: cached,
    tokensOut: output, tokensReasoning: spec.provider === 'anthropic' ? u?.output_tokens_details?.thinking_tokens ?? 0 : u?.completion_tokens_details?.reasoning_tokens ?? 0,
    usd: modelCost(spec.model, input, cached, output), latencyMs: Date.now() - started, stop, ok };
}
function flushUsage(rows: LlmUsage[], endpoint: string): void {
  if (!rows.length) return;
  const pending = logLlmUsage(rows.splice(0), { surface: endpoint });
  try { waitUntil(pending); } catch { /* tests and internal workers still run the best-effort write */ }
}
function failure(endpoint: string, spec: ModelSpec, kind: 'parse_error' | 'timeout' | 'unknown', code: string): void {
  recordLlmFailure({ endpoint, provider: spec.provider, model: spec.model, kind, message: code });
}
function providerHttpError(status: number, code: ProviderRefusal | null, endpoint: string, spec: ModelSpec): LlmHttpError {
  if (code === 'insufficient_quota' || code === 'billing_hard_limit_reached') alertProviderCredit(spec.provider, code, endpoint);
  console.error('[llm] provider error', spec.provider, spec.model, status, code ?? '');
  recordLlmFailure({ endpoint, provider: spec.provider, model: spec.model, kind: classifyHttpStatus(status), httpStatus: status, message: code ?? `http_${status}` });
  return new LlmHttpError(status, `${spec.model}: ${status}`, code);
}
async function throwHttp(res: Response, endpoint: string, spec: ModelSpec): Promise<never> {
  throw providerHttpError(res.status, refusalCode(await res.json().catch(() => null)), endpoint, spec);
}
function streamProviderError(event: any, endpoint: string, spec: ModelSpec): LlmHttpError {
  const code = refusalCode(event), type = event?.error?.type;
  const status = type === 'overloaded_error' ? 529 : type === 'rate_limit_error' || code === 'rate_limit_exceeded' ? 429
    : type === 'invalid_request_error' ? 400 : 502;
  return providerHttpError(status, code, endpoint, spec);
}
function resultOf(data: any, spec: ModelSpec, tool?: LlmToolSchema): LlmResult {
  if (spec.provider === 'anthropic') {
    const stop = data?.stop_reason;
    const structuredTool = Boolean(tool && adaptiveOnly(spec.model));
    if (stop !== (tool && !structuredTool ? 'tool_use' : 'end_turn')) throw new LlmIncompleteError('App text response incomplete or refused');
    const blocks = Array.isArray(data.content) ? data.content : [];
    const text = blocks.filter((b: any) => b.type === 'text' && typeof b.text === 'string').map((b: any) => b.text).join('');
    const calls = blocks.filter((b: any) => b.type === 'tool_use');
    const call = calls[0];
    if (structuredTool && tool) {
      let input: unknown;
      try { input = JSON.parse(text); } catch { throw new Error('Invalid app text tool response'); }
      if (calls.length || !input || typeof input !== 'object' || Array.isArray(input) || !appToolInputValid(input, tool.parameters)) throw new Error('Invalid app text tool response');
      return { text, toolInput: input as Record<string, unknown>, provider: spec.provider, model: spec.model };
    }
    if (tool && (calls.length !== 1 || call?.name !== tool.name || !call.input || typeof call.input !== 'object' || Array.isArray(call.input) || !appToolInputValid(call.input, tool.parameters))) throw new Error('Invalid app text tool response');
    if (!tool && !text.trim()) throw new Error('Empty app text response');
    return { text, toolInput: tool ? call.input : null, provider: spec.provider, model: spec.model };
  }
  const choice = data?.choices?.[0];
  if (choice?.message?.refusal || choice?.finish_reason !== (tool ? 'tool_calls' : 'stop')) throw new LlmIncompleteError('App text response incomplete or refused');
  const call = choice?.message?.tool_calls?.[0]?.function;
  let toolInput: Record<string, unknown> | null = null;
  if (tool) {
    if (choice.message.tool_calls.length !== 1 || call?.name !== tool.name || typeof call.arguments !== 'string') throw new Error('Invalid app text tool response');
    let input: unknown;
    try { input = JSON.parse(call.arguments); } catch { throw new Error('Invalid app text tool response'); }
    if (!input || typeof input !== 'object' || Array.isArray(input) || !appToolInputValid(input, tool.parameters)) throw new Error('Invalid app text tool response');
    toolInput = input as Record<string, unknown>;
  }
  const text = choice?.message?.content ?? '';
  if (typeof text !== 'string' || (!tool && !text.trim())) throw new Error('Empty app text response');
  return { text, toolInput, provider: spec.provider, model: spec.model };
}

/** Text and named tools use the app model; provider refusals and incomplete answers never fail over. */
export async function callLlm(opts: LlmCallOptions): Promise<LlmResult> {
  stopped(opts.signal);
  const started = Date.now(), deadline = started + (opts.timeoutMs ?? 30_000), rows: LlmUsage[] = [];
  const specs = textSpecs(opts);
  try {
    for (const spec of specs) {
      stopped(opts.signal);
      if (!keyFor(spec.provider)) continue;
      for (let attempt = 0; attempt < 2; attempt++) {
        stopped(opts.signal);
        const left = deadline - Date.now();
        if (left < 1) throw new Error('App text request deadline reached');
        const req = textRequest(spec, opts.system, [{ role: 'user', content: opts.user }], false, opts.tool);
        let data: any;
        try {
          const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body), signal: requestSignal(left, opts.signal) });
          if (!res.ok) {
            rows.push(usageRow(spec, started, null, `http_${res.status}`, false));
            await throwHttp(res, opts.endpoint, spec);
          }
          try { data = await res.json(); } catch { throw new Error('Invalid app text provider response'); }
          const stop = spec.provider === 'anthropic' ? data?.stop_reason : data?.choices?.[0]?.finish_reason;
          const row = usageRow(spec, started, data, stop ?? null, false); rows.push(row);
          if (opts.signal?.aborted) row.stop = 'cancelled';
          stopped(opts.signal);
          let result: LlmResult;
          try { result = resultOf(data, spec, opts.tool); }
          catch (error) { failure(opts.endpoint, spec, 'parse_error', 'invalid_or_incomplete_response'); throw error; }
          row.ok = true;
          return result;
        } catch (error) {
          stopped(opts.signal);
          if (limited(error)) break;
          if (error instanceof LlmHttpError && (error.status >= 500 || error.status === 529) && attempt === 0) {
            await sleep(BACKOFF_MS[0]); continue;
          }
          if (error instanceof LlmHttpError || error instanceof LlmIncompleteError || data !== undefined) throw error;
          const timeout = error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
          rows.push(usageRow(spec, started, null, timeout ? 'timeout' : 'network', false));
          failure(opts.endpoint, spec, timeout ? 'timeout' : 'unknown', timeout ? 'timeout' : 'transport_error');
          const safe = new Error(timeout ? 'App text provider timed out' : 'App text provider unavailable');
          if (timeout) safe.name = error instanceof Error ? error.name : 'TimeoutError';
          throw safe;
        }
      }
    }
    throw new Error('App text providers unavailable');
  } finally { flushUsage(rows, opts.endpoint); }
}

/** Provider SSE becomes text deltas only. No retry/failover after text is visible to the caller. */
export async function streamText(opts: StreamTextOptions): Promise<LlmResult> {
  stopped(opts.signal);
  if (!opts.messages.length || opts.messages.at(-1)?.role !== 'user') throw new Error('App text conversation must end with a user');
  const started = Date.now(), deadline = started + (opts.timeoutMs ?? 30_000), rows: LlmUsage[] = [];
  let emitted = false;
  try {
    for (const spec of textSpecs(opts)) {
      stopped(opts.signal);
      if (!keyFor(spec.provider)) continue;
      const left = deadline - Date.now();
      if (left < 1) throw new Error('App text request deadline reached');
      const req = textRequest(spec, opts.system, opts.messages, true);
      let row = usageRow(spec, started, null, null, false), recorded = false;
      const record = () => { if (!recorded) { rows.push(row); recorded = true; } };
      try {
        const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body), signal: requestSignal(left, opts.signal) });
        if (!res.ok) { row.stop = `http_${res.status}`; record(); await throwHttp(res, opts.endpoint, spec); }
        if (!res.body) throw new Error('Missing app text stream');
        let text = '', stop: string | null = null, ended = false;
        const data: any = { usage: {} };
        const reader = res.body.getReader(), decoder = new TextDecoder();
        let buffer = '';
        const accept = async (payload: string) => {
          stopped(opts.signal);
          if (payload === '[DONE]') { ended = true; return; }
          let event: any;
          try { event = JSON.parse(payload); } catch { throw new Error('Invalid app text stream event'); }
          let delta: string | undefined;
          if (spec.provider === 'anthropic') {
            if (event.type === 'error') throw streamProviderError(event, opts.endpoint, spec);
            if (event.type === 'message_start') Object.assign(data.usage, event.message?.usage ?? {});
            if (event.type === 'message_delta') { Object.assign(data.usage, event.usage ?? {}); stop = event.delta?.stop_reason ?? stop; }
            if (event.type === 'message_stop') ended = true;
            if (event.type === 'content_block_start' && event.content_block?.type === 'text') delta = event.content_block.text;
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') delta = event.delta.text;
          } else {
            if (event.error) throw streamProviderError(event, opts.endpoint, spec);
            Object.assign(data.usage, event.usage ?? {});
            if (event.choices?.[0]?.delta?.refusal) throw new LlmIncompleteError('App text provider refused');
            stop = event.choices?.[0]?.finish_reason ?? stop;
            delta = event.choices?.[0]?.delta?.content;
          }
          row = usageRow(spec, started, data, stop, false);
          if (typeof delta === 'string' && delta) {
            emitted = true; text += delta; await opts.onDelta?.(delta);
          }
        };
        try {
          for (;;) {
            stopped(opts.signal);
            const { value, done } = await reader.read();
            if (value) buffer += decoder.decode(value, { stream: true });
            if (done) buffer += decoder.decode();
            buffer = buffer.replace(/\r\n/g, '\n');
            let at: number;
            while ((at = buffer.indexOf('\n\n')) >= 0) {
              const frame = buffer.slice(0, at); buffer = buffer.slice(at + 2);
              const payload = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
              if (payload) await accept(payload);
            }
            if (buffer.length > 2_000_000) throw new Error('App text stream event too large');
            if (done || ended) break;
          }
        } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
        const wanted = spec.provider === 'anthropic' ? 'end_turn' : 'stop';
        row.stop = stop; row.latencyMs = Date.now() - started;
        if (!ended || stop !== wanted || !text.trim()) throw new LlmIncompleteError('App text stream incomplete');
        row.ok = true; record();
        return { text, toolInput: null, provider: spec.provider, model: spec.model };
      } catch (error) {
        row.ok = false; row.latencyMs = Date.now() - started;
        row.stop = opts.signal?.aborted ? 'cancelled' : error instanceof LlmHttpError ? `http_${error.status}`
          : error instanceof LlmIncompleteError ? row.stop ?? 'incomplete_stream' : 'stream_error';
        record(); stopped(opts.signal);
        if (!emitted && limited(error)) continue;
        failure(opts.endpoint, spec, error instanceof LlmIncompleteError ? 'parse_error' : 'unknown',
          error instanceof LlmIncompleteError ? 'incomplete_stream' : 'stream_failed');
        if (error instanceof LlmHttpError || error instanceof LlmIncompleteError) throw error;
        throw new Error('App text stream unavailable');
      }
    }
    throw new Error('App text providers unavailable');
  } finally { flushUsage(rows, opts.endpoint); }
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

/** $ per million tokens [input, cached input, output]: list prices of 2026-10-07. Dated ids match their family
 *  (claude-haiku-4-5-20251001 → claude-haiku-4-5); an unknown model is costed at the dearest known price so the
 *  ledger never under-reports. */
export const MODEL_PRICES: Record<string, [number, number, number]> = {
  'gpt-6-luna': [0.10, 0.01, 0.50], 'gpt-6-sol': [2, 0.2, 10], 'gpt-4o-mini': [0.15, 0.075, 0.60], 'gpt-4o': [2.5, 1.25, 10],
  'claude-haiku-5-5': [0.10, 0.01, 0.50], 'claude-sonnet-5-5': [2, 0.10, 10], 'claude-haiku-4-5': [1, 0.1, 5], 'claude-opus-5-5': [4, 0.2, 20],
};
const DEAREST: [number, number, number] = Object.values(MODEL_PRICES).reduce((a, b) => (b[2] > a[2] ? b : a));
const unpriced = new Set<string>();
const modelFamily = (model: string, family: string) => model === family || model.startsWith(`${family}-`);
export function modelPrice(model: string, totalInputTokens = 0): [number, number, number] {
  if (modelFamily(model, 'claude-haiku-5-5') && totalInputTokens > 100_000) return [0.50, 0.05, 2.50];
  const known = MODEL_PRICES[model] ?? Object.entries(MODEL_PRICES).sort((a, b) => b[0].length - a[0].length).find(([k]) => modelFamily(model, k))?.[1];
  if (known) return known;
  if (!unpriced.has(model)) { unpriced.add(model); console.warn('[llm] no list price for', model, '— costed at the dearest known price'); }
  return DEAREST;
}
export function modelCost(model: string, uncachedIn: number, cachedIn: number, out: number): number {
  const [pIn, pCached, pOut] = modelPrice(model, uncachedIn + cachedIn);
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

/** A reply that is not the requested JSON is a failed call in the ledger, not a successful one. */
function parseOrFail(text: string, usage: LlmUsage[] | undefined): unknown {
  try { return parseJson(text); } catch (e) {
    const last = usage?.at(-1);
    if (last) { last.ok = false; last.stop = 'invalid_json'; }
    throw new Error('Invalid structured model response');
  }
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
      recordLlmFailure({ endpoint: opts.endpoint, provider: spec.provider, model: spec.model, kind: timeout ? 'timeout' : 'unknown', message: timeout ? 'timeout' : 'transport_error' });
      note({ stop: timeout ? 'timeout' : 'network' });
      const error = new Error(timeout ? 'Structured model request timed out' : 'Structured model provider unavailable');
      if (timeout) error.name = e instanceof Error ? e.name : 'TimeoutError';
      throw error;
    }
    providerCode = res.ok ? null : refusalCode(await res.clone().json().catch(() => null));
    // Billing exhaustion cannot recover through a retry or a cheaper-model fallback.
    if (providerCode === 'insufficient_quota' || providerCode === 'billing_hard_limit_reached') break;
    if (res.ok || !RETRY_STATUS(res.status) || attempt === 1) break;
    recordLlmFailure({ endpoint: opts.endpoint, provider: spec.provider, model: spec.model, kind: classifyHttpStatus(res.status), httpStatus: res.status });
    note({ stop: `http_${res.status}` }); // the failed attempt is a call too
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

  const successfulResponse = res;
  const readResponse = async (): Promise<any> => {
    try { return await successfulResponse.json(); }
    catch {
      note({ stop: 'invalid_response' });
      recordLlmFailure({ endpoint: opts.endpoint, provider: spec.provider, model: spec.model, kind: 'parse_error', message: 'invalid_response' });
      throw new Error('Invalid structured model provider response');
    }
  };

  if (spec.provider === 'openai') {
    const data = await readResponse() as {
      choices?: Array<{ finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number }; completion_tokens_details?: { reasoning_tokens?: number } };
    };
    const choice = data.choices?.[0];
    const inTok = data.usage?.prompt_tokens ?? 0, cached = data.usage?.prompt_tokens_details?.cached_tokens ?? 0, outTok = data.usage?.completion_tokens ?? 0;
    const stop = choice?.finish_reason ?? null;
    note({ tokensIn: inTok, tokensCached: cached, tokensOut: outTok, tokensReasoning: data.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
      usd: modelCost(spec.model, inTok - cached, cached, outTok), stop: choice?.message?.refusal ? 'refusal' : stop, ok: stop === 'stop' && !choice?.message?.refusal });
    if (stop !== 'stop' || choice?.message?.refusal) throw new LlmIncompleteError('Structured model response incomplete or refused');
    return parseOrFail(choice?.message?.content ?? '', opts.usage);
  }
  const data = await readResponse() as {
    stop_reason?: string; content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; output_tokens_details?: { thinking_tokens?: number } };
  };
  const inTok = (data.usage?.input_tokens ?? 0) + (data.usage?.cache_creation_input_tokens ?? 0), cached = data.usage?.cache_read_input_tokens ?? 0, outTok = data.usage?.output_tokens ?? 0;
  const stop = data.stop_reason ?? null;
  note({ tokensIn: inTok + cached, tokensCached: cached, tokensOut: outTok, tokensReasoning: data.usage?.output_tokens_details?.thinking_tokens ?? 0,
    usd: modelCost(spec.model, inTok, cached, outTok), stop, ok: stop === 'end_turn' });
  if (stop !== 'end_turn') throw new LlmIncompleteError('Structured model response incomplete or refused');
  return parseOrFail((data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join(''), opts.usage);
}
