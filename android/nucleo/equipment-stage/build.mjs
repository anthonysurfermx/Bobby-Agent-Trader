import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '../../app/src/main/assets/equipment-stage');
await build({ entryPoints: [join(here, 'main.ts')], outfile: join(out, 'viewer.js'), bundle: true, minify: true, format: 'iife', target: 'es2020', legalComments: 'eof' });
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob:; worker-src 'self' blob:; base-uri 'none'; form-action 'none'"><style>html,body,#stage{width:100%;height:100vh;margin:0;overflow:hidden;background:transparent}#stage{display:flex;align-items:center;justify-content:center;touch-action:none}#stage canvas{max-width:100%;max-height:100%;width:min(100vw,100vh)!important;height:min(100vw,100vh)!important}</style></head><body><div id="stage"></div><script src="viewer.js"></script></body></html>`;
await writeFile(join(out, 'index.html'), html);
const manifest = JSON.parse(await readFile(join(out, 'provenance.json'), 'utf8'));
manifest.threeVersion = JSON.parse(await readFile(join(here, '../../../node_modules/three/package.json'), 'utf8')).version;
await writeFile(join(out, 'provenance.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Equipment viewer built; all models, gear and decoder requests stay in bundled assets.');
