// ============================================================
// base-swap — Uniswap V3 on Base (chain 8453): quote, guards, user-signed
// calldata. Keyless: public RPC reads plus eth_calls against the QuoterV2.
// Replaces the OKX DEX aggregator proxies (2026-09-03 decision: Base is
// the only network, Uniswap the only swap engine).
//
// Security model (the part that matters):
//   - Router and quoter are CONSTANTS in this file, verified on-chain and
//     against the official deployment list. There is no upstream that can
//     hand us a `to`, a spender or calldata: the allow-list is the code.
//   - Only tokens in src/lib/base-swap/tokens.ts are ever quoted.
//   - Approvals are exact-amount to SwapRouter02. They can remain if the
//     user abandons or the swap reverts, so clients must disclose that fact.
//   - amountOutMinimum comes from OUR quoter call, never from a client.
//   - Deadline is enforced by the router (multicall(deadline, …)).
//   - Bobby never holds keys and never signs. This module returns calldata;
//     the human reviews it in their wallet and signs, or does not.
//   - Limits, price-impact, balance and simulation are enforced HERE. The
//     UI only mirrors them. Any failed guard means: no calldata.
// ============================================================

import {
  createPublicClient, http, fallback, parseAbi, encodeFunctionData, decodeFunctionData, encodePacked,
  formatUnits, parseUnits, getAddress, keccak256, type Address, type Hex,
} from 'viem';
import { base } from 'viem/chains';
import { BASE, UNISWAP_BASE } from './chains.js';
import { rpcErrorMessage } from './rpc-redact.js';
import {
  BASE_B20_ORACLE_REGISTRY, BASE_SWAP_CHAIN_ID, BASE_SWAP_LIMITS, BASE_SWAP_TOKENS, BASE_USDC, BASE_WETH, STOCK_COUNTRY_ALLOWLIST, findBaseToken, stockCountryAllowed, type BaseSwapToken,
} from '../../src/lib/base-swap/tokens.js';

export const SWAP_ROUTER02: Address = getAddress(UNISWAP_BASE.swapRouter02);
export const QUOTER_V2: Address = getAddress(UNISWAP_BASE.quoterV2);
export const V3_FACTORY: Address = getAddress(UNISWAP_BASE.v3Factory);
export const WETH9: Address = getAddress(BASE_WETH);
/** SwapRouter02 `Constants.ADDRESS_THIS`: "deliver to the router" so unwrapWETH9 can pay out ETH. */
export const ROUTER_ADDRESS_THIS: Address = '0x0000000000000000000000000000000000000002';
export const FEE_TIERS = [100, 500, 3000, 10000] as const;
/** Fee-tier pairs tried for a two-hop route through WETH. */
const MULTI_HOP_FEES: ReadonlyArray<readonly [number, number]> = [[500, 500], [500, 3000], [3000, 500], [3000, 3000]];

export const ERC20_ABI = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);

// Quoter functions mutate-then-revert internally; declaring them `view` is
// ABI-only and lets them ride in one Multicall3 eth_call.
const QUOTER_ABI = parseAbi([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) view returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
  'function quoteExactInput(bytes path, uint256 amountIn) view returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)',
  'function factory() view returns (address)',
  'function WETH9() view returns (address)',
]);

export const ROUTER_ABI = parseAbi([
  'function multicall(uint256 deadline, bytes[] data) payable returns (bytes[] results)',
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)',
  'function exactInput((bytes path, address recipient, uint256 amountIn, uint256 amountOutMinimum) params) payable returns (uint256 amountOut)',
  'function unwrapWETH9(uint256 amountMinimum, address recipient) payable',
  'function factory() view returns (address)',
  'function WETH9() view returns (address)',
]);

// Exactly the chain config's endpoints — no hidden extra fallback. When
// BASE_RPC_URL points at a fork (tests), nothing silently answers from mainnet.
const RPC_URLS = Array.from(new Set([BASE.rpcUrl, BASE.rpcFallbackUrl].filter((u): u is string => Boolean(u))));

function makeClient() {
  return createPublicClient({
    chain: base,
    transport: fallback(RPC_URLS.map((u) => http(u, { timeout: 8_000, retryCount: 1 }))),
  });
}
let _client: ReturnType<typeof makeClient> | null = null;

// viem's multicall parameter types only resolve under `strict: true`; the API
// tsconfig is not strict. Route every multicall through this untyped shim so
// the call sites stay readable and the compiler stays quiet.
type McResult = { status: 'success'; result: unknown } | { status: 'failure'; error: Error };
async function multicallLoose(contracts: unknown[], allowFailure: true): Promise<McResult[]>;
async function multicallLoose(contracts: unknown[], allowFailure: false): Promise<unknown[]>;
async function multicallLoose(contracts: unknown[], allowFailure: boolean): Promise<unknown[]> {
  const client = baseClient() as unknown as { multicall: (args: { allowFailure: boolean; contracts: unknown[] }) => Promise<unknown[]> };
  return client.multicall({ allowFailure, contracts });
}
/** Typed with the Base chain so multicall resolves Multicall3 itself. */
export function baseClient() {
  if (!_client) _client = makeClient();
  return _client;
}

export class BaseSwapError extends Error {
  constructor(message: string, public readonly code: 'token_not_allowed' | 'same_token' | 'stock_pair_not_supported' | 'bad_amount' | 'no_route' | 'rpc_failed') {
    super(message);
    this.name = 'BaseSwapError';
  }
}

// ---------- pure helpers (unit-tested offline) ----------

export type RouteCandidate =
  | { kind: 'single'; fee: number }
  | { kind: 'multi'; fees: [number, number] };

export interface QuotedRoute {
  route: RouteCandidate;
  amountOut: bigint;
  gasEstimate: bigint;
  /** Packed V3 path for multi-hop routes (tokenIn, fee, WETH, fee, tokenOut); null for single. */
  path: Hex | null;
  description: string;
}

export function encodePath(tokens: Address[], fees: number[]): Hex {
  if (tokens.length !== fees.length + 1) throw new Error('path: tokens must be fees + 1');
  const types: ('address' | 'uint24')[] = [];
  const values: (Address | number)[] = [];
  tokens.forEach((t, i) => {
    types.push('address');
    values.push(t);
    if (i < fees.length) { types.push('uint24'); values.push(fees[i]); }
  });
  return encodePacked(types, values);
}

export function candidateRoutes(tokenIn: Address, tokenOut: Address, directOnly = false): RouteCandidate[] {
  const routes: RouteCandidate[] = FEE_TIERS.map((fee) => ({ kind: 'single', fee }));
  const viaWeth = !directOnly && tokenIn.toLowerCase() !== WETH9.toLowerCase() && tokenOut.toLowerCase() !== WETH9.toLowerCase();
  if (viaWeth) for (const fees of MULTI_HOP_FEES) routes.push({ kind: 'multi', fees: [fees[0], fees[1]] });
  return routes;
}

export function describeRoute(tokenIn: BaseSwapToken, tokenOut: BaseSwapToken, route: RouteCandidate): string {
  const pct = (fee: number) => `${fee / 10_000}%`;
  return route.kind === 'single'
    ? `${tokenIn.symbol} → ${tokenOut.symbol} (${pct(route.fee)})`
    : `${tokenIn.symbol} → WETH (${pct(route.fees[0])}) → ${tokenOut.symbol} (${pct(route.fees[1])})`;
}

/** Slippage in percent (0.5 = 0.5%). Basis-point integer math, floors. */
export function computeMinOut(amountOut: bigint, slippagePct: number): bigint {
  const bps = BigInt(Math.round(Math.min(Math.max(slippagePct, 0), 100) * 100));
  return (amountOut * (10_000n - bps)) / 10_000n;
}

export function clampSlippage(pct: number | undefined): number {
  const v = Number.isFinite(pct as number) ? (pct as number) : BASE_SWAP_LIMITS.defaultSlippagePct;
  return Math.min(Math.max(v, 0.05), BASE_SWAP_LIMITS.maxSlippagePct);
}

/** Human amount → base units. Numbers are fixed to the token's decimals first (no exponent notation). */
export function toRawAmount(amount: number | string, decimals: number): bigint {
  const text = typeof amount === 'number' ? amount.toFixed(decimals) : String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) throw new BaseSwapError(`amount "${amount}" is not a positive decimal`, 'bad_amount');
  const raw = parseUnits(text, decimals);
  if (raw <= 0n) throw new BaseSwapError('amount must be positive', 'bad_amount');
  return raw;
}

export function resolvePair(tokenInRef: string, tokenOutRef: string): { tokenIn: BaseSwapToken; tokenOut: BaseSwapToken } {
  const tokenIn = findBaseToken(tokenInRef);
  const tokenOut = findBaseToken(tokenOutRef);
  if (!tokenIn) throw new BaseSwapError(`tokenIn "${tokenInRef}" is not on the Base allow-list`, 'token_not_allowed');
  if (!tokenOut) throw new BaseSwapError(`tokenOut "${tokenOutRef}" is not on the Base allow-list`, 'token_not_allowed');
  if (tokenIn.address.toLowerCase() === tokenOut.address.toLowerCase()) throw new BaseSwapError('tokenIn and tokenOut are the same asset', 'same_token');
  const hasStock = tokenIn.assetClass === 'tokenized-stock' || tokenOut.assetClass === 'tokenized-stock';
  const hasUsdc = tokenIn.address.toLowerCase() === BASE_USDC.toLowerCase() || tokenOut.address.toLowerCase() === BASE_USDC.toLowerCase();
  if (hasStock && !hasUsdc) {
    throw new BaseSwapError('tokenized stocks are available only in direct USDC pairs', 'stock_pair_not_supported');
  }
  return { tokenIn, tokenOut };
}

export interface BuiltTx { to: Address; data: Hex; value: Hex }

export function buildApproveTx(token: Address, amount: bigint): BuiltTx & { spender: Address; amount: string } {
  return {
    to: getAddress(token),
    data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [SWAP_ROUTER02, amount] }),
    value: '0x0',
    spender: SWAP_ROUTER02,
    amount: amount.toString(),
  };
}

/** approve(router, 0): clears an allowance left behind by an abandoned or reverted swap. */
export function buildRevokeTx(token: Address): BuiltTx & { spender: Address } {
  return {
    to: getAddress(token),
    data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [SWAP_ROUTER02, 0n] }),
    value: '0x0',
    spender: SWAP_ROUTER02,
  };
}

export function buildSwapTx(opts: {
  tokenIn: BaseSwapToken;
  tokenOut: BaseSwapToken;
  route: QuotedRoute;
  amountIn: bigint;
  minOut: bigint;
  recipient: Address;
  deadline: number;
}): BuiltTx {
  const { tokenIn, tokenOut, route, amountIn, minOut, deadline } = opts;
  const recipient = getAddress(opts.recipient);
  const nativeOut = Boolean(tokenOut.native);
  // ETH out: the swap pays WETH to the router, then unwrapWETH9 pays ETH to the human.
  const swapRecipient = nativeOut ? ROUTER_ADDRESS_THIS : recipient;
  const inner: Hex[] = [];
  if (route.route.kind === 'single') {
    inner.push(encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: 'exactInputSingle',
      args: [{
        tokenIn: getAddress(tokenIn.address),
        tokenOut: getAddress(tokenOut.address),
        fee: route.route.fee,
        recipient: swapRecipient,
        amountIn,
        amountOutMinimum: minOut,
        sqrtPriceLimitX96: 0n,
      }],
    }));
  } else {
    if (!route.path) throw new Error('multi-hop route without a path');
    inner.push(encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: 'exactInput',
      args: [{ path: route.path, recipient: swapRecipient, amountIn, amountOutMinimum: minOut }],
    }));
  }
  if (nativeOut) {
    inner.push(encodeFunctionData({ abi: ROUTER_ABI, functionName: 'unwrapWETH9', args: [minOut, recipient] }));
  }
  return {
    to: SWAP_ROUTER02,
    data: encodeFunctionData({ abi: ROUTER_ABI, functionName: 'multicall', args: [BigInt(deadline), inner] }),
    // ETH in: msg.value carries the amount; the router wraps it (tokenIn is WETH9 in the path).
    value: tokenIn.native ? (`0x${amountIn.toString(16)}` as Hex) : '0x0',
  };
}

/** Decode router calldata back into its parts (tests, disclosure, audits). */
export function decodeSwapTx(data: Hex): { deadline: bigint; calls: Array<{ functionName: string; args: readonly unknown[] }> } {
  const outer = decodeFunctionData({ abi: ROUTER_ABI, data });
  if (outer.functionName !== 'multicall') throw new Error(`expected multicall, got ${outer.functionName}`);
  const [deadline, inner] = outer.args as readonly [bigint, readonly Hex[]];
  return {
    deadline,
    calls: inner.map((d) => {
      const c = decodeFunctionData({ abi: ROUTER_ABI, data: d });
      return { functionName: c.functionName, args: (c.args ?? []) as readonly unknown[] };
    }),
  };
}

// ---------- network ----------

async function quoteRoutes(tokenIn: BaseSwapToken, tokenOut: BaseSwapToken, amountIn: bigint): Promise<QuotedRoute[]> {
  const tIn = getAddress(tokenIn.address);
  const tOut = getAddress(tokenOut.address);
  const directOnly = tokenIn.assetClass === 'tokenized-stock' || tokenOut.assetClass === 'tokenized-stock';
  const routes = candidateRoutes(tIn, tOut, directOnly);
  const contracts = routes.map((r) =>
    r.kind === 'single'
      ? { address: QUOTER_V2, abi: QUOTER_ABI, functionName: 'quoteExactInputSingle' as const, args: [{ tokenIn: tIn, tokenOut: tOut, amountIn, fee: r.fee, sqrtPriceLimitX96: 0n }] as const }
      : { address: QUOTER_V2, abi: QUOTER_ABI, functionName: 'quoteExactInput' as const, args: [encodePath([tIn, WETH9, tOut], [r.fees[0], r.fees[1]]), amountIn] as const },
  );
  let results: McResult[];
  try {
    results = await multicallLoose(contracts, true);
  } catch (error) {
    throw new BaseSwapError(`Base RPC quote failed: ${error instanceof Error ? error.message : String(error)}`, 'rpc_failed');
  }
  // viem retries a failed aggregate3 call one contract at a time and reports
  // transport errors as per-item failures. A pool that does not exist reverts
  // (a contract error); an RPC that is down or rate-limited is not "no route".
  const failures = results.filter((r): r is Extract<McResult, { status: 'failure' }> => r.status === 'failure');
  if (failures.length === results.length && failures.length > 0) {
    const transport = failures.every((r) => /HttpRequestError|TimeoutError|RpcRequestError|InternalRpcError|LimitExceeded/i.test(`${r.error?.name} ${r.error?.message}`) && !/revert/i.test(`${r.error?.message}`));
    if (transport) throw new BaseSwapError(`Base RPC quote failed: ${failures[0].error?.message?.split('\n')[0] ?? 'unknown'}`, 'rpc_failed');
  }
  const quoted: QuotedRoute[] = [];
  results.forEach((res, i) => {
    if (res.status !== 'success') return;
    const r = routes[i];
    const out = res.result as readonly [bigint, unknown, unknown, bigint];
    const amountOut = out[0];
    if (amountOut <= 0n) return;
    quoted.push({
      route: r,
      amountOut,
      gasEstimate: out[3],
      path: r.kind === 'multi' ? encodePath([tIn, WETH9, tOut], [r.fees[0], r.fees[1]]) : null,
      description: describeRoute(tokenIn, tokenOut, r),
    });
  });
  quoted.sort((a, b) => (a.amountOut > b.amountOut ? -1 : a.amountOut < b.amountOut ? 1 : 0));
  return quoted;
}

const FACTORY_ABI = parseAbi(['function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)']);
const POOL_ABI = parseAbi(['function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)']);
const B20_ABI = parseAbi([
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function multiplier() view returns (uint256)',
  'function pausedFeatures() view returns (uint256)',
  'function isPaused(uint8 feature) view returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
]);
const CHAINLINK_ABI = parseAbi([
  'function decimals() view returns (uint8)',
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
]);
// BP-14: the issuer registry is the source of truth for a feed freeze (corporate
// actions). Selector 0xd4197e82 — resolved from the deployed bytecode and probed on
// all four tokens: (multiplier 1e18, paused). Token transfer pauses are a different signal.
const B20_ORACLE_REGISTRY_ABI = parseAbi(['function getOracleParams(address token) view returns (uint256 multiplier, bool paused)']);
const ORACLE_REGISTRY = getAddress(BASE_B20_ORACLE_REGISTRY);

export type StockReferenceStatus = 'fresh' | 'market-closed' | 'stale' | 'issuer-paused' | 'unusable';

/**
 * BP-14: ONE rule for "may this reference drive a risk decision", shared by the
 * quote guard and the held-exposure calculation. Market closure, missing data and
 * an issuer pause are distinguished; a recent timestamp never overrides a known
 * pause, and an unknown pause state is not usable.
 */
export function evaluateStockReference(ref: {
  ageSec: number; issuerPaused: boolean | null; registryMultiplier: string | null; multiplier: string; roundComplete: boolean; answerPositive: boolean;
}, now: number = Math.floor(Date.now() / 1000)): { status: StockReferenceStatus; usable: boolean; reason: string | null } {
  void now;
  if (!ref.answerPositive || !ref.roundComplete) return { status: 'unusable', usable: false, reason: 'stock reference feed returned no usable price' };
  if (ref.issuerPaused === null) return { status: 'unusable', usable: false, reason: 'issuer registry pause state could not be read' };
  if (ref.issuerPaused) return { status: 'issuer-paused', usable: false, reason: 'issuer feed is frozen (corporate action); the last price is held, not current' };
  if (ref.registryMultiplier !== null && ref.registryMultiplier !== ref.multiplier) return { status: 'unusable', usable: false, reason: 'registry multiplier differs from the token multiplier' };
  if (ref.ageSec > STOCK_REFERENCE_MAX_AGE_SEC) return { status: 'stale', usable: false, reason: `stock reference is ${Math.floor(ref.ageSec / 3600)}h old; wait for a fresh market reference` };
  if (ref.ageSec > STOCK_REFERENCE_WARN_AGE_SEC) return { status: 'market-closed', usable: true, reason: `stock reference is ${Math.floor(ref.ageSec / 3600)}h old (market may be closed)` };
  return { status: 'fresh', usable: true, reason: null };
}
const ZERO = '0x0000000000000000000000000000000000000000';
const STOCK_REFERENCE_WARN_AGE_SEC = 26 * 60 * 60;
const STOCK_REFERENCE_MAX_AGE_SEC = 96 * 60 * 60;
const STOCK_REFERENCE_WARN_DEVIATION_PCT = 2;
const STOCK_REFERENCE_MAX_DEVIATION_PCT = 5;

/** Spot price (tokenOut per tokenIn, human units) of one V3 pool from slot0. */
function spotFromSqrt(sqrtPriceX96: bigint, tokenIn: Address, tokenOut: Address, decIn: number, decOut: number): number {
  const sqrt = Number(sqrtPriceX96) / 2 ** 96;
  const p = sqrt * sqrt; // token1 per token0, raw units
  const inIsToken0 = tokenIn.toLowerCase() < tokenOut.toLowerCase();
  const raw = inIsToken0 ? p : 1 / p;
  return raw * 10 ** (decIn - decOut);
}

/**
 * Mid price along the chosen route from pool spot prices (no size). The
 * execution price includes the fee, so impact = fee + real slippage. A
 * tiny probe quote was tried first and rejected: integer rounding on
 * low-decimal outputs (cbBTC) made it noisier than the number it measured.
 */
function routeHops(tokenIn: BaseSwapToken, tokenOut: BaseSwapToken, route: QuotedRoute): Array<{ a: BaseSwapToken; b: BaseSwapToken; fee: number }> {
  const weth = findBaseToken(WETH9)!;
  return route.route.kind === 'single'
    ? [{ a: tokenIn, b: tokenOut, fee: route.route.fee }]
    : [{ a: tokenIn, b: weth, fee: route.route.fees[0] }, { a: weth, b: tokenOut, fee: route.route.fees[1] }];
}

/** Pool address per hop of the route (null when any hop has no pool). */
async function routePools(hops: ReturnType<typeof routeHops>): Promise<Address[] | null> {
  const pools = (await multicallLoose(
    hops.map((h) => ({ address: V3_FACTORY, abi: FACTORY_ABI, functionName: 'getPool', args: [getAddress(h.a.address), getAddress(h.b.address), h.fee] })),
    false,
  )) as Address[];
  if (pools.some((p) => !p || p.toLowerCase() === ZERO)) return null;
  return pools;
}

/**
 * B20 policies gate transfers, not approve(): a blocked wallet could pay for
 * an approval it can never use. Prove the transfer leg with an eth_call
 * before returning anything — from the pool for buys (can the wallet
 * receive?), from the wallet for sells (can it send?). One base unit is
 * enough for the policy check; balance is verified separately.
 */
async function stockTransferPolicyReason(token: BaseSwapToken, wallet: Address, side: 'buy' | 'sell', pool: Address): Promise<string | null> {
  const c = baseClient();
  const address = getAddress(token.address);
  try {
    if (side === 'buy') await c.simulateContract({ address, abi: B20_ABI, functionName: 'transfer', args: [wallet, 1n], account: pool });
    else await c.simulateContract({ address, abi: B20_ABI, functionName: 'transfer', args: [pool, 1n], account: wallet });
    return null;
  } catch {
    return `${token.symbol}: issuer policy blocks this wallet for this token (transfer simulation reverted)`;
  }
}

const ALLOWANCE_SLOT_CANDIDATES = 64;
const allowanceSlotCache = new Map<string, number>();

/**
 * Finds the storage base slot of `allowance` for an ERC-20 with ONE eth_call:
 * every candidate slot is overridden with a distinct value and allowance()
 * reports which one it read. Cached per token (proxies included: storage
 * lives on the address we call). null when the token is not a plain mapping.
 */
async function findAllowanceSlot(token: Address, owner: Address, spender: Address): Promise<number | null> {
  const key = token.toLowerCase();
  const cached = allowanceSlotCache.get(key);
  if (cached !== undefined) return cached;
  const c = baseClient();
  const stateDiff = Array.from({ length: ALLOWANCE_SLOT_CANDIDATES }, (_, i) => ({
    slot: keccak256(encodePacked(['bytes32', 'bytes32'], [
      `0x${spender.slice(2).toLowerCase().padStart(64, '0')}` as Hex,
      keccak256(encodePacked(['bytes32', 'uint256'], [`0x${owner.slice(2).toLowerCase().padStart(64, '0')}` as Hex, BigInt(i)])),
    ])),
    value: `0x${(i + 1).toString(16).padStart(64, '0')}` as Hex,
  }));
  try {
    const raw = await c.call({
      to: token,
      data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'allowance', args: [owner, spender] }),
      stateOverride: [{ address: token, stateDiff }],
    });
    const read = raw.data ? Number(BigInt(raw.data)) : 0;
    if (read >= 1 && read <= ALLOWANCE_SLOT_CANDIDATES) {
      allowanceSlotCache.set(key, read - 1);
      return read - 1;
    }
  } catch { /* fall through */ }
  return null;
}

/**
 * Simulates the exact swap as if the router already held the allowance:
 * transferFrom, the B20 executor/sender/receiver policies and the pool all
 * run. Lets a human learn BEFORE paying an approval that the swap would
 * revert. null = could not be simulated (unknown storage layout).
 */
async function simulateWithAllowanceOverride(token: Address, owner: Address, amount: bigint, swap: BuiltTx): Promise<{ ok: boolean; reason: string | null } | null> {
  const slot = await findAllowanceSlot(token, owner, SWAP_ROUTER02);
  if (slot === null) return null;
  const c = baseClient();
  const allowanceSlot = keccak256(encodePacked(['bytes32', 'bytes32'], [
    `0x${SWAP_ROUTER02.slice(2).toLowerCase().padStart(64, '0')}` as Hex,
    keccak256(encodePacked(['bytes32', 'uint256'], [`0x${owner.slice(2).toLowerCase().padStart(64, '0')}` as Hex, BigInt(slot)])),
  ]));
  try {
    await c.call({
      account: owner,
      to: swap.to,
      data: swap.data,
      value: BigInt(swap.value),
      stateOverride: [{ address: token, stateDiff: [{ slot: allowanceSlot, value: `0x${amount.toString(16).padStart(64, '0')}` as Hex }] }],
    });
    return { ok: true, reason: null };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message.split('\n')[0].slice(0, 160) : String(error) };
  }
}

async function routeMidPrice(tokenIn: BaseSwapToken, tokenOut: BaseSwapToken, route: QuotedRoute): Promise<number | null> {
  const hops = routeHops(tokenIn, tokenOut, route);
  try {
    const pools = await routePools(hops);
    if (!pools) return null;
    const slots = (await multicallLoose(
      pools.map((p) => ({ address: p, abi: POOL_ABI, functionName: 'slot0' })),
      false,
    )) as Array<readonly [bigint, number, number, number, number, number, boolean]>;
    let mid = 1;
    hops.forEach((h, i) => {
      mid *= spotFromSqrt(slots[i][0], getAddress(h.a.address), getAddress(h.b.address), h.a.decimals, h.b.decimals);
    });
    return Number.isFinite(mid) && mid > 0 ? mid : null;
  } catch {
    return null;
  }
}

export interface BaseSwapInput {
  tokenIn: string;
  tokenOut: string;
  /** Human amount of tokenIn (e.g. 25 USDC, 0.01 ETH). */
  amount: number | string;
  slippagePct?: number;
  /** Wallet that pays, receives and signs. Required for calldata. */
  recipient?: string | null;
  /** Required before calldata for Coinbase B20 tokenized equities: the human's own attestation. */
  stockEligibilityConfirmed?: boolean;
  /** ISO country stamped by the edge (`x-vercel-ip-country`). Required for stock calldata; US or missing = none. */
  country?: string | null;
}

export interface BaseSwapLimits { maxTicketUsd: number; minTicketUsd: number; defaultSlippagePct: number; maxSlippagePct: number; maxPriceImpactPct: number; deadlineSec: number }

export interface BaseSwapTokenView {
  symbol: string;
  name: string;
  address: Address;
  decimals: number;
  native: boolean;
  assetClass: BaseSwapToken['assetClass'] | null;
  underlyingSymbol: string | null;
  issuer: BaseSwapToken['issuer'] | null;
}

export interface StockReferenceView {
  symbol: string;
  tokenAddress: Address;
  feedAddress: Address;
  usdPrice: number;
  updatedAt: number;
  ageSec: number;
  multiplier: string;
  multiplierHuman: number;
  marketDeviationPct: number;
  /** Raw B20 pause bitmask; non-zero = some issuer feature paused (mint/redeem side). */
  pausedFeatures: string;
  /** Transfer-level pause (feature 0). When true nothing can move. */
  transferPaused: boolean;
  /** BP-14: issuer registry pause flag (feed frozen for a corporate action). null = could not be read. */
  issuerPaused: boolean | null;
  /** BP-14: multiplier the registry reports, to cross-check the token's. */
  registryMultiplier: string | null;
  /** BP-14: the shared validator's verdict, shown to the user next to updatedAt. */
  status: StockReferenceStatus;
  usable: boolean;
}

export interface BaseSwapQuote {
  chainId: typeof BASE_SWAP_CHAIN_ID;
  venue: { name: string; router: Address; quoter: Address };
  tokenIn: BaseSwapTokenView;
  tokenOut: BaseSwapTokenView;
  amountIn: string;
  amountInRaw: string;
  amountOut: string;
  amountOutRaw: string;
  minAmountOut: string;
  minAmountOutRaw: string;
  /** tokenOut per 1 tokenIn at this size. */
  executionPrice: number;
  /** Execution vs the pools' spot price along the route, percent (includes the fee). null when unreadable. */
  priceImpactPct: number | null;
  /** Ticket value in USD (stable leg, else a USDC quote of the input). null when unknown. */
  usdValue: number | null;
  slippagePct: number;
  deadline: number;
  route: { kind: RouteCandidate['kind']; fees: number[]; path: Hex | null; description: string; gasEstimate: string };
  alternatives: Array<{ description: string; amountOut: string }>;
  recipient: Address | null;
  /**
   * Present only when every guard passed and a recipient was given.
   * `approve` set ⇒ `swap` is null: sign the approval, wait for its receipt,
   * then re-quote — the swap is only handed out once it simulated with the
   * allowance in place. `revoke` is offered whenever an allowance exists.
   */
  tx: null | {
    chainId: typeof BASE_SWAP_CHAIN_ID;
    approve: (BuiltTx & { spender: Address; amount: string }) | null;
    swap: BuiltTx | null;
    /** keccak256 of the swap calldata — the key /api/swap-receipt matches on. */
    calldataHash: Hex | null;
    revoke: (BuiltTx & { spender: Address }) | null;
    deadline: number;
  };
  /** Current router allowance of tokenIn for the recipient (raw units); null for ETH or no recipient. */
  allowanceRaw: string | null;
  simulation: { ran: boolean; ok: boolean | null; reason: string | null };
  txWithheld: string[];
  warnings: string[];
  limits: BaseSwapLimits;
  requiresStockEligibility: boolean;
  stockReference: StockReferenceView | null;
}

function view(t: BaseSwapToken): BaseSwapTokenView {
  return {
    symbol: t.symbol,
    name: t.name,
    address: getAddress(t.address),
    decimals: t.decimals,
    native: Boolean(t.native),
    assetClass: t.assetClass ?? null,
    underlyingSymbol: t.underlyingSymbol ?? null,
    issuer: t.issuer ?? null,
  };
}

function isAddress(v: unknown): v is Address {
  return typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v);
}

/** Env may LOWER the ticket cap (ops brake); it can never raise it above the code constant. */
export function effectiveMaxTicketUsd(...tokens: BaseSwapToken[]): number {
  const env = Number(process.env.BASE_SWAP_MAX_TICKET_USD);
  const codeCap = Math.min(BASE_SWAP_LIMITS.maxTicketUsd, ...tokens.map((t) => t.maxTicketUsd ?? BASE_SWAP_LIMITS.maxTicketUsd));
  return Number.isFinite(env) && env > 0 ? Math.min(env, codeCap) : codeCap;
}

async function readStockReference(stock: BaseSwapToken, executionUsdPerToken: number): Promise<StockReferenceView> {
  if (stock.assetClass !== 'tokenized-stock' || !stock.referenceFeed) throw new Error('stock reference metadata missing');
  const tokenAddress = getAddress(stock.address);
  const feedAddress = getAddress(stock.referenceFeed);
  const [symbol, decimals, totalSupply, multiplier, feedDecimals, round, pausedFeatures, transferPaused, oracleParams] = await multicallLoose([
    { address: tokenAddress, abi: B20_ABI, functionName: 'symbol' },
    { address: tokenAddress, abi: B20_ABI, functionName: 'decimals' },
    { address: tokenAddress, abi: B20_ABI, functionName: 'totalSupply' },
    { address: tokenAddress, abi: B20_ABI, functionName: 'multiplier' },
    { address: feedAddress, abi: CHAINLINK_ABI, functionName: 'decimals' },
    { address: feedAddress, abi: CHAINLINK_ABI, functionName: 'latestRoundData' },
    { address: tokenAddress, abi: B20_ABI, functionName: 'pausedFeatures' },
    { address: tokenAddress, abi: B20_ABI, functionName: 'isPaused', args: [0] },
    { address: ORACLE_REGISTRY, abi: B20_ORACLE_REGISTRY_ABI, functionName: 'getOracleParams', args: [tokenAddress] },
  ], false);
  if (String(symbol) !== stock.symbol || Number(decimals) !== stock.decimals) throw new Error('pinned B20 metadata no longer matches onchain metadata');
  if ((totalSupply as bigint) <= 0n) throw new Error('B20 token has no circulating supply');
  const rd = round as readonly [bigint, bigint, bigint, bigint, bigint];
  const answer = rd[1];
  const updatedAt = Number(rd[3]);
  if (answer <= 0n || !updatedAt) throw new Error('stock reference feed returned no usable price');
  if (rd[4] < rd[0]) throw new Error('stock reference round is incomplete (answeredInRound < roundId)');
  const usdPrice = Number(formatUnits(answer, Number(feedDecimals)));
  const marketDeviationPct = Math.abs(executionUsdPerToken / usdPrice - 1) * 100;
  // BP-14: an unreadable registry is an UNKNOWN pause state — not "not paused".
  const params = Array.isArray(oracleParams) && oracleParams.length === 2 ? (oracleParams as unknown as readonly [bigint, boolean]) : null;
  const issuerPaused = params ? Boolean(params[1]) : null;
  const registryMultiplier = params ? params[0].toString() : null;
  const ageSec = Math.max(0, Math.floor(Date.now() / 1000) - updatedAt);
  const verdict = evaluateStockReference({ ageSec, issuerPaused, registryMultiplier, multiplier: (multiplier as bigint).toString(), roundComplete: true, answerPositive: true });
  return {
    symbol: stock.symbol,
    tokenAddress,
    feedAddress,
    usdPrice,
    updatedAt,
    ageSec,
    multiplier: (multiplier as bigint).toString(),
    multiplierHuman: Number(formatUnits(multiplier as bigint, 18)),
    marketDeviationPct,
    pausedFeatures: (pausedFeatures as bigint).toString(),
    transferPaused: Boolean(transferPaused),
    issuerPaused,
    registryMultiplier,
    status: verdict.status,
    usable: verdict.usable,
  };
}

export async function quoteBaseSwap(input: BaseSwapInput): Promise<BaseSwapQuote> {
  const { tokenIn, tokenOut } = resolvePair(input.tokenIn, input.tokenOut);
  const stock = tokenIn.assetClass === 'tokenized-stock' ? tokenIn : tokenOut.assetClass === 'tokenized-stock' ? tokenOut : null;
  const amountInRaw = toRawAmount(input.amount, tokenIn.decimals);
  const slippagePct = clampSlippage(input.slippagePct);
  const c = baseClient();
  const warnings: string[] = [];
  const txWithheld: string[] = [];
  const limits: BaseSwapLimits = { ...BASE_SWAP_LIMITS, maxTicketUsd: effectiveMaxTicketUsd(tokenIn, tokenOut) };

  const routes = await quoteRoutes(tokenIn, tokenOut, amountInRaw);
  if (!routes.length) throw new BaseSwapError(`no Uniswap V3 liquidity on Base for ${tokenIn.symbol} → ${tokenOut.symbol}`, 'no_route');
  const best = routes[0];
  const amountOutRaw = best.amountOut;
  const amountIn = Number(formatUnits(amountInRaw, tokenIn.decimals));
  const amountOut = Number(formatUnits(amountOutRaw, tokenOut.decimals));
  const executionPrice = amountOut / amountIn;

  // Price impact vs the pools' spot price (fee included). Large = thin pool or fat finger.
  const mid = await routeMidPrice(tokenIn, tokenOut, best);
  const priceImpactPct: number | null = mid === null ? null : (1 - executionPrice / mid) * 100;
  if (priceImpactPct === null) txWithheld.push('price impact could not be measured (pool spot read failed)');
  else if (priceImpactPct > limits.maxPriceImpactPct) txWithheld.push(`price impact ${priceImpactPct.toFixed(2)}% exceeds the ${limits.maxPriceImpactPct}% limit`);
  else if (priceImpactPct > 1) warnings.push(`price impact ${priceImpactPct.toFixed(2)}%`);

  // USD value of the ticket, for the per-trade cap. Fail closed when unknown.
  let usdValue: number | null = null;
  if (tokenIn.stable) usdValue = amountIn;
  else if (tokenOut.stable) usdValue = amountOut;
  else {
    const usdc = findBaseToken(BASE_USDC)!;
    const usdRoutes = await quoteRoutes(tokenIn, usdc, amountInRaw).catch(() => []);
    usdValue = usdRoutes.length ? Number(formatUnits(usdRoutes[0].amountOut, usdc.decimals)) : null;
  }
  if (usdValue === null) txWithheld.push('ticket could not be valued in USD');
  else {
    if (usdValue > limits.maxTicketUsd) txWithheld.push(`ticket $${usdValue.toFixed(2)} is above the $${limits.maxTicketUsd} per-trade limit`);
    if (usdValue < limits.minTicketUsd) txWithheld.push(`ticket $${usdValue.toFixed(2)} is below the $${limits.minTicketUsd} minimum`);
  }

  let stockReference: StockReferenceView | null = null;
  if (stock) {
    const executionUsdPerToken = tokenIn.assetClass === 'tokenized-stock' ? executionPrice : 1 / executionPrice;
    try {
      stockReference = await readStockReference(stock, executionUsdPerToken);
      // BP-14: one shared verdict — issuer pause and unknown state withhold, market closure only warns.
      const verdict = evaluateStockReference({ ageSec: stockReference.ageSec, issuerPaused: stockReference.issuerPaused, registryMultiplier: stockReference.registryMultiplier, multiplier: stockReference.multiplier, roundComplete: true, answerPositive: true });
      if (!verdict.usable) txWithheld.push(`${stock.symbol}: ${verdict.reason}`);
      else if (verdict.reason) warnings.push(verdict.reason);
      if (stockReference.marketDeviationPct > STOCK_REFERENCE_MAX_DEVIATION_PCT) {
        txWithheld.push(`Uniswap price differs ${stockReference.marketDeviationPct.toFixed(2)}% from the official reference`);
      } else if (stockReference.marketDeviationPct > STOCK_REFERENCE_WARN_DEVIATION_PCT) {
        warnings.push(`Uniswap price differs ${stockReference.marketDeviationPct.toFixed(2)}% from the official reference`);
      }
      if (stockReference.transferPaused) txWithheld.push(`${stock.symbol}: transfers are paused by the issuer`);
      else if (stockReference.pausedFeatures !== '0') warnings.push(`${stock.symbol}: issuer has paused some features (mint/redeem side); secondary trading still open`);
      if (stockReference.multiplierHuman !== 1) warnings.push(`${stock.symbol}: multiplier is ${stockReference.multiplierHuman}: one token is ${stockReference.multiplierHuman} shares`);
    } catch (error) {
      // Third round (BP-12): viem embeds `URL: <endpoint>` in transport errors and this string is PUBLIC (quote.txWithheld).
      txWithheld.push(`stock metadata/reference could not be verified: ${rpcErrorMessage(error)}`);
    }
  }

  const minOutRaw = computeMinOut(amountOutRaw, slippagePct);
  const deadline = Math.floor(Date.now() / 1000) + limits.deadlineSec;

  let recipient: Address | null = null;
  let tx: BaseSwapQuote['tx'] = null;
  let allowanceRaw: string | null = null;
  const simulation: BaseSwapQuote['simulation'] = { ran: false, ok: null, reason: 'no recipient: quote only' };

  if (input.recipient !== undefined && input.recipient !== null && input.recipient !== '') {
    if (!isAddress(input.recipient)) txWithheld.push('recipient wallet is malformed');
    else recipient = getAddress(input.recipient);
  }

  if (recipient && stock) {
    // Master switch: nobody gets stock calldata unless ops turned it on. Off by
    // default, off on a typo, off when the variable is missing. Quotes stay visible.
    if (process.env.BASE_STOCK_SWAPS_ENABLED !== 'true') {
      txWithheld.push('tokenized-stock swaps are disabled (BASE_STOCK_SWAPS_ENABLED is not "true")');
    }
    // Two independent gates for tokenized stocks: the human's own attestation
    // and the edge's view of where they are. US or unknown = no calldata.
    if (input.stockEligibilityConfirmed !== true) {
      txWithheld.push('confirm tokenized-stock eligibility before requesting transaction data');
    }
    const country = (input.country || '').trim().toUpperCase();
    if (!country) txWithheld.push('viewer country unavailable; cannot confirm eligibility for tokenized stocks');
    else if (country === 'US') txWithheld.push('tokenized stocks are not available to US persons');
    else if (!stockCountryAllowed(country, process.env.BASE_STOCK_COUNTRY_ALLOWLIST)) {
      txWithheld.push(`tokenized stocks are not offered in ${country} (allow-list ${STOCK_COUNTRY_ALLOWLIST.version})`);
    }
    if (txWithheld.length === 0) {
      const pools = await routePools(routeHops(tokenIn, tokenOut, best)).catch(() => null);
      if (!pools) txWithheld.push('route pools could not be resolved for the transfer-policy check');
      else {
        const side: 'buy' | 'sell' = tokenOut.assetClass === 'tokenized-stock' ? 'buy' : 'sell';
        const reason = await stockTransferPolicyReason(stock, recipient, side, side === 'buy' ? pools[pools.length - 1] : pools[0]);
        if (reason) txWithheld.push(reason);
      }
    }
  }

  if (recipient) {
    // Balance and allowance in one call. A failed read is not a pass.
    let balance: bigint | null = null;
    let allowance: bigint | null = tokenIn.native ? 0n : null;
    try {
      if (tokenIn.native) {
        balance = await c.getBalance({ address: recipient });
      } else {
        const token = getAddress(tokenIn.address);
        const [bal, alw] = (await multicallLoose([
          { address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [recipient] },
          { address: token, abi: ERC20_ABI, functionName: 'allowance', args: [recipient, SWAP_ROUTER02] },
        ], false)) as [bigint, bigint];
        balance = bal;
        allowance = alw;
      }
    } catch {
      txWithheld.push('wallet balance/allowance could not be read');
    }
    if (balance !== null && balance < amountInRaw) txWithheld.push(`wallet holds less ${tokenIn.symbol} than the amount to swap`);

    if (allowance !== null && !tokenIn.native) allowanceRaw = allowance.toString();
    if (txWithheld.length === 0 && balance !== null && allowance !== null) {
      const needsApproval = !tokenIn.native && allowance < amountInRaw;
      const revoke = !tokenIn.native && allowance > 0n ? buildRevokeTx(getAddress(tokenIn.address)) : null;
      if (needsApproval) {
        // No swap calldata yet: the real state cannot execute it. But the human
        // is about to pay for an approval, so the swap is simulated with the
        // allowance overridden in state (transferFrom + B20 policies + pool).
        // A revert here withholds the approval too. The client still signs
        // the approval, waits for the receipt and re-quotes for live calldata.
        const preview = buildSwapTx({ tokenIn, tokenOut, route: best, amountIn: amountInRaw, minOut: minOutRaw, recipient, deadline });
        const pre = await simulateWithAllowanceOverride(getAddress(tokenIn.address), recipient, amountInRaw, preview);
        if (pre === null) {
          simulation.reason = 'approval pending: allowance-override simulation unavailable for this token; the swap is simulated again after the approval mines';
        } else if (pre.ok) {
          simulation.ran = true;
          simulation.ok = true;
          simulation.reason = 'simulated with the allowance overridden; re-quote after the approval mines for live calldata';
        } else {
          simulation.ran = true;
          simulation.ok = false;
          simulation.reason = pre.reason;
          txWithheld.push(`swap would revert even with the allowance in place: ${pre.reason}`);
        }
        if (txWithheld.length === 0) {
          tx = { chainId: BASE_SWAP_CHAIN_ID, approve: buildApproveTx(getAddress(tokenIn.address), amountInRaw), swap: null, calldataHash: null, revoke, deadline };
        }
      } else {
        const swap = buildSwapTx({ tokenIn, tokenOut, route: best, amountIn: amountInRaw, minOut: minOutRaw, recipient, deadline });
        simulation.ran = true;
        try {
          await c.call({ account: recipient, to: swap.to, data: swap.data, value: BigInt(swap.value) });
          simulation.ok = true;
          simulation.reason = null;
        } catch (error) {
          simulation.ok = false;
          const msg = error instanceof Error ? error.message.split('\n')[0].slice(0, 160) : String(error);
          simulation.reason = msg;
          txWithheld.push(`swap simulation reverted: ${msg}`);
        }
        if (txWithheld.length === 0) {
          tx = { chainId: BASE_SWAP_CHAIN_ID, approve: null, swap, calldataHash: keccak256(swap.data), revoke, deadline };
        }
      }
    }
  }

  return {
    chainId: BASE_SWAP_CHAIN_ID,
    venue: { name: 'Uniswap V3 (SwapRouter02)', router: SWAP_ROUTER02, quoter: QUOTER_V2 },
    tokenIn: view(tokenIn),
    tokenOut: view(tokenOut),
    amountIn: formatUnits(amountInRaw, tokenIn.decimals),
    amountInRaw: amountInRaw.toString(),
    amountOut: formatUnits(amountOutRaw, tokenOut.decimals),
    amountOutRaw: amountOutRaw.toString(),
    minAmountOut: formatUnits(minOutRaw, tokenOut.decimals),
    minAmountOutRaw: minOutRaw.toString(),
    executionPrice,
    priceImpactPct,
    usdValue,
    slippagePct,
    deadline,
    route: {
      kind: best.route.kind,
      fees: best.route.kind === 'single' ? [best.route.fee] : [...best.route.fees],
      path: best.path,
      description: best.description,
      gasEstimate: best.gasEstimate.toString(),
    },
    alternatives: routes.slice(1, 4).map((r) => ({ description: r.description, amountOut: formatUnits(r.amountOut, tokenOut.decimals) })),
    recipient,
    tx,
    allowanceRaw,
    simulation,
    txWithheld: Array.from(new Set(txWithheld)),
    warnings,
    limits,
    requiresStockEligibility: Boolean(stock),
    stockReference,
  };
}

/** Shape consumed by SwapConfirm / agent-run trade cards. */
export interface TradeExecutionPayload {
  needsApproval: boolean;
  approveTx?: BuiltTx;
  /** Absent while an approval is pending: re-quote after the approval receipt. */
  swapTx?: BuiltTx;
  calldataHash?: Hex;
  /** approve(router, 0), offered whenever an allowance exists. */
  revokeTx?: BuiltTx;
  quote: { fromToken: string; toToken: string; fromAmount: string; fromAmountRaw: string; toAmount: string; minReceived: string; minReceivedRaw: string };
  disclosure: {
    chainId: number;
    venue: string;
    router: Address;
    tokenContract: Address | null;
    spender: Address | null;
    minReceived: string;
    route: string;
    priceImpactPct: number | null;
    deadline: number;
    simulated: boolean;
    /** Present for tokenized-stock legs. */
    stockReference?: StockReferenceView | null;
    note: string;
  };
}

export function toTradeExecution(q: BaseSwapQuote): TradeExecutionPayload | null {
  if (!q.tx) return null;
  return {
    needsApproval: Boolean(q.tx.approve),
    approveTx: q.tx.approve ? { to: q.tx.approve.to, data: q.tx.approve.data, value: q.tx.approve.value } : undefined,
    swapTx: q.tx.swap ?? undefined,
    calldataHash: q.tx.calldataHash ?? undefined,
    revokeTx: q.tx.revoke ? { to: q.tx.revoke.to, data: q.tx.revoke.data, value: q.tx.revoke.value } : undefined,
    quote: { fromToken: q.tokenIn.symbol, toToken: q.tokenOut.symbol, fromAmount: q.amountIn, fromAmountRaw: q.amountInRaw, toAmount: q.amountOut, minReceived: q.minAmountOut, minReceivedRaw: q.minAmountOutRaw },
    disclosure: {
      chainId: q.chainId,
      venue: q.venue.name,
      router: q.venue.router,
      tokenContract: q.tx.approve ? q.tx.approve.to : null,
      spender: q.tx.approve ? q.tx.approve.spender : null,
      minReceived: q.minAmountOut,
      route: q.route.description,
      priceImpactPct: q.priceImpactPct,
      deadline: q.deadline,
      simulated: q.simulation.ran && q.simulation.ok === true,
      stockReference: q.stockReference,
      note: 'Router and quoter are pinned Uniswap deployments. Approval is exact, but can remain if the swap is abandoned or reverts. Bobby never signs for you.',
    },
  };
}

/**
 * What a wallet holds in tokenized stocks right now, in USD at the Chainlink
 * reference. One multicall for balances, one per held stock for the feed.
 * This is the exposure the risk gate reasons about: a lot sold is gone, a lot
 * still held after the 48h scoring horizon is still money at risk.
 */
export async function fetchOnchainStockExposureUsd(wallet: string): Promise<number> {
  const owner = getAddress(wallet);
  const stocks = BASE_SWAP_TOKENS.filter((t) => t.assetClass === 'tokenized-stock' && t.referenceFeed);
  if (!stocks.length) return 0;
  const balances = (await multicallLoose(
    stocks.map((t) => ({ address: getAddress(t.address), abi: ERC20_ABI, functionName: 'balanceOf', args: [owner] })),
    false,
  )) as bigint[];
  let total = 0;
  for (let i = 0; i < stocks.length; i++) {
    const bal = balances[i] ?? 0n;
    if (bal <= 0n) continue;
    const feed = getAddress(stocks[i].referenceFeed as Address);
    const tokenAddr = getAddress(stocks[i].address);
    const [dec, round, tokenMultiplier, oracleParams] = (await multicallLoose([
      { address: feed, abi: CHAINLINK_ABI, functionName: 'decimals' },
      { address: feed, abi: CHAINLINK_ABI, functionName: 'latestRoundData' },
      { address: tokenAddr, abi: B20_ABI, functionName: 'multiplier' },
      { address: ORACLE_REGISTRY, abi: B20_ORACLE_REGISTRY_ABI, functionName: 'getOracleParams', args: [tokenAddr] },
    ], false)) as [number, readonly [bigint, bigint, bigint, bigint, bigint], bigint, readonly [bigint, boolean] | undefined];
    // A reference that is not a reference is an error, not a zero: the caller
    // fails closed. BP-14: the SAME validator as the quote path — an issuer pause
    // or an unknown pause state makes the held exposure unpriceable.
    const [roundId, answer, , updatedAt, answeredInRound] = round;
    const ageSec = Math.floor(Date.now() / 1000) - Number(updatedAt);
    const params = Array.isArray(oracleParams) && oracleParams.length === 2 ? oracleParams : null;
    const verdict = evaluateStockReference({
      ageSec, issuerPaused: params ? Boolean(params[1]) : null, registryMultiplier: params ? params[0].toString() : null,
      multiplier: (tokenMultiplier ?? 0n).toString(), roundComplete: answeredInRound >= roundId && Number(updatedAt) !== 0, answerPositive: answer > 0n,
    });
    if (!verdict.usable) {
      throw new Error(`${stocks[i].symbol}: reference ${verdict.status} — ${verdict.reason} (round ${roundId}/${answeredInRound}, age ${ageSec}s)`);
    }
    total += Number(formatUnits(bal, stocks[i].decimals)) * Number(formatUnits(answer, Number(dec)));
  }
  return total;
}

/** Live check that the pinned contracts are what we think they are (smoke test / health). */
export async function verifyVenue(): Promise<{ ok: boolean; checks: Record<string, boolean> }> {
  const [qf, qw, rf, rw] = (await multicallLoose([
    { address: QUOTER_V2, abi: QUOTER_ABI, functionName: 'factory' },
    { address: QUOTER_V2, abi: QUOTER_ABI, functionName: 'WETH9' },
    { address: SWAP_ROUTER02, abi: ROUTER_ABI, functionName: 'factory' },
    { address: SWAP_ROUTER02, abi: ROUTER_ABI, functionName: 'WETH9' },
  ], false)) as [string, string, string, string];
  const checks = {
    quoterFactory: qf.toLowerCase() === V3_FACTORY.toLowerCase(),
    quoterWeth: qw.toLowerCase() === WETH9.toLowerCase(),
    routerFactory: rf.toLowerCase() === V3_FACTORY.toLowerCase(),
    routerWeth: rw.toLowerCase() === WETH9.toLowerCase(),
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}
