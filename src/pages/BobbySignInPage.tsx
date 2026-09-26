import { useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { bobbySupabase } from '@/lib/bobby-db-client';

/**
 * /signin — Apple / Google sign-in for the web, entered from the static home ("/").
 * /signin?provider=apple|google starts the provider right away; plain /signin shows both buttons.
 * Same OAuth flow as SignInPrompt: Supabase builds the provider URL and we navigate to it ourselves,
 * so a blocked redirect can still be finished with a plain tap. Returns to /auth/callback.
 */
type Provider = 'apple' | 'google';
const LABEL: Record<Provider, string> = { apple: 'Apple', google: 'Google' };

function readProvider(): Provider | null {
  const p = new URLSearchParams(window.location.search).get('provider');
  return p === 'apple' || p === 'google' ? p : null;
}

export default function BobbySignInPage() {
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState('');
  const [providerUrl, setProviderUrl] = useState<string | null>(null);
  const started = useRef(false);

  const start = useCallback(async (provider: Provider) => {
    setBusy(provider);
    setError('');
    setProviderUrl(null);
    try {
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { data, error: authError } = await bobbySupabase().auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (authError) throw authError;
      const url = data?.url ?? '';
      if (!/^https:\/\/[^/]+\.supabase\.co\//.test(url)) throw new Error(`unexpected provider url: ${url.slice(0, 60)}`);
      setProviderUrl(url);
      window.location.assign(url);
      // Still here after a moment: the navigation was blocked. Say so and hand over the link.
      window.setTimeout(() => {
        setBusy(null);
        setError(`The browser did not open ${LABEL[provider]}. Tap the link below to continue.`);
      }, 6000);
    } catch (caught) {
      console.error('[BobbySignIn] oauth failed:', caught);
      setBusy(null);
      setError('That sign-in method is not available right now. Try the other one.');
    }
  }, []);

  useEffect(() => {
    const provider = readProvider();
    if (provider && !started.current) { started.current = true; void start(provider); }
  }, [start]);

  return (
    <main className="min-h-[100svh] bg-[#0B0A09] text-[#F2EDE4] flex items-center justify-center px-4 py-12">
      <Helmet>
        <title>Sign in | Bobby</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="w-full max-w-[380px] flex flex-col gap-4">
        <a href="/" className="text-[22px] tracking-[-0.04em] text-[#F2EDE4] no-underline mb-6 self-start">Bobby</a>
        <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[#8A8378]">Start free</span>
        <h1 className="m-0 text-[34px] leading-[1.05] tracking-[-0.045em] font-light">Sign in to Bobby</h1>
        <p className="m-0 mb-2 text-[15px] leading-relaxed text-[#A39C91]">
          Your reads, your companion and your record, on the web and on iPhone.
        </p>
        <button
          type="button"
          onClick={() => void start('apple')}
          disabled={busy !== null}
          className="h-[50px] w-full rounded-xl bg-[#F2EDE4] text-[#0B0A09] font-medium text-[15px] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#5CE1FF] focus-visible:outline-offset-2"
        >
          {busy === 'apple' ? 'Opening Apple…' : 'Continue with Apple'}
        </button>
        <button
          type="button"
          onClick={() => void start('google')}
          disabled={busy !== null}
          className="h-[50px] w-full rounded-xl bg-black text-[#F2EDE4] font-medium text-[15px] border border-[rgba(242,237,228,0.14)] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#5CE1FF] focus-visible:outline-offset-2"
        >
          {busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
        </button>
        {error && (
          <p role="alert" className="m-0 text-[14px] text-[#FF5A5F]">
            {error}{' '}
            {providerUrl && <a href={providerUrl} className="text-[#F2EDE4] underline">Continue</a>}
          </p>
        )}
        <p className="m-0 mt-2 text-[14px] text-[#A39C91]">
          Just looking? <a href="/desk" className="text-[#F2EDE4] underline underline-offset-4">Try it on the web</a>
        </p>
        <p className="m-0 mt-2 text-[12px] leading-normal text-[#8A8378]">
          By continuing you agree to the <a href="/privacy" className="text-[#A39C91]">Privacy Policy</a>. Educational reads, not financial advice.
        </p>
      </div>
    </main>
  );
}
