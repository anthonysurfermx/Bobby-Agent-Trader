# iOS acceptance: weekly briefing and gifted credits

Updated 2 October 2026. Anthony's remaining acceptance criteria are two real
round trips: Monday notification -> tap -> spoken personalized greeting and
weekly report; and dashboard gift -> account balance -> iPhone display/use.

## Baseline and immutable test build

TestFlight artifact is Bobby **1.6 (53)**, implementation checkpoint `d0632c00`,
IPA SHA-256 `e1c87d529ab4948050e5c3cf5808e882b749a1956112a765a308d8c4ea6c7376`.
Post-upload work is on local branch `codex/ios-briefings-acceptance-54` in the
same checkout. Source edits on that branch are not changes to the installed 53.
The post-upload candidate now declares **1.6 (54)**. Its unsigned generic-device
Release compile passed; no 54 signed archive, IPA or TestFlight upload was made.

The weekly cadence is Monday 08:00 `America/New_York`. Next target is
**5 October 2026, 12:00 UTC / 13:00 Europe/Lisbon**, before NYSE's regular 09:30
New York opening. Holidays must be labelled accurately; the Monday briefing
does not silently move to another day. Sources:
[NYSE calendar](https://www.nyse.com/trade/hours-calendars) and
[Vercel Cron Jobs](https://vercel.com/docs/cron-jobs).

## Remote evidence, read only

At approximately 13:24 UTC on 2 October:

- Vercel resolves `bobbyprotocol.xyz` to READY deployment
  `dpl_BEegomxLqEdq6SSZMRqPpotKnMqD`, source `b96e4ee5ee0155e6f15f0c378417ab596e16f5ef`
  on `main`. This is the predecessor of the weekly implementation.
- Supabase project `qbvdqkknnuweatptjohi` was verified as `bobby-protocol`.
  Catalog inspection finds **zero public tables matching `bobby_brief%`**;
  the weekly migration is absent from the applied migration inventory.
- The remote `bobby_admin_grant` still has the five original account/quantity
  arguments, no operation key, and source MD5 `5ba4c1cb36be36c614c2f51e2228c347`.
  Local source characterization already proves repeated identical grants add
  twice. No grant was executed against a live account.
- The Vercel project-detail connector returned a parameter validation error;
  environment/cron activation is not established by that connector. Deployment
  and absent SQL are independently sufficient to reject weekly readiness.

No remote migration, deployment, worker invocation, provider synthesis, push,
email, purchase, account deletion or production credit gift was performed in
this acceptance review.

## Flow W: notification and spoken weekly greeting

Pass evidence must cover a single authorized QA iPhone/account:

1. Record exact installed version/build, served backend revision, paid
   eligibility, audio/privacy consent and iOS notification permission. Real
   paid periods require authoritative billing evidence. Sandbox and gifted
   credits do not create a Production paid period; fixtures belong in staging.
2. Prepare a report owned by that account, with sourced dates and the actual
   prior-week queries first, then common market/agenda context. Missing history
   remains explicit. Align scheduler and PostgreSQL clocks for a staging
   rehearsal; a scheduler-only `at` override does not change SQL `now()`.
3. Send one authorized push only to the QA installation. Record scheduled,
   dispatch and receipt times separately. APNs HTTP success is not phone
   receipt; cron and device delivery are best effort.
4. Tap the notification with the app closed. It opens the correct account's
   report and speaks “Hola, [given name]. Este es tu resumen semanal” before
   the report, honoring narration consent/mute. A push alone does not silently
   launch background narration. Define a generic greeting when no local name
   exists. Choose the greeting voice/privacy contract before implementation.
5. Pause/resume and close/background the report while consent or audio is
   pending. No late voice or cross-account content may start. A separate finite
   warm-app/opt-out check can follow after the first successful stage.

Current blockers: weekly backend/SQL are undeployed; paid-period adapter is
absent; the given-name greeting is **visual only**, including in the local 54
candidate. Pending autoplay cancellation is corrected locally for 54, with
the installed 53 unchanged. Initial permission/registration recovery,
backend registration receipt atomicity, provider timeouts and audio
regeneration still need closure before production activation. See
[independent review](pro-market-briefings-review-2026-10-02.md).

The reported Apple given name is stored locally. The shared TTS contract does
not send names to a voice provider. This review does not introduce such a
transmission or silently select a replacement voice. Voice replacement remains
a separate 54 decision. The request mentioning email is being clarified:
the original push channel remains the working scope; **no weekly email sender
exists in the delivered implementation**.

## Flow G: dashboard gift and native balance

Pass evidence must identify the existing administrator and one explicitly
authorized QA beneficiary, with a fixed small quantity:

1. Record beneficiary identity and baseline balance. Grant one ordinary and/or
   premium credit, as explicitly authorized, through the deployed dashboard.
2. Confirm persistent server balance and the beneficiary's own authenticated
   `bonus` response, without reading another account's private content.
3. Close/reopen Profile to refresh in 53; the build has no realtime gift
   subscription. Compare the gifted balance separately from normal quota.
4. Retry the *same operation* after an ambiguous response. The balance changes
   only once; a changed payload with the same key is rejected. Concurrent
   retries obey the same rule.
5. Exercise one authorized QA use. Ordinary gifts are consumed after base
   exhaustion when the paywall applies; premium gifts follow their level
   allowance. Reconcile successful consumption and refund on a controlled
   staging failure, without exhausting a real person's allowance artificially.
6. Record native display, account isolation and final balance. A credit gift
   never becomes a paid-Pro entitlement for weekly briefings.

The historical 53 baseline had 166 API checks and 151 disposable PostgreSQL
checks, including native-platform consumption and refunds. Build 53 shows
bonuses on free Profile and premium selectors, but its Pro Profile summary
returns before showing its Quick gift balance. The local 54 patch now adds a
separate gifted-credit row while retaining the paid membership status and
refreshes premium gifts when Profile opens. These checks do not prove a
production grant or physical-device display.

## Post-53 local verification

- **185 API checks passed** and **189 PostgreSQL checks passed**. Real isolated
  PostgreSQL 17 verified six concurrent retries produce one balance increment
  and audit, exact receipt replay, changed actor/account/quantities rejection,
  live role removal, service-only access and rollback on audit/benefit failure.
  The local cluster was stopped. Counts overlap and are not unique-case totals.
- **46 native XCTest tests passed**, zero failures: 17 balance/access tests and
  29 narration tests. Late consent responses cannot start voice after closing,
  stopping, backgrounding or switching accounts. A late balance response from
  account A cannot restore A's gifts after switching to B.
- Browser QA at DEV `http://127.0.0.1:5518/admin?mock=grant-lost` used fixture
  data only. Baseline had no gift. The first request committed 1 Quick and 1
  Deep credit but returned an intentional 502. Closing/reopening retained the
  locked quantities; confirming the pending operation showed exactly
  **1 Quick / 1 Deep**, without a second increment. Evidence:
  `/private/tmp/bobby-b54-grant-pending-fixture.png` and
  `/private/tmp/bobby-b54-grant-confirmed-fixture.png`. Tab and server closed.
- `npm run build` passed, including API typecheck and Vite/PWA production build.
  The standalone frontend typecheck still reports unrelated existing errors;
  it is not recorded as passing. CLI database advisors could not connect to
  the isolated cluster; no clean-advisor result is claimed.
- The generic-device unsigned iOS Release build passed and its Info.plist
  reports **1.6 (54)**. The initial sandboxed attempt failed on denied Xcode
  cache writes; the authorized local retry succeeded. No signing or upload.
- `git diff --check` passed.

Logs: `/private/tmp/bobby-grant-retry-54/api-tests.log`,
`/private/tmp/bobby-grant-retry-54/pg-tests.log`,
`/private/tmp/bobby-b54-native-acceptance-tests-final.log`,
`/private/tmp/bobby-b54-native-acceptance-release-retry.log` and
`/private/tmp/bobby-b54-web-acceptance-build.log`.
The grant migration/deployment transition and receipt contract are recorded in
[grant retry correction](admin-grant-idempotency-2026-10-02.md). They have not
been applied remotely. Production must not serve the new API against the old
SQL or restore the additive legacy RPC while operation-key clients are served.

## Closure

Neither real round trip has passed. Keep weekly activation pending the exact
backend/native fixes and authorized QA evidence. Do not grant to an arbitrary
real person or widen TestFlight distribution to obtain a pass. Capture only
sanitized receipt/deployment/balance IDs and physical observations; update this
record with measured results, not anticipated success.
