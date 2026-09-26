/* =====================================================================
   18. Harness (?harness=1, dev mock only; does nothing on native or in a
   release build). The mock runs on the engine's sim clock and is pumped
   every sim step; microtasks are flushed between steps while any bridge
   call is pending, so ?t=<s>&freeze=1 renders the same frame on every load.
   Scripts drive the SAME input entry points as a real finger. A script may
   contain a spoken question only; every value on screen still comes from
   the bridge replies.
   ===================================================================== */
var MOCK_CLOCKED = false, SCRIPT = null, G = { x: 195, y: 790, vis: 0, press: 0 };
var SCRIPTS = {
  'read-nvda': { mic: 'granted', steps: [
    { wait: 'IDLE', after: 1.0 },
    { say: 'Should I buy NVIDIA right now?' },
    { hold: '#pill', dur: 3.3 },
    { wait: 'HANDBACK', after: 1.2 },
    { drag: [195, 600, 195, 720], dur: 0.6, ease: 'pull' },
    { wait: 'CARDS', after: 1.0 },
    { drag: [300, 424, 180, 424], dur: 0.3, ease: 'swipe' },
    { after: 1.1 },
    { tap: '#save' },
    { wait: 'FOLLOWUPS', after: 2.2 },
    { tap: '#close' },
    { wait: 'IDLE', after: 1.6 },
    { drag: [252, 350, 150, 340], dur: 0.3, ease: 'swipe' },
    { wait: 'FACES', after: 1.6 },
    { drag: [252, 350, 150, 340], dur: 0.3, ease: 'swipe' },
    { after: 1.6 },
    { drag: [252, 350, 150, 340], dur: 0.3, ease: 'swipe' },
    { wait: 'IDLE', after: 2.0 }
  ] },
  'read-btc': { mic: 'granted', steps: [
    { wait: 'IDLE', after: 1.0 },
    { say: 'Is now a good time for Bitcoin?' },
    { hold: '#pill', dur: 3.6 },
    { wait: 'HANDBACK', after: 1.2 },
    { drag: [195, 600, 195, 720], dur: 0.6, ease: 'pull' },
    { wait: 'CARDS', after: 1.0 },
    { drag: [300, 424, 180, 424], dur: 0.3, ease: 'swipe' },
    { after: 1.1 },
    { tap: '#save' },
    { wait: 'FOLLOWUPS', after: 2.2 },
    { tap: '#close' },
    { wait: 'IDLE', after: 1.6 },
    { drag: [252, 350, 150, 340], dur: 0.3, ease: 'swipe' },
    { wait: 'FACES', after: 1.6 },
    { drag: [252, 350, 150, 340], dur: 0.3, ease: 'swipe' },
    { after: 1.6 },
    { drag: [252, 350, 150, 340], dur: 0.3, ease: 'swipe' },
    { wait: 'IDLE', after: 2.0 }
  ] }
};
function ePull(u){ return 2.05 * u - 2.35 * u * u + 1.3 * u * u * u; }
function eSwipe(u){ return 2 * u * u - u * u * u; }
function hitAt(x, y){ try { render(); } catch (e0) {} var e = D.elementFromPoint(fitX + x * fitS, fitY + y * fitS); return hitOf(e); }
function targetXY(t){
  if (Array.isArray(t)) return [t[0], t[1]];
  try { render(); } catch (e0) {}
  var n = D.querySelector(t); if (!n) return [195, 770];
  var r = n.getBoundingClientRect(); return toStage(r.left + r.width / 2, r.top + r.height / 2);
}
/* one step at a time: wait → approach (0.28 s) → gesture → lift (0.3 s) */
function scriptStep(){
  var sc = SCRIPT; if (!sc || sc.i >= sc.steps.length){ if (sc && !sc.done){ sc.done = true; G.vis = 0; } return; }
  var s = sc.steps[sc.i], t = clk - sc.t0;
  if (!sc.ph){
    if (s.say){ if (MOCK) MOCK.say(s.say); return next(); }
    if (s.type != null){ if (ST.name === 'TYPING'){ el.ta.value = s.type; STATES.TYPING.send(); } return next(); }
    if (s.wait){ if (ST.name !== s.wait) return; sc.ph = 'delay'; sc.t0 = clk; return; }
    if (s.after != null){ sc.ph = 'delay'; sc.t0 = clk; return; }
    sc.ph = 'approach'; sc.t0 = clk; return;
  }
  if (sc.ph === 'delay'){ if (t >= (s.after || 0)){ if (s.hold || s.tap || s.drag){ sc.ph = 'approach'; sc.t0 = clk; } else next(); } return; }
  var p0 = s.drag ? [s.drag[0], s.drag[1]] : (sc.xy || (sc.xy = targetXY(s.hold || s.tap)));
  if (sc.ph === 'approach'){
    var ua = clamp(t / 0.28, 0, 1), ea = E.exhale(ua);
    G.x = p0[0]; G.y = p0[1] + 20 * (1 - ea); G.vis = ea; G.press = 0;
    if (ua >= 1){ sc.ph = 'down'; sc.t0 = clk; G.press = 1; inDown(p0[0], p0[1], hitAt(p0[0], p0[1])); }
    return;
  }
  if (sc.ph === 'down'){
    var dur = s.hold ? s.dur : s.tap ? 0.1 : s.dur, u = clamp(t / dur, 0, 1);
    if (s.drag){ var e = (s.ease === 'pull' ? ePull : s.ease === 'swipe' ? eSwipe : E.lin)(u); G.x = lerp(s.drag[0], s.drag[2], e); G.y = lerp(s.drag[1], s.drag[3], e); inMove(G.x, G.y); }
    if (u >= 1){ inUp(G.x, G.y); G.press = 0; sc.ph = 'lift'; sc.t0 = clk; }
    return;
  }
  if (sc.ph === 'lift'){ G.vis = 1 - clamp(t / 0.3, 0, 1); if (t >= 0.3) next(); }
  function next(){ sc.i++; sc.ph = null; sc.t0 = clk; sc.xy = null; }
}
function renderGhost(){ op(el.ghost, G.vis * 0.95); if (G.vis > 0.002){ tf(el.ghost, G.x, G.y, G.press ? 0.84 : 1); op(el.ghost.firstChild, G.press ? 1 : 0); } }
function harnessTapToggle(e){ var x0 = e.clientX, y0 = e.clientY; stage.addEventListener('pointerup', function up(u){ stage.removeEventListener('pointerup', up); if (Math.hypot(u.clientX - x0, u.clientY - y0) < 8) paused = !paused; op(el.pause, paused ? 1 : 0); }); }
function flush(){ var p = Promise.resolve(); for (var i = 0; i < 12; i++) p = p.then(noop); return p; }
function runSteps(n){ var i = 0; function more(){ while (i < n){ simStep(H); i++; if (CALLS > 0) return flush().then(more); } return Promise.resolve(); } return more(); }
function fnv(h, s){ for (var i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
function fnvBytes(h, b){ for (var i = 0; i < b.length; i++){ h ^= b[i]; h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
function hx8(n){ return ('00000000' + (n >>> 0).toString(16)).slice(-8); }
function hashFrame(){
  render();
  var g = 0;
  if (gl && !glLost){ var w = cv.width, h = cv.height, buf = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf); g = fnvBytes(2166136261, buf); }
  return { gl: hx8(g), dom: hx8(fnv(2166136261, stage.innerHTML)), t: Math.round(clk * 1000) / 1000, state: ST.name };
}
function harnessStart(){
  var sc = SCRIPTS[QS.script];
  if (sc){ SCRIPT = { steps: sc.steps, i: 0, ph: null, t0: 0, done: false }; SCRIPTED = !FREEZE; if (sc.mic && !QS.mic) MOCK.setMic(sc.mic); }
  if (!FREEZE){ SCRIPTED = !!sc; }
  QC.fixed = true; if (QS.q != null && QS.q !== '') setTier(parseInt(QS.q, 10) || 0, 'harness ?q');
  W.addEventListener('keydown', function(e){
    if (e.target === el.ta) return;
    if (e.key === ' ' || e.key === 'Spacebar'){ paused = !paused; op(el.pause, paused ? 1 : 0); e.preventDefault(); }
    else if (e.key === 'ArrowRight'){ HBUSY = true; runSteps(120).then(function(){ HBUSY = false; render(); }); e.preventDefault(); }
    else if (e.key === 'ArrowLeft'){ var q = new URLSearchParams(location.search); q.set('t', String(Math.max(0, Math.round((clk - 1) * 100) / 100))); location.search = q.toString(); }
  });
}
var HBUSY = false, FROZEN = false;
function harnessLoop(){
  var lastNow = -1;
  function tick(now){
    requestAnimationFrame(tick);
    if (HBUSY || FROZEN) return;
    if (!(active = canRun())){ lastNow = -1; return; }
    var raw = lastNow < 0 ? 0 : Math.min(0.5, Math.max(0, (now - lastNow) / 1000)); lastNow = now;
    acc += raw * (paused ? 0.15 : 1);
    var n = 0; while (acc >= H && n < 80){ acc -= H; n++; }
    if (n >= 80) acc = 0;
    HBUSY = true;
    runSteps(n).then(function(){ HBUSY = false; try { render(); } catch (e) { logErr('render', e); } });
  }
  requestAnimationFrame(tick);
}
function harnessFreeze(t){
  HBUSY = true;
  return runSteps(Math.round(t / H)).then(function(){ return compLoadP || null; }).then(function(){ HBUSY = false; FROZEN = true; render(); return hashFrame(); });
}
