import { useState } from 'react';
import { isMissing, type OverviewResponse } from '@/lib/admin-client';
import { Card, KpiStrip, MissingNote, Note, Row, Segmented } from './ui';
import { BarsChart, BigNumber, HeroCard, StatusBars } from './charts';
import { READS_HISTORY_DAYS, growthWindows, windowDelta, type CompareSeries } from './deltas';
import { DASH, coverageLine, fmtDate, fmtDateTime, fmtInt, fmtMinutes, fmtPct, fmtUsd, label, type ValueFormat } from './format';
import InsightsPanel from './InsightsPanel';
import { PeopleCard } from './LifecycleCards';

type HeroMetric = 'reads' | 'accounts' | 'revenue';

/** a/b as a share only when the base can carry one; otherwise the counts themselves. */
const share = (a: number, b: number) => (b >= 5 ? fmtPct(a, b) : `${fmtInt(a)}/${fmtInt(b)}`);

export default function OverviewTab({ data, period, cmp, onOpenTab, notify }: {
  data: OverviewResponse; period: number; cmp: CompareSeries | null; onOpenTab?: (tab: string) => void; notify?: (text: string, ok?: boolean) => void;
}) {
  const { overview: o, integrations: i, growth: g, insights } = data;
  const [metric, setMetric] = useState<HeroMetric>('reads');
  // A value the server did not send is shown as "—", never as a zero.
  const miss = (path: string) => isMissing(o.missing, path);
  const show = (path: string, text: string) => (miss(path) ? DASH : text);
  const delta = (path: string, series: number[] | undefined, history?: number) => (miss(path) ? null : windowDelta(series, period, history));
  const internalOut = !o.includeInternal;
  const cov = o.coverage;

  const rd = o.activity.readsDaily;
  const readsDaily = rd.web.map((v, k) => v + (rd.ios[k] ?? 0) + (rd.android[k] ?? 0));
  const llmPeriod = o.llm.providers.anthropic.period + o.llm.providers.openai.period;
  const allReads = o.activity.reads + o.activity.readsInternal;
  const act = o.activity.activation;
  const premium = o.activity.levels.profundo + o.activity.levels.maximo;
  const delivered = g?.outcomes.outcomesSince ? g.outcomes.delivered : null;

  const hero: Record<HeroMetric, { label: string; values: number[]; path: string; format: ValueFormat; series?: number[]; history?: number; display: string }> = {
    reads: { label: 'Lecturas', values: readsDaily, path: 'activity.readsDaily', format: 'int', series: cmp?.reads, history: READS_HISTORY_DAYS, display: show('activity.reads', fmtInt(o.activity.reads)) },
    accounts: { label: 'Cuentas nuevas', values: o.accounts.daily, path: 'accounts.daily', format: 'int', series: cmp?.accounts, display: show('accounts.new', fmtInt(o.accounts.new)) },
    revenue: { label: 'Ingresos brutos', values: o.revenue.daily, path: 'revenue.daily', format: 'usd', series: cmp?.revenue, display: show('revenue.grossUsd', fmtUsd(o.revenue.grossUsd)) },
  };
  const h = hero[metric];
  const heroMissing = miss(h.path);
  const providers = Object.entries(o.accounts.byProvider).sort((a, b) => b[1] - a[1]);
  const heroNote = metric === 'reads'
    ? `Lecturas consumidas${internalOut ? ', sin las del equipo' : ''}. Registradas desde ${cov?.readsSince ? fmtDate(cov.readsSince) : '—'} (la tabla guarda 35 días).`
    : metric === 'revenue' && !cov?.purchasesSince ? 'Nunca ha llegado un evento de compra: este $0 no distingue "sin ventas" de "webhook sin entregar".'
    : undefined;

  return (
    <div className="flex flex-col gap-4">
      <MissingNote missing={o.missing} />
      <InsightsPanel insights={insights} missing={!g} onOpenTab={onOpenTab} notify={notify} period={period} internal={o.includeInternal} />

      <KpiStrip
        items={[
          {
            label: 'Personas activas · 7 días', value: g ? fmtInt(g.people.active7d) : DASH,
            caption: g
              ? `${fmtInt(g.people.readers7d)} leyeron · ${fmtInt(g.people.accounts)} cuentas + ${fmtInt(g.people.guests)} instalaciones sin cuenta${internalOut && (g.people.excluded.accounts + g.people.excluded.guests) ? ` · sin el equipo (−${fmtInt(g.people.excluded.accounts + g.people.excluded.guests)})` : ''}`
              : 'dato no disponible',
          },
          {
            label: `Lecturas · ${period}d`, value: show('activity.reads', fmtInt(o.activity.reads)),
            delta: delta('activity.readsDaily', cmp?.reads, READS_HISTORY_DAYS),
            caption: `${delivered != null ? `${fmtInt(delivered)} respuestas entregadas · ` : ''}${internalOut && o.activity.readsInternal ? `sin ${fmtInt(o.activity.readsInternal)} del equipo` : 'todas las lecturas'}`,
          },
          {
            label: `Cuentas nuevas · ${period}d`, value: show('accounts.new', fmtInt(o.accounts.new)), delta: delta('accounts.daily', cmp?.accounts),
            caption: `${show('accounts.total', fmtInt(o.accounts.total))} cuentas externas en total${internalOut && o.accounts.internal ? ` · ${fmtInt(o.accounts.internal)} del equipo fuera` : ''}`,
          },
        ]}
      />
      <KpiStrip
        items={[
          {
            label: 'Pagando Bobby Pro', value: show('subscriptions.active', fmtInt(o.subscriptions.paid)),
            caption: !cov?.purchasesSince ? 'nunca ha llegado un evento de compra (ni de prueba)'
              : `${fmtInt(o.subscriptions.trialing)} en prueba · ${fmtInt(o.subscriptions.giftedPro)} con Pro regalado · ${fmtUsd(o.revenue.grossUsd)} brutos en ${period}d`,
          },
          {
            label: 'Activación de cuentas nuevas', value: miss('activity.activation') ? DASH : act.accounts ? share(act.activated, act.accounts) : DASH,
            caption: miss('activity.activation') ? 'dato no disponible'
              : `${fmtInt(act.activated)} de ${fmtInt(act.accounts)} cuentas creadas desde ${act.measuredSince ? fmtDate(act.measuredSince) : '—'} leyeron${act.medianMinutes != null ? ` · mediana ${fmtMinutes(act.medianMinutes)}` : ''}${act.beforeCoverage ? ` · ${fmtInt(act.beforeCoverage)} anteriores sin medir` : ''}`,
          },
          {
            label: `Gasto IA · ${period}d`, value: show('llm.providers', fmtUsd(llmPeriod, true)), delta: delta('llm.daily', cmp?.llm), invert: true,
            caption: `${allReads ? `≈ ${fmtUsd(llmPeriod / allReads, true)} por lectura · ` : ''}ledger desde ${cov?.ledgerSince ? fmtDate(cov.ledgerSince) : '—'}, solo ${cov?.ledgerSurfaces.join(', ') || '—'} (incluye al equipo)`,
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
        note={heroNote}
      >
        <BarsChart
          days={o.days} values={h.values} format={h.format}
          emptyLabel={heroMissing ? 'Dato no disponible' : metric === 'revenue' ? 'Sin ingresos en el periodo' : 'Sin datos en el periodo'}
        />
      </HeroCard>

      {g && <PeopleCard people={g.people} includeInternal={g.includeInternal} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <BigNumber label="Lecturas por plataforma" value={show('activity.reads', fmtInt(o.activity.reads))} caption={`en ${period}d`} />
          {miss('activity.readsDaily') ? <p className="m-0 font-mono text-[12px] text-[#5C5C5C]">Dato no disponible</p> : (
            <StatusBars
              rows={(['web', 'ios', 'android'] as const).map((pf, k) => {
                const n = rd[pf].reduce((a, b) => a + b, 0);
                const last = o.activity.lastRead[pf];
                return { label: label(pf), value: n, fill: k === 1 ? 'orange' as const : 'blue' as const, sub: last ? `última ${fmtDateTime(last)}` : 'sin lecturas' };
              })}
            />
          )}
          <div className="mt-5 border-t border-white/[0.06] pt-4">
            <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.08em] text-[#5C5C5C]">Nivel de las lecturas</div>
            <StatusBars
              rows={[
                { label: 'Rápido', value: Math.max(0, o.activity.reads - premium), fill: 'blue', sub: fmtPct(Math.max(0, o.activity.reads - premium), o.activity.reads) },
                { label: 'Profundo', value: o.activity.levels.profundo, fill: 'orange', sub: fmtPct(o.activity.levels.profundo, o.activity.reads) },
                { label: 'Máximo', value: o.activity.levels.maximo, fill: 'orange', sub: fmtPct(o.activity.levels.maximo, o.activity.reads) },
              ]}
            />
          </div>
        </Card>
        <Card>
          <BigNumber label="Cuentas externas" value={show('accounts.total', fmtInt(o.accounts.total))} caption="Apple / Google" />
          {miss('accounts.byProvider') ? <p className="m-0 font-mono text-[12px] text-[#5C5C5C]">Dato no disponible</p> : providers.length ? (
            <StatusBars rows={providers.map(([k, v], idx) => ({ label: label(k), value: v, fill: (idx % 2 ? 'orange' : 'blue') as 'orange' | 'blue', sub: fmtPct(v, o.accounts.total) }))} />
          ) : <p className="m-0 font-mono text-[12px] text-[#5C5C5C]">Todavía no hay cuentas externas.</p>}
          <div className="mt-5 border-t border-white/[0.06] pt-2">
            <Row label="Leyeron en los últimos 7 días" value={fmtInt(o.accounts.active7d)} />
            <Row label="Lectores 7d (personas)" value={fmtInt(o.activity.activeReaders7d)} hint={`${fmtInt(o.activity.activeReaders7dSplit.accounts)} cuentas · ${fmtInt(o.activity.activeReaders7dSplit.guests)} invitados`} />
            {internalOut && <Row label="Del equipo (fuera de las cifras)" value={fmtInt(o.accounts.internal)} />}
            <Row label="Identidades wallet (no son cuentas)" value={fmtInt(o.accounts.wallets)} />
          </div>
        </Card>
      </div>

      <Card>
        <BigNumber label="Qué tan confiable es esto" value={g ? `${fmtInt(g.coverage.observedInstalls)} observadas` : DASH} caption={g ? `· ${fmtInt(g.coverage.backfillInstalls)} instalaciones reconstruidas aparte` : undefined} />
        <Note tag="Cobertura">{coverageLine(cov)}</Note>
        <div className="mt-3 grid gap-x-8 sm:grid-cols-2">
          <div>
            <Row label="Llegadas web observadas desde" value={g?.coverage.webObservedSince ? fmtDateTime(g.coverage.webObservedSince) : DASH} />
            <Row label="Instalaciones iOS observadas desde" value={g?.coverage.iosObservedSince ? fmtDateTime(g.coverage.iosObservedSince) : DASH} hint="solo iOS 1.5+" />
            <Row label="Resultados del desk desde" value={cov?.outcomesSince ? fmtDateTime(cov.outcomesSince) : 'próximo deploy'} />
            <Row label="Ubicación (web) desde" value={cov?.locatedSince ? fmtDateTime(cov.locatedSince) : DASH} />
          </div>
          <div>
            <Row label="Cuentas del equipo excluidas" value={g ? fmtInt(g.coverage.internalAccounts) : DASH} />
            <Row label="Instalaciones del equipo excluidas" value={g ? fmtInt(g.coverage.internalInstalls) : DASH} />
            <Row label="Visitas iOS / paywall iOS" value="sin medir" hint="la app no los reporta" />
            <Row label="Integraciones con problemas" value={i.missing.length ? `${fmtInt(i.missing.length)} variables faltan` : 'ver Integraciones'} />
          </div>
        </div>
      </Card>
    </div>
  );
}
