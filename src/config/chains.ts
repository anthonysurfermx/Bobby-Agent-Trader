// src/config/chains.ts
// Single source of truth for chain config. All chain IDs, tokens, RPCs and
// explorer URLs must come from here — never hardcode them in components/endpoints.

export const BASE_CHAIN_ID = 8453;
export const BASE_SEPOLIA_CHAIN_ID = 84532;
const BASE_TREASURY = import.meta.env.VITE_TREASURY_ADDRESS_BASE || '';
const BASE_SEPOLIA_TREASURY = import.meta.env.VITE_TREASURY_ADDRESS_BASE_SEPOLIA || '';

export interface ChainTokens {
  /** Native gas token symbol */
  native: string;
  /** Canonical stablecoin address (lowercase) */
  stable: string;
  stableSymbol: string;
  stableDecimals: number;
  weth: string;
}

export interface ChainConfig {
  id: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  explorerName: string;
  treasury: string;
  tokens: ChainTokens;
}

export const BASE: ChainConfig = {
  id: BASE_CHAIN_ID,
  name: 'Base',
  rpcUrl: 'https://mainnet.base.org',
  explorerUrl: 'https://basescan.org',
  explorerName: 'Basescan',
  treasury: BASE_TREASURY,
  tokens: {
    native: 'ETH',
    stable: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // native USDC on Base
    stableSymbol: 'USDC',
    stableDecimals: 6,
    weth: '0x4200000000000000000000000000000000000006',
  },
};

export const BASE_SEPOLIA: ChainConfig = {
  id: BASE_SEPOLIA_CHAIN_ID,
  name: 'Base Sepolia',
  rpcUrl: 'https://sepolia.base.org',
  explorerUrl: 'https://sepolia.basescan.org',
  explorerName: 'Basescan',
  treasury: BASE_SEPOLIA_TREASURY,
  tokens: {
    native: 'ETH',
    stable: '0x036cbd53842c5426634e7929541ec2318f3dcf7e', // USDC on Base Sepolia
    stableSymbol: 'USDC',
    stableDecimals: 6,
    weth: '0x4200000000000000000000000000000000000006',
  },
};

export const DEFAULT_CHAIN = BASE;

export const CHAINS: Record<number, ChainConfig> = {
  [BASE.id]: BASE,
  [BASE_SEPOLIA.id]: BASE_SEPOLIA,
};

export function getChain(id: number | string): ChainConfig {
  return CHAINS[Number(id)] ?? DEFAULT_CHAIN;
}

export function txUrl(txHash: string, chainId: number | string = BASE_CHAIN_ID): string {
  return `${getChain(chainId).explorerUrl}/tx/${txHash}`;
}

export function addressUrl(address: string, chainId: number | string = BASE_CHAIN_ID): string {
  return `${getChain(chainId).explorerUrl}/address/${address}`;
}

// Uniswap on Base (Universal Router + QuoterV2, v3)
export const UNISWAP_BASE = {
  universalRouter: '0x6ff5693b99212da76ad316178a184ab56d299b43',
  quoterV2: '0x3d4e44eb1374240ce5f1b871ab261cd16335b76a',
  v3Factory: '0x33128a8fc17869897dce68ed026d694621f6fdfd',
  permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3',
} as const;
