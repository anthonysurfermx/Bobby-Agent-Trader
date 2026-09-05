// Offline unit tests for the Base/Uniswap swap rail: token resolution,
// min-out math, path encoding and — the part that matters — that the
// calldata we hand to a wallet decodes to exactly what we claim.
import assert from 'node:assert/strict';
import { decodeFunctionData, encodeFunctionData, getAddress, parseUnits } from 'viem';
import {
  BaseSwapError, ERC20_ABI, FEE_TIERS, ROUTER_ADDRESS_THIS, SWAP_ROUTER02, QUOTER_V2, V3_FACTORY, WETH9,
  buildApproveTx, buildRevokeTx, buildSwapTx, candidateRoutes, clampSlippage, computeMinOut, decodeSwapTx, encodePath, resolvePair, toRawAmount, toTradeExecution,
  type QuotedRoute,
} from '../api/_lib/base-swap.js';
import { BASE_STOCK_SYMBOLS, BASE_SWAP_LIMITS, BASE_SWAP_TOKENS, BASE_USDC, STOCK_COUNTRY_ALLOWLIST, findBaseToken, stockCountryAllowed } from '../src/lib/base-swap/tokens.js';
import { assertApprovalCalldata, assertRevokeCalldata, assertSwapCalldata } from '../src/lib/base-swap/calldata-guard.js';
import { assertExecutionViewConsistent, assertQuoteConsistent } from '../src/lib/base-swap/quote-guard.js';
import { evaluateStockReference } from '../api/_lib/base-swap.js';

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

// --- browser last-mile guard: independently decode every transaction before signing ---
assert.doesNotThrow(() => assertApprovalCalldata(approve, { tokenSymbol: 'USDC', amountRaw: '25000000' }));
assert.throws(
  () => assertApprovalCalldata(approve, { tokenSymbol: 'USDC', amountRaw: '25000001' }),
  /approval amount is not the exact quoted amount/,
);
assert.throws(
  () => assertApprovalCalldata({
    ...approve,
    data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [wallet, 25_000_000n] }),
  }, { tokenSymbol: 'USDC', amountRaw: '25000000' }),
  /approval spender does not match/,
);
assert.throws(
  () => assertApprovalCalldata({ ...approve, to: nvda.address }, { tokenSymbol: 'USDC', amountRaw: '25000000' }),
  /approval token does not match/,
);

const guardedRevoke = buildRevokeTx(usdc.address);
assert.doesNotThrow(() => assertRevokeCalldata(guardedRevoke, { tokenSymbol: 'USDC' }));
assert.throws(
  () => assertRevokeCalldata(approve, { tokenSymbol: 'USDC' }),
  /revoke amount is not zero/,
);

const guardedSwap = buildSwapTx({ tokenIn: usdc, tokenOut: nvda, route: single, amountIn: 25_000_000n, minOut: 39_800n, recipient: wallet, deadline });
const guardedExpectation = {
  tokenInSymbol: 'USDC',
  tokenOutSymbol: 'NVDAc',
  amountInRaw: '25000000',
  minAmountOutRaw: '39800',
  recipient: wallet,
  deadline,
};
assert.doesNotThrow(() => assertSwapCalldata(guardedSwap, guardedExpectation));
assert.throws(
  () => assertSwapCalldata({ ...guardedSwap, to: usdc.address }, guardedExpectation),
  /swap router does not match/,
);
assert.throws(
  () => assertSwapCalldata(guardedSwap, { ...guardedExpectation, recipient: getAddress('0x2222222222222222222222222222222222222222') }),
  /swap recipient does not match/,
);
assert.throws(
  () => assertSwapCalldata(guardedSwap, { ...guardedExpectation, minAmountOutRaw: '39801' }),
  /minimum received does not match/,
);

// --- BP-01: the quote's economics are rebuilt locally from the request and every field must agree ---
{
  const now = deadline - 600;
  const req = { tokenIn: 'USDC', tokenOut: 'NVDAc', amount: '25', slippagePct: 0.5, wallet };
  const consistent = {
    chainId: 8453,
    venue: { name: 'Uniswap V3 (SwapRouter02)', router: SWAP_ROUTER02 },
    tokenIn: { symbol: 'USDC', address: usdc.address, decimals: 6 },
    tokenOut: { symbol: 'NVDAc', address: nvda.address, decimals: 8 },
    amountIn: '25', amountInRaw: '25000000',
    amountOut: '0.0004', amountOutRaw: '40000',
    minAmountOut: '0.000398', minAmountOutRaw: '39800',
    slippagePct: 0.5, deadline, priceImpactPct: 0.3, usdValue: 25, recipient: wallet,
    requiresStockEligibility: true, stockReference: { symbol: 'NVDAc', transferPaused: false, issuerPaused: false, usable: true, status: 'fresh' },
    tx: { deadline, approve: null, swap: { to: SWAP_ROUTER02, data: '0x', value: '0' } }, txWithheld: [],
  };
  const v = assertQuoteConsistent(consistent, req, now);
  assert.deepEqual([v.tokenInSymbol, v.tokenOutSymbol, v.amountInRaw, v.minAmountOutRaw, v.slippageBps, v.deadline, v.recipient],
    ['USDC', 'NVDAc', '25000000', '39800', 50, deadline, wallet.toLowerCase()], 'a consistent quote validates and yields integer units');
  const refuse = (label: string, mutate: (q: any) => void, reqOverride: Partial<typeof req> = {}, re: RegExp = /Quote refused/) => {
    const q = structuredClone(consistent); mutate(q);
    assert.throws(() => assertQuoteConsistent(q, { ...req, ...reqOverride }, now), re, label);
  };
  refuse('displayed input differs from raw units', (q) => { q.amountIn = '2.5'; }, {}, /displayed input differs/);
  refuse('raw input differs from what the user typed', (q) => { q.amountInRaw = '250000000'; }, {}, /not the amount you entered/);
  refuse('displayed output differs from raw', (q) => { q.amountOut = '0.004'; }, {}, /displayed output differs/);
  refuse('displayed minimum differs from raw', (q) => { q.minAmountOut = '0.0004'; }, {}, /displayed minimum differs/);
  refuse('minimum not derived from output and slippage', (q) => { q.minAmountOutRaw = '39801'; q.minAmountOut = '0.00039801'; }, {}, /not derived from the quoted output/);
  refuse('slippage changed by the server', (q) => { q.slippagePct = 1; }, {}, /changed the requested slippage/);
  refuse('slippage the user did not ask for', (q) => {}, { slippagePct: 1 }, /changed the requested slippage/);
  refuse('wrong stock, everything else consistent', (q) => {}, { tokenOut: 'AAPLc' }, /quote output token is NVDAc, you asked for AAPLc/);
  refuse('reversed direction', (q) => {}, { tokenIn: 'NVDAc', tokenOut: 'USDC' }, /quote input token is USDC, you asked for NVDAc/);
  refuse('zero output', (q) => { q.amountOutRaw = '0'; q.amountOut = '0'; q.minAmountOutRaw = '0'; q.minAmountOut = '0'; }, {}, /quote output is zero/);
  refuse('non-canonical raw integer', (q) => { q.amountInRaw = '025000000'; }, {}, /not a canonical integer/);
  refuse('ticket above the local cap', (q) => { q.usdValue = 250; }, {}, /outside the \$1–\$100 limit/);
  refuse('price impact above the local limit', (q) => { q.priceImpactPct = 3.5; }, {}, /price impact is over/);
  refuse('recipient is another wallet', (q) => { q.recipient = '0x2222222222222222222222222222222222222222'; }, {}, /recipient is not the connected wallet/);
  refuse('deadline beyond the local policy', (q) => { q.deadline = now + 3600; q.tx.deadline = now + 3600; }, {}, /deadline exceeds the local policy/);
  refuse('transaction deadline differs from the quote', (q) => { q.tx.deadline = deadline + 1; }, {}, /transaction deadline differs/);
  refuse('router is not the pinned one', (q) => { q.venue.router = usdc.address; }, {}, /names another router/);
  refuse('output token address is not the pinned one', (q) => { q.tokenOut.address = usdc.address; }, {}, /output token address is not the pinned one/);
  refuse('stock reference for another token', (q) => { q.stockReference.symbol = 'AAPLc'; }, {}, /stock reference is for another token/);
  for (const issuerPaused of [true, null, undefined]) {
    refuse('issuer oracle must explicitly be available', (q) => { q.stockReference.issuerPaused = issuerPaused; }, {}, /oracle availability/);
  }
  for (const status of ['stale', 'issuer-paused', 'unusable', undefined]) {
    refuse('only usable reference states are accepted', (q) => { q.stockReference.status = status; }, {}, /not usable/);
  }
  refuse('reference usability must be confirmed', (q) => { q.stockReference.usable = false; }, {}, /not usable/);
  refuse('issuer paused transfers', (q) => { q.stockReference.transferPaused = true; }, {}, /paused transfers/);
  // the normal journey: approval quote → (approval mines) → swap quote, both validated, decoders fed with validated values
  const approvalQuote = { ...structuredClone(consistent), tx: { deadline, approve: { to: usdc.address, data: approve.data, value: '0', spender: SWAP_ROUTER02, amount: '25000000' }, swap: null } };
  const va = assertQuoteConsistent(approvalQuote, req, now);
  assert.doesNotThrow(() => assertApprovalCalldata(approvalQuote.tx.approve, { tokenSymbol: va.tokenInSymbol, amountRaw: va.amountInRaw }));
  const swapQuote = { ...structuredClone(consistent), tx: { deadline, approve: null, swap: guardedSwap } };
  const vs = assertQuoteConsistent(swapQuote, req, now);
  assert.doesNotThrow(() => assertSwapCalldata(guardedSwap, { tokenInSymbol: vs.tokenInSymbol, tokenOutSymbol: vs.tokenOutSymbol, amountInRaw: vs.amountInRaw, minAmountOutRaw: vs.minAmountOutRaw, recipient: vs.recipient, deadline: vs.deadline }));
  console.log('BP-01: quote validator — 1 consistent journey, 20 inconsistent responses refused');

  // Third round (2026-09-05) reopen: the reduced `execution` view SwapConfirm renders must
  // equal the validated quote — an honest full quote with a lying reduced view is refused.
  const serverQuote = { ...structuredClone(consistent), venue: { name: 'Uniswap V3 (SwapRouter02)', router: SWAP_ROUTER02 }, route: { description: 'USDC → NVDAc (0.3%)' }, simulation: { ran: true, ok: true }, tx: { deadline, approve: null, swap: guardedSwap, revoke: null, calldataHash: null } } as any;
  const view = toTradeExecution(serverQuote)!;
  const vv = assertQuoteConsistent(serverQuote, req, now);
  assert.doesNotThrow(() => assertExecutionViewConsistent(view, serverQuote, vv), 'the server-built view of an honest quote is consistent');
  const refuseView = (label: string, mutate: (e: any) => void, re: RegExp) => {
    const e = structuredClone(view); mutate(e);
    assert.throws(() => assertExecutionViewConsistent(e, serverQuote, vv), re, label);
  };
  refuseView('reduced minReceived lies (the K03 reproduction)', (e) => { e.quote.minReceived = '0.001'; }, /execution view differs .*minReceived/);
  refuseView('disclosure minReceived lies (K03b)', (e) => { e.disclosure.minReceived = '0.001'; }, /disclosure\.minReceived/);
  refuseView('reduced minReceivedRaw lies', (e) => { e.quote.minReceivedRaw = '100000'; }, /minReceivedRaw/);
  refuseView('reduced fromAmount lies', (e) => { e.quote.fromAmount = '2.5'; }, /fromAmount/);
  refuseView('reduced fromAmountRaw lies', (e) => { e.quote.fromAmountRaw = '2500000'; }, /fromAmountRaw/);
  refuseView('reduced toAmount lies', (e) => { e.quote.toAmount = '0.004'; }, /toAmount/);
  refuseView('reduced pair lies', (e) => { e.quote.toToken = 'AAPLc'; }, /toToken/);
  refuseView('disclosure deadline lies', (e) => { e.disclosure.deadline = deadline + 600; }, /disclosure\.deadline/);
  refuseView('disclosure router lies', (e) => { e.disclosure.router = usdc.address; }, /disclosure\.router/);
  refuseView('swap target is not the router', (e) => { e.swapTx = { ...e.swapTx, to: usdc.address }; }, /swapTx\.to/);
  refuseView('missing view', (e) => { delete e.quote; }, /missing execution\.quote/);
  console.log('BP-01 (third round): execution view bound to the validated quote — 11 lying views refused');
}

// --- BP-14: one reference validator for quote AND exposure; a fresh timestamp never overrides an issuer pause ---
{
  const ok = { issuerPaused: false, registryMultiplier: '1000000000000000000', multiplier: '1000000000000000000', roundComplete: true, answerPositive: true };
  assert.deepEqual(evaluateStockReference({ ...ok, ageSec: 600 }), { status: 'fresh', usable: true, reason: null }, 'open market');
  const weekend = evaluateStockReference({ ...ok, ageSec: 30 * 3600 });
  assert.equal(weekend.status, 'market-closed'); assert.equal(weekend.usable, true, 'weekend secondary trading stays supported, with a warning');
  const paused = evaluateStockReference({ ...ok, ageSec: 600, issuerPaused: true });
  assert.equal(paused.status, 'issuer-paused'); assert.equal(paused.usable, false, 'a 10-minute-old timestamp does not override a known issuer pause');
  const unknown = evaluateStockReference({ ...ok, ageSec: 600, issuerPaused: null, registryMultiplier: null });
  assert.equal(unknown.status, 'unusable'); assert.equal(unknown.usable, false, 'unknown pause state fails closed');
  assert.equal(evaluateStockReference({ ...ok, ageSec: 600, registryMultiplier: '2000000000000000000' }).usable, false, 'registry/token multiplier disagreement fails closed');
  assert.equal(evaluateStockReference({ ...ok, ageSec: 100 * 3600 }).status, 'stale');
  assert.equal(evaluateStockReference({ ...ok, ageSec: 600, roundComplete: false }).status, 'unusable');
  assert.equal(evaluateStockReference({ ...ok, ageSec: 600, answerPositive: false }).status, 'unusable');
  assert.deepEqual(evaluateStockReference({ ...ok, ageSec: 600 }), evaluateStockReference({ ...ok, ageSec: 600 }), 'resumed feed: same verdict as fresh');
  console.log('BP-14: reference validator — open / weekend / issuer-paused / unknown / mismatch / stale / unusable');
}

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

// --- FIFO lots in chain order: a REBUILD, never a patch ---
{
  const { replayFifo } = await import('../api/_lib/lots.js');
  const lot = (id: string, units: number, entryPrice: number, blockNumber: number, txIndex = 0) => ({ id, units, unitsRemaining: units, entryPrice, blockNumber, txIndex });
  const sell = (id: string, units: number, sellPrice: number, blockNumber: number, txIndex = 0) => ({ id, units, unitsRemaining: units, sellPrice, blockNumber, txIndex });
  // Two 1-unit lots, one 1-unit sell later: only the oldest lot closes.
  const one = replayFifo([lot('a', 1, 100, 10), lot('b', 1, 120, 11)], [sell('s1', 1, 110, 12)]);
  assert.deepEqual(one.closed.map((c) => c.lotId), ['a']);
  assert.equal(one.lots.find((l) => l.id === 'b')!.unitsRemaining, 1, 'the second lot is untouched');
  assert.equal(one.realizations[0].matchedUnits, 1);
  assert.equal(one.realizations[0].outcome, 'win');
  // Partial sell, then the rest: exit is fill-weighted across both sells.
  const part = replayFifo([lot('a', 1, 100, 10)], [sell('s1', 0.4, 130, 11)]);
  assert.equal(part.closed.length, 0);
  assert.equal(Number(part.lots[0].unitsRemaining.toFixed(6)), 0.6);
  const rest = replayFifo([lot('a', 1, 100, 10)], [sell('s1', 0.4, 130, 11), sell('s2', 0.6, 90, 12)]);
  assert.equal(rest.closed.length, 1);
  assert.equal(Number(rest.closed[0].exitPrice.toFixed(4)), Number((0.4 * 130 + 0.6 * 90).toFixed(4)));
  assert.equal(rest.fills.length, 2);
  // Idempotent: rebuilding from the same rows yields the same fills.
  const again = replayFifo(rest.lots, rest.sells);
  assert.deepEqual(again.fills, rest.fills);
  // Over-sell: units beyond the open lots stay unmatched on the sell.
  const over = replayFifo([lot('a', 1, 100, 10), lot('b', 1, 120, 11)], [sell('s1', 3, 100, 12)]);
  assert.equal(over.closed.length, 2);
  assert.equal(over.realizations[0].unmatchedUnits, 1);
  // Chain order, not arrival order: a sell mined BEFORE the lot never consumes it.
  const before = replayFifo([lot('a', 1, 100, 20)], [sell('s0', 1, 110, 10)]);
  assert.equal(before.fills.length, 0);
  assert.equal(before.lots[0].unitsRemaining, 1);
  // Codex's case: buy@10; sell@30 recorded FIRST, sell@20 recorded LATER → the lot belongs to sell@20.
  const first = replayFifo([lot('a', 1, 100, 10)], [sell('s30', 1, 130, 30)]);
  assert.equal(first.realizations[0].matchedUnits, 1, 'alone, sell@30 takes the lot');
  const rebuilt = replayFifo([lot('a', 1, 100, 10)], [sell('s30', 1, 130, 30), sell('s20', 1, 120, 20)]);
  const s20 = rebuilt.realizations.find((r) => r.sellId === 's20')!; const s30 = rebuilt.realizations.find((r) => r.sellId === 's30')!;
  assert.equal(s20.matchedUnits, 1, 'after the rebuild the earlier sell owns the lot');
  assert.equal(s30.matchedUnits, 0, 'and the later sell is unmatched');
  assert.equal(rebuilt.closed[0].exitPrice, 120, 'lot exit is the earlier sell price');
  // Buy, sell, buy again: the old sell never touches the new lot (it is later on-chain).
  const rebuy = replayFifo([lot('x', 1, 100, 10), lot('y', 1, 105, 30)], [sell('s1', 1, 110, 20)]);
  assert.equal(rebuy.lots.find((l) => l.id === 'y')!.unitsRemaining, 1);
  assert.equal(rebuy.lots.find((l) => l.id === 'x')!.unitsRemaining, 0);
}

console.log('base-swap tests passed');
