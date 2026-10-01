import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { fetchAdminActions, type OverviewResponse } from '@/lib/admin-client';
import { Card, CardHead, Empty, ErrorState, Loading, Note, TableScroll, Tag, td, th, tr } from './ui';
import { fmtDateTime, fmtInt, fmtRelative } from './format';
import { useLoad } from './useLoad';

const VERCEL_ANALYTICS = 'https://vercel.com/anthonysurfermxs-projects/bobby-agent-trader/analytics';
const VERCEL_ENV_HINT = 'Todas van en Vercel → Settings → Environment Variables (Production). Después vuelve a desplegar: el servidor solo las lee al arrancar.';
const GENERIC_HELP = 'Agrégala en Vercel (Production).';

/** Where each missing env value comes from. Names not listed get the generic Vercel hint. */
const ENV_HELP: Array<[RegExp, string]> = [
  [/^REVENUECAT_V2_SECRET_KEY$/, 'RevenueCat → Project settings → API keys → nueva secret key v2 con lectura de métricas.'],
  [/^REVENUECAT_PROJECT_ID$/, 'RevenueCat → Project settings → General: el Project ID.'],
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
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join(' · ');
  } catch { return ''; }
}

export default function IntegrationsTab({ data, refreshKey }: { data: OverviewResponse; refreshKey: number }) {
  const { overview: o, integrations: i } = data;
  const actions = useLoad(fetchAdminActions, `actions|${refreshKey}`);
  const rc = i.revenuecat;
  const store = i.appStore;
  const webhookMissing = i.missing.filter((m) => /WEBHOOK/i.test(m) && /REVENUECAT/i.test(m));
  const rcEvents = o.revenue.newSubscriptions + o.revenue.renewals + o.revenue.cancellations + o.revenue.expirations + o.revenue.sandboxEvents;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHead title="Integraciones" count={`${i.missing.length ? `${i.missing.length} pendientes` : 'todo conectado'}`} />
          <ul className="m-0 list-none p-0">
            <IntegrationRow
              name="RevenueCat · métricas" square="#F25A5A"
              status={rc.configured ? (rc.error ? 'error' : 'ok') : 'off'} tag={rc.configured ? (rc.error ? 'Con error' : 'Conectado') : 'Sin conectar'}
            >
              {rc.error ? rc.error : rc.configured ? `${fmtInt(rc.metrics?.length ?? 0)} métricas disponibles` : 'Necesita REVENUECAT_V2_SECRET_KEY'}
            </IntegrationRow>
            <IntegrationRow
              name="App Store Connect · descargas" square="#4FB3FF"
              status={store.configured ? (store.error ? 'error' : 'ok') : 'off'} tag={store.configured ? (store.error ? 'Con error' : 'Conectado') : 'Sin conectar'}
            >
              {store.error ? store.error : store.configured && store.totals ? `${fmtInt(store.totals.downloads)} descargas en el periodo` : 'Necesita la llave de App Store Connect API'}
            </IntegrationRow>
            <IntegrationRow
              name="Webhook RevenueCat" square="#F25A5A"
              status={!webhookMissing.length && rcEvents > 0 ? 'ok' : 'off'}
              tag={webhookMissing.length ? 'Sin conectar' : rcEvents > 0 ? 'Recibiendo' : 'Sin eventos'}
            >
              {webhookMissing.length
                ? `Falta ${webhookMissing.join(', ')}`
                : `${fmtInt(rcEvents)} eventos de suscripción en el periodo (${fmtInt(o.revenue.sandboxEvents)} de sandbox)`}
            </IntegrationRow>
            <IntegrationRow name="Vercel Analytics" square="#EDEDED" status="ok" tag="Siempre activo" href={VERCEL_ANALYTICS}>
              Visitas, páginas y países del sitio web, en el panel de Vercel
            </IntegrationRow>
            <IntegrationRow name="Cobro (BOBBY_PAYWALL)" square="#F28C38" status={i.paywall ? 'ok' : 'warn'} tag={i.paywall ? 'Encendido' : 'Apagado'}>
              {i.paywall ? 'Las cuentas gratis tienen su límite semanal de lecturas' : 'Las cuentas gratis tienen lecturas ilimitadas'}
            </IntegrationRow>
          </ul>
        </Card>

        <Card>
          <CardHead title="Variables que faltan" count={i.missing.length ? `${i.missing.length}` : undefined} />
          {i.missing.length === 0 ? (
            <p className="m-0 flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.06em] text-[#4ADE80]">Todo configurado</p>
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

      <Card>
        <CardHead title="Actividad del admin" count={actions.data ? `${actions.data.actions.length}` : undefined} sub="Cada acción de este panel queda registrada" />
        {actions.error && !actions.data ? <ErrorState message={actions.error.message} onRetry={() => void actions.reload()} />
          : !actions.data ? <Loading label="Cargando actividad" />
          : actions.data.actions.length === 0 ? <Empty>Sin acciones todavía</Empty>
          : (
            <TableScroll minWidth={720}>
              <thead><tr><th className={th}>Cuándo</th><th className={th}>Admin</th><th className={th}>Acción</th><th className={th}>Sobre</th><th className={th}>Detalle</th></tr></thead>
              <tbody>
                {actions.data.actions.map((a) => (
                  <tr key={a.id} className={tr}>
                    <td className={`${td} font-mono text-[12px] text-[#8B8B8B]`} title={fmtDateTime(a.created_at)}>{fmtRelative(a.created_at)}</td>
                    <td className={td}><div className="max-w-[200px] truncate text-[12.5px]">{a.admin_email ?? '—'}</div></td>
                    <td className={`${td} text-[12.5px]`}>{ACTION_LABEL[a.action] ?? a.action}</td>
                    <td className={`${td} font-mono text-[11.5px] text-[#8B8B8B]`}><div className="max-w-[220px] truncate" title={a.target ?? undefined}>{a.target ?? '—'}</div></td>
                    <td className={`${td} font-mono text-[11px] text-[#5C5C5C]`}><div className="max-w-[360px] truncate" title={detailText(a.detail)}>{detailText(a.detail) || '—'}</div></td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>
          )}
      </Card>
    </div>
  );
}
