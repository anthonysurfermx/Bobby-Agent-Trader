// ============================================================
// /api/account — authenticated account deletion for Sign in with Apple.
//
// DELETE removes Bobby's identity row first (cascading synced progress and
// Trader Land data, while verified public-chain receipts are de-linked), then
// deletes the Supabase Auth user. Wallet-only sessions cannot delete an Apple
// account. Public blockchain records and short-lived security counters are not
// represented as deletable account data.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { bobbyDbUrl, bobbyRest, bobbyServiceHeaders, bobbyServiceKey } from './_lib/bobby-db.js';
import { requestOriginHost } from './_lib/origins.js';
import { enforcePublicRateLimit } from './_lib/request-security.js';
import { requireIdentity } from './_lib/user-identity.js';
import { appleRevocationConfigured, revokeAppleAuthorization, APPLE_MANUAL_REVOCATION_URL } from './_lib/apple-revocation.js';

export const config = { maxDuration: 45 };

function authAdminConfig(): { url: string; key: string } {
  const url = (process.env.BOBBY_AUTH_URL || bobbyDbUrl()).replace(/\/+$/, '');
  const key = (process.env.BOBBY_AUTH_SERVICE_ROLE_KEY || bobbyServiceKey()).trim();
  return { url, key };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requestOriginHost(req.headers)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  if (!await enforcePublicRateLimit(req, res, req.method === 'GET' ? 'account-delete-check' : 'account-delete', req.method === 'GET' ? 30 : 5, 3600)) return;

  const identity = await requireIdentity(req, res);
  if (!identity) return;
  if (identity.via !== 'supabase' || !identity.authUserId) {
    return res.status(403).json({ error: 'A signed-in account is required' });
  }

  let auth: { url: string; key: string };
  let appleRevocation = 'not_applicable';
  try {
    auth = authAdminConfig();
    res.setHeader('Cache-Control', 'no-store');
    const userResponse = await fetch(`${auth.url}/auth/v1/admin/users/${encodeURIComponent(identity.authUserId)}`, {
      headers: { apikey: auth.key, Authorization: `Bearer ${auth.key}` }, signal: AbortSignal.timeout(5000),
    });
    if (!userResponse.ok) return res.status(503).json({ error: 'Could not verify the account. Retry shortly.' });
    const user = await userResponse.json() as { identities?: Array<{ provider?: string; identity_data?: { sub?: string } }>; app_metadata?: { provider?: string; providers?: string[] } };
    const apple = user.identities?.find(item => item.provider === 'apple');
    const usesApple = Boolean(apple || user.app_metadata?.provider === 'apple' || user.app_metadata?.providers?.includes('apple'));
    const automatic = usesApple && Boolean(apple?.identity_data?.sub) && appleRevocationConfigured();
    if (req.method === 'GET') return res.status(200).json({ appleAuthorizationRequired: automatic, manualAppleRevocation: usesApple && !automatic });
    appleRevocation = usesApple ? 'manual' : 'not_applicable';
    if (automatic) {
      const code = (req.body as { appleAuthorizationCode?: unknown } | undefined)?.appleAuthorizationCode;
      if (typeof code !== 'string' || !code || code.length > 4096) return res.status(409).json({ error: 'Confirm with Apple before deleting this account.', appleAuthorizationRequired: true });
      try { await revokeAppleAuthorization(code, apple!.identity_data!.sub!); }
      catch { return res.status(503).json({ error: 'Apple authorization could not be revoked. Please retry account deletion.' }); }
      appleRevocation = 'revoked';
    }
  } catch (error) {
    console.error('[account-delete] server configuration unavailable', error);
    return res.status(503).json({ error: 'Account deletion is temporarily unavailable' });
  }

  try {
    const dataDelete = await fetch(
      bobbyRest(`bobby_identities?id=eq.${encodeURIComponent(identity.id)}&auth_user_id=eq.${encodeURIComponent(identity.authUserId)}`),
      {
        method: 'DELETE',
        headers: bobbyServiceHeaders({ Prefer: 'return=minimal' }),
      },
    );
    if (!dataDelete.ok) {
      console.error('[account-delete] identity delete failed', dataDelete.status);
      return res.status(503).json({ error: 'Account data could not be deleted; please try again' });
    }

    const authDelete = await fetch(`${auth.url}/auth/v1/admin/users/${encodeURIComponent(identity.authUserId)}`, {
      method: 'DELETE',
      headers: {
        apikey: auth.key,
        Authorization: `Bearer ${auth.key}`,
      },
    });
    if (!authDelete.ok) {
      console.error('[account-delete] auth user delete failed', authDelete.status);
      return res.status(503).json({ error: 'Account sign-in could not be deleted; please try again' });
    }

    return res.status(200).json({
      ok: true,
      appleRevocation,
      ...(appleRevocation === 'manual' ? { manualRevocationURL: APPLE_MANUAL_REVOCATION_URL } : {}),
      retained: 'Public blockchain transactions and limited security or audit records may remain.',
    });
  } catch (error) {
    console.error('[account-delete] request failed', error);
    return res.status(503).json({ error: 'Account deletion is temporarily unavailable' });
  }
}
