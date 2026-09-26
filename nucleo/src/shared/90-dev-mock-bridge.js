/* Núcleo DEV mock bridge (ARCHITECTURE.md §4.3). Dev builds only: build.py drops
 * every src/shared/9*-dev-*.js file under --release.
 *
 * Installs itself only when there is NO native handler (browser at
 * http://localhost:4614/Resources/Nucleo/app.html). Answers every bridge
 * method from window.NUCLEO_FIXTURES (inlined by build.py) and fakes speech
 * and voice with syllable envelopes. It never touches the network.
 *
 * URL params: scenario=default|slow|hang|quota|too_long|failed|unavailable|gateway_timeout|offline
 *             lang=en|es  first=1  signedIn=1  risk=0  muted=1  companion=<iOS id>  mic=granted|denied|undetermined|unavailable
 *             say=<text for the fake STT>  latency=<desk ms>  xp=<int>  streak=<int>  rm=1
 * Determinism: engines that own a sim clock call nucleoBridge.mock.useClock(fn) and then
 * nucleoBridge.mock.pump() once per sim step; otherwise a real-time pump runs at 60 Hz.
 */
(function () {
  'use strict';
  var B = window.nucleoBridge;
  if (!B || B.native) return;
  var FX = window.NUCLEO_FIXTURES;
  if (!FX) { console.warn('[mock] no NUCLEO_FIXTURES (release build?)'); return; }

  var q = new URLSearchParams(location.search);
  var scenario = q.get('scenario') || 'default';
  var lang = q.get('lang') === 'es' ? 'es' : 'en';
  function now() { return clock(); }
  var clock = function () { return performance.now(); };
  var timers = [];
  var seq = 0;
  function at(ms, fn) { var id = ++seq; timers.push({ due: now() + ms, fn: fn, id: id }); timers.sort(function (a, b) { return a.due - b.due || a.id - b.id; }); return id; }
  function clear(id) { timers = timers.filter(function (x) { return x.id !== id; }); }
  function pump() {
    var t = now(), guard = 0;
    while (timers.length && timers[0].due <= t && guard++ < 500) { var x = timers.shift(); try { x.fn(); } catch (e) { console.error('[mock]', e); } }
  }
  var external = false, realPump = setInterval(function () { if (!external) pump(); }, 16);
  /** Repeating timer on the same (possibly sim) clock; returns a handle for stopEvery(). */
  function every(ms, fn) { var h = { on: true, id: 0 }; (function loop() { if (!h.on) return; fn(); h.id = at(ms, loop); })(); return h; }
  function stopEvery(h) { if (h) { h.on = false; clear(h.id); } }

  // mulberry32, seeded: fake STT/voice timing is identical on every run.
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var rand = rng(20260926);

  var roster = FX.native.roster.companions;
  var levels = FX.native.levels.levels;
  var state = {
    firstRun: q.get('first') === '1',
    signedIn: q.get('signedIn') === '1',
    riskVersion: q.get('risk') === '0' || q.get('first') === '1' ? 0 : 4,
    muted: q.get('muted') === '1',
    companionId: q.get('first') === '1' ? null : (q.get('companion') || 'mira'),
    xp: +(q.get('xp') || (q.get('first') === '1' ? 0 : 120)),
    streak: +(q.get('streak') || (q.get('first') === '1' ? 0 : 3)),
    mic: q.get('mic') || 'undetermined',
    dailyAwards: 0,
    theses: [],
    hints: {},
    saved: {},
    lastOk: {},
    tokens: {},
    inflight: null
  };

  function level() {
    var cur = levels[0], next = null;
    for (var i = 0; i < levels.length; i++) if (state.xp >= levels[i].minXP) cur = levels[i];
    for (var j = 0; j < levels.length; j++) if (levels[j].minXP > state.xp) { next = levels[j]; break; }
    var progress = next ? (state.xp - cur.minXP) / (next.minXP - cur.minXP) : 1;
    return { number: cur.number, name: cur[lang], progress: Math.max(0, Math.min(1, progress)), nextMinXP: next ? next.minXP : null };
  }
  function companion() {
    if (!state.companionId) return null;
    var c = roster.filter(function (x) { return x.id === state.companionId; })[0];
    return c ? { id: c.id, webId: c.webId, label: c.label, palette: c.palette, voicePersona: c.voicePersona } : null;
  }
  function session() {
    return {
      v: 1, page: document.body && document.body.dataset.page || null,
      firstRun: state.firstRun, onboarded: !state.firstRun && !!state.companionId,
      language: lang, localHour: new Date().getHours(),
      companion: companion(), xp: state.xp, level: level(), streak: state.streak,
      signedIn: state.signedIn, riskAccepted: state.riskVersion >= 4, riskVersion: 4,
      muted: state.muted, reducedMotion: q.get('rm') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches,
      mic: micState(), hints: state.hints, pendingRead: null,
      fixtures: true, platform: 'web-mock', appVersion: 'mock'
    };
  }
  /** Native sends session.changed after setCompanion, acceptRisk, signIn, saveThesis, setMuted. */
  function sessionChanged() {
    var s = session();
    at(0, function () { B.emit('session.changed', session()); });
    return s;
  }
  function micState() {
    var onDevice = state.mic !== 'unavailable';
    return { state: state.mic, onDevice: onDevice };
  }
  function ok(result) { return { v: 1, ok: true, result: result }; }
  function fault(code, message) { return { v: 1, ok: false, error: { code: code, message: message || code } }; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function uuid() { var s = ''; for (var i = 0; i < 32; i++) s += Math.floor(rand() * 16).toString(16); return s.slice(0, 8) + '-' + s.slice(8, 12) + '-4' + s.slice(13, 16) + '-8' + s.slice(17, 20) + '-' + s.slice(20); }
  function emitLater(ms, name, payload) { return at(ms, function () { B.emit(name, payload); }); }

  // ---- ask ---------------------------------------------------------------
  function matchQuestion(text) {
    var s = ' ' + String(text).toLowerCase() + ' ';
    var rules = FX.manifest.assetSearch;
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (!r.contains.length) return r.ask;
      for (var j = 0; j < r.contains.length; j++) if (s.indexOf(r.contains[j]) >= 0) return r.ask;
    }
    return 'unknown';
  }
  function codePoints(s) { return Array.from(String(s).trim()).length; }

  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  function given(v) { return v !== undefined && v !== null; }

  function ask(p) {
    // Order (same as native): params -> busy -> risk gate -> length -> token/followUp -> network.
    // Params: exactly one of {question} | {token} | {followUpOf, question}.
    var hasQ = typeof p.question === 'string' && p.question.trim().length > 0;
    if (given(p.token)) {
      if (typeof p.token !== 'string' || !p.token || p.token.length > 128) return Promise.resolve(fault('invalid_params', 'token'));
      if (given(p.question) || given(p.followUpOf)) return Promise.resolve(fault('invalid_params', 'token takes no question'));
    } else {
      if (given(p.followUpOf) && (typeof p.followUpOf !== 'string' || !UUID_RE.test(p.followUpOf))) return Promise.resolve(fault('invalid_params', 'followUpOf'));
      if (!hasQ) return Promise.resolve(fault('invalid_params', 'question required'));
    }
    if (state.inflight) return Promise.resolve(fault('busy', 'a read is already running'));
    if (state.riskVersion < 4) return Promise.resolve(ok(clone(FX.ask.risk)));
    var question = hasQ ? p.question.trim() : '';
    if (!given(p.token) && codePoints(question) > 1200) return Promise.resolve(ok(clone(FX.ask.too_long)));
    var key;
    if (given(p.token)) {
      var tok = state.tokens[p.token];
      if (!tok) return Promise.resolve(fault('invalid_params', 'unknown token'));
      delete state.tokens[p.token];
      question = tok.question; key = tok.next;
    } else if (given(p.followUpOf)) {
      var prev = state.lastOk[p.followUpOf];
      if (!prev) return Promise.resolve(fault('invalid_params', 'unknown followUpOf'));
      key = prev;
    } else {
      key = matchQuestion(question);
    }
    if (key === 'confirm-fuzzy' || key === 'confirm-proxy') {
      var c = clone(FX.ask[key]);
      c.token = 'mock-' + uuid();
      state.tokens[c.token] = { question: question, next: key === 'confirm-fuzzy' ? 'nvda' : 'unsupported-proxy' };
      return delay(300, ok(c));
    }
    if (key === 'unknown') { var u = clone(FX.ask.unknown); u.query = question; return delay(300, ok(u)); }
    if (key === 'unsupported-proxy') return delay(300, ok(clone(FX.ask['unsupported-proxy'])));
    return runRead(key, question);
  }
  function delay(ms, value) { return new Promise(function (res) { at(ms, function () { res(value); }); }); }

  function runRead(key, question) {
    var base = FX.ask[key];
    var requestId = uuid();
    var startedAt = Date.now();
    return new Promise(function (resolve) {
      var ids = [];
      state.inflight = { requestId: requestId, resolve: resolve, ids: ids };
      B.emit('ask.stage', { requestId: requestId, stage: 'resolving' });
      if (scenario === 'offline') { ids.push(at(600, function () { finish(clone(FX.ask.network)); })); return; }
      ids.push(emitLater(350, 'ask.stage', { requestId: requestId, stage: 'accepted', asset: clone(base.asset), startedAt: startedAt }));
      ids.push(emitLater(700, 'ask.stage', { requestId: requestId, stage: 'market', market: clone(base.market) }));
      ids.push(emitLater(900, 'ask.stage', { requestId: requestId, stage: 'candles', candles: clone(base.candles), provenance: null }));
      var refusal = { quota: 'quota', too_long: 'too_long', failed: 'failed', unavailable: 'unavailable', gateway_timeout: 'gateway_timeout' }[scenario];
      var desk = +(q.get('latency') || (scenario === 'slow' ? 45000 : Math.min(base.elapsedMs || 5000, 6000)));
      if (scenario === 'hang') { ids.push(at(20000, function () { finish(clone(FX.ask.timeout)); })); return; }
      // The reply never overtakes its own stages: market + candles are always emitted first.
      ids.push(at(350 + Math.max(desk, 600), function () {
        if (refusal) return finish(clone(FX.ask[refusal]));
        var r = clone(base);
        r.requestId = requestId; r.question = question; r.language = r.language || lang;
        r.elapsedMs = desk; r.fixture = true;
        state.lastOk[requestId] = key;
        finish(r);
      }));
      function finish(result) { if (state.inflight && state.inflight.requestId === requestId) { state.inflight = null; resolve(ok(result)); } }
    });
  }
  function cancel() {
    var f = state.inflight;
    if (!f) return Promise.resolve(ok({ cancelled: false }));
    f.ids.forEach(clear);
    state.inflight = null;
    f.resolve(ok(clone(FX.ask.cancelled)));
    return Promise.resolve(ok({ cancelled: true }));
  }

  // ---- speech (fake STT) -------------------------------------------------
  var stt = null;
  function sayText() { return q.get('say') || 'Should I buy NVIDIA right now?'; }
  function speechStart() {
    if (state.mic === 'denied' || state.mic === 'restricted') return Promise.resolve(ok({ status: 'denied' }));
    if (state.mic === 'unavailable') return Promise.resolve(ok({ status: 'unavailable' }));
    if (state.mic === 'undetermined') return Promise.resolve(ok({ status: 'needs_permission' }));
    if (stt) return Promise.resolve(ok({ status: 'busy' }));
    stopVoice('stopped');
    var words = (B.mock.nextSay || sayText()).split(/\s+/).filter(Boolean);
    B.mock.nextSay = null;
    stt = { words: words, heard: 0, ids: [], t0: now() };
    B.emit('speech.state', { state: 'listening' });
    var t = 280;
    words.forEach(function (w, i) {
      t += 160 + rand() * 260 + (/[,.?!]$/.test(words[i - 1] || '') ? 220 : 0);
      stt.ids.push(at(t, function () { stt.heard = i + 1; B.emit('speech.partial', { text: words.slice(0, i + 1).join(' ') }); }));
    });
    stt.level = every(33, function () {
      if (!stt) return;
      var el = (now() - stt.t0) / 1000;
      var talking = stt.heard < stt.words.length || el < 0.4;
      var syl = Math.abs(Math.sin(el * Math.PI * 4.3)) * (0.55 + 0.45 * Math.sin(el * 1.7) ** 2);
      B.emit('speech.level', { level: talking ? Math.min(1, 0.08 + syl * 0.85) : 0.04 });
    });
    stt.cap = at(60000, function () { speechStop({}); });
    return Promise.resolve(ok({ status: 'listening' }));
  }
  function speechStop(p) {
    if (!stt) return Promise.resolve(ok({ status: 'idle' }));
    var s = stt; stt = null;
    s.ids.forEach(clear); clear(s.cap); stopEvery(s.level);
    B.emit('speech.state', { state: 'stopped' });
    var text = s.words.slice(0, s.heard).join(' ');
    if (!p || !p.cancel) emitLater(180, 'speech.final', { text: text });
    return Promise.resolve(ok({ status: 'stopped' }));
  }

  // ---- voice (fake TTS) --------------------------------------------------
  var voice = null;
  var SPEAK_ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
  function speak(p, bundledClip) {
    if (typeof p.text !== 'string' || !p.text.trim() || typeof p.id !== 'string' || !SPEAK_ID_RE.test(p.id)) return Promise.resolve(fault('invalid_params'));
    if (p.text.length > 800) return Promise.resolve(ok({ status: 'too_long' }));
    if (state.muted) return Promise.resolve(ok({ status: 'muted' }));
    // Native (R11): before the risk notice is accepted the network voice never runs; only the
    // bundled pick clips (previewVoice) play. The page then runs its silent reading clock.
    if (state.riskVersion < 4 && !bundledClip) return Promise.resolve(ok({ status: 'muted' }));
    stopVoice('stopped');
    var RM = window.NucleoReadModel;
    var dur = Math.max(0.8, p.text.split(/\s+/).length / 2.6);
    var times = RM ? RM.wordTimes(p.text, dur) : [];
    var v = voice = { id: p.id, ids: [], t0: null, dur: dur };
    v.ids.push(at(420, function () { // simulated TTS fetch latency
      v.t0 = now();
      B.emit('voice.start', { id: v.id, durationSec: dur, engine: 'mock' });
      times.forEach(function (w, i) { v.ids.push(at(w.t0 * 1000, function () { B.emit('voice.word', { id: v.id, index: i }); })); });
      v.lvl = every(42, function () {
        var el = (now() - v.t0) / 1000;
        var cur = times.filter(function (w) { return el >= w.t0 && el < w.t1; })[0];
        var env = cur ? Math.sin(Math.PI * (el - cur.t0) / Math.max(0.05, cur.t1 - cur.t0)) : 0;
        B.emit('voice.level', { id: v.id, level: Math.max(0.04, Math.min(1, 0.1 + env * 0.8)) });
        B.emit('voice.progress', { id: v.id, t: Math.min(el, dur), duration: dur });
      });
      v.ids.push(at(dur * 1000, function () { stopVoice('finished'); }));
    }));
    return Promise.resolve(ok({ status: 'queued' }));
  }
  function stopVoice(reason) {
    var v = voice; if (!v) return;
    voice = null; v.ids.forEach(clear); stopEvery(v.lvl);
    B.emit('voice.end', { id: v.id, reason: reason });
  }

  // ---- save / collections ------------------------------------------------
  function saveThesis(p) {
    if (typeof p.requestId !== 'string') return Promise.resolve(fault('invalid_params', 'requestId'));
    if (given(p.horizonHours) && [24, 72, 168].indexOf(p.horizonHours) < 0) return Promise.resolve(fault('invalid_params', 'horizonHours'));
    var key = state.lastOk[p.requestId];
    if (!key) return Promise.resolve(fault('invalid_params', 'unknown requestId'));
    if (state.saved[p.requestId]) return Promise.resolve(ok(state.saved[p.requestId]));
    var r = FX.ask[key];
    var wait = r.agents.verdict === 'wait';
    var points = state.dailyAwards < 3 ? (wait ? 20 : 10) : 0;
    if (points) state.dailyAwards++;
    var levelBefore = level().number;
    state.xp += points;
    var entry = { id: p.requestId, symbol: r.asset.symbol, name: r.asset.name, isEquity: r.asset.isEquity, verdict: r.agents.verdict,
      direction: r.agents.direction, price: r.market.price != null ? r.market.price : r.technicals.price,
      support: r.technicals.support, resistance: r.technicals.resistance, entry: null, stop: null, target: null,
      asOf: r.provenance.asOf, provider: r.provenance.provider, savedAt: new Date().toISOString(),
      horizonHours: r.agents.verdict === 'review' ? (p.horizonHours || 24) : null, points: points, synced: false };
    state.theses.unshift(entry);
    var res = { status: 'saved', thesis: entry, awardedXP: points, capped: points === 0,
      kind: wait ? 'no_trade_respected' : 'read_complete', xp: state.xp, level: level(), streak: state.streak,
      evolution: level().number > levelBefore ? { number: level().number, name: level().name } : null, unlocks: [],
      planting: !state.signedIn ? 'signed_out' : (points ? 'pending' : 'capped') };
    state.saved[p.requestId] = res;
    if (state.signedIn && points) emitLater(1500, 'thesis.planted', { requestId: p.requestId, stage: wait ? 'bloomed' : 'seed', piece: null, horizon: null });
    at(50, function () { B.emit('session.changed', session()); });
    return Promise.resolve(ok(res));
  }

  var methods = {
    'session': function (p) {
      if (given(p.page) && ['app', 'onboarding', 'contract'].indexOf(p.page) < 0) return Promise.resolve(fault('invalid_params', 'page'));
      return Promise.resolve(ok(session()));
    },
    'roster': function () { return Promise.resolve(ok({ companions: clone(roster) })); },
    'suggestions': function () {
      // Native: quickAccess = DeskMemory row, movers = live movers (none in fixtures, none before consent).
      return Promise.resolve(ok({ quickAccess: [{ symbol: 'BTC' }, { symbol: 'NVDA' }], movers: [] }));
    },
    'ask': ask,
    'cancel': cancel,
    'speech.permission': function () { return Promise.resolve(ok(micState())); },
    'speech.requestPermission': function () {
      if (state.mic === 'undetermined') state.mic = q.get('grant') === '0' ? 'denied' : 'granted';
      return delay(600, ok(micState()));
    },
    'speech.start': speechStart,
    'speech.stop': function (p) {
      if (given(p.cancel) && typeof p.cancel !== 'boolean') return Promise.resolve(fault('invalid_params', 'cancel'));
      return speechStop(p);
    },
    'speak': function (p) { return speak(p, false); },
    'previewVoice': function (p) {
      var c = roster.filter(function (x) { return x.id === p.companionId; })[0];
      if (!c) return Promise.resolve(fault('invalid_params'));
      return speak({ id: 'preview-' + c.id, text: c.selectLine }, true);
    },
    'stopSpeaking': function () { stopVoice('stopped'); return Promise.resolve(ok({})); },
    'setMuted': function (p) {
      if (typeof p.muted !== 'boolean') return Promise.resolve(fault('invalid_params', 'muted'));
      if (p.muted) stopVoice('stopped');
      state.muted = p.muted;
      return Promise.resolve(ok(sessionChanged()));
    },
    'haptic': function (p) {
      if (['light', 'soft', 'medium', 'rigid', 'heavy', 'selection', 'success', 'warning', 'error'].indexOf(p.kind) < 0) return Promise.resolve(fault('invalid_params', 'haptic kind'));
      if (q.get('debug') === '1') console.log('[haptic]', p.kind);
      return Promise.resolve(ok({}));
    },
    'saveThesis': saveThesis,
    'island': function () {
      return Promise.resolve(ok(state.signedIn ? { available: false, reason: 'fixtures' }
        : { available: false, reason: 'signed_out', pendingSeeds: state.theses.filter(function (x) { return x.points > 0; }).length }));
    },
    'theses': function () { return Promise.resolve(ok({ items: clone(state.theses) })); },
    'record': function () { return Promise.resolve(ok({ available: false, reason: 'no_source' })); },
    'setCompanion': function (p) {
      var c = roster.filter(function (x) { return x.id === p.id; })[0];
      if (!c || !c.unlocked) return Promise.resolve(fault('invalid_params', 'locked or unknown companion'));
      state.companionId = c.id;
      return Promise.resolve(ok(sessionChanged()));
    },
    'riskNotice': function () {
      var n = FX.native.riskNotice;
      return Promise.resolve(ok({ version: n.version, statements: clone(n.statements[lang]) }));
    },
    'acceptRisk': function (p) {
      if (typeof p.version !== 'number' || !Number.isInteger(p.version)) return Promise.resolve(fault('invalid_params', 'version'));
      // A stale version is a result, not a fault: the page re-reads riskNotice().
      if (p.version !== 4) return Promise.resolve(ok({ accepted: false, version: 4 }));
      state.riskVersion = 4;
      sessionChanged();
      return Promise.resolve(ok({ accepted: true, version: 4 }));
    },
    'signIn': function () {
      if (state.riskVersion < 4) return Promise.resolve(ok({ status: 'unavailable' }));
      var signedIn = q.get('signin') === 'ok';
      return delay(800, ok({ status: signedIn ? 'signedIn' : 'cancelled' })).then(function (r) {
        if (signedIn) { state.signedIn = true; sessionChanged(); }
        return r;
      });
    },
    'openNative': function (p) {
      if (['squad', 'locker', 'isla', 'account', 'riskNotice'].indexOf(p.route) < 0) return Promise.resolve(fault('invalid_params', 'route'));
      console.log('[mock] openNative', p.route);
      return Promise.resolve(ok({ opened: false, reason: 'mock' }));
    },
    'openClassic': function () { console.log('[mock] openClassic'); return Promise.resolve(ok({})); },
    'finishOnboarding': function () {
      var missing = [];
      if (!state.companionId) missing.push('companion');
      if (state.riskVersion < 4) missing.push('risk');
      if (missing.length) return Promise.resolve(ok({ status: 'incomplete', missing: missing }));
      state.firstRun = false;
      return Promise.resolve(ok({ next: 'app' }));
    },
    'markHint': function (p) {
      if (typeof p.key !== 'string' || !/^[a-z][A-Za-z0-9_.-]{0,31}$/.test(p.key)) return Promise.resolve(fault('invalid_params', 'key'));
      state.hints[p.key] = (state.hints[p.key] || 0) + 1;
      return Promise.resolve(ok({ count: state.hints[p.key] }));
    },
    'log': function (p) {
      if (['info', 'warn', 'error'].indexOf(p.level) < 0 || typeof p.message !== 'string' || p.message.length > 300) return Promise.resolve(fault('invalid_params', 'log'));
      console.log('[page]', p.level, p.message);
      return Promise.resolve(ok({}));
    }
  };

  B.installTransport(function (env) {
    if (!env || env.v !== 1 || typeof env.method !== 'string') return Promise.resolve(fault('bad_envelope'));
    var m = methods[env.method];
    if (!m) return Promise.resolve(fault('unknown_method', env.method));
    if (env.params != null && (typeof env.params !== 'object' || Array.isArray(env.params))) return Promise.resolve(fault('invalid_params', 'params must be an object'));
    return m(env.params || {});
  });

  B.mock = {
    scenario: scenario,
    state: state,
    nextSay: null,
    /** Hand the mock your sim clock (ms). Then call pump() once per sim step. */
    useClock: function (fn) {
      var before = now(), after = fn();
      timers.forEach(function (x) { x.due = after + (x.due - before); });
      clock = fn; external = true; clearInterval(realPump);
    },
    pump: pump,
    say: function (text) { B.mock.nextSay = text; },
    setMic: function (s) { state.mic = s; },
    reset: function () { location.reload(); }
  };
})();
