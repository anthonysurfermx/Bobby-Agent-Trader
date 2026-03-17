import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';
import { CHART_COLORS } from './DefiChartTheme';

// Data from A1 Research Perp DEX Wars report, Feb 2026
// 30-day volume and institutional scorecard
const PERP_DEX_DATA = [
  { name: 'Hyperliquid', volume: 248, score: 67, share: 31.7, highlight: true },
  { name: 'Paradex', volume: 7.8, score: 57, share: 0.99, highlight: false },
  { name: 'Lighter', volume: 45, score: 48, share: 5.7, highlight: false },
  { name: 'EdgeX', volume: 38, score: 45, share: 4.9, highlight: false },
  { name: 'GRVT', volume: 12, score: 44, share: 1.5, highlight: false },
  { name: 'Aster', volume: 22, score: 38, share: 2.8, highlight: false },
  { name: 'Extended', volume: 8, score: 36, share: 1.0, highlight: false },
  { name: 'Variational', volume: 5, score: 35, share: 0.6, highlight: false },
];

function formatVolume(value: number): string {
  return `$${value}B`;
}

function ScoreLabel(props: any) {
  const { x, y, width, value, index } = props;
  const isHL = PERP_DEX_DATA[index]?.highlight;
  return (
    <text
      x={x + width + 6}
      y={y + 4}
      fill={isHL ? CHART_COLORS.neonGreen : CHART_COLORS.textMuted}
      fontSize={10}
      fontWeight={isHL ? 700 : 400}
    >
      {value}/80
    </text>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const entry = PERP_DEX_DATA.find((d) => d.name === label);
  if (!entry) return null;

  return (
    <div
      className="rounded-lg border px-3 py-2 text-sm"
      style={{
        background: CHART_COLORS.darkSurface,
        borderColor: entry.highlight ? CHART_COLORS.neonGreen : CHART_COLORS.electricBlue,
      }}
    >
      <p className="font-semibold mb-1" style={{ color: CHART_COLORS.textLight }}>
        {entry.name}
      </p>
      <p className="text-xs" style={{ color: CHART_COLORS.electricBlue }}>
        30d Volume: ${entry.volume}B
      </p>
      <p className="text-xs" style={{ color: CHART_COLORS.neonGreen }}>
        Institutional Score: {entry.score}/80
      </p>
      <p className="text-xs" style={{ color: CHART_COLORS.textMuted }}>
        Market Share: {entry.share}%
      </p>
    </div>
  );
}

export function PerpDexMarketShare() {
  return (
    <div className="w-full rounded-xl border border-border bg-card p-4 my-8">
      <div className="mb-4">
        <div>
          <h4 className="text-sm font-semibold text-foreground">
            Perp DEX Wars: Institutional Scorecard vs 30d Volume
          </h4>
          <p className="text-xs mt-0.5" style={{ color: CHART_COLORS.textMuted }}>
            Hyperliquid leads at 67/80. Volume dominance backed by ecosystem breadth and builder adoption.
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <BarChart
          data={PERP_DEX_DATA}
          layout="vertical"
          margin={{ top: 0, right: 50, left: 0, bottom: 0 }}
        >
          <XAxis
            type="number"
            tickFormatter={formatVolume}
            tick={{ fill: CHART_COLORS.textMuted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: CHART_COLORS.textLight, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={85}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="volume"
            name="30d Volume ($B)"
            radius={[0, 4, 4, 0]}
            animationDuration={800}
          >
            {PERP_DEX_DATA.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.highlight ? CHART_COLORS.neonGreen : CHART_COLORS.electricBlue}
                opacity={entry.highlight ? 1 : 0.6}
              />
            ))}
            <LabelList content={<ScoreLabel />} dataKey="score" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <p className="text-right text-[10px] mt-1" style={{ color: CHART_COLORS.textMuted }}>
        Source: A1 Research "Perp DEX Wars" Report, Feb 2026 · DeFi Mexico
      </p>
    </div>
  );
}
