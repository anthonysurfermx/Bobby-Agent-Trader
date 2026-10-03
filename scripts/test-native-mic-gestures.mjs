#!/usr/bin/env node
// Run the shipping input listeners and microphone state transitions without device permissions.
// --source-ref=HEAD executes the same assertions against an immutable pre-fix revision.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const ref = process.argv.find(x => x.startsWith('--source-ref='))?.split('=')[1];
const sources = new Map();
const read = path => { if (!sources.has(path)) sources.set(path, ref ? execFileSync('git', ['show', `${ref}:${path}`], { cwd: root, encoding: 'utf8' }) : readFileSync(root + path, 'utf8')); return sources.get(path); };
const requestedSurface = process.argv.find(x => x.startsWith('--surface='))?.split('=')[1];
assert.ok(!requestedSurface || ['native', 'web'].includes(requestedSurface), 'surface must be native or web');
let base = 'ios/Bobby/Nucleo/src/', surfaceName = 'native';
let checks = 0, failed = 0;
function check(label, fn) { try { fn(); checks++; } catch (e) { failed++; console.error(`FAIL ${surfaceName}/${label}: ${e.message}`); } }
function fn(source, name) {
  const start = source.indexOf(`function ${name}(`), open = source.indexOf('{', start);
  assert.ok(start >= 0, name);
  let depth = 1, end = open + 1;
  while (depth) { depth += (source[end] === '{') - (source[end] === '}'); end++; }
  return source.slice(start, end);
}
class Surface {
  constructor(id, hit = null, tagName = 'BUTTON') { this.id = id; this.hit = hit; this.tagName = tagName; this.listeners = {}; this.style = {}; this.value = ''; this.focusCount = 0; this.classList = { contains: () => false, add() {}, remove() {} }; }
  addEventListener(name, call, options) { (this.listeners[name] ||= []).push({ call, options }); }
  emit(name, values = {}) { const e = { target: this, cancelable: true, detail: 1, isPrimary: true, pointerId: 1, clientX: 195, clientY: 770, prevented: false, preventDefault() { this.prevented = true; }, ...values }; for (const l of this.listeners[name] || []) l.call(e); return e; }
  closest(selector) { if (selector === '[data-hit]') return this.hit ? this : null; if (selector === '#typeBox') return this.id.startsWith('type') || this.id === 'ta' ? this : null; return null; }
  getAttribute(name) { return name === 'data-hit' ? this.hit : null; }
  getBoundingClientRect() { return { left: 147, top: 742, width: 96, height: 56 }; }
  contains() { return true; }
  setPointerCapture(id) { this.captured = id; }
  releasePointerCapture(id) { if (this.captured === id) this.captured = null; }
  focus() { this.focusCount++; }
  blur() {}
}
function animation() { return new Proxy({ x: 0, t: 0, to() {}, set() {}, tween() {}, moving: () => false }, { get(target, key) { if (!(key in target)) target[key] = animation(); return target[key]; } }); }
// native: what the bridge answers now. `fresh` = speech.permission (default: the cached state), `prompt` = the state
// speech.requestPermission resolves with (the OS prompts and the Apple speech service alert), `start` = speech.start,
// `wait` = a promise that keeps that alert on screen until the test answers it.
function world(page, language = 'de', permission = 'granted', pointer = true, delayedStart = false, native = {}) {
  const doc = new Surface('document', null, 'DOCUMENT'), win = new Surface('window', null, 'WINDOW'), stage = new Surface('stage', null, 'DIV');
  const pill = new Surface('pill', 'pill'), ta = new Surface(page === 'app' ? 'ta' : 'typeIn', null, 'TEXTAREA'), typeBox = new Surface('typeBox', null, 'DIV'), send = new Surface('typeSend');
  const elements = { pill, typeBox, typeIn: ta, typeSend: send, rbody: new Surface('rbody', null, 'DIV') };
  const calls = [], transitions = [], hints = [], errors = [], timers = [], starts = [];
  let realTime = 1000;
  const c = { window: win, document: doc, D: doc, stage, pill, HARNESS: false, SCRIPTED: false, RM: true, T: 1, clk: 1, fitS: 1, fitX: 0, fitY: 0, FIT: 1, FIT_X: 0, FIT_Y: 0,
    performance: { now: () => realTime }, setTimeout() {}, clamp: (v, a, b) => Math.max(a, Math.min(b, v)), lerp: (a, b, p) => a + (b - a) * p, noop() {},
    A: animation(), U: animation(), S: animation(), E: {}, BODY: {}, SPEECH: {}, STATES: {}, ENTER: {}, ST: { name: 'IDLE' }, GEN: 0, idleMode: () => 'mic', SESSION: { mic: { state: permission } }, SES: { mic: { state: permission } },
    el: { pill, ta, typeBox, taSend: send }, $: id => elements[id] || new Surface(id), CARDS: [], cardD: null, DSCROLL: { max: 0 }, RISK_LAYOUT: null, RISK_NOTICE: null,
    tick() {}, at(seconds, run) { timers.push({ at: realTime + seconds * 1000, run }); }, after() {}, cue() {}, chromeUp() {}, readShowing: () => false, lineShown: () => false, txReset() {}, txText: () => '', txSet() {}, meriOut() {}, hint: value => hints.push(value),
    pillMode() {}, clearRead() {}, glassHome() {}, moveSphere() {}, tintHome() {}, greetOut() {}, noteOut() {}, att() {}, st() {}, logErr: (where, e) => errors.push(`${where}: ${e.message}`),
    to() {}, tg() {}, tb() {}, isOn: () => false, setPill() {}, setHint: value => hints.push(value), capGone() {}, buzz() {}, fin: Number.isFinite, closeActive: () => false, typeSubmit() { calls.push({ method: 'typed.send' }); }, typeCancel() { calls.push({ method: 'typed.cancel' }); },
    sc() {}, f1: String, f3: String, c01: v => Math.max(0, Math.min(1, v)), TR: false, tmB: () => 0,
    bcall: bridge,
    call: bridge,
    fire: (method, params) => calls.push({ method, params }),
    W: page === 'app' ? win : { state: 'ASK_TEACH', press: null, listenSeq: 0, pr: {}, lean: {}, micBreath: true, txShift: {}, track: {} },
  };
  function bridge(method, params) {
    calls.push({ method, params });
    if (method === 'speech.start' && delayedStart) return new Promise(resolve => starts.push(resolve));
    if (method === 'speech.permission') return native.fresh === 'error' ? Promise.reject(new Error('test permission failure')) : Promise.resolve({ state: native.fresh || permission, onDevice: false });
    if (method === 'speech.requestPermission' && native.wait) return native.wait.then(() => ({ state: native.prompt || 'granted', onDevice: false }));
    if (method === 'speech.requestPermission') return Promise.resolve({ state: native.prompt || 'granted', onDevice: false });
    return Promise.resolve({ status: method === 'speech.start' ? (native.start || 'listening') : 'idle' });
  }
  if (pointer) win.PointerEvent = function() {};
  doc.elementFromPoint = () => pill;
  const ctx = vm.createContext(c);
  vm.runInContext(read(base + page + '/40-strings.js'), ctx);
  ctx.LANG = language;
  const fsm = read(base + page + '/60-fsm.js');
  if (page === 'app') {
    vm.runInContext(fsm.slice(fsm.indexOf('function pillDown('), fsm.indexOf('/* ---------- TYPING:')) + '\n' + fn(fsm, 'openTyping'), ctx);
    c.STATES.IDLE = { down: (hit, p) => hit === 'pill' ? c.pillDown(p) : null };
    c.STATES.TYPING = { send() { calls.push({ method: 'typed.send' }); }, cancel() { c.ST.name = 'IDLE'; } };
    c.go = (name, data = {}) => { const previous = c.ST.name; c.ST.name = name; transitions.push(name); if (data.hint) hints.push(c.tt(data.hint)); if (name === 'LISTENING') c.STATES.LISTENING.enter(previous, data); };
    vm.runInContext(read(base + 'app/70-input.js'), ctx);
  } else {
    vm.runInContext(fsm.slice(fsm.indexOf('function askCapable('), fsm.indexOf('ENTER.PRE_PERMISSION =')) + '\n' + fn(fsm, 'permContinue') + '\n' + fn(fsm, 'stopListening') + '\n' + fn(fsm, 'endListenVisual'), ctx);
    c.go = (name, data = {}) => { c.W.state = name; transitions.push(name); if (data.hint) hints.push(data.hint); if (name === 'TYPING') c.focusType(); };
    vm.runInContext(read(base + 'onboarding/90-input.js'), ctx);
  }
  return { c, stage, win, doc, pill, ta, calls, transitions, hints, errors, starts,
    speech: () => calls.filter(x => x.method.startsWith('speech.')).map(x => x.method),
    mic: () => (page === 'app' ? c.SES : c.SESSION).mic.state,
    lastHint: key => assert.equal(hints.at(-1), page === 'app' ? c.tt(key) : c.Ls(key)),
    input: page === 'app' ? stage : win,
    advance(seconds) { realTime += seconds * 1000; c.clk += seconds; c.T += seconds; for (let i = 0; i < timers.length;) { if (timers[i].at <= realTime) timers.splice(i, 1)[0].run(); else i++; } },
    flush: async () => { await Promise.resolve(); await Promise.resolve(); },
    state: () => page === 'app' ? c.ST.name : c.W.state,
  };
}
const languages = ['de', 'it', 'en', 'es', 'fr', 'pt'];
for (const surface of requestedSurface ? [requestedSurface] : ['native', 'web']) {
base = surface === 'native' ? 'ios/Bobby/Nucleo/src/' : 'nucleo/src/'; surfaceName = surface;
for (const page of ['app', 'onboarding']) for (const language of languages) {
  for (const permission of ['denied', 'restricted', 'unavailable', 'undetermined', 'error']) {
    const result = world(page, language, 'undetermined');
    const permissionCall = method => { result.calls.push({ method }); return permission === 'error' ? Promise.reject(new Error('test permission failure')) : Promise.resolve({ state: permission }); };
    result.c.bcall = permissionCall; result.c.call = permissionCall;
    if (page === 'app') { result.c.ST.name = 'PRE_PERMISSION'; result.c.STATES.PRE_PERMISSION.cont(); }
    else { result.c.W.state = 'PRE_PERMISSION'; result.c.permContinue(); }
    await result.flush();
    check(`${page}/${language}/${permission} permission reply preserves viewport and explicit typing`, () => { assert.equal(result.ta.focusCount, 0); assert.equal(result.state(), page === 'app' ? 'IDLE' : 'ASK_TEACH'); assert.equal(result.hints.at(-1), page === 'app' ? result.c.tt('hint.micOff') : result.c.Ls('hint.micOff')); assert.equal(result.calls.filter(x => x.method === 'speech.requestPermission').length, 1); });
  }
  for (const [answer, typed] of [['granted', 0], ['consent', 1]]) {
    const card = world(page, language, 'undetermined', true, false, { prompt: answer });
    if (page === 'app') { card.c.ST.name = 'PRE_PERMISSION'; card.c.STATES.PRE_PERMISSION.cont(); }
    else { card.c.W.state = 'PRE_PERMISSION'; card.c.permContinue(); }
    await card.flush();
    check(`${page}/${language} permission card: Apple speech prompt answered ${answer === 'granted' ? 'allow keeps the keyboard closed' : 'type opens typing'}`, () => { assert.equal(card.mic(), answer); assert.equal(card.ta.focusCount, typed); assert.equal(card.state() === 'TYPING', typed === 1); assert.deepEqual(card.speech(), ['speech.requestPermission']); });
  }
  for (const permission of ['denied', 'restricted', 'unavailable']) {
    const w = world(page, language, permission);
    w.input.emit('pointerdown', { target: w.pill }); w.advance(0.3); await w.flush();
    check(`${page}/${language}/${permission} hold provides localized feedback before release`, () => { assert.equal(w.hints.at(-1), page === 'app' ? w.c.tt('hint.micOff') : w.c.Ls('hint.micOff')); assert.ok(w.hints.at(-1)); assert.equal(w.ta.focusCount, 0); });
    w.advance(0.5); w.input.emit('pointerup', { target: w.pill });
    check(`${page}/${language}/${permission} hold keeps the keyboard closed`, () => { assert.equal(w.ta.focusCount, 0); assert.notEqual(w.state(), 'TYPING'); assert.ok(w.hints.length, 'localized unavailable hint'); assert.deepEqual(w.speech(), ['speech.permission'], 'the hold asks native once and starts nothing'); assert.equal(w.mic(), permission, 'denied and unavailable stay distinct'); });
    const tap = world(page, language, permission);
    tap.input.emit('pointerdown', { target: tap.pill }); tap.advance(0.1); tap.input.emit('pointerup', { target: tap.pill });
    check(`${page}/${language}/${permission} tap still types`, () => { assert.equal(tap.state(), 'TYPING'); assert.equal(tap.ta.focusCount, 1); assert.deepEqual(tap.speech(), []); });
    const cancelled = world(page, language, permission);
    cancelled.input.emit('pointerdown', { target: cancelled.pill }); cancelled.advance(0.1); cancelled.input.emit('pointercancel', { target: cancelled.pill }); cancelled.advance(1);
    check(`${page}/${language}/${permission} cancel invalidates delayed hold feedback`, () => { assert.equal(cancelled.ta.focusCount, 0); assert.deepEqual(cancelled.hints.filter(Boolean), []); assert.deepEqual(cancelled.speech(), []); });
    // The cache is stale: native can listen now (the connection came back, a model was installed, access changed).
    const back = world(page, language, permission, true, false, { fresh: 'granted' });
    back.input.emit('pointerdown', { target: back.pill }); back.advance(0.3); await back.flush();
    check(`${page}/${language}/${permission} stale cache: the same hold records once native says granted`, () => { assert.equal(back.state(), 'LISTENING'); assert.deepEqual(back.speech(), ['speech.permission', 'speech.start']); assert.equal(back.mic(), 'granted'); assert.equal(back.ta.focusCount, 0); });
    back.advance(0.5); back.input.emit('pointerup', { target: back.pill }); await back.flush();
    check(`${page}/${language}/${permission} stale cache: releasing that hold ends dictation once`, () => { assert.equal(back.calls.filter(x => x.method === 'speech.stop' && !x.params?.cancel).length, 1); assert.ok(!back.calls.some(x => x.method === 'speech.stop' && x.params?.cancel)); assert.equal(back.ta.focusCount, 0); });
    const next = world(page, language, permission, true, false, { fresh: 'granted' });
    next.input.emit('pointerdown', { target: next.pill }); next.advance(0.6); next.input.emit('pointerup', { target: next.pill }); await next.flush();
    check(`${page}/${language}/${permission} stale cache: an answer after the release invites the next hold`, () => { assert.deepEqual(next.speech(), ['speech.permission']); assert.equal(next.mic(), 'granted'); if (page === 'app') next.lastHint('hint.hold'); else { assert.equal(next.transitions.at(-1), 'ASK_TEACH'); assert.deepEqual(next.hints.filter(Boolean), [], 'the quiet beat shows hold to ask, never the unavailable line'); } assert.equal(next.ta.focusCount, 0); assert.notEqual(next.state(), 'TYPING'); });
    next.input.emit('pointerdown', { target: next.pill }); await next.flush();
    check(`${page}/${language}/${permission} stale cache: the next hold starts at once`, () => assert.deepEqual(next.speech(), ['speech.permission', 'speech.start']));
    const other = permission === 'unavailable' ? 'denied' : 'unavailable';
    const moved = world(page, language, permission, true, false, { fresh: other });
    moved.input.emit('pointerdown', { target: moved.pill }); moved.advance(0.6); moved.input.emit('pointerup', { target: moved.pill }); await moved.flush();
    check(`${page}/${language}/${permission} fresh ${other} replaces the cache and is never merged with it`, () => { assert.equal(moved.mic(), other); assert.deepEqual(moved.speech(), ['speech.permission']); moved.lastHint('hint.micOff'); assert.equal(moved.ta.focusCount, 0); });
    const failing = world(page, language, permission, true, false, { fresh: 'error' });
    failing.input.emit('pointerdown', { target: failing.pill }); failing.advance(0.6); failing.input.emit('pointerup', { target: failing.pill }); await failing.flush();
    check(`${page}/${language}/${permission} a failed re-query keeps the cached state and still explains`, () => { assert.equal(failing.mic(), permission); failing.lastHint('hint.micOff'); assert.equal(failing.ta.focusCount, 0); assert.deepEqual(failing.speech(), ['speech.permission']); });
    const first = world(page, language, permission, true, false, { fresh: 'undetermined' });
    first.input.emit('pointerdown', { target: first.pill }); first.advance(0.6); first.input.emit('pointerup', { target: first.pill }); await first.flush();
    check(`${page}/${language}/${permission} fresh undetermined leads to the pre-permission card, not to a prompt`, () => { assert.equal(first.state(), 'PRE_PERMISSION'); assert.deepEqual(first.speech(), ['speech.permission']); assert.equal(first.ta.focusCount, 0); });
  }
  // `consent`: only Apple's speech service can transcribe the language and the user has not agreed to it.
  // Native asks (speech.requestPermission raises its alert) before anything is captured; the page follows the answer.
  for (const cached of ['consent', 'unavailable', 'denied']) {
    const allow = world(page, language, cached, true, false, { fresh: 'consent', prompt: 'granted' });
    allow.input.emit('pointerdown', { target: allow.pill }); allow.advance(0.3); await allow.flush();
    check(`${page}/${language}/${cached} hold in the consent state asks before anything is captured`, () => { assert.deepEqual(allow.speech(), ['speech.permission', 'speech.requestPermission']); assert.equal(allow.ta.focusCount, 0); assert.notEqual(allow.state(), 'LISTENING'); });
    allow.input.emit('pointerup', { target: allow.pill }); await allow.flush();
    check(`${page}/${language}/${cached} allow keeps the keyboard closed and invites the next hold`, () => { assert.equal(allow.mic(), 'granted'); assert.equal(allow.ta.focusCount, 0); assert.notEqual(allow.state(), 'TYPING'); assert.ok(!allow.speech().includes('speech.start')); if (page === 'app') allow.lastHint('hint.hold'); else assert.equal(allow.transitions.at(-1), 'ASK_TEACH'); });
    allow.input.emit('pointerdown', { target: allow.pill }); await allow.flush();
    check(`${page}/${language}/${cached} the hold after allow records`, () => { assert.deepEqual(allow.speech().slice(-1), ['speech.start']); assert.equal(allow.speech().filter(x => x === 'speech.requestPermission').length, 1); assert.equal(allow.state(), 'LISTENING'); });
  }
  const type = world(page, language, 'consent', true, false, { prompt: 'consent' });
  type.input.emit('pointerdown', { target: type.pill }); type.advance(0.6); type.input.emit('pointerup', { target: type.pill }); await type.flush();
  check(`${page}/${language} type in the consent prompt opens typing and stores nothing`, () => { assert.equal(type.state(), 'TYPING'); assert.equal(type.ta.focusCount, 1); assert.equal(type.mic(), 'consent'); assert.deepEqual(type.speech(), ['speech.permission', 'speech.requestPermission']); });
  if (page === 'app') type.c.ST.name = 'IDLE'; else type.c.W.state = 'ASK_TEACH';
  type.input.emit('pointerdown', { target: type.pill }); type.advance(0.6); type.input.emit('pointerup', { target: type.pill }); await type.flush();
  check(`${page}/${language} a later hold offers the consent prompt again`, () => { assert.equal(type.speech().filter(x => x === 'speech.requestPermission').length, 2); assert.ok(!type.speech().includes('speech.start')); });
  const consentTap = world(page, language, 'consent');
  consentTap.input.emit('pointerdown', { target: consentTap.pill }); consentTap.advance(0.1); consentTap.input.emit('pointerup', { target: consentTap.pill }); consentTap.advance(1); await consentTap.flush();
  check(`${page}/${language} a tap in the consent state types and asks nothing`, () => { assert.equal(consentTap.state(), 'TYPING'); assert.equal(consentTap.ta.focusCount, 1); assert.deepEqual(consentTap.speech(), []); });
  const consentCancel = world(page, language, 'consent');
  consentCancel.input.emit('pointerdown', { target: consentCancel.pill }); consentCancel.advance(0.1); consentCancel.input.emit('pointercancel', { target: consentCancel.pill }); consentCancel.advance(1); await consentCancel.flush();
  check(`${page}/${language} a cancelled press in the consent state asks nothing`, () => { assert.deepEqual(consentCancel.speech(), []); assert.equal(consentCancel.ta.focusCount, 0); });
  const consentDrag = world(page, language, 'consent');
  consentDrag.input.emit('pointerdown', { target: consentDrag.pill }); consentDrag.advance(0.3); consentDrag.input.emit('pointermove', { target: consentDrag.pill, clientY: 670 }); await consentDrag.flush();
  check(`${page}/${language} a hold dragged away before native answers raises no prompt`, () => { assert.deepEqual(consentDrag.speech(), ['speech.permission']); assert.equal(consentDrag.ta.focusCount, 0); });
  // A stale `granted` cache: native refuses to start without the agreement and the page asks, still capturing nothing.
  const refused = world(page, language, 'granted', true, false, { start: 'consent', prompt: 'consent' });
  refused.input.emit('pointerdown', { target: refused.pill }); await refused.flush();
  check(`${page}/${language} speech.start answering consent raises the prompt and never listens`, () => { assert.deepEqual(refused.speech().slice(0, 2), ['speech.start', 'speech.requestPermission']); assert.notEqual(refused.state(), 'LISTENING'); });
  await refused.flush();
  check(`${page}/${language} declining after a refused start opens typing with the cache corrected`, () => { assert.equal(refused.mic(), 'consent'); assert.equal(refused.state(), 'TYPING'); assert.equal(refused.ta.focusCount, 1); });
  if (page === 'app') {
    // The alert takes longer to read than ERROR (6 s) or RETURNING last, so the glass goes home under it. The answer
    // is still followed there; a read that began meanwhile is never interrupted.
    const prompted = async (from, answer, then) => {
      let answerPrompt; const opened = [];
      const w = world(page, language, 'consent', true, false, { prompt: answer, wait: new Promise(resolve => { answerPrompt = resolve; }) });
      const go = w.c.go; w.c.go = (name, data = {}) => { if (name === 'TYPING') opened.push(JSON.parse(JSON.stringify(data))); go(name, data); };   // a plain copy: the page's object belongs to its own realm
      w.c.ST.name = from; w.c.STATES[from] = { down: (hit, p) => hit === 'pill' ? w.c.pillDown(p, true) : null };
      w.input.emit('pointerdown', { target: w.pill }); w.advance(0.6); w.input.emit('pointerup', { target: w.pill }); await w.flush();
      assert.deepEqual(w.speech(), ['speech.permission', 'speech.requestPermission'], 'the prompt is up and nothing was captured');
      if (then) { w.c.GEN += 2; w.c.ST.name = then; }
      w.hints.length = 0; answerPrompt(); await w.flush(); await w.flush();
      return { w, opened };
    };
    for (const rest of ['IDLE', 'RETURNING']) {
      const typed = await prompted('ERROR', 'consent', rest);
      check(`${page}/${language} type answered after the glass came to rest (${rest}) still opens typing`, () => { assert.equal(typed.w.state(), 'TYPING'); assert.equal(typed.w.ta.focusCount, 1); assert.deepEqual(typed.opened, [{ fromRead: false }]); assert.equal(typed.w.mic(), 'consent'); assert.ok(!typed.w.speech().includes('speech.start')); });
    }
    const allowed = await prompted('ERROR', 'granted', 'IDLE');
    check(`${page}/${language} allow answered after the glass came to rest invites the next hold`, () => { assert.equal(allowed.w.mic(), 'granted'); allowed.w.lastHint('hint.hold'); assert.equal(allowed.w.ta.focusCount, 0); assert.equal(allowed.w.state(), 'IDLE'); });
    for (const answer of ['consent', 'granted']) {
      const busy = await prompted('ERROR', answer, 'THINK_WAIT');
      check(`${page}/${language} ${answer === 'consent' ? 'type' : 'allow'} answered during another read never interrupts it`, () => { assert.equal(busy.w.state(), 'THINK_WAIT'); assert.equal(busy.w.ta.focusCount, 0); assert.deepEqual(busy.opened, []); assert.deepEqual(busy.w.hints, []); assert.equal(busy.w.mic(), answer, 'native remains the source of the mic state'); });
    }
    const inRead = await prompted('CARDS', 'consent', null);
    check(`${page}/${language} type answered where the hold began keeps the read behind the keyboard`, () => { assert.equal(inRead.w.state(), 'TYPING'); assert.equal(inRead.w.ta.focusCount, 1); assert.deepEqual(inRead.opened, [{ fromRead: true }]); });
  }
  const active = world(page, language);
  const down = active.input.emit('pointerdown', { target: active.pill }); await active.flush();
  check(`${page}/${language} pointer owns the mic gesture`, () => { assert.ok(down.prevented); assert.equal(active.calls.filter(x => x.method === 'speech.start').length, 1); });
  active.advance(0.8); active.input.emit('pointercancel', { target: active.pill }); await active.flush();
  check(`${page}/${language} cancellation discards rather than finishes dictation`, () => { assert.equal(active.ta.focusCount, 0); assert.ok(active.calls.some(x => x.method === 'speech.stop' && x.params?.cancel === true)); assert.ok(!active.calls.some(x => x.method === 'speech.stop' && !x.params?.cancel)); assert.notEqual(active.state(), 'LISTENING'); });
  const keyboard = world(page, language, 'denied');
  keyboard.input.emit('pointerdown', { target: keyboard.pill }); keyboard.input.emit('pointercancel', { target: keyboard.pill });
  (page === 'app' ? keyboard.stage : keyboard.doc).emit('click', { target: keyboard.pill, detail: 0 });
  check(`${page}/${language} accessible activation still types after a cancelled pointer`, () => { assert.equal(keyboard.state(), 'TYPING'); assert.equal(keyboard.ta.focusCount, 1); });
  const moved = world(page, language, 'undetermined');
  moved.input.emit('pointerdown', { target: moved.pill }); moved.advance(0.1); moved.input.emit('pointermove', { target: moved.pill, clientY: 670 }); moved.input.emit('pointerup', { target: moved.pill, clientY: 670 });
  check(`${page}/${language} dragged mic does not open typing or permission`, () => { assert.equal(moved.ta.focusCount, 0); assert.ok(!moved.transitions.includes('PRE_PERMISSION')); });
  const hold = world(page, language, 'undetermined');
  hold.input.emit('pointerdown', { target: hold.pill }); hold.advance(0.8); hold.input.emit('pointerup', { target: hold.pill });
  check(`${page}/${language} deliberate hold owns pre-permission`, () => { assert.equal(hold.state(), 'PRE_PERMISSION'); assert.equal(hold.ta.focusCount, 0); assert.ok(!hold.calls.some(x => x.method === 'speech.requestPermission')); });
  const short = world(page, language, 'undetermined');
  short.input.emit('pointerdown', { target: short.pill }); short.advance(0.1); short.input.emit('pointerup', { target: short.pill });
  check(`${page}/${language} first short tap types without requesting permission`, () => { assert.equal(short.state(), 'TYPING'); assert.equal(short.ta.focusCount, 1); assert.equal(short.calls.length, 0); });
  const touch = world(page, language, 'granted', false), finger = { identifier: 7, clientX: 195, clientY: 770 };
  const ts = touch.input.emit('touchstart', { target: touch.pill, touches: [finger], changedTouches: [finger] }); await touch.flush();
  const tm = touch.input.emit('touchmove', { target: touch.pill, touches: [finger], changedTouches: [finger] });
  touch.advance(0.7); touch.input.emit('touchcancel', { target: touch.pill, touches: [], changedTouches: [finger] }); await touch.flush();
  check(`${page}/${language} touch fallback prevents pan and cancels safely`, () => { assert.ok(ts.prevented); assert.ok(tm.prevented); assert.equal(touch.calls.filter(x => x.method === 'speech.start').length, 1); assert.ok(touch.calls.some(x => x.method === 'speech.stop' && x.params?.cancel)); assert.equal(touch.ta.focusCount, 0); });
  const touchEnd = world(page, language, 'granted', false);
  touchEnd.input.emit('touchstart', { target: touchEnd.pill, touches: [finger], changedTouches: [finger] }); await touchEnd.flush(); touchEnd.advance(0.7);
  touchEnd.input.emit('touchend', { target: touchEnd.pill, touches: [], changedTouches: [finger] }); await touchEnd.flush();
  check(`${page}/${language} deliberate touch release ends dictation once`, () => { assert.equal(touchEnd.calls.filter(x => x.method === 'speech.start').length, 1); assert.equal(touchEnd.calls.filter(x => x.method === 'speech.stop' && !x.params?.cancel).length, 1); assert.equal(touchEnd.ta.focusCount, 0); });
  const lost = world(page, language);
  lost.input.emit('pointerdown', { target: lost.pill }); await lost.flush(); lost.advance(0.5); lost.input.emit('lostpointercapture', { target: lost.pill }); lost.input.emit('pointerup', { target: lost.pill }); await lost.flush();
  check(`${page}/${language} losing capture cancels once and ignores the later release`, () => { assert.equal(lost.calls.filter(x => x.method === 'speech.stop' && x.params?.cancel).length, 1); assert.ok(!lost.calls.some(x => x.method === 'speech.stop' && !x.params?.cancel)); assert.equal(lost.ta.focusCount, 0); });
  const contextMenu = world(page, language, 'denied');
  const cm = (page === 'app' ? contextMenu.stage : contextMenu.doc).emit('contextmenu', { target: contextMenu.pill });
  check(`${page}/${language} native long-press callout is suppressed for the mic`, () => assert.ok(cm.prevented));
  const typing = world(page, language, 'denied');
  const typeTouch = typing.input.emit('touchstart', { target: typing.ta, touches: [finger], changedTouches: [finger] });
  check(`${page}/${language} touch typing selection is preserved`, () => { assert.equal(typeTouch.prevented, false); assert.equal(typing.calls.length, 0); });
  typing.input.emit('pointerdown', { target: typing.pill }); typing.advance(0.1); typing.input.emit('pointerup', { target: typing.pill });
  const composed = typing.ta.emit('keydown', { key: 'Enter', isComposing: true }), newline = typing.ta.emit('keydown', { key: 'Enter', shiftKey: true });
  check(`${page}/${language} IME composition and Shift+Enter do not submit`, () => { assert.equal(composed.prevented, false); assert.equal(newline.prevented, false); assert.ok(!typing.calls.some(x => x.method === 'typed.send')); });
  const enter = typing.ta.emit('keydown', { key: 'Enter' });
  check(`${page}/${language} explicit Enter submits once`, () => { assert.ok(enter.prevented); assert.equal(typing.calls.filter(x => x.method === 'typed.send').length, 1); });
  const drift = world(page, language);
  drift.input.emit('pointerdown', { target: drift.pill }); await drift.flush(); drift.advance(0.6); drift.input.emit('pointermove', { target: drift.pill, clientX: 213 }); drift.input.emit('pointerup', { target: drift.pill, clientX: 213 }); await drift.flush();
  check(`${page}/${language} minor finger drift does not cancel a deliberate hold`, () => { assert.equal(drift.calls.filter(x => x.method === 'speech.stop' && !x.params?.cancel).length, 1); assert.ok(!drift.calls.some(x => x.method === 'speech.stop' && x.params?.cancel)); assert.equal(drift.ta.focusCount, 0); });
  const retry = world(page, language, 'granted', true, true);
  retry.input.emit('pointerdown', { target: retry.pill }); retry.advance(0.8); retry.input.emit('pointercancel', { target: retry.pill });
  check(`${page}/${language} pending native start is cancelled immediately`, () => assert.ok(retry.calls.some(x => x.method === 'speech.stop' && x.params?.cancel)));
  retry.input.emit('pointerdown', { target: retry.pill });
  const beforeOldReply = retry.calls.length;
  retry.starts[0]({ status: 'listening' }); await retry.flush();
  check(`${page}/${language} old speech.start reply cannot stop or reopen retry`, () => { assert.equal(retry.calls.length, beforeOldReply); assert.equal(retry.state(), 'LISTENING'); if (page === 'app') assert.equal(retry.c.STATES.LISTENING.live, false); });
  retry.starts[1]?.({ status: 'listening' }); await retry.flush();
  check(`${page}/${language} only current start becomes live`, () => { assert.equal(retry.starts.length, 2); assert.equal(retry.state(), 'LISTENING'); if (page === 'app') assert.equal(retry.c.STATES.LISTENING.live, true); else assert.equal(retry.c.W.press?.listening, true); });
  const oldOnly = world(page, language, 'granted', true, true);
  oldOnly.input.emit('pointerdown', { target: oldOnly.pill }); oldOnly.advance(0.8); oldOnly.input.emit('pointercancel', { target: oldOnly.pill }); oldOnly.starts[0]({ status: 'listening' }); await oldOnly.flush();
  check(`${page}/${language} delayed reply after cancel never raises keyboard or sends`, () => { assert.equal(oldOnly.ta.focusCount, 0); assert.notEqual(oldOnly.state(), 'LISTENING'); assert.ok(!oldOnly.transitions.includes('SENDING')); assert.ok(!oldOnly.calls.some(x => x.method === 'speech.stop' && !x.params?.cancel)); });
  for (const status of ['unavailable', 'denied', 'restricted', 'failed', 'needs_permission']) {
    const late = world(page, language, 'granted', true, true);
    late.input.emit('pointerdown', { target: late.pill }); late.advance(0.8); late.input.emit('pointerup', { target: late.pill }); late.starts[0]({ status }); await late.flush();
    check(`${page}/${language}/${status} delayed start failure after hold release never opens typing`, () => { assert.equal(late.ta.focusCount, 0); assert.ok(!late.transitions.includes('TYPING')); assert.ok(!late.transitions.includes('SENDING')); if (page === 'onboarding' && status !== 'needs_permission') assert.equal(late.hints.at(-1), late.c.Ls('hint.micOff')); });
  }
  for (const w of [active, keyboard, moved, hold, touch, typing]) check(`${page}/${language} handlers throw no hidden errors`, () => assert.deepEqual(w.errors, []));
}
}
console.log(`Nucleo mic gestures (${requestedSurface || 'native + web'}): ${checks} checks passed, ${failed} failed${ref ? ` against ${ref}` : ''} (actual JS listeners/transitions; offline).`);
if (failed) process.exitCode = 1;
