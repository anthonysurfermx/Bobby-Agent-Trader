// Offline integration: drive the real quote builder with deterministic RPC reads.
// Positive controls prove rejection is caused by the canary, not broken pricing.
import assert from 'node:assert/strict';
import { baseClient, quoteBaseSwap } from '../api/_lib/base-swap.js';
import { getUniswapCompatibleQuote } from '../api/_lib/mcp-uniswap-quote.js';
import { findBaseToken } from '../src/lib/base-swap/tokens.js';

const allowed = '0x1234567890abcdef1234567890abcdef12345678';
const outsider = '0xabcdef1234567890abcdef1234567890abcdef12';
const stock = findBaseToken('NVDAc')!;
const pool = '0x1111111111111111111111111111111111111111';
const now = BigInt(Math.floor(Date.now() / 1000));
let allowance = 100_000_000n;
let paused = false;
let rpcCalls = 0;
// A $100 stock: 5 USDC buys 0.05 tokens (8 decimals). Both raw units
// have a 1:1 ratio, so sqrtPriceX96 = 2^96 gives the same $100 reference.
const client = baseClient();
const originals = { multicall: client.multicall, call: client.call, simulateContract: client.simulateContract };
const envNames = ['BASE_STOCK_SWAPS_ENABLED', 'BASE_STOCK_SWAP_CANARY_WALLETS', 'BASE_SWAP_MAX_TICKET_USD', 'BASE_SWAP_MAX_SELL_USD'] as const;
const savedEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
Object.assign(client, {
  multicall: async ({ contracts, allowFailure }: { contracts: Array<{ functionName: string; address: string; args?: unknown[] }>; allowFailure: boolean }) => {
    rpcCalls++;
    return contracts.map((contract) => {
      let result: unknown;
      switch (contract.functionName) {
        case 'quoteExactInputSingle': result = [(contract.args![0] as { amountIn: bigint }).amountIn, 0n, 0, 100_000n]; break;
        case 'quoteExactInput': result = [contract.args![1], [], [], 100_000n]; break;
        case 'getPool': result = pool; break;
        case 'slot0': result = [2n ** 96n, 0, 0, 0, 0, 0, true]; break;
        case 'symbol': result = stock.symbol; break;
        case 'decimals': result = 8; break;
        case 'totalSupply': result = 1_000_000_000n; break;
        case 'multiplier': result = 10n ** 18n; break;
        case 'latestRoundData': result = [1n, 100n * 10n ** 8n, now, now, 1n]; break;
        case 'pausedFeatures': result = 0n; break;
        case 'isPaused': result = false; break;
        case 'getOracleParams': result = [10n ** 18n, paused]; break;
        case 'balanceOf': result = 1_000_000_000n; break;
        case 'allowance': result = allowance; break;
        default: throw new Error(`Unexpected RPC read ${contract.functionName}`);
      }
      return allowFailure ? { status: 'success', result } : result;
    });
  },
  call: async () => ({ data: `0x${'1'.padStart(64, '0')}` }),
  simulateContract: async () => ({ result: true }),
});

const input = { tokenIn: 'USDC', tokenOut: 'NVDAc', amount: '5', recipient: allowed, country: 'MX', stockEligibilityConfirmed: true };
async function rejected(overrides: Partial<typeof input>, reason: RegExp) {
  const quote = await quoteBaseSwap({ ...input, ...overrides });
  assert.equal(quote.tx, null, 'withhold the entire bundle, including approval and revoke');
  assert(quote.txWithheld.some((message) => reason.test(message)), quote.txWithheld.join('; '));
}
try {
  process.env.BASE_STOCK_SWAPS_ENABLED = 'true';
  process.env.BASE_STOCK_SWAP_CANARY_WALLETS = allowed;
  process.env.BASE_SWAP_MAX_TICKET_USD = '5';
  const pass = await quoteBaseSwap(input);
  assert.deepEqual(pass.txWithheld, []);
  assert(pass.tx?.swap, 'allowed wallet gets a simulated swap');
  await rejected({ recipient: outsider }, /limited to launch canary/);
  allowance = 0n;
  await rejected({ recipient: outsider }, /limited to launch canary/);
  const approval = await quoteBaseSwap(input);
  assert(approval.tx?.approve, 'allowed wallet can approve an exact amount');
  assert.equal(approval.tx.swap, null, 'approval still requires a subsequent quote');
  for (const value of ['', ' ', '*', `${allowed},bad`, `${allowed},`]) {
    process.env.BASE_STOCK_SWAP_CANARY_WALLETS = value;
    await rejected({}, /configuration is invalid/);
  }
  process.env.BASE_STOCK_SWAP_CANARY_WALLETS = allowed;
  process.env.BASE_STOCK_SWAPS_ENABLED = 'false';
  await rejected({}, /swaps are disabled/);
  process.env.BASE_STOCK_SWAPS_ENABLED = 'true';
  await rejected({ country: 'US' }, /not available to US/);
  await rejected({ country: '' }, /country unavailable/);
  await rejected({ stockEligibilityConfirmed: false }, /confirm tokenized-stock eligibility/);
  await rejected({ amount: '6' }, /per-trade limit/);
  paused = true;
  await rejected({}, /issuer feed is frozen/);
  paused = false;
  // Both directions pass through the same restriction.
  await rejected({ tokenIn: 'NVDAc', tokenOut: 'USDC', amount: '0.05', recipient: outsider }, /limited to launch canary/);
  delete process.env.BASE_STOCK_SWAP_CANARY_WALLETS;
  allowance = 100_000_000n;
  const publicQuote = await quoteBaseSwap({ ...input, recipient: outsider });
  assert.deepEqual(publicQuote.txWithheld, []);
  assert(publicQuote.tx?.swap, 'removing the variable restores the public path');
  process.env.BASE_STOCK_SWAP_CANARY_WALLETS = allowed;
  const sell = await quoteBaseSwap({ ...input, tokenIn: 'NVDAc', tokenOut: 'USDC', amount: '0.05' });
  assert.deepEqual(sell.txWithheld, []);
  assert(sell.tx?.swap, 'allowed wallet can sell within the same cap');

  // Audit 2026-09-28 P1: under the $1–$1 canary a sale had to come to exactly
  // 1.000000 USDC — 0.00999999 NVDAc quoted $0.999999 (below the minimum) and
  // one unit more quoted $1.000001 (above the maximum): nothing could be sold.
  process.env.BASE_SWAP_MAX_TICKET_USD = '1';
  const canaryBuy = await quoteBaseSwap({ ...input, amount: '1' });
  assert.equal(canaryBuy.side, 'buy');
  assert.deepEqual(canaryBuy.txWithheld, [], 'the $1 canary buy still passes');
  await rejected({ amount: '1.01' }, /per-trade limit/);
  await rejected({ amount: '0.99' }, /below the \$1 minimum/);
  for (const amount of ['0.00999999', '0.01000001', '0.00001']) { // $0.999999, $1.000001, $0.001 of dust
    const sale = await quoteBaseSwap({ ...input, tokenIn: 'NVDAc', tokenOut: 'USDC', amount });
    assert.equal(sale.side, 'sell');
    assert.deepEqual(sale.txWithheld, [], `a sale of ${amount} NVDAc ($${sale.usdValue}) is not blocked by the entry limits`);
    assert(sale.tx?.swap, `a sale of ${amount} NVDAc gets calldata`);
  }
  // The sale cap is 2 × the entry cap by default …
  const pastSaleCap = await quoteBaseSwap({ ...input, tokenIn: 'NVDAc', tokenOut: 'USDC', amount: '0.0201' });
  assert.equal(pastSaleCap.limits.maxSellUsd, 2);
  assert.equal(pastSaleCap.tx, null);
  assert(pastSaleCap.txWithheld.some((m) => /above the \$2 per-sale limit; sell it in smaller parts/.test(m)), pastSaleCap.txWithheld.join('; '));
  // … ops may set it directly …
  process.env.BASE_SWAP_MAX_SELL_USD = '50';
  const opsSale = await quoteBaseSwap({ ...input, tokenIn: 'NVDAc', tokenOut: 'USDC', amount: '0.4' });
  assert.deepEqual(opsSale.txWithheld, [], 'a $40 sale under a $50 sale cap');
  // … but never above the code cap ($100 for B20), and the entry cap is untouched by it.
  process.env.BASE_SWAP_MAX_SELL_USD = '1000';
  const overCode = await quoteBaseSwap({ ...input, tokenIn: 'NVDAc', tokenOut: 'USDC', amount: '1.5' });
  assert.equal(overCode.limits.maxSellUsd, 100);
  assert(overCode.txWithheld.some((m) => /per-sale limit/.test(m)));
  await rejected({ amount: '2' }, /per-trade limit/);
  delete process.env.BASE_SWAP_MAX_SELL_USD;

  // Audit 2026-09-28 P2: the MCP quote carries the verdict the swap endpoint would give.
  const mcpOver = await getUniswapCompatibleQuote({ tokenIn: 'USDC', tokenOut: 'NVDAc', amount: '10' });
  assert.equal(mcpOver.executable, false, 'a $10 quote under the $1 cap is not executable');
  assert((mcpOver.txWithheld as string[]).some((m) => /per-trade limit/.test(m)));
  assert((mcpOver.txWithheld as string[]).some((m) => /launch allow-list/.test(m)), 'the allow-list is disclosed, never its members');
  assert(!JSON.stringify(mcpOver).includes(allowed), 'no allow-listed wallet leaks');
  assert.equal((mcpOver.limits as { maxTicketUsd: number }).maxTicketUsd, 1);
  process.env.BASE_STOCK_SWAPS_ENABLED = 'false';
  const mcpOff = await getUniswapCompatibleQuote({ tokenIn: 'USDC', tokenOut: 'NVDAc', amount: '1' });
  assert.equal(mcpOff.executable, false);
  assert((mcpOff.txWithheld as string[]).some((m) => /disabled/.test(m)), 'the master switch is part of the verdict');
  process.env.BASE_STOCK_SWAPS_ENABLED = 'true';
  delete process.env.BASE_STOCK_SWAP_CANARY_WALLETS;
  const mcpOk = await getUniswapCompatibleQuote({ tokenIn: 'USDC', tokenOut: 'NVDAc', amount: '1' });
  assert.equal(mcpOk.executable, true, 'public, inside the limits');
  assert.match(String(mcpOk.execution), /stock eligibility attestation/);
  process.env.BASE_SWAP_MAX_TICKET_USD = '5';
  process.env.BASE_STOCK_SWAP_CANARY_WALLETS = '';
  const nonStock = await quoteBaseSwap({ ...input, tokenOut: 'cbBTC', recipient: outsider });
  assert.deepEqual(nonStock.txWithheld, []);
  assert(nonStock.tx?.swap, 'stock canary does not change non-stock execution');
  const publicRead = await quoteBaseSwap({ tokenIn: 'USDC', tokenOut: 'NVDAc', amount: '5' });
  assert.equal(publicRead.tx, null, 'anonymous quotes never issue calldata');
  assert.deepEqual(publicRead.txWithheld, [], 'read-only quotes remain visible with a deny-all canary');
  assert(rpcCalls > 0);
  console.log('stock swap canary: allowed approval/swap, denied bundle, malformed config, additive gates, both directions, closable canary positions, MCP executability and public rollout passed');
} finally {
  Object.assign(client, originals);
  for (const name of envNames) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
}
