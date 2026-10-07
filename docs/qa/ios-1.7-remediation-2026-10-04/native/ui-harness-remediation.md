# iOS 1.7 / build 63 — UI harness remediation

Initial remediation source: `/Users/mrrobot/.codex/worktrees/bobby-android-parity-ios17/Bobby-Agent-Trader`, HEAD `393776c332b2c3f6e21d6cad457869431dd28a62`, with the earlier QA corrections preserved. Root subsequently compiled Debug successfully. The retry at `507616c99eb143e466084c85bbb177d11315bf68` recorded 533/534 unit methods passing and both Contract UI methods passing in plaintext; the one new candle observer method failed 8 assertions and the result bundle remained incomplete after ENOSPC. The observer repair is implemented at current HEAD `ecc4ff49baf48634374750d8e4bdbdd34d9d8329` and awaits runtime. [Native execution evidence](/private/tmp/bobby-ios17-remediation-20261004/native/native-run-evidence.md) and [combined receipt](/private/tmp/bobby-ios17-remediation-20261004/native/remediation-native-run-receipt.json) preserve those boundaries. Root owns all native compilation and simulator execution.

The remaining inventory is **14 UI classes / 57 XCTest methods**. The separate NucleoContractUITests class has 2 methods, giving 15 classes / 59 methods in the complete UI target. A method may loop over many models or screenshots; those iterations are not extra XCTest methods.

## Applied corrections

- EquipmentUITests, LockerTests and SquadGalleryTests now seed `-companion.selected.v2.local` together with the legacy companion ID. The selected companion is owner-scoped; the legacy ID alone cannot replace an existing local selection. All unlock, equipment, label and rendering assertions remain intact.
- The ReleaseReadinessTests speaking scenario also seeds `-voice.gender companion`, selecting the bundled companion voice path that this test exercises. Existing speaking/stop assertions remain intact.
- The DEBUG profile fixture is now explicitly isolated. `AccountSession.isQAFixture` prevents token refresh, authenticated sends and Apple credential lookup; BobbyAccessAPI cancels its Bobby requests before HTTP. Signing out or accepting a real session clears the fixture state. These guards are compiled out of Release. RevenueCat offerings use their existing independent transport and remain live.
- ProReviewShots now requires the QA profile to remain signed in before opening the paywall and requires renewal, EULA and privacy rows alongside its existing offering/Subscribe/Restore checks. It never taps Subscribe or Restore.
- The legacy classic desk parser accepts an `agents` dictionary containing nested additive metadata, then individually requires nonempty alpha/red/cio Strings and a wait/review verdict. Optional direction is cast as String. A quote cannot rescue missing/malformed required agent text.

Four new Build34Tests methods cover QA transport isolation (zero HTTP requests, preserved identity after forced refresh, normal account transport still available), blocked metered requests, both valid verdicts with nested synthesis/scenarios, and 21 malformed/missing/invalid-verdict cases. Existing refusal tests are preserved. The earlier locale tests and strict golden corrections remain unchanged.

## Corrected diagnosis

**ProReviewShots:** The previous test did load the RevenueCat Test Store offering. Its saved accessibility snapshot contains `$4.99 / month`, renewal terms, Restore, EULA and Privacy. The failed assertion was `paywall-subscribe` existence at ProReviewShots.swift:48, not price existence. The profile displayed `Session expired — sign in again`; the paywall displayed `Sign in first`. A fake in-memory bearer (`qa-fixture`) was allowed into the real account/referral/briefing request path after the test accepted risk notice v6. A rejected refresh then signed the QA profile out. The new DEBUG isolation addresses that harness defect. The `$4.99` evidence is from **RevenueCat Test Store**, not an Apple sandbox or App Store product lifecycle. Bobby.storekit is configured for the scheme's LaunchAction; that alone cannot establish the provider used in XCTest.

**Store35Shots:** Both previous accessibility snapshots show the translated `The desk did not answer for BTC` error. BobbyAPI.debate cast the entire `agents` object to `[String:String]`, but current server output always adds a nested synthesis object and Max may add nested scenarios. That cast rejects valid current replies before reading required text. The classic parser has been repaired with strict regressions. The original live Store35 tests remain live; they were not changed to fixture success. Fresh provider/network/quota success is still pending runtime evidence. Release always launches Nucleo; Store35's classic desk is a DEBUG route, so these captures must not be reported as shipping-root acceptance.

**CompanionLoadTests:** The earlier run executed zero methods. The runner failed to create its test bundle from a CoreSimulator `Caches/com.apple.containermanagerd/Dead/temp.../BobbyUITests-Runner.app/PlugIns/BobbyUITests.xctest` path. This is a test runner installation failure, not proof of a broken companion GLB. Root will verify the real 18-model iteration on a fresh QA simulator after disk space is restored.

**StoreShots:** Its legacy screenshot rig depends on persisted onboarding state. The verdict/evolution method conditionally waits for EVOLVED, then captures even if that optional overlay never appears; the board capture is also conditional. A green capture run alone must not be translated into full live analysis or board acceptance. Gear screenshots use explicit bundled-model fixtures.

## Remaining test matrix

| UI class | Methods | Scope and evidence boundary |
| --- | ---: | --- |
| CommunitySafetyUITests | 2 | Local neighbor fixture / shared community UI. Block/unblock UI only; no real community moderation write. |
| CompanionLoadTests | 1 | DEBUG skin fixture / bundled models. One method iterates 18 companions; prior runner failed before test execution. |
| CouponRedemptionUITests | 2 | DEBUG coupon response fixture. UI confirmation/already-redeemed behavior; no real coupon is redeemed. |
| DeskHarvestCardTests | 10 | DEBUG harvest fixture / native card. 10 UI methods; account/world results are fixture data. |
| EquipmentUITests | 2 | DEBUG classic desk / local companion and XP seed. Corrected owner-scoped momo seed; English/Spanish assertions unchanged. |
| LockerTests | 6 | DEBUG locker fixture. Corrected owner-scoped companion seed; 6 methods, including model budget and ladder. |
| NucleoPrivacyUITests | 2 | Shipping Nucleo page / offline fixture backend. Readable explicit consent, withdrawal and persistence; no remote identity verification. |
| NucleoStoreScreenshots | 2 | Shipping Nucleo page / recorded HTTP fixture backend. 2 captures; successful fixture analysis is separate from live server behavior. |
| ProReviewShots | 2 | Shipping Nucleo profile plus isolated DEBUG signed-in profile / live RevenueCat Test Store offering. No Subscribe/Restore tap; Test Store price/readiness UI, no Apple purchase lifecycle evidence. |
| ReleaseReadinessTests | 14 | Mixed DEBUG classic onboarding/desk and shared Trader Land UI / local account-neighbor fixtures. Bundled voice selection now explicitly seeds companion voice; account publish/share results use fixtures. |
| SquadGalleryTests | 4 | DEBUG squad fixture / real gallery and bundled models. Corrected owner-scoped selection; unlock and active companion assertions preserved. |
| Store35Shots | 2 | DEBUG classic desk / live Bobby analysis backend / bundled showcase island. Live tests remain intact. Legacy JSON parser repaired; current HTTP/provider behavior still requires rerun. |
| StoreShots | 5 | DEBUG classic desk / live Bobby backend plus DEBUG bundled gear fixtures. 5 methods; screenshot rig is stateful and some success checks are optional. Passing captures alone do not establish live verdict success. |
| TraderLandGateTests | 3 | Shared Trader Land UI / local practice and account-neighbor fixtures. Movement/collision/undo/persistence UI; no real account island publication. |

## Evidence and next check

`ui-launch-seeds.patch` and its receipt record the four seed edits. `profile-qa-isolation.patch` and its receipt record the DEBUG isolation, AccountSheet documentation correction, regression methods and ProReview assertions. `legacy-debate-parser.patch` and its receipt record the parser change and strict nested-field regressions. `prior-ProReviewShots-testPaywallPurchasable-AX-0.txt` and `prior-Store35Shots-*-AX-*.txt` preserve the old failure snapshots. `ui-test-matrix.json` records the 14-class scope without conflating fixture, live backend and Apple purchase evidence.

`git diff --check` passed at the edit phase. All new fixture isolation references are inside `#if DEBUG`. The retry plaintext records all four new fixture/parser regression methods passing, with 533/534 unit methods and 2 Contract UI passes overall. The sole failed method contains eight assertions against a query-free diagnostic log; a strict actual-URL observer repair is implemented but has not run. ENOSPC prevented the retry from writing complete result summaries. Fresh complete unit/Contract receipts and all 14 remaining UI classes are still required after measured disk recovery. No purchase, restore, real coupon redemption, account deletion, release distribution, commit or deployment was performed by this agent.
