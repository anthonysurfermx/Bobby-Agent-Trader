// ============================================================
// /api/admin — the owner dashboard (bobbyprotocol.xyz/admin). Signed-in Apple/Google accounts listed in
// bobby_admins only (api/_lib/admin.ts). Every change is written to bobby_admin_actions.
//   GET ?view=me | overview&days=N | lifecycle&days=N | audience&days=N | users&q=&limit=&offset= | coupons | costs
//       | actions | members | internal          (&internal=1 includes the team's own traffic; default: left out)
//       overview carries first-party growth/insights; view=integrations loads delayed providers separately.
//       view=live reads the 15-minute/hour/day server outcomes; every read exposes source metadata.
//   POST { action: 'create-coupon' | 'set-coupon-active' | 'grant' | 'delete-user' | 'set-admin'
//          | 'credit-mark' | 'probe-llm' | 'add-cost' | 'delete-cost' | 'set-assumptions'
//          | 'set-internal' | 'set-device-internal' | 'remove-internal-network' | 'set-internal-emails'
//          | 'preview-digest' | 'send-digest', ... }
//   GET ?cron=digest — the daily digest email (Vercel cron, Bearer CRON_SECRET; api/_lib/admin-digest.ts).
//   GET ?cron=amplitude — forwards outside events to Amplitude every 15 min (api/_lib/amplitude.ts).
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { enforcePublicRateLimit, isInternalRequest } from './_lib/request-security.js';
import {
  AdminError, actionsView, addCost, auditStart, costsView, couponsView, createCoupon, creditMark, deleteCost, deleteUser, grant,
  audienceView, internalView, lifecycleView, membersView, probeProvider, removeInternalNetwork, requireAdmin, rpc, setAdmin,
  setAssumptions, setCouponActive, setDeviceInternal, setInternal, setInternalEmails, overviewBundle, providerBundle, resyncMembership,
} from './_lib/admin.js';
import { buildDigest, runDigest, sendDigestNow } from './_lib/admin-digest.js';
import { runAmplitude } from './_lib/amplitude.js';
import { growthPlan } from './_lib/admin-plan.js';

import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { adminBounded, adminFetch, adminInteger, adminReadMeta, observeAdminSource, withAdminDeadline, withAdminRead } from './_lib/admin-read.js';

export const config = { maxDuration: 60 };

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as string | undefined;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cron = one(req.query.cron);
  return withAdminRead(() => dispatch(req, res), { budgetMs: req.method === 'GET' && !cron ? 15_000 : 50_000 });
}

async function dispatch(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await withAdminDeadline(1200, () => enforcePublicRateLimit(req, res, 'admin', 120, 60, { transport: { fetch: adminFetch, body: adminBounded } }))) return;
  if (req.method === 'GET' && one(req.query.cron) === 'digest') {
    if (!isInternalRequest(req)) return res.status(401).json({ error: 'unauthorized' });
    try { return res.status(200).json(await runDigest()); } catch (e) {
      console.error('[admin] digest', e instanceof Error ? e.message : e);
      return res.status(502).json({ error: 'The digest could not be built.' });
    }
  }
  if (req.method === 'GET' && one(req.query.cron) === 'amplitude') {
    if (!isInternalRequest(req)) return res.status(401).json({ error: 'unauthorized' });
    try { return res.status(200).json(await runAmplitude()); } catch (e) {
      console.error('[admin] amplitude', e instanceof Error ? e.message : e);
      return res.status(502).json({ error: 'The Amplitude export failed; it retries on the next run.' });
    }
  }
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === 'GET') {
      const view = one(req.query.view) ?? 'overview';
      const internal = one(req.query.internal) === '1';
      const days = adminInteger(one(req.query.days), 30, 1, 365);
      const reply = (body: unknown) => res.status(200).json({ ...(body as Record<string, unknown>), internalMarkFailed: admin.internalMarkFailed, meta: adminReadMeta() });
      if (view === 'me') {
        const me = await observeAdminSource('me', async () => {
          const response = await fetch(bobbyRest(`bobby_identities?id=eq.${admin.id}&select=email`), { headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(4000) });
          if (!response.ok) throw new Error('identity_read_unavailable');
          return await response.json() as Array<{ email: string | null }>;
        });
        // The identity was authenticated above. An absent optional email is not a failed admin check.
        return reply({ admin: true, email: me?.[0]?.email ?? null, identityId: admin.id });
      }
      if (view === 'overview') {
        if (one(req.query.compare) === '1') {
          return reply({ overview: await observeAdminSource('overview', () => rpc('bobby_admin_overview', { p_days: days, p_internal: internal }), true), integrations: null });
        }
        return reply(await overviewBundle(days, internal, { coreOnly: true }));
      }
      if (view === 'integrations') return reply(await providerBundle(days));
      if (view === 'live') {
        const [server, client] = await Promise.all([
          withAdminDeadline(7000, () => observeAdminSource('live', () => rpc<Record<string, unknown>>('bobby_admin_server_live', { p_internal: internal }), true)),
          withAdminDeadline(4000, () => observeAdminSource('clientLive', () => rpc<Record<string, unknown>>('bobby_admin_client_live', { p_internal: internal }))),
        ]);
        return reply({ live: { ...server, client }, missing: client == null ? ['clientLive'] : [] });
      }
      if (view === 'users') {
        const q = (one(req.query.q) ?? '').trim().slice(0, 120);
        const limit = adminInteger(one(req.query.limit), 50, 1, 200);
        const offset = adminInteger(one(req.query.offset), 0, 0, 1_000_000);
        return reply(await observeAdminSource('users', () => rpc('bobby_admin_users', { p_query: q || null, p_limit: limit, p_offset: offset }), true));
      }
      if (view === 'lifecycle') return reply(await lifecycleView(days, internal));
      if (view === 'audience') return reply(await audienceView(days, internal));
      if (view === 'internal') return reply(await observeAdminSource('internal', internalView, true));
      if (view === 'costs') return reply(await observeAdminSource('costs', costsView, true));
      if (view === 'members') return reply(await observeAdminSource('members', () => membersView(internal), true));
      if (view === 'coupons') return reply(await observeAdminSource('coupons', couponsView, true));
      if (view === 'actions') return reply(await observeAdminSource('actions', actionsView, true));
      return res.status(400).json({ error: 'Unknown view', meta: adminReadMeta() });
    }

    let body: Record<string, unknown>;
    try { body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}) as Record<string, unknown>; }
    catch { return res.status(400).json({ error: 'Invalid JSON' }); }
    const ACTIONS = ['create-coupon', 'set-coupon-active', 'grant', 'delete-user', 'set-admin', 'credit-mark', 'probe-llm', 'add-cost', 'delete-cost', 'set-assumptions',
      'set-internal', 'set-device-internal', 'remove-internal-network', 'set-internal-emails', 'preview-digest', 'send-digest', 'growth-plan', 'resync-membership'];
    const action = typeof body.action === 'string' && ACTIONS.includes(body.action) ? body.action : null;
    if (!action) return res.status(400).json({ error: 'Unknown action' });
    // Grant receipt, balance and audit must commit together. A lost HTTP/DB response is retried with
    // the same operation id; the generic per-request audit below would incorrectly duplicate it.
    if (action === 'grant') {
      const { result } = await grant(admin, body);
      return res.status(200).json(result);
    }
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
    if (e instanceof AdminError) return res.status(e.status).json({ error: e.message, ...(req.method === 'GET' ? { meta: adminReadMeta() } : {}) });
    console.error('[admin]', e instanceof Error ? e.message : e);
    return res.status(502).json({ error: 'The dashboard data is temporarily unavailable. Try again.', ...(req.method === 'GET' ? { meta: adminReadMeta() } : {}) });
  }

  async function runAction(action: string, body: Record<string, unknown>): Promise<{ body: Record<string, unknown>; audit?: Record<string, unknown> }> {
    switch (action) {
      case 'create-coupon': {
        const coupon = await createCoupon(body) as { code?: string } | null;
        return { body: { coupon }, audit: { code: coupon?.code ?? null } };
      }
      case 'set-coupon-active': return { body: { coupon: await setCouponActive(body.code, body.active) } };
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
        const days = adminInteger(body.days, 30, 1, 365);
        const b = await overviewBundle(days, body.internal === true, { cacheOnly: true, budgetMs: 4000 });
        if (b.growth == null) throw new AdminError(503, 'The growth facts are unavailable. Try again.');
        const g = b.growth as Record<string, Record<string, unknown>>;
        const metrics = { days, people: g.people, cohorts: g.cohorts, outcomes: g.outcomes, acquisition: { visits: g.acquisition?.visits, visitors: g.acquisition?.visitors, visitsWithUtm: g.acquisition?.visitsWithUtm, sources: g.acquisition?.sources } };
        const plan = await growthPlan(b.insights, metrics, body.force === true, { deadline: Date.now() + 30_000, team: body.internal === true ? 'included' : admin!.internalMarkFailed ? 'unverified' : 'excluded' });
        return { body: { plan, internalMarkFailed: admin!.internalMarkFailed }, audit: { cached: plan.cached, usd: plan.usd } };
      }
      case 'preview-digest': {
        const d = await buildDigest();
        return { body: { subject: d.subject, text: d.text, fresh: d.fresh.length, urgent: d.urgent.length, weekly: d.weekly } };
      }
      case 'send-digest': {
        const d = await sendDigestNow();
        return { body: { subject: d.subject, accepted: d.accepted, emailId: d.emailId, emailError: d.error }, audit: { subject: d.subject, accepted: d.accepted } };
      }
      case 'resync-membership': {
        const { revenuecatActive, accessKept, subscription } = await resyncMembership(body);
        return { body: { revenuecatActive, accessKept, subscription }, audit: { revenuecatActive, environment: subscription?.environment ?? null, periodType: subscription?.periodType ?? null } };
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
