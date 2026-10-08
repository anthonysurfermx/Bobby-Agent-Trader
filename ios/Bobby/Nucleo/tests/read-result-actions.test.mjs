// Runs the shipping FSM, springs, voice event guards and presentation acknowledgment.
// DOM measurements are adapters: this does not prove WebKit layout or physical iPhone audio.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const webSource = process.env.NUCLEO_SOURCE_ROOT === 'web';
const read = path => fs.readFileSync(new URL(webSource && path.startsWith('../src/')
  ? path.replace('../src/', '../../../../nucleo/src/') : path, import.meta.url), 'utf8');
const core = read('../src/app/10-core.js');
const fsm = read('../src/app/60-fsm.js');
const narration = read('../src/app/55-read.js');
const boot = read('../src/app/99-boot.js');
const input = read('../src/app/70-input.js');
const sourceFunction = (source, name) => {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing shipping function ' + name);
  const open = source.indexOf('{', start);
  let depth = 1, end = open + 1;
  for (; depth && end < source.length; end++) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
  }
  assert.equal(depth, 0, 'unbalanced function ' + name);
  return source.slice(start, end);
};
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const node = () => ({ textContent: '', style: {}, attributes: {}, setAttribute(k, v) { this.attributes[k] = v; } });

function harness({ state = 'THINK_RESOLVE', voice = 'queued', verdict = 'wait', chart = true, reducedMotion = false } = {}) {
  const calls = [], events = new Map(), pending = [], pendingSaves = [], errors = [], cards = [node(), node(), node()];
  cards.forEach(c => { c.getBoundingClientRect = () => ({ left: 30, top: 244, right: 360, bottom: 570, width: 330, height: 326 }); });
  const context = vm.createContext({
    PI: Math.PI, TAU: 2 * Math.PI, RM: reducedMotion, HARNESS: false, FREEZE: false,
    TM: { resp: 1, mass: 1, breath: 5.6, drift: 1, flow: 1 }, ME: { tint: [0.3, 0.2, 0.6] },
    E: { fade: u => u, lin: u => u, data: u => u, inhale: u => u }, C: { pearl: [] },
    VC: { wait: { c: [1, .6, .2] }, review: { c: [.2, 1, .6] } },
    LANG: 'en', LOCALE: 'en-US', dirty: false, LEDGER: [], SAVED: null,
    clamp: (x, a, b) => Math.max(a, Math.min(b, x)), lerp: (a, b, t) => a + (b - a) * t,
    sstep: (a, b, x) => Math.max(0, Math.min(1, (x - a) / (b - a))),
    fin: v => typeof v === 'number' && Number.isFinite(v),
    tt: key => key, logErr: (where, error) => errors.push([where, String(error)]),
    att: (element, key, value) => element.setAttribute(key, value), lvlSync() {},
    hintRoll: { set() {} }, swipeRoll: { set() {} }, vfRoll: { set() {} },
    saveRoll: { text: '', set(value) { this.text = value; } },
    op: (element, opacity) => { element.style.opacity = opacity; }, setXpArc() {},
    withNudge: list => list, nudgeEyebrow: () => false, HZ: 24,
    BR: {
      on: (event, handler) => events.set(event, handler),
      call(method, params) {
        calls.push({ method, params });
        if (method === 'speak') return new Promise((resolve, reject) => pending.push({ resolve, reject }));
        if (method === 'saveThesis') return new Promise((resolve, reject) => pendingSaves.push({ resolve, reject }));
        return Promise.resolve({ accepted: true, count: 1 });
      },
    },
    el: { sphereA: node(), pill: node(), say: [node(), node()], cards, agSt: [node(), node()], cioSw: node(),
      vWord: node(), convL: node(), meta: node(), card1: { hz: node(), xp: node() } },
    W: { innerWidth: 390, innerHeight: 844, getComputedStyle: () => ({ visibility: 'visible', display: 'block', opacity: '1' }) },
    canRun: () => true, PAGES: [], CAPS: [], capCur: -1, CAP_TALK: 488,
    applySession() {}, accountChanged() {}, consentWithdrawn() {}, nudgeSync() {}, onStage() {}, askStart() {}, lvlApply() {}, refreshCollections() {},
    buildPages(spoken) { context.PAGES = spoken.sentences.map(text => ({ text, h: 54 })); },
    capsReset() { context.capCur = -1; }, capsOff() { context.capCur = -1; },
    fillSats() {}, buildChart() {}, fitNext() {}, whenLabel: () => '', dockAsset() {},
    fillCards(model) { cards[0].textContent = model.debate.title; cards[1].textContent = model.thesis.title; },
    chipsShow(list) { context.A.chips = list; }, chipsHide() { context.A.chips = []; },
  });
  context.window = context;
  vm.runInContext(read('../src/shared/20-read-model.js'), context);
  context.RMOD = context.NucleoReadModel;
  vm.runInContext(core.slice(core.indexOf('var CFG ='), core.indexOf('/* =====================================================================\n   4. Stage fit')), context);
  vm.runInContext(read('../src/app/50-actors.js'), context);
  context.buildState();
  vm.runInContext(narration.slice(0, narration.indexOf('/* =====================================================================\n   The read:')), context);
  // Browser telemetry is a separate build-time adapter; it does not use native read.rendered.
  if (!webSource) vm.runInContext(sourceFunction(narration, 'observePresentedRead'), context);
  vm.runInContext(sourceFunction(input, 'tapG'), context);
  vm.runInContext(fsm, context);
  // Stance span measurements are irrelevant to the ready-result transition, but its real cues still run.
  context.stancesSet = () => { context.A.ag[2].stW = ['ready', 'stance']; };
  context.SES = { signedIn: true, riskAccepted: true, xp: 17, hints: { verdictPull: 3 }, mic: { state: 'granted' } };
  context.SUGG = {};
  context.READ_SEQ = 1; context.READS_DONE = 2;
  const reply = JSON.parse(read('../fixtures/ask/nvda.json'));
  reply.requestId = '8ebde935-4733-4ab2-a8b1-95c4af35de27';
  reply.agents.verdict = verdict;
  const model = context.RMOD.build(reply, { lang: 'en', signedIn: true });
  if (!chart) model.chart = null;
  const result = context.READ = { reply, model, requestId: reply.requestId, question: 'What changed?', accepted: true };
  context.prepRead(model);
  context.ST = { name: state, t0: context.clk, data: {} };
  context.A.mode = 'stop';
  if (voice === 'queued' || voice === 'speaking') {
    context.VOICE.id = result.requestId;
    context.VOICE.started = voice === 'speaking'; context.VOICE.ended = false; context.VOICE.silent = false;
    context.K.on = voice === 'speaking'; context.K.t = voice === 'speaking' ? 3 : 0;
  } else {
    context.VOICE.id = voice === 'restored' ? null : result.requestId;
    context.VOICE.started = voice === 'finished'; context.VOICE.ended = true;
    context.VOICE.silent = voice !== 'finished'; context.K.on = true;
  }
  vm.runInContext(sourceFunction(boot, 'savedReadOpen') + '\n' + sourceFunction(boot, 'wire'), context); context.wire();
  return {
    context, result, calls, pending, pendingSaves, errors, cards,
    emit: (name, params) => events.get(name)?.(params),
    tap(hit) { const gesture = context.STATES[context.ST.name].down(hit, {}, null); gesture?.up({ moved: false }); return gesture; },
    advance(seconds) {
      for (let i = 0; i < Math.ceil(seconds * 240); i++) { context.clk += 1 / 240; context.runQue(); context.stepAll(1 / 240); }
    },
  };
}

for (const state of ['THINK_RESOLVE', 'TALK_EVIDENCE', 'TALK_CHART', 'VERDICT', 'HANDBACK']) {
  test(state + ': skip voice immediately settles the actual verdict/chart and preserves the completed read', () => {
    const h = harness({ state });
    const reply = JSON.stringify(h.result.reply), model = JSON.stringify(h.result.model), count = h.context.READS_DONE;
    assert.equal(h.context.skipReadVoice(), true);
    assert.equal(h.context.ST.name, 'HANDBACK');
    assert.equal(h.context.READ, h.result); assert.equal(JSON.stringify(h.result.reply), reply); assert.equal(JSON.stringify(h.result.model), model);
    assert.equal(h.context.READS_DONE, count); assert.equal(h.context.VOICE.id, null); assert.equal(h.context.K.on, false);
    assert.equal(h.context.A.chartExit, 1e9); assert.ok(h.context.A.chartT0 < h.context.clk);
    assert.equal(h.context.A.vCond.t, 1); assert.equal(h.context.U.flood.t, 1.1);
    assert.equal(h.cards[0].textContent, h.result.model.debate.title); assert.equal(h.context.A.cardsOn, false);
    if (!webSource) { h.context.observePresentedRead(); h.context.observePresentedRead(); }
    assert.deepEqual(h.calls.map(c => c.method), ['stopSpeaking']);
    const gen = h.context.GEN;
    assert.equal(h.context.skipReadVoice(), true); assert.equal(h.context.GEN, gen); assert.equal(h.calls.length, 1);
    assert.deepEqual(h.errors, []);
  });
}

for (const voice of ['queued', 'speaking', 'finished', 'muted', 'failed', 'restored']) {
  test(voice + ': result opens the existing card 0 with a compact animated sphere and honest acknowledgment', () => {
    const h = harness({ voice, state: voice === 'restored' ? 'HANDBACK' : 'THINK_RESOLVE' });
    h.context.A.trk.set(-340); h.context.A.cardIdx = 1;
    assert.equal(h.context.showReadResult(), true);
    assert.equal(h.context.ST.name, 'CARDS'); assert.equal(h.context.READ, h.result);
    assert.equal(h.context.K.on, false); assert.equal(h.context.VOICE.id, null);
    assert.equal(h.context.A.cardIdx, 0); assert.equal(h.context.A.trk.x, 0); assert.equal(h.context.A.cardsOn, true);
    assert.ok(h.context.A.rev.slice(0, h.context.A.nCards).every(v => v.x === 1));
    assert.equal(h.context.S.cy.t, 158); assert.equal(h.context.S.r.t, 44);
    assert.notEqual(h.context.S.r.x, 44, 'uses the existing spring integrator rather than replacing it');
    assert.equal(h.context.VERD, h.context.VC.wait);
    assert.equal(h.result.presented, undefined, 'opening cards does not manufacture presentation');
    if (!webSource) {
      h.context.observePresentedRead(); assert.equal(h.result.presented, undefined);
      h.context.observePresentedRead(); h.context.observePresentedRead();
      assert.deepEqual(h.calls.map(c => c.method), ['stopSpeaking', 'read.rendered']);
      assert.deepEqual(Object.keys(h.calls[1].params), ['requestId']); assert.equal(h.calls[1].params.requestId, h.result.requestId);
    } else assert.deepEqual(h.calls.map(c => c.method), ['stopSpeaking']);
    h.advance(2); assert.ok(Math.abs(h.context.S.r.x - 44) < .01); assert.ok(Math.abs(h.context.S.cy.x - 158) < .01);
    assert.deepEqual(h.errors, []);
  });
}

test('skipping before the queued speak cue cancels it and does not issue a late narration', () => {
  const h = harness(); h.context.go('THINK_RESOLVE');
  h.tap('read-result'); h.advance(12); h.context.speakRead();
  assert.equal(h.context.ST.name, 'CARDS'); assert.ok(!h.calls.some(c => c.method === 'speak'));
  assert.deepEqual(h.errors, []);
});

test('late queued speech replies and start/progress/word/end events cannot restart the skipped result', async () => {
  for (const reject of [false, true]) {
    const h = harness(); h.context.speakRead(); h.context.skipReadVoice();
    if (reject) h.pending[0].reject(new Error('late voice request failure')); else h.pending[0].resolve({ status: 'queued' });
    await flush();
    const time = h.context.K.t;
    for (const [name, params] of [
      ['voice.start', { durationSec: 120 }], ['voice.level', { level: .8 }],
      ['voice.progress', { duration: 120, t: 1 }], ['voice.word', { index: 1 }], ['voice.end', { reason: 'failed' }],
    ]) h.emit(name, { id: h.result.requestId, ...params });
    assert.equal(h.context.ST.name, 'HANDBACK'); assert.equal(h.context.K.on, false); assert.equal(h.context.K.t, time);
    assert.equal(h.context.VOICE.started, false); assert.equal(h.context.VOICE.lvl, 0); assert.equal(h.context.VOICE.id, null);
    assert.equal(h.context.showReadResult(), true); assert.equal(h.calls.filter(c => c.method === 'stopSpeaking').length, 1);
    assert.deepEqual(h.errors, []);
  }
});

test('missing, pending, failed or invalid reads and unrelated states cannot open a result or stop an analysis', () => {
  for (const mutate of [
    c => { c.READ = null; }, c => { c.READ.reply = null; }, c => { c.READ.reply.status = 'error'; },
    c => { c.READ.model = null; }, c => { c.READ.requestId = null; },
    c => { c.ST.name = 'THINK_WAIT'; }, c => { c.ST.name = 'IDLE'; }, c => { c.ST.name = 'SAVING'; },
  ]) {
    const h = harness(); mutate(h.context);
    assert.equal(h.context.skipReadVoice(), false); assert.equal(h.context.showReadResult(), false);
    assert.equal(h.context.readActionDown('read-result'), null); assert.equal(h.calls.length, 0);
  }
});

test('result actions use tap release, respect cancellation and never act on a replaced read', () => {
  const h = harness(); const g = h.context.readActionDown('read-result');
  assert.equal(h.context.ST.name, 'THINK_RESOLVE'); g.cancel(); assert.equal(h.calls.length, 0);
  const stale = h.context.readActionDown('read-result'); h.context.READ = { ...h.result }; stale.up({ moved: false });
  assert.equal(h.context.ST.name, 'THINK_RESOLVE'); assert.equal(h.calls.length, 0);
  h.tap('read-result'); assert.equal(h.context.ST.name, 'CARDS'); assert.deepEqual(h.errors, []);
});

test('the existing stop pill reaches the verdict without waiting for karaoke and result button reaches cards', () => {
  const h = harness({ state: 'TALK_CHART', voice: 'speaking' });
  h.tap('pill'); assert.equal(h.context.ST.name, 'HANDBACK');
  h.tap('read-result'); assert.equal(h.context.ST.name, 'CARDS');
  assert.equal(h.calls.filter(c => c.method === 'stopSpeaking').length, 1); assert.deepEqual(h.errors, []);
});

test('review/no-chart result retains its actual palette and ring in reduced motion', () => {
  const h = harness({ verdict: 'review', chart: false, reducedMotion: true });
  h.tap('read-result');
  assert.equal(h.context.VERD, h.context.VC.review); assert.equal(h.context.A.chartT0, 1e9);
  assert.equal(h.context.A.ringFill.t, h.result.model.ring.mode === 'conviction' ? h.result.model.ring.pct / 100 : 1);
  assert.equal(h.context.S.r.x, 44); assert.equal(h.context.S.cy.x, 158); assert.deepEqual(h.errors, []);
});

function beginSave(options) {
  const h = harness(options); h.context.showReadResult(); h.tap('read-save');
  assert.equal(h.context.ST.name, 'SAVING'); assert.equal(h.pendingSaves.length, 1);
  return h;
}
function savedResult(h, awardedXP = 20) {
  return { status: 'saved', requestId: h.result.requestId, awardedXP, xp: 17 + awardedXP,
    level: { number: 1, progress: .3 }, streak: 2,
    thesis: { id: h.result.requestId, symbol: h.result.model.symbol },
    followUp: { kind: 'in_app', name: 'Micron', availableFrom: '2026-10-09T08:00:00Z' } };
}

test('saving awaits the native write without optimistic saved, XP or follow-up state', () => {
  const h = beginSave(); h.advance(12);
  assert.equal(h.context.ST.name, 'SAVING'); assert.equal(h.result.savePending, true); assert.equal(h.result.save, null);
  assert.equal(h.context.SAVED, null); assert.equal(h.context.LEDGER.length, 0); assert.equal(h.context.SES.xp, 17);
  assert.equal(h.context.A.saved.t, 0); assert.equal(h.context.saveRoll.text, 'read.saving');
  const saveCall = h.calls.find(c => c.method === 'saveThesis');
  assert.equal(saveCall.params.requestId, h.result.requestId); assert.equal(saveCall.params.keepInApp, true);
  h.tap('read-save'); h.tap('save'); assert.equal(h.pendingSaves.length, 1, 'repeated presses do not duplicate the write');
  assert.ok(!h.calls.some(c => ['ask', 'cancel', 'read.rendered'].includes(c.method))); assert.deepEqual(h.errors, []);
});

for (const status of ['failed', 'stale', 'rejected']) {
  test(status + ': unsuccessful save returns to cards, restores the save control and permits retry', async () => {
    const h = beginSave({ verdict: 'review' });
    if (status === 'rejected') h.pendingSaves[0].reject(new Error('native write failed'));
    else h.pendingSaves[0].resolve({ status });
    await flush();
    assert.equal(h.context.ST.name, 'CARDS'); assert.equal(h.result.savePending, false);
    assert.equal(h.context.A.saved.t, 0); assert.equal(h.context.saveRoll.text, h.result.model.thesis.saveLabel);
    assert.equal(h.context.el.card1.hz.style.opacity, h.result.model.thesis.horizon.show ? 1 : 0);
    assert.equal(h.context.SAVED, null); assert.equal(h.context.LEDGER.length, 0); assert.equal(h.context.SES.xp, 17);
    h.tap('read-save'); assert.equal(h.context.ST.name, 'SAVING'); assert.equal(h.pendingSaves.length, 2);
    assert.deepEqual(h.errors, []);
  });
}

for (const awardedXP of [20, 0]) {
  test('confirmed save (' + awardedXP + ' XP) alone advances to follow-ups with the native result', async () => {
    const h = beginSave(), saved = savedResult(h, awardedXP);
    h.pendingSaves[0].resolve(saved); await flush();
    assert.equal(h.context.ST.name, 'FOLLOWUPS'); assert.equal(h.result.savePending, false); assert.equal(h.result.save, saved);
    assert.equal(h.context.SAVED, saved); assert.equal(h.context.SES.xp, saved.xp); assert.equal(h.context.A.saved.t, 1);
    assert.equal(h.context.LEDGER[0].id, h.result.requestId); assert.equal(h.context.saveRoll.text, h.result.model.thesis.savedLabel);
    assert.equal(h.result.save.followUp, saved.followUp, 'follow-up timing and name come only from native confirmation');
    assert.equal(h.context.el.card1.xp.textContent, h.context.RMOD.xpChip(awardedXP, h.result.model.verdict.key, 'en'));
    h.tap('read-save'); h.tap('save'); assert.equal(h.pendingSaves.length, 1);
    assert.ok(!h.calls.some(c => ['ask', 'cancel'].includes(c.method)), 'saving itself does not start another analysis');
    assert.deepEqual(h.errors, []);
  });
}

test('late save result from a replaced account/read cannot restore saved content, XP or follow-ups', async () => {
  for (const status of ['saved', 'failed']) {
    const h = beginSave(), replacement = { requestId: 'replacement-read', model: {} };
    h.context.READ = replacement; h.context.ST = { name: 'IDLE' };
    h.pendingSaves[0].resolve(status === 'saved' ? savedResult(h) : { status }); await flush(); h.advance(2);
    assert.equal(h.context.READ, replacement); assert.equal(h.context.ST.name, 'IDLE'); assert.equal(replacement.save, undefined);
    assert.equal(h.context.SAVED, null); assert.equal(h.context.LEDGER.length, 0); assert.equal(h.context.SES.xp, 17);
    assert.equal(h.context.A.saved.t, 0); assert.deepEqual(h.errors, []);
  }
});

test('post-read gestures held across an account/read/state reset do nothing on release', () => {
  for (const hit of ['read-save', 'read-home', 'read-details', 'read-next']) {
    for (const reset of ['account', 'replacement', 'generation']) {
      const h = harness({ state: 'CARDS' });
      h.context.A.cardIdx = 1; h.context.A.trk.set(-340); h.context.A.dscr.set(55);
      const gesture = h.context.postReadActionDown(hit); assert.ok(gesture);
      if (reset === 'account') { h.context.READ = null; h.context.ST = { name: 'RETURNING', t0: h.context.clk, data: {} }; }
      else if (reset === 'replacement') h.context.READ = { requestId: 'new-read', model: {} };
      else h.context.GEN++;
      const state = h.context.ST.name;
      gesture.up({ moved: false });
      assert.equal(h.context.ST.name, state, hit + ': ' + reset);
      assert.equal(h.context.A.cardIdx, 1); assert.equal(h.context.A.trk.t, -340); assert.equal(h.context.A.dscr.t, 55);
      assert.equal(h.pendingSaves.length, 0); assert.deepEqual(h.errors, []);
    }
  }
  for (const change of ['pending', 'saved']) {
    const h = harness({ state: 'CARDS' }), gesture = h.context.postReadActionDown('read-save');
    if (change === 'pending') h.result.savePending = true; else h.result.save = { status: 'saved' };
    gesture.up({ moved: false });
    assert.equal(h.context.ST.name, 'CARDS'); assert.equal(h.pendingSaves.length, 0); assert.deepEqual(h.errors, []);
  }
  const stored = harness({ state: 'THESIS_VIEW' });
  stored.context.STATES.THESIS_VIEW.back = 'IDLE';
  const back = stored.context.STATES.THESIS_VIEW.down('read-home', {}, null);
  assert.ok(back);
  stored.context.GEN++; stored.context.ST = { name: 'CARDS', t0: stored.context.clk, data: {} };
  back.up({ moved: false });
  assert.equal(stored.context.ST.name, 'CARDS', 'a held home action from an old stored card cannot close a new result');
  assert.deepEqual(stored.errors, []);
});

test('saving directly from handback reveals the summary and waits for the real save acknowledgment', async () => {
  const h = harness({ state: 'HANDBACK', voice: 'queued' }), model = JSON.stringify(h.result.model);
  h.tap('read-save');
  assert.equal(h.context.ST.name, 'SAVING'); assert.equal(h.context.READ, h.result);
  assert.equal(JSON.stringify(h.result.model), model); assert.equal(h.pendingSaves.length, 1);
  assert.equal(h.context.A.cardIdx, 0); assert.equal(h.context.A.cardsOn, true); assert.equal(h.context.A.trk.t, 0);
  assert.equal(h.context.S.r.t, 44); assert.equal(h.context.S.cy.t, 158); assert.equal(h.context.VOICE.id, null);
  assert.equal(h.result.savePending, true); assert.equal(h.result.save, null); assert.equal(h.context.SES.xp, 17);
  assert.ok(!h.calls.some(c => ['ask', 'cancel', 'read.rendered'].includes(c.method)));
  h.pendingSaves[0].resolve(savedResult(h)); await flush();
  assert.equal(h.context.ST.name, 'FOLLOWUPS'); assert.equal(h.result.save.status, 'saved'); assert.deepEqual(h.errors, []);
});
