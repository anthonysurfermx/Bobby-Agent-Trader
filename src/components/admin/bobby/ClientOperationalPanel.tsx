import { isMissing, type ClientLive, type LiveWindowId } from '@/lib/admin-client';
import { DASH, fmtInt, fmtTimestamp } from './format';
import { Note, Row, Tag } from './ui';

export default function ClientOperationalPanel({ client, windowId, missing }: { client: ClientLive | null; windowId: LiveWindowId; missing: string[] }) {
  if (!client) return <div className="mt-4"><Note tag="Clientes">Esta fuente no confirma reportes de presencia, recepción ni visualización. Las versiones anteriores siguen sin medición.</Note></div>;
  const health = client.health;
  const error = ({ auth_unavailable: 'no se pudo verificar la cuenta', storage_unavailable: 'no se pudo guardar el reporte', request_budget_exhausted: 'se agotó el tiempo del registro' } as Record<string, string>)[health?.error ?? ''] ?? health?.error;
  return <div className="mt-4 border-t border-white/[0.06] pt-4">
    <div className="mb-2 text-[14px] font-medium">Lo que reportan los clientes instrumentados</div>
    <p className="m-0 mb-3 text-[11px] text-[#8B8B8B]">Señales propias de app/navegador; no prueban personas conectadas ni que leyeron una respuesta. Ventanas por hora de recepción en servidor.</p>
    {health?.status === 'failure_observed' && <Note tag="Error de telemetría">Falló el registro {fmtTimestamp(health.lastErrorAt)}: {error ?? 'error de fuente'}. Los totales pueden omitir señales del cliente.</Note>}
    {health?.status === 'recovered' && <Note tag="Telemetría recuperada">Se confirmó un nuevo reporte {fmtTimestamp(health.lastReportAt)}, después del fallo {fmtTimestamp(health.lastErrorAt)}. Las señales perdidas durante el fallo pueden seguir faltando.</Note>}
    {(!health || health.status === 'unknown') && <Note tag="Estado de registro sin confirmar">No hay una comprobación reciente del estado de esta fuente. Esto no confirma que esté funcionando ni que haya fallado.</Note>}
    <div className="grid gap-3 lg:grid-cols-2">
      {(['ios', 'web'] as const).map((pf) => {
        const p = client.platforms[pf], cov = p.coverage, w = p.windows[windowId], path = `client.platforms.${pf}`;
        const value = (key: keyof typeof w, measured: boolean) => measured && !isMissing(missing, `${path}.windows.${windowId}.${key}`) ? fmtInt(w[key] as number) : DASH;
        const presence = (key: keyof typeof p.presence) => cov.rolloutSince && p.presence.latestReportAt && !isMissing(missing, `${path}.presence.${key}`) ? fmtInt(p.presence[key] as number) : DASH;
        const partial = !!w.since && [cov.rolloutSince, cov.readStartedSince, cov.readReceivedSince, cov.readRenderedSince].some((s) => s && Date.parse(s) > Date.parse(w.since!));
        return <div key={pf} className="min-w-0 rounded-xl border border-white/[0.06] p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2"><span>{pf === 'ios' ? 'App iOS' : 'Web Bobby'}</span><Tag tone={cov.rolloutSince ? 'neutral' : 'orange'}>{cov.rolloutSince ? 'Solo versiones instrumentadas' : 'Sin cobertura observada'}</Tag></div>
          <Row label={`Instalaciones que reportan primer plano · ${client.presenceTtlSeconds ?? '—'} s`} value={presence('reportedForegroundInstalls')} hint={`${presence('reportedForegroundAccounts')} cuentas reportadas; la señal vence si no vuelve a llegar`} />
          <Row label="Inicios de lectura reportados" value={value('started', !!cov.readStartedSince)} />
          <Row label="Respuestas recibidas · reportadas" value={value('received', !!cov.readReceivedSince)} hint="Comprobante de respuesta emitido por el servidor, confirmado por el cliente" />
          <Row label="Respuestas presentadas · reportadas" value={value('rendered', !!cov.readRenderedSince)} hint="Confirmación tras un frame visible; no confirma lectura humana" />
          {pf === 'ios' && <Row label="Terminaciones WebView · reportadas" value={value('webviewTerminations', !!cov.webviewTerminationSince)} hint="Proceso web terminado; no es un crash nativo de la app" />}
          <p className="m-0 mt-2 text-[11px] text-[#8B8B8B]">Última señal {fmtTimestamp(p.latest.eventAt)} · última presentación {fmtTimestamp(p.latest.renderedAt)}</p>
          {partial && <p className="m-0 mt-2 text-[11px] text-amber-400">Cobertura parcial de esta ventana; los reportes no cubren todas las versiones ni instalaciones.</p>}
          <details className="mt-3 text-[11px] text-[#8B8B8B]"><summary className="cursor-pointer">Versiones/builds que enviaron reportes</summary>
            {p.builds.length ? p.builds.map((b, index) => <div key={`${b.appVersion}|${b.appBuild}|${index}`} className="mt-2 break-words border-t border-white/[0.05] pt-2">
              <div>{!b.appVersion || b.appVersion === 'unknown' ? 'Versión no informada' : b.appVersion} · {!b.appBuild || b.appBuild === 'unknown' ? 'build no informado' : `build ${b.appBuild}`}</div>
              <div>{b.reportedInstalls24h == null ? DASH : fmtInt(b.reportedInstalls24h)} instalaciones reportaron en 24 h · última señal {fmtTimestamp(b.latestReportAt)}</div>
              <div>Inicio / recepción / presentación observados desde {fmtTimestamp(b.readStartedSince)} / {fmtTimestamp(b.readReceivedSince)} / {fmtTimestamp(b.readRenderedSince)}</div>
            </div>) : <p>Sin versiones observadas.</p>}
          </details>
        </div>;
      })}
    </div>
    <div className="mt-3"><Note tag="Límites de cobertura">Los builds anteriores sin emisor siguen sin medir. Ausencia de reporte no equivale a fallo ni a cero usuarios. No se mide crash nativo ni una tasa de éxito de toda la app.</Note></div>
  </div>;
}
