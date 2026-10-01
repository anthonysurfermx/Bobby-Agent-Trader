import { fetchAdminUsers, type AdminMe, type OverviewResponse } from '@/lib/admin-client';
import { Card, CardHead, Empty, ErrorState, KpiStrip, Loading, Note, TableScroll, Tag, td, th, tr } from './ui';
import { BigNumber, StatusBars } from './charts';
import { Identity, PlanCell } from './cells';
import { windowDelta, type CompareSeries } from './deltas';
import { ACTIVE_SUB, fmtDate, fmtInt, fmtPeriod, fmtUsd, label, statusLabel } from './format';
import { useLoad } from './useLoad';

const SCAN = 200;
const CHURN = new Set(['canceled', 'cancelled', 'expired', 'billing_issue', 'past_due', 'unpaid', 'refunded']);

function metricValue(value: number, unit?: string): string {
  if (!unit) return fmtInt(value);
  if (unit === '$' || /^usd$/i.test(unit)) return fmtUsd(value);
  if (unit === '%') return `${fmtInt(value)}%`;
  return `${fmtInt(value)} ${unit}`;
}

export default function MembershipsTab({ data, period, me, refreshKey, cmp }: { data: OverviewResponse; period: number; me: AdminMe; refreshKey: number; cmp: CompareSeries | null }) {
  const { overview: o, integrations: i } = data;
  const s = o.subscriptions;
  const r = o.revenue;
  const rc = i.revenuecat;
  const users = useLoad(() => fetchAdminUsers({ limit: SCAN, offset: 0 }), `members|${refreshKey}`);
  const members = (users.data?.users ?? []).filter((u) => u.pro || (u.sub_status != null && ACTIVE_SUB.has(u.sub_status)));
  const statuses = Object.entries(s.byStatus).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const providers = Object.entries(s.byProvider).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const totalSubs = statuses.reduce((a, [, v]) => a + v, 0);

  return (
    <div className="flex flex-col gap-4">
      <KpiStrip
        items={[
          { label: 'Membresías activas', value: fmtInt(s.active), caption: 'pagadas · Apple + Stripe' },
          { label: 'Pro regalado', value: fmtInt(s.giftedPro), caption: 'invitaciones y regalos vigentes' },
          { label: 'Ingresos brutos', value: fmtUsd(r.grossUsd), delta: windowDelta(cmp?.revenue, period) },
        ]}
      />
      <KpiStrip
        items={[
          { label: 'Ingresos netos', value: fmtUsd(r.netUsd), caption: `después de comisiones · ${period}d` },
          { label: 'Reembolsos', value: fmtUsd(r.refundsUsd), caption: `${period}d` },
          { label: 'Suscripciones nuevas', value: fmtInt(r.newSubscriptions), caption: `${fmtInt(r.renewals)} renovaciones` },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <BigNumber label="Por estado" value={fmtInt(totalSubs)} caption="suscripciones" />
          {statuses.length
            ? <StatusBars rows={statuses.map(([k, v]) => ({ label: statusLabel(k), value: v, fill: CHURN.has(k) ? 'orange' : 'blue' }))} />
            : <Empty>Sin suscripciones todavía</Empty>}
        </Card>
        <Card>
          <BigNumber label="Por proveedor de pago" value={fmtInt(s.active)} caption="activas" />
          {providers.length
            ? <StatusBars rows={providers.map(([k, v], idx) => ({ label: label(k), value: v, fill: idx % 2 ? 'orange' : 'blue' }))} />
            : <Empty>Sin suscripciones activas</Empty>}
        </Card>
        <Card>
          <BigNumber label="Movimientos" value={fmtInt(r.newSubscriptions + r.renewals + r.cancellations + r.expirations)} caption={`eventos · ${period}d`} />
          <StatusBars
            rows={[
              { label: 'Nuevas', value: r.newSubscriptions, fill: 'blue' },
              { label: 'Renovaciones', value: r.renewals, fill: 'blue' },
              { label: 'Cancelaciones', value: r.cancellations, fill: 'orange' },
              { label: 'Expiraciones', value: r.expirations, fill: 'orange' },
              { label: 'Sandbox', value: r.sandboxEvents, fill: 'blue', sub: 'pruebas' },
            ]}
          />
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

      <Card>
        <CardHead title="Cuentas con membresía" count={users.data ? `${fmtInt(members.length)} con Pro` : undefined} sub="Pagadas y regaladas" />
        {users.error && !users.data ? (
          <ErrorState message={users.error.message} onRetry={() => void users.reload()} />
        ) : !users.data ? (
          <Loading label="Buscando membresías" />
        ) : members.length === 0 ? (
          <Empty>Ninguna cuenta tiene Pro todavía</Empty>
        ) : (
          <TableScroll minWidth={760}>
            <thead>
              <tr>
                <th className={th}>Cuenta</th>
                <th className={th}>Plan</th>
                <th className={th}>Pago</th>
                <th className={th}>Estado</th>
                <th className={th}>Renueva / vence</th>
                <th className={th}>Pro regalado hasta</th>
                <th className={th}>Creada</th>
              </tr>
            </thead>
            <tbody>
              {members.map((u) => (
                <tr key={u.id} className={tr}>
                  <td className={td}><Identity u={u} self={u.id === me.identityId} /></td>
                  <td className={td}><PlanCell u={u} /></td>
                  <td className={td}>{u.sub_provider ? <Tag>{label(u.sub_provider)}</Tag> : <span className="font-mono text-[#5C5C5C]">—</span>}</td>
                  <td className={`${td} font-mono text-[11.5px] uppercase text-[#8B8B8B]`}>{statusLabel(u.sub_status)}</td>
                  <td className={`${td} font-mono text-[12px] text-[#8B8B8B]`}>{fmtDate(u.current_period_end)}</td>
                  <td className={`${td} font-mono text-[12px] text-[#8B8B8B]`}>{fmtDate(u.pro_until)}</td>
                  <td className={`${td} font-mono text-[12px] text-[#8B8B8B]`}>{fmtDate(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        )}
        {users.data && users.data.total > SCAN && (
          <p className="m-0 mt-3 font-mono text-[11px] text-[#5C5C5C]">Revisadas {fmtInt(SCAN)} de {fmtInt(users.data.total)} cuentas; puede haber más membresías en las demás (búscalas en Usuarios).</p>
        )}
      </Card>
    </div>
  );
}
