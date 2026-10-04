import { z } from 'zod';

export const FINANCIAL_CATEGORIES = ['goal', 'income', 'expense', 'debt', 'asset', 'preference', 'transaction'] as const;
export const FINANCIAL_CONTEXT_LIMIT = 50;
export const CONTEXT_IMPORT_LIMIT = 20;
export const CONTEXT_INPUT_BYTES = 16_384;

// Financial facts are untrusted, user-reported data. Never accept credentials or payment identifiers.
export function containsSensitiveIdentifier(value: string): boolean {
  return /\b(?:sk-[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/.test(value)
    || /\b[A-Z]{2}\d{2}[A-Z0-9 ]{11,30}\b/i.test(value)
    || /\b(?:\d[ -]?){13,19}\b/.test(value)
    || /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value);
}

export const FinancialItemSchema = z.object({
  category: z.enum(FINANCIAL_CATEGORIES),
  summary: z.string().trim().min(3).max(240)
    .refine(value => !Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127), 'Use a short, single-line financial fact.')
    .refine(value => !containsSensitiveIdentifier(value), 'Remove credentials and account or card numbers.'),
  amount: z.number().finite().min(0).max(1e12).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  observedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, 'Use a real calendar date.').optional(),
}).strict().refine(item => item.amount === undefined || item.currency !== undefined, 'Include the currency with an amount.');

export const ContextImportSchema = z.object({
  format: z.literal('bobby-context-v1'),
  items: z.array(FinancialItemSchema).min(1).max(CONTEXT_IMPORT_LIMIT),
}).strict();
export type FinancialItem = z.infer<typeof FinancialItemSchema>;
export interface SavedFinancialItem extends FinancialItem {
  id: string;
  source: 'chatgpt';
  verification: 'user_reported';
  createdAt: string;
  updatedAt: string;
}
export interface ContextDraft { id: string; items: FinancialItem[]; expiresAt: string }
export interface BobbyRecommendation {
  id: string; symbol: string; asOf: string; headline: string; why: string; risk: string; watch: string;
  verdict: 'wait' | 'review'; direction: 'long' | 'short' | 'none'; createdAt: string;
}
export interface FinancialContextState {
  enabled: boolean; financialMemoryEnabled: boolean; accountMemoryEnabled: boolean;
  items: SavedFinancialItem[]; drafts: ContextDraft[]; recommendations: BobbyRecommendation[];
}

export const CHATGPT_EXPORT_PROMPT = `Prepare only the financial facts I explicitly choose to share with Bobby from this conversation. Ask me which facts if I have not selected them. Do not access or reconstruct my full chat history. Do not include raw messages, names, account/card numbers, passwords, credentials, or anything unrelated to my chosen financial task. Do not infer facts or describe reported transactions as verified. Return only JSON, without markdown, in this format: {"format":"bobby-context-v1","items":[{"category":"goal","summary":"Build an emergency fund","amount":3000,"currency":"EUR"}]}. Replace the example with my chosen facts. Include observedAt as YYYY-MM-DD only if I supplied the real date; omit unknown amounts, currencies and dates. Allowed categories: goal, income, expense, debt, asset, preference, transaction. Each summary is one line, at most 240 characters; at most 20 items. Amounts are nonnegative numbers and require a three-letter uppercase currency. I will review and approve them in Bobby before saving.`;

/** Parsing is local: never upload a transcript for extraction. */
export function parseContextImport(text: string): FinancialItem[] {
  if (new TextEncoder().encode(text).length > CONTEXT_INPUT_BYTES) throw new Error('context_too_large');
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return ContextImportSchema.parse(JSON.parse(clean)).items;
}
