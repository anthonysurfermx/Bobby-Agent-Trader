/* =====================================================================
   15. The simulation step (fixed 1/120 s; springs in two 1/240 s substeps)
   Audio drives the glass: speech.level while listening, voice.level while
   Bobby speaks, and the reading-clock syllable envelope when silent.
   ===================================================================== */
var H = 1 / 120;
function isTalking(){ return K.on && (ST.name === 'TALK_EVIDENCE' || ST.name === 'TALK_CHART' || ST.name === 'VERDICT'); }
function drivers(h){
  var sh = RM ? 0.25 : 1, BP = U.bper.x;
  P.bph = (P.bph + h / BP) % 1;
  /* phases integrated here, never time × state in the shader */
  P.twist = (P.twist + h * sh * 0.5 * U.swirl.x) % TAU;
  P.twistOsc = (P.twistOsc + h * sh * 0.8) % TAU;
  P.flow += h * sh * U.wflow.x * U.flowK.x;
  P.drift += h * sh * 0.11 * U.driftK.x;
  P.rot = (P.rot + h * sh * 0.05) % TAU;
  P.iridPh = (P.iridPh + h * sh * 0.012) % 1;
  P.cio = (P.cio + h * sh * 0.2) % TAU;
  P.fil = (P.fil + h * sh * 0.5) % TAU;
  P.conic = (P.conic + h * 110) % 360;
  P.crawl = (P.crawl + h * 7 / (4 * BP)) % 7;
  P.sat = (P.sat + h / (2 * BP)) % 1;
  /* NOW pulse on B: the first three at B/2, then every B */
  if (A.chartT0 < 1e8 && clk - A.chartT0 >= NOW_T + 0.48 && A.chartExit > 1e8) P.now += h / (P.now < 3 ? BP / 2 : BP); else P.now = 0;

  FLAG.listen = ST.name === 'LISTENING' && !STATES.LISTENING.released;
  FLAG.talk = isTalking();
  if (K.on) K.t += h;
  var raw = 0;
  if (FLAG.listen){ var ds = clk - SPEECH.at; raw = ds < 0.25 ? SPEECH.lvl : ds < 0.6 ? SPEECH.lvl * (1 - (ds - 0.25) / 0.35) : 0; }
  else if (FLAG.talk){
    if (VOICE.started && !VOICE.ended && !VOICE.silent) raw = clk - VOICE.at < 0.25 ? VOICE.lvl : 0;
    else if (K.t < K.end + 0.2) raw = sylAmp(K.syl, K.t + 0.03, 0.055);
  }
  var ka = 1 - Math.exp(-h / 0.035), kr = 1 - Math.exp(-h / 0.16);
  envA += (raw - envA) * (raw > envA ? ka : kr);
  env250 += (envA - env250) * (1 - Math.exp(-h / 0.25));
  DU.voice = envA;
  if (FLAG.listen) U.energy.t = 0.5 + 0.4 * envA;
  if (FLAG.talk && !PREV.imp) U.energy.t = 0.38 + 0.45 * envA;
  P.rip = (P.rip + h * 9) % 1000;

  /* the duel: spins up, then holds with ±12% on 2B; crossings throw sparks (quieter after 15 s, every other after 30 s) */
  if (DU.on){
    var e = clk - DU.t0, w = duelOmega(e);
    if (DU.conv) w = Math.min(9, 2.6 * Math.pow(1 / Math.max(U.radK.x, 0.02), 0.8));
    DU.phi += h * w;
    var kk = Math.floor(DU.phi / PI);
    if (kk !== DU.k){
      DU.k = kk;
      if (e > 0.9){ DU.cross++; var calm = ST.name === 'THINK_WAIT' ? inState() : 0; if (calm < 30 || DU.cross % 2 === 0){ var sa = -PI / 2 + kk * PI; PUL.spark = { t: clk, a: -sa }; exposure(calm > 15 ? 0.06 : 0.12); } }
    }
  }
}
function simStep(h){
  clk += h;
  if (MOCK_CLOCKED) MOCK.pump();
  runQue();
  if (S){
    var s = STATES[ST.name];
    if (s && s.tick){ try { s.tick(h); } catch (e) { logErr('tick ' + ST.name, e); } }
    drivers(h);
    var m = Math.max(0.3, S.r.x / 122); S.cy.m = m * (S.cy.cfg.body ? TM.mass : 1); S.r.m = m * (S.r.cfg.body ? TM.mass : 1);
  }
  stepAll(h / 2); stepAll(h / 2);
  if (S) histPush(clk, S.cy.x + S.lean.x + S.sag.x, S.r.x * (1 + S.gulp.x));
  if (HARNESS && SCRIPT) scriptStep();
}

/* =====================================================================
   16. Adaptive quality (as the prototype: rolling median, hysteresis, no dead ends)
   ===================================================================== */
var QC_HOLD = 45, QC_RETRY0 = QC_HOLD, QC_RETRY_MAX = 240;
var QC = { buf: new Float32Array(45), tmp: new Float32Array(45), n: 0, i: 0, med: 0, over: 0, head: 0, cool: 1.0, t: 0,
           floor: 0, upTo: -1, upT: -1e9, lastDownMed: 0, lastDownFrom: 0, noGain: 0, chainStart: 0, locked: false, fixed: false, retry: [], lockRetry: QC_RETRY0, log: [] };
function qcResetRetry(){ QC.retry.length = 0; for (var i = 0; i < QT.length; i++) QC.retry.push(QC_RETRY0); QC.lockRetry = QC_RETRY0; }
qcResetRetry();
function qMedian(){ var n = QC.n, a = QC.tmp, i, j, v; for (i = 0; i < n; i++){ v = QC.buf[i]; j = i - 1; while (j >= 0 && a[j] > v){ a[j + 1] = a[j]; j--; } a[j + 1] = v; } return n & 1 ? a[n >> 1] : 0.5 * (a[(n >> 1) - 1] + a[n >> 1]); }
function setTier(i, why){
  i = clamp(i | 0, 0, QT.length - 1);
  var tq = QT[i];
  Q.tier = i; Q.oct = tq.oct; Q.disp = tq.disp;
  if (Math.abs(tq.dpr - dpr) > 1e-3){ dpr = tq.dpr; sizeCanvas(); }
  QC.n = 0; QC.i = 0; QC.over = 0; QC.head = 0; QC.cool = 1.0; dirty = true;
  if (QC.log.length < 40) QC.log.push({ t: Math.round(QC.t * 100) / 100, tier: i, dpr: tq.dpr, why: why, med: Math.round(QC.med * 10) / 10 });
}
function qcClimb(why){ QC.upTo = Q.tier - 1; QC.upT = QC.t; QC.lastDownMed = 0; QC.noGain = 0; setTier(Q.tier - 1, why); }
function qcFeed(raw){
  if (QC.fixed || raw <= 0 || raw > 0.25) return;
  QC.t += raw;
  if (QC.cool > 0){ QC.cool -= raw; return; }
  if (QC.upTo >= 0 && Q.tier === QC.upTo && QC.t - QC.upT >= QC_HOLD){ QC.floor = 0; QC.upTo = -1; }
  QC.buf[QC.i] = raw * 1000; QC.i = (QC.i + 1) % QC.buf.length; if (QC.n < QC.buf.length) QC.n++;
  if (QC.n < 15) return;
  var m = QC.med = qMedian();
  if (m > 20){
    QC.head = 0;
    if (QC.locked){ QC.over = 0; return; }
    QC.over += raw; if (QC.over < 1.5) return; QC.over = 0;
    if (QC.lastDownMed > 0){ if (m > QC.lastDownMed * 0.93){ if (!QC.noGain) QC.chainStart = QC.lastDownFrom; QC.noGain++; } else QC.noGain = 0; }
    var bottom = Q.tier >= QT.length - 1;
    if (QC.noGain >= 3 || (bottom && QC.noGain > 0)){ QC.locked = true; setTier(Math.max(QC.chainStart, QC.floor), 'no gain: restored + locked'); return; }
    if (bottom) return;
    if (Q.tier === QC.upTo && QC.t - QC.upT < QC_HOLD){ QC.floor = Math.max(QC.floor, Q.tier + 1); QC.retry[Q.tier] = Math.min(QC_RETRY_MAX, QC.retry[Q.tier] * 2); }
    QC.upTo = -1; QC.lastDownMed = m; QC.lastDownFrom = Q.tier;
    setTier(Q.tier + 1, 'over budget');
  } else {
    QC.over = 0; QC.lastDownMed = 0; QC.noGain = 0;
    if (m >= 17.5){ QC.head = 0; return; }
    QC.head += raw;
    if (QC.locked){ if (QC.head < QC.lockRetry) return; QC.locked = false; QC.lockRetry = Math.min(QC_RETRY_MAX, QC.lockRetry * 2); }
    if (Q.tier > QC.floor){ if (QC.head >= 5) qcClimb('headroom'); }
    else if (Q.tier > 0 && QC.head >= QC.retry[Q.tier - 1]){ QC.floor = Q.tier - 1; qcClimb('probe'); }
  }
}
/* ?fps=1: a tiny meter (fps over 1 s, frame p50/p95, tier, JS ms) */
var FPS = null;
if (QS.fps === '1'){
  var fpsEl = mk('div'); fpsEl.id = 'fpsM'; fpsEl.setAttribute('aria-hidden', 'true'); stage.appendChild(fpsEl);
  FPS = { el: fpsEl, ts: new Float64Array(256), tn: 0, ti: 0, dt: new Float32Array(240), js: new Float32Array(240), di: 0, dn: 0, tmp: new Float32Array(240), next: 0, max: 0 };
}
function pctl(src, n, tmp, q){ for (var i = 0; i < n; i++) tmp[i] = src[i]; var s = tmp.subarray(0, n); s.sort(); return n ? s[Math.min(n - 1, Math.round(q * (n - 1)))] : 0; }
function fpsFeed(now, raw, jsMs){
  var F = FPS;
  F.ts[F.ti] = now; F.ti = (F.ti + 1) % F.ts.length; if (F.tn < F.ts.length) F.tn++;
  if (raw > 0){ F.dt[F.di] = raw * 1000; F.js[F.di] = jsMs; F.di = (F.di + 1) % F.dt.length; if (F.dn < F.dt.length) F.dn++; if (now > 3000) F.max = Math.max(F.max, raw * 1000); }
  if (now < F.next) return; F.next = now + 250;
  var c = 0, old = now; for (var i = 0; i < F.tn; i++) if (now - F.ts[i] < 1000){ c++; if (F.ts[i] < old) old = F.ts[i]; }
  var fps = c > 1 && now > old ? (c - 1) * 1000 / (now - old) : 0;
  var js = 0; for (i = 0; i < F.dn; i++) js += F.js[i]; js = F.dn ? js / F.dn : 0;
  F.fps = fps; F.p95 = pctl(F.dt, F.dn, F.tmp, 0.95); F.jsMean = js;
  F.el.textContent = Math.round(fps) + ' fps  ' + pctl(F.dt, F.dn, F.tmp, 0.5).toFixed(1) + ' / ' + F.p95.toFixed(1) + ' ms\nQ' + Q.tier + ' ' + QT[Q.tier].dpr.toFixed(2) + 'x  js ' + js.toFixed(2) + '  ' + ST.name;
}

/* =====================================================================
   17. The loop. Hidden or behind a native sheet: nothing runs.
   ===================================================================== */
var paused = false, acc = 0, last = -1, onScreen = true, active = false;
function canRun(){ return !D.hidden && onScreen && !SHEET; }
D.addEventListener('visibilitychange', function(){ last = -1; });
W.addEventListener('pageshow', function(){ last = -1; });
function frame(now){
  requestAnimationFrame(frame);
  if (now - fitChk > 500){ fitChk = now; refit(); }
  if (!(active = canRun())){ last = -1; return; }
  var tj = FPS ? performance.now() : 0;
  var raw = last < 0 ? 0 : Math.min(0.5, Math.max(0, (now - last) / 1000)); last = now;
  acc += raw * (paused ? 0.15 : 1);
  var guard = 0;
  while (acc >= H && guard < 80){ simStep(H); acc -= H; guard++; }
  if (guard >= 80) acc = 0;
  var kl = 1 - Math.exp(-Math.min(0.05, raw) / 0.3); LIGHT.x += (LIGHT.tx - LIGHT.x) * kl; LIGHT.y += (LIGHT.ty - LIGHT.y) * kl;
  try { render(); } catch (err) { logErr('render', err); }
  dirty = false;
  try { qcFeed(raw); if (FPS) fpsFeed(now, raw, performance.now() - tj); } catch (err) { logErr('perf', err); }
}
