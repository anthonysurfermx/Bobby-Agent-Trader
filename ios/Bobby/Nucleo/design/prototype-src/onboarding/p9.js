
/* ---------- the black pill: origin of everything the user says ---------- */
function modeO(m){ var mt = W.pillModeT == null ? -9 : W.pillModeT, u = c01((T - mt) / 0.16); return W.pillMode === m ? u : (W.pillModePrev === m ? 1 - u : 0); }
function pressS(k, depth){
  var pr = W.pr[k]; if (!pr || T < pr[0]) return 1;
  if (T < pr[1]) return lerp(1, depth, sp('snap', T - pr[0]));
  return depth + (1 - depth) * sp('emit', T - pr[1]);
}
function renderPill(){
  var pb = tmB('pillIn');
  if (T < pb){ st(pill, null, 0); st(pglow, null, 0); return; }
  var w = W.pillW.x, rise = TR ? 28 * (1 - sp('soft', T - pb)) : 0, o = c01((T - pb) / 0.24), bv = breathV(W.bph);
  var s = pressS('pill', 0.94);
  if (W.pillMode === 'mic' && ((T > 17.4 && T < 19.0) || T > 62.2)) s *= 1 + 0.0175 * (1 + bv) * (RM ? 0.3 : 1);
  sc(pill, 'width', f1(w) + 'px');
  /* under the sign-in sheet the pill fades out behind the glass, so its black shape never ghosts through the blur */
  var shB = tmB('sheet'), shG = tmG('sheet'), shK = 1;
  if (T >= shB && T < shG + 0.7) shK = T < shG ? 1 - c01((T - shB - 0.1) / 0.2) : c01((T - shG - 0.35) / 0.3);
  st(pill, tf(195 - w / 2, rise, s), o * shK);
  st(pIc, null, modeO('mic'));
  st(pStop, null, modeO('stop')); st(pChk, null, modeO('check'));
  var lo = Math.max(modeO('label'), modeO('agree'));
  var lu = T - W.pillLabelT;
  st(pLabA, 'translateY(' + f1(lu > 0.04 ? 8 * (1 - sp('snap', lu - 0.04)) * TR : 8 * TR) + 'px)', lo * (lu > 0.04 ? c01((lu - 0.04) / 0.16) : 0));
  st(pLabB, 'translateY(' + f1(-8 * FOC(c01(lu / 0.16)) * TR) + 'px)', lo * (1 - c01(lu / 0.16)));
  txt(pLabA, W.pillLabel); txt(pLabB, W.pillLabelPrev);
  var ap = W.pillMode === 'agree' || W.pillModePrev === 'agree' ? agreeP(T) : 0;
  st(pFill, 'scaleX(' + f3(ap) + ')', modeO('agree') > 0 ? 1 : 0);
  var tho = modeO('think'); for (var di = 0; di < pDots.length; di++){ var a = (T / 1.2) * 2 * Math.PI * (RM ? 0.25 : 1) + di * 2.094; st(pDots[di], tho > 0 ? tf(Math.cos(a) * 6, Math.sin(a) * 6) : null, tho); }
  /* bars: grow centre-out 8 ms, collapse edges-in on the same frame as the finger lift */
  var lb = tmB('listen'), lg = tmG('listen'), bo = modeO('listen'), liveBars = T >= lb && T < lg + 0.4;
  st(barsEl, null, liveBars ? 1 : 0);
  if (liveBars){
    for (var b = 0; b < 22; b++){
      var dc = Math.abs(b - 10.5), gi = c01((T - lb - 0.008 * dc) / 0.12), lvl = 0.14;
      if (T < lg) lvl = 0.14 + 0.86 * gi * W.voice * (0.35 + 0.65 * Math.abs(Math.sin(b * 1.7 + T * 9.0))) * (1 - dc / 16);
      else { var cu = c01((T - lg - 0.008 * (10.5 - dc)) / 0.16); lvl = 0.14 * (1 - cu); }
      st(bars[b], 'scaleY(' + f3(Math.max(0.02, lvl)) + ')', T < lg ? 1 : 1 - c01((T - lg - 0.1) / 0.2));
    }
  }
  var gooO = T >= lb && T < lg ? 0.9 * c01((T - lb) / 0.24) : 0; st(goo, null, gooO);
  if (gooO > 0){ for (var gi2 = 0; gi2 < gooC.length; gi2++){ var gc = gooC[gi2]; sa(gc, 'cx', f1(118 + Math.sin(T * (1.3 + gi2 * 0.4) + gi2 * 2) * 70)); sa(gc, 'cy', f1(28 + Math.sin(T * (2.1 + gi2 * 0.3) + gi2) * 8)); sa(gc, 'r', f1(11 + gi2 * 1.5 + W.voice * 9)); } }
  /* conic glow: .15 breathing in antiphase at idle, up to .8 while listening */
  var go = 0;
  if (T >= lb && T < lg + 0.24) go = T < lg ? lerp(0.15, 0.8, c01((T - lb) / 0.24)) * (0.75 + 0.25 * W.voice) : 0.8 * (1 - c01((T - lg) / 0.24));
  else if (W.pillMode === 'mic') go = 0.15 * (0.5 + 0.5 * (-bv)) * modeO('mic');
  var sheetK = T >= tmB('sheet') && T < tmG('sheet') + 0.5 ? 0 : 1;
  var gO = go * o * sheetK;
  if (gO > 0.003){ var ga = f1((T * 90) % 360) + 'deg'; if (pglow._ga !== ga){ pglow._ga = ga; pglow.style.setProperty('--ga', ga); }
    st(pglow, tf(60, 731 + rise, 1) + ' scale(' + f3(w / 236 * (0.9 + 0.25 * W.voice)) + ',' + f3(0.8 + 0.5 * W.voice) + ')', gO); }
  else st(pglow, null, 0);
}

/* ---------- chips: born from the pill top, sink back into it ---------- */
var eyebrow = $('eyebrow');
function renderChips(){
  var b = tmB('chips'), g = tmG('chips'), set = CHIPS[W.chipsSet];
  if (T < b || T > g + 0.5){ for (var ci2 = 0; ci2 < 3; ci2++) st(chipEls[ci2], null, 0); st(eyebrow, null, 0); return; }
  if (chipsEl._set !== W.chipsSet){ chipsEl._set = W.chipsSet; chipEls.forEach(function(c, i){ c.textContent = set[i]; c._w = 0; }); }
  var x = 20;
  for (var i = 0; i < 3; i++){
    var c = chipEls[i]; if (!c._w) c._w = c.offsetWidth || 160;
    var u = T - b - 0.07 * i - (W.chipsSet === 'home' ? 0.1 : 0), p = TR ? sp('emit', u) : c01(u / 0.2), sx0 = 195 - c._w / 2, sy0 = 110;
    var cx = lerp(sx0, x, p), cy = lerp(sy0, 0, p), s = lerp(0.6, 1, c01(p)), o = c01(u / 0.2);
    if (T > g){ var q = INH(c01((T - g - 0.04 * (2 - i)) / 0.24)); cx = lerp(x, sx0, q); cy = lerp(0, sy0, q); s = lerp(1, 0.6, q); o *= 1 - sstep(0.6, 1, q); }
    if (!TR){ cx = x; cy = 0; s = 1; }
    st(c, tf(cx, cy, s), u < 0 ? 0 : o);
    x += c._w + 8;
  }
  var eo = W.chipsSet === 'home' ? c01((T - b) / 0.24) * (T > g ? 1 - c01((T - g) / 0.2) : 1) : 0;
  st(eyebrow, tf(0, 6 * (1 - FOC(c01((T - b) / 0.3))) * TR), eo);
}

/* ---------- pre-permission card: blooms from a 24 px circle at the bottom rim ---------- */
var permEl = $('perm'), permBtn = permEl.querySelector('button');
function renderPerm(){
  var b = tmB('perm'), g = tmG('perm');
  if (T < b || T > g + 0.6){ sc(permEl, 'visibility', 'hidden'); return; }
  sc(permEl, 'visibility', 'visible');
  var p = T < g ? sp('emit', T - b) : 1 - sp('ret', T - g);
  var rx = 150, ry = SPH.cy + SPH.r - 488, R = lerp(12, 242, clamp(p, 0, 1.1));
  if (RM){ sc(permEl, 'clipPath', 'none'); st(permEl, null, T < g ? c01((T - b) / 0.2) : 1 - c01((T - g) / 0.2)); }
  else { var cp = 'circle(' + f1(R) + 'px at ' + rx + 'px ' + f1(ry) + 'px)'; sc(permEl, 'clipPath', cp); sc(permEl, 'webkitClipPath', cp); st(permEl, null, c01(p * 3)); }
  st(permBtn, 'scale(' + f3(pressS('perm', 0.96)) + ')', c01((T - b - 0.12) / 0.2));
  var pset = T < g && T - b > 0.6; if (permEl._set !== pset){ permEl._set = pset; permEl.classList.toggle('set', pset); }   /* blur only after settle */
}

/* ---------- iOS permission alert mocks ---------- */
var alertWrap = $('alertWrap'), alertBox = $('alertBox'), alBtns = alertBox.querySelectorAll('.bt button');
alertBox.style.cssText = 'top:333px;height:178px;display:flex;flex-direction:column';
alertBox.querySelector('p').style.flex = '1';
var ALERTS = {
  mic:['“Bobby” Would Like to Access the Microphone', 'Bobby listens only while you hold the button, to hear your question.'],
  notif:['“Bobby” Would Like to Send You Notifications', 'Notifications may include alerts, sounds, and icon badges. These can be configured in Settings.']
};
function renderAlert(){
  var b = tmB('alert'), g = tmG('alert');
  if (T < b || T > g + 0.25){ st(alertWrap, null, 0); return; }
  var A = ALERTS[W.alert] || ALERTS.mic; txt($('alT'), A[0]); txt($('alB'), A[1]);
  var o = T < g ? FAD(c01((T - b) / 0.2)) : 1 - FAD(c01((T - g) / 0.2));
  st(alertWrap, null, o); st(alertBox, 'scale(' + f3(T < g ? lerp(1.08, 1, FAD(c01((T - b) / 0.24))) : 1) + ')', 1);
  var pr = W.pr.allow; sc(alBtns[1], 'background', pr && T >= pr[0] && T < pr[1] + 0.12 ? 'rgba(255,255,255,.10)' : 'transparent');
}

/* ---------- cards: poured from the bottom rim, retract before the sphere moves ---------- */
var CARD_ORDER = [1, 2, 0], cardsEl = $('cards'), cardEls = [$('cD'), $('cT'), $('cI')], watchBtn = $('watch'), watchRoll = watchBtn.querySelector('.roll').children, sweepEl = $('sweep'), hzEl = $('hz'), xpEl = $('xp'), tpillEl = $('tpill');
function renderCards(){
  var g = tmG('cards');
  if (T < 46.8 || T > g + 0.7 || !(W.pulling || T >= tmB('commit'))){ st(cardsEl, null, 0); st(tpillEl, null, 0); return; }
  st(cardsEl, null, 1);
  var p = Math.max(0, W.reveal.x), track = W.track.x, rimY = SPH.cy + SPH.r;
  var order = CARD_ORDER;
  for (var j = 0; j < 3; j++){
    var el = cardEls[j], x = 30 + (j - track) * 340, act = 1 - c01(Math.abs(j - track)), s = lerp(0.94, 1, act), o = lerp(0.6, 1, act);
    x += 165 * (1 - s) * clamp(track - j, -1, 1);   /* neighbours shrink toward the active card, so each peek keeps its full 20 px */
    var ty = (1 - c01(p)) * Math.max(0, rimY - 236 + 8) * TR;
    var ccx = 195 - x, ccy = rimY - 236 - ty, Rmax = Math.hypot(Math.max(Math.abs(ccx), Math.abs(330 - ccx)), Math.max(Math.abs(ccy), Math.abs(420 - ccy))) + 8;
    var R = 0.5 * SPH.r + (Rmax - 0.5 * SPH.r) * Math.pow(c01(p), 1.8);
    /* contents resolve only once the clip-circle is wide enough: the rim extrudes blank glass, never text fragments */
    var veil = RM ? 0 : 1 - sstep(0.3, 0.75, p);
    if (T > g){ var q = sp('ret', T - g - 0.04 * order[j]); R = lerp(R, 0.3 * SPH.r, c01(q)); o *= 1 - sstep(0.65, 1, c01(q)); veil = Math.max(veil, RM ? 0 : sstep(0.15, 0.55, c01(q))); }
    veil = Math.round(veil * 100) / 100; if (el._vl !== veil){ el._vl = veil; el.style.setProperty('--veil', veil); }
    if (RM){ sc(el, 'clipPath', 'none'); o *= c01(p * 2) * (T > g ? 1 - c01((T - g) / 0.2) : 1); }
    else { var cp = 'circle(' + f1(R / s) + 'px at ' + f1(ccx / s + 165 * (1 - 1 / s)) + 'px ' + f1(ccy / s + 210 * (1 - 1 / s)) + 'px)'; sc(el, 'clipPath', cp); sc(el, 'webkitClipPath', cp); }
    st(el, tf(x, ty, s), o * (T >= 50.4 && j === 1 ? 1 - 0.15 * c01((T - 50.4) / 0.3) : 1));
  }
  /* thesis: Watch → label roll → one amber conic sweep → the only XP reward */
  var sv = tmB('saved'), su = T - sv, saved = su >= 0;
  st(watchBtn, 'scale(' + f3(pressS('watch', 0.96)) + ')', 1);
  var cu = c01(su / 0.2);
  sc(watchBtn, 'background', saved ? 'rgba(' + Math.round(lerp(242, 246, cu)) + ',' + Math.round(lerp(237, 185, cu)) + ',' + Math.round(lerp(228, 78, cu)) + ',' + f3(lerp(1, 0.14, cu)) + ')' : '#F2EDE4');
  sc(watchBtn, 'color', saved ? (cu > 0.5 ? '#F6B94E' : '#141210') : '#141210');
  st(watchRoll[0], 'translateY(' + f1(saved ? -8 * FOC(c01(su / 0.16)) * TR : 0) + 'px)', saved ? 1 - c01(su / 0.16) : 1);
  st(watchRoll[1], 'translateY(' + f1(saved ? (su > 0.04 ? 8 * (1 - sp('snap', su - 0.04)) * TR : 8) : 8) + 'px)', saved && su > 0.04 ? c01((su - 0.04) / 0.16) : 0);
  var sw = c01(su / 0.5), swv = f1(sw * 360) + 'deg'; if (sweepEl._sw !== swv){ sweepEl._sw = swv; sweepEl.style.setProperty('--sw', swv); } st(sweepEl, null, saved && !RM ? (sw < 1 ? 1 : 0) * sstep(0, 0.1, sw) : 0);
  st(hzEl, 'translateY(' + f1(saved ? -6 * FOC(c01(su / 0.2)) * TR : 0) + 'px)', saved ? 1 - c01(su / 0.16) : 1);
  var xp = saved ? (TR ? sp('emit', su - 0.1) : c01((su - 0.1) / 0.2)) : 0;
  st(xpEl, 'translateY(' + f1(8 * (1 - xp) * TR) + 'px) scale(' + f3(lerp(0.9, 1, c01(xp))) + ')', c01((su - 0.1) / 0.2));
  /* the thesis condenses into a pill and is swallowed */
  var tb2 = tmB('tpill'), tu = c01((T - tb2) / 0.52);
  if (T >= tb2 && tu < 1){
    var q2 = INH(tu), x0 = 195, y0 = 262, cx2 = 262, cy2 = 150, x1 = 195, y1 = SPH.cy;
    var bx = (1 - q2) * (1 - q2) * x0 + 2 * (1 - q2) * q2 * cx2 + q2 * q2 * x1, by = (1 - q2) * (1 - q2) * y0 + 2 * (1 - q2) * q2 * cy2 + q2 * q2 * y1;
    if (!TR){ bx = x1; by = y1; }
    st(tpillEl, tf(bx, by, lerp(1, 0.25, sstep(0.65, 1, q2))), c01((T - tb2) / 0.1) * (1 - sstep(0.65, 1, q2)));
  } else st(tpillEl, null, 0);
}

/* ---------- sign-in sheet: poured from the sphere base, drains back ---------- */
var sheetEl = $('sheet'), sheetBody = $('sheetBody'), sheetItems = [$('grab'), $('shT'), $('shB'), $('apple'), $('google'), $('notnow')];
function renderSheet(){
  var b = tmB('sheet'), g = tmG('sheet');
  if (T < b || T > g + 0.9){ sc(sheetBody, 'visibility', 'hidden'); for (var si2 = 0; si2 < sheetItems.length; si2++) st(sheetItems[si2], null, 0); st(sheetEl, null, 0); return; }
  st(sheetEl, null, 1); sc(sheetBody, 'visibility', 'visible');
  var u = T - b, p1 = TR ? sp('emit', u) : 1, p2 = TR ? sp('soft', u - 0.14) : 1, bo = RM ? c01(u / 0.2) : 1;
  if (T > g){ var d = T - g; p2 = TR ? 1 - sp('ret', d) : 1; p1 = TR ? 1 - sp('ret', d - 0.22) : 1; bo = RM ? 1 - c01(d / 0.2) : 1 - sstep(0.42, 0.52, d); }
  var w = lerp(96, 390, clamp(p1, 0, 1.05)), h = lerp(8, 376, clamp(p2, 0, 1.02));
  sc(sheetBody, 'width', f1(w) + 'px'); sc(sheetBody, 'height', f1(h) + 'px'); sc(sheetBody, 'borderRadius', h > 40 ? '32px 32px 0 0' : '4px');
  st(sheetBody, tf(195 - w / 2, 468), bo);
  for (var i = 0; i < sheetItems.length; i++){
    var e = sheetItems[i], iu = T - b - 0.30 - 0.07 * i, ip = TR ? sp('soft', iu) : c01(iu / 0.2), io = c01(iu / 0.24);
    if (T > g) io *= 1 - c01((T - g - 0.03 * (sheetItems.length - 1 - i)) / 0.16);
    var s = i === 5 ? pressS('notnow', 0.96) : 1;
    st(e, tf(0, 12 * (1 - ip) * TR, s), iu < 0 ? 0 : io);
  }
}

/* ---------- Desk ghost satellite + "saved on this device" ---------- */
var gsat = $('gsat'), savedTag = $('savedTag'), savedRoll = savedTag.querySelector('.roll>span');
function renderGsat(){
  var b = tmB('gsat');
  if (T < b){ st(gsat, null, 0); st(savedTag, null, 0); return; }
  if (!gsat._w){ gsat._w = gsat.offsetWidth || 140; gsat._h = gsat.offsetHeight || 46; }
  /* UR slot at full size (the 11 px label floor forbids the .8 ghost scale): right edge 18 px from the frame,
     lower-left corner 16 px from the glass at idle (340, r120) */
  var GS = 1, sx = Math.min(300, 372 - gsat._w / 2), sy = 178, ang = Math.atan2(sy - SPH.dcy, sx - 195), rx = 195 + Math.cos(ang) * SPH.dr, ry = SPH.dcy + Math.sin(ang) * SPH.dr;
  var p = TR ? sp('emit', T - b) : c01((T - b) / 0.2), dr = RM ? 0 : Math.sin(2 * Math.PI * W.bph / 2 + 0.6);
  var dth = W.theta.x - W.thBase, x = Math.min(372 - gsat._w / 2, lerp(rx, sx, p) - Math.sin(dth) * 60), y = lerp(ry, sy, p) + dr * 2;
  var o = 0.7 * c01(p * 1.4) * rimMask(x, y) * (1 - 0.85 * c01(Math.abs(dth) / 0.7)) * (1 - (tmB('dim') <= T ? c01((T - tmB('dim')) / 0.4) : 0));
  st(gsat, tf(x - gsat._w / 2, y - gsat._h / 2, GS * lerp(0.6, 1, c01(p))), o);
  var tb3 = tmB('savedTag'), tg3 = tmG('savedTag'), tu = T - tb3;
  if (T < tb3 || T > tg3 + 0.3){ st(savedTag, null, 0); return; }
  var yy = tu < 0.16 ? 8 * (1 - (TR ? sp('snap', tu) : 1)) : 0, oo = c01(tu / 0.16);
  if (T > tg3){ var q = c01((T - tg3) / 0.16); yy = -8 * FOC(q); oo = 1 - q; }
  /* right-aligned with the satellite, 8 px above it (directly under it would cross the glass) */
  st(savedTag, tf(sx + gsat._w * GS / 2 - 200, sy - gsat._h * GS / 2 - 8 - 14), 1); st(savedRoll, 'translateY(' + f1(yy * TR) + 'px)', oo);
}

/* ---------- ghost finger, dim, pause ---------- */
function renderGhost(){
  var g = ghostAt(T);
  st(ghostEl, tf(g.x, g.y, g.p ? 0.84 : 1), g.v * 0.95);
  sc(ghostEl, 'background', g.p ? 'rgba(242,237,228,.12)' : 'transparent');
}
var dimEl = $('dim');
function renderDim(){ var b = tmB('dim'); st(dimEl, null, T >= b ? FAD(c01((T - b) / 0.4)) : 0); }
