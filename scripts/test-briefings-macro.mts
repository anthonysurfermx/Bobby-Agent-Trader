// Pure fixtures only: no feed/provider/database/APNs call. Historical ranges are from cited Fed statements.
import assert from 'node:assert/strict';
import { macroPolicy, macroPollingAllowed, planMacroEvent, PROPOSED_MACRO_POLICY, type FedRateDecision, type MacroPlanningContext } from '../api/_lib/briefings/macro-events.ts';

globalThis.fetch = (async () => { throw new Error('network is forbidden in macro planner tests'); }) as typeof fetch;
let checks = 0;
const eq = (got: unknown, want: unknown, label: string) => { assert.deepEqual(got, want, label); checks++; };
const proof = (date: string, at: string) => ({
  url: `https://www.federalreserve.gov/newsevents/pressreleases/monetary${date}a.htm`,
  documentKind: 'fomc_statement' as const, documentSha256: 'a'.repeat(64), verifiedAt: at,
  extractionVersion: 'fed-target-range-v1' as const, verification: 'verified_official_document' as const,
});
const prior: FedRateDecision = { kind: 'fed_target_rate', status: 'confirmed', action: 'maintain', decisionAt: '2024-07-31T18:00:00Z', range: { lowerBps: 525, upperBps: 550 }, evidence: proof('20240731', '2024-07-31T18:01:00Z') };
const cut: FedRateDecision = { kind: 'fed_target_rate', status: 'confirmed', action: 'lower', decisionAt: '2024-09-18T18:00:00Z', range: { lowerBps: 475, upperBps: 500 }, evidence: proof('20240918', '2024-09-18T18:01:00Z') };
const ctx: MacroPlanningContext = { now: '2024-09-18T18:05:00Z', priorConfirmedDecision: prior, baselineContinuityVerified: true, processedMacroEventKeys: [], recentMacroEventTimes: [], accountingComplete: true, sharedUsdUtcDay: 0, sharedUsdUtcMonth: 0, proposedSharedReserveUsd: 0.1 };
const policy = macroPolicy({ BOBBY_BRIEFINGS_MACRO_ENABLED: 'on' }, { rolloutApproved: true, criteriaAndCapsApproved: true, sourceAdapterApproved: true, pollingApproved: true });
const reason = (candidate = cut, context = ctx, p = policy) => {
  const result = planMacroEvent(candidate, context, p);
  return 'reason' in result ? [result.state, result.reason] : result.state;
};

eq(reason(cut, ctx, macroPolicy()), ['no-op', 'disabled'], 'default is disabled');
eq(macroPollingAllowed(), false, 'import/defaults never authorize polling');
eq(macroPolicy({ BOBBY_BRIEFINGS_MACRO_ENABLED: 'true' }).enabled, false, 'only explicit on configures the gate');
eq(reason(cut, ctx, macroPolicy({ BOBBY_BRIEFINGS_MACRO_ENABLED: 'on' })), ['review-required', 'rollout_not_approved'], 'feature flag alone cannot approve criteria/source');
for (const gate of ['rolloutApproved', 'criteriaAndCapsApproved', 'sourceAdapterApproved', 'pollingApproved'] as const) {
  eq(macroPollingAllowed({ ...policy, [gate]: false }), false, `${gate} is required for a future poller`);
}
eq(macroPollingAllowed(policy), true, 'all explicit approvals produce a planning gate only');
eq(policy.dryRun, true, 'even approved policy is dry-run only');
const plan = planMacroEvent(cut, ctx, policy);
assert.equal(plan.state, 'eligible-dry-run'); checks++;
if (plan.state !== 'eligible-dry-run') throw new Error('fixture did not qualify');
eq([plan.eventKey, plan.direction, plan.deltaBps, plan.expiresAt], ['macro:fed-target-range:monetary20240918a', 'lower', 50, '2024-09-18T20:00:00.000Z'], 'confirmed historical cut produces stable event identity and finite expiry');
eq(plan.pushCopy.es, 'Bobby tiene tu resumen de mercado listo', 'approved generic copy retains no rate/symbol/name');
eq(reason(cut, { ...ctx, processedMacroEventKeys: [plan.eventKey] }), ['no-op', 'duplicate'], 'repeat source has no second event');
eq(reason({ ...cut, evidence: { ...cut.evidence, documentSha256: 'b'.repeat(64) } }, { ...ctx, processedMacroEventKeys: [plan.eventKey] }), ['no-op', 'duplicate'], 'article correction cannot create another event from body hash');
eq(reason(cut, { ...ctx, processedMacroEventKeys: ['2024-09-16_2024-09-23'] }), 'eligible-dry-run', 'weekly period completion does not dedupe exceptional event');
eq(reason({ ...cut, status: 'rumor' }), ['no-op', 'unconfirmed'], 'rumor refused');
eq(reason({ ...cut, status: 'scheduled' }), ['no-op', 'unconfirmed'], 'calendar entry alone is not confirmation');
eq(reason({ ...cut, kind: 'price_move' } as unknown as FedRateDecision), ['no-op', 'unsupported_event'], 'ordinary price movement does not qualify');
eq(reason({ ...cut, action: 'maintain', range: { ...prior.range } }), ['no-op', 'unchanged'], 'official unchanged range does not notify');
eq(reason(cut, { ...ctx, priorConfirmedDecision: null }), ['review-required', 'missing_baseline'], 'missing previous confirmed range requires review');
eq(reason(cut, { ...ctx, baselineContinuityVerified: false }), ['review-required', 'invalid_baseline'], 'a verified old statement does not prove continuity to the current decision');
for (const url of ['https://news.example.com/monetary20240918a.htm', 'http://www.federalreserve.gov/newsevents/pressreleases/monetary20240918a.htm', 'https://www.federalreserve.gov.evil.example/newsevents/pressreleases/monetary20240918a.htm', 'https://www.federalreserve.gov/feeds/press_monetary.xml', `${cut.evidence.url}?source=feed`, 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20240919a.htm']) {
  eq(reason({ ...cut, evidence: { ...cut.evidence, url } }), ['review-required', 'invalid_provenance'], `invalid document URL ${url}`);
}
for (const e of [{ ...cut.evidence, documentSha256: '' }, { ...cut.evidence, verification: 'rss_headline_only' }, { ...cut.evidence, verifiedAt: '2024-09-18T17:59:00Z' }, { ...cut.evidence, verifiedAt: '2024-09-18T18:06:00Z' }]) {
  eq(reason({ ...cut, evidence: e as typeof cut.evidence }), ['review-required', 'invalid_provenance'], 'missing/inconsistent source verification refused');
}
eq(reason(cut, { ...ctx, priorConfirmedDecision: { ...prior, status: 'rumor' } }), ['review-required', 'invalid_baseline'], 'rumor baseline refused');
eq(reason(cut, { ...ctx, priorConfirmedDecision: { ...prior, decisionAt: cut.decisionAt } }), ['review-required', 'invalid_baseline'], 'same-time baseline refused');
for (const range of [{ lowerBps: 475.5, upperBps: 500 }, { lowerBps: -1, upperBps: 25 }, { lowerBps: 500, upperBps: 475 }, { lowerBps: 475, upperBps: NaN }]) {
  eq(reason({ ...cut, range }), ['review-required', 'invalid_range'], 'bad units/range refused');
}
eq(reason({ ...cut, action: 'raise' }), ['review-required', 'inconsistent_decision'], 'claimed action must match actual delta');
eq(reason({ ...cut, range: { lowerBps: 475, upperBps: 525 } }), ['review-required', 'inconsistent_decision'], 'changed width needs explicit review');
eq(reason(cut, { ...ctx, now: '2024-09-18T20:00:00Z' }), ['no-op', 'expired'], 'expiry boundary is exclusive');
eq(reason(cut, { ...ctx, now: '2024-09-18T17:59:00Z' }), ['review-required', 'invalid_time'], 'future release cannot qualify');
eq(reason(cut, { ...ctx, now: '2024-09-18' }), ['review-required', 'invalid_time'], 'date-only timestamp refused');
eq(reason(cut, { ...ctx, recentMacroEventTimes: ['2024-09-18T17:00:00Z'] }), ['no-op', 'frequency_cap'], 'one event per rolling 24h proposal');
eq(reason(cut, { ...ctx, recentMacroEventTimes: ['2024-09-15T18:00:00Z', '2024-09-16T18:00:00Z'] }), ['no-op', 'frequency_cap'], 'two events per rolling seven days proposal');
eq(reason(cut, { ...ctx, recentMacroEventTimes: ['2024-09-11T18:05:00Z'] }), 'eligible-dry-run', 'old event at seven-day boundary does not count');
eq(reason(cut, { ...ctx, accountingComplete: false }), ['review-required', 'accounting_unavailable'], 'incomplete durable history/budget cannot qualify');
eq(reason(cut, { ...ctx, recentMacroEventTimes: ['invalid'] }), ['review-required', 'accounting_unavailable'], 'invalid history cannot weaken cap');
eq(reason(cut, { ...ctx, recentMacroEventTimes: ['2024-09-18T18:06:00Z'] }), ['review-required', 'accounting_unavailable'], 'future history requires review');
for (const delta of [{ proposedSharedReserveUsd: 0 }, { proposedSharedReserveUsd: NaN }, { sharedUsdUtcDay: -1 }, { sharedUsdUtcMonth: Infinity }]) {
  eq(reason(cut, { ...ctx, ...delta }), ['review-required', 'accounting_unavailable'], 'invalid accounting cannot enable paid work');
}
for (const delta of [{ proposedSharedReserveUsd: 0.26 }, { sharedUsdUtcDay: 0.95, sharedUsdUtcMonth: 0.95 }, { sharedUsdUtcMonth: 4.95 }]) {
  eq(reason(cut, { ...ctx, ...delta }), ['no-op', 'cost_cap'], 'each proposed monetary cap is checked');
}
eq(reason(cut, ctx, { ...policy, maxSharedUsdPerEvent: 0 }), ['review-required', 'invalid_policy'], 'invalid cap configuration fails closed');
eq(reason(cut, ctx, { ...policy, dryRun: false } as unknown as typeof policy), ['review-required', 'invalid_policy'], 'planner has no live mode');
eq(macroPollingAllowed({ ...policy, maxFetchesPerPoll: 0 }), false, 'invalid finite polling limit does not authorize a future poller');
eq(reason(cut, { ...ctx, sharedUsdUtcDay: 0.2, sharedUsdUtcMonth: 0.1 }), ['review-required', 'accounting_unavailable'], 'inconsistent UTC day/month totals require review');
const raised = { ...cut, action: 'raise' as const, range: { lowerBps: 550, upperBps: 575 } };
const raisePlan = planMacroEvent(raised, ctx, policy);
eq(raisePlan.state === 'eligible-dry-run' ? [raisePlan.direction, raisePlan.deltaBps] : raisePlan, ['raise', 25], 'confirmed increase qualifies too (synthetic range fixture)');
eq([PROPOSED_MACRO_POLICY.maxFeedItemsPerPoll, PROPOSED_MACRO_POLICY.maxFetchesPerPoll], [10, 2], 'future polling has finite proposed work');
console.log(`briefings-macro: ${checks} checks passed (pure fixtures; no polling/providers/APNs)`);
