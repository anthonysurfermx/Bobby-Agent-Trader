# iOS 1.2 (31): every read plants something — Trader Land connected to the desk

Branch `ios/release-31` (worktree `.claude/worktrees/ios-release-31`). Contains build 30
(`ios/release-29` @ 3bca497, the locker, from the "Squad avatars" session) plus this work.

## Why
Anthony (2026-09-18, on build 29): people don't connect the desk with Trader Land — "I don't
know what I earned, how, or why I should open it"; the green has no meaning; other islands are
hidden; pieces sitting on the grid lines are hard to read. Trader Land is the habit loop.

## Desk → island
- Every award now carries the read's thesis (`events[i].thesis`: symbol, isEquity,
  long/short/none, price, entry, stop, target — same validation as the web and ThesisSchema).
  Until now every iOS seed reviewed as `expired`.
- ProgressSync reads `results[i].world` (the RouteGrant the server already returned) per event.
- Harvest card after every finished read (under the verdict; under the NO TRADE shield for a
  NO TRADE): seed planted + "blooms when you review this thesis in 24 h: BTC long @ …",
  piece ready → Build it, daily limit, route complete, signed out → Save progress, syncing,
  pending. Bilingual. DEBUG: `-qa-harvest <state|all>`.
- Trader Land chip in the desk header with a badge (ready to build + reviews ready), driven by
  GET /api/trader-land; opens the island on the right focus (review / build piece).
- NO TRADE chip says "SAVED TO YOUR ACCOUNT" when signed in.

## Trader Land
- Desk dark (`Theme`) instead of the green palette; Base-blue primary buttons; gold selection.
- Anchor fix: sprites were drawn tileHeight·(cols+rows)/4 too high (manifest anchor = bottom
  vertex of the footprint), so every base sat on the line behind its tile. Filaments now run on
  the path slab. (The web studio has the same bug: TraderLandGatePage.tsx:129/149.)
- Ground as one layer: no checkerboard, faint lines only on free revealed tiles, none under
  pieces; island slab with side faces and one rim; code contact shadows from the real
  footprint; fog below the art; placement footprint under the draft piece.
- Header says what you earned and what's next: reviews ready → ready to build → seed growing
  (review opens in …) → "your next piece comes from a read"; route line "next: piece N of 8".
  "Ready to build" row at the top of the collection; district names instead of "01 ·".
  Help: 3 steps of how the island grows.
- Archipelago: zoom out continuously (to ~22%) or tap the header button; public islands
  (/api/trader-land-public) around yours in a hex ring, ‹ › arrows fly island to island,
  "Back to my island", read-only visits, "Put your island on the map". Free lots when fewer
  than 6 islands — prod has 0 public islands today. DEBUG: `-land-neighbors-fixture`.
- Route piece 7 (`axiom_archive_return_path`) now renders (catalog alias, as on the web).
- Share link fixed: `/agentic-world/bobby/trader-land/w/<code>` (`/trader-land/w/` is a 404 on
  the web — separate task).
- 409 messages from the server are shown truthfully (already bloomed / market not ready).

## Locker (build 30) + founder note
- The desk's "+" is the locker (build 30).
- Companions only float in the locker and onboarding: the 9–14 Hz tremble is removed
  (Anthony: "se ven raro, solo que floten").

## Process
Understand (4 mappers) → two implementers in separate worktrees (`ios/b31-land`,
`ios/b31-desk`) → one adversarial reviewer per track → fixer. Land: 8 findings, all fixed
(archipelago first-open freeze 0.64 s, contradictory empty copy, sea not moving with the
camera, stuck countdown, focus fallback, route count, gendered Spanish). Desk: high finding
(wrong focus on first sheet presentation) fixed; harvest card no longer floats over the chart.

## Open
- Signed-in paths (real grant → seed card, chip badge, review with thesis) verified by unit
  tests and QA fixtures only; needs one real signed-in read.
- Archipelago camera flight renders ~13–15 fps on the simulator with islands drawn; check on
  device.
- Web: 404 share route + same anchor bug (task chip created).
