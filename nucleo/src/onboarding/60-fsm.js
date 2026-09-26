
/* ============================================================
   The first run as a state machine (ARCHITECTURE.md §3.3).
   BIRTH → HELLO → PICK → PICKED → ASK_TEACH (⇄ PRE_PERMISSION,
   LISTENING, TYPING) → COMMIT → RISK → RESOLVING → THINK_WAIT →
   THINK_RESOLVE → TALK_EVIDENCE → TALK_CHART → VERDICT →
   HANDBACK → PULLING → CARDS → SAVING → RETURNING → SIGN_IN →
   SHEET_OUT → (ISLA_PEEK) → HOME → finishOnboarding() → DONE.
   Entries: #risk (risk only), resume (companion chosen), firstRun.
   ============================================================ */
var CALLS = [];   /* dev mock only: which methods were called, when (never the text) */
function call(method, params){
  if (!BR) return Promise.reject(new Error('no bridge'));
  if (MOCK){ CALLS.push([method, +T.toFixed(2), method === 'previewVoice' ? params.companionId : method === 'setCompanion' ? params.id : method === 'haptic' ? params.kind : '']); if (CALLS.length > 400) CALLS.shift(); }
  try { return BR.call(method, params || {}); } catch(e){ return Promise.reject(e); }
}
function fire(method, params){ call(method, params).catch(noop); }

var BEAT_OF = { BOOT:0, BIRTH:0, HELLO:1, PICK:2, PICKED:2, ASK_TEACH:3, PRE_PERMISSION:3, LISTENING:3, TYPING:3, COMMIT:3, RISK:4,
  RESOLVING:5, THINK_WAIT:5, THINK_RESOLVE:5, TALK_EVIDENCE:5, TALK_CHART:5, VERDICT:5, ERROR:5, HANDBACK:5, PULLING:6, CARDS:6, SAVING:6,
  RETURNING:6, SIGN_IN:7, SHEET_OUT:7, ISLA_PEEK:8, HOME:9, DONE:9 };
var BEAT_TITLES = ['O0 · First light', 'O1 · Hello', 'O2 · Choose your companion', 'O3 · Hold to ask', 'O4 · Hold to agree', 'O5 · First read',
  'O6 · Save the thesis', 'O7 · Sign in after value', 'O8 · Isla grew a piece', 'O9 · Home'];

var ENTER = {};
function go(name, arg){
  var prev = W.state;
  W.state = name; W.stT = T; W.gen++;
  W.log.push([name, +T.toFixed(3)]); if (W.log.length > 300) W.log.shift();
  try { if (ENTER[name]) ENTER[name](arg || {}, prev); } catch(e){ report('enter ' + name, e); }
  beatPost(name); harnessOn(name);
}
/* poll a condition on the sim clock (cancelled with the state) */
function waitThen(cond, fn){ var g = W.gen; (function poll(){ if (g !== W.gen) return; var ok = false; try { ok = cond(); } catch(e){ report('wait', e); } if (ok) fn(); else at(1 / 30, poll); })(); }
var RISK_NOTICE = null, ROSTER_P = null, RISK_P = null, SUGG_P = null, PICK_DEFAULT = 0;

/* ---------- native data ---------- */
function applySession(s){
  if (!s || typeof s !== 'object') return;
  SESSION = s;
  var lang = s.language === 'es' ? 'es' : 'en';
  if (lang !== LANG){ LANG = lang; applyStaticStrings(); }
  if (s.companion && s.companion.webId){
    var a = artFor(s.companion.webId, s.companion.palette, titleCase(s.companion.label));
    if (a !== CHOSEN_ART){ CHOSEN_ART = a; setAvatar(a); buildMatte(a, onMatte); }
  }
  if (W && s.level && fin(s.level.progress)) to(W.xpArc, c01(s.level.progress));
}
function applyStaticStrings(){
  document.documentElement.lang = LANG;
  txt($('permT'), Ls('perm.title')); txt($('permB'), Ls('perm.body')); txt($('permGo'), Ls('perm.go'));
  txt($('notice'), Ls('risk.notice')); txt($('pauseTag'), Ls('pause'));
  txt($('shT'), Ls('sheet.title')); txt($('appleL'), Ls('sheet.apple')); txt($('notnow'), Ls('sheet.notnow'));
  txt($('prompt'), ''); promptW = null;
  pill.setAttribute('aria-label', Ls('aria.pill')); $('close').setAttribute('aria-label', Ls('aria.close'));
  typeIn.setAttribute('placeholder', Ls('type.placeholder')); typeSend.setAttribute('aria-label', Ls('type.send'));
  agN.forEach(function(el, i){ el._x = null; });
}
function onMatte(c){ uploadTex(c); if (!SEEKING){ try { renderAll(); } catch(e){} } }
function loadRoster(){
  if (ROSTER_P) return ROSTER_P;
  ROSTER_P = call('roster', {}).then(function(r){
    var list = (r && r.companions) || [];
    PICKS = list.filter(function(c){ return c && c.requiredLevel === 1 && c.unlocked; }).map(function(c){
      var label = titleCase(c.label);
      return { id:String(c.id), webId:String(c.webId || c.id), label:label, art:artFor(String(c.webId || c.id), c.palette, label) };
    });
    NPICK = PICKS.length;
    PICK_DEFAULT = 0; for (var i = 0; i < PICKS.length; i++){ if (PICKS[i].id !== 'orb'){ PICK_DEFAULT = i; break; } }
    PICKS.forEach(function(p){ buildMatte(p.art, onMatte); });
    return PICKS;
  }, function(e){ ROSTER_P = null; throw e; });
  return ROSTER_P;
}
function loadRisk(){
  if (RISK_P) return RISK_P;
  RISK_P = call('riskNotice', {}).then(function(r){ if (r && r.statements && r.statements.length){ RISK_NOTICE = r; } else throw new Error('empty notice'); return r; }, function(e){ RISK_P = null; throw e; });
  return RISK_P;
}
function loadSugg(){
  if (SUGG_P) return SUGG_P;
  SUGG_P = call('suggestions', {}).then(function(r){ W.sugg = r || null; return r; }, function(){ W.sugg = null; return null; });
  return SUGG_P;
}
/* chips from suggestions(): quick access "How is X looking?", movers "Why is X moving today?" (max 3, no repeats) */
function suggestionChips(){
  var s = W.sugg, out = [], seen = {}, qa = (s && s.quickAccess) || [], mv = (s && s.movers) || [];
  function push(sym, key){ sym = String(sym || '').toUpperCase(); if (!sym || seen[sym] || out.length >= 3) return; seen[sym] = 1; var q = Ls(key, { sym:sym }); out.push({ label:q, action:{ ask:q } }); }
  qa.slice(0, 2).forEach(function(x){ push(x && x.symbol, 'chip.look'); });
  mv.forEach(function(x){ push(x && x.symbol, 'chip.move'); });
  qa.slice(2).forEach(function(x){ push(x && x.symbol, 'chip.look'); });
  return out;
}
function setChips(list){ W.chips = list || []; W.chipsKey = W.chips.map(function(c){ return c.label; }).join('|') + '#' + T.toFixed(3); tb('chips'); }

/* ---------- entry ---------- */
function route(s){
  if (HASH === 'risk' || (s.onboarded && !s.riskAccepted)){ enterBorn(); go('RISK', { only:true }); return; }
  if (s.onboarded && s.riskAccepted){ enterBorn(); go('HOME', { quick:true }); return; }
  if (s.companion){ enterBorn(); go('ASK_TEACH', { resume:true }); return; }
  go('BIRTH');
}
/* the sphere is already alive (resume, risk only): no birth replay */
function enterBorn(){
  W.birthT = T - 30; W.r.x = W.r.t = 120; W.birth.x = W.birth.t = 1; W.glow.x = W.glow.t = 1; W.birthMass = false; W.energy.x = W.energy.t = 0.35;
  tb('wmFly', T - 5); tb('pillIn', T - 0.3);
  if (CHOSEN_ART){ tb('avaFly', T - 5); tintSnap(CHOSEN_ART.tintLab); W.tintAmt.x = W.tintAmt.t = 0.35; W.chosen = true; }
  loadRoster().catch(noop);
}

/* ---------- O0 first light ---------- */
ENTER.BIRTH = function(){
  W.birthT = T;
  loadRoster().catch(noop);
  at(0.40, function(){ buzz('light', 0.45); });
  at(0.70, function(){ buzz('light', 0.28); });
  at(1.00, function(){ to(W.r, 120, 'birth'); to(W.birth, 1); W.energy.x = 0.6; to(W.energy, 0.35); if (RM){ W.r.x = W.r.t = 120; W.birth.x = W.birth.t = 1; W.glow.x = W.glow.t = 1; } });
  at(1.18, function(){ to(W.glow, 1); });
  at(2.00, function(){ tb('wmBig'); });
  at(2.20, function(){ W.birthMass = false; });
  at(2.80, function(){ go('HELLO'); });
};

/* ---------- O1 hello: the trailer duel is keyed to the spoken words, not to a clock ---------- */
ENTER.HELLO = function(){
  tb('wmFly'); W.agMode = 'trailer';
  at(0.10, function(){
    var ln = sayLine({ id:'hello', text:Ls('hello'), top:512, watchdog:3.5 });
    var n = ln.words.length, p2 = ln.pages[1] ? ln.pages[1].w0 : Math.max(0, n - 6), lastS = p2;
    for (var i = n - 2; i >= p2; i--){ if (/[.!?…]$/.test(ln.words[i])){ lastS = i + 1; break; } }
    var cT = null;
    ln.cues.push({ word:p2, fn:function(){
      at(0.10, function(){ crit(W.swirl, 0.4); to(W.swirl, 0.8); to(W.irid, 0.55); });
      at(0.15, function(){ tb('trA'); nodeIn(0); });
      at(0.35, function(){ tb('trR'); nodeIn(1); });
      at(0.55, function(){ tb('trC'); nodeIn(2); W.duel = { t0:T }; });
    } });
    ln.cues.push({ word:lastS, fn:function(){ cT = T; at(0.05, function(){ tg('trA'); tg('trR', T + 0.06); tg('trC', T + 0.12); converge(0.7); to(W.energy, 0.6); }); } });
    ln.cues.push({ word:n - 1, fn:function(){
      var dt = Math.max(0.13, cT != null ? cT + 0.55 - T : 0.13);
      at(dt, helloImpact);
    } });
  });
  at(25, function(){ go('PICK'); });   /* never strands the first run */
};
function helloImpact(){
  expo(0.15); shock(0.8, 0.3, C_IVORY, 0.16); W.vcol = C_IVORY; W.floodAmt = 0.5; crit(W.flood, 0.48); to(W.flood, 1.1); buzz('soft', 0.8); nodesOff();
  at(0.20, function(){ crit(W.swirl, 0.8); to(W.swirl, 0); crit(W.flood, 0.7); to(W.flood, 0); to(W.irid, 1); to(W.energy, 0.35); W.duel = null; });
  at(0.55, function(){ go('PICK'); });
}
function nodeIn(i){ W.nodeOn[i] = true; W.nodeAng[i] = [A_ALPHA, A_RED, A_CIO][i]; W.nodeR[i].x = 0.95; to(W.nodeR[i], W.sepR0[i], 'emit'); to(W.nodeGlow[i], 1); }
function nodesOff(){ for (var i = 0; i < 3; i++){ to(W.nodeGlow[i], 0); } }
function converge(d){ W.conv = { t0:T, d:d, r0:[W.nodeR[0].x, W.nodeR[1].x, W.nodeR[2].x] }; }

/* ---------- O2 choose your companion (starters from roster(); previewVoice on each detent) ---------- */
ENTER.PICK = function(a){
  W.agMode = 'trailer'; W.duel = null; W.conv = null; W.nodeOn = [false, false, false];
  loadSugg();
  loadRoster().then(function(){ if (W.state === 'PICK') pickReady(a); }, function(){ if (W.state === 'PICK'){ setHint(''); at(1.5, function(){ go('PICK', a); }); } });
};
function pickReady(a){
  if (!NPICK) return;
  var again = !!a.again, d = again ? clamp(W.pick, 0, NPICK - 1) : PICK_DEFAULT;
  W.pick = d; W.picker = true; W.chosen = false; W.chosenIdx = -1;
  moveSphere(330, 124);
  W.theta.x = W.theta.t = d * DET; W.theta.v = 0; W.belt.x = W.belt.t = d;
  W.compSil.x = W.compSil.t = 0; W.compDepth.x = 1; to(W.compDepth, 0); to(W.compAmt, 1);
  tintTo(PICKS[d].art.tintLab, 0.35); W.snowOn = true; W.snowT = T; W.snowOff = null; initSnow();
  delete W.tm.beadsOut; delete W.tm.avaFly;
  buildBelt();
  at(0.10, function(){ tb('prompt'); });
  at(0.20, function(){ tb('belt'); });
  at(0.40, function(){
    tb('pname'); W.pickRoll = [{ i:d, t:T, dir:0 }];
    var lab0 = Ls('pick.choose', { name:PICKS[d].label });
    setPill('label', lab0, pillFor(lab0, 180)); if (tmB('pillIn') > T) tb('pillIn');
    setHint(again ? Ls('pick.failed') : Ls('pick.hint'));
    W.pickReady = true; signal('PICK_READY');
  });
  at(0.90, function(){ preview(d); });
}
function preview(k){ var p = PICKS[k]; if (!p) return; var seq = ++W.pvSeq; after(0, function(){ if (seq === W.pvSeq) fire('previewVoice', { companionId:p.id }); }); }
function pickTo(k, dir){
  k = clamp(k, 0, NPICK - 1);
  to(W.theta, k * DET, 'glide');
  if (k === W.pick) return;
  W.pick = k; W.pickRoll.push({ i:k, t:T, dir:dir }); if (W.pickRoll.length > 8) W.pickRoll.shift();
  to(W.belt, k, 'glide');
  var lab1 = Ls('pick.choose', { name:PICKS[k].label });
  setPill(null, lab1, pillFor(lab1, 180));
  after(0.32, function(){ gulpK(0.02); buzz('selection', 0.35); });
  var seq = ++W.pvSeq; after(0.35, function(){ if (seq === W.pvSeq && W.state === 'PICK') fire('previewVoice', { companionId:PICKS[k].id }); });
}
function choose(){
  if (W.state !== 'PICK' || !W.picker || !W.pickReady || !PICKS[W.pick]) return;
  go('PICKED', { p:PICKS[W.pick] });
}
ENTER.PICKED = function(a){
  var p = a.p, ok = null;
  W.pickReady = false; W.pvSeq++; fire('stopSpeaking', {});
  gulpK(0.04); bodyKick(W.hop, -245); buzz('success', 1); W.burst = T; setPill('check', null, null); W.chosen = true; W.chosenIdx = W.pick;
  CHOSEN_ART = p.art; setAvatar(p.art);
  call('setCompanion', { id:p.id }).then(function(s){ applySession(s); ok = true; }, function(){ ok = false; });
  at(0.20, function(){ tb('beadsOut'); tb('avaFly'); setHint(''); });
  at(0.32, function(){ tg('pname'); });
  at(0.50, function(){ to(W.compSil, 1); to(W.compAmt, 0.3); tintTo(companionTint(), 0.35); W.snowOff = T; });
  at(0.60, function(){ to(W.pillW, 96, 'pill'); });
  at(0.65, function(){ W.chosenLine = sayLine({ id:'chosen', text:Ls('pick.chosen', { name:p.label }), top:512, watchdog:3 }); });
  at(1.20, function(){ to(W.compAmt, 0); });
  at(1.70, function(){ tg('prompt'); });
  at(1.90, function(){ moveSphere(340, 120); W.picker = false; W.thBase = W.theta.t; });
  at(2.50, function(){ waitThen(function(){ return ok !== null && (!W.chosenLine || W.chosenLine.done); }, function(){
    if (ok) go('ASK_TEACH');
    else { W.chosen = false; W.chosenIdx = -1; CHOSEN_ART = null; if (W.chosenLine) capGone(W.chosenLine); go('PICK', { again:true }); }
  }); });
};

/* ---------- O3 hold to ask (the pre-permission card, then the REAL system prompts) ---------- */
ENTER.ASK_TEACH = function(a){
  W.agMode = 'trailer'; W.question = W.question || ''; W.press = null;
  if (isOn('perm')) tg('perm');
  if (W.errLine){ capGone(W.errLine); W.errLine = null; } if (isOn('cap2')) tg('cap2');
  if (isOn('chips')) tg('chips');   /* the previous set sinks into the pill before the new one is born */
  var quiet = a.quiet || a.granted;
  if (!quiet){ W.title = [Ls('ask.title'), Ls('ask.sub')]; tb('title'); }
  if (a.again) tg('dock');
  if (tmB('pillIn') > T) tb('pillIn');
  at(0.20, function(){ setPill('mic', '', 96); W.micBreath = true; });
  loadSugg().then(function(){ if (W.state === 'ASK_TEACH') at(quiet ? 0.25 : 0.40, function(){ setChips(suggestionChips()); }); });
  if (a.granted){ at(0.15, function(){ W.gotLine = sayLine({ id:'gotit', text:Ls('ask.gotIt'), top:512, watchdog:3 }); setHint(Ls('hint.hold')); }); }
  else if (a.hint) setHint(a.hint);
  else if (quiet) setHint(Ls('hint.hold'));
  else setHint('');
  signal(a.granted ? 'ASK_GRANTED' : 'ASK_READY');
};
function askCapable(){ return W.state === 'ASK_TEACH' || W.state === 'ERROR' || W.state === 'TYPING'; }
function askPress(){
  var mic = SESSION && SESSION.mic ? SESSION.mic.state : 'unavailable';
  var p = W.press = { t:T, mic:mic, released:false, cancelled:false };
  if (W.state === 'TYPING'){ if (mic !== 'granted'){ W.press = null; focusType(); return; } showTypeBox(false); }
  if (isOn('title')) tg('title'); if (isOn('chips')) tg('chips');
  if (W.errLine){ capGone(W.errLine); W.errLine = null; } if (isOn('cap2')) tg('cap2');
  if (W.gotLine){ capGone(W.gotLine); }
  to(W.lean, 1); W.micBreath = false;
  if (mic === 'granted') startListening(p);
}
function askRelease(){
  var p = W.press; if (!p) return; W.press = null; p.released = true;
  var dt = T - p.t;
  if (p.mic === 'granted'){
    if (dt < 0.25){ p.cancelled = true; fire('speech.stop', { cancel:true }); endListenVisual(); go('TYPING'); return; }
    if (W.state === 'LISTENING') stopListening();
    return;
  }
  to(W.lean, 0);
  if (p.mic === 'undetermined'){ go('PRE_PERMISSION'); return; }
  go('TYPING', { reason:'denied' });
}
function startListening(p){
  var req = ++W.listenSeq;
  go('LISTENING');
  call('speech.start', {}).then(function(r){
    var s = r && r.status;
    if (req !== W.listenSeq || p.cancelled){ if (s === 'listening') fire('speech.stop', { cancel:true }); return; }
    if (s === 'listening'){ p.listening = true; if (p.released && W.state === 'LISTENING') fire('speech.stop', {}); return; }
    endListenVisual();
    if (s === 'busy'){ go('ASK_TEACH', { quiet:true }); return; }
    var mic = s === 'needs_permission' ? 'undetermined' : (s === 'unavailable' ? 'unavailable' : 'denied');
    if (SESSION) SESSION.mic = { state:mic, onDevice:mic !== 'unavailable' };
    p.mic = mic;
    if (p.released){ if (mic === 'undetermined') go('PRE_PERMISSION'); else go('TYPING', { reason:'denied' }); }
    else { W.press = p; W.state = 'ASK_TEACH'; }   /* the release decides (card or typing) */
  }, function(){ if (req !== W.listenSeq) return; endListenVisual(); go('ASK_TEACH', { quiet:true, hint:Ls('hint.sttError') }); });
}
ENTER.PRE_PERMISSION = function(){ tb('perm'); W.micBreath = false; setHint(''); W.permBusy = false; };
function permContinue(){
  if (W.state !== 'PRE_PERMISSION' || W.permBusy) return;
  W.permBusy = true; buzz('light', 0.5);
  after(0.10, function(){ tg('perm'); });
  call('speech.requestPermission', {}).then(function(m){
    W.permBusy = false; if (m && m.state && SESSION) SESSION.mic = m;
    if (W.state !== 'PRE_PERMISSION') return;
    if (m && m.state === 'granted') go('ASK_TEACH', { granted:true }); else go('TYPING', { reason:'denied' });
  }, function(){ W.permBusy = false; if (W.state === 'PRE_PERMISSION') go('TYPING', { reason:'denied' }); });
}
ENTER.LISTENING = function(){
  setPill('listen', '', 236); tb('listen'); moveSphere(340, 132); to(W.lean, 1); setHint(Ls('hint.release'));
  clearWords(); W.qFinal = false; W.awaitFinal = 0; W.micLevel = 0; W.txShift.x = W.txShift.t = 0; W.txShift.v = 0; tb('words');
};
function stopListening(){
  fire('speech.stop', {});
  tg('listen'); setPill('mic', '', 96); setHint(''); to(W.lean, 0);
  W.awaitFinal = T + 2.5;
}
function endListenVisual(){ if (isOn('listen')) tg('listen'); setPill('mic', '', 96); setHint(''); to(W.lean, 0); moveSphere(340, 120); tg('words'); W.awaitFinal = 0; }
function onSpeechFinal(text){
  if (W.state !== 'LISTENING') return;
  W.awaitFinal = 0;
  var q = String(text || '').trim();
  if (!q){ endListenVisual(); go('ASK_TEACH', { quiet:true, hint:Ls('hint.sttEmpty') }); return; }
  updateWords(q); commitQuestion(q, 'voice');
}
/* transcript words: the stable prefix keeps its spans, new words rise, revised tail words re-roll */
function clearWords(){ W.qw.forEach(function(w){ if (w.el && w.el.parentNode) w.el.parentNode.removeChild(w.el); }); W.qw = []; txIn.innerHTML = ''; }
function updateWords(text, stagger){
  var ws = String(text || '').split(/\s+/).filter(Boolean).slice(-40);
  var old = W.qw, out = [], i, same = true;
  for (i = 0; i < ws.length; i++){
    var o = old[i];
    if (same && o && o.text === ws[i]) out.push(o);
    else { same = false; out.push({ text:ws[i], born:T + (stagger ? stagger * i : 0), reroll:!!o, el:null }); }
  }
  for (i = 0; i < old.length; i++){ if (out.indexOf(old[i]) < 0 && old[i].el && old[i].el.parentNode) old[i].el.parentNode.removeChild(old[i].el); }
  W.qw = out;
  txIn.innerHTML = '';
  out.forEach(function(w, k){ if (!w.el){ w.el = document.createElement('span'); w.el.className = 'w'; } w.el.textContent = w.text + (k < out.length - 1 ? ' ' : ''); txIn.appendChild(w.el); });
  /* one line: centred with room for the next word, then eased left so the newest words stay in view */
  var wdt = txIn.offsetWidth || 0, reserve = W.qFinal ? 0 : 40, tgt = wdt + reserve <= 350 ? (350 - wdt - reserve) / 2 : 350 - wdt - reserve;
  to(W.txShift, tgt, 'soft'); cls(txEl, 'long', tgt < -1);
}
function commitQuestion(text, src){
  text = String(text || '').trim(); if (!text) return;
  W.question = text; W.qSrc = src; W.qFinal = true;
  if (src !== 'voice'){ clearWords(); tb('words'); W.txShift.x = W.txShift.t = 0; updateWords(text, Math.min(0.06, 0.6 / Math.max(1, text.split(/\s+/).length))); }
  else updateWords(text);
  go('COMMIT');
}
ENTER.COMMIT = function(){
  var lead = W.qSrc === 'voice' ? 0.05 : 0.45 + Math.min(0.6, 0.06 * W.qw.length);
  setPill('mic', '', 96); setHint(''); if (isOn('title')) tg('title'); if (isOn('chips')) tg('chips'); W.micBreath = false; showTypeBox(false);
  if (W.gotLine) capGone(W.gotLine);
  at(lead, function(){ tb('gather'); buzz('soft', 0.5); moveSphere(340, 120); });
  at(lead + 0.80, function(){ W.emitEv = { t:T, ang:-Math.PI / 2, ext:-0.05, d:0.09 }; after(0.09, function(){ gulpK(0.03); ripple(0.02); }); hap(0.5); crit(W.tintAmt, 0.3); to(W.tintAmt, 0); to(W.wash, 0); });
  at(lead + 0.85, function(){ tb('dock'); });
  at(lead + 0.90, function(){ tb('qwait'); tg('words'); });
  at(lead + 1.10, function(){ if (SESSION && SESSION.riskAccepted) startAsk({ question:W.question }); else go('RISK'); });
};

/* ---------- typing: a real textarea outside the scaled stage ---------- */
ENTER.TYPING = function(a){
  W.micBreath = false; if (isOn('title')) tg('title'); if (isOn('chips')) tg('chips'); if (isOn('perm')) tg('perm');
  setHint(Ls('hint.type')); setPill('mic', '', 96); to(W.lean, 0);
  showTypeBox(true);
};
function typeSubmit(){ if (W.state !== 'TYPING') return; var v = String(typeIn.value || '').trim(); if (!v) return; typeIn.value = ''; showTypeBox(false); try { typeIn.blur(); } catch(e){} commitQuestion(v, 'typed'); }
function typeCancel(){ if (W.state !== 'TYPING') return; showTypeBox(false); go('ASK_TEACH', { quiet:true }); }

/* ---------- O4 risk notice: the 4 real statements, hold to agree ---------- */
ENTER.RISK = function(a){
  W.riskOnly = !!a.only; W.agree = null; W.agreeReady = false; W.agreeBusy = false; W.micBreath = false; setHint('');
  if (isOn('title')) tg('title'); if (isOn('chips')) tg('chips');
  loadRisk().catch(function(){ at(1.0, function(){ RISK_P = null; loadRisk().catch(noop); }); });
  at(0.10, function(){ moveSphere(318, 104); });
  at(0.12, function(){ W.riskLine = sayLine({ id:'risk', text:Ls(W.riskOnly ? 'risk.introOnly' : 'risk.intro'), top:468, watchdog:3 }); });
  at(0.20, function(){ tb('agreeRing'); });
  waitThen(function(){ return T - W.stT >= 1.4 && RISK_NOTICE && (!W.riskLine || W.riskLine.done); }, riskLinesIn);
};
function riskLinesIn(){
  buildRisk(RISK_NOTICE.statements); var L = layoutRisk(452);
  tb('lines');
  at(0.30, function(){
    sc(noticeEl, 'top', f1(L.notice) + 'px'); tb('notice');
    var lab = Ls('risk.hold'); setPill('agree', lab, pillFor(lab, 196)); if (tmB('pillIn') > T) tb('pillIn');
    W.agreeReady = true; signal('AGREE_READY');
  });
}
function agreeRaw(t, t0){ var u = (t - t0) / 1.2; if (u >= 1) return 1; var k = 1 - 0.15 / 1.2; return u < k ? u : k + (1 - k) * EXH((u - k) / (1 - k)); }
function agreeP(t){
  var a = W.agree; if (!a) return 0;
  if (a.done != null) return 1;
  if (a.rel != null) return a.p * (1 - FAD(c01((t - a.rel) / 0.3)));
  return agreeRaw(t, a.t0);
}
function agreePress(){ if (W.state !== 'RISK' || !W.agreeReady || W.agreeBusy) return; W.agree = { t0:T }; W.agreeTick = T; buzz('light', 0.4); setHint(''); }
function agreeRelease(){ var a = W.agree; if (!a || a.t0 == null || a.done != null) return; W.agree = { rel:T, p:agreeRaw(T, a.t0) }; }   /* early release: unwinds, no copy */
function agreeComplete(){
  W.agree = { done:T }; W.agreeBusy = true;
  buzz('success', 1); W.rimBoost.x = 0.15; to(W.rimBoost, 0); crit(W.rimBoost, 0.33);
  tg('agreeRing'); tg('lines'); tg('notice'); setPill('think', '', 96);
  var v = RISK_NOTICE ? RISK_NOTICE.version : 0;
  call('acceptRisk', { version:v }).then(function(r){
    if (W.state !== 'RISK') return;
    if (r && r.accepted){ if (SESSION){ SESSION.riskAccepted = true; SESSION.riskVersion = r.version; } if (W.riskOnly) at(0.6, finish); else at(0.40, function(){ startAsk({ question:W.question }); }); }
    else riskFailed();
  }, riskFailed);
}
function riskFailed(){
  if (W.state !== 'RISK') return;
  W.agreeBusy = false; W.agree = null; W.agreeReady = false; RISK_P = null; RISK_NOTICE = null;
  setHint(Ls('risk.failed'));
  loadRisk().then(function(){ if (W.state !== 'RISK') return; tb('agreeRing'); riskLinesIn(); }, noop);
}

/* ---------- O5 first read ---------- */
function startAsk(params){
  var seq = ++W.askSeq; W.reply = null; M = null;
  go('RESOLVING');
  call('ask', params).then(function(r){ if (seq === W.askSeq) onAskReply(r); },
    function(e){ if (seq === W.askSeq) onAskReply({ v:1, status:'error', code:'bad_response', message:null }); });
}
function onAskReply(r){
  if (!r || typeof r !== 'object') r = { v:1, status:'error', code:'bad_response' };
  if (r.status === 'ok'){
    try { M = RMOD.build(r, { lang:LANG, firstRead:true, signedIn:!!(SESSION && SESSION.signedIn) }); }
    catch(e){ report('build', e); go('ERROR', { v:1, status:'error', code:'bad_response' }); return; }
    W.reply = r;
    if (W.state === 'RESOLVING') go('THINK_WAIT');
    return;
  }
  if (r.status === 'cancelled'){ teardownRead(); go('ASK_TEACH', { again:true }); return; }
  go('ERROR', r);
}
ENTER.RESOLVING = function(){ setPill('think', '', 96); setHint(''); W.micBreath = false; W.floor = 4.5; if (!isOn('dock')) tb('dock'); };
ENTER.THINK_WAIT = function(){
  W.thinkT = T; W.crossN = 0; W.lastHint = '';
  tb('burst'); W.agMode = 'names'; W.stanceT = [1e9, 1e9, 1e9]; agSt.forEach(function(s){ sc(s, 'display', 'none'); });
  at(0.10, function(){ W.conv = null; W.nodeOn = [false, false, false]; moveSphere(380, 124); crit(W.swirl, 0.9); to(W.swirl, 1); to(W.irid, 0.35); to(W.energy, 0.45); W.duel = { t0:T }; });
  at(0.30, function(){ tb('agA'); nodeIn(0); });
  at(0.75, function(){ tb('agR'); nodeIn(1); to(W.energy, 0.52); });
  at(1.20, function(){ tb('agC'); nodeIn(2); to(W.energy, 0.6); });
};
function thinkHints(){
  var el = T - W.thinkT, s = el >= 75 ? Ls('think.long') : el >= 30 ? Ls('think.still') : el >= 8 ? Ls('think.elapsed', { s:Math.floor(el) }) : '';
  if (s !== W.hint) setHint(s);
}
ENTER.THINK_RESOLVE = function(){
  var E = T;
  setHint(''); setStances(M.agents);
  W.agMode = 'stances'; W.stanceT = [E, E + 0.55, E + 1.10];
  /* the voice starts now: its fetch overlaps the choreography (R7: CIO sentences + the closing line) */
  var sp0 = M.spoken, vIdx = M.spoken.verdictWordIndex;
  var closeStart = wordIndexOfSentence(sp0.sentences, sp0.stageAt.verdict);
  var chartW = sp0.stageAt.chart != null ? wordIndexOfSentence(sp0.sentences, sp0.stageAt.chart) : null;
  var breaks = [closeStart]; if (chartW) breaks.push(chartW);
  W.chartDue = false; W.chartT = 0; W.evT = 0; W.talkPhase = 'evidence'; W.verdictShown = false;
  W.readLine = sayLine({ id:M.requestId, exactId:true, noSplit:true, text:sp0.text, visible:false, hold:true, breaks:breaks, amberIdx:vIdx, watchdog:6,
    top:function(){ return W.talkPhase === 'evidence' ? 488 : 592; } });
  if (M.chart){
    var cw = chartW != null ? chartW : Math.max(0, wordIndexOfSentence(sp0.sentences, 1) - 1);
    W.readLine.cues.push({ word:cw, fn:function(){ if (chartW != null) chartDue(); else after(0.3, chartDue); } });
  }
  var stDone = E + 1.10 + 0.045 * agStW[2].length + 0.26;
  W.holdEnd = stDone + 1.6;
  waitThen(function(){
    var ln = W.readLine, vs = ln && ln.src === 'voice' && ln.t0 != null ? ln.t0 : null;
    return T >= W.holdEnd || (vs != null && T >= Math.max(E + 1.7, vs + 0.2));   /* the voice started: stop holding */
  }, resolveConverge);
};
function setStances(agents){
  for (var i = 0; i < 3; i++){
    var el = agSt[i]; sc(el, 'display', '');
    if (i < 2) agStW[i] = stanceSpans(el, agents[i].stance);
    else { agStW[2] = stanceSpans(agCroll[0], agents[2].stance); txt(agCroll[1], Ls('think.forming')); }
    agEls[i]._h = agEls[i].offsetHeight || 60;
  }
}
function resolveConverge(){
  tb('cioRoll'); converge(1.0); to(W.energy, 0.9);
  at(0.30, function(){ tg('tethers'); });
  at(0.40, function(){ tg('agA'); tg('agR', T + 0.06); tg('agC', T + 0.12); });
  at(1.00, function(){ shock(1.05, 0.35, C_PEARL, 0.18); expo(0.35); buzz('medium', 0.8); crit(W.braid, 0.48); to(W.braid, 1.1); to(W.wFlow, 0.04); to(W.energy, 0.45); nodesOff(); });
  at(1.18, function(){ to(W.swirl, 0.1); to(W.wFlow, 0.3); });
  at(1.50, function(){ W.filR = 0.8; to(W.filA, 0.7); });
  at(1.60, function(){ waitThen(function(){ return !W.readLine || W.readLine.t0 != null; }, function(){ go('TALK_EVIDENCE'); }); });
}
function chartDue(){ W.chartDue = true; if (W.state === 'TALK_EVIDENCE') tryChart(); }
function tryChart(){
  if (W.state !== 'TALK_EVIDENCE' || !M.chart) return;
  var wait = 1.4 - (T - W.evT); if (wait > 0){ at(wait, tryChart); return; }
  go('TALK_CHART');
}
ENTER.TALK_EVIDENCE = function(){
  W.talkPhase = 'evidence'; W.evT = T;
  W.duel = null; moveSphere(330, 96); W.talking = true; setPill('stop', '', 96);
  at(0.20, function(){ if (W.readLine){ W.readLine.visible = true; } });
  at(0.25, function(){ W.compSil.x = W.compSil.t = 1; W.compDepth.x = 1; to(W.compDepth, 0); W.compShow = true; buildSats(M.satellites); tb('sats'); });
  if (W.chartDue) at(1.4, tryChart);
};
ENTER.TALK_CHART = function(){
  W.talkPhase = 'chart'; W.chartT = T;
  buildChart(M.chart, LANG, M.verdict.color);
  moveSphere(210, 64);
  var ln = W.readLine; if (ln && ln.page != null) showPage(ln, ln.page);   /* the live page moves under the chart */
  at(0.58, function(){ W.preInhale = T; });
  at(0.72, function(){ tb('comet'); W.emitEv = { t:T, ang:-Math.PI / 2, ext:0.117, d:0.42, out:true }; expo(0.10); });
};
/* the verdict condenses 30 ms before the spoken verdict word; satellites and chart keep a minimum moment */
function verdictStep(){
  if (W.state !== 'TALK_EVIDENCE' && W.state !== 'TALK_CHART') return;
  var ln = W.readLine; if (!ln || ln.t0 == null || !M) return;
  if (M.chart && W.chartDue && !W.chartT) return;
  var tv = estLit(ln, M.spoken.verdictWordIndex);
  if (M.spoken.verdictWordIndex < 0) tv = lineEndEst(ln) - 0.2;
  var minT = Math.max(W.evT + 1.6, W.chartT ? W.chartT + 2.6 : 0);
  if (T >= Math.max(tv, minT + 0.82) - 0.82) go('VERDICT');
}
function skipTalk(){
  var ln = W.readLine; if (!ln || ln.done || !M) return;
  fire('stopSpeaking', {}); ln.src = 'clock'; ln.voiceEnded = true;
  var vi = Math.max(0, M.spoken.verdictWordIndex);
  if (ln.wt[vi]){ var t0n = T + 0.9 - ln.wt[vi].t0; if (t0n < ln.t0) ln.t0 = t0n; }
}
ENTER.VERDICT = function(){
  var vc = rgb01(M.verdict.color);
  W.vcolHex = M.verdict.color; W.vcore = rgb01(M.verdict.core); W.vambLab = lab(M.verdict.amb);
  W.ringMode = M.ring.mode; W.ringPct = M.ring.mode === 'conviction' ? c01(M.ring.pct / 100) : 1;
  txt(vWord, M.verdict.word); txt($('vlab'), M.ring.label || ''); stage.style.setProperty('--vc', M.verdict.color);
  sa(ringArc, 'stroke', M.verdict.color); sa(ringHead, 'fill', M.verdict.color);
  tg('sats'); after(0.38, function(){ gulpK(0.01); }); after(0.42, function(){ gulpK(0.01); }); after(0.46, function(){ gulpK(0.01); });
  at(0.10, function(){ W.compShow = false; to(W.compDepth, 1); to(W.compAmt, 0); });
  at(0.15, function(){ moveSphere(210, 72); });
  at(0.25, function(){ W.filCollapse = T; });
  at(0.79, function(){ shock(1.05, 0.30, vc, 0.16); expo(0.22); buzz('rigid', 0.5); W.vcol = vc; W.floodAmt = 1; crit(W.flood, 0.48); to(W.flood, 1.1); to(W.braid, 0); to(W.scrim, 1); to(W.filA, 0); W.vflag = true; });
  at(0.82, function(){ tb('verdict'); W.verdictShown = true; txt(live, M.aria); });
  at(1.07, function(){ tb('ring'); });
  at(2.17, function(){ buzz('soft', 0.5); });
  if (M.ring.mode === 'conviction') at(2.25, function(){ setHint(Ls('hint.conviction')); });
  waitThen(function(){ return T - W.stT > 2.4 && (!W.readLine || W.readLine.done); }, function(){ go('HANDBACK'); });
};
ENTER.HANDBACK = function(a){
  W.talking = false;
  var lab1 = Ls('pill.fullRead'); setPill('label', lab1, pillFor(lab1, 150));
  if (a.back){ to(W.pull, 0, 'gulp'); to(W.reveal, 0, 'glide'); to(W.energy, 0.35); to(W.wFlow, 0.18); return; }
  tb('meta');
  at(0.10, function(){ bodyKick(W.sag, 150); });
  at(0.60, function(){ if (!W.pullHinted){ W.pullHinted = true; setHint(Ls('hint.pull')); fire('markHint', { key:'verdictPull' }); } });
  at(0.65, function(){ bodyKick(W.sag, 150); });
  W.island = null; buildCards(M, null, LANG);
  call('island', {}).then(function(r){ W.island = r || null; if (r && r.available && (W.state === 'HANDBACK' || W.state === 'PULLING')) buildCards(M, r, LANG); }, noop);
  signal('HANDBACK_READY');
};
function pullStart(y){ if (W.state !== 'HANDBACK') return false; W.pulling = true; W.pullY0 = y; W.pullY = y; W.pullCommitted = false; setHint(''); to(W.energy, 0.18); to(W.wFlow, 0.04); go('PULLING'); return true; }
function pullEnd(vy){
  if (W.state !== 'PULLING') return;
  W.pulling = false;
  if (W.pullCommitted || vy > 500){ if (!W.pullCommitted) pullCommit(); go('CARDS'); }
  else go('HANDBACK', { back:true });
}
function pullCommit(){ W.pullCommitted = true; tb('commit'); buzz('light', 0.6); if (W.readLine) capGone(W.readLine); tg('meta'); }
ENTER.CARDS = function(a){
  if (a.back) return;
  W.pulling = false; to(W.pull, 0, 'gulp'); kick(W.pull, -0.02); moveSphere(158, 44); to(W.reveal, 1, 'glide'); W.reveal.v = Math.max(W.reveal.v, 2.2); tb('present');
  var ti = CARDS.indexOf(cardT); W.track.x = W.track.t = ti < 0 ? 1 : ti; W.track.v = 0;
  tb('pillHide'); setHint(''); W.saved = false; W.saving = false;
  signal('CARDS_READY');
};
function saveTap(){
  if (W.state !== 'CARDS' || W.saving || W.saved || !M) return;
  if (Math.round(W.track.x) !== CARDS.indexOf(cardT)) return;
  W.saving = true; go('SAVING');
}
ENTER.SAVING = function(){
  tb('saved'); buzz('success', 1);
  call('saveThesis', { requestId:M.requestId }).then(function(r){
    if (W.state !== 'SAVING') return;
    W.saving = false;
    if (!r || r.status !== 'saved'){ saveFailed(); return; }
    W.saveRes = r; W.saved = true;
    txt(xpEl, RMOD.xpChip(r.awardedXP, M.verdict.key, LANG)); tb('xp');
    if (SESSION){ SESSION.xp = r.xp; if (r.level) SESSION.level = r.level; SESSION.streak = r.streak; }
    if (r.level && fin(r.level.progress)) to(W.xpArc, c01(r.level.progress));
    var extra = [];
    if (r.evolution) extra.push(Ls('evolution', { n:r.evolution.number, name:r.evolution.name }));
    if (r.unlocks && r.unlocks.length) extra.push(Ls('unlocked', { names:r.unlocks.map(function(u){ return u.name; }).join(', ') }));
    if (extra.length) setHint(extra.join(' · '));
    at(0.40, function(){ txt(tpillEl, M.thesis.pill); tpillEl._w = 0; tb('tpill'); });
    at(0.92, function(){ gulpK(0.04); buzz('light', 0.5); });
    at(1.10, function(){ go('RETURNING'); });
  }, saveFailed);
};
function saveFailed(){ W.saving = false; if (W.state !== 'SAVING') return; tg('saved'); setHint(Ls('save.failed')); buzz('error', 0.5); go('CARDS', { back:true }); }
ENTER.RETURNING = function(a){
  tg('cards'); tg('verdict'); tg('ring'); tg('present'); tg('dock'); tg('pillHide'); tg('sats');
  if (!isOn('commit') && tmB('commit') > T) tb('commit');       /* an un-pulled chart is inhaled too */
  if (W.readLine){ capGone(W.readLine); if (W.readLine.src === 'voice' && !W.readLine.done) fire('stopSpeaking', {}); }
  tg('meta'); setPill('mic', '', 96); W.verdictShown = false; W.talking = false; W.compShow = false; to(W.compAmt, 0);
  if (!W.saved) setHint('');
  at(0.28, function(){ moveSphere(340, 120); });
  at(0.40, function(){ crit(W.flood, 0.7); to(W.flood, 0); to(W.scrim, 0); crit(W.tintAmt, 0.8); tintTo(companionTint(), 0.35); to(W.energy, 0.35); to(W.wFlow, 0.18); to(W.swirl, 0); to(W.irid, 1); to(W.braid, 0); W.vflag = false; to(W.filA, 0); });
  if (W.saved) at(1.00, function(){ setGsat(); tb('gsat'); });
  call('island', {}).then(function(r){ W.island = r || null; }, noop);
  at(1.70, function(){ if (W.saved && SESSION && !SESSION.signedIn) go('SIGN_IN'); else afterSheet(); });
};
function setGsat(){ if (!M) return; txt($('gsK'), Ls('gsat', { sym:M.symbol, word:M.verdict.word.toUpperCase() })); txt($('gsV'), M.thesis.rows[0] ? M.thesis.rows[0].value || '' : ''); gsat.style.setProperty('--c', M.verdict.color); gsat._w = 0; }

/* ---------- O7 sign in after value (Apple only; "Not now" loses nothing) ---------- */
ENTER.SIGN_IN = function(){
  txt($('shT'), Ls('sheet.title')); W.sheetBody = Ls('sheet.body'); W.sheetBodyPrev = ''; W.sheetBodyT = -9; W.appleOff = false; W.signing = false;
  tb('sheet'); tb('pillHide');
};
function appleTap(){
  if (W.state !== 'SIGN_IN' || W.signing || W.appleOff) return;
  W.signing = true; buzz('light', 0.5);
  call('signIn', {}).then(function(r){
    W.signing = false; if (W.state !== 'SIGN_IN') return;
    var s = r && r.status;
    if (s === 'signedIn'){ if (SESSION) SESSION.signedIn = true; go('SHEET_OUT', { local:false }); }
    else if (s !== 'cancelled'){ sheetBody(Ls(s === 'unavailable' ? 'sheet.unavailable' : 'sheet.failed')); W.appleOff = true; }
  }, function(){ W.signing = false; if (W.state === 'SIGN_IN'){ sheetBody(Ls('sheet.failed')); W.appleOff = true; } });
}
function sheetBody(s){ if (W.sheetBody === s) return; W.sheetBodyPrev = W.sheetBody; W.sheetBody = s; W.sheetBodyT = T; }
function notNowTap(){ if (W.state !== 'SIGN_IN') return; buzz('light', 0.4); go('SHEET_OUT', { local:true }); }
ENTER.SHEET_OUT = function(a){
  at(0.10, function(){ tg('sheet'); });
  at(0.60, function(){ gulpK(0.02); });
  if (a.local) at(0.70, function(){ txt($('savedTx'), RMOD.t(LANG, 'thesis.savedLocal')); tb('savedTag'); after(2.0, function(){ tg('savedTag'); }); });
  at(0.90, function(){ tg('pillHide'); });
  at(1.50, afterSheet);
};
function afterSheet(){
  var p = W.planted;
  if (p && (p.stage === 'seed' || p.stage === 'bloomed') && W.island && W.island.available) go('ISLA_PEEK', { stage:p.stage });
  else go('HOME');
}
/* faces that hold something: Desk always, Isla when available, Squad once someone lives in the glass, Theses once saved */
function setMer(){
  var f = ['desk'];
  if (W.island && W.island.available) f.push('isla');
  if (CHOSEN_ART) f.push('squad');
  if (W.saved) f.push('theses');
  W.mer = f;
}

/* ---------- O8 Isla grew a piece (signed in only, after a real thesis.planted) ---------- */
ENTER.ISLA_PEEK = function(a){
  setMer(); W.peekOn = true; tb('islaPeek');
  to(W.theta, W.thBase + 0.7, 'glide');
  at(0.38, function(){ W.islaLine = sayLine({ id:'isla', text:Ls(a.stage === 'bloomed' ? 'isla.bloom' : 'isla.seed'), top:512, watchdog:3 }); });
  at(0.50, function(){ tb('seed'); buzz('light', 0.6); });
  if (a.stage === 'seed') at(0.60, function(){ W.cap2 = Ls('isla.seedSub'); tb('cap2'); });
  at(2.20, function(){ to(W.theta, W.thBase, 'emit'); tg('cap2'); tg('islaPeek'); });
  at(2.70, function(){ W.peekOn = false; tb('mer'); });
  at(3.30, function(){ go('HOME'); });
};

/* ---------- O9 home, then native takes over (finishOnboarding cross-fades to app.html) ---------- */
ENTER.HOME = function(a){
  setMer(); if (!W.tm.mer) at(0.3, function(){ tb('mer'); });
  if (!W.saved && !a.quick) at(0.35, nudge);
  var h = SESSION && fin(SESSION.localHour) ? SESSION.localHour : 20;
  var gk = h >= 5 && h < 12 ? 'home.morning' : (h >= 12 && h < 19 ? 'home.afternoon' : 'home.evening');
  W.title = [Ls(gk), W.saved && M ? Ls('home.saved', { sym:M.symbol }) : Ls('home.none')]; tb('title');
  setPill('mic', '', 96); W.micBreath = true; if (isOn('pillHide')) tg('pillHide'); if (tmB('pillIn') > T) tb('pillIn');
  at(0.80, function(){ setHint(Ls('home.hint')); fire('markHint', { key:'idle' }); });
  at(a.quick ? 0.6 : 2.4, finish);
};
function nudge(){ if (RM) return; to(W.theta, W.thBase + 0.32, 'glide'); after(0.36, function(){ to(W.theta, W.thBase, 'emit'); }); }
function finish(){
  if (W.finishing) return; W.finishing = true;
  call('finishOnboarding', {}).then(function(r){
    W.finishing = false;
    if (r && r.next === 'app'){ go('DONE'); return; }
    var miss = (r && r.missing) || [];
    if (miss.indexOf('companion') >= 0) go('PICK'); else if (miss.indexOf('risk') >= 0) go('RISK', { only:true }); else go('DONE');
  }, function(){ W.finishing = false; if (W.state !== 'DONE') at(2, finish); });
}
ENTER.DONE = function(){ W.micBreath = true; signal('FINISHED'); };

/* ---------- errors: an honest caption, no verdict, no ring, no XP ---------- */
function teardownRead(){
  nodesOff(); W.duel = null; W.conv = null; W.nodeOn = [false, false, false]; W.filCollapse = null;
  to(W.swirl, 0); to(W.irid, 1); to(W.energy, 0.35); to(W.braid, 0); to(W.filA, 0); to(W.flood, 0); to(W.scrim, 0); W.vflag = false;
  ['agA', 'agR', 'agC', 'tethers', 'qwait', 'dock', 'sats', 'verdict', 'ring', 'meta'].forEach(function(k){ if (isOn(k)) tg(k); });
  if (W.readLine){ capGone(W.readLine); if (!W.readLine.done && W.readLine.src === 'voice') fire('stopSpeaking', {}); W.readLine.done = true; }
  W.talking = false; W.compShow = false; to(W.compAmt, 0);
  moveSphere(340, 120); crit(W.tintAmt, 0.8); tintTo(companionTint(), 0.35);
  setPill('mic', '', 96); setHint(''); W.micBreath = true;
}
ENTER.ERROR = function(r){
  if (r && r.code === 'risk_not_accepted'){ if (SESSION) SESSION.riskAccepted = false; teardownRead(); go('RISK'); return; }
  var f = RMOD ? RMOD.failure(r, LANG) : { kind:'error', caption:null, chips:[] };
  teardownRead(); buzz('warning', 0.4);
  var chips = (f.chips || []).map(function(c){ return { label:c.label, action:c.action }; });
  if (f.kind !== 'confirm') chips = chips.slice(0, 2).concat([{ label:Ls('chip.again'), action:{ again:true } }]);
  at(0.40, function(){ if (f.caption) W.errLine = sayLine({ id:'err', text:f.caption, silent:true, noSplit:true, hold:true, top:512 }); if (f.sub){ W.cap2 = f.sub; tb('cap2'); } });
  at(0.70, function(){ setChips(chips.slice(0, 3)); signal('ERROR_READY'); });
};
function chipTap(i){
  var c = W.chips[i]; if (!c || !isOn('chips')) return;
  W.pr['chip' + i] = [T, T + 0.1]; buzz('light', 0.5);
  var a = c.action || {};
  if (a.ask){ commitQuestion(a.ask, 'chip'); return; }
  if (a.token){ if (W.errLine){ capGone(W.errLine); W.errLine = null; } tg('chips'); tg('cap2'); tb('dock'); startAsk({ token:a.token }); return; }
  if (a.retype){ if (W.errLine){ capGone(W.errLine); W.errLine = null; } tg('cap2'); go('TYPING'); return; }
  if (a.again){ go('ASK_TEACH', { again:true }); }
}
function closeTap(){
  var s = W.state;
  if (s === 'RESOLVING' || s === 'THINK_WAIT'){ fire('cancel', {}); return; }
  if (s === 'THINK_RESOLVE' || s === 'TALK_EVIDENCE' || s === 'TALK_CHART' || s === 'VERDICT' || s === 'HANDBACK' || s === 'PULLING' || s === 'CARDS'){ go('RETURNING', { abandon:true }); }
}
function closeActive(){ var s = W.state; return isOn('dock') && (s === 'RESOLVING' || s === 'THINK_WAIT' || s === 'THINK_RESOLVE' || s === 'TALK_EVIDENCE' || s === 'TALK_CHART' || s === 'VERDICT' || s === 'HANDBACK' || s === 'CARDS'); }

/* ---------- bridge events ---------- */
function wireEvents(){
  if (!BR) return;
  BR.on('session.changed', function(s){ applySession(s); });
  BR.on('app.state', function(p){ W.bg = p && p.state === 'background'; if (W.bg && W.state === 'LISTENING'){ endListenVisual(); go('ASK_TEACH', { quiet:true }); } });
  BR.on('ask.stage', function(p){ if (p && p.stage === 'accepted' && W.state === 'RESOLVING') go('THINK_WAIT'); });
  BR.on('speech.level', function(p){ W.micLevel = p && fin(p.level) ? p.level : 0; W.micLevelT = T; });
  BR.on('speech.partial', function(p){ if (W.state === 'LISTENING' && p) updateWords(p.text); });
  BR.on('speech.final', function(p){ onSpeechFinal(p && p.text); });
  BR.on('speech.error', function(p){ if (W.state === 'LISTENING'){ endListenVisual(); go('ASK_TEACH', { quiet:true, hint:Ls('hint.sttError') }); } });
  ['voice.start', 'voice.level', 'voice.progress', 'voice.word', 'voice.end'].forEach(function(n){
    BR.on(n, function(p){ if (p && typeof p.id === 'string' && p.id.indexOf('preview-') === 0){ if (n === 'voice.level'){ W.pvLevel = fin(p.level) ? p.level : 0; W.pvLevelT = T; } return; } onVoice(n, p); });
  });
  BR.on('thesis.planted', function(p){ if (p) W.planted = p; });
  BR.on('native.sheet', function(p){ W.sheetOpen = !!(p && p.state === 'open'); });
}
