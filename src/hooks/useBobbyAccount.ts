// The Apple/Google account signed in on this browser (Supabase auth), for the profile's sign-in / sign-out row.
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { bobbySupabase } from '@/lib/bobby-db-client';

export interface BobbyAccount { email: string | null; provider: 'apple' | 'google' | 'other' }

const toAccount = (session: Session | null): BobbyAccount | null => {
  if (!session?.user) return null;
  const p = String(session.user.app_metadata?.provider ?? '');
  return { email: session.user.email ?? null, provider: p === 'apple' || p === 'google' ? p : 'other' };
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
