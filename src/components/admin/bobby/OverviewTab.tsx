import { useState } from 'react';
import { isMissing, type OverviewResponse } from '@/lib/admin-client';
import { Card, KpiStrip, MissingNote, Note, Row, Segmented, Tag } from './ui';
import { BarsChart, HeroCard, StatusBars } from './charts';
import { READS_HISTORY_DAYS, windowDelta, type CompareSeries } from './deltas';
import { DASH, coverageLine, fmtDate, fmtDateTime, fmtInt, fmtMinutes, fmtPct, fmtUsd, label, teamReadsCaption, type ValueFormat } from './format';
import InsightsPanel from './InsightsPanel';
import { PeopleCard } from './LifecycleCards';

type HeroMetric = 'reads' | 'accounts' | 'revenue';
const share = (a: number, b: number) => (b >= 5 ? fmtPct(a, b) : `${fmtInt(a)}/${fmtInt(b)}`);
const detailClass = 'rounded-2xl border border-white/[0.06] bg-[#141415] p-4 text-[12px] text-[#8B8B8B] sm:p-5';

export default function OverviewTab({ data, period, cmp, onOpenTab, notify, markFailed = false }: {
  data: OverviewResponse; period: number; cmp: CompareSeries | null; onOpenTab?: (tab: string) => void; notify?: (text: string, ok?: boolean) => void;
  /** No caption claims a verified exclusion when the owner's browser could not be marked. */
  markFailed?: boolean;
}) {
  const { overview: o, integrations: i, growth: g, insights } = data;
  const [metric, setMetric] = useState<HeroMetric>('reads');
  const miss = (path: string) => isMissing(o.missing, path);
  const show = (path: string, text: string) => (miss(path) ? DASH : text);
  const delta = (path: string, series: number[] | undefined, history?: number) => (miss(path) ? null : windowDelta(series, period, history));
  const cov = o.coverage;
  const rd = o.activity.readsDaily;
  const readsDaily = rd.web.map((v, k) => v + (rd.ios[k] ?? 0) + (rd.android[k] ?? 0));
  const llmPeriod = o.llm.providers.anthropic.period + o.llm.providers.openai.period;
  const act = o.activity.activation;
  const premium = o.activity.levels.profundo + o.activity.levels.maximo;
  const tf = g?.people.traffic ?? null;
  const peopleSplit = g ? `${fmtInt(g.people.accounts)} cuentas + ${fmtInt(g.people.guests)} instalaciones sin cuenta` : 'dato no disponible';
  const hero: Record<HeroMetric, { label: string; values: number[]; path: string; format: ValueFormat; series?: number[]; history?: number; display: string }> = {
    reads: { label: 'Lecturas consumidas', values: readsDaily, path: 'activity.readsDaily', format: 'int', series: cmp?.reads, history: READS_HISTORY_DAYS, display: show('activity.reads', fmtInt(o.activity.reads)) },
    accounts: { label: 'Cuentas nuevas', values: o.accounts.daily, path: 'accounts.daily', format: 'int', series: cmp?.accounts, display: show('accounts.new', fmtInt(o.accounts.new)) },
    revenue: { label: 'Ingresos brutos registrados · USD', values: o.revenue.daily, path: 'revenue.daily', format: 'usd', series: cmp?.revenue, display: show('revenue.grossUsd', fmtUsd(o.revenue.grossUsd)) },
  };
  const h = hero[metric];
  const heroMissing = miss(h.path);
  const providers = Object.entries(o.accounts.byProvider).sort((a, b) => b[1] - a[1]);
  const reconciliation = (!miss('revenue.unattributedEvents') && o.revenue.unattributedEvents > 0)
    || (!miss('revenue.unconvertedEvents') && o.revenue.unconvertedEvents > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-[13px] font-medium text-[#EDEDED]">Pulso del negocio</h2>
        <span className="text-[11px] text-[#8B8B8B]">Histórico · {period} días · {o.includeInternal ? 'con equipo' : markFailed ? 'sin equipo, sin verificar' : 'sin equipo'}</span>
      </div>
      <KpiStrip compact items={[
        tf
          ? { label: 'Activos con señal de persona · 7d', value: fmtInt(tf.verified7d),
            caption: `De ${fmtInt(g!.people.active7d)} activos: ${fmtInt(tf.datacenter7d)} de centro de datos · ${fmtInt(tf.unverified7d)} sin señal` }
          : { label: 'Cuentas e instalaciones activas · 7d', value: g ? fmtInt(g.people.active7d) : DASH,
            caption: 'No son personas únicas' },
        { label: `Lecturas consumidas · ${period}d`, value: show('activity.reads', fmtInt(o.activity.reads)), delta: delta('activity.readsDaily', cmp?.reads, READS_HISTORY_DAYS),
          caption: 'Descontadas del cupo' },
        { label: 'Pagadores Pro verificados', value: show('subscriptions.paidVerified', fmtInt(o.subscriptions.paidVerified)),
          caption: cov?.purchasesSince ? 'Cargo de producción confirmado; sin pruebas ni regalos' : 'Sin eventos de compra: cobertura sin comprobar' },
        { label: `Gasto IA · ${period}d`, value: show('llm.providers', fmtUsd(llmPeriod, true)), delta: delta('llm.daily', cmp?.llm), invert: true,
          caption: 'Ledger registrado · incluye al equipo' },
      ]} />

      <InsightsPanel insights={insights} missing={!g || data.insightsUnavailable} onOpenTab={onOpenTab} notify={notify} period={period} internal={o.includeInternal} markFailed={markFailed} />

      <HeroCard title={`Tendencia · ${h.label}`}
        toggle={<Segmented<HeroMetric> label="Métrica" value={metric} onChange={setMetric}
          options={[{ value: 'reads', label: 'Lecturas' }, { value: 'accounts', label: 'Cuentas' }, { value: 'revenue', label: 'Ingresos' }]} />}
        value={h.display} delta={heroMissing ? null : windowDelta(h.series, period, h.history)}
        note={metric === 'reads' ? `Consumo registrado desde ${cov?.readsSince ? fmtDate(cov.readsSince) : '—'}; histórico de 35 días.`
          : metric === 'revenue' && !cov?.purchasesSince ? 'Sin eventos de compra: $0 registrado no demuestra que no hubo ventas.' : undefined}>
        <BarsChart days={o.days} values={h.values} format={h.format} height={180}
          emptyLabel={heroMissing ? 'Dato no disponible' : metric === 'revenue' ? 'Sin ingresos atribuidos al filtro del periodo' : 'Sin registros en el periodo'} />
      </HeroCard>

      <details className={detailClass}>
        <summary className="cursor-pointer text-[13px] text-[#EDEDED]">Cuentas, lecturas y activación <span className="ml-2 text-[11px] text-[#8B8B8B]">Desglose y muestras</span></summary>
        <div className="mt-4 flex flex-col gap-4">
          {g && <PeopleCard people={g.people} includeInternal={g.includeInternal} markFailed={markFailed} />}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h3 className="m-0 mb-3 text-[13px] font-normal text-[#EDEDED]">Lecturas por plataforma · {period}d</h3>
              {miss('activity.readsDaily') ? <p className="m-0">Dato no disponible</p> : <StatusBars rows={(['web', 'ios', 'android'] as const).map((pf, k) => ({
                label: label(pf), value: rd[pf].reduce((a, b) => a + b, 0), fill: k === 1 ? 'orange' as const : 'blue' as const,
                sub: o.activity.lastRead[pf] ? `última ${fmtDateTime(o.activity.lastRead[pf])}` : 'sin lecturas registradas',
              }))} />}
              <div className="mt-4 border-t border-white/[0.06] pt-3">
                <Row label="Rápido" value={miss('activity.reads') || miss('activity.levels') ? DASH : fmtInt(Math.max(0, o.activity.reads - premium))} />
                <Row label="Profundo" value={show('activity.levels', fmtInt(o.activity.levels.profundo))} />
                <Row label="Máximo" value={show('activity.levels', fmtInt(o.activity.levels.maximo))} />
                <Row label="Respuestas emitidas por servidor" value={g?.outcomes.outcomesSince ? fmtInt(g.outcomes.delivered) : DASH}
                  hint={g?.outcomes.outcomesSince ? `desde ${fmtDate(g.outcomes.outcomesSince)}; no confirma recepción` : 'sin cobertura observada'} />
                <Row label="Fallos / interrumpidas en servidor" value={g?.outcomes.outcomesSince ? `${fmtInt(g.outcomes.failed)} / ${g.outcomes.abandoned == null ? DASH : fmtInt(g.outcomes.abandoned)}` : DASH} />
                <p className="m-0 mt-3 text-[11px]">{teamReadsCaption(o.includeInternal, miss('activity.readsInternal') ? null : o.activity.readsInternal, markFailed)}</p>
              </div>
            </Card>
            <Card>
              <h3 className="m-0 mb-3 text-[13px] font-normal text-[#EDEDED]">Cuentas autenticadas</h3>
              <Row label="Total" value={show('accounts.total', fmtInt(o.accounts.total))} />
              <Row label={`Nuevas · ${period}d`} value={show('accounts.new', fmtInt(o.accounts.new))} />
              <Row label="Cuentas que leyeron · 7d" value={show('accounts.active7d', fmtInt(o.accounts.active7d))} />
              <Row label="Lectores observados · 7d" value={show('activity.activeReaders7d', fmtInt(o.activity.activeReaders7d))} hint={`${show('activity.activeReaders7dSplit', fmtInt(o.activity.activeReaders7dSplit.accounts))} cuentas · ${show('activity.activeReaders7dSplit', fmtInt(o.activity.activeReaders7dSplit.guests))} instalaciones sin cuenta`} />
              <Row label="Cuentas nuevas que se activaron" value={miss('activity.activation') || !act.accounts ? DASH : share(act.activated, act.accounts)}
                hint={miss('activity.activation') ? 'dato no disponible' : `${fmtInt(act.activated)} de ${fmtInt(act.accounts)} creadas desde ${act.measuredSince ? fmtDate(act.measuredSince) : '—'} leyeron${act.medianMinutes != null ? ` · mediana ${fmtMinutes(act.medianMinutes)}` : ''}${act.beforeCoverage ? ` · ${fmtInt(act.beforeCoverage)} anteriores sin medir` : ''}`} />
              <Row label="Identidades wallet (no son cuentas)" value={show('accounts.wallets', fmtInt(o.accounts.wallets))} />
              {!miss('accounts.byProvider') && providers.length > 0 && <div className="mt-4"><StatusBars rows={providers.map(([key, value], index) => ({ label: label(key), value, fill: (index % 2 ? 'orange' : 'blue') as 'orange' | 'blue' }))} /></div>}
            </Card>
          </div>
        </div>
      </details>

      <details className={detailClass}>
        <summary className="cursor-pointer text-[13px] text-[#EDEDED]">Ingresos y acceso Pro {reconciliation && <span className="ml-2"><Tag tone="orange">Conciliación pendiente</Tag></span>}</summary>
        <div className="mt-4">
          <Row label={`Ingresos brutos registrados · ${period}d`} value={show('revenue.grossUsd', fmtUsd(o.revenue.grossUsd))} />
          <Row label="Pagadores verificados" value={show('subscriptions.paidVerified', fmtInt(o.subscriptions.paidVerified))} />
          <Row label="Pro sin pago verificado" value={show('subscriptions.unverified', fmtInt(o.subscriptions.unverified))} />
          <Row label="Acceso de prueba" value={show('subscriptions.test', fmtInt(o.subscriptions.test))} />
          <Row label="Pro regalado" value={show('subscriptions.giftedPro', fmtInt(o.subscriptions.giftedPro))} />
          {!cov?.purchasesSince && <div className="mt-3"><Note tag="Cobertura">Nunca ha llegado un evento de compra: $0 registrado no distingue «sin ventas» de «webhook sin entregar».</Note></div>}
          {!miss('revenue.unattributedEvents') && o.revenue.unattributedEvents > 0 && <div className="mt-3"><Note tag="Por conciliar">
            {fmtUsd(o.revenue.unattributedGrossUsd)} en ingresos y {fmtUsd(o.revenue.unattributedRefundsUsd)} en reembolsos sin cuenta atribuida ({fmtInt(o.revenue.unattributedEvents)} eventos).
            {o.includeInternal ? ' Están en el total; la pertenencia a clientes o equipo sigue sin verificar.' : ' Quedan aparte y fuera de los ingresos de clientes externos. $0 externo no descarta estos registros.'}
          </Note></div>}
          {!miss('revenue.unconvertedEvents') && o.revenue.unconvertedEvents > 0 && <div className="mt-3"><Note tag="Importe pendiente">{fmtInt(o.revenue.unconvertedEvents)} eventos sin importe USD confirmado; no se convierten con una tasa supuesta.</Note></div>}
        </div>
      </details>

      <details className={detailClass}>
        <summary className="cursor-pointer text-[13px] text-[#EDEDED]">Cobertura y definiciones {o.missing.length > 0 && <span className="ml-2"><Tag tone="orange">Datos incompletos</Tag></span>}</summary>
        <div className="mt-4">
          <MissingNote missing={o.missing} />
          <p className="m-0 mb-4 text-[12px] leading-relaxed">{peopleSplit}. Una cuenta y sus instalaciones se deduplican; una persona con dos instalaciones anónimas puede contar dos veces.</p>
          <Note tag="Cobertura">{coverageLine(cov)}</Note>
          <div className="mt-3 grid gap-x-8 sm:grid-cols-2">
            <div>
              <Row label="Instalaciones observadas / reconstruidas" value={g ? `${fmtInt(g.coverage.observedInstalls)} / ${fmtInt(g.coverage.backfillInstalls)}` : DASH} />
              <Row label="Llegadas web desde" value={g?.coverage.webObservedSince ? fmtDateTime(g.coverage.webObservedSince) : DASH} />
              <Row label="Instalaciones iOS desde" value={g?.coverage.iosObservedSince ? fmtDateTime(g.coverage.iosObservedSince) : DASH} hint="solo iOS 1.5+" />
              <Row label="Instalaciones Android desde" value={g?.coverage.androidObservedSince ? fmtDateTime(g.coverage.androidObservedSince) : DASH} hint={g?.coverage.androidObservedSince ? 'cobertura observada' : 'sin cobertura confirmada'} />
              <Row label="Ubicación web desde" value={cov?.locatedSince ? fmtDateTime(cov.locatedSince) : DASH} />
            </div>
            <div>
              <Row label="Cuentas del equipo excluidas" value={g ? fmtInt(g.coverage.internalAccounts) : DASH} />
              <Row label="Instalaciones del equipo excluidas" value={g ? fmtInt(g.coverage.internalInstalls) : DASH} />
              <Row label="Visitas / paywall iOS" value="sin medir" hint="la app no los reporta" />
              <Row label="Integraciones" value={i.missing.length ? `${fmtInt(i.missing.length)} variables faltan` : 'ver Integraciones'} />
            </div>
          </div>
          <p className="m-0 mt-4 text-[11px]">El gasto IA incluye al equipo y solo cubre el ledger desde {cov?.ledgerSince ? fmtDate(cov.ledgerSince) : '—'} ({cov?.ledgerSurfaces.join(', ') || 'sin superficies confirmadas'}).</p>
        </div>
      </details>
    </div>
  );
}
