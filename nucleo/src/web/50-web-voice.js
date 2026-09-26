/* Núcleo WEB transport, part 5: Bobby's voice (ARCHITECTURE.md §2.3, §2.5, §2.6).
 *
 * The same contract as NucleoVoice.swift over NeuralVoice.swift:
 *   speak{id,text}  → POST /api/bobby-voice-free {text, lang, voice: persona, vibe} (8 s, one retry
 *                     after 1.2 s, a reply under 500 bytes is a failure) → MP3 decoded and played
 *                     through a WebAudio AnalyserNode for voice.level; voice.progress while it plays.
 *                     If the network voice fails, the browser's speechSynthesis reads it (engine
 *                     "device", voice.word from word boundaries), as native falls back to AVSpeech.
 *   previewVoice    → the companion's pick line, the same MP3 the app bundles (select-<id>-<en|es>),
 *                     served from /nucleo/voice/: free, and allowed before consent (R11).
 * Exactly one voice.end per queued id, within 10 s if playback never starts (watchdog).
 * Browsers only play audio after a gesture: the first tap/keypress unlocks an AudioContext
 * (and primes speechSynthesis on iOS). Before that, speak answers `muted` and the page reads silently.
 */
(function () {
  'use strict';
  var NW = window.__nucleoWeb;
  if (!NW) return;
  var S = NW.state;
  var V = NW.voice = {};

  var AC = window.AudioContext || window.webkitAudioContext || null;
  var ctx = null, analyser = null, synthPrimed = false;
  var TTS_TIMEOUT = 8000, TTS_RETRY_WAIT = 1200, WATCHDOG_MS = 10000, MAX_TEXT = 800;
  var SPEAK_ID = /^[A-Za-z0-9_.:-]{1,64}$/;

  /** iOS Safari 17+: route to the speaker and ignore the ring/silent switch like native .playback. */
  V.audioSession = function (type) { try { if (navigator.audioSession && navigator.audioSession.type !== type) navigator.audioSession.type = type; } catch (e) {} };

  /** The shared AudioContext, created only after a gesture (no autoplay warnings). */
  V.context = function () {
    if (!ctx && AC && NW.gestured) {
      try { ctx = new AC(); analyser = ctx.createAnalyser(); analyser.fftSize = 512; analyser.connect(ctx.destination); } catch (e) { ctx = null; analyser = null; }
    }
    return ctx;
  };
  var IOS_LIKE = /iP(hone|ad|od)/.test(navigator.userAgent || '') || (/Macintosh/.test(navigator.userAgent || '') && navigator.maxTouchPoints > 1);
  NW.onGesture(function () {
    var c = V.context();
    if (c) {
      if (c.state !== 'running') { try { var p = c.resume(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
      try { var b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch (e) {}
    }
    if (!synthPrimed && window.speechSynthesis && window.SpeechSynthesisUtterance && IOS_LIKE) {
      synthPrimed = true;
      try { var u = new SpeechSynthesisUtterance(' '); u.volume = 0; window.speechSynthesis.speak(u); } catch (e) {}
    }
  });
  /** Can this page make sound now? (a gesture happened and audio is not blocked) */
  V.canPlay = function () { return NW.gestured && (!!V.context() || !!window.speechSynthesis); };

  /* ---- the line being spoken ---- */
  var cur = null;
  function wordStarts(text) {
    var starts = [], inWord = false;
    for (var i = 0; i < text.length; i++) {
      var ws = /\s/.test(text.charAt(i));
      if (ws) inWord = false; else if (!inWord) { starts.push(i); inWord = true; }
    }
    return starts;
  }
  function wordIndex(starts, loc) { var idx = 0; for (var i = 0; i < starts.length; i++) if (starts[i] <= loc) idx = i; return idx; }

  function begin(id, text) {
    if (cur) finish('stopped');
    var line = { id: id, text: text, starts: wordStarts(text), started: false, engine: null, src: null, utter: null, timers: [], onset: null, t0: 0, dur: 0,
      ctl: typeof AbortController === 'function' ? new AbortController() : null };
    cur = line;
    line.watchdog = setTimeout(function () {
      if (cur === line && !line.started) { halt(line); finish('failed'); }   // playback never started: end it honestly
    }, WATCHDOG_MS);
    return line;
  }
  function halt(line) {
    if (line.ctl) { try { line.ctl.abort(); } catch (e) {} }
    line.timers.forEach(function (t) { clearInterval(t); clearTimeout(t); });
    line.timers = [];
    if (line.src) { try { line.src.onended = null; line.src.stop(); } catch (e) {} try { line.src.disconnect(); } catch (e) {} line.src = null; }
    if (line.utter) { line.utter.onend = line.utter.onerror = line.utter.onboundary = line.utter.onstart = null; line.utter = null; try { window.speechSynthesis.cancel(); } catch (e) {} }
  }
  function finish(reason) {
    var line = cur;
    if (!line) return;
    cur = null;
    clearTimeout(line.watchdog);
    halt(line);
    NW.emit('voice.end', { id: line.id, reason: reason });
  }
  function started(line, engine, duration) {
    line.started = true; line.engine = engine;
    clearTimeout(line.watchdog);
    NW.emit('voice.start', { id: line.id, durationSec: engine === 'neural' ? duration : null, engine: engine });
  }

  /* ---- network voice (neural) ---- */
  /** Like NeuralVoice: a line that was stopped never retries, and its request is dropped. */
  function fetchTTS(line, text, persona) {
    var body = { text: text, lang: NW.lang, vibe: 'direct' };   // AgentProfile's default vibe `directo` → server `direct`
    if (persona) body.voice = persona;
    function attempt(n) {
      if (cur !== line) return Promise.resolve(null);
      return NW.http('/api/bobby-voice-free', { method: 'POST', body: body, timeoutMs: TTS_TIMEOUT, binary: true, signal: line.ctl ? line.ctl.signal : null }).then(function (r) {
        if (r.status === 200 && r.data && r.data.byteLength > 500) return r.data;
        throw new Error('tts ' + r.status);
      }).catch(function () {
        if (n > 0 || cur !== line) return null;
        return NW.sleep(TTS_RETRY_WAIT).then(function () { return attempt(1); });   // throttled or a hiccup: one short retry
      });
    }
    return attempt(0);
  }
  function fetchClip(line, name) {
    return NW.http(NW.BASE + 'voice/' + name + '.mp3', { timeoutMs: TTS_TIMEOUT, binary: true, signal: line.ctl ? line.ctl.signal : null })
      .then(function (r) { return r.status === 200 && r.data && r.data.byteLength > 500 ? r.data : null; }, function () { return null; });
  }
  function decode(c, data) {
    return new Promise(function (resolve, reject) {
      try { var p = c.decodeAudioData(data, resolve, reject); if (p && p.then) p.then(resolve, reject); } catch (e) { reject(e); }
    });
  }
  function resumed(c) {
    if (c.state === 'running') return Promise.resolve(true);
    try { var p = c.resume(); return NW.withTimeout(400, p ? p.then(function () { return c.state === 'running'; }) : Promise.resolve(false)).then(function (v) { return !!v; }); } catch (e) { return Promise.resolve(false); }
  }
  /** Plays MP3 bytes for `line`; resolves false when it cannot (the caller falls back). */
  function play(line, data) {
    var c = V.context();
    if (!c || !data) return Promise.resolve(false);
    return decode(c, data.slice(0)).then(function (buffer) {
      if (cur !== line) return true;
      return resumed(c).then(function (ok) {
        if (cur !== line) return true;
        if (!ok) return false;
        V.audioSession('playback');
        var src = c.createBufferSource();
        src.buffer = buffer;
        src.connect(analyser);
        src.onended = function () { if (cur === line && line.src === src) finish('finished'); };
        line.src = src; line.t0 = c.currentTime; line.dur = buffer.duration;
        try { src.start(0); } catch (e) { line.src = null; return false; }
        started(line, 'neural', buffer.duration);
        var data8 = new Float32Array(analyser.fftSize);
        line.timers.push(setInterval(function () {
          if (cur !== line) return;
          analyser.getFloatTimeDomainData(data8);
          var s = 0;
          for (var i = 0; i < data8.length; i++) s += data8[i] * data8[i];
          var rms = Math.sqrt(s / data8.length);
          NW.emitEvery('voice.level', { id: line.id, level: Math.min(1, Math.max(0.04, rms * 2.5)) }, 33);   // NeuralVoice: amplitude × 2.5
          var t = Math.min(Math.max(0, c.currentTime - line.t0), line.dur);
          NW.emitEvery('voice.progress', { id: line.id, t: t, duration: line.dur }, 100);
        }, 33));
        return true;
      });
    }, function () { return false; });
  }

  /* ---- device voice (speechSynthesis), native's AVSpeech fallback ---- */
  function speakDevice(line) {
    var synth = window.speechSynthesis;
    if (!synth || !window.SpeechSynthesisUtterance) { finish('failed'); return; }
    var u = new SpeechSynthesisUtterance(line.text), tag = NW.lang === 'es' ? 'es-MX' : 'en-US';
    u.lang = tag; u.rate = 1;
    // Only a voice that runs on this device: an online system voice would send the text to a
    // service the risk notice does not name (it names OpenAI and Microsoft, through our server).
    var voice = null;
    try {
      var voices = synth.getVoices() || [], exact = null, near = null;
      voices.forEach(function (v) {
        if (v.localService === false) return;
        var l = String(v.lang || '').replace('_', '-').toLowerCase();
        if (l === tag.toLowerCase() && !exact) exact = v; else if (l.indexOf(tag.slice(0, 2)) === 0 && !near) near = v;
      });
      voice = exact || near;
    } catch (e) {}
    if (!voice) { finish('failed'); return; }
    u.voice = voice;
    u.onstart = function () {
      if (cur !== line) return;
      started(line, 'device', null);
      line.timers.push(setInterval(function () {   // 30 Hz syllable envelope: a rise and fall over each spoken word
        if (cur !== line) return;
        var level = 0.06, o = line.onset;
        if (o) { var span = Math.min(0.6, Math.max(0.12, 0.07 * o.length + 0.06)), t = (performance.now() - o.at) / 1000; if (t < span) level = 0.12 + 0.72 * Math.sin(Math.PI * t / span); }
        NW.emitEvery('voice.level', { id: line.id, level: Math.min(1, Math.max(0, level)) }, 33);
      }, 33));
    };
    u.onboundary = function (e) {
      if (cur !== line || (e.name && e.name !== 'word')) return;
      var idx = wordIndex(line.starts, e.charIndex | 0), next = line.starts[idx + 1];
      line.onset = { at: performance.now(), length: e.charLength || ((next != null ? next : line.text.length) - line.starts[idx]) };
      NW.emit('voice.word', { id: line.id, index: idx });
    };
    u.onend = function () { if (cur === line) finish('finished'); };
    u.onerror = function () { if (cur === line) finish(line.started ? 'finished' : 'failed'); };
    line.utter = u;
    try { synth.cancel(); synth.speak(u); } catch (e) { finish('failed'); }
  }

  /** speak{id,text}: queued | muted | too_long. `opts.essential` lines may fall back to the device voice. */
  V.speak = function (id, text, opts) {
    opts = opts || {};
    if (typeof id !== 'string' || !SPEAK_ID.test(id) || typeof text !== 'string' || !text.trim()) throw NW.desk.fault('invalid_params', 'speak');
    // R11: the network voice sends the text out for speech; before consent the page reads silently.
    if (!opts.clip && !S.riskAccepted()) return 'muted';
    if (text.length > MAX_TEXT) return 'too_long';
    if (S.profile().muted) return 'muted';
    if (!V.canPlay()) return 'muted';   // no gesture yet: the browser would block playback
    var line = begin(id, text);
    var essential = opts.essential !== false;
    var load = opts.clip ? fetchClip(line, opts.clip).then(function (d) { return d || (S.riskAccepted() ? fetchTTS(line, text, opts.persona) : null); })
                         : fetchTTS(line, text, opts.persona);
    load.then(function (data) {
      if (cur !== line) return;
      return play(line, data).then(function (ok) {
        if (cur !== line || ok) return;
        if (essential) speakDevice(line); else finish('failed');   // ambient lines stay silent rather than robotic
      });
    }).catch(function () { if (cur === line) { if (essential) speakDevice(line); else finish('failed'); } });
    return 'queued';
  };

  /** Stops the current line (if any) and says so once. */
  V.stop = function (reason) { finish(reason || 'stopped'); try { if (window.speechSynthesis && window.speechSynthesis.speaking) window.speechSynthesis.cancel(); } catch (e) {} };
  V.active = function () { return !!cur; };
  NW.onLeave(function () { V.stop('stopped'); });
})();
