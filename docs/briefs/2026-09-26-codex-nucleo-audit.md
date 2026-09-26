# Brief for Codex: audit and level-up of Bobby "Núcleo" (next release)

Owner: Anthony (founder). Written 2026-09-26 by Claude after building Núcleo end to end.
Language: talk to Anthony in Spanish; write code, commits and reports in English.

## 1. What Núcleo is, and why this audit

Bobby is a voice + text AI companion that helps Gen Z and first-time investors **think before they trade** stocks and crypto. It is not a trading terminal: no buy buttons, no advice language.

On 2026-09-26 we rebuilt the app around one idea: **the sphere is the app**. An iridescent glass sphere (raw WebGL) sits at the centre. Everything is born from it and returns to it:
- The three-agent debate (Alpha Hunter / Red Team / CIO) happens *inside* the glass as three coloured currents that collide and converge.
- Metrics leave as orbiting glass satellites. The chart is exhaled as a light trail. The verdict condenses as one word with a conviction ring.
- Monogram-style cards appear only when the user pulls down. There is no tab bar: swiping the sphere turns its faces (Desk, Isla, Squad, Saved theses).

Anthony tried it on his iPhone with real data and loves it ("después de meses hemos llegado a una versión súper pulida"). **Your job is to audit everything we built — backend, front end, native, UX, UI — and take it to the next level for the next public release.** Protect what he loves; raise everything else.

## 2. Where the code is (read this first)

- **Worktree:** `/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/.claude/worktrees/ios-nucleo`
- **Branch:** `ios/nucleo-preview`, based on `codex/ios-avatar-voice-restore` @ 2af516c = iOS 1.4 (37). Version is bumped to 1.5 (39) in `ios/Bobby/project.yml`.
- **Nothing is committed.** Ask Anthony, or ask Claude to commit it, before you branch. Work on your own branch (e.g. `codex/nucleo-audit`) from that commit.
- **Installed:** a Release build of this tree is on Anthony's iPhone 17 Pro. Do not install over it without asking him.

| Area | Path | Notes |
|---|---|---|
| Architecture (source of truth) | `ios/Bobby/Nucleo/ARCHITECTURE.md` | Bridge protocol v1, state machines, data mapping, fixtures, privacy, rulings R1–R14, open decisions §7 |
| Art direction | `ios/Bobby/Nucleo/design/DIRECTION.md`, `GLASS.md` | Tokens, 9 named springs, shader spec, storyboards, 46 fine details, acceptance criteria |
| Engines (web, run inside WKWebView) | `ios/Bobby/Nucleo/src/{shared,app,onboarding,contract}` | Ordered `NN-*.js` parts + `template.html` per page |
| Build | `python3 ios/Bobby/Nucleo/build.py [--release] [--park-legacy]` | Inlines parts, injects `companions.json`, runs `node --check`, writes `ios/Bobby/Resources/Nucleo/*.html` |
| Native bridge + services | `ios/Bobby/Sources/Nucleo/*.swift` | `NucleoRootView`, `NucleoWebView`, `NucleoBridge` (27 methods), `NucleoSession`, `NucleoDesk`, `NucleoLedger`, `NucleoSpeech`, `NucleoVoice`, `NucleoHaptics`, `NucleoFixtures` |
| Touched existing files | `BobbyApp.swift` (routing), `BobbyAPI.swift`, `NeuralVoice.swift`, `RiskNoticeView.swift`, `Info.plist` + `InfoPlist.strings` (mic + speech), `ReleaseAuditTests.swift` | Additive changes |
| Tests | `ios/Bobby/Tests/NucleoBridgeTests.swift`, `ios/Bobby/UITests/NucleoContractUITests.swift`, `ios/Bobby/Nucleo/tests/read-model.test.mjs` | 168 unit tests passed at hand-off; read-model 31/31; contract 14/14 |
| Fixtures | `ios/Bobby/Nucleo/fixtures/` (`raw/`, `ask/`, `native/`, `manifest.json`, `normalize.py`) | Two REAL desk-debate captures (NVDA, BTC) + synthetic refusals |
| Scripted prototypes (design reference only) | `docs/design/nucleo-v2/`, `docs/design/orb-first-concepts/` | Not shipped |
| Backend (read-only unless Anthony approves) | `api/` in the same worktree | Vercel serverless |

**Commands**
```
cd ios/Bobby
python3 Nucleo/build.py            # dev pages: mock bridge + fixtures inline
python3 Nucleo/build.py --release  # ship pages: no mock, no fixtures
xcodegen generate                  # after adding/removing Swift files
xcodebuild -project Bobby.xcodeproj -scheme Bobby -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build
node Nucleo/tests/read-model.test.mjs
```
- **DEBUG launch arguments:** `-nucleo-fixtures [scenario]`, `-nucleo-page app|onboarding|contract`, `-nucleo-reset-onboarding`, `-nucleo-fixtures-live-voice`, `-AppleLanguages (en)`.
- **Browser dev:** serve `ios/Bobby` (e.g. `python3 -m http.server 4614 --directory ios/Bobby`), then open `/Resources/Nucleo/app.html?harness=1&script=read-nvda&t=<s>&freeze=1` or `/Resources/Nucleo/onboarding.html?harness=1&first=1&script=first-run&t=<s>&freeze=1`.

## 3. Hard rules

1. **Quota:** `/api/desk-debate` allows 30 calls per caller, 60 per network and 600 globally every 24 h. Anthony's phone shares the Mac's network (hotspot). Use fixtures for everything and make **at most 5 real desk calls** in the whole audit.
2. **Nothing irreversible without Anthony:**
   - no merges to `main`, no production deploys (`vercel --prod`), no TestFlight/App Store uploads;
   - no DB migrations or writes;
   - no installing to his phone;
   - no force-push, `reset --hard` or deleting branches.
3. **Web prod is special:** Bobby's web prod has been deployed by CLI from non-`main` branches since 2026-09-22. Merging to `main` auto-deploys and can silently roll prod back. Never assume `main` equals prod.
4. **Pro Trading Skills (PTS) is a separate product.** Do not mix PTS work into Bobby.
5. **Never invent identifiers** (App Store IDs, URLs, bundle IDs, env names). Read them from the repo or ask.
6. **No hard-coded display data** in product code (`.claude/rules/no-hardcode.md`). Everything the user sees comes from the bridge or the backend. Fixtures live only in dev builds and tests.
7. **Product language:** no "Buy"/"Sell" verdicts, no guaranteed returns, no advice framing. The backend only returns `wait` or `review`; the UI shows **Wait** (amber) and **Review** (mint).

## 4. Decisions already made (do not re-litigate; flag if you think one is wrong)

- **Hybrid architecture.** The Núcleo engine stays web (HTML/CSS/raw WebGL) inside a WKWebView. Native Swift owns networking, auth, speech-to-text (on-device), text-to-speech (NeuralVoice), haptics and persistence. One engine is meant to serve iOS, web (`/desk-v2`) and Android (TWA).
- **Companions are avatars, not figures inside the sphere** (Anthony, 2026-09-26). The glass stays pure.
  - Daily engine: `COMP_IN_GLASS = false` in `src/app/10-core.js`.
  - Onboarding: the picker shows a round avatar under the sphere (`#pava`), and the shader companion amount is forced to 0 in `src/onboarding/80-render-glass.js`.
  - The header avatar (with its XP arc) is the companion's home. Remove the dead companion-in-glass code paths cleanly (texture matte, `uComp*` uniforms, silhouette modes) or keep them behind the flag. Justify which.
- **Idle glass is "Deep core"** (GLASS.md variant C). Its interior saturation ×1.45 contradicts DIRECTION.md §2.1 (×0.8). Anthony likes the current look; update DIRECTION.md to match rather than the shader.
- **XP on Save.** XP is awarded when the user saves a thesis, not on every completed read.
- **Sign-in comes after value.** It is offered after the first saved thesis, never as a wall. As of 2026-09-26 the iOS app had 9 downloads and 0 sign-ups.

## 5. What to audit

Produce findings ranked by severity (blocker / high / medium / low), each with `file:line`, a concrete reproduction, and the fix. Verify every finding before reporting it.

### 5.1 Backend (`api/`)
- `desk-debate`:
  - latency, p95 and timeouts against the app's 100 s client timeout;
  - failure modes and error codes vs `NucleoDesk.swift` mapping;
  - quota fairness (caller / network / global) and the shared-hotspot problem;
  - the "fail-closed" path;
  - prompt/output guards (no advice language);
  - whether a CIO-owned conviction can come from the backend (today the ring has no number unless the engine pulse agrees with Review — R5).
- `voice-tool` `run_debate`, `get_market`, `bobby-asset-search`, `stock-candles` / `okx-candles` (weekend and market-closed behaviour; Yahoo gaps), `bobby-voice-free` (cost, caching, timeouts; one 30 s timeout was seen 2026-09-21), `progress`, `trader-land`.
- **Security:**
  - input validation and payload sizes;
  - rate limits on every public endpoint;
  - the CSP for the bundled pages (`connect-src 'none'`: the page never touches the network, which is good);
  - secrets hygiene.
- **Observability:** today we cannot see anonymous usage at all. There is no telemetry for signed-out users, and Vercel keeps logs for 24 h without the user agent. Propose privacy-safe product analytics (opens, questions asked, answer success rate, time to verdict, saves, sign-ins, errors by code) that fits the App Privacy answers.
- **Data sources for dropped features:** the Record face (a public track record exists on-chain), the earnings marker, price pings/notifications and LLM follow-ups. Propose the minimal backend for each.

### 5.2 Front end (engines in `ios/Bobby/Nucleo/src`)
- **State machine:** audit `app/60-fsm.js` and `onboarding/60-fsm.js` for stuck states, cancelled cues, races between `ask` replies and user input, and re-entrancy (ask while speaking, pull while thinking, swipe during a read).
- **Tap vs hold on the pill:** the heuristic was timing-sensitive in the simulator. A quick tap sometimes started listening instead of opening the text field.
- **Known bug:** a read refused with `risk_not_accepted` shows the generic "The analysis did not come back" instead of routing to the risk beat (`20-read-model.js` error mapping and `NucleoDesk.swift:411`).
- **Real data rendering:** confirm satellites (price, RSI, volume, etc.) show for real answers and handle missing fields. In one real TSLA read the satellites were not captured on screen; verify it.
- **Captions and speech:** verify caption/speech sync with the real TTS (word timing), the Spanish copy (the app follows the device language) and long CIO texts.
- **Performance:** adaptive quality tiers, context-loss recovery (the onboarding gained it late), memory growth over long sessions, per-frame allocations, battery on a real device, Low Power Mode at 30 fps.
- **Accessibility:** VoiceOver order, reduced motion (`?rm=1` path), Dynamic Type strategy, contrast (the conviction label measured p5 3.6:1 over the amber flood).
- **Code health:** dedupe `shared/` vs the two engines, dead code from the prototypes, and bundle size (≈500 KB per page with companions inlined).

### 5.3 Native (`ios/Bobby/Sources/Nucleo`)
- **Bridge security:** accept messages only from the bundled file origin, validate every payload, no retain cycles (`WKScriptMessageHandlerWithReply`), and teardown on exit.
- **Audio:** audio session handling (TTS vs mic, interruptions, calls, AirPods, silent switch); the mic must stop on release, background or interruption.
- **Speech:** on-device availability fallback, permission denied → typing path, Spanish and English locales.
- **Session and auth:** Sign in with Apple via `AccountSession` after the first save, account generation guards in `NucleoLedger`/`ProgressSync`, and deletion/revocation still working.
- **Routing:** first run → onboarding → app; a stale risk version → risk beat; the hidden classic exit is a long-press on the wordmark and must be removed before App Store.
- **Crash-safety:** nothing in the bridge may crash on malformed backend JSON.

### 5.4 UX
- **First run (≤60 s to the first real verdict):** birth → hello → companion picker (now avatar-based; re-check it still feels magical without the companion in the glass) → mic pre-permission → risk agreement → first question → verdict → save → sign-in offer → home.
- **Everyday loop:** time to first visual feedback after asking, the thinking state for 5–90 s (must never feel frozen), what happens on errors (quota, unknown asset, network, market closed), follow-ups.
- **Discovery:** faces by swipe have no tab bar. Is the swipe discoverable? Are Isla, Squad and Theses worth a face each?
- **The 9-downloads / 0-sign-ups funnel:** where users drop, and what to measure.

### 5.5 UI
Measure against `DIRECTION.md` §7 (46 fine details) and §8 (acceptance):
- type floor 11 px;
- safe areas on every current iPhone size, from SE to Pro Max;
- one focal light per state and the glow budget;
- contrast;
- the Squad face now that the companion is not in the glass (what fills it?);
- Spanish text lengths.

### 5.6 Release readiness (App Store 1.5)
- **Privacy:**
  - add Audio Data / speech to the App Privacy label if needed (1.2 had removed Audio Data);
  - check the `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription` strings.
- **Review risk:** App Review 3.1.5 (the 1.1 rejection was about swaps; there are no swaps on iOS now) and 4.3(a) (spam, seen on 1.0).
- **Before submission:**
  - remove the hidden classic exit;
  - bundle the fonts (Instrument Serif, Geist, Geist Mono are OFL; today they load from Google Fonts over the network — ask Anthony before downloading);
  - produce App Store screenshots of Núcleo.
- **Build and version:** check signing, versioning (a 1.5 (38) archive already exists; this tree is 1.5 (39)) and the Apple Sign-in env vars in Vercel prod.

## 6. Deliverables

1. **`docs/audits/2026-09-26-nucleo/REPORT.md`:** an executive summary in Spanish for Anthony (one page), then the findings per area (English, severity-ranked, with evidence).
2. **A fix plan** in PR-sized batches (blockers first), with an effort estimate per batch.
3. **Implemented fixes** for all blockers and highs on your branch, each with tests or a written reproduction. Run: unit tests, `NucleoContractUITests`, read-model tests, both engines through their harness scripts, and a simulator run in fixture mode. Make at most 5 real desk calls in total.
4. **"Next level" proposals:**
   - web parity (`/desk-v2` with the same engine);
   - Android TWA;
   - the Record face;
   - notifications for watched theses;
   - an LLM-authored spoken summary instead of the CIO's first sentences;
   - streaming the debate so agents appear as they finish.

   Each with cost and risk.
5. **A short list of decisions only Anthony can make**, with a recommended default for each.

## 7. Definition of done

- Every blocker and high is fixed or explicitly deferred with Anthony's OK.
- The pages build with `--release`; unit and UI tests pass; the simulator fixture run is clean.
- One real read works end to end (voice or text) in Spanish and one in English.
- No advice language, no Buy/Sell anywhere, no fixture data in Release.
- The report is written, the branch is pushed only if Anthony says so, and nothing is merged or deployed.
