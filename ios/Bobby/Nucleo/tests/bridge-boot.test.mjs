// Runs the shipping JS engine and bridge with native-shaped replies and a small DOM adapter.
// This verifies boot/event integration, not WebKit layout, canvas rendering or a real account.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { askStartCases } from './ask-start.cases.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const locale = read('../src/shared/05-locale.js');
const bridge = read('../src/shared/10-bridge.js');
const readModel = read('../src/shared/20-read-model.js');
const template = read('../src/app/template.html');
const appFiles = readdirSync(new URL('../src/app/', import.meta.url)).filter((name) => name.endsWith('.js')).sort();
const switches = JSON.parse(read('../talk-mode.json'));
const engine = `var TALK_MODE=${JSON.stringify(switches.TALK_MODE)}, READ_CONFIRM=${switches.READ_CONFIRM}, FIRST_RUN_HANDOVER=${switches.FIRST_RUN_HANDOVER};\n` + appFiles.map((name) => read('../src/app/' + name)).join('\n');
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
  insertBefore(child, before) { child.parentNode = this; const i = this.children.indexOf(before); if (i < 0) this.children.push(child); else this.children.splice(i,0,child); return child; }
  removeChild(child) { this.children = this.children.filter((node) => node !== child); child.parentNode = null; return child; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  querySelector(selector) {
    if(selector === ".conversation-eyebrow") {
      const find = node => node.children.find(child => child.attributes.class === "conversation-eyebrow") || node.children.map(find).find(Boolean);
      return find(this) || null;
    }
    if (!this.queries.has(selector)) this.queries.set(selector, this.appendChild(new Element()));
    return this.queries.get(selector);
  }
  querySelectorAll(selector) {
    if (selector === 'button' && this.id === 'companionPanel') {
      const collect = node => node.children.flatMap(child => child._guideAction ? [child] : collect(child));
      return collect(this);
    }
    return Array.from({ length: this.attributes.id === 'meri' ? 4 : 3 }, (_, index) => this.querySelector(selector + index)); }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 30 }; }
  // What a browser would measure; a test hands in `measure` when a height decides something.
  get offsetHeight() { return this.measure ? this.measure(this) : undefined; }
  getComputedTextLength() { return 40; }
  getTotalLength() { return 300; }
  getPointAtLength() { return { x: 0, y: 0 }; }
  getContext() { return null; } // Exercise the engine's supported no-WebGL fallback.
  closest(selector) {
    if (selector === '[data-hit]' && this.attributes['data-hit'] || selector === '#' + this.id || selector === 'button' && this._guideAction) return this;
    return this.parentNode?.closest(selector) || null;
  }
  contains() { return true; }
  focus() {}
  blur() {}
}

function harness({ legacyEvents = false, language = 'en', rejectCollections = false, nudgeActive = true,
  suggestions = { v: 1, quickAccess: [] }, holdAsks = false, measure = null, stallCollections = false,
  theses = { v: 1, items: [] }, saved = null, speak = 'muted', speaking = null, chooseFails = false, companionAnswer = () => ({question:null}) } = {}) {
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
    platform: 'ios', appVersion: '1.5 (45)', speaking,
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
      if (envelope.method === 'speech.permission') return Promise.resolve({v:1,ok:true,result:session.mic});
      if (envelope.method === 'speech.start') return Promise.resolve({v:1,ok:true,result:{status:'listening'}});
      if (envelope.method === 'speech.stop') return Promise.resolve({v:1,ok:true,result:{status:'processing'}});
      if (envelope.method === 'companion.answer') return Promise.resolve(companionAnswer(envelope.params)).then(result => ({v:1,ok:true,result}));
      if (envelope.method === "speaking.choose") {
        if (chooseFails) return Promise.reject(new Error("storage failed"));
        session.speaking = { ...session.speaking, value: envelope.params.value, offer: false, refine: false };
        return Promise.resolve({ v: 1, ok: true, result: session });
      }
      if (rejectCollections && ['theses', 'roster', 'island', 'suggestions'].includes(envelope.method)) return Promise.reject(new Error('offline'));
      // Native never answers the two collections the page waits for before it starts: the page starts on its own clock.
      if (stallCollections && ['theses', 'roster'].includes(envelope.method)) return new Promise(() => {});
      // A read the test answers itself (answer()), read silently so the page's own clock runs it.
      if (holdAsks && envelope.method === 'ask') return new Promise((resolve) => pending.push((result) => resolve({ v: 1, ok: true, result })));
      if (holdAsks && envelope.method === 'speak') return Promise.resolve({ v: 1, ok: true, result: { status: speak } });
      const result = { session, roster, theses, island: { v: 1, available: false }, suggestions, saveThesis: saved,
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
test('ask.start asks with the token native issued, from the idle home, and never under a sheet or while a read is on its way', async () => {
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
  const block = source.slice(source.indexOf('/* ---- the nudge:'), source.indexOf('/* ---- a read native starts'));
  assert.ok(block.length > 200);
  assert.doesNotMatch(block, /tt\(|RMOD\.t\(/);                       // native-localized text only
  assert.doesNotMatch(block, /['"][^'"\n]*(credit|thesis|remind|invit|briefing)[^'"\n]*['"]/i);   // no feature copy in string literals
});

test('the Android page carries the same nudge code as iOS, and takes a read native starts from the same states', () => {
  const cut = (source) => source.slice(source.indexOf('/* ---- the nudge:'), source.indexOf('function receiveSuggestions'));
  assert.equal(cut(read('../../../../android/nucleo/src/app/55-read.js')), cut(read('../src/app/55-read.js')));
  assert.ok(cut(read('../src/app/55-read.js')).includes('var ASK_FROM = {') && cut(read('../src/app/55-read.js')).includes('function askStart(p){'));
  // What askStart leans on in the state machine: the turn back to the Desk face, and where a row is taken away.
  const face = (source) => source.slice(source.indexOf('/* the sphere turns back to its Desk face'), source.indexOf('STATES.FACES = {'));
  assert.ok(face(read('../src/app/60-fsm.js')).includes('function deskFace(){'));
  assert.equal(face(read('../../../../android/nucleo/src/app/60-fsm.js')), face(read('../src/app/60-fsm.js')));
  const row = (source) => source.slice(source.indexOf('/* ---- chips: born from the pill'), source.indexOf('function oneTapOff'))
    + source.slice(source.indexOf('function chipsHide('), source.indexOf('/* ---- the live transcript'));
  assert.ok(row(read('../src/app/55-read.js')).includes('op(c.el, 0)'));
  assert.equal(row(read('../../../../android/nucleo/src/app/55-read.js')), row(read('../src/app/55-read.js')));
  assert.equal(read('../../../../android/nucleo/src/app/30-dom.js'), read('../src/app/30-dom.js'), 'the DOM helpers and the belt are one file');
});

// ---- the next question (ARCHITECTURE.md §3.5): when the voice ends, the CIO's question is the first chip of the
// read's row; a tap asks it as a follow-up of that read; a read native started never ends on a mover ----
const nvda = JSON.parse(read('../fixtures/ask/nvda.json'));
const READ_ID = '11111111-1111-4111-8111-111111111111';
const synthesis = (followUp) => ({ headline: 'The trend is firm.', why: 'W.', risk: 'R.', watch: 'X.', ...(followUp === undefined ? {} : { followUp }) });
const okRead = (extra = {}) => ({ ...nvda, requestId: READ_ID, ...extra });
const OWN = { v: 1, quickAccess: [{ symbol: 'NVDA', name:'NVIDIA' }, { symbol: 'BTC', name:'Bitcoin' }, { symbol: 'ETH', name:'Ethereum' }], movers: [{ symbol: 'TSLA', name: 'Tesla', changePct: 4.1 }] };
const rowOf = (app) => chipsOf(app).map((node) => node.textContent);
const asksOf = (app) => app.calls.filter((call) => call.method === 'ask').map((call) => call.params);
const tap = (app, node) => app.nodes.get('stage').listeners.click({ target: node, detail: 0 });
async function idle(options = {}) {
  const { seed, from = 'IDLE', ...rest } = options;
  const app = harness({ holdAsks: true, suggestions: OWN, ...rest });
  if (seed) seed(app.session);
  app.boot(); await flush(); app.advance(1.2); await flush();
  assert.equal(app.context.nucleo.state(), from);
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
    const movers = { v: 1, quickAccess: [{ symbol: 'NVDA', name:'NVIDIA' }], movers: [{ symbol: 'TSLA', name: 'Tesla', changePct: 4.1 }, { symbol: 'AAPL', name: 'Apple', changePct: 2.2 }] };
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
  const movers = { v: 1, quickAccess: [{ symbol: 'NVDA', name:'NVIDIA' }], movers: [{ symbol: 'TSLA', name: 'Tesla', changePct: 4.1 }] };
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
  const app = harness({ holdAsks: true, suggestions: { v: 1, quickAccess: [{ symbol: 'NVDA', name:'NVIDIA' }], movers: [{ symbol: 'TSLA', name: 'Tesla', changePct: 4.1 }] } });
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
  assert.deepEqual(rowOf(app), ['NVIDIA', 'Bitcoin', 'Ethereum']);
  tap(app, chipsOf(app)[1]);
  assert.deepEqual(asksOf(app), [{ question: 'How is Bitcoin looking?', chip: true, confirm: true }], 'an asset of the idle home');
  await handBack(app, okRead({ synthesis: synthesis(NEXT.en.question) }));
  assert.deepEqual(rowOf(app), [NEXT.en.question, 'Another question about NVDA', 'How is BTC looking?']);
  tap(app, chipsOf(app)[2]);
  assert.deepEqual(asksOf(app)[1], { question: 'How is BTC looking?', chip: true, confirm: true }, 'an asset of the row after a read');
  await handBack(app, okRead({ requestId: '22222222-2222-4222-8222-222222222222' }));
  // A mover asked from the row is Bobby's question too.
  const movers = await idle({ suggestions: { v: 1, quickAccess: [{ symbol: 'NVDA', name:'NVIDIA' }], movers: [{ symbol: 'TSLA', name: 'Tesla', changePct: 4.1 }] } });
  await personRead(movers, okRead());
  tap(movers, chipsOf(movers)[1]);
  assert.deepEqual(asksOf(movers)[1], { question: 'How is TSLA looking?', chip: true, confirm: true });
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
  assert.deepEqual(rowOf(app), ['NVIDIA', 'Bitcoin', 'Ethereum']);
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

// ---- PINNED FACTS native leans on (2026-10-08). A read native starts is taken by the page from every state in which
// a new read is what the person expects (the table of ARCHITECTURE.md §9.5; ask-start.cases.mjs runs it on both
// phones). Where it is not, the page says nothing and remembers nothing, and its own clock stands still under a native
// sheet. So a board opened the moment the page asks for its session freezes it in WAKE, and the question a row of that
// board asks is not taken: the sheet closes onto a page that is still waking. NucleoSession makes up for the states
// that end by themselves (Sources/Nucleo/NucleoSession.swift, "The page wakes up" and "Reads native starts"): a stored
// follow-up tap opens its board only once the page has had `wakeTick` x `wakeTicks` in front with nothing over it, and
// a question the page did not take is offered again with the same single-use token, `readOfferRepeats` times,
// `readOfferSpacing` apart. If a test below changes, those numbers and Tests/NucleoReadStartTests.swift (which drives
// the real session against a stand-in for this page) change with it. ----
test('cold start: a board opened right after the session reply freezes the wake, and the question its row asks is dropped', async () => {
  const app = harness({ holdAsks: true });
  const emit = (name, payload) => app.context.nucleoBridge.emit(name, payload);
  const question = 'How does NVDA look today?';
  app.boot(); await flush();
  assert.equal(app.calls[0].method, 'session');
  assert.equal(app.context.nucleo.state(), 'WAKE', 'the session reply came: the page starts to wake');
  // What native did until 2026-10-08: the stored week tap opened its board on the turn after that reply.
  emit('native.sheet', { route: 'followUp', state: 'open' });
  const frozen = app.context.nucleo.time();
  app.advance(5); await flush();
  assert.equal(app.context.nucleo.time(), frozen, 'under a sheet the page does not run: five seconds pass and its clock has not moved');
  assert.equal(app.context.nucleo.state(), 'WAKE', 'so it never reaches the idle home while the board is up');
  // The person taps NVDA: the sheet closes and the question follows it.
  emit('native.sheet', { route: 'followUp', state: 'closed' });
  emit('ask.start', { token: 'tok-week', question });
  await flush();
  assert.equal(app.context.nucleo.state(), 'WAKE', 'the page is still waking: it stays out of SENDING');
  assert.deepEqual(asksOf(app), [], 'and asks nothing');
  // It does not keep the question for later either.
  app.advance(1.2); await flush();
  assert.equal(app.context.nucleo.state(), 'IDLE');
  assert.deepEqual(asksOf(app), [], 'the home is idle and the question is gone: only native can offer it again');
  // What native does now: the same token, offered again, is taken from the idle home at once.
  emit('ask.start', { token: 'tok-week', question });
  assert.equal(app.context.nucleo.state(), 'SENDING');
  assert.deepEqual(asksOf(app), [{ token: 'tok-week' }], 'the page takes a question by calling ask with its token, in the same turn');
  assert.deepEqual(app.errors, []);
});

test('a page in front, with nothing over it, is at its idle home 1.4 s after the session reply at the latest', async () => {
  // The fast road: native answers theses and roster at once, the page starts with them and wakes for 0.9 s.
  const fast = harness();
  fast.boot(); await flush();
  assert.equal(fast.context.nucleo.state(), 'WAKE');
  fast.advance(0.85); await flush();
  assert.equal(fast.context.nucleo.state(), 'WAKE');
  fast.advance(0.1); await flush();
  assert.equal(fast.context.nucleo.state(), 'IDLE', '0.9 s of its own clock');
  // The slow road: the two collections never answer, the page starts by itself after 0.5 s and then wakes.
  const slow = harness({ stallCollections: true });
  slow.boot(); await flush();
  assert.equal(slow.context.nucleo.state(), 'BOOT');
  slow.advance(0.45); await flush();
  assert.equal(slow.context.nucleo.state(), 'BOOT');
  slow.advance(0.1); await flush();
  assert.equal(slow.context.nucleo.state(), 'WAKE', 'it starts without them after 0.5 s');
  slow.advance(0.8); await flush();
  assert.equal(slow.context.nucleo.state(), 'WAKE');
  slow.advance(0.1); await flush();
  assert.equal(slow.context.nucleo.state(), 'IDLE', '0.5 s + 0.9 s: native waits 1.6 s before a board may cover it');
  assert.ok(slow.context.nucleo.time() <= 1.6);
  assert.deepEqual(fast.errors.concat(slow.errors), []);
});

test('one token offered several times is asked once: taken from the idle home, ignored while that read is on its way', async () => {
  const app = await idle();
  const offer = () => app.context.nucleoBridge.emit('ask.start', { token: 'tok-1', question: 'How does NVDA look today?' });
  offer();
  assert.equal(app.context.nucleo.state(), 'SENDING');
  offer(); offer();
  await flush(); app.advance(1.2); await flush();
  offer();
  assert.deepEqual(asksOf(app), [{ token: 'tok-1' }], 'a second offer of a token the page already took changes nothing');
  assert.deepEqual(app.errors, []);
});

test('a page that is coming home takes a question offered again once it is there; a finished read and an open keyboard take it at once', async () => {
  const question = 'How does NVDA look today?';
  // RETURNING (a read was closed): 0.8 s for the cards + 0.9 s. An offer during it is not taken, the next one is.
  const home = await idle();
  await personRead(home, okRead());
  tap(home, home.nodes.get('close'));
  assert.equal(home.context.nucleo.state(), 'RETURNING');
  home.context.nucleoBridge.emit('ask.start', { token: 'tok-1', question });
  assert.equal(asksOf(home).length, 1, 'only their own read was asked');
  home.advance(1.8); await flush();
  assert.equal(home.context.nucleo.state(), 'IDLE', 'home within the 4 s native keeps offering for');
  home.context.nucleoBridge.emit('ask.start', { token: 'tok-1', question });
  assert.deepEqual(asksOf(home).slice(1), [{ token: 'tok-1' }]);
  // HANDBACK (a read just delivered, its row showing) stays for 90 s of the page's clock. Until 2026-10-08 no offer
  // made there was taken ("a board row tapped over a finished read asks nothing"); the first one is, now.
  const read = await idle();
  await personRead(read, okRead());
  assert.equal(read.context.nucleo.state(), 'HANDBACK');
  read.context.nucleoBridge.emit('ask.start', { token: 'tok-2', question });
  assert.equal(read.context.nucleo.state(), 'SENDING');
  assert.deepEqual(asksOf(read).slice(1), [{ token: 'tok-2' }], 'a board row tapped over a finished read asks Bobby');
  // TYPING ("Another question"): the same, the keyboard closes.
  const typing = await idle();
  await personRead(typing, okRead());
  tap(typing, chipsOf(typing)[0]);
  assert.equal(typing.context.nucleo.state(), 'TYPING');
  typing.context.nucleoBridge.emit('ask.start', { token: 'tok-3', question });
  assert.equal(typing.context.nucleo.state(), 'SENDING');
  assert.deepEqual(asksOf(typing).slice(1), [{ token: 'tok-3' }]);
  assert.deepEqual(home.errors.concat(read.errors, typing.errors), []);
});

askStartCases({ confirm:true, test, assert, flush, Element, idle, handBack, personRead, tap, chipsOf, rowOf, asksOf, okRead, synthesis,
  source: (file) => read('../src/' + file), architecture: read('../ARCHITECTURE.md') });

for (const language of ['es','en','fr','pt','it','de']) {
 test(language + ': first launch stays ready without an automatic speaking dial', async () => {
  const app = harness({ language, speaking: { owner:'guest', value:null, offer:true, refine:false } });
  app.boot(); await flush(); app.advance(1.1); await flush();
  assert.equal(app.context.nucleo.state(), 'IDLE');
  assert.equal(app.session.speaking.value,null);
  assert.equal(app.calls.filter(c=>c.method==='speaking.choose').length,0);
  assert.equal(asksOf(app).length,0); assert.deepEqual(app.errors,[]);
 });
}
test('updating readers stay on home; memory opens the dial and label taps change the preview',async()=>{
 const app=harness({speaking:{owner:'a',value:null,offer:false,refine:false}});app.boot();await flush();app.advance(1.1);
 assert.equal(app.context.nucleo.state(),'IDLE');app.context.nucleoBridge.emit('speaking.open',{});
 assert.equal(app.context.nucleo.state(),'SPEAKING_DIAL');
 app.nodes.get('speakingRange').listeners.input({target:{value:'2'}});
 assert.equal(app.nodes.get('speakingRange').getAttribute('aria-valuetext'),'Technical');
 app.nodes.get('speakingConfirm').listeners.click();await flush();app.advance(2);
 assert.equal(app.session.speaking.value,'technical');assert.deepEqual(app.errors,[]);
});
test('failed persistence keeps the dial open and allows retry',async()=>{
 const app=harness({chooseFails:true,speaking:{owner:'a',value:null,offer:true,refine:false}});app.boot();await flush();app.advance(1.1);
 app.context.nucleoBridge.emit('speaking.open',{});
 app.nodes.get('speakingConfirm').listeners.click();await flush();assert.equal(app.context.nucleo.state(),'SPEAKING_DIAL');
 assert.equal(app.nodes.get('speakingError').textContent,'Try again');assert.equal(app.session.speaking.value,null);
});


async function companionReply(app, reply) {
  keyboardOf(app).listeners.click({detail:0,stopPropagation(){}}); app.nodes.get('ta').value = 'What is investing?';
  app.nodes.get('ta').listeners.input();app.nodes.get('taSend').listeners.click({detail:0,stopPropagation(){}});
  await flush(); app.advance(1.2); await flush(); app.answer(reply);
  await flush(); app.advance(1); await flush();
  assert.equal(app.context.nucleo.state(),'COMPANION');
}
const keyboardOf = app => app.nodes.get('ui').children.find(node => node.id === 'conversation-keyboard');
const companionPanel = app => app.nodes.get('ui').children.find(node => node.id === 'companionPanel');
const guideActionsOf = app => app.nodes.get('ui').children.find(node => node.id === 'conversation-slot');

test('a catalog question never covers the market read; revocation leaves the shipped row', async () => {
  const app = await idle();
  await personRead(app, okRead({companionCheckIn:{question:{id:'interest',text:'Interest?',options:[]}}}));
  assert.equal(companionPanel(app).style.display,'none');
  const row = rowOf(app);
  app.context.nucleoBridge.emit('companion.revoked',{});
  app.advance(1);await flush();assert.deepEqual(rowOf(app),row); assert.deepEqual(app.errors,[]);
});
test('companion text stays out of market cards and a follow-up routes with after', async () => {
  const app = await idle({speak:'queued'});
  const id='90d2564c-6064-4275-95cd-5a3c7c0b5b56';
  await companionReply(app,{status:'companion',requestId:id,gist:'Learning.',text:'Learning. Explanation',followUp:'How does bitcoin work?'});
  assert.equal(companionPanel(app).children[0].children[0].textContent,'Learning.');
  app.advance(1); await flush();
  assert.equal(guideActionsOf(app).children.length,1);
  guideActionsOf(app).children[0]._guideAction(); await flush();
  assert.deepEqual(asksOf(app).at(-1),{question:'How does bitcoin work?',companion:true,after:id});
  assert.deepEqual(app.errors,[]);
});
test('companion retry stays available after repeated failures and uses the same id', async () => {
  const app=await idle(); const id='90d2564c-6064-4275-95cd-5a3c7c0b5b56';
  const failure={status:'companion_error',requestId:id,code:'unavailable',retryable:true};
  await companionReply(app,failure);
  for(let i=0;i<2;i++){
   assert.equal(guideActionsOf(app).children.length,1);
   app.advance(15); assert.equal(app.context.nucleo.state(),'COMPANION');
   guideActionsOf(app).children[0]._guideAction(); await flush();
   assert.deepEqual(asksOf(app).at(-1),{retry:id});
   app.advance(1.2);app.answer(failure);await flush();app.advance(1);await flush();
  }
  assert.equal(guideActionsOf(app).children.length,1);assert.deepEqual(app.errors,[]);
});
test('a spoken failure cancelled into a held draft resends only its retry UUID', async () => {
 const app=await idle(),id='90d2564c-6064-4275-95cd-5a3c7c0b5b56';
 await companionReply(app,{status:'companion_error',requestId:id,code:'unavailable',retryable:true,questionSpoken:true});
 tap(app,app.nodes.get('close'));await flush();assert.equal(app.context.nucleo.state(),'HELD_DRAFT');
 tap(app,app.nodes.get('pill'));await flush();assert.deepEqual(asksOf(app).at(-1),{retry:id});assert.deepEqual(app.errors,[]);
});
for (const input of ['type','speech']) test(`${input}: the next question is never an answer to a hidden personal question`, async () => {
 const app=await idle();const id='90d2564c-6064-4275-95cd-5a3c7c0b5b56';
 await companionReply(app,{status:'companion',requestId:id,text:'Explanation',companionCheckIn:{question:{id:'interest',text:'Interest?',options:[]}}});
 if(input==='type'){
  keyboardOf(app)._guideAction();app.nodes.get('ta').value='What is a share?';app.nodes.get('ta').listeners.input();app.nodes.get('taSend').listeners.click({detail:0,stopPropagation(){}});
 }else{
  app.session.mic.state='granted';tap(app,app.nodes.get('pill'));await flush();
  app.context.nucleoBridge.emit('speech.partial',{text:'What is a share?'});
  tap(app,app.nodes.get('pill'));app.context.nucleoBridge.emit('speech.final',{text:'What is a share?'});
 }
 await flush();assert.equal(asksOf(app).at(-1).question,'What is a share?');
 assert.equal(asksOf(app).at(-1).after,id);
 assert.equal(app.calls.filter(c=>c.method==='companion.answer').length,0);assert.deepEqual(app.errors,[]);
});
for (const input of ['type','speech']) test(`${input}: closing the composer keeps the same answer without personal controls`, async () => {
 const app=await idle();await companionReply(app,{status:'companion',text:'Explanation',companionCheckIn:{question:{id:'interest',text:'Interest?',options:[]}}});
 if(input==='type'){keyboardOf(app)._guideAction();app.nodes.get('ta').listeners.keydown({key:'Escape',preventDefault(){}});}
 else{app.session.mic.state='granted';tap(app,app.nodes.get('pill'));await flush();tap(app,app.nodes.get('close'));}
 await flush();assert.equal(app.context.nucleo.state(),'COMPANION');
 assert.equal(app.calls.filter(c=>c.method==='companion.answer').length,0);
 assert.equal(companionPanel(app).children[0].children[1].textContent,'Explanation');assert.deepEqual(app.errors,[]);
});
test('cancelling dictation over an answer discards the words and leaves the same answer',async()=>{
 const app=await idle();await companionReply(app,{status:'companion',text:'Explanation'});
 app.session.mic.state='granted';tap(app,app.nodes.get('pill'));await flush();
 app.context.nucleoBridge.emit('speech.partial',{text:'my words'});tap(app,app.nodes.get('close'));await flush();
 assert.equal(app.context.nucleo.state(),'COMPANION');assert.equal(asksOf(app).length,1);assert.deepEqual(app.errors,[]);
});
test('a closing explanation has no disclosure, no default invitation and no personal choices',async()=>{
 const app=await idle({speak:'queued'});
 await companionReply(app,{status:'companion',requestId:'90d2564c-6064-4275-95cd-5a3c7c0b5b56',gist:'Understood.',text:'Understood.',followUp:null});
 app.advance(10);await flush();assert.equal(guideActionsOf(app).children.length,0);
 assert.equal(companionPanel(app).children[1].style.display,'none');assert.deepEqual(app.errors,[]);
});
test('the fact fixture is separate from narration and retains its source and year', async () => {
  const app=await idle();const fixture=JSON.parse(read('../fixtures/native/companion-explanation-fact.json'));
  await companionReply(app,{status:'companion',requestId:fixture.requestId,text:fixture.reply.text,fact:fixture.fact});
  assert.equal(companionPanel(app).children[0].children[2].textContent,fixture.fact.text+'\n'+fixture.fact.source+' · '+fixture.fact.year);
  assert.equal(app.calls.filter(c=>c.method==='speak').at(-1).params.text,fixture.reply.text);
  assert.deepEqual(app.errors,[]);
});

function leaveAndReturn(app){app.context.nucleoBridge.emit('app.state',{state:'background'});app.context.nucleoBridge.emit('app.state',{state:'active'});}
test('A10: typed background keeps exact Unicode words without any send',async()=>{
 const app=await idle();app.nodes.get('ui').children.find(node=>node.id==='conversation-keyboard')._guideAction();app.nodes.get('ta').value='¿Qué es un ETF? 123,45 €';
 leaveAndReturn(app);app.advance(12);await flush();
 assert.equal(app.context.nucleo.state(),'TYPING');assert.equal(app.nodes.get('ta').value,'¿Qué es un ETF? 123,45 €');assert.equal(asksOf(app).length,0);assert.deepEqual(app.errors,[]);
});
test('A10: tap capture cut by background becomes a stopped held draft and rejects the late final',async()=>{
 const app=await idle();app.session.mic.state='granted';tap(app,app.nodes.get('pill'));await flush();
 app.context.nucleoBridge.emit('speech.partial',{text:'my complete words'});leaveAndReturn(app);
 app.context.nucleoBridge.emit('speech.final',{text:'late words'});app.advance(12);await flush();
 assert.equal(app.context.nucleo.state(),'HELD_DRAFT');assert.equal(app.nodes.get('ui').children.find(node=>node.id==='conversation-draft').textContent,'my complete words');assert.ok(app.nodes.get('hint').textContent.includes('Your question is still here'));assert.equal(asksOf(app).length,0);assert.deepEqual(app.errors,[]);
});
test('A10: background keeps the failure and retry id, then explicit retry uses it',async()=>{
 const app=await idle(),id='90d2564c-6064-4275-95cd-5a3c7c0b5b56';
 await companionReply(app,{status:'companion_error',requestId:id,code:'unavailable',retryable:true});
 leaveAndReturn(app);app.advance(12);await flush();assert.equal(app.context.nucleo.state(),'COMPANION');assert.equal(guideActionsOf(app).children.length,1);
 guideActionsOf(app).children[0]._guideAction();await flush();assert.deepEqual(asksOf(app).at(-1),{retry:id});assert.deepEqual(app.errors,[]);
});
test('A10: background keeps the answer and drops an invitation that has not arrived',async()=>{
 const app=await idle({speak:'queued'});
 await companionReply(app,{status:'companion',requestId:'90d2564c-6064-4275-95cd-5a3c7c0b5b56',gist:'First sentence.',text:'First sentence. More detail.',followUp:'Next question?',questionSpoken:true});
 leaveAndReturn(app);app.advance(12);await flush();
 assert.equal(app.context.nucleo.state(),'COMPANION');assert.equal(companionPanel(app).children[0].children[0].textContent,'First sentence.');assert.equal(guideActionsOf(app).children.length,0);assert.equal(asksOf(app).length,1);assert.deepEqual(app.errors,[]);
});
