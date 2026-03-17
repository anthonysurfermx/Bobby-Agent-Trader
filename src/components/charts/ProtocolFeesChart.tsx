import { useState, useEffect, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { fetchChartData, type ChartDataPoint } from '@/services/defiCharts.service';
import { CHART_COLORS, TIME_RANGES, type TimeRange } from './DefiChartTheme';
import { DefiChartTooltip } from './DefiChartTooltip';
import { DefiChartSkeleton } from './DefiChartSkeleton';
import { formatTVLValue, formatChartDate } from '@/utils/formatters';

interface Props {
  identifier: string;
  title?: string;
}

export function ProtocolFeesChart({ identifier, title }: Props) {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<TimeRange>(TIME_RANGES[1]); // 90D default

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchChartData('protocol_fees', identifier)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [identifier]);

  const filteredData = useMemo(() => {
    if (range.days === 0) return data;
    const cutoff = Date.now() / 1000 - range.days * 86400;
    return data.filter((p) => p.date >= cutoff);
  }, [data, range]);

  if (loading) return <DefiChartSkeleton />;
  if (error) {
    return (
      <div className="w-full rounded-xl border border-destructive/30 bg-card p-6 text-center text-sm text-muted-foreground">
        Error loading fees chart for {identifier}
      </div>
    );
  }
  if (filteredData.length === 0) return null;

  const displayTitle = title || `${identifier.charAt(0).toUpperCase() + identifier.slice(1)} — Daily Fees`;

  return (
    <div className="w-full rounded-xl border border-border bg-card p-4 my-8">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-foreground">{displayTitle}</h4>
        <div className="flex gap-1">
          {TIME_RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setRange(r)}
              className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                range.label === r.label
                  ? 'text-black'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              style={range.label === r.label ? { background: CHART_COLORS.electricBlue } : undefined}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={filteredData}>
          <XAxis
            dataKey="date"
            tickFormatter={(ts) => formatChartDate(ts, range.days || 9999)}
            tick={{ fill: CHART_COLORS.textMuted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            tickFormatter={formatTVLValue}
            tick={{ fill: CHART_COLORS.textMuted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={60}
          />
          <Tooltip
            content={
              <DefiChartTooltip
                formatValue={formatTVLValue}
                formatDate={(ts) => formatChartDate(ts, 0)}
              />
            }
          />
          <Bar
            dataKey="value"
            fill={CHART_COLORS.electricBlue}
            radius={[2, 2, 0, 0]}
            animationDuration={800}
          />
        </BarChart>
      </ResponsiveContainer>

      <p className="text-right text-[10px] mt-1" style={{ color: CHART_COLORS.textMuted }}>
        Powered by DeFi Llama · DeFi México
      </p>
    </div>
  );
}
