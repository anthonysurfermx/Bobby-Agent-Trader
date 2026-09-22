import assert from 'node:assert/strict';
const READS = new Set(['eth_chainId', 'eth_getTransactionCount', 'eth_getCode', 'eth_estimateGas', 'eth_gasPrice', 'eth_getBalance', 'eth_getTransactionReceipt', 'eth_getTransactionByHash', 'eth_getBlockByNumber']);

export function createReadRpc(url, fetcher = fetch, pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  let id = 0;
  return async (method, params = []) => {
    assert(READS.has(method), 'Only read-only RPC methods may be retried');
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const response = await fetcher(url, { method: 'POST', headers: { 'content-type': 'application/json', 'cache-control': 'no-cache' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }), signal: AbortSignal.timeout(15000) });
        assert(response.ok, 'HTTP read failure');
        const payload = await response.json();
        assert(!payload.error && payload.result !== undefined, 'RPC read failure');
        return payload.result;
      } catch {
        if (attempt === 4) throw new Error('Base read unavailable after 5 attempts: ' + method);
        await pause((attempt + 1) * 1000);
      }
    }
  };
}

// A receipt and its transaction body can propagate to different RPC backends
// at different times. Wait only for missing data; never suppress a mismatch.
export async function waitForVisible(rpc, method, params, pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let i = 0; i < 30; i++) {
    const result = await rpc(method, params);
    if (result !== null) return result;
    await pause(2000);
  }
  throw new Error('Base data not visible after polling: ' + method);
}

// Lagging reads may be retried, but a higher nonce means unreviewed activity.
// Both confirmed and pending counts must equal the reviewed nonce before send.
export async function assertCurrentNonce(rpc, address, expected, pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const counts = await Promise.all(['latest', 'pending'].map(tag => rpc('eth_getTransactionCount', [address, tag]).then(value => Number(BigInt(value)))));
    assert(counts.every(count => count <= expected), 'Wallet nonce advanced or transaction pending');
    if (counts.every(count => count === expected)) return;
    if (attempt < 9) await pause(2000);
  }
  throw new Error('Base nonce reads remain behind the verified journal');
}
