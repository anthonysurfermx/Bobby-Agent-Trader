/* =====================================================================
   6. DOM helpers (cached writes, no CSS transitions anywhere)
   Every write is compared first; numeric helpers compare numbers before
   building a string, so a settled frame allocates nothing.
   ===================================================================== */
function st(el, k, v){ var c = el._c || (el._c = {}); if (c[k] !== v){ c[k] = v; el.style[k] = v; } }
function att(el, k, v){ var c = el._a || (el._a = {}); if (c[k] !== v){ c[k] = v; el.setAttribute(k, v); } }
function attN(el, k, v){ v = Math.round(v * 100) / 100; var c = el._an || (el._an = {}); if (c[k] !== v){ c[k] = v; el.setAttribute(k, v); } }
function f2(x){ return (Math.round(x * 100) / 100).toString(); }
function tf(el, x, y, s, extra){
  x = Math.round(x * 100) / 100; y = Math.round(y * 100) / 100;
  s = (s != null && Math.abs(s - 1) > 1e-4) ? Math.round(s * 10000) / 10000 : 1; extra = extra || '';
  if (el._tx === x && el._ty === y && el._ts === s && el._te === extra) return;
  el._tx = x; el._ty = y; el._ts = s; el._te = extra;
  el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)' + (s !== 1 ? ' scale(' + s + ')' : '') + extra;
}
function tr1(el, fn, v, dp){ var m = dp || 100; v = Math.round(v * m) / m; if (el._t1 === v && el._t1f === fn) return; el._t1 = v; el._t1f = fn; el.style.transform = fn + '(' + v + (fn === 'scaleY' ? ')' : 'px)'); }
function op(el, o){
  var q = o < 0.002 ? 0 : (o > 0.998 ? 1 : Math.round(o * 1000) / 1000);
  if (el._o === q) return; el._o = q;
  el.style.opacity = q; el.style.visibility = q === 0 ? 'hidden' : 'visible';
}
function bl(el, b){ var q = b > 0.05 ? Math.round(b * 100) / 100 : 0; if (el._b === q) return; el._b = q; el.style.filter = q ? 'blur(' + q + 'px)' : 'none'; }
function stc(el, k, c, a){
  var r = Math.round(clamp(c[0], 0, 1) * 255), g = Math.round(clamp(c[1], 0, 1) * 255), b = Math.round(clamp(c[2], 0, 1) * 255), A1 = a == null ? 1 : Math.round(a * 1000) / 1000;
  var key = ((r * 256 + g) * 256 + b) * 1001 + A1 * 1000, cc = el._cc || (el._cc = {});
  if (cc[k] === key) return; cc[k] = key;
  var v = 'rgba(' + r + ',' + g + ',' + b + ',' + A1 + ')';
  if (k.charCodeAt(0) === 45) el.style.setProperty(k, v); else el.style[k] = v;
}
function stU(el, k, v, unit, dp){ var m = dp || 100; v = Math.round(v * m) / m; var c = el._su || (el._su = {}); if (c[k] === v) return; c[k] = v; el.style[k] = v + unit; }
function tfx(el, x, y, sx, sy, deg){
  x = Math.round(x * 100) / 100; y = Math.round(y * 100) / 100; sx = Math.round(sx * 1000) / 1000; sy = Math.round(sy * 1000) / 1000; deg = Math.round(deg * 100) / 100;
  if (el._tx === x && el._ty === y && el._tsx === sx && el._tsy === sy && el._tr === deg) return;
  el._tx = x; el._ty = y; el._tsx = sx; el._tsy = sy; el._tr = deg;
  el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)' + (sx !== 1 || sy !== 1 ? ' scale(' + sx + ',' + sy + ')' : '') + (deg ? ' rotate(' + deg + 'deg)' : '');
}
function attDash(el, a, b, c, d){
  a = Math.round(a * 100) / 100; b = Math.round(b * 100) / 100;
  if (c != null){ c = Math.round(c * 100) / 100; d = Math.round(d * 100) / 100; }
  if (el._da === a && el._db === b && el._dc === c && el._dd === d) return;
  el._da = a; el._db = b; el._dc = c; el._dd = d;
  el.setAttribute('stroke-dasharray', c != null ? a + ' ' + b + ' ' + c + ' ' + d : a + ' ' + b);
}
function bezLen(x0, y0, x1, y1, x2, y2, x3, y3){
  var L = 0, px = x0, py = y0;
  for (var i = 1; i <= 24; i++){
    var t = i / 24, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    var qx = a * x0 + b * x1 + c * x2 + d * x3, qy = a * y0 + b * y1 + c * y2 + d * y3;
    L += Math.sqrt((qx - px) * (qx - px) + (qy - py) * (qy - py)); px = qx; py = qy;
  }
  return L;
}
function geoKey(o, a, b, c, d, e, f){
  a = Math.round(a * 100); b = Math.round(b * 100); c = Math.round(c * 100); d = Math.round(d * 100); e = Math.round((e || 0) * 100); f = Math.round((f || 0) * 100);
  if (o._g0 === a && o._g1 === b && o._g2 === c && o._g3 === d && o._g4 === e && o._g5 === f) return false;
  o._g0 = a; o._g1 = b; o._g2 = c; o._g3 = d; o._g4 = e; o._g5 = f; return true;
}
/* word spans (DOM text only: never innerHTML with data) */
function words(el, text){
  el.textContent = '';
  var out = [], ws = String(text || '').split(/\s+/).filter(Boolean);
  ws.forEach(function(w, i){
    var s = D.createElement('span'); s.className = 'w'; s.textContent = w; el.appendChild(s); out.push(s);
    if (i < ws.length - 1) el.appendChild(D.createTextNode(' '));
  });
  return out;
}
function mk(tag, cls, text){ var e = D.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

/* ---- text roll (160 ms: old leaves up 8 and fades, new rises from +8 on snap, 40 ms later) ---- */
function Roll(el, dist, dur){ this.el = el; el.classList.add('roll'); this.a = D.createElement('span'); this.b = D.createElement('span'); el.appendChild(this.a); el.appendChild(this.b); this.cur = this.a; this.old = this.b; this.tS = -99; this.text = ''; this.d = dist || 8; this.dur = dur || 0.16; this.ny = new V(0, 'snap', true); }
Roll.prototype.set = function(text, instant){
  if (text === this.text) return; this.text = text;
  var t = this.old; this.old = this.cur; this.cur = t; this.cur.textContent = text;
  if (instant || RM){ this.tS = -99; this.old.textContent = ''; this.ny.set(0); return; }
  this.tS = clk; this.ny.set(this.d); this.ny.to(0, 'snap', null, 0.04);
};
Roll.prototype.render = function(){
  var u = clamp((clk - this.tS) / this.dur, 0, 1), fo = E.fade(u);
  tr1(this.old, 'translateY', -this.d * fo); op(this.old, 1 - fo);
  var ui = clamp((clk - this.tS - 0.04) / this.dur, 0, 1);
  tr1(this.cur, 'translateY', this.ny.x); op(this.cur, this.tS < -50 ? 1 : E.fade(ui));
};

/* ---- odometer: only changed digits roll, 22 ms per digit, 280 ms per roll ---- */
function Odo(el){ this.el = el; this.cols = []; this.t0 = 1e9; }
Odo.prototype.build = function(a, b){
  var el = this.el; el.textContent = ''; this.cols = [];
  a = a == null ? b : a;
  var n = Math.max(a.length, b.length), k = 0, same = a.length === b.length;
  for (var i = 0; i < n; i++){
    var ca = a.charAt(i), cb = b.charAt(i);
    if (same && ca !== cb && /\d/.test(ca) && /\d/.test(cb)){
      var s = mk('span', 'dg'), inner = D.createElement('b');
      inner.appendChild(mk('span', null, ca)); inner.appendChild(mk('span', null, cb)); s.appendChild(inner); el.appendChild(s);
      this.cols.push({ el: inner, k: k++ });
    } else el.appendChild(D.createTextNode(cb || ''));
  }
  var ncols = this.cols.length; this.cols.forEach(function(c){ c.k = ncols - 1 - c.k; });   /* right-most digit rolls first */
  this.t0 = 1e9;
};
Odo.prototype.render = function(){
  for (var i = 0; i < this.cols.length; i++){
    var c = this.cols[i], u = RM ? 1 : clamp((clk - this.t0 - c.k * 0.022) / 0.28, 0, 1);
    tr1(c.el, 'translateY', -22 * E.data(u));
  }
};

/* =====================================================================
   7. Element references and static builds
   ===================================================================== */
var el = {
  amb: $('amb'), pool: $('pool'), fb: $('fallback'), sphereA: $('sphereA'), islaG: $('islaG'), iNew: $('iNew'),
  orbitE: $('orbitE'), om: [$('om0'), $('om1'), $('om2'), $('om3')], th: [$('th0'), $('th1'), $('th2')],
  islaRing: $('islaRing'), ringG: $('ringG'), rTrack: $('rTrack'), rArc: $('rArc'), rHead: $('rHead'), beadTrail: $('beadTrail'), trailG: $('trailG'),
  chart: $('chart'), cGrid: $('cGrid'), cG: [$('cG0'), $('cG1')], cGT: [$('cG0T'), $('cG1T')], cX: $('cX'),
  bandClipR: $('bandClipR'), cBand: $('cBand'), cBandR: $('cBandR'), cBandT: $('cBandT'), cBandB: $('cBandB'), cBandL: $('cBandL'), cLines: $('cLines'),
  cArea: $('cArea'), cLead: $('cLead'), cGlow: $('cGlow'), cLine: $('cLine'), cPrice: $('cPrice'),
  cBr: $('cBr'), cBrL: $('cBrL'), cBrA: $('cBrA'), cBrB: $('cBrB'), cBrT: $('cBrT'), cBrS: $('cBrS'),
  cPulse: $('cPulse'), cNow: $('cNow'), cHead: $('cHead'), cHeadG: $('cHeadG'), leadG: $('leadG'),
  verdict: $('verdict'), vWord: $('vWord'), convL: $('convL'), pct: $('pct'), d100: $('d100').firstChild, d10: $('d10').firstChild, d1: $('d1').firstChild,
  sats: [$('sat0'), $('sat1'), $('sat2'), $('sat3')], satG: $('satG'), satT: [$('satT0'), $('satT1')], belt: $('belt'),
  ag: [$('ag0'), $('ag1'), $('ag2')], say: [$('say0'), $('say1')], live: $('live'), meta: $('meta'), tx: $('tx'), bead: $('bead'),
  greet: $('greet'), note: $('note'), ftx: [$('ftx0'), $('ftx1')], meri: [].slice.call($('meri').querySelectorAll('i')), badge: $('meri').querySelector('b'), meriHit: $('meriHit'),
  cards: [$('card0'), $('card1'), $('card2')], save: $('save'), saveSw: $('saveSw'), tpill: $('tpill'),
  eyebrow: $('eyebrow'), chipRow: $('chipRow'), perm: $('perm'), wm: $('wm'), close: $('close'), dockQ: $('dockQ'), dockA: $('dockA'), avatar: $('avatar'), xpArc: $('xpArc'),
  hint: $('hint'), micGlow: $('micGlow'), pill: $('pill'), ghost: $('ghost'), pause: $('pauseTag'),
  typeBox: $('typeBox'), ta: $('ta'), taSend: $('taSend')
};
el.micGlowI = el.micGlow.querySelector('i');
el.ftxT = el.ftx.map(function(r){ return r.querySelector('.t'); }); el.ftxS = el.ftx.map(function(r){ return r.querySelector('.s'); });
el.ftxCW = el.ftx.map(function(r){ return r.querySelector('.cw'); }); el.ftxC = el.ftx.map(function(r){ return r.querySelector('.fchip'); });
el.pillMic = el.pill.querySelector('.mic'); el.pillKbd = el.pill.querySelector('.kbd'); el.pillBars = el.pill.querySelector('.bars'); el.pillGoo = el.pill.querySelector('.goo');
el.pillThink = el.pill.querySelector('.think'); el.pillStop = el.pill.querySelector('.stop');
el.thinkDots = [].slice.call(el.pillThink.querySelectorAll('i'));
el.gb = [$('gb0'), $('gb1'), $('gb2')];
el.bars = [];
for (var bi = 0; bi < 22; bi++){ var bb = D.createElement('i'); el.pillBars.appendChild(bb); el.bars.push(bb); }
var BAR_PH = []; for (bi = 0; bi < 22; bi++) BAR_PH.push(rnd() * TAU);
el.greetT = el.greet.querySelector('.t'); el.greetS = el.greet.querySelector('.s');
el.noteT = el.note.querySelector('.t'); el.noteS = el.note.querySelector('.s');
el.agNm = el.ag.map(function(a){ return a.querySelector('.nm span'); });
el.agSt = el.ag.map(function(a){ return a.querySelector('.st'); });
el.cioSw = el.ag[2].querySelector('.sw'); el.cioVf = el.ag[2].querySelector('.vf');
el.satK = el.sats.map(function(s){ return s.querySelector('.k'); }); el.satV = el.sats.map(function(s){ return s.querySelector('.v'); });
el.satOdo = [0, 1, 2, 3].map(function(){ return new Odo(mk('span', 'od')); });
el.card0 = { lb: el.cards[0].querySelector('.lb'), mt: el.cards[0].querySelector('.mt'), scr: el.cards[0].querySelector('.scr'), inn: el.cards[0].querySelector('.scr .in'), disc: el.cards[0].querySelector('.disc') };
el.card1 = { lb: el.cards[1].querySelector('.lb'), mt: el.cards[1].querySelector('.mt'), ct: el.cards[1].querySelector('.ct'), rows: el.cards[1].querySelector('.rows'),
  ln: el.cards[1].querySelector('.ln'), hz: el.cards[1].querySelector('.hz'), xp: el.cards[1].querySelector('.xp') };
el.card2 = { lb: el.cards[2].querySelector('.lb'), mt: el.cards[2].querySelector('.mt'), ct: el.cards[2].querySelector('.ct'), rows: el.cards[2].querySelector('.rows'), go: el.cards[2].querySelector('.go') };
el.permH = el.perm.querySelector('h4'); el.permP = el.perm.querySelector('p'); el.permBtn = el.perm.querySelector('button');

var hintRoll = new Roll(el.hint), saveRoll = new Roll($('saveRoll')), vfRoll = new Roll(el.cioVf);
(function(){ [el.d100, el.d10, el.d1].forEach(function(col){ for (var d = 0; d < 10; d++) col.appendChild(mk('span', null, String(d))); }); })();
el.d100P = el.d100.parentNode; el.d10P = el.d10.parentNode;

/* header avatar: the chosen companion's thumbnail at 118% crop, or a monogram */
function buildAvatar(){
  var ph = el.avatar.querySelector('.ph'); ph.textContent = '';
  if (ME.art && ME.art.dataUri){ var im = D.createElement('img'); im.alt = ''; im.src = ME.art.dataUri; ph.appendChild(im); }
  else if (ME.label){ ph.appendChild(mk('div', 'mg', ME.label.charAt(0))); }
}
function setXpArc(progress){
  var C18 = TAU * 18, p = clamp(fin(progress) ? progress : 0, 0, 1);
  att(el.xpArc, 'stroke-dasharray', (C18 * p).toFixed(1) + ' ' + C18.toFixed(1));
}

/* squad belt: the real roster, in roster order, art by webId from companions.json */
var BELT = [], BELT_SZ = [], BELT_TOT = 0;
function buildBelt(roster){
  el.belt.textContent = ''; BELT = [];
  (roster || []).forEach(function(c){
    var on = c.id === ME.id, art = artFor(c.webId);
    var d = mk('div', 'bd' + (on ? ' on' : '') + (c.unlocked ? '' : ' lk'));
    if (art && art.dataUri){ var im = D.createElement('img'); im.alt = ''; im.src = art.dataUri; d.appendChild(im); }
    el.belt.appendChild(d); BELT.push({ el: d, on: on });
  });
  BELT_SZ = BELT.map(function(b){ return b.on ? 32 : 20; }); BELT_TOT = BELT_SZ.reduce(function(a, b){ return a + b; }, 0);
}

/* isla growth ring: one plot per island slot (from island().growth) */
el.islaSeg = [];
function buildIslaRing(n){
  n = clamp(n | 0, 0, 24);
  el.islaRing.textContent = ''; el.islaSeg = [];
  for (var i = 0; i < n; i++){ var p = D.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('fill', 'none'); p.setAttribute('stroke-linecap', 'butt'); p.setAttribute('stroke-width', '8'); el.islaRing.appendChild(p); el.islaSeg.push(p); }
  el.islaRing._g0 = null;
}
