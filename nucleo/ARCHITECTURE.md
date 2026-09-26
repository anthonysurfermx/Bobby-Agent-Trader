# Núcleo live app — architecture v1

This document is the single source of truth for building the real Núcleo app. The sphere is the app.

- **Worktree:** `.claude/worktrees/ios-nucleo`
- **Branch:** `ios/nucleo-preview`
- **Base:** iOS 1.4 (37), building 1.5 (39)

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
| R3 | **JS never names an asset.** `ask` accepts a question, a native-issued `token` (from a confirmation or suggestion), or `followUpOf` (a previous read). | The "never analyze an unconfirmed guess" rule is enforced where the network lives. |
| R4 | **XP is awarded on *Save thesis*, not when a read completes.** Saving is the award event (`read_complete` for Review, `no_trade_respected` for Wait) with the thesis attached. It happens once per read, is capped by `CompanionStore` (3/day), and is guarded by account generation. | This is the only place a thesis exists server-side (`events[].thesis`). The design says the reward comes on save. |
| R5 | Conviction and plan levels come only from `voice-tool run_debate` (`pulse`, quota-free). They are **shown only when the engine agrees with the desk**: verdict `review`, the same direction, and the same instrument. Otherwise the ring is a **completion ring with no number**, and the thesis shows real support/resistance instead of plan rows. | `/api/desk-debate` returns no conviction or levels. Both real captures are `wait`, while BTC's engine says `strong_long 59%`. Showing that number under "Wait" would contradict the desk. |
| R6 | Verdict words: `wait` becomes **Wait** (amber `#F6B94E`, scrim `#2A1C08`). `review` becomes **Review** (mint `#3FE0B5`, scrim `#082A20`). "Buy" and "Sell" never appear. Spanish: Espera / Revisa. | Colour lock (DIRECTION §2.1) and compliance. |
| R7 | What Bobby speaks = up to 600 chars of **CIO sentences**, plus one closing line from the string table ("My call: wait." / "Mi lectura: esperar."). The verdict condenses on that closing word. The full agent texts live in the debate card. | Neither real CIO text contains the word "wait", so the condensation needs a deterministic sync point. The closing line is a label with the real verdict inserted; it is not invented analysis. |
| R8 | Speech-to-text is **on-device only** (`requiresOnDeviceRecognition = true`). If the locale cannot recognize on device, the mic is `unavailable` and the pill offers typing. | Audio never leaves the phone, so the existing risk-notice copy stays true and `RiskNotice.currentVersion` stays 4. |
| R9 | These are dropped until a data source exists: Google sign-in, "Watch & ping me" with price pings, the notifications prompt, the Record face, the earnings satellite and chart marker, follow-up suggestions written by an LLM, and "level 12". | `.claude/rules/no-hardcode.md`. |
| R10 | The horizon control (24h/3d/7d) is shown only when the user is **signed in and the verdict is Review**. | Only a `read_complete` seed has a horizon, and extending one needs sign-in plus an `inventoryId`. |
| R11 | Onboarding's risk beat shows the **4 real `RiskNotice` statements**, fetched from native, as a hold-to-agree. It never shows the prototype's 3 paraphrased lines. No bridge call can reach the network before acceptance. | Statement 1 is the consent to AI processing. |
| R12 | Native keeps a **local thesis ledger** (`nucleo.theses.<owner>`, 20 newest). It feeds the Theses face, the ghost satellite and `theses()`, and it saves even at the daily XP cap. | Signed out, pending awards vanish after sync, and a capped award queues nothing. |
| R13 | A single `NucleoSession` owns `AgentProfile`, `CompanionStore` and `NeuralVoice`. `openClassic` tears the Núcleo down before `ContentView` appears. The classic app sits behind a **long press (0.8 s) on the header wordmark**, in **DEBUG builds only** (dev pages and DEBUG native); Release refuses `openClassic` (`unknown_method`) and never shows `ContentView` (1.5 (40), App Review 2.3.1). | Two live stores clobber `pendingAwards`. |
| R14 | Before any desk call, native runs a **preflight**: asset class must be equity or crypto, the equity symbol must match `^[A-Z]{1,5}$`, and candles must be fresh (crypto ≥59 bars with the last bar ≤3 h old; equity last bar ≤5 days old). A failure answers `unsupported` without spending quota. | The desk spends quota before it loads evidence. Every failure after that is a paid 503. |
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
| `suggestions` | `{}` | `{quickAccess:[{symbol S}], movers:[{symbol S, name S, changePct N}]}`. Sources: `DeskMemory.quickAccess(fallback: BobbyViewModel.defaultQuickAccess)` and `BobbyAPI.topMovers(limit:3)`. Cached 5 min; a failure gives `[]`. |
| `ask` | exactly one of: `{question S (1…1200 code points after trim)}` · `{token S}` · `{followUpOf S(uuid), question S}` | **AskResult** (§2.4). One read at a time; otherwise the fault `busy`. |
| `cancel` | `{}` | `{cancelled B}`. The in-flight `ask` then resolves `{status:"cancelled"}`. The server may already have spent quota; this is expected. |
| `speech.permission` | `{}` | `{state: "granted"\|"denied"\|"undetermined"\|"restricted"\|"unavailable", onDevice B}` (§2.6). Never prompts. |
| `speech.requestPermission` | `{}` | Same shape. Shows the two OS prompts in order: microphone, then speech recognition. |
| `speech.start` | `{}` | `{status: "listening"\|"needs_permission"\|"denied"\|"unavailable"\|"busy"}` |
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
| `signIn` | `{}` | `{status:"signedIn"\|"cancelled"\|"failed"\|"unavailable"}`. Native runs an `ASAuthorizationController` with `AccountSession.shared.prepareAppleRequest` then `completeApple`, and on success `ProgressSync.shared.sync(store:profile:)`. Apple only. Fixture mode returns `unavailable`. |
| `openNative` | `{route: "squad"\|"locker"\|"isla"\|"account"\|"riskNotice"}` | `{opened B}`. The routes present, as sheets over the web view: `MascotGalleryView`, `SquadLockerSheet`, `TraderLandGateHarnessView(focus:nil)` (sync on dismiss, as ContentView does), `AccountSheet` (full height, with Privacy Policy and Help links; the header avatar opens it), and `RiskNoticeView(readOnly:true)`. Emits `native.sheet`. Exception: `riskNotice` from the **app** page while the notice is not accepted opens no sheet; the risk beat replaces the page (§1.3). |
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
  "pendingRead":null, "fixtures":false, "platform":"ios", "appVersion":"1.5 (39)" }
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
   - An equity symbol that fails `^[A-Z]{1,5}$` gives `unsupported/symbol_format`.
   - Emit `ask.stage{stage:"accepted", asset, startedAt}`.
   - Fetch candles exactly as `BobbyAPI.candles(symbol:isEquity:timeframe:.oneHour)`, but through `BobbyAPI.response`, so that a transport error (`error.network`) is told apart from an empty or non-2xx reply.
   - Gate: crypto needs ≥59 bars and a last bar ≤3 h old; equity needs a last bar ≤5 days old. A failure gives `unsupported/thin_data` or `unsupported/stale_data`.
   - Emit `ask.stage{stage:"candles", candles, provenance:null}`.
7. **In parallel**, run the market read (`BobbyAPI.market`), the pulse (`POST api/voice-tool {tool:"run_debate", args:{symbol, lang: L.ttsLang}}`, 20 s cap, any failure or `error` key gives `null`), and the **debate**.
   - The debate is sent exactly as `BobbyAPI.debate` does it: `POST api/desk-debate`, body `{symbol, question, language: L.ttsLang, assetType: "equity"|"crypto"}`, header `Origin: https://bobbyprotocol.xyz`, timeout 100 s.
   - Emit `ask.stage{stage:"market", market}` as soon as the market read returns or fails.
   - **The reply never precedes its `market` and `candles` stages.**
   - After the debate returns, wait at most 5 s more for the pulse.
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

**AskResult**, where `status` is one of `ok|confirm|unknown_asset|unsupported|too_long|quota|cancelled|error`. The golden examples are in `fixtures/ask/*.json`.

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
  "candles":[{"t":1790366400000,"o":N,"h":N,"l":N,"c":N,"v":N}],
  "receivedAt":1790422570000, "elapsedMs":5378, "fixture":false }
{ "v":1, "status":"confirm", "token":S, "asset":{"symbol":"XAUT","name":"Xau","isEquity":false,"assetClass":"commodity"}, "matchKind":"proxy|fuzzy|…", "proxyNote":S? }
{ "v":1, "status":"unknown_asset", "query":S, "suggestions":[{"symbol":S,"name":S,"assetClass":S,"token":S}] }
{ "v":1, "status":"unsupported", "asset":{symbol,name,isEquity,assetClass}, "reason":"asset_class|symbol_format|thin_data|stale_data" }
{ "v":1, "status":"too_long", "maxLength":1200, "message":S? }
{ "v":1, "status":"quota", "retryAfterSec":I?, "message":S? }
{ "v":1, "status":"cancelled" }
{ "v":1, "status":"error", "code":"analysis_failed|desk_unavailable|network|timeout|bad_response|risk_not_accepted", "message":S? }
```

Normalization rules follow `fixtures/normalize.py` exactly; it is normative:
- trend: `alcista`→`up`, `bajista`→`down`, `lateral`→`sideways`.
- momentum: `sobrecompra`→`overbought`, `sobreventa`→`oversold`, `neutral`→`neutral`.
- Candles decode like `BobbyAPI.candles`: `ts` becomes an Int `t`; string numbers are parsed; volume defaults to 0; sorted ascending.
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
| `voice.end` | `{id, reason:"finished"\|"stopped"\|"failed"}`. Always sent exactly once per queued id, within 10 s if playback never starts (watchdog). |
| `thesis.planted` | `{requestId, stage:"seed"\|"bloomed"\|"capped"\|"signed_out"\|"failed", piece:{id,name}?, horizon:{hours,reviewAt,extendable}?}` (signed in only; after `ProgressSync.outcome`) |
| `native.sheet` | `{route, state:"open"\|"closed"}`. While a sheet is open, JS pauses rendering. |

### 2.6 Speech-to-text and voice (native details)

- **Permission.** `state` = `granted` only if both `AVAudioApplication.shared.recordPermission` and `SFSpeechRecognizer.authorizationStatus()` are granted. It is `denied` if either is denied, `restricted` if speech is restricted, `undetermined` if either is undetermined, and `unavailable` if there is no recognizer for the locale or `!supportsOnDeviceRecognition`. The locale is `es-MX` when `L.isSpanish`, else `en-US`; the first supported of those.
- **Start.**
  1. Call `voice.stop()`, then set `AVAudioSession` to `.playAndRecord` with mode `.measurement` and `.duckOthers`.
  2. Use `SFSpeechAudioBufferRecognitionRequest` with `requiresOnDeviceRecognition = true`, `shouldReportPartialResults = true` and `addsPunctuation = true`. Set `contextualStrings` to `BobbyAPI.dictationVocabulary()`, prefetched once per session and quota-free.
  3. Install an `AVAudioEngine` input tap. The level is `clamp((20·log10(rms)+50)/45, 0, 1)`.
- **Stop.** Call `endAudio()`, wait ≤1.5 s for the final result, emit `speech.final`, remove the tap and stop the engine. Then set the category back to `.playback`/`.spokenAudio`; `NeuralVoice.play` does this too.
- **Cancel.** Call `task.cancel()`; no final is emitted.
- **Automatic stops.** Listening stops automatically after 60 s. An audio interruption or a route change emits `speech.error{interrupted}` and stops listening.
- **The mic is live only between `speech.start` and `speech.stop`.** JS starts on pill pointerdown and stops on pointerup or pointercancel. Native also stops on background.
- **Voice.** `speak` calls `NeuralVoice.speak(text, voiceId: profile.voiceId, persona: companion?.voicePersona, vibe: profile.vibeId, essential: true)`.
  - Muted gives `{status:"muted"}`, and JS then runs its silent reading clock.
  - Watch `$speaking` to find start and end. `speaking` stays false while the TTS request is in flight, so start/end detection is edge-based, with the 10 s watchdog.
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
| IDLE | | B1 breath; pill glow in antiphase. The hint "HOLD TO ASK · SWIPE THE SPHERE" shows while `hints.idle < 3`. | pill pointerdown: `mic.state` granted → LISTENING, undetermined → PRE_PERMISSION, else TYPING. Pill tap <250 ms → TYPING. Horizontal drag on the sphere → FACE_DRAG. Chip → SENDING. Tap on the header avatar → `openNative("account")` (also from FACES and HANDBACK). Long press on the wordmark → `openClassic` (dev builds only) |
| PRE_PERMISSION | first hold with mic undetermined | onboarding O3 card (bloom from the bottom rim): "I only listen while you hold." / "iOS will ask for the microphone and speech recognition once." / **Continue** | Continue → `speech.requestPermission` → granted: IDLE with hint "Hold to ask"; otherwise TYPING |
| LISTENING | `speech.start` → listening | B2 3.00–3.15 on press. Words are born from the `speech.partial` diff: the stable prefix keeps its spans, new words rise, revised tail words re-roll, and the tail stays ink2. | pointerup → `speech.stop` → wait for `speech.final` → SENDING, or STT_EMPTY if `""`. `speech.error` → IDLE with a hint |
| TYPING | | textarea rises from the pill | send → SENDING; blur or empty → IDLE |
| SENDING | question text | B2 5.90–6.80: gather, bead, dimple, gulp, header dock (types the real question). Calls `ask`. | → RESOLVING |
| RESOLVING | | the pill shows the think dots after 1.2 s | `ask.stage accepted` → THINK_WAIT. An early reply: `confirm` → CONFIRM_ASSET, `unknown_asset` → UNKNOWN_ASSET, any other non-ok → ERROR |
| CONFIRM_ASSET / UNKNOWN_ASSET | | caption exhaled from the rim (`failure()` copy + `sub`), with chips born from the pill | chip `{token}` → SENDING (`ask({token})`); "Something else" → TYPING |
| THINK_WAIT | accepted | B3 6.70–10.40 as a **loop**: agent labels show **names only**, tethers, duel. ω ramps 1.6→2.6 over 0.8 s, then holds with ±12% modulation on 2B. After 15 s exposure drops to .06; after 30 s sparks fire on every other crossing. The header shows the price from `ask.stage market`. Hint row: elapsed seconds from 8 s; "Still weighing · deep reads take up to a minute" at 30 s; "Taking longer than usual · tap to cancel" at 75 s. | reply `ok` and `clk − tThink ≥ floor` (4.5 s on the first read of the session, else 1.5 s) → THINK_RESOLVE. Non-ok → ERROR. Pill tap → `cancel()` → CANCELLED |
| THINK_RESOLVE | | Stances (`model.agents[i].stance`, the first sentence) reveal word by word at 45 ms/word: Alpha at +0, Red at +0.55, CIO at +1.10; 2-line clamp with ellipsis. Hold 1.6 s, then B3 10.40–12.60: "Verdict forming", converge, IMPACT 1, hush, filament. **On entry, call `speak({id: requestId, text: model.spoken.text})`** so the TTS fetch overlaps the choreography. | choreography done **and** (`voice.start`, `muted`, or 6 s without start → call `stopSpeaking` and go silent) → TALK_EVIDENCE |
| TALK_EVIDENCE | | B4: satellites from `model.satellites` (4 slots, clockwise UL→UR→LR→LL; odometer `from`→`value`). Caption pages are the spoken sentences packed into ≤2-line pages; the karaoke timeline comes from `voice.word` (device), else `wordTimes(text, durationSec)` driven by `voice.progress`, else the reading clock. | the karaoke reaches sentence `spoken.stageAt.chart` (or sentence 0 ends plus 0.3 s when null) → TALK_CHART; skip if `model.chart == null` |
| TALK_CHART | | B5: the chart is built from `model.chart` (48 closes, domain, 2 gridlines, NOW = last close, support **band** `band.lo…band.hi` labelled `band.label`, resistance line, plan lines only when present, bracket NOW→support at +0.30 s after the band, x-label `1H · provider · instrument · as of <local time>`). There is no earnings marker. | the karaoke reaches `spoken.verdictWordIndex − 0.03 s` → VERDICT |
| VERDICT | | B6: satellites retract, filament collapse, IMPACT 2 in `verdict.color`; `uV`/scrim core = `verdict.core`. `verdict.word` condenses 30 ms before the spoken word, and that caption word takes the verdict colour. Ring: in `conviction` mode it fills to `pct` with odometer digits and `label`; in `complete` mode it draws 0→100% in 1100 ms with no digits and no label. Meta line = `model.meta` + `asOf`. | `voice.end` (or the reading clock ends) → HANDBACK |
| HANDBACK | | two sags; hint "Pull down for the full read ⌄" while `hints.verdictPull < 3` (then `markHint`). The pill is a mic again. | vertical drag → PULLING; pill hold → RETURNING, then LISTENING; × → RETURNING; 90 s idle → RETURNING |
| PULLING | | B7 25.50–26.10, tracked 1:1 | commit → CARDS; release before commit → HANDBACK |
| CARDS | | B7 26.10–27.90: the track has three cards. **Debate**: `model.debate`, full texts, internal 1:1 scroller if needed. **Thesis**: `model.thesis`; horizon control when `thesis.horizon.show`. **Isla**: only if `island().available`. | Save → SAVING; × → RETURNING |
| SAVING | Save press | B8 28.90–30.12: press, label roll, conic sweep; `saveThesis({requestId, horizonHours})`. The XP chip = `xpChip(awardedXP, verdict.key, lang)` (hidden if the save failed); the tpill `thesis.pill` arcs in. `evolution`/`unlocks` show as one caption line. | → FOLLOWUPS |
| FOLLOWUPS | | B9 chips born from the pill: "Another question about {SYM}" (TYPING with `followUpOf`), plus up to 2 real symbols from `suggestions()` (quickAccess or movers, not the current symbol) using the strings template "How is {SYM} looking?". **Each sent chip is a paid desk read.** | chip → SENDING or TYPING; × or timeout → RETURNING |
| RETURNING | | B10 33.20–35.00: cards retract before the sphere moves, the verdict evaporates, the ring unwinds, the flood recedes, the tint returns. The ghost satellite comes from `theses().items[0]` if it was saved this session. | → IDLE |
| FACE_DRAG / FACE(k) | drag in IDLE | B11 physics with the real pointer. Isla: `island()` summary and a chip that calls `openNative("isla")`. Squad: `roster()` belt plus `level`/`streak`, chip `openNative("squad")`. Theses: 2 satellites from `theses()`; tapping one opens its card read-only. | detent at Desk → IDLE |
| ERROR(kind) / CANCELLED | | caption from `NucleoReadModel.failure()`. **No verdict, no ring, no XP.** The pill returns to mic. | 6 s or a tap → RETURNING |
| RISK_GATE | reply `error/risk_not_accepted` (`failure().kind == "risk"`) | caption "First, the risk notice." plus one chip | chip → `openNative("riskNotice")` (native swaps in the risk beat); tap elsewhere or 30 s → RETURNING |
| RESTORE | `pendingRead` at boot | builds the model and jumps to the settled HANDBACK frame (reduced choreography) | as HANDBACK |

### 3.3 Onboarding state machine (`onboarding.html`, Builder C)

| State | Reuses | Data |
|---|---|---|
| BIRTH (O0) | O0 0.00–2.80, plays once | only when `session.firstRun && companion == null` |
| HELLO (O1) | O1 2.80–7.60: trailer duel, ivory soft impact | Onboarding copy from the strings table, spoken with `speak()` (default voice before a pick), karaoke per §3.2 |
| PICK (O2) | O2 identity mode, belt, snow, swipe physics | Starters are `roster()` entries with `requiredLevel == 1 && unlocked`, in roster order; the default is the first that is not `orb`. `previewVoice` runs 350 ms after each detent. The pill "Choose {Label}" calls `setCompanion({id})` then celebrates. The avatar and temperament follow the choice (no fixed `CHOSEN`). |
| ASK_TEACH (O3) | O3 title/sub/chips, pre-permission card | Chips come from `suggestions()` via the strings template ("How is {SYM} looking?" / "Why is {SYM} moving today?" only for `movers`). The pre-permission card uses **Continue**, then `speech.requestPermission()`, which triggers the **real** OS prompts; the fake alerts are deleted. Denied or unavailable → typing. LISTENING/TYPING as in §3.2; the question becomes the bead, which is **not sent yet** |
| RISK (O4) | O4 ring + hold-to-agree, the same geometry as the conviction ring | `riskNotice()`: the 4 `title`s are the pulse-swept lines, with statement 1's `body` below them (Geist 13 ink2). "Read the full notice" calls `openNative("riskNotice")`. Completing the 1200 ms hold calls `acceptRisk({version})`; an early release unwinds with no copy |
| READ (O5) | O5, as the daily THINK→VERDICT states | `ask({question})`. First-read options: `build(r, {firstRead:true})` (3 satellites), a 4.5 s floor. The conviction explainer hint appears only when `ring.mode == "conviction"`. Non-ok replies use the daily ERROR/CONFIRM patterns; after an error the chip "Try another question" returns to ASK_TEACH |
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

Nothing else is shown. Earnings, volume "avg" claims beyond the computed ratio, calm-entry language, targets without an agreeing pulse, and invented follow-ups are all forbidden (R9).

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
- Volatile keys: `requestId`, `elapsedMs`, `fixture`. **Native fixture mode must reproduce every golden reply JSON-equal, apart from those keys.** The contract page checks this in the app.
- `fixtures/native/{roster,levels,risk-notice}.json` are snapshots of `Companion.swift` and `RiskNoticeView.swift` for the mock. If native copy changes, re-snapshot them; the contract page catches drift.

### 4.3 Browser mock (`src/shared/90-dev-mock-bridge.js`)

It installs itself only when `window.webkit.messageHandlers.nucleo` is absent. It answers every method from the inlined `NUCLEO_FIXTURES`, matches questions through `manifest.assetSearch` (the same rules native uses), follows the §2.4 order, and fakes STT (seeded irregular word timing plus a level envelope) and TTS (syllable envelope, `voice.word`, `voice.progress`).

URL parameters:
- `scenario=default|slow|hang|quota|too_long|failed|unavailable|gateway_timeout|offline`
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

Hooks:
- `nucleoBridge.mock.useClock(fn)` and `.pump()` for sim-clock determinism.
- `.say(text)` sets the next STT utterance.
- `.setMic(state)`.

### 4.4 App fixture mode (`-nucleo-fixtures [scenario]`, DEBUG only; Builder A)

`NucleoFixtureProtocol` is registered with `URLProtocol.registerClass` before any request; this is the pattern of `B34Stub`. It serves `Bundle.main/Nucleo/fixtures/raw` by path, reading POST bodies from `httpBodyStream`:

| Request | Served |
|---|---|
| `api/bobby-asset-search` POST | `manifest.assetSearch` rules on lowercased `q`; the first match wins |
| `api/bobby-asset-search?browse=1` | `{"ok":true,"browse":{},"movers":[]}` |
| `api/okx-tickers` | `{"tickers":[]}` |
| `api/stock-candles?symbol=S…`, `api/okx-candles?instId=S-USDT…` | `bySymbol[S].candles`, else 502 `{"error":"No chart data"}` |
| `api/voice-tool` | `get_market` → `bySymbol.market`; `run_debate` → `bySymbol.pulse`; otherwise `{"symbol":S,"available":false,"price":null}` |
| `api/desk-debate` | the scenario file if the scenario is a refusal, else `bySymbol[S].debate` |
| `api/bobby-voice-free` | 503 `{"error":"TTS failed"}`, which puts NeuralVoice on the free device voice; not intercepted under `-nucleo-fixtures-live-voice` |
| `qbvdqkknnuweatptjohi.supabase.co` | `URLError(.notConnectedToInternet)` |
| any other bobbyprotocol.xyz path | 404 `{"error":"not in fixtures"}` |

- **Latency.** `desk-debate` takes `min(elapsedMs, 6000)` ms by default, 45 s under `slow`; `hang` waits 20 s and then fails with `URLError(.timedOut)`. All other requests take 150 ms. Under `offline`, every request fails with `.notConnectedToInternet`.
- The mode forces signed-out behaviour: `signedIn:false`, `signIn → unavailable`, and `ProgressSync` is never called.
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
    - en: "Bobby turns your spoken question into text on this iPhone. The audio never leaves your device."
    - es: "Bobby convierte tu pregunta hablada en texto en este iPhone. El audio nunca sale de tu dispositivo."
  - Update `Tests/ReleaseAuditTests.testAvatarNarrationDoesNotRequestMicrophoneOrSpeechRecognition` **deliberately**: rename it, then assert that both keys exist and are non-empty, and that recognition is on-device only (unit-test the request factory).
- **Speech.** Recognition is on-device only (R8), so no audio is collected and `PrivacyInfo.xcprivacy` needs no new data type. The transcript is sent only when the user releases the pill, as the question, which is already declared as user content. The mic is active only while the user holds the pill, and it stops on background.
- **Two OS prompts, microphone then speech,** both after the in-app pre-permission card ("Continue", never "Allow", no "Not now"). The app never shows a fake alert. There is no notifications prompt and no ATT.
- **No advice language.** The verdicts are Wait and Review only. Every read carries "Educational read · not financial advice". The app has no Buy, Sell, profit, win or returns strings; `tests/read-model.test.mjs` lints the read-model tables, and Builders B and C lint their own tables the same way. The conviction number appears only when it is real and agrees with the desk (R5).
- **Consent before processing.** No `ask` reaches the network before `riskAccepted`; native enforces this (§2.4 step 2).
- **Sign in with Apple only;** "Not now" loses nothing. The account deletion path stays in `AccountSheet` (`openNative("account")`).
- **Bundled code only.** The pages come from the app bundle, and there is no remote JS. `connect-src 'none'`; the only external requests are Google Fonts CSS and fonts (R15).
- **Before any App Store submission** (not in this workflow): run `build.py --park-legacy` once, then `build.py --release`; remove the hidden long-press to the classic app, or make it a visible setting (guideline 2.3.1 on hidden features); and confirm that `showNucleo` in Release is intended.

---

## 6. Division of work and acceptance

The three builders work in parallel, and no file is owned by two of them. None may commit, push, upload, install on a device, deploy, or write to a DB beyond what a signed-out app session does. Use only simulator `9376EBA1-CA3E-4389-9EAF-EF1CD0212199` (iPhone 17 Pro), and never `attach`. In the browser, open your own tab and close it when you are done. **No builder makes a real desk-debate call**; integration owns the 2 remaining calls.

### 6.1 Shared gates (every builder runs these before reporting)

1. `python3 ios/Bobby/Nucleo/build.py` prints `NUCLEO_BUILD_OK`, and so does `--release`, whose pages contain neither `NUCLEO_FIXTURES=` nor `90-dev-mock-bridge` (grep the built pages). Rebuild in dev mode afterwards.
2. `node ios/Bobby/Nucleo/tests/read-model.test.mjs` passes. Its baseline is 24 tests.
3. `contract.html` in the browser shows `PASS` for `?latency=300` (baseline 13 passed + 1 skipped, the risk gate) and for `?latency=300&first=1&lang=es` (baseline 14/14).

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
- **A5.** STT on the simulator: the first `speech.start` produces `needs_permission`; `requestPermission` shows two OS prompts in order; after granting, the partials and final flow. After stop, `speak` plays, which proves the audio session was restored. On-device recognition is required.
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
  2. The picker shows the **10 starters from `roster()`**, defaulting to `byte`. `previewVoice` fires on each detent. Choosing calls `setCompanion`, and the avatar and tint follow the choice.
  3. Ask-teach chips come from `suggestions()`. With `mic=undetermined`: Continue, then `requestPermission`, then hold-to-ask. The question waits as the bead.
  4. The risk beat shows the **4 real statements** (and the Spanish ones under `lang=es`). An early release unwinds; the full hold calls `acceptRisk`.
  5. The read has 3 satellites and honours the 4.5 s floor.
  6. The thesis card: "Save thesis", no horizon control, no "Watch & ping me".
  7. The XP chip shows "+20 discipline XP for waiting".
  8. The sign-in sheet has Apple and "Not now" only; "Not now" leads to "Saved on this device".
  9. No Isla peek (signed out).
  10. Home, then `finishOnboarding` is called.
- **C2.** A grep of `src/onboarding` for `ALERTS`, `Would Like to`, `PICK_IDS`, `CHOSEN =`, `Watch & ping`, `Continue with Google`, `CALM ENTRY`, `178.40`, `Mira it is.` returns 0. The celebration line is built from the chosen label via the strings table.
- **C3.** With `mic=denied`, the typing path completes the whole run. `#risk&risk=0` runs only the risk beat and then `finishOnboarding`. `first=1&companion=kora` resumes at ASK_TEACH.
- **C4.** Errors during the first read (`scenario=quota|failed|offline`) give an honest caption and "Try another question", with no XP and no sign-in sheet.
- **C5.** Determinism: `?harness=1&script=first-run&t=<s>&freeze=1` gives identical hashes for the hero frames (born, picker, mic card, risk ring filling, debate, verdict, saved + XP, sign-in sheet, home).
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
