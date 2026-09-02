// Exact-host allowlist shared by the write guard and the sign-in challenge.
// Production hosts are fixed; the deployment's own host (VERCEL_URL /
// VERCEL_BRANCH_URL) is added so previews work; extra hosts come from
// BOBBY_ALLOWED_ORIGINS (comma separated); localhost outside production only.
export const PRODUCTION_HOST = 'bobbyprotocol.xyz';

export function allowedOriginHosts(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const hosts = new Set<string>([PRODUCTION_HOST, `www.${PRODUCTION_HOST}`]);
  for (const name of ['VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_PROJECT_PRODUCTION_URL']) {
    const value = (env[name] || '').trim().toLowerCase();
    if (value) hosts.add(value.replace(/^https?:\/\//, '').split('/')[0]);
  }
  for (const raw of (env.BOBBY_ALLOWED_ORIGINS || '').split(',')) {
    const host = raw.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    if (host) hosts.add(host);
  }
  if (env.VERCEL_ENV !== 'production') {
    hosts.add('localhost');
    hosts.add('127.0.0.1');
  }
  return hosts;
}

/** The request's origin host when it is on the allowlist, else null. */
export function requestOriginHost(headers: Record<string, string | string[] | undefined>): string | null {
  const raw = (headers.origin as string | undefined) || (headers.referer as string | undefined) || '';
  if (!raw) return null;
  try {
    const host = new URL(raw).host.toLowerCase();
    const hosts = allowedOriginHosts();
    if (hosts.has(host)) return host;
    const bare = host.replace(/:\d+$/, '');
    return hosts.has(bare) ? host : null;
  } catch {
    return null;
  }
}
