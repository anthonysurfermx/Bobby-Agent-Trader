/* Núcleo WEB transport, part 7: routing, the method table and the transport (ARCHITECTURE.md §1.3, §2).
 *
 * Routing (native NucleoRootView, §1.3), decided before the page boots:
 *   /nucleo/ (index.html = app)       not onboarded → onboarding.html; stale risk notice → onboarding.html#risk
 *   /nucleo/onboarding.html           already onboarded with the notice accepted (and no #risk) → /nucleo/
 *   finishOnboarding()                → fades to /nucleo/ (replace, so Back never replays the first run)
 * A page that is being redirected never answers session(), so its engine stays black (BOOT).
 */
(function () {
  'use strict';
  var NW = window.__nucleoWeb;
  var B = window.nucleoBridge;
  if (!NW || !B || B.native) return;
  var S = NW.state, D = NW.desk, SP = NW.speech, V = NW.voice, SH = NW.sheets, CFG = NW.cfg;
  var fault = D.fault;
  var MAX_ENVELOPE = 64 * 1024;
  var HINT_KEY = /^[a-z][A-Za-z0-9_.-]{0,31}$/;
  var HAPTICS = { light: 10, soft: 8, selection: 5, medium: 16, rigid: 12, heavy: 24, success: [12, 60, 12], warning: [20, 80, 20], error: [30, 60, 30, 60, 30] };

  var PAGE = document.body ? document.body.getAttribute('data-page') : null;
  var currentPage = null;

  /* ---- routing ---- */
  function hash() { return (location.hash || '').replace(/^#/, ''); }
  var redirecting = false;
  (function route() {
    var onboarded = S.onboarded(), risk = S.riskAccepted();
    var target = null;
    if (PAGE === 'app' && (!onboarded || !risk)) target = NW.ROUTES.onboarding + location.search + (onboarded ? '#risk' : '');
    else if (PAGE === 'onboarding' && onboarded && risk && hash() !== 'risk') target = NW.ROUTES.app + location.search;
    if (target) { redirecting = true; NW.navigate(target, { replace: true }); }
  })();

  /* The stage stays hidden (template style, build.py) until the engine has rendered a visible frame
     after the session reply: native covers the page load with a snapshot, the web with black.
     A page opened in a background tab waits until it is shown (the engines skip hidden frames). */
  var revealed = false;
  function reveal() {
    if (revealed) return;
    if (document.hidden) {
      document.addEventListener('visibilitychange', function shown() {
        if (document.hidden) return;
        document.removeEventListener('visibilitychange', shown);
        reveal();
      });
      return;
    }
    revealed = true;
    requestAnimationFrame(function () { requestAnimationFrame(function () { document.documentElement.classList.add('nw-live'); }); });
  }

  /* ---- session (§2.3) ---- */
  function companionJSON(id) {
    var c = id ? S.companion(id) : null;
    return c ? { id: c.id, webId: c.webId, label: c.label, palette: c.palette, voicePersona: c.voicePersona } : null;
  }
  function reducedMotion() { try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
  function sessionJSON() {
    var prof = S.profile(), prog = S.progress(), onboarded = prof.onboarded && !!prof.companionId;
    return {
      v: 1, page: currentPage, firstRun: !onboarded, onboarded: onboarded, language: NW.lang, localHour: new Date().getHours(),
      companion: companionJSON(prof.companionId), xp: prog.xp, level: S.levelJSON(prog.xp), streak: prog.streak,
      signedIn: false, signInAvailable: false,
      riskAccepted: prof.riskVersion >= S.RISK_VERSION, riskVersion: S.RISK_VERSION, muted: prof.muted, reducedMotion: reducedMotion(),
      mic: SP.permission(), hints: S.hints(), pendingRead: S.pendingRead(), fixtures: false, platform: 'web', appVersion: 'web ' + CFG.builtAt
    };
  }
  NW.emitSession = function () { NW.emit('session.changed', sessionJSON()); };
  function sessionChanged() { var s = sessionJSON(); NW.emit('session.changed', s); return s; }
  /** CompanionOnboarding.commitCompanion: the companion and its voice. Throws invalid_params when locked or unknown. */
  NW.commitCompanion = function (id) {
    var c = S.companion(id), prof = S.profile();
    if (!c || !(S.isUnlocked(c, S.progress().xp) || prof.companionId === id)) throw fault('invalid_params', 'locked or unknown companion');
    prof.companionId = c.id; prof.voiceId = c.voicePersona;
    S.saveProfile(prof);
    return sessionChanged();
  };

  /* ---- params (NucleoParams: exact types, unknown keys ignored) ---- */
  function given(v) { return v !== undefined && v !== null; }
  function str(p, key, o) {
    o = o || {};
    var v = p[key];
    if (!given(v)) { if (o.required === false) return null; throw fault('invalid_params', key + ' is required'); }
    if (typeof v !== 'string') throw fault('invalid_params', key + ' must be a string');
    if (o.max != null && Array.from(v).length > o.max) throw fault('invalid_params', key + ' too long');
    if (o.pattern && !o.pattern.test(v)) throw fault('invalid_params', key + ' is malformed');
    if (o.oneOf && o.oneOf.indexOf(v) < 0) throw fault('invalid_params', key + ' is not allowed');
    return v;
  }
  function bool(p, key, required) {
    var v = p[key];
    if (!given(v)) { if (required === false) return null; throw fault('invalid_params', key + ' is required'); }
    if (typeof v !== 'boolean') throw fault('invalid_params', key + ' must be a boolean');
    return v;
  }
  function int(p, key) {
    var v = p[key];
    if (typeof v !== 'number' || !Number.isInteger(v)) throw fault('invalid_params', key + ' must be an integer');
    return v;
  }

  /* ---- haptics: navigator.vibrate where it exists (Android), at most one per 40 ms; else nothing ---- */
  var lastHaptic = 0;
  function haptic(kind) {
    var now = performance.now();
    if (now - lastHaptic < 40) return;
    lastHaptic = now;
    var active = navigator.userActivation ? navigator.userActivation.hasBeenActive : NW.gestured;
    try { if (active && typeof navigator.vibrate === 'function') navigator.vibrate(HAPTICS[kind]); } catch (e) {}
  }

  /* ---- openNative: sheets for the notice, the squad and the account; Isla is the site's Trader Land page ---- */
  function openNative(route) {
    if (SH.isOpen()) return { opened: false };
    if (route === 'riskNotice') {
      // A read refused for consent sends the app page here: the risk beat (onboarding#risk) replaces it.
      if (currentPage === 'app' && !S.riskAccepted()) { NW.navigate(NW.ROUTES.onboarding + location.search + '#risk', { replace: true }); return { opened: true }; }
      return { opened: SH.riskNotice() };
    }
    if (route === 'account') return { opened: SH.account() };
    if (route === 'squad') return { opened: SH.squad() };
    if (route === 'isla') { NW.navigate(NW.ROUTES.isla); return { opened: true }; }
    return { opened: false };   // locker: no web equivalent yet
  }

  var M = {
    'session': function (p) {
      var page = str(p, 'page', { required: false, oneOf: ['app', 'onboarding', 'contract'] });
      if (redirecting) return new Promise(function () {});   // this page is leaving; its engine stays at BOOT
      if (page) currentPage = page;
      return SP.ready.then(function () { NW.markReady(); reveal(); return sessionJSON(); });
    },
    'roster': function () {
      var xp = S.progress().xp, chosen = S.profile().companionId;
      return { companions: CFG.companions.map(function (c) {
        return { id: c.id, webId: c.webId, label: c.label, role: c.role[NW.lang] || c.role.en, selectLine: c.selectLine[NW.lang] || c.selectLine.en,
          requiredLevel: c.requiredLevel, voicePersona: c.voicePersona, palette: c.palette, unlocked: S.isUnlocked(c, xp) || chosen === c.id };
      }) };
    },
    'suggestions': function () { return D.suggestions(); },
    'ask': function (p) { return D.ask(p); },
    'cancel': function () { return D.cancel(); },
    'speech.permission': function () { return SP.permission(); },
    'speech.requestPermission': function () { return SP.requestPermission().then(function (m) { sessionChanged(); return m; }); },
    'speech.start': function () { return { status: SP.start() }; },
    'speech.stop': function (p) { var cancel = bool(p, 'cancel', false); return { status: SP.stop({ cancel: cancel === true }) }; },
    'speak': function (p) {
      var id = str(p, 'id', { pattern: /^[A-Za-z0-9_.:-]{1,64}$/ }), text = str(p, 'text');
      if (!text.trim()) throw fault('invalid_params', 'text is empty');
      var c = S.companion(S.profile().companionId);
      return { status: V.speak(id, text, { essential: true, persona: (c && c.voicePersona) || S.profile().voiceId }) };
    },
    'previewVoice': function (p) {
      var id = str(p, 'companionId', { max: 32 }), c = S.companion(id);
      if (!c) throw fault('invalid_params', 'unknown companion');
      var clip = 'select-' + c.id + '-' + NW.lang;
      if (CFG.clips.indexOf(clip) < 0) {
        if (!S.riskAccepted()) return { status: 'muted' };
        clip = null;
      }
      return { status: V.speak('preview-' + c.id, c.selectLine[NW.lang] || c.selectLine.en, { clip: clip, essential: false, persona: c.voicePersona }) };
    },
    'stopSpeaking': function () { V.stop('stopped'); return {}; },
    'setMuted': function (p) {
      var muted = bool(p, 'muted');
      if (muted) V.stop('stopped');
      var prof = S.profile(); prof.muted = muted; S.saveProfile(prof);
      return sessionChanged();
    },
    'haptic': function (p) { haptic(str(p, 'kind', { oneOf: Object.keys(HAPTICS) })); return {}; },
    'saveThesis': function (p) { var r = D.saveThesis(p); sessionChanged(); return r; },
    'island': function () { return D.island(); },
    'theses': function () { return D.theses(); },
    'record': function () { return D.record(); },
    'setCompanion': function (p) { return NW.commitCompanion(str(p, 'id', { max: 32 })); },
    'riskNotice': function () { return { version: CFG.riskNotice.version, statements: (CFG.riskNotice.statements[NW.lang] || CFG.riskNotice.statements.en).slice() }; },
    'acceptRisk': function (p) {
      var version = int(p, 'version');
      if (version !== S.RISK_VERSION) return { accepted: false, version: S.RISK_VERSION };
      var prof = S.profile(); prof.riskVersion = S.RISK_VERSION; S.saveProfile(prof);
      sessionChanged();
      return { accepted: true, version: S.RISK_VERSION };
    },
    'signIn': function () { return { status: 'unavailable' }; },   // no web accounts in the Núcleo yet; the page hides the offer
    'openNative': function (p) { return openNative(str(p, 'route', { oneOf: ['squad', 'locker', 'isla', 'account', 'riskNotice'] })); },
    'openClassic': function () { NW.navigate(NW.ROUTES.classic); return {}; },
    'finishOnboarding': function () {
      var prof = S.profile(), missing = [];
      if (!prof.companionId) missing.push('companion');
      if (prof.riskVersion < S.RISK_VERSION) missing.push('risk');
      if (missing.length) return { status: 'incomplete', missing: missing };
      prof.onboarded = true; S.saveProfile(prof);
      // Reply first, then fade to the daily app (native cross-fades to app.html).
      setTimeout(function () { NW.navigate(NW.ROUTES.app + location.search, { replace: true, fade: true }); }, 60);
      return { next: 'app' };
    },
    'markHint': function (p) { return { count: S.markHint(str(p, 'key', { pattern: HINT_KEY })) }; },
    'log': function (p) {
      str(p, 'level', { oneOf: ['info', 'warn', 'error'] });
      str(p, 'message', { max: 300 });
      return {};   // native prints in DEBUG only; the web never logs page text
    }
  };

  function reply(result) { return { v: 1, ok: true, result: result }; }
  function failure(code, message) { return { v: 1, ok: false, error: { code: code, message: message || code } }; }

  /* Handlers run synchronously inside the call, so speech.start and audio stay within the user's gesture. */
  B.installTransport(function (env) {
    var size = 0;
    try { size = JSON.stringify(env).length; } catch (e) { return Promise.resolve(failure('invalid_params', 'envelope is not JSON')); }
    if (size > MAX_ENVELOPE) return Promise.resolve(failure('invalid_params', 'envelope too large'));
    if (!env || env.v !== 1 || typeof env.method !== 'string') return Promise.resolve(failure('invalid_params', 'bad envelope'));
    var m = M[env.method];
    if (!m || B.METHODS.indexOf(env.method) < 0) return Promise.resolve(failure('unknown_method', env.method));
    var params = env.params == null ? {} : env.params;
    if (!NW.isObj(params)) return Promise.resolve(failure('invalid_params', 'params must be an object'));
    var out;
    try { out = m(params); } catch (e) { return Promise.resolve(e && e.fault ? failure(e.fault, e.message) : failure('internal', 'internal error')); }
    return Promise.resolve(out).then(reply, function (e) { return e && e.fault ? failure(e.fault, e.message) : failure('internal', 'internal error'); });
  });

  /* ---- lifecycle: background closes the mic and stops the voice; an in-flight read keeps going ---- */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { SP.cancel(); V.stop('stopped'); NW.emit('app.state', { state: 'background' }); }
    else { NW.emit('app.state', { state: 'active' }); NW.emitSession(); }
  });
  /* mobile Safari lays its toolbar out late and reports it only as a visualViewport resize: refit the stage */
  try { if (window.visualViewport) window.visualViewport.addEventListener('resize', function () { window.dispatchEvent(new Event('resize')); }); } catch (e) {}
})();
