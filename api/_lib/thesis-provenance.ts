// Persist the exact technical-desk snapshot, never a caller-supplied thesis.
// This attests origin/account/fields, not a separate three-model deliberation.
import { z } from 'zod';
import { bobbyRest, bobbyServiceHeaders } from './bobby-db.js';
import { assertWritesOpen } from './control.js';
import { ThesisSchema, type Thesis } from './thesis-rules.js';
import { findBaseToken } from '../../src/lib/base-swap/tokens.js';

const price = z.number().finite().positive();
const DeskResult = z.object({
  symbol: z.string(), isEquity: z.boolean(),
  market: z.object({ price: price.nullable().optional() }).passthrough(),
  technicals: z.object({ price: price.optional() }).passthrough().nullable(),
  technical_pulse: z.object({
    direction: z.enum(['long','short']), signal: z.string().nullable().optional(),
    conviction_pct: z.number().finite().min(55).max(100),
    trade_plan: z.object({ entry: price, stop: price, target: price }).passthrough(),
  }).passthrough(),
}).passthrough();

export function issuedThesisFromDesk(result: unknown): Thesis | null {
  const parsed = DeskResult.safeParse(result);
  if (!parsed.success) return null;
  const r = parsed.data;
  const signal = (r.technical_pulse.signal ?? '').toLowerCase().replaceAll('-', '_');
  if (signal.includes('no_trade') || signal.includes('neutral') || signal.includes('wait')) return null;
  const px = r.market.price ?? r.technicals?.price ?? null;
  if (!px) return null;
  const thesis = ThesisSchema.safeParse({ symbol:r.symbol, isEquity:r.isEquity,
    direction:r.technical_pulse.direction, price:px, entry:r.technical_pulse.trade_plan.entry,
    stop:r.technical_pulse.trade_plan.stop, target:r.technical_pulse.trade_plan.target });
  return thesis.success ? thesis.data : null;
}

export interface IssuedThesisRead { id: string; thesis: Thesis; issuedAt: string; expiresAt: string }

export async function issueThesisRead(identityId: string, result: unknown): Promise<IssuedThesisRead | null> {
  const thesis = issuedThesisFromDesk(result);
  const asset = thesis ? findBaseToken(thesis.symbol) : null;
  if (!thesis || !asset || asset.stable) return null;
  await assertWritesOpen('thesis-read');
  const response = await fetch(bobbyRest('rpc/bobby_issue_thesis_read'), {
    method:'POST', headers:bobbyServiceHeaders(), signal:AbortSignal.timeout(5000),
    body:JSON.stringify({p_identity:identityId,p_thesis:thesis,p_asset:asset.address.toLowerCase()}),
  });
  if (!response.ok) throw new Error('Thesis origin could not be saved');
  return await response.json() as IssuedThesisRead | null;
}
