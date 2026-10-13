import assert from 'node:assert/strict';
import { assertSession, assertMined, DEPLOYER, CHAIN, quantity } from './mobile-deploy-plan.mjs';
import { waitForVisible, assertCurrentNonce } from './mobile-deploy-rpc.mjs';

// Transport injection keeps the same sequencing and verification logic testable
// on a loopback fork. The production entry point supplies WalletConnect only.
export async function executeStep({ plan, raw, index, journal, rpc, send, save, getSession, isHalted, report, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  assert(index < 19 && index === journal.receipts.length && index === journal.attempts.length, 'Unresolved previous attempt; reconcile before retry');
  assertSession(getSession());
  const tx = plan.transactions[index];
  assert.equal(Number(BigInt(await rpc('eth_chainId'))), CHAIN);
  await assertCurrentNonce(rpc, DEPLOYER, tx.nonce, pause);
  if (tx.contractAddress) assert.equal(await rpc('eth_getCode', [tx.contractAddress, 'latest']), '0x', 'Creation address occupied');
  const request = { from: DEPLOYER, chainId: '0x2105', nonce: quantity(tx.nonce), value: '0x0', data: tx.data, ...(tx.to ? { to: tx.to } : {}) };
  const estimate = BigInt(await rpc('eth_estimateGas', [request]));
  const gas = estimate * 130n / 100n;
  assert(gas > 0n && gas <= 12000000n, 'Unexpected gas requirement');
  assert(BigInt(await rpc('eth_gasPrice')) <= 20000000n, 'Gas price exceeds reviewed ceiling');
  request.gas = quantity(gas);
  request.maxFeePerGas = quantity(20000000n);
  request.maxPriorityFeePerGas = quantity(1000000n);
  const reservedGas = journal.attempts.reduce((sum, attempt) => sum + BigInt(attempt.request.gas), 0n);
  assert((reservedGas + gas) * 20000000n <= 1000000000000000n, 'Requested execution fees exceed 0.001 ETH');
  const balance = BigInt(await rpc('eth_getBalance', [DEPLOYER, 'latest']));
  assert(balance > gas * 20000000n + 100000000000000n, 'Insufficient ETH including reserve');
  assertSession(getSession());
  assert(!isHalted(), 'Session changed during preparation');
  journal.attempts.push({ index, nonce: tx.nonce, request, startedAt: new Date().toISOString(), status: 'awaiting-wallet' });
  // Durably record intent before the first request; even a lost wallet response
  // must never cause an automatic resend or an unrecorded retry on restart.
  save();
  report(`Revisa y firma en tu wallet: ${tx.label}. Esperando respuesta del celular.`);
  const hash = await send(request);
  assert(/^0x[0-9a-fA-F]{64}$/.test(hash), 'Invalid wallet transaction hash');
  journal.attempts.at(-1).hash = hash;
  journal.attempts.at(-1).status = 'submitted';
  save();
  report('Esperando recibo en Base: ' + hash);
  let receipt;
  for (let i = 0; i < 120; i++) {
    receipt = await rpc('eth_getTransactionReceipt', [hash]);
    if (receipt) break;
    await pause(2000);
  }
  const live = await waitForVisible(rpc, 'eth_getTransactionByHash', [hash], pause);
  assertMined(tx, receipt, live);
  const block = await waitForVisible(rpc, 'eth_getBlockByNumber', [receipt.blockNumber, false], pause);
  assert.equal(block.hash, receipt.blockHash, 'Receipt is not canonical');
  if (tx.contractAddress) assert.notEqual(await rpc('eth_getCode', [tx.contractAddress, 'latest']), '0x');
  journal.transactions.push({ ...raw.transactions[index], hash });
  journal.receipts.push(receipt);
  journal.attempts.at(-1).status = 'verified';
  save();
  return receipt;
}
