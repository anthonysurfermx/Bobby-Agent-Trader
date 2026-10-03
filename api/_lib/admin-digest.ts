// ============================================================
// The owner's digest: the dashboard's diagnosis (admin-insights.ts) pushed by email, so a problem does not wait
// for someone to open /admin. Daily cron (vercel.json, /api/admin?cron=digest): it sends only when an urgent or
// to-attend finding appears that was not sent this ISO week (Monday to Sunday, UTC); on Mondays it sends the weekly
// summary anyway. Built from the same diagnosis bundle as the panel (overviewBundle, networks included).
// A finding counts as sent only after Resend accepted the email ("accepted" is not "delivered"): each run claims
// its week keys atomically first (bobby_cache_claim), marks them sent on acceptance and releases them otherwise,
// so a refused or unconfigured email is retried on the next run and two concurrent runs never both send.
// Same sender and recipient as the credit alerts (provider-alert.ts). The text carries figures and actions only:
// no user emails, questions or free text.
// ============================================================
import { createHash, randomBytes } from 'node:crypto';
import { claimCache, getCache, releaseCache, setCache } from './api-cache.js';
import { sendOwnerEmail } from './provider-alert.js';
import type { Insight } from './admin-insights.js';
import { overviewBundle, rpc } from './admin.js';
import { withAdminDeadline } from './admin-read.js';

const WEEK_DAYS = 7;
const CLAIM_SEC = 600;             // a send in flight holds its keys this long
const SENT_SEC = 8 * 86_400;       // a sent key outlives the ISO week it names

export interface Digest { subject: string; text: string; urgent: Insight[]; fresh: Insight[]; weekly: boolean; isoWeek: string }
export interface DigestRun { sent: boolean; accepted: boolean; emailId: string | null; error: string | null; fresh: number; weekly: boolean }

const o = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
/** A figure the server did not send is unknown ("—"), never 0. */
const fig = (v: unknown) => { const x = Number(v); return v == null || v === '' || !Number.isFinite(x) ? '—' : String(x); };

/** ISO-8601 week of the UTC date, `YYYY-Www` (2026-10-02 → 2026-W40, 2026-12-31 → 2026-W53). */
export function isoWeek(ms: number): string {
  const d = new Date(ms);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7)); // the Thursday of the week decides its year
  const week = Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
// Keys carry a hash of the finding id, never its text.
const findingKey = (week: string, id: string) => `admin-digest:${week}:${createHash('sha256').update(id).digest('hex').slice(0, 16)}`;
const weeklyKey = (week: string) => `admin-digest:${week}:weekly`;

interface Gathered { insights: Insight[]; urgent: Insight[]; fresh: Insight[]; weekly: boolean; isoWeek: string; kpis: string[]; missing: string[] }

/** The panel's diagnosis for the last 7 days (outside traffic only) and what this week has not sent yet. */
async function gather(now: number): Promise<Gathered> {
  const b = await overviewBundle(WEEK_DAYS, false);
  const week = isoWeek(now);
  const urgent = b.insights.filter((i) => i.level === 'critical' || i.level === 'warn');
  const seen = await Promise.all(urgent.map((i) => getCache(findingKey(week, i.id))));
  const fresh = urgent.filter((_, k) => seen[k] === null);
  const missing = b.missing;
  // An incomplete diagnosis can send verified operational findings, but cannot consume this week's full summary.
  const weekly = missing.length === 0 && new Date(now).getUTCDay() === 1 && (await getCache(weeklyKey(week))) === null;
  const people = o(o(b.growth).people), ov = o(b.overview), acc = o(ov.accounts), act = o(ov.activity), subs = o(ov.subscriptions);
  const kpis = [
    `Sujetos observados activos (7 días): ${fig(people.active7d)} · leyeron: ${fig(people.readers7d)}`,
    `Lecturas (7 días): ${fig(act.reads)} · cuentas nuevas: ${fig(acc.new)} · pagando Pro (verificado): ${fig(subs.paidVerified ?? subs.paid)} · Pro sin verificar: ${fig(subs.unverified)}`,
  ];
  return { insights: b.insights, urgent, fresh, weekly, isoWeek: week, kpis, missing };
}

/** Subject and text for `list`; `fresh` are the new findings it reports (they decide the subject). */
function compose(g: Gathered, list: Insight[], fresh: Insight[], weekly: boolean): { subject: string; text: string } {
  const critical = fresh.filter((i) => i.level === 'critical');
  const title = critical.length
    ? `Bobby: ${critical.length} urgente${critical.length === 1 ? '' : 's'} — ${critical[0].title}`
    : weekly ? `Bobby: resumen semanal (${g.urgent.length} por atender)`
      : fresh.length ? `Bobby: ${fresh.length} hallazgo${fresh.length === 1 ? '' : 's'} nuevo${fresh.length === 1 ? '' : 's'}`
        : g.missing.length ? 'Bobby: diagnóstico parcial — fuentes pendientes'
          : `Bobby: resumen del panel (${g.urgent.length} por atender)`;
  const subject = g.missing.length && (critical.length || fresh.length) ? `${title} (diagnóstico parcial)` : title;
  const block = (i: Insight) => [`• ${i.title}`, `  ${i.detail}`, `  Qué hacer: ${i.action}`].join('\n');
  const text = [
    weekly ? 'Resumen semanal de Bobby (sin el tráfico del equipo).'
      : fresh.length ? 'Hay hallazgos nuevos en el panel de Bobby (sin el tráfico del equipo).' : 'Resumen del panel de Bobby (sin el tráfico del equipo).',
    '',
    ...(g.missing.length ? [`Diagnóstico parcial: no se pudieron consultar ${g.missing.join(', ')}. Los hallazgos siguientes usan las fuentes disponibles; no confirman que no haya otros pendientes.`, ''] : []),
    ...g.kpis,
    '',
    ...list.map(block),
    '',
    'Detalle y números: https://bobbyprotocol.xyz/admin',
    'No repito un mismo hallazgo en la misma semana (lunes a domingo, UTC).',
  ].join('\n');
  return { subject, text };
}

/** The weekly summary: the top 6 findings plus every new one it reports, in the panel's order. */
const weeklyList = (insights: Insight[], fresh: Insight[]) => {
  const ids = new Set([...insights.slice(0, 6), ...fresh].map((i) => i.id));
  return insights.filter((i) => ids.has(i.id));
};

/** What the next send would say: the new findings, the weekly summary on Mondays, or the top 6 when nothing is new. */
export async function buildDigest(now = Date.now()): Promise<Digest> {
  const g = await gather(now);
  const list = g.weekly ? weeklyList(g.insights, g.fresh) : g.fresh.length ? g.fresh : g.insights.slice(0, 6);
  return { ...compose(g, list, g.fresh, g.weekly), urgent: g.urgent, fresh: g.fresh, weekly: g.weekly, isoWeek: g.isoWeek };
}

/** Serialize cron batches before gathering. Per-finding claims alone can split a concurrent gather into two emails. */
export async function runDigest(now = Date.now()): Promise<DigestRun> {
  // Daily retention also runs without client traffic. Old schemas and unavailable storage do not stop the digest.
  try { await withAdminDeadline(1000, () => rpc('bobby_prune_client_telemetry', { p_force: true })); }
  catch { console.warn('[admin-digest] client telemetry retention unavailable'); }
  const key = 'admin-digest:run-lock';
  const nonce = randomBytes(12).toString('hex');
  const claimed = await claimCache(key, 120, { nonce });
  if (claimed !== true) return { sent: false, accepted: false, emailId: null,
    error: claimed === null ? 'dedup_lock_unavailable' : null, fresh: 0, weekly: false };
  try { return await runDigestUnlocked(now); }
  finally { await releaseCache(key, nonce); }
}

/** The cron's run: claim what is new this week, send it, and mark it sent only if Resend accepted the email. */
async function runDigestUnlocked(now: number): Promise<DigestRun> {
  const g = await gather(now);
  const none: DigestRun = { sent: false, accepted: false, emailId: null, error: null, fresh: 0, weekly: false };
  // Claims go in one fixed order (the weekly key, then the findings as ranked) and stop at the first refusal (or an
  // unavailable claim): two concurrent runs then never both send, and nothing unclaimed is reported as sent.
  const claimed: string[] = [];
  const fresh: Insight[] = [];
  if (g.weekly) {
    if (await claimCache(weeklyKey(g.isoWeek), CLAIM_SEC, { state: 'sending' }) !== true) return none;
    claimed.push(weeklyKey(g.isoWeek));
  }
  for (const i of g.fresh) {
    const key = findingKey(g.isoWeek, i.id);
    if (await claimCache(key, CLAIM_SEC, { state: 'sending' }) !== true) break;
    claimed.push(key);
    fresh.push(i);
  }
  if (!claimed.length) return none;
  const { subject, text } = compose(g, g.weekly ? weeklyList(g.insights, fresh) : fresh, fresh, g.weekly);
  const email = await sendOwnerEmail(subject, text);
  if (email.accepted) {
    const at = new Date(now).toISOString();
    await Promise.all(claimed.map((key) => setCache(key, { state: 'sent', at, emailId: email.id ?? null }, SENT_SEC)));
  } else {
    await Promise.all(claimed.map((key) => releaseCache(key)));
  }
  return { sent: email.accepted, accepted: email.accepted, emailId: email.id ?? null, error: email.error ?? null, fresh: fresh.length, weekly: g.weekly };
}

/** The admin's "send now": the same digest, sent at once; it marks nothing as sent (the cron keeps its own week). */
export async function sendDigestNow(now = Date.now()): Promise<{ subject: string; accepted: boolean; emailId: string | null; error: string | null }> {
  const d = await buildDigest(now);
  const email = await sendOwnerEmail(d.subject, d.text);
  return { subject: d.subject, accepted: email.accepted, emailId: email.id ?? null, error: email.error ?? null };
}
