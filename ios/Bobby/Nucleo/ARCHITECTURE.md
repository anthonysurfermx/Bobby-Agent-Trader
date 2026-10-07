# Núcleo live app — architecture v1

This document is the single source of truth for building the real Núcleo app. The sphere is the app.

- **Worktree:** `.claude/worktrees/ios-nucleo`
- **Branch:** `ios/nucleo-preview`
- **Base:** iOS 1.4 (37), building 1.5 (40)

The approved design is kept inside the repo:

- `design/DIRECTION.md` holds the tokens, springs, stage map, storyboards and acceptance criteria.
- `design/GLASS.md` holds the idle glass.
- `design/prototype-src/` holds the approved engine sources. The scratchpad copies are temporary; always read the repo copies.

In this document, "the prototype" means `design/prototype-src/nucleo-v2.src.html` (the daily loop) and `design/prototype-src/onboarding/*` (the first run).

The goal is the app Anthony asked for. He asks his own question by voice or text. He gets the real three-agent debate, real numbers, a real chart and a real verdict. He can save the thesis, and he sees his real companion, XP, streak, Isla and theses. Nothing on screen is scripted.

---

## 0. Rulings (made; builders do not re-litigate)

| # | Ruling | Why |
|---|---|---|
| R1 | The engine stays web tech (HTML/CSS/raw WebGL, the approved code) inside a `WKWebView`. Native Swift owns network, auth, speech-to-text, TTS, haptics and persistence. JS owns rendering and choreography. | Decided upstream. |
| R2 | **Page JS never touches the network.** The CSP sets `connect-src 'none'`. Every byte of data comes through the bridge. | `/api/desk-debate` rejects the `file://` origin, and the app's `Origin` header is set natively. |
| R3 | **JS never names an asset.** `ask` accepts a question, a native-issued `token` (from a confirmation, a suggestion, or a metered-read refusal, §8.3), or `followUpOf` (a previous read). | The "never analyze an unconfirmed guess" rule is enforced where the network lives. |
| R4 | **XP is awarded on *Save thesis*, not when a read completes.** Saving is the award event (`read_complete` for Review, `no_trade_respected` for Wait) with the thesis attached. It happens once per read, is capped by `CompanionStore` (3/day), and is guarded by account generation. | This is the only place a thesis exists server-side (`events[].thesis`). The design says the reward comes on save. |
| R5 | Conviction and plan levels come only from `voice-tool run_debate` (`pulse`, quota-free). They are **shown only when the engine agrees with the desk**: verdict `review`, the same direction, and the same instrument. Otherwise the ring is a **completion ring with no number**, and the thesis shows real support/resistance instead of plan rows. | `/api/desk-debate` returns no conviction or levels. Both real captures are `wait`, while BTC's engine says `strong_long 59%`. Showing that number under "Wait" would contradict the desk. |
| R6 | Verdict words: `wait` becomes **Wait** (amber `#F6B94E`, scrim `#2A1C08`). `review` becomes **Review** (mint `#3FE0B5`, scrim `#082A20`). "Buy" and "Sell" never appear. Spanish: Espera / Revisa. | Colour lock (DIRECTION §2.1) and compliance. |
| R7 | What Bobby speaks = up to 600 chars of **CIO sentences**, plus one closing line from the string table ("My call: wait." / "Mi lectura: esperar."). The verdict condenses on that closing word. The full agent texts live in the debate card. | Neither real CIO text contains the word "wait", so the condensation needs a deterministic sync point. The closing line is a label with the real verdict inserted; it is not invented analysis. |
| R8 | Speech-to-text runs **on device when the phone holds Apple's model for the app language**; otherwise Apple's speech service transcribes it in that same language (`requiresOnDeviceRecognition` follows the recognizer's `supportsOnDeviceRecognition`). Apple's speech service is used **only after the user agreed to it** in a native prompt (the agreement is stored natively as `speech.appleServiceConsent.v1`): until then the mic state is `consent`, `speech.start` creates no recognition request and never opens the microphone, and a hold raises the prompt (allow, or type). The on-device path needs no agreement and has no prompt. If nothing can recognize the language right now (no local model and no connection), the mic is `unavailable` and the pill offers typing. | A language without a local model would otherwise have no voice input, and audio must not leave the phone on a promise the user never accepted. The risk notice and the speech usage string say which of the two transcribes; Bobby never stores the audio. |
| R9 | These are dropped until a data source exists: Google sign-in, "Watch & ping me" with price pings, the notifications prompt, the Record face, the earnings satellite and chart marker, follow-up suggestions written by an LLM, and "level 12". Since §3.5 one of them has a source: the desk's CIO writes one next question on every read (`synthesis.followUp`), and the page shows that text, unchanged, only when it passes the checks of §3.5. The page still writes no question of its own. | `.claude/rules/no-hardcode.md`. |
| R10 | The horizon control (24h/3d/7d) is shown only when the user is **signed in and the verdict is Review**. | Only a `read_complete` seed has a horizon, and extending one needs sign-in plus an `inventoryId`. |
| R11 | Onboarding's risk beat shows the **4 real `RiskNotice` statements**, fetched from native, as a hold-to-agree. It never shows the prototype's 3 paraphrased lines. No bridge call can reach the network before acceptance. | Statement 1 is the consent to AI processing. |
| R12 | Native keeps a **local thesis ledger** (`nucleo.theses.<owner>`, 20 newest). It feeds the Theses face, the ghost satellite and `theses()`, and it saves even at the daily XP cap. | Signed out, pending awards vanish after sync, and a capped award queues nothing. |
| R13 | A single `NucleoSession` owns `AgentProfile`, `CompanionStore` and `NeuralVoice`. `openClassic` tears the Núcleo down before `ContentView` appears. The classic app sits behind a **long press (0.8 s) on the header wordmark**, in **DEBUG builds only** (dev pages and DEBUG native); Release refuses `openClassic` (`unknown_method`) and never shows `ContentView` (1.5 (40), App Review 2.3.1). | Two live stores clobber `pendingAwards`. |
| R14 | Before any desk call, native runs a **preflight**: asset class must be equity or crypto, the equity symbol must match `^[A-Z0-9][A-Z0-9.^=-]{0,19}$`, and candles must be fresh (crypto ≥59 bars with the last bar ≤3 h old; equity last bar ≤5 days old). A failure answers `unsupported` without spending quota. | The desk spends quota before it loads evidence. Every failure after that is a paid 503. |
| R15 | Fonts keep loading from Google Fonts (the CSP allows only those two hosts). Bundling Geist and Instrument Serif needs Anthony's OK to download them; see §7. | No local copies exist. |

---

## 1. Files, build, routing

### 1.1 Tree and ownership

```
ios/Bobby/Nucleo/                       (not bundled; sources)
  ARCHITECTURE.md                       lead
  build.py                              lead — the one build command
  companions.json                       lead — 18 companions, the ONLY art source (never print dataUri)
  design/                               lead — DIRECTION.md, GLASS.md, prototype-src/ (read-only reference)
  fixtures/                             lead — raw captures, golden replies, native snapshots, normalize.py
  tests/read-model.test.mjs             Builder B (extend, keep green)
  src/shared/10-bridge.js               Builder A (protocol owner; seeded by lead)
  src/shared/20-read-model.js           Builder B (display mapping; seeded by lead)
  src/shared/90-dev-mock-bridge.js      Builder A (browser mock; seeded by lead; dev builds only)
  src/contract/{template.html,10-contract.js}   lead — executable protocol contract (dev builds only)
  src/app/template.html + src/app/NN-*.js       Builder B — daily engine
  src/onboarding/template.html + src/onboarding/NN-*.js   Builder C — onboarding engine

ios/Bobby/Resources/Nucleo/             (bundled folder resource; GENERATED, never edit by hand)
  app.html  onboarding.html  contract.html (dev)  companions-meta.json  build-info.json
  fixtures/ (dev; raw + native + manifest, for -nucleo-fixtures)
  index.html nucleo-v2.html nucleo-onboarding.html   (legacy preview; parked by --park-legacy)

ios/Bobby/Sources/Nucleo/*.swift        Builder A (new folder; XcodeGen picks it up via `Sources`)
```

**Sharing rule.** A builder reads the others' files and never edits them. A needed change goes in the builder's report as a `CONTRACT CHANGE REQUEST`. The lead or integration applies it to this document, the contract page and both sides.

### 1.2 Build (one command)

```
python3 ios/Bobby/Nucleo/build.py                 # dev: inline mock + fixtures, contract page
python3 ios/Bobby/Nucleo/build.py --park-legacy   # same, and moves the old prototypes out of the bundle
python3 ios/Bobby/Nucleo/build.py --release       # ship: no mock, no fixtures, no contract page
cd ios/Bobby && xcodegen generate                 # only after adding/removing Swift files
```

For each page P, `build.py` reads `src/P/template.html`, which must contain `<!--NUCLEO:CSP-->`, `<!--NUCLEO:FIXTURES-->`, `<!--NUCLEO:SHARED-->` and `<!--NUCLEO:JS-->` once each, in that order inside `<body>` (CSP inside `<head>`). It then:

1. Inlines `src/shared/*.js` in sorted order. `9*-dev-*.js` files are dropped under `--release`.
2. Inlines `src/P/*.js` in sorted order.
3. Replaces `__COMPANIONS_JSON__`, which must appear exactly once, with `companions.json`.
4. Inlines `window.NUCLEO_FIXTURES`, in dev builds only.
5. Runs `node --check` on the whole script.
6. Writes `Resources/Nucleo/P.html`.

It also writes `companions-meta.json`: id, label, palette and tint, without art, for native. In dev builds it copies `fixtures/{raw,native,manifest.json}` into `Resources/Nucleo/fixtures/` for the app's fixture mode. The CSP is:

```
default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com;
font-src https://fonts.gstatic.com data:; img-src data: blob:; media-src data: blob:;
connect-src 'none'; base-uri 'none'; form-action 'none'
```

Browser checks run against the dev server (`http://localhost:4614` serves `ios/Bobby`):
- `http://localhost:4614/Resources/Nucleo/app.html?…`
- `http://localhost:4614/Resources/Nucleo/onboarding.html?…`
- `http://localhost:4614/Resources/Nucleo/contract.html?…`

### 1.3 Routing (Builder A)

`BobbyApp` shows `NucleoRootView` in place of `NucleoPreviewView`. `NucleoRootView` owns one `NucleoSession` and one `WKWebView`, and picks the page:

| Condition (read at launch and after `finishOnboarding`) | Page |
|---|---|
| `!profile.onboarded` or `companions.companionId == nil` | `onboarding.html` (resumes at the ask-teach beat if a companion is already chosen) |
| onboarded but `!profile.acceptedRiskNotice` (stale version) | `onboarding.html#risk` (risk beat only) |
| otherwise | `app.html` |
| `openClassic()` (long press on the wordmark; DEBUG only) | tear down Núcleo, then `ContentView()` for the rest of this launch; the next launch returns to Núcleo. Release has no exit |
| `openNative("riskNotice")` from the app page while the notice is not accepted | the risk beat (`onboarding.html#risk`, or full onboarding if the companion is missing) replaces the page; its `finishOnboarding` cross-fades back |

`finishOnboarding()` sets `profile.onboarded = true`, but only if a companion is chosen and the risk notice is accepted. It then cross-fades to `app.html`: overlay `snapshotView(afterScreenUpdates:false)`, load the page, and remove the overlay on the page's first `session` call. Returning users never see the birth.

Keep the preview shell's full-screen chrome: `ignoresSafeArea`, `statusBarHidden(true)`, `persistentSystemOverlays(.hidden)`, black background.

**DEBUG launch arguments** (all behind `#if DEBUG`, parsed with `BobbyApp.argument(after:)`):

| Argument | Effect |
|---|---|
| `-nucleo-fixtures [scenario]` | Fixture mode (§4.4); scenario defaults to `default` |
| `-nucleo-page app\|onboarding\|contract` | Force a page |
| `-nucleo-reset-onboarding` | Before stores init, remove `agent.onboarded`, `agent.riskNoticeVersion`, `companion.id` (simulator only) |
| `-nucleo-fixtures-live-voice` | In fixture mode, let TTS reach `/api/bobby-voice-free` (default: device voice, free) |
| `-AppleLanguages (en)` | Standard; the contract's golden replies are English |

---

## 2. Bridge protocol v1 (JS ⇄ Swift)

### 2.1 Transport

- **JS → native, request/response.** Use `WKScriptMessageHandlerWithReply`, registered with `userContentController.addScriptMessageHandler(handler, contentWorld: .page, name: "nucleo")` and using the async variant `userContentController(_:didReceive:) async -> (Any?, String?)`.
  - The JS side is `nucleoBridge.call(method, params)` (see `src/shared/10-bridge.js`). It posts the envelope `{v:1, method, params}`.
  - Native **always** replies with an object: `{v:1, ok:true, result}` or `{v:1, ok:false, error:{code, message}}`. The `String?` error slot is used only when the envelope is unparseable (`"bad_envelope"`).
  - Domain outcomes are `ok:true` results that carry a `status`: quota, unknown asset, cancelled and the like.
  - `ok:false` means a protocol fault, and the code is one of:
    - `unknown_method`
    - `invalid_params`
    - `forbidden`
    - `busy`
    - `internal`
- **Native → JS, events.** Call `webView.callAsyncJavaScript("window.nucleoBridge && window.nucleoBridge.emit(name, payload)", arguments: ["name": name, "payload": payload], in: nil, in: .page)`. Passing values as arguments means native never builds strings, so nothing can be injected.
  - Coalesce `speech.level` and `voice.level` to ≤30 Hz, and `voice.progress` to ≤10 Hz.
  - Drop an event if the previous call of the same name has not completed.
  - Emit nothing until the page has made its first `session` call.
- JSON only: dictionaries, arrays, strings, finite numbers, booleans and null. Timestamps are ms since epoch (Int) or ISO-8601 strings, as noted per field.

### 2.2 Security (native enforces; the contract page and unit tests check)

1. Accept a message only if every one of these holds:
   - `message.frameInfo.isMainFrame`
   - `message.frameInfo.securityOrigin.protocol == "file"`
   - `message.webView?.url` is a file URL whose standardized path starts with the bundle's `Nucleo/` directory

   Otherwise reply `forbidden` and log.
2. The navigation delegate allows only file URLs inside `Nucleo/` and cancels everything else, including `about:blank` popups and https. Set `javaScriptCanOpenWindowsAutomatically = false`. Links are never opened from JS; `openNative` covers the known routes.
3. Envelope rules: ≤64 KB serialized, `v == 1`, `method` in the whitelist, `params` a dictionary. Validate each param with the exact types, lengths and enums in §2.3, and ignore unknown keys. Hold no JS-provided symbol, price or level for any purpose (R3).
4. Web view configuration:
   - `websiteDataStore = .nonPersistent()`. Per-viewer state lives in native.
   - `isInspectable` in DEBUG only.
   - `scrollView.isScrollEnabled = false`, `bounces = false`, `contentInsetAdjustmentBehavior = .never`.
5. `webViewWebContentProcessDidTerminate` reloads the same page. The page restores from `session().pendingRead` (§3.2).
6. Never log question text, transcripts or agent texts. `log` accepts ≤300 chars, is DEBUG only, and JS must not send user text through it.

### 2.3 Methods (exact shapes)

Types: `S` string, `B` bool, `N` finite number, `I` integer, `?` nullable. "Session" is the object returned by `session`.

| Method | Params | Result |
|---|---|---|
| `session` | `{page?: "app"\|"onboarding"\|"contract"}` | **Session** (below). The first call marks the page ready. |
| `roster` | `{}` | `{companions:[{id S, webId S, label S, role S, selectLine S, requiredLevel I, voicePersona S, palette S, unlocked B}]}`. There are 18, in `bobbyCompanions` order, localized. `webId` is `"bobby"` for iOS `"orb"` and equals `id` otherwise. `palette` comes from `companions-meta.json`. Snapshot: `fixtures/native/roster.json`. |
| `suggestions` | `{}` | `{quickAccess:[{symbol S, own B}], movers:[{symbol S, name S, changePct N}]}`. Sources: `DeskMemory.quickAccess(fallback: BobbyViewModel.defaultQuickAccess)` and `BobbyAPI.topMovers(limit:3)`. `own` is true for an asset the person asked about and false for a starter that only pads the row (§3.5). Cached 5 min; a failure gives `[]`. |
| `ask` | exactly one of: `{question S (1…1200 code points after trim)}` · `{token S}` · `{followUpOf S(uuid), question S}` | **AskResult** (§2.4). One read at a time; otherwise the fault `busy`. |
| `cancel` | `{}` | `{cancelled B}`. The in-flight `ask` then resolves `{status:"cancelled"}`. The server may already have spent quota; this is expected. |
| `speech.permission` | `{}` | `{state: "granted"\|"denied"\|"undetermined"\|"restricted"\|"unavailable"\|"consent", onDevice B}` (§2.6). Never prompts. The page calls it again before deciding a hold from a cached state that cannot listen (§3.2). |
| `speech.requestPermission` | `{}` | Same shape. Asks for what dictation still needs, in order: the two OS prompts (microphone, then speech recognition) and, in the `consent` state, the native Apple speech service prompt (allow, or type). Allow stores the agreement natively and answers `granted`; "type" stores nothing and answers `consent`. |
| `speech.start` | `{}` | `{status: "listening"\|"needs_permission"\|"denied"\|"unavailable"\|"consent"\|"busy"}`. `consent`: nothing was created or opened. |
| `speech.stop` | `{cancel?: B}` | `{status:"stopped"\|"idle"}`. Unless `cancel`, `speech.final` follows within 1.5 s. |
| `speak` | `{id S(^[A-Za-z0-9_.:-]{1,64}$), text S(1…800)}` | `{status:"queued"\|"muted"\|"too_long"}`. Events follow (§2.5). A new `speak` stops the previous one (`voice.end{reason:"stopped"}`). |
| `previewVoice` | `{companionId S}` | Same as `speak`, with event id `"preview-<companionId>"`. Plays the bundled clip `select-<id>-<en\|es>` through `NeuralVoice.speakClip`, which is free. |
| `stopSpeaking` | `{}` | `{}` |
| `setMuted` | `{muted B}` | Session. Persists `NeuralVoice.isMuted`, the user's setting. |
| `haptic` | `{kind: "light"\|"soft"\|"medium"\|"rigid"\|"heavy"\|"selection"\|"success"\|"warning"\|"error"}` | `{}`. At most 1 per 40 ms; extras are dropped. |
| `saveThesis` | `{requestId S, horizonHours?: 24\|72\|168}` | **SaveResult** (§2.7). Idempotent per `requestId`. |
| `island` | `{}` | Signed in: `{available:true, size I, pieces I, seedsGrowing I, reviewsReady I, readyToBuild I, nextReviewAt S?, growth:{occupied I, threshold I, nextSize I?}, season:{name S, earned I, total I}?}` from `TraderLandSync.load()`, cached 60 s. Signed out: `{available:false, reason:"signed_out", pendingSeeds I}`. On failure: `{available:false, reason:"unavailable"}`. |
| `theses` | `{}` | `{items:[Thesis]}` from the ledger (R12), newest first, max 20. Thesis shape in §2.7. |
| `record` | `{}` | v1: `{available:false, reason:"no_source"}`. There is no personal record source yet (R9). |
| `setCompanion` | `{id S}` (iOS id; unlocked) | Session. Commits exactly like `CompanionOnboarding.commitCompanion`: `companionId`, `profile.voiceId = voicePersona`, `profile.auraText = AuraForge.keyword(nearest: hue)`. |
| `riskNotice` | `{}` | `{version I, statements:[{title S, body S}]×4}`. This is the RiskNoticeView copy, moved into `enum RiskNotice` unchanged (§6.2). Snapshot: `fixtures/native/risk-notice.json`. |
| `acceptRisk` | `{version I}` | `{accepted B, version I}`. `version` must equal `RiskNotice.currentVersion`; if it does, set `profile.riskNoticeVersion`, and when signed in also run `ProgressSync.sync`. |
| `paywall` | `{}` | `{status:"subscribed"\|"cancelled"\|"pending"\|"failed"\|"unavailable", access: Access\|null}` (§8.4). Presents the native Bobby Pro sheet and answers **when it closes**. Only `subscribed` (Bobby's server confirmed the account is Pro) lets the page re-ask. `unavailable`: risk notice not accepted, or another sheet is open. Emits `native.sheet{route:"paywall"}`. `openNative` never opens it. |
| `signIn` | `{}` | `{status:"signedIn"\|"cancelled"\|"failed"\|"unavailable"}`. Native runs an `ASAuthorizationController` with `AccountSession.shared.prepareAppleRequest` then `completeApple`, and on success `ProgressSync.shared.sync(store:profile:)`. Apple only. Fixture mode returns `unavailable`. |
| `openNative` | `{route: "squad"\|"locker"\|"isla"\|"account"\|"riskNotice"}` (never `paywall`: that route is the awaited `paywall` method) | `{opened B}`. The routes present, as sheets over the web view: `MascotGalleryView`, `SquadLockerSheet`, `TraderLandGateHarnessView(focus:nil)` (sync on dismiss, as ContentView does), `AccountSheet` (full height, with Privacy Policy and Help links; the header avatar opens it), and `RiskNoticeView(readOnly:true)`. Emits `native.sheet`. Exception: `riskNotice` from the **app** page while the notice is not accepted opens no sheet; the risk beat replaces the page (§1.3). |
| `openClassic` | `{}` | DEBUG only: `{}`, then routes (§1.3). Release: `unknown_method`. |
| `finishOnboarding` | `{}` | `{next:"app"}` or `{status:"incomplete", missing:["companion"\|"risk"]}` |
| `markHint` | `{key S(^[a-z][A-Za-z0-9_.-]{0,31}$)}` | `{count I}`. Stored in the UserDefaults dict `nucleo.hints` and echoed in `session.hints`. |
| `log` | `{level:"info"\|"warn"\|"error", message S(≤300)}` | `{}` (DEBUG print only) |

There is intentionally **no `award` method**. Awards are minted only by `saveThesis` (R4), so a page cannot mint XP.

**Session**
```json
{ "v":1, "page":"app", "firstRun":false, "onboarded":true, "language":"en", "localHour":21,
  "companion":{"id":"mira","webId":"mira","label":"MIRA","palette":"ghost","voicePersona":"alloy"},
  "xp":120, "level":{"number":2,"name":"LOCKED IN","progress":0.7,"nextMinXP":150}, "streak":3,
  "signedIn":false, "riskAccepted":true, "riskVersion":4, "muted":false, "reducedMotion":false,
  "mic":{"state":"granted","onDevice":true}, "hints":{"verdictPull":1},
  "pendingRead":null, "fixtures":false, "platform":"ios", "appVersion":"1.5 (40)" }
```
- `language` is `L.ttsLang`.
- `companion` is null before the pick.
- `level.progress` is `companions.levelProgress`.
- `pendingRead` is the latest `ok` AskResult that has not been saved and is less than 30 min old. It is used for restore.
- `onboarded` means `profile.onboarded && companionId != nil`.
- `firstRun` is `!onboarded`.

### 2.4 `ask` pipeline (native) and AskResult

Order is normative. The mock follows it too.

1. **Validate** the params, which is where `invalid_params` comes from. Then refuse with `busy` if a read is already in flight.
2. **Risk gate.** If `!profile.acceptedRiskNotice`, return `{status:"error", code:"risk_not_accepted"}` with **no network**.
3. **Length.** If `DeskQuestion.isTooLong`, return `{status:"too_long", maxLength:1200, message}` with no network.
4. Capture `AccountSession.shared.generation` and the `requestId` (a lowercase UUID). Emit `ask.stage{stage:"resolving"}`.
5. **Resolve.**
   - For a `token`, use the stored resolution. Tokens are single use and live 10 min.
   - For `followUpOf`, reuse that read's asset.
   - Otherwise call `BobbyAPI.assetSearch(question)` and parse it the way `BobbyAPI.resolution(from:)` does, **also keeping `resolved.assetClass`**. Make `prettyName` internal.
     - A transport failure gives `error.network`.
     - `resolution == null` gives `unknown_asset`, with suggestions from `BobbyAPI.searchAssets(question, limit: 3)`, each carrying a new token.
     - `needsConfirmation` gives `confirm`, with a token.
6. **Preflight (R14).**
   - `assetClass ∉ {equity, crypto}` gives `unsupported/asset_class`.
   - An equity symbol that fails `^[A-Z0-9][A-Z0-9.^=-]{0,19}$` gives `unsupported/symbol_format`.
   - Emit `ask.stage{stage:"accepted", asset, startedAt}`.
   - Fetch candles exactly as `BobbyAPI.candles(symbol:isEquity:timeframe:.oneHour)`, but through `BobbyAPI.response`, so that a transport error (`error.network`) is told apart from an empty or non-2xx reply.
   - Gate: crypto needs ≥59 bars and a last bar ≤3 h old; equity needs a last bar ≤5 days old. A failure gives `unsupported/thin_data` or `unsupported/stale_data`.
   - Emit `ask.stage{stage:"candles", candles, provenance:null}`.
7. **Metered gate, then market ‖ desk** (§8.2).
   - 7a. The pulse (`POST api/voice-tool {tool:"run_debate", args:{symbol, lang: L.ttsLang}}`, 20 s cap) is **the metered read**. It carries the access headers (§8.1) and runs **before** the desk: 401 → `signin_required`, 402 → `subscription_required`, returned at once with a retry `token`; the desk is never called. The desk waits at most 10 s for this answer, then starts anyway (fail open); a refusal that arrives later still wins. Any other failure, or an `error` key, gives `pulse: null` as before.
   - 7b. The market read (`BobbyAPI.market`, started with the candles) and the **debate** run in parallel.
   - The debate is sent exactly as `BobbyAPI.debate` does it: `POST api/desk-debate`, body `{symbol, question, language: L.ttsLang, assetType: "equity"|"crypto"}`, header `Origin: https://bobbyprotocol.xyz`, timeout 100 s. It also carries the access headers (§8.1), so the server may meter the desk itself later without an app update.
   - Emit `ask.stage{stage:"market", market}` as soon as the market read returns or fails.
   - **The reply never precedes its `market` and `candles` stages.**
   - After the debate returns, wait at most 5 s more for the pulse (only if 7a had no answer yet).
8. **Map the debate response:**

   | Debate response | Result |
   |---|---|
   | 429 | `quota`, with `retryAfterSec` from the `Retry-After` header if native reads headers, else null |
   | 400 `question_too_long` | `too_long` |
   | 503 `analysis_failed` or `desk_unavailable` | `error`, with that code and `message` = the server's `error` string, which is already localized |
   | 2xx with non-empty `agents.alpha/red/cio` and a verdict ∈ {wait, review} | `ok` |
   | Anything else (non-JSON 504, missing fields) | `error/bad_response` |
   | URLError `.timedOut` | `error/timeout` |
   | Other transport errors | `error/network` |
   | Task cancelled | `cancelled` |

   Never produce a verdict on failure.
9. **On `ok`:** call `DeskMemory.recordQuery`, then keep the read in memory (the last 5, keyed by `requestId`) together with its generation. It becomes `pendingRead`. **Nothing is awarded here** (R4).

**AskResult**, where `status` is one of `ok|confirm|unknown_asset|unsupported|too_long|quota|signin_required|subscription_required|cancelled|error`. The golden examples are in `fixtures/ask/*.json`.

```json
{ "v":1, "status":"ok", "requestId":"<uuid>", "question":"Should I buy NVIDIA right now?", "language":"en",
  "asset":{"symbol":"NVDA","name":"Nvidia","isEquity":true},
  "market":{"price":225.07,"changePct":0.22},
  "technicals":{"price":225.1,"rsi14":63.8,"ema20":224.5,"ema50":223.5,"support":221.1,"resistance":230,
                "atrPct":0.67,"trend":"up|down|sideways|null","momentum":"overbought|oversold|neutral|null"},
  "pulse":null | {"signal":S,"direction":"long|short|none","convictionPct":N?,"agreementPct":N?,"overview":S?,
                  "source":"intel|okx-indicators","instrument":S?,
                  "plan":null | {"direction":S,"entry":N?,"stop":N?,"target":N?,"rewardRisk":N?,"invalidation":S?}},
  "agents":{"alpha":S,"red":S,"cio":S,"verdict":"wait|review","direction":"long|short|none"},
  "provenance":{"provider":"Yahoo Finance","instrument":"NVDA","assetType":"equity","timeframe":"1H","asOf":"2026-09-25T20:00:00.000Z"},
  "candlesTimeframe":"1H", "candles":[{"t":1790366400000,"o":N,"h":N,"l":N,"c":N,"v":N}],
  "receivedAt":1790422570000, "elapsedMs":5378, "fixture":false,
  "access": Access }            // only when the server sent one (§8.2); a legacy server: no key at all
{ "v":1, "status":"confirm", "token":S, "asset":{"symbol":"XAUT","name":"Xau","isEquity":false,"assetClass":"commodity"}, "matchKind":"proxy|fuzzy|…", "proxyNote":S? }
{ "v":1, "status":"unknown_asset", "query":S, "suggestions":[{"symbol":S,"name":S,"assetClass":S,"token":S}] }
{ "v":1, "status":"unsupported", "asset":{symbol,name,isEquity,assetClass}, "reason":"asset_class|symbol_format|thin_data|stale_data" }
{ "v":1, "status":"too_long", "maxLength":1200, "message":S? }
{ "v":1, "status":"quota", "retryAfterSec":I?, "message":S? }
{ "v":1, "status":"signin_required", "token":S, "message":S?, "access":Access? }         // 401 from the metered read
{ "v":1, "status":"subscription_required", "token":S, "message":S?, "access":Access? }   // 402 from the metered read
// Access = {tier:"anon"|"free"|"pro", used I, limit I?, remaining I?, resetsAt S(ISO)?, paywall B}
{ "v":1, "status":"cancelled" }
{ "v":1, "status":"error", "code":"analysis_failed|desk_unavailable|network|timeout|bad_response|risk_not_accepted", "message":S? }
```

Normalization rules follow `fixtures/normalize.py` exactly; it is normative:
- trend: `alcista`→`up`, `bajista`→`down`, `lateral`→`sideways`.
- momentum: `sobrecompra`→`overbought`, `sobreventa`→`oversold`, `neutral`→`neutral`.
- Candles decode like `BobbyAPI.candles`: `ts` becomes an Int `t`; string numbers are parsed; volume defaults to 0; sorted ascending.
- `candlesTimeframe` comes from the same native constant used by both candle request URLs. `provenance.timeframe` remains the debate/evidence horizon. The chart uses the candle interval and final plotted candle timestamp; explicit horizon mismatches suppress support, resistance, band, bracket, and plan overlays while the separate analysis cards retain them. Older replies without `candlesTimeframe` fall back to `provenance.timeframe`.
- `plan` is null unless at least one of entry, stop or target is a number.
- `asset.name` = `prettyName(first alias ≠ symbol)`.
- `receivedAt` is ms at receipt. **In fixture mode it is the raw capture's `recordedAt`**, which keeps the golden replies deterministic.

### 2.5 Events (native → JS)

| Event | Payload |
|---|---|
| `session.changed` | Session. Sent after setCompanion, acceptRisk, signIn, saveThesis, setMuted, a sheet closing, a change of account generation, and foregrounding. |
| `app.state` | `{state:"active"\|"background"}`. On background, native cancels STT and stops the voice. An in-flight read keeps going. |
| `ask.stage` | `{requestId, stage:"resolving"}` · `{requestId, stage:"accepted", asset, startedAt I}` · `{requestId, stage:"candles", candles, provenance:null}` · `{requestId, stage:"market", market}` |
| `speech.state` | `{state:"listening"\|"stopped"}` |
| `speech.level` | `{level N 0…1}` (≤30 Hz) |
| `speech.partial` | `{text S}` (the full current best transcription) |
| `speech.final` | `{text S}` (`""` means nothing was heard) |
| `speech.error` | `{code:"denied"\|"restricted"\|"unavailable"\|"interrupted"\|"failed", message S?}` |
| `voice.start` | `{id, durationSec N?, engine:"neural"\|"device"\|"mock"}` |
| `voice.level` | `{id, level N 0…1}` (≤30 Hz; from `NeuralVoice.level`) |
| `voice.progress` | `{id, t N, duration N}` (≤10 Hz; neural engine only) |
| `voice.word` | `{id, index I}` (device engine only, from `willSpeakRangeOfSpeechString`; the word index is counted on whitespace splits of the spoken text) |
| `voice.end` | `{id, reason:"finished"\|"stopped"\|"failed"}`. Always sent exactly once per queued id, within 22 s if playback never starts (watchdog). |
| `thesis.planted` | `{requestId, stage:"seed"\|"bloomed"\|"capped"\|"signed_out"\|"failed", piece:{id,name}?, horizon:{hours,reviewAt,extendable}?}` (signed in only; after `ProgressSync.outcome`) |
| `native.sheet` | `{route, state:"open"\|"closed"}`, `route` includes `paywall`. While a sheet is open, JS pauses rendering. |

### 2.6 Speech-to-text and voice (native details)

- **Permission.** `state` = `granted` only if both `AVAudioApplication.shared.recordPermission` and `SFSpeechRecognizer.authorizationStatus()` are granted. It is `denied` if either is denied, `restricted` if speech is restricted, `undetermined` if either is undetermined, and `unavailable` if no recognizer for the app language can run now, on the device or through Apple's speech service. It is `consent` when both are granted, only Apple's speech service can transcribe the language and the user's agreement is not stored (`UserDefaults` key `speech.appleServiceConsent.v1`, written only by the native prompt's **Allow** and removed when the AI permission is withdrawn). `onDevice` is true only when the resolved recognizer holds the local model; it is false in `consent`. The locale is `es-MX` when `L.isSpanish`, else `en-US`; the first supported of those.
- **Apple speech service prompt.** `speech.requestPermission` in the `consent` state presents a native alert in the app language: to dictate in this language the voice is sent to Apple's speech service to be transcribed, Bobby does not store the audio, and the user can type instead. Two actions: **Allow** (stores the agreement; the next hold records) and **Type instead** (stores nothing; the page opens typing and a later hold asks again). The page cannot store the agreement.
- **Start.** Native is the enforcement point: a recognizer that is not on-device starts only with the stored agreement. Without it `speech.start` answers `consent` before any step below (no request, no tap, the voice keeps playing).
  1. Call `voice.stop()`, then set `AVAudioSession` to `.playAndRecord` with mode `.measurement` and `.duckOthers`.
  2. Use `SFSpeechAudioBufferRecognitionRequest` with `requiresOnDeviceRecognition` set to the recognizer's `supportsOnDeviceRecognition`, `shouldReportPartialResults = true` and `addsPunctuation = true`. Set `contextualStrings` to `BobbyAPI.dictationVocabulary()`, prefetched once per session and quota-free.
  3. Install an `AVAudioEngine` input tap. The level is `clamp((20·log10(rms)+50)/45, 0, 1)`.
- **Stop.** Call `endAudio()`, wait ≤1.5 s for the final result, emit `speech.final`, remove the tap and stop the engine. Then set the category back to `.playback`/`.spokenAudio`; `NeuralVoice.play` does this too.
- **Cancel.** Call `task.cancel()`; no final is emitted.
- **Automatic stops.** Listening stops automatically after 60 s. An audio interruption or a route change emits `speech.error{interrupted}` and stops listening.
- **The mic is live only between `speech.start` and `speech.stop`.** JS starts on pill pointerdown and stops on pointerup or pointercancel. Native also stops on background.
- **Voice.** `speak` calls `NeuralVoice.speak(text, voiceId: profile.voiceId, persona: companion?.voicePersona, vibe: profile.vibeId, essential: true)`.
  - Muted gives `{status:"muted"}`, and JS then runs its silent reading clock.
  - Watch `$speaking` to find start and end. `speaking` stays false while the TTS request is in flight, so start/end detection is edge-based, with the 22 s watchdog.
  - Add these to `NeuralVoice.swift`, additively:
    - a published `playback: (time: TimeInterval, duration: TimeInterval)?`, updated in the existing metering timer;
    - a word-boundary callback from the fallback synthesizer's `willSpeakRangeOfSpeechString`;
    - an `engine` flag that says whether the neural voice or the device voice is playing.

### 2.7 `saveThesis` and SaveResult

1. Look up the read by `requestId`; if it is unknown, the fault is `invalid_params`. If it was already saved, return the stored SaveResult unchanged.
2. If `AccountSession.shared.generation` differs from the read's generation, return `{status:"stale"}`, with no award and no ledger entry. This mirrors ContentView step 11.
3. Work out the award kind:
   - `verdict == "wait"`: 20 points, kind `no_trade_respected`.
   - Otherwise: 10 points, kind `read_complete`.
4. Build the thesis with `AwardThesis.make(symbol:isEquity:direction:price: market.price ?? technicals.price, entry:nil, stop:nil, target:nil)`. Levels are nil in v1; see §7.
5. `let award = companions.awardDisciplineEvent(points, kind:, thesis:)`. Its `points` may be 0 at the daily cap.
6. Append to the ledger, **even when capped**.
7. Consume the queues: move `pendingEvolution` into `evolution{number,name}` and `pendingToolUnlocks` into `unlocks[{id,name,tier}]`, then clear both so the classic app does not replay them later.
8. Planting:
   - Signed in with an `eventID`: `planting:"pending"`. Then run `ProgressSync.sync`, then `ProgressSync.outcome(for:)`, then emit `thesis.planted`. If `horizonHours > 24` and the stage is `seed` and extendable, call `DeskSeedExtender().extend(inventoryID:to:)`.
   - Signed out: `"signed_out"`.
   - No `eventID` (capped): `"capped"`.
   - In fixture mode the signed-out path applies.

```json
{ "status":"saved", "awardedXP":20, "capped":false, "kind":"no_trade_respected",
  "xp":140, "level":{…}, "streak":3, "evolution":null, "unlocks":[], "planting":"signed_out",
  "thesis":{ "id":"<requestId>", "symbol":"NVDA", "name":"Nvidia", "isEquity":true, "verdict":"wait", "direction":"none",
             "price":225.07, "support":221.1, "resistance":230, "entry":null, "stop":null, "target":null,
             "asOf":"2026-09-25T20:00:00.000Z", "provider":"Yahoo Finance", "savedAt":"<ISO>",
             "horizonHours":null, "points":20, "synced":false } }
```
`Thesis` is the object stored in the ledger. `synced` is true once its award event is no longer pending.

---

## 3. Engines

### 3.1 Engine core (both engines)

- Keep the approved shader, the spring integrator (`V` in v2, `W` in onboarding), the render passes and the adaptive quality exactly as in the prototype.
- **Delete** the scripted time base: `LOOP`, loop-time `T` gating, `EV` rows keyed on loop time, `GH`/ghost finger, `QWORDS`/`USYL`/`BSYL`/`CAPS`/`PAGES`/`TXW`, `FACE_SW`, `PICK_IDS`/`CHOSEN`, and the fake iOS alerts.
- **FSM + cues.** Each `EV` row becomes a cue inside a transition, fired by `at(dt, fn, gen)` with `dt = row time − beat start`. Entering a state bumps `gen`, which cancels the previous state's pending cues, so every transition is interruptible. Renderers read `clk − mark(k)` (onboarding's born/gone pattern) instead of literal `T`. Every literal-`T` gate listed in the engine report (v2 l.1282–2140; onboarding p6/p7/p9) becomes a state flag or a stage timestamp.
- **Input is real.**
  - Pointer events drive the pill hold, the pull (rubber band `(1−1/(dy·.55/260+1))·260`, commit at 72 px or 500 px/s), the card track, the face drag (`θ = θ0 − dx/(0.9R)`, detent at ±1) and chips.
  - Velocity comes from a ~100 ms pointer history.
  - The tap-to-pause toggle, the keyboard seek and the `touchmove` blocker exist **only under `?harness=1`**.
- **Audio drives the glass.** `speech.level` replaces `sylAmp(USYL)`; `voice.level` replaces `sylAmp(BSYL)`. Each feeds `envA` / `env250` exactly as the synthetic envelopes did. When muted or silent, a reading clock at 2.6 words/s plus the syllable envelope from `NucleoReadModel.wordTimes` drives the same inputs.
- **Faces are N-dynamic.** Show only faces that have content: Desk (always), Squad (when a companion is chosen), Theses (ledger not empty), Isla (`island().available`). Record is never shown in v1. `TAU/5`, `%5`, the 5 meridian dots and `FACES[]` become `N`. Returning to Desk is still exactly 2π.
- **Page identity.** `<body data-page="app">` or `"onboarding"`; the first bridge call is `session({page})`. Native labels are uppercase (`MIRA`), so engines title-case them for display.
- **Harness determinism survives.** `?harness=1&script=<name>&t=<s>&freeze=1` replays scripted user input (a pointer/ghost table) on the sim clock. The engine calls `nucleoBridge.mock.useClock(simMsFn)` and then `nucleoBridge.mock.pump()` every sim step, so mock events land on the same frame on every run. Harness code must do nothing when `nucleoBridge.mock` is null (native, or a release build).
- **Strings.** Every UI string lives in a per-engine table with `en` and `es`, selected by `session.language`. Read-derived copy comes from `NucleoReadModel`.
- **Typing.** Use a real `<textarea>` placed **outside** the scaled stage (`position:fixed`, lifted with `visualViewport`), with `enterkeyhint="send"`. Text is committed through the same word-birth/bead choreography as speech.
- **Reduced motion** follows DIRECTION §3.7 when `session.reducedMotion` or `?rm=1`.

### 3.2 Daily engine state machine (`app.html`, Builder B)

"Cues" names the prototype `nucleo-v2` rows to reuse; their times are relative to the state's entry.

| State | Entered on | Choreography reused | Leaves on |
|---|---|---|---|
| BOOT | page load | none (black `#0B0A09`) | `session()` → WAKE. If `pendingRead` → RESTORE |
| WAKE | session | B0 0.00–0.90. The greeting comes from `localHour` plus the strings table; the sub line is the latest ledger thesis ("NVDA is saved.") or the default prompt. The XP arc is `level.progress`. The avatar is the `COMPANIONS` art for `companion.webId`. | → IDLE |
| IDLE | | B1 breath; pill glow in antiphase. While `hints.idle < 3`, two hint rows show, each next to what it is about: "HOLD TO ASK" above the pill ("TAP TO TYPE" when the mic cannot listen), and "SWIPE THE SPHERE" under the sphere while it has other faces and none has been visited yet. | pill pointerdown: `mic.state` granted → LISTENING, undetermined → PRE_PERMISSION, else TYPING. Pill tap <250 ms → TYPING. Horizontal drag on the sphere → FACE_DRAG. Chip → SENDING. Tap on the header avatar → `openNative("account")` (also from FACES and HANDBACK). Long press on the wordmark → `openClassic` (dev builds only) |
| PRE_PERMISSION | first hold with mic undetermined | onboarding O3 card (bloom from the bottom rim): "I only listen while you hold." / "iOS will ask for the microphone and speech recognition once." / **Continue** | Continue → `speech.requestPermission` → granted: IDLE with hint "Hold to ask"; `consent` (the Apple speech prompt followed and the user chose to type): TYPING; otherwise IDLE with the unavailable hint |
| (pill hold, mic not granted) | hold ≥ 0.25 s from a cached `unavailable`, `denied`, `restricted` or `consent` | The cached `session.mic` goes stale (the connection came back, a dictation model was installed), so the page calls `speech.permission` again and acts on the fresh answer; `denied` and `unavailable` are kept as native reports them. A short tap asks nothing and types. | `granted`: LISTENING in the same hold (or the hint "Hold to ask" if already released); `consent`: `speech.requestPermission` (the native prompt; allow → hint "Hold to ask", type → TYPING). The prompt's answer is followed where the hold began, or in IDLE / RETURNING if the glass went home under the alert (ERROR lasts 6 s); it never interrupts a read that began meanwhile. `undetermined`: PRE_PERMISSION; otherwise the unavailable hint |
| LISTENING | `speech.start` → listening | B2 3.00–3.15 on press. Words are born from the `speech.partial` diff: the stable prefix keeps its spans, new words rise, revised tail words re-roll, and the tail stays ink2. | pointerup → `speech.stop` → wait for `speech.final` → SENDING, or STT_EMPTY if `""`. `speech.error` → IDLE with a hint |
| TYPING | | textarea rises from the pill | send → SENDING; blur or empty → IDLE |
| SENDING | question text | B2 5.90–6.80: gather, bead, dimple, gulp, header dock (types the real question). Calls `ask`. | → RESOLVING |
| RESOLVING | | the pill shows the think dots after 1.2 s | `ask.stage accepted` → THINK_WAIT. An early reply: `confirm` → CONFIRM_ASSET, `unknown_asset` → UNKNOWN_ASSET, any other non-ok → ERROR |
| CONFIRM_ASSET / UNKNOWN_ASSET | | caption exhaled from the rim (`failure()` copy + `sub`), with chips born from the pill | chip `{token}` → SENDING (`ask({token})`); "Something else" → TYPING |
| THINK_WAIT | accepted | B3 6.70–10.40 as a **loop**: agent labels show **names only**, tethers, duel. ω ramps 1.6→2.6 over 0.8 s, then holds with ±12% modulation on 2B. After 15 s exposure drops to .06; after 30 s sparks fire on every other crossing. The header shows the price from `ask.stage market`. Hint row: elapsed seconds from 8 s; "Still weighing · deep reads take up to a minute" at 30 s; "Taking longer than usual · tap to cancel" at 75 s. | reply `ok` and `clk − tThink ≥ floor` (4.5 s on the first read of the session, else 1.5 s) → THINK_RESOLVE. Non-ok → ERROR. Pill tap → `cancel()` → CANCELLED |
| THINK_RESOLVE | | Stances (`model.agents[i].stance`, the first sentence) reveal word by word at 45 ms/word: Alpha at +0, Red at +0.55, CIO at +1.10; 2-line clamp with ellipsis. Hold 1.6 s, then B3 10.40–12.60: "Verdict forming", converge, IMPACT 1, hush, filament. **On entry, call `speak({id: requestId, text: model.spoken.text})`** so the TTS fetch overlaps the choreography. | choreography done **and** (`voice.start`, `muted`, or 14 s without start → call `stopSpeaking` and go silent; 6 s cancelled most persona-voice reads) → TALK_EVIDENCE |
| TALK_EVIDENCE | | B4: satellites from `model.satellites` (4 slots, clockwise UL→UR→LR→LL; odometer `from`→`value`). Caption pages are the spoken sentences packed into ≤2-line pages; the karaoke timeline comes from `voice.word` (device), else `wordTimes(text, durationSec)` driven by `voice.progress`, else the reading clock. | the karaoke reaches sentence `spoken.stageAt.chart` (or sentence 0 ends plus 0.3 s when null) → TALK_CHART; skip if `model.chart == null` |
| TALK_CHART | | B5: the chart is built from `model.chart` (48 closes, domain, 2 gridlines, NOW = last close, support **band** `band.lo…band.hi` labelled `band.label`, resistance line, plan lines only when present, bracket NOW→support at +0.30 s after the band, x-label `1H · provider · instrument · as of <local time>`). There is no earnings marker. | the karaoke reaches `spoken.verdictWordIndex − 0.03 s` → VERDICT |
| VERDICT | | B6: satellites retract, filament collapse, IMPACT 2 in `verdict.color`; `uV`/scrim core = `verdict.core`. `verdict.word` condenses 30 ms before the spoken word, and that caption word takes the verdict colour. Ring: in `conviction` mode it fills to `pct` with odometer digits and `label`; in `complete` mode it draws 0→100% in 1100 ms with no digits and no label. Meta line = `model.meta` + `asOf`. | `voice.end` (or the reading clock ends) → HANDBACK |
| HANDBACK | | two sags; hint "Pull down for the full read ⌄" while `hints.verdictPull < 3` (then `markHint`). The pill is a mic again. One second in, the last spoken line goes back into the glass and **the read's chips** (§3.5) are born in its place, the CIO's next question first; the meta line keeps its place under them. No nudge and no eyebrow here. | chip → SENDING or TYPING (§3.5); vertical drag → PULLING, also when the finger went down on a chip (the row leaves for the cards and returns if the pull is let go); pill hold → RETURNING, then LISTENING; × → RETURNING; 90 s idle → RETURNING |
| PULLING | | B7 25.50–26.10, tracked 1:1 | commit → CARDS; release before commit → HANDBACK |
| CARDS | | B7 26.10–27.90: the track has three cards. **Debate**: `model.debate`, full texts, internal 1:1 scroller if needed. **Thesis**: `model.thesis`; horizon control when `thesis.horizon.show`. **Isla**: only if `island().available`. | Save → SAVING; × → RETURNING |
| SAVING | Save press | B8 28.90–30.12: press, label roll, conic sweep; `saveThesis({requestId, horizonHours})`. The XP chip = `xpChip(awardedXP, verdict.key, lang)` (hidden if the save failed); the tpill `thesis.pill` arcs in. `evolution`/`unlocks` show as one caption line. | → FOLLOWUPS |
| FOLLOWUPS | | B9 chips born from the pill, above it: the same read's chips as at HANDBACK (§3.5), behind the nudge when there is one, under the eyebrow. **Each sent chip is a paid desk read.** | chip → SENDING or TYPING; × or timeout → RETURNING |
| RETURNING | | B10 33.20–35.00: cards retract before the sphere moves, the verdict evaporates, the ring unwinds, the flood recedes, the tint returns. The ghost satellite comes from `theses().items[0]` if it was saved this session. | → IDLE |
| FACE_DRAG / FACE(k) | drag in IDLE | B11 physics with the real pointer. Isla: `island()` summary and a chip that calls `openNative("isla")`. Squad: `roster()` belt plus `level`/`streak`, chip `openNative("squad")`. Theses: 2 satellites from `theses()`; tapping one opens its card read-only. | detent at Desk → IDLE |
| ERROR(kind) / CANCELLED | | caption from `NucleoReadModel.failure()`. **No verdict, no ring, no XP.** The pill returns to mic. | 6 s or a tap → RETURNING |
| RISK_GATE | reply `error/risk_not_accepted` (`failure().kind == "risk"`) | caption "First, the risk notice." plus one chip | chip → `openNative("riskNotice")` (native swaps in the risk beat); tap elsewhere or 30 s → RETURNING |
| SIGNIN_GATE | reply `signin_required` (`failure().kind == "signin"`) | glass first: one line from the rim, "Create your free account to keep reading — 20 free reads a week.", the white **Sign in with Apple** chip (Apple logo U+F8FF, system font) and "Not now" | Apple chip → `signIn()`; `signedIn` → SENDING with `{token: retry}` (the same question, asked again automatically); `cancelled` stays; other → hint. "Not now", a tap elsewhere or 45 s (not while signing in) → RETURNING |
| PRO_GATE | reply `subscription_required` (`failure().kind == "subscription"`) | one line "You’ve used this week’s free reads.", sub "They reset {date}. Bobby Pro has unlimited reads." (date from `access.resetsAt`), chips "See Bobby Pro" and "Not now". The Bobby Pro sheet opens **by itself once** (+1.2 s), never right after a purchase-retry | "See Bobby Pro" → `paywall()`; `subscribed` → SENDING with `{token: retry}`; `pending`/`failed` → hint; "Not now", a tap elsewhere or 45 s → RETURNING |
| RESTORE | `pendingRead` at boot | builds the model (origin `restored`, §3.5) and jumps to the settled HANDBACK frame: no caption, the read's chips at once (reduced choreography) | as HANDBACK |

### 3.3 Onboarding state machine (`onboarding.html`, Builder C)

| State | Reuses | Data |
|---|---|---|
| BIRTH (O0) | O0 0.00–2.80, plays once | only when `session.firstRun && companion == null` |
| HELLO (O1) | O1 2.80–7.60: trailer duel, ivory soft impact | Onboarding copy from the strings table, spoken with `speak()` (default voice, before the companion is assigned), karaoke per §3.2; then ASK_TEACH |
| ~~PICK (O2)~~ | removed 2026-09-26 (owner's decision): the glass leads the first run | There is no picker. When HELLO ends, `ensureCompanion()` silently assigns the default starter with the old picker rule (the first `roster()` entry with `requiredLevel == 1 && unlocked` whose id is not `orb`) through `setCompanion({id})`, and goes straight to ASK_TEACH. The header avatar fades in and the rim glides to the companion tint; the companion never surfaces as the hero. The avatar is part of the profile: `AccountSheet` (header avatar → `openNative("account")`) has a "Your avatar / Tu avatar" row that opens `MascotGalleryView`. If `finishOnboarding` still reports `missing: ["companion"]`, the page assigns the default and finishes again. |
| ASK_TEACH (O3) | O3 title/sub/chips, pre-permission card | Chips come from `suggestions()` via the strings template ("How is {SYM} looking?" / "Why is {SYM} moving today?" only for `movers`). The pre-permission card uses **Continue**, then `speech.requestPermission()`, which triggers the **real** OS prompts; the fake alerts are deleted. Denied or unavailable → typing. A hold from a state that cannot listen re-queries `speech.permission`, and the `consent` state raises the native Apple speech prompt before anything is captured (the first capture happens before the risk notice), exactly as in §3.2. LISTENING/TYPING as in §3.2; the question becomes the bead, which is **not sent yet** |
| RISK (O4) | O4 ring + hold-to-agree, the same geometry as the conviction ring | `riskNotice()`: the 4 `title`s are the pulse-swept lines, with statement 1's `body` below them (Geist 13 ink2). "Read the full notice" calls `openNative("riskNotice")`. Completing the 1200 ms hold calls `acceptRisk({version})`; an early release unwinds with no copy |
| READ (O5) | O5, as the daily THINK→VERDICT states | `ask({question})`. First-read options: `build(r, {firstRead:true})` (3 satellites), a 4.5 s floor. The conviction explainer hint appears only when `ring.mode == "conviction"`. Non-ok replies use the daily ERROR/CONFIRM patterns; after an error the chip "Try another question" returns to ASK_TEACH. A metered refusal (§8.3) shows the same ERROR caption with the Apple (or Bobby Pro) chip first: `signIn()` / `paywall()`, then `ask({token: retry})` |
| SAVE (O6) | O6 cards opening on **Thesis** | Button "Save thesis" (there is no "Watch & ping me" and no notifications alert). The horizon row shows only if `thesis.horizon.show`. The XP chip uses the real `awardedXP`; this is the only reward |
| SIGN_IN (O7) | O7 sheet poured from the sphere base | Only if `!signedIn` after the first save. **Sign in with Apple** (HIG white button, 50 tall; the Apple logo is U+F8FF in the system font) calls `signIn()`. **Not now** leads to "Saved on this device". There is no Google button |
| ISLA_PEEK (O8) | O8 | Only if `thesis.planted` arrives with `seed`/`bloomed` (signed in). Otherwise skip it; the meridian dots are still born for the faces that have content |
| HOME (O9) | O9 greeting, chips, first-ever hint | then `finishOnboarding()`; native cross-fades to `app.html` |
| RISK_ONLY | `#risk` entry | RISK, then `finishOnboarding()` |
| resume | `firstRun && companion != null` | start at ASK_TEACH |

### 3.4 Data mapping and missing fields (`src/shared/20-read-model.js`)

`NucleoReadModel.build(askResult, {lang, firstRead, signedIn})` returns the model the engines render. `failure(result, lang)` returns the caption and chips for any non-ok reply. `xpChip(points, verdictKey, lang)`, `wordTimes(text, durationSec)`, `sentences`, `money` and `t` are helpers. The rules, which `tests/read-model.test.mjs` pins:

| Element | Source | When missing |
|---|---|---|
| Verdict word/colour | `agents.verdict` (R6) | This field always exists on ok |
| Ring | `pulse.convictionPct` only if R5 agrees | `{mode:"complete"}`: full ring, no digits, no "CONVICTION" |
| Agent labels | names only while waiting; `stance` = the first sentence of each text after the reply | not applicable (always 3 texts) |
| Satellite UL | symbol, `market.price` (else `technicals.price`), `changePct` ▲/▼; odometer from the previous 1H close; dot mint/coral by sign | no price: the satellite is dropped; no change: no delta and a neutral dot |
| Satellite UR | RSI 14 (rounded), "hot"/"cold" from momentum; coral dot at the extremes | dropped |
| Satellite LR | volume of the last closed bar ÷ the mean of the previous 20 (bars with v>0 and fully closed before `receivedAt`) | fallback: trend (Up/Down/Sideways, "EMA 20 / 50") |
| Satellite LL | 30h range support–resistance | dropped |
| Chart | last 48 candles; support band = support…support+ATR (capped at NOW); resistance line; plan lines only when R5 agrees | fewer than 10 candles: no chart state |
| Captions/voice | `spoken` (R7): CIO sentences ≤600 chars plus the closing line; `stageAt` indices | not applicable |
| Thesis card | price at read, then either (plan: reference entry, stop, target) or (support, resistance), then trend · RSI | rows whose value is missing are dropped |
| Debate card | the three full texts; "3 agents · N s" from `elapsedMs` | not applicable |
| Meta | "Educational read · not financial advice" / "Lectura educativa · no es asesoría financiera" | not applicable |
| Next question | `synthesis.followUp`, as written by the desk, when it passes every check of §3.5 (`model.next`) | the fixed chip takes its slot; nothing says why |

Nothing else is shown. Earnings, volume "avg" claims beyond the computed ratio, calm-entry language, targets without an agreeing pulse, and follow-ups the page invents are all forbidden (R9).

### 3.5 The next question and the read's chips (`followUps()`, 2026-10-07)

On every read the desk's CIO writes one next question, specific to what was just asked: `synthesis.followUp` in the desk reply, a string of at most 160 characters. Native carries it to the page inside the reply's `synthesis` object (`{headline, why, risk, watch, followUp?}`; the key is absent when the server sent none or sent more than 160 characters, so a reply without it is byte for byte what it was). The page decides whether it is shown. No model call is added and nothing about the reader is involved.

**The row.** `NucleoReadModel.followUps(model, suggestions, lang)` returns at most three chips, drawn at HANDBACK (when the voice ends, no save needed) and again in FOLLOWUPS after a save:

1. The CIO's question, as written (`style: "ask"`, action `{followUpOf: requestId, question, next: true}`), when `model.next` is set.
2. "Another question about {SYM}" (action `{followUpOf}`: the person types their own).
3. Real symbols from `suggestions()`: the person's quick access first; the day's movers only in a slot quick access left empty; never the current symbol. Two of them when there is no question, one when there is.

**The checks** (`NucleoReadModel.nextQuestion(text, symbol, lang, asked)`; each failure has a reason the tests pin, and the person sees only the fixed chips):

| Reason | Rule |
|---|---|
| `missing` | not a string, or empty |
| `long` | more than 90 code points after collapsing white space |
| `number` | any digit outside the asset's own ticker (`PETR4.SA`, `PETR4`), any currency sign, `%`: no price, no level, no figure |
| `shape` | fewer than 8 code points; anything but letters, the ticker's digits and plain punctuation; not exactly one sentence ending in its question mark |
| `opener` | it does not open with a what / why / which word of the reply's language (`NEXT_OPENS`, after a leading preposition where the language sets one): Bobby's own question asks what or why, never whether or when to act |
| `word` | a word of `NEXT_FORBIDDEN`: buy, sell, profit, guaranteed, returns, advice, signal, alert with their conjugations and compounds in en, es, fr, pt, it, de. **This is the one list**; it lives in `src/shared/20-read-model.js` only |
| `same` | it is the question this read just answered (a tap would ask it for ever) |

The checks over-reject on purpose: a chip that is not shown costs nothing. One more check needs the drawn chip: `.chip.ask` keeps the type of every chip and may take two lines of the 350 px row; `fitNext()` measures it once per read and clears `model.next` when it would need a third.

**The tap.** `ask({followUpOf, question})`, the path that already existed: native reuses that read's asset, so the page still names none (R3), and the read is an ordinary paid read asked as the person's own question. Native compares the question with the one it sent the page for that read (white space apart) and, when they match, tells the harness that a Bobby-authored question was picked: `NucleoDesk.nextQuestionPicked` → `HarnessCenter.notePicked(symbol:)`, which records only while it may record. The words are never stored.

**Withholding it.** Native can keep the question from the page: `NucleoDesk.offersNextQuestion(access)` is asked once per read with that read's access receipt, and when it answers no the key does not travel (the page then shows its fixed chips and knows nothing of it). It answers yes for every read today; the rule that Bobby never offers a one-tap question the meter would refuse belongs there, with no change to the page.

**Who started the read.** `READ.origin` is `person` (they asked), `followUp` (native started it: the page sets it around its `ask.start` handler) or `restored` (a page restored from `pendingRead` no longer knows). A read that continues the one on screen (a retry or confirm token, a `followUpOf`) keeps that read's origin, so a thread Bobby started stays one. `build(reply, {origin})` puts it in the model, and `followUps()` gives a read that is not the person's own **no mover chip and no starter**: its row is about their own question and their own assets only (quick-access entries native marked `own: false` are left out; an entry without the mark counts as their own). A read of the person's own keeps the row of before: quick access, starters included, and a mover only in a slot quick access left empty.

---

## 4. Fixtures and mocks

### 4.1 Real captures (desk budget)

Captured 2026-09-26 with the exact app requests (`Origin: https://bobbyprotocol.xyz`, the same bodies), in `fixtures/raw/`:

| File | Request | Result |
|---|---|---|
| `desk-debate.nvda.json` | `{symbol:"NVDA", question:"Should I buy NVIDIA right now?", language:"en", assetType:"equity"}` | 200, **wait/none**, 5.4 s, asOf 2026-09-25T20:00Z (Yahoo) |
| `desk-debate.btc.json` | `{symbol:"BTC", question:"Is now a good time for Bitcoin?", language:"en", assetType:"crypto"}` | 200, **wait/none**, 4.4 s, asOf 2026-09-26T11:00Z (OKX) |
| `asset-search.{nvda,btc,fuzzy,proxy,none}.json` | POST asset-search (quota-free) | exact / exact / fuzzy→NVDA / proxy→XAUT (commodity) / `resolution:null` |
| `candles.{nvda,btc}.json` | `stock-candles?symbol=NVDA&range=7d&interval=1h` (50 bars; the last is a v=0 price stub) · `okx-candles?instId=BTC-USDT&bar=1H&limit=100` | |
| `market.*.json`, `pulse.*.json` | voice-tool `get_market` / `run_debate` (quota-free, no LLM) | NVDA pulse neutral 10%, no plan (okx-indicators on NVDA-USDT-SWAP); BTC pulse strong_long 59% with a plan (intel) |
| `desk-debate.{quota,too_long,failed,unavailable,gateway_timeout}.json` | **synthetic** (`"synthetic": true`), with bodies copied from `api/desk-debate.ts` | |

**Desk-debate quota ledger for this workflow (maximum 5):**
- Architect: **2 used** (11:36:10Z and 11:36:14Z).
- Integration: 2 remaining.
- Review: 1 remaining.

No real `review` verdict exists yet. The review path is covered by test-only synthetic variants built inside `tests/read-model.test.mjs`. If integration's live read happens to return `review`, save it as `fixtures/raw/desk-debate.<slug>.json`, add it to `normalize.py`, and regenerate.

### 4.2 Golden replies

Running `python3 ios/Bobby/Nucleo/fixtures/normalize.py` writes `fixtures/ask/*.json` and `fixtures/manifest.json`.

- Replies:
  - `nvda`, `btc`
  - `quota`, `too_long`, `failed`, `unavailable`, `gateway_timeout`
  - `confirm-fuzzy`, `confirm-proxy`
  - `unknown`, `unsupported-proxy`
  - `cancelled`, `timeout`, `network`, `risk`
  - `signin-required`, `subscription-required` (from the synthetic `raw/voice-tool.{signin_required,subscription_required}.json`, §8.3; `token` is volatile like a confirm token)
- Volatile keys: `requestId`, `elapsedMs`, `fixture`. **Native fixture mode must reproduce every golden reply JSON-equal, apart from those keys.** The contract page checks this in the app.
- `fixtures/native/{roster,levels,risk-notice}.json` are snapshots of `Companion.swift` and `RiskNoticeView.swift` for the mock. If native copy changes, re-snapshot them; the contract page catches drift.

### 4.3 Browser mock (`src/shared/90-dev-mock-bridge.js`)

It installs itself only when `window.webkit.messageHandlers.nucleo` is absent. It answers every method from the inlined `NUCLEO_FIXTURES`, matches questions through `manifest.assetSearch` (the same rules native uses), follows the §2.4 order, and fakes STT (seeded irregular word timing plus a level envelope) and TTS (syllable envelope, `voice.word`, `voice.progress`).

URL parameters:
- `scenario=default|slow|hang|quota|too_long|failed|unavailable|gateway_timeout|offline|signin_required|subscription_required` (the last two refuse every metered read until `signIn` / `paywall` succeed; `subscription_required` starts signed in)
- `signin=ok` (`signIn` succeeds), `purchase=ok` (the Bobby Pro sheet ends `subscribed`; it resolves on wall time, since a native sheet is not on the page clock)
- `lang=en|es`
- `first=1` (first run: no companion, risk not accepted)
- `signedIn=1`, `signin=ok`
- `risk=0`
- `muted=1`
- `companion=<iOS id>`
- `mic=granted|denied|undetermined|unavailable`, `grant=0` (a user who denies)
- `say=<text>`
- `latency=<ms>`
- `xp`, `streak`
- `rm=1`
- `debug=1` (logs haptics)
- `followUp=<text>` (every ok reply carries a synthesis whose next question is that text, §3.5)

Hooks:
- `nucleoBridge.mock.useClock(fn)` and `.pump()` for sim-clock determinism.
- `.say(text)` sets the next STT utterance.
- `.setMic(state)`.
- `.startRead(key, question)` does what native does on a follow-up's tap: a single-use token, then `ask.start`.

### 4.4 App fixture mode (`-nucleo-fixtures [scenario]`, DEBUG only; Builder A)

`NucleoFixtureProtocol` is registered with `URLProtocol.registerClass` before any request; this is the pattern of `B34Stub`. It serves `Bundle.main/Nucleo/fixtures/raw` by path, reading POST bodies from `httpBodyStream`:

| Request | Served |
|---|---|
| `api/bobby-asset-search` POST | `manifest.assetSearch` rules on lowercased `q`; the first match wins |
| `api/bobby-asset-search?browse=1` | `{"ok":true,"browse":{},"movers":[]}` |
| `api/okx-tickers` | `{"tickers":[]}` |
| `api/stock-candles?symbol=S…`, `api/okx-candles?instId=S-USDT…` | `bySymbol[S].candles`, else 502 `{"error":"No chart data"}` |
| `api/voice-tool` | `get_market` → `bySymbol.market`; `run_debate` → `voice-tool.<scenario>.json` (401/402) under `signin_required`/`subscription_required`, else `bySymbol.pulse`; otherwise `{"symbol":S,"available":false,"price":null}` |
| `api/bobby-access` | GET → `{access (the gate capture's, else null), signedIn:false, subscription:null, payments:{stripe:false, apple:true}}`; POST → 401 (fixture mode is signed out) |
| `api/desk-debate` | the scenario file if the scenario is a refusal, else `bySymbol[S].debate` |
| `api/bobby-voice-free` | 503 `{"error":"TTS failed"}`, which puts NeuralVoice on the free device voice; not intercepted under `-nucleo-fixtures-live-voice` |
| `qbvdqkknnuweatptjohi.supabase.co` | `URLError(.notConnectedToInternet)` |
| any other bobbyprotocol.xyz path | 404 `{"error":"not in fixtures"}` |

- **Latency.** `desk-debate` takes `min(elapsedMs, 6000)` ms by default, 45 s under `slow`; `hang` waits 20 s and then fails with `URLError(.timedOut)`. All other requests take 150 ms. Under `offline`, every request fails with `.notConnectedToInternet`.
- The mode forces signed-out behaviour: `signedIn:false`, `signIn → unavailable`, no bearer on metered reads, RevenueCat never configured, and `ProgressSync` is never called.
- `NucleoFixtures.accessHeaders` records, per request to voice-tool / bobby-access / desk-debate, the path (`#tool` for voice-tool), `x-bobby-device`, `x-bobby-platform` and whether a bearer was present (never the token).
- Set `session.fixtures = true`.
- Set `receivedAt` to the capture's `recordedAt`.
- The fixture code is compiled only in DEBUG.

---

## 5. Privacy and App Review

- **Info.plist.** Add these in `project.yml → targets.Bobby.info.properties`, because XcodeGen regenerates `Sources/Info.plist`, and add them to `Sources/{en,es}.lproj/InfoPlist.strings`:
  - `NSMicrophoneUsageDescription`
    - en: "Bobby listens only while you hold the button, to hear your question."
    - es: "Bobby solo escucha mientras mantienes presionado el botón, para oír tu pregunta."
  - `NSSpeechRecognitionUsageDescription`
    - en: "Bobby turns your spoken question into text: on this iPhone when the language is installed, otherwise through Apple's speech service. Bobby does not store the audio."
    - es: "Bobby convierte tu pregunta hablada en texto: en este iPhone si el idioma está instalado; si no, mediante el servicio de voz de Apple. Bobby no guarda el audio."
  - Update `Tests/ReleaseAuditTests.testAvatarNarrationDoesNotRequestMicrophoneOrSpeechRecognition` **deliberately**: rename it, then assert that both keys exist and are non-empty, and that the request is on-device whenever the recognizer holds the local model (unit-test the request factory).
- **Speech.** Recognition is on-device when the language model is installed and otherwise goes through Apple's speech service (R8); Bobby itself collects no audio, so `PrivacyInfo.xcprivacy` needs no new data type. The transcript is sent only when the user releases the pill, as the question, which is already declared as user content. The mic is active only while the user holds the pill, and it stops on background.
- **Two OS prompts, microphone then speech,** both after the in-app pre-permission card ("Continue", never "Allow", no "Not now"). The app never shows a fake alert. When only Apple's speech service can transcribe the language, the app's own native prompt (R8, §2.6) follows them and comes before any capture. There is no notifications prompt and no ATT.
- **No advice language.** The verdicts are Wait and Review only. Every read carries "Educational read · not financial advice". The app has no Buy, Sell, profit, win or returns strings; `tests/read-model.test.mjs` lints the read-model tables, and Builders B and C lint their own tables the same way. The conviction number appears only when it is real and agrees with the desk (R5).
- **Consent before processing.** No `ask` reaches the network before `riskAccepted`; native enforces this (§2.4 step 2).
- **Sign in with Apple only;** "Not now" loses nothing. The account deletion path stays in `AccountSheet` (`openNative("account")`).
- **Metered reads and Bobby Pro (§8).** A random per-install UUID (Keychain) goes with every metered read: `PrivacyInfo.xcprivacy` already declares Device ID (linked, App Functionality); Purchase History (linked, App Functionality) is added for the subscription. The only purchase is an App Store auto-renewable subscription for analysis (RevenueCat SDK, StoreKit underneath). **No swap, buy/sell, trade or wallet feature exists on iOS**, and the paywall never points to a web checkout (guideline 3.1.1). The sheet shows the price from the App Store, the period, the auto-renewal terms, Restore Purchases, the Terms of Use (Apple's standard EULA; bobbyprotocol.xyz has no /terms route) and the Privacy Policy (guideline 3.1.2).
- **Bundled code only.** The pages come from the app bundle, and there is no remote JS. `connect-src 'none'`; the only external requests are Google Fonts CSS and fonts (R15).
- **Before any App Store submission** (not in this workflow): run `build.py --park-legacy` once, then `build.py --release`; remove the hidden long-press to the classic app, or make it a visible setting (guideline 2.3.1 on hidden features); and confirm that `showNucleo` in Release is intended.

---

## 6. Division of work and acceptance

The three builders work in parallel, and no file is owned by two of them. None may commit, push, upload, install on a device, deploy, or write to a DB beyond what a signed-out app session does. Use only simulator `9376EBA1-CA3E-4389-9EAF-EF1CD0212199` (iPhone 17 Pro), and never `attach`. In the browser, open your own tab and close it when you are done. **No builder makes a real desk-debate call**; integration owns the 2 remaining calls.

### 6.1 Shared gates (every builder runs these before reporting)

1. `python3 ios/Bobby/Nucleo/build.py` prints `NUCLEO_BUILD_OK`, and so does `--release`, whose pages contain neither `NUCLEO_FIXTURES=` nor `90-dev-mock-bridge` (grep the built pages). Rebuild in dev mode afterwards.
2. `node ios/Bobby/Nucleo/tests/read-model.test.mjs` passes. Its baseline is 36 tests (2026-09-27).
3. `contract.html` in the browser shows `PASS` for `?latency=300` (baseline 14 passed + 2 skipped: the risk gate and the metered refusal), for `?latency=300&first=1&lang=es` (15 passed + 1 skipped) and for `?latency=300&scenario=signin_required` / `subscription_required` (11 passed + 5 skipped each: the ok reads are refused there).

### 6.2 Builder A — native bridge (Swift)

**Owns:**
- New files:
  - `Sources/Nucleo/NucleoRootView.swift`: routing, the cross-fade, sheets, and the long-press exit wiring.
  - `Sources/Nucleo/NucleoWebView.swift`: configuration, security, navigation policy, crash reload, event emitter.
  - `Sources/Nucleo/NucleoBridge.swift`: dispatch, validation, replies.
  - `Sources/Nucleo/NucleoSession.swift`: the stores; `session`, `setCompanion`, `acceptRisk`, `riskNotice`, `roster`, `suggestions`, `markHint`, `signIn`, `openNative`, `finishOnboarding`.
  - `Sources/Nucleo/NucleoDesk.swift`: the `ask` pipeline, tokens, the reads cache, `cancel`, `saveThesis`, `island`, `theses`, `record`.
  - `Sources/Nucleo/NucleoLedger.swift`
  - `Sources/Nucleo/NucleoSpeech.swift`
  - `Sources/Nucleo/NucleoVoice.swift`: the `NeuralVoice` wrapper, events and watchdog.
  - `Sources/Nucleo/NucleoHaptics.swift`
  - `Sources/Nucleo/NucleoFixtures.swift` (`#if DEBUG`)
- Deletion: `Sources/NucleoPreview.swift`
- Edits:
  - `Sources/BobbyApp.swift`: routing and launch arguments.
  - `Sources/BobbyAPI.swift`: additive only; `prettyName` becomes internal, plus an optional response-with-headers helper.
  - `Sources/NeuralVoice.swift`: additive only (§2.6).
  - `Sources/RiskNoticeView.swift`: move the statements into `enum RiskNotice.statements(spanish:)` with the wording unchanged; the view reads from there.
  - `project.yml`, `Sources/{en,es}.lproj/InfoPlist.strings`
- Tests: `Tests/ReleaseAuditTests.swift` (the mic test, §5); new `Tests/NucleoBridgeTests.swift`; new `UITests/NucleoContractUITests.swift`.
- Shared JS: `src/shared/10-bridge.js` and `src/shared/90-dev-mock-bridge.js`. Keep the mock identical in behaviour to native.
- Run `python3 build.py --park-legacy` once `NucleoRootView` routes to `app.html`.

**Acceptance:**
- **A1.** `xcodegen generate`, then build and `xcodebuild test -scheme Bobby -destination 'id=9376EBA1-CA3E-4389-9EAF-EF1CD0212199'`, are green. `NucleoBridgeTests` covers:
  - golden equality through `NucleoFixtureProtocol` for `nvda`, `btc`, `quota`, `failed`, `unavailable`, `gateway_timeout`, `confirm-*`, `unknown` and `unsupported-proxy`;
  - envelope validation (each `invalid_params` case in the contract);
  - `forbidden` for a non-bundle frame URL;
  - single-use tokens;
  - `busy`;
  - the risk gate never hitting the network;
  - `saveThesis` idempotency, the generation guard (`stale`), and the cap (`awardedXP 0`, ledger still written);
  - `RiskNotice` statements equal to `fixtures/native/risk-notice.json`.
- **A2.** On the simulator, `-nucleo-fixtures -nucleo-page contract -AppleLanguages (en)` gives the contract summary `PASS`, including the `-nucleo-reset-onboarding` run that exercises the risk gate. Attach a screenshot.
- **A3.** The scenarios `quota`, `failed`, `hang`, `offline` and `slow` each produce the golden refusal or behaviour in the contract's ask calls. `URLProtocol` logs show no request left the process.
- **A4.** Routing: a reset launch shows `onboarding.html`; after `finishOnboarding` the app shows `app.html`; with a stale risk version it shows `#risk`; a long press on the wordmark opens the classic `ContentView`; a relaunch returns to Núcleo.
- **A5.** STT on the simulator: the first `speech.start` produces `needs_permission`; `requestPermission` shows two OS prompts in order; after granting, the partials and final flow. After stop, `speak` plays, which proves the audio session was restored. Recognition is on-device when the model is installed, otherwise through Apple's speech service (R8).
- **A6.** The Release configuration compiles with the fixture code absent (`#if DEBUG`), and `build.py --release` output contains no mock.
- **A7.** No real desk-debate call. All tests use fixtures or stubs.

### 6.3 Builder B — daily engine (`app.html`)

**Owns** `src/app/*`, `src/shared/20-read-model.js` and `tests/read-model.test.mjs`. Start from `design/prototype-src/nucleo-v2.src.html`, split into `template.html` plus ordered parts.

**Acceptance** (browser mock at `http://localhost:4614/Resources/Nucleo/app.html`, your own tab):
- **B1.** It loads with no console errors and no network requests other than Google Fonts. It holds ≥55 fps in desktop Chrome through a full read, with no frame over 50 ms after warm-up.
- **B2.** A live loop with real pointer input:
  1. Hold the pill; partials appear; release.
  2. The NVDA read runs: THINK_WAIT, then stances, then four satellites (`$225.07 ▲0.22%`, RSI 64, Volume 1.2×, Range $221.10–$230.00).
  3. The chart shows 48 closes, the support band and the "+3.97 above support" bracket.
  4. The verdict **Wait** appears in amber with a **completion ring and no %**, synced to "wait." in the caption.
  5. Pull; the cards show the full texts and "3 agents · 5 s"; Save shows "+20 discipline XP for waiting".
  6. Return; the ghost satellite reads "NVDA · WAIT".
  7. Faces are Desk, Squad and Theses only (signed out: no Isla; no Record).

  Repeat with the BTC question.
- **B3.** Scenarios:
  - `quota`, `failed`, `unavailable`, `gateway_timeout`, `offline`: an honest caption, no verdict, no XP, back to idle.
  - `slow`: the hint copy at 8 s and 30 s; with `latency=80000` the 75 s line appears; cancel from THINK_WAIT reaches idle.
  - `hang`: the timeout caption.
  - "Should I buy gold?": confirm, then the unsupported caption.
  - "how is nvidea doing": confirm, then the NVDA read.
  - "hello how are you": the unknown caption.
  - `mic=denied`: the typing path. `mic=undetermined`: the pre-permission card, then granted.
- **B4.** Determinism: `?harness=1&script=read-nvda&t=<s>&freeze=1` renders an identical canvas hash on two loads for each hero frame (idle, listening, duel, satellites, chart, verdict, thesis card, saved + XP, Squad face). List the times in your report.
- **B5.** A grep of `src/app` finds no hardcoded market values or prototype copy: `178.40`, `168`, `172`, `64%`, `CALM ENTRY`, `EARNINGS`, `Demand is still`, `Wait for the pullback`, `level 12`, `41 calls`. Harness scripts may contain a spoken question only. The copy lint passes for `src/app` strings. The mint/amber/coral hues appear only on agent and verdict elements.
- **B6.** With `?lang=es` every UI string is Spanish (verdict "Espera", caption closing "Mi lectura: esperar."). `?rm=1` follows DIRECTION §3.7.
- **B7.** Extend `tests/read-model.test.mjs` for every read-model change you make, and keep it green.

### 6.4 Builder C — onboarding engine (`onboarding.html`)

**Owns** `src/onboarding/*`. Start from `design/prototype-src/onboarding/*`. It has its own shader copy, and the risk entry `#risk` lives inside the same page.

**Acceptance** (browser mock at `.../onboarding.html?first=1`, your own tab):
- **C1.** A full first run with real input:
  1. Birth, then hello (mock voice karaoke).
  2. No picker (since 2026-09-26): after hello, `setCompanion` is called once with the default starter (`byte` in the fixtures) and the run goes straight to ask-teach; the avatar and tint follow it quietly.
  3. Ask-teach chips come from `suggestions()`. With `mic=undetermined`: Continue, then `requestPermission`, then hold-to-ask. The question waits as the bead.
  4. The risk beat shows the **4 real statements** (and the Spanish ones under `lang=es`). An early release unwinds; the full hold calls `acceptRisk`.
  5. The read has 3 satellites and honours the 4.5 s floor.
  6. The thesis card: "Save thesis", no horizon control, no "Watch & ping me".
  7. The XP chip shows "+20 discipline XP for waiting".
  8. The sign-in sheet has Apple and "Not now" only; "Not now" leads to "Saved on this device".
  9. No Isla peek (signed out).
  10. Home, then `finishOnboarding` is called.
- **C2.** A grep of `src/onboarding` for `ALERTS`, `Would Like to`, `PICK_IDS`, `CHOSEN =`, `Watch & ping`, `Continue with Google`, `CALM ENTRY`, `178.40`, `Mira it is.` returns 0. (The picker and its celebration line are gone since 2026-09-26.)
- **C3.** With `mic=denied`, the typing path completes the whole run. `#risk&risk=0` runs only the risk beat and then `finishOnboarding`. `first=1&companion=kora` resumes at ASK_TEACH.
- **C4.** Errors during the first read (`scenario=quota|failed|offline`) give an honest caption and "Try another question", with no XP and no sign-in sheet.
- **C5.** Determinism: `?harness=1&script=first-run&t=<s>&freeze=1` gives identical hashes for the hero frames (born, ask, mic card, risk ring filling, debate, verdict, saved + XP, sign-in sheet, home).
- **C6.** Spanish and reduced motion, as in B6.

### 6.5 Integration (after A, B and C report)

1. Build the dev pages, run `xcodegen generate`, and build to the simulator.
2. In fixture mode, walk onboarding and then the daily loop, using simulator screenshots and JS evaluation through the inspector-free contract page.
3. With fixtures off and signed out, make **at most 2 real reads**, for example ETH and a stock. Confirm the whole pipeline, the voice, and that `ProgressSync` makes no call while signed out.
4. Run `build.py --release`. The review agent gets 1 desk call.

---

## 7. Open product decisions for Anthony (defaults applied; flip later)

1. **XP on Save** rather than on every completed read (R4). Default: on Save.
2. **Conviction ring** shows a number only when the engine pulse agrees with a Review verdict; otherwise it is a completion ring (R5). Both real reads today were Wait, so there is no number yet. The alternative would need a backend conviction from the CIO itself, which requires a backend change (out of scope; the backend is read-only).
3. The **Review** verdict colour is mint (R6).
4. **Saved thesis levels are null** in v1, as in today's app, so a Review seed always reviews as `expired`. Saving the engine levels when R5 agrees is a 5-line change once approved.
5. These are dropped until they have a data source: Google sign-in, price pings/notifications, the Record face, the earnings marker, and LLM follow-ups (R9).
6. **The hidden classic exit** must go before App Store submission (§5).
7. **Fonts** load from Google Fonts over the network. Bundling them (OFL) means downloading them, which needs Anthony's OK.
8. **What Anthony sees on his phone.** This workflow ends with a simulator-verified build. Installing it on his iPhone (Xcode run or TestFlight) is his step, because this workflow may not install to devices or upload.

---

## 8. Metered reads and Bobby Pro (iOS 1.5 (43), 2026-09-27)

Owner's decisions (Anthony): anyone can try Bobby without an account for **6 reads** (3 until 2026-10-07); from the 7th read, **Sign in with Apple** is required; a signed-in account gets **20 free reads per rolling 7 days** (10 until 2026-10-07); after that, **Bobby Pro** at $4.99/month, which on iOS is an App Store auto-renewable subscription (subscription group "Bobby Pro", product `xyz.bobbyprotocol.bobby.pro.monthly`), sold through **RevenueCat**. The server counts and decides; the app never keeps its own count.

### 8.1 Who is asking (headers)

Every `POST api/voice-tool {tool:"run_debate"}` (the metered read), every `api/bobby-access` call, and the desk call itself carry:

| Header | Value |
|---|---|
| `x-bobby-device` | `BobbyDevice.id`: a lowercase random UUID v4 created once per install, kept in the Keychain (`xyz.bobbyprotocol.bobby.device`, AfterFirstUnlockThisDeviceOnly; UserDefaults only if the Keychain refuses), so a reinstall does not reset the anonymous reads |
| `x-bobby-platform` | `ios` |
| `Authorization` | `Bearer <Supabase access token>`, only when signed in (`AccountSession.accessToken()`, refreshed when about to expire). A 401 on a signed-in request forces one refresh and one retry (`BobbyAccessAPI.send`) |

The quota-free `get_market` read carries none of them. Fixture mode never sends a bearer.

### 8.2 Where the gate sits in `ask` (§2.4 step 7a)

After the preflight (so nothing unreadable is ever metered) and **before the desk** (so a refused read never spends desk quota): the pulse is the metered read. `NucleoDeskIO.parsePulseReply` maps 401 → `signin_required`, 402 → `subscription_required` (the HTTP status is the contract; the body's `code` only confirms it), 2xx → today's pulse plus `access` when present, anything else → `pulse: null`. The desk waits ≤10 s for the meter, then fails open; a late refusal still wins. Each `access` object the server sends lands in `BobbyAccessCenter.shared` (the account sheet reads it) and, on `ok`, in `AskResult.access`. **A server that predates metering sends no `access`: the reply is byte-for-byte today's.**

### 8.3 The two refusals

`{status:"signin_required"|"subscription_required", token, message, access}`. `token` is a native retry token (single use, 10 min, like a confirm token) for the same question about the same asset. `NucleoReadModel.failure()` puts it in the chip's `retry` (never `token`), so the page can only re-ask **after** a real sign in or a confirmed subscription:

- **Sign-in beat** (app: SIGNIN_GATE; onboarding: its ERROR caption): "Create your free account to keep reading — 20 free reads a week." / "Crea tu cuenta gratis para seguir leyendo: 20 lecturas gratis a la semana." + the white Apple chip → `signIn()` → `ask({token})` automatically. (The "20" is the owner's copy, the server's `FREE_READS.weekly`; the 401 carries only the anonymous access, so the free allowance is not in the reply.)
- **Bobby Pro beat** (app: PRO_GATE): "You’ve used this week’s free reads." + "They reset {date}." from `access.resetsAt`; the native sheet opens by itself once → `paywall()` → `subscribed` → `ask({token})`.

### 8.4 Bobby Pro (native, RevenueCat)

- `BobbyStore` (Sources/BobbyStore.swift). The RevenueCat **public** SDK key comes from the `REVENUECAT_IOS_API_KEY` build setting through Info.plist (project.yml: Debug = the dashboard's Test Store key `test_…`, Release = empty until the production `appl_…` key exists). No key, or a `test_` key in a non-DEBUG build → RevenueCat is never configured and the sheet says "Bobby Pro opens very soon." Configured once, **after the risk notice is accepted** (launch, `acceptRisk`, or the sheet opening), never in unit-test hosts or fixture mode.
- **Identity:** RevenueCat's app user id **is the Supabase auth user id** (the server maps it to `bobby_identities.auth_user_id`): `configure(appUserID:)` with the signed-in id at launch, `logIn(id)` on every sign in (and again right before a purchase if it ever drifted), `logOut()` on sign out. A purchase needs a signed-in account (the sheet offers Sign in with Apple otherwise).
- **Offering:** the current offering's monthly package (else any package selling `xyz.bobbyprotocol.bobby.pro.monthly`); price = `package.localizedPriceString` + the product's period. Entitlement id **`pro`**.
- **Purchase / Restore:** `Purchases.shared.purchase(package:)` / `restorePurchases()`. When `pro` is active, `POST api/bobby-access {action:"revenuecat-sync"}` (headers of §8.1): the server asks RevenueCat for this user's entitlements and answers `{ok, access, subscription}`. Only an answer whose `access.tier` is `pro` (or no access at all) counts as `subscribed`. RevenueCat's own `receivedUpdated` (renewals, Ask to Buy approvals, another device, launch) re-asks the server once per new expiry. The JWS route (`action:"apple"`) is not used by the app.
- **The sheet** (`NucleoPaywallSheet`, #0B0A09 / ink #F2EDE4, system font — Sora is not bundled): "Bobby Pro", "Unlimited reads", three real feature lines, the price, Subscribe, "Your free reads reset {date}.", Restore Purchases, the auto-renewal terms, Terms of Use (Apple's standard EULA) and Privacy Policy. DEBUG builds add one coral line naming what is missing (key, offering or package).
- **`-nucleo-paywall`** (DEBUG) opens the sheet at launch for design review; **`-revenuecat-probe [appUserId]`** (DEBUG) configures anonymously, `logIn`s the test id, fetches the offerings once and prints them.

### 8.5 The account sheet

One subtle line from the server's access: "17 of 20 free reads left this week · Resets October 3", or for anonymous reads "5 of 6 free reads left", or "Bobby Pro · Unlimited reads · renews {date}" with **Manage** (Apple's `manageSubscriptionsSheet`, only for an App Store subscription). It refreshes with `GET api/bobby-access` when it opens (after consent only).


---

## 9. The nudge and the 1.8 screens (iOS 1.8 (64), 2026-10-07)

1.8 makes credits, memory, theses, reminders and invitations reachable from the conversation. The glass stays the glass: the page gains ONE generic element and no feature code.

### 9.1 The nudge (page side)

- `session.nudge` is `{id S, text S, cta S}` or `null`. Native writes all three, already localized. The page never composes nudge copy (`tests/bridge-boot.test.mjs` pins this).
- The page draws it as the FIRST chip of the chip row (class `chip nudge`) in `IDLE` and in `FOLLOWUPS`, and puts `text` in the eyebrow line above the row (one line, ellipsized past 350 px; native keeps it to 46 characters).
- Two methods, both `{id S(^[a-z][a-z0-9_.-]{0,47}$)}`:
  - `nudge.seen` → `{count I}`. Sent once per id per page life, when the chip is drawn.
  - `nudge.act` → `{status: "done"|"gone"}`. Sent on tap. The page does not navigate: native decides what opens. `gone` means native no longer has that nudge; never a fault.
- `session.changed` with a different nudge id (or none) redraws the row the nudge lives in.

### 9.2 The nudge (native side, `Sources/Nucleo/NucleoNudge.swift`)

- Each feature registers one `NudgeSource` (`V18.registerNudges`). `NudgeCenter` serves at most one, by priority (`NudgePriority`).
- Etiquette, enforced in one place and persisted (`nucleo.nudges.v1`): two showings, then a week of rest, four showings ever; retired for good on tap; 15 minutes of quiet after any tap; redraws within 10 minutes count as one showing.
- `NucleoSession.currentNudge()` returns nil before consent, during onboarding, under any sheet or system prompt, and in fixture mode (store shots and UI suites read a fixed page).
- Sources read stored state only (no network in `candidate`) and may look at the last delivered read of this launch (`NudgeRead`: symbol, verdict, saved, the memory receipt; never the question).

### 9.3 Screens

`credits`, `theses`, `thesisEditor`, `thesisReview`, `memory`, `memoryConsent`, `reminders`, `briefingSettings` are native sheets (`NucleoRoute.nativeOnly`). The page cannot open them: `openNative` accepts exactly the routes 1.7 accepted. They open from a nudge tap, from the profile (`switchSheet(to:)`) or from a drained notification tap.

### 9.4 What travels (additive to §2.4)

- Request: a review the person starts adds `thesis` (`ThesisContext`: their words, the date and price it started from). A plain question never has the key.
- Reply: `memory` (`MemoryReceipt`: recorded, asks, days since the last ask, percent change since) and, for a question that carried a thesis, `review` (`ThesisReviewNotes`: supports, challenges, unknowns, and `notChecked` codes for the evidence the desk does not load).
- A server that sends none of it is read exactly as in 1.7 (`Tests/V18WireTests.swift`).

Supersedes R9 only where stated here: there is still no notification prompt at launch or on the glass by itself; a reminder is requested from a native sheet after an explicit tap.

### 9.5 The harness: follow-ups (`Sources/V18/Harness/`)

From the first delivered read the phone keeps a ledger per reader (`HarnessLedger`: asks with symbol and price, follow-ups shown, opened or come back for, app opens; 300 events, 60 days; no question text). `HarnessProfile` (interest per asset, the hour they answer at, which kinds they ignore) and `HarnessPlanner` (the asset the next day, its sector the day after, the week on Monday, then silence; an answered follow-up or a new question starts again) are pure functions of it. `HarnessCenter` asks iOS for permission only on the person's "Yes, tell me" or the Follow-ups switch, hands the plan to iOS as local notifications (`v18.follow.<step>`), writes each one back as `sent` once its moment has passed, and reads one quota-free price to draw "NVDA +2.3% since you asked" on the glass. No server, no push token, no account. Each notification carries a tag of its reader (a digest, never the account id) and the moment it was planned for; a tap with another reader's tag does nothing, delivered notifications are cleared when the reader changes, and every change of plan ends in a serialized `sync` so the last one always leaves iOS holding the newest plan.

- Session: `readDelivered` calls `noteAsk`; a tapped follow-up is stored in `HarnessIntent` and drained behind the briefing gate (asset: the glass line; sector or week: route `followUp`, native-only).
- Page: one new event, `ask.start {token, question}`. Native issues a single-use token for an asset it already knows and writes the question; the page runs it exactly like a chip that carries a token, from `IDLE` or `FOLLOWUPS` only and never under a native sheet. `NucleoSession.startRead` emits it at once, or after the open sheet has closed. Such a read has origin `followUp` on the page and never ends on a mover chip (§3.5).
- The next question (§3.5): a tap on the CIO's chip reaches the harness as `notePicked(symbol:)` through `NucleoDesk.nextQuestionPicked`.
- Nudge sources: `harness.move` (priority 95) and `harness.offer` (80).
