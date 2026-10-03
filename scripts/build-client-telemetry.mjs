import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
export const buildClientTelemetry = (write = true) => build({ entryPoints: [root + 'src/lib/client-telemetry-static.ts'], outfile: root + 'public/client-telemetry.js', bundle: true, write,
  minify: true, format: 'iife', target: ['es2020'], define: {
    __CLIENT_VERSION__: JSON.stringify(process.env.VITE_APP_VERSION ?? ''),
    __CLIENT_BUILD__: JSON.stringify(process.env.VITE_APP_BUILD || process.env.VERCEL_GIT_COMMIT_SHA || ''),
    __CLIENT_TELEMETRY_ENABLED__: JSON.stringify(process.env.VERCEL_ENV !== 'preview'),
  } });
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await buildClientTelemetry();
