// Client-side last-mile guard for every transaction shown to a wallet.
// The API builds calldata, but the browser independently decodes it and
// refuses to sign if the target, spender, amounts, recipient or deadline
// differ from the quote displayed to the human.

import { decodeFunctionData, getAddress, isAddress, parseAbi, type Hex } from 'viem';
import { BASE_SWAP_ROUTER02, findBaseToken } from './tokens';

const ERC20_APPROVE_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
]);

const ROUTER_GUARD_ABI = parseAbi([
  'function multicall(uint256 deadline, bytes[] data) payable returns (bytes[] results)',
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)',
]);

const ROUTER = getAddress(BASE_SWAP_ROUTER02);
const ALLOWED_FEES = new Set([100, 500, 3000, 10000]);

export interface GuardedTx {
  to: string;
  data: string;
  value?: string;
}

function unsafe(reason: string): never {
  throw new Error(`Unsafe transaction refused: ${reason}`);
}

function address(value: string | undefined, label: string): `0x${string}` {
  if (!value || !isAddress(value)) unsafe(`${label} is not a valid address`);
  return getAddress(value);
}

function uint(value: string | undefined, label: string): bigint {
  if (!value || !/^\d+$/.test(value)) unsafe(`${label} is missing or invalid`);
  return BigInt(value);
}

function txValue(value: string | undefined): bigint {
  try {
    return BigInt(value || '0');
  } catch {
    return unsafe('transaction value is invalid');
  }
}

function data(value: string): Hex {
  if (!/^0x[0-9a-fA-F]+$/.test(value) || value.length % 2 !== 0) unsafe('calldata is malformed');
  return value as Hex;
}

function tokenAddress(symbol: string, label: string): `0x${string}` {
  const token = findBaseToken(symbol);
  if (!token || token.native) unsafe(`${label} is not an allowed ERC-20`);
  return getAddress(token.address);
}

function same(actual: string, expected: string, label: string): void {
  if (getAddress(actual) !== getAddress(expected)) unsafe(`${label} does not match the reviewed quote`);
}

export function assertApprovalCalldata(
  tx: GuardedTx,
  expected: { tokenSymbol: string; amountRaw: string | undefined },
): void {
  same(address(tx.to, 'approval target'), tokenAddress(expected.tokenSymbol, 'approval token'), 'approval token');
  if (txValue(tx.value) !== 0n) unsafe('approval must not transfer native value');

  let decoded: ReturnType<typeof decodeFunctionData>;
  try {
    decoded = decodeFunctionData({ abi: ERC20_APPROVE_ABI, data: data(tx.data) });
  } catch {
    return unsafe('approval calldata does not decode as ERC-20 approve');
  }
  if (decoded.functionName !== 'approve') unsafe('approval function is not approve');
  const [spender, amount] = decoded.args;
  same(spender, ROUTER, 'approval spender');
  if (amount !== uint(expected.amountRaw, 'quoted input amount')) unsafe('approval amount is not the exact quoted amount');
}

export function assertRevokeCalldata(tx: GuardedTx, expected: { tokenSymbol: string }): void {
  same(address(tx.to, 'revoke target'), tokenAddress(expected.tokenSymbol, 'revoke token'), 'revoke token');
  if (txValue(tx.value) !== 0n) unsafe('revoke must not transfer native value');

  let decoded: ReturnType<typeof decodeFunctionData>;
  try {
    decoded = decodeFunctionData({ abi: ERC20_APPROVE_ABI, data: data(tx.data) });
  } catch {
    return unsafe('revoke calldata does not decode as ERC-20 approve');
  }
  if (decoded.functionName !== 'approve') unsafe('revoke function is not approve');
  const [spender, amount] = decoded.args;
  same(spender, ROUTER, 'revoke spender');
  if (amount !== 0n) unsafe('revoke amount is not zero');
}

export function assertSwapCalldata(
  tx: GuardedTx,
  expected: {
    tokenInSymbol: string;
    tokenOutSymbol: string;
    amountInRaw: string | undefined;
    minAmountOutRaw: string | undefined;
    recipient: string | undefined;
    deadline: number | undefined;
  },
): void {
  same(address(tx.to, 'swap target'), ROUTER, 'swap router');
  if (txValue(tx.value) !== 0n) unsafe('this ERC-20 swap must not transfer native value');

  let outer: ReturnType<typeof decodeFunctionData>;
  try {
    outer = decodeFunctionData({ abi: ROUTER_GUARD_ABI, data: data(tx.data) });
  } catch {
    return unsafe('swap calldata does not decode as a reviewed router call');
  }
  if (outer.functionName !== 'multicall') unsafe('swap function is not deadline-protected multicall');
  const [deadline, calls] = outer.args;
  if (!Number.isSafeInteger(expected.deadline) || deadline !== BigInt(expected.deadline!)) {
    unsafe('router deadline does not match the reviewed quote');
  }
  if (calls.length !== 1) unsafe('tokenized-stock swap must contain exactly one router call');

  let inner: ReturnType<typeof decodeFunctionData>;
  try {
    inner = decodeFunctionData({ abi: ROUTER_GUARD_ABI, data: calls[0] });
  } catch {
    return unsafe('inner swap calldata does not decode');
  }
  if (inner.functionName !== 'exactInputSingle') unsafe('tokenized-stock swap is not a direct exactInputSingle route');

  const [params] = inner.args;
  same(params.tokenIn, tokenAddress(expected.tokenInSymbol, 'input token'), 'input token');
  same(params.tokenOut, tokenAddress(expected.tokenOutSymbol, 'output token'), 'output token');
  same(params.recipient, address(expected.recipient, 'recipient wallet'), 'swap recipient');
  if (params.amountIn !== uint(expected.amountInRaw, 'quoted input amount')) unsafe('swap input amount does not match the quote');
  if (params.amountOutMinimum !== uint(expected.minAmountOutRaw, 'quoted minimum received')) unsafe('minimum received does not match the quote');
  if (!ALLOWED_FEES.has(params.fee)) unsafe('pool fee is outside the pinned fee allow-list');
  if (params.sqrtPriceLimitX96 !== 0n) unsafe('unexpected sqrt price limit');
}
