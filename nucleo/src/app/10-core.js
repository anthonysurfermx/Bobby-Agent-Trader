(function(){
'use strict';
/* =====================================================================
   Núcleo daily engine (app.html). ARCHITECTURE.md §3.1–3.2.
   The approved v2 engine (shader, springs, render passes) driven by an
   event-driven state machine and REAL data from window.nucleoBridge.
   Nothing on screen is scripted: every value comes from a bridge reply.
   Parts: 10 core · 20 gl · 30 dom · 40 strings · 50 actors · 55 read
          60 fsm · 70 input · 80 render · 90 loop · 92 harness · 99 boot
   ===================================================================== */
var W = window, D = document;
function $(id){ return D.getElementById(id); }
var BR = W.nucleoBridge, RMOD = W.NucleoReadModel;

/* =====================================================================
   0. Parameters
   ===================================================================== */
var QS = {};
try { (location.search || '').replace(/^\?/, '').split('&').forEach(function(kv){ if (!kv) return; var i = kv.indexOf('='); var k = decodeURIComponent(i < 0 ? kv : kv.slice(0, i)); QS[k] = i < 0 ? '1' : decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' ')); }); } catch (e) {}
/* the dev mock exists only in dev builds in a browser; harness code does nothing without it (native, release) */
var MOCK = BR && BR.mock ? BR.mock : null;
var HARNESS = QS.harness === '1' && !!MOCK;
/* dev builds only (build.py inlines fixtures only without --release): the hidden long press to the classic desk.
   Release pages have no way out of the Núcleo, and native Release refuses openClassic too (App Review 2.3.1). */
var DEV_BUILD = !!W.NUCLEO_FIXTURES;
var FREEZE = HARNESS && QS.freeze === '1';
var RM = QS.rm === '1';
try { if (!RM && W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches) RM = true; } catch (e) {}
function logErr(where, e){ try { console.error('[nucleo]', where, e); } catch (x) {} }

/* =====================================================================
   1. Math, curves, colour
   ===================================================================== */
var PI = Math.PI, TAU = PI * 2, DEG = PI / 180;
function clamp(x, a, b){ return x < a ? a : (x > b ? b : x); }
function lerp(a, b, t){ return a + (b - a) * t; }
function sstep(a, b, x){ x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }
function wrapA(a){ a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; }
function bump(u){ return u <= 0 || u >= 1 ? 0 : Math.sin(PI * u); }
function fin(v){ return typeof v === 'number' && isFinite(v); }
function bezier(x1, y1, x2, y2){
  function bx(t){ return 3 * x1 * t * (1 - t) * (1 - t) + 3 * x2 * t * t * (1 - t) + t * t * t; }
  function by(t){ return 3 * y1 * t * (1 - t) * (1 - t) + 3 * y2 * t * t * (1 - t) + t * t * t; }
  var N = 256, lut = new Float32Array(N + 1);
  for (var i = 0; i <= N; i++){ var x = i / N, lo = 0, hi = 1; for (var k = 0; k < 26; k++){ var mid = (lo + hi) / 2; if (bx(mid) < x) lo = mid; else hi = mid; } lut[i] = by((lo + hi) / 2); }
  return function(x){ if (x <= 0) return 0; if (x >= 1) return 1; var f = x * N, j = f | 0; return lut[j] + (lut[j + 1] - lut[j]) * (f - j); };
}
/* the five named curves (no physics) */
var E = {
  exhale: bezier(.12, .8, .28, 1),
  inhale: bezier(.55, 0, .8, .4),
  focus:  bezier(.2, .65, .25, 1),
  data:   bezier(.3, 0, .1, 1),
  fade:   bezier(.4, 0, .2, 1),
  lin: function(x){ return clamp(x, 0, 1); }
};
/* seeded PRNG: the engine is deterministic on its sim clock */
function mulberry(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
var rnd = mulberry(20260926);

function hex(h){ h = String(h).replace('#', ''); return [parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255, parseInt(h.substr(4, 2), 16) / 255]; }
function css(c, a){ return 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + (a == null ? 1 : +a.toFixed(3)) + ')'; }
function mixC(a, b, t){ return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function s2l(c){ return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function l2s(c){ c = clamp(c, 0, 1); return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }
function cbrt(x){ return x < 0 ? -Math.pow(-x, 1 / 3) : Math.pow(x, 1 / 3); }
function toLab(rgb){
  var r = s2l(rgb[0]), g = s2l(rgb[1]), b = s2l(rgb[2]);
  var l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
function fromLab(L){
  var l = L[0] + 0.3963377774 * L[1] + 0.2158037573 * L[2], m = L[0] - 0.1055613458 * L[1] - 0.063854173 * L[2], s = L[0] - 0.0894841775 * L[1] - 1.2914855480 * L[2];
  l = l * l * l; m = m * m * m; s = s * s * s;
  return [l2s(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), l2s(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), l2s(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)];
}
/* tint mixes always go through OKLab: a pink→teal crossing never passes through grey */
function mixLab(a, b, t){ if (t <= 0) return a; if (t >= 1) return b; var A0 = toLab(a), B0 = toLab(b); return fromLab([lerp(A0[0], B0[0], t), lerp(A0[1], B0[1], t), lerp(A0[2], B0[2], t)]); }
function invTone(c){ return c.map(function(v){ return -Math.log(1 - Math.min(v, 0.97)) / 1.3; }); }

var C = {
  pearl: hex('#E8DFD0'), ink: hex('#F2EDE4'), inkb: hex('#FFF8EC'),
  ink2: hex('#A39C91'), isla: hex('#7BC8F0'),
  ambIdle: hex('#15121C'), bg: hex('#0B0A09'), cardBg: hex('#1C1A17'),
  coreNeutral: hex('#141218')
};
/* verdict palette (R6): Wait = amber on #2A1C08, Review = mint on #082A20. Nothing else takes these hues. */
var VC = {};
['wait', 'review'].forEach(function(k){
  var v = RMOD.VERDICT[k], c = hex(v.color);
  VC[k] = { c: c, css: v.color, core: invTone(hex(v.core)), amb: hex(v.amb), saveBg: mixC(C.cardBg, c, 0.16), flash: mixC(c, [1, 1, 1], 0.45) };
});
var COMP_IN_GLASS = false;   /* companions show as avatars, not figures inside the sphere */
/* companion glass tints by palette (identity only, never a semantic hue) */
var GLASS = { matrix: '#A8C79A', plasma: '#B99CF0', ice: '#A7BFE8', gold: '#E6D6A8', ghost: '#B8C2D3', lava: '#D9A48E' };

/* temperament by palette (DIRECTION §2.1): ambient behaviour only, at most ±20% */
var TEMPERS = {
  matrix: { name: 'precise', resp: 0.9, breath: 4.4 },
  plasma: { name: 'elastic', zGulp: 0.28, zEmit: 0.55 },
  ice:    { name: 'crisp', zeta: 0.95, drift: 0.7, breath: 5.2 },
  gold:   { name: 'heavy', mass: 1.25, breath: 5.6 },
  ghost:  { name: 'floaty', resp: 1.2, drift: 1.4, breath: 4.8 },
  lava:   { name: 'viscous', follow: 0.08, flow: 0.8 }
};
function temper(pal){
  var t = TEMPERS[pal] || TEMPERS.ghost;
  return { pal: TEMPERS[pal] ? pal : 'ghost', name: t.name, resp: t.resp || 1, breath: t.breath || 4.8, drift: t.drift || 1, flow: t.flow || 1,
           mass: t.mass || 1, follow: t.follow || 0, zGulp: t.zGulp || t.zeta || 0, zGaze: t.zeta || 0, zEmit: t.zEmit || t.zeta || 0 };
}
var TM = temper('ghost');

/* =====================================================================
   2. The spring integrator (one integrator, nine named springs)
   ===================================================================== */
var CFG = {
  snap:   { k: 600, c: 48 }, soft:   { k: 140, c: 22 }, emit:   { k: 190, c: 18 },
  pill:   { k: 260, c: 26 }, ret:    { k: 260, c: 32 }, glide:  { k: 170, c: 23 },
  gulp:   { k: 320, c: 14 }, gaze:   { k: 90,  c: 17 }, birth:  { k: 90,  c: 13 }
};
/* uniform springs: critically damped with response T */
function UT(T){ if (RM) T = Math.min(T, 0.3); var w = TAU / T; return { k: w * w, c: 2 * w }; }
var CFG0 = { gaze: { k: CFG.gaze.k, c: CFG.gaze.c }, gulp: { k: CFG.gulp.k, c: CFG.gulp.c }, emit: { k: CFG.emit.k, c: CFG.emit.c } };
var BODY = { gaze: { k: 90, c: 17, body: true }, gulp: { k: 320, c: 14, body: true } };
function tuneTo(out, base, resp, zeta){
  var k = base.k / (resp * resp), z = zeta || base.c / (2 * Math.sqrt(base.k));
  out.k = k; out.c = 2 * z * Math.sqrt(k); return out;
}
function applyTemperSprings(){
  tuneTo(BODY.gaze, CFG0.gaze, TM.resp, TM.zGaze);
  tuneTo(BODY.gulp, CFG0.gulp, TM.resp, TM.zGulp);
  tuneTo(CFG.emit, CFG0.emit, 1, TM.zEmit);
}
applyTemperSprings();
function peakPerV(cfg, m){
  var w = Math.sqrt(cfg.k / m), z = Math.min(0.999, cfg.c / (2 * Math.sqrt(cfg.k * m))), s = Math.sqrt(1 - z * z);
  return Math.exp(-z / s * Math.atan2(s, z)) / w;
}

var clk = 0;                 /* absolute sim time (s); the only time base */
var VLIST = [];
/* One value, one integrator. `to(t, cfg, vel, delay)` with a delay parks the target until clk reaches it; any later
   to/tween/set replaces a parked target, so staggered entrances and exits never fight each other. */
function V(x, cfg, positional){
  this.x = x; this.v = 0; this.t = x; this.m = 1; this.tw = null; this.pd = null; this.pos = !!positional; this.dead = false;
  this.cfg = typeof cfg === 'string' ? CFG[cfg] : (cfg || CFG.soft);
  VLIST.push(this);
}
V.prototype.to = function(t, cfg, vel, delay){
  if (delay > 0){ this.pd = { t0: clk + delay, t: t, cfg: cfg, vel: vel }; return this; }
  this.pd = null;
  if (cfg) this.cfg = typeof cfg === 'string' ? CFG[cfg] : cfg;
  this.t = t; this.tw = null; if (vel != null) this.v = vel;
  if (RM && this.pos){ this.x = t; this.v = 0; }
  return this;
};
/* a curve-driven segment (exhale / inhale / data / focus / fade); still one value, one integrator */
V.prototype.tween = function(t, dur, ease, delay){
  this.pd = null;
  if (RM){ dur = Math.min(dur, 0.2); if (this.pos){ this.set(t); return this; } }
  this.tw = { a: this.x, b: t, t0: clk + (delay || 0), d: Math.max(1e-3, dur), e: ease || E.fade };
  this.t = t; this.v = 0; return this;
};
V.prototype.set = function(x){ this.x = this.t = x; this.v = 0; this.tw = null; this.pd = null; return this; };
V.prototype.kick = function(dv){ if (!RM) this.v += dv; return this; };
V.prototype.kill = function(){ this.dead = true; };
V.prototype.moving = function(){ return !!(this.tw || this.pd) || Math.abs(this.t - this.x) > 1e-3 || Math.abs(this.v) > 1e-3; };
V.prototype.step = function(h){
  var pd = this.pd;
  if (pd && clk >= pd.t0 - 1e-9){ this.pd = null; this.to(pd.t, pd.cfg, pd.vel); }
  var tw = this.tw;
  if (tw){
    var u = (clk - tw.t0) / tw.d;
    if (u < 0){ this.x = tw.a; return; }
    if (u >= 1){ this.x = tw.b; this.tw = null; this.v = 0; return; }
    this.x = tw.a + (tw.b - tw.a) * tw.e(u); return;
  }
  var dx = this.t - this.x;
  if (dx < 1e-6 && dx > -1e-6 && this.v < 1e-6 && this.v > -1e-6){ this.x = this.t; this.v = 0; return; }
  var c = this.cfg, a = (c.k * dx - c.c * this.v) / this.m;
  this.v += a * h; this.x += this.v * h;
};
function stepAll(h){
  var n = VLIST.length, i = 0;
  while (i < n){ var v = VLIST[i]; if (v.dead){ VLIST[i] = VLIST[n - 1]; VLIST.pop(); n--; continue; } v.step(h); i++; }
}
function uv(x, Tr){ return new V(x, UT(Tr)); }

/* =====================================================================
   3. Scheduler: sim-time cues. cue() binds to the current state generation
      (a state change cancels the previous state's pending beats);
      at() is unbound (used only for self-contained visual staggers).
   ===================================================================== */
var QUE = [], GEN = 0;
function at(dt, fn, g){ var t = clk + dt, i = QUE.length; QUE.push(null); while (i > 0 && QUE[i - 1].t > t){ QUE[i] = QUE[i - 1]; i--; } QUE[i] = { t: t, fn: fn, g: g == null ? -1 : g }; }
function cue(dt, fn){ at(dt, fn, GEN); }
function runQue(){
  var guard = 0;
  while (QUE.length && QUE[0].t <= clk + 1e-9 && guard++ < 400){
    var q = QUE.shift();
    if (q.g >= 0 && q.g !== GEN) continue;
    try { q.fn(); } catch (e) { logErr('cue', e); }
  }
}

/* =====================================================================
   4. Stage fit + quality tiers
   ===================================================================== */
var stage = $('stage'), uiEl = $('ui'), cv = $('gl'), inGlass = $('inGlass');
var fitS = 1, fitX = 0, fitY = 0, fitW = -1, fitH = -1, fitChk = 0, dirty = true;
function fit(){
  var w = W.innerWidth || 390, h = W.innerHeight || 844; fitW = W.innerWidth; fitH = W.innerHeight;
  fitS = Math.min(w / 390, h / 844); fitX = (w - 390 * fitS) / 2; fitY = (h - 844 * fitS) / 2;
  stage.style.transform = 'translate(' + fitX.toFixed(2) + 'px,' + fitY.toFixed(2) + 'px) scale(' + fitS.toFixed(5) + ')';
  stage.classList.toggle('lbx-x', fitX > 0.5); stage.classList.toggle('lbx-y', fitY > 0.5);
  sizeCanvas();
  if (typeof placeTypeBox === 'function') placeTypeBox();
}
function refit(){ if (W.innerWidth !== fitW || W.innerHeight !== fitH){ fit(); dirty = true; } }
var DEV_DPR = W.devicePixelRatio || 1;
var QT = (function(){
  var out = [], last = -1;
  [1.75, 1.5, 1.25, 1.0].forEach(function(d){ var e = Math.min(DEV_DPR, d); if (Math.abs(e - last) > 0.01){ out.push({ dpr: e, oct: 4, disp: 1 }); last = e; } });
  out.push({ dpr: last, oct: 3, disp: 1 }); out.push({ dpr: last, oct: 3, disp: 0 });
  return out;
})();
var Q = { tier: 0, oct: 4, disp: 1 };
var dpr = QT[0].dpr, pxk = 1;
function sizeCanvas(){
  var k = dpr * fitS;
  var w = Math.max(1, Math.round(390 * k)), h = Math.max(1, Math.round(844 * k));
  if (cv.width !== w || cv.height !== h){ cv.width = w; cv.height = h; }
  pxk = cv.width / 390;
}
