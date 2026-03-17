import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Legend,
} from 'recharts';
import { CHART_COLORS } from './DefiChartTheme';

// Kelly Criterion comparison: Traditional vs Empirical (Monte Carlo adjusted)
// Traditional Kelly assumes certainty in edge estimate -> leads to over-betting
// Empirical Kelly uses bootstrap resampling -> accounts for uncertainty
// Half-Kelly is the institutional standard (cap at 15% bankroll)
const KELLY_DATA = [
  { edge: 1, traditional: 2.0, empirical: 0.8, halfKelly: 0.4 },
  { edge: 3, traditional: 6.1, empirical: 2.4, halfKelly: 1.2 },
  { edge: 5, traditional: 10.5, empirical: 4.1, halfKelly: 2.1 },
  { edge: 8, traditional: 17.4, empirical: 7.2, halfKelly: 3.6 },
  { edge: 10, traditional: 22.2, empirical: 9.8, halfKelly: 4.9 },
  { edge: 12, traditional: 27.3, empirical: 12.1, halfKelly: 6.1 },
  { edge: 15, traditional: 35.7, empirical: 15.4, halfKelly: 7.7 },
  { edge: 18, traditional: 43.9, empirical: 18.2, halfKelly: 9.1 },
  { edge: 20, traditional: 50.0, empirical: 21.3, halfKelly: 10.7 },
  { edge: 25, traditional: 62.5, empirical: 26.8, halfKelly: 13.4 },
  { edge: 30, traditional: 75.0, empirical: 31.2, halfKelly: 15.0 },
];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg border px-4 py-3 text-sm"
      style={{ background: CHART_COLORS.darkSurface, borderColor: '#a855f7' }}
    >
      <p className="font-semibold mb-2" style={{ color: CHART_COLORS.textLight }}>
        Estimated Edge: {label}%
      </p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-xs mb-1" style={{ color: p.color }}>
          {p.name}: {p.value.toFixed(1)}% of bankroll
        </p>
      ))}
      <p className="text-xs mt-2 italic" style={{ color: CHART_COLORS.textMuted }}>
        Traditional Kelly over-bets by {((payload[0]?.value / payload[1]?.value - 1) * 100).toFixed(0)}%
      </p>
    </div>
  );
}

export function KellyPositionChart() {
  return (
    <div className="w-full rounded-xl border border-border bg-card p-4 my-8">
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-foreground">
          Position Sizing: Traditional Kelly vs Empirical Kelly (Monte Carlo)
        </h4>
        <p className="text-xs mt-1" style={{ color: CHART_COLORS.textMuted }}>
          Traditional Kelly assumes certainty in your edge. Empirical Kelly uses 10K Monte Carlo simulations to account for uncertainty. Half-Kelly (capped at 15%) is the institutional standard.
        </p>
      </div>

      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={KELLY_DATA} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.gridLine} />
          <XAxis
            dataKey="edge"
            tick={{ fill: CHART_COLORS.textLight, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            label={{ value: 'Estimated Edge (%)', position: 'bottom', offset: -5, fill: CHART_COLORS.textMuted, fontSize: 10 }}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis
            tick={{ fill: CHART_COLORS.textLight, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
            width={45}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, color: CHART_COLORS.textMuted }} />
          <ReferenceLine
            y={15}
            stroke="#f59e0b"
            strokeDasharray="8 4"
            strokeWidth={1.5}
            label={{ value: 'Max Position Cap (15%)', position: 'right', fill: '#f59e0b', fontSize: 10 }}
          />
          <Line
            type="monotone"
            dataKey="traditional"
            name="Traditional Kelly"
            stroke="#ef4444"
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={{ r: 3, fill: '#ef4444' }}
            activeDot={{ r: 5, fill: '#ef4444' }}
          />
          <Line
            type="monotone"
            dataKey="empirical"
            name="Empirical Kelly (Monte Carlo)"
            stroke="#a855f7"
            strokeWidth={2.5}
            dot={{ r: 3, fill: '#a855f7' }}
            activeDot={{ r: 5, fill: '#a855f7' }}
          />
          <Line
            type="monotone"
            dataKey="halfKelly"
            name="Half-Kelly (Institutional)"
            stroke={CHART_COLORS.neonGreen}
            strokeWidth={2.5}
            dot={{ r: 3, fill: CHART_COLORS.neonGreen }}
            activeDot={{ r: 5, fill: CHART_COLORS.neonGreen }}
          />
        </LineChart>
      </ResponsiveContainer>

      <p className="text-right text-[10px] mt-1" style={{ color: CHART_COLORS.textMuted }}>
        Based on Kelly Criterion with Monte Carlo resampling · @rohanpaul_ai · DeFi Mexico
      </p>
    </div>
  );
}
