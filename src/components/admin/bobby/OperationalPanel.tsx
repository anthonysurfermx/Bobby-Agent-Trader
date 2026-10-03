import { useState } from 'react';
import { isMissing, type AdminError, type AdminLiveResponse, type LiveWindowId } from '@/lib/admin-client';
import { Card, CardHead, ErrorState, Loading, Note, Row, Segmented, StaleBanner, Tag } from './ui';
import { DASH, fmtInt, fmtTimestamp, fmtUsd } from './format';
import { CORE_STALE_MS, sourceMetaForError } from './live';
import SourceFreshness from './SourceFreshness';
import ClientOperationalPanel from './ClientOperationalPanel';

export default function OperationalPanel({ data, error, loading, updatedAt, onRetry }: {
  data: AdminLiveResponse | null; error: AdminError | null; loading: boolean; updatedAt: string | null; onRetry: () => void;
}) {
  const [windowId, setWindow] = useState<LiveWindowId>('15m');
  const live = data?.live;
  const snapshot = live?.windows[windowId];
  const coverage = live?.coverage;
  const metric = (pf: 'ios' | 'web', field: keyof typeof snapshot.ios, measured = true) => {
    if (!snapshot || !measured || isMissing(data?.missing, `windows.${windowId}.${pf}.${field}`)) return DASH;
    const value = snapshot[pf][field];
    return typeof value === 'number' ? fmtInt(value) : fmtInt(Object.values(value).reduce((sum, n) => sum + n, 0));
  };
  const outcomesMeasured = !!coverage?.outcomeCoverageSince;
  const consumptionMeasured = !!coverage?.readConsumptionCoverageSince;
  const activityMeasured = !!coverage?.eventCoverageSince || consumptionMeasured;
  const partial = !!snapshot?.since && [coverage?.outcomeCoverageSince, coverage?.eventCoverageSince, coverage?.readConsumptionCoverageSince]
    .some((since) => since && Date.parse(since) > Date.parse(snapshot.since!));
  return (
    <section aria-label="Operación actual" className="mb-5 flex flex-col gap-3">
      <Card>
        <CardHead title="Ahora · app y web" sub="Actividad que Bobby registró en el servidor. Actualización cada 30 s con esta pestaña visible."
          right={<Segmented<LiveWindowId> label="Ventana operativa" value={windowId} onChange={setWindow}
            options={[{ value: '15m', label: '15 MIN' }, { value: '1h', label: '1 H' }, { value: '24h', label: '24 H' }]} />} />
        {error && !live ? <ErrorState message={error.message} onRetry={onRetry} /> : !live ? <Loading label={data ? 'La fuente operativa no envió un snapshot' : 'Consultando operación actual'} /> : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[11px] text-[#8B8B8B]">
              <span>Al {fmtTimestamp(live.snapshotAt)}</span>
              <Tag tone={live.includeInternal ? 'orange' : data.internalMarkFailed ? 'red' : 'neutral'}>
                {live.includeInternal ? 'Con equipo' : data.internalMarkFailed ? 'Sin equipo · sin verificar' : 'Sin equipo'}
              </Tag>
              {loading && <span>Actualizando…</span>}
              {partial && <Tag tone="orange">Ventana con cobertura parcial</Tag>}
            </div>
            <ClientOperationalPanel client={live.client} windowId={windowId} missing={data.missing} />
            <div className="grid gap-3 lg:grid-cols-2">
              {(['ios', 'web'] as const).map((pf) => {
                const t = live.platforms[pf];
                const w = snapshot[pf];
                return <div key={pf} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="mb-2 text-[14px] font-medium">{pf === 'ios' ? 'App iOS' : 'Web Bobby'}</div>
                  <Row label="Dispositivos con actividad observada" value={metric(pf, 'observedDevices', activityMeasured)} hint={`${metric(pf, 'observedAccounts', activityMeasured)} cuentas observadas; no son usuarios conectados`} />
                  <Row label="Respuestas emitidas por servidor" value={metric(pf, 'completed', outcomesMeasured)} />
                  <Row label="Fallos registrados en servidor" value={metric(pf, 'failed', outcomesMeasured)} />
                  <Row label="Interrumpidas" value={metric(pf, 'abandoned', outcomesMeasured)} hint="La conexión se cerró antes del final registrado" />
                  <Row label="Lecturas descontadas del cupo" value={metric(pf, 'consumed', consumptionMeasured)} hint="El consumo no confirma una respuesta recibida" />
                  <Row label="Muros de registro / pago / nivel" value={`${metric(pf, 'wallSignin', outcomesMeasured)} / ${metric(pf, 'wallPaywall', outcomesMeasured)} / ${metric(pf, 'wallLevel', outcomesMeasured)}`} />
                  <Row label="Solicitudes bloqueadas" value={metric(pf, 'blocked', outcomesMeasured)} />
                  {outcomesMeasured && Object.entries(w.blocked).filter(([, n]) => n > 0).map(([reason, n]) => <Row key={reason} label={reason} value={fmtInt(n)} />)}
                  <div className="mt-3 border-t border-white/[0.05] pt-2 text-[11px] text-[#8B8B8B]">
                    <p className="m-0">Último evento: {fmtTimestamp(t.latestEventAt)}</p>
                    <p className="m-0 mt-1">Última respuesta emitida: {fmtTimestamp(t.latestCompletedAt)}</p>
                  </div>
                  {!outcomesMeasured && <p className="m-0 mt-3 text-[11px] text-amber-400">Sin cobertura observada de resultados. «—» indica que no se puede afirmar cero actividad.</p>}
                </div>;
              })}
            </div>
            {live.providers.length > 0 && <div className="mt-4 border-t border-white/[0.06] pt-3">
              <div className="mb-2 text-[12px] text-[#8B8B8B]">IA · últimas 24 h · ledger registrado, incluye al equipo</div>
              {live.providers.map((p) => <Row key={`${p.provider}|${p.model}`} label={`${p.provider} · ${p.model}`}
                value={`${fmtInt(p.calls24h)} llamadas · ${fmtInt(p.failures24h)} fallos · ${fmtUsd(p.usd24h, true)}`}
                hint={`Latencia de llamada al proveedor p50 / p95: ${p.callLatencyP50Ms == null ? DASH : `${(p.callLatencyP50Ms / 1000).toFixed(1)} s`} / ${p.callLatencyP95Ms == null ? DASH : `${(p.callLatencyP95Ms / 1000).toFixed(1)} s`}; no es tiempo total hasta renderizar. Última llamada ${fmtTimestamp(p.lastCallAt)}.`} />)}
            </div>}
            <div className="mt-4"><Note tag="Cobertura">
              Respuestas emitidas y fallos son registros del servidor; no se confirma que se mostraron en el teléfono o navegador.
              Los reportes del cliente se muestran aparte para las versiones que los envían. No se mide crash nativo ni presencia de todos los usuarios. Cero registros no demuestra que toda la app funciona.
              {coverage.outcomeCoverageSince ? ` Resultados observados desde ${fmtTimestamp(coverage.outcomeCoverageSince)}.` : ''}
            </Note></div>
          </>
        )}
      </Card>
      {error && live && <StaleBanner error={error} onRetry={onRetry} />}
      <SourceFreshness meta={sourceMetaForError(data?.meta, error?.message)} maxAgeMs={CORE_STALE_MS} label="Fuente operativa" fallbackAt={updatedAt} />
    </section>
  );
}
