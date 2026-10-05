import { build } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { createRequire } from 'node:module';
import { readFile, writeFile, readdir, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

process.env.NODE_ENV = 'production';
const root = process.cwd();
const out = path.join(root, 'dist');
const renderDir = path.join(out, '.app-prerender');
const require = createRequire(import.meta.url);
const escape = (value) => value.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&');

try {
  // Vite compiles exactly the component that the client imports; no browser or API is needed.
  await build({
    configFile: false,
    root,
    plugins: [react()],
    resolve: { alias: { '@': path.join(root, 'src') } },
    ssr: { noExternal: ['react-helmet-async'] },
    logLevel: 'warn',
    build: {
      ssr: 'scripts/prerender-app-render.tsx',
      outDir: renderDir,
      emptyOutDir: true,
      rollupOptions: { output: { format: 'cjs', entryFileNames: 'render.cjs' } },
    },
  });
  const renderer = require(path.join(renderDir, 'render.cjs'));
  const template = await readFile(path.join(out, 'index.html'), 'utf8');
  const files = await readdir(path.join(out, 'assets'));
  const appScript = files.find((file) => /^BobbyAppLandingWorld-.*\.js$/.test(file));
  const appStyle = files.find((file) => /^BobbyAppLandingWorld-.*\.css$/.test(file));
  if (!appScript || !appStyle) throw new Error('The public app client assets were not emitted');
  const extraAssets = '<link rel="modulepreload" href="/assets/' + appScript + '"/><link rel="stylesheet" href="/assets/' + appStyle + '"/>';
  const destination = path.join(out, '_seo', 'app');
  await mkdir(destination, { recursive: true });

  for (const locale of renderer.APP_LOCALES) {
    const language = renderer.appLanguage(locale);
    const rendered = renderer.renderApp(language, locale);
    let html = template.replace(/<html[^>]*>/, '<html ' + rendered.htmlAttributes + '>');
    html = html.replace(/<title>[\s\S]*?<\/title>/, rendered.title);
    // Helmet manages the same metadata when the unchanged client mounts.
    const tags = [...rendered.meta.matchAll(/<meta\b[^>]*>/g)].map(([tag]) => tag);
    for (const tag of tags) {
      const attribute = tag.match(/\b(name|property)="([^"]+)"/);
      if (attribute) html = html.replace(new RegExp('<meta\\b(?=[^>]*\\b' + attribute[1] + '="' + escape(attribute[2]) + '")[^>]*>', 'g'), '');
    }
    html = html.replace(/<meta\b(?=[^>]*\bname="title")[^>]*>/g, '');
    html = html.replace('</head>', rendered.meta + rendered.link + extraAssets + '</head>');
    html = html.replace('<div id="root"></div>', '<div id="root">' + rendered.body + '</div>');
    // The public page is already readable without JS; interactive behavior still uses the client.
    html = html.replace(/<noscript>[\s\S]*?<\/noscript>/, '');
    await writeFile(path.join(destination, locale + '.html'), html);
    if (locale === renderer.appLocale(language)) await writeFile(path.join(destination, language + '.html'), html);
  }
  console.log('Public /app prerender: 13 locales, 6 default-language aliases; client animations and API effects unchanged.');
} finally {
  // The renderer is a build artifact, not a server function or a published file.
  await rm(renderDir, { recursive: true, force: true });
}
