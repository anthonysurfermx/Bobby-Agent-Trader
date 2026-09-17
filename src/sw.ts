/// <reference lib="webworker" />
// Bobby service worker.
//
// This app moves money and shows live prices, so the rule is simple: the
// worker never answers for the network on anything that carries state. It only
// speeds up files whose content cannot change under the same URL, and shows an
// honest offline page when there is no connection at all.
//
//   /api/*            network only, never cached (prices, auth, swaps, progress, voice)
//   page navigations  network only; offline page only when the network is gone
//   /assets/*         cache first: Vite fingerprints these, so a URL is its content
//   media in public/  stale-while-revalidate with hard size caps
//
// Rollback: reverting this file does NOT uninstall it from users' browsers.
// Build with PWA_SELF_DESTROY=1 instead; see vite.config.ts.

import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches, matchPrecache } from 'workbox-precaching';
import { registerRoute, setCatchHandler, NavigationRoute } from 'workbox-routing';
import { CacheFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import type { WorkboxPlugin } from 'workbox-core/types';

declare const self: ServiceWorkerGlobalScope;

const OFFLINE_URL = '/offline.html';

// Vercel rewrites unknown paths to index.html with a 200. Without this guard a
// missing file would be stored as HTML under a .js or .glb URL and served back
// until it expired. Only real, non-HTML responses are allowed into a cache.
const rejectHtml: WorkboxPlugin = {
  cacheWillUpdate: async ({ response }) => {
    if (!response || response.status !== 200) return null;
    const type = response.headers.get('content-type') ?? '';
    return type.includes('text/html') ? null : response;
  },
};

// A new deploy takes over on the next load instead of waiting for every tab to
// close. Safe here because no page and no route chunk is precached: an old tab
// keeps pulling its own fingerprinted chunks from the network or from cache.
self.skipWaiting();
clientsClaim();

cleanupOutdatedCaches();
// Only the offline page and the install icons. Everything else is fetched on
// demand; public/ is ~190 MB and must never be pulled on install.
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/api/'), new NetworkOnly());

// Pages are never cached. A remembered index.html points at chunk hashes that
// the next deploy removes, and nothing on the desk works offline anyway, so an
// old shell would only look alive while every call behind it fails.
registerRoute(
  new NavigationRoute(new NetworkOnly(), {
    // Never intercept API calls or files that merely look like navigations.
    denylist: [/^\/api\//, /^\/\.well-known\//, /\.[a-z0-9]+$/i],
  }),
);

registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/assets/'),
  new CacheFirst({
    cacheName: 'bobby-assets',
    plugins: [
      rejectHtml,
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true }),
    ],
  }),
);

registerRoute(
  ({ url, request }) =>
    url.origin === self.location.origin &&
    (['image', 'font'].includes(request.destination) || /\.(glb|gltf|webp|png|jpe?g|svg|woff2?)$/i.test(url.pathname)),
  new StaleWhileRevalidate({
    cacheName: 'bobby-media',
    plugins: [rejectHtml, new ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 14, purgeOnQuotaError: true })],
  }),
);

// Audio is the heaviest folder by far. Keep only what was recently played.
registerRoute(
  ({ url, request }) =>
    url.origin === self.location.origin && (request.destination === 'audio' || /\.(m4a|mp3|wav|ogg)$/i.test(url.pathname)),
  new CacheFirst({
    cacheName: 'bobby-audio',
    plugins: [rejectHtml, new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 7, purgeOnQuotaError: true })],
  }),
);

// Only a failed page navigation earns the offline page. A failed image or
// script simply fails, which is what the app already knows how to handle.
setCatchHandler(async ({ request }) => {
  if (request.mode === 'navigate') {
    return (await matchPrecache(OFFLINE_URL)) ?? Response.error();
  }
  return Response.error();
});
