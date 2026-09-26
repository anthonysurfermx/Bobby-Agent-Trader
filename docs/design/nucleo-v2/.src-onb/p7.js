
/* ---------- chart: exhaled as a comet, inhaled back on pull ---------- */
function renderChart(){
  var cb = tmB('comet'), cm = tmB('commit');
  if (T < cb || T > cm + 0.6){ st(chartSvg, null, 0); return; }
  st(chartSvg, null, 1);
  var LL = CH.leadLen, LN = CH.lineLen, tNow = cb + CH.TLEAD + CH.TLINE, s, head = 1;
  if (RM){ s = LL + LN; head = 0; }
  else s = Math.min(LL + LN, cometS(T - cb));
  var leadO = RM ? 0 : 1 - c01((T - (cb + CH.TLEAD)) / 0.4);
  var marksO = 1;
  if (T >= cm){ var q = INH(c01((T - cm) / 0.42)); s = (LL + LN) * (1 - q); leadO = s < LL + 2 ? 1 : 0; marksO = 1 - c01((T - cm) / 0.2); head = s > 1 ? 1 : 0; if (RM){ marksO = 1 - c01((T - cm) / 0.2); leadO = 0; } }
  var ls = Math.min(s, LL), ln = Math.max(0, s - LL);
  sc(CH.cLead, 'strokeDashoffset', f1(LL - ls)); sa(CH.cLead, 'opacity', f3(leadO * (ls > 0 ? 1 : 0)));
  sc(CH.cLine, 'strokeDashoffset', f1(LN - ln)); sa(CH.cLine, 'opacity', ln > 0 ? '1' : '0');
  var g0 = 0.8 * LN; sc(CH.cGlow, 'strokeDasharray', '0 ' + f1(g0) + ' ' + f1(Math.max(0, ln - g0)) + ' ' + f1(LN + 10)); sa(CH.cGlow, 'opacity', ln > g0 ? '0.22' : '0');
  var pt = null; try { if (s > 0.5 && s < LL) pt = CH.cLead.getPointAtLength(ls); else if (s >= LL) pt = CH.cLine.getPointAtLength(Math.min(ln, LN - 0.01)); } catch(e){}
  var atNow = T >= tNow && T < cm;
  if (pt && head && !atNow){ sa(CH.cHead, 'cx', f1(pt.x)); sa(CH.cHead, 'cy', f1(pt.y)); sa(CH.cHead, 'opacity', '1'); } else sa(CH.cHead, 'opacity', '0');
  var nowP = T >= tNow ? (RM ? 1 : sp('emit', T - tNow)) : 0;
  sa(CH.cNow, 'r', f1(3.6 * nowP)); sa(CH.cNow, 'opacity', f3((nowP > 0 ? 1 : 0) * marksO));
  /* marks arrive in order after the line */
  var m0 = tNow + 0.08;
  sa(CH.cTicks, 'opacity', f3(FAD(c01((T - m0) / 0.24)) * marksO));
  sa(CH.bandR, 'width', f1(350 * (RM ? c01((T - m0) / 0.24) : DAT(c01((T - m0) / 0.42)))));
  sa(CH.cBand, 'opacity', f3(marksO));
  sa(CH.cBandL, 'opacity', f3(c01((T - m0 - 0.16) / 0.24) * marksO)); sa(CH.cBandL, 'transform', 'translate(' + f1(-8 * (1 - FOC(c01((T - m0 - 0.16) / 0.3))) * TR) + ',0)');
  var eu = c01((T - m0 - 0.24) / 0.3); sc(CH.cEarn, 'strokeDasharray', '1 4'); sa(CH.cEarn, 'y2', f1(340 + 200 * DAT(eu))); sa(CH.cEarn, 'opacity', f3((eu > 0 ? 1 : 0) * marksO));
  var cap = T >= m0 + 0.24 ? sp('emit', T - m0 - 0.24) : 0; sa(CH.cEarnCap, 'r', f1(2 * cap)); sa(CH.cEarnCap, 'opacity', f3((cap > 0 ? 1 : 0) * marksO));
  sa(CH.cEarnL, 'opacity', f3(c01((T - m0 - 0.3) / 0.24) * marksO));
  sa(CH.cAreaI, 'opacity', f3(c01((T - m0 - 0.2) / 0.6) * marksO)); sa(CH.cAreaA, 'opacity', f3(c01((T - m0 - 0.2) / 0.6) * marksO));
  sa(CH.cPrice, 'opacity', f3(c01((T - tNow - 0.1) / 0.24) * marksO));
  var six = 41.95 - 0.03, bu = c01((T - six) / 0.2);
  sa(CH.cBr, 'opacity', f3(FOC(bu) * marksO));
  sa(CH.cBrL, 'fill', T - six < 0.35 && T >= six ? '#FFF8EC' : '#F6B94E');
  /* NOW pulse on the breath clock: three pulses every 2.4 s, then every 4.8 s */
  var pu = 0, B = W.period; if (!RM && T >= 42.10 && T < cm){ var tt = T - 42.10, ph = tt < 1.5 * B ? tt % (B / 2) : (tt - 1.5 * B) % B; pu = ph < B / 4 ? ph / (B / 4) : -1; }   /* B/2 then B: the chosen companion's clock (4.8 s for Mira) */
  if (pu >= 0){ sa(CH.cPulse, 'r', f1(4 * (1 + 3.2 * EXH(pu)))); sa(CH.cPulse, 'opacity', f3(0.9 * (1 - pu) * marksO)); } else sa(CH.cPulse, 'opacity', '0');
}

/* ---------- belt of 18 beads on the top arc (r + 34) ---------- */
function beadPos(j, b, R){
  /* a ring of 18 beads on the top arc: the active bead sits at 12 o'clock (the focal axis of the glass) and the
     belt glides one bead per detent; the ring wraps, so the arc −165°…−15° is always full and the seam is invisible */
  var n = beads.length, step = 150 / 17, d = j - b;          /* fixed pitch: 18 beads fill −165°…−15° */
  if (n > 1){ d = ((d + n / 2) % n + n) % n - n / 2; }
  var push = d === 0 ? 0 : Math.sign(d) * 3.2 * Math.exp(-Math.abs(d) * 0.35) * (1 - Math.exp(-Math.abs(d) * 4));
  var a = (-90 + d * step + push) * Math.PI / 180, o = BP; o.a = a; o.d = d; o.edge = 1 - sstep(n / 2 - 1.2, n / 2 - 0.1, Math.abs(d)); o.k = Math.round(d + n / 2); return o;
}
var BP = { a:0, d:0, edge:1, k:0 }, BEAD_K0 = [];   /* reused result; each bead's spiral order is fixed */
beads.forEach(function(b, j){ BEAD_K0.push(beadPos(j, 0, 0).k); });
function renderBelt(){
  var born = tmB('belt'), out = tmB('beadsOut'), R = SPH.dr + 34, cx = 195, cy = SPH.dcy, n = beads.length;
  for (var j = 0; j < n; j++){
    var el = beads[j];
    if (T < born){ st(el, null, 0); continue; }
    var bb = (W.picker && !W.chosen) ? clamp(W.theta.x / DET, 0, NPICK - 1) : W.belt.x;   /* the belt rides the same 1:1 drag + glide as the glass */
    var k0 = BEAD_K0[j], bp = beadPos(j, bb, R);   /* spiral order: left to right along the arc (clockwise) */
    var p = TR ? sp('emit', T - (born + 0.035 * k0)) : c01((T - born - 0.035 * k0) / 0.2);
    var a = bp.a - 0.7 * (1 - p) * TR, rad = lerp(SPH.dr - 6, R, p);
    var x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    var act = 1 - c01(Math.abs(bp.d)), size = lerp(20, 32, act), o = c01(p * 1.5) * lerp(0.55, 1, act) * bp.edge;
    if (T >= out){
      if (j === CHOSEN){
        var fu = c01((T - out) / 0.48), e = EXH(fu); x = lerp(x, 354, e); y = lerp(y, 76, e); size = lerp(size, 26, e); o = fu < 1 ? 1 : 0;
      } else {
        var su = c01((T - out - 0.02 * (n - 1 - bp.k)) / 0.3), q = INH(su);
        var a2 = a - 0.7 * q * TR, r2 = lerp(R, SPH.dr - 6, q); x = cx + Math.cos(a2) * r2; y = cy + Math.sin(a2) * r2; o *= 1 - sstep(0.65, 1, q);
      }
    }
    o *= rimMask(x, y);
    st(el, tf(x, y, size / 32), o);
  }
}

/* ---------- Isla glyph, seed and the 16-plot growth ring ---------- */
var islaEl = $('isla'), seedDrop = $('seedDrop'), newPiece = $('newPiece');
function renderIsla(){
  var dth = W.theta.x - W.thBase, on = T > 57.4 && T < 62.4;
  if (!on){ st(islaEl, null, 0); sa(isRing, 'opacity', '0'); return; }
  var rel = DET - dth, cr = Math.cos(rel), R = SPH.r, scl = (0.78 + 0.22 * cr) * R / 120;
  var x = 195 + Math.sin(rel) * 0.62 * R, y = SPH.cy + 6 * R / 120;
  var o = sstep(0.1, 0.6, cr), bl2 = RM ? 0 : (1 - cr) * 6;
  st(islaEl, tf(x - 60, y - 60, scl), o, bl2 > 0.1 ? 'blur(' + f1(bl2) + 'px) drop-shadow(0 0 5px rgba(255,248,236,.25))' : 'drop-shadow(0 0 5px rgba(255,248,236,.25))');
  var sb = tmB('seed'), su = T - sb, sy = su < 0 ? -20 : -20 * (1 - (RM ? 1 : sp('gulp', su)));
  sa(seedDrop, 'opacity', su < 0 ? '0' : f3(c01(su / 0.12))); sa(seedDrop, 'transform', 'translate(0,' + f1(sy) + ')');
  sa(newPiece, 'opacity', f3(su > 0.25 ? 0.55 + 0.25 * Math.sin((T - sb) * 2.6) : 0));
  /* ring */
  var fr = c01(dth / DET) / 0.557, ro = c01(fr) * (T < 59.8 ? 1 : 1 - c01((T - 59.8) / 0.5)), rr = R + 14;
  sa(isRing, 'opacity', f3(ro));
  if (ro <= 0) return;
  for (var i = 0; i < 16; i++){
    var a0 = -Math.PI / 2 + (i - 0.5) * (2 * Math.PI / 16) + 0.09, a1 = a0 + 2 * Math.PI / 16 - 0.18;
    var d = 'M' + f1(195 + Math.cos(a0) * rr) + ',' + f1(SPH.cy + Math.sin(a0) * rr) + ' A' + f1(rr) + ',' + f1(rr) + ' 0 0 1 ' + f1(195 + Math.cos(a1) * rr) + ',' + f1(SPH.cy + Math.sin(a1) * rr);
    sa(isSegs[i], 'd', d);
    var lit = i === 0 && su >= 0.12;
    sa(isSegs[i], 'stroke', lit ? '#F2EDE4' : 'rgba(242,237,228,.28)'); sa(isSegs[i], 'stroke-width', lit ? (su < 0.3 ? '3.2' : '2.4') : '2');
  }
}

/* ---------- meridian dots (page control, shown only for faces with content) ---------- */
var MER_W = [20, 6, 6, 6], MER_T = [0, 0, 0];
function renderMeridian(){
  var b = tmB('mer'); if (T < b){ for (var z = 0; z < 4; z++) st(merDots[z], null, 0); return; }
  var R = SPH.dr + 24, fr = c01((W.theta.x - W.thBase) / DET), ws = MER_W; ws[0] = lerp(20, 6, fr); ws[1] = lerp(6, 20, fr); ws[2] = 6; ws[3] = 6;
  var tot = ws[0] + ws[1] + ws[2] + ws[3] + 30, acc = -tot / 2;
  var tint = labRgbTo(MER_T, W.tl.x, W.ta.x, W.tb.x);
  for (var i = 0; i < 4; i++){
    var el = merDots[i], s = acc + ws[i] / 2; acc += ws[i] + 10;
    var a = Math.PI / 2 - s / R, p = TR ? sp('emit', T - (b + 0.2 * i)) : c01((T - b - 0.2 * i) / 0.2), rad = lerp(SPH.dr - 4, R, p);
    var x = 195 + Math.cos(a) * rad, y = SPH.dcy + Math.sin(a) * rad;
    sc(el, 'width', f1(ws[i]) + 'px'); sc(el, 'marginLeft', f1(-ws[i] / 2) + 'px');
    var act = i === 0 ? 1 - fr : (i === 1 ? fr : 0);
    sc(el, 'background', act > 0.5 ? css(tint, 0.95) : 'rgba(242,237,228,.28)');
    st(el, tf(x, y), c01(p * 1.4) * rimMask(x, y));
  }
}

/* ---------- the question: transcript words, the bead, the wait inside ---------- */
var txEl = $('tx'), txW = null, qbead = $('qbead'), tbead = $('tbead'), TX_ORDER = [0, 5, 1, 4, 2, 3];
function renderQuestion(){
  var lb = tmB('listen'), gb = tmB('gather');
  if (!txW){ txW = spans(txEl, QTEXT); }
  var show = T >= lb - 0.1 && T < gb + 0.5;
  st(txEl, null, show ? 1 : 0);
  var bx = 195, by = 558;
  if (show){
    var order = TX_ORDER;
    /* the spoken words stay (almost) centred with room reserved for the next word, so a new word is born in place,
       never past the frame edge; each arrival eases the line left on `soft` (no reflow, no jump) */
    if (txW[0]._l == null) txW.forEach(function(w){ w._l = w.offsetLeft; w._r = w.offsetLeft + w.offsetWidth; });
    var shift = 0, prevS = null;
    for (var k = 0; k < txW.length && T >= TXW[k][1]; k++){
      var sk = 175 - (txW[0]._l + txW[Math.min(k + 1, txW.length - 1)]._r) / 2;
      shift = prevS == null ? sk : shift + (sk - prevS) * (TR ? sp('soft', T - TXW[k][1]) : 1); prevS = sk;
    }
    for (var i = 0; i < txW.length; i++){
      var w = txW[i], u = T - TXW[i][1], o = 0, y = 0, b = 0, sx = shift, s = 1;
      if (u >= 0){ var k = FOC(c01(u / 0.3)); o = k; y = 18 * (1 - k) * TR; b = 6 * (1 - k); }
      if (T >= gb){
        if (w._cx == null){ w._cx = w.offsetLeft + w.offsetWidth / 2; w._cy = w.offsetTop + 15; }
        var gu = c01((T - gb - 0.022 * order.indexOf(i)) / 0.24), q = INH(gu);
        sx = lerp(shift, bx - 20 - w._cx, q); y += (by - 528 - w._cy) * q; s = lerp(1, 0.2, q); o *= 1 - sstep(0.5, 1, gu);
      }
      sc(w, 'color', T < 25.30 && i === txW.length - 1 ? '#A39C91' : '#F2EDE4');
      st(w, 'translate(' + f1(sx) + 'px,' + f1(y) + 'px) scale(' + f3(s) + ')', o, bl(b));
    }
  } else if (txW[0]._cx != null && T < lb){ txW.forEach(function(w){ w._cx = null; w._l = null; }); }
  /* bead: forms from the gathered words, arcs into the bottom rim (12 px arc, inhale 360 ms) */
  var bo = 0, x = bx, y = by, s2 = 1;
  if (T >= gb + 0.24 && T < gb + 0.74 + 0.1){
    var f = c01((T - gb - 0.24) / 0.14); bo = f; s2 = lerp(0.4, 1, EXH(f));
    var au = c01((T - gb - 0.38) / 0.36), q2 = INH(au), tx2 = 195, ty2 = SPH.cy + SPH.r;
    x = lerp(bx, tx2, q2) + Math.sin(Math.PI * q2) * 12 * TR; y = lerp(by, ty2, q2);
    bo *= rimMask(x, y) > 0 ? 1 - sstep(0.85, 1, q2) : 0;
  }
  st(tbead, tf(x, y, s2), bo);
  /* the question waits inside the glass, orbiting at ρ .2 until the read begins */
  var ib = 26.30, bu = tmB('burst'), io = 0, ix = 195, iy = SPH.cy, isc = 1;
  if (T >= ib && T < bu + 0.3){
    io = 0.85 * c01((T - ib) / 0.25); var ang = 0.8 * (T - ib) * (RM ? 0.25 : 1), rho = 0.2 * SPH.r;
    if (T >= bu){ var du = c01((T - bu) / 0.12); rho *= 1 - FOC(du); var bu2 = c01((T - bu - 0.1) / 0.2); isc = 1 + 1.5 * bu2; io *= 1 - bu2; }
    ix = 195 + Math.cos(ang) * rho; iy = SPH.cy + Math.sin(ang) * rho;
  }
  st(qbead, tf(ix, iy, 0.8 * isc), io);
}

/* ---------- agent labels + tethers ---------- */
var thEls = [$('thA'), $('thR'), $('thC')];
var AG_SCR = [-140 * Math.PI / 180, -40 * Math.PI / 180, Math.PI / 2];
var AG_NAME_TR = ['Alpha Hunter', 'Red Team', 'CIO'], AG_NAME = ['Alpha Hunter · Bull', 'Red Team · Bear', 'CIO'], agN = agEls.map(function(e){ return e.querySelector('.n'); });
function renderAgents(){
  var trailer = T < 17, keys = trailer ? ['trA', 'trR', 'trC'] : ['agA', 'agR', 'agC'];
  var thGone = trailer ? null : tmG('tethers');
  for (var i = 0; i < 3; i++){
    var el = agEls[i], b = tmB(keys[i]), g = tmG(keys[i]);
    if (T < b || T > g + 0.5){ st(el, null, 0); sa(thEls[i], 'opacity', '0'); continue; }
    var top = i < 2 ? 188 : (trailer ? 467 : 528), left = i === 0 ? 20 : (i === 1 ? 214 : 85), w = i === 2 ? 220 : 156;
    var h = trailer ? 14 : (i < 2 ? 60 : 39);
    var lx = left + w / 2, ly = top + h / 2, vx = lx - 195, vy = ly - SPH.dcy, vl = Math.sqrt(vx * vx + vy * vy) || 1; vx /= vl; vy /= vl;
    var p = TR ? sp('soft', T - b - 0.12) : c01((T - b) / 0.2), o = c01((T - b - 0.1) / 0.28), off = -10 * (1 - p) * TR, blur = 6 * (1 - c01((T - b - 0.1) / 0.3));
    if (T > g){ var q = INH(c01((T - g) / 0.36)); off = -10 * q * TR; o *= 1 - sstep(0.6, 1, q); blur = 4 * q; }
    st(el, tf(off * vx, off * vy), o, bl(blur));
    sc(el, 'top', top + 'px'); txt(agN[i], trailer ? AG_NAME_TR[i] : AG_NAME[i]);
    sc(agSt[i], 'display', trailer ? 'none' : '');
    if (!trailer && i < 2){ var ws2 = agStW[i]; for (var j = 0; j < ws2.length; j++){ var wu = c01((T - b - 0.3 - 0.045 * j) / 0.26); st(ws2[j], 'translateY(' + f1(3 * (1 - FOC(wu)) * TR) + 'px)', FOC(wu), bl(2.5 * (1 - wu))); } }
    if (!trailer && i === 2){
      var rb = tmB('cioRoll'), ru = T - rb;
      st(agCroll[0], 'translateY(' + f1(ru > 0 ? -8 * FOC(c01(ru / 0.16)) : 0) + 'px)', ru > 0 ? 1 - c01(ru / 0.16) : c01((T - b - 0.3) / 0.3));
      st(agCroll[1], 'translateY(' + f1(ru > 0.04 ? 8 * (1 - sp('snap', ru - 0.04)) : 8) + 'px)', ru > 0.04 ? c01((ru - 0.04) / 0.16) : 0);
    }
    /* tether: 0.5 px at 35% of the hue, from the label anchor to the rim at its angle */
    var ax = i === 0 ? 48 : (i === 1 ? 342 : 195), ay = i < 2 ? top + h + 6 : top - 5;
    var ra = AG_SCR[i], rx = 195 + Math.cos(ra) * SPH.dr, ry = SPH.dcy + Math.sin(ra) * SPH.dr;
    var tu = c01((T - b) / 0.28), draw = DAT(tu), end = trailer ? g : Math.min(g, thGone);
    if (T > end){ draw *= 1 - INH(c01((T - end) / 0.32)); }
    var d = 'M' + f1(rx) + ',' + f1(ry) + ' Q' + f1((rx + ax) / 2 + (i === 2 ? 0 : (i === 0 ? -10 : 10))) + ',' + f1((ry + ay) / 2) + ' ' + f1(ax) + ',' + f1(ay);
    sa(thEls[i], 'd', d);
    var L = 200; sc(thEls[i], 'strokeDasharray', f1(L * draw) + ' ' + L); sa(thEls[i], 'opacity', draw > 0.002 ? '1' : '0');
  }
}
