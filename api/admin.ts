// ============================================================
// /api/admin — the owner dashboard (bobbyprotocol.xyz/admin). Signed-in Apple/Google accounts listed in
// bobby_admins only (api/_lib/admin.ts). Every change is written to bobby_admin_actions.
//   GET ?view=me | overview&days=N | users&q=&limit=&offset= | coupons | actions
//   POST { action: 'create-coupon' | 'set-coupon-active' | 'grant' | 'delete-user' | 'set-admin'
//          | 'credit-mark' | 'probe-llm', ... }
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { enforcePublicRateLimit } from './_lib/request-security.js';
import {
  AdminError, actionsView, couponsView, createCoupon, creditMark, deleteUser, grant, integrations, logAction,
  probeProvider, requireAdmin, rpc, setAdmin, setCouponActive,
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
      if (view === 'coupons') return res.status(200).json(await couponsView());
      if (view === 'actions') return res.status(200).json(await actionsView());
      return res.status(400).json({ error: 'Unknown view' });
    }

    let body: Record<string, unknown>;
    try { body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}) as Record<string, unknown>; }
    catch { return res.status(400).json({ error: 'Invalid JSON' }); }
    switch (body.action) {
      case 'create-coupon': {
        const coupon = await createCoupon(body) as { code?: string } | null;
        await logAction(admin, 'create-coupon', coupon?.code ?? null, { reads: body.reads, profundo: body.profundo, maximo: body.maximo, maxRedemptions: body.maxRedemptions ?? null, expiresAt: body.expiresAt ?? null });
        return res.status(200).json({ ok: true, coupon });
      }
      case 'set-coupon-active': {
        const coupon = await setCouponActive(body.code, body.active) as { code?: string };
        await logAction(admin, 'set-coupon-active', coupon?.code ?? null, { active: body.active });
        return res.status(200).json({ ok: true, coupon });
      }
      case 'grant': {
        const { target, result } = await grant(body);
        await logAction(admin, 'grant', target, { reads: body.reads ?? 0, profundo: body.profundo ?? 0, maximo: body.maximo ?? 0, proDays: body.proDays ?? 0 });
        return res.status(200).json({ ok: true, ...result });
      }
      case 'delete-user': {
        const { target } = await deleteUser(admin, body);
        await logAction(admin, 'delete-user', target);
        return res.status(200).json({ ok: true });
      }
      case 'set-admin': {
        const { target } = await setAdmin(admin, body);
        await logAction(admin, 'set-admin', target, { admin: body.admin });
        return res.status(200).json({ ok: true });
      }
      case 'credit-mark': {
        const mark = await creditMark(body);
        await logAction(admin, 'credit-mark', mark.provider, { kind: mark.kind, amountUsd: mark.amount });
        return res.status(200).json({ ok: true });
      }
      case 'probe-llm': {
        const probe = await probeProvider(body.provider);
        await logAction(admin, 'probe-llm', String(body.provider), { status: probe.status, httpStatus: probe.httpStatus });
        return res.status(200).json({ ok: true, ...probe });
      }
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (e) {
    if (e instanceof AdminError) return res.status(e.status).json({ error: e.message });
    console.error('[admin]', e instanceof Error ? e.message : e);
    return res.status(502).json({ error: 'The dashboard data is temporarily unavailable. Try again.' });
  }
}
