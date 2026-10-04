import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { fetchAdminActions, type OverviewResponse, type RevenueCatMetric } from '@/lib/admin-client';
import { Card, CardHead, Empty, ErrorState, Loading, MissingNote, Note, StaleBanner, TableScroll, Tag, td, th, tr } from './ui';
import { integrationChecks, integrationIssues, rcMetricValue, rcMetricWindow, type IntegrationCheck, type IntegrationId, type IntegrationStatus } from './health';
import { fmtDateTime, fmtInt, fmtRelative } from './format';
import { useLoad } from './useLoad';
import { CORE_REFRESH_MS, CORE_STALE_MS, sourceMetaForError } from './live';
import SourceFreshness from './SourceFreshness';

const VERCEL_ANALYTICS = 'https://vercel.com/anthonysurfermxs-projects/bobby-agent-trader/analytics';
const VERCEL_ENV_HINT = 'Todas van en Vercel → Settings → Environment Variables (Production). Después vuelve a desplegar: el servidor solo las lee al arrancar.';
const GENERIC_HELP = 'Agrégala en Vercel (Production).';

/** Where each missing env value comes from. Names not listed get the generic Vercel hint. */
const ENV_HELP: Array<[RegExp, string]> = [
  [/^REVENUECAT_V2_SECRET_KEY$/, 'RevenueCat → Project settings → API keys → nueva secret key v2 con lectura de métricas.'],
  [/^REVENUECAT_PROJECT_ID$/, 'RevenueCat → Project settings → General: el Project ID.'],
  [/^REVENUECAT_SECRET_KEY$/, 'RevenueCat → Project settings → API keys: la secret key con la que el servidor consulta compras.'],
  [/^GSC_SERVICE_ACCOUNT_JSON$/, 'Google Cloud: cuenta de servicio (JSON completo) agregada como usuario de la propiedad en Search Console.'],
  [/^ANTHROPIC_API_KEY$/, 'console.anthropic.com → API keys.'],
  [/^OPENAI_API_KEY$/, 'platform.openai.com → API keys.'],
  [/^REVENUECAT_WEBHOOK/, 'RevenueCat → Integrations → Webhooks: el mismo valor que pones en el header Authorization del webhook.'],
  [/^ASC_KEY_ID$/, 'App Store Connect → Users and Access → Integrations → App Store Connect API: el Key ID de la llave.'],
  [/^ASC_ISSUER_ID$/, 'Misma pantalla de App Store Connect API: el Issuer ID arriba de la lista de llaves.'],
  [/^ASC_PRIVATE_KEY/, 'El contenido del archivo .p8 de esa llave (Apple solo deja descargarlo una vez).'],
  [/^ASC_VENDOR/, 'App Store Connect → Payments and Financial Reports: el número de vendor arriba a la izquierda.'],
  [/^ASC_APP_ID$/, 'App Store Connect → tu app → App Information: el Apple ID numérico.'],
  [/^STRIPE_/, 'Stripe Dashboard → Developers → API keys / Webhooks.'],
];
const helpFor = (name: string) => ENV_HELP.find(([re]) => re.test(name))?.[1] ?? null;

const ACTION_LABEL: Record<string, string> = {
  'create-coupon': 'Creó un cupón',
  'set-coupon-active': 'Cambió un cupón',
  grant: 'Regaló',
  'delete-user': 'Borró una cuenta',
  'set-admin': 'Cambió un admin',
  'credit-mark': 'Registró crédito',
  'probe-llm': 'Probó un proveedor',
  'add-cost': 'Registró un costo',
  'delete-cost': 'Borró un costo',
  'set-assumptions': 'Cambió supuestos',
  'set-internal': 'Marcó una cuenta del equipo',
  'set-device-internal': 'Marcó una instalación del equipo',
  'remove-internal-network': 'Quitó una red del equipo',
  'set-internal-emails': 'Cambió los emails del equipo',
};

const STATUS_TONE: Record<IntegrationStatus, 'green' | 'orange' | 'red' | 'neutral'> = { ok: 'green', warn: 'orange', error: 'red', off: 'neutral' };
const SQUARE: Record<IntegrationId, string> = {
  tracking: '#F28C38', reads: '#F28C38', rcWebhook: '#F25A5A', stripe: '#8B7CF6', rcMetrics: '#F25A5A', appStore: '#4FB3FF',
  searchConsole: '#4ADE80', 'llm-anthropic': '#8B8B8B', 'llm-openai': '#8B8B8B', paywall: '#F28C38', vercel: '#EDEDED',
};
const HREF: Partial<Record<IntegrationId, string>> = { vercel: VERCEL_ANALYTICS };

function IntegrationRow({ check, children }: { check: IntegrationCheck; children?: ReactNode }) {
  const href = HREF[check.id];
  return (
    <li className="flex gap-3 border-b border-white/[0.05] py-3.5 last:border-b-0">
      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: SQUARE[check.id] }} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="text-[13.5px] text-[#EDEDED]">
            {href ? <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">{check.name}<ArrowUpRight className="h-3 w-3 text-[#5C5C5C]" aria-hidden /></a> : check.name}
          </span>
          <Tag tone={STATUS_TONE[check.status]}>{check.tag}</Tag>
        </div>
        <div className="mt-1 break-words font-mono text-[11.5px] leading-snug text-[#8B8B8B]">{check.detail}</div>
        {children}
      </div>
    </li>
  );
}

/** RevenueCat's key values, each with its own window and description (they do not follow the period selector). */
function RcMetrics({ metrics, fetchedAt }: { metrics: RevenueCatMetric[]; fetchedAt?: string }) {
  if (!metrics.length) return null;
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <ul className="m-0 grid list-none grid-cols-1 gap-1.5 p-0 sm:grid-cols-2">
        {metrics.map((m) => (
          <li key={m.id} className="min-w-0 rounded-lg border border-white/[0.05] bg-[#0F0F10] px-2.5 py-2" title={m.description}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[12px] text-[#BDBDBD]">{m.name}</span>
              <span className="shrink-0 font-mono text-[13px] tabular-nums text-[#EDEDED]">{rcMetricValue(m)}</span>
            </div>
            <div className="mt-0.5 font-mono text-[10.5px] leading-snug text-[#5C5C5C]">
              {[rcMetricWindow(m.period), m.description].filter(Boolean).join(' · ') || 'sin descripción'}
            </div>
          </li>
        ))}
      </ul>
      {fetchedAt && <span className="font-mono text-[10.5px] text-[#5C5C5C]" title={fmtDateTime(fetchedAt)}>consultado {fmtRelative(fetchedAt)}</span>}
    </div>
  );
}

function detailText(detail: unknown): string {
  if (detail == null) return '';
  if (typeof detail === 'string') return detail;
  try {
    return Object.entries(detail as Record<string, unknown>)
      .filter(([k, v]) => k !== 'status' && v != null && v !== '')
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join(' · ');
  } catch { return ''; }
}

const ACTION_STATUS: Record<string, { label: string; tone: 'green' | 'red' | 'orange' }> = {
  ok: { label: 'OK', tone: 'green' }, failed: { label: 'Falló', tone: 'red' }, started: { label: 'En curso', tone: 'orange' },
};

export default function IntegrationsTab({ data, period, refreshKey }: { data: OverviewResponse; period: number; refreshKey: number }) {
  const { overview: o, integrations: i } = data;
  const actions = useLoad(fetchAdminActions, `actions|${refreshKey}`, { intervalMs: CORE_REFRESH_MS });
  const sc = data.searchConsole;
  // Rows, header and "Qué falla" all come from health.ts, so they can never disagree.
  const checks = integrationChecks(i, sc, o);
  const issues = integrationIssues(i, sc, o);
  const nonEnv = issues.filter((p) => !p.id.startsWith('env-'));
  const errors = issues.filter((p) => p.level === 'error').length;
  const store = i.appStore;

  if (!data.providersLoaded) return <Note tag="Pendiente de consulta">Las fuentes externas y el estado de integraciones todavía no tienen una respuesta confirmada. Los datos Bobby se consultan cada 30 segundos; Apple, Google y RevenueCat, cada 5 minutos.</Note>;

  return (
    <div className="flex flex-col gap-4">
      <MissingNote missing={o.missing} sections={['integrations', 'coverage']} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHead
            title="Integraciones"
            count={issues.length ? `${issues.length} pendientes${errors && errors < issues.length ? ` · ${errors} fallan` : ''}` : 'estado de fuentes'}
            sub={`Estado según la última entrega de cada fuente, no solo su configuración · periodo ${period}d donde aplica`}
          />
          <ul className="m-0 list-none p-0">
            {checks.map((c) => (
              <IntegrationRow key={c.id} check={c}>
                {c.id === 'rcMetrics' && i.revenuecat.configured && !i.revenuecat.error && i.revenuecat.metrics && (
                  <RcMetrics metrics={i.revenuecat.metrics} fetchedAt={i.revenuecat.fetchedAt} />
                )}
                {c.id === 'appStore' && store.configured && !store.error && (
                  <div className="mt-1 font-mono text-[10.5px] leading-snug text-[#5C5C5C]">
                    Apple publica cada día con 1–2 días de retraso: los días pendientes no son ceros.
                    {store.partial && ' Carga parcial: se acabó el tiempo antes de los días más viejos; lo cargado queda guardado y la siguiente carga sigue con lo que falta.'}
                  </div>
                )}
              </IntegrationRow>
            ))}
          </ul>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHead title="Qué falla" count={issues.length ? `${issues.length}` : undefined} />
            {issues.length === 0 ? (
              <p className="m-0 font-mono text-[12px] text-[#8B8B8B]">Sin fallos detectados con la evidencia disponible. Revisa cada fuente: configuración y recepción son pruebas distintas.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0 font-mono text-[12px]">
                {nonEnv.map((p) => (
                  <li key={`${p.id}-${p.text}`} className={`break-words ${p.level === 'error' ? 'text-[#F3B0B0]' : 'text-[#F7A04B]'}`}>
                    · {p.text}{p.level === 'warn' && <span className="text-[#5C5C5C]"> (aviso)</span>}
                  </li>
                ))}
                {nonEnv.length === 0 && <li className="text-[#8B8B8B]">Solo faltan variables (abajo).</li>}
                {nonEnv.length > 0 && i.missing.length > 0 && <li className="text-[#8B8B8B]">· y {fmtInt(i.missing.length)} variables sin configurar (abajo).</li>}
              </ul>
            )}
          </Card>
          <Card>
            <CardHead title="Variables que faltan" count={i.missing.length ? `${i.missing.length}` : undefined} />
            {i.missing.length === 0 ? (
              <p className="m-0 flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.06em] text-[#4ADE80]">Todas configuradas</p>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {i.missing.map((name) => (
                  <li key={name} className="min-w-0 border-b border-white/[0.05] py-3 first:pt-0">
                    <code className="break-all font-mono text-[12px] text-[#F7A04B]">{name}</code>
                    <p className="m-0 mt-1 text-[12.5px] leading-snug text-[#8B8B8B]">{helpFor(name) ?? GENERIC_HELP}</p>
                  </li>
                ))}
                <li className="pt-3"><Note tag="Vercel">{VERCEL_ENV_HINT}</Note></li>
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card>
        <CardHead title="Cobertura pendiente" sub="Estas fuentes no se pueden inferir de una integración configurada o de una respuesta correcta del servidor" />
        <ul className="m-0 list-none space-y-2 p-0 text-[12px] leading-relaxed text-[#8B8B8B]">
          <li><span className="text-[#EDEDED]">Google Play:</span> los webhooks recibidos se guardan, pero las membresías Pro y su clasificación comercial siguen sin reconciliarse para esta tienda. Las descargas de Play Console no están conectadas.</li>
          <li><span className="text-[#EDEDED]">Clientes:</span> no hay una fuente de crashes nativos. Android aún no envía confirmaciones de recepción o presentación.</li>
          <li><span className="text-[#EDEDED]">Finanzas:</span> los eventos de compra y el uso de IA registrados no sustituyen una conciliación con facturas, saldos y comisiones del proveedor.</li>
        </ul>
      </Card>

      {actions.data && actions.error && <StaleBanner error={actions.error} onRetry={() => void actions.reload()} />}
      <SourceFreshness meta={sourceMetaForError(actions.data?.meta, actions.error?.message)} maxAgeMs={CORE_STALE_MS} label="Historial del admin · cada 30 s" fallbackAt={actions.updatedAt} />
      <Card>
        <CardHead
          title="Actividad del admin"
          count={actions.data ? `${fmtInt(actions.data.actions.length)} recientes${actions.data.total != null ? ` · ${fmtInt(actions.data.total)} en total` : ''}` : undefined}
          sub="Cada acción se registra antes de ejecutarse y se completa con su resultado"
        />
        {actions.error && !actions.data ? <ErrorState message={actions.error.message} onRetry={() => void actions.reload()} />
          : !actions.data ? <Loading label="Cargando actividad" />
          : actions.data.actions.length === 0 ? <Empty>Sin acciones todavía</Empty>
          : (
            <TableScroll minWidth={800}>
              <thead><tr><th className={th}>Cuándo</th><th className={th}>Admin</th><th className={th}>Acción</th><th className={th}>Resultado</th><th className={th}>Sobre</th><th className={th}>Detalle</th></tr></thead>
              <tbody>
                {actions.data.actions.map((a) => {
                  const st = a.status ? ACTION_STATUS[a.status] : null;
                  return (
                    <tr key={a.id} className={tr}>
                      <td className={`${td} font-mono text-[12px] text-[#8B8B8B]`} title={fmtDateTime(a.created_at)}>{fmtRelative(a.created_at)}</td>
                      <td className={td}><div className="max-w-[200px] truncate text-[12.5px]">{a.admin_email ?? '—'}</div></td>
                      <td className={`${td} text-[12.5px]`}>{ACTION_LABEL[a.action] ?? a.action}</td>
                      <td className={td}>{st ? <Tag tone={st.tone}>{st.label}</Tag> : <span className="font-mono text-[#5C5C5C]">—</span>}</td>
                      <td className={`${td} font-mono text-[11.5px] text-[#8B8B8B]`}><div className="max-w-[220px] truncate" title={a.target ?? undefined}>{a.target ?? '—'}</div></td>
                      <td className={`${td} font-mono text-[11px] text-[#5C5C5C]`}><div className="max-w-[360px] truncate" title={detailText(a.detail)}>{detailText(a.detail) || '—'}</div></td>
                    </tr>
                  );
                })}
              </tbody>
            </TableScroll>
          )}
      </Card>
    </div>
  );
}
