/**
 * Routing Middleware (framework-agnostic, runs before the filesystem).
 *
 * Serve the animated Núcleo story at the Bobby domain root.
 * Its App button opens the interactive desk at /desk.
 */
export const config = { matcher: ['/', '/app-ads.txt'], runtime: 'nodejs' };

export default function middleware(request: Request): Response | undefined {
  const url = new URL(request.url);
  if (!['GET', 'HEAD'].includes(request.method)) return undefined;

  // No app-ads.txt is configured in this build. Missing technical files must
  // not return the SPA. Remove this guard when a real file is configured.
  if (url.pathname === '/app-ads.txt') {
    return new Response(request.method === 'HEAD' ? null : 'Not found\n', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  if (url.pathname !== '/') return undefined;

  // Older email/OAuth links can still return to the root with callback parameters.
  const callbackParams = ['code', 'access_token', 'refresh_token', 'error', 'error_description', 'token'];
  if (callbackParams.some((param) => url.searchParams.has(param))) {
    url.pathname = '/auth/callback';
    return Response.redirect(url, 307);
  }

  url.pathname = '/home/index.html';
  return new Response(null, { headers: { 'x-middleware-rewrite': url.toString() } });
}
