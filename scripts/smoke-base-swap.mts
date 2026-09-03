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
  ['USDC', 'cbBTC', '25'],
  ['USDC', 'ETH', '25'],
  ['ETH', 'USDC', '0.01'],
  ['USDC', 'AERO', '25'],
  ['cbBTC', 'USDC', '0.0005'],
];
for (const [tokenIn, tokenOut, amount] of pairs) {
  const q = await quoteBaseSwap({ tokenIn, tokenOut, amount });
  assert.ok(Number(q.amountOut) > 0, `${tokenIn}→${tokenOut}: no output`);
  assert.ok(q.priceImpactPct !== null && q.priceImpactPct < 1, `${tokenIn}→${tokenOut}: impact ${q.priceImpactPct}`);
  console.log(`${tokenIn} ${amount} → ${tokenOut} ${q.amountOut} via ${q.route.description}  impact ${q.priceImpactPct?.toFixed(3)}%  usd ${q.usdValue?.toFixed(2)}  withheld=${JSON.stringify(q.txWithheld)}`);
}

// Tokenized stocks (Coinbase B20): reference price, deviation, country gate.
for (const [tokenIn, tokenOut, amount] of [['USDC', 'NVDA', '20'], ['USDC', 'AAPLc', '20'], ['GOOGL', 'USDC', '0.05']] as const) {
  const q = await quoteBaseSwap({ tokenIn, tokenOut, amount });
  const stock = q.stocks[0];
  assert.ok(stock, 'stock leg expected');
  assert.ok(stock.referencePrice && stock.referencePrice > 0, `${stock.symbol}: Chainlink reference missing`);
  assert.ok(stock.deviationPct !== null && Math.abs(stock.deviationPct) < 3, `${stock.symbol}: deviation ${stock.deviationPct}`);
  console.log(`${tokenIn} ${amount} → ${tokenOut}: ${q.amountOut} ${q.tokenOut.symbol} via ${q.route.description} | ref $${stock.referencePrice!.toFixed(2)} dev ${stock.deviationPct!.toFixed(2)}% feed ${Math.round((stock.referenceAgeSec ?? 0) / 60)}min | withheld=${JSON.stringify(q.txWithheld)} warn=${JSON.stringify(q.warnings)}`);
}
{
  const us = await quoteBaseSwap({ tokenIn: 'USDC', tokenOut: 'NVDAc', amount: '20', recipient: empty, country: 'US' });
  assert.ok(us.txWithheld.some((w) => w.includes('US persons')), 'US viewers get no stock calldata');
  assert.equal(us.tx, null);
  const nowhere = await quoteBaseSwap({ tokenIn: 'USDC', tokenOut: 'NVDAc', amount: '20', recipient: empty });
  assert.ok(nowhere.txWithheld.some((w) => w.includes('country unavailable')), 'unknown country gets no stock calldata');
  const small = await quoteBaseSwap({ tokenIn: 'USDC', tokenOut: 'NVDAc', amount: '2', recipient: empty, country: 'MX' });
  assert.ok(small.txWithheld.some((w) => w.includes('below the $5 minimum')), 'stock minimum ticket');
  console.log('stock gates: US refused, unknown country refused, $5 minimum enforced');
}

// Ticket cap: fail closed above the limit.
const big = await quoteBaseSwap({ tokenIn: 'USDC', tokenOut: 'ETH', amount: '5000', recipient: empty });
assert.ok(big.txWithheld.some((w) => w.includes('per-trade limit')), 'ticket cap must withhold calldata');
assert.equal(big.tx, null);

if (wallet) {
  const q = await quoteBaseSwap({ tokenIn: 'USDC', tokenOut: 'cbBTC', amount: '5', recipient: wallet });
  console.log('with wallet', { withheld: q.txWithheld, simulation: q.simulation, needsApproval: Boolean(q.tx?.approve), hasSwap: Boolean(q.tx?.swap) });
} else {
  const q = await quoteBaseSwap({ tokenIn: 'USDC', tokenOut: 'cbBTC', amount: '5', recipient: empty });
  assert.ok(q.txWithheld.some((w) => w.includes('holds less')), 'empty wallet must be refused before any approval');
  assert.equal(q.tx, null);
  console.log('empty wallet refused as expected:', q.txWithheld);
}
console.log('base-swap smoke passed');
