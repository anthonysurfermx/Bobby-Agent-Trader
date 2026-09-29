// bobby_uniswap_quote — exact-input quote on Uniswap V3, Base (8453), from
// Bobby's own quoter call. No aggregator, no keys. Read-only: never calldata.
import { quoteBaseSwap } from './base-swap.js';
import { BASE_STOCK_SYMBOLS, BASE_SWAP_CHAIN_ID } from '../../src/lib/base-swap/tokens.js';

export async function getUniswapCompatibleQuote(rawArgs: Record<string, unknown>): Promise<Record<string, unknown>> {
  const chainId = String(rawArgs.chainId || BASE_SWAP_CHAIN_ID);
  if (chainId !== String(BASE_SWAP_CHAIN_ID)) {
    throw new Error(`bobby_uniswap_quote supports Base only (chainId ${BASE_SWAP_CHAIN_ID})`);
  }
  const tradeType = String(rawArgs.tradeType || rawArgs.type || 'EXACT_INPUT').toUpperCase();
  if (tradeType !== 'EXACT_INPUT') throw new Error('bobby_uniswap_quote supports EXACT_INPUT only');

  const tokenIn = String(rawArgs.tokenIn || rawArgs.from || 'USDC');
  const tokenOut = String(rawArgs.tokenOut || rawArgs.to || 'NVDAc');
  const amount = String(rawArgs.amount || rawArgs.amountIn || '10');
  const slippageBps = Number(rawArgs.slippageBps || 50);

  const q = await quoteBaseSwap({ tokenIn, tokenOut, amount, slippagePct: slippageBps / 100 });
  // Audit 2026-09-28: a price is not permission. Say whether Bobby would build
  // this trade and why not — an integrator must never read a quote that the
  // swap endpoint refuses (e.g. above the per-trade limit) as executable. A
  // wallet-free quote skips the stock switches, so they are added here; the
  // swap endpoint already tells any wallet outside the allow-list the same.
  const blockers = [...q.txWithheld];
  if (q.requiresStockEligibility) {
    if (process.env.BASE_STOCK_SWAPS_ENABLED !== 'true') blockers.push('tokenized-stock swaps are disabled');
    else if (process.env.BASE_STOCK_SWAP_CANARY_WALLETS !== undefined) blockers.push('tokenized-stock swaps are limited to the launch allow-list');
  }
  const walletChecks = q.requiresStockEligibility
    ? ['stock eligibility attestation', 'viewer country', 'wallet balance and allowance', 'swap simulation']
    : ['wallet balance and allowance', 'swap simulation'];
  return {
    provider: 'uniswap-v3-base',
    interface: 'uniswap-compatible',
    chainId,
    tradeType,
    quoteType: 'exactIn',
    tokenIn: q.tokenIn,
    tokenOut: q.tokenOut,
    amountIn: q.amountIn,
    amountInWei: q.amountInRaw,
    amountOut: q.amountOut,
    amountOutWei: q.amountOutRaw,
    minAmountOut: q.minAmountOut,
    executionPrice: q.executionPrice,
    priceImpactPct: q.priceImpactPct,
    usdValue: q.usdValue,
    side: q.side,
    executable: blockers.length === 0,
    txWithheld: blockers,
    warnings: q.warnings,
    limits: q.limits,
    requiresStockEligibility: q.requiresStockEligibility,
    execution: blockers.length === 0
      ? `Quote only. Calldata is built through /api/base-swap for a signed-in wallet after these checks: ${walletChecks.join(', ')}.`
      : `Not executable as quoted: ${blockers.join('; ')}.`,
    slippageBps,
    route: { kind: q.route.kind, fees: q.route.fees, description: q.route.description, gasEstimate: q.route.gasEstimate },
    alternatives: q.alternatives,
    venue: q.venue,
    stockReference: q.stockReference,
    supportedTokens: ['USDC', ...BASE_STOCK_SYMBOLS],
  };
}
