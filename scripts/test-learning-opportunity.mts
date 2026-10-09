// Real evidence → deterministic composition → opportunity/channel policy; no provider, database or APNs network.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildEvidence } from '../api/_lib/briefings/evidence.js';
import { factsOnlyNarrative } from '../api/_lib/briefings/narrative.js';
import { composeReport, validateContent } from '../api/_lib/briefings/compose.js';
import { nyLocalToUtc, periodForDate } from '../api/_lib/briefings/calendar.js';
import { buildEventOpportunity, canDeliverLearningOpportunity, isLearningOpportunity, learningOpportunitiesEnabled, type AcceptedSourceChange } from '../api/_lib/learning-opportunity.js';
import type { BriefEvidence, ComposerMemory, FrozenSettings, Period } from '../api/_lib/briefings/types.js';
import type { GlobalMarketSnapshot } from '../api/_lib/market-snapshot.js';

process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
let networkCalls = 0;
globalThis.fetch = (async () => { networkCalls++; throw new Error('network disabled'); }) as typeof fetch;
let checks = 0;
const eq = (a: unknown, b: unknown, label: string) => { assert.deepEqual(a, b, label); checks++; };
const ok = (a: unknown, label: string) => { assert.ok(a, label); checks++; };
const policy = { adopted: new Set(['weekly', 'morning', 'close'] as const), morningDays: 'sessions' as const };
const period = periodForDate('weekly', '2026-10-05', policy)!;
const now = nyLocalToUtc('2026-10-05', '07:55');
const deliveryAt = nyLocalToUtc('2026-10-05', '08:00');
const frozen: FrozenSettings = { settingsRevision: 1, privacyEpoch: 0, language: 'en', companionId: null, voice: 'ash', assets: ['BTC'], analysisConsent: true, analysisConsentVersion: 1, audioConsent: false };
const snapshot: GlobalMarketSnapshot = { prices: [], stocks: [], funding: [], fearGreed: null, dxy: null, regime: null, fetchedAt: now.toISOString(), sources: [] };
const evidence = await buildEvidence(period, ['BTC', 'ETH', 'NVDA'], {
  now: () => now, snapshot: async () => snapshot, agenda: async () => [],
  dailyCloses: async () => ['BTC', 'ETH', 'NVDA'].map(symbol => ({ symbol, from: { at: nyLocalToUtc('2026-09-25', '16:00').toISOString(), price: 100 }, to: { at: nyLocalToUtc('2026-10-02', '16:00').toISOString(), price: 102 } })),
});
function report(o: { evidence?: BriefEvidence; frozen?: FrozenSettings; period?: Period; memory?: ComposerMemory | null; memoryAllowed?: boolean; preference?: 'in_app' | 'push' | 'off'; enabled?: boolean; now?: Date; seen?: string[] } = {}) {
  const e = o.evidence ?? evidence;
  return composeReport({ period: o.period ?? period, frozen: o.frozen ?? frozen, memory: o.memory ?? null, memoryAllowed: o.memoryAllowed ?? false,
    narrative: factsOnlyNarrative(e, (o.frozen ?? frozen).language, ['BTC', 'ETH', 'NVDA']), evidence: e,
    learning: { enabled: o.enabled ?? true, now: o.now ?? now, preference: o.preference, seenFactKeys: o.seen },
  });
}
const implicit = report();
const push = report({ preference: 'push' });
ok(implicit.content.learningOpportunity, 'source-bound historical change produces metadata with real dated baseline');
eq(validateContent(implicit.content), null, 'actual composed historical report is valid');
eq(implicit.content.learningOpportunity!.delivery.channel, 'in_app', 'pure adapter defaults to in-app only');
eq(canDeliverLearningOpportunity(implicit.content, deliveryAt, period.pushExpiresAt), false, 'in-app never yields a push');
eq(push.content.learningOpportunity!.source.kind, 'dated_history', 'a Friday historical close is not labelled live on Monday');
eq(push.content.learningOpportunity!.novelty.baselineAt, nyLocalToUtc('2026-09-25', '16:00').toISOString(), 'baseline is the dated source comparison, not an alleged last view');
eq(push.content.learningOpportunity!.interest.origin, 'explicit_setting', 'following an asset is explicit interest, never a holding');
eq(push.content.learningOpportunity!.context.explanation, { experience: 'new', source: 'default' }, 'plain-language default does not invent experience or risk');
eq(push.usesMemory, false, 'default explanation alone adds no stored memory fact');
eq(canDeliverLearningOpportunity(push.content, now, period.pushExpiresAt), false, 'preparation is not an early push');
eq(canDeliverLearningOpportunity(push.content, deliveryAt, period.pushExpiresAt), true, 'known Monday window + sourced relevant historical change + authorized adapter permit delivery');
eq(canDeliverLearningOpportunity(push.content, new Date(period.pushExpiresAt), period.pushExpiresAt), false, 'expiry is exclusive');
eq(report({ preference: 'off' }).content.learningOpportunity, undefined, 'off overrides available evidence');
eq(report({ enabled: false }).content.learningOpportunity, undefined, 'rollout disabled preserves legacy shape');
eq(learningOpportunitiesEnabled({} as NodeJS.ProcessEnv), false, 'missing feature flag is off');
for (const value of ['true', '1', 'ON', ' on ']) eq(learningOpportunitiesEnabled({ BOBBY_LEARNING_OPPORTUNITIES_ENABLED: value } as NodeJS.ProcessEnv), false, `flag ${value} does not activate`);
eq(learningOpportunitiesEnabled({ BOBBY_LEARNING_OPPORTUNITIES_ENABLED: 'on' } as NodeJS.ProcessEnv), true, 'only exact on activates');

const memory: ComposerMemory = { frequentAssets: ['ETH'], experience: 'experienced', explainRiskDepth: 'high' };
const learned = report({ memory, memoryAllowed: true, preference: 'push' });
eq([learned.content.learningOpportunity!.subject.key, learned.content.learningOpportunity!.interest.origin], ['BTC', 'explicit_setting'], 'history without authored/exposed lineage cannot invent interest or displace an explicit follow');
eq([learned.usesMemory, learned.memoryAssets], [true, ['ETH']], 'metadata is covered by existing memory withdrawal obligations');
eq(learned.content.learningOpportunity!.context.explanation, { experience: 'experienced', source: 'explicit', explainRiskDepth: 'high' }, 'skill/risk presentation uses only declared preferences');
for (const f of [{ ...frozen, analysisConsent: false }, { ...frozen, analysisConsentVersion: 0 }]) {
  const r = report({ frozen: f, memory, memoryAllowed: true });
  eq([r.content.learningOpportunity!.subject.key, r.content.learningOpportunity!.context.explanation.source, r.usesMemory], ['BTC', 'default', false], 'withdrawn/outdated consent never leaks memory through metadata');
}
eq(report({ memory, memoryAllowed: false }).content.learningOpportunity!.subject.key, 'BTC', 'memory kill switch preserves explicit interests only');
eq(report({ frozen: { ...frozen, assets: [] } }).content.learningOpportunity, undefined, 'a general default asset is not evidence of personal interest');
eq(report({ frozen: { ...frozen, assets: [] }, memory, memoryAllowed: true }).content.learningOpportunity, undefined, 'consented legacy request history alone cannot seed an interruption');
const explicitExplanationOnly = report({ memory: { ...memory, frequentAssets: [] }, memoryAllowed: true });
eq([explicitExplanationOnly.usesMemory, explicitExplanationOnly.memoryAssets, explicitExplanationOnly.content.learningOpportunity!.context.explanation.source], [true, [], 'explicit'], 'declared explanation in metadata is privacy-withdrawable even without memory-derived assets');
const explainingNarrative = factsOnlyNarrative(evidence, 'en', ['BTC']);
explainingNarrative.assets.BTC.explainer = 'A weekly comparison measures the difference between two dated closing prices.';
const explainingInput = { period, frozen, memoryAllowed: true, narrative: explainingNarrative, evidence, learning: { enabled: true, now } };
const emptyMemoryReport = composeReport({ ...explainingInput, memory: { frequentAssets: [], experience: null, explainRiskDepth: null } });
const noMemoryReport = composeReport({ ...explainingInput, memory: null });
eq([emptyMemoryReport.content, emptyMemoryReport.usesMemory], [noMemoryReport.content, false], 'empty memory and null memory give byte-identical default explanation and no privacy-derived fact');
eq(noMemoryReport.usesMemory, false, 'beginner-friendly default itself is not a learned preference');
const declaredNew = composeReport({ ...explainingInput, memory: { frequentAssets: [], experience: 'new', explainRiskDepth: null } });
eq(declaredNew.usesMemory, true, 'declared experience with metadata/explainer is memory-derived');
const declaredWithoutOpportunity = composeReport({ ...explainingInput, frozen: { ...frozen, assets: [] }, memory: { frequentAssets: [], experience: 'new', explainRiskDepth: null } });
eq([declaredWithoutOpportunity.content.learningOpportunity, declaredWithoutOpportunity.usesMemory], [undefined, true], 'an explicitly selected explainer stays privacy-derived even without an opportunity');
eq(report({ seen: [push.content.learningOpportunity!.factKey] }).content.learningOpportunity, undefined, 'already accepted fact is silent');
const translated = report({ frozen: { ...frozen, language: 'es' }, preference: 'push' });
eq(translated.content.learningOpportunity!.factKey, push.content.learningOpportunity!.factKey, 'translation cannot manufacture a novel fact or another dedupe key');

const copy = <T>(v: T): T => structuredClone(v);
function corrupt(fn: (e: BriefEvidence) => void, label: string) { const e = copy(evidence); fn(e); eq(report({ evidence: e }).content.learningOpportunity, undefined, label); }
corrupt(e => { e.history![0].to.price = 100; e.quotes[0].price = 100; e.quotes[0].changePct = 0; }, 'empty Monday: no measured change means silence');
corrupt(e => { e.history![0].to.price = 100.5; e.quotes[0].price = 100.5; e.quotes[0].changePct = 0.5; }, 'sub-policy change does not interrupt');
corrupt(e => { e.history = []; }, 'missing source history is not reconstructed from live snapshot');
corrupt(e => { e.sources.find(s => s.name === 'daily_history')!.ok = false; }, 'failed provenance cannot become permission');
corrupt(e => { e.quotes[0].asOf = new Date(now.getTime() + 1).toISOString(); e.history![0].to.at = e.quotes[0].asOf; }, 'future source timestamp is rejected');
corrupt(e => { e.history![0].from.at = e.history![0].to.at; }, 'zero-span comparison is rejected');
corrupt(e => { e.capturedAt = new Date(now.getTime() + 1).toISOString(); }, 'future capture is unknown, not fresh');
corrupt(e => { e.quotes[0].freshness = 'stale'; }, 'stale status is not a relevant update');
corrupt(e => { e.quotes[0].price = Number.NaN; }, 'unknown price is not zero or a fact');
corrupt(e => { e.equitySession.state = 'unknown'; }, 'unknown source calendar state cannot create an opportunity');
const unknown = periodForDate('weekly', '2028-01-03', policy)!;
eq(report({ period: unknown }).content.learningOpportunity, undefined, 'outside verified calendar coverage stays silent');
const holiday = periodForDate('weekly', '2026-09-07', policy)!;
eq(report({ period: holiday }).content.learningOpportunity, undefined, 'closed holiday is not called premarket');

const daily = periodForDate('morning', '2026-10-05', policy)!;
const dailyE = copy(evidence);
dailyE.cadence = 'morning'; dailyE.periodKey = daily.periodKey; dailyE.history = undefined;
dailyE.quotes[0] = { symbol: 'BTC', kind: 'crypto', price: 102, changePct: 2, changeBasis: '24h', asOf: now.toISOString(), freshness: '24_7' };
dailyE.sources.push({ name: 'okx_spot', ok: true, freshness: '24_7' });
const dailyR = report({ period: daily, evidence: dailyE, preference: 'push' });
ok(dailyR.content.learningOpportunity, 'pure daily metadata can prepare a source-bound future opportunity');
eq(canDeliverLearningOpportunity(dailyR.content, deliveryAt, daily.pushExpiresAt), false, 'daily metadata has no adopted delivery consent or verified refresh strategy');
eq(canDeliverLearningOpportunity(dailyR.content, nyLocalToUtc('2026-10-05', '08:11'), daily.pushExpiresAt), false, 'daily quote expires before the wider outbox deadline');
const staleDaily = copy(dailyE); staleDaily.quotes[0].asOf = evidence.quotes[0].asOf;
eq(report({ period: daily, evidence: staleDaily }).content.learningOpportunity, undefined, 'valid weekly dated evidence is not valid daily freshness');

const event: AcceptedSourceChange = { trigger: 'event_triggered', status: 'accepted_source_change', subject: { kind: 'topic', key: 'rates' },
  source: { name: 'official_source', url: 'https://example.org/official-document', documentDigest: 'b'.repeat(64), asOf: now.toISOString(), expiresAt: period.pushExpiresAt },
  comparison: { previousDigest: 'a'.repeat(64), currentDigest: 'b'.repeat(64) }, synthesisReady: true };
const eventInput = { event, period, interest: { origin: 'explicit_setting' as const }, options: { enabled: true, now } };
const eventO = buildEventOpportunity(eventInput)!;
eq([eventO.trigger, eventO.subject.kind, eventO.delivery.channel], ['event_triggered', 'topic', 'in_app'], 'accepted generic source change is supported purely, default in-app');
eq(isLearningOpportunity(eventO), true, 'source-bound event metadata validates');
eq(buildEventOpportunity({ ...eventInput, options: { ...eventInput.options, preference: 'push' } }), null, 'a weekly opt-in or raw push preference cannot grant a new event channel');
eq(buildEventOpportunity({ ...eventInput, options: { ...eventInput.options, preference: 'off' } }), null, 'off event preference stays silent');
const forcedEventPush = { ...implicit.content, sources: [{ name: 'official_source', ok: true as const, freshness: 'live' as const }], learningOpportunity: { ...eventO, delivery: { ...eventO.delivery, channel: 'push' as const, preference: 'push' as const } } };
eq(canDeliverLearningOpportunity(forcedEventPush, deliveryAt, period.pushExpiresAt), false, 'even valid forged-to-push event metadata is rejected by the actual delivery policy');
eq(buildEventOpportunity({ ...eventInput, interest: null }), null, 'an event without user interest stays silent');
eq(buildEventOpportunity({ ...eventInput, event: { ...event, status: 'rumor' } as unknown as AcceptedSourceChange }), null, 'typed boundary also rejects a runtime rumor');
eq(buildEventOpportunity({ ...eventInput, event: { ...event, comparison: { previousDigest: 'b'.repeat(64), currentDigest: 'b'.repeat(64) } } }), null, 'unchanged source digest cannot create news');
eq(buildEventOpportunity({ ...eventInput, event: { ...event, synthesisReady: false } as unknown as AcceptedSourceChange }), null, 'sourced event with no accepted synthesis cannot deliver');
eq(buildEventOpportunity({ ...eventInput, options: { ...eventInput.options, seenFactKeys: [eventO.factKey] } }), null, 'same accepted event fact is deduped');
eq(buildEventOpportunity({ ...eventInput, event: { ...event, source: { ...event.source, asOf: new Date(now.getTime() - 60_000).toISOString() } } })!.factKey, eventO.factKey, 'timestamp correction cannot create another substantive document fact');
eq(buildEventOpportunity({ ...eventInput, event: { ...event, source: { ...event.source, expiresAt: now.toISOString() } } }), null, 'expired event is dropped');
eq(buildEventOpportunity({ ...eventInput, event: { ...event, source: { ...event.source, url: 'http://example.org/document' } } }), null, 'invalid source URL is rejected');
const exposedTap = { ...eventInput, interest: { origin: 'bobby_exposed_tap' } } as unknown as Parameters<typeof buildEventOpportunity>[0];
eq(buildEventOpportunity(exposedTap), null, 'Bobby-selected exposure is not learned personal interest');

const malformed = copy(push.content); malformed.learningOpportunity!.context.explanation.experience = 'expert' as any;
eq(validateContent(malformed), 'bad_learning_opportunity', 'persisted malformed metadata fails closed');
const altered = copy(push.content); altered.learningOpportunity!.source.asOf = new Date(deliveryAt.getTime() + 1).toISOString();
eq(canDeliverLearningOpportunity(altered, deliveryAt, period.pushExpiresAt), false, 'future metadata cannot be delivered');
eq(networkCalls, 0, 'pure pipeline used no network');

// Exercise the actual service read adapters over a fake HTTP transport; no database is contacted.
const db = await import('../api/_lib/briefings/db.js');
const briefId = randomUUID(), identityId = randomUUID(), deviceId = randomUUID();
const reads: Array<{ url: URL; init: RequestInit }> = [];
let response: unknown = [{ id: briefId, identity_id: identityId, state: 'ready', content: push.content }];
let status = 200;
globalThis.fetch = (async (url, init) => { reads.push({ url: new URL(String(url)), init: init! }); return new Response(JSON.stringify(response), { status }); }) as typeof fetch;
eq(await db.deliveryReport(briefId), { content: push.content, identityId }, 'delivery adapter reads actual ready content and owner from server row');
eq([reads[0].init.method, reads[0].url.pathname, reads[0].url.searchParams.get('id'), reads[0].url.searchParams.get('state'), reads[0].url.searchParams.get('limit')], ['GET', '/rest/v1/bobby_briefs', `eq.${briefId}`, 'eq.ready', '1'], 'read is bounded to claimed report and ready state');
eq((reads[0].init.headers as Record<string, string>).Authorization, 'Bearer test-service', 'existing server service transport is reused');
response = [];
eq(await db.deliveryReport(briefId), null, 'missing/withdrawn content is absent, not ready');
response = { malformed: true };
await assert.rejects(db.deliveryReport(briefId), db.BriefingStorageError); checks++;
response = [{ id: briefId, identity_id: identityId, state: 'preparing', content: push.content }];
await assert.rejects(db.deliveryReport(briefId), db.BriefingStorageError); checks++;
status = 503; await assert.rejects(db.deliveryReport(briefId), db.BriefingStorageError); checks++; status = 200;
response = [{ id: randomUUID(), brief: { id: briefId } }];
eq(await db.deliveredOpportunity(deviceId, identityId, push.content.learningOpportunity!.factKey), true, 'retained APNs-accepted fact suppresses another delivery');
const query = reads.at(-1)!.url.searchParams;
eq([query.get('state'), query.get('device_id'), query.get('identity_id'), query.get('brief.content->learningOpportunity->>factKey'), query.get('limit')], ['eq.sent', `eq.${deviceId}`, `eq.${identityId}`, `eq.${push.content.learningOpportunity!.factKey}`, '1'], 'dedupe is scoped to account/device, accepted state and exact source fact');
response = []; eq(await db.deliveredOpportunity(deviceId, identityId, push.content.learningOpportunity!.factKey), false, 'absence is a verified negative only after successful read');
const count = reads.length;
await assert.rejects(db.deliveryReport('bad&id=other'), db.BriefingStorageError); checks++;
await assert.rejects(db.deliveredOpportunity(deviceId, identityId, 'bad&state=sent'), db.BriefingStorageError); checks++;
eq(reads.length, count, 'invalid identifiers cannot alter a service query');

// Fake PostgREST primary-key arbitration exercises the actual reservation transport, not an idemBegin takeover.
const reserved = new Set<string>();
globalThis.fetch = (async (url, init) => {
  reads.push({ url: new URL(String(url)), init: init! });
  const row = JSON.parse(init!.body as string);
  const key = `${row.identity_id}:${row.scope}:${row.idem_key}`;
  const exists = reserved.has(key); reserved.add(key);
  await Promise.resolve();
  return new Response(JSON.stringify(exists ? [] : [row]), { status: 201 });
}) as typeof fetch;
eq(await Promise.all([db.reserveDeliveryOpportunity(identityId, deviceId, push.content.learningOpportunity!.factKey, period.pushExpiresAt, deliveryAt), db.reserveDeliveryOpportunity(identityId, deviceId, push.content.learningOpportunity!.factKey, period.pushExpiresAt, deliveryAt)]), [true, false], 'actual adapter accepts only the INSERT representation winner; conflict [] denies');
const insertion = reads.at(-1)!;
eq([insertion.init.method, insertion.url.pathname, insertion.url.searchParams.get('on_conflict'), (insertion.init.headers as Record<string, string>).Prefer], ['POST', '/rest/v1/bobby_brief_idempotency', 'identity_id,scope,idem_key', 'resolution=ignore-duplicates,return=representation'], 'reservation uses the existing primary key atomically, not the 60-second takeover RPC');
const reservedBody = JSON.parse(insertion.init.body as string);
eq([reservedBody.state, reservedBody.scope, reservedBody.status, reservedBody.response, reservedBody.expires_at], ['done', 'learning_opportunity', null, null, period.pushExpiresAt], 'done means bounded reservation only: no status or delivery receipt');
ok(reservedBody.idem_key.length === 64 && !reservedBody.idem_key.includes(deviceId), 'reservation key is a bounded hash of device and source fact');
globalThis.fetch = (async () => { throw new Error('uncertain response after commit'); }) as typeof fetch;
await assert.rejects(db.reserveDeliveryOpportunity(identityId, deviceId, 'c'.repeat(64), period.pushExpiresAt, deliveryAt), db.BriefingStorageError); checks++;
globalThis.fetch = (async () => new Response(JSON.stringify({ malformed: true }), { status: 201 })) as typeof fetch;
await assert.rejects(db.reserveDeliveryOpportunity(identityId, deviceId, 'c'.repeat(64), period.pushExpiresAt, deliveryAt), db.BriefingStorageError); checks++;
await assert.rejects(db.reserveDeliveryOpportunity(identityId, deviceId, 'c'.repeat(64), new Date(deliveryAt.getTime() + 7 * 86_400_000).toISOString(), deliveryAt), db.BriefingStorageError); checks++;
console.log(`learning-opportunity: ${checks} checks PASS (mock HTTP only; no provider, database or APNs calls)`);
