// ============================================================
// ProgressSync — the small "is my progress saved?" control on the desk.
// Local only until the user signs in with the wallet (SIWE session, the
// same one the rest of the personal data uses); then every award is
// reconciled with /api/progress and follows the user across devices and
// the iOS app. Never blocks reading: XP keeps working offline.
// ============================================================
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Cloud, CloudOff, Link2, LoaderCircle } from 'lucide-react';
import { useAppKit } from '@reown/appkit/react';
import { useBobbySession } from '@/hooks/useBobbySession';
import { t } from '@/lib/companions/i18n';
import { useProgress } from '@/lib/companions/progress';
import { configureProgressSync, getSyncStatus, onSyncStatus, syncProgress } from '@/lib/companions/sync';

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
  const [linkOpen, setLinkOpen] = useState(false);
  const [issued, setIssued] = useState<{ code: string; expiresAt: string } | null>(null);
  const [claim, setClaim] = useState('');
  const [linkMsg, setLinkMsg] = useState<string | null>(null);
  const post = async (body: unknown) => {
    const h = headers();
    const r = await fetch('/api/identity-link', { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: r.ok, json: (await r.json().catch(() => ({}))) as { code?: string; expiresAt?: string; error?: string; linked?: { xp?: number } } };
  };
  const issue = async () => { setLinkMsg(null); const r = await post({ action: 'issue' }); if (r.ok && r.json.code) setIssued({ code: r.json.code, expiresAt: r.json.expiresAt || '' }); else setLinkMsg(r.json.error || t('Could not issue a code', 'No se pudo generar el código')); };
  const doClaim = async () => { setLinkMsg(null); const r = await post({ action: 'claim', code: claim.trim().toUpperCase() }); if (r.ok) { setLinkMsg(t(`Linked · ${r.json.linked?.xp ?? 0} XP total`, `Vinculado · ${r.json.linked?.xp ?? 0} XP en total`)); setClaim(''); void syncProgress(); } else setLinkMsg(r.json.error || t('Could not link', 'No se pudo vincular')); };
  if (ready && (status === 'synced' || status === 'syncing')) {
    const pending = progress.pendingEvents.length;
    return (
      <div className="relative hidden sm:block">
        <button onClick={() => setLinkOpen((v) => !v)} title={t(`Progress saved to ${short} · link the iOS app`, `Progreso guardado en ${short} · vincular la app iOS`)} className="flex h-10 items-center gap-1.5 rounded-full bg-white/[0.04] border border-white/[0.06] px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-300 hover:border-white/20 transition">
          {status === 'syncing' || pending ? <LoaderCircle size={13} className="animate-spin" /> : <Cloud size={13} />}
          {t('Saved', 'Guardado')}
          <Link2 size={12} className="text-white/40" />
        </button>
        {linkOpen && (
          <div className="absolute right-0 mt-2 w-72 rounded-xl bg-[#0b0b0e] border border-white/[0.08] p-3 z-30 text-xs text-white/80 space-y-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">{t('Link the iOS app', 'Vincular la app iOS')}</div>
            <p className="text-white/55 leading-5">{t('Same XP on the phone and here: generate a code, then enter it in the app under Save progress. Or paste a code from the app below.', 'El mismo XP en el teléfono y aquí: genera un código y escríbelo en la app en Guardar progreso. O pega abajo un código de la app.')}</p>
            {issued ? <div className="font-mono text-2xl tracking-[0.3em] text-emerald-300 text-center py-1">{issued.code}</div> : <button onClick={() => void issue()} className="w-full rounded-lg bg-white/[0.06] border border-white/[0.08] py-2 font-mono text-[10px] uppercase tracking-[0.14em] hover:bg-white/[0.1]">{t('Generate code', 'Generar código')}</button>}
            <div className="flex gap-2">
              <input value={claim} onChange={(e) => setClaim(e.target.value.toUpperCase().slice(0, 6))} placeholder={t('Code from the app', 'Código de la app')} className="flex-1 rounded-lg bg-black/40 border border-white/[0.08] px-2 py-1.5 font-mono text-sm tracking-[0.2em] uppercase outline-none focus:border-white/30" />
              <button onClick={() => void doClaim()} disabled={claim.length !== 6} className="rounded-lg bg-white/[0.06] border border-white/[0.08] px-3 font-mono text-[10px] uppercase tracking-[0.14em] disabled:opacity-40">{t('Link', 'Vincular')}</button>
            </div>
            {linkMsg && <div className="text-[11px] text-white/70">{linkMsg}</div>}
          </div>
        )}
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
