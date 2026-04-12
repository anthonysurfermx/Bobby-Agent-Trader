import { ethers } from 'ethers';

const XLAYER_RPC = 'https://rpc.xlayer.tech';
export const HARDNESS_REGISTRY_ADDRESS =
  process.env.HARDNESS_REGISTRY_ADDRESS || '0x95D045b1488F0776419a0E09de4fc0687AbbAFbf';

const HARDNESS_REGISTRY_ABI = [
  'function agentProfiles(address) view returns (bool registered, uint64 registeredAt, uint96 stake, string metadataURI)',
  'function getService(string serviceId) view returns ((address owner,address recipient,uint128 priceWei,uint128 totalRevenue,uint64 totalCalls,uint64 createdAt,bool active,string serviceId))',
  'function registerAgent(string metadataURI) payable',
  'function registerService(string serviceId, uint256 priceWei, address recipient)',
  'function commitPrediction(bytes32 predictionHash, string symbol, uint8 conviction, uint96 entry, uint96 target, uint96 stop)',
  'function publishSignal(string symbol, uint8 hardnessScore, uint8 direction, uint8 conviction, bytes32 context)',
  'function getPrediction(bytes32 predictionHash) view returns ((address agent,uint64 committedAt,uint64 minResolveAt,uint64 resolvedAt,uint8 conviction,uint8 result,uint96 entryPrice,uint96 targetPrice,uint96 stopPrice,uint96 exitPrice,int32 pnlBps,string symbol))',
];

const DEFAULT_AGENT_METADATA_URI =
  process.env.BOBBY_HARDNESS_AGENT_METADATA_URI || 'https://bobbyprotocol.xyz/api/agent-identity';

export const HARDNESS_PREMIUM_SERVICES = [
  { serviceId: 'bobby_analyze', priceWei: ethers.parseEther('0.001') },
  { serviceId: 'bobby_debate', priceWei: ethers.parseEther('0.001') },
  { serviceId: 'bobby_judge', priceWei: ethers.parseEther('0.001') },
  { serviceId: 'bobby_security_scan', priceWei: ethers.parseEther('0.001') },
  { serviceId: 'bobby_wallet_portfolio', priceWei: ethers.parseEther('0.001') },
];

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
  return Boolean(HARDNESS_REGISTRY_ADDRESS && process.env.BOBBY_RECORDER_KEY);
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
  const key = process.env.BOBBY_RECORDER_KEY || '';
  if (!key || !HARDNESS_REGISTRY_ADDRESS) return null;
  const provider = new ethers.JsonRpcProvider(XLAYER_RPC);
  return new ethers.Wallet(key, provider);
}

async function ensureBobbySetup(contract: ethers.Contract, signer: ethers.Wallet, metadataURI?: string, recipient?: string) {
  const now = Date.now();
  if (now - lastSetupAt < 15 * 60 * 1000) return;

  const profile = await contract.agentProfiles(signer.address);
  if (!profile.registered) {
    const tx = await contract.registerAgent(metadataURI || DEFAULT_AGENT_METADATA_URI, { gasLimit: 250000n, value: ethers.parseEther('0.01') });
    await tx.wait();
  }

  const payoutRecipient = recipient || signer.address;
  for (const service of HARDNESS_PREMIUM_SERVICES) {
    try {
      const existing = await contract.getService(service.serviceId);
      if (existing.owner === ethers.ZeroAddress) {
        const tx = await contract.registerService(service.serviceId, service.priceWei, payoutRecipient, { gasLimit: 300000n });
        await tx.wait();
      } else if (
        existing.owner.toLowerCase() === signer.address.toLowerCase() &&
        (!existing.active || existing.recipient.toLowerCase() !== payoutRecipient.toLowerCase() || existing.priceWei !== service.priceWei)
      ) {
        const tx = await contract.registerService(service.serviceId, service.priceWei, payoutRecipient, { gasLimit: 300000n });
        await tx.wait();
      }
    } catch (error) {
      console.warn(`[Hardness] Service sync skipped for ${service.serviceId}:`, error instanceof Error ? error.message : error);
    }
  }

  lastSetupAt = now;
}

export async function recordHardnessActivity(input: RecordHardnessActivityInput): Promise<HardnessProofResult | null> {
  const signer = await getSigner();
  if (!signer) return null;

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
    const tx = await contract.publishSignal(
      input.symbol,
      0, // hardnessScore — will be certified later by scorer
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
