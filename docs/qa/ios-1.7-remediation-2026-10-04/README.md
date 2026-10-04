# Bobby iOS 1.7 (63): independent remediation and acceptance evidence

Status: remediation is committed; complete release acceptance is still pending. Candidate: `/Users/mrrobot/.codex/worktrees/bobby-android-parity-ios17/Bobby-Agent-Trader`, code HEAD `ecc4ff49baf48634374750d8e4bdbdd34d9d8329`. Product and original test fixes are in `507616c99eb143e466084c85bbb177d11315bf68`; the request-spy assertion repair is in `ecc4ff49`. No push or web deployment has been performed.

## Corrected behavior

Hourly chart candles now declare their own `candlesTimeframe` in native and web transport. The chart uses the last plotted candle timestamp and excludes support, resistance and trade overlays from mismatched 4H/1D/1W analysis. The analysis itself remains intact. The actual native interval and provider URLs share a constant.

The support subtitle measures its actual SVG width and wraps into two lines at x=296 when necessary. Native and web renderer changes preserve the composition and full translated text. The measured system-font German and French overflow is resolved. Geist and installed WebKit still need physical evidence.

UI tests now seed the current owner-scoped companion preference. The bundled-voice test explicitly chooses companion voice. An isolated DEBUG profile no longer sends fake account credentials or loses its session to a real backend rejection. Live RevenueCat Test Store offering reads remain independent. The classic desk validates required agent strings individually, accepting the server's additive nested synthesis/scenarios without accepting malformed text or verdicts.

## Verified evidence

| Check | Result | Boundary |
| --- | --- | --- |
| iOS/shared JavaScript | 165/165 Node cases | Includes 42 new candle/schema cases; offline fixtures. |
| Web desk transport | 280/280 assertions | Real transport functions, synthetic HTTP responses. |
| Web Speech | 339/339 assertions | Complete tracked tree; mocked recognition/mic/permissions, no real microphone, OS prompts or network. Prior ENOENT came from sparse checkout. |
| Support layout source and delivered HTML | 126/126 logical checks each, 30 scenarios | Six languages, 390px, above/below support and transition cleanup; Chrome/system font; no network. These overlapping runs are not additive coverage. |
| Generated resources | 42 files identical to private rebuild | Release excludes fixtures, mock and contract page. Build timestamps seeded for deterministic metadata comparison. |
| Coupon handler | 41 assertions / 15 scenarios | Offline handler and owner/rate/outage cases; no real coupon redeemed. |
| PostgreSQL | 14/14 suites, no failures or skips | Separate local PG17 cluster. 2,443 Node checks include repeated unit portions; SQL growth count is not invented. Cluster stopped and synthetic data removed. |
| Earlier native run | 529 unit + 2 contract UI passed | Historical candidate with four then-uncommitted test corrections. Those corrections are now committed, but this result does not validate the new Swift fixes. |
| Current native attempt | 534 unit methods executed: 533 passed; one failed method reported eight assertions. Both contract UI methods passed in the text log. | The failed method compared a full URL to a logger that omits query parameters. Repair committed in ecc4ff49, runtime pending. xcresult finalization failed with ENOSPC; official result is incomplete. |
| Production schema prerequisites | 14 feature histories, 18 RLS/service-only tables, 232 columns, 59 RPC contracts, 61 valid indexes | Read-only catalog checks in the actual Bobby project qbvdqkknnuweatptjohi. Definitions match; this is not live feature acceptance or deployment of this candidate. |
| Source integrity | Product commit 507616c9 plus DEBUG/test-only repair ecc4ff49; clean code tree at commit check | Strict assertions retained; generated native/web pages included. |

## Required acceptance work still in progress

| Gate | Current status | Concrete next check |
| --- | --- | --- |
| New native unit/contract run | Full successful receipt pending | The first attempt ran zero methods after testmanagerd lost its connection. The booted retry ran 534 unit methods and two contract UI methods, but one new unit assertion method failed and xcresult was incomplete. Rebuild and rerun ecc4ff49 with sufficient disk; all five added unit methods remain required. |
| Remaining UI target | Pending | Fresh simulator, 14 classes / 57 methods, complete xcresult; no success inferred from runner or disk errors. |
| ProReviewShots | Root cause fixed; runtime pending | Signed-in DEBUG fixture survives; Test Store price, enabled Subscribe and renewal/legal/Restore controls render. No transaction is performed by this test. |
| Store35Shots | Strict parser repaired; live rerun pending | Both language runs must receive actual live verdicts; fixture success cannot replace these tests. |
| Exact-lock web build | Pending adequate disk | Separate workspace, npm ci, exact lock, API/admin checks and Vite 6.4.3 production artifact. Shared dependencies are preserved. |
| Signed archive/upload | Pending tests and adequate disk | Valid distribution identity and compatible unexpired profile include production push/Apple/app group. Verify actual archive identity, entitlements and export/upload receipt. |
| TestFlight processing/install | Not verified | UI observation showed build60 as latest listed 1.7; build63 was not listed. Upload acceptance is separate from processing and installation. |
| Physical iPhone | Pending unlock/install | Connected device inventory currently has no Bobby. iPhone Mirroring asks for Mac login unlock; user action pending. Validate actual resulting artifact and six-language flow. |
| Live purchase/restore/auth/APNs | Not verified | Controlled Apple/Store environment and account/device acceptance, independent from fixture suites. |
| Production migrations | Read-only prerequisites verified | Real coupon, memory and briefing flows remain unverified. Production health served e128cca, not the candidate. No migration was reapplied and no feature RPC or customer-row query was executed. |

## Current execution blocker

The user has agreed to free at least 8 GB. At the latest check on 4 October, the shared data volume still had about 500 MiB free. The 2.1 GiB reserve used for the retry proved insufficient, including final result serialization. No further native run, exact-lock dependency installation or archive will start until an actual disk check provides enough reserve. Physical acceptance separately awaits the user unlocking iPhone Mirroring on the Mac; no password is requested in chat.

## Corrections to earlier report

The candidate was sparse. Four Node ENOENT failures did not prove incompatible Web Speech; the tracked module passes 339 assertions after materializing the tree. The earlier four test corrections were uncommitted at the 531-test run. `expectedRead()` also normalizes language to the session, alongside locale/country and equity currency. The support measurements used system fallback fonts, not confirmed Geist. The 1.6 timeframe impact is inferred from identical client source and the server change, not physically reproduced.

The previous ProReview failure was missing Subscribe after the QA session expired; its Test Store price had loaded. The old Store35 snapshots show a failed classic parser, not proof of a slow provider. Incomplete result bundles remain unknown; their preserved logs do not become successful official summaries.

## Lower-priority findings retained

The onboarding island heading is fixed Spanish text; Trader Land shared pages lack canonical/og:url/twitter:url; web Stripe code is excluded from the API TypeScript target and has reported TS2339 errors; regional stock board ordering/quote and Ferrari/Santander resolution findings remain open. These are not represented as fixed by the two chart changes. Six remaining PG suites (agent registry, amplitude billing, RLS lockdown, swap ledger, moderation and web funnel), Anvil and cells SQL are outside the completed local PG run.

Evidence files in this directory preserve before/after regressions, source hashes, parser/session diagnosis, native attempt receipts and local PG receipts. A new successful native receipt, archive, upload and physical receipts will be added only after actual execution. This candidate remains NO-GO for release acceptance until the required runtime and distribution gates pass. Local green checks are not a universal functionality claim.

## Saved evidence

- [Candle regressions](chart-timeframe-report.md) and [support layout](support-subtitle-report.md).
- [Generated Release resources](final-bundle-audit-report.md).
- [Native attempts and repaired assertion](native/native-run-evidence.md), [remaining UI matrix](native/ui-harness-remediation.md).
- [Local PostgreSQL](pg/report.md) and [production schema prerequisites](production-schema/README.md).
- [Exact-lock build preflight](lock-build/preflight.json), [archive and physical acceptance plan](native/archive-and-physical-qa-plan.md).

`evidence-manifest.json` binds this saved evidence to code HEAD ecc4ff49 and records SHA-256 for every copied file. Execution reports retain the source commit and source hashes measured at their actual run. Historical reports do not imply execution of the repaired native assertion. Larger logs and original result bundles remain in `/private/tmp/bobby-ios17-remediation-20261004` and their original paths; only hashes/receipts are saved here. No credentials or personal database rows are included.
