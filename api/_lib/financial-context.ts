import { z } from 'zod';
import { bobbyRest, bobbyServiceHeaders } from './bobby-db.js';
import { FinancialItemSchema, type FinancialItem, type FinancialContextState, type BobbyRecommendation } from '../../shared/financial-context.js';

export class FinancialContextUnavailableError extends Error {}
export class FinancialContextConflictError extends Error {
  constructor(public readonly code: string) { super(code); }
}
const UUID = z.string().uuid();
const identityOf = (id: string) => UUID.parse(id);
async function rpc(name: string, body: Record<string, unknown>, timeoutMs = 4000): Promise<unknown> {
  try {
    const response = await fetch(bobbyRest(`rpc/${name}`), {
      method: 'POST', headers: bobbyServiceHeaders(), body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new FinancialContextUnavailableError();
    const result = await response.json() as { error?: string };
    if (result?.error) throw new FinancialContextConflictError(result.error);
    return result;
  } catch (error) {
    if (error instanceof FinancialContextConflictError) throw error;
    throw new FinancialContextUnavailableError();
  }
}

export async function listFinancialContext(identityId: string, timeoutMs = 4000): Promise<FinancialContextState> {
  const result = await rpc('bobby_financial_list', { p_identity: identityOf(identityId) }, timeoutMs) as FinancialContextState;
  if (!result || typeof result.enabled !== 'boolean' || !Array.isArray(result.items) || !Array.isArray(result.drafts) || !Array.isArray(result.recommendations)) throw new FinancialContextUnavailableError();
  return result;
}
export async function importFinancialContext(identityId: string, items: FinancialItem[], requestId: string, draftId?: string): Promise<void> {
  await rpc('bobby_financial_import', { p_identity: identityOf(identityId), p_items: items.map(item => FinancialItemSchema.parse(item)), p_request: UUID.parse(requestId), p_draft: draftId ? UUID.parse(draftId) : null });
}
export async function updateFinancialItem(identityId: string, id: string, item: FinancialItem): Promise<void> {
  await rpc('bobby_financial_update', { p_identity: identityOf(identityId), p_id: UUID.parse(id), p_item: FinancialItemSchema.parse(item) });
}
export async function setFinancialContextEnabled(identityId: string, enabled: boolean): Promise<void> {
  await rpc('bobby_financial_set_enabled', { p_identity: identityOf(identityId), p_enabled: enabled });
}
export async function forgetFinancialContext(identityId: string, id: string | null = null): Promise<void> {
  await rpc('bobby_financial_forget', { p_identity: identityOf(identityId), p_id: id === null ? null : UUID.parse(id) });
}
export async function dismissContextDraft(identityId: string, draftId: string): Promise<void> {
  await rpc('bobby_financial_dismiss', { p_identity: identityOf(identityId), p_id: UUID.parse(draftId) });
}
export async function purgeFinancialContext(): Promise<void> {
  await rpc('bobby_financial_purge', {});
}
export async function createContextDraft(identityId: string, items: FinancialItem[]): Promise<{ id: string; items: FinancialItem[]; expiresAt: string; reviewUrl: string }> {
  const draft = await rpc('bobby_financial_prepare', { p_identity: identityOf(identityId), p_items: items.map(item => FinancialItemSchema.parse(item)) }) as { id: string; items: FinancialItem[]; expiresAt: string };
  if (!UUID.safeParse(draft?.id).success) throw new FinancialContextUnavailableError();
  return { ...draft, reviewUrl: `https://bobbyprotocol.xyz/chatgpt?draft=${encodeURIComponent(draft.id)}` };
}
export async function listRecommendations(identityId: string, symbol?: string, limit = 10): Promise<BobbyRecommendation[]> {
  const parsed = z.object({ symbol: z.string().regex(/^[A-Z0-9.^=-]{1,20}$/).optional(), limit: z.number().int().min(1).max(20) })
    .safeParse({ symbol: symbol?.toUpperCase(), limit });
  if (!parsed.success) throw new FinancialContextConflictError('invalid_context');
  // The database filters the retained account history before applying the result limit.
  const result = await rpc('bobby_financial_recommendations', { p_identity: identityOf(identityId), p_symbol: parsed.data.symbol ?? null, p_limit: parsed.data.limit }) as { recommendations?: unknown };
  if (!result || !Array.isArray(result.recommendations)) throw new FinancialContextUnavailableError();
  return result.recommendations as BobbyRecommendation[];
}

/** Called only after a delivered, validated read, under the existing memory consent gates. No original question. */
export async function recordRecommendation(identityId: string, result: unknown): Promise<boolean> {
  try {
    const parsed = z.object({ symbol: z.string(), provenance: z.object({ asOf: z.string().datetime() }), agents: z.object({
      verdict: z.enum(['wait','review']), direction: z.enum(['long','short','none']),
      synthesis: z.object({ headline: z.string().min(1).max(500), why: z.string().min(1).max(500), risk: z.string().min(1).max(500), watch: z.string().min(1).max(500) }),
    }) }).parse(result);
    const snapshot = { symbol: parsed.symbol, asOf: parsed.provenance.asOf, ...parsed.agents.synthesis, verdict: parsed.agents.verdict, direction: parsed.agents.direction };
    // Keep exactly the published synthesis, without chart data, internal traces or provider payloads.
    const { symbol, asOf, headline, why, risk, watch, verdict, direction } = snapshot;
    return await rpc('bobby_financial_record_recommendation', { p_identity: identityOf(identityId), p_snapshot: { symbol, asOf, headline, why, risk, watch, verdict, direction } }, 3000) === true;
  } catch { return false; }
}
