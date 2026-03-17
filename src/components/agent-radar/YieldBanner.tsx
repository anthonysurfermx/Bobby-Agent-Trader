// ============================================================
// YieldBanner — Post-trade yield suggestion
// "Now earn X% APY on your asset via Aave/Compound (OKX DeFi)"
// Shows after a trade action to complete the capital lifecycle
// ============================================================

import { Percent } from 'lucide-react';

// Static yield data — in production this would come from OKX DeFi API
// /api/v5/defi/explore/product/list
const YIELD_DATA: Record<string, { protocol: string; apy: number; type: string; chain: string }[]> = {
  BTC: [
    { protocol: 'Aave V3', apy: 0.12, type: 'Lending', chain: 'Ethereum' },
    { protocol: 'Compound', apy: 0.08, type: 'Lending', chain: 'Ethereum' },
  ],
  ETH: [
    { protocol: 'Lido', apy: 3.2, type: 'Staking', chain: 'Ethereum' },
    { protocol: 'Aave V3', apy: 1.8, type: 'Lending', chain: 'Ethereum' },
    { protocol: 'Rocket Pool', apy: 3.0, type: 'Staking', chain: 'Ethereum' },
  ],
  USDC: [
    { protocol: 'Aave V3', apy: 4.5, type: 'Lending', chain: 'Ethereum' },
    { protocol: 'Compound', apy: 3.8, type: 'Lending', chain: 'Ethereum' },
    { protocol: 'Morpho', apy: 5.2, type: 'Lending', chain: 'Ethereum' },
  ],
  OKB: [
    { protocol: 'OKX Earn', apy: 2.5, type: 'Staking', chain: 'X Layer' },
  ],
};

interface Props {
  asset: string; // BTC, ETH, USDC, etc.
  amount?: number;
  className?: string;
}

export function YieldBanner({ asset, amount, className = '' }: Props) {
  const yields = YIELD_DATA[asset.toUpperCase()];
  if (!yields || yields.length === 0) return null;

  const best = yields[0];

  return (
    <div className={`border border-emerald-500/15 bg-gradient-to-r from-emerald-500/5 to-transparent rounded-lg px-3 py-2 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-emerald-500/10 flex items-center justify-center">
            <Percent className="w-3 h-3 text-emerald-400" />
          </div>
          <div>
            <div className="text-[10px] text-neutral-400">
              Earn yield on your {asset}
            </div>
            <div className="text-xs text-emerald-400 font-medium">
              {best.apy}% APY via {best.protocol}
              {amount && amount > 0 && (
                <span className="text-emerald-400/60 ml-1">
                  (≈ ${(amount * best.apy / 100).toFixed(2)}/yr)
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {yields.slice(0, 3).map(y => (
            <span key={y.protocol} className="text-[8px] px-1.5 py-0.5 rounded bg-neutral-800/80 text-neutral-500">
              {y.protocol} {y.apy}%
            </span>
          ))}
        </div>
      </div>
      <div className="mt-1 text-[8px] text-neutral-600">
        Powered by OKX DeFi · 80+ protocols aggregated
      </div>
    </div>
  );
}
