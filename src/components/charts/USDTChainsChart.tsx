import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { CHART_COLORS } from './DefiChartTheme';

const data = [
  { name: 'Tron', value: 83.83, percent: 45.6, color: '#FF0013' },
  { name: 'Ethereum', value: 79.83, percent: 43.4, color: '#627EEA' },
  { name: 'BSC', value: 8.98, percent: 4.9, color: '#F3BA2F' },
  { name: 'Solana', value: 2.98, percent: 1.6, color: '#9945FF' },
  { name: 'Aptos', value: 1.01, percent: 0.6, color: '#00CFBE' },
  { name: 'Arbitrum', value: 0.97, percent: 0.5, color: '#28A0F0' },
  { name: 'Polygon', value: 0.92, percent: 0.5, color: '#8247E5' },
  { name: 'Others', value: 5.14, percent: 2.8, color: '#6B7280' },
];

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: typeof data[0] }> }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background/95 backdrop-blur px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold" style={{ color: d.color }}>{d.name}</div>
      <div>${d.value.toFixed(2)}B ({d.percent}%)</div>
    </div>
  );
}

function CustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent: pct, name }: {
  cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; percent: number; name: string;
}) {
  if (pct < 0.03) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {name}
    </text>
  );
}

export function USDTChainsChart() {
  return (
    <div className="w-full rounded-xl border border-border bg-card p-4 my-8">
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-foreground">USDT Distribution by Chain — Feb 2026</h4>
        <p className="text-xs text-muted-foreground">$184B deployed across 16+ blockchains · Tron leads with 45.6%</p>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            outerRadius={120}
            innerRadius={50}
            dataKey="value"
            labelLine={false}
            label={CustomLabel}
            animationDuration={800}
          >
            {data.map((d, i) => <Cell key={i} fill={d.color} stroke="transparent" />)}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value: string) => <span style={{ color: CHART_COLORS.textMuted, fontSize: 11 }}>{value}</span>}
            iconSize={8}
          />
        </PieChart>
      </ResponsiveContainer>
      <p className="text-right text-[10px] mt-1" style={{ color: CHART_COLORS.textMuted }}>
        Source: DefiLlama Stablecoins API · DeFi México
      </p>
    </div>
  );
}
