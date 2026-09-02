// ============================================================
// ProgressSync — the small "is my progress saved?" control on the desk.
// Local only until the user signs in with the wallet (SIWE session, the
// same one the rest of the personal data uses); then every award is
// reconciled with /api/progress and follows the user across devices and
// the iOS app. Never blocks reading: XP keeps working offline.
// ============================================================
import { useEffect, useSyncExternalStore } from 'react';
import { Cloud, CloudOff, LoaderCircle } from 'lucide-react';
import { useAppKit } from '@reown/appkit/react';
import { useBobbySession } from '@/hooks/useBobbySession';
import { t } from '@/lib/companions/i18n';
import { useProgress } from '@/lib/companions/progress';
import { configureProgressSync, getSyncStatus, onSyncStatus } from '@/lib/companions/sync';

export default function ProgressSync() {
  const { wallet, ready, ensureSession, headers } = useBobbySession({ auto: false });
  const { open } = useAppKit();
  const progress = useProgress();
  const status = useSyncExternalStore(onSyncStatus, getSyncStatus, getSyncStatus);

  useEffect(() => {
    if (!ready) { configureProgressSync(null); return; }
    configureProgressSync(() => {
      const h = headers();
      return h['x-bobby-session'] ? h : null;
    });
    return () => configureProgressSync(null);
    // `headers` reads localStorage on every call, so only `ready` matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, wallet]);

  const act = async () => {
    if (!wallet) { await open(); return; }
    await ensureSession();
  };

  const short = wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : '';
  if (ready && (status === 'synced' || status === 'syncing')) {
    const pending = progress.pendingEvents.length;
    return (
      <div title={t(`Progress saved to ${short}`, `Progreso guardado en ${short}`)} className="hidden sm:flex h-10 items-center gap-1.5 rounded-full bg-white/[0.04] border border-white/[0.06] px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-300">
        {status === 'syncing' || pending ? <LoaderCircle size={13} className="animate-spin" /> : <Cloud size={13} />}
        {t('Saved', 'Guardado')}
      </div>
    );
  }
  return (
    <button onClick={() => void act()} title={t('Sign in with your wallet so XP and gear follow you to the app', 'Inicia sesión con tu wallet para que XP y equipo te sigan a la app')} className="hidden sm:flex h-10 items-center gap-1.5 rounded-full bg-white/[0.04] border border-white/[0.06] px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/55 hover:text-white hover:border-white/20 transition">
      <CloudOff size={13} />
      {status === 'error' ? t('Retry save', 'Reintentar') : t('Save progress', 'Guardar progreso')}
    </button>
  );
}
