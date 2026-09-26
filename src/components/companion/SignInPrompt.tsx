// ============================================================
// SignInPrompt — the soft "keep your points" ask.
//
// Text remains anonymous. Live voice uses an account for its shared daily quota.
//
// Three ways in: Apple, Google and wallet. Apple and Google go through
// Bobby's own Supabase project (bobbySupabase), never the legacy DeFi México
// one, because /api/progress validates the token against Bobby's project.
// ============================================================
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Apple, Loader2, Wallet, X } from 'lucide-react';
import { useAppKit } from '@reown/appkit/react';
import { bobbySupabase } from '@/lib/bobby-db-client';
import { t } from '@/lib/companions/i18n';

const GOLD = '#F5C542';

/** Asset questions before the prompt appears. */
export const ASK_THRESHOLD = 3;

const STORAGE_NAMESPACE = 'bobby:companion';
const ASK_COUNT_STORAGE_ID = `${STORAGE_NAMESPACE}:ask-count:v1`;
const DISMISSED_STORAGE_ID = `${STORAGE_NAMESPACE}:signin-prompt-dismissed:v1`;
const SHOWN_STORAGE_ID = `${STORAGE_NAMESPACE}:signin-prompt-shown:v1`;

/** Count one asset question. Returns the new total. */
export function recordAsk(): number {
  try {
    const next = readAskCount() + 1;
    localStorage.setItem(ASK_COUNT_STORAGE_ID, String(next));
    return next;
  } catch {
    return 0; // private mode: never prompt rather than prompt on every question
  }
}

export function readAskCount(): number {
  try {
    const raw = Number(localStorage.getItem(ASK_COUNT_STORAGE_ID));
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  } catch {
    return 0;
  }
}

export function isPromptDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_STORAGE_ID) === '1';
  } catch {
    return true;
  }
}

function dismissForever(): void {
  try {
    localStorage.setItem(DISMISSED_STORAGE_ID, '1');
  } catch { /* private mode */ }
}

/** The visitor has actually seen the prompt once (set when it mounts, not when it is scheduled). */
export function isPromptShown(): boolean {
  try {
    return localStorage.getItem(SHOWN_STORAGE_ID) === '1';
  } catch {
    return true;
  }
}

function markPromptShown(): void {
  try {
    localStorage.setItem(SHOWN_STORAGE_ID, '1');
  } catch { /* private mode */ }
}

/**
 * True when the prompt should be raised: the visitor has reached the
 * threshold, has no credential yet, has not dismissed it, and has not seen it
 * yet. "Reached" rather than "just hit": the desk hides the prompt behind an
 * evolution or a gear drop (both land right around the third question), and
 * an exact match meant a reload in that window lost the prompt forever.
 */
export function shouldPromptAfterAsk(askCount: number, alreadySignedIn: boolean): boolean {
  return !alreadySignedIn && askCount >= ASK_THRESHOLD && !isPromptDismissed() && !isPromptShown();
}

/** Same rule against the stored count — for a desk that mounts with the prompt still owed. */
export function shouldPromptNow(alreadySignedIn: boolean): boolean {
  return shouldPromptAfterAsk(readAskCount(), alreadySignedIn);
}

type Busy = 'apple' | 'google' | 'twitter' | 'wallet' | null;

export default function SignInPrompt({ xp, onClose, voiceAccess = false }: { xp: number; onClose: () => void; voiceAccess?: boolean }) {
  // Seen once it is on screen; the scheduling side must not count as seeing it.
  useEffect(() => { if (!voiceAccess) markPromptShown(); }, [voiceAccess]);
  const { open } = useAppKit();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState('');
  /** The provider URL Supabase built, kept so a blocked redirect can still be opened by a plain tap. */
  const [providerUrl, setProviderUrl] = useState<string | null>(null);

  const close = () => { if (!voiceAccess) dismissForever(); onClose(); };

  const oauth = async (provider: 'apple' | 'google' | 'twitter') => {
    setBusy(provider);
    setError('');
    setProviderUrl(null);
    try {
      const redirectTo = `${window.location.origin}/auth/callback`;
      // Ask for the URL instead of letting the library navigate: a bad build
      // (no Supabase URL) or a browser that swallows the redirect used to leave
      // this button spinning forever with nothing to show for it.
      const { data, error: authError } = await bobbySupabase().auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
      if (authError) throw authError;
      const url = data?.url ?? '';
      if (!/^https:\/\/[^/]+\.supabase\.co\//.test(url)) throw new Error(`unexpected provider url: ${url.slice(0, 60)}`);
      setProviderUrl(url);
      window.location.assign(url);
      // If the tab is still here after a moment, the navigation was blocked: say so and hand over the link.
      window.setTimeout(() => {
        setBusy(null);
        setError(t(`The browser did not open ${provider === 'apple' ? 'Apple' : 'Google'}. Tap the link below to continue.`, `El navegador no abrió ${provider === 'apple' ? 'Apple' : 'Google'}. Toca el enlace de abajo para continuar.`));
      }, 6000);
    } catch (caught) {
      console.error('[SignInPrompt] oauth failed:', caught);
      setBusy(null);
      setError(t('That sign-in method is not available right now. Try another one.', 'Ese método de acceso no está disponible ahora. Prueba con otro.'));
    }
  };

  const connectWallet = async () => {
    setBusy('wallet');
    setError('');
    try {
      await open();
      dismissForever();
      onClose();
    } catch (caught) {
      console.error('[SignInPrompt] wallet connect failed:', caught);
      setBusy(null);
      setError(t('The wallet did not connect. Try again.', 'La wallet no se conectó. Inténtalo de nuevo.'));
    }
  };

  const options: Array<{ id: Busy; label: string; icon: React.ReactNode; run: () => void }> = [
    { id: 'apple', label: t('Continue with Apple', 'Continuar con Apple'), icon: <Apple size={17} />, run: () => void oauth('apple') },
    { id: 'google', label: t('Continue with Google', 'Continuar con Google'), icon: <GoogleMark />, run: () => void oauth('google') },
    { id: 'twitter', label: t('Continue with X', 'Continuar con X'), icon: <XMark />, run: () => void oauth('twitter') },
    { id: 'wallet', label: t('Continue with a wallet', 'Continuar con una wallet'), icon: <Wallet size={17} />, run: () => void connectWallet() },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/90 p-3"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-labelledby="signin-prompt-title"
    >
      <motion.div
        initial={{ scale: 0.92, y: 18 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', bounce: 0.35, duration: 0.6 }}
        className="relative my-auto w-full max-w-sm overflow-hidden rounded-3xl bg-[#07090c] p-6"
        style={{ border: `1px solid ${GOLD}40`, boxShadow: `0 0 60px ${GOLD}22` }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={close} aria-label={t('Close', 'Cerrar')} className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/[0.06] text-white/70 transition hover:text-white">
          <X size={15} />
        </button>

        <div className="font-mono text-[10px] tracking-[0.24em]" style={{ color: GOLD }}>{voiceAccess ? 'BOBBY VOICE' : t('YOUR PROGRESS', 'TU PROGRESO')}</div>
        <h2 id="signin-prompt-title" className="mt-3 text-2xl font-semibold leading-tight text-white">
          {voiceAccess ? t('3 voice minutes a day', '3 min de voz al día') : t('Want to keep your points?', '¿Quieres conservar tus puntos?')}
        </h2>
        <p className="mt-3 text-sm leading-6 text-white/60">
          {voiceAccess ? t('Sign in. Your time is shared across web and iPhone.', 'Inicia sesión. Tu tiempo se comparte entre web y iPhone.') : t(
            `You have ${xp} XP on this device. Sign in and it follows you to the iPhone app and any other browser. Keep reading without an account if you prefer — nothing is locked.`,
            `Llevas ${xp} XP en este dispositivo. Entra y te siguen a la app de iPhone y a cualquier otro navegador. Si prefieres, sigue sin cuenta: aquí no se bloquea nada.`,
          )}
        </p>

        <div className="mt-6 space-y-2">
          {options.filter((option) => !voiceAccess || option.id !== 'wallet').map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={option.run}
              disabled={busy !== null}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:border-white/25 hover:bg-white/[0.08] disabled:opacity-50"
            >
              <span className="grid h-6 w-6 place-items-center text-white/85">
                {busy === option.id ? <Loader2 size={16} className="animate-spin" /> : option.icon}
              </span>
              {option.label}
            </button>
          ))}
        </div>

        {error && <p role="alert" className="mt-3 text-xs leading-5 text-[#ff8f83]">{error}</p>}
        {error && providerUrl && (
          <a href={providerUrl} className="mt-2 block text-center font-mono text-[11px] tracking-[0.12em] text-sky-300 underline underline-offset-4 hover:text-sky-200">
            {t('Open sign-in in this tab', 'Abrir el acceso en esta pestaña')}
          </a>
        )}

        <button onClick={close} className="mt-5 w-full py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/45 transition hover:text-white/75">
          {voiceAccess ? t('Continue with free voice', 'Seguir con voz gratis') : t('Keep going without an account', 'Seguir sin cuenta')}
        </button>
      </motion.div>
    </motion.div>
  );
}

function XMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width="17" height="17" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2.5 24 .5 14.6.5 6.5 5.9 2.6 13.7l7.8 6.1C12.3 13.4 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.2-.4-4.7H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.4z" />
      <path fill="#FBBC05" d="M10.4 28.2a14.5 14.5 0 0 1 0-8.4l-7.8-6.1a24 24 0 0 0 0 20.6l7.8-6.1z" />
      <path fill="#34A853" d="M24 47.5c6.2 0 11.5-2 15.5-5.6l-7.6-5.9c-2.1 1.4-4.8 2.3-7.9 2.3-6.3 0-11.7-3.9-13.6-9.3l-7.8 6.1C6.5 42.1 14.6 47.5 24 47.5z" />
    </svg>
  );
}
