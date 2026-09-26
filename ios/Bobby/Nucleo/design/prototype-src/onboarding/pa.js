
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
