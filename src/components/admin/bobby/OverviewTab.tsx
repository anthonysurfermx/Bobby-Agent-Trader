import { useState } from 'react';
import type { OverviewResponse } from '@/lib/admin-client';
import { Card, KpiStrip, Metric, Note, Segmented } from './ui';
import { BarsChart, BigNumber, HeroCard, StatusBars } from './charts';
import { READS_HISTORY_DAYS, growthWindows, windowDelta, type CompareSeries } from './deltas';
import { fmtCompact, fmtInt, fmtMinutes, fmtPct, fmtUsd, label, type ValueFormat } from './format';

type HeroMetric = 'reads' | 'accounts' | 'revenue';

export default function OverviewTab({ data, period, cmp }: { data: OverviewResponse; period: number; cmp: CompareSeries | null }) {
  const { overview: o, integrations: i } = data;
  const [metric, setMetric] = useState<HeroMetric>('reads');
  const rd = o.activity.readsDaily;
  const readsDaily = rd.web.map((v, k) => v + (rd.ios[k] ?? 0) + (rd.android[k] ?? 0));
  const llmPeriod = o.llm.daily.reduce((s, d) => s + d.anthropic + d.openai, 0);
  const act = o.activity.activation;
  const readsHistory = READS_HISTORY_DAYS;

  const hero: Record<HeroMetric, { label: string; values: number[]; total: number; format: ValueFormat; series?: number[]; history?: number; display: string }> = {
    reads: { label: 'Lecturas', values: readsDaily, total: o.activity.reads, format: 'int', series: cmp?.reads, history: readsHistory, display: fmtInt(o.activity.reads) },
    accounts: { label: 'Cuentas nuevas', values: o.accounts.daily, total: o.accounts.new, format: 'int', series: cmp?.accounts, display: fmtInt(o.accounts.new) },
    revenue: { label: 'Ingresos', values: o.revenue.daily, total: o.revenue.grossUsd, format: 'usd', series: cmp?.revenue, display: fmtUsd(o.revenue.grossUsd) },
  };
  const h = hero[metric];
  const providers = Object.entries(o.accounts.byProvider).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col gap-4">
      {!i.paywall && (
        <Note tone="orange" tag="Cobro apagado">El cobro (BOBBY_PAYWALL) está apagado: las cuentas gratis tienen lecturas ilimitadas.</Note>
      )}

      <KpiStrip
        items={[
          { label: 'Ingresos brutos', value: fmtUsd(o.revenue.grossUsd), delta: windowDelta(cmp?.revenue, period) },
          { label: 'Cuentas nuevas', value: fmtInt(o.accounts.new), delta: windowDelta(cmp?.accounts, period), caption: `${fmtInt(o.accounts.total)} en total` },
          {
            label: 'Lecturas', value: fmtInt(o.activity.reads),
            delta: windowDelta(cmp?.reads, period, readsHistory),
            caption: 2 * period > readsHistory ? `historial de ${readsHistory} días` : undefined,
          },
        ]}
      />
      <KpiStrip
        items={[
          { label: 'Membresías activas', value: fmtInt(o.subscriptions.active), caption: `+${fmtInt(o.subscriptions.giftedPro)} con Pro regalado` },
          { label: 'Activación', value: fmtPct(act.activated, act.accounts), caption: `${fmtInt(act.activated)}/${fmtInt(act.accounts)} · mediana ${fmtMinutes(act.medianMinutes)} a la 1.ª lectura` },
          { label: 'Gasto IA', value: fmtUsd(llmPeriod, true), delta: windowDelta(cmp?.llm, period), invert: true, caption: `30d ${fmtUsd(o.llm.providers.anthropic.month + o.llm.providers.openai.month, true)}` },
        ]}
      />

      <HeroCard
        title={h.label}
        toggle={(
          <Segmented<HeroMetric>
            label="Métrica"
            value={metric}
            onChange={setMetric}
            options={[{ value: 'reads', label: 'Lecturas' }, { value: 'accounts', label: 'Cuentas' }, { value: 'revenue', label: 'Ingresos' }]}
          />
        )}
        value={h.display}
        delta={windowDelta(h.series, period, h.history)}
        chips={growthWindows(h.series, h.history)}
        note={metric === 'reads' && period > readsHistory ? `Las lecturas guardan ${readsHistory} días; los días anteriores salen en cero.` : undefined}
      >
        <BarsChart days={o.days} values={h.values} format={h.format} emptyLabel={metric === 'revenue' ? 'Sin ingresos en el periodo' : 'Sin datos en el periodo'} />
      </HeroCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <BigNumber label="Lecturas por plataforma" value={fmtInt(o.activity.reads)} caption="en el periodo" />
          <StatusBars
            rows={[
              { label: 'Web', value: rd.web.reduce((a, b) => a + b, 0), fill: 'blue' },
              { label: 'iOS', value: rd.ios.reduce((a, b) => a + b, 0), fill: 'orange' },
              { label: 'Android', value: rd.android.reduce((a, b) => a + b, 0), fill: 'blue' },
              { label: 'Profundo', value: o.activity.levels.profundo, fill: 'orange' },
              { label: 'Máximo', value: o.activity.levels.maximo, fill: 'orange' },
            ]}
          />
        </Card>
        <Card>
          <BigNumber label="Cuentas por proveedor" value={fmtInt(o.accounts.total)} caption="cuentas" />
          <StatusBars
            rows={[
              ...providers.map(([k, v], idx) => ({ label: label(k), value: v, fill: (idx % 2 ? 'orange' : 'blue') as 'orange' | 'blue', sub: fmtPct(v, o.accounts.total) })),
              { label: 'Solo wallet', value: o.accounts.wallets, fill: 'orange' as const },
            ]}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Visitas web" value={fmtCompact(o.funnel.web.visitors)} delta={windowDelta(cmp?.visits, period)} />
        <Metric label="Lectores activos 7d" value={fmtCompact(o.activity.activeReaders7d)} caption={`${fmtInt(o.accounts.active7d)} cuentas activas 7d`} />
        <Metric label="Ingresos netos" value={fmtUsd(o.revenue.netUsd)} caption={`reembolsos ${fmtUsd(o.revenue.refundsUsd)}`} />
        <Metric label="Cupones activos" value={fmtInt(o.coupons.active)} caption={`${fmtInt(o.coupons.redemptions)} canjes · ${fmtInt(o.coupons.giftedReadsLeft)} lecturas sin usar`} />
      </div>
    </div>
  );
}
