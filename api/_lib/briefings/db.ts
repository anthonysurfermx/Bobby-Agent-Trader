// ============================================================
// Bobby Pro market briefings — typed RPC client (migration 20261002180000_pro_briefings.sql).
// Every call goes through the service role and is scoped by an identity the server derived from a verified
// Supabase session (never a client-sent owner). A transport/HTTP failure throws BriefingStorageError: callers
// answer 503 storage_unavailable and never treat it as "empty" or "not authorized".
// Logs carry the RPC name and status only — never identities, symbols, tokens or report text.
// ============================================================
import { bobbyRest, bobbyServiceHeaders } from '../bobby-db.js';
import type { BriefSettings, Cadence, ComposerMemory, DeviceEnvironment, FrozenSettings, PermissionState } from './types.js';
import { COMPANION_VOICES, voiceForCompanion } from './config.js';

export class BriefingStorageError extends Error {
  constructor(readonly rpc: string, readonly status: number | null) {
    super(`briefing storage ${rpc} ${status ?? 'network'}`);
    this.name = 'BriefingStorageError';
  }
}

export type RpcFn = (name: string, body: Record<string, unknown>, timeoutMs?: number) => Promise<unknown>;

/** The default transport: PostgREST rpc with the service key. Replaceable in tests via setBriefingRpc(). */
export const postgrestRpc: RpcFn = async (name, body, timeoutMs = 6000) => {
  let r: Response;
  try {
    r = await fetch(bobbyRest(`rpc/${name}`), { method: 'POST', headers: bobbyServiceHeaders(), body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    console.error('[briefings-db]', name, 'network');
    throw new BriefingStorageError(name, null);
  }
  if (!r.ok) {
    console.error('[briefings-db]', name, r.status);
    throw new BriefingStorageError(name, r.status);
  }
  const text = await r.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { throw new BriefingStorageError(name, r.status); }
};

let transport: RpcFn = postgrestRpc;
/** Tests only. */
export function setBriefingRpc(fn: RpcFn | null): void { transport = fn ?? postgrestRpc; }
export const rpc = (name: string, body: Record<string, unknown>, timeoutMs?: number) => transport(name, body, timeoutMs);

const obj = (v: unknown, name: string): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new BriefingStorageError(name, 200);
  return v as Record<string, unknown>;
};

// ---- Feature-specific paid ACTIVE Pro. Grants/trials/Sandbox/unknown paid-period evidence fail closed. ----
/** True/false from the database; throws BriefingStorageError when unknown (callers answer 503, never "free"). */
export async function isPro(identityId: string): Promise<boolean> {
  const v = await rpc('bobby_brief_is_paid_pro', { p_identity: identityId }, 4000);
  if (typeof v !== 'boolean') throw new BriefingStorageError('bobby_brief_is_paid_pro', 200);
  return v;
}

// ---- settings ----
export async function getSettings(identityId: string): Promise<BriefSettings> {
  return obj(await rpc('bobby_brief_settings_get', { p_identity: identityId }), 'bobby_brief_settings_get') as unknown as BriefSettings;
}
export type SettingsPatchResult = { ok: true; settings: BriefSettings } | { ok: false; code: 'revision_conflict'; revision: number };
export async function patchSettings(identityId: string, expectedRevision: number, patch: Record<string, unknown>): Promise<SettingsPatchResult> {
  return obj(await rpc('bobby_brief_settings_patch', { p_identity: identityId, p_expected_revision: expectedRevision, p_patch: patch }), 'bobby_brief_settings_patch') as unknown as SettingsPatchResult;
}

// ---- devices ----
export interface DeviceWrite {
  tokenCiphertext: string; tokenFingerprint: string; environment: DeviceEnvironment; topic: string;
  permission: PermissionState; appBuild: number;
}
export type DeviceResult =
  | { ok: true; registrationId: string; bindingRevision: number }
  | { ok: false; code: 'conflict' | 'device_limit' | 'not_found' | 'revision_conflict'; bindingRevision?: number };
export async function registerDevice(identityId: string, installationId: string, w: DeviceWrite, credentialVerifier: string, maxActive: number): Promise<DeviceResult> {
  return obj(await rpc('bobby_push_device_register', {
    p_identity: identityId, p_installation: installationId, p_token_ciphertext: w.tokenCiphertext, p_token_fingerprint: w.tokenFingerprint,
    p_environment: w.environment, p_topic: w.topic, p_permission: w.permission, p_app_build: w.appBuild,
    p_credential_verifier: credentialVerifier, p_max_active: maxActive,
  }), 'bobby_push_device_register') as unknown as DeviceResult;
}
export async function rebindDevice(identityId: string, registrationId: string, expectedRevision: number, proofVerifier: string, newVerifier: string, w: DeviceWrite, maxActive: number): Promise<DeviceResult> {
  return obj(await rpc('bobby_push_device_rebind', {
    p_identity: identityId, p_registration: registrationId, p_expected_revision: expectedRevision, p_proof_verifier: proofVerifier,
    p_new_verifier: newVerifier, p_token_ciphertext: w.tokenCiphertext, p_token_fingerprint: w.tokenFingerprint,
    p_environment: w.environment, p_topic: w.topic, p_permission: w.permission, p_app_build: w.appBuild, p_max_active: maxActive,
  }), 'bobby_push_device_rebind') as unknown as DeviceResult;
}
export type RevokeResult = { ok: true; state: 'revoked' | 'already' } | { ok: false; code: 'revision_conflict'; bindingRevision?: number };
export async function revokeDevice(identityId: string, registrationId: string, expectedRevision: number, proofVerifier: string): Promise<RevokeResult> {
  return obj(await rpc('bobby_push_device_revoke', { p_identity: identityId, p_registration: registrationId, p_expected_revision: expectedRevision, p_proof_verifier: proofVerifier }), 'bobby_push_device_revoke') as unknown as RevokeResult;
}
export async function invalidateDevice(registrationId: string, bindingRevision: number, reason: string): Promise<void> {
  await rpc('bobby_push_device_invalidate', { p_registration: registrationId, p_binding_revision: bindingRevision, p_reason: reason });
}

// ---- idempotency ----
export type IdemBegin = { state: 'new' } | { state: 'replay'; status: number; response: string } | { state: 'mismatch' } | { state: 'in_progress' };
export async function idemBegin(identityId: string, scope: string, key: string, digest: string, ttlSeconds: number): Promise<IdemBegin> {
  return obj(await rpc('bobby_brief_idem_begin', { p_identity: identityId, p_scope: scope, p_key: key, p_digest: digest, p_ttl_seconds: ttlSeconds }), 'bobby_brief_idem_begin') as unknown as IdemBegin;
}
export async function idemFinish(identityId: string, scope: string, key: string, status: number, response: string): Promise<void> {
  await rpc('bobby_brief_idem_finish', { p_identity: identityId, p_scope: scope, p_key: key, p_status: status, p_response: response });
}

// ---- worker: seed / shared / personal ----
export async function seedPeriod(p: { cadence: Cadence; periodKey: string; periodStart: string; periodEnd: string; scheduledAt: string; pushExpiresAt: string; calendarVersion: string; policyVersion: string }): Promise<number> {
  const r = obj(await rpc('bobby_brief_seed', {
    p_cadence: p.cadence, p_period_key: p.periodKey, p_period_start: p.periodStart, p_period_end: p.periodEnd,
    p_scheduled_at: p.scheduledAt, p_push_expires_at: p.pushExpiresAt, p_calendar_version: p.calendarVersion, p_policy_version: p.policyVersion,
  }, 10_000), 'bobby_brief_seed');
  return Number(r.seeded) || 0;
}

export type SharedClaim =
  | { state: 'ready'; id: string; narrative: unknown; evidence: unknown }
  | { state: 'claimed'; id: string; fence: number; attempts: number }
  | { state: 'busy' } | { state: 'failed'; id?: string };
export async function claimShared(cadence: Cadence, periodKey: string, language: string, worker: string, leaseSeconds: number, maxAttempts: number): Promise<SharedClaim> {
  return obj(await rpc('bobby_brief_shared_claim', { p_cadence: cadence, p_period_key: periodKey, p_language: language, p_worker: worker, p_lease_seconds: leaseSeconds, p_max_attempts: maxAttempts }), 'bobby_brief_shared_claim') as unknown as SharedClaim;
}
export async function commitShared(id: string, fence: number, state: 'ready' | 'retry' | 'failed', evidence: unknown, narrative: unknown, dataAsOf: string | null, error: string | null): Promise<{ ok: boolean; code?: string }> {
  return obj(await rpc('bobby_brief_shared_commit', { p_id: id, p_fence: fence, p_state: state, p_evidence: evidence ?? null, p_narrative: narrative ?? null, p_data_as_of: dataAsOf, p_error: error }), 'bobby_brief_shared_commit') as { ok: boolean; code?: string };
}
export async function neededAssets(cadence: Cadence, periodKey: string, language: string): Promise<string[]> {
  const r = obj(await rpc('bobby_brief_needed_assets', { p_cadence: cadence, p_period_key: periodKey, p_language: language }), 'bobby_brief_needed_assets');
  return Array.isArray(r.symbols) ? r.symbols.filter((s): s is string => typeof s === 'string') : [];
}

/** Languages of the period's open (pending/preparing) reports: the worker writes a shared narrative only for these. */
export async function openLanguages(cadence: Cadence, periodKey: string): Promise<Array<'en' | 'es'>> {
  const r = obj(await rpc('bobby_brief_open_languages', { p_cadence: cadence, p_period_key: periodKey }), 'bobby_brief_open_languages');
  return Array.isArray(r.languages) ? r.languages.filter((l): l is 'en' | 'es' => l === 'en' || l === 'es') : [];
}

export interface ClaimedBrief { id: string; identityId: string; fence: number; frozen: FrozenSettings; memory: ComposerMemory | null }
export async function claimBriefs(cadence: Cadence, periodKey: string, worker: string, leaseSeconds: number, limit: number): Promise<ClaimedBrief[]> {
  // The companion→voice map lives only in config.ts; the claim freezes the voice from it (FrozenSettings.voice).
  const r = obj(await rpc('bobby_brief_claim', {
    p_cadence: cadence, p_period_key: periodKey, p_worker: worker, p_lease_seconds: leaseSeconds, p_limit: limit,
    p_voices: COMPANION_VOICES, p_default_voice: voiceForCompanion(null),
  }, 10_000), 'bobby_brief_claim');
  return Array.isArray(r.items) ? (r.items as ClaimedBrief[]) : [];
}
export type PublishResult = { ok: true } | { ok: false; code: 'stale_fence' | 'not_pro' | 'opted_out' | 'privacy_changed' };
export async function publishBrief(p: { id: string; fence: number; sharedId: string; content: unknown; quality: string; dataAsOf: string; usesMemory: boolean; memoryAssets: string[]; settingsRevision: number; privacyEpoch: number }): Promise<PublishResult> {
  return obj(await rpc('bobby_brief_publish', {
    p_id: p.id, p_fence: p.fence, p_shared_id: p.sharedId, p_content: p.content, p_quality: p.quality, p_data_as_of: p.dataAsOf,
    p_uses_memory: p.usesMemory, p_memory_assets: p.memoryAssets, p_settings_revision: p.settingsRevision, p_privacy_epoch: p.privacyEpoch,
  }), 'bobby_brief_publish') as unknown as PublishResult;
}
export async function failBrief(id: string, fence: number, error: string, final: boolean): Promise<void> {
  await rpc('bobby_brief_fail', { p_id: id, p_fence: fence, p_error: error.slice(0, 64), p_final: final });
}

// ---- outbox ----
export async function fillOutbox(limit: number): Promise<number> {
  const r = obj(await rpc('bobby_brief_outbox_fill', { p_limit: limit }, 10_000), 'bobby_brief_outbox_fill');
  return Number(r.inserted) || 0;
}
export interface OutboxItem {
  id: string; fence: number; briefId: string; deviceId: string; bindingRevision: number; tokenCiphertext: string;
  environment: DeviceEnvironment; topic: string; apnsId: string; collapseId: string; language: 'en' | 'es'; expiresAt: string; attempts: number;
}
export async function claimOutbox(worker: string, leaseSeconds: number, limit: number): Promise<OutboxItem[]> {
  const r = obj(await rpc('bobby_brief_outbox_claim', { p_worker: worker, p_lease_seconds: leaseSeconds, p_limit: limit }, 10_000), 'bobby_brief_outbox_claim');
  return Array.isArray(r.items) ? (r.items as OutboxItem[]) : [];
}
export type OutboxOutcome = 'accepted' | 'retry' | 'invalid_token' | 'ambiguous' | 'config';
export async function outboxResult(id: string, fence: number, outcome: OutboxOutcome, apnsStatus: number | null, reason: string | null, retryAfterSeconds: number | null): Promise<void> {
  await rpc('bobby_brief_outbox_result', { p_id: id, p_fence: fence, p_outcome: outcome, p_apns_status: apnsStatus, p_reason: reason ? reason.slice(0, 48) : null, p_retry_after_seconds: retryAfterSeconds });
}

// ---- budget ----
export type ReserveResult = { ok: true; attemptId: string } | { ok: false; code: 'not_configured' | 'work_unresolved' | 'attempts_exhausted' | 'slots_full' | 'budget_exhausted' };
export async function reserveAttempt(p: { kind: 'llm' | 'tts'; workRef: string; provider: string; model: string; reserveUsd: number; dayCap: number; monthCap: number; maxSlots: number; maxAttemptsPerWork: number; worker: string }): Promise<ReserveResult> {
  return obj(await rpc('bobby_brief_budget_reserve', {
    p_kind: p.kind, p_work_ref: p.workRef, p_provider: p.provider, p_model: p.model, p_reserve_usd: Number(p.reserveUsd.toFixed(6)),
    p_day_cap: p.dayCap, p_month_cap: p.monthCap, p_max_slots: p.maxSlots, p_max_attempts_per_work: p.maxAttemptsPerWork, p_worker: p.worker,
  }), 'bobby_brief_budget_reserve') as unknown as ReserveResult;
}
export async function dispatchAttempt(attemptId: string): Promise<void> {
  await rpc('bobby_brief_budget_dispatch', { p_attempt: attemptId });
}
export async function settleAttempt(attemptId: string, outcome: 'settled' | 'no_charge' | 'unknown', actualUsd: number | null, usage: { tokensIn?: number; tokensOut?: number; chars?: number; latencyMs?: number; estimated?: boolean } = {}): Promise<void> {
  await rpc('bobby_brief_budget_settle', {
    p_attempt: attemptId, p_outcome: outcome, p_actual_usd: actualUsd === null ? null : Number(actualUsd.toFixed(6)),
    p_tokens_in: usage.tokensIn ?? null, p_tokens_out: usage.tokensOut ?? null, p_chars: usage.chars ?? null,
    p_latency_ms: usage.latencyMs ?? null, p_estimated: usage.estimated ?? false,
  });
}
export async function budgetStatus(): Promise<Record<string, unknown>> {
  return obj(await rpc('bobby_brief_budget_status', {}), 'bobby_brief_budget_status');
}

// ---- audio ----
export type AudioRequest = { audioId: string; state: 'queued' | 'processing' | 'ready' | 'failed' } | { code: 'not_found' | 'content_version_conflict' | 'subscription_required' };
export async function requestAudio(identityId: string, briefId: string, contentVersion: number, segment: number, cacheKey: string, voice: string, language: string): Promise<AudioRequest> {
  return obj(await rpc('bobby_brief_audio_request', { p_identity: identityId, p_brief: briefId, p_content_version: contentVersion, p_segment: segment, p_cache_key: cacheKey, p_voice: voice, p_language: language }), 'bobby_brief_audio_request') as unknown as AudioRequest;
}
export type AudioClaim = { state: 'claimed'; fence: number; attempts: number } | { state: 'ready' | 'busy' | 'failed' };
export async function claimAudio(audioId: string, worker: string, leaseSeconds: number): Promise<AudioClaim> {
  return obj(await rpc('bobby_brief_audio_claim', { p_audio: audioId, p_worker: worker, p_lease_seconds: leaseSeconds }), 'bobby_brief_audio_claim') as unknown as AudioClaim;
}
export async function commitAudio(audioId: string, fence: number, state: 'ready' | 'retry' | 'release' | 'failed', storagePath: string | null, bytes: number | null, error: string | null): Promise<{ ok: boolean; code?: string }> {
  return obj(await rpc('bobby_brief_audio_commit', { p_audio: audioId, p_fence: fence, p_state: state, p_storage_path: storagePath, p_bytes: bytes, p_error: error }), 'bobby_brief_audio_commit') as { ok: boolean; code?: string };
}
export type AudioAuth = { state: 'queued' | 'processing' | 'ready' | 'failed'; storagePath: string | null; mime: string } | { code: 'not_found' | 'subscription_required' };
export async function authorizeAudio(identityId: string, audioId: string): Promise<AudioAuth> {
  return obj(await rpc('bobby_brief_audio_authorize', { p_identity: identityId, p_audio: audioId }), 'bobby_brief_audio_authorize') as unknown as AudioAuth;
}

// ---- reads ----
export interface InboxItem { id: string; cadence: Cadence; periodStart: string; periodEnd: string; scheduledAt: string; dataAsOf: string | null; calendarVersion: string; contentVersion: number; quality: string; audioState: string }
export interface InboxResult { items: InboxItem[]; latest: Array<{ cadence: Cadence; periodKey: string; scheduledAt: string; state: 'ready' | 'preparing' | 'unavailable' }> }
export async function inbox(identityId: string, cadence: Cadence | null, before: { scheduledAt: string; id: string } | null, limit: number): Promise<InboxResult> {
  const r = obj(await rpc('bobby_brief_inbox', { p_identity: identityId, p_cadence: cadence, p_before_scheduled: before?.scheduledAt ?? null, p_before_id: before?.id ?? null, p_limit: limit }), 'bobby_brief_inbox');
  return { items: Array.isArray(r.items) ? (r.items as InboxItem[]) : [], latest: Array.isArray(r.latest) ? (r.latest as InboxResult['latest']) : [] };
}
export type ReportRow = { report: Record<string, unknown> } | { code: 'not_found' | 'subscription_required' };
export async function getReport(identityId: string, id: string): Promise<ReportRow> {
  return obj(await rpc('bobby_brief_get', { p_identity: identityId, p_id: id }), 'bobby_brief_get') as unknown as ReportRow;
}

// ---- maintenance ----
export async function reconcile(settleSecondsValue: number): Promise<Record<string, unknown>> {
  return obj(await rpc('bobby_brief_reconcile', { p_settle_seconds: settleSecondsValue }, 10_000), 'bobby_brief_reconcile');
}
export async function purge(r: { reportDays: number; audioDays: number; outboxDays: number; attemptDays: number; deviceDays: number; idempotencyHours: number; sharedDays: number; purgeBatch: number }): Promise<{ storagePaths: string[] }> {
  const out = obj(await rpc('bobby_brief_purge', {
    p_report_days: r.reportDays, p_audio_days: r.audioDays, p_outbox_days: r.outboxDays, p_attempt_days: r.attemptDays,
    p_device_days: r.deviceDays, p_idem_hours: r.idempotencyHours, p_shared_days: r.sharedDays, p_limit: r.purgeBatch,
  }, 10_000), 'bobby_brief_purge');
  return { storagePaths: Array.isArray(out.storagePaths) ? out.storagePaths.filter((s): s is string => typeof s === 'string') : [] };
}
