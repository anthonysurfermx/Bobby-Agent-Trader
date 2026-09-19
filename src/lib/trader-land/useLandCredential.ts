// ============================================================
// Who the studio builds for: the wallet session first, else the Apple/Google
// (Supabase) session — the same order as ProgressSync, and /api/trader-land
// accepts either (api/_lib/user-identity.ts). Wallet-only, an Apple/Google
// builder whose read just planted a seed (desk seed card → "Open my island")
// landed on the practice island without it.
// ============================================================
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useBobbySession } from '@/hooks/useBobbySession';
import { bobbySupabase } from '@/lib/bobby-db-client';
import { landCredential } from './growth';

export function useLandCredential() {
  const { wallet, ready, ensureSession, headers } = useBobbySession({ auto: false });
  // `user` is the identity; `token` refreshes under it without changing who builds.
  const [oauth, setOauth] = useState<{ user: string; token: string } | null>(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    const client = bobbySupabase();
    let active = true;
    const take = (session: Session | null) => setOauth(session?.access_token && session.user ? { user: session.user.id, token: session.access_token } : null);
    client.auth.getSession()
      .then(({ data }) => { if (active) take(data.session); })
      .catch(() => undefined)
      .finally(() => { if (active) setChecked(true); });
    const { data: sub } = client.auth.onAuthStateChange((_event, session) => { if (active) take(session); });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);
  return {
    wallet,
    ensureSession,
    /** a credential the API accepts */
    signedIn: ready || Boolean(oauth),
    /** false until the Apple/Google session has been looked up (the wallet session is known at once) */
    known: ready || checked,
    /** the builder: changes on sign-in/out or a switch, never on a token refresh */
    identity: ready ? `wallet:${wallet}` : oauth ? `oauth:${oauth.user}` : null,
    headers: (): Record<string, string> => landCredential(headers(), oauth?.token) ?? {},
  };
}
