import assert from 'node:assert/strict';

import snapshot from '../api/_lib/verified-calls-canary.json';
import challengeScan from '../api/challenge-scan.ts';
import verifiedCalls, { assembleLedger, readChain, readIndexerLogs, verifyReceipts } from '../api/verified-calls.ts';

function invoke(handler: (req: any, res: any) => Promise<unknown>, req: any = {}) {
  return new Promise<{ status: number; body: any }>((resolve) => {
    const res: any = {
      setHeader() { return this; },
      status(status: number) { this.code = status; return this; },
      json(body: any) { resolve({ status: this.code, body }); return this; },
    };
    void handler(req, res);
  });
}

const state = await readChain();
assert.equal(state.total, 5, 'the Sepolia canary has five commitments');
assert.equal(state.totalTrades, 5, 'each canary commitment has a terminal trade');
await verifyReceipts(snapshot.logs);
const indexedLogs = await readIndexerLogs();
await verifyReceipts(indexedLogs);
assert.equal(assembleLedger(indexedLogs, state).length, state.total, 'the live indexer agrees with contract storage');

const rows = assembleLedger(snapshot.logs, state);
assert.equal(rows.length, 5);
assert(rows.every((row) => row.commitTx && row.resolveTx && !row.challengeable));
assert.equal(rows.filter((row) => row.challengeTx).length, 1);
assert.throws(() => assembleLedger(snapshot.logs.filter((log) => log.transactionHash !== rows[0].commitTx), state), /ledger integrity/);
assert.throws(() => assembleLedger(snapshot.logs.filter((log) => log.transactionHash !== rows[1].resolveTx), state), /ledger integrity/);

const ledger = await invoke(verifiedCalls);
assert.equal(ledger.status, 200);
assert.equal(ledger.body.scorecard.totalCommitments, ledger.body.calls.length);
assert.equal(ledger.body.scorecard.verified.winRateBps, 7500);

const originalFetch = globalThis.fetch;
let hermesRequests = 0;
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input).includes('hermes.pyth.network')) hermesRequests++;
  return originalFetch(input, init);
}) as typeof fetch;
try {
  const oldWin = await invoke(challengeScan, {
    query: { hash: '0x654dd5687b9a0074f20b01cb243a89b0be876ebb461cd4d883a6147f0de5e056', ts: 1787320453 },
  });
  assert.equal(oldWin.status, 200);
  assert.equal(oldWin.body.verdict, 'WINDOW_CLOSED');

  const challenged = await invoke(challengeScan, {
    query: { hash: '0xc6705e6cd1d1b9d68889e0c5d06e6c3ffc36b57bcc2ca41eb7eb0e67b96486af', ts: 1787320453 },
  });
  assert.equal(challenged.status, 200);
  assert.equal(challenged.body.verdict, 'ALREADY_CHALLENGED');
  assert.equal(hermesRequests, 0, 'closed canary calls must not request Hermes');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Verified calls: five complete on-chain proofs, fail-closed replay, expired challenge gate.');
