
/* ============================================================
   DOM: builders and tiny style helpers (write only on change).
   Every text node is filled at runtime from the strings table or
   from a real reply; the template carries no copy of its own.
   ============================================================ */
function tf(x, y, s){ return 'translate3d(' + f1(x) + 'px,' + f1(y) + 'px,0)' + (s != null && Math.abs(s - 1) > 0.0005 ? ' scale(' + f3(s) + ')' : ''); }
function bl(b){ return b > 0.06 ? 'blur(' + f1(b) + 'px)' : 'none'; }
function st(el, t, o, f){
  if (t != null && t !== el._t){ el._t = t; el.style.transform = t; }
  if (o != null){ o = o < 0.003 ? 0 : (o > 0.997 ? 1 : Math.round(o * 1000) / 1000); if (o !== el._o){ el._o = o; el.style.opacity = o; } }
  if (f != null && f !== el._f){ el._f = f; el.style.filter = f; }
}
function sa(el, k, v){ if (el['_a' + k] !== v){ el['_a' + k] = v; el.setAttribute(k, v); } }
function sc(el, k, v){ if (el['_c' + k] !== v){ el['_c' + k] = v; el.style[k] = v; } }
function txt(el, s){ if (el._x !== s){ el._x = s; el.textContent = s; } }
function cls(el, k, on){ on = !!on; if (el['_k' + k] !== on){ el['_k' + k] = on; el.classList.toggle(k, on); } }
/* Sora is wider than the serif these lines were first sized for: a nowrap display line that no longer
   fits its column steps its font size down (never below 70%) instead of running off the screen. */
var FIT_LINES = [];
function fitLine(el){
  if (!el) return;
  if (FIT_LINES.indexOf(el) < 0) FIT_LINES.push(el);
  el.style.fontSize = '';
  var cs = getComputedStyle(el); if (cs.whiteSpace !== 'nowrap') return;
  var cw = el.clientWidth, sw = el.scrollWidth; if (!cw || sw <= cw + 1) return;
  var fs = parseFloat(cs.fontSize); el.style.fontSize = Math.max(fs * 0.7, Math.floor(fs * cw / sw * 10) / 10) + 'px';
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ FIT_LINES.forEach(fitLine); });
function spans(el, text, klass){
  el.innerHTML = '';
  var ws = String(text || '').split(' ').filter(function(w){ return w !== ''; });
  var out = ws.map(function(w, i){
    var s = document.createElement('span'); s.className = 'w' + (klass ? ' ' + klass : '');
    s.textContent = w + (i < ws.length - 1 ? ' ' : ''); el.appendChild(s); return s;
  });
  fitLine(el);
  return out;
}
/* text width (layout-free): pill labels size themselves from their own copy */
var MEAS = document.createElement('canvas').getContext('2d');
function textW(s, font){ try { MEAS.font = font; return MEAS.measureText(String(s)).width; } catch(e){ return String(s).length * 9; } }

/* pill bars */
var pill = $('pill'), pglow = $('pglow'), barsEl = pill.querySelector('.bars'), bars = [];
for (var bi = 0; bi < 22; bi++){ var bb = document.createElement('i'); barsEl.appendChild(bb); bars.push(bb); }
var pIc = pill.querySelector('.ic'), pLab = pill.querySelector('.lab'), pLabA = pLab.children[0], pLabB = pLab.children[1];
var pFill = pill.querySelector('.fill'), pDots = [].slice.call(pill.querySelectorAll('.dots i')), pStop = pill.querySelector('.stop'), pChk = pill.querySelector('.chk');
var goo = pill.querySelector('.goo'), gooC = [].slice.call(pill.querySelectorAll('#gooG circle'));

/* chips: three buttons; their labels and actions come from the live set (suggestions, failure chips, retry) */
var chipsEl = $('chips'), chipEls = [];
for (var ci = 0; ci < 3; ci++){ var cb = document.createElement('button'); cb.className = 'chip' + (ci === 0 ? ' first' : ''); cb.tabIndex = 0; cb.setAttribute('data-hit', 'chip'); cb.setAttribute('data-i', String(ci)); chipsEl.appendChild(cb); chipEls.push(cb); }

/* belt beads (circular crop at 118%, 0.5 px ivory ring): one per starter from roster() */
var beltEl = $('belt'), beads = [], BEAD_K0 = [];
function buildBelt(){
  beltEl.innerHTML = ''; beads = [];
  PICKS.forEach(function(p){
    var b = document.createElement('div'); b.className = 'bead';
    if (p.art.uri) b.style.backgroundImage = 'url("' + p.art.uri + '")';
    else { b.className += ' mono-ava'; b.textContent = p.label.charAt(0); b.style.fontSize = '11px'; }
    beltEl.appendChild(b); beads.push(b);
  });
  BEAD_K0 = beads.map(function(b, j){ return beadPos(j, 0).k; });
}
var avaFace = $('avaFace');
function setAvatar(a){
  if (!a) return;
  avaFace.className = 'face'; avaFace.textContent = ''; avaFace.style.backgroundImage = '';
  if (a.uri) avaFace.style.backgroundImage = 'url("' + a.uri + '")';
  else { avaFace.className = 'face mono-ava'; avaFace.textContent = titleCase(a.label).charAt(0); }
}

/* risk notice: the 4 real statement titles (pulse-swept) + statement 1's body, laid out from their measured heights */
var linesEl = $('lines'), lineW = [], lineEls = [], rbodyEl = null, RISK_LAYOUT = null;
function buildRisk(statements){
  linesEl.innerHTML = ''; lineW = []; lineEls = [];
  (statements || []).slice(0, 4).forEach(function(s){
    var d = document.createElement('div'); d.className = 'ln'; linesEl.appendChild(d); lineEls.push(d); lineW.push(spans(d, s.title));
  });
  rbodyEl = document.createElement('div'); rbodyEl.className = 'rb'; rbodyEl.textContent = statements && statements[0] ? statements[0].body : ''; linesEl.appendChild(rbodyEl);
  RISK_LAYOUT = null;
}
/* stack below the agree ring (ring bottom at cy + r + 14 = 436 for the risk sphere), 16 px clear */
function layoutRisk(top){
  var y = top, tops = [];
  for (var i = 0; i < lineEls.length; i++){ tops.push(y); sc(lineEls[i], 'top', f1(y) + 'px'); y += (lineEls[i].offsetHeight || 26) + 4; }
  y += 8; sc(rbodyEl, 'top', f1(y) + 'px'); var by = y; y += (rbodyEl.offsetHeight || 54) + 2;
  RISK_LAYOUT = { tops:tops, body:by, notice:Math.min(y, 690) };
  return RISK_LAYOUT;
}

/* agent labels: names while the desk works; the first sentence of each real text after the reply */
var agEls = [$('agA'), $('agR'), $('agC')];
var agN = agEls.map(function(e){ return e.querySelector('.n'); });
var agSt = agEls.map(function(e){ return e.querySelector('.st'); });
var agCroll = agEls[2].querySelector('.st .roll').children;
var agStW = [[], [], []];
/* word spans clamped to 2 lines with an ellipsis (measured once, when the reply lands) */
function stanceSpans(el, text){
  var ws = spans(el, text);
  if (!ws.length) return ws;
  var top0 = ws[0].offsetTop, lh = 21, cut = -1;
  for (var i = 0; i < ws.length; i++){ if (ws[i].offsetTop - top0 > lh * 1.5){ cut = i; break; } }
  if (cut > 0){
    for (var j = ws.length - 1; j >= cut; j--){ el.removeChild(ws[j]); }
    ws = ws.slice(0, cut);
    var last = ws[ws.length - 1]; last.textContent = last.textContent.replace(/[\s,;:.]+$/, '') + '…';
    if (last.offsetTop - top0 > lh * 1.5 && ws.length > 1){ el.removeChild(last); ws.pop(); ws[ws.length - 1].textContent = ws[ws.length - 1].textContent.replace(/[\s,;:.]+$/, '') + '…'; }
  }
  return ws;
}

/* meridian dots: only for faces with content (Desk, Isla, Squad, Theses; never Record) */
var merEl = $('mer'), merDots = [];
for (var mi = 0; mi < 4; mi++){ var md = document.createElement('i'); merEl.appendChild(md); merDots.push(md); }

/* Isla growth ring: 16 plot segments */
var isRing = $('isRing'), isSegs = [];
for (var ii = 0; ii < 16; ii++){ var ip = document.createElementNS('http://www.w3.org/2000/svg', 'path'); ip.setAttribute('stroke-linecap', 'round'); ip.setAttribute('fill', 'none'); isRing.appendChild(ip); isSegs.push(ip); }

/* odometers: only changed digits roll (from the previous 1H close when the model has one) */
function odoBuild(el, str, from, h, klass){
  el.innerHTML = ''; var cols = [];
  var fs = from && from.length === str.length ? from : null;
  str.split('').forEach(function(ch, i){
    if (/[0-9]/.test(ch)){
      var o = document.createElement('span'); o.className = klass; var strip = document.createElement('span'), s = '';
      for (var k = 0; k < 20; k++) s += '<b>' + (k % 10) + '</b>';
      strip.innerHTML = s; o.appendChild(strip); el.appendChild(o);
      var d = +ch, s0 = d + 3;
      if (fs && /[0-9]/.test(fs[i])){ var fd = +fs[i]; s0 = fd + (fd > d ? 0 : 10); }
      cols.push({ strip:strip, d:d, s0:s0, h:h });
      if (ch === '1') o.style.margin = '0 -0.15em';
    } else { var t = document.createElement('span'); t.textContent = ch; el.appendChild(t); }
  });
  return cols;
}
function pctBuild(el, h){ el.innerHTML = ''; var cols = [];
  for (var k = 0; k < 2; k++){ var o = document.createElement('span'); o.style.cssText = 'display:inline-block;height:' + h + 'px;overflow:hidden;vertical-align:top'; var strip = document.createElement('span'); strip.style.display = 'block'; var s = ''; for (var j = 0; j < 20; j++) s += '<b style="display:block;height:' + h + 'px">' + (j % 10) + '</b>'; strip.innerHTML = s; o.appendChild(strip); el.appendChild(o); cols.push({ box:o, strip:strip }); }
  var pc = document.createElement('span'); pc.textContent = '%'; el.appendChild(pc); return cols; }
var vpctCols = pctBuild($('vpct'), 14), pctCols = pctBuild($('pct'), 16);
function pctSet(cols, v, h){
  v = Math.max(0, Math.min(99, v)); var ones = v % 10, tens = Math.floor(v / 10) + Math.max(0, ones - 9);
  sc(cols[1].strip, 'transform', 'translateY(' + f1(-ones * h) + 'px)');
  sc(cols[0].strip, 'transform', 'translateY(' + f1(-tens * h) + 'px)');
  sc(cols[0].box, 'opacity', String(sstep(9, 10, v)));
  sc(cols[0].box, 'width', v < 9 ? '0px' : '');
}

/* satellites: key (+ a flat dot in the citing agent's hue), value with an odometer, qualifier */
var sats = [$('s0'), $('s1'), $('s2')], satCols = [[], [], []], satV = sats.map(function(s){ return s.querySelector('.v'); }), satK = sats.map(function(s){ return s.querySelector('.k'); });
var SAT_SLOT = [0, 0, 0], SAT_ON = [false, false, false], SAT_W = [100, 100, 100];
var SLOT_I = { UL:0, UR:1, LR:2, LL:3 };
function dotColor(d){ return d === 'alpha' ? HUE.alpha : d === 'red' ? HUE.red : '#8A8378'; }
function buildSats(list){
  for (var i = 0; i < 3; i++){
    var el = sats[i], s = list && list[i];
    SAT_ON[i] = !!s;
    if (!s){ satCols[i] = []; continue; }
    SAT_SLOT[i] = SLOT_I[s.slot] != null ? SLOT_I[s.slot] : i;
    el.style.setProperty('--c', dotColor(s.dot));
    var inKey = s.id === 'price' && s.delta;
    satK[i].innerHTML = '<i></i>' + esc(s.key) + (inKey ? ' ' + esc(s.delta) : '');
    var v = satV[i]; v.innerHTML = '';
    var holder = document.createElement('span'); holder.style.display = 'inline-flex'; v.appendChild(holder);
    satCols[i] = odoBuild(holder, String(s.value), s.from ? String(s.from) : null, 22, 'od');
    if (!inKey && s.delta){ var em = document.createElement('em'); em.textContent = s.delta; v.appendChild(em); }
    el._set = null; SAT_W[i] = Math.max(100, el.offsetWidth || 100);
  }
}

/* ---------- chart: built from model.chart (48 real 1H closes, to scale) ---------- */
var chartSvg = $('chart'), CH = null;
function tickFmt(v){ var a = Math.abs(v); if (a >= 1000) return Math.round(v).toLocaleString('en-US'); if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v)); return String(+v.toFixed(a >= 1 ? 2 : 4)); }
function timeFmt(iso, lang){
  try { var d = new Date(iso); if (isNaN(d.getTime())) return ''; return d.toLocaleTimeString(lang === 'es' ? 'es-MX' : 'en-US', { hour:'numeric', minute:'2-digit' }); } catch(e){ return ''; }
}
function buildChart(ch, lang, vcol){
  CH = null; chartSvg.innerHTML = '';
  if (!ch || !ch.closes || ch.closes.length < 2) return null;
  var n = ch.closes.length, lo = ch.domain[0], hi = ch.domain[1], span = (hi - lo) || 1;
  function CX(i){ return 20 + 276 * i / (n - 1); }
  function CY(v){ return 540 - (v - lo) / span * 200; }
  var pts = ch.closes.map(function(v, i){ return [CX(i), CY(v)]; });
  var d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
  for (var i = 0; i < pts.length - 1; i++){
    var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += ' C' + [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]].map(function(q){ return q.toFixed(1); }).join(',');
  }
  var area = d + ' L296,540 L20,540 Z', MONO = 'font-family="Geist Mono, ui-monospace, monospace"', SANS = 'font-family="Geist, system-ui, sans-serif"';
  var ny = CY(ch.now.price), labels = [];   /* semantic labels first; gridline ticks yield to them */
  var h = '<defs>' +
    '<linearGradient id="lnG" gradientUnits="userSpaceOnUse" x1="20" y1="0" x2="296" y2="0"><stop offset="0" stop-color="#F2EDE4" stop-opacity=".38"/><stop offset=".7" stop-color="#F2EDE4" stop-opacity=".82"/><stop offset="1" stop-color="#FFF8EC"/></linearGradient>' +
    '<clipPath id="bandC"><rect id="bandR" x="20" y="300" width="0" height="260"/></clipPath>' +
    '<filter id="lnB" x="-5%" y="-40%" width="110%" height="180%"><feGaussianBlur stdDeviation="2"/></filter></defs>';
  /* support band (neutral ink: the colour lock keeps mint/amber/coral for agents and the verdict) */
  var bandY0 = null, bandY1 = null, bandLab = '';
  if (ch.band){
    bandY0 = CY(ch.band.hi); bandY1 = CY(ch.band.lo); if (bandY1 - bandY0 < 2){ var mid = (bandY0 + bandY1) / 2; bandY0 = mid - 1; bandY1 = mid + 1; }
    var ly = bandY1 - bandY0 >= 14 ? (bandY0 + bandY1) / 2 + 4 : bandY1 + 13;
    labels.push(ly);
    bandLab = '<text id="cBandL" x="28" y="' + ly.toFixed(1) + '" ' + MONO + ' font-weight="500" font-size="11" letter-spacing=".66" fill="#A39C91" opacity="0">' + esc(ch.band.label) + '</text>';
  }
  var lineMarks = '';
  (ch.lines || []).forEach(function(L){
    if (L.kind === 'support') return;   /* drawn as the band */
    var y = CY(L.price), plan = L.kind === 'entry' || L.kind === 'stop' || L.kind === 'target';
    var stroke = plan ? hexA(vcol, 0.55) : 'rgba(242,237,228,.30)', fill = plan ? vcol : '#A39C91';
    var ty = y - 5 < 336 ? y + 13 : y - 5; labels.push(ty);
    lineMarks += '<line class="cMk" x1="20" x2="370" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + stroke + '" stroke-dasharray="' + (plan ? '4 3' : '2 3') + '"/>' +
      '<text class="cMk" x="' + (plan ? 370 : 28) + '" y="' + ty.toFixed(1) + '"' + (plan ? ' text-anchor="end"' : '') + ' ' + MONO + ' font-weight="500" font-size="11" letter-spacing=".66" fill="' + fill + '">' + esc(L.label) + '</text>';
  });
  var src = ch.source || {}, asof = timeFmt(src.asOf, lang);
  var tail = asof ? ' · ' + Ls('asof', { time:asof }) : '';
  var xl = [src.timeframe, src.provider, src.instrument].filter(Boolean).join(' · ') + tail;
  /* the x label ends before NOW (x 284): long provider names yield first */
  if (textW(xl.toUpperCase(), '10px "Geist Mono", ui-monospace, monospace') + xl.length * 0.2 > 256) xl = [src.timeframe, src.instrument].filter(Boolean).join(' · ') + tail;
  h += '<g id="cTicks" opacity="0"><rect x="296" y="340" width="74" height="200" fill="rgba(242,237,228,.025)"/>';
  (ch.gridlines || []).forEach(function(v){
    var y = CY(v); if (y < 342 || y > 538) return;
    var clash = labels.some(function(l){ return Math.abs(l - (y - 4)) < 13; });
    h += '<line x1="20" x2="370" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="rgba(242,237,228,.06)"/>' + (clash ? '' : '<text x="20" y="' + (y - 4).toFixed(1) + '" ' + MONO + ' font-size="10" letter-spacing=".2" fill="#8A8378">' + esc(tickFmt(v)) + '</text>');
  });
  h += '<text x="20" y="556" ' + MONO + ' font-size="10" letter-spacing=".2" fill="#8A8378">' + esc(xl.toUpperCase()) + '</text><text x="296" y="556" text-anchor="middle" ' + MONO + ' font-size="10" letter-spacing=".2" fill="#8A8378">' + esc(Ls('chart.now')) + '</text>' + lineMarks + '</g>';
  h += '<path id="cAreaI" d="' + area + '" fill="rgba(242,237,228,.04)" opacity="0"/>';
  if (ch.band){
    h += '<g id="cBand" clip-path="url(#bandC)"><rect x="20" y="' + bandY0.toFixed(1) + '" width="350" height="' + (bandY1 - bandY0).toFixed(1) + '" fill="rgba(242,237,228,.06)"/>' +
      '<line x1="20" x2="370" y1="' + bandY0.toFixed(1) + '" y2="' + bandY0.toFixed(1) + '" stroke="rgba(242,237,228,.38)" stroke-dasharray="2 3"/><line x1="20" x2="370" y1="' + bandY1.toFixed(1) + '" y2="' + bandY1.toFixed(1) + '" stroke="rgba(242,237,228,.38)" stroke-dasharray="2 3"/></g>' + bandLab;
  }
  h += '<path id="cLead" d="M195,274 C195,330 20,356 20,' + pts[0][1].toFixed(1) + '" fill="none" stroke="rgba(242,237,228,.55)" stroke-width="1.2" stroke-linecap="round"/>';
  h += '<path id="cGlow" d="' + d + '" fill="none" stroke="#FFF8EC" stroke-width="4" opacity="0" filter="url(#lnB)"/>';
  h += '<path id="cLine" d="' + d + '" fill="none" stroke="url(#lnG)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  var py = ny - 9 < 336 ? ny + 20 : ny - 9;
  h += '<text id="cPrice" x="286" y="' + py.toFixed(1) + '" text-anchor="end" ' + SANS + ' font-weight="500" font-size="13" fill="#F2EDE4" opacity="0">' + esc(ch.now.label) + '</text>';
  if (ch.bracket){
    var by0 = CY(ch.bracket.from), by1 = CY(ch.bracket.to);
    h += '<g id="cBr" opacity="0"><line x1="306" x2="306" y1="' + by0.toFixed(1) + '" y2="' + by1.toFixed(1) + '" stroke="#F2EDE4"/><line x1="303" x2="309" y1="' + by0.toFixed(1) + '" y2="' + by0.toFixed(1) + '" stroke="#F2EDE4"/><line x1="303" x2="309" y1="' + by1.toFixed(1) + '" y2="' + by1.toFixed(1) + '" stroke="#F2EDE4"/>' +
      '<text id="cBrL" x="312" y="' + ((by0 + by1) / 2 + 4).toFixed(1) + '" ' + SANS + ' font-weight="500" font-size="12" fill="#F2EDE4">' + esc(ch.bracket.label) + '</text></g>';
  }
  h += '<circle id="cPulse" cx="296" cy="' + ny.toFixed(1) + '" r="4" fill="none" stroke="#FFF8EC" stroke-width="1" opacity="0"/><circle id="cNow" cx="296" cy="' + ny.toFixed(1) + '" r="3.6" fill="#FFF8EC" opacity="0"/>';
  h += '<circle id="cHead" r="3.2" fill="#FFF8EC" opacity="0"/>';
  chartSvg.innerHTML = h;
  CH = {};
  ['cTicks','cAreaI','cBand','bandR','cBandL','cLead','cGlow','cLine','cPrice','cBr','cBrL','cPulse','cNow','cHead'].forEach(function(k){ CH[k] = document.getElementById(k); });
  try { CH.lineLen = CH.cLine.getTotalLength(); CH.leadLen = CH.cLead.getTotalLength(); } catch(e){ CH.lineLen = 330; CH.leadLen = 330; }
  if (!(CH.lineLen > 0)) CH.lineLen = 330; if (!(CH.leadLen > 0)) CH.leadLen = 330;
  CH.cLine.style.strokeDasharray = CH.lineLen + ' ' + (CH.lineLen + 10);
  CH.cLead.style.strokeDasharray = CH.leadLen + ' ' + (CH.leadLen + 10);
  CH.ny = ny;
  /* comet speed profile: exits at 900 px/s, eases to the line speed vL, arc-length velocity continuous */
  var LL = CH.leadLen, LN = CH.lineLen, TLEAD = 0.42, TLINE = 1.40;
  CH.vL = 1.12 * LN / TLINE;
  var mean = clamp((LL - CH.vL * TLEAD) / ((900 - CH.vL) * TLEAD), 0.34, 0.97);
  CH.n = mean / (1 - mean); CH.TLEAD = TLEAD; CH.TLINE = TLINE;
  return CH;
}
/* arc length of the comet head along lead+line at time u after exit */
function cometS(u){
  if (u <= 0) return 0;
  if (u < CH.TLEAD){ var x = u / CH.TLEAD, sL = CH.vL * u + (900 - CH.vL) * CH.TLEAD * (x - Math.pow(x, CH.n + 1) / (CH.n + 1)); return Math.min(sL, CH.leadLen); }
  var w = u - CH.TLEAD, LN = CH.lineLen, v = CH.vL, t88 = 0.88 * LN / v;
  if (w < t88) return CH.leadLen + v * w;
  var r = Math.min(1, (w - t88) / (2 * 0.12 * LN / v));
  return CH.leadLen + 0.88 * LN + 0.12 * LN * (1 - (1 - r) * (1 - r));
}

/* ---------- cards (Debate · Thesis · Isla when available), filled from the read model ---------- */
var cardsEl = $('cards'), cardD = $('cD'), cardT = $('cT'), cardI = $('cI');
var CARDS = [];      /* the live track: [debate, thesis, (isla)] */
function buildCards(M, island, lang){
  txt($('dH'), M.debate.header); txt($('dT'), M.debate.title);
  var rows = '';
  M.debate.entries.forEach(function(e){ rows += '<div class="row lbl" style="--c:' + e.hue + '"><i></i><div><b>' + esc(e.name) + '</b><p>' + esc(e.text) + '</p></div></div>'; });
  $('dRows').innerHTML = rows; txt($('dFoot'), M.meta);
  txt($('tH'), M.thesis.header);
  var asof = M.chart && M.chart.source ? timeFmt(M.chart.source.asOf, lang) : '';
  txt($('tAsof'), asof ? Ls('asof', { time:asof }) : '');
  txt($('tTitle'), M.thesis.title);
  var dl = '';
  M.thesis.rows.forEach(function(r){ if (r.value) dl += '<div><dt>' + esc(r.label) + '</dt><dd>' + esc(r.value) + '</dd></div>'; });
  $('tRows').innerHTML = dl;
  txt($('hz'), M.thesis.line); txt($('saveA'), M.thesis.saveLabel); txt($('saveB'), M.thesis.savedLabel); txt($('tFoot'), M.meta);
  /* the line, XP chip and Save button sit under the rows (never over them) */
  var rowsBottom = 24 + 14 + 18 + 31 + 12 + 32 * M.thesis.rows.filter(function(r){ return r.value; }).length;
  var lineTop = Math.max(271, rowsBottom + 12), btnTop = lineTop + 33;
  sc($('hz'), 'top', (lineTop + 4) + 'px'); sc($('xp'), 'top', lineTop + 'px'); sc($('save'), 'top', btnTop + 'px');
  sc($('tFoot'), 'display', btnTop + 52 + 12 > 420 - 38 ? 'none' : '');
  cardT.style.setProperty('--vc', M.verdict.color);
  $('xp').style.background = hexA(M.verdict.color, 0.12);
  CARDS = [cardD, cardT];
  if (island && island.available){
    txt($('iT'), ''); txt($('iTitle'), Ls('isla.card.title', { size:island.size }));
    txt($('iBody'), Ls('isla.card.body', { pieces:island.pieces, seeds:island.seedsGrowing }));
    CARDS.push(cardI); sc(cardI, 'display', '');
  } else sc(cardI, 'display', 'none');
  var sc2 = $('dScroll'); DSCROLL.max = Math.max(0, ($('dRows').offsetHeight || 0) - (sc2.offsetHeight || 324)); DSCROLL.y = 0; cls(sc2, 'more', DSCROLL.max > 2);
  return CARDS;
}
var DSCROLL = { y:0, max:0 };

/* ghost-finger (harness only) */
var ghostEl = $('ghost');
