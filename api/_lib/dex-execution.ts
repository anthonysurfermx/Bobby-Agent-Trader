// ============================================================
// dex-execution — the agent cycle's bridge to the swap rail. Base-only,
// Uniswap V3 (api/_lib/base-swap.ts). The OKX aggregator path that used
// to live here was retired on 2026-09-03: no upstream builds calldata
// for Bobby anymore.
//
// Fail-closed contract for agent-run: a decision the rail cannot turn into
// guarded, simulated calldata is ABORTED, never queued with placeholders.
// ============================================================

import { BaseSwapError, quoteBaseSwap, toTradeExecution, type TradeExecutionPayload } from './base-swap.js';
import { BASE_SWAP_CHAIN_ID, findBaseToken } from '../../src/lib/base-swap/tokens.js';

/** The only chain the agent trades on, as the string the trade rows carry. */
export const TRADE_CHAIN_ID = String(BASE_SWAP_CHAIN_ID);
/** Hard ceiling on what a debate may ask for, before the rail's own per-ticket cap. */
const AGENT_MAX_TICKET_USD = 10_000;

// One shape (not a discriminated union): the API tsconfig is not strict, and
// without strictNullChecks `if (!prepared.ok)` would not narrow.
export interface PreparedTrade {
  ok: boolean;
  execution?: TradeExecutionPayload;
  usdValue?: number | null;
  route?: string;
  warnings?: string[];
  status?: 'aborted_stale_quote' | 'aborted_exec_error';
  reason?: string;
}

/** USDC → `tokenSymbol` for `amountUsd`, built for `wallet` to sign. */
export async function prepareBaseTrade(opts: { tokenSymbol: string; amountUsd: number; wallet: string; country?: string | null }): Promise<PreparedTrade> {
  const { tokenSymbol, amountUsd, wallet, country } = opts;
  if (!findBaseToken(tokenSymbol)) return { ok: false, status: 'aborted_exec_error', reason: `${tokenSymbol} is not on the Base allow-list` };
  if (!Number.isFinite(amountUsd) || amountUsd <= 0 || amountUsd > AGENT_MAX_TICKET_USD) {
    return { ok: false, status: 'aborted_exec_error', reason: `invalid amountUsd ${amountUsd}` };
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) return { ok: false, status: 'aborted_exec_error', reason: 'invalid wallet' };
  try {
    const quote = await quoteBaseSwap({ tokenIn: 'USDC', tokenOut: tokenSymbol, amount: amountUsd, recipient: wallet, country: country ?? null });
    if (!(Number(quote.amountOut) > 0)) return { ok: false, status: 'aborted_stale_quote', reason: 'quote returned no output' };
    const execution = toTradeExecution(quote);
    if (!execution) return { ok: false, status: 'aborted_exec_error', reason: quote.txWithheld.join('; ') || 'calldata withheld' };
    return { ok: true, execution, usdValue: quote.usdValue, route: quote.route.description, warnings: quote.warnings };
  } catch (error) {
    if (error instanceof BaseSwapError && error.code === 'no_route') return { ok: false, status: 'aborted_stale_quote', reason: error.message };
    return { ok: false, status: 'aborted_exec_error', reason: error instanceof Error ? error.message : String(error) };
  }
}
