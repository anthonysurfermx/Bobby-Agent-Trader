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
import { recordBuiltSwap } from './swap-receipts.js';
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
export async function prepareBaseTrade(opts: { tokenSymbol: string; amountUsd: number; wallet: string; country?: string | null; cycleId?: string | null; identityId?: string | null }): Promise<PreparedTrade> {
  const { tokenSymbol, amountUsd, wallet, country, cycleId, identityId } = opts;
  const token = findBaseToken(tokenSymbol);
  if (!token) return { ok: false, status: 'aborted_exec_error', reason: `${tokenSymbol} is not on the Base allow-list` };
  if (token.assetClass !== 'tokenized-stock') {
    return { ok: false, status: 'aborted_exec_error', reason: `${tokenSymbol} is outside the Base tokenized-stock execution focus` };
  }
  if (!Number.isFinite(amountUsd) || amountUsd <= 0 || amountUsd > AGENT_MAX_TICKET_USD) {
    return { ok: false, status: 'aborted_exec_error', reason: `invalid amountUsd ${amountUsd}` };
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) return { ok: false, status: 'aborted_exec_error', reason: 'invalid wallet' };
  try {
    // The execution card presents the jurisdiction/issuer acknowledgement
    // before it enables either wallet signature. This flag allows the
    // already-authenticated agent request to prepare that review payload.
    const quote = await quoteBaseSwap({ tokenIn: 'USDC', tokenOut: tokenSymbol, amount: amountUsd, recipient: wallet, stockEligibilityConfirmed: true, country: country ?? null });
    if (!(Number(quote.amountOut) > 0)) return { ok: false, status: 'aborted_stale_quote', reason: 'quote returned no output' };
    const execution = toTradeExecution(quote);
    if (!execution) return { ok: false, status: 'aborted_exec_error', reason: quote.txWithheld.join('; ') || 'calldata withheld' };
    // Same rule as /api/base-swap: swap calldata the store did not see is never handed out.
    if (quote.tx?.swap && quote.tx.calldataHash && quote.recipient) {
      const recorded = await recordBuiltSwap({
        wallet: quote.recipient, identityId: identityId ?? null, cycleId: cycleId ?? null, platform: 'web',
        tokenIn: { symbol: quote.tokenIn.symbol, address: quote.tokenIn.address },
        tokenOut: { symbol: quote.tokenOut.symbol, address: quote.tokenOut.address },
        amountInRaw: quote.amountInRaw, quotedOutRaw: quote.amountOutRaw, minOutRaw: quote.minAmountOutRaw,
        route: quote.route.description, router: quote.venue.router, calldataHash: quote.tx.calldataHash, deadline: quote.deadline,
      });
      if (!recorded.recorded) return { ok: false, status: 'aborted_exec_error', reason: `receipt store unavailable (${recorded.reason ?? 'unknown'}); calldata withheld` };
    }
    return { ok: true, execution, usdValue: quote.usdValue, route: quote.route.description, warnings: quote.warnings };
  } catch (error) {
    if (error instanceof BaseSwapError && error.code === 'no_route') return { ok: false, status: 'aborted_stale_quote', reason: error.message };
    return { ok: false, status: 'aborted_exec_error', reason: error instanceof Error ? error.message : String(error) };
  }
}
