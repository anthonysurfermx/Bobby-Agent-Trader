// BP-12 (2026-09-04 review) + third round (2026-09-05): the configured RPC URLs
// may carry a provider key (userinfo, path segment or query). They must never
// reach a response body, a public metadata field or a log line. Readers label
// endpoints instead of naming them, and every message that could embed an
// upstream string — ethers (`info={ requestUrl: … }`), viem (`URL: …`), a bare
// key echoed by the provider, or a percent-encoded copy — is scrubbed before it
// leaves the process.
import { DEFAULT_CHAIN } from './chains.js';

const CONFIGURED_RPCS = [...new Set([
  DEFAULT_CHAIN.rpcUrl,
  DEFAULT_CHAIN.rpcFallbackUrl ?? '',
  process.env.VERIFIED_CALLS_RPC_URL ?? '', // the canary ledger readers (verified-calls, challenge-scan)
].filter(Boolean))];

function fragmentsOf(url: string): string[] {
  const out: string[] = [url];
  try {
    const u = new URL(url);
    const path = u.pathname !== '/' ? u.pathname : '';
    out.push(`${u.host}${path}${u.search}`, u.host, decodeURIComponent(u.username), decodeURIComponent(u.password), path, u.search);
    for (const segment of u.pathname.split('/')) out.push(segment);                    // each path segment (a key is often one)
    for (const [, value] of u.searchParams) out.push(value);                           // each query value
  } catch {
    // not a URL: the whole string is the fragment
  }
  const base = out.filter((f) => f && f.length >= 4);
  // percent-encoded copies (an upstream may echo the URL encoded)
  return [...new Set([...base, ...base.map((f) => encodeURIComponent(f)).filter((f) => f.length >= 4)])];
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

/**
 * Removes every configured RPC URL (and its host/userinfo/path/query, plain or
 * percent-encoded) from a string, then masks any remaining URL-shaped token —
 * ethers' `requestUrl:` and viem's `URL:` lines included — so an upstream echo
 * of an endpoint we did not configure can never leak either.
 */
export function scrubRpcSecrets(text: string): string {
  let out = text;
  for (const fragment of SECRET_FRAGMENTS) out = out.split(fragment).join('<rpc>');
  out = out.replace(/requestUrl:\s*[^,\s}]+/g, 'requestUrl: <url>');
  out = out.replace(/\bURL:\s*\S+/g, 'URL: <url>');
  out = out.replace(/https?:\/\/[^\s"'<>)\]]+/g, '<url>');
  out = out.replace(/https?%3A%2F%2F[^\s"'<>)\]]+/gi, '<url>');
  return out;
}

/** Error → message safe for logs and clients (never a raw error object). */
export function rpcErrorMessage(error: unknown): string {
  if (error instanceof Error) return scrubRpcSecrets(error.message);
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return scrubRpcSecrets((error as { message: string }).message);
  }
  return scrubRpcSecrets(String(error));
}

/** Parses a JSON-RPC body without letting a non-JSON upstream body leak into the error text. */
export async function parseRpcJson<T>(res: Response, url: string): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error(`${rpcEndpointLabel(url)} returned a non-JSON body (HTTP ${res.status})`);
  }
}

/** The endpoints a reader may use, in fail-over order. */
export function configuredRpcUrls(): string[] {
  return [...CONFIGURED_RPCS];
}
