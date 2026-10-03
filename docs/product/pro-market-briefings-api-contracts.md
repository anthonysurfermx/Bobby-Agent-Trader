# Bobby Pro briefings — API contract draft

> **Product update — October 2, 2026:** Anthony replaced the daily/opening, close and Sunday-evening proposal with a lightweight weekly briefing on **Monday at 08:00 America/New_York**, plus exceptional confirmed macroeconomic events (first example: a Fed rate change). Weekly is the only periodic generation. Earlier schedules and three-switch requirements below are historical design context. See the current implementation/runbook and `pro-market-macro-events.md` in `.claude/worktrees/pro-briefings-b53/docs/product`. Macro detection is local/dry-run only; live collection, persistence and delivery are not implemented or authorized. No deployment or Apple changes have occurred.

Status: specification only. These endpoints, tables, workers and credentials are not implemented or deployed by this document. Read alongside [the product design](pro-market-briefings-build-53.md). Source inspected: build-53 candidate `0cc3a84`.

## Common authorization and storage

- Every account endpoint verifies `Authorization: Bearer <Supabase access token>` through the configured Auth project, then resolves the server identity. Require `via === 'supabase'` and a non-null `authUserId`; wallet sessions, anonymous device IDs and decoded-but-unverified JWTs are insufficient.
- Derive `identity_id` exclusively from that verified session. Reject client identity/wallet/owner fields. Every service-role query/RPC scopes records by the derived identity; an opaque public ID is a locator, never authorization.
- The Auth project may differ from the data project. Initially use API-only storage: RLS enabled, no `anon`/`authenticated` grants, service-role-only access and explicit owner checks. Do not introduce direct client RLS until JWT issuer compatibility and `auth_user_id` → `identity_id` mapping are verified.
- Settings and device cleanup require a verified account, not Pro. Report and audio reads, paid generation and push dispatch require a current server-side `bobby_is_pro` result, including active grants. A failed/malformed entitlement lookup returns `503`, not permission. No Desk read/level credits are consumed.
- All account responses use `Cache-Control: private, no-store`; do not put bearer credentials, APNs tokens, installation proofs, names, reports or asset-account pairs in logs, URLs or analytics. Use request IDs and sanitized codes.
- Strict JSON schemas reject unknown fields, duplicate/array query IDs and unsupported enums. Validate actual payload size, not only `Content-Length`. No client-controlled provider/model/URL/budget/calendar/schedule execution fields.

Common errors: `400 invalid_request`; `401 signin_required` for missing/invalid account credentials; `403 subscription_required` for a verified account lacking Pro where required; `404 not_found` for missing or another account's object; `409 revision_conflict`/`content_version_conflict`; `413 payload_too_large`; `428 revision_required` for a missing settings precondition; `429 rate_limited` with `Retry-After`; `503 auth_unavailable`/`storage_unavailable`/`budget_unavailable`/`feature_disabled`. An unavailable dependency never masquerades as an empty inbox or an authorization failure.

## Server schedule policy

Only **08:00 `America/New_York`** is user-confirmed. The following are proposed defaults for review, not additional confirmed decisions:

| Cadence | Proposed policy |
| --- | --- |
| `morning` | Daily at 08:00 New York, including crypto on weekends/holidays. Profile calls this option “Market opening”, explained as the pre-market briefing. Label equities with their official closed-session/as-of state; never imply a live equity session. |
| `close` | Official configured US equity session close +15 minutes; no close report on a non-session day. Respect early closes. Crypto remains labeled 24/7. |
| `weekly` | Sunday 18:00 New York. Evidence interval is the previous seven New York calendar days, ending at that scheduled cutoff: `[previous Sunday 18:00, current Sunday 18:00)`, converted to UTC. DST can change elapsed hours. |

Policy is versioned on the server, including exchange calendar, holiday/early-close data, freshness rules and delivery validity windows. Clients display effective schedules and local equivalents; they cannot submit a fixed UTC offset or override the calendar. Every briefing exposes `periodStart`, `periodEnd`, `scheduledAt`, `dataAsOf`, `calendarVersion` and source freshness/status. Weekly generation requires historical evidence for the actual interval.

## Settings: `/api/briefing-settings`

**GET** — verified account; no Pro requirement. Return revision in `ETag` and `200`:

```json
{
  "revision": 4,
  "openingEnabled": true,
  "closeEnabled": false,
  "weeklyEnabled": false,
  "language": "es",
  "companionId": "<allowlisted companion ID>",
  "assets": ["BTC", "NVDA"],
  "analysisConsentEnabled": true,
  "analysisConsentVersion": 1,
  "audioConsentEnabled": false,
  "audioConsentVersion": null,
  "eligiblePro": true,
  "schedules": {
    "timezone": "America/New_York",
    "policyVersion": "proposed-v1",
    "opening": {"localTime": "08:00", "nextAt": "<UTC timestamp>"},
    "close": {"nextAt": "<calendar-derived UTC timestamp>"},
    "weekly": {"weekday": "Sunday", "localTime": "18:00", "nextAt": "<UTC timestamp>"}
  }
}
```

Schedules are returned as unconfigured until their policy is adopted; example timestamps are placeholders. No saved opt-in claims iOS permission or device delivery. An expired subscription preserves settings and reports `eligiblePro: false`.

**PATCH** — no Pro requirement; `If-Match: "4"` is required. Body allows only non-empty changes to `openingEnabled`, `closeEnabled`, `weeklyEnabled`, `language` (`en`/`es`), `companionId` (server-published allowlist), `assets` (proposed maximum 6 supported symbols), `analysisConsentEnabled`, `acceptedAnalysisConsentVersion`, `audioConsentEnabled`, and `acceptedAudioConsentVersion`. Enabling either consent requires acceptance of its current server version; record acceptance time on the server. Reuse memory preferences; do not copy inferred risk/horizon into this table. Proposed body limit: 2 KiB.

Atomically compare revision, save changes, increment revision and invalidate affected future jobs. Return `200` with the GET representation and `ETag: "5"`; a stale revision returns `409` with the current revision. Persisting opt-ins does not authorize spending before Pro/consent checks. Disabling a cadence cancels future preparation and unsent intents; **it does not lock or delete older ready reports**. Historical reads still require Pro.

Mirror the native companion choice into these account-bound revisioned settings; the server must not assume it knows a locally selected voice. Freeze the allowlisted companion-to-voice mapping, language and preference revision in the report. Companion/language changes affect future reports.

AI/audio/name-consent changes and memory pause/delete need integration hooks that invalidate affected pending personalized content/audio/outbox and fence in-flight commits. Any future name-consent withdrawal purges named audio/name storage. Account deletion purges private records/audio/tokens. Do not silently send a previously prepared personal report after its personalization permission was withdrawn.

## Devices: `/api/briefing-device`

**POST** — verified account, no Pro requirement; strict body:

```json
{"installationId":"<client UUID>","apnsToken":"<hex token>","permissionState":"authorized","appBuild":53}
```

Permission enum: `notDetermined`, `denied`, `authorized`, `provisional`; this is a client-reported OS state, not proof of permission. Server configuration chooses the allowed app topic and APNs environment for that deployment; do not let a public request choose arbitrary topics/environments. Token length must be bounded without assuming a permanently fixed APNs token size. Proposed body limit: 2 KiB; maximum 5 active installations/account, enforced transactionally.

First registration returns `201 {registrationId, bindingRevision, installationCredential}`. Generate an unpredictable credential server-side, store only its verifier, and keep the credential in native Keychain. Never log it; return it only in the authenticated registration/recovery response. Store APNs tokens encrypted and maintain a keyed token fingerprint for uniqueness. A public `installationId` never proves possession.

Rotation/rebind POST additionally carries `registrationId`, `expectedBindingRevision`, and `X-Bobby-Installation-Proof: <credential>`, together with the current account bearer. Verify installation proof and compare-and-swap the binding revision under lock. Atomically revoke the old binding/intents, bind the current account, increment revision and rotate the credential. Return `200` with the new binding receipt. Initial registration cannot overwrite an active token/installation binding without its proof; return a generic conflict without revealing its owner.

Require `Idempotency-Key` on POST, scoped to authenticated account + request digest. A replay returns the same receipt; the same key with changed payload returns `409`. Protect any short-lived credential replay material at rest. Lost-proof recovery requires a separate verified recovery path; do not recover ownership merely from a public installation UUID or token string.

**DELETE** — body `{registrationId, expectedBindingRevision}` plus current bearer and installation proof. Owner-scoped, idempotent revocation: `204` when already revoked/missing for that caller; stale binding revision returns `409`. A late logout from account A cannot revoke or steal B's rebound registration. Delayed APNs callbacks also update token state only when their claimed binding revision still matches.

Device bindings and outbox rows carry owner + binding revision. Uniqueness permits one active owner per token/topic/environment. Revocation/rebind cancels unsent delivery intents in the same transaction. Notification bodies stay generic; no names, symbols, account IDs, reports or auth credentials.

## Inbox and reports

**GET `/api/briefings?limit=20&cursor=…&cadence=morning`** — verified account + current Pro. `limit` proposed range 1–20; cadence optional `morning`/`close`/`weekly` enum. Opaque signed cursor is bound to the caller and filters. Return `200 {items:[{id,cadence,periodStart,periodEnd,scheduledAt,dataAsOf,calendarVersion,contentVersion,quality,audioState}], nextCursor}`. Return only retained, ready, owner-scoped reports; no arbitrary owner filters or job/lease data.

**GET `/api/briefing?id=<uuid>`** — verified account + current Pro, then ID-and-owner lookup. Missing/other-owner ID returns the same `404`; valid owner with expired Pro returns `403` before disclosing content. `200 {id,cadence,contentVersion,periodStart,periodEnd,scheduledAt,dataAsOf,calendarVersion,quality,sections,narrationSegments}`. Sections/segments are validated server content with explicit as-of/closed/partial labels. Opening a report never regenerates analysis. Neither cadence-off nor a disabled worker flag prevents retrieval of retained ready reports by their Pro owner.

## Voice and audio

Generic greeting/audio is the default. Named remote TTS requires a separate explicit privacy/consent contract; this draft accepts no client name and does not upload Apple's local given name automatically.

**POST `/api/briefing-voice`** — verified owner + Pro + current audio/AI consent. Body `{briefId, contentVersion, segmentIndex, voice, language}`; validate UUID/version, index, `language` (`en`/`es`) and a server-published voice allowlist. Voice/language must match the report's frozen companion mapping/language; mismatch returns `409`. Accept no report text, prompts, names, owner ID or external audio URL. Load the segment from the owned immutable report. An unsupported voice returns `400`; stale report version returns `409`.

Proposed bounds: narration ≤2,400 characters total, ≤4 stored segments, ≤800 characters/segment; one frozen voice variant per report initially. A later companion change applies to future reports. Require `Idempotency-Key`; deduplicate by report version/segment/content hash/voice/language/model version. Shared generic audio may reuse a shared cache; personal audio keys include owner/privacy epoch and remain private. All cache hits still authorize the caller.

Ready: `200 {state:"ready", audioId, mediaType:"audio/mpeg"}`. Pending: `202 {state:"queued"|"processing", audioId, retryAfterSeconds:2}`. Enqueue once; duplicate requests join the same work. No direct public-request provider call and no paid bypass when accounting fails. Failures preserve text and return a sanitized `503 voice_unavailable`; retries remain bounded/accounted.

**GET `/api/briefing-audio?id=<audioId>`** — derive ownership through its associated owned report; current Pro/consent required. Ready returns `200 audio/mpeg`; pending returns `202` JSON + `Retry-After`; absent/foreign returns `404`; dependency failures return `503`. Private authenticated serving, no permanent public blob URL. Account switch cancels playback and clears old manifests/audio; a stale response cannot populate the new account's UI.

Current `NeuralVoice.speak` calls public `bobby-voice-free`. Extend native playback to fetch the authorized audio/proxy and queue its persisted segments; never send briefing text through that public endpoint. Use the existing account transport's token refresh and account-generation checks; preserve mute, foreground/AI consent, cancellation and completion handling. A retry plays cached authorized audio rather than triggering another public synthesis.

## Internal worker: `/api/briefing-worker`

**GET** — authenticate strictly with `Authorization: Bearer <CRON_SECRET>` using constant-time comparison. Missing configuration: `503`; wrong/missing secret: `401`. Do not reuse the permissive helper that accepts other internal/cycle secrets. Reject client job IDs, identities, dates, schedules, batch sizes and provider overrides. Manual runs need a separate ops capability, not a public query flag.

Proposed feature flag: `BOBBY_BRIEFINGS_ENABLED=on`; absent/other value disables new preparation/dispatch/synthesis. After cron authentication, disabled worker returns `200 {enabled:false, claimed:0}`. This flag is new, not an existing source capability.

Proposed finite limits: `maxDuration:60`, 45-second work budget, preparation claim batch ≤10, delivery batch ≤50, 2 globally dispatched unresolved LLM attempts and 2 TTS attempts. Start no provider attempt without enough remaining deadline. Shared snapshots/narratives are claimed once per canonical period/language/policy version; personal synthesis ≤1/account/period. Do not call trading/cycle routes.

Claims use short DB transactions, `FOR UPDATE SKIP LOCKED`, expiring leases and monotonic fencing tokens. Freeze preference/consent/privacy/evidence/calendar versions in the job; revalidate owner, current Pro and permission versions before publishing and again before dispatch. Unique report `(identity_id,cadence,period_key)` and delivery `(brief_id,installation_id)` keys prevent known replay duplication. Binding revision is a fenced delivery precondition, not a new delivery identity: rebind must not replay an already accepted briefing on the same installation. A stale worker cannot commit/report-ready/send intent using an obsolete fence.

Reserve maximum monetary exposure atomically **before every HTTP provider attempt** against configured finite daily/monthly caps. Record `reserved → dispatched → settled`, or `unknown` after an ambiguous crash/timeout. Include model/token/character ceilings and measured usage; reserve fallback/retry attempts independently. Budget-store uncertainty pauses paid work. Existing `completeJson` retries internally: instrument each attempt or use a single-attempt adapter; a reservation around the outer call is insufficient.

Keep unknown-charge reservations and unresolved attempt slots until reconciliation or proof of non-execution. Lease expiry alone does not authorize replaying a possibly dispatched call. Use provider idempotency only after verifying support; do not promise exactly-once provider spend. No raw prompt/report/account data in the cost ledger. The existing best-effort Desk ledger is not this feature's monetary guard; a whole-app cap also requires other spenders to reserve through it.

Push outbox retries are finite, use stable notification/collapse identity and an expiry window, and skip obsolete catch-up reports. Timeout/invalid-token callbacks are distinguished and revision-fenced. APNs acceptance is not device receipt; revocation cannot retract an already accepted generic notification. Tapping always repeats account/Pro/owner authorization.

## Proposed rate and payload bounds

All numeric bounds below are initial proposals, not measured production capacity or confirmed product decisions. Use persistent account-keyed limits after authentication plus a broad pre-auth IP abuse limit; DB uncertainty fails closed for paid queue creation. Do not subject cached authenticated audio to the existing public voice endpoint's 60/IP/10-minute quota.

| Surface | Proposed account limit |
| --- | --- |
| Settings/inbox/report GET | 120/minute |
| Settings PATCH | 20/minute |
| Device POST/DELETE | 10/minute |
| Voice POST | 12/minute, plus unique work/variant limits |
| Audio GET | 240/minute |

Proposed shared pre-auth IP cap: 600 requests/minute, reviewed against a 20-device shared-network staging run. Bound report JSON to 24 KiB, server-selected asset sections to 6, and retry attempts to 2 per provider work item; no unlimited client poll/retry loops. Retention, push expiry, provider currency caps and supported calendar scope must be set explicitly before activation. Every ID-bearing request needs two-account isolation, stale-binding, stale-fence and duplicate-idempotency acceptance coverage.
