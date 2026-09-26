
/* ============================================================
   Render: the sphere leads, DOM follows 60–120 ms later.
   ============================================================ */
function breathV(ph){
  var x = ph - Math.floor(ph);
  if (x < 0.396) return -Math.cos(Math.PI * x / 0.396);
  if (x < 0.448) return 1;
  if (x < 0.938){ var u = (x - 0.448) / 0.490, e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; return 1 - 2 * e; }
  return -1;
}
var HAP = { s:0, r:0 };   /* reused result */
function hapNow(){
  var s = 0, r = 0;
  for (var i = W.haps.length - 1; i >= 0; i--){ var h = W.haps[i], u = T - h.t; if (u > 0.2) break; if (u >= 0 && u < 0.12) s = Math.max(s, h.a * Math.sin(Math.PI * u / 0.12)); if (u >= 0 && u < 0.09) r = Math.max(r, h.a); }
  if (W.agree && W.agree.t0 != null && W.pr.pill && W.pr.pill[1] > T){ var p = agreeP(T); r = Math.max(r, lerp(0.15, 0.55, p) * (0.6 + 0.4 * Math.sin(T * 38))); }
  HAP.s = RM ? 0 : s; HAP.r = RM ? r * 0.5 : r; return HAP;
}
function expoNow(){ var e = 0; for (var i = 0; i < W.expo.length; i++){ var x = W.expo[i], u = T - x.t; if (u < 0 || u > x.r + x.d * 2) continue; e += x.a * (u < x.r ? u / x.r : Math.exp(-(u - x.r) / (x.d / 3))); } return e; }
function aria(s){ if (cv._al !== s){ cv._al = s; cv.setAttribute('aria-label', s); } }

var SPH = { cy:340, r:120, dcy:340, dr:120 };     /* live and delayed sphere, shared by the DOM passes */
var seedEl = $('seed'), poolEl = $('pool'), POOL_C = [0.55, 0.45, 0.95];
var AMB_LAB = [0, 0, 0], AMB_RGB = [0, 0, 0], TINT_RGB = [0, 0, 0], XA = [0, 0, 0, 0], XB = [0, 0, 0, 0], BG0 = [0.16, 0.16, 0.16];   /* reused per frame */
function renderSphere(){
  var hp = hapNow(), cy = W.cy.x + W.sag.x + 6 * W.lean.x, r = Math.max(0.5, W.r.x * W.gulp.x * (1 + 0.015 * hp.s));
  var pre = W.preInhale != null ? T - W.preInhale : -1, preK = pre >= 0 && pre < 0.14 ? Math.sin(Math.PI * pre / 0.14) : 0;
  r *= 1 - 0.015 * preK;
  var dl = delayed(90 + 1000 * W.tpv[TP_FOL]);          /* lava is viscous: +80 ms follow-through */
  SPH.cy = cy; SPH.r = r; SPH.dcy = dl.cy + W.sag.x + 6 * W.lean.x; SPH.dr = dl.r * W.gulp.x;
  var presenting = tmB('present') <= T && tmG('present') > T;
  var br = breathV(W.bph) * (RM ? 0.3 : 1) * (presenting ? 0.5 : 1);
  var fl = W.flood.x, dim = tmB('dim') <= T ? c01((T - tmB('dim')) / 0.4) : 0;
  var vW = W.vflag ? c01(fl) : 0;
  mixLabTo(AMB_LAB, AMB_IDLE, AMB_WAIT, vW); var ambC = labRgbTo(AMB_RGB, AMB_LAB[0], AMB_LAB[1], AMB_LAB[2]);
  var syv = f1(cy) + 'px', amv = css(ambC);
  if (stage._sy !== syv){ stage._sy = syv; stage.style.setProperty('--sy', syv); }
  if (stage._amb !== amv){ stage._amb = amv; stage.style.setProperty('--amb', amv); }

  /* launch point: 4 px, 12 px bloom, two heartbeats, then it ignites */
  var hb = 0, hu = (T - 0.40) / 0.3; if (hu > 0 && hu < 1) hb = Math.sin(Math.PI * hu);
  hu = (T - 0.70) / 0.3; if (hu > 0 && hu < 1) hb = Math.max(hb, Math.sin(Math.PI * hu));
  var seedO = c01(T / 0.4) * (1 - sstep(1.0, 1.22, T));
  st(seedEl, seedO > 0 ? tf(195, 340, 1 + 0.6 * hb * TR) : null, seedO);

  /* ground pool */
  var tintRGB = labRgbTo(TINT_RGB, W.tl.x, W.ta.x, W.tb.x);
  var pool = poolEl, pr = 0.85 * r, pc = W.tintAmt.x > 0.05 ? tintRGB : POOL_C, poolO = 0.14 * sstep(200, 330, cy) * (0.6 + 0.4 * W.energy.x) * (1 - dim);
  if (poolO > 0.003){ sc(pool, 'background', css(pc)); sc(pool, 'width', f1(pr * 2) + 'px'); sc(pool, 'height', f1(0.32 * r) + 'px'); }
  st(pool, poolO > 0.003 ? tf(195 - pr, cy + 1.22 * r - 0.16 * r) : null, poolO);

  /* canvas opacity: reduced-motion birth is a 400 ms crossfade; the loop end dims to black */
  var cvo = (RM ? c01((T - 1.0) / 0.4) : 1);
  st(cv, null, cvo);

  var rimHard = T < 1.6 ? 0 : FOC(c01((T - 1.6) / 0.6)), spec = c01((T - 2.28) / 0.08);
  if (RM && T >= 1.0){ rimHard = 1; spec = 1; }
  var sh = W.shock, shR = 0, shA = 0, shC = C_PEARL;
  if (sh){ var su = (T - sh.t) / sh.d; if (su >= 0 && su < 1.6){ shR = sh.r1 * EXH(c01(su)); shA = sh.a * (1 - EXH(c01(su / 1.6))); shC = sh.col; } }
  var ripA = 0; if (W.rip){ var ru = T - W.rip.t; if (ru >= 0) ripA = W.rip.a * Math.exp(-ru / 0.4 * 3); }
  var listening = tmB('listen') <= T && tmG('listen') > T;
  if (listening && !RM) ripA += 0.014 * W.voice;
  var em = W.emitEv, emA = -Math.PI / 2, emX = 0;
  if (em){ var eu = (T - em.t) / em.d; if (eu >= 0){
    if (!em.out){ emX = eu < 1 ? em.ext * Math.sin(Math.PI * eu) : 0; }
    else { var x = 14 / Math.max(20, W.r.x); emX = eu < 0.25 ? x * EXH(eu / 0.25) : x * Math.exp(-(eu - 0.25) * 8) * Math.cos((eu - 0.25) * 26); }
    emA = em.ang; } }
  /* satellites push a meniscus as they leave */
  var sb = tmB('sats'); for (var si = 0; si < 3; si++){ var su2 = T - (sb + 0.07 * si); if (su2 >= 0 && su2 < 0.22){ emX = 0.03 * Math.sin(Math.PI * su2 / 0.22); emA = -SAT_A[si]; } }
  if (RM) emX = 0;
  var filR = W.filR, filA = W.filA.x;
  if (W.filCollapse != null){ var fu = c01((T - W.filCollapse) / 0.45); filR = 0.8 * (1 - INH(fu)); filA *= 1 - sstep(0.8, 1, fu); }
  var spk = 0, spA = 0; if (W.spark){ var ku = T - W.spark.t; if (ku >= 0 && ku < 0.09){ spk = 0.9 * (1 - ku / 0.09); spA = W.spark.ang; } }
  var bulge = 0.02 * W.lean.x + 0.03 * preK;

  /* companion transforms (identity in the picker, silhouette while talking) */
  var kA = CHOSEN, kB = CHOSEN, xa = XA, xb = XB, dep = W.compDepth.x, sil = W.compSil.x;
  xa[0] = 0; xa[1] = -0.06; xa[2] = 1.5; xa[3] = 0; xb[0] = 0; xb[1] = 0; xb[2] = 1; xb[3] = 0;
  var dscale = lerp(1, 0.92, dep), dy = -dep * 6 / Math.max(r, 20);
  if (W.picker && !W.chosen){
    var kf = clamp(W.theta.x / DET, 0, NPICK - 1), k0 = Math.floor(kf), k1 = Math.min(NPICK - 1, k0 + 1);
    var rel0 = k0 * DET - W.theta.x, rel1 = k1 * DET - W.theta.x;
    kA = k0; kB = k1;
    /* one creature at rest: the neighbour is only visible while the sphere is turning (it never sits behind the chosen one) */
    xa[0] = Math.sin(rel0) * 0.62; xa[1] = -0.06; xa[2] = 1.5 * (0.78 + 0.22 * Math.cos(rel0)) * dscale; xa[3] = sstep(0.35, 0.95, Math.cos(rel0));
    if (k1 !== k0){ xb[0] = Math.sin(rel1) * 0.62; xb[1] = -0.06; xb[2] = 1.5 * (0.78 + 0.22 * Math.cos(rel1)) * dscale; xb[3] = sstep(0.35, 0.95, Math.cos(rel1)); }
  } else {
    var side = lerp(1.5, 1.25, sil) * dscale, bob = sil * 2 * breathV(W.bph) / Math.max(r, 20);
    xa[0] = 0; xa[1] = lerp(-0.06, -0.02, sil) + bob; xa[2] = side; xa[3] = 1;
  }
  xa[1] += dy - W.hop.x / Math.max(r, 20); xb[1] += dy - W.hop.x / Math.max(r, 20);
  var cA = ORDER[kA], cB = ORDER[kB];

  aria(listening ? 'Bobby is listening' : (W.duel && T < 35.6 && T > 31.6) ? 'Three agents debating' : (tmB('verdict') <= T && tmG('verdict') > T) ? 'Verdict: Wait, 64% conviction' : 'Bobby');

  if (!gl){ renderFallback(cy, r, cA, xa); return; }
  var k = KPX;
  gl.disable(gl.SCISSOR_TEST); gl.viewport(0, 0, cv.width, cv.height); gl.clear(gl.COLOR_BUFFER_BIT);
  var half = 1.9 * r * k, cxp = 195 * k, cyp = (844 - cy) * k;
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(Math.max(0, Math.floor(cxp - half)), Math.max(0, Math.floor(cyp - half)), Math.ceil(half * 2) + 2, Math.ceil(half * 2) + 2);
  gl.uniform4f(loc.uG, cxp, cyp, r * k, br);
  gl.uniform4f(loc.uL, W.energy.x, W.voice, W.glow.x * (1 - 0.65 * dim), W.irid.x);
  gl.uniform4f(loc.uB, W.birth.x, rimHard * (1 + W.rimBoost.x), spec, hp.r);
  gl.uniform4f(loc.uPh, W.twist, W.twistOsc, W.flow, W.drift);
  gl.uniform4f(loc.uPh2, W.rot + W.theta.x, W.iridPh, (T * 0.37) % 1, listening ? 0.35 * (0.6 + 0.4 * W.voice) : 0);
  gl.uniform4f(loc.uD, W.swirl.x, W.sep, W.braid.x, expoNow());
  gl.uniform4f(loc.uNA, W.nodeAng[0], W.nodeR[0].x, W.nodeOn[0] ? W.nodeGlow[0].x : 0, W.nodeW[0] >= 0 ? 1 : -1);
  gl.uniform4f(loc.uNR, W.nodeAng[1], W.nodeR[1].x, W.nodeOn[1] ? W.nodeGlow[1].x : 0, W.nodeW[1] >= 0 ? 1 : -1);
  gl.uniform4f(loc.uNC, W.nodeAng[2], W.nodeR[2].x, (W.nodeOn[2] ? W.nodeGlow[2].x : 0) * 0.8, W.nodeW[2] >= 0 ? 1 : -1);
  gl.uniform4f(loc.uCur, W.flowA, W.flowR, W.cioRot, RM ? 1 : 0);
  gl.uniform4f(loc.uFl, filR, filA, W.filAng, fl);
  gl.uniform4f(loc.uV, W.vcol[0], W.vcol[1], W.vcol[2], W.floodAmt);
  gl.uniform4f(loc.uVC, CORE_WAIT[0], CORE_WAIT[1], CORE_WAIT[2], W.scrim.x);
  gl.uniform4f(loc.uSh, shR, shA, bulge, W.pull.x);
  gl.uniform4f(loc.uShC, shC[0], shC[1], shC[2], ripA);
  gl.uniform4f(loc.uRp, -Math.PI / 2, W.ripPh, emA, emX);
  gl.uniform4f(loc.uTi, tintRGB[0], tintRGB[1], tintRGB[2], Math.min(W.tintAmt.x, 0.35));
  gl.uniform4f(loc.uNb, ISLA_RGB[0], ISLA_RGB[1], ISLA_RGB[2], W.nb.x * 0.8);
  gl.uniform4f(loc.uXA, xa[0], xa[1], xa[2], (cA && cA.tex) ? xa[3] : 0);
  gl.uniform4f(loc.uXB, xb[0], xb[1], xb[2], (cB && cB.tex) ? xb[3] : 0);
  gl.uniform4f(loc.uCo, sil, dep, W.compAmt.x, 0.28);
  var bgc = cA ? cA.bg : BG0;
  gl.uniform4f(loc.uCb, bgc[0], bgc[1], bgc[2], W.wash.x);
  gl.uniform4f(loc.uLt, 0.012 * Math.sin(T * 0.21), 0.01 * Math.cos(T * 0.17), spA, spk);
  var pearlMerge = W.conv ? (1 - W.sep) * 0.6 : 0;
  gl.uniform4f(loc.uAm, ambC[0], ambC[1], ambC[2], pearlMerge);
  var qt = QT[QI]; gl.uniform4f(loc.uQ, qt.oct, qt.disp, 0, 0);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, (cA && cA.tex) || TEX0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, (cB && cB.tex) || TEX0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
function renderFallback(cy, r, c, xa){
  var fb = $('fb'), img = $('fbImg');
  st(fb, 'translate3d(' + f1(195 - r) + 'px,' + f1(cy - r) + 'px,0) scale(' + f3(r / 50) + ')', 1);
  sc(fb, 'transformOrigin', '0 0');
  if (c && c.uri && img._u !== c.uri){ img._u = c.uri; img.src = c.uri; }
  sc(img, 'opacity', String(Math.round(W.compAmt.x * (1 - 0.5 * W.compSil.x) * 100) / 100));
}

/* snow globe flakes, clipped to the glass */
var snowCv = $('snow'), snowX = snowCv.getContext('2d');
function renderSnow(){
  var on = W.snowOn && W.snow, a = on ? c01((T - W.snowT) / 0.4) * (W.snowOff ? 1 - c01((T - W.snowOff) / 0.8) : 1) : 0;
  if (RM) a = 0;
  if (a <= 0.001){ if (snowCv._drawn){ snowX.setTransform(1, 0, 0, 1, 0, 0); snowX.clearRect(0, 0, snowCv.width, snowCv.height); snowCv._drawn = false; snowCv._box = null; } return; }
  var k = KPX; if (snowCv.width !== Math.round(390 * k)){ snowCv.width = Math.round(390 * k); snowCv.height = Math.round(844 * k); snowCv._box = null; }
  snowX.setTransform(k, 0, 0, k, 0, 0);
  /* clear only last frame's sphere box (not the whole 390×844 backing) */
  var bx = snowCv._box, rr = SPH.r + 4;
  if (bx) snowX.clearRect(bx[0], bx[1], bx[2], bx[3]); else { snowX.clearRect(0, 0, 390, 844); bx = snowCv._box = [0, 0, 0, 0]; }
  bx[0] = 195 - rr; bx[1] = SPH.cy - rr; bx[2] = bx[3] = 2 * rr;
  snowX.save(); snowX.beginPath(); snowX.arc(195, SPH.cy, SPH.r * 0.96, 0, Math.PI * 2); snowX.clip(); snowX.fillStyle = '#F2EDE4';
  for (var i = 0; i < W.snow.length; i++){ var p = W.snow[i]; snowX.globalAlpha = a * p.o * 0.5 * 1.6; snowX.beginPath(); snowX.arc(195 + p.x * SPH.r, SPH.cy + p.y * SPH.r, p.s * 0.5, 0, Math.PI * 2); snowX.fill(); }
  snowX.restore(); snowCv._drawn = true;
}

/* rim mask for DOM near the glass: opacity *= smoothstep(r − 4, r + 12, distance) */
function rimMask(x, y){ var d = Math.sqrt((x - 195) * (x - 195) + (y - SPH.dcy) * (y - SPH.dcy)); return sstep(SPH.dr - 4, SPH.dr + 12, d); }

/* ---------- satellites + orbit ---------- */
var SAT_A = [Math.atan2(-100, -127), Math.atan2(-100, 127), Math.atan2(100, 127)];   /* screen angles: UL, UR, LR */
function satGeom(){ var q = c01((SPH.dr - 64) / 32); return { dx:lerp(122, 127, q), dy:lerp(70, 100, q), s:lerp(0.92, 1, q) }; }
function renderSats(){
  var born = tmB('sats'), gone = tmG('sats'), G = satGeom(), cx = 195, cy = SPH.dcy;
  for (var i = 0; i < 3; i++){
    var el = sats[i], tb0 = born + 0.07 * i;
    if (T < tb0 || T > gone + 0.6){ st(el, null, 0); continue; }
    var sx = (i === 0 ? -1 : 1) * G.dx, sy = (i === 2 ? 1 : -1) * G.dy, L = Math.sqrt(sx * sx + sy * sy);
    var drift = RM ? 0 : Math.sin(2 * Math.PI * W.bph / 2 + i * 1.7);
    var ang = Math.atan2(sy, sx) + drift * 2.5 * Math.PI / 180, p = TR ? sp('emit', T - tb0) : c01((T - tb0) / 0.2);
    var a2 = ang - 0.7 * (1 - p) * TR, rad = lerp(SPH.dr - 4, L, p);
    var x = cx + Math.cos(a2) * rad, y = cy + Math.sin(a2) * rad + drift * 2, sc2 = G.s * lerp(0.6, 1, c01(p)), o = c01(p * 1.4);
    var xu = T - (gone + 0.04 * (2 - i));
    if (xu > 0){ var q = INH(c01(xu / 0.38)); x = lerp(x, cx + Math.cos(ang) * SPH.dr * 0.9, q); y = lerp(y, cy + Math.sin(ang) * SPH.dr * 0.9, q); sc2 *= lerp(1, 0.25, sstep(0.65, 1, q)); o *= 1 - sstep(0.65, 1, q); }
    x = clamp(x, 18 + 50 * sc2, 372 - 50 * sc2);     /* the breath drift never takes an edge closer than 18 px to the frame */
    o *= rimMask(x, y);
    st(el, tf(x - 50, y - 26, sc2), o);
    var settled = T - tb0 > 0.8 && xu <= 0; if (el._set !== settled){ el._set = settled; el.classList.toggle('set', settled); }
    var cols = satCols[i];
    for (var j = 0; j < cols.length; j++){ var col = cols[j], ru = c01((T - (tb0 + 0.30 + 0.022 * j)) / 0.28), pos = RM ? col.d + 10 : lerp(col.d + 3, col.d + 10, DAT(ru)); sc(col.strip, 'transform', 'translateY(' + f1(-pos * col.h) + 'px)'); }
    sc(satV[i], 'opacity', String(c01((T - tb0 - 0.06) / 0.2)));
  }
  var oe = $('orbitE'), ou = c01((T - born - 0.2) / 0.6), oo = (T >= born && T < gone + 0.25) ? 0.9 * (1 - c01((T - gone) / 0.24)) : 0;
  sa(oe, 'cx', f1(cx)); sa(oe, 'cy', f1(cy)); sa(oe, 'rx', f1(180 * G.dx / 127)); sa(oe, 'ry', f1(141 * G.dy / 100));
  sc(oe, 'strokeDashoffset', f1((1 - DAT(ou)) * 500 - (RM ? 0 : (W.bph / 4 % 1) * 7 * 20)));
  sc(oe, 'strokeDasharray', ou < 1 ? '1 6' : '1 6'); sa(oe, 'opacity', f3(oo * DAT(ou)));
}

/* ---------- the ring (agree ring and conviction ring share geometry) ---------- */
var ringG = $('ringG'), ringTrk = $('ringTrk'), ringArc = $('ringArc'), ringHead = $('ringHead');
function renderRing(){
  var cx = 195, cy = SPH.dcy, r = SPH.dr, o = 0, p = 0, col = '#F2EDE4', rr = r + 14, flash = 0, head = 0;
  var ab = tmB('agreeRing');
  if (T >= ab && T < 32.0){
    o = FAD(c01((T - ab) / 0.24)); p = agreeP(T);
    if (W.agree && W.agree.done != null){ var du = T - W.agree.done; flash = du < 0.09 ? 1 - du / 0.09 : 0; var q = sp('ret', du); rr = lerp(r + 14, r, q); o *= 1 - sstep(0.5, 1, c01(du / 0.4)); }
  }
  var cb = tmB('ring');
  if (T >= cb){
    col = '#F6B94E'; var presenting = T >= tmB('present');
    rr = r + (presenting ? lerp(14, 10, c01((T - tmB('present')) / 0.4)) : 14);
    var fu = c01((T - cb) / 1.1); p = RM ? 0.64 : 0.64 * DAT(fu); o = 1; head = 1;
    var lu = T - (cb + 1.1); flash = lu >= 0 && lu < 0.06 ? 1 : 0;
    var g = tmG('ring'); if (T >= g){ var uu = c01((T - g) / 0.35); p *= 1 - DAT(uu); o = 1 - sstep(0.6, 1, uu); }
  }
  sa(ringG, 'opacity', f3(o));
  if (o <= 0) return;
  var C = 2 * Math.PI * rr;
  var fcx = f1(cx), fcy = f1(cy), frr = f1(rr);
  sa(ringTrk, 'cx', fcx); sa(ringTrk, 'cy', fcy); sa(ringTrk, 'r', frr); sa(ringArc, 'cx', fcx); sa(ringArc, 'cy', fcy); sa(ringArc, 'r', frr);
  sa(ringTrk, 'stroke', col === '#F6B94E' ? 'rgba(242,237,228,.10)' : 'rgba(242,237,228,.12)');
  sa(ringArc, 'stroke', col); sa(ringArc, 'stroke-width', f1(1 + flash * 1.2));
  sa(ringArc, 'stroke-dasharray', f1(C * p) + ' ' + f1(C));
  sa(ringArc, 'transform', 'rotate(-90 ' + f1(cx) + ' ' + f1(cy) + ')');
  sc(ringArc, 'filter', col === '#F6B94E' ? 'drop-shadow(0 0 3px rgba(246,185,78,.6))' : 'none');
  var ha = -Math.PI / 2 + 2 * Math.PI * p;
  sa(ringHead, 'cx', f1(cx + Math.cos(ha) * rr)); sa(ringHead, 'cy', f1(cy + Math.sin(ha) * rr)); sa(ringHead, 'opacity', f3(head * (p > 0.01 ? 1 : 0)));
}

/* ---------- verdict word condenses from a filament collapse ---------- */
var vEl = $('verdict'), vWord = $('vword'), vc = vEl.querySelector('.vc'), pctEl = $('pct');
function renderVerdict(){
  var b = tmB('verdict'), g = tmG('verdict');
  if (T < b || T > g + 0.4){ st(vEl, null, 0); st(pctEl, null, 0); return; }
  var r = SPH.dr, fs = Math.round(0.62 * r), u = c01((T - b) / 0.9), k = FOC(u), o = RM ? c01((T - b) / 0.3) : c01(u * 1.6);
  var trk = lerp(0.30, -0.01, k), blur = lerp(14, 0, k), s = lerp(1.25, 1, k);
  if (RM){ trk = -0.01; blur = 0; s = 1; }
  if (T > g){ var e = c01((T - g) / 0.28); trk = lerp(-0.01, 0.30, FOC(e)); blur = 14 * FOC(e); s = lerp(1, 1.25, FOC(e)); o *= 1 - e; }
  sc(vWord, 'fontSize', fs + 'px'); sc(vWord, 'letterSpacing', trk.toFixed(3) + 'em');
  var inner = sstep(58, 66, r);
  sc(vc, 'opacity', f3(inner * c01((T - (b + 0.25)) / 0.3)));
  var hWord = fs + (inner > 0.02 ? 22 : 0);
  st(vEl, tf(195 - 120, SPH.dcy - hWord / 2 - 2, s), o, bl(blur));
  var cb = tmB('ring'), cv2 = T >= cb ? (RM ? 64 : 64 * DAT(c01((T - cb) / 1.1))) : 0;
  pctSet(vpctCols, cv2, 14); pctSet(pctCols, cv2, 16);
  var pb = tmB('present'), po = T >= pb ? c01((T - pb - 0.15) / 0.3) * (T > g ? 1 - c01((T - g) / 0.2) : 1) : 0;
  st(pctEl, tf(195 - 60, SPH.dcy + SPH.dr + 10 + 4 + (1 - c01((T - pb) / 0.4)) * -6 * TR), po);
}
