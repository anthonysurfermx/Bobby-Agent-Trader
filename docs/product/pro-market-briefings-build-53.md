# Bobby Pro market briefings — build 53 design

> **Product update — October 2, 2026:** Anthony replaced the daily/opening, close and Sunday-evening proposal with a lightweight weekly briefing on **Monday at 08:00 America/New_York**, plus exceptional confirmed macroeconomic events (first example: a Fed rate change). Weekly is the only periodic generation. Earlier schedules and three-switch requirements below are historical design context. See the current implementation/runbook and `pro-market-macro-events.md` in `.claude/worktrees/pro-briefings-b53/docs/product`. Macro detection is local/dry-run only; live collection, persistence and delivery are not implemented or authorized. No deployment or Apple changes have occurred.

Status: design only. Source inspection, no implementation, production calls, database changes, push sends or deployment.

## Confirmed product decisions

- Target the next iOS build, 53. The inspected native source still declares version 1.5, build 52; the candidate has not been built or distributed.
- Include market briefings in Bobby Pro, the existing paid subscription.
- Prepare a morning briefing for **08:00 New York time**, using `America/New_York` rather than a fixed UTC offset.
- Profile offers independent choices for **market opening**, **market close**, and **weekly briefing**.
- Push copy for a ready morning briefing: “Bobby tiene tu resumen de mercado listo”.
- Tapping the notification opens the prepared briefing and starts Bobby's greeting and narration, subject to the person's audio and AI consent settings.
- Reuse Bobby's market engine and consented learning/preferences instead of building a separate analysis product.

## Profile and briefing experience

Add one “Market briefings” entry in the existing account/profile sheet. Its detail screen contains the three independent switches and explains their schedules in New York time. Show the device's equivalent local time as a convenience.

| Choice | Content | Schedule |
| --- | --- | --- |
| Market opening / morning | Overnight market context, followed assets, risks and the day's agenda | 08:00 New York, confirmed; this is a pre-market report, not the opening bell |
| Market close | What changed during the session, relevant asset moves and unresolved risks | After the official session close; the preparation delay remains a proposal |
| Weekly | Changes over the completed week and events to watch next week | Day and time remain to be chosen |

Keep notification choices per authenticated account. Keep Apple's notification permission per device. A saved switch with OS permission denied must show “Notifications blocked in iOS” and a route to Settings; it must not claim delivery is enabled. Request permission when the person explicitly enables briefings. Proposed initial switches are off until opt-in.

The briefing screen includes its date, data timestamp, market context, selected asset sections, risks, agenda and playback controls. Play/Pause is new work: the existing renderer currently supports stop, not pause/resume. Text remains available when audio fails. Opening a saved briefing does not start another analysis or spend Desk credits. Keep entry from Profile/inbox available when a push is missed.

## Existing source that can be reused

Inspected in the isolated candidate checkout at source `0cc3a84`:

- `api/bobby-intel.ts`: a global market snapshot cached for 300 seconds, with a preformatted context block. Refactor its read-only snapshot loader for worker reuse; do not call trading/cycle routes to obtain a briefing.
- `api/_lib/user-memory.ts` and `api/memory.ts`: explicit horizon, experience and risk preferences, plus account-owned asset questions with 90-day retention. Desk personalization currently allows **web only**. iOS joins after it can view, correct, pause and erase memory, and its privacy disclosures cover the data.
- `bobby_is_pro`: server-side entitlement rules, including active grants. Reuse this rule without consuming a read. Subscription lookup uncertainty must not authorize a scheduled paid-provider call.
- `NucleoSession`, `NucleoVoice`, `NeuralVoice`: companion voice, AI consent, mute and lifecycle handling.
- `AccountSheet`: current account/Profile routing and subscription controls.

The selected companion currently lives in native state. Mirror an allowlisted companion/persona in account briefing preferences with revision checks, and snapshot it into the report so prepared audio has a defined voice. Changes affect future reports; an additional voice variant requires its own bounded cost/cache policy.

The current global/wallet `bobby-digest` is not an account-private Apple/Google briefing inbox. Agent episodic memory is not a person's preferences or financial history. No APNs registration or notification-tap handler was found in the inspected native source; its entitlements do not currently declare Push Notifications.

## Generation and personalization

1. Load and validate a shared market snapshot shortly before a scheduled period. Persist its timestamp, sources and freshness status with the resulting report.
2. Build a shared market narrative once per cadence/period/language. Select sections from explicitly followed assets and consented account memory; use a generic market summary for a cold start or disabled memory.
3. Personalize explanation depth, horizon and companion presentation. These preferences must not alter factual prices, market events or the underlying risk findings.
4. Generate at most one bounded personal synthesis per account and period when the shared sections are insufficient. Avoid a complete three-agent debate per recipient.
5. Validate the result and persist a ready briefing. Only then make its push eligible for delivery.

Weekly reports need dated historical snapshots for the full period. A five-minute cache is insufficient. Persist the relevant shared evidence, or verify that existing historical data covers it before reusing that data. Never relabel today's snapshot as a weekly comparison or invent portfolio returns.

Do not mark missing/stale data as live. If preparation fails, retain a recoverable failure state and show an honest unavailable message instead of sending a “ready” push.

## Storage and scheduling

Proposed minimal account-owned storage:

| Record | Purpose and key constraints |
| --- | --- |
| `brief_settings` | Identity, three opt-ins, New York schedule, language and consent versions. One row per identity; reuse existing memory preferences instead of copying them. |
| `briefs` | Identity, cadence, canonical period, immutable content, shared evidence, data timestamps and generation lease/state. Unique `(identity_id, cadence, period_key)`. |
| `push_devices` | Account-bound installation, encrypted APNs token, environment, app topic, device permission state and last-seen/revoked timestamps. Never expose tokens in public APIs or logs. |
| `brief_delivery_outbox` | One delivery intent per briefing/installation, due time, attempts, lease and sanitized APNs result. Unique briefing/installation key. |
| `brief_provider_attempts` | Durable provider-attempt identity, globally claimed worker slot, fencing revision, reserved cost and settled/uncertain outcome. Covers actual HTTP attempts, including internal retries. |

Retain shared period snapshots durably for weekly comparisons. Choose the smallest existing history table that satisfies this requirement, otherwise add a shared snapshot record. History/content/audio retention values remain to be specified before migration.

Initially use API-only storage with RLS enabled and direct access revoked from `PUBLIC`, `anon` and `authenticated`; internal RPCs are service-only. The current resolver accepts both wallet and Supabase sessions: briefing handlers must require `via === 'supabase'` and a verified `authUserId`. Never accept an owner identity from a request body. Auth and data projects can differ, so an unverified `auth.uid()` policy is insufficient. Service-role handlers must explicitly enforce owner predicates because service credentials bypass RLS. Direct account policies are a later option only after verifying the issuer and identity mapping. Index identity foreign keys and pending/due work; claim bounded batches atomically with expiring leases and `FOR UPDATE SKIP LOCKED`. Keep transactions short and perform provider calls after committing the claim.

Generate morning content before 08:00 and dispatch ready reports at 08:00. Proposed preparation window starts 07:30, with a 07:59 readiness deadline and bounded shared-content fallback when personal synthesis is late; benchmark this before claiming 100 reports can be ready. Schedule sessions through a versioned market calendar with holidays, early closes and daylight-saving changes. A fixed cron offset is insufficient. The NYSE core session normally runs 09:30–16:00 Eastern; official holiday/early-close dates must override the normal session. [NYSE calendar and trading hours](https://www.nyse.com/trade/hours-calendars).

Use internal cadence `morning`, `close` or `weekly`. Morning uniqueness uses the New York calendar date, close uses the official session date, and weekly uses an explicit start/end interval. Calendar revision is evidence, not part of the unique key; correcting a calendar must not generate a second report. A proposed weekly cutoff is Sunday 18:00 New York, covering the preceding seven local days up to that instant and the latest completed equity trading week. It must not claim a full calendar week has ended before midnight.

A minute-resolution scheduler must be verified against the hosting plan. Current Vercel docs give Hobby daily invocation with hour-level precision and Pro/Enterprise minute-level invocation. Cron delivery is best effort and can miss or duplicate runs; application leases, reconciliation and expiration remain required. Staging needs an explicit controlled trigger because ordinary Vercel cron targets production. [Vercel pricing/precision](https://vercel.com/docs/cron-jobs/usage-and-pricing), [delivery and idempotency](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

Changing a notification preference affects future work; it must not regenerate an already completed period. Check current Pro and the relevant opt-in before generation and delivery. Retrieval checks current account ownership and Pro; disabling notifications alone does not remove previously saved reports. Stopping a cadence cancels unsent delivery intents. Revoking AI/name/memory consent has a separate invalidation path for affected pending content and audio. Proposed morning push expiration is 08:30 New York; do not send obsolete catch-up notifications after that window.

APNs acceptance does not establish device receipt. Handle invalid tokens, retryable provider failures and ambiguous timeout outcomes separately. Use a stable notification identity, collapse policy and client deduplication; do not claim exactly-once delivery across APNs failures.

## Notification tap and voice

The lock-screen payload contains generic copy and an opaque briefing reference. It contains no name, followed symbols, financial summary or authentication token.

Native handling stores an intent until the app is active, the current account is authenticated, onboarding/consent has completed and the report's owner/Pro checks pass. When using the existing event bridge, drain from a `NucleoSession.pageStarted` readiness hook: `emit` silently drops before page readiness, so foreground alone is insufficient. Use a native briefing sheet over the existing glass for the first integration; the Desk renderer expects a single-asset, three-agent result and must not be filled with fake agents. A notification for another account must not reveal its report. Clear stale report/audio state on account change. Do not replay the notification on every foreground transition or interrupt an active microphone/analysis/narration session.

The existing narration endpoint accepts at most 800 characters per request and a new native `speak` stops the previous one. Queue bounded segments and advance only for the matching finished completion; failure/stopped events must not advance the queue. Add Play/Pause support while preserving cancellation, mute and background behavior. Reuse the renderer, but protect briefing audio with account/Pro authorization and deduplicate synthesis across retries. Cache shared audio by content version, voice and language; personal audio remains private.

`NeuralVoice.speak` currently calls the public narration endpoint directly. Extend its playback path to consume authenticated briefing audio; reusing that public request unchanged would omit the new owner/Pro authorization and synthesis deduplication.

Registration, reassignment and removal require server binding revisions and compare-and-swap in addition to local account generation guards. A delayed account-A request must not overwrite account B's binding or detach B's device. Token rotation cancels the old binding's unsent outbox work. Derive APNs environment from signed provisioning, not `DEBUG`; validate the topic/environment against server configuration.

Apple's given name is currently stored only on the phone and source promises it is never sent to the server. A named greeting rendered by remote TTS needs a clear opt-in for that use, with a generic greeting otherwise. Do not upload that name automatically. A missing name does not block a briefing.

## Cost and recovery

- Reuse factual snapshots, narrative sections and audio rather than repeating provider work for every recipient.
- Start with a proposed maximum of two LLM jobs and two TTS jobs globally, enforced across worker invocations, and finite batches/retries.
- Reserve a bounded provider cost atomically before each actual HTTP attempt, then settle from measured tokens/audio usage. `completeJson` currently performs internal retries; wrapping only the high-level call would miss attempts. Instrument those attempts or use a single-attempt adapter. Retain reservations for timeouts/crashes with uncertain charges until reconciliation; do not automatically repeat an uncertain paid attempt without provider idempotency/status evidence. Fence lease recovery, provider slots and final commits.
- The existing Desk cost ledger excludes voice/cycle and uses cached, best-effort checks. It does not establish a concurrent monetary ceiling for this feature. Integrate every new provider call into accounting and define its reserved budget before activation; an overall ceiling also needs coordinated reservations with other spenders.
- Existing voice limits are 800 characters/request, 60 requests/IP/10 minutes and 3,000 global requests/day. These count calls, not dollars. Briefing playback needs authenticated cached synthesis so a simultaneous launch does not blindly multiply these requests.
- A budget, subscription, source or audio failure must preserve the saved text and offer a controlled retry; it must not consume an unrelated Desk or premium-level allowance.

Do not announce a cost estimate until a bounded staging sample has measured generation and TTS, including retries and cache reuse.

## Implementation order and acceptance

1. Finalize the weekly schedule, market calendar scope and morning non-session-day behavior. Specify close preparation delay and retention as product defaults.
2. Add Profile controls, account-owned preference models and mocked briefing/tap playback in the isolated iOS candidate. Bump native build metadata to 53 and run the appropriate local native checks.
3. Add inactive SQL/API contracts, deterministic schedule tests, entitlement/ownership checks, worker leases/outbox and finite budget handling. Build and verify locally before any deployment proposal.
4. Implement APNs integration and signed native push capability. Remote Apple capability/credential configuration and deployment require their own authorization.
5. Exercise staging preparation, delivery recovery, measured cost and real iPhone tap/voice/account-switch behavior. Production QA remains coordinated with Claude; this design does not authorize duplicate production load.

Required acceptance evidence:

- Each of the three Profile switches persists independently and follows its account across devices; a different account inherits none of its state.
- 08:00 remains New York local time across DST; holidays and early-close sessions follow the configured calendar. Weekly periods do not duplicate daily/close reports.
- No valid report means no “ready” push. Overlapping workers and replayed cron events cannot create a second canonical briefing. Every provider attempt has a durable identity and reservation; an uncertain paid outcome is reconciled instead of blindly retried.
- Expired Pro, opted-out cadence, revoked token and auth/database uncertainty prevent paid generation/delivery.
- Locked-screen push remains generic. Notification taps work with app cold, warm, signed out, muted, busy and after account switch without exposing another account's content.
- Text survives TTS failure; segments play in order and stop cleanly on cancellation/background transitions.
- Native memory can be viewed, corrected, paused and deleted before enabling iOS personalization.
- Staging demonstrates 100 queued deliveries and 20 distinct authenticated simultaneous opens, with measured cost and cache behavior. Report preparation, APNs acceptance and physical receipt as separate evidence.

## Open decisions

- Weekly day/time: proposed Sunday 18:00 New York, not yet confirmed.
- Morning non-session days: proposed every calendar day at 08:00 with closed-equity-session context and current crypto, not yet confirmed.
- Closing report delay: proposed official close +15 minutes, including early closes, not yet confirmed.
- Preparation/expiration window, initial opt-in defaults and report/audio retention: proposed engineering/product defaults, not yet confirmed.

No production migration, deployment, Apple capability change, real purchase, message or notification send is included in the completed design work.
