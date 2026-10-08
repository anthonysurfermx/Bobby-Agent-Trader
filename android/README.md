# Bobby for Android

The native Android app (`xyz.bobbyprotocol.bobby`). Kotlin owns accounts, consent, market data, billing, voice and persistence; the bundled HTML/WebGL Núcleo page and native Compose sheets present the product. Authentication tokens never enter the web page.

The source is at **1.2.0 (code 10)**, Bobby 1.8, described in the next section. Everything from "Earlier candidate: 1.1.1" down is the record of earlier candidates, kept as it was written (only two headings were renamed so that none of them says "latest").

## Bobby 1.8 for Android: version 1.2.0 (code 10)

`app/build.gradle.kts` is at **1.2.0 (10)**. Phones have **1.1.4 (9)**. 1.2.0 is Bobby 1.8 for Android, a port of iOS 1.8 (`ios/Bobby/Sources/V18/`, design law `ios/Bobby/V18-DESIGN.md`): the same rules, limits, ids and words, in six languages. **Nothing of 1.2.0 has been built for release, installed on a real phone, or published.** A debug build runs on CI's emulator (see "What is verified, and what is not").

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
- The shortcut row stays on the phone. 1.1.4 put it in the profile it posts to `/api/progress` and took the server's row back; 1.2.0 does neither, as iOS never did, because Memory tells the person the shortcuts are kept "on this phone, not on its servers". Nothing is lost by it: the server has refused every Android profile sync since 1.1.4 (see "What the server still owes Android").
- The activity is one instance (`singleTask`) and is no longer rebuilt for a rotation, a fold, split screen, the system's font size or its dark theme (`configChanges`). Before, any of those closed the open sheet, dropped a thesis being typed without asking and cancelled a review that had already been sent.
- No stored key changed its meaning. New data lives in the preferences file `bobby.v18` (theses, nudge history, consent record, reminders, follow-ups, a waiting invitation) and in `bobby.v18.notices` (what the phone will still show). Deleting the account **on this phone** removes that account's part of it. An account deleted from another device is only signed out here: its theses, follow-up notes and nudge history stay on this phone, out of reach, until the app's storage is cleared (the phone cannot tell a deleted account from a revoked session; iOS has the same limit). A waiting invitation code belongs to the phone, not to an account, and expires after 30 days.

### What the phone keeps, and what it sends

Kept on the phone only, per reader (the account, or the signed-out phone):

- The theses a person wrote, and the shortcut row. Listed under Memory › On this phone.
- **What the follow-ups noted.** From the first delivered read, before any yes to follow-ups, the phone notes each asset asked about: its symbol, its name, the price at that moment and when (never the question), plus when the app was opened. Up to 300 events, 60 days. This is the iOS rule, and it is what lets "Shall I keep you posted on NVDA?" start from the question just asked. On Android it is listed under Memory › On this phone ("Assets you asked about, kept for follow-ups") with its own **Clear**, which works signed out and without having decided anything. Turning follow-ups off, "Delete everything" and withdrawing the risk notice erase it too.
- The history of what the glass said (so that "never again" holds). The ids of a memory receipt and of a "since you asked" line carry the asset; they are removed when the memory or the follow-up notes they were about are erased.

Sent by 1.8, all after the risk notice is accepted (nothing before it):

| When | Request |
|---|---|
| The activity starts | `GET /api/bobby-access` (a guest too); `GET /api/briefing-settings` for an account; `POST /api/voice-tool` `get_market` for one asset, when the person asked about it at least 20 hours ago and follow-ups are not off (they need not be on); `POST /api/bobby-access` `referral-claim` when an invitation code is waiting and an account is signed in |
| A read is delivered | `GET /api/bobby-access` |
| A thesis review ends, finished or refused | `GET /api/bobby-access` |
| The app comes back to the front | `bobby-access` when the last answer is older than 15 minutes; `briefing-settings` when older than 5; `get_market` when an asset is due and its price is older than 10 minutes; the invitation claim again, one minute after an attempt that could not be settled |
| A follow-up board opens | One `get_market` per row (five or six), none of them a read |
| A thesis review, on the person's tap | `POST /api/desk-debate` with the thesis text, for that one request |

Nothing polls. A rotation no longer repeats the first row (the activity is not rebuilt).

### Where it lives

- `v18/V18Host.kt` is the one interface a feature uses to reach the app; `v18/V18Runtime.kt` implements it over the session (`V18Desk`) and the activity (`V18Shell`), with no Android classes. Unit tests build the same runtime over the fakes in `app/src/sharedTest/java/…/v18/V18TestKit.kt`, and the instrumented tests draw the real screens over them.
- One package per feature under `v18/`: `credits`, `invite`, `theses`, `memory`, `reminders`, `harness` (the follow-ups). `v18/V18.kt` registers them and holds the few lines where one feature tells another something.
- The page's side: `session.nudge` in every session state, the bridge methods `nudge.seen` and `nudge.act`, and the event `ask.start`. The page may open exactly what 1.1.4 could (`V18Routes.PAGE_OPENABLE`); the seven 1.8 routes are native-only.
- Screens: `ui/v18/V18Sheets.kt` draws each route from its own file, built with `ui/v18/QuietKit.kt` (nothing green: a colour means a verdict only). The 1.1.4 routes `memory` and `invite` are drawn by the 1.8 screens; `ui/BobbySheet.kt` no longer has them.
- Local notices: `v18/notify/LocalNotifier.kt` and `platform/AndroidLocalNotifier.kt`. WorkManager one-time work, two channels (`thesis-reminders`, `follow-ups`), no exact alarms, no boot receiver, no new permission.
- Words: `python3 android/tools/build-v18-translations.py` merges every iOS 1.8 translation row into `assets/nucleo/native-android-translations.json`, sorted (`--check` verifies). Rows that name an iPhone, an Apple Account or the App Store are replaced by the Android wording in `android/tools/v18-android-wording.json`. To add a string iOS does not have, add its row to the JSON and run the script.

### Notifications on a phone that runs late

WorkManager is inexact. An idle phone can run planned work hours after its moment, and a phone that was off runs what it missed when it comes back. So a notice says what it asks of a late phone (`LocalNotice.Delivery`), and the worker asks `NoticeTiming` before showing anything:

- A **follow-up** is shown only between 09:00 and 21:00 on the phone's clock. Outside those hours it stays pending and the same work is queued again for the next 09:00. One exception: a follow-up that runs on time (within 15 minutes of its own moment) is shown even if the clock has just passed 21:00, because 21:00 sharp is itself a moment follow-ups are planned for and no phone runs work on the dot. More than 24 hours late it is dropped unseen; the same line already waits on the glass.
- A **thesis reminder** is shown whenever the phone gets to it, however late: the person chose the day.
- A notice is shown only to the reader it was planned for, only while the risk notice stands, and not at all while the app is in front and the glass already says it.

The decision is a pure function with unit tests. On CI's emulator a due notice is posted by WorkManager and its tap opens the right sheet (`V18DeviceInstrumentedTest`); the wait, the re-queue and the drop were never seen on a device. No copy promises a minute.

### The next question, and who wrote the words (follow-ups slice 1, step 1 of 3)

Ported from the iPhone (`ios/Bobby/Nucleo/ARCHITECTURE.md` §3.5, commits `630e01b3`, `37155fe0` and the native half of `cb784a0d`). This step is the page and the bridge. The planner (one follow-up chain per question the person asked, then stop) and the surface (lock screen, Stop, the wall, the notes on Memory) are steps 2 and 3 and are **not in this step**. Nothing below was seen on a phone: the page cases run in Node over the Android transport, the Kotlin cases on the JVM, and one case on CI's emulator asks the real session through the real bridge (`NucleoBridgeInstrumentedTest`: the row's `own` marks, no `oneTap` key, a misused `chip` refused, a chip's question asked like any other). The row itself was never drawn in a WebView under a test.

**What a person sees.** One second after Bobby's voice ends, the last spoken line gives way to a row of at most three chips, with no save needed (before, chips came only after a save):

1. The next question Bobby's CIO wrote for this read (`synthesis.followUp`), on one line or two, when it passes every check on the phone.
2. "Another question about NVDA": opens the keyboard for the person's own words.
3. One asset of theirs ("How is BTC looking?"); two when there is no CIO question.

The same row comes back behind the nudge after a save. A CIO question that fails a check is silently replaced by the fixed row; nothing says why.

**The checks** live in the page's read model (`android/nucleo/src/shared/20-read-model.js`, `nextQuestion(text, symbol, lang, asked)`): `missing`, `long` (90 code points), `number` (any digit outside the asset's own ticker, a currency sign, a percent, a price in words), `shape` (one sentence ending in its question mark), `opener` (what / why / which in the reply's language), `act` (whether or when to act, dressed as a what or a why), `word` (the one forbidden list in six languages, with the claims Bobby never makes about itself) and `same` (the question the read just answered). `fitNext()` drops a question that would need a third line. A page test pins this block and `followUps()` to the iPhone's copy, character for character, so the list is never forked.

**Whose words** (`nucleo/NucleoAsk.kt`, `v18/V18Wire.kt` `ReadOrigin`). The page asks in four ways and native tells them apart:

| The page sends | Who wrote the words | `ReadOrigin` | Level |
|---|---|---|---|
| `ask {question}` (typed or spoken) | the person | `PERSON` | the one they saved |
| `ask {question, chip: true}` (an asset chip of the home, an asset or a mover of the row, an example of the first question) | Bobby; the person picked the asset | `CHIP` | the one they saved |
| `ask {followUpOf, question}` with the words that read offered | Bobby's CIO | `FOLLOW_UP` | Quick, whatever is saved |
| `ask {followUpOf, question}` with any other words | the person, about the read on screen | `THREAD` | the one they saved |
| `ask {token}` after `ask.start` (a follow-up's button, a board row) | Bobby | `FOLLOW_UP` | Quick, whatever is saved |

The origin rides every token that carries a read on (a confirmation, a retry, a level fallback, the question waiting behind a sign-in: `nucleo/ReadTokens.kt`) and reaches the features in `ReadSummary.origin` (`V18Host.onReadDelivered`). A pick of the CIO's question is recognised by native comparing the tapped words with what it sent for that read (white space apart) and is told by asset through `V18Host.onNextQuestionPicked`; the words are kept nowhere. Today the follow-ups still treat every delivered read alike: step 2 uses the origin.

**Whose assets.** `suggestions().quickAccess[]` entries carry `own`: true for an asset the person asked about, false for a default ticker that only pads the row. A read Bobby started (a follow-up, a board row, a restored page) ends on their own question and their own assets only: no mover, no starter. iOS reads this from its watchlist; Android's stored row has always carried the default tickers along, so a new key beside it, `quickAccessAsked` in the reader's blob of `bobby.nucleo`, keeps the symbols really asked about. It leaves with the row ("Clear the shortcuts", "Delete everything", Forget). A row stored by 1.1.4 or 1.2.0 has no such key: there a symbol that is not a default ticker counts as theirs, and a default ticker does not until it is asked about again. One visible consequence: a person whose first question is about BTC now sees the row (BTC, NVDA, ETH) under Memory › On this phone, because the phone noted that they asked.

**At the wall.** One seam, `V18Host.oneTap` (`OneTapRule`): "may Bobby offer a question that asks by itself?", asked once per read with that read's access receipt (`afterRead`) and for the idle home (`onHome`). On a no after a read the CIO's question does not travel and the reply says `oneTap: false` (the row is "Another question" alone); on a no at home the session says `oneTap: false` and the home draws no asset chip. **The rule answers yes for now** (`OneTapRule.ALWAYS`): step 3 sets it from the read meter. Until then a tap on a one-tap chip can still end on the sign-in or the paywall, as it could before.

**Old servers and old replies.** `synthesis.followUp` travels only when it is text of at most 160 code points; anything else is dropped whole and the read is served. A reply without the field produces the read model it produced before, key for key.

**Where the Android page differs from the iPhone page**, file by file (everything else under `android/nucleo/src` is identical to `ios/Bobby/Nucleo/src`):

| File | Difference | Why |
|---|---|---|
| `shared/10-bridge.js` | `window.BobbyNucleo` transport: one JSON string per call, replies by id through `receive`, 180 s timeout; a dev transport cannot replace it | the WebView bridge |
| `shared/20-read-model.js` | "Sign in" without a brand, "Google Play" in the pending-purchase line (six languages) | platform words |
| `shared/20-read-model.js` | no `candlesTimeframe`: the chart takes its timeframe and date from `provenance` | not ported from iOS 1.7 (native sends no `candlesTimeframe`); a gap, not a platform reason |
| `shared/90-dev-mock-bridge.js` | absent | the Android builder bundles no mock |
| `app/20-gl.js` | without WebGL the companion art is not put inside the sphere | the approved Android fallback |
| `app/40-strings.js`, `onboarding/40-strings.js` | the microphone sentence names Android and on-device dictation; "Sign in" | platform words |
| `app/55-read.js` | `read.rendered` only when the bridge lists it, visible-frame count reset in the background | Android's presentation contract |
| `app/55-read.js` | no two-line chart subtitle (`chartSubtitle`) | not ported from iOS 1.7; a gap |
| `app/55-read.js`, `onboarding/82-render-dom.js`, `onboarding/template.html` | the sign-in chip shows a neutral mark, not the Apple logo | platform |
| `app/60-fsm.js`, `onboarding/60-fsm.js` | `askNativeSpeechConsent` and its comments (the Android recogniser never answers `consent`) | platform |
| `contract/10-contract.js` | the dev contract page lacks iOS's nudge, locale and `candlesTimeframe` checks | dev only, never bundled |

### What the owner still owes: App Links

The manifest declares an App Links filter (`autoVerify`) for `https://bobbyprotocol.xyz/i/*` and `www.bobbyprotocol.xyz/i/*`. Android 12 and later hand those links to the app by themselves only once the site vouches for it, and today it does not: `public/.well-known/assetlinks.json` names the old TWA package `xyz.bobbyprotocol.app` with the placeholder `REPLACE_WITH_PLAY_APP_SIGNING_SHA256`.

**The path is live from the first release all the same.** The filter does not wait for the verification: Android 8 to 11 (the app's minimum is 8) list Bobby under "Open with" for these links, on Android 12 and later a person can turn them on under "Open by default", and any app on the phone can start the activity with such a link. So link → app → claim can run on real phones before it was ever run against the server. Two consequences to know:

- A code that arrives this way is claimed without a tap as soon as there is an account and an accepted risk notice (the iOS rule). Another app on the phone could therefore make a new account accept the invitation of its choosing, once (an account accepts one invitation, ever). Asking for a tap first would be a change of the invitation's rule on both platforms: the owner's call.
- Only `/i/CODE` is forwarded. The activity ignores any other page of the site it is started with.

1. In Play Console, App integrity, copy the **app signing key certificate** SHA-256 (and the upload key's, if internal or sideloaded builds should verify too).
2. Add an entry to `public/.well-known/assetlinks.json` for the package `xyz.bobbyprotocol.bobby` with that fingerprint, and deploy the site. The repository's secret scanner has taken SHA-256 digests for keys before: expect to allow-list it.
3. On a phone with the Play build: `adb shell pm get-app-links xyz.bobbyprotocol.bobby` should say `verified` for both hosts; then tap an invitation link.

Until then, on Android 12 and later, an invitation link opens the browser unless the person turned the links on; the page shows the code, and the invite screen has a field to type it into.

Also open and the owner's call: `GET /api/bobby-access` reports no Google payments yet, so the app cannot sell Bobby Pro on Android. Following the iOS rule (promise Pro only where it can be bought in this build), the invite screen shows no reward sentence, the Bobby Pro row of Credits says the plan's state and leads nowhere, and a thesis review refused for used-up free reads offers Credits (an invitation, a code) instead of a paywall whose button is switched off. All three follow `payments.google` and change by themselves the day the server reports it. The server still grants the inviter their Pro days. The page's own paywall chip (1.1.4) still opens that paywall.

### What the server still owes Android

`POST /api/progress` accepts `platform: 'ios' | 'web'` only (`api/progress.ts`, and the database function `bobby_apply_progress` behind it). Android sends `"android"`, so **every profile sync from Android is answered 400 "Invalid payload" and dropped, in 1.1.4 and in 1.2.0** (checked against production on 2026-10-07: 400 for `android`, 401 for `ios` without a session). On an Android phone a saved read therefore never plants its piece (it stays "pending"), and XP, the streak and the accepted risk-notice version never reach the account from Android. Reading (`GET /api/progress`, which restores a returning account) works. Nothing in the app can fix this: the server has to accept `android` in `api/progress.ts`, in `bobby_apply_progress` (a migration) and in `api/trader-land.ts` (`close`), with a contract test that posts the body `NucleoSession.syncProgress` builds.

### What is verified, and what is not

**Verified by CI on every push** (GitHub Actions `Android`, the two `native` jobs: Firebase messaging off and on): the pages build from source, 143 Node tests, `:app:assembleDebug`, `:app:testDebugUnitTest`, `:app:assembleDebugAndroidTest` and `:app:lintDebug`. The JVM unit tests port the iOS 1.8 suites case by case, except the cases that need an iOS review fixture or a running Android device, and add the Android-only ones (inexact delivery, the reader tag, sign-in in a browser tab). The page tests also check that every native string resolves in six languages and that every iOS 1.8 translation row is in the Android catalog.

**Run on an emulator by CI** (GitHub Actions `Android emulator`: API 34 with Google APIs, a 360x800 dp screen, animations off, no GPU). `android/tools/run-emulator-tests.sh` runs `:app:connectedDebugAndroidTest` in three parts and keeps each part's report, logcat and every screenshot (the `android-emulator` artifact):

- `screens`: `V18ScreensInstrumentedTest` draws every 1.8 screen in English and in Spanish through the real composables, sheet, host, centres, repository and catalogs: Credits (a free account mid-week, a guest, an unknown balance) and its details, Invite (as the server answers today, and once Google Play sells Bobby Pro), My theses, the thesis editor (empty, with Bobby's draft, with a word selected and the keyboard up), the thesis review (before and after), Memory (and what the follow-ups keep, with its Clear) and its consent, Reminders with the follow-up rows, its choices and Material's day and time pickers, and the follow-up board; the review and the consent also at the system's 200% font size. The account, the clock and the network's answers are staged (`V18Stage`, `V18Fixtures`); nothing leaves the emulator. Each case also measures that every control answers to 48 dp.
- `device`: `V18DeviceInstrumentedTest` runs the real `MainActivity` with its page for a guest, in airplane mode: the profile shows the 1.8 rows and opens Credits, its details and closes; the system's notification question appears only after the person sets a reminder (and is answered through UiAutomator); a due notice is posted by WorkManager on the `thesis-reminders` channel with the fixed text and private visibility, and tapping it in the shade opens the review of its thesis; a notice planned for another reader is not shown and its tap opens nothing; a rotation keeps the same activity, the thesis editor and the words being typed in it; Back over unsaved words asks first, and "Keep writing" leaves the editor on screen with them; an invitation link that opened the app is not handled again when the activity is rebuilt, and a page of the site that is not an invitation is not forwarded.
- `others`: every older instrumented test. `MainActivityAcceptanceInstrumentedTest` (8 cases) is skipped there: it drives the page by script while the page draws its WebGL scene, which a runner without a GPU draws too slowly, and the emulator itself stopped under it once. One Trader Land case is skipped because it needs the system's animations on.

**Still not exercised, even on the emulator**, so unverified:

- Google Play: a purchase, and restore against the real RevenueCat SDK and Play. The emulator has no store account and the debug build no store key.
- App Links verification, and the claim of an invitation against the server. (That a link started with the activity is kept once, and not again on a rebuild, is checked on the emulator.)
- The system restoring the activity after it killed the process (the emulator case rebuilds it in the same process, which takes the same path in `onCreate`), a second copy of the activity (the manifest allows one), and what a browser tab left on top does when a notice or the sign-in callback arrives.
- Anything with a real account: sign-in from a 1.8 sheet and the sheet coming back (`SignInReturn`), the memory opt-in header on a real request, a review against the real desk. The staged network answers with bodies shaped like production's.
- A phone that runs late: a follow-up that waits for 09:00 or is dropped after a day, Doze overnight, a restart, a force-stopped app. The notice the test posts is due in two seconds on an awake emulator.
- The follow-up notices themselves (their channel, their tap landing on the glass), "Open Settings", a denied permission.
- TalkBack order and speech; French, Portuguese, Italian and German on a screen; a tablet; any real phone's own fonts and system skin.

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
