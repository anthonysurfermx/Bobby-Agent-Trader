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

// Real data scanned from exchange public APIs on Feb 16, 2026
const DATA = [
  { name: 'Mercado Bitcoin', pairs: 1226, type: 'LATAM', currencies: 'BRL' },
  { name: 'NovaDAX', pairs: 581, type: 'LATAM', currencies: 'BRL' },
  { name: 'Foxbit', pairs: 134, type: 'LATAM', currencies: 'BRL' },
  { name: 'Binance', pairs: 35, type: 'Global', currencies: 'BRL, MXN, ARS, COP' },
  { name: 'Bitso', pairs: 30, type: 'LATAM', currencies: 'MXN, BRL, ARS, COP' },
  { name: 'SatoshiTango', pairs: 23, type: 'LATAM', currencies: 'ARS' },
  { name: 'Lemon Cash', pairs: 21, type: 'LATAM', currencies: 'ARS' },
  { name: 'Buda', pairs: 18, type: 'LATAM', currencies: 'CLP, COP, PEN' },
  { name: 'OKX', pairs: 10, type: 'Global', currencies: 'BRL' },
  { name: 'Belo', pairs: 8, type: 'LATAM', currencies: 'ARS' },
  { name: 'Bybit', pairs: 5, type: 'Global', currencies: 'BRL' },
  { name: 'Binance Spot', pairs: 6, type: 'Global', currencies: 'MXN' },
  { name: 'Bitget', pairs: 4, type: 'Global', currencies: 'BRL' },
  { name: 'KuCoin', pairs: 3, type: 'Global', currencies: 'BRL' },
  { name: 'Gate.io', pairs: 0, type: 'Global', currencies: '' },
  { name: 'MEXC', pairs: 0, type: 'Global', currencies: '' },
  { name: 'Crypto.com', pairs: 0, type: 'Global', currencies: '' },
  { name: 'Kraken', pairs: 0, type: 'Global', currencies: '' },
  { name: 'BingX', pairs: 0, type: 'Global', currencies: '' },
];

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      className="rounded-lg border px-4 py-3 text-sm"
      style={{ background: CHART_COLORS.darkSurface, borderColor: CHART_COLORS.neonGreen }}
    >
      <p className="font-semibold mb-1" style={{ color: CHART_COLORS.textLight }}>
        {d.name}
      </p>
      <p className="text-xs" style={{ color: CHART_COLORS.textMuted }}>
        {d.type === 'LATAM' ? 'LATAM-native exchange' : 'Global exchange'}
      </p>
      <p className="text-xs mt-1" style={{ color: CHART_COLORS.neonGreen }}>
        {d.pairs} LATAM fiat pairs
      </p>
      {d.currencies && (
        <p className="text-xs mt-1" style={{ color: CHART_COLORS.textMuted }}>
          Currencies: {d.currencies}
        </p>
      )}
    </div>
  );
}

function PairLabel(props: any) {
  const { x, y, width, value } = props;
  if (!value) return null;
  return (
    <text
      x={x + width + 6}
      y={y + 15}
      fill={CHART_COLORS.textLight}
      fontSize={11}
      fontWeight={600}
    >
      {value >= 1000 ? `${(value / 1000).toFixed(1)}K` : value}
    </text>
  );
}

export function LatamExchangeHeatChart() {
  return (
    <div className="w-full rounded-xl border border-border bg-card p-4 my-8">
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-foreground">
          LATAM Fiat Trading Pairs by Exchange
        </h4>
        <p className="text-xs mt-1" style={{ color: CHART_COLORS.textMuted }}>
          Direct API scan of 26 exchanges (16 global + 10 LATAM-native). Shows order book pairs only.
        </p>
      </div>

      <ResponsiveContainer width="100%" height={560}>
        <BarChart data={DATA} layout="vertical" margin={{ left: 5, right: 50, top: 0, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            tick={{ fill: CHART_COLORS.textLight, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="pairs" radius={[0, 6, 6, 0]} maxBarSize={22} animationDuration={800}>
            {DATA.map((d, i) => (
              <Cell
                key={i}
                fill={d.type === 'LATAM' ? CHART_COLORS.neonGreen : CHART_COLORS.electricBlue}
                opacity={d.pairs > 0 ? 1 : 0.15}
              />
            ))}
            <LabelList content={<PairLabel />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="flex justify-between items-center mt-2">
        <div className="flex gap-4 text-[10px]" style={{ color: CHART_COLORS.textMuted }}>
          <span><span style={{ color: CHART_COLORS.neonGreen }}>■</span> LATAM-native</span>
          <span><span style={{ color: CHART_COLORS.electricBlue }}>■</span> Global</span>
        </div>
        <p className="text-[10px]" style={{ color: CHART_COLORS.textMuted }}>
          Source: Exchange public APIs · Feb 2026 · DeFi México
        </p>
      </div>
    </div>
  );
}
