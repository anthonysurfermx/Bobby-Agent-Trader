
/* ============================================================
   DOM: builders and tiny style helpers (write only on change)
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
function spans(el, text, cls){
  el.innerHTML = '';
  return text.split(' ').map(function(w, i, arr){
    var s = document.createElement('span'); s.className = 'w' + (cls ? ' ' + cls : '');
    var it = /^\*.*\*$/.test(w); if (it){ w = w.replace(/\*/g, ''); s.style.fontStyle = 'italic'; }
    s.textContent = w + (i < arr.length - 1 ? ' ' : ''); el.appendChild(s); return s;
  });
}

/* pill bars */
var pill = $('pill'), pglow = $('pglow'), barsEl = pill.querySelector('.bars'), bars = [];
for (var bi = 0; bi < 22; bi++){ var bb = document.createElement('i'); barsEl.appendChild(bb); bars.push(bb); }
var pIc = pill.querySelector('.ic'), pLab = pill.querySelector('.lab'), pLabA = pLab.children[0], pLabB = pLab.children[1];
var pFill = pill.querySelector('.fill'), pDots = [].slice.call(pill.querySelectorAll('.dots i')), pStop = pill.querySelector('.stop'), pChk = pill.querySelector('.chk');
var goo = pill.querySelector('.goo'), gooC = [].slice.call(pill.querySelectorAll('#gooG circle'));

/* chips */
var chipsEl = $('chips'), chipEls = [];
for (var ci = 0; ci < 3; ci++){ var cb = document.createElement('button'); cb.className = 'chip' + (ci === 0 ? ' first' : ''); cb.tabIndex = 0; chipsEl.appendChild(cb); chipEls.push(cb); }
var CHIPS = {
  ask: ['Should I buy NVIDIA?', 'Is Bitcoin too high right now?', 'Why is PLTR moving today?'],
  home: ['What would make it a yes?', 'Compare with AMD', 'What if earnings miss?']
};

/* belt beads (circular crop at 118%, 0.5 px ivory ring) */
var beltEl = $('belt'), beads = [];
ORDER.forEach(function(c){
  var b = document.createElement('div'); b.className = 'bead';
  if (c.uri) b.style.backgroundImage = 'url("' + c.uri + '")';
  else { b.className += ' mono-ava'; b.textContent = c.label.charAt(0); b.style.fontSize = '11px'; }
  beltEl.appendChild(b); beads.push(b);
});
var avaFace = $('avaFace');
(function(){ var c = ORDER[CHOSEN]; if (c && c.uri) avaFace.style.backgroundImage = 'url("' + c.uri + '")'; else if (c){ avaFace.className += ' mono-ava'; avaFace.textContent = c.label.charAt(0); } })();

/* risk lines */
var LINES = ['Bobby helps you think.', 'It’s not financial advice.', 'You decide.'];
var linesEl = $('lines'), lineW = [];
LINES.forEach(function(s, i){ var d = document.createElement('div'); d.className = 'ln'; d.style.top = (460 + 32 * i) + 'px';   /* 24 px clear of the agree ring (r+14 ends at 436) */ linesEl.appendChild(d); lineW.push(spans(d, s)); });

/* agent stances (word reveal 45 ms/word) */
var agEls = [$('agA'), $('agR'), $('agC')];
var agStW = [spans(agEls[0].querySelector('.st'), 'Demand is still beating estimates'), spans(agEls[1].querySelector('.st'), 'Stretched, with earnings in 6 days')];
var agCroll = agEls[2].querySelector('.st .roll').children;
var agNm = agEls.map(function(e){ return e.querySelector('.nm'); });
var agSt = agEls.map(function(e){ return e.querySelector('.st'); });

/* meridian dots: Desk · Isla · Squad · Theses (Record has nothing yet on a first run) */
var merEl = $('mer'), merDots = [];
for (var mi = 0; mi < 4; mi++){ var md = document.createElement('i'); merEl.appendChild(md); merDots.push(md); }

/* Isla growth ring: 16 plot segments */
var isRing = $('isRing'), isSegs = [];
for (var ii = 0; ii < 16; ii++){ var ip = document.createElementNS('http://www.w3.org/2000/svg', 'path'); ip.setAttribute('stroke-linecap', 'round'); ip.setAttribute('fill', 'none'); isRing.appendChild(ip); isSegs.push(ip); }

/* odometers */
function odoBuild(el, str, h, cls){
  el.innerHTML = ''; var cols = [];
  str.split('').forEach(function(ch){
    if (/[0-9]/.test(ch)){
      var o = document.createElement('span'); o.className = cls; var strip = document.createElement('span'), s = '';
      for (var k = 0; k < 20; k++) s += '<b>' + (k % 10) + '</b>';
      strip.innerHTML = s; o.appendChild(strip); el.appendChild(o); cols.push({ strip:strip, d:+ch, h:h });
      if (ch === '1') o.style.margin = '0 -0.15em';   /* tabular 1 keeps its rolling column but loses the optical gap ("$178.40", not "$1 78.40") */
    } else { var t = document.createElement('span'); t.textContent = ch; el.appendChild(t); }
  });
  return cols;
}
var sats = [$('s0'), $('s1'), $('s2')], satCols = [], satV = sats.map(function(s){ return s.querySelector('.v'); });
sats.forEach(function(s){
  var v = s.querySelector('.v'), holder = document.createElement('span'); holder.style.display = 'inline-flex';
  v.appendChild(holder); var cols = odoBuild(holder, v.getAttribute('data-v'), 22, 'od');
  if (v.getAttribute('data-q')){ var em = document.createElement('em'); em.textContent = v.getAttribute('data-q'); v.appendChild(em); }
  satCols.push(cols);
});
function pctBuild(el, h){ el.innerHTML = ''; var cols = [];
  for (var k = 0; k < 2; k++){ var o = document.createElement('span'); o.style.cssText = 'display:inline-block;height:' + h + 'px;overflow:hidden;vertical-align:top'; var strip = document.createElement('span'); strip.style.display = 'block'; var s = ''; for (var j = 0; j < 20; j++) s += '<b style="display:block;height:' + h + 'px">' + (j % 10) + '</b>'; strip.innerHTML = s; o.appendChild(strip); el.appendChild(o); cols.push({ box:o, strip:strip }); }
  var pc = document.createElement('span'); pc.textContent = '%'; el.appendChild(pc); return cols; }
var vpctCols = pctBuild($('vpct'), 14), pctCols = pctBuild($('pct'), 16);
function pctSet(cols, v, h){
  v = Math.max(0, v); var ones = v % 10, tens = Math.floor(v / 10) + Math.max(0, ones - 9);
  sc(cols[1].strip, 'transform', 'translateY(' + f1(-ones * h) + 'px)');
  sc(cols[0].strip, 'transform', 'translateY(' + f1(-tens * h) + 'px)');
  sc(cols[0].box, 'opacity', String(sstep(9, 10, v)));
  sc(cols[0].box, 'width', v < 9 ? '0px' : '');
}

/* ---------- chart (to scale, §2.3) ---------- */
var CLOSES = [150.8,152.9,152.2,154.6,157.9,158.4,157.1,160.2,163.5,162.8,165.9,167.4,166.1,164.2,165.0,168.7,171.3,170.6,172.4,174.8,175.3,173.9,172.1,173.5,175.8,177.2,178.9,179.9,178.2,178.4];
function CX(i){ return 20 + 276 * i / (CLOSES.length - 1); }
function CY(v){ return 340 + (184 - v) * (200 / 36); }
var chartSvg = $('chart'), CH = {};
(function(){
  var pts = CLOSES.map(function(v, i){ return [CX(i), CY(v)]; });
  var d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
  for (var i = 0; i < pts.length - 1; i++){
    var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += ' C' + [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]].map(function(n){ return n.toFixed(1); }).join(',');
  }
  /* x where the line first rises through the band top (172) for the last time */
  var xc = 20; for (i = 1; i < CLOSES.length; i++){ if (CLOSES[i - 1] < 172 && CLOSES[i] >= 172) xc = CX(i - 1) + (CX(i) - CX(i - 1)) * (172 - CLOSES[i - 1]) / (CLOSES[i] - CLOSES[i - 1]); }
  var area = d + ' L296,540 L20,540 Z';
  var h = '<defs>' +
    '<linearGradient id="lnG" gradientUnits="userSpaceOnUse" x1="20" y1="0" x2="296" y2="0"><stop offset="0" stop-color="#F2EDE4" stop-opacity=".38"/><stop offset=".7" stop-color="#F2EDE4" stop-opacity=".82"/><stop offset="1" stop-color="#FFF8EC"/></linearGradient>' +
    '<linearGradient id="amG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6B94E" stop-opacity=".14"/><stop offset="1" stop-color="#F6B94E" stop-opacity="0"/></linearGradient>' +
    '<clipPath id="amC"><rect x="' + xc.toFixed(1) + '" y="330" width="' + (296 - xc).toFixed(1) + '" height="220"/></clipPath>' +
    '<clipPath id="bandC"><rect id="bandR" x="20" y="400" width="0" height="40"/></clipPath>' +
    '<filter id="lnB" x="-5%" y="-40%" width="110%" height="180%"><feGaussianBlur stdDeviation="2"/></filter></defs>';
  h += '<g id="cTicks" opacity="0"><rect x="296" y="340" width="74" height="200" fill="rgba(242,237,228,.025)"/>';
  [175, 155].forEach(function(v){ var y = CY(v); h += '<line x1="20" x2="370" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="rgba(242,237,228,.06)"/><text x="20" y="' + (y - 4).toFixed(1) + '" font-family="Geist Mono, ui-monospace, monospace" font-size="10" letter-spacing=".2" fill="#8A8378">' + v + '</text>'; });
  h += '<text x="20" y="556" font-family="Geist Mono, ui-monospace, monospace" font-size="10" letter-spacing=".2" fill="#8A8378">30 DAYS · DEMO DATA</text><text x="296" y="556" text-anchor="middle" font-family="Geist Mono, ui-monospace, monospace" font-size="10" letter-spacing=".2" fill="#8A8378">NOW</text></g>';
  h += '<path id="cAreaI" d="' + area + '" fill="rgba(242,237,228,.04)" opacity="0"/><path id="cAreaA" d="' + area + '" fill="url(#amG)" clip-path="url(#amC)" opacity="0"/>';
  h += '<g id="cBand" clip-path="url(#bandC)"><rect x="20" y="' + CY(172).toFixed(1) + '" width="350" height="' + (CY(168) - CY(172)).toFixed(1) + '" fill="rgba(246,185,78,.08)"/>' +
    '<line x1="20" x2="370" y1="' + CY(172).toFixed(1) + '" y2="' + CY(172).toFixed(1) + '" stroke="rgba(246,185,78,.5)" stroke-dasharray="2 3"/><line x1="20" x2="370" y1="' + CY(168).toFixed(1) + '" y2="' + CY(168).toFixed(1) + '" stroke="rgba(246,185,78,.5)" stroke-dasharray="2 3"/></g>';
  h += '<text id="cBandL" x="28" y="' + (CY(170) + 4).toFixed(1) + '" font-family="Geist Mono, ui-monospace, monospace" font-weight="500" font-size="11" letter-spacing=".66" fill="#F6B94E" opacity="0">CALM ENTRY 168–172</text>';
  h += '<line id="cEarn" x1="351.5" x2="351.5" y1="340" y2="540" stroke="rgba(242,237,228,.3)" stroke-dasharray="1 4" stroke-linecap="round"/><circle id="cEarnCap" cx="351.5" cy="340" r="2" fill="#FF5A5F" opacity="0"/>' +
    '<text id="cEarnL" x="370" y="332" text-anchor="end" font-family="Geist Mono, ui-monospace, monospace" font-weight="500" font-size="11" letter-spacing=".66" fill="#A39C91" opacity="0">EARNINGS · 6D</text>';
  h += '<path id="cLead" d="M195,274 C195,330 20,356 20,' + CY(CLOSES[0]).toFixed(1) + '" fill="none" stroke="rgba(242,237,228,.55)" stroke-width="1.2" stroke-linecap="round"/>';
  h += '<path id="cGlow" d="' + d + '" fill="none" stroke="#FFF8EC" stroke-width="4" opacity="0" filter="url(#lnB)"/>';
  h += '<path id="cLine" d="' + d + '" fill="none" stroke="url(#lnG)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  h += '<text id="cPrice" x="286" y="362" text-anchor="end" font-family="Geist, system-ui, sans-serif" font-weight="500" font-size="13" fill="#F2EDE4" opacity="0">178.40</text>';
  var ny = CY(178.4), by = CY(172);
  h += '<g id="cBr" opacity="0"><line x1="306" x2="306" y1="' + ny.toFixed(1) + '" y2="' + by.toFixed(1) + '" stroke="#F6B94E"/><line x1="304" x2="308" y1="' + ny.toFixed(1) + '" y2="' + ny.toFixed(1) + '" stroke="#F6B94E"/><line x1="304" x2="308" y1="' + by.toFixed(1) + '" y2="' + by.toFixed(1) + '" stroke="#F6B94E"/>' +
    '<text id="cBrL" x="312" y="' + ((ny + by) / 2 + 4).toFixed(1) + '" font-family="Geist, system-ui, sans-serif" font-weight="500" font-size="12" fill="#F6B94E">+6.40</text></g>';
  h += '<circle id="cPulse" cx="296" cy="' + ny.toFixed(1) + '" r="4" fill="none" stroke="#FFF8EC" stroke-width="1" opacity="0"/><circle id="cNow" cx="296" cy="' + ny.toFixed(1) + '" r="3.6" fill="#FFF8EC" opacity="0"/>';
  h += '<circle id="cHead" r="3.2" fill="#FFF8EC" opacity="0"/>';
  chartSvg.innerHTML = h;
  ['cTicks','cAreaI','cAreaA','cBand','bandR','cBandL','cEarn','cEarnCap','cEarnL','cLead','cGlow','cLine','cPrice','cBr','cBrL','cPulse','cNow','cHead'].forEach(function(k){ CH[k] = $(k); });
  try { CH.lineLen = CH.cLine.getTotalLength(); CH.leadLen = CH.cLead.getTotalLength(); } catch(e){ CH.lineLen = 330; CH.leadLen = 330; }
  CH.cLine.style.strokeDasharray = CH.lineLen + ' ' + (CH.lineLen + 10);
  CH.cLead.style.strokeDasharray = CH.leadLen + ' ' + (CH.leadLen + 10);
  CH.ny = ny;
  /* comet speed profile: exits at 900 px/s, eases to the line speed vL, keeps the arc-length velocity continuous */
  var LL = CH.leadLen, LN = CH.lineLen, TLEAD = 0.42, TLINE = 1.40;
  CH.vL = 1.12 * LN / TLINE;
  /* lead speed v(x) = vL + (900 - vL)(1 - x^n): starts at 900 px/s, lands exactly on vL (no stall, no jump) */
  var mean = clamp((LL - CH.vL * TLEAD) / ((900 - CH.vL) * TLEAD), 0.34, 0.97);
  CH.n = mean / (1 - mean); CH.TLEAD = TLEAD; CH.TLINE = TLINE;
})();
/* arc length of the comet head along lead+line at time u after exit */
function cometS(u){
  if (u <= 0) return 0;
  if (u < CH.TLEAD){ var x = u / CH.TLEAD, sL = CH.vL * u + (900 - CH.vL) * CH.TLEAD * (x - Math.pow(x, CH.n + 1) / (CH.n + 1)); return Math.min(sL, CH.leadLen); }
  var w = u - CH.TLEAD, LN = CH.lineLen, v = CH.vL, t88 = 0.88 * LN / v;
  if (w < t88) return CH.leadLen + v * w;
  var r = Math.min(1, (w - t88) / (2 * 0.12 * LN / v));
  return CH.leadLen + 0.88 * LN + 0.12 * LN * (1 - (1 - r) * (1 - r));
}

/* ghost-finger helper */
var ghostEl = $('ghost');
