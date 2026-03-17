import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { CHART_COLORS } from './DefiChartTheme';

const data = [
  { month: 'Feb 25', supply: 142.41 },
  { month: 'Mar 25', supply: 143.68 },
  { month: 'Apr 25', supply: 144.94 },
  { month: 'May 25', supply: 150.62 },
  { month: 'Jun 25', supply: 155.67 },
  { month: 'Jul 25', supply: 159.99 },
  { month: 'Aug 25', supply: 165.26 },
  { month: 'Sep 25', supply: 168.88 },
  { month: 'Oct 25', supply: 178.14 },
  { month: 'Nov 25', supply: 183.60 },
  { month: 'Dec 25', supply: 185.64 },
  { month: 'Jan 26', supply: 186.90 },
  { month: 'Feb 26', supply: 183.66 },
];

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.[0]) return null;
  return (
    <div className="rounded-lg border bg-background/95 backdrop-blur px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold text-foreground">{label}</div>
      <div style={{ color: '#26A17B' }}>${payload[0].value.toFixed(2)}B</div>
    </div>
  );
}

export function USDTGrowthChart() {
  return (
    <div className="w-full rounded-xl border border-border bg-card p-4 my-8">
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-foreground">USDT Supply Growth — Last 12 Months</h4>
        <p className="text-xs text-muted-foreground">From $142B to $184B (+29%) · Peak: $187B in Jan 2026</p>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="gradientTether" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#26A17B" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#26A17B" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="month" tick={{ fill: CHART_COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={30} />
          <YAxis tickFormatter={(v) => `$${v}B`} tick={{ fill: CHART_COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={55} domain={[135, 195]} />
          <Tooltip content={<CustomTooltip />} />
          <Area type="monotone" dataKey="supply" stroke="#26A17B" strokeWidth={2} fill="url(#gradientTether)" animationDuration={800} />
        </AreaChart>
      </ResponsiveContainer>
      <p className="text-right text-[10px] mt-1" style={{ color: CHART_COLORS.textMuted }}>
        Source: DefiLlama Stablecoins API · DeFi México
      </p>
    </div>
  );
}
