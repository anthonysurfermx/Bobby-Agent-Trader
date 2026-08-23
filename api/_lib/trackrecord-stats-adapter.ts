import { XLAYER_CHAIN_ID } from './chains.js';

export type TrackRecordWinRateFunction = 'getWinRate' | 'getVerifiedWinRate';

/**
 * X Layer still exposes the V1 combined ledger. Base-family deployments use
 * TrackRecordV2, whose public headline is the VERIFIED ledger only.
 */
export function trackRecordWinRateFunction(chainId: number): TrackRecordWinRateFunction {
  return chainId === XLAYER_CHAIN_ID ? 'getWinRate' : 'getVerifiedWinRate';
}
