import { useState } from 'react';
import { isMissing, type OverviewResponse } from '@/lib/admin-client';
import { Card, KpiStrip, Metric, MissingNote, Note, Segmented } from './ui';
import { BarsChart, BigNumber, HeroCard, StatusBars } from './charts';
import { READS_HISTORY_DAYS, growthWindows, windowDelta, type CompareSeries } from './deltas';
import { DASH, fmtCompact, fmtDate, fmtInt, fmtMinutes, fmtPct, fmtUsd, label, type ValueFormat } from './format';

type HeroMetric = 'reads' | 'accounts' | 'revenue';

export default function OverviewTab({ data, period, cmp }: { data: OverviewResponse; period: number; cmp: CompareSeries | null }) {
  const { overview: o, integrations: i } = data;
  const [metric, setMetric] = useState<HeroMetric>('reads');
  // A value the server did not send is shown as "—", never as a zero.
  const miss = (path: string) => isMissing(o.missing, path);
  const show = (path: string, text: string) => (miss(path) ? DASH : text);
  const delta = (path: string, series: number[] | undefined, history?: number) => (miss(path) ? null : windowDelta(series, period, history));

  const rd = o.activity.readsDaily;
  const readsDaily = rd.web.map((v, k) => v + (rd.ios[k] ?? 0) + (rd.android[k] ?? 0));
  const llmPeriod = o.llm.daily.reduce((s, d) => s + d.anthropic + d.openai, 0);
  const act = o.activity.activation;
  const readsHistory = READS_HISTORY_DAYS;
  const statsSince = o.coverage?.readerStatsSince;

  const hero: Record<HeroMetric, { label: string; values: number[]; path: string; format: ValueFormat; series?: number[]; history?: number; display: string }> = {
    reads: { label: 'Lecturas', values: readsDaily, path: 'activity.readsDaily', format: 'int', series: cmp?.reads, history: readsHistory, display: show('activity.reads', fmtInt(o.activity.reads)) },
    accounts: { label: 'Cuentas nuevas', values: o.accounts.daily, path: 'accounts.daily', format: 'int', series: cmp?.accounts, display: show('accounts.new', fmtInt(o.accounts.new)) },
    revenue: { label: 'Ingresos brutos', values: o.revenue.daily, path: 'revenue.daily', format: 'usd', series: cmp?.revenue, display: show('revenue.grossUsd', fmtUsd(o.revenue.grossUsd)) },
  };
  const h = hero[metric];
  const heroMissing = miss(h.path);
  const providers = Object.entries(o.accounts.byProvider).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col gap-4">
      <MissingNote missing={o.missing} />
      {!i.paywall && !isMissing(o.missing, 'integrations') && (
        <Note tone="orange" tag="Cobro apagado">El cobro (BOBBY_PAYWALL) está apagado: las cuentas gratis tienen lecturas ilimitadas.</Note>
      )}

      <KpiStrip
        items={[
          { label: 'Ingresos brutos', value: show('revenue.grossUsd', fmtUsd(o.revenue.grossUsd)), delta: delta('revenue.daily', cmp?.revenue) },
          { label: 'Cuentas nuevas', value: show('accounts.new', fmtInt(o.accounts.new)), delta: delta('accounts.daily', cmp?.accounts), caption: `${show('accounts.total', fmtInt(o.accounts.total))} en total` },
          {
            label: 'Lecturas', value: show('activity.reads', fmtInt(o.activity.reads)),
            delta: delta('activity.readsDaily', cmp?.reads, readsHistory),
            caption: 2 * period > readsHistory ? `historial de ${readsHistory} días` : undefined,
          },
        ]}
      />
      <KpiStrip
        items={[
          { label: 'Membresías activas', value: show('subscriptions.active', fmtInt(o.subscriptions.active)), caption: `+${show('subscriptions.giftedPro', fmtInt(o.subscriptions.giftedPro))} con Pro regalado` },
          {
            label: 'Activación', value: miss('activity.activation') ? DASH : fmtPct(act.activated, act.accounts),
            caption: miss('activity.activation') ? 'dato no disponible'
              : `${fmtInt(act.activated)}/${fmtInt(act.accounts)} · mediana ${fmtMinutes(act.medianMinutes)} · ${statsSince ? `primera lectura registrada desde ${fmtDate(statsSince)}` : o.coverage ? 'aún sin primeras lecturas registradas' : 'cobertura de primeras lecturas no disponible'}`,
          },
          {
            label: 'Gasto IA (ledger)', value: show('llm.daily', fmtUsd(llmPeriod, true)), delta: delta('llm.daily', cmp?.llm), invert: true,
            caption: `30d ${show('llm.providers', fmtUsd(o.llm.providers.anthropic.month + o.llm.providers.openai.month, true))}`,
          },
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
        delta={heroMissing ? null : windowDelta(h.series, period, h.history)}
        chips={heroMissing ? [] : growthWindows(h.series, h.history)}
        note={metric === 'reads' && period > readsHistory ? `Las lecturas guardan ${readsHistory} días; los días anteriores salen en cero.` : undefined}
      >
        <BarsChart
          days={o.days} values={h.values} format={h.format}
          emptyLabel={heroMissing ? 'Dato no disponible' : metric === 'revenue' ? 'Sin ingresos en el periodo' : 'Sin datos en el periodo'}
        />
      </HeroCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <BigNumber label="Lecturas por plataforma" value={show('activity.reads', fmtInt(o.activity.reads))} caption="en el periodo" />
          {miss('activity.readsDaily') ? <p className="m-0 font-mono text-[12px] text-[#5C5C5C]">Dato no disponible</p> : (
            <StatusBars
              rows={[
                { label: 'Web', value: rd.web.reduce((a, b) => a + b, 0), fill: 'blue' },
                { label: 'iOS', value: rd.ios.reduce((a, b) => a + b, 0), fill: 'orange' },
                { label: 'Android', value: rd.android.reduce((a, b) => a + b, 0), fill: 'blue' },
                { label: 'Profundo', value: o.activity.levels.profundo, fill: 'orange' },
                { label: 'Máximo', value: o.activity.levels.maximo, fill: 'orange' },
              ]}
            />
          )}
        </Card>
        <Card>
          <BigNumber label="Cuentas por proveedor" value={show('accounts.total', fmtInt(o.accounts.total))} caption="cuentas" />
          {miss('accounts.byProvider') ? <p className="m-0 font-mono text-[12px] text-[#5C5C5C]">Dato no disponible</p> : (
            <StatusBars
              rows={[
                ...providers.map(([k, v], idx) => ({ label: label(k), value: v, fill: (idx % 2 ? 'orange' : 'blue') as 'orange' | 'blue', sub: fmtPct(v, o.accounts.total) })),
                { label: 'Solo wallet', value: o.accounts.wallets, fill: 'orange' as const },
              ]}
            />
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Visitas web" value={show('funnel.web.visitors', fmtCompact(o.funnel.web.visitors))} delta={delta('funnel.visitsDaily', cmp?.visits)} />
        <Metric label="Lectores activos 7d" value={show('activity.activeReaders7d', fmtCompact(o.activity.activeReaders7d))} caption={`${show('accounts.active7d', fmtInt(o.accounts.active7d))} cuentas activas 7d`} />
        <Metric
          label="Neto estimado" value={show('revenue.netUsd', fmtUsd(o.revenue.netUsd))}
          caption={`comisión e impuestos de la tienda, menos reembolsos (${show('revenue.refundsUsd', fmtUsd(o.revenue.refundsUsd))})`}
        />
        <Metric label="Cupones activos" value={show('coupons.active', fmtInt(o.coupons.active))} caption={`${show('coupons.redemptions', fmtInt(o.coupons.redemptions))} canjes · ${show('coupons.giftedReadsLeft', fmtInt(o.coupons.giftedReadsLeft))} lecturas sin usar`} />
      </div>
    </div>
  );
}
