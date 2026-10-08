import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { askStartCases } from '../../../ios/Bobby/Nucleo/tests/ask-start.cases.mjs';

const source = await readFile(new URL('../src/shared/10-bridge.js', import.meta.url), 'utf8');

function bridge() {
  const requests = [], timers = new Map();
  let timerId = 0;
  const window = { BobbyNucleo: { postMessage(raw) { requests.push(JSON.parse(raw)); } } };
  vm.runInNewContext(source, {
    window, Promise, setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  });
  return { api: window.nucleoBridge, requests, timers };
}

test('Android request is correlated with one asynchronous JSON reply', async () => {
  const { api, requests, timers } = bridge();
  assert.equal(api.native, true);
  const result = api.call('ask', { question: 'BTC?' });
  assert.deepEqual(requests, [{ id: '1', v: 1, method: 'ask', params: { question: 'BTC?' } }]);
  api.receive('1', { v: 1, ok: true, result: { status: 'confirm', token: 'opaque' } });
  assert.deepEqual(await result, { status: 'confirm', token: 'opaque' });
  assert.equal(timers.size, 0);
  api.receive('1', { v: 1, ok: true, result: { status: 'ok' } }); // A late duplicate has no effect.
});

test('unknown methods are refused before they cross the native transport', async () => {
  const { api, requests } = bridge();
  await assert.rejects(api.call('fetchSecret', {}), { code: 'unknown_method' });
  assert.equal(requests.length, 0);
});

test('protocol faults and malformed native replies remain errors', async () => {
  const { api, requests } = bridge();
  const fault = api.call('session', {});
  api.receive(requests[0].id, { v: 1, ok: false, error: { code: 'forbidden', message: 'main frame required' } });
  await assert.rejects(fault, { code: 'forbidden' });
  const malformed = api.call('session', {});
  api.receive(requests[1].id, { v: 2, ok: true, result: {} });
  await assert.rejects(malformed, { code: 'bad_reply' });
});

test('a missing native reply times out without retaining a pending request', async () => {
  const { api, timers } = bridge();
  const result = api.call('session', {});
  const timeout = [...timers.values()][0];
  timeout();
  await assert.rejects(result, { code: 'timeout' });
  api.receive('1', { v: 1, ok: true, result: {} });
});


test('account and withdrawn-consent events reach the Android page without crossing transport', () => {
  const { api, requests } = bridge();
  const events = [];
  const off = api.on('account.changed', payload => events.push(['account', payload]));
  api.on('consent.withdrawn', payload => events.push(['consent', payload]));
  api.emit('account.changed', { signedIn: false });
  api.emit('consent.withdrawn', {});
  off();
  api.emit('account.changed', { signedIn: true });
  assert.deepEqual(events, [['account', { signedIn: false }], ['consent', {}]]);
  assert.equal(requests.length, 0);
});

test('a development transport cannot replace the Android native transport', async () => {
  const { api, requests } = bridge();
  let replaced = false;
  api.installTransport(() => { replaced = true; });
  const result = api.call('session', {});
  assert.equal(requests.length, 1);
  api.receive(requests[0].id, { v: 1, ok: true, result: { platform: 'android' } });
  assert.equal((await result).platform, 'android');
  assert.equal(replaced, false);
});

test('visible-read request carries only its UUID and accepts an honest negative native acknowledgment', async () => {
  const { api, requests } = bridge();
  const requestId = '92d74f61-43e7-4e1a-99f7-124a0b107f09';
  const result = api.call('read.rendered', { requestId });
  assert.deepEqual(requests, [{ id: '1', v: 1, method: 'read.rendered', params: { requestId } }]);
  api.receive('1', { v: 1, ok: true, result: { accepted: false } });
  assert.deepEqual(await result, { accepted: false });
});

test('the nudge crosses the Android transport as two reports and native starts a read with one event', async () => {
  const { api, requests } = bridge();
  const seen = api.call('nudge.seen', { id: 'credits.low.2026-w41' });
  const tapped = api.call('nudge.act', { id: 'credits.low.2026-w41' });
  assert.deepEqual(requests.map(request => [request.method, request.params]), [
    ['nudge.seen', { id: 'credits.low.2026-w41' }],
    ['nudge.act', { id: 'credits.low.2026-w41' }],
  ]);
  // Native answers what it counted and whether the nudge is still its own; the page never decides either.
  api.receive(requests[0].id, { v: 1, ok: true, result: { count: 2, active: true } });
  api.receive(requests[1].id, { v: 1, ok: true, result: { status: 'done' } });
  assert.deepEqual(await seen, { count: 2, active: true });
  assert.deepEqual(await tapped, { status: 'done' });
  const starts = [];
  api.on('ask.start', payload => starts.push(payload));
  api.emit('ask.start', { token: 'single-use', question: 'What changed in NVDA since I asked?' });
  assert.deepEqual(starts, [{ token: 'single-use', question: 'What changed in NVDA since I asked?' }]);
  // The page has no method to open a 1.8 screen by itself: only openNative, which native checks.
  await assert.rejects(api.call('present', { route: 'credits' }), { code: 'unknown_method' });
  assert.equal(requests.length, 2);
});

// =====================================================================================================
// The shipping engine over the Android transport (the cases of ios/Bobby/Nucleo/tests/bridge-boot.test.mjs
// for the next question, ios/Bobby/Nucleo/ARCHITECTURE.md §3.5). The page's real sources run in a small DOM;
// every call leaves through window.BobbyNucleo.postMessage as a JSON string and is answered through
// nucleoBridge.receive, as NucleoWebView does. This verifies what the page asks and draws, not WebView
// layout, canvas rendering or a real account.
// =====================================================================================================
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const locale = read('../src/shared/05-locale.js');
const readModel = read('../src/shared/20-read-model.js');
const template = read('../src/app/template.html');
const engine = readdirSync(new URL('../src/app/', import.meta.url)).filter((name) => name.endsWith('.js')).sort().map((name) => read('../src/app/' + name)).join('\n');
// The roster as NucleoSession.roster() hands it over: the bundled catalog with one language folded in.
const catalog = JSON.parse(read('../../app/src/main/assets/nucleo/roster.json')).companions;
const rosterFor = (language) => ({ companions: catalog.map(({ localized, ...companion }) => ({ ...companion, ...localized[language], unlocked: true })) });
const momo = catalog.find((companion) => companion.id === 'momo');
assert.ok(momo, 'the bundled roster must include Momo');

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
  getContext() { return null; } // The engine's supported no-WebGL fallback.
  closest(selector) { return selector === '[data-hit]' && this.attributes['data-hit'] ? this : null; }
  contains() { return true; }
  focus() {}
  blur() {}
}

function android({ language = 'en', suggestions = { v: 1, quickAccess: [] }, holdAsks = false, measure = null,
  theses = { v: 1, items: [] }, saved = null, speak = 'muted' } = {}) {
  const nodes = new Map(), calls = [], errors = [], pending = [];
  const made = () => Object.assign(new Element(), { measure });
  for (const match of template.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    const attributes = Object.fromEntries([...match[0].matchAll(/([\w-]+)="([^"]*)"/g)].map((entry) => [entry[1], entry[2]]));
    nodes.set(match[1], new Element(attributes));
  }
  nodes.get('companions').textContent = JSON.stringify([{ id: momo.webId, dataUri: 'data:image/png;base64,AA==' }]);
  // The session as NucleoSession.snapshot() builds it for a signed-out reader who accepted notice 6.
  const session = {
    v: 1, page: 'app', onboarded: true, firstRun: false, language, locale: language === 'es' ? 'es-MX' : 'en-US', country: null, localHour: 9,
    companion: { id: momo.id, webId: momo.webId, label: momo.label, palette: momo.palette, voicePersona: momo.voicePersona },
    xp: 0, level: { number: 1, name: 'ROOKIE', progress: 0.2, nextMinXP: 50 }, streak: 0, aura: null, pendingAwards: 0, syncedAt: null,
    voicePreference: 'companion', signedIn: false, riskAccepted: true, riskVersion: 6, muted: false, reducedMotion: false,
    mic: { state: 'undetermined', onDevice: true }, hints: {}, pendingRead: null, fixtures: false,
    platform: 'android', appVersion: '1.2.0 (10)', nudge: null,
    analysisLevel: { id: 'rapido', label: language === 'es' ? 'Rápido' : 'Quick', color: '#F2EDE4' },
  };
  const document = {
    hidden: false, documentElement: {}, addEventListener() {},
    fonts: { ready: Promise.resolve(), load: () => Promise.resolve([]) },
    getElementById(id) { assert.ok(nodes.has(id), 'missing template element ' + id); return nodes.get(id); },
    createElement: made, createElementNS: made,
    createTextNode(text) { const node = new Element(); node.textContent = text; return node; },
  };
  let now = 0, nextFrame;
  const reply = (id, result) => Promise.resolve().then(() => context.nucleoBridge.receive(id, { v: 1, ok: true, result }));
  const context = vm.createContext({
    document, location: { search: '' }, innerWidth: 412, innerHeight: 915, devicePixelRatio: 2.625,
    matchMedia: () => ({ matches: false }), addEventListener() {},
    console: { error(...args) { const message = args.map((value) => value?.stack || String(value)).join(' '); if (!errors.includes(message)) errors.push(message); }, warn() {} },
    performance: { now: () => now }, getComputedStyle: () => ({ whiteSpace: 'normal' }),
    setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame(callback) { nextFrame = callback; }, Image: class {},
    // NucleoWebView's listener: one JSON string per call, answered later by id.
    BobbyNucleo: { postMessage(raw) {
      assert.equal(typeof raw, 'string', 'the Android transport carries text');
      const envelope = JSON.parse(raw);
      calls.push({ method: envelope.method, params: envelope.params });
      // A read the test answers itself (answer()), read silently so the page's own clock runs it.
      if (holdAsks && envelope.method === 'ask') { pending.push((result) => reply(envelope.id, result)); return; }
      if (holdAsks && envelope.method === 'speak') { reply(envelope.id, { status: speak }); return; }
      reply(envelope.id, { session, roster: rosterFor(language), theses, island: { v: 1, available: false }, suggestions, saveThesis: saved,
        'nudge.seen': { count: 1, active: true }, 'nudge.act': { status: 'done' }, 'read.rendered': { accepted: false } }[envelope.method] || { v: 1, opened: true });
    } },
  });
  context.window = context;
  vm.runInContext(locale + '\n' + source + '\n' + readModel, context, { filename: 'shipping-shared.js' });
  return {
    context, calls, errors, nodes, session,
    boot() { vm.runInContext(engine, context, { filename: 'shipping-app.js' }); },
    answer(result) { assert.ok(pending.length, 'no ask is waiting'); pending.shift()(JSON.parse(JSON.stringify(result))); },
    advance(seconds) { for (let index = 0; index < Math.ceil(seconds * 60); index++) { now += 1000 / 60; nextFrame(now); } },
  };
}
async function flush() { for (let index = 0; index < 40; index++) await Promise.resolve(); }

const chipsOf = (app) => app.nodes.get('chipRow').children.filter((node) => node.getAttribute('data-hit') === 'chip');
const nudgeChips = (app) => chipsOf(app).filter((node) => /\bnudge\b/.test(node.className || ''));
const nvda = JSON.parse(read('./fixtures/ask/nvda.json'));
const READ_ID = '11111111-1111-4111-8111-111111111111';
const synthesis = (followUp) => ({ headline: 'The trend is firm.', why: 'W.', risk: 'R.', watch: 'X.', ...(followUp === undefined ? {} : { followUp }) });
const okRead = (extra = {}) => ({ ...nvda, requestId: READ_ID, ...extra });
// What NucleoSession.suggestions() sends: every entry says whether the person asked about it.
const OWN = { v: 1, quickAccess: [{ symbol: 'NVDA', own: true }, { symbol: 'BTC', own: true }, { symbol: 'ETH', own: true }], movers: [{ symbol: 'TSLA', name: 'Tesla', changePct: 4.1 }] };
const rowOf = (app) => chipsOf(app).map((node) => node.textContent);
const asksOf = (app) => app.calls.filter((call) => call.method === 'ask').map((call) => call.params);
const tap = (app, node) => app.nodes.get('stage').listeners.click({ target: node, detail: 0 });
async function idle(options = {}) {
  const { seed, ...rest } = options;
  const app = android({ holdAsks: true, suggestions: OWN, ...rest });
  if (seed) seed(app.session);
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
// The person picks one of their own assets on the idle home (a chip: Bobby wrote its question).
async function personRead(app, reply) { tap(app, chipsOf(app)[0]); await handBack(app, reply); }

test('the shipping engine boots over the Android transport and reaches its idle home', async () => {
  const app = android();
  app.boot(); await flush();
  assert.deepEqual(app.calls[0], { method: 'session', params: { page: 'app' } });
  assert.equal(app.context.nucleoBridge.native, true);
  assert.equal(app.context.nucleo.session().platform, 'android');
  app.advance(1.2); await flush();
  assert.equal(app.context.nucleo.state(), 'IDLE');
  assert.deepEqual(app.errors, []);
});

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
    assert.deepEqual(asksOf(app).slice(before), [{ followUpOf: READ_ID, question: copy.question }], 'the existing follow-up path: no asset, no new method, no mark');
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
    const movers = { v: 1, quickAccess: [{ symbol: 'NVDA', own: true }], movers: [{ symbol: 'TSLA', name: 'Tesla', changePct: 4.1 }, { symbol: 'AAPL', name: 'Apple', changePct: 2.2 }] };
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
      assert.deepEqual(asksOf(app), [{ token: 'tok-1' }], 'only the token travels');
      assert.deepEqual(rowOf(app), row);
      assert.ok(!rowOf(app).some((label) => /TSLA|AAPL/.test(label)));
      assert.deepEqual(app.errors, []);
    }
    // With assets of their own the row is the usual one.
    const app = await idle({ language });
    app.context.nucleoBridge.emit('ask.start', { token: 'tok-2', question: 'q' });
    await handBack(app, okRead({ language, synthesis: synthesis(copy.question) }));
    assert.deepEqual(rowOf(app), [copy.question, copy.another, copy.own[0]]);
    // The default tickers of a reader who never asked about them only pad the row (`own: false`): not theirs.
    const starters = { v: 1, quickAccess: [{ symbol: 'NVDA', own: true }, { symbol: 'BTC', own: false }, { symbol: 'ETH', own: false }], movers: [] };
    const padded = await idle({ language, suggestions: starters });
    padded.context.nucleoBridge.emit('ask.start', { token: 'tok-3', question: 'q' });
    await handBack(padded, okRead({ language, synthesis: synthesis(copy.question) }));
    assert.deepEqual(rowOf(padded), [copy.question, copy.another], 'a starter is not one of their assets');
  });
}

test('the thread Bobby started stays his: its next question, asked, still ends without a mover; a new question of the person does not', async () => {
  const movers = { v: 1, quickAccess: [{ symbol: 'NVDA', own: true }], movers: [{ symbol: 'TSLA', name: 'Tesla', changePct: 4.1 }] };
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
  // .chip.ask is two 19 px lines + 20 px + the hairline; the WebView reports a third line as 78 px
  const measure = (node) => (/\bask\b/.test(node.className || '') ? (node.textContent.length > 70 ? 78 : 59) : undefined);
  const long = 'Why does NVDA keep holding above its support while the volume fades week after week?';
  assert.ok(long.length <= android().context.NucleoReadModel.NEXT.max, 'the read model lets it through: only the drawn chip can tell');
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
  const app = android({ holdAsks: true, suggestions: { v: 1, quickAccess: [{ symbol: 'NVDA', own: true }], movers: [{ symbol: 'TSLA', name: 'Tesla', changePct: 4.1 }] } });
  app.session.pendingRead = okRead({ synthesis: synthesis(NEXT.en.question) });
  app.boot(); await flush(); app.advance(0.2); await flush();
  assert.equal(app.context.nucleo.state(), 'HANDBACK');
  app.advance(1.0); await flush();
  assert.deepEqual(rowOf(app), [NEXT.en.question, 'Another question about NVDA']);
  assert.deepEqual(app.errors, []);
});

// ---- a chip whose question Bobby wrote says so when it asks: native then never takes it for a question the
// person asked by themselves, so it starts no chain of follow-ups (NucleoAsk.kt: ReadOrigin.CHIP) ----
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
  const movers = await idle({ suggestions: { v: 1, quickAccess: [{ symbol: 'NVDA', own: true }], movers: [{ symbol: 'TSLA', name: 'Tesla', changePct: 4.1 }] } });
  await personRead(movers, okRead());
  tap(movers, chipsOf(movers)[1]);
  assert.deepEqual(asksOf(movers)[1], { question: 'How is TSLA looking?', chip: true });
  // Their own words carry no mark: the CIO's question (native knows it by its words), and what they type.
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
  const app = android({ holdAsks: true, suggestions: OWN });
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
  const onboarding = read('../src/onboarding/60-fsm.js');
  const body = onboarding.match(/function firstAsk\(\)\{[^\n]+\}/);
  assert.ok(body, 'firstAsk() is one line of the onboarding engine');
  const firstAsk = (W) => JSON.parse(JSON.stringify(vm.runInNewContext('(' + body[0].replace('function firstAsk', 'function') + ')()', { W })));
  assert.deepEqual(firstAsk({ qSrc: 'chip', question: 'How is NVDA looking?' }), { question: 'How is NVDA looking?', chip: true });
  for (const qSrc of ['voice', 'type', '']) assert.deepEqual(firstAsk({ qSrc, question: 'Is NVDA expensive?' }), { question: 'Is NVDA expensive?' }, qSrc);
  assert.equal(onboarding.split('startAsk(firstAsk())').length, 3, 'both places the first question is asked from');
  assert.doesNotMatch(onboarding, /startAsk\(\{ ?question:/, 'no ask of a first question goes round it');
  // A first question has three sources, and one of them is a chip.
  const sources = [...onboarding.matchAll(/commitQuestion\([^,()]+, '(\w+)'\)/g)].map((match) => match[1]).sort();
  assert.equal(sources.length, 3);
  assert.deepEqual(sources.filter((src) => src === 'chip'), ['chip']);
  assert.ok(sources.includes('voice'));
});

// ---- A read native starts, state by state, and what is drawn under a native sheet: the iPhone's cases, run against
// this copy of the page over the Android transport (ios/Bobby/Nucleo/ARCHITECTURE.md §9.5 has the table). ----
askStartCases({ test, assert, flush, Element, idle, handBack, personRead, tap, chipsOf, rowOf, asksOf, okRead, synthesis,
  source: (file) => read('../src/' + file), architecture: read('../../../ios/Bobby/Nucleo/ARCHITECTURE.md') });

test('what decides where a read native starts is the iPhone’s, character for character', () => {
  const ios = (file) => read('../../../ios/Bobby/Nucleo/src/app/' + file), here = (file) => read('../src/app/' + file);
  // askStart and its table of states (with the nudge code it sits beside).
  const cut = (text) => text.slice(text.indexOf('/* ---- the nudge:'), text.indexOf('function receiveSuggestions'));
  assert.ok(cut(here('55-read.js')).includes('var ASK_FROM = {') && cut(here('55-read.js')).includes('function askStart(p){'));
  assert.equal(cut(here('55-read.js')), cut(ios('55-read.js')));
  // The turn back to the Desk face it leans on, and how a row of chips is born and taken away.
  const face = (text) => text.slice(text.indexOf('/* the sphere turns back to its Desk face'), text.indexOf('STATES.FACES = {'));
  assert.ok(face(here('60-fsm.js')).includes('function deskFace(){'));
  assert.equal(face(here('60-fsm.js')), face(ios('60-fsm.js')));
  const row = (text) => text.slice(text.indexOf('/* ---- chips: born from the pill'), text.indexOf('function oneTapOff'))
    + text.slice(text.indexOf('function chipsHide('), text.indexOf('/* ---- the live transcript'));
  assert.ok(row(here('55-read.js')).includes('op(c.el, 0)'));
  assert.equal(row(here('55-read.js')), row(ios('55-read.js')));
  assert.equal(here('30-dom.js'), ios('30-dom.js'), 'the DOM helpers and the belt are one file');
});
