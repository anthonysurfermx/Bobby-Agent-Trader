// ============================================================
// DEPRECATED — kept only so the 12 existing consumers keep compiling.
//
// Every value here now derives from ./chains.ts, which is the single source of
// truth for chain ids, RPCs, explorers and deployed addresses. Do not add new
// constants to this file, and prefer importing `getChain` / `DEFAULT_CHAIN`
// directly in new code.
//
// Migration note: these exports resolve against DEFAULT_CHAIN, so flipping
// PROTOCOL_CHAIN=base moves every legacy consumer to Base at once — which is
// exactly why the Base addresses must be populated and audited first.
// ============================================================

import { DEFAULT_CHAIN, XLAYER, XLAYER_CHAIN_ID as CHAIN_ID_XLAYER } from './chains.js';

export const BOBBY_PROTOCOL_BASE_URL =
  process.env.BOBBY_PROTOCOL_BASE_URL || 'https://bobbyprotocol.xyz';

/** @deprecated use DEFAULT_CHAIN.id / getChain(id) from ./chains.js */
export const XLAYER_CHAIN_ID = CHAIN_ID_XLAYER;
/** @deprecated use DEFAULT_CHAIN.rpcUrl */
export const XLAYER_RPC_URL = XLAYER.rpcUrl;
/** @deprecated use DEFAULT_CHAIN.rpcFallbackUrl */
export const XLAYER_RPC_FALLBACK_URL = XLAYER.rpcFallbackUrl ?? XLAYER.rpcUrl;

/** @deprecated use DEFAULT_CHAIN.contracts.* */
export const BOBBY_TREASURY = DEFAULT_CHAIN.contracts.treasury;
export const BOBBY_AGENT_ECONOMY = DEFAULT_CHAIN.contracts.agentEconomy;
export const BOBBY_ADVERSARIAL_BOUNTIES = DEFAULT_CHAIN.contracts.adversarialBounties;
export const BOBBY_TRACK_RECORD = DEFAULT_CHAIN.contracts.trackRecord;
export const BOBBY_HARDNESS_REGISTRY = DEFAULT_CHAIN.contracts.hardnessRegistry;
export const BOBBY_CONVICTION_ORACLE = DEFAULT_CHAIN.contracts.convictionOracle;
export const BOBBY_AGENT_REGISTRY = DEFAULT_CHAIN.contracts.agentRegistry;
