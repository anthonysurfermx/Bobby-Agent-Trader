
/* ============================================================
   Input is real. Pointer events (and, under ?harness=1 only, the
   scripted ghost finger) call the same handlers: the pill hold,
   the pull (rubber band, commit at 72 px or
   500 px/s), the card track and chips. Velocity comes from a
   ~100 ms pointer history.
   ============================================================ */
var PTR = null, PTR_ID = null;
function nowS(){ return HARNESS ? T : performance.now() / 1000; }
function toStage(cx, cy){ return [(cx - FIT_X) / FIT, (cy - FIT_Y) / FIT]; }
function velocityOf(P){
  var h = P.hist, n = h.length; if (n < 2) return [0, 0];
  var t1 = h[n - 1][0], j = n - 1; while (j > 0 && t1 - h[j - 1][0] <= 0.1) j--;
  var dt = t1 - h[j][0]; if (dt < 0.008) return [0, 0];
  return [(h[n - 1][1] - h[j][1]) / dt, (h[n - 1][2] - h[j][2]) / dt];
}
function inDebate(x, y){ var ti = CARDS.indexOf(cardD); return ti >= 0 && Math.round(W.track.x) === ti && y > 286 && y < 610 && DSCROLL.max > 2; }
function riskScrollMax(){ return rbodyEl ? Math.max(0, rbodyEl.scrollHeight - rbodyEl.clientHeight) : 0; }
function inRiskBody(x, y){ return W.state === 'RISK' && isOn('lines') && RISK_LAYOUT && x >= 30 && x <= 360 && y >= RISK_LAYOUT.body && y <= RISK_LAYOUT.body + RISK_LAYOUT.bodyHeight && riskScrollMax() > 0; }
function scrollRisk(y){ if (rbodyEl) rbodyEl.scrollTop = clamp(y, 0, riskScrollMax()); }
function inDown(hit, idx, x, y){
  if (PTR) return;
  PTR = { hit:hit, idx:idx, x0:x, y0:y, x:x, y:y, kind:null, hist:[[nowS(), x, y]], moved:false };
  var s = W.state;
  if (hit === 'pill'){ W.pr.pill = [T, 1e9]; pillDown(); return; }
  if (!hit && inRiskBody(x, y)){ PTR.kind = 'risk-scroll'; PTR.scroll0 = rbodyEl.scrollTop; return; }
  if (hit){ W.pr[hit === 'chip' ? 'chip' + idx : hit] = [T, 1e9]; return; }
  if (s === 'HANDBACK' && y > 98 && y < 736) PTR.kind = 'pull?';
  else if (s === 'CARDS') PTR.kind = inDebate(x, y) ? 'card?' : 'track?';
}
function inMove(x, y){
  var P = PTR; if (!P) return;
  P.x = x; P.y = y; P.hist.push([nowS(), x, y]); if (P.hist.length > 16) P.hist.shift();
  var dx = x - P.x0, dy = y - P.y0, ad = Math.max(Math.abs(dx), Math.abs(dy));
  if (ad > 8) P.moved = true;
  if (P.hit === 'pill' && W.press && Math.hypot(dx, dy) > 32){ if (W.pr.pill) W.pr.pill[1] = T; askRelease(true); }
  if (P.kind === 'pull?' && ad > 6){
    if (dy > Math.abs(dx) && pullStart(P.y0)) P.kind = 'pull'; else P.kind = null;
  } else if ((P.kind === 'card?' || P.kind === 'track?') && ad > 6){
    if (Math.abs(dx) >= Math.abs(dy)){ P.kind = 'track'; W.drag = { kind:'track', x0:P.x0, x:x, tr0:W.track.x }; }
    else if (P.kind === 'card?'){ P.kind = 'scroll'; W.drag = { kind:'scroll', y0:P.y0, y:y, s0:DSCROLL.y }; }
    else P.kind = null;
  }
  if (P.kind === 'track' && W.drag) W.drag.x = x;
  else if (P.kind === 'scroll' && W.drag) W.drag.y = y;
  else if (P.kind === 'risk-scroll' && W.state === 'RISK') scrollRisk(P.scroll0 - dy);
  else if (P.kind === 'pull') W.pullY = y;
}
function inUp(x, y, upHit, cancelled){
  var P = PTR; if (!P) return; PTR = null;
  if (x != null){ P.x = x; P.y = y; P.hist.push([nowS(), x, y]); }
  var v = velocityOf(P);
  if (P.hit === 'pill'){ if (W.pr.pill) W.pr.pill[1] = T; pillUp(cancelled); return; }
  if (P.hit){
    var k = P.hit === 'chip' ? 'chip' + P.idx : P.hit; if (W.pr[k]) W.pr[k][1] = T;
    if (!cancelled && (upHit == null || upHit === P.hit)) action(P.hit, P.idx);
    return;
  }
  if (P.kind === 'pull'){ pullEnd(cancelled ? 0 : v[1]); return; }
  if (P.kind === 'track'){
    var d2 = W.drag; W.drag = null; if (!d2) return;
    var dx2 = P.x - P.x0, k1 = Math.round(d2.tr0), commit2 = !cancelled && (Math.abs(dx2) > 40 || Math.abs(v[0]) > 300);
    var kt = clamp(commit2 ? k1 + (dx2 < 0 ? 1 : -1) : k1, 0, Math.max(0, CARDS.length - 1));
    W.track.v = clamp(-v[0] / 340, -6, 6); to(W.track, kt, 'glide'); if (kt !== k1) buzz('selection', 0.3);
    return;
  }
  if (P.kind === 'scroll'){ W.drag = null; }
}
/* the pill: hold to ask, hold to agree, tap to cancel / skip / open the read */
function pillDown(){
  var s = W.state;
  W.pressFrom = s;                                  /* what this press began as: its release belongs to that gesture */
  if (askCapable()) askPress();
  else if (s === 'RISK') agreePress();
}
function pillUp(cancelled){
  /* a hold to agree that outlives the ring may already have started the first read (RESOLVING):
     its release only ends the agree gesture, it never cancels that read */
  if (W.pressFrom === 'RISK'){ W.pressFrom = null; agreeRelease(); return; }
  W.pressFrom = null;
  var s = W.state;
  if (W.press){ askRelease(cancelled); return; }   /* a cancelled pointer discards dictation */
  if (s === 'RISK'){ agreeRelease(); return; }
  if (cancelled) return;
  if (s === 'RESOLVING' || s === 'THINK_WAIT'){ fire('cancel', {}); buzz('light', 0.4); }
  else if (s === 'TALK_EVIDENCE' || s === 'TALK_CHART' || s === 'VERDICT') skipTalk();
  else if (s === 'HANDBACK'){ pullCommit(); go('CARDS'); }
}
function action(hit, idx){
  var s = W.state;
  if (hit === 'chip'){ if (s === 'ASK_TEACH' || s === 'ERROR') chipTap(idx); }
  else if (hit === 'perm') permContinue();
  else if (hit === 'notice'){ if (s === 'RISK' && isOn('notice')){ buzz('light', 0.3); fire('openNative', { route:'riskNotice' }); } }
  else if (hit === 'profile'){ if (s === 'RISK' && !W.agreeBusy){ agreeRelease(); buzz('light', 0.3); fire('openNative', { route:'account' }); } }
  else if (hit === 'save') saveTap();
  else if (hit === 'close'){ if (closeActive()) closeTap(); }
  else if (hit === 'apple') appleTap();
  else if (hit === 'notnow') notNowTap();
}

/* ---------- DOM wiring (the harness replaces real pointers with the ghost; a real tap then only pauses) ---------- */
function hitOf(t){ var el = t && t.closest ? t.closest('[data-hit]') : null; return el ? [el.getAttribute('data-hit'), +(el.getAttribute('data-i') || -1)] : [null, -1]; }
function inTypeBox(t){ return !!(t && t.closest && t.closest('#typeBox')); }
var HP = null;   /* harness: a real tap (< 8 px) toggles pause */
var PTR_CAPTURE = null;
function releasePointer(){ var el = PTR_CAPTURE, id = PTR_ID; PTR_CAPTURE = null; PTR_ID = null; if (el && el.releasePointerCapture) try { el.releasePointerCapture(id); } catch(e){} }
window.addEventListener('pointerdown', function(e){
  if (inTypeBox(e.target) || e.isPrimary === false || e.button != null && e.button !== 0) return;
  if (HARNESS){ HP = { id:e.pointerId, x:e.clientX, y:e.clientY }; return; }
  if (PTR_ID != null) return;
  PTR_ID = e.pointerId;
  var h = hitOf(e.target), p = toStage(e.clientX, e.clientY);
  if (h[0] === 'pill'){
    if (e.cancelable) e.preventDefault();
    PTR_CAPTURE = pill; try { pill.setPointerCapture(e.pointerId); } catch(e){}
  }
  inDown(h[0], h[1], p[0], p[1]);
}, { passive:false });
window.addEventListener('pointermove', function(e){ if (HARNESS || e.pointerId !== PTR_ID) return; if (PTR && PTR.hit === 'pill' && e.cancelable) e.preventDefault(); var p = toStage(e.clientX, e.clientY); inMove(p[0], p[1]); }, { passive:false });
window.addEventListener('pointerup', function(e){
  if (HARNESS){ if (HP && HP.id === e.pointerId){ var dx = e.clientX - HP.x, dy = e.clientY - HP.y; HP = null; if (dx * dx + dy * dy < 64) togglePause(); } return; }
  if (e.pointerId !== PTR_ID) return; releasePointer(); PTR_ID = null;
  var p = toStage(e.clientX, e.clientY), h = hitOf(document.elementFromPoint(e.clientX, e.clientY));
  inUp(p[0], p[1], h[0], false);
}, { passive:true });
window.addEventListener('pointercancel', function(e){ if (HARNESS){ HP = null; return; } if (e.pointerId !== PTR_ID) return; releasePointer(); PTR_ID = null; inUp(null, null, null, true); }, { passive:true });
window.addEventListener('lostpointercapture', function(e){ if (e.pointerId !== PTR_ID) return; PTR_CAPTURE = null; PTR_ID = null; inUp(null, null, null, true); });
document.addEventListener('contextmenu', function(e){ if (hitOf(e.target)[0] === 'pill') e.preventDefault(); });
if (!window.PointerEvent){
  function touchOf(e){ var list = e.changedTouches || []; for (var i = 0; i < list.length; i++) if (list[i].identifier === PTR_ID) return list[i]; return null; }
  window.addEventListener('touchstart', function(e){
    if (HARNESS || inTypeBox(e.target) || PTR_ID != null || !e.changedTouches || !e.changedTouches.length) return;
    var t = e.changedTouches[0], h = hitOf(e.target), p = toStage(t.clientX, t.clientY); PTR_ID = t.identifier;
    inDown(h[0], h[1], p[0], p[1]); if (e.cancelable) e.preventDefault();
  }, { passive:false });
  window.addEventListener('touchmove', function(e){ var t = touchOf(e); if (!t) return; if (e.cancelable) e.preventDefault(); var p = toStage(t.clientX, t.clientY); inMove(p[0], p[1]); }, { passive:false });
  window.addEventListener('touchend', function(e){ var t = touchOf(e); if (!t) return; PTR_ID = null; if (e.cancelable) e.preventDefault(); var p = toStage(t.clientX, t.clientY), h = hitOf(document.elementFromPoint(t.clientX, t.clientY)); inUp(p[0], p[1], h[0], false); }, { passive:false });
  window.addEventListener('touchcancel', function(e){ if (!touchOf(e)) return; PTR_ID = null; inUp(null, null, null, true); }, { passive:false });
}
/* VoiceOver / keyboard activation arrives as a click with detail 0: a tap on the same handlers */
document.addEventListener('click', function(e){
  if (e.detail !== 0 || HARNESS || inTypeBox(e.target)) return;
  var h = hitOf(e.target); if (!h[0]) return;
  if (h[0] === 'pill' && W.state === 'RISK'){
    if (W.agreeReady && !W.agreeBusy && RISK_NOTICE) agreeComplete();
  }
  else if (h[0] === 'pill'){ W.pr.pill = [T, T + 0.1]; pillDown(); pillUp(false); }
  else action(h[0], h[1]);
});
// The scaled stage disables touch scrolling; keep the complete consent copy scrollable by pointer,
// keyboard and trackpad without routing any of these gestures through the hold-to-agree button.
document.addEventListener('keydown', function(e){
  if (e.target !== rbodyEl || W.state !== 'RISK') return;
  var y = rbodyEl.scrollTop, page = rbodyEl.clientHeight * 0.8;
  if (e.key === 'ArrowDown') y += 18;
  else if (e.key === 'ArrowUp') y -= 18;
  else if (e.key === 'PageDown' || e.key === ' ') y += page;
  else if (e.key === 'PageUp') y -= page;
  else if (e.key === 'Home') y = 0;
  else if (e.key === 'End') y = riskScrollMax();
  else return;
  e.preventDefault(); scrollRisk(y);
});
window.addEventListener('wheel', function(e){
  var p = toStage(e.clientX, e.clientY);
  if (inRiskBody(p[0], p[1])) scrollRisk(rbodyEl.scrollTop + e.deltaY / FIT);
}, { passive:true });
['gesturestart', 'gesturechange', 'dblclick'].forEach(function(k){ document.addEventListener(k, function(e){ e.preventDefault(); }, { passive:false }); });
if (HARNESS) document.addEventListener('touchmove', function(e){ if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive:false });

/* ---------- typing: a real textarea outside the scaled stage, lifted with visualViewport ---------- */
var typeBox = $('typeBox'), typeIn = $('typeIn'), typeSend = $('typeSend');
function showTypeBox(on){
  if (on){ if (!typeBox.classList.contains('on')){ typeBox.classList.add('on'); tb('typing'); tb('pillHide'); } typeSend.disabled = !String(typeIn.value || '').trim(); focusType(); }
  else if (typeBox.classList.contains('on')){ typeBox.classList.remove('on'); tg('typing'); if (isOn('pillHide')) tg('pillHide'); }
}
function focusType(){ try { typeIn.focus({ preventScroll:true }); } catch(e){ try { typeIn.focus(); } catch(x){} } }
typeIn.addEventListener('keydown', function(e){ if (e.key === 'Enter' && !e.shiftKey && !e.isComposing){ e.preventDefault(); typeSubmit(); } else if (e.key === 'Escape'){ e.preventDefault(); typeCancel(); } });
typeIn.addEventListener('input', function(){ typeSend.disabled = !String(typeIn.value || '').trim(); typeIn.style.height = 'auto'; typeIn.style.height = Math.min(120, typeIn.scrollHeight) + 'px'; });
typeSend.addEventListener('pointerdown', function(e){ e.preventDefault(); });   /* keep the keyboard up */
typeSend.addEventListener('click', function(){ typeSubmit(); });
typeIn.addEventListener('blur', function(){ setTimeout(function(){ if (W.state === 'TYPING' && document.activeElement !== typeIn) typeCancel(); }, 180); });
function renderTyping(){
  if (!typeBox.classList.contains('on')) return;
  var vv = window.visualViewport, vb = vv ? vv.offsetTop + vv.height : window.innerHeight;
  var pillBottom = FIT_Y + 798 * FIT, bottom = Math.min(pillBottom, vb - 12), h = typeBox.offsetHeight || 56;
  var p = TR ? sp('emit', T - tmB('typing')) : c01((T - tmB('typing')) / 0.2);
  sc(typeBox, 'top', f1(bottom - h) + 'px');
  sc(typeBox, 'transform', 'translateY(' + f1(20 * (1 - p)) + 'px)'); sc(typeBox, 'opacity', f3(c01(p * 1.4)));
  var side = Math.max(16, FIT_X + 16); sc(typeBox, 'left', f1(side) + 'px'); sc(typeBox, 'right', f1(side) + 'px');
}
