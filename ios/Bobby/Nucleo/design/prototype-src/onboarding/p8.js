
/* ---------- captions: karaoke with a 3-word pulse-sweep front ---------- */
var capEls = [$('cap'), (function(){ var c = $('cap').cloneNode(false); c.id = 'capB'; $('cap').parentNode.insertBefore(c, $('cap').nextSibling); return c; })()];
var INK_B = [255, 248, 236], INK = [242, 237, 228];
function wordState(w, lt, amber){
  var u = T - lt, o, b, y, col;
  if (u < 0){ var pre = c01(1 + u / 0.5); o = 0.16 + 0.12 * pre; b = 2.5 - 1.0 * pre; y = 2 - 1 * pre; col = 'rgb(242,237,228)'; }
  else { var k = FOC(c01(u / 0.26)); o = lerp(0.3, 1, k); b = lerp(1.4, 0, k); y = lerp(1, 0, k);
    var cu = c01(u / 0.6); col = amber ? '#F6B94E' : 'rgb(' + Math.round(lerp(INK_B[0], INK[0], cu)) + ',' + Math.round(lerp(INK_B[1], INK[1], cu)) + ',' + Math.round(lerp(INK_B[2], INK[2], cu)) + ')'; }
  if (RM){ b = 0; y = 0; }
  sc(w, 'color', col); st(w, y ? 'translateY(' + f1(y) + 'px)' : 'none', o, bl(b));
}
/* sentence-aware line breaks (a new sentence or clause starts line 2) */
PAGES.o1a.br = 1; PAGES.o1b.br = 5; PAGES.o5a.br = 2; PAGES.o5c.br = 4;
var capLine = $('capLine');
function renderCaptions(){
  var ln = null;
  for (var s = 0; s < 2; s++){
    var el = capEls[s], c = W.caps[s];
    if (!c || T < c.born || T > c.gone + 0.32){ st(el, null, 0); continue; }
    var P = PAGES[c.id];
    if (el._pid !== c.id){
      el._pid = c.id; el._h = 0; var sentence = P.w.map(function(x){ return x[0]; }).join(' '); el._w = spans(el, sentence); sc(el, 'top', P.top + 'px'); txt(live, sentence.replace(/\*/g, ''));
      if (P.br != null && el._w[P.br]){ var wb = el._w[P.br]; wb.textContent = wb.textContent.replace(/ $/, ''); el.insertBefore(document.createElement('br'), wb.nextSibling); }
    }
    var p = sp('soft', T - c.born), y = -8 * (1 - p) * TR, sy = 1, o = c01((T - c.born) / 0.2);
    if (T > c.gone){
      var q = c01((T - c.gone) / 0.3);
      if (c.lw == null){ var mn = 1e9, mx = -1e9; el._w.forEach(function(w){ mn = Math.min(mn, w.offsetLeft); mx = Math.max(mx, w.offsetLeft + w.offsetWidth); }); c.lw = Math.max(24, mx - mn); c.lh = el.offsetHeight || 31; }
      if (RM) o *= 1 - c01((T - c.gone) / 0.2);
      else { y = 0; sy = 1 - 0.9 * FOC(c01(q / 0.4)); o *= 1 - sstep(0.1, 0.4, q); ln = { y0:P.top + c.lh / 2, q:q, w:c.lw }; }
    }
    sc(el, 'transformOrigin', '50% 50%');
    st(el, 'translate3d(0,' + f1(y) + 'px,0)' + (sy < 0.999 ? ' scaleY(' + f3(sy) + ')' : ''), o);
    for (var i = 0; i < el._w.length; i++) wordState(el._w[i], P.w[i][1] - 0.03, P.w[i][2] === 'amber' && T >= tmB('verdict'));
  }
  /* the words fold into one 2 px line, which rises into the glass and is masked by the rim */
  if (ln){
    var dist = Math.max(10, ln.y0 - (SPH.dcy + SPH.dr) + 6), rq = INH(c01((ln.q - 0.3) / 0.7)), ly = ln.y0 - dist * rq, lw = ln.w * lerp(1, 0.1, rq);
    st(capLine, tf(195, ly) + ' scaleX(' + f3(lw / 200) + ')', sstep(0.05, 0.3, ln.q) * (1 - sstep(0.8, 1, ln.q)) * rimMask(195, ly));
  } else st(capLine, null, 0);
}

/* ---------- exhaled text (greeting-style): drop from the rim, inhale back ---------- */
function dropWords(ws, born, gone, dir, stag){
  var es = Math.min(0.035, 0.12 / Math.max(1, ws.length - 1));   /* reverse exit stagger: 35 ms, but a whole line leaves within 120 ms */
  for (var i = 0; i < ws.length; i++){
    var u = T - born - stag * i, p = TR ? sp('soft', u) : c01(u / 0.2), o = c01(u / 0.3), b = 6 * (1 - c01(u / 0.36)), y = dir * 14 * (1 - p) * TR;
    if (T > gone){ var q = INH(c01((T - gone - es * (ws.length - 1 - i)) / 0.3)); y = dir * 14 * q * TR; o *= 1 - sstep(0.5, 1, q); b = 4 * q; }
    if (RM) b = 0;
    st(ws[i], 'translateY(' + f1(y) + 'px)', u < 0 ? 0 : o, bl(b));
  }
}
var titleEl = $('title'), subEl = $('sub'), cap2El = $('cap2'), promptEl = $('prompt'), wmBig = $('wmBig'), metaEl = $('meta');
var wmEl = $('wm'), dqEl = $('dq'), closeEl = $('close'), avatarEl = $('avatar'), xpArcEl = $('xpArc'), noticeEl = $('notice'), pnameEl = $('pname'), pcountEl = $('pcount');
var titleW = [], subW = [], cap2W = null, promptW = null;
function renderTexts(){
  if (W.title && titleEl._k !== W.title[0]){ titleEl._k = W.title[0]; titleW = spans(titleEl, W.title[0]); subW = spans(subEl, W.title[1]); }
  var tb0 = tmB('title'), tg0 = tmG('title'), on = T >= tb0 && T < tg0 + 0.6;
  st(titleEl, null, on ? 1 : 0); st(subEl, null, on ? 1 : 0);
  if (on){ dropWords(titleW, tb0, tg0, -1, 0.055); dropWords(subW, tb0 + 0.12, tg0 + 0.04, -1, 0.03); }
  /* O8 sub-caption */
  if (!cap2W) cap2W = spans(cap2El, 'It grows when this read closes tomorrow.');
  var c2b = tmB('cap2'), c2g = tmG('cap2'); st(cap2El, null, T >= c2b && T < c2g + 0.6 ? 1 : 0);
  if (T >= c2b && T < c2g + 0.6) dropWords(cap2W, c2b, c2g, -1, 0.03);
  /* O2 prompt: exhaled upward from the top rim to y 110 */
  if (!promptW) promptW = spans(promptEl, 'Who lives in here?');
  var pb = tmB('prompt'), pg = tmG('prompt'); st(promptEl, null, T >= pb && T < pg + 0.6 ? 1 : 0);
  if (T >= pb && T < pg + 0.6) dropWords(promptW, pb, pg, 1, 0.05);
  /* birth wordmark, then FLIP into the header */
  var wb = tmB('wmBig'), wf = tmB('wmFly');
  var wm = wmEl;
  if (!wm._w) wm._w = wm.offsetWidth || 62;
  if (T >= wb && T < wf + 0.8){
    var k = FOC(c01((T - wb) / 0.6)), o = c01((T - wb) / 0.3), bb = 8 * (1 - k), x = 0, y = 0, s = 1;
    if (T >= wf){ var p = sp('soft', T - wf); var hx = 20 + wm._w / 2, dx = hx - 195, dy = 76 - 536; x = dx * p; y = dy * p; s = lerp(1, 24 / 44, p); o *= 1 - sstep(0.1, 0.6, c01((T - wf) / 0.7)); bb = 0; }
    if (RM){ x = 0; y = 0; s = 1; bb = 0; }
    st(wmBig, tf(x, y, s), o, bl(bb));
  } else st(wmBig, null, 0);
  /* header: wordmark / docked question / close / avatar */
  var dk = tmB('dock'), dg = tmG('dock'), wo = 0, wx = 0, wy = 0, ws = 1;
  if (T >= wf){
    var fp = sp('soft', T - wf); wo = sstep(0.3, 0.8, c01((T - wf) / 0.7)); wx = -(20 + wm._w / 2 - 195) * (1 - fp); wy = (536 - 76) * (1 - fp); ws = lerp(44 / 24, 1, fp);
    if (RM){ wx = 0; wy = 0; ws = 1; wo = c01((T - wf) / 0.2); }
    if (T >= dk && T < dg){ var du = c01((T - dk) / 0.16); wy = -8 * du; wo *= 1 - du; }
    if (T >= dg){ var ru = T - dg - 0.14; wy = ru > 0 ? 8 * (1 - sp('snap', ru)) * TR : 8; wo = ru > 0 ? c01(ru / 0.16) : 0; }
  }
  st(wm, tf(wx, wy, ws), wo);
  var dq = dqEl, cl = closeEl;
  if (T >= dk && T < dg + 0.2){
    var n = Math.max(0, Math.min(QTEXT.length, Math.floor((T - dk - 0.16) / 0.01))); txt(dq, QTEXT.slice(0, n));
    var dqo = T > dg ? 1 - c01((T - dg) / 0.16) : 1; st(dq, null, dqo); st(cl, null, c01((T - dk - 0.16) / 0.16) * dqo);
  } else { st(dq, null, 0); st(cl, null, 0); }
  var ab = tmB('avaFly') + 0.48; st(avatarEl, null, T >= ab ? c01((T - ab) / 0.12) : 0);
  var xpu = c01((T - tmB('saved') - 0.3) / 0.6), xpv = 0.2 * DAT(xpu); sa(xpArcEl, 'stroke-dasharray', f1(94.25 * xpv) + ' 94.25'); sa(xpArcEl, 'opacity', xpv > 0.004 ? '1' : '0');
  /* meta line under the verdict caption */
  var mb = tmB('meta'), mg = tmG('meta'), mo = T >= mb ? c01((T - mb) / 0.24) * (T > mg ? 1 - c01((T - mg) / 0.2) : 1) : 0;
  /* the caption height is read once per page (it only changes when the page does), never every frame: no forced layout */
  if (mo > 0){ var capEl = capEls[PAGES.o5c.slot]; if (!capEl._h) capEl._h = capEl.offsetHeight || 62;
    st(metaEl, tf(0, 592 + capEl._h + 8 + 6 * (1 - FOC(c01((T - mb) / 0.3))) * TR), mo); }
  else st(metaEl, null, 0);
}

/* ---------- O2 picker: name + counter roll 12 px in the swipe direction ---------- */
var pnameRoll = $('pname').querySelector('.roll').children, pcountRoll = $('pcount').querySelector('.roll').children;
function renderPicker(){
  var nb = tmB('pname'), ng = tmG('pname'), pn = pnameEl, pc = pcountEl;
  if (T < nb || T > ng + 0.5){ st(pn, null, 0); st(pc, null, 0); return; }
  var p = TR ? sp('soft', T - nb) : 1, o = c01((T - nb) / 0.3), y = -14 * (1 - p) * TR;
  if (T > ng){ var q = INH(c01((T - ng) / 0.3)); y = -14 * q * TR; o *= 1 - sstep(0.5, 1, q); }
  st(pn, tf(0, y), o); st(pc, tf(0, y), o * c01((T - nb - 0.08) / 0.3));
  var R = W.pickRoll, cur = R[R.length - 1], prev = R.length > 1 ? R[R.length - 2] : null;
  var ru = T - cur.t, dir = cur.dir;
  txt(pnameRoll[0], ORDER[cur.i].label); txt(pcountRoll[0], (cur.i + 1) + ' of ' + ORDER.length);
  txt(pnameRoll[1], prev ? ORDER[prev.i].label : ''); txt(pcountRoll[1], prev ? (prev.i + 1) + ' of ' + ORDER.length : '');
  var inX = dir ? 12 * dir * (1 - (TR ? sp('snap', ru - 0.04) : 1)) : 0, inO = dir ? c01((ru - 0.04) / 0.16) : 1;
  var outX = -12 * dir * FOC(c01(ru / 0.16)) * TR, outO = prev ? 1 - c01(ru / 0.16) : 0;
  st(pnameRoll[0], 'translateX(' + f1(inX) + 'px)', inO); st(pcountRoll[0], 'translateX(' + f1(inX) + 'px)', inO);
  st(pnameRoll[1], 'translateX(' + f1(outX) + 'px)', outO); st(pcountRoll[1], 'translateX(' + f1(outX) + 'px)', outO);
}

/* ---------- risk notice: three lines, pulse-swept ---------- */
function renderLines(){
  var b = tmB('lines'), g = tmG('lines');
  if (T < b || T > g + 0.6){ st(linesEl, null, 0); } else {
    st(linesEl, null, 1);
    for (var i = 0; i < 3; i++){
      var lb = b + 0.18 * i, ln = linesEl.children[i], p = TR ? sp('soft', T - lb) : 1, y = -8 * (1 - p) * TR, o = c01((T - lb + 0.1) / 0.2);
      if (T > g){ var q = INH(c01((T - g - 0.04 * (2 - i)) / 0.3)); y = -14 * q * TR; o *= 1 - sstep(0.5, 1, q); }
      st(ln, tf(0, y), o);
      for (var j = 0; j < lineW[i].length; j++) wordState(lineW[i][j], lb + 0.06 + 0.055 * j, false);
    }
  }
  var nb = tmB('notice'), ng = tmG('notice'), no = T >= nb ? c01((T - nb) / 0.24) * (T > ng ? 1 - c01((T - ng) / 0.2) : 1) : 0;
  st(noticeEl, no > 0 ? tf(0, 6 * (1 - FOC(c01((T - nb) / 0.3))) * TR) : null, no);
}

/* ---------- hint row: 160 ms text roll ---------- */
var hintRoll = $('hint').querySelector('.roll').children;
var CHEV = ' <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1 L5 5 L9 1" fill="none" stroke="#A39C91" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function hintHTML(s){ return s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;') + (/^Pull down/.test(s) ? CHEV : '') : ''; }
function renderHint(){
  var u = T - W.hintT;
  if (hintRoll[0]._s !== W.hint){ hintRoll[0]._s = W.hint; hintRoll[0].innerHTML = hintHTML(W.hint); }
  if (hintRoll[1]._s !== W.hintPrev){ hintRoll[1]._s = W.hintPrev; hintRoll[1].innerHTML = hintHTML(W.hintPrev); }
  var sheetOn = T >= tmB('sheet') && T < tmG('sheet') + 0.3;
  st(hintRoll[0], 'translateY(' + f1(u > 0.04 ? 8 * (1 - sp('snap', u - 0.04)) * TR : 8 * TR) + 'px)', (u > 0.04 ? c01((u - 0.04) / 0.16) : 0) * (sheetOn ? 0 : 1));
  st(hintRoll[1], 'translateY(' + f1(-8 * FOC(c01(u / 0.16)) * TR) + 'px)', 1 - c01(u / 0.16));
}
