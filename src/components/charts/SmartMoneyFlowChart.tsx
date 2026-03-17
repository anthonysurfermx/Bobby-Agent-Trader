import { Sankey, Tooltip, ResponsiveContainer, Rectangle, Layer } from 'recharts';
import type { SmartMoneyMarket, LeaderboardEntry } from '@/services/polymarket.service';

function formatUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

interface SankeyNode {
  name: string;
  isTrader: boolean;
}

interface SankeyLink {
  source: number;
  target: number;
  value: number;
}

function buildSankeyData(markets: SmartMoneyMarket[], leaderboard: LeaderboardEntry[]) {
  const topMarkets = markets.slice(0, 8);

  // Collect traders that appear in top consensus markets
  const traderMap = new Map<string, { name: string; totalValue: number }>();
  for (const m of topMarkets) {
    for (const t of m.traders) {
      const existing = traderMap.get(t.address);
      if (existing) existing.totalValue += t.positionValue;
      else traderMap.set(t.address, { name: t.name, totalValue: t.positionValue });
    }
  }

  // Top 15 traders by deployed capital
  const topTraders = [...traderMap.entries()]
    .sort((a, b) => b[1].totalValue - a[1].totalValue)
    .slice(0, 15);

  const traderAddressSet = new Set(topTraders.map(([addr]) => addr));

  const nodes: SankeyNode[] = [
    ...topTraders.map(([, t]) => ({ name: t.name, isTrader: true })),
    ...topMarkets.map(m => ({
      name: m.title.length > 30 ? m.title.slice(0, 30) + '…' : m.title,
      isTrader: false,
    })),
  ];

  const links: SankeyLink[] = [];
  for (let mi = 0; mi < topMarkets.length; mi++) {
    for (const trader of topMarkets[mi].traders) {
      if (!traderAddressSet.has(trader.address)) continue;
      const ti = topTraders.findIndex(([addr]) => addr === trader.address);
      if (ti >= 0 && trader.positionValue > 0) {
        links.push({
          source: ti,
          target: topTraders.length + mi,
          value: Math.max(trader.positionValue, 1),
        });
      }
    }
  }

  return { nodes, links };
}

function CustomNode({ x, y, width, height, payload }: any) {
  const isTrader = payload?.isTrader;
  return (
    <Layer>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill={isTrader ? '#22c55e' : '#00D4FF'}
        opacity={0.8}
        radius={[2, 2, 2, 2]}
      />
      <text
        x={isTrader ? x - 4 : x + width + 4}
        y={y + height / 2}
        textAnchor={isTrader ? 'end' : 'start'}
        dominantBaseline="central"
        fill={isTrader ? '#86efac' : '#67e8f9'}
        fontSize={10}
        fontFamily="monospace"
      >
        {payload?.name || ''}
      </text>
    </Layer>
  );
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  const sourceName = data.source?.name || '';
  const targetName = data.target?.name || '';
  const value = data.value || 0;

  return (
    <div className="rounded border border-green-500/30 bg-black/95 px-3 py-2 font-mono text-[11px]">
      <div className="text-green-400">{sourceName}</div>
      <div className="text-green-300/60 my-0.5">→ {targetName}</div>
      <div className="text-green-300 font-bold">{formatUSD(value)}</div>
    </div>
  );
}

interface SmartMoneyFlowChartProps {
  markets: SmartMoneyMarket[];
  leaderboard: LeaderboardEntry[];
}

export function SmartMoneyFlowChart({ markets, leaderboard }: SmartMoneyFlowChartProps) {
  const { nodes, links } = buildSankeyData(markets, leaderboard);

  if (links.length === 0) return null;

  return (
    <div className="border border-green-500/20 bg-black/60 rounded overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-green-500/5 border-b border-green-500/10">
        <span className="text-green-400/60 text-[10px] font-mono">CAPITAL FLOW: traders → markets</span>
        <span className="text-green-400/30 text-[10px] font-mono">{nodes.length} nodes · {links.length} flows</span>
      </div>
      <ResponsiveContainer width="100%" height={350}>
        <Sankey
          data={{ nodes, links }}
          nodeWidth={8}
          nodePadding={14}
          linkCurvature={0.4}
          iterations={64}
          margin={{ top: 20, right: 140, bottom: 20, left: 140 }}
          node={<CustomNode />}
          link={{ stroke: '#22c55e', strokeOpacity: 0.15 }}
        >
          <Tooltip content={<CustomTooltip />} />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
}
