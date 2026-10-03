import { APP_LANGUAGES, type AppLanguage } from '../../../src/lib/app-language.js';
// ============================================================
// Bobby Pro market briefings — shared types (build 53).
// Contract: docs/product/pro-market-briefings-implementation.md (implementation spec) and
// docs/product/pro-market-briefings-api-contracts.md (public API draft). Every module under
// api/_lib/briefings/ and the two functions (api/briefings.ts, api/briefing-worker.ts) speak these types.
// ============================================================

/** Internal cadence. Profile calls `morning` "Market opening" (a pre-market report, not the opening bell). */
export type Cadence = 'morning' | 'close' | 'weekly';
export const CADENCES: readonly Cadence[] = ['morning', 'close', 'weekly'];

export type BriefLanguage = AppLanguage | 'pt-BR';
/** pt-BR is a stored regional variant; the public settings language remains pt. */
export const BRIEF_LANGUAGES = [...APP_LANGUAGES, 'pt-BR'] as const;

/** A canonical period: identity of a report together with (identity_id, cadence). */
export interface Period {
  cadence: Cadence;
  /** morning: NY local date `YYYY-MM-DD`; close: NY session date `YYYY-MM-DD`; weekly: `YYYY-MM-DD_YYYY-MM-DD` (NY local start/end dates). */
  periodKey: string;
  /** Evidence interval, UTC ISO. morning: [previous 08:00 NY, this 08:00 NY); close: [session open, session close]; weekly: [prev Sunday 18:00 NY, this Sunday 18:00 NY). */
  periodStart: string;
  periodEnd: string;
  /** When the push becomes due (UTC ISO). morning: 08:00 NY; close: official close + delay; weekly: Sunday 18:00 NY. */
  scheduledAt: string;
  /** Preparation may start at this instant (UTC ISO). */
  prepareFrom: string;
  /** Ready-by deadline (UTC ISO); after it a late personal report falls back to shared content. */
  readyBy: string;
  /** No push is sent at or after this instant (UTC ISO). */
  pushExpiresAt: string;
  /** Calendar data version used to compute this period (evidence only, never part of the identity). */
  calendarVersion: string;
  /** Schedule policy version (evidence only). */
  policyVersion: string;
  /** Equity session facts for labelling (never imply a live equity session when closed). */
  equitySession: EquitySessionState;
}

export interface EquitySessionState {
  /** NY local date the label refers to. */
  date: string;
  /** 'open' only during a configured core session; 'closed_holiday' | 'closed_weekend' | 'closed' otherwise; 'unknown' outside calendar coverage. */
  state: 'open' | 'pre_market' | 'after_close' | 'closed_weekend' | 'closed_holiday' | 'unknown';
  /** The last completed session date (YYYY-MM-DD), when known. */
  lastSessionDate: string | null;
  /** Official close time of `date` (UTC ISO) when it is a session day; early closes respected. */
  closeAt: string | null;
  earlyClose: boolean;
  holidayName: string | null;
}

/** Freshness of one evidence item. Missing/stale data is never labelled live. */
export type Freshness = 'live' | 'delayed' | 'closed' | 'stale' | 'missing' | '24_7';

export interface AssetQuote {
  symbol: string;
  kind: 'crypto' | 'equity' | 'etf' | 'metal';
  price: number | null;
  /** % change over the cadence's comparison window (24h for crypto; vs previous close for equities; 7 days for weekly). */
  changePct: number | null;
  /** What `changePct` compares against, e.g. '24h', 'prev_close', '7d'. */
  changeBasis: '24h' | 'prev_close' | 'session' | '7d';
  asOf: string | null;
  freshness: Freshness;
}

/** Shared, non-personal evidence for one (cadence, period). Persisted with the shared row and copied into reports. */
export interface BriefEvidence {
  cadence: Cadence;
  periodKey: string;
  capturedAt: string;
  /** Oldest asOf among the items the narrative relies on (UTC ISO), or capturedAt when unknown. */
  dataAsOf: string;
  quotes: AssetQuote[];
  macro: {
    dxy: { value: number; asOf: string | null; freshness: Freshness } | null;
    fearGreed: { value: number; classification: string; asOf: string | null; freshness: Freshness } | null;
    regime: { label: string; freshness: Freshness } | null;
    funding: Array<{ symbol: string; ratePct: number; freshness: Freshness }>;
  };
  /** Only events from a stored calendar (agent_macro_events) or the exchange calendar; never invented. */
  agenda: Array<{ title: string; at: string; kind: 'macro' | 'market_hours'; severity: number | null }>;
  equitySession: EquitySessionState;
  /** Source names with their fetch outcome, for the report's source/freshness block. */
  sources: Array<{ name: string; ok: boolean; freshness: Freshness }>;
  /** Weekly only: real dated history used (provider daily candles or stored shared snapshots). */
  history?: Array<{ symbol: string; from: { at: string; price: number }; to: { at: string; price: number } }>;
  /** True when any item the report shows is stale or missing. */
  degraded: boolean;
}

export type SectionKind = 'market' | 'asset' | 'risks' | 'agenda' | 'week';
export type SectionStatus = Freshness | 'partial';

export interface BriefSection {
  kind: SectionKind;
  title: string;
  body: string;
  /** asset sections only */
  symbol?: string;
  asOf: string | null;
  status: SectionStatus;
  /** Numbers shown next to the text; always copied from evidence, never from the model. */
  facts?: Array<{ label: string; value: string }>;
  /** Plain-language explainer appended for readers who chose "new" experience (memory consent only). */
  explainer?: string;
}

/** The shared narrative written once per (cadence, period, language) — by the model or the facts-only fallback. */
export interface SharedNarrative {
  version: 1;
  language: BriefLanguage;
  /** A generic opening line (no name). */
  opening: string;
  market: BriefSection;
  /** Keyed by symbol. */
  assets: Record<string, BriefSection>;
  risks: BriefSection;
  agenda: BriefSection;
  /** weekly only */
  week?: BriefSection;
  /** 'model' when written by the LLM; 'facts_only' when the bounded fallback formatted the evidence. */
  source: 'model' | 'facts_only';
  model?: string;
}

export type BriefQuality = 'full' | 'partial' | 'facts_only';

/** The immutable per-account report body (bobby_briefs.content). ≤ 24 KiB serialized. */
export interface BriefContent {
  version: 1;
  cadence: Cadence;
  language: BriefLanguage;
  title: string;
  opening: string;
  /** Weekly retrospective source. An asked asset is an interest, never evidence of a holding. */
  personalBasis?: 'asked_assets' | 'explicit_interests' | 'general';
  sections: BriefSection[];
  /** ≤ 4 segments, each ≤ 800 chars, total ≤ 2,400 chars. Spoken text only (no name). */
  narrationSegments: string[];
  dataAsOf: string;
  sources: BriefEvidence['sources'];
  equitySession: EquitySessionState;
}

/** Account briefing settings as stored (bobby_brief_settings) and returned by GET. */
export interface BriefSettings {
  revision: number;
  openingEnabled: boolean;
  closeEnabled: boolean;
  weeklyEnabled: boolean;
  language: BriefLanguage;
  companionId: string | null;
  assets: string[];
  analysisConsentEnabled: boolean;
  analysisConsentVersion: number | null;
  audioConsentEnabled: boolean;
  audioConsentVersion: number | null;
  privacyEpoch: number;
}

/** The settings frozen into a report at claim time. */
export interface FrozenSettings {
  settingsRevision: number;
  privacyEpoch: number;
  language: BriefLanguage;
  companionId: string | null;
  voice: string;
  assets: string[];
  analysisConsent: boolean;
  analysisConsentVersion: number | null;
  audioConsent: boolean;
}

/** Explicit memory the composer may use (only with analysis consent, memory enabled and BOBBY_BRIEFINGS_MEMORY=on). */
export interface ComposerMemory {
  experience: 'new' | 'some' | 'experienced' | null;
  explainRiskDepth: 'low' | 'medium' | 'high' | null;
  /** Supported symbols the account asked about at least once, most relevant first. */
  frequentAssets: string[];
}

export type DeviceEnvironment = 'production' | 'sandbox';
export type PermissionState = 'notDetermined' | 'denied' | 'authorized' | 'provisional';

/** Provider attempt accounting (bobby_brief_provider_attempts). */
export type AttemptKind = 'llm' | 'tts';
export type AttemptOutcome = 'settled' | 'no_charge' | 'unknown';

/** Stable error codes used across the API (contract §Common errors). */
export type BriefErrorCode =
  | 'invalid_request' | 'signin_required' | 'subscription_required' | 'not_found'
  | 'revision_conflict' | 'content_version_conflict' | 'payload_too_large' | 'revision_required'
  | 'rate_limited' | 'auth_unavailable' | 'storage_unavailable' | 'budget_unavailable' | 'feature_disabled'
  | 'voice_unavailable' | 'consent_required' | 'device_limit' | 'conflict' | 'idempotency_key_required'
  | 'idempotency_mismatch' | 'method_not_allowed';
