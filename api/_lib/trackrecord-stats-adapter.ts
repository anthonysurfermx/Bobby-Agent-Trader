import { CHAINS, type ChainConfig } from './chains.js';

export type TrackRecordVersion = ChainConfig['trackRecordVersion'];
export type TrackRecordWinRateFunction = 'getWinRate' | 'getVerifiedWinRate';

/** The getters a stats reader must call for a given TrackRecord ABI version. */
export interface TrackRecordStatSelectors {
  version: TrackRecordVersion;
  winRate: TrackRecordWinRateFunction;
  wins: 'wins' | 'winsVerified';
  losses: 'losses' | 'lossesVerified';
  pnlBps: 'totalPnlBps' | 'totalPnlBpsVerified';
  totalTrades: 'totalTrades';
  totalCommitments: 'totalCommitments';
  pendingCount: 'pendingCount';
}

/**
 * BP-11 (2026-09-04 review): selectors are chosen from the deployment's DECLARED
 * `trackRecordVersion`, never inferred from a chain-id comparison. V1 (X Layer)
 * exposes the combined ledger; V2 (Base family) splits it per D-1 and its public
 * headline is the VERIFIED ledger only — the v1 selectors do not exist there.
 */
export function trackRecordSelectors(chain: Pick<ChainConfig, 'trackRecordVersion' | 'name'>): TrackRecordStatSelectors {
  if (chain.trackRecordVersion === 'v1') {
    return { version: 'v1', winRate: 'getWinRate', wins: 'wins', losses: 'losses', pnlBps: 'totalPnlBps', totalTrades: 'totalTrades', totalCommitments: 'totalCommitments', pendingCount: 'pendingCount' };
  }
  if (chain.trackRecordVersion === 'v2') {
    return { version: 'v2', winRate: 'getVerifiedWinRate', wins: 'winsVerified', losses: 'lossesVerified', pnlBps: 'totalPnlBpsVerified', totalTrades: 'totalTrades', totalCommitments: 'totalCommitments', pendingCount: 'pendingCount' };
  }
  throw new Error(`${chain.name}: trackRecordVersion is not declared`);
}

export function trackRecordWinRateFunction(chainId: number): TrackRecordWinRateFunction {
  const chain = CHAINS[chainId];
  if (!chain) throw new Error(`chain ${chainId}: trackRecordVersion is not declared`);
  return trackRecordSelectors(chain).winRate;
}
