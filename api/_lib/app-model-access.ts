import type { VercelRequest } from '@vercel/node';
import { readAccess, resolveCaller, type Access } from './access.js';
import type { AppTextTier } from './app-model.js';
import { bobbyRest, bobbyServiceHeaders } from './bobby-db.js';
import type { Identity } from './user-identity.js';

/** Resolve model access from verified server state; client plan/level fields are never evidence of Pro. */
export async function resolveAppRequestTier(
  req: VercelRequest,
  options: { identity?: Identity | null; access?: Pick<Access, 'tier'> } = {},
): Promise<AppTextTier> {
  try {
    if (options.access) return options.access.tier === 'pro' ? 'pro' : 'free';
    const identity = options.identity === undefined ? await resolveCaller(req) : options.identity;
    if (!identity) return 'free';
    return (await readAccess(req, identity)).tier === 'pro' ? 'pro' : 'free';
  } catch {
    return 'free';
  }
}

/** Only pass a signature-verified signer or a wallet loaded from a trusted server-owned profile. */
export async function resolveAppWalletTier(verifiedWallet: string | null | undefined): Promise<AppTextTier> {
  if (typeof verifiedWallet !== 'string' || !/^0x[0-9a-f]{40}$/i.test(verifiedWallet)) return 'free';
  try {
    const lookup = await fetch(bobbyRest(`bobby_identities?wallet_address=eq.${verifiedWallet.toLowerCase()}&select=id&limit=1`), {
      headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(3000),
    });
    if (!lookup.ok) return 'free';
    const rows = await lookup.json() as Array<{ id?: unknown }>;
    const identityId = Array.isArray(rows) ? rows[0]?.id : null;
    if (typeof identityId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identityId)) return 'free';
    const entitlement = await fetch(bobbyRest('rpc/bobby_is_pro'), {
      method: 'POST', headers: bobbyServiceHeaders(),
      body: JSON.stringify({ p_identity: identityId }), signal: AbortSignal.timeout(3000),
    });
    return entitlement.ok && await entitlement.json() === true ? 'pro' : 'free';
  } catch {
    return 'free';
  }
}
