// BP-12 (2026-09-04 review): the configured RPC URL may carry a provider key
// (userinfo, path segment or query). It must never reach a response body, a
// public metadata field or a log line. Readers label endpoints instead of
// naming them, and every error message that could embed an upstream string is
// scrubbed against the configured URLs before it leaves the process.
import { DEFAULT_CHAIN } from './chains.js';

const CONFIGURED_RPCS = [...new Set([DEFAULT_CHAIN.rpcUrl, DEFAULT_CHAIN.rpcFallbackUrl ?? ''].filter(Boolean))];

function fragmentsOf(url: string): string[] {
  try {
    const u = new URL(url);
    const path = u.pathname !== '/' ? u.pathname : '';
    return [url, `${u.host}${path}${u.search}`, u.host, decodeURIComponent(u.username), decodeURIComponent(u.password), path, u.search]
      .filter((f) => f && f.length >= 4);
  } catch {
    return [url];
  }
}

// Longest first so a full URL is replaced before its own host would be.
const SECRET_FRAGMENTS = [...new Set(CONFIGURED_RPCS.flatMap(fragmentsOf))].sort((a, b) => b.length - a.length);

/** Human label for a configured endpoint — never the URL. */
export function rpcEndpointLabel(url: string): string {
  const index = CONFIGURED_RPCS.indexOf(url);
  if (index === 0) return 'primary RPC';
  if (index > 0) return 'fallback RPC';
  return 'RPC';
}

/** Removes every configured RPC URL (and its host/userinfo/path/query) from a string. */
export function scrubRpcSecrets(text: string): string {
  let out = text;
  for (const fragment of SECRET_FRAGMENTS) out = out.split(fragment).join('<rpc>');
  return out;
}

/** Error → message safe for logs and clients. */
export function rpcErrorMessage(error: unknown): string {
  return scrubRpcSecrets(error instanceof Error ? error.message : String(error));
}

/** The endpoints a reader may use, in fail-over order. */
export function configuredRpcUrls(): string[] {
  return [...CONFIGURED_RPCS];
}
