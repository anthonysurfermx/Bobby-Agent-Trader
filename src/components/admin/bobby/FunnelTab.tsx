// "Embudo": the installs seen arriving in the period (growth, sent with the overview) drawn as a nested funnel
// per platform, what they did after the first read, retention, the rebuilt history kept apart, the desk's
// server-side outcomes, acquisition by first touch, a UTM link builder, Search Console and unit economics.
// The data is tiny, so under MIN_BASE a share is shown as "a/b", never as a percentage, and every figure
// carries its base. "Sin medir" (not instrumented) is never shown as zero.
import { useCallback, useState, type ReactNode } from 'react';
import {
  fetchAdminCosts, fetchAdminLifecycle, isMissing,
  type AdminIntegrations, type Growth, type GrowthCohort, type GrowthHistory, type OverviewResponse, type RetentionCell, type SearchConsoleData,
} from '@/lib/admin-client';
import { Card, CardHead, Empty, ErrorState, Loading, MissingNote, Note, Segmented, StaleBanner, TableScroll, Tag, td, th, tr } from './ui';
import { BarsChart, BigNumber, HeroCard, StatusBars, type StatusRow } from './charts';
import FunnelDrawing, { type FunnelStage } from './FunnelDrawing';
import { SearchConsoleCard } from './LifecycleCards';
import EconomicsSection from './EconomicsSection';
import UtmBuilder from './UtmBuilder';
import { growthWindows, windowDelta, type CompareSeries } from './deltas';
import { DASH, fmtCompact, fmtDate, fmtDateTime, fmtDays, fmtInt, fmtMinutes, fmtPct, label, teamOut, timeOf } from './format';
import { useLoad } from './useLoad';
import { CORE_REFRESH_MS, CORE_STALE_MS, sourceMetaForError } from './live';
import SourceFreshness from './SourceFreshness';

type Platform = 'web' | 'ios' | 'android';
type Notify = (text: string, ok?: boolean) => void;

const MIN_BASE = 5;
const NOT_MEASURED = 'Sin medir';
const NO_OUTCOMES = 'Aún sin registros';
/** a of b: a percentage only when the base can carry one. */
const share = (a: number, b: number) => (!b ? '—' : b >= MIN_BASE ? fmtPct(a, b) : `${fmtInt(a)}/${fmtInt(b)}`);

const LEVEL_LABEL: Record<string, string> = { rapido: 'Rápido', profundo: 'Profundo', maximo: 'Máximo' };
// desk_blocked reasons written by api/desk-debate.ts; anything else is shown as sent.
const BLOCK_LABEL: Record<string, string> = {
  budget_paused: 'gasto de IA pausado', premium_paused: 'niveles premium pausados', unavailable: 'cupo no disponible', daily_limit: 'límite diario',
  no_provider_keys: 'sin llaves de IA', no_address: 'sin dirección del cliente', level_unavailable: 'medidor de nivel no disponible',
};
const sourceLabel = (s: string) => (s === 'direct' || !s ? '(directo)' : s.startsWith('utm:') ? `${s.slice(4)} (UTM)` : s);

// ---------------------------------------------------------------- the drawn funnel

/** Google and Apple aggregates cannot leave the team out: their hints say so while the header does. */
const SOURCE_TEAM = ' Incluye al equipo (la fuente no lo separa).';

function webStages(c: GrowthCohort, sc: SearchConsoleData | null, teamOut: boolean): FunnelStage[] {
  const google = sc && sc.configured && !sc.error && sc.totals ? sc.totals : null;
  const gMissing = !sc ? 'Dato no disponible' : sc.configured ? 'Search Console con error' : 'Conecta Search Console';
  const team = teamOut ? SOURCE_TEAM : '';
  return [
    { key: 'impressions', label: 'Impresiones en Google', value: google ? google.impressions : null, aggregate: true, missing: gMissing,
      hint: `Veces que bobbyprotocol.xyz salió en resultados de Google en el periodo. Son búsquedas, no personas: otra población que el embudo.${team}` },
    { key: 'clicks', label: 'Clics desde Google', value: google ? google.clicks : null, aggregate: true, missing: gMissing,
      hint: `Clics desde la búsqueda de Google. Una persona puede dar varios; no se pueden seguir uno a uno dentro del embudo.${team}` },
    { key: 'arrived', label: 'Llegaron', value: c.arrived,
      hint: 'Navegadores vistos llegando en el periodo (su primera visita quedó registrada). Sin el histórico reconstruido.' },
    { key: 'deskOrRead', label: 'Abrieron el desk', value: c.deskOrRead, hint: 'De los que llegaron: abrieron /desk o pidieron una lectura.' },
    { key: 'read1', label: '1.ª lectura', value: c.read1, hint: 'De los que abrieron el desk: consumieron al menos una lectura del cupo. No prueba que el cliente la mostró.' },
    { key: 'accountAfterRead', label: 'Lectura + cuenta', value: c.accountAfterRead,
      hint: 'De los que registraron una lectura: ese navegador quedó ligado a una cuenta autenticada verificada (nueva o que ya existía).' },
    { key: 'proAfterRead', label: 'Pro', value: c.proAfterRead, hint: 'De los navegadores con consumo registrado y cuenta: acceso Pro hoy (pago, prueba o regalo).' },
  ];
}

function nativeStages(c: GrowthCohort, store: AdminIntegrations['appStore'] | null, teamOut: boolean, platform: 'ios' | 'android'): FunnelStage[] {
  const ok = store && store.configured && !store.error && store.totals ? store.totals : null;
  const range = store?.coveredFrom ? ` Reportes de Apple del ${fmtDate(store.coveredFrom)} al ${fmtDate(store.coveredTo)}.` : '';
  const pending = store?.pendingDays?.length ? ` ${fmtInt(store.pendingDays.length)} ${store.pendingDays.length === 1 ? 'día reciente aún sin publicar' : 'días recientes aún sin publicar'} (no son ceros).` : '';
  const missingDays = store?.missingDays ?? [];
  const partial = store?.partial ? ` Carga parcial: faltan ${fmtInt(missingDays.length)} ${missingDays.length === 1 ? 'día' : 'días'}${missingDays.length ? ` (${fmtDays(missingDays)})` : ''}; el total cubre solo los días cargados.` : '';
  return [
    ...(platform === 'android' ? [{ key: 'downloads', label: 'Descargas Google Play', value: null, aggregate: true,
      missing: 'Sin fuente conectada', hint: 'El dashboard no consulta los reportes de Play Console; las lecturas de Android no prueban descargas ni distribución.' }] : [{ key: 'downloads', label: store?.partial ? 'Descargas App Store (parcial)' : 'Descargas App Store', value: ok ? ok.downloads : null, aggregate: true,
      missing: !store ? 'Dato no disponible' : store.configured ? 'App Store con error' : 'Conecta App Store',
      hint: `Descargas nuevas según Apple: otra población que el embudo (incluye a quien nunca abrió la app).${range}${pending}${partial}${teamOut ? SOURCE_TEAM : ''}` }]),
    { key: 'arrived', label: 'Instalaciones observadas', value: c.arrived, hint: 'Instalaciones con primer contacto registrado en el periodo. No equivale a todas las aperturas de la app.' },
    { key: 'read1', label: '1.ª lectura', value: c.read1, hint: 'De las instalaciones observadas: consumieron al menos una lectura del cupo. No prueba que la app la mostró.' },
    { key: 'accountAfterRead', label: 'Cuenta', value: c.accountAfterRead, hint: 'De las que registraron una lectura: quedaron ligadas a una cuenta autenticada verificada.' },
    { key: 'proAfterRead', label: 'Pro', value: c.proAfterRead, hint: 'De las instalaciones con consumo registrado y cuenta: acceso Pro hoy (pago, prueba o regalo).' },
  ];
}

/** One "x of base" bar; with a small base the bar still shows the share but the text gives the counts. */
function ofRow(labelText: string, value: number, base: number, missing?: string): StatusRow {
  if (missing) return { label: labelText, value: 0, missing, display: '—' };
  return {
    label: labelText, value: base > 0 ? value / base : 0, fill: 'blue', display: fmtInt(value),
    sub: base >= MIN_BASE ? `${fmtPct(value, base)} de ${fmtInt(base)}` : `de ${fmtInt(base)}`,
  };
}

function afterReadRows(platform: Platform, c: GrowthCohort, outcomes: boolean): StatusRow[] {
  const wallMissing = outcomes ? undefined : NO_OUTCOMES;
  return [
    ofRow('2+ lecturas', c.read2, c.read1),
    // Install reads include signed-in ones since the device is kept on them: this is "3+ reads", not the guest wall.
    ofRow('3+ lecturas', c.read3, c.read1),
    ofRow('Chocaron con el muro de registro', c.wall, c.read1, wallMissing),
    ofRow('Cuenta tras el muro', c.accountAfterWall, c.wall, wallMissing),
    // The iOS app does not report the start of a sign-in (only the web does).
    ofRow('Empezaron a iniciar sesión', c.signinStart, c.arrived, platform !== 'web' ? `${NOT_MEASURED}: la app no lo reporta` : undefined),
    ofRow('Cuenta (nueva o existente)', c.account, c.arrived),
    ofRow('Pro', c.proAfterRead, c.accountAfterRead),
  ];
}

function Chip({ label: k, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.06] bg-[#1A1A1B] px-3 py-2.5 font-mono">
      <div className="truncate text-[10.5px] text-[#8B8B8B]">{k}</div>
      <div className="mt-1 text-[15px] text-[#EDEDED]">{value}</div>
      {sub && <div className="mt-0.5 truncate text-[10.5px] text-[#5C5C5C]" title={sub}>{sub}</div>}
    </div>
  );
}

function SubHead({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className="text-[13px] text-[#EDEDED]/90">{title}</span>
      {sub && <span className="font-mono text-[11px] text-[#5C5C5C]">{sub}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- retention

const cellText = (x: number, n: number) => (!n ? '—' : n >= MIN_BASE ? `${fmtInt(x)}/${fmtInt(n)} · ${fmtPct(x, n)}` : `${fmtInt(x)}/${fmtInt(n)}`);

function RetentionTable({ r }: { r: GrowthCohort['retention'] }) {
  const rows: Array<[string, RetentionCell, string]> = [
    ['D1', r.d1, 'el día exacto siguiente a su llegada'],
    ['D7', r.d7, 'el día 7 exacto'],
    ['Semana 1', r.w1, 'cualquier día del 1 al 7'],
    ['Lectores que volvieron', r.readersBack, 'de quienes leyeron: volvieron otro día en su primera semana (hasta hoy)'],
  ];
  return (
    <TableScroll minWidth={520}>
      <thead>
        <tr>
          <th className={th}>Retención</th><th className={`${th} text-right`}>Elegibles</th>
          <th className={`${th} text-right`}>Volvieron a abrir</th><th className={`${th} text-right`}>Volvieron a leer</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([k, c, def]) => (
          <tr key={k} className={tr}>
            <td className={td}>
              <div className="text-[12.5px]">{k}</div>
              <div className="font-mono text-[10.5px] text-[#5C5C5C]">{def}</div>
            </td>
            <td className={`${td} text-right font-mono text-[12.5px]`}>{c.eligible ? fmtInt(c.eligible) : <span className="text-[#5C5C5C]">aún nadie</span>}</td>
            <td className={`${td} text-right font-mono text-[12.5px]`}>{cellText(c.returned, c.eligible)}</td>
            <td className={`${td} text-right font-mono text-[12.5px] text-[#8B8B8B]`}>{cellText(c.read, c.eligible)}</td>
          </tr>
        ))}
      </tbody>
    </TableScroll>
  );
}

// ---------------------------------------------------------------- funnel card

function FunnelCard({ g, period, sc, store }: { g: Growth; period: number; sc: SearchConsoleData | null; store: AdminIntegrations['appStore'] | null }) {
  const [platform, setPlatform] = useState<Platform>('web');
  const c = g.cohorts[platform];
  const outcomesSince = g.coverage.outcomesSince;
  const observedSince = platform === 'web' ? g.coverage.webObservedSince : platform === 'ios' ? g.coverage.iosObservedSince : g.coverage.androidObservedSince;
  const partialOutcomes = outcomesSince != null && (timeOf(outcomesSince) ?? 0) > (timeOf(g.since) ?? 0);
  if (!c) return <Card><CardHead title="Embudo Android" /><Note tag="Fuente pendiente">El servidor aún no envía esta cohorte. No se interpreta como cero instalaciones.</Note>
    <button type="button" className="mt-3 text-[#EDEDED]" onClick={() => setPlatform('web')}>Volver a Web</button></Card>;
  const existing = Math.max(0, c.account - c.accountNew);

  return (
    <Card>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] text-[#EDEDED]/90">Embudo · llegadas observadas</div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 font-mono">
            <span className="text-[26px] font-medium leading-none tracking-[-0.02em] text-[#EDEDED]">{fmtInt(c.arrived)}</span>
            <span className="text-[12px] text-[#8B8B8B]">
              {platform === 'web' ? 'navegadores' : 'instalaciones'} · {period}d{observedSince ? ` · medido desde ${fmtDate(observedSince)}` : ' · sin medición aún'}
            </span>
          </div>
        </div>
        <Segmented<Platform> label="Plataforma" value={platform} onChange={setPlatform} options={[{ value: 'web', label: 'Web' }, { value: 'ios', label: 'iOS' }, { value: 'android', label: 'Android' }]} />
      </div>

      {c.arrived < MIN_BASE && (
        <div className="mb-5">
          <Note tag="Muestra pequeña" tone="orange">
            Con {fmtInt(c.arrived)} {c.arrived === 1 ? 'llegada' : 'llegadas'} cualquier % es ruido; mira los conteos.
          </Note>
        </div>
      )}

      <FunnelDrawing key={platform} idPrefix={`funnel-${platform}`} stages={platform === 'web' ? webStages(c, sc, !g.includeInternal) : nativeStages(c, platform === 'ios' ? store : null, !g.includeInternal, platform)} />
      <p className="m-0 mt-5 font-mono text-[10.5px] leading-relaxed text-[#5C5C5C]">
        En la cohorte, cada paso es parte del anterior. Los pasos con borde (Google, App Store) son agregados de otra población y no se comparan uno a uno{g.includeInternal ? '' : '; incluyen al equipo (la fuente no lo separa)'}.
        Toca o pasa el cursor sobre una etapa para ver qué cuenta.
      </p>

      <div className="mt-6 border-t border-white/[0.06] pt-5">
        <SubHead title="Después de la 1.ª lectura" sub={`${label(platform)} · misma cohorte`} />
        <div className="mt-4 max-w-[760px]"><StatusBars max={1} labelWidth={210} wrapLabels stackMobile rows={afterReadRows(platform, c, outcomesSince != null)} /></div>
        <p className="m-0 mt-3 font-mono text-[10.5px] leading-relaxed text-[#5C5C5C]">
          Base de cada fila: lecturas y muro, sobre los que leyeron · cuenta tras el muro, sobre los que chocaron · inicio de sesión y cuenta, sobre los que llegaron · Pro (con acceso hoy: pago, prueba o regalo), sobre los que leyeron y tienen cuenta.
          {partialOutcomes && ` El muro se registra desde ${fmtDateTime(outcomesSince)}: lo anterior en el periodo no aparece.`}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Chip label="Cuentas nuevas" value={fmtInt(c.accountNew)} sub={`${fmtInt(existing)} ya existían`} />
          <Chip label="Mediana a 1.ª lectura" value={fmtMinutes(c.medianMinutesToFirstRead)} sub={`n=${fmtInt(c.read1)}`} />
          <Chip label="Mediana a cuenta" value={fmtMinutes(c.medianMinutesToAccount)} sub={`n=${fmtInt(c.account)}`} />
          <Chip label="Llegada más antigua" value={c.arrived ? `hace ${fmtInt(c.oldestDays)} d` : '—'} sub="edad máxima de la cohorte" />
        </div>
      </div>

      <div className="mt-6 border-t border-white/[0.06] pt-5">
        <SubHead title="Retención de la cohorte" sub={g.coverage.activitySince ? `actividad diaria desde ${fmtDate(g.coverage.activitySince)}` : 'sin actividad registrada aún'} />
        <div className="mt-4"><RetentionTable r={c.retention} /></div>
        <p className="m-0 mt-3 font-mono text-[10.5px] leading-relaxed text-[#5C5C5C]">
          D1 = el día exacto siguiente; elegible cuando ese día ya terminó (UTC). Volver a abrir = abrió Bobby ese día; volver a leer = además pidió una lectura.
        </p>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- history (never mixed with the funnel)

function HistoryCard({ history }: { history: Growth['history'] }) {
  const rows: Array<[string, GrowthHistory]> = [['Web', history.web], ['iOS', history.ios], ...(history.android ? [['Android', history.android] as [string, GrowthHistory]] : [])];
  const any = rows.some(([, h]) => h.installs > 0);
  return (
    <Card>
      <CardHead
        title="Histórico reconstruido (antes de la medición)"
        sub="Instalaciones rehechas a partir de sus lecturas: nunca se vio su llegada, así que no forman parte del embudo ni de la retención."
      />
      {!any ? <Empty>Sin instalaciones reconstruidas</Empty> : (
        <TableScroll minWidth={620}>
          <thead>
            <tr>
              <th className={th}>Plataforma</th><th className={`${th} text-right`}>Instalaciones</th><th className={`${th} text-right`}>Con lectura</th>
              <th className={`${th} text-right`}>Lecturas</th><th className={`${th} text-right`}>2+ lecturas</th><th className={`${th} text-right`}>Con cuenta</th><th className={th}>Rango</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([k, h]) => (
              <tr key={k} className={tr}>
                <td className={td}>{k}</td>
                <td className={`${td} text-right font-mono text-[12.5px]`}>{fmtInt(h.installs)}</td>
                <td className={`${td} text-right font-mono text-[12.5px]`}>{fmtInt(h.readers)}</td>
                <td className={`${td} text-right font-mono text-[12.5px] text-[#8B8B8B]`}>{fmtInt(h.reads)}</td>
                <td className={`${td} text-right font-mono text-[12.5px]`}>{fmtInt(h.read2)} <span className="text-[#5C5C5C]">{share(h.read2, h.readers)}</span></td>
                <td className={`${td} text-right font-mono text-[12.5px]`}>{fmtInt(h.linked)}</td>
                <td className={`${td} font-mono text-[11.5px] text-[#8B8B8B]`}>{h.since ? `${fmtDate(h.since)} – ${fmtDate(h.until)}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </TableScroll>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- desk outcomes (server side)

function OutcomesCard({ out, includeInternal, periodSince, markFailed }: { out: Growth['outcomes']; includeInternal: boolean; periodSince: string; markFailed: boolean }) {
  const since = out.outcomesSince;
  const platforms = Object.entries(out.byPlatform).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const partial = since != null && (timeOf(since) ?? 0) > (timeOf(periodSince) ?? 0);
  const attempts = out.delivered + out.failed;
  const blocked = Object.entries(out.blocked).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const levels = Object.entries(out.byLevel).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  // Abandoned reads (the reader left first) are neither failures nor part of their base.
  const rows: StatusRow[] = [
    { label: 'Emitidas por servidor', value: out.delivered, fill: 'orange' },
    { label: 'Fallidas', value: out.failed, sub: attempts ? `${share(out.failed, attempts)} de ${fmtInt(attempts)} intentos` : undefined },
    { label: 'Interrumpidas', value: out.abandoned ?? 0, sub: 'la conexión se cerró antes del final registrado', missing: out.abandoned == null ? 'Dato no disponible' : undefined },
    { label: 'Muro de registro', value: out.wallSignin, sub: `${fmtInt(out.wallSigninInstalls)} ${out.wallSigninInstalls === 1 ? 'instalación' : 'instalaciones'}` },
    { label: 'Muro de pago', value: out.wallPaywall },
    { label: 'Nivel rechazado', value: out.wallLevel, sub: 'pidió un nivel premium sin acceso' },
    ...blocked.map(([k, v]) => ({ label: `Bloqueada · ${BLOCK_LABEL[k] ?? k}`, value: v })),
  ];

  return (
    <Card>
      <BigNumber
        label="Resultados del desk"
        value={fmtInt(out.consumed)}
        caption={`lecturas consumidas del cupo · ${includeInternal ? `incluye ${fmtInt(out.consumedInternal)} del equipo` : teamOut(markFailed, `${fmtInt(out.consumedInternal)} del equipo, fuera`)}`}
        right={platforms.length ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] uppercase text-[#5C5C5C]">
            {platforms.map(([k, v]) => <span key={k}>{label(k)} <span className="text-[#8B8B8B]">{fmtInt(v)}</span></span>)}
          </div>
        ) : undefined}
      />
      {!since ? (
        <Note tag="Sin datos aún">
          Sin cobertura observada de respuestas, fallos, muros o bloqueos en este periodo. La ausencia de registros no demuestra cero actividad.
        </Note>
      ) : (
        <>
          <p className="m-0 mb-4 font-mono text-[11px] text-[#5C5C5C]">
            Registrado desde {fmtDateTime(since)}{partial ? ' · el periodo empezó antes: estos conteos cubren solo una parte y no se comparan con las consumidas' : ''}
          </p>
          <StatusBars rows={rows} labelWidth={190} wrapLabels stackMobile />
          {levels.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 font-mono text-[11px] text-[#8B8B8B]">
              <span className="text-[#5C5C5C]">Emitidas por servidor, por nivel:</span>
              {levels.map(([k, v]) => <Tag key={k} tone={k === 'rapido' ? 'neutral' : 'orange'}>{LEVEL_LABEL[k] ?? k} {fmtInt(v)}</Tag>)}
            </div>
          )}
        </>
      )}
      <p className="m-0 mt-4 border-t border-white/[0.06] pt-3 font-mono text-[10.5px] leading-relaxed text-[#5C5C5C]">
        Consumidas = lecturas cobradas al cupo. Emitidas, fallidas y abandonadas = registros del servidor en web, iOS y Android. No se confirma que la respuesta se mostró en el cliente; una abandonada no es una falla.
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------- acquisition

function AcquisitionSection({ g, days, cmp, period, markFailed }: { g: Growth; days: string[]; cmp: CompareSeries | null; period: number; markFailed: boolean }) {
  const a = g.acquisition;
  // Align the per-day series with the overview's days (both end today); never pad with invented zeros.
  const n = Math.min(days.length, a.visitorDays.length);
  const barDays = days.slice(days.length - n);
  const barValues = a.visitorDays.slice(a.visitorDays.length - n);
  // The comparison series must be this same figure in this same mode (team in or out); otherwise no delta.
  const tail = cmp?.visits.slice(-n) ?? [];
  const sameSeries = n > 0 && tail.length === n && tail.every((v, i) => v === barValues[i]);
  const delta = sameSeries ? windowDelta(cmp?.visits, period) : null;
  const chips = sameSeries ? growthWindows(cmp?.visits) : [];
  const team = g.includeInternal ? 'incluye al equipo' : teamOut(markFailed);

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHead title="De dónde llegan (misma cohorte)" count={`${fmtInt(g.cohorts.web.arrived)} web`} sub="Primer contacto de cada navegador que llegó en el periodo, y hasta dónde llegó." />
          {a.sources.length === 0 ? <Empty>Sin llegadas observadas</Empty> : (
            <TableScroll minWidth={380}>
              <thead><tr><th className={th}>Fuente</th><th className={`${th} text-right`}>Llegaron</th><th className={`${th} text-right`}>1.ª lectura</th><th className={`${th} text-right`}>Cuenta</th></tr></thead>
              <tbody>
                {a.sources.map((s) => (
                  <tr key={s.source} className={tr}>
                    <td className={td}><div className="max-w-[180px] truncate font-mono text-[12px]" title={s.source}>{sourceLabel(s.source)}</div></td>
                    <td className={`${td} text-right font-mono text-[12.5px]`}>{fmtInt(s.installs)}</td>
                    <td className={`${td} text-right font-mono text-[12.5px]`}>{fmtInt(s.read1)} <span className="text-[#5C5C5C]">{share(s.read1, s.installs)}</span></td>
                    <td className={`${td} text-right font-mono text-[12.5px]`}>{fmtInt(s.account)} <span className="text-[#5C5C5C]">{share(s.account, s.installs)}</span></td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>
          )}
        </Card>
        <Card>
          <CardHead title="Primera página" sub="Dónde entró cada navegador de la cohorte web." />
          {a.landing.length === 0 ? <Empty>Sin llegadas observadas</Empty> : (
            <TableScroll minWidth={300}>
              <thead><tr><th className={th}>Página</th><th className={`${th} text-right`}>Llegaron</th><th className={`${th} text-right`}>1.ª lectura</th></tr></thead>
              <tbody>
                {a.landing.map((l) => (
                  <tr key={l.surface} className={tr}>
                    <td className={`${td} font-mono text-[12px] uppercase`}>{l.surface === 'unknown' ? 'sin dato' : l.surface}</td>
                    <td className={`${td} text-right font-mono text-[12.5px]`}>{fmtInt(l.installs)}</td>
                    <td className={`${td} text-right font-mono text-[12.5px]`}>{fmtInt(l.read1)} <span className="text-[#5C5C5C]">{share(l.read1, l.installs)}</span></td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>
          )}
        </Card>
      </div>

      <HeroCard
        title="Navegadores por día (web)"
        value={fmtCompact(a.visitors)}
        delta={delta}
        chips={chips}
        note={`Navegadores únicos por día, web, ${team}. Arriba: únicos en todo el periodo (${fmtInt(a.visits)} visitas). Con UTM: ${share(a.visitsWithUtm, a.visits)} de las visitas · con referente: ${share(a.visitsWithReferrer, a.visits)}.`}
      >
        <BarsChart days={barDays} values={barValues} height={180} emptyLabel="Todavía no hay visitas registradas" />
      </HeroCard>
    </>
  );
}

// ---------------------------------------------------------------- the tab

function CoverageNote({ g, o, markFailed }: { g: Growth; o: OverviewResponse['overview']; markFailed: boolean }) {
  const cv = g.coverage;
  const parts = [
    `Llegadas observadas desde ${cv.webObservedSince ? fmtDate(cv.webObservedSince) : 'sin datos'} (web)`,
    `iOS desde ${cv.iosObservedSince ? fmtDate(cv.iosObservedSince) : 'sin datos'}`,
    `Android desde ${cv.androidObservedSince ? fmtDate(cv.androidObservedSince) : 'sin datos'}`,
    `resultados del desk ${cv.outcomesSince ? `desde ${fmtDate(cv.outcomesSince)}` : 'aún sin registros'}`,
    `${fmtInt(cv.backfillInstalls)} instalaciones reconstruidas aparte`,
    g.includeInternal
      ? `incluye al equipo (${fmtInt(cv.internalAccounts)} cuentas, ${fmtInt(cv.internalInstalls)} instalaciones)`
      : teamOut(markFailed, `sin el equipo: −${fmtInt(g.people.excluded.accounts)} cuentas, −${fmtInt(g.people.excluded.guests)} instalaciones sin cuenta, −${isMissing(o.missing, 'activity.readsInternal') ? DASH : fmtInt(o.activity.readsInternal)} lecturas`),
  ];
  return <Note tag="Cobertura">{parts.join(' · ')}</Note>;
}

export default function FunnelTab({ data, period, cmp, refreshKey, notify, internal, markFailed: overviewMarkFailed = false }: {
  data: OverviewResponse; period: number; cmp: CompareSeries | null; refreshKey: number; notify: Notify; internal: boolean;
  /** The overview's load could not mark this browser as the team's; the lifecycle view's own flag counts too. */
  markFailed?: boolean;
}) {
  const { overview: o, growth: g } = data;
  const mode = internal ? 'in' : 'out';
  const lc = useLoad((signal) => fetchAdminLifecycle(period, internal, signal), `${period}|${mode}|${refreshKey}`, { intervalMs: CORE_REFRESH_MS });
  const costs = useLoad(fetchAdminCosts, `costs|${refreshKey}`);
  const reloadLc = lc.reload, reloadCosts = costs.reload;
  const onEconomicsChanged = useCallback(() => { void reloadLc(true); void reloadCosts(true); }, [reloadLc, reloadCosts]);
  // Economics from another period or mode is never shown under this one's label.
  const d = lc.data && lc.dataKey?.startsWith(`${period}|${mode}|`) ? lc.data : null;
  const sc = data.searchConsole;
  const store = data.providersLoaded ? data.integrations.appStore : null;
  const markFailed = !internal && (overviewMarkFailed || !!d?.internalMarkFailed);

  return (
    <div className="flex flex-col gap-4">
      <SourceFreshness meta={sourceMetaForError(d?.meta, lc.error?.message)} maxAgeMs={CORE_STALE_MS} label="Economía · actualización cada 30 s" fallbackAt={lc.updatedAt} />
      {g ? <CoverageNote g={g} o={o} markFailed={markFailed} /> : (
        <Note tag="Incompleto">Dato no disponible: el servidor no envió el crecimiento (personas, cohortes, resultados, adquisición).</Note>
      )}
      {d && <MissingNote missing={d.missing} />}
      {d && lc.error && <StaleBanner error={lc.error} onRetry={() => void lc.reload()} />}

      {g && (
        <>
          <FunnelCard g={g} period={period} sc={sc} store={store} />
          <HistoryCard history={g.history} />
          <OutcomesCard out={g.outcomes} includeInternal={g.includeInternal} periodSince={g.since} markFailed={markFailed} />
          <AcquisitionSection g={g} days={o.days} cmp={cmp} period={period} markFailed={markFailed} />
        </>
      )}
      <UtmBuilder />
      {sc && <SearchConsoleCard sc={sc} period={period} teamOut={!internal} />}

      {d ? (
        <EconomicsSection
          e={d.economics} costs={costs.data} costsError={costs.error} onCostsRetry={() => void costs.reload()}
          period={period} notify={notify} onChanged={onEconomicsChanged} ledgerSurfaces={o.coverage?.ledgerSurfaces ?? null}
        />
      ) : lc.error ? <ErrorState message={lc.error.message} onRetry={() => void lc.reload()} /> : <Loading label="Cargando economía unitaria" />}
    </div>
  );
}
