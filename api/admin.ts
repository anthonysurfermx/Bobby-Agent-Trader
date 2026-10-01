// ============================================================
// /api/admin — the owner dashboard (bobbyprotocol.xyz/admin). Signed-in Apple/Google accounts listed in
// bobby_admins only (api/_lib/admin.ts). Every change is written to bobby_admin_actions.
//   GET ?view=me | overview&days=N | lifecycle&days=N | users&q=&limit=&offset= | coupons | costs | actions
//   POST { action: 'create-coupon' | 'set-coupon-active' | 'grant' | 'delete-user' | 'set-admin'
//          | 'credit-mark' | 'probe-llm' | 'add-cost' | 'delete-cost' | 'set-assumptions', ... }
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { enforcePublicRateLimit } from './_lib/request-security.js';
import {
  AdminError, actionsView, addCost, auditStart, costsView, couponsView, createCoupon, creditMark, deleteCost, deleteUser, grant, integrations,
  audienceView, lifecycleView, membersView, probeProvider, requireAdmin, rpc, setAdmin, setAssumptions, setCouponActive,
} from './_lib/admin.js';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';

export const config = { maxDuration: 60 };

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as string | undefined;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await enforcePublicRateLimit(req, res, 'admin', 120, 60)) return;
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === 'GET') {
      const view = one(req.query.view) ?? 'overview';
      if (view === 'me') {
        const r = await fetch(bobbyRest(`bobby_identities?id=eq.${admin.id}&select=email`), { headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(4000) });
        const rows = r.ok ? ((await r.json()) as Array<{ email: string | null }>) : [];
        return res.status(200).json({ admin: true, email: rows[0]?.email ?? null, identityId: admin.id });
      }
      if (view === 'overview') {
        const days = Math.min(Math.max(Number(one(req.query.days)) || 30, 1), 365);
        const overview = await rpc<{ days: string[] }>('bobby_admin_overview', { p_days: days });
        // compare=1: the dashboard's "vs previous period" request only needs the series.
        if (one(req.query.compare) === '1') return res.status(200).json({ overview, integrations: null });
        return res.status(200).json({ overview, integrations: await integrations(overview.days ?? []) });
      }
      if (view === 'users') {
        const q = (one(req.query.q) ?? '').trim().slice(0, 120);
        const limit = Math.min(Math.max(Number(one(req.query.limit)) || 50, 1), 200);
        const offset = Math.max(Number(one(req.query.offset)) || 0, 0);
        return res.status(200).json(await rpc('bobby_admin_users', { p_query: q || null, p_limit: limit, p_offset: offset }));
      }
      if (view === 'lifecycle') return res.status(200).json(await lifecycleView(Math.min(Math.max(Number(one(req.query.days)) || 30, 1), 365)));
      if (view === 'audience') return res.status(200).json(await audienceView(Math.min(Math.max(Number(one(req.query.days)) || 30, 1), 365)));
      if (view === 'costs') return res.status(200).json(await costsView());
      if (view === 'members') return res.status(200).json(await membersView());
      if (view === 'coupons') return res.status(200).json(await couponsView());
      if (view === 'actions') return res.status(200).json(await actionsView());
      return res.status(400).json({ error: 'Unknown view' });
    }

    let body: Record<string, unknown>;
    try { body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}) as Record<string, unknown>; }
    catch { return res.status(400).json({ error: 'Invalid JSON' }); }
    const ACTIONS = ['create-coupon', 'set-coupon-active', 'grant', 'delete-user', 'set-admin', 'credit-mark', 'probe-llm', 'add-cost', 'delete-cost', 'set-assumptions'];
    const action = typeof body.action === 'string' && ACTIONS.includes(body.action) ? body.action : null;
    if (!action) return res.status(400).json({ error: 'Unknown action' });
    // The audit row is written first (no row, no change); the outcome is added after.
    const target = typeof body.identityId === 'string' ? body.identityId : typeof body.code === 'string' ? body.code.toUpperCase()
      : typeof body.provider === 'string' ? body.provider : typeof body.id === 'number' ? String(body.id) : null;
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
      default:
        throw new AdminError(400, 'Unknown action');
    }
  }
}
