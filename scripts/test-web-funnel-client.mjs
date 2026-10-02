import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Independent local browser simulation. Network and authentication are stubbed;
// the tracker, access client, static home script and middleware are real source.
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(`${root}/package.json`);
const { build } = require('esbuild');
let checks = 0;
const eq = (a, b, why) => { assert.deepEqual(a, b, why); checks++; };
const UUID = '00000000-0000-4000-8000-000000000077';
const compile = async (entry, brokenTrack = false) => (await build({
  stdin: { contents: entry, resolveDir: root, loader: 'ts' },
  absWorkingDir: root, bundle: true, write: false, format: 'iife', globalName: 'BobbyTest', platform: 'browser',
  tsconfig: `${root}/tsconfig.json`,
  plugins: [{ name: 'local-auth-only', setup(b) {
    if (brokenTrack) b.onResolve({ filter: /^@\/lib\/track$/ }, () => ({ path: 'failed-track-stub', namespace: 'test' }));
    b.onResolve({ filter: /^@\/lib\/bobby-db-client$/ }, () => ({ path: 'auth-stub', namespace: 'test' }));
    b.onResolve({ filter: /^@\/lib\/companions\/sync$/ }, () => ({ path: 'wallet-stub', namespace: 'test' }));
    b.onLoad({ filter: /./, namespace: 'test' }, ({ path }) => ({ contents: path === 'failed-track-stub'
      ? "throw new Error('optional analytics chunk failed'); export function track() {}"
      : path === 'auth-stub'
      ? "export const bobbySupabase = () => ({ auth: { getSession: async () => { globalThis.__sessionCalls = (globalThis.__sessionCalls || 0) + 1; if (globalThis.__hangFirstAuth && globalThis.__sessionCalls === 1) await new Promise(() => {}); return { data: { session: globalThis.__session } }; } } });"
      : 'export const progressHeaders = () => ({});', loader: 'js' }));
  } }],
})).outputFiles[0].text;

const clientBundle = await compile("export { track, startTracking, surfaceOf } from './src/lib/track'; export { deviceId, startBilling } from './src/lib/access-client';");
const middlewareBundle = await compile("export { default as middleware } from './middleware';");
const failedOptionalBundle = await compile("export { startBilling } from './src/lib/access-client';", true);
const tick = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };

function browser(path, storage = new Map(), session = null, options = {}) {
  const sent = [], assigned = [], events = new Map();
  const location = { hostname: 'bobbyprotocol.xyz', pathname: path, search: '?utm_source=local-test',
    href: `https://bobbyprotocol.xyz${path}?utm_source=local-test`, assign: (url) => assigned.push(url) };
  const change = (url) => { const u = new URL(url, location.href); Object.assign(location, { hostname: u.hostname, pathname: u.pathname, search: u.search, href: u.href }); };
  const context = vm.createContext({
    console, URL, URLSearchParams, Request, Response, AbortController, setTimeout, clearTimeout, queueMicrotask, __session: session,
    __clockMs: Date.now(),
    location, crypto: { randomUUID: () => UUID },
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
    navigator: { sendBeacon: (url, body) => { sent.push({ url, body: JSON.parse(body), beacon: true }); return true; } },
    document: { referrer: 'https://campaign.example/landing', addEventListener: (name, cb) => events.set(`doc:${name}`, cb) },
    history: { pushState: (_state, _unused, url) => change(url), replaceState: (_state, _unused, url) => change(url) },
    addEventListener: (name, cb) => events.set(`win:${name}`, cb),
    fetch: async (url, init = {}) => {
      sent.push({ url, body: init.body ? JSON.parse(init.body) : null, headers: init.headers ?? {} });
      if (url === '/api/track' && options.rejectFirstTrack) { options.rejectFirstTrack = false; throw new Error('simulated analytics network failure'); }
      if (url === '/api/track' && options.holdFirstTrack) { const gate = options.holdFirstTrack; delete options.holdFirstTrack; await gate; }
      return url === '/api/bobby-access' ? Response.json({ url: 'https://checkout.stripe.test/local' }) : new Response(null, { status: 204 });
    },
  });
  vm.runInContext(`globalThis.window = globalThis;
    const OriginalDate = Date;
    globalThis.Date = class extends OriginalDate {
      constructor(...args) { super(...(args.length ? args : [globalThis.__clockMs])); }
      static now() { return globalThis.__clockMs; }
    };`, context);
  return { context, sent, assigned, events, storage, change };
}

// Middleware serves the static home script while the browser remains at '/'.
const route = browser('/');
vm.runInContext(middlewareBundle, route.context);
const rewrite = route.context.BobbyTest.middleware(new Request('https://bobbyprotocol.xyz/'));
eq(rewrite.headers.get('x-middleware-rewrite'), 'https://bobbyprotocol.xyz/home/index.html', 'root is served by the tracked static home');
const html = readFileSync(`${root}/public/home/index.html`, 'utf8');
const homeScript = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('bobby:device:v1'));
assert.ok(homeScript, 'static home contains device tracking script'); checks++;
vm.runInContext(homeScript, route.context);
await tick();
eq(route.sent.filter((r) => r.body?.event === 'visit').map((r) => [r.body.surface, r.body.platform, r.body.device]), [['home', 'web', UUID]], 'root emits home visit with persistent browser install');
eq(route.sent.find((r) => r.body?.event === 'visit').body.at, route.context.__clockMs, 'static home captures occurrence time when the event happens');

const desk = browser('/desk', route.storage, { access_token: 'LOCAL_TEST_TOKEN' });
vm.runInContext(clientBundle, desk.context);
eq(desk.context.BobbyTest.deviceId(), UUID, 'SPA reuses the static landing install id');
desk.context.BobbyTest.startTracking();
desk.context.BobbyTest.track('desk_entered', 'desk');
await tick();
const initial = desk.sent.filter((r) => r.url === '/api/track');
eq(initial.map((r) => [r.body.event, r.body.surface, r.body.device]), [['visit', 'desk', UUID], ['desk_entered', 'desk', UUID]], 'direct Desk entry sends distinct ordered entry events on one install');
eq(initial.map((r) => r.headers.Authorization), ['Bearer LOCAL_TEST_TOKEN', 'Bearer LOCAL_TEST_TOKEN'], 'identified tracker carries verified session credential');

desk.context.history.pushState(null, '', '/admin');
await tick();
eq(desk.sent.filter((r) => r.body?.event === 'visit').length, 1, 'admin route emits no visit');
desk.context.history.pushState(null, '', '/support');
await tick();
desk.context.history.pushState(null, '', '/support');
await tick();
eq(desk.sent.filter((r) => r.body?.event === 'visit').map((r) => r.body.surface), ['desk', 'support'], 'SPA navigation tracked once per path');

desk.change('/desk');
eq(await desk.context.BobbyTest.startBilling('checkout'), null, 'checkout receives mocked server URL');
await tick();
const starts = desk.sent.filter((r) => r.body?.event === 'purchase_start');
eq(starts.length, 1, 'checkout emits one intent diagnostic');
eq([starts[0].body.device, starts[0].body.surface, starts[0].headers.Authorization], [UUID, 'desk', 'Bearer LOCAL_TEST_TOKEN'], 'checkout diagnostic shares device and authenticated identity bridge');
const checkout = desk.sent.find((r) => r.url === '/api/bobby-access' && r.body?.action === 'checkout');
eq([checkout.headers['x-bobby-device'], checkout.headers['x-bobby-platform'], checkout.headers.Authorization], [UUID, 'web', 'Bearer LOCAL_TEST_TOKEN'], 'authoritative checkout request shares browser identity and platform');
eq(desk.assigned, ['https://checkout.stripe.test/local'], 'navigation uses the server returned URL');
eq(await desk.context.BobbyTest.startBilling('portal'), null, 'portal receives mocked URL');
await tick();
eq(desk.sent.filter((r) => r.body?.event === 'purchase_start').length, 1, 'portal does not emit a new purchase intent');

const anonymous = browser('/desk');
vm.runInContext(clientBundle, anonymous.context);
anonymous.context.BobbyTest.startTracking();
await tick();
eq(anonymous.sent[0].headers.Authorization, undefined, 'anonymous visit has no placeholder credential');
eq(anonymous.sent[0].body.device, UUID, 'anonymous browser keeps stable device id for later merge');

const rejected = browser('/desk', new Map(), null, { rejectFirstTrack: true });
vm.runInContext(clientBundle, rejected.context);
rejected.context.BobbyTest.startTracking();
rejected.context.BobbyTest.track('desk_entered', 'desk');
await tick();
eq(rejected.sent.filter((r) => r.url === '/api/track').map((r) => r.body.event), ['visit', 'desk_entered'], 'failed tracking request releases the next queued event');

const hung = browser('/desk');
vm.runInContext(clientBundle, hung.context);
hung.context.__hangFirstAuth = true;
hung.context.BobbyTest.startTracking();
hung.context.BobbyTest.track('desk_entered', 'desk');
await new Promise((resolve) => setTimeout(resolve, 4200));
await tick();
eq(hung.sent.filter((r) => r.url === '/api/track').map((r) => r.body.event), ['desk_entered'], 'real four-second auth deadline releases the next queued event');

const unavailableAnalytics = browser('/desk', new Map(), { access_token: 'LOCAL_TEST_TOKEN' });
vm.runInContext(failedOptionalBundle, unavailableAnalytics.context);
eq(await unavailableAnalytics.context.BobbyTest.startBilling('checkout'), null, 'optional analytics import failure does not prevent Checkout');
await tick();
eq(unavailableAnalytics.assigned, ['https://checkout.stripe.test/local'], 'failed analytics chunk still navigates to authoritative Checkout');

let releaseFirstTrack;
const firstTrackGate = new Promise((resolve) => { releaseFirstTrack = resolve; });
const delayed = browser('/desk', new Map(), { access_token: 'LOCAL_TEST_TOKEN' }, { holdFirstTrack: firstTrackGate });
vm.runInContext(clientBundle, delayed.context);
const visitAt = delayed.context.__clockMs;
delayed.context.BobbyTest.startTracking();
await tick();
delayed.context.__clockMs = visitAt + 250;
delayed.context.BobbyTest.track('desk_entered', 'desk');
await tick();
eq(delayed.sent.filter((r) => r.url === '/api/track').length, 1, 'second occurrence waits behind the slow first network request');
delayed.context.__clockMs = visitAt + 8000;
releaseFirstTrack();
await tick();
const delayedEntries = delayed.sent.filter((r) => r.url === '/api/track');
eq(delayedEntries.map((r) => [r.body.event, r.body.at]), [['visit', visitAt], ['desk_entered', visitAt + 250]], 'browser capture timestamps survive asynchronous queue delay');
eq(delayedEntries[1].body.at < delayed.context.__clockMs, true, 'queued Desk time represents occurrence rather than later send time');
console.log(`web-funnel-client independent VM: ${checks} checks passed; all network calls simulated`);
