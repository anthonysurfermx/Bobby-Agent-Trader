import assert from 'node:assert/strict';
import { Interface } from 'ethers';
import { checkApproveTx, checkSwapTx, DexRefusal, minReceived } from '../api/_lib/dex-allowlist.js';

const chainId = '31337';
const router = '0x1111111111111111111111111111111111111111';
const spender = '0x2222222222222222222222222222222222222222';
const token = '0x3333333333333333333333333333333333333333';
const other = '0x4444444444444444444444444444444444444444';
const erc20 = new Interface(['function approve(address spender, uint256 amount)']);

process.env[`DEX_ALLOWED_ROUTERS_${chainId}`] = router;
process.env[`DEX_ALLOWED_SPENDERS_${chainId}`] = spender;

function refusalCode(run: () => unknown): string | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    assert(error instanceof DexRefusal);
    return error.code;
  }
}

const approvalData = erc20.encodeFunctionData('approve', [spender, 1_000_000n]);
const approval = checkApproveTx(chainId, { tokenAddress: token, spender, data: approvalData }, '1000000');
assert.equal(approval.to.toLowerCase(), token);
assert.equal(approval.spender.toLowerCase(), spender);
assert.equal(refusalCode(() => checkApproveTx(chainId, { tokenAddress: token, spender: other, data: approvalData }, '1000000')), 'spender_not_allowed');
assert.equal(refusalCode(() => checkApproveTx(chainId, { tokenAddress: token, spender, data: approvalData }, '999999')), 'amount_mismatch');

const erc20Swap = checkSwapTx(chainId, { to: router, data: '0x12345678', value: '0' }, token, '1000000');
assert.equal(erc20Swap.to.toLowerCase(), router);
assert.equal(refusalCode(() => checkSwapTx(chainId, { to: router, data: '0x12345678', value: '1' }, token, '1000000')), 'unexpected_value');
assert.equal(refusalCode(() => checkSwapTx(chainId, { to: router, data: '0x12345678', value: '999' }, '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', '1000')), 'value_amount_mismatch');
assert.equal(refusalCode(() => checkSwapTx(chainId, { to: other, data: '0x12345678', value: '0' }, token, '1000000')), 'router_not_allowed');

assert.equal(minReceived('1000000', 0.005), '995000');

delete process.env[`DEX_ALLOWED_ROUTERS_${chainId}`];
delete process.env[`DEX_ALLOWED_SPENDERS_${chainId}`];
assert.equal(refusalCode(() => checkSwapTx(chainId, { to: router, data: '0x12345678', value: '0' }, token, '1000000')), 'dex_not_configured');

console.log('DEX allow-list tests passed');
