# iOS 1.2 (32): patience decides the piece — Trader Land Growth v1

Branch `ios/trader-land-growth` (worktree `.claude/worktrees/ios-tl-growth`) = build 31 line
(`ios/release-31`) + the island name header (`ios/trader-land-island-name`) + Growth v1
(island lane + desk lane, merged). Contract: `docs/trader-land/GROWTH-v1.md` on
`feat/trader-land-growth` (web/API PR #96). Needs the API from PR #96 and migration
`20260919120516_trader_land_growth` (applied on bobby-protocol 2026-09-19).

## Why
Anthony (2026-09-19, on build 31): a daily user runs out of pieces in days (8-piece route), the
island never grows, the big Aura Core sits in the middle by default, "Trader Land" should read
"Anthony Land", and he wanted Focus-Tree-style scaling ("one question, one item").

## Island name
- A named island leads with its own name (header + archipelago label); "TRADER LAND" moves to
  the eyebrow.

## Desk
- The harvest card after a read offers the horizon: **24 h** (common 1×1, planted) · **3 days**
  (building 2×1) · **7 days** (landmark 2×2), each naming the piece it would bloom into, upward
  only, with a confirm step ("You can't shorten it later"). Extends through a standalone
  authenticated POST; stale/lost answers re-read the seed; follows the clock and the account.
- "See it on my island" opens on that seed's row.
- QA: `-qa-harvest seed-3d | seed-7d | picker | picker-closing | picker-long`.

## Trader Land
- Islands of 8/10/12/16 drawn with one geometry (tiles 92·8/N × 46·8/N, constant slab);
  deeper zoom on grown islands; home zoom 1.25 from 12×12.
- The Aura Core comes from the land: dormant (stage 0, 72 %, static) until 5 pieces, then awake;
  tap it → Move.
- Seeds show horizon + tier; extend from the reviews list (Menu + confirmation).
- Footer: `10×10 · 22/60` growth progress and core state; "Your island grew" notice.
- Neighbours in the archipelago are drawn at their own size with their own core.
- Every request declares `X-Trader-Land-Client: 2`; place/move/move_core carry the size they
  were drawn on (the server refuses a stale frame).
- DEBUG: `-trader-land-account-fixture` (10×10, moved dormant core, extendable seed).

## Tests
88 unit tests + 13 UI tests (TraderLandGateTests, DeskHarvestCardTests) green on iPhone 17 Pro
simulator; `scripts/TraderLandGeometryContract.swift` 658 cases and
`scripts/TraderLandSyncContract.swift` PASS.

## Compatibility
Builds 26 (1.1, App Store) and 31 reject islands that are not 8×8; the server gives them
`ok:false` ("not supported yet") once an island grew or its core moved from a new client.
