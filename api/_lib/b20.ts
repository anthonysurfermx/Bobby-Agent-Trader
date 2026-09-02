// ============================================================
// b20 — Coinbase tokenized stocks on Base: validation, reference price,
// DEX quote and user-signed calldata. Keyless: everything is a public RPC
// read plus an eth_call against Aerodrome's quoter.
//
// Security model (the part that matters):
//   - Only addresses in the administered allowlist are ever quoted.
//   - Bobby never holds keys and never signs. This module returns calldata;
//     the human reviews it in their wallet and signs, or does not.
//   - Limits, oracle deviation, staleness and pause flags are enforced HERE,
//     not in the UI. The UI only mirrors them.
// ============================================================

import {
  createPublicClient, http, fallback, parseAbi, encodeFunctionData, formatUnits, parseUnits,
  type Address, type Hex,
} from 'viem';
import { base } from 'viem/chains';
import { B20_ALLOWLIST, B20_LIMITS, BASE_USDC, findB20, type B20Listing } from '../../src/lib/b20/allowlist.js';

/** Aerodrome Slipstream, "Gauges V3" deployment — the factory that owns every
 *  B20/USDC pool at launch (verified on-chain: pool.factory() == this). */
export const AERODROME_SLIPSTREAM = {
  factory: '0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef' as Address,
  router: '0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F' as Address,
  quoter: '0x514c8B5f54112481E28028F1166Bd78501089259' as Address,
  /** All launch pools use tick spacing 10 (fee tier 0.05%). */
  tickSpacing: 10,
  feeBps: 5,
} as const;

const ERC20_ABI = parseAbi([
  'function decimals() view returns (uint8)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);

const B20_ABI = parseAbi([
  'function decimals() view returns (uint8)',
  'function multiplier() view returns (uint256)',
  'function pausedFeatures() view returns (uint256)',
  'function isPaused(uint8 feature) view returns (bool)',
]);

const FEED_ABI = parseAbi([
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() view returns (uint8)',
]);

const QUOTER_ABI = parseAbi([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, int24 tickSpacing, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
]);

const ROUTER_ABI = parseAbi([
  'function exactInputSingle((address tokenIn, address tokenOut, int24 tickSpacing, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)',
]);

const RPC_URLS = [process.env.BASE_RPC_URL, 'https://mainnet.base.org', 'https://base-rpc.publicnode.com'].filter(
  (u): u is string => Boolean(u),
);

/** Typed with the Base chain so multicall resolves the Multicall3 address itself. */
const client = createPublicClient({
  chain: base,
  transport: fallback(RPC_URLS.map((u) => http(u, { timeout: 8_000, retryCount: 1 }))),
});

export function baseClient() {
  return client;
}

export interface B20Reference {
  price: number | null;
  updatedAt: number | null;
  ageSec: number | null;
  stale: boolean;
  feed: Address;
}

export interface B20Status {
  address: Address;
  symbol: string;
  underlying: string;
  name: string;
  decimals: number;
  /** Redemption ratio, 1.0 = one token is one share. Changes on dividends/splits. */
  multiplier: number;
  /** Raw pause bitmask from the token; non-zero means some feature is paused. */
  pausedFeatures: string;
  /** Transfer-level pause (feature 0). When true nothing can move. */
  transferPaused: boolean;
  reference: B20Reference;
}

export async function getB20Status(listing: B20Listing): Promise<B20Status> {
  const c = baseClient();
  const token = listing.address as Address;
  const feed = listing.chainlinkFeed as Address;
  const results = await c.multicall({
    allowFailure: true,
    contracts: [
      { address: token, abi: B20_ABI, functionName: 'decimals' },
      { address: token, abi: B20_ABI, functionName: 'multiplier' },
      { address: token, abi: B20_ABI, functionName: 'pausedFeatures' },
      { address: token, abi: B20_ABI, functionName: 'isPaused', args: [0] },
      { address: feed, abi: FEED_ABI, functionName: 'latestRoundData' },
      { address: feed, abi: FEED_ABI, functionName: 'decimals' },
    ] as const,
  });
  const val = <T,>(i: number): T | null => (results[i].status === 'success' ? (results[i].result as T) : null);

  const decimals = val<number>(0) ?? 8;
  const multiplierRaw = val<bigint>(1);
  const pausedFeatures = val<bigint>(2) ?? 0n;
  const transferPaused = val<boolean>(3) ?? false;
  const round = val<readonly [bigint, bigint, bigint, bigint, bigint]>(4);
  const feedDecimals = val<number>(5) ?? 8;

  const now = Math.floor(Date.now() / 1000);
  const updatedAt = round ? Number(round[3]) : null;
  const ageSec = updatedAt ? now - updatedAt : null;
  const price = round && round[1] > 0n ? Number(formatUnits(round[1], feedDecimals)) : null;

  return {
    address: token,
    symbol: listing.symbol,
    underlying: listing.underlying,
    name: listing.name,
    decimals,
    multiplier: multiplierRaw === null ? 1 : Number(formatUnits(multiplierRaw, 18)),
    pausedFeatures: pausedFeatures.toString(),
    transferPaused,
    reference: {
      price,
      updatedAt,
      ageSec,
      stale: price === null || ageSec === null || ageSec > B20_LIMITS.maxFeedAgeSec,
      feed,
    },
  };
}

export type B20Side = 'buy' | 'sell';

export interface B20QuoteInput {
  token: string;
  /** Human amount of tokenIn: USDC for buys, tokens for sells. */
  amount: number;
  side: B20Side;
  slippagePct?: number;
  /** Wallet that receives the output and signs. Required for calldata. */
  recipient?: string;
  /** True once the human attested eligibility in the UI; enforced with geo below. */
  attested?: boolean;
  /** ISO country from the edge (`x-vercel-ip-country`), for the US exclusion. */
  country?: string | null;
}

export interface B20Quote {
  token: B20Status;
  side: B20Side;
  amountIn: string;
  amountInRaw: string;
  amountOut: string;
  amountOutRaw: string;
  minAmountOut: string;
  /** USDC per token at this size. */
  executionPrice: number;
  /** Execution vs Chainlink reference, percent (positive = paying above). */
  deviationPct: number | null;
  ticksCrossed: number;
  feeBps: number;
  slippagePct: number;
  venue: { name: string; router: Address; quoter: Address; tickSpacing: number };
  /** Present only when every guard passed and the human attested eligibility. */
  tx: null | {
    chainId: number;
    approve: { to: Address; data: Hex; value: '0x0' } | null;
    swap: { to: Address; data: Hex; value: '0x0' };
    deadline: number;
  };
  txWithheld: string[];
  warnings: string[];
  limits: typeof B20_LIMITS;
}

function isAddress(v: unknown): v is Address {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}

export async function quoteB20(input: B20QuoteInput): Promise<B20Quote> {
  const listing = findB20(input.token);
  if (!listing) throw new Error('token is not on the allowlist');
  const status = await getB20Status(listing);
  const c = baseClient();

  const slippagePct = Math.min(Math.max(input.slippagePct ?? B20_LIMITS.defaultSlippagePct, 0.05), B20_LIMITS.maxSlippagePct);
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('amount must be positive');

  const warnings: string[] = [];
  const txWithheld: string[] = [];

  const tokenIn = input.side === 'buy' ? (BASE_USDC as Address) : status.address;
  const tokenOut = input.side === 'buy' ? status.address : (BASE_USDC as Address);
  const inDecimals = input.side === 'buy' ? 6 : status.decimals;
  const outDecimals = input.side === 'buy' ? status.decimals : 6;
  const amountInRaw = parseUnits(input.amount.toFixed(inDecimals), inDecimals);

  // Ticket limits in USD terms, both directions.
  const usdValue = input.side === 'buy' ? input.amount : input.amount * (status.reference.price ?? 0);
  if (input.side === 'buy' && input.amount > B20_LIMITS.maxTicketUsdc) txWithheld.push(`ticket above the ${B20_LIMITS.maxTicketUsdc} USDC demo limit`);
  if (input.side === 'buy' && input.amount < B20_LIMITS.minTicketUsdc) txWithheld.push(`ticket below the ${B20_LIMITS.minTicketUsdc} USDC minimum`);
  if (input.side === 'sell' && usdValue > B20_LIMITS.maxTicketUsdc) txWithheld.push(`ticket above the ${B20_LIMITS.maxTicketUsdc} USDC demo limit`);

  const sim = await c.simulateContract({
    address: AERODROME_SLIPSTREAM.quoter,
    abi: QUOTER_ABI,
    functionName: 'quoteExactInputSingle',
    args: [{ tokenIn, tokenOut, amountIn: amountInRaw, tickSpacing: AERODROME_SLIPSTREAM.tickSpacing, sqrtPriceLimitX96: 0n }],
  }).catch(() => null);
  // A revert here means no Slipstream pool at this tick spacing (yet) for the
  // pair — the token stays listable but not tradable through this rail.
  if (!sim) throw new Error(`no Aerodrome liquidity for ${status.symbol}/USDC at tick spacing ${AERODROME_SLIPSTREAM.tickSpacing}`);
  const [amountOutRaw, , ticksCrossed] = sim.result;
  if (amountOutRaw === 0n) throw new Error('no liquidity for this size');

  const amountOut = Number(formatUnits(amountOutRaw, outDecimals));
  const executionPrice = input.side === 'buy' ? input.amount / amountOut : amountOut / input.amount;
  const ref = status.reference.price;
  const deviationPct = ref ? ((executionPrice - ref) / ref) * 100 * (input.side === 'buy' ? 1 : -1) : null;

  if (status.reference.stale) warnings.push('Chainlink reference is stale (market closed or corporate action); DEX price is the only live number');
  if (deviationPct !== null && Math.abs(deviationPct) > B20_LIMITS.maxOracleDeviationPct) {
    txWithheld.push(`DEX price is ${deviationPct.toFixed(2)}% from the Chainlink reference (limit ${B20_LIMITS.maxOracleDeviationPct}%)`);
  }
  if (Number(ticksCrossed) > 3) warnings.push('order walks several ticks; expect impact');
  if (status.transferPaused) txWithheld.push('token transfers are paused by the issuer');
  else if (status.pausedFeatures !== '0') warnings.push('issuer has paused some token features (mint/redeem side); secondary trading still open');
  if (status.multiplier !== 1) warnings.push(`multiplier is ${status.multiplier}: one token is ${status.multiplier} shares`);

  if (input.country && input.country.toUpperCase() === 'US') txWithheld.push('Coinbase tokenized stocks are not available to US persons');
  if (!input.attested) txWithheld.push('eligibility attestation required');
  if (!isAddress(input.recipient)) txWithheld.push('recipient wallet required');

  const minAmountOutRaw = (amountOutRaw * BigInt(Math.round((100 - slippagePct) * 1000))) / 100_000n;
  const deadline = Math.floor(Date.now() / 1000) + 20 * 60;

  let tx: B20Quote['tx'] = null;
  if (txWithheld.length === 0 && isAddress(input.recipient)) {
    const allowance = await c
      .readContract({ address: tokenIn, abi: ERC20_ABI, functionName: 'allowance', args: [input.recipient as Address, AERODROME_SLIPSTREAM.router] })
      .catch(() => 0n);
    tx = {
      chainId: base.id,
      approve:
        allowance >= amountInRaw
          ? null
          : {
              to: tokenIn,
              data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [AERODROME_SLIPSTREAM.router, amountInRaw] }),
              value: '0x0',
            },
      swap: {
        to: AERODROME_SLIPSTREAM.router,
        data: encodeFunctionData({
          abi: ROUTER_ABI,
          functionName: 'exactInputSingle',
          args: [{
            tokenIn, tokenOut,
            tickSpacing: AERODROME_SLIPSTREAM.tickSpacing,
            recipient: input.recipient,
            deadline: BigInt(deadline),
            amountIn: amountInRaw,
            amountOutMinimum: minAmountOutRaw,
            sqrtPriceLimitX96: 0n,
          }],
        }),
        value: '0x0',
      },
      deadline,
    };
  }

  return {
    token: status,
    side: input.side,
    amountIn: input.amount.toString(),
    amountInRaw: amountInRaw.toString(),
    amountOut: amountOut.toString(),
    amountOutRaw: amountOutRaw.toString(),
    minAmountOut: formatUnits(minAmountOutRaw, outDecimals),
    executionPrice,
    deviationPct,
    ticksCrossed: Number(ticksCrossed),
    feeBps: AERODROME_SLIPSTREAM.feeBps,
    slippagePct,
    venue: { name: 'Aerodrome Slipstream', router: AERODROME_SLIPSTREAM.router, quoter: AERODROME_SLIPSTREAM.quoter, tickSpacing: AERODROME_SLIPSTREAM.tickSpacing },
    tx,
    txWithheld,
    warnings,
    limits: B20_LIMITS,
  };
}

/** Featured board: status + a 100 USDC indicative quote per token. */
export async function listB20(sampleUsdc = 100) {
  const featured = B20_ALLOWLIST.filter((t) => t.featured);
  const rows = await Promise.all(
    featured.map(async (listing) => {
      try {
        const q = await quoteB20({ token: listing.symbol, amount: sampleUsdc, side: 'buy', attested: false });
        return {
          ...q.token,
          dexPrice: q.executionPrice,
          deviationPct: q.deviationPct,
          sampleUsdc,
          sampleOut: q.amountOut,
          warnings: q.warnings,
        };
      } catch (error) {
        const status = await getB20Status(listing).catch(() => null);
        return {
          ...(status ?? { address: listing.address, symbol: listing.symbol, underlying: listing.underlying, name: listing.name }),
          dexPrice: null,
          deviationPct: null,
          sampleUsdc,
          sampleOut: null,
          warnings: [error instanceof Error ? error.message : 'quote unavailable'],
        };
      }
    }),
  );
  return rows;
}
