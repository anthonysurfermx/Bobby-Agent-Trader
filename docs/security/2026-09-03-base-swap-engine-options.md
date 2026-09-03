# Base-only swaps: two engines built in parallel on 2026-09-03

Two Claude sessions were given the "Base is the only network, Uniswap the only
swap engine" decision within the same hour and both wrote `api/_lib/base-swap.ts`
plus `api/base-swap.ts` in the same worktree (`.claude/worktrees/base-swaps`).
The second write overwrote the first. This branch keeps the Universal Router +
Permit2 engine isolated so both can be reviewed; nothing here touches the other
branch.

| | `feat/base-only-swaps` (session c907b8e8) | `feat/base-swaps-universal-router` (this branch) |
|---|---|---|
| Router | SwapRouter02 `0x2626664c2603336E57B271c5C0b26F421741e481`, `multicall(deadline, …)` | Universal Router `0x6fF5693b99212Da76ad316178A184AB56D299b43`, `execute(commands, inputs, deadline)` |
| Approval | exact-amount ERC-20 approve to SwapRouter02, consumed by the swap | exact-amount ERC-20 approve to Permit2 (only if allowance short) + EIP-712 `PermitSingle` bounded to amount / 30 min / 20 min sig deadline, spender = router |
| Wallet steps (ERC-20 in) | 2 txs (approve, swap) | 1 tx + 1 signature + 1 tx the first time; later swaps: signature + tx |
| Quote | QuoterV2 over fee tiers, multi-hop candidates, price-impact guard | QuoterV2 `quoteExactInputSingle` over fee tiers, single hop |
| Tokens | shared allow-list `src/lib/base-swap/tokens.ts` (ETH, WETH, USDC, USDT, DAI, cbBTC, AERO) | in-module allow-list (ETH, WETH, USDC, cbBTC, cbETH) |
| Caps | 500 USD per ticket (env can lower), slippage ≤ 3 %, impact ≤ 3 % | 2,000 USDC per ticket, slippage ≤ 3 % |
| Kill switch | not seen at the time of writing | `BASE_SWAPS_ENABLED=true` required, else 503 `swaps_disabled` |
| Receipts | not seen at the time of writing | `swap_receipts` table (migration 0009, applied to bobby-protocol), calldata sha256, `confirm` records tx hash |
| Offline tests | `scripts/test-base-swap.mts` (decode calldata, path encoding, limits) | — |
| Live smoke | `scripts/smoke-base-swap.mts` (mainnet eth_call, no signing) | — |
| Fork test | — | `scripts/base-swap/fork-test.mts`: anvil fork of Base, real broadcast, balances checked, 18/18 |

## What the fork test proves (this branch)

Run on 2026-09-03 against a fork of Base at block 50824739:

- quote 100 USDC → ETH via the 0.01 % pool, minimum received = quote × (1 − 0.5 %)
- exact approve to Permit2, Permit2 signature bounded to amount and router
- calldata targets the Universal Router with value 0 for an ERC-20 input
- simulation from the owner passes, the broadcast mines, exactly 100 USDC leaves
  the wallet and the ETH received is ≥ the minimum net of gas
- native input path: no approval, no permit, `value = amountIn`, USDC received ≥ minimum
- refusals: unknown token, amount above the cap, slippage above 3 %, permit for a
  different amount, and a minimum above the market reverts the simulation

One trap found on the way: the well-known anvil test keys carry EIP-7702
delegations on Base mainnet, so Permit2 treats those addresses as contracts and
the permit reverts with empty data. The test uses a fresh random key.

## Recommendation

The decision text names "Universal Router + Permit2", which is this branch. The
other branch has the better allow-list plumbing (shared with the UI), price-impact
guard and offline decode tests. The cheapest merge is: keep the other branch's
token list, limits and offline tests, and swap its router layer for the
Permit2 + Universal Router builder from this branch, then rerun the fork test.
Whichever engine wins, swaps stay closed (`BASE_SWAPS_ENABLED` unset) until Codex
reviews calldata, slippage, recipient, allow-list and an on-chain confirmation.

## X Layer / OKX touchpoints to retire (inventory, read-only, main@d55967d)

API (69 files):
- `api/activity.ts`
- `api/agent-run.ts`
- `api/auto-bounty.ts`
- `api/bobby-asset-cache.ts`
- `api/bobby-asset-search.ts`
- `api/bobby-cycle.ts`
- `api/bobby-intel.ts`
- `api/bobby-pnl.ts`
- `api/bobby-protocol-stats.ts`
- `api/bobby-signals.ts`
- `api/dex-approve.ts`
- `api/dex-quote.ts`
- `api/dex-swap.ts`
- `api/explain.ts`
- `api/forum-resolve.ts`
- `api/generate-activity.ts`
- `api/mcp-bobby.ts`
- `api/mcp-http.ts`
- `api/okx-candles.ts`
- `api/okx-market.ts`
- `api/okx-onchain.ts`
- `api/okx-perps.ts`
- `api/okx-signal.ts`
- `api/okx-tickers.ts`
- `api/onchainos-price.ts`
- `api/onchainos-status.ts`
- `api/openclaw-chat.ts`
- `api/premium-signal.ts`
- `api/protocol-heartbeat.ts`
- `api/protocol-tx-history.ts`
- `api/registry.ts`
- `api/reputation.ts`
- `api/sandbox-run.ts`
- `api/sentinel-demo.ts`
- `api/settle-trades.ts`
- `api/smart-money-leaderboard.ts`
- `api/technical-analysis.ts`
- `api/telegram-access.ts`
- `api/telegram-deliver.ts`
- `api/telegram-webhook.ts`
- `api/voice-tool.ts`
- `api/xlayer-record.ts`
- `api/xlayer-trade.ts`
- `api/_lib/assets.ts`
- `api/_lib/b1nary.ts`
- `api/_lib/base-swap.ts`
- `api/_lib/chains.ts`
- `api/_lib/chart.ts`
- `api/_lib/commit-policy.ts`
- `api/_lib/dex-allowlist.ts`
- `api/_lib/dex-execution.ts`
- `api/_lib/dm-analysis.ts`
- `api/_lib/hardness-registry.ts`
- `api/_lib/indicators.ts`
- `api/_lib/mcp-challenges.ts`
- `api/_lib/mcp-uniswap-quote.ts`
- `api/_lib/okx-hmac.ts`
- `api/_lib/okx-indicators.ts`
- `api/_lib/okx-link.ts`
- `api/_lib/okx-security.ts`
- `api/_lib/protocol-constants.ts`
- `api/_lib/protocol-write-safety.ts`
- `api/_lib/record-auth.ts`
- `api/_lib/risk-gate.ts`
- `api/_lib/signals.ts`
- `api/_lib/trackrecord-stats-adapter.ts`
- `api/_lib/trackrecord-v2-recorder.ts`
- `api/_lib/trackrecord-v2.ts`
- `api/_lib/xlayer-payments.ts`

UI (28 files, 8 of them with chain selectors/options):
- `src/components/WalletConnect.tsx`
- `src/components/adams/AdamsChat.tsx`
- `src/components/adams/DisclaimerBanner.tsx`
- `src/components/adams/ExecutionTimeline.tsx`
- `src/components/adams/IntelligenceFeed.tsx`
- `src/components/adams/SwapConfirm.tsx` (selector)
- `src/components/adams/XLayerSwapCard.tsx` (selector)
- `src/components/agent-radar/AgentRadarLanding.tsx`
- `src/components/agent-radar/OKXSwapWidget.tsx`
- `src/components/agent-radar/YieldBanner.tsx`
- `src/components/agentic/SkillsComparisonSection.tsx`
- `src/components/charts/AIAgentSkillsTable.tsx`
- `src/components/claw-trader/DexQuotePanel.tsx`
- `src/config/reown.ts`
- `src/data/playbooks.ts`
- `src/lib/onchainos/dex-client.ts`
- `src/lib/onchainos/xlayer-tokens.ts`
- `src/pages/AgentForumPage.tsx`
- `src/pages/BobbyArchitecturePage.tsx`
- `src/pages/BobbyChallengePage.tsx` (selector)
- `src/pages/BobbyDocsPage.tsx` (selector)
- `src/pages/BobbyHarnessConsolePage.tsx`
- `src/pages/BobbyMarketplacePage.tsx` (selector)
- `src/pages/BobbyNetworkConsolePage.tsx`
- `src/pages/BobbyProtocolLanding.tsx` (selector)
- `src/pages/BobbySubmissionPage.tsx` (selector)
- `src/pages/BobbyTelegramPage.tsx` (selector)
- `src/pages/PolymarketTrackerPage.tsx`

Routes in src/App.tsx mentioning X Layer:
```
(none)
```

Keep read-only: ledger rows, explorer links for historical X Layer receipts.
