// ============================================================
// What a person told Bobby, as it travels with a request (context v1): typed notes from the fixed catalog
// (api/_lib/companion-questions.ts). They are kept on the person's device and sent whole each time. The server
// keeps none of it: the notes are read for the one turn, and no note, value, question id or word of an answer
// is logged, stored or copied into an instruction (scripts/test-companion.mts watches every console line and
// every storage call). That a context was used, or an answer read, is counted like any other turn.
//
// A context is read only when all of these hold:
//   · the owner turned it on (BOBBY_COMPANION_CONTEXT=on; off by default);
//   · the person agreed to notes being kept (`consent.memory`);
//   · the notice they agreed to is one this server knows (`consent.notice`).
// Notes about their own money need the second consent (`consent.money`) and are dropped without it. When a
// condition fails, or the context has any other shape, nothing is refused: the turn is the turn of a person
// who sent none, as it was before this existed.
//
// There is no free text in it. A note is a question's id, one of that question's listed values and where it
// came from; dates and expiry stay on the device. An unknown key anywhere makes it another shape: a client
// that starts sending something else about a person finds out at once, because nothing is personalized.
// ============================================================
import { z } from 'zod';
import { CATALOG_VERSION, QUESTION_IDS, UNSURE, companionQuestion, questionValues, type QuestionId } from './companion-questions.js';

export const CONTEXT_VERSION = 1;
/** Off unless the owner turns it on: a context is accepted and ignored, as in the pilot. */
export const companionContextEnabled = (env: NodeJS.ProcessEnv = process.env) => env.BOBBY_COMPANION_CONTEXT === 'on';
/** The versions of the consent text a person may have agreed to. A new text is a new entry, never an edit. */
export const ACCEPTED_NOTICES: readonly string[] = ['memory-1'];
/** What the 405 of a `GET` tells a client: whether Bobby's questions may be shown, for which catalog, under which notices. */
export const companionCapabilities = (env: NodeJS.ProcessEnv = process.env) => ({ context: companionContextEnabled(env), catalog: CATALOG_VERSION, notices: [...ACCEPTED_NOTICES] });

/** Where a note comes from: the person said it, confirmed it, chose it in an exercise, or it was read into their words with little confidence. */
export const NOTE_SOURCES = ['said', 'confirmed', 'shown', 'inferred'] as const;
export const CompanionNote = z.object({ field: z.enum(QUESTION_IDS), value: z.string(), source: z.enum(NOTE_SOURCES) }).strict()
  .refine((note) => questionValues(companionQuestion(note.field)).includes(note.value));
export type CompanionNote = z.infer<typeof CompanionNote>;

export const CompanionContext = z.object({
  version: z.literal(CONTEXT_VERSION),
  consent: z.object({ notice: z.string().max(40), memory: z.boolean(), money: z.boolean().default(false) }).strict(),
  /** The person's return day, counted by the client. */
  // A person who keeps coming back is on day 60 for good: no question waits for a later day.
  day: z.number().int().min(1).transform((day) => Math.min(day, 60)),
  /** The questions already put to the person, answered or skipped. */
  asked: z.array(z.enum(QUESTION_IDS)).max(64).transform((ids) => [...new Set(ids)]).default([]),
  notes: z.array(CompanionNote).max(8).refine((notes) => new Set(notes.map((note) => note.field)).size === notes.length).default([]),
}).strict();

/** A context that was read: the notes the person agreed to share for this turn. */
export interface PersonContext { day: number; asked: readonly QuestionId[]; notes: readonly CompanionNote[]; /** The second consent: notes about their own money. */ money: boolean }

/** The person's context, or null when it is not to be read (see the conditions above). Never throws, never refuses. */
export function readCompanionContext(raw: unknown, env: NodeJS.ProcessEnv = process.env): PersonContext | null {
  if (!companionContextEnabled(env)) return null;
  const parsed = CompanionContext.safeParse(raw);
  if (!parsed.success) return null;
  const { consent, day, asked, notes } = parsed.data;
  if (consent.memory !== true || !ACCEPTED_NOTICES.includes(consent.notice)) return null;
  const money = consent.money === true;
  return { day, asked, money, notes: notes.filter((note) => money || !companionQuestion(note.field).money) };
}

/**
 * The one question Bobby would ask next, chosen here and never by a model: the first of the catalog that the
 * person's day allows, that was not asked and has no note. A question about their money needs the second consent.
 */
export function nextCheckIn(context: PersonContext): { questionId: QuestionId } | null {
  const noted = new Set(context.notes.map((note) => note.field));
  const next = QUESTION_IDS.map(companionQuestion).find((question) => question.day <= context.day && !context.asked.includes(question.id) && !noted.has(question.id) && (!question.money || context.money));
  return next ? { questionId: next.id } : null;
}

// ---------- what the model that answers is given ----------
// The notes in plain words, in this order whatever order they arrived in. The values are the catalog's own.
const PICTURE_KEY: Record<QuestionId, string> = {
  interest: 'curiousAbout', when: 'needsTheMoneyIn', cushion: 'anEmergencyWouldTakeIt', barrier: 'stoppedBy',
  hurry: 'wantsResults', fall: 'inTheFallExerciseChose', belief: 'takesAsTrue', format: 'learnsBestWith',
};
type Seen = Record<string, string | boolean>;
export type CompanionPicture = Record<string, string | boolean | Seen>;
const seen = (note: CompanionNote): string | boolean => (note.field === 'cushion' && note.value !== UNSURE ? note.value === 'would_need_it' : note.value);

/**
 * What Bobby has understood of the person, for the model that answers: one key per note. A note read into
 * their words with little confidence goes under `maybe`, so the model leans on it less. Null when there is nothing.
 */
export function companionPicture(notes: readonly CompanionNote[]): CompanionPicture | null {
  const sure: Seen = {}, maybe: Seen = {};
  for (const field of Object.keys(PICTURE_KEY) as QuestionId[]) {
    const note = notes.find((candidate) => candidate.field === field);
    // An answer nobody could place says nothing of the person: it only keeps the question from being asked again.
    if (!note || (note.source === 'inferred' && note.value === UNSURE)) continue;
    (note.source === 'inferred' ? maybe : sure)[PICTURE_KEY[field]] = seen(note);
  }
  if (!Object.keys(sure).length && !Object.keys(maybe).length) return null;
  return Object.keys(maybe).length ? { ...sure, maybe } : sure;
}
