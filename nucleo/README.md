# Núcleo on the web (`/nucleo`)

The orb-first Bobby app, served by the website at **bobbyprotocol.xyz/nucleo**. It is the same engine the iOS app runs in its `WKWebView`, with a web transport in place of the native bridge.

## The iOS branch is canonical

`src/{shared,app,onboarding,contract}`, `ARCHITECTURE.md`, `companions.json` and `native/*.json` are **copies**. Their source is `ios/Bobby/Nucleo/` on the iOS branch `ios/nucleo-preview`. The `native/*.json` files come from its `fixtures/native/`.

- Do not edit the copies here. Change them on the iOS branch, then copy them again.
- The only web-owned files are:
  - `src/web/`
  - `tests/web-transport.test.mjs`
  - this README
  - the `--web` target in `build.py`

To re-sync from the iOS worktree, run from the web repo root:

```sh
S=../ios-nucleo/ios/Bobby/Nucleo   # the iOS worktree's Nucleo folder
for d in shared app onboarding contract; do cp "$S/src/$d/"* nucleo/src/$d/; done
cp "$S/ARCHITECTURE.md" "$S/companions.json" nucleo/
cp "$S/fixtures/native/levels.json" "$S/fixtures/native/risk-notice.json" nucleo/native/
python3 nucleo/build.py --web && node nucleo/tests/web-transport.test.mjs
```

The first sync was taken on 2026-09-26 from `c2f1f07` plus that day's uncommitted engine work: the avatar opens the account sheet, the `RISK_GATE` state, the long press is DEBUG only, and satellites have no backdrop blur.

## Build

```sh
python3 nucleo/build.py --web   # needs Node >= 22.6 (reads a .ts file with --experimental-strip-types)
```

The build writes these files, which are committed and served as static files by Vite/Vercel:

- `public/nucleo/index.html`: the daily engine (`app`)
- `public/nucleo/onboarding.html`: the first run
- `public/nucleo/voice/select-<id>-<en|es>.mp3`: the companion pick clips the iOS app bundles, copied from `ios/Bobby/Resources/Voice/`

What `--web` does differently from the iOS `--release` build:

- **Transport.** It inlines `src/web/*.js` after `src/shared/`. The dev mock and fixtures are never shipped, and the build refuses to write a page that contains them.
- **CSP.** The web CSP is:
  ```
  connect-src 'self'; media-src 'self' blob: data:; img-src 'self' data: blob:
  ```
  Fonts still come from Google.
- **Catalog.** It inlines `window.NUCLEO_WEB`, the data that stands in for the native stores. It comes from real sources only:
  - `src/lib/companions/data.ts`, the site's own port of `Companion.swift`: the roster, level thresholds, gear and quick-access defaults.
  - `companions.json`: the palettes.
  - `native/levels.json`: the Spanish level names.
  - `native/risk-notice.json`: `RiskNotice` v4, never retyped.
- **Patches.** It applies `WEB_PATCHES` (see below) at build time, so the copies stay byte-identical to the iOS branch. If a patch stops matching, the build fails.

## Routing

These routes are set in `vercel.json` and decided in `src/web/90-web-install.js`:

| URL | Serves | When |
|---|---|---|
| `/nucleo`, `/nucleo/` | `index.html` (app) | Vercel rewrites both to `/nucleo/index.html`, before the SPA catch-all |
| same | redirects to `onboarding.html` | first visit, or no companion |
| same | redirects to `onboarding.html#risk` | onboarded, but an older risk-notice version was accepted |
| `/nucleo/onboarding.html` | the first run | redirects to `/nucleo/` if already onboarded, unless `#risk` |
| `finishOnboarding()` | fades to `/nucleo/` | uses `location.replace`, so Back never replays the first run |

A page that is being redirected never answers `session()`, so its engine stays black. Nothing else on the site changed. The rest of the build is byte-identical with and without `public/nucleo`.

## The web transport (`src/web/`)

It is protocol v1 (ARCHITECTURE.md §2), with the same reply shapes the native bridge gives. It talks to the same backend endpoints, same-origin.

| Method | Web implementation |
|---|---|
| `ask` / `cancel` | A port of `NucleoDesk.swift`, in the same order: validate → busy → risk gate → length → `POST /api/bobby-asset-search` → preflight. The preflight checks the asset class, the symbol format, and 1H candles from `/api/stock-candles` or `/api/okx-candles` with the R14 freshness rules. Then it runs `get_market` ‖ `run_debate` via `POST /api/voice-tool` ‖ `POST /api/desk-debate` (100 s). Errors map to `quota` (with `Retry-After`), `too_long`, `analysis_failed`, `desk_unavailable`, `bad_response`, `timeout` and `network`. Tokens are single use and last 10 min. |
| `saveThesis` | `CompanionStore.awardDisciplineEvent` rules: 20 XP for Wait, 10 for Review, 3 awards a day, a streak with one grace day, and gear drops. The thesis goes to the ledger even when the award is capped. `planting: "signed_out"`. |
| `session`, `roster`, `setCompanion`, `acceptRisk`, `finishOnboarding`, `theses`, `markHint`, `setMuted` | `localStorage`: `nucleo.profile`, `nucleo.progress`, `nucleo.theses.local`, `nucleo.hints`, `nucleo.deskMemory`. The last 5 reads are kept in `sessionStorage` (`nucleo.reads`), so a reload restores an unsaved read (`pendingRead`). |
| `suggestions` | Quick access comes from the local desk memory, padded with `DEFAULT_QUICK_ACCESS`. Live movers (`/api/bobby-asset-search?browse=1`, falling back to `/api/okx-tickers`) are fetched only after consent. |
| `speech.*` | Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`), `es-MX`/`en-US`, interim results. The level comes from a WebAudio analyser on `getUserMedia` (Chromium); on WebKit it is a syllable envelope instead. Without the API the mic is `unavailable` and the engines type. `onDevice` is always `false`: the browser may send audio to its own speech service. |
| `speak` | `POST /api/bobby-voice-free {text, lang, voice, vibe}`, like `NeuralVoice`: 8 s, one retry, and no retry once the line has stopped. The audio is decoded into an `AudioContext` with an `AnalyserNode` that drives `voice.level`/`voice.progress`. If that fails, it falls back to `speechSynthesis`, using only voices that run on the device, with `voice.word` events. Audio unlocks on the first gesture. Before that gesture, and before consent, the reply is `muted`. |
| `previewVoice` | Plays `/nucleo/voice/select-<id>-<lang>.mp3`, which is free and allowed before consent (R11). |
| `haptic` | `navigator.vibrate` where it exists and the user has interacted, at most once per 40 ms. Otherwise it does nothing. |
| `openNative` | `riskNotice`, `squad` and `account` open in-page sheets drawn from the same data, and emit `native.sheet`. `squad` lets the user switch companion, because `/squad` is only a showcase. `isla` goes to `/trader-land`. From the app page, `riskNotice` while the notice is not accepted replaces the page with `onboarding.html#risk`. |
| `openClassic` | Goes to `/desk`. The engines only call it in dev builds. |
| `signIn` | Returns `unavailable`. The session carries `signInAvailable:false`, so the onboarding never offers sign-in. |
| `island` / `record` | Returns the signed-out answer (`pendingSeeds`) and `no_source`. |

## Web patches (contract change requests for the iOS branch)

These are defined in `WEB_PATCHES` in `build.py`, and each must match exactly once. None of them changes native behaviour. They should move upstream:

1. **Pre-permission copy.** It says "iOS will ask…", which is wrong in a browser. The patch adds a `perm.bodyWeb` string (en and es) that says the browser asks for the mic and that its speech service transcribes. It is chosen when `session.platform == "web"`.
2. **`session.signInAvailable`.** It is a new, optional field. The onboarding skips `SIGN_IN` when it is `false`. Native omits it, so native behaviour is unchanged.
3. **Hold-to-agree cancels the first read (a bug on iOS too).** The finger that completes the 1.2 s hold is often still down when the read starts, 0.4 s later. Its release lands on the "thinking" pill and cancels the read. The patch ignores a pill release whose press began in `RISK`.
4. **Hidden stage until the first frame.** A 600 KB page can paint its DOM before its scripts run. Native covers the load with a snapshot. The patch keeps `#stage` hidden until the first rendered frame after `session()`.

## Tests

```sh
node nucleo/tests/web-transport.test.mjs   # 107 checks, scripted HTTP, no network, no quota
```

The test loads the real `src/web/*.js` in a VM with browser shims. It covers:

- routing;
- session and roster shapes;
- consent and length gates with zero network;
- stage order and request bodies;
- every refusal and failure mapping (never a verdict on failure);
- the R14 preflight never reaching the desk;
- single-use tokens, busy and cancel;
- the award rules and the daily cap;
- the Web Speech plumbing, including a refusal;
- voice gates;
- Spanish.

## Local preview

`vite preview` does not proxy `/api/desk-debate`, and production rejects a `localhost` Origin. To walk the real flow locally, serve `dist/` with a small proxy that forwards `/api/*` to `https://bobbyprotocol.xyz` with `Origin: https://bobbyprotocol.xyz`. That is what the iOS app sends natively. Every desk read spends the shared quota (caller 30, network 60, global 600 a day).
