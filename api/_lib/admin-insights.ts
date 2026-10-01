// ============================================================
// "Dónde mejorar": the owner dashboard's diagnosis, computed from the same figures it shows (bobby_admin_overview,
// bobby_admin_growth, integrations, Search Console, App Store). Deterministic rules, no model: every insight
// carries the numbers it came from and the sample behind them, and says what to do next. Thresholds below are
// configuration, not data; an insight below its minimum sample is either skipped or says "muestra pequeña".
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
const pct = (num: number, den: number) => (den > 0 ? `${Math.round((num / den) * 100)}%` : '—');
const int = (v: number) => new Intl.NumberFormat('es-MX').format(Math.round(v));
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
  now?: number;
}

export function buildInsights(input: InsightInput): Insight[] {
  const now = input.now ?? Date.now();
  const ov = o(input.overview), gr = o(input.growth), ig = o(input.integrations), sc = o(input.searchConsole);
  const health = o(ig.health), people = o(gr.people), outcomes = o(gr.outcomes), acq = o(gr.acquisition), cov = o(gr.coverage);
  const web = o(o(gr.cohorts).web), ios = o(o(gr.cohorts).ios);
  const llm = o(ov.llm), providers = o(llm.providers);
  const out: Insight[] = [];
  const add = (i: Insight) => out.push(i);
  const period = input.days;

  // ---------------------------------------------------------------- operación
  for (const p of ['anthropic', 'openai'] as const) {
    const pr = o(providers[p]);
    const alertAt = s(pr.lastCreditAlert), topupAt = s(pr.lastTopup), lastOk = s(pr.lastOk);
    const alert = o(pr.creditAlert);
    // A later successful call proves the credit is back; plain failures without an alert go to the failing rule below.
    const alertLive = alertAt && (!topupAt || new Date(topupAt) < new Date(alertAt)) && (!lastOk || new Date(lastOk) < new Date(alertAt));
    const lastFail = o(pr.lastFailure);
    if (alertLive) {
      add({
        id: `credit-${p}`, level: 'critical', area: 'operacion', tab: 'ia', impact: 100, sample: null,
        title: `${PROVIDER[p]} sin crédito desde ${day(alertAt)}`,
        detail: `La alerta de crédito se disparó${s(alert.endpoint) ? ` en ${s(alert.endpoint)}` : ''}${s(alert.code) ? ` (${s(alert.code)})` : ''} y no hay una recarga registrada después.${lastOk ? ` Última llamada correcta: ${day(lastOk)}.` : ''} Todo lo que dependa de ${PROVIDER[p]} sin respaldo está fallando para los usuarios.`,
        action: `Recarga crédito en ${PROVIDER[p]} y regístralo en IA → Registrar recarga para que el panel lo sepa.`,
        evidence: [`alerta ${day(alertAt)}`, `fallos 24h: ${int(n(pr.failures24h))}/${int(n(pr.calls24h))}`, ...(s(lastFail.stop) ? [`último error: ${s(lastFail.stop)}`] : [])],
      });
    } else if (n(pr.calls24h) >= 3 && n(pr.failures24h) / n(pr.calls24h) >= 0.5) {
      add({
        id: `failing-${p}`, level: 'critical', area: 'operacion', tab: 'ia', impact: 95, sample: n(pr.calls24h),
        title: `${PROVIDER[p]} falla en ${pct(n(pr.failures24h), n(pr.calls24h))} de las llamadas (24h)`,
        detail: `${int(n(pr.failures24h))} de ${int(n(pr.calls24h))} llamadas fallaron en las últimas 24 horas${s(lastFail.stop) ? `; el último error fue ${s(lastFail.stop)}` : ''}.`,
        action: 'Prueba el proveedor desde IA → Probar y revisa crédito y límites de tasa.',
        evidence: [`${int(n(pr.failures24h))}/${int(n(pr.calls24h))} fallos 24h`],
      });
    }
  }

  const runs = o(llm.deskRuns);
  const totalRuns = n(runs.runs), finished = n(runs.finished);
  if (totalRuns >= MIN_RATE_SAMPLE && (totalRuns - finished) / totalRuns >= 0.2) {
    // A failure wave that already stopped is history, not an outage: healed when a provider answered after the last
    // failed desk call (the ledger's own evidence), or when the last two UTC days finished at least 80%.
    const cutoff = new Date(now - 86_400_000).toISOString().slice(0, 10);
    const recent = a(runs.byDay).map(o).filter((d) => String(d.day) >= cutoff);
    const recentRuns = recent.reduce((t, d) => t + n(d.runs), 0), recentDone = recent.reduce((t, d) => t + n(d.finished), 0);
    const failedDays = [...new Set(a(runs.byDay).map(o).filter((d) => n(d.finished) < n(d.runs)).map((d) => String(d.day)))].sort();
    const stamps = (['anthropic', 'openai'] as const).map((p) => o(providers[p]));
    const lastDeskFail = stamps.map((pr) => o(pr.lastFailure)).filter((f) => f.surface === 'desk' && s(f.at)).map((f) => Date.parse(String(f.at))).sort((x, y) => y - x)[0];
    const lastOkAny = stamps.map((pr) => (s(pr.lastOk) ? Date.parse(String(pr.lastOk)) : 0)).sort((x, y) => y - x)[0] ?? 0;
    const healed = (lastDeskFail != null && lastOkAny > lastDeskFail) || (recentRuns >= 2 && recentDone / recentRuns >= 0.8);
    add({
      id: 'desk-failures', level: healed ? 'info' : (totalRuns - finished) / totalRuns >= 0.4 ? 'critical' : 'warn', area: 'operacion', tab: 'ia', impact: healed ? 40 : 90, sample: totalRuns,
      title: healed
        ? `${int(totalRuns - finished)} de ${int(totalRuns)} análisis fallaron en el periodo; desde la última falla el desk responde`
        : `${int(totalRuns - finished)} de ${int(totalRuns)} análisis del desk no terminaron (${pct(totalRuns - finished, totalRuns)})`,
      detail: `${healed ? `Las fallas se concentran en ${failedDays.map((d) => dateOnly(d)).join(', ')}${lastDeskFail != null ? ` (la última, ${day(new Date(lastDeskFail).toISOString())})` : ''}; después hubo llamadas correctas. ` : 'Cada análisis sin terminar es un lector que vio "no disponible". '}Se cuenta un análisis por lote del ledger; terminado = el CIO respondió.${small(totalRuns)}`,
      action: healed ? 'Nada urgente: confirma que el respaldo del proveedor que falló tenga crédito para la próxima vez.' : 'Abre IA para ver qué proveedor y qué rol fallan; con crédito y respaldo sanos esto debería bajar de 5%.',
      evidence: [`análisis ${period}d: ${int(totalRuns)}`, `terminados: ${int(finished)}`, `últimas 48 h: ${int(recentDone)}/${int(recentRuns)}`],
    });
  }

  const blocked = o(outcomes.blocked);
  const blockedTotal = Object.values(blocked).reduce<number>((t, v) => t + n(v), 0);
  if (blockedTotal > 0) {
    const parts = Object.entries(blocked).map(([k, v]) => `${({ daily_limit: 'límite diario', budget_paused: 'presupuesto en pausa', premium_paused: 'Profundo/Máximo en pausa', unavailable: 'desk no disponible' } as Record<string, string>)[k] ?? k}: ${int(n(v))}`);
    add({
      id: 'desk-blocked', level: 'warn', area: 'operacion', tab: 'ia', impact: 80, sample: blockedTotal,
      title: `${int(blockedTotal)} lecturas rechazadas por límites del servidor`,
      detail: `Gente que quiso leer y Bobby dijo que no por sus propios topes (${parts.join(' · ')}).`,
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
  if (lastRead && (!lastVisit || new Date(lastVisit).getTime() < new Date(lastRead).getTime() - 2 * 86_400_000)) {
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
  // Installs of the same window: observed arrivals plus rebuilt installs first seen in the period.
  const iosInstalls = n(ios.arrived) + n(o(o(gr.history).ios).installsInPeriod);
  if (store.configured && !store.error && downloads >= 3 && downloads > iosInstalls) {
    add({
      id: 'ios-gap', level: 'warn', area: 'medicion', tab: 'funnel', impact: 72, sample: downloads,
      title: `Apple reporta ${int(downloads)} descargas; Bobby solo vio ${int(iosInstalls)} instalaciones iOS`,
      detail: `${int(downloads - iosInstalls)} descargas (${pct(downloads - iosInstalls, downloads)}) no aparecen: no abrieron la app, o usan una versión que no envía id de instalación. Es la fuga más grande que se puede medir hoy en iOS.`,
      action: 'Libera iOS 1.5 (envía id de instalación y vincula la cuenta) y revisa qué ve alguien en su primera apertura.',
      evidence: [`descargas Apple ${dateOnly(s(store.coveredFrom))}–${dateOnly(s(store.coveredTo))}: ${int(downloads)}`, `instalaciones iOS vistas: ${int(iosInstalls)}`],
    });
  }

  const consumedTotal = n(outcomes.consumedTotal), consumedInternal = n(outcomes.consumedInternal);
  if (consumedTotal >= MIN_RATE_SAMPLE && consumedInternal / consumedTotal >= 0.25) {
    add({
      id: 'internal-share', level: 'info', area: 'medicion', tab: 'usuarios', impact: 40, sample: consumedTotal,
      title: `${pct(consumedInternal, consumedTotal)} de las lecturas del periodo fueron del equipo`,
      detail: `${int(consumedInternal)} de ${int(consumedTotal)} lecturas vienen de cuentas, instalaciones o redes internas. Ya están fuera de todas las cifras; sin ellas quedan ${int(consumedTotal - consumedInternal)}.`,
      action: 'Si alguna cuenta Apple de prueba aún cuenta como externa, márcala en Usuarios → Interno.',
      evidence: [`internas: ${int(consumedInternal)}`, `externas: ${int(consumedTotal - consumedInternal)}`],
    });
  }

  // A team network that leaves out installs nothing else ties to the team may be catching outside people.
  for (const net of a(input.networks).map(o).filter((x) => n(x.onlyByNetwork) >= 3)) {
    add({
      id: `network-${String(net.network)}`, level: 'warn', area: 'medicion', tab: 'usuarios', impact: 62, sample: n(net.installs),
      title: `Una red del equipo deja fuera ${int(n(net.onlyByNetwork))} instalaciones que no parecen tuyas`,
      detail: `La red ${String(net.network)}… (agregada al abrir /admin) excluye ${int(n(net.installs))} instalaciones; ${int(n(net.onlyByNetwork))} no tienen cuenta, marca ni sesión del equipo. En datos móviles o una oficina, una misma IP la pueden compartir varias personas.`,
      action: 'Revisa Usuarios → Tráfico interno → Redes; si no es tu red, quítala.',
      evidence: [`instalaciones fuera: ${int(n(net.installs))}`, `solo por la red: ${int(n(net.onlyByNetwork))}`],
    });
  }

  const visits = n(acq.visits), withUtm = n(acq.visitsWithUtm);
  if (visits >= 1 && withUtm === 0) {
    add({
      id: 'utm-missing', level: 'opportunity', area: 'medicion', tab: 'funnel', impact: 60, sample: visits,
      title: 'Ninguna visita trae etiqueta de campaña (utm_source)',
      detail: `${int(visits)} visitas web externas en ${period}d y 0 con utm_source: cuando publiques en TikTok, X o con un creador no sabrás cuál trajo gente que lee.`,
      action: 'Usa Funnel → Enlaces con UTM para cada post, bio y anuncio; el embudo por fuente se llena solo.',
      evidence: [`visitas: ${int(visits)}`, `con UTM: 0`, `con referrer: ${int(n(acq.visitsWithReferrer))}`],
    });
  }

  // ---------------------------------------------------------------- adquisición
  const visitors = n(acq.visitors);
  if (visitors < LOW_TRAFFIC) {
    add({
      id: 'low-traffic', level: 'critical', area: 'adquisicion', tab: 'funnel', impact: 98, sample: visitors,
      title: `Solo ${int(visitors)} visitantes web externos en ${period} días`,
      detail: `Con tan pocas personas cualquier tasa del embudo es ruido: el cuello de botella hoy es que llegue gente, no la conversión.${downloads ? ` En iOS, Apple reporta ${int(downloads)} descargas en el mismo periodo.` : ''}`,
      action: 'Prioriza traer tráfico con enlaces UTM (contenido, creadores, App Store) y mide de nuevo en 7 días antes de rediseñar pasos del embudo.',
      evidence: [`visitantes web externos: ${int(visitors)}`, `personas activas 7d: ${int(n(people.active7d))}`],
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
  } else if (sc.configured && o(sc.totals)) {
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
        title: `${COUNTRY(String(top.country))} hizo ${int(n(top.downloads))} de ${int(downloads)} descargas (${pct(n(top.downloads), downloads)})`,
        detail: 'Un solo país concentra las descargas de la App Store en el periodo. Si la ficha no está en su idioma, se pierde la mayoría de esa demanda.',
        action: `Localiza la ficha para ${COUNTRY(String(top.country))} (título, subtítulo, palabras clave y capturas) y revisa qué la está trayendo ahí.`,
        evidence: byCountry.slice(0, 4).map((c) => `${String(c.country)}: ${int(n(c.downloads))}`),
      });
    }
  }
  const sources = a(acq.sources).map(o).filter((x) => n(x.installs) >= 3);
  if (sources.length >= 2) {
    const best = [...sources].sort((x, y) => n(y.read1) / n(y.installs) - n(x.read1) / n(x.installs))[0];
    add({
      id: 'best-source', level: 'info', area: 'adquisicion', tab: 'funnel', impact: 35, sample: n(best.installs),
      title: `La fuente que más lee: ${String(best.source).replace(/^utm:/, '')} (${pct(n(best.read1), n(best.installs))} hizo su 1.ª lectura)`,
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
      title: `De ${int(arrived)} que llegaron a la web, solo ${int(deskOrRead)} abrieron el desk (${pct(deskOrRead, arrived)})`,
      detail: `La mayoría se va antes de probar el producto.${small(arrived)}`,
      action: 'Haz que la primera pantalla lleve directo a preguntar por un activo (un botón, un ejemplo precargado).',
      evidence: [`llegaron: ${int(arrived)}`, `abrieron desk: ${int(deskOrRead)}`],
    });
  }
  if (deskOrRead >= MIN_RATE_SAMPLE && read1 / deskOrRead < 0.6) {
    add({
      id: 'web-first-read', level: 'warn', area: 'activacion', tab: 'funnel', impact: 68, sample: deskOrRead,
      title: `${pct(deskOrRead - read1, deskOrRead)} abre el desk y no pide ninguna lectura`,
      detail: `${int(deskOrRead - read1)} de ${int(deskOrRead)} instalaciones web abrieron el desk sin recibir una lectura.${small(deskOrRead)}`,
      action: 'Ofrece preguntas sugeridas de un toque y revisa que el desk no falle al cargar.',
      evidence: [`abrieron desk: ${int(deskOrRead)}`, `1.ª lectura: ${int(read1)}`],
    });
  }
  const neverRead = a(o(gr.attention).neverRead).map(o);
  if (neverRead.length) {
    add({
      id: 'accounts-never-read', level: 'warn', area: 'activacion', tab: 'usuarios', impact: 78, sample: n(people.accounts),
      title: `${int(neverRead.length)} de ${int(n(people.accounts))} cuentas externas se registraron y nunca leyeron`,
      // Ids and providers only: this text also goes to the digest email and the plan model, never user emails.
      detail: `Crearon cuenta y no recibieron ni una lectura: ${neverRead.slice(0, 5).map((u) => `${String(u.provider ?? 'cuenta')} ${String(u.identityId).slice(0, 8)} (${dateOnly(s(u.createdAt))})`).join(', ')}${neverRead.length > 5 ? '…' : ''}.${neverRead.every((u) => !s(u.email)) ? ' Ninguna tiene email visible (Apple lo oculta): no se les puede escribir.' : ' Los emails están en Usuarios.'}`,
      action: 'Revisa qué ve alguien justo después de iniciar sesión, y regálales 1 Profundo desde Usuarios (se gasta aunque el cobro esté apagado).',
      evidence: [`cuentas externas: ${int(n(people.accounts))}`, `sin lectura: ${int(neverRead.length)}`],
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
  const wall = n(web.wall) + n(ios.wall), afterWall = n(web.accountAfterWall) + n(ios.accountAfterWall);
  const read3 = n(web.read3) + n(ios.read3), readers = n(web.read1) + n(ios.read1);
  if (wall >= 3) {
    if (afterWall / wall < 0.3) {
      add({
        id: 'wall-conversion', level: 'warn', area: 'conversion', tab: 'funnel', impact: 74, sample: wall,
        title: `El muro de registro convierte ${pct(afterWall, wall)}`,
        detail: `${int(wall)} instalaciones usaron sus 3 lecturas gratis y pidieron una 4.ª; ${int(afterWall)} crearon o vincularon cuenta después.${small(wall)}`,
        action: `Cambia el mensaje del muro: qué ganan con la cuenta (${ig.paywall ? '10 lecturas por semana' : 'lecturas Rápido sin límite'}, que Bobby recuerde lo que preguntaron), en un solo toque con Apple/Google.`,
        evidence: [`chocaron con el muro: ${int(wall)}`, `cuenta después: ${int(afterWall)}`],
      });
    }
  } else if (readers >= MIN_RATE_SAMPLE && read3 === 0) {
    add({
      id: 'nobody-uses-3', level: 'info', area: 'conversion', tab: 'funnel', impact: 50, sample: readers,
      title: 'Nadie llega a 3 lecturas',
      detail: `${int(readers)} instalaciones nuevas leyeron, ninguna llegó a 3 (el muro de registro está después de 3 lecturas como invitado). El registro no es el freno: la gente no vuelve a preguntar.`,
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
  const back = o(o(web.retention).readersBack), backIos = o(o(ios.retention).readersBack);
  const backEligible = n(back.eligible) + n(backIos.eligible), backReturned = n(back.returned) + n(backIos.returned), backRead = n(back.read) + n(backIos.read);
  if (backEligible >= MIN_RATE_SAMPLE) {
    add({
      id: 'readers-back', level: backRead / backEligible < 0.2 ? 'warn' : 'info', area: 'retencion', tab: 'funnel', impact: 72, sample: backEligible,
      title: `${pct(backRead, backEligible)} de quienes leyeron volvió a leer otro día`,
      detail: `${int(backRead)} de ${int(backEligible)} lectores nuevos leyeron de nuevo en su primera semana; ${int(backReturned)} al menos abrieron Bobby otra vez.${small(backEligible)}`,
      action: 'Dale una razón para volver: recordatorio del activo que preguntó, "¿se cumplió?" al día siguiente.',
      evidence: [`elegibles: ${int(backEligible)}`, `volvieron a leer: ${int(backRead)}`, `volvieron a abrir: ${int(backReturned)}`],
    });
  }
  const quiet = a(o(gr.attention).quiet).map(o);
  if (quiet.length) {
    add({
      id: 'quiet-readers', level: 'opportunity', area: 'retencion', tab: 'usuarios', impact: 55, sample: quiet.length,
      title: `${int(quiet.length)} cuentas que leyeron llevan 7+ días sin volver`,
      detail: quiet.slice(0, 5).map((u) => `${String(u.provider ?? 'cuenta')} ${String(u.identityId).slice(0, 8)}: ${int(n(u.reads))} lecturas, última actividad ${dateOnly(s(u.lastDay))}`).join(' · '),
      action: 'Regálales 1 Profundo desde Usuarios o escríbeles si tienen email.',
      evidence: [`en riesgo: ${int(quiet.length)}`],
    });
  }
  if (n(people.proInactive) > 0) {
    add({
      id: 'pro-inactive', level: 'warn', area: 'retencion', tab: 'membresias', impact: 70, sample: n(o(people.stages).pro),
      title: `${int(n(people.proInactive))} cuentas Pro sin usar Bobby en 14+ días`,
      detail: 'Pagan (o tienen Pro regalado) y no lo usan: son las próximas cancelaciones.',
      action: 'Contáctalas antes de la renovación.',
      evidence: [`Pro inactivos: ${int(n(people.proInactive))}`],
    });
  }

  // ---------------------------------------------------------------- monetización
  const payments = { apple: Boolean(o(health.revenuecatWebhook).configured), stripe: Boolean(o(health.stripe).configured) };
  const subs = o(ov.subscriptions), revenue = o(ov.revenue);
  if (!payments.stripe) {
    add({
      id: 'web-cannot-pay', level: 'warn', area: 'monetizacion', tab: 'integraciones', impact: 62, sample: null,
      title: 'En la web nadie puede pagar Bobby Pro',
      detail: `Stripe no está configurado (faltan STRIPE_SECRET_KEY / STRIPE_PRICE_ID): el botón de pago de la web responde "aún no disponible".${payments.apple ? ' En iOS el cobro pasa por Apple/RevenueCat.' : ''}`,
      action: 'Configura Stripe en Vercel si quieres cobrar también en la web.',
      evidence: ['Stripe: sin configurar'],
    });
  }
  if (!ig.paywall) {
    add({
      id: 'paywall-off', level: 'info', area: 'monetizacion', tab: 'membresias', impact: 45, sample: null,
      title: 'El cobro está apagado: las cuentas gratis leen Rápido sin límite',
      detail: 'Los invitados siguen limitados a 3 lecturas y Profundo/Máximo se miden siempre; pero ninguna cuenta gratis llega al muro de pago de lecturas.',
      action: 'Enciende BOBBY_PAYWALL cuando iOS 1.5 (con compra in-app) esté publicado.',
      evidence: ['BOBBY_PAYWALL: apagado'],
    });
  }
  const wallLevel = n(outcomes.wallLevel), wallPay = n(outcomes.wallPaywall);
  if (wallLevel + wallPay > 0) {
    add({
      id: 'upgrade-intent', level: 'opportunity', area: 'monetizacion', tab: 'membresias', impact: 64, sample: wallLevel + wallPay,
      title: `${int(wallLevel + wallPay)} veces alguien quiso más de lo que su plan permite`,
      detail: `${int(wallLevel)} pidieron Profundo/Máximo por encima de su límite y ${int(wallPay)} chocaron con el muro de pago: es intención de compra.`,
      action: 'En ese momento ofrece Bobby Pro (y en la web, que se pueda pagar).',
      evidence: [`límite de nivel: ${int(wallLevel)}`, `muro de pago: ${int(wallPay)}`],
    });
  }
  if (n(subs.paid) === 0 && n(revenue.grossUsd) === 0) {
    add({
      id: 'no-payers', level: 'info', area: 'monetizacion', tab: 'funnel', impact: 30, sample: null,
      title: 'Todavía no hay pagadores',
      detail: `0 suscripciones pagadas y $0 en ${period}d${o(health.revenuecatWebhook).lastEventAt ? '' : '; además, nunca ha llegado un evento de compra (ni de prueba)'}. El LTV del Funnel es un escenario con supuestos, no una medición.`,
      action: 'Haz una compra de prueba en sandbox para confirmar que el webhook llega, antes de lanzar.',
      evidence: [`pagadas: 0`, `ingresos ${period}d: $0`],
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
