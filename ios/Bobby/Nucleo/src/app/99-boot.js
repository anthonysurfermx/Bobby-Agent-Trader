/* =====================================================================
   19. Boot: wire the bridge events, ask for the session, then wake.
   BOOT is black until session(); the page's first bridge call is session({page}).
   ===================================================================== */
function applySession(s, first){
  if (!s || typeof s !== 'object') return;
  var prevId = SES && SES.companion ? SES.companion.id : null;
  SES = s;
  SES.mic = SES.mic || { state: 'undetermined', onDevice: true };
  if (first){ LANG = s.language === 'es' ? 'es' : 'en'; D.documentElement.lang = LANG; if (s.reducedMotion) RM = true; }
  var c = s.companion || null, id = c ? c.id : null;
  if (first || id !== prevId){
    ME.id = id; ME.webId = c ? c.webId : null; ME.art = c ? artFor(c.webId) : null; ME.label = c ? titleCase(c.label) : '';
    ME.pal = c && GLASS[c.palette] ? c.palette : 'ghost'; ME.tint = hex(GLASS[ME.pal]); ME.cap = ME.pal === 'lava' ? 0.28 : 0.35;
    TM = temper(ME.pal); applyTemperSprings(); if (U) tuneAmbient(false);
    buildAvatar(); loadCompanionArt();
    if (ROSTER) buildBelt(ROSTER.companions);
    if (!first){ buildFaces(); if (ST.name === 'IDLE' || ST.name === 'FACES') tintHome(); }
  }
  att(el.avatar, 'aria-label', ME.label ? tt('aria.account', { name: ME.label }) : tt('aria.accountPlain'));
  att(el.close, 'aria-label', tt('aria.close'));
  setXpArc(s.level && s.level.progress);
}
function refreshCollections(){
  bcall('theses').then(function(r){ if (r && Array.isArray(r.items)) LEDGER = r.items; if (ST.name === 'IDLE') buildFaces(); }).catch(noop);
  bcall('island').then(function(i){ ISLAND = i; if (ST.name === 'IDLE') buildFaces(); }).catch(noop);
  bcall('roster').then(function(r){ ROSTER = r; if (r) buildBelt(r.companions); }).catch(noop);
}
function wire(){
  if (!BR) return;
  BR.on('session.changed', function(s){ applySession(s, false); if (ST.name === 'IDLE') pillMode(idleMode()); });
  BR.on('app.state', function(p){ fsmEvent('app.state', p); if (p && p.state === 'active') last = -1; });
  BR.on('ask.stage', onStage);
  BR.on('speech.state', function(p){ fsmEvent('speech.state', p); });
  BR.on('speech.level', function(p){ SPEECH.lvl = clamp(+(p && p.level) || 0, 0, 1); SPEECH.at = clk; });
  BR.on('speech.partial', function(p){ fsmEvent('speech.partial', p); });
  BR.on('speech.final', function(p){ fsmEvent('speech.final', p); });
  BR.on('speech.error', function(p){ fsmEvent('speech.error', p); });
  BR.on('voice.start', function(p){
    if (!p || p.id !== VOICE.id) return;
    VOICE.started = true; VOICE.engine = p.engine || null;
    VOICE.lat = clamp(lerp(VOICE.lat, clk - VOICE.reqT, 0.6), 0.15, 3.5);
    K.on = true; K.t = 0; K.mode = 'read';
    if (fin(p.durationSec) && p.durationSec > 0) kRetime(p.durationSec);
  });
  BR.on('voice.level', function(p){ if (p && p.id === VOICE.id){ VOICE.lvl = clamp(+p.level || 0, 0, 1); VOICE.at = clk; } });
  BR.on('voice.progress', function(p){
    if (!p || p.id !== VOICE.id || K.mode === 'word') return;
    K.mode = 'progress';
    if (fin(p.duration) && p.duration > 0 && (!K.dur || Math.abs(p.duration - K.dur) > 0.05 * K.dur)) kRetime(p.duration);
    if (fin(p.t)){ var d = p.t - K.t; if (Math.abs(d) > 0.06) K.t = p.t; else K.t += d * 0.3; }
  });
  BR.on('voice.word', function(p){ if (!p || p.id !== VOICE.id) return; K.mode = 'word'; var w = K.wt[p.index | 0]; if (w && Math.abs(K.t - w.t0) > 0.08) K.t = w.t0; });
  BR.on('voice.end', function(p){ if (!p || p.id !== VOICE.id) return; VOICE.ended = true; if (!VOICE.started || p.reason !== 'finished') VOICE.silent = true; fsmEvent('voice.end', p); });
  BR.on('thesis.planted', function(){ bcall('island').then(function(i){ ISLAND = i; }).catch(noop); });
  BR.on('native.sheet', function(p){ SHEET = !!(p && p.state === 'open'); last = -1; if (!SHEET) refreshCollections(); });
}
/* fonts: measurements (caption pages, stance clamps, satellite widths) need the real faces */
var FONTS_P = (function(){
  try {
    if (!D.fonts || !D.fonts.load) return Promise.resolve();
    var loads = ['400 26px "Instrument Serif"', '400 40px "Instrument Serif"', '400 16px "Geist"', '500 16px "Geist"', '600 16px "Geist"', '500 11px "Geist Mono"', '400 10px "Geist Mono"']
      .map(function(f){ return D.fonts.load(f).catch(noop); });
    return Promise.race([Promise.all(loads), new Promise(function(r){ setTimeout(r, 3000); })]);
  } catch (e) { return Promise.resolve(); }
})();
var BOOTED = false;
function boot(){
  wire();
  bcall('session', { page: 'app' }).then(function(s){
    applySession(s, true);
    buildState();
    var started = false;
    function start(){
      if (started) return; started = true;
      buildFaces();
      var pr = SES && SES.pendingRead;
      if (pr && pr.status === 'ok') go('RESTORE', { read: pr }); else go('WAKE');
    }
    Promise.all([bcall('theses').catch(noop), bcall('roster').catch(noop)]).then(function(r){
      if (r[0] && Array.isArray(r[0].items)) LEDGER = r[0].items;
      if (r[1]){ ROSTER = r[1]; buildBelt(r[1].companions); }
      start();
    });
    at(0.5, start);
    bcall('island').then(function(i){ ISLAND = i; if (ST.name === 'IDLE' || ST.name === 'WAKE') buildFaces(); }).catch(noop);
    bcall('suggestions').then(function(x){ SUGG = x; }).catch(noop);
    BOOTED = true;
  }, function(e){ logErr('session', e); });
}

W.nucleo = {
  state: function(){ return ST.name; },
  log: function(){ return LOG.slice(); },
  time: function(){ return clk; },
  session: function(){ return SES; },
  read: function(){ var r = READ; return r ? { status: r.reply && r.reply.status, question: r.question, symbol: r.model && r.model.symbol, verdict: r.model && r.model.verdict.key,
    ring: r.model && r.model.ring, pages: PAGES.map(function(p){ return p.text; }), satellites: A.sat.map(function(s, i){ return s.on ? el.sats[i].textContent : null; }), saved: r.save || null } : null; },
  faces: function(){ return FACES.map(function(f){ return f.id; }); },
  ledger: function(){ return LEDGER.slice(); },
  quality: function(t){ if (t != null){ QC.fixed = true; setTier(t, 'set'); } return { tier: Q.tier, dpr: dpr, canvas: [cv.width, cv.height], median: QC.med }; },
  fps: function(){ return FPS ? { fps: FPS.fps, p95: FPS.p95, max: FPS.max, js: FPS.jsMean } : null; },
  hash: function(){ return MOCK ? hashFrame() : null; },
  ready: null,
  /* dev/harness only: drive the real input entry points in stage coordinates */
  input: MOCK ? { down: function(x, y){ inDown(x, y, hitAt(x, y)); }, move: function(x, y){ inMove(x, y); }, up: function(x, y){ inUp(x, y); }, hold: function(sel){ return targetXY(sel || '#pill'); } } : null,
  type: MOCK ? function(text){ if (ST.name !== 'TYPING') openTyping({}); el.ta.value = text; taAutosize(); STATES.TYPING.send(); } : null,
  restore: MOCK ? function(name){ var f = W.NUCLEO_FIXTURES && W.NUCLEO_FIXTURES.ask[name || 'nvda']; if (f && S) go('RESTORE', { read: JSON.parse(JSON.stringify(f)) }); } : null,
  step: MOCK ? function(sec){ return runSteps(Math.round((sec == null ? 1 / 60 : sec) / H)).then(function(){ render(); return { t: clk, state: ST.name }; }); } : null,
  pause: function(){ paused = true; }, play: function(){ paused = false; }
};

if (!glInit()) stage.classList.add('nogl');
cv.addEventListener('webglcontextlost', function(e){ e.preventDefault(); glLost = true; stage.classList.add('nogl'); dirty = true; }, false);
cv.addEventListener('webglcontextrestored', function(){ glLost = false; if (glInit()){ uploadComp(); stage.classList.remove('nogl'); } else stage.classList.add('nogl'); dirty = true; }, false);
op(el.pause, 0); op(el.ghost, 0);
if (HARNESS){
  MOCK.useClock(function(){ return clk * 1000; }); MOCK_CLOCKED = true;
  harnessStart();
  W.nucleo.ready = FONTS_P.then(function(){ fit(); boot(); return flush(); }).then(function(){
    var t = parseFloat(QS.t);
    if (FREEZE) return harnessFreeze(!isNaN(t) && t > 0 ? t : 0);
    if (!isNaN(t) && t > 0){ HBUSY = true; return runSteps(Math.round(t / H)).then(function(){ HBUSY = false; harnessLoop(); return { t: clk, state: ST.name }; }); }
    harnessLoop(); return { t: clk, state: ST.name };
  });
} else {
  fit();
  boot();
  W.nucleo.ready = FONTS_P;
  requestAnimationFrame(frame);
}
W.addEventListener('resize', function(){ fit(); dirty = true; });
W.addEventListener('orientationchange', refit); W.addEventListener('pageshow', refit);
})();
