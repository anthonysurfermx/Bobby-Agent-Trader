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
    slippageBps,
    route: { kind: q.route.kind, fees: q.route.fees, description: q.route.description, gasEstimate: q.route.gasEstimate },
    alternatives: q.alternatives,
    venue: q.venue,
    stockReference: q.stockReference,
    supportedTokens: ['USDC', ...BASE_STOCK_SYMBOLS],
  };
}
