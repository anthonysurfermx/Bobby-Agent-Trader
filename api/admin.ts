// ============================================================
// /api/admin — the owner dashboard (bobbyprotocol.xyz/admin). Signed-in Apple/Google accounts listed in
// bobby_admins only (api/_lib/admin.ts). Every change is written to bobby_admin_actions.
//   GET ?view=me | overview&days=N | lifecycle&days=N | audience&days=N | users&q=&limit=&offset= | coupons | costs
//       | actions | members | internal          (&internal=1 includes the team's own traffic; default: left out)
//       overview also carries `growth` (bobby_admin_growth), Search Console and `insights` (api/_lib/admin-insights.ts).
//   POST { action: 'create-coupon' | 'set-coupon-active' | 'grant' | 'delete-user' | 'set-admin'
//          | 'credit-mark' | 'probe-llm' | 'add-cost' | 'delete-cost' | 'set-assumptions'
//          | 'set-internal' | 'set-device-internal' | 'remove-internal-network' | 'set-internal-emails'
//          | 'preview-digest' | 'send-digest', ... }
//   GET ?cron=digest — the daily digest email (Vercel cron, Bearer CRON_SECRET; api/_lib/admin-digest.ts).
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { enforcePublicRateLimit, isInternalRequest } from './_lib/request-security.js';
import {
  AdminError, actionsView, addCost, auditStart, costsView, couponsView, createCoupon, creditMark, deleteCost, deleteUser, grant, integrations,
  audienceView, internalView, lifecycleView, membersView, probeProvider, removeInternalNetwork, requireAdmin, rpc, searchConsole, setAdmin,
  setAssumptions, setCouponActive, setDeviceInternal, setInternal, setInternalEmails,
} from './_lib/admin.js';
import { buildInsights } from './_lib/admin-insights.js';
import { buildDigest, runDigest } from './_lib/admin-digest.js';
import { notifyOwner } from './_lib/provider-alert.js';
import { growthPlan } from './_lib/admin-plan.js';

/** The overview view in full: figures, integrations, growth, Search Console and the diagnosis built from them. */
async function overviewBundle(days: number, internal: boolean) {
  const overview = await rpc<{ days: string[] } & Record<string, unknown>>('bobby_admin_overview', { p_days: days, p_internal: internal });
  const [integ, growth, search] = await Promise.all([
    integrations(overview.days ?? []),
    rpc<Record<string, unknown>>('bobby_admin_growth', { p_days: days, p_internal: internal }),
    searchConsole(overview.days ?? []),
  ]);
  const insights = buildInsights({ days, overview, growth, integrations: integ, searchConsole: search });
  return { overview, integrations: integ, growth, searchConsole: search, insights };
}
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';

export const config = { maxDuration: 60 };

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as string | undefined;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await enforcePublicRateLimit(req, res, 'admin', 120, 60)) return;
  if (req.method === 'GET' && one(req.query.cron) === 'digest') {
    if (!isInternalRequest(req)) return res.status(401).json({ error: 'unauthorized' });
    try { return res.status(200).json(await runDigest()); } catch (e) {
      console.error('[admin] digest', e instanceof Error ? e.message : e);
      return res.status(502).json({ error: 'The digest could not be built.' });
    }
  }
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === 'GET') {
      const view = one(req.query.view) ?? 'overview';
      const internal = one(req.query.internal) === '1';
      const days = Math.min(Math.max(Number(one(req.query.days)) || 30, 1), 365);
      if (view === 'me') {
        const r = await fetch(bobbyRest(`bobby_identities?id=eq.${admin.id}&select=email`), { headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(4000) });
        const rows = r.ok ? ((await r.json()) as Array<{ email: string | null }>) : [];
        return res.status(200).json({ admin: true, email: rows[0]?.email ?? null, identityId: admin.id });
      }
      if (view === 'overview') {
        // compare=1: the dashboard's "vs previous period" request only needs the series.
        if (one(req.query.compare) === '1') {
          return res.status(200).json({ overview: await rpc('bobby_admin_overview', { p_days: days, p_internal: internal }), integrations: null });
        }
        return res.status(200).json(await overviewBundle(days, internal));
      }
      if (view === 'users') {
        const q = (one(req.query.q) ?? '').trim().slice(0, 120);
        const limit = Math.min(Math.max(Number(one(req.query.limit)) || 50, 1), 200);
        const offset = Math.max(Number(one(req.query.offset)) || 0, 0);
        return res.status(200).json(await rpc('bobby_admin_users', { p_query: q || null, p_limit: limit, p_offset: offset }));
      }
      if (view === 'lifecycle') return res.status(200).json(await lifecycleView(days, internal));
      if (view === 'audience') return res.status(200).json(await audienceView(days, internal));
      if (view === 'internal') return res.status(200).json(await internalView());
      if (view === 'costs') return res.status(200).json(await costsView());
      if (view === 'members') return res.status(200).json(await membersView());
      if (view === 'coupons') return res.status(200).json(await couponsView());
      if (view === 'actions') return res.status(200).json(await actionsView());
      return res.status(400).json({ error: 'Unknown view' });
    }

    let body: Record<string, unknown>;
    try { body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}) as Record<string, unknown>; }
    catch { return res.status(400).json({ error: 'Invalid JSON' }); }
    const ACTIONS = ['create-coupon', 'set-coupon-active', 'grant', 'delete-user', 'set-admin', 'credit-mark', 'probe-llm', 'add-cost', 'delete-cost', 'set-assumptions',
      'set-internal', 'set-device-internal', 'remove-internal-network', 'set-internal-emails', 'preview-digest', 'send-digest', 'growth-plan'];
    const action = typeof body.action === 'string' && ACTIONS.includes(body.action) ? body.action : null;
    if (!action) return res.status(400).json({ error: 'Unknown action' });
    // The audit row is written first (no row, no change); the outcome is added after.
    const target = typeof body.identityId === 'string' ? body.identityId : typeof body.code === 'string' ? body.code.toUpperCase()
      : typeof body.provider === 'string' ? body.provider : typeof body.id === 'number' ? String(body.id)
      : typeof body.device === 'string' ? body.device.slice(0, 10) : typeof body.network === 'string' ? body.network.slice(0, 10) : null;
    const { identityId: _i, confirm: _c, ...detail } = body;
    const finish = await auditStart(admin, action, target, detail);
    try {
      const result = await runAction(action, body);
      await finish('ok', result.audit ?? {});
      return res.status(200).json({ ok: true, ...result.body });
    } catch (e) {
      await finish('failed', { error: e instanceof AdminError ? e.message : 'error' });
      throw e;
    }
  } catch (e) {
    if (e instanceof AdminError) return res.status(e.status).json({ error: e.message });
    console.error('[admin]', e instanceof Error ? e.message : e);
    return res.status(502).json({ error: 'The dashboard data is temporarily unavailable. Try again.' });
  }

  async function runAction(action: string, body: Record<string, unknown>): Promise<{ body: Record<string, unknown>; audit?: Record<string, unknown> }> {
    switch (action) {
      case 'create-coupon': {
        const coupon = await createCoupon(body) as { code?: string } | null;
        return { body: { coupon }, audit: { code: coupon?.code ?? null } };
      }
      case 'set-coupon-active': return { body: { coupon: await setCouponActive(body.code, body.active) } };
      case 'grant': {
        const { target: email, result } = await grant(body);
        return { body: { ...result }, audit: { account: email } };
      }
      case 'delete-user': {
        const { target: email } = await deleteUser(admin!, body);
        return { body: {}, audit: { account: email } };
      }
      case 'set-admin': {
        const { target: email } = await setAdmin(admin!, body);
        return { body: {}, audit: { account: email } };
      }
      case 'credit-mark': await creditMark(body); return { body: {} };
      case 'probe-llm': {
        const probe = await probeProvider(body.provider);
        return { body: { ...probe }, audit: { result: probe.status, httpStatus: probe.httpStatus } };
      }
      case 'add-cost': return { body: { cost: await addCost(body) } };
      case 'delete-cost': return { body: {}, audit: { cost: await deleteCost(body.id) } };
      case 'set-assumptions': return { body: { assumptions: await setAssumptions(body) } };
      case 'set-internal': {
        const { target: account } = await setInternal(body);
        return { body: {}, audit: { account } };
      }
      case 'set-device-internal': await setDeviceInternal(body); return { body: {} };
      case 'remove-internal-network': await removeInternalNetwork(body); return { body: {} };
      case 'growth-plan': {
        const days = Math.min(Math.max(Number(body.days) || 30, 1), 365);
        const b = await overviewBundle(days, body.internal === true);
        const g = b.growth as Record<string, Record<string, unknown>>;
        const metrics = { days, people: g.people, cohorts: g.cohorts, outcomes: g.outcomes, acquisition: { visits: g.acquisition?.visits, visitors: g.acquisition?.visitors, visitsWithUtm: g.acquisition?.visitsWithUtm, sources: g.acquisition?.sources } };
        const plan = await growthPlan(b.insights, metrics, body.force === true);
        return { body: { plan }, audit: { cached: plan.cached, usd: plan.usd } };
      }
      case 'preview-digest': {
        const d = await buildDigest();
        return { body: { subject: d.subject, text: d.text, fresh: d.fresh.length, urgent: d.urgent.length, weekly: d.weekly } };
      }
      case 'send-digest': {
        const d = await buildDigest();
        notifyOwner(d.subject, d.text);
        return { body: { subject: d.subject }, audit: { subject: d.subject } };
      }
      case 'set-internal-emails': {
        const { emails } = await setInternalEmails(body);
        return { body: { emails }, audit: { count: emails.length } };
      }
      default:
        throw new AdminError(400, 'Unknown action');
    }
  }
}
