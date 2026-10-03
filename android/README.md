# Bobby for Android

The Android candidate is **1.1.0 (version code 5)**, on `codex/bobby-android-parity-ios17`, stacked on `claude/feedback-build61` and based on canonical iOS **1.7 (61)** source / [PR #140](https://github.com/anthonysurfermx/Bobby-Agent-Trader/pull/140), commit `bfdc16dfe9ce947f11bbcbd4f447ffc62d0f1e92`. PR #140 is still open; this is a source reference, not proof of an iOS release. Kotlin owns accounts, consent, market data, billing, voice and persistence; the approved bundled HTML/WebGL Núcleo and native Compose sheets present the product. Authentication tokens never enter the web page. Application ID: `xyz.bobbyprotocol.bobby`.

The current [local code-5 build receipt](../docs/android/evidence/parity-code5-final/parity-code5-20261003T181017Z-build.json) is **PASS**: 96 Node tests and 163 JVM tests, with no failures/errors/skips; lint has **0 errors and 59 warnings**. Debug and instrumentation APKs compiled, and the release APK/AAB were built and signed with the existing upload key. This is the default `BOBBY_FCM_ENABLED=false` build. The [360-input source manifest](../docs/android/evidence/parity-code5-final/parity-code5-20261003T181017Z-source.json) has source digest `1bfab4ead58d53cbd51048a1d6c282b44c8c447f96d6c0453e0b3ac78a9403e7`, unchanged during the build. The initial disk-space blocker is resolved.

Independent [final release-artifact validation](../docs/android/evidence/parity-code5-final/parity-code5-final-release-validation.json) is **PASS**: 11 actual tools, APK/AAB signature and identity, 190 packaged assets per artifact, 16 KB alignment/native ELF and the compiled purple-orb icon. This is local static validation; emulator runtime checks are pending their final receipts. Earlier visual checks of the first code-5 APK do not validate the final APK, whose DEX differs. Physical acceptance and Play distribution for code 5 remain unverified. CI configuration is present, but that is not evidence of a completed CI run. Lint warnings still need review.

[ESLint](../docs/android/evidence/parity-code5-final/parity-code5-eslint-final-20261003T181023Z.json) and the [web production build](../docs/android/evidence/parity-code5-final/parity-code5-web-build-final-20261003T181023Z.json) passed locally. The public review capsule contains receipts, XML/logs and approved evidence screenshots, not APK/AAB binaries or signing secrets. Its relative links are intended for review in GitHub.

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

The Android workflow defines default and optional FCM configurations (`BOBBY_FCM_ENABLED=false/true`), installs locked dependencies with `npm ci`, and regenerates both viewers. The code-5 receipt above covers only the default local build. The workflow compiles the instrumentation APK but does not run device instrumentation or publish artifacts. Default builds have no Firebase Messaging SDK; the optional build, real FCM configuration and delivery remain separate checks.

## Device acceptance

Use a dedicated test emulator/device for debug and instrumentation, select its serial explicitly and record its API/page size. Do not replace the signed code-3 Seeker installation with a differently signed debug APK or clear its user data as a routine test step. On a selected test device, run `:app:connectedDebugAndroidTest` with `ANDROID_SERIAL` set to that device. Compiling `assembleDebugAndroidTest` alone does not execute those tests.

Physical checks must cover consent, text input, on-device dictation, audio and cancellation, profile/account isolation, long text in all six languages, Island first visit, sharing, charts and authenticated flows. Request microphone and AI consent through the actual product controls. Dictation uses explicit on-device recognition on supported API 31+ devices; other devices keep keyboard input. A passed mock, local preference or rendered screen does not prove provider delivery, account synchronization, payment/restore or receipt telemetry.

This branch covers Android, its CI/documentation and the necessary root lint/deployment-skip guard adjustments. Keep the stacked review/draft separate from deployment, Play uploads/publication, backend/database changes and legal declarations. Google Play production eligibility and account-specific testing requirements must be checked in the current Console before any later release.
