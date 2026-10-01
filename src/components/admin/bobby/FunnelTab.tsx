import { useCallback, useState } from 'react';
import {
  fetchAdminCosts, fetchAdminLifecycle, isMissing,
  type CohortFunnel, type LifecycleResponse, type OverviewResponse, type Retention,
} from '@/lib/admin-client';
import { Card, Empty, ErrorState, Loading, MissingNote, Note, Segmented, StaleBanner } from './ui';
import { BarsChart, BigNumber, HeroCard, StatusBars, type StatusRow } from './charts';
import FunnelDrawing, { type FunnelStage } from './FunnelDrawing';
import { LifecycleCard, SearchConsoleCard } from './LifecycleCards';
import EconomicsSection from './EconomicsSection';
import { growthWindows, windowDelta, type CompareSeries } from './deltas';
import { coverageLine, fmtCompact, fmtDate, fmtInt, fmtMinutes, fmtPct } from './format';
import { useLoad } from './useLoad';

type Platform = 'web' | 'ios';
type Notify = (text: string, ok?: boolean) => void;
const NOT_MEASURED = 'Sin medir';

/**
 * The nested funnel: every step is a subset of the one before it, so no step can exceed the previous.
 * Google / App Store sit on top as outlined aggregates (not the same people).
 */
function nestedStages(platform: Platform, f: CohortFunnel, d: LifecycleResponse): FunnelStage[] {
  const miss = (key: string) => isMissing(d.missing, `lifecycle.${platform}.${key}`);
  const v = (key: keyof CohortFunnel) => (miss(key) ? null : (f[key] as number));
  const noData = 'Dato no disponible';
  if (platform === 'web') {
    const sc = d.searchConsole;
    const google = sc.configured && !sc.error && sc.totals ? sc.totals : null;
    const gMissing = sc.configured ? 'Search Console con error' : 'Conecta Search Console';
    return [
      { key: 'impressions', label: 'Impresiones en Google', value: google ? google.impressions : null, aggregate: true, missing: gMissing, hint: 'Veces que bobbyprotocol.xyz apareció en Google. Agregado: no es la misma gente que el embudo.' },
      { key: 'clicks', label: 'Clics desde Google', value: google ? google.clicks : null, aggregate: true, missing: gMissing, hint: 'Clics desde la búsqueda de Google. Agregado: no es la misma gente que el embudo.' },
      { key: 'devices', label: 'Llegaron', value: v('devices'), missing: noData, hint: 'Navegadores vistos por primera vez en el periodo.' },
      { key: 'engaged', label: 'Usaron el desk', value: v('engaged'), missing: noData, hint: 'De los que llegaron: abrieron el desk o pidieron una lectura.' },
      { key: 'read1', label: '1.ª lectura', value: v('read1'), missing: noData, hint: 'De los que usaron el desk: recibieron al menos una lectura.' },
      { key: 'accountAfterRead', label: 'Crearon cuenta', value: v('accountAfterRead'), missing: noData, hint: 'De los que leyeron: iniciaron sesión con Apple o Google.' },
      { key: 'proAfterRead', label: 'Pro', value: v('proAfterRead'), missing: noData, hint: 'De los que leyeron y tienen cuenta: tienen Bobby Pro hoy.' },
    ];
  }
  const store = d.appStore;
  const downloads = store.configured && !store.error && store.totals ? store.totals.downloads : null;
  return [
    { key: 'downloads', label: 'Descargas App Store', value: downloads, aggregate: true, missing: store.configured ? 'App Store con error' : 'Conecta App Store', hint: 'Descargas nuevas según Apple. Agregado: no es la misma gente que el embudo.' },
    { key: 'devices', label: 'Abrieron la app', value: v('devices'), missing: noData, hint: 'Instalaciones vistas por primera vez en el periodo.' },
    { key: 'read1', label: '1.ª lectura', value: v('read1'), missing: noData, hint: 'De los que abrieron la app: recibieron al menos una lectura.' },
    { key: 'accountAfterRead', label: 'Cuenta', value: v('accountAfterRead'), missing: noData, hint: 'De los que leyeron: iniciaron sesión con Apple o Google.' },
    { key: 'proAfterRead', label: 'Pro', value: v('proAfterRead'), missing: noData, hint: 'De los que leyeron y tienen cuenta: tienen Bobby Pro hoy.' },
  ];
}

/** Depth and return, as a share of the people who read at least once. */
function depthRows(platform: Platform, f: CohortFunnel, d: LifecycleResponse): StatusRow[] {
  const ins = d.instrumentation;
  const base = f.read1;
  const row = (label: string, value: number, measured = true): StatusRow => (!measured
    ? { label, value: 0, missing: NOT_MEASURED, display: '—' }
    : { label, value: base ? value / base : 0, fill: 'blue', display: base ? fmtPct(value, base) : '—', sub: `n=${fmtInt(value)}` });
  return [
    row('2+ lecturas', f.read2),
    row('5+ lecturas', f.read5),
    row('Volvieron otro día', f.returnedAfterRead),
    row('Vieron el paywall', f.paywall, platform === 'web' ? ins.webPaywall : ins.iosPaywall),
    row('Iniciaron compra', 0, ins.purchaseStart),
  ];
}

const retention = (r: Retention) => (r.eligible > 0 ? fmtPct(r.returned, r.eligible) : '—');

function Chip({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.06] bg-[#1A1A1B] px-3 py-2.5 font-mono">
      <div className="truncate text-[10.5px] text-[#8B8B8B]">{label}</div>
      <div className="mt-1 text-[15px] text-[#EDEDED]">{value}</div>
      {sub && <div className="mt-0.5 truncate text-[10.5px] text-[#5C5C5C]" title={sub}>{sub}</div>}
    </div>
  );
}

function Ranked({ title, rows, base, uppercase, unavailable }: { title: string; rows: Array<{ name: string; visitors: number }>; base: number; uppercase: boolean; unavailable?: boolean }) {
  const total = base > 0 ? base : rows.reduce((s, r) => s + r.visitors, 0);
  return (
    <Card>
      <BigNumber label={title} value={unavailable ? '—' : fmtInt(rows.length)} caption={rows.length === 1 ? 'fuente' : 'fuentes'} />
      {unavailable ? <Empty>Dato no disponible</Empty> : rows.length ? (
        <StatusBars
          uppercase={uppercase}
          labelWidth={130}
          rows={rows.map((r, i) => ({ label: r.name, value: r.visitors, fill: i === 0 ? 'orange' : 'blue', sub: fmtPct(r.visitors, total) }))}
        />
      ) : <Empty>Sin datos todavía</Empty>}
    </Card>
  );
}

export default function FunnelTab({ data, period, cmp, refreshKey, notify }: {
  data: OverviewResponse; period: number; cmp: CompareSeries | null; refreshKey: number; notify: Notify;
}) {
  const { overview: o } = data;
  const [platform, setPlatform] = useState<Platform>('web');
  const lc = useLoad(() => fetchAdminLifecycle(period), `${period}|lc|${refreshKey}`);
  const costs = useLoad(fetchAdminCosts, `costs|${refreshKey}`);
  const reloadLc = lc.reload, reloadCosts = costs.reload;
  const onEconomicsChanged = useCallback(() => { void reloadLc(true); void reloadCosts(true); }, [reloadLc, reloadCosts]);
  // Lifecycle data from another period is never shown under this period's label.
  const d = lc.data && lc.dataKey?.split('|')[0] === String(period) ? lc.data : null;
  const f = d ? d.lifecycle[platform] : null;
  const w = o.funnel.web;
  const coverage = d?.coverage ?? o.coverage;
  const visitsMissing = isMissing(o.missing, 'funnel.visitsDaily');

  return (
    <div className="flex flex-col gap-4">
      <Note tag="Cobertura">{coverageLine(coverage)}</Note>
      {d && <MissingNote missing={d.missing} />}
      {d && lc.error && <StaleBanner error={lc.error} onRetry={() => void lc.reload()} />}

      <Card>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] text-[#EDEDED]/90">Embudo</div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 font-mono">
              <span className="text-[26px] font-medium leading-none tracking-[-0.02em] text-[#EDEDED]">{f && !isMissing(d?.missing, `lifecycle.${platform}.devices`) ? fmtInt(f.devices) : '—'}</span>
              <span className="text-[12px] text-[#8B8B8B]">{platform === 'web' ? 'navegadores nuevos' : 'instalaciones nuevas'} · {period}d</span>
            </div>
          </div>
          <Segmented<Platform> label="Plataforma" value={platform} onChange={setPlatform} options={[{ value: 'web', label: 'Web' }, { value: 'ios', label: 'iOS' }]} />
        </div>

        {lc.error && !d ? <ErrorState message={lc.error.message} onRetry={() => void lc.reload()} />
          : !d || !f ? <Loading label="Cargando el embudo" />
          : (
            <div className={lc.loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
              <FunnelDrawing key={platform} idPrefix={`funnel-${platform}`} stages={nestedStages(platform, f, d)} />
              <p className="m-0 mt-5 font-mono text-[10.5px] leading-relaxed text-[#5C5C5C]">
                Cada paso es parte del anterior. {platform === 'ios' && !d.instrumentation.iosVisits ? 'La app iOS no reporta visitas ni el paywall (sin medir). ' : ''}
                Toca o pasa el cursor sobre una etapa para ver el detalle.
              </p>
              <div className="mt-6 border-t border-white/[0.06] pt-5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[13px] text-[#EDEDED]/90">Profundidad</span>
                  <span className="font-mono text-[11px] text-[#5C5C5C]">% de los {fmtInt(f.read1)} que leyeron</span>
                </div>
                <div className="mt-4 max-w-[760px]"><StatusBars max={1} labelWidth={150} stackMobile rows={depthRows(platform, f, d)} /></div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <Chip
                  label="Mediana a 1.ª lectura" value={fmtMinutes(f.medianMinutesToFirstRead)}
                  sub={coverage?.readerStatsSince ? `registrada desde ${fmtDate(coverage.readerStatsSince)}` : undefined}
                />
                <Chip label="Mediana a cuenta" value={fmtMinutes(f.medianMinutesToAccount)} />
                {platform === 'web' && <Chip label="Clics a App Store" value={fmtInt(f.appStoreClick)} sub={fmtPct(f.appStoreClick, f.devices)} />}
                <Chip label="Inicios de sesión" value={fmtInt(f.signinStart)} sub={fmtPct(f.signinStart, f.devices)} />
                <Chip label="Retención D1" value={retention(f.retention.d1)} sub={`n=${fmtInt(f.retention.d1.eligible)}`} />
                <Chip label="Retención D7" value={retention(f.retention.d7)} sub={`n=${fmtInt(f.retention.d7.eligible)}`} />
              </div>
            </div>
          )}
      </Card>

      {d && <LifecycleCard stages={d.lifecycle.stages} />}
      {d && <SearchConsoleCard sc={d.searchConsole} period={period} />}

      <HeroCard
        title="Visitas web por día"
        value={visitsMissing ? '—' : fmtCompact(o.funnel.visitsDaily.reduce((a, b) => a + b, 0))}
        delta={visitsMissing ? null : windowDelta(cmp?.visits, period)}
        chips={visitsMissing ? [] : growthWindows(cmp?.visits)}
      >
        <BarsChart days={o.days} values={o.funnel.visitsDaily} height={180} emptyLabel={visitsMissing ? 'Dato no disponible' : 'Todavía no hay visitas registradas'} />
      </HeroCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <Ranked title="Superficies más visitadas (web)" uppercase unavailable={isMissing(o.missing, 'funnel.topSurfaces')} base={w.visitors} rows={o.funnel.topSurfaces.map((r) => ({ name: r.surface || 'other', visitors: r.visitors }))} />
        <Ranked title="De dónde llegan (web)" uppercase={false} unavailable={isMissing(o.missing, 'funnel.topReferrers')} base={w.visitors} rows={o.funnel.topReferrers.map((r) => ({ name: !r.referrer || r.referrer === 'direct' ? '(directo)' : r.referrer, visitors: r.visitors }))} />
      </div>

      {d ? (
        <EconomicsSection
          e={d.economics} costs={costs.data} costsError={costs.error} onCostsRetry={() => void costs.reload()}
          period={period} notify={notify} onChanged={onEconomicsChanged}
        />
      ) : lc.error ? null : <Loading label="Cargando economía unitaria" />}
    </div>
  );
}
