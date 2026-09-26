/* =====================================================================
   14. Render (allocation-free on a settled frame; every write compared first;
   nothing here reads layout: the comet uses a LUT, tethers an analytic length).
   Every literal-T gate of the prototype is a state flag or a stage timestamp.
   ===================================================================== */
var emitBuf = new Float32Array(12), nodeBuf = new Float32Array(9);
var FLAG = { listen: false, talk: false };
var envA = 0, env250 = 0;
function pulseSum(){
  var e = 0, i, p;
  for (i = PUL.exp.length - 1; i >= 0; i--){ p = PUL.exp[i]; var t = clk - p.t; if (t > 0.6){ PUL.exp.splice(i, 1); continue; } e += p.a * (t < 0.06 ? t / 0.06 : 1 - E.exhale((t - 0.06) / 0.52)); }
  return e;
}
function tickScale(){ var s = 0, i, p; for (i = PUL.tick.length - 1; i >= 0; i--){ p = PUL.tick[i]; var t = clk - p.t; if (t > 0.13){ PUL.tick.splice(i, 1); continue; } s += 0.015 * p.a * bump(t / 0.12); } return s; }
function rimBoost(){
  var s = 0, i, p; for (i = PUL.tick.length - 1; i >= 0; i--){ p = PUL.tick[i]; if (clk - p.t < 0.09) s += 0.08 * p.a; }
  for (i = PUL.rim.length - 1; i >= 0; i--){ p = PUL.rim[i]; var t = clk - p.t; if (t > 0.4){ PUL.rim.splice(i, 1); continue; } s += p.a * (1 - E.exhale(t / 0.4)); }
  return s;
}
var X = { tint: [0, 0, 0], scrub: [0, 0, 0], amb: [0, 0, 0], pool: [0, 0, 0], col: [0, 0, 0], save: [0, 0, 0], saveInk: [0, 0, 0], labA: [0, 0, 0], labB: [0, 0, 0],
  neighL: new Float32Array(4), neighR: new Float32Array(4), compXf: new Float32Array(4), emA: new Float32Array(8), emY: new Float32Array(8), emW: new Float32Array(8) };
var SAVE_INK = [0.078, 0.071, 0.063];
function mixCTo(o, a, b, t){ o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; }
function toLabTo(o, rgb){
  var r = s2l(rgb[0]), g = s2l(rgb[1]), b = s2l(rgb[2]);
  var l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  o[0] = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s; o[1] = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s; o[2] = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s; return o;
}
function fromLabTo(o, L){
  var l = L[0] + 0.3963377774 * L[1] + 0.2158037573 * L[2], m = L[0] - 0.1055613458 * L[1] - 0.063854173 * L[2], s = L[0] - 0.0894841775 * L[1] - 1.2914855480 * L[2];
  l = l * l * l; m = m * m * m; s = s * s * s;
  o[0] = l2s(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s); o[1] = l2s(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s); o[2] = l2s(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s); return o;
}
function mixLabTo(o, a, b, t){
  if (t <= 0){ o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; }
  if (t >= 1){ o[0] = b[0]; o[1] = b[1]; o[2] = b[2]; return o; }
  var A1 = toLabTo(X.labA, a), B1 = toLabTo(X.labB, b);
  A1[0] += (B1[0] - A1[0]) * t; A1[1] += (B1[1] - A1[1]) * t; A1[2] += (B1[2] - A1[2]) * t;
  return fromLabTo(o, A1);
}
function curTintTo(o){ return mixLabTo(o, TINT.from, TINT.to, clamp(TINT.mix.x, 0, 1)); }
function mix1(a, b, t){ return a + (b - a) * t; }
/* breath over one normalised period (1.9 / .25 / 2.35 / .30 of 4.8): the temperament changes the period, never the shape */
function breathAt(ph){
  var t = ph * 4.8;
  if (t < 1.9) return -Math.cos(PI * t / 1.9);
  if (t < 2.15) return 1;
  if (t < 4.5){ var u = (t - 2.15) / 2.35, c = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; return 1 - 2 * c; }
  return -1;
}
function FMo(){ return { rel: 0, x: 0, s: 0, o: 0, b: 0, c: 0 }; }
var FM = [FMo(), FMo(), FMo(), FMo(), FMo(), FMo()], FMW = FMo();
function faceMap(k, th, out){ var n = Math.max(1, FACES.length), rel = wrapA(k * TAU / n - th), c = Math.cos(rel); out.rel = rel; out.x = Math.sin(rel); out.s = 0.78 + 0.22 * c; out.o = sstep(0.1, 0.6, c); out.b = (1 - c) * 6; out.c = c; return out; }
function faceW(k, th){ if (k < 0) return 0; var fm = faceMap(k, th, FMW); return fm.o * mix1(U.presence.x, 1, sstep(0.81, 0.95, fm.c)) * U.faceOn.x; }
function satFaceW(k, th){ return k < 0 ? 0 : sstep(0.86, 0.985, faceMap(k, th, FMW).c); }
var SP = { a0: 0, R: 0, sc: 1, dx: 0, dy: 0 }, SAT_PTS = new Float32Array(8), THESES_PT = [73, 200, 317, 200], GHOST_SLOT = [311, 190];
var TETHER_A = [-140 * DEG, -40 * DEG, 90 * DEG], AG_DOT = [[22.5, 195], [367.5, 195], [195, 530.5]];
function rimMask(x, y, cy, r){ var d = Math.sqrt((x - 195) * (x - 195) + (y - cy) * (y - cy)); return sstep(r - 4, r + 12, d); }

function render(){
  if (!S){ return; }
  var i, k;
  var cy = S.cy.x + S.lean.x + S.sag.x, r = S.r.x * (1 + S.gulp.x + tickScale());
  var brK = RM ? 0.3 : U.breathK.x, breath = breathAt(P.bph) * brK, dimK = A.dim.x;

  /* ambient light: its own layer, recoloured only when the 8-bit colour changes */
  var fl = clamp(U.flood.x / 1.1, 0, 1);
  var amb = mixCTo(X.amb, C.ambIdle, VERD.amb, fl);
  tf(el.amb, 0, cy - 325, null); stc(el.amb, '--amb', amb);

  /* tint (OKLab) + the faces' neighbour rim sectors */
  var tintC = curTintTo(X.tint), tintAmt = TINT.amt.x, wash = TINT.wash.x, neighL = X.neighL, neighR = X.neighR;
  neighL[0] = neighL[1] = neighL[2] = neighL[3] = 0; neighR[0] = neighR[1] = neighR[2] = neighR[3] = 0;
  var th = A.th.x, N = FACES.length, fstep = TAU / Math.max(1, N), fpos = th / fstep;
  if (N > 1 && (U.faceOn.x > 0.01 || Math.abs(th) > 0.001)){
    var k0 = Math.floor(fpos), fr = fpos - k0, a0 = ((k0 % N) + N) % N, a1 = (a0 + 1) % N;
    var scrub = mixLabTo(X.scrub, FACES[a0].tint, FACES[a1].tint, fr);
    var fw = U.faceOn.x; mixLabTo(tintC, tintC, scrub, fw);
    var act = Math.round(fpos), ac = ((act % N) + N) % N, pv = FACES[(ac + N - 1) % N].tint, nx = FACES[(ac + 1) % N].tint;
    var drag = fpos - act, pres = U.presence.x * fw;
    neighL[0] = pv[0]; neighL[1] = pv[1]; neighL[2] = pv[2]; neighL[3] = pres * (1 + 2.5 * Math.max(0, -drag));
    neighR[0] = nx[0]; neighR[1] = nx[1]; neighR[2] = nx[2]; neighR[3] = pres * (1 + 2.5 * Math.max(0, drag));
  }

  /* pool: a fixed-size blurred layer scaled with r (never resized) */
  var poolO = 0.14 * sstep(200, 330, cy) * (0.6 + 0.4 * U.energy.x) * dimK * clamp(U.glow.x, 0, 1);
  if (poolO > 0.002){
    mixCTo(X.pool, C.ink2, tintC, clamp(tintAmt / 0.35, 0, 1)); mixCTo(X.pool, X.pool, VERD.c, fl);
    stc(el.pool, 'background', X.pool, 1);
    tf(el.pool, 195 - 0.85 * r, cy + 1.06 * r, r / 120);
  }
  op(el.pool, poolO);

  /* emits (4 slots): satellite meniscus, dimple, comet emit, ghost satellite; the 4 strongest win */
  var ne = 0, emA = X.emA, emY = X.emY, emW = X.emW;
  for (i = 0; i < 4; i++){ var sp = A.sat[i].p.x; if (A.sat[i].on && sp > 0.001 && sp < 0.7){ satPolar(i, SP); emA[ne] = -SP.a0; emY[ne] = 0.035 * bump(clamp(sp / 0.7, 0, 1)); emW[ne] = 0.22; ne++; } }
  if (DU.dimT && clk - DU.dimT < 0.12){ emA[ne] = -PI / 2; emY[ne] = -0.05 * bump(clamp((clk - DU.dimT) / 0.12, 0, 1)); emW[ne] = 0.25; ne++; }
  if (Math.abs(S.cEmit.x) > 0.001){ emA[ne] = -PI / 2; emY[ne] = S.cEmit.x; emW[ne] = 0.16; ne++; }
  if (A.satG.p.x > 0.001 && A.satG.p.x < 0.7 && ne < 8){ emA[ne] = Math.atan2(cy - GHOST_SLOT[1], GHOST_SLOT[0] - 195); emY[ne] = 0.03 * bump(A.satG.p.x / 0.7); emW[ne] = 0.22; ne++; }
  for (i = 0; i < 4; i++){
    var best = -1, bv = -1;
    for (k = 0; k < ne; k++){ var av = Math.abs(emY[k]); if (av > bv){ bv = av; best = k; } }
    if (best < 0){ emitBuf[i * 3] = 0; emitBuf[i * 3 + 1] = 0; emitBuf[i * 3 + 2] = 0.2; continue; }
    emitBuf[i * 3] = emA[best]; emitBuf[i * 3 + 1] = emY[best]; emitBuf[i * 3 + 2] = emW[best];
    for (k = best; k < ne - 1; k++){ emA[k] = emA[k + 1]; emY[k] = emY[k + 1]; emW[k] = emW[k + 1]; } ne--;
  }

  /* ripple: from the bottom rim while listening; a ring on the send */
  var ripA = FLAG.listen ? 0.014 * DU.voice : 0;
  var rs = clk - DU.ripSend; if (rs >= 0 && rs < 0.45 && !RM) ripA = Math.max(ripA, 0.02 * (1 - rs / 0.4));
  if (RM) ripA = 0;

  /* the duel nodes (they loop for as long as the desk takes) */
  for (i = 0; i < 9; i++) nodeBuf[i] = 0;
  var nO = U.nodesO.x;
  if (nO > 0.002 && DU.on){
    var phi = DU.phi, rk = U.radK.x, de = clk - DU.t0;
    for (i = 0; i < 3; i++){
      var orbit = i === 0 ? -PI / 2 + phi : (i === 1 ? -PI / 2 - phi : PI / 2 + 0.38 * Math.sin(0.6 * (de - 1.40)));
      var radi = (i === 2 ? 0.72 : 0.55) * rk;
      var ag = A.ag[i], en = clamp((clk - ag.tIn) / 0.6, 0, 1), ee = E.exhale(en);
      var aS = TETHER_A[i] + wrapA(orbit - TETHER_A[i]) * ee;
      nodeBuf[i * 3] = -aS; nodeBuf[i * 3 + 1] = lerp(0.98, radi, ee); nodeBuf[i * 3 + 2] = RM ? 0 : (clk > ag.tIn ? ee : 0) * nO;
    }
  }

  /* shock / spark */
  var shR = 0, shA = 0, shC = C.pearl;
  if (PUL.shock){ var su = (clk - PUL.shock.t) / PUL.shock.d; if (su < 1.4){ shR = PUL.shock.r * E.exhale(clamp(su, 0, 1)); shA = PUL.shock.a * (1 - clamp(su / 1.4, 0, 1)); shC = PUL.shock.c; } }
  var spA = 0, spAng = 0; if (PUL.spark){ var sk = clk - PUL.spark.t; if (sk < 0.09){ spA = 0.8 * (1 - sk / 0.09); spAng = PUL.spark.a; } }

  /* the companion inside the glass is OFF by product decision (2026-09-26): companions are avatars, the glass stays pure */
  var compMode = 0, compAmt = 0, cxf = X.compXf, sqW = 0, sqI = faceIdx('squad');
  cxf[0] = 0; cxf[1] = 0; cxf[2] = 1.25; cxf[3] = 0;
  if (compReady && COMP_IN_GLASS){
    if (U.compOn.x > 0.002){ compMode = 1; cxf[1] = -0.04 + (2 * breath - 6 * U.compDepth.x) / Math.max(r, 1); cxf[3] = U.compOn.x; compAmt = 0.35 + 0.4 * env250; }
    if (sqI > 0){
      var fm = faceMap(sqI, th, FM[0]); sqW = fm.o * mix1(U.presence.x, 1, sstep(0.81, 0.95, fm.c)) * U.faceOn.x;
      if (sqW > 0.002 && compMode === 0){ compMode = 2; cxf[0] = fm.x * 0.62; cxf[1] = -0.06; cxf[2] = 1.5 * fm.s; cxf[3] = sqW; compAmt = 1; }
    }
  }

  /* GL (the 2D disc stands in while the context is lost) */
  if (gl && !glLost){
    var rp = r * pxk, cyp = (844 - cy) * pxk, cxp = 195 * pxk;
    gl.disable(gl.SCISSOR_TEST); gl.viewport(0, 0, cv.width, cv.height); gl.clear(gl.COLOR_BUFFER_BIT);
    var half = 1.9 * rp;
    gl.enable(gl.SCISSOR_TEST); gl.scissor(Math.max(0, Math.floor(cxp - half)), Math.max(0, Math.floor(cyp - half)), Math.ceil(half * 2), Math.ceil(half * 2));
    gl.uniform2f(loc.uC, cxp, cyp); gl.uniform1f(loc.uR, rp);
    gl.uniform1f(loc.uBreath, breath); gl.uniform1f(loc.uGlobal, FLAG.talk && !PREV.imp ? 0.012 * DU.voice : 0);
    gl.uniform2f(loc.uLean, 0, S.bulge.x); gl.uniform3f(loc.uRipple, -PI / 2, ripA, P.rip * TAU);
    gl.uniform3fv(loc.uEmit, emitBuf); gl.uniform2f(loc.uPull, 0, S.pull.x);
    gl.uniform1f(loc.uEnergy, U.energy.x); gl.uniform1f(loc.uVoice, DU.voice * (FLAG.listen || FLAG.talk ? 1 : 0)); gl.uniform1f(loc.uGlow, U.glow.x);
    gl.uniform1f(loc.uIrid, U.irid.x); gl.uniform1f(loc.uListenIr, U.listenIr.x);
    gl.uniform1f(loc.uTwist, RM ? 0 : P.twist); gl.uniform1f(loc.uTwistOsc, P.twistOsc); gl.uniform1f(loc.uFlow, P.flow); gl.uniform1f(loc.uDrift, P.drift);
    gl.uniform1f(loc.uRot, (P.rot - th) % TAU); gl.uniform1f(loc.uIridPh, P.iridPh); gl.uniform1f(loc.uCioRot, P.cio);
    gl.uniform1f(loc.uSwirlAmt, U.swirl.x); gl.uniform3fv(loc.uNodes, nodeBuf); gl.uniform3f(loc.uNodeDir, 1, -1, 1);
    gl.uniform1f(loc.uSep, U.radK.x); gl.uniform1f(loc.uBraid, U.braid.x);
    gl.uniform3f(loc.uFil, U.filR.x, U.filA.x, P.fil);
    gl.uniform1f(loc.uFlood, U.flood.x); gl.uniform3f(loc.uV, VERD.c[0], VERD.c[1], VERD.c[2]);
    gl.uniform1f(loc.uScrim, U.scrim.x); gl.uniform3f(loc.uVCore, VERD.core[0], VERD.core[1], VERD.core[2]);
    gl.uniform2f(loc.uShock, shR, shA); gl.uniform3f(loc.uShockC, shC[0], shC[1], shC[2]); gl.uniform1f(loc.uExposure, pulseSum());
    gl.uniform3f(loc.uTint, tintC[0], tintC[1], tintC[2]); gl.uniform1f(loc.uTintAmt, Math.min(0.35, tintAmt)); gl.uniform1f(loc.uTintWash, Math.min(0.12, wash));
    gl.uniform4f(loc.uNeighL, neighL[0], neighL[1], neighL[2], neighL[3]); gl.uniform4f(loc.uNeighR, neighR[0], neighR[1], neighR[2], neighR[3]);
    gl.uniform1f(loc.uCompMode, compMode); gl.uniform1f(loc.uCompDepth, compMode === 1 ? U.compDepth.x : 0); gl.uniform1f(loc.uCompAmt, compAmt);
    gl.uniform3f(loc.uCompBg, compBg[0], compBg[1], compBg[2]); gl.uniform4f(loc.uCompXf, cxf[0], cxf[1], cxf[2], cxf[3]);
    gl.uniform2f(loc.uLight, LIGHT.x, LIGHT.y); gl.uniform3f(loc.uAmb, amb[0], amb[1], amb[2]); gl.uniform2f(loc.uSpark, spAng, spA);
    gl.uniform1f(loc.uRimBoost, rimBoost()); gl.uniform1f(loc.uSeed, (clk * 7.31) % 1); gl.uniform1f(loc.uStatic, RM ? 1 : 0);
    gl.uniform1f(loc.uOct, Q.oct); gl.uniform1f(loc.uDisp, Q.disp);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  } else {
    tf(el.fb, 195 - r, cy - r, r / 50); op(el.fb, lerp(0.4, 1, clamp(U.glow.x, 0, 1)));
  }
  tf(el.sphereA, 195 - r, cy - r, r / 120);

  /* the DOM follows the sphere 60–120 ms later */
  var L0 = lagS(60, LAG0);
  op(uiEl, dimK); op(inGlass, dimK);
  var igr = Math.round(r * 100) / 100, igc = Math.round(cy * 100) / 100;
  if (inGlass._r !== igr || inGlass._cy !== igc){ inGlass._r = igr; inGlass._cy = igc; inGlass.style.clipPath = 'circle(' + igr + 'px at 195px ' + igc + 'px)'; }
  renderHeader(); renderGreet(); renderMeri(cy, r); hintRoll.render();
  renderPill(); renderTranscript(cy, r); renderAgents(cy, r); renderSats(cy, r); renderChart(cy, r);
  renderCaption(cy, r); renderVerdict(L0, r); renderCards(cy, r); renderChips(); renderFaces(cy, r, th); renderPerm(cy, r);
  if (TB.shown || A.type.o.x > 0.002) placeTypeBox();
  if (HARNESS) renderGhost();
}

/* ---------- header ---------- */
function renderHeader(){
  var h = A.hdr.x;
  tf(el.wm, 0, A.wmY.x, null); op(el.wm, h * A.wmO.x);
  op(el.avatar, h); op(el.close, A.closeO.x);
  if (A.qT0 < 1e8){
    if (A._qk !== A.qText){ A._qk = A.qText; A._qc = Array.from(A.qText || ''); }
    var n = clamp(Math.floor((clk - A.qT0) / 0.010), 0, A._qc.length);
    if (el.dockQ._n !== n || el.dockQ._q !== A.qText){ el.dockQ._n = n; el.dockQ._q = A.qText; el.dockQ.textContent = A._qc.slice(0, n).join(''); }
  }
  op(el.dockQ, A.dockO.x); op(el.dockA, A.dockAO.x * A.dockO.x);
}
/* ---------- greeting / notes / face text ---------- */
function renderLine(line){
  var i, w;
  for (i = 0; i < line.w.length; i++){ w = line.w[i]; tf(w.el, 0, w.y.x, null); op(w.el, w.o.x); bl(w.el, w.b.x); }
  w = line.s; if (w){ tf(w.el, 0, w.y.x, null); op(w.el, w.o.x); bl(w.el, w.b.x); }
}
function renderGreet(){
  renderLine(A.greet); tf(el.greet, A.greet.x.x, 0, null); op(el.greet, A.greet.o.x);
  renderLine(A.note); op(el.note, A.note.o.x);
  for (var i = 0; i < 2; i++){
    var f = A.ftx[i], root = el.ftx[i], vis = Math.max(f.o.x, f.so.x, f.co.x) > 0.002;
    op(root, vis ? 1 : 0);
    if (!vis) continue;
    tf(el.ftxT[i], f.x.x, 0, null); op(el.ftxT[i], f.o.x); tf(el.ftxS[i], f.sx.x, 0, null); op(el.ftxS[i], f.so.x);
    tf(el.ftxCW[i], 0, -8 * (1 - f.cp.x), null); op(el.ftxCW[i], f.co.x); bl(el.ftxCW[i], 3 * (1 - clamp(f.cp.x, 0, 1)));
    tf(el.ftxC[i], 0, 0, i === A.ftxCur ? A.fchipPress.x : 1);
  }
}
/* ---------- meridian dots on the arc under the sphere (N = faces with content) ---------- */
var MERI_W = new Float32Array(4), MERI_OFF = 'rgba(242,237,228,.28)';
function renderMeri(cy, r){
  var n = FACES.length, i;
  op(el.meriHit, n > 1 && A.meri[0].o.x > 0.5 ? 1 : 0);
  if (n <= 1){ for (i = 0; i < 4; i++) op(el.meri[i], 0); op(el.badge, 0); return; }
  var R = r + 27, fpos = A.th.x / (TAU / n), total = 0;
  for (i = 0; i < n; i++){ var dd = Math.abs(wrapA((fpos - i) * TAU / n)) / (TAU / n); var w = 6 + 14 * Math.max(0, 1 - dd); MERI_W[i] = w; total += w; }
  total += 10 * (n - 1);
  var x = -total / 2, act = ((Math.round(fpos) % n) + n) % n, tI = faceIdx('theses');
  for (i = 0; i < 4; i++){
    if (i >= n){ op(el.meri[i], 0); continue; }
    var m = A.meri[i], w2 = MERI_W[i], s = x + w2 / 2; x += w2 + 10;
    var ang = PI / 2 - s / R, rad = lerp(r, R, clamp(m.p.x, 0, 1.2));
    var px = 195 + Math.cos(ang) * rad, py = cy + Math.sin(ang) * rad;
    var dot = el.meri[i], mk = rimMask(px, py, cy, r), o = m.o.x * mk;
    op(dot, o);
    if (i === tI){ var bo = A.badge.x > 0.01 ? clamp(A.badge.x, 0, 1) * m.o.x * mk * (1 - (w2 - 6) / 14) : 0; op(el.badge, bo); if (bo > 0.002){ stc(el.badge, 'background', FACES[tI].tint); tf(el.badge, px + w2 / 2 - 1, py - 6, clamp(A.badge.x, 0, 1.2)); } }
    if (o < 0.002) continue;
    stU(dot, 'width', w2, 'px');
    tfx(dot, px - w2 / 2, py - 3, 1, 1, (ang - PI / 2) / DEG);
    if (i === act) stc(dot, 'background', FACES[i].tint, 0.9); else st(dot, 'background', MERI_OFF);
  }
  if (tI < 0) op(el.badge, 0);
}
/* ---------- pill ---------- */
function renderPill(){
  var w = A.pillW.x, y = A.pillY.x;
  stU(el.pill, 'width', w, 'px');
  tf(el.pill, 195 - w / 2, y, A.press.x);
  op(el.pill, A.pillO.x);
  var breath = breathAt(P.bph);
  var g = A.glow.x, gIdle = g < 0.2 ? g * (0.8 + 0.2 * -breath) : g;
  var lv = FLAG.listen ? DU.voice : 0, go0 = gIdle * A.pillO.x;
  op(el.micGlow, go0);
  if (go0 > 0.002){
    tfx(el.micGlow, 0, y, lerp(0.42, 1, clamp((w - 96) / 140, 0, 1)) * (0.92 + 0.2 * lv), 0.9 + 0.35 * lv, 0);
    tfx(el.micGlowI, 0, 0, 1, 1, P.conic);
  }
  op(el.pillMic, A.modeO.mic.x); op(el.pillKbd, A.modeO.kbd.x); op(el.pillBars, A.modeO.bars.x); op(el.pillThink, A.modeO.think.x); op(el.pillStop, A.modeO.stop.x);
  op(el.pillGoo, 0.34 * A.goo.x);
  if (A.modeO.bars.x > 0.01){
    for (var b = 0; b < 22; b++){
      var dc = Math.abs(b - 10.5), inT = clamp((clk - A.barsT0 - Math.floor(dc) * 0.008) / 0.12, 0, 1), outT = clamp((clk - A.barsOutT0 - (10 - Math.floor(dc)) * 0.008) / 0.16, 0, 1);
      var lvl = lv * (0.35 + 0.65 * Math.abs(Math.sin(BAR_PH[b] + clk * 9.0))) * (1 - dc / 16);
      var sc = 0.14 + (0.86 * lvl) * E.focus(inT) * (1 - E.fade(outT));
      tr1(el.bars[b], 'scaleY', Math.max(0.14, sc));
    }
    for (var gi = 0; gi < 3; gi++){ var ph = clk * (0.6 + gi * 0.23) + gi * 2.1; attN(el.gb[gi], 'cx', 118 + Math.sin(ph) * 44); attN(el.gb[gi], 'cy', 34 + Math.cos(ph * 1.3) * 5); attN(el.gb[gi], 'r', 14 + 6 * lv + gi * 2); }
  }
  if (A.modeO.think.x > 0.01){ for (var d = 0; d < 3; d++){ var a = (clk / 1.2) * TAU + d * TAU / 3; tf(el.thinkDots[d], Math.cos(a) * 6, Math.sin(a) * 6, null); } }
}
/* ---------- transcript + bead ---------- */
function renderTranscript(cy, r){
  var ws = A.tx.words, n = ws.length, lift = A.tx.lift.x, txO = A.tx.o.x;
  for (var i = 0; i < n; i++){
    var w = ws[i], g = w.g.x;
    tf(w.el, w.dx.x + w.gx * g, w.y.x + w.dy.x + w.rr.x + lift + w.gy * g, 1 - 0.8 * clamp(g, 0, 1));
    op(w.el, w.o.x * w.hide.x * txO * (1 - sstep(0.65, 1, g)));
    bl(w.el, w.b.x + 3 * g);
    st(w.el, 'color', (i === n - 1 && !A.tx.final) ? '#A39C91' : '#F2EDE4');
  }
  var bd = A.bead, u = clamp((clk - bd.fly0) / 0.36, 0, 1), e = E.inhale(u);
  var x1 = 195, y1 = cy + r;
  var bx = bd.x0 + (x1 - bd.x0) * e + 12 * bump(e), by = bd.y0 + (y1 - bd.y0) * e;
  var bo = bd.o.x * rimMask(bx, by, cy, r) * (1 - sstep(0.65, 1, e));
  op(el.bead, bo);
  if (bo > 0.002) tf(el.bead, bx, by, bd.s.x * (1 - 0.75 * sstep(0.65, 1, e)));
  if (u > 0 && u < 1){
    var e2 = E.inhale(Math.max(0, u - 0.09)), tx0 = bd.x0 + (x1 - bd.x0) * e2 + 12 * bump(e2), ty0 = bd.y0 + (y1 - bd.y0) * e2;
    att(el.beadTrail, 'd', 'M' + f2(tx0) + ',' + f2(ty0) + ' L' + f2(bx) + ',' + f2(by));
    var tg = el.trailG; attN(tg, 'x1', tx0); attN(tg, 'y1', ty0); attN(tg, 'x2', bx); attN(tg, 'y2', by);
    op(el.beadTrail, 0.9 * (1 - sstep(0.7, 1, u)));
  } else op(el.beadTrail, 0);
}
/* ---------- agents + tethers: names while the desk works, the real first sentence after ---------- */
function renderAgents(cy, r){
  for (var i = 0; i < 3; i++){
    var a = A.ag[i], root = el.ag[i], vis = a.o.x;
    op(root, vis);
    if (vis > 0.002){
      tf(root, a.dx.x, a.dy.x, null);
      var ws = a.stW;
      for (var k = 0; k < ws.length; k++){ var wu = clamp((clk - a.stT - k * 0.045) / 0.24, 0, 1), we = E.focus(wu); tf(ws[k], 0, 4 * (1 - we), null); op(ws[k], we); bl(ws[k], 2.5 * (1 - we)); }
      if (i === 2){ op(el.cioSw, A.cioSwO.x); op(el.cioVf, A.vfO.x); vfRoll.render(); }
    }
    var p = el.th[i];
    if (a.draw.x <= 0.001){ att(p, 'opacity', '0'); continue; }
    var ang = TETHER_A[i], rx = 195 + Math.cos(ang) * r, ry = cy + Math.sin(ang) * r;
    var dx = AG_DOT[i][0] + a.dx.x, dy = AG_DOT[i][1] + a.dy.x, len;
    if (geoKey(p, rx, ry, dx, dy)){
      if (i < 2){
        var c1x = rx + Math.cos(ang) * 36, c1y = ry + Math.sin(ang) * 36;
        p.setAttribute('d', 'M' + f2(rx) + ',' + f2(ry) + ' C' + f2(c1x) + ',' + f2(c1y) + ' ' + f2(dx) + ',' + f2(dy + 62) + ' ' + f2(dx) + ',' + f2(dy));
        p._len = bezLen(rx, ry, c1x, c1y, dx, dy + 62, dx, dy);
      } else {
        p.setAttribute('d', 'M' + f2(rx) + ',' + f2(ry) + ' L' + f2(dx) + ',' + f2(dy - 3));
        p._len = Math.max(1, Math.sqrt((dx - rx) * (dx - rx) + (dy - 3 - ry) * (dy - 3 - ry)));
      }
    }
    len = p._len;
    attDash(p, len, len + 2);
    attN(p, 'stroke-dashoffset', len * (1 - a.draw.x));
    att(p, 'opacity', '1');
  }
}
/* ---------- satellites: slot vectors from the clearance solver, flown from the rim ---------- */
function satPolar(i, out){
  var s = A.sat[i], k = clamp(A.satLay.x, 0, 1), dx = lerp(s.talk[0], s.chartP[0], k), dy = lerp(s.talk[1], s.chartP[1], k);
  out.a0 = Math.atan2(dy, dx); out.R = Math.sqrt(dx * dx + dy * dy); out.sc = 1; out.dx = dx; out.dy = dy; return out;
}
function placeSat(node, x, y, sc, o, cy, r, inFlight, settled, hw){
  op(node, o);
  if (o < 0.002) return;
  x = clamp(x, 18 + hw * sc, 372 - hw * sc);
  var tlx = x - hw * sc, tly = y - 26 * sc;
  tf(node, tlx, tly, sc);
  if (inFlight){
    var mx = (195 - tlx) / sc, my = (cy - tly) / sc, mr = r / sc;
    var m = 'radial-gradient(circle at ' + f2(mx) + 'px ' + f2(my) + 'px, transparent ' + f2(mr) + 'px, #000 ' + f2(mr + 1.5) + 'px)';
    st(node, 'webkitMaskImage', m); st(node, 'maskImage', m);
  } else { st(node, 'webkitMaskImage', 'none'); st(node, 'maskImage', 'none'); }
  st(node, 'backdropFilter', settled ? 'blur(14px)' : 'none'); st(node, 'webkitBackdropFilter', settled ? 'blur(14px)' : 'none');
}
function renderSats(cy, r){
  var i, orbO = 0, FT = TM.follow * 1000, nOn = 0;
  for (i = 0; i < 4; i++){
    var s = A.sat[i], node = el.sats[i], p = s.p.x;
    satPolar(i, SP); SAT_PTS[i * 2] = SP.dx; SAT_PTS[i * 2 + 1] = SP.dy;
    if (s.on){ orbO += clamp(p, 0, 1); nOn++; }
    if (!s.on || p <= 0.001){ op(node, 0); continue; }
    var dist = Math.sqrt(SP.dx * SP.dx + SP.dy * SP.dy);
    var L = lagS(60 + 60 * Math.min(1, dist / 300) + FT, LAG1);
    var ph = (P.sat + i * 0.27) * TAU;
    var drift = RM ? 0 : Math.sin(ph) * 2.5 * DEG;
    var a = SP.a0 - 0.7 * (1 - clamp(p, 0, 1)) + drift;
    var rad = lerp(L.r * 0.96, SP.R, p) + (RM ? 0 : Math.cos(ph) * 2);
    var x = 195 + Math.cos(a) * rad, y = L.cy + Math.sin(a) * rad;
    var sc = SP.sc * (0.62 + 0.38 * clamp(p, 0, 1));
    var o = clamp(p * 3, 0, 1) * rimMask(x, y, cy, r) * (p < 0.999 && s.p.tw ? sstep(0, 0.35, p) : 1);
    var settled = Math.abs(p - 1) < 0.02 && Math.abs(s.p.v) < 0.02;
    placeSat(node, x, y, sc, o, cy, r, p > 0.001 && !settled, settled, s.hw);
    if (o < 0.002) continue;
    var kIn = clamp((clk - s.tE - 0.12) / 0.2, 0, 1), vIn = clamp((clk - s.tE - 0.18) / 0.24, 0, 1);
    op(el.satK[i], s.tE < 1e8 ? E.fade(kIn) : 0); op(el.satV[i], s.tE < 1e8 ? E.fade(vIn) : 0); bl(el.satV[i], 3 * (1 - E.focus(vIn)));
    el.satOdo[i].render();
  }
  /* orbit ellipse through the slots, drawn from each satellite */
  var oo = (nOn ? orbO / nOn : 0) * A.orbO.x;
  attN(el.orbitE, 'opacity', oo);
  if (oo > 0.001){
    var k = clamp(A.satLay.x, 0, 1), L0 = lagS(90 + FT, LAG2);
    var rx = 1.417 * lerp(127, 122, k), ry = 1.41 * lerp(100, 70, k);
    attN(el.orbitE, 'cy', L0.cy); attN(el.orbitE, 'rx', rx); attN(el.orbitE, 'ry', ry);
    attN(el.orbitE, 'stroke-dashoffset', -P.crawl);
    for (i = 0; i < 4; i++){
      var om = el.om[i];
      if (!A.sat[i].on){ attDash(om, 0, 100); continue; }
      var j = (i + 1) % 4; while (j !== i && !A.sat[j].on) j = (j + 1) % 4;
      var t0 = Math.atan2(SAT_PTS[i * 2 + 1] / ry, SAT_PTS[i * 2] / rx), t1 = Math.atan2(SAT_PTS[j * 2 + 1] / ry, SAT_PTS[j * 2] / rx);
      var p0x = 195 + rx * Math.cos(t0), p0y = L0.cy + ry * Math.sin(t0), p1x = 195 + rx * Math.cos(t1), p1y = L0.cy + ry * Math.sin(t1);
      if (geoKey(om, p0x, p0y, p1x, p1y, rx, ry)){ om.setAttribute('d', 'M' + f2(p0x) + ',' + f2(p0y) + ' A' + f2(rx) + ',' + f2(ry) + ' 0 0 1 ' + f2(p1x) + ',' + f2(p1y)); }
      attDash(om, A.orbDraw.x * 100, 100);
    }
  }
  /* the Desk ghost satellite (saved this session) and the Theses face satellites */
  var th = A.th.x, deskK = U.faceOn.x > 0.01 ? satFaceW(0, th) : 1, dW = faceMap(0, th, FM[1]);
  var gp = A.satG.p.x;
  if (A.satG.on && gp > 0.001){
    var ga = Math.atan2(GHOST_SLOT[1] - cy, GHOST_SLOT[0] - 195), gR = Math.sqrt((GHOST_SLOT[0] - 195) * (GHOST_SLOT[0] - 195) + (GHOST_SLOT[1] - cy) * (GHOST_SLOT[1] - cy));
    var grad = lerp(r * 0.96, gR, gp), gx = 195 + Math.cos(ga) * grad + dW.x * 0.3 * r * U.faceOn.x, gy = cy + Math.sin(ga) * grad;
    placeSat(el.satG, gx, gy, 0.7 + 0.3 * clamp(gp, 0, 1), A.satG.o.x * clamp(gp * 3, 0, 1) * rimMask(gx, gy, cy, r) * deskK, cy, r, gp < 0.98, gp > 0.98 && deskK > 0.9, A.satG.hw);
  } else op(el.satG, 0);
  var tI = faceIdx('theses'), tW = faceMap(Math.max(0, tI), th, FM[2]), thK = satFaceW(tI, th) * U.faceOn.x;
  for (var jj = 0; jj < 2; jj++){
    var ss = A.satT[jj], pp = ss.p.x;
    if (!ss.on || thK <= 0.002 || pp <= 0.001){ op(el.satT[jj], 0); continue; }
    var ptx = THESES_PT[jj * 2], pty = THESES_PT[jj * 2 + 1];
    var aa = Math.atan2(pty - cy, ptx - 195), R2 = Math.sqrt((ptx - 195) * (ptx - 195) + (pty - cy) * (pty - cy));
    var rr2 = lerp(r * 0.96, R2, pp), sx = 195 + Math.cos(aa - 0.5 * (1 - clamp(pp, 0, 1)) * (jj ? 1 : -1)) * rr2 + tW.x * 0.3 * r, sy = cy + Math.sin(aa) * rr2;
    placeSat(el.satT[jj], sx, sy, 1, thK * clamp(pp * 3, 0, 1) * rimMask(sx, sy, cy, r), cy, r, pp < 0.98, pp > 0.98 && thK > 0.9, ss.hw);
  }
}
/* ---------- the chart exhaled from the sphere (times from the comet start) ---------- */
var LINE_T0 = 0.42, NOW_T = 1.82, M0 = 1.90;
function cometS(t){
  var LL = CH.leadL, LN = CH.lineL, vC = 1.12 * LN / (NOW_T - LINE_T0), dLead = LINE_T0;
  if (t < 0) return -1;
  if (t < LINE_T0){ var u = t / dLead, b = Math.max(0, 1 - vC * dLead / LL); return (u + b * u * (1 - u)) * LL; }
  var tau = t - LINE_T0, t1 = 0.88 * LN / vC;
  if (tau < t1) return LL + vC * tau;
  var u2 = clamp((tau - t1) / (0.24 * LN / vC), 0, 1);
  return LL + 0.88 * LN + 0.12 * LN * (2 * u2 - u2 * u2);
}
function renderChart(cy, r){
  var exiting = A.chartExit < 1e8, exitU = clamp((clk - A.chartExit) / 0.42, 0, 1);
  var on = CH && A.chartT0 < 1e8 && !(exiting && exitU >= 1);
  op(el.chart, on ? 1 : 0);
  if (!on) return;
  var t = clk - A.chartT0, s, headO = 0, hx = 0, hy = 0, LL = CH.leadL, LN = CH.lineL;
  if (RM){ s = LL + LN; op(el.chart, clamp(t / 0.24, 0, 1) * (exiting ? 1 - exitU : 1)); }
  else s = cometS(t);
  if (exiting) s = (LL + LN) * (1 - E.inhale(exitU));
  var leadVis = s < 0 ? 0 : Math.min(s, LL), lineVis = Math.max(0, s - LL);
  attDash(el.cLead, leadVis, LL + 10);
  attN(el.cLead, 'opacity', s < 0 || RM ? 0 : (exiting ? 1 : 1 - clamp((t - LINE_T0) / 0.4, 0, 1)));
  attDash(el.cLine, lineVis, LN + 10);
  att(el.cLine, 'opacity', lineVis > 0 ? '1' : '0');
  var g0 = 0.8 * LN; attDash(el.cGlow, 0, g0, Math.max(0, lineVis - g0), LN * 2);
  att(el.cGlow, 'opacity', lineVis > g0 ? '.22' : '0');
  var headOn = !RM && s > 0 && (exiting ? exitU < 1 : t < NOW_T);
  if (headOn && LUT_OK){
    if (s <= LL) lutAt(LUT_LEAD, LL, s, PT); else lutAt(LUT_LINE, LN, Math.min(LN, s - LL), PT);
    hx = PT.x; hy = PT.y; headO = 1; if (exiting) headO *= rimMask(hx, hy, cy, r);
  }
  attN(el.cHead, 'cx', hx); attN(el.cHead, 'cy', hy); attN(el.cHead, 'opacity', headO);
  attN(el.cHeadG, 'cx', hx); attN(el.cHeadG, 'cy', hy); attN(el.cHeadG, 'opacity', headO * 0.8);
  /* the head becomes the NOW dot */
  var nowO = exiting ? 0 : (RM || t >= NOW_T ? 1 : 0);
  attN(el.cNow, 'opacity', nowO); attN(el.cNow, 'r', 3.6 * (RM ? 1 : clamp(A.nowS.x, 0, 1.3)));
  var pu = 0, pr = 3.6;
  if (!RM && !exiting && t >= NOW_T + 0.48){ var per = P.now < 3 ? U.bper.x / 2 : U.bper.x, ph = (P.now % 1) * per / 1.2; if (ph < 1){ pu = 0.7 * (1 - E.exhale(ph)); pr = 3.6 + 10 * E.exhale(ph); } }
  attN(el.cPulse, 'r', pr); attN(el.cPulse, 'opacity', pu);
  /* marks arrive in order after the line: band wipe, label, lines, area; the bracket 0.30 s after the band */
  var mk = exiting ? 1 - clamp(exitU / 0.4, 0, 1) : 1, rmk = RM ? 1 : 0;
  attN(el.bandClipR, 'width', RM ? 350 : 350 * E.data(clamp((t - M0) / 0.42, 0, 1)));
  op(el.cBand, mk * (CH.band ? 1 : 0));
  attN(el.cGrid, 'opacity', Math.max(rmk, E.fade(clamp((t - M0) / 0.3, 0, 1))) * mk);
  attN(el.cBandL, 'opacity', Math.max(rmk, E.fade(clamp((t - M0 - 0.16) / 0.24, 0, 1))) * mk);
  attN(el.cLines, 'opacity', Math.max(rmk, E.fade(clamp((t - M0 - 0.24) / 0.3, 0, 1))) * mk);
  attN(el.cArea, 'opacity', Math.max(rmk, E.fade(clamp((t - M0 - 0.20) / 0.6, 0, 1))) * mk);
  attN(el.cPrice, 'opacity', Math.max(rmk, E.fade(clamp((t - NOW_T - 0.04) / 0.24, 0, 1))) * mk);
  attN(el.cBr, 'opacity', CH.bracket ? Math.max(rmk, E.fade(clamp((t - M0 - 0.30) / 0.2, 0, 1))) * mk : 0);
}
/* ---------- captions: karaoke with a 3-word pulse-sweep front, two slots for page hand-overs ---------- */
function renderCaption(cy, r){
  for (var ci = 0; ci < 2; ci++) renderCap(CAPS[ci], cy, r);
  var mh = capCur >= 0 ? CAPS[capCur].h : 62;
  op(el.meta, A.metaO.x); if (A.metaO.x > 0.002) tf(el.meta, 0, A.capY.x + mh + 12 + A.metaY.x, null);
}
function renderCap(c, cy, r){
  var root = c.el;
  if (c.pg < 0 || c.inT > 1e8){ op(root, 0); return; }
  var inU = clamp((clk - c.inT) / 0.3, 0, 1), top = A.capY.x;
  var outU = clamp((clk - c.outT) / 0.24, 0, 1), sy = 1, ty = RM ? 0 : -8 * (1 - E.exhale(inU)), sx = 1, oo = E.fade(inU);
  if (c.outT < 1e8){
    if (RM) oo *= 1 - outU;
    else {
      var c1 = E.focus(clamp(outU / 0.4, 0, 1)), c2 = E.inhale(clamp((outU - 0.3) / 0.7, 0, 1));
      sy = lerp(1, 0.04, c1); var h = c.h || 62;
      ty = (cy + r * 0.6 - (top + h / 2)) * c2; sx = lerp(1, 0.3, c2);
      oo = (1 - sstep(0.65, 1, outU)) * rimMask(195, top + h / 2 + ty, cy, r * 0.8);
    }
    if (outU >= 1){ op(root, 0); return; }
  }
  op(root, oo);
  if (oo < 0.002) return;
  tfx(root, 0, top + ty, sx, Math.max(0.03, sy), 0);
  var pg = PAGES[c.pg]; if (!pg) return;
  var t = K.t + 0.03, ws = c.spans, n = ws.length, cur = -1, i, g;
  for (i = 0; i < n; i++) if (t >= kWordT(pg.i0 + i).t0) cur = i;
  var curW = cur >= 0 ? kWordT(pg.i0 + cur) : null, nextT = cur >= 0 ? (cur + 1 < n ? kWordT(pg.i0 + cur + 1).t0 : curW.t1) : 0;
  var front = cur < 0 ? -1 : cur + clamp((t - curW.t0) / Math.max(0.12, nextT - curW.t0), 0, 1);
  var vOn = A.vCond.t > 0;
  for (i = 0; i < n; i++){
    g = pg.i0 + i;
    var ti = kWordT(g).t0, k = clamp((t - ti) / 0.2, 0, 1), lit = E.focus(k);
    var pre = (i > front && front >= 0) ? Math.max(0, 1 - (i - front) / 2.5) * 0.12 : 0;
    var o = 0.16 + pre + (0.84 - pre) * lit;
    tf(ws[i], 0, RM ? 0 : 2 * (1 - lit), null); op(ws[i], o); bl(ws[i], RM ? 0 : 2.5 * (1 - lit));
    var br = t >= ti ? Math.exp(-(t - ti) / 0.45) : 0;
    stc(ws[i], 'color', g === VIDX && vOn ? VERD.c : mixCTo(X.col, C.ink, C.inkb, br));
  }
}
/* ---------- verdict word + ring (conviction only when R5 agrees; otherwise a completion ring, no digits) ---------- */
function renderVerdict(L0, rNow){
  var cyV = L0.cy, r = L0.r, cond = A.vCond.x, fs = Math.round(0.62 * r);
  var u = clamp(cond, 0, 1), f = RM ? u : E.focus(u), vo = RM ? u : sstep(0, 0.6, u);
  op(el.vWord, vo);
  if (vo > 0.002){
    stU(el.vWord, 'fontSize', fs, 'px', 1);
    var track = RM ? -0.01 : lerp(0.30, -0.01, f), blur = RM ? 0 : 14 * (1 - f), sc = RM ? 1 : lerp(1.25, 1, f);
    stU(el.vWord, 'letterSpacing', track, 'em', 1000);
    tf(el.vWord, 195 - 120, cyV - fs / 2, sc); if (el.vWord._fo !== fs){ el.vWord._fo = fs; el.vWord.style.transformOrigin = '120px ' + f2(fs / 2) + 'px'; }
    bl(el.vWord, blur);
  }
  var ro = A.ringO.x, R = r + A.ringOff.x, fill = A.ringFill.x;
  op(el.ringG, ro);
  if (ro > 0.002){
    var Cc = TAU * R;
    att(el.rTrack, 'cx', '195'); att(el.rArc, 'cx', '195'); attN(el.rTrack, 'cy', cyV); attN(el.rTrack, 'r', R); attN(el.rArc, 'cy', cyV); attN(el.rArc, 'r', R);
    var cq = Math.round(cyV * 100) / 100; if (el.rArc._rc !== cq){ el.rArc._rc = cq; el.rArc.setAttribute('transform', 'rotate(-90 195 ' + cq + ')'); }
    attDash(el.rArc, Cc * fill, Cc + 4);
    var ha = -PI / 2 + fill * TAU; attN(el.rHead, 'cx', 195 + Math.cos(ha) * R); attN(el.rHead, 'cy', cyV + Math.sin(ha) * R); att(el.rHead, 'opacity', fill > 0.005 && fill < 0.995 ? '1' : '0');
    var lf = clk - A.landT, flash = lf >= 0 && lf < 0.06;
    stc(el.rArc, 'stroke', flash ? VERD.flash : VERD.c); att(el.rArc, 'stroke-width', flash ? '1.6' : '1'); stc(el.rHead, 'fill', VERD.c);
  }
  var conv = READ && READ.model && READ.model.ring.mode === 'conviction';
  var pctO = conv ? A.convO.x * ro : 0;
  op(el.pct, pctO);
  var pp = A.pctPos.x, wordBottom = cyV + fs / 2 + 8;
  op(el.convL, conv ? A.convO.x * (1 - clamp(pp * 2, 0, 1)) * ro : 0);
  if (pctO > 0.002){
    var val = fill * 100, ones = val % 10, tens = Math.floor(val / 10) % 10 + Math.max(0, ones - 9), hund = Math.floor(val / 100);
    tr1(el.d1, 'translateY', -16 * ones); tr1(el.d10, 'translateY', -16 * tens); tr1(el.d100, 'translateY', -16 * Math.min(1, hund));
    op(el.d10P, clamp(val / 10 - 0.6, 0, 1)); op(el.d100P, val >= 99.5 ? 1 : 0);
    stc(el.pct, 'color', VERD.c);
    tf(el.pct, lerp(126.5, 166, pp), lerp(wordBottom, cyV + R + 4, pp), null);
    tf(el.convL, 176.5, wordBottom + 1, null);
  }
}
/* ---------- cards: poured from the bottom rim ---------- */
function renderCards(cy, r){
  for (var i = 0; i < 3; i++){
    var c = el.cards[i], rv = A.rev[i].x, show = A.viewOnly ? i === 1 : i < A.nCards;
    if (!show || (rv < 0.001 && !A.cardsOn)){ op(c, 0); continue; }
    var x = 30 + i * 340 + A.trk.x, dx = Math.abs(x - 30), act = 1 - Math.min(1, dx / 340);
    var sc = 1 - 0.06 * (1 - act), o = 0.6 + 0.4 * act;
    var y = Math.max(244, cy + r + A.ringOff.x + 4 + 18 * clamp(A.pctPos.x, 0, 1) * (READ && READ.model && READ.model.ring.mode === 'conviction' ? 1 : 0)) - 22 * (1 - clamp(rv, 0, 1));
    var co = rv > 0.001 ? o * clamp(rv * 4, 0, 1) : 0;
    op(c, co);
    if (co < 0.002) continue;
    tf(c, x, y, sc);
    if (rv >= 0.999 && !A.rev[i].tw && Math.abs(A.rev[i].v) < 0.01) st(c, 'clipPath', 'none');
    else {
      var R = lerp(0.5 * r, 640, Math.pow(clamp(rv, 0, 1.2), 1.4)), ccx = 195 - x, ccy = (cy + r) - y;
      st(c, 'clipPath', 'circle(' + f2(R / sc) + 'px at ' + f2(ccx / sc + 165 * (1 - 1 / sc)) + 'px ' + f2(ccy / sc + 180 * (1 - 1 / sc)) + 'px)');
    }
  }
  tf(el.card0.inn, 0, -A.dscr.x, null);
  var vc = VC[A.saveC] || VC.wait;
  tf(el.save, 0, 0, A.savePress.x);
  var sv = A.saved.x; stc(el.save, 'background', mixCTo(X.save, C.ink, vc.saveBg, sv)); stc(el.save, 'color', mixCTo(X.saveInk, SAVE_INK, vc.c, sv));
  var swU = clamp((clk - A.sweepT) / 0.5, 0, 1), sa = Math.round(swU * 36000) / 100;
  if (el.saveSw._sa !== sa){ el.saveSw._sa = sa; el.saveSw.style.setProperty('--sa', sa + 'deg'); }
  op(el.saveSw, swU > 0 && swU < 1 ? bump(swU) * 1.4 : 0);
  saveRoll.render();
  op(el.card1.ln, A.lnO.x);
  tf(el.card1.xp, 0, 8 * (1 - A.xp.x), null); op(el.card1.xp, A.xpO.x); bl(el.card1.xp, 3 * (1 - clamp(A.xp.x, 0, 1)));
  /* the thesis pill lifts off the card's top-left and arcs into the sphere */
  if (A.tp.on || A.tp.u.tw){
    var u = A.tp.u.x, x0 = 112, y0 = 236, x1 = 195, y1 = cy;
    var lift = E.exhale(clamp(u / 0.2, 0, 1)) * 10;
    var px = lerp(x0, x1, u) - 26 * bump(u), py = lerp(y0 - lift, y1, u);
    var w = el.tpill._w || (el.tpill._w = el.tpill.offsetWidth || 96);
    tf(el.tpill, px - w / 2, py - 12, lerp(1, 0.25, sstep(0.65, 1, u)));
    op(el.tpill, (1 - sstep(0.65, 1, u)) * rimMask(px, py, cy, r) * clamp(u * 8, 0, 1));
  } else { op(el.tpill, 0); el.tpill._w = 0; }
}
/* ---------- chips born from the pill ---------- */
function renderChipList(list){
  for (var i = 0; i < list.length; i++){
    var c = list[i], p = c.p.x;
    op(c.el, c.o.x);
    if (c.o.x < 0.002) continue;
    var cx0 = 195 - c.w / 2, cy0 = 742;
    tf(c.el, lerp(cx0, c.x + A.chipX.x, p), lerp(cy0, 640, p), lerp(0.6, 1, clamp(p, 0, 1.1)) * c.press.x); bl(c.el, 3 * (1 - clamp(p, 0, 1)));
  }
}
function renderChips(){ tf(el.eyebrow, 0, A.eyebrowY.x, null); op(el.eyebrow, A.eyebrowO.x); renderChipList(A.chips); renderChipList(DYING); }
/* ---------- faces: contents ride the surface ---------- */
function renderFaces(cy, r, th){
  var iI = faceIdx('isla'), fi = faceMap(Math.max(0, iI), th, FM[3]), wi = faceW(iI, th), i;
  op(el.islaG, wi); op(el.islaRing, wi);
  if (wi > 0.002){
    var gs = r * 1.05 / 120;
    tf(el.islaG, 195 - 60 + fi.x * 0.62 * r, cy - 60 - r * 0.02, gs * fi.s); bl(el.islaG, fi.b);
    attN(el.iNew, 'opacity', 0.45 + 0.35 * (0.5 + 0.5 * breathAt(P.bph)));
    var ns = el.islaSeg.length;
    if (ns && geoKey(el.islaRing, r, cy, fi.rel * 100)){
      for (i = 0; i < ns; i++){
        var a0 = -PI / 2 + i * TAU / ns + 0.03 + fi.rel * 0.3, a1 = a0 + TAU / ns - 0.06, R = r + 14;
        el.islaSeg[i].setAttribute('d', 'M' + f2(195 + Math.cos(a0) * R) + ',' + f2(cy + Math.sin(a0) * R) + ' A' + f2(R) + ',' + f2(R) + ' 0 0 1 ' + f2(195 + Math.cos(a1) * R) + ',' + f2(cy + Math.sin(a1) * R));
      }
    }
    if (ISLA_NEW >= 0 && el.islaSeg[ISLA_NEW]) attN(el.islaSeg[ISLA_NEW], 'stroke-opacity', 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(P.bph * TAU * 2)));
  }
  /* Squad belt: the real roster on the top arc at r+34 */
  var sI = faceIdx('squad'), fs = faceMap(Math.max(0, sI), th, FM[5]), ws = faceW(sI, th);
  op(el.belt, ws);
  if (ws > 0.002 && BELT.length){
    var n = BELT.length, k;
    var span = (150 * DEG) * (r + 34), gap = (span - BELT_TOT) / Math.max(1, n - 1), s0 = -span / 2;
    for (k = 0; k < n; k++){
      var bu = A.beltT0 < 1e8 ? clamp((clk - A.beltT0 - k * 0.035) / 0.34, 0, 1) : 0, be = RM ? (bu > 0 ? 1 : 0) : E.exhale(bu);
      var mid = s0 + BELT_SZ[k] / 2, ang = -PI / 2 + mid / (r + 34) + fs.rel * 0.5; s0 += BELT_SZ[k] + gap;
      var brad = lerp(r - 6, r + 34, be);
      var bx = 195 + Math.cos(ang) * brad, by = cy + Math.sin(ang) * brad;
      var bo = (RM ? E.fade(bu / 0.6) : sstep(0, 0.4, bu)) * rimMask(bx, by, cy, r);
      op(BELT[k].el, bo);
      if (bo > 0.002) tf(BELT[k].el, bx - 16, by - 16, BELT_SZ[k] / 32 * lerp(0.6, 1, be));
    }
  }
}
var ISLA_NEW = -1;
/* ---------- the pre-permission card: a clip-circle from the bottom rim ---------- */
function renderPerm(cy, r){
  var b = A.perm.b, g = A.perm.g, p = A.perm.p.x;
  if (b > 1e8 || clk < b || (g < 1e8 && clk > g + 0.6)){ op(el.perm, 0); return; }
  var rx = 150, ry = cy + r - 488, R = lerp(12, 280, clamp(p, 0, 1.1));
  if (RM){ st(el.perm, 'clipPath', 'none'); op(el.perm, clamp(p, 0, 1)); }
  else { var cp = 'circle(' + f2(R) + 'px at ' + rx + 'px ' + f2(ry) + 'px)'; st(el.perm, 'clipPath', cp); st(el.perm, 'webkitClipPath', cp); op(el.perm, clamp(p * 3, 0, 1)); }
  tf(el.permBtn, 0, 0, A.perm.press.x);
  var set = g > 1e8 && clk - b > 0.6; if (el.perm._set !== set){ el.perm._set = set; el.perm.classList.toggle('set', set); }
}
