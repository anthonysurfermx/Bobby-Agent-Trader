# Bobby iOS 1.7 (63): independent remediation and acceptance evidence

Status: native unit/contract verification, exact-lock web compilation, all enumerated local PostgreSQL suites and both local Anvil suites passed. Remaining UI/distribution/physical acceptance is still pending. Candidate: `/Users/mrrobot/.codex/worktrees/bobby-android-parity-ios17/Bobby-Agent-Trader`, tested HEAD `a135d6e107dee1a9c9f7057532cc2f6d9fc7b6b2` (code ends at `ecc4ff49baf48634374750d8e4bdbdd34d9d8329`). Product and original test fixes are in `507616c99eb143e466084c85bbb177d11315bf68`; the request-spy assertion repair is in `ecc4ff49`. No push or web deployment has been performed.

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
| PostgreSQL integration | 21/21 distinct suites, no failures/skips: prior 14 plus seven remaining | All 17 dedicated -pg scripts, growth/cells SQL and two PG-backed API/worker runs. 2,575 explicitly reported Node checks include repeated unit portions; aggregate counters absent from four new suites are not invented. Own clusters stopped; synthetic data removed. |
| Anvil integration | 2/2 suites, 61 assertions, no failures | Hardness 10, Bounties 51; chain31337/localhost/synthetic accounts. Existing compiled artifacts match current Solidity source Keccak and ABI. Own processes stopped; no external RPC or real transaction. |
| Exact-lock web build | npm ci and complete npm run build passed | 1,292 installed lock entries match; Vite6.4.3/SWC1.15.24/TS5.9.3. 896 artifacts hashed; sources/lock unchanged. Node25.9 differs from CI22. Own dependencies/cache/dist removed after receipts. |
| Earlier native run | 529 unit + 2 contract UI passed | Historical candidate with four then-uncommitted test corrections. Those corrections are now committed, but this result does not validate the new Swift fixes. |
| Current native run | Official complete xcresult Passed 536/536: 534 unit + 2 contract UI, zero failed/skipped | Source a135d6e1 (ecc4ff49 code plus docs), clean simulator0025; repaired request-spy method passed. Result summary and all536 case nodes independently inspected. One internal QoS warning remains recorded; zero failed tests does not mean zero warnings. Earlier failed/incomplete runs remain historical only. |
| Current remaining-UI progress | Officially passed 5/14 classes, 16/57 methods, no failures/skips | ProReview2, Store35 live English/Spanish2, Equipment2, Locker6 and SquadGallery4. The unchanged disk guard paused before ReleaseReadiness; 9 classes/41 methods remain. |
| Production schema prerequisites | 14 feature histories, 18 RLS/service-only tables, 232 columns, 59 RPC contracts, 61 valid indexes | Read-only catalog checks in the actual Bobby project qbvdqkknnuweatptjohi. Definitions match; this is not live feature acceptance or deployment of this candidate. |
| Source integrity | Product commit 507616c9 plus DEBUG/test-only repair ecc4ff49; clean code tree at commit check | Strict assertions retained; generated native/web pages included. |

## Required acceptance work still in progress

| Gate | Current status | Concrete next check |
| --- | --- | --- |
| New native unit/contract run | Verified:536/536 official | Five added Swift methods and both contract UI methods pass; no successful new result is inferred from the older incomplete attempts. |
| Remaining UI target | 16/57 passed; 41 still pending | The clean-simulator run now has five complete official class receipts. Continue ReleaseReadiness and the other eight classes using retained compiled products, unchanged guards and preserved preferences. |
| ProReviewShots | Verified2/2 official | Signed-in DEBUG fixture survives; live Test Store price, enabled Subscribe and renewal/legal/Restore controls render. No purchase or restore was performed. Apple Store lifecycle remains separate. |
| Store35Shots | Verified2/2 official | English and Spanish runs receive actual live verdicts and visible CIO output. This validates the repaired classic DEBUG parser against the live backend; shipping Nucleo root acceptance remains separate. |
| Exact-lock web build | Verified | Separate workspace; npm ci/exact lock, API/admin/ESM/telemetry/PWA and Vite6.4.3 build pass. Shared dependency hashes unchanged. This is local Node25.9/macOS compilation. |
| Signed archive/upload | Pending tests and adequate disk | Valid distribution identity and compatible unexpired profile include production push/Apple/app group. Verify actual archive identity, entitlements and export/upload receipt. |
| TestFlight processing/install | Not verified | Fresh read-only App Store Connect observation at 2026-10-04T12:13:43Z shows build60 as latest visible 1.7, with descending completed upload rows60..56. Build63 is absent from these visible lists. Upload acceptance is separate from processing and installation. |
| Physical iPhone | Pending unlock/install | Connected device inventory currently has no Bobby. iPhone Mirroring asks for Mac login unlock; user action pending. Validate actual resulting artifact and six-language flow. |
| Live purchase/restore/auth/APNs | Not verified | Controlled Apple/Store environment and account/device acceptance, independent from fixture suites. |
| Production migrations | Read-only prerequisites verified | Real coupon, memory and briefing flows remain unverified. Production health served e128cca, not the candidate. No migration was reapplied and no feature RPC or customer-row query was executed. |

## Execution resources and remaining blockers

At resumption, the volume had6.8GiB free. Exact-lock succeeded, generated artifacts were hashed, and only its node_modules/cache/dist were removed (1.71GiB recovered). The clean simulator was explicitly booted and the new536-method native run completed with a minimum5.45GiB observed reserve. During UI work, available capacity later fell below the unchanged2.5GiB start guard; Locker executed no methods at that pause. Root shut down only the owned QA simulator, retained preferences, and removed only684 compiler object files plus its module cache, preserving Build/Products, build database, source packages and all xcresults. That reclaimed301,588,480bytes; continuation remains monitorized with a2GiB stop reserve. The continuation accepted Locker6/6 and SquadGallery4/4, then halted before ReleaseReadiness at2.44GiB. The user has offered to free at least6GiB more; no further test success is assumed until actual execution. A redundant public-source copy in the exact-lock workspace was also removed only after490 files matched both its retained manifest and canonical source; this produced no observed capacity recovery, and its cleanup receipt records that limitation. No data from other work or system swap was deleted.

The original chat working directory disappeared when macOS relocated Documents. A compatibility symlink was rejected by the automation runtime because symlinked writable roots are unsupported; it was removed immediately. A real minimal working directory with WORKSPACE_LOCATION.txt restored the runtime without moving/copying either actual repository or weakening sandbox settings. QA continues against the canonical worktree. iPhone Mirroring reconnects but still requires the user's Mac password entered directly in its window; no password is requested or entered in chat.

## Corrections to earlier report

The candidate was sparse. Four Node ENOENT failures did not prove incompatible Web Speech; the tracked module passes 339 assertions after materializing the tree. The earlier four test corrections were uncommitted at the 531-test run. `expectedRead()` also normalizes language to the session, alongside locale/country and equity currency. The support measurements used system fallback fonts, not confirmed Geist. The 1.6 timeframe impact is inferred from identical client source and the server change, not physically reproduced.

The previous ProReview failure was missing Subscribe after the QA session expired; its Test Store price had loaded. The old Store35 snapshots show a failed classic parser, not proof of a slow provider. Incomplete result bundles remain unknown; their preserved logs do not become successful official summaries.

## Lower-priority findings retained

The onboarding island heading is fixed Spanish text; Trader Land shared pages lack canonical/og:url/twitter:url; web Stripe code is excluded from the API TypeScript target and has reported TS2339 errors; regional stock board ordering/quote and Ferrari/Santander resolution findings remain open. These are not represented as fixed by the two chart changes. The formerly pending six dedicated PG suites, cells SQL and both Anvil suites now passed locally; their functional evidence stays separate from deployed/personal/commercial behavior.

Evidence files in this directory preserve before/after regressions, source hashes, parser/session diagnosis, native attempt receipts and local PG receipts. The successful native receipt is now available. Further UI, archive, upload and physical receipts are added only after actual execution. See [current native result](native/current-native-verification.md), [remaining PostgreSQL suites](pg-remaining/report.md), [Anvil](anvil/report.md), [exact-lock build](lock-build/report.md), [serial UI progress](native/ui-serial-run-report.md), and [independent evidence review](evidence-consolidation-review.md). This candidate remains NO-GO for release acceptance until the required runtime and distribution gates pass. Local green checks are not a universal functionality claim.
