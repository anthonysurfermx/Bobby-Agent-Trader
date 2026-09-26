
/* ============================================================
   Script: a scripted event track (touch, word, stance, verdict,
   save, swipe) driving one interruptible state machine.
   ============================================================ */
PAGES.o1a.slot = 0; PAGES.o1b.slot = 1; PAGES.o2.slot = 0; PAGES.o3.slot = 1; PAGES.o4.slot = 0;
PAGES.o5a.slot = 1; PAGES.o5b.slot = 0; PAGES.o5c.slot = 1; PAGES.o8.slot = 0;
capShow = function(id){ var s = PAGES[id].slot; W.caps[s] = { id:id, born:T, gone:1e9 }; W.capLast = s; };
capGone = function(t){ var c = W.caps[W.capLast]; if (c) c.gone = t == null ? T : t; };
speakAt = (function(inner){ return function(t){ var c = W.caps[W.capLast]; if (!c || c.gone < t - 0.05) return 0; W.cap = c; return inner(t); }; })(speakAt);

function press(k){ W.pr[k] = [T, 1e9]; hap(0.6); }
function release(k){ if (W.pr[k]) W.pr[k][1] = T; }
function tap(k){ W.pr[k] = [T, T + 0.1]; hap(0.6); }
function later(dt, fn){ W.later.push({ t:T + dt, fn:fn }); }
function nodeIn(i){ W.nodeOn[i] = true; W.nodeAng[i] = [A_ALPHA, A_RED, A_CIO][i]; W.nodeR[i].x = 0.95; to(W.nodeR[i], W.sepR0[i], 'emit'); to(W.nodeGlow[i], 1); }
function nodesOff(){ for (var i = 0; i < 3; i++){ to(W.nodeGlow[i], 0); } }
function converge(d){ W.conv = { t0:T, d:d, r0:[W.nodeR[0].x, W.nodeR[1].x, W.nodeR[2].x] }; }
function dragStart(kind){ var g = ghostAt(T); W.dragging = { kind:kind, t0:T, th0:W.theta.x, gx0:g.x, lx:g.x, lt:T }; }
function dragEnd(){
  var d = W.dragging; W.dragging = null; if (!d) return;
  var g = ghostAt(T), dx = g.x - d.gx0, v = W.theta.v * 0.9 * W.r.x;
  var commit = Math.abs(dx) > 40 || Math.abs(v) > 300;
  var target = commit ? d.th0 + (dx < 0 ? DET : -DET) : d.th0;
  if (d.kind === 'hint') target = d.th0;                           /* the teaching swipe stays below threshold */
  to(W.theta, target, 'glide');
  if (d.kind === 'pick' && commit){
    var k = Math.round(target / DET); W.pick = k; W.pickRoll.push({ i:k, t:T, dir:dx < 0 ? 1 : -1 });
    to(W.belt, k, 'glide'); setPill(null, 'Choose ' + ORDER[k].label, null);
    later(0.32, function(){ gulpK(0.02); hap(0.35); });
  } else if (d.kind === 'hint') later(0.28, function(){ hap(0.35); });
}

var EV = [
  /* O0 first light */
  [0.40, function(){ hap(0.45); }],
  [0.70, function(){ hap(0.28); }],
  [1.00, function(){ to(W.r, 120, 'birth'); to(W.birth, 1); W.energy.x = 0.6; to(W.energy, 0.35); if (RM){ W.r.x = W.r.t = 120; W.birth.x = W.birth.t = 1; W.glow.x = W.glow.t = 1; } }],
  [1.18, function(){ to(W.glow, 1); }],
  [2.00, function(){ tb('wmBig'); }],
  [2.20, function(){ W.birthMass = false; }],
  /* O1 hello */
  [2.80, function(){ tb('wmFly'); }],
  [2.90, function(){ capShow('o1a'); }],
  [4.70, function(){ capGone(); }],
  [4.80, function(){ capShow('o1b'); }],
  [4.95, function(){ crit(W.swirl, 0.4); to(W.swirl, 0.8); to(W.irid, 0.55); }],
  [5.00, function(){ tb('trA'); nodeIn(0); }],
  [5.20, function(){ tb('trR'); nodeIn(1); }],
  [5.40, function(){ tb('trC'); nodeIn(2); W.duel = { t0:T, t1:6.55 }; }],
  [6.40, function(){ tg('trA'); tg('trR', T + 0.06); tg('trC', T + 0.12); }],
  [6.55, function(){ converge(0.7); to(W.energy, 0.6); }],
  [7.05, function(){ expo(0.15); shock(0.8, 0.3, C_IVORY, 0.16); W.vcol = C_IVORY; W.floodAmt = 0.5; crit(W.flood, 0.48); to(W.flood, 1.1); hap(0.8); nodesOff(); }],
  [7.20, function(){ capGone(); }],
  [7.25, function(){ crit(W.swirl, 0.8); to(W.swirl, 0); crit(W.flood, 0.7); to(W.flood, 0); to(W.irid, 1); to(W.energy, 0.35); }],
  /* O2 choose your companion */
  [7.60, function(){ moveSphere(330, 124); W.picker = true; W.theta.x = W.theta.t = 0; W.pick = 0; W.compSil.x = W.compSil.t = 0; W.compDepth.x = 1; to(W.compDepth, 0); to(W.compAmt, 1);
    tintTo(ORDER[0].tintLab, 0.35); W.snowOn = true; W.snowT = T; initSnow(); }],
  [7.70, function(){ tb('prompt'); }],
  [7.80, function(){ tb('belt'); }],
  [8.00, function(){ tb('pname'); W.pickRoll = [{ i:0, t:T, dir:0 }]; setPill('label', 'Choose ' + ORDER[0].label, 180); tb('pillIn'); setHint('Swipe the sphere · Tap to choose'); }],
  [9.00, function(){ dragStart('pick'); }], [9.30, dragEnd],
  [10.20, function(){ dragStart('pick'); }], [10.50, dragEnd],
  [11.40, function(){ dragStart('pick'); }], [11.70, dragEnd],
  [12.60, function(){ dragStart('pick'); }], [12.90, dragEnd],
  [14.60, function(){ press('pill'); }],
  [14.70, function(){ release('pill'); gulpK(0.04); bodyKick(W.hop, -245); hap(1); W.burst = T; setPill('check', null, null); W.chosen = true; }],
  [14.90, function(){ tb('beadsOut'); tb('avaFly'); setHint(''); }],
  [15.20, function(){ to(W.compSil, 1); to(W.compAmt, 0.3); tintTo(companionTint(), 0.35); W.snowOff = T; }],
  [15.02, function(){ tg('pname'); }],             /* the name is inhaled before "Mira it is." takes its slot (no overlap at 490–543) */
  [15.30, function(){ to(W.pillW, 96, 'pill'); }],
  [15.35, function(){ capShow('o2'); }],
  [15.90, function(){ to(W.compAmt, 0); }],
  [16.40, function(){ tg('prompt'); capGone(); }],
  [16.60, function(){ moveSphere(340, 120); W.picker = false; W.thBase = W.theta.t; }],
  /* O3 hold to ask + mic */
  [17.20, function(){ W.title = ['Ask before you trade.', 'Hold the button and talk, or tap a question.']; tb('title'); }],
  [17.40, function(){ setPill('mic', '', 96); }],
  [17.60, function(){ W.chipsSet = 'ask'; tb('chips'); }],
  [19.00, function(){ press('pill'); tg('title'); tg('chips'); to(W.lean, 1); }],
  [19.20, function(){ release('pill'); tb('perm'); }],   /* the card blooms on the finger lift, once the title and sub are ~60% inhaled */
  [20.40, function(){ tap('perm'); }],
  [20.50, function(){ tg('perm'); }],
  [20.90, function(){ W.alert = 'mic'; tb('alert'); }],
  [22.00, function(){ tap('allow'); }],
  [22.10, function(){ tg('alert'); to(W.lean, 0.4); }],
  [22.20, function(){ capShow('o3'); }],
  [23.20, function(){ press('pill'); setPill('listen', '', 236); tb('listen'); moveSphere(340, 132); to(W.lean, 1); setHint('Release to send'); }],
  [23.28, function(){ capGone(); }],
  [25.40, function(){ release('pill'); setPill('mic', '', 96); tg('listen'); setHint(''); to(W.lean, 0); tb('gather'); }],
  [26.20, function(){ W.emitEv = { t:T, ang:-Math.PI / 2, ext:-0.05, d:0.09 }; later(0.09, function(){ gulpK(0.03); ripple(0.02); }); hap(0.5); crit(W.tintAmt, 0.3); to(W.tintAmt, 0); to(W.wash, 0); }],
  [26.25, function(){ tb('dock'); }],
  /* O4 risk notice: hold to agree */
  [26.70, function(){ moveSphere(318, 104); }],
  [26.72, function(){ capShow('o4'); }],
  [26.80, function(){ tb('agreeRing'); }],
  [27.86, function(){ capGone(); }],
  [28.00, function(){ tb('lines'); }],
  [28.30, function(){ tb('notice'); setPill('agree', 'Hold to agree', 196); }],
  [29.00, function(){ press('pill'); W.agree = { t0:T }; }],
  [29.50, function(){ release('pill'); W.agree = { rel:T, p:agreeRaw(T, 29.00) }; }],
  [30.00, function(){ press('pill'); W.agree = { t0:T }; }],
  [31.20, function(){ release('pill'); W.agree = { done:T }; hap(1); kick(W.rimBoost, 0); W.rimBoost.x = 0.15; to(W.rimBoost, 0); crit(W.rimBoost, 0.33);
    tg('lines'); tg('notice'); setPill('think', '', 96); }],
  /* O5 first read */
  [31.60, function(){ tb('burst'); }],
  [31.70, function(){ W.conv = null; W.nodeOn = [false, false, false]; moveSphere(380, 124); crit(W.swirl, 0.9); to(W.swirl, 1); to(W.irid, 0.35); to(W.energy, 0.45); W.duel = { t0:T, t1:34.60 }; }],
  [31.90, function(){ tb('agA'); nodeIn(0); }],
  [32.35, function(){ tb('agR'); nodeIn(1); to(W.energy, 0.52); }],
  [32.80, function(){ tb('agC'); nodeIn(2); to(W.energy, 0.6); }],
  [34.60, function(){ tb('cioRoll'); converge(1.0); to(W.energy, 0.9); }],
  [34.90, function(){ tg('tethers'); }],
  [35.00, function(){ tg('agA'); tg('agR', T + 0.06); tg('agC', T + 0.12); }],
  [35.60, function(){ shock(1.05, 0.35, C_PEARL, 0.18); expo(0.35); hap(0.8); crit(W.braid, 0.48); to(W.braid, 1.1); to(W.wFlow, 0.04); to(W.energy, 0.45); nodesOff(); }],
  [35.78, function(){ to(W.swirl, 0.1); to(W.wFlow, 0.3); }],
  [36.10, function(){ W.filR = 0.8; to(W.filA, 0.7); }],
  [36.20, function(){ moveSphere(330, 96); W.talking = true; setPill('stop', '', 96); }],
  [36.40, function(){ capShow('o5a'); }],
  [36.45, function(){ W.compSil.x = W.compSil.t = 1; W.compDepth.x = 1; to(W.compDepth, 0); W.compShow = true; tb('sats'); }],
  [39.08, function(){ moveSphere(210, 64); capGone(); }],
  [39.20, function(){ capShow('o5b'); }],
  [39.66, function(){ W.preInhale = T; }],
  [39.80, function(){ tb('comet'); W.emitEv = { t:T, ang:-Math.PI / 2, ext:0.117, d:0.42, out:true }; expo(0.10); }],
  [42.92, function(){ capGone(); }],
  [42.95, function(){ tg('sats'); capShow('o5c'); later(0.38, function(){ gulpK(0.01); }); later(0.42, function(){ gulpK(0.01); }); later(0.46, function(){ gulpK(0.01); }); }],
  [43.05, function(){ W.compShow = false; to(W.compDepth, 1); to(W.compAmt, 0); }],
  [43.10, function(){ moveSphere(210, 72); }],
  [43.20, function(){ W.filCollapse = T; }],
  [43.74, function(){ shock(1.05, 0.30, C_CIO, 0.16); expo(0.22); hap(0.5); W.vcol = C_CIO; W.floodAmt = 1; crit(W.flood, 0.48); to(W.flood, 1.1); to(W.braid, 0); to(W.scrim, 1); to(W.filA, 0); W.vflag = true; }],
  [43.77, function(){ tb('verdict'); }],
  [44.02, function(){ tb('ring'); }],
  [45.12, function(){ hap(0.5); }],
  [45.20, function(){ setHint('Conviction = how sure Bobby is in this read'); }],
  [45.80, function(){ W.talking = false; setPill('mic', '', 96); }],
  [45.90, function(){ tb('meta'); }],
  [46.00, function(){ bodyKick(W.sag, 150); }],
  [46.40, function(){ setHint('Pull down for the plan'); }],
  [46.55, function(){ bodyKick(W.sag, 150); }],
  /* O6 save the thesis */
  [46.80, function(){ W.pulling = true; setHint(''); to(W.energy, 0.18); to(W.wFlow, 0.04); }],
  [47.10, function(){ tb('commit'); hap(0.6); capGone(); tg('meta'); }],
  [47.40, function(){ W.pulling = false; to(W.pull, 0, 'gulp'); kick(W.pull, -0.02); moveSphere(158, 44); to(W.reveal, 1, 'glide'); W.reveal.v = Math.max(W.reveal.v, 2.2); tb('present'); }],
  [48.60, function(){ tap('watch'); }],
  [48.70, function(){ tb('saved'); hap(1); }],
  [49.10, function(){ W.alert = 'notif'; tb('alert'); }],
  [49.90, function(){ tap('allow'); }],
  [50.20, function(){ tg('alert'); }],
  [50.40, function(){ tb('tpill'); }],
  [50.92, function(){ gulpK(0.04); hap(0.5); }],
  [51.10, function(){ tg('cards'); tg('verdict'); tg('ring'); tg('present'); tg('dock'); }],
  [51.38, function(){ moveSphere(340, 120); }],
  [51.50, function(){ crit(W.flood, 0.7); to(W.flood, 0); to(W.scrim, 0); crit(W.tintAmt, 0.8); tintTo(companionTint(), 0.35); to(W.energy, 0.35); to(W.wFlow, 0.18); to(W.swirl, 0); to(W.irid, 1); to(W.braid, 0); W.vflag = false; }],
  [52.10, function(){ tb('gsat'); }],
  /* O7 sign in after value */
  [52.80, function(){ tb('sheet'); }],
  [55.60, function(){ tap('notnow'); }],
  [55.70, function(){ tg('sheet'); }],
  [56.20, function(){ gulpK(0.02); }],
  [56.30, function(){ tb('savedTag'); }],
  [58.30, function(){ tg('savedTag'); }],
  /* O8 Isla grew a piece */
  [57.60, function(){ to(W.theta, W.thBase + 0.7, 'glide'); W.peekOn = true; }],
  [57.98, function(){ capShow('o8'); }],
  [58.10, function(){ tb('seed'); hap(0.6); }],
  [58.20, function(){ tb('cap2'); }],
  [59.80, function(){ to(W.theta, W.thBase, 'emit'); capGone(); tg('cap2'); }],
  [60.30, function(){ tb('mer'); }],
  [60.80, function(){ W.peekOn = false; }],
  [61.30, function(){ W.peekOn = true; dragStart('hint'); }],
  [61.60, dragEnd],
  [62.10, function(){ W.peekOn = false; }],
  /* O9 home */
  [62.20, function(){ W.title = ['Good evening.', 'I’m watching NVDA for you.']; tb('title'); }],
  [62.60, function(){ W.chipsSet = 'home'; tb('chips'); }],
  [63.00, function(){ setHint('Hold to ask · Swipe the sphere'); }],
  [65.40, function(){ tb('dim'); }]
];
EV.sort(function(a, b){ return a[0] - b[0]; });

function agreeRaw(t, t0){ var u = (t - t0) / 1.2; if (u >= 1) return 1; var k = 1 - 0.15 / 1.2; return u < k ? u : k + (1 - k) * EXH((u - k) / (1 - k)); }
function agreeP(t){
  var a = W.agree; if (!a) return 0;
  if (a.done != null) return 1;
  if (a.rel != null) return a.p * (1 - FAD(c01((t - a.rel) / 0.3)));
  return agreeRaw(t, a.t0);
}

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
    p.vy += 0.035 * h * W.tpv[TP_MASS]; p.vx += Math.sin(T * 0.7 + p.ph) * 0.01 * h * W.tpv[TP_DRIFT];   /* the snow previews the temperament too */
    var dg = Math.exp(-2.2 * h); p.vx *= dg; p.vy *= dg;
    p.x += p.vx * h; p.y += p.vy * h;
    var d = Math.sqrt(p.x * p.x + p.y * p.y);
    if (d > 0.9){ var nx = p.x / d, ny = p.y / d, vn = p.vx * nx + p.vy * ny; if (vn > 0){ p.vx -= 1.6 * vn * nx; p.vy -= 1.6 * vn * ny; } p.x = nx * 0.9; p.y = ny * 0.9; }
  }
}

/* ---------- one fixed simulation step ---------- */
function fire(){ while (evI < EV.length && EV[evI][0] <= T){ EV[evI][1](); evI++; }
  if (W.later.length){ var L = W.later, n = 0; for (var i = 0; i < L.length; i++){ if (L[i].t <= T) L[i].fn(); else L[n++] = L[i]; } L.length = n; } }
function sim(h){
  T += h;
  fire();
  var rmK = RM ? 0.25 : 1, g = ghostAt(T), i;
  if (W.pend && T >= W.pend.t){ to(W.cy, W.pend.cy, W.pend.nm); to(W.r, W.pend.r, W.pend.nm); W.pend = null; }

  /* gestures: tracked values follow the finger with zero latency */
  if (W.dragging){
    var d = W.dragging, R = Math.max(40, W.r.x), nx = d.th0 + (d.gx0 - g.x) / (0.9 * R);
    W.theta.v = (nx - W.theta.x) / h; W.theta.x = nx; W.theta.t = nx;
  }
  if (W.pulling){
    var dy = Math.max(0, g.y - 600), rub = (1 - 1 / (dy * 0.55 / 260 + 1)) * 260;
    var pv = Math.min(0.14, rub * 0.0009); W.pull.v = (pv - W.pull.x) / h; W.pull.x = pv; W.pull.t = pv;
    var rv = c01(rub / 72) * 0.3; W.reveal.v = (rv - W.reveal.x) / h; W.reveal.x = rv; W.reveal.t = rv; W.rub = rub;
  }

  /* the picker drag fraction: the tint AND the temperament preview both follow it 1:1, blended between neighbours */
  var inPick = W.picker && !W.chosen, kf = 0, k0 = 0, k1 = 0;
  if (inPick){ kf = clamp(W.theta.x / DET, 0, NPICK - 1); k0 = Math.floor(kf); k1 = Math.min(NPICK - 1, k0 + 1); }

  /* tint: scrubbed 1:1 with the rotation in the picker and on the Isla peek (OKLab) */
  if (inPick){ tintSnap(mixLabTo(TMP_LAB, ORDER[k0].tintLab, ORDER[k1].tintLab, kf - k0)); }
  else if (W.peekOn || Math.abs(W.theta.x - W.thBase) > 0.002 && T > 57){
    var fr = clamp((W.theta.x - W.thBase) / DET, 0, 1); tintSnap(mixLabTo(TMP_LAB, companionTint(), ISLA_LAB, fr));
    to(W.nb, 0.25 + 0.75 * fr); to(W.wash, 0.12 * fr);
  } else if (T > 57){ to(W.nb, 0); to(W.wash, 0); }

  /* temperament (§2.1): the focused companion while picking (its neighbour blended in by the drag), the chosen one
     after the choice, neutral before anyone lives in the glass. The vector is sprung (T .45 s), so the breath period
     glides and the single breath phase never jumps. It reaches the sphere body, the breath, drift and idle flow only. */
  var ta = TV.none, tb2 = TV.none, tw = 0, tpv = W.tpv;
  if (inPick){ ta = TV[ORDER[k0].palette]; tb2 = TV[ORDER[k1].palette]; tw = kf - k0; }
  else if (W.chosen && ORDER[CHOSEN]){ ta = tb2 = TV[ORDER[CHOSEN].palette]; }
  for (i = 0; i < TP_N; i++){ W.tp[i].t = lerp(ta[i], tb2[i], tw); tpv[i] = W.tp[i].x; }
  var m = W.birthMass ? 1 : Math.max(0.36, W.r.x / 122);
  temperBody(W.cy, m, tpv); temperBody(W.r, m, tpv);
  temperBody(W.gulp, 1, tpv); temperBody(W.sag, 1, tpv); temperBody(W.hop, 1, tpv); temperBody(W.lean, 1, tpv);
  W.period = tpv[TP_BREATH];

  /* voice (user) and speech (Bobby) envelopes */
  var vt = tmB('listen') <= T && tmG('listen') > T ? voiceAt(T) : 0;
  W.voice += (vt - W.voice) * (1 - Math.exp(-h / (vt > W.voice ? 0.035 : 0.16)));
  var et = speakAt(T);
  W.env += (et - W.env) * (1 - Math.exp(-h / (et > W.env ? 0.035 : 0.16)));
  W.env250 += (W.env - W.env250) * (1 - Math.exp(-h / 0.25));
  if (tmB('listen') <= T && tmG('listen') > T) W.energy.t = 0.5 + 0.4 * W.voice;
  else if (W.talking) W.energy.t = 0.38 + 0.45 * W.env;
  if (W.compShow) W.compAmt.t = 0.35 + 0.4 * W.env250;

  /* the debate: nodes orbit, converge, and throw sparks at each crossing */
  var df = W.duel ? c01((T - W.duel.t0) / Math.max(0.5, W.duel.t1 - W.duel.t0)) : 0;
  var w0 = [lerp(1.6, 2.6, df), -lerp(1.6, 2.6, df), 0.6];
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
  W.sep = W.conv ? c01(W.nodeR[0].x / Math.max(0.01, W.conv.r0[0])) : (W.swirl.x > 0.01 ? 1 : 1);
  if (W.nodeOn[0] && W.nodeOn[1] && !W.conv){
    var rel = wrapPi(W.nodeAng[0] - W.nodeAng[1]);
    if (W.lastRel != null && Math.abs(rel) < 1 && (rel > 0) !== (W.lastRel > 0)){ expo(0.12, 0.02, 0.09); if (!RM) W.spark = { t:T, ang:W.nodeAng[0] }; }
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

  if (W.snowOn) stepSnow(h);
  stepSprings(h / 2); stepSprings(h / 2);   /* 1/240 s substeps */

  /* sphere history: DOM children follow the sphere 60–120 ms later (a fixed ring: no per-step allocation) */
  W.hT[W.hI] = T; W.hC[W.hI] = W.cy.x; W.hR[W.hI] = W.r.x; W.hI = (W.hI + 1) % HN; if (W.hN < HN) W.hN++;
}
var DLY = { cy:0, r:0 };   /* reused result */
function delayed(ms){
  var t = T - ms / 1000, n = W.hN, j = 0;
  if (!n){ DLY.cy = W.cy.x; DLY.r = W.r.x; return DLY; }
  for (var k = 1; k <= n; k++){ j = (W.hI - k + HN) % HN; if (W.hT[j] <= t){ DLY.cy = W.hC[j]; DLY.r = W.hR[j]; return DLY; } }
  DLY.cy = W.hC[j]; DLY.r = W.hR[j]; return DLY;     /* older than the ring: the oldest sample */
}
function resetAll(){ W = world(); W.thBase = 0; W.pull = S(0, 'gulp'); W.caps = [null, null]; W.capLast = 0; W.later = []; W.pr = {}; T = 0; evI = 0; }
