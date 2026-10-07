// Offline unit regressions against the actual iOS read model and its web mirror.
// Recorded candles are replayed; no provider request or device acceptance is implied.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const ROOT = process.env.BOBBY_QA_REPO
  ? pathToFileURL(process.env.BOBBY_QA_REPO + '/')
  : new URL('../../../../', import.meta.url);
const IOS = new URL('ios/Bobby/Nucleo/', ROOT);
const TREES = { ios: new URL('src/', IOS), web: new URL('nucleo/src/', ROOT) };
const LANGS = ['en', 'es', 'fr', 'pt', 'it', 'de'];
const plain = (value) => JSON.parse(JSON.stringify(value));
const fixture = (slug) => JSON.parse(fs.readFileSync(new URL('fixtures/ask/' + slug + '.json', IOS), 'utf8'));
function model(tree) {
  const context = { console };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(new URL('shared/20-read-model.js', TREES[tree]), 'utf8'), context);
  return context.NucleoReadModel;
}
function contract(tree) {
  const source = fs.readFileSync(new URL("contract/10-contract.js", TREES[tree]), "utf8");
  const checker = source.slice(source.indexOf("  var T ="), source.indexOf("  var SESSION ="));
  const schema = source.slice(source.indexOf("  var CANDLE ="), source.indexOf("  var SAVE ="));
  const context = {};
  vm.runInNewContext(checker + schema, context);
  return (r) => context.check(r, context.ASK_OK);
}
function read(slug, verdict = 'wait') {
  const r = fixture(slug);
  r.candlesTimeframe = '1H';
  r.provenance.asOf = '2001-01-01T00:00:00.000Z';
  if (verdict === 'review') {
    r.agents.verdict = 'review';
    r.agents.direction = 'long';
  }
  return r;
}
function assertCandleSource(m, r) {
  assert.equal(m.chart.source.timeframe, '1H');
  assert.equal(m.chart.source.asOf, new Date(r.candles.at(-1).t).toISOString());
  assert.notEqual(m.chart.source.asOf, r.provenance.asOf);
  assert.equal(m.chart.source.provider, r.provenance.provider);
  assert.equal(m.chart.source.instrument, r.provenance.instrument);
}

for (const tree of Object.keys(TREES)) {
  const RM = model(tree);
  test(`${tree}: current bridge contract rejects missing or incorrect candle intervals`, () => {
    const check = contract(tree);
    for (const slug of ["btc", "nvda"]) {
      const valid = read(slug);
      assert.equal(check(valid).length, 0);
      for (const value of [undefined, null, "4H", "1D", "1W", 1]) {
        const wrong = structuredClone(valid);
        wrong.candlesTimeframe = value;
        assert.ok(check(wrong).some((path) => path.startsWith("$.candlesTimeframe")));
      }
    }
  });
  for (const slug of ['btc', 'nvda']) {
    test(`${tree}/${slug}: aligned 1H keeps support and resistance in every locale`, () => {
      const r = read(slug);
      for (const lang of LANGS) {
        const m = RM.build(r, { lang });
        assertCandleSource(m, r);
        assert.deepEqual(Array.from(m.chart.lines, (x) => x.kind), ['support', 'resistance']);
        assert.ok(m.chart.band);
        assert.ok(m.chart.bracket);
      }
    });
    for (const tf of ['4H', '1D', '1W']) {
      for (const verdict of ['wait', 'review']) {
        test(`${tree}/${slug}/${verdict}: ${tf} analysis never overlays its levels on 1H candles`, () => {
          const r = read(slug, verdict);
          // Outlier levels expose accidental chart-domain contamination too.
          r.technicals.support = 1;
          r.technicals.resistance = 1e9;
          const aligned = RM.build(r, { lang: 'en' });
          r.provenance.timeframe = tf;
          const original = JSON.stringify(r);
          for (const lang of LANGS) {
            const m = RM.build(r, { lang });
            assertCandleSource(m, r);
            assert.equal(m.chart.lines.length, 0);
            assert.equal(m.chart.band, null);
            assert.equal(m.chart.bracket, null);
            const [lo, hi] = m.chart.domain;
            assert.ok(lo > r.technicals.support && hi < r.technicals.resistance);
            assert.ok(m.chart.closes.every((price) => price >= lo && price <= hi));
            // The horizon-specific analysis remains in its own thesis/plan cards.
            assert.deepEqual(plain(m.plan), plain(aligned.plan));
            assert.deepEqual(Array.from(m.thesis.rows, (x) => x.id), Array.from(aligned.thesis.rows, (x) => x.id));
            if (m.plan) {
              assert.ok(m.thesis.rows.some((x) => x.id === 'target'));
              assert.ok(aligned.chart.lines.some((x) => x.kind === 'target'));
            } else {
              assert.ok(m.thesis.rows.some((x) => x.id === 'support'));
            }
          }
          assert.equal(JSON.stringify(r), original, 'building the chart must not rewrite analysis provenance');
        });
      }
    }
    test(`${tree}/${slug}: legacy replies without candle metadata retain the declared 1H fallback`, () => {
      const r = read(slug);
      delete r.candlesTimeframe;
      const m = RM.build(r, {});
      assertCandleSource(m, r);
      assert.equal(m.chart.lines.length, 2);
      assert.ok(m.chart.band && m.chart.bracket);
    });
    test(`${tree}/${slug}: matching timeframe comparison accepts enum casing`, () => {
      const r = read(slug);
      r.provenance.timeframe = '1h';
      const m = RM.build(r, {});
      assertCandleSource(m, r);
      assert.equal(m.chart.lines.length, 2);
    });
    test(`${tree}/${slug}: an invalid final candle timestamp never borrows the debate timestamp`, () => {
      const r = read(slug);
      r.candles.at(-1).t = NaN;
      assert.equal(RM.build(r, {}).chart.source.asOf, null);
    });
  }
}
