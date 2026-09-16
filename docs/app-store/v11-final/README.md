# Bobby 1.1 (24) — App Store screenshots, submitted 2026-09-16

Six frames in the 6.9" slot (1320 × 2868), English (U.S.), uploaded one at a time
so the order below is the order on the product page.

| # | Frame | Background plate | Screen |
|---|---|---|---|
| 1 | Say it out loud. Any market. | `v11-plates/01-live-voice.png` | none |
| 2 | A desk. Not a chatbot. | `v11-plates/03-three-agents.png` | `shots-build24/01-desk.png` |
| 3 | NO TRADE is a real answer. | `v11-plates/02b.png` | `shots-build24/03-verdict.png` |
| 4 | Discipline levels you up. | `v11-plates/04b.png` | `shots-build24/05-gear.png` |
| 5 | Every good call builds your island. | `v11-plates/06-trader-land.png` | `shots-build24/02-trader-land.png` |
| 6 | Written down before the outcome. | `v11-plates/07-record.png` | none |

The narrative is Bobby's value chain: you ask, three agents argue, a verdict lands,
discipline pays, your world grows, and the call stays public.

## How these were made

Background plates: Higgsfield GPT Image 2, 9:16, 2K, nine generations at 6.5 credits
each (five first pass, two recomposed because the subject sat where the phone goes,
two new for Trader Land and the closing frame). Prompts reserve the right two thirds
as empty negative space. Frames 5 and 6 crop left-anchored, not centre, or the subject
falls off the edge.

Screens: captured from build 24 on an iPhone 17 Pro Max simulator against production
on 2026-09-16. `03-verdict.png` is a real NO TRADE on BTC at $75,497. The `StoreShots`
UI test could not produce these — build 24 opens a risk-notice gate before onboarding
that the test does not acknowledge, so four of its five cases fail at the first assert.
Driving the app by hand was the workaround; fixing the test is still open.

Composited by `scripts/build-store-v11-final.mjs`.

## Not captured

The adversarial desk rail (ALPHA hunts / RED TEAM attacks / CIO decides) is on screen
for well under a second between "resolving asset" and the verdict. Several timed
capture loops missed it. Frame 2 carries that idea in the photograph and the caption
instead. Worth adding a `-store-shots` hook that parks the desk in that state.

## 4.3(a) history

Ten lifestyle frames shipped in August (`final/`, `final-v2/`, `final-v3/`). Apple
rejected under Guideline 4.3(a); seven frames carrying no app UI were deleted and the
three hybrids stayed. These six follow the hybrid pattern that survived: four show
real native UI, and the two that do not open and close the sequence.
