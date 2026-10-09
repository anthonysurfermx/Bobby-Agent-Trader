// ============================================================
// POST /api/companion-turn — pilot v0 of the companion (api/_lib/companion.ts). Off unless
// BOBBY_COMPANION_ENABLED=on: until then every method answers 404 and no model is called.
//
// Contract v1 (shared/harness/companion-contract-v1/): the reply is always one of three tagged shapes,
// `explanation`, `desk_offer` (not produced by v0) or `error`, each with the person's `allowance`.
//
// What a turn may cost, and who stops it. The desk's dollar guard reads a ledger cached for a minute and lets
// the desk go on when the ledger cannot be read (api/_lib/llm-usage.ts). A conversation is a loop, so this
// endpoint does the opposite, in this order, before any model call:
//   1. the ledger must be readable and under the daily and the monthly cap, or the turn is refused
//      (`companion_paused`): unknown is closed here;
//   2. the person's allowance for the day (ten turns on Haiku, five on a dearer model; counted per install,
//      or per address when the client sent no install id), read from storage or refused;
//   3. four allowances per address a day, so rotating install ids buys nothing;
//   4. a ceiling on all turns served in a day (BOBBY_COMPANION_DAILY_TURNS, 1500).
// A turn is counted against the person only once it was answered: a provider failure costs them nothing.
// The counters are the `api_cache` rate-limit rows (read, then write: a burst can overshoot by a few, which is
// what steps 3 and 4 are for). An exact dollar reservation would need its own table.
//
// The cost is written to the desk's ledger (surface `desk`, role `companion`) so the existing guard sees it
// without a migration; reports must split it out by role.
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { waitUntil } from '@vercel/functions';
import { appLanguage, type AppLanguage } from '../src/lib/app-language.js';
import { requestOriginHost } from './_lib/origins.js';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { getClientQuotaKeys } from './_lib/rate-limit.js';
import { checkPersistentLimit } from './_lib/rate-limit-persistent.js';
import { deviceHash } from './_lib/access.js';
import { DESK_QUESTION_MAX } from './_lib/desk-debate.js';
import { llmCaps, llmSpend, logLlmUsage } from './_lib/llm-usage.js';
import type { LlmUsage } from './_lib/llm.js';
import { COMPANION_VERSION, CompanionRequest, companionAllowance, companionDailyCeiling, companionEnabled, companionModel, runCompanionTurn } from './_lib/companion.js';

export const config = { maxDuration: 60 };

const DAY_S = 86_400;
/** The whole request, `context` included, before anything is parsed. */
const BODY_MAX = 8 * 1024;

const COPY: Record<'invalid' | 'long' | 'unavailable' | 'paused' | 'limit', Record<AppLanguage, string>> = {
  invalid: { en: 'Type a question.', es: 'Escribe una pregunta.', fr: 'Écris une question.', pt: 'Escreve uma pergunta.', it: 'Scrivi una domanda.', de: 'Schreib eine Frage.' },
  long: {
    en: 'Your question is too long. Keep it to 1,200 characters or fewer.', es: 'Tu pregunta es demasiado larga. Usa 1,200 caracteres o menos.',
    fr: 'Ta question est trop longue. Limite-la à 1 200 caractères.', pt: 'A pergunta é demasiado longa. Usa até 1.200 caracteres.',
    it: 'La domanda è troppo lunga. Usa al massimo 1.200 caratteri.', de: 'Deine Frage ist zu lang. Bleib bei höchstens 1.200 Zeichen.',
  },
  unavailable: {
    en: 'I could not finish the explanation. You can try again.', es: 'No pude completar la explicación. Puedes intentarlo de nuevo.',
    fr: 'Je n’ai pas pu terminer l’explication. Tu peux réessayer.', pt: 'Não consegui terminar a explicação. Podes tentar de novo.',
    it: 'Non sono riuscito a completare la spiegazione. Puoi riprovare.', de: 'Ich konnte die Erklärung nicht abschließen. Du kannst es noch einmal versuchen.',
  },
  paused: {
    en: 'I am taking a break from explanations for now. Try again later.', es: 'Por ahora hice una pausa en las explicaciones. Inténtalo más tarde.',
    fr: 'Je fais une pause dans les explications pour le moment. Réessaie plus tard.', pt: 'Fiz uma pausa nas explicações por agora. Tenta mais tarde.',
    it: 'Per ora ho messo in pausa le spiegazioni. Riprova più tardi.', de: 'Ich mache gerade eine Pause bei den Erklärungen. Versuch es später noch einmal.',
  },
  limit: {
    en: 'That is all the explanations for today. We can go on tomorrow.', es: 'Son todas las explicaciones de hoy. Mañana seguimos.',
    fr: 'C’est tout pour les explications d’aujourd’hui. On continue demain.', pt: 'São todas as explicações de hoje. Amanhã continuamos.',
    it: 'Per oggi le spiegazioni sono finite. Continuiamo domani.', de: 'Das waren alle Erklärungen für heute. Morgen geht es weiter.',
  },
};

/** Turns already counted for this person today, or null when storage could not say (the caller refuses). */
async function turnsUsed(person: string): Promise<{ used: number; resetsInS: number } | null> {
  try {
    const url = bobbyRest(`api_cache?cache_key=eq.${encodeURIComponent(`rl:companion:${person}`)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=payload,expires_at&limit=1`);
    const r = await fetch(url, { headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(3000) });
    if (!r.ok) return null;
    const rows = await r.json() as Array<{ payload?: { count?: unknown }; expires_at?: unknown }>;
    if (!Array.isArray(rows)) return null;
    if (!rows.length) return { used: 0, resetsInS: DAY_S };
    const count = Number(rows[0].payload?.count), expires = Date.parse(String(rows[0].expires_at));
    if (!Number.isSafeInteger(count) || count < 0 || !Number.isFinite(expires)) return null;
    return { used: count, resetsInS: Math.max(60, Math.ceil((expires - Date.now()) / 1000)) };
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!companionEnabled()) return res.status(404).json({ error: 'Not found' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requestOriginHost(req.headers)) return res.status(403).json({ error: 'Origin not allowed' });

  const body = (req.body ?? {}) as { language?: unknown; requestId?: unknown };
  const lang = appLanguage(body.language);
  const echoed = typeof body.requestId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestId) ? body.requestId : null;
  const refuse = (status: number, code: string, message: string, retryable: boolean, allowance: { consumed: number; remaining: number | null }) =>
    res.status(status).json({ version: COMPANION_VERSION, requestId: echoed, kind: 'error', error: { code, retryable, message }, allowance: { kind: 'orientation', ...allowance } });
  const unknown = { consumed: 0, remaining: null };

  let size = BODY_MAX + 1;
  try { size = Buffer.byteLength(JSON.stringify(req.body ?? null), 'utf8'); } catch { /* not JSON: refused below */ }
  if (size > BODY_MAX) return refuse(400, 'invalid_request', COPY.invalid[lang], false, unknown);
  const parsed = CompanionRequest.safeParse(req.body);
  if (!parsed.success) return refuse(400, 'invalid_request', COPY.invalid[lang], false, unknown);
  const { question, language, locale, speech } = parsed.data;
  // A code point is at most two UTF-16 units: the first test bounds Array.from's work.
  if (question.length > DESK_QUESTION_MAX * 2 || Array.from(question).length > DESK_QUESTION_MAX) return refuse(400, 'question_too_long', COPY.long[language], false, unknown);
  if (!process.env.ANTHROPIC_API_KEY) return refuse(503, 'companion_unavailable', COPY.unavailable[language], false, unknown);

  // 1. Unknown spend is closed spend.
  const spend = await llmSpend();
  const caps = llmCaps();
  if (!spend || spend.day >= caps.dayUsd || spend.month >= caps.monthUsd) {
    console.error(JSON.stringify({ route: 'companion-turn', event: 'paused', reason: spend ? 'cap' : 'ledger_unreadable' }));
    return refuse(503, 'companion_paused', COPY.paused[language], !spend, unknown);
  }

  let model: string;
  let address: ReturnType<typeof getClientQuotaKeys> = null;
  try { model = companionModel(); address = getClientQuotaKeys(req); } catch { return refuse(503, 'companion_unavailable', COPY.unavailable[language], false, unknown); }
  if (!address) return refuse(503, 'companion_unavailable', COPY.unavailable[language], false, unknown);
  const limit = companionAllowance(model);
  const person = deviceHash(req) ?? address.caller;

  // 2. The person's day.
  const before = await turnsUsed(person);
  if (!before) return refuse(503, 'companion_unavailable', COPY.unavailable[language], true, unknown);
  const spent = { consumed: Math.min(before.used, limit), remaining: Math.max(0, limit - before.used) };
  const limited = () => { res.setHeader('Retry-After', String(before.resetsInS)); return refuse(429, 'orientation_limit', COPY.limit[language], false, { consumed: spent.consumed, remaining: 0 }); };
  if (before.used >= limit) return limited();
  // 3 and 4. The address and the day as a whole; both count the attempt and refuse when storage cannot answer.
  if ((await checkPersistentLimit('companion-address', address.caller, limit * 4, DAY_S, { failClosed: true })).limited) return limited();
  if ((await checkPersistentLimit('companion-day', 'all', companionDailyCeiling(), DAY_S, { failClosed: true })).limited) {
    console.error(JSON.stringify({ route: 'companion-turn', event: 'paused', reason: 'daily_turns' }));
    return refuse(503, 'companion_paused', COPY.paused[language], false, spent);
  }

  const usage: LlmUsage[] = [];
  const started = Date.now();
  try {
    const turn = await runCompanionTurn(question, language, { locale, speech, usage, model });
    // Counted only now: an answer reached the person.
    await checkPersistentLimit('companion', person, limit, DAY_S);
    console.error(JSON.stringify({ route: 'companion-turn', event: 'turn', source: turn.source, rejected: turn.rejected, followUp: turn.followUp !== null, language, speech: speech ?? 'plain', model, ms: Date.now() - started }));
    return res.status(200).json({
      version: COMPANION_VERSION, requestId: echoed, kind: 'explanation',
      reply: { text: turn.text, followUp: turn.followUp }, nextAction: null,
      allowance: { kind: 'orientation', consumed: spent.consumed + 1, remaining: Math.max(0, spent.remaining - 1) },
    });
  } catch {
    console.error(JSON.stringify({ route: 'companion-turn', event: 'failed', language, model, ms: Date.now() - started }));
    return refuse(503, 'companion_unavailable', COPY.unavailable[language], true, spent);
  } finally {
    if (usage.length) waitUntil(logLlmUsage(usage, { surface: 'desk', level: null }));
  }
}
