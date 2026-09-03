// ============================================================
// dex-execution — the agent cycle's bridge to the swap rail. Base-only,
// Uniswap V3, Coinbase B20 tokenized stocks.
//
// The cycle produces an INTENT, never calldata: a quote-only preview (no
// recipient, no attestation, nothing recorded). The human reads it on the
// card, attests eligibility, and only then /api/base-swap builds, simulates
// and records the transaction for their wallet — with the cycle id carried
// along so the confirmed receipt lands on this cycle.
// ============================================================

import { BaseSwapError, quoteBaseSwap, type BaseSwapQuote } from './base-swap.js';
import { BASE_SWAP_CHAIN_ID, findBaseToken } from '../../src/lib/base-swap/tokens.js';

/** The only chain the agent trades on, as the string the trade rows carry. */
export const TRADE_CHAIN_ID = String(BASE_SWAP_CHAIN_ID);
/** Hard ceiling on what a debate may ask for, before the rail's own per-ticket cap. */
const AGENT_MAX_TICKET_USD = 10_000;

export interface TradeIntent {
  tokenIn: 'USDC';
  tokenOut: string;
  /** Human amount of USDC. */
  amount: string;
  cycleId: string;
  /** Quote-only preview: amounts, route, reference, warnings. No calldata. */
  preview: Pick<BaseSwapQuote, 'amountIn' | 'amountOut' | 'minAmountOut' | 'executionPrice' | 'priceImpactPct' | 'route' | 'venue' | 'stockReference' | 'warnings' | 'txWithheld' | 'limits'>;
}

export interface PreparedIntent {
  ok: boolean;
  intent?: TradeIntent;
  status?: 'aborted_stale_quote' | 'aborted_exec_error';
  reason?: string;
}

/** USDC → `tokenSymbol` for `amountUsd`, as an intent for a human to act on. */
export async function prepareBaseIntent(opts: { tokenSymbol: string; amountUsd: number; cycleId: string }): Promise<PreparedIntent> {
  const { tokenSymbol, amountUsd, cycleId } = opts;
  const token = findBaseToken(tokenSymbol);
  if (!token) return { ok: false, status: 'aborted_exec_error', reason: `${tokenSymbol} is not on the Base allow-list` };
  if (token.assetClass !== 'tokenized-stock') {
    return { ok: false, status: 'aborted_exec_error', reason: `${tokenSymbol} is outside the Base tokenized-stock execution focus` };
  }
  if (!Number.isFinite(amountUsd) || amountUsd <= 0 || amountUsd > AGENT_MAX_TICKET_USD) {
    return { ok: false, status: 'aborted_exec_error', reason: `invalid amountUsd ${amountUsd}` };
  }
  try {
    const amount = amountUsd.toFixed(2);
    const q = await quoteBaseSwap({ tokenIn: 'USDC', tokenOut: token.symbol, amount });
    if (!(Number(q.amountOut) > 0)) return { ok: false, status: 'aborted_stale_quote', reason: 'quote returned no output' };
    // Guards that need no wallet already apply to the preview (ticket cap, impact, reference, pause).
    if (q.txWithheld.length) return { ok: false, status: 'aborted_exec_error', reason: q.txWithheld.join('; ') };
    return {
      ok: true,
      intent: {
        tokenIn: 'USDC',
        tokenOut: token.symbol,
        amount,
        cycleId,
        preview: {
          amountIn: q.amountIn, amountOut: q.amountOut, minAmountOut: q.minAmountOut, executionPrice: q.executionPrice,
          priceImpactPct: q.priceImpactPct, route: q.route, venue: q.venue, stockReference: q.stockReference,
          warnings: q.warnings, txWithheld: q.txWithheld, limits: q.limits,
        },
      },
    };
  } catch (error) {
    if (error instanceof BaseSwapError && error.code === 'no_route') return { ok: false, status: 'aborted_stale_quote', reason: error.message };
    return { ok: false, status: 'aborted_exec_error', reason: error instanceof Error ? error.message : String(error) };
  }
}
