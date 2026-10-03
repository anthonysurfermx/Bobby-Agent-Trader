import type { AdminMeta } from '@/lib/admin-client';
import { fmtDateTime, fmtRelative, fmtTimestamp } from './format';
import { sourceNow, sourceState } from './live';

const NAMES: Record<string, string> = { overview: 'Métricas Bobby', growth: 'Cohortes', networks: 'Filtro de equipo',
  appStore: 'App Store', revenuecat: 'RevenueCat', searchConsole: 'Google Search', health: 'Integraciones Bobby',
  live: 'Operación Bobby', lifecycle: 'Economía', audience: 'Audiencia' };
const LABELS: Record<string, string> = { fresh: 'Actualizado', stale: 'Desactualizado', unknown: 'Sin hora de fuente',
  error: 'Error', partial: 'Parcial', not_configured: 'Sin configurar', deferred: 'Pendiente de consulta' };

export default function SourceFreshness({ meta, maxAgeMs, label, fallbackAt }: {
  meta: AdminMeta | null | undefined; maxAgeMs: number; label: string; fallbackAt?: string | null;
}) {
  const sources = Object.entries(meta?.sources ?? {}).filter(([, source]) => source.status !== 'deferred');
  const now = sourceNow(meta);
  const states = [...new Set(sources.map(([, source]) => LABELS[sourceState(source, maxAgeMs, now)]))];
  return (
    <details className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] text-[#8B8B8B]">
      <summary className="cursor-pointer font-mono leading-relaxed">
        {label} · {meta?.generatedAt ? `snapshot ${fmtTimestamp(meta.generatedAt)}` : fallbackAt ? `respuesta ${fmtTimestamp(fallbackAt)} · sin hora de fuente` : 'sin consulta confirmada'}
        {states.length ? ` · ${states.join(' / ')}` : ''}
        {meta?.durationMs != null ? ` · ${(meta.durationMs / 1000).toFixed(1)} s` : ''}
        {meta?.partial ? ' · cobertura parcial' : ''}
      </summary>
      <ul className="m-0 mt-2 grid list-none gap-2 p-0 sm:grid-cols-2">
        {sources.map(([key, source]) => {
          const state = sourceState(source, maxAgeMs, now);
          return <li key={key} className="rounded-lg border border-white/[0.05] p-2">
            <div className="flex flex-wrap justify-between gap-2"><span>{NAMES[key] ?? key}</span>
              <span className={state === 'fresh' ? 'text-green-400' : state === 'error' ? 'text-red-400' : 'text-amber-400'}>{LABELS[state]}</span></div>
            <div className="mt-1 font-mono" title={source.fetchedAt ? fmtDateTime(source.fetchedAt) : undefined}>
              {source.fetchedAt ? `Dato consultado ${fmtRelative(source.fetchedAt, now)} · ${fmtDateTime(source.fetchedAt)}` : 'Sin fecha confirmada'}
              {source.coveredTo ? ` · publicado hasta ${source.coveredTo}` : ''}
              {source.missingDays?.length ? ` · faltan ${source.missingDays.length} días` : ''}
            </div>
            {source.error && <div className="mt-1 break-words text-red-300">{source.error}{source.fetchedAt ? ' · se conserva el último dato observado' : ''}</div>}
          </li>;
        })}
      </ul>
      {!sources.length && <p className="m-0 mt-2">La fuente no envió metadata de frescura. La hora de respuesta no prueba cuándo ocurrió la actividad.</p>}
    </details>
  );
}
