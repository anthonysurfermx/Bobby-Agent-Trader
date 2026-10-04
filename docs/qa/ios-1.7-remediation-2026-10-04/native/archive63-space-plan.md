# Build 63 — space recovery and Archive sequence

Read-only snapshot at 2026-10-04T12:12:34.434004+00:00; no deletion, build, simulator action or upload was performed. HEAD a135d6e1 is clean. The current complete native receipt and methods hash verify **536/536 passed: 534 unit + 2 Contract UI, 0 failures, 0 skips**, including the repaired candle spy. The 14-class UI run remains incomplete: 5 classes / 16 methods accepted, latest driver stage `ReleaseReadinessTests` is `halted-before-execution`. Complete the remaining UI before retiring its simulator or products.

| Our QA path | Measured allocated size | After completed UI |
| --- | ---: | --- |
| CoreSimulator device 0025C304-8A10-4124-8308-EB94159F025C, named Bobby 1.7 QA 2026-10-04 | 2.256 GiB | Root shuts down and deletes this exact temporary device through simctl, then measures actual free space. No other simulator/runtime is removed. |
| /private/tmp/bobby-coupon-ios-derived | 0.465 GiB | This is the DerivedData used by the current guarded native run. Retire it only after serial UI completes and products below are retained. |
| Same DerivedData/Build/Products | 0.260 GiB, already included above | Move this directory into native/debug-products on the same volume, without making a duplicate. Keep complete Bobby.app, BobbyTests.xctest, UI runner/test bundle and any dSYMs. Existing manifests label these Debug Simulator products, never a device/Release artifact. |
| Same DerivedData/Build/Intermediates.noindex | 0.203 GiB, included above | Reclaim after retaining Products; compiler intermediates are reproducible. |
| Cached SourcePackages in lang-derived | 0.233 GiB | Preserve. This is the shared GLTFKit2/RevenueCat cache the Release wrapper needs; it is not a cleanup target. |

The free-space snapshot is **2.42 GiB**. Retiring only the exact QA simulator plus the DerivedData remainder while retaining Products offers about **2.46 GiB** reclaimable allocation, for an estimated **4.88 GiB** afterward. APFS clones, live processes and other activity can change actual recovery; root must use the new measured value. The archive requires 4 GiB to start, upload 3 GiB, and both stop below 2 GiB. The current UI start guard itself requires 2.5 GiB; the post-UI recovery cannot justify starting the remaining UI now.

Before any recovery, retain all `.xcresult` bundles, logs, execution/summary/tests JSON and UI attachments in this remediation directory, including the older incomplete results. Retain native-unit-contract-a135d6e1-summary/tests/execution, ui-serial-results/driver/source-binding, each class inspection, source/resource/spy hashes, the complete Debug Products, signing/profile metadata, ExportOptions-63-Upload.plist, wrapper and preflight. Copy curated small evidence to docs as root planned; leave original bundles intact. Current result bundles occupy about 49 MiB and are acceptance evidence, not the main recovery source. Keep Anvil/PG/exact-lock receipts; their clusters/dependencies were already cleaned. The surviving exact-lock source snapshot is not needed for this archive and is excluded from the simulator/DerivedData estimate.

Run serially after all required UI receipts are accepted:

1. Retain evidence and move Debug Products, retire only sim 0025 and the remaining designated DerivedData, then measure disk. Keep SourcePackages and candidate source untouched.
2. Recheck clean candidate HEAD and wrapper preflight. Use `--expected-head` with the newly verified full SHA if root made a documentation commit; product inputs must still match the accepted tests.
3. Run the Release archive phase below. It uses isolated archive63-derived, cached packages, two jobs and the existing compatible distribution profile. It records process status/hash and automatically verifies version 1.7/build 63, signed entitlements/profile, privacy manifest and Nucleo resource provenance.
4. Run explicit verify below and retain archive-verification.json plus the complete xcarchive/dSYMs. Once verification passes and no rebuild is needed, root can reclaim only archive63-derived to restore upload reserve; keep the signed archive, SourcePackages and receipts.
5. Measure at least 3 GiB immediately before upload; run upload below. It re-verifies the archive and reuses the existing manual ExportOptions-63-Upload.plist. Retain upload-phase logs/receipt, upload-acceptance.json and upload-export contents/IPA hashes if an IPA is produced. Verify remote build 63 processing separately before claiming TestFlight availability or installation.

```sh
python3 /private/tmp/bobby-ios17-remediation-20261004/native/archive63-wrapper.py archive
python3 /private/tmp/bobby-ios17-remediation-20261004/native/archive63-wrapper.py verify
python3 /private/tmp/bobby-ios17-remediation-20261004/native/archive63-wrapper.py upload
```

The wrapper preserves partial output and refuses overwriting an existing attempt; use a fresh `--out` for a real retry. No cleanup or Release phase is concurrent with UI. Physical acceptance remains a separate installed-build receipt.
