/* =====================================================================
   19. Boot: wire the bridge events, ask for the session, then wake.
   BOOT is black until session(); the page's first bridge call is session({page}).
   ===================================================================== */
/* the analysis level pill: label and colour come from native (the level sheet owns the choice) */
var LVL = null;
function lvlApply(l){
  if (!l || typeof l.label !== 'string') return;
  LVL = l;
  var b = D.getElementById('lvl'); if (!b) return;
  b.textContent = l.label;
  if (typeof l.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(l.color)) b.style.color = l.color;
  b.setAttribute('aria-label', l.label);
  lvlSync();
}
function lvlSync(){
  var b = D.getElementById('lvl'); if (!b) return;
  var on = !!LVL && ST && ST.name === 'IDLE';
  if (b.classList.contains('on') !== on) b.classList.toggle('on', on);
}
function applySession(s, first){
  if (!s || typeof s !== 'object') return;
  if (s.analysisLevel) lvlApply(s.analysisLevel);
  var prevId = SES && SES.companion ? SES.companion.id : null;
  SES = s;
  if (typeof guideLayout === 'function') guideLayout();
  SES.mic = SES.mic || { state: 'undetermined', onDevice: true };
  var oldLang = LANG, oldLocale = LOCALE;
  LANG = NucleoLocale.language(s.language); LOCALE = NucleoLocale.locale(LANG, s.locale || s.speechLocale || s.localeRegion);
  D.documentElement.lang = LANG;
  if (!first && oldLocale !== LOCALE){ SPEECH.draft = ''; SPEECH.draftEpoch = (SPEECH.draftEpoch || 0) + 1; }
  if (first && s.reducedMotion) RM = true;
  if (!first && oldLocale !== LOCALE && ST && ST.name === 'LISTENING') STATES.LISTENING.interrupt();
  if (!first && oldLang !== LANG){
    if (typeof agentNames === 'function') agentNames();
    if (typeof buildFaces === 'function') buildFaces();
    if (ST && ST.name === 'IDLE') setGreeting();
    if (ST && ST.name === 'TYPING'){ el.ta.placeholder = tt('type.placeholder'); att(el.taSend, 'aria-label', tt('type.send')); }
  }
  var c = s.companion || null, id = c ? c.id : null;
  if (first || id !== prevId){
    ME.id = id; ME.webId = c ? c.webId : null; ME.art = c ? artFor(c.webId) : null; ME.label = c ? titleCase(c.label) : '';
    ME.pal = c && GLASS[c.palette] ? c.palette : 'ghost'; ME.tint = hex('#A795EF'); ME.cap = ME.pal === 'lava' ? 0.28 : 0.35;
    TM = temper(ME.pal); applyTemperSprings(); if (U) tuneAmbient(false);
    buildAvatar(); loadCompanionArt();
    if (ROSTER) buildBelt(ROSTER.companions);
    if (!first){ buildFaces(); if (ST.name === 'IDLE' || ST.name === 'FACES') tintHome(); }
  }
  att(el.avatar, 'aria-label', ME.label ? tt('aria.account', { name: ME.label }) : tt('aria.accountPlain'));
  att(el.close, 'aria-label', tt('aria.close'));
  setXpArc(s.level && s.level.progress);
}
// Reject replies started for a previous account, even when the new account is offline.
var OWNER_GEN = 0;
function refreshCollections(){
  var gen = OWNER_GEN;
  bcall('theses').then(function(r){ if (gen !== OWNER_GEN) return; if (r && Array.isArray(r.items)) LEDGER = r.items; if (ST.name === 'IDLE') buildFaces(); }).catch(noop);
  bcall('island').then(function(i){ if (gen !== OWNER_GEN) return; ISLAND = i; if (ST.name === 'IDLE') buildFaces(); }).catch(noop);
  bcall('roster').then(function(r){ if (gen !== OWNER_GEN) return; ROSTER = r; if (r) buildBelt(r.companions); }).catch(noop);
  bcall('suggestions').then(function(x){ if (gen === OWNER_GEN) receiveSuggestions(x); }).catch(noop);
}
function resetVisibleRead(preserveSignIn){
  SPEECH.draft = ''; SPEECH.draftEpoch = (SPEECH.draftEpoch || 0) + 1;
  if (preserveSignIn) return;
  GATE_BUSY = false;
  if (ST.name !== 'BOOT') {
    clearRead();
    txReset(); showTypeBox(false);
    el.ta.value = '';
    // Saved cards must disappear immediately rather than fade under a different account.
    A.rev.forEach(function(v){ v.set(0); });
    A.satG.on = false;
    go('RETURNING');
  }
  READ = null;
}
function accountChanged(p){
  OWNER_GEN++;
  var preserveSignIn = ST.name === 'SIGNIN_GATE' && p && !p.wasSignedIn && p.signedIn;
  LEDGER = []; ISLAND = null; ROSTER = null; SUGG = null; SAVED = null; READS_DONE = 0;
  HINTED = {};
  resetVisibleRead(preserveSignIn);
  if (ST.name !== 'BOOT'){ buildFaces(); setGreeting(); }
  refreshCollections();
}
function consentWithdrawn(){
  OWNER_GEN++;
  SUGG = null;
  resetVisibleRead(false);
  if (SES) SES.riskAccepted = false;
}
function wire(){
  if (!BR) return;
  BR.on('session.changed', function(s){
    var walled = oneTapOff();
    applySession(s, false);
    if (ST.name === 'IDLE') pillMode(idleMode());
    /* the last read was spent, or reads came back: the idle row loses or regains its one-tap chips at once */
    if (oneTapOff() !== walled && ST.name === 'IDLE') showIdleSuggestions(); else nudgeSync();
  });
  BR.on('speaking.open', function(){ if (SES && SES.speaking && SES.riskAccepted && ['IDLE','HANDBACK','CARDS','FOLLOWUPS','THESIS_VIEW','FACES'].indexOf(ST.name) >= 0){ clearRead(); glassHome(); go('SPEAKING_DIAL'); } });
  BR.on('account.changed', function(p){ dialBusy = false; dialGreeting = false; stage.classList.remove('speaking-greet'); accountChanged(p); });
  BR.on('consent.withdrawn', consentWithdrawn);
  BR.on('app.state', function(p){ if (p && p.state === 'background'){ SPEECH.draft = ''; SPEECH.draftEpoch = (SPEECH.draftEpoch || 0) + 1; } fsmEvent('app.state', p); if (p && p.state === 'active') last = -1; });
  BR.on('ask.stage', onStage);
  BR.on('companion.checkIn', companionCheckIn);
  BR.on('companion.revoked', function(){ GUIDE_EPOCH++; CHECKIN = null; GUIDE_INPUT_CHECKIN = false; GUIDE_ANSWER_ERROR = ''; if (GUIDE) { GUIDE.personalized = false; GUIDE.companionCheckIn = null; } if (ST.name === 'COMPANION') guideRender(); else { guidePanel.style.display = 'none'; if (ST.name === 'HANDBACK') readChips(); } });
  /* the read native starts is not the person's own question: startRead() notes it while askStart runs (§3.5) */
  BR.on('ask.start', function(p){ ASK_ORIGIN = 'followUp'; try { askStart(p); } finally { ASK_ORIGIN = null; } });
  BR.on('analysis.level', lvlApply);
  BR.on('speech.state', function(p){ fsmEvent('speech.state', p); });
  BR.on('speech.level', function(p){ SPEECH.lvl = clamp(+(p && p.level) || 0, 0, 1); SPEECH.at = clk; });
  BR.on('speech.partial', function(p){ fsmEvent('speech.partial', p); });
  BR.on('speech.final', function(p){ fsmEvent('speech.final', p); });
  BR.on('speech.error', function(p){ fsmEvent('speech.error', p); });
  BR.on('voice.start', function(p){
    if (!p || p.id !== VOICE.id) return;
    VOICE.started = true; VOICE.engine = p.engine || null;
    VOICE.lat = clamp(lerp(VOICE.lat, clk - VOICE.reqT, 0.6), 0.15, 5);   /* a slow voice is requested earlier, under the choreography */
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
  BR.on('voice.end', function(p){ if (!p || p.id !== VOICE.id) return; VOICE.ended = true; if (p.reason === 'failed') hint(tt('voice.failed')); if (!VOICE.started || p.reason !== 'finished') VOICE.silent = true; fsmEvent('voice.end', p); });
  BR.on('thesis.planted', function(){ var gen = OWNER_GEN; bcall('island').then(function(i){ if (gen === OWNER_GEN) ISLAND = i; }).catch(noop); });
  BR.on('native.sheet', function(p){ SHEET = !!(p && p.state === 'open'); last = -1; if (!SHEET) refreshCollections(); });
}
/* fonts: measurements (caption pages, stance clamps, satellite widths) need the real faces */
var FONTS_P = (function(){
  try {
    if (!D.fonts || !D.fonts.load) return Promise.resolve();
    var loads = ['300 26px "Sora"', '300 40px "Sora"', '400 16px "Geist"', '500 16px "Geist"', '600 16px "Geist"', '500 11px "Geist Mono"', '400 10px "Geist Mono"']
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
    var gen = OWNER_GEN;
    var started = false;
    function start(){
      if (started) return; started = true;
      buildFaces();
      var pr = gen === OWNER_GEN && SES && SES.pendingRead;
      if (pr && pr.status === 'ok') go('RESTORE', { read: pr }); else go('WAKE');
    }
    Promise.all([bcall('theses').catch(noop), bcall('roster').catch(noop)]).then(function(r){
      if (gen !== OWNER_GEN){ start(); return; }
      if (r[0] && Array.isArray(r[0].items)) LEDGER = r[0].items;
      if (r[1]){ ROSTER = r[1]; buildBelt(r[1].companions); }
      start();
    });
    at(0.5, start);
    bcall('island').then(function(i){ if (gen !== OWNER_GEN) return; ISLAND = i; if (ST.name === 'IDLE' || ST.name === 'WAKE') buildFaces(); }).catch(noop);
    bcall('suggestions').then(function(x){ if (gen === OWNER_GEN) receiveSuggestions(x); }).catch(noop);
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
