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
