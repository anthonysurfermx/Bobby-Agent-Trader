# Base judge walkthrough — 2026-09-13

Entry: https://bobbyprotocol.xyz/desk. Fix branch starts at `a58bca3` (current main at the start of the audit), separate from the user's dirty checkout.

## Findings and fixes

| Finding | Evidence | Resolution |
| --- | --- | --- |
| An invalid asset leaves the previous verdict and levels visible | Live BTC → NVDA → nonexistent ticker walkthrough | Clear the previous answer, pending confirmation and levels immediately; show a visible error on desktop and mobile. |
| Overlapping requests can apply stale responses or XP | Async request and delayed stage review | Abort obsolete requests; ignore obsolete results and candle data; cancel on unmount. Bound search, analysis and quote requests, including reading JSON bodies. |
| Trader Land loses the thesis associated with a read | Desk passes a third argument to a two-argument progress method | Add and persist the thesis snapshot on the pending event already accepted by `/api/progress`; preserve daily award caps. |
| Prepare buy is enabled without enough USDC | Live public quote completed while wallet balance was below the ticket | Require a quote, known sufficient balance and the server ticket limit before preparing. Wallet signing and server eligibility checks remain in place. |
| Native ETH unavailable to the sell panel | Balance hook omitted ETH from its returned token map | Include native balance; reserve the MAX shortcut for ERC-20s and explain keeping ETH for fees. |
| Sell MAX rounds token balances through a JavaScript number | Code review | Preserve raw balance through `formatUnits`; reject unrepresentable decimals; compare spend amounts as integers. |
| English chart contains Spanish labels | Live desktop walkthrough | Translate indicator and agent labels using the selected language. |
| PEPE appears as $0.0000 in Explore | Local walkthrough with live public API | Preserve significant digits for inexpensive assets. |
| UI overstates its source and freshness | Desk stances are derived from one technical pulse; onboarding promises no delay | Label it Technical Desk, state the 1H indicator source and link to public agent activity. Correct freshness and custody copy. |

## Validation

- Live: risk notice, companion/vibe/loadout, BTC and NVDA reads, NO TRADE, reward dismissal, invalid query, optional sign-in dismissal, Base quote, Trader Land navigation.
- Local against public market APIs: onboarding, BTC read, invalid-query recovery, Explore, swap sheet, English labels; 390 × 844 mobile layout has no horizontal overflow.
- `npm run test:desk-audit`: request cancellation/deadlines (including a hanging body), exact token units, insufficient/unknown balance, server cap, low-price formatting, thesis queue and award cap.
- `npm run test:base-swap`: existing quote/build safety and stock-canary tests passed.
- `npm run test:trader-land-thesis`: 66 passed.
- `npm run build`: production build and API typecheck passed. The optional whole-frontend typecheck still reports errors elsewhere in the repository; no errors remain in the edited modules.

## Coverage boundaries

No funds were moved, transactions signed, or new accounts created. Microphone capture and a complete authenticated cross-device sync were not exercised. Thesis transport is tested through the local queue and the server schema; authenticated persistence and the 24-hour review were not run against production. This is a focused product-flow audit, not a contract security audit.
