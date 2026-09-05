// Final audit P1-1 (round 1) + BP-01 (2026-09-04 review): the browser must not
// trust that the decimal fields it SHOWS and the raw units it SIGNS describe the
// same trade. This validator rebuilds the economics in integer units from the
// user's own request (pair, amount, slippage, wallet) and the pinned token list,
// and refuses the quote unless every field agrees. Both signing cards run it on
// every response and again immediately before approval and swap, and pass the
// VALIDATED values — not the response's — to the calldata decoder.

import { getAddress, isAddress, parseUnits } from 'viem';
import { BASE_SWAP_LIMITS, BASE_SWAP_ROUTER02, findBaseToken, isStockToken } from './tokens';

const CHAIN_ID = 8453;
const BPS = 10_000n;

/** True when the typed amount is the exact amount the quote's calldata was built for. */
export function quoteMatchesAmount(quoteAmountIn: string | number | null | undefined, typedAmount: string | number | null | undefined): boolean {
  if (quoteAmountIn === null || quoteAmountIn === undefined) return false;
  if (typedAmount === null || typedAmount === undefined) return false;
  const a = Number(String(quoteAmountIn).trim());
  const b = Number(String(typedAmount).trim());
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return false;
  return a === b;
}

export interface QuoteRequest {
  tokenIn: string;
  tokenOut: string;
  amount: string;
  slippagePct: number;
  wallet: string;
}

/** The subset of /api/base-swap's quote this validator reads. Missing fields fail closed. */
export interface QuoteLike {
  chainId?: unknown;
  venue?: { router?: unknown };
  tokenIn?: { symbol?: unknown; address?: unknown; decimals?: unknown };
  tokenOut?: { symbol?: unknown; address?: unknown; decimals?: unknown };
  amountIn?: unknown;
  amountInRaw?: unknown;
  amountOut?: unknown;
  amountOutRaw?: unknown;
  minAmountOut?: unknown;
  minAmountOutRaw?: unknown;
  slippagePct?: unknown;
  deadline?: unknown;
  priceImpactPct?: unknown;
  usdValue?: unknown;
  recipient?: unknown;
  requiresStockEligibility?: unknown;
  stockReference?: { symbol?: unknown; transferPaused?: unknown } | null;
  tx?: null | { deadline?: unknown; approve?: unknown; swap?: unknown };
  txWithheld?: unknown;
}

/** What the signing surfaces are allowed to sign — derived here, not copied from the response. */
export interface ValidatedQuote {
  tokenInSymbol: string;
  tokenOutSymbol: string;
  amountInRaw: string;
  amountOutRaw: string;
  minAmountOutRaw: string;
  slippageBps: number;
  deadline: number | undefined;
  recipient: string;
}

class QuoteRefused extends Error {}
function refuse(reason: string): never {
  throw new QuoteRefused(`Quote refused: ${reason}`);
}

function str(v: unknown, label: string): string {
  if (typeof v !== 'string' || v.length === 0) refuse(`${label} is missing`);
  return v;
}
function canonicalUint(v: unknown, label: string): bigint {
  const s = str(v, label);
  if (!/^(0|[1-9]\d*)$/.test(s)) refuse(`${label} is not a canonical integer`);
  return BigInt(s);
}
function humanToRaw(v: unknown, decimals: number, label: string): bigint {
  const s = str(v, label).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) refuse(`${label} is not a decimal number`);
  try {
    return parseUnits(s, decimals);
  } catch {
    return refuse(`${label} has more precision than the token allows`);
  }
}

/**
 * Validate a quote against the request that produced it. Throws on any
 * disagreement; returns the integer-unit values the caller may sign.
 */
export function assertQuoteConsistent(quote: QuoteLike, req: QuoteRequest, now: number = Math.floor(Date.now() / 1000)): ValidatedQuote {
  // 1. Pair: the request's tokens, resolved through the pinned list, must be EXACTLY the response's.
  const reqIn = findBaseToken(req.tokenIn);
  const reqOut = findBaseToken(req.tokenOut);
  if (!reqIn || !reqOut) refuse('requested pair is not on the pinned token list');
  if (reqIn.symbol === reqOut.symbol) refuse('requested pair has the same token on both sides');
  if (quote.chainId !== CHAIN_ID) refuse('quote is not on Base');
  const router = quote.venue?.router;
  if (typeof router !== 'string' || !isAddress(router) || getAddress(router) !== getAddress(BASE_SWAP_ROUTER02)) refuse('quote names another router');
  const respIn = quote.tokenIn ?? {};
  const respOut = quote.tokenOut ?? {};
  if (respIn.symbol !== reqIn.symbol) refuse(`quote input token is ${String(respIn.symbol)}, you asked for ${reqIn.symbol}`);
  if (respOut.symbol !== reqOut.symbol) refuse(`quote output token is ${String(respOut.symbol)}, you asked for ${reqOut.symbol}`);
  for (const [t, view, label] of [[reqIn, respIn, 'input'], [reqOut, respOut, 'output']] as const) {
    if (typeof view.address !== 'string' || !isAddress(view.address) || getAddress(view.address) !== getAddress(t.address)) refuse(`${label} token address is not the pinned one`);
    if (view.decimals !== t.decimals) refuse(`${label} token decimals differ from the pinned list`);
  }
  const stock = isStockToken(reqIn) ? reqIn : isStockToken(reqOut) ? reqOut : null;
  if (stock) {
    if (!(reqIn.stable || reqOut.stable)) refuse('tokenized stocks trade only against USDC');
    if (quote.requiresStockEligibility !== true) refuse('quote does not identify the stock eligibility gate');
    if (quote.stockReference?.symbol !== stock.symbol) refuse('stock reference is for another token');
    if (quote.stockReference?.transferPaused === true) refuse('issuer has paused transfers');
  }

  // 2. Amounts: the user's amount → raw; every human field → raw; all must agree, outputs non-zero.
  const amountInRaw = humanToRaw(req.amount, reqIn.decimals, 'your amount');
  if (amountInRaw === 0n) refuse('input amount is zero');
  if (canonicalUint(quote.amountInRaw, 'amountInRaw') !== amountInRaw) refuse('quote input amount is not the amount you entered');
  if (humanToRaw(quote.amountIn, reqIn.decimals, 'displayed input') !== amountInRaw) refuse('displayed input differs from raw units');
  const amountOutRaw = canonicalUint(quote.amountOutRaw, 'amountOutRaw');
  const minAmountOutRaw = canonicalUint(quote.minAmountOutRaw, 'minAmountOutRaw');
  if (amountOutRaw === 0n || minAmountOutRaw === 0n) refuse('quote output is zero');
  if (humanToRaw(quote.amountOut, reqOut.decimals, 'displayed output') !== amountOutRaw) refuse('displayed output differs from raw units');
  if (humanToRaw(quote.minAmountOut, reqOut.decimals, 'displayed minimum') !== minAmountOutRaw) refuse('displayed minimum differs from raw units');

  // 3. Slippage: the request's, basis-point precise, inside the local policy; minimum derived locally.
  const reqSlip = req.slippagePct;
  if (!Number.isFinite(reqSlip) || reqSlip < 0.05 || reqSlip > BASE_SWAP_LIMITS.maxSlippagePct) refuse('requested slippage is outside the app limit');
  if (typeof quote.slippagePct !== 'number' || Math.abs(quote.slippagePct - reqSlip) > 1e-9) refuse('quote changed the requested slippage');
  const slippageBps = Math.round(reqSlip * 100);
  if (Math.abs(slippageBps / 100 - reqSlip) > 1e-9) refuse('slippage is not basis-point precise');
  const expectedMin = (amountOutRaw * (BPS - BigInt(slippageBps))) / BPS;
  if (minAmountOutRaw !== expectedMin) refuse('minimum received was not derived from the quoted output and your slippage');
  if (minAmountOutRaw > amountOutRaw) refuse('minimum received exceeds the quoted output');

  // 4. Ticket and impact ceilings: local policy, never the response's word alone.
  const cap = Math.min(BASE_SWAP_LIMITS.maxTicketUsd, reqIn.maxTicketUsd ?? Infinity, reqOut.maxTicketUsd ?? Infinity);
  if (typeof quote.usdValue !== 'number' || !Number.isFinite(quote.usdValue)) refuse('ticket USD value is unavailable');
  if (quote.usdValue < BASE_SWAP_LIMITS.minTicketUsd || quote.usdValue > cap) refuse(`ticket is outside the $${BASE_SWAP_LIMITS.minTicketUsd}–$${cap} limit`);
  if (quote.priceImpactPct !== null && (typeof quote.priceImpactPct !== 'number' || Math.abs(quote.priceImpactPct) > BASE_SWAP_LIMITS.maxPriceImpactPct)) refuse('price impact is over the local limit');

  // 5. Recipient and deadline, when there is anything to sign.
  const wallet = req.wallet.toLowerCase();
  let deadline: number | undefined;
  if (quote.tx) {
    if (typeof quote.recipient !== 'string' || quote.recipient.toLowerCase() !== wallet) refuse('recipient is not the connected wallet');
    if (Array.isArray(quote.txWithheld) && quote.txWithheld.length > 0) refuse('the server withheld this transaction');
    if (typeof quote.deadline !== 'number' || !Number.isSafeInteger(quote.deadline)) refuse('deadline is missing');
    if (quote.tx.deadline !== quote.deadline) refuse('transaction deadline differs from the quote');
    if (quote.deadline <= now + 15) refuse('quote is expired');
    if (quote.deadline > now + BASE_SWAP_LIMITS.deadlineSec + 30) refuse('deadline exceeds the local policy');
    deadline = quote.deadline;
  }

  return {
    tokenInSymbol: reqIn.symbol,
    tokenOutSymbol: reqOut.symbol,
    amountInRaw: amountInRaw.toString(),
    amountOutRaw: amountOutRaw.toString(),
    minAmountOutRaw: minAmountOutRaw.toString(),
    slippageBps,
    deadline,
    recipient: wallet,
  };
}

/** The reduced view /api/base-swap returns next to the full quote (what SwapConfirm renders). */
export interface ExecutionViewLike {
  quote?: { fromToken?: unknown; toToken?: unknown; fromAmount?: unknown; fromAmountRaw?: unknown; toAmount?: unknown; minReceived?: unknown; minReceivedRaw?: unknown };
  disclosure?: { chainId?: unknown; router?: unknown; minReceived?: unknown; deadline?: unknown; tokenContract?: unknown; spender?: unknown } | null;
  approveTx?: { to?: unknown } | null;
  swapTx?: { to?: unknown } | null;
}

/**
 * Third-round BP-01 reopen: SwapConfirm rendered its economic consent fields
 * (MIN RECEIVED, amounts, deadline) from the reduced `execution` view while
 * validating only the full `quote`. A response whose full quote is honest but
 * whose reduced view lies showed one number and signed another. Every field the
 * card can show must equal the validated quote — or the response is refused.
 */
export function assertExecutionViewConsistent(execution: ExecutionViewLike | null | undefined, quote: QuoteLike, v: ValidatedQuote): void {
  const refuse = (what: string) => { throw new Error(`Quote refused: the execution view differs from the validated quote (${what})`); };
  if (!execution || typeof execution !== 'object') refuse('missing execution view');
  const q = execution!.quote;
  if (!q || typeof q !== 'object') refuse('missing execution.quote');
  if (String(q!.fromToken) !== v.tokenInSymbol) refuse('fromToken');
  if (String(q!.toToken) !== v.tokenOutSymbol) refuse('toToken');
  if (String(q!.fromAmountRaw) !== v.amountInRaw) refuse('fromAmountRaw');
  if (String(q!.minReceivedRaw) !== v.minAmountOutRaw) refuse('minReceivedRaw');
  if (String(q!.fromAmount) !== String(quote.amountIn)) refuse('fromAmount');
  if (String(q!.toAmount) !== String(quote.amountOut)) refuse('toAmount');
  if (String(q!.minReceived) !== String(quote.minAmountOut)) refuse('minReceived');
  const d = execution!.disclosure;
  if (!d || typeof d !== 'object') refuse('missing execution.disclosure');
  if (Number(d!.chainId) !== 8453) refuse('disclosure.chainId');
  if (String(d!.minReceived) !== String(quote.minAmountOut)) refuse('disclosure.minReceived');
  if (String(d!.router).toLowerCase() !== String(quote.venue?.router).toLowerCase()) refuse('disclosure.router');
  if (v.deadline !== undefined && Number(d!.deadline) !== v.deadline) refuse('disclosure.deadline');
  if (execution!.approveTx) {
    if (String(d!.tokenContract).toLowerCase() !== String(execution!.approveTx.to).toLowerCase()) refuse('disclosure.tokenContract');
    if (String(d!.spender).toLowerCase() !== String(quote.venue?.router).toLowerCase()) refuse('disclosure.spender');
  }
  if (execution!.swapTx && String(execution!.swapTx.to).toLowerCase() !== String(quote.venue?.router).toLowerCase()) refuse('swapTx.to');
}
