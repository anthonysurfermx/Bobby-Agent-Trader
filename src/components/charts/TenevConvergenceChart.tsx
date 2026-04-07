import { CHART_COLORS } from './DefiChartTheme';

// Tenev's 10 theses mapped to DeFi equivalents with maturity scores
const CONVERGENCE_DATA = [
  { thesis: 'Mercados de predicción', defi: 'Polymarket, Augur, Azuro', maturity: 90, icon: '🎯' },
  { thesis: 'Tokenización + T+0', defi: 'Ondo, Centrifuge, Maple', maturity: 65, icon: '🏦' },
  { thesis: 'Capital privado democratizado', defi: 'DAOs, equity tokenizado', maturity: 40, icon: '🚀' },
  { thesis: 'Propiedad como defensa AI', defi: 'Gobernanza + revenue share', maturity: 35, icon: '🛡' },
  { thesis: 'Súper app financiero', defi: 'Zapper, DeBank, Instadapp', maturity: 55, icon: '📱' },
  { thesis: 'Gran transferencia de riqueza', defi: 'Onboarding fiat-to-DeFi', maturity: 30, icon: '💰' },
  { thesis: 'Inversión agéntica', defi: 'AI agents on-chain', maturity: 25, icon: '🤖' },
  { thesis: 'Unicornio unipersonal', defi: 'Protocolos de 1 dev', maturity: 45, icon: '⚡' },
  { thesis: 'Superinteligencia matemática', defi: 'Certora, Halmos', maturity: 50, icon: '🧮' },
  { thesis: 'Cultura de alto rendimiento', defi: 'Equipos lean DeFi', maturity: 85, icon: '🏆' },
];

function getMaturityColor(maturity: number): string {
  if (maturity >= 75) return CHART_COLORS.neonGreen;
  if (maturity >= 50) return CHART_COLORS.electricBlue;
  if (maturity >= 35) return '#FFB800';
  return '#FF6B6B';
}

function getMaturityLabel(maturity: number): string {
  if (maturity >= 75) return 'Live';
  if (maturity >= 50) return 'Growing';
  if (maturity >= 35) return 'Early';
  return 'Emerging';
}

export function TenevConvergenceChart() {
  const avgMaturity = Math.round(CONVERGENCE_DATA.reduce((s, d) => s + d.maturity, 0) / CONVERGENCE_DATA.length);

  return (
    <div className="w-full rounded-xl border border-border bg-card p-4 my-8">
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-foreground">
          Tenev vs DeFi: Convergence Map
        </h4>
        <p className="text-xs mt-0.5" style={{ color: CHART_COLORS.textMuted }}>
          How far DeFi has already built what Tenev envisions for TradFi. Average maturity: {avgMaturity}%
        </p>
      </div>

      <div className="space-y-2">
        {CONVERGENCE_DATA.map((item) => (
          <div key={item.thesis} className="flex items-center gap-3">
            <span className="text-sm w-5 flex-shrink-0">{item.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <p className="text-xs font-medium truncate" style={{ color: CHART_COLORS.textLight }}>
                  {item.thesis}
                </p>
                <span
                  className="text-[10px] font-semibold ml-2 flex-shrink-0"
                  style={{ color: getMaturityColor(item.maturity) }}
                >
                  {getMaturityLabel(item.maturity)}
                </span>
              </div>
              <div className="w-full h-2 rounded-full" style={{ background: CHART_COLORS.darkBg }}>
                <div
                  className="h-2 rounded-full transition-all duration-700"
                  style={{
                    width: `${item.maturity}%`,
                    background: `linear-gradient(90deg, ${getMaturityColor(item.maturity)}88, ${getMaturityColor(item.maturity)})`,
                  }}
                />
              </div>
              <p className="text-[10px] mt-0.5" style={{ color: CHART_COLORS.textMuted }}>
                {item.defi}
              </p>
            </div>
            <span
              className="text-xs font-bold flex-shrink-0 w-8 text-right"
              style={{ color: getMaturityColor(item.maturity) }}
            >
              {item.maturity}%
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-3 justify-center">
        {[
          { color: CHART_COLORS.neonGreen, label: 'Live (75%+)' },
          { color: CHART_COLORS.electricBlue, label: 'Growing (50-74%)' },
          { color: '#FFB800', label: 'Early (35-49%)' },
          { color: '#FF6B6B', label: 'Emerging (<35%)' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ background: item.color }} />
            <span className="text-[10px]" style={{ color: CHART_COLORS.textMuted }}>{item.label}</span>
          </div>
        ))}
      </div>

      <p className="text-right text-[10px] mt-2" style={{ color: CHART_COLORS.textMuted }}>
        Maturity based on protocol TVL, adoption & infrastructure readiness · DeFi Mexico
      </p>
    </div>
  );
}
