// ============================================================
// The agent engine: one paid call to the model, reserved before it leaves and settled when it is back.
//
// Same rules as the briefings (api/_lib/briefings/providers.ts and budget.ts), for the same reason:
//   · EXACTLY ONE HTTP attempt per call. Every attempt has its own reservation, so a hidden retry would spend
//     money nobody reserved. That is why completeJson (which retries inside) is not used here.
//   · Each attempt is classified for the money ledger:
//       ok        HTTP 200 with a usable turn; dollars from the response's own usage.
//       charged   HTTP 200 that cannot be used (cut off, refused, another shape); dollars are known.
//       no_charge no paid work: no key, or a status other than 200.
//       unknown   the request may have reached the provider and nobody can say what it cost (timeout, abort,
//                 a connection that broke, an unreadable 200). The reservation stays; the task is not retried blind.
//   · The reservation is the worst case the call allows: every input token at the list price and every
//     output token it may write. Storage that cannot answer means no call is made.
// The model is fixed by the server for the whole task and recorded with every step; a client field can never
// choose it. Logs carry status and class only: a provider body can echo the question.
// ============================================================
import { modelCost, modelPrice } from '../llm.js';
import type { AgentStore, Budget, ReserveRefusal } from './store.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

export interface WireTool { name: string; description: string; input_schema: Record<string, unknown> }
export type Block = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown };
export type Message = { role: 'user' | 'assistant'; content: string | Array<Block | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }> };
export interface ModelRequest { model: string; system: string; messages: Message[]; tools: WireTool[]; maxTokens: number; timeoutMs: number }
export interface ModelTurn { blocks: Block[]; stop: 'tool_use' | 'end_turn'; modelReturned: string | null }
export interface Usage { tokensIn: number; tokensOut: number; latencyMs: number }
export type ModelAttempt =
  | { ok: true; turn: ModelTurn; usd: number; usage: Usage }
  | { ok: false; outcome: 'no_charge' | 'unknown'; code: string; status: number | null; latencyMs: number }
  | { ok: false; outcome: 'charged'; code: string; status: number; usd: number; usage: Usage };
export type CallModel = (request: ModelRequest) => Promise<ModelAttempt>;

/** The model of the engine's one agent. Never chosen by a client. */
export function agentModel(env: NodeJS.ProcessEnv = process.env): string {
  const model = env.BOBBY_AGENT_MODEL?.trim() || 'claude-sonnet-5-5';
  if (!/^claude-[a-z0-9][a-z0-9.-]{2,63}$/.test(model)) throw new Error('Invalid agent model configuration');
  return model;
}

/** What one call can cost at most: about three characters a token in, every allowed token out, at the list price. */
export function worstCaseUsd(request: Pick<ModelRequest, 'model' | 'system' | 'messages' | 'tools' | 'maxTokens'>): number {
  const chars = request.system.length + JSON.stringify(request.messages).length + JSON.stringify(request.tools).length;
  const tokensIn = Math.ceil(chars / 3) + 400;
  const [pIn, , pOut] = modelPrice(request.model, tokensIn);
  return Number(((tokensIn * pIn + request.maxTokens * pOut) / 1e6).toFixed(6));
}

/** The real provider: one request, classified. Injectable everywhere it is used. */
export const callAnthropicOnce: CallModel = async (request) => {
  const started = Date.now();
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, outcome: 'no_charge', code: 'not_configured', status: null, latencyMs: 0 };
  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST', signal: AbortSignal.timeout(request.timeoutMs),
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: request.model, max_tokens: request.maxTokens, system: request.system, messages: request.messages, tools: request.tools }),
    });
  } catch (error) {
    const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return { ok: false, outcome: 'unknown', code: timeout ? 'timeout' : 'network', status: null, latencyMs: Date.now() - started };
  }
  if (res.status !== 200) {
    console.error('[agent] provider', request.model, res.status);
    return { ok: false, outcome: 'no_charge', code: `http_${res.status}`, status: res.status, latencyMs: Date.now() - started };
  }
  let data: { model?: string; stop_reason?: string; content?: Array<Record<string, unknown>>; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } };
  try { data = await res.json() as typeof data; } catch { return { ok: false, outcome: 'unknown', code: 'unreadable_body', status: 200, latencyMs: Date.now() - started }; }
  const fresh = (data.usage?.input_tokens ?? 0) + (data.usage?.cache_creation_input_tokens ?? 0), cached = data.usage?.cache_read_input_tokens ?? 0, out = data.usage?.output_tokens ?? 0;
  const usage: Usage = { tokensIn: fresh + cached, tokensOut: out, latencyMs: Date.now() - started };
  const usd = modelCost(request.model, fresh, cached, out);
  const blocks: Block[] = [];
  for (const part of Array.isArray(data.content) ? data.content : []) {
    if (part.type === 'text' && typeof part.text === 'string') blocks.push({ type: 'text', text: part.text });
    else if (part.type === 'tool_use' && typeof part.id === 'string' && typeof part.name === 'string') blocks.push({ type: 'tool_use', id: part.id, name: part.name, input: part.input });
  }
  if ((data.stop_reason !== 'tool_use' && data.stop_reason !== 'end_turn') || !blocks.length) return { ok: false, outcome: 'charged', code: `stop_${String(data.stop_reason ?? 'none').slice(0, 24)}`, status: 200, usd, usage };
  return { ok: true, turn: { blocks, stop: data.stop_reason, modelReturned: typeof data.model === 'string' ? data.model : null }, usd, usage };
};

export type Reserved =
  | { ok: true; turn: ModelTurn; usd: number; usage: Usage; reservedUsd: number }
  | { ok: false; code: ReserveRefusal | 'storage_unavailable' | 'provider_failed' | 'provider_unknown'; detail: string | null; usd: number; reservedUsd: number; outcome: 'none' | 'no_charge' | 'charged' | 'unknown' };

/**
 * reserve → dispatch → ONE call → settle. A refusal to reserve, or storage that fails before the call, makes no
 * call. A settle that fails after the call leaves the attempt dispatched: its reservation stays counted.
 */
export async function reservedCall(store: AgentStore, budget: Budget, task: string, request: ModelRequest, call: CallModel, now: () => number): Promise<Reserved> {
  const reserveUsd = worstCaseUsd(request);
  let attemptId: string;
  try {
    const reserved = await store.reserve(budget, task, request.model, reserveUsd, now());
    if (!reserved.ok) return { ok: false, code: reserved.code, detail: null, usd: 0, reservedUsd: 0, outcome: 'none' };
    attemptId = reserved.attemptId;
    await store.dispatch(attemptId);
  } catch {
    return { ok: false, code: 'storage_unavailable', detail: null, usd: 0, reservedUsd: 0, outcome: 'none' };
  }
  let attempt: ModelAttempt;
  // An adapter classifies and never throws; if one does, the request may have left.
  try { attempt = await call(request); } catch { attempt = { ok: false, outcome: 'unknown', code: 'adapter_threw', status: null, latencyMs: 0 }; }
  const failed = attempt.ok ? null : (attempt as Extract<ModelAttempt, { ok: false }>);
  const paid = !failed ? (attempt as Extract<ModelAttempt, { ok: true }>).usd : failed.outcome === 'charged' ? (failed as Extract<ModelAttempt, { outcome: 'charged' }>).usd : null;
  try {
    if (paid !== null) await store.settle(attemptId, 'settled', paid);
    else await store.settle(attemptId, failed!.outcome === 'no_charge' ? 'no_charge' : 'unknown', null);
  } catch { console.error('[agent] settle', 'storage'); }
  if (!failed) { const good = attempt as Extract<ModelAttempt, { ok: true }>; return { ok: true, turn: good.turn, usd: good.usd, usage: good.usage, reservedUsd: reserveUsd }; }
  return { ok: false, code: failed.outcome === 'unknown' ? 'provider_unknown' : 'provider_failed', detail: failed.code, usd: paid ?? 0, reservedUsd: reserveUsd, outcome: failed.outcome };
}
