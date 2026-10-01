import { fetchAdminMembers, isMissing, type OverviewResponse } from '@/lib/admin-client';
import { Card, CardHead, Empty, ErrorState, KpiStrip, Loading, MissingNote, Note, StaleBanner, TableScroll, Tag, td, th, tr } from './ui';
import { BigNumber, StatusBars } from './charts';
import { windowDelta, type CompareSeries } from './deltas';
import { ACTIVE_SUB, DASH, effectiveSubStatus, fmtDate, fmtInt, fmtPeriod, fmtUsd, label, statusLabel } from './format';
import { useLoad } from './useLoad';

const CHURN = new Set(['canceled', 'cancelled', 'expired', 'billing_issue', 'past_due', 'unpaid', 'refunded']);
const GRANT_SOURCE: Record<string, string> = { referral: 'Invitación', admin: 'Regalo del admin' };

function metricValue(value: number, unit?: string): string {
  if (!unit) return fmtInt(value);
  if (unit === '$' || /^usd$/i.test(unit)) return fmtUsd(value);
  if (unit === '%') return `${fmtInt(value)}%`;
  return `${fmtInt(value)} ${unit}`;
}

export default function MembershipsTab({ data, period, refreshKey, cmp }: { data: OverviewResponse; period: number; refreshKey: number; cmp: CompareSeries | null }) {
  const { overview: o, integrations: i } = data;
  const s = o.subscriptions;
  const r = o.revenue;
  const rc = i.revenuecat;
  const miss = (path: string) => isMissing(o.missing, path);
  const show = (path: string, text: string) => (miss(path) ? DASH : text);
  const members = useLoad(fetchAdminMembers, `members|${refreshKey}`);
  const statuses = Object.entries(s.byStatus).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const providers = Object.entries(s.byProvider).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const totalSubs = statuses.reduce((a, [, v]) => a + v, 0);
  const subs = members.data?.subscriptions ?? [];
  const grants = members.data?.grants ?? [];

  return (
    <div className="flex flex-col gap-4">
      <MissingNote missing={o.missing} sections={['subscriptions', 'revenue', 'integrations']} />
      <KpiStrip
        items={[
          { label: 'Membresías activas', value: show('subscriptions.active', fmtInt(s.active)), caption: 'pagadas · Apple + Stripe' },
          { label: 'Pro regalado', value: show('subscriptions.giftedPro', fmtInt(s.giftedPro)), caption: 'invitaciones y regalos vigentes' },
          { label: 'Ingresos brutos', value: show('revenue.grossUsd', fmtUsd(r.grossUsd)), delta: miss('revenue.daily') ? null : windowDelta(cmp?.revenue, period) },
        ]}
      />
      <KpiStrip
        items={[
          { label: 'Neto estimado', value: show('revenue.netUsd', fmtUsd(r.netUsd)), caption: `comisión e impuestos de la tienda, menos reembolsos · ${period}d` },
          { label: 'Reembolsos', value: show('revenue.refundsUsd', fmtUsd(r.refundsUsd)), caption: `${period}d` },
          { label: 'Suscripciones nuevas', value: show('revenue.newSubscriptions', fmtInt(r.newSubscriptions)), caption: `${show('revenue.renewals', fmtInt(r.renewals))} renovaciones` },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <BigNumber label="Por estado" value={show('subscriptions.byStatus', fmtInt(totalSubs))} caption="suscripciones" />
          {miss('subscriptions.byStatus') ? <Empty>Dato no disponible</Empty> : statuses.length
            ? <StatusBars rows={statuses.map(([k, v]) => ({ label: statusLabel(k), value: v, fill: CHURN.has(k) ? 'orange' : 'blue' }))} />
            : <Empty>Sin suscripciones todavía</Empty>}
        </Card>
        <Card>
          <BigNumber label="Por proveedor de pago" value={show('subscriptions.active', fmtInt(s.active))} caption="activas" />
          {miss('subscriptions.byProvider') ? <Empty>Dato no disponible</Empty> : providers.length
            ? <StatusBars rows={providers.map(([k, v], idx) => ({ label: label(k), value: v, fill: idx % 2 ? 'orange' : 'blue' }))} />
            : <Empty>Sin suscripciones activas</Empty>}
        </Card>
        <Card>
          <BigNumber label="Movimientos" value={miss('revenue') ? DASH : fmtInt(r.newSubscriptions + r.renewals + r.cancellations + r.expirations)} caption={`eventos · ${period}d`} />
          {miss('revenue') ? <Empty>Dato no disponible</Empty> : (
            <StatusBars
              rows={[
                { label: 'Nuevas', value: r.newSubscriptions, fill: 'blue' },
                { label: 'Renovaciones', value: r.renewals, fill: 'blue' },
                { label: 'Cancelaciones', value: r.cancellations, fill: 'orange' },
                { label: 'Expiraciones', value: r.expirations, fill: 'orange' },
                { label: 'Sandbox', value: r.sandboxEvents, fill: 'blue', sub: 'pruebas' },
              ]}
            />
          )}
        </Card>
      </div>

      <Card padded={false}>
        <div className="px-5 pt-5"><CardHead title="RevenueCat" count={rc.metrics?.length ? `${rc.metrics.length} métricas` : undefined} sub="Métricas del proyecto en RevenueCat" /></div>
        {rc.configured && rc.metrics?.length ? (
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-b-2xl border-t border-white/[0.06] bg-white/[0.06] sm:grid-cols-3">
            {rc.metrics.map((m) => (
              <div key={m.id} className="min-w-0 bg-[#141415] p-5">
                <div className="truncate text-[13px] text-[#EDEDED]/90">{m.name}</div>
                <div className="mt-2 truncate font-mono text-[22px] font-medium leading-none text-[#EDEDED]">{metricValue(m.value, m.unit)}</div>
                {m.period && <div className="mt-2 font-mono text-[11px] uppercase text-[#5C5C5C]">{fmtPeriod(m.period)}</div>}
              </div>
            ))}
            {Array.from({ length: (3 - (rc.metrics.length % 3)) % 3 }, (_, k) => <div key={`fill-${k}`} className="hidden bg-[#141415] sm:block" />)}
          </div>
        ) : (
          <div className="px-5 pb-5">
            {rc.configured ? (
              <Note tone={rc.error ? 'red' : 'neutral'} tag={rc.error ? 'Error' : 'Sin datos'}>{rc.error ? `RevenueCat respondió con un error: ${rc.error}` : 'RevenueCat no devolvió métricas todavía.'}</Note>
            ) : (
              <Note tag="Sin conectar">
                Para ver MRR, suscriptores activos y pruebas aquí, agrega <code className="font-mono text-[#EDEDED]">REVENUECAT_V2_SECRET_KEY</code> en Vercel
                (RevenueCat → Project settings → API keys → nueva secret key v2 con lectura de métricas).
              </Note>
            )}
          </div>
        )}
      </Card>

      {members.data && members.error && <StaleBanner error={members.error} onRetry={() => void members.reload()} />}

      <Card>
        <CardHead
          title="Suscripciones"
          count={members.data ? `${fmtInt(subs.filter((x) => x.active).length)} activas · ${fmtInt(subs.length)} en total` : undefined}
          sub="Todas las suscripciones pagadas (Apple y Stripe)"
        />
        {members.error && !members.data ? <ErrorState message={members.error.message} onRetry={() => void members.reload()} />
          : !members.data ? <Loading label="Cargando membresías" />
          : subs.length === 0 ? <Empty>Sin suscripciones todavía</Empty>
          : (
            <TableScroll minWidth={780}>
              <thead>
                <tr>
                  <th className={th}>Cuenta</th><th className={th}>Pago</th><th className={th}>Estado</th><th className={th}>Producto</th>
                  <th className={th}>Renueva / vence</th><th className={th}>Actualizada</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((x) => {
                  const st = effectiveSubStatus(x.status, x.currentPeriodEnd);
                  const live = x.active && !!st && ACTIVE_SUB.has(st);
                  return (
                    <tr key={`${x.identityId}-${x.provider}-${x.productId}`} className={tr}>
                      <td className={td}>
                        <div className="max-w-[240px] truncate text-[13px]" title={x.email ?? x.identityId}>{x.email ?? 'Sin email'}</div>
                        <div className="max-w-[240px] truncate font-mono text-[10.5px] text-[#5C5C5C]">{x.identityId}</div>
                      </td>
                      <td className={td}>{x.provider ? <Tag>{label(x.provider)}</Tag> : DASH}</td>
                      <td className={td}><Tag tone={live ? 'green' : st && CHURN.has(st) ? 'orange' : 'neutral'}>{statusLabel(st)}</Tag></td>
                      <td className={`${td} font-mono text-[11.5px] text-[#8B8B8B]`}><div className="max-w-[200px] truncate" title={x.productId ?? undefined}>{x.productId ?? DASH}</div></td>
                      <td className={`${td} font-mono text-[12px] text-[#8B8B8B]`}>{fmtDate(x.currentPeriodEnd)}</td>
                      <td className={`${td} font-mono text-[12px] text-[#8B8B8B]`}>{fmtDate(x.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </TableScroll>
          )}
      </Card>

      <Card>
        <CardHead
          title="Pro regalado"
          count={members.data ? `${fmtInt(grants.filter((g) => g.active).length)} vigentes · ${fmtInt(grants.length)} en total` : undefined}
          sub="Invitaciones y regalos del admin"
        />
        {!members.data ? (members.error ? null : <Loading label="Cargando regalos" />)
          : grants.length === 0 ? <Empty>Sin Pro regalado todavía</Empty>
          : (
            <TableScroll minWidth={560}>
              <thead><tr><th className={th}>Cuenta</th><th className={th}>Origen</th><th className={th}>Pro hasta</th><th className={th}>Estado</th></tr></thead>
              <tbody>
                {grants.map((g) => (
                  <tr key={`${g.identityId}-${g.proUntil}`} className={tr}>
                    <td className={td}>
                      <div className="max-w-[240px] truncate text-[13px]" title={g.email ?? g.identityId}>{g.email ?? 'Sin email'}</div>
                      <div className="max-w-[240px] truncate font-mono text-[10.5px] text-[#5C5C5C]">{g.identityId}</div>
                    </td>
                    <td className={`${td} text-[12.5px] text-[#8B8B8B]`}>{g.source ? GRANT_SOURCE[g.source] ?? g.source : DASH}</td>
                    <td className={`${td} font-mono text-[12px] text-[#8B8B8B]`}>{fmtDate(g.proUntil)}</td>
                    <td className={td}><Tag tone={g.active ? 'orange' : 'neutral'}>{g.active ? 'Vigente' : 'Terminado'}</Tag></td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>
          )}
      </Card>
    </div>
  );
}
