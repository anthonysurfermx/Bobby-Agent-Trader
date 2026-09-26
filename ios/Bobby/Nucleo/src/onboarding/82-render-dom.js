
/* ---------- the question: transcript words, the bead, the wait inside ---------- */
var txEl = $('tx'), txIn = $('txIn'), qbead = $('qbead'), tbead = $('tbead'), live = $('live');
function gatherRank(i, n){ return i <= (n - 1) / 2 ? 2 * i : 2 * (n - 1 - i) + 1; }   /* outside-in, alternating */
function renderQuestion(){
  var wb = tmB('words'), wg = tmG('words'), gb = tmB('gather'), n = W.qw.length;
  var show = n > 0 && T >= wb && T < wg + 0.2;
  st(txEl, null, show ? (T > wg ? 1 - c01((T - wg) / 0.2) : 1) : 0);
  if (show){
    var shift = W.txShift.x; st(txIn, 'translateX(' + f1(shift) + 'px)');
    for (var i = 0; i < n; i++){
      var w = W.qw[i], el = w.el; if (!el) continue;
      var u = T - w.born, o = 0, y = 0, b = 0, dx = 0, s = 1;
      if (u >= 0){ var k = FOC(c01(u / 0.3)); o = k; y = 18 * (1 - k) * TR; b = 6 * (1 - k); }
      if (T >= gb && gb > wb){
        if (w._cx == null){ w._cx = el.offsetLeft + el.offsetWidth / 2; w._cy = el.offsetTop + 15; }
        var gu = c01((T - gb - 0.022 * gatherRank(i, n)) / 0.24), q = INH(gu);
        dx = (175 - shift - w._cx) * q; y += (558 - 528 - w._cy) * q; s = lerp(1, 0.2, q); o *= 1 - sstep(0.5, 1, gu);
      } else w._cx = null;
      sc(el, 'color', i === n - 1 && !W.qFinal ? '#A39C91' : '#F2EDE4');   /* the tail stays ink2 until final */
      st(el, 'translate(' + f1(dx) + 'px,' + f1(y) + 'px) scale(' + f3(s) + ')', o, bl(RM ? 0 : b));
    }
  }
  /* bead: forms from the gathered words, arcs into the bottom rim (12 px arc, inhale 360 ms) */
  var bo = 0, x = 195, y2 = 558, s2 = 1;
  if (T >= gb + 0.24 && T < gb + 0.84){
    var f = c01((T - gb - 0.24) / 0.14); bo = f; s2 = lerp(0.4, 1, EXH(f));
    var au = c01((T - gb - 0.38) / 0.36), q2 = INH(au), ty2 = SPH.cy + SPH.r;
    x = 195 + Math.sin(Math.PI * q2) * 12 * TR; y2 = lerp(558, ty2, q2);
    bo *= rimMask(x, y2) > 0 ? 1 - sstep(0.85, 1, q2) : 0;
  }
  st(tbead, tf(x, y2, s2), bo);
  /* the question waits inside the glass, orbiting at ρ .2, until the read begins (then it bursts into the currents) */
  var ib = tmB('qwait'), bu = tmB('burst'), end = Math.min(bu + 0.3, tmG('qwait') + 0.25), io = 0, ix = 195, iy = SPH.cy, isc = 1;
  if (T >= ib && T < end){
    io = 0.85 * c01((T - ib) / 0.25); var ang = 0.8 * (T - ib) * (RM ? 0.25 : 1), rho = 0.2 * SPH.r;
    if (T >= bu){ var du = c01((T - bu) / 0.12); rho *= 1 - FOC(du); var bu2 = c01((T - bu - 0.1) / 0.2); isc = 1 + 1.5 * bu2; io *= 1 - bu2; }
    else if (T > tmG('qwait')) io *= 1 - c01((T - tmG('qwait')) / 0.25);
    ix = 195 + Math.cos(ang) * rho; iy = SPH.cy + Math.sin(ang) * rho;
  }
  st(qbead, tf(ix, iy, 0.8 * isc), io);
}

/* ---------- agent labels + tethers ---------- */
var thEls = [$('thA'), $('thR'), $('thC')];
var AG_SCR = [-140 * Math.PI / 180, -40 * Math.PI / 180, Math.PI / 2], AG_KEY = ['agent.alpha', 'agent.red', 'agent.cio'];
function renderAgents(){
  var trailer = W.agMode === 'trailer', stances = W.agMode === 'stances', keys = trailer ? ['trA', 'trR', 'trC'] : ['agA', 'agR', 'agC'];
  var thGone = trailer ? 1e9 : tmG('tethers');
  for (var i = 0; i < 3; i++){
    var el = agEls[i], b = tmB(keys[i]), g = tmG(keys[i]);
    if (T < b || T > g + 0.5){ st(el, null, 0); sa(thEls[i], 'opacity', '0'); continue; }
    var top = i < 2 ? 188 : (trailer ? 467 : 528), left = i === 0 ? 20 : (i === 1 ? 214 : 85), w = i === 2 ? 220 : 156;
    var h = stances ? (el._h || 60) : 14;
    var lx = left + w / 2, ly = top + h / 2, vx = lx - 195, vy = ly - SPH.dcy, vl = Math.sqrt(vx * vx + vy * vy) || 1; vx /= vl; vy /= vl;
    var p = TR ? sp('soft', T - b - 0.12) : c01((T - b) / 0.2), o = c01((T - b - 0.1) / 0.28), off = -10 * (1 - p) * TR, blur = 6 * (1 - c01((T - b - 0.1) / 0.3));
    if (T > g){ var q = INH(c01((T - g) / 0.36)); off = -10 * q * TR; o *= 1 - sstep(0.6, 1, q); blur = 4 * q; }
    st(el, tf(off * vx, off * vy), o, bl(RM ? 0 : blur));
    sc(el, 'top', top + 'px'); txt(agN[i], RMOD ? RMOD.t(LANG, AG_KEY[i]) : '');
    sc(agSt[i], 'display', stances ? '' : 'none');
    if (stances && i < 2){ var ws2 = agStW[i]; for (var j = 0; j < ws2.length; j++){ var wu = c01((T - W.stanceT[i] - 0.045 * j) / 0.26); st(ws2[j], 'translateY(' + f1(3 * (1 - FOC(wu)) * TR) + 'px)', FOC(wu), bl(RM ? 0 : 2.5 * (1 - wu))); } }
    if (stances && i === 2){
      var ws3 = agStW[2]; for (var j2 = 0; j2 < ws3.length; j2++){ var wu2 = c01((T - W.stanceT[2] - 0.045 * j2) / 0.26); st(ws3[j2], 'translateY(' + f1(3 * (1 - FOC(wu2)) * TR) + 'px)', FOC(wu2), bl(RM ? 0 : 2.5 * (1 - wu2))); }
      var rb = tmB('cioRoll'), ru = T - rb;
      st(agCroll[0], 'translateY(' + f1(ru > 0 ? -8 * FOC(c01(ru / 0.16)) : 0) + 'px)', ru > 0 ? 1 - c01(ru / 0.16) : 1);
      st(agCroll[1], 'translateY(' + f1(ru > 0.04 ? 8 * (1 - sp('snap', ru - 0.04)) : 8) + 'px)', ru > 0.04 ? c01((ru - 0.04) / 0.16) : 0);
    }
    /* tether: 0.5 px at 35% of the hue, from the label anchor to the rim at its angle */
    var ax = i === 0 ? 48 : (i === 1 ? 342 : 195), ay = i < 2 ? top + h + 6 : top - 5;
    var ra = AG_SCR[i], rx = 195 + Math.cos(ra) * SPH.dr, ry = SPH.dcy + Math.sin(ra) * SPH.dr;
    var tu = c01((T - b) / 0.28), draw = DAT(tu), end = Math.min(g, thGone);
    if (T > end){ draw *= 1 - INH(c01((T - end) / 0.32)); }
    var d = 'M' + f1(rx) + ',' + f1(ry) + ' Q' + f1((rx + ax) / 2 + (i === 2 ? 0 : (i === 0 ? -10 : 10))) + ',' + f1((ry + ay) / 2) + ' ' + f1(ax) + ',' + f1(ay);
    sa(thEls[i], 'd', d);
    var L = 220; sc(thEls[i], 'strokeDasharray', f1(L * draw) + ' ' + L); sa(thEls[i], 'opacity', draw > 0.002 ? '1' : '0');
  }
}

/* ---------- captions: karaoke with a 3-word pulse-sweep front ---------- */
var INK_B = [255, 248, 236], INK = [242, 237, 228];
function wordState(w, lt, hot){
  var u = T - lt, o, b, y, col;
  if (u < 0){ var pre = c01(1 + u / 0.5); o = 0.16 + 0.12 * pre; b = 2.5 - 1.0 * pre; y = 2 - 1 * pre; col = 'rgb(242,237,228)'; }
  else { var k = FOC(c01(u / 0.26)); o = lerp(0.3, 1, k); b = lerp(1.4, 0, k); y = lerp(1, 0, k);
    var cu = c01(u / 0.6); col = hot ? hot : 'rgb(' + Math.round(lerp(INK_B[0], INK[0], cu)) + ',' + Math.round(lerp(INK_B[1], INK[1], cu)) + ',' + Math.round(lerp(INK_B[2], INK[2], cu)) + ')'; }
  if (RM){ b = 0; y = 0; }
  sc(w, 'color', col); st(w, y ? 'translateY(' + f1(y) + 'px)' : 'none', o, bl(b));
}
var capLine = $('capLine');
function renderCaptions(){
  var ln0 = null;
  for (var s = 0; s < 2; s++){
    var el = capEls[s], c = W.caps[s];
    if (!c || T < c.born || T > c.gone + 0.32){ st(el, null, 0); continue; }
    var ln = c.ln, P = ln.pages[c.k], key = ln.key + ':' + c.k + ':' + c.top;
    if (el._pid !== key){
      el._pid = key; el._h = 0; c.lw = null;
      el._w = spans(el, ln.words.slice(P.w0, P.w1).join(' ')); sc(el, 'top', c.top + 'px');
      /* a short two-sentence page breaks at the sentence (a new sentence starts line 2) */
      if (el._w.length <= 12){ for (var bi2 = 0; bi2 < el._w.length - 1; bi2++){ if (/[.!?…]\s*$/.test(el._w[bi2].textContent) && bi2 >= 1){ var wb = el._w[bi2]; wb.textContent = wb.textContent.replace(/ $/, ''); el.insertBefore(document.createElement('br'), wb.nextSibling); break; } } }
    }
    if (!el._h) el._h = el.offsetHeight || 31;
    var p = sp('soft', T - c.born), y = -8 * (1 - p) * TR, sy = 1, o = c01((T - c.born) / 0.2);
    if (T > c.gone){
      var q = c01((T - c.gone) / 0.3);
      if (c.lw == null){ var mn = 1e9, mx = -1e9; el._w.forEach(function(w){ mn = Math.min(mn, w.offsetLeft); mx = Math.max(mx, w.offsetLeft + w.offsetWidth); }); c.lw = Math.max(24, mx - mn); }
      if (RM) o *= 1 - c01((T - c.gone) / 0.2);
      else { y = 0; sy = 1 - 0.9 * FOC(c01(q / 0.4)); o *= 1 - sstep(0.1, 0.4, q); ln0 = { y0:c.top + el._h / 2, q:q, w:c.lw }; }
    }
    sc(el, 'transformOrigin', '50% 50%');
    st(el, 'translate3d(0,' + f1(y) + 'px,0)' + (sy < 0.999 ? ' scaleY(' + f3(sy) + ')' : ''), o);
    for (var i = 0; i < el._w.length; i++){ var wi = P.w0 + i; wordState(el._w[i], estLit(ln, wi), W.verdictShown && ln.amberIdx === wi ? W.vcolHex : null); }
  }
  /* the words fold into one 2 px line, which rises into the glass and is masked by the rim */
  if (ln0){
    var dist = Math.max(10, ln0.y0 - (SPH.dcy + SPH.dr) + 6), rq = INH(c01((ln0.q - 0.3) / 0.7)), ly = ln0.y0 - dist * rq, lw = ln0.w * lerp(1, 0.1, rq);
    st(capLine, tf(195, ly) + ' scaleX(' + f3(lw / 200) + ')', sstep(0.05, 0.3, ln0.q) * (1 - sstep(0.8, 1, ln0.q)) * rimMask(195, ly));
  } else st(capLine, null, 0);
}

/* ---------- exhaled text (greeting-style): drop from the rim, inhale back ---------- */
function dropWords(ws, born, gone, dir, stag){
  var es = Math.min(0.035, 0.12 / Math.max(1, ws.length - 1));
  for (var i = 0; i < ws.length; i++){
    var u = T - born - stag * i, p = TR ? sp('soft', u) : c01(u / 0.2), o = c01(u / 0.3), b = 6 * (1 - c01(u / 0.36)), y = dir * 14 * (1 - p) * TR;
    if (T > gone){ var q = INH(c01((T - gone - es * (ws.length - 1 - i)) / 0.3)); y = dir * 14 * q * TR; o *= 1 - sstep(0.5, 1, q); b = 4 * q; }
    if (RM) b = 0;
    st(ws[i], 'translateY(' + f1(y) + 'px)', u < 0 ? 0 : o, bl(b));
  }
}
var titleEl = $('title'), subEl = $('sub'), cap2El = $('cap2'), promptEl = $('prompt'), wmBig = $('wmBig'), metaEl = $('meta');
var wmEl = $('wm'), dqEl = $('dq'), closeEl = $('close'), avatarEl = $('avatar'), xpArcEl = $('xpArc'), noticeEl = $('notice'), pnameEl = $('pname'), pcountEl = $('pcount');
var titleW = [], subW = [], cap2W = [], cap2K = null, promptW = null;
function renderTexts(){
  if (W.title && titleEl._k !== W.title[0] + '|' + W.title[1]){ titleEl._k = W.title[0] + '|' + W.title[1]; titleW = spans(titleEl, W.title[0]); subW = spans(subEl, W.title[1]); }
  var tb0 = tmB('title'), tg0 = tmG('title'), on = T >= tb0 && T < tg0 + 0.6;
  st(titleEl, null, on ? 1 : 0); st(subEl, null, on ? 1 : 0);
  if (on){ dropWords(titleW, tb0, tg0, -1, 0.055); dropWords(subW, tb0 + 0.12, tg0 + 0.04, -1, 0.03); }
  if (W.cap2 !== cap2K){ cap2K = W.cap2; cap2W = spans(cap2El, W.cap2 || ''); }
  var c2b = tmB('cap2'), c2g = tmG('cap2'), c2on = T >= c2b && T < c2g + 0.6; st(cap2El, null, c2on ? 1 : 0);
  if (c2on){ sc(cap2El, 'top', (W.errLine ? 592 : 553) + 'px'); dropWords(cap2W, c2b, c2g, -1, 0.03); }
  if (!promptW) promptW = spans(promptEl, Ls('pick.prompt'));
  var pb = tmB('prompt'), pg = tmG('prompt'), pon = T >= pb && T < pg + 0.6; st(promptEl, null, pon ? 1 : 0);
  if (pon) dropWords(promptW, pb, pg, 1, 0.05);
  /* birth wordmark, then FLIP into the header */
  var wb = tmB('wmBig'), wf = tmB('wmFly');
  if (!wmEl._w) wmEl._w = wmEl.offsetWidth || 62;
  if (T >= wb && T < wf + 0.8){
    var k = FOC(c01((T - wb) / 0.6)), o = c01((T - wb) / 0.3), bb = 8 * (1 - k), x = 0, y = 0, s = 1;
    if (T >= wf){ var p = sp('soft', T - wf); var hx = 20 + wmEl._w / 2, dx = hx - 195, dy = 76 - 536; x = dx * p; y = dy * p; s = lerp(1, 24 / 44, p); o *= 1 - sstep(0.1, 0.6, c01((T - wf) / 0.7)); bb = 0; }
    if (RM){ x = 0; y = 0; s = 1; bb = 0; }
    st(wmBig, tf(x, y, s), o, bl(bb));
  } else st(wmBig, null, 0);
  /* header: wordmark / docked question + × / avatar with its XP arc */
  var dk = tmB('dock'), dg = tmG('dock'), wo = 0, wx = 0, wy = 0, ws = 1;
  if (T >= wf){
    var fp = sp('soft', T - wf); wo = sstep(0.3, 0.8, c01((T - wf) / 0.7)); wx = -(20 + wmEl._w / 2 - 195) * (1 - fp); wy = (536 - 76) * (1 - fp); ws = lerp(44 / 24, 1, fp);
    if (RM){ wx = 0; wy = 0; ws = 1; wo = c01((T - wf) / 0.2); }
    if (T >= dk && T < dg){ var du = c01((T - dk) / 0.16); wy = -8 * du; wo *= 1 - du; }
    if (T >= dg){ var ru = T - dg - 0.14; wy = ru > 0 ? 8 * (1 - sp('snap', ru)) * TR : 8; wo *= ru > 0 ? c01(ru / 0.16) : 0; }
  }
  st(wmEl, tf(wx, wy, ws), wo);
  if (T >= dk && T < dg + 0.2){
    var qt = String(W.question || '').slice(0, 90), nch = Math.max(0, Math.min(qt.length, Math.floor((T - dk - 0.16) / 0.01))); txt(dqEl, qt.slice(0, nch));
    var dqo = T > dg ? 1 - c01((T - dg) / 0.16) : 1; st(dqEl, null, dqo); st(closeEl, null, c01((T - dk - 0.16) / 0.16) * dqo * c01(W.closeK.x));
  } else { st(dqEl, null, 0); st(closeEl, null, 0); }
  cls(closeEl, 'on', closeActive());
  var ab = tmB('avaFly') + 0.48; st(avatarEl, null, T >= ab ? c01((T - ab) / 0.12) : 0);
  var xpv = W.xpArc.x; sa(xpArcEl, 'stroke-dasharray', f1(94.25 * xpv) + ' 94.25'); sa(xpArcEl, 'opacity', xpv > 0.004 ? '1' : '0');
  /* meta line under the verdict caption */
  var mb = tmB('meta'), mg = tmG('meta'), mo = T >= mb ? c01((T - mb) / 0.24) * (T > mg ? 1 - c01((T - mg) / 0.2) : 1) : 0;
  if (mo > 0 && M){
    txt(metaEl, M.meta);
    var cy0 = 592 + 62; for (var sx = 0; sx < 2; sx++){ var cc = W.caps[sx]; if (cc && cc.ln === W.readLine && cc.gone > mb){ cy0 = cc.top + (capEls[sx]._h || 62); } }
    st(metaEl, tf(0, cy0 + 8 + 6 * (1 - FOC(c01((T - mb) / 0.3))) * TR), mo);
  } else st(metaEl, null, 0);
}

/* ---------- O2 picker: name + counter roll 12 px in the swipe direction ---------- */
var pnameRoll = pnameEl.querySelector('.roll').children, pcountRoll = pcountEl.querySelector('.roll').children;
var pavaEl = $('pava'), pavaUri = null;
function renderPicker(){
  var nb = tmB('pname'), ng = tmG('pname');
  if (T < nb || T > ng + 0.5 || !NPICK || !W.pickRoll.length){ st(pnameEl, null, 0); st(pcountEl, null, 0); st(pavaEl, null, 0); return; }
  var p = TR ? sp('soft', T - nb) : 1, o = c01((T - nb) / 0.3), y = -14 * (1 - p) * TR;
  if (T > ng){ var q = INH(c01((T - ng) / 0.3)); y = -14 * q * TR; o *= 1 - sstep(0.5, 1, q); }
  st(pnameEl, tf(0, y), o); st(pcountEl, tf(0, y), o * c01((T - nb - 0.08) / 0.3));
  var R = W.pickRoll, cur = R[R.length - 1], prev = R.length > 1 ? R[R.length - 2] : null;
  /* the companion is an avatar, never a figure inside the glass */
  var uri = PICKS[cur.i] && PICKS[cur.i].art ? PICKS[cur.i].art.uri : null;
  if (uri !== pavaUri){ pavaUri = uri; pavaEl.style.backgroundImage = uri ? 'url("' + uri + '")' : ''; }
  st(pavaEl, tf(0, y), o);
  var ru = T - cur.t, dir = cur.dir;
  txt(pnameRoll[0], PICKS[cur.i].label); txt(pcountRoll[0], Ls('pick.count', { i:cur.i + 1, n:NPICK }));
  txt(pnameRoll[1], prev ? PICKS[prev.i].label : ''); txt(pcountRoll[1], prev ? Ls('pick.count', { i:prev.i + 1, n:NPICK }) : '');
  var inX = dir ? 12 * dir * (1 - (TR ? sp('snap', ru - 0.04) : 1)) : 0, inO = dir ? c01((ru - 0.04) / 0.16) : 1;
  var outX = -12 * dir * FOC(c01(ru / 0.16)) * TR, outO = prev ? 1 - c01(ru / 0.16) : 0;
  st(pnameRoll[0], 'translateX(' + f1(inX) + 'px)', inO); st(pcountRoll[0], 'translateX(' + f1(inX) + 'px)', inO);
  st(pnameRoll[1], 'translateX(' + f1(outX) + 'px)', outO); st(pcountRoll[1], 'translateX(' + f1(outX) + 'px)', outO);
}

/* ---------- risk notice: the 4 real titles, pulse-swept, then statement 1's body ---------- */
function renderLines(){
  var b = tmB('lines'), g = tmG('lines'), n = lineEls.length;
  if (T < b || T > g + 0.6 || !RISK_LAYOUT){ st(linesEl, null, 0); }
  else {
    st(linesEl, null, 1);
    for (var i = 0; i < n; i++){
      var lb = b + 0.18 * i, ln = lineEls[i], p = TR ? sp('soft', T - lb) : 1, y = -8 * (1 - p) * TR, o = c01((T - lb + 0.1) / 0.2);
      if (T > g){ var q = INH(c01((T - g - 0.04 * (n - 1 - i)) / 0.3)); y = -14 * q * TR; o *= 1 - sstep(0.5, 1, q); }
      st(ln, tf(0, y), o);
      for (var j = 0; j < lineW[i].length; j++) wordState(lineW[i][j], lb + 0.06 + 0.055 * j, null);
    }
    var rb = b + 0.18 * n + 0.1, rp = TR ? sp('soft', T - rb) : 1, ry = 6 * (1 - rp) * TR, ro = c01((T - rb) / 0.3);
    if (T > g){ var q2 = INH(c01((T - g) / 0.3)); ry = -14 * q2 * TR; ro *= 1 - sstep(0.5, 1, q2); }
    st(rbodyEl, tf(0, ry), ro);
  }
  var nb = tmB('notice'), ng = tmG('notice'), no = T >= nb ? c01((T - nb) / 0.24) * (T > ng ? 1 - c01((T - ng) / 0.2) : 1) : 0;
  st(noticeEl, no > 0 ? tf(0, 6 * (1 - FOC(c01((T - nb) / 0.3))) * TR) : null, no);
  cls(noticeEl, 'tap', no > 0.5 && T < ng);
}

/* ---------- hint row: 160 ms text roll ---------- */
var hintRoll = $('hint').querySelector('.roll').children;
var CHEV = ' <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1 L5 5 L9 1" fill="none" stroke="#A39C91" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function hintHTML(s){ return s ? esc(s) + (s === Ls('hint.pull') ? CHEV : '') : ''; }
function renderHint(){
  var u = T - W.hintT;
  if (hintRoll[0]._s !== W.hint){ hintRoll[0]._s = W.hint; hintRoll[0].innerHTML = hintHTML(W.hint); }
  if (hintRoll[1]._s !== W.hintPrev){ hintRoll[1]._s = W.hintPrev; hintRoll[1].innerHTML = hintHTML(W.hintPrev); }
  var k = T >= tmB('sheet') && T < tmG('sheet') + 0.3 ? 0 : 1;   /* the sheet covers the hint row */
  st(hintRoll[0], 'translateY(' + f1(u > 0.04 ? 8 * (1 - sp('snap', u - 0.04)) * TR : 8 * TR) + 'px)', (u > 0.04 ? c01((u - 0.04) / 0.16) : 0) * k);
  st(hintRoll[1], 'translateY(' + f1(-8 * FOC(c01(u / 0.16)) * TR) + 'px)', (1 - c01(u / 0.16)) * k);
}

/* ---------- the black pill: origin of everything the user says ---------- */
function modeO(m){ var mt = W.pillModeT == null ? -9 : W.pillModeT, u = c01((T - mt) / 0.16); return W.pillMode === m ? u : (W.pillModePrev === m ? 1 - u : 0); }
function pressS(k, depth){
  var pr = W.pr[k]; if (!pr || T < pr[0]) return 1;
  if (T < pr[1]) return lerp(1, depth, sp('snap', T - pr[0]));
  return depth + (1 - depth) * sp('emit', T - pr[1]);
}
function renderPill(){
  var pb = tmB('pillIn');
  if (T < pb){ st(pill, null, 0); st(pglow, null, 0); sc(pill, 'pointerEvents', 'none'); return; }
  var w = W.pillW.x, rise = TR ? 28 * (1 - sp('soft', T - pb)) : 0, o = c01((T - pb) / 0.24), bv = breathV(W.bph);
  var s = pressS('pill', 0.94);
  if (W.pillMode === 'mic' && W.micBreath) s *= 1 + 0.0175 * (1 + bv) * (RM ? 0.3 : 1);
  sc(pill, 'width', f1(w) + 'px');
  /* under the sheet and behind the cards the pill sinks away, so its black shape never ghosts through the glass */
  var hb = tmB('pillHide'), hg = tmG('pillHide'), shK = 1;
  if (T >= hb) shK = T < hg ? 1 - c01((T - hb - 0.05) / 0.2) : c01((T - hg - 0.2) / 0.3);
  st(pill, tf(195 - w / 2, rise + (1 - shK) * 12 * TR, s), o * shK);
  sc(pill, 'pointerEvents', shK > 0.5 ? 'auto' : 'none');
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
  var lb = tmB('listen'), lg = tmG('listen'), liveBars = T >= lb && T < lg + 0.4;
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
  var go2 = 0;
  if (T >= lb && T < lg + 0.24) go2 = T < lg ? lerp(0.15, 0.8, c01((T - lb) / 0.24)) * (0.75 + 0.25 * W.voice) : 0.8 * (1 - c01((T - lg) / 0.24));
  else if (W.pillMode === 'mic' && W.micBreath) go2 = 0.15 * (0.5 + 0.5 * (-bv)) * modeO('mic');
  var gO = go2 * o * shK;
  if (gO > 0.003){ var ga = f1((T * 90) % 360) + 'deg'; if (pglow._ga !== ga){ pglow._ga = ga; pglow.style.setProperty('--ga', ga); }
    st(pglow, tf(60, 731 + rise, 1) + ' scale(' + f3(w / 236 * (0.9 + 0.25 * W.voice)) + ',' + f3(0.8 + 0.5 * W.voice) + ')', gO); }
  else st(pglow, null, 0);
}

/* ---------- chips: born from the pill top, sink back into it ---------- */
var eyebrow = $('eyebrow');
function renderChips(){
  var b = tmB('chips'), g = tmG('chips'), set = W.chips;
  if (T < b || T > g + 0.5 || !set.length){ for (var ci2 = 0; ci2 < 3; ci2++){ st(chipEls[ci2], null, 0); cls(chipEls[ci2], 'on', false); } st(eyebrow, null, 0); return; }
  if (chipsEl._set !== W.chipsKey){ chipsEl._set = W.chipsKey; chipEls.forEach(function(c, i){ c.textContent = set[i] ? set[i].label : ''; c._w = 0; c.style.display = set[i] ? '' : 'none'; }); }
  var x = 20;
  for (var i = 0; i < 3; i++){
    var c = chipEls[i]; if (!set[i]){ cls(c, 'on', false); continue; }
    if (!c._w) c._w = c.offsetWidth || 160;
    var u = T - b - 0.07 * i, p = TR ? sp('emit', u) : c01(u / 0.2), sx0 = 195 - c._w / 2, sy0 = 110;
    var cx = lerp(sx0, x, p), cy = lerp(sy0, 0, p), s = lerp(0.6, 1, c01(p)) * pressS('chip' + i, 0.96), o = c01(u / 0.2);
    if (T > g){ var q = INH(c01((T - g - 0.04 * (2 - i)) / 0.24)); cx = lerp(x, sx0, q); cy = lerp(0, sy0, q); s = lerp(1, 0.6, q); o *= 1 - sstep(0.6, 1, q); }
    if (!TR && T <= g){ cx = x; cy = 0; s = 1; }
    st(c, tf(cx, cy, s), u < 0 ? 0 : o);
    cls(c, 'on', T < g && o > 0.5);
    x += c._w + 8;
  }
  st(eyebrow, null, 0);
}

/* ---------- pre-permission card: blooms from a 24 px circle at the bottom rim ---------- */
var permEl = $('perm'), permBtn = $('permGo');
function renderPerm(){
  var b = tmB('perm'), g = tmG('perm');
  if (T < b || T > g + 0.6){ sc(permEl, 'visibility', 'hidden'); return; }
  sc(permEl, 'visibility', 'visible');
  if (!permEl._h) permEl._h = permEl.offsetHeight || 170;
  var p = T < g ? sp('emit', T - b) : 1 - sp('ret', T - g);
  var rx = 150, ry = SPH.cy + SPH.r - 486, Rm = Math.sqrt(150 * 150 + Math.pow(permEl._h - ry, 2)) + 10, R = lerp(12, Rm, clamp(p, 0, 1.1));
  if (RM){ sc(permEl, 'clipPath', 'none'); st(permEl, null, T < g ? c01((T - b) / 0.2) : 1 - c01((T - g) / 0.2)); }
  else { var cp = 'circle(' + f1(R) + 'px at ' + rx + 'px ' + f1(ry) + 'px)'; sc(permEl, 'clipPath', cp); sc(permEl, 'webkitClipPath', cp); st(permEl, null, c01(p * 3)); }
  st(permBtn, 'scale(' + f3(W.permBusy ? 0.96 : 1) + ')', c01((T - b - 0.12) / 0.2));
  var pset = T < g && T - b > 0.6; if (permEl._set !== pset){ permEl._set = pset; permEl.classList.toggle('set', pset); }
}

/* ---------- cards: poured from the bottom rim, retract before the sphere moves ---------- */
var saveBtn = $('save'), saveRoll = saveBtn.querySelector('.roll').children, sweepEl = $('sweep'), hzEl = $('hz'), xpEl = $('xp'), tpillEl = $('tpill'), dRows = $('dRows');
function renderCards(){
  var g = tmG('cards'), on = !!M && CARDS.length && (W.pulling || T >= tmB('commit')) && T <= g + 0.7 && W.state !== 'ERROR';
  if (!on){ st(cardsEl, null, 0); st(tpillEl, null, 0); cls(saveBtn, 'tap', false); return; }
  st(cardsEl, null, 1);
  var p = Math.max(0, W.reveal.x), track = W.track.x, rimY = SPH.cy + SPH.r, ti = CARDS.indexOf(cardT);
  for (var j = 0; j < CARDS.length; j++){
    var el = CARDS[j], x = 30 + (j - track) * 340, act = 1 - c01(Math.abs(j - track)), s = lerp(0.94, 1, act), o = lerp(0.6, 1, act);
    x += 165 * (1 - s) * clamp(track - j, -1, 1);
    var ty = (1 - c01(p)) * Math.max(0, rimY - 236 + 8) * TR;
    var ccx = 195 - x, ccy = rimY - 236 - ty, Rmax = Math.hypot(Math.max(Math.abs(ccx), Math.abs(330 - ccx)), Math.max(Math.abs(ccy), Math.abs(420 - ccy))) + 8;
    var R = 0.5 * SPH.r + (Rmax - 0.5 * SPH.r) * Math.pow(c01(p), 1.8);
    var veil = RM ? 0 : 1 - sstep(0.3, 0.75, p);
    if (T > g){ var q = sp('ret', T - g - 0.04 * Math.abs(j - ti)); R = lerp(R, 0.3 * SPH.r, c01(q)); o *= 1 - sstep(0.65, 1, c01(q)); veil = Math.max(veil, RM ? 0 : sstep(0.15, 0.55, c01(q))); }
    veil = Math.round(veil * 100) / 100; if (el._vl !== veil){ el._vl = veil; el.style.setProperty('--veil', veil); }
    if (RM){ sc(el, 'clipPath', 'none'); o *= c01(p * 2) * (T > g ? 1 - c01((T - g) / 0.2) : 1); }
    else { var cp = 'circle(' + f1(R / s) + 'px at ' + f1(ccx / s + 165 * (1 - 1 / s)) + 'px ' + f1(ccy / s + 210 * (1 - 1 / s)) + 'px)'; sc(el, 'clipPath', cp); sc(el, 'webkitClipPath', cp); }
    st(el, tf(x, ty, s), o * (isOn('tpill') && j === ti ? 1 - 0.15 * c01((T - tmB('tpill')) / 0.3) : 1));
  }
  st(dRows, 'translateY(' + f1(-DSCROLL.y) + 'px)');
  /* thesis: Save → label roll → one conic sweep in the verdict hue → the only XP reward */
  var sv = tmB('saved'), sg = tmG('saved'), su = T - sv, saved = su >= 0 && T < sg;
  cls(saveBtn, 'tap', W.state === 'CARDS' && Math.round(track) === ti && p > 0.8);
  st(saveBtn, 'scale(' + f3(pressS('save', 0.96)) + ')', 1);
  var cu = c01(su / 0.2), vc3 = hexRgb(M.verdict.color);
  sc(saveBtn, 'background', saved ? 'rgba(' + Math.round(lerp(242, vc3[0], cu)) + ',' + Math.round(lerp(237, vc3[1], cu)) + ',' + Math.round(lerp(228, vc3[2], cu)) + ',' + f3(lerp(1, 0.14, cu)) + ')' : '#F2EDE4');
  sc(saveBtn, 'color', saved && cu > 0.5 ? M.verdict.color : '#141210');
  st(saveRoll[0], 'translateY(' + f1(saved ? -8 * FOC(c01(su / 0.16)) * TR : 0) + 'px)', saved ? 1 - c01(su / 0.16) : 1);
  st(saveRoll[1], 'translateY(' + f1(saved ? (su > 0.04 ? 8 * (1 - sp('snap', su - 0.04)) * TR : 8) : 8) + 'px)', saved && su > 0.04 ? c01((su - 0.04) / 0.16) : 0);
  var sw = c01(su / 0.5), swv = f1(sw * 360) + 'deg'; if (sweepEl._sw !== swv){ sweepEl._sw = swv; sweepEl.style.setProperty('--sw', swv); } st(sweepEl, null, saved && !RM ? (sw < 1 ? 1 : 0) * sstep(0, 0.1, sw) : 0);
  var xb = tmB('xp'), xu = T - xb, xpOn = xu >= 0;
  st(hzEl, 'translateY(' + f1(xpOn ? -6 * FOC(c01(xu / 0.2)) * TR : 0) + 'px)', xpOn ? 1 - c01(xu / 0.16) : 1);
  var xp = xpOn ? (TR ? sp('emit', xu - 0.1) : c01((xu - 0.1) / 0.2)) : 0;
  st(xpEl, 'translateY(' + f1(8 * (1 - xp) * TR) + 'px) scale(' + f3(lerp(0.9, 1, c01(xp))) + ')', xpOn ? c01((xu - 0.1) / 0.2) : 0);
  /* the thesis condenses into a pill and is swallowed */
  var tb2 = tmB('tpill'), tu = c01((T - tb2) / 0.52);
  if (T >= tb2 && tu < 1){
    if (!tpillEl._w) tpillEl._w = tpillEl.offsetWidth || 96;
    var q2 = INH(tu), x0 = 195, y0 = 262, cx2 = 262, cy2 = 150, x1 = 195, y1 = SPH.cy;
    var bx = (1 - q2) * (1 - q2) * x0 + 2 * (1 - q2) * q2 * cx2 + q2 * q2 * x1, by = (1 - q2) * (1 - q2) * y0 + 2 * (1 - q2) * q2 * cy2 + q2 * q2 * y1;
    if (!TR){ bx = x1; by = y1; }
    tpillEl.style.setProperty('--vc', M.verdict.color);
    st(tpillEl, tf(bx - tpillEl._w / 2, by, lerp(1, 0.25, sstep(0.65, 1, q2))), c01((T - tb2) / 0.1) * (1 - sstep(0.65, 1, q2)));
  } else st(tpillEl, null, 0);
}

/* ---------- sign-in sheet: poured from the sphere base, drains back ---------- */
var sheetEl = $('sheet'), sheetBodyEl = $('sheetBody'), shBRoll = $('shB').querySelector('.roll').children, appleEl = $('apple'), notnowEl = $('notnow');
var sheetItems = [$('grab'), $('shT'), $('shB'), appleEl, notnowEl];
function renderSheet(){
  var b = tmB('sheet'), g = tmG('sheet');
  if (T < b || T > g + 0.9){ sc(sheetBodyEl, 'visibility', 'hidden'); for (var si2 = 0; si2 < sheetItems.length; si2++) st(sheetItems[si2], null, 0); st(sheetEl, null, 0); cls(appleEl, 'tap', false); cls(notnowEl, 'tap', false); return; }
  st(sheetEl, null, 1); sc(sheetBodyEl, 'visibility', 'visible');
  var u = T - b, p1 = TR ? sp('emit', u) : 1, p2 = TR ? sp('soft', u - 0.14) : 1, bo = RM ? c01(u / 0.2) : 1;
  if (T > g){ var d = T - g; p2 = TR ? 1 - sp('ret', d) : 1; p1 = TR ? 1 - sp('ret', d - 0.22) : 1; bo = RM ? 1 - c01(d / 0.2) : 1 - sstep(0.42, 0.52, d); }
  var w = lerp(96, 390, clamp(p1, 0, 1.05)), h = lerp(8, 376, clamp(p2, 0, 1.02));
  sc(sheetBodyEl, 'width', f1(w) + 'px'); sc(sheetBodyEl, 'height', f1(h) + 'px'); sc(sheetBodyEl, 'borderRadius', h > 40 ? '32px 32px 0 0' : '4px');
  st(sheetBodyEl, tf(195 - w / 2, 468), bo);
  var live2 = T < g;
  for (var i = 0; i < sheetItems.length; i++){
    var e = sheetItems[i], iu = T - b - 0.30 - 0.07 * i, ip = TR ? sp('soft', iu) : c01(iu / 0.2), io = c01(iu / 0.24);
    if (T > g) io *= 1 - c01((T - g - 0.03 * (sheetItems.length - 1 - i)) / 0.16);
    var s = e === notnowEl ? pressS('notnow', 0.96) : (e === appleEl ? pressS('apple', 0.97) : 1);
    if (e === appleEl && W.appleOff) io *= 0.4;
    st(e, tf(0, 12 * (1 - ip) * TR, s), iu < 0 ? 0 : io);
  }
  cls(appleEl, 'tap', live2 && !W.appleOff); cls(notnowEl, 'tap', live2);
  var bu = T - W.sheetBodyT;
  txt(shBRoll[0], W.sheetBody || ''); txt(shBRoll[1], W.sheetBodyPrev || '');
  st(shBRoll[0], 'translateY(' + f1(bu > 0.04 ? 8 * (1 - sp('snap', bu - 0.04)) * TR : (W.sheetBodyT < 0 ? 0 : 8 * TR)) + 'px)', W.sheetBodyT < 0 ? 1 : (bu > 0.04 ? c01((bu - 0.04) / 0.16) : 0));
  st(shBRoll[1], 'translateY(' + f1(-8 * FOC(c01(bu / 0.16)) * TR) + 'px)', W.sheetBodyT < 0 ? 0 : 1 - c01(bu / 0.16));
}

/* ---------- Desk ghost satellite + "saved on this device" ---------- */
var gsat = $('gsat'), savedTag = $('savedTag'), savedRoll = savedTag.querySelector('.roll>span');
function renderGsat(){
  var b = tmB('gsat');
  if (T < b){ st(gsat, null, 0); st(savedTag, null, 0); return; }
  if (!gsat._w){ gsat._w = gsat.offsetWidth || 140; gsat._h = gsat.offsetHeight || 46; }
  var sx = Math.min(300, 372 - gsat._w / 2), sy = 178, ang = Math.atan2(sy - SPH.dcy, sx - 195), rx = 195 + Math.cos(ang) * SPH.dr, ry = SPH.dcy + Math.sin(ang) * SPH.dr;
  var p = TR ? sp('emit', T - b) : c01((T - b) / 0.2), dr = RM ? 0 : Math.sin(2 * Math.PI * W.bph / 2 + 0.6);
  var dth = W.theta.x - W.thBase, x = Math.min(372 - gsat._w / 2, lerp(rx, sx, p) - Math.sin(dth) * 60), y = lerp(ry, sy, p) + dr * 2;
  var o = 0.7 * c01(p * 1.4) * rimMask(x, y) * (1 - 0.85 * c01(Math.abs(dth) / 0.7));
  st(gsat, tf(x - gsat._w / 2, y - gsat._h / 2, lerp(0.6, 1, c01(p))), o);
  var tb3 = tmB('savedTag'), tg3 = tmG('savedTag'), tu = T - tb3;
  if (T < tb3 || T > tg3 + 0.3){ st(savedTag, null, 0); return; }
  var yy = tu < 0.16 ? 8 * (1 - (TR ? sp('snap', tu) : 1)) : 0, oo = c01(tu / 0.16);
  if (T > tg3){ var q = c01((T - tg3) / 0.16); yy = -8 * FOC(q); oo = 1 - q; }
  st(savedTag, tf(sx + gsat._w / 2 - 200, sy - gsat._h / 2 - 8 - 14), 1); st(savedRoll, 'translateY(' + f1(yy * TR) + 'px)', oo);
}
