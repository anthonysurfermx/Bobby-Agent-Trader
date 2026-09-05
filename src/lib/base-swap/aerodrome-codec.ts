// Preparatory codec only: not connected to the execution API or either wallet UI.
// Callers must separately enforce admission, oracle, eligibility, ticket/impact
// limits, balances and simulation. A valid encoding is not permission to trade.
import { encodeFunctionData, getAddress, isAddress, parseAbi, type Address } from 'viem';
import { BASE_SWAP_CHAIN_ID, BASE_SWAP_LIMITS, BASE_USDC } from './tokens';

// Official Gauges V3 deployment and ISwapRouter, checked 2026-09-05:
// https://github.com/aerodrome-finance/slipstream/blob/main/README.md
// https://github.com/aerodrome-finance/slipstream/blob/main/contracts/periphery/interfaces/ISwapRouter.sol
export const AERODROME_BASE = {
  chainId: BASE_SWAP_CHAIN_ID,
  factory: '0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef',
  quoter: '0x514c8B5f54112481E28028F1166Bd78501089259',
  router: '0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F',
  // Tick spacing is not a fee tier; fees are dynamic.
  tickSpacing: 10,
} as const;

// Engineering scope, deliberately separate from the executable token allow-list.
// MSFT is excluded because the observed reference deviation exceeded the limit.
export const AERODROME_REVIEW_STOCKS = {
  AMZNc: '0xb200000000000000000000d9192b6B456483C2E8',
  MSTRc: '0xb2000000000000000000004884b426556b92883d',
  SNDKc: '0xb200000000000000000000397293Cb8cda9a10c5',
  TSLAc: '0xb2000000000000000000001e800a7f5189430cD0',
} as const;

export const AERODROME_SINGLE_ABI = parseAbi([
  'function exactInputSingle((address tokenIn,address tokenOut,int24 tickSpacing,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)',
]);
const APPROVE_ABI = parseAbi(['function approve(address spender,uint256 amount) returns (bool)']);
const MAX_UINT256 = (1n << 256n) - 1n;

export interface AerodromeIntent {
  chainId: number;
  tokenInSymbol: string;
  tokenOutSymbol: string;
  amountInRaw: string;
  minAmountOutRaw: string;
  recipient: string;
  deadline: number;
}
export interface AerodromeTransaction {
  chainId: number;
  to: string;
  data: string;
  value: string;
}

function refuse(reason: string): never {
  throw new Error(`Aerodrome transaction refused: ${reason}`);
}
function positiveUint(raw: string): bigint {
  if (typeof raw !== 'string' || !/^[1-9][0-9]*$/.test(raw) || raw.length > 78) refuse('invalid amount');
  const value = BigInt(raw);
  if (value > MAX_UINT256) refuse('amount exceeds uint256');
  return value;
}
function tokenAddress(symbol: string): Address {
  if (symbol === 'USDC') return BASE_USDC;
  if (!Object.prototype.hasOwnProperty.call(AERODROME_REVIEW_STOCKS, symbol)) refuse('stock is outside the review scope');
  return AERODROME_REVIEW_STOCKS[symbol as keyof typeof AERODROME_REVIEW_STOCKS];
}
function validateIntent(intent: AerodromeIntent, nowSec: number) {
  if (intent.chainId !== AERODROME_BASE.chainId) refuse('wrong chain');
  if ((intent.tokenInSymbol === 'USDC') === (intent.tokenOutSymbol === 'USDC')) refuse('direct USDC pair required');
  if (!Number.isSafeInteger(nowSec) || nowSec < 0 || !Number.isSafeInteger(intent.deadline)
    || intent.deadline <= nowSec + 15 || intent.deadline > nowSec + BASE_SWAP_LIMITS.deadlineSec) refuse('invalid or expired deadline');
  if (!isAddress(intent.recipient) || /^0x0{40}$/i.test(intent.recipient)) refuse('invalid recipient');
  return {
    tokenIn: tokenAddress(intent.tokenInSymbol), tokenOut: tokenAddress(intent.tokenOutSymbol),
    tickSpacing: AERODROME_BASE.tickSpacing, recipient: getAddress(intent.recipient),
    deadline: BigInt(intent.deadline), amountIn: positiveUint(intent.amountInRaw),
    amountOutMinimum: positiveUint(intent.minAmountOutRaw), sqrtPriceLimitX96: 0n,
  };
}

/** Pure encoding only. nowSec and intent must come from the caller's trusted state. */
export function encodeAerodromeSwap(intent: AerodromeIntent, nowSec: number): AerodromeTransaction {
  const params = validateIntent(intent, nowSec);
  return { chainId: AERODROME_BASE.chainId, to: AERODROME_BASE.router, value: '0',
    data: encodeFunctionData({ abi: AERODROME_SINGLE_ABI, functionName: 'exactInputSingle', args: [params] }) };
}

export function encodeAerodromeApproval(intent: AerodromeIntent, nowSec: number, revoke = false): AerodromeTransaction {
  const params = validateIntent(intent, nowSec);
  return { chainId: AERODROME_BASE.chainId, to: params.tokenIn, value: '0',
    data: encodeFunctionData({ abi: APPROVE_ABI, functionName: 'approve', args: [AERODROME_BASE.router, revoke ? 0n : params.amountIn] }) };
}

function assertCanonicalTransaction(actual: AerodromeTransaction, expected: AerodromeTransaction): void {
  if (actual.chainId !== expected.chainId || !isAddress(actual.to)
    || getAddress(actual.to) !== getAddress(expected.to)) refuse('chain or destination mismatch');
  if (actual.value !== '0' && actual.value !== '0x0') refuse('native value is forbidden');
  // Comparing the complete canonical encoding also rejects trailing bytes, extra
  // calls, noncanonical padding and any amount/recipient/deadline substitution.
  if (typeof actual.data !== 'string' || !/^0x[0-9a-fA-F]+$/.test(actual.data)
    || actual.data.toLowerCase() !== expected.data.toLowerCase()) refuse('calldata differs from the reviewed intent');
}

export function assertAerodromeSwap(actual: AerodromeTransaction, expected: AerodromeIntent, nowSec: number): void {
  assertCanonicalTransaction(actual, encodeAerodromeSwap(expected, nowSec));
}
export function assertAerodromeApproval(actual: AerodromeTransaction, expected: AerodromeIntent, nowSec: number, revoke = false): void {
  assertCanonicalTransaction(actual, encodeAerodromeApproval(expected, nowSec, revoke));
}
