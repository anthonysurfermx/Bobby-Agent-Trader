import { fetchAdminMembers, isMissing, type OverviewResponse } from '@/lib/admin-client';
import { Card, CardHead, Empty, ErrorState, KpiStrip, Loading, MissingNote, Note, StaleBanner, TableScroll, Tag, td, th, tr } from './ui';
import { BigNumber, StatusBars } from './charts';
import { windowDelta, type CompareSeries } from './deltas';
import { ACTIVE_SUB, DASH, effectiveSubStatus, fmtDate, fmtDateTime, fmtInt, fmtRelative, fmtUsd, label, statusLabel } from './format';
import { rcMetricValue, rcMetricWindow } from './health';
import { useLoad } from './useLoad';

const CHURN = new Set(['canceled', 'cancelled', 'expired', 'billing_issue', 'past_due', 'unpaid', 'refunded']);
const GRANT_SOURCE: Record<string, string> = { referral: 'Invitación', admin: 'Regalo del admin' };

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
  // No purchase event has ever arrived (not even a sandbox one): "no sales" and "webhook never delivered" look
  // the same, so money is not shown as a $0 fact.
  const purchasesSince = o.coverage?.purchasesSince ?? null;
  const noPurchaseEvents = !!o.coverage && !purchasesSince;
  const money = (path: string, v: number) => (noPurchaseEvents ? 'Sin medir' : show(path, fmtUsd(v)));
  const count = (path: string, v: number) => (noPurchaseEvents ? 'Sin medir' : show(path, fmtInt(v)));
  const since = purchasesSince ? `eventos desde ${fmtDate(purchasesSince)}` : null;

  return (
    <div className="flex flex-col gap-4">
      <MissingNote missing={o.missing} sections={['subscriptions', 'revenue', 'integrations', 'coverage']} />
      {noPurchaseEvents && (
        <Note tone="orange" tag="Sin medir">
          Nunca ha llegado un evento de compra (ni de prueba): no se puede distinguir «sin ventas» de «webhook sin entregar».
          Manda un evento de prueba desde RevenueCat y, cuando Stripe esté configurado, desde Stripe.
        </Note>
      )}
      {r.internalEvents > 0 && (
        <Note tag="Equipo">
          {o.includeInternal
            ? `Incluye ${fmtInt(r.internalEvents)} ${r.internalEvents === 1 ? 'evento de compra' : 'eventos de compra'} del equipo en el periodo.`
            : `Sin el equipo: ${fmtInt(r.internalEvents)} ${r.internalEvents === 1 ? 'evento de compra quedó' : 'eventos de compra quedaron'} fuera de estas cifras.`}
        </Note>
      )}
      <KpiStrip
        items={[
          { label: 'De pago', value: show('subscriptions.active', fmtInt(s.paid)), caption: 'ahora · Apple + Stripe, ya cobradas' },
          { label: 'En prueba', value: show('subscriptions.active', fmtInt(s.trialing)), caption: 'ahora · aún no pagan' },
          { label: 'Pro regalado', value: show('subscriptions.giftedPro', fmtInt(s.giftedPro)), caption: 'ahora · invitaciones y regalos vigentes (no pagan)' },
        ]}
      />
      <KpiStrip
        items={[
          {
            label: 'Ingresos brutos', value: money('revenue.grossUsd', r.grossUsd),
            delta: noPurchaseEvents || miss('revenue.daily') ? undefined : windowDelta(cmp?.revenue, period),
            caption: [`en el periodo · ${period}d`, since].filter(Boolean).join(' · '),
          },
          { label: 'Neto estimado', value: money('revenue.netUsd', r.netUsd), caption: `menos comisión e impuestos de la tienda y reembolsos · ${period}d` },
          { label: 'Cuentas nuevas de pago', value: count('revenue.newPaying', r.newPaying), caption: `con un cobro positivo en el periodo · ${period}d` },
        ]}
      />
      <KpiStrip
        items={[
          { label: 'Reembolsos', value: money('revenue.refundsUsd', r.refundsUsd), caption: `en el periodo · ${period}d` },
          { label: 'Suscripciones nuevas', value: count('revenue.newSubscriptions', r.newSubscriptions), caption: `${noPurchaseEvents ? 'Sin medir' : show('revenue.renewals', fmtInt(r.renewals))} renovaciones · ${period}d` },
          { label: 'Bajas', value: count('revenue.cancellations', r.cancellations + r.expirations), caption: noPurchaseEvents ? `en el periodo · ${period}d` : `${fmtInt(r.cancellations)} cancelaciones · ${fmtInt(r.expirations)} expiraciones · ${period}d` },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <BigNumber label="Por estado" value={show('subscriptions.byStatus', fmtInt(totalSubs))} caption="todas las registradas · histórico" />
          {miss('subscriptions.byStatus') ? <Empty>Dato no disponible</Empty> : statuses.length
            ? <StatusBars rows={statuses.map(([k, v]) => ({ label: statusLabel(k), value: v, fill: CHURN.has(k) ? 'orange' : 'blue' }))} />
            : <Empty>Sin suscripciones todavía</Empty>}
        </Card>
        <Card>
          <BigNumber label="Por proveedor de pago" value={show('subscriptions.active', fmtInt(s.active))} caption="activas ahora (pago + prueba)" />
          {miss('subscriptions.byProvider') ? <Empty>Dato no disponible</Empty> : providers.length
            ? <StatusBars rows={providers.map(([k, v], idx) => ({ label: label(k), value: v, fill: idx % 2 ? 'orange' : 'blue' }))} />
            : <Empty>Sin suscripciones activas</Empty>}
        </Card>
        <Card>
          <BigNumber label="Movimientos" value={miss('revenue') || noPurchaseEvents ? DASH : fmtInt(r.newSubscriptions + r.renewals + r.cancellations + r.expirations)} caption={`eventos en el periodo · ${period}d`} />
          {miss('revenue') ? <Empty>Dato no disponible</Empty> : noPurchaseEvents ? <Empty>Sin eventos de compra todavía</Empty> : (
            <StatusBars
              rows={[
                { label: 'Nuevas', value: r.newSubscriptions, fill: 'blue' },
                { label: 'Renovaciones', value: r.renewals, fill: 'blue' },
                { label: 'Cancelaciones', value: r.cancellations, fill: 'orange' },
                { label: 'Expiraciones', value: r.expirations, fill: 'orange' },
                { label: 'Sandbox', value: r.sandboxEvents, fill: 'blue', sub: 'pruebas, no cuentan' },
              ]}
            />
          )}
        </Card>
      </div>

      <Card padded={false}>
        <div className="px-5 pt-5">
          <CardHead
            title="RevenueCat"
            count={rc.metrics?.length ? `${rc.metrics.length} métricas` : undefined}
            sub={`Métricas del proyecto en RevenueCat, cada una con su propia ventana (no siguen el selector)${rc.fetchedAt ? ` · consultado ${fmtRelative(rc.fetchedAt)}` : ''}`}
          />
        </div>
        {rc.configured && rc.metrics?.length ? (
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-b-2xl border-t border-white/[0.06] bg-white/[0.06] sm:grid-cols-3">
            {rc.metrics.map((m) => (
              <div key={m.id} className="min-w-0 bg-[#141415] p-5">
                <div className="truncate text-[13px] text-[#EDEDED]/90" title={m.name}>{m.name}</div>
                <div className="mt-2 truncate font-mono text-[22px] font-medium leading-none text-[#EDEDED]">{rcMetricValue(m)}</div>
                <div className="mt-2 font-mono text-[11px] uppercase text-[#5C5C5C]">{rcMetricWindow(m.period) || 'sin ventana'}</div>
                {m.description && <p className="m-0 mt-1.5 text-[11.5px] leading-snug text-[#8B8B8B]">{m.description}</p>}
                {m.updatedAt && <div className="mt-1.5 font-mono text-[10.5px] text-[#5C5C5C]" title={fmtDateTime(m.updatedAt)}>actualizado {fmtRelative(m.updatedAt)}</div>}
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
