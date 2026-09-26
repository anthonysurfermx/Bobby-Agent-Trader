/* =====================================================================
   11. The state machine (ARCHITECTURE.md §3.2). Each prototype beat is a
   cue inside a transition; entering a state bumps GEN, which cancels the
   previous state's pending cues, so every transition is interruptible.
   ===================================================================== */
var ST = { name: 'BOOT', t0: 0, prev: null, data: null };
var LOG = [], STATES = {}, HINTED = {}, PREV = { on: false, imp: false }, VERD = VC.wait;
var FACES = [{ id: 'desk', tint: ME.tint }], SENT0 = [], VIDX = 0, SHEET = false;
function noop(){}
function go(name, data){
  var prev = ST.name, X = STATES[prev];
  GEN++;
  if (X && X.exit){ try { X.exit(name); } catch (e) { logErr('exit ' + prev, e); } }
  ST = { name: name, t0: clk, prev: prev, data: data || {} };
  LOG.push([Math.round(clk * 1000) / 1000, name]); if (LOG.length > 400) LOG.shift();
  var N = STATES[name];
  try { if (N && N.enter) N.enter(prev, ST.data); } catch (e) { logErr('enter ' + name, e); }
  ariaState(); dirty = true;
}
function inState(){ return clk - ST.t0; }
function fsmEvent(name, p){ var s = STATES[ST.name]; if (s && s.on){ try { s.on(name, p); } catch (e) { logErr('on ' + name, e); } } }
function markHint(key){ bcall('markHint', { key: key }).then(function(r){ if (SES && r && fin(r.count)){ SES.hints = SES.hints || {}; SES.hints[key] = r.count; } }).catch(noop); }
function openNative(route){ bcall('openNative', { route: route }).catch(noop); }
/* the header avatar is the account's door: sign in, sign out, delete the account, privacy (App Review 5.1.1(v)) */
function avatarG(){ return tapG(function(){ tick('light'); openNative('account'); }, A.avPress); }

/* ---------- shared choreography ---------- */
function chromeUp(){
  if (A.dim.t < 1) A.dim.tween(1, 0.24, E.fade);
  if (A.hdr.t < 1) A.hdr.tween(1, 0.24, E.fade);
  if (A.pillO.t < 1){ A.pillY.to(0, 'soft'); A.pillO.tween(1, 0.3, E.fade); }
}
function meriIn(){
  var n = FACES.length > 1 ? FACES.length : 0;
  A.meri.forEach(function(m, i){ if (i < n){ m.p.to(1, 'emit', null, i * 0.04); m.o.tween(1, 0.2, E.fade, i * 0.04); } else { m.p.set(0); m.o.set(0); } });
}
function meriOut(){ var n = A.meri.length; A.meri.forEach(function(m, i){ var d = (n - 1 - i) * 0.04; m.p.tween(0, 0.24, E.inhale, d); m.o.tween(0, 0.24, function(u){ return sstep(0.5, 1, u); }, d); }); }
function dockIn(){
  A.wmY.tween(-8, 0.16, E.fade); A.wmO.tween(0, 0.16, E.fade);
  A.qT0 = clk + 0.10; A.dockO.tween(1, 0.16, E.fade, 0.1); A.closeO.tween(1, 0.24, E.fade, 0.1);
}
function dockOut(){
  A.dockO.tween(0, 0.16, E.fade); A.dockAO.tween(0, 0.16, E.fade); A.closeO.tween(0, 0.16, E.fade);
  if (A.wmO.t < 1){ A.wmY.set(8); A.wmO.tween(1, 0.16, E.fade, 0.04); A.wmY.to(0, 'snap', null, 0.04); }
  A.qT0 = 1e9;
}
function setGreeting(){
  var h = SES && fin(SES.localHour) ? SES.localHour : new Date().getHours();
  var k = (h >= 5 && h < 12) ? 'morning' : (h >= 12 && h < (LANG === 'es' ? 20 : 18)) ? 'afternoon' : 'evening';
  var sub = LEDGER.length ? tt('greet.saved', { symbol: LEDGER[0].symbol }) : tt(k === 'evening' ? 'greet.sub.night' : 'greet.sub.day');
  lineSet(A.greet, tt('greet.' + k), sub, el.greetT, el.greetS);
}
function idleHint(){
  var n = SES && SES.hints ? (SES.hints.idle || 0) : 0;
  if (n < 3){ hint(tt(idleMode() === 'mic' ? 'hint.idle' : 'hint.idleType')); if (!HINTED.idle){ HINTED.idle = true; markHint('idle'); } }
  else hint('');
}
function agentNames(){ ['alpha', 'red', 'cio'].forEach(function(k, i){ el.agNm[i].textContent = RMOD.t(LANG, 'agent.' + k); }); el.agSt[0].textContent = ''; el.agSt[1].textContent = ''; el.cioSw.textContent = ''; vfRoll.set('', true); A.cioSwO.set(1); A.vfO.set(0); A.ag.forEach(function(a){ a.stW = []; a.stT = 1e9; }); }
function agentIn(i){
  var a = A.ag[i]; a.tIn = clk; a.tOut = 1e9; a.draw.set(0); a.draw.tween(1, 0.28, E.data);
  var dir = i === 0 ? [8, 6] : (i === 1 ? [-8, 6] : [0, -8]);
  a.dx.set(dir[0]); a.dy.set(dir[1]); a.dx.to(0, 'emit', null, 0.2); a.dy.to(0, 'emit', null, 0.2); a.o.tween(1, 0.24, E.fade, 0.2);
}
function agentOut(i){
  var a = A.ag[i]; if (a.o.t <= 0 && a.o.x < 0.01) return; a.tOut = clk;
  var dir = i === 0 ? [10, 6] : (i === 1 ? [-10, 6] : [0, -10]);
  a.dx.tween(dir[0], 0.38, E.inhale); a.dy.tween(dir[1], 0.38, E.inhale); a.o.tween(0, 0.38, function(u){ return sstep(0.45, 1, u); });
  a.draw.tween(0, 0.32, E.inhale);
}
/* the 2-line clamp with an ellipsis, measured once (the stance words are real text of unknown length) */
function clamp2(host, spans){
  if (!spans.length) return spans;
  var top0 = spans[0].offsetTop, lim = 2 * 21 - 2, cut = -1, i;
  for (i = 0; i < spans.length; i++) if (spans[i].offsetTop - top0 >= lim){ cut = i; break; }
  if (cut < 0) return spans;
  function drop(){ var s = spans.pop(), pv = s.previousSibling; host.removeChild(s); if (pv && pv.nodeType === 3) host.removeChild(pv); }
  while (spans.length > cut) drop();
  var last = spans[spans.length - 1]; last.textContent = last.textContent.replace(/[,;:.]+$/, '') + '…';
  while (spans.length > 1 && last.offsetTop - top0 >= lim){ drop(); last = spans[spans.length - 1]; last.textContent = last.textContent.replace(/[,;:.…]+$/, '') + '…'; }
  return spans;
}
function stancesSet(m){
  var T0 = [0, 0.55, 1.10];
  for (var i = 0; i < 3; i++){
    var host = i < 2 ? el.agSt[i] : el.cioSw, spans = clamp2(host, words(host, m.agents[i].stance));
    A.ag[i].stW = spans; A.ag[i].stT = clk + T0[i];
  }
  A.cioSwO.set(1); A.vfO.set(0); vfRoll.set('', true);
}
function dimple(){ A.bead.o.set(0); A.bead.fly0 = 1e9; if (!RM){ DU.dimT = clk; at(0.09, function(){ gulp(0.03); DU.ripSend = clk; }); } tick('soft'); }
function gather(){
  var ws = A.tx.words.filter(function(w){ return w.hide.t > 0.5; }), n = ws.length;
  if (!n){ A.bead.x0 = 195; A.bead.y0 = 560; A.bead.s.set(0); A.bead.s.to(1, 'emit'); A.bead.o.tween(1, 0.12, E.fade); return; }
  var cx = 0, cy = 0;
  ws.forEach(function(w){ w.cx = 20 + w.nl + w.nw / 2 + w.dx.x; w.cy = 528 + A.tx.lift.x + w.nt + 15 + w.dy.x; cx += w.cx; cy += w.cy; });
  cx /= n; cy /= n; A.bead.x0 = cx; A.bead.y0 = cy;
  ws.map(function(w){ return { w: w, d: Math.hypot(w.cx - cx, (w.cy - cy) * 3) }; }).sort(function(a, b){ return b.d - a.d; })
    .forEach(function(o, k){ o.w.gx = cx - o.w.cx; o.w.gy = cy - o.w.cy; o.w.g.tween(1, 0.24, E.inhale, k * 0.022); });
  A.bead.s.set(0); A.bead.s.to(1, 'emit', null, 0.12); A.bead.o.tween(1, 0.12, E.fade, 0.12);
}
function satEmit(i, delay){ var s = A.sat[i]; s.tE = clk + delay; s.p.set(0); s.p.to(1, 'emit', RM ? 0 : 0.8, delay); el.satOdo[i].t0 = clk + delay + 0.40; }
function satRetract(i, delay){ var s = A.sat[i]; if (s.p.t <= 0 && s.p.x < 0.01) return; s.p.tween(0, 0.38, E.inhale, delay); at(delay + 0.3, function(){ gulp(0.01); }); }
function impact1(){ DU.on = false; DU.conv = false; if (!RM){ shock(C.pearl, 0.35, 0.18, 1.05); exposure(0.35); rimFlash(0.5); } U.braid.to(1.1); tick('medium'); }
function impact2(){
  tick('rigid');
  if (!RM){ shock(VERD.c, 0.30, 0.16, 1.05); exposure(0.22); rimFlash(0.4); }
  U.flood.cfg = UT(0.48); U.flood.to(1.1); U.scrim.to(0.9); U.energy.to(0.3); U.wflow.to(0.12);
}
function dissolveThink(){
  if (DU.on || A.ag.some(function(a){ return a.o.t > 0; })){ [0, 1, 2].forEach(function(i){ agentOut(i); }); }
  DU.on = false; DU.conv = false; U.nodesO.to(0); U.swirl.to(0); U.radK.to(1); U.irid.to(1); U.filA.to(0); U.braid.to(0); U.energy.to(0.35); U.wflow.to(0.18);
}
/* everything a read put on screen goes back where it came from (cards before the sphere moves) */
function clearRead(){
  chipsHide();
  var hadCards = A.cardsOn || A.rev.some(function(v){ return v.x > 0.01; });
  if (hadCards){ [2, 0, 1].forEach(function(i, k){ A.rev[i].to(0, 'ret', null, 0.15 + k * 0.04); }); }
  A.cardsOn = false; A.pullOn = false; A.commit = false; A.viewOnly = false; A.tp.on = false;
  dockOut();
  if (A.vCond.t > 0 || A.vCond.x > 0.01){ A.vCond.tween(0, 0.28, E.lin, 0.35); A.ringFill.tween(0, 0.35, E.data, 0.35); A.convO.tween(0, 0.2, E.fade, 0.35); A.ringO.tween(0, 0.12, E.fade, 0.65); }
  if (A.chartT0 < 1e8 && A.chartExit > 1e8) A.chartExit = clk;
  capsOff(); A.metaO.tween(0, 0.17, E.fade);
  A.sat.forEach(function(s, i){ satRetract(i, 0); }); A.orbO.tween(0, 0.24, E.fade); U.compOn.to(0);
  dissolveThink();
  if (A.note.o.t > 0) noteOut();
  if (VOICE.started && !VOICE.ended) bcall('stopSpeaking').catch(noop);
  VOICE.id = null; K.on = false; PREV.on = false; PREV.imp = false;
  hint('');
  return hadCards;
}
/* the glass itself goes home: flood recedes rim→centre, scrim off, presenting springs released (the tint is separate) */
function glassHome(){
  ambientCanon(false); U.flood.cfg = UT(0.70); U.flood.to(0); U.scrim.to(0); U.braid.to(0); U.filA.to(0); U.swirl.to(0);
  U.energy.to(0.35); U.wflow.to(0.18); U.irid.to(1); U.breathK.to(1); A.ringOff.to(14, 'soft'); A.pctPos.to(0, 'soft'); S.pull.to(0, BODY.gulp);
}
function readShowing(){ return A.cardsOn || A.vCond.t > 0 || U.flood.t > 0 || A.chartT0 < 1e8 || capCur >= 0 || A.chips.length > 0; }
function routeReply(r){
  var s = r.reply.status;
  if (s === 'ok'){ go('THINK_WAIT'); return; }
  if (s === 'confirm'){ go('CONFIRM_ASSET', { f: RMOD.failure(r.reply, LANG) }); return; }
  if (s === 'unknown_asset'){ go('UNKNOWN_ASSET', { f: RMOD.failure(r.reply, LANG) }); return; }
  if (s === 'cancelled'){ go('RETURNING', { cancelled: true }); return; }
  var f = RMOD.failure(r.reply, LANG);
  /* consent is missing (a stale or reset notice): not a failed read — the way to the risk beat */
  if (f.kind === 'risk'){ if (SES) SES.riskAccepted = false; go('RISK_GATE', { f: f }); return; }
  go('ERROR', { f: f });
}
function cancelRead(){
  var r = READ; if (!r || r.reply || r.cancelling) return;
  r.cancelling = true; tick('light');
  bcall('cancel').then(function(res){ if (READ === r && !r.reply && !(res && res.cancelled)){ r.reply = { v: 1, status: 'cancelled' }; fsmEvent('reply', r); } }).catch(noop);
}
/* the ghost satellite on Desk: the thesis saved in THIS session */
function ghostFill(){
  if (!SAVED || !SAVED.thesis){ A.satG.on = false; return; }
  var v = RMOD.thesisView(SAVED.thesis, LANG, { signedIn: !!(SES && SES.signedIn) });
  fillSatNode(el.satG, el.satG.querySelector('.k'), el.satG.querySelector('.v'), null, v.pill, v.price || '', null, null, v.verdict.key === 'review' ? 'alpha' : 'cio', false);
  A.satG.hw = measureSat(el.satG); A.satG.on = true;
}
function ghostIn(){ ghostFill(); if (!A.satG.on) return; A.satG.p.set(0); A.satG.p.to(1, 'emit'); A.satG.o.tween(0.7, 0.2, E.fade); }
function buildFaces(){
  var f = [{ id: 'desk', tint: ME.tint }];
  if (ISLAND && ISLAND.available) f.push({ id: 'isla', tint: C.isla });
  if (ME.id) f.push({ id: 'squad', tint: ME.tint });
  if (LEDGER.length) f.push({ id: 'theses', tint: VC[LEDGER[0].verdict === 'review' ? 'review' : 'wait'].c });
  FACES = f;
  var names = { desk: tt('face.desk'), isla: tt('face.isla'), squad: tt('face.squad'), theses: tt('face.theses') };
  att(el.meriHit, 'aria-label', tt('aria.faceDots', { list: f.map(function(x){ return names[x.id]; }).join(', ') }));
  if (ISLAND && ISLAND.available && ISLAND.growth) buildIslaRing(fin(ISLAND.growth.threshold) ? ISLAND.growth.threshold : ISLAND.size);
  for (var j = 0; j < 2; j++){
    var th = LEDGER[j], node = el.satT[j];
    if (!th){ A.satT[j].on = false; continue; }
    var v = RMOD.thesisView(th, LANG, {});
    fillSatNode(node, node.querySelector('.k'), node.querySelector('.v'), null, th.symbol, v.price || '', null, v.verdict.word, v.verdict.key === 'review' ? 'alpha' : 'cio', false);
    A.satT[j].hw = measureSat(node); A.satT[j].on = true; A.satT[j].th = th;
  }
}
function faceIdx(id){ for (var i = 0; i < FACES.length; i++) if (FACES[i].id === id) return i; return -1; }
function faceStep(){ return TAU / Math.max(1, FACES.length); }
function faceAt(th){ var n = FACES.length; return ((Math.round(th / faceStep()) % n) + n) % n; }

/* ---------- BOOT: black until session() ---------- */
STATES.BOOT = {};

/* ---------- WAKE: B0 (0.00–0.90) ---------- */
STATES.WAKE = {
  enter: function(){
    A.dim.tween(1, 0.3, E.fade);
    S.r.to(120, BODY.gaze); S.cy.to(340, BODY.gaze); U.glow.to(1, BODY.gaze); U.energy.to(0.35); U.irid.to(1); U.swirl.to(0); U.wflow.to(0.18);
    tintHome(); setGreeting(); pillMode(idleMode());
    cue(0.20, function(){ A.hdr.tween(1, 0.24, E.fade); });
    cue(0.30, function(){ greetIn(); });
    cue(0.55, function(){ meriIn(); });
    cue(0.70, function(){ A.pillY.to(0, 'soft'); A.pillO.tween(1, 0.3, E.fade); });
    cue(0.85, function(){ S.lean.to(4, BODY.gaze); S.lean.to(0, BODY.gaze, null, 0.26); });
    cue(0.90, function(){ go('IDLE'); });
  },
  down: function(h, p){ if (h === 'pill' || h === 'surface') return STATES.IDLE.down(h, p); return null; }
};

/* ---------- IDLE: B1 breath; the pill glows in antiphase ---------- */
STATES.IDLE = {
  enter: function(prev, d){
    if (A.th.x !== 0 && !A.th.moving()) A.th.set(0);
    U.faceOn.to(0); U.presence.to(0);
    pillMode(idleMode());
    if (d && d.hint){ hint(tt(d.hint)); } else idleHint();
    if (d && d.restoreGreet){ if (!lineShown(A.greet)){ setGreeting(); greetIn(); } meriIn(); }
  },
  tick: function(){ if (A.th.x !== 0 && !A.th.moving() && Math.abs(A.th.x - Math.round(A.th.x / TAU) * TAU) < 1e-3) A.th.set(0); },
  down: function(h, p){
    if (h === 'pill') return pillDown(p);
    if (h === 'avatar') return avatarG();
    if (h === 'wm' && DEV_BUILD) return wordmarkPress();
    if (h === 'satG') return tapG(function(){ if (SAVED && SAVED.thesis) go('THESIS_VIEW', { thesis: SAVED.thesis, back: 'IDLE' }); });
    if (h === 'meri') return tapG(function(){ if (FACES.length > 1){ go('FACES'); faceSwing(1, 0); } });
    if (h === 'surface') return faceDragG();
    return null;
  }
};
function wordmarkPress(){
  var id = ++LP_SEQ;
  at(0.8, function(){ if (LP_SEQ === id && PTR.g && !PTR.moved){ tick('medium'); bcall('openClassic').catch(noop); } });
  return { move: noop, up: function(){ LP_SEQ++; }, cancel: function(){ LP_SEQ++; } };
}
var LP_SEQ = 0;

/* the pill: press → listen (granted), pre-permission card (undetermined), or typing (denied / unavailable) */
function pillDown(p, fromRead){
  A.press.to(0.94, 'snap'); tick('light');
  var ms = SES && SES.mic ? SES.mic.state : 'undetermined', t0 = nowT();
  if (ms === 'granted'){
    go('LISTENING', { fromRead: !!fromRead });
    return { move: noop, up: function(){ STATES.LISTENING.release(nowT() - t0 < 0.25, false); }, cancel: function(){ STATES.LISTENING.release(false, true); } };
  }
  if (ms === 'undetermined'){
    if (fromRead) go('RETURNING');
    else go('PRE_PERMISSION');
    return { move: noop, up: function(){ A.press.to(1, 'emit'); }, cancel: function(){ A.press.to(1, 'emit'); } };
  }
  return { move: noop, up: function(){ A.press.to(1, 'emit'); openTyping({ fromRead: !!fromRead }); }, cancel: function(){ A.press.to(1, 'emit'); } };
}

/* ---------- PRE_PERMISSION: the onboarding O3 card, blooming from the bottom rim ---------- */
STATES.PRE_PERMISSION = {
  enter: function(){
    this.asked = false; chromeUp();
    if (lineShown(A.greet)) greetOut(); meriOut(); hint('');
    el.permH.textContent = tt('perm.title'); el.permP.textContent = tt('perm.body'); el.permBtn.textContent = tt('perm.cta');
    A.perm.b = clk + 0.10; A.perm.g = 1e9; A.perm.p.set(0); A.perm.p.to(1, 'emit', null, 0.10); A.perm.press.set(1);
  },
  exit: function(){ if (A.perm.g > 1e8){ A.perm.g = clk; A.perm.p.to(0, 'ret'); } },
  down: function(h){
    if (h === 'perm') return tapG(function(){ STATES.PRE_PERMISSION.cont(); }, A.perm.press);
    if (h === 'pill') return tapG(noop, A.press);
    return tapG(function(){ go('IDLE', { restoreGreet: true }); });
  },
  cont: function(){
    if (this.asked) return; this.asked = true; tick('light');
    A.perm.g = clk; A.perm.p.to(0, 'ret');
    bcall('speech.requestPermission').then(function(m){
      if (ST.name !== 'PRE_PERMISSION') return;
      if (m && m.state) SES.mic = m;
      if (m && m.state === 'granted') go('IDLE', { hint: 'hint.hold', restoreGreet: true });
      else { go('IDLE', { restoreGreet: true }); openTyping({}); }
    }, function(){ if (ST.name === 'PRE_PERMISSION') go('IDLE', { restoreGreet: true }); });
  }
};

/* ---------- LISTENING: B2 (3.00–5.90). The mic is live only between speech.start and speech.stop ---------- */
STATES.LISTENING = {
  enter: function(prev, d){
    this.released = false; this.finalWait = 0; this.live = false;
    chromeUp();
    if (d.fromRead || readShowing()){ clearRead(); glassHome(); moveSphere(340, 120); tintHome(); A.satG.o.tween(0, 0.2, E.fade); }
    if (A.note.o.t > 0) noteOut();
    txReset(); SPEECH.lvl = 0; SPEECH.at = -9;
    U.faceOn.to(0);
    var self = this;
    bcall('speech.start').then(function(r){
      if (ST.name !== 'LISTENING' || self.released && !self.live){ if (r && r.status === 'listening') bcall('speech.stop', { cancel: true }).catch(noop); return; }
      self.onStart(r && r.status);
    }, function(){ if (ST.name === 'LISTENING') self.onStart('failed'); });
    cue(0.09, function(){ if (self.released) return; A.pillW.to(236, 'pill'); pillMode('bars'); A.barsT0 = clk; A.barsOutT0 = 1e9; A.glow.tween(0.8, 0.24, E.fade); A.goo.tween(1, 0.3, E.fade); });
    cue(0.10, function(){ if (self.released) return; if (lineShown(A.greet)) greetOut(); meriOut(); A.satG.o.tween(0, 0.2, E.fade); hint(tt('hint.release')); });
    cue(0.15, function(){ if (self.released) return; S.r.to(132, 'soft'); S.lean.to(6, BODY.gaze); S.bulge.to(0.02, BODY.gaze); U.listenIr.to(1); });
  },
  onStart: function(status){
    if (status === 'listening'){ this.live = true; if (this.released && !this.finalWait) bcall('speech.stop', { cancel: true }).catch(noop); return; }
    this.collapse();
    if (status === 'needs_permission'){ SES.mic.state = 'undetermined'; go('PRE_PERMISSION'); return; }
    if (status === 'denied' || status === 'unavailable' || status === 'restricted'){ SES.mic.state = status; go('IDLE', { hint: 'hint.micOff', restoreGreet: true }); return; }
    go('IDLE', { restoreGreet: true });
  },
  collapse: function(){
    A.press.to(1, 'emit'); A.barsOutT0 = clk; A.pillW.to(96, 'pill'); A.glow.tween(0.15, 0.24, E.fade); A.goo.tween(0, 0.2, E.fade); hint('');
    at(0.16, function(){ if (ST.name === 'LISTENING' || ST.name === 'SENDING' || ST.name === 'IDLE') pillMode(ST.name === 'SENDING' ? 'mic' : idleMode()); });
    S.lean.to(0, BODY.gaze); S.bulge.to(0, BODY.gaze); U.listenIr.to(0); S.r.to(120, 'soft');
  },
  release: function(isTap, cancelled){
    if (ST.name !== 'LISTENING' || this.released) return;
    this.released = true;
    if (isTap || cancelled){
      if (this.live) bcall('speech.stop', { cancel: true }).catch(noop);
      this.collapse(); txReset();
      if (isTap) openTyping({}); else go('IDLE', { restoreGreet: true });
      return;
    }
    this.collapse();
    this.finalWait = clk;
    if (this.live) bcall('speech.stop', {}).then(function(r){ if (r && r.status === 'idle' && ST.name === 'LISTENING') STATES.LISTENING.gotFinal(txText()); }).catch(noop);
    else this.gotFinal('');
  },
  gotFinal: function(text){
    if (ST.name !== 'LISTENING') return;
    text = String(text || '').replace(/\s+/g, ' ').trim();
    this.finalWait = 0;
    if (!text){ txReset(); go('IDLE', { hint: 'hint.empty', restoreGreet: true }); return; }
    txSet(text, true);
    go('SENDING', { question: text, origin: 'speech' });
  },
  on: function(name, p){
    if (name === 'speech.partial'){ if (!this.released || this.finalWait) txSet(p && p.text, false); }
    else if (name === 'speech.final'){ if (this.released) this.gotFinal(p && p.text); }
    else if (name === 'speech.error'){ this.released = true; this.collapse(); txReset(); go('IDLE', { hint: 'hint.micStopped', restoreGreet: true }); }
    else if (name === 'speech.state' && p && p.state === 'stopped' && !this.released){ this.released = true; this.collapse(); this.finalWait = clk; }
    else if (name === 'app.state' && p && p.state === 'background' && !this.released){ this.released = true; this.collapse(); txReset(); go('IDLE', { restoreGreet: true }); }
  },
  tick: function(){ if (this.finalWait && clk - this.finalWait > 2.0) this.gotFinal(txText()); },
  down: function(h){ return null; }
};

/* ---------- TYPING: a real textarea rises from the pill ---------- */
function openTyping(d){ go('TYPING', d || {}); focusTa(); }
STATES.TYPING = {
  enter: function(prev, d){
    this.d = d || {};
    chromeUp();
    if (lineShown(A.greet)) greetOut(); meriOut(); hint(''); A.satG.o.tween(0, 0.2, E.fade);
    if (A.note.o.t > 0) noteOut();
    if (!this.d.fromRead) chipsHide();
    A.type.p.set(0); A.type.p.to(1, 'emit'); A.type.o.tween(1, 0.2, E.fade);
    A.pillO.tween(0, 0.16, E.fade);
    el.ta.value = ''; el.ta.placeholder = tt('type.placeholder'); att(el.taSend, 'aria-label', tt('type.send')); taAutosize();
    showTypeBox(true);
  },
  exit: function(){ A.type.p.to(0, 'ret'); A.type.o.tween(0, 0.16, E.fade); A.pillO.tween(1, 0.2, E.fade); try { el.ta.blur(); } catch (e) {} at(0.2, function(){ if (ST.name !== 'TYPING') showTypeBox(false); }); },
  send: function(){
    var q = el.ta.value.replace(/\s+/g, ' ').trim();
    if (!q){ this.cancel(); return; }
    var params = this.d.followUpOf ? { followUpOf: this.d.followUpOf, question: q } : { question: q };
    go('SENDING', { question: q, params: params, origin: 'type', fromRead: !!this.d.fromRead });
  },
  cancel: function(){ if (ST.name !== 'TYPING') return; if (this.d.fromRead) go('RETURNING'); else go('IDLE', { restoreGreet: true }); },
  down: function(h){ return tapG(function(){ if (!el.ta.value.trim()) STATES.TYPING.cancel(); else try { el.ta.blur(); } catch (e) {} }); }
};

/* ---------- SENDING: B2 5.90–6.80: gather, bead, dimple, gulp, the header docks the real question ---------- */
STATES.SENDING = {
  enter: function(prev, d){
    this.d = d; chromeUp(); hint('');
    var fromRead = !!d.fromRead || readShowing();
    if (fromRead){ clearRead(); cue(0.35, function(){ glassHome(); ambientCanon(true); moveSphere(340, 120, true); }); }
    else chipsHide();
    if (A.note.o.t > 0) noteOut();
    var q = d.question || (READ && READ.question) || '';
    var params = d.params || (d.token ? { token: d.token } : { question: q });
    startRead(params, q);
    A.qText = q; A.aText = ''; el.dockA.textContent = ''; A.dockAO.set(0);
    var pre = 0;
    if (d.origin === 'type'){ txReset(); txSet(q, true, 0.045); pre = Math.min(0.6, A.tx.words.length * 0.045) + 0.35; }
    if (d.origin === 'chip'){ txReset(); A.bead.x0 = d.cx || 195; A.bead.y0 = d.cy || 660; }
    if (fromRead) pre = Math.max(pre, 0.45);
    cue(pre + 0.06, function(){ if (d.origin === 'chip'){ A.bead.s.set(0); A.bead.s.to(1, 'emit'); A.bead.o.tween(1, 0.12, E.fade); } else gather(); });
    cue(pre + 0.30, function(){ A.bead.fly0 = clk; });
    cue(pre + 0.66, function(){ dimple(); });
    cue(pre + 0.70, function(){ dockIn(); tintDuck(); ambientCanon(true); });
    cue(pre + 0.80, function(){ if (READ && READ.accepted) pillMode('think'); });
    cue(pre + 0.90, function(){ STATES.SENDING.next(); });
  },
  next: function(){ var r = READ; if (!r) return go('RETURNING'); if (r.reply && r.reply.status !== 'ok') return routeReply(r); if (r.accepted || r.reply) go('THINK_WAIT'); else go('RESOLVING'); },
  down: function(h){ if (h === 'close') return tapG(function(){ cancelRead(); }); return null; }
};

/* ---------- RESOLVING: asset search in flight ---------- */
STATES.RESOLVING = {
  enter: function(){ cue(1.2, function(){ pillMode('think'); }); },
  on: function(name, r){ if (name === 'accepted' || (name === 'reply' && r.reply.status === 'ok')) go('THINK_WAIT'); else if (name === 'reply') routeReply(r); },
  down: function(h){ if (h === 'close' || h === 'pill') return tapG(function(){ cancelRead(); }, h === 'pill' ? A.press : null); return null; }
};

/* ---------- THINK_WAIT: B3 6.70–10.40 as a LOOP, for as long as the desk takes ---------- */
function duelOmega(e){ if (e < 1.8) return 1.6; if (e < 2.6) return lerp(1.6, 2.6, (e - 1.8) / 0.8); return 2.6 * (1 + 0.12 * Math.sin(TAU * (e - 2.6) / (2 * U.bper.x))); }
var PHI0 = PI - (function(){ var s = 0; for (var t = 0.25; t < 2.1; t += 1 / 240) s += (t < 1.8 ? 1.6 : lerp(1.6, 2.6, (t - 1.8) / 0.8)) / 240; return s; })();
STATES.THINK_WAIT = {
  enter: function(){
    this.hk = '';
    moveSphere(380, 124);
    U.flood.cfg = UT(0.7); U.flood.to(0); U.scrim.to(0); U.braid.to(0); U.filA.to(0); A.chartT0 = 1e9;
    U.swirl.to(1); U.irid.to(0.35); U.energy.to(0.45); U.wflow.to(0.5); U.nodesO.to(1);
    DU.on = true; DU.conv = false; DU.t0 = clk; DU.phi = PHI0 - 0.25 * 1.6; DU.k = Math.floor(DU.phi / PI); DU.cross = 0; U.radK.set(1);
    pillMode('think'); hint(tt('hint.debating')); agentNames(); tintDuck(); ambientCanon(true);
    cue(0.25, function(){ agentIn(0); });
    cue(0.80, function(){ agentIn(1); });
    cue(1.40, function(){ agentIn(2); U.energy.to(0.52); U.wflow.to(0.95); });
    cue(2.60, function(){ U.energy.to(0.6); });
  },
  tick: function(){
    var e = inState(), key;
    if (e >= 75) key = tt('hint.long'); else if (e >= 30) key = tt('hint.still'); else if (e >= 8) key = tt('hint.debatingS', { s: Math.floor(e) }); else key = tt('hint.debating');
    if (key !== this.hk){ hintRoll.set(key, e >= 9 && e < 30); this.hk = key; }
    var r = READ;
    if (r && r.reply){
      if (r.reply.status === 'ok'){ if (e >= (READS_DONE === 0 ? 4.5 : 1.5)) go('THINK_RESOLVE'); }
      else routeReply(r);
    }
  },
  down: function(h){ if (h === 'close' || h === 'pill') return tapG(function(){ cancelRead(); }, h === 'pill' ? A.press : null); return null; }
};

/* ---------- THINK_RESOLVE: real stances, hold, then B3 10.40–12.60 (converge, IMPACT 1, hush, filament) ---------- */
STATES.THINK_RESOLVE = {
  enter: function(){
    var m = READ.model; READS_DONE++;
    this.done = false; hintRoll.set(tt('hint.debating'), true);
    prepRead(m);
    stancesSet(m);
    var B = 1.10 + A.ag[2].stW.length * 0.045 + 0.26 + 1.6;
    cue(B, function(){ vfRoll.set(tt('think.forming')); A.cioSwO.tween(0, 0.16, E.fade); A.vfO.tween(1, 0.2, E.fade, 0.04); U.radK.tween(0, 1.2, E.inhale); DU.conv = true; U.energy.to(0.9); });
    cue(B + 0.20, function(){ A.ag.forEach(function(a, i){ a.draw.tween(0, 0.32, E.inhale, i * 0.06); }); });
    cue(B + 0.30, function(){ agentOut(0); });
    cue(B + 0.36, function(){ agentOut(1); });
    cue(B + 0.42, function(){ agentOut(2); });
    cue(B + 1.20, function(){ impact1(); });
    cue(B + 1.68, function(){ U.wflow.to(0.04); U.energy.to(0.45); });
    cue(B + 1.86, function(){ U.filA.to(0.7); U.filR.set(0.8); U.wflow.to(0.25); U.energy.to(0.38); U.swirl.to(0.1); hint(''); });
    cue(B + 2.20, function(){ STATES.THINK_RESOLVE.done = true; });
    /* the TTS fetch overlaps the tail of the choreography: speak() is issued one measured voice latency before the
       filament settles, so the first spoken word lands with the first caption (not seconds ahead of it) */
    cue(Math.max(0.05, B + 2.20 - VOICE.lat), function(){ speakRead(); });
  },
  tick: function(){
    if (!this.done) return;
    if (VOICE.started || VOICE.silent) go('TALK_EVIDENCE');
    else if (clk - VOICE.reqT > 6){ bcall('stopSpeaking').catch(noop); goSilent(); go('TALK_EVIDENCE'); }
  },
  down: function(h){ if (h === 'close') return tapG(function(){ go('RETURNING'); }); return null; }
};
function prepRead(m){
  var res = READ.reply;
  VERD = VC[m.verdict.key] || VC.wait;
  buildPages(m.spoken); capsReset();
  SENT0 = []; var gi = 0; m.spoken.sentences.forEach(function(s){ SENT0.push(gi); gi += s.split(/\s+/).filter(Boolean).length; }); SENT0.push(gi);
  VIDX = m.spoken.verdictWordIndex >= 0 ? m.spoken.verdictWordIndex : m.spoken.words.length - 1;
  fillSats(m); buildChart(m.chart, res.provenance, res.receivedAt); A.chartT0 = 1e9; A.chartExit = 1e9; A.nowS.set(0);
  fillCards(m);
  el.vWord.textContent = m.verdict.word;
  el.convL.textContent = m.ring.mode === 'conviction' ? m.ring.label : '';
  var prov = res.provenance || {};
  el.meta.textContent = m.meta + (prov.asOf ? ' · ' + tt('meta.asOf', { when: whenLabel(prov.asOf, res.receivedAt) }) : '');
  PREV.on = false; PREV.imp = false;
  kInit(m.spoken.text);
  A.satLay.set(0); A.orbDraw.set(0); A.orbO.set(1); A.capY.set(CAP_TALK);
  A.vCond.set(0); A.ringFill.set(0); A.ringO.set(0); A.convO.set(0); A.ringOff.set(14); A.pctPos.set(0); A.metaO.set(0);
  A.rev.forEach(function(v){ v.set(0); }); A.trk.set(0); A.cardIdx = 0; A.commit = false;
}
function speakRead(){
  var r = READ; if (!r || !r.model) return;
  VOICE.id = r.requestId; VOICE.started = false; VOICE.ended = false; VOICE.silent = false; VOICE.reqT = clk; VOICE.lvl = 0; VOICE.at = -9;
  bcall('speak', { id: r.requestId, text: r.model.spoken.text }).then(function(res){
    if (READ !== r || VOICE.id !== r.requestId) return;
    if (!res || res.status !== 'queued') goSilent();
  }, function(){ if (READ === r) goSilent(); });
}
function goSilent(){ VOICE.silent = true; VOICE.ended = true; }
function sentStartT(si){ return kWordT(SENT0[si]).t0; }

/* ---------- TALK_EVIDENCE: B4 satellites + karaoke ---------- */
function talkTick(){
  if (capCur >= 0){ var c = CAPS[capCur]; if (c.pg + 1 < PAGES.length && K.t >= pageFlipT(c.pg)) capShow(c.pg + 1); }
  var vt = kWordT(VIDX).t0;
  if (ST.name === 'VERDICT') return;
  if (!PREV.on && K.t >= vt - 1.10) preVerdict();
  if (PREV.on && !PREV.imp && K.t >= vt - 0.06){ PREV.imp = true; impact2(); }
  if (K.t >= vt - 0.03) go('VERDICT');
}
/* the evidence feeds the verdict: satellites retract, the companion sinks, the filament collapses (B6 21.30–22.34) */
function preVerdict(){
  PREV.on = true; gulpCanon(true);
  var k = 0; [3, 2, 1, 0].forEach(function(i){ if (A.sat[i].on && A.sat[i].p.t > 0){ satRetract(i, k * 0.04); k++; } });
  A.orbO.tween(0, 0.24, E.fade);
  U.compDepth.cfg = UT(0.38); U.compDepth.to(1, null, null, 0.10); U.compOn.to(0, null, null, 0.48);
  S.cy.to(210, 'soft', null, 0.30); S.r.to(72, 'soft', null, 0.30);
  U.filR.tween(0, 0.45, E.inhale, 0.50);
  A.capY.to(592, 'soft', null, 0.30);
}
function talkDown(h){
  if (h === 'close') return tapG(function(){ go('RETURNING'); });
  if (h === 'pill' && A.mode === 'stop') return tapG(function(){ bcall('stopSpeaking').catch(noop); goSilent(); pillMode('mic'); }, A.press);
  return null;
}
STATES.TALK_EVIDENCE = {
  enter: function(){
    if (!K.on){ K.on = true; K.t = 0; }
    moveSphere(330, 96, true);
    A.capY.set(CAP_TALK);
    cue(0.25, function(){ U.compOn.to(1); U.compDepth.cfg = UT(0.42); U.compDepth.to(0); var k = 0; A.sat.forEach(function(s, i){ if (s.on){ satEmit(i, k * 0.07); k++; } }); });
    cue(0.30, function(){ capShow(pageOf(Math.max(0, kIndexAt(K.t)))); pillMode(VOICE.silent ? 'mic' : 'stop'); });
    cue(0.60, function(){ A.orbDraw.tween(1, 0.9, E.data); });
  },
  tick: function(){
    talkTick(); if (ST.name !== 'TALK_EVIDENCE') return;
    var m = READ.model;
    if (m.chart && !PREV.on){
      var s = m.spoken.stageAt.chart, tC = s != null ? sentStartT(s) : kWordT(SENT0[1] - 1).t1 + 0.3;
      /* the chart needs room to be read: it is skipped when the verdict is due within 3.5 s of it */
      if (K.t >= tC && inState() > 1.2 && kWordT(VIDX).t0 - tC > 3.5) go('TALK_CHART');
    }
  },
  down: talkDown
};
function kIndexAt(t){ var i = 0; while (i + 1 < K.wt.length && K.wt[i + 1].t0 <= t) i++; return i; }

/* ---------- TALK_CHART: B5, the chart exhaled from the sphere ---------- */
STATES.TALK_CHART = {
  enter: function(){
    hint('');
    moveSphere(210, 64, true);
    A.satLay.to(1, 'soft', null, 0.12); A.capY.to(592, 'soft', null, 0.12);
    cue(0.60, function(){ if (!RM){ S.gulp.to(-0.015, 'snap'); S.bulge.to(0.03, 'snap'); } });
    cue(0.74, function(){ S.gulp.to(0, BODY.gulp); S.bulge.to(0, BODY.gaze); if (!RM){ S.cEmit.tween(0.09, 0.11, E.exhale); S.cEmit.to(0, BODY.gulp, null, 0.11); } exposure(0.10); A.chartT0 = clk; A.chartExit = 1e9; A.nowS.set(0); A.nowS.to(1, 'emit', null, RM ? 0.001 : 1.82); });
  },
  tick: talkTick,
  down: talkDown
};

/* ---------- VERDICT: B6 — IMPACT 2 in the verdict colour; the word condenses 30 ms before it is spoken ---------- */
STATES.VERDICT = {
  enter: function(){
    if (!PREV.on) preVerdict();
    if (!PREV.imp){ PREV.imp = true; impact2(); }
    var m = READ.model; this.landed = false;
    A.vCond.set(0); A.vCond.tween(1, RM ? 0.3 : 0.9, E.lin);
    cue(0.25, function(){
      A.ringO.tween(1, 0.2, E.fade);
      var tgt = m.ring.mode === 'conviction' ? clamp(m.ring.pct / 100, 0, 1) : 1;
      if (RM) A.ringFill.set(tgt); else A.ringFill.tween(tgt, 1.1, E.data);
      if (m.ring.mode === 'conviction') A.convO.tween(1, 0.3, E.fade);
    });
    cue(0.58, function(){ U.braid.set(0); U.filA.set(0); U.swirl.to(0); });
    cue(1.35, function(){ A.landT = clk; tick('soft'); gulpCanon(false); STATES.VERDICT.landed = true; });
    att(el.sphereA, 'aria-label', m.aria);
  },
  tick: function(){
    talkTick();
    if (this.landed && (VOICE.ended || VOICE.silent || K.t > K.end + 3) && K.t >= K.end) go('HANDBACK');
  },
  down: talkDown
};

/* ---------- HANDBACK: two sags, the pull hint, the pill is a mic again ---------- */
STATES.HANDBACK = {
  enter: function(prev, d){
    if (!d.restored){ sag(); at(0.55, sag); }
    A.metaO.tween(1, 0.3, E.fade); A.metaY.set(6); A.metaY.to(0, 'emit');
    var vp = SES && SES.hints ? (SES.hints.verdictPull || 0) : 0;
    if (vp < 3){ hint(tt('hint.pull')); if (!HINTED.verdictPull){ HINTED.verdictPull = true; markHint('verdictPull'); } } else hint('');
    pillMode(idleMode()); this.idleT = clk; A.commit = false;
  },
  tick: function(){ if (clk - this.idleT > 90) go('RETURNING'); },
  down: function(h, p){
    this.idleT = clk;
    if (h === 'close') return tapG(function(){ go('RETURNING'); });
    if (h === 'pill') return pillDown(p, true);
    if (h === 'avatar') return avatarG();
    return pullG();
  }
};
/* ---------- PULLING: B7 25.50–26.10, tracked 1:1 with the rubber band ---------- */
function pullG(){
  var locked = null;
  return {
    move: function(p){
      var dx = p.x - p.x0, dy = p.y - p.y0;
      if (!locked){ if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; locked = (dy > 0 && Math.abs(dy) >= Math.abs(dx)) ? 'pull' : 'none'; if (locked === 'pull') go('PULLING'); }
      if (locked === 'pull' && ST.name === 'PULLING') STATES.PULLING.track(Math.max(0, p.y - p.y0));
    },
    up: function(p){ if (locked === 'pull' && ST.name === 'PULLING') STATES.PULLING.release(vel()[1]); },
    cancel: function(){ if (locked === 'pull' && ST.name === 'PULLING') STATES.PULLING.release(0); }
  };
}
STATES.PULLING = {
  enter: function(){ A.pullOn = true; A.cardsOn = true; A.commit = false; hint(''); },
  track: function(dy){
    var rub = (1 - 1 / (dy * 0.55 / 260 + 1)) * 260;
    S.pull.set(Math.min(0.14, rub * 0.0009));
    for (var i = 0; i < A.nCards; i++) A.rev[i].set(Math.min(1, rub / 75));
    if (!A.commit && dy >= 72) this.commitNow();
  },
  commitNow: function(){ A.commit = true; tick('light'); if (A.chartT0 < 1e8) A.chartExit = clk; capsOff(); A.metaO.tween(0, 0.17, E.fade); hint(''); },
  release: function(vy){
    A.pullOn = false;
    if (!A.commit && vy > 500) this.commitNow();
    if (A.commit){ go('CARDS', { vy: vy }); return; }
    A.rev.forEach(function(v){ v.to(0, 'glide'); }); S.pull.to(0, BODY.gulp); A.cardsOn = false;
    go('HANDBACK', { back: true, restored: true });
  }
};

/* ---------- CARDS: B7 26.10–27.90. Debate · Thesis · (Isla) ---------- */
function pullRelease(vy){
  var dvr = (vy || 0) / 75 * (1 / (1 + 120 * 0.55 / 260)) * 0.55;
  for (var i = 0; i < A.nCards; i++) A.rev[i].to(1, 'glide', dvr);
  S.pull.to(0, BODY.gulp); gulp(0.02);
  S.cy.to(158, 'soft'); S.r.to(44, 'soft'); A.ringOff.to(10, 'soft'); A.pctPos.to(1, 'soft');
  U.energy.to(0.18); U.wflow.to(0.04); U.breathK.to(0.5);
}
function cardsDown(h, p, hitEl){
  if (h === 'close') return tapG(function(){ go('RETURNING'); });
  if (h === 'save') return A.saved.t > 0.5 ? null : tapG(function(){ go('SAVING'); }, A.savePress);
  if (h === 'hz') return tapG(function(){ setHorizon(+hitEl.getAttribute('data-h')); tick('selection'); });
  if (h === 'islaGo') return tapG(function(){ openNative('isla'); });
  if (h === 'pill') return pillDown(p, true);
  if (h === 'chip') return chipG(hitEl);
  if (h === 'chiprow') return chipRowG();
  return cardTrackG(h === 'scroll');
}
function cardTrackG(scrollable){
  var locked = null, t0 = A.trk.x, s0 = A.dscr.x;
  return {
    move: function(p){
      var dx = p.x - p.x0, dy = p.y - p.y0;
      if (!locked){ if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; locked = Math.abs(dx) > Math.abs(dy) ? 'x' : (scrollable && A.cardIdx === 0 ? 'y' : 'none'); }
      if (locked === 'x'){ var lo = -340 * (A.nCards - 1), x = t0 + dx; if (x > 0) x = x * 0.35; if (x < lo) x = lo + (x - lo) * 0.35; A.trk.set(x); }
      else if (locked === 'y'){ var y = s0 - dy, mx = A.dscrMax; if (y < 0) y = y * 0.35; if (y > mx) y = mx + (y - mx) * 0.35; A.dscr.set(y); }
    },
    up: function(p){
      var v = vel();
      if (locked === 'x'){
        var dx = p.x - p.x0, i0 = Math.round(-t0 / 340), dir = (Math.abs(dx) > 40 || Math.abs(v[0]) > 300) ? (dx < 0 ? 1 : -1) : 0;
        var i = clamp(i0 + dir, 0, A.nCards - 1); A.cardIdx = i; A.trk.to(-340 * i, 'glide', v[0]);
        if (i !== i0) at(0.35, function(){ tick('selection'); });
      } else if (locked === 'y'){
        var tgt = clamp(A.dscr.x - v[1] * 0.35, 0, A.dscrMax); A.dscr.to(tgt, 'glide', -v[1]);
      }
    },
    cancel: function(){ A.trk.to(-340 * A.cardIdx, 'glide'); A.dscr.to(clamp(A.dscr.x, 0, A.dscrMax), 'glide'); }
  };
}
STATES.CARDS = {
  enter: function(prev, d){ if (prev === 'PULLING') pullRelease(d.vy); att(el.sphereA, 'aria-label', tt('aria.cards')); pillMode(idleMode()); },
  down: cardsDown
};

/* ---------- SAVING: B8 — press, label roll, one conic sweep, the real XP, the swallow ---------- */
STATES.SAVING = {
  enter: function(){
    var r = READ, m = r.model;
    A.savePress.to(1, 'emit'); saveRoll.set(m.thesis.savedLabel); A.saved.tween(1, 0.24, E.fade); A.sweepT = clk; tick('success');
    A.lnO.tween(0, 0.16, E.fade);
    var params = { requestId: r.requestId }; if (m.thesis.horizon.show) params.horizonHours = HZ;
    bcall('saveThesis', params).then(function(res){ onSaved(r, res); }, function(){ onSaved(r, { status: 'failed' }); });
    cue(1.8, function(){ go('FOLLOWUPS'); });
  },
  down: cardsDown
};
function onSaved(r, res){
  if (READ !== r) return;
  r.save = res;
  var m = r.model;
  if (!res || res.status !== 'saved'){
    saveRoll.set(m.thesis.saveLabel); A.saved.tween(0, 0.24, E.fade); A.lnO.tween(1, 0.2, E.fade);
    hint(tt(res && res.status === 'stale' ? 'save.stale' : 'save.failed')); tick('warning');
    return;
  }
  SAVED = res;
  if (res.thesis){ LEDGER = [res.thesis].concat(LEDGER.filter(function(t){ return t.id !== res.thesis.id; })).slice(0, 20); }
  if (SES){ SES.xp = res.xp; if (res.level) SES.level = res.level; if (fin(res.streak)) SES.streak = res.streak; setXpArc(SES.level && SES.level.progress); }
  el.card1.xp.textContent = RMOD.xpChip(res.awardedXP, m.verdict.key, LANG);
  A.xp.set(0); A.xp.to(1, 'emit', null, 0.1); A.xpO.tween(1, 0.2, E.fade, 0.1);
  var line = res.evolution ? tt('save.evolution', { n: res.evolution.number, name: res.evolution.name })
    : (res.unlocks && res.unlocks.length ? tt('save.unlock', { name: res.unlocks[0].name }) : '');
  if (line) hint(line);
  A.tp.on = true; A.tp.u.set(0); A.tp.u.tween(1, 0.52, E.inhale, 0.6);
  at(0.6 + 0.52, function(){ gulp(0.04); tick('soft'); A.tp.on = false; A.badge.set(0); });
}

/* ---------- FOLLOWUPS: B9 — chips born from the pill; each sent chip is a paid desk read ---------- */
function chipG(hitEl){
  var i = +(hitEl && hitEl.getAttribute('data-i')), c = A.chips[i]; if (!c) return null;
  c.press.to(0.96, 'snap');
  var row = chipRowG();
  return {
    move: function(p){ if (p.moved){ c.press.to(1, 'emit'); row.move(p); } },
    up: function(p){ c.press.to(1, 'emit'); if (p.moved) return row.up(p); chipAct(c); },
    cancel: function(){ c.press.to(1, 'emit'); }
  };
}
function chipRowG(){
  var x0 = A.chipX.x;
  return {
    move: function(p){ var x = x0 + (p.x - p.x0); if (x > 0) x *= 0.35; if (x < -A.chipMax) x = -A.chipMax + (x + A.chipMax) * 0.35; A.chipX.set(x); },
    up: function(){ A.chipX.to(clamp(A.chipX.x + vel()[0] * 0.3, -A.chipMax, 0), 'glide', vel()[0]); },
    cancel: function(){ A.chipX.to(clamp(A.chipX.x, -A.chipMax, 0), 'glide'); }
  };
}
function chipAct(c){
  var a = c.action || {}, cx = c.x + c.w / 2 + A.chipX.x, cy = 660;
  tick('light');
  if (a.risk){ openNative('riskNotice'); return; }   /* native replaces this page with the risk beat (onboarding#risk) */
  if (a.retype){ openTyping({ fromRead: false }); return; }
  if (a.followUpOf){ openTyping({ followUpOf: a.followUpOf, fromRead: true }); return; }
  if (a.token){ go('SENDING', { params: { token: a.token }, question: READ ? READ.question : '', origin: 'chip', cx: cx, cy: cy }); return; }
  if (a.question){ go('SENDING', { question: a.question, origin: 'chip', cx: cx, cy: cy, fromRead: true }); }
}
STATES.FOLLOWUPS = {
  enter: function(){ chipsShow(RMOD.followUps(READ.model, SUGG || {}, LANG), true); },
  tick: function(){ if (inState() > 45) go('RETURNING'); },
  down: cardsDown
};

/* ---------- RETURNING: B10 — cards retract before the sphere moves; the verdict evaporates; the tint returns ---------- */
STATES.RETURNING = {
  enter: function(prev, d){
    var hadVerdict = A.vCond.t > 0 || U.flood.t > 0, hadCards = clearRead();
    var k = hadCards ? 0.80 : hadVerdict ? 0.55 : 0.25;
    txReset(); showTypeBox(false);
    pillMode(idleMode());
    cue(k, function(){ glassHome(); moveSphere(340, 120, true); });
    cue(k + 0.10, function(){ tintHome(); });
    cue(k + 0.50, function(){ buildFaces(); if (SAVED && SAVED.thesis) ghostIn(); });
    cue(k + 0.55, function(){ setGreeting(); greetIn(); meriIn(); if (SAVED && LEDGER.length) A.badge.to(1, 'emit', null, 0.3); });
    cue(k + 0.90, function(){ go('IDLE'); });
  },
  down: function(h, p){ if (h === 'pill') return pillDown(p); return null; }
};

/* ---------- ERROR / CANCELLED: honest caption, no verdict, no ring, no XP ---------- */
STATES.ERROR = {
  enter: function(prev, d){
    var f = d.f || {};
    dissolveThink(); glassHome(); A.chartT0 = 1e9;
    moveSphere(340, 120, prev === 'THINK_WAIT'); at(0.5, sag);
    pillMode(idleMode()); hint('');
    cue(0.35, function(){ noteIn(f.caption || '', f.sub || ''); tick('warning'); });
    att(el.sphereA, 'aria-label', tt('aria.noVerdict'));
  },
  tick: function(){ if (inState() > 6) go('RETURNING'); },
  down: function(h, p){ if (h === 'pill') return pillDown(p, true); return tapG(function(){ go('RETURNING'); }); }
};

/* ---------- CONFIRM_ASSET / UNKNOWN_ASSET: caption from the rim, chips from the pill ---------- */
function askAgainEnter(prev, d){
  var f = d.f || {};
  dissolveThink(); glassHome(); moveSphere(340, 120); pillMode(idleMode()); hint('');
  var chips = (f.chips || []).slice();
  if (f.kind === 'unknown') chips.push({ label: RMOD.t(LANG, 'confirm.no'), action: { retype: true } });
  cue(0.25, function(){ noteIn(f.caption || '', f.sub || ''); });
  cue(0.45, function(){ chipsShow(chips, false); });
}
function askAgainDown(h, p, hitEl){
  if (h === 'chip') return chipG(hitEl);
  if (h === 'chiprow') return chipRowG();
  if (h === 'pill') return pillDown(p, true);
  if (h === 'close') return tapG(function(){ go('RETURNING'); });
  return tapG(function(){ go('RETURNING'); });
}
STATES.CONFIRM_ASSET = { enter: askAgainEnter, tick: function(){ if (inState() > 30) go('RETURNING'); }, down: askAgainDown };
STATES.UNKNOWN_ASSET = { enter: askAgainEnter, tick: function(){ if (inState() > 30) go('RETURNING'); }, down: askAgainDown };
/* RISK_GATE: the read was refused for consent; the chip opens the risk beat, never a generic failure */
STATES.RISK_GATE = { enter: askAgainEnter, tick: function(){ if (inState() > 30) go('RETURNING'); }, down: askAgainDown };

/* ---------- FACES: B11 physics under the real finger ---------- */
function faceDragG(){
  var locked = null, th0 = 0;
  return {
    move: function(p){
      var dx = p.x - p.x0, dy = p.y - p.y0;
      if (!locked){
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        locked = (Math.abs(dx) > Math.abs(dy) && FACES.length > 1) ? 'x' : 'none';
        if (locked === 'x'){ if (ST.name !== 'FACES') go('FACES'); th0 = A.th.x; A.fDrag = true; A.fRel = false; U.presence.to(1); U.faceOn.to(1); }
      }
      if (locked === 'x'){ var R = 120, st0 = faceStep(), d = -(dx) / (0.9 * R); if (Math.abs(d) > st0) d = Math.sign(d) * (st0 + (Math.abs(d) - st0) * 0.3); A.th.set(th0 + d); }
    },
    up: function(p){
      if (locked !== 'x') return;
      var v = vel()[0], dx = p.x - p.x0, dir = (Math.abs(dx) > 40 || Math.abs(v) > 300) ? (dx < 0 ? 1 : -1) : 0;
      faceSwing(dir, v, th0);
    },
    cancel: function(){ if (locked === 'x') faceSwing(0, 0, th0); }
  };
}
function faceSwing(dir, vx, th0){
  var R = 120, sp = faceStep();
  if (th0 == null) th0 = A.th.x;
  var k0 = Math.round(th0 / sp), target = (k0 + dir) * sp;
  A.fDrag = false; A.fRel = true; U.presence.to(0);
  A.th.to(target, 'glide', -(vx || 0) / (0.9 * R));
  var k = faceAt(target);
  if (k !== A.fIdx) faceText(k, dir || 1);
  A.fIdx = k;
  var id = FACES[k].id;
  if (id === 'squad') A.beltT0 = clk;
  if (id === 'theses'){ A.thesesT0 = clk; A.badge.tween(0, 0.24, E.fade); A.satT.forEach(function(s2, j){ if (s2.on){ s2.p.set(0); s2.p.to(1, 'emit', null, 0.1 + j * 0.07); } }); }
  if (id !== 'desk' && !HINTED.swipe){ HINTED.swipe = true; hint(''); }
}
function faceText(k, dir){
  var dx = -12 * (dir || 1);
  if (A.ftxCur < 0){ A.greet.x.to(dx, 'snap'); A.greet.o.tween(0, 0.17, E.fade); A.satG.o.tween(0, 0.17, E.fade); }
  else { var o = A.ftx[A.ftxCur]; o.x.to(dx, 'snap'); o.o.tween(0, 0.17, E.fade); o.sx.to(dx, 'snap'); o.so.tween(0, 0.17, E.fade, 0.04); o.co.tween(0, 0.12, E.fade); o.cp.to(0, 'ret'); }
  var f = FACES[k];
  if (f.id === 'desk'){
    A.ftxCur = -1; A.greet.x.set(-dx); A.greet.o.tween(1, 0.24, E.fade, 0.04); A.greet.x.to(0, 'snap', null, 0.04);
    A.greet.w.concat(A.greet.s ? [A.greet.s] : []).forEach(function(w){ w.y.set(0); w.o.set(1); w.b.set(0); });
    if (A.satG.on) A.satG.o.tween(0.7, 0.24, E.fade, 0.1);
    return;
  }
  var slot = A.ftxCur === 0 ? 1 : 0, n = A.ftx[slot], t = '', s = '', c = '';
  if (f.id === 'isla'){ t = tt('face.isla'); s = tt('face.isla.status', { pieces: ISLAND.pieces || 0, seeds: ISLAND.seedsGrowing || 0 }); c = tt('face.isla.chip'); }
  else if (f.id === 'squad'){ var lv = SES && SES.level ? SES.level.number : 1, sk = SES ? SES.streak : 0; t = tt('face.squad'); s = sk > 0 ? tt('face.squad.status', { name: ME.label, level: lv, streak: sk }) : tt('face.squad.statusNew', { name: ME.label, level: lv }); c = tt('face.squad.chip'); }
  else if (f.id === 'theses'){ t = tt('face.theses'); s = LEDGER.length === 1 ? tt('face.theses.one') : tt('face.theses.many', { n: LEDGER.length }); c = tt('face.theses.chip'); }
  el.ftxT[slot].textContent = t; el.ftxS[slot].textContent = s; el.ftxC[slot].textContent = c; el.ftxC[slot].setAttribute('data-face', f.id);
  n.x.set(-dx); n.o.set(0); n.sx.set(-dx); n.so.set(0); n.cp.set(0); n.co.set(0);
  n.x.to(0, 'snap', null, 0.04); n.o.tween(1, 0.24, E.fade, 0.04);
  n.sx.to(0, 'snap', null, 0.08); n.so.tween(1, 0.24, E.fade, 0.08);
  n.cp.to(1, 'emit', null, 0.16); n.co.tween(1, 0.2, E.fade, 0.16);
  A.ftxCur = slot;
}
STATES.FACES = {
  enter: function(){ U.faceOn.to(1); att(el.sphereA, 'aria-label', tt('aria.faces')); if (!HINTED.swipe) hint(tt('hint.swipe')); },
  tick: function(){
    if (A.fRel && !A.fDrag && Math.abs(A.th.x - A.th.t) < 0.002 && Math.abs(A.th.v) < 0.05){
      A.fRel = false; A.detT = clk; gulp(0.02); tick('selection');
      if (FACES[A.fIdx].id === 'desk'){ A.th.set(0); go('IDLE'); }
    }
  },
  down: function(h, p, hitEl){
    if (h === 'fchip') return tapG(function(){ faceAction(hitEl.getAttribute('data-face')); }, A.fchipPress);
    if (h === 'satT0' || h === 'satT1'){ var s = A.satT[h === 'satT0' ? 0 : 1]; return tapG(function(){ if (s.th) go('THESIS_VIEW', { thesis: s.th, back: 'FACES' }); }); }
    if (h === 'meri') return tapG(function(){ faceSwing(1, 0); });
    if (h === 'avatar') return avatarG();
    if (h === 'pill'){ A.th.to(Math.round(A.th.x / TAU) * TAU, 'glide'); A.fDrag = false; A.fRel = false; if (A.fIdx !== 0){ faceText(0, -1); A.fIdx = 0; } return pillDown(p); }
    return faceDragG();
  }
};
function faceAction(id){
  if (id === 'isla') openNative('isla');
  else if (id === 'squad') openNative('squad');
  else if (id === 'theses' && LEDGER[0]) go('THESIS_VIEW', { thesis: LEDGER[0], back: 'FACES' });
}

/* ---------- THESIS_VIEW: a saved thesis, read-only, poured from the sphere ---------- */
STATES.THESIS_VIEW = {
  enter: function(prev, d){
    this.back = d.back || 'IDLE';
    var v = RMOD.thesisView(d.thesis, LANG, { signedIn: !!(SES && SES.signedIn) });
    v.when = whenLabel(d.thesis.asOf, Date.parse(d.thesis.savedAt));
    fillThesisCard(v, { verdict: v.verdict.key, readOnly: true });
    el.card1.ln.textContent = v.line; A.lnO.set(1);
    A.nCards = 1; A.viewOnly = true; A.cardsOn = true; A.trk.set(-340); A.rev[0].set(0); A.rev[2].set(0); A.rev[1].set(0); A.rev[1].to(1, 'glide');
    if (lineShown(A.greet)) greetOut(); if (A.ftxCur >= 0){ var o = A.ftx[A.ftxCur]; o.o.tween(0, 0.17, E.fade); o.so.tween(0, 0.17, E.fade); o.co.tween(0, 0.12, E.fade); }
    meriOut(); A.satG.o.tween(0, 0.17, E.fade); hint('');
    moveSphere(158, 44, true); U.energy.to(0.18); U.breathK.to(0.5); U.faceOn.to(0);
    A.wmO.tween(0, 0.16, E.fade); A.closeO.tween(1, 0.24, E.fade, 0.1);
  },
  exit: function(){ A.rev[1].to(0, 'ret'); A.cardsOn = false; A.viewOnly = false; A.closeO.tween(0, 0.16, E.fade); A.wmO.tween(1, 0.16, E.fade, 0.04); moveSphere(340, 120, true); U.energy.to(0.35); U.breathK.to(1); },
  down: function(h){ return tapG(function(){ STATES.THESIS_VIEW.leave(); }); },
  leave: function(){
    var back = this.back; go('IDLE', { restoreGreet: back !== 'FACES' });
    if (back === 'FACES'){ A.th.to(Math.ceil(A.th.x / TAU - 1e-6) * TAU, 'glide'); A.fIdx = 0; faceText(0, -1); meriIn(); }
  }
};

/* ---------- RESTORE: a pending read at boot jumps straight to the settled hand-back ---------- */
STATES.RESTORE = {
  enter: function(prev, d){
    var res = d.read, r = { id: ++READ_SEQ, params: null, question: res.question || '', accepted: true, asset: res.asset, market: res.market, reply: res, model: null, requestId: res.requestId, askT: clk };
    try { r.model = RMOD.build(res, { lang: LANG, signedIn: !!(SES && SES.signedIn) }); } catch (e) { logErr('restore', e); go('WAKE'); return; }
    READ = r; READS_DONE++;
    A.greet.o.set(0); A.meri.forEach(function(m){ m.p.set(0); m.o.set(0); }); A.satG.o.set(0); if (A.note.o.t > 0) A.note.o.set(0);
    prepRead(r.model);
    VOICE.id = null; VOICE.ended = true; VOICE.silent = true;
    K.on = true; K.t = K.end + 0.5;
    S.cy.set(210); S.r.set(72); U.glow.set(1); U.flood.set(1.1); U.scrim.set(0.9); U.energy.set(0.3); U.irid.set(0.35); U.wflow.set(0.12);
    TINT.amt.set(0); TINT.wash.set(0); ambientCanon(true);
    A.dim.set(1); A.hdr.set(1); A.pillY.set(0); A.pillO.set(1);
    A.vCond.set(1); A.ringO.set(1); A.ringFill.set(r.model.ring.mode === 'conviction' ? r.model.ring.pct / 100 : 1); A.convO.set(r.model.ring.mode === 'conviction' ? 1 : 0);
    if (r.model.chart){ A.chartT0 = clk - 6; A.nowS.set(1); }
    A.capY.set(592); capShow(PAGES.length - 1); CAPS[capCur].inT = clk - 1;
    A.qText = r.question; A.qT0 = clk - 10; A.dockO.set(1); A.closeO.set(1); A.wmO.set(0); dockAsset();
    go('HANDBACK', { restored: true });
  }
};

/* ---------- aria per state ---------- */
var ARIA = { BOOT: 'aria.waking', WAKE: 'aria.waking', IDLE: 'aria.idle', PRE_PERMISSION: 'aria.idle', LISTENING: 'aria.listening', TYPING: 'aria.idle',
  SENDING: 'aria.sending', RESOLVING: 'aria.thinking', THINK_WAIT: 'aria.thinking', THINK_RESOLVE: 'aria.thinking', TALK_EVIDENCE: 'aria.speaking', TALK_CHART: 'aria.speaking',
  RETURNING: 'aria.idle', CONFIRM_ASSET: 'aria.noVerdict', UNKNOWN_ASSET: 'aria.noVerdict', RISK_GATE: 'aria.noVerdict', FACES: 'aria.faces', THESIS_VIEW: 'aria.cards', SAVING: 'aria.cards', FOLLOWUPS: 'aria.cards' };
function ariaState(){ var k = ARIA[ST.name]; if (k) att(el.sphereA, 'aria-label', tt(k)); }
