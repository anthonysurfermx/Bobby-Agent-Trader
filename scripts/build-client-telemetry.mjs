import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await build({ entryPoints: [root + 'src/lib/client-telemetry-static.ts'], outfile: root + 'public/client-telemetry.js', bundle: true,
  minify: true, format: 'iife', target: ['es2020'], define: {
    __CLIENT_VERSION__: JSON.stringify(process.env.VITE_APP_VERSION ?? ''),
    __CLIENT_BUILD__: JSON.stringify(process.env.VITE_APP_BUILD || process.env.VERCEL_GIT_COMMIT_SHA || ''),
  } });
