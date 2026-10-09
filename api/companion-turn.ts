// ============================================================
// POST /api/companion-turn — pilot v0 of the companion (api/_lib/companion.ts). Off unless
// BOBBY_COMPANION_ENABLED=on: until then every method answers 404 and no model is called.
//
// Contract v1 (shared/harness/companion-contract-v1/): the reply is always one of three tagged shapes,
// `explanation`, `desk_offer` or `error`, each with the person's `allowance`.
//
// What a turn may cost, and who stops it. The desk's dollar guard reads a ledger cached for a minute and lets
// the desk go on when the ledger cannot be read (api/_lib/llm-usage.ts). A conversation is a loop, so this
// endpoint does the opposite, in this order, before any model call:
//   1. the ledger must be readable and under the daily and the monthly cap, or the turn is refused
//      (`companion_paused`): unknown is closed here;
//   2. the companion's own spend today, read from its own ledger surface, must be readable and under its own
//      daily amount (BOBBY_COMPANION_DAILY_USD, 3): a free feature never uses up the budget of a paid one;
//   3. a slot of the person's day (ten turns on Haiku, five on a dearer model; per install, or per address
//      when the client sent no install id);
//   4. a slot of the address's day, four allowances, so rotating install ids buys nothing, and a slot of its
//      network's day (a /24, sixteen allowances), so neither does a small range of addresses;
//   5. last, a slot of everyone's day (BOBBY_COMPANION_DAILY_TURNS; 1500 on Haiku, 400 on a dearer model).
// A slot is a row the database lets only one request insert (api/_lib/companion-slots.ts), so the limits hold
// when requests arrive together, which a read-then-write counter does not. Storage that cannot answer refuses
// the turn. Slots are given back when the turn was not served: a desk offer does not use the person's
// allowance, and a provider failure costs the person nothing. The address keeps the attempt of a failed call,
// so a failing provider is not an unlimited number of calls, and a call that timed out keeps its place in the
// day because it may have been billed. Days are UTC. Both spend figures are read from a one-minute cache: what
// can pass in that minute is bounded by the slots.
//
// The cost is written to its own ledger surface (`companion`): the desk's caps do not count it and the desk's
// reports do not read a companion turn as a desk analysis.
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { waitUntil } from '@vercel/functions';
import { appLanguage, type AppLanguage } from '../src/lib/app-language.js';
import { requestOriginHost } from './_lib/origins.js';
import { randomUUID } from 'node:crypto';
import { getClientQuotaKeys } from './_lib/rate-limit.js';
import { COMPANION_SURFACE, companionSpend, forgetCompanionSpend, tooFast } from './_lib/companion-spend.js';
import { giveBack, slotsResetInS, sweepSlots, takeSharedSlot, takeSlot } from './_lib/companion-slots.js';
import { deviceHash } from './_lib/access.js';
import { DESK_QUESTION_MAX } from './_lib/desk-debate.js';
import { llmCaps, llmSpend, logLlmUsage } from './_lib/llm-usage.js';
import type { LlmUsage } from './_lib/llm.js';
import { COMPANION_VERSION, CompanionRequest, companionAllowance, companionDailyCeiling, companionDailyUsd, companionEnabled, companionModel, runCompanionTurn } from './_lib/companion.js';

export const config = { maxDuration: 60 };

/** The whole request, `context` included, before anything is parsed. */
const BODY_MAX = 8 * 1024;

const COPY: Record<'invalid' | 'long' | 'unavailable' | 'paused' | 'limit' | 'crowded', Record<AppLanguage, string>> = {
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
  // The address or its network used its day: the person may not have asked anything yet, so it is not "your" day.
  crowded: {
    en: 'Too many questions came from this network today. We can go on tomorrow.', es: 'Hoy llegaron demasiadas preguntas desde esta red. Mañana seguimos.',
    fr: 'Trop de questions sont arrivées de ce réseau aujourd’hui. On continue demain.', pt: 'Hoje chegaram demasiadas perguntas desta rede. Amanhã continuamos.',
    it: 'Oggi sono arrivate troppe domande da questa rete. Continuiamo domani.', de: 'Heute kamen zu viele Fragen aus diesem Netz. Morgen geht es weiter.',
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!companionEnabled()) return res.status(404).json({ error: 'Not found' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requestOriginHost(req.headers)) return res.status(403).json({ error: 'Origin not allowed' });

  // @vercel/node parses the body when it is first read, and throws on JSON it cannot parse.
  let raw: unknown = null;
  let readable = true;
  try { raw = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { readable = false; }
  const body = (raw && typeof raw === 'object' ? raw : {}) as { language?: unknown; requestId?: unknown };
  const lang = appLanguage(body.language);
  const echoed = typeof body.requestId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestId) ? body.requestId : null;
  const refuse = (status: number, code: string, message: string, retryable: boolean, allowance: { consumed: number; remaining: number | null }) =>
    res.status(status).json({ version: COMPANION_VERSION, requestId: echoed, kind: 'error', error: { code, retryable, message }, allowance: { kind: 'orientation', ...allowance } });
  const unknown = { consumed: 0, remaining: null };

  let size = BODY_MAX + 1;
  try { size = Buffer.byteLength(JSON.stringify(raw ?? null), 'utf8'); } catch { /* not JSON: refused below */ }
  if (!readable || size > BODY_MAX) return refuse(400, 'invalid_request', COPY.invalid[lang], false, unknown);
  const parsed = CompanionRequest.safeParse(raw);
  if (!parsed.success) return refuse(400, 'invalid_request', COPY.invalid[lang], false, unknown);
  const { question, language, locale, speech, candidate } = parsed.data;
  // A code point is at most two UTF-16 units: the first test bounds Array.from's work.
  if (question.length > DESK_QUESTION_MAX * 2 || Array.from(question).length > DESK_QUESTION_MAX) return refuse(400, 'question_too_long', COPY.long[language], false, unknown);
  if (!process.env.ANTHROPIC_API_KEY) return refuse(503, 'companion_unavailable', COPY.unavailable[language], false, unknown);

  let model: string;
  let address: ReturnType<typeof getClientQuotaKeys> = null;
  try { model = companionModel(); address = getClientQuotaKeys(req); } catch { return refuse(503, 'companion_unavailable', COPY.unavailable[language], false, unknown); }
  if (!address) return refuse(503, 'companion_unavailable', COPY.unavailable[language], false, unknown);
  if (tooFast(address.caller)) { res.setHeader('Retry-After', '60'); return refuse(503, 'companion_unavailable', COPY.unavailable[language], true, unknown); }

  // 1 and 2. Unknown spend is closed spend: the desk's ledger, then the companion's own.
  const now = Date.now();
  const [spend, own] = await Promise.all([llmSpend(), companionSpend(now)]);
  const caps = llmCaps();
  if (!spend || own === null || spend.day >= caps.dayUsd || spend.month >= caps.monthUsd || own >= companionDailyUsd()) {
    const unreadable = !spend || own === null;
    console.error(JSON.stringify({ route: 'companion-turn', event: 'paused', reason: unreadable ? 'ledger_unreadable' : own >= companionDailyUsd() ? 'own_cap' : 'cap' }));
    return refuse(503, 'companion_paused', COPY.paused[language], unreadable, unknown);
  }

  const limit = companionAllowance(model);
  const person = deviceHash(req) ?? address.caller;
  // Every slot of this request carries this token, and only this token can remove them.
  const token = randomUUID().replace(/-/g, '');
  const tomorrow = () => res.setHeader('Retry-After', String(slotsResetInS(now)));

  // 3. The person's day. Unreadable storage, or every slot tried lost to a request of their own, can be retried.
  const mine = await takeSlot('p', person, limit, token, { now });
  if (mine.state === 'full') { tomorrow(); return refuse(429, 'orientation_limit', COPY.limit[language], false, { consumed: limit, remaining: 0 }); }
  if (mine.state !== 'taken') return refuse(503, 'companion_unavailable', COPY.unavailable[language], true, unknown);
  const before = { consumed: mine.used - 1, remaining: limit - mine.used + 1 };
  // 4. The address and its network: taken together, and given back with the person's when either refuses.
  const [theirs, around] = await Promise.all([takeSlot('a', address.caller, limit * 4, token, { now }), takeSharedSlot('n', address.network, limit * 16, token, { now })]);
  if (theirs.state !== 'taken' || around.state !== 'taken') {
    await giveBack([mine, theirs, around], token);
    // The person is told the truth: the network's day is used, theirs is as it was.
    if (theirs.state === 'full' || (theirs.state === 'taken' && around.state === 'full')) { tomorrow(); return refuse(429, 'orientation_limit', COPY.crowded[language], false, before); }
    return refuse(503, 'companion_unavailable', COPY.unavailable[language], true, before);
  }
  // 5. Everyone's day, last: a request refused above never touches it.
  const shared = await takeSharedSlot('d', 'all', companionDailyCeiling(model), token, { now });
  if (shared.state !== 'taken') {
    await giveBack([mine, theirs, around], token);
    if (shared.state !== 'full') return refuse(503, 'companion_unavailable', COPY.unavailable[language], true, before);
    console.error(JSON.stringify({ route: 'companion-turn', event: 'paused', reason: 'daily_turns' }));
    return refuse(503, 'companion_paused', COPY.paused[language], false, before);
  }

  const usage: LlmUsage[] = [];
  const started = Date.now();
  try {
    const turn = await runCompanionTurn(question, language, { locale, speech, candidate, usage, model });
    console.error(JSON.stringify({ route: 'companion-turn', event: 'turn', source: turn.source, rejected: turn.rejected, offer: turn.aboutCandidate, followUp: turn.followUp !== null, language, speech: speech ?? 'plain', model, ms: Date.now() - started }));
    if (turn.aboutCandidate && candidate) {
      // The question was about an asset after all: the client asks the person to confirm it. The model call was
      // paid, so the address, the network and the day keep their slots; the person's allowance is for explanations.
      await giveBack([mine], token);
      return res.status(200).json({
        version: COMPANION_VERSION, requestId: echoed, kind: 'desk_offer', reply: { text: turn.text, followUp: null },
        nextAction: { type: 'open_desk', symbol: candidate.symbol.toUpperCase(), question, requiresConfirmation: true }, allowance: { kind: 'orientation', ...before },
      });
    }
    return res.status(200).json({
      version: COMPANION_VERSION, requestId: echoed, kind: 'explanation',
      reply: { text: turn.text, followUp: turn.followUp }, nextAction: null,
      allowance: { kind: 'orientation', consumed: mine.used, remaining: limit - mine.used },
    });
  } catch {
    // Nothing reached the person: their turn and the network's come back. The address keeps the attempt, so a
    // failing provider is not an unlimited number of calls; a call that timed out may have been billed, so it
    // keeps its place in the day as well.
    const timedOut = usage.some((row) => row.stop === 'timeout' || row.stop === 'deadline');
    await giveBack(timedOut ? [mine, around] : [mine, around, shared], token);
    console.error(JSON.stringify({ route: 'companion-turn', event: 'failed', timedOut, language, model, ms: Date.now() - started }));
    return refuse(503, 'companion_unavailable', COPY.unavailable[language], true, before);
  } finally {
    if (usage.length) waitUntil(logLlmUsage(usage, { surface: COMPANION_SURFACE, level: null }).then(forgetCompanionSpend));
    // Once per person and day: the slot rows of past days go.
    if (mine.used === 1) waitUntil(sweepSlots());
  }
}
