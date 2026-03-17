import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { CHART_COLORS } from './DefiChartTheme';

const data = [
  { name: 'USDT', value: 183.66, share: 59.8, color: '#26A17B' },
  { name: 'USDC', value: 73.69, share: 24.0, color: '#2775CA' },
  { name: 'USDS', value: 6.98, share: 2.3, color: '#F5AC37' },
  { name: 'USDe', value: 6.30, share: 2.1, color: '#333333' },
  { name: 'USD1', value: 5.29, share: 1.7, color: '#1E40AF' },
  { name: 'DAI', value: 4.38, share: 1.4, color: '#F4B731' },
  { name: 'PYUSD', value: 4.03, share: 1.3, color: '#003087' },
  { name: 'Others', value: 22.78, share: 7.4, color: '#6B7280' },
];

function ValueLabel({ x, y, width, value }: { x?: number; y?: number; width?: number; value?: number }) {
  if (!x || !y || !width || !value) return null;
  return (
    <text x={x + width + 6} y={(y ?? 0) + 14} fill={CHART_COLORS.textLight} fontSize={11} fontFamily="monospace">
      ${value}B
    </text>
  );
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: typeof data[0] }> }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background/95 backdrop-blur px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold" style={{ color: d.color }}>{d.name}</div>
      <div>${d.value.toFixed(2)}B</div>
      <div className="text-muted-foreground">{d.share}% market share</div>
    </div>
  );
}

export function TetherDominanceChart() {
  return (
    <div className="w-full rounded-xl border border-border bg-card p-4 my-8">
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-foreground">Stablecoin Market Share — Feb 2026</h4>
        <p className="text-xs text-muted-foreground">Total market: $307B · USDT dominates with 59.8%</p>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 50, top: 0, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={52} tick={{ fill: CHART_COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            <LabelList content={<ValueLabel />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-right text-[10px] mt-1" style={{ color: CHART_COLORS.textMuted }}>
        Source: DefiLlama Stablecoins API · DeFi México
      </p>
    </div>
  );
}
