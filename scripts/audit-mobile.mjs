import fs from 'node:fs/promises';
import path from 'node:path';
import WebSocket from 'ws';

// Run Vite on :8080 and Chrome with --remote-debugging-port=9222, then execute this script.
// MOBILE_AUDIT_ROUTES and MOBILE_AUDIT_CAPTURE_ALL can narrow routes or save every screenshot.

const baseUrl = process.env.MOBILE_AUDIT_BASE_URL || 'http://127.0.0.1:8080';
const cdpUrl = process.env.MOBILE_AUDIT_CDP_URL || 'http://127.0.0.1:9222';
const outputDir = process.env.MOBILE_AUDIT_OUTPUT_DIR || '/tmp/bobby-mobile-audit';
const captureAll = process.env.MOBILE_AUDIT_CAPTURE_ALL === '1';

const defaultRoutes = [
  '/',
  '/protocol',
  '/protocol/docs',
  '/protocol/heartbeat',
  '/protocol/console',
  '/protocol/network',
  '/protocol/harness',
  '/protocol/playbooks',
  '/protocol/sandbox',
  '/agentic-world/bobby',
  '/defi-mexico',
  '/startups',
  '/blog',
  '/tiktok',
  '/comunidades',
  '/recursos',
  '/eventos',
  '/academia/videos',
  '/academia/juego/mercado-lp',
  '/nft-gallery',
  '/metricas',
  '/digital-art-defi',
  '/digital-art-defi/studio',
  '/digital-art-defi/gallery',
  '/ecosistema/trabajos',
  '/hackathon-projects',
  '/agentic-world',
  '/agentic-world/leaderboard',
  '/agentic-world/polymarket',
  '/agentic-world/consensus',
  '/agentic-world/bobby/console',
  '/agentic-world/network',
  '/agentic-world/claw-trader',
  '/agentic-world/claw-trader-chat',
  '/agentic-world/bobby/b2b',
  '/submission',
  '/agentic-world/deploy',
  '/agentic-world/bobby/challenge',
  '/agentic-world/bobby/analytics',
  '/agentic-world/bobby/history',
  '/agentic-world/bobby/agents',
  '/agentic-world/bobby/portfolio',
  '/agentic-world/bobby/telegram',
  '/agentic-world/bobby/metacognition',
  '/agentic-world/bobby/signals',
  '/agentic-world/bobby/docs',
  '/agentic-world/bobby/marketplace',
  '/agentic-world/forum',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/check-email',
  '/unauthorized',
];
const routes = process.env.MOBILE_AUDIT_ROUTES
  ? process.env.MOBILE_AUDIT_ROUTES.split(',').map((route) => route.trim()).filter(Boolean)
  : defaultRoutes;

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.ws = new WebSocket(url);
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
    this.ws.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      const callbacks = this.listeners.get(message.method) || [];
      for (const callback of callbacks) callback(message.params || {});
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  on(method, callback) {
    const callbacks = this.listeners.get(method) || [];
    callbacks.push(callback);
    this.listeners.set(method, callbacks);
  }

  close() {
    this.ws.close();
  }
}

async function getPageWebSocketUrl() {
  const response = await fetch(`${cdpUrl}/json/list`);
  const targets = await response.json();
  const page = targets.find((target) => target.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('No Chrome page target found');
  return page.webSocketDebuggerUrl;
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const client = new CdpClient(await getPageWebSocketUrl());
  await client.connect();

  const runtimeErrors = [];
  const consoleErrors = [];
  client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
    runtimeErrors.push(exceptionDetails?.exception?.description || exceptionDetails?.text || 'Runtime exception');
  });
  client.on('Runtime.consoleAPICalled', ({ type, args }) => {
    if (type !== 'error') return;
    consoleErrors.push(args.map((arg) => arg.value || arg.description || '').join(' '));
  });

  await Promise.all([
    client.send('Page.enable'),
    client.send('Runtime.enable'),
    client.send('Log.enable'),
    client.send('Network.enable'),
  ]);
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
  });
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await client.send('Emulation.setUserAgentOverride', {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    platform: 'iPhone',
  });

  const results = [];
  for (const route of routes) {
    runtimeErrors.length = 0;
    consoleErrors.length = 0;
    await client.send('Page.navigate', { url: new URL(route, baseUrl).href });
    await wait(1800);

    const evaluation = await client.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const root = document.documentElement;
        const body = document.body;
        const isVisible = (element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
        };
        const scrollWidth = Math.max(root?.scrollWidth || 0, body?.scrollWidth || 0);
        const overflow = Math.max(0, scrollWidth - innerWidth);
        const offenders = overflow > 2
          ? [...document.querySelectorAll('body *')]
              .filter(isVisible)
              .map((element) => ({
                element,
                rect: element.getBoundingClientRect(),
                style: getComputedStyle(element),
              }))
              .filter(({ rect, style }) => (
                (rect.right > innerWidth + 2 || rect.left < -2) &&
                style.position !== 'fixed'
              ))
              .slice(0, 8)
              .map(({ element, rect }) => ({
                tag: element.tagName.toLowerCase(),
                id: element.id || '',
                className: typeof element.className === 'string' ? element.className.slice(0, 140) : '',
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                width: Math.round(rect.width),
              }))
          : [];
        const smallControls = [...document.querySelectorAll('button, input, select, textarea, [role="button"]')]
          .filter(isVisible)
          .map((element) => ({ element, rect: element.getBoundingClientRect() }))
          .filter(({ element, rect }) => {
            const labelledNativeChoice = element.matches('input[type="checkbox"], input[type="radio"]') && element.closest('label');
            return (rect.width < 32 || rect.height < 32) && element.getAttribute('role') !== 'checkbox' && !labelledNativeChoice;
          })
          .slice(0, 12)
          .map(({ element, rect }) => ({
            tag: element.tagName.toLowerCase(),
            label: (element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 60),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          }));
        const internalLinks = [...document.querySelectorAll('a[href]')]
          .map((element) => element.getAttribute('href'))
          .filter((href) => href && href.startsWith('/') && !href.startsWith('/api/'))
          .filter((href, index, links) => links.indexOf(href) === index)
          .slice(0, 100);
        return {
          location: location.pathname,
          title: document.title,
          viewportMeta: Boolean(document.querySelector('meta[name="viewport"]')),
          bodyTextLength: (body?.innerText || '').trim().length,
          heading: document.querySelector('h1')?.innerText?.trim().slice(0, 100) || '',
          viewportWidth: innerWidth,
          scrollWidth,
          overflow,
          overlay: Boolean(document.querySelector('.vite-error-overlay, #webpack-dev-server-client-overlay, [data-nextjs-dialog]')),
          offenders,
          smallControls,
          internalLinks,
        };
      })()`,
    });

    const page = evaluation.result.value;
    const result = {
      route,
      ...page,
      runtimeErrors: [...new Set(runtimeErrors)].slice(0, 5),
      consoleErrors: [...new Set(consoleErrors)].slice(0, 5),
    };
    result.failed = !result.viewportMeta || result.bodyTextLength < 20 || result.overlay || result.overflow > 2 || result.runtimeErrors.length > 0;
    results.push(result);

    if (result.failed || captureAll) {
      const screenshot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const filename = route === '/' ? 'home' : route.replace(/^\//, '').replaceAll('/', '__');
      await fs.writeFile(path.join(outputDir, `${filename}.png`), Buffer.from(screenshot.data, 'base64'));
    }
    process.stdout.write(`${result.failed ? 'FAIL' : 'PASS'} ${route} overflow=${result.overflow}px text=${result.bodyTextLength} errors=${result.runtimeErrors.length}\n`);
  }

  const reportPath = path.join(outputDir, 'report.json');
  await fs.writeFile(reportPath, JSON.stringify(results, null, 2));
  const failures = results.filter((result) => result.failed);
  const warnings = results.filter((result) => result.smallControls.length > 0);
  process.stdout.write(`SUMMARY routes=${results.length} failures=${failures.length} small-control-warnings=${warnings.length} report=${reportPath}\n`);
  client.close();
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
