# Bobby 1.7 (63) — coordinated local Release archive

Root explicitly authorized a local Release archive and verification while its UI test-without-building run remains in progress. Upload/distribution remains blocked until UI acceptance, Claude review and root coordination. The archive uses separate `/private/tmp/bobby-ios17-remediation-20261004/archive63-derived`, 2 jobs, existing pinned SourcePackages cache, 4 GiB minimum start and 2 GiB stop reserve. No simulator, device, App Store browser, purchase or upload action is part of this run.

Frozen source: clean tracked HEAD `be3e8b1389294e7d477a77b87e107f044ea3f55e`. A targeted git diff confirmed shipping paths `ios`, `api` and `src` are unchanged from product candidate `a135d6e107dee1a9c9f7057532cc2f6d9fc7b6b2`. Preflight rechecked 1.7/63, Release APS production, the valid matching Apple Distribution identity/profile and exact package revisions. Source-input hashes are recorded before the build.

## First attempt: configuration failure, not product failure

`archive63/archive-phase/phase-receipt.json` records start 2026-10-04T12:31:14.944024Z, 8.04 seconds, xcodebuild exit 65 and log SHA-256 `98ffbe7e2f12605d829110d3ff164571cdb27ead827713498c205b338654d3b8`. The global CLI provisioning-profile assignment propagated to the SPM resource bundle `RevenueCat_RevenueCat`, which does not support profiles. The archive failed during configuration before product compilation. Reserve remained intact; no source error, runner death or concurrent-UI failure is inferred.

The first log, preflight and exact wrapper are preserved under `archive63/`. The wrapper-only signing repair is recorded in `native/archive63-wrapper-signing-repair.json`: replace the global profile UUID with `BOBBY_ARCHIVE_PROFILE_Bobby=UUID` and `PROVISIONING_PROFILE_SPECIFIER=$(BOBBY_ARCHIVE_PROFILE_$(TARGET_NAME))`. This resolves the exact UUID for Bobby and leaves undefined resource-bundle mappings empty. Canonical code/project, profiles and global signing settings remain unchanged. No automatic provisioning updates were requested.

`native/archive63-target-signing-settings.json` records resolved Bobby Release settings: Manual, Apple Distribution, team QZRTV6CMTT, profile UUID d3f3f625-1017-4983-b70f-fb0b8ae4e9ef and APS production. Only non-secret signing metadata was retained; the full build-settings dump was not saved.

## Retry: archive and verification passed

Retry began at 2026-10-04T12:34:26.547877+00:00 and xcodebuild completed at 2026-10-04T12:37:49.294276+00:00 with exit 0 in 202.75 seconds. The archive passed the prior signing configuration error, compiled RevenueCat and Bobby Release, and signed without a password entry. Minimum observed free space, including the final phase sample, was 5.825 GiB, above the 2 GiB reserve.

The automatic verifier initially rejected the literal name `NUCLEO_FIXTURES`. Inspection and independent bundled-UI review established three inert, guarded reads in app.html and no fixture definition, mock bridge or DEBUG resources. The verifier repair preserves those existing guards and rejects actual fixture assignments/dev implementation, requires generated Release mode and retains all signing/resource/hash checks. Archive bytes and source were not changed or rebuilt. A default-sandbox codesign verification returned 1 without a captured diagnostic; the same unmodified archive verified successfully in the authorized outside-sandbox context. No product error is inferred from that context difference. Both attempts are retained in `archive63-r2/verification-history.json`.

`archive63-r2/archive-verification.json` and `completion-receipt.json` confirm version 1.7/build 63, exact profile UUID, production APS, get-task-allow=false, Apple Sign-in, app group, codesign integrity, App Store public SDK key type, root privacy manifest and 4 byte-identical Nucleo resources. All 750 recorded build inputs and the package cache match their preflight hashes.

Final archive: `/private/tmp/bobby-ios17-remediation-20261004/archive63-r2/Bobby-1.7-63.xcarchive`. Archive size is 175162800 bytes. No upload or export phase ran. UI acceptance is still owned by root and was in progress when this archive finished; no release GO is claimed.

Local archive verification requires exact 1.7/63 bundle identity, codesign integrity, exact signed/embedded profile entitlements including production APS, App Store RevenueCat public SDK key type without printing its value, root privacy-manifest hash, byte-identical Nucleo resources, absence of DEBUG contract/fixture resources and unchanged source/cache hashes. Passing these checks establishes a local signed archive only. It does not establish UI completion, upload, TestFlight processing, installation, physical behavior or release GO.
