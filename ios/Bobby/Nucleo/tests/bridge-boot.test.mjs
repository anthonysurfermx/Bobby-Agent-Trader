// Runs the shipping JS engine and bridge with native-shaped replies and a small DOM adapter.
// This verifies boot/event integration, not WebKit layout, canvas rendering or a real account.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const locale = read('../src/shared/05-locale.js');
const bridge = read('../src/shared/10-bridge.js');
const readModel = read('../src/shared/20-read-model.js');
const template = read('../src/app/template.html');
const appFiles = readdirSync(new URL('../src/app/', import.meta.url)).filter((name) => name.endsWith('.js')).sort();
const engine = appFiles.map((name) => read('../src/app/' + name)).join('\n');
const roster = JSON.parse(read('../fixtures/native/roster.json'));
const momo = roster.companions.find((companion) => companion.id === 'momo');
assert.ok(momo, 'the native roster must include Momo');

class Element {
  constructor(attributes = {}) {
    this.attributes = { ...attributes }; this.style = { setProperty() {} };
    this.children = []; this.queries = new Map(); this.listeners = {}; this.value = '';
    this.clientWidth = this.scrollWidth = 200; this.scrollHeight = 50;
    const classes = new Set((attributes.class || '').split(/\s+/).filter(Boolean));
    this.classList = {
      add(...names) { names.forEach((name) => classes.add(name)); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      contains(name) { return classes.has(name); },
      toggle(name, on = !classes.has(name)) { if (on) classes.add(name); else classes.delete(name); return on; },
    };
  }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text || this.children.map((child) => child.textContent).join(''); }
  get firstChild() { return this.children[0] || this.appendChild(new Element()); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  removeChild(child) { this.children = this.children.filter((node) => node !== child); child.parentNode = null; return child; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  querySelector(selector) {
    if (!this.queries.has(selector)) this.queries.set(selector, this.appendChild(new Element()));
    return this.queries.get(selector);
  }
  querySelectorAll(selector) { return Array.from({ length: this.attributes.id === 'meri' ? 4 : 3 }, (_, index) => this.querySelector(selector + index)); }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 30 }; }
  getContext() { return null; } // Exercise the engine's supported no-WebGL fallback.
  closest(selector) { return selector === '[data-hit]' && this.attributes['data-hit'] ? this : null; }
  contains() { return true; }
  focus() {}
  blur() {}
}

function harness({ legacyEvents = false, language = 'en', rejectCollections = false } = {}) {
  const nodes = new Map(), calls = [], errors = [];
  for (const match of template.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    const attributes = Object.fromEntries([...match[0].matchAll(/([\w-]+)="([^"]*)"/g)].map((entry) => [entry[1], entry[2]]));
    nodes.set(match[1], new Element(attributes));
  }
  nodes.get('companions').textContent = JSON.stringify([{ id: momo.webId, dataUri: 'data:image/png;base64,AA==' }]);
  const session = {
    v: 1, page: 'app', onboarded: true, firstRun: false, language, localHour: 9,
    companion: momo, xp: 0, level: { number: 1, progress: 0.2 }, streak: 0,
    signedIn: false, riskAccepted: true, riskVersion: 6, reducedMotion: false,
    mic: { state: 'undetermined', onDevice: true }, hints: {}, pendingRead: null,
    platform: 'ios', appVersion: '1.5 (45)',
    analysisLevel: { id: 'rapido', label: language === 'es' ? 'Rápido' : 'Quick', color: '#A795EF' },
  };
  const document = {
    hidden: false, documentElement: {}, addEventListener() {},
    fonts: { ready: Promise.resolve(), load: () => Promise.resolve([]) },
    getElementById(id) { assert.ok(nodes.has(id), 'missing template element ' + id); return nodes.get(id); },
    createElement: () => new Element(), createElementNS: () => new Element(),
    createTextNode(text) { const node = new Element(); node.textContent = text; return node; },
  };
  let now = 0, nextFrame;
  const context = vm.createContext({
    document, location: { search: '' }, innerWidth: 440, innerHeight: 956, devicePixelRatio: 3,
    matchMedia: () => ({ matches: false }), addEventListener() {},
    console: { error(...args) { const message = args.map((value) => value?.stack || String(value)).join(' '); if (!errors.includes(message)) errors.push(message); }, warn() {} },
    performance: { now: () => now }, getComputedStyle: () => ({ whiteSpace: 'normal' }),
    setTimeout: () => 0, requestAnimationFrame(callback) { nextFrame = callback; }, Image: class {},
    webkit: { messageHandlers: { nucleo: { postMessage(envelope) {
      calls.push(JSON.parse(JSON.stringify(envelope)));
      if (rejectCollections && ['theses', 'roster', 'island', 'suggestions'].includes(envelope.method)) return Promise.reject(new Error('offline'));
      const result = { session, roster, theses: { v: 1, items: [] }, island: { v: 1, available: false }, suggestions: { v: 1, quickAccess: [] } }[envelope.method] || { v: 1, opened: true };
      return Promise.resolve({ v: 1, ok: true, result });
    } } } },
  });
  context.window = context;
  const client = legacyEvents ? bridge.replace("'account.changed', 'consent.withdrawn', ", '') : bridge;
  vm.runInContext(locale + '\n' + client + '\n' + readModel, context, { filename: 'shipping-shared.js' });
  return {
    context, calls, errors, nodes, session,
    boot() { vm.runInContext(engine, context, { filename: 'shipping-app.js' }); },
    advance(seconds) { for (let index = 0; index < Math.ceil(seconds * 60); index++) { now += 1000 / 60; nextFrame(now); } },
  };
}
async function flush() { for (let index = 0; index < 30; index++) await Promise.resolve(); }

test('previous event allowlist reproduces the black BOOT screen before the session request', () => {
  const app = harness({ legacyEvents: true });
  assert.throws(() => app.boot(), (error) => error.code === 'unknown_event' && error.message === 'account.changed');
  assert.equal(app.context.nucleo.state(), 'BOOT');
  assert.equal(app.calls.length, 0);
  assert.equal(app.nodes.get('avatar').getAttribute('aria-label'), null);
});

test('every literal event registered by either shipping page is allowed by the real bridge', () => {
  const app = harness();
  for (const page of ['app', 'onboarding']) {
    const directory = new URL('../src/' + page + '/', import.meta.url);
    for (const file of readdirSync(directory).filter((name) => name.endsWith('.js'))) {
      const source = read('../src/' + page + '/' + file);
      for (const match of source.matchAll(/(?:BR|B)\.on\('([^']+)'/g)) {
        assert.ok(app.context.nucleoBridge.EVENTS.includes(match[1]), page + '/' + file + ': ' + match[1]);
      }
    }
  }
});

for (const language of ['en', 'es', 'fr', 'pt', 'it', 'de']) {
  test(language + ': native Momo/risk v6 session wakes, labels Profile, and opens the native account', async () => {
    const app = harness({ language });
    app.boot(); await flush();
    assert.equal(app.calls[0].method, 'session');
    assert.deepEqual(app.calls[0].params, { page: 'app' });
    assert.equal(app.context.nucleo.state(), 'WAKE');
    assert.equal(app.context.nucleo.session().riskVersion, 6);
    assert.equal(app.context.nucleo.session().companion.id, 'momo');
    assert.equal(app.nodes.get('avatar').getAttribute('aria-label'), ({ en:'Momo. Account and progress', es:'Momo. Cuenta y progreso', fr:'Momo. Compte et progression', pt:'Momo. Conta e progresso', it:'Momo. Account e progressi', de:'Momo. Konto und Fortschritt' })[language]);
    app.advance(1.2); await flush();
    assert.equal(app.context.nucleo.state(), 'IDLE');
    app.nodes.get('stage').listeners.click({ target: app.nodes.get('avatar') });
    await flush();
    assert.ok(app.calls.some((call) => call.method === 'openNative' && call.params.route === 'account'));
    assert.deepEqual(app.errors, []);
  });
}

test('offline collection failures still reach IDLE via the real scheduler', async () => {
  const app = harness({ rejectCollections: true });
  app.boot(); await flush(); app.advance(1.2); await flush();
  assert.equal(app.context.nucleo.state(), 'IDLE');
  assert.deepEqual(app.errors, []);
});

test('new native account and consent events register and dispatch through the shipping client', () => {
  const app = harness(), seen = [];
  for (const name of ['account.changed', 'consent.withdrawn']) {
    const off = app.context.nucleoBridge.on(name, (payload) => seen.push([name, payload]));
    app.context.nucleoBridge.emit(name, { reason: 'test' });
    off(); app.context.nucleoBridge.emit(name, { reason: 'ignored' });
  }
  assert.deepEqual(seen, [['account.changed', { reason: 'test' }], ['consent.withdrawn', { reason: 'test' }]]);
});

test('actual consent handler runs and a closed native sheet resumes the app with Profile accessible', async () => {
  const app = harness();
  app.boot(); await flush(); app.advance(1.2);
  app.context.nucleoBridge.emit('native.sheet', { state: 'open' });
  const time = app.context.nucleo.time();
  app.context.nucleoBridge.emit('consent.withdrawn', {});
  assert.equal(app.context.nucleo.session().riskAccepted, false);
  assert.equal(app.context.nucleo.state(), 'RETURNING');
  app.advance(0.3);
  assert.equal(app.context.nucleo.time(), time);
  app.context.nucleoBridge.emit('native.sheet', { state: 'closed' });
  await flush(); app.advance(1.5);
  assert.ok(app.context.nucleo.time() > time);
  assert.equal(app.context.nucleo.state(), 'IDLE');
  app.nodes.get('stage').listeners.click({ target: app.nodes.get('avatar') });
  await flush();
  assert.ok(app.calls.some((call) => call.method === 'openNative' && call.params.route === 'account'));
  assert.equal(app.context.nucleo.session().riskAccepted, false);
  assert.deepEqual(app.errors, []);
});

test('actual account handler receives native changes and refreshes collections', async () => {
  const app = harness();
  app.boot(); await flush(); app.advance(1.2);
  const callsBefore = app.calls.length;
  app.context.nucleoBridge.emit('account.changed', { wasSignedIn: true, signedIn: false });
  await flush();
  assert.equal(app.context.nucleo.state(), 'RETURNING');
  assert.deepEqual(app.calls.slice(callsBefore).filter((call) => ['theses', 'island', 'roster', 'suggestions'].includes(call.method)).map((call) => call.method), ['theses', 'island', 'roster', 'suggestions']);
  assert.deepEqual(app.errors, []);
});

// ---- the nudge (1.8): one native-written line and one chip; the page only draws, reports and forwards ----
const chipsOf = (app) => app.nodes.get('chipRow').children.filter((node) => node.getAttribute('data-hit') === 'chip');

test('a native nudge is the first idle chip, its line is the eyebrow, and it is reported seen exactly once', async () => {
  const app = harness();
  app.session.nudge = { id: 'memory.offer', text: 'I can pick this up next time', cta: 'Remember it' };
  app.boot(); await flush(); app.advance(1.2); await flush();
  assert.equal(app.context.nucleo.state(), 'IDLE');
  const chips = chipsOf(app);
  assert.equal(chips.length, 1);
  assert.equal(chips[0].textContent, 'Remember it');
  assert.match(chips[0].className, /\bnudge\b/);
  assert.equal(chips[0].getAttribute('aria-label'), 'I can pick this up next time. Remember it');
  assert.equal(app.nodes.get('eyebrow').textContent, 'I can pick this up next time');
  // a second session with the same nudge does not report it again
  app.context.nucleoBridge.emit('session.changed', { ...app.session });
  await flush();
  assert.deepEqual(app.calls.filter((call) => call.method === 'nudge.seen').map((call) => call.params), [{ id: 'memory.offer' }]);
  assert.deepEqual(app.errors, []);
});

test('tapping the nudge chip forwards only its id; when native withdraws it the row redraws without it', async () => {
  const app = harness();
  app.session.nudge = { id: 'credits.low', text: '2 reads left this week', cta: 'See credits' };
  app.boot(); await flush(); app.advance(1.2); await flush();
  app.nodes.get('stage').listeners.click({ target: chipsOf(app)[0], detail: 0 });
  await flush();
  assert.deepEqual(app.calls.filter((call) => call.method === 'nudge.act').map((call) => call.params), [{ id: 'credits.low' }]);
  assert.equal(app.context.nucleo.state(), 'IDLE');   // the page does not navigate by itself: native decides what opens
  app.context.nucleoBridge.emit('session.changed', { ...app.session, nudge: null });
  await flush(); app.advance(0.5);
  assert.equal(chipsOf(app).filter((node) => /\bnudge\b/.test(node.className || '')).length, 0);
  assert.deepEqual(app.errors, []);
});

test('no nudge, a malformed nudge or one without a button draws nothing and reports nothing', async () => {
  for (const nudge of [undefined, null, { id: 'x' }, { cta: 'Tap' }, { id: '', cta: 'Tap' }, { id: 'a.b', cta: '' }, 'text']) {
    const app = harness();
    if (nudge !== undefined) app.session.nudge = nudge;
    app.boot(); await flush(); app.advance(1.2); await flush();
    assert.equal(chipsOf(app).length, 0, JSON.stringify(nudge));
    assert.equal(app.calls.filter((call) => call.method.startsWith('nudge.')).length, 0, JSON.stringify(nudge));
    assert.deepEqual(app.errors, []);
  }
});

test('the page never writes nudge copy: no feature words live in the nudge code path', () => {
  const source = read('../src/app/55-read.js');
  const block = source.slice(source.indexOf('/* ---- the nudge:'), source.indexOf('function receiveSuggestions'));
  assert.ok(block.length > 200);
  assert.doesNotMatch(block, /tt\(|RMOD\.t\(/);                       // native-localized text only
  assert.doesNotMatch(block, /['"][^'"\n]*(credit|thesis|remind|invit|briefing)[^'"\n]*['"]/i);   // no feature copy in string literals
});
