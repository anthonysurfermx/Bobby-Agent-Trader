import { useState } from 'react';
import { isMissing, type AdminError, type AdminLiveResponse, type LiveWindowId } from '@/lib/admin-client';
import { Card, CardHead, ErrorState, Loading, Note, Row, Segmented, StaleBanner, Tag } from './ui';
import { DASH, fmtCompact, fmtInt, fmtTimestamp, fmtUsd } from './format';
import { LIVE_REFRESH_MS } from './live';
import ClientOperationalPanel from './ClientOperationalPanel';
import { operationalCoverage, operationalServerCoverage, operationalValue, type OperationalMetric, type OperationalPlatform } from './operational-values';

const PLATFORMS: Array<{ id: OperationalPlatform; label: string }> = [
  { id: 'ios', label: 'App iOS' }, { id: 'web', label: 'Web Bobby' }, { id: 'android', label: 'App Android' },
];
const METRICS: Array<{ id: OperationalMetric; label: string; definition: string }> = [
  { id: 'consumed', label: 'Cupo usado', definition: 'Lecturas descontadas del cupo. No confirma una respuesta emitida o recibida.' },
  { id: 'completed', label: 'Emitidas', definition: 'Respuestas completas registradas por el servidor.' },
  { id: 'received', label: 'Recibidas', definition: 'El cliente confirmó la recepción con un comprobante del servidor. Solo versiones instrumentadas.' },
  { id: 'rendered', label: 'Presentadas', definition: 'El cliente confirmó un frame visible. No confirma lectura humana.' },
  { id: 'failed', label: 'Fallos servidor', definition: 'Solicitudes cuyo fallo quedó registrado en el servidor. No mide crashes nativos.' },
];

export default function OperationalPanel({ data, error, loading, updatedAt, onRetry }: {
  data: AdminLiveResponse | null; error: AdminError | null; loading: boolean; updatedAt: string | null; onRetry: () => void;
}) {
  const [windowId, setWindow] = useState<LiveWindowId>('15m');
  const live = data?.live;
  const snapshot = live?.windows[windowId];
  const coverage = live?.coverage;
  const metric = (pf: OperationalPlatform, field: 'observedDevices' | 'observedAccounts' | 'abandoned' | 'wallSignin' | 'wallPaywall' | 'wallLevel' | 'blocked', measured: boolean) => {
    const platformWindow = snapshot?.[pf];
    if (!platformWindow || !snapshot?.since || !measured || isMissing(data?.missing, `windows.${windowId}.${pf}.${field}`)) return DASH;
    const value = platformWindow[field];
    return typeof value === 'number' ? fmtInt(value) : fmtInt(Object.values(value).reduce((sum, n) => sum + n, 0));
  };
  const clientUnmeasured = live && (['ios', 'web'] as const).every((pf) =>
    !live.client?.platforms[pf].coverage.readReceivedSince && !live.client?.platforms[pf].coverage.readRenderedSince);
  const androidMeasured = data && operationalCoverage(data, windowId, 'android') !== 'unmeasured';
  const clientStatus = coverage?.clientIngestionEnabled === false ? 'Registro del cliente desactivado'
    : coverage?.clientIngestionEnabled == null ? 'Registro del cliente sin confirmar'
    : clientUnmeasured ? 'Recepción y presentación sin medir' : 'Solo versiones instrumentadas';
  return (
    <section aria-label="Operación actual" className="mb-4">
      <Card className="max-sm:p-4">
        <CardHead className="max-sm:[&>div:first-child]:contents max-sm:[&>div:first-child>p]:hidden" title="Actividad reciente" sub={<span className="hidden sm:inline">Registros observados · consulta cada {LIVE_REFRESH_MS / 1000} s con la pestaña visible</span>}
          right={<Segmented<LiveWindowId> label="Ventana operativa" value={windowId} onChange={setWindow}
            options={[{ value: '15m', label: '15 MIN' }, { value: '1h', label: '1 H' }, { value: '24h', label: '24 H' }]} />} />
        {error && !live ? <ErrorState message={error.message} onRetry={onRetry} /> : !live || !data ? <Loading label={data ? 'La fuente operativa no envió un snapshot' : 'Consultando operación actual'} /> : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-[#8B8B8B]">
              <Tag tone={error ? 'red' : 'orange'}>{error ? 'Actualización fallida' : 'Cobertura incompleta'}</Tag>
              <span className="hidden sm:inline">{clientStatus} · {androidMeasured ? 'Android sin reportes de recepción/presentación' : 'Android sin cobertura operativa'}</span>
              <span className="sm:hidden">{coverage?.clientIngestionEnabled === false ? 'Registro cliente apagado' : coverage?.clientIngestionEnabled == null ? 'Registro cliente sin confirmar' : clientUnmeasured ? 'Cliente sin medir' : 'Clientes instrumentados'}</span>
              <span className="font-mono sm:ml-auto" title="Hora del snapshot del servidor">{loading ? 'Consultando…' : `Al ${fmtTimestamp(live.snapshotAt ?? updatedAt)}`}</span>
            </div>
            <div className="grid gap-2 sm:hidden" aria-label="Actividad de lectura por plataforma en móvil">
              {PLATFORMS.map((pf) => {
                const state = operationalCoverage(data, windowId, pf.id);
                return <div key={pf.id} className="min-w-0 rounded-xl border border-white/[0.06] px-3 py-2.5">
                  <div className="mb-2 flex items-baseline justify-between gap-2"><span className="text-[12px] text-[#EDEDED]">{pf.label}</span>
                    <span className="text-[10px] text-[#8B8B8B]">{state === 'unmeasured' ? 'Sin medir' : state === 'partial' ? 'Parcial' : 'Observado'}</span></div>
                  <dl className="m-0 grid grid-cols-5 gap-1.5">
                    {METRICS.map((m) => {
                      const value = operationalValue(data, windowId, pf.id, m.id);
                      return <div key={m.id} className="min-w-0 text-center" title={value == null ? 'Sin dato verificable para esta plataforma y ventana' : `${fmtInt(value)} · ${m.definition}`}>
                        <dt className="h-7 text-[10px] leading-[12px] text-[#8B8B8B]">{m.id === 'rendered' ? 'Visibles' : m.id === 'failed' ? 'Fallos' : m.label}</dt>
                        <dd className={`m-0 font-mono text-[15px] tabular-nums ${value == null ? 'text-[#5C5C5C]' : m.id === 'failed' && value > 0 ? 'text-[#F7A04B]' : 'text-[#EDEDED]'}`}>{value == null ? DASH : fmtCompact(value)}</dd>
                      </div>;
                    })}
                  </dl>
                </div>;
              })}
            </div>
            <div className="hidden overflow-x-auto rounded-xl border border-white/[0.06] sm:block">
              <table className="w-full min-w-[610px] border-collapse text-left text-[12px]" aria-label="Actividad de lectura por plataforma">
                <thead className="bg-white/[0.02] text-[#8B8B8B]">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-normal">Plataforma</th>
                    {METRICS.map((m) => <th key={m.id} scope="col" title={m.definition} className="px-3 py-3 text-right font-normal">{m.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {PLATFORMS.map((pf) => {
                    const state = operationalCoverage(data, windowId, pf.id);
                    return <tr key={pf.id} className="border-t border-white/[0.05]">
                      <th scope="row" className="px-4 py-3 font-normal"><span className="block text-[13px] text-[#EDEDED]">{pf.label}</span>
                        <span className="mt-0.5 block text-[10px] text-[#8B8B8B]">{state === 'unmeasured' ? 'Sin medir' : state === 'partial' ? 'Cobertura parcial' : 'Reportes observados'}</span></th>
                      {METRICS.map((m) => {
                        const value = operationalValue(data, windowId, pf.id, m.id);
                        return <td key={m.id} className={`px-3 py-3 text-right font-mono text-[17px] tabular-nums ${value == null ? 'text-[#5C5C5C]' : m.id === 'failed' && value > 0 ? 'text-[#F7A04B]' : 'text-[#EDEDED]'}`}
                          title={value == null ? 'Sin dato verificable para esta plataforma y ventana' : m.definition}>{value == null ? DASH : fmtInt(value)}</td>;
                      })}
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
            <p className="m-0 mt-3 text-[11px] leading-relaxed text-[#8B8B8B]"><span className="sm:hidden">— sin medir · 0 sin registros. Consulta cada {LIVE_REFRESH_MS / 1000} s.</span><span className="hidden sm:inline">— sin medición verificable · 0 sin registros en la cobertura observada. Los conteos de servidor y cliente pueden corresponder a solicitudes distintas; no forman una tasa de éxito.</span></p>
            {live.client?.health?.status === 'failure_observed' && <div className="mt-3"><Note tag="Telemetría">Falló el registro de señales del cliente; los totales pueden estar incompletos. Revisa el diagnóstico.</Note></div>}
            <details className="mt-4 border-t border-white/[0.06] pt-3 text-[12px] text-[#8B8B8B]">
              <summary className="cursor-pointer">Diagnóstico, versiones y límites de medición</summary>
              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                {PLATFORMS.map(({ id: pf, label }) => {
                  const t = live.platforms[pf];
                  const serverCoverage = operationalServerCoverage(data, pf);
                  const outcomesMeasured = !!serverCoverage?.outcomeCoverageSince;
                  const activityMeasured = !!serverCoverage?.eventCoverageSince || !!serverCoverage?.readConsumptionCoverageSince;
                  return <div key={pf} className="min-w-0 rounded-xl border border-white/[0.06] p-4">
                    <div className="mb-2 text-[13px] text-[#EDEDED]">{label} · servidor</div>
                    <Row label="Instalaciones con actividad" value={metric(pf, 'observedDevices', activityMeasured)} hint={`${metric(pf, 'observedAccounts', activityMeasured)} cuentas; no son personas conectadas`} />
                    <Row label="Interrumpidas" value={metric(pf, 'abandoned', outcomesMeasured)} hint="conexión cerrada antes del final registrado" />
                    <Row label="Muros de registro / pago / nivel" value={`${metric(pf, 'wallSignin', outcomesMeasured)} / ${metric(pf, 'wallPaywall', outcomesMeasured)} / ${metric(pf, 'wallLevel', outcomesMeasured)}`} />
                    <Row label="Solicitudes bloqueadas" value={metric(pf, 'blocked', outcomesMeasured)} />
                    {snapshot?.since && outcomesMeasured && Object.entries(snapshot?.[pf]?.blocked ?? {}).filter(([, n]) => n > 0).map(([reason, n]) => <Row key={reason} label={reason} value={fmtInt(n)} />)}
                    <p className="m-0 mt-3 text-[11px]">Último evento {fmtTimestamp(t?.latestEventAt)} · última emisión {fmtTimestamp(t?.latestCompletedAt)}</p>
                    <p className="m-0 mt-2 text-[11px]">Cobertura de resultados desde {fmtTimestamp(serverCoverage?.outcomeCoverageSince)}</p>
                  </div>;
                })}
              </div>
              <ClientOperationalPanel client={live.client} windowId={windowId} missing={data.missing} />
              {live.providers.length > 0 && <div className="mt-4 border-t border-white/[0.06] pt-3">
                <div className="mb-2 text-[12px] text-[#EDEDED]">IA · últimas 24 h · ledger registrado, incluye al equipo</div>
                {live.providers.map((p) => <Row key={`${p.provider}|${p.model}`} label={`${p.provider} · ${p.model}`}
                  value={`${p.calls24h == null ? DASH : fmtInt(p.calls24h)} llamadas · ${p.failures24h == null ? DASH : fmtInt(p.failures24h)} fallos · ${p.usd24h == null ? DASH : fmtUsd(p.usd24h, true)}`}
                  hint={`Latencia proveedor p50 / p95: ${p.callLatencyP50Ms == null ? DASH : `${(p.callLatencyP50Ms / 1000).toFixed(1)} s`} / ${p.callLatencyP95Ms == null ? DASH : `${(p.callLatencyP95Ms / 1000).toFixed(1)} s`}; no es tiempo hasta renderizar. Última llamada ${fmtTimestamp(p.lastCallAt)}.`} />)}
              </div>}
              <p className="m-0 mt-4 text-[11px] leading-relaxed">Resultados observados desde {fmtTimestamp(coverage?.outcomeCoverageSince)}. Los reportes del cliente solo cubren versiones que los envían; la presentación no prueba lectura humana. No se mide crash nativo ni presencia de todos los usuarios.</p>
              <p className="m-0 mt-2 text-[11px]">— sin medición verificable · 0 sin registros en la cobertura observada. Los conteos de servidor y cliente pueden corresponder a solicitudes distintas; no forman una tasa de éxito.</p>
              <p className="m-0 mt-2 text-[11px]">{live.includeInternal ? 'Incluye actividad del equipo.' : data.internalMarkFailed ? 'Exclusión del equipo sin verificar para esta carga.' : 'Actividad del equipo excluida.'} El ledger de IA incluye al equipo.</p>
            </details>
          </>
        )}
      </Card>
      {error && live && <div className="mt-3"><StaleBanner error={error} onRetry={onRetry} /></div>}
    </section>
  );
}
