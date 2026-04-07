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

// Major prediction market platforms by cumulative volume (early 2026)
const VOLUME_DATA = [
  { name: 'Polymarket', volume: 12500, chain: 'Polygon', note: 'Largest on-chain prediction market' },
  { name: 'Kalshi', volume: 3200, chain: 'Regulated US', note: 'CFTC-regulated exchange' },
  { name: 'Azuro', volume: 1100, chain: 'Multi-chain', note: 'Decentralized betting protocol' },
  { name: 'Augur/Turbo', volume: 450, chain: 'Ethereum', note: 'Pioneer prediction market' },
  { name: 'Overtime Markets', volume: 350, chain: 'Optimism', note: 'Sports & event markets' },
  { name: 'Hedgehog', volume: 180, chain: 'Solana', note: 'Solana-native markets' },
];

const TOTAL_VOLUME = VOLUME_DATA.reduce((sum, d) => sum + d.volume, 0);

const KEY_STATS = [
  { label: 'Total Cumulative Volume', value: `$${(TOTAL_VOLUME / 1000).toFixed(1)}B+` },
  { label: 'Largest Platform', value: 'Polymarket (70%)' },
  { label: 'Platforms Tracked', value: `${VOLUME_DATA.length}` },
  { label: 'Blockchains Represented', value: '5+' },
];

function formatVolume(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}B`;
  return `$${value}M`;
}

function ShareLabel(props: any) {
  const { x, y, width, index } = props;
  const entry = VOLUME_DATA[index];
  if (!entry) return null;
  const share = ((entry.volume / TOTAL_VOLUME) * 100).toFixed(1);
  return (
    <text
      x={x + width + 6}
      y={y + 4}
      fill={CHART_COLORS.textMuted}
      fontSize={10}
      fontWeight={500}
    >
      {share}%
    </text>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const entry = VOLUME_DATA.find((d) => d.name === label);
  if (!entry) return null;

  const share = ((entry.volume / TOTAL_VOLUME) * 100).toFixed(1);

  return (
    <div
      className="rounded-lg border px-3 py-2 text-sm"
      style={{
        background: CHART_COLORS.darkSurface,
        borderColor: CHART_COLORS.electricBlue,
      }}
    >
      <p className="font-semibold mb-1" style={{ color: CHART_COLORS.textLight }}>
        {entry.name}
      </p>
      <p className="text-xs" style={{ color: CHART_COLORS.electricBlue }}>
        Volume: {formatVolume(entry.volume)}
      </p>
      <p className="text-xs" style={{ color: CHART_COLORS.textMuted }}>
        {entry.chain}
      </p>
      <p className="text-xs" style={{ color: CHART_COLORS.neonGreen }}>
        Market Share: {share}%
      </p>
      <p className="text-xs mt-1" style={{ color: CHART_COLORS.textMuted }}>
        {entry.note}
      </p>
    </div>
  );
}

export function PredictionMarketEcosystemChart() {
  return (
    <div className="w-full rounded-xl border border-border bg-card p-4 my-8">
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-foreground">
          Prediction Market Ecosystem: Total Volume by Platform
        </h4>
        <p className="text-xs mt-0.5" style={{ color: CHART_COLORS.textMuted }}>
          Cumulative volume across major platforms validates Tenev's "truth machines" thesis
          — prediction markets have crossed $18B+ in total volume.
        </p>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={VOLUME_DATA}
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
            width={120}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="volume"
            name="Cumulative Volume ($M)"
            radius={[0, 4, 4, 0]}
            animationDuration={800}
          >
            {VOLUME_DATA.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={index === 0 ? CHART_COLORS.neonGreen : CHART_COLORS.electricBlue}
                opacity={index === 0 ? 1 : 0.55 + index * 0.05}
              />
            ))}
            <LabelList content={<ShareLabel />} dataKey="volume" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Summary stats box */}
      <div className="mt-3 pt-3 border-t border-border">
        <p className="text-xs font-semibold mb-2" style={{ color: CHART_COLORS.textLight }}>
          Ecosystem Snapshot:
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {KEY_STATS.map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg px-2 py-1.5 text-center"
              style={{ background: CHART_COLORS.darkBg }}
            >
              <p className="text-xs font-semibold" style={{ color: CHART_COLORS.neonGreen }}>
                {stat.value}
              </p>
              <p className="text-[10px]" style={{ color: CHART_COLORS.textMuted }}>
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-right text-[10px] mt-2" style={{ color: CHART_COLORS.textMuted }}>
        Source: Platform data, early 2026 estimates · DeFi Mexico
      </p>
    </div>
  );
}
