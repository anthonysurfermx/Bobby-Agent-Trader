# Trader Land — thesis close v1 (seeds finally bloom)

Date: 2026-09-05
Branch: `fix/trader-land-thesis-close` (from `codex/trader-land-web-release`)
Status: implemented, unit-tested, built; not deployed.

## The gap it closes

Until this change a `read_complete` planted a **seed** and the only thing that
could bloom it was a `thesis_closed` event. No client emitted that event and
there was no resolver, so every seed from a LONG/SHORT read stayed a seed
forever. Only users whose verdict came back NO TRADE (`no_trade_respected`,
which grants a piece already bloomed) could fill their island. Worse,
`/api/progress` accepted `thesis_closed` from any client and, when there was no
seed to bloom, granted the next route piece already bloomed — a farming hole
held back only by the daily cap.

## The loop now (SYSTEM-DESIGN v0.2 §4, Fase B)

1. **Read plants a seed with its thesis.** The desk sends the verdict with the
   award event: `{ symbol, isEquity, direction, price, entry, stop, target }`
   (`CompanionDesk` → `progressStore.awardDiscipline(kind, now, thesis)` →
   `/api/progress` events[].thesis). The server stores it in the ledger row's
   `meta.thesis`; the seed's `tl_inventory.event_id` already points at that row.
   A malformed thesis is dropped, never a reason to refuse the XP.
2. **Review window.** `THESIS_REVIEW_HOURS = 24` after `seeded_at` the seed is
   `ready`. `GET /api/trader-land` returns `review: { thesis, readAt, reviewAt,
   ready }` on every seed, `review.ready` (count) at the top level and
   `capabilities.close: true`.
3. **Close = server verdict.** `POST /api/trader-land { action: 'close',
   inventoryId, tzOffsetMin?, platform? }`:
   - 404 not yours · 409 already bloomed · 409 + `reviewAt` before the window
   - fetches the **public last price** from the venue the read quoted from
     (Yahoo for listed equities, OKX spot for crypto and OKX-only tokenized
     stocks — `api/_lib/public-price.ts`); 503 when no venue answers, never a guess
   - verdict (`api/_lib/thesis-rules.ts`): `hit` past the target,
     `invalidated` past the stop, otherwise `expired` (window closed without
     touching a level, or no thesis/levels to compare). Levels on the wrong side
     of the entry are ignored. The `movePct` since the read is always reported.
   - **compare-and-set** `state='seed' → 'bloomed'`; only the request that flips
     it pays. Then it mints the `thesis_closed` ledger event (server UUID,
     `meta.thesis_close` with outcome, prices, plant event id) and patches
     `bobby_progress` (xp, aura, streak, last_day).
   - responds `{ closed: {...}, ...world }`.
4. **XP.** `thesis_closed` = 15 XP / 6 Aura for every outcome — the P&L never
   enters. Closes are **exempt from the daily plant cap** (they are bounded by
   the seeds they bloom, one per seed, after the window) but still move the
   streak: coming back to review is the "Cierre" attribution.

`/api/progress` now accepts only `PLANT_KINDS` (`read_complete`,
`no_trade_respected`) from clients. `grantRoutePiece` no longer has a
`thesis_closed` branch; `RouteGrant.bloomedInventoryId` stays in the shape
(always `null`) for older clients.

## UI (web studio, `TraderLandGatePage`)

- Seeds show **Growing** until ready, then **Ready to review** with an amber
  border; the selected-piece panel shows the thesis line (`BTC long @ 61,200 ·
  Ready to review.` / `Review from Sep 6, 10:00`).
- Primary button on a seed: **Review thesis** (enabled only when ready and the
  server advertises `capabilities.close`). On success: `bloom_complete` cue and
  a notice like `BTC long: target reached (+3.1%). Data Dock bloomed. +15 XP · +6 Aura`.
- A banner at the top of the collection jumps to the first ready seed:
  `N theses ready to review`.
- The practice island (demo) and visitor mode never offer a close.

## Older seeds and iOS

Seeds planted before this change (and any planted by the iOS client until it
sends `thesis`) have no thesis in their event meta. They still become ready
after the window and close as `expired` with no price comparison, so nobody is
left with a seed that can never bloom. iOS parity: send `thesis` with
`read_complete` events, render `review.ready`, call `close`.

## Not in this version

- A resolver cron that closes theses unattended. The design wants the human to
  come back and look; the button is that return. A cron can be added later
  reusing `closeSeed`.
- Path-based verdicts (did the price *touch* the level at any point). v1
  compares the price **at review time**; honest, but a level touched and
  reverted reads as `expired`. Candles since `seeded_at` would fix it.
- `hit` / `invalidated` marks on the placed art (Proof Marks). The outcome is
  in `meta.thesis_close` of the ledger row; nothing renders it yet.

## Verification

- `npm run test:trader-land-thesis` — 39 assertions: cap exemption, streak on
  close, review window, every verdict branch, tolerant thesis parsing.
- `npm run build` (API typecheck + Vite).
- Manual probe to run on a preview deploy: read → seed with thesis in
  `bobby_progress_events.meta` → close before 24h = 409 with `reviewAt` → after
  24h = 200 with `closed.outcome`, seed bloomed, xp +15, second close = 409.
