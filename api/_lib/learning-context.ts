import { readerContext, type Experience, type MemorySummary, type ReaderContext, type RiskPref } from './user-memory.js';
import type { AppLanguage } from '../../src/lib/app-language.js';

/** Presentation defaults are instructions for Bobby, never facts learned about the account. */
export interface LearningExplanation {
  experience: Experience;
  source: 'explicit' | 'default';
  explainRiskDepth?: RiskPref;
}

export function explanationFor(prefs?: { experience?: Experience | null; explainRiskDepth?: RiskPref | null } | null): LearningExplanation {
  const explicit = prefs?.experience === 'new' || prefs?.experience === 'some' || prefs?.experience === 'experienced';
  const explanation: LearningExplanation = { experience: explicit ? prefs!.experience! : 'new', source: explicit ? 'explicit' : 'default' };
  const depth = prefs?.explainRiskDepth;
  if (depth === 'low' || depth === 'medium' || depth === 'high') explanation.explainRiskDepth = depth;
  return explanation;
}

/** Facts from the account's confirmed memory summary; no raw questions, answers, sectors or inferred preferences. */
export interface LearningContext extends ReaderContext {
  version: 1;
  explanation: LearningExplanation;
}

export interface LearningContextOptions {
  now?: number;
  firstName?: string | null;
  priceNow?: number | null;
  language?: AppLanguage;
  locale?: string;
}

/** The caller has already applied identity, platform and consent gates. A failed or empty summary adds no reader. */
export function buildLearningContext(summary: MemorySummary | null, symbol: string, opts: LearningContextOptions = {}): LearningContext | null {
  const reader = readerContext(summary, symbol, opts.now ?? Date.now(), opts.firstName, opts.priceNow, opts.language ?? 'en', opts.locale);
  if (!reader) return null;
  return { ...reader, version: 1, explanation: explanationFor(reader.prefs) };
}

export const LEARNING_CONTEXT_RULE = "reader.version 1 describes confirmed account-memory facts and a presentation policy. reader.explanation.experience controls explanation only: new means familiar words, explain any necessary market term and connect one observable fact to its consequence; some or experienced is used only when explicitly chosen. When reader.explanation.source is default, the beginner explanation is Bobby's default, not a discovered fact about the person: never claim they are a beginner. Shape synthesis.followUp as one clear question about the current asset and one observable check, using an explicit horizon only when present; do not invent a prior answer, a sector interest, a holding, a response to a follow-up or a preferred time. Ask counts describe answered desk requests, not proof the reader saw, saved, agreed with or acted on them. Never let these presentation facts set the verdict, direction, evidence, sufficiency, suitability, position sizing or account model.";
