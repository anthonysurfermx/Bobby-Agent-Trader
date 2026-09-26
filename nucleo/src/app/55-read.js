/* =====================================================================
   10. Bridge wrapper, live inputs, the read and everything built from it
   ===================================================================== */
var SES = null;           /* the last Session */
var CALLS = 0;            /* outstanding bridge calls (the harness flushes microtasks while any are pending) */
function bcall(method, params){
  if (!BR) return Promise.reject(new Error('no bridge'));
  CALLS++;
  return BR.call(method, params || {}).then(function(r){ CALLS--; return r; }, function(e){ CALLS--; throw e; });
}
var SPEECH = { lvl: 0, at: -9 };
/* the voice of the current read: events are matched on the speak id (= requestId) */
var VOICE = { id: null, lvl: 0, at: -9, started: false, ended: true, silent: false, speakT: 1e9, reqT: 1e9, lat: 0.6, engine: null };

/* ---- the karaoke clock: one timeline for captions, the verdict sync and the silent envelope ----
   voice.word (device engine) hard-syncs word starts; voice.progress (neural) retimes and nudges;
   otherwise the 2.6 words/s reading clock of NucleoReadModel.wordTimes runs it. */
var K = { on: false, t: 0, text: '', wt: [], syl: [], end: 0, mode: 'read', dur: null };
function kInit(text){ K.text = text; K.on = false; K.t = 0; K.mode = 'read'; K.dur = null; kRetime(null); }
function kRetime(dur){ K.wt = RMOD.wordTimes(K.text, dur); K.dur = dur; kSyl(); }
function kSyl(){
  var out = [];
  for (var i = 0; i < K.wt.length; i++){ var w = K.wt[i], n = RMOD.syllables(w.word), d = w.t1 - w.t0; for (var k = 0; k < n; k++) out.push(w.t0 + d * (k + 0.35) / n); }
  K.syl = out; K.end = K.wt.length ? K.wt[K.wt.length - 1].t1 : 0;
}
function kWordT(i){ return K.wt[clamp(i, 0, K.wt.length - 1)] || { t0: 0, t1: 0 }; }
function sylAmp(list, t, wdt){
  var a = 0, lo = 0, hi = list.length;
  while (lo < hi){ var mid = (lo + hi) >> 1; if (list[mid] < t - 3 * wdt) lo = mid + 1; else hi = mid; }
  for (var i = lo; i < list.length && list[i] < t + 3 * wdt; i++){ var x = (t - list[i]) / wdt; a += Math.exp(-x * x); }
  return Math.min(1, a * 0.85);
}

/* =====================================================================
   The read: ask() and its reply. JS never names an asset (R3): params are
   {question}, {token} or {followUpOf, question}, exactly as issued by native.
   ===================================================================== */
var READ = null, READ_SEQ = 0, READS_DONE = 0, LEDGER = [], SAVED = null, ISLAND = null, ROSTER = null, SUGG = null;
function startRead(params, question){
  var r = { id: ++READ_SEQ, params: params, question: question, stageId: null, accepted: false, asset: null, market: null, reply: null, model: null,
            requestId: null, askT: clk, save: null, cancelling: false };
  READ = r;
  bcall('ask', params).then(function(res){ onAskReply(r, res); },
    function(err){ onAskReply(r, { v: 1, status: 'error', code: 'bad_response', message: null, fault: err && err.code }); });
  return r;
}
function onAskReply(r, res){
  if (r !== READ) return;
  if (!res || typeof res.status !== 'string') res = { v: 1, status: 'error', code: 'bad_response', message: null };
  r.reply = res;
  if (res.status === 'ok'){
    try { r.model = RMOD.build(res, { lang: LANG, signedIn: !!(SES && SES.signedIn) }); r.requestId = res.requestId; }
    catch (e){ logErr('model', e); r.model = null; r.reply = { v: 1, status: 'error', code: 'bad_response', message: null }; }
  }
  fsmEvent('reply', r);
}
function onStage(p){
  var r = READ; if (!r || r.reply || !p) return;
  if (r.stageId == null) r.stageId = p.requestId; else if (p.requestId !== r.stageId) return;
  if (p.stage === 'accepted'){ r.accepted = true; r.asset = p.asset || null; dockAsset(); fsmEvent('accepted', r); }
  else if (p.stage === 'market'){ r.market = p.market || null; dockAsset(); }
}
/* the header's second line: the real asset and price from ask.stage (never a JS guess) */
function dockAsset(){
  var r = READ; if (!r || !r.asset) return;
  var parts = [r.asset.symbol];
  if (r.market && fin(r.market.price)) parts.push(RMOD.money(r.market.price) + (fin(r.market.changePct) ? ' ' + RMOD.signedPct(r.market.changePct) : ''));
  A.aText = parts.join(' · '); el.dockA.textContent = A.aText; A.dockAO.tween(1, 0.24, E.fade);
}

/* ---- caption pages: the spoken sentences packed into ≤2-line pages (measured once per read) ---- */
var PAGES = [];
function buildPages(spoken){
  var m = mk('div', 'a sayM'); m.setAttribute('aria-hidden', 'true'); uiEl.appendChild(m);
  function h(text){ m.textContent = text; return m.offsetHeight; }
  var LIM = 31 * 2 + 4, pages = [], cur = [], curText = '';
  spoken.sentences.forEach(function(sent){
    var sw = sent.split(/\s+/).filter(Boolean), both = curText ? curText + ' ' + sent : sent;
    if (h(both) <= LIM){ cur = cur.concat(sw); curText = both; return; }
    if (cur.length){ pages.push(cur); cur = []; curText = ''; }
    if (h(sent) <= LIM){ cur = sw.slice(); curText = sent; return; }
    /* a sentence longer than two lines: split it into the fewest pages of balanced word counts that each fit */
    for (var k = 2; k <= sw.length; k++){
      var per = Math.ceil(sw.length / k), chunks = [], ok = true;
      for (var j = 0; j < sw.length; j += per) chunks.push(sw.slice(j, j + per));
      for (j = 0; j < chunks.length; j++) if (chunks[j].length > 1 && h(chunks[j].join(' ')) > LIM){ ok = false; break; }
      if (ok){ chunks.forEach(function(c, ci){ if (ci < chunks.length - 1) pages.push(c); else { cur = c; curText = c.join(' '); } }); return; }
    }
  });
  if (cur.length) pages.push(cur);
  var i = 0;
  PAGES = pages.map(function(ws){ var t = ws.join(' '), p = { i0: i, i1: i + ws.length, text: t, h: h(t) || 62 }; i += ws.length; return p; });
  uiEl.removeChild(m);
}
function pageOf(g){ for (var i = 0; i < PAGES.length; i++) if (g < PAGES[i].i1) return i; return PAGES.length - 1; }
/* when page p hands over to p+1: after its last word, before the next page's first word */
function pageFlipT(p){
  var pg = PAGES[p], nx = PAGES[p + 1]; if (!pg || !nx) return 1e9;
  var last = kWordT(pg.i1 - 1), next = kWordT(nx.i0);
  return Math.max(last.t0 + 0.25, Math.min(last.t1 + 0.15, next.t0 - 0.2));
}
var CAPS = [0, 1].map(function(i){ return { el: el.say[i], pg: -1, inT: 1e9, outT: 1e9, spans: [], h: 62 }; });
var capCur = -1;
function capShow(pi){
  var slot = capCur < 0 ? 0 : (capCur ^ 1);
  if (capCur >= 0) CAPS[capCur].outT = clk;
  var c = CAPS[slot], pg = PAGES[pi];
  c.pg = pi; c.inT = clk; c.outT = 1e9; c.h = pg.h;
  c.spans = words(c.el, pg.text);
  capCur = slot;
  el.live.textContent = pg.text;
}
function capsOff(){ if (capCur >= 0) CAPS[capCur].outT = clk; capCur = -1; }
function capsReset(){ CAPS.forEach(function(c){ c.pg = -1; c.inT = 1e9; c.outT = 1e9; c.spans = []; c.el.textContent = ''; op(c.el, 0); }); capCur = -1; }

/* ---- satellites: filled from model.satellites, sized to their content, placed by a clearance solver ---- */
var SLOT_V = { talk: [[-127, -100], [127, -100], [127, 100], [-127, 100]], chart: [[-122, -70], [122, -70], [122, 70], [-122, 70]] };
var SLOT_I = { UL: 0, UR: 1, LR: 2, LL: 3 };
function dotCss(k){ return k === 'alpha' ? 'var(--alpha)' : k === 'red' ? 'var(--red)' : k === 'cio' ? 'var(--cio)' : k === 'review' ? 'var(--alpha)' : 'rgba(242,237,228,.5)'; }
function appendDelta(em, d){
  var m = /^([▲▼])(.*)$/.exec(d);
  if (!m){ em.textContent = d; return; }
  var up = m[1] === '▲', ns = 'http://www.w3.org/2000/svg', svg = D.createElementNS(ns, 'svg'), p = D.createElementNS(ns, 'path');
  svg.setAttribute('class', 'dl'); svg.setAttribute('width', '7'); svg.setAttribute('height', '6'); svg.setAttribute('viewBox', '0 0 7 6'); svg.setAttribute('aria-hidden', 'true');
  p.setAttribute('d', up ? 'M3.5 0 7 6H0z' : 'M0 0h7L3.5 6z'); p.setAttribute('fill', 'currentColor'); svg.appendChild(p);
  em.appendChild(svg); em.appendChild(mk('span', 'sr', up ? '+' : '−')); em.appendChild(D.createTextNode(m[2]));
}
function fillSatNode(node, kEl, vEl, odo, key, value, from, delta, dot, deltaInValue){
  kEl.textContent = ''; vEl.textContent = '';
  var left = mk('span'); left.appendChild(mk('i')); left.appendChild(D.createTextNode(key)); kEl.appendChild(left);
  node.style.setProperty('--c', dotCss(dot));
  if (delta && !deltaInValue){ var em = mk('em'); appendDelta(em, delta); kEl.appendChild(em); }
  if (odo){ odo.build(from, value); vEl.appendChild(odo.el); } else vEl.appendChild(D.createTextNode(value));
  if (delta && deltaInValue) vEl.appendChild(mk('em', 'q', delta));
}
function measureSat(node){ node.style.width = 'auto'; var w = Math.max(100, Math.ceil(node.offsetWidth || 100)); node.style.width = w + 'px'; return w / 2; }
/* keep ≥16 px to the glass and ≥18 px to the frame edge: clamp x, then push away from the sphere vertically */
function solveSat(i, hw, layout){
  var cy = layout === 'talk' ? 330 : 210, r = layout === 'talk' ? 96 : 64, b = SLOT_V[layout][i], hh = 26, C = r + 16, sgn = b[1] < 0 ? -1 : 1;
  var x = clamp(195 + b[0], 18 + hw, 372 - hw), y = cy + b[1];
  for (var n = 0; n < 260; n++){
    var nx = clamp(195, x - hw, x + hw), ny = clamp(cy, y - hh, y + hh);
    if (Math.sqrt((nx - 195) * (nx - 195) + (ny - cy) * (ny - cy)) >= C) break;
    y += sgn;
  }
  if (sgn < 0) y = Math.max(y, 104 + hh);
  else if (layout === 'chart') y = Math.min(y, 336 - hh);   /* the plot starts at 340: the chart wins over clearance */
  return [x - 195, y - cy];
}
var CAP_TALK = 488;
function fillSats(model){
  A.sat.forEach(function(s){ s.on = false; s.p.set(0); s.tE = 1e9; });
  model.satellites.forEach(function(sm){
    var i = SLOT_I[sm.slot]; if (i == null) return;
    var s = A.sat[i], node = el.sats[i];
    fillSatNode(node, el.satK[i], el.satV[i], el.satOdo[i], sm.key, sm.value, sm.from, sm.delta, sm.dot, sm.id === 'rsi');
    s.on = true;
  });
  var low = 0;
  A.sat.forEach(function(s, i){
    if (!s.on) return;
    s.hw = measureSat(el.sats[i]);
    s.talk = solveSat(i, s.hw, 'talk'); s.chartP = solveSat(i, s.hw, 'chart');
    low = Math.max(low, 330 + s.talk[1] + 26);
  });
  CAP_TALK = Math.max(488, Math.round(low + 32));
}

/* ---- the chart: 48 real closes, exhaled from the sphere (geometry built once per read) ---- */
var CH = null, LUT_N = 512, LUT_LEAD = new Float32Array((LUT_N + 1) * 2), LUT_LINE = new Float32Array((LUT_N + 1) * 2), LUT_OK = false, PT = { x: 0, y: 0 };
var NOW_X = 280;
function axisFmt(v, step){ if (Math.abs(step) >= 1) return Math.round(v).toLocaleString('en-US'); var dp = step >= 0.1 ? 1 : step >= 0.01 ? 2 : 4; return v.toFixed(dp); }
function buildChart(ch, prov, receivedAt){
  el.cLines.textContent = '';
  if (!ch){ CH = null; return; }
  var n = ch.closes.length, lo = ch.domain[0], hi = ch.domain[1], span = (hi - lo) || 1;
  function X(i){ return 20 + i * (NOW_X - 20) / Math.max(1, n - 1); }
  function Y(v){ return 540 - (v - lo) / span * 200; }
  var pts = ch.closes.map(function(v, i){ return [X(i), Y(v)]; });
  var d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
  for (var i = 0; i < pts.length - 1; i++){
    var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += ' C' + [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]].map(function(q){ return q.toFixed(1); }).join(',');
  }
  el.cLine.setAttribute('d', d); el.cGlow.setAttribute('d', d);
  el.cArea.setAttribute('d', d + ' L' + NOW_X + ',540 L20,540 Z');
  var y0 = pts[0][1], nowY = pts[pts.length - 1][1];
  el.cLead.setAttribute('d', 'M195,274 C195,330 20,' + Math.max(300, y0 - 0.84 * 200).toFixed(1) + ' 20,' + y0.toFixed(1));
  el.leadG.setAttribute('y2', y0.toFixed(1));
  var step = ch.gridlines.length > 1 ? ch.gridlines[1] - ch.gridlines[0] : span / 3;
  for (i = 0; i < 2; i++){
    var g = ch.gridlines[i];
    if (fin(g)){ var gy = Y(g); att(el.cG[i], 'y1', f2(gy)); att(el.cG[i], 'y2', f2(gy)); att(el.cG[i], 'opacity', '1'); el.cGT[i].textContent = axisFmt(g, step); att(el.cGT[i], 'y', f2(gy - 4)); }
    else { att(el.cG[i], 'opacity', '0'); el.cGT[i].textContent = ''; }
  }
  var band = null, bandLY = -1e9;
  if (ch.band){
    var by0 = Y(ch.band.hi), by1 = Y(ch.band.lo), bh = Math.max(1, by1 - by0);
    att(el.cBandR, 'y', f2(by0)); att(el.cBandR, 'height', f2(bh));
    att(el.cBandT, 'y1', f2(by0)); att(el.cBandT, 'y2', f2(by0)); att(el.cBandB, 'y1', f2(by1)); att(el.cBandB, 'y2', f2(by1));
    bandLY = bh >= 14 ? (by0 + by1) / 2 + 4 : by0 - 5;
    el.cBandL.textContent = ch.band.label; att(el.cBandL, 'y', f2(bandLY));
    band = { y0: by0, y1: by1 };
  } else el.cBandL.textContent = '';
  /* no label touches another: a gridline tick yields to the support label */
  for (i = 0; i < 2; i++){ var gyl = +el.cGT[i].getAttribute('y'); if (el.cGT[i].textContent && Math.abs(gyl - bandLY) < 14) el.cGT[i].textContent = ''; }
  /* resistance + plan lines (plan only when the engine pulse agrees with the desk: R5) */
  var used = [Y(ch.now.price) - 9];   /* keep right-hand labels clear of the NOW price label */
  ch.lines.forEach(function(l){
    if (l.kind === 'support') return;
    var ly = Y(l.price), ns = 'http://www.w3.org/2000/svg', ln = D.createElementNS(ns, 'line'), tx = D.createElementNS(ns, 'text');
    ln.setAttribute('x1', '20'); ln.setAttribute('x2', '370'); ln.setAttribute('y1', f2(ly)); ln.setAttribute('y2', f2(ly));
    ln.setAttribute('stroke', 'rgba(242,237,228,.30)'); ln.setAttribute('stroke-width', '.75'); ln.setAttribute('stroke-dasharray', '2 4');
    var ty = ly - 5; used.forEach(function(u){ if (Math.abs(u - ty) < 13) ty = u - 13; }); used.push(ty);
    tx.setAttribute('x', '370'); tx.setAttribute('y', f2(ty)); tx.setAttribute('text-anchor', 'end');
    tx.setAttribute('font-family', 'Geist Mono, ui-monospace, monospace'); tx.setAttribute('font-size', '11'); tx.setAttribute('font-weight', '500'); tx.setAttribute('letter-spacing', '.66'); tx.setAttribute('fill', '#A39C91');
    tx.textContent = l.label;
    el.cLines.appendChild(ln); el.cLines.appendChild(tx);
  });
  el.cPrice.textContent = ch.now.label; att(el.cPrice, 'y', f2(nowY - 9));
  att(el.cNow, 'cy', f2(nowY)); att(el.cPulse, 'cy', f2(nowY));
  var br = ch.bracket;
  if (br && fin(br.to)){
    var ya = nowY, yb = Y(br.to), mid = (ya + yb) / 2;
    att(el.cBrL, 'y1', f2(ya)); att(el.cBrL, 'y2', f2(yb)); att(el.cBrA, 'y1', f2(ya)); att(el.cBrA, 'y2', f2(ya)); att(el.cBrB, 'y1', f2(yb)); att(el.cBrB, 'y2', f2(yb));
    el.cBrT.textContent = br.label; el.cBrS.textContent = br.sub;
    att(el.cBrT, 'y', f2(mid - 2)); att(el.cBrS, 'y', f2(mid + 12));
  } else { el.cBrT.textContent = ''; el.cBrS.textContent = ''; }
  var src = ch.source || {};
  el.cX.textContent = tt('chart.x', { tf: src.timeframe || '', provider: src.provider || '', inst: src.instrument || '', when: whenLabel(src.asOf, receivedAt) }).toUpperCase();
  var lineL = 300, leadL = 320;
  try { lineL = el.cLine.getTotalLength(); leadL = el.cLead.getTotalLength(); } catch (e) {}
  CH = { n: n, nowY: nowY, lineL: lineL, leadL: leadL, band: band, bracket: !!br };
  try {
    for (i = 0; i <= LUT_N; i++){
      var a = el.cLead.getPointAtLength(leadL * i / LUT_N), b = el.cLine.getPointAtLength(lineL * i / LUT_N);
      LUT_LEAD[i * 2] = a.x; LUT_LEAD[i * 2 + 1] = a.y; LUT_LINE[i * 2] = b.x; LUT_LINE[i * 2 + 1] = b.y;
    }
    LUT_OK = true;
  } catch (e) { LUT_OK = false; }
}
function lutAt(lut, len, s, out){
  var f = clamp(s / Math.max(1e-6, len), 0, 1) * LUT_N, j = Math.min(LUT_N - 1, f | 0), u = f - j;
  out.x = lut[j * 2] + (lut[j * 2 + 2] - lut[j * 2]) * u; out.y = lut[j * 2 + 1] + (lut[j * 2 + 3] - lut[j * 2 + 1]) * u; return out;
}

/* ---- cards: debate (full texts, 1:1 scroller), thesis, and Isla when there is an island ---- */
function fillCards(m){
  el.card0.lb.textContent = m.debate.header; el.card0.mt.textContent = m.debate.title; el.card0.disc.textContent = m.meta;
  el.card0.inn.textContent = '';
  m.debate.entries.forEach(function(e){
    var ar = mk('div', 'ar'); ar.style.setProperty('--c', 'var(--' + (e.id === 'alpha' ? 'alpha' : e.id === 'red' ? 'red' : 'cio') + ')');
    ar.appendChild(mk('i')); var d = mk('div'); d.appendChild(mk('b', null, e.name)); d.appendChild(mk('p', null, e.text)); ar.appendChild(d);
    el.card0.inn.appendChild(ar);
  });
  A.dscr.set(0); A.dscrMax = Math.max(0, (el.card0.inn.offsetHeight || 0) - 250 + 12);
  fillThesisCard(m.thesis, { verdict: m.verdict.key, readOnly: false, horizon: m.thesis.horizon });
  var isla = ISLAND && ISLAND.available;
  A.nCards = isla ? 3 : 2;
  if (isla){
    el.card2.lb.textContent = tt('face.isla'); el.card2.mt.textContent = ''; el.card2.ct.textContent = tt('isla.title');
    fillRows(el.card2.rows, [[tt('isla.pieces'), ISLAND.pieces], [tt('isla.seeds'), ISLAND.seedsGrowing], [tt('isla.ready'), ISLAND.reviewsReady]]
      .filter(function(r){ return fin(r[1]); }).map(function(r){ return { label: r[0], value: String(r[1]) }; }), 36);
    el.card2.go.textContent = tt('isla.cta');
  }
}
function fillRows(dl, rows, rh){
  dl.textContent = '';
  rows.forEach(function(r){ var dv = mk('div'); dv.style.height = rh + 'px'; dv.appendChild(mk('dt', null, r.label)); dv.appendChild(mk('dd', null, r.value)); dl.appendChild(dv); });
}
var HZ = 24;
function fillThesisCard(th, o){
  var c = el.card1;
  c.lb.textContent = th.header; c.mt.textContent = o.readOnly && th.when ? th.when : ''; c.ct.textContent = th.title;
  var n = th.rows.length, showHz = !!(o.horizon && o.horizon.show) && !o.readOnly;
  var avail = 284 - 8 - (showHz ? 40 : 34) - 91, rh = Math.max(28, Math.min(36, Math.floor(avail / Math.max(1, n))));
  fillRows(c.rows, th.rows, rh);
  var yUnder = 91 + n * rh + 6;
  c.ln.style.top = yUnder + 'px'; c.xp.style.top = yUnder + 'px'; c.hz.style.top = yUnder + 'px';
  c.ln.textContent = th.line || '';
  c.hz.textContent = '';
  HZ = o.horizon && o.horizon.defaultHours || 24;
  if (showHz){
    o.horizon.options.forEach(function(hrs){
      var b = mk('button', hrs === HZ ? 'on' : '', hrs >= 48 ? Math.round(hrs / 24) + 'd' : hrs + 'h'); b.type = 'button';
      b.setAttribute('data-hit', 'hz'); b.setAttribute('data-h', String(hrs)); b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', hrs === HZ ? 'true' : 'false');
      c.hz.appendChild(b);
    });
  }
  op(c.hz, showHz ? 1 : 0); A.lnO.set(showHz ? 0 : 1);
  var vk = o.verdict === 'review' ? 'review' : 'wait', vc = VC[vk];
  c.xp.style.background = css(vc.c, 0.12); c.xp.style.color = vc.css; c.xp.textContent = '';
  el.saveSw.style.setProperty('--sc', css(vc.c, 0.95));
  el.tpill.textContent = th.pill; el.tpill.style.background = css(mixC(C.cardBg, vc.c, 0.2), 0.86); el.tpill.style.border = '.5px solid ' + css(vc.c, 0.5); el.tpill.style.color = vc.css;
  A.saved.set(o.readOnly ? 1 : 0); A.savePress.set(1); A.sweepT = -9; A.xp.set(0); A.xpO.set(0);
  saveRoll.set(o.readOnly ? th.savedLabel : th.saveLabel, true);
  A.saveC = vk;
  st(el.save, 'display', 'block');
}
function setHorizon(hrs){
  HZ = hrs;
  [].slice.call(el.card1.hz.querySelectorAll('button')).forEach(function(b){ var on = +b.getAttribute('data-h') === hrs; b.className = on ? 'on' : ''; b.setAttribute('aria-checked', on ? 'true' : 'false'); });
}

/* ---- chips: born from the pill, one row from x=20 bleeding off the right edge ---- */
var DYING = [];
function chipsShow(list, eyebrow){
  chipsHide(true);
  A.chipX.set(0);
  var x = 20;
  list.forEach(function(c, i){
    var b = mk('button', 'chip' + (i === 0 ? ' first' : ''), c.label); b.type = 'button'; b.setAttribute('data-hit', 'chip'); b.setAttribute('data-i', String(i));
    el.chipRow.appendChild(b);
    var w = b.offsetWidth || 160, ch = { el: b, x: x, w: w, p: new V(0, 'emit'), o: new V(0, 'soft'), press: new V(1, 'snap'), action: c.action, label: c.label };
    x += w + 8; A.chips.push(ch);
    ch.p.to(1, 'emit', null, i * 0.07); ch.o.tween(1, 0.2, E.fade, i * 0.07);
  });
  A.chipMax = Math.max(0, x - 8 - 370);
  if (eyebrow){ el.eyebrow.textContent = tt('chips.eyebrow'); A.eyebrowO.tween(1, 0.24, E.fade); A.eyebrowY.set(6); A.eyebrowY.to(0, 'emit'); }
}
function chipsHide(instant){
  var dead = A.chips, n = dead.length; A.chips = [];
  A.eyebrowO.tween(0, 0.17, E.fade);
  if (!n) return;
  dead.forEach(function(c, i){
    var k = n - 1 - i;
    if (instant){ c.p.set(0); c.o.set(0); } else { c.p.tween(0, 0.24, E.inhale, k * 0.04); c.o.tween(0, 0.24, function(u){ return sstep(0.5, 1, u); }, k * 0.04); }
  });
  DYING = DYING.concat(dead);
  at(instant ? 0 : 0.5, function(){
    dead.forEach(function(c){ if (c.el.parentNode) c.el.parentNode.removeChild(c.el); c.p.kill(); c.o.kill(); c.press.kill(); });
    DYING = DYING.filter(function(c){ return dead.indexOf(c) < 0; });
  });
}

/* ---- the live transcript: words born from speech.partial diffs; the stable prefix keeps its spans ---- */
function txWordNew(text){ return { el: mk('span', 'w', text), text: text, y: new V(18, 'soft', true), o: new V(0, 'soft'), b: new V(6, 'soft'), g: new V(0, 'soft'),
  dx: new V(0, 'soft', true), dy: new V(0, 'soft', true), rr: new V(0, 'snap', true), nl: 0, nt: 0, nw: 0, gx: 0, gy: 0, hide: new V(1, 'soft') }; }
function txKill(w){ w.y.kill(); w.o.kill(); w.b.kill(); w.g.kill(); w.dx.kill(); w.dy.kill(); w.rr.kill(); w.hide.kill(); }
function txReset(){ el.tx.textContent = ''; A.tx.words.forEach(txKill); A.tx.words = []; A.tx.lift.set(0); A.tx.final = false; A.tx.o.set(1); }
function txText(){ return A.tx.words.map(function(w){ return w.text; }).join(' '); }
function txSet(text, final, stagger){
  var arr = String(text || '').split(/\s+/).filter(Boolean), ws = A.tx.words, k = 0, i;
  while (k < ws.length && k < arr.length && ws[k].text === arr[k]) k++;
  for (i = k; i < ws.length && i < arr.length; i++){
    var w = ws[i]; w.text = arr[i]; w.el.textContent = arr[i];
    if (!RM){ w.rr.set(8); w.rr.to(0, 'snap'); w.b.set(3); w.b.tween(0, 0.2, E.focus); }
  }
  while (ws.length > arr.length){ var r = ws.pop(), prev = r.el.previousSibling; if (prev && prev.nodeType === 3) el.tx.removeChild(prev); if (r.el.parentNode) el.tx.removeChild(r.el); txKill(r); }
  var nOld = ws.length;
  for (i = nOld; i < arr.length; i++){
    var nw = txWordNew(arr[i]);
    if (ws.length) el.tx.appendChild(D.createTextNode(' '));
    el.tx.appendChild(nw.el); ws.push(nw);
    var dl = stagger ? Math.min(0.6, (i - nOld) * stagger) : 0;
    nw.y.to(0, 'soft', null, dl); nw.b.tween(0, 0.30, E.focus, dl); nw.o.tween(1, 0.2, E.fade, dl);
  }
  /* FLIP: kept words slide from where they were to where the re-balanced line puts them */
  var tops = [];
  ws.forEach(function(w, j){
    var L = w.el.offsetLeft, T = w.el.offsetTop; w.nw = w.el.offsetWidth;
    if (j < nOld && !RM){ w.dx.set(w.dx.x + (w.nl - L)); w.dx.to(0, 'soft'); w.dy.set(w.dy.x + (w.nt - T)); w.dy.to(0, 'soft'); }
    w.nl = L; w.nt = T; if (tops.indexOf(T) < 0) tops.push(T);
  });
  tops.sort(function(a, b){ return a - b; });
  var over = Math.max(0, tops.length - 3), cut = over ? tops[over] : -1e9;
  A.tx.lift.to(over ? -(cut - tops[0]) : 0, 'soft');
  ws.forEach(function(w){ w.hide.to(w.nt < cut ? 0 : 1, 'soft'); });
  A.tx.final = !!final;
}
