# Bobby 1.7 (63) — coordinated Release archive and upload

The read-only preflight passed at 2026-10-04T11:42:06.653941+00:00 for clean tracked HEAD `a135d6e107dee1a9c9f7057532cc2f6d9fc7b6b2`. Version/build, Release scheme and generated project agree on 1.7/63. The existing distribution identity is valid and the compatible profile `d3f3f625-1017-4983-b70f-fb0b8ae4e9ef` is unexpired, with production APS, Apple sign-in, the Bobby app group and get-task-allow=false. Its certificate matches the local distribution identity. CMS signature verification passed. The historical profile name does not constrain the app's version.

The wrapper is [archive63-wrapper.py](archive63-wrapper.py). Python AST, CLI help and the real metadata-only dry-run passed; no build, export, upload, phone or App Store UI command ran. [Wrapper receipt](archive63-wrapper-receipt.json) and [dry-run preflight](/private/tmp/bobby-ios17-remediation-20261004/archive63/dry-run-preflight.json) contain hashes, build-input provenance and exact cached package revisions: GLTFKit2 0.5.15 / e69e354c4f31ea07b7816b8cbe2ddb28e897d073 and RevenueCat 5.92.0 / e45bb84b726885492ce4e7ee94ddb252d171a205. The source/package cache is reused with automatic package resolution and updates disabled.

The manual [ExportOptions-63-Upload.plist](/private/tmp/bobby-ios17-remediation-20261004/ExportOptions-63-Upload.plist) already exists and is reused. It fixes the compatible profile and Apple Distribution, uploads through app-store-connect and preserves version/build. No duplicate export options were created. The archive also explicitly uses that cached distribution profile; product project files remain unchanged.

Root should run the phases serially after the exact-lock and native acceptance work it is coordinating. The user brief already authorizes Archive and TestFlight. The direct commands are:

```sh
python3 /private/tmp/bobby-ios17-remediation-20261004/native/archive63-wrapper.py archive
python3 /private/tmp/bobby-ios17-remediation-20261004/native/archive63-wrapper.py upload
```

The archive phase requires at least 4 GiB measured immediately before launch; upload requires 3 GiB. Both monitor once per second and stop their own xcodebuild process group when free space falls below 2 GiB, preserving partial output and a hashed phase log. The preflight measured 6.07 GiB; this is a timestamped snapshot, not capacity reserved for a later phase. The archive uses two jobs, an isolated Release DerivedData path and the existing SourcePackages cache. No native phase was started alongside the ongoing exact-lock work.

Before upload the wrapper verifies the signed archive's 1.7/63 identity, exact profile, required entitlements, App Store public SDK key type, codesign integrity, root privacy manifest and byte-identical Nucleo resources, and requires absence of DEBUG fixture/contract resources. It then rechecks build-input and cache hashes. Receipts preserve archive Info/app Info/executable/resource hashes. If the source commit advances, root supplies the freshly verified `--expected-head COMMIT`; an existing archive/log is never overwritten. A new attempt uses `--out /private/tmp/bobby-ios17-remediation-20261004/archive63-r2`.

The upload phase saves xcodebuild exit status and checks for an explicit upload-success marker. Export exit0 without that marker remains subject to log review. Remote TestFlight build63 processing, group availability, installation and physical acceptance still require separate receipts. This preflight did not query remote build availability or credentials.
