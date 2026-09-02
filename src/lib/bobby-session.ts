// ============================================================
// bobby-session — the browser side of the wallet session.
//
// The user signs one message (free, no transaction) and the API answers
// with a token bound to that wallet, valid 7 days. Every read or write of
// data that belongs to the wallet (inbox, interests, private debates,
// profile) carries the token as `x-bobby-session`. Without it the API
// answers 401 and the UI degrades to "nothing personal to show".
// ============================================================

export interface StoredSession { token: string; wallet: string; expiresAt: number }

const EVENT = 'bobby-session-changed';
const key = (wallet: string) => `bobby_session:${wallet.toLowerCase()}`;
const inflight = new Map<string, Promise<StoredSession | null>>();
/** Wallets whose owner dismissed the signature prompt this page load — don't nag. */
const declined = new Set<string>();

function emit(): void {
  try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* SSR / old browsers */ }
}

export function getStoredSession(wallet: string | null | undefined): StoredSession | null {
  if (!wallet) return null;
  try {
    const raw = localStorage.getItem(key(wallet));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.token || parsed.wallet !== wallet.toLowerCase() || parsed.expiresAt <= Date.now() + 60_000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hasSession(wallet: string | null | undefined): boolean {
  return getStoredSession(wallet) !== null;
}

/** Headers to attach to /api calls; empty when there is no session. */
export function sessionHeaders(wallet: string | null | undefined): Record<string, string> {
  const s = getStoredSession(wallet);
  return s ? { 'x-bobby-session': s.token } : {};
}

export function clearSession(wallet: string | null | undefined): void {
  if (!wallet) return;
  try { localStorage.removeItem(key(wallet)); } catch { /* ignore */ }
  emit();
}

export function onSessionChange(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

/**
 * Get a session for the wallet, asking the wallet to sign when there is no
 * valid one. `force` re-prompts even if the user dismissed the prompt earlier
 * (use it from an explicit user gesture).
 */
export async function requestSession(
  wallet: string | null | undefined,
  signMessage: (message: string) => Promise<string>,
  opts: { force?: boolean } = {},
): Promise<StoredSession | null> {
  if (!wallet) return null;
  const w = wallet.toLowerCase();
  const stored = getStoredSession(w);
  if (stored) return stored;
  if (declined.has(w) && !opts.force) return null;
  const pending = inflight.get(w);
  if (pending) return pending;
  const run = (async () => {
    try {
      // 1. single-use challenge from the server (EIP-4361 text, 10 min)
      const ch = await fetch(`/api/wallet-session?address=${w}`);
      if (!ch.ok) { console.warn('[bobby-session] challenge refused', ch.status); return null; }
      const challenge = (await ch.json()) as { nonce?: string; message?: string };
      if (!challenge.nonce || !challenge.message) return null;
      // 2. sign exactly what the server built
      const signature = await signMessage(challenge.message);
      // 3. exchange (the nonce is consumed server-side; a replay is refused)
      const res = await fetch('/api/wallet-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: w, nonce: challenge.nonce, signature }),
      });
      if (!res.ok) {
        console.warn('[bobby-session] session refused', res.status);
        return null;
      }
      const data = (await res.json()) as { token?: string; expiresAt?: string };
      if (!data.token) return null;
      const session: StoredSession = { token: data.token, wallet: w, expiresAt: Date.parse(data.expiresAt || '') || Date.now() + 6 * 24 * 60 * 60 * 1000 };
      try { localStorage.setItem(key(w), JSON.stringify(session)); } catch { /* private mode */ }
      declined.delete(w);
      emit();
      return session;
    } catch (error) {
      // User rejected in the wallet, or the wallet is not able to sign.
      declined.add(w);
      console.warn('[bobby-session] signature not granted', (error as Error)?.message || error);
      return null;
    } finally {
      inflight.delete(w);
    }
  })();
  inflight.set(w, run);
  return run;
}

/**
 * fetch() with the session attached. Returns null (no request made) when
 * there is no session; clears the session on 401 so the next gesture
 * re-prompts.
 */
export async function sessionFetch(wallet: string | null | undefined, input: string, init: RequestInit = {}): Promise<Response | null> {
  const headers = sessionHeaders(wallet);
  if (!headers['x-bobby-session']) return null;
  const res = await fetch(input, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), ...headers } });
  if (res.status === 401) clearSession(wallet);
  return res;
}
