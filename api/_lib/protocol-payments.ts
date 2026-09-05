import { Interface, formatEther, type InterfaceAbi } from 'ethers';
import {
  BOBBY_ADVERSARIAL_BOUNTIES,
  BOBBY_AGENT_ECONOMY,
  PROTOCOL_CHAIN_ID,
  PROTOCOL_RPC_FALLBACK_URL,
  PROTOCOL_RPC_URL,
} from './protocol-constants.js';
import { DEFAULT_CHAIN } from './chains.js';
// BP-07: the bounties ABI comes FROM the compiled artifact (gen:hardness-abi),
// never from a hand-written fragment list that can drift from the contract.
import { ADVERSARIAL_BOUNTIES_ABI } from './adversarial-bounties.abi.js';
import { rpcEndpointLabel, rpcErrorMessage, scrubRpcSecrets } from './rpc-redact.js';
import { bytes32ToChallengeId } from './challenge-id.js';

export {
  BOBBY_ADVERSARIAL_BOUNTIES,
  BOBBY_AGENT_ECONOMY,
  PROTOCOL_CHAIN_ID,
  PROTOCOL_RPC_URL,
} from './protocol-constants.js';

const ECONOMY_INTERFACE = new Interface([
  'function payMCPCall(bytes32 challengeId, string toolName) payable',
  'function mcpCallFee() view returns (uint256)',
  'function getEconomyStats() view returns (uint256,uint256,uint256,uint256,uint256)',
  'function getStats() view returns (uint256,uint256,uint256)',
]);

const BOUNTIES_INTERFACE = new Interface(ADVERSARIAL_BOUNTIES_ABI as unknown as InterfaceAbi);

const DIMENSION_NAMES = [
  'DATA_INTEGRITY',
  'ADVERSARIAL_QUALITY',
  'DECISION_LOGIC',
  'RISK_MANAGEMENT',
  'CALIBRATION_ALIGNMENT',
  'NOVELTY',
] as const;

// BP-07: all SIX on-chain states (the optimistic-resolution states were missing,
// so PENDING_RESOLUTION / DISPUTED surfaced as STATUS_4 / STATUS_5 with no deadline).
export const BOUNTY_STATUS_NAMES = ['OPEN', 'CHALLENGED', 'RESOLVED', 'WITHDRAWN', 'PENDING_RESOLUTION', 'DISPUTED'] as const;
export type BountyStatusName = (typeof BOUNTY_STATUS_NAMES)[number];

/** The next on-chain clock that matters for a bounty in its current state. */
export interface BountyDeadline {
  /** What the deadline gates. */
  action: 'submitChallenge' | 'resolveBounty' | 'finalizeResolution' | 'resolveStalledDispute';
  /** Unix seconds. */
  at: number;
  /** Where the number came from on-chain. */
  source: 'claimWindow' | 'claimWindow+grace' | 'resolutionFinalizeAfter' | 'settlementAfter';
}

export interface BountySummary {
  bountyId: string;
  threadHash: string;
  poster: string;
  rewardWei: string;
  rewardNative: string;
  /** @deprecated X Layer compatibility alias; use rewardNative. */
  rewardOkb: string;
  winner: string;
  createdAt: number;
  claimWindowSecs: number;
  effectiveExpiry: number;
  dimension: string;
  status: BountyStatusName | string;
  challengeCount: number;
  /** BP-07: the challenge/dispute bond fixed for THIS bounty at post time (wei). */
  bondWei: string;
  bondNative: string;
  /** PENDING_RESOLUTION: finalizeResolution is callable from this time; disputes before it. */
  resolutionFinalizeAfter: number | null;
  /** DISPUTED: resolveStalledDispute is callable from this time. */
  settlementAfter: number | null;
  /** DISPUTED: who froze the resolution. */
  disputedBy: string | null;
  /** The deadline that applies to the CURRENT state, or null when terminal. */
  nextDeadline: BountyDeadline | null;
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

async function bountyView<T = unknown>(fn: string, args: unknown[]): Promise<T> {
  const data = BOUNTIES_INTERFACE.encodeFunctionData(fn, args);
  const raw = await rpcCall<string>('eth_call', [{ to: BOBBY_ADVERSARIAL_BOUNTIES, data }, 'latest']);
  return BOUNTIES_INTERFACE.decodeFunctionResult(fn, raw)[0] as T;
}

/** BP-07: the bond a challenger (or a disputing party) must send for this bounty — snapshotted at post time. */
export async function readBountyBond(bountyId: number | string | bigint): Promise<bigint> {
  const bond = await bountyView<bigint>('bountyBond', [BigInt(bountyId)]);
  return BigInt(bond.toString());
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
  const status = BOUNTY_STATUS_NAMES[statusIdx] || `STATUS_${statusIdx}`;

  // BP-07: the per-bounty bond and the state-specific deadlines are on-chain
  // facts the tools must report — not derivable from the packed struct.
  const [bond, finalizeAfter, settlement, disputedBy] = await Promise.all([
    readBountyBond(id),
    status === 'PENDING_RESOLUTION' || status === 'DISPUTED' || status === 'RESOLVED'
      ? bountyView<bigint>('resolutionFinalizeAfter', [id]).then((v) => Number(v))
      : Promise.resolve(0),
    status === 'DISPUTED' || status === 'RESOLVED'
      ? bountyView<bigint>('settlementAfter', [id]).then((v) => Number(v))
      : Promise.resolve(0),
    status === 'DISPUTED' || status === 'RESOLVED'
      ? bountyView<string>('disputedBy', [id]).then((v) => String(v).toLowerCase())
      : Promise.resolve('0x0000000000000000000000000000000000000000'),
  ]);

  let effectiveExpiry = createdAt + claimWindowSecs;
  if (statusIdx === 1 /* CHALLENGED */) effectiveExpiry += grace;

  let nextDeadline: BountyDeadline | null = null;
  if (status === 'OPEN') nextDeadline = { action: 'submitChallenge', at: createdAt + claimWindowSecs, source: 'claimWindow' };
  else if (status === 'CHALLENGED') nextDeadline = { action: 'resolveBounty', at: effectiveExpiry, source: 'claimWindow+grace' };
  else if (status === 'PENDING_RESOLUTION') nextDeadline = { action: 'finalizeResolution', at: finalizeAfter, source: 'resolutionFinalizeAfter' };
  else if (status === 'DISPUTED') nextDeadline = { action: 'resolveStalledDispute', at: settlement, source: 'settlementAfter' };

  const rewardNative = formatEther(rewardWei);
  return {
    bountyId: id.toString(),
    threadHash: String(d[0]),
    poster: poster.toLowerCase(),
    rewardWei: rewardWei.toString(),
    rewardNative,
    rewardOkb: rewardNative,
    winner: String(d[3]).toLowerCase(),
    createdAt,
    claimWindowSecs,
    effectiveExpiry,
    dimension: DIMENSION_NAMES[dimIdx] || `DIM_${dimIdx}`,
    status,
    challengeCount: challengeCnt,
    bondWei: bond.toString(),
    bondNative: formatEther(bond),
    resolutionFinalizeAfter: finalizeAfter > 0 ? finalizeAfter : null,
    settlementAfter: settlement > 0 ? settlement : null,
    disputedBy: disputedBy !== '0x0000000000000000000000000000000000000000' ? disputedBy : null,
    nextDeadline,
  };
}

export async function readNextBountyId(): Promise<number> {
  const data = BOUNTIES_INTERFACE.encodeFunctionData('nextBountyId');
  const raw = await rpcCall<string>('eth_call', [{ to: BOBBY_ADVERSARIAL_BOUNTIES, data }, 'latest']);
  const [next] = BOUNTIES_INTERFACE.decodeFunctionResult('nextBountyId', raw);
  return Number(next);
}

export async function readMinBounty(): Promise<{
  minBountyWei: string;
  minBountyNative: string;
  /** @deprecated X Layer compatibility alias; use minBountyNative. */
  minBountyOkb: string;
}> {
  const data = BOUNTIES_INTERFACE.encodeFunctionData('minBounty');
  const raw = await rpcCall<string>('eth_call', [{ to: BOBBY_ADVERSARIAL_BOUNTIES, data }, 'latest']);
  const [min] = BOUNTIES_INTERFACE.decodeFunctionResult('minBounty', raw);
  const wei = BigInt(min.toString());
  const minBountyNative = formatEther(wei);
  return { minBountyWei: wei.toString(), minBountyNative, minBountyOkb: minBountyNative };
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

/** Pure encoder (no chain read). The unsigned tx handed to a wallet must come from buildSubmitChallengeCalldata. */
export function encodeSubmitChallenge(params: { bountyId: number | string; evidenceHash: string }): { to: string; data: string } {
  const hash = params.evidenceHash.startsWith('0x') ? params.evidenceHash : `0x${params.evidenceHash}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    throw new Error('evidenceHash must be a 32-byte hex string (0x + 64 chars)');
  }
  if (/^0x0{64}$/.test(hash)) throw new Error('evidenceHash must not be zero (the contract requires evidence)');
  const data = BOUNTIES_INTERFACE.encodeFunctionData('submitChallenge', [BigInt(params.bountyId), hash]);
  return { to: BOBBY_ADVERSARIAL_BOUNTIES, data };
}

/**
 * BP-07: submitChallenge is payable and REQUIRES msg.value == bountyBond(id) —
 * the bond snapshotted for that bounty at post time (a later owner change to
 * the global challengeBond does not apply). The unsigned tx therefore carries
 * the bond read live for THIS bounty; a tx without it reverts on-chain.
 */
export async function buildSubmitChallengeCalldata(params: {
  bountyId: number | string;
  evidenceHash: string;
}): Promise<{ to: string; data: string; value: string; valueWei: string; valueNative: string }> {
  const encoded = encodeSubmitChallenge(params);
  const bondWei = await readBountyBond(params.bountyId);
  return {
    ...encoded,
    value: `0x${bondWei.toString(16)}`,
    valueWei: bondWei.toString(),
    valueNative: formatEther(bondWei),
  };
}

export interface VerifiedMcpPayment {
  txHash: string;
  payer: string;
  to: string;
  /** The challenge uuid decoded from the paid bytes32 — '' when the bytes32 is not a canonical Bobby challenge id. */
  challengeId: string;
  /** The raw bytes32 the payer put on-chain. */
  challengeIdBytes32: string;
  toolName: string;
  valueWei: string;
  valueNative: string;
  /** @deprecated X Layer compatibility alias; use valueNative. */
  valueOkb: string;
  blockNumber: number;
}

interface RpcEnvelope<T> {
  result?: T;
  error?: { code?: number; message?: string };
}

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const urls = [...new Set([PROTOCOL_RPC_URL, PROTOCOL_RPC_FALLBACK_URL].filter(Boolean))];
  let lastError: unknown;

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });

      if (!res.ok) throw new Error(`${DEFAULT_CHAIN.name} ${rpcEndpointLabel(url)} ${res.status}`);

      const json = await res.json() as RpcEnvelope<T>;
      // BP-12: upstream messages may echo the request URL — scrub before they propagate.
      if (json.error) throw new Error(scrubRpcSecrets(json.error.message || '') || `${DEFAULT_CHAIN.name} ${rpcEndpointLabel(url)} error`);
      if (json.result == null) throw new Error(`${DEFAULT_CHAIN.name} ${rpcEndpointLabel(url)} returned no result`);
      return json.result;
    } catch (error) {
      lastError = new Error(rpcErrorMessage(error));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`all ${DEFAULT_CHAIN.name} RPCs failed`);
}

export interface McpFee {
  feeWei: string;
  feeNative: string;
  nativeSymbol: string;
  chainId: number;
  chainName: string;
}

/** Read the configured deployment's live fee instead of assuming X Layer's legacy price. */
export async function readMcpCallFee(): Promise<McpFee> {
  const data = ECONOMY_INTERFACE.encodeFunctionData('mcpCallFee');
  const raw = await rpcCall<string>('eth_call', [{ to: BOBBY_AGENT_ECONOMY, data }, 'latest']);
  const [fee] = ECONOMY_INTERFACE.decodeFunctionResult('mcpCallFee', raw);
  const feeWei = BigInt(fee.toString());
  return {
    feeWei: feeWei.toString(),
    feeNative: formatEther(feeWei),
    nativeSymbol: DEFAULT_CHAIN.nativeSymbol,
    chainId: DEFAULT_CHAIN.id,
    chainName: DEFAULT_CHAIN.name,
  };
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
    throw new Error(`Payment tx must call BobbyAgentEconomy on ${DEFAULT_CHAIN.name}`);
  }

  const valueWei = BigInt(tx.value || '0x0');
  const { feeWei } = await readMcpCallFee();
  if (valueWei < BigInt(feeWei)) {
    throw new Error('Payment tx value is below Bobby MCP premium fee');
  }

  const parsed = ECONOMY_INTERFACE.parseTransaction({
    data: String(tx.input || '0x'),
    value: valueWei,
  });

  if (!parsed || parsed.name !== 'payMCPCall') {
    throw new Error('Payment tx is not a payMCPCall invocation');
  }

  // V2: args[0] = challengeId (bytes32 = uuid + zero tail, see challenge-id.ts), args[1] = toolName (string)
  const challengeIdBytes32 = String(parsed.args?.[0] || '').toLowerCase();
  const challengeId = bytes32ToChallengeId(challengeIdBytes32) ?? '';
  const toolName = String(parsed.args?.[1] || '');
  if (toolName !== expectedToolName) {
    throw new Error(`Payment tx tool mismatch: expected ${expectedToolName}, got ${toolName || 'unknown'}`);
  }

  const valueNative = formatEther(valueWei);
  return {
    txHash,
    payer: String(tx.from || '').toLowerCase(),
    to,
    challengeId,
    challengeIdBytes32,
    toolName,
    valueWei: valueWei.toString(),
    valueNative,
    valueOkb: valueNative,
    blockNumber: Number.parseInt(String(receipt.blockNumber || '0x0'), 16) || 0,
  };
}

export async function getEconomyStats(): Promise<{
  totalDebates: string;
  totalMcpCalls: string;
  totalSignalAccesses: string;
  totalVolumeWei: string;
  totalVolumeNative: string;
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
    totalVolumeNative: formatEther(decoded[3]),
    totalPayments: decoded[4].toString(),
  };
}
