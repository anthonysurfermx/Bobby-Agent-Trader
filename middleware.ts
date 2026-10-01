/**
 * Routing Middleware (framework-agnostic, runs before the filesystem).
 *
 * Serve the animated Núcleo story at the Bobby domain root.
 * Its App button opens the interactive desk at /desk.
 */
export const config = { matcher: '/', runtime: 'nodejs' };

export default function middleware(request: Request): Response | undefined {
  const url = new URL(request.url);
  if (url.pathname !== '/' || !['GET', 'HEAD'].includes(request.method)) return undefined;

  // Older email/OAuth links can still return to the root with callback parameters.
  const callbackParams = ['code', 'access_token', 'refresh_token', 'error', 'error_description', 'token'];
  if (callbackParams.some((param) => url.searchParams.has(param))) {
    url.pathname = '/auth/callback';
    return Response.redirect(url, 307);
  }

  url.pathname = '/home/index.html';
  return new Response(null, { headers: { 'x-middleware-rewrite': url.toString() } });
}
