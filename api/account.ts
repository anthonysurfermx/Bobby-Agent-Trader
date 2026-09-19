// ============================================================
// /api/account — authenticated account deletion for Sign in with Apple.
//
// DELETE removes Bobby's identity row first (cascading synced progress and
// Trader Land data, while verified public-chain receipts and agent_trades rows
// are de-linked), then deletes the Supabase Auth user. Wallet-only sessions
// cannot delete an Apple account. Public blockchain records and short-lived
// security counters are not represented as deletable account data.
//
// Client contract (deletion must work for every shipped build):
//   · GET → { appleAuthorizationRequired, manualAppleRevocation }.
//   · Clients that can mint a fresh Apple authorization code send
//     `X-Bobby-Account-Client: 2` (build 34+). Only they get a 409
//     { appleAuthorizationRequired: true } when the code is missing.
//   · Legacy clients (1.1 (26), 1.2 (31)) send a bodyless DELETE. They can
//     never supply a code, so their deletion completes and the answer is
//     appleRevocation: 'manual' + manualRevocationURL.
//   · A DELETE carrying appleAuthorizationCode is revoked through Apple's REST
//     API whatever its header says.
// Apple failures never block deletion indefinitely:
//   · transient (Apple 5xx/429, timeout, network) → 503, nothing deleted; the
//     client retries with a fresh code.
//   · rejected (key cannot sign, invalid_client, unauthorized_client,
//     invalid_grant, a different Apple ID, any 4xx) → logged by class and the
//     deletion completes on the manual path. invalid_grant is deliberately NOT
//     retryable: the app mints the code seconds before the DELETE, so an
//     expired/used code is not the realistic cause — a client-id/team mismatch
//     is, and a retry would fail forever.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { bobbyDbUrl, bobbyRest, bobbyServiceHeaders, bobbyServiceKey } from './_lib/bobby-db.js';
import { requestOriginHost } from './_lib/origins.js';
import { enforcePublicRateLimit } from './_lib/request-security.js';
import { requireIdentity } from './_lib/user-identity.js';
import { AppleRevocationError, appleRevocationReady, revokeAppleAuthorization, APPLE_MANUAL_REVOCATION_URL } from './_lib/apple-revocation.js';

export const config = { maxDuration: 45 };

function authAdminConfig(): { url: string; key: string } {
  const url = (process.env.BOBBY_AUTH_URL || bobbyDbUrl()).replace(/\/+$/, '');
  const key = (process.env.BOBBY_AUTH_SERVICE_ROLE_KEY || bobbyServiceKey()).trim();
  return { url, key };
}

/** `X-Bobby-Account-Client: 2` = the client can obtain an Apple authorization code on request. */
function accountClientVersion(headers: Record<string, string | string[] | undefined>): number {
  const raw = headers['x-bobby-account-client'];
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(value) && value > 0 ? value : 1;
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
    const automatic = usesApple && Boolean(apple?.identity_data?.sub) && appleRevocationReady();
    if (req.method === 'GET') return res.status(200).json({ appleAuthorizationRequired: automatic, manualAppleRevocation: usesApple && !automatic });
    appleRevocation = usesApple ? 'manual' : 'not_applicable';
    const code = (req.body as { appleAuthorizationCode?: unknown } | undefined)?.appleAuthorizationCode;
    const hasCode = typeof code === 'string' && code.length > 0 && code.length <= 4096;
    if (automatic && hasCode) {
      try {
        await revokeAppleAuthorization(code, apple!.identity_data!.sub!);
        appleRevocation = 'revoked';
      } catch (error) {
        const failure = error instanceof AppleRevocationError ? error : null;
        // Class only: never the code, tokens, client secret or key material.
        console.error('[account-delete] apple revoke failed', failure ? `${failure.kind} ${failure.stage} ${failure.detail}` : `unexpected ${(error as Error)?.name ?? 'Error'}`);
        if (failure?.kind === 'transient') {
          return res.status(503).json({ error: 'Apple could not be reached to revoke Sign in with Apple. Nothing was deleted; please retry.', code: 'apple_unavailable' });
        }
        // Rejected or unexpected: retrying cannot fix it. Delete anyway and
        // give the user Apple's manual revocation steps.
      }
    } else if (automatic && accountClientVersion(req.headers) >= 2) {
      return res.status(409).json({ error: 'Confirm with Apple before deleting this account.', appleAuthorizationRequired: true });
    }
  } catch (error) {
    console.error('[account-delete] server configuration unavailable', error);
    return res.status(503).json({ error: 'Account deletion is temporarily unavailable' });
  }

  try {
    // agent_trades.user_id has no foreign key: de-link it explicitly, before
    // the identity row goes, so a failure here leaves nothing half-deleted.
    const tradesUnlink = await fetch(bobbyRest(`agent_trades?user_id=eq.${encodeURIComponent(identity.id)}`), {
      method: 'PATCH',
      headers: bobbyServiceHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ user_id: null }),
    });
    if (!tradesUnlink.ok) {
      console.error('[account-delete] trade unlink failed', tradesUnlink.status);
      return res.status(503).json({ error: 'Account data could not be deleted; please try again' });
    }

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
