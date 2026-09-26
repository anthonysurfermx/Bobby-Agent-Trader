/* Núcleo WEB transport, part 6: sheets over the stage (openNative, ARCHITECTURE.md §2.3).
 *
 * Native presents RiskNoticeView(readOnly) and AccountSheet as sheets over the web view and
 * emits native.sheet open/closed; the page pauses rendering meanwhile. The web has no native
 * views, so the routes that must stay on this page are drawn here, from the same data:
 *   riskNotice → the four statements of the accepted notice (the riskNotice() data, never retyped)
 *   squad      → the roster and its unlock state; choosing commits like setCompanion
 *   account    → where this browser keeps the progress, and the privacy policy (no web accounts yet)
 * Isla navigates to the site's Trader Land page (see 90-install).
 */
(function () {
  'use strict';
  var NW = window.__nucleoWeb;
  if (!NW) return;
  var S = NW.state;
  var SH = NW.sheets = {};
  var open = null;

  var CSS = '#nwSheet{position:fixed;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center;background:rgba(5,4,3,.72);' +
    '-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);touch-action:pan-y;-webkit-user-select:text;user-select:text;opacity:0;transition:opacity .22s ease}' +
    '#nwSheet.on{opacity:1}' +
    '#nwSheet .p{position:relative;width:100%;max-width:430px;max-height:88%;overflow:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;' +
    'background:#161311;color:#F2EDE4;border:.5px solid rgba(242,237,228,.12);border-bottom:0;border-radius:24px 24px 0 0;' +
    'padding:26px 22px calc(26px + env(safe-area-inset-bottom,0px));font:400 15px/22px Geist,-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;' +
    'transform:translateY(24px);transition:transform .28s cubic-bezier(.2,.8,.2,1)}' +
    '#nwSheet.on .p{transform:none}' +
    '@media (min-width:600px) and (min-height:560px){#nwSheet{align-items:center}#nwSheet .p{border-radius:24px;border-bottom:.5px solid rgba(242,237,228,.12);padding-bottom:26px}}' +
    '#nwSheet h2{font:400 26px/31px "Instrument Serif","Iowan Old Style",Georgia,serif;letter-spacing:-.005em;margin:0 44px 14px 0}' +
    '#nwSheet h3{font:600 15px/21px Geist,-apple-system,system-ui,sans-serif;margin:16px 0 4px}' +
    '#nwSheet p{margin:0;color:#A39C91}' +
    '#nwSheet a{color:#F2EDE4;text-decoration:underline;text-underline-offset:3px}' +
    '#nwSheet .x{position:absolute;right:10px;top:10px;width:44px;height:44px;border-radius:22px;border:0;background:none;color:#A39C91;cursor:pointer;display:grid;place-items:center}' +
    '#nwSheet .x:focus-visible{outline:1.5px solid rgba(242,237,228,.5);outline-offset:-8px}' +
    '#nwSheet a:focus-visible,#nwSheet button:not(.x):focus-visible{outline:2px solid #F2EDE4;outline-offset:3px;border-radius:12px}' +
    '@media (prefers-reduced-motion:reduce){#nwSheet,#nwSheet .p{transition:none}}';

  function el(tag, text, cls) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  /** Renders `fill(panel)` in a modal sheet; false if one is already open. */
  function present(route, label, fill) {
    if (open) return false;
    if (NW.speech) NW.speech.cancel();
    if (NW.voice) NW.voice.stop('stopped');
    if (!document.getElementById('nwSheetCss')) { var st = el('style'); st.id = 'nwSheetCss'; st.textContent = CSS; document.head.appendChild(st); }
    var root = el('div'), panel = el('div', null, 'p'), close = el('button', null, 'x');
    root.id = 'nwSheet';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', label);
    close.type = 'button'; close.setAttribute('aria-label', NW.t('Close', 'Cerrar'));
    close.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2 L12 12 M12 2 L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    panel.appendChild(close);
    fill(panel);
    root.appendChild(panel);
    // The engines read pointers on window/stage: nothing inside the sheet may reach them.
    ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click', 'touchstart', 'touchmove', 'touchend', 'wheel'].forEach(function (t) {
      root.addEventListener(t, function (e) { e.stopPropagation(); }, { passive: true });
    });
    var prevFocus = document.activeElement;
    function dismiss() {
      if (!open || open.root !== root) return;
      open = null;
      document.removeEventListener('keydown', onKey, true);
      root.classList.remove('on');
      setTimeout(function () { if (root.parentNode) root.parentNode.removeChild(root); }, 240);
      try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (e) {}
      NW.emit('native.sheet', { route: route, state: 'closed' });
      if (NW.emitSession) NW.emitSession();
    }
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); dismiss(); } }
    close.addEventListener('click', dismiss);
    root.addEventListener('click', function (e) { if (e.target === root) dismiss(); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(root);
    open = { root: root, route: route, dismiss: dismiss };
    requestAnimationFrame(function () { root.classList.add('on'); try { close.focus({ preventScroll: true }); } catch (e) {} });
    NW.emit('native.sheet', { route: route, state: 'open' });
    return true;
  }

  SH.isOpen = function () { return !!open; };
  SH.close = function () { if (open) open.dismiss(); };

  SH.riskNotice = function () {
    var n = NW.cfg.riskNotice, list = n.statements[NW.lang] || n.statements.en;
    return present('riskNotice', NW.t('Risk notice', 'Aviso de riesgo'), function (panel) {
      panel.appendChild(el('h2', NW.t('Risk notice', 'Aviso de riesgo')));
      list.forEach(function (s) { panel.appendChild(el('h3', s.title)); panel.appendChild(el('p', s.body)); });
    });
  };

  /**
   * squad → the roster with its real unlock state; an unlocked face commits like setCompanion.
   * (The site's /squad page is a 3D showcase that cannot change the Núcleo's companion.)
   */
  SH.squad = function () {
    var art = {};
    try { JSON.parse(document.getElementById('companions').textContent).forEach(function (c) { art[c.id] = c; }); } catch (e) {}
    return present('squad', NW.t('Squad', 'Escuadrón'), function (panel) {
      var prof = S.profile(), xp = S.progress().xp;
      panel.appendChild(el('h2', NW.t('Squad', 'Escuadrón')));
      var grid = el('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:14px 8px;margin-top:6px';
      NW.cfg.companions.forEach(function (c) {
        var open = S.isUnlocked(c, xp) || prof.companionId === c.id, mine = prof.companionId === c.id;
        var name = c.label.charAt(0) + c.label.slice(1).toLowerCase();
        var b = el('button');
        b.type = 'button'; b.disabled = !open;
        b.setAttribute('aria-pressed', mine ? 'true' : 'false');
        b.setAttribute('aria-label', name + (open ? '' : ' · ' + NW.t('Level', 'Nivel') + ' ' + c.requiredLevel));
        b.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;border:0;background:none;color:inherit;font:inherit;cursor:' + (open ? 'pointer' : 'default') + ';opacity:' + (open ? 1 : 0.38) + ';padding:4px';
        var ph = el('span');
        ph.style.cssText = 'width:60px;height:60px;border-radius:50%;overflow:hidden;background:#232120;box-shadow:0 0 0 ' + (mine ? '2px #F2EDE4' : '.5px rgba(242,237,228,.2)');
        var a = art[c.webId];
        if (a && a.dataUri) { var im = el('img'); im.alt = ''; im.src = a.dataUri; im.style.cssText = 'width:118%;height:118%;margin:-4% 0 0 -9%;display:block'; ph.appendChild(im); }
        b.appendChild(ph);
        var lb = el('span', open ? name : name + ' · ' + NW.t('Lv', 'Nv') + ' ' + c.requiredLevel);
        lb.style.cssText = 'font:500 13px/16px Geist,-apple-system,system-ui,sans-serif;color:' + (mine ? '#F2EDE4' : '#A39C91');
        b.appendChild(lb);
        if (open && !mine) b.addEventListener('click', function () { if (NW.commitCompanion) NW.commitCompanion(c.id); SH.close(); });
        grid.appendChild(b);
      });
      panel.appendChild(grid);
    });
  };

  SH.account = function () {
    return present('account', NW.t('Your progress', 'Tu progreso'), function (panel) {
      var prof = S.profile(), prog = S.progress(), lvl = S.levelJSON(prog.xp), c = prof.companionId ? S.companion(prof.companionId) : null;
      panel.appendChild(el('h2', NW.t('Your progress', 'Tu progreso')));
      if (c) {
        var name = c.label.charAt(0) + c.label.slice(1).toLowerCase();
        panel.appendChild(el('h3', name + ' · ' + NW.t('Level', 'Nivel') + ' ' + lvl.number + ' · ' + prog.xp + ' XP'));
      }
      panel.appendChild(el('p', NW.t('Your companion, XP and saved theses live in this browser. Signing in is not available on the web.',
        'Tu compañero, tu XP y tus tesis guardadas viven en este navegador. En la web no se puede iniciar sesión.')));
      var pp = el('p'); pp.style.marginTop = '16px';
      var a = el('a', NW.t('Privacy Policy', 'Aviso de privacidad')); a.href = NW.ROUTES.privacy;
      pp.appendChild(a); panel.appendChild(pp);
    });
  };
})();
