import { Interface, formatEther } from 'ethers';

export const XLAYER_RPC_URL = 'https://rpc.xlayer.tech';
export const XLAYER_CHAIN_ID = 196;
export const BOBBY_AGENT_ECONOMY = '0xD9540D770C8aF67e9E6412C92D78E34bc11ED871'; // V2 — replay-resistant with challengeId
export const BOBBY_ADVERSARIAL_BOUNTIES = '0xa8005ab465a0e02cb14824cd0e7630391fba673d'; // Day 6 — pay-to-challenge debates
export const PREMIUM_MCP_FEE_WEI = 1000000000000000n; // 0.001 OKB

const ECONOMY_INTERFACE = new Interface([
  'function payMCPCall(bytes32 challengeId, string toolName) payable',
  'function getEconomyStats() view returns (uint256,uint256,uint256,uint256,uint256)',
  'function getStats() view returns (uint256,uint256,uint256)',
]);

const BOUNTIES_INTERFACE = new Interface([
  'function postBounty(string threadId, uint8 dimension, uint32 claimWindowSecs) payable returns (uint256)',
  'function submitChallenge(uint256 bountyId, bytes32 evidenceHash)',
  'function withdraw()',
  'function withdrawBounty(uint256 bountyId)',
  'function nextBountyId() view returns (uint256)',
  'function minBounty() view returns (uint96)',
  'function challengeCount(uint256 bountyId) view returns (uint256)',
  'function bounties(uint256 bountyId) view returns (bytes32 threadHash, address poster, uint96 reward, address winner, uint64 createdAt, uint32 claimWindowSecs, uint8 dimension, uint8 status, uint16 challengeCount, uint32 gracePeriodSnapshot)',
  'function pendingWithdrawals(address) view returns (uint256)',
]);

const DIMENSION_NAMES = [
  'DATA_INTEGRITY',
  'ADVERSARIAL_QUALITY',
  'DECISION_LOGIC',
  'RISK_MANAGEMENT',
  'CALIBRATION_ALIGNMENT',
  'NOVELTY',
] as const;

const BOUNTY_STATUS_NAMES = ['OPEN', 'CHALLENGED', 'RESOLVED', 'WITHDRAWN'] as const;

export interface BountySummary {
  bountyId: string;
  threadHash: string;
  poster: string;
  rewardWei: string;
  rewardOkb: string;
  winner: string;
  createdAt: number;
  claimWindowSecs: number;
  effectiveExpiry: number;
  dimension: string;
  status: string;
  challengeCount: number;
}

function parseDimensionInput(dim: string | number | undefined): number {
  if (typeof dim === 'number') {
    if (dim < 0 || dim > 5) throw new Error('Dimension out of range');
    return dim;
  }
  const key = String(dim || '').toUpperCase();
  const idx = DIMENSION_NAMES.indexOf(key as (typeof DIMENSION_NAMES)[number]);
  if (idx < 0) throw new Error(`Unknown dimension: ${dim}`);
  return idx;
}

export async function readBounty(bountyId: number | string): Promise<BountySummary> {
  const id = BigInt(bountyId);
  const data = BOUNTIES_INTERFACE.encodeFunctionData('bounties', [id]);
  const raw = await rpcCall<string>('eth_call', [{ to: BOBBY_ADVERSARIAL_BOUNTIES, data }, 'latest']);
  const d = BOUNTIES_INTERFACE.decodeFunctionResult('bounties', raw);

  const poster = String(d[1]);
  if (poster === '0x0000000000000000000000000000000000000000') {
    throw new Error(`Bounty ${bountyId} not found`);
  }

  const rewardWei = BigInt(d[2].toString());
  const createdAt = Number(d[4]);
  const claimWindowSecs = Number(d[5]);
  const dimIdx = Number(d[6]);
  const statusIdx = Number(d[7]);
  const challengeCnt = Number(d[8]);
  const grace = Number(d[9]);

  let effectiveExpiry = createdAt + claimWindowSecs;
  if (statusIdx === 1 /* CHALLENGED */) effectiveExpiry += grace;

  return {
    bountyId: id.toString(),
    threadHash: String(d[0]),
    poster: poster.toLowerCase(),
    rewardWei: rewardWei.toString(),
    rewardOkb: formatEther(rewardWei),
    winner: String(d[3]).toLowerCase(),
    createdAt,
    claimWindowSecs,
    effectiveExpiry,
    dimension: DIMENSION_NAMES[dimIdx] || `DIM_${dimIdx}`,
    status: BOUNTY_STATUS_NAMES[statusIdx] || `STATUS_${statusIdx}`,
    challengeCount: challengeCnt,
  };
}

export async function readNextBountyId(): Promise<number> {
  const data = BOUNTIES_INTERFACE.encodeFunctionData('nextBountyId');
  const raw = await rpcCall<string>('eth_call', [{ to: BOBBY_ADVERSARIAL_BOUNTIES, data }, 'latest']);
  const [next] = BOUNTIES_INTERFACE.decodeFunctionResult('nextBountyId', raw);
  return Number(next);
}

export async function readMinBounty(): Promise<{ minBountyWei: string; minBountyOkb: string }> {
  const data = BOUNTIES_INTERFACE.encodeFunctionData('minBounty');
  const raw = await rpcCall<string>('eth_call', [{ to: BOBBY_ADVERSARIAL_BOUNTIES, data }, 'latest']);
  const [min] = BOUNTIES_INTERFACE.decodeFunctionResult('minBounty', raw);
  const wei = BigInt(min.toString());
  return { minBountyWei: wei.toString(), minBountyOkb: formatEther(wei) };
}

export async function listRecentBounties(limit = 10): Promise<BountySummary[]> {
  const next = await readNextBountyId();
  const last = next - 1;
  if (last < 1) return [];
  const start = Math.max(1, last - limit + 1);

  const ids: number[] = [];
  for (let i = last; i >= start; i--) ids.push(i);

  const out: BountySummary[] = [];
  for (let i = 0; i < ids.length; i += 5) {
    const batch = ids.slice(i, i + 5);
    const settled = await Promise.all(batch.map((id) => readBounty(id).catch(() => null)));
    for (const b of settled) if (b) out.push(b);
  }
  return out;
}

export function buildPostBountyCalldata(params: {
  threadId: string;
  dimension: string | number;
  claimWindowSecs?: number;
}): { to: string; data: string; dimension: string } {
  if (!params.threadId || params.threadId.length === 0) {
    throw new Error('threadId is required');
  }
  const dimIdx = parseDimensionInput(params.dimension);
  const window = params.claimWindowSecs ?? 0;
  const data = BOUNTIES_INTERFACE.encodeFunctionData('postBounty', [
    params.threadId,
    dimIdx,
    window,
  ]);
  return { to: BOBBY_ADVERSARIAL_BOUNTIES, data, dimension: DIMENSION_NAMES[dimIdx] };
}

export function buildSubmitChallengeCalldata(params: {
  bountyId: number | string;
  evidenceHash: string;
}): { to: string; data: string } {
  const hash = params.evidenceHash.startsWith('0x') ? params.evidenceHash : `0x${params.evidenceHash}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    throw new Error('evidenceHash must be a 32-byte hex string (0x + 64 chars)');
  }
  const data = BOUNTIES_INTERFACE.encodeFunctionData('submitChallenge', [
    BigInt(params.bountyId),
    hash,
  ]);
  return { to: BOBBY_ADVERSARIAL_BOUNTIES, data };
}

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
