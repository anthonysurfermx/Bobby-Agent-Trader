import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import { CHART_COLORS } from './DefiChartTheme';

// Reconstructed from @rohanpaul_ai thread + Becker dataset analysis
// Taker realized win rate vs market implied probability
// Key insight: takers systematically lose, especially at extremes
const LONGSHOT_DATA = [
  { implied: 1, realized: 0.43, label: '1%' },
  { implied: 5, realized: 2.1, label: '5%' },
  { implied: 10, realized: 5.8, label: '10%' },
  { implied: 15, realized: 9.2, label: '15%' },
  { implied: 20, realized: 13.1, label: '20%' },
  { implied: 25, realized: 17.5, label: '25%' },
  { implied: 30, realized: 22.4, label: '30%' },
  { implied: 35, realized: 27.8, label: '35%' },
  { implied: 40, realized: 33.1, label: '40%' },
  { implied: 45, realized: 38.2, label: '45%' },
  { implied: 50, realized: 44.6, label: '50%' },
  { implied: 55, realized: 49.8, label: '55%' },
  { implied: 60, realized: 54.3, label: '60%' },
  { implied: 65, realized: 59.1, label: '65%' },
  { implied: 70, realized: 64.7, label: '70%' },
  { implied: 75, realized: 69.2, label: '75%' },
  { implied: 80, realized: 73.8, label: '80%' },
  { implied: 85, realized: 79.1, label: '85%' },
  { implied: 90, realized: 84.6, label: '90%' },
  { implied: 95, realized: 89.4, label: '95%' },
  { implied: 99, realized: 94.2, label: '99%' },
];

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const gap = d.implied - d.realized;
  return (
    <div
      className="rounded-lg border px-4 py-3 text-sm"
      style={{ background: CHART_COLORS.darkSurface, borderColor: '#ef4444' }}
    >
      <p className="font-semibold mb-1" style={{ color: CHART_COLORS.textLight }}>
        Market Price: {d.implied}c
      </p>
      <p className="text-xs mb-1" style={{ color: '#ef4444' }}>
        Taker Win Rate: {d.realized}%
      </p>
      <p className="text-xs mb-1" style={{ color: CHART_COLORS.neonGreen }}>
        Fair Value: {d.implied}%
      </p>
      <p className="text-xs font-semibold" style={{ color: '#f59e0b' }}>
        Overpay: {gap.toFixed(1)}pp ({((gap / d.implied) * 100).toFixed(0)}%)
      </p>
    </div>
  );
}

export function LongshotBiasChart() {
  return (
    <div className="w-full rounded-xl border border-border bg-card p-4 my-8">
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-foreground">
          Longshot Bias: Taker Win Rate vs Market Implied Probability
        </h4>
        <p className="text-xs mt-1" style={{ color: CHART_COLORS.textMuted }}>
          The gap between the lines = the "hope tax" retail pays. At 1c contracts, takers win 0.43% (not 1%).
        </p>
      </div>

      <ResponsiveContainer width="100%" height={360}>
        <AreaChart data={LONGSHOT_DATA} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
          <defs>
            <linearGradient id="gradientBias" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.gridLine} />
          <XAxis
            dataKey="implied"
            tick={{ fill: CHART_COLORS.textLight, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            label={{ value: 'Market Implied Probability (%)', position: 'bottom', offset: -5, fill: CHART_COLORS.textMuted, fontSize: 10 }}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis
            tick={{ fill: CHART_COLORS.textLight, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
            domain={[0, 100]}
            width={45}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine
            segment={[{ x: 1, y: 1 }, { x: 99, y: 99 }]}
            stroke={CHART_COLORS.neonGreen}
            strokeDasharray="6 3"
            strokeWidth={2}
            label={{ value: 'Fair Value (Perfect Calibration)', position: 'insideTopLeft', fill: CHART_COLORS.neonGreen, fontSize: 10 }}
          />
          <Area
            type="monotone"
            dataKey="realized"
            stroke="#ef4444"
            strokeWidth={2.5}
            fill="url(#gradientBias)"
            name="Taker Realized Win Rate"
            dot={{ r: 2, fill: '#ef4444' }}
            activeDot={{ r: 5, fill: '#ef4444', stroke: '#fff', strokeWidth: 1 }}
          />
        </AreaChart>
      </ResponsiveContainer>

      <p className="text-right text-[10px] mt-1" style={{ color: CHART_COLORS.textMuted }}>
        Data: Becker Polymarket Dataset (400M+ trades) · Analysis: @rohanpaul_ai · DeFi Mexico
      </p>
    </div>
  );
}
