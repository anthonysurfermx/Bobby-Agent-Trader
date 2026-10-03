# Bobby for Android

The Android candidate is **1.1.0 (version code 5)**, on `codex/bobby-android-parity-ios17`, with [draft Android PR #141](https://github.com/anthonysurfermx/Bobby-Agent-Trader/pull/141), stacked on `claude/feedback-build61` and based on canonical iOS **1.7 (61)** source / [PR #140](https://github.com/anthonysurfermx/Bobby-Agent-Trader/pull/140), commit `bfdc16dfe9ce947f11bbcbd4f447ffc62d0f1e92`. PR #140 is still open; this is a source reference, not proof of an iOS release. Kotlin owns accounts, consent, market data, billing, voice and persistence; the approved bundled HTML/WebGL Núcleo and native Compose sheets present the product. Authentication tokens never enter the web page. Application ID: `xyz.bobbyprotocol.bobby`.

The current [local code-5 build receipt](../docs/android/evidence/parity-code5-final/parity-code5-20261003T184654Z-build.json) is **PASS**: 101 Node tests and 163 JVM tests, with no failures/errors/skips; lint has **0 errors and 59 warnings**. Debug and instrumentation APKs compiled, and the release APK/AAB were built and signed with the existing upload key. This is the default `BOBBY_FCM_ENABLED=false` build. The [362-input source manifest](../docs/android/evidence/parity-code5-final/parity-code5-20261003T184654Z-source.json) has digest `d37effbf75ac707415ced82ab01f8f69d1e4aa04c4d29aeecdfb51faf03a17ca`, unchanged during the build. Release APK SHA-256: `20e7eb849105b81ab53bc9bbe8eb25e851781665443ef59b69b7a0a572c567ec` (47,042,112 bytes); AAB: `0ec118b0d790e8b04faaaa8c77d3aa93ede6919e6f7f0491a96b314154cbc648` (50,341,132 bytes). The initial disk-space blocker is resolved.

Independent [security-candidate release validation](../docs/android/evidence/parity-code5-final/parity-code5-security-release-validation.json) is **PASS**: 11 actual tools, APK/AAB signature and identity, 190 source-bound packaged assets per artifact, 16 KB alignment/native ELF and the compiled purple-orb icon. Six assets deliberately changed from code 4; approved art/models and native libraries remain preserved. This is local static validation. [Actual debug instrumentation](../docs/android/evidence/parity-code5-final/parity-code5-instrumentation-20261003T184819Z.json) passed **24/24 tests in five classes**, with 0 failures/errors/skips, on an isolated API-35 emulator with 4096-byte pages. JSON/XML/log hashes were checked. The installed debug/test APKs match this source/build; [Ordinary signed release UI QA](../docs/android/evidence/parity-code5-final/parity-code5-security-signed-profile-qa.json) also passed on exact APK `20e7eb84…`; its scope and screenshots remain separate from debug instrumentation.

The latest signed QA used a **fresh guest with 0 XP and 0/72 equipment** on the isolated emulator. It checked Byte 3D, unknown Aura/Pieces as `—`, six-language menu, French informal copy/reselection and male preference persisted through force-stop/start. Companion was restored and observed; no extra restart followed that restoration. The real Android chooser opened with a new **1080×1440 PNG** and was dismissed without selecting a recipient/app or sending. The [new PNG](../docs/android/evidence/parity-code5-final/parity-code5-security-profile-screens/shared-avatar-card-fr-0xp.png) was inspected: BOBBY is fully visible after the baseline 108→70 fix. Risk remained unaccepted; no AI answer, microphone, audio, authentication or purchase was requested. Signed QA did not measure network traffic, so it makes no absolute no-network claim. Its initial decorative `ASK_TEACH` avatar leads to a possible profile-discovery improvement: the verified pre-consent path is BTC chip → RISK → Profile.

The [earlier signed profile QA](../docs/android/evidence/parity-code5-final/parity-code5-signed-profile-qa.json) belongs to APK `9652c638…` and its retained guest 40 XP. Those migration results stay historical; the latest fresh-guest run does not revalidate them. Physical code-5 acceptance, audio/providers/accounts/payments and Play distribution remain unverified.

[ESLint](../docs/android/evidence/parity-code5-final/parity-code5-eslint-security-final-20261003T184741Z.json) and the [web production build](../docs/android/evidence/parity-code5-final/parity-code5-web-build-security-final-20261003T184741Z.json) passed locally. The public review capsule contains receipts, XML/logs and approved evidence screenshots, not APK/AAB binaries or signing secrets. Its relative links are intended for review in GitHub.

See [the parity matrix](../docs/android/ANDROID-IOS17-PARITY.md) and [the fresh Claude review brief](../docs/android/CLAUDE-REVIEW-BRIEF.md) for the implementation, historical receipts and remaining checks. The physical Seeker installation and inactive Google Play draft are **1.0.2 (3)**. The separate **1.0.3 (4)** build/static validation is historical evidence and does not validate this candidate.

## Product and parity boundaries

- iOS 1.7 reading/onboarding fixes, full synthesis/scenario text, separate sphere/input hints, regional company labels and six languages: English, Spanish, French, Portuguese, Italian and German. French and Portuguese use informal `tu`.
- Native profile, actual equipment/progression, accessible account/privacy actions, mute and companion/female/male voice preference. Unknown account metrics remain unknown. Local previews depend on installed offline voices; an explicitly gendered voice is not guaranteed on every phone.
- Authored risk notice **version 6** with Android on-device dictation disclosure. Exact-version acceptance requires the user to read and accept it again; earlier consent is not silently upgraded.
- Island help can always be reopened. It opens after the first visible eligible visit, once for the guest and once per account; it does not award XP, unlock equipment or publish content.
- `read.rendered` is a fenced, RAM-only presentation observation with an explicit negative server acknowledgment. Canonical backend source accepts telemetry only for iOS/web. Android server `read_done` transport is a remaining gap.
- Avatar sharing produces a **1080 × 1440 PNG from approved 2D companion art and equipped item icons**, using a narrowly scoped FileProvider and the Android share chooser. The profile has the existing interactive 3D stage and pointer-up bounce; the exported card is not a snapshot of that 3D scene.
- Real account, market, saved theses, reports, Google Play/RevenueCat access and restore, opt-in reminders and optional FCM retain their native guards. Runtime authentication, purchases, provider audio, notifications and server synchronization need their own acceptance evidence.

## Build and local configuration

Use JDK 17 or 21, Android SDK platform 36, build-tools 35.0.0 and platform-tools. The Gradle 8.13 wrapper checks its official distribution checksum; AGP 8.13.2 and Kotlin 2.2.21 are pinned. Minimum Android API is 26; target/compile API is 36. Check free disk space before generating artifacts.

Copy `android/local.properties.example` to ignored `android/local.properties` and configure the SDK path and public client values. Keep service-role keys, RevenueCat secret keys, private signing files and passwords out of Git, chat, screenshots and logs. Without public account configuration, debug can show onboarding but cannot establish authentication or purchase acceptance.

From the repository root:

```sh
df -h .
npm ci
node android/nucleo/equipment-stage/build.mjs
python3 android/nucleo/build.py --release
node --test android/nucleo/tests/*.test.mjs
npm run lint -- --quiet
npm run build
cd android
./gradlew :app:assembleDebug :app:testDebugUnitTest :app:assembleDebugAndroidTest :app:lintDebug --no-daemon
./gradlew :app:bundleRelease --no-daemon
```

These are fresh-checkout reproduction commands; the receipts above define what has actually passed. New changes need new receipts. The three public equipment-stage TypeScript inputs are included, and actual local regeneration produced byte-identical bundled assets. Debug APK: `app/build/outputs/apk/debug/app-debug.apk`; bundle: `app/build/outputs/bundle/release/app-release.aab`. A release bundle built without signing configuration is unsigned; the signed code-5 build used the existing authorized local signer, recorded in its receipt. Preserve Bobby's existing upload-key identity; do not regenerate or rotate it. Signing does not establish Google Play distribution or backend readiness.

The Android workflow defines default and optional FCM configurations (`BOBBY_FCM_ENABLED=false/true`), runs `npm ci` and regenerates both viewers. Its failed initial SDK step was corrected to discover executable `sdkmanager` in hosted command-line tools; it pins Ubuntu 24.04 and sets matrix `fail-fast: false`. The [remote code-commit CI receipt](../docs/android/evidence/parity-code5-final/parity-code5-source-commit-ci-20261003T185903Z.json) records **nine completed checks, all SUCCESS**, including native FCM `false` and `true`, contracts and both CodeQL checks, with no CodeQL annotations. It verifies all 362 source blobs against code commit `7dbd1470041d62b3137588043dd551bae2c46f79`; the full-SHA deployment query returned `[]`. This result applies to that code commit. A later documentation/head commit must finish its own checks; do not inherit PR #140 results. The workflow compiles instrumentation without running device tests or publishing artifacts. Default builds have no Firebase Messaging SDK; optional configuration and actual delivery require separate evidence.

The 11 new CodeQL alerts from the initial Android review were addressed in source, rather than attributed to the iOS reference. The equipment generator narrowly replaces the pinned Three 0.182.0 UUID entropy block with Web Crypto and fails on an unreviewed source/version; visual randomness stays unchanged. The card-test selector helper now escapes every regular-expression metacharacter. Five meaningful new Node regressions are included in the 101-test PASS; the fresh code-commit remote CI, including both CodeQL checks, passed with zero annotations. Keep the subsequent PR-head check result separate.

## Device acceptance

The current 24-test run exercised real Activity/WebView and bundled 3D assets, six language choices through actual popup/reload/typing, origin/bridge/account-ledger isolation, local PNG provider, privacy controls, and keyboard fallback when on-device recognition is unavailable. It used guest state and refused network; no real audio, authentication, purchase, push delivery or physical-device claim follows.

Use a dedicated test emulator/device for debug and instrumentation, select its serial explicitly and record its API/page size. Do not replace the signed code-3 Seeker installation with a differently signed debug APK or clear its user data as a routine test step. On a selected test device, run `:app:connectedDebugAndroidTest` with `ANDROID_SERIAL` set to that device. Compiling `assembleDebugAndroidTest` alone does not execute those tests.

Physical checks must cover consent, text input, on-device dictation, audio and cancellation, profile/account isolation, long text in all six languages, Island first visit, sharing, charts and authenticated flows. Request microphone and AI consent through the actual product controls. Dictation uses explicit on-device recognition on supported API 31+ devices; other devices keep keyboard input. A passed mock, local preference or rendered screen does not prove provider delivery, account synchronization, payment/restore or receipt telemetry.

This branch covers Android, its CI/documentation and the necessary root lint/deployment-skip guard adjustments. Keep the stacked review/draft separate from deployment, Play uploads/publication, backend/database changes and legal declarations. Google Play production eligibility and account-specific testing requirements must be checked in the current Console before any later release.
