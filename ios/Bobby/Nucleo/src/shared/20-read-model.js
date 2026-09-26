/* Núcleo read model (ARCHITECTURE.md §3.4): ask() reply -> what the engines show.
 * Pure functions, no DOM, no clock: the same input always yields the same model,
 * so hero frames stay deterministic and node can test it (tests/read-model.test.mjs).
 *
 * The only rule that matters here: every value shown comes from the reply.
 * When a field is missing, the element is dropped or degraded, never filled.
 */
(function (root) {
  'use strict';

  var S = {
    en: {
      'verdict.wait': 'Wait', 'verdict.review': 'Review',
      'ring.conviction': 'CONVICTION',
      'agent.alpha': 'ALPHA HUNTER', 'agent.red': 'RED TEAM', 'agent.cio': 'CIO',
      'sat.rsi': 'RSI 14', 'sat.hot': 'hot', 'sat.cold': 'cold',
      'sat.volume': 'Volume', 'sat.vsAvg': 'vs 20h avg',
      'sat.trend': 'Trend', 'sat.ema': 'EMA 20 / 50',
      'sat.range': 'Range', 'sat.range30': '30h low–high',
      'trend.up': 'Up', 'trend.down': 'Down', 'trend.sideways': 'Sideways',
      'chart.support': 'SUPPORT {price}', 'chart.resistance': 'RESISTANCE {price}',
      'chart.entry': 'ENTRY {price}', 'chart.stop': 'STOP {price}', 'chart.target': 'TARGET {price}',
      'chart.aboveSupport': 'above support', 'chart.belowSupport': 'below support',
      'spoken.close.wait': 'My call: wait.', 'spoken.close.review': 'My call: review.',
      'thesis.header': 'THESIS · {symbol}', 'thesis.title.wait': 'Wait on {symbol}.', 'thesis.title.review': 'Review {symbol}.',
      'row.price': 'PRICE AT READ', 'row.support': 'SUPPORT', 'row.resistance': 'RESISTANCE',
      'row.entry': 'REFERENCE ENTRY', 'row.stop': 'STOP', 'row.target': 'TARGET', 'row.trend': 'TREND · RSI',
      'thesis.line.wait': 'No trade planned. Saving records your decision.',
      'thesis.line.review': 'Review window: {hours}h.',
      'thesis.save': 'Save thesis', 'thesis.saved': 'Saved', 'thesis.savedLocal': 'Saved on this device',
      'xp.points': '+{points} discipline XP', 'xp.pointsWait': '+{points} discipline XP for waiting',
      'xp.capped': 'Saved · daily XP limit reached',
      'debate.title': '{n} agents · {s} s', 'debate.header': 'THE DEBATE',
      'meta': 'Educational read · not financial advice',
      'confirm.prompt': 'Did you mean {name} ({symbol})?', 'confirm.yes': 'Yes, {symbol}', 'confirm.no': 'Something else',
      'err.unknown': 'I couldn’t find an asset in that. Try the name or the ticker.',
      'err.unsupported': 'Bobby can’t read {name} yet. Try a stock or a crypto.',
      'err.unsupportedStale': 'The market data for {symbol} is too old to read right now.',
      'err.quota': 'Bobby reached today’s analysis limit. Try again tomorrow.',
      'err.tooLong': 'Your question is too long. Keep it to 1,200 characters or fewer.',
      'err.network': 'No connection. Nothing was analyzed.',
      'err.timeout': 'The desk took too long. No verdict was issued.',
      'err.bad': 'The analysis did not come back. No verdict was issued.',
      'follow.another': 'Another question about {symbol}', 'follow.how': 'How is {symbol} looking?', 'follow.why': 'Why is {symbol} moving today?',
      'aria.verdict': 'Verdict: {word}', 'aria.conviction': ', {pct}% conviction'
    },
    es: {
      'verdict.wait': 'Espera', 'verdict.review': 'Revisa',
      'ring.conviction': 'CONVICCIÓN',
      'agent.alpha': 'ALPHA HUNTER', 'agent.red': 'RED TEAM', 'agent.cio': 'CIO',
      'sat.rsi': 'RSI 14', 'sat.hot': 'caliente', 'sat.cold': 'frío',
      'sat.volume': 'Volumen', 'sat.vsAvg': 'vs prom. 20h',
      'sat.trend': 'Tendencia', 'sat.ema': 'EMA 20 / 50',
      'sat.range': 'Rango', 'sat.range30': 'mín–máx 30h',
      'trend.up': 'Alcista', 'trend.down': 'Bajista', 'trend.sideways': 'Lateral',
      'chart.support': 'SOPORTE {price}', 'chart.resistance': 'RESISTENCIA {price}',
      'chart.entry': 'ENTRADA {price}', 'chart.stop': 'STOP {price}', 'chart.target': 'OBJETIVO {price}',
      'chart.aboveSupport': 'sobre el soporte', 'chart.belowSupport': 'bajo el soporte',
      'spoken.close.wait': 'Mi lectura: esperar.', 'spoken.close.review': 'Mi lectura: revisar.',
      'thesis.header': 'TESIS · {symbol}', 'thesis.title.wait': 'Esperar con {symbol}.', 'thesis.title.review': 'Revisar {symbol}.',
      'row.price': 'PRECIO AL LEER', 'row.support': 'SOPORTE', 'row.resistance': 'RESISTENCIA',
      'row.entry': 'ENTRADA DE REFERENCIA', 'row.stop': 'STOP', 'row.target': 'OBJETIVO', 'row.trend': 'TENDENCIA · RSI',
      'thesis.line.wait': 'Sin operación planeada. Guardar registra tu decisión.',
      'thesis.line.review': 'Ventana de revisión: {hours} h.',
      'thesis.save': 'Guardar tesis', 'thesis.saved': 'Guardada', 'thesis.savedLocal': 'Guardada en este dispositivo',
      'xp.points': '+{points} XP de disciplina', 'xp.pointsWait': '+{points} XP de disciplina por esperar',
      'xp.capped': 'Guardada · límite diario de XP alcanzado',
      'debate.title': '{n} agentes · {s} s', 'debate.header': 'EL DEBATE',
      'meta': 'Lectura educativa · no es asesoría financiera',
      'confirm.prompt': '¿Te refieres a {name} ({symbol})?', 'confirm.yes': 'Sí, {symbol}', 'confirm.no': 'Otro activo',
      'err.unknown': 'No encontré un activo en eso. Prueba con el nombre o el ticker.',
      'err.unsupported': 'Bobby aún no puede leer {name}. Prueba una acción o una cripto.',
      'err.unsupportedStale': 'Los datos de {symbol} son demasiado viejos para leerlos ahora.',
      'err.quota': 'Bobby llegó al límite de análisis de hoy. Vuelve a intentarlo mañana.',
      'err.tooLong': 'Tu pregunta es demasiado larga. Usa 1,200 caracteres o menos.',
      'err.network': 'Sin conexión. No se analizó nada.',
      'err.timeout': 'La mesa tardó demasiado. No se emitió ningún veredicto.',
      'err.bad': 'El análisis no regresó. No se emitió ningún veredicto.',
      'follow.another': 'Otra pregunta sobre {symbol}', 'follow.how': '¿Cómo se ve {symbol}?', 'follow.why': '¿Por qué se mueve {symbol} hoy?',
      'aria.verdict': 'Veredicto: {word}', 'aria.conviction': ', {pct}% de convicción'
    }
  };

  var HUES = {
    alpha: '#3FE0B5', red: '#FF5A5F', cio: '#F6B94E'
  };
  var VERDICT = {
    wait: { hue: 'cio', color: HUES.cio, core: '#2A1C08', amb: '#19140D' },
    review: { hue: 'alpha', color: HUES.alpha, core: '#082A20', amb: '#0F1714' }
  };

  function lang2(l) { return l === 'es' ? 'es' : 'en'; }
  function t(lang, key, vars) {
    var s = S[lang2(lang)][key];
    if (s == null) s = S.en[key];
    if (s == null) return key;
    return s.replace(/\{(\w+)\}/g, function (_, k) { return vars && vars[k] != null ? String(vars[k]) : ''; });
  }
  function fin(v) { return typeof v === 'number' && isFinite(v); }

  /** BobbyAPI.money: >=1000 no decimals with grouping, >=1 two decimals, else four. */
  function money(v) {
    if (!fin(v)) return null;
    var a = Math.abs(v), sign = v < 0 ? '−' : '';
    if (a >= 1000) return sign + '$' + Math.round(a).toLocaleString('en-US');
    if (a >= 1) return sign + '$' + a.toFixed(2);
    return sign + '$' + a.toFixed(4);
  }
  function signedPct(v) {
    if (!fin(v)) return null;
    return (v > 0 ? '▲' : v < 0 ? '▼' : '') + Math.abs(v).toFixed(2) + '%';
  }
  function delta(v) {
    if (!fin(v)) return null;
    var a = Math.abs(v);
    var s = a >= 1000 ? Math.round(a).toLocaleString('en-US') : a >= 1 ? a.toFixed(2) : a.toFixed(4);
    return (v >= 0 ? '+' : '−') + s;
  }

  /** Sentence split that survives decimals ("225.1") and tickers: a stop must be followed by space + capital/opening mark. */
  function sentences(text) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return [];
    var out = [], start = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if ((c === '.' || c === '!' || c === '?') && s[i + 1] === ' ' && /[A-ZÁÉÍÓÚÑ¿¡"“(]/.test(s[i + 2] || '')) {
        out.push(s.slice(start, i + 1).trim());
        start = i + 2;
      }
    }
    if (start < s.length) out.push(s.slice(start).trim());
    return out;
  }
  function firstSentence(text) { return sentences(text)[0] || ''; }
  function clipWords(text, max) {
    if (text.length <= max) return text;
    var cut = text.slice(0, max + 1).replace(/\s+\S*$/, '');
    return cut.replace(/[,;:.\s]+$/, '') + '…';
  }

  /** Syllable estimate for karaoke timing (en/es vowel groups; numbers read as ~2 per 3 digits). */
  function syllables(word) {
    var w = String(word).toLowerCase();
    var digits = w.replace(/[^0-9]/g, '').length;
    if (digits) return Math.max(1, Math.round(digits * 0.9));
    var groups = w.replace(/[^a-záéíóúüñ]/g, '').match(/[aeiouyáéíóúü]+/g);
    var n = groups ? groups.length : 1;
    if (/[^aeiouy]e$/.test(w) && n > 1 && !/[áéíóú]/.test(w)) n -= 1; // silent e (en)
    return Math.max(1, n);
  }
  /** Estimated word timeline over `durationSec` (or a 2.6 words/s reading clock when null). */
  function wordTimes(text, durationSec) {
    var words = String(text || '').split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    var weights = words.map(function (w) {
      var p = /[.!?…]$/.test(w) ? 1.6 : /[,;:]$/.test(w) ? 0.8 : 0;
      return { syl: syllables(w), pause: p };
    });
    var total = weights.reduce(function (a, b) { return a + b.syl + b.pause; }, 0);
    var dur = fin(durationSec) && durationSec > 0 ? durationSec : words.length / 2.6;
    var k = dur / total, t0 = 0;
    return words.map(function (w, i) {
      var speak = weights[i].syl * k;
      var r = { word: w, t0: t0, t1: t0 + speak };
      t0 += speak + weights[i].pause * k;
      return r;
    });
  }

  function niceStep(span) {
    if (!(span > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(span)));
    var m = span / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }

  function closedVolumeRatio(candles, receivedAt) {
    var closed = candles.filter(function (c) {
      return c.v > 0 && (!fin(receivedAt) || c.t + 3600e3 <= receivedAt);
    });
    if (closed.length < 21) return null;
    var last = closed[closed.length - 1].v;
    var prev = closed.slice(-21, -1);
    var avg = prev.reduce(function (a, c) { return a + c.v; }, 0) / prev.length;
    if (!(avg > 0)) return null;
    return Math.round((last / avg) * 10) / 10;
  }

  function pulseAgrees(r) {
    var p = r.pulse, a = r.agents;
    if (!p || !fin(p.convictionPct)) return false;
    if (a.verdict !== 'review' || a.direction === 'none' || p.direction !== a.direction) return false;
    if (p.source === 'intel') return true; // intel covers the same symbol the desk read
    var inst = String(p.instrument || '').split('-').slice(0, 2).join('-');
    return !!inst && inst === r.provenance.instrument;
  }
  function planOf(r) {
    if (!pulseAgrees(r) || !r.pulse.plan) return null;
    var p = r.pulse.plan;
    if (!fin(p.entry) || !fin(p.stop) || !fin(p.target) || p.direction !== r.agents.direction) return null;
    var ok = p.direction === 'long' ? (p.stop < p.entry && p.entry < p.target)
      : p.direction === 'short' ? (p.target < p.entry && p.entry < p.stop) : false;
    return ok ? { entry: p.entry, stop: p.stop, target: p.target, rewardRisk: fin(p.rewardRisk) ? p.rewardRisk : null } : null;
  }

  function buildSatellites(r, lang, firstRead) {
    var tech = r.technicals || {}, m = r.market || {}, c = r.candles || [];
    var price = fin(m.price) ? m.price : tech.price;
    var sats = [];
    if (fin(price)) {
      var prev = c.length >= 2 ? c[c.length - 2].c : null;
      sats.push({ slot: 'UL', id: 'price', key: r.asset.symbol, value: money(price), from: fin(prev) ? money(prev) : null,
        delta: signedPct(m.changePct), dot: !fin(m.changePct) || m.changePct === 0 ? 'neutral' : m.changePct > 0 ? 'alpha' : 'red' });
    }
    if (fin(tech.rsi14)) {
      var mo = tech.momentum;
      sats.push({ slot: 'UR', id: 'rsi', key: t(lang, 'sat.rsi'), value: String(Math.round(tech.rsi14)), from: null,
        delta: mo === 'overbought' ? t(lang, 'sat.hot') : mo === 'oversold' ? t(lang, 'sat.cold') : null,
        dot: mo === 'overbought' || mo === 'oversold' ? 'red' : 'neutral' });
    }
    var vr = closedVolumeRatio(c, r.receivedAt);
    if (vr != null) {
      sats.push({ slot: 'LR', id: 'volume', key: t(lang, 'sat.volume'), value: vr.toFixed(1) + '×', from: null, delta: t(lang, 'sat.vsAvg'), dot: 'neutral' });
    } else if (tech.trend) {
      sats.push({ slot: 'LR', id: 'trend', key: t(lang, 'sat.trend'), value: t(lang, 'trend.' + tech.trend), from: null, delta: t(lang, 'sat.ema'),
        dot: tech.trend === 'up' ? 'alpha' : tech.trend === 'down' ? 'red' : 'neutral' });
    }
    if (fin(tech.support) && fin(tech.resistance)) {
      sats.push({ slot: 'LL', id: 'range', key: t(lang, 'sat.range'), value: money(tech.support) + '–' + money(tech.resistance), from: null,
        delta: t(lang, 'sat.range30'), dot: 'neutral' });
    }
    return sats.slice(0, firstRead ? 3 : 4);
  }

  function buildChart(r, lang, plan) {
    var c = r.candles || [];
    if (c.length < 10) return null;
    var pts = c.slice(-48);
    var closes = pts.map(function (x) { return x.c; });
    var tech = r.technicals || {};
    var lines = [];
    if (fin(tech.support)) lines.push({ kind: 'support', price: tech.support, label: t(lang, 'chart.support', { price: money(tech.support) }) });
    if (fin(tech.resistance)) lines.push({ kind: 'resistance', price: tech.resistance, label: t(lang, 'chart.resistance', { price: money(tech.resistance) }) });
    if (plan) {
      ['entry', 'stop', 'target'].forEach(function (k) {
        lines.push({ kind: k, price: plan[k], label: t(lang, 'chart.' + k, { price: money(plan[k]) }) });
      });
    }
    var vals = closes.concat(lines.map(function (l) { return l.price; }));
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.004 || 1;
    lo -= pad; hi += pad;
    var step = niceStep((hi - lo) / 3);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    var grid = [];
    for (var g = lo + step; g < hi - step * 0.5 && grid.length < 2; g += step) grid.push(+g.toFixed(10));
    var now = pts[pts.length - 1];
    var band = null, bracket = null;
    if (fin(tech.support)) {
      var atr = fin(tech.atrPct) && fin(now.c) ? now.c * tech.atrPct / 100 : 0;
      var top = Math.min(tech.support + atr, Math.max(tech.support, now.c));
      band = { lo: tech.support, hi: top > tech.support ? top : tech.support, label: t(lang, 'chart.support', { price: money(tech.support) }) };
      var d = now.c - tech.support;
      bracket = { from: now.c, to: tech.support, label: delta(d), sub: t(lang, d >= 0 ? 'chart.aboveSupport' : 'chart.belowSupport'),
        pct: fin(d / tech.support) ? Math.round((d / tech.support) * 1000) / 10 : null };
    }
    return {
      times: pts.map(function (x) { return x.t; }), closes: closes,
      domain: [lo, hi], gridlines: grid,
      now: { price: now.c, t: now.t, label: money(now.c) },
      band: band, lines: lines, bracket: bracket,
      source: { timeframe: r.provenance.timeframe, provider: r.provenance.provider, instrument: r.provenance.instrument, asOf: r.provenance.asOf }
    };
  }

  function buildSpoken(r, lang) {
    var cio = sentences(r.agents.cio);
    var picked = [], used = 0;
    for (var i = 0; i < cio.length; i++) {
      if (picked.length && used + cio[i].length + 1 > 600) break;
      picked.push(i === 0 && cio[i].length > 600 ? clipWords(cio[i], 600) : cio[i]);
      used += cio[i].length + 1;
    }
    var close = t(lang, 'spoken.close.' + r.agents.verdict);
    var all = picked.concat([close]);
    var text = all.join(' ');
    var words = text.split(/\s+/).filter(Boolean);
    var vword = t(lang, 'spoken.close.' + r.agents.verdict).split(/\s+/).pop().replace(/[.!?]$/, '');
    var vIndex = -1;
    for (var w = words.length - 1; w >= 0; w--) {
      if (words[w].replace(/[.!?,;:]$/, '').toLowerCase() === vword.toLowerCase()) { vIndex = w; break; }
    }
    return {
      text: text, sentences: all, words: words,
      verdictWordIndex: vIndex,
      stageAt: { evidence: 0, chart: picked.length >= 2 ? 1 : null, verdict: picked.length }
    };
  }

  function build(r, opts) {
    opts = opts || {};
    if (!r || r.status !== 'ok') throw new Error('build() needs an ok ask() reply');
    var lang = lang2(opts.lang || r.language);
    var v = r.agents.verdict === 'review' ? 'review' : 'wait';
    var agrees = pulseAgrees(r);
    var plan = planOf(r);
    var tech = r.technicals || {};
    var price = fin(r.market && r.market.price) ? r.market.price : tech.price;
    var word = t(lang, 'verdict.' + v);
    var ring = agrees ? { mode: 'conviction', pct: Math.max(0, Math.min(100, Math.round(r.pulse.convictionPct))), label: t(lang, 'ring.conviction') }
      : { mode: 'complete', pct: null, label: null };
    var rows = [{ id: 'price', label: t(lang, 'row.price'), value: money(price) }];
    if (plan) {
      rows.push({ id: 'entry', label: t(lang, 'row.entry'), value: money(plan.entry) });
      rows.push({ id: 'stop', label: t(lang, 'row.stop'), value: money(plan.stop) });
      rows.push({ id: 'target', label: t(lang, 'row.target'), value: money(plan.target) });
    } else {
      if (fin(tech.support)) rows.push({ id: 'support', label: t(lang, 'row.support'), value: money(tech.support) });
      if (fin(tech.resistance)) rows.push({ id: 'resistance', label: t(lang, 'row.resistance'), value: money(tech.resistance) });
    }
    if (tech.trend || fin(tech.rsi14)) {
      rows.push({ id: 'trend', label: t(lang, 'row.trend'),
        value: [tech.trend ? t(lang, 'trend.' + tech.trend) : null, fin(tech.rsi14) ? 'RSI ' + Math.round(tech.rsi14) : null].filter(Boolean).join(' · ') });
    }
    var sym = r.asset.symbol;
    return {
      requestId: r.requestId, symbol: sym, name: r.asset.name, isEquity: !!r.asset.isEquity, question: r.question, lang: lang,
      verdict: { key: v, word: word, hue: VERDICT[v].hue, color: VERDICT[v].color, core: VERDICT[v].core, amb: VERDICT[v].amb,
        direction: r.agents.direction },
      ring: ring,
      agents: ['alpha', 'red', 'cio'].map(function (k) {
        return { id: k, name: t(lang, 'agent.' + k), hue: HUES[k], stance: firstSentence(r.agents[k]), full: r.agents[k] };
      }),
      satellites: buildSatellites(r, lang, !!opts.firstRead),
      chart: buildChart(r, lang, plan),
      plan: plan,
      spoken: buildSpoken(r, lang),
      thesis: {
        header: t(lang, 'thesis.header', { symbol: sym }),
        title: t(lang, 'thesis.title.' + v, { symbol: sym }),
        rows: rows,
        horizon: { show: !!opts.signedIn && v === 'review', options: [24, 72, 168], defaultHours: 24 },
        line: v === 'wait' ? t(lang, 'thesis.line.wait') : t(lang, 'thesis.line.review', { hours: 24 }),
        saveLabel: t(lang, 'thesis.save'),
        savedLabel: t(lang, opts.signedIn ? 'thesis.saved' : 'thesis.savedLocal'),
        pill: sym + ' · ' + word.toUpperCase()
      },
      debate: {
        header: t(lang, 'debate.header'),
        title: t(lang, 'debate.title', { n: 3, s: fin(r.elapsedMs) ? Math.max(1, Math.round(r.elapsedMs / 1000)) : '—' }),
        entries: ['alpha', 'red', 'cio'].map(function (k) { return { id: k, name: t(lang, 'agent.' + k), hue: HUES[k], text: r.agents[k] }; })
      },
      meta: t(lang, 'meta'),
      aria: t(lang, 'aria.verdict', { word: word }) + (ring.pct != null ? t(lang, 'aria.conviction', { pct: ring.pct }) : '')
    };
  }

  /** XP chip copy from the REAL awarded points (0 = daily cap). */
  function xpChip(points, verdictKey, lang) {
    if (!(points > 0)) return t(lang, 'xp.capped');
    return t(lang, verdictKey === 'wait' ? 'xp.pointsWait' : 'xp.points', { points: points });
  }

  /** Non-ok replies -> caption + chips. Never a verdict, never XP. */
  function failure(r, lang) {
    lang = lang2(lang);
    switch (r && r.status) {
      case 'confirm':
        return { kind: 'confirm', caption: t(lang, 'confirm.prompt', { name: r.asset.name, symbol: r.asset.symbol }), sub: r.proxyNote || null,
          chips: [{ label: t(lang, 'confirm.yes', { symbol: r.asset.symbol }), action: { token: r.token }, primary: true },
            { label: t(lang, 'confirm.no'), action: { retype: true } }] };
      case 'unknown_asset':
        return { kind: 'unknown', caption: t(lang, 'err.unknown'), sub: null,
          chips: (r.suggestions || []).slice(0, 3).map(function (s) {
            return { label: s.name && s.name !== s.symbol ? s.name + ' (' + s.symbol + ')' : s.symbol, action: { token: s.token } };
          }) };
      case 'unsupported':
        return { kind: 'unsupported', caption: r.reason === 'stale_data' || r.reason === 'thin_data'
          ? t(lang, 'err.unsupportedStale', { symbol: r.asset.symbol }) : t(lang, 'err.unsupported', { name: r.asset.name || r.asset.symbol }), sub: null, chips: [] };
      case 'too_long': return { kind: 'too_long', caption: r.message || t(lang, 'err.tooLong'), sub: null, chips: [] };
      case 'quota': return { kind: 'quota', caption: r.message || t(lang, 'err.quota'), sub: null, chips: [], retryAfterSec: r.retryAfterSec };
      case 'cancelled': return { kind: 'cancelled', caption: null, sub: null, chips: [] };
      case 'error':
        var key = r.code === 'network' ? 'err.network' : r.code === 'timeout' ? 'err.timeout' : 'err.bad';
        return { kind: 'error', code: r.code, caption: r.message || t(lang, key), sub: null, chips: [] };
      default:
        return { kind: 'error', code: 'bad_reply', caption: t(lang, 'err.bad'), sub: null, chips: [] };
    }
  }

  /** Follow-up chips after a save (§3.2 FOLLOWUPS): "Another question about {SYM}" (a follow-up of this read), then up to
   *  2 REAL symbols from suggestions() (quickAccess first, then movers), never the current one. No invented questions. */
  function followUps(model, sugg, lang, opts) {
    lang = lang2(lang); opts = opts || {};
    var sym = String(model.symbol || '').toUpperCase();
    var out = [{ label: t(lang, 'follow.another', { symbol: sym }), action: { followUpOf: model.requestId, symbol: sym } }];
    var seen = {}; seen[sym] = 1;
    var qa = (sugg && sugg.quickAccess) || [], mv = (sugg && sugg.movers) || [];
    qa.map(function (s) { return { s: s, kind: 'quick' }; }).concat(mv.map(function (s) { return { s: s, kind: 'mover' }; })).forEach(function (x) {
      var s = String(x.s && x.s.symbol || '').toUpperCase();
      if (out.length >= 3 || !/^[A-Z0-9][A-Z0-9.\-]{0,11}$/.test(s) || seen[s]) return;
      seen[s] = 1;
      var q = t(lang, x.kind === 'mover' && opts.whyForMovers ? 'follow.why' : 'follow.how', { symbol: s });
      out.push({ label: q, action: { question: q, symbol: s } });
    });
    return out;
  }

  /** A saved ledger Thesis (§2.7) -> the read-only thesis card, the ghost satellite and the Theses face. */
  function thesisView(th, lang, opts) {
    lang = lang2(lang); opts = opts || {};
    var v = th.verdict === 'review' ? 'review' : 'wait', sym = String(th.symbol || '');
    var word = t(lang, 'verdict.' + v);
    var rows = [{ id: 'price', label: t(lang, 'row.price'), value: money(th.price) }];
    if (fin(th.entry) || fin(th.stop) || fin(th.target)) {
      if (fin(th.entry)) rows.push({ id: 'entry', label: t(lang, 'row.entry'), value: money(th.entry) });
      if (fin(th.stop)) rows.push({ id: 'stop', label: t(lang, 'row.stop'), value: money(th.stop) });
      if (fin(th.target)) rows.push({ id: 'target', label: t(lang, 'row.target'), value: money(th.target) });
    } else {
      if (fin(th.support)) rows.push({ id: 'support', label: t(lang, 'row.support'), value: money(th.support) });
      if (fin(th.resistance)) rows.push({ id: 'resistance', label: t(lang, 'row.resistance'), value: money(th.resistance) });
    }
    rows = rows.filter(function (r) { return r.value != null; });
    return {
      id: th.id, symbol: sym,
      verdict: { key: v, word: word, color: VERDICT[v].color },
      header: t(lang, 'thesis.header', { symbol: sym }),
      title: t(lang, 'thesis.title.' + v, { symbol: sym }),
      rows: rows,
      line: v === 'wait' ? t(lang, 'thesis.line.wait') : t(lang, 'thesis.line.review', { hours: fin(th.horizonHours) ? th.horizonHours : 24 }),
      saveLabel: t(lang, 'thesis.save'),
      savedLabel: t(lang, opts.signedIn ? 'thesis.saved' : 'thesis.savedLocal'),
      pill: sym + ' · ' + word.toUpperCase(),
      price: money(th.price),
      points: fin(th.points) ? th.points : 0,
      asOf: th.asOf || null
    };
  }

  root.NucleoReadModel = {
    v: 1, STRINGS: S, HUES: HUES, VERDICT: VERDICT,
    t: t, money: money, signedPct: signedPct,
    sentences: sentences, firstSentence: firstSentence, clipWords: clipWords,
    syllables: syllables, wordTimes: wordTimes,
    build: build, failure: failure, xpChip: xpChip, followUps: followUps, thesisView: thesisView,
    _internal: { pulseAgrees: pulseAgrees, planOf: planOf, closedVolumeRatio: closedVolumeRatio, niceStep: niceStep }
  };
})(typeof window !== 'undefined' ? window : globalThis);
