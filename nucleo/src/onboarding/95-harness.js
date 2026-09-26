
/* ============================================================
   Harness (?harness=1, dev mock only). Scripted user input — a
   ghost-finger table keyed to states and signals — replays on the
   sim clock; the mock bridge runs on the same clock and is pumped
   every step, and replies are flushed between steps, so
   ?t=<s>&freeze=1 renders the same frame on every load.
   Outside the harness every function here is a no-op.
   ============================================================ */
var SEEKING = false, paused = false, frozen = HARNESS && Q.freeze === '1', beatIdx = -1;
var H = { script:null, name:'', hits:{}, queue:[], g:null };
var GHOST = { x:195, y:900, p:0, v:0 };
/* [signal or state, nth time it fires, delay (s), action, args…]. Actions: tap <target> · hold <target> <s> ·
   swipe <-1 next | 1 previous> · pull <dy> · type <text> (typing path) · chip <i> */
var SCRIPTS = {
  'first-run': [
    ['PICK_READY', 1, 1.3, 'swipe', -1],
    ['PICK_READY', 1, 2.5, 'swipe', -1],
    ['PICK_READY', 1, 3.7, 'swipe', -1],
    ['PICK_READY', 1, 5.6, 'tap', 'pill'],
    ['ASK_READY', 1, 1.8, 'hold', 'pill', 0.3],
    ['PRE_PERMISSION', 1, 1.2, 'tap', 'perm'],
    ['ASK_GRANTED', 1, 2.2, 'hold', 'pill', 3.4],
    ['AGREE_READY', 1, 0.9, 'hold', 'pill', 0.5],
    ['AGREE_READY', 1, 2.2, 'hold', 'pill', 1.5],
    ['HANDBACK_READY', 1, 1.8, 'pull', 230],
    ['CARDS_READY', 1, 1.6, 'tap', 'save'],
    ['SIGN_IN', 1, 2.4, 'tap', 'notnow']
  ],
  /* mic=denied: the typing path completes the whole run */
  'typed-run': [
    ['PICK_READY', 1, 1.6, 'tap', 'pill'],
    ['ASK_READY', 1, 1.8, 'hold', 'pill', 0.3],
    ['TYPING', 1, 1.0, 'type', 'How is Bitcoin doing today?'],
    ['AGREE_READY', 1, 1.0, 'hold', 'pill', 1.5],
    ['HANDBACK_READY', 1, 1.8, 'pull', 230],
    ['CARDS_READY', 1, 1.6, 'tap', 'save'],
    ['SIGN_IN', 1, 2.4, 'tap', 'notnow']
  ],
  /* resume (first=1&companion=…): a chip question */
  'chip-run': [
    ['ASK_READY', 1, 2.2, 'chip', 0],
    ['AGREE_READY', 1, 1.0, 'hold', 'pill', 1.5],
    ['HANDBACK_READY', 1, 1.8, 'pull', 230],
    ['CARDS_READY', 1, 1.6, 'tap', 'save'],
    ['SIGN_IN', 1, 2.4, 'tap', 'notnow']
  ],
  'risk-only': [
    ['AGREE_READY', 1, 1.0, 'hold', 'pill', 1.5]
  ]
};
function beatPost(name){
  if (!HARNESS) return;
  var b = BEAT_OF[name]; if (b == null || b === beatIdx) return; beatIdx = b;
  try { if (window.parent && window.parent !== window) window.parent.postMessage({ type:'bobby-step', index:b, total:BEAT_TITLES.length, title:BEAT_TITLES[b] }, '*'); } catch(e){}
}
function harnessOn(name){ signal(name); }
function signal(name){
  if (!HARNESS) return;
  W.log.push(['#' + name, +T.toFixed(3)]);
  if (!H.script) return;
  H.hits[name] = (H.hits[name] || 0) + 1;
  for (var i = 0; i < H.script.length; i++){ var r = H.script[i]; if (r[0] === name && r[1] === H.hits[name]) H.queue.push({ t:T + r[2], act:r.slice(3), seq:i }); }
  H.queue.sort(function(a, b){ return a.t - b.t || a.seq - b.seq; });
}
function targetXY(name, idx){
  if (name === 'pill') return [195, 770];
  var el = name === 'chip' ? chipEls[idx] : document.querySelector('[data-hit="' + name + '"]');
  if (!el) return [195, 600];
  var r = el.getBoundingClientRect(), p = toStage(r.left + r.width / 2, r.top + r.height / 2);
  return [Math.round(p[0]), Math.round(p[1])];
}
function harnessStep(){
  while (H.queue.length && H.queue[0].t <= T + 1e-9 && !H.g){ startGesture(H.queue.shift().act); }
  var g = H.g; if (!g) { if (GHOST.v > 0 && T > GHOST.until) GHOST.v = 0; return; }
  GHOST.v = 1;
  if (g.kind === 'press'){
    if (!g.down){ g.down = true; inDown(g.name, g.idx, g.x, g.y); }
    GHOST.x = g.x; GHOST.y = g.y; GHOST.p = 1;
    if (T >= g.t1){ inUp(g.x, g.y, g.name, false); H.g = null; GHOST.p = 0; GHOST.until = T + 0.3; }
  } else if (g.kind === 'drag'){
    if (!g.down){ g.down = true; inDown(null, -1, g.x0, g.y0); }
    var u = c01((T - g.t0) / g.dur), x = lerp(g.x0, g.x1, u), y = lerp(g.y0, g.y1, u);
    inMove(x, y); GHOST.x = x; GHOST.y = y; GHOST.p = 1;
    if (u >= 1){ inUp(x, y, null, false); H.g = null; GHOST.p = 0; GHOST.until = T + 0.3; }
  }
}
function startGesture(a){
  var k = a[0], xy;
  if (k === 'tap' || k === 'hold'){ xy = targetXY(a[1], -1); H.g = { kind:'press', name:a[1], idx:-1, x:xy[0], y:xy[1], t1:T + (k === 'tap' ? 0.1 : a[2]), down:false }; }
  else if (k === 'chip'){ xy = targetXY('chip', a[1]); H.g = { kind:'press', name:'chip', idx:a[1], x:xy[0], y:xy[1], t1:T + 0.1, down:false }; }
  else if (k === 'swipe'){ var x0 = a[1] < 0 ? 240 : 150; H.g = { kind:'drag', x0:x0, y0:330, x1:x0 + (a[1] < 0 ? -90 : 90), y1:330, t0:T, dur:0.3, down:false }; }
  else if (k === 'pull'){ H.g = { kind:'drag', x0:195, y0:530, x1:195, y1:530 + a[1], t0:T, dur:0.5, down:false }; }
  else if (k === 'type'){ typeIn.value = a[1]; typeSubmit(); }
}
function renderGhost(){
  if (!HARNESS){ return; }
  st(ghostEl, tf(GHOST.x, GHOST.y, GHOST.p ? 0.84 : 1), GHOST.v * 0.95);
  sc(ghostEl, 'background', GHOST.p ? 'rgba(242,237,228,.12)' : 'transparent');
}
function togglePause(){ paused = !paused; st($('pauseTag'), null, paused ? 1 : 0); }
/* fonts and companion mattes settle before a scripted run starts, so text layout and textures never race the seek */
function harnessPrepare(){
  H.name = Q.script || ''; H.script = SCRIPTS[H.name] || null;
  var fonts = [];
  try { ['400 26px "Instrument Serif"', '400 40px "Instrument Serif"', '400 15px Geist', '500 15px Geist', '600 16px Geist', '500 11px "Geist Mono"', '400 10px "Geist Mono"'].forEach(function(f){ fonts.push(document.fonts.load(f)); }); } catch(e){}
  var timeout = new Promise(function(res){ setTimeout(res, 4000); });
  var mattes = loadRoster().then(function(){
    return new Promise(function(res){ var t0 = Date.now(); (function poll(){ if (MATTE_PENDING <= 0 || Date.now() - t0 > 4000) res(); else setTimeout(poll, 30); })(); });
  }, noop);
  return Promise.race([Promise.all(fonts.concat([mattes])), timeout]).then(function(){ capEls.forEach(function(c){ c._h = 0; }); wmEl._w = 0; });
}
function flush(){ var p = Promise.resolve(); for (var i = 0; i < 12; i++) p = p.then(noop); return p; }
/* replay to t in fixed steps; bridge replies (microtasks) are flushed after every step */
function runTo(t){
  SEEKING = true;
  return new Promise(function(done){
    (function chunk(){
      var n = 0;
      (function loop(){
        if (T + STEP > t + 1e-9 || n > 240){ if (T + STEP > t + 1e-9){ SEEKING = false; renderAll(); done(T); } else setTimeout(chunk, 0); return; }
        sim(STEP); n++;
        flush().then(loop);
      })();
    })();
  });
}
/* FNV-1a over the GL pixels, the snow canvas and every VISIBLE stage element's transform/opacity/filter/text
   (an element at opacity 0 keeps whatever transform it last had; it is not part of the frame) */
function hashFrame(parts){
  renderAll();
  var h = 2166136261 >>> 0, hg = 0;
  function mix(v){ h ^= v & 255; h = Math.imul(h, 16777619) >>> 0; }
  function mixS(s){ for (var i = 0; i < s.length; i++) mix(s.charCodeAt(i)); }
  if (gl){ var w = cv.width, hh = cv.height, px = new Uint8Array(w * hh * 4); gl.readPixels(0, 0, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, px); for (var i = 0; i < px.length; i += 16) mix(px[i] ^ (px[i + 1] << 1) ^ (px[i + 2] << 2) ^ px[i + 3]); }
  if (snowCv._drawn){ try { var sd = snowX.getImageData(0, 0, snowCv.width, snowCv.height).data; for (var q = 3; q < sd.length; q += 64) mix(sd[q]); } catch(e){} }
  hg = h; h = 2166136261 >>> 0;
  (function walk(el){
    for (var c = el.firstElementChild; c; c = c.nextElementSibling){
      var s = c.style; if (!s) continue;
      if (s.opacity === '0' || s.visibility === 'hidden' || s.display === 'none' || c.getAttribute('opacity') === '0') continue;   /* SVG groups hide by attribute */
      mixS((c.id || c.tagName) + '|' + s.transform + '|' + s.opacity + '|' + s.filter + '|' + (s.clipPath || '') + '|' + (c.firstElementChild ? '' : c.textContent));
      walk(c);
    }
  })(stage);
  var g = ('00000000' + hg.toString(16)).slice(-8), d = ('00000000' + h.toString(16)).slice(-8);
  return parts ? { gl:g, dom:d } : g + d;
}
