// ============================================================
// /api/track — first-party funnel events for the owner dashboard (bobby_events, migration 20261001180000).
// POST { event, surface?, device?, platform?, referrer?, utm? } (JSON, or text/plain from sendBeacon) → 204.
// bobby_record_event stores the event and touches the device (bobby_devices: first touch, active days).
//   event: visit | desk_entered | appstore_click | signin_start | paywall_view | purchase_start
//   engaged (first real interaction on a page) is not a funnel event: it only marks the install (bobby_mark_device_signal),
//   as does a web visit that arrives from a hosting network. Both feed the traffic split of the dashboard.
// The install id is stored as the same salted hash the read meter uses (api/_lib/access.ts), so a visit and
// a later guest read of the same browser line up; no IP, user agent, URL path beyond a short surface name,
// or free text is kept. Referrers keep their host only. Web events keep the country and region Vercel derives
// from the IP (api/_lib/geo.ts); the IP itself is not stored.
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { createLimiter, getClientIpKey, saltedKey } from './_lib/rate-limit.js';
import { fromDatacenter, requestGeo } from './_lib/geo.js';
import { callerHash } from './_lib/access.js';
import { resolveIdentity } from './_lib/user-identity.js';

export const config = { maxDuration: 10 };

const EVENTS = new Set(['visit', 'desk_entered', 'appstore_click', 'signin_start', 'paywall_view', 'purchase_start', 'engaged']);
const markSignal = (device: string, signal: { p_engaged?: boolean; p_datacenter?: boolean }) =>
  fetch(bobbyRest('rpc/bobby_mark_device_signal'), { method: 'POST', headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(2000),
    body: JSON.stringify({ p_device: device, ...signal }) }).then(() => undefined, () => undefined);
const OWN_HOSTS = /(^|\.)(bobbyprotocol\.xyz|vercel\.app|localhost)$/;
const limiter = createLimiter(120, 60_000);
// Crawlers and link previewers that run JS (Googlebot, Bytespider, headless Chrome, Lighthouse…) are not visitors:
// their events are dropped before storage. The user agent is only matched here, never stored.
const BOT_UA = /bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|bytespider|petalbot|python-requests|curl\/|wget|go-http-client|okhttp|axios|node-fetch|phantomjs|puppeteer|playwright|selenium/i;
export const isBotUserAgent = (ua: unknown) => typeof ua !== 'string' || !ua.trim() || BOT_UA.test(ua);

export function normalizeEvent(raw: Record<string, unknown>, now = Date.now()) {
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
  // Preserve capture order when the analytics queue reaches us after Checkout. Old clients or invalid clocks
  // retain server receipt time. The database applies the same bound; the client cannot arbitrarily backdate.
  const at = typeof raw.at === 'number' && Number.isSafeInteger(raw.at) && raw.at >= now - 5 * 60_000 && raw.at <= now + 1000
    ? new Date(raw.at).toISOString() : null;
  return { event, at, platform, surface, device_hash: device, referrer, utm_source: /^[a-z0-9_.-]{1,40}$/.test(utm) ? utm : null };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (limiter.check(getClientIpKey(req)).limited) return res.status(429).end();
  if (isBotUserAgent(req.headers['user-agent'])) return res.status(204).end();
  let raw: Record<string, unknown>;
  try { raw = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}) as Record<string, unknown>; }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  const row = normalizeEvent(raw);
  if (!row) return res.status(400).json({ error: 'Unknown event' });
  if (row.event === 'engaged') {
    // A signal about the install, best effort: a lost one leaves it unverified, which is what it was.
    if (row.device_hash && row.platform === 'web') await markSignal(row.device_hash, { p_engaged: true });
    return res.status(204).end();
  }
  const geo = requestGeo(req);
  let failure: string | null = null;
  try {
    // Never accept an identity from the body. A signed-in event links the anonymous install to the same
    // canonical Bobby identity used by authoritative checkout and billing events.
    const identity = await resolveIdentity(req);
    const r = await fetch(bobbyRest('rpc/bobby_record_event'), {
      method: 'POST', headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(3000),
      body: JSON.stringify({
        p_event: row.event, p_platform: row.platform, p_surface: row.surface, p_device: row.device_hash, p_referrer: row.referrer, p_utm: row.utm_source,
        p_identity: identity?.id ?? null, p_at: row.at,
        ...(row.platform === 'web' ? { p_country: geo.country, p_region: geo.region } : {}), p_network: callerHash(req),
      }),
    });
    if (!r.ok) failure = `storage ${r.status}`;
    else if (row.event === 'visit' && row.platform === 'web' && row.device_hash && fromDatacenter(req)) await markSignal(row.device_hash, { p_datacenter: true });
  } catch (e) {
    failure = e instanceof Error ? e.name : 'error';
  }
  if (!failure) return res.status(204).end();
  // A lost event is visible to the owner (Integraciones reads api_cache 'track-health'), never silent.
  console.error('[track]', failure);
  await fetch(bobbyRest('api_cache?on_conflict=cache_key'), {
    method: 'POST', headers: { ...bobbyServiceHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' }, signal: AbortSignal.timeout(2000),
    body: JSON.stringify({ cache_key: 'track-health', payload: { lastErrorAt: new Date().toISOString(), error: failure.slice(0, 40) },
      expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), updated_at: new Date().toISOString() }),
  }).catch(() => null);
  return res.status(503).end();
}
