// ============================================================
// bobby-db — the single place that knows where Bobby's database is.
//
// Phase 0 of the DeFi México → Bobby Protocol split. Every server-side
// caller resolves the Supabase URL and keys through here, so moving Bobby
// to its own project is an env change (BOBBY_SUPABASE_*), never a code
// change. Resolution order:
//
//   URL   : BOBBY_SUPABASE_URL → SUPABASE_URL → VITE_SUPABASE_URL → SB_URL
//           → NEXT_PUBLIC_SUPABASE_URL
//   service: BOBBY_SUPABASE_SERVICE_ROLE_KEY → SUPABASE_SERVICE_ROLE_KEY
//           → SUPABASE_SERVICE_KEY
//   anon  : BOBBY_SUPABASE_ANON_KEY → VITE_SUPABASE_ANON_KEY → SUPABASE_ANON_KEY
//
// No hardcoded project refs and no hardcoded keys: a misconfigured
// deployment fails loudly at first use instead of silently writing to the
// legacy database.
// ============================================================

export class BobbyDbConfigError extends Error {
  constructor(what: string) {
    super(`[bobby-db] ${what} is not configured (set BOBBY_SUPABASE_* in the environment)`);
    this.name = 'BobbyDbConfigError';
  }
}

function firstEnv(names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/** Project URL, e.g. https://xxxx.supabase.co (no trailing slash). */
export function bobbyDbUrl(): string {
  const url = firstEnv(['BOBBY_SUPABASE_URL', 'SUPABASE_URL', 'VITE_SUPABASE_URL', 'SB_URL', 'NEXT_PUBLIC_SUPABASE_URL']);
  if (!url) throw new BobbyDbConfigError('database URL');
  return url.replace(/\/+$/, '');
}

/** Service-role key. Server-side only — never ship this to a browser. */
export function bobbyServiceKey(): string {
  const key = firstEnv(['BOBBY_SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY']);
  if (!key) throw new BobbyDbConfigError('service-role key');
  return key;
}

/** Anon key, for server-side reads that should not carry service power. */
export function bobbyAnonKey(): string {
  return firstEnv(['BOBBY_SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY']);
}

/**
 * Key for read paths that historically fell back to the anon key when no
 * service key was present. Prefers service role, then anon; throws only
 * when neither exists.
 */
export function bobbyReadKey(): string {
  const key = firstEnv(['BOBBY_SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'BOBBY_SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY']);
  if (!key) throw new BobbyDbConfigError('read key');
  return key;
}

/** Like bobbyDbUrl() but returns '' instead of throwing — for optional features (caches, limiters) that fail open. */
export function bobbyDbUrlOptional(): string {
  try { return bobbyDbUrl(); } catch { return ''; }
}

/** Like bobbyServiceKey() but returns '' instead of throwing — for optional features. */
export function bobbyServiceKeyOptional(): string {
  try { return bobbyServiceKey(); } catch { return ''; }
}

/** True when a database is configured at all (for optional caches). */
export function bobbyDbConfigured(): boolean {
  try { return Boolean(bobbyDbUrl()) && Boolean(bobbyReadKey()); } catch { return false; }
}

/** Which project this deployment talks to — for health endpoints and logs. */
export function bobbyDbRef(): string {
  try {
    const host = new URL(bobbyDbUrl()).hostname;
    return host.split('.')[0] || 'unknown';
  } catch { return 'unconfigured'; }
}

/** PostgREST URL for a table or rpc path, e.g. bobbyRest('agent_cycles?select=id'). */
export function bobbyRest(path: string): string {
  return `${bobbyDbUrl()}/rest/v1/${path.replace(/^\/+/, '')}`;
}

/** Standard headers for service-role PostgREST calls. */
export function bobbyServiceHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const key = bobbyServiceKey();
  return { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

/** Standard headers for read-only PostgREST calls. */
export function bobbyReadHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const key = bobbyReadKey();
  return { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, ...extra };
}
