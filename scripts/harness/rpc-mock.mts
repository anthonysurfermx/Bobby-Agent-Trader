// Audit3 BP-08 — JSON-RPC mock that mints confirmed payMCPCall transactions.
import { Interface } from 'ethers';

export const ECONOMY = new Interface([
  'function payMCPCall(bytes32 challengeId, string toolName) payable',
  'function mcpCallFee() view returns (uint256)',
]);

export interface MintedTx { hash: string; challengeId: string; tool: string; payer: string; value: bigint }

export function uuidToBytes32(uuid: string): string {
  // the only thing a real client can do with the uuid the 402 hands it: 16 bytes, left-aligned, zero-padded
  return `0x${uuid.replace(/-/g, '').toLowerCase()}${'0'.repeat(32)}`;
}

export function createRpcMock(economy: string, feeWei: bigint) {
  const txs = new Map<string, MintedTx>();
  let n = 0;
  return {
    txs,
    mint(challengeId: string, tool: string, payer: string, value = feeWei): MintedTx {
      n += 1;
      const hash = `0x${(n).toString(16).padStart(64, 'a')}`;
      const tx = { hash, challengeId, tool, payer: payer.toLowerCase(), value };
      txs.set(hash, tx);
      return tx;
    },
    handle(body: { method: string; params: unknown[] }): Response {
      const ok = (result: unknown) => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (body.method === 'eth_call') return ok(ECONOMY.encodeFunctionResult('mcpCallFee', [feeWei]));
      if (body.method === 'eth_getTransactionReceipt') {
        const tx = txs.get(String(body.params[0]).toLowerCase());
        return ok(tx ? { status: '0x1', blockNumber: '0x10', transactionHash: tx.hash } : null);
      }
      if (body.method === 'eth_getTransactionByHash') {
        const tx = txs.get(String(body.params[0]).toLowerCase());
        return ok(tx ? { hash: tx.hash, to: economy, from: tx.payer, value: `0x${tx.value.toString(16)}`, input: ECONOMY.encodeFunctionData('payMCPCall', [tx.challengeId, tx.tool]) } : null);
      }
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: `mock: ${body.method}` } }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  };
}
