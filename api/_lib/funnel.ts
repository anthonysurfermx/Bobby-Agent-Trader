// The payment step is confirmed by Bobby's server only after Stripe provides a valid Checkout URL.
// No session URL, Stripe identifier, token or email is stored in the analytics event.
import type { VercelRequest } from '@vercel/node';
import type { Identity } from './user-identity.js';
import { callerHash, clientPlatform, deviceHash } from './access.js';
import { bobbyRest, bobbyServiceHeaders } from './bobby-db.js';
import { requestGeo } from './geo.js';

export async function recordCheckoutOpened(req: VercelRequest, identity: Identity, sessionId: string): Promise<void> {
  try {
    const platform = clientPlatform(req);
    const geo = platform === 'web' ? requestGeo(req) : null;
    const response = await fetch(bobbyRest('rpc/bobby_record_checkout_opened'), {
      method: 'POST', headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(3000),
      body: JSON.stringify({ p_platform: platform, p_device: deviceHash(req), p_identity: identity.id, p_session: sessionId,
        p_country: geo?.country ?? null, p_region: geo?.region ?? null, p_network: callerHash(req) }),
    });
    if (!response.ok) console.error('[funnel] checkout event storage', response.status);
  } catch { console.error('[funnel] checkout event storage unavailable'); }
}
