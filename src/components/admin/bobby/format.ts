import type { AdminUser, Coverage, MemberCommercial, MemberCommercialReason, TeamSeed } from '@/lib/admin-client';
import { MIN_BASE } from './deltas';

// Formatting for the owner dashboard (/admin). One language (Spanish, es-MX) and one set of rules:
// integers with thousands separators, USD with 2 decimals (LLM cents keep 3–4), short es-MX dates.

const INT = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
const DEC1 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });
const PCT = new Intl.NumberFormat('es-MX', { style: 'percent', maximumFractionDigits: 1 });
const USD2 = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DATE = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: '2-digit' });
const DATE_TIME = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const LIVE_TIME = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });
export const fmtTimestamp = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value)) ? LIVE_TIME.format(new Date(value)) : '—';
const DAY = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
const DAY_LONG = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const REL = new Intl.RelativeTimeFormat('es-MX', { numeric: 'auto' });

export const DASH = '—';

export const fmtInt = (v: number | null | undefined): string => (v == null || !Number.isFinite(v) ? DASH : INT.format(v));
export const fmtDec = (v: number | null | undefined): string => (v == null || !Number.isFinite(v) ? DASH : DEC1.format(v));

/** USD with 2 decimals. `precise` keeps LLM cents readable: $0.019, $0.0042. */
export function fmtUsd(v: number | null | undefined, precise = false): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (precise && abs > 0 && abs < 1) {
    const digits = abs < 0.01 ? 4 : 3;
    return `${sign}$${abs.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: digits })}`;
  }
  return `${sign}$${USD2.format(abs)}`;
}

/** a / b as a percentage, or a dash when there is no base. */
export function fmtPct(a: number, b: number): string {
  if (!b || !Number.isFinite(a) || !Number.isFinite(b)) return DASH;
  return PCT.format(a / b);
}
export const ratio = (a: number, b: number): number | null => (b > 0 && Number.isFinite(a) ? a / b : null);

/** Minutes as the unit a human would say: 12 min, 3.5 h, 2.1 d. */
export function fmtMinutes(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  if (v < 1) return '<1 min';
  if (v < 60) return `${INT.format(v)} min`;
  if (v < 1440) return `${DEC1.format(v / 60)} h`;
  return `${DEC1.format(v / 1440)} d`;
}

/** 'YYYY-MM-DD' as a local calendar day (never shifted by the UTC offset). */
export function parseDay(day: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(day);
}
export const fmtDayShort = (day: string): string => DAY.format(parseDay(day));
const MONTH = new Intl.DateTimeFormat('es-MX', { month: 'short' });
/** Axis label in the dashboard's mono caps: "01 OCT". */
export function fmtTick(day: string): string {
  const d = parseDay(day);
  return `${String(d.getDate()).padStart(2, '0')} ${MONTH.format(d).replace('.', '').toUpperCase()}`;
}

/** Big secondary numbers: 9,876 · 12.35k · 701.34m. */
export function fmtCompact(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  const abs = Math.abs(v);
  if (abs < 10_000) return fmtInt(v);
  if (abs < 1_000_000) return `${(v / 1_000).toFixed(2)}k`;
  return `${(v / 1_000_000).toFixed(2)}m`;
}
export const fmtDayLong = (day: string): string => DAY_LONG.format(parseDay(day));

/** Today's UTC calendar day ('YYYY-MM-DD'): the server dates costs in UTC, so the form does too. */
export const todayUtc = (now: Date = new Date()): string => now.toISOString().slice(0, 10);

function toDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? parseDay(v) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
export const fmtDate = (v: string | null | undefined): string => { const d = toDate(v); return d ? DATE.format(d) : DASH; };
export const fmtDateTime = (v: string | null | undefined): string => { const d = toDate(v); return d ? DATE_TIME.format(d) : DASH; };
/** A list of days ('YYYY-MM-DD', ascending) short enough for a caption: up to three by name, else the range. */
export function fmtDays(days: readonly string[]): string {
  if (!days.length) return DASH;
  return days.length <= 3 ? days.map(fmtDate).join(', ') : `del ${fmtDate(days[0])} al ${fmtDate(days[days.length - 1])}`;
}

/** "hace 3 horas", "ayer", "en 5 días". */
export function fmtRelative(v: string | null | undefined, now = Date.now()): string {
  const d = toDate(v);
  if (!d) return DASH;
  const sec = (d.getTime() - now) / 1000;
  const abs = Math.abs(sec);
  if (abs < 60) return 'ahora';
  if (abs < 3600) return REL.format(Math.round(sec / 60), 'minute');
  if (abs < 86400) return REL.format(Math.round(sec / 3600), 'hour');
  if (abs < 86400 * 45) return REL.format(Math.round(sec / 86400), 'day');
  if (abs < 86400 * 400) return REL.format(Math.round(sec / (86400 * 30)), 'month');
  return REL.format(Math.round(sec / (86400 * 365)), 'year');
}

export const timeOf = (v: string | null | undefined): number | null => toDate(v)?.getTime() ?? null;

/** ISO 8601 periods from RevenueCat ("P28D") in words. */
export function fmtPeriod(p: string | undefined): string {
  if (!p) return '';
  const m = /^P(\d+)([DWMY])$/.exec(p);
  if (!m) return p;
  const n = Number(m[1]);
  const unit = { D: n === 1 ? 'día' : 'días', W: n === 1 ? 'semana' : 'semanas', M: n === 1 ? 'mes' : 'meses', Y: n === 1 ? 'año' : 'años' }[m[2] as 'D' | 'W' | 'M' | 'Y'];
  return `${n} ${unit}`;
}

/** Gifted uses in one short line: "20 lecturas · 3 Profundo · 1 Máximo". */
export function fmtGift(reads?: number | null, profundo?: number | null, maximo?: number | null): string {
  const parts: string[] = [];
  if (reads) parts.push(`${fmtInt(reads)} ${reads === 1 ? 'lectura' : 'lecturas'}`);
  if (profundo) parts.push(`${fmtInt(profundo)} Profundo`);
  if (maximo) parts.push(`${fmtInt(maximo)} Máximo`);
  return parts.length ? parts.join(' · ') : DASH;
}

export const PROVIDER_LABEL: Record<string, string> = {
  apple: 'Apple', google: 'Google', twitter: 'Twitter / X', other: 'Otro proveedor', wallet: 'Wallet', email: 'Email', stripe: 'Stripe', revenuecat: 'RevenueCat',
  anthropic: 'Anthropic', openai: 'OpenAI', web: 'Web', ios: 'iOS', android: 'Android', unknown: 'Sin dato',
};
export const label = (k: string | null | undefined): string => (k ? PROVIDER_LABEL[k] ?? k : DASH);

export const STATUS_LABEL: Record<string, string> = {
  active: 'Activa', trialing: 'Prueba', canceled: 'Cancelada', cancelled: 'Cancelada', expired: 'Vencida',
  past_due: 'Pago pendiente', billing_issue: 'Problema de cobro', paused: 'Pausada', incomplete: 'Incompleta',
  unpaid: 'Sin pagar', refunded: 'Reembolsada', grace_period: 'Periodo de gracia',
};
export const statusLabel = (k: string | null | undefined): string => (k ? STATUS_LABEL[k] ?? k : DASH);

/** Subscription states that give Pro access (paying or not: the commercial class says which). */
export const ACTIVE_SUB = new Set(['active', 'trialing']);

const COMMERCIAL_LABEL: Record<MemberCommercial, string> = { paid: 'Pagando (verificado)', unverified: 'Sin verificar', test: 'De prueba', inactive: 'Inactiva' };
const COMMERCIAL_REASON_LABEL: Record<MemberCommercialReason, string> = {
  unknown_environment: 'entorno desconocido', no_charge: 'sin cobro registrado', unknown_period: 'periodo sin verificar', sandbox: 'sandbox', trial: 'periodo de prueba',
};
/** A membership's commercial class in words: "Sin verificar · entorno desconocido". Access is a separate fact. */
export function commercialLabel(commercial: MemberCommercial | null | undefined, reason?: MemberCommercialReason | null): string {
  if (!commercial) return DASH;
  const why = (commercial === 'unverified' || commercial === 'test') && reason ? COMMERCIAL_REASON_LABEL[reason] : null;
  return why ? `${COMMERCIAL_LABEL[commercial]} · ${why}` : COMMERCIAL_LABEL[commercial];
}

/** "sin el equipo", or "… · sin verificar" when this load could not mark the owner's browser (internalMarkFailed):
 *  then no caption claims a verified exclusion. */
export const teamOut = (markFailed = false, text = 'sin el equipo'): string => (markFailed ? `${text} · sin verificar` : text);

/** The reads caption follows the team switch, not whether the team happened to read in the period. An unknown count
 *  (null) is "—", and a failed /admin mark never prints "(0 en el periodo)" as if the exclusion were verified. */
export function teamReadsCaption(includeInternal: boolean, readsInternal: number | null, markFailed = false): string {
  if (includeInternal) return 'incluye las del equipo';
  if (markFailed) return teamOut(true, readsInternal != null && readsInternal > 0 ? `sin ${fmtInt(readsInternal)} del equipo` : 'sin las del equipo');
  if (readsInternal == null) return `sin las del equipo (${DASH} en el periodo)`;
  return readsInternal > 0 ? `sin ${fmtInt(readsInternal)} del equipo` : 'sin las del equipo (0 en el periodo)';
}

/** a of b as text: a percentage only with a base of MIN_BASE or more, else the raw counts. */
export function shareText(a: number, b: number): string {
  if (!b) return DASH;
  return b < MIN_BASE ? `${fmtInt(a)}/${fmtInt(b)} (muestra pequeña)` : `${fmtPct(a, b)} (n=${fmtInt(b)})`;
}

/** The audience tab's web location captions and countries count (F17): a value the server did not send is "—" or
 *  "dato no disponible", never a zero. `miss` = isMissing over the response; `since` = when location started. */
export function geoText(g: { web: { devices: number; measurable: number; located: number }; countries: Array<{ visitors: number }> },
  miss: (path: string) => boolean, period: number, since: string | null) {
  const located = g.countries.reduce((a, c) => a + c.visitors, 0);
  return {
    located: miss('geo.web.located') || miss('geo.web.measurable') ? 'dato no disponible'
      : g.web.measurable ? `${shareText(g.web.located, g.web.measurable)} de los que llegaron${since ? ` desde el ${since}` : ''} · ${period}d`
      : since ? `nadie llegó desde el ${since} · ${period}d` : 'la ubicación aún no se registra',
    noLocation: miss('geo.web.devices') ? 'dato no disponible'
      : since ? `llegaron antes del ${since}, cuando aún no se registraba · de ${fmtInt(g.web.devices)} nuevos` : `de ${fmtInt(g.web.devices)} instalaciones web nuevas · ${period}d`,
    countriesCount: miss('geo.countries') ? DASH : `${fmtInt(g.countries.length)} países · n=${fmtInt(located)}`,
  };
}

const TEAM_SEED_LABEL: Record<TeamSeed, string> = {
  email: 'cuenta de la lista de emails del equipo', install_mark: 'instalación marcada', admin_session: 'instalación que abrió /admin',
  network: 'red del equipo', admin: 'cuenta admin', mark: 'cuenta marcada',
};
/** Why the D2 rule makes this account the team's, in words ("por estar ligada a una instalación marcada (ab12cd34ef…)"),
 *  or null when the server sent no reason (an admin or a hand mark needs none). */
export function teamReason(u: Pick<AdminUser, 'id' | 'team_seed' | 'team_seed_ref'>): string | null {
  if (!u.team_seed) return null;
  const ref = u.team_seed_ref ?? '';
  if (u.team_seed === 'email' && ref === u.id) return 'por su email (lista de emails del equipo)';
  const short = u.team_seed === 'install_mark' || u.team_seed === 'admin_session' || u.team_seed === 'network' ? ref : ref.slice(0, 8);
  return `por estar ligada a una ${TEAM_SEED_LABEL[u.team_seed]} (${short}…)`;
}

/** The status to show: an "active" subscription whose period already ended is shown as expired. */
export function effectiveSubStatus(status: string | null | undefined, periodEnd: string | null | undefined, now = Date.now()): string | null {
  if (!status) return null;
  const end = timeOf(periodEnd);
  return ACTIVE_SUB.has(status) && end != null && end <= now ? 'expired' : status;
}

export function lastActivity(u: AdminUser): string | null {
  const a = timeOf(u.last_seen_at);
  const b = timeOf(u.last_read_at);
  if (a == null && b == null) return null;
  return (a ?? 0) >= (b ?? 0) ? u.last_seen_at : u.last_read_at;
}


export type ValueFormat = 'int' | 'usd' | 'usd-precise';
export const fmtValue = (v: number, f: ValueFormat): string => (f === 'int' ? fmtInt(v) : fmtUsd(v, f === 'usd-precise'));

/** Since when each source has data, so no number implies an older history than there is. */
export function coverageLine(c: Coverage | null | undefined): string {
  if (!c) return 'Cobertura de datos no disponible.';
  const since = (v: string | null, none: string) => (v ? fmtDate(v) : none);
  // bobby_reads keeps 35 days; the history is the shorter of that and the first recorded read.
  const readDays = c.readsSince ? Math.min(35, Math.max(1, Math.ceil((Date.now() - new Date(c.readsSince).getTime()) / 86_400_000))) : 0;
  return `Visitas desde ${since(c.eventsSince, 'sin eventos')} · lecturas desde ${since(c.readsSince, 'sin lecturas')}${readDays ? ` (${readDays} ${readDays === 1 ? 'día' : 'días'} de historia)` : ''} · resultados del desk ${c.outcomesSince ? `desde ${fmtDate(c.outcomesSince)}` : 'aún sin registros'} · compras ${c.purchasesSince ? `desde ${fmtDate(c.purchasesSince)}` : 'nunca recibidas'}`;
}
