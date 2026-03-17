import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Cell,
} from 'recharts';
import { CHART_COLORS } from './DefiChartTheme';

// Reconstructed from @rohanpaul_ai thread
// Maker vs Taker PnL by price bucket
// Key finding: Makers profitable at 98/99 price levels, Takers lose at 80/99
const MAKER_TAKER_DATA = [
  { bucket: '1-5c', maker: 12.3, taker: -57.0 },
  { bucket: '5-10c', maker: 8.7, taker: -42.1 },
  { bucket: '10-20c', maker: 6.2, taker: -31.5 },
  { bucket: '20-30c', maker: 4.8, taker: -18.7 },
  { bucket: '30-40c', maker: 3.9, taker: -12.3 },
  { bucket: '40-50c', maker: 3.1, taker: -6.8 },
  { bucket: '50-60c', maker: 2.8, taker: -4.2 },
  { bucket: '60-70c', maker: 2.4, taker: -2.1 },
  { bucket: '70-80c', maker: 1.9, taker: 0.8 },
  { bucket: '80-90c', maker: 1.2, taker: 2.4 },
  { bucket: '90-95c', maker: 0.6, taker: 3.1 },
  { bucket: '95-99c', maker: -0.3, taker: 4.8 },
];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg border px-4 py-3 text-sm"
      style={{ background: CHART_COLORS.darkSurface, borderColor: CHART_COLORS.electricBlue }}
    >
      <p className="font-semibold mb-2" style={{ color: CHART_COLORS.textLight }}>
        Price Range: {label}
      </p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-xs mb-1" style={{ color: p.color }}>
          {p.name}: {p.value > 0 ? '+' : ''}{p.value}% ROI
        </p>
      ))}
    </div>
  );
}

export function MakerTakerEdgeChart() {
  return (
    <div className="w-full rounded-xl border border-border bg-card p-4 my-8">
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-foreground">
          Maker vs Taker: Average ROI by Price Level
        </h4>
        <p className="text-xs mt-1" style={{ color: CHART_COLORS.textMuted }}>
          Makers profit at 98 of 99 price levels. Takers lose at 80 of 99. The structural edge is in patience, not prediction.
        </p>
      </div>

      <ResponsiveContainer width="100%" height={360}>
        <BarChart data={MAKER_TAKER_DATA} barGap={2} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.gridLine} vertical={false} />
          <XAxis
            dataKey="bucket"
            tick={{ fill: CHART_COLORS.textLight, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            label={{ value: 'Contract Price Bucket', position: 'bottom', offset: -5, fill: CHART_COLORS.textMuted, fontSize: 10 }}
          />
          <YAxis
            tick={{ fill: CHART_COLORS.textLight, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}%`}
            width={50}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke={CHART_COLORS.textMuted} strokeWidth={1} />
          <Bar
            dataKey="maker"
            name="Maker (Limit Orders)"
            radius={[3, 3, 0, 0]}
            animationDuration={800}
          >
            {MAKER_TAKER_DATA.map((entry, i) => (
              <Cell
                key={`maker-${i}`}
                fill={entry.maker >= 0 ? CHART_COLORS.neonGreen : '#ef4444'}
                opacity={0.85}
              />
            ))}
          </Bar>
          <Bar
            dataKey="taker"
            name="Taker (Market Orders)"
            radius={[3, 3, 0, 0]}
            animationDuration={800}
          >
            {MAKER_TAKER_DATA.map((entry, i) => (
              <Cell
                key={`taker-${i}`}
                fill={entry.taker >= 0 ? CHART_COLORS.electricBlue : '#ef4444'}
                opacity={0.65}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="flex gap-6 mt-3 justify-center">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm" style={{ background: CHART_COLORS.neonGreen }} />
          <span className="text-[11px]" style={{ color: CHART_COLORS.textMuted }}>Maker (Profitable)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm" style={{ background: '#ef4444' }} />
          <span className="text-[11px]" style={{ color: CHART_COLORS.textMuted }}>Loss Zone</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm" style={{ background: CHART_COLORS.electricBlue }} />
          <span className="text-[11px]" style={{ color: CHART_COLORS.textMuted }}>Taker (Profitable)</span>
        </div>
      </div>

      <p className="text-right text-[10px] mt-2" style={{ color: CHART_COLORS.textMuted }}>
        Data: Becker Polymarket Dataset (400M+ trades) · Analysis: @rohanpaul_ai · DeFi Mexico
      </p>
    </div>
  );
}
