# Gen Z desk UX audit — 2026-09-03

Scope: shortest clear path from opening the Live Desk to asking about a stock or asset. Reviewed jointly with Kimi K3 against the supplied 2570×1356 production screenshot and the current React implementation.

## Findings

### P0

- The text composer was visually secondary at the bottom of the chart column while the blue microphone dominated the first action.
- Idle copy said to tap the companion, but the mascot had no matching interaction.
- The primary field did not receive desktop focus, adding an avoidable click.
- Trader Land was presented as “soon” and its available web runtime stored a separate local-only world.

### P1

- Equal 50/50 desktop columns gave the mascot excessive empty space and constrained the chart.
- The chart could retain a stale visible range after data replacement, clustering candles on the right.
- Kora’s headset used an older web anchor than iOS, making one cup appear detached at the jaw/neck.
- Tiny quick-access controls and a preloaded BTC chart competed with the user’s own intent.

## Implemented decisions

- Put a high-contrast “Start here” composer above the chart, autofocus it on desktop, add examples, voice input, disabled/loading states and explicit “nothing executes” context.
- Change the desktop split to 39/61 and reduce the desktop mascot from 400px to 340px.
- Replace the false tap instruction with “Type or name an asset to begin.”
- Keep quick-access chips immediately below the primary composer.
- Fit chart content after every successful data update.
- Mirror Kora’s corrected iOS headset anchor on web: `(0, 0.58, 0.64, 0.68)`.
- Expose `/trader-land` from the desk and replace localStorage world state with authenticated `GET/POST /api/trader-land` state.
- Treat Supabase-backed XP, aura, Discovery Route, inventory and placements as authoritative. The web client no longer invents inventory or saves placements locally.
- Reserve the universal Aura Core footprint in server placement validation, matching both clients.

## Acceptance checks

- Production build and lint pass.
- Desktop composer is visible without scrolling and focused on entry.
- No runtime error overlay or browser console errors on `/desk`.
- `/trader-land` renders a clear shared-identity gate when signed out.
- Desk → Trader Land → desk is available in two actions or fewer.
- Connected placements are accepted or rejected by the server; no client-only persistence remains.

## Follow-up metrics

- Median time from desk render to first submitted question: under 5 seconds.
- Composer visible without scroll for supported viewports at least 360×640.
- Trader Land read p95 below 800ms.
- XP shown in Trader Land equals `/api/progress` after sync.
- Maintain a screenshot matrix for every companion/item pair on web and iOS when adding new gear.
