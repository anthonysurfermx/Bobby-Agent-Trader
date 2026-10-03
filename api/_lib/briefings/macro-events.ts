// Pure planning only. No polling, provider call, database mutation or notification is performed here.
// Scope: an exceptional confirmed Fed target-range change, independent of the Monday weekly briefing.
// Criteria and caps are proposals: docs/product/pro-market-macro-events.md. OFF unless explicitly configured.

export const FED_MONETARY_FEED = 'https://www.federalreserve.gov/feeds/press_monetary.xml';
export const MACRO_CRITERIA_VERSION = 'proposed-fed-target-range-v1';
export const MACRO_PUSH_COPY = {
  es: 'Bobby tiene tu resumen de mercado listo',
  en: 'Bobby has your market briefing ready',
} as const;

/** A trusted future adapter must verify the document and extraction. A caller boolean is not source proof. */
export interface OfficialFedEvidence {
  url: string;
  documentKind: 'fomc_statement';
  documentSha256: string;
  verifiedAt: string;
  extractionVersion: 'fed-target-range-v1';
  verification: 'verified_official_document';
}

/** Rates are integer basis points: 4.75% = 475 bps. Not the effective funds rate or a forecast. */
export interface FedRateDecision {
  kind: 'fed_target_rate';
  status: 'confirmed' | 'rumor' | 'scheduled';
  action: 'raise' | 'lower' | 'maintain';
  decisionAt: string;
  range: { lowerBps: number; upperBps: number };
  evidence: OfficialFedEvidence;
}

export interface MacroPolicy {
  enabled: boolean;
  rolloutApproved: boolean;
  criteriaAndCapsApproved: boolean;
  sourceAdapterApproved: boolean;
  pollingApproved: boolean;
  readonly dryRun: true;
  readonly maxEventsPer24h: number;
  readonly maxEventsPer7d: number;
  readonly maxEventAgeMinutes: number;
  readonly maxSharedUsdPerEvent: number;
  readonly maxSharedUsdPerUtcDay: number;
  readonly maxSharedUsdPerUtcMonth: number;
  readonly pollingIntervalMinutes: number;
  readonly maxFeedItemsPerPoll: number;
  readonly maxFetchesPerPoll: number;
}

export const PROPOSED_MACRO_POLICY: Readonly<MacroPolicy> = Object.freeze({
  enabled: false,
  rolloutApproved: false,
  criteriaAndCapsApproved: false,
  sourceAdapterApproved: false,
  pollingApproved: false,
  dryRun: true,
  maxEventsPer24h: 1,
  maxEventsPer7d: 2,
  maxEventAgeMinutes: 120,
  maxSharedUsdPerEvent: 0.25,
  maxSharedUsdPerUtcDay: 1,
  maxSharedUsdPerUtcMonth: 5,
  pollingIntervalMinutes: 15,
  maxFeedItemsPerPoll: 10,
  maxFetchesPerPoll: 2,
});

/** Caller supplies env and approvals; importing this module never reads env or enables work. */
export function macroPolicy(
  env: Readonly<Record<string, string | undefined>> = {},
  approvals: Partial<Pick<MacroPolicy, 'rolloutApproved' | 'criteriaAndCapsApproved' | 'sourceAdapterApproved' | 'pollingApproved'>> = {},
): MacroPolicy {
  return { ...PROPOSED_MACRO_POLICY, ...approvals, enabled: env.BOBBY_BRIEFINGS_MACRO_ENABLED === 'on', dryRun: true };
}

/** A planning gate, not a poller. Even a true result causes no network or scheduling. */
export function macroPollingAllowed(policy: MacroPolicy = macroPolicy()): boolean {
  return validPolicy(policy) && policy.enabled === true && policy.rolloutApproved === true && policy.criteriaAndCapsApproved === true
    && policy.sourceAdapterApproved === true && policy.pollingApproved === true;
}

export interface MacroPlanningContext {
  now: string;
  priorConfirmedDecision: FedRateDecision | null;
  /** Adapter confirmed there was no missed or out-of-order official decision between baseline and candidate. */
  baselineContinuityVerified: boolean;
  /** Durable macro event keys only, never weekly period keys. Must be complete for this decision. */
  processedMacroEventKeys: readonly string[];
  /** Real reserved/dispatched events, complete over the last seven days; not APNs receipt counts. */
  recentMacroEventTimes: readonly string[];
  accountingComplete: boolean;
  /** Dedicated macro reserved + settled exposure for these UTC windows, from durable accounting. */
  sharedUsdUtcDay: number;
  sharedUsdUtcMonth: number;
  /** Proposed upper reservation for ALL shared provider attempts of this event, including retries/audio. */
  proposedSharedReserveUsd: number;
}

export type MacroPlan =
  | { state: 'no-op'; reason: 'disabled' | 'unsupported_event' | 'unconfirmed' | 'unchanged' | 'duplicate' | 'expired' | 'frequency_cap' | 'cost_cap' }
  | { state: 'review-required'; reason: 'rollout_not_approved' | 'invalid_policy' | 'invalid_time' | 'invalid_provenance' | 'invalid_range' | 'missing_baseline' | 'invalid_baseline' | 'inconsistent_decision' | 'accounting_unavailable' }
  | { state: 'eligible-dry-run'; eventKey: string; sharedReportKey: string; criteriaVersion: string; sourceUrl: string;
      priorSourceUrl: string; direction: 'raise' | 'lower'; deltaBps: number; range: { lowerBps: number; upperBps: number };
      decisionAt: string; expiresAt: string; proposedSharedReserveUsd: number; pushCopy: typeof MACRO_PUSH_COPY };

const HOUR = 3_600_000;
const instant = (v: unknown): number | null => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)
  && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null;

function officialDocument(e: OfficialFedEvidence, decisionAt: number, now: number): string | null {
  if (!e || e.documentKind !== 'fomc_statement' || e.verification !== 'verified_official_document'
      || e.extractionVersion !== 'fed-target-range-v1' || !/^[0-9a-f]{64}$/.test(e.documentSha256)) return null;
  const verifiedAt = instant(e.verifiedAt);
  if (verifiedAt === null || verifiedAt < decisionAt || verifiedAt > now) return null;
  try {
    const u = new URL(e.url);
    if (u.protocol !== 'https:' || u.hostname !== 'www.federalreserve.gov' || u.username || u.password || u.port || u.search || u.hash) return null;
    const match = /^\/newsevents\/pressreleases\/(monetary(\d{4})(\d{2})(\d{2})[a-z])\.htm$/.exec(u.pathname);
    if (!match) return null;
    const date = `${match[2]}-${match[3]}-${match[4]}`;
    // NY dates are the publication date used by the Fed; URL identity is stable across content corrections.
    const nyDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(decisionAt));
    return nyDate === date ? match[1] : null;
  } catch { return null; }
}

function validRange(r: FedRateDecision['range']): boolean {
  return !!r && Number.isInteger(r.lowerBps) && Number.isInteger(r.upperBps)
    && r.lowerBps >= 0 && r.upperBps <= 10_000 && r.lowerBps < r.upperBps;
}

function validPolicy(p: MacroPolicy): boolean {
  return p.dryRun === true && [p.maxEventsPer24h, p.maxEventsPer7d, p.maxEventAgeMinutes, p.pollingIntervalMinutes, p.maxFeedItemsPerPoll, p.maxFetchesPerPoll]
    .every((n) => Number.isInteger(n) && n > 0)
    && [p.maxSharedUsdPerEvent, p.maxSharedUsdPerUtcDay, p.maxSharedUsdPerUtcMonth].every((n) => Number.isFinite(n) && n > 0);
}

/** Structural qualification of already verified evidence. It does not fetch or prove provenance by itself. */
export function planMacroEvent(candidate: FedRateDecision, ctx: MacroPlanningContext, policy: MacroPolicy = macroPolicy()): MacroPlan {
  if (policy.enabled !== true) return { state: 'no-op', reason: 'disabled' };
  if (!validPolicy(policy)) return { state: 'review-required', reason: 'invalid_policy' };
  if (policy.rolloutApproved !== true || policy.criteriaAndCapsApproved !== true || policy.sourceAdapterApproved !== true) {
    return { state: 'review-required', reason: 'rollout_not_approved' };
  }
  if (!candidate || candidate.kind !== 'fed_target_rate') return { state: 'no-op', reason: 'unsupported_event' };
  if (candidate.status !== 'confirmed') return { state: 'no-op', reason: 'unconfirmed' };
  const now = instant(ctx.now), at = instant(candidate.decisionAt);
  if (now === null || at === null || at > now) return { state: 'review-required', reason: 'invalid_time' };
  const documentKey = officialDocument(candidate.evidence, at, now);
  if (!documentKey) return { state: 'review-required', reason: 'invalid_provenance' };
  if (!validRange(candidate.range)) return { state: 'review-required', reason: 'invalid_range' };
  const eventKey = `macro:fed-target-range:${documentKey}`;
  if (!Array.isArray(ctx.processedMacroEventKeys)) return { state: 'review-required', reason: 'accounting_unavailable' };
  if (ctx.processedMacroEventKeys.includes(eventKey)) return { state: 'no-op', reason: 'duplicate' };
  if (now - at >= policy.maxEventAgeMinutes * 60_000) return { state: 'no-op', reason: 'expired' };
  const prior = ctx.priorConfirmedDecision;
  if (!prior) return { state: 'review-required', reason: 'missing_baseline' };
  const priorAt = instant(prior.decisionAt);
  const priorDocumentKey = priorAt === null ? null : officialDocument(prior.evidence, priorAt, now);
  if (ctx.baselineContinuityVerified !== true || prior.kind !== 'fed_target_rate' || prior.status !== 'confirmed' || priorAt === null || priorAt >= at
      || !validRange(prior.range) || !priorDocumentKey || priorDocumentKey === documentKey) return { state: 'review-required', reason: 'invalid_baseline' };
  const lowerDelta = candidate.range.lowerBps - prior.range.lowerBps;
  const upperDelta = candidate.range.upperBps - prior.range.upperBps;
  if (lowerDelta === 0 && upperDelta === 0 && candidate.action === 'maintain') return { state: 'no-op', reason: 'unchanged' };
  if (lowerDelta !== upperDelta || lowerDelta === 0 || (lowerDelta > 0 ? candidate.action !== 'raise' : candidate.action !== 'lower')) {
    return { state: 'review-required', reason: 'inconsistent_decision' };
  }
  const recent = Array.isArray(ctx.recentMacroEventTimes) ? ctx.recentMacroEventTimes.map(instant) : null;
  if (ctx.accountingComplete !== true || !recent || recent.some((t) => t === null || t > now)
      || ![ctx.sharedUsdUtcDay, ctx.sharedUsdUtcMonth].every((n) => Number.isFinite(n) && n >= 0)
      || ctx.sharedUsdUtcDay > ctx.sharedUsdUtcMonth
      || !Number.isFinite(ctx.proposedSharedReserveUsd) || ctx.proposedSharedReserveUsd <= 0) return { state: 'review-required', reason: 'accounting_unavailable' };
  if (recent.filter((t) => now - t! < 24 * HOUR).length >= policy.maxEventsPer24h
      || recent.filter((t) => now - t! < 7 * 24 * HOUR).length >= policy.maxEventsPer7d) return { state: 'no-op', reason: 'frequency_cap' };
  if (ctx.proposedSharedReserveUsd > policy.maxSharedUsdPerEvent
      || ctx.sharedUsdUtcDay + ctx.proposedSharedReserveUsd > policy.maxSharedUsdPerUtcDay
      || ctx.sharedUsdUtcMonth + ctx.proposedSharedReserveUsd > policy.maxSharedUsdPerUtcMonth) return { state: 'no-op', reason: 'cost_cap' };
  return {
    state: 'eligible-dry-run', eventKey, sharedReportKey: `event:${documentKey}`, criteriaVersion: MACRO_CRITERIA_VERSION,
    sourceUrl: candidate.evidence.url, priorSourceUrl: prior.evidence.url, direction: lowerDelta > 0 ? 'raise' : 'lower',
    deltaBps: Math.abs(lowerDelta), range: { ...candidate.range }, decisionAt: new Date(at).toISOString(),
    expiresAt: new Date(at + policy.maxEventAgeMinutes * 60_000).toISOString(), proposedSharedReserveUsd: ctx.proposedSharedReserveUsd,
    pushCopy: MACRO_PUSH_COPY,
  };
}
