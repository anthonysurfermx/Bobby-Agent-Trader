// ============================================================
// /api/track — first-party funnel events for the owner dashboard (bobby_events, migration 20261001180000).
// POST { event, surface?, device?, platform?, referrer?, utm? } (JSON, or text/plain from sendBeacon) → 204.
// bobby_record_event stores the event and touches the device (bobby_devices: first touch, active days).
//   event: visit | appstore_click | signin_start | paywall_view | purchase_start
// The install id is stored as the same salted hash the read meter uses (api/_lib/access.ts), so a visit and
// a later guest read of the same browser line up; no IP, user agent, URL path beyond a short surface name,
// or free text is kept. Referrers keep their host only.
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { createLimiter, getClientIpKey, saltedKey } from './_lib/rate-limit.js';

export const config = { maxDuration: 10 };

const EVENTS = new Set(['visit', 'appstore_click', 'signin_start', 'paywall_view', 'purchase_start']);
const OWN_HOSTS = /(^|\.)(bobbyprotocol\.xyz|vercel\.app|localhost)$/;
const limiter = createLimiter(120, 60_000);

export function normalizeEvent(raw: Record<string, unknown>) {
  const event = typeof raw.event === 'string' && EVENTS.has(raw.event) ? raw.event : null;
  if (!event) return null;
  const platform = raw.platform === 'ios' || raw.platform === 'android' ? raw.platform : 'web';
  const surface = typeof raw.surface === 'string' && /^[a-z0-9_-]{1,32}$/.test(raw.surface) ? raw.surface : null;
  let device: string | null = null;
  if (typeof raw.device === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(raw.device)) {
    try { device = saltedKey(`device:${raw.device}`); } catch { device = null; }
  }
  let referrer: string | null = null;
  if (typeof raw.referrer === 'string' && raw.referrer) {
    try {
      const host = new URL(raw.referrer).hostname.toLowerCase().replace(/^www\./, '');
      referrer = !OWN_HOSTS.test(host) && /^[a-z0-9.-]{1,80}$/.test(host) ? host : null;
    } catch { referrer = null; }
  }
  const utm = typeof raw.utm === 'string' ? raw.utm.toLowerCase().trim() : '';
  return { event, platform, surface, device_hash: device, referrer, utm_source: /^[a-z0-9_.-]{1,40}$/.test(utm) ? utm : null };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (limiter.check(getClientIpKey(req)).limited) return res.status(429).end();
  let raw: Record<string, unknown>;
  try { raw = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}) as Record<string, unknown>; }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  const row = normalizeEvent(raw);
  if (!row) return res.status(400).json({ error: 'Unknown event' });
  try {
    const r = await fetch(bobbyRest('rpc/bobby_record_event'), {
      method: 'POST', headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(3000),
      body: JSON.stringify({ p_event: row.event, p_platform: row.platform, p_surface: row.surface, p_device: row.device_hash, p_referrer: row.referrer, p_utm: row.utm_source }),
    });
    if (!r.ok) console.error('[track] insert', r.status);
  } catch (e) {
    console.error('[track]', e instanceof Error ? e.message : e);
  }
  return res.status(204).end();
}
