// Pure, factual memory framing: no provider, account, database or model requests.
import assert from 'node:assert/strict';
import { buildLearningContext, explanationFor } from '../api/_lib/learning-context.ts';
import { readerContext, type MemorySummary } from '../api/_lib/user-memory.ts';

const now = Date.parse('2026-10-08T12:00:00Z');
const summary: MemorySummary = {
  enabled: true, prefs: { horizon: 'week', experience: null, risk: 'high' },
  top: [{ symbol: 'BTC', asks: 3, lastAskedAt: '2026-10-07T12:00:00Z', lastHorizon: 'unspecified' },
    { symbol: 'SOL', asks: 1, lastAskedAt: '2026-10-07T12:00:00Z', lastHorizon: 'week' }],
  thisAsset: { asks: 2, lastAskedAt: '2026-10-06T12:00:00Z', lastHorizon: 'month', asksThisWeek: 1, lastPrice: 100 },
};
let checks = 0;
function eq(actual: unknown, expected: unknown, message: string) { assert.deepEqual(actual, expected, message); checks++; }
eq(explanationFor(), { experience: 'new', source: 'default' }, 'beginner language is a default instruction, not an inferred preference');
for (const experience of ['new', 'some', 'experienced'] as const) {
  eq(explanationFor({ experience, explainRiskDepth: 'high' }), { experience, source: 'explicit', explainRiskDepth: 'high' }, 'explicit experience is preserved: ' + experience);
}
eq(explanationFor({ experience: 'expert-from-taps', explainRiskDepth: 'aggressive' } as never), { experience: 'new', source: 'default' }, 'invalid/inferred profile labels are discarded');

for (const language of ['en', 'es', 'fr', 'pt', 'it', 'de'] as const) {
  const before = JSON.stringify(summary), context = buildLearningContext(summary, 'NVDA', { now, language, priceNow: 110 });
  assert.ok(context); checks++;
  const { version, explanation, ...facts } = context;
  eq(version, 1, 'context has an explicit version');
  eq(explanation, { experience: 'new', source: 'default', explainRiskDepth: 'high' }, 'default presentation with the explicitly selected risk explanation depth');
  eq(facts, readerContext(summary, 'NVDA', now, null, 110, language), 'recall remains the existing deterministic server-derived facts');
  eq(JSON.stringify(summary), before, 'building context never writes default experience into the stored profile');
  eq('experience' in (context.prefs || {}), false, 'an unchosen experience remains absent from preferences');
  eq(context.oftenAsks, [{ symbol: 'BTC', asks: 3 }], 'only actual recurring asks, no sector or holding inferred');
}
eq(buildLearningContext(null, 'NVDA', { now }), null, 'unavailable memory creates no owning profile');
eq(buildLearningContext({ ...summary, enabled: false }, 'NVDA', { now, firstName: 'Shared name' }), null, 'paused memory exposes neither facts nor profile name');
eq(buildLearningContext({ enabled: true, prefs: { horizon: null, experience: null, risk: null }, top: [], thisAsset: null }, 'NVDA', { now }), null, 'an empty memory does not pretend to be personalized');
eq(buildLearningContext({ ...summary, prefs: { horizon: null, experience: 'experienced', risk: null } }, 'NVDA', { now })?.explanation,
  { experience: 'experienced', source: 'explicit' }, 'an explicit correction replaces default explanation');
const poisoned = { ...summary, sector: 'invented interest', question: 'Unstored words', holdings: ['NVDA'],
  owningProfile: { expertise: 'inferred from taps' }, prefs: { ...summary.prefs, model: 'claude-opus-5-5', tier: 'pro' } };
const safe = JSON.stringify(buildLearningContext(poisoned as MemorySummary, 'NVDA', { now }));
assert.ok(!/invented interest|Unstored words|holdings|owningProfile|expertise|"model"|"tier"/.test(safe)); checks++;
eq(summary.prefs.experience, null, 'no inferred experience is written back to memory');
console.log(`learning-context: ${checks} checks passed`);
