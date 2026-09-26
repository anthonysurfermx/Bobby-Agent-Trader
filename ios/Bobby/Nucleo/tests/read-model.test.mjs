// node ios/Bobby/Nucleo/tests/read-model.test.mjs  — honesty rules of the read model (ARCHITECTURE.md §3.4).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const here = new URL('..', import.meta.url).pathname;
require(here + 'src/shared/20-read-model.js');
const RM = globalThis.NucleoReadModel;
const load = (n) => JSON.parse(readFileSync(here + 'fixtures/ask/' + n + '.json', 'utf8'));
let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok -', name); };

for (const slug of ['nvda', 'btc']) {
  const r = load(slug);
  for (const lang of ['en', 'es']) {
    const m = RM.build(r, { lang });
    test(`${slug}/${lang}: wait verdict owns amber, no conviction number`, () => {
      assert.equal(m.verdict.key, 'wait');
      assert.equal(m.verdict.color, '#F6B94E');
      assert.equal(m.ring.mode, 'complete');
      assert.equal(m.ring.pct, null);
      assert.equal(m.plan, null);
      assert.ok(!m.thesis.rows.some((x) => ['entry', 'stop', 'target'].includes(x.id)));
    });
    test(`${slug}/${lang}: spoken text fits TTS and ends on the verdict word`, () => {
      assert.ok(m.spoken.text.length <= 800);
      const w = m.spoken.words[m.spoken.verdictWordIndex].replace(/[.!?]$/, '').toLowerCase();
      assert.equal(w, lang === 'es' ? 'esperar' : 'wait');
      assert.equal(m.spoken.stageAt.verdict, m.spoken.sentences.length - 1);
    });
    test(`${slug}/${lang}: chart domain holds every close and line`, () => {
      const [lo, hi] = m.chart.domain;
      for (const c of m.chart.closes) assert.ok(c >= lo && c <= hi);
      for (const l of m.chart.lines) assert.ok(l.price >= lo && l.price <= hi);
      assert.equal(m.chart.closes.length, Math.min(48, r.candles.length));
    });
  }
  test(`${slug}: first read shows at most 3 satellites`, () => {
    assert.equal(RM.build(r, { firstRead: true }).satellites.length, 3);
    assert.ok(RM.build(r, {}).satellites.length <= 4);
  });
}

// Synthetic variants built IN THE TEST from the real BTC capture (never shipped as fixtures).
const btc = load('btc');
const review = (patch) => ({ ...structuredClone(btc), agents: { ...btc.agents, verdict: 'review', direction: 'long', ...(patch.agents || {}) }, ...(patch.top || {}) });
test('review + agreeing intel pulse -> real conviction ring + engine plan rows', () => {
  const m = RM.build(review({}), {});
  assert.equal(m.verdict.key, 'review');
  assert.equal(m.verdict.color, '#3FE0B5');
  assert.deepEqual(m.ring, { mode: 'conviction', pct: 59, label: 'CONVICTION' });
  assert.deepEqual(m.plan, { entry: 84181.2, stop: 83659.2, target: 85016.4, rewardRisk: 1.6 });
  assert.deepEqual(m.thesis.rows.map((x) => x.id), ['price', 'entry', 'stop', 'target', 'trend']);
  assert.ok(m.chart.lines.some((l) => l.kind === 'target'));
});
test('review but pulse disagrees on direction -> no number, no plan', () => {
  const m = RM.build(review({ agents: { direction: 'short' } }), {});
  assert.equal(m.ring.mode, 'complete');
  assert.equal(m.plan, null);
});
test('pulse from a different instrument (tokenized swap vs Yahoo stock) is never shown', () => {
  const r = review({});
  r.pulse = { ...r.pulse, source: 'okx-indicators', instrument: 'NVDA-USDT-SWAP' };
  r.provenance = { ...r.provenance, instrument: 'NVDA' };
  assert.equal(RM.build(r, {}).ring.mode, 'complete');
});
test('an inverted plan (stop above entry on a long) is dropped', () => {
  const r = review({});
  r.pulse = { ...r.pulse, plan: { ...r.pulse.plan, stop: 90000 } };
  assert.equal(RM.build(r, {}).plan, null);
});
test('missing candles -> no chart, no volume satellite, trend fallback', () => {
  const r = structuredClone(btc); r.candles = [];
  const m = RM.build(r, {});
  assert.equal(m.chart, null);
  assert.ok(!m.satellites.some((s) => s.id === 'volume'));
  assert.ok(m.satellites.some((s) => s.id === 'trend'));
});
test('missing market price falls back to the technicals price', () => {
  const r = structuredClone(btc); r.market = { price: null, changePct: null };
  const m = RM.build(r, {});
  assert.equal(m.satellites[0].value, '$84,181');
  assert.equal(m.satellites[0].delta, null);
  assert.equal(m.satellites[0].dot, 'neutral');
});
test('every non-ok golden maps to a caption and never to a verdict', () => {
  for (const k of ['quota', 'too_long', 'failed', 'unavailable', 'gateway_timeout', 'confirm-fuzzy', 'confirm-proxy', 'unknown', 'unsupported-proxy', 'timeout', 'network']) {
    const f = RM.failure(load(k), 'en');
    assert.ok(f.caption, k);
    assert.ok(!('verdict' in f), k);
  }
  assert.throws(() => RM.build(load('quota'), {}));
});
test('xp chip shows real points and the cap honestly', () => {
  assert.equal(RM.xpChip(20, 'wait', 'en'), '+20 discipline XP for waiting');
  assert.equal(RM.xpChip(10, 'review', 'es'), '+10 XP de disciplina');
  assert.equal(RM.xpChip(0, 'wait', 'en'), 'Saved · daily XP limit reached');
});
test('no advice or outcome language in the string tables', () => {
  for (const lang of ['en', 'es']) {
    for (const [k, v] of Object.entries(RM.STRINGS[lang])) {
      assert.ok(!/\b(buy|sell|compra|vende|profit|ganancias?|win|wins|winning|returns|guarantee\w*|garantiz\w*)\b/i.test(v), `${lang}.${k}: ${v}`);
    }
  }
});
test('sentence split survives decimals and tickers', () => {
  assert.deepEqual(RM.sentences('BTC is at 84181.3 now. RSI is 62.1, near hot. Wait.'), ['BTC is at 84181.3 now.', 'RSI is 62.1, near hot.', 'Wait.']);
});

// ---- Builder B: follow-up chips and the saved-thesis view (daily engine) ----
const nvdaModel = RM.build(load('nvda'), { lang: 'en' });
test('follow-ups: a follow-up of THIS read first, then up to 2 real symbols, never the current one', () => {
  const f = RM.followUps(nvdaModel, { quickAccess: [{ symbol: 'NVDA' }, { symbol: 'btc' }], movers: [{ symbol: 'AAPL', name: 'Apple', changePct: 1.2 }, { symbol: 'TSLA' }] }, 'en');
  assert.equal(f.length, 3);
  assert.deepEqual(f[0].action, { followUpOf: nvdaModel.requestId, symbol: 'NVDA' });
  assert.equal(f[0].label, 'Another question about NVDA');
  assert.deepEqual(f.slice(1).map((c) => c.action.symbol), ['BTC', 'AAPL']);
  assert.equal(f[1].action.question, 'How is BTC looking?');
  assert.ok(!f.some((c) => c.action.question && /NVDA/.test(c.action.question)));
});
test('follow-ups: no suggestions -> only the follow-up of this read; junk symbols are dropped', () => {
  assert.equal(RM.followUps(nvdaModel, {}, 'en').length, 1);
  assert.equal(RM.followUps(nvdaModel, { quickAccess: [{ symbol: '<script>' }, { symbol: '' }, {}] }, 'en').length, 1);
  assert.equal(RM.followUps(nvdaModel, { quickAccess: [{ symbol: 'ETH' }] }, 'es')[1].label, '¿Cómo se ve ETH?');
});
// the SaveResult.thesis shape of ARCHITECTURE §2.7 (what the ledger stores)
const ledgerWait = { id: 'x', symbol: 'NVDA', name: 'Nvidia', isEquity: true, verdict: 'wait', direction: 'none', price: 225.07, support: 221.1, resistance: 230,
  entry: null, stop: null, target: null, asOf: '2026-09-25T20:00:00.000Z', provider: 'Yahoo Finance', savedAt: '2026-09-26T12:00:00.000Z', horizonHours: null, points: 20, synced: false };
test('thesis view: a saved Wait shows price, support and resistance; never plan rows it does not have', () => {
  const v = RM.thesisView(ledgerWait, 'en', {});
  assert.deepEqual(v.rows.map((r) => [r.id, r.value]), [['price', '$225.07'], ['support', '$221.10'], ['resistance', '$230.00']]);
  assert.equal(v.pill, 'NVDA · WAIT');
  assert.equal(v.verdict.color, '#F6B94E');
  assert.equal(v.savedLabel, 'Saved on this device');
  assert.equal(RM.thesisView(ledgerWait, 'en', { signedIn: true }).savedLabel, 'Saved');
});
test('thesis view: a Review with engine levels shows them, in mint; missing values are dropped', () => {
  const v = RM.thesisView({ ...ledgerWait, verdict: 'review', entry: 84181.2, stop: 83659.2, target: null, price: null, horizonHours: 72 }, 'es', {});
  assert.deepEqual(v.rows.map((r) => r.id), ['entry', 'stop']);
  assert.equal(v.verdict.color, '#3FE0B5');
  assert.equal(v.pill, 'NVDA · REVISA');
  assert.equal(v.line, 'Ventana de revisión: 72 h.');
});

// ---- the engine's own UI string table (src/app/40-strings.js), extracted between its markers ----
const strSrc = readFileSync(here + 'src/app/40-strings.js', 'utf8');
const strBody = strSrc.split('/*STRINGS-BEGIN*/')[1].split('/*STRINGS-END*/')[0];
const APP = new Function('return ' + strBody)();
test('app strings: en and es carry exactly the same keys', () => {
  assert.deepEqual(Object.keys(APP.es).sort(), Object.keys(APP.en).sort());
});
test('app strings: no advice or outcome language (en, es)', () => {
  for (const lang of ['en', 'es']) {
    for (const [k, v] of Object.entries(APP[lang])) {
      assert.ok(!/\b(buy|sell|compra|vende|profit|ganancias?|win|wins|winning|returns|guarantee\w*|garantiz\w*)\b/i.test(v), `${lang}.${k}: ${v}`);
    }
  }
});
test('app strings: no prototype copy or invented market values', () => {
  const all = JSON.stringify(APP);
  for (const p of ['178.40', '168', '172', '64%', 'CALM ENTRY', 'EARNINGS', 'Demand is still', 'Wait for the pullback', 'level 12', '41 calls', 'Watching', 'ping']) assert.ok(!all.includes(p), p);
});
console.log(`\n${n} passed`);
