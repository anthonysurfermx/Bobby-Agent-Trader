# Base tokenized-stock rail

## Product decision

Bobby's execution focus is **Base + Uniswap V3 + tokenized equities**. The
assets launched natively on Base are Coinbase Tokenized Stocks implemented as
B20 tokens. They are not branded xStocks, so the product calls them
"tokenized stocks" and shows the B20 issuer and contract explicitly.

Initial live set (identity is always the address, never the mutable symbol):

| Underlying | UI symbol | B20 address | Chainlink Total Return Value feed |
| --- | --- | --- | --- |
| Apple | AAPLc | `0xb200000000000000000000C2e324d24d7eEcd1fb` | `0x787f13dEa48Db0897CbCDD985de77809D837F988` |
| Alphabet | GOOGLc | `0xb2000000000000000000002D0BA3164cc74f58B7` | `0x5bF49E0ffA937CE2FfF033c739aD7C634c4D34F2` |
| Meta | METAc | `0xb2000000000000000000008bC8786B856E61707C` | `0x6526aE6797A76123638b863AeE4dD27Ba4E4b27D` |
| NVIDIA | NVDAc | `0xb20000000000000000000078ee7ce2fE4908108C` | `0x04689a41629776563E6822F76f2e57D148d28513` |

The remaining published B20 equity addresses are not enabled until they have
circulating supply and observable Uniswap liquidity.

## Execution policy

- Only direct USDC/B20 Uniswap V3 pools are considered. No WETH bridge route.
- Maximum tokenized-stock ticket is $100; operations may lower it via
  `BASE_SWAP_MAX_TICKET_USD`, never raise it.
- The server verifies live B20 symbol, decimals, positive supply and multiplier
  before returning transaction data.
- The server reads the official Chainlink feed. It warns after 26 hours,
  withholds after 96 hours, warns at 2% DEX/reference deviation and withholds at
  5%. The wider time window permits weekends while still failing closed on a
  prolonged freeze.
- The user confirms an eligible jurisdiction outside the United States and is
  told the token is not the underlying share.
- An exact ERC-20 approval goes to SwapRouter02. Approval success is not swap
  success and does not prove a B20 policy allows transfer. After approval the
  client requests a fresh quote; only a successful `eth_call` simulation
  enables the swap.
- Exact allowance can remain if the user abandons or the swap reverts. The UI
  states this instead of claiming the allowance is always consumed.
- Only a successful Base receipt whose sender, router, direct token pair,
  recipient, input amount and minimum output match the reviewed calldata is
  stored in `bobby_swap_receipts`.

## Shared product state

Apply `20260903000009_swap_receipts.sql` before deploying the API. Receipt rows
attach to `bobby_identities`, the same identity layer used by Sign in with Apple,
wallet linking, progress and Trader Land. iOS can read the same normalized
history using its Supabase bearer token; web writes are wallet-session bound.

## Verification

Run:

```sh
npm run check:api
npm run test:base-swap
npm run smoke:base-swap
npm run test:api-security
npm run build
```

The smoke is read-only. It verifies the pinned Uniswap venue, quotes all four
live USDC/B20 markets, reads B20 multipliers and Chainlink references, enforces
the $100 cap and refuses calldata for an empty wallet.

## Sources

- Base B20 tokenized-stock integration guide:
  https://docs.base.org/specifications/b20/tokenized-stocks-on-base
- Base IB20 reference:
  https://docs.base.org/specifications/b20/reference/interfaces/ib20
- Uniswap V3 Base deployments:
  https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments
