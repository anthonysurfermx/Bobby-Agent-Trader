(function(){
'use strict';
/* ============================================================
   Núcleo v2 — first run (onboarding) prototype
   One organism: everything Bobby says is born from the sphere,
   everything the user says is born from the black pill.
   ============================================================ */
/* companions come only from the inline JSON block (parsed at runtime; a bad payload leaves a glass-only sphere) */
var COMPANIONS = (function(){ try { var n = document.getElementById('companions'); var a = JSON.parse(n ? n.textContent : '[]'); return Array.isArray(a) ? a : []; } catch(e){ return []; } })();

var Q = {};
try { location.search.replace(/^\?/, '').split('&').forEach(function(kv){ if (!kv) return; var p = kv.split('='); Q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); }); } catch(e){}
var RM = Q.rm === '1';
try { RM = RM || window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(e){}
var TR = RM ? 0 : 1;            /* travel multiplier: reduced motion removes travel, never slows it */

function $(id){ return document.getElementById(id); }
var stage = $('stage');

/* ---------- math ---------- */
function clamp(x, a, b){ return x < a ? a : (x > b ? b : x); }
function c01(x){ return x < 0 ? 0 : (x > 1 ? 1 : x); }
function lerp(a, b, t){ return a + (b - a) * t; }
function sstep(a, b, x){ x = c01((x - a) / (b - a)); return x * x * (3 - 2 * x); }
function wrapPi(a){ a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; }
function f1(n){ return (Math.round(n * 10) / 10).toString(); }
function f3(n){ return (Math.round(n * 1000) / 1000).toString(); }

/* ---------- curves (no physics) ---------- */
function bez(x1, y1, x2, y2){
  function A(a1, a2){ return 1 - 3 * a2 + 3 * a1; } function B(a1, a2){ return 3 * a2 - 6 * a1; } function C(a1){ return 3 * a1; }
  function calc(t, a1, a2){ return ((A(a1, a2) * t + B(a1, a2)) * t + C(a1)) * t; }
  function slope(t, a1, a2){ return 3 * A(a1, a2) * t * t + 2 * B(a1, a2) * t + C(a1); }
  return function(x){
    if (x <= 0) return 0; if (x >= 1) return 1;
    var t = x, i, lo = 0, hi = 1;
    for (i = 0; i < 6; i++){ var s = slope(t, x1, x2); if (Math.abs(s) < 1e-5) break; t -= (calc(t, x1, x2) - x) / s; }
    if (t < 0 || t > 1 || Math.abs(calc(t, x1, x2) - x) > 1e-4){ t = x; for (i = 0; i < 24; i++){ var v = calc(t, x1, x2); if (v > x) hi = t; else lo = t; t = (lo + hi) / 2; } }
    return calc(t, y1, y2);
  };
}
var EXH = bez(.12, .8, .28, 1), INH = bez(.55, 0, .8, .4), FOC = bez(.2, .65, .25, 1), DAT = bez(.3, 0, .1, 1), FAD = bez(.4, 0, .2, 1);
function ease(fn, t0, dur, T){ return fn(c01((T - t0) / dur)); }

/* ---------- the 9 named springs ---------- */
var SPR = { snap:[600,48], soft:[140,22], emit:[190,18], pill:[260,26], ret:[260,32], glide:[170,23], gulp:[320,14], gaze:[90,17], birth:[90,13] };
var SPA = {};
(function(){ for (var nm in SPR){ var k = SPR[nm][0], c = SPR[nm][1], w = Math.sqrt(k), z = c / (2 * w); SPA[nm] = { w:w, z:z, wd:w * Math.sqrt(1 - z * z) }; } })();
/* analytic step response of a named spring (mass 1): used by DOM entrances so they stay deterministic under seek */
function sp(nm, t){
  if (t <= 0) return 0;
  if (RM) return c01(t / 0.2);
  var s = SPA[nm], e = Math.exp(-s.z * s.w * t);
  return 1 - e * (Math.cos(s.wd * t) + s.z * s.w / s.wd * Math.sin(s.wd * t));
}
/* integrated springs: every sphere position, radius and uniform */
var ALL = [];
function S(x, nm){ var s = { x:x, v:0, t:x, k:0, c:0, m:1 }; setK(s, nm || 'soft'); ALL.push(s); return s; }
function setK(s, nm){ if (RM){ crit(s, 0.25); return; } var p = SPR[nm]; s.k = p[0]; s.c = p[1]; s.nm = nm; }
function U(x, T){ var s = { x:x, v:0, t:x, k:0, c:0, m:1 }; crit(s, RM ? Math.min(T, 0.25) : T); ALL.push(s); return s; }
function crit(s, T){ var w = 2 * Math.PI / T; s.k = w * w; s.c = 2 * w; s.nm = null; }
function to(s, t, nm){ s.t = t; if (nm) setK(s, nm); }
function kick(s, dv){ if (!RM) s.v += dv; }
/* temperament on the sphere BODY only (cy, r, gulp, sag, hop, lean): response, mass and ζ of whatever named spring
   the body is on right now. The debate nodes, impacts, faces/picker rotation and every DOM entrance keep the
   named springs untouched, so impact, condensation and ring are identical for every companion. */
function temperBody(s, m0, tp){
  if (RM){ s.m = m0; return; }
  var w, z;
  if (s.nm){ var p = SPR[s.nm]; w = Math.sqrt(p[0]); z = p[1] / (2 * w);
    if (s.nm === 'gulp') z = tp[TP_ZG]; else if (s.nm === 'emit') z = tp[TP_ZE]; else if (s.nm === 'soft' || s.nm === 'gaze') z = lerp(z, 0.95, tp[TP_ZC]); }
  else if (s.T0){ w = 2 * Math.PI / s.T0; z = 1; }
  else { s.m = m0; return; }
  w /= tp[TP_RESP]; s.k = w * w; s.c = 2 * z * w; s.m = m0 * tp[TP_MASS];
}
function stepSprings(h){
  for (var i = 0; i < ALL.length; i++){ var s = ALL[i]; var a = (s.k * (s.t - s.x) - s.c * s.v) / s.m; s.v += a * h; s.x += s.v * h; }
}

/* ---------- colour (OKLab mixing) ---------- */
function hexRgb(h){ h = h.replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
function s2l(c){ c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function l2s(c){ c = Math.max(0, c); c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return c01(c); }
function lab(h){
  var c = hexRgb(h), r = s2l(c[0]), g = s2l(c[1]), b = s2l(c[2]);
  var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
function labRgbTo(o, L0, L1, L2){ /* -> display-space rgb 0..1 (the shader composites in display space, like v1); writes into o (no allocation) */
  var l = L0 + 0.3963377774 * L1 + 0.2158037573 * L2, m = L0 - 0.1055613458 * L1 - 0.0638541728 * L2, s = L0 - 0.0894841775 * L1 - 1.2914855480 * L2;
  l = l * l * l; m = m * m * m; s = s * s * s;
  o[0] = l2s(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s); o[1] = l2s(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s); o[2] = l2s(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
  return o;
}
function labRgb(L){ return labRgbTo([0, 0, 0], L[0], L[1], L[2]); }
function mixLab(a, b, t){ return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function mixLabTo(o, a, b, t){ o[0] = lerp(a[0], b[0], t); o[1] = lerp(a[1], b[1], t); o[2] = lerp(a[2], b[2], t); return o; }
function rgb01(h){ var c = hexRgb(h); return [c[0] / 255, c[1] / 255, c[2] / 255]; }
function css(c, a){ return 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + (a == null ? 1 : a) + ')'; }

/* ---------- seeded PRNG (determinism) ---------- */
function prng(seed){ return function(){ seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ---------- tokens ---------- */
var GLASS = { matrix:'#A8C79A', plasma:'#B99CF0', ice:'#A7BFE8', gold:'#E6D6A8', ghost:'#B8C2D3', lava:'#D9A48E' };
var TCAP = { lava:0.28 };
/* temperament by palette (§2.1): AMBIENT behaviour only. Impact, condensation and the conviction ring are identical for
   every companion; DOM choreography keeps the named springs. Every palette is a full vector, so the picker can blend
   two neighbours linearly by the drag fraction. Keys (index = TP_*):
     resp   response multiplier of the sphere-body springs (time scale, ζ kept)      matrix ×.9 precise, ghost ×1.2 floaty
     mass   sphere-body mass multiplier (heavier = slower and a touch looser)          gold ×1.25 heavy
     zg/ze  ζ of the body's gulp / emit springs (defaults = the named springs)        plasma .28 / .55 elastic
     zc     weight toward ζ .95 on the body's settle springs (soft, gaze)             ice 1 = crisp
     breath master breath period B (s): the ONE clock; its period is sprung, its phase never jumps
     drift  uDrift rate                                                               ice ×.7, ghost ×1.4
     flow   idle interior flow (rotation + iridescent phase rate)                     lava ×.8 viscous
     fol    extra DOM follow-through behind the sphere (s)                            lava +.08 */
var TP_RESP = 0, TP_MASS = 1, TP_ZG = 2, TP_ZE = 3, TP_ZC = 4, TP_BREATH = 5, TP_DRIFT = 6, TP_FLOW = 7, TP_FOL = 8, TP_N = 9;
var TP_KEYS = ['resp', 'mass', 'zg', 'ze', 'zc', 'breath', 'drift', 'flow', 'fol'];
var TEMPER = {
  none:  {},                                        /* before anyone lives in the glass: the neutral 4.8 s clock */
  matrix:{ name:'precise', resp:0.9, breath:4.4 },
  plasma:{ name:'elastic', zg:0.28, ze:0.55 },
  ice:   { name:'crisp', zc:1, drift:0.7, breath:5.2 },
  gold:  { name:'heavy', mass:1.25, breath:5.6 },
  ghost: { name:'floaty', resp:1.2, drift:1.4, breath:4.8 },
  lava:  { name:'viscous', fol:0.08, flow:0.8 }
};
var TV = {};
(function(){
  var d = { resp:1, mass:1, zg:SPA.gulp.z, ze:SPA.emit.z, zc:0, breath:4.8, drift:1, flow:1, fol:0 };
  for (var p in TEMPER){ var v = new Float64Array(TP_N); for (var i = 0; i < TP_N; i++){ var k = TP_KEYS[i]; v[i] = TEMPER[p][k] != null ? TEMPER[p][k] : d[k]; } TV[p] = v; }
})();
var ISLA_TINT = '#7BC8F0', ISLA_LAB = lab(ISLA_TINT), TMP_LAB = [0, 0, 0];
var AMB_IDLE = lab('#15121C'), AMB_WAIT = lab('#19140D'), ISLA_RGB = rgb01(ISLA_TINT);
var C_ALPHA = rgb01('#3FE0B5'), C_RED = rgb01('#FF5A5F'), C_CIO = rgb01('#F6B94E'), C_PEARL = rgb01('#E8DFD0'), C_IVORY = rgb01('#F2EDE4');
var CORE_WAIT = rgb01('#2A1C08');

/* ---------- companions (ids, labels, palettes and images come only from companions.json) ---------- */
var CO = [];
COMPANIONS.forEach(function(c){ if (c && c.id && c.label) CO.push({ id:String(c.id), label:String(c.label), palette:GLASS[c.palette] ? c.palette : 'ghost', uri:(typeof c.dataUri === 'string' && c.dataUri.indexOf('data:image/') === 0) ? c.dataUri : '' }); });
var HAVE_CO = CO.length > 0;
if (!HAVE_CO) CO = [{ id:'bobby', label:'Bobby', palette:'matrix', uri:'' }, { id:'byte', label:'Byte', palette:'matrix', uri:'' }, { id:'kora', label:'Kora', palette:'matrix', uri:'' }, { id:'zip', label:'Zip', palette:'matrix', uri:'' }, { id:'mira', label:'Mira', palette:'ghost', uri:'' }];
var PICK_IDS = ['bobby', 'byte', 'kora', 'zip', 'mira'];
var ORDER = [];
PICK_IDS.forEach(function(id){ for (var i = 0; i < CO.length; i++) if (CO[i].id === id) ORDER.push(CO[i]); });
CO.forEach(function(c){ if (ORDER.indexOf(c) < 0) ORDER.push(c); });
var NPICK = 0; PICK_IDS.forEach(function(id){ ORDER.forEach(function(c){ if (c.id === id) NPICK++; }); });
var CHOSEN = Math.max(0, NPICK - 1);   /* mira, the fifth swipe */
ORDER.forEach(function(c){ c.tintLab = lab(GLASS[c.palette]); c.tintCap = TCAP[c.palette] || 0.35; c.bg = [0.165, 0.165, 0.165]; c.ready = false; });

/* flood-fill matte (§4.3): border mean, BFS from the border, erode 1, feather 1, radial mask. Never a luminance key. */
function buildMatte(c, done){
  if (!c.uri) return;
  var img = new Image();
  img.onload = function(){
    try {
      var N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
      var x = cv.getContext('2d'); x.drawImage(img, 0, 0, N, N);
      var id = x.getImageData(0, 0, N, N), d = id.data, p, i, j;
      var sr = 0, sg = 0, sb = 0, cnt = 0, border = [];
      for (i = 0; i < N; i++){ border.push(i, (N - 1) * N + i); }
      for (j = 1; j < N - 1; j++){ border.push(j * N, j * N + N - 1); }
      border.forEach(function(q){ sr += d[q * 4]; sg += d[q * 4 + 1]; sb += d[q * 4 + 2]; cnt++; });
      var bm = [sr / cnt, sg / cnt, sb / cnt];
      var vis = new Uint8Array(N * N), qu = new Int32Array(N * N), qh = 0, qt = 0;
      function nearBg(q){ return Math.max(Math.abs(d[q * 4] - bm[0]), Math.abs(d[q * 4 + 1] - bm[1]), Math.abs(d[q * 4 + 2] - bm[2])) <= 22; }
      function close(a, b){ return Math.max(Math.abs(d[a * 4] - d[b * 4]), Math.abs(d[a * 4 + 1] - d[b * 4 + 1]), Math.abs(d[a * 4 + 2] - d[b * 4 + 2])) <= 5; }
      border.forEach(function(q){ if (!vis[q] && nearBg(q)){ vis[q] = 1; qu[qt++] = q; } });
      while (qh < qt){
        p = qu[qh++]; var px = p % N, py = (p / N) | 0;
        var nb = [px > 0 ? p - 1 : -1, px < N - 1 ? p + 1 : -1, py > 0 ? p - N : -1, py < N - 1 ? p + N : -1];
        for (i = 0; i < 4; i++){ var q = nb[i]; if (q >= 0 && !vis[q] && close(p, q) && nearBg(q)){ vis[q] = 1; qu[qt++] = q; } }
      }
      var a = new Float32Array(N * N), b = new Float32Array(N * N);
      for (p = 0; p < N * N; p++) a[p] = vis[p] ? 0 : 1;
      for (j = 0; j < N; j++) for (i = 0; i < N; i++){ var mn = 1; for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++){ var xx = clamp(i + dx, 0, N - 1), yy = clamp(j + dy, 0, N - 1); mn = Math.min(mn, a[yy * N + xx]); } b[j * N + i] = mn; }
      for (var pass = 0; pass < 2; pass++){
        for (j = 0; j < N; j++) for (i = 0; i < N; i++){ var s = 0; for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++){ s += b[clamp(j + dy, 0, N - 1) * N + clamp(i + dx, 0, N - 1)]; } a[j * N + i] = s / 9; }
        var t = a; a = b; b = t;
      }
      for (j = 0; j < N; j++) for (i = 0; i < N; i++){
        var rr = Math.sqrt((i + 0.5 - 128) * (i + 0.5 - 128) + (j + 0.5 - 128) * (j + 0.5 - 128)) / 128;
        d[(j * N + i) * 4 + 3] = Math.round(255 * b[j * N + i] * (1 - sstep(0.70, 0.96, rr)));
      }
      c.mid = id; c.bg = [bm[0] / 255, bm[1] / 255, bm[2] / 255]; c.ready = true;
      done(c);
    } catch(e){ /* tainted or decode failure: companion stays glass-only */ }
  };
  img.onerror = function(){};
  img.src = c.uri;
}
