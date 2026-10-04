import type { AdminMeta } from '@/lib/admin-client';
import { fmtDateTime, fmtRelative, fmtTimestamp } from './format';
import { sourceNow, sourceState } from './live';

const NAMES: Record<string, string> = { overview: 'Métricas Bobby', growth: 'Cohortes', networks: 'Filtro de equipo',
  appStore: 'App Store', revenuecat: 'RevenueCat', searchConsole: 'Google Search', health: 'Integraciones Bobby',
  live: 'Operación Bobby', clientLive: 'Reportes del cliente', teamExclusion: 'Filtro de equipo', lifecycle: 'Economía', audience: 'Audiencia' };
const LABELS: Record<string, string> = { fresh: 'Actualizado', stale: 'Desactualizado', unknown: 'Sin hora de fuente',
  error: 'Error', partial: 'Parcial', not_configured: 'Sin configurar', deferred: 'Pendiente de consulta' };
const STATE_PRIORITY = ['error', 'stale', 'partial', 'not_configured', 'deferred', 'unknown', 'fresh'];

export default function SourceFreshness({ meta, maxAgeMs, label, fallbackAt }: {
  meta: AdminMeta | null | undefined; maxAgeMs: number; label: string; fallbackAt?: string | null;
}) {
  const sources = Object.entries(meta?.sources ?? {});
  const now = sourceNow(meta);
  // Core and external providers are fetched separately. Deferred entries describe this request's scope.
  const queriedSources = sources.filter(([, source]) => source.status !== 'deferred');
  const states = (queriedSources.length ? queriedSources : sources).map(([, source]) => sourceState(source, maxAgeMs, now));
  const state = STATE_PRIORITY.find((s) => states.includes(s as typeof states[number])) ?? 'unknown';
  const tone = state === 'fresh' ? 'text-green-400' : state === 'error' ? 'text-red-400' : 'text-amber-400';
  return (
    <details className="min-w-0 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] text-[#8B8B8B]">
      <summary className="cursor-pointer leading-relaxed">
        <span className="text-[#BDBDBD]">{label}</span> · <span className={tone}>{LABELS[state]}</span>
        {meta?.generatedAt && <span className="ml-2 font-mono text-[#8B8B8B]" title="Hora de generación de la respuesta; cada fuente conserva su propia fecha">{fmtTimestamp(meta.generatedAt)}</span>}
      </summary>
      <p className="m-0 mt-3 font-mono text-[10px]">{meta?.generatedAt ? `Snapshot ${fmtDateTime(meta.generatedAt)}` : fallbackAt ? `Respuesta ${fmtDateTime(fallbackAt)} · sin hora de fuente` : 'Sin consulta confirmada'}
        {meta?.durationMs != null ? ` · ${(meta.durationMs / 1000).toFixed(1)} s de consulta` : ''}{meta?.partial ? ' · cobertura parcial' : ''}</p>
      <ul className="m-0 mt-2 grid list-none gap-2 p-0">
        {sources.map(([key, source]) => {
          const status = sourceState(source, maxAgeMs, now);
          return <li key={key} className="rounded-lg border border-white/[0.05] p-2">
            <div className="flex flex-wrap justify-between gap-2"><span>{NAMES[key] ?? key}</span>
              <span className={status === 'fresh' ? 'text-green-400' : status === 'error' ? 'text-red-400' : 'text-amber-400'}>{status === 'deferred' && queriedSources.length ? 'Consulta separada' : LABELS[status]}</span></div>
            <div className="mt-1 font-mono" title={source.fetchedAt ? fmtDateTime(source.fetchedAt) : undefined}>
              {source.fetchedAt ? `Dato consultado ${fmtRelative(source.fetchedAt, now)} · ${fmtDateTime(source.fetchedAt)}` : 'Sin fecha confirmada'}
              {source.coveredTo ? ` · publicado hasta ${source.coveredTo}` : ''}
              {source.missingDays?.length ? ` · faltan ${source.missingDays.length} días` : ''}
              {source.cacheTtlMs ? ` · caché hasta ${Math.round(source.cacheTtlMs / 60_000)} min` : ''}
              {source.oldestReportAt ? ` · reporte más antiguo guardado ${fmtDateTime(source.oldestReportAt)}` : ''}
            </div>
            {source.error && <div className="mt-1 break-words text-red-300">{source.error}{source.fetchedAt ? ' · se conserva el último dato observado' : ''}</div>}
          </li>;
        })}
      </ul>
      {!sources.length && <p className="m-0 mt-2">La fuente no envió metadata de frescura. La hora de respuesta no prueba cuándo ocurrió la actividad.</p>}
    </details>
  );
}
