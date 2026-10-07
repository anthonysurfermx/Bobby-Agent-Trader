# Bobby for Android

The native Android app (`xyz.bobbyprotocol.bobby`). Kotlin owns accounts, consent, market data, billing, voice and persistence; the bundled HTML/WebGL Núcleo page and native Compose sheets present the product. Authentication tokens never enter the web page.

The source is at **1.2.0 (code 10)**, Bobby 1.8, described in the next section. Everything from "Earlier candidate: 1.1.1" down is the record of earlier candidates, kept as it was written (only two headings were renamed so that none of them says "latest").

## Bobby 1.8 for Android: version 1.2.0 (code 10)

`app/build.gradle.kts` is at **1.2.0 (10)**. Phones have **1.1.4 (9)**. 1.2.0 is Bobby 1.8 for Android, a port of iOS 1.8 (`ios/Bobby/Sources/V18/`, design law `ios/Bobby/V18-DESIGN.md`): the same rules, limits, ids and words, in six languages. **Nothing of 1.2.0 has been built for release, installed on a phone or an emulator, or published.**

### What a person gets

- **One line on the glass.** The main screen can show one native-written line and one button. A line shows twice, rests seven days, shows four times at most and is gone for good once tapped; after any tap nothing else speaks for fifteen minutes; nothing shows before the risk notice, under a sheet, or while Bobby listens, thinks or speaks. Each feature below speaks through it, one at a time, by priority.
- **Credits** (profile row, which says the balance in one line, for example "7 of 10 reads · 3 gifted"). Quick, Deep and Max with what is left and when it comes back, gifted reads, Bobby Pro with its real state, Restore purchases with a sentence for every outcome, Manage subscription where a store bills the plan, and the doors to invitations and codes. A number the app does not have is not shown.
- **Invitations.** A person's own code and link to share, a field for a friend's code, and what the server answered. A link that opens the app is kept for 30 days and claimed once there is an account and an accepted risk notice (see "What the owner still owes").
- **My theses.** Write why you are looking at an asset (three active at most, 280 characters, saved on this phone only), come back to it, and ask Bobby to review it against dated price evidence. A review costs one read and says so before it starts; the line that says where the words go sits directly above the button.
- **Memory.** One consent screen ("Remember this?") that says what is kept, what is sent and for how long, then two answers of equal weight. The Memory screen shows what the account remembers and what this phone keeps, with Forget per asset and Delete everything.
- **Reminders.** "On that day, remind me to review this thesis": three presets or a chosen day and time. The phone is asked for notification permission only when a reminder button is tapped. The notification says "Your reminder to review a thesis." and nothing about the asset.
- **Follow-ups.** After a read Bobby may offer to come back to it. On a yes it plans, on this phone only, the asset the next day, its sector the day after and the week on the next Monday, then goes quiet. The switch is in Reminders.

### What changes for people who update from 1.1.4

- The profile loses six rows that now live behind **Credits**: reads left, gifted reads, Bobby Pro, Restore purchases, Invite friends, Redeem a code. Every other row is where it was.
- The old Memory switch "Remember questions from this device" had no consent text. A switch that is on without an accepted consent is **turned off** at first launch of 1.2.0, and the account is offered memory again, exactly as iOS 1.8 did with its 1.7 switch.
- "Clear" in Memory removes the stored shortcuts and the glass goes back to its default tickers (BTC, NVDA, ETH). The default row is never listed as something the person kept.
- No stored key changed its meaning. New data lives in the preferences file `bobby.v18` (theses, nudge history, consent record, reminders, follow-ups, a waiting invitation) and in `bobby.v18.notices` (what the phone will still show). Account deletion removes that account's part of it. A waiting invitation code belongs to the phone, not to an account, and expires after 30 days.

### Where it lives

- `v18/V18Host.kt` is the one interface a feature uses to reach the app; `v18/V18Runtime.kt` implements it over the session (`V18Desk`) and the activity (`V18Shell`), with no Android classes. Unit tests build the same runtime over the fakes in `app/src/test/java/…/v18/V18TestKit.kt`.
- One package per feature under `v18/`: `credits`, `invite`, `theses`, `memory`, `reminders`, `harness` (the follow-ups). `v18/V18.kt` registers them and holds the few lines where one feature tells another something.
- The page's side: `session.nudge` in every session state, the bridge methods `nudge.seen` and `nudge.act`, and the event `ask.start`. The page may open exactly what 1.1.4 could (`V18Routes.PAGE_OPENABLE`); the seven 1.8 routes are native-only.
- Screens: `ui/v18/V18Sheets.kt` draws each route from its own file, built with `ui/v18/QuietKit.kt` (nothing green: a colour means a verdict only). The 1.1.4 routes `memory` and `invite` are drawn by the 1.8 screens; `ui/BobbySheet.kt` no longer has them.
- Local notices: `v18/notify/LocalNotifier.kt` and `platform/AndroidLocalNotifier.kt`. WorkManager one-time work, two channels (`thesis-reminders`, `follow-ups`), no exact alarms, no boot receiver, no new permission.
- Words: `python3 android/tools/build-v18-translations.py` merges every iOS 1.8 translation row into `assets/nucleo/native-android-translations.json`, sorted (`--check` verifies). Rows that name an iPhone, an Apple Account or the App Store are replaced by the Android wording in `android/tools/v18-android-wording.json`. To add a string iOS does not have, add its row to the JSON and run the script.

### Notifications on a phone that runs late

WorkManager is inexact. An idle phone can run planned work hours after its moment, and a phone that was off runs what it missed when it comes back. So a notice says what it asks of a late phone (`LocalNotice.Delivery`), and the worker asks `NoticeTiming` before showing anything:

- A **follow-up** is shown only between 09:00 and 21:00 on the phone's clock, with 15 minutes of grace after 21:00 because 21:00 is itself a moment follow-ups are planned for. Outside those hours it stays pending and the same work is queued again for the next 09:00. More than 24 hours late it is dropped unseen; the same line already waits on the glass.
- A **thesis reminder** is shown whenever the phone gets to it, however late: the person chose the day.
- A notice is shown only to the reader it was planned for, only while the risk notice stands, and not at all while the app is in front and the glass already says it.

The decision is a pure function with unit tests. That WorkManager carries it out (the wait, the re-queue, the drop) was never seen on a device. No copy promises a minute.

### What the owner still owes: App Links

The manifest declares an App Links filter (`autoVerify`) for `https://bobbyprotocol.xyz/i/*` and `www.bobbyprotocol.xyz/i/*`. Android only hands those links to the app once the site vouches for it, and today it does not: `public/.well-known/assetlinks.json` names the old TWA package `xyz.bobbyprotocol.app` with the placeholder `REPLACE_WITH_PLAY_APP_SIGNING_SHA256`.

1. In Play Console, App integrity, copy the **app signing key certificate** SHA-256 (and the upload key's, if internal or sideloaded builds should verify too).
2. Add an entry to `public/.well-known/assetlinks.json` for the package `xyz.bobbyprotocol.bobby` with that fingerprint, and deploy the site. The repository's secret scanner has taken SHA-256 digests for keys before: expect to allow-list it.
3. On a phone with the Play build: `adb shell pm get-app-links xyz.bobbyprotocol.bobby` should say `verified` for both hosts; then tap an invitation link.

Until then an invitation link opens the browser, where the page shows the code; the invite screen has a field to type it into.

Also open and the owner's call: `GET /api/bobby-access` reports no Google payments yet, so the app cannot sell Bobby Pro on Android and, following the iOS rule (promise Pro only where it can be bought in this build), the invite screen shows no reward sentence. The server still grants the inviter their Pro days.

### What is verified, and what is not

**Verified by CI on every push** (GitHub Actions `Android`, the two `native` jobs: Firebase messaging off and on): the pages build from source, 105 Node tests, `:app:assembleDebug`, `:app:testDebugUnitTest`, `:app:assembleDebugAndroidTest` (the instrumented tests are compiled, **not run**) and `:app:lintDebug`. The JVM unit tests port the iOS 1.8 suites case by case, except the cases that need an iOS review fixture or a running Android device, and add the Android-only ones (inexact delivery, the reader tag, sign-in in a browser tab). The page tests also check that every native string resolves in six languages and that every iOS 1.8 translation row is in the Android catalog.

**Never run on a phone or an emulator**, so unverified:

- How any 1.8 screen draws: layout at half height, the keyboard with a pinned action, 200% font scale, TalkBack order, the Material date and time pickers in the sheet's inks, one sheet handing over to another.
- The notification permission prompt, WorkManager delivery, the two channels, the tap reaching the right screen, the waiting and dropping of a late follow-up, "Open Settings".
- Sign-in from a 1.8 sheet: the activity closes the open sheet when the account arrives and the sheet is presented again (`SignInReturn`). Read and unit-tested, never seen.
- Restore against the real RevenueCat SDK and Google Play; a purchase; the claim of an invitation against the server; the memory opt-in header on a real request.
- App Links (see above).

**Never built:** a release. CI builds debug only, so R8 and resource shrinking never ran on the 1.8 classes. No signed APK or AAB of 1.2.0 exists, and nothing was uploaded to Play.

**Not reviewed by a native speaker:** the Android wording of the 18 rows that named Apple hardware or stores on iOS, and three Memory rows, in French, Portuguese, Italian and German.

## Earlier candidate: 1.1.1 (code 6)

The Android candidate is **1.1.1 (version code 6)**, on `codex/bobby-android-parity-ios17`, with [draft Android PR #141](https://github.com/anthonysurfermx/Bobby-Agent-Trader/pull/141), stacked on `claude/feedback-build61` and based on canonical iOS **1.7 (61)** source / [PR #140](https://github.com/anthonysurfermx/Bobby-Agent-Trader/pull/140), commit `bfdc16dfe9ce947f11bbcbd4f447ffc62d0f1e92`. PR #140 is still open; this is a source reference, not proof of an iOS release. Kotlin owns accounts, consent, market data, billing, voice and persistence; the approved bundled HTML/WebGL Núcleo and native Compose sheets present the product. Authentication tokens never enter the web page. Application ID: `xyz.bobbyprotocol.bobby`.

## Earlier candidate: Trader Land correction, code 6

A physical Seeker user reported that Trader Land in code 5 looked like coordinates and many dots, with the island dimension missing. The cause was native `LandMap`: a Cartesian table of 48 dp boxes, with each sprite drawn only in its first cell and `·` in the remaining footprint. Canonical iOS 1.7 (61) uses an isometric Canvas and sprites; this is a rendering defect, not a different 3D library.

Code 6 replaces that table with a responsive native Compose Canvas. `TraderLandProjection.kt` uses the canonical isometric geometry, constant slab extent for 8/10/12/16, exact anchors/content bounds for **28 bundled sprite states**, one sprite per placement and depth order. The existing PNGs, JSON/collision helpers, account fences and explicit actions are preserved. Painting and tap selection share the same inverse camera transform. Pan limits follow the rendered 860×720 extent at the current zoom, so all four slab corners remain reachable at maximum zoom; both zoom buttons clamp stale pan on zoom-out. Nonfinite hit coordinates return no cell. Editable cells retain custom accessibility actions; zoom/fit labels support all six languages. **All 10 new JVM regressions passed within the actual 173-test code-6 run.**

The responsive camera uses canvas 860×720 and center 430/360, compared with iOS fit 830×640 and center 430/335. Core animation, detailed shadows/rim and archipelago flights remain aesthetic differences. Isometric art gives depth but does not establish a realtime 3D scene or full visual parity.

| Code-6 check | Current status | Next evidence |
| --- | --- | --- |
| Source | 364 inputs; digest `4000f0aa35575b646c4c270728934ba61cdbc0b4e1e140106ba90efe0673f611`, unchanged during the build. | [Code-6 manifest](../docs/android/evidence/parity-code6-traderland-final/parity-code6-traderland-20261003T200103Z-source.json). |
| Build/Node/JVM/lint/APK/AAB | PASS: 101 Node, 173 JVM; 0 failures/errors/skips; lint 0 errors/59 warnings, FCM false; debug/test/release compiled. | [Actual build](../docs/android/evidence/parity-code6-traderland-final/parity-code6-traderland-20261003T200103Z-build.json), current signed hashes below. |
| Static release validation | PASS: 11 tools, 190 assets, 28 canonical art states/anchors, native ELF alignment, purple orb and full AAB payload signatures. | [Code-6 static receipt](../docs/android/evidence/parity-code6-traderland-final/parity-code6-traderland-20261003T200229043433Z-release-validation.json); runtime/Play remain separate. |
| Debug instrumentation | Actual code6 PASS: 24/24, five classes, 0 failures/errors/skips; isolated AOSP API35/4096 guest/refused network. | [Current receipt](../docs/android/evidence/parity-code6-traderland-final/parity-code6-traderland-instrumentation-20261003T200427Z.json), exact installed debug/test hashes; general regression, not 24 map tests. |
| Signed Seeker map QA | Exact code-6 installation/launch PASS, API36/4096; subsequent map QA is blocked by the phone lock screen. | [Install receipt](../docs/android/evidence/parity-code6-traderland-final/seeker-code6-signed-install-20261003T200309399230Z.json); next actual island/zoom/pan evidence. |
| Remote CI | Pending the code-6 commit. | Check its exact head; final result will be recorded in PR description/handoff after checks, without a documentation commit loop. |
| Claude CLI handoff | Code-5 text delivered and a real response received; new code-6 delivery after the commit is pending. | Final brief/handoff will state the actual CI and remaining QA limits. |

Latest signed release APK: **47,058,496 bytes**, SHA-256 `94d731063348452a9558069b0e0888593ab2bfce2d8e16c8432be3cd416b39c1`. AAB: **50,360,495 bytes**, SHA-256 `6c5668280656eec0365759023b487b92d10dc2e85494a7eea9199a3c294743b6`. Both are code 6 / 1.1.1. Independent [static validation](../docs/android/evidence/parity-code6-traderland-final/parity-code6-traderland-20261003T200229043433Z-release-validation.json) is PASS, receipt SHA `a171a20a28e566f74a9bd6db70f38f96551e957799b69e5a393fc12c8644ee70`. The 11 actual tool logs were checked by hash. This does not prove Compose/GPU gestures, Play App Signing or 16 KB device runtime. [ESLint](../docs/android/evidence/parity-code6-traderland-final/parity-code6-traderland-eslint-security-final-20261003T195653Z.json) (`--quiet`) and [production web build](../docs/android/evidence/parity-code6-traderland-final/parity-code6-traderland-web-build-security-final-20261003T195653Z.json) passed locally without deployment. Compiling the test APK does not execute instrumentation: the first isolated emulator restart failed due to disk space; after scoped cache cleanup the new isolated emulator booted and the actual code-6 24-test suite passed; the old code-5 24/24 run is historical.

Actual [code-6 debug instrumentation](../docs/android/evidence/parity-code6-traderland-final/parity-code6-traderland-instrumentation-20261003T200427Z.json), receipt SHA `edbf70e51c29a3d66259584f104ebcfd32ef53d53904999102f5e8cdf738f0d1`, finished **24/24 PASS**, five classes and 0 failures/errors/skips. [XML](../docs/android/evidence/parity-code6-traderland-final/parity-code6-traderland-instrumentation-20261003T200427Z.xml) was recounted and [log](../docs/android/evidence/parity-code6-traderland-final/parity-code6-traderland-instrumentation-20261003T200427Z.log) checked by hash. Exact installed debug APK SHA `0039c3ddb06317122a3a7cedb04f413269233253debc7d33f55ecc95c1827e28` and test APK `3ade491f3ec2cdfae97321000727189b0dd8b51f7dd37b084bae2a8a52436331`, unchanged source `4000f0aa…`, isolated AOSP API35/4096, guest/refused network. This covers general Activity/bridge/3D/languages/ledger/privacy/keyboard/candle/local-PNG regressions, **not 24 map tests**. Map geometry has the separate 10 JVM PASS; actual isometric appearance/gestures on the locked Seeker, accounts, audio/providers/payments, push, 16 KB hardware and Play remain unverified.

The first code-6 build had **172/173 JVM PASS and one failed assertion**: Kotlin data-class equality distinguished positive/negative float zero. Only the test changed to numeric coordinate equality with delta 0; geometry/pan are unchanged, all ten tests remain and none are skipped. The failed receipt/XML remain historical; the fresh 20:01:03 UTC build passed all 173 JVM tests.

The public capsule `docs/android/evidence/parity-code6-traderland-final/` has been copied: [index](../docs/android/evidence/parity-code6-traderland-final/INDEX.json), build/source/XML/logs, ESLint/web/static and phone-install receipts. Links now resolve. The index remains mutable until the single review commit; the actual final code-6 instrumentation JSON/XML/log have been added. Physical phone map QA and CI still need their own results. No APK/AAB binaries, private identifiers or signing material belong in that capsule.

The Seeker first received signed code 5, then **1.1.1 (6)** was installed: [actual code-6 receipt](../docs/android/evidence/parity-code6-traderland-final/seeker-code6-signed-install-20261003T200309399230Z.json), SHA `ed6872e540c9568e06434def362cdb2fc183f40b434778e75fd1e733276e8865`. API36/4096, real installed APK `94d731…`/47,058,496 bytes and real version1.1.1/6 match; launch-wait/focus/resume passed. No wipe, permission grants, preferences or AI consent were injected. This proves installation/launch, with **map UI acceptance pending because the subsequent QA attempt found Keyguard showing (phone locked)**. The install receipt recorded focus/resume at installation time; no later map screenshot or gesture is claimed. The earlier human map report is **FAIL for code-5 Trader Land presentation**, preserved with its install receipt `seeker-code5-signed-install-20261003T194233057699Z.json`. Google Play's last verified inactive draft remains **1.0.2 (3)**.

## Historical code-5 validation

The evidence below belongs to **1.1.0 (5)** only. Its build/static PASS, 24-test instrumentation and scoped profile QA do not validate the new code-6 map, artifacts or physical flows.

The historical [local code-5 build receipt](../docs/android/evidence/parity-code5-final/parity-code5-20261003T184654Z-build.json) is **PASS**: 101 Node tests and 163 JVM tests, with no failures/errors/skips; lint has **0 errors and 59 warnings**. Debug and instrumentation APKs compiled, and the release APK/AAB were built and signed with the existing upload key. This is the default `BOBBY_FCM_ENABLED=false` build. The [362-input source manifest](../docs/android/evidence/parity-code5-final/parity-code5-20261003T184654Z-source.json) has digest `d37effbf75ac707415ced82ab01f8f69d1e4aa04c4d29aeecdfb51faf03a17ca`, unchanged during the build. Release APK SHA-256: `20e7eb849105b81ab53bc9bbe8eb25e851781665443ef59b69b7a0a572c567ec` (47,042,112 bytes); AAB: `0ec118b0d790e8b04faaaa8c77d3aa93ede6919e6f7f0491a96b314154cbc648` (50,341,132 bytes). The initial disk-space blocker is resolved.

Independent [security-candidate release validation](../docs/android/evidence/parity-code5-final/parity-code5-security-release-validation.json) is **PASS**: 11 actual tools, APK/AAB signature and identity, 190 source-bound packaged assets per artifact, 16 KB alignment/native ELF and the compiled purple-orb icon. Six assets deliberately changed from code 4; approved art/models and native libraries remain preserved. This is local static validation. [Historical code-5 debug instrumentation](../docs/android/evidence/parity-code5-final/parity-code5-instrumentation-20261003T184819Z.json) passed **24/24 tests in five classes**, with 0 failures/errors/skips, on an isolated API-35 emulator with 4096-byte pages. JSON/XML/log hashes were checked. The installed debug/test APKs match this source/build; [Ordinary signed release UI QA](../docs/android/evidence/parity-code5-final/parity-code5-security-signed-profile-qa.json) also passed on exact APK `20e7eb84…`; its scope and screenshots remain separate from debug instrumentation.

The historical code-5 signed QA used a **fresh guest with 0 XP and 0/72 equipment** on the isolated emulator. It checked Byte 3D, unknown Aura/Pieces as `—`, six-language menu, French informal copy/reselection and male preference persisted through force-stop/start. Companion was restored and observed; no extra restart followed that restoration. The real Android chooser opened with a new **1080×1440 PNG** and was dismissed without selecting a recipient/app or sending. The [new PNG](../docs/android/evidence/parity-code5-final/parity-code5-security-profile-screens/shared-avatar-card-fr-0xp.png) was inspected: BOBBY is fully visible after the baseline 108→70 fix. Risk remained unaccepted; no AI answer, microphone, audio, authentication or purchase was requested. Signed QA did not measure network traffic, so it makes no absolute no-network claim. Its initial decorative `ASK_TEACH` avatar leads to a possible profile-discovery improvement: the verified pre-consent path is BTC chip → RISK → Profile.

The [earlier signed profile QA](../docs/android/evidence/parity-code5-final/parity-code5-signed-profile-qa.json) belongs to APK `9652c638…` and its retained guest 40 XP. Those migration results stay historical; the code-5 fresh-guest run does not revalidate them. Code-5 installation/launch is now verified separately; the user reported its Trader Land map defect. Audio/providers/accounts/payments and Play distribution remain unverified.

[ESLint](../docs/android/evidence/parity-code5-final/parity-code5-eslint-security-final-20261003T184741Z.json) and the [web production build](../docs/android/evidence/parity-code5-final/parity-code5-web-build-security-final-20261003T184741Z.json) passed locally. The public review capsule contains receipts, XML/logs and approved evidence screenshots, not APK/AAB binaries or signing secrets. Its relative links are intended for review in GitHub.

See [the parity matrix](../docs/android/ANDROID-IOS17-PARITY.md) and [the fresh Claude review brief](../docs/android/CLAUDE-REVIEW-BRIEF.md) for the implementation, historical receipts and remaining checks. The physical Seeker installation last verified here is **1.1.1 (6)**; code-6 map UI QA is pending and the code-5 defect remains historical; the inactive Google Play draft is still **1.0.2 (3)**. The separate **1.0.3 (4)** build/static validation is historical evidence and does not validate this candidate.

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

The Android workflow defines default and optional FCM configurations (`BOBBY_FCM_ENABLED=false/true`), runs `npm ci` and regenerates both viewers. Its failed initial SDK step was corrected to discover executable `sdkmanager` in hosted command-line tools; it pins Ubuntu 24.04 and sets matrix `fail-fast: false`. The [remote code-commit CI receipt](../docs/android/evidence/parity-code5-final/parity-code5-source-commit-ci-20261003T185903Z.json) records **nine completed checks, all SUCCESS**, including native FCM `false` and `true`, contracts and both CodeQL checks, with no CodeQL annotations. It verifies all 362 source blobs against code commit `7dbd1470041d62b3137588043dd551bae2c46f79`; the full-SHA deployment query returned `[]`. This result applies to that code commit. Code-5 head `1b6c58ed4a108f0b6a4346367f487ab222e3fd1f` also completed nine SUCCESS checks (local historical head receipt), with zero CodeQL finding annotations and four retained infrastructure annotations in the workflow job; code 6 must finish its own checks; do not inherit PR #140 results. The workflow compiles instrumentation without running device tests or publishing artifacts. Default builds have no Firebase Messaging SDK; optional configuration and actual delivery require separate evidence.

The 11 new CodeQL alerts from the initial Android review were addressed in source, rather than attributed to the iOS reference. The equipment generator narrowly replaces the pinned Three 0.182.0 UUID entropy block with Web Crypto and fails on an unreviewed source/version; visual randomness stays unchanged. The card-test selector helper now escapes every regular-expression metacharacter. Five meaningful new Node regressions are included in the 101-test PASS; the fresh code-commit remote CI, including both CodeQL checks, passed with zero annotations. Keep the subsequent PR-head check result separate.

## Device acceptance

The historical code-5 24-test run exercised real Activity/WebView and bundled 3D assets, six language choices through actual popup/reload/typing, origin/bridge/account-ledger isolation, local PNG provider, privacy controls, and keyboard fallback when on-device recognition is unavailable. It used guest state and refused network; no real audio, authentication, purchase, push delivery or physical-device claim follows.

Use a dedicated test emulator/device for debug and instrumentation, select its serial explicitly and record its API/page size. Do not replace the signed Seeker installation with a differently signed debug APK or clear its user data as a routine test step. On a selected test device, run `:app:connectedDebugAndroidTest` with `ANDROID_SERIAL` set to that device. Compiling `assembleDebugAndroidTest` alone does not execute those tests.

Physical checks must cover consent, text input, on-device dictation, audio and cancellation, profile/account isolation, long text in all six languages, Island first visit, sharing, charts and authenticated flows. Request microphone and AI consent through the actual product controls. Dictation uses explicit on-device recognition on supported API 31+ devices; other devices keep keyboard input. A passed mock, local preference or rendered screen does not prove provider delivery, account synchronization, payment/restore or receipt telemetry.

This branch covers Android, its CI/documentation and the necessary root lint/deployment-skip guard adjustments. Keep the stacked review/draft separate from deployment, Play uploads/publication, backend/database changes and legal declarations. Google Play production eligibility and account-specific testing requirements must be checked in the current Console before any later release.

Public evidence note (code 6): `evidence/parity-code6-traderland-final/REDACTIONS.json` binds the public apksigner extract to its original coordinator log. Only its public-key SHA-256/SHA-1 digest values are omitted because Gitleaks misidentified them as API keys. The approved certificate fingerprint and signature results remain visible; all other tool logs are unmodified. The original validator log hashes apply to the retained originals, and INDEX records the public extract hash. No security rule is disabled.
