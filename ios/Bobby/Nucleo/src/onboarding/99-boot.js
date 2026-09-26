
/* ============================================================
   Loop + boot. The first bridge call is session({page}); nothing
   else is asked of native before it answers.
   ============================================================ */
function renderAll(){
  renderSphere(); renderSnow(); renderSats(); renderRing(); renderVerdict(); renderChart();
  renderBelt(); renderIsla(); renderMeridian(); renderQuestion(); renderAgents();
  renderCaptions(); renderTexts(); renderPicker(); renderLines(); renderHint();
  renderPill(); renderChips(); renderPerm(); renderCards(); renderSheet(); renderGsat();
  renderGhost(); renderTyping();
}
var STEP = 1 / 120, last = 0, BOOTED = false;
function advance(dt){ var acc = dt; while (acc > 1e-9){ var h = Math.min(STEP, acc); sim(h); acc -= h; } }
/* visibility: nothing is drawn while hidden or while a native sheet covers the page; the clock slows to 0.15× */
var onScreen = true;
try { new IntersectionObserver(function(es){ var v = es[es.length - 1].isIntersecting; if (v !== onScreen){ onScreen = v; last = performance.now(); qReset(); } }, { threshold:0 }).observe(gl ? cv : stage); } catch(e){}
function visible(){ return !document.hidden && onScreen; }

/* ?fps=1: a tiny meter (debug only): fps over the last 1 s, frame interval p50/p95, JS work per frame, quality tier */
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
  txt(fpsEl, n + ' fps · ' + fS[n >> 1].toFixed(1) + '/' + fS[Math.min(n - 1, Math.floor(n * 0.95))].toFixed(1) + ' ms\nQ' + QI + (QPIN != null ? '*' : '') + ' ' + qt.dpr.toFixed(2) + 'x' + (qt.oct < 4 ? ' oct' + qt.oct : '') + (qt.disp ? '' : ' -disp') + (qCap ? ' cap ' + qCap.toFixed(0) : '') + ' · js ' + (ws / n).toFixed(2) + '\n' + W.state);
}
function frame(now){
  if (now - fitChk > 500){ fitChk = now; refit(); }
  var raw = Math.min(0.5, Math.max(0, (now - last) / 1000)); last = now;
  var vis = visible() && !W.sheetOpen;
  if (BOOTED && !frozen && !SEEKING) advance(raw * (paused || !vis ? 0.15 : 1));
  if (vis && !SEEKING){
    var w0 = performance.now(); try { renderAll(); } catch(e){ report('render', e); } var work = performance.now() - w0;
    if (!frozen) qSample(raw * 1000, raw);
    if (FPS) fpsFrame(now, raw * 1000, work);
  }
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', function(){ last = performance.now(); qReset(); });
window.addEventListener('pageshow', function(){ last = performance.now(); qReset(); });
if (HARNESS){
  window.addEventListener('keydown', function(e){
    if (e.target === typeIn) return;
    if (e.key === ' ' || e.key === 'Spacebar'){ togglePause(); e.preventDefault(); }
    else if (e.key === 'ArrowRight'){ var nx = HERO.filter(function(x){ return x.t > T + 0.05; })[0]; if (nx) runTo(nx.t); e.preventDefault(); }
    else if (e.key === 'ArrowLeft'){ var pv = HERO.filter(function(x){ return x.t < T - 0.5; }).pop(); reloadAt(pv ? pv.t : 0); e.preventDefault(); }
  });
}
/* hero frames of the current scripted run (state/signal + dwell), for ArrowRight/Left and the report */
var HERO_DEF = [['born', 'BIRTH', 2.6], ['ask', 'ASK_READY', 1.0], ['mic card', 'PRE_PERMISSION', 0.9], ['listening', 'LISTENING', 1.8],
  ['risk ring filling', 'AGREE_READY', 2.9], ['debate', 'THINK_WAIT', 3.0], ['stances', 'THINK_RESOLVE', 1.9], ['satellites', 'TALK_EVIDENCE', 1.6],
  ['chart', 'TALK_CHART', 2.4], ['verdict', 'VERDICT', 2.0], ['thesis card', 'CARDS', 1.2], ['saved + XP', 'SAVING', 0.8], ['sign-in sheet', 'SIGN_IN', 1.4], ['home', 'HOME', 1.8]];
var HERO = [];
function heroes(){
  var out = [];
  HERO_DEF.forEach(function(d){ for (var i = 0; i < W.log.length; i++){ var e = W.log[i], n = String(e[0]).replace(/^#/, ''); if (n === d[1]){ out.push({ name:d[0], t:+(e[1] + d[2]).toFixed(2) }); break; } } });
  return out;
}
function reloadAt(t){ var u = new URL(location.href); u.searchParams.set('t', String(t)); location.href = u.toString(); }

function boot(){
  LANG = Q.lang === 'es' ? 'es' : 'en';
  W = world(); applyStaticStrings();
  requestAnimationFrame(function(n){ last = n; frame(n); });
  if (!BR){ report('boot', 'no bridge (no native handler and no dev mock)'); return; }
  wireEvents();
  if (MOCK){ BR.mock.useClock(function(){ return T * 1000; }); MOCK_CLOCK = true; }
  call('session', { page:'onboarding' }).then(function(s){
    if (s && s.reducedMotion && !RM){ setReducedMotion(true); W = world(); }
    applySession(s);
    loadRisk().catch(noop);
    return (HARNESS ? harnessPrepare() : Promise.resolve()).then(function(){ return s; });
  }).then(function(s){
    BOOTED = true;
    route(s || {});
    if (HARNESS && Q.t != null && Q.t !== ''){
      runTo(parseFloat(Q.t) || 0).then(function(){ HERO = heroes(); window.NUCLEO_FRAME = { t:+T.toFixed(3), state:W.state, hash:hashFrame(), heroes:HERO }; });
    }
  }, function(e){ report('session', e); });
}
/* web fonts landing late: everything measured once is measured again */
try { document.fonts && document.fonts.ready.then(function(){ wmEl._w = 0; chipEls.forEach(function(c){ c._w = 0; }); gsat._w = 0; tpillEl._w = 0; permEl._h = 0; capEls.forEach(function(c){ c._h = 0; }); }); } catch(e){}
window.nucleo = {
  state:function(){ return W.state; }, time:function(){ return T; }, log:function(){ return W.log.slice(); },
  step:function(dt){ advance(dt); renderAll(); return T; },
  pause:function(){ if (!paused) togglePause(); }, play:function(){ if (paused) togglePause(); },
  world:function(){ return W; }, model:function(){ return M; }, session:function(){ return SESSION; }, picks:function(){ return PICKS.map(function(p){ return p.id; }); },
  lint:lintStrings, heroes:heroes, calls:function(){ return CALLS.slice(); }, reducedMotion:function(){ return RM; },
  seek:function(t){ if (!HARNESS) return Promise.reject(new Error('harness only')); if (t < T) { reloadAt(t); return Promise.resolve(T); } return runTo(t); },
  hash:function(parts){ return HARNESS ? hashFrame(parts) : null; },
  input:MOCK ? { down:inDown, move:inMove, up:inUp } : null,
  status:function(){ return ART_LIST.filter(function(c){ return c.matte; }).map(function(c){ return c.id + (c.ready ? '+' : '-') + (c.tex ? 'T' : ''); }).join(' '); },
  quality:function(i){ if (i != null){ QPIN = clamp(i | 0, 0, QT.length - 1); setQuality(QPIN); } return { tier:QI, pinned:QPIN != null, dpr:QT[QI].dpr, octaves:QT[QI].oct, dispersion:!!QT[QI].disp, median:+qMed.toFixed(2), cap:+qCap.toFixed(2) }; }
};
boot();
})();
