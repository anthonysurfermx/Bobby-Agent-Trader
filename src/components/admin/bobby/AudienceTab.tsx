import type { ReactNode } from 'react';
import { fetchAdminAudience, isMissing, type AudienceResponse, type OverviewResponse, type ProviderCountries } from '@/lib/admin-client';
import { Card, CardHead, Empty, ErrorState, KpiStrip, Loading, Note, StaleBanner, TableScroll, td, th, tr } from './ui';
import { BigNumber, StatusBars } from './charts';
import { MIN_BASE } from './deltas';
import { DASH, fmtDate, fmtDateTime, fmtDays, fmtInt, fmtPct, fmtUsd, geoText, shareText } from './format';
import { useLoad } from './useLoad';
import { composeAudience, CORE_REFRESH_MS, CORE_STALE_MS, sourceMetaForError } from './live';
import SourceFreshness from './SourceFreshness';

// First-level regions are ISO 3166-2 codes; Mexico's are named here (config, not data), others show their code.
const MX_STATES: Record<string, string> = {
  AGU: 'Aguascalientes', BCN: 'Baja California', BCS: 'Baja California Sur', CAM: 'Campeche', CHP: 'Chiapas', CHH: 'Chihuahua',
  CMX: 'Ciudad de México', COA: 'Coahuila', COL: 'Colima', DUR: 'Durango', GUA: 'Guanajuato', GRO: 'Guerrero', HID: 'Hidalgo',
  JAL: 'Jalisco', MEX: 'Estado de México', MIC: 'Michoacán', MOR: 'Morelos', NAY: 'Nayarit', NLE: 'Nuevo León', OAX: 'Oaxaca',
  PUE: 'Puebla', QUE: 'Querétaro', ROO: 'Quintana Roo', SLP: 'San Luis Potosí', SIN: 'Sinaloa', SON: 'Sonora', TAB: 'Tabasco',
  TAM: 'Tamaulipas', TLA: 'Tlaxcala', VER: 'Veracruz', YUC: 'Yucatán', ZAC: 'Zacatecas',
};

let regionNames: Intl.DisplayNames | null = null;
function countryName(code: string): string {
  if (code === '??') return 'Sin país';
  if (!/^[A-Z]{2}$/.test(code)) return code;
  try {
    regionNames ??= new Intl.DisplayNames(['es'], { type: 'region' });
    return regionNames.of(code) ?? code;
  } catch { return code; }
}
const flag = (code: string) => (/^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '');
const place = (code: string) => `${flag(code)} ${countryName(code)}`.trim();
const regionName = (country: string, region: string) => (country === 'MX' && MX_STATES[region] ? MX_STATES[region] : `${region} · ${countryName(country)}`);

/** Third-party aggregates cannot leave the team out: said on each one while the header says "Sin equipo". */
const SOURCE_TEAM = 'incluye al equipo (la fuente no lo separa)';
function ShareCell({ a, b }: { a: number; b: number }) {
  if (!b) return <>{DASH}</>;
  if (b < MIN_BASE) return <span title="Muestra pequeña: menos de 5">{fmtInt(a)}/{fmtInt(b)}</span>;
  return <>{fmtPct(a, b)}</>;
}

/** A provider's per-country list, or why it is not there (`absent`: the server did not send the block). */
function ProviderCard<K extends string>({ title, sub, data, valueKey, caption, notConnected, footer, absent }: {
  title: string; sub: string; data: ProviderCountries<K>; valueKey: K; caption: string; notConnected: string; footer?: ReactNode; absent?: boolean;
}) {
  const rows = data.countries ?? [];
  const total = rows.reduce((a, r) => a + r[valueKey], 0);
  return (
    <Card>
      <BigNumber label={title} value={!absent && data.configured && !data.error && data.countries ? fmtInt(total) : DASH} caption={caption} />
      {absent ? <Empty>Dato no disponible</Empty>
        : !data.configured ? <Empty>{notConnected}</Empty>
        : data.error ? <Note tone="red" tag="Con error">{data.error}</Note>
        : !rows.length ? <Empty>Sin datos en el periodo</Empty>
        : <StatusBars uppercase={false} labelWidth={150} rows={rows.slice(0, 10).map((r, i) => ({ label: place(r.country), value: r[valueKey], fill: i ? 'blue' : 'orange', sub: total >= MIN_BASE ? fmtPct(r[valueKey], total) : undefined }))} />}
      {footer}
      <p className="m-0 mt-4 font-mono text-[10.5px] leading-relaxed text-[#5C5C5C]">{sub}</p>
    </Card>
  );
}

function Content({ d, period, internal, data }: { d: AudienceResponse; period: number; internal: boolean; data?: OverviewResponse | null }) {
  const g = d.geo;
  // A value the server did not send is "—", never a zero.
  const miss = (path: string) => isMissing(d.missing, path);
  const show = (path: string, text: string) => (miss(path) ? DASH : text);
  const who = internal ? 'visitantes' : 'visitantes externos';
  const top = g.countries[0];
  const locatedVisitors = g.countries.reduce((a, c) => a + c.visitors, 0);
  const purchaseTotal = g.purchases.reduce((a, p) => a + p.newPaying, 0);
  const purchasesUnknown = miss('geo.purchases') || miss('geo.purchasesSince');
  const purchasesUnmeasured = !purchasesUnknown && g.purchasesSince == null;
  // Date and time: location started mid-day, so visitors from earlier that same day also have none.
  const since = g.locatedSince ? fmtDateTime(g.locatedSince) : null;
  const geo = geoText(g, miss, period, since);

  // App Store reconciliation: only with the overview of the same period and the same team mode.
  const store = data?.integrations.appStore;
  const range = store?.coveredFrom ? `reportes publicados del ${fmtDate(store.coveredFrom)} al ${fmtDate(store.coveredTo)}` : null;
  const pending = store?.pendingDays?.length ? `Apple aún no publica: ${store.pendingDays.map(fmtDate).join(', ')}` : null;
  // Apple's load ran out of time: the list covers the loaded days only.
  const partial = d.appStore.partial ? `parcial: faltan ${fmtInt(d.appStore.missingDays.length)} ${d.appStore.missingDays.length === 1 ? 'día' : 'días'} (${fmtDays(d.appStore.missingDays)})` : null;
  const growth = data?.growth && data.growth.days === period && data.growth.includeInternal === internal ? data.growth : null;
  const downloads = d.appStore.configured && !d.appStore.error && d.appStore.countries ? d.appStore.countries.reduce((a, c) => a + c.downloads, 0) : null;

  return (
    <>
      <KpiStrip
        items={[
          {
            label: 'Visitantes web ubicados', value: show('geo.web.located', fmtInt(g.web.located)),
            caption: geo.located,
          },
          {
            label: 'Sin ubicación', value: show('geo.web.beforeLocation', fmtInt(g.web.beforeLocation)),
            caption: geo.noLocation,
          },
          {
            label: 'País principal', value: top && locatedVisitors ? place(top.country) : DASH,
            caption: miss('geo.countries') ? 'dato no disponible' : top && locatedVisitors ? `${shareText(top.visitors, locatedVisitors)} de los ubicados` : `aún no hay ${who} ubicados`,
          },
        ]}
      />

      <Card padded={false}>
        <div className="px-5 pt-5"><CardHead title="Por país · web" count={geo.countriesCount} sub="Instalaciones web nuevas del periodo con ubicación y qué tan lejos llegaron" /></div>
        <div className="px-5 pb-4">
          {miss('geo.countries') ? <Empty>Dato no disponible</Empty> : !g.countries.length || !g.web.located ? (
            <Empty>{g.locatedSince ? `Aún no hay ${who} ubicados en el periodo` : 'La ubicación empieza a registrarse con las próximas visitas'}</Empty>
          ) : (
            <TableScroll minWidth={600}>
              <thead><tr>{['País', 'Visitantes', 'Leyeron en el periodo', 'Cuentas', 'Pro', '% que lee'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {g.countries.map((c) => (
                  <tr key={c.country} className={tr}>
                    <td className={td}>{place(c.country)}</td>
                    <td className={`${td} font-mono tabular-nums`}>{fmtInt(c.visitors)}</td>
                    <td className={`${td} font-mono tabular-nums`}>{fmtInt(c.readers)}</td>
                    <td className={`${td} font-mono tabular-nums`}>{fmtInt(c.accounts)}</td>
                    <td className={`${td} font-mono tabular-nums`}>{fmtInt(c.pro)}</td>
                    <td className={`${td} font-mono tabular-nums text-[#8B8B8B]`}><ShareCell a={c.readers} b={c.visitors} /></td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>
          )}
          {g.countries.length > 0 && g.web.located > 0 && locatedVisitors < MIN_BASE && (
            <p className="m-0 mt-3 font-mono text-[10.5px] text-[#5C5C5C]">Muestra pequeña (menos de {MIN_BASE}): se muestran conteos, no porcentajes.</p>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <BigNumber label="Por estado · con estado identificado" value={show('geo.located.withRegion', fmtInt(g.located.withRegion))} caption={`de ${show('geo.located.total', fmtInt(g.located.total))} ubicados`} />
          {miss('geo.regions') ? <Empty>Dato no disponible</Empty> : g.regions.length
            ? <StatusBars uppercase={false} labelWidth={170} stackMobile rows={g.regions.slice(0, 12).map((r, i) => ({ label: `${flag(r.country)} ${regionName(r.country, r.region)}`, value: r.visitors, fill: i ? 'blue' : 'orange', sub: `${fmtInt(r.readers)} leyeron` }))} />
            : <Empty>{g.located.total ? 'Ningún ubicado con estado identificado' : `Aún no hay ${who} ubicados`}</Empty>}
        </Card>
        <Card>
          {/* Never an observed zero without coverage: no purchase event ever received is "Sin medir". */}
          <BigNumber label="Compras por país de la tienda" value={purchasesUnknown || purchasesUnmeasured ? DASH : fmtInt(purchaseTotal)} caption={`nuevos pagadores verificados (primer cobro) · ${period}d`} />
          {purchasesUnknown ? <Empty>Dato no disponible</Empty>
            : purchasesUnmeasured ? <Empty>Sin medir: nunca ha llegado un evento de compra</Empty>
            : g.purchases.length
              ? <StatusBars uppercase={false} labelWidth={150} rows={g.purchases.map((p, i) => ({ label: place(p.country), value: p.newPaying, fill: i ? 'blue' : 'orange', sub: fmtUsd(p.grossUsd) }))} />
              : <Empty>Sin compras verificadas en el periodo</Empty>}
          <p className="m-0 mt-4 font-mono text-[10.5px] leading-relaxed text-[#5C5C5C]">
            Pagadores verificados (membresía de producción, sin periodo de prueba) con su primer cobro en el periodo, por país de la tienda (RevenueCat para App Store, Stripe para la web); bruto en USD de sus cobros del periodo. Los cobros de membresías sin verificar, sandbox y entorno desconocido no cuentan aquí.
            {g.purchasesSince ? ` Eventos de compra desde el ${fmtDate(g.purchasesSince)}.` : ''}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ProviderCard title="Google · clics por país" data={d.searchConsole} valueKey="clicks" caption={`clics · ${period}d${internal ? '' : ` · ${SOURCE_TEAM}`}`} absent={miss('searchConsole')}
          notConnected="Conecta Search Console" sub="Otra población: búsquedas en Google, agregadas. No es la misma gente que la tabla web de arriba." />
        <ProviderCard
          title="App Store · descargas por país" data={d.appStore} valueKey="downloads" caption={`descargas nuevas · ${period}d${partial ? ' · parcial' : ''}${internal ? '' : ` · ${SOURCE_TEAM}`}`} absent={miss('appStore')}
          notConnected="Conecta App Store Connect"
          sub={['Reportes de ventas de Apple por tienda; Apple los publica con 1–2 días de retraso y la app no reporta ubicación', partial, range, pending].filter(Boolean).join(' · ') + '.'}
          footer={downloads != null && growth ? (
            <p className="m-0 mt-4 border-t border-white/[0.06] pt-3 font-mono text-[11.5px] leading-snug text-[#BDBDBD]">
              App Store: {fmtInt(downloads)} descargas{partial ? ' (parcial)' : ''} · Bobby vio {fmtInt(growth.cohorts.ios.arrived)} instalaciones iOS
              <span className="text-[#5C5C5C]">{growth.coverage.iosObservedSince ? ` (observadas desde el ${fmtDate(growth.coverage.iosObservedSince)})` : ' (aún sin observar)'}</span>
              {!internal && <span className="block text-[#5C5C5C]">Apple cuenta también las descargas del equipo (no las separa); las instalaciones de Bobby ya las dejan fuera.</span>}
            </p>
          ) : undefined}
        />
      </div>

      <Card>
        <CardHead title="Edad y género" sub="Ningún proveedor conectado los da por persona" />
        <Empty>Sin fuente todavía</Empty>
        <p className="m-0 font-mono text-[10.5px] leading-relaxed text-[#5C5C5C]">
          Fuentes posibles: una pregunta opcional en el onboarding (por persona), Google Analytics con Google Signals (agregado, solo web,
          oculto con poco tráfico) o los desgloses de Meta / TikTok Ads (solo de quien llega por anuncios).
        </p>
      </Card>
    </>
  );
}

/** `data` (optional, the page's overview) adds the App Store covered range and the iOS install reconciliation. */
export default function AudienceTab({ period, refreshKey, internal = false, data, markFailed = false }: {
  period: number; refreshKey: number; internal?: boolean; data?: OverviewResponse | null;
  /** The overview's load could not mark this browser as the team's; this view's own flag counts too. */
  markFailed?: boolean;
}) {
  const mode = `${period}|${internal ? 'all' : 'ext'}`;
  const a = useLoad((signal) => fetchAdminAudience(period, internal, signal), `${mode}|aud|${refreshKey}`, { intervalMs: CORE_REFRESH_MS });
  // Data from another period or team mode is never shown under this one's label.
  const d = a.data && a.dataKey?.startsWith(`${mode}|`) ? composeAudience(a.data, data) : null;
  const unverified = !internal && (markFailed || !!d?.internalMarkFailed);
  return (
    <div className="flex flex-col gap-4">
      <SourceFreshness meta={sourceMetaForError(d?.meta, a.error?.message)} maxAgeMs={CORE_STALE_MS} label="Audiencia · actualización cada 30 s" fallbackAt={a.updatedAt} />
      <Note tag="Ubicación">
        País y estado aproximados por la IP de cada visita web, sin guardar la IP.
        {d?.geo.locatedSince ? ` Registrada desde el ${fmtDateTime(d.geo.locatedSince)}: quien llegó antes aparece sin ubicación.` : ' Empieza con las próximas visitas.'}
        {' '}iOS no reporta ubicación; ahí cuentan las descargas por país de App Store.
        {internal ? ' Incluye al equipo.' : unverified
          ? ' Sin el equipo · sin verificar: esta carga no pudo marcar tu navegador, así que puede incluir tu propio tráfico.'
          : ' Sin el equipo (admins, cuentas marcadas, sus instalaciones y sus redes), salvo App Store y Google, que no lo separan.'}
      </Note>
      {d && a.error && <StaleBanner error={a.error} onRetry={() => void a.reload()} />}
      {a.error && !d ? <ErrorState message={a.error.message} onRetry={() => void a.reload()} />
        : !d ? <Loading label="Cargando la audiencia" />
        : <div className={`flex flex-col gap-4 ${a.loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}`}><Content d={d} period={period} internal={internal} data={data} /></div>}
    </div>
  );
}
