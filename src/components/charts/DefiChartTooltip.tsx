import { CHART_COLORS } from './DefiChartTheme';

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: number;
  formatValue: (v: number) => string;
  formatDate: (ts: number) => string;
}

export function DefiChartTooltip({ active, payload, label, formatValue, formatDate }: TooltipProps) {
  if (!active || !payload?.length || label == null) return null;

  return (
    <div
      className="rounded-lg px-3 py-2 text-sm shadow-lg border"
      style={{
        background: CHART_COLORS.darkSurface,
        borderColor: CHART_COLORS.neonGreen,
      }}
    >
      <p className="text-xs mb-1" style={{ color: CHART_COLORS.textMuted }}>
        {formatDate(label)}
      </p>
      <p className="font-semibold" style={{ color: CHART_COLORS.neonGreen }}>
        {formatValue(payload[0].value)}
      </p>
    </div>
  );
}
