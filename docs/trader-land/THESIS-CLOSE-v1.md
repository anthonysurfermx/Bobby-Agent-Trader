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

## Executed theses and the season collection (same day, Anthony: "dale con 1 y 3")

Anthony asked for more XP for xStocks swaps and a "super garden" for active
wallets. Volume-based XP was declined (it breaks the v0.2 safety promise, the
App Store 4.3a appeal and reads as gamified trading to a regulator). What
shipped instead rewards **process**:

1. **Execution bonus.** At review time the server looks for a confirmed Base
   swap by the reviewer's own wallet (`bobby_swap_receipts`, the rows Bobby
   built and verified on-chain) that moved the thesis' asset in the thesis'
   direction between the read and the review: stable → asset for a long,
   asset → stable for a short; assets matched by contract, so ETH ≡ WETH,
   BTC ≡ cbBTC, NVDA ≡ NVDAc (`swapExecutesThesis` in `thesis-rules.ts`).
   One swap executes at most one thesis: receipts already recorded in a
   `thesis_close.executed` meta are skipped. A match pays `EXECUTION_BONUS`
   = +10 XP / +4 Aura on top of the close, inside the same `thesis_closed`
   ledger row (`points` = 25, `meta.thesis_close.executed` = receipt id, tx
   hash, legs, time). A swap without a thesis, or a wallet full of history,
   pays nothing. iOS identities without a linked wallet cannot execute yet.
2. **Season I "On-chain"** (`api/_lib/trader-land-season.ts`): six existing
   off-route pieces in a fixed, visible order — Candle Tower → Evidence
   Workshop → Red Team Observatory → Lit Archive → Three Gate Citadel → Base
   Ring Seal. Every executed review grants the next one, already bloomed,
   as `tl_inventory` rows with `source = 'season'` tied to the close's ledger
   event (one piece per event). `GET /api/trader-land` returns `season`
   (name, rule, earned/total, next); the studio shows a season card in the
   collection, tags season pieces, hints "Executable on Base" on seeds whose
   asset Bobby can swap, and the bloom notice names the bonus and the piece.

No migration: `tl_inventory.source` already allows `season`, the six ids exist
in `tl_items`, and the bonus lives inside the `thesis_closed` row. A dedicated
on-chain **district** needs its own five lots of art first; moving the season
table into `tl_items (season, season_index)` is what lets a season rotate
without a deploy. Known soft spot: two executed reviews of the same identity
closed in the same instant could both grant the same season piece (the client
serializes mutations; a partial unique index on `(identity_id, item_id) where
source = 'season'` closes it when the next migration lands).

Trade-off flagged: an executed cycle (10 + 25 = 35 XP) now out-earns a
respected NO TRADE (20 XP), which bends v0.2's "same potential for LONG,
SHORT and NO TRADE". Anthony chose it; the season stays cosmetic and the
bonus modest.

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
