// Live smoke against Base mainnet (read-only RPC, no keys, no signing).
// Proves: pinned contracts are the real Uniswap V3 deployment, quotes
// resolve for the allow-listed pairs, and the calldata simulates.
//   npx tsx scripts/smoke-base-swap.mts [wallet]
// With a wallet that holds USDC the swap eth_call runs for real (still
// nothing is sent); without one the balance guard is what gets exercised.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { getAddress } from 'viem';
import { quoteBaseSwap, verifyVenue } from '../api/_lib/base-swap.js';
import { collectStockSignals } from '../api/_lib/stock-signals.js';
import { filterSignals } from '../api/_lib/signals.js';
process.env.BASE_STOCK_SWAPS_ENABLED = process.env.BASE_STOCK_SWAPS_ENABLED ?? 'true';

const wallet = process.argv[2];
// A fresh random address: guaranteed empty (0xdEaD-style burn addresses hold tokens).
const empty = getAddress(`0x${randomBytes(20).toString('hex')}`);
const venue = await verifyVenue();
console.log('venue', venue);
assert.ok(venue.ok, 'pinned router/quoter do not match the canonical factory/WETH9');

const pairs: Array<[string, string, string]> = [
  ['USDC', 'AAPLc', '10'],
  ['USDC', 'GOOGLc', '10'],
  ['USDC', 'METAc', '10'],
  ['USDC', 'NVDAc', '10'],
];
for (const [tokenIn, tokenOut, amount] of pairs) {
  const q = await quoteBaseSwap({ tokenIn, tokenOut, amount });
  assert.ok(Number(q.amountOut) > 0, `${tokenIn}→${tokenOut}: no output`);
  // Impact includes the pool fee: GOOGLc's deepest pool is the 1% tier, so allow fee + 0.5%.
  assert.ok(q.priceImpactPct !== null && q.priceImpactPct < q.route.fees[0] / 10_000 + 0.5, `${tokenIn}→${tokenOut}: impact ${q.priceImpactPct}`);
  assert.ok(q.stockReference && q.stockReference.usdPrice > 0, `${tokenOut}: missing official stock reference`);
  assert.ok(q.route.kind === 'single', `${tokenOut}: tokenized stock must not route through WETH`);
  console.log(`${tokenIn} ${amount} → ${tokenOut} ${q.amountOut} via ${q.route.description}  impact ${q.priceImpactPct?.toFixed(3)}%  usd ${q.usdValue?.toFixed(2)}  withheld=${JSON.stringify(q.txWithheld)}`);
}

// The rail still serves allow-listed crypto (agent bridge and MCP quotes); one pair keeps that path honest.
{
  const q = await quoteBaseSwap({ tokenIn: 'USDC', tokenOut: 'cbBTC', amount: '25' });
  assert.ok(Number(q.amountOut) > 0 && q.priceImpactPct !== null && q.priceImpactPct < 1, 'USDC→cbBTC quote');
  console.log(`USDC 25 → cbBTC ${q.amountOut} via ${q.route.description}  impact ${q.priceImpactPct?.toFixed(3)}%`);
}

// Stock gates: attestation AND edge country, both required for calldata.
{
  const us = await quoteBaseSwap({ tokenIn: 'USDC', tokenOut: 'NVDAc', amount: '20', recipient: empty, stockEligibilityConfirmed: true, country: 'US' });
  assert.ok(us.txWithheld.some((w) => w.includes('US persons')), 'US viewers get no stock calldata');
  assert.equal(us.tx, null);
  const nowhere = await quoteBaseSwap({ tokenIn: 'USDC', tokenOut: 'NVDAc', amount: '20', recipient: empty, stockEligibilityConfirmed: true });
  assert.ok(nowhere.txWithheld.some((w) => w.includes('country unavailable')), 'unknown country gets no stock calldata');
  const ref = await quoteBaseSwap({ tokenIn: 'USDC', tokenOut: 'NVDAc', amount: '20' });
  assert.ok(ref.stockReference && ref.stockReference.transferPaused === false, 'transfer pause flag read');
  const ar = await quoteBaseSwap({ tokenIn: 'USDC', tokenOut: 'NVDAc', amount: '20', recipient: empty, stockEligibilityConfirmed: true, country: 'AR' });
  assert.ok(ar.txWithheld.some((w) => w.includes('not offered in AR')), 'countries outside the allow-list get no stock calldata');
  console.log(`stock gates: US refused, unknown country refused, AR (not allow-listed) refused; NVDAc pausedFeatures=${ref.stockReference!.pausedFeatures} transferPaused=${ref.stockReference!.transferPaused}`);
}

// Kill switch: off by default, off unless exactly 'true'.
{
  const saved = process.env.BASE_STOCK_SWAPS_ENABLED;
  delete process.env.BASE_STOCK_SWAPS_ENABLED;
  const off = await quoteBaseSwap({ tokenIn: 'USDC', tokenOut: 'NVDAc', amount: '20', recipient: empty, stockEligibilityConfirmed: true, country: 'MX' });
  assert.ok(off.txWithheld.some((w) => w.includes('BASE_STOCK_SWAPS_ENABLED')), 'unset flag withholds stock calldata');
  process.env.BASE_STOCK_SWAPS_ENABLED = 'TRUE';
  const typo = await quoteBaseSwap({ tokenIn: 'USDC', tokenOut: 'NVDAc', amount: '20', recipient: empty, stockEligibilityConfirmed: true, country: 'MX' });
  assert.ok(typo.txWithheld.some((w) => w.includes('BASE_STOCK_SWAPS_ENABLED')), 'anything but "true" withholds');
  process.env.BASE_STOCK_SWAPS_ENABLED = saved ?? 'true';
  console.log('kill switch: unset and "TRUE" both withhold; only "true" enables');
}

// The cycle hands the human an INTENT: quote-only, cycle-tagged, no calldata, nothing recorded.
{
  const { prepareBaseIntent } = await import('../api/_lib/dex-execution.js');
  const p = await prepareBaseIntent({ tokenSymbol: 'NVDA', amountUsd: 20, cycleId: '00000000-0000-4000-8000-000000000001' });
  assert.equal(p.ok, true, p.reason);
  assert.equal(p.intent!.tokenOut, 'NVDAc');
  assert.equal(p.intent!.tokenIn, 'USDC');
  assert.ok(Number(p.intent!.preview.amountOut) > 0 && p.intent!.preview.stockReference!.usdPrice > 0);
  assert.ok(!('tx' in p.intent!.preview) && !('execution' in p), 'intent carries no calldata');
  const crypto = await prepareBaseIntent({ tokenSymbol: 'cbBTC', amountUsd: 20, cycleId: '00000000-0000-4000-8000-000000000001' });
  assert.equal(crypto.ok, false, 'agent intents are tokenized stocks only');
  console.log(`intent: NVDA $20 → ≈${p.intent!.preview.amountOut} NVDAc, ref $${p.intent!.preview.stockReference!.usdPrice.toFixed(2)}, cycle-tagged, no calldata`);
}

// Keyless stock signals for the cycle: pools vs Chainlink + underlying momentum.
{
  const raw = await collectStockSignals({ logPrefix: '[smoke]' });
  assert.ok(raw.length >= 1, 'at least one stock signal');
  const filtered = filterSignals(raw);
  console.log(`stock signals: ${raw.length} raw → ${filtered.length} filtered: ${filtered.map((s) => `${s.tokenSymbol} ${s.signalType} score ${s.filterScore} (${s.reasons.join(', ')})`).join(' | ')}`);
}

// Ticket cap: fail closed above the limit.
const big = await quoteBaseSwap({ tokenIn: 'USDC', tokenOut: 'NVDAc', amount: '101', recipient: empty, stockEligibilityConfirmed: true, country: 'MX' });
assert.ok(big.txWithheld.some((w) => w.includes('per-trade limit')), 'ticket cap must withhold calldata');
assert.equal(big.tx, null);
const noEligibility = await quoteBaseSwap({ tokenIn: 'USDC', tokenOut: 'NVDAc', amount: '5', recipient: empty, country: 'MX' });
assert.ok(noEligibility.txWithheld.some((w) => w.includes('eligibility')), 'stock calldata requires an explicit eligibility confirmation');

if (wallet) {
  const q = await quoteBaseSwap({ tokenIn: 'USDC', tokenOut: 'NVDAc', amount: '5', recipient: wallet, stockEligibilityConfirmed: true, country: 'MX' });
  console.log('with wallet', { withheld: q.txWithheld, simulation: q.simulation, needsApproval: Boolean(q.tx?.approve), hasSwap: Boolean(q.tx?.swap) });
} else {
  const q = await quoteBaseSwap({ tokenIn: 'USDC', tokenOut: 'NVDAc', amount: '5', recipient: empty, stockEligibilityConfirmed: true, country: 'MX' });
  assert.ok(q.txWithheld.some((w) => w.includes('holds less')), 'empty wallet must be refused before any approval');
  assert.equal(q.tx, null);
  console.log('empty wallet refused as expected:', q.txWithheld);
}
console.log('base-swap smoke passed');
