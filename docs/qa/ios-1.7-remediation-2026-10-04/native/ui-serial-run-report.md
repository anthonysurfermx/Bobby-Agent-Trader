# Serial UI QA - current evidence

Updated `2026-10-04T13:00:09.197903+00:00`.

Initial compiled Debug Simulator inputs: `a135d6e107dee1a9c9f7057532cc2f6d9fc7b6b2`, Bobby 1.7 (63). Initial serial execution receipts may record docs-only descendant HEAD `be3e8b1389294e7d477a77b87e107f044ea3f55e`; its product diff is empty and all 14 UI source hashes matched the frozen inputs before the separately documented StoreShots harness-only repair. The corrected StoreShots test bundle is rebuilt after that one test file changes; product source remains identical. The separate initial unit/contract phase has an official **536/536 pass, zero failed/skipped** receipt.

The remaining UI scope has **14/14 classes and 57/57 methods accepted**. Both modern xcresult summary and test tree were inspected for every accepted class; unique case identities exactly match the complete source inventory. All accepted classes have zero failed, skipped or expected-failure methods.

| Class | Official result | Scope |
| --- | --- | --- |
| ProReviewShots | 2/2 passed | Actual RevenueCat Test Store offering/price and enabled Subscribe, renewal, Restore/legal controls; isolated DEBUG account. No purchase or Restore tap; no Apple commercial lifecycle proof. |
| Store35Shots | 2/2 passed | Actual English/Spanish backend reads reached VERDICT READY and visible CIO verdict, then the local showcase island. Classic DEBUG desk; no HTTP fixtures; separate from shipping Nucleo acceptance. |
| EquipmentUITests | 2/2 passed | Owner-scoped English/Spanish equipment/pet controls, relaunch persistence and locker synchronization. |
| LockerTests | 6/6 passed | Owner-scoped selection, earned counters, seen/new pieces, locked pricing and bounded active models. |
| SquadGalleryTests | 4/4 passed | All 18 bundled companions plus active, locked and unlocked ownership checks; 4 test methods. |
| ReleaseReadinessTests | 14/14 passed | English/Spanish consent, onboarding, mute/voice selection and relaunch persistence; local practice and account-island fixtures. Speaking state does not prove audible hardware output. |
| NucleoPrivacyUITests | 2/2 passed | Shipping page with offline HTTP fixtures: consent/withdrawal and persisted state across relaunch. |
| CouponRedemptionUITests | 2/2 passed | DEBUG coupon UI confirmation/replay responses; no actual redemption or production write. |
| DeskHarvestCardTests | 10/10 passed | DEBUG harvest card, analysis horizon and locking fixtures. |
| CommunitySafetyUITests | 2/2 passed | Local neighbor fixture block/unblock; no real moderation write. |
| TraderLandGateTests | 3/3 passed | Local practice/account-neighbor fixtures: movement, collision, undo and persistence. |
| NucleoStoreScreenshots | 2/2 passed | Shipping English/Spanish rendering with recorded HTTP fixtures; no live AI read. |
| CompanionLoadTests | 1/1 passed | One method iterates all 18 bundled companions; not 18 distinct methods. |
| StoreShots | 5/5 passed | Stateful classic capture rig; numeric onboarding prerequisite order checked separately. Gear matrix captures 10 companions x 5 pieces within one method. Conditional board/evolution captures do not prove a live verdict. |

Pending classes: none.

The driver originally stopped before Locker at 2.47 GiB and before ReleaseReadiness at 2.44 GiB, each below the 2.5-GiB UI start reserve. Neither stop executed methods of that next class or represents a product failure/skip. Root removed only owned compiler caches/objects and preserved compiled products/packages/metadata. Subsequent shutdown/boot affected only the owned QA simulator and preserved preferences. At 12:27:51 UTC actual capacity recovered to 3.982 GiB; continued user cleanup brought ReleaseReadiness start reserve to 6.002 GiB. Accepted classes are skipped when resuming.

The active runner retains the 2.5-GiB UI start and 2-GiB stop guards, serial UI execution, unique evidence paths and per-class official validation. Root separately authorized an isolated Release archive during the time-limited run; it uses separate DerivedData and does not alter Debug products. No additional simulator erase, product edit, purchase, Restore tap, actual coupon redemption, upload or deployment was performed by this UI agent. Root's earlier explicitly authorized clean simulator remains the only erase.

Execution receipts retain actual capacity minima and process/log hashes. Result bundles, logs and execution/summary/tests/inspection JSON remain intact. `ui-serial-results.json` is the aggregate; `ui-serial-driver-status.json` is live state, and `native/ui-serial-source-binding.json` freezes source, compiled app/test binary and HTML hashes. The driver checks the 12:46:15 UTC QA deadline before launching another class and preserves an in-flight result.

This evidence establishes only the stated simulator/fixture/live-read scopes. It does not establish physical-device, TestFlight, Apple purchase lifecycle or universal functionality acceptance.

## Preserved failed attempt and test-only remediation

Original `StoreShots.xcresult` officially executed all five methods: **2 passed, 3 failed, zero skipped**. Onboarding ran first and passed; the final method completed all 50 gear captures and passed. Methods 02/03/04 failed at the expected desk controls before any question was submitted. This is retained as failed evidence, not hidden by a rerun.

The prior successful privacy withdrawal deliberately persisted `agent.riskNoticeVersion=0`. StoreShots01 sets the v6 notice only as a launch override; later methods omitted it. Read-only preference evidence showed consent=0 and onboarded=true, and the recorded test02 AX hierarchy shows all four disclosure controls unacknowledged plus disabled ACKNOWLEDGE ALL FOUR. ContentView correctly gates entry in that state.

Root explicitly approved adding the same `-agent.riskNoticeVersion 6` starting precondition to only StoreShots02/03/04. Every assertion and live API call is preserved; onboarding persistence is still exercised. Only `ios/Bobby/UITests/StoreShots.swift` changes; product source and the Release archive inputs remain unchanged. The complete corrected StoreShots class uses separate `StoreShots-consent-corrected` evidence. Its official complete result is **5/5 passed, zero failed/skipped**, with exact source case identities; the preserved original failed attempt does not add coverage.

The targeted corrected `09-verdict` screenshot was inspected: it shows HALO // RISK GATE, a valid **NO TRADE** waiting verdict and English CIO analysis for 1H BTC-USDT, plus DAILY XP COMPLETE and SAVED ON THIS DEVICE. This proves the actual classic DEBUG backend response was visibly rendered; it is separate from shipping Nucleo/physical acceptance. No `10-evolution` attachment was recorded, so evolution is **not verified** by this optional branch. No XP was silently seeded to manufacture it. The screenshot and inspection JSON are retained under `native/StoreShots-corrected-*`.

The test-only repair commit is `a44b98b5eed6ce5445dec3d57d3cf4030f967902`; its sole changed path is StoreShots.swift. The combined accepted count is **593 unique methods = 534 unit + 2 contract UI + 57 remaining UI**. The two contract methods are excluded from the additional UI inventory and retries add no coverage. `native/ui-serial-completion-receipt.json` independently validates unique identities, numeric StoreShots order and 50 unique gear captures.
