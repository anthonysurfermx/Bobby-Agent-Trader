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
//   3. a slot of the person's day (ten turns on Haiku, five on a dearer model, or BOBBY_COMPANION_TURNS; per install, or per address
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
//
// Context v1, off unless BOBBY_COMPANION_CONTEXT=on. A request may carry what the person told Bobby
// (api/_lib/companion-context.ts): the explanation is then written for them, and the reply says so
// (`personalized`), names the one question Bobby would ask next (`checkIn`, chosen by code) and reserves the
// place of a fact card (`fact`, null until its picker exists). A request may also ANSWER that question in the
// person's own words instead of asking one (api/_lib/companion-reader.ts): the reply is a fourth shape, `noted`.
// It passes the same guards in the same order, with one difference: the person's slot is of another scope
// (`r`, twelve a day), because noting an answer uses none of their explanations. Its cost is on the same
// surface, with role `reader`, so the companion's own daily amount covers it. Nothing of a context or of an
// answer is logged, stored or put in an error. With the flag off none of this is read and no reply has a new key.
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { waitUntil } from '@vercel/functions';
import { appLanguage, type AppLanguage } from '../src/lib/app-language.js';
import { requestOriginHost } from './_lib/origins.js';
import { randomUUID } from 'node:crypto';
import { getClientQuotaKeys } from './_lib/rate-limit.js';
import { COMPANION_SURFACE, companionSpend, forgetCompanionSpend, tooFast } from './_lib/companion-spend.js';
import { giveBack, slotsHeld, slotsResetInS, sweepSlots, takeSharedSlot, takeSlot } from './_lib/companion-slots.js';
import { deviceHash } from './_lib/access.js';
import { DESK_QUESTION_MAX } from './_lib/desk-debate.js';
import { llmCaps, llmSpend, logLlmUsage } from './_lib/llm-usage.js';
import type { LlmUsage } from './_lib/llm.js';
import { COMPANION_VERSION, CompanionRequest, CompanionUnchecked, companionAllowance, companionDailyCeiling, companionDailyUsd, companionEnabled, companionGist, companionModel, runCompanionTurn } from './_lib/companion.js';
import { companionCapabilities, companionContextEnabled, companionPicture, nextCheckIn, readCompanionContext } from './_lib/companion-context.js';
import { companionJudgeModel } from './_lib/companion-judge.js';
import { NOTES_A_DAY, companionAnswer, companionReaderModel, readCompanionAnswer } from './_lib/companion-reader.js';

export const config = { maxDuration: 60 };

/** The whole request, `context` included, before anything is parsed. */
const BODY_MAX = 8 * 1024;
/** What a person has used and has left of their day of explanations. */
type Allowance = { consumed: number; remaining: number | null };

const COPY: Record<'invalid' | 'long' | 'unavailable' | 'paused' | 'limit' | 'crowded' | 'answer', Record<AppLanguage, string>> = {
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
  // An answer to one of Bobby's questions that was not noted, whatever the reason: the options are still there to tap.
  answer: {
    en: 'I could not note that. You can pick one of the options.', es: 'No pude anotarlo. Puedes elegir una de las opciones.',
    fr: 'Je n’ai pas pu le noter. Tu peux choisir une des options.', pt: 'Não consegui anotar. Dá para escolher uma das opções.',
    it: 'Non sono riuscito ad annotarlo. Puoi scegliere una delle opzioni.', de: 'Das konnte ich nicht notieren. Du kannst eine der Optionen wählen.',
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!companionEnabled()) return res.status(404).json({ error: 'Not found' });
  // A client reads this 405 as "the pilot is on", and in `companion` whether it may show Bobby's questions.
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed', companion: companionCapabilities() });
  if (!requestOriginHost(req.headers)) return res.status(403).json({ error: 'Origin not allowed' });

  // @vercel/node parses the body when it is first read, and throws on JSON it cannot parse.
  let raw: unknown = null;
  let readable = true;
  try { raw = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { readable = false; }
  const body = (raw && typeof raw === 'object' ? raw : {}) as { language?: unknown; requestId?: unknown; answer?: unknown };
  const lang = appLanguage(body.language);
  const echoed = typeof body.requestId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestId) ? body.requestId : null;
  const refuse = (status: number, code: string, message: string, retryable: boolean, allowance: Allowance) =>
    res.status(status).json({ version: COMPANION_VERSION, requestId: echoed, kind: 'error', error: { code, retryable, message }, allowance: { kind: 'orientation', ...allowance } });
  const unknown: Allowance = { consumed: 0, remaining: null };

  let size = BODY_MAX + 1;
  try { size = Buffer.byteLength(JSON.stringify(raw ?? null), 'utf8'); } catch { /* not JSON: refused below */ }
  if (!readable || size > BODY_MAX) return refuse(400, 'invalid_request', COPY.invalid[lang], false, unknown);
  // An answer to one of Bobby's questions travels instead of a question. With the flag off nothing reads it, and
  // the request is what it always was: a question, or invalid.
  const noting = companionContextEnabled() && body.answer != null;
  const answer = noting ? companionAnswer(raw) : null;
  if (noting && !answer) return refuse(400, 'invalid_request', COPY.answer[lang], false, unknown);
  const parsed = answer ? null : CompanionRequest.safeParse(raw);
  if (parsed && !parsed.success) return refuse(400, 'invalid_request', COPY.invalid[lang], false, unknown);
  const ask = parsed ? parsed.data : null;
  const { language, locale } = answer ?? ask!;
  // A code point is at most two UTF-16 units: the first test bounds Array.from's work.
  if (ask && (ask.question.length > DESK_QUESTION_MAX * 2 || Array.from(ask.question).length > DESK_QUESTION_MAX)) return refuse(400, 'question_too_long', COPY.long[language], false, unknown);
  // What the person told Bobby, when it is to be read; null is the turn of a person who sent nothing.
  const context = ask ? readCompanionContext(ask.context) : null;
  // Only with the second reader on: it is what refuses a reply that labels the person, and the lists that
  // stand in for it when the owner turns it off have no such rule.
  const picture = context && companionJudgeModel() ? companionPicture(context.notes) : null;
  // What a turn that fails says: an explanation that was not finished, or an answer that was not noted.
  const sorry = (answer ? COPY.answer : COPY.unavailable)[language];
  if (!process.env.ANTHROPIC_API_KEY) return refuse(503, 'companion_unavailable', sorry, false, unknown);

  let model: string, reader = '';
  let address: ReturnType<typeof getClientQuotaKeys> = null;
  try { model = companionModel(); if (answer) reader = companionReaderModel(); address = getClientQuotaKeys(req); } catch { return refuse(503, 'companion_unavailable', sorry, false, unknown); }
  if (!address) return refuse(503, 'companion_unavailable', sorry, false, unknown);
  if (tooFast(address.caller)) { res.setHeader('Retry-After', '60'); return refuse(503, 'companion_unavailable', sorry, true, unknown); }

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
  //    An answer is counted in a scope of its own, and the person's explanations are only read, to say what is left.
  const [mine, explained] = await Promise.all([takeSlot(answer ? 'r' : 'p', person, answer ? NOTES_A_DAY : limit, token, { now }), answer ? slotsHeld('p', person, limit, now) : null]);
  const untouched: Allowance = explained === null ? unknown : { consumed: explained, remaining: limit - explained };
  if (mine.state === 'full') { tomorrow(); return answer ? refuse(429, 'notes_limit', sorry, false, untouched) : refuse(429, 'orientation_limit', COPY.limit[language], false, { consumed: limit, remaining: 0 }); }
  if (mine.state !== 'taken') return refuse(503, 'companion_unavailable', sorry, true, unknown);
  const before: Allowance = answer ? untouched : { consumed: mine.used - 1, remaining: limit - mine.used + 1 };
  // 4. The address and its network: taken together, and given back with the person's when either refuses.
  const [theirs, around] = await Promise.all([takeSlot('a', address.caller, limit * 4, token, { now }), takeSharedSlot('n', address.network, limit * 16, token, { now })]);
  if (theirs.state !== 'taken' || around.state !== 'taken') {
    await giveBack([mine, theirs, around], token);
    // The person is told the truth: the network's day is used, theirs is as it was.
    if (theirs.state === 'full' || (theirs.state === 'taken' && around.state === 'full')) { tomorrow(); return refuse(429, 'orientation_limit', COPY.crowded[language], false, before); }
    return refuse(503, 'companion_unavailable', sorry, true, before);
  }
  // 5. Everyone's day, last: a request refused above never touches it.
  const shared = await takeSharedSlot('d', 'all', companionDailyCeiling(model), token, { now });
  if (shared.state !== 'taken') {
    await giveBack([mine, theirs, around], token);
    if (shared.state !== 'full') return refuse(503, 'companion_unavailable', sorry, true, before);
    console.error(JSON.stringify({ route: 'companion-turn', event: 'paused', reason: 'daily_turns' }));
    return refuse(503, 'companion_paused', COPY.paused[language], false, before);
  }

  const usage: LlmUsage[] = [];
  const started = Date.now();
  try {
    if (answer) {
      const note = await readCompanionAnswer(answer.question, answer.text, language, { locale, usage, model: reader });
      // The log says that an answer was noted, never which question it answered or what was read into it.
      console.error(JSON.stringify({ route: 'companion-turn', event: 'noted', language, model: reader, ms: Date.now() - started }));
      return res.status(200).json({
        version: COMPANION_VERSION, requestId: echoed, kind: 'noted', patch: { notes: [note], asked: [note.field] },
        checkIn: nextCheckIn({ ...answer.context, asked: [...answer.context.asked, note.field] }), allowance: { kind: 'orientation', ...before },
      });
    }
    const { question, speech, candidate, previous } = ask!;
    const turn = await runCompanionTurn(question, language, { locale, speech, candidate, previous, usage, model, picture });
    // The person's notes shaped the answer: there were some, and the model's own reply is the one served.
    const personalized = picture !== null && turn.source === 'model' && !turn.aboutCandidate;
    console.error(JSON.stringify({ route: 'companion-turn', event: 'turn', source: turn.source, rejected: turn.rejected, judge: turn.judge, offer: turn.aboutCandidate, followUp: turn.followUp !== null, language, speech: speech ?? 'plain', model, ...(context ? { personalized } : {}), ms: Date.now() - started }));
    if (turn.aboutCandidate && candidate) {
      // The question was about an asset after all: the client asks the person to confirm it. The model call was
      // paid, so the address, the network and the day keep their slots; the person's allowance is for explanations.
      await giveBack([mine], token);
      return res.status(200).json({
        version: COMPANION_VERSION, requestId: echoed, kind: 'desk_offer', reply: { text: turn.text, followUp: null },
        nextAction: { type: 'open_desk', symbol: candidate.symbol.toUpperCase(), question, requiresConfirmation: true }, allowance: { kind: 'orientation', ...before },
      });
    }
    const gist = companionGist(turn.text);
    return res.status(200).json({
      version: COMPANION_VERSION, requestId: echoed, kind: 'explanation',
      // The first sentence, when it can stand alone: what the client shows while Bobby speaks. Always the start of `text`.
      reply: { text: turn.text, followUp: turn.followUp, ...(gist ? { gist } : {}) }, nextAction: null,
      // Only when the person's context was read. The question Bobby would ask next is chosen by code; no fact card yet.
      ...(context ? { personalized, checkIn: nextCheckIn(context), fact: null } : {}),
      allowance: { kind: 'orientation', consumed: mine.used, remaining: limit - mine.used },
    });
  } catch (error) {
    // Nothing reached the person: their turn and the network's come back. The address keeps the attempt, so a
    // failing provider is not an unlimited number of calls. A call that timed out may have been billed, and a
    // reply its second reader could not check was: both keep their place in the day as well.
    const timedOut = usage.some((row) => row.stop === 'timeout' || row.stop === 'deadline'), unchecked = error instanceof CompanionUnchecked;
    await giveBack(timedOut || unchecked ? [mine, around] : [mine, around, shared], token);
    console.error(JSON.stringify({ route: 'companion-turn', event: 'failed', ...(answer ? { noting: true } : {}), timedOut, unchecked, language, model: answer ? reader : model, ms: Date.now() - started }));
    return refuse(503, 'companion_unavailable', sorry, true, before);
  } finally {
    if (usage.length) waitUntil(logLlmUsage(usage, { surface: COMPANION_SURFACE, level: null }).then(forgetCompanionSpend));
    // Once per person and day: the slot rows of past days go.
    if (mine.used === 1) waitUntil(sweepSlots());
  }
}
