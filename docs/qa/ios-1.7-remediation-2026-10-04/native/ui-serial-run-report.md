# Serial UI QA — current evidence

Candidate and compiled Debug Simulator products: `a135d6e107dee1a9c9f7057532cc2f6d9fc7b6b2`, Bobby 1.7 (63). The initial unit/contract run has an official **536/536 pass, zero failed/skipped** receipt supplied by root. The separate remaining UI scope is 14 classes / 57 methods.

Five remaining UI classes have official complete receipts: **5 classes / 16 methods passed, zero failed/skipped**. Both modern xcresulttool summary and test tree were inspected, and actual case identities exactly match the complete source inventory.

| Class | Official result | Scope |
| --- | --- | --- |
| ProReviewShots | 2/2 passed | Live RevenueCat Test Store price, enabled Subscribe, renewal, Restore and legal controls; isolated DEBUG account profile. No purchase or Restore tap, no Apple commercial lifecycle proof. |
| Store35Shots | 2/2 passed | Actual English/Spanish backend reads reached VERDICT READY and visible CIO verdict, then entered the local showcase island. No conversion to HTTP fixtures. This is the classic DEBUG desk, separate from shipping Nucleo root acceptance. |
| EquipmentUITests | 2/2 passed | Corrected owner-scoped English/Spanish equipment and pet controls, state after relaunch and locker synchronization. |
| LockerTests | 6/6 passed | Owner-scoped selection, earned counters, seen/new pieces, locked pricing and bounded active models. |
| SquadGalleryTests | 4/4 passed | Full 18-companion iteration plus active, locked and unlocked ownership assertions. |

The serial driver first halted before LockerTests because free space was 2.47 GiB, below the required 2.5-GiB UI start reserve. Root recovered space by removing only owned compiler caches/objects while preserving compiled products, metadata, packages and receipts. The resumed driver booted the same owned simulator without erasing its preferences and completed Locker and SquadGallery using test-without-building. It then halted **before ReleaseReadinessTests started** because free space was 2.44 GiB. This is a disk guard stop, not a failed or skipped product test. Nine classes / 41 methods remain pending. No test assertion failed in the five completed classes. Equipment's lowest observed free space was 2.265 GiB, Locker's 2.532 GiB and SquadGallery's 2.326 GiB, all above the 2-GiB stop threshold; their results were fully serialized and inspected.

All result bundles, logs and execution/summary/tests/inspection JSON remain intact. `ui-serial-results.json` is the aggregate; `ui-serial-driver-status.json` records the halt. `native/ui-serial-source-binding.json` freezes all 14 UI source hashes and the compiled Debug app/test binary and HTML hashes, with actual bundle version/build. The private continuation driver skips already accepted classes when resumed, preserving their receipts and avoiding redundant runs. No source/product edit, simulator erase, purchase, restore, coupon redemption, archive, upload or deployment was performed by this UI QA agent. Root's earlier user-authorized clean simulator remains the only erase.

Resume only after actual free space meets the monitored reserve, retaining serial execution and per-class official validation. Release acceptance remains incomplete; no physical/TestFlight or universal functionality claim follows from this partial UI run.
