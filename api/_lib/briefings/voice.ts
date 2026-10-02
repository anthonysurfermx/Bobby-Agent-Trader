// ============================================================
// Bobby Pro market briefings — narration synthesis, one per cache key (decision D2).
// The audio row (bobby_brief_audio, unique cache_key) is the single-flight lock: bobby_brief_audio_claim hands a
// fenced lease to exactly one caller; every concurrent caller for the same key gets 'busy' and is told to poll
// (processing), so two readers with the same companion never pay for the same segment twice.
// The claimant runs ONE reserved TTS attempt (budget.ts), stores the MP3 in the private bucket, then commits
// 'ready' under its fence. Failures:
//   · budget refusal (caps, slots, unresolved attempt, storage) → commit 'release' (no attempt spent), answer queued + Retry-After;
//   · provider failure → commit 'retry', or 'failed' once the work item's attempt cap is reached;
//   · an unknown outcome → 'retry': the reservation blocks re-paying until reconciliation settles it.
// With the kill switch off (BOBBY_BRIEFINGS_ENABLED ≠ 'on') nothing is synthesized: 'failed', no DB or provider
// call. Database errors from the claim propagate as BriefingStorageError (the router answers 503).
// No text, voice choice or identity is logged.
// ============================================================
import * as dbModule from './db.js';
import { audioPath, supabaseAudioStore, type AudioStore } from './audio-store.js';
import { withReservation, type ReservationFailure } from './budget.js';
import { AUDIO_MIME, briefingsEnabled, LEASE_SECONDS, MAX_ATTEMPTS_PER_WORK, TTS_MODEL, TTS_TIMEOUT_MS } from './config.js';
import { ttsOnce, ttsReserveUsd } from './providers.js';
import type { BriefLanguage } from './types.js';

export type AudioState = 'ready' | 'queued' | 'processing' | 'failed';
export interface EnsureAudioDeps { db: typeof import('./db.js'); store: AudioStore; tts: typeof ttsOnce; withReservation: typeof withReservation }

/** Seconds a client should wait before polling again, by why the synthesis did not happen now. */
const RETRY_AFTER: Record<ReservationFailure, number> = {
  slots_full: 3,
  storage_unavailable: 5,
  work_unresolved: 15,
  provider_unknown: 15,
  provider_failed: 5,
  budget_exhausted: 60,
  budget_unavailable: 60,
  attempts_exhausted: 60,
};
const BUSY_RETRY_S = 2;

export async function ensureAudio(
  p: { audioId: string; cacheKey: string; text: string; voice: string; language: BriefLanguage; worker: string },
  deps?: Partial<EnsureAudioDeps>,
): Promise<{ state: AudioState; retryAfterSeconds?: number }> {
  if (!briefingsEnabled()) return { state: 'failed' };
  const db = deps?.db ?? dbModule;
  const tts = deps?.tts ?? ttsOnce;
  const reserve = deps?.withReservation ?? withReservation;

  const claim = await db.claimAudio(p.audioId, p.worker, LEASE_SECONDS);
  if (claim.state === 'ready') return { state: 'ready' };
  if (claim.state === 'busy') return { state: 'processing', retryAfterSeconds: BUSY_RETRY_S };
  if (claim.state !== 'claimed') return { state: 'failed' };
  const { fence } = claim;
  const priorAttempts = Number(claim.attempts) || 0;

  const commit = async (state: 'ready' | 'retry' | 'release' | 'failed', path: string | null, bytes: number | null, error: string | null): Promise<boolean> => {
    try {
      const r = await db.commitAudio(p.audioId, fence, state, path, bytes, error);
      return Boolean(r?.ok);
    } catch {
      // The lease expires and reconcile makes the row claimable again.
      console.error('[briefings-voice] commit', state, 'storage');
      return false;
    }
  };

  const r = await reserve(
    { kind: 'tts', workRef: `audio:${p.cacheKey}`, provider: 'openai', model: TTS_MODEL(), reserveUsd: ttsReserveUsd(p.text.length), worker: p.worker },
    () => tts(p.text, p.voice, p.language, { timeoutMs: TTS_TIMEOUT_MS }),
  );

  if (!r.ok) {
    const code = (r as { ok: false; code: ReservationFailure }).code;
    const providerSpent = code === 'provider_failed';
    // Only an attempt that reached the provider (failed or unknown) consumes one of the key's attempts; refusals
    // (caps, slots, an unresolved attempt, storage) release the row unchanged — they spend nothing.
    const reachedProvider = providerSpent || code === 'provider_unknown';
    const final = code === 'attempts_exhausted' || (providerSpent && priorAttempts + 1 >= MAX_ATTEMPTS_PER_WORK);
    await commit(final ? 'failed' : reachedProvider ? 'retry' : 'release', null, null, code);
    return final ? { state: 'failed' } : { state: 'queued', retryAfterSeconds: RETRY_AFTER[code] };
  }

  const audio = (r as { ok: true; value: Buffer }).value;
  const path = audioPath(p.cacheKey);
  try {
    await (deps?.store ?? supabaseAudioStore()).put(path, audio, AUDIO_MIME);
  } catch {
    console.error('[briefings-voice] store put failed');
    await commit('retry', null, null, 'storage');
    return { state: 'queued', retryAfterSeconds: RETRY_AFTER.storage_unavailable };
  }
  if (!(await commit('ready', path, audio.length, null))) {
    // Lost the fence (another worker re-claimed after our lease) or the commit failed: the object is stored at
    // the same content-addressed path either way; the client polls until a commit lands.
    return { state: 'processing', retryAfterSeconds: BUSY_RETRY_S };
  }
  return { state: 'ready' };
}
