import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// Installable app (Android TWA, desktop install). The worker lives in src/sw.ts.
//
// Rollback: set PWA_SELF_DESTROY=1 in Vercel and redeploy. That ships a worker
// which unregisters itself and clears its caches on every device that had it.
// Reverting the PR alone does not: the old worker keeps running in browsers.
const pwaSelfDestroy = process.env.PWA_SELF_DESTROY === '1'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      selfDestroying: pwaSelfDestroy,
      devOptions: { enabled: false },
      injectManifest: {
        // Precache only the offline page. The plugin adds the manifest and its
        // icons on its own. public/ is ~190 MB; everything else is fetched and
        // cached on demand.
        globPatterns: ['offline.html'],
        globIgnores: ['**/node_modules/**'],
      },
      manifest: {
        id: '/',
        name: 'Bobby: The Market Argues Back',
        short_name: 'Bobby',
        description:
          'Three agents argue about a market before you get an answer. The verdict goes on the record before the market settles it.',
        lang: 'en',
        dir: 'ltr',
        start_url: '/desk',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#050505',
        theme_color: '#050505',
        categories: ['finance', 'education'],
        icons: [
          { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  base: '/',
  define: {
    global: 'globalThis',
    'process.env': {},
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      buffer: 'buffer',
    },
  },
  optimizeDeps: {
    include: ['buffer'],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: [
            '@radix-ui/react-dialog',
            '@radix-ui/react-slot',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-popover',
          ],
          animation: ['framer-motion'],
          three: ['three'],
          charts: ['recharts'],
          i18n: ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
          supabase: ['@supabase/supabase-js'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
  server: {
    // PORT env lets tooling assign a free port (multi-session dev); 8080 stays the default
    port: Number(process.env.PORT) || 8080,
    host: true,
    proxy: {
      '/api/polymarket-gamma': {
        target: 'https://gamma-api.polymarket.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/polymarket-gamma/, ''),
      },
      '/api/polymarket-data': {
        target: 'https://data-api.polymarket.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/polymarket-data/, ''),
      },
      '/api/polymarket-clob': {
        target: 'https://clob.polymarket.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/polymarket-clob/, ''),
      },
      // Vercel owns the protocol API routes. Route local previews to the live
      // deployment so /protocol can render the same telemetry as production.
      '/api/activity': {
        target: 'https://bobbyprotocol.xyz',
        changeOrigin: true,
      },
      // Companion desk on the web: same voice, search and ticker routes the app uses.
      '/api/bobby-voice-free': { target: 'https://bobbyprotocol.xyz', changeOrigin: true },
      '/api/bobby-asset-search': { target: 'https://bobbyprotocol.xyz', changeOrigin: true },
      '/api/okx-tickers': { target: 'https://bobbyprotocol.xyz', changeOrigin: true },
      // Swaps inside the desk: public quotes (GET) work locally; session-bound builds stay origin-checked server-side.
      '/api/base-swap': { target: 'https://bobbyprotocol.xyz', changeOrigin: true },
      '/api/swap-receipt': { target: 'https://bobbyprotocol.xyz', changeOrigin: true },
      '/api/bobby-protocol-stats': {
        target: 'https://bobbyprotocol.xyz',
        changeOrigin: true,
      },
      '/api/okx-candles': {
        target: 'https://bobbyprotocol.xyz',
        changeOrigin: true,
      },
      // Voice desk: rehearsing the live room locally needs the same routes
      // production uses — candles for equities, and the voice session + tools.
      '/api/stock-candles': {
        target: 'https://bobbyprotocol.xyz',
        changeOrigin: true,
      },
      '/api/stock-price': {
        target: 'https://bobbyprotocol.xyz',
        changeOrigin: true,
      },
      '/api/okx-market': {
        target: 'https://bobbyprotocol.xyz',
        changeOrigin: true,
      },
      '/api/realtime-session': {
        target: 'https://bobbyprotocol.xyz',
        changeOrigin: true,
      },
      '/api/voice-tool': {
        target: 'https://bobbyprotocol.xyz',
        changeOrigin: true,
      },
      '/api/bobby-intel': {
        target: 'https://bobbyprotocol.xyz',
        changeOrigin: true,
      },
      '/api/mcp-bobby': {
        target: 'https://bobbyprotocol.xyz',
        changeOrigin: true,
      },
      '/api/protocol-heartbeat': {
        target: 'https://bobbyprotocol.xyz',
        changeOrigin: true,
      },
      '/api/protocol-tx-history': {
        target: 'https://bobbyprotocol.xyz',
        changeOrigin: true,
      },
      '/api/network': {
        target: 'https://bobbyprotocol.xyz',
        changeOrigin: true,
      },
      '/api/harness-events': {
        target: 'https://bobbyprotocol.xyz',
        changeOrigin: true,
      },
      '/api/harness-memory': {
        target: 'https://bobbyprotocol.xyz',
        changeOrigin: true,
      },
      '/api/sandbox-runs': {
        target: 'https://bobbyprotocol.xyz',
        changeOrigin: true,
      },
    },
  },
})
