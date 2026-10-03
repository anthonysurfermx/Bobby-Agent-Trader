import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { adminAction, fetchAdminMembers, isMissing, type MemberCommercial, type MemberSubscription, type OverviewResponse } from '@/lib/admin-client';
import { Btn, Card, CardHead, Empty, ErrorState, KpiStrip, Loading, MissingNote, Note, StaleBanner, TableScroll, Tag, td, th, tr } from './ui';
import { BigNumber, StatusBars } from './charts';
import { windowDelta, type CompareSeries } from './deltas';
import { ACTIVE_SUB, DASH, commercialLabel, effectiveSubStatus, fmtDate, fmtDateTime, fmtInt, fmtRelative, fmtUsd, label, statusLabel } from './format';
import { rcMetricValue, rcMetricWindow } from './health';
import { toAdminError, useLoad } from './useLoad';
import { CORE_REFRESH_MS, CORE_STALE_MS, sourceMetaForError } from './live';
import SourceFreshness from './SourceFreshness';

type Notify = (text: string, ok?: boolean) => void;

const CHURN = new Set(['canceled', 'cancelled', 'expired', 'billing_issue', 'past_due', 'unpaid', 'refunded']);
const GRANT_SOURCE: Record<string, string> = { referral: 'Invitación', admin: 'Regalo del admin' };
const COMMERCIAL_TONE: Record<MemberCommercial, 'green' | 'orange' | 'blue' | 'neutral'> = { paid: 'green', unverified: 'orange', test: 'blue', inactive: 'neutral' };

/** What the store confirmed about this membership and its resulting access. */
function resyncMessage(r: { revenuecatActive?: unknown; accessKept?: unknown; subscription?: unknown }): string {
  const sub = (r.subscription && typeof r.subscription === 'object' ? r.subscription : {}) as { environment?: unknown; periodType?: unknown };
  if (r.accessKept === true) return 'RevenueCat no reporta Pro activo; el acceso no se cambió.';
  if (r.revenuecatActive !== true) return 'RevenueCat no reporta Pro activo.';
  if (sub.environment === 'sandbox') return 'RevenueCat: compra de prueba (sandbox), no cuenta como pago.';
  if (sub.periodType === 'trial') return 'RevenueCat: periodo de prueba, no cuenta como pago.';
  if (sub.environment === 'production') return 'Verificado con RevenueCat: producción.';
  return 'RevenueCat respondió sin entorno: sigue sin verificar.';
}

export default function MembershipsTab({ data, period, refreshKey, cmp, internal, notify, onChanged, markFailed: overviewMarkFailed = false }: {
  data: OverviewResponse; period: number; refreshKey: number; cmp: CompareSeries | null;
  /** The header's team switch: false leaves the team's memberships out of this tab too. */
  internal: boolean; notify: Notify; onChanged: () => void;
  /** The overview's load could not mark this browser as the team's; the members view's own flag counts too. */
  markFailed?: boolean;
}) {
  const { overview: o, integrations: i } = data;
  const s = o.subscriptions;
  const r = o.revenue;
  const rc = i.revenuecat;
  const miss = (path: string) => isMissing(o.missing, path);
  const show = (path: string, text: string) => (miss(path) ? DASH : text);
  const mode = internal ? 'in' : 'out';
  const members = useLoad((signal) => fetchAdminMembers(internal, signal), `${mode}|members|${refreshKey}`, { intervalMs: CORE_REFRESH_MS });
  // Rows loaded with the other team mode are never shown under this one.
  const m = members.data && members.dataKey?.startsWith(`${mode}|`) ? members.data : null;
  const markFailed = !internal && (overviewMarkFailed || !!m?.internalMarkFailed);
  const unverifiedNote = markFailed ? ' Sin verificar: esta carga no pudo marcar tu navegador como del equipo.' : '';
  const [syncing, setSyncing] = useState<string | null>(null);
  const statuses = Object.entries(s.byStatus).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const providers = Object.entries(s.byProvider).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const totalSubs = statuses.reduce((a, [, v]) => a + v, 0);
  const subs = m?.subscriptions ?? [];
  const grants = m?.grants ?? [];
  const mShow = (path: string, v: number) => (m && !isMissing(m.missing, path) ? fmtInt(v) : DASH);
  const team = !m ? undefined : m.includeInternal ? 'Incluye al equipo.'
    : (isMissing(m.missing, 'excluded') ? 'Sin el equipo.'
      : m.excluded.subscriptions + m.excluded.grants === 0 ? 'Sin el equipo (ninguna fila es del equipo).'
      : `Sin el equipo (−${fmtInt(m.excluded.subscriptions)} ${m.excluded.subscriptions === 1 ? 'suscripción' : 'suscripciones'}, −${fmtInt(m.excluded.grants)} ${m.excluded.grants === 1 ? 'regalo' : 'regalos'}).`) + unverifiedNote;
  const reasons = miss('subscriptions.unverifiedReasons') ? 'motivo no disponible'
    : `${fmtInt(s.unverifiedReasons.unknown_environment)} entorno desconocido · ${fmtInt(s.unverifiedReasons.no_charge)} sin cobro registrado · ${fmtInt(s.unverifiedReasons.unknown_period)} periodo sin verificar`;
  const testReasons = miss('subscriptions.testReasons') ? 'motivo no disponible'
    : `${fmtInt(s.testReasons.sandbox)} sandbox · ${fmtInt(s.testReasons.trial)} periodo de prueba`;

  const resync = async (x: MemberSubscription) => {
    setSyncing(x.identityId);
    try {
      const res = await adminAction<{ revenuecatActive?: unknown; accessKept?: unknown; subscription?: unknown }>({ action: 'resync-membership', identityId: x.identityId });
      notify(resyncMessage(res));
      void members.reload(true);
      onChanged();
    } catch (e) {
      notify(toAdminError(e).message, false);
    } finally { setSyncing(null); }
  };
  // No purchase event has ever arrived (not even a sandbox one): "no sales" and "webhook never delivered" look
  // the same, so money is not shown as a $0 fact.
  const purchasesSince = o.coverage?.purchasesSince ?? null;
  const noPurchaseEvents = !!o.coverage && !purchasesSince;
  const money = (path: string, v: number) => (noPurchaseEvents ? 'Sin medir' : show(path, fmtUsd(v)));
  const count = (path: string, v: number) => (noPurchaseEvents ? 'Sin medir' : show(path, fmtInt(v)));
  const since = purchasesSince ? `eventos desde ${fmtDate(purchasesSince)}` : null;

  return (
    <div className="flex flex-col gap-4">
      <SourceFreshness meta={sourceMetaForError(m?.meta, members.error?.message)} maxAgeMs={CORE_STALE_MS} label="Membresías · cada 30 s" fallbackAt={m ? members.updatedAt : null} />
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
            : `Sin el equipo: ${fmtInt(r.internalEvents)} ${r.internalEvents === 1 ? 'evento de compra quedó' : 'eventos de compra quedaron'} fuera de estas cifras.${unverifiedNote}`}
        </Note>
      )}
      <KpiStrip
        items={[
          { label: 'Pagando (verificado)', value: show('subscriptions.paidVerified', fmtInt(s.paidVerified)), caption: 'ahora · producción, sin prueba y con un cobro real registrado' },
          { label: 'Pro sin verificar', value: show('subscriptions.unverified', fmtInt(s.unverified)), caption: `ahora · con acceso, no cuentan como pago · ${reasons}` },
          { label: 'Pro de prueba', value: show('subscriptions.test', fmtInt(s.test)), caption: `ahora · no pagan · ${testReasons}` },
          { label: 'Pro regalado', value: show('subscriptions.giftedPro', fmtInt(s.giftedPro)), caption: 'ahora · invitaciones y regalos vigentes (no pagan)' },
        ]}
      />
      <KpiStrip
        items={[
          {
            label: 'Ingresos brutos · USD registrados', value: money('revenue.grossUsd', r.grossUsd),
            delta: noPurchaseEvents || miss('revenue.daily') ? undefined : windowDelta(cmp?.revenue, period),
            // Store money of accounts that are not verified payers is inside the gross, never a payer (D1): said apart.
            caption: [`en el periodo · ${period}d`, since,
              !noPurchaseEvents && !miss('revenue.unverifiedGrossUsd') && r.unverifiedGrossUsd > 0 ? `incluye ${fmtUsd(r.unverifiedGrossUsd)} de cuentas sin verificar (no son pagadores)` : null,
            ].filter(Boolean).join(' · '),
          },
          { label: 'Neto estimado', value: money('revenue.netUsd', r.netUsd), caption: `tasa disponible o supuesta, menos reembolsos · comisiones de Stripe sin confirmar · ${period}d` },
          { label: 'Nuevos pagadores', value: count('revenue.newPaying', r.newPaying), caption: `pagadores verificados con su primer cobro en el periodo · ${period}d` },
        ]}
      />
      <KpiStrip
        items={[
          { label: 'Ingresos sin cuenta atribuida', value: show('revenue.unattributedGrossUsd', fmtUsd(r.unattributedGrossUsd)),
            caption: `${show('revenue.unattributedEvents', fmtInt(r.unattributedEvents))} eventos por conciliar · ${show('revenue.unattributedRefundsUsd', fmtUsd(r.unattributedRefundsUsd))} reembolsados · ${internal ? 'incluidos en el total, sin clasificación de cliente/equipo' : 'fuera de las cifras de clientes externos'}` },
          { label: 'Eventos sin importe USD confirmado', value: show('revenue.unconvertedEvents', fmtInt(r.unconvertedEvents)), caption: `importe pendiente de conciliar · sin conversión estimada de moneda · ${period}d` },
          { label: 'Cuentas con cobro en el periodo', value: count('revenue.payingInPeriod', r.payingInPeriod), caption: `pagadores verificados con un cobro (nuevo o renovación) · ${period}d` },
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
          <BigNumber label="Por proveedor de pago" value={show('subscriptions.active', fmtInt(s.active))} caption="con acceso Pro ahora (pagando, sin verificar y de prueba)" />
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
                { label: 'Entorno desconocido', value: r.unknownEnvEvents, fill: 'blue', sub: 'sin verificar, no cuentan', missing: miss('revenue.unknownEnvEvents') ? 'Dato no disponible' : undefined },
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
            sub={`Métricas del proyecto en RevenueCat, cada una con su propia ventana (no siguen el selector)${internal ? '' : ' · incluye al equipo (la fuente no lo separa)'}${rc.fetchedAt ? ` · consultado ${fmtRelative(rc.fetchedAt)}` : ''}`}
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
            {!data.providersLoaded ? <Note tag="Pendiente">RevenueCat pendiente de consulta. Los datos del proveedor se actualizan cada 5 minutos.</Note> : rc.configured ? (
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

      {m && members.error && <StaleBanner error={members.error} onRetry={() => void members.reload()} />}

      <Card>
        <CardHead
          title="Suscripciones"
          count={m ? `${mShow('totals.live', m.totals.live)} con acceso · ${mShow('totals.paidVerified', m.totals.paidVerified)} pagando (verificado) · ${fmtInt(subs.length)} en total` : undefined}
          sub={<>Todas las suscripciones (Apple y Stripe) con su clase comercial; el acceso Pro no depende de ella. {team}</>}
        />
        {members.error && !m ? <ErrorState message={members.error.message} onRetry={() => void members.reload()} />
          : !m ? <Loading label="Cargando membresías" />
          : subs.length === 0 ? <Empty>Sin suscripciones todavía</Empty>
          : (
            <TableScroll minWidth={980}>
              <thead>
                <tr>
                  <th className={th}>Cuenta</th><th className={th}>Pago</th><th className={th}>Estado</th><th className={th}>Comercial</th><th className={th}>Producto</th>
                  <th className={th}>Renueva / vence</th><th className={th}>Actualizada</th><th className={th}><span className="sr-only">Verificar</span></th>
                </tr>
              </thead>
              <tbody>
                {subs.map((x) => {
                  const st = effectiveSubStatus(x.status, x.currentPeriodEnd);
                  const live = x.active && !!st && ACTIVE_SUB.has(st);
                  return (
                    <tr key={`${x.identityId}-${x.provider}-${x.productId}`} className={tr}>
                      <td className={td}>
                        <div className="flex max-w-[240px] items-center gap-1.5">
                          <span className="truncate text-[13px]" title={x.email ?? x.identityId}>{x.email ?? 'Sin email'}</span>
                          {x.internal && <Tag>Equipo</Tag>}
                        </div>
                        <div className="max-w-[240px] truncate font-mono text-[10.5px] text-[#5C5C5C]">{x.identityId}</div>
                      </td>
                      <td className={td}>{x.provider ? <Tag>{label(x.provider)}</Tag> : DASH}</td>
                      <td className={td}><Tag tone={live ? 'green' : st && CHURN.has(st) ? 'orange' : 'neutral'}>{statusLabel(st)}</Tag></td>
                      <td className={td}>
                        {x.commercial ? <Tag tone={COMMERCIAL_TONE[x.commercial]}>{commercialLabel(x.commercial, x.commercialReason)}</Tag> : DASH}
                        <div className="mt-1 font-mono text-[10.5px] text-[#5C5C5C]" title={x.storeCheckedAt ? fmtDateTime(x.storeCheckedAt) : undefined}>
                          {x.storeCheckedAt ? `consultado ${fmtRelative(x.storeCheckedAt)}` : 'sin consultar a la tienda'}
                          {x.firstChargeAt ? ` · 1.er cobro ${fmtDate(x.firstChargeAt)}` : ''}
                        </div>
                      </td>
                      <td className={`${td} font-mono text-[11.5px] text-[#8B8B8B]`}><div className="max-w-[200px] truncate" title={x.productId ?? undefined}>{x.productId ?? DASH}</div></td>
                      <td className={`${td} font-mono text-[12px] text-[#8B8B8B]`}>{fmtDate(x.currentPeriodEnd)}</td>
                      <td className={`${td} font-mono text-[12px] text-[#8B8B8B]`}>{fmtDate(x.updatedAt)}</td>
                      <td className={`${td} text-right`}>
                        {x.provider === 'apple' && (
                          <Btn size="sm" variant="ghost" busy={syncing === x.identityId} disabled={syncing != null} onClick={() => void resync(x)}
                            title="Consulta RevenueCat y actualiza la suscripción según el estado confirmado de la tienda">
                            {syncing !== x.identityId && <RefreshCw className="h-3.5 w-3.5" aria-hidden />}Verificar con RevenueCat
                          </Btn>
                        )}
                      </td>
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
          count={m ? `${fmtInt(grants.filter((g) => g.active).length)} vigentes · ${fmtInt(grants.length)} en total` : undefined}
          sub={<>Invitaciones y regalos del admin. {team}</>}
        />
        {!m ? (members.error ? null : <Loading label="Cargando regalos" />)
          : grants.length === 0 ? <Empty>Sin Pro regalado todavía</Empty>
          : (
            <TableScroll minWidth={560}>
              <thead><tr><th className={th}>Cuenta</th><th className={th}>Origen</th><th className={th}>Pro hasta</th><th className={th}>Estado</th></tr></thead>
              <tbody>
                {grants.map((g) => (
                  <tr key={`${g.identityId}-${g.proUntil}`} className={tr}>
                    <td className={td}>
                      <div className="flex max-w-[240px] items-center gap-1.5">
                        <span className="truncate text-[13px]" title={g.email ?? g.identityId}>{g.email ?? 'Sin email'}</span>
                        {g.internal && <Tag>Equipo</Tag>}
                      </div>
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
