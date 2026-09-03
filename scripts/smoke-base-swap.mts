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
  assert.ok(q.priceImpactPct !== null && q.priceImpactPct < 1, `${tokenIn}→${tokenOut}: impact ${q.priceImpactPct}`);
  assert.ok(q.stockReference && q.stockReference.usdPrice > 0, `${tokenOut}: missing official stock reference`);
  assert.ok(q.route.kind === 'single', `${tokenOut}: tokenized stock must not route through WETH`);
  console.log(`${tokenIn} ${amount} → ${tokenOut} ${q.amountOut} via ${q.route.description}  impact ${q.priceImpactPct?.toFixed(3)}%  usd ${q.usdValue?.toFixed(2)}  withheld=${JSON.stringify(q.txWithheld)}`);
}

// Ticket cap: fail closed above the limit.
const big = await quoteBaseSwap({ tokenIn: 'USDC', tokenOut: 'NVDAc', amount: '101', recipient: empty, stockEligibilityConfirmed: true });
assert.ok(big.txWithheld.some((w) => w.includes('per-trade limit')), 'ticket cap must withhold calldata');
assert.equal(big.tx, null);
const noEligibility = await quoteBaseSwap({ tokenIn: 'USDC', tokenOut: 'NVDAc', amount: '5', recipient: empty });
assert.ok(noEligibility.txWithheld.some((w) => w.includes('eligibility')), 'stock calldata requires an explicit eligibility confirmation');

if (wallet) {
  const q = await quoteBaseSwap({ tokenIn: 'USDC', tokenOut: 'NVDAc', amount: '5', recipient: wallet, stockEligibilityConfirmed: true });
  console.log('with wallet', { withheld: q.txWithheld, simulation: q.simulation, needsApproval: Boolean(q.tx?.approve), hasSwap: Boolean(q.tx?.swap) });
} else {
  const q = await quoteBaseSwap({ tokenIn: 'USDC', tokenOut: 'NVDAc', amount: '5', recipient: empty, stockEligibilityConfirmed: true });
  assert.ok(q.txWithheld.some((w) => w.includes('holds less')), 'empty wallet must be refused before any approval');
  assert.equal(q.tx, null);
  console.log('empty wallet refused as expected:', q.txWithheld);
}
console.log('base-swap smoke passed');
