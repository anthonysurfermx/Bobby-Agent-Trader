// The Apple/Google account signed in on this browser (Supabase auth), for the profile's sign-in / sign-out row.
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { bobbySupabase } from '@/lib/bobby-db-client';

export interface BobbyAccount { id: string; email: string | null; provider: 'apple' | 'google' | 'other'; firstName: string | null }

/** A plain first name from the provider profile (same rule as the server's firstNameOf). */
function firstNameOf(meta: Record<string, unknown> | undefined): string | null {
  const raw = [meta?.given_name, meta?.first_name, meta?.full_name, meta?.name].find((v) => typeof v === 'string' && v.trim());
  const first = typeof raw === 'string' ? raw.trim().split(/\s+/)[0] : '';
  return /^[\p{L}][\p{L}'-]{0,23}$/u.test(first) ? first : null;
}

const toAccount = (session: Session | null): BobbyAccount | null => {
  if (!session?.user) return null;
  const p = String(session.user.app_metadata?.provider ?? '');
  return { id: session.user.id, email: session.user.email ?? null, provider: p === 'apple' || p === 'google' ? p : 'other', firstName: firstNameOf(session.user.user_metadata) };
};

export function useBobbyAccount() {
  const [account, setAccount] = useState<BobbyAccount | null>(null);
  useEffect(() => {
    const client = bobbySupabase();
    let active = true;
    void client.auth.getSession().then(({ data }) => { if (active) setAccount(toAccount(data.session)); });
    const { data: sub } = client.auth.onAuthStateChange((_event, session) => setAccount(toAccount(session)));
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);
  const signOut = async () => { await bobbySupabase().auth.signOut(); setAccount(null); };
  return { account, signOut };
}
