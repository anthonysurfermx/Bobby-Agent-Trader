import { build } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { createRequire } from 'node:module';
import { readFile, writeFile, readdir, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { parse, serialize } from 'parse5';

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
  const documentFor = (rendered, extraAssets) => {
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
    return html;
  };

  for (const locale of renderer.APP_LOCALES) {
    const language = renderer.appLanguage(locale);
    const html = documentFor(renderer.renderApp(language, locale), extraAssets);
    await writeFile(path.join(destination, locale + '.html'), html);
    if (locale === renderer.appLocale(language)) await writeFile(path.join(destination, language + '.html'), html);
  }

  // The protocol keeps its approved English editorial copy. Resolve all its CSS imports for the first paint.
  const manifest = JSON.parse(await readFile(path.join(out, '.vite', 'manifest.json'), 'utf8'));
  const protocol = manifest['src/pages/BobbyProtocolLanding.tsx'];
  if (!protocol?.file) throw new Error('The public protocol client entry was not emitted');
  const styles = new Set();
  const visited = new Set();
  const collectStyles = (key) => {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error('The protocol client dependency was not emitted: ' + key);
    for (const dependency of chunk.imports ?? []) collectStyles(dependency);
    for (const style of chunk.css ?? []) styles.add(style);
  };
  collectStyles('src/pages/BobbyProtocolLanding.tsx');
  const protocolAssets = '<link rel="modulepreload" href="/' + protocol.file + '"/>'
    + [...styles].filter((style) => !template.includes('href="/' + style + '"')).map((style) => '<link rel="stylesheet" href="/' + style + '"/>').join('')
    + '<link id="nucleo-fonts" rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&amp;family=Geist+Mono:wght@400;500&amp;family=Sora:wght@200;300;400;500&amp;display=swap"/>';
  const protocolDocument = parse(documentFor(renderer.renderProtocol(), protocolAssets));
  const htmlElement = protocolDocument.childNodes.find((node) => node.tagName === 'html');
  const headElement = htmlElement?.childNodes.find((node) => node.tagName === 'head');
  const bodyElement = htmlElement?.childNodes.find((node) => node.tagName === 'body');
  if (!headElement || !bodyElement) throw new Error('The public protocol document is incomplete');
  const attribute = (node, name) => node.attrs?.find((attr) => attr.name === name)?.value;
  // Remove only the template's generic metadata nodes, never sanitize HTML with a regular expression.
  headElement.childNodes = headElement.childNodes.filter((node) => !(
    (node.tagName === 'script' && attribute(node, 'type') === 'application/ld+json')
    || (node.tagName === 'meta' && attribute(node, 'name') === 'keywords')
    || (node.tagName === 'meta' && attribute(node, 'property') === 'og:locale:alternate')
  ));
  bodyElement.attrs.push({ name: 'class', value: 'nucleo-pages' });
  const protocolHtml = serialize(protocolDocument);
  await mkdir(path.join(out, '_seo', 'protocol'), { recursive: true });
  await writeFile(path.join(out, '_seo', 'protocol', 'index.html'), protocolHtml);
  console.log('Public prerender: /app (13 locales, 6 aliases) and /protocol (approved English copy, no fetched data).');
} finally {
  // The renderer is a build artifact, not a server function or a published file.
  await rm(renderDir, { recursive: true, force: true });
  await rm(path.join(out, '.vite'), { recursive: true, force: true });
}
