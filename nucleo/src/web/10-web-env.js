/* Núcleo WEB transport, part 1: environment (nucleo/README.md).
 *
 * The browser build of the Núcleo has no native half, so this layer IS the native half:
 * it answers bridge protocol v1 (ARCHITECTURE.md §2) with the same reply shapes, calling
 * the same backend endpoints the iOS app calls, same-origin. Only `build.py --web` inlines
 * src/web/*.js (after src/shared, before the page), and only when there is no native
 * handler. The engines cannot tell it apart from native except through `session.platform`.
 *
 * Parts: 10 env · 20 state · 30 desk · 40 speech · 50 voice · 60 sheets · 90 install.
 * They share one namespace, window.__nucleoWeb (NW). Nothing here logs user text.
 */
(function () {
  'use strict';
  if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.nucleo) return;   // native wins
  var CFG = window.NUCLEO_WEB;
  if (!CFG) { if (window.console) console.error('[nucleo-web] no NUCLEO_WEB catalog (build with build.py --web)'); return; }
  var NW = window.__nucleoWeb = { cfg: CFG };

  /* ---- routes (config: the paths vercel.json and src/App.tsx already serve) ---- */
  NW.BASE = CFG.base || '/nucleo/';
  NW.ROUTES = CFG.routes;

  var q;
  try { q = new URLSearchParams(location.search); } catch (e) { q = { get: function () { return null; } }; }
  NW.q = q;

  /* ---- storage: every read/write is guarded (private mode, blocked storage, quota) ---- */
  function store(kind) {
    try { var s = window[kind]; var k = '__nucleo_probe'; s.setItem(k, '1'); s.removeItem(k); return s; } catch (e) { return null; }
  }
  var LS = store('localStorage'), SS = store('sessionStorage');
  function get(s, key, fallback) {
    if (!s) return fallback;
    try { var raw = s.getItem(key); return raw == null ? fallback : JSON.parse(raw); } catch (e) { return fallback; }
  }
  function set(s, key, value) {
    if (!s) return false;
    try { s.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  NW.lsGet = function (key, fallback) { return get(LS, key, fallback); };
  NW.lsSet = function (key, value) { return set(LS, key, value); };
  NW.ssGet = function (key, fallback) { return get(SS, key, fallback); };
  NW.ssSet = function (key, value) { return set(SS, key, value); };

  /* ---- language: ?lang= > bobby_lang (the key the rest of the web honours) > the browser ---- */
  NW.lang = (function () {
    var p = q.get('lang');
    if (p === 'es' || p === 'en') return p;
    try { var s = LS && LS.getItem('bobby_lang'); if (s === 'es' || s === 'en') return s; } catch (e) {}
    var n = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
    return /^es\b/i.test(n) ? 'es' : 'en';
  })();
  NW.t = function (en, es) { return NW.lang === 'es' ? es : en; };

  /* ---- small helpers ---- */
  NW.isObj = function (v) { return !!v && typeof v === 'object' && !Array.isArray(v); };
  NW.str = function (v) { return typeof v === 'string' ? v : null; };
  /** A finite JSON number, or a string that parses as one; never a boolean (normalize.py `num`). */
  NW.num = function (v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'string') {
      var s = v.replace(/^[ \t]+|[ \t]+$/g, '');
      if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null;
      var d = Number(s);
      return isFinite(d) ? d : null;
    }
    return null;
  };
  NW.orNull = function (v) { return v === undefined ? null : v; };
  NW.clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  NW.uuid = function () {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID().toLowerCase(); } catch (e) {}
    var b = new Uint8Array(16);
    try { crypto.getRandomValues(b); } catch (e) { for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  };
  NW.iso = function (ms) { return new Date(ms == null ? Date.now() : ms).toISOString(); };
  /** The value, or null when `ms` pass first (a rejected promise also gives null). */
  NW.withTimeout = function (ms, promise) {
    return new Promise(function (resolve) {
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; resolve(null); } }, ms);
      Promise.resolve(promise).then(function (v) { if (!done) { done = true; clearTimeout(t); resolve(v); } },
        function () { if (!done) { done = true; clearTimeout(t); resolve(null); } });
    });
  };
  NW.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  /* ---- user activation: audio, vibration and speech synthesis wait for the first gesture ---- */
  NW.gestured = false;
  var gestureHooks = [];
  NW.onGesture = function (fn) { gestureHooks.push(fn); };
  function gesture() {
    NW.gestured = true;
    for (var i = 0; i < gestureHooks.length; i++) { try { gestureHooks[i](); } catch (e) {} }
  }
  // Activation-triggering events (HTML spec): pointerdown for mice, pointerup / touchend for touch, keydown.
  ['pointerdown', 'pointerup', 'touchend', 'mousedown', 'keydown', 'click'].forEach(function (type) {
    window.addEventListener(type, gesture, { capture: true, passive: true });
  });

  /* ---- events: nothing reaches the page before its first session() call (§2.1) ---- */
  var ready = false, last = Object.create(null);
  NW.leaving = false;
  NW.markReady = function () { ready = true; };
  NW.emit = function (name, payload) {
    if (!ready || NW.leaving) return;
    var B = window.nucleoBridge;
    if (!B) return;
    // Async like native (callAsyncJavaScript): an event never runs inside the call that caused it.
    Promise.resolve().then(function () { B.emit(name, payload); });
  };
  /** speech.level / voice.level ≤30 Hz, voice.progress ≤10 Hz (§2.1). */
  NW.emitEvery = function (name, payload, minMs) {
    var now = performance.now();
    if (last[name] && now - last[name] < minMs) return;
    last[name] = now;
    NW.emit(name, payload);
  };

  /* ---- HTTP: same-origin fetch; failures are {kind: timeout|network|cancelled} ---- */
  NW.http = function (path, o) {
    o = o || {};
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timedOut = false, cancelled = false, timer = 0;
    function onAbort() { cancelled = true; if (ctl) ctl.abort(); }
    if (o.signal) { if (o.signal.aborted) onAbort(); else o.signal.addEventListener('abort', onAbort); }
    if (o.timeoutMs) timer = setTimeout(function () { timedOut = true; if (ctl) ctl.abort(); }, o.timeoutMs);
    function done() { clearTimeout(timer); if (o.signal) o.signal.removeEventListener('abort', onAbort); }
    var init = { method: o.method || 'GET', credentials: 'same-origin', cache: 'no-store', headers: {}, signal: ctl ? ctl.signal : undefined };
    if (o.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(o.body); }
    if (cancelled) { done(); var e0 = new Error('cancelled'); e0.kind = 'cancelled'; return Promise.reject(e0); }
    return fetch(path, init).then(function (res) {
      return (o.binary ? res.arrayBuffer() : res.text()).then(function (body) {
        done();
        var out = { status: res.status, headers: res.headers, json: null, data: null };
        if (o.binary) out.data = body;
        else { try { out.json = body ? JSON.parse(body) : null; } catch (e) { out.json = null; } }
        return out;
      });
    }).catch(function () {
      done();
      var e = new Error(cancelled ? 'cancelled' : timedOut ? 'timeout' : 'network');
      e.kind = cancelled ? 'cancelled' : timedOut ? 'timeout' : 'network';
      throw e;
    });
  };

  /* ---- navigation away from the Núcleo: the mic closes and the voice stops first ---- */
  var leaveHooks = [];
  NW.onLeave = function (fn) { leaveHooks.push(fn); };
  NW.navigate = function (url, opts) {
    opts = opts || {};
    for (var i = 0; i < leaveHooks.length; i++) { try { leaveHooks[i](); } catch (e) {} }
    NW.leaving = true;
    var go = function () { if (opts.replace) location.replace(url); else location.assign(url); };
    if (opts.fade) {
      try { var de = document.documentElement; de.style.transition = 'opacity .32s ease'; de.style.opacity = '0'; } catch (e) {}
      setTimeout(go, 320);
    } else setTimeout(go, 0);
  };
  // Back/forward cache: a page restored after navigate() must accept events again.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted && NW.leaving) { NW.leaving = false; try { document.documentElement.style.opacity = ''; } catch (x) {} }
  });
})();
