import { Interface, formatEther } from 'ethers';

export const XLAYER_RPC_URL = 'https://rpc.xlayer.tech';
export const XLAYER_CHAIN_ID = 196;
export const BOBBY_AGENT_ECONOMY = '0xD9540D770C8aF67e9E6412C92D78E34bc11ED871'; // V2 — replay-resistant with challengeId
export const PREMIUM_MCP_FEE_WEI = 1000000000000000n; // 0.001 OKB

const ECONOMY_INTERFACE = new Interface([
  'function payMCPCall(bytes32 challengeId, string toolName) payable',
  'function getEconomyStats() view returns (uint256,uint256,uint256,uint256,uint256)',
  'function getStats() view returns (uint256,uint256,uint256)',
]);

export interface VerifiedMcpPayment {
  txHash: string;
  payer: string;
  to: string;
  challengeId: string;
  toolName: string;
  valueWei: string;
  valueOkb: string;
  blockNumber: number;
}

interface RpcEnvelope<T> {
  result?: T;
  error?: { code?: number; message?: string };
}

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(XLAYER_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });

  if (!res.ok) {
    throw new Error(`X Layer RPC ${res.status}`);
  }

  const json = await res.json() as RpcEnvelope<T>;
  if (json.error) {
    throw new Error(json.error.message || 'X Layer RPC error');
  }
  if (json.result == null) {
    throw new Error('X Layer RPC returned no result');
  }

  return json.result;
}

export function extractPaymentTxHash(rawHeader: string | string[] | undefined): string | null {
  if (!rawHeader) return null;
  const raw = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  const match = raw.match(/0x[a-fA-F0-9]{64}/);
  return match ? match[0] : null;
}

export async function verifyMcpPaymentTx(
  txHash: string,
  expectedToolName: string,
): Promise<VerifiedMcpPayment> {
  const receipt = await rpcCall<any>('eth_getTransactionReceipt', [txHash]);
  if (!receipt || receipt.status !== '0x1') {
    throw new Error('Payment tx failed or is not confirmed yet');
  }

  const tx = await rpcCall<any>('eth_getTransactionByHash', [txHash]);
  if (!tx) {
    throw new Error('Payment tx not found');
  }

  const to = String(tx.to || '').toLowerCase();
  if (to !== BOBBY_AGENT_ECONOMY.toLowerCase()) {
    throw new Error('Payment tx must call BobbyAgentEconomy on X Layer');
  }

  const valueWei = BigInt(tx.value || '0x0');
  if (valueWei < PREMIUM_MCP_FEE_WEI) {
    throw new Error('Payment tx value is below Bobby MCP premium fee');
  }

  const parsed = ECONOMY_INTERFACE.parseTransaction({
    data: String(tx.input || '0x'),
    value: valueWei,
  });

  if (!parsed || parsed.name !== 'payMCPCall') {
    throw new Error('Payment tx is not a payMCPCall invocation');
  }

  // V2: args[0] = challengeId (bytes32), args[1] = toolName (string)
  const challengeId = String(parsed.args?.[0] || '');
  const toolName = String(parsed.args?.[1] || '');
  if (toolName !== expectedToolName) {
    throw new Error(`Payment tx tool mismatch: expected ${expectedToolName}, got ${toolName || 'unknown'}`);
  }

  return {
    txHash,
    payer: String(tx.from || '').toLowerCase(),
    to,
    challengeId,
    toolName,
    valueWei: valueWei.toString(),
    valueOkb: formatEther(valueWei),
    blockNumber: Number.parseInt(String(receipt.blockNumber || '0x0'), 16) || 0,
  };
}

export async function getEconomyStats(): Promise<{
  totalDebates: string;
  totalMcpCalls: string;
  totalSignalAccesses: string;
  totalVolumeWei: string;
  totalVolumeOkb: string;
  totalPayments: string;
}> {
  const data = ECONOMY_INTERFACE.encodeFunctionData('getEconomyStats');
  const result = await rpcCall<string>('eth_call', [{ to: BOBBY_AGENT_ECONOMY, data }, 'latest']);
  const decoded = ECONOMY_INTERFACE.decodeFunctionResult('getEconomyStats', result);

  const totalVolumeWei = decoded[3].toString();
  return {
    totalDebates: decoded[0].toString(),
    totalMcpCalls: decoded[1].toString(),
    totalSignalAccesses: decoded[2].toString(),
    totalVolumeWei,
    totalVolumeOkb: formatEther(decoded[3]),
    totalPayments: decoded[4].toString(),
  };
}
