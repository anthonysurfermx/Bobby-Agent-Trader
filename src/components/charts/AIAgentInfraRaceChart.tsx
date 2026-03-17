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

// Infrastructure race: CEX vs DEX platforms building for AI agents
// Data compiled from official announcements (Feb-Mar 2026)
const INFRA_DATA = [
  {
    name: 'OKX OnchainOS',
    type: 'CEX',
    chains: 60,
    dexes: 500,
    apiCalls: '1.2B/day',
    features: 'MCP Server, AI Skills, x402 payments',
    launch: 'Mar 3, 2026',
    highlight: true,
  },
  {
    name: 'Coinbase Agentic',
    type: 'CEX',
    chains: 15,
    dexes: 0,
    apiCalls: '50M+ x402 txns',
    features: 'TEE wallets, gasless Base, spending limits',
    launch: 'Feb 11, 2026',
    highlight: false,
  },
  {
    name: 'Uniswap Skills',
    type: 'DEX',
    chains: 12,
    dexes: 1,
    apiCalls: '650K agent swaps (Warden)',
    features: '7 open-source Skills, model-agnostic',
    launch: 'Feb 21, 2026',
    highlight: false,
  },
  {
    name: 'BANKR',
    type: 'DEX',
    chains: 4,
    dexes: 10,
    apiCalls: 'Social-native',
    features: 'NLP trading via X/Farcaster, 0x routing',
    launch: 'Active',
    highlight: false,
  },
  {
    name: 'Binance Skills',
    type: 'CEX',
    chains: 1,
    dexes: 0,
    apiCalls: 'MCP + Cursor/Claude',
    features: '7 AI Skills, smart money tracking, OCO/OTOCO orders, contract risk detection',
    launch: 'Mar 2026',
    highlight: false,
  },
  {
    name: 'Bitget Wallet',
    type: 'CEX',
    chains: 9,
    dexes: 110,
    apiCalls: '90M+ users',
    features: 'MCP Server, CLI, 9 chains, 110+ DEX liquidity, OpenClaw partnership',
    launch: 'Feb 27, 2026',
    highlight: false,
  },
];

// Use chain count as the metric for the horizontal bars
const CHART_DATA = INFRA_DATA.map((d) => ({
  name: d.name,
  chains: d.chains,
  type: d.type,
  highlight: d.highlight,
}));

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const entry = INFRA_DATA.find((d) => d.name === label);
  if (!entry) return null;

  return (
    <div
      className="rounded-lg border px-3 py-2 text-sm max-w-xs"
      style={{
        background: CHART_COLORS.darkSurface,
        borderColor: entry.highlight ? CHART_COLORS.neonGreen : CHART_COLORS.electricBlue,
      }}
    >
      <p className="font-semibold mb-1" style={{ color: CHART_COLORS.textLight }}>
        {entry.name}
        <span
          className="ml-2 text-[10px] px-1.5 py-0.5 rounded"
          style={{
            background: entry.type === 'CEX' ? '#FF6B3520' : '#00FF8820',
            color: entry.type === 'CEX' ? '#FF6B35' : CHART_COLORS.neonGreen,
          }}
        >
          {entry.type}
        </span>
      </p>
      <p className="text-xs" style={{ color: CHART_COLORS.electricBlue }}>
        Chains: {entry.chains || 'TBD'} · DEXes: {entry.dexes || 'N/A'}
      </p>
      <p className="text-xs" style={{ color: CHART_COLORS.neonGreen }}>
        Scale: {entry.apiCalls}
      </p>
      <p className="text-xs mt-1" style={{ color: CHART_COLORS.textMuted }}>
        {entry.features}
      </p>
      <p className="text-xs" style={{ color: CHART_COLORS.textMuted }}>
        Launch: {entry.launch}
      </p>
    </div>
  );
}

function TypeLabel(props: any) {
  const { x, y, width, index } = props;
  const entry = INFRA_DATA[index];
  if (!entry) return null;
  return (
    <text
      x={x + width + 6}
      y={y + 4}
      fill={entry.type === 'CEX' ? '#FF6B35' : CHART_COLORS.neonGreen}
      fontSize={10}
      fontWeight={600}
    >
      {entry.type} · {entry.chains > 0 ? `${entry.chains} chains` : 'TBD'}
    </text>
  );
}

export function AIAgentInfraRaceChart() {
  return (
    <div className="w-full rounded-xl border border-border bg-card p-4 my-8">
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-foreground">
          The Infrastructure Race: Who's Building the AI Agent Stack?
        </h4>
        <p className="text-xs mt-0.5" style={{ color: CHART_COLORS.textMuted }}>
          CEX platforms (orange) vs DEX protocols (green). Chain coverage as primary metric.
          OKX leads with 60+ chains. All 5 major CEXs now have AI agent infrastructure.
        </p>
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <BarChart
          data={CHART_DATA}
          layout="vertical"
          margin={{ top: 0, right: 80, left: 0, bottom: 0 }}
        >
          <XAxis
            type="number"
            tick={{ fill: CHART_COLORS.textMuted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            label={{ value: 'Chains Supported', position: 'bottom', fill: CHART_COLORS.textMuted, fontSize: 10 }}
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
            dataKey="chains"
            name="Chains Supported"
            radius={[0, 4, 4, 0]}
            animationDuration={800}
          >
            {CHART_DATA.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.type === 'CEX' ? '#FF6B35' : CHART_COLORS.neonGreen}
                opacity={entry.highlight ? 1 : 0.65}
              />
            ))}
            <LabelList content={<TypeLabel />} dataKey="chains" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <p className="text-right text-[10px] mt-1" style={{ color: CHART_COLORS.textMuted }}>
        Sources: OKX, Coinbase, Binance, Bitget, Uniswap, BANKR official docs (Feb-Mar 2026) · DeFi Mexico
      </p>
    </div>
  );
}
