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

// Chainalysis 2025 Geography of Cryptocurrency Report
// Value received Jul 2024 - Jun 2025, in billions USD
const DATA = [
  { country: 'Brazil', flag: '🇧🇷', value: 318.8, rank: 5, color: '#009739' },
  { country: 'Argentina', flag: '🇦🇷', value: 93.9, rank: 20, color: '#75AADB' },
  { country: 'Mexico', flag: '🇲🇽', value: 71.2, rank: 0, color: '#006847' },
  { country: 'Venezuela', flag: '🇻🇪', value: 44.6, rank: 18, color: '#CF142B' },
  { country: 'Colombia', flag: '🇨🇴', value: 44.2, rank: 0, color: '#FCD116' },
  { country: 'Peru', flag: '🇵🇪', value: 28.0, rank: 0, color: '#D91023' },
  { country: 'Chile', flag: '🇨🇱', value: 23.8, rank: 0, color: '#D52B1E' },
  { country: 'Bolivia', flag: '🇧🇴', value: 14.8, rank: 0, color: '#007934' },
  { country: 'El Salvador', flag: '🇸🇻', value: 3.5, rank: 0, color: '#005EB8' },
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
        {d.flag} {d.country}
      </p>
      <p className="text-xs" style={{ color: CHART_COLORS.neonGreen }}>
        ${d.value}B received
      </p>
      {d.rank > 0 && (
        <p className="text-xs mt-1" style={{ color: CHART_COLORS.textMuted }}>
          #{d.rank} Global Adoption Index
        </p>
      )}
    </div>
  );
}

function ValueLabel(props: any) {
  const { x, y, width, value } = props;
  return (
    <text x={x + width + 6} y={y + 15} fill={CHART_COLORS.textLight} fontSize={11} fontWeight={600}>
      ${value}B
    </text>
  );
}

export function LatamAdoptionChart() {
  return (
    <div className="w-full rounded-xl border border-border bg-card p-4 my-8">
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-foreground">
          Crypto Value Received by LATAM Country
        </h4>
        <p className="text-xs mt-1" style={{ color: CHART_COLORS.textMuted }}>
          Chainalysis 2025 Geography of Cryptocurrency Report (Jul 2024 - Jun 2025). Brazil alone received $318.8B.
        </p>
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <BarChart data={DATA} layout="vertical" margin={{ left: 5, right: 55, top: 0, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="country"
            width={85}
            tick={({ x, y, payload }: { x: number; y: number; payload: { value: string } }) => {
              const d = DATA.find(d => d.country === payload.value);
              return (
                <text x={x} y={y} dy={4} textAnchor="end" fill={CHART_COLORS.textLight} fontSize={12}>
                  {d?.flag} {payload.value}
                </text>
              );
            }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={22} animationDuration={800}>
            {DATA.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
            <LabelList content={<ValueLabel />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="flex justify-between items-center mt-2">
        <p className="text-[10px]" style={{ color: CHART_COLORS.textMuted }}>
          3 LATAM countries in Chainalysis Global Top 20: Brazil (#5), Venezuela (#18), Argentina (#20)
        </p>
        <p className="text-[10px]" style={{ color: CHART_COLORS.textMuted }}>
          Chainalysis 2025 · DeFi México
        </p>
      </div>
    </div>
  );
}
