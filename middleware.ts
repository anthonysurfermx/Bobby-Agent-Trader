/**
 * Routing Middleware (framework-agnostic, runs before the filesystem).
 *
 * Send the Bobby domain home straight to the interactive Núcleo desk.
 * The protocol and app landing pages remain available at /protocol and /app.
 */
export const config = { matcher: '/', runtime: 'nodejs' };

export default function middleware(request: Request): Response | undefined {
  const url = new URL(request.url);
  if (url.pathname !== '/' || !['GET', 'HEAD'].includes(request.method)) return undefined;

  // Older email/OAuth links can still return to the root with a callback code.
  const callbackParams = ['code', 'access_token', 'refresh_token', 'error', 'error_description', 'token'];
  url.pathname = callbackParams.some((param) => url.searchParams.has(param)) ? '/auth/callback' : '/desk';
  return Response.redirect(url, 307);
}
