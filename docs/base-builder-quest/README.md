# Bobby × Tokenized Stocks on Base — Builder Quest entry

**Route:** `/base/stocks` on branch `feat/base-builder-quest` (not deployed yet; local preview via `scripts/b20/dev.sh`)
**Chain:** Base mainnet (8453) · **Assets:** Coinbase B20 tokenized stocks · **Venue:** Aerodrome Slipstream

## What it does

Bobby is a three-agent desk (Alpha Hunter, Red Team, CIO) that debates an asset and gives a
verdict a human can check. This entry points the desk at Coinbase's tokenized stocks and adds
the one thing an analysis app was missing: a way to act on the verdict **without ever giving
Bobby your keys**.

1. **Debate** — `ASK THE DESK · NVDA` runs the same multi-indicator engine Bobby uses for BTC
   on the underlying stock (signal, direction, conviction, entry/stop/target, or an honest
   NO TRADE).
2. **Quote** — the page asks `/api/b20-quote` for a USDC ⇄ B20 quote. The server reads the
   token's `multiplier()` and pause flags, the Chainlink total-return feed (with staleness),
   and simulates the swap on Aerodrome's Slipstream quoter. It reports execution price,
   deviation vs. the oracle, fee tier and ticks crossed.
3. **Sign** — if every guard passes and the human attested eligibility, the server returns
   `approve` + `exactInputSingle` calldata for Aerodrome's router. The page dry-runs the swap
   with the human's own address (`eth_call`) and only then hands it to their wallet.

## Architecture

```
Bobby desk (voice-tool run_debate)  ──▶  verdict, never an order
                                              │
B20 service (api/_lib/b20.ts)                 ▼
  allowlist (src/lib/b20/allowlist.ts) ──▶ status ──▶ quote ──▶ calldata
  · addresses, never tickers                 · multiplier()      · Slipstream quoter    · approve + exactInputSingle
  · discovery ≠ listing                      · pausedFeatures()  · 0.05% tier, tick 10  · minOut from slippage
                                             · Chainlink 24/5    · deviation vs oracle  · 20-min deadline
                                              │
Guards, all server-side                       ▼
  ticket 5–500 USDC · oracle deviation ≤ 3% · feed age ≤ 26h · transfer pause ⇒ no tx
  US excluded via edge country header · eligibility attestation required for calldata
                                              │
Human wallet (wagmi / AppKit, Base)           ▼
  switch to Base ▸ approve ▸ eth_call dry run ▸ sign swap ▸ Basescan receipt
```

- **Bobby never holds keys and never signs.** The API returns calldata; the wallet executes.
- **Discovery is not listing.** New B20s can be discovered from the factory's `B20Created`
  event or Base's canonical list, but only the administered allowlist is quoted or swapped.
  Tokens are identified by address, per the B20 spec.
- **Keyless rail.** Quotes and calldata need no API key: public RPC + Aerodrome's on-chain
  quoter (`0x514c…9259`) and router (`0x698C…A92F`, the Gauges V3 deployment that owns every
  launch pool — verified with `pool.factory()`).
- **The iOS app stays read-only.** This flow is web-only by design.
- **Every guard fails closed.** A failed on-chain read, a stale Chainlink feed, a paused
  token, a missing viewer country, an unsigned or mismatched attestation, or a transfer
  simulation that reverts (B20 policies gate transfers, not `approve()`) all mean: no
  calldata. Eligibility is an EIP-712 statement signed by the wallet itself, bound to the
  terms version, the country the edge observed, and a 24-hour expiry.

## Verified on Base mainnet (2026-09-02)

| Token | DEX (100 USDC) | Chainlink | Deviation | Pool liquidity |
|---|---|---|---|---|
| AAPLc | $327.25 | $326.15 | +0.33 % | ~$1.1 M |
| NVDAc | $218.26 | $217.69 | +0.26 % | ~$1.7 M |
| METAc | $577.74 | $577.10 | +0.11 % | — |
| GOOGLc | $334.98 | $334.95 | +0.01 % | — |

Pool liquidity is quoted from DexScreener on 2026-09-02 for pairs `0xA3b1…94F0` (AAPLc/USDC)
and `0x853F…7ab9` (NVDAc/USDC); the code does not compute it.

Calldata smoke (`scripts/b20/smoke.mts`): buy 100 USDC → 0.45817 NVDAc, sell 0.5 AAPLc →
163.46 USDC, US country → calldata withheld, 900 USDC → withheld (cap), TSLAc → no Slipstream
pool at tick 10 (listable, not tradable through this rail yet).

## What we would build next

- Multi-venue routing (Uniswap v4 pools exist for the same pairs) and a 0x/1inch fallback.
- `B20Created` indexer feeding a review queue for the allowlist.
- Bobby's on-chain track record (`TrackRecord` on Base) recording the verdict *before* the
  human swaps, so every call is checkable after the fact.
- Personalized baskets: "give me the AI-capex names Bobby is long on" as one signed batch.

## Compliance posture

Coinbase issues the tokens under Regulation S for eligible non-US persons. This page quotes
for everyone and prepares calldata only after an eligibility attestation, with the US
excluded at the edge. Non-custodial, user-signed execution reduces custody and operational
risk; it does not by itself settle whether the product is "facilitation" in a given
jurisdiction, so the public launch waits for counsel. Analysis, not advice.
