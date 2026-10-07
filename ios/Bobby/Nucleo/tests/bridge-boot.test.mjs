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
  // What a browser would measure; a test hands in `measure` when a height decides something.
  get offsetHeight() { return this.measure ? this.measure(this) : undefined; }
  getComputedTextLength() { return 40; }
  getTotalLength() { return 300; }
  getPointAtLength() { return { x: 0, y: 0 }; }
  getContext() { return null; } // Exercise the engine's supported no-WebGL fallback.
  closest(selector) { return selector === '[data-hit]' && this.attributes['data-hit'] ? this : null; }
  contains() { return true; }
  focus() {}
  blur() {}
}

function harness({ legacyEvents = false, language = 'en', rejectCollections = false, nudgeActive = true,
  suggestions = { v: 1, quickAccess: [] }, holdAsks = false, measure = null } = {}) {
  const nodes = new Map(), calls = [], errors = [], pending = [];
  const made = () => Object.assign(new Element(), { measure });
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
    createElement: made, createElementNS: made,
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
      // A read the test answers itself (answer()), read silently so the page's own clock runs it.
      if (holdAsks && envelope.method === 'ask') return new Promise((resolve) => pending.push((result) => resolve({ v: 1, ok: true, result })));
      if (holdAsks && envelope.method === 'speak') return Promise.resolve({ v: 1, ok: true, result: { status: 'muted' } });
      const result = { session, roster, theses: { v: 1, items: [] }, island: { v: 1, available: false }, suggestions,
        'nudge.seen': { count: 1, active: nudgeActive }, 'nudge.act': { status: 'done' } }[envelope.method] || { v: 1, opened: true };
      return Promise.resolve({ v: 1, ok: true, result });
    } } } },
  });
  context.window = context;
  const client = legacyEvents ? bridge.replace("'account.changed', 'consent.withdrawn', ", '') : bridge;
  vm.runInContext(locale + '\n' + client + '\n' + readModel, context, { filename: 'shipping-shared.js' });
  return {
    context, calls, errors, nodes, session,
    boot() { vm.runInContext(engine, context, { filename: 'shipping-app.js' }); },
    answer(result) { assert.ok(pending.length, 'no ask is waiting'); pending.shift()(JSON.parse(JSON.stringify(result))); },
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
const nudgeChips = (app) => chipsOf(app).filter((node) => /\bnudge\b/.test(node.className || ''));

test('a native nudge is the first idle chip, its line is the eyebrow, and every drawing is reported', async () => {
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
  assert.deepEqual(app.calls.filter((call) => call.method === 'nudge.seen').map((call) => call.params), [{ id: 'memory.offer' }]);
  // the same nudge in a later session is not redrawn (no flicker, no extra report)
  app.context.nucleoBridge.emit('session.changed', { ...app.session });
  await flush();
  assert.equal(app.calls.filter((call) => call.method === 'nudge.seen').length, 1);
  assert.deepEqual(app.errors, []);
});

test('a nudge whose words changed under the same id is redrawn with the new words', async () => {
  const app = harness();
  app.session.nudge = { id: 'credits.low', text: '2 reads left this week', cta: 'See credits' };
  app.boot(); await flush(); app.advance(1.2); await flush();
  app.context.nucleoBridge.emit('session.changed', { ...app.session, nudge: { id: 'credits.low', text: '1 read left this week', cta: 'See credits' } });
  await flush(); app.advance(0.6); await flush();
  assert.equal(app.nodes.get('eyebrow').textContent, '1 read left this week');
  const live = nudgeChips(app);
  assert.equal(live[live.length - 1].getAttribute('aria-label'), '1 read left this week. See credits');
  assert.equal(app.calls.filter((call) => call.method === 'nudge.seen').length, 2, 'a new drawing is a new report');
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
  await flush(); app.advance(0.6);
  assert.equal(nudgeChips(app).length, 0);
  assert.deepEqual(app.errors, []);
});

test('when native answers that a drawn nudge is over, the row lets it go without waiting for a session', async () => {
  const app = harness({ nudgeActive: false });
  app.session.nudge = { id: 'memory.offer', text: 'I can pick this up next time', cta: 'Remember it' };
  app.boot(); await flush(); app.advance(1.2); await flush(); app.advance(0.6); await flush();
  assert.equal(app.context.nucleo.session().nudge, null);
  assert.equal(nudgeChips(app).length, 0);
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

// ---- a read native starts (1.8): a follow-up's button or a row of a native board. Native names the asset
// inside a single-use token and writes the question; the page runs it like a chip that carries a token ----
test('ask.start asks with the token native issued, from the idle home, and never under a sheet or over a read', async () => {
  const app = harness();
  app.boot(); await flush(); app.advance(1.2); await flush();
  assert.equal(app.context.nucleo.state(), 'IDLE');
  const asks = () => app.calls.filter((call) => call.method === 'ask').map((call) => call.params);
  app.context.nucleoBridge.emit('native.sheet', { route: 'followUp', state: 'open' });
  app.context.nucleoBridge.emit('ask.start', { token: 'tok-1', question: 'What changed in NVDA since I asked?' });
  await flush();
  assert.deepEqual(asks(), [], 'behind a native sheet nothing starts');
  app.context.nucleoBridge.emit('native.sheet', { route: 'followUp', state: 'closed' });
  for (const payload of [null, {}, { token: '' }, { token: 7 }, { question: 'no token' }]) app.context.nucleoBridge.emit('ask.start', payload);
  await flush();
  assert.deepEqual(asks(), [], 'a payload without a token asks nothing');
  app.context.nucleoBridge.emit('ask.start', { token: 'tok-2', question: 'What changed in NVDA since I asked?' });
  assert.equal(app.context.nucleo.state(), 'SENDING');
  assert.deepEqual(asks(), [{ token: 'tok-2' }], 'only the token travels: the page never names the asset');
  app.context.nucleoBridge.emit('ask.start', { token: 'tok-3', question: 'another' });
  assert.deepEqual(asks(), [{ token: 'tok-2' }], 'a read in flight is not replaced');
});

test('the page never writes nudge copy: no feature words live in the nudge code path', () => {
  const source = read('../src/app/55-read.js');
  const block = source.slice(source.indexOf('/* ---- the nudge:'), source.indexOf('function receiveSuggestions'));
  assert.ok(block.length > 200);
  assert.doesNotMatch(block, /tt\(|RMOD\.t\(/);                       // native-localized text only
  assert.doesNotMatch(block, /['"][^'"\n]*(credit|thesis|remind|invit|briefing)[^'"\n]*['"]/i);   // no feature copy in string literals
});

test('the Android page carries the same nudge code as iOS', () => {
  const cut = (source) => source.slice(source.indexOf('/* ---- the nudge:'), source.indexOf('function receiveSuggestions'));
  assert.equal(cut(read('../../../../android/nucleo/src/app/55-read.js')), cut(read('../src/app/55-read.js')));
});

// ---- the next question (ARCHITECTURE.md §3.5): when the voice ends, the CIO's question is the first chip of the
// read's row; a tap asks it as a follow-up of that read; a read native started never ends on a mover ----
const nvda = JSON.parse(read('../fixtures/ask/nvda.json'));
const READ_ID = '11111111-1111-4111-8111-111111111111';
const synthesis = (followUp) => ({ headline: 'The trend is firm.', why: 'W.', risk: 'R.', watch: 'X.', ...(followUp === undefined ? {} : { followUp }) });
const okRead = (extra = {}) => ({ ...nvda, requestId: READ_ID, ...extra });
const OWN = { v: 1, quickAccess: [{ symbol: 'NVDA' }, { symbol: 'BTC' }, { symbol: 'ETH' }], movers: [{ symbol: 'TSLA', name: 'Tesla', changePct: 4.1 }] };
const rowOf = (app) => chipsOf(app).map((node) => node.textContent);
const asksOf = (app) => app.calls.filter((call) => call.method === 'ask').map((call) => call.params);
const tap = (app, node) => app.nodes.get('stage').listeners.click({ target: node, detail: 0 });
async function idle(options) {
  const app = harness({ holdAsks: true, suggestions: OWN, ...options });
  app.boot(); await flush(); app.advance(1.2); await flush();
  assert.equal(app.context.nucleo.state(), 'IDLE');
  return app;
}
// From the ask to the settled hand-back: the reply, the silent read on the page's own clock, then the row (born 1 s in).
async function handBack(app, reply) {
  await flush(); app.advance(1.2); await flush();
  app.answer(reply); await flush();
  for (let step = 0; step < 240 && app.context.nucleo.state() !== 'HANDBACK'; step++) { app.advance(0.25); await flush(); }
  assert.equal(app.context.nucleo.state(), 'HANDBACK');
  assert.deepEqual(rowOf(app), [], 'the last spoken line is still there when the voice ends');
  app.advance(1.6); await flush();
}
// The person asks by themselves: the first idle chip is one of their own assets.
async function personRead(app, reply) { tap(app, chipsOf(app)[0]); await handBack(app, reply); }

const NEXT = {
  en: { question: 'What would have to change in NVDA for this read to change?', another: 'Another question about NVDA', own: ['How is BTC looking?', 'How is ETH looking?'] },
  es: { question: '¿Qué tendría que cambiar en NVDA para que cambie esta lectura?', another: 'Otra pregunta sobre NVDA', own: ['¿Cómo se ve BTC?', '¿Cómo se ve ETH?'] },
};
for (const language of ['en', 'es']) {
  const copy = NEXT[language];
  test(language + ': the CIO’s question is the first chip when the voice ends, and one tap asks it about the same read', async () => {
    const app = await idle({ language });
    await personRead(app, okRead({ language, synthesis: synthesis(copy.question) }));
    assert.deepEqual(rowOf(app), [copy.question, copy.another, copy.own[0]], 'never more than three, never a mover');
    assert.match(chipsOf(app)[0].className, /\bask\b/);
    assert.equal(nudgeChips(app).length, 0);
    const before = asksOf(app).length;
    tap(app, chipsOf(app)[0]);
    assert.equal(app.context.nucleo.state(), 'SENDING');
    assert.deepEqual(asksOf(app).slice(before), [{ followUpOf: READ_ID, question: copy.question }], 'the existing follow-up path: no asset, no new method');
    assert.deepEqual(app.errors, []);
  });

  test(language + ': a reply without the field hands back exactly the fixed chips', async () => {
    for (const reply of [okRead({ language }), okRead({ language, synthesis: synthesis() }), okRead({ language, synthesis: synthesis('NVDA is strong.') })]) {
      const app = await idle({ language });
      await personRead(app, reply);
      assert.deepEqual(rowOf(app), [copy.another, copy.own[0], copy.own[1]]);
      assert.ok(chipsOf(app).every((node) => !/\bask\b/.test(node.className)));
      // "Another question" still opens the keyboard for the person's own words.
      tap(app, chipsOf(app)[0]);
      assert.equal(app.context.nucleo.state(), 'TYPING');
      assert.deepEqual(app.errors, []);
    }
  });

  test(language + ': a read native started from a follow-up hands back the person’s own question and assets only', async () => {
    const movers = { v: 1, quickAccess: [{ symbol: 'NVDA' }], movers: [{ symbol: 'TSLA', name: 'Tesla', changePct: 4.1 }, { symbol: 'AAPL', name: 'Apple', changePct: 2.2 }] };
    // The person's own read, with no other asset of theirs: the day's movers may fill the slots.
    const own = await idle({ language, suggestions: movers });
    await personRead(own, okRead({ language }));
    assert.equal(rowOf(own).length, 3);
    assert.match(rowOf(own)[1], /TSLA/); assert.match(rowOf(own)[2], /AAPL/);
    // The same reply to a read Bobby started: no mover, with or without the CIO's question.
    for (const [reply, row] of [[okRead({ language }), [copy.another]], [okRead({ language, synthesis: synthesis(copy.question) }), [copy.question, copy.another]]]) {
      const app = await idle({ language, suggestions: movers });
      app.context.nucleoBridge.emit('ask.start', { token: 'tok-1', question: copy.question.replace('NVDA', 'the asset') });
      await handBack(app, reply);
      assert.deepEqual(rowOf(app), row);
      assert.ok(!rowOf(app).some((label) => /TSLA|AAPL/.test(label)));
      assert.deepEqual(app.errors, []);
    }
    // With assets of their own the row is the usual one.
    const app = await idle({ language });
    app.context.nucleoBridge.emit('ask.start', { token: 'tok-2', question: 'q' });
    await handBack(app, okRead({ language, synthesis: synthesis(copy.question) }));
    assert.deepEqual(rowOf(app), [copy.question, copy.another, copy.own[0]]);
  });
}

test('the thread Bobby started stays his: its next question, asked, still ends without a mover; a new question of the person does not', async () => {
  const movers = { v: 1, quickAccess: [{ symbol: 'NVDA' }], movers: [{ symbol: 'TSLA', name: 'Tesla', changePct: 4.1 }] };
  const app = await idle({ suggestions: movers });
  app.context.nucleoBridge.emit('ask.start', { token: 'tok-1', question: 'What changed in NVDA since I asked?' });
  await handBack(app, okRead({ synthesis: synthesis(NEXT.en.question) }));
  tap(app, chipsOf(app)[0]);
  await handBack(app, okRead({ requestId: '22222222-2222-4222-8222-222222222222', question: NEXT.en.question }));
  assert.deepEqual(rowOf(app), ['Another question about NVDA']);
  // The person closes the read and asks about their own asset: the row is theirs again, movers included.
  tap(app, app.nodes.get('close')); app.advance(2.5); await flush();
  assert.equal(app.context.nucleo.state(), 'IDLE');
  await personRead(app, okRead({ requestId: '33333333-3333-4333-8333-333333333333' }));
  assert.deepEqual(rowOf(app), ['Another question about NVDA', 'How is TSLA looking?']);
  assert.deepEqual(app.errors, []);
});

test('the question the read just answered is never offered again', async () => {
  const app = await idle();
  await personRead(app, okRead({ synthesis: synthesis(NEXT.en.question) }));
  tap(app, chipsOf(app)[0]);
  await handBack(app, okRead({ requestId: '22222222-2222-4222-8222-222222222222', question: NEXT.en.question, synthesis: synthesis(NEXT.en.question) }));
  assert.deepEqual(rowOf(app), ['Another question about NVDA', 'How is BTC looking?', 'How is ETH looking?']);
});

test('a question the chip cannot hold on two lines is dropped for the fixed row, silently', async () => {
  // .chip.ask is two 19 px lines + 20 px + the hairline; the browser reports a third line as 78 px
  const measure = (node) => (/\bask\b/.test(node.className || '') ? (node.textContent.length > 70 ? 78 : 59) : undefined);
  const long = 'Why does NVDA keep holding above its support while the volume fades week after week?';
  assert.ok(long.length <= harness().context.NucleoReadModel.NEXT.max, 'the read model lets it through: only the drawn chip can tell');
  const app = await idle({ measure });
  await personRead(app, okRead({ synthesis: synthesis(long) }));
  assert.deepEqual(rowOf(app), ['Another question about NVDA', 'How is BTC looking?', 'How is ETH looking?']);
  const fits = await idle({ measure });
  await personRead(fits, okRead({ synthesis: synthesis(NEXT.en.question) }));
  assert.equal(rowOf(fits)[0], NEXT.en.question);
  assert.deepEqual(app.errors.concat(fits.errors), []);
});

test('a finger that goes down on the row and moves down still pulls the cards; the row leaves for them and returns', async () => {
  const app = await idle();
  await personRead(app, okRead({ synthesis: synthesis(NEXT.en.question) }));
  const stage = app.nodes.get('stage').listeners, chip = chipsOf(app)[0];
  const at = (y) => ({ isPrimary: true, button: 0, pointerId: 7, clientX: 200, clientY: y, target: chip, cancelable: false });
  stage.pointerdown(at(600)); stage.pointermove(at(630));
  assert.equal(app.context.nucleo.state(), 'PULLING');
  assert.equal(asksOf(app).length, 1, 'a pull is not a tap: nothing was asked');
  app.advance(0.6); await flush();
  assert.deepEqual(rowOf(app), [], 'the cards pour over the band the row sat in');
  stage.pointermove(at(630)); stage.pointerup(at(630));   // a finger at rest: no flick, no commit
  assert.equal(app.context.nucleo.state(), 'HANDBACK', 'let go before the commit: back to the hand-back');
  app.advance(0.8); await flush();
  assert.equal(rowOf(app)[0], NEXT.en.question);
  assert.deepEqual(app.errors, []);
});

test('a restored read stands at the hand-back with its row at once, and never with a mover', async () => {
  const app = harness({ holdAsks: true, suggestions: { v: 1, quickAccess: [{ symbol: 'NVDA' }], movers: [{ symbol: 'TSLA', name: 'Tesla', changePct: 4.1 }] } });
  app.session.pendingRead = okRead({ synthesis: synthesis(NEXT.en.question) });
  app.boot(); await flush(); app.advance(0.2); await flush();
  assert.equal(app.context.nucleo.state(), 'HANDBACK');
  app.advance(1.0); await flush();
  assert.deepEqual(rowOf(app), [NEXT.en.question, 'Another question about NVDA']);
  assert.deepEqual(app.errors, []);
});

// ---- a chip whose question Bobby wrote says so when it asks (review of 2026-10-07): native then never takes it
// for a question the person asked by themselves, so it starts no chain of follow-ups (ARCHITECTURE.md §3.5) ----
test('a one-tap chip tells native the words were Bobby’s; a typed question and “another question” do not', async () => {
  const app = await idle();
  assert.deepEqual(rowOf(app), ['NVIDIA', 'BTC', 'ETH']);
  tap(app, chipsOf(app)[1]);
  assert.deepEqual(asksOf(app), [{ question: 'How is BTC looking?', chip: true }], 'an asset of the idle home');
  await handBack(app, okRead({ synthesis: synthesis(NEXT.en.question) }));
  assert.deepEqual(rowOf(app), [NEXT.en.question, 'Another question about NVDA', 'How is BTC looking?']);
  tap(app, chipsOf(app)[2]);
  assert.deepEqual(asksOf(app)[1], { question: 'How is BTC looking?', chip: true }, 'an asset of the row after a read');
  await handBack(app, okRead({ requestId: '22222222-2222-4222-8222-222222222222' }));
  // A mover asked from the row is Bobby's question too.
  const movers = await idle({ suggestions: { v: 1, quickAccess: [{ symbol: 'NVDA' }], movers: [{ symbol: 'TSLA', name: 'Tesla', changePct: 4.1 }] } });
  await personRead(movers, okRead());
  tap(movers, chipsOf(movers)[1]);
  assert.deepEqual(asksOf(movers)[1], { question: 'How is TSLA looking?', chip: true });
  // Their own words carry no mark: the keyboard after “another question”, and the CIO's question (native knows it).
  const own = await idle();
  await personRead(own, okRead({ synthesis: synthesis(NEXT.en.question) }));
  tap(own, chipsOf(own)[0]);
  assert.deepEqual(asksOf(own)[1], { followUpOf: READ_ID, question: NEXT.en.question });
  assert.deepEqual(app.errors.concat(movers.errors, own.errors), []);
});

// ---- Bobby never invites someone into a wall: no one-tap question when native says the next read would be refused ----
test('with no read left the hand-back row is “another question” alone, whoever started the read', async () => {
  for (const language of ['en', 'es']) {
    const another = NEXT[language].another;
    const own = await idle({ language });
    await personRead(own, okRead({ language, synthesis: synthesis(NEXT[language].question), oneTap: false }));
    assert.deepEqual(rowOf(own), [another], 'their own read');
    const started = await idle({ language });
    started.context.nucleoBridge.emit('ask.start', { token: 'tok-1', question: 'q' });
    await handBack(started, okRead({ language, oneTap: false }));
    assert.deepEqual(rowOf(started), [another], 'a read Bobby started');
    tap(started, chipsOf(started)[0]);
    assert.equal(started.context.nucleo.state(), 'TYPING', 'the one chip left asks nothing by itself');
    assert.deepEqual(own.errors.concat(started.errors), []);
  }
});

test('with no read left the idle home shows no asset chip; they come back when a read does', async () => {
  const app = harness({ holdAsks: true, suggestions: OWN });
  app.session.oneTap = false;
  app.boot(); await flush(); app.advance(1.2); await flush();
  assert.equal(app.context.nucleo.state(), 'IDLE');
  assert.deepEqual(rowOf(app), [], 'nothing to tap that would end on the sign-in or the paywall');
  // A nudge is native's own line and stays (it never starts a read by itself).
  app.context.nucleoBridge.emit('session.changed', { ...app.session, nudge: { id: 'memory.offer', text: 'I can pick this up next time', cta: 'Remember it' } });
  await flush();
  assert.deepEqual(rowOf(app), ['Remember it']);
  // Reads are back (a new week, a gift, Bobby Pro): native stops saying no and the row returns.
  const open = { ...app.session }; delete open.oneTap;
  app.context.nucleoBridge.emit('session.changed', open);
  await flush(); app.advance(1.0); await flush();
  assert.deepEqual(rowOf(app), ['NVIDIA', 'BTC', 'ETH']);
  // And the other way: the last read was spent while the home was showing.
  app.context.nucleoBridge.emit('session.changed', { ...open, oneTap: false });
  await flush(); app.advance(1.0); await flush();
  assert.deepEqual(rowOf(app), []);
  assert.equal(asksOf(app).length, 0);
  assert.deepEqual(app.errors, []);
});

test('the onboarding page marks a first question picked on a chip the same way, and no other', () => {
  const source = read('../src/onboarding/60-fsm.js');
  const body = source.match(/function firstAsk\(\)\{[^\n]+\}/);
  assert.ok(body, 'firstAsk() is one line of the onboarding engine');
  const firstAsk = (W) => JSON.parse(JSON.stringify(vm.runInNewContext('(' + body[0].replace('function firstAsk', 'function') + ')()', { W })));
  assert.deepEqual(firstAsk({ qSrc: 'chip', question: 'How is NVDA looking?' }), { question: 'How is NVDA looking?', chip: true });
  for (const qSrc of ['voice', 'type', '']) assert.deepEqual(firstAsk({ qSrc, question: 'Is NVDA expensive?' }), { question: 'Is NVDA expensive?' }, qSrc);
  assert.equal(source.split('startAsk(firstAsk())').length, 3, 'both places the first question is asked from');
  assert.doesNotMatch(source, /startAsk\(\{ ?question:/, 'no ask of a first question goes round it');
  // A first question has three sources, and one of them is a chip.
  const sources = [...source.matchAll(/commitQuestion\([^,()]+, '(\w+)'\)/g)].map((match) => match[1]).sort();
  assert.equal(sources.length, 3);
  assert.deepEqual(sources.filter((src) => src === 'chip'), ['chip']);
  assert.ok(sources.includes('voice'));
});
