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

// Top AI Agent protocols by TVL from DefiLlama (March 2026)
// Source: api.llama.fi/protocols category="AI Agents"
const TVL_DATA = [
  { name: 'Vishwa', tvl: 51.37, chain: 'Bitcoin', mcap: null, change7d: 6.08 },
  { name: 'MorpheusAI', tvl: 12.24, chain: 'Ethereum', mcap: 18.08, change7d: 14.0 },
  { name: 'Giza', tvl: 11.06, chain: 'Multi', mcap: null, change7d: -47.1 },
  { name: 'Capx AI', tvl: 2.48, chain: 'Capx Chain', mcap: 18.23, change7d: -1.58 },
  { name: 'Infinite Trading', tvl: 0.22, chain: 'Multi', mcap: null, change7d: 3.83 },
  { name: 'AgentFi', tvl: 0.18, chain: 'Blast', mcap: null, change7d: 0.9 },
  { name: 'Mind Network', tvl: 0.08, chain: 'Ethereum', mcap: 6.75, change7d: 5.46 },
];

// Market cap leaders (no TVL but significant market cap)
const MCAP_LEADERS = [
  { name: 'Virtuals', mcap: 481.94, tvl: 0, role: 'AI Agent launchpad' },
  { name: 'QuantixAI', mcap: 55.99, tvl: 0, role: 'AI trading software' },
  { name: 'INFINIT', mcap: 19.70, tvl: 0, role: 'DeFi navigation' },
  { name: 'Cookie DAO', mcap: 13.61, tvl: 0, role: 'Data layer for AI' },
];

function formatTVL(value: number): string {
  if (value >= 1) return `$${value.toFixed(1)}M`;
  return `$${(value * 1000).toFixed(0)}K`;
}

function ChangeLabel(props: any) {
  const { x, y, width, index } = props;
  const entry = TVL_DATA[index];
  if (!entry) return null;
  const isPositive = entry.change7d >= 0;
  return (
    <text
      x={x + width + 6}
      y={y + 4}
      fill={isPositive ? CHART_COLORS.neonGreen : '#FF4444'}
      fontSize={10}
      fontWeight={500}
    >
      {isPositive ? '+' : ''}{entry.change7d}%
    </text>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const entry = TVL_DATA.find((d) => d.name === label);
  if (!entry) return null;

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
        TVL: ${entry.tvl}M
      </p>
      <p className="text-xs" style={{ color: CHART_COLORS.textMuted }}>
        Chain: {entry.chain}
      </p>
      {entry.mcap && (
        <p className="text-xs" style={{ color: CHART_COLORS.neonGreen }}>
          Market Cap: ${entry.mcap}M
        </p>
      )}
      <p
        className="text-xs"
        style={{ color: entry.change7d >= 0 ? CHART_COLORS.neonGreen : '#FF4444' }}
      >
        7d: {entry.change7d >= 0 ? '+' : ''}{entry.change7d}%
      </p>
    </div>
  );
}

export function AIAgentTVLShareChart() {
  return (
    <div className="w-full rounded-xl border border-border bg-card p-4 my-8">
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-foreground">
          AI Agent Protocols: TVL Ranking (DefiLlama)
        </h4>
        <p className="text-xs mt-0.5" style={{ color: CHART_COLORS.textMuted }}>
          Total AI Agent TVL: $77.7M (0.015% of DeFi's $93.7B). Vishwa dominates with 66%.
          7-day change shown at right.
        </p>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={TVL_DATA}
          layout="vertical"
          margin={{ top: 0, right: 60, left: 0, bottom: 0 }}
        >
          <XAxis
            type="number"
            tickFormatter={formatTVL}
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
            width={100}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="tvl"
            name="TVL ($M)"
            radius={[0, 4, 4, 0]}
            animationDuration={800}
          >
            {TVL_DATA.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={index === 0 ? CHART_COLORS.neonGreen : CHART_COLORS.electricBlue}
                opacity={index === 0 ? 1 : 0.65}
              />
            ))}
            <LabelList content={<ChangeLabel />} dataKey="tvl" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Market Cap Leaders callout */}
      <div className="mt-3 pt-3 border-t border-border">
        <p className="text-xs font-semibold mb-2" style={{ color: CHART_COLORS.textLight }}>
          Top by Market Cap (no TVL):
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {MCAP_LEADERS.map((l) => (
            <div
              key={l.name}
              className="rounded-lg px-2 py-1.5 text-center"
              style={{ background: CHART_COLORS.darkBg }}
            >
              <p className="text-xs font-semibold" style={{ color: CHART_COLORS.neonGreen }}>
                ${l.mcap.toFixed(0)}M
              </p>
              <p className="text-[10px]" style={{ color: CHART_COLORS.textLight }}>
                {l.name}
              </p>
              <p className="text-[9px]" style={{ color: CHART_COLORS.textMuted }}>
                {l.role}
              </p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-right text-[10px] mt-2" style={{ color: CHART_COLORS.textMuted }}>
        Source: DefiLlama API, March 2026 · DeFi Mexico
      </p>
    </div>
  );
}
