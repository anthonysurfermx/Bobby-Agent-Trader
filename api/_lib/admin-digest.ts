// ============================================================
// The owner's digest: the dashboard's diagnosis (admin-insights.ts) pushed by email, so a problem does not wait
// for someone to open /admin. Daily cron (vercel.json, /api/admin?cron=digest): it sends only when an urgent or
// to-attend finding appears that was not sent in the last 7 days; on Mondays it sends the weekly summary anyway.
// Same sender and recipient as the credit alerts (provider-alert.ts notifyOwner). The text carries figures and
// actions only: no user emails, questions or free text.
// ============================================================
import { getCache, setCache } from './api-cache.js';
import { sendOwnerEmail } from './provider-alert.js';
import { buildInsights, type Insight } from './admin-insights.js';
import { integrations, rpc, searchConsole } from './admin.js';

const SENT_KEY = 'admin-digest:sent';
const RESEND_AFTER_DAYS = 7;
const WEEK_DAYS = 7;

export interface Digest { subject: string; text: string; urgent: Insight[]; fresh: Insight[]; weekly: boolean }

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const o = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/** Builds the digest from the same figures as the dashboard (last 7 days, outside traffic only). */
export async function buildDigest(now = Date.now()): Promise<Digest> {
  const overview = await rpc<{ days: string[] } & Record<string, unknown>>('bobby_admin_overview', { p_days: WEEK_DAYS, p_internal: false });
  const [integ, growth, search, networks] = await Promise.all([
    integrations(overview.days ?? []),
    rpc<Record<string, unknown>>('bobby_admin_growth', { p_days: WEEK_DAYS, p_internal: false }),
    searchConsole(overview.days ?? []),
    rpc<unknown[]>('bobby_admin_internal_networks', {}).catch(() => []),
  ]);
  // Same inputs as the dashboard's diagnosis, networks included (F03).
  const insights = buildInsights({ days: WEEK_DAYS, overview, growth, integrations: integ, searchConsole: search, networks, now });
  const urgent = insights.filter((i) => i.level === 'critical' || i.level === 'warn');
  const sent = ((await getCache(SENT_KEY)) ?? {}) as Record<string, string>;
  const fresh = urgent.filter((i) => !sent[i.id] || now - Date.parse(sent[i.id]) > RESEND_AFTER_DAYS * 86_400_000);
  // The weekly summary is due once per ISO week, from Monday on (a failed Monday is retried the next day).
  const weekly = new Date(now).getUTCDay() !== 0 && sent[`weekly:${isoWeek(now)}`] === undefined;

  const people = o(growth.people), acc = o(overview.accounts), act = o(overview.activity), subs = o(overview.subscriptions);
  const kpis = [
    `Personas activas (7 días): ${n(people.active7d)} · leyeron: ${n(people.readers7d)}`,
    `Lecturas (7 días): ${n(act.reads)} · cuentas nuevas: ${n(acc.new)} · pagando Pro: ${n(subs.paid)}`,
  ];
  const block = (i: Insight) => [`• ${i.title}`, `  ${i.detail}`, `  Qué hacer: ${i.action}`].join('\n');
  const list = weekly ? insights.slice(0, 6) : fresh;
  const subject = fresh.some((i) => i.level === 'critical')
    ? `Bobby: ${fresh.filter((i) => i.level === 'critical').length} urgente${fresh.filter((i) => i.level === 'critical').length === 1 ? '' : 's'} — ${fresh[0].title}`
    : weekly ? `Bobby: resumen semanal (${urgent.length} por atender)` : `Bobby: ${fresh.length} hallazgo${fresh.length === 1 ? '' : 's'} nuevo${fresh.length === 1 ? '' : 's'}`;
  const text = [
    weekly ? 'Resumen semanal de Bobby (sin el tráfico del equipo).' : 'Hay hallazgos nuevos en el panel de Bobby (sin el tráfico del equipo).',
    '',
    ...kpis,
    '',
    ...list.map(block),
    '',
    'Detalle y números: https://bobbyprotocol.xyz/admin',
    `No repito un mismo hallazgo durante ${RESEND_AFTER_DAYS} días.`,
  ].join('\n');
  return { subject, text, urgent, fresh, weekly };
}

function isoWeek(now: number): string {
  const d = new Date(now); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const w1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return `${d.getUTCFullYear()}-W${1 + Math.round(((d.getTime() - w1.getTime()) / 86_400_000 - 3 + ((w1.getUTCDay() + 6) % 7)) / 7)}`;
}

/** Sends a built digest and, only once Resend accepted it, remembers what went out (F03). */
export async function deliverDigest(d: Digest, now = Date.now()): Promise<{ sent: boolean; accepted: boolean; reason: string | null }> {
  const result = await sendOwnerEmail(d.subject, d.text);
  if (!result.accepted) return { sent: false, accepted: false, reason: result.reason ?? 'rejected' };
  const sent = ((await getCache(SENT_KEY)) ?? {}) as Record<string, string>;
  for (const i of d.weekly ? d.urgent : d.fresh) sent[i.id] = new Date(now).toISOString();
  if (d.weekly) sent[`weekly:${isoWeek(now)}`] = new Date(now).toISOString();
  await setCache(SENT_KEY, sent, 30 * 86_400);
  return { sent: true, accepted: true, reason: null };
}

/** The cron's run: send when there is something new (or the weekly summary is due). One run per UTC day claims the
 *  slot first, so two overlapping runs never send twice; a rejected send releases it. */
export async function runDigest(now = Date.now()): Promise<{ sent: boolean; fresh: number; weekly: boolean; reason?: string | null }> {
  const d = await buildDigest(now);
  if (!d.fresh.length && !d.weekly) return { sent: false, fresh: 0, weekly: false };
  const claim = `admin-digest:claim:${new Date(now).toISOString().slice(0, 10)}`;
  if (await getCache(claim)) return { sent: false, fresh: d.fresh.length, weekly: d.weekly, reason: 'already_running' };
  await setCache(claim, { at: new Date(now).toISOString() }, 20 * 3600);
  const r = await deliverDigest(d, now);
  if (!r.accepted) await setCache(claim, null, 1);
  return { sent: r.sent, fresh: d.fresh.length, weekly: d.weekly, reason: r.reason };
}
