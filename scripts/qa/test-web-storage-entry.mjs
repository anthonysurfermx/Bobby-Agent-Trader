// Run after npm run build. PLAYWRIGHT_MODULE may point to an installed playwright/index.mjs.
// All browser requests are intercepted, including wallet SDK requests. No account is connected.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
const origin = 'http://127.0.0.1:42799';
const appStore = 'apps.apple.com';
const desktop = { width: 1200, height: 840 };
const chrome = { channel: 'chrome', headless: true, viewport: desktop, serviceWorkers: 'block', reducedMotion: 'reduce' };

async function serveBuild(context) {
  const walletChunks = [];
  await context.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname.startsWith('/api/') || req.method() !== 'GET') {
      const json = url.pathname === '/api/bobby-access' ? { access: { tier: 'anon', used: 0, remaining: 3, limit: 3 }, signedIn: false, subscription: null, payments: { stripe: false, apple: true } }
        : url.pathname === '/api/bobby-asset-search' ? { movers: [], browse: {} } : {};
      return route.fulfill({ json });
    }
    if (url.pathname.startsWith('/_vercel/')) return route.fulfill({ contentType: 'text/javascript', body: '' });
    const page = { '/app': '_seo/app/en-US.html', '/protocol': '_seo/protocol/index.html' };
    const relative = req.isNavigationRequest() ? page[url.pathname] || 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const file = path.resolve(dist, relative);
    if (!file.startsWith(dist)) return route.abort();
    if (relative.startsWith('assets/Web3ContextProvider-')) walletChunks.push(relative);
    try {
      // Supplying a path lets Playwright set the resource's own MIME type.
      await route.fulfill({ path: file });
    } catch { await route.abort(); }
  });
  return walletChunks;
}

async function visit(page, pathname) {
  await page.goto(origin + pathname + '?lang=en&locale=en-US', { waitUntil: 'domcontentloaded' });
}

async function checkPublicPages(page, chunks) {
  for (const pathname of ['/app', '/protocol']) {
    const mounted = page.waitForRequest(request => new URL(request.url()).pathname === '/api/bobby-protocol-stats');
    await visit(page, pathname);
    await mounted;
    assert.ok(await page.locator('h1').first().isVisible(), pathname);
    assert.equal(chunks.length, 0, pathname + ' does not load the wallet');
  }
}

const profile = await mkdtemp(path.join(tmpdir(), 'bobby-web-site-data-'));
try {
  await mkdir(path.join(profile, 'Default'));
  // Chrome's own setting for blocking site data. JavaScript sees the real SecurityError.
  await writeFile(path.join(profile, 'Default', 'Preferences'), JSON.stringify({ profile: { default_content_setting_values: { cookies: 2 } } }));
  const denied = await chromium.launchPersistentContext(profile, chrome);
  try {
    const chunks = await serveBuild(denied);
    const page = await denied.newPage();
    await checkPublicPages(page, chunks);
    for (const [pathname, heading] of [['/privacy', 'Privacy Policy'], ['/signin', 'Sign in to Bobby']]) {
      await visit(page, pathname);
      await page.getByRole('heading', { name: heading }).waitFor();
    }
    await visit(page, '/desk');
    assert.equal(await page.evaluate(() => { try { void localStorage; return null; } catch (error) { return error.name; } }), 'SecurityError');
    await page.getByRole('heading', { name: 'Allow site data to open this page' }).waitFor();
    const download = page.getByRole('link', { name: 'Get Bobby for iPhone' });
    assert.equal(new URL(await download.getAttribute('href')).hostname, appStore);
    await Promise.all([page.waitForNavigation(), page.getByRole('button', { name: 'Try again' }).click()]);
    await download.waitFor();
    assert.equal(chunks.length, 0);
    console.log('PASS Blocked site data: both marketing pages mount and the desk offers a working retry and iPhone link.');
  } finally { await denied.close(); }
} finally { await rm(profile, { recursive: true, force: true }); }

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const context = await browser.newContext({ viewport: desktop, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    localStorage.setItem('bobby.companion.progress.v1', JSON.stringify({ aiConsentGranted: true, riskNoticeVersion: 7, onboarded: true }));
  });
  const chunks = await serveBuild(context);
  const page = await context.newPage();
  await checkPublicPages(page, chunks);
  await visit(page, '/desk');
  await page.locator('[data-desk-input]').waitFor();
  assert.ok(chunks.length > 0);
  assert.equal(await page.locator('w3m-modal.open').count(), 0);
  await page.locator('button.n-face-btn').click();
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.getByRole('button', { name: /continue with a wallet/i }).click();
  await page.locator('w3m-modal.open').waitFor();
  assert.equal(await page.locator('w3m-modal.open').evaluate(modal => modal.open), true);
  console.log('PASS Normal site data: the desk opens the wallet picker on request.');
} finally { await browser.close(); }
