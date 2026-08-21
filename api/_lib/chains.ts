// api/_lib/chains.ts
// Backend mirror of src/config/chains.ts (kept separate: api/ can't import from
// src/ with Vite aliases, and backend reads RPC overrides from env).
//
// SINGLE SOURCE OF TRUTH for chain ids, RPCs, explorers, tokens and deployed
// contract addresses. protocol-constants.ts now derives from this file — do not
// reintroduce a parallel list of addresses anywhere else.

export const BASE_CHAIN_ID = 8453;
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const XLAYER_CHAIN_ID = 196;

export interface ContractSet {
  treasury: string;
  agentEconomy: string;
  adversarialBounties: string;
  trackRecord: string;
  hardnessRegistry: string;
  convictionOracle: string;
  agentRegistry: string;
  intentEscrow: string;
}

export interface ChainConfig {
  id: number;
  name: string;
  rpcUrl: string;
  rpcFallbackUrl?: string;
  explorerUrl: string;
  explorerApiUrl: string;
  nativeSymbol: string;
  nativeDecimals: number;
  /** First block that can contain Bobby protocol activity on this deployment. */
  protocolDeploymentBlock: number;
  /**
   * D-3: ON-CHAIN protocol fees (MCP calls, bounties, stakes) are paid in the
   * chain's NATIVE token on every chain — 'native' here always means msg.value.
   */
  onchainFeeToken: 'native';
  onchainFeeSymbol: string;
  onchainFeeDecimals: number;
  /** x402 / off-chain settlement rail — stablecoin, NOT used by the contracts. */
  x402SettlementToken: string;
  x402SettlementSymbol: string;
  x402SettlementDecimals: number;
  stable: string;
  stableSymbol: string;
  stableDecimals: number;
  weth: string;
  contracts: ContractSet;
}

// Audited Base mainnet deployment. Environment overrides remain available for
// controlled rehearsal/testing, but production has truthful public fallbacks.
export const BASE_CONTRACTS: ContractSet = {
  treasury: process.env.TREASURY_ADDRESS_BASE || '',
  agentEconomy: process.env.BASE_AGENT_ECONOMY_ADDRESS || '0x009de59e0e7f4109fF9E89E744A4412082AD2aaF',
  adversarialBounties: process.env.BASE_BOUNTIES_ADDRESS || '0x73fD6c77ff0403Ea071e8721c76f88cE34ac9968',
  trackRecord: process.env.BASE_TRACK_RECORD_ADDRESS || '0x822DB0DbbCAB398e610fcBA86DA9BB92d2493321',
  hardnessRegistry: process.env.BASE_HARDNESS_REGISTRY_ADDRESS || '0x15800F40b8988765AD3F46030B73bC8109A793f5',
  convictionOracle: process.env.BASE_ORACLE_ADDRESS || '0x27f51D711171c830dd796D4B03914a8C6c46D75e',
  agentRegistry: process.env.BASE_AGENT_REGISTRY_ADDRESS || '0xB3137D7afE26fbdBcAA95573C7A20be896efde93',
  intentEscrow: process.env.BASE_INTENT_ESCROW_ADDRESS || '0x5D9d534419421B7Edfe9Bb509E4c48512256BC97',
};

// Testnet canary — its OWN env vars so Sepolia and mainnet addresses can never
// silently cross-contaminate.
const BASE_SEPOLIA_CONTRACTS: ContractSet = {
  treasury: process.env.TREASURY_ADDRESS_BASE_SEPOLIA || '0x09a81ff70ddbc5e8b88f168b3eef01384b6cdcea',
  agentEconomy: process.env.BASE_SEPOLIA_AGENT_ECONOMY_ADDRESS || '',
  adversarialBounties: process.env.BASE_SEPOLIA_BOUNTIES_ADDRESS || '',
  trackRecord: process.env.BASE_SEPOLIA_TRACK_RECORD_ADDRESS || '',
  hardnessRegistry: process.env.BASE_SEPOLIA_HARDNESS_REGISTRY_ADDRESS || '',
  convictionOracle: process.env.BASE_SEPOLIA_ORACLE_ADDRESS || '',
  agentRegistry: process.env.BASE_SEPOLIA_AGENT_REGISTRY_ADDRESS || '',
  intentEscrow: process.env.BASE_SEPOLIA_INTENT_ESCROW_ADDRESS || '',
};

// Legacy production deployment. Preserved as the historical record — the plan is
// a cutover, not a deletion, so these stay readable after Base goes live.
const XLAYER_CONTRACTS: ContractSet = {
  treasury: '0x09a81ff70ddbc5e8b88f168b3eef01384b6cdcea',
  agentEconomy: '0xD9540D770C8aF67e9E6412C92D78E34bc11ED871',
  adversarialBounties: '0xa8005ab465a0e02cb14824cd0e7630391fba673d',
  // Env override exists for the local E2E harness only (points v1 at an anvil
  // deployment); unset in every real environment, so prod is unchanged.
  trackRecord: process.env.XLAYER_TRACK_RECORD_ADDRESS || '0xF841b428E6d743187D7BE2242eccC1078fdE2395',
  hardnessRegistry: process.env.HARDNESS_REGISTRY_ADDRESS || '0xD89c1721CD760984a31dE0325fD96cD27bB31040',
  convictionOracle: process.env.BOBBY_ORACLE_ADDRESS || '0x03FA39B3a5B316B7cAcDabD3442577EE32Ab5f3A',
  agentRegistry: '0x823a1670f521a35d4fafe4502bdcb3a8148bba8b',
  intentEscrow: '', // never deployed on X Layer
};

export const BASE: ChainConfig = {
  id: BASE_CHAIN_ID,
  name: 'Base',
  rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  explorerUrl: 'https://basescan.org',
  explorerApiUrl: 'https://api.basescan.org/api',
  nativeSymbol: 'ETH',
  nativeDecimals: 18,
  protocolDeploymentBlock: Number(process.env.BASE_PROTOCOL_DEPLOYMENT_BLOCK || 50_275_770),
  // D-3: on-chain fees are native ETH (resized per deploy); USDC is ONLY the
  // x402/off-chain settlement rail. Keep these two rails separate forever.
  onchainFeeToken: 'native',
  onchainFeeSymbol: 'ETH',
  onchainFeeDecimals: 18,
  x402SettlementToken: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  x402SettlementSymbol: 'USDC',
  x402SettlementDecimals: 6,
  stable: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  stableSymbol: 'USDC',
  stableDecimals: 6,
  weth: '0x4200000000000000000000000000000000000006',
  contracts: BASE_CONTRACTS,
};

export const BASE_SEPOLIA: ChainConfig = {
  ...BASE,
  id: BASE_SEPOLIA_CHAIN_ID,
  name: 'Base Sepolia',
  rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
  explorerUrl: 'https://sepolia.basescan.org',
  explorerApiUrl: 'https://api-sepolia.basescan.org/api',
  protocolDeploymentBlock: 45_364_125,
  x402SettlementToken: '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
  stable: '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
  contracts: BASE_SEPOLIA_CONTRACTS,
};

export const XLAYER: ChainConfig = {
  id: XLAYER_CHAIN_ID,
  name: 'X Layer',
  rpcUrl: process.env.XLAYER_RPC_URL || 'https://rpc.xlayer.tech',
  rpcFallbackUrl: 'https://xlayerrpc.okx.com',
  explorerUrl: 'https://www.oklink.com/xlayer',
  explorerApiUrl: 'https://www.oklink.com/api/v5/explorer/xlayer',
  nativeSymbol: 'OKB',
  nativeDecimals: 18,
  protocolDeploymentBlock: 0x34775f3,
  onchainFeeToken: 'native',
  onchainFeeSymbol: 'OKB',
  onchainFeeDecimals: 18,
  x402SettlementToken: '0x1e4a5963abfd975d8c9021ce480b42188849d41d', // USDT (legacy x402 rail)
  x402SettlementSymbol: 'USDT',
  x402SettlementDecimals: 6,
  stable: '0x1e4a5963abfd975d8c9021ce480b42188849d41d', // USDT on X Layer
  stableSymbol: 'USDT',
  stableDecimals: 6,
  weth: '0xe538905cf8410324e03a5a23c1c177a474d59b2b', // WOKB
  contracts: XLAYER_CONTRACTS,
};

/**
 * The chain the protocol currently reads and writes.
 * Flip to BASE (or set PROTOCOL_CHAIN=base) once the audited redeploy is live
 * and the addresses above are populated.
 */
export type ProtocolChainName = 'xlayer' | 'base-sepolia' | 'base';

/**
 * Resolve the protocol chain strictly. A typo in PROTOCOL_CHAIN must never
 * fall back to X Layer: on a writer that would sign a valid transaction on
 * the wrong network with the same hot key.
 */
export function resolveProtocolChain(value: string | undefined): {
  name: ProtocolChainName;
  config: ChainConfig;
} {
  const normalized = (value || 'xlayer').trim().toLowerCase();
  if (normalized === 'base') return { name: 'base', config: BASE };
  if (normalized === 'base-sepolia') return { name: 'base-sepolia', config: BASE_SEPOLIA };
  if (normalized === 'xlayer') return { name: 'xlayer', config: XLAYER };
  throw new Error(
    `Invalid PROTOCOL_CHAIN=${JSON.stringify(value)}; expected xlayer, base-sepolia, or base`,
  );
}

const selectedProtocolChain = resolveProtocolChain(process.env.PROTOCOL_CHAIN);

export const PROTOCOL_CHAIN_NAME = selectedProtocolChain.name;
export const DEFAULT_CHAIN: ChainConfig = selectedProtocolChain.config;

export const CHAINS: Record<number, ChainConfig> = {
  [BASE.id]: BASE,
  [BASE_SEPOLIA.id]: BASE_SEPOLIA,
  [XLAYER.id]: XLAYER,
};

export function getChain(id: number | string): ChainConfig {
  return CHAINS[Number(id)] ?? DEFAULT_CHAIN;
}

export function txUrl(txHash: string, chainId: number | string = DEFAULT_CHAIN.id): string {
  return `${getChain(chainId).explorerUrl}/tx/${txHash}`;
}

export function addressUrl(address: string, chainId: number | string = DEFAULT_CHAIN.id): string {
  return `${getChain(chainId).explorerUrl}/address/${address}`;
}

// Uniswap on Base (Universal Router + QuoterV2, v3)
export const UNISWAP_BASE = {
  universalRouter: '0x6ff5693b99212da76ad316178a184ab56d299b43',
  quoterV2: '0x3d4e44eb1374240ce5f1b871ab261cd16335b76a',
  v3Factory: '0x33128a8fc17869897dce68ed026d694621f6fdfd',
  permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3',
} as const;
