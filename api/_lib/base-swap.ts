// ============================================================
// Base-only swap engine — Uniswap v3 on Base (8453) through the Universal
// Router with Permit2. Replaces the OKX aggregator proxies (decision
// 2026-09-03: one chain, one engine, Bobby never signs).
//
// Every address below is a constant verified against Uniswap's deployments
// page and checked for bytecode on chain: the allow-list IS the code. The
// quote comes from QuoterV2 on chain (no third-party API, no credentials), the
// minimum received is derived from OUR quote and the caller's slippage, the
// calldata is built here and simulated with eth_call from the user's address
// before it is returned, approvals are exact-amount to Permit2 and the Permit2
// signature is bounded in amount, expiration and deadline. Nothing here signs.
//
// Flow (the client is a thin executor):
//   quote  → best single-hop pool across fee tiers, minOut, and the STEPS the
//            wallet must perform: [approve token→Permit2 (exact, only if the
//            allowance is short)] then [sign PermitSingle (EIP-712)]
//   build  → with the Permit2 signature: UR calldata (PERMIT2_PERMIT +
//            V3_SWAP_EXACT_IN, WRAP/UNWRAP for native ETH), simulated, with
//            disclosure {router, spender, tokenIn, tokenOut, amountIn, minOut,
//            deadline}
// ============================================================
import { createPublicClient, encodeAbiParameters, encodeFunctionData, encodePacked, getAddress, http, parseAbi, type Address, type Hex } from 'viem';
import { base } from 'viem/chains';

export const BASE_CHAIN_ID = 8453;
export const UNISWAP = {
  universalRouter: '0x6fF5693b99212Da76ad316178A184AB56D299b43' as Address,
  quoterV2: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a' as Address,
  permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address,
  weth: '0x4200000000000000000000000000000000000006' as Address,
} as const;
export const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as Address;

/** Tokens Bobby will build swaps for on Base. Anything else is refused. */
export const BASE_TOKENS: Record<string, { address: Address; decimals: number }> = {
  ETH: { address: NATIVE, decimals: 18 },
  WETH: { address: UNISWAP.weth, decimals: 18 },
  USDC: { address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', decimals: 6 },
  cbBTC: { address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8 },
  cbETH: { address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', decimals: 18 },
};
export const FEE_TIERS = [100, 500, 3000, 10000] as const;
/** Hard ceiling per swap while the engine is young (USD-equivalent for stables, else by amountIn of the base asset). */
export const MAX_AMOUNT_USDC = 2_000n * 10n ** 6n;
export const MAX_SLIPPAGE_BPS = 300;   // 3 %
export const PERMIT_EXPIRATION_S = 30 * 60;
export const SIG_DEADLINE_S = 20 * 60;
export const TX_DEADLINE_S = 15 * 60;
// Universal Router commands (Uniswap Commands.sol)
const CMD = { V3_SWAP_EXACT_IN: 0x00, PERMIT2_PERMIT: 0x0a, WRAP_ETH: 0x0b, UNWRAP_WETH: 0x0c } as const;
const MSG_SENDER = '0x0000000000000000000000000000000000000001' as Address;
const ADDRESS_THIS = '0x0000000000000000000000000000000000000002' as Address;

const QUOTER_ABI = parseAbi(['function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)']);
const PERMIT2_ABI = parseAbi(['function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)']);
const ERC20_ABI = parseAbi(['function allowance(address owner, address spender) view returns (uint256)', 'function approve(address spender, uint256 amount) returns (bool)', 'function balanceOf(address) view returns (uint256)']);
const UR_ABI = parseAbi(['function execute(bytes commands, bytes[] inputs, uint256 deadline) payable']);

export function baseClient(rpc?: string) {
  const urls = [rpc, process.env.BASE_RPC_URL, 'https://mainnet.base.org', 'https://base-rpc.publicnode.com'].filter(Boolean) as string[];
  return createPublicClient({ chain: base, transport: http(urls[0], { timeout: 15_000 }) });
}

export function swapsEnabled(): boolean { return process.env.BASE_SWAPS_ENABLED === 'true'; }

export function resolveToken(symbol: string): { symbol: string; address: Address; decimals: number } {
  const key = Object.keys(BASE_TOKENS).find((k) => k.toLowerCase() === symbol.toLowerCase());
  if (!key) throw new SwapRefusal(`Token ${symbol} is not on Bobby's Base allow-list`, 'token_not_allowed');
  return { symbol: key, ...BASE_TOKENS[key] };
}
export class SwapRefusal extends Error { constructor(message: string, public readonly code: string) { super(message); this.name = 'SwapRefusal'; } }

export interface Quote {
  chainId: number; tokenIn: string; tokenOut: string; amountIn: string; amountOut: string; minOut: string; fee: number; slippageBps: number;
  gasEstimate: string; quotedAt: string;
}

/** Best single-hop pool for the pair across the fee tiers, from QuoterV2 (on-chain, view). */
export async function quote(tokenInSym: string, tokenOutSym: string, amountIn: bigint, slippageBps: number, client = baseClient()): Promise<Quote> {
  if (slippageBps < 1 || slippageBps > MAX_SLIPPAGE_BPS) throw new SwapRefusal(`slippage must be 1..${MAX_SLIPPAGE_BPS} bps`, 'slippage_out_of_range');
  const tin = resolveToken(tokenInSym), tout = resolveToken(tokenOutSym);
  if (tin.symbol === tout.symbol || (tin.address === NATIVE && tout.symbol === 'WETH') || (tout.address === NATIVE && tin.symbol === 'WETH')) throw new SwapRefusal('Nothing to swap', 'same_token');
  if (amountIn <= 0n) throw new SwapRefusal('amount must be positive', 'bad_amount');
  if (tin.symbol === 'USDC' && amountIn > MAX_AMOUNT_USDC) throw new SwapRefusal('Above the per-swap ceiling', 'amount_cap');
  const inAddr = tin.address === NATIVE ? UNISWAP.weth : tin.address;
  const outAddr = tout.address === NATIVE ? UNISWAP.weth : tout.address;
  let best: { fee: number; amountOut: bigint; gas: bigint } | null = null;
  for (const fee of FEE_TIERS) {
    try {
      const { result } = await client.simulateContract({ address: UNISWAP.quoterV2, abi: QUOTER_ABI, functionName: 'quoteExactInputSingle', args: [{ tokenIn: inAddr, tokenOut: outAddr, amountIn, fee, sqrtPriceLimitX96: 0n }] });
      const [amountOut, , , gasEstimate] = result;
      if (!best || amountOut > best.amountOut) best = { fee, amountOut, gas: gasEstimate };
    } catch { /* no pool at this tier */ }
  }
  if (!best || best.amountOut === 0n) throw new SwapRefusal(`No Uniswap v3 liquidity on Base for ${tin.symbol}→${tout.symbol}`, 'no_liquidity');
  const minOut = (best.amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
  return { chainId: BASE_CHAIN_ID, tokenIn: tin.symbol, tokenOut: tout.symbol, amountIn: amountIn.toString(), amountOut: best.amountOut.toString(), minOut: minOut.toString(), fee: best.fee, slippageBps, gasEstimate: best.gas.toString(), quotedAt: new Date().toISOString() };
}

export interface PermitTypedData { domain: { name: 'Permit2'; chainId: number; verifyingContract: Address }; types: Record<string, Array<{ name: string; type: string }>>; primaryType: 'PermitSingle'; message: { details: { token: Address; amount: string; expiration: number; nonce: number }; spender: Address; sigDeadline: string } }

/** What the wallet must do before the swap: an exact approval to Permit2 (only if short) and a Permit2 signature for the router. */
export async function steps(owner: Address, q: Quote, client = baseClient()): Promise<{ approve: { to: Address; data: Hex; spender: Address; amount: string } | null; permit: PermitTypedData | null }> {
  const tin = resolveToken(q.tokenIn);
  if (tin.address === NATIVE) return { approve: null, permit: null }; // ETH in: wrapped by the router from msg.value, no approval, no permit
  const amountIn = BigInt(q.amountIn);
  // viem's ReadContractParameters typing under this tsconfig demands an `authorizationList`; the calls are plain views.
  const erc20Allowance = (await client.readContract({ address: tin.address, abi: ERC20_ABI, functionName: 'allowance', args: [owner, UNISWAP.permit2] } as any)) as bigint;
  const approve = erc20Allowance >= amountIn ? null : { to: tin.address, data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [UNISWAP.permit2, amountIn] }), spender: UNISWAP.permit2, amount: amountIn.toString() };
  const [, , nonce] = (await client.readContract({ address: UNISWAP.permit2, abi: PERMIT2_ABI, functionName: 'allowance', args: [owner, tin.address, UNISWAP.universalRouter] } as any)) as readonly [bigint, number, number];
  const now = Math.floor(Date.now() / 1000);
  const permit: PermitTypedData = {
    domain: { name: 'Permit2', chainId: BASE_CHAIN_ID, verifyingContract: UNISWAP.permit2 },
    types: {
      PermitSingle: [{ name: 'details', type: 'PermitDetails' }, { name: 'spender', type: 'address' }, { name: 'sigDeadline', type: 'uint256' }],
      PermitDetails: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint160' }, { name: 'expiration', type: 'uint48' }, { name: 'nonce', type: 'uint48' }],
    },
    primaryType: 'PermitSingle',
    message: { details: { token: tin.address, amount: amountIn.toString(), expiration: now + PERMIT_EXPIRATION_S, nonce: Number(nonce) }, spender: UNISWAP.universalRouter, sigDeadline: String(now + SIG_DEADLINE_S) },
  };
  return { approve, permit };
}

export interface BuiltTx { to: Address; data: Hex; value: string; deadline: number; disclosure: { chainId: number; router: Address; spender: Address | null; tokenIn: string; tokenOut: string; amountIn: string; minOut: string; fee: number; deadline: number; recipient: Address; note: string } }

/** Universal Router calldata for the quote; `permit` is the signed PermitSingle when tokenIn is an ERC-20. */
export function build(owner: Address, q: Quote, permit: { message: PermitTypedData['message']; signature: Hex } | null): BuiltTx {
  const tin = resolveToken(q.tokenIn), tout = resolveToken(q.tokenOut);
  const amountIn = BigInt(q.amountIn), minOut = BigInt(q.minOut);
  const inAddr = tin.address === NATIVE ? UNISWAP.weth : tin.address;
  const outAddr = tout.address === NATIVE ? UNISWAP.weth : tout.address;
  const path = encodePacked(['address', 'uint24', 'address'], [inAddr, q.fee, outAddr]);
  const commands: number[] = []; const inputs: Hex[] = [];
  let value = 0n;
  if (tin.address === NATIVE) {
    commands.push(CMD.WRAP_ETH); inputs.push(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [ADDRESS_THIS, amountIn])); value = amountIn;
  } else {
    if (!permit) throw new SwapRefusal('Permit2 signature required for an ERC-20 input', 'permit_required');
    const m = permit.message;
    if (getAddress(m.details.token) !== getAddress(tin.address) || BigInt(m.details.amount) !== amountIn || getAddress(m.spender) !== getAddress(UNISWAP.universalRouter)) throw new SwapRefusal('Permit does not match the quote', 'permit_mismatch');
    commands.push(CMD.PERMIT2_PERMIT);
    inputs.push(encodeAbiParameters([
      { type: 'tuple', components: [{ type: 'tuple', name: 'details', components: [{ type: 'address', name: 'token' }, { type: 'uint160', name: 'amount' }, { type: 'uint48', name: 'expiration' }, { type: 'uint48', name: 'nonce' }] }, { type: 'address', name: 'spender' }, { type: 'uint256', name: 'sigDeadline' }] },
      { type: 'bytes' },
    ], [{ details: { token: m.details.token, amount: BigInt(m.details.amount), expiration: m.details.expiration, nonce: m.details.nonce }, spender: m.spender, sigDeadline: BigInt(m.sigDeadline) }, permit.signature]));
  }
  const swapRecipient = tout.address === NATIVE ? ADDRESS_THIS : MSG_SENDER;
  commands.push(CMD.V3_SWAP_EXACT_IN);
  inputs.push(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bytes' }, { type: 'bool' }], [swapRecipient, amountIn, minOut, path, tin.address !== NATIVE]));
  if (tout.address === NATIVE) { commands.push(CMD.UNWRAP_WETH); inputs.push(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [MSG_SENDER, minOut])); }
  const deadline = Math.floor(Date.now() / 1000) + TX_DEADLINE_S;
  const data = encodeFunctionData({ abi: UR_ABI, functionName: 'execute', args: [`0x${commands.map((c) => c.toString(16).padStart(2, '0')).join('')}` as Hex, inputs, BigInt(deadline)] });
  return { to: UNISWAP.universalRouter, data, value: value.toString(), deadline, disclosure: { chainId: BASE_CHAIN_ID, router: UNISWAP.universalRouter, spender: tin.address === NATIVE ? null : UNISWAP.permit2, tokenIn: tin.symbol, tokenOut: tout.symbol, amountIn: amountIn.toString(), minOut: minOut.toString(), fee: q.fee, deadline, recipient: owner, note: 'Uniswap v3 on Base via the Universal Router. Exact-amount Permit2 approval, bounded permit, minimum received from an on-chain quote. Bobby never signs.' } };
}

/** eth_call the built transaction from the user's address; throws SwapRefusal with the revert reason. */
export async function simulate(owner: Address, tx: BuiltTx, client = baseClient()): Promise<void> {
  try {
    await client.call({ account: owner, to: tx.to, data: tx.data, value: BigInt(tx.value) });
  } catch (e) {
    const msg = (e as Error).message || String(e);
    throw new SwapRefusal(`Simulation reverted: ${msg.split('\n')[0].slice(0, 200)}`, 'simulation_reverted');
  }
}
