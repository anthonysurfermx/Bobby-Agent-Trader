
/* ============================================================
   One fixed simulation step (1/120 s, two 1/240 s spring
   substeps). Input and bridge events are read here, in the same
   step, so the glass answers the finger with zero latency.
   ============================================================ */
/* ---------- snow (60 flakes, clipped to the glass; reacts to the swipe velocity) ---------- */
function initSnow(){
  var rnd = prng(7), f = [];
  for (var i = 0; i < 60; i++){ var a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 0.88; f.push({ x:Math.cos(a) * rr, y:Math.sin(a) * rr, vx:0, vy:0, s:1 + rnd() * 1.5, o:0.25 + rnd() * 0.5, ph:rnd() * 6.28 }); }
  W.snow = f;
}
function stepSnow(h){
  var f = W.snow; if (!f) return;
  var om = W.theta.v, burst = W.burst && T - W.burst < 0.05;
  for (var i = 0; i < f.length; i++){
    var p = f[i];
    p.vx += (-om * p.y * 0.8) * h * 3.0; p.vy += (om * p.x * 0.8) * h * 3.0;
    if (burst){ p.vy -= 0.9 + (i % 7) * 0.08; p.vx += ((i % 5) - 2) * 0.12; }
    p.vy += 0.035 * h * W.tpv[TP_MASS]; p.vx += Math.sin(T * 0.7 + p.ph) * 0.01 * h * W.tpv[TP_DRIFT];
    var dg = Math.exp(-2.2 * h); p.vx *= dg; p.vy *= dg;
    p.x += p.vx * h; p.y += p.vy * h;
    var d = Math.sqrt(p.x * p.x + p.y * p.y);
    if (d > 0.9){ var nx = p.x / d, ny = p.y / d, vn = p.vx * nx + p.vy * ny; if (vn > 0){ p.vx -= 1.6 * vn * nx; p.vy -= 1.6 * vn * ny; } p.x = nx * 0.9; p.y = ny * 0.9; }
  }
}

var MOCK_CLOCK = false;   /* true when the dev mock runs on this sim clock (determinism) */
function sim(h){
  T += h;
  if (MOCK_CLOCK) BR.mock.pump();
  cueStep();
  if (HARNESS) harnessStep(h);
  lineStep();
  var rmK = RM ? 0.25 : 1, i;
  if (W.pend && T >= W.pend.t){ to(W.cy, W.pend.cy, W.pend.nm); to(W.r, W.pend.r, W.pend.nm); W.pend = null; }

  /* gestures: tracked values follow the finger in the same step; springs take over on release with its velocity */
  var d = W.drag;
  if (d && d.kind === 'pick' && NPICK){
    var R = Math.max(40, W.r.x), mx = (NPICK - 1) * DET, nx = d.th0 + (d.x0 - d.x) / (0.9 * R), cl = clamp(nx, 0, mx);
    nx = cl + (nx - cl) * 0.35;                                   /* rubber band past the first and last companion */
    W.theta.v = (nx - W.theta.x) / h; W.theta.x = nx; W.theta.t = nx;
  } else if (d && d.kind === 'track'){
    var nt = d.tr0 + (d.x0 - d.x) / 340, ct = clamp(nt, 0, Math.max(0, CARDS.length - 1));
    nt = ct + (nt - ct) * 0.3; W.track.v = (nt - W.track.x) / h; W.track.x = nt; W.track.t = nt;
  } else if (d && d.kind === 'scroll'){
    DSCROLL.y = clamp(d.s0 + (d.y0 - d.y), 0, DSCROLL.max);
  }
  if (W.pulling){
    var dy = Math.max(0, W.pullY - W.pullY0), rub = (1 - 1 / (dy * 0.55 / 260 + 1)) * 260;
    var pv = Math.min(0.14, rub * 0.0009); W.pull.v = (pv - W.pull.x) / h; W.pull.x = pv; W.pull.t = pv;
    var rv = c01(rub / 72) * 0.3; W.reveal.v = (rv - W.reveal.x) / h; W.reveal.x = rv; W.reveal.t = rv; W.rub = rub;
    if (rub >= 72 && !W.pullCommitted) pullCommit();
  }

  /* the picker drag fraction: the tint AND the temperament preview both follow it 1:1, blended between neighbours */
  var inPick = W.picker && !W.chosen && NPICK > 0, kf = 0, k0 = 0, k1 = 0;
  if (inPick){ kf = clamp(W.theta.x / DET, 0, NPICK - 1); k0 = Math.floor(kf); k1 = Math.min(NPICK - 1, k0 + 1); }
  if (inPick) tintSnap(mixLabTo(TMP_LAB, PICKS[k0].art.tintLab, PICKS[k1].art.tintLab, kf - k0));
  else if (W.peekOn){
    var fr = clamp((W.theta.x - W.thBase) / DET, 0, 1); tintSnap(mixLabTo(TMP_LAB, companionTint(), ISLA_LAB, fr));
    to(W.nb, 0.25 + 0.75 * fr); to(W.wash, 0.12 * fr);
  } else if (W.nb.t > 0){ to(W.nb, 0); to(W.wash, 0); }

  /* temperament (DIRECTION §2.1): the focused companion while picking, the chosen one after, neutral before anyone */
  var ta = TV.none, tb2 = TV.none, tw = 0, tpv = W.tpv;
  if (inPick){ ta = TV[PICKS[k0].art.palette]; tb2 = TV[PICKS[k1].art.palette]; tw = kf - k0; }
  else if (W.chosen && CHOSEN_ART){ ta = tb2 = TV[CHOSEN_ART.palette]; }
  for (i = 0; i < TP_N; i++){ W.tp[i].t = lerp(ta[i], tb2[i], tw); tpv[i] = W.tp[i].x; }
  var m = W.birthMass ? 1 : Math.max(0.36, W.r.x / 122);
  temperBody(W.cy, m, tpv); temperBody(W.r, m, tpv);
  temperBody(W.gulp, 1, tpv); temperBody(W.sag, 1, tpv); temperBody(W.hop, 1, tpv); temperBody(W.lean, 1, tpv);
  W.period = tpv[TP_BREATH];

  /* audio drives the glass: the user's mic level while listening, Bobby's voice level (or its karaoke envelope) */
  var listening = W.state === 'LISTENING' && isOn('listen');
  var vt = listening ? (T - W.micLevelT < 0.3 ? W.micLevel : 0.04) : 0;
  W.voice += (vt - W.voice) * (1 - Math.exp(-h / (vt > W.voice ? 0.035 : 0.16)));
  var et = speakEnv();
  W.env += (et - W.env) * (1 - Math.exp(-h / (et > W.env ? 0.035 : 0.16)));
  W.env250 += (W.env - W.env250) * (1 - Math.exp(-h / 0.25));
  if (listening) W.energy.t = 0.5 + 0.4 * W.voice;
  else if (W.talking) W.energy.t = 0.38 + 0.45 * W.env;
  else if (inPick && T - W.pvLevelT < 0.3) W.energy.t = 0.35 + 0.25 * W.pvLevel;
  if (W.compShow) W.compAmt.t = 0.35 + 0.4 * W.env250;

  /* live beats that wait on time or on the finger */
  if (W.agree && W.agree.t0 != null && W.agree.done == null){
    if (agreeRaw(T, W.agree.t0) >= 1) agreeComplete();
    else if (T - W.agreeTick >= 0.15){ W.agreeTick = T; fire('haptic', { kind:'soft' }); }
  }
  if (W.state === 'THINK_WAIT'){ thinkHints(); if (W.reply && T - W.stT >= W.floor) go('THINK_RESOLVE'); }
  if (W.state === 'LISTENING' && W.awaitFinal && T > W.awaitFinal){
    W.awaitFinal = 0; var last = W.qw.map(function(w){ return w.text; }).join(' ');
    onSpeechFinal(last);                                           /* no final within 1.5 s (+1 s grace): the last partial */
  }
  verdictStep();
  W.closeK.t = closeActive() ? 1 : 0;   /* the × shows only while it does something */

  /* the debate: nodes orbit (ω 1.6→2.6 over 0.8 s, then ±12% on 2B), converge, and throw sparks at each crossing */
  var df = W.duel ? c01((T - W.duel.t0) / 0.8) : 0, mod = W.duel ? 1 + 0.12 * Math.sin(Math.PI * W.bph) : 1;
  var w0 = [lerp(1.6, 2.6, df) * mod, -lerp(1.6, 2.6, df) * mod, 0.6];
  for (i = 0; i < 3; i++){
    if (!W.nodeOn[i]) continue;
    var wi = w0[i];
    if (W.conv){
      var u = c01((T - W.conv.t0) / W.conv.d), r0 = W.conv.r0[i], rn = r0 * (1 - INH(u));
      W.nodeR[i].x = W.nodeR[i].t = rn; W.nodeR[i].v = 0;
      wi = Math.sign(wi) * Math.min(9, Math.abs(wi) * Math.pow(r0 / Math.max(rn, 1e-3), 0.8));
    }
    W.nodeW[i] = wi; W.nodeAng[i] += wi * h * rmK;
  }
  W.sep = W.conv ? c01(W.nodeR[0].x / Math.max(0.01, W.conv.r0[0])) : 1;
  if (W.nodeOn[0] && W.nodeOn[1] && !W.conv){
    var rel = wrapPi(W.nodeAng[0] - W.nodeAng[1]);
    if (W.lastRel != null && Math.abs(rel) < 1 && (rel > 0) !== (W.lastRel > 0)){
      W.crossN++;
      var long = W.state === 'THINK_WAIT' ? T - W.thinkT : 0;
      if (!(long >= 30 && W.crossN % 2)){ expo(long >= 15 ? 0.06 : 0.12, 0.02, 0.09); if (!RM) W.spark = { t:T, ang:W.nodeAng[0] }; }
    }
    W.lastRel = rel;
  } else W.lastRel = null;

  /* integrated phases (never time × state in the shader) */
  W.twist += h * 0.5 * W.swirl.x * rmK;
  W.twistOsc += h * 0.8 * rmK;
  W.flow += h * W.wFlow.x * rmK;
  W.flowA += h * 0.9 * W.wFlow.x * rmK; W.flowR += h * 2.2 * W.wFlow.x * rmK; W.cioRot += h * 0.2 * rmK;
  W.drift += h * 0.11 * tpv[TP_DRIFT] * rmK;
  W.rot += h * 0.05 * tpv[TP_FLOW] * rmK;
  W.iridPh += h * 0.012 * tpv[TP_FLOW] * rmK;
  W.filAng += h * 0.5 * rmK;
  W.bph += h / tpv[TP_BREATH];               /* ONE breath clock: the period changes, the phase is only ever integrated */
  W.ripPh = (W.ripPh || 0) + h * 10;
  if (W.twistOsc > 6.2832) W.twistOsc -= 6.2832;
  if (W.bph > 1000) W.bph -= 1000;
  if (W.ripPh > 1000) W.ripPh -= 1000;

  if (W.snowOn) stepSnow(h);
  stepSprings(h / 2); stepSprings(h / 2);   /* 1/240 s substeps */
  /* a tracked value stays exactly under the finger (the integrator must not carry it past); springs resume on release */
  if (d && d.kind === 'pick'){ W.theta.x = W.theta.t; }
  else if (d && d.kind === 'track'){ W.track.x = W.track.t; }
  if (W.pulling){ W.pull.x = W.pull.t; W.reveal.x = W.reveal.t; }

  /* sphere history: DOM children follow the sphere 60–120 ms later (a fixed ring: no per-step allocation) */
  W.hT[W.hI] = T; W.hC[W.hI] = W.cy.x; W.hR[W.hI] = W.r.x; W.hI = (W.hI + 1) % HN; if (W.hN < HN) W.hN++;
}
var DLY = { cy:0, r:0 };   /* reused result */
function delayed(ms){
  var t = T - ms / 1000, n = W.hN, j = 0;
  if (!n){ DLY.cy = W.cy.x; DLY.r = W.r.x; return DLY; }
  for (var k = 1; k <= n; k++){ j = (W.hI - k + HN) % HN; if (W.hT[j] <= t){ DLY.cy = W.hC[j]; DLY.r = W.hR[j]; return DLY; } }
  DLY.cy = W.hC[j]; DLY.r = W.hR[j]; return DLY;
}
