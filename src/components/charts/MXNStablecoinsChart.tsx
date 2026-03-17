import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { CHART_COLORS } from './DefiChartTheme';

const data = [
  {
    name: 'MXNB',
    issuer: 'Bitso (Juno)',
    tvl: 15.0,
    launch: 'Mar 2025',
    chains: 'Arbitrum, Ethereum, Avalanche',
    focus: 'Enterprise B2B',
    color: '#00D4AA',
  },
  {
    name: 'MXNe',
    issuer: 'Brale',
    tvl: 8.0,
    launch: '2024',
    chains: 'Solana, Stellar',
    focus: 'Cross-border fintech',
    color: '#8B5CF6',
  },
  {
    name: 'MXNT',
    issuer: 'Tether',
    tvl: 6.0,
    launch: 'May 2022',
    chains: 'Ethereum, Tron, Polygon',
    focus: 'Retail / general',
    color: '#26A17B',
  },
  {
    name: 'MMXN',
    issuer: 'Moneta',
    tvl: 5.0,
    launch: '2023',
    chains: 'Polygon',
    focus: 'Financial inclusion',
    color: '#F97316',
  },
];

const total = data.reduce((s, d) => s + d.tvl, 0);

function ValueLabel({ x, y, width, value }: { x?: number; y?: number; width?: number; value?: number }) {
  if (!x || !y || !width || !value) return null;
  return (
    <text x={x + width + 6} y={(y ?? 0) + 15} fill={CHART_COLORS.textLight} fontSize={11} fontFamily="monospace">
      ${value}M
    </text>
  );
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: typeof data[0] }> }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const share = ((d.tvl / total) * 100).toFixed(1);
  return (
    <div className="rounded-lg border bg-background/95 backdrop-blur px-3 py-2.5 text-xs shadow-lg min-w-[180px]">
      <div className="font-semibold text-sm mb-1" style={{ color: d.color }}>{d.name}</div>
      <div className="space-y-0.5 text-muted-foreground">
        <div><span className="text-foreground font-medium">Issuer:</span> {d.issuer}</div>
        <div><span className="text-foreground font-medium">TVL:</span> ${d.tvl}M ({share}%)</div>
        <div><span className="text-foreground font-medium">Launch:</span> {d.launch}</div>
        <div><span className="text-foreground font-medium">Chains:</span> {d.chains}</div>
        <div><span className="text-foreground font-medium">Focus:</span> {d.focus}</div>
      </div>
    </div>
  );
}

export function MXNStablecoinsChart() {
  return (
    <div className="w-full rounded-xl border border-border bg-card p-4 my-8">
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-foreground">MXN Stablecoin Landscape — Feb 2026</h4>
        <p className="text-xs text-muted-foreground">Total market: ~${total}M · 4 issuers competing for Mexico's peso-pegged stablecoin market</p>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 45, top: 0, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={52}
            tick={{ fill: CHART_COLORS.textMuted, fontSize: 12, fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="tvl" radius={[0, 6, 6, 0]} maxBarSize={26}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            <LabelList content={<ValueLabel />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Legend with details */}
      <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-border/50">
        {data.map((d) => (
          <div key={d.name} className="flex items-start gap-2 text-[11px]">
            <div className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: d.color }} />
            <div>
              <span className="font-semibold text-foreground">{d.name}</span>
              <span className="text-muted-foreground"> · {d.issuer}</span>
              <div className="text-muted-foreground">{d.focus} · {d.launch}</div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-right text-[10px] mt-3" style={{ color: CHART_COLORS.textMuted }}>
        Data manually curated · DeFi México
      </p>
    </div>
  );
}
