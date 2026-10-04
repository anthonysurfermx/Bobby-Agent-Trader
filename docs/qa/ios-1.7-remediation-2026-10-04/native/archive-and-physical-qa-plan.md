# iOS 1.7 / build 63 — archive and physical QA feasibility

This is a read-only preflight. No archive, export, upload, phone interaction, account login, purchase or restore was performed by this agent. Root compiled the remediation source in Debug; fresh complete runtime acceptance remains pending as recorded in native-run-evidence.md. Mac Safari was not controlled.

## Local signing and export

`security find-identity -v -p codesigning` reports 3 valid identities: 2 Apple Development and 1 Apple Distribution. The distribution identity is for team `QZRTV6CMTT`, SHA-1 `A485BF8AE5E66C9127F54E508C426C916B518C26`. Its public certificate is valid from 2026-09-22 12:35:27 UTC through 2027-09-22 12:35:26 UTC. Identity validity indicates a local signing identity; actual export may still require keychain access and is not established by this listing alone.

The matching App Store profile is:

- UUID `d3f3f625-1017-4983-b70f-fb0b8ae4e9ef`, stored under Xcode UserData/Provisioning Profiles.
- Name `Bobby App Store 1.2 build 35`. Its name is historical; the actual application identifier is `QZRTV6CMTT.xyz.bobbyprotocol.bobby`, not a version/build restriction.
- Expires 2027-09-22 12:35:26 UTC. Contains the available distribution certificate above.
- `get-task-allow=false`, `beta-reports-active=true`, `aps-environment=production`, Sign in with Apple Default, and `group.xyz.bobbyprotocol.bobby`.
- No device allow-list, as expected for App Store distribution.

Two older cached Bobby Store profiles omit `aps-environment`, so they cannot satisfy the current push entitlement. The development profile UUID `69d2f2f6-dfd8-4f6e-ae3b-c90911bfb51d` has development APS and get-task-allow=true; it serves development signing, not final Store distribution. The profile CMS signatures were verified with OpenSSL without certificate-chain verification. macOS `security cms` decoding failed with a local certificate-import parameter error; that failure is not evidence of an expired or malformed profile. OpenSSL decoded and verified each CMS signature successfully.

Source project.yml:137–140 specifies Automatic signing, team QZRTV6CMTT, version 1.7 and build 63. Release:149 uses production APS; Bobby.entitlements:5–13 requests APS, Apple sign-in and the same app group.

| Existing option file | Concrete behavior |
| --- | --- |
| ios/Bobby/ExportOptions-TestFlight.plist | app-store-connect, destination=upload, Automatic signing, team QZRTV6CMTT, uploadSymbols=true, manageAppVersionAndBuildNumber=false |
| ios/Bobby/ExportOptions-External.plist | app-store-connect, destination=export, Automatic signing, same team, internal-testing-only=false, uploadSymbols=true, preserves version/build |

The local export option is suitable for checking the signed IPA before the upload option is used. If automatic signing selects an older profile without APS, explicitly selecting the compatible profile is a reviewable fallback; no signing setting was changed in this preflight. Verify actual archive/IPA entitlements, bundle version/build, Release public SDK key, privacy manifest, packaged HTML hashes and absence of DEBUG fixture/contract resources after export.

The relocated release artifact root is `/Users/mrrobot/Documents/Documentos - MacBook Pro F Society/Codex/2026-10-02/pa/outputs`. The latest archive in that checked root is build 61, created 2026-10-03 17:15:21 UTC. There is no build-62 or build-63 directory there. Its archive was development-signed; an App Store export can re-sign an archive, so archive identity alone is not the final IPA identity. Build 61's upload attempt failed with `No space left on device` at upload.log:12–15 and export failure at :23; :17 also records ASSET_UPLOAD -19235. This failed local attempt does not establish App Store Connect's current remote build state.

Local signing/profile prerequisites for a new build-63 Release archive and App Store export are available. **Actual archive/export success, App Store Connect credentials/role, build-63 number availability, upload acceptance and TestFlight processing remain unverified.** Disk exhaustion and pending fresh QA remain the immediate local gates. Eight GB freed by the user should be measured again before each major native phase; capacity cannot be inferred from deletion intent alone.

## Physical-device acceptance without purchase or new Apple login

All hardware acceptance below requires the exact intended installed version/build. Root's earlier inventory of a development installation of 1.7/build 60 is historical. The current successful CoreDevice snapshot, [device-before.json](/private/tmp/bobby-ios17-remediation-20261004/device-before.json), contains **no `xyz.bobbyprotocol.bobby` installation** (SHA-256 `8e45149b6ba5703938dcb360643fa4634bfe48dc38671d2306c25de108c09288`). This note uses the existing receipt; no new app inventory or phone interaction was performed. TestFlight processing, installation and physical QA are separate receipts. A development QA build can establish development-build hardware behavior; it cannot establish TestFlight build-63 installation or shipping acceptance.

| Check | Automatic part without purchase / new Apple login | Needed intervention / precise acceptance |
| --- | --- | --- |
| P01 — installed artifact | Headless CoreDevice app inventory filtered to xyz.bobbyprotocol.bobby; record version/build, app type and OS/model | Device must be paired and reachable. Proceed with 63 acceptance only after installed build is 63 and provenance is recorded. |
| P02 — launch stability | Launch existing app by bundle ID with CoreDevice; inspect process/console/crash receipt after launch | Device unlock may be needed. Rendering requires screenshot/accessibility evidence; a live process alone is not a UI pass. No reinstall or fake QA launch flags. |
| P03 — consent and offline first use | Native XCTest can read/click consent and reopen the app after pairing; assert complete readable disclosure and explicit agreement | Prepare fresh consent state on a dedicated QA install. A clean install/reinstall must not silently replace the user's installed TestFlight app or erase its data. |
| P04 — six-language shipping UI | Native UI automation can select en/es/fr/pt/it/de in the app, navigate Desk/Profile/Trader Land and capture screenshots | Audit shipping UI identifiers first. Confirm translated controls and French/German support captions fully fit; no clipped glyphs. Screenshot capture needs a working device UI driver, absent from current generic app tools. |
| P05 — chart accuracy | Native automation can select supported chart horizons and record the axis interval, source timestamp and displayed timeframe | Live read can consume quota/provider work; run only in root's authorized read scenario. Confirm labels match actual 1H candles, not just the chosen horizon. A fixture run on hardware is labeled fixture. |
| P06 — models and local controls | On a development QA build, the bundled-model fixture and existing native equipment/gallery/locker suites can run headlessly on hardware | Developer Mode/Trust may require the user. This verifies GPU/model loading and local UI on a development build; shipping TestFlight model acceptance is a separate normal-UI pass. |
| P07 — local mute/persistence | Native automation can change mute, choose an available companion and relaunch; assert preserved values | Confirm audible playback manually where required; an isSpeaking flag or audio-source file does not prove speaker output. Restore the user's preferred setting. |
| P08 — physical dictation | After permission and locale availability, native automation can hold the mic, cancel recording and verify no lingering capture; no Send needed | Human spoken phrases and microphone/Speech permission choice are required. Record one phrase in each supported language, partial/final text and on-device versus Apple-service route. Declining service consent must keep capture stopped. |
| P09 — signed-out Pro sheet | Open shipping Bobby Pro sheet, capture actual provider price/readiness, renewal/EULA/privacy/Restore rows | Do not tap Subscribe or Restore. A signed-out sheet legitimately offers sign-in instead of an enabled Subscribe. Test Store Debug evidence does not establish the Release App Store offering. |
| P10 — returning account UI | If an authorized QA account is already signed in, automate read-only profile and local progress views | New Sign in with Apple requires the human's Apple authorization sheet. Do not use fake bearer or owner launch seeds in shipping acceptance. |
| P11 — push behavior | Read local push state/token diagnostics when a QA build exposes them; capture app handling after a received event | First notification permission and a controlled test push require explicit user/server coordination. APS entitlements alone do not prove delivery, foreground handling or background tap routing. |
| P12 — lifecycle / purchases | No purchase, restore, renewal, cancellation or refund will run in this pass | Apple sandbox/TestFlight purchase lifecycle requires a separate authorized scenario and manual system purchase-sheet decisions. These remain gaps, never assumed from an enabled Subscribe button. |

CoreDevice supports read-only filtered inventory and headless launch without controlling Mac Safari. Help was inspected locally, but no phone command was executed. An inventory can use `xcrun devicectl device info apps --device DEVICE --include-all-apps --bundle-id xyz.bobbyprotocol.bobby --json-output RECEIPT`; launch is `xcrun devicectl device process launch --device DEVICE xyz.bobbyprotocol.bobby`. These are preparation examples; replace placeholders only with the selected QA device and preserve installation provenance. XCTest device automation needs trust/Developer Mode and may install a runner or target app. Confirm its install behavior before testing the existing TestFlight app; the simulator's 14 DEBUG suites are not a direct TestFlight physical-device command.

## Evidence files

`archive-upload-feasibility.json`, `signing-profile-inventory.json`, `distribution-certificate-metadata.txt`, `export-options-inventory.json`, and `relocated-release-artifacts.json` hold the redacted local preflight. They contain public certificate/profile metadata and no private signing key or App Store credential. Runtime, upload and physical passes remain pending root's controlled execution.
