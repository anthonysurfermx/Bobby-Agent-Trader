import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { withSecureThreeUUIDs } from './secure-three-uuid.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '../../app/src/main/assets/equipment-stage');
const threeVersion = JSON.parse(await readFile(join(here, '../../../node_modules/three/package.json'), 'utf8')).version;
if (threeVersion !== '0.182.0') throw new Error('Review the secure UUID transform before updating Three');
// The package exports three.module.js -> three.core.js, rather than src/math/MathUtils.js.
const threeCore = await realpath(join(here, '../../../node_modules/three/build/three.core.js'));
let securedUUIDs = false;
const secureThreeUUIDs = {
  name: 'secure-three-uuids',
  setup(plugin) {
    plugin.onLoad({ filter: /[/\\]three[/\\]build[/\\]three\.core\.js$/ }, async ({ path }) => {
      if (path !== threeCore) return;
      const contents = withSecureThreeUUIDs(await readFile(path, 'utf8'));
      securedUUIDs = true;
      return { contents, loader: 'js' };
    });
    plugin.onEnd(() => securedUUIDs ? undefined : { errors: [{ text: 'The reviewed Three UUID module was not transformed' }] });
  },
};
await build({ entryPoints: [join(here, 'main.ts')], outfile: join(out, 'viewer.js'), bundle: true, minify: true, format: 'iife', target: 'es2020', legalComments: 'eof', plugins: [secureThreeUUIDs] });
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob:; worker-src 'self' blob:; base-uri 'none'; form-action 'none'"><style>html,body,#stage{width:100%;height:100vh;margin:0;overflow:hidden;background:transparent}#stage{display:flex;align-items:center;justify-content:center;touch-action:none}#stage canvas{max-width:100%;max-height:100%;width:min(100vw,100vh)!important;height:min(100vw,100vh)!important}</style></head><body><div id="stage"></div><script src="viewer.js"></script></body></html>`;
await writeFile(join(out, 'index.html'), html);
const manifest = JSON.parse(await readFile(join(out, 'provenance.json'), 'utf8'));
manifest.threeVersion = threeVersion;
await writeFile(join(out, 'provenance.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Equipment viewer built; all models, gear and decoder requests stay in bundled assets.');
