import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { CHART_COLORS } from './DefiChartTheme';

// AI Agent sector market cap trajectory (aggregate data from CoinGecko, CoinMarketCap, Cookie.fun)
// Sources: CoinGecko AI Agents category, Binance Research DeFAI report, BlockEden sector analysis
const MARKET_DATA = [
  { month: 'Jan 2024', mcap: 0.8, label: '' },
  { month: 'Mar 2024', mcap: 1.2, label: '' },
  { month: 'Jun 2024', mcap: 1.8, label: '' },
  { month: 'Sep 2024', mcap: 3.5, label: '' },
  { month: 'Nov 2024', mcap: 7.2, label: 'ai16z + Virtuals surge' },
  { month: 'Jan 2025', mcap: 15.8, label: 'ATH: VIRTUAL $5.07' },
  { month: 'Mar 2025', mcap: 8.4, label: '' },
  { month: 'Jun 2025', mcap: 5.2, label: 'Correction phase' },
  { month: 'Sep 2025', mcap: 6.8, label: '' },
  { month: 'Dec 2025', mcap: 8.1, label: 'Infrastructure buildout begins' },
  { month: 'Jan 2026', mcap: 10.8, label: 'Cookie.fun tracks 1,700+ tokens' },
  { month: 'Mar 2026', mcap: 4.34, label: 'CoinGecko: 550+ projects' },
];

function formatMcap(value: number): string {
  return `$${value}B`;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const entry = MARKET_DATA.find((d) => d.month === label);

  return (
    <div
      className="rounded-lg border px-3 py-2 text-sm"
      style={{
        background: CHART_COLORS.darkSurface,
        borderColor: CHART_COLORS.neonGreen,
      }}
    >
      <p className="font-semibold mb-1" style={{ color: CHART_COLORS.textLight }}>
        {label}
      </p>
      <p className="text-xs" style={{ color: CHART_COLORS.neonGreen }}>
        Market Cap: ${payload[0].value}B
      </p>
      {entry?.label && (
        <p className="text-xs mt-1" style={{ color: CHART_COLORS.textMuted }}>
          {entry.label}
        </p>
      )}
    </div>
  );
}

export function AIAgentMarketGrowthChart() {
  return (
    <div className="w-full rounded-xl border border-border bg-card p-4 my-8">
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-foreground">
          AI Agent Crypto Sector: Market Cap Evolution
        </h4>
        <p className="text-xs mt-0.5" style={{ color: CHART_COLORS.textMuted }}>
          Aggregate market cap of AI agent tokens. Peak $15.8B (Jan 2025) to current $4.34B.
          550+ projects tracked by CoinGecko, 1,700+ by Cookie.fun.
        </p>
      </div>

      <ResponsiveContainer width="100%" height={360}>
        <AreaChart data={MARKET_DATA} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="gradientAIAgent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.neonGreen} stopOpacity={0.35} />
              <stop offset="100%" stopColor={CHART_COLORS.neonGreen} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="month"
            tick={{ fill: CHART_COLORS.textLight, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval={1}
          />
          <YAxis
            tickFormatter={formatMcap}
            tick={{ fill: CHART_COLORS.neonGreen, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={55}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine
            y={15.8}
            stroke={CHART_COLORS.textMuted}
            strokeDasharray="3 3"
            label={{ value: 'ATH $15.8B', fill: CHART_COLORS.textMuted, fontSize: 10, position: 'right' }}
          />
          <Area
            type="monotone"
            dataKey="mcap"
            stroke={CHART_COLORS.neonGreen}
            strokeWidth={2}
            fill="url(#gradientAIAgent)"
            animationDuration={800}
          />
        </AreaChart>
      </ResponsiveContainer>

      <p className="text-right text-[10px] mt-1" style={{ color: CHART_COLORS.textMuted }}>
        Sources: CoinGecko, CoinMarketCap, Cookie.fun, Binance Research · DeFi Mexico
      </p>
    </div>
  );
}
