/* Bridge contract tests (ARCHITECTURE.md §6.1). Runs against the dev mock in a
 * browser and against the native bridge in the app (DEBUG: -nucleo-page contract).
 * Reads that cost desk quota run ONLY when session().fixtures === true.
 * Result: #summary[data-result] = "pass" | "fail"; window.NUCLEO_CONTRACT = {passed, failed, rows}.
 */
(function () {
  'use strict';
  var B = window.nucleoBridge, FX = window.NUCLEO_FIXTURES || null;
  var rowsEl = document.getElementById('rows'), metaEl = document.getElementById('meta'), sumEl = document.getElementById('summary');
  var results = [];

  // ---- tiny shape checker -------------------------------------------------
  var T = {
    str: function (x) { return typeof x === 'string'; },
    bool: function (x) { return typeof x === 'boolean'; },
    num: function (x) { return typeof x === 'number' && isFinite(x); },
    int: function (x) { return Number.isInteger(x); },
    obj: function (x) { return !!x && typeof x === 'object' && !Array.isArray(x); },
    any: function () { return true; }
  };
  function nullOr(p) { return function (x) { return x === null || check(x, p).length === 0; }; }
  function oneOf() { var v = [].slice.call(arguments); return function (x) { return v.indexOf(x) >= 0; }; }
  function eq(v) { return function (x) { return x === v; }; }
  function arrayOf(p) { return function (x) { return Array.isArray(x) && x.every(function (i) { return check(i, p).length === 0; }); }; }
  function check(value, spec, path) {
    path = path || '$';
    if (typeof spec === 'function') return spec(value) ? [] : [path + ' = ' + JSON.stringify(value)];
    if (!T.obj(value)) return [path + ' is not an object'];
    var errs = [];
    Object.keys(spec).forEach(function (k) { errs = errs.concat(check(value[k], spec[k], path + '.' + k)); });
    return errs;
  }
  function strip(o, keys) { var c = JSON.parse(JSON.stringify(o)); keys.forEach(function (k) { delete c[k]; }); return c; }
  function diff(a, b, path, out) {
    path = path || '$'; out = out || [];
    if (out.length > 6) return out;
    if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || (a === null) !== (b === null)) { out.push(path + ': ' + JSON.stringify(a) + ' != ' + JSON.stringify(b)); return out; }
    if (a && typeof a === 'object') {
      var keys = Object.keys(a).concat(Object.keys(b)).filter(function (k, i, s) { return s.indexOf(k) === i; });
      keys.forEach(function (k) { diff(a[k], b[k], path + '.' + k, out); });
    } else if (a !== b) out.push(path + ': ' + JSON.stringify(a) + ' != ' + JSON.stringify(b));
    return out;
  }

  var SESSION = {
    v: eq(1), firstRun: T.bool, onboarded: T.bool, language: oneOf('en', 'es'), localHour: T.int,
    companion: nullOr({ id: T.str, webId: T.str, label: T.str, palette: T.str, voicePersona: T.str }),
    xp: T.int, level: { number: T.int, name: T.str, progress: T.num, nextMinXP: nullOr(T.int) }, streak: T.int,
    signedIn: T.bool, riskAccepted: T.bool, riskVersion: T.int, muted: T.bool, reducedMotion: T.bool,
    mic: { state: oneOf('granted', 'denied', 'undetermined', 'restricted', 'unavailable'), onDevice: T.bool },
    hints: T.obj, pendingRead: nullOr(T.obj), fixtures: T.bool, platform: T.str, appVersion: T.str
  };
  var CANDLE = { t: T.int, o: T.num, h: T.num, l: T.num, c: T.num, v: T.num };
  var ASK_OK = {
    v: eq(1), status: eq('ok'), requestId: T.str, question: T.str, language: oneOf('en', 'es'),
    asset: { symbol: T.str, name: T.str, isEquity: T.bool },
    market: { price: nullOr(T.num), changePct: nullOr(T.num) },
    technicals: { price: nullOr(T.num), rsi14: nullOr(T.num), ema20: nullOr(T.num), ema50: nullOr(T.num), support: nullOr(T.num),
      resistance: nullOr(T.num), atrPct: nullOr(T.num), trend: nullOr(oneOf('up', 'down', 'sideways')), momentum: nullOr(oneOf('overbought', 'oversold', 'neutral')) },
    pulse: T.any,
    agents: { alpha: T.str, red: T.str, cio: T.str, verdict: oneOf('wait', 'review'), direction: oneOf('long', 'short', 'none') },
    provenance: { provider: T.str, instrument: T.str, assetType: oneOf('equity', 'crypto'), timeframe: T.str, asOf: T.str },
    candles: arrayOf(CANDLE), receivedAt: T.int, elapsedMs: T.int, fixture: T.bool
  };
  var SAVE = {
    status: eq('saved'), awardedXP: T.int, capped: T.bool, kind: oneOf('read_complete', 'no_trade_respected'),
    xp: T.int, level: T.obj, streak: T.int, evolution: nullOr(T.obj), unlocks: arrayOf(T.obj),
    planting: oneOf('pending', 'signed_out', 'capped', 'fixtures'),
    thesis: { id: T.str, symbol: T.str, isEquity: T.bool, verdict: oneOf('wait', 'review'), direction: T.str, price: nullOr(T.num),
      support: nullOr(T.num), resistance: nullOr(T.num), entry: nullOr(T.num), stop: nullOr(T.num), target: nullOr(T.num),
      asOf: T.str, provider: T.str, savedAt: T.str, horizonHours: nullOr(T.int), points: T.int, synced: T.bool }
  };

  function row(status, name, detail) {
    results.push({ status: status, name: name, detail: detail || '' });
    var d = document.createElement('div');
    d.className = 'row ' + status;
    d.innerHTML = '<b></b><span><span class="name"></span><div class="detail"></div></span>';
    d.querySelector('b').textContent = status.toUpperCase();
    d.querySelector('.name').textContent = name;
    d.querySelector('.detail').textContent = detail || '';
    rowsEl.appendChild(d);
  }
  function faultCode(p) { return p.then(function () { return 'resolved'; }, function (e) { return e.code; }); }
  function waitFor(name, pred, ms) {
    return new Promise(function (res, rej) {
      var off = B.on(name, function (p) { if (!pred || pred(p)) { off(); clearTimeout(tm); res(p); } });
      var tm = setTimeout(function () { off(); rej(new Error('timeout waiting for ' + name)); }, ms);
    });
  }

  var tests = [];
  function test(name, fn) { tests.push({ name: name, fn: fn }); }
  var ctx = {};

  test('session() shape', function () {
    return B.api.session({ page: 'contract' }).then(function (s) {
      ctx.session = s;
      metaEl.textContent = (B.native ? 'native' : 'mock') + ' · lang ' + s.language + ' · fixtures ' + s.fixtures + ' · signedIn ' + s.signedIn + ' · risk ' + s.riskAccepted;
      var e = check(s, SESSION); if (e.length) throw new Error(e.join('\n'));
    });
  });
  test('roster(): 18 companions, orb<->bobby, ids unique', function () {
    return B.api.roster().then(function (r) {
      var c = r.companions;
      if (!Array.isArray(c) || c.length !== 18) throw new Error('count ' + (c && c.length));
      var e = check(r, { companions: arrayOf({ id: T.str, webId: T.str, label: T.str, role: T.str, selectLine: T.str, requiredLevel: T.int, voicePersona: T.str, palette: T.str, unlocked: T.bool }) });
      if (e.length) throw new Error(e.join('\n'));
      if (c[0].id !== 'orb' || c[0].webId !== 'bobby') throw new Error('first companion must be orb/bobby');
      var ids = c.map(function (x) { return x.id; });
      if (ids.some(function (x, i) { return ids.indexOf(x) !== i; })) throw new Error('duplicate ids');
      var web = (window.COMPANIONS || []).map(function (x) { return x.id; });
      var missing = c.filter(function (x) { return web.length && web.indexOf(x.webId) < 0; });
      if (missing.length) throw new Error('webId not in COMPANIONS: ' + missing.map(function (x) { return x.webId; }).join(','));
    });
  });
  test('riskNotice(): version 4, four statements (same words as RiskNoticeView)', function () {
    return B.api.riskNotice().then(function (r) {
      var e = check(r, { version: T.int, statements: arrayOf({ title: T.str, body: T.str }) });
      if (e.length) throw new Error(e.join('\n'));
      if (r.statements.length !== 4) throw new Error('statements ' + r.statements.length);
      if (FX) {
        var want = FX.native.riskNotice.statements[ctx.session.language];
        var d = diff(r.statements, want); if (d.length) throw new Error('drift from RiskNoticeView:\n' + d.join('\n'));
      }
    });
  });
  test('protocol faults: unknown_method / bad params', function () {
    return Promise.all([
      B.raw({ v: 1, method: 'nope', params: {} }).then(function (r) { return r && r.ok === false && r.error.code; }),
      faultCode(B.api.ask({ question: '' })),
      faultCode(B.api.ask({ question: 5 })),
      faultCode(B.api.haptic({ kind: 'boom' })),
      faultCode(B.api.saveThesis({ requestId: 'not-a-read' }))
    ]).then(function (c) {
      var want = ['unknown_method', 'invalid_params', 'invalid_params', 'invalid_params', 'invalid_params'];
      if (JSON.stringify(c) !== JSON.stringify(want)) throw new Error('got ' + JSON.stringify(c));
    });
  });
  test('haptic / markHint / speech.permission / island / record / theses shapes', function () {
    return Promise.all([B.api.haptic({ kind: 'selection' }), B.api.markHint({ key: 'contract' }), B.api.speechPermission(),
      B.api.island(), B.api.record(), B.api.theses()]).then(function (r) {
      var e = [].concat(check(r[1], { count: T.int }), check(r[2], { state: T.str, onDevice: T.bool }),
        check(r[3], { available: T.bool }), check(r[4], { available: T.bool }), check(r[5], { items: T.any }));
      if (!Array.isArray(r[5].items)) e.push('theses.items not an array');
      if (e.length) throw new Error(e.join('\n'));
    });
  });

  function fixturesOnly() { if (!ctx.session || !ctx.session.fixtures) return 'skip: not in fixture mode (never spend desk quota from the contract page)'; }

  test('risk gate: ask before acceptance never reaches the network', function () {
    var s = fixturesOnly(); if (s) return Promise.resolve(s);
    if (ctx.session.riskAccepted) return Promise.resolve('skip: risk already accepted');
    return B.api.ask({ question: 'Should I buy NVIDIA right now?' }).then(function (r) {
      if (r.status !== 'error' || r.code !== 'risk_not_accepted') throw new Error(JSON.stringify(r));
      return B.api.acceptRisk({ version: 4 });
    }).then(function (a) { if (!a.accepted) throw new Error('acceptRisk failed'); });
  });
  test('too_long is answered locally (1,201 code points)', function () {
    var s = fixturesOnly(); if (s) return Promise.resolve(s);
    return B.api.ask({ question: new Array(1202).join('x') }).then(function (r) {
      if (r.status !== 'too_long' || r.maxLength !== 1200) throw new Error(JSON.stringify(r));
    });
  });
  test('unknown asset -> unknown_asset (no desk call)', function () {
    var s = fixturesOnly(); if (s) return Promise.resolve(s);
    return B.api.ask({ question: 'hello how are you' }).then(function (r) {
      var d = diff(strip(r, []), FX.ask.unknown); if (d.length) throw new Error(d.join('\n'));
    });
  });
  test('proxy asset -> confirm(token) -> unsupported(asset_class), no desk call', function () {
    var s = fixturesOnly(); if (s) return Promise.resolve(s);
    return B.api.ask({ question: 'Should I buy gold?' }).then(function (r) {
      var d = diff(strip(r, ['token']), strip(FX.ask['confirm-proxy'], ['token'])); if (d.length) throw new Error(d.join('\n'));
      if (!r.token) throw new Error('no token');
      return B.api.ask({ token: r.token });
    }).then(function (r) {
      var d = diff(r, FX.ask['unsupported-proxy']); if (d.length) throw new Error(d.join('\n'));
    });
  });
  test('NVDA read == golden (minus volatile) and ask.stage order', function () {
    var s = fixturesOnly(); if (s) return Promise.resolve(s);
    var stages = [];
    var off = B.on('ask.stage', function (p) { stages.push(p.stage); });
    return B.api.ask({ question: 'Should I buy NVIDIA right now?' }).then(function (r) {
      off();
      var e = check(r, ASK_OK); if (e.length) throw new Error(e.join('\n'));
      var vol = FX.manifest.volatileKeys;
      var d = diff(strip(r, vol), strip(FX.ask.nvda, vol)); if (d.length) throw new Error('golden drift:\n' + d.join('\n'));
      var want = ['resolving', 'accepted', 'market', 'candles'];
      var seen = stages.filter(function (x) { return want.indexOf(x) >= 0; });
      if (JSON.stringify(seen) !== JSON.stringify(want)) throw new Error('stages ' + JSON.stringify(stages));
      ctx.nvda = r;
      if (window.NucleoReadModel) window.NucleoReadModel.build(r, { lang: r.language });
    });
  });
  test('BTC read == golden (minus volatile)', function () {
    var s = fixturesOnly(); if (s) return Promise.resolve(s);
    return B.api.ask({ question: 'Is now a good time for Bitcoin?' }).then(function (r) {
      var vol = FX.manifest.volatileKeys;
      var d = diff(strip(r, vol), strip(FX.ask.btc, vol)); if (d.length) throw new Error('golden drift:\n' + d.join('\n'));
    });
  });
  test('one read at a time (busy) and cancel -> cancelled', function () {
    var s = fixturesOnly(); if (s) return Promise.resolve(s);
    var first = B.api.ask({ question: 'Is now a good time for Bitcoin?' });
    return faultCode(B.api.ask({ question: 'Should I buy NVIDIA right now?' })).then(function (code) {
      if (code !== 'busy') throw new Error('second ask: ' + code);
      return B.api.cancel();
    }).then(function (c) {
      if (!c.cancelled) throw new Error('cancel returned ' + JSON.stringify(c));
      return first;
    }).then(function (r) { if (r.status !== 'cancelled') throw new Error(JSON.stringify(r)); });
  });
  test('saveThesis awards once per read (idempotent) and lists it', function () {
    var s = fixturesOnly(); if (s) return Promise.resolve(s);
    if (!ctx.nvda) throw new Error('needs the NVDA read');
    var first;
    return B.api.saveThesis({ requestId: ctx.nvda.requestId }).then(function (r) {
      var e = check(r, SAVE); if (e.length) throw new Error(e.join('\n'));
      if ([0, 20].indexOf(r.awardedXP) < 0) throw new Error('wait read must award 20 (or 0 at the daily cap), got ' + r.awardedXP);
      first = r;
      return B.api.saveThesis({ requestId: ctx.nvda.requestId });
    }).then(function (again) {
      var d = diff(again, first); if (d.length) throw new Error('second save differs:\n' + d.join('\n'));
      return B.api.theses();
    }).then(function (t) {
      if (!t.items.some(function (x) { return x.id === ctx.nvda.requestId; })) throw new Error('saved thesis missing from theses()');
    });
  });
  test('speak -> voice.start/voice.end (or muted)', function () {
    var id = 'contract-' + Date.now();
    var started = false, offS = B.on('voice.start', function (p) { if (p.id === id) started = true; });
    var end = waitFor('voice.end', function (p) { return p.id === id; }, 25000);
    return B.api.speak({ id: id, text: 'Contract check.' }).then(function (r) {
      if (r.status === 'muted') { offS(); return 'muted'; }
      if (r.status !== 'queued') throw new Error(JSON.stringify(r));
      return end.then(function (e) {
        offS();
        if (e.reason === 'finished' && !started) throw new Error('voice.end(finished) without voice.start');
        return 'ended: ' + e.reason;
      });
    });
  });

  function run(i) {
    if (i >= tests.length) {
      var failed = results.filter(function (r) { return r.status === 'fail'; }).length;
      var passed = results.filter(function (r) { return r.status === 'pass'; }).length;
      sumEl.textContent = (failed ? 'FAIL' : 'PASS') + ' · ' + passed + ' passed · ' + failed + ' failed · ' +
        results.filter(function (r) { return r.status === 'skip'; }).length + ' skipped';
      sumEl.dataset.result = failed ? 'fail' : 'pass';
      window.NUCLEO_CONTRACT = { passed: passed, failed: failed, rows: results };
      B.call('log', { level: failed ? 'error' : 'info', message: 'contract ' + sumEl.textContent }).catch(function () {});
      return;
    }
    var t = tests[i];
    var p;
    try { p = Promise.resolve(t.fn()); } catch (e) { p = Promise.reject(e); }
    p.then(function (detail) {
      if (typeof detail === 'string' && detail.indexOf('skip') === 0) row('skip', t.name, detail);
      else row('pass', t.name, typeof detail === 'string' ? detail : '');
    }, function (e) { row('fail', t.name, (e && e.code ? '[' + e.code + '] ' : '') + (e && e.message || String(e))); })
      .then(function () { run(i + 1); });
  }
  run(0);
})();
