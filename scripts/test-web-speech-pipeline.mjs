#!/usr/bin/env node
// Execute the shipping Web Speech wrapper/lifecycle with local capability, audio, recognizer and clock probes.
// --source-ref=HEAD reproduces the same assertions against an immutable pre-fix wrapper.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const argument = key => process.argv.find(x => x.startsWith(key + '='))?.slice(key.length + 1);
const ref = argument('--source-ref'), reportPath = argument('--json-report');
const read = path => ref ? execFileSync('git', ['show', `${ref}:${path}`], { cwd: root, encoding: 'utf8' }) : readFileSync(root + path, 'utf8');
const path = 'nucleo/src/web/40-web-speech.js', source = read(path), install = read('nucleo/src/web/90-web-install.js');
const lifecycleStart = install.indexOf("document.addEventListener('visibilitychange', function () {", install.indexOf('/* ---- lifecycle:'));
assert.ok(lifecycleStart >= 0, 'Actual shipping background handler exists');
const lifecycle = install.slice(lifecycleStart, install.indexOf('\n  });', lifecycleStart) + 6);
const outcomes = [];
function check(label, assertion) {
  try { assertion(); outcomes.push({ label, status: 'passed' }); }
  catch (error) { outcomes.push({ label, status: 'failed', message: error.message }); if (outcomes.filter(x => x.status === 'failed').length <= 12) console.error(`FAIL ${label}: ${error.message}`); }
}
class Clock {
  now = 1000; next = 1; entries = new Map();
  schedule(fn, milliseconds, repeat = false) { const id = this.next++; this.entries.set(id, { fn, at: this.now + milliseconds, milliseconds, repeat }); return id; }
  clear(id) { this.entries.delete(id); }
  advance(milliseconds) {
    const end = this.now + milliseconds; let count = 0;
    while (true) {
      const due = [...this.entries].filter(([, e]) => e.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0]);
      if (!due.length) break;
      if (++count > 10000) throw new Error('Unbounded fake speech timers');
      const [id, entry] = due[0]; this.now = entry.at;
      if (entry.repeat) entry.at += entry.milliseconds; else this.entries.delete(id);
      entry.fn();
    }
    this.now = end;
  }
}
async function world(locale, options = {}) {
  const clock = new Clock(), events = [], recs = [], streams = [], leaves = [], sessions = [], audioSessions = [], gum = [], pending = [];
  const permission = { state: options.permission || 'granted', onchange: null };
  const context = {
    state: 'running',
    createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
    createAnalyser: () => ({ fftSize: 1024, getFloatTimeDomainData(buf) { buf.fill(0.15); } }),
  };
  const voice = { stop() {}, audioSession(type) { audioSessions.push(type); }, context: () => context };
  class Recognition {
    constructor() { if (options.constructorError) throw new Error('test constructor'); recs.push(this); this.stopCount = this.abortCount = 0; }
    start() { if (options.startError) throw new Error('test start'); }
    stop() { this.stopCount++; if (options.stopError) throw new Error('test stop'); if (options.stopEnds) this.end(); }
    abort() { this.abortCount++; if (options.abortCallbacks) { this.onerror?.({ error: 'aborted' }); this.onend?.(); } }
    result(text, final = false) { const r = [{ transcript: text }]; r.isFinal = final; this.onresult?.({ results: [r], resultIndex: 0 }); }
    chunks(parts) { this.onresult?.({ results: parts.map(text => [{ transcript: text }]), resultIndex: 0 }); }
    end() { this.onend?.(); }
    error(error) { this.onerror?.({ error }); }
  }
  const NW = {
    locale, lang: locale.split('-')[0], state: { riskAccepted: () => options.consent !== false }, voice,
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)), withTimeout: (_ms, promise) => Promise.resolve(promise).catch(() => null),
    emit(name, payload) { events.push({ name, payload }); }, emitEvery(name, payload) { events.push({ name, payload }); },
    emitSession() { sessions.push(NW.speech.permission()); }, onLeave(fn) { leaves.push(fn); },
  };
  const document = { hidden: false, listeners: {}, addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); } };
  function stream() { const track = { stopCount: 0, stop() { this.stopCount++; } }; const s = { track, getTracks: () => [track] }; streams.push(s); return s; }
  const navigator = {
    userAgent: options.webkit ? 'Mozilla/5.0 Version/17.0 Safari/605.1' : 'Mozilla/5.0 Chrome/130.0', maxTouchPoints: 0,
    permissions: { query: () => Promise.resolve(permission) },
    mediaDevices: { getUserMedia(args) {
      gum.push(args);
      if (options.gumError) return Promise.reject({ name: options.gumError });
      const s = stream();
      if (options.deferredMeter && args.audio !== true) return new Promise(resolve => pending.push(() => resolve(s)));
      return Promise.resolve(s);
    } },
  };
  if (options.noGUM) delete navigator.mediaDevices;
  const window = { __nucleoWeb: NW, isSecureContext: options.secure !== false };
  if (!options.noRecognition) window[options.webkit ? 'webkitSpeechRecognition' : 'SpeechRecognition'] = Recognition;
  const ctx = vm.createContext({ window, navigator, document, performance: { now: () => clock.now }, Float32Array,
    setTimeout: (fn, ms) => clock.schedule(fn, ms), clearTimeout: id => clock.clear(id),
    setInterval: (fn, ms) => clock.schedule(fn, ms, true), clearInterval: id => clock.clear(id) });
  vm.runInContext(source, ctx, { filename: path });
  await NW.speech.ready;
  ctx.NW = NW; ctx.SP = NW.speech; ctx.V = voice;
  vm.runInContext(lifecycle, ctx, { filename: 'actual-web-lifecycle' });
  const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  return { NW, SP: NW.speech, clock, events, recs, streams, sessions, audioSessions, gum, pending, permission, options, flush,
    texts: name => events.filter(x => x.name === name).map(x => x.payload.text),
    states: () => events.filter(x => x.name === 'speech.state').map(x => x.payload.state),
    background() { document.hidden = true; for (const fn of document.listeners.visibilitychange || []) fn(); },
    leave() { for (const fn of leaves) fn(); },
  };
}
const cases = [
  ['en-US', 'Why is NVIDIA’s price $123.45 — wait or act?'],
  ['es-MX', '¿Qué pasó con NVIDIA? Cuesta 123,45 dólares.'],
  ['fr-FR', 'L’action à Paris coûte 1 234,56 € — pourquoi ?'],
  ['pt-PT', 'A ação está a 123,45 €; é melhor aguardar?'],
  ['pt-BR', 'A ação em São Paulo está a R$ 123,45 — por quê?'],
  ['it-IT', 'Perché l’azione è già a 123,45 €? Aspetterò.'],
  ['de-DE', 'Überprüfe den Kurs: 1.234,56 € — heißt das Größe?'],
];
for (const [locale, text] of cases) {
  const label = scenario => `${locale}/${scenario}`;
  const w = await world(locale);
  check(label('consented start uses selected locale and truthful cloud capability'), () => { assert.equal(w.SP.permission().onDevice, false); assert.equal(w.SP.start(), 'listening'); assert.equal(w.recs[0].lang, locale); assert.equal(w.recs[0].continuous, true); assert.equal(w.recs[0].interimResults, true); });
  await w.flush(); w.recs[0].result(text);
  check(label('Unicode partial and price formatting preserve original text'), () => assert.deepEqual(w.texts('speech.partial'), [text]));
  check(label('release closes every local capture immediately'), () => { assert.equal(w.SP.stop({}), 'stopped'); assert.ok(w.streams.every(s => s.track.stopCount === 1)); assert.equal(w.clock.entries.size, 1, 'Only bounded final wait remains'); });
  w.recs[0].result(text, true); w.recs[0].end();
  check(label('explicit release confirms one final and restores playback'), () => { assert.deepEqual(w.texts('speech.final'), [text]); assert.deepEqual(w.states(), ['listening', 'stopped']); assert.equal(w.audioSessions.at(-1), 'playback'); });
  w.recs[0].result('old text', true); w.recs[0].error('network'); w.recs[0].end(); w.clock.advance(70000);
  check(label('duplicates cannot produce a second final'), () => assert.deepEqual(w.texts('speech.final'), [text]));

  const synchronous = await world(locale, { stopEnds: true }); synchronous.SP.start(); await synchronous.flush(); synchronous.recs[0].result(text); synchronous.SP.stop({});
  check(label('synchronous stop completion cannot leave a delayed final timer'), () => { assert.deepEqual(synchronous.texts('speech.final'), [text]); assert.equal(synchronous.clock.entries.size, 0); assert.ok(synchronous.streams.every(s => s.track.stopCount === 1)); });

  const chunks = await world(locale); chunks.SP.start(); await chunks.flush(); chunks.recs[0].chunks([text, 'NVDA 123,45']);
  check(label('cumulative recognizer segments preserve previous words and Unicode'), () => { assert.equal(chunks.texts('speech.partial').at(-1), text + ' NVDA 123,45'); assert.deepEqual(chunks.texts('speech.final'), []); });
  chunks.SP.stop({}); chunks.recs[0].end();
  check(label('cumulative segments confirm the complete text on explicit release'), () => assert.deepEqual(chunks.texts('speech.final'), [text + ' NVDA 123,45']));

  const held = await world(locale); held.SP.start(); await held.flush(); held.recs[0].result(text, true); held.recs[0].end();
  check(label('recognizer end while held closes hardware but does not confirm'), () => { assert.equal(held.SP.active(), true); assert.ok(held.streams.every(s => s.track.stopCount === 1)); assert.deepEqual(held.states(), ['listening']); assert.deepEqual(held.texts('speech.final'), []); assert.equal(held.SP.start(), 'busy'); });
  held.SP.stop({});
  check(label('ended held recognizer confirms only on release'), () => assert.deepEqual(held.texts('speech.final'), [text]));

  const endedError = await world(locale); endedError.SP.start(); await endedError.flush(); endedError.recs[0].result(text); endedError.recs[0].end(); endedError.recs[0].error('network'); endedError.recs[0].result('late changed text'); endedError.SP.stop({});
  check(label('late error or text after held onend cannot erase its saved transcript'), () => assert.deepEqual(endedError.texts('speech.final'), [text]));

  const timeout = await world(locale); timeout.SP.start(); await timeout.flush(); timeout.recs[0].result(text); timeout.SP.stop({}); timeout.clock.advance(1500);
  check(label('final wait returns latest partial once without truncation'), () => { assert.deepEqual(timeout.texts('speech.final'), [text]); assert.equal(timeout.SP.active(), false); });
  timeout.recs[0].end(); timeout.recs[0].result('late');
  check(label('late deadline duplicate ignored'), () => assert.deepEqual(timeout.texts('speech.final'), [text]));

  const revised = await world(locale); revised.SP.start(); await revised.flush(); revised.recs[0].result('NVDA 12'); revised.recs[0].result('NVDA 123,45');
  const long = text + ' ' + Array(70).fill(text).join(' '); revised.recs[0].result(long); revised.SP.stop({}); revised.recs[0].end();
  check(label('revised and long transcript remains whole'), () => { assert.equal(revised.texts('speech.partial').at(-1), long); assert.deepEqual(revised.texts('speech.final'), [long]); });

  for (const released of [false, true]) {
    const cancel = await world(locale, { abortCallbacks: true }); cancel.SP.start(); await cancel.flush(); cancel.recs[0].result(text); if (released) cancel.SP.stop({});
    cancel.SP.cancel(); const before = cancel.events.length; cancel.recs[0].result('stale', true); cancel.recs[0].end(); cancel.clock.advance(70000);
    check(label(`cancel ${released ? 'after release' : 'during hold'} blocks final and late callbacks`), () => { assert.deepEqual(cancel.texts('speech.final'), []); assert.equal(cancel.SP.active(), false); assert.equal(cancel.events.length, before); assert.ok(cancel.streams.every(s => s.track.stopCount === 1)); });
  }
  for (const released of [false, true]) {
    const bg = await world(locale); bg.SP.start(); await bg.flush(); bg.recs[0].result(text); if (released) bg.SP.stop({}); bg.background(); bg.recs[0].result('stale', true); bg.recs[0].end(); bg.clock.advance(70000);
    check(label(`actual background lifecycle ${released ? 'after release' : 'during hold'} never sends`), () => { assert.deepEqual(bg.texts('speech.final'), []); assert.equal(bg.SP.active(), false); assert.ok(bg.streams.every(s => s.track.stopCount === 1)); assert.equal(bg.events.find(x => x.name === 'app.state')?.payload.state, 'background'); });
  }
  const leave = await world(locale); leave.SP.start(); await leave.flush(); leave.recs[0].result(text); leave.leave(); leave.recs[0].end();
  check(label('registered navigation cleanup never confirms'), () => { assert.deepEqual(leave.texts('speech.final'), []); assert.equal(leave.SP.active(), false); });

  const retry = await world(locale); retry.SP.start(); await retry.flush(); const old = retry.recs[0]; retry.SP.cancel(); retry.SP.start(); await retry.flush();
  old.result('old private question'); old.error('not-allowed'); old.end(); retry.recs[1].result(text); retry.SP.stop({}); retry.recs[1].end();
  check(label('old task does not mutate or stop the retry'), () => { assert.deepEqual(retry.texts('speech.final'), [text]); assert.equal(retry.SP.permission().state, 'granted'); });

  const max = await world(locale); max.SP.start(); await max.flush(); max.recs[0].result(text); max.clock.advance(60000); max.recs[0].end(); max.clock.advance(1500);
  check(label('60-second bound cancels instead of auto confirming hold'), () => { assert.equal(max.SP.active(), false); assert.deepEqual(max.texts('speech.final'), []); assert.equal(max.events.find(x => x.name === 'speech.error')?.payload.code, 'interrupted'); assert.ok(max.streams.every(s => s.track.stopCount === 1)); });

  for (const released of [false, true]) {
    const lang = await world(locale); lang.SP.start(); await lang.flush(); lang.recs[0].result(text); if (released) lang.SP.stop({}); lang.NW.locale = locale === 'de-DE' ? 'it-IT' : 'de-DE';
    lang.recs[0].result('old-language text', true); lang.recs[0].end(); lang.clock.advance(1600);
    check(label(`language changes ${released ? 'after release' : 'during hold'} invalidate old transcript`), () => { assert.ok(!lang.texts('speech.partial').includes('old-language text')); assert.deepEqual(lang.texts('speech.final'), []); assert.equal(lang.SP.active(), false); assert.ok(lang.streams.every(s => s.track.stopCount === 1)); });
  }
  const localeDeadline = await world(locale); localeDeadline.SP.start(); await localeDeadline.flush(); localeDeadline.recs[0].result(text); localeDeadline.SP.stop({}); localeDeadline.NW.locale = locale === 'de-DE' ? 'it-IT' : 'de-DE'; localeDeadline.clock.advance(1500);
  check(label('locale change also invalidates final deadline without callback'), () => assert.deepEqual(localeDeadline.texts('speech.final'), []));

  const revoked = await world(locale); revoked.SP.start(); await revoked.flush(); revoked.permission.state = 'denied'; revoked.permission.onchange();
  check(label('microphone permission revocation closes capture immediately'), () => { assert.equal(revoked.SP.active(), false); assert.equal(revoked.SP.permission().state, 'denied'); assert.ok(revoked.streams.every(s => s.track.stopCount === 1)); });
  revoked.recs[0].result('revoked', true); revoked.recs[0].end();
  check(label('permission-revoked callback cannot send'), () => assert.deepEqual(revoked.texts('speech.final'), []));

  for (const error of ['network', 'audio-capture', 'not-allowed', 'service-not-allowed', 'language-not-supported']) {
    const failure = await world(locale); failure.SP.start(); await failure.flush(); failure.recs[0].result(text); failure.recs[0].error(error); failure.recs[0].end();
    check(label(`${error} error while held never confirms`), () => { assert.deepEqual(failure.texts('speech.final'), []); assert.equal(failure.SP.active(), false); assert.ok(failure.streams.every(s => s.track.stopCount === 1)); assert.ok(failure.events.some(x => x.name === 'speech.error')); });
  }
  const afterError = await world(locale); afterError.SP.start(); await afterError.flush(); afterError.recs[0].result(text); afterError.SP.stop({}); afterError.recs[0].error('network');
  check(label('provider error after explicit release settles latest text once'), () => assert.deepEqual(afterError.texts('speech.final'), [text]));
  const silent = await world(locale); silent.SP.start(); await silent.flush(); silent.recs[0].error('no-speech'); silent.recs[0].end();
  check(label('no speech while held does not send'), () => assert.deepEqual(silent.texts('speech.final'), []));
  silent.SP.stop({});
  check(label('explicit silent release returns honest empty final'), () => assert.deepEqual(silent.texts('speech.final'), ['']));

  for (const scenario of ['cancel', 'release', 'background', 'locale']) {
    const delayed = await world(locale, { deferredMeter: true }); delayed.SP.start();
    if (scenario === 'cancel') delayed.SP.cancel(); else if (scenario === 'release') delayed.SP.stop({}); else if (scenario === 'background') delayed.background(); else delayed.NW.locale = locale === 'de-DE' ? 'it-IT' : 'de-DE';
    delayed.pending.forEach(resolve => resolve()); await delayed.flush();
    check(label(`late GUM after ${scenario} closes every incoming track`), () => assert.ok(delayed.streams.every(s => s.track.stopCount === 1)));
    delayed.SP.cancel();
  }
  const consent = await world(locale, { consent: false });
  check(label('cloud STT cannot start without accepted risk notice'), () => { assert.equal(consent.SP.start(), 'unavailable'); assert.equal(consent.recs.length, 0); assert.equal(consent.gum.length, 0); assert.equal(consent.SP.permission().onDevice, false); });
  const withdrawn = await world(locale); withdrawn.SP.start(); await withdrawn.flush(); withdrawn.recs[0].result(text); withdrawn.options.consent = false; withdrawn.recs[0].result('withdrawn', true); withdrawn.recs[0].end(); withdrawn.SP.stop({});
  check(label('consent withdrawal cannot deliver old transcript'), () => { assert.deepEqual(withdrawn.texts('speech.final'), []); assert.ok(withdrawn.streams.every(s => s.track.stopCount === 1)); });

  const safari = await world(locale, { webkit: true }); safari.SP.start(); safari.recs[0].result(text); safari.recs[0].end();
  check(label('WebKit uses recognizer-owned audio without second GUM capture'), () => { assert.equal(safari.gum.length, 0); assert.equal(safari.recs[0].lang, locale); assert.deepEqual(safari.texts('speech.final'), []); });
  safari.SP.stop({});
  check(label('WebKit confirms held text only on release'), () => assert.deepEqual(safari.texts('speech.final'), [text]));

  for (const option of ['constructorError', 'startError', 'stopError']) {
    const exception = await world(locale, { [option]: true }); const status = exception.SP.start();
    if (option === 'stopError') { await exception.flush(); exception.recs[0].result(text); exception.SP.stop({}); }
    check(label(`${option} leaves no orphaned capture`), () => { if (option !== 'stopError') assert.equal(status, 'unavailable'); assert.equal(exception.SP.active(), false); assert.ok(exception.streams.every(s => s.track.stopCount === 1)); assert.notEqual(exception.audioSessions.at(-1), 'play-and-record'); });
  }
  const metered = await world(locale); metered.SP.start(); await metered.flush(); metered.clock.advance(100);
  check(label('meter levels remain finite and bounded'), () => { const levels = metered.events.filter(x => x.name === 'speech.level').map(x => x.payload.level); assert.ok(levels.length); assert.ok(levels.every(x => Number.isFinite(x) && x >= 0 && x <= 1)); });
  metered.SP.stop({}); const levelCount = metered.events.filter(x => x.name === 'speech.level').length; metered.clock.advance(100);
  check(label('meter emits no levels after explicit release'), () => assert.equal(metered.events.filter(x => x.name === 'speech.level').length, levelCount)); metered.SP.cancel();
}
for (const option of [{ noRecognition: true }, { noGUM: true }, { secure: false }]) {
  const w = await world('fr-FR', option);
  check(`unsupported/${JSON.stringify(option)}`, () => { assert.equal(w.SP.permission().state, 'unavailable'); assert.equal(w.SP.start(), 'unavailable'); assert.equal(w.recs.length, 0); assert.equal(w.gum.length, 0); });
}
for (const permission of ['prompt', 'denied']) {
  const w = await world('fr-FR', { permission });
  check(`permission/${permission} start never opens microphone`, () => { assert.equal(w.SP.start(), permission === 'prompt' ? 'needs_permission' : 'denied'); assert.equal(w.gum.length, 0); assert.equal(w.recs.length, 0); });
}
for (const gumError of ['NotAllowedError', 'NotFoundError', 'NotReadableError', 'OverconstrainedError']) {
  const w = await world('it-IT', { permission: 'prompt', gumError }); const permission = await w.SP.requestPermission();
  check(`permission/${gumError} explicit request failure`, () => { assert.equal(permission.state, gumError === 'NotAllowedError' ? 'denied' : 'unavailable'); assert.equal(permission.onDevice, false); assert.equal(w.SP.active(), false); });
}
const permission = await world('de-DE', { permission: 'prompt' }); await permission.SP.requestPermission();
check('explicit permission closes its temporary GUM capture', () => { assert.equal(permission.SP.permission().state, 'granted'); assert.ok(permission.streams.every(s => s.track.stopCount === 1)); assert.equal(permission.recs.length, 0); });
const failed = outcomes.filter(x => x.status === 'failed');
const report = { sourceRef: ref || 'working-tree', sourcePath: path, sourceSha256: createHash('sha256').update(source).digest('hex'), passed: outcomes.length - failed.length, failed: failed.length, total: outcomes.length, locales: cases.map(x => x[0]), realMicrophone: false, osPrompts: false, networkRequests: 0, scope: 'Actual shipping wrapper and actual visibilitychange handler, with fake Recognition/GUM/audio/timers. Browser may use cloud speech; onDevice:false and consent guard are preserved.', outcomes };
if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(`Web speech pipeline: ${report.passed}/${report.total} passed; ${report.failed} failed${ref ? ` against ${ref}` : ''}. No real microphone, OS prompts or network.`);
if (failed.length) process.exitCode = 1;
