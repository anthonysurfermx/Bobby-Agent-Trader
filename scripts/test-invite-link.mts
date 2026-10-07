// The invitation link end to end on the web, without a network, a browser or a database:
//   · the association file Apple fetches names this app and only the invitation path, is served as JSON and
//     is never rewritten to the app shell;
//   · /i/CODE keeps the code in the storage the desk reads (one writer), so a friend who continues on the web
//     is claimed exactly as before, and a link already shared as /desk?ref=CODE&v=2 still works;
//   · the page shows the right way in for an iPhone, an Android phone and a computer, in six languages,
//     names no store it cannot name, and promises the friend nothing;
//   · an iPhone is sent to the app only once the App Store serves a version that accepts invitations
//     (IOS_INVITE_LIVE), and then to the App Store first: whoever lands on this page has no app yet;
//   · a first visit sends the server two requests, neither with the code.
// The page, the access client and the link helpers are the real sources, bundled as the app bundles them.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(`${root}/package.json`);
const { build } = require('esbuild') as typeof import('esbuild');
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

let checks = 0;
const eq = (got: unknown, want: unknown, what: string) => { assert.deepEqual(got, want, what); checks++; };
const ok = (value: unknown, what: string) => { assert.ok(value, what); checks++; };

const { APP_STORE_URL } = await import('../src/lib/app-store.ts');
const { IOS_INVITE_LIVE, inviteCodeFrom, appInviteUrl, appStoreId, smartBannerContent, inviteDevice, inviteLayout } = await import('../src/lib/invite-link.ts');
const { isReferralCode, inviteUrl } = await import('../api/_lib/referrals.ts');

const AASA_PATH = '/.well-known/apple-app-site-association';
const CODE = 'ABCD2345';
const LANGS = ['en', 'es', 'fr', 'pt', 'it', 'de'] as const;

// ---------- the association file and how Vercel serves it ----------
{
  const aasa = JSON.parse(read(`public${AASA_PATH}`));
  const details = aasa.applinks.details;
  eq(details.length, 1, 'one app is associated with the site');
  const project = read('ios/Bobby/project.yml');
  const teams = [...new Set([...project.matchAll(/DEVELOPMENT_TEAM:\s*(\S+)/g)].map((m) => m[1]))];
  const bundle = /^\s*PRODUCT_BUNDLE_IDENTIFIER:\s*(xyz\.bobbyprotocol\.bobby)\s*$/m.exec(project)?.[1];
  eq(teams.length, 1, 'the iOS project names one team');
  eq(details[0].appIDs, [`${teams[0]}.${bundle}`], 'the appID is the team and bundle id of ios/Bobby/project.yml');
  eq(details[0].appIDs, ['QZRTV6CMTT.xyz.bobbyprotocol.bobby'], 'the appID Apple will look for');
  eq(details[0].components.map((c: { '/': string }) => c['/']), ['/i/*'], 'only invitation links open the app: /desk and every other page stay in the browser');
  ok(!('paths' in details[0]) && !('webcredentials' in aasa), 'nothing else is granted to the app');

  const vercel = JSON.parse(read('vercel.json')) as { rewrites: Array<{ source: string; destination: string }>; redirects?: Array<{ source: string }>; headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> };
  const rule = vercel.headers.filter((h) => h.source === AASA_PATH);
  eq(rule.length, 1, 'one header rule for the association file');
  eq(rule[0].headers.find((h) => h.key.toLowerCase() === 'content-type')?.value, 'application/json', 'it is served as JSON (the file has no extension)');

  // vercel.json sources: literal text, :params, and raw parenthesised expressions.
  const sourcePattern = (source: string): RegExp => {
    let out = '';
    for (let i = 0; i < source.length;) {
      if (source[i] === '(') {
        let depth = 0, j = i;
        do { if (source[j] === '\\') j++; else if (source[j] === '(') depth++; else if (source[j] === ')') depth--; j++; } while (depth > 0 && j < source.length);
        out += source.slice(i, j); i = j;
      } else if (source[i] === ':') {
        const param = /^:[A-Za-z0-9_]+([*+?])?/.exec(source.slice(i))!;
        i += param[0].length;
        if (source[i] !== '(') out += param[1] === '*' ? '.*' : param[1] === '+' ? '.+' : param[1] === '?' ? '[^/]*' : '[^/]+';
      } else { out += source[i].replace(/[.*+?^${}|[\]\\]/g, '\\$&'); i++; }
    }
    return new RegExp(`^${out}$`);
  };
  const rewritten = (path: string) => vercel.rewrites.filter((r) => sourcePattern(r.source).test(path)).map((r) => r.destination);
  ok(sourcePattern('/((?!api/|assets/|ai-judge-manifest\\.json$).*)').test(AASA_PATH), 'the check can tell: the previous catch-all did match the file');
  eq(rewritten(AASA_PATH), [], 'no rewrite touches the association file');
  eq(rewritten('/.well-known/assetlinks.json'), [], 'nor anything else under /.well-known/: a missing file is a 404, never the app shell');
  eq((vercel.redirects ?? []).filter((r) => sourcePattern(r.source).test(AASA_PATH)), [], 'no redirect either: Apple does not follow them');
  eq([rewritten(`/i/${CODE}`), rewritten('/desk'), rewritten('/api/bobby-access')], [['/'], ['/'], []], 'the invitation page and the desk are still the app shell; the API is not');

  const { config } = await import('../middleware.ts');
  eq(config.matcher.filter((m: string) => m !== '/' && m !== '/app-ads.txt'), [], 'the middleware does not run on the association file');
  ok(/denylist:.*\\\.well-known/.test(read('src/sw.ts')), 'the service worker leaves /.well-known/ to the network');
}

// ---------- the link helpers ----------
{
  eq(['abcd2345', ' K7M9QRST ', 'ABCDEFGH', 'ABCDEFG', 'ABCDEFGI', 'ABCDEF01', 'ABCD2345X', '', undefined, 42].map(inviteCodeFrom),
    ['ABCD2345', 'K7M9QRST', 'ABCDEFGH', null, null, null, null, null, null, null], 'a code is eight of A-Z and 2-9 without I, O, 0, 1; any case, uppercased');
  ok(['ABCD2345', 'K7M9QRST', 'ABCDEFGH'].every((c) => isReferralCode(c) && inviteCodeFrom(c) === c), 'the page and the server agree on what a code is');
  eq(new URL(inviteUrl('https://bobbyprotocol.xyz', CODE)).pathname.split('/'), ['', 'i', CODE], 'the server link is the path this page reads');
  eq(appInviteUrl(CODE), `bobbyprotocol://invite/${CODE}`, 'the app link uses the registered scheme');
  ok(/CFBundleURLSchemes:\s*\n\s*- bobbyprotocol\s*\n/.test(read('ios/Bobby/project.yml')), 'which is the scheme ios/Bobby/project.yml registers');
  const id = appStoreId();
  ok(id && /^\d{6,}$/.test(id) && APP_STORE_URL.endsWith(`/id${id}`), 'the App Store id is read from the listing URL');
  eq([appStoreId('https://apps.apple.com/app/x/id123456789?l=es'), appStoreId('https://apps.apple.com/app/video-x/'), appStoreId('https://apps.apple.com/app/x/idea')], ['123456789', null, null], 'only the digits after /id count');
  eq(smartBannerContent(`https://bobbyprotocol.xyz/i/${CODE}`), `app-id=${id}, app-argument=https://bobbyprotocol.xyz/i/${CODE}`, 'the banner hands the app this invitation');
  eq([smartBannerContent(null), smartBannerContent('https://x/i/A', 'https://apps.apple.com/app/x')], [`app-id=${id}`, null], 'no invitation: no argument; no id: no banner');
  const UA = {
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
    ipad: 'Mozilla/5.0 (iPad; CPU OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.7 Mobile/15E148 Safari/604.1',
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
    android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
    windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    instagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22F76 Instagram 400.0.0.0',
  };
  eq([inviteDevice(UA.iphone, 5), inviteDevice(UA.ipad, 5), inviteDevice(UA.mac, 5), inviteDevice(UA.mac, 0), inviteDevice(UA.android, 5), inviteDevice(UA.windows, 10), inviteDevice(UA.instagram, 5), inviteDevice('')],
    ['ios', 'ios', 'ios', 'other', 'android', 'other', 'ios', 'other'], 'iPhone, iPad (also when it calls itself a Mac), Android, and computers');
  eq([inviteLayout('ios', true), inviteLayout('ios', false), inviteLayout('android', true), inviteLayout('android', false), inviteLayout('other', true), inviteLayout('other', false)],
    ['app', 'web', 'android', 'android', 'web', 'web'], 'an iPhone is sent to the app only when the app in the store accepts invitations; until then it gets the web page');
  ok(typeof IOS_INVITE_LIVE === 'boolean' && inviteLayout('ios') === (IOS_INVITE_LIVE ? 'app' : 'web'), 'the switch is IOS_INVITE_LIVE');
}

// ---------- the page and the access client, as the app bundles them ----------
const bundle = (await build({
  stdin: { resolveDir: root, loader: 'tsx', contents: `
    import { renderToStaticMarkup } from 'react-dom/server';
    import { StaticRouter, Routes, Route } from 'react-router-dom';
    import { HelmetProvider } from 'react-helmet-async';
    import Page, { InviteView } from './src/pages/BobbyInvitePage';
    export { storeReferral, captureReferral, pendingReferral, claimPendingReferral } from './src/lib/access-client';
    export { track } from './src/lib/track';
    // live: whether the App Store serves an app that accepts invitations; left out, the page decides (IOS_INVITE_LIVE).
    export function renderPage(path, live) {
      const context = {};
      const page = live === undefined ? <Page /> : <Page appInvites={live} />;
      const html = renderToStaticMarkup(<HelmetProvider context={context}><StaticRouter location={path}><Routes>
        <Route path="i/:code" element={page} /><Route path="i" element={page} /></Routes></StaticRouter></HelmetProvider>);
      return { html, meta: context.helmet.meta.toString(), title: context.helmet.title.toString(), htmlAttributes: context.helmet.htmlAttributes.toString() };
    }
    export const renderView = (props) => renderToStaticMarkup(<InviteView {...props} />);
  ` },
  absWorkingDir: root, bundle: true, write: false, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
  tsconfig: `${root}/tsconfig.json`, external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime'],
  define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'no-accounts', setup(b) {
    b.onResolve({ filter: /^@\/lib\/bobby-db-client$/ }, () => ({ path: 'auth-stub', namespace: 'test' }));
    b.onResolve({ filter: /^@\/lib\/companions\/sync$/ }, () => ({ path: 'wallet-stub', namespace: 'test' }));
    b.onLoad({ filter: /./, namespace: 'test' }, ({ path }) => ({ loader: 'js', contents: path === 'auth-stub'
      ? 'export const bobbySupabase = () => ({ auth: { getSession: async () => ({ data: { session: globalThis.__session } }) } });'
      : 'export const progressHeaders = () => ({});' }));
  } }],
})).outputFiles[0].text;

interface Sent { url: string; method: string; body: Record<string, unknown> | null; headers: Record<string, string> }
function browser(href: string, options: { userAgent?: string; touch?: number; storage?: Map<string, string>; refuseStorage?: boolean; session?: unknown; claim?: { status: number; body: unknown }; languages?: string[]; referrer?: string } = {}) {
  const storage = options.storage ?? new Map<string, string>();
  const sent: Sent[] = [];
  const at = new URL(href);
  const location = { href: at.href, origin: at.origin, hostname: at.hostname, pathname: at.pathname, search: at.search, hash: at.hash };
  const move = (url: string) => { const u = new URL(url, location.href); Object.assign(location, { href: u.href, pathname: u.pathname, search: u.search, hash: u.hash }); };
  const context = vm.createContext({
    console, URL, URLSearchParams, Response, AbortController, AbortSignal, setTimeout, clearTimeout, queueMicrotask, TextEncoder, TextDecoder, process,
    require, module: { exports: {} }, __session: options.session ?? null,
    location, crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000018' },
    ...(options.referrer === undefined ? {} : { document: { referrer: options.referrer } }),
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => { if (options.refuseStorage) throw new Error('storage refused'); storage.set(k, String(v)); },
      removeItem: (k: string) => { storage.delete(k); },
    },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    navigator: { userAgent: options.userAgent ?? '', maxTouchPoints: options.touch ?? 0, language: options.languages?.[0] ?? 'en-US', languages: options.languages ?? ['en-US'] },
    history: { state: null, replaceState: (_s: unknown, _t: string, url: string) => move(url), pushState: (_s: unknown, _t: string, url: string) => move(url) },
    fetch: async (url: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}) => {
      sent.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : null, headers: init.headers ?? {} });
      if (url === '/api/bobby-access' && init.method === 'POST' && options.claim) return new Response(JSON.stringify(options.claim.body), { status: options.claim.status, headers: { 'Content-Type': 'application/json' } });
      return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
    },
  });
  vm.runInContext('globalThis.window = globalThis; globalThis.exports = module.exports;', context);
  vm.runInContext(bundle, context);
  const api = (context as { module: { exports: Record<string, (...args: any[]) => any> } }).module.exports;
  return { api, storage, sent, location };
}
const REF_KEY = 'bobby:ref:v1';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const hrefs = (html: string) => [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*data-invite-action="([^"]+)"/g)].map((m) => `${m[2]} ${m[1]}`);
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '’').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const STORE_ID = appStoreId()!;
const buttonClass = (html: string, action: string) => new RegExp(`<a [^>]*class="([^"]*)"[^>]*data-invite-action="${action}"`).exec(html)?.[1] ?? '';
const isPrimary = (html: string, action: string) => buttonClass(html, action).includes('bg-[#F2EDE4]');
const IPHONE_LIVE = [`store ${APP_STORE_URL}`, `open-app bobbyprotocol://invite/${CODE}`, 'web /desk'];
const WEB_FIRST = ['web /desk', `store ${APP_STORE_URL}`];

// ---- the one writer, and the link that is already out there ----
{
  const b = browser(`https://bobbyprotocol.xyz/i/${CODE}`);
  eq([b.api.storeReferral('k7m9qrst'), b.storage.get(REF_KEY), b.api.pendingReferral()], ['K7M9QRST', 'K7M9QRST', 'K7M9QRST'], 'storeReferral keeps a valid code, uppercased, where the desk reads it');
  eq([b.api.storeReferral('ABCDEFGI'), b.api.storeReferral(''), b.api.storeReferral(null), b.storage.get(REF_KEY)], [null, null, null, 'K7M9QRST'], 'anything else is refused and leaves the stored code alone');
  ok(read('src/lib/access-client.ts').split('localStorage.setItem(REF_KEY').length === 2, 'the stored code has a single writer');

  const legacy = browser(`https://bobbyprotocol.xyz/desk?ref=abcd2345&v=2&lang=es`);
  eq([legacy.api.captureReferral(), legacy.storage.get(REF_KEY), legacy.location.pathname + legacy.location.search], [CODE, CODE, '/desk?lang=es'],
    'a link already shared as /desk?ref=CODE&v=2 still stores the code and cleans the address');
  const none = browser('https://bobbyprotocol.xyz/desk?ref=nope');
  eq([none.api.captureReferral(), none.storage.has(REF_KEY), none.location.search], [null, false, ''], 'a bad ?ref stores nothing and is removed from the address, as before');
  const refused = browser(`https://bobbyprotocol.xyz/desk?ref=${CODE}&v=2`, { refuseStorage: true, session: { access_token: 'friend-token' }, claim: { status: 200, body: { result: 'claimed' } } });
  eq([refused.api.captureReferral(), refused.location.search], [null, `?ref=${CODE}&v=2`], 'storage refused: the address is left as it is, as before');
  eq([refused.api.pendingReferral(), await refused.api.claimPendingReferral(), refused.sent.filter((s) => s.method === 'POST')], [null, null, []],
    'and a code that is only in the address is never claimed: without storage the web cannot hold an invitation');
}

// ---- the page: a valid invitation on an iPhone, once the App Store serves an app that accepts it ----
{
  const b = browser(`https://bobbyprotocol.xyz/i/abcd2345?lang=en`, { userAgent: IPHONE, touch: 5 });
  const page = b.api.renderPage('/i/abcd2345', true);
  eq(b.storage.get(REF_KEY), CODE, 'opening /i/CODE stores the code (any case) for the web desk');
  // An iPhone with the app never sees this page (the universal link opens the app), so its visitors have no app
  // yet, or are inside another app's browser, where bobbyprotocol:// is an error or does nothing.
  eq(hrefs(page.html), IPHONE_LIVE, 'iPhone: the App Store first, then the installed app, then the web');
  eq([isPrimary(page.html, 'store'), isPrimary(page.html, 'open-app')], [true, false], 'iPhone: the main button is the App Store; the app link is the second one');
  ok(new RegExp(`<span data-invite-code="true"[^>]*>${CODE}</span>`).test(page.html), 'the code is on screen');
  const words = text(page.html);
  for (const sentence of ['A friend invited you to Bobby', 'Ask about a stock or a crypto asset. Three AI agents debate it and tell you what to review and what to wait for.', 'Education, not financial advice.',
    'Copy code', 'Get Bobby on the App Store', 'Already have Bobby? Open the app', 'Install Bobby and create your account.', 'Tap your friend’s link again, or type the code in Profile, Credits, Invite friends.', 'Continue on the web']) ok(words.includes(sentence), `iPhone shows: ${sentence}`);
  eq((page.html.match(/<li>/g) ?? []).length, 2, 'two numbered steps');
  ok(page.meta.includes(`name="apple-itunes-app" content="app-id=${STORE_ID}, app-argument=https://bobbyprotocol.xyz/i/${CODE}"`), 'Safari is told which app this page belongs to, with the invitation as its argument');
  ok(page.meta.includes('name="robots" content="noindex"') && page.title.includes('A friend invited you to Bobby | Bobby') && page.htmlAttributes.includes('lang="en-US"'), 'the page is not indexed and names itself');
  eq(b.sent, [], 'the page sends the code nowhere: with the language already known it makes no request at all');

  // …and the friend who continues on the web is claimed exactly as a /desk?ref= visitor is.
  const web = browser('https://bobbyprotocol.xyz/desk', { storage: b.storage, session: { access_token: 'friend-token' }, claim: { status: 200, body: { result: 'claimed' } } });
  eq([web.api.captureReferral(), await web.api.claimPendingReferral()], [CODE, 'claimed'], 'the desk finds the code and the claim goes through');
  const claim = web.sent.find((s) => s.method === 'POST')!;
  eq([claim.url, claim.body, claim.headers.Authorization], ['/api/bobby-access', { action: 'referral-claim', code: CODE }, 'Bearer friend-token'], 'same request as today: referral-claim with the code, as the signed-in friend');
  eq(web.storage.has(REF_KEY), false, 'a final answer forgets the code');
}

// ---- the same iPhone while the App Store still serves 1.5-1.7, which cannot accept an invitation ----
{
  const b = browser(`https://bobbyprotocol.xyz/i/abcd2345?lang=en`, { userAgent: IPHONE, touch: 5 });
  const page = b.api.renderPage('/i/abcd2345', false);
  const words = text(page.html);
  eq(b.storage.get(REF_KEY), CODE, 'not live yet: the code is stored for the web desk all the same');
  eq(hrefs(page.html), WEB_FIRST, 'not live yet: an iPhone continues on the web first (the desk does claim); the App Store is second');
  eq([isPrimary(page.html, 'web'), isPrimary(page.html, 'store')], [true, false], 'not live yet: the main button is the web');
  ok(!page.html.includes('bobbyprotocol://') && !words.includes('Open the app'), 'not live yet: no link into an app that would open and do nothing');
  ok(!page.html.includes('<li>') && !words.includes('Invite friends') && !words.includes('Install Bobby'), 'not live yet: no steps through a screen the installed app does not have');
  ok(!page.meta.includes('apple-itunes-app'), 'not live yet: Safari’s banner does not send the invitation to the App Store either');
  ok(page.html.includes(`>${CODE}</span>`) && words.includes('A friend invited you to Bobby') && words.includes('Copy code'), 'not live yet: the invitation and its code are still shown');
  eq(page.html.replace(/data-invite-device="ios"/, 'data-invite-device="other"'), browser(`https://bobbyprotocol.xyz/i/${CODE}?lang=en`, { userAgent: MAC }).api.renderPage(`/i/${CODE}`, false).html,
    'not live yet: it is the page a computer gets');

  // The route passes no switch: what ships follows IOS_INVITE_LIVE.
  const shipped = browser(`https://bobbyprotocol.xyz/i/${CODE}?lang=en`, { userAgent: IPHONE, touch: 5 }).api.renderPage(`/i/${CODE}`);
  eq([hrefs(shipped.html), shipped.meta.includes('app-argument')], [IOS_INVITE_LIVE ? IPHONE_LIVE : WEB_FIRST, IOS_INVITE_LIVE], 'the route shows an iPhone what IOS_INVITE_LIVE says');
}

// ---- a friend's first visit: no ?lang, no stored language, no cached country ----
{
  const b = browser(`https://bobbyprotocol.xyz/i/${CODE}`, { userAgent: IPHONE, touch: 5, referrer: 'https://chat.example/thread' });
  b.api.renderPage(`/i/${CODE}`);
  b.api.track('visit'); // what startTracking (src/main.tsx) sends for every page view
  await new Promise((resolve) => setTimeout(resolve, 20));
  eq(b.sent.map((s) => `${s.method} ${s.url}`), ['GET /api/geo', 'POST /api/track'], 'a first visit asks for the country, to choose the language, and counts the visit; nothing else');
  const [geo, visit] = b.sent;
  eq([geo.body, Object.keys(geo.headers)], [null, []], 'the country request carries nothing');
  eq([Object.keys(visit.body!).sort(), visit.body!.event, visit.body!.surface, visit.body!.referrer], [['at', 'device', 'event', 'platform', 'referrer', 'surface'], 'visit', 'invite', 'https://chat.example/thread'],
    'the visit names the surface "invite", not the address');
  ok(!JSON.stringify(b.sent).toUpperCase().includes(CODE), 'neither request carries the invitation code');
  eq(b.storage.get(REF_KEY), CODE, 'and the code is kept in this browser');
}

// ---- Android, a computer, and an iPad that calls itself a Mac ----
{
  const android = browser(`https://bobbyprotocol.xyz/i/${CODE}?lang=en`, { userAgent: ANDROID, touch: 5 }).api.renderPage(`/i/${CODE}`, true);
  eq(hrefs(android.html), ['web /desk'], 'Android: the web is the only button');
  eq(browser(`https://bobbyprotocol.xyz/i/${CODE}?lang=en`, { userAgent: ANDROID, touch: 5 }).api.renderPage(`/i/${CODE}`, false).html, android.html, 'Android: the same page whatever the iPhone app can do');
  ok(text(android.html).includes('Type this code in Bobby under Invite friends.') && android.html.includes(`>${CODE}</span>`), 'Android: the code and where to type it');
  ok(!/apps\.apple\.com|play\.google\.com|market:\/\/|bobbyprotocol:\/\//.test(android.html), 'Android: no store link is invented and the iPhone links are not shown');

  const mac = browser(`https://bobbyprotocol.xyz/i/${CODE}?lang=en`, { userAgent: MAC, touch: 0 }).api.renderPage(`/i/${CODE}`, true);
  eq(hrefs(mac.html), WEB_FIRST, 'a computer: continue on the web first, the App Store second');
  const ipad = browser(`https://bobbyprotocol.xyz/i/${CODE}?lang=en`, { userAgent: MAC, touch: 5 }).api.renderPage(`/i/${CODE}`, true);
  eq(hrefs(ipad.html), IPHONE_LIVE, 'an iPad in desktop mode gets the iPhone page');

  // A browser that refuses storage cannot hold an invitation on the web (the desk drops a code in its address
  // the same way, see above), so the page does not offer a link that only looks as if it carried one.
  const refusing = browser(`https://bobbyprotocol.xyz/i/${CODE}?lang=en`, { userAgent: MAC, refuseStorage: true });
  const refused = refusing.api.renderPage(`/i/${CODE}`, true);
  eq([hrefs(refused.html), refusing.storage.has(REF_KEY)], [WEB_FIRST, false], 'storage refused: the web link is the plain desk; nothing is stored and no address pretends to carry the code');
  ok(refused.html.includes(`>${CODE}</span>`), 'storage refused: the code stays on screen for the app');
}

// ---- a link that is not an invitation ----
for (const path of ['/i/ABCDEFGI', '/i/ABC', '/i/ABCD2345X', '/i']) for (const live of [true, false]) {
  const b = browser(`https://bobbyprotocol.xyz${path}?lang=en`, { userAgent: IPHONE, touch: 5 });
  const page = b.api.renderPage(path, live);
  eq([b.storage.has(REF_KEY), hrefs(page.html)], [false, [`store ${APP_STORE_URL}`, 'web /desk']], `${path}: nothing is stored; the App Store and the web remain`);
  ok(text(page.html).includes('This invitation link is not valid. Ask your friend to share it again.') && !page.html.includes('data-invite-code') && !page.html.includes('bobbyprotocol://'), `${path}: a calm message, no code, no app link`);
  ok(page.meta.includes(`content="app-id=${STORE_ID}"`) && !page.meta.includes('app-argument'), `${path}: the banner carries no invitation`);
}
{
  const kept = new Map([[REF_KEY, 'K7M9QRST']]);
  browser('https://bobbyprotocol.xyz/i/nope?lang=en', { storage: kept }).api.renderPage('/i/nope');
  eq(kept.get(REF_KEY), 'K7M9QRST', 'a broken link does not erase an invitation already waiting');
  const android = browser('https://bobbyprotocol.xyz/i/nope?lang=en', { userAgent: ANDROID }).api.renderPage('/i/nope');
  eq(hrefs(android.html), ['web /desk'], 'Android, broken link: only the web');
}

// ---- six languages, the visitor's own, and the words Bobby does not use ----
{
  const perLanguage = LANGS.map((language) => {
    const b = browser(`https://bobbyprotocol.xyz/i/${CODE}`, { languages: [language] });
    const states = [
      b.api.renderView({ code: CODE, device: 'ios', language, appInvites: true }),
      b.api.renderView({ code: CODE, device: 'android', language, appInvites: true }),
      b.api.renderView({ code: CODE, device: 'other', language, appInvites: true }),
      b.api.renderView({ code: null, device: 'ios', language, appInvites: true }),
      b.api.renderView({ code: CODE, device: 'ios', language, appInvites: false }),
    ].map(text);
    return { language, states };
  });
  const english = perLanguage[0].states;
  for (const { language, states } of perLanguage) {
    ok(states.every((s) => s.length > 60 && !s.includes('undefined')), `${language}: every state has its copy`);
    if (language !== 'en') ok(states.every((s, i) => s.replace(CODE, '').replace(/Bobby/g, '') !== english[i].replace(CODE, '').replace(/Bobby/g, '')), `${language}: is translated`);
    for (const s of states) {
      // "advice" appears once, in the disclaimer the page must carry; nothing else from the list, in any language.
      ok(!/\b(buy|sell|profits?|guaranteed?|returns?|signals?|alerts?|free|reward|bonus|gift|gratis|gratuit|kostenlos|recompensa|récompense|ricompensa|belohnung|regalo|cadeau|geschenk|prémio|presente)\b/i.test(s), `${language}: no trading words and no promise to the friend`);
      ok(!/[!¡]/.test(s), `${language}: no exclamation marks`);
    }
    ok(states[0].includes(CODE) && !states[3].includes(CODE), `${language}: the code shows only for a valid invitation`);
  }
  const visitor = (languages: string[], query = '') => text(browser(`https://bobbyprotocol.xyz/i/${CODE}${query}`, { languages, userAgent: IPHONE, storage: new Map([['bobby_geo', 'ZZ']]) }).api.renderPage(`/i/${CODE}`).html);
  ok(visitor(['es-MX', 'en']).includes('Un amigo te invitó a Bobby'), 'the visitor’s browser language chooses the copy');
  ok(visitor(['es-MX'], '?lang=de').includes('Ein Freund hat dich zu Bobby eingeladen'), '?lang= wins, as on the other pages');
  ok(visitor(['ja-JP']).includes('A friend invited you to Bobby'), 'an unsupported language reads English');
}

// ---- the route is declared, and the visit is counted without the code ----
{
  const app = read('src/App.tsx');
  ok(/lazy\(\(\) => import\('@\/pages\/BobbyInvitePage'\)\)/.test(app) && /path: 'i\/:code',\s*\n\s*element: \(<Suspense fallback=\{<PageLoader \/>\}><BobbyInvitePage \/><\/Suspense>\)/.test(app), 'src/App.tsx declares /i/:code as a lazy route');
  ok(/\[\/\^\\\/i\(\\\/\|\$\)\/, 'invite'\]/.test(read('src/lib/track.ts')), 'visits and App Store taps on the page are counted under the surface "invite"');
}

console.log(`invite-link: ${checks} checks passed`);
