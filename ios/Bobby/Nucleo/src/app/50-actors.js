/* =====================================================================
   9. State: the sphere, its uniforms and phases, and every DOM actor.
   Built once; the FSM retargets them. Nothing is rebuilt per read.
   ===================================================================== */
var S = null, U = null, P = null, TINT = null, PUL = null, DU = null, A = null;
var HN = 64, HIST = new Float64Array(HN * 3), HI = 0, HC = 0, LAG0 = { cy: 0, r: 0 }, LAG1 = { cy: 0, r: 0 }, LAG2 = { cy: 0, r: 0 };
var AMB_CANON = false;
function buildState(){
  S = { cy: new V(340, 'soft', true), r: new V(110, 'soft', true), lean: new V(0, BODY.gaze, true), sag: new V(0, BODY.gulp),
        gulp: new V(0, BODY.gulp), bulge: new V(0, BODY.gaze), pull: new V(0, BODY.gulp), cEmit: new V(0, BODY.gulp) };
  U = { energy: uv(0.35, 0.30), swirl: uv(0, 0.9), glow: new V(0.35, BODY.gaze), irid: uv(1, 0.6), listenIr: uv(0, 0.3), compDepth: uv(1, 0.42), compOn: uv(0, 0.3),
        scrim: uv(0, 0.38), braid: uv(0, 0.48), flood: uv(0, 0.48), wflow: uv(0.18, 0.6), filA: uv(0, 0.3), filR: uv(0.8, 0.3), radK: uv(1, 0.3),
        breathK: uv(1, 0.8), presence: uv(0, 0.4), faceOn: uv(0, 0.4), nodesO: uv(0, 0.3),
        bper: uv(TM.breath, 0.8), driftK: uv(TM.drift, 0.8), flowK: uv(TM.flow, 0.8) };
  AMB_CANON = false; tuneAmbient(true);
  P = { twist: 0, twistOsc: 0, flow: 0, drift: 0, rot: 0, iridPh: 0, cio: 0, fil: 0, rip: 0, bph: 0, conic: 0, crawl: 0, sat: 0, now: 0 };
  TINT = { from: ME.tint, to: ME.tint, mix: uv(1, 0.8), amt: uv(0, 0.8), wash: uv(0, 0.8) };
  HI = 0; HC = 0; PUL = { exp: [], shock: null, spark: null, tick: [], rim: [] };
  DU = { phi: 0, k: 0, on: false, conv: false, voice: 0, dimT: 0, ripSend: -9, t0: 0, cross: 0 };
  A = {
    hdr: new V(0, 'soft'), wmY: new V(0, 'snap', true), wmO: new V(1, 'soft'), dockO: new V(0, 'soft'), dockAO: new V(0, 'soft'), closeO: new V(0, 'soft'),
    qT0: 1e9, qText: '', aText: '',
    greet: { w: [], s: null, x: new V(0, 'snap', true), o: new V(1, 'soft') },
    note: { w: [], s: null, o: new V(0, 'soft') },
    meri: [0, 1, 2, 3].map(function(){ return { p: new V(0, 'emit'), o: new V(0, 'soft') }; }), badge: new V(0, 'emit'),
    pillY: new V(28, 'soft', true), pillO: new V(0, 'soft'), pillW: new V(96, 'pill'), press: new V(1, 'snap'), glow: new V(0.15, 'soft'),
    mode: 'mic', modeO: { mic: new V(1, 'soft'), kbd: new V(0, 'soft'), bars: new V(0, 'soft'), think: new V(0, 'soft'), stop: new V(0, 'soft') },
    barsT0: -9, barsOutT0: 1e9, goo: new V(0, 'soft'),
    tx: { words: [], lift: new V(0, 'soft', true), final: false, o: new V(1, 'soft') },
    bead: { s: new V(0, 'emit'), o: new V(0, 'soft'), x0: 195, y0: 558, fly0: 1e9 },
    ag: [0, 1, 2].map(function(){ return { o: new V(0, 'soft'), dx: new V(0, 'emit', true), dy: new V(8, 'emit', true), draw: new V(0, 'soft'), tIn: 1e9, tOut: 1e9, stT: 1e9, stW: [] }; }),
    cioSwO: new V(1, 'soft'), vfO: new V(0, 'soft'),
    sat: [0, 1, 2, 3].map(function(){ return { p: new V(0, 'emit'), tE: 1e9, on: false, hw: 50, talk: [0, 0], chartP: [0, 0] }; }),
    satLay: new V(0, 'soft'), orbDraw: new V(0, 'soft'), orbO: new V(1, 'soft'),
    satG: { p: new V(0, 'emit'), o: new V(0, 'soft'), on: false, hw: 59 }, satT: [{ p: new V(0, 'emit'), on: false, hw: 50 }, { p: new V(0, 'emit'), on: false, hw: 50 }],
    capY: new V(488, 'soft', true), metaO: new V(0, 'soft'), metaY: new V(6, 'emit', true),
    chartT0: 1e9, chartExit: 1e9, nowS: new V(0, 'emit'),
    vCond: new V(0, 'soft'), ringFill: new V(0, 'soft'), ringOff: new V(14, 'soft', true), ringO: new V(0, 'soft'), landT: -9, pctPos: new V(0, 'soft', true), convO: new V(0, 'soft'),
    rev: [new V(0, 'glide'), new V(0, 'glide'), new V(0, 'glide')], trk: new V(0, 'glide', true), cardsOn: false, commit: false, pullOn: false, cardIdx: 0, nCards: 2,
    dscr: new V(0, 'glide', true), dscrMax: 0,
    savePress: new V(1, 'snap'), saved: new V(0, 'soft'), sweepT: -9, xp: new V(0, 'emit'), xpO: new V(0, 'soft'), lnO: new V(1, 'soft'),
    tp: { u: new V(0, 'soft'), on: false },
    eyebrowO: new V(0, 'soft'), eyebrowY: new V(6, 'emit', true), chips: [], chipX: new V(0, 'glide', true), chipMax: 0,
    th: new V(0, 'glide'), th0: 0, fIdx: 0, fDrag: false, fRel: false, detT: -9, beltT0: 1e9, thesesT0: 1e9,
    ftx: [0, 1].map(function(){ return { x: new V(0, 'snap', true), o: new V(0, 'soft'), sx: new V(0, 'snap', true), so: new V(0, 'soft'), cp: new V(0, 'emit'), co: new V(0, 'soft') }; }), ftxCur: -1,
    dim: new V(0, 'soft'),
    perm: { p: new V(0, 'emit'), b: 1e9, g: 1e9, press: new V(1, 'snap') },
    type: { p: new V(0, 'emit'), o: new V(0, 'soft') },
    fchipPress: new V(1, 'snap'), avPress: new V(1, 'snap')
  };
}
/* ambient uniforms follow the temperament in idle, listening and faces; from the send until the return they run
   on the canonical responses, so both impacts and the verdict are identical for every companion (DIRECTION §2.1) */
function tuneAmbient(instant){
  var k = AMB_CANON ? 1 : TM.resp;
  U.energy.cfg = UT(0.30 * k); U.irid.cfg = UT(0.6 * k); U.listenIr.cfg = UT(0.3 * k); U.wflow.cfg = UT(0.6 * k);
  S.lean.m = S.sag.m = S.bulge.m = S.pull.m = S.cEmit.m = U.glow.m = TM.mass; S.gulp.m = S.gulp.cfg === CFG.gulp ? 1 : TM.mass;
  if (instant){ U.bper.set(TM.breath); U.driftK.set(TM.drift); U.flowK.set(TM.flow); }
  else { U.bper.to(TM.breath); U.driftK.to(TM.drift); U.flowK.to(TM.flow); }
}
function ambientCanon(on){ if (AMB_CANON !== on){ AMB_CANON = on; tuneAmbient(false); } }
function gulpCanon(on){ S.gulp.cfg = on ? CFG.gulp : BODY.gulp; S.gulp.m = on ? 1 : TM.mass; }
function histPush(t, cy, r){ var o = HI * 3; HIST[o] = t; HIST[o + 1] = cy; HIST[o + 2] = r; HI = (HI + 1) % HN; if (HC < HN) HC++; }
function lagS(ms, out){
  var t = clk - ms / 1000, n, ia, ib, u;
  if (!HC){ out.cy = S.cy.x; out.r = S.r.x; return out; }
  for (n = 1; n < HC; n++){
    ib = ((HI - n + HN) % HN) * 3; ia = ((HI - n - 1 + HN) % HN) * 3;
    if (HIST[ia] <= t){ u = clamp((t - HIST[ia]) / Math.max(1e-6, HIST[ib] - HIST[ia]), 0, 1); out.cy = lerp(HIST[ia + 1], HIST[ib + 1], u); out.r = lerp(HIST[ia + 2], HIST[ib + 2], u); return out; }
  }
  ia = ((HI - HC + HN) % HN) * 3; out.cy = HIST[ia + 1]; out.r = HIST[ia + 2]; return out;
}

/* ---- word lines: born from the bottom rim (drop 14, blur 6→0), inhaled back up ---- */
function lineSet(line, t, s, tEl, sEl){
  var ws = words(tEl, t);
  sEl.textContent = s || '';
  line.w.forEach(function(w){ w.y.kill(); w.o.kill(); w.b.kill(); });
  if (line.s){ line.s.y.kill(); line.s.o.kill(); line.s.b.kill(); }
  line.w = ws.map(function(w){ return { el: w, y: new V(-14, 'soft', true), o: new V(0, 'soft'), b: new V(6, 'soft') }; });
  line.s = { el: sEl, y: new V(-14, 'soft', true), o: new V(0, 'soft'), b: new V(6, 'soft') };
}
function wordIn(w, delay, fromY){ w.y.set(fromY); w.b.set(6); w.o.set(0); w.y.to(0, 'soft', null, delay); w.b.tween(0, 0.30, E.focus, delay); w.o.tween(1, 0.24, E.fade, delay); }
function wordOut(w, delay, toY, dur){ w.y.tween(toY, dur || 0.30, E.inhale, delay); w.o.tween(0, dur || 0.30, function(u){ return sstep(0.55, 1, u); }, delay); }
function lineIn(line, stag){ line.w.forEach(function(w, i){ wordIn(w, i * (stag || 0.055), -14); }); if (line.s) wordIn(line.s, 0.12, -14); }
function lineOut(line){ var all = line.w.concat(line.s ? [line.s] : []); for (var i = all.length - 1, k = 0; i >= 0; i--, k++) wordOut(all[i], k * 0.035, -14, 0.30); }
function lineShown(line){ return line.w.some(function(w){ return w.o.t > 0.5; }); }
function greetIn(){ A.greet.x.set(0); A.greet.o.set(1); lineIn(A.greet); }
function greetOut(){ lineOut(A.greet); }
function noteIn(t, s){ lineSet(A.note, t || '', s || '', el.noteT, el.noteS); A.note.o.set(1); lineIn(A.note, 0.045); }
function noteOut(){ lineOut(A.note); }
function hint(t){ hintRoll.set(t || ''); }

/* haptics: the real one through the bridge (≤1/40 ms, native throttles too) + the visual tick of the prototype */
var lastHaptic = -1;
var HAPTIC = { light: 'light', soft: 'soft', medium: 'medium', rigid: 'rigid', success: 'success', selection: 'selection', warning: 'warning', error: 'error' };
function tick(kind){
  var amp = { light: 1, soft: 0.8, medium: 1.3, rigid: 1.5, success: 1.2, selection: 0.6, warning: 1, error: 1 }[kind] || 1;
  if (!RM) PUL.tick.push({ t: clk, a: amp });
  if (HAPTIC[kind] && clk - lastHaptic >= 0.04 && !(HARNESS && FREEZE)){ lastHaptic = clk; bcall('haptic', { kind: HAPTIC[kind] }).catch(function(){}); }
}
function exposure(a){ if (!RM) PUL.exp.push({ t: clk, a: a }); }
function shock(col, alpha, dur, maxR){ if (!RM) PUL.shock = { t: clk, c: col, a: alpha, d: dur, r: maxR || 1.05 }; }
function rimFlash(a){ if (!RM) PUL.rim.push({ t: clk, a: a }); }
function gulp(pct){ if (!RM) S.gulp.v += pct / peakPerV(S.gulp.cfg, S.gulp.m); }
function sag(){ if (!RM) S.sag.kick(5 / peakPerV(BODY.gulp, S.sag.m)); }
/* any sphere move over 80 px starts with a 120 ms counter-move of 6 px and r −2% */
function moveSphere(cy, r, force){
  var d = Math.abs(cy - S.cy.t);
  if ((d > 80 || force) && !RM){
    var dir = cy > S.cy.x ? 1 : -1;
    S.cy.to(S.cy.x - 6 * dir, 'snap'); S.r.to(S.r.x * 0.98, 'snap');
    S.cy.to(cy, 'soft', null, 0.12); S.r.to(r, 'soft', null, 0.12);
  } else { S.cy.to(cy, 'soft'); S.r.to(r, 'soft'); }
}
function curTint(){ return mixLab(TINT.from, TINT.to, clamp(TINT.mix.x, 0, 1)); }
function tintTo(c, amt, wash, Tr){
  TINT.from = curTint(); TINT.to = c; TINT.mix.cfg = UT(Tr || 0.8); TINT.mix.set(0); TINT.mix.to(1);
  TINT.amt.cfg = UT(Tr || 0.8); TINT.amt.to(amt); TINT.wash.cfg = UT(Tr || 0.8); TINT.wash.to(wash);
}
function tintHome(){ tintTo(ME.tint, ME.id ? ME.cap : 0, ME.id ? 0.12 : 0, 0.8); }
function tintDuck(){ TINT.amt.cfg = UT(0.3); TINT.amt.to(0); TINT.wash.cfg = UT(0.3); TINT.wash.to(0); }
function pillMode(m){ A.mode = m; for (var k in A.modeO) A.modeO[k].tween(k === m ? 1 : 0, k === m ? 0.24 : 0.16, E.fade, k === m ? 0.06 : 0); ariaPill(); }
/* the idle pill: a mic when speech can work, a keyboard when it cannot */
function idleMode(){ var s = SES && SES.mic ? SES.mic.state : 'undetermined'; return (s === 'granted' || s === 'undetermined') ? 'mic' : 'kbd'; }
function ariaPill(){
  var k = A.mode === 'think' ? 'aria.pillCancel' : A.mode === 'stop' ? 'aria.pillStop' : A.mode === 'kbd' ? 'aria.pillType' : 'aria.pill';
  att(el.pill, 'aria-label', tt(k));
}
function pillRest(){ A.press.to(1, 'emit'); A.pillW.to(96, 'pill'); A.glow.tween(0.15, 0.24, E.fade); A.goo.tween(0, 0.2, E.fade); }
