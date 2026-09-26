
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
