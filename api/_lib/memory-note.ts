// ============================================================
// The personal note: one or two sentences Bobby says before the answer when it remembers this reader
// ("Anthony, on Monday you asked me about AMZN and I said wait: the trend was down. It is up 15% since then;
// today I still say wait because…"). Written AFTER the debate, from the finished verdict and the stored memory,
// so memory can never move the verdict: the debate never sees it (api/desk-debate.ts).
// Truthfulness is enforced here, not requested:
//   · a claim about what Bobby said before is allowed only when a stored read exists (reader.previousRead);
//   · every percentage in the note must be the server-computed change, to the tenth;
//   · the note passes the same public-text guard as the answer;
//   · anything that fails falls back to a template built only from stored fields.
// ============================================================
import { completeJson, LlmHttpError, type JsonSchemaSpec, type LlmUsage, type ModelSpec } from './llm.js';
import { publicTextViolation } from './desk-debate.js';
import type { Lang, ReaderContext } from './user-memory.js';

export interface CurrentRead {
  verdict: 'wait' | 'review'; direction: 'long' | 'short' | 'none';
  synthesis: { headline: string; why: string; risk: string; watch: string };
}
export interface PersonalNote {
  note: string;
  /** What the note draws on, so the client can say "from your read on Monday". */
  basedOn: { previousRead: boolean; priceChange: boolean };
  source: 'model' | 'template';
}

const NOTE_SCHEMA: JsonSchemaSpec = { name: 'desk_personal_note', schema: { type: 'object', additionalProperties: false, required: ['note'], properties: { note: { type: 'string' } } } };
const NOTE_MAX = 320;

const VERDICT_WORD: Record<Lang, Record<'wait' | 'review', string>> = {
  en: { wait: 'wait', review: 'review' },
  es: { wait: 'esperar', review: 'revisar' },
  pt: { wait: 'esperar', review: 'revisar' },
};

/** "I told you / I said / te dije / eu disse…": a claim about Bobby's own past answer. */
const PAST_ADVICE = /\b(i (told|said|called|recommended)|my (last|previous) (call|read|answer|verdict)|last time i|te dije|te hab[ií]a dicho|mi (lectura|respuesta|veredicto) (anterior|pasad[oa])|la [uú]ltima vez (te )?dije|eu (te )?disse|minha (leitura|resposta) anterior|da [uú]ltima vez (eu )?disse)\b/i;
const PERCENT = /[+\-−]?\s?\d+(?:[.,]\d+)?\s?%/g;

/** The note, if it keeps every promise above; else null. */
export function validNote(note: unknown, reader: ReaderContext): string | null {
  if (typeof note !== 'string') return null;
  const text = note.replace(/\s+/g, ' ').trim();
  if (text.length < 12 || text.length > NOTE_MAX) return null;
  if (publicTextViolation(text)) return null;
  if (!reader.previousRead && PAST_ADVICE.test(text)) return null;
  const change = reader.thisAsset?.changeSinceLastAskPct;
  for (const m of text.match(PERCENT) ?? []) {
    const n = Math.abs(Number(m.replace(/[%\s+−-]/g, '').replace(',', '.')));
    if (change === undefined || !Number.isFinite(n) || Math.abs(n - Math.abs(change)) > 0.05) return null;
  }
  return text;
}

const signed = (n: number, lang: Lang) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-MX' : 'pt-BR', { maximumFractionDigits: 1 })}%`;

/** A note built only from stored fields and the finished verdict. Null when there is nothing to recall. */
export function templateNote(reader: ReaderContext, symbol: string, current: CurrentRead, lang: Lang): string | null {
  const parts: string[] = [];
  const t = reader.thisAsset;
  const p = reader.previousRead;
  const L = (en: string, es: string, pt: string) => (lang === 'es' ? es : lang === 'pt' ? pt : en);
  const now = VERDICT_WORD[lang][current.verdict];
  if (p) {
    const then = VERDICT_WORD[lang][p.verdict];
    parts.push(L(`${p.on[0].toUpperCase()}${p.on.slice(1)} you asked me about ${symbol} and I said ${then}.`, `${p.on[0].toUpperCase()}${p.on.slice(1)} me preguntaste por ${symbol} y te dije ${then}.`, `${p.on[0].toUpperCase()}${p.on.slice(1)} você me perguntou sobre ${symbol} e eu disse ${then}.`));
  } else if (t && t.lastAskedDaysAgo >= 1) {
    parts.push(L(`You asked me about ${symbol} ${t.lastAskedOn}.`, `Me preguntaste por ${symbol} ${t.lastAskedOn}.`, `Você me perguntou sobre ${symbol} ${t.lastAskedOn}.`));
  }
  if (t?.changeSinceLastAskPct !== undefined) {
    const c = t.changeSinceLastAskPct;
    parts.push(c === 0
      ? L('The price is where it was.', 'El precio está donde estaba.', 'O preço está onde estava.')
      : L(`It is ${c > 0 ? 'up' : 'down'} ${signed(c, lang)} since then.`, `Desde entonces ${c > 0 ? 'subió' : 'bajó'} ${signed(c, lang)}.`, `Desde então ${c > 0 ? 'subiu' : 'caiu'} ${signed(c, lang)}.`));
  }
  if (p) parts.push(p.verdict === current.verdict
    ? L(`Today I still say ${now}.`, `Hoy sigo diciendo ${now}.`, `Hoje continuo dizendo ${now}.`)
    : L(`Today I say ${now}.`, `Hoy digo ${now}.`, `Hoje digo ${now}.`));
  if (t && t.timesThisWeek >= 2) parts.push(L(`That makes ${t.timesThisWeek} times this week.`, `Van ${t.timesThisWeek} veces esta semana.`, `São ${t.timesThisWeek} vezes nesta semana.`));
  if (!parts.length) return null;
  const text = parts.join(' ');
  return reader.name ? `${reader.name}, ${text[0].toLowerCase()}${text.slice(1)}` : text;
}

const NOTE_RULE = (lang: Lang) => `You write Bobby's short personal note, said before an educational market read, in ${lang === 'es' ? 'Spanish' : lang === 'pt' ? 'Brazilian Portuguese' : 'English'}. Input: reader (what Bobby remembers: name, the asset's past asks, previousRead = exactly what Bobby answered last time on this asset, a price change the server computed) and current (today's finished verdict, direction and synthesis; it is final and you never change or restate it differently). Write one or two short sentences, at most 280 characters, warm and plain:
- if reader.name is present, open with it once;
- if reader.previousRead is present, say when (previousRead.on) and what Bobby said then (its verdict and, briefly, its why), then whether today's verdict is the same or different and the one reason from current.synthesis.why; if it changed, say what is different now using only current.synthesis;
- never claim anything about a past answer when reader.previousRead is absent;
- if reader.thisAsset.changeSinceLastAskPct is present, quote it exactly, with its sign, as the move since reader.thisAsset.priceThenOn: a fact about the past, never proof a call was right or a reason to act;
- if reader.thisAsset.timesThisWeek is 2 or more you may say how many times this week;
- if reader.oftenAsks has a sharedExposure, you may say in one clause that it shares that exposure with this asset;
- use no other numbers, never give personalized advice, never judge suitability, never say buy or sell, never infer anything else about the person.
Verdict words: wait = ${VERDICT_WORD[lang].wait}, review = ${VERDICT_WORD[lang].review}. Return {"note":"..."}.`;

/**
 * The note for this read. Never throws and never blocks the answer for long: a model failure, a timeout or a
 * note that breaks a rule falls back to the template; nothing to recall = null.
 */
export async function personalNote(
  reader: ReaderContext, symbol: string, current: CurrentRead, lang: Lang,
  opts: { spec: ModelSpec; fallback?: ModelSpec | null; usage?: LlmUsage[]; signal?: AbortSignal; timeoutMs?: number } ,
): Promise<PersonalNote | null> {
  const basedOn = { previousRead: !!reader.previousRead, priceChange: reader.thisAsset?.changeSinceLastAskPct !== undefined };
  const template = () => {
    const note = templateNote(reader, symbol, current, lang);
    const ok = note ? validNote(note, reader) : null;
    return ok ? { note: ok, basedOn, source: 'template' as const } : null;
  };
  if (opts.signal?.aborted) return null;
  const input = JSON.stringify({ symbol, reader, current: { verdict: current.verdict, direction: current.direction, synthesis: current.synthesis } });
  const call = (s: ModelSpec) => completeJson({ ...s, maxTokens: Math.min(s.maxTokens, 400), timeoutMs: Math.min(s.timeoutMs, opts.timeoutMs ?? 9000) }, NOTE_RULE(lang), input, NOTE_SCHEMA, { endpoint: 'desk-debate', role: 'note', usage: opts.usage });
  try {
    let raw: unknown;
    try { raw = await call(opts.spec); }
    catch (error) {
      if (!opts.fallback || !(error instanceof LlmHttpError) || ![401, 403, 404].includes(error.status)) throw error;
      raw = await call(opts.fallback);
    }
    const note = validNote((raw as { note?: unknown } | null)?.note, reader);
    return note ? { note, basedOn, source: 'model' } : template();
  } catch {
    return template();
  }
}
