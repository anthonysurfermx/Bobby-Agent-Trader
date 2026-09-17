# Bobby for Google Play — store assets

Everything Play asks for at listing time, built 2026-09-17 against production.

| Asset | File | Play's requirement |
|---|---|---|
| App icon | `final/icon-512.png` | 512 × 512, 32-bit PNG **with alpha**, ≤ 1 MB — 590 KB ✓ |
| Feature graphic | `final/feature-graphic-1024x500.png` | 1024 × 500, ≤ 15 MB — 420 KB ✓ |
| Phone screenshots | `final/01-ask.png` … `07-risk.png` | 2–8 shots, 9:16 or 16:9, 320–3840 px per side, ≤ 8 MB each — seven at 1080 × 1920, ~2 MB each ✓ |
| Contact sheet | `final/contact-sheet.jpg` | not uploaded; for reviewing the set in one look |

Upload the screenshots in file order — Play shows them in upload order and the set tells
one story front to back.

## The set

| # | Frame | Plate | Screen |
|---|---|---|---|
| 1 | Say it out loud. Any market. | `plates/01-voice.jpg` | `shots-web/04-desk-idle.png` |
| 2 | A desk. Not a chatbot. | `plates/07-desk-dark.jpg` | `shots-web/07-verdict-scrolled.png` |
| 3 | NO TRADE is a real answer. | `plates/03-rain.jpg` | `shots-web/06-verdict.png` |
| 4 | Discipline levels you up. | `plates/04-magenta.jpg` | `shots-web/03-loadout.png` |
| 5 | Every good call builds your island. | `plates/05-floor.jpg` | `shots-web/09-trader-land.png` |
| 6 | Ten companions. One desk. | `plates/08-friends.jpg` | `shots-web/01-companion-picker.png` |
| 7 | Analysis, not advice. You decide. | `plates/06-corridor.jpg` | `shots-web/00-risk-gate.png` |

## Why this is not the App Store set rescaled

The iOS frames are 1320 × 2868. Play wants 9:16, which is a different shape, not a smaller
one — type size, phone geometry and how much plate is left around the device were laid out
again rather than squeezed. `scripts/build-play-store-shots.mjs` is its own script for that
reason; the two sets share a look, not a canvas.

Every frame carries real app UI. Play is far more relaxed than Apple about lifestyle
imagery — Apple deleted seven frames of the August set under Guideline 4.3(a) — but a
screenshot that shows the app is a better screenshot anyway, and the Misrepresentation
policy is one of the few places a finance app actually gets pulled.

## How the screens were captured

Not from an iOS simulator, and not from the iPhone captures in `docs/app-store/`. These are
the live web app driven headless at Pixel-8 metrics — 412 × 892 CSS at DPR 3, Android
Chrome user agent, giving 1236 × 2676 PNGs — which is exactly what the Trusted Web Activity
serves on an Android phone. The capture script lives in the scratchpad rather than the repo
because it drives production through onboarding and asks BTC for a real verdict; frame 3 is
a real NO TRADE on BTC at $76,570.

There is no status bar in any of them. A TWA runs full-screen with the app's own theme
colour behind the system bars, and inventing a fake Android status bar in a screenshot is
exactly the kind of small lie that is not worth telling.

## How the plates were made

Higgsfield GPT Image 2, 9:16, 2K, quality high — nine generations at 6.5 credits, six in
the first pass plus three more (a dark desk for the debate frame, friends in an alley for
the squad frame, and the wide rooftop for the feature graphic). Prompts hold the right two
thirds of the frame empty so the phone has somewhere to sit, and every prompt that includes
a handset asks for an Android one with the screen off — the only phone showing UI anywhere
in the set is the one the script draws.

Stored as JPEG at quality 92: they are photographs, and nine 5 MB PNGs is not a thing to
put in a repo twice.

## Rebuilding

```bash
node scripts/build-play-store-shots.mjs      # -> docs/play-store/final/*.png
node scripts/build-play-feature-graphic.mjs  # -> docs/play-store/final/feature-graphic-1024x500.png
```
