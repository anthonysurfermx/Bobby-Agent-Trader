
/* ============================================================
   World state. T is the simulation clock (fixed 1/120 s steps,
   never loops). Beats are STATES entered by input or by a bridge
   reply; their choreography is a list of cues relative to entry.
   Entering a state bumps W.gen, which cancels the previous
   state's pending cues, so every transition is interruptible.
   ============================================================ */
var T = 0, W = null;
var HN = 96;   /* sphere history ring (0.8 s at 120 Hz): DOM children follow 60–170 ms behind */
var DET = 2 * Math.PI / 5;       /* one detent: faces and picker share the physics */
var A_ALPHA = 140 * Math.PI / 180, A_RED = 40 * Math.PI / 180, A_CIO = -Math.PI / 2;   /* GL angles (y up) */
var SESSION = null;              /* the last Session from native */
var M = null;                    /* the read model (NucleoReadModel.build) of the first read */

function world(){
  ALL.length = 0;
  var w = {
    cy:S(340, 'soft'), r:S(2, 'birth'), gulp:S(1, 'gulp'), sag:S(0, 'gulp'), hop:S(0, 'emit'),
    pend:null, birthMass:true, birthT:1e9,   /* not born yet: the launch-screen black until the first session */
    energy:U(0.6, 0.30), swirl:U(0, 0.9), lean:U(0, 0.66), glow:U(0, 0.40), irid:U(1, 0.60), birth:U(0, 0.9),
    tl:U(0, 0.8), ta:U(0, 0.8), tb:U(0, 0.8), tintAmt:U(0, 0.8), wash:U(0, 0.8), nb:U(0, 0.4),
    compAmt:U(0, 0.42), compDepth:U(1, 0.42), compSil:U(0, 0.7),
    scrim:U(0, 0.38), braid:U(0, 0.48), flood:U(0, 0.48), wFlow:U(0.18, 0.6), rimBoost:U(0, 0.33),
    nodeGlow:[U(0, 0.3), U(0, 0.3), U(0, 0.3)], nodeR:[S(0.95, 'emit'), S(0.95, 'emit'), S(0.95, 'emit')],
    filA:U(0, 0.3), pillW:S(96, 'pill'), theta:S(0, 'glide'), belt:S(0, 'glide'), track:S(1, 'glide'), reveal:S(0, 'glide'),
    txShift:S(0, 'soft'), xpArc:U(0, 0.6), closeK:U(0, 0.25),
    floodAmt:1, vcol:C_CIO, vcore:[0.165, 0.11, 0.03], nodeAng:[A_ALPHA, A_RED, A_CIO], nodeW:[0, 0, 0], nodeOn:[false, false, false], conv:null, sepR0:[0.55, 0.55, 0.72],
    twist:0, twistOsc:0, flow:0, drift:0, rot:0, iridPh:0, flowA:0, flowR:0, cioRot:0, bph:0, period:4.8,
    tp:[], tpv:new Float64Array(TV.none),
    hT:new Float64Array(HN), hC:new Float64Array(HN), hR:new Float64Array(HN), hN:0, hI:0,
    filR:0.8, filAng:0, filCollapse:null, voice:0, env:0, env250:0,
    haps:[], expo:[], shock:null, rip:null, emitEv:null, spark:null, lastRel:null, crossN:0,
    tm:{}, pick:0, pickRoll:[], peek:0, thBase:0, pull:null,
    pillMode:'none', pillLabel:'', pillLabelT:-9, pillLabelPrev:'', pillModeT:-9, pillModePrev:'none',
    agree:null, hint:'', hintPrev:'', hintT:-9, vflag:false,
    /* live state */
    state:'BOOT', stT:0, gen:0, cues:[], log:[], pr:{}, caps:[null, null], capLast:0,
    title:null, cap2:'', chips:[], chipsKey:'', chosen:false, chosenIdx:-1,
    question:'', qw:[], qSrc:'', qFinal:false, agMode:'trailer', stanceT:[1e9, 1e9, 1e9],
    mer:[], micLevel:0, micLevelT:-9, vLevel:0, vLevelT:-9, pvLevel:0, pvLevelT:-9, pvSeq:0, listenSeq:0, askSeq:0, talking:false, compShow:false,
    ringMode:'complete', ringPct:1, vcolHex:'#F6B94E', verdictShown:false,
    snow:null, snowOn:false, snowT:0, snowOff:null, picker:false, peekOn:false
  };
  crit(w.flood, 0.48);
  w.cy.m = 1; w.r.m = 1;
  for (var i = 0; i < TP_N; i++) w.tp.push(U(TV.none[i], 0.45));   /* temperament vector, sprung (T .45 s): blends, never steps */
  w.lean.T0 = 0.66;
  w.pull = S(0, 'gulp');
  return w;
}
/* marks: born/gone times per element (renderers read clk − mark, never a literal time) */
function tb(k, t){ W.tm[k] = [t == null ? T : t, 1e9]; }
function tg(k, t){ if (!W.tm[k]) W.tm[k] = [-1e9, 1e9]; W.tm[k][1] = t == null ? T : t; }
function tmB(k){ return W.tm[k] ? W.tm[k][0] : 1e9; }
function tmG(k){ return W.tm[k] ? W.tm[k][1] : 1e9; }
function isOn(k, tail){ var m = W.tm[k]; return !!m && T >= m[0] && T < m[1] + (tail || 0); }
function hap(a){ W.haps.push({ t:T, a:a }); if (W.haps.length > 24) W.haps.splice(0, W.haps.length - 24); }
/* a haptic is both a visual tick on the glass and a real one from native (rate-limited there) */
function buzz(kind, a){ hap(a == null ? 0.6 : a); fire('haptic', { kind:kind }); }
function bodyKick(s, dv){ kick(s, dv / (W.tpv[TP_RESP] * W.tpv[TP_MASS])); }
function gulpK(p){ bodyKick(W.gulp, p * 30); }
function expo(a, rise, dec){ if (!RM){ W.expo.push({ t:T, a:a, r:rise || 0.06, d:dec || 0.52 }); if (W.expo.length > 16) W.expo.shift(); } }
function shock(r1, a, col, dur){ if (!RM) W.shock = { t:T, r1:r1, a:a, col:col, d:dur }; }
function ripple(a){ if (!RM) W.rip = { t:T, a:a }; }
function tintTo(labc, amt){ to(W.tl, labc[0]); to(W.ta, labc[1]); to(W.tb, labc[2]); if (amt != null) to(W.tintAmt, amt); }
function tintSnap(labc){ W.tl.x = W.tl.t = labc[0]; W.ta.x = W.ta.t = labc[1]; W.tb.x = W.tb.t = labc[2]; }
function setHint(s){ if (W.hint === s) return; W.hintPrev = W.hint; W.hint = s; W.hintT = T; }
function setPill(mode, label, width){
  if (mode && mode !== W.pillMode){ W.pillModePrev = W.pillMode; W.pillMode = mode; W.pillModeT = T; }
  if (label != null && label !== W.pillLabel){ W.pillLabelPrev = W.pillLabel; W.pillLabel = label; W.pillLabelT = T; }
  if (width) to(W.pillW, width, 'pill');
}
/* a label pill sizes itself from its copy (Geist 600 16), never narrower than the named width */
function pillFor(label, minW){ return Math.min(330, Math.max(minW || 96, Math.ceil(textW(label, '600 16px Geist, -apple-system, system-ui, sans-serif')) + 64)); }
function moveSphere(cy, r, nm){
  nm = nm || 'soft';
  var dy = cy - W.cy.t;
  if (!RM && Math.abs(dy) > 80){
    to(W.cy, W.cy.x - 6 * (dy > 0 ? 1 : -1), 'gaze'); to(W.r, W.r.x * 0.98, 'gaze');
    W.pend = { t:T + 0.12, cy:cy, r:r, nm:nm };
  } else { W.pend = null; to(W.cy, cy, nm); to(W.r, r, nm); }
}
function companionTint(){ return CHOSEN_ART ? CHOSEN_ART.tintLab : lab('#B8C2D3'); }

/* ---------- cues ---------- */
function at(dt, fn){ W.cues.push({ t:T + dt, fn:fn, g:W.gen }); }      /* cancelled when the state changes */
function after(dt, fn){ W.cues.push({ t:T + dt, fn:fn, g:-1 }); }      /* survives state changes (visual follow-through) */
function cueStep(){
  if (!W.cues.length) return;
  var list = W.cues; W.cues = [];
  for (var i = 0; i < list.length; i++){
    var c = list[i];
    if (c.g !== -1 && c.g !== W.gen) continue;
    if (c.t <= T + 1e-9){ try { c.fn(); } catch(e){ report('cue', e); } }
    else W.cues.push(c);
  }
}
function report(where, e){ try { console.error('[onboarding]', where, e); } catch(x){} }

/* ============================================================
   Bobby's lines: speak() + karaoke captions.
   The voice is the clock: voice.word (device engine) or
   voice.progress (neural) place the words; voice.level drives
   the glass. Muted, too long, failed or silent past the
   watchdog: a 2.6 words/s reading clock and the syllable
   envelope from NucleoReadModel.wordTimes drive the same inputs.
   ============================================================ */
var LINE = null, lineSeq = 0;
var capEls = [$('cap'), (function(){ var c = $('cap').cloneNode(false); c.id = 'capB'; $('cap').parentNode.insertBefore(c, $('cap').nextSibling); return c; })()];
var capMeas = $('capM');
function wordTimesFor(text, dur){ return RMOD ? RMOD.wordTimes(text, dur) : String(text).split(/\s+/).filter(Boolean).map(function(w, i){ return { word:w, t0:i / 2.6, t1:(i + 0.8) / 2.6 }; }); }
function sayLine(o){
  var parts = o.noSplit ? [String(o.text || '')] : String(o.text || '').split('|'), words = [], explicit = [0];
  parts.forEach(function(p, pi){ var ws = p.split(/\s+/).filter(Boolean); if (pi > 0 && words.length) explicit.push(words.length); Array.prototype.push.apply(words, ws); });
  var clean = words.join(' ');
  var ln = { id:o.exactId ? String(o.id) : (o.id || 'line') + '.' + (++lineSeq), key:++lineSeq, text:clean, words:words, wt:wordTimesFor(clean, null), t0:null, src:null,
    visible:o.visible !== false, hold:!!o.hold, topFn:o.top, page:null, lit:-1, litT:[], done:false, doneT:null, endAt:null, voiceEnded:false,
    onDone:o.onDone || null, cues:o.cues || [], amberIdx:o.amberIdx == null ? -1 : o.amberIdx, watch:0, silent:!!o.silent };
  ln.pages = o.pages === 'explicit' || explicit.length > 1 ? pagesFromStarts(explicit, words.length) : paginate(words, o.breaks || []);
  if (LINE && LINE !== ln) retireLine(LINE);
  LINE = ln;
  if (ln.silent || !BR){ startClock(ln); return ln; }
  ln.watch = T + (o.watchdog || 3.5);
  call('speak', { id:ln.id, text:clean }).then(function(r){
    if (LINE !== ln || ln.t0 != null) return;
    if (!r || r.status !== 'queued') startClock(ln);
  }, function(){ if (LINE === ln && ln.t0 == null) startClock(ln); });
  return ln;
}
function startClock(ln){ if (ln.t0 == null) ln.t0 = T + 0.05; ln.src = 'clock'; ln.watch = 0; }
function retireLine(ln){ capGone(ln); ln.done = true; }   /* the next speak() stops its voice natively */
function pagesFromStarts(starts, n){ var p = []; for (var i = 0; i < starts.length; i++) p.push({ w0:starts[i], w1:i + 1 < starts.length ? starts[i + 1] : n }); return p; }
/* ≤ 2-line pages, measured with the caption's own type. A full page breaks at the last sentence end, else the last
   clause (, ; :), else the last word that fits; forced breaks keep stage sentences (chart, verdict) on their own pages. */
function paginate(words, breaks){
  var pages = [], w0 = 0, maxH = 2 * 31 + 4;
  function fits(a, b){ capMeas.textContent = words.slice(a, b).join(' '); var hgt = capMeas.offsetHeight; if (!hgt) hgt = 31 * Math.ceil(capMeas.textContent.length / 30); return hgt <= maxH; }
  for (var i = w0 + 1; i <= words.length; i++){
    var forced = breaks.indexOf(i - 1) >= 0 && i - 1 > w0;
    if (forced){ pages.push({ w0:w0, w1:i - 1 }); w0 = i - 1; }
    if (i - w0 > 1 && !fits(w0, i)){
      var cut = i - 1, j;
      for (j = i - 1; j > w0 + 2; j--){ if (/[.!?…]["”)]?$/.test(words[j - 1])){ cut = j; break; } }
      if (cut === i - 1 && !/[.!?…]["”)]?$/.test(words[i - 2])){ for (j = i - 1; j > w0 + 3; j--){ if (/[,;:]$/.test(words[j - 1]) && j - w0 >= (i - 1 - w0) * 0.45){ cut = j; break; } } }
      pages.push({ w0:w0, w1:cut }); w0 = cut; i = w0;
    }
  }
  if (w0 < words.length) pages.push({ w0:w0, w1:words.length });
  capMeas.textContent = '';
  return pages;
}
function estLit(ln, i){ if (ln.litT[i] != null) return ln.litT[i]; if (ln.t0 == null || !ln.wt[i]) return 1e9; return ln.t0 + ln.wt[i].t0 - 0.03; }   /* visuals lead audio by 30 ms */
function lineEndEst(ln){ var n = ln.words.length; return ln.t0 == null ? 1e9 : ln.t0 + (n ? ln.wt[n - 1].t1 : 0); }
function pageOf(ln){ for (var k = ln.pages.length - 1; k > 0; k--){ if (estLit(ln, ln.pages[k].w0) - 0.22 <= T) return k; } return 0; }
function capGone(ln){ for (var s = 0; s < 2; s++){ var c = W.caps[s]; if (c && c.ln === ln && c.gone > T) c.gone = T; } }
function capTop(ln, k){ var t = ln.topFn; return typeof t === 'function' ? t(k) : (t == null ? 512 : t); }
function showPage(ln, k){
  var prev = W.caps[W.capLast];
  if (prev && prev.gone > T) prev.gone = T;
  var s = (W.capLast + 1) % 2;
  W.caps[s] = { ln:ln, k:k, born:T, gone:1e9, top:capTop(ln, k) };
  W.capLast = s; ln.page = k;
  var pg = ln.pages[k]; txt(live, ln.words.slice(pg.w0, pg.w1).join(' '));
}
function lineStep(){
  var ln = LINE; if (!ln || ln.done && !ln.hold) return;
  if (ln.t0 == null){
    if (ln.watch && T > ln.watch){ ln.watch = 0; fire('stopSpeaking', {}); startClock(ln); }
    else return;
  }
  var n = ln.words.length;
  while (ln.lit + 1 < n && estLit(ln, ln.lit + 1) <= T){
    ln.lit++; ln.litT[ln.lit] = Math.min(T, estLit(ln, ln.lit));
    for (var c = 0; c < ln.cues.length; c++){ var q = ln.cues[c]; if (!q.fired && q.word === ln.lit){ q.fired = true; try { q.fn(ln); } catch(e){ report('word cue', e); } } }
  }
  if (ln.visible && !ln.done){ var k = pageOf(ln); if (k !== ln.page) showPage(ln, k); }
  if (!ln.done){
    var lastLit = n ? estLit(ln, n - 1) : T, endT;
    if (ln.src === 'voice' && !ln.voiceEnded) endT = lineEndEst(ln) + 3.0;          /* a lost voice.end never strands the beat */
    else if (ln.src === 'voice' && ln.endAt != null) endT = Math.max(ln.endAt, lastLit + 0.25);
    else endT = lineEndEst(ln) + 0.35;
    if (ln.lit >= n - 1 && T >= endT){
      ln.done = true; ln.doneT = T;
      for (var d = 0; d < ln.cues.length; d++){ var qd = ln.cues[d]; if (!qd.fired && qd.word === 'end'){ qd.fired = true; try { qd.fn(ln); } catch(e){ report('end cue', e); } } }
      if (!ln.hold) capGone(ln);
      if (ln.onDone){ try { ln.onDone(ln); } catch(e){ report('line done', e); } }
    }
  }
}
/* the glass hears Bobby: voice.level while it is fresh, else the syllable envelope of the karaoke clock */
function speakEnv(){
  var ln = LINE; if (!ln || ln.t0 == null || ln.done) return 0;
  if (ln.src === 'voice' && T - W.vLevelT < 0.25) return W.vLevel;
  var e = T - ln.t0, wt = ln.wt, n = wt.length; if (!n || e < wt[0].t0 - 0.03 || e > wt[n - 1].t1 + 0.1) return 0;
  var i = 0; while (i < n - 1 && wt[i + 1].t0 <= e) i++;
  var w0 = wt[i].t0, w1 = wt[i].t1, dur = Math.max(0.12, w1 - w0), u = (e - w0) / dur;
  if (u < 0 || u > 1) return 0.08;
  var syl = Math.pow(Math.abs(Math.sin(u * Math.PI * Math.max(1, Math.round(String(wt[i].word).length / 3)))), 0.7);
  return clamp((0.35 + 0.65 * syl) * (1 - 0.35 * u), 0, 1);
}
function onVoice(name, p){
  var ln = LINE; if (!ln || !p || p.id !== ln.id) return;
  if (name === 'voice.start'){
    if (ln.t0 == null){ ln.t0 = T; ln.src = 'voice'; ln.watch = 0; }
    if (fin(p.durationSec) && p.durationSec > 0.3) ln.wt = wordTimesFor(ln.text, p.durationSec);
  } else if (name === 'voice.progress'){
    if (fin(p.duration) && p.duration > 0.3 && Math.abs((ln.wt.length ? ln.wt[ln.wt.length - 1].t1 : 0) - p.duration) > 0.25) ln.wt = wordTimesFor(ln.text, p.duration);
    if (!fin(p.t)) return;
    var target = T - p.t;
    if (ln.t0 == null){ ln.t0 = target; ln.src = 'voice'; ln.watch = 0; }
    else { var d = target - ln.t0; ln.t0 += Math.abs(d) > 0.35 ? d : d * 0.25; }
  } else if (name === 'voice.word'){
    var i = p.index | 0; if (!ln.wt[i]) return;
    var tg0 = T - ln.wt[i].t0;
    if (ln.t0 == null){ ln.t0 = tg0; ln.src = 'voice'; ln.watch = 0; } else ln.t0 = tg0;
  } else if (name === 'voice.level'){
    W.vLevel = fin(p.level) ? p.level : 0; W.vLevelT = T;
  } else if (name === 'voice.end'){
    ln.voiceEnded = true;
    if (p.reason === 'finished') ln.endAt = T;
    else { ln.src = 'clock'; if (ln.t0 == null) ln.t0 = T; }
  }
}
function wordIndexOfSentence(sentences, k){ var n = 0; for (var i = 0; i < k && i < sentences.length; i++) n += String(sentences[i]).split(/\s+/).filter(Boolean).length; return n; }
