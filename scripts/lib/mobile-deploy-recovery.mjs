import assert from 'node:assert/strict';
import { assertMined, digest, DEPLOYER, CHAIN } from './mobile-deploy-plan.mjs';

// Read-only reconciliation of an explicitly selected journal. A missing hash,
// pending/reverted transaction, gap, or changed input can never be skipped.
export async function reconcileJournal(plan, raw, saved, rpc) {
  assert.equal(saved.planSha256, digest(plan), 'Journal belongs to another plan');
  assert(Array.isArray(saved.attempts) && Array.isArray(saved.receipts) && Array.isArray(saved.transactions));
  assert(saved.attempts.length > 0 && saved.attempts.length <= plan.transactions.length);
  assert(saved.receipts.length <= saved.attempts.length && saved.transactions.length <= saved.attempts.length, 'Inconsistent journal lengths');
  assert.equal(Number(BigInt(await rpc('eth_chainId'))), CHAIN);
  const result = structuredClone(saved);
  result.transactions = [];
  result.receipts = [];
  for (let i = 0; i < result.attempts.length; i++) {
    const attempt = result.attempts[i];
    const expected = plan.transactions[i];
    assert.equal(attempt.index, i, 'Journal has a gap or duplicate');
    assert.equal(attempt.nonce, expected.nonce);
    assert(/^0x[0-9a-fA-F]{64}$/.test(attempt.hash || ''), 'Uncertain submission without hash: manual investigation required');
    const request = attempt.request;
    assert.equal(request.from.toLowerCase(), DEPLOYER.toLowerCase());
    assert.equal(Number(BigInt(request.chainId)), CHAIN);
    assert.equal(Number(BigInt(request.nonce)), expected.nonce);
    assert.equal(BigInt(request.value), 0n);
    assert.equal(request.data.toLowerCase(), expected.data.toLowerCase());
    assert.equal((request.to || '').toLowerCase(), (expected.to || '').toLowerCase());
    assert(BigInt(request.gas) > 0n && BigInt(request.gas) <= 12000000n);
    assert.equal(BigInt(request.maxFeePerGas), 20000000n);
    assert.equal(BigInt(request.maxPriorityFeePerGas), 1000000n);
    const receipt = await rpc('eth_getTransactionReceipt', [attempt.hash]);
    const live = await rpc('eth_getTransactionByHash', [attempt.hash]);
    assertMined(expected, receipt, live);
    const block = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
    assert.equal(block.hash, receipt.blockHash, 'Receipt is no longer canonical');
    if (expected.contractAddress) assert.notEqual(await rpc('eth_getCode', [expected.contractAddress, 'latest']), '0x');
    result.transactions.push({ ...raw.transactions[i], hash: attempt.hash });
    result.receipts.push(receipt);
    attempt.status = 'verified';
  }
  const expectedNonce = plan.startNonce + result.receipts.length;
  for (const tag of ['latest', 'pending']) {
    assert.equal(Number(BigInt(await rpc('eth_getTransactionCount', [DEPLOYER, tag]))), expectedNonce, 'Other wallet activity or pending transaction: stop');
  }
  result.reconciledAt = new Date().toISOString();
  return result;
}
