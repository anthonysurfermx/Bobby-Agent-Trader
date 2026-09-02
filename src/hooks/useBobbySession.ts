import { useCallback, useEffect, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { getStoredSession, hasSession, onSessionChange, requestSession, sessionHeaders, type StoredSession } from '@/lib/bobby-session';

/**
 * Wallet session for Bobby's personal data. With `auto` (default true) the
 * hook asks for the signature once the wallet connects and no valid session
 * exists; a dismissed prompt is not repeated until `ensureSession()` is
 * called from a user gesture.
 */
export function useBobbySession(opts: { auto?: boolean } = {}) {
  const auto = opts.auto ?? true;
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const wallet = isConnected && address ? address.toLowerCase() : null;
  const [ready, setReady] = useState<boolean>(() => hasSession(wallet));

  useEffect(() => {
    setReady(hasSession(wallet));
    return onSessionChange(() => setReady(hasSession(wallet)));
  }, [wallet]);

  const sign = useCallback((message: string) => signMessageAsync({ message }), [signMessageAsync]);

  useEffect(() => {
    if (!auto || !wallet || hasSession(wallet)) return;
    requestSession(wallet, sign).catch(() => {});
  }, [auto, wallet, sign]);

  const ensureSession = useCallback(async (): Promise<StoredSession | null> => {
    if (!wallet) return null;
    return requestSession(wallet, sign, { force: true });
  }, [wallet, sign]);

  return {
    wallet,
    ready,
    session: getStoredSession(wallet),
    ensureSession,
    headers: () => sessionHeaders(wallet),
  };
}
