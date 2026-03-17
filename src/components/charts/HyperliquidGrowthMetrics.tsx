import { CHART_COLORS } from './DefiChartTheme';

const METRICS = [
  { label: 'Airdrop Value', before: '$1B', after: '$10B+', growth: '10x', period: '3 months' },
  { label: 'Core Team Size', before: '', after: '11', growth: '', period: 'vs 1000s at CEXs' },
  { label: '30d Volume', before: '', after: '$248B', growth: '31.7%', period: 'market share' },
  { label: 'Builder DAU', before: '', after: '40%+', growth: '', period: 'via 3rd-party frontends' },
  { label: 'Builder Fees Captured', before: '', after: '$31M+', growth: '', period: 'top 3 builders' },
  { label: 'Silver Price Discovery', before: '', after: '~2%', growth: '', period: 'of global volume' },
  { label: 'HLP Vault TVL', before: '', after: '~$400M', growth: '', period: 'liquidation backstop' },
  { label: 'Assistance Fund', before: '', after: '40M HYPE', growth: '~$1.25B', period: 'burned permanently' },
];

export function HyperliquidGrowthMetrics() {
  return (
    <div className="w-full rounded-xl border border-border bg-card p-4 my-8">
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-foreground">
          Hyperliquid: Key Growth Numbers
        </h4>
        <p className="text-xs mt-0.5" style={{ color: CHART_COLORS.textMuted }}>
          The metrics behind the 11-person team building "the internet for money"
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {METRICS.map((m) => (
          <div
            key={m.label}
            className="rounded-lg border border-border p-3 text-center"
            style={{ background: CHART_COLORS.darkSurface }}
          >
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: CHART_COLORS.textMuted }}>
              {m.label}
            </p>
            <p className="text-lg font-bold" style={{ color: CHART_COLORS.neonGreen }}>
              {m.after}
            </p>
            {m.growth && (
              <p className="text-xs font-medium" style={{ color: CHART_COLORS.electricBlue }}>
                {m.growth}
              </p>
            )}
            <p className="text-[10px] mt-0.5" style={{ color: CHART_COLORS.textMuted }}>
              {m.period}
            </p>
          </div>
        ))}
      </div>

      <p className="text-right text-[10px] mt-2" style={{ color: CHART_COLORS.textMuted }}>
        Sources: A1 Research, DeFi Llama, on-chain data · DeFi Mexico
      </p>
    </div>
  );
}
