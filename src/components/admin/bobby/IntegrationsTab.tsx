import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { fetchAdminActions, fetchAdminLifecycle, type OverviewResponse } from '@/lib/admin-client';
import { Card, CardHead, Empty, ErrorState, Loading, MissingNote, Note, StaleBanner, TableScroll, Tag, td, th, tr } from './ui';
import { integrationProblems } from './health';
import { fmtDateTime, fmtInt, fmtRelative } from './format';
import { useLoad } from './useLoad';

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
};

type Status = 'ok' | 'warn' | 'error' | 'off';
const STATUS_TONE: Record<Status, 'green' | 'orange' | 'red' | 'neutral'> = { ok: 'green', warn: 'orange', error: 'red', off: 'neutral' };

function IntegrationRow({ name, tag, status, children, href, square }: { name: string; tag: string; status: Status; children?: ReactNode; href?: string; square: string }) {
  return (
    <li className="flex gap-3 border-b border-white/[0.05] py-3.5 last:border-b-0">
      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: square }} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="text-[13.5px] text-[#EDEDED]">
            {href ? <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">{name}<ArrowUpRight className="h-3 w-3 text-[#5C5C5C]" aria-hidden /></a> : name}
          </span>
          <Tag tone={STATUS_TONE[status]}>{tag}</Tag>
        </div>
        {children && <div className="mt-1 font-mono text-[11.5px] leading-snug text-[#8B8B8B]">{children}</div>}
      </div>
    </li>
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
  const actions = useLoad(fetchAdminActions, `actions|${refreshKey}`);
  // Search Console lives in the lifecycle view; its error counts as a failing integration.
  const lc = useLoad(() => fetchAdminLifecycle(period), `${period}|lc|${refreshKey}`);
  const rc = i.revenuecat;
  const store = i.appStore;
  const h = i.health;
  const sc = lc.data?.searchConsole ?? null;
  const problems = integrationProblems(i, sc);
  const wh = h?.revenuecatWebhook;
  const tracking = h?.tracking;
  const anyKeyMissing = h ? !h.llmKeys.anthropic || !h.llmKeys.openai : true;

  return (
    <div className="flex flex-col gap-4">
      <MissingNote missing={o.missing} sections={['integrations', 'coverage']} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHead title="Integraciones" count={problems.length ? `${problems.length} pendientes` : 'todo conectado'} />
          <ul className="m-0 list-none p-0">
            <IntegrationRow
              name="RevenueCat · métricas" square="#F25A5A"
              status={rc.configured ? (rc.error ? 'error' : 'ok') : 'off'} tag={rc.configured ? (rc.error ? 'Con error' : 'Conectado') : 'Sin conectar'}
            >
              {rc.error ? rc.error : rc.configured ? `${fmtInt(rc.metrics?.length ?? 0)} métricas disponibles` : 'Necesita REVENUECAT_V2_SECRET_KEY'}
            </IntegrationRow>
            <IntegrationRow
              name="Webhook RevenueCat" square="#F25A5A"
              status={!wh ? 'off' : !wh.configured ? 'error' : wh.lastEventAt ? 'ok' : 'warn'}
              tag={!wh ? 'Sin dato' : !wh.configured ? 'Sin configurar' : wh.lastEventAt ? 'Configurado' : 'Sin eventos'}
            >
              {!wh ? 'Estado no disponible'
                : !wh.configured ? 'Faltan REVENUECAT_SECRET_KEY y/o REVENUECAT_WEBHOOK_AUTH'
                : `Configurado · último evento ${wh.lastEventAt ? fmtRelative(wh.lastEventAt) : 'aún sin eventos'} · ${wh.events30d != null ? fmtInt(wh.events30d) : '—'} en 30 días`}
            </IntegrationRow>
            <IntegrationRow
              name="App Store Connect · descargas" square="#4FB3FF"
              status={store.configured ? (store.error ? 'error' : 'ok') : 'off'} tag={store.configured ? (store.error ? 'Con error' : 'Conectado') : 'Sin conectar'}
            >
              {store.error ? store.error : store.configured && store.totals ? `${fmtInt(store.totals.downloads)} descargas en el periodo` : 'Necesita la llave de App Store Connect API'}
            </IntegrationRow>
            <IntegrationRow
              name="Google Search Console" square="#4ADE80"
              status={!sc ? 'off' : !sc.configured ? 'off' : sc.error ? 'error' : 'ok'}
              tag={!sc ? (lc.error ? 'Sin dato' : 'Revisando') : !sc.configured ? 'Sin conectar' : sc.error ? 'Con error' : 'Conectado'}
            >
              {!sc ? (lc.error ? lc.error.message : 'Consultando…') : sc.error ? sc.error : sc.configured ? `${fmtInt(sc.totals?.clicks ?? 0)} clics en el periodo` : 'Necesita GSC_SERVICE_ACCOUNT_JSON'}
            </IntegrationRow>
            <IntegrationRow
              name="Eventos web (tracking)" square="#F28C38"
              status={!tracking ? 'off' : (tracking.events24h ?? 0) > 0 ? 'ok' : tracking.lastEventAt ? 'warn' : 'error'}
              tag={!tracking ? 'Sin dato' : (tracking.events24h ?? 0) > 0 ? 'Recibiendo' : tracking.lastEventAt ? 'Sin eventos hoy' : 'Sin eventos'}
            >
              {!tracking ? 'Estado no disponible'
                : `último evento ${tracking.lastEventAt ? fmtRelative(tracking.lastEventAt) : 'nunca'} · ${tracking.events24h != null ? fmtInt(tracking.events24h) : '—'} en 24 h`}
            </IntegrationRow>
            <IntegrationRow
              name="Llaves de IA" square="#8B8B8B"
              status={!h ? 'off' : anyKeyMissing ? 'error' : 'ok'} tag={!h ? 'Sin dato' : anyKeyMissing ? 'Falta una' : 'Configuradas'}
            >
              {h ? `Anthropic ${h.llmKeys.anthropic ? 'sí' : 'no'} · OpenAI ${h.llmKeys.openai ? 'sí' : 'no'}` : 'Estado no disponible'}
            </IntegrationRow>
            <IntegrationRow name="Vercel Analytics" square="#EDEDED" status="off" tag="No verificable desde aquí" href={VERCEL_ANALYTICS}>
              Sin API de lectura: revisa el panel de Vercel para confirmar que recibe visitas
            </IntegrationRow>
            <IntegrationRow name="Cobro (BOBBY_PAYWALL)" square="#F28C38" status={i.paywall ? 'ok' : 'warn'} tag={i.paywall ? 'Encendido' : 'Apagado'}>
              {i.paywall ? 'Las cuentas gratis tienen su límite semanal de lecturas' : 'Las cuentas gratis tienen lecturas ilimitadas'}
            </IntegrationRow>
          </ul>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHead title="Qué falla" count={problems.length ? `${problems.length}` : undefined} />
            {problems.length === 0 ? (
              <p className="m-0 font-mono text-[12px] uppercase tracking-[0.06em] text-[#4ADE80]">Todo conectado</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0 font-mono text-[12px] text-[#F3B0B0]">
                {problems.filter((p) => !p.startsWith('Falta ')).map((p) => <li key={p} className="break-words">· {p}</li>)}
                {problems.every((p) => p.startsWith('Falta ')) && <li className="text-[#8B8B8B]">Solo faltan variables (abajo).</li>}
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

      {actions.data && actions.error && <StaleBanner error={actions.error} onRetry={() => void actions.reload()} />}
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
