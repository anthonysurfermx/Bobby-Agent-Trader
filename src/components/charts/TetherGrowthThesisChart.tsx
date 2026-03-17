import { CHART_COLORS } from './DefiChartTheme';

const metrics = [
  {
    label: 'USDT Supply',
    value: '$184B',
    subtext: '59.8% market share',
    progress: 59.8,
    color: '#26A17B',
  },
  {
    label: 'Global Users',
    value: '534M',
    subtext: '+35M in Q4 2025 alone',
    progress: 68,
    color: '#00D4FF',
  },
  {
    label: 'Mexico Remittances',
    value: '$60B+',
    subtext: 'Largest corridor in the world',
    progress: 100,
    color: '#F97316',
  },
  {
    label: 'LATAM Stablecoin Activity',
    value: '39%',
    subtext: 'Of all crypto activity (up from 30%)',
    progress: 39,
    color: '#8B5CF6',
  },
  {
    label: 'Mexico Crypto Users',
    value: '15M+',
    subtext: '20.3% population penetration',
    progress: 20.3,
    color: '#EF4444',
  },
  {
    label: 'MXNT Current Supply',
    value: '$1.1M',
    subtext: 'vs billions in potential demand',
    progress: 0.5,
    color: '#26A17B',
  },
];

export function TetherGrowthThesisChart() {
  return (
    <div className="w-full rounded-xl border border-border bg-card p-4 sm:p-6 my-8">
      <div className="mb-5">
        <h4 className="text-sm font-semibold text-foreground">The Tether x Mexico Opportunity</h4>
        <p className="text-xs text-muted-foreground">Key metrics that define the growth thesis</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {metrics.map((m) => (
          <div key={m.label} className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">{m.label}</span>
              <span className="text-lg font-bold font-mono" style={{ color: m.color }}>{m.value}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.max(2, m.progress)}%`, backgroundColor: m.color }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">{m.subtext}</p>
          </div>
        ))}
      </div>

      <p className="text-right text-[10px] mt-4" style={{ color: CHART_COLORS.textMuted }}>
        Sources: DefiLlama, Tether Q4 2025 Report, World Bank, Chainalysis
      </p>
    </div>
  );
}
