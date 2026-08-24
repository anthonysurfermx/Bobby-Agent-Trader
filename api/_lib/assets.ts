// ============================================================
// api/_lib/assets.ts — Multi-asset resolver (thin adapter)
// ------------------------------------------------------------
// One brain: all free-text → instrument resolution lives in
// src/lib/okx-asset-search.ts (spoken-name aliases, dictation
// mangles, fuzzy net, proxy safety). This module only adapts
// that canonical result to the shape the desk endpoints expect,
// so a phrase can never be interpreted two different ways by
// two different resolvers.
// ============================================================

import {
  getBaseVenues,
  resolveOkxAssetFromText,
  type OkxMatchKind,
  type OkxResolvedAsset,
} from '../../src/lib/okx-asset-search.js';

export type AssetKind = 'crypto' | 'stock' | 'metal' | 'forex' | 'commodity' | 'bond' | 'other';

export interface ResolvedAsset {
  base: string;          // BTC, NVDA, XAUT…
  instId: string;        // BTC-USDT, NVDA-USDT-SWAP…
  instType: 'SPOT' | 'SWAP';
  kind: AssetKind;
  display: string;       // human label
  perpInstId: string | null; // swap for funding/OI (crypto)
}

export interface ResolvedAssetDetailed extends ResolvedAsset {
  /** How the match happened — fuzzy/proxy should be user-confirmed. */
  matchKind: OkxMatchKind;
  needsConfirmation: boolean;
  proxyNote: string | null;
}

function kindFromClass(assetClass: string): AssetKind {
  switch (assetClass) {
    case 'equity': return 'stock';
    case 'commodity': return 'metal';
    case 'fx': return 'forex';
    case 'crypto': return 'crypto';
    default: return 'other';
  }
}

async function toResolved(hit: OkxResolvedAsset): Promise<ResolvedAssetDetailed | null> {
  const base = hit.instrument.symbol;
  const kind = kindFromClass(hit.instrument.assetClass);
  const { spotId, swapId } = await getBaseVenues(base);
  // Crypto trades on SPOT; everything else (stock/metal/fx) is SWAP-only.
  const instId = (kind === 'crypto' ? (spotId || swapId) : (swapId || spotId)) || hit.instrument.instId;
  return {
    base,
    instId,
    instType: instId.endsWith('-SWAP') ? 'SWAP' : 'SPOT',
    kind,
    display: base,
    perpInstId: swapId,
    matchKind: hit.matchKind,
    needsConfirmation: hit.needsConfirmation,
    proxyNote: hit.proxyNote,
  };
}

/**
 * Resolve free text to an asset WITH safety metadata. Callers that talk to
 * a human should ask "did you mean…?" when needsConfirmation is true.
 */
export async function resolveAssetDetailed(text: string): Promise<ResolvedAssetDetailed | null> {
  const hit = await resolveOkxAssetFromText(text, { instTypes: ['SPOT', 'SWAP'] });
  if (!hit) return null;
  return toResolved(hit);
}

/** Resolve a free-text query to an OKX asset, or null (→ general market). */
export async function resolveAssetFromText(text: string): Promise<ResolvedAsset | null> {
  return resolveAssetDetailed(text);
}

/** True if the user is asking about the market in general (no specific asset). */
export function isMarketQuery(text: string): boolean {
  const t = text.toLowerCase();
  return /\bmercado\b|\bmarket\b|\bma(ñ|n)ana\b|\bhoy\b|\bgeneral\b|qu[eé] va a pasar|c[oó]mo (est|va|viene)/.test(t);
}
