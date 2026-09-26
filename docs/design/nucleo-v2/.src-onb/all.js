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


/* ============================================================
   The glass (§4). Raw WebGL1, one fullscreen triangle, scissored.
   Every phase is integrated in JS; the GLSL never multiplies
   a time value by a state value.
   ============================================================ */
var VS = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';
var FS = [
'#ifdef GL_FRAGMENT_PRECISION_HIGH',
'precision highp float;',
'#else',
'precision mediump float;',
'#endif',
'uniform vec4 uG;   /* cx, cy, r (px), breath */',
'uniform vec4 uL;   /* energy, voice, glow, irid */',
'uniform vec4 uB;   /* birth, rim hardness, specular, haptic */',
'uniform vec4 uPh;  /* twist, twistOsc, flow, drift */',
'uniform vec4 uPh2; /* rot, iridPh, dither seed, listen iridescence */',
'uniform vec4 uD;   /* swirl, sep, braid front, exposure */',
'uniform vec4 uNA; uniform vec4 uNR; uniform vec4 uNC; /* node: angle, radius, glow, direction */',
'uniform vec4 uCur; /* flowA, flowR, cio rotation, reduced-motion bands */',
'uniform vec4 uFl;  /* filament radius, alpha, angle, flood front */',
'uniform vec4 uV;   /* verdict rgb, flood amount */',
'uniform vec4 uVC;  /* core rgb, scrim */',
'uniform vec4 uSh;  /* shock radius, alpha, bottom bulge, pull */',
'uniform vec4 uShC; /* shock rgb, ripple amp */',
'uniform vec4 uRp;  /* ripple angle, ripple phase, emit angle, emit extrusion */',
'uniform vec4 uTi;  /* tint rgb, tint amount (rim/halo) */',
'uniform vec4 uNb;  /* neighbour tint rgb, amount (right sector) */',
'uniform vec4 uXA; uniform vec4 uXB; /* companion: offset x, offset y, side, alpha */',
'uniform vec4 uCo;  /* silhouette, depth, amount, emit width */',
'uniform vec4 uCb;  /* companion backdrop rgb, tint wash */',
'uniform vec4 uLt;  /* light parallax x, y, spark angle, spark amount */',
'uniform vec4 uAm;  /* ambient rgb, pearl merge */',
'uniform vec4 uQ;   /* quality tier: fbm octaves (4 or 3), dispersion on, -, - */',
'uniform sampler2D uTA; uniform sampler2D uTB;',
'float hash(vec3 p){ p = fract(p*0.3183099 + vec3(0.1,0.2,0.3)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }',
'float noise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);',
'  return mix(mix(mix(hash(i),hash(i+vec3(1.0,0.0,0.0)),f.x), mix(hash(i+vec3(0.0,1.0,0.0)),hash(i+vec3(1.0,1.0,0.0)),f.x),f.y),',
'             mix(mix(hash(i+vec3(0.0,0.0,1.0)),hash(i+vec3(1.0,0.0,1.0)),f.x), mix(hash(i+vec3(0.0,1.0,1.0)),hash(i+vec3(1.0,1.0,1.0)),f.x),f.y), f.z); }',
'float fbm(vec3 p){ float s = 0.0; float a = 0.5;',
'  for(int i=0;i<4;i++){',
'    if (float(i) >= uQ.x){ s += a*(1.0 - exp2(float(i) - 4.0)); break; }   /* a skipped octave adds its mean: the tier change never shifts brightness */',
'    s += a*noise(p); p = p*2.03 + vec3(1.7,9.2,3.1); a *= 0.5; }',
'  return s; }',
'float fbm2(vec3 p){ return 0.5*noise(p) + 0.25*noise(p*2.03 + vec3(1.7,9.2,3.1)) + 0.125; }',
'vec3 irid(float x){ x = fract(x);',
'  vec3 c1 = vec3(0.30,0.42,1.00); vec3 c2 = vec3(0.60,0.36,1.00); vec3 c3 = vec3(1.00,0.43,0.78); vec3 c4 = vec3(0.36,0.88,1.00);',
'  vec3 c = mix(c1, c2, smoothstep(0.0,0.25,x)); c = mix(c, c3, smoothstep(0.25,0.5,x)); c = mix(c, c4, smoothstep(0.5,0.75,x)); c = mix(c, c1, smoothstep(0.75,1.0,x));',
'  return mix(c, vec3(dot(c, vec3(0.299,0.587,0.114))), 0.2); }',
'mat2 rot(float a){ float c = cos(a); float s = sin(a); return mat2(c,-s,s,c); }',
'float iso(float v, float w){ return 1.0 - smoothstep(0.0, w, abs(v-0.5)); }',
'float adiff(float a, float b){ float d = a - b; return atan(sin(d), cos(d)); }',
'float gs(float x){ return exp(-x*x); }',
'float h2(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }',
'vec3 node(vec4 N, vec2 pp, float rr, float ang, vec3 c){',
'  vec2 pos = N.y*vec2(cos(N.x), sin(N.x)); vec2 dv = pp - pos;',
'  float head = exp(-dot(dv,dv)*900.0);',
'  float dr = rr - N.y; float db = adiff(N.x, ang)*N.w;',
'  float tr = step(0.0, db)*(1.0 - smoothstep(0.45, 0.6, db))*exp(-dr*dr*400.0)*exp(-db*6.0);',
'  return c*(head*1.5 + tr*0.65)*N.z; }',
'vec4 comp(sampler2D T, vec4 X, vec2 q, float z, float bias){',
'  vec2 uv = (q - X.xy)/max(X.z, 0.01); uv = vec2(0.5 + uv.x, 0.5 - uv.y);',
'  float inb = step(0.0, uv.x)*step(uv.x, 1.0)*step(0.0, uv.y)*step(uv.y, 1.0);',
'  vec2 cd = normalize(q + vec2(1e-4))*0.006*(1.0 - z);',
'  vec4 c = texture2D(T, clamp(uv, 0.0, 1.0), bias);',
'  if (uQ.y > 0.5){ c.r = texture2D(T, clamp(uv + cd, 0.0, 1.0), bias).r; c.b = texture2D(T, clamp(uv - cd, 0.0, 1.0), bias).b; }',
'  c.a *= inb*X.w; return c; }',
'vec3 unTone(vec3 c){ return -log(1.0 - min(c, vec3(0.955)))/1.3; }',
'void main(){',
'  vec2 p = (gl_FragCoord.xy - uG.xy)/uG.z;',
'  float rho = length(p); float ang = atan(p.y, p.x);',
'  float sb = max(0.0, -sin(ang));',
'  float e = 1.0 + 0.009*uG.w + 0.015*uB.w;',
'  e += uSh.z*sb*sb*sb;',
'  float da = adiff(ang, uRp.x);',
'  e += uShC.w*exp(-abs(da)*0.44)*sin(8.0*da - uRp.y);',
'  float de = adiff(ang, uRp.z)/max(uCo.w, 0.05);',
'  e += uRp.w*exp(-de*de);',
'  e += uSh.w*sb*sb*sb*sb;',
'  float d = rho/e;',
'  if (d > 1.8){ gl_FragColor = vec4(0.0); return; }',
'  float aa = 1.4/uG.z;',
'  float dith = (h2(gl_FragCoord.xy + fract(uPh2.z)*61.0) - 0.5)/255.0;',
'  float fl = uV.w*smoothstep(0.0, 1.0, uFl.w);',
'  vec3 hc = mix(irid(ang*0.159 + uPh2.y*3.0), uV.rgb, fl);',
'  hc = mix(hc, uTi.rgb, uTi.w);',
'  float hal = exp(-max(d - 1.0, 0.0)*4.0)*min(0.35, 0.20 + 0.05*uG.w + 0.25*uL.y)*uL.z;',
'  hal *= 1.0 - smoothstep(1.45, 1.8, d);',
'  hal = max(hal + dith, 0.0);',
'  vec4 outside = vec4(hc*hal, hal);',
'  if (d > 1.0 + aa){ gl_FragColor = outside; return; }',
'  vec2 pp = p/e; float r2 = min(dot(pp,pp), 1.0); float rr = sqrt(r2); float z = sqrt(1.0 - r2);',
'  float tw = uD.x*((1.3 - rr)*0.8*sin(uPh.y) + uPh.x);',
'  vec2 q = rot(tw)*pp;',
'  vec3 n = vec3(q*(1.0 + 0.45*(1.0 - z)), z*0.9);',
'  n.xz = rot(uPh2.x)*n.xz;',
'  float f1 = fbm(n*1.3 + vec3(0.0, 0.0, uPh.w));',
'  float f2 = fbm(n*2.2 + vec3(f1*2.4, f1*1.2, uPh.w*0.64));',
'  float bf = uB.x*1.4;',
'  float bm = 1.0 - smoothstep(bf - 0.35, bf - 0.05, rr);',
'  float dens = mix(0.18, 1.0, smoothstep(0.22, 0.78, f2))*bm;',
'  float calm = smoothstep(0.4, 1.0, uL.w);',
'  float body = mix(1.0, 1.0 - smoothstep(0.50, 0.98, rr), clamp(uB.y, 0.0, 1.0));',
'  vec3 cq = vec3(pp, z) - vec3(-0.30, 0.18, 0.80) - 0.20*vec3(f1 - 0.5, f2 - 0.5, 0.0);',
'  float core = exp(-dot(cq, cq)*2.0);',
'  vec3 sn = vec3(q, z); sn.xz = rot(uPh2.x)*sn.xz;',
'  float w1 = dot(sn, normalize(vec3(0.95, 0.18 + 0.25*sin(uPh.w*0.37), 0.30))) + 0.08*(f1 - 0.5);',
'  float w2 = dot(sn, normalize(vec3(0.45, -0.55, 0.70))) - 0.52 + 0.10*(f1 - 0.5);',
'  float cur = (gs(w1/0.011) + 0.20*gs(w1/0.06) + 0.55*gs(w2/0.022) + 0.25*gs(w2/0.08))*(0.30 + 0.90*smoothstep(0.38, 0.62, f1))*body*calm*bm;',
'  float fold = smoothstep(0.0, 0.20, w1)*exp(-max(w1, 0.0)*5.0);',
'  vec3 ir = irid((0.50*core - 0.24*smoothstep(0.0, 0.9, -sn.y)*(1.0 - core))*calm + 0.13*(f2 - 0.5) + 0.04*sin(6.2831853*uPh2.y));',
'  ir = max(mix(vec3(dot(ir, vec3(0.299,0.587,0.114))), ir, 1.45), 0.0);',
'  ir = mix(ir, uTi.rgb, uCb.w*body);',
'  vec3 col = ir*(0.60 + 1.05*core + 0.35*fold + 0.45*(smoothstep(0.2, 0.8, f2) - 0.5))*(0.62 + 0.55*uL.x)*uL.w*mix(0.05, 1.0, body)*bm',
'           + irid(0.62 + 0.4*core)*cur*0.55 + uAm.rgb*(1.0 - body*bm) + vec3(0.012);',
'  col += vec3(0.36,0.88,1.0)*uPh2.w*0.35*dens*(1.0 - smoothstep(-0.9, 0.15, pp.y));',
'  col += vec3(1.0,0.97,0.92)*0.6*(1.0 - uB.x)*step(0.001, uB.x)*gs((rr - uB.x*1.1)/0.05);',
'  vec3 m = n*1.7;',
'  if (uD.x > 0.002){',
'    float sep = uD.y;',
'    float sA = fbm2(m*0.9 + vec3(0.0, -uCur.x, 0.0) + vec3(3.1,1.7,0.4)*sep);',
'    float sR = fbm(m*1.25 + vec3(uCur.y, uCur.y*0.4, 0.0) + vec3(-2.3,4.1,1.9)*sep);',
'    vec2 dir = normalize(pp + vec2(1e-4));',
'    float hA = mix(1.0, smoothstep(-0.55, 0.85, dot(dir, vec2(-0.7, 0.7))), sep);',
'    float hR = mix(1.0, smoothstep(-0.55, 0.85, dot(dir, vec2(0.7, 0.7))), sep);',
'    vec3 nc = n; nc.xz = rot(uCur.z)*nc.xz;',
'    float by = -0.35*sep + 0.07*sin(nc.x*3.0 + nc.z*2.0);',
'    float sC = fbm2(nc*1.6 + vec3(0.0, 0.0, uCur.z*0.5));',
'    float bC = gs((pp.y - by - (sC - 0.5)*0.22)/0.06)*(0.35 + 0.65*smoothstep(0.35, 0.7, sC));',
'    float hC = mix(1.0, 1.0 - smoothstep(0.2, 0.9, pp.y), sep);',
'    float vis = smoothstep(0.0, 0.35, sep);',
'    vec3 cc = vec3(0.247,0.878,0.710)*(iso(sA, 0.045) + 0.28*iso(sA, 0.16))*hA*vis',
'            + vec3(1.0,0.353,0.373)*(iso(sR, 0.028) + 0.30*iso(sR, 0.12))*hR*vis',
'            + vec3(0.965,0.725,0.306)*(bC*0.6 + 0.12*gs((pp.y - by)/0.22))*hC*vis;',
'    vec3 bands = vec3(0.247,0.878,0.710)*smoothstep(0.3,0.9,dot(dir,vec2(-0.87,0.5))) + vec3(1.0,0.353,0.373)*smoothstep(0.3,0.9,dot(dir,vec2(0.87,0.5))) + vec3(0.965,0.725,0.306)*smoothstep(0.3,0.9,-dir.y);',
'    cc = mix(cc, bands*0.35*bm, uCur.w);',
'    float sM = fbm2(m + vec3(uCur.x*0.5, 0.0, uCur.y*0.2));',
'    cc += vec3(0.91,0.87,0.82)*(iso(sM, 0.05) + 0.25*iso(sM, 0.18))*uAm.w;',
'    col = mix(col, col*0.45, uD.x*0.5);',
'    col += cc*uD.x*(0.85 + 0.8*uL.x);',
'    col += node(uNA, pp, rr, ang, vec3(0.247,0.878,0.710)) + node(uNR, pp, rr, ang, vec3(1.0,0.353,0.373)) + node(uNC, pp, rr, ang, vec3(0.965,0.725,0.306));',
'  }',
'  float fm = (1.0 - smoothstep(uFl.w - 0.12, uFl.w, rr))*uV.w;',
'  if (uD.z > 0.002){',
'    float sB = fbm2(m*1.1 + vec3(uPh.z*0.5, -uPh.z*0.3, 0.0));',
'    float br = iso(sB, 0.05) + 0.3*iso(sB, 0.18);',
'    float bk = (1.0 - smoothstep(uD.z - 0.12, uD.z, rr))*(1.0 - fm);',
'    col = mix(col, col*0.5, bk*0.6);',
'    col += vec3(0.91,0.87,0.82)*br*bk*0.42*(0.8 + 0.6*uL.x);',
'    col += vec3(0.91,0.87,0.82)*0.5*gs((rr - uD.z)/0.03)*smoothstep(0.03, 0.15, uD.z)*(1.0 - smoothstep(0.9, 1.1, uD.z));',
'  }',
'  if (uFl.y > 0.002){',
'    float fil = gs((rr - uFl.x)/0.012);',
'    float fa = 0.35 + 0.65*pow(0.5 + 0.5*cos(adiff(ang, uFl.z)), 6.0);',
'    col += vec3(0.965,0.725,0.306)*fil*fa*uFl.y*1.3;',
'  }',
'  col = mix(col, uV.rgb*(0.16 + dens*0.72) + col*0.22, 0.62*fm);',
'  col += uV.rgb*0.45*gs((rr - uFl.w)/0.035)*uV.w*smoothstep(0.03, 0.15, uFl.w)*(1.0 - smoothstep(0.85, 1.1, uFl.w));',
'  col = mix(col, uVC.rgb, uVC.w*(1.0 - smoothstep(0.52, 0.93, rr)));   /* the core scrim of the core loop: verdict word >= 12:1 (§7.26) */',
'  float fr = pow(1.0 - z, 2.4);',
'  if (uCo.z > 0.002){',
'    float dep = uCo.y; float sil = uCo.x;',
'    float lens = 1.0/(1.0 + 0.35*(1.0 - z));',
'    vec2 qq = pp*lens + n.xy*0.03*dep;',
'    float bias = 3.0*dep;',
'    col = mix(col, uCb.rgb*0.9, 0.9*uCo.z*(1.0 - sil)*(1.0 - smoothstep(0.55, 0.85, rr))*max(uXA.w, uXB.w));',
'    vec4 ta = comp(uTA, uXA, qq, z, bias); vec4 tb = comp(uTB, uXB, qq, z, bias);',
'    float k = uCo.z*(1.0 - fr);',
'    vec2 fa2 = (qq - uXA.xy - vec2(0.0, -uXA.z*0.40))/(uXA.z*vec2(0.30, 0.05));',
'    col += vec3(1.0,0.97,0.92)*0.12*exp(-dot(fa2,fa2))*uXA.w*(1.0 - sil)*uCo.z;',
'    col = mix(col, unTone(ta.rgb), ta.a*k*(1.0 - sil));',
'    col = mix(col, unTone(tb.rgb), tb.a*k*(1.0 - sil));',
'    float la = dot(ta.rgb, vec3(0.299,0.587,0.114)); float lb = dot(tb.rgb, vec3(0.299,0.587,0.114));',
'    col += vec3(1.0,0.953,0.886)*(ta.a*(0.25 + 0.75*smoothstep(0.05, 0.6, la)) + tb.a*(0.25 + 0.75*smoothstep(0.05, 0.6, lb)))*k*sil;',
'  }',
'  vec3 rimC = mix(vec3(0.80,0.85,1.0), mix(uV.rgb, vec3(1.0), 0.3), fl*0.7);',
'  rimC = mix(rimC, uTi.rgb, uTi.w);',
'  float rh = uB.y*(1.0 + 0.08*uB.w);',
'  float frT = pow(1.0 - z, 8.0);',
'  col += rimC*(frT*1.8 + fr*0.06)*rh;',
'  col += rimC*0.14*gs((rr - 0.93)*40.0)*rh;',
'  float ia = ang*0.159 + uPh2.y*3.0;',
'  if (uQ.y > 0.5){ col.r += fr*0.10*irid(ia + 0.02).r*rh; col.b += fr*0.10*irid(ia - 0.02).b*rh; }',
'  col += irid(ia)*pow(1.0 - z, 7.0)*0.7*(1.0 - 0.6*fl)*rh;',
'  col += uNb.rgb*fr*0.45*uNb.w*(1.0 - smoothstep(0.35, 0.55, abs(adiff(ang, 0.0))));',
'  vec2 ruv = pp + n.xy*0.06;',
'  col += uAm.rgb*0.08*(1.0 - smoothstep(0.2, 1.3, length(ruv - vec2(0.0, 0.1))));',
'  col += vec3(1.0)*uLt.w*gs(adiff(ang, uLt.z)/0.03)*smoothstep(0.93, 1.0, rr);',
'  vec2 L = vec2(-0.36, 0.46) + uLt.xy; vec2 hp = pp - L; float hd = dot(hp,hp);',
'  vec2 hq = pp + 0.85*L;',
'  float spc = exp(-hd*420.0)*0.9*(1.0 + 0.4*uL.y) + exp(-hd*28.0)*0.25 + exp(-dot(hq,hq)*900.0)*0.25;',
'  col += vec3(1.0)*spc*uB.z;',
'  float cr = (rr - 0.82)*9.0;',
'  col += mix(ir, uV.rgb, fl)*exp(-cr*cr)*(1.0 - smoothstep(-0.95, -0.15, pp.y))*0.5*bm;',
'  col += uShC.rgb*uSh.y*gs((rr - uSh.x)/0.025);',
'  col = 1.0 - exp(-col*1.3*(1.0 + uD.w));',
'  col *= mix(0.70 + 0.30*z, 1.0, frT*clamp(rh, 0.0, 1.0));',
'  col += dith;',
'  float edge = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, d);',
'  gl_FragColor = mix(outside, vec4(col, 1.0), edge);',
'}'
].join('\n');

var cv = $('gl'), gl = null, glCtx = null, prog = null, loc = {}, KPX = 1;   /* gl: the live context, null while lost */
/* quality tiers (iPhone: DPR 3 screens, thermal limits). Cheapest last: resolution first, then detail. */
var DEV_DPR = window.devicePixelRatio || 1, QT = [];
[1.75, 1.5, 1.25, 1.0].forEach(function(d){ var e = Math.min(DEV_DPR, d); if (!QT.length || QT[QT.length - 1].dpr > e + 1e-3) QT.push({ dpr:e, oct:4, disp:1 }); });
(function(){ var lo = QT[QT.length - 1].dpr; QT.push({ dpr:lo, oct:3, disp:1 }, { dpr:lo, oct:3, disp:0 }); })();
var QPIN = Q.q != null && Q.q !== '' ? clamp(parseInt(Q.q, 10) || 0, 0, QT.length - 1) : null;
var QI = QPIN != null ? QPIN : 0, DPR = QT[QI].dpr;
var UN = ['uG','uL','uB','uPh','uPh2','uD','uNA','uNR','uNC','uCur','uFl','uV','uVC','uSh','uShC','uRp','uTi','uNb','uXA','uXB','uCo','uCb','uLt','uAm','uQ','uTA','uTB'];
try { glCtx = cv.getContext('webgl', { alpha:true, premultipliedAlpha:true, antialias:false, preserveDrawingBuffer:false }) || cv.getContext('experimental-webgl'); } catch(e){ glCtx = null; }
function mkSh(type, src){ var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)){ try { console.warn(gl.getShaderInfoLog(s)); } catch(e){} return null; } return s; }
/* (re)build the program, the full-screen triangle and the uniform table on glCtx (at boot and after a context restore);
   gl stays null unless all of it worked, so every draw path falls back to the 2D sphere */
function glBuild(){
  gl = glCtx; prog = null;
  if (!gl || (gl.isContextLost && gl.isContextLost())){ gl = null; return false; }
  var vsh = mkSh(gl.VERTEX_SHADER, VS), fsh = mkSh(gl.FRAGMENT_SHADER, FS);
  if (vsh && fsh){ prog = gl.createProgram(); gl.attachShader(prog, vsh); gl.attachShader(prog, fsh); gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) prog = null; }
  if (!prog){ gl = null; return false; }
  gl.useProgram(prog);
  var vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var al = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(al); gl.vertexAttribPointer(al, 2, gl.FLOAT, false, 0, 0);
  loc = {}; UN.forEach(function(n){ loc[n] = gl.getUniformLocation(prog, n); });
  gl.uniform1i(loc.uTA, 0); gl.uniform1i(loc.uTB, 1);
  gl.clearColor(0, 0, 0, 0);
  return true;
}
glBuild();
if (!gl) stage.classList.add('nogl');

/* textures: one 256² mipmapped matte per companion, plus a transparent 1×1 placeholder */
var TEX0 = null;
function blankTex(){ var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([42, 42, 42, 0])); return t; }
function uploadTex(c){
  if (!gl || !c.mid) return;
  var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c.mid);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.generateMipmap(gl.TEXTURE_2D);
  c.tex = t;
}
if (gl){ TEX0 = blankTex(); }
/* WebGL context loss (iOS Safari: app switch, lock screen, memory pressure). Without preventDefault WebKit never gives
   the context back and the sphere stays frozen on its last frame for good. While lost, gl is null and the 2D fallback
   draws; on restore the program, TEX0 and every companion matte are rebuilt on the new context and the canvas re-sized. */
if (glCtx){
  cv.addEventListener('webglcontextlost', function(e){ e.preventDefault(); gl = null; stage.classList.add('nogl'); }, false);
  cv.addEventListener('webglcontextrestored', function(){
    if (glBuild()){ TEX0 = blankTex(); ORDER.forEach(function(c){ c.tex = null; uploadTex(c); }); sizeGL(); qReset(); stage.classList.remove('nogl'); }
    else stage.classList.add('nogl');
    try { renderAll(); } catch(e){}
  }, false);
}

function sizeGL(){
  KPX = DPR * FIT;
  var w = Math.max(1, Math.round(390 * KPX)), h = Math.max(1, Math.round(844 * KPX));
  if (cv.width !== w || cv.height !== h){ cv.width = w; cv.height = h; }
  KPX = w / 390;
}
var FIT = 1, FIT_W = -1, FIT_H = -1, fitChk = 0;   /* FIT_W/H: the window size the transform was computed for */
function fit(){
  var w = window.innerWidth, h = window.innerHeight; FIT_W = w; FIT_H = h;
  var s = Math.min(w / 390, h / 844) || 1; FIT = s;
  var x = (w - 390 * s) / 2, y = (h - 844 * s) / 2;
  stage.style.transform = 'translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px) scale(' + s + ')';
  stage.classList.toggle('lbx-x', x > 0.5); stage.classList.toggle('lbx-y', y > 0.5);   /* letterbox feather (#lbx) */
  if (gl) sizeGL();
}
/* iOS Safari can run this before its toolbar is laid out (innerHeight 956, then 796 on a Pro Max) and report the change
   only as a visualViewport resize, never a window resize, leaving the stage oversized with the pill under the toolbar.
   Refit on every viewport signal; the loop also re-checks the window size twice a second as a backstop. */
function refit(){ if (window.innerWidth !== FIT_W || window.innerHeight !== FIT_H) fit(); }
fit(); window.addEventListener('resize', fit);
window.addEventListener('orientationchange', refit); window.addEventListener('pageshow', refit);
try { if (window.visualViewport) window.visualViewport.addEventListener('resize', refit); } catch(e){}

/* ---------- adaptive quality ----------
   Signal: the rolling median of the frame interval (31 frames), so one hitch never moves it.
   Down: median over budget for 1.5 s (0.75 s when it is 1.5x over) → one tier down (DPR 1.75 → 1.5 → 1.25 → 1.0,
   then 3 fbm octaves, then no dispersion). Up: headroom for the tier's back-off → one tier up.
   Budget: > 20 ms is over, ≤ 17.5 ms is headroom (holding 60 Hz), and 17.5–20 ms is a dead band where neither counter
   runs. Never oscillate, never stuck: the back-off before retrying a tier starts at 5 s and grows ×4 each time that tier
   fails (5, 20, 80 s …), so a GPU-bound phone settles after at most two short retries, while a transient slowdown
   (a notification, a thermal spike) can always climb back.
   Not GPU-bound (a plateau): if the lowest tier is still over budget and a better tier of this descent was just as
   fast (its median ≤ 1.1× the lowest's), cutting pixels bought nothing: rAF is capped (iOS Low Power Mode runs it at
   30 Hz), the main thread is busy, or the frame is vsync-quantised. Then the best such tier comes back and that
   interval becomes the budget (over > 1.2×, headroom ≤ 1.05×) until it lifts (median < 0.75× the cap). A cap is a
   belief, so it is re-tested: one tier down after 20 s, then 80 s, 320 s …; if that tier is faster the cap lifts.
   Never stuck at the bottom: over budget on the lowest tier with no such evidence (it settled there, then the phone
   got capped or hotter), one tier up is re-tried on the same back-off; if it is no slower, it is a plateau (above).
   Samples are ignored for the first 2 s, while hidden, off-screen, frozen, right after a tier change (0.5 s grace) and above 250 ms
   (a stalled or throttled tab is not a GPU signal).
   ?q=<n> pins a tier; ?t=&freeze=1 frames stay on tier 0 (or ?q=). */
var QN = 31, qBuf = new Float32Array(QN), qTmp = new Float32Array(QN), qCnt = 0, qHead = 0, qOver = 0, qRoom = 0, qGrace = 2, qFail = [0, 0, 0, 0, 0, 0, 0], qMed = 0;   /* first 2 s ignored: page load (18 mattes are built on the main thread) is not a GPU signal */
var qCap = 0, qTop = -1, qAt = [0, 0, 0, 0, 0, 0, 0], qCalm = 0, qProbeT = 0, qProbeN = 0, qStuck = 0;   /* plateau budget (ms, 0 = none); the tier a
   descent started from (-1 once it has settled); the median each tier was left at; time within budget; cap re-test clock;
   time spent over budget on the lowest tier */
function qReset(){ qCnt = 0; qHead = 0; qOver = 0; qRoom = 0; qCalm = 0; qStuck = 0; qGrace = 0.5; }
function setQuality(i){
  i = clamp(i | 0, 0, QT.length - 1); if (i === QI && DPR === QT[i].dpr) return;
  QI = i; DPR = QT[i].dpr; if (gl) sizeGL(); qReset();
}
function median(buf, n, tmp){   /* insertion sort into a preallocated scratch: no allocation */
  for (var i = 0; i < n; i++){ var v = buf[i], j = i - 1; while (j >= 0 && tmp[j] > v){ tmp[j + 1] = tmp[j]; j--; } tmp[j + 1] = v; }
  return tmp[n >> 1];
}
function qSample(ms, dt){
  if (!gl || QPIN != null) return;
  if (qGrace > 0){ qGrace -= dt; return; }
  if (ms > 250 || ms <= 0) return;
  qBuf[qHead] = ms; qHead = (qHead + 1) % QN; if (qCnt < QN) qCnt++;
  if (qCnt < 15) return;
  var med = qMed = median(qBuf, qCnt, qTmp);
  if (qCap && med < 0.75 * qCap) qCap = 0;                       /* the cap lifted (Low Power Mode off): back to 60 Hz */
  var hi = Math.max(20, 1.2 * qCap), lo = Math.max(17.5, 1.05 * qCap);
  if (med > hi){
    qRoom = 0; qCalm = 0; qOver += dt;
    if (qOver < (med > 1.5 * hi ? 0.75 : 1.5)) return;
    qOver = 0;
    if (QI < QT.length - 1){
      if (qTop < 0) qTop = QI;                                       /* a descent starts here */
      qAt[QI] = med; qFail[QI]++; setQuality(QI + 1);
    } else {                                                          /* lowest tier, still over: was a better tier as fast? */
      var j = qTop < 0 ? QI : qTop; while (j < QI && qAt[j] > 1.1 * med) j++;
      if (j < QI){ qCap = med; for (var i = j; i < qFail.length; i++) qFail[i] = 0; qTop = -1; qProbeT = 0; qProbeN = 0; setQuality(j); }
      else if (QI > 0){                                               /* no evidence yet: look one tier up now and then (back-off) */
        qStuck += med > 1.5 * hi ? 0.75 : 1.5;
        if (qStuck >= 5 * Math.pow(4, Math.max(0, qFail[QI - 1] - 1))){ qStuck = 0; qTop = -1; setQuality(QI - 1); }
      }
    }
  } else {
    qOver = 0; qCalm += dt; if (qCalm >= 1.5) qTop = -1;             /* the descent has settled */
    if (qCap && QI < QT.length - 1){                                  /* re-test the cap one tier down (never counts as a failure) */
      qProbeT += dt; if (qProbeT >= 20 * Math.pow(4, qProbeN)){ qProbeT = 0; qProbeN++; setQuality(QI + 1); return; }
    }
    if (med <= lo && QI > 0){
      qRoom += dt;
      if (qRoom >= 5 * Math.pow(4, Math.max(0, qFail[QI - 1] - 1))){ qTop = -1; setQuality(QI - 1); }
    } else qRoom = 0;
  }
}


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


/* ============================================================
   World state. Rebuilt from scratch on every loop and seek, so
   ?t= / freeze / seek(t) replay exactly (fixed 1/120 s steps).
   ============================================================ */
var LOOP = 65.8, T = 0, W = null, evI = 0;
var HN = 96;   /* sphere history ring (0.8 s at 120 Hz): DOM children follow 60–170 ms behind */
var BEATS = [
  { t:0.00,  title:'O0 · First light' },
  { t:2.80,  title:'O1 · Hello' },
  { t:7.60,  title:'O2 · Choose your companion' },
  { t:17.20, title:'O3 · Hold to ask' },
  { t:26.60, title:'O4 · Hold to agree' },
  { t:31.60, title:'O5 · First read' },
  { t:46.60, title:'O6 · Save the thesis' },
  { t:52.60, title:'O7 · Sign in after value' },
  { t:57.40, title:'O8 · Isla grew a piece' },
  { t:62.20, title:'O9 · Home' }
];
var DET = 2 * Math.PI / 5;       /* one detent: faces and picker share the physics */
var A_ALPHA = 140 * Math.PI / 180, A_RED = 40 * Math.PI / 180, A_CIO = -Math.PI / 2;   /* GL angles (y up): upper-left, upper-right, bottom */

function world(){
  ALL.length = 0;
  var w = {
    cy:S(340, 'soft'), r:S(2, 'birth'), gulp:S(1, 'gulp'), sag:S(0, 'gulp'), hop:S(0, 'emit'),
    pend:null, birthMass:true,
    energy:U(0.6, 0.30), swirl:U(0, 0.9), lean:U(0, 0.66), glow:U(0, 0.40), irid:U(1, 0.60), birth:U(0, 0.9),
    tl:U(0, 0.8), ta:U(0, 0.8), tb:U(0, 0.8), tintAmt:U(0, 0.8), wash:U(0, 0.8), nb:U(0, 0.4),
    compAmt:U(0, 0.42), compDepth:U(1, 0.42), compSil:U(0, 0.7),
    scrim:U(0, 0.38), braid:U(0, 0.48), flood:U(0, 0.48), wFlow:U(0.18, 0.6), rimBoost:U(0, 0.33),
    nodeGlow:[U(0, 0.3), U(0, 0.3), U(0, 0.3)], nodeR:[S(0.95, 'emit'), S(0.95, 'emit'), S(0.95, 'emit')],
    filA:U(0, 0.3), pillW:S(96, 'pill'), theta:S(0, 'glide'), belt:S(0, 'glide'), track:S(1, 'glide'), reveal:S(0, 'glide'),
    floodAmt:1, vcol:C_CIO, nodeAng:[A_ALPHA, A_RED, A_CIO], nodeW:[0, 0, 0], nodeOn:[false, false, false], conv:null, sepR0:[0.55, 0.55, 0.72],
    twist:0, twistOsc:0, flow:0, drift:0, rot:0, iridPh:0, flowA:0, flowR:0, cioRot:0, bph:0, period:4.8,
    tp:[], tpv:new Float64Array(TV.none),
    hT:new Float64Array(HN), hC:new Float64Array(HN), hR:new Float64Array(HN), hN:0, hI:0,
    filR:0.8, filAng:0, filCollapse:null, voice:0, env:0, env250:0,
    haps:[], expo:[], shock:null, rip:null, emitEv:null, spark:null, lastRel:null,
    tm:{}, pick:0, pickRoll:[], tintTo:null, tintFrom:null, peek:0,
    dragging:null, pullDy:0, pulling:false, satHome:[0, 0, 0],
    snow:null, pillMode:'none', pillLabel:'', pillLabelT:-9, pillLabelPrev:'',
    agreeP:0, agreeHeld:false, agreeT:0, agreeRel:null, agreeDone:null,
    hint:'', hintPrev:'', hintT:-9, chipsSet:'ask', vflag:false
  };
  crit(w.flood, 0.48);
  w.cy.m = 1; w.r.m = 1;
  for (var i = 0; i < TP_N; i++) w.tp.push(U(TV.none[i], 0.45));   /* temperament vector, sprung (T .45 s): blends, never steps */
  w.lean.T0 = 0.66;                                                 /* lean is a body spring (gaze T .66) */
  return w;
}
function tb(k, t){ W.tm[k] = [t == null ? T : t, 1e9]; }
function tg(k, t){ if (!W.tm[k]) W.tm[k] = [-1e9, 1e9]; W.tm[k][1] = t == null ? T : t; }
function tmB(k){ return W.tm[k] ? W.tm[k][0] : 1e9; }
function tmG(k){ return W.tm[k] ? W.tm[k][1] : 1e9; }
function hap(a){ W.haps.push({ t:T, a:a }); }
/* body impulses: the temperament changes the timing and ζ of a gulp, never its size. An impulse, not a velocity:
   ÷resp keeps the amplitude when the response is slower/faster, ÷mass lets a heavy body absorb a touch less. */
function bodyKick(s, dv){ kick(s, dv / (W.tpv[TP_RESP] * W.tpv[TP_MASS])); }
function gulpK(p){ bodyKick(W.gulp, p * 30); }
function expo(a, rise, dec){ if (!RM) W.expo.push({ t:T, a:a, r:rise || 0.06, d:dec || 0.52 }); }
function shock(r1, a, col, dur){ if (!RM) W.shock = { t:T, r1:r1, a:a, col:col, d:dur }; }
function ripple(a){ if (!RM) W.rip = { t:T, a:a }; }
function tintTo(labc, amt){ W.tintFrom = null; to(W.tl, labc[0]); to(W.ta, labc[1]); to(W.tb, labc[2]); if (amt != null) to(W.tintAmt, amt); }
function tintSnap(labc){ W.tl.x = W.tl.t = labc[0]; W.ta.x = W.ta.t = labc[1]; W.tb.x = W.tb.t = labc[2]; }
function setHint(s){ if (W.hint === s) return; W.hintPrev = W.hint; W.hint = s; W.hintT = T; }
function setPill(mode, label, width){
  if (mode && mode !== W.pillMode){ W.pillModePrev = W.pillMode; W.pillMode = mode; W.pillModeT = T; }
  if (label != null && label !== W.pillLabel){ W.pillLabelPrev = W.pillLabel; W.pillLabel = label; W.pillLabelT = T; }
  if (width) to(W.pillW, width, 'pill');
}
function moveSphere(cy, r, nm){
  nm = nm || 'soft';
  var dy = cy - W.cy.t;
  if (!RM && Math.abs(dy) > 80){
    to(W.cy, W.cy.x - 6 * (dy > 0 ? 1 : -1), 'gaze'); to(W.r, W.r.x * 0.98, 'gaze');
    W.pend = { t:T + 0.12, cy:cy, r:r, nm:nm };
  } else { W.pend = null; to(W.cy, cy, nm); to(W.r, r, nm); }
}
function companionTint(){ return ORDER[CHOSEN] ? ORDER[CHOSEN].tintLab : lab('#B8C2D3'); }

/* ---------- ghost finger (leads; the UI reads it in the same frame) ---------- */
var AL_Y = 489;    /* Allow button centre in the iOS alert mock (box 333–511) */
var GH = [
  [8.55,250,362,0,0],[8.80,240,330,0,1],[9.00,240,330,1,1],[9.30,150,330,1,1],[9.42,150,330,0,1],[9.70,170,362,0,0],
  [9.85,250,362,0,0],[10.02,240,330,0,1],[10.20,240,330,1,1],[10.50,150,330,1,1],[10.62,150,330,0,1],[10.90,170,362,0,0],
  [11.05,250,362,0,0],[11.22,240,330,0,1],[11.40,240,330,1,1],[11.70,150,330,1,1],[11.82,150,330,0,1],[12.10,170,362,0,0],
  [12.25,250,362,0,0],[12.42,240,330,0,1],[12.60,240,330,1,1],[12.90,150,330,1,1],[13.02,150,330,0,1],[13.30,170,362,0,0],
  [14.15,232,806,0,0],[14.42,195,770,0,1],[14.60,195,770,1,1],[14.70,195,770,0,1],[15.00,218,804,0,0],
  [18.55,232,808,0,0],[18.82,195,770,0,1],[19.00,195,770,1,1],[19.20,195,770,0,1],
  [19.95,195,770,0,1],[20.25,195,598,0,1],[20.40,195,598,1,1],[20.50,195,598,0,1],
  [21.55,262,AL_Y,0,1],[22.00,262,AL_Y,1,1],[22.10,262,AL_Y,0,1],
  [22.80,195,770,0,1],[23.20,195,770,1,1],[25.40,195,770,0,1],[25.75,218,806,0,0],
  [28.60,232,808,0,0],[28.85,195,770,0,1],[29.00,195,770,1,1],[29.50,195,770,0,1],[30.00,195,770,1,1],[31.20,195,770,0,1],[31.55,218,806,0,0],
  [46.35,205,624,0,0],[46.62,195,600,0,1],[46.80,195,600,1,1],[47.40,195,720,1,1],[47.52,195,724,0,1],
  [48.25,195,566,0,1],[48.60,195,566,1,1],[48.70,195,566,0,1],
  [49.50,262,AL_Y,0,1],[49.90,262,AL_Y,1,1],[50.00,262,AL_Y,0,1],[50.35,282,AL_Y + 36,0,0],
  [55.05,222,792,0,0],[55.32,195,756,0,1],[55.60,195,756,1,1],[55.70,195,756,0,1],[56.00,218,792,0,0],
  [60.90,250,372,0,0],[61.15,240,340,0,1],[61.30,240,340,1,1],[61.60,200,340,1,1],[61.72,200,340,0,1],[62.00,190,372,0,0]
];
var GHO = { x:195, y:900, p:0, v:0 };   /* reused: the ghost is read every sim step and every frame (no allocation) */
function ghostAt(t){
  var g = GHO; g.x = 195; g.y = 900; g.p = 0; g.v = 0;
  if (t < GH[0][0] || t > GH[GH.length - 1][0]) return g;
  for (var i = 0; i < GH.length - 1; i++){
    var a = GH[i], b = GH[i + 1];
    if (t >= a[0] && t < b[0]){
      var u = (t - a[0]) / (b[0] - a[0]);
      var k = (a[3] && b[3]) ? u : FOC(u);          /* a held drag is linear: 1:1 with the finger */
      g.x = lerp(a[1], b[1], k); g.y = lerp(a[2], b[2], k); g.p = a[3]; g.v = lerp(a[4], b[4], a[4] && b[4] ? 1 : u);
      if (!a[4] && !b[4]) g.v = 0;
      return g;
    }
  }
  return g;
}

/* ---------- caption pages (word table; visuals lead audio by 30 ms) ---------- */
var PAGES = {
  o1a:{ top:512, w:[['I’m',3.10],['Bobby.',3.32],['Before',3.80],['you',4.08],['buy',4.22],['anything,',4.40]], end:4.70 },
  o1b:{ top:512, w:[['three',4.85],['of',5.05],['me',5.15],['argue',5.40],['about',5.75],['it.',5.98],['Then',6.55],['you',6.75],['decide.',6.92]], end:7.20 },
  o2: { top:512, w:[['Mira',15.40],['it',15.60],['is.',15.72]], end:16.10 },
  o3: { top:512, w:[['Got',22.40],['it.',22.58],['Hold',22.92],['and',23.06],['ask.',23.18]], end:23.50 },
  o4: { top:468, w:[['Before',26.90],['I',27.10],['answer,',27.20],['one',27.50],['thing.',27.64]], end:27.90 },
  o5a:{ top:488, w:[['NVIDIA',36.60],['is',37.00],['strong,',37.15],['but',37.70],['it’s',37.88],['stretched',38.05],['into',38.50],['earnings.',38.70]], end:39.10 },
  o5b:{ top:592, w:[['Calm',39.40],['entry',39.66],['is',39.95],['168',40.10],['to',40.72],['172.',40.86],['It’s',41.70],['six',41.95],['dollars',42.20],['above.',42.50]], end:42.90 },
  o5c:{ top:592, w:[['So',43.00],['my',43.15],['call',43.30],['is',43.50],['wait.',43.80,'amber'],['Not',44.40],['a',44.58],['no.',44.72],['A',45.10],['*not*',45.24],['*yet.*',45.44]], end:45.80 },
  o8: { top:512, w:[['Your',58.20],['island',58.36],['got',58.64],['its',58.80],['first',58.94],['seed.',59.16]], end:59.50 }
};
var TXW = [['Should',23.50],['I',23.76],['buy',23.92],['NVIDIA',24.40],['right',24.78],['now?',25.00]];
var QTEXT = 'Should I buy NVIDIA right now?';
function capShow(id){ W.cap = { id:id, born:PAGES[id].w[0][1] - 0.22, gone:1e9 }; }
function capGone(t){ if (W.cap) W.cap.gone = t == null ? T : t; }

/* speaking envelope: syllables shaped around the word table, so voice, brightness and karaoke agree */
function speakAt(t){
  var p = W.cap && PAGES[W.cap.id]; if (!p || t < p.w[0][1] - 0.03 || t > p.end) return 0;
  var i = 0; while (i < p.w.length - 1 && p.w[i + 1][1] <= t) i++;
  var w0 = p.w[i][1], w1 = i < p.w.length - 1 ? p.w[i + 1][1] : p.end, dur = Math.max(0.12, Math.min(0.5, w1 - w0));
  var u = (t - w0) / dur; if (u < 0 || u > 1) return 0.08;
  var syl = Math.pow(Math.abs(Math.sin(u * Math.PI * Math.max(1, Math.round(p.w[i][0].length / 3)))), 0.7);
  return clamp((0.35 + 0.65 * syl) * (1 - 0.35 * u) * (w1 - w0 > 0.45 && u > 0.85 ? 0.3 : 1), 0, 1);
}
function voiceAt(t){
  if (t < 23.40 || t > 25.30) return 0.04;
  var i = 0; while (i < TXW.length - 1 && TXW[i + 1][1] <= t) i++;
  var w0 = TXW[i][1] - 0.1, w1 = i < TXW.length - 1 ? TXW[i + 1][1] - 0.1 : 25.2, u = (t - w0) / Math.max(0.12, w1 - w0);
  if (u < 0 || u > 1) return 0.08;
  var s = Math.abs(Math.sin(u * Math.PI * (1 + (i % 2)))) * (0.75 + 0.25 * Math.sin(t * 23.0 + i));
  return clamp(0.2 + 0.8 * s * (u < 0.85 ? 1 : (1 - u) / 0.15), 0, 1);
}


/* ============================================================
   Script: a scripted event track (touch, word, stance, verdict,
   save, swipe) driving one interruptible state machine.
   ============================================================ */
PAGES.o1a.slot = 0; PAGES.o1b.slot = 1; PAGES.o2.slot = 0; PAGES.o3.slot = 1; PAGES.o4.slot = 0;
PAGES.o5a.slot = 1; PAGES.o5b.slot = 0; PAGES.o5c.slot = 1; PAGES.o8.slot = 0;
capShow = function(id){ var s = PAGES[id].slot; W.caps[s] = { id:id, born:T, gone:1e9 }; W.capLast = s; };
capGone = function(t){ var c = W.caps[W.capLast]; if (c) c.gone = t == null ? T : t; };
speakAt = (function(inner){ return function(t){ var c = W.caps[W.capLast]; if (!c || c.gone < t - 0.05) return 0; W.cap = c; return inner(t); }; })(speakAt);

function press(k){ W.pr[k] = [T, 1e9]; hap(0.6); }
function release(k){ if (W.pr[k]) W.pr[k][1] = T; }
function tap(k){ W.pr[k] = [T, T + 0.1]; hap(0.6); }
function later(dt, fn){ W.later.push({ t:T + dt, fn:fn }); }
function nodeIn(i){ W.nodeOn[i] = true; W.nodeAng[i] = [A_ALPHA, A_RED, A_CIO][i]; W.nodeR[i].x = 0.95; to(W.nodeR[i], W.sepR0[i], 'emit'); to(W.nodeGlow[i], 1); }
function nodesOff(){ for (var i = 0; i < 3; i++){ to(W.nodeGlow[i], 0); } }
function converge(d){ W.conv = { t0:T, d:d, r0:[W.nodeR[0].x, W.nodeR[1].x, W.nodeR[2].x] }; }
function dragStart(kind){ var g = ghostAt(T); W.dragging = { kind:kind, t0:T, th0:W.theta.x, gx0:g.x, lx:g.x, lt:T }; }
function dragEnd(){
  var d = W.dragging; W.dragging = null; if (!d) return;
  var g = ghostAt(T), dx = g.x - d.gx0, v = W.theta.v * 0.9 * W.r.x;
  var commit = Math.abs(dx) > 40 || Math.abs(v) > 300;
  var target = commit ? d.th0 + (dx < 0 ? DET : -DET) : d.th0;
  if (d.kind === 'hint') target = d.th0;                           /* the teaching swipe stays below threshold */
  to(W.theta, target, 'glide');
  if (d.kind === 'pick' && commit){
    var k = Math.round(target / DET); W.pick = k; W.pickRoll.push({ i:k, t:T, dir:dx < 0 ? 1 : -1 });
    to(W.belt, k, 'glide'); setPill(null, 'Choose ' + ORDER[k].label, null);
    later(0.32, function(){ gulpK(0.02); hap(0.35); });
  } else if (d.kind === 'hint') later(0.28, function(){ hap(0.35); });
}

var EV = [
  /* O0 first light */
  [0.40, function(){ hap(0.45); }],
  [0.70, function(){ hap(0.28); }],
  [1.00, function(){ to(W.r, 120, 'birth'); to(W.birth, 1); W.energy.x = 0.6; to(W.energy, 0.35); if (RM){ W.r.x = W.r.t = 120; W.birth.x = W.birth.t = 1; W.glow.x = W.glow.t = 1; } }],
  [1.18, function(){ to(W.glow, 1); }],
  [2.00, function(){ tb('wmBig'); }],
  [2.20, function(){ W.birthMass = false; }],
  /* O1 hello */
  [2.80, function(){ tb('wmFly'); }],
  [2.90, function(){ capShow('o1a'); }],
  [4.70, function(){ capGone(); }],
  [4.80, function(){ capShow('o1b'); }],
  [4.95, function(){ crit(W.swirl, 0.4); to(W.swirl, 0.8); to(W.irid, 0.55); }],
  [5.00, function(){ tb('trA'); nodeIn(0); }],
  [5.20, function(){ tb('trR'); nodeIn(1); }],
  [5.40, function(){ tb('trC'); nodeIn(2); W.duel = { t0:T, t1:6.55 }; }],
  [6.40, function(){ tg('trA'); tg('trR', T + 0.06); tg('trC', T + 0.12); }],
  [6.55, function(){ converge(0.7); to(W.energy, 0.6); }],
  [7.05, function(){ expo(0.15); shock(0.8, 0.3, C_IVORY, 0.16); W.vcol = C_IVORY; W.floodAmt = 0.5; crit(W.flood, 0.48); to(W.flood, 1.1); hap(0.8); nodesOff(); }],
  [7.20, function(){ capGone(); }],
  [7.25, function(){ crit(W.swirl, 0.8); to(W.swirl, 0); crit(W.flood, 0.7); to(W.flood, 0); to(W.irid, 1); to(W.energy, 0.35); }],
  /* O2 choose your companion */
  [7.60, function(){ moveSphere(330, 124); W.picker = true; W.theta.x = W.theta.t = 0; W.pick = 0; W.compSil.x = W.compSil.t = 0; W.compDepth.x = 1; to(W.compDepth, 0); to(W.compAmt, 1);
    tintTo(ORDER[0].tintLab, 0.35); W.snowOn = true; W.snowT = T; initSnow(); }],
  [7.70, function(){ tb('prompt'); }],
  [7.80, function(){ tb('belt'); }],
  [8.00, function(){ tb('pname'); W.pickRoll = [{ i:0, t:T, dir:0 }]; setPill('label', 'Choose ' + ORDER[0].label, 180); tb('pillIn'); setHint('Swipe the sphere · Tap to choose'); }],
  [9.00, function(){ dragStart('pick'); }], [9.30, dragEnd],
  [10.20, function(){ dragStart('pick'); }], [10.50, dragEnd],
  [11.40, function(){ dragStart('pick'); }], [11.70, dragEnd],
  [12.60, function(){ dragStart('pick'); }], [12.90, dragEnd],
  [14.60, function(){ press('pill'); }],
  [14.70, function(){ release('pill'); gulpK(0.04); bodyKick(W.hop, -245); hap(1); W.burst = T; setPill('check', null, null); W.chosen = true; }],
  [14.90, function(){ tb('beadsOut'); tb('avaFly'); setHint(''); }],
  [15.20, function(){ to(W.compSil, 1); to(W.compAmt, 0.3); tintTo(companionTint(), 0.35); W.snowOff = T; }],
  [15.02, function(){ tg('pname'); }],             /* the name is inhaled before "Mira it is." takes its slot (no overlap at 490–543) */
  [15.30, function(){ to(W.pillW, 96, 'pill'); }],
  [15.35, function(){ capShow('o2'); }],
  [15.90, function(){ to(W.compAmt, 0); }],
  [16.40, function(){ tg('prompt'); capGone(); }],
  [16.60, function(){ moveSphere(340, 120); W.picker = false; W.thBase = W.theta.t; }],
  /* O3 hold to ask + mic */
  [17.20, function(){ W.title = ['Ask before you trade.', 'Hold the button and talk, or tap a question.']; tb('title'); }],
  [17.40, function(){ setPill('mic', '', 96); }],
  [17.60, function(){ W.chipsSet = 'ask'; tb('chips'); }],
  [19.00, function(){ press('pill'); tg('title'); tg('chips'); to(W.lean, 1); }],
  [19.20, function(){ release('pill'); tb('perm'); }],   /* the card blooms on the finger lift, once the title and sub are ~60% inhaled */
  [20.40, function(){ tap('perm'); }],
  [20.50, function(){ tg('perm'); }],
  [20.90, function(){ W.alert = 'mic'; tb('alert'); }],
  [22.00, function(){ tap('allow'); }],
  [22.10, function(){ tg('alert'); to(W.lean, 0.4); }],
  [22.20, function(){ capShow('o3'); }],
  [23.20, function(){ press('pill'); setPill('listen', '', 236); tb('listen'); moveSphere(340, 132); to(W.lean, 1); setHint('Release to send'); }],
  [23.28, function(){ capGone(); }],
  [25.40, function(){ release('pill'); setPill('mic', '', 96); tg('listen'); setHint(''); to(W.lean, 0); tb('gather'); }],
  [26.20, function(){ W.emitEv = { t:T, ang:-Math.PI / 2, ext:-0.05, d:0.09 }; later(0.09, function(){ gulpK(0.03); ripple(0.02); }); hap(0.5); crit(W.tintAmt, 0.3); to(W.tintAmt, 0); to(W.wash, 0); }],
  [26.25, function(){ tb('dock'); }],
  /* O4 risk notice: hold to agree */
  [26.70, function(){ moveSphere(318, 104); }],
  [26.72, function(){ capShow('o4'); }],
  [26.80, function(){ tb('agreeRing'); }],
  [27.86, function(){ capGone(); }],
  [28.00, function(){ tb('lines'); }],
  [28.30, function(){ tb('notice'); setPill('agree', 'Hold to agree', 196); }],
  [29.00, function(){ press('pill'); W.agree = { t0:T }; }],
  [29.50, function(){ release('pill'); W.agree = { rel:T, p:agreeRaw(T, 29.00) }; }],
  [30.00, function(){ press('pill'); W.agree = { t0:T }; }],
  [31.20, function(){ release('pill'); W.agree = { done:T }; hap(1); kick(W.rimBoost, 0); W.rimBoost.x = 0.15; to(W.rimBoost, 0); crit(W.rimBoost, 0.33);
    tg('lines'); tg('notice'); setPill('think', '', 96); }],
  /* O5 first read */
  [31.60, function(){ tb('burst'); }],
  [31.70, function(){ W.conv = null; W.nodeOn = [false, false, false]; moveSphere(380, 124); crit(W.swirl, 0.9); to(W.swirl, 1); to(W.irid, 0.35); to(W.energy, 0.45); W.duel = { t0:T, t1:34.60 }; }],
  [31.90, function(){ tb('agA'); nodeIn(0); }],
  [32.35, function(){ tb('agR'); nodeIn(1); to(W.energy, 0.52); }],
  [32.80, function(){ tb('agC'); nodeIn(2); to(W.energy, 0.6); }],
  [34.60, function(){ tb('cioRoll'); converge(1.0); to(W.energy, 0.9); }],
  [34.90, function(){ tg('tethers'); }],
  [35.00, function(){ tg('agA'); tg('agR', T + 0.06); tg('agC', T + 0.12); }],
  [35.60, function(){ shock(1.05, 0.35, C_PEARL, 0.18); expo(0.35); hap(0.8); crit(W.braid, 0.48); to(W.braid, 1.1); to(W.wFlow, 0.04); to(W.energy, 0.45); nodesOff(); }],
  [35.78, function(){ to(W.swirl, 0.1); to(W.wFlow, 0.3); }],
  [36.10, function(){ W.filR = 0.8; to(W.filA, 0.7); }],
  [36.20, function(){ moveSphere(330, 96); W.talking = true; setPill('stop', '', 96); }],
  [36.40, function(){ capShow('o5a'); }],
  [36.45, function(){ W.compSil.x = W.compSil.t = 1; W.compDepth.x = 1; to(W.compDepth, 0); W.compShow = true; tb('sats'); }],
  [39.08, function(){ moveSphere(210, 64); capGone(); }],
  [39.20, function(){ capShow('o5b'); }],
  [39.66, function(){ W.preInhale = T; }],
  [39.80, function(){ tb('comet'); W.emitEv = { t:T, ang:-Math.PI / 2, ext:0.117, d:0.42, out:true }; expo(0.10); }],
  [42.92, function(){ capGone(); }],
  [42.95, function(){ tg('sats'); capShow('o5c'); later(0.38, function(){ gulpK(0.01); }); later(0.42, function(){ gulpK(0.01); }); later(0.46, function(){ gulpK(0.01); }); }],
  [43.05, function(){ W.compShow = false; to(W.compDepth, 1); to(W.compAmt, 0); }],
  [43.10, function(){ moveSphere(210, 72); }],
  [43.20, function(){ W.filCollapse = T; }],
  [43.74, function(){ shock(1.05, 0.30, C_CIO, 0.16); expo(0.22); hap(0.5); W.vcol = C_CIO; W.floodAmt = 1; crit(W.flood, 0.48); to(W.flood, 1.1); to(W.braid, 0); to(W.scrim, 1); to(W.filA, 0); W.vflag = true; }],
  [43.77, function(){ tb('verdict'); }],
  [44.02, function(){ tb('ring'); }],
  [45.12, function(){ hap(0.5); }],
  [45.20, function(){ setHint('Conviction = how sure Bobby is in this read'); }],
  [45.80, function(){ W.talking = false; setPill('mic', '', 96); }],
  [45.90, function(){ tb('meta'); }],
  [46.00, function(){ bodyKick(W.sag, 150); }],
  [46.40, function(){ setHint('Pull down for the plan'); }],
  [46.55, function(){ bodyKick(W.sag, 150); }],
  /* O6 save the thesis */
  [46.80, function(){ W.pulling = true; setHint(''); to(W.energy, 0.18); to(W.wFlow, 0.04); }],
  [47.10, function(){ tb('commit'); hap(0.6); capGone(); tg('meta'); }],
  [47.40, function(){ W.pulling = false; to(W.pull, 0, 'gulp'); kick(W.pull, -0.02); moveSphere(158, 44); to(W.reveal, 1, 'glide'); W.reveal.v = Math.max(W.reveal.v, 2.2); tb('present'); }],
  [48.60, function(){ tap('watch'); }],
  [48.70, function(){ tb('saved'); hap(1); }],
  [49.10, function(){ W.alert = 'notif'; tb('alert'); }],
  [49.90, function(){ tap('allow'); }],
  [50.20, function(){ tg('alert'); }],
  [50.40, function(){ tb('tpill'); }],
  [50.92, function(){ gulpK(0.04); hap(0.5); }],
  [51.10, function(){ tg('cards'); tg('verdict'); tg('ring'); tg('present'); tg('dock'); }],
  [51.38, function(){ moveSphere(340, 120); }],
  [51.50, function(){ crit(W.flood, 0.7); to(W.flood, 0); to(W.scrim, 0); crit(W.tintAmt, 0.8); tintTo(companionTint(), 0.35); to(W.energy, 0.35); to(W.wFlow, 0.18); to(W.swirl, 0); to(W.irid, 1); to(W.braid, 0); W.vflag = false; }],
  [52.10, function(){ tb('gsat'); }],
  /* O7 sign in after value */
  [52.80, function(){ tb('sheet'); }],
  [55.60, function(){ tap('notnow'); }],
  [55.70, function(){ tg('sheet'); }],
  [56.20, function(){ gulpK(0.02); }],
  [56.30, function(){ tb('savedTag'); }],
  [58.30, function(){ tg('savedTag'); }],
  /* O8 Isla grew a piece */
  [57.60, function(){ to(W.theta, W.thBase + 0.7, 'glide'); W.peekOn = true; }],
  [57.98, function(){ capShow('o8'); }],
  [58.10, function(){ tb('seed'); hap(0.6); }],
  [58.20, function(){ tb('cap2'); }],
  [59.80, function(){ to(W.theta, W.thBase, 'emit'); capGone(); tg('cap2'); }],
  [60.30, function(){ tb('mer'); }],
  [60.80, function(){ W.peekOn = false; }],
  [61.30, function(){ W.peekOn = true; dragStart('hint'); }],
  [61.60, dragEnd],
  [62.10, function(){ W.peekOn = false; }],
  /* O9 home */
  [62.20, function(){ W.title = ['Good evening.', 'I’m watching NVDA for you.']; tb('title'); }],
  [62.60, function(){ W.chipsSet = 'home'; tb('chips'); }],
  [63.00, function(){ setHint('Hold to ask · Swipe the sphere'); }],
  [65.40, function(){ tb('dim'); }]
];
EV.sort(function(a, b){ return a[0] - b[0]; });

function agreeRaw(t, t0){ var u = (t - t0) / 1.2; if (u >= 1) return 1; var k = 1 - 0.15 / 1.2; return u < k ? u : k + (1 - k) * EXH((u - k) / (1 - k)); }
function agreeP(t){
  var a = W.agree; if (!a) return 0;
  if (a.done != null) return 1;
  if (a.rel != null) return a.p * (1 - FAD(c01((t - a.rel) / 0.3)));
  return agreeRaw(t, a.t0);
}

/* ---------- snow (60 flakes, clipped to the glass; reacts to the swipe velocity) ---------- */
function initSnow(){
  var rnd = prng(7), f = [];
  for (var i = 0; i < 60; i++){ var a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 0.88; f.push({ x:Math.cos(a) * rr, y:Math.sin(a) * rr, vx:0, vy:0, s:1 + rnd() * 1.5, o:0.25 + rnd() * 0.5, ph:rnd() * 6.28 }); }
  W.snow = f;
}
function stepSnow(h){
  var f = W.snow; if (!f) return;
  var om = W.theta.v, burst = W.burst && T - W.burst < 0.05;
  for (var i = 0; i < f.length; i++){
    var p = f[i];
    p.vx += (-om * p.y * 0.8) * h * 3.0; p.vy += (om * p.x * 0.8) * h * 3.0;
    if (burst){ p.vy -= 0.9 + (i % 7) * 0.08; p.vx += ((i % 5) - 2) * 0.12; }
    p.vy += 0.035 * h * W.tpv[TP_MASS]; p.vx += Math.sin(T * 0.7 + p.ph) * 0.01 * h * W.tpv[TP_DRIFT];   /* the snow previews the temperament too */
    var dg = Math.exp(-2.2 * h); p.vx *= dg; p.vy *= dg;
    p.x += p.vx * h; p.y += p.vy * h;
    var d = Math.sqrt(p.x * p.x + p.y * p.y);
    if (d > 0.9){ var nx = p.x / d, ny = p.y / d, vn = p.vx * nx + p.vy * ny; if (vn > 0){ p.vx -= 1.6 * vn * nx; p.vy -= 1.6 * vn * ny; } p.x = nx * 0.9; p.y = ny * 0.9; }
  }
}

/* ---------- one fixed simulation step ---------- */
function fire(){ while (evI < EV.length && EV[evI][0] <= T){ EV[evI][1](); evI++; }
  if (W.later.length){ var L = W.later, n = 0; for (var i = 0; i < L.length; i++){ if (L[i].t <= T) L[i].fn(); else L[n++] = L[i]; } L.length = n; } }
function sim(h){
  T += h;
  fire();
  var rmK = RM ? 0.25 : 1, g = ghostAt(T), i;
  if (W.pend && T >= W.pend.t){ to(W.cy, W.pend.cy, W.pend.nm); to(W.r, W.pend.r, W.pend.nm); W.pend = null; }

  /* gestures: tracked values follow the finger with zero latency */
  if (W.dragging){
    var d = W.dragging, R = Math.max(40, W.r.x), nx = d.th0 + (d.gx0 - g.x) / (0.9 * R);
    W.theta.v = (nx - W.theta.x) / h; W.theta.x = nx; W.theta.t = nx;
  }
  if (W.pulling){
    var dy = Math.max(0, g.y - 600), rub = (1 - 1 / (dy * 0.55 / 260 + 1)) * 260;
    var pv = Math.min(0.14, rub * 0.0009); W.pull.v = (pv - W.pull.x) / h; W.pull.x = pv; W.pull.t = pv;
    var rv = c01(rub / 72) * 0.3; W.reveal.v = (rv - W.reveal.x) / h; W.reveal.x = rv; W.reveal.t = rv; W.rub = rub;
  }

  /* the picker drag fraction: the tint AND the temperament preview both follow it 1:1, blended between neighbours */
  var inPick = W.picker && !W.chosen, kf = 0, k0 = 0, k1 = 0;
  if (inPick){ kf = clamp(W.theta.x / DET, 0, NPICK - 1); k0 = Math.floor(kf); k1 = Math.min(NPICK - 1, k0 + 1); }

  /* tint: scrubbed 1:1 with the rotation in the picker and on the Isla peek (OKLab) */
  if (inPick){ tintSnap(mixLabTo(TMP_LAB, ORDER[k0].tintLab, ORDER[k1].tintLab, kf - k0)); }
  else if (W.peekOn || Math.abs(W.theta.x - W.thBase) > 0.002 && T > 57){
    var fr = clamp((W.theta.x - W.thBase) / DET, 0, 1); tintSnap(mixLabTo(TMP_LAB, companionTint(), ISLA_LAB, fr));
    to(W.nb, 0.25 + 0.75 * fr); to(W.wash, 0.12 * fr);
  } else if (T > 57){ to(W.nb, 0); to(W.wash, 0); }

  /* temperament (§2.1): the focused companion while picking (its neighbour blended in by the drag), the chosen one
     after the choice, neutral before anyone lives in the glass. The vector is sprung (T .45 s), so the breath period
     glides and the single breath phase never jumps. It reaches the sphere body, the breath, drift and idle flow only. */
  var ta = TV.none, tb2 = TV.none, tw = 0, tpv = W.tpv;
  if (inPick){ ta = TV[ORDER[k0].palette]; tb2 = TV[ORDER[k1].palette]; tw = kf - k0; }
  else if (W.chosen && ORDER[CHOSEN]){ ta = tb2 = TV[ORDER[CHOSEN].palette]; }
  for (i = 0; i < TP_N; i++){ W.tp[i].t = lerp(ta[i], tb2[i], tw); tpv[i] = W.tp[i].x; }
  var m = W.birthMass ? 1 : Math.max(0.36, W.r.x / 122);
  temperBody(W.cy, m, tpv); temperBody(W.r, m, tpv);
  temperBody(W.gulp, 1, tpv); temperBody(W.sag, 1, tpv); temperBody(W.hop, 1, tpv); temperBody(W.lean, 1, tpv);
  W.period = tpv[TP_BREATH];

  /* voice (user) and speech (Bobby) envelopes */
  var vt = tmB('listen') <= T && tmG('listen') > T ? voiceAt(T) : 0;
  W.voice += (vt - W.voice) * (1 - Math.exp(-h / (vt > W.voice ? 0.035 : 0.16)));
  var et = speakAt(T);
  W.env += (et - W.env) * (1 - Math.exp(-h / (et > W.env ? 0.035 : 0.16)));
  W.env250 += (W.env - W.env250) * (1 - Math.exp(-h / 0.25));
  if (tmB('listen') <= T && tmG('listen') > T) W.energy.t = 0.5 + 0.4 * W.voice;
  else if (W.talking) W.energy.t = 0.38 + 0.45 * W.env;
  if (W.compShow) W.compAmt.t = 0.35 + 0.4 * W.env250;

  /* the debate: nodes orbit, converge, and throw sparks at each crossing */
  var df = W.duel ? c01((T - W.duel.t0) / Math.max(0.5, W.duel.t1 - W.duel.t0)) : 0;
  var w0 = [lerp(1.6, 2.6, df), -lerp(1.6, 2.6, df), 0.6];
  for (i = 0; i < 3; i++){
    if (!W.nodeOn[i]) continue;
    var wi = w0[i];
    if (W.conv){
      var u = c01((T - W.conv.t0) / W.conv.d), r0 = W.conv.r0[i], rn = r0 * (1 - INH(u));
      W.nodeR[i].x = W.nodeR[i].t = rn; W.nodeR[i].v = 0;
      wi = Math.sign(wi) * Math.min(9, Math.abs(wi) * Math.pow(r0 / Math.max(rn, 1e-3), 0.8));
    }
    W.nodeW[i] = wi; W.nodeAng[i] += wi * h * rmK;
  }
  W.sep = W.conv ? c01(W.nodeR[0].x / Math.max(0.01, W.conv.r0[0])) : (W.swirl.x > 0.01 ? 1 : 1);
  if (W.nodeOn[0] && W.nodeOn[1] && !W.conv){
    var rel = wrapPi(W.nodeAng[0] - W.nodeAng[1]);
    if (W.lastRel != null && Math.abs(rel) < 1 && (rel > 0) !== (W.lastRel > 0)){ expo(0.12, 0.02, 0.09); if (!RM) W.spark = { t:T, ang:W.nodeAng[0] }; }
    W.lastRel = rel;
  } else W.lastRel = null;

  /* integrated phases (never time × state in the shader) */
  W.twist += h * 0.5 * W.swirl.x * rmK;
  W.twistOsc += h * 0.8 * rmK;
  W.flow += h * W.wFlow.x * rmK;
  W.flowA += h * 0.9 * W.wFlow.x * rmK; W.flowR += h * 2.2 * W.wFlow.x * rmK; W.cioRot += h * 0.2 * rmK;
  W.drift += h * 0.11 * tpv[TP_DRIFT] * rmK;
  W.rot += h * 0.05 * tpv[TP_FLOW] * rmK;
  W.iridPh += h * 0.012 * tpv[TP_FLOW] * rmK;
  W.filAng += h * 0.5 * rmK;
  W.bph += h / tpv[TP_BREATH];               /* ONE breath clock: the period changes, the phase is only ever integrated */
  W.ripPh = (W.ripPh || 0) + h * 10;
  if (W.twistOsc > 6.2832) W.twistOsc -= 6.2832;
  if (W.bph > 1000) W.bph -= 1000;

  if (W.snowOn) stepSnow(h);
  stepSprings(h / 2); stepSprings(h / 2);   /* 1/240 s substeps */

  /* sphere history: DOM children follow the sphere 60–120 ms later (a fixed ring: no per-step allocation) */
  W.hT[W.hI] = T; W.hC[W.hI] = W.cy.x; W.hR[W.hI] = W.r.x; W.hI = (W.hI + 1) % HN; if (W.hN < HN) W.hN++;
}
var DLY = { cy:0, r:0 };   /* reused result */
function delayed(ms){
  var t = T - ms / 1000, n = W.hN, j = 0;
  if (!n){ DLY.cy = W.cy.x; DLY.r = W.r.x; return DLY; }
  for (var k = 1; k <= n; k++){ j = (W.hI - k + HN) % HN; if (W.hT[j] <= t){ DLY.cy = W.hC[j]; DLY.r = W.hR[j]; return DLY; } }
  DLY.cy = W.hC[j]; DLY.r = W.hR[j]; return DLY;     /* older than the ring: the oldest sample */
}
function resetAll(){ W = world(); W.thBase = 0; W.pull = S(0, 'gulp'); W.caps = [null, null]; W.capLast = 0; W.later = []; W.pr = {}; T = 0; evI = 0; }


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


/* ============================================================
   Loop + harness contract
   ============================================================ */
function renderAll(){
  renderSphere(); renderSnow(); renderSats(); renderRing(); renderVerdict(); renderChart();
  renderBelt(); renderIsla(); renderMeridian(); renderQuestion(); renderAgents();
  renderCaptions(); renderTexts(); renderPicker(); renderLines(); renderHint();
  renderPill(); renderChips(); renderPerm(); renderAlert(); renderCards(); renderSheet(); renderGsat();
  renderGhost(); renderDim();
}
var paused = false, frozen = Q.freeze === '1', last = 0, beatIdx = -1, live = $('live');
function beatAt(t){ var b = 0; for (var i = 0; i < BEATS.length; i++) if (t >= BEATS[i].t - 1e-6) b = i; return b; }
function checkBeat(){
  var b = beatAt(T); if (b === beatIdx) return; beatIdx = b;
  try { parent.postMessage({ type:'bobby-step', index:b, total:BEATS.length, title:BEATS[b].title }, '*'); } catch(e){}
  txt(live, BEATS[b].title.replace(/^O\d+ · /, ''));
}
/* physics runs in fixed 1/120 s steps (two 1/240 s spring substeps each), so live play, ?t= and seek() agree */
var STEP = 1 / 120;
function simHalf(h){ sim(h); }
function advance(dt){
  var acc = dt;
  while (acc > 1e-9){
    var h = Math.min(STEP, acc); simHalf(h); acc -= h;
    if (T >= LOOP){ resetAll(); beatIdx = -1; }
  }
  checkBeat();
}
function seek(t){
  t = clamp(+t || 0, 0, LOOP - 0.001);
  resetAll(); beatIdx = -1;
  while (T + STEP <= t + 1e-9) simHalf(STEP);
  if (t - T > 1e-6) simHalf(t - T);
  checkBeat(); renderAll();
}
/* visibility: nothing is drawn while the page is hidden or the stage is scrolled out of view (when embedded);
   the clock keeps running at 0.15× (§3.5: it slows, never freezes) */
var onScreen = true;
try { new IntersectionObserver(function(es){ var v = es[es.length - 1].isIntersecting; if (v !== onScreen){ onScreen = v; last = performance.now(); qReset(); } }, { threshold:0 }).observe(gl ? cv : stage); } catch(e){}
function visible(){ return !document.hidden && onScreen; }

/* ?fps=1: a tiny meter (top-right, inside the reserved 54 px band: debug only) — fps over the last 1 s,
   frame interval p50/p95, JS work per frame, and the quality tier */
var FPS = Q.fps === '1', fpsEl = null, fT = new Float64Array(240), fD = new Float32Array(240), fW = new Float32Array(240), fS = new Float32Array(240), fI = 0, fN = 0, fLast = 0;
if (FPS){ fpsEl = document.createElement('div'); fpsEl.id = 'fpsM'; fpsEl.setAttribute('aria-hidden', 'true'); stage.appendChild(fpsEl); txt(fpsEl, '– fps\nQ' + QI); }
function fpsFrame(now, ms, work){
  fT[fI] = now; fD[fI] = ms; fW[fI] = work; fI = (fI + 1) % 240; if (fN < 240) fN++;
  if (now - fLast < 250) return; fLast = now;
  var n = 0, ws = 0;
  for (var k = 1; k <= fN; k++){ var j = (fI - k + 240) % 240; if (now - fT[j] > 1000) break; fS[n++] = fD[j]; ws += fW[j]; }
  if (!n) return;
  for (var i = 1; i < n; i++){ var v = fS[i], q = i - 1; while (q >= 0 && fS[q] > v){ fS[q + 1] = fS[q]; q--; } fS[q + 1] = v; }
  var qt = QT[QI];
  txt(fpsEl, n + ' fps · ' + fS[n >> 1].toFixed(1) + '/' + fS[Math.min(n - 1, Math.floor(n * 0.95))].toFixed(1) + ' ms\nQ' + QI + (QPIN != null ? '*' : '') + ' ' + qt.dpr.toFixed(2) + 'x' + (qt.oct < 4 ? ' oct' + qt.oct : '') + (qt.disp ? '' : ' -disp') + (qCap ? ' cap ' + qCap.toFixed(0) : '') + ' · js ' + (ws / n).toFixed(2));
}
function frame(now){
  if (now - fitChk > 500){ fitChk = now; refit(); }
  var raw = Math.min(0.5, Math.max(0, (now - last) / 1000)); last = now;
  var vis = visible();
  if (!frozen) advance(raw * (paused || !vis ? 0.15 : 1));
  if (vis){
    var w0 = performance.now(); renderAll(); var work = performance.now() - w0;
    if (!frozen) qSample(raw * 1000, raw);
    if (FPS) fpsFrame(now, raw * 1000, work);
  }
  requestAnimationFrame(frame);
}
function togglePause(){ paused = !paused; st($('pauseTag'), null, paused ? 1 : 0); }
window.addEventListener('keydown', function(e){
  if (e.key === 'ArrowRight'){ var b = beatAt(T); seek(b + 1 < BEATS.length ? BEATS[b + 1].t + 0.001 : 0); e.preventDefault(); }
  else if (e.key === 'ArrowLeft'){ var c = beatAt(T); var tt = T - BEATS[c].t > 0.8 ? BEATS[c].t : BEATS[Math.max(0, c - 1)].t; seek(tt + 0.001); e.preventDefault(); }
  else if (e.key === ' ' || e.key === 'Spacebar'){ togglePause(); e.preventDefault(); }
});
/* tap (< 8 px) = pause at 0.15×. Pointer events on the whole iframe (letterbox included); touch-action:none on the page
   (CSS) keeps iOS from scrolling, pinch- or double-tap-zooming, so every tap arrives as a clean pointerdown/up. */
var down = null, downX = 0, downY = 0;
window.addEventListener('pointerdown', function(e){ if (!e.isPrimary) return; down = e.pointerId; downX = e.clientX; downY = e.clientY; }, { passive:true });
window.addEventListener('pointerup', function(e){ if (down !== e.pointerId) return; down = null; var dx = e.clientX - downX, dy = e.clientY - downY; if (dx * dx + dy * dy < 64) togglePause(); }, { passive:true });
window.addEventListener('pointercancel', function(){ down = null; }, { passive:true });
['gesturestart', 'gesturechange', 'dblclick'].forEach(function(k){ document.addEventListener(k, function(e){ e.preventDefault(); }, { passive:false }); });   /* Safari pinch + double-tap zoom */
document.addEventListener('touchmove', function(e){ if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive:false });
document.addEventListener('visibilitychange', function(){ last = performance.now(); qReset(); });
window.addEventListener('pageshow', function(){ last = performance.now(); qReset(); });   /* iOS back-forward cache: no 0.5 s jump on return */

/* companions: flood-fill mattes, uploaded as mipmapped textures (picker order first) */
ORDER.forEach(function(c){ buildMatte(c, function(cc){ uploadTex(cc); try { renderAll(); } catch(e){} }); });   /* redraw once a matte lands, so ?t=&freeze=1 frames never miss the companion */
try { document.fonts && document.fonts.ready.then(function(){ var wm = $('wm'); wm._w = 0; chipEls.forEach(function(c){ c._w = 0; }); if (txW) txW.forEach(function(w){ w._cx = null; w._l = null; }); gsat._w = 0; capEls.forEach(function(c){ c._h = 0; }); }); } catch(e){}

window.nucleo = { seek:seek, step:function(dt){ advance(dt); renderAll(); return T; }, pause:function(){ if (!paused) togglePause(); }, play:function(){ if (paused) togglePause(); }, time:function(){ return T; }, beats:BEATS, reducedMotion:RM, world:function(){ return W; }, gl:function(){ return gl && prog ? { gl:gl, prog:prog, loc:loc } : null; }, status:function(){ return ORDER.map(function(c){ return c.id + (c.ready ? '+' : '-') + (c.tex ? 'T' : ''); }).join(' '); },
  /* temperament (§2.1): the live, sprung vector and the table it blends from */
  temperament:function(){ var o = {}; for (var i = 0; i < TP_N; i++) o[TP_KEYS[i]] = +W.tpv[i].toFixed(4); return o; }, temperaments:TEMPER,
  /* adaptive quality: the tier list, the live tier and a manual override (pins until reload) */
  quality:function(i){ if (i != null){ QPIN = clamp(i | 0, 0, QT.length - 1); setQuality(QPIN); } return { tier:QI, pinned:QPIN != null, dpr:QT[QI].dpr, octaves:QT[QI].oct, dispersion:!!QT[QI].disp, median:+qMed.toFixed(2), cap:+qCap.toFixed(2), fails:qFail.slice(0, QT.length), tiers:QT }; } };
resetAll();
if (Q.t != null && Q.t !== '') seek(parseFloat(Q.t)); else { checkBeat(); renderAll(); }
requestAnimationFrame(function(n){ last = n; frame(n); });
})();
