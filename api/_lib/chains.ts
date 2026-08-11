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
  /** Denomination protocol fees are quoted in on this chain. */
  feeToken: string;
  feeTokenSymbol: string;
  feeTokenDecimals: number;
  stable: string;
  stableSymbol: string;
  stableDecimals: number;
  weth: string;
  contracts: ContractSet;
}

// Deployed addresses. Base entries stay empty until the audited redeploy lands —
// an empty string is a loud failure, which is what we want versus silently
// reading an X Layer contract from a Base RPC.
const BASE_CONTRACTS: ContractSet = {
  treasury: process.env.TREASURY_ADDRESS_BASE || '0x09a81ff70ddbc5e8b88f168b3eef01384b6cdcea',
  agentEconomy: process.env.BASE_AGENT_ECONOMY_ADDRESS || '',
  adversarialBounties: process.env.BASE_BOUNTIES_ADDRESS || '',
  trackRecord: process.env.BASE_TRACK_RECORD_ADDRESS || '',
  hardnessRegistry: process.env.BASE_HARDNESS_REGISTRY_ADDRESS || '',
  convictionOracle: process.env.BASE_ORACLE_ADDRESS || '',
  agentRegistry: process.env.BASE_AGENT_REGISTRY_ADDRESS || '',
};

// Legacy production deployment. Preserved as the historical record — the plan is
// a cutover, not a deletion, so these stay readable after Base goes live.
const XLAYER_CONTRACTS: ContractSet = {
  treasury: '0x09a81ff70ddbc5e8b88f168b3eef01384b6cdcea',
  agentEconomy: '0xD9540D770C8aF67e9E6412C92D78E34bc11ED871',
  adversarialBounties: '0xa8005ab465a0e02cb14824cd0e7630391fba673d',
  trackRecord: '0xF841b428E6d743187D7BE2242eccC1078fdE2395',
  hardnessRegistry: process.env.HARDNESS_REGISTRY_ADDRESS || '0xD89c1721CD760984a31dE0325fD96cD27bB31040',
  convictionOracle: process.env.BOBBY_ORACLE_ADDRESS || '0x03FA39B3a5B316B7cAcDabD3442577EE32Ab5f3A',
  agentRegistry: '0x823a1670f521a35d4fafe4502bdcb3a8148bba8b',
};

export const BASE: ChainConfig = {
  id: BASE_CHAIN_ID,
  name: 'Base',
  rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  explorerUrl: 'https://basescan.org',
  explorerApiUrl: 'https://api.basescan.org/api',
  nativeSymbol: 'ETH',
  nativeDecimals: 18,
  // Fees move from native OKB to USDC — note the 6 decimals, this is the single
  // most dangerous difference in the whole migration.
  feeToken: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  feeTokenSymbol: 'USDC',
  feeTokenDecimals: 6,
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
  feeToken: '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
  stable: '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
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
  feeToken: 'native',
  feeTokenSymbol: 'OKB',
  feeTokenDecimals: 18,
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
export const DEFAULT_CHAIN: ChainConfig =
  process.env.PROTOCOL_CHAIN === 'base'
    ? BASE
    : process.env.PROTOCOL_CHAIN === 'base-sepolia'
      ? BASE_SEPOLIA
      : XLAYER;

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
