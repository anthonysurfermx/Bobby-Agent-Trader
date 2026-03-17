// ============================================================
// OnchainIntelBadge — OKX OnchainOS on-chain whale intelligence
// Shows: top holders, top traders, trending status for crypto markets
// Two-layer verification: Polymarket whale + on-chain whale = verified signal
// ============================================================

import { useState, useEffect } from 'react';
import { Activity, Users, TrendingUp } from 'lucide-react';
import {
  detectToken,
  getTokenHolders,
  getTopTraders,
  type TokenHolder,
  type TopTrader,
} from '@/services/okx-onchain.service';

function formatVal(s: string): string {
  const n = parseFloat(s);
  if (isNaN(n)) return s;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

interface Props {
  marketTitle: string;
  polymarketWhales?: string[]; // wallet addresses from Polymarket scan
}

export function OnchainIntelBadge({ marketTitle, polymarketWhales = [] }: Props) {
  const [holders, setHolders] = useState<TokenHolder[] | null>(null);
  const [traders, setTraders] = useState<TopTrader[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const token = detectToken(marketTitle);

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    setLoading(true);

    Promise.all([
      getTokenHolders(token.chainIndex, token.address, 10),
      getTopTraders(token.chainIndex, token.address, 10),
    ]).then(([h, t]) => {
      if (mounted) {
        setHolders(h);
        setTraders(t);
      }
    }).catch(() => {}).finally(() => {
      if (mounted) setLoading(false);
    });

    return () => { mounted = false; };
  }, [token?.address, token?.chainIndex]);

  if (!token) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[10px] text-neutral-600 animate-pulse py-1">
        <Activity className="w-3 h-3" />
        Loading on-chain intelligence...
      </div>
    );
  }

  if (!holders && !traders) return null;

  // Cross-reference: find Polymarket whales that are also top on-chain holders/traders
  const onchainAddresses = new Set([
    ...(holders || []).map(h => h.holderAddress.toLowerCase()),
    ...(traders || []).map(t => t.traderAddress.toLowerCase()),
  ]);
  const crossVerified = polymarketWhales.filter(w => onchainAddresses.has(w.toLowerCase()));

  return (
    <div className="border border-emerald-500/15 bg-emerald-500/5 rounded-lg overflow-hidden">
      {/* Compact header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-emerald-500/8 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-emerald-400">ON-CHAIN INTEL</span>
          <span className="text-[9px] text-neutral-500">OKX OnchainOS · {token.symbol}</span>
        </div>
        <div className="flex items-center gap-2">
          {holders && holders.length > 0 && (
            <span className="flex items-center gap-1 text-[9px] text-neutral-500">
              <Users className="w-3 h-3" />
              {holders.length} holders
            </span>
          )}
          {traders && traders.length > 0 && (
            <span className="flex items-center gap-1 text-[9px] text-neutral-500">
              <TrendingUp className="w-3 h-3" />
              {traders.length} traders
            </span>
          )}
          {crossVerified.length > 0 && (
            <span className="text-[9px] font-bold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">
              {crossVerified.length} VERIFIED
            </span>
          )}
          <span className={`text-[9px] text-neutral-600 transition-transform ${expanded ? 'rotate-180' : ''}`}>
            ▾
          </span>
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-emerald-500/10">
          {/* Cross-verification badge */}
          {crossVerified.length > 0 && (
            <div className="mt-2 text-[10px] px-2 py-1.5 rounded bg-emerald-500/10 text-emerald-400">
              {crossVerified.length} Polymarket whale{crossVerified.length > 1 ? 's' : ''} also active on-chain for {token.symbol} — <b>verified smart money</b>
            </div>
          )}

          {/* Top holders */}
          {holders && holders.length > 0 && (
            <div className="mt-2">
              <div className="text-[9px] text-neutral-500 uppercase tracking-wider mb-1.5">
                Top {token.symbol} Holders
              </div>
              <div className="space-y-1">
                {holders.slice(0, 5).map((h, i) => {
                  const isPolyWhale = polymarketWhales.some(w => w.toLowerCase() === h.holderAddress.toLowerCase());
                  return (
                    <div key={h.holderAddress} className="flex items-center justify-between text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-neutral-500 w-4">#{i + 1}</span>
                        <span className="text-neutral-400 font-mono">
                          {h.holderAddress.slice(0, 6)}...{h.holderAddress.slice(-4)}
                        </span>
                        {isPolyWhale && (
                          <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                            POLY
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-400">{parseFloat(h.share).toFixed(1)}%</span>
                        <span className="text-neutral-500">{formatVal(h.valueUsd)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top traders */}
          {traders && traders.length > 0 && (
            <div>
              <div className="text-[9px] text-neutral-500 uppercase tracking-wider mb-1.5">
                Top {token.symbol} Traders (by PnL)
              </div>
              <div className="space-y-1">
                {traders.slice(0, 5).map((t, i) => {
                  const pnl = parseFloat(t.pnlUsd || t.pnl);
                  const isPolyWhale = polymarketWhales.some(w => w.toLowerCase() === t.traderAddress.toLowerCase());
                  return (
                    <div key={t.traderAddress} className="flex items-center justify-between text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-neutral-500 w-4">#{i + 1}</span>
                        <span className="text-neutral-400 font-mono">
                          {t.traderAddress.slice(0, 6)}...{t.traderAddress.slice(-4)}
                        </span>
                        {isPolyWhale && (
                          <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                            POLY
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-500">{t.tradeCount} trades</span>
                        <span className={pnl > 0 ? 'text-green-400' : pnl < 0 ? 'text-red-400' : 'text-neutral-500'}>
                          {pnl > 0 ? '+' : ''}{formatVal(t.pnlUsd || t.pnl)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
