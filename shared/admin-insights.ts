// ============================================================
// "Dónde mejorar": the owner dashboard's diagnosis, computed from the same figures it shows (bobby_admin_overview,
// bobby_admin_growth, integrations, Search Console, App Store). Deterministic rules, no model: every insight
// carries the numbers it came from and the sample behind them, and says what to do next. Thresholds below are
// configuration, not data; an insight below its minimum sample is either skipped or says "muestra pequeña", and a
// rate over fewer than MIN_RATE_SAMPLE is shown as "x de n", never as a percentage (share()).
// ============================================================

export type InsightLevel = 'critical' | 'warn' | 'opportunity' | 'info';
export type InsightArea = 'operacion' | 'medicion' | 'adquisicion' | 'activacion' | 'conversion' | 'retencion' | 'monetizacion';
export interface Insight {
  id: string;
  level: InsightLevel;
  area: InsightArea;
  title: string;
  detail: string;
  action: string;
  /** The figures behind it, as shown elsewhere on the dashboard. */
  evidence: string[];
  /** People / installs / runs behind a rate; null when it is not a rate. */
  sample: number | null;
  /** Where the owner can look (a dashboard tab id). */
  tab: 'resumen' | 'funnel' | 'audiencia' | 'usuarios' | 'membresias' | 'ia' | 'integraciones';
  impact: number;
}

const MIN_RATE_SAMPLE = 5;     // below this a percentage is noise
const SMALL_SAMPLE = 20;       // below this a percentage is flagged as a small sample
const LOW_TRAFFIC = 30;        // outside web visitors per period under which traffic is the bottleneck

type Obj = Record<string, unknown>;
const o = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const a = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const n = (v: unknown): number => { const x = Number(v); return v == null || v === '' || !Number.isFinite(x) ? 0 : x; };
const s = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const measured = (v: unknown) => v != null && v !== '' && Number.isFinite(Number(v));
const pct = (num: number, den: number) => (den > 0 ? `${Math.round((num / den) * 100)}%` : '—');
const int = (v: number) => new Intl.NumberFormat('es-MX').format(Math.round(v));
/** Every displayed rate: a percentage only from MIN_RATE_SAMPLE up; below that the counts themselves. */
const share = (num: number, den: number) => (den >= MIN_RATE_SAMPLE ? pct(num, den) : `${int(num)} de ${int(den)}`);
/** "1 descarga" / "3 descargas": every counted noun agrees with its number. */
const count = (v: number, one: string, many: string) => `${int(v)} ${Math.round(v) === 1 ? one : many}`;
const usd = (v: number) => `$${v < 1 ? v.toFixed(3) : v.toFixed(2)}`;
const day = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
};
const dateOnly = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' });
};
const small = (sample: number) => (sample < SMALL_SAMPLE ? ` (muestra pequeña: n=${sample})` : ` (n=${sample})`);
const COUNTRY = (cc: string) => { try { return new Intl.DisplayNames(['es'], { type: 'region' }).of(cc) ?? cc; } catch { return cc; } };
const PROVIDER: Record<string, string> = { openai: 'OpenAI', anthropic: 'Anthropic' };

export interface InsightInput {
  days: number;
  overview: unknown;
  growth: unknown;
  integrations: unknown;
  searchConsole: unknown;
  /** bobby_admin_internal_networks: team networks and the installs they leave out. */
  networks?: unknown;
  /** The figures include the team's own traffic (the header switch). Absent = left out, the default. */
  includeInternal?: boolean;
  now?: number;
}

export function buildInsights(input: InsightInput): Insight[] {
  const now = input.now ?? Date.now();
  const ov = o(input.overview), gr = o(input.growth), ig = o(input.integrations), sc = o(input.searchConsole);
  const health = o(ig.health), people = o(gr.people), outcomes = o(gr.outcomes), acq = o(gr.acquisition), cov = o(gr.coverage);
  const web = o(o(gr.cohorts).web), ios = o(o(gr.cohorts).ios), android = o(o(gr.cohorts).android);
  const llm = o(ov.llm), providers = o(llm.providers);
  const out: Insight[] = [];
  const add = (i: Insight) => out.push(i);
  const period = input.days;

  // ---------------------------------------------------------------- operación
  for (const p of ['anthropic', 'openai'] as const) {
    const pr = o(providers[p]);
    // Only a positive top-up or a later successful call (or probe) of this provider proves the credit is back; a
    // balance mark of any amount never does (a server older than r2 reported it as lastTopup). Plain failures without
    // an alert go to the failing rule below.
    const balanceAt = s(o(pr.balanceMark).at);
    const alertAt = s(pr.lastCreditAlert), topupAt = s(pr.lastTopup) !== balanceAt ? s(pr.lastTopup) : null, lastOk = s(pr.lastOk);
    const alert = o(pr.creditAlert);
    const alertLive = alertAt && (!topupAt || new Date(topupAt) <= new Date(alertAt)) && (!lastOk || new Date(lastOk) <= new Date(alertAt));
    const lastFail = o(pr.lastFailure);
    if (alertLive) {
      add({
        id: `credit-${p}`, level: 'critical', area: 'operacion', tab: 'ia', impact: 100, sample: null,
        title: `${PROVIDER[p]} sin crédito desde ${day(alertAt)}`,
        detail: `La alerta de crédito se disparó${s(alert.endpoint) ? ` en ${s(alert.endpoint)}` : ''}${s(alert.code) ? ` (${s(alert.code)})` : ''} y no hay una recarga registrada después.${lastOk ? ` Última llamada correcta: ${day(lastOk)}.` : ''} No hay recuperación registrada de este proveedor; comprueba las rutas que lo usan y su respaldo.`,
        action: `Recarga crédito en ${PROVIDER[p]} y regístralo en IA → Registrar recarga para que el panel lo sepa.`,
        evidence: [`alerta ${day(alertAt)}`, `fallos 24h: ${int(n(pr.failures24h))}/${int(n(pr.calls24h))}`, ...(s(lastFail.stop) ? [`último error: ${s(lastFail.stop)}`] : [])],
      });
    } else if (n(pr.calls24h) >= 3 && n(pr.failures24h) / n(pr.calls24h) >= 0.5) {
      add({
        id: `failing-${p}`, level: 'critical', area: 'operacion', tab: 'ia', impact: 95, sample: n(pr.calls24h),
        title: `${PROVIDER[p]} está fallando en las últimas 24 h (con error: ${share(n(pr.failures24h), n(pr.calls24h))})`,
        detail: `${int(n(pr.failures24h))} de ${int(n(pr.calls24h))} llamadas fallaron en las últimas 24 horas${s(lastFail.stop) ? `; el último error fue ${s(lastFail.stop)}` : ''}.`,
        action: 'Prueba el proveedor desde IA → Probar y revisa crédito y límites de tasa.',
        evidence: [`${int(n(pr.failures24h))}/${int(n(pr.calls24h))} fallos 24h`],
      });
    }
  }

  const runs = o(llm.deskRuns);
  // Runs the reader abandoned before the CIO are counted apart by the server (a 'left' ledger marker): never failures.
  const totalRuns = n(runs.runs), finished = n(runs.finished), failedRuns = totalRuns - finished, abandonedRuns = n(runs.abandoned);
  if (totalRuns >= MIN_RATE_SAMPLE && failedRuns / totalRuns >= 0.2) {
    // A failure wave is over only when a desk analysis finished (the CIO answered, same ledger-batch definition as
    // `finished`) after the last one that did not. A provider answering elsewhere (a probe, another surface) is that
    // provider's health, not a delivered read; the last 48 h are evidence only, never a reason to call it healed.
    const lastFinishedAt = s(runs.lastFinishedAt), lastUnfinishedAt = s(runs.lastUnfinishedAt);
    const healed = lastFinishedAt != null && (lastUnfinishedAt == null || Date.parse(lastFinishedAt) > Date.parse(lastUnfinishedAt));
    const cutoff = new Date(now - 86_400_000).toISOString().slice(0, 10);
    const recent = a(runs.byDay).map(o).filter((d) => String(d.day) >= cutoff);
    const recentRuns = recent.reduce((t, d) => t + n(d.runs), 0), recentDone = recent.reduce((t, d) => t + n(d.finished), 0);
    const failedDays = [...new Set(a(runs.byDay).map(o).filter((d) => n(d.finished) < n(d.runs)).map((d) => String(d.day)))].sort();
    add({
      id: 'desk-failures', level: healed ? 'info' : failedRuns / totalRuns >= 0.4 ? 'critical' : 'warn', area: 'operacion', tab: 'ia', impact: healed ? 40 : 90, sample: totalRuns,
      title: healed
        ? `${int(failedRuns)} de ${int(totalRuns)} análisis del desk no terminaron en el periodo; el último terminó bien (${day(lastFinishedAt)}), después de la última falla (${day(lastUnfinishedAt)})`
        : `${int(failedRuns)} de ${int(totalRuns)} análisis del desk no terminaron (${share(failedRuns, totalRuns)})`,
      detail: `${healed ? `Las fallas se concentran en ${failedDays.map((d) => dateOnly(d)).join(', ')}; después de la última, se registró una respuesta del CIO. Eso no confirma su visualización en la app. ` : 'Estos lotes no tienen una respuesta del CIO registrada; el ledger no prueba lo que recibió el cliente. '}Se cuenta un análisis por lote del ledger; terminado = el CIO respondió${abandonedRuns ? `; ${count(abandonedRuns, 'análisis que el lector abandonó no cuenta', 'análisis que el lector abandonó no cuentan')} como falla` : ''}.${small(totalRuns)}`,
      action: healed ? 'Se registró una respuesta posterior; comprueba entrega al cliente y respaldo antes de declarar recuperación completa.' : 'Abre IA para ver qué proveedor y qué rol fallan; con crédito y respaldo sanos esto debería bajar de 5%.',
      evidence: [`análisis ${period}d: ${int(totalRuns)}`, `terminados: ${int(finished)}`, `último terminado: ${day(lastFinishedAt)}`, `último sin terminar: ${day(lastUnfinishedAt)}`,
        ...(recentRuns ? [`últimas 48 h: ${int(recentDone)}/${int(recentRuns)}`] : []), ...(abandonedRuns ? [`abandonados por el lector: ${int(abandonedRuns)}`] : [])],
    });
  }

  const blocked = o(outcomes.blocked);
  const blockedTotal = Object.values(blocked).reduce<number>((t, v) => t + n(v), 0);
  if (blockedTotal > 0) {
    const parts = Object.entries(blocked).map(([k, v]) => `${({ daily_limit: 'límite diario', budget_paused: 'presupuesto en pausa', premium_paused: 'Profundo/Máximo en pausa', unavailable: 'desk no disponible',
      no_provider_keys: 'sin llaves de IA', no_address: 'sin dirección del cliente', level_unavailable: 'medidor de nivel no disponible' } as Record<string, string>)[k] ?? k}: ${int(n(v))}`);
    add({
      id: 'desk-blocked', level: 'warn', area: 'operacion', tab: 'ia', impact: 80, sample: blockedTotal,
      title: `${count(blockedTotal, 'lectura rechazada', 'lecturas rechazadas')} por el propio servidor`,
      detail: `Gente que quiso leer y Bobby dijo que no por sus propios topes o su configuración (${parts.join(' · ')}).`,
      action: 'Revisa los topes de gasto (IA) y la cuota diaria; un tope que corta usuarios reales es crecimiento perdido.',
      evidence: parts,
    });
  }

  const caps = o(ig.llmCaps), guard = o(ig.llmGuard);
  if (n(caps.monthUsd) > 0 && n(guard.monthUsd) / n(caps.monthUsd) >= 0.8) {
    add({
      id: 'budget-cap', level: 'warn', area: 'operacion', tab: 'ia', impact: 75, sample: null,
      title: `El gasto del desk va en ${pct(n(guard.monthUsd), n(caps.monthUsd))} del tope mensual`,
      detail: `${usd(n(guard.monthUsd))} de ${usd(n(caps.monthUsd))} este mes calendario (UTC). Al llegar al tope el desk se pausa para todos.`,
      action: 'Sube el tope (BOBBY_LLM_MONTHLY_CAP_USD) o baja el costo por lectura antes de que corte usuarios.',
      evidence: [`mes: ${usd(n(guard.monthUsd))}`, `tope: ${usd(n(caps.monthUsd))}`],
    });
  }

  // ---------------------------------------------------------------- medición
  const tracking = o(health.tracking);
  const trackErrAt = s(tracking.lastErrorAt);
  if (trackErrAt && now - new Date(trackErrAt).getTime() < 86_400_000) {
    add({
      id: 'tracking-errors', level: 'warn', area: 'medicion', tab: 'integraciones', impact: 70, sample: null,
      title: 'El tracking web perdió eventos en las últimas 24 h',
      detail: `Último fallo al guardar un evento: ${day(trackErrAt)} (${s(tracking.lastError) ?? 'error'}). Las visitas de esas horas faltan en el embudo.`,
      action: 'Revisa los logs de /api/track en Vercel y el estado de la base.',
      evidence: [`último fallo: ${day(trackErrAt)}`],
    });
  }
  const lastVisit = s(tracking.lastEventAt), lastRead = s(tracking.lastReadAt);
  if (!tracking.lastEventError && !tracking.lastReadError && lastRead && (!lastVisit || new Date(lastVisit).getTime() < new Date(lastRead).getTime() - 2 * 86_400_000)) {
    add({
      id: 'tracking-silent', level: 'warn', area: 'medicion', tab: 'integraciones', impact: 65, sample: null,
      title: 'Hay lecturas pero no visitas web registradas',
      detail: `Última visita web: ${day(lastVisit)}; última lectura: ${day(lastRead)}. Si la gente lee por la web y no aparece su visita, el embudo web está ciego.`,
      action: 'Abre bobbyprotocol.xyz en una ventana privada y confirma que llega un evento "visit" (Integraciones → Eventos web).',
      evidence: [`última visita: ${day(lastVisit)}`, `última lectura: ${day(lastRead)}`],
    });
  }

  const store = o(ig.appStore);
  const downloads = n(o(store.totals).downloads);
  // Apple's load can be partial (its time budget, the 90-day read window, the plan's cache-only read): its figures
  // cover the loaded days only and say so. Apple never separates the team's own downloads.
  const appleMissing = store.partial === true ? Math.max(1, new Set([...a(store.missingDays), ...a(store.pendingDays)]).size) : 0;
  const applePartial = appleMissing ? ` (parcial: faltan ${count(appleMissing, 'día', 'días')})` : '';
  const appleTeam = input.includeInternal ? '' : ' Apple cuenta también las descargas del propio equipo (no las separa); las instalaciones de Bobby ya las dejan fuera.';
  // Installs of the same window: observed arrivals plus rebuilt installs first seen in the period.
  const historicalIos = o(o(gr.history).ios).installsInPeriod;
  const iosInstalls = n(ios.arrived) + n(historicalIos);
  if (measured(ios.arrived) && measured(historicalIos) && store.configured && !store.error && downloads >= 3 && downloads > iosInstalls) {
    add({
      id: 'ios-gap', level: 'info', area: 'medicion', tab: 'funnel', impact: 72, sample: downloads,
      title: `Apple: ${count(downloads, 'descarga', 'descargas')}${applePartial}; Bobby: ${count(iosInstalls, 'instalación iOS', 'instalaciones iOS')} observada${iosInstalls === 1 ? '' : 's'}`,
      detail: `Las descargas de Apple y las instalaciones que contactaron el servidor miden pasos y poblaciones diferentes. No hay una unión entre ambas fuentes que permita calcular conversión ni usuarios perdidos. La diferencia puede incluir descargas sin apertura o versiones sin instrumentación.${appleTeam}${applePartial ? ' Las descargas cubren solo los días que Apple alcanzó a cargar.' : ''}${small(downloads)}`,
      action: 'Comprueba la cobertura de la versión distribuida y su primera apertura antes de interpretar la diferencia.',
      evidence: [`descargas Apple ${dateOnly(s(store.coveredFrom))}–${dateOnly(s(store.coveredTo))}: ${int(downloads)}${appleMissing ? ' (parcial)' : ''}`, `instalaciones iOS vistas: ${int(iosInstalls)}`],
    });
  }

  const consumedTotal = n(outcomes.consumedTotal), consumedInternal = n(outcomes.consumedInternal);
  if (consumedTotal >= MIN_RATE_SAMPLE && consumedInternal / consumedTotal >= 0.25) {
    add({
      id: 'internal-share', level: 'info', area: 'medicion', tab: 'usuarios', impact: 40, sample: consumedTotal,
      title: `${share(consumedInternal, consumedTotal)} de las lecturas del periodo fueron del equipo`,
      detail: `${int(consumedInternal)} de ${int(consumedTotal)} lecturas vienen de cuentas, instalaciones o redes internas. ${input.includeInternal ? 'Esta vista las incluye.' : 'Esta vista las excluye.'} Sin ellas quedan ${int(consumedTotal - consumedInternal)} lecturas externas.`,
      action: 'Si alguna cuenta Apple de prueba aún cuenta como externa, márcala en Usuarios → Interno.',
      evidence: [`internas: ${int(consumedInternal)}`, `externas: ${int(consumedTotal - consumedInternal)}`],
    });
  }

  // A team network that leaves out installs or accounts nothing else ties to the team may be catching outside people
  // (the team rule follows install ↔ account pairings from every install seen on a team network).
  for (const net of a(input.networks).map(o).filter((x) => n(x.onlyByNetwork) >= 3 || n(x.accountsOnlyByNetwork) >= 1)) {
    const installsOnly = n(net.onlyByNetwork), accountsOnly = n(net.accountsOnlyByNetwork);
    const left = [installsOnly ? count(installsOnly, 'instalación', 'instalaciones') : '', accountsOnly ? count(accountsOnly, 'cuenta', 'cuentas') : ''].filter(Boolean).join(' y ');
    add({
      id: `network-${String(net.network)}`, level: 'warn', area: 'medicion', tab: 'usuarios', impact: 62, sample: n(net.installs),
      title: `Una red del equipo deja fuera ${left} que nada más liga al equipo`,
      detail: `La red ${String(net.network)}… (agregada al abrir /admin) excluye ${count(n(net.installs), 'instalación', 'instalaciones')}; ${int(installsOnly)} no tienen cuenta, marca ni sesión del equipo, y ${count(accountsOnly, 'cuenta queda', 'cuentas quedan')} fuera solo por estar ligada${accountsOnly === 1 ? '' : 's'} a instalaciones vistas en esa red. En datos móviles o una oficina, una misma IP la pueden compartir varias personas.`,
      action: 'Revisa Usuarios → Tráfico interno → Redes; si no es tu red, quítala.',
      evidence: [`instalaciones fuera: ${int(n(net.installs))}`, `instalaciones solo por la red: ${int(installsOnly)}`, `cuentas solo por la red: ${int(accountsOnly)}`],
    });
  }

  const visits = n(acq.visits), withUtm = n(acq.visitsWithUtm);
  if (visits >= 1 && withUtm === 0) {
    add({
      id: 'utm-missing', level: 'opportunity', area: 'medicion', tab: 'funnel', impact: 60, sample: visits,
      title: 'Ninguna visita trae etiqueta de campaña (utm_source)',
      detail: `${count(visits, 'visita web externa', 'visitas web externas')} en ${period}d y 0 con utm_source: cuando publiques en TikTok, X o con un creador no sabrás cuál trajo gente que lee.`,
      action: 'Usa Funnel → Enlaces con UTM para cada post, bio y anuncio; el embudo por fuente se llena solo.',
      evidence: [`visitas: ${int(visits)}`, `con UTM: 0`, `con referrer: ${int(n(acq.visitsWithReferrer))}`],
    });
  }

  // ---------------------------------------------------------------- adquisición
  const visitors = n(acq.visitors);
  if (measured(acq.visitors) && visitors < LOW_TRAFFIC) {
    add({
      id: 'low-traffic', level: 'opportunity', area: 'adquisicion', tab: 'funnel', impact: 98, sample: visitors,
      title: `Solo ${count(visitors, 'visitante web externo', 'visitantes web externos')} en ${period} días`,
      detail: `La muestra de dispositivos observados es pequeña para explicar la conversión; puede haber tráfico no instrumentado. Usa estas cifras como señal de adquisición.${downloads ? ` En iOS, Apple reporta ${count(downloads, 'descarga', 'descargas')}${applePartial} en el mismo periodo${input.includeInternal ? '' : ', incluidas las del equipo'}.` : ''}`,
      action: 'Prioriza traer tráfico con enlaces UTM (contenido, creadores, App Store) y mide de nuevo en 7 días antes de rediseñar pasos del embudo.',
      evidence: [`visitantes web externos: ${int(visitors)}`, `sujetos observados activos 7d: ${int(n(people.active7d))}`],
    });
  }
  if (sc.configured && sc.error) {
    add({
      id: 'gsc-error', level: 'warn', area: 'medicion', tab: 'funnel', impact: 50, sample: null,
      title: 'Search Console no responde',
      detail: `Google devolvió: ${String(sc.error)}. Sin esto no ves impresiones ni búsquedas.`,
      action: 'Revisa en Integraciones; si dice SERVICE_DISABLED, activa la API en Google Cloud; si es 403, agrega la cuenta de servicio como usuario de la propiedad.',
      evidence: [String(sc.error)],
    });
  } else if (sc.configured && measured(o(sc.totals).impressions)) {
    const t = o(sc.totals);
    if (n(t.impressions) < 200) {
      add({
        id: 'gsc-visibility', level: 'opportunity', area: 'adquisicion', tab: 'funnel', impact: 55, sample: n(t.impressions),
        title: `Google casi no muestra a Bobby: ${int(n(t.impressions))} impresiones en ${period}d`,
        detail: `${int(n(t.clicks))} clics${t.position != null ? `, posición media ${n(t.position).toFixed(1)}` : ''}. La búsqueda orgánica todavía no es un canal.`,
        action: 'Publica páginas que respondan búsquedas concretas ("análisis de BTC hoy", "¿comprar NVDA?") y enlázalas desde redes.',
        evidence: [`impresiones: ${int(n(t.impressions))}`, `clics: ${int(n(t.clicks))}`],
      });
    }
    const queries = a(sc.topQueries).map(o).filter((q) => n(q.impressions) >= 20 && n(q.ctr) < 0.02 && q.position != null && n(q.position) <= 15)
      .sort((x, y) => n(y.impressions) - n(x.impressions)).slice(0, 2);
    for (const q of queries) {
      add({
        id: `gsc-ctr-${String(q.query).slice(0, 24)}`, level: 'opportunity', area: 'adquisicion', tab: 'funnel', impact: 50, sample: n(q.impressions),
        title: `"${String(q.query)}": se muestra pero casi nadie hace clic`,
        detail: `${int(n(q.impressions))} impresiones, CTR ${(n(q.ctr) * 100).toFixed(1)}%, posición ${n(q.position).toFixed(1)}. Ya rankea; falta que el resultado convenza.`,
        action: 'Reescribe el título y la descripción de la página que sale para esa búsqueda con la promesa concreta de Bobby.',
        evidence: [`impresiones ${int(n(q.impressions))}`, `CTR ${(n(q.ctr) * 100).toFixed(1)}%`],
      });
    }
  }
  const byCountry = a(store.byCountry).map(o);
  if (downloads >= 5 && byCountry.length) {
    const top = byCountry[0];
    if (n(top.downloads) / downloads >= 0.4) {
      add({
        id: 'appstore-country', level: 'opportunity', area: 'adquisicion', tab: 'audiencia', impact: 58, sample: downloads,
        title: `${COUNTRY(String(top.country))} hizo ${int(n(top.downloads))} de ${int(downloads)} descargas (${share(n(top.downloads), downloads)})${applePartial}`,
        detail: `Un solo país concentra las descargas de la App Store en el periodo. Si la ficha no está en su idioma, se pierde la mayoría de esa demanda.${input.includeInternal ? '' : ' Incluye las descargas del equipo (Apple no las separa).'}`,
        action: `Localiza la ficha para ${COUNTRY(String(top.country))} (título, subtítulo, palabras clave y capturas) y revisa qué la está trayendo ahí.`,
        evidence: byCountry.slice(0, 4).map((c) => `${String(c.country)}: ${int(n(c.downloads))}`),
      });
    }
  }
  // Only sources with enough installs to compare a rate (each one, not just the winner).
  const sources = a(acq.sources).map(o).filter((x) => n(x.installs) >= MIN_RATE_SAMPLE);
  if (sources.length >= 2) {
    const best = [...sources].sort((x, y) => n(y.read1) / n(y.installs) - n(x.read1) / n(x.installs))[0];
    add({
      id: 'best-source', level: 'info', area: 'adquisicion', tab: 'funnel', impact: 35, sample: n(best.installs),
      title: `La fuente que más lee: ${String(best.source).replace(/^utm:/, '')} (${share(n(best.read1), n(best.installs))} hizo su 1.ª lectura)`,
      detail: `${int(n(best.read1))} de ${int(n(best.installs))} instalaciones nuevas de esa fuente leyeron.${small(n(best.installs))}`,
      action: 'Pon más esfuerzo donde la gente sí lee, no donde solo llega.',
      evidence: sources.slice(0, 4).map((x) => `${String(x.source)}: ${int(n(x.read1))}/${int(n(x.installs))}`),
    });
  }

  // ---------------------------------------------------------------- activación
  const arrived = n(web.arrived), deskOrRead = n(web.deskOrRead), read1 = n(web.read1);
  if (arrived >= MIN_RATE_SAMPLE && deskOrRead / arrived < 0.5) {
    add({
      id: 'web-desk-reach', level: 'warn', area: 'activacion', tab: 'funnel', impact: 70, sample: arrived,
      title: `De ${int(arrived)} que llegaron a la web, solo ${int(deskOrRead)} abrieron el desk (${share(deskOrRead, arrived)})`,
      detail: `La mayoría se va antes de probar el producto.${small(arrived)}`,
      action: 'Haz que la primera pantalla lleve directo a preguntar por un activo (un botón, un ejemplo precargado).',
      evidence: [`llegaron: ${int(arrived)}`, `abrieron desk: ${int(deskOrRead)}`],
    });
  }
  if (deskOrRead >= MIN_RATE_SAMPLE && read1 / deskOrRead < 0.6) {
    add({
      id: 'web-first-read', level: 'warn', area: 'activacion', tab: 'funnel', impact: 68, sample: deskOrRead,
      title: `${share(deskOrRead - read1, deskOrRead)} abre el desk y no pide ninguna lectura`,
      detail: `${int(deskOrRead - read1)} de ${int(deskOrRead)} instalaciones web abrieron el desk sin recibir una lectura.${small(deskOrRead)}`,
      action: 'Ofrece preguntas sugeridas de un toque y revisa que el desk no falle al cargar.',
      evidence: [`abrieron desk: ${int(deskOrRead)}`, `1.ª lectura: ${int(read1)}`],
    });
  }
  const neverRead = a(o(gr.attention).neverRead).map(o);
  const neverReadTotal = measured(people.accountsNeverRead) ? n(people.accountsNeverRead) : neverRead.length;
  if (neverReadTotal > 0) {
    add({
      id: 'accounts-never-read', level: 'warn', area: 'activacion', tab: 'usuarios', impact: 78, sample: n(people.accounts),
      title: `${int(neverReadTotal)} de ${int(n(people.accounts))} cuentas${input.includeInternal ? '' : ' externas'} se registraron y no tienen lecturas registradas`,
      // Ids and providers only: this text also goes to the digest email and the plan model, never user emails.
      detail: `No hay consumo de lecturas registrado en esas cuentas; no prueba que nunca hayan leído como invitadas o en clientes sin cobertura.${neverRead.length ? ` Ejemplos: ${neverRead.slice(0, 5).map((u) => `${String(u.provider ?? 'cuenta')} ${String(u.identityId).slice(0, 8)} (${dateOnly(s(u.createdAt))})`).join(', ')}${neverReadTotal > Math.min(5, neverRead.length) ? '…' : ''}.` : ''} Los datos de contacto disponibles están en Usuarios.`,
      action: 'Revisa qué ve alguien justo después de iniciar sesión, y regálales 1 Profundo desde Usuarios (se gasta aunque el cobro esté apagado).',
      evidence: [`cuentas${input.includeInternal ? '' : ' externas'}: ${int(n(people.accounts))}`, `sin lectura registrada: ${int(neverReadTotal)}`],
    });
  }
  const medFirst = web.medianMinutesToFirstRead == null ? null : n(web.medianMinutesToFirstRead);
  if (medFirst !== null && read1 >= MIN_RATE_SAMPLE && medFirst > 10) {
    add({
      id: 'slow-first-read', level: 'opportunity', area: 'activacion', tab: 'funnel', impact: 45, sample: read1,
      title: `La 1.ª lectura llega a los ${Math.round(medFirst)} min (mediana)`,
      detail: `Entre llegar a la web y recibir la primera lectura pasan ${Math.round(medFirst)} minutos en la mitad de los casos.${small(read1)}`,
      action: 'Reduce los pasos antes de la primera pregunta.',
      evidence: [`mediana: ${Math.round(medFirst)} min`],
    });
  }

  // ---------------------------------------------------------------- conversión
  const wall = n(web.wall) + n(ios.wall) + n(android.wall), afterWall = n(web.accountAfterWall) + n(ios.accountAfterWall) + n(android.accountAfterWall);
  const read3 = n(web.read3) + n(ios.read3) + n(android.read3), readers = n(web.read1) + n(ios.read1) + n(android.read1);
  if (wall >= 3) {
    if (afterWall / wall < 0.3) {
      add({
        id: 'wall-conversion', level: 'warn', area: 'conversion', tab: 'funnel', impact: 74, sample: wall,
        title: `El muro de registro convierte ${share(afterWall, wall)}`,
        detail: `${int(wall)} instalaciones usaron sus 3 lecturas gratis y pidieron una 4.ª; ${int(afterWall)} crearon o vincularon cuenta después.${small(wall)}`,
        action: `Cambia el mensaje del muro: qué ganan con la cuenta (${ig.paywall === true ? '10 lecturas por semana, ' : ig.paywall === false ? 'lecturas Rápido sin límite, ' : ''}que Bobby recuerde lo que preguntaron), en un solo toque con Apple/Google.`,
        evidence: [`chocaron con el muro: ${int(wall)}`, `cuenta después: ${int(afterWall)}`],
      });
    }
  } else if (readers >= MIN_RATE_SAMPLE && read3 === 0) {
    add({
      id: 'nobody-uses-3', level: 'info', area: 'conversion', tab: 'funnel', impact: 50, sample: readers,
      title: 'Nadie llega a 3 lecturas',
      detail: `${readers === 1 ? '1 instalación nueva leyó y no llegó' : `${int(readers)} instalaciones nuevas leyeron, ninguna llegó`} a 3 (el muro de registro está después de 3 lecturas como invitado). El registro no es el freno: la gente no vuelve a preguntar.`,
      action: 'Trabaja la segunda lectura (sugerir el siguiente activo, recordatorio) antes que el muro de registro.',
      evidence: [`leyeron: ${int(readers)}`, `3+ lecturas: 0`],
    });
  }
  const signin = n(web.signinStart), account = n(web.account);
  if (signin >= 3 && account / signin < 0.5) {
    add({
      id: 'signin-abandon', level: 'warn', area: 'conversion', tab: 'funnel', impact: 66, sample: signin,
      title: `${int(signin - Math.min(signin, account))} de ${int(signin)} empezaron a iniciar sesión y no terminaron`,
      detail: `${int(signin)} instalaciones web tocaron "Continuar con Apple/Google" y ${int(account)} terminaron con cuenta.${small(signin)}`,
      action: 'Prueba el login en Safari móvil e Instagram/TikTok in-app browser (ahí suele romperse el OAuth).',
      evidence: [`inicios: ${int(signin)}`, `cuentas: ${int(account)}`],
    });
  }

  // ---------------------------------------------------------------- retención
  const returnCells = [web, ios, android].map((cohort) => o(o(cohort.retention).readersBack))
    .filter((cell) => measured(cell.eligible) && measured(cell.returned) && measured(cell.read));
  const backEligible = returnCells.reduce((total, cell) => total + n(cell.eligible), 0);
  const backReturned = returnCells.reduce((total, cell) => total + n(cell.returned), 0);
  const backRead = returnCells.reduce((total, cell) => total + n(cell.read), 0);
  if (backEligible >= MIN_RATE_SAMPLE) {
    add({
      id: 'readers-back', level: 'info', area: 'retencion', tab: 'funnel', impact: 42, sample: backEligible,
      title: `${backEligible < SMALL_SAMPLE ? `${int(backRead)} de ${int(backEligible)}` : share(backRead, backEligible)} instalaciones lectoras volvieron a leer otro día hasta ahora`,
      detail: `Se observó otra lectura en ${int(backRead)} de ${int(backEligible)} instalaciones lectoras nuevas y actividad posterior en ${int(backReturned)}. Cada instalación tiene al menos un día posterior completo, pero algunas aún no completan su primera semana. Este acumulado provisional no mide retención semanal madura ni personas distintas.${small(backEligible)}`,
      action: 'Espera cohortes con siete días completos y revisa W1 antes de concluir que los lectores no vuelven.',
      evidence: [`elegibles: ${int(backEligible)}`, `volvieron a leer: ${int(backRead)}`, `volvieron a registrar actividad: ${int(backReturned)}`],
    });
  }
  const quiet = a(o(gr.attention).quiet).map(o);
  if (quiet.length) {
    add({
      id: 'quiet-readers', level: 'opportunity', area: 'retencion', tab: 'usuarios', impact: 55, sample: quiet.length,
      title: quiet.length === 1 ? '1 cuenta que leyó lleva 7+ días sin volver' : `${int(quiet.length)} cuentas que leyeron llevan 7+ días sin volver`,
      detail: quiet.slice(0, 5).map((u) => `${String(u.provider ?? 'cuenta')} ${String(u.identityId).slice(0, 8)}: ${count(n(u.reads), 'lectura', 'lecturas')}, última actividad ${dateOnly(s(u.lastDay))}`).join(' · '),
      action: 'Regálales 1 Profundo desde Usuarios o escríbeles si tienen email.',
      evidence: [`en riesgo: ${int(quiet.length)}`],
    });
  }
  if (n(people.proInactive) > 0) {
    add({
      id: 'pro-inactive', level: 'warn', area: 'retencion', tab: 'membresias', impact: 70, sample: n(o(people.stages).pro),
      title: `${count(n(people.proInactive), 'cuenta Pro', 'cuentas Pro')} sin usar Bobby en 14+ días`,
      detail: `Tienen Pro (pago verificado, sin verificar, prueba o regalo) y no lo usan; ${int(n(people.proInactivePaid))} de ellas con pago verificado: la falta de actividad puede sugerir riesgo de cancelación, pero no lo confirma.`,
      action: 'Contáctalas antes de la renovación.',
      evidence: [`Pro inactivos: ${int(n(people.proInactive))}`, `de pago verificado: ${int(n(people.proInactivePaid))}`],
    });
  }

  // ---------------------------------------------------------------- monetización
  const payments = { apple: Boolean(o(health.revenuecatWebhook).configured), stripe: Boolean(o(health.stripe).configured) };
  const subs = o(ov.subscriptions), revenue = o(ov.revenue);
  if ('stripe' in health && !payments.stripe) {
    add({
      id: 'web-cannot-pay', level: 'warn', area: 'monetizacion', tab: 'integraciones', impact: 62, sample: null,
      title: 'En la web nadie puede pagar Bobby Pro',
      detail: `Stripe no está configurado (faltan STRIPE_SECRET_KEY / STRIPE_PRICE_ID): el botón de pago de la web responde "aún no disponible".${payments.apple ? ' En iOS el cobro pasa por Apple/RevenueCat.' : ''}`,
      action: 'Configura Stripe en Vercel si quieres cobrar también en la web.',
      evidence: ['Stripe: sin configurar'],
    });
  }
  if (ig.paywall === false) {
    add({
      id: 'paywall-off', level: 'info', area: 'monetizacion', tab: 'membresias', impact: 45, sample: null,
      title: 'El cobro está apagado: las cuentas gratis leen Rápido sin límite',
      detail: 'Los invitados siguen limitados a 3 lecturas y Profundo/Máximo se miden siempre; pero ninguna cuenta gratis llega al muro de pago de lecturas.',
      action: 'Activa BOBBY_PAYWALL cuando el flujo de compra de la versión distribuida esté verificado.',
      evidence: ['BOBBY_PAYWALL: apagado'],
    });
  }
  const wallLevel = n(outcomes.wallLevel), wallPay = n(outcomes.wallPaywall);
  if (wallLevel + wallPay > 0) {
    add({
      id: 'upgrade-intent', level: 'opportunity', area: 'monetizacion', tab: 'membresias', impact: 64, sample: wallLevel + wallPay,
      title: `${count(wallLevel + wallPay, 'vez', 'veces')} alguien quiso más de lo que su plan permite`,
      detail: `${int(wallLevel)} pidieron Profundo/Máximo por encima de su límite y ${int(wallPay)} encontraron el muro de pago. Son bloqueos observados; no prueban intención de compra.`,
      action: 'En ese momento ofrece Bobby Pro (y en la web, que se pueda pagar).',
      evidence: [`límite de nivel: ${int(wallLevel)}`, `muro de pago: ${int(wallPay)}`],
    });
  }
  // Payers are verified paid subscriptions only (production store + a positive production charge). Pro access that is
  // not verified, a sandbox purchase or a trial is reported apart and never counted as a payer.
  const paidVerified = subs.paidVerified != null ? n(subs.paidVerified) : n(subs.paid);
  const unverified = n(subs.unverified), testSubs = n(subs.test);
  const unverifiedWhy = o(subs.unverifiedReasons), testWhy = o(subs.testReasons);
  // Store money of accounts that are not verified payers: inside gross revenue, never a payer (D1).
  const unverifiedUsd = n(revenue.unverifiedGrossUsd);
  const unverifiedMoney = unverifiedUsd > 0
    ? ` La tienda sí reportó ${usd(unverifiedUsd)} en cobros de producción de cuentas que aún no son pagadores verificados (${period}d): están en Ingresos brutos, no en pagadores.`
    : '';
  if (unverified > 0) {
    add({
      id: 'payers-unverified', level: 'warn', area: 'monetizacion', tab: 'membresias', impact: 66, sample: null,
      title: `${count(unverified, 'membresía Pro activa sin verificar', 'membresías Pro activas sin verificar')}: no cuenta${unverified === 1 ? '' : 'n'} como pago`,
      detail: `${int(n(unverifiedWhy.unknown_environment))} con entorno desconocido (la tienda no ha confirmado si es producción o sandbox) y ${int(n(unverifiedWhy.no_charge))} de producción sin cobro registrado y ${int(n(unverifiedWhy.unknown_period))} con periodo de suscripción desconocido. No cuentan como pagadores, nuevos pagadores ni MRR hasta verificarlas; su acceso a Pro no cambia.${unverifiedMoney}`,
      action: 'Abre Membresías y pulsa «Verificar con RevenueCat» en cada una.',
      evidence: [`sin verificar: ${int(unverified)}`, `entorno desconocido: ${int(n(unverifiedWhy.unknown_environment))}`, `sin cobro registrado: ${int(n(unverifiedWhy.no_charge))}`, `periodo desconocido: ${int(n(unverifiedWhy.unknown_period))}`, `pagando (verificado): ${int(paidVerified)}`,
        ...(unverifiedUsd > 0 ? [`cobros sin verificar ${period}d: ${usd(unverifiedUsd)}`] : [])],
    });
  }
  if (testSubs > 0) {
    add({
      id: 'pro-test', level: 'info', area: 'monetizacion', tab: 'membresias', impact: 25, sample: null,
      title: `${count(testSubs, 'membresía Pro de prueba', 'membresías Pro de prueba')} (sandbox o periodo de prueba)`,
      detail: `Tienen acceso Pro pero no son pagadores: compras de sandbox/TestFlight o periodos de prueba. Están fuera de pagadores y MRR.${unverified > 0 ? '' : unverifiedMoney}`,
      action: 'Nada urgente; si alguna debería ser una compra real, verifícala con RevenueCat en Membresías.',
      evidence: [`sandbox: ${int(n(testWhy.sandbox))}`, `periodo de prueba: ${int(n(testWhy.trial))}`],
    });
  }
  if (n(revenue.unconvertedEvents) > 0) {
    add({ id: 'revenue-unconverted', level: 'warn', area: 'medicion', tab: 'membresias', impact: 75,
      sample: n(revenue.unconvertedEvents), title: `${int(n(revenue.unconvertedEvents))} eventos monetarios sin importe USD confirmado`,
      detail: 'El proveedor registró cobros o devoluciones de producción sin un importe confirmado en USD. No se suman como cero dinero ni se inventa un tipo de cambio; los totales USD cubren sólo importes registrados en esa moneda.',
      action: 'Obtén el importe USD confirmado o muestra la moneda original con su unidad verificada antes de comparar ingresos.',
      evidence: [`eventos sin importe USD: ${int(n(revenue.unconvertedEvents))}`] });
  }

  if (n(revenue.unattributedEvents) > 0) {
    add({ id: 'revenue-unattributed', level: 'warn', area: 'medicion', tab: 'membresias', impact: 76,
      sample: n(revenue.unattributedEvents), title: `${int(n(revenue.unattributedEvents))} eventos de cobro o devolución sin cuenta atribuida`,
      detail: 'El proveedor envió eventos de producción, pero falta confirmar a qué cuenta pertenecen. No se puede afirmar que son ventas externas ni excluir al equipo por cuenta. El ingreso atribuible y el importe sin atribuir se muestran por separado.',
      action: 'Revisa la asociación del webhook con la cuenta y sus reintentos antes de interpretar los ingresos de clientes.',
      evidence: [`eventos sin atribuir: ${int(n(revenue.unattributedEvents))}`, measured(revenue.unattributedGrossUsd) ? `USD registrados sin atribuir: $${n(revenue.unattributedGrossUsd).toFixed(2)}` : 'USD sin atribuir: importe no confirmado'] });
  }

  if (measured(subs.paidVerified ?? subs.paid) && measured(subs.unverified) && measured(revenue.grossUsd) && measured(revenue.unattributedEvents) && measured(revenue.unconvertedEvents) && paidVerified === 0 && unverified === 0 && n(revenue.grossUsd) === 0 && n(revenue.unattributedEvents) === 0 && n(revenue.unconvertedEvents) === 0) {
    add({
      id: 'no-payers', level: 'info', area: 'monetizacion', tab: 'funnel', impact: 30, sample: null,
      title: 'Sin pagos verificados en esta vista',
      detail: `0 suscripciones de pago verificadas y $0 registrados en ${period}d para la selección de tráfico actual. La ausencia de eventos no confirma la ausencia de ventas. El LTV del Funnel es un escenario con supuestos, no una medición.`,
      action: 'Comprueba la cobertura del webhook y la conciliación con las tiendas; conserva separados los cobros del equipo.',
      evidence: [`pagando (verificado): 0`, `ingresos ${period}d: $0`],
    });
  }

  // ---------------------------------------------------------------- coverage note (always last among infos)
  const webSince = s(cov.webObservedSince);
  if (webSince) {
    const coveredDays = Math.max(1, Math.ceil((now - new Date(webSince).getTime()) / 86_400_000));
    if (coveredDays < period) {
      add({
        id: 'coverage', level: 'info', area: 'medicion', tab: 'funnel', impact: 20, sample: null,
        title: `Elegiste ${period}D, pero la medición observada empieza el ${dateOnly(webSince)}`,
        detail: `El embudo por cohorte solo tiene ${coveredDays} día${coveredDays === 1 ? '' : 's'} de llegadas observadas; las instalaciones anteriores se reconstruyeron desde sus lecturas y se muestran aparte como histórico.`,
        action: 'Compara periodos cuando haya al menos dos semanas de llegadas observadas.',
        evidence: [`desde ${dateOnly(webSince)}`],
      });
    }
  }

  const weight: Record<InsightLevel, number> = { critical: 4, warn: 3, opportunity: 2, info: 1 };
  return out.sort((x, y) => weight[y.level] - weight[x.level] || y.impact - x.impact);
}
