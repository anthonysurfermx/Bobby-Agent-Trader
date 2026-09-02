import type { VercelResponse } from '@vercel/node';
import { lastKnownControl } from './control.js';
import {
  BASE_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
  DEFAULT_CHAIN,
  XLAYER_CHAIN_ID,
  type ChainConfig,
  type ContractSet,
} from './chains.js';

export type WritableContract = keyof ContractSet;

export interface ProtocolWriteSafetyResult {
  ok: boolean;
  chainId: number;
  recorderKeyEnv: 'BOBBY_RECORDER_KEY' | 'BASE_SEPOLIA_RECORDER_KEY' | 'BASE_RECORDER_KEY';
  blockers: string[];
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function isConfiguredAddress(value: string): boolean {
  return ADDRESS_RE.test(value) && value.toLowerCase() !== ZERO_ADDRESS;
}

export function isProtocolCutoverFrozen(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PROTOCOL_CUTOVER_FREEZE === 'true' || lastKnownControl()?.writeFreeze === true;
}

/**
 * Legacy X Layer writes are production-only by default. Local/preview writes
 * require a second, explicit override so a leaked preview recorder key cannot
 * mutate the legacy production contracts through a manually-invoked endpoint.
 */
export function legacyXLayerWritesAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === 'production' || env.ALLOW_NON_PROD_XLAYER_WRITES === 'true';
}

export function recorderKeyEnvForChain(chainId: number): ProtocolWriteSafetyResult['recorderKeyEnv'] {
  if (chainId === BASE_CHAIN_ID) return 'BASE_RECORDER_KEY';
  if (chainId === BASE_SEPOLIA_CHAIN_ID) return 'BASE_SEPOLIA_RECORDER_KEY';
  return 'BOBBY_RECORDER_KEY';
}

/** Refuse to sign when the RPC answers for a different chain than intended. */
export async function assertProviderChain(
  provider: { getNetwork(): Promise<{ chainId: bigint | number }> },
  expectedChainId: number,
): Promise<void> {
  const network = await provider.getNetwork();
  if (BigInt(network.chainId) !== BigInt(expectedChainId)) {
    throw new Error(`RPC chain id ${network.chainId.toString()} does not match expected ${expectedChainId}`);
  }
}

/**
 * Evaluate the two-key production latch without exposing any secret values.
 * Base writes require both an enable flag and an exact numeric chain-id
 * confirmation, plus a chain-specific recorder key. This makes a mistaken
 * PROTOCOL_CHAIN edit insufficient on its own to authorize transactions.
 */
export function evaluateProtocolWriteSafety(
  chain: ChainConfig = DEFAULT_CHAIN,
  env: NodeJS.ProcessEnv = process.env,
  requiredContracts: WritableContract[] = [],
): ProtocolWriteSafetyResult {
  const blockers: string[] = [];
  const recorderKeyEnv = recorderKeyEnvForChain(chain.id);

  if (![XLAYER_CHAIN_ID, BASE_SEPOLIA_CHAIN_ID, BASE_CHAIN_ID].includes(chain.id)) {
    blockers.push(`unsupported protocol chain id ${chain.id}`);
  }

  // Legacy X Layer remains operational during the cutover. Every Base-family
  // writer must opt in explicitly and confirm the exact destination chain.
  if (chain.id === XLAYER_CHAIN_ID) {
    if (!legacyXLayerWritesAllowed(env)) {
      blockers.push('X Layer writes require VERCEL_ENV=production or ALLOW_NON_PROD_XLAYER_WRITES=true');
    }
  } else {
    if (env.PROTOCOL_WRITES_ENABLED !== 'true') {
      blockers.push('PROTOCOL_WRITES_ENABLED must equal true');
    }
    if (env.PROTOCOL_WRITE_CHAIN_ID !== String(chain.id)) {
      blockers.push(`PROTOCOL_WRITE_CHAIN_ID must equal ${chain.id}`);
    }
    // Codex mainnet review P0-2: the cutover freeze must gate EVERY
    // Base-family writer through this shared guard — previously only
    // bobby-cycle checked it, leaving xlayer-record able to sign while
    // "frozen". Freeze wins over every other latch.
    if (isProtocolCutoverFrozen(env)) {
      blockers.push('write freeze is active (PROTOCOL_CUTOVER_FREEZE or bobby_control) — writes are frozen');
    }
  }

  if (chain.id === BASE_CHAIN_ID && env.VERCEL_ENV !== 'production') {
    blockers.push('Base mainnet writes require VERCEL_ENV=production');
  }
  if (chain.id === BASE_SEPOLIA_CHAIN_ID && env.VERCEL_ENV === 'production') {
    blockers.push('Base Sepolia writes are forbidden in Vercel production');
  }

  if (!env[recorderKeyEnv]) {
    blockers.push(`${recorderKeyEnv} is not configured`);
  }

  for (const key of requiredContracts) {
    if (!isConfiguredAddress(chain.contracts[key])) {
      blockers.push(`${key} contract address is missing or invalid for chain ${chain.id}`);
    }
  }

  if (chain.id === BASE_CHAIN_ID && chain.protocolDeploymentBlock <= 0) {
    blockers.push('BASE_PROTOCOL_DEPLOYMENT_BLOCK must be greater than zero');
  }

  return {
    ok: blockers.length === 0,
    chainId: chain.id,
    recorderKeyEnv,
    blockers,
  };
}

export function requireProtocolWriteSafety(
  res: VercelResponse,
  requiredContracts: WritableContract[],
): ProtocolWriteSafetyResult | null {
  const result = evaluateProtocolWriteSafety(DEFAULT_CHAIN, process.env, requiredContracts);
  if (result.ok) return result;

  res.status(503).json({
    error: 'Protocol writes are not armed for the selected chain',
    chainId: result.chainId,
    blockers: result.blockers,
  });
  return null;
}

/** Guard an endpoint that intentionally remains X-Layer-only during cutover. */
export function requireLegacyXLayerMode(res: VercelResponse, surface: string): boolean {
  if (DEFAULT_CHAIN.id === XLAYER_CHAIN_ID && legacyXLayerWritesAllowed()) return true;
  if (DEFAULT_CHAIN.id === XLAYER_CHAIN_ID) {
    res.status(503).json({
      error: `${surface} cannot sign X Layer transactions outside production without ALLOW_NON_PROD_XLAYER_WRITES=true`,
      chainId: DEFAULT_CHAIN.id,
    });
    return false;
  }
  res.status(409).json({
    error: `${surface} is a legacy X Layer writer and is disabled when PROTOCOL_CHAIN targets ${DEFAULT_CHAIN.name}`,
    chainId: DEFAULT_CHAIN.id,
  });
  return false;
}
