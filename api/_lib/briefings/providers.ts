// ============================================================
// Bobby Pro market briefings — provider adapters for paid calls (shared narrative LLM, narration TTS).
// Invariant: EXACTLY ONE HTTP attempt per call. Every paid attempt is reserved and settled individually by
// budget.ts, so a hidden retry would spend money nobody reserved. That is why completeJson/callLlm
// (api/_lib/llm.ts, which retry internally) are not used here; the request shapes are the same as completeJson's.
// Each result is classified for accounting:
//   · ok        — HTTP 200, usable value; usd from the response usage (TTS: chars × estimate, `estimated`).
//   · no_charge — no paid work happened: key missing (no fetch at all) or an HTTP status other than 200.
//   · charged   — HTTP 200 whose body is unusable (truncated, refused, not the requested JSON); usd is known.
//   · unknown   — the request may have reached the provider but we cannot tell what it cost (timeout, abort,
//                 network error, an unreadable 200 body). The budget keeps such work blocked until reconciled.
// Credit exhaustion alerts the owner (provider-alert.ts) and is reported as code 'insufficient_quota'.
// Logs carry provider, model, status and class only: provider bodies can echo the prompt.
// ============================================================
import { alertProviderCredit } from '../provider-alert.js';
import { modelCost, modelPrice } from '../llm.js';
import { buildInstructions, resolveOpenAIVoice } from '../tts.js';
import { BRIEF_VIBE, TTS_MODEL, ttsEstimateUsdPerChar, ttsReserveUsdPerChar, type LlmChoice } from './config.js';
import type { BriefLanguage } from './types.js';

export interface AttemptUsage { tokensIn?: number; tokensOut?: number; chars?: number; latencyMs: number }

/** Contract §8 plus the `charged` failure (deviation: a 200 whose body is unusable still costs money). */
export type AttemptResult<T> =
  | { ok: true; value: T; usd: number; estimated: boolean; usage: AttemptUsage }
  | { ok: false; outcome: 'no_charge' | 'unknown'; code: string; status: number | null; latencyMs: number }
  | { ok: false; outcome: 'charged'; code: string; status: number; latencyMs: number; usd: number; estimated: boolean; usage: AttemptUsage };

export interface LlmJsonRequest { system: string; user: string; schema: { name: string; schema: Record<string, unknown> } }
type Alert = typeof alertProviderCredit;

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
/** A real narration segment is kilobytes of MP3; anything this small is an error body or a truncated stream. */
const MIN_AUDIO_BYTES = 500;
/** The speech endpoint rejects longer input; never truncate silently (the cache key covers the full text). */
const MAX_TTS_CHARS = 4000;
const ALERT_ENDPOINT = 'briefings';

const legacyOpenAi = (model: string) => /^gpt-4/.test(model);
/** Round up to the micro-dollar; the epsilon absorbs float noise (0.0009375000001 must not become 0.000939). */
const ceil6 = (usd: number) => (usd > 0 ? Math.ceil(usd * 1e6 - 1e-6) / 1e6 : 0);

/** Keep only the refusal class: the provider message can echo the request. Mirrors llm.ts refusalCode. */
function refusalClass(body: unknown): 'insufficient_quota' | 'billing_hard_limit_reached' | 'rate_limit_exceeded' | null {
  const error = (body as { error?: { code?: unknown; type?: unknown; message?: unknown } } | null)?.error;
  if (error?.type === 'invalid_request_error' && typeof error.message === 'string' && /credit balance is too low/i.test(error.message)) return 'insufficient_quota';
  for (const v of [error?.code, error?.type]) {
    if (v === 'insufficient_quota' || v === 'billing_hard_limit_reached' || v === 'rate_limit_exceeded') return v;
  }
  return null;
}

const isAbort = (e: unknown) => e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');

/** Non-200: nothing was produced, nothing is charged. Exhausted credit alerts the owner once per window. */
async function refused(res: Response, provider: 'openai' | 'anthropic', model: string, started: number, alert: Alert) {
  let body: unknown = null;
  try { body = JSON.parse(await res.text()); } catch { /* status is enough */ }
  const refusal = refusalClass(body);
  const exhausted = refusal === 'insufficient_quota' || refusal === 'billing_hard_limit_reached';
  if (exhausted) alert(provider, 'insufficient_quota', ALERT_ENDPOINT);
  console.error('[briefings-provider]', provider, model, res.status, refusal ?? '');
  return { ok: false as const, outcome: 'no_charge' as const, code: exhausted ? 'insufficient_quota' : (refusal ?? `http_${res.status}`), status: res.status, latencyMs: Date.now() - started };
}

/** Strict JSON; a code fence around valid JSON is tolerated (same rule as llm.ts), prose is not. */
function parseJsonText(text: string): { ok: true; value: unknown } | { ok: false } {
  const trimmed = text.trim();
  try { return { ok: true, value: JSON.parse(trimmed) }; } catch { /* try without a fence */ }
  try { return { ok: true, value: JSON.parse(trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) }; } catch { return { ok: false }; }
}

/**
 * One structured-JSON call to the chosen provider. Never retries; see the header for the outcome classes.
 */
export async function llmJsonOnce(
  choice: LlmChoice,
  req: LlmJsonRequest,
  opts: { maxTokens: number; timeoutMs: number; fetchImpl?: typeof fetch; alert?: Alert },
): Promise<AttemptResult<unknown>> {
  const started = Date.now();
  const doFetch = opts.fetchImpl ?? fetch;
  const alert = opts.alert ?? alertProviderCredit;
  const key = (choice.provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY)?.trim();
  if (!key) return { ok: false, outcome: 'no_charge', code: 'not_configured', status: null, latencyMs: 0 };

  let url: string;
  let headers: Record<string, string>;
  let body: Record<string, unknown>;
  if (choice.provider === 'openai') {
    url = OPENAI_CHAT_URL;
    headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
    body = {
      model: choice.model,
      messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }],
      response_format: { type: 'json_schema', json_schema: { name: req.schema.name, strict: true, schema: req.schema.schema } },
    };
    // GPT-4o family takes max_tokens + temperature; newer families reject both (llm.ts completeJson).
    if (legacyOpenAi(choice.model)) { body.temperature = 0.2; body.max_tokens = opts.maxTokens; } else body.max_completion_tokens = opts.maxTokens;
  } else {
    url = ANTHROPIC_URL;
    headers = { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' };
    body = {
      model: choice.model, max_tokens: opts.maxTokens, system: req.system,
      messages: [{ role: 'user', content: req.user }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: req.schema.schema } },
    };
  }

  const signal = AbortSignal.timeout(opts.timeoutMs);
  let res: Response;
  try {
    res = await doFetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
  } catch (e) {
    // The request may already be on the provider: never assume it was free.
    console.error('[briefings-provider]', choice.provider, choice.model, isAbort(e) ? 'timeout' : 'network');
    return { ok: false, outcome: 'unknown', code: isAbort(e) ? 'timeout' : 'network', status: null, latencyMs: Date.now() - started };
  }
  if (res.status !== 200) return refused(res, choice.provider, choice.model, started, alert);

  let data: any;
  try {
    data = JSON.parse(await res.text());
  } catch (e) {
    // 200 but the envelope (and its usage) is lost: charged for an amount we cannot read.
    console.error('[briefings-provider]', choice.provider, choice.model, 200, isAbort(e) ? 'body_timeout' : 'bad_envelope');
    return { ok: false, outcome: 'unknown', code: isAbort(e) ? 'body_timeout' : 'bad_envelope', status: 200, latencyMs: Date.now() - started };
  }
  const latencyMs = Date.now() - started;

  let tokensIn: number, tokensOut: number, usd: number, stopOk: boolean, text: string, refusal = false;
  let haveUsage: boolean;
  if (choice.provider === 'openai') {
    const u = data?.usage;
    haveUsage = typeof u?.prompt_tokens === 'number' && typeof u?.completion_tokens === 'number';
    const inTok = Number(u?.prompt_tokens) || 0, cached = Number(u?.prompt_tokens_details?.cached_tokens) || 0, outTok = Number(u?.completion_tokens) || 0;
    tokensIn = inTok; tokensOut = outTok; usd = modelCost(choice.model, inTok - cached, cached, outTok);
    const c = data?.choices?.[0];
    stopOk = c?.finish_reason === 'stop';
    refusal = typeof c?.message?.refusal === 'string' && c.message.refusal.length > 0;
    text = typeof c?.message?.content === 'string' ? c.message.content : '';
  } else {
    const u = data?.usage;
    haveUsage = typeof u?.input_tokens === 'number' && typeof u?.output_tokens === 'number';
    const inTok = (Number(u?.input_tokens) || 0) + (Number(u?.cache_creation_input_tokens) || 0), cached = Number(u?.cache_read_input_tokens) || 0, outTok = Number(u?.output_tokens) || 0;
    tokensIn = inTok + cached; tokensOut = outTok; usd = modelCost(choice.model, inTok, cached, outTok);
    stopOk = data?.stop_reason === 'end_turn';
    text = Array.isArray(data?.content) ? data.content.filter((c: any) => c?.type === 'text').map((c: any) => String(c.text ?? '')).join('') : '';
  }
  // Without a usage block the ledger would under-report: charge the reservation-sized upper bound instead.
  let estimated = false;
  if (!haveUsage) {
    usd = llmReserveUsd(choice, req.system.length + req.user.length, opts.maxTokens);
    estimated = true;
  }
  const usage: AttemptUsage = { tokensIn, tokensOut, latencyMs };

  if (!stopOk || refusal) {
    console.error('[briefings-provider]', choice.provider, choice.model, 200, refusal ? 'refusal' : 'incomplete');
    return { ok: false, outcome: 'charged', code: refusal ? 'refusal' : 'incomplete', status: 200, latencyMs, usd, estimated, usage };
  }
  const parsed = parseJsonText(text);
  if (!parsed.ok) {
    console.error('[briefings-provider]', choice.provider, choice.model, 200, 'invalid_json');
    return { ok: false, outcome: 'charged', code: 'invalid_json', status: 200, latencyMs, usd, estimated, usage };
  }
  return { ok: true, value: parsed.value, usd, estimated, usage };
}

/**
 * One narration synthesis (OpenAI speech, MP3) in the companion's persona and the briefing vibe. The endpoint
 * returns no usage, so the cost is chars × the configured estimate and `estimated` is always true.
 */
export async function ttsOnce(
  text: string,
  voice: string,
  language: BriefLanguage,
  opts: { timeoutMs: number; fetchImpl?: typeof fetch; alert?: Alert },
): Promise<AttemptResult<Buffer>> {
  const started = Date.now();
  const doFetch = opts.fetchImpl ?? fetch;
  const alert = opts.alert ?? alertProviderCredit;
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return { ok: false, outcome: 'no_charge', code: 'not_configured', status: null, latencyMs: 0 };
  const chars = text.length;
  if (!chars || chars > MAX_TTS_CHARS) return { ok: false, outcome: 'no_charge', code: 'bad_input', status: null, latencyMs: 0 };

  const model = TTS_MODEL();
  const resolvedVoice = resolveOpenAIVoice(voice);
  const body: Record<string, unknown> = { model, voice: resolvedVoice, input: text, response_format: 'mp3' };
  // Same steering rule as tts.ts: gpt-4o speech models take `instructions`; tts-1 does not.
  if (model.includes('gpt-4o')) body.instructions = buildInstructions(language, BRIEF_VIBE, resolvedVoice, voice);

  let res: Response;
  try {
    res = await doFetch(OPENAI_SPEECH_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(opts.timeoutMs),
    });
  } catch (e) {
    console.error('[briefings-provider] openai', model, isAbort(e) ? 'timeout' : 'network');
    return { ok: false, outcome: 'unknown', code: isAbort(e) ? 'timeout' : 'network', status: null, latencyMs: Date.now() - started };
  }
  if (res.status !== 200) return refused(res, 'openai', model, started, alert);

  let audio: Buffer;
  try {
    audio = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    console.error('[briefings-provider] openai', model, 200, isAbort(e) ? 'body_timeout' : 'body_error');
    return { ok: false, outcome: 'unknown', code: isAbort(e) ? 'body_timeout' : 'body_error', status: 200, latencyMs: Date.now() - started };
  }
  const latencyMs = Date.now() - started;
  const usd = chars * ttsEstimateUsdPerChar();
  const usage: AttemptUsage = { chars, latencyMs };
  if (audio.length <= MIN_AUDIO_BYTES) {
    console.error('[briefings-provider] openai', model, 200, 'short_audio');
    return { ok: false, outcome: 'charged', code: 'short_audio', status: 200, latencyMs, usd, estimated: true, usage };
  }
  return { ok: true, value: audio, usd, estimated: true, usage };
}

/**
 * Upper bound reserved before an LLM attempt: prompt at ~3 chars/token plus the full output ceiling, at list
 * price, with a 25 % margin, rounded up to the micro-dollar. Unknown models are priced at the dearest known.
 */
export function llmReserveUsd(choice: LlmChoice, promptChars: number, maxTokens: number): number {
  const [pIn, , pOut] = modelPrice(choice.model);
  const usd = (((Math.max(0, promptChars) / 3) * pIn + Math.max(0, maxTokens) * pOut) / 1e6) * 1.25;
  return ceil6(usd);
}

export function ttsReserveUsd(chars: number): number {
  return ceil6(Math.max(0, chars) * ttsReserveUsdPerChar());
}
