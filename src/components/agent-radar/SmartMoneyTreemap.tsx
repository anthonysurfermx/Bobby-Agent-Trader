// ============================================================
// SmartMoneyTreemap — Heatmap-style visualization of whale capital
// Block size = capital deployed, color = consensus direction
// Inspired by finviz.com + Paradigm Predictions
// ============================================================

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { SmartMoneyMarket } from '@/services/polymarket.service';

function formatUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len) + '…' : s;
}

interface TreemapBlock {
  market: SmartMoneyMarket;
  weight: number; // 0-1 normalized
  area: number;   // % of total area
}

interface Props {
  markets: SmartMoneyMarket[];
  onSelectMarket?: (market: SmartMoneyMarket) => void;
}

export function SmartMoneyTreemap({ markets, onSelectMarket }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const blocks = useMemo<TreemapBlock[]>(() => {
    if (markets.length === 0) return [];

    const totalCapital = markets.reduce((sum, m) => sum + m.totalCapital, 0);
    if (totalCapital === 0) return [];

    return markets
      .slice(0, 12) // Max 12 blocks for clean layout
      .map(market => ({
        market,
        weight: market.totalCapital / totalCapital,
        area: (market.totalCapital / totalCapital) * 100,
      }))
      .sort((a, b) => b.weight - a.weight);
  }, [markets]);

  if (blocks.length === 0) {
    return (
      <div className="text-center py-8 text-neutral-500 text-sm">
        No data for treemap yet.
      </div>
    );
  }

  // Squarified treemap layout using slice-and-dice
  const layout = computeTreemapLayout(blocks);

  return (
    <div className="space-y-2">
      {/* Treemap container */}
      <div className="relative w-full rounded-xl overflow-hidden border border-neutral-800" style={{ height: 320 }}>
        {layout.map((item, idx) => {
          const { market } = item.block;
          const isYes = market.topOutcome.toLowerCase() === 'yes';
          const isHovered = hoveredId === market.conditionId;
          const consensus = market.capitalConsensus;

          // Color intensity based on consensus strength
          const intensity = Math.min(consensus / 100, 1);
          const bgColor = isYes
            ? `rgba(34, 197, 94, ${0.08 + intensity * 0.22})`  // green
            : `rgba(239, 68, 68, ${0.08 + intensity * 0.22})`; // red
          const borderColor = isYes
            ? `rgba(34, 197, 94, ${0.15 + intensity * 0.25})`
            : `rgba(239, 68, 68, ${0.15 + intensity * 0.25})`;

          const isLarge = item.w > 25 && item.h > 20; // % thresholds
          const isMedium = item.w > 15 && item.h > 15;

          return (
            <motion.button
              key={market.conditionId}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.03, duration: 0.2 }}
              className="absolute flex flex-col justify-between p-2 cursor-pointer transition-all duration-150 overflow-hidden"
              style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                width: `${item.w}%`,
                height: `${item.h}%`,
                background: bgColor,
                borderRight: '1px solid rgba(38,38,38,0.8)',
                borderBottom: '1px solid rgba(38,38,38,0.8)',
                zIndex: isHovered ? 10 : 1,
                transform: isHovered ? 'scale(1.02)' : 'scale(1)',
                boxShadow: isHovered ? `0 0 20px ${borderColor}` : 'none',
              }}
              onMouseEnter={() => setHoveredId(market.conditionId)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onSelectMarket?.(market)}
            >
              {/* Title */}
              <div>
                {isLarge ? (
                  <div className="text-[11px] font-medium text-neutral-200 leading-tight line-clamp-3">
                    {market.title}
                  </div>
                ) : isMedium ? (
                  <div className="text-[10px] font-medium text-neutral-300 leading-tight line-clamp-2">
                    {truncate(market.title, 40)}
                  </div>
                ) : (
                  <div className="text-[9px] text-neutral-400 leading-tight line-clamp-1">
                    {truncate(market.title, 20)}
                  </div>
                )}
              </div>

              {/* Bottom stats */}
              <div className="flex items-end justify-between gap-1">
                <div>
                  {/* Consensus direction */}
                  <span className={`text-xs font-bold ${isYes ? 'text-green-400' : 'text-red-400'}`}>
                    {market.topOutcome} {market.topOutcomeCapitalPct}%
                  </span>
                  {/* Capital */}
                  {(isLarge || isMedium) && (
                    <div className="text-[9px] text-neutral-500 mt-0.5">
                      {formatUSD(market.totalCapital)} · {market.traderCount}w
                    </div>
                  )}
                </div>
                {/* Edge indicator */}
                {isLarge && market.edgePercent !== 0 && (
                  <span className={`text-[9px] px-1 py-0.5 rounded ${
                    market.edgeDirection === 'PROFIT'
                      ? 'bg-green-500/20 text-green-400'
                      : market.edgeDirection === 'UNDERWATER'
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-neutral-800 text-neutral-500'
                  }`}>
                    {market.edgePercent > 0 ? '+' : ''}{market.edgePercent}pts
                  </span>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Hover tooltip */}
      {hoveredId && (() => {
        const block = blocks.find(b => b.market.conditionId === hoveredId);
        if (!block) return null;
        const m = block.market;
        return (
          <div className="flex items-center justify-between text-[10px] px-2 py-1.5 bg-neutral-900/80 rounded-lg border border-neutral-800">
            <span className="text-neutral-300 truncate mr-3">{m.title}</span>
            <div className="flex items-center gap-3 shrink-0">
              <span className={m.topOutcome.toLowerCase() === 'yes' ? 'text-green-400' : 'text-red-400'}>
                {m.topOutcome} {m.topOutcomeCapitalPct}%
              </span>
              <span className="text-neutral-500">{formatUSD(m.totalCapital)}</span>
              <span className="text-neutral-500">{m.traderCount} whales</span>
              <span className="text-neutral-500">{m.capitalConsensus}% consensus</span>
            </div>
          </div>
        );
      })()}

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-[9px] text-neutral-600">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-green-500/30" />
          <span>YES consensus</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-red-500/30" />
          <span>NO consensus</span>
        </div>
        <span>Block size = capital deployed</span>
      </div>
    </div>
  );
}

// ---- Squarified treemap layout algorithm ----

interface LayoutRect {
  block: TreemapBlock;
  x: number;
  y: number;
  w: number;
  h: number;
}

function computeTreemapLayout(blocks: TreemapBlock[]): LayoutRect[] {
  const results: LayoutRect[] = [];
  squarify(blocks, 0, 0, 100, 100, results);
  return results;
}

function squarify(
  blocks: TreemapBlock[],
  x: number, y: number, w: number, h: number,
  results: LayoutRect[]
) {
  if (blocks.length === 0) return;
  if (blocks.length === 1) {
    results.push({ block: blocks[0], x, y, w, h });
    return;
  }

  // Total weight of remaining blocks
  const total = blocks.reduce((s, b) => s + b.weight, 0);
  if (total === 0) return;

  // Decide split direction: cut along the longer edge
  const isWide = w >= h;

  // Find best split point using squarified heuristic
  let bestIdx = 0;
  let bestRatio = Infinity;
  let runningWeight = 0;

  for (let i = 0; i < blocks.length - 1; i++) {
    runningWeight += blocks[i].weight;
    const frac = runningWeight / total;

    // Aspect ratio of the split
    const r = isWide
      ? Math.max((frac * w) / h, h / (frac * w))
      : Math.max((frac * h) / w, w / (frac * h));

    if (r < bestRatio) {
      bestRatio = r;
      bestIdx = i;
    }
  }

  const leftBlocks = blocks.slice(0, bestIdx + 1);
  const rightBlocks = blocks.slice(bestIdx + 1);
  const leftWeight = leftBlocks.reduce((s, b) => s + b.weight, 0);
  const frac = leftWeight / total;

  if (isWide) {
    const splitW = w * frac;
    layoutStrip(leftBlocks, x, y, splitW, h, !isWide, results);
    squarify(rightBlocks, x + splitW, y, w - splitW, h, results);
  } else {
    const splitH = h * frac;
    layoutStrip(leftBlocks, x, y, w, splitH, !isWide, results);
    squarify(rightBlocks, x, y + splitH, w, h - splitH, results);
  }
}

function layoutStrip(
  blocks: TreemapBlock[],
  x: number, y: number, w: number, h: number,
  vertical: boolean,
  results: LayoutRect[]
) {
  const total = blocks.reduce((s, b) => s + b.weight, 0);
  if (total === 0) return;

  let offset = 0;
  for (const block of blocks) {
    const frac = block.weight / total;
    if (vertical) {
      const blockH = h * frac;
      results.push({ block, x, y: y + offset, w, h: blockH });
      offset += blockH;
    } else {
      const blockW = w * frac;
      results.push({ block, x: x + offset, y, w: blockW, h });
      offset += blockW;
    }
  }
}
