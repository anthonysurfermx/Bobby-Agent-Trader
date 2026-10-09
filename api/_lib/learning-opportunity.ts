import { createHash } from 'node:crypto';
import { explanationFor, type LearningExplanation } from './learning-context.js';
import { isSessionDay, nyParts, periodForDate, NYSE_CALENDAR_VERSION, POLICY_VERSION } from './briefings/calendar.js';
import type { BriefContent, BriefEvidence, ComposerMemory, FrozenSettings, Period } from './briefings/types.js';
import { CONSENT_VERSIONS } from './briefings/config.js';

/** Rollout switch only: neither this module nor the switch grants delivery consent. */
export const learningOpportunitiesEnabled = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.BOBBY_LEARNING_OPPORTUNITIES_ENABLED === 'on';

export type OpportunityPreference = 'in_app' | 'push' | 'off';
export type OpportunitySubject = { kind: 'asset' | 'topic'; key: string };
export interface LearningOpportunityV1 {
  version: 1;
  id: string;
  /** Source fact identity, independent of language, model, account and delivery period. */
  factKey: string;
  trigger: 'cadence' | 'event_triggered';
  subject: OpportunitySubject;
  reason: 'dated_market_change' | 'accepted_source_change';
  interest: { origin: 'explicit_setting' | 'consented_question' };
  source: { kind: 'dated_history' | 'live_quote' | 'accepted_event'; names: string[]; asOf: string; expiresAt: string; documentDigest?: string; url?: string };
  novelty: { comparison: 'dated_close' | 'reported_window' | 'accepted_source_change'; baselineAt: string | null; baselinePrice: number | null; price: number | null; changePct: number | null };
  context: { explanation: LearningExplanation };
  /** The immutable report supplies the synthesis; this object never invents another analysis. */
  action: 'compare_with_source';
  delivery: { preference: OpportunityPreference; channel: 'in_app' | 'push'; scheduledAt: string; expiresAt: string; periodKey: string; cadence: Period['cadence']; calendarVersion: string; policyVersion: string; dedupeKey: string };
}

export interface LearningOpportunityOptions {
  enabled: boolean;
  now: Date;
  /** Default is in-app. Only an already authorized delivery adapter may pass push. */
  preference?: OpportunityPreference;
  seenFactKeys?: readonly string[];
}

const DAY = 86_400_000;
const MINUTE = 60_000;
/** Interruption policy, not a trading signal or a conclusion about financial significance. */
export const OPPORTUNITY_MIN_CHANGE_PCT = 1;
const digest = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const ms = (s: unknown): number => typeof s === 'string' ? Date.parse(s) : NaN;
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const validTime = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(ms(v));
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Calendar coverage, real session and canonical bounds; the Monday window alone is never a reason to notify. */
function knownPeriod(p: Period): boolean {
  if (!validTime(p.scheduledAt) || !validTime(p.pushExpiresAt) || p.calendarVersion !== NYSE_CALENDAR_VERSION || p.policyVersion !== POLICY_VERSION) return false;
  const date = nyParts(new Date(p.scheduledAt)).date;
  if (isSessionDay(date) !== true || p.equitySession.state === 'unknown') return false;
  const canonical = periodForDate(p.cadence, date, { adopted: new Set(['morning', 'close', 'weekly']), morningDays: 'sessions' });
  return !!canonical && canonical.periodKey === p.periodKey && canonical.scheduledAt === p.scheduledAt && canonical.pushExpiresAt === p.pushExpiresAt;
}

/** Facts are scoped to a sourced comparison interval, never to an assumed last view by the person. */
export function buildLearningOpportunity(input: {
  period: Period; frozen: FrozenSettings; memory: ComposerMemory | null; memoryAllowed: boolean;
  evidence: BriefEvidence; content: BriefContent; options: LearningOpportunityOptions;
}): LearningOpportunityV1 | null {
  const { period: p, evidence: e, content, options: o } = input;
  const now = o.now.getTime();
  if (!o.enabled || !Number.isFinite(now) || o.preference === 'off' || !knownPeriod(p) || now >= ms(p.pushExpiresAt)) return null;
  if (e.cadence !== p.cadence || e.periodKey !== p.periodKey || e.equitySession.state === 'unknown' || !validTime(e.capturedAt) || ms(e.capturedAt) > now || !content.sections.length) return null;
  const memory = input.memoryAllowed && input.frozen.analysisConsent && input.frozen.analysisConsentVersion === CONSENT_VERSIONS.analysis ? input.memory : null;
  const interests = new Map<string, LearningOpportunityV1['interest']['origin']>();
  // Legacy ask history has no authored/exposed lineage. It is factual history, not independent interest.
  for (const symbol of input.frozen.assets) interests.set(symbol, 'explicit_setting');
  for (const section of content.sections) {
    if (section.kind !== 'asset' || !section.symbol || !interests.has(section.symbol) || section.status === 'stale' || section.status === 'missing') continue;
    const q = e.quotes.find(v => v.symbol === section.symbol);
    if (!q || !positive(q.price) || !validTime(q.asOf) || ms(q.asOf) > now || section.asOf !== q.asOf) continue;
    let baselineAt: string | null = null;
    let baselinePrice: number | null = null;
    let changePct: number;
    let sourceExpiry: number;
    let comparison: LearningOpportunityV1['novelty']['comparison'];
    let sourceKind: LearningOpportunityV1['source']['kind'];
    let sourceName: string;
    if (p.cadence === 'weekly') {
      const h = e.history?.find(v => v.symbol === section.symbol);
      if (!h || q.changeBasis !== '7d' || q.freshness !== 'closed' || !positive(h.from.price) || !positive(h.to.price) || !validTime(h.from.at) || !validTime(h.to.at)) continue;
      const span = ms(h.to.at) - ms(h.from.at);
      if (span < 5 * DAY || span > 9 * DAY || ms(h.from.at) > ms(p.periodStart) || ms(h.to.at) <= ms(p.periodStart) || ms(h.to.at) > ms(p.periodEnd) || ms(h.to.at) > now || now - ms(h.to.at) > 4 * DAY || h.to.at !== q.asOf || h.to.price !== q.price) continue;
      baselineAt = h.from.at; baselinePrice = h.from.price;
      changePct = (h.to.price / h.from.price - 1) * 100;
      comparison = 'dated_close'; sourceKind = 'dated_history'; sourceName = 'daily_history';
      sourceExpiry = ms(h.to.at) + 4 * DAY;
    } else {
      if (typeof q.changePct !== 'number' || !Number.isFinite(q.changePct) || !['live', 'delayed', '24_7'].includes(q.freshness)) continue;
      const ttl = q.kind === 'crypto' || q.kind === 'metal' ? 15 * MINUTE : q.freshness === 'delayed' ? 20 * MINUTE : 2 * MINUTE;
      sourceExpiry = ms(q.asOf) + ttl;
      if (sourceExpiry <= now) continue;
      changePct = q.changePct; comparison = 'reported_window'; sourceKind = 'live_quote';
      sourceName = q.kind === 'crypto' || q.kind === 'metal' ? 'okx_spot' : 'yahoo_equities';
    }
    if (Math.abs(changePct) < OPPORTUNITY_MIN_CHANGE_PCT || !e.sources.some(s => s.name === sourceName && s.ok && s.freshness !== 'stale' && s.freshness !== 'missing')) continue;
    const factKey = digest({ subject: section.symbol, comparison, baselineAt, baselinePrice, asOf: q.asOf, price: q.price, changeBasis: q.changeBasis, changePct });
    if (o.seenFactKeys?.includes(factKey)) continue;
    const expiresAt = new Date(Math.min(sourceExpiry, ms(p.pushExpiresAt))).toISOString();
    if (ms(expiresAt) <= ms(p.scheduledAt)) continue;
    const preference = o.preference ?? 'in_app';
    return {
      version: 1, id: digest({ factKey, periodKey: p.periodKey, cadence: p.cadence }), factKey, trigger: 'cadence', subject: { kind: 'asset', key: section.symbol },
      reason: 'dated_market_change', interest: { origin: interests.get(section.symbol)! },
      source: { kind: sourceKind, names: [sourceName], asOf: q.asOf, expiresAt },
      novelty: { comparison, baselineAt, baselinePrice, price: q.price, changePct },
      context: { explanation: explanationFor(memory) }, action: 'compare_with_source',
      delivery: { preference, channel: preference === 'push' ? 'push' : 'in_app', scheduledAt: p.scheduledAt, expiresAt, periodKey: p.periodKey, cadence: p.cadence, calendarVersion: p.calendarVersion, policyVersion: p.policyVersion, dedupeKey: factKey },
    };
  }
  return null;
}

/** Future server adapter contract, not a verifier: acceptance must follow provider/source verification.
 * No endpoint, polling, persistence or cadence worker consumes this feed today. A rumor is not this type.
 * Its only supported channel is in-app; a weekly opt-in is not consent for new event notifications. */
export interface AcceptedSourceChange {
  trigger: 'event_triggered'; status: 'accepted_source_change';
  subject: OpportunitySubject;
  source: { name: string; url: string; documentDigest: string; asOf: string; expiresAt: string };
  comparison: { previousDigest: string; currentDigest: string };
  synthesisReady: true;
}

/** An accepted, changed source can reuse the policy, but never turns a schedule or an unverified news item into a fact. */
export function buildEventOpportunity(input: {
  event: AcceptedSourceChange; period: Period; interest: LearningOpportunityV1['interest'] | null;
  explanation?: LearningExplanation; options: LearningOpportunityOptions;
}): LearningOpportunityV1 | null {
  const { event: e, period: p, options: o } = input;
  const now = o.now.getTime();
  if (!o.enabled || !Number.isFinite(now) || o.preference !== undefined && o.preference !== 'in_app' || !input.interest || !['explicit_setting', 'consented_question'].includes(input.interest.origin) || !knownPeriod(p) || e?.trigger !== 'event_triggered' || e.status !== 'accepted_source_change' || e.synthesisReady !== true) return null;
  if (!e.source || !e.comparison || !/^[a-f0-9]{64}$/.test(e.source.documentDigest) || !/^[a-f0-9]{64}$/.test(e.comparison.previousDigest) || e.comparison.currentDigest !== e.source.documentDigest || e.comparison.previousDigest === e.comparison.currentDigest) return null;
  if (!e.subject || !['asset', 'topic'].includes(e.subject.kind) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(e.subject.key) || !e.source.name || e.source.name.length > 80) return null;
  try { if (new URL(e.source.url).protocol !== 'https:') return null; } catch { return null; }
  if (!validTime(e.source.asOf) || ms(e.source.asOf) > now || !validTime(e.source.expiresAt)) return null;
  const expiresAt = new Date(Math.min(ms(e.source.expiresAt), ms(p.pushExpiresAt))).toISOString();
  if (ms(expiresAt) <= now || ms(expiresAt) <= ms(p.scheduledAt)) return null;
  // Correcting a provider timestamp or URL does not create another substantive document.
  const factKey = digest({ subject: e.subject, documentDigest: e.source.documentDigest });
  if (o.seenFactKeys?.includes(factKey)) return null;
  const preference = 'in_app' as const;
  return {
    version: 1, id: digest({ factKey, periodKey: p.periodKey, cadence: p.cadence }), factKey, trigger: 'event_triggered', subject: { ...e.subject }, reason: 'accepted_source_change', interest: { ...input.interest },
    source: { kind: 'accepted_event', names: [e.source.name], asOf: e.source.asOf, expiresAt, documentDigest: e.source.documentDigest, url: e.source.url },
    novelty: { comparison: 'accepted_source_change', baselineAt: null, baselinePrice: null, price: null, changePct: null },
    context: { explanation: input.explanation ?? explanationFor() }, action: 'compare_with_source',
    delivery: { preference, channel: 'in_app', scheduledAt: p.scheduledAt, expiresAt, periodKey: p.periodKey, cadence: p.cadence, calendarVersion: p.calendarVersion, policyVersion: p.policyVersion, dedupeKey: factKey },
  };
}

/** Persisted JSON is untrusted until validated. This is policy metadata, never an authorization credential. */
export function isLearningOpportunity(v: unknown): v is LearningOpportunityV1 {
  if (!object(v) || v.version !== 1 || typeof v.id !== 'string' || !/^[a-f0-9]{64}$/.test(v.id) || typeof v.factKey !== 'string' || !/^[a-f0-9]{64}$/.test(v.factKey)) return false;
  if (!['cadence', 'event_triggered'].includes(v.trigger as string) || !['dated_market_change', 'accepted_source_change'].includes(v.reason as string) || v.action !== 'compare_with_source') return false;
  const { subject: s, interest: i, source, novelty: n, context: c, delivery: d } = v;
  if (!object(s) || !['asset', 'topic'].includes(s.kind as string) || typeof s.key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(s.key) || !object(i) || !['explicit_setting', 'consented_question'].includes(i.origin as string)) return false;
  if (!object(source) || !['dated_history', 'live_quote', 'accepted_event'].includes(source.kind as string) || !Array.isArray(source.names) || source.names.length < 1 || source.names.length > 4 || source.names.some(x => typeof x !== 'string' || !x || x.length > 80) || !validTime(source.asOf) || !validTime(source.expiresAt) || ms(source.asOf) >= ms(source.expiresAt)) return false;
  if (!object(n) || !['dated_close', 'reported_window', 'accepted_source_change'].includes(n.comparison as string) || !(n.baselineAt === null || validTime(n.baselineAt)) || !(n.baselinePrice === null || positive(n.baselinePrice)) || !(n.price === null || positive(n.price)) || !(n.changePct === null || typeof n.changePct === 'number' && Number.isFinite(n.changePct))) return false;
  if (!object(c) || !object(c.explanation) || !['new', 'some', 'experienced'].includes(c.explanation.experience as string) || !['explicit', 'default'].includes(c.explanation.source as string) || c.explanation.explainRiskDepth !== undefined && !['low', 'medium', 'high'].includes(c.explanation.explainRiskDepth as string)) return false;
  if (!object(d) || !['in_app', 'push'].includes(d.preference as string) || d.channel !== d.preference || !validTime(d.scheduledAt) || !validTime(d.expiresAt) || d.expiresAt !== source.expiresAt || ms(d.scheduledAt) >= ms(d.expiresAt) || typeof d.periodKey !== 'string' || !['morning', 'close', 'weekly'].includes(d.cadence as string) || d.calendarVersion !== NYSE_CALENDAR_VERSION || d.policyVersion !== POLICY_VERSION || d.dedupeKey !== v.factKey) return false;
  if (v.trigger === 'cadence') {
    if (v.reason !== 'dated_market_change' || i.origin !== 'explicit_setting' || s.kind !== 'asset' || !positive(n.price) || typeof n.changePct !== 'number' || Math.abs(n.changePct) < OPPORTUNITY_MIN_CHANGE_PCT) return false;
    if (d.cadence === 'weekly' && (source.kind !== 'dated_history' || n.comparison !== 'dated_close' || !positive(n.baselinePrice) || !validTime(n.baselineAt))) return false;
    if (d.cadence !== 'weekly' && (source.kind !== 'live_quote' || n.comparison !== 'reported_window')) return false;
  } else {
    if (v.reason !== 'accepted_source_change' || source.kind !== 'accepted_event' || n.comparison !== 'accepted_source_change' || typeof source.documentDigest !== 'string' || !/^[a-f0-9]{64}$/.test(source.documentDigest) || typeof source.url !== 'string') return false;
    try { if (new URL(source.url).protocol !== 'https:') return false; } catch { return false; }
  }
  return true;
}

/** Called after current DB claim consent/plan/binding checks and before decrypting or sending a token.
 * Only the existing adopted weekly cadence has durable delivery consent and a complete preparation strategy.
 * Phone-local saved-read in-app mode is separate and never changes that weekly setting. No global sync is implied. */
export function canDeliverLearningOpportunity(content: BriefContent, now: Date, outboxExpiresAt: string): boolean {
  const o = content.learningOpportunity;
  const at = now.getTime();
  if (!isLearningOpportunity(o) || !Number.isFinite(at) || o.trigger !== 'cadence' || o.delivery.cadence !== 'weekly' || content.cadence !== 'weekly' || o.delivery.channel !== 'push' || content.equitySession?.state === 'unknown') return false;
  const d = o.delivery;
  if (at < ms(d.scheduledAt) || at >= ms(d.expiresAt) || !validTime(outboxExpiresAt) || at >= ms(outboxExpiresAt) || ms(o.source.asOf) > at) return false;
  const date = nyParts(new Date(d.scheduledAt)).date;
  const p = periodForDate(d.cadence, date, { adopted: new Set(['morning', 'close', 'weekly']), morningDays: 'sessions' });
  if (!p || !knownPeriod(p) || d.periodKey !== p.periodKey || d.scheduledAt !== p.scheduledAt || ms(d.expiresAt) > ms(p.pushExpiresAt)) return false;
  if (!content.sources.some(s => o.source.names.includes(s.name) && s.ok && s.freshness !== 'stale' && s.freshness !== 'missing')) return false;
  if (o.trigger === 'cadence') {
    const section = content.sections.find(s => s.kind === 'asset' && s.symbol === o.subject.key);
    if (!section || section.asOf !== o.source.asOf || ['stale', 'missing'].includes(section.status)) return false;
    if (o.source.kind === 'dated_history' && at - ms(o.source.asOf) > 4 * DAY) return false;
    if (o.source.kind === 'live_quote' && at - ms(o.source.asOf) > 20 * MINUTE) return false;
  }
  return true;
}
