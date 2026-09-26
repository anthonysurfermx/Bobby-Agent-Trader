/* Núcleo WEB transport, part 3: the desk (ARCHITECTURE.md §2.4, §2.7).
 *
 * A line-by-line port of NucleoDesk.swift + the BobbyAPI.swift requests it makes, same-origin:
 *   validate → busy → risk gate → length → resolve (POST /api/bobby-asset-search) →
 *   preflight (class, symbol format, 1H candles: /api/stock-candles | /api/okx-candles, freshness) →
 *   market (POST /api/voice-tool get_market) ‖ pulse (run_debate) ‖ desk (POST /api/desk-debate) → map.
 * Nothing the desk cannot chart ever spends quota (R14); a failure never carries a verdict;
 * XP exists only on Save (R4). The page never names an asset (R3): tokens are issued here.
 */
(function () {
  'use strict';
  var NW = window.__nucleoWeb;
  if (!NW) return;
  var S = NW.state;
  var D = NW.desk = {};

  var TOKEN_LIFETIME = 600000, MARKET_CAP = 20000, PULSE_CAP = 20000, PULSE_GRACE = 5000;
  var SEARCH_TIMEOUT = 60000, DESK_TIMEOUT = 100000, SUGGESTIONS_CACHE = 300000;
  var EQUITY_SYMBOL = /^[A-Z]{1,5}$/;
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  var MAX_QUESTION = 1200;
  var TREND = { alcista: 'up', bajista: 'down', lateral: 'sideways', up: 'up', down: 'down', sideways: 'sideways' };
  var MOMENTUM = { sobrecompra: 'overbought', sobreventa: 'oversold', neutral: 'neutral', overbought: 'overbought', oversold: 'oversold' };
  var num = NW.num, isObj = NW.isObj, orNull = NW.orNull;
  var CANCELLED = { v: 1, status: 'cancelled' };

  function fault(code, message) { var e = new Error(message || code); e.fault = code; return e; }
  D.fault = fault;
  function errorResult(code, message) { return { v: 1, status: 'error', code: code, message: message == null ? null : message }; }
  function tooLongMessage() { return NW.t('Your question is too long. Keep it to 1,200 characters or fewer.', 'Tu pregunta es demasiado larga. Usa 1,200 caracteres o menos.'); }
  /** Unicode code points of the trimmed text, like /api/desk-debate counts them. */
  function codePoints(s) { return Array.from(String(s).trim()).length; }
  function given(v) { return v !== undefined && v !== null; }

  /* ---- BobbyAPI.prettyName ---- */
  function prettyName(raw, symbol) {
    if (!raw || raw === symbol) return symbol;
    if (/[&0-9]/.test(raw)) return raw;
    return raw.toLowerCase().split(' ').filter(Boolean).map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
  }
  function aliasesOf(o) { return Array.isArray(o.aliases) ? o.aliases.filter(function (a) { return typeof a === 'string'; }) : []; }
  function firstOther(list, symbol) { for (var i = 0; i < list.length; i++) if (list[i] !== symbol) return list[i]; return symbol; }
  function asset(symbol, name, assetClass) { return { symbol: symbol, name: name, isEquity: assetClass === 'equity', assetClass: assetClass }; }
  function assetJSON(a) { return { symbol: a.symbol, name: a.name, isEquity: a.isEquity }; }
  function assetWithClass(a) { return { symbol: a.symbol, name: a.name, isEquity: a.isEquity, assetClass: a.assetClass }; }

  /* ---- asset search (POST only: the typed text is often the whole question; a query string lands in logs) ---- */
  function assetSearch(q, limit, signal) {
    var body = { q: q };
    if (limit != null) body.limit = limit;
    return NW.http('/api/bobby-asset-search', { method: 'POST', body: body, timeoutMs: SEARCH_TIMEOUT, signal: signal })
      .then(function (r) { return r.status >= 200 && r.status < 300 && isObj(r.json) ? r.json : null; }, function () { return null; });
  }
  /** NucleoDeskIO.parseSearch: BobbyAPI.resolution(from:), keeping resolved.assetClass. */
  function parseSearch(obj) {
    var resolution = obj.resolution, resolved = obj.resolved;
    if (!isObj(resolution) || !isObj(resolved)) return { kind: 'unresolved' };
    var symbol = typeof resolved.baseSymbol === 'string' ? resolved.baseSymbol : (typeof resolved.symbol === 'string' ? resolved.symbol : '');
    if (!symbol) return { kind: 'unresolved' };
    var assetClass = typeof resolved.assetClass === 'string' ? resolved.assetClass : 'crypto';
    return {
      kind: 'resolved', asset: asset(symbol, prettyName(firstOther(aliasesOf(resolved), symbol), symbol), assetClass),
      needsConfirmation: resolution.needsConfirmation === true,
      matchKind: typeof resolution.matchKind === 'string' ? resolution.matchKind : null,
      proxyNote: typeof resolution.proxyNote === 'string' ? resolution.proxyNote : null
    };
  }
  /** BobbyAPI.searchAssets(q, limit: 3): one row per asset. */
  function searchAssets(q, limit, signal) {
    return assetSearch(q, 10, signal).then(function (obj) {
      var rows = obj && Array.isArray(obj.results) ? obj.results : [], seen = {}, hits = [];
      for (var i = 0; i < rows.length && hits.length < limit; i++) {
        var r = rows[i];
        if (!isObj(r) || typeof r.symbol !== 'string' || seen[r.symbol]) continue;
        seen[r.symbol] = true;
        hits.push(asset(r.symbol, prettyName(firstOther(aliasesOf(r), r.symbol), r.symbol), typeof r.assetClass === 'string' ? r.assetClass : 'crypto'));
      }
      return hits;
    });
  }

  /* ---- 1H candles, exactly the desk's request (MarketTimeframe.oneHour) ---- */
  function candlePath(symbol, isEquity) {
    var s = encodeURIComponent(symbol);
    return isEquity ? '/api/stock-candles?symbol=' + s + '&range=7d&interval=1h'
                    : '/api/okx-candles?instId=' + s + '-USDT&bar=1H&limit=100';
  }
  function decodeCandles(body) {
    var candles = Array.isArray(body.candles) ? body.candles : [];
    var rows = candles.length ? candles : (Array.isArray(body.data) ? body.data : []), out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!isObj(r)) continue;
      var t = num(r.ts), o = num(r.open), h = num(r.high), l = num(r.low), c = num(r.close);
      if (t == null || o == null || h == null || l == null || c == null || Math.abs(t) >= 1e15) continue;
      var v = num(r.volume);
      out.push({ t: Math.trunc(t), o: o, h: h, l: l, c: c, v: v == null ? 0 : v });
    }
    return out.sort(function (a, b) { return a.t - b.t; });
  }
  /** A transport error is told apart from an empty or non-2xx reply (the latter is thin data). */
  function candles(symbol, isEquity, signal) {
    return NW.http(candlePath(symbol, isEquity), { timeoutMs: SEARCH_TIMEOUT, signal: signal }).then(function (r) {
      if (r.status < 200 || r.status >= 300 || !isObj(r.json)) return { bars: [] };
      return { bars: decodeCandles(r.json) };
    }, function (e) { return { failed: e.kind }; });
  }
  /** R14: crypto ≥59 bars and the last one ≤3 h old; equity's last bar ≤5 days old. */
  function gate(bars, isEquity, now) {
    if (!bars.length) return 'thin_data';
    var age = now / 1000 - bars[bars.length - 1].t / 1000;
    if (isEquity) return age > 5 * 86400 ? 'stale_data' : null;
    if (bars.length < 59) return 'thin_data';
    return age > 3 * 3600 ? 'stale_data' : null;
  }

  /* ---- market + pulse (quota-free) ---- */
  function market(symbol, signal) {
    return NW.http('/api/voice-tool', { method: 'POST', body: { tool: 'get_market', args: { symbol: symbol } }, timeoutMs: SEARCH_TIMEOUT, signal: signal })
      .then(function (r) { var o = isObj(r.json) ? r.json : null; return { price: o ? num(o.price) : null, changePct: o ? num(o.change_24h_pct) : null }; },
        function () { return { price: null, changePct: null }; });
  }
  /** null when the tool failed or sent no technical_pulse; `plan` only with a numeric level. */
  function parsePulse(body) {
    if (Object.prototype.hasOwnProperty.call(body, 'error') || !isObj(body.technical_pulse)) return null;
    var p = body.technical_pulse, plan = null, tp = p.trade_plan;
    if (isObj(tp) && (num(tp.entry) != null || num(tp.stop) != null || num(tp.target) != null)) {
      plan = { direction: NW.str(tp.direction), entry: num(tp.entry), stop: num(tp.stop), target: num(tp.target),
        rewardRisk: num(tp.rewardRisk), invalidation: NW.str(tp.invalidation) };
    }
    return { signal: NW.str(p.signal), direction: NW.str(p.direction), convictionPct: num(p.conviction_pct), agreementPct: num(p.agreement_pct),
      overview: NW.str(p.overview), source: NW.str(p.source), instrument: NW.str(p.instrument), plan: plan };
  }
  function pulse(symbol, signal) {
    return NW.http('/api/voice-tool', { method: 'POST', body: { tool: 'run_debate', args: { symbol: symbol, lang: NW.lang } }, timeoutMs: SEARCH_TIMEOUT, signal: signal })
      .then(function (r) { return isObj(r.json) ? parsePulse(r.json) : null; }, function () { return null; });
  }

  /* ---- the desk (quota) ---- */
  function parseDebate(status, json, headers) {
    var body = isObj(json) ? json : null;
    var code = body && typeof body.code === 'string' ? body.code : null;
    var message = body && typeof body.error === 'string' ? body.error : null;
    if (status === 429) {
      var ra = num(headers && headers.get ? headers.get('retry-after') : null), secs = ra == null ? null : Math.trunc(ra);
      return { kind: 'quota', retryAfter: secs === 0 ? null : secs, message: message };
    }
    if (status === 400 && code === 'question_too_long') return { kind: 'tooLong', message: message };
    if (status === 503 && (code === 'analysis_failed' || code === 'desk_unavailable')) return { kind: 'failed', code: code, message: message };
    var agents = body && isObj(body.agents) ? body.agents : null;
    function text(k) { return agents && typeof agents[k] === 'string' && agents[k] ? agents[k] : null; }
    if (!(status >= 200 && status < 300) || !agents || !text('alpha') || !text('red') || !text('cio') ||
        (agents.verdict !== 'wait' && agents.verdict !== 'review')) return { kind: 'badResponse' };
    var t = isObj(body.technicals) ? body.technicals : {}, p = isObj(body.provenance) ? body.provenance : {};
    var direction = typeof agents.direction === 'string' ? agents.direction : 'none';
    return {
      kind: 'ok',
      agents: { alpha: agents.alpha, red: agents.red, cio: agents.cio, verdict: agents.verdict,
        direction: ['long', 'short', 'none'].indexOf(direction) >= 0 ? direction : 'none' },
      technicals: { price: num(t.price), rsi14: num(t.rsi14), ema20: num(t.ema20), ema50: num(t.ema50),
        support: num(t.support), resistance: num(t.resistance), atrPct: num(t.atrPct),
        trend: typeof t.trend === 'string' && TREND.hasOwnProperty(t.trend) ? TREND[t.trend] : null,
        momentum: typeof t.momentum === 'string' && MOMENTUM.hasOwnProperty(t.momentum) ? MOMENTUM[t.momentum] : null },
      provenance: { provider: NW.str(p.provider), instrument: NW.str(p.instrument), assetType: NW.str(p.assetType),
        timeframe: NW.str(p.timeframe), asOf: NW.str(p.asOf) }
    };
  }
  /** BobbyAPI.debate: POST /api/desk-debate, 100 s. The browser sends this origin's Origin header itself. */
  function debate(symbol, question, isEquity, signal) {
    return NW.http('/api/desk-debate', { method: 'POST', timeoutMs: DESK_TIMEOUT, signal: signal,
      body: { symbol: symbol, question: question, language: NW.lang, assetType: isEquity ? 'equity' : 'crypto' } })
      .then(function (r) { return parseDebate(r.status, r.json, r.headers); },
        function (e) { return { kind: e.kind === 'timeout' ? 'timeout' : e.kind === 'cancelled' ? 'cancelled' : 'network' }; });
  }

  /* ---- tokens: single use, 10 min (never analyze an unconfirmed guess) ---- */
  var tokens = Object.create(null);
  function purgeTokens() { var now = Date.now(); Object.keys(tokens).forEach(function (k) { if (tokens[k].expires <= now) delete tokens[k]; }); }
  function issueToken(a, question) {
    purgeTokens();
    var tk = NW.uuid();
    tokens[tk] = { asset: a, question: question, expires: Date.now() + TOKEN_LIFETIME };
    return tk;
  }

  /* ---- ask ---- */
  var inflight = null;
  D.busy = function () { return !!inflight; };

  D.ask = function (p) {
    // 1. Params: exactly one of {question} · {token} · {followUpOf, question}.
    function question() {
      if (typeof p.question !== 'string') throw fault('invalid_params', 'question');
      if (!p.question.trim()) throw fault('invalid_params', 'question is empty');
      return p.question;
    }
    var source;
    if (given(p.token)) {
      if (given(p.question) || given(p.followUpOf)) throw fault('invalid_params', 'token takes no question');
      if (typeof p.token !== 'string' || p.token.length > 128) throw fault('invalid_params', 'token');
      if (!p.token) throw fault('invalid_params', 'token is empty');
      source = { token: p.token };
    } else if (given(p.followUpOf)) {
      if (typeof p.followUpOf !== 'string' || p.followUpOf.length > 36 || !UUID_RE.test(p.followUpOf)) throw fault('invalid_params', 'followUpOf');
      source = { followUpOf: p.followUpOf, question: question() };
    } else source = { question: question() };
    //    ... then one read at a time.
    if (inflight) throw fault('busy', 'a read is already running');
    // 2. Consent before processing: nothing leaves the browser before the risk notice.
    if (!S.riskAccepted()) return errorResult('risk_not_accepted');
    // 3. Length, counted like the server counts.
    if (source.question != null && codePoints(source.question) > MAX_QUESTION) return { v: 1, status: 'too_long', maxLength: MAX_QUESTION, message: tooLongMessage() };
    var requestId = NW.uuid(), job;
    if (source.token) {
      purgeTokens();
      var entry = tokens[source.token];
      delete tokens[source.token];
      if (!entry || entry.expires <= Date.now()) throw fault('invalid_params', 'unknown or expired token');
      job = { requestId: requestId, question: entry.question, asset: entry.asset, startedAt: Date.now() };
    } else if (source.followUpOf) {
      var prev = S.findRead(source.followUpOf);
      if (!prev) throw fault('invalid_params', 'unknown followUpOf');
      job = { requestId: requestId, question: source.question.trim(), asset: prev.asset, startedAt: Date.now() };
    } else {
      job = { requestId: requestId, question: source.question.trim(), asset: null, startedAt: Date.now() };
    }
    // 4.
    NW.emit('ask.stage', { requestId: requestId, stage: 'resolving' });
    var ctl = typeof AbortController === 'function' ? new AbortController() : { signal: { aborted: false, addEventListener: function () {}, removeEventListener: function () {} }, abort: function () { this.signal.aborted = true; } };
    return new Promise(function (resolve) {
      inflight = { requestId: requestId, resolve: resolve, ctl: ctl };
      run(job, ctl.signal).then(function (result) { complete(requestId, result); },
        function () { complete(requestId, errorResult('bad_response')); });
    });
  };

  function complete(requestId, result) {
    if (!inflight || inflight.requestId !== requestId) return;
    var f = inflight;
    inflight = null;
    f.resolve(result);
  }

  /** `cancel()`: the in-flight ask resolves {status:"cancelled"} now. The server may already have spent quota. */
  D.cancel = function () {
    if (!inflight) return { cancelled: false };
    var f = inflight;
    inflight = null;
    try { f.ctl.abort(); } catch (e) {}
    f.resolve(CANCELLED);
    return { cancelled: true };
  };

  function run(job, signal) {
    function aborted() { return signal.aborted; }
    // 5. Resolve.
    var resolveStep = job.asset ? Promise.resolve({ asset: job.asset }) : assetSearch(job.question, null, signal).then(function (obj) {
      if (aborted()) return { done: CANCELLED };
      if (!obj) return { done: errorResult('network') };
      var s = parseSearch(obj);
      if (s.kind === 'unresolved') {
        return searchAssets(job.question, 3, signal).then(function (hits) {
          if (aborted()) return { done: CANCELLED };
          return { done: { v: 1, status: 'unknown_asset', query: job.question, suggestions: hits.map(function (a) {
            return { symbol: a.symbol, name: a.name, assetClass: a.assetClass, token: issueToken(a, job.question) };
          }) } };
        });
      }
      if (s.needsConfirmation) {
        return { done: { v: 1, status: 'confirm', token: issueToken(s.asset, job.question), asset: assetWithClass(s.asset),
          matchKind: s.matchKind, proxyNote: s.proxyNote } };
      }
      return { asset: s.asset };
    });

    return resolveStep.then(function (step) {
      if (step.done) return step.done;
      var a = step.asset, symbol = a.symbol, isEquity = a.isEquity;
      // 6. Preflight: nothing the desk cannot chart ever spends quota.
      if (a.assetClass !== 'equity' && a.assetClass !== 'crypto') return { v: 1, status: 'unsupported', asset: assetWithClass(a), reason: 'asset_class' };
      if (isEquity && !EQUITY_SYMBOL.test(symbol)) return { v: 1, status: 'unsupported', asset: assetWithClass(a), reason: 'symbol_format' };
      NW.emit('ask.stage', { requestId: job.requestId, stage: 'accepted', asset: assetJSON(a), startedAt: job.startedAt });
      // The market read (quota-free) starts with the candles; its stage always lands first.
      var marketP = NW.withTimeout(MARKET_CAP, market(symbol, signal));
      return candles(symbol, isEquity, signal).then(function (cr) {
        if (aborted()) return CANCELLED;
        if (cr.failed) return cr.failed === 'cancelled' ? CANCELLED : errorResult(cr.failed === 'timeout' ? 'timeout' : 'network');
        var bars = cr.bars, reason = gate(bars, isEquity, Date.now());
        if (reason) return { v: 1, status: 'unsupported', asset: assetWithClass(a), reason: reason };
        // 7. Market ‖ pulse ‖ desk. The reply never precedes its market and candles stages.
        var pulseP = NW.withTimeout(PULSE_CAP, pulse(symbol, signal));
        var deskP = debate(symbol, job.question, isEquity, signal);
        return marketP.then(function (m) {
          var mk = m || { price: null, changePct: null };
          if (aborted()) return CANCELLED;
          NW.emit('ask.stage', { requestId: job.requestId, stage: 'market', market: mk });
          NW.emit('ask.stage', { requestId: job.requestId, stage: 'candles', candles: bars, provenance: null });
          return deskP.then(function (desk) {
            if (aborted()) return CANCELLED;
            return NW.withTimeout(PULSE_GRACE, pulseP).then(function (pl) {
              if (aborted()) return CANCELLED;
              return map(job, a, mk, bars, desk, pl || null);
            });
          });
        });
      });
    });
  }

  // 8. Map. Never a verdict on a failure.
  function map(job, a, mk, bars, desk, pl) {
    switch (desk.kind) {
      case 'cancelled': return CANCELLED;
      case 'timeout': return errorResult('timeout');
      case 'network': return errorResult('network');
      case 'badResponse': return errorResult('bad_response');
      case 'quota': return { v: 1, status: 'quota', retryAfterSec: desk.retryAfter, message: desk.message };
      case 'tooLong': return { v: 1, status: 'too_long', maxLength: MAX_QUESTION, message: desk.message };
      case 'failed': return errorResult(desk.code, desk.message);
    }
    var result = {
      v: 1, status: 'ok', requestId: job.requestId, question: job.question, language: NW.lang,
      asset: assetJSON(a), market: mk, technicals: desk.technicals, pulse: pl, agents: desk.agents,
      provenance: desk.provenance, candles: bars, receivedAt: Date.now(), elapsedMs: Date.now() - job.startedAt, fixture: false
    };
    // 9. Remember it (the last 5); it becomes `pendingRead` until saved. No XP here (R4).
    S.recordQuery(a.symbol, a.isEquity);
    S.addRead({
      requestId: job.requestId, result: result, asset: a, storedAt: Date.now(),
      verdict: desk.agents.verdict, direction: desk.agents.direction,
      price: mk.price != null ? mk.price : desk.technicals.price,
      support: desk.technicals.support, resistance: desk.technicals.resistance,
      asOf: desk.provenance.asOf || '', provider: desk.provenance.provider || '', saved: null
    });
    return result;
  }

  /* ---- saveThesis: the only XP (R4) ---- */
  D.saveThesis = function (p) {
    if (typeof p.requestId !== 'string' || !p.requestId || p.requestId.length > 64) throw fault('invalid_params', 'requestId');
    var horizon = null;
    if (given(p.horizonHours)) {
      if ([24, 72, 168].indexOf(p.horizonHours) < 0) throw fault('invalid_params', 'horizonHours');
      horizon = p.horizonHours;
    }
    var read = S.findRead(p.requestId);
    if (!read) throw fault('invalid_params', 'unknown requestId');
    if (read.saved) return read.saved;
    // There are no web accounts yet, so the account generation never changes under a read.
    var wait = read.verdict === 'wait';
    var kind = wait ? 'no_trade_respected' : 'read_complete';
    var thesis = { symbol: read.asset.symbol, isEquity: read.asset.isEquity, direction: read.direction, price: read.price, entry: null, stop: null, target: null };
    var award = S.award(wait ? 20 : 10, kind, thesis);
    var entry = {
      id: read.requestId, symbol: read.asset.symbol, name: read.asset.name, isEquity: read.asset.isEquity,
      verdict: read.verdict, direction: read.direction, price: orNull(read.price), support: orNull(read.support), resistance: orNull(read.resistance),
      entry: null, stop: null, target: null, asOf: read.asOf, provider: read.provider, savedAt: NW.iso(),
      horizonHours: wait ? null : (horizon || 24), points: award.points, synced: false
    };
    // R12: the ledger keeps it even at the daily cap.
    S.appendThesis(entry);
    var prog = S.progress();
    var result = {
      status: 'saved', awardedXP: award.points, capped: award.eventID == null, kind: kind,
      xp: prog.xp, level: S.levelJSON(prog.xp), streak: prog.streak,
      evolution: award.evolution, unlocks: award.drops, planting: 'signed_out', thesis: entry
    };
    S.markSaved(read, result);
    return result;
  };

  /* ---- collections ---- */
  D.theses = function () { return { items: S.theses() }; };
  D.record = function () { return { available: false, reason: 'no_source' }; };
  /** Trader Land needs an account; the web Núcleo has none yet, so this is the signed-out answer. */
  D.island = function () { return { available: false, reason: 'signed_out', pendingSeeds: S.pendingSeeds() }; };

  /* ---- suggestions: the local row, plus live movers only after consent (R11); cached 5 min ---- */
  var suggestionsCache = null;
  function topMovers(limit) {
    return NW.http('/api/bobby-asset-search?browse=1', { timeoutMs: SEARCH_TIMEOUT }).then(function (r) {
      var out = [], rows = isObj(r.json) && Array.isArray(r.json.movers) ? r.json.movers : [];
      rows.forEach(function (x) {
        if (!isObj(x) || typeof x.symbol !== 'string' || typeof x.change24h !== 'number' || !isFinite(x.change24h)) return;
        out.push({ symbol: x.symbol, name: prettyName(typeof x.name === 'string' ? x.name : x.symbol, x.symbol), changePct: x.change24h });
      });
      return out;
    }, function () { return []; }).then(function (out) {
      if (out.length) return out.slice(0, limit);
      return NW.http('/api/okx-tickers', { timeoutMs: SEARCH_TIMEOUT }).then(function (r) {
        var rows = isObj(r.json) && Array.isArray(r.json.tickers) ? r.json.tickers : [], list = [];
        rows.forEach(function (x) {
          if (!isObj(x) || typeof x.symbol !== 'string' || typeof x.change24h !== 'number' || !isFinite(x.change24h)) return;
          list.push({ symbol: x.symbol, name: x.symbol, changePct: x.change24h });
        });
        list.sort(function (a, b) { return Math.abs(b.changePct) - Math.abs(a.changePct); });
        return list.slice(0, limit);
      }, function () { return []; });
    });
  }
  D.suggestions = function () {
    var quick = S.quickAccess(5).map(function (s) { return { symbol: s }; });
    if (!S.riskAccepted()) return Promise.resolve({ quickAccess: quick, movers: [] });
    if (suggestionsCache && Date.now() - suggestionsCache.at < SUGGESTIONS_CACHE) return Promise.resolve({ quickAccess: quick, movers: suggestionsCache.movers });
    return topMovers(3).then(function (movers) {
      suggestionsCache = { at: Date.now(), movers: movers };
      return { quickAccess: quick, movers: movers };
    });
  };

  D.teardown = function () { D.cancel(); tokens = Object.create(null); };
})();
