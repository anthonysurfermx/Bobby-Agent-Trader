/* =====================================================================
   12. Input is real (§3.1): pointer events drive the pill hold, the pull,
   the card track, the face drag and chips. A state's down() returns a
   gesture {move, up, cancel}; the gesture outlives state changes.
   The harness drives the SAME entry points with a scripted finger.
   ===================================================================== */
var PTR = { id: null, x: 0, y: 0, x0: 0, y0: 0, t0: 0, hist: [], g: null, moved: false, hitEl: null };
function nowT(){ return HARNESS ? clk : performance.now() / 1000; }
function toStage(cx, cy){ return [(cx - fitX) / (fitS || 1), (cy - fitY) / (fitS || 1)]; }
function hitOf(node){ var h = node && node.closest ? node.closest('[data-hit]') : null; return h && stage.contains(h) ? h : null; }
function inDown(x, y, hitEl){
  if (PTR.g) inCancel();
  PTR.x = PTR.x0 = x; PTR.y = PTR.y0 = y; PTR.t0 = nowT(); PTR.hist = [[PTR.t0, x, y]]; PTR.moved = false; PTR.hitEl = hitEl;
  var h = hitEl ? hitEl.getAttribute('data-hit') : 'surface', s = STATES[ST.name];
  PTR.g = null;
  if (!S) return;
  try { PTR.g = s && s.down ? (s.down(h, PTR, hitEl) || null) : null; } catch (e) { logErr('down', e); }
  dirty = true;
}
function inMove(x, y){
  PTR.x = x; PTR.y = y;
  var t = nowT(); PTR.hist.push([t, x, y]);
  while (PTR.hist.length > 2 && t - PTR.hist[0][0] > 0.1) PTR.hist.shift();
  if (!PTR.moved && Math.hypot(x - PTR.x0, y - PTR.y0) > 8) PTR.moved = true;
  if (PTR.g && PTR.g.move){ try { PTR.g.move(PTR); } catch (e) { logErr('move', e); } }
}
function inUp(x, y){
  if (x != null) inMove(x, y);
  var g = PTR.g; PTR.g = null;
  if (g && g.up){ try { g.up(PTR); } catch (e) { logErr('up', e); } }
  dirty = true;
}
function inCancel(){ var g = PTR.g; PTR.g = null; if (g){ try { (g.cancel || g.up || noop)(PTR); } catch (e) { logErr('cancel', e); } } }
/* release velocity from the last ~100 ms of samples (px/s) */
function vel(){ var h = PTR.hist; if (h.length < 2) return [0, 0]; var a = h[0], b = h[h.length - 1], dt = Math.max(0.008, b[0] - a[0]); return [(b[1] - a[1]) / dt, (b[2] - a[2]) / dt]; }
/* every tappable presses to .96 (the pill .94) on snap and releases on emit */
function tapG(onTap, pressV){
  if (pressV) pressV.to(pressV === A.press ? 0.94 : 0.96, 'snap');
  return {
    move: function(p){ if (p.moved && pressV) pressV.to(1, 'emit'); },
    up: function(p){ if (pressV) pressV.to(1, 'emit'); if (!p.moved) onTap(p); },
    cancel: function(){ if (pressV) pressV.to(1, 'emit'); }
  };
}

/* ---- real pointers: one at a time, captured on the stage ---- */
var LIGHT = { x: 0, y: 0, tx: 0, ty: 0 };
var SCRIPTED = false;   /* true while a harness script owns the finger */
stage.addEventListener('pointerdown', function(e){
  if (e.isPrimary === false) return;
  if (SCRIPTED){ harnessTapToggle(e); return; }
  if (PTR.id != null) return;
  PTR.id = e.pointerId; PTR.realT = performance.now();
  try { stage.setPointerCapture(e.pointerId); } catch (x) {}
  var p = toStage(e.clientX, e.clientY);
  inDown(p[0], p[1], hitOf(e.target));
  if (e.cancelable && e.target && e.target.tagName !== 'TEXTAREA') e.preventDefault();
});
stage.addEventListener('pointermove', function(e){
  var p = toStage(e.clientX, e.clientY);
  if (!RM){ LIGHT.tx = clamp((p[0] - 195) / 195 * 0.06, -0.06, 0.06); LIGHT.ty = clamp(-(p[1] - 340) / 340 * 0.06, -0.06, 0.06); }
  if (e.pointerId !== PTR.id) return;
  inMove(p[0], p[1]);
});
stage.addEventListener('pointerup', function(e){ if (e.pointerId !== PTR.id) return; PTR.id = null; var p = toStage(e.clientX, e.clientY); inUp(p[0], p[1]); });
stage.addEventListener('pointercancel', function(e){ if (e.pointerId !== PTR.id) return; PTR.id = null; inCancel(); });
stage.addEventListener('lostpointercapture', function(e){ if (e.pointerId === PTR.id){ PTR.id = null; inCancel(); } });
stage.addEventListener('pointerleave', function(){ LIGHT.tx = 0; LIGHT.ty = 0; });
/* keyboard, switch control and VoiceOver: a click that no real pointer-down preceded is an activation,
   delivered as a tap at the control's centre (a real finger's click is already handled by the gesture) */
stage.addEventListener('click', function(e){
  if (SCRIPTED || (PTR.realT && performance.now() - PTR.realT < 800)) return;
  var h = hitOf(e.target); if (!h) return;
  var r = h.getBoundingClientRect(), p = toStage(r.left + r.width / 2, r.top + r.height / 2);
  inDown(p[0], p[1], h); inUp(p[0], p[1]);   /* the pill: an instant tap = the typing path */
});
/* iOS ignores user-scalable=no: block pinch and double-tap zoom explicitly */
try {
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function(t){ D.addEventListener(t, function(e){ e.preventDefault(); }, { passive: false }); });
  D.addEventListener('dblclick', function(e){ e.preventDefault(); }, { passive: false });
  if (HARNESS) D.addEventListener('touchmove', function(e){ if (e.cancelable) e.preventDefault(); }, { passive: false });
} catch (e) {}

/* =====================================================================
   13. Typing: a real <textarea> outside the scaled stage, lifted above the
   keyboard with visualViewport; committed through the word-birth + bead.
   ===================================================================== */
var TB = { shown: false, h: 50 };
function showTypeBox(on){
  TB.shown = on;
  el.typeBox.style.visibility = on ? 'visible' : 'hidden';
  if (on){ placeTypeBox(); }
}
function focusTa(){ try { el.typeBox.style.visibility = 'visible'; el.ta.focus({ preventScroll: true }); } catch (e) { try { el.ta.focus(); } catch (x) {} } }
function taAutosize(){
  el.ta.style.height = 'auto';
  var h = el.ta.value ? Math.min(116, Math.max(50, el.ta.scrollHeight || 50)) : 50; el.ta.style.height = h + 'px'; TB.h = h;
  el.taSend.disabled = !el.ta.value.trim();
}
function placeTypeBox(){
  if (!el.typeBox) return;
  var s = fitS || 1, vv = W.visualViewport, bottom = vv ? vv.offsetTop + vv.height : W.innerHeight;
  var w = 350 * s, left = fitX + 20 * s, fs = Math.max(16, 17 * s);
  var pillTop = fitY + 742 * s, rest = Math.min(pillTop + 56 * s - TB.h, bottom - TB.h - 12);
  var p = A ? clamp(A.type.p.x, 0, 1.2) : 1, y = lerp(pillTop + 8 * s, rest, p);
  st(el.typeBox, 'width', Math.round(w) + 'px'); st(el.typeBox, 'left', Math.round(left) + 'px'); st(el.typeBox, 'top', Math.round(y) + 'px');
  st(el.ta, 'fontSize', fs.toFixed(1) + 'px');
  if (A) st(el.typeBox, 'opacity', String(Math.round(clamp(A.type.o.x, 0, 1) * 1000) / 1000));
}
el.ta.addEventListener('keydown', function(e){
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing){ e.preventDefault(); if (ST.name === 'TYPING') STATES.TYPING.send(); }
  else if (e.key === 'Escape'){ e.preventDefault(); if (ST.name === 'TYPING'){ el.ta.value = ''; STATES.TYPING.cancel(); } }
});
el.ta.addEventListener('input', taAutosize);
el.ta.addEventListener('blur', function(){ setTimeout(function(){ if (ST.name === 'TYPING' && !el.ta.value.trim() && D.activeElement !== el.ta) STATES.TYPING.cancel(); }, 180); });
el.taSend.addEventListener('pointerdown', function(e){ e.preventDefault(); });
el.taSend.addEventListener('click', function(){ if (ST.name === 'TYPING') STATES.TYPING.send(); });
try { if (W.visualViewport){ W.visualViewport.addEventListener('resize', placeTypeBox); W.visualViewport.addEventListener('scroll', placeTypeBox); } } catch (e) {}
