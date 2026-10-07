// Web activation (1.8): the first screen leads to a question, and the desk shows its value before it asks for consent.
//
// What runs here is the shipping source: the desk component (NucleoDesk), the notice (NucleoRisk), the progress
// store, the tracker, the access client, the desk's data layer and the link parser are bundled as they are.
// Only what cannot exist in a test is replaced: the network (recorded, never sent), the auth client, the glass,
// the sheets and the animation library. There is no DOM in this repository's test tooling, so the desk is
// rendered by a small hook runtime (state, effects with dependencies, refs, memo, external stores) one level
// deep: it runs the component's own logic and returns its element tree, whose handlers the test calls.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(`${root}/package.json`);
const { build } = require('esbuild');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('ok - ' + name); };
const asyncCheck = async (name, fn) => { await fn(); checks++; console.log('ok - ' + name); };

// ---------------------------------------------------------------------------------------------------------
// The bundle: real sources, with the handful of replacements listed above.
// ---------------------------------------------------------------------------------------------------------
const REACT = `
const R = globalThis.__R = globalThis.__R || { current: null };
const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const slot = (init) => { const c = R.current; if (!c) throw new Error('hook called outside a render'); const i = c.i++; if (i >= c.cells.length) c.cells.push(init()); return c.cells[i]; };
export function useState(init) {
  const c = R.current;
  const cell = slot(() => ({ v: typeof init === 'function' ? init() : init, set: null }));
  cell.set = cell.set || ((next) => { const v = typeof next === 'function' ? next(cell.v) : next; if (!Object.is(v, cell.v)) { cell.v = v; c.dirty = true; } });
  return [cell.v, cell.set];
}
export function useRef(init) { return slot(() => ({ current: init })); }
export function useMemo(fn, deps) { const cell = slot(() => ({ deps: null, v: undefined, set: false })); if (!cell.set || !same(cell.deps, deps)) { cell.v = fn(); cell.deps = deps; cell.set = true; } return cell.v; }
export function useCallback(fn, deps) { return useMemo(() => fn, deps); }
export function useEffect(fn, deps) {
  const c = R.current;
  const cell = slot(() => ({ deps: null, cleanup: null, ran: false }));
  if (!cell.ran || !deps || !same(cell.deps, deps)) c.effects.push(() => { if (typeof cell.cleanup === 'function') cell.cleanup(); cell.cleanup = fn(); cell.ran = true; });
  cell.deps = deps;
}
export const useLayoutEffect = useEffect;
export function useSyncExternalStore(subscribe, get) { const c = R.current; const cell = slot(() => ({ on: false })); if (!cell.on) { cell.on = true; subscribe(() => { c.dirty = true; }); } return get(); }
export const useId = () => 'test-id';
export const Fragment = 'fragment';
export const lazy = (load) => load;
export const memo = (component) => component;
export const forwardRef = (render) => (props) => render(props, null);
export default { useState, useRef, useMemo, useCallback, useEffect, useLayoutEffect, useSyncExternalStore, useId, Fragment };
`;
const JSX = `
const element = (type, props, key) => ({ type, props: props || {}, key });
export const jsx = element, jsxs = element, jsxDEV = element, Fragment = 'fragment';
`;
// Named after what they stand in for; each export is a marker the tree can be searched for.
const marker = (name, exports = ['default']) => `const make = (key) => Object.assign(function () { return null; }, { stub: ${JSON.stringify(name)} + ':' + key });
${exports.map((key) => (key === 'default' ? `export default make('default');` : `export const ${key} = make(${JSON.stringify(key)});`)).join('\n')}`;
const STUBS = {
  react: REACT,
  'react/jsx-runtime': JSX,
  'react/jsx-dev-runtime': JSX,
  'framer-motion': `export const motion = new Proxy({}, { get: (_t, key) => String(key) }); export const AnimatePresence = 'fragment';`,
  'react-router-dom': `export const useNavigate = () => (to) => { globalThis.__navigated.push(to); };
    export const useSearchParams = () => [new URLSearchParams(globalThis.location.search)];
    export const useLocation = () => ({ state: null, pathname: globalThis.location.pathname, search: globalThis.location.search });`,
  'lucide-react': marker('icon', ['ArrowRight', 'Check', 'ChevronDown', 'ChevronRight', 'Layers', 'Mic', 'MicOff', 'RotateCcw', 'Sparkles', 'X', 'Zap']),
  '@radix-ui/react-dialog': marker('dialog', ['Root', 'Portal', 'Overlay', 'Content', 'Title', 'Close']),
  '@radix-ui/react-popover': marker('popover', ['Root', 'Trigger', 'Portal', 'Content']),
  '@radix-ui/react-slider': marker('slider', ['Root', 'Track', 'Thumb']),
  '@/lib/companions/sfx': `export const sfxMuted = () => true, setSfxMuted = () => {}, sfxShield = () => {}, sfxSuccess = () => {}, sfxTock = () => {};`,
  '@/hooks/useCompanionVoice': `export const useCompanionVoice = () => globalThis.__voice;`,
  '@/lib/companions/sync': `export const getSyncStatus = () => 'idle', progressHeaders = () => null, onSyncStatus = () => () => {}, onProgressCredentialChange = () => () => {};`,
  '@/lib/bobby-db-client': `export const bobbySupabase = () => ({ auth: {
    getSession: async () => ({ data: { session: globalThis.__session } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  } });`,
  '@/lib/client-telemetry-browser': `export const beginClientRead = () => ({ requestId: '00000000-0000-4000-8000-000000000000' }), receiveClientRead = () => null;`,
  '@/components/companion/NucleoSphere': marker('sphere'),
  '@/components/companion/SignInPrompt': `export default Object.assign(function () { return null; }, { stub: 'signin:default' }); export const recordAsk = () => 1, shouldPromptAfterAsk = () => false, shouldPromptNow = () => false;`,
  '@/components/companion/CompanionOverlays': marker('overlay', ['EvolutionOverlay', 'GearCatalog', 'ToolDetail', 'ToolUnlockOverlay']),
  '@/components/companion/LandSeedCard': marker('land'),
  '@/components/companion/DeskSwap': marker('swap', ['DeskSwapCard', 'SwapSheet']),
  '@/components/companion/DeskWallet': marker('wallet', ['WalletBalancePill']),
  '@/components/companion/ProgressSync': marker('progress-sync'),
  './ClientReadPresentation': marker('presentation'),
  './NucleoChart': marker('chart'),
  './NucleoProfile': marker('profile'),
  './LangMenu': marker('lang', ['default', 'LangSegment']),
  './LimitDialog': marker('limit'),
  './InvitePanel': marker('invite'),
};
const bundle = (await build({
  stdin: { resolveDir: root, loader: 'ts', contents: `
    export { default as NucleoDesk } from './src/components/nucleo/NucleoDesk';
    export { default as NucleoRisk } from './src/components/nucleo/NucleoRisk';
    export { progressStore, RISK_NOTICE_VERSION, quickAccessRow, quickAccessName } from './src/lib/companions/progress';
    export { parseDeskLink, consentCurrent, heldQuestion, DESK_QUESTION_MAX } from './src/lib/desk-entry';
    export { REGIONAL_STOCKS, regionalStock, marketRegion } from './src/lib/regional-stocks';
    export { APP_STORE_URL, APP_STORE_ID } from './src/lib/app-store';
    export { shareUrl } from './src/lib/trader-land/public';
    export { t, translatedEnglish } from './src/lib/companions/i18n';
  ` },
  absWorkingDir: root, bundle: true, write: false, format: 'iife', globalName: 'T', platform: 'browser', jsx: 'automatic',
  tsconfig: `${root}/tsconfig.json`, define: { 'import.meta.env.DEV': 'false' }, logLevel: 'silent',
  plugins: [{ name: 'activation-test-doubles', setup(b) {
    b.onResolve({ filter: /.*/ }, (args) => (Object.prototype.hasOwnProperty.call(STUBS, args.path) ? { path: args.path, namespace: 'double' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'double' }, (args) => ({ contents: STUBS[args.path], loader: 'js' }));
  } }],
})).outputFiles[0].text;

// ---------------------------------------------------------------------------------------------------------
// A browser that records instead of sending.
// ---------------------------------------------------------------------------------------------------------
const UUID = '00000000-0000-4000-8000-0000000000aa';
const CONSENT_KEY = 'bobby.companion.progress.v1';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function browser({ route = '/desk', language = 'en', locale = 'en-US', consent = false, session = null, stored = {} } = {}) {
  const storage = new Map(Object.entries({ bobby_lang: language, bobby_locale: locale, bobby_geo: locale.split('-')[1], ...stored }));
  if (consent) storage.set(CONSENT_KEY, JSON.stringify({ aiConsentGranted: true, riskNoticeVersion: 7, onboarded: true }));
  const requests = [], replaced = [];
  const location = { origin: 'https://bobbyprotocol.xyz', hostname: 'bobbyprotocol.xyz', pathname: '/desk', search: '', hash: '', href: '' };
  const go = (to) => { const u = new URL(to, location.origin); Object.assign(location, { pathname: u.pathname, search: u.search, hash: u.hash, href: u.href }); };
  go(route);
  const store = (map) => ({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) });
  const session_ = new Map();
  const fetch = async (url, init = {}) => {
    const href = String(url), headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    let body = null; try { body = init.body ? JSON.parse(init.body) : null; } catch { body = String(init.body); }
    requests.push({ url: href, path: href.split('?')[0], method: init.method ?? 'GET', headers, body, raw: href + ' ' + (init.body ?? '') });
    if (href === '/api/track') return new Response(null, { status: 204 });
    if (href === '/api/geo') return json({ country: null });
    if (href.startsWith('/api/bobby-asset-search?browse=1')) return json({ movers: [{ symbol: 'BTC', change24h: 1.2 }, { symbol: 'NVDA', change24h: -0.8 }], browse: {} });
    if (href.startsWith('/api/bobby-asset-search')) return json({ resolved: { baseSymbol: 'NVDA', symbol: 'NVDA', displayName: 'NVIDIA', assetClass: 'equity', aliases: ['NVDA'] } });
    if (href === '/api/bobby-access') return json({ access: { tier: session ? 'free' : 'anon', used: 0, limit: 3, remaining: 3, resetsAt: null, paywall: true }, signedIn: !!session, subscription: null, payments: { stripe: false, apple: true } });
    if (href === '/api/voice-tool') return json({ market: { price: 100, currency: 'USD' }, technicals: { price: 100, rsi14: 50, trend: 'bullish', support: 95, resistance: 105 }, technical_pulse: { signal: 'wait', direction: 'none' } });
    if (href === '/api/desk-debate') return json({ agents: { alpha: 'Alpha line.', red: 'Red line.', cio: 'CIO line.', verdict: 'wait', direction: 'none' }, level: 'rapido' });
    return json({ candles: [] });
  };
  const context = vm.createContext({
    console, URL, URLSearchParams, Response, Request, AbortController, AbortSignal, TextDecoder, DOMException, Intl, queueMicrotask,
    setTimeout, clearTimeout, setInterval, clearInterval, performance,
    location, fetch, localStorage: store(storage), sessionStorage: store(session_),
    history: { state: null, replaceState: (_state, _title, url) => { replaced.push(String(url)); go(url); }, pushState: (_state, _title, url) => go(url) },
    navigator: { language: locale, languages: [locale], userAgent: 'activation-test', platform: 'test', maxTouchPoints: 0 },
    document: { referrer: '', documentElement: { lang: locale }, body: { classList: { add() {}, remove() {} } }, activeElement: null, addEventListener() {}, removeEventListener() {} },
    crypto: { randomUUID: () => UUID },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    scrollTo() {}, addEventListener() {}, removeEventListener() {},
    __navigated: [], __session: session, __voice: { speak: async () => {}, stop() {}, speaking: false, level: 0 },
  });
  vm.runInContext('globalThis.window = globalThis;', context);
  vm.runInContext(bundle, context, { filename: 'activation-bundle.js' });
  const T = context.T, R = context.__R;
  /** Mount one component: its hooks, its effects, its tree. Children stay as elements. */
  function mount(Component, props = {}) {
    const c = { cells: [], i: 0, dirty: false, effects: [], tree: null, props };
    c.render = () => {
      let guard = 0;
      do {
        c.dirty = false; c.i = 0; R.current = c;
        try { c.tree = Component(c.props); } finally { R.current = null; }
        const effects = c.effects; c.effects = [];
        for (const effect of effects) effect();
      } while (c.dirty && ++guard < 60);
      assert.ok(guard < 60, 'the component settles');
      return c.tree;
    };
    c.render();
    return c;
  }
  /** Let promises and timers of the recorded network run, then render until nothing changes. */
  async function settle(view, turns = 6) {
    for (let n = 0; n < turns; n++) { await new Promise((resolve) => setTimeout(resolve, 0)); for (let i = 0; i < 40; i++) await Promise.resolve(); view.render(); }
    return view.tree;
  }
  return { context, T, mount, settle, requests, replaced, storage, session: session_, location, go };
}
const walk = (node) => (!node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(walk) : [node, ...walk(node.props?.children)]);
const find = (tree, test) => walk(tree).find(test);
const stubbed = (tree, name) => walk(tree).filter((e) => typeof e.type === 'function' && String(e.type.stub ?? '').startsWith(name));
const deskInput = (tree) => find(tree, (e) => e.type === 'input' && e.props['data-desk-input'] !== undefined);
const deskForm = (tree) => find(tree, (e) => e.type === 'form');
const chips = (tree) => walk(tree).filter((e) => e.type === 'button' && String(e.props.className ?? '').includes('n-chip'));
const noticeOf = (b, tree) => find(tree, (e) => e.type === b.T.NucleoRisk);
const shows = (tree, text) => walk(tree).some((e) => e.props?.children === text);
/** Type into the pill and send it, the way the form does. */
function typeAndSend(view, text) {
  deskInput(view.tree).props.onChange({ target: { value: text } });
  view.render();
  deskForm(view.tree).props.onSubmit({ preventDefault() {} });
  return view.render();
}
/** The notice, driven as a person would: four statements, then the agree control. */
function agree(b, element) {
  const notice = b.mount(b.T.NucleoRisk, element.props);
  const statements = () => walk(notice.tree).filter((e) => e.type === 'button' && typeof e.props['aria-pressed'] === 'boolean');
  assert.equal(statements().length, 4, 'the same four statements');
  const cta = () => find(notice.tree, (e) => e.type === 'button' && String(e.props.className ?? '').includes('n-cta'));
  assert.equal(cta().props.disabled, true, 'the agree control waits for all four');
  for (let i = 0; i < 4; i++) { statements()[i].props.onClick(); notice.render(); }
  assert.equal(cta().props.disabled, false);
  cta().props.onClick();
  return notice;
}
const PERSONAL = ['x-bobby-device', 'authorization', 'x-bobby-session'];
const personal = (r) => PERSONAL.some((h) => r.headers[h] !== undefined) || r.raw.includes(UUID) || r.raw.includes('TEST_ACCOUNT_TOKEN');
const QUESTION = 'Is NVDA stretched after earnings?';

// ---------------------------------------------------------------------------------------------------------
// 1. The link parser
// ---------------------------------------------------------------------------------------------------------
{
  const { T } = browser();
  const link = (search) => { const { ask, q, present, search: rest } = T.parseDeskLink(search); return { ask, q, present, rest }; };
  check('deep link: a symbol asks, in capitals, and leaves the address', () => {
    assert.deepEqual(link('?ask=NVDA'), { ask: 'NVDA', q: null, present: true, rest: '' });
    assert.deepEqual(link('?ask=mc.pa&lang=fr&locale=fr-FR'), { ask: 'MC.PA', q: null, present: true, rest: '?lang=fr&locale=fr-FR' });
    assert.equal(link('?ask=%20btc%20').ask, 'BTC');
    for (const symbol of ['PETR4.SA', 'BRK-B', '^GSPC', 'EURUSD=X', 'A'.repeat(20)]) assert.equal(link('?ask=' + encodeURIComponent(symbol)).ask, symbol);
  });
  check('deep link: only a symbol fits through ?ask', () => {
    for (const hostile of ['<script>alert(1)</script>', 'NVDA OR 1=1', 'NVDA;DROP', 'javascript:alert(1)', 'NVDA/../x', 'NVDA%00', 'Ignore previous instructions', 'A'.repeat(21), '', ' ', 'ñ', 'NV DA', 'NVDA\nBTC'])
      assert.deepEqual(link('?ask=' + encodeURIComponent(hostile)), { ask: null, q: null, present: true, rest: '' }, hostile);
    // a second value cannot ride behind a valid one, and a malformed escape does not throw
    assert.equal(link('?ask=NVDA&ask=%3Cscript%3E').ask, 'NVDA');
    assert.equal(link('?ask=%E0%A4%A').ask, null);
  });
  check('deep link: ?q is text for the pill, trimmed, without control characters, cut at the desk limit', () => {
    assert.deepEqual(link('?q=' + encodeURIComponent('  is NVDA   stretched?  ')), { ask: null, q: 'is NVDA stretched?', present: true, rest: '' });
    assert.equal(link('?q=is+NVDA+stretched%3F&utm_source=home_ask').q, 'is NVDA stretched?');
    assert.equal(link('?q=is+NVDA+stretched%3F&utm_source=home_ask').rest, '?utm_source=home_ask');
    assert.equal(link('?q=' + encodeURIComponent('line one\r\nline\ttwo\u0000' + String.fromCharCode(0x2028) + 'three')).q, 'line one line two three');
    assert.equal(link('?q=' + encodeURIComponent('<img src=x onerror=alert(1)>')).q, '<img src=x onerror=alert(1)>', 'text stays text: the pill is an input value');
    assert.equal(T.DESK_QUESTION_MAX, 1200);
    assert.equal(Array.from(link('?q=' + 'é'.repeat(5000)).q).length, 1200);
    assert.equal(Array.from(link('?q=' + encodeURIComponent('😀'.repeat(1300))).q).length, 1200, 'counted in characters, never cutting one in half');
    assert.deepEqual(link('?q=%20%20'), { ask: null, q: null, present: true, rest: '' });
  });
  check('deep link: with both, the text waits in the pill and nothing starts', () => {
    assert.deepEqual(link('?ask=NVDA&q=hello'), { ask: null, q: 'hello', present: true, rest: '' });
    assert.deepEqual(link('?q=&ask=NVDA'), { ask: 'NVDA', q: null, present: true, rest: '' });
  });
  check('deep link: an invitation code and everything else keep their place', () => {
    assert.deepEqual(link('?ref=ABCDEFGH&ask=NVDA&v=2&lang=es'), { ask: 'NVDA', q: null, present: true, rest: '?ref=ABCDEFGH&v=2&lang=es' });
    assert.deepEqual(link('?ref=ABCDEFGH&lang=es'), { ask: null, q: null, present: false, rest: '?ref=ABCDEFGH&lang=es' });
    assert.deepEqual(link(''), { ask: null, q: null, present: false, rest: '' });
  });
  check('consent is this browser agreeing to the current notice, nothing else', () => {
    assert.equal(T.consentCurrent({ aiConsentGranted: true, riskNoticeVersion: T.RISK_NOTICE_VERSION }, T.RISK_NOTICE_VERSION), true);
    assert.equal(T.consentCurrent({ aiConsentGranted: true, riskNoticeVersion: T.RISK_NOTICE_VERSION - 1 }, T.RISK_NOTICE_VERSION), false, 'an older notice is not this one');
    assert.equal(T.consentCurrent({ aiConsentGranted: false, riskNoticeVersion: 99 }, T.RISK_NOTICE_VERSION), false, 'an account cannot agree for the browser');
    assert.equal(T.heldQuestion({ kind: 'ask', q: 'NVDA', spoken: 'How does NVDA look?' }), 'How does NVDA look?');
    assert.equal(T.heldQuestion({ kind: 'mic' }), null);
  });
}

// ---------------------------------------------------------------------------------------------------------
// 2. The desk before consent
// ---------------------------------------------------------------------------------------------------------
await asyncCheck('a new visitor sees the desk at once, and nothing personal leaves the browser', async () => {
  for (const session of [null, { access_token: 'TEST_ACCOUNT_TOKEN', user: { id: 'u', email: 'a@b.c', app_metadata: { provider: 'apple' }, user_metadata: { given_name: 'Ana' } } }]) {
    const b = browser({ session });
    assert.equal(b.T.consentCurrent(b.T.progressStore.get(), b.T.RISK_NOTICE_VERSION), false);
    const desk = b.mount(b.T.NucleoDesk);
    await b.settle(desk);
    assert.ok(deskInput(desk.tree) && deskForm(desk.tree), 'the ask pill is on screen');
    assert.equal(noticeOf(b, desk.tree), undefined, 'no notice before a question');
    assert.equal(chips(desk.tree).length, 4, 'three starter chips and Explore markets');
    assert.ok(stubbed(desk.tree, 'sphere').length >= 1, 'the glass is there');
    assert.equal(stubbed(desk.tree, 'progress-sync').length, 0, 'progress sync (account credential) waits for consent');
    assert.equal(stubbed(desk.tree, 'wallet').length, 0, 'the wallet pill waits for consent');
    // Everything sent on arrival: the desk_entered event that already existed, and the public market list.
    const paths = [...new Set(b.requests.map((r) => r.path))].sort();
    assert.deepEqual(paths, ['/api/bobby-asset-search', '/api/track'], 'requests on arrival: ' + paths.join(', '));
    const tracked = b.requests.filter((r) => r.path === '/api/track');
    assert.deepEqual(tracked.map((r) => [r.body.event, r.body.surface]), [['desk_entered', 'desk']], 'desk_entered once, when the desk is shown, before consent');
    assert.deepEqual(Object.keys(tracked[0].body).filter((k) => tracked[0].body[k] !== undefined).sort(), ['at', 'device', 'event', 'platform', 'surface'], 'the event is what a page visit already sends');
    const market = b.requests.filter((r) => r.path === '/api/bobby-asset-search');
    assert.ok(market.length >= 1);
    for (const r of market) {
      assert.equal(r.method, 'GET'); assert.deepEqual(r.headers, {}, 'the market list carries no header');
      assert.deepEqual([...new URL(r.url, 'https://x').searchParams.keys()].sort(), ['browse', 'country', 'language', 'locale'], 'only the interface language and market');
    }
    assert.deepEqual(b.requests.filter((r) => r.path !== '/api/track' && personal(r)), [], 'no install id and no account token outside the visit event');
    if (session) assert.equal(tracked[0].headers.authorization, 'Bearer TEST_ACCOUNT_TOKEN', 'the harness does see an account token when one is sent');
  }
});

await asyncCheck('asking before consent shows the notice in place of the answer; nothing is sent; leaving keeps the question', async () => {
  const b = browser();
  const desk = b.mount(b.T.NucleoDesk);
  await b.settle(desk);
  const before = b.requests.length;
  typeAndSend(desk, QUESTION);
  await b.settle(desk);
  const notice = noticeOf(b, desk.tree);
  assert.ok(notice, 'the notice stands where the answer would');
  assert.equal(deskForm(desk.tree), undefined, 'the desk steps aside');
  assert.equal(notice.props.question, QUESTION, 'the question is shown above it');
  assert.equal(b.requests.length, before, 'no request while the notice is up');
  assert.ok(!b.requests.some((r) => r.raw.includes('stretched')), 'the question never left the browser');
  // The notice says what it is about and can be left.
  const view = b.mount(b.T.NucleoRisk, notice.props);
  const title = find(view.tree, (e) => e.type === 'h1');
  assert.equal(title.props.children, 'Before I answer, one thing.');
  assert.equal(find(view.tree, (e) => e.props?.['data-risk-question'] !== undefined).props.children, QUESTION);
  find(view.tree, (e) => e.props?.['data-risk-close'] !== undefined).props.onClick();
  await b.settle(desk);
  assert.equal(noticeOf(b, desk.tree), undefined, 'back to the idle desk');
  assert.equal(deskInput(desk.tree).props.value, QUESTION, 'the question is kept in the pill');
  assert.equal(b.requests.length, before, 'leaving sends nothing');
  assert.equal(b.T.consentCurrent(b.T.progressStore.get(), b.T.RISK_NOTICE_VERSION), false);
});

await asyncCheck('agreeing sends that question exactly once, and only then does the desk ask about this person', async () => {
  const b = browser();
  const desk = b.mount(b.T.NucleoDesk);
  await b.settle(desk);
  typeAndSend(desk, QUESTION);
  agree(b, noticeOf(b, desk.tree));
  assert.equal(b.T.progressStore.get().aiConsentGranted, true);
  assert.equal(b.T.progressStore.get().riskNoticeVersion, b.T.RISK_NOTICE_VERSION, 'the same notice version as before');
  await b.settle(desk, 12);
  const searches = b.requests.filter((r) => r.path === '/api/bobby-asset-search' && r.method === 'POST');
  assert.deepEqual(searches.map((r) => r.body.q), [QUESTION], 'the question is resolved once');
  const debates = b.requests.filter((r) => r.path === '/api/desk-debate');
  assert.deepEqual(debates.map((r) => [r.body.symbol, r.body.question]), [['NVDA', QUESTION]], 'and argued once, in the words that were typed');
  assert.equal(b.requests.filter((r) => r.path === '/api/voice-tool').length, 1, 'one metered read');
  assert.equal(noticeOf(b, desk.tree), undefined, 'the notice is gone for good');
  assert.ok(b.requests.some((r) => r.path === '/api/bobby-access' && r.headers['x-bobby-device'] === UUID), 'the meter is asked after consent, with the install id');
  assert.equal(stubbed(desk.tree, 'progress-sync').length, 1, 'progress sync starts after consent');
  // Rendering again, or the notice's control firing twice, sends nothing more.
  await b.settle(desk, 4);
  assert.equal(b.requests.filter((r) => r.path === '/api/desk-debate').length, 1);
  assert.equal(b.requests.filter((r) => r.path === '/api/track' && r.body.event === 'desk_entered').length, 1, 'still one desk_entered');
});

await asyncCheck('a starter chip, the microphone, the profile and Explore all wait behind the same notice', async () => {
  const b = browser({ language: 'es', locale: 'es-MX' });
  const desk = b.mount(b.T.NucleoDesk);
  await b.settle(desk);
  const before = b.requests.length;
  const starter = chips(desk.tree)[0];
  assert.equal(starter.props.children, 'BTC');
  starter.props.onClick(); desk.render();
  let notice = noticeOf(b, desk.tree);
  assert.equal(notice.props.question, '¿Cómo se ve BTC?', 'the chip asks its own question, in the visitor language');
  notice.props.onClose(); desk.render();
  assert.equal(deskInput(desk.tree).props.value, '¿Cómo se ve BTC?');
  for (const [name, control] of [
    ['microphone', () => find(desk.tree, (e) => e.type === 'button' && String(e.props.className ?? '').startsWith('n-mic'))],
    ['profile', () => find(desk.tree, (e) => e.type === 'button' && e.props.className === 'n-face-btn')],
    ['explore', () => chips(desk.tree).at(-1)],
  ]) {
    control().props.onClick(); desk.render();
    notice = noticeOf(b, desk.tree);
    assert.ok(notice, name + ' opens the notice');
    assert.equal(notice.props.question, null, name + ' has no question to show');
    const view = b.mount(b.T.NucleoRisk, notice.props);
    assert.equal(find(view.tree, (e) => e.type === 'h1').props.children, 'Una cosa antes de empezar.');
    notice.props.onClose(); desk.render();
    assert.equal(stubbed(desk.tree, 'profile').length, 0, 'nothing opened behind it');
  }
  assert.equal(b.requests.length, before, 'none of it reached the network');
  // Agreeing from the chip sends the chip's question once.
  chips(desk.tree)[0].props.onClick(); desk.render();
  agree(b, noticeOf(b, desk.tree));
  await b.settle(desk, 12);
  assert.deepEqual(b.requests.filter((r) => r.path === '/api/bobby-asset-search' && r.method === 'POST').map((r) => r.body.q), ['BTC']);
  // As a chip always did: the symbol is what the desk resolves and argues; the sentence is what the person sees asked.
  assert.deepEqual(b.requests.filter((r) => r.path === '/api/desk-debate').map((r) => [r.body.symbol, r.body.question]), [['NVDA', 'BTC']]);
  assert.ok(shows(desk.tree, '¿Cómo se ve BTC?'), 'the question on screen is the chip question');
});

await asyncCheck('people who already agreed see the desk they knew', async () => {
  const b = browser({ consent: true });
  const desk = b.mount(b.T.NucleoDesk);
  await b.settle(desk);
  assert.equal(noticeOf(b, desk.tree), undefined);
  assert.equal(stubbed(desk.tree, 'progress-sync').length, 1);
  assert.ok(b.requests.some((r) => r.path === '/api/bobby-access'), 'the meter loads on arrival');
  assert.equal(b.requests.filter((r) => r.path === '/api/track').length, 1);
  typeAndSend(desk, QUESTION);
  assert.equal(noticeOf(b, desk.tree), undefined, 'no notice');
  await b.settle(desk, 12);
  assert.deepEqual(b.requests.filter((r) => r.path === '/api/desk-debate').map((r) => r.body.question), [QUESTION]);
});

await asyncCheck('an older notice version or a withdrawal is asked again at the next question, never silently', async () => {
  const old = browser({ stored: { [CONSENT_KEY]: JSON.stringify({ aiConsentGranted: true, riskNoticeVersion: 6, onboarded: true }) } });
  const desk = old.mount(old.T.NucleoDesk);
  await old.settle(desk);
  assert.ok(deskInput(desk.tree), 'the desk is shown');
  assert.deepEqual([...new Set(old.requests.map((r) => r.path))].sort(), ['/api/bobby-asset-search', '/api/track']);
  typeAndSend(desk, QUESTION);
  assert.ok(noticeOf(old, desk.tree), 'version 6 is not version 7');

  const b = browser({ consent: true });
  const live = b.mount(b.T.NucleoDesk);
  await b.settle(live);
  find(live.tree, (e) => e.type === 'button' && e.props.className === 'n-face-btn').props.onClick(); live.render();
  assert.equal(stubbed(live.tree, 'profile').length, 1, 'the profile opens for someone who agreed');
  b.T.progressStore.withdrawAIConsent();
  await b.settle(live);
  assert.equal(stubbed(live.tree, 'profile').length, 0, 'withdrawing closes the sheets');
  assert.equal(stubbed(live.tree, 'progress-sync').length, 0, 'and stops the account sync');
  const after = b.requests.length;
  typeAndSend(live, QUESTION);
  await b.settle(live);
  assert.ok(noticeOf(b, live.tree), 'the next question meets the notice again');
  assert.equal(b.requests.length, after, 'and nothing is sent');

  // The same withdrawal, the way a person does it: profile, the read-only notice, "Withdraw AI consent".
  const w = browser({ consent: true });
  const view = w.mount(w.T.NucleoDesk);
  await w.settle(view);
  find(view.tree, (e) => e.type === 'button' && e.props.className === 'n-face-btn').props.onClick(); view.render();
  stubbed(view.tree, 'profile')[0].props.onRisk(); view.render();
  const readOnly = find(view.tree, (e) => e.type === w.T.NucleoRisk && e.props.readOnly === true);
  assert.ok(readOnly, 'the read-only notice opens from the profile, as before');
  const sheet = w.mount(w.T.NucleoRisk, readOnly.props);
  assert.equal(find(sheet.tree, (e) => e.type === 'h1').props.children, 'One thing before we start.');
  assert.equal(walk(sheet.tree).filter((e) => e.type === 'button' && e.props['aria-pressed'] === true && e.props.disabled === true).length, 4, 'four statements, read only');
  find(sheet.tree, (e) => e.type === 'button' && e.props.children === 'Withdraw AI consent').props.onClick();
  await w.settle(view);
  assert.equal(w.T.consentCurrent(w.T.progressStore.get(), w.T.RISK_NOTICE_VERSION), false);
  assert.ok(deskInput(view.tree), 'the idle desk is what remains');
  assert.equal(walk(view.tree).filter((e) => e.type === w.T.NucleoRisk).length + stubbed(view.tree, 'profile').length + stubbed(view.tree, 'progress-sync').length, 0);
  typeAndSend(view, QUESTION);
  agree(w, noticeOf(w, view.tree));
  await w.settle(view, 12);
  assert.equal(stubbed(view.tree, 'profile').length, 0, 'agreeing again answers the question; no sheet reopens by itself');
  assert.deepEqual(w.requests.filter((r) => r.path === '/api/desk-debate').map((r) => r.body.question), [QUESTION]);
});

// ---------------------------------------------------------------------------------------------------------
// 3. Links into the desk
// ---------------------------------------------------------------------------------------------------------
await asyncCheck('/desk?ask=SYMBOL for a new visitor: the notice first, the question after agreeing, once', async () => {
  const b = browser({ route: '/desk?ask=nvda&utm_source=home_example&lang=en&locale=en-US' });
  const desk = b.mount(b.T.NucleoDesk);
  const notice = noticeOf(b, desk.tree);
  assert.ok(notice, 'the first thing on screen is the notice');
  assert.equal(notice.props.question, 'How does NVDA look?', 'the starter chip question');
  assert.equal(b.location.search, '?utm_source=home_example&lang=en&locale=en-US', 'ask left the address bar; the rest stayed');
  await b.settle(desk);
  assert.deepEqual(b.requests.filter((r) => r.path === '/api/track'), [], 'desk_entered waits until the desk itself is seen');
  assert.ok(!b.requests.some((r) => r.method === 'POST'), 'nothing was asked');
  agree(b, notice);
  await b.settle(desk, 12);
  assert.deepEqual(b.requests.filter((r) => r.path === '/api/bobby-asset-search' && r.method === 'POST').map((r) => r.body.q), ['NVDA']);
  assert.deepEqual(b.requests.filter((r) => r.path === '/api/desk-debate').map((r) => r.body.question), ['NVDA'], 'what the starter chip sends');
  assert.ok(shows(desk.tree, 'How does NVDA look?'), 'what the starter chip shows');
  const entered = b.requests.filter((r) => r.path === '/api/track');
  assert.deepEqual(entered.map((r) => [r.body.event, r.body.utm]), [['desk_entered', 'home_example']], 'the visit keeps the label of the home example');
  // A reload of the cleaned address asks nothing.
  const again = browser({ route: b.location.pathname + b.location.search, consent: true });
  const reloaded = again.mount(again.T.NucleoDesk);
  await again.settle(reloaded, 8);
  assert.equal(again.requests.filter((r) => r.path === '/api/desk-debate').length, 0, 'the link does not survive a reload');
});

await asyncCheck('/desk?ask=SYMBOL after leaving the notice: the idle desk with the question in the pill', async () => {
  const b = browser({ route: '/desk?ask=BTC' });
  const desk = b.mount(b.T.NucleoDesk);
  noticeOf(b, desk.tree).props.onClose();
  await b.settle(desk);
  assert.equal(deskInput(desk.tree).props.value, 'How does BTC look?');
  assert.deepEqual(b.requests.filter((r) => r.path === '/api/track').map((r) => r.body.event), ['desk_entered'], 'now the desk was seen');
  assert.ok(!b.requests.some((r) => r.method === 'POST' && r.path !== '/api/track'));
});

await asyncCheck('/desk?ask=SYMBOL for someone who agreed starts the starter question once', async () => {
  const b = browser({ route: '/desk?ask=MC.PA&lang=fr&locale=fr-FR', language: 'fr', locale: 'fr-FR', consent: true });
  const desk = b.mount(b.T.NucleoDesk);
  await b.settle(desk, 12);
  assert.equal(noticeOf(b, desk.tree), undefined);
  assert.deepEqual(b.requests.filter((r) => r.path === '/api/bobby-asset-search' && r.method === 'POST').map((r) => r.body.q), ['MC.PA']);
  assert.deepEqual(b.requests.filter((r) => r.path === '/api/desk-debate').map((r) => r.body.question), ['MC.PA'], 'what the starter chip sends');
  const asked = b.T.t('How does MC.PA look?', '¿Cómo se ve MC.PA?');
  assert.notEqual(asked, 'How does MC.PA look?', 'the question is in the visitor language');
  assert.ok(shows(desk.tree, asked), 'exactly the starter chip question on screen');
  assert.equal(b.location.search, '?lang=fr&locale=fr-FR');
});

await asyncCheck('/desk?q=text only fills the pill: a link cannot spend a read', async () => {
  for (const consent of [true, false]) {
    const b = browser({ route: '/desk?q=' + encodeURIComponent('  ' + QUESTION + '\n') + '&utm_source=home_ask', consent });
    const desk = b.mount(b.T.NucleoDesk);
    await b.settle(desk, 8);
    assert.equal(noticeOf(b, desk.tree), undefined, 'no notice: nothing was asked');
    assert.equal(deskInput(desk.tree).props.value, QUESTION);
    assert.equal(b.location.search, '?utm_source=home_ask', 'q left the address bar');
    assert.ok(!b.requests.some((r) => r.raw.includes('stretched')), 'the text was not sent');
    assert.equal(b.requests.filter((r) => ['/api/desk-debate', '/api/voice-tool'].includes(r.path)).length, 0);
  }
  // hostile text is still only text in the pill, and a symbol next to it does not start anything
  const b = browser({ route: '/desk?ask=NVDA&q=' + encodeURIComponent('<script>alert(1)</script>'), consent: true });
  const desk = b.mount(b.T.NucleoDesk);
  await b.settle(desk, 8);
  assert.equal(deskInput(desk.tree).props.value, '<script>alert(1)</script>');
  assert.equal(b.requests.filter((r) => r.path === '/api/desk-debate').length, 0);
  assert.equal(b.location.search, '');
});

await asyncCheck('an invalid ?ask does nothing, and ?ref keeps working alongside', async () => {
  const bad = browser({ route: '/desk?ask=' + encodeURIComponent('NVDA OR 1=1') });
  const view = bad.mount(bad.T.NucleoDesk);
  await bad.settle(view);
  assert.equal(noticeOf(bad, view.tree), undefined);
  assert.equal(deskInput(view.tree).props.value, '');
  assert.equal(bad.location.search, '');

  const b = browser({ route: '/desk?ref=abcdefgh&v=2&ask=NVDA&lang=en' });
  const desk = b.mount(b.T.NucleoDesk);
  await b.settle(desk);
  assert.equal(b.storage.get('bobby:ref:v1'), 'ABCDEFGH', 'the invitation code is kept in this browser as before');
  assert.equal(b.location.search, '?lang=en', 'ref, v and ask are gone; the language stays');
  assert.equal(noticeOf(b, desk.tree).props.question, 'How does NVDA look?');
  assert.ok(!b.requests.some((r) => r.raw.includes('ABCDEFGH')), 'the code is not claimed before consent');
});

// ---------------------------------------------------------------------------------------------------------
// 4. The home page: examples, copy, app id
// ---------------------------------------------------------------------------------------------------------
const home = read('public/home/index.html');
const LOCALES = [['en', 'en-US'], ['es', 'es-MX'], ['fr', 'fr-FR'], ['pt', 'pt-PT'], ['pt', 'pt-BR'], ['it', 'it-IT'], ['de', 'de-DE']];
const EXAMPLES = (() => {
  const a = home.indexOf('/* examples:start */'), z = home.indexOf('/* examples:end */');
  assert.ok(a > 0 && z > a, 'the home example table is marked');
  return vm.runInNewContext(home.slice(a, z) + '; EXAMPLES');
})();
const heroScript = (() => { const at = home.indexOf('/* examples:start */'), a = home.lastIndexOf('<script>', at), z = home.indexOf('</script>', at); return home.slice(a + '<script>'.length, z); })();
const anchors = [...home.matchAll(/<a\b[^>]*class="eg-chip[^"]*"[^>]*>/g)].map(([tag]) => ({ tag, href: /href="([^"]*)"/.exec(tag)[1].replaceAll('&amp;', '&'), id: /id="([^"]*)"/.exec(tag)?.[1] ?? null }));
/** Run the home's own script against the elements it uses. */
function heroIn(language, locale) {
  const el = (attributes = {}) => ({ attributes, textContent: '', value: '', listeners: {}, setAttribute(k, v) { this.attributes[k] = String(v); }, getAttribute(k) { return this.attributes[k] ?? null; }, addEventListener(name, fn) { this.listeners[name] = fn; } });
  const els = { ask: el(), 'ask-q': el(), 'eg-local': el() }, assigned = [], listeners = [];
  const state = { language, locale };
  const context = vm.createContext({ URL, URLSearchParams, document: { getElementById: (id) => els[id] },
    location: { origin: 'https://bobbyprotocol.xyz', assign: (url) => assigned.push(url) },
    window: { BobbyI18n: { t: (k) => `${state.language}:${k}`, lang: () => state.language, locale: () => state.locale, onChange: (fn) => listeners.push(fn) } } });
  vm.runInContext(heroScript, context, { filename: 'public/home/index.html#hero' });
  return { els, assigned, switchTo(l, loc) { state.language = l; state.locale = loc; listeners.forEach((fn) => fn(l)); } };
}
check('home: the first screen has the ask pill, three examples, the iPhone link and "Try Bobby"', () => {
  const hero = home.slice(home.indexOf('id="s0"'), home.indexOf('id="s1"'));
  assert.ok(home.indexOf('data-i18n="hero.h1"') < home.indexOf('id="start"') && home.indexOf('id="start"') < home.indexOf('id="s1"'), 'in the hero scene, after the headline in reading order');
  assert.match(hero, /<form class="ask ask-type" id="ask" action="\/desk" method="get"/);
  assert.match(hero, /<input id="ask-q" name="q" type="text"[^>]*placeholder="Ask about a stock or a crypto asset"/);
  assert.match(hero, /<a class="ask ask-tap" id="ask-tap" href="\/desk\?utm_source=home_ask">/);
  assert.deepEqual(anchors.map((a) => a.href), ['/desk?ask=NVDA&utm_source=home_example', '/desk?ask=BTC&utm_source=home_example', '/desk?ask=ETH&utm_source=home_example', 'https://apps.apple.com/app/bobby-the-market-argues-back/id6804460489']);
  assert.match(home, /<a class="tb-app" href="\/desk" data-i18n="t\.try">Try Bobby<\/a>/);
  assert.match(hero, /Asking an AI about your asset is <em>no longer an edge\.<\/em>/, 'the headline is the approved one');
  // The App Store link in the hero is tracked by the page's own listener (a[href*="apps.apple.com"] → appstore_click).
  assert.match(home, /closest\('a\[href\*="apps\.apple\.com"\]'\)[\s\S]{0,80}send\('appstore_click'\)/);
});
for (const [language, locale] of LOCALES) {
  const b = browser({ language, locale });
  const row = [...b.T.quickAccessRow({ quickAccess: [], quickAccessCustomized: false })];
  const [symbol, name] = EXAMPLES.local[locale] ?? EXAMPLES.fallback;
  check(`home ${locale}: the three examples are the desk's own starters, and the local one is a listed company`, () => {
    assert.deepEqual(['NVDA', 'BTC', symbol].sort(), [...row].sort(), 'same three symbols as the desk row ' + row.join(' '));
    const region = b.T.marketRegion(language, locale);
    if (region) {
      const listing = b.T.regionalStock(symbol);
      assert.ok(listing, symbol + ' exists in src/lib/regional-stocks.ts');
      assert.equal(listing.region, region, 'in the visitor home market');
      assert.equal(name, b.T.quickAccessName(symbol), 'shown with the name the desk chip uses');
    } else {
      assert.equal(EXAMPLES.local[locale], undefined);
      assert.deepEqual([symbol, name], ['ETH', 'Ethereum']);
    }
    for (const s of ['NVDA', 'BTC', symbol]) assert.equal(b.T.parseDeskLink('?ask=' + encodeURIComponent(s)).ask, s, s + ' passes the desk link rule');
    // the page's own script points the third chip there, in the page language
    const hero = heroIn(language, locale);
    assert.equal(hero.els['eg-local'].textContent, name);
    const href = new URL(hero.els['eg-local'].attributes.href, 'https://bobbyprotocol.xyz');
    assert.equal(href.pathname, '/desk');
    assert.deepEqual(Object.fromEntries(href.searchParams), { ask: symbol, utm_source: 'home_example', lang: language, locale });
    assert.equal(hero.els['ask-q'].attributes.placeholder, language + ':hero.ask');
  });
}
check('home: every local example is a listing the desk knows, one per market', () => {
  const b = browser();
  assert.deepEqual(Object.keys(EXAMPLES.local).sort(), ['de-DE', 'fr-FR', 'it-IT', 'pt-BR', 'pt-PT']);
  for (const [locale, [symbol]] of Object.entries(EXAMPLES.local)) assert.ok(b.T.REGIONAL_STOCKS.some((s) => s.symbol === symbol && s.region === locale.split('-')[1]), symbol);
});
check('home: a typed question goes to /desk?q=…, encoded, and an empty one just opens the desk', () => {
  const hero = heroIn('es', 'es-MX');
  hero.els['ask-q'].value = '  ¿cómo  ves a NVDA & AMD?  ';
  let prevented = false;
  hero.els.ask.listeners.submit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(hero.assigned[0], '/desk?q=%C2%BFc%C3%B3mo+ves+a+NVDA+%26+AMD%3F&utm_source=home_ask&lang=es&locale=es-MX');
  const b = browser();
  assert.equal(b.T.parseDeskLink(new URL(hero.assigned[0], 'https://x').search).q, '¿cómo ves a NVDA & AMD?', 'and the desk reads back the same words');
  hero.els['ask-q'].value = '   ';
  hero.els.ask.listeners.submit({ preventDefault() {} });
  assert.equal(hero.assigned[1], '/desk?utm_source=home_ask&lang=es&locale=es-MX');
  hero.switchTo('de', 'de-DE');
  assert.equal(hero.els['eg-local'].textContent, 'SAP', 'a language switch moves the local example');
});
check('home: the new copy exists in the six languages (and the Portugal variant)', () => {
  const block = (name, quoted) => { const a = home.indexOf(quoted ? `"${name}": {` : `    ${name}: {`); assert.ok(a > 0, name); return home.slice(a, home.indexOf('\n  }', a)); };
  const en = { 'hero.ask': 'Ask about a stock or a crypto asset', 'hero.send': 'Ask', 'hero.eg': 'Examples' };
  for (const [name, quoted] of [['es', false], ['pt', false], ['fr', true], ['it', true], ['de', true], ['ptPT', true]]) {
    const text = block(name, quoted);
    for (const key of Object.keys(en)) {
      const value = new RegExp(`['"]${key.replace('.', '\\.')}['"]: ['"]([^'"\\n]+)['"]`).exec(text)?.[1];
      assert.ok(value && value.length > 2, `${name} ${key}`);
      assert.notEqual(value, en[key], `${name} ${key} is translated`);
      assert.doesNotMatch(value, /!|\b(buy|sell|comprar|vender|acheter|vendre|kaufen|verkaufen|compra|vendi)\b/i);
    }
    assert.match(text, /['"]t\.try['"]:/, name + ' has the "Try Bobby" label the top bar now uses');
  }
  for (const key of Object.keys(en)) assert.ok(home.includes(`data-i18n-aria="${key}"`) || home.includes(`data-i18n="${key}"`), key + ' is wired to an element');
});
check('desk: the notice introduction exists in the six languages', () => {
  const expected = { en: 'Before I answer, one thing.', es: 'Antes de responder, una cosa.', fr: 'Avant de répondre, une précision.', pt: 'Antes de responder, uma coisa.', it: 'Prima di rispondere, una cosa.', de: 'Vor meiner Antwort noch eines.' };
  for (const [language, locale] of LOCALES) {
    const b = browser({ language, locale });
    assert.equal(b.T.t('Before I answer, one thing.', 'Antes de responder, una cosa.'), expected[language]);
  }
  // the same sentence the iPhone says
  const ios = read('ios/Bobby/Nucleo/src/onboarding/40-strings.js');
  for (const sentence of Object.values(expected)) assert.ok(ios.includes(sentence), sentence);
});

// The App Store id: one number, in app-store.ts. Static HTML cannot import it, so every HTML file is checked.
check('the App Store id in every HTML file is the one in src/lib/app-store.ts', () => {
  const b = browser();
  const id = /\/id(\d+)$/.exec(b.T.APP_STORE_URL)[1];
  assert.equal(b.T.APP_STORE_ID, id);
  assert.match(id, /^\d{9,12}$/);
  const skip = new Set(['node_modules', 'dist', '.git', '.claude', 'ios', 'android', 'supabase', 'contracts', 'lib', 'out', 'cache']);
  const files = [];
  (function scan(dir) {
    for (const name of readdirSync(path.join(root, dir))) {
      if (skip.has(name) || name.startsWith('.')) continue;
      const rel = dir ? `${dir}/${name}` : name;
      let stat; try { stat = statSync(path.join(root, rel)); } catch { continue; }
      if (stat.isDirectory()) scan(rel); else if (name.endsWith('.html')) files.push(rel);
    }
  })('');
  const found = {};
  for (const file of files) {
    const text = read(file);
    const ids = [...text.matchAll(/app-id=(\d+)/g), ...text.matchAll(/apps\.apple\.com\/[^"'\s<>]*?\/id(\d+)/g)].map((m) => m[1]);
    if (ids.length) found[file] = ids;
    for (const other of ids) assert.equal(other, id, `${file} names App Store id ${other}, app-store.ts says ${id}`);
  }
  assert.ok(found['public/home/index.html']?.length >= 3, 'the home has the banner and its App Store links');
  assert.ok(found['index.html']?.length >= 1, 'the app shell has the banner');
  // The banner itself: on the home in the markup, on /desk from the shell (and nowhere else in the shell), on /app from the page.
  assert.match(home, new RegExp(`<meta name="apple-itunes-app" content="app-id=${id}">`));
  const shell = read('index.html');
  const script = /<script>(\(function \(\) \{ if \(!(\/.*?\/)\.test\(location\.pathname\)\) return;[^<]*apple-itunes-app[^<]*)<\/script>/.exec(shell);
  assert.ok(script, 'the shell adds the banner from an inline script in the head');
  assert.ok(shell.indexOf(script[0]) < shell.indexOf('</head>'));
  assert.ok(!/<meta[^>]*apple-itunes-app/.test(shell), 'never as a static tag: the shell also serves /i/CODE');
  const gate = vm.runInNewContext(script[2]);
  for (const [route, on] of [['/desk', true], ['/desk/', true], ['/i/ABCDEFGH', false], ['/', false], ['/app', false], ['/desktop', false], ['/auth/callback', false], ['/admin', false], ['/protocol', false], ['/agentic-world/bobby', false]]) assert.equal(gate.test(route), on, route);
  for (const route of ['/desk', '/app']) {
    const added = [];
    vm.runInNewContext(script[1], { location: { pathname: route }, document: { createElement: () => ({}), head: { appendChild: (m) => added.push(m) } } });
    assert.deepEqual(added, route === '/desk' ? [{ name: 'apple-itunes-app', content: 'app-id=' + id }] : []);
  }
  assert.match(read('src/pages/BobbyAppLandingWorld.tsx'), /<meta name="apple-itunes-app" content=\{`app-id=\$\{APP_STORE_ID\}`\} \/>/);
});

// Links Bobby writes for people to share outside carry their source; the invitation link is left exactly as it is.
check('campaign tags: the island link is tagged, the invitation link is untouched', () => {
  const b = browser();
  assert.equal(b.T.shareUrl('np4dl6dyys'), 'https://bobbyprotocol.xyz/trader-land/w/np4dl6dyys?utm_source=island_share');
  assert.match('island_share', /^[a-z0-9_.-]{1,40}$/, 'a source api/track accepts');
  for (const tag of ['home_ask', 'home_example']) assert.match(tag, /^[a-z0-9_.-]{1,40}$/);
  assert.match(read('api/_lib/referrals.ts'), /export const inviteUrl = \(origin: string, code: string\): string => `\$\{origin\}\/i\/\$\{code\}`;/);
  assert.ok(!/utm_/.test(read('src/lib/invite-link.ts')), 'the invitation link carries no tag');
});

console.log(`web-activation: ${checks} checks passed; the network was recorded, never used`);
