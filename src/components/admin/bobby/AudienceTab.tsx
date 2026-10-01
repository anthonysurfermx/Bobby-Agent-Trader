import { fetchAdminAudience, type AudienceResponse, type ProviderCountries } from '@/lib/admin-client';
import { Card, CardHead, Empty, ErrorState, KpiStrip, Loading, Note, StaleBanner, TableScroll, td, th, tr } from './ui';
import { BigNumber, StatusBars } from './charts';
import { DASH, fmtDate, fmtInt, fmtPct, fmtUsd } from './format';
import { useLoad } from './useLoad';

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

/** A provider's per-country list, or why it is not there. */
function ProviderCard<K extends string>({ title, sub, data, valueKey, caption, notConnected }: {
  title: string; sub: string; data: ProviderCountries<K>; valueKey: K; caption: string; notConnected: string;
}) {
  const rows = data.countries ?? [];
  const total = rows.reduce((a, r) => a + r[valueKey], 0);
  return (
    <Card>
      <BigNumber label={title} value={data.configured && !data.error && data.countries ? fmtInt(total) : DASH} caption={caption} />
      {!data.configured ? <Empty>{notConnected}</Empty>
        : data.error ? <Note tone="red" tag="Con error">{data.error}</Note>
        : !rows.length ? <Empty>Sin datos en el periodo</Empty>
        : <StatusBars uppercase={false} labelWidth={150} rows={rows.slice(0, 10).map((r, i) => ({ label: place(r.country), value: r[valueKey], fill: i ? 'blue' : 'orange', sub: total ? fmtPct(r[valueKey], total) : undefined }))} />}
      <p className="m-0 mt-4 font-mono text-[10.5px] leading-relaxed text-[#5C5C5C]">{sub}</p>
    </Card>
  );
}

function Content({ d, period }: { d: AudienceResponse; period: number }) {
  const g = d.geo;
  const top = g.countries[0];
  const located = g.countries.reduce((a, c) => a + c.visitors, 0);
  const purchaseTotal = g.purchases.reduce((a, p) => a + p.newPaying, 0);
  return (
    <>
      <KpiStrip
        items={[
          { label: 'Visitantes web con ubicación', value: fmtInt(g.web.located), caption: `de ${fmtInt(g.web.devices)} nuevos · ${period}d` },
          { label: 'País principal', value: top ? place(top.country) : DASH, caption: top ? `${fmtPct(top.visitors, located)} de los ubicados` : 'sin visitantes ubicados' },
          { label: 'Países', value: fmtInt(g.countries.length), caption: `${fmtInt(g.regions.length)} estados o regiones` },
        ]}
      />

      <Card padded={false}>
        <div className="px-5 pt-5"><CardHead title="Por país · web" count={fmtInt(g.countries.length)} sub="Navegadores nuevos del periodo y qué tan lejos llegaron en el embudo" /></div>
        <div className="px-5 pb-4">
          {!g.countries.length ? <Empty>{g.locatedSince ? 'Sin visitantes ubicados en el periodo' : 'La ubicación empieza a registrarse con las próximas visitas'}</Empty> : (
            <TableScroll minWidth={560}>
              <thead><tr>{['País', 'Visitantes', 'Leyeron', 'Cuentas', 'Pro', '% que lee'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {g.countries.map((c) => (
                  <tr key={c.country} className={tr}>
                    <td className={td}>{place(c.country)}</td>
                    <td className={`${td} font-mono tabular-nums`}>{fmtInt(c.visitors)}</td>
                    <td className={`${td} font-mono tabular-nums`}>{fmtInt(c.readers)}</td>
                    <td className={`${td} font-mono tabular-nums`}>{fmtInt(c.accounts)}</td>
                    <td className={`${td} font-mono tabular-nums`}>{fmtInt(c.pro)}</td>
                    <td className={`${td} font-mono tabular-nums text-[#8B8B8B]`}>{fmtPct(c.readers, c.visitors)}</td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <BigNumber label="Por estado o región · web" value={fmtInt(g.regions.reduce((a, r) => a + r.visitors, 0))} caption="visitantes ubicados" />
          {g.regions.length
            ? <StatusBars uppercase={false} labelWidth={170} stackMobile rows={g.regions.slice(0, 12).map((r, i) => ({ label: `${flag(r.country)} ${regionName(r.country, r.region)}`, value: r.visitors, fill: i ? 'blue' : 'orange', sub: `${fmtInt(r.readers)} leyeron` }))} />
            : <Empty>Sin regiones todavía</Empty>}
        </Card>
        <Card>
          <BigNumber label="Compras por país de la tienda" value={fmtInt(purchaseTotal)} caption={`nuevos de pago · ${period}d`} />
          {g.purchases.length
            ? <StatusBars uppercase={false} labelWidth={150} rows={g.purchases.map((p, i) => ({ label: place(p.country), value: p.newPaying, fill: i ? 'blue' : 'orange', sub: fmtUsd(p.grossUsd) }))} />
            : <Empty>Sin compras en el periodo</Empty>}
          <p className="m-0 mt-4 font-mono text-[10.5px] leading-relaxed text-[#5C5C5C]">País que reportan RevenueCat (App Store) y Stripe; bruto en USD.</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ProviderCard title="Google · clics por país" data={d.searchConsole} valueKey="clicks" caption={`clics · ${period}d`}
          notConnected="Conecta Search Console" sub="Search Console: búsqueda de Google, agregado (no es la misma gente que la tabla de arriba)." />
        <ProviderCard title="App Store · descargas por país" data={d.appStore} valueKey="downloads" caption={`descargas nuevas · ${period}d`}
          notConnected="Conecta App Store Connect" sub="Reportes de ventas de Apple por tienda; la app no reporta ubicación." />
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

export default function AudienceTab({ period, refreshKey }: { period: number; refreshKey: number }) {
  const a = useLoad(() => fetchAdminAudience(period), `${period}|aud|${refreshKey}`);
  // Data from another period is never shown under this period's label.
  const d = a.data && a.dataKey?.split('|')[0] === String(period) ? a.data : null;
  return (
    <div className="flex flex-col gap-4">
      <Note tag="Ubicación">
        País y estado aproximados por la IP de cada visita web, sin guardar la IP.
        {d?.geo.locatedSince ? ` Registrada desde ${fmtDate(d.geo.locatedSince)}: los visitantes anteriores aparecen sin ubicación.` : ' Empieza con las próximas visitas.'}
        {' '}iOS no reporta ubicación; ahí cuentan las descargas por país de App Store.
      </Note>
      {d && a.error && <StaleBanner error={a.error} onRetry={() => void a.reload()} />}
      {a.error && !d ? <ErrorState message={a.error.message} onRetry={() => void a.reload()} />
        : !d ? <Loading label="Cargando la audiencia" />
        : <div className={`flex flex-col gap-4 ${a.loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}`}><Content d={d} period={period} /></div>}
    </div>
  );
}
