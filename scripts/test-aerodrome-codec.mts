import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Interface } from 'ethers';
import {
  AERODROME_BASE, AERODROME_REVIEW_STOCKS, encodeAerodromeSwap, encodeAerodromeApproval,
  assertAerodromeSwap, assertAerodromeApproval, type AerodromeIntent,
} from '../src/lib/base-swap/aerodrome-codec.js';
import { BASE_USDC, BASE_SWAP_ROUTER02, BASE_STOCK_SYMBOLS, findBaseToken } from '../src/lib/base-swap/tokens.js';

// Independent ABI encoder/decoder. These are offline fixtures; no wallet or RPC.
const router = new Interface([
  'function exactInputSingle((address tokenIn,address tokenOut,int24 tickSpacing,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)',
]);
const erc20 = new Interface(['function approve(address,uint256) returns (bool)']);
const now = 1_788_621_000;
const intent: AerodromeIntent = { chainId: 8453, tokenInSymbol: 'USDC', tokenOutSymbol: 'AMZNc',
  amountInRaw: '10000000', minAmountOutRaw: '4000000',
  recipient: '0x1111111111111111111111111111111111111111', deadline: now + 1200 };

for (const [symbol, address] of Object.entries(AERODROME_REVIEW_STOCKS)) {
  for (const buy of [true, false]) {
    test(`${symbol} ${buy ? 'buy' : 'sell'}: independent ABI and exact approval/revoke`, () => {
      const input = { ...intent, tokenInSymbol: buy ? 'USDC' : symbol, tokenOutSymbol: buy ? symbol : 'USDC' };
      const tx = encodeAerodromeSwap(input, now);
      const expectedData = router.encodeFunctionData('exactInputSingle', [[
        buy ? BASE_USDC : address, buy ? address : BASE_USDC, 10, input.recipient,
        input.deadline, input.amountInRaw, input.minAmountOutRaw, 0,
      ]]);
      assert.equal(tx.data, expectedData);
      assert.equal((tx.data.length - 2) / 2, 260, 'Eight static arguments, no multicall wrapper');
      const [decoded] = router.decodeFunctionData('exactInputSingle', tx.data);
      assert.equal(decoded.deadline, BigInt(input.deadline));
      assert.equal(decoded.tickSpacing, 10n);
      assertAerodromeSwap(tx, input, now);
      for (const revoke of [true, false]) {
        const approval = encodeAerodromeApproval(input, now, revoke);
        assert.equal(approval.to, buy ? BASE_USDC : address);
        assert.equal(approval.data, erc20.encodeFunctionData('approve', [AERODROME_BASE.router, revoke ? '0' : input.amountInRaw]));
        assertAerodromeApproval(approval, input, now, revoke);
      }
    });
  }
}

test('review identities match catalog and remain absent from executable clients', () => {
  const catalog = JSON.parse(readFileSync(new URL('../src/lib/base-swap/stock-candidates.json', import.meta.url), 'utf8'));
  assert.equal(BASE_STOCK_SYMBOLS.length, 5);
  for (const [symbol, address] of Object.entries(AERODROME_REVIEW_STOCKS)) {
    const stock = catalog.tokens.find((t: { symbol: string }) => t.symbol === symbol);
    assert.equal(stock.address, address);
    assert.equal(stock.chainId, AERODROME_BASE.chainId);
    assert.equal(stock.admissionStatus, 'pending-review');
    assert.equal(findBaseToken(symbol), null);
    assert.equal(findBaseToken(address), null);
  }
});

test('reject wrong chain, unsupported pairs, empty amounts and invalid deadlines', () => {
  const changes: Partial<AerodromeIntent>[] = [
    { chainId: 1 }, { tokenOutSymbol: 'MSFTc' }, { tokenOutSymbol: 'PYPLon' },
    { tokenOutSymbol: 'toString' }, { tokenInSymbol: 'AMZNc', tokenOutSymbol: 'TSLAc' },
    { tokenOutSymbol: 'USDC' }, { amountInRaw: '0' }, { amountInRaw: '-1' },
    { amountInRaw: '1e6' }, { amountInRaw: String(1n << 256n) }, { minAmountOutRaw: '0' },
    { recipient: '0x0000000000000000000000000000000000000000' },
    { deadline: now + 15 }, { deadline: now + 1201 }, { deadline: NaN },
  ];
  for (const change of changes) {
    assert.throws(() => encodeAerodromeSwap({ ...intent, ...change }, now), /refused/);
    assert.throws(() => encodeAerodromeApproval({ ...intent, ...change }, now), /refused/);
  }
  assert.throws(() => encodeAerodromeSwap(intent, NaN), /refused/);
});

test('reject mismatched destination, native value and noncanonical calldata', () => {
  const tx = encodeAerodromeSwap(intent, now);
  for (const change of [{ to: BASE_SWAP_ROUTER02 }, { chainId: 1 }, { value: '1' },
    { data: tx.data + '00' }, { data: tx.data.slice(0, -2) }, { data: '0x' }]) {
    assert.throws(() => assertAerodromeSwap({ ...tx, ...change }, intent, now), /refused/);
  }
  for (const change of [{ amountInRaw: '10000001' }, { minAmountOutRaw: '3999999' },
    { recipient: '0x2222222222222222222222222222222222222222' }, { deadline: now + 1199 }]) {
    assert.throws(() => assertAerodromeSwap(encodeAerodromeSwap({ ...intent, ...change }, now), intent, now), /refused/);
  }
  assert.throws(() => assertAerodromeSwap(tx, intent, now + 1200), /refused/);
  const wrongSpacing = router.encodeFunctionData('exactInputSingle', [[BASE_USDC, AERODROME_REVIEW_STOCKS.AMZNc,
    200, intent.recipient, intent.deadline, intent.amountInRaw, intent.minAmountOutRaw, 0]]);
  assert.throws(() => assertAerodromeSwap({ ...tx, data: wrongSpacing }, intent, now), /refused/);
});

test('approval requires exact amount, correct spender, token and direction', () => {
  const tx = encodeAerodromeApproval(intent, now);
  for (const data of [erc20.encodeFunctionData('approve', [BASE_SWAP_ROUTER02, intent.amountInRaw]),
    erc20.encodeFunctionData('approve', [AERODROME_BASE.router, (1n << 256n) - 1n]), tx.data + '00']) {
    assert.throws(() => assertAerodromeApproval({ ...tx, data }, intent, now), /refused/);
  }
  assert.throws(() => assertAerodromeApproval({ ...tx, to: AERODROME_REVIEW_STOCKS.AMZNc }, intent, now), /refused/);
  assert.throws(() => assertAerodromeApproval(tx, intent, now, true), /refused/);
  assert.throws(() => assertAerodromeApproval(encodeAerodromeApproval(intent, now, true), intent, now), /refused/);
});
