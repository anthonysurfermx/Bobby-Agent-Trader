/* Núcleo WEB transport, part 4: speech-to-text (ARCHITECTURE.md §2.3, §2.5, §2.6).
 *
 * The browser's Web Speech API (SpeechRecognition / webkitSpeechRecognition) with interim
 * results, in the selected six-language speech locale. Unlike iOS (R8, on-device only) the browser may send the audio
 * to its own speech service, so `onDevice` is always false and the pre-permission card says so.
 * Browsers without the API (Firefox) report `unavailable` and the engines take the typing path.
 *
 * The mic is live only between speech.start and speech.stop (pill down → pill up), stops on its
 * own after 60 s, and closes when the tab hides. Level events: a WebAudio analyser on a
 * getUserMedia stream where two captures can coexist (Chromium), else a syllable envelope
 * driven by the recognizer's own results (Safari/WebKit, which owns its capture session).
 */
(function () {
  'use strict';
  var NW = window.__nucleoWeb;
  if (!NW) return;
  var SP = NW.speech = {};

  var Rec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var md = navigator.mediaDevices;
  var hasGUM = !!(md && md.getUserMedia);
  var ua = navigator.userAgent || '';
  var IOS = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var WEBKIT = IOS || (/Safari\//.test(ua) && !/(Chrome|Chromium|CriOS|FxiOS|Edg|OPR|SamsungBrowser)\//.test(ua));
  var LISTEN_CAP_MS = 60000, FINAL_WAIT_MS = 1500;

  var state = (!Rec || !hasGUM || window.isSecureContext === false) ? 'unavailable' : 'undetermined';
  var refused = false;   // the recognizer itself was refused in this page (Safari asks for speech recognition separately)
  function apply(s) {
    if (state === 'unavailable') return;
    state = s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'undetermined';
    if (state !== 'granted' && cur && SP.cancel) SP.cancel();
  }
  SP.ready = Promise.resolve();
  if (state !== 'unavailable' && navigator.permissions && navigator.permissions.query) {
    SP.ready = NW.withTimeout(800, navigator.permissions.query({ name: 'microphone' }).then(function (st) {
      apply(st.state);
      try { st.onchange = function () { apply(st.state); if (NW.emitSession) NW.emitSession(); }; } catch (e) {}
    }));
  }
  /** {state, onDevice} for session.mic and speech.permission. */
  SP.permission = function () {
    var s = state;
    if (s !== 'unavailable' && refused) s = 'denied';
    return { state: s, onDevice: false };
  };

  /** Shows the browser's microphone prompt (the recognizer may add its own on first use). */
  SP.requestPermission = function () {
    if (state === 'unavailable') return Promise.resolve(SP.permission());
    return md.getUserMedia({ audio: true }).then(function (stream) {
      stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
      state = 'granted'; refused = false;
      return SP.permission();
    }, function (err) {
      var n = err && err.name;
      state = (n === 'NotFoundError' || n === 'OverconstrainedError' || n === 'NotReadableError') ? 'unavailable' : 'denied';
      return SP.permission();
    });
  };

  var cur = null;
  SP.active = function () { return !!cur; };

  /** End local capture immediately; a released recognizer may still settle its last result. */
  function closeCapture(c) {
    c.captureClosed = true;
    clearInterval(c.meter); c.meter = 0;
    if (c.stream) { c.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); c.stream = null; }
    try { if (c.src) c.src.disconnect(); } catch (e) {}
    c.src = null; c.an = null;
    if (NW.voice) NW.voice.audioSession('playback');
  }
  function clean(c) {
    clearTimeout(c.cap); clearTimeout(c.finalTimer);
    closeCapture(c);
  }
  /** Every delayed callback still belongs to the same language, consent and active capture. */
  function current(c) {
    if (c.finalized || cur !== c) return false;
    if (c.locale !== NW.locale || !NW.state.riskAccepted() || SP.permission().state !== 'granted') {
      SP.stop({ cancel: true });
      return false;
    }
    return true;
  }
  function finalize(c) {
    if (!current(c) || !c.stopping) return;
    c.finalized = true;
    if (cur === c) cur = null;
    clean(c);
    try { c.rec.abort(); } catch (e) {}
    NW.emit('speech.final', { text: c.text });
  }
  function fail(c, code) {
    if (c.finalized) return;
    c.finalized = true;
    if (cur === c) cur = null;
    clean(c);
    try { c.rec.abort(); } catch (e) {}
    NW.emit('speech.error', { code: code });
  }

  /** Level: RMS of the mic (native's formula) where available, else an envelope that follows the words. */
  function meter(c) {
    var ctx = NW.voice && NW.voice.context();
    if (!WEBKIT && ctx && state === 'granted') {
      md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(function (stream) {
        if (!current(c) || c.stopping || c.captureClosed) { stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); return; }
        c.stream = stream;
        try { c.src = ctx.createMediaStreamSource(stream); c.an = ctx.createAnalyser(); c.an.fftSize = 1024; c.src.connect(c.an); } catch (e) { c.an = null; }
      }, function () {});
    }
    var buf = null;
    c.meter = setInterval(function () {
      if (!current(c) || c.stopping || c.captureClosed) return;
      var level, now = performance.now();
      if (c.an && ctx && ctx.state === 'running') {
        buf = buf || new Float32Array(c.an.fftSize);
        c.an.getFloatTimeDomainData(buf);
        var s = 0;
        for (var i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        var rms = Math.sqrt(s / buf.length);
        level = rms > 0 ? NW.clamp((20 * Math.log10(rms) + 50) / 45, 0, 1) : 0;
      } else {
        var el = (now - c.t0) / 1000, since = c.heard ? (now - c.heard) / 1000 : 9;
        var syl = Math.abs(Math.sin(el * Math.PI * 4.3)) * (0.55 + 0.45 * Math.pow(Math.sin(el * 1.7), 2));
        level = (c.voice || since < 0.9) ? Math.min(1, 0.08 + syl * 0.85) : 0.04;
      }
      NW.emitEvery('speech.level', { level: level }, 33);
    }, 33);
  }

  /** speech.start → listening | needs_permission | denied | unavailable | busy. Runs inside the pill's pointerdown. */
  SP.start = function () {
    if (!NW.state.riskAccepted()) return 'unavailable';
    var s = SP.permission().state;
    if (s === 'unavailable') return 'unavailable';
    if (s === 'denied') return 'denied';
    if (s === 'undetermined') return 'needs_permission';
    if (cur) return 'busy';
    if (NW.voice) NW.voice.stop('stopped');   // native: speech.willStart stops the voice
    var rec;
    try { rec = new Rec(); } catch (e) { return 'unavailable'; }
    rec.lang = NW.locale;
    rec.continuous = true;
    rec.interimResults = true;
    try { rec.maxAlternatives = 1; } catch (e) {}
    var c = { rec: rec, locale: NW.locale, text: '', t0: performance.now(), heard: 0, voice: false, stopping: false, ended: false, finalized: false, captureClosed: false, cap: 0, finalTimer: 0, meter: 0, stream: null, src: null, an: null };
    rec.onresult = function (e) {
      if (!current(c) || c.ended) return;
      var parts = [];
      for (var i = 0; i < e.results.length; i++) { var r = e.results[i]; if (r && r[0] && r[0].transcript) parts.push(r[0].transcript); }
      // Normalize control/ASCII spacing without changing NBSP/thin-space price separators.
      var text = parts.join(' ').replace(/[ \t\r\n\f\v]+/g, ' ').trim();
      c.heard = performance.now();
      if (text !== c.text) { c.text = text; NW.emit('speech.partial', { text: text }); }
    };
    rec.onspeechstart = function () { if (current(c) && !c.ended) c.voice = true; };
    rec.onspeechend = function () { if (current(c)) c.voice = false; };
    rec.onerror = function (e) {
      var err = e && e.error;
      if (!current(c) || c.ended || err === 'no-speech' || err === 'aborted') return;
      if (err === 'not-allowed' || err === 'service-not-allowed') { refused = true; fail(c, 'denied'); if (NW.emitSession) NW.emitSession(); return; }
      if (c.stopping) { finalize(c); return; }   // what was heard before the error still counts
      fail(c, err === 'audio-capture' ? 'unavailable' : 'failed');
    };
    rec.onend = function () {
      if (!current(c)) return;
      c.ended = true; closeCapture(c);
      // Keep the held text until explicit release; provider completion never sends a turn.
      if (c.stopping) finalize(c);
    };
    if (NW.voice) NW.voice.audioSession('play-and-record');
    cur = c;
    try { rec.start(); } catch (e) {
      c.finalized = true; cur = null; clean(c);
      try { rec.abort(); } catch (ignore) {}
      return 'unavailable';
    }
    if (c.finalized) return 'unavailable';
    NW.emit('speech.state', { state: 'listening' });
    if (!c.captureClosed) meter(c);
    c.cap = setTimeout(function () {
      if (!current(c)) return;
      SP.stop({ cancel: true });
      NW.emit('speech.error', { code: 'interrupted' });
    }, LISTEN_CAP_MS);
    return 'listening';
  };

  /** speech.stop: unless `cancel`, speech.final follows within 1.5 s (with "" when nothing was heard). */
  SP.stop = function (p) {
    var c = cur;
    if (!c) return 'idle';
    if (p && p.cancel) {
      c.finalized = true; cur = null; clean(c);
      try { c.rec.abort(); } catch (e) {}
      NW.emit('speech.state', { state: 'stopped' });
      return 'stopped';
    }
    if (!current(c)) return 'stopped';
    if (c.stopping) return 'stopped';
    c.stopping = true;
    clearTimeout(c.cap); closeCapture(c);
    NW.emit('speech.state', { state: 'stopped' });
    if (c.ended) { finalize(c); return 'stopped'; }
    try { c.rec.stop(); } catch (e) { finalize(c); return 'stopped'; }
    if (!c.finalized) c.finalTimer = setTimeout(function () { finalize(c); }, FINAL_WAIT_MS);
    return 'stopped';
  };

  /** Background, a sheet, navigation: the mic closes and nothing is emitted as final. */
  SP.cancel = function () { if (cur) SP.stop({ cancel: true }); };
  NW.onLeave(SP.cancel);
})();
