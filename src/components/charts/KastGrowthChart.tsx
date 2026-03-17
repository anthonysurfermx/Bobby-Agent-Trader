import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LabelList,
  Cell,
} from 'recharts';
import { CHART_COLORS } from './DefiChartTheme';

// On-chain verified data from Movement Network indexer
// Source: Kast distribution wallet 0x4500...7f01
// MOVE distributed / 0.04 cashback rate = estimated card spend
// USD estimated at MOVE price during each period
const KAST_DATA = [
  {
    month: 'Dec 2025',
    users: 32,
    volume: 47153,
    moveDistributed: 75446,
    note: 'first 2 weeks (launch Dec 18)',
    projected: false,
  },
  {
    month: 'Jan 2026',
    users: 6793,
    volume: 8311240,
    moveDistributed: 13297984,
    note: 'full month',
    projected: false,
  },
  {
    month: 'Feb (actual)',
    users: 3645,
    volume: 5458427,
    moveDistributed: 8733484,
    note: 'first 15 days',
    projected: false,
  },
  {
    month: 'Feb (projected)',
    users: 7290,
    volume: 10916854,
    moveDistributed: 17466968,
    note: 'projected full month at current pace',
    projected: true,
  },
];

function formatUSD(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function formatUsers(value: number): string {
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toString();
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  const entry = KAST_DATA.find((d) => d.month === label);

  return (
    <div
      className="rounded-lg border px-4 py-3 text-sm"
      style={{
        background: CHART_COLORS.darkSurface,
        borderColor: CHART_COLORS.neonGreen,
      }}
    >
      <p className="font-semibold mb-2" style={{ color: CHART_COLORS.textLight }}>
        {label}
      </p>
      <p className="text-xs mb-2" style={{ color: CHART_COLORS.textMuted }}>
        {entry?.note}
      </p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="text-xs mb-1">
          {p.name}: {p.dataKey === 'users' ? formatUsers(p.value) : formatUSD(p.value)}
        </p>
      ))}
      {entry && (
        <p className="text-xs mt-1" style={{ color: CHART_COLORS.textMuted }}>
          MOVE distributed: {(entry.moveDistributed / 1_000_000).toFixed(1)}M
        </p>
      )}
    </div>
  );
}

function VolumeLabel(props: any) {
  const { x, y, width, value, index } = props;
  const isProjected = KAST_DATA[index]?.projected;
  return (
    <text
      x={x + width / 2}
      y={y - 8}
      fill={CHART_COLORS.electricBlue}
      textAnchor="middle"
      fontSize={11}
      fontWeight={600}
      opacity={isProjected ? 0.5 : 1}
    >
      {formatUSD(value)}{isProjected ? '*' : ''}
    </text>
  );
}

function UsersLabel(props: any) {
  const { x, y, width, value, index } = props;
  const isProjected = KAST_DATA[index]?.projected;
  return (
    <text
      x={x + width / 2}
      y={y - 8}
      fill={CHART_COLORS.neonGreen}
      textAnchor="middle"
      fontSize={11}
      fontWeight={600}
      opacity={isProjected ? 0.5 : 1}
    >
      {formatUsers(value)}{isProjected ? '*' : ''}
    </text>
  );
}

export function KastGrowthChart() {
  return (
    <div className="w-full rounded-xl border border-border bg-card p-4 my-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-sm font-semibold text-foreground">
            Kast Card Growth: Unique Wallets vs Estimated Card Spend
          </h4>
          <p className="text-xs mt-1" style={{ color: CHART_COLORS.textMuted }}>
            On-chain data from Movement Network. Based on 4% MOVE cashback distributions.
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={360}>
        <BarChart data={KAST_DATA} barGap={8} margin={{ top: 30, right: 10, left: 10, bottom: 0 }}>
          <XAxis
            dataKey="month"
            tick={{ fill: CHART_COLORS.textLight, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="volume"
            orientation="left"
            tickFormatter={formatUSD}
            tick={{ fill: CHART_COLORS.electricBlue, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={65}
          />
          <YAxis
            yAxisId="users"
            orientation="right"
            tickFormatter={formatUsers}
            tick={{ fill: CHART_COLORS.neonGreen, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={50}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11, color: CHART_COLORS.textMuted }}
          />
          <Bar
            yAxisId="volume"
            dataKey="volume"
            name="Card Spend (USD)"
            radius={[4, 4, 0, 0]}
            animationDuration={800}
            minPointSize={8}
          >
            {KAST_DATA.map((entry, index) => (
              <Cell
                key={`vol-${index}`}
                fill={CHART_COLORS.electricBlue}
                opacity={entry.projected ? 0.35 : 1}
                strokeDasharray={entry.projected ? '4 2' : undefined}
                stroke={entry.projected ? CHART_COLORS.electricBlue : undefined}
              />
            ))}
            <LabelList content={<VolumeLabel />} />
          </Bar>
          <Bar
            yAxisId="users"
            dataKey="users"
            name="Unique Wallets"
            radius={[4, 4, 0, 0]}
            animationDuration={800}
            minPointSize={8}
          >
            {KAST_DATA.map((entry, index) => (
              <Cell
                key={`usr-${index}`}
                fill={CHART_COLORS.neonGreen}
                opacity={entry.projected ? 0.35 : 1}
                strokeDasharray={entry.projected ? '4 2' : undefined}
                stroke={entry.projected ? CHART_COLORS.neonGreen : undefined}
              />
            ))}
            <LabelList content={<UsersLabel />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="flex justify-between items-center mt-1">
        <p className="text-[10px]" style={{ color: CHART_COLORS.textMuted }}>
          * Projected: extrapolated from first 15 days at current daily rate
        </p>
        <p className="text-[10px]" style={{ color: CHART_COLORS.textMuted }}>
          On-chain verified · Movement Network Indexer · DeFi México
        </p>
      </div>
    </div>
  );
}
