import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reconcileJournal } from './lib/mobile-deploy-recovery.mjs';
const dir = process.argv[2];
const packet = JSON.parse(readFileSync(dir + '/packet.json', 'utf8'));
const saved = JSON.parse(readFileSync(dir + '/mobile-broadcast.json', 'utf8'));
const evidence = JSON.parse(readFileSync(dir + '/first-live-receipt.json', 'utf8'));
const values = {
  eth_chainId: '0x2105', eth_getTransactionReceipt: evidence.receipt,
  eth_getTransactionByHash: evidence.transaction,
  eth_getBlockByNumber: { hash: evidence.receipt.blockHash },
  eth_getCode: '0x01', eth_getTransactionCount: '0x36',
};
const rpc = overrides => async method => { assert(method in values, 'Only expected reads permitted'); return structuredClone(method in overrides ? overrides[method] : values[method]); };
const before = JSON.stringify(saved);
const recovered = await reconcileJournal(packet.plan, packet.raw, saved, rpc({}));
assert.equal(recovered.receipts.length, 1);
assert.equal(recovered.attempts[0].status, 'verified');
assert.equal(JSON.stringify(saved), before, 'Input journal must not mutate');
let count = 1;
for (const change of [
  j => { delete j.attempts[0].hash; },
  j => { j.attempts[0].index = 1; },
  j => { j.attempts[0].request.data += '00'; },
  j => { j.attempts[0].request.value = '0x1'; },
  j => { j.planSha256 = 'wrong'; },
  j => { j.receipts = [evidence.receipt, evidence.receipt]; },
]) {
  const j = structuredClone(saved); change(j);
  await assert.rejects(() => reconcileJournal(packet.plan, packet.raw, j, rpc({}))); count++;
}
for (const overrides of [
  { eth_chainId: '0x1' }, { eth_getTransactionReceipt: null },
  { eth_getTransactionReceipt: { ...evidence.receipt, status: '0x0' } },
  { eth_getTransactionByHash: { ...evidence.transaction, input: '0x00' } },
  { eth_getBlockByNumber: { hash: '0x00' } }, { eth_getCode: '0x' },
  { eth_getTransactionCount: '0x37' },
]) {
  await assert.rejects(() => reconcileJournal(packet.plan, packet.raw, saved, rpc(overrides))); count++;
}
console.log(`Recovery: ${count} checks passed against the observed receipt; no transaction sending API used.`);
