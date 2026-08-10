// api/_lib/chains.ts
// Backend mirror of src/config/chains.ts (kept separate: api/ can't import from
// src/ with Vite aliases, and backend reads RPC overrides from env).
// All chain IDs, tokens, RPCs and explorer URLs must come from here.

export const BASE_CHAIN_ID = 8453;
export const BASE_SEPOLIA_CHAIN_ID = 84532;

export interface ChainConfig {
  id: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  explorerApiUrl: string;
  treasury: string;
  stable: string;
  stableSymbol: string;
  stableDecimals: number;
  weth: string;
}

export const BASE: ChainConfig = {
  id: BASE_CHAIN_ID,
  name: 'Base',
  rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  explorerUrl: 'https://basescan.org',
  explorerApiUrl: 'https://api.basescan.org/api',
  treasury: process.env.TREASURY_ADDRESS_BASE || '0x09a81ff70ddbc5e8b88f168b3eef01384b6cdcea',
  stable: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // native USDC on Base
  stableSymbol: 'USDC',
  stableDecimals: 6,
  weth: '0x4200000000000000000000000000000000000006',
};

export const BASE_SEPOLIA: ChainConfig = {
  id: BASE_SEPOLIA_CHAIN_ID,
  name: 'Base Sepolia',
  rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
  explorerUrl: 'https://sepolia.basescan.org',
  explorerApiUrl: 'https://api-sepolia.basescan.org/api',
  treasury: process.env.TREASURY_ADDRESS_BASE || '0x09a81ff70ddbc5e8b88f168b3eef01384b6cdcea',
  stable: '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
  stableSymbol: 'USDC',
  stableDecimals: 6,
  weth: '0x4200000000000000000000000000000000000006',
};

export const DEFAULT_CHAIN = BASE;

export const CHAINS: Record<number, ChainConfig> = {
  [BASE.id]: BASE,
  [BASE_SEPOLIA.id]: BASE_SEPOLIA,
};

export function getChain(id: number | string): ChainConfig {
  return CHAINS[Number(id)] ?? DEFAULT_CHAIN;
}

// Uniswap on Base (Universal Router + QuoterV2, v3)
export const UNISWAP_BASE = {
  universalRouter: '0x6ff5693b99212da76ad316178a184ab56d299b43',
  quoterV2: '0x3d4e44eb1374240ce5f1b871ab261cd16335b76a',
  v3Factory: '0x33128a8fc17869897dce68ed026d694621f6fdfd',
  permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3',
} as const;
