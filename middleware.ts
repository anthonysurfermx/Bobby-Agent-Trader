/**
 * Routing Middleware (framework-agnostic, runs before the filesystem).
 *
 * "/" is the Bobby app home: a static page at public/home/index.html built around the Núcleo glass.
 * Without this, "/" would resolve to the SPA's index.html (the filesystem wins over vercel.json rewrites).
 * The protocol landing that used to live at "/" stays at /protocol.
 */
export const config = { matcher: '/', runtime: 'nodejs' };

export default function middleware(request: Request): Response | undefined {
  const url = new URL(request.url);
  if (url.pathname !== '/') return undefined;
  // Same mechanism as `rewrite()` in @vercel/functions: serve /home/index.html, keep "/" in the address bar.
  return new Response(null, {
    headers: { 'x-middleware-rewrite': new URL('/home/index.html', url).toString() },
  });
}
