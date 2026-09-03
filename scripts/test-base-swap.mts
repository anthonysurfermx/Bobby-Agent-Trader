// Offline unit tests for the Base/Uniswap swap rail: token resolution,
// min-out math, path encoding and — the part that matters — that the
// calldata we hand to a wallet decodes to exactly what we claim.
import assert from 'node:assert/strict';
import { decodeFunctionData, getAddress, parseUnits } from 'viem';
import {
  BaseSwapError, ERC20_ABI, FEE_TIERS, ROUTER_ADDRESS_THIS, SWAP_ROUTER02, QUOTER_V2, V3_FACTORY, WETH9,
  buildApproveTx, buildRevokeTx, buildSwapTx, candidateRoutes, clampSlippage, computeMinOut, decodeSwapTx, encodePath, resolvePair, toRawAmount,
  type QuotedRoute,
} from '../api/_lib/base-swap.js';
import { BASE_STOCK_SYMBOLS, BASE_SWAP_LIMITS, BASE_SWAP_TOKENS, BASE_USDC, STOCK_COUNTRY_ALLOWLIST, findBaseToken, stockCountryAllowed } from '../src/lib/base-swap/tokens.js';

const wallet = getAddress('0x1111111111111111111111111111111111111111');

// --- pinned venue (official Uniswap deployment list, Base 8453; verified on-chain 2026-09-03) ---
assert.equal(SWAP_ROUTER02, '0x2626664c2603336E57B271c5C0b26F421741e481');
assert.equal(QUOTER_V2, '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a');
assert.equal(V3_FACTORY, '0x33128a8fC17869897dcE68Ed026d694621f6FDfD');
assert.equal(WETH9, '0x4200000000000000000000000000000000000006');

// --- allow-list ---
for (const t of BASE_SWAP_TOKENS) assert.equal(t.address, getAddress(t.address), `${t.symbol} address must be checksummed`);
assert.equal(findBaseToken('btc')?.symbol, 'cbBTC');
assert.equal(findBaseToken('WBTC')?.symbol, 'cbBTC');
assert.equal(findBaseToken('eth')?.native, true);
assert.equal(findBaseToken(BASE_USDC.toLowerCase())?.symbol, 'USDC');
assert.equal(findBaseToken(WETH9)?.symbol, 'WETH', 'address lookup never resolves to native ETH');
assert.equal(findBaseToken('DOGE'), null);
assert.equal(findBaseToken('0x0000000000000000000000000000000000000000'), null);
assert.deepEqual(BASE_STOCK_SYMBOLS, ['AAPLc', 'GOOGLc', 'METAc', 'NVDAc']);
assert.equal(findBaseToken('NVDA')?.symbol, 'NVDAc', 'underlying ticker resolves to the pinned B20 address');
assert.equal(findBaseToken('aaplc')?.address, '0xb200000000000000000000C2e324d24d7eEcd1fb');

// --- country allow-list: fail closed, env may only narrow ---
assert.ok(STOCK_COUNTRY_ALLOWLIST.version.length > 8);
assert.equal(stockCountryAllowed('MX'), true);
assert.equal(stockCountryAllowed('mx'), true);
assert.equal(stockCountryAllowed('US'), false);
assert.equal(stockCountryAllowed('AR'), false, 'not on the list = refused');
assert.equal(stockCountryAllowed(''), false);
assert.equal(stockCountryAllowed(null), false);
assert.equal(stockCountryAllowed('MX', 'CO'), false, 'env narrows: MX not in env list');
assert.equal(stockCountryAllowed('CO', 'CO,MX'), false, 'env cannot widen beyond the code list');
assert.equal(stockCountryAllowed('MX', 'garbage'), true, 'malformed env entries are ignored');

function code(run: () => unknown): string | undefined {
  try { run(); return undefined; } catch (e) { assert(e instanceof BaseSwapError, `expected BaseSwapError, got ${e}`); return e.code; }
}
assert.equal(code(() => resolvePair('USDC', 'DOGE')), 'token_not_allowed');
assert.equal(code(() => resolvePair('USDC', 'USDC')), 'same_token');
assert.equal(code(() => resolvePair('ETH', 'WETH')), 'same_token');
assert.equal(code(() => resolvePair('ETH', 'NVDA')), 'stock_pair_not_supported');
assert.equal(code(() => toRawAmount('-1', 6)), 'bad_amount');
assert.equal(code(() => toRawAmount('0', 6)), 'bad_amount');
assert.equal(code(() => toRawAmount('1e3', 6)), 'bad_amount');
assert.equal(toRawAmount(25, 6), 25_000_000n);
assert.equal(toRawAmount(0.000001, 6), 1n);
assert.equal(toRawAmount('0.01', 18), parseUnits('0.01', 18));

// --- math ---
assert.equal(computeMinOut(1_000_000n, 0.5), 995_000n);
assert.equal(computeMinOut(1_000_000n, 3), 970_000n);
assert.equal(computeMinOut(1n, 0.5), 0n, 'floors; never rounds up in the taker\'s favour');
assert.equal(clampSlippage(undefined), BASE_SWAP_LIMITS.defaultSlippagePct);
assert.equal(clampSlippage(99), BASE_SWAP_LIMITS.maxSlippagePct);
assert.equal(clampSlippage(0), 0.05);

// --- routes ---
const usdc = findBaseToken('USDC')!;
const cbbtc = findBaseToken('cbBTC')!;
const eth = findBaseToken('ETH')!;
const nvda = findBaseToken('NVDA')!;
assert.equal(candidateRoutes(usdc.address, cbbtc.address).length, FEE_TIERS.length + 4, 'direct tiers + 4 two-hop combos via WETH');
assert.equal(candidateRoutes(eth.address, usdc.address).length, FEE_TIERS.length, 'no WETH hop when one leg is WETH');
assert.equal(candidateRoutes(usdc.address, nvda.address, true).length, FEE_TIERS.length, 'tokenized stocks are direct-only');
const path = encodePath([usdc.address, WETH9, cbbtc.address], [500, 3000]);
assert.equal(path.toLowerCase(), `0x${usdc.address.slice(2)}0001f4${WETH9.slice(2)}000bb8${cbbtc.address.slice(2)}`.toLowerCase());

// --- approve: exact amount, router as spender ---
const approve = buildApproveTx(usdc.address, 25_000_000n);
assert.equal(approve.to, usdc.address);
assert.equal(approve.value, '0x0');
{
  const d = decodeFunctionData({ abi: ERC20_ABI, data: approve.data });
  assert.equal(d.functionName, 'approve');
  assert.equal(d.args[0], SWAP_ROUTER02);
  assert.equal(d.args[1], 25_000_000n, 'no unlimited approvals');
}

// --- revoke: approve(router, 0) on the token, nothing else ---
{
  const revoke = buildRevokeTx(usdc.address);
  assert.equal(revoke.to, usdc.address);
  const d = decodeFunctionData({ abi: ERC20_ABI, data: revoke.data });
  assert.equal(d.functionName, 'approve');
  assert.equal(d.args[0], SWAP_ROUTER02);
  assert.equal(d.args[1], 0n);
}

const deadline = 1_900_000_000;
const single: QuotedRoute = { route: { kind: 'single', fee: 500 }, amountOut: 40_000n, gasEstimate: 0n, path: null, description: 'x' };

// --- ERC-20 → ERC-20 ---
{
  const tx = buildSwapTx({ tokenIn: usdc, tokenOut: cbbtc, route: single, amountIn: 25_000_000n, minOut: 39_800n, recipient: wallet, deadline });
  assert.equal(tx.to, SWAP_ROUTER02);
  assert.equal(tx.value, '0x0', 'no native value when selling an ERC-20');
  const d = decodeSwapTx(tx.data);
  assert.equal(d.deadline, BigInt(deadline));
  assert.equal(d.calls.length, 1);
  assert.equal(d.calls[0].functionName, 'exactInputSingle');
  const p = d.calls[0].args[0] as { tokenIn: string; tokenOut: string; fee: number; recipient: string; amountIn: bigint; amountOutMinimum: bigint; sqrtPriceLimitX96: bigint };
  assert.equal(p.tokenIn, usdc.address);
  assert.equal(p.tokenOut, cbbtc.address);
  assert.equal(p.fee, 500);
  assert.equal(p.recipient, wallet, 'output goes to the signer, nobody else');
  assert.equal(p.amountIn, 25_000_000n);
  assert.equal(p.amountOutMinimum, 39_800n);
  assert.equal(p.sqrtPriceLimitX96, 0n);
}

// --- ETH in: value == amountIn, WETH9 in the path ---
{
  const amountIn = parseUnits('0.01', 18);
  const tx = buildSwapTx({ tokenIn: eth, tokenOut: usdc, route: single, amountIn, minOut: 1n, recipient: wallet, deadline });
  assert.equal(BigInt(tx.value), amountIn);
  const p = decodeSwapTx(tx.data).calls[0].args[0] as { tokenIn: string; recipient: string };
  assert.equal(p.tokenIn, WETH9);
  assert.equal(p.recipient, wallet);
}

// --- ETH out: swap pays the router, unwrapWETH9 pays the signer with the same minimum ---
{
  const tx = buildSwapTx({ tokenIn: usdc, tokenOut: eth, route: single, amountIn: 25_000_000n, minOut: 123n, recipient: wallet, deadline });
  assert.equal(tx.value, '0x0');
  const d = decodeSwapTx(tx.data);
  assert.equal(d.calls.length, 2);
  const p = d.calls[0].args[0] as { tokenOut: string; recipient: string; amountOutMinimum: bigint };
  assert.equal(p.tokenOut, WETH9);
  assert.equal(p.recipient, ROUTER_ADDRESS_THIS);
  assert.equal(d.calls[1].functionName, 'unwrapWETH9');
  assert.equal(d.calls[1].args[0], 123n);
  assert.equal(d.calls[1].args[1], wallet);
}

// --- two-hop route uses exactInput with our packed path ---
{
  const multi: QuotedRoute = { route: { kind: 'multi', fees: [500, 3000] }, amountOut: 1n, gasEstimate: 0n, path, description: 'y' };
  const tx = buildSwapTx({ tokenIn: usdc, tokenOut: cbbtc, route: multi, amountIn: 25_000_000n, minOut: 1n, recipient: wallet, deadline });
  const d = decodeSwapTx(tx.data);
  assert.equal(d.calls[0].functionName, 'exactInput');
  const p = d.calls[0].args[0] as { path: string; recipient: string; amountIn: bigint; amountOutMinimum: bigint };
  assert.equal(p.path.toLowerCase(), path.toLowerCase());
  assert.equal(p.recipient, wallet);
  assert.equal(p.amountIn, 25_000_000n);
}

// --- a recipient that is not the wallet is impossible to smuggle: build always checksums the given one ---
assert.throws(() => buildSwapTx({ tokenIn: usdc, tokenOut: cbbtc, route: single, amountIn: 1n, minOut: 1n, recipient: '0xnot' as `0x${string}`, deadline }));

console.log('base-swap tests passed');
