# PTS 0.5.0 (5) — integrated native Home

Implemented in `ios/PTS`, based on `PROPOSAL.md` and the supplied DeepSeek audit. The original HTML proposal and screenshots remain design references.

## Resolved decisions

- Accept the three proposed deviations: a full-width card for one real signal, present-tense empty states, and a tonal “Abrir señal” action.
- Keep the four requested labels: Opciones, Stocks, Spot, Scalping. Scalping remains an editorial category for this demo; counts derive from the catalog.
- Source and contract are independent evidence rows. Remove the aggregate “PARCIAL” classification.
- Keep the latest proposal's “Segundo objetivo reportado” wording with “Reportado por el autor · sin verificar” immediately above it, in neutral colors.
- Use “Todas las señales” in the explicit back control. Both button and native edge swipe return to the retained Home.
- Place original YouTube source and both timestamp links above the historical chart. Published levels and bands have neutral colors; candle direction retains chart colors.
- Keep the copilot in the detail, with the COIN-only prompt, scope text, source links and persistent AI attribution footer. Reviewed starter answers can be read without a live connection.
- Preserve the existing account architecture; no separate login was introduced by this Home integration.
- Use an inline educational footer as in the latest proposal. Content scrolls normally at larger text sizes.

## Validation

- Simulator build: passed.
- Signed Release build for iPhone: passed, version 0.5.0, build 5.
- Installed and launched on the connected iPhone 17 Pro; device inventory confirms PTS 0.5.0 (5).
- XCTest: 2 passed, 0 failed on iPhone 17 Pro / iOS 26.1.
- Verified: catalog count/evidence labels, each empty category, source moments, push navigation, text back, interactive edge-back, retained category, AX3 two-column filters and full-width card.
- Inspected native screenshots of Home, Stocks empty state, detail and accessibility text.
- Review captures: `screens/v05/01-home.png`, `02-empty.png`, `03-detail.png`, `04-accessibility.png`.
- Largest accessibility sizes use a single filter column. No user study was performed.
- External YouTube playback/cookie behavior and the existing Live audio service were not end-to-end validated. No TestFlight upload or backend deployment was performed.

The first UI test run found a VoiceOver grouping problem on the signal card. The card now exposes a single actionable button with the full evidence label; the corrected test run passed.
