// Client-reported lifecycle and rendered-response acknowledgement. No prompt, IP, raw installation,
// bearer, URL or free text is stored. Missing telemetry never prevents a reading or changes access.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { waitUntil } from '@vercel/functions';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { requestOriginHost } from './_lib/origins.js';
import { enforcePublicRateLimit } from './_lib/request-security.js';
import { resolveIdentity } from './_lib/user-identity.js';
import { isBotUserAgent } from './track.js';
import { saltedKey } from './_lib/rate-limit.js';
import { adminBounded, adminFetch, withAdminDeadline, withAdminRead } from './_lib/admin-read.js';
import { CLIENT_EVENT_MAX_BYTES, clientBinding, normalizeClientEvent, clientBuildLabels, admitClientInstallation, verifyClientReadReceipt } from './_lib/client-telemetry.js';

export const config = { maxDuration: 10 };
const transport = { fetch: adminFetch, body: adminBounded };
/** Ingestion is public and unauthenticated: it stays off until the owner sets BOBBY_CLIENT_TELEMETRY=on (the same
 *  convention as BOBBY_MEMORY). Off answers 204 before any origin, auth, limiter or storage work. */
export const clientTelemetryOn = () => (process.env.BOBBY_CLIENT_TELEMETRY || '').trim().toLowerCase() === 'on';

async function recordFailure(error: string, authenticated: boolean) {
  try {
    // A fresh short budget remains below the platform limit even when the main read budget expired.
    await withAdminRead(() => adminFetch(bobbyRest('api_cache?on_conflict=cache_key'), {
      method: 'POST', headers: bobbyServiceHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      signal: AbortSignal.timeout(1000), body: JSON.stringify({ cache_key: 'client-telemetry-health',
        payload: { lastErrorAt: new Date().toISOString(), error, authenticated },
        expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), updated_at: new Date().toISOString() }),
    }, 1000), { budgetMs: 1000 });
  } catch { /* A complete database outage cannot record its own health; client receives explicit 503. */ }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Preview must never add client reports or health/rate rows to a shared database.
  if (process.env.VERCEL_ENV === 'preview') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).json({ error: 'Telemetry unavailable in preview' });
  }
  if (!clientTelemetryOn()) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(204).end();
  }
  return withAdminRead(() => dispatch(req, res), { budgetMs: 8000 });
}

async function dispatch(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (isBotUserAgent(req.headers['user-agent'])) return res.status(204).end();
  if (!requestOriginHost(req.headers)) return res.status(403).json({ error: 'Origin not allowed' });
  let raw: unknown;
  try {
    const encoded = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (!encoded || Buffer.byteLength(encoded, 'utf8') > CLIENT_EVENT_MAX_BYTES) return res.status(413).json({ error: 'Event too large' });
    raw = JSON.parse(encoded);
  } catch { return res.status(400).json({ error: 'Invalid event' }); }
  const event = normalizeClientEvent(raw);
  if (!event) return res.status(400).json({ error: 'Invalid event' });
  let phase = 'rate_limit';
  try {
    if (!await withAdminDeadline(1200, () => enforcePublicRateLimit(req, res, 'client-telemetry', 240, 60, { transport }))) return;
    const credential = req.headers.authorization || req.headers['x-bobby-session'];
    phase = 'auth';
    const identity = credential ? await withAdminDeadline(3500, () => resolveIdentity(req, transport)) : null;
    // A submitted bad/expired credential cannot silently become another anonymous session.
    if (credential && !identity) return res.status(401).json({ error: 'Session unavailable' });
    const binding = clientBinding(req, identity);
    if (!binding) return res.status(400).json({ error: 'Installation unavailable' });
    if (!admitClientInstallation(req, binding.device)) {
      res.setHeader('Retry-After', '600');
      return res.status(429).json({ error: 'Installation limit exceeded' });
    }
    let receiptId: string | null = null, requestId = event.requestId;
    if (event.receipt) {
      const receipt = verifyClientReadReceipt(event.receipt, binding);
      if (!receipt || (requestId !== null && requestId !== receipt.requestId)) return res.status(400).json({ error: 'Receipt unavailable' });
      receiptId = receipt.id; requestId = receipt.requestId;
    }
    const labels = clientBuildLabels(event, binding.platform);
    phase = 'storage';
    const response = await adminFetch(bobbyRest('rpc/bobby_record_client_telemetry'), {
      method: 'POST', headers: bobbyServiceHeaders(), body: JSON.stringify({
        p_event_id: event.eventId, p_kind: event.event, p_platform: binding.platform,
        p_install_hash: binding.device, p_session_hash: saltedKey('telemetry-session:' + event.sessionId),
        p_sequence: event.sequence, p_occurred_at: ['foreground', 'heartbeat', 'background'].includes(event.event) ? event.occurredAt : null,
        p_verified_auth: Boolean(identity),
        p_identity_id: identity?.via === 'supabase' && identity.authUserId ? identity.id : null,
        p_app_version: labels.version, p_app_build: labels.build, p_request_id: requestId, p_read_receipt_id: receiptId,
      }),
    }, 2500);
    if (!response.ok) {
      const fault = await adminBounded(() => response.json(), 1000).catch(() => null) as { code?: string } | null;
      if (response.status === 400 && fault?.code === '22023') return res.status(400).json({ error: 'Invalid event' });
      throw new Error('telemetry_storage_unavailable');
    }
    const result = await adminBounded(() => response.json(), 2500) as { accepted?: boolean; duplicate?: boolean };
    if (result?.accepted !== true && result?.duplicate !== true) throw new Error('telemetry_storage_unavailable');
    return res.status(204).end();
  } catch {
    // Stable diagnostics only. Transient storage/auth failures are retryable and never reported as a zero.
    waitUntil(recordFailure(phase === 'auth' ? 'auth_unavailable' : phase === 'storage' ? 'storage_unavailable' : 'request_budget_exhausted',
      Boolean(req.headers.authorization || req.headers['x-bobby-session'])));
    res.setHeader('Retry-After', '5');
    return res.status(503).json({ error: 'Telemetry temporarily unavailable' });
  }
}
