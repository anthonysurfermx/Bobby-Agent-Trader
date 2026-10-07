// What is working and what is not, from evidence (config + the last delivery of each source), as rows a
// human can act on. Single source for the header count, the Integraciones rows, "Qué falla" and the LLM
// provider state, so a row can never say "Conectado" while the header counts it as a problem.
import type { AdminIntegrations, AdminOverview, LlmProvider, LlmProviderStats, RevenueCatMetric, SearchConsoleData } from '@/lib/admin-client';
import { fmtDate, fmtDateTime, fmtDays, fmtInt, fmtPeriod, fmtRelative, fmtUsd, timeOf } from './format';

const HOUR = 3_600_000;
export const LLM_NAME: Record<LlmProvider, string> = { anthropic: 'Anthropic', openai: 'OpenAI' };
const KEY_ENV: Record<LlmProvider, string> = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY' };

// ---------------------------------------------------------------- LLM providers

export type LlmStateKey = 'no_credit' | 'failing' | 'depleted' | 'credit' | 'unknown';
export interface LlmState { key: LlmStateKey; tone: 'red' | 'green' | 'neutral'; label: string; detail: string | null }

/**
 * A provider's state, by priority: a credit alert newer than the last top-up (more than $0) with no OK call or
 * probe after it — a balance mark never heals it, whatever its amount; then half or more of the last 24 h failing
 * (at least 3 calls); then the estimate from a balance mark; otherwise nothing is known. Spend in the ledger is a
 * floor, so an estimate at or below $0 is empty.
 */
export function llmProviderState(p: LlmProviderStats): LlmState {
  const alertAt = timeOf(p.lastCreditAlert);
  const resetAt = timeOf(p.lastTopup) ?? -Infinity;
  const okAt = timeOf(p.lastOk);
  // Healed only by a top-up or an OK strictly after the alert (same rule as the "Dónde mejorar" insight).
  if (alertAt != null && alertAt >= resetAt && (okAt == null || okAt <= alertAt)) {
    const where = [p.creditAlert?.endpoint, p.creditAlert?.code].filter(Boolean).join(', ');
    return { key: 'no_credit', tone: 'red', label: 'Sin crédito', detail: `Sin crédito desde ${fmtDateTime(p.lastCreditAlert)}${where ? ` (${where})` : ''}` };
  }
  if (p.calls24h >= 3 && p.failures24h / p.calls24h >= 0.5) {
    return { key: 'failing', tone: 'red', label: 'Fallando', detail: `${fmtInt(p.failures24h)} de ${fmtInt(p.calls24h)} llamadas fallaron en las últimas 24 h` };
  }
  if (p.estimatedLeft != null) {
    if (p.estimatedLeft <= 0) return { key: 'depleted', tone: 'red', label: 'Saldo estimado agotado', detail: `Estimado ${fmtUsd(p.estimatedLeft)}: si ya recargaste, registra el saldo nuevo` };
    return { key: 'credit', tone: 'green', label: `Con crédito ≈ ${fmtUsd(p.estimatedLeft)}`, detail: null };
  }
  return { key: 'unknown', tone: 'neutral', label: 'Sin saldo registrado', detail: null };
}

// ---------------------------------------------------------------- RevenueCat metrics (Integraciones + Membresías)

/** RevenueCat's own units: '#' is a plain count, '$' money, '%' a percentage. */
export function rcMetricValue(m: RevenueCatMetric): string {
  const u = m.unit?.trim();
  if (!u || u === '#') return fmtInt(m.value);
  if (u === '$' || /^usd$/i.test(u)) return fmtUsd(m.value);
  if (u === '%') return `${fmtInt(m.value)}%`;
  return `${fmtInt(m.value)} ${u}`;
}
/** The metric's window in words; P0D is a point-in-time value. */
export function rcMetricWindow(period: string | undefined): string {
  if (!period) return '';
  if (/^P0[DWMY]$/.test(period)) return 'ahora';
  return `últimos ${fmtPeriod(period)}`;
}

// ---------------------------------------------------------------- integration checks

export type IntegrationStatus = 'ok' | 'warn' | 'error' | 'off';
export type IntegrationId = 'tracking' | 'reads' | 'rcWebhook' | 'stripe' | 'rcMetrics' | 'appStore' | 'searchConsole' | `llm-${LlmProvider}` | 'paywall' | 'vercel';
export interface IntegrationCheck {
  id: IntegrationId; name: string; status: IntegrationStatus; tag: string; detail: string;
  /** Set when the row needs action; `level` says how urgent. */
  problem: { text: string; level: 'error' | 'warn' } | null;
}
export interface IntegrationProblem { id: string; text: string; level: 'error' | 'warn' }

const err = (text: string) => ({ text, level: 'error' as const });
const warn = (text: string) => ({ text, level: 'warn' as const });

/**
 * Every integration row. `sc` undefined = Search Console not loaded yet; null = not available.
 * `overview` adds the LLM providers' evidence (credit alerts, failures); without it only the keys are checked.
 */
export function integrationChecks(i: AdminIntegrations, sc?: SearchConsoleData | null, overview?: AdminOverview | null, now = Date.now()): IntegrationCheck[] {
  const h = i.health;
  const rows: IntegrationCheck[] = [];
  const noHealth = { status: 'off' as const, tag: 'Sin dato', detail: 'Estado no disponible', problem: null };

  // Web events: a write error in the last 24 h, or visits silent for 48 h while reads keep arriving, means
  // /api/track is broken rather than nobody visiting.
  if (!h) rows.push({ id: 'tracking', name: 'Eventos web', ...noHealth });
  else {
    const t = h.tracking;
    const lastEvent = timeOf(t.lastEventAt), lastError = timeOf(t.lastErrorAt), lastRead = timeOf(t.lastReadAt);
    const base = `última visita ${t.lastEventError ? 'no disponible' : t.lastEventAt ? fmtRelative(t.lastEventAt, now) : 'nunca'} · ${t.events24h != null ? fmtInt(t.events24h) : '—'} en 24 h`;
    const errorLine = t.healthError ? ' · estado de escrituras no disponible' : t.lastErrorAt ? ` · último fallo al guardar ${fmtRelative(t.lastErrorAt, now)}${t.lastError ? ` (${t.lastError})` : ''}` : ' · sin fallos registrados al guardar';
    const silentButReading = lastRead != null && (lastEvent == null ? true : now - lastEvent > 48 * HOUR && lastRead > lastEvent);
    if (lastError != null && now - lastError < 24 * HOUR) {
      rows.push({ id: 'tracking', name: 'Eventos web', status: 'error', tag: 'Falla al guardar', detail: base + errorLine,
        problem: err(`Eventos web: falló al guardar una visita ${fmtRelative(t.lastErrorAt, now)}${t.lastError ? ` (${t.lastError})` : ''}`) });
    } else if (t.lastEventError || t.eventsError || t.lastReadError || t.healthError) {
      rows.push({ id: 'tracking', name: 'Eventos web', status: 'warn', tag: 'Consulta parcial', detail: base + errorLine + ' · una lectura de esta fuente no está disponible',
        problem: warn('Eventos web: no se pudo consultar toda la evidencia; vuelve a actualizar antes de juzgar su entrega') });
    } else if (silentButReading) {
      rows.push({ id: 'tracking', name: 'Eventos web', status: 'error', tag: 'Visitas sin llegar', detail: base + errorLine,
        problem: err(`Eventos web: ${t.lastEventAt ? `no llegan visitas desde ${fmtRelative(t.lastEventAt, now)}` : 'nunca ha llegado una visita'}, pero hubo lecturas ${fmtRelative(t.lastReadAt, now)}`) });
    } else if (lastEvent == null) {
      rows.push({ id: 'tracking', name: 'Eventos web', status: 'warn', tag: 'Sin eventos', detail: base + errorLine, problem: null });
    } else if ((t.events24h ?? 0) > 0) {
      rows.push({ id: 'tracking', name: 'Eventos web', status: 'ok', tag: 'Recibiendo', detail: base + errorLine, problem: null });
    } else {
      rows.push({ id: 'tracking', name: 'Eventos web', status: 'warn', tag: 'Sin visitas hoy', detail: base + errorLine, problem: null });
    }
  }

  if (!h) rows.push({ id: 'reads', name: 'Lecturas', ...noHealth });
  else {
    const r = h.tracking.lastReadAt;
    rows.push(h.tracking.lastReadError ? { id: 'reads', name: 'Lecturas', status: 'warn', tag: 'No disponible',
      detail: 'No se pudo consultar la última lectura; su ausencia no está confirmada', problem: null }
      : { id: 'reads', name: 'Lecturas', status: r ? 'ok' : 'off', tag: r ? 'Registrando' : 'Sin lecturas',
        detail: r ? `última lectura ${fmtRelative(r, now)} (${fmtDateTime(r)}) · cualquier plataforma` : 'Aún no se registra ninguna lectura', problem: null });
  }

  // RevenueCat webhook: configured but never a single event (not even a test) cannot be told apart from broken.
  if (!h) rows.push({ id: 'rcWebhook', name: 'Webhook RevenueCat', ...noHealth });
  else {
    const wh = h.revenuecatWebhook;
    const tail = `${wh.events30d != null ? fmtInt(wh.events30d) : '—'} eventos en 30 días`;
    if (!wh.configured) rows.push({ id: 'rcWebhook', name: 'Webhook RevenueCat', status: 'error', tag: 'Sin configurar', detail: 'Faltan REVENUECAT_SECRET_KEY y/o REVENUECAT_WEBHOOK_AUTH', problem: err('Webhook de RevenueCat sin configurar: las compras de iOS no llegan a Bobby') });
    else if (wh.lastEventError) rows.push({ id: 'rcWebhook', name: 'Webhook RevenueCat', status: 'warn', tag: 'No disponible', detail: `No se pudo consultar el último evento · ${tail}`, problem: warn('RevenueCat: consulta de entrega no disponible; vuelve a actualizar') });
    else if (!wh.lastEventAt) rows.push({ id: 'rcWebhook', name: 'Webhook RevenueCat', status: 'warn', tag: 'Nunca ha llegado nada', detail: `Configurado · nunca ha llegado un evento (ni de prueba) · ${tail}`, problem: warn('Webhook de RevenueCat configurado pero nunca ha llegado un evento: manda uno de prueba desde RevenueCat → Integrations → Webhooks') });
    else rows.push({ id: 'rcWebhook', name: 'Webhook RevenueCat', status: wh.eventsError ? 'warn' : 'ok', tag: wh.eventsError ? 'Conteo no disponible' : 'Recibiendo', detail: `último evento ${fmtRelative(wh.lastEventAt, now)} · ${tail}`, problem: null });
  }

  if (!h) rows.push({ id: 'stripe', name: 'Stripe (cobro web)', ...noHealth });
  else {
    const st = h.stripe;
    const last = st.lastEventError ? 'último evento no disponible' : st.lastEventAt ? `último evento ${fmtRelative(st.lastEventAt, now)}` : 'nunca ha llegado un evento';
    if (!st.configured) rows.push({ id: 'stripe', name: 'Stripe (cobro web)', status: 'warn', tag: 'Sin configurar', detail: `Sin STRIPE_SECRET_KEY / STRIPE_PRICE_ID · webhook ${st.webhook ? 'sí' : 'no'} · ${last}`, problem: warn('Stripe sin configurar: la web no puede cobrar Bobby Pro') });
    else if (!st.webhook) rows.push({ id: 'stripe', name: 'Stripe (cobro web)', status: 'error', tag: 'Sin webhook', detail: `Cobro configurado · falta STRIPE_WEBHOOK_SECRET · ${last}`, problem: err('Stripe cobra pero falta STRIPE_WEBHOOK_SECRET: los pagos web no se registran') });
    else rows.push({ id: 'stripe', name: 'Stripe (cobro web)', status: st.lastEventAt && !st.lastEventError ? 'ok' : 'warn', tag: st.lastEventError ? 'No disponible' : st.lastEventAt ? 'Recibiendo' : 'Sin eventos', detail: `Cobro y webhook configurados · ${last}`, problem: null });
  }

  const rc = i.revenuecat;
  rows.push(!rc.configured
    ? { id: 'rcMetrics', name: 'RevenueCat · métricas', status: 'off', tag: 'Sin conectar', detail: 'Necesita REVENUECAT_V2_SECRET_KEY', problem: null }
    : rc.error
      ? { id: 'rcMetrics', name: 'RevenueCat · métricas', status: 'error', tag: 'Con error', detail: rc.error, problem: err(`RevenueCat: ${rc.error}`) }
      : !rc.metrics || !rc.fetchedAt
        ? { id: 'rcMetrics', name: 'RevenueCat · métricas', status: 'warn', tag: 'Configurado', detail: 'Falta una consulta confirmada; la configuración no demuestra entrega de métricas.', problem: null }
        : { id: 'rcMetrics', name: 'RevenueCat · métricas', status: 'ok', tag: 'Con datos', detail: `${fmtInt(rc.metrics.length)} métricas · consultado ${fmtRelative(rc.fetchedAt, now)}`, problem: null });

  const as = i.appStore;
  if (!as.configured) rows.push({ id: 'appStore', name: 'App Store Connect', status: 'off', tag: 'Sin conectar', detail: 'Necesita la llave de App Store Connect API', problem: null });
  else if (as.error) rows.push({ id: 'appStore', name: 'App Store Connect', status: 'error', tag: 'Con error', detail: as.error, problem: err(`App Store Connect: ${as.error}`) });
  else {
    const range = as.coveredFrom ? `reportes del ${fmtDate(as.coveredFrom)} al ${fmtDate(as.coveredTo)}` : 'sin reportes publicados en el periodo';
    const pending = as.pendingDays?.length ? ` · Apple aún no publica: ${as.pendingDays.map(fmtDate).join(', ')}` : '';
    const dl = as.totals ? ` · ${fmtInt(as.totals.downloads)} descargas` : '';
    // Out of time budget: the totals cover the loaded days only (not a broken integration, but not complete either).
    const missingDays = as.missingDays ?? [];
    const partial = as.partial ? ` · carga parcial: faltan ${fmtInt(missingDays.length)} ${missingDays.length === 1 ? 'día' : 'días'}${missingDays.length ? ` (${fmtDays(missingDays)})` : ''}` : '';
    rows.push({ id: 'appStore', name: 'App Store Connect', status: as.partial ? 'warn' : 'ok', tag: as.partial ? 'Parcial' : 'Conectado', detail: range + dl + pending + partial, problem: null });
  }

  if (sc === undefined) rows.push({ id: 'searchConsole', name: 'Google Search Console', status: 'off', tag: 'Revisando', detail: 'Consultando…', problem: null });
  else if (sc === null) rows.push({ id: 'searchConsole', name: 'Google Search Console', status: 'off', tag: 'Sin dato', detail: 'El servidor no envió Search Console', problem: null });
  else if (!sc.configured) rows.push({ id: 'searchConsole', name: 'Google Search Console', status: 'off', tag: 'Sin conectar', detail: 'Necesita GSC_SERVICE_ACCOUNT_JSON', problem: null });
  else if (sc.error) rows.push({ id: 'searchConsole', name: 'Google Search Console', status: 'error', tag: 'Con error', detail: sc.error, problem: err(`Search Console: ${sc.error}`) });
  else if (!sc.totals) rows.push({ id: 'searchConsole', name: 'Google Search Console', status: 'warn', tag: 'Sin reporte', detail: 'Google no devolvió reportes publicados; el total no se puede afirmar como cero.', problem: null });
  else rows.push({ id: 'searchConsole', name: 'Google Search Console', status: sc.partial ? 'warn' : 'ok', tag: sc.partial ? 'Parcial' : 'Con reporte', detail: `${sc.site ? `${sc.site} · ` : ''}${fmtInt(sc.totals.clicks)} clics · ${fmtInt(sc.totals.impressions)} impresiones${sc.partial ? ` · faltan ${sc.missingDays?.length ?? 0} días; ${sc.incompleteDays?.length ?? 0} provisionales` : ' en el periodo'}`, problem: null });

  // LLM keys: configured is not enough, the provider has to be answering (same rule as the IA tab).
  for (const p of ['anthropic', 'openai'] as const) {
    const name = `IA · ${LLM_NAME[p]}`;
    if (!h) { rows.push({ id: `llm-${p}`, name, ...noHealth }); continue; }
    if (!h.llmKeys[p]) {
      // The env var is already listed under "Variables que faltan" when the server reports it.
      const listed = i.missing.includes(KEY_ENV[p]);
      rows.push({ id: `llm-${p}`, name, status: 'error', tag: 'Sin llave', detail: `Falta ${KEY_ENV[p]}`, problem: listed ? null : err(`${name}: falta la llave ${KEY_ENV[p]}`) });
      continue;
    }
    const stats = overview?.llm.providers[p];
    if (!stats) { rows.push({ id: `llm-${p}`, name, status: 'warn', tag: 'Llave configurada', detail: 'Sin datos de uso para confirmar que responde', problem: null }); continue; }
    const s = llmProviderState(stats);
    const last = `última llamada OK ${stats.lastOk ? fmtRelative(stats.lastOk, now) : 'nunca registrada'}`;
    if (s.tone === 'red') rows.push({ id: `llm-${p}`, name, status: 'error', tag: s.label, detail: `${s.detail ?? s.label} · ${last}`, problem: err(`${name}: ${s.detail ?? s.label}`) });
    else {
      const recentOk = timeOf(stats.lastOk) != null && now - timeOf(stats.lastOk)! < 24 * HOUR;
      rows.push({ id: `llm-${p}`, name, status: recentOk ? 'ok' : 'warn', tag: recentOk ? 'Respuesta observada' : 'Sin respuesta reciente', detail: `${last} · ${s.key === 'credit' ? s.label : 'sin saldo registrado'}`, problem: null });
    }
  }

  rows.push(i.paywall == null ? { id: 'paywall', name: 'Cobro (BOBBY_PAYWALL)', status: 'off', tag: 'Pendiente de consulta', detail: 'El servidor todavía no confirmó el estado del cobro', problem: null } : {
    id: 'paywall', name: 'Cobro (BOBBY_PAYWALL)', status: i.paywall ? 'ok' : 'off', tag: i.paywall ? 'Encendido' : 'Apagado',
    detail: i.paywall
      ? 'Invitados: 6 lecturas y luego cuenta · cuentas gratis: límite semanal de lecturas, después Bobby Pro · Profundo y Máximo siempre con su propio límite'
      : 'Invitados: 6 lecturas y luego cuenta · cuentas gratis: Rápido sin límite · Profundo y Máximo siempre con su propio límite (también en Pro)',
    problem: null,
  });
  rows.push({ id: 'vercel', name: 'Vercel Analytics', status: 'off', tag: 'No verificable desde aquí', detail: 'Sin API de lectura: revisa el panel de Vercel para confirmar que recibe visitas', problem: null });
  return rows;
}

/** Every problem with its urgency: the rows that need action, an unreadable health block and missing env vars. */
export function integrationIssues(i: AdminIntegrations, sc?: SearchConsoleData | null, overview?: AdminOverview | null): IntegrationProblem[] {
  const out: IntegrationProblem[] = [];
  if (!i.health) out.push({ id: 'health', text: 'Estado de las integraciones no disponible', level: 'error' });
  for (const c of integrationChecks(i, sc, overview)) if (c.problem) out.push({ id: c.id, ...c.problem });
  for (const name of i.missing) out.push({ id: `env-${name}`, text: `Falta ${name}`, level: 'error' });
  return out;
}

/** The header count and "Qué falla". `overview` is optional so older callers keep working. */
export function integrationProblems(i: AdminIntegrations, sc?: SearchConsoleData | null, overview?: AdminOverview | null): string[] {
  return integrationIssues(i, sc, overview).map((p) => p.text);
}
