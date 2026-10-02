# Bobby Pro market briefings — implementation spec (build 53)

Status: implementation contract for branch `feat/pro-briefings-b53` (base `origin/main` b96e4ee). It refines the
[design](pro-market-briefings-build-53.md) and the [API draft](pro-market-briefings-api-contracts.md); where this file is
more specific, it wins. Nothing here authorizes deploys, remote migrations, Apple capability changes or real sends.

## 0. Decisions taken in this implementation

| # | Decision | Why |
|---|---|---|
| D1 | **No per-account LLM call.** One shared narrative per (cadence, period, language); the "personal synthesis" is a deterministic composition (followed assets, consented memory → which sections, explainer depth). | Cost is O(periods × languages), not O(users); memory never reaches an AI provider (same principle as memory v2, PR #112); no debate per recipient. |
| D2 | **Audio is shared** and keyed by `sha256(text, voice, language, vibe, model)`; segments are whole shared blocks, so two readers with the same companion reuse the same audio. Stored in a **private Supabase Storage bucket** `briefing-audio` (no object storage existed); served only through the authenticated `audio` op. | Bounded TTS spend; no permanent public URL. |
| D3 | **Two functions**: `api/briefings.ts` (router, `op` query) + `api/briefing-worker.ts` (cron). `vercel.json` rewrites map the contract paths: `/api/briefing-settings`→`op=settings`, `/api/briefing-device`→`op=device`, `/api/briefing`→`op=report`, `/api/briefing-voice`→`op=voice`, `/api/briefing-audio`→`op=audio`; `/api/briefings` is the inbox. | Lean infra (≈101 functions today). |
| D4 | Cadences are **adopted by config**: `BOBBY_BRIEFINGS_CADENCES` (default `morning`). Close (+15 min) and weekly (Sun 18:00) are implemented with the proposed policy but return `configured:false` until adopted; Profile shows them disabled with "schedule pending". | Only 08:00 NY is confirmed. |
| D5 | Morning runs every calendar day (`BOBBY_BRIEFINGS_MORNING_DAYS=all`, alt `sessions`); on non-session days equities are labelled closed and crypto is 24/7. | Proposal P1 (pending approval). |
| D6 | Weekly history = provider **daily candles** for the interval (dated, real) + the persisted shared evidence rows; never today's snapshot relabelled. | Design §Generation. |
| D7 | Token rotation for the **same owner** re-fences pending outbox rows to the new binding revision in the same transaction (the old token is never used). An **owner change** (A→B) cancels A's unsent rows. | Keeps the 08:00 push across a token refresh without ever delivering under a stale binding. |
| D8 | An `unknown` (timed-out/crashed) paid attempt blocks retries of that work item until reconciliation; reconciliation after `BOBBY_BRIEFINGS_SETTLE_SECONDS` (default 300) **assumes the charge** at the reserved amount (`settled_assumed`), then the item may retry within its attempt cap (2). | Never a blind retry; exposure bounded and counted. |
| D9 | Push APNs environment comes from the client's **signed provisioning profile** (`apnsEnvironment` field, `production` when no embedded profile) and must be in `BOBBY_APNS_ENVIRONMENTS` (default `production`). Topic is server config only. | Contract: no client-chosen topic; env derived from signing, not DEBUG. |
| D10 | Memory personalization of briefings needs: account `analysisConsentEnabled` (current version) + memory enabled + `BOBBY_BRIEFINGS_MEMORY=on` (default off until App Privacy answers cover it). iOS gets a memory screen (view/correct/pause/delete via `/api/memory`). | Design §7. |
| D11 | Retention (proposals, parameters of the purge RPC, not hard-coded in SQL): reports 90 d, audio 14 d, outbox 30 d, provider attempts 400 d (no personal data), revoked/invalid devices 30 d, idempotency 24 h, shared evidence 120 d. | Must be explicit before activation. |

## 1. Configuration (env; no secrets in Git) — `api/_lib/briefings/config.ts`

| Variable | Meaning | Default |
|---|---|---|
| `BOBBY_BRIEFINGS_ENABLED` | `on` enables preparation/dispatch/synthesis. Reads of retained reports work regardless. | off |
| `BOBBY_BRIEFINGS_CADENCES` | Comma list of adopted cadences. | `morning` |
| `BOBBY_BRIEFINGS_MORNING_DAYS` | `all` or `sessions`. | `all` |
| `BOBBY_BRIEFINGS_DAILY_CAP_USD`, `BOBBY_BRIEFINGS_MONTHLY_CAP_USD` | Dedicated caps (UTC day/month). Missing/invalid ⇒ `budget_unavailable` (no paid work). | none |
| `BOBBY_BRIEFINGS_LLM` | Ordered provider:model list. | `anthropic:claude-sonnet-5-5,openai:gpt-4o-mini` |
| `BOBBY_BRIEFINGS_LLM_MAX_TOKENS` | Output ceiling per narrative attempt. | 3000 |
| `BOBBY_BRIEFINGS_TTS_RESERVE_USD_PER_CHAR` / `_ESTIMATE_USD_PER_CHAR` | Reservation / settlement estimate for `gpt-4o-mini-tts` (no usage in the response). | 0.00004 / 0.000017 |
| `BOBBY_BRIEFINGS_LLM_SLOTS`, `BOBBY_BRIEFINGS_TTS_SLOTS` | Global concurrent unresolved attempts. | 2 / 2 |
| `BOBBY_BRIEFINGS_SETTLE_SECONDS` | Unknown-attempt reconciliation delay. | 300 |
| `BOBBY_BRIEFINGS_MEMORY` | `on` lets consented memory shape reports. | off |
| `BOBBY_PUSH_TOKEN_KEY` | base64 32-byte master key; HKDF → AES-256-GCM token key + HMAC fingerprint key + receipt key. Missing ⇒ device registration `503 feature_disabled`. | none |
| `BOBBY_APNS_KEY_ID`, `BOBBY_APNS_TEAM_ID`, `BOBBY_APNS_PRIVATE_KEY` (.p8 PEM, `\n` unescaped) | APNs token auth. Missing ⇒ dispatch paused (rows stay pending until expiry). | none |
| `BOBBY_APNS_TOPIC` | Bundle id topic. | `xyz.bobbyprotocol.bobby` |
| `BOBBY_APNS_ENVIRONMENTS` | Allowed environments. | `production` |
| `CRON_SECRET` | Worker auth (strict, only this secret). | none ⇒ 503 |
| `BOBBY_OPS_SECRET` | Manual worker run (`POST`, header `x-bobby-ops`); `at=` time override only when `VERCEL_ENV !== 'production'`. | none |

Static configuration lives in `config.ts` constants: supported asset universe (BTC, ETH, SOL, XAUT, XAG, NVDA, AAPL, TSLA,
META, MSFT, COIN, SPY, GOOGL, AMZN, AMD, MSTR, QQQ), companion→voice allowlist (orb ash, byte ballad, kora coral,
zip sage, glitch cedar, momo marin, flux alloy, rook onyx, halo shimmer, axiom fable, iris sage, sol coral, zuri nova,
mira alloy, nalu marin, vega shimmer, noor fable, keo mellow), consent versions (analysis 1, audio 1), limits
(assets ≤ 6, report ≤ 24 KiB, segments ≤ 4 × 800, narration ≤ 2,400, devices ≤ 5/account), push copy
(es "Bobby tiene tu resumen de mercado listo", en "Bobby has your market briefing ready", title "Bobby").

## 2. Calendar and periods — `api/_lib/briefings/calendar.ts`

- Pure, deterministic, `now` injected. Uses `Intl.DateTimeFormat` with `America/New_York` (never a fixed offset).
- `nyParts(instant)`, `nyLocalToUtc(date: 'YYYY-MM-DD', time: 'HH:MM')` (DST-safe: resolves the gap/overlap deterministically —
  a non-existent local time moves forward, an ambiguous one takes the first occurrence).
- `NYSE_CALENDAR` versioned constant `nyse-2026-2027-v1` (coverage 2026-01-01 … 2027-12-31): holidays 2026 Jan 1, Jan 19,
  Feb 16, Apr 3, May 25, Jun 19, Jul 3, Sep 7, Nov 26, Dec 25; 2027 Jan 1, Jan 18, Feb 15, Mar 26, May 31, Jun 18, Jul 5,
  Sep 6, Nov 25, Dec 24. Early closes 13:00: 2026 Nov 27, Dec 24; 2027 Nov 26. Core session 09:30–16:00. **Verify against
  nyse.com before activation** (flag in the doc). Outside coverage: equity state `unknown`, close cadence not scheduled.
- `periodFor(cadence, now, policy)` → the period whose window contains `now` (or null); `nextScheduled(cadence, now, policy)`
  → next `scheduledAt`; `duePeriods(now, policy)` → periods in preparation or dispatch window.
- Windows (proposal, `policyVersion = proposed-v1`): morning prepare 07:30, readyBy 07:59, scheduled 08:00, push expires 08:30;
  close: scheduled = official close + 15 min, prepare from close, readyBy scheduled − 1 min, expires scheduled + 30 min,
  session days only; weekly: scheduled Sunday 18:00, prepare 17:30, readyBy 17:59, expires 18:30, interval
  `[previous Sunday 18:00, this Sunday 18:00)` NY → UTC (DST can change elapsed hours).

## 3. Database — migration `supabase/bobby-protocol/supabase/migrations/20261002180000_pro_briefings.sql`

Conventions: idempotent (`if not exists`, `create or replace`), applied twice in tests; every table RLS on, revoked
from `public, anon, authenticated` **by name**, granted to `service_role`; functions `security invoker set search_path =
public, pg_temp`, revoked/granted the same way; every per-account table `identity_id uuid not null references
public.bobby_identities(id) on delete cascade` (account deletion needs no code change); index identity FKs and due work.

Tables: `bobby_brief_settings`, `bobby_brief_shared`, `bobby_briefs`, `bobby_push_devices`, `bobby_brief_outbox`,
`bobby_brief_provider_attempts`, `bobby_brief_audio`, `bobby_brief_audio_links`, `bobby_brief_idempotency`.
Key constraints: `bobby_briefs unique (identity_id, cadence, period_key)`; `bobby_brief_shared unique (cadence,
period_key, language)`; `bobby_brief_outbox unique (brief_id, installation_id)`; `bobby_push_devices` partial uniques
`(token_fingerprint, topic, environment) where status='active'` and `(installation_id) where status='active'`;
`bobby_brief_audio unique (cache_key)`; `bobby_brief_idempotency unique (identity_id, scope, idem_key)`.
Leases: `lease_owner text, lease_expires_at timestamptz, fence bigint not null default 0`; every claim increments `fence`;
every commit requires `fence = p_fence and lease_expires_at > now()`.

Storage: create the private bucket only when the `storage` schema exists (local PG has none):
`insert into storage.buckets (id, name, public) values ('briefing-audio','briefing-audio', false) on conflict do nothing`.
No storage policies (service role only).

Memory hooks (triggers, security invoker): `bobby_user_prefs` AFTER UPDATE when `memory_enabled` true→false ⇒
`bobby_brief_privacy_bump(identity,'memory_paused',false)`; `bobby_user_prefs` AFTER UPDATE that clears all three prefs or
AFTER DELETE ⇒ `('memory_deleted', true)`; `bobby_user_assets` AFTER DELETE FOR EACH ROW when
`old.last_asked_at >= now() - interval '90 days'` (explicit forget, not retention) ⇒ `bobby_brief_memory_forgotten(identity,
symbol)`. Bumps only touch identities that have a settings row.

### RPCs (all return `jsonb` unless noted; `p_*` params; service_role only)

| RPC | Semantics |
|---|---|
| `bobby_brief_settings_get(p_identity uuid)` | Row as `BriefSettings` JSON (camelCase), or defaults with `revision 0` when absent. |
| `bobby_brief_settings_patch(p_identity uuid, p_expected_revision int, p_patch jsonb)` | CAS under `for update`. Applies only known keys (`openingEnabled, closeEnabled, weeklyEnabled, language, companionId, assets, analysisConsentEnabled, analysisConsentVersion, audioConsentEnabled, audioConsentVersion`); records `*_consent_at = now()` when a consent is enabled. Revision mismatch ⇒ `{ok:false, code:'revision_conflict', revision}`. Disabling a cadence ⇒ cancels that cadence's `pending/preparing` briefs and unsent outbox rows. Disabling analysis consent ⇒ `privacy_bump(...,'analysis_consent_withdrawn', false)`. Returns `{ok:true, settings}`. |
| `bobby_push_device_register(p_identity, p_installation uuid, p_token_ciphertext text, p_token_fingerprint text, p_environment text, p_topic text, p_permission text, p_app_build int, p_credential_verifier text, p_max_active int)` | First binding. Conflict on active installation or token fingerprint ⇒ `{ok:false, code:'conflict'}` (never reveals the owner). More than `p_max_active` active for the identity (advisory lock per identity) ⇒ `code:'device_limit'`. Else `{ok:true, registrationId, bindingRevision:1}`. |
| `bobby_push_device_rebind(p_identity, p_registration uuid, p_expected_revision bigint, p_proof_verifier text, p_new_verifier text, p_token_ciphertext, p_token_fingerprint, p_environment, p_topic, p_permission, p_app_build int, p_max_active int)` | `for update` on the registration. Proof verifier mismatch / missing / revoked ⇒ `code:'not_found'`. Revision mismatch ⇒ `code:'revision_conflict', bindingRevision`. Same owner ⇒ update token/permission, revision+1, re-fence pending outbox rows (D7). Owner change ⇒ cancel previous owner's unsent outbox rows, bind `p_identity`, revision+1 (device limit applies). Rotates the verifier. Returns `{ok:true, registrationId, bindingRevision}`. |
| `bobby_push_device_revoke(p_identity, p_registration, p_expected_revision bigint, p_proof_verifier text)` | Owner-scoped. Missing / other owner / already revoked / bad proof ⇒ `{ok:true, state:'already'}`; revision mismatch ⇒ `code:'revision_conflict'`; else revoke + cancel unsent rows ⇒ `{ok:true, state:'revoked'}`. |
| `bobby_push_device_invalidate(p_registration, p_binding_revision bigint, p_reason text)` | APNs said the token is dead; only when the revision still matches. |
| `bobby_brief_idem_begin(p_identity, p_scope text, p_key text, p_digest text, p_ttl_seconds int)` / `bobby_brief_idem_finish(p_identity, p_scope, p_key, p_status int, p_response text)` | `{state:'new'}`, `{state:'replay', status, response}` (response is the encrypted receipt text), `{state:'mismatch'}`, `{state:'in_progress'}`. |
| `bobby_brief_seed(p_cadence, p_period_key, p_period_start, p_period_end, p_scheduled_at, p_push_expires_at, p_calendar_version, p_policy_version)` | Inserts `pending` briefs for every identity whose cadence switch is on and `bobby_is_pro` is true (`on conflict do nothing`). Returns `{seeded}`. |
| `bobby_brief_shared_claim(p_cadence, p_period_key, p_language, p_worker, p_lease_seconds int, p_max_attempts int)` | Insert-or-claim. `{state:'ready', id, narrative, evidence}`, `{state:'claimed', id, fence, attempts}`, `{state:'busy'}`, `{state:'failed'}`. |
| `bobby_brief_shared_commit(p_id uuid, p_fence bigint, p_state text, p_evidence jsonb, p_narrative jsonb, p_data_as_of timestamptz, p_error text)` | Fenced; `p_state` `ready` or `retry` (attempts+1, lease cleared) or `failed`. `{ok}` / `{ok:false, code:'stale_fence'}`. |
| `bobby_brief_needed_assets(p_cadence, p_period_key, p_language)` | Union of `assets` (+ memory frequent assets when consent and memory allow) for pending/preparing briefs of that period, intersected with nothing (TS filters the universe). Returns `{symbols:[...]}`. |
| `bobby_brief_claim(p_cadence, p_period_key, p_worker, p_lease_seconds int, p_limit int)` | `for update skip locked` over `pending` (or `preparing` with expired lease). Skips non-Pro (state `skipped`) and opted-out (`cancelled`). Freezes and returns per item `{id, identityId, fence, frozen: FrozenSettings, memory: ComposerMemory|null}` (memory only when analysis consent current + memory enabled; the TS layer also checks `BOBBY_BRIEFINGS_MEMORY`). |
| `bobby_brief_publish(p_id, p_fence, p_shared_id uuid, p_content jsonb, p_quality text, p_data_as_of timestamptz, p_uses_memory bool, p_memory_assets text[], p_settings_revision int, p_privacy_epoch int)` | Fenced. Re-validates owner Pro, cadence on, `privacy_epoch` unchanged ⇒ `ready`, `content_version = 1`. Otherwise `{ok:false, code:'stale_fence'|'not_pro'|'opted_out'|'privacy_changed'}` (privacy_changed puts it back to `pending`). |
| `bobby_brief_fail(p_id, p_fence, p_error text, p_final bool)` | attempts+1; `failed` when final or attempts ≥ 3, else `pending`. |
| `bobby_brief_outbox_fill(p_limit int)` | For `ready` briefs with `scheduled_at <= now() < push_expires_at`, owner Pro, cadence on, `privacy_epoch` unchanged: insert rows for the owner's active devices with permission `authorized|provisional` (stable `apns_id = gen_random_uuid()`, `collapse_id = 'brief-' || brief_id`, `binding_revision` = current). `on conflict do nothing`. Returns `{inserted}`. |
| `bobby_brief_outbox_claim(p_worker, p_lease_seconds int, p_limit int)` | Expires rows past `expires_at`; `for update skip locked` over due `pending` rows (and `claimed` with expired lease); re-validates device active + same owner + same binding revision + owner Pro + cadence on (else `cancelled`). Returns items `{id, fence, briefId, deviceId, bindingRevision, tokenCiphertext, environment, topic, apnsId, collapseId, language, expiresAt, attempts}`. |
| `bobby_brief_outbox_result(p_id, p_fence, p_outcome text, p_apns_status int, p_reason text, p_retry_after_seconds int)` | `accepted` ⇒ `sent`; `retry` ⇒ `pending` + due later (attempts ≤ 3 else `failed`); `invalid_token` ⇒ `failed` + `bobby_push_device_invalidate`; `ambiguous` ⇒ retry with same `apns_id`/`collapse_id`; `config` ⇒ `pending`, attempts unchanged (APNs auth problem must not burn attempts). Fenced. |
| `bobby_brief_budget_reserve(p_kind text, p_work_ref text, p_provider text, p_model text, p_reserve_usd numeric, p_day_cap numeric, p_month_cap numeric, p_max_slots int, p_max_attempts_per_work int, p_worker text)` | `pg_advisory_xact_lock(hashtext('bobby_brief_budget'))`. Refuses `not_configured` (caps null/≤0), `work_unresolved` (an `unknown` attempt for `p_work_ref`), `attempts_exhausted`, `slots_full` (`reserved|dispatched|unknown` of that kind ≥ slots), `budget_exhausted` (UTC day/month: reserved+dispatched+unknown reservations + settled actual + settled_assumed reservations + new ≥ cap). Else inserts `reserved` ⇒ `{ok:true, attemptId}`. |
| `bobby_brief_budget_dispatch(p_attempt uuid)` | `reserved` → `dispatched` (right before the HTTP call). |
| `bobby_brief_budget_settle(p_attempt uuid, p_outcome text, p_actual_usd numeric, p_tokens_in int, p_tokens_out int, p_chars int, p_latency_ms int, p_estimated bool)` | `settled` / `no_charge` / `unknown`. |
| `bobby_brief_budget_status()` | `{day:{reserved, settled}, month:{…}, slots:{llm, tts}, unknown}` for ops. |
| `bobby_brief_audio_request(p_identity, p_brief uuid, p_content_version int, p_segment int, p_cache_key text, p_voice text, p_language text)` | Owner + `ready` + version + segment checked (`not_found` / `content_version_conflict`). Upsert audio by `cache_key`, link (brief, segment) → audio. `{audioId, state}`. |
| `bobby_brief_audio_claim(p_audio uuid, p_worker, p_lease_seconds int)` / `bobby_brief_audio_commit(p_audio, p_fence, p_state text, p_storage_path text, p_bytes int, p_error text)` | Single synthesis per cache key; duplicates join. |
| `bobby_brief_audio_authorize(p_identity, p_audio uuid)` | Ready link to a `ready` brief owned by `p_identity` ⇒ `{state, storagePath, mime}`; owner not Pro ⇒ `{code:'subscription_required'}`; else `{code:'not_found'}`. |
| `bobby_brief_inbox(p_identity, p_cadence text, p_before_scheduled timestamptz, p_before_id uuid, p_limit int)` | Owner-scoped `ready` items newest first + `latest` (per enabled cadence, newest period state: `ready|preparing|unavailable`). |
| `bobby_brief_get(p_identity, p_id uuid)` | Owner-scoped `ready` report or `{code:'not_found'}`. Pro is checked in the same call: `{code:'subscription_required'}` only for the owner. |
| `bobby_brief_privacy_bump(p_identity, p_reason text, p_purge_memory_content bool)` | `privacy_epoch+1`; personal (uses_memory) briefs not yet delivered ⇒ back to `pending` (content cleared) or `withdrawn` when already `ready`, their unsent outbox `cancelled`; with purge ⇒ delivered memory-based reports `withdrawn` + content nulled. |
| `bobby_brief_memory_forgotten(p_identity, p_symbol text)` | Bump + purge content of briefs whose `memory_assets` contains the symbol. |
| `bobby_brief_reconcile(p_settle_seconds int)` | Expired brief leases ⇒ `pending`; expired audio/shared leases ⇒ claimable; `unknown` attempts older than settle ⇒ `settled_assumed`; outbox past expiry ⇒ `expired`; past-deadline pending briefs (`push_expires_at` passed) ⇒ `failed('deadline')`. |
| `bobby_brief_purge(p_report_days, p_audio_days, p_outbox_days, p_attempt_days, p_device_days, p_idem_hours, p_shared_days, p_limit int)` | Bounded deletes (`limit … for update skip locked`); returns `{storagePaths:[…]}` of expired audio for the worker to delete from Storage first. |

## 4. HTTP API — `api/briefings.ts` (router), contract paths via rewrites

Common: `Cache-Control: private, no-store`; pre-auth `enforcePublicRateLimit(req,res,'briefings',600,60)`; account auth
= `carriesAccountToken` + `resolveIdentity` + `via==='supabase' && authUserId` (401 `signin_required`, 503
`auth_unavailable`); account-keyed persistent limits (`checkPersistentLimit('brief-<op>', identityId, …)`; voice
`failClosed`); raw body read with byte cap and strict zod (`.strict()`); query keys allowlisted per op (duplicate/array
values ⇒ 400); errors `{error, code}` with codes from `BriefErrorCode`; logs `[briefings]` + op + code only.
Non-GET requires `requestOriginHost` (the iOS client sends `Origin: https://bobbyprotocol.xyz`).

| op / path | Method | Auth | Body / query | Success |
|---|---|---|---|---|
| inbox `/api/briefings` | GET | account + Pro | `limit` 1–20, `cursor` (HMAC-signed, bound to identity+cadence), `cadence` | `200 {items, nextCursor, latest}` |
| report `/api/briefing` | GET | account + Pro | `id` uuid | `200 {id, cadence, contentVersion, periodStart, periodEnd, scheduledAt, dataAsOf, calendarVersion, quality, title, opening, sections, narrationSegments, sources, equitySession, voice, language}`; foreign/missing ⇒ 404 |
| settings `/api/briefing-settings` | GET | account | — | `200` settings + `eligiblePro` + `schedules` + `options{assets, companions, consentVersions}`; `ETag: "<rev>"` |
| | PATCH | account | `If-Match` required (428), body ≤ 2 KiB | `200` + new `ETag`; 409 `revision_conflict` with `revision`; enabling a cadence/consent while not Pro is allowed to persist but `eligiblePro:false` is returned (no spend); enabling consent requires the current version |
| device `/api/briefing-device` | POST | account | `Idempotency-Key`; `{installationId, apnsToken, permissionState, appBuild, apnsEnvironment, registrationId?, expectedBindingRevision?}` + `X-Bobby-Installation-Proof` for rebind | `201 {registrationId, bindingRevision, installationCredential}` / `200` rebind |
| | DELETE | account | `{registrationId, expectedBindingRevision}` + proof | `204` |
| voice `/api/briefing-voice` | POST | account + Pro + audio consent | `Idempotency-Key`; `{briefId, contentVersion, segmentIndex, voice, language}` | `200 {state:'ready', audioId, mediaType}` / `202 {state, audioId, retryAfterSeconds}` |
| audio `/api/briefing-audio` | GET | account + Pro + audio consent | `id` uuid | `200 audio/mpeg` / `202` + `Retry-After` / 404 / 503 |

## 5. Worker — `api/briefing-worker.ts` + `api/_lib/briefings/worker.ts`

Cron `*/5 * * * *` (all scheduled instants fall on 5-minute boundaries). `GET` with `Authorization: Bearer
<CRON_SECRET>` (constant time, only that secret); disabled flag ⇒ `200 {enabled:false, claimed:0}` before any DB call.
45 s work budget, `maxDuration 60`. A tick, each stage bounded and deadline-aware, every dependency injected for tests:

1. `reconcile` → 2. for each adopted cadence with an open preparation window: `seed`, then shared stage per needed
language (`shared_claim` → evidence → LLM narrative with reservation per HTTP attempt, falling back to facts-only when
budget/providers fail or the readyBy deadline is near → `shared_commit`) → 3. personal stage: `claim` ≤ 10 →
compose (deterministic) → validate → `publish` (never before the shared row is ready) → 4. audio pre-synthesis for
morning periods (shared segments of ready reports whose owners have audio consent, TTS slots permitting) → 5. dispatch:
`outbox_fill` → `outbox_claim` ≤ 50 → APNs → `outbox_result` → 6. `purge` (bounded). The tick returns counts only.

## 6. iOS (build 53)

New folder `ios/Bobby/Sources/Briefings/`: `BriefingsModels.swift`, `BriefingsAPI.swift`, `BriefingsCenter.swift`,
`PushRegistrar.swift` (+ `BobbyAppDelegate`), `BriefingIntent.swift`, `BriefingsSettingsView.swift`,
`BriefingInboxView.swift`, `BriefingReportView.swift`, `BriefingNarrator.swift`, `MemoryView.swift`. Shared edits:
`AccountSheet.swift` (rows "Market briefings"/"Resúmenes de mercado" before Voice, and "Memory"/"Memoria"; routes),
`BobbyApp.swift` (`@UIApplicationDelegateAdaptor`), `NucleoSession.swift`/`NucleoRootView.swift` (`NucleoRoute.briefing`,
pending intent drained from `pageStarted`/active), `NeuralVoice.swift` (`playPrepared(_:onFinish:)`, `pause()`, `resume()`),
`AccountSession.swift` (forget briefing state on deletion), `project.yml` (build 53, `aps-environment`).
Rules: settings saved only after the server answers; account switch clears all briefing state and rejects late
answers (generation guard); OS permission is separate from account selection ("Notifications blocked in iOS" + Settings
link); taps are stored and drained once; report fetch re-authorizes; narration queue advances only on the matching
segment's `finished`; pause/resume; stop on background, mute, consent withdrawal, mic start, account change, sheet close;
no name is sent anywhere (the visual greeting may use the local Apple given name).

## 7. Tests and evidence

TS: `scripts/test-briefings-calendar.mts`, `test-briefings-core.mts` (compose/validate/crypto/apns/budget adapters),
`test-briefings-api.mts` (router with mocked PostgREST/auth), `test-briefings-worker.mts`, `test-briefings-pg.mts`
(local PG17: RLS/grants, uniqueness, fencing, SKIP LOCKED concurrency, budget atomicity, device CAS, A→B, privacy triggers,
purge), `test-briefings-load-pg.mts` (100 queued deliveries, 20 concurrent distinct-account opens). iOS:
`BriefingsTests.swift`, `BriefingNarratorTests.swift`, `PushRegistrarTests.swift`. Physical-device APNs receipt, staging
load with real providers and measured cost remain pending (need deploy/migration authorization).

## 8. Module interfaces (the parallel implementers code against these exact exports)

All under `api/_lib/briefings/` unless noted. Every network/DB dependency is injectable for tests. Foundation already
written: `types.ts`, `config.ts`, `db.ts` (typed RPC client, `setBriefingRpc()` for tests).

```ts
// calendar.ts — pure, `now` injected
export const NYSE_CALENDAR_VERSION = 'nyse-2026-2027-v1';
export const POLICY_VERSION = 'proposed-v1';
export interface SchedulePolicy { adopted: Set<Cadence>; morningDays: 'all' | 'sessions' }
export function schedulePolicy(env?: NodeJS.ProcessEnv): SchedulePolicy;
export function nyParts(instant: Date): { date: string; time: string; weekday: number; hour: number; minute: number };
export function nyLocalToUtc(date: string, time: string): Date;
export function addDays(date: string, days: number): string;
export function equitySession(date: string, now?: Date): EquitySessionState;   // label for a NY date
export function periodForDate(cadence: Cadence, date: string, policy: SchedulePolicy): Period | null; // date = NY scheduled date
export function duePeriods(now: Date, policy: SchedulePolicy): Array<{ period: Period; phase: 'prepare' | 'dispatch' }>;
export function nextScheduled(cadence: Cadence, now: Date, policy: SchedulePolicy): Period | null;
export function scheduleSummary(now: Date, policy: SchedulePolicy): {
  timezone: 'America/New_York'; policyVersion: string;
  opening: { configured: boolean; localTime: '08:00'; nextAt: string | null };
  close: { configured: boolean; delayMinutes: 15; nextAt: string | null };
  weekly: { configured: boolean; weekday: 'Sunday'; localTime: '18:00'; nextAt: string | null };
};

// market-snapshot.ts (api/_lib/) — extracted verbatim from bobby-intel.ts; bobby-intel imports it (behavior identical)
export async function fetchLivePrices(): Promise<PriceQuote[]>; // … + fetchFundingRates, fetchFearGreed, fetchDXY, fetchTopStocks, detectRegime
export async function loadGlobalMarketSnapshot(): Promise<GlobalMarketSnapshot>; // read-only, no LLM, no trading

// evidence.ts
export interface EvidenceDeps { snapshot(): Promise<GlobalMarketSnapshot>; dailyCloses(symbols: string[], fromIso: string, toIso: string): Promise<BriefEvidence['history']>; agenda(fromIso: string, toIso: string): Promise<BriefEvidence['agenda']>; now(): Date }
export async function buildEvidence(period: Period, symbols: string[], deps?: Partial<EvidenceDeps>): Promise<BriefEvidence>;

// narrative.ts
export function narrativeRequest(evidence: BriefEvidence, language: BriefLanguage, symbols: string[]): { system: string; user: string; schema: { name: string; schema: Record<string, unknown> } };
export function validateNarrative(raw: unknown, evidence: BriefEvidence, language: BriefLanguage, symbols: string[], model: string): SharedNarrative | null;
export function factsOnlyNarrative(evidence: BriefEvidence, language: BriefLanguage, symbols: string[]): SharedNarrative;

// compose.ts — deterministic, no I/O
export function composeReport(input: { period: Period; frozen: FrozenSettings; memory: ComposerMemory | null; memoryAllowed: boolean; narrative: SharedNarrative; evidence: BriefEvidence }): { content: BriefContent; quality: BriefQuality; usesMemory: boolean; memoryAssets: string[] };
export function validateContent(content: BriefContent): string | null;   // null = valid, else a short error code
export function audioCacheKey(text: string, voice: string, language: BriefLanguage, vibe: string, model: string): string; // sha256 hex

// push-crypto.ts — HKDF(BOBBY_PUSH_TOKEN_KEY) → separate keys per purpose
export function encryptToken(hexToken: string, master: Buffer): string;  // 'v1:' + base64(iv|tag|ct), AES-256-GCM
export function decryptToken(sealed: string, master: Buffer): string;
export function tokenFingerprint(hexToken: string, topic: string, environment: DeviceEnvironment, master: Buffer): string; // HMAC-SHA256 hex
export function newInstallationCredential(): string;          // 32 random bytes base64url
export function credentialVerifier(credential: string): string; // sha256 hex
export function sealReceipt(json: string, master: Buffer): string; export function openReceipt(sealed: string, master: Buffer): string;
export function signCursor(payload: Record<string, unknown>, key: Buffer): string; export function verifyCursor(cursor: string, key: Buffer): Record<string, unknown> | null;
export function cursorKey(): Buffer; // from BOBBY_PUSH_TOKEN_KEY, else derived from the service key

// providers.ts — exactly ONE HTTP attempt per call, outcome classified for accounting
export type AttemptResult<T> =
  | { ok: true; value: T; usd: number; estimated: boolean; usage: { tokensIn?: number; tokensOut?: number; chars?: number; latencyMs: number } }
  | { ok: false; outcome: 'no_charge' | 'unknown'; code: string; status: number | null; latencyMs: number };
export async function llmJsonOnce(choice: LlmChoice, req: { system: string; user: string; schema: { name: string; schema: Record<string, unknown> } }, opts: { maxTokens: number; timeoutMs: number; fetchImpl?: typeof fetch }): Promise<AttemptResult<unknown>>;
export async function ttsOnce(text: string, voice: string, language: BriefLanguage, opts: { timeoutMs: number; fetchImpl?: typeof fetch }): Promise<AttemptResult<Buffer>>;
export function llmReserveUsd(choice: LlmChoice, promptChars: number, maxTokens: number): number;
export function ttsReserveUsd(chars: number): number;

// budget.ts — reservation per attempt around a providers.ts call; writes bobby_llm_usage (surface 'briefing' / 'briefing-voice')
export type ReservationFailure = 'budget_unavailable' | 'slots_full' | 'budget_exhausted' | 'work_unresolved' | 'attempts_exhausted' | 'provider_failed' | 'provider_unknown' | 'storage_unavailable';
export async function withReservation<T>(p: { kind: AttemptKind; workRef: string; provider: string; model: string; reserveUsd: number; worker: string }, call: () => Promise<AttemptResult<T>>, deps?: Partial<{ db: typeof import('./db.js'); logUsage: typeof import('../llm-usage.js').logLlmUsage }>): Promise<{ ok: true; value: T } | { ok: false; code: ReservationFailure }>;

// apns.ts — HTTP/2, ES256 provider token cached ≤ 50 min
export interface ApnsNotification { token: string; environment: DeviceEnvironment; topic: string; apnsId: string; collapseId: string; expiresAt: Date; language: BriefLanguage; briefId: string }
export interface ApnsOutcome { outcome: 'accepted' | 'retry' | 'invalid_token' | 'ambiguous' | 'config'; status: number | null; reason: string | null; retryAfterSeconds?: number }
export interface ApnsTransport { request(origin: string, headers: Record<string, string>, body: string, timeoutMs: number): Promise<{ status: number; headers: Record<string, string>; body: string }> }
export function apnsPayload(n: ApnsNotification): Record<string, unknown>; // generic copy + {briefId} only
export async function sendApns(cfg: ApnsConfig, n: ApnsNotification, transport?: ApnsTransport, now?: Date): Promise<ApnsOutcome>;
export function closeApns(): void;

// audio-store.ts — private Supabase Storage bucket, service role
export interface AudioStore { put(path: string, bytes: Buffer, mime: string): Promise<void>; get(path: string): Promise<Buffer | null>; remove(paths: string[]): Promise<void> }
export function supabaseAudioStore(fetchImpl?: typeof fetch): AudioStore;
export function audioPath(cacheKey: string): string;  // 'v1/<aa>/<cacheKey>.mp3'

// voice.ts — one synthesis per cache key; duplicates join
export async function ensureAudio(p: { audioId: string; cacheKey: string; text: string; voice: string; language: BriefLanguage; worker: string }, deps?: Partial<{ db: typeof import('./db.js'); store: AudioStore; tts: typeof ttsOnce; withReservation: typeof withReservation }>): Promise<{ state: 'ready' | 'queued' | 'processing' | 'failed'; retryAfterSeconds?: number }>;

// worker.ts
export interface TickReport { enabled: boolean; claimed: number; seeded: number; published: number; failed: number; sharedReady: number; audioReady: number; dispatched: number; accepted: number; expired: number; purged: number; budget: string | null; stoppedEarly: boolean }
export async function runTick(opts: { now: Date; worker: string; deadlineAt: number }, deps?: Partial<WorkerDeps>): Promise<TickReport>;
```
