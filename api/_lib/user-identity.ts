// ============================================================
// Who is calling — resolved to a bobby_identities row.
//
// Two credentials are accepted, so the web keeps its SIWE wallet session and
// the iOS app can use Supabase Auth (Sign in with Apple). That account remains
// separate from the app's optional external, non-custodial wallet connection:
//   · `x-bobby-session` / `Authorization: Bearer bws.…`  → wallet session
//   · `Authorization: Bearer <supabase access token>`    → verified against
//     the auth project's /auth/v1/user (never decoded locally, no secret)
// The auth project may differ from the data project during the migration
// (BOBBY_AUTH_URL / BOBBY_AUTH_ANON_KEY default to the data project).
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { bobbyAnonKey, bobbyDbUrl, bobbyRest, bobbyServiceHeaders } from './bobby-db.js';
import { sessionTokenFromRequest, verifyWalletSession } from './wallet-session.js';

export interface Identity {
  id: string;
  authUserId: string | null;
  wallet: string | null;
  via: 'wallet' | 'supabase';
}

interface IdentityRow { id: string; auth_user_id: string | null; wallet_address: string | null }

function authBase(): { url: string; anon: string } | null {
  try {
    const url = (process.env.BOBBY_AUTH_URL || bobbyDbUrl()).replace(/\/+$/, '');
    const anon = process.env.BOBBY_AUTH_ANON_KEY || bobbyAnonKey();
    return url && anon ? { url, anon } : null;
  } catch {
    return null;
  }
}

async function verifySupabaseToken(token: string): Promise<{ id: string; email: string | null; provider: string | null } | null> {
  const base = authBase();
  if (!base) return null;
  try {
    const r = await fetch(`${base.url}/auth/v1/user`, { headers: { apikey: base.anon, Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const user = (await r.json()) as { id?: string; email?: string; app_metadata?: { provider?: string } };
    if (!user?.id || !/^[0-9a-f-]{36}$/i.test(user.id)) return null;
    return { id: user.id, email: user.email ?? null, provider: user.app_metadata?.provider ?? null };
  } catch (error) {
    console.error('[user-identity] auth verify', error);
    return null;
  }
}

async function upsertIdentity(conflict: 'wallet_address' | 'auth_user_id', row: Record<string, unknown>): Promise<IdentityRow | null> {
  const r = await fetch(bobbyRest(`bobby_identities?on_conflict=${conflict}&select=id,auth_user_id,wallet_address`), {
    method: 'POST',
    headers: bobbyServiceHeaders({ Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify({ ...row, last_seen_at: new Date().toISOString() }),
  });
  if (!r.ok) {
    console.error('[user-identity] upsert', r.status, await r.text().catch(() => ''));
    return null;
  }
  const rows = (await r.json()) as IdentityRow[];
  return rows[0] ?? null;
}

function bearer(req: VercelRequest): string {
  const raw = req.headers.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

/** Resolve the caller. Returns null when no valid credential is present. */
export async function resolveIdentity(req: VercelRequest): Promise<Identity | null> {
  const sessionToken = sessionTokenFromRequest(req);
  const session = sessionToken ? verifyWalletSession(sessionToken) : null;
  if (session) {
    const row = await upsertIdentity('wallet_address', { wallet_address: session.wallet });
    return row ? { id: row.id, authUserId: row.auth_user_id, wallet: row.wallet_address, via: 'wallet' } : null;
  }
  const token = bearer(req);
  if (!token || token.startsWith('bws.')) return null;
  const user = await verifySupabaseToken(token);
  if (!user) return null;
  const row = await upsertIdentity('auth_user_id', { auth_user_id: user.id, email: user.email, provider: user.provider });
  return row ? { id: row.id, authUserId: row.auth_user_id, wallet: row.wallet_address, via: 'supabase' } : null;
}

export async function requireIdentity(req: VercelRequest, res: VercelResponse): Promise<Identity | null> {
  const identity = await resolveIdentity(req);
  if (!identity) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="bobby-progress"');
    res.status(401).json({ error: 'Sign in required: wallet session or Supabase access token' });
  }
  return identity;
}
