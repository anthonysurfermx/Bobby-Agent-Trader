// The web transport (src/web/*.js) against scripted HTTP replies: no network, no quota.
//   node nucleo/tests/web-transport.test.mjs
// Each scenario loads shared/10-bridge.js + web/*.js into a fresh VM context with small browser
// shims, then talks to it exactly like an engine does: nucleoBridge.call(method, params).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'src');
const REPO = path.join(HERE, '..', '..');
const built = fs.readFileSync(path.join(REPO, 'public', 'nucleo', 'index.html'), 'utf8');
const CATALOG = JSON.parse(built.match(/window\.NUCLEO_WEB=(\{.*?\});<\/script>/)[1]);
const WEB = fs.readdirSync(path.join(SRC, 'web')).filter((n) => n.endsWith('.js')).sort();
const CODE = [fs.readFileSync(path.join(SRC, 'shared', '10-bridge.js'), 'utf8')]
  .concat(WEB.map((n) => fs.readFileSync(path.join(SRC, 'web', n), 'utf8')));

let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error('  FAIL', msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function storage(seed) {
  const m = new Map(Object.entries(seed || {}).map(([k, v]) => [k, JSON.stringify(v)]));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
function reply(status, body, headers) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: headers || { 'content-type': 'application/json' } });
}
const ONBOARDED = { 'nucleo.profile': { companionId: 'mira', onboarded: true, riskVersion: CATALOG.riskNotice.version, muted: false, voiceId: 'alloy' } };

/** A fresh page. `routes(url, init)` answers fetch (undefined → network error). */
function page({ page: name = 'app', ls, routes, recognizer, lang = 'en' } = {}) {
  const calls = [], events = [], nav = [];
  const listeners = {};
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, performance, AbortController, URLSearchParams, Response,
    crypto: webcrypto, TextEncoder, DOMException, Event: class { constructor(t) { this.type = t; } },
    localStorage: storage(ls), sessionStorage: storage(),
    location: { search: `?lang=${lang}`, hash: '', pathname: '/nucleo/', replace: (u) => nav.push(['replace', u]), assign: (u) => nav.push(['assign', u]) },
    navigator: { languages: [lang], language: lang, userAgent: 'node', maxTouchPoints: 0,
      mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } },
    isSecureContext: true,
    requestAnimationFrame: (f) => setTimeout(() => f(performance.now()), 16),
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    matchMedia: () => ({ matches: false }),
    document: {
      hidden: false, body: { getAttribute: (k) => (k === 'data-page' ? name : null), appendChild() {} }, head: { appendChild() {} },
      documentElement: { classList: { add() {}, remove() {}, contains: () => false }, style: {} },
      addEventListener() {}, removeEventListener() {}, getElementById: () => null, activeElement: null,
      createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, classList: { add() {}, remove() {} } }),
    },
    fetch: async (url, init = {}) => {
      calls.push([init.method || 'GET', url, init.body ? JSON.parse(init.body) : null]);
      const r = routes ? await routes(url, init, calls) : undefined;
      if (r === 'hang') return new Promise((_, rej) => init.signal && init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
      if (!r) throw new TypeError('Failed to fetch');
      return r;
    },
  };
  if (recognizer) sandbox.webkitSpeechRecognition = recognizer;
  sandbox.window = sandbox;
  sandbox.NUCLEO_WEB = CATALOG;
  vm.createContext(sandbox);
  for (const c of CODE) vm.runInContext(c, sandbox);
  const B = sandbox.nucleoBridge;
  B.EVENTS.forEach((n) => B.on(n, (p) => events.push([n, p])));
  return { B, calls, events, nav, sandbox, call: (m, p) => B.call(m, p || {}) };
}

/* ---- scripted backend ---- */
const HOUR = 3600e3;
function bars(n, lastAgoMs) {
  const end = Date.now() - lastAgoMs;
  return Array.from({ length: n }, (_, i) => ({ ts: String(end - (n - 1 - i) * HOUR), open: '100', high: '101', low: '99', close: String(100 + i / 10), volume: i % 3 ? '5' : null }));
}
const RESOLVED = (symbol, assetClass, extra = {}) => ({ ok: true, results: [], resolved: { baseSymbol: symbol, symbol, assetClass, aliases: [symbol, extra.alias || symbol] },
  resolution: { needsConfirmation: !!extra.confirm, matchKind: extra.confirm ? 'fuzzy' : 'exact', proxyNote: extra.proxyNote || null } });
const DEBATE_OK = { agents: { alpha: 'Alpha text.', red: 'Red text.', cio: 'CIO text.', verdict: 'wait', direction: 'sideways?' },
  technicals: { price: '225.1', rsi14: 63.8, support: 221.1, resistance: 230, trend: 'alcista', momentum: 'sobrecompra' },
  provenance: { provider: 'Yahoo Finance', instrument: 'NVDA', assetType: 'equity', timeframe: '1H', asOf: '2026-09-25T20:00:00.000Z' } };
function backend({ search, candles, desk, pulse } = {}) {
  return async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : null;
    if (url === '/api/bobby-asset-search') return reply(200, search ? search(body) : RESOLVED('NVDA', 'equity', { alias: 'NVIDIA' }));
    if (url.startsWith('/api/stock-candles') || url.startsWith('/api/okx-candles')) return candles ? candles(url) : reply(200, { ok: true, candles: bars(50, HOUR) });
    if (url === '/api/voice-tool' && body.tool === 'get_market') return reply(200, { price: 225.07, change_24h_pct: 0.22 });
    if (url === '/api/voice-tool' && body.tool === 'run_debate') return pulse ? pulse() : reply(200, { technical_pulse: { signal: 'neutral', direction: 'none', conviction_pct: 10, trade_plan: { stop: null } } });
    if (url === '/api/desk-debate') return desk ? desk(body) : reply(200, DEBATE_OK);
    if (url.startsWith('/api/bobby-asset-search?browse=1')) return reply(200, { ok: true, movers: [{ symbol: 'SOL', name: 'SOLANA', change24h: 7.5 }] });
    return undefined;
  };
}
const deskCalls = (p) => p.calls.filter((c) => c[1] === '/api/desk-debate').length;

/* ---------------------------------------------------------------------------------------- */
async function run() {
  // Routing
  {
    const p = page({ page: 'app' });
    await sleep(5);
    eq(p.nav[0], ['replace', '/nucleo/onboarding.html?lang=en'], 'first visit on / goes to onboarding');
    let answered = false; p.call('session', { page: 'app' }).then(() => { answered = true; });
    await sleep(30); ok(!answered, 'a redirected page never answers session()');
  }
  {
    const p = page({ page: 'app', ls: { 'nucleo.profile': { companionId: 'mira', onboarded: true, riskVersion: 0 } } });
    await sleep(5);
    eq(p.nav[0], ['replace', '/nucleo/onboarding.html?lang=en#risk'], 'stale risk notice goes to onboarding#risk');
  }
  {
    const p = page({ page: 'onboarding', ls: ONBOARDED });
    await sleep(5);
    eq(p.nav[0], ['replace', '/nucleo/?lang=en'], 'a returning visitor on onboarding goes to the app');
  }

  // Session, roster, notice, consent, onboarding
  {
    const p = page({ page: 'onboarding', recognizer: class {} });
    const s = await p.call('session', { page: 'onboarding' });
    eq([s.v, s.page, s.firstRun, s.onboarded, s.platform, s.signedIn, s.signInAvailable, s.riskAccepted, s.fixtures, s.companion, s.xp],
      [1, 'onboarding', true, false, 'web', false, false, false, false, null, 0], 'first-run session');
    eq(s.mic, { state: 'undetermined', onDevice: false }, 'mic before permission (web speech is never on-device)');
    const r = await p.call('roster');
    eq(r.companions.length, 18, 'roster has 18 companions');
    eq(r.companions.filter((c) => c.requiredLevel === 1 && c.unlocked).length, 10, '10 starters are unlocked');
    eq(r.companions[0].webId, 'bobby', 'orb is bobby on the web art');
    const n = await p.call('riskNotice');
    eq([n.version, n.statements.length], [CATALOG.riskNotice.version, 4], 'risk notice v4 with 4 statements');
    await p.call('setCompanion', { id: 'glitch' }).then(() => ok(false, 'locked companion must fault'), (e) => eq(e.code, 'invalid_params', 'locked companion faults'));
    const s2 = await p.call('setCompanion', { id: 'kora' });
    eq([s2.companion.id, s2.companion.voicePersona], ['kora', 'coral'], 'setCompanion commits companion and voice');
    eq(await p.call('finishOnboarding'), { status: 'incomplete', missing: ['risk'] }, 'finish needs the risk notice');
    eq(await p.call('acceptRisk', { version: 1 }), { accepted: false, version: CATALOG.riskNotice.version }, 'stale version is refused');
    eq(await p.call('acceptRisk', { version: CATALOG.riskNotice.version }), { accepted: true, version: CATALOG.riskNotice.version }, 'current version accepted');
    eq(await p.call('finishOnboarding'), { next: 'app' }, 'finish when complete');
    await sleep(450);
    eq(p.nav.at(-1), ['replace', '/nucleo/?lang=en'], 'finish fades to the app');
    eq(await p.call('signIn'), { status: 'unavailable' }, 'no sign-in on the web');
  }

  // ask: gates before any network
  {
    const p = page({ page: 'onboarding', routes: backend() });
    await p.call('session', { page: 'onboarding' });
    eq(await p.call('ask', { question: 'How is NVDA?' }), { v: 1, status: 'error', code: 'risk_not_accepted', message: null }, 'risk gate');
    eq(p.calls.length, 0, 'risk gate touches no network');
  }
  {
    const p = page({ ls: ONBOARDED, routes: backend() });
    await p.call('session', { page: 'app' });
    const r = await p.call('ask', { question: 'x'.repeat(1201) });
    eq([r.status, r.maxLength], ['too_long', 1200], 'too long');
    eq(p.calls.length, 0, 'too long touches no network');
    await p.call('ask', { question: '   ' }).then(() => ok(false, 'blank must fault'), (e) => eq(e.code, 'invalid_params', 'blank question faults'));
    await p.call('ask', { token: 't', question: 'q' }).then(() => ok(false, 'token+question must fault'), (e) => eq(e.code, 'invalid_params', 'token takes no question'));
    await p.call('ask', { followUpOf: 'nope', question: 'q' }).then(() => ok(false, 'bad followUpOf'), (e) => eq(e.code, 'invalid_params', 'followUpOf must be a uuid'));
  }

  // ask: the ok path, order of stages and bodies
  {
    const p = page({ ls: ONBOARDED, routes: backend() });
    await p.call('session', { page: 'app' });
    const r = await p.call('ask', { question: '  Should I buy NVIDIA?  ' });
    eq(r.status, 'ok', 'ok read');
    eq(r.asset, { symbol: 'NVDA', name: 'Nvidia', isEquity: true }, 'asset named like the app (prettyName)');
    eq(r.agents.direction, 'none', 'unknown direction becomes none');
    eq([r.technicals.price, r.technicals.trend, r.technicals.momentum], [225.1, 'up', 'overbought'], 'technicals normalized');
    eq(r.candles.length, 50, 'candles kept');
    ok(r.candles.every((c, i, a) => i === 0 || a[i - 1].t < c.t) && r.candles[1].v === 5 && r.candles[0].v === 0, 'candles sorted, volume defaults to 0');
    eq(r.pulse && r.pulse.plan, null, 'plan is null without a numeric level');
    const stages = p.events.filter((e) => e[0] === 'ask.stage').map((e) => e[1].stage);
    eq(stages, ['resolving', 'accepted', 'market', 'candles'], 'stage order');
    const desk = p.calls.find((c) => c[1] === '/api/desk-debate');
    eq(desk[2], { symbol: 'NVDA', question: 'Should I buy NVIDIA?', language: 'en', assetType: 'equity' }, 'desk body is the app body');
    eq(p.calls.find((c) => c[1] === '/api/bobby-asset-search')[2], { q: 'Should I buy NVIDIA?' }, 'asset search is a POST with the question');
    ok(p.calls.some((c) => c[1] === '/api/stock-candles?symbol=NVDA&range=7d&interval=1h'), 'equity 1H candles');
    const s = await p.call('session', {});
    eq(s.pendingRead && s.pendingRead.requestId, r.requestId, 'an unsaved ok read is pendingRead');

    // save → XP (R4), idempotent; the ledger keeps it
    const sv = await p.call('saveThesis', { requestId: r.requestId });
    eq([sv.status, sv.awardedXP, sv.kind, sv.capped, sv.planting, sv.xp, sv.streak], ['saved', 20, 'no_trade_respected', false, 'signed_out', 20, 1], 'save a Wait');
    eq(sv.unlocks.map((u) => u.id), ['mira-1'], 'the first XP drops tier-1 gear');
    eq(await p.call('saveThesis', { requestId: r.requestId }), sv, 'save is idempotent');
    eq((await p.call('theses')).items.map((t) => [t.symbol, t.verdict, t.points]), [['NVDA', 'wait', 20]], 'ledger');
    eq((await p.call('session', {})).pendingRead, null, 'a saved read is not pending');
    eq(await p.call('island'), { available: false, reason: 'signed_out', pendingSeeds: 1 }, 'island signed out');
    // follow-up reuses the asset without a search
    const before = p.calls.filter((c) => c[1] === '/api/bobby-asset-search').length;
    const f = await p.call('ask', { followUpOf: r.requestId, question: 'And tomorrow?' });
    eq([f.status, p.calls.filter((c) => c[1] === '/api/bobby-asset-search').length], ['ok', before], 'follow-up skips the search');
    // the daily cap: 3 awards, then 0 but still in the ledger
    const f2 = await p.call('ask', { followUpOf: r.requestId, question: 'Third?' });
    const f3 = await p.call('ask', { followUpOf: r.requestId, question: 'Fourth?' });
    await p.call('saveThesis', { requestId: f.requestId }); await p.call('saveThesis', { requestId: f2.requestId });
    const capped = await p.call('saveThesis', { requestId: f3.requestId });
    eq([capped.awardedXP, capped.capped, capped.xp], [0, true, 60], 'fourth save of the day is capped');
    eq((await p.call('theses')).items.length, 4, 'capped saves still reach the ledger');
    await p.call('saveThesis', { requestId: '00000000-0000-4000-8000-000000000000' }).then(() => ok(false, 'unknown id'), (e) => eq(e.code, 'invalid_params', 'unknown requestId faults'));
  }

  // desk refusals and failures: never a verdict
  const cases = [
    ['429 quota', () => reply(429, { error: 'Bobby reached today’s analysis limit.', code: 'daily_limit' }, { 'content-type': 'application/json', 'retry-after': '3600' }),
      (r) => eq([r.status, r.retryAfterSec, typeof r.message], ['quota', 3600, 'string'], '429 → quota with Retry-After')],
    ['400 too long', () => reply(400, { error: 'too long', code: 'question_too_long' }), (r) => eq([r.status, r.message], ['too_long', 'too long'], '400 → too_long')],
    ['503 failed', () => reply(503, { error: 'No verdict was issued.', code: 'analysis_failed' }), (r) => eq([r.status, r.code, r.message], ['error', 'analysis_failed', 'No verdict was issued.'], '503 → analysis_failed')],
    ['503 unavailable', () => reply(503, { error: 'Unavailable.', code: 'desk_unavailable' }), (r) => eq([r.status, r.code], ['error', 'desk_unavailable'], '503 → desk_unavailable')],
    ['504 html', () => reply(504, '<html>gateway</html>', { 'content-type': 'text/html' }), (r) => eq([r.status, r.code], ['error', 'bad_response'], '504 → bad_response')],
    ['200 bad verdict', () => reply(200, { agents: { alpha: 'a', red: 'r', cio: 'c', verdict: 'buy' } }), (r) => eq([r.status, r.code], ['error', 'bad_response'], 'a verdict outside wait/review is bad_response')],
    ['network', () => undefined, (r) => eq([r.status, r.code], ['error', 'network'], 'transport error → network')],
  ];
  for (const [label, desk, check] of cases) {
    const p = page({ ls: ONBOARDED, routes: backend({ desk }) });
    await p.call('session', { page: 'app' });
    const r = await p.call('ask', { question: `case ${label}` });
    check(r);
    ok(!('agents' in r), `${label}: no verdict on a failure`);
  }

  // preflight: nothing the desk cannot chart spends quota (R14)
  {
    const p = page({ ls: ONBOARDED, routes: backend({ candles: () => reply(200, { ok: true, candles: bars(50, 6 * 86400e3) }) }) });
    await p.call('session', { page: 'app' });
    const r = await p.call('ask', { question: 'stale equity' });
    eq([r.status, r.reason, deskCalls(p)], ['unsupported', 'stale_data', 0], 'equity bar older than 5 days');
  }
  {
    const p = page({ ls: ONBOARDED, routes: backend({ search: () => RESOLVED('BTC', 'crypto'), candles: () => reply(200, { ok: true, data: bars(40, HOUR) }) }) });
    await p.call('session', { page: 'app' });
    const r = await p.call('ask', { question: 'thin crypto' });
    eq([r.status, r.reason, deskCalls(p)], ['unsupported', 'thin_data', 0], 'crypto under 59 bars');
    ok(p.calls.some((c) => c[1] === '/api/okx-candles?instId=BTC-USDT&bar=1H&limit=100'), 'crypto 1H candles');
  }
  {
    const p = page({ ls: ONBOARDED, routes: backend({ candles: () => reply(502, { error: 'No chart data' }) }) });
    await p.call('session', { page: 'app' });
    eq((await p.call('ask', { question: 'no candles' })).reason, 'thin_data', 'a non-2xx candle reply is thin data');
    eq(deskCalls(p), 0, 'and spends no quota');
  }
  {
    const p = page({ ls: ONBOARDED, routes: backend({ search: () => RESOLVED('XAUT', 'commodity', { confirm: true, proxyNote: 'Tether Gold' }) }) });
    await p.call('session', { page: 'app' });
    const c = await p.call('ask', { question: 'gold?' });
    eq([c.status, c.asset.assetClass, c.proxyNote], ['confirm', 'commodity', 'Tether Gold'], 'a guess needs confirmation');
    const u = await p.call('ask', { token: c.token });
    eq([u.status, u.reason, deskCalls(p)], ['unsupported', 'asset_class', 0], 'a commodity never reaches the desk');
    await p.call('ask', { token: c.token }).then(() => ok(false, 'reuse'), (e) => eq(e.code, 'invalid_params', 'tokens are single use'));
  }
  {
    const search = (b) => (b.limit ? { ok: true, results: [{ symbol: 'NVDA', aliases: ['NVDA', 'NVIDIA'], assetClass: 'equity' }, { symbol: 'NVDA' }, { symbol: 'BTC', aliases: ['BTC', 'BITCOIN'] }] } : { ok: true, results: [], resolved: null, resolution: null });
    const p = page({ ls: ONBOARDED, routes: backend({ search }) });
    await p.call('session', { page: 'app' });
    const u = await p.call('ask', { question: 'hello there' });
    eq([u.status, u.suggestions.map((s) => [s.symbol, s.name, s.assetClass])], ['unknown_asset', [['NVDA', 'Nvidia', 'equity'], ['BTC', 'Bitcoin', 'crypto']]], 'unknown asset suggestions');
    ok(u.suggestions.every((s) => typeof s.token === 'string'), 'each suggestion carries a token');
  }

  // busy and cancel
  {
    const p = page({ ls: ONBOARDED, routes: backend({ desk: () => 'hang' }) });
    await p.call('session', { page: 'app' });
    const pending = p.call('ask', { question: 'slow one' });
    await sleep(20);
    await p.call('ask', { question: 'another' }).then(() => ok(false, 'busy'), (e) => eq(e.code, 'busy', 'one read at a time'));
    eq(await p.call('cancel'), { cancelled: true }, 'cancel');
    eq(await pending, { v: 1, status: 'cancelled' }, 'the in-flight ask resolves cancelled');
    eq(await p.call('cancel'), { cancelled: false }, 'nothing left to cancel');
  }

  // suggestions: movers only after consent
  {
    const p = page({ page: 'onboarding', routes: backend() });
    await p.call('session', { page: 'onboarding' });
    const before = await p.call('suggestions');
    eq([before.quickAccess.map((x) => x.symbol), before.movers, p.calls.length], [CATALOG.quickAccess, [], 0], 'before consent: the local row only');
    await p.call('acceptRisk', { version: CATALOG.riskNotice.version });
    const after = await p.call('suggestions');
    eq(after.movers, [{ symbol: 'SOL', name: 'Solana', changePct: 7.5 }], 'after consent: live movers');
  }

  // speech: Web Speech API plumbing
  {
    class FakeRec {
      constructor() { FakeRec.last = this; }
      start() { this.started = true; }
      stop() { setTimeout(() => { this.onresult && this.onresult({ results: [[{ transcript: 'How is' }], [{ transcript: ' NVIDIA doing' }]] }); this.onend && this.onend(); }, 20); }
      abort() { this.aborted = true; }
    }
    const p = page({ ls: ONBOARDED, recognizer: FakeRec });
    await p.call('session', { page: 'app' });
    eq(await p.call('speech.start'), { status: 'needs_permission' }, 'undetermined mic needs the pre-permission card');
    eq((await p.call('speech.requestPermission')).state, 'granted', 'getUserMedia grants the mic');
    eq(await p.call('speech.start'), { status: 'listening' }, 'listening');
    eq(FakeRec.last.lang, 'en-US', 'recognizer locale');
    ok(FakeRec.last.continuous && FakeRec.last.interimResults, 'continuous with interim results');
    FakeRec.last.onresult({ results: [[{ transcript: 'How is' }]] });
    eq(await p.call('speech.start'), { status: 'busy' }, 'one capture at a time');
    eq(await p.call('speech.stop', {}), { status: 'stopped' }, 'stop');
    await sleep(60);
    const names = p.events.map((e) => e[0]).filter((n) => n.startsWith('speech.') && n !== 'speech.level');
    eq(names, ['speech.state', 'speech.partial', 'speech.state', 'speech.partial', 'speech.final'], 'speech events');
    eq(p.events.filter((e) => e[0] === 'speech.final')[0][1], { text: 'How is NVIDIA doing' }, 'final is the whole transcript');
    eq(await p.call('speech.stop', {}), { status: 'idle' }, 'stop when idle');
    // refusal by the recognizer (Safari asks for speech recognition separately)
    await p.call('speech.start');
    FakeRec.last.onerror({ error: 'not-allowed' });
    await sleep(5);
    eq(p.events.filter((e) => e[0] === 'speech.error').at(-1)[1], { code: 'denied' }, 'not-allowed → denied');
    eq((await p.call('speech.permission')).state, 'denied', 'and the mic now reads denied (typing path)');
  }
  {
    const p = page({ ls: ONBOARDED });
    await p.call('session', { page: 'app' });
    eq(await p.call('speech.permission'), { state: 'unavailable', onDevice: false }, 'no Web Speech API → unavailable');
    eq(await p.call('speech.start'), { status: 'unavailable' }, 'start → unavailable');
  }

  // voice: consent, mute, gesture, lengths
  {
    const p = page({ page: 'onboarding', routes: backend() });
    await p.call('session', { page: 'onboarding' });
    eq(await p.call('speak', { id: 'hello', text: 'Hi.' }), { status: 'muted' }, 'no network voice before consent (R11)');
    await p.call('acceptRisk', { version: CATALOG.riskNotice.version });
    eq(await p.call('speak', { id: 'x', text: 'y'.repeat(801) }), { status: 'too_long' }, 'over 800 chars');
    eq(await p.call('speak', { id: 'x', text: 'Hi.' }), { status: 'muted' }, 'no gesture yet: the page reads silently');
    await p.call('speak', { id: 'bad id!', text: 'Hi.' }).then(() => ok(false, 'bad id'), (e) => eq(e.code, 'invalid_params', 'speak id pattern'));
    const m = await p.call('setMuted', { muted: true });
    eq(m.muted, true, 'setMuted persists');
    await p.call('haptic', { kind: 'nope' }).then(() => ok(false, 'bad haptic'), (e) => eq(e.code, 'invalid_params', 'haptic kinds'));
    eq(await p.call('haptic', { kind: 'light' }), {}, 'haptic is a no-op without vibrate');
    eq(await p.call('markHint', { key: 'idle' }), { count: 1 }, 'markHint counts');
    eq((await p.call('session', {})).hints, { idle: 1 }, 'hints in the session');
    await p.call('nope').then(() => ok(false, 'unknown'), (e) => eq(e.code, 'unknown_method', 'unknown method'));
    await p.call('openNative', { route: 'moon' }).then(() => ok(false, 'bad route'), (e) => eq(e.code, 'invalid_params', 'openNative routes'));
    eq(await p.call('openNative', { route: 'isla' }), { opened: true }, 'Isla opens Trader Land');
    await sleep(5);
    eq(p.nav.at(-1), ['assign', '/trader-land'], 'the Trader Land route');
  }

  // Spanish
  {
    const p = page({ page: 'onboarding', lang: 'es' });
    const s = await p.call('session', { page: 'onboarding' });
    eq(s.language, 'es', 'Spanish session');
    const r = await p.call('roster');
    eq(r.companions[1].selectLine, 'Hola. Yo te lo digo fácil, sin rollos.', 'Spanish roster lines');
    eq(s.level.name, 'EN ESCENA', 'Spanish level names');
  }

  console.log(`${failed ? 'FAILED' : 'ok'} — ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
run().catch((e) => { console.error(e); process.exit(1); });
