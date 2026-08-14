import {
  BOBBY_HARDNESS_REGISTRY,
  BOBBY_PROTOCOL_BASE_URL,
  XLAYER_RPC_URL,
} from './protocol-constants.js';
import { DEFAULT_CHAIN } from './chains.js';
import {
  assertProviderChain,
  evaluateProtocolWriteSafety,
  recorderKeyEnvForChain,
} from './protocol-write-safety.js';

const XLAYER_RPC = XLAYER_RPC_URL;
export const HARDNESS_REGISTRY_ADDRESS = BOBBY_HARDNESS_REGISTRY;

const HARDNESS_REGISTRY_ABI = [
  'function agentProfiles(address) view returns (bool registered, uint64 registeredAt, string metadataURI)',
  'function getService(string serviceId) view returns ((address owner,address recipient,uint128 priceWei,uint128 totalRevenue,uint64 totalCalls,uint64 createdAt,bool active,string serviceId))',
  'function REGISTRATION_STAKE() view returns (uint96)',
  'function registerAgent(string metadataURI) payable',
  'function registerService(string serviceId, uint256 priceWei, address recipient)',
  'function commitPrediction(bytes32 predictionHash, string symbol, uint8 conviction, uint96 entry, uint96 target, uint96 stop)',
  'function publishSignal(string symbol, uint8 hardnessScore, uint8 direction, uint8 conviction, bytes32 context)',
  'function getPrediction(bytes32 predictionHash) view returns ((address agent,uint64 committedAt,uint64 minResolveAt,uint64 resolvedAt,uint8 conviction,uint8 result,uint96 entryPrice,uint96 targetPrice,uint96 stopPrice,uint96 exitPrice,int32 pnlBps,string symbol))',
];

const DEFAULT_AGENT_METADATA_URI =
  process.env.BOBBY_HARDNESS_AGENT_METADATA_URI || `${BOBBY_PROTOCOL_BASE_URL}/api/agent-identity`;

const HARDNESS_SERVICE_IDS = [
  'bobby_analyze',
  'bobby_debate',
  'bobby_judge',
  'bobby_security_scan',
  'bobby_wallet_portfolio',
] as const;

function servicePriceEnvForChain(): string | null {
  if (DEFAULT_CHAIN.id === 8453) return 'BASE_HARDNESS_SERVICE_PRICE_WEI';
  if (DEFAULT_CHAIN.id === 84532) return 'BASE_SEPOLIA_HARDNESS_SERVICE_PRICE_WEI';
  return null;
}

function configuredServicePriceWei(): bigint | null {
  const envName = servicePriceEnvForChain();
  // Preserve the historical X Layer service price. ETH-denominated networks
  // must opt into their own reviewed value; an OKB literal must never migrate.
  const raw = envName ? process.env[envName] : '1000000000000000';
  if (!raw || !/^[1-9][0-9]*$/.test(raw)) return null;
  try {
    const value = BigInt(raw);
    return value <= ((1n << 128n) - 1n) ? value : null;
  } catch {
    return null;
  }
}

let lastSetupAt = 0;

export type HardnessDirection = 'long' | 'short' | 'neutral' | 'none';

export interface HardnessProofResult {
  predictionHash: string;
  signalTxHash?: string | null;
  commitTxHash?: string | null;
}

export interface RecordHardnessActivityInput {
  threadId: string;
  symbol: string;
  direction: HardnessDirection;
  conviction: number;
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  shouldCommitPrediction?: boolean;
  metadataURI?: string;
  recipient?: string;
}

function scaleConviction(conviction: number): number {
  if (!Number.isFinite(conviction)) return 0;
  if (conviction <= 10) return Math.max(0, Math.min(100, Math.round(conviction * 10)));
  return Math.max(0, Math.min(100, Math.round(conviction)));
}

function scalePrice(price: number, fallback: number): bigint {
  const safe = Number.isFinite(price) && price > 0 ? price : fallback;
  return BigInt(Math.max(1, Math.round(safe * 1e8)));
}

function directionToEnum(direction: HardnessDirection): number {
  if (direction === 'long') return 1;
  if (direction === 'short') return 2;
  return 0;
}

export function isHardnessRegistryConfigured(): boolean {
  const writeSafety = evaluateProtocolWriteSafety(
    DEFAULT_CHAIN,
    process.env,
    ['hardnessRegistry'],
  );
  return writeSafety.ok && configuredServicePriceWei() !== null;
}

export function computeHardnessScore(dimensions: Record<string, number>): number {
  const weights: Record<string, number> = {
    data_integrity: 0.2,
    adversarial_quality: 0.25,
    decision_logic: 0.2,
    risk_management: 0.15,
    calibration_alignment: 0.1,
    novelty: 0.1,
  };

  let weighted = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const val = Number(dimensions[key] || 0);
    weighted += (Math.max(0, Math.min(5, val)) / 5) * weight * 100;
  }
  return Math.round(weighted);
}

async function getSigner() {
  if (!isHardnessRegistryConfigured()) return null;
  const key = process.env[recorderKeyEnvForChain(DEFAULT_CHAIN.id)] || '';
  if (!key || !HARDNESS_REGISTRY_ADDRESS) return null;
  const { ethers } = await import('ethers');
  const provider = new ethers.JsonRpcProvider(XLAYER_RPC);
  await assertProviderChain(provider, DEFAULT_CHAIN.id);
  return new ethers.Wallet(key, provider);
}

async function ensureBobbySetup(contract: any, signer: any, metadataURI?: string, recipient?: string) {
  const now = Date.now();
  if (now - lastSetupAt < 15 * 60 * 1000) return;
  const { ethers } = await import('ethers');

  const profile = await contract.agentProfiles(signer.address);
  if (!profile.registered) {
    const registrationStake = (await contract.REGISTRATION_STAKE()) as bigint;
    const tx = await contract.registerAgent(metadataURI || DEFAULT_AGENT_METADATA_URI, {
      gasLimit: 250000n,
      value: registrationStake,
    });
    await tx.wait();
  }

  const servicePriceWei = configuredServicePriceWei();
  if (servicePriceWei === null) {
    const envName = servicePriceEnvForChain();
    throw new Error(`${envName || 'Hardness service price'} must be a positive uint128 value`);
  }
  const payoutRecipient = recipient || signer.address;
  for (const serviceId of HARDNESS_SERVICE_IDS) {
    try {
      const existing = await contract.getService(serviceId);
      if (existing.owner === ethers.ZeroAddress) {
        const tx = await contract.registerService(serviceId, servicePriceWei, payoutRecipient, { gasLimit: 300000n });
        await tx.wait();
      } else if (
        existing.owner.toLowerCase() === signer.address.toLowerCase() &&
        (!existing.active || existing.recipient.toLowerCase() !== payoutRecipient.toLowerCase() || existing.priceWei !== servicePriceWei)
      ) {
        const tx = await contract.registerService(serviceId, servicePriceWei, payoutRecipient, { gasLimit: 300000n });
        await tx.wait();
      }
    } catch (error) {
      console.warn(`[Hardness] Service sync skipped for ${serviceId}:`, error instanceof Error ? error.message : error);
    }
  }

  lastSetupAt = now;
}

export async function recordHardnessActivity(input: RecordHardnessActivityInput): Promise<HardnessProofResult | null> {
  const signer = await getSigner();
  if (!signer) return null;

  const { ethers } = await import('ethers');
  const contract = new ethers.Contract(HARDNESS_REGISTRY_ADDRESS, HARDNESS_REGISTRY_ABI, signer);
  await ensureBobbySetup(contract, signer, input.metadataURI, input.recipient);

  const predictionHash = ethers.keccak256(ethers.toUtf8Bytes(`bobby:${input.threadId}`));
  const conviction = scaleConviction(input.conviction);
  const entry = scalePrice(input.entryPrice, input.entryPrice || 1);
  const target = scalePrice(input.targetPrice, input.entryPrice || 1);
  const stop = scalePrice(input.stopPrice, input.entryPrice || 1);
  const context = ethers.keccak256(ethers.toUtf8Bytes(input.threadId));

  let commitTxHash: string | null = null;
  if (input.shouldCommitPrediction !== false) {
    try {
      const existing = await contract.getPrediction(predictionHash);
      if (existing.agent === ethers.ZeroAddress) {
        const tx = await contract.commitPrediction(predictionHash, input.symbol, conviction, entry, target, stop, { gasLimit: 300000n });
        commitTxHash = tx.hash;
      }
    } catch (error) {
      console.warn('[Hardness] commitPrediction skipped:', error instanceof Error ? error.message : error);
    }
  }

  let signalTxHash: string | null = null;
  try {
    const hardnessScore = Math.min(100, Math.max(0, conviction)); // same scale as conviction for now
    const tx = await contract.publishSignal(
      input.symbol,
      hardnessScore,
      directionToEnum(input.direction),
      conviction,
      context,
      { gasLimit: 220000n }
    );
    signalTxHash = tx.hash;
  } catch (error) {
    console.warn('[Hardness] publishSignal failed:', error instanceof Error ? error.message : error);
  }

  return { predictionHash, commitTxHash, signalTxHash };
}
