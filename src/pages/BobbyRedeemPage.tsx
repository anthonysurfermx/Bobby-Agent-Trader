import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Helmet } from 'react-helmet-async';
import { lang, type Lang } from '@/lib/companions/i18n';
import { fetchAccess, redeemCoupon, rememberReturn, type AccessState, type RedeemResult, type UsageGift } from '@/lib/access-client';

/**
 * /redeem — redeem a Bobby coupon (api/_lib/coupons.ts) for extra reads, Profundo and Máximo.
 * /redeem?code=AMIGOS20 pre-fills the code. Needs an Apple/Google account: without one the page sends the
 * visitor through /signin and /auth/callback brings them back here. The gift lives on the account, so the
 * iPhone app sees it too. One language per visit: ?lang=en|es|pt, else the stored or browser language.
 */
type Copy = Record<Lang, string>;
const COPY = {
  title: { en: 'Redeem a coupon', es: 'Canjea un cupón', pt: 'Resgate um cupom' },
  lead: {
    en: 'Coupons add extra reads to your Bobby account. They are used once your free reads run out, on the web and on iPhone.',
    es: 'Los cupones suman lecturas extra a tu cuenta de Bobby. Se usan cuando se acaban tus lecturas gratis, en la web y en el iPhone.',
    pt: 'Os cupons somam leituras extras à sua conta do Bobby. Elas são usadas quando suas leituras grátis acabam, na web e no iPhone.',
  },
  label: { en: 'Coupon code', es: 'Código del cupón', pt: 'Código do cupom' },
  redeem: { en: 'Redeem', es: 'Canjear', pt: 'Resgatar' },
  redeeming: { en: 'Redeeming…', es: 'Canjeando…', pt: 'Resgatando…' },
  signinLead: {
    en: 'Sign in with the same Apple or Google account you use in Bobby to redeem it.',
    es: 'Inicia sesión con la misma cuenta de Apple o Google que usas en Bobby para canjearlo.',
    pt: 'Entre com a mesma conta Apple ou Google que você usa no Bobby para resgatar.',
  },
  apple: { en: 'Continue with Apple', es: 'Continuar con Apple', pt: 'Continuar com Apple' },
  google: { en: 'Continue with Google', es: 'Continuar con Google', pt: 'Continuar com Google' },
  balance: { en: 'Your gifted balance', es: 'Tu saldo de regalo', pt: 'Seu saldo de presente' },
  desk: { en: 'Go to Bobby', es: 'Ir a Bobby', pt: 'Ir para o Bobby' },
  iphone: {
    en: 'On iPhone, open Bobby signed in with the same account.',
    es: 'En el iPhone, abre Bobby con la misma cuenta.',
    pt: 'No iPhone, abra o Bobby com a mesma conta.',
  },
  loading: { en: 'Checking your account…', es: 'Revisando tu cuenta…', pt: 'Verificando sua conta…' },
  retry: { en: 'Try again', es: 'Reintentar', pt: 'Tentar de novo' },
} satisfies Record<string, Copy>;

const RESULT: Record<Exclude<RedeemResult, 'redeemed'>, Copy> = {
  invalid_code: { en: 'That coupon does not exist. Check the code.', es: 'Ese cupón no existe. Revisa el código.', pt: 'Esse cupom não existe. Confira o código.' },
  expired: { en: 'That coupon has expired.', es: 'Ese cupón ya venció.', pt: 'Esse cupom expirou.' },
  exhausted: { en: 'That coupon has run out.', es: 'Ese cupón ya se agotó.', pt: 'Esse cupom esgotou.' },
  already_redeemed: { en: 'You already redeemed this coupon.', es: 'Ya canjeaste este cupón.', pt: 'Você já resgatou este cupom.' },
  account_required: {
    en: 'Coupons need an Apple or Google account. Sign in and try again.',
    es: 'Los cupones necesitan una cuenta de Apple o Google. Inicia sesión e inténtalo de nuevo.',
    pt: 'Os cupons precisam de uma conta Apple ou Google. Entre e tente de novo.',
  },
  rate_limited: { en: 'Too many attempts. Wait a few minutes.', es: 'Demasiados intentos. Espera unos minutos.', pt: 'Muitas tentativas. Aguarde alguns minutos.' },
  unavailable: { en: 'Coupons are not available right now. Try again.', es: 'Los cupones no están disponibles ahora. Inténtalo de nuevo.', pt: 'Os cupons não estão disponíveis agora. Tente de novo.' },
};

function pageLang(): Lang {
  const requested = new URLSearchParams(window.location.search).get('lang');
  return requested === 'es' || requested === 'en' || requested === 'pt' ? requested : lang();
}
const normalize = (v: string) => v.toUpperCase().replace(/\s+/g, '').slice(0, 32);
const validCode = (v: string) => /^[A-Z0-9][A-Z0-9-]{3,31}$/.test(v);

function giftLine(g: UsageGift, l: Lang): string {
  const parts: string[] = [];
  if (g.reads) parts.push({ en: `${g.reads} reads`, es: `${g.reads} lecturas`, pt: `${g.reads} leituras` }[l]);
  if (g.profundo) parts.push(`${g.profundo} ${{ en: 'Deep', es: 'Profundo', pt: 'Profundo' }[l]}`);
  if (g.maximo) parts.push(`${g.maximo} ${{ en: 'Max', es: 'Máximo', pt: 'Máximo' }[l]}`);
  return parts.join(' · ');
}

export default function BobbyRedeemPage() {
  const l = pageLang();
  const t = (c: Copy) => c[l];
  const [code, setCode] = useState(() => normalize(new URLSearchParams(window.location.search).get('code') ?? ''));
  const [state, setState] = useState<AccessState | null | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [needsAccount, setNeedsAccount] = useState(false);

  const refresh = useCallback(async () => setState(await fetchAccess()), []);
  useEffect(() => { void refresh(); }, [refresh]);

  const signIn = (provider: 'apple' | 'google') => {
    rememberReturn(validCode(code) ? `/redeem?code=${code}&lang=${l}` : `/redeem?lang=${l}`);
    window.location.assign(`/signin?provider=${provider}`);
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!validCode(code)) { setMessage({ ok: false, text: t(RESULT.invalid_code) }); return; }
    setBusy(true);
    setMessage(null);
    const { result, granted } = await redeemCoupon(code);
    setBusy(false);
    if (result === 'redeemed') {
      const line = granted ? giftLine(granted, l) : '';
      setMessage({ ok: true, text: { en: `Done: ${line} added to your account.`, es: `Listo: ${line} en tu cuenta.`, pt: `Pronto: ${line} na sua conta.` }[l] });
      setCode('');
      void refresh();
    } else {
      if (result === 'account_required') setNeedsAccount(true);
      setMessage({ ok: false, text: t(RESULT[result]) });
    }
  }

  const unknown = state === null;
  const signedIn = state !== 'loading' && state?.signedIn === true && !needsAccount;
  const balance: UsageGift | null = state && state !== 'loading' && state.signedIn
    ? { reads: state.access.bonus ?? 0, profundo: state.levels?.levels.profundo.bonus ?? 0, maximo: state.levels?.levels.maximo.bonus ?? 0 }
    : null;
  const hasBalance = balance !== null && balance.reads + balance.profundo + balance.maximo > 0;
  const field = 'h-[50px] w-full rounded-xl border border-[rgba(242,237,228,0.14)] bg-black px-4 text-[17px] tracking-[0.08em] uppercase text-[#F2EDE4] outline-none focus:border-[#5CE1FF]';
  const primary = 'h-[50px] w-full rounded-xl bg-[#F2EDE4] text-[#0B0A09] font-medium text-[15px] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#5CE1FF] focus-visible:outline-offset-2';
  const secondary = 'h-[50px] w-full rounded-xl bg-black text-[#F2EDE4] font-medium text-[15px] border border-[rgba(242,237,228,0.14)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#5CE1FF] focus-visible:outline-offset-2';

  return (
    <main className="min-h-[100svh] bg-[#0B0A09] text-[#F2EDE4] flex items-center justify-center px-4 py-12">
      <Helmet>
        <html lang={l} />
        <title>{`${t(COPY.title)} | Bobby`}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="w-full max-w-[380px] flex flex-col gap-4">
        <a href="/" className="text-[22px] tracking-[-0.04em] text-[#F2EDE4] no-underline mb-6 self-start">Bobby</a>
        <h1 className="m-0 text-[34px] leading-[1.05] tracking-[-0.045em] font-light">{t(COPY.title)}</h1>
        <p className="m-0 mb-2 text-[15px] leading-relaxed text-[#A39C91]">{t(COPY.lead)}</p>

        {state === 'loading' && <p className="m-0 text-[14px] text-[#8A8378]" role="status">{t(COPY.loading)}</p>}

        {unknown && (
          <div className="flex flex-col gap-3">
            <p role="alert" className="m-0 text-[15px] text-[#FF5A5F]">{t(RESULT.unavailable)}</p>
            <button type="button" onClick={() => { setState('loading'); void refresh(); }} className={secondary}>{t(COPY.retry)}</button>
          </div>
        )}

        {state !== 'loading' && !unknown && (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <label htmlFor="coupon" className="font-mono text-[11px] tracking-[0.16em] uppercase text-[#8A8378]">{t(COPY.label)}</label>
            <input
              id="coupon" value={code} onChange={(e) => setCode(normalize(e.target.value))}
              autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={32} className={field}
            />
            {signedIn ? (
              <button type="submit" disabled={busy || !code} className={primary}>{busy ? t(COPY.redeeming) : t(COPY.redeem)}</button>
            ) : (
              <>
                <p className="m-0 text-[14px] text-[#A39C91]">{t(COPY.signinLead)}</p>
                <button type="button" onClick={() => signIn('apple')} className={primary}>{t(COPY.apple)}</button>
                <button type="button" onClick={() => signIn('google')} className={secondary}>{t(COPY.google)}</button>
              </>
            )}
          </form>
        )}

        {message && (
          <p role={message.ok ? 'status' : 'alert'} className={`m-0 text-[15px] ${message.ok ? 'text-[#7EE2A8]' : 'text-[#FF5A5F]'}`}>{message.text}</p>
        )}

        {hasBalance && balance && (
          <div className="mt-2 rounded-xl border border-[rgba(242,237,228,0.1)] px-4 py-3">
            <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[#8A8378]">{t(COPY.balance)}</span>
            <p className="m-0 mt-1 text-[16px]">{giftLine(balance, l)}</p>
          </div>
        )}

        {signedIn && (
          <>
            <a href="/desk" className="mt-2 text-[15px] text-[#F2EDE4] underline underline-offset-4">{t(COPY.desk)}</a>
            <p className="m-0 text-[13px] text-[#8A8378]">{t(COPY.iphone)}</p>
          </>
        )}
      </div>
    </main>
  );
}
