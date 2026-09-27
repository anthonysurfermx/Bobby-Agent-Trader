// ============================================================
// ProgressSync — the small "is my progress saved?" control on the desk.
// Local only until the user signs in with the wallet (SIWE session, the
// same one the rest of the personal data uses); then every award is
// reconciled with /api/progress and follows the user across devices. Never blocks reading: XP keeps working offline.
// ============================================================
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Cloud, CloudOff, LoaderCircle } from 'lucide-react';
import { useAppKit } from '@reown/appkit/react';
import { useBobbySession } from '@/hooks/useBobbySession';
import { bobbySupabase } from '@/lib/bobby-db-client';
import { t } from '@/lib/companions/i18n';
import { useProgress } from '@/lib/companions/progress';
import { configureProgressSync, getSyncStatus, onSyncStatus } from '@/lib/companions/sync';

/**
 * `onChoose` lets the desk open its sign-in sheet (Apple, Google, wallet)
 * instead of jumping straight to the wallet modal. Without it the header
 * button was the only always-visible way in and it offered wallet only —
 * Apple and Google lived exclusively inside the third-question prompt.
 */
export default function ProgressSync({ onChoose }: { onChoose?: () => void } = {}) {
  const { wallet, ready, ensureSession, headers } = useBobbySession({ auto: false });
  const { open } = useAppKit();
  const progress = useProgress();
  const status = useSyncExternalStore(onSyncStatus, getSyncStatus, getSyncStatus);
  // /api/progress accepts either credential (see api/_lib/user-identity.ts).
  // Until this was tracked, a visitor who signed in with Apple or Google
  // synced nothing, because only the wallet header was ever supplied.
  const [supabaseToken, setSupabaseToken] = useState<string | null>(null);

  useEffect(() => {
    const client = bobbySupabase();
    let active = true;
    void client.auth.getSession().then(({ data }) => {
      if (active) setSupabaseToken(data.session?.access_token ?? null);
    });
    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      setSupabaseToken(session?.access_token ?? null);
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!ready && !supabaseToken) { configureProgressSync(null); return; }
    configureProgressSync(() => {
      const h = headers();
      if (h['x-bobby-session']) return h;
      return supabaseToken ? { Authorization: `Bearer ${supabaseToken}` } : null;
    });
    return () => configureProgressSync(null);
    // `headers` reads localStorage on every call, so only `ready` matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, wallet, supabaseToken]);

  const act = async () => {
    if (!wallet) { if (onChoose) onChoose(); else await open(); return; }
    await ensureSession();
  };

  const short = wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : '';
  // An Apple/Google session counts as signed in too; `ready` alone is the
  // wallet session, which left OAuth users staring at "Save progress".
  const signedIn = ready || Boolean(supabaseToken);
  if (signedIn && (status === 'synced' || status === 'syncing')) {
    const pending = progress.pendingEvents.length;
    // Final audit P0-1: the "link the iOS app" code flow that lived here was
    // retired with /api/identity-link (Build 13 removed the phone side too).
    return (
      <div title={wallet ? t(`Progress saved to ${short}`, `Progreso guardado en ${short}`, `Progresso salvo em ${short}`) : t('Progress saved to your account', 'Progreso guardado en tu cuenta', 'Progresso salvo na sua conta')} className="flex h-10 items-center gap-1.5 rounded-full bg-white/[0.04] border border-white/[0.06] px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-300">
        {status === 'syncing' || pending ? <LoaderCircle size={13} className="animate-spin" /> : <Cloud size={13} />}
        <span className="hidden sm:inline">{t('Saved', 'Guardado', 'Salvo')}</span>
      </div>
    );
  }
  return (
    <button onClick={() => void act()} aria-label={t('Save progress', 'Guardar progreso', 'Salvar progresso')} title={t('Sign in with Apple, Google or a wallet so XP and gear follow you to the app', 'Inicia sesión con Apple, Google o una wallet para que XP y equipo te sigan a la app', 'Entre com Apple, Google ou uma carteira para que seu XP e seu equipamento te acompanhem no app')} className="flex h-10 items-center gap-1.5 rounded-full bg-white/[0.04] border border-white/[0.06] px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/55 hover:text-white hover:border-white/20 transition">
      <CloudOff size={13} />
      <span className="hidden sm:inline">{status === 'error' ? t('Retry save', 'Reintentar', 'Tentar de novo') : t('Save progress', 'Guardar progreso', 'Salvar progresso')}</span>
    </button>
  );
}
