# Audit R3 — Cross-cutting migration & deployment risk: X Layer (196) → Base (8453)

**Date:** 2026-08-10 · **Branch:** `feat/base-migration` · **Scope:** all of `contracts/src/` + `contracts/script/` + `contracts/broadcast/` + `contracts/foundry.toml`
**Lens:** only what breaks or becomes dangerous *because* of the chain move. Not a general re-audit of logic already covered in R1/R2.
**Method:** static read of all 8 contracts, `forge build --sizes` (clean), `forge test` (**117/117 pass, 0 failed**), plus read-only `cast` calls against live X Layer state.

---

## Live X Layer state used as evidence

| Contract | Address | Native balance | State |
|---|---|---|---|
| BobbyAdversarialBounties | `0xa8005ab465a0e02cb14824cd0e7630391fba673d` | **0.03 OKB** | `nextBountyId = 31` → 30 bounties, none RESOLVED/WITHDRAWN |
| BobbyAgentEconomyV2 | `0xd9540d770c8af67e9e6412c92d78e34bc11ed871` | **0.002 OKB** | owner `0x09a8…cdcea` |
| BobbyTrackRecord | `0xf841b428e6d743187d7be2242eccc1078fde2395` | 0 | 2038 commitments, **2037 pending**, 1 resolved trade, wins 1 / losses 0 |
| BobbyConvictionOracle | `0x03fa39b3a5b316b7cacdabd3442577ee32ab5f3a` | 0 | 11 symbols |
| HardnessRegistry (run-latest) | `0x95d045b1488f0776419a0e09de4fc0687abbafbf` | 0 | owner `0x3135…f3b2`, threshold 2, no bounties |
| HardnessRegistry (backend default) | `0xD89c1721CD760984a31dE0325fD96cD27bB31040` | 0 | owner `0x3135…f3b2`, **`hardnessScorer()` reverts → older ABI** |

---

## Findings

### CRITICAL

#### C-1 — User funds stranded on X Layer at cutover: 0.032 OKB, and 0.001 OKB of it belongs to a third party who alone can reclaim it
`BobbyAdversarialBounties.sol:288-302` (`withdrawBounty`), `:309-318` (`withdraw`), `:255-279` (`resolveBounty`).

30 bounties of 0.001 OKB each are live and unsettled. `bounties(1)` was posted by **`0x35e499A14c8c723C70DF6ccc129a544BE0cD92BC`** — not the treasury — status `OPEN`, `createdAt = 1776012663`, `claimWindowSecs = 604800`. Bounties 2-30 are the treasury's, mostly `CHALLENGED` with `gracePeriodSnapshot = 259200`.

Consequence: every claim window (+ grace) expired months ago. `resolveBounty` now reverts on `require(block.timestamp < _effectiveExpiry(b))` (`:269`), so the resolver can no longer settle *anything* — the only exit is `withdrawBounty`, which is gated `require(b.poster == msg.sender)` (`:290`). If X Layer is abandoned without action, the third party's 0.001 OKB is not recoverable by Bobby, by the owner, or by `pause`/admin — there is no rescue function and `receive()` reverts. The treasury's 0.029 OKB is likewise frozen until someone signs from `0x09a8…`.

Fix (pre-cutover, on X Layer): treasury calls `withdrawBounty(id)` for ids 2…30, then `withdraw()`. Separately contact `0x35e499A1…` and have them call `withdrawBounty(1)` + `withdraw()`. Do not shut down RPC/UI paths until both are confirmed. Same for `BobbyAgentEconomyV2.withdraw()` (`:163`, owner-only) to sweep 0.002 OKB.

#### C-2 — No contract in the set can handle an ERC-20; the plan mandates USDC (6 decimals)
Every value path is native `msg.value`: `BobbyAdversarialBounties.sol:161-163`, `HardnessRegistry.sol:284-285` (`registerAgent`), `:337-360` (`payForService`), `:501-507` (`postBounty`), `BobbyAgentEconomy.sol:93/132/150`, `BobbyAgentEconomyV2.sol:87/110`. Every payout is a native `call{value:}` (`BobbyAdversarialBounties.sol:314`, `HardnessRegistry.sol:611`, `BobbyAgentEconomy.sol:97/101/203`, `V2:113/116/166`). There is no `IERC20` import, no `transferFrom`, no `SafeERC20`-style return-value check, and no token address anywhere.

Consequence: deploying as-is on Base yields an **ETH**-denominated protocol, not the USDC one `docs/plan-migracion-base.md` (Fase 2) specifies. Worse, the tempting shortcut — keep the contracts, reinterpret the literals as USDC — is catastrophic: `0.001 ether` is `1e15`, and `1e15` USDC units = **1,000,000,000 USDC**. A 0.001-unit fee becomes a 1e12× overcharge; every `require(msg.value >= fee)` becomes unsatisfiable and every service call reverts. Conversely a fee written as `1000` (0.001 USDC) into a native-value check would be a ~1e15× *undercharge*.

Fix: this is a rewrite, not a parameter change. Decide per-contract: (a) stay native ETH and re-price the literals (see H-1), or (b) add a `usdc` immutable + `transferFrom`/`transfer` with return-value checks (`(bool ok, bytes memory d) = token.call(...); require(ok && (d.length == 0 || abi.decode(d,(bool))))`), drop `payable`, drop `receive()`, and convert `pendingWithdrawals` to token accounting. If (b): native USDC on Base (`0x833589fcd6edb6e08f4c7c32d4f71b54bda02913`) returns a bool and is not fee-on-transfer or rebasing, so the approve-race and FoT pitfalls are manageable — but `payForService`'s excess-refund logic (`HardnessRegistry.sol:356-360`) must be deleted, since with `transferFrom` you pull exactly the price.

#### C-3 — `BobbyIntentEscrow` is marked DO-NOT-DEPLOY and has no deploy script at all
`BobbyIntentEscrow.sol:7-9`: *"STATUS: DRAFT v1 … DO NOT DEPLOY to mainnet until 3-round audit complete"*. There is no `script/DeployIntentEscrow.s.sol`. Its constructor takes 7 arguments including `_chainIdExpected` (must be `8453`), `_maxSizeUsd`, and five role addresses with distinctness constraints (`:188-195`).

Consequence: the V3 core of the migration would be deployed by hand, on a chain where `executeIntent` hard-reverts (`BadChain`, `:303`) if `chainIdExpected` is wrong — a silent brick discovered only on the first keeper submission. Hand-deployment also risks `owner == keeper` or an EOA owner slipping through in a way no script/test gates.

Fix: write `script/DeployIntentEscrow.s.sol` with `_chainIdExpected = 8453` asserted against `block.chainid`, roles from env, and a post-deploy assertion block. Complete the R3 sign-off for this file before mainnet.

---

### HIGH

#### H-1 — OKB-denominated fee/stake literals silently become ETH amounts, a ~50-100× real-terms price increase, and two of them are `constant`
| Site | Literal | Meant as | On Base becomes |
|---|---|---|---|
| `BobbyAgentEconomy.sol:64` | `0.0001 ether` | 0.0001 OKB debate fee | 0.0001 ETH |
| `BobbyAgentEconomy.sol:65` | `0.001 ether` | 0.001 OKB MCP call | 0.001 ETH |
| `BobbyAgentEconomy.sol:66` | `0.0005 ether` | 0.0005 OKB signal read | 0.0005 ETH |
| `BobbyAgentEconomyV2.sol:42-43` | `0.001` / `0.0001 ether` | OKB | ETH |
| `BobbyAdversarialBounties.sol:58` | `0.0001 ether` **`constant`** | ABSOLUTE_MIN_BOUNTY floor | ETH floor, **immutable** |
| `BobbyAdversarialBounties.sol:61` | `0.001 ether` | minBounty | ETH |
| `HardnessRegistry.sol:151` | `0.0001 ether` **`constant`** | ABSOLUTE_MIN_BOUNTY | ETH, **immutable** |
| `HardnessRegistry.sol:152` | `0.01 ether` **`constant`** | REGISTRATION_STAKE | **0.01 ETH to register an agent** |
| `HardnessRegistry.sol:153` | `0.001 ether` | minBounty | ETH |

Consequence: OKB and ETH differ by roughly two orders of magnitude in USD. Agent registration goes from a token gesture to a tens-of-dollars gate — that alone kills the "public multi-agent" premise of HardnessRegistry. And because `REGISTRATION_STAKE` and both `ABSOLUTE_MIN_BOUNTY`s are `constant`, they cannot be repaired by an owner call: a wrong value ships forever until a redeploy.

Fix: re-derive every literal from a USD target before deploy (e.g. "$0.05 per MCP call", "$1 registration stake"), and convert `REGISTRATION_STAKE` / `ABSOLUTE_MIN_BOUNTY` from `constant` to owner-settable-with-floor so a price move doesn't require a redeploy.

#### H-2 — `challengeId` is not bound to a chain; the same challenge is independently payable on X Layer and Base
`BobbyAgentEconomyV2.sol:52` (`challengeConsumed`), `:87-92`. `challengeConsumed` is per-contract storage with no `block.chainid` or `address(this)` in the identifier, and there is no signature to bind it.

Consequence: after cutover both deployments exist. A backend that issues challenge IDs from one nonce space and verifies "was this challenge paid?" by reading one chain — or worse, by trusting a client-supplied tx hash — can be satisfied by a payment made on the *other* chain, on whichever is cheaper, or by a challenge already consumed on X Layer being replayed against the Base contract (fresh storage → it succeeds again). The V2 contract's whole reason for existing (replay resistance, header `:4-6`) does not survive having two live instances.

Fix: derive `challengeId = keccak256(abi.encode(secret, block.chainid_expected, contractAddress))` off-chain, and in the payment-verification path assert the receipt's `chainId == 8453` **and** the emitting contract address matches the Base deployment. Better: add `chainIdExpected`/`address(this)` into the on-chain consumption check, mirroring `BobbyIntentEscrow`'s pattern.

#### H-3 — Deploy scripts are missing for 3 of the 8 contracts; a fresh-chain redeploy is not reproducible
`contracts/script/` contains only `DeployAdversarialBounties`, `DeployAgentEconomy`, `DeployAgentEconomyV2`, `DeployAgentRegistry`, `DeployHardnessRegistry`. But `contracts/broadcast/DeployAll.s.sol/196/run-latest.json` shows `BobbyTrackRecord` and `BobbyConvictionOracle` were deployed by a `DeployAll.s.sol` that **no longer exists in the repo**. `BobbyIntentEscrow` never had one (C-3).

Consequence: the two contracts that carry the protocol's public claim (track record, conviction feed) cannot be redeployed on Base from source control. Whoever does it will hand-run `forge create`, and the constructor argument `_bobby` (`BobbyTrackRecord.sol:148`, `BobbyConvictionOracle.sol:98`) plus the follow-up `setBobby`/ownership handoff are exactly the kind of wiring that gets forgotten — a wrong `_bobby` means the backend cannot commit trades and the contract must be redeployed again.

Fix: restore/author `script/DeployBase.s.sol` deploying all 8 in order, with `require(block.chainid == 8453)` at the top and post-deploy assertions (`registry.owner()`, `trackRecord.bobby()`, `escrow.chainIdExpected()`), writing addresses to a JSON the backend reads.

#### H-4 — The backend's default HardnessRegistry address points at a stale contract owned by a non-treasury key
`api/_lib/chains.ts:63` → `process.env.HARDNESS_REGISTRY_ADDRESS || '0xD89c1721CD760984a31dE0325fD96cD27bB31040'`. On-chain, `0xD89c…` has code but **`hardnessScorer()` reverts** — it is an earlier ABI — and its `owner()` is `0x313530bceAD24D536E20494919AeFdd13cb2F3b2`, not the treasury. Meanwhile `broadcast/DeployHardnessRegistry.s.sol/196/run-latest.json` records `0x95d045b1…`, *also* owned by `0x3135…`. Two live registries, neither owned by `0x09a8…`, and the fallback constant disagrees with `run-latest`.

Consequence: if this pattern is carried to Base, the backend will call a registry the team cannot pause, cannot set a `hardnessScorer` on, and cannot slash from — and calls to `certifyHardness`/`slashAgent` will revert or silently target the wrong instance. On X Layer today this is already a latent bug (an ABI mismatch, not just a stale address).

Fix: single source of truth. Delete hardcoded fallbacks; require `HARDNESS_REGISTRY_ADDRESS` (fail-fast if unset); after the Base deploy assert `owner()` equals the intended admin before wiring anything.

#### H-5 — Admin of every value-holding contract is a hot EOA, and `HardnessRegistry` gives that key total-loss powers
On-chain: `BobbyAdversarialBounties.owner()` and `BobbyAgentEconomyV2.owner()` are both `0x09a81ff70DdBC5E8b88F168B3eEF01384B6cDceA`, the same treasury EOA the backend signs with. `BobbyIntentEscrow.sol:52` explicitly states *"owner MUST be a multisig (e.g., Safe). Hot EOA owner is unsafe."* `HardnessRegistry.slashAgent` (`:695-704`) lets owner (or `hardnessScorer`) zero any agent's stake straight into `pendingWithdrawals[owner]`, with **no bound, no timelock, no event-gated dispute**, and `updateResolver` (`:665`) lets owner install itself as a resolver and self-approve bounty resolutions.

Consequence: on X Layer the exposure was cents. On Base holding real USDC/ETH, one compromised backend key drains every stake and every open bounty in a single transaction.

Fix: deploy a Safe on Base first; pass it as `owner` in every constructor / transfer ownership immediately post-deploy (all contracts have 2-step `transferOwnership`/`acceptOwnership`). Keep the backend key only as `bobby`/`keeper`/`resolver`, never `owner`.

#### H-6 — `foundry.toml` cannot verify on Base; verification config and RPC are X-Layer-only
```toml
[rpc_endpoints]
xlayer = "https://rpc.xlayer.tech"
xlayer_testnet = "https://testrpc.xlayer.tech"
```
No `base`/`base_sepolia` entry, and **no `[etherscan]` section at all**. Every deploy script's NatSpec hardcodes `--rpc-url https://rpc.xlayer.tech --verify` (`DeployAdversarialBounties.s.sol:11`, `DeployAgentEconomy.s.sol:8`, `DeployAgentEconomyV2.s.sol:8`, `DeployAgentRegistry.s.sol:8`, `DeployHardnessRegistry.s.sol:12`).

Consequence: `--verify` fails (or silently no-ops) and the Base contracts ship unverified — for a protocol whose entire pitch is "verifiable", unverified bytecode on Basescan is a product failure, not just a chore. Copy-pasting the documented command line also risks deploying to X Layer *again* by accident.

Fix: add `base = "https://mainnet.base.org"` / `base_sepolia`, an `[etherscan] base = { key = "${BASESCAN_API_KEY}", chain = 8453 }` block, and rewrite every script's NatSpec run-line.

---

### MEDIUM

#### M-1 — `tokenURI` bakes "on X Layer" into permanent on-chain NFT metadata
`BobbyAgentRegistry.sol:149`: `'","description":"Bobby Agent Trader - AI Agent Identity on X Layer",'`. It's a `pure`-ish string in a `view` function with no setter. Every agent NFT minted on Base will advertise the wrong chain forever, in the one artifact designed to be read by third-party protocols.
**Fix:** parameterise the description, or at minimum edit the literal before deploy.

#### M-2 — Chain claims in NatSpec across the whole set
`BobbyAgentEconomy.sol:7`, `V2:7`, `BobbyAgentRegistry.sol:10`, `BobbyTrackRecord.sol:6`, `BobbyConvictionOracle.sol:6`, `BobbyAdversarialBounties.sol:5,8,153,308,407`. Comments only — but they are what a reviewer of the verified source on Basescan reads first, and `:5`/`:153`/`:308` describe the funds as "OKB".
**Fix:** sweep with `grep -rn "X Layer\|OKB\|196" contracts/src` as a PR gate.

#### M-3 — `sizeUsd` unit is undefined at the boundary; the `1e18` ceiling stops protecting if the backend moves to 6-decimal USDC
`BobbyIntentEscrow.sol:79` `MAX_SIZE_USD_CEILING = 100_000_000e18`, `:305` `if (intent.sizeUsd == 0 || intent.sizeUsd > maxSizeUsd) revert BadSize()`. The `INTENT_TYPEHASH` (`:69`) says only `uint256 sizeUsd` — no scale documented.
Consequence: if the Base backend starts expressing sizes in USDC's native 1e6 (the natural thing once USDC is the unit of account), a $100M intent is `1e14`, sails under a `1e18`-scaled `maxSizeUsd`, and the size cap is effectively **1e12× looser than intended**. If instead the scale stays 1e18 while amounts elsewhere are 1e6, a conversion slip either bricks execution (`BadSize`) or under-sizes trades by 1e12.
**Fix:** pin the unit in the typehash comment and in the off-chain signer, and set `maxSizeUsd` in the *same* unit at construction. Add a test asserting a known USD figure maps to the expected integer.

#### M-4 — `src = "."` plus duplicate contract files at `contracts/` root
`foundry.toml` sets `src = "."`, and `contracts/BobbyConvictionOracle.sol` / `contracts/BobbyTrackRecord.sol` are byte-identical duplicates of the `src/` copies (verified with `diff`). `forge build --sizes` accordingly lists each twice, and `verify/BobbyAdversarialBounties.flat.sol` produces a third `BobbyAdversarialBounties` artifact.
Consequence: `forge create`/`--verify` by contract *name* is ambiguous; you can verify or deploy the artifact from the wrong path, and a future edit to `src/` that misses the root copy produces a silent source/bytecode divergence.
**Fix:** delete the root duplicates and the stale flat file, set `src = "src"`.

#### M-5 — `optimizer_runs = 1` is load-bearing for exactly one contract and taxes all the others forever
`foundry.toml: optimizer_runs = 1`. Measured: `HardnessRegistry` is **22,679 bytes** against the 24,576 EIP-170 limit — 1,897 bytes of margin (and `HardnessRegistry.sol:638` records that `getConsensus` was already deleted to fit). Every other contract is small: `BobbyAdversarialBounties` 8,811, `BobbyIntentEscrow` 6,862, `BobbyTrackRecord` 11,342, `BobbyAgentEconomyV2` 3,827.
Consequence: `runs = 1` tells the optimizer to minimise deployment size at the cost of runtime gas. Base charges L2 execution gas on every user call; with 4844 blobs, calldata/deploy cost is the cheap part now. The setting optimises the one-time cost and pessimises the recurring one, for seven contracts that never needed it.
**Fix:** default `optimizer_runs = 200`; keep the low setting scoped to HardnessRegistry only (per-contract `[profile.default.optimizer_details]` / a separate profile), and re-check `--sizes` after the change.

#### M-6 — No post-deploy wiring step exists, so several contracts land half-configured
`DeployHardnessRegistry.s.sol` never calls `setHardnessScorer` (`HardnessRegistry.sol:682`), so `certifyHardness` (`:686`) and `slashAgent` (`:695`) are owner-only until someone remembers. Nothing transfers ownership to a Safe. `DeployAgentEconomy(V2).s.sol:14-16` derive `alphaHunter`/`redTeam` as `keccak256(bobby, "ALPHA_HUNTER")` — **addresses with no known private key**; `payDebateFee` sends real value to them (`V2:113-116`), which on Base means ETH burned to unspendable addresses on every debate.
**Fix:** a single `DeployBase.s.sol` that deploys, wires (`setBobby`, `setHardnessScorer`, resolver set), and asserts; and real funded keys — or a burn-acknowledged design decision — for the agent addresses before any value flows.

#### M-7 — `priceWei` / `Wei` naming and `uint96`/`uint128` widths presume an 18-decimal native asset
`HardnessRegistry.sol:48-49` (`uint128 priceWei`, `uint128 totalRevenue`), `:306` `priceWei > type(uint128).max`; `BobbyAdversarialBounties.sol:35` `uint96 reward` with the comment *"enough for 79B OKB"*.
Consequence: no overflow risk under USDC (6 dec makes the headroom *larger*), but the naming will actively mislead the Fase-2 refactor into writing 18-decimal amounts into a 6-decimal field. Rename to `priceUnits`/`price6` and restate the comments in the target asset.

---

### LOW / verified-safe

- **L-1 — Cross-chain identity of off-chain hashes.** `BobbyTrackRecord.commitIndex[debateHash]` (`:84`) and `BobbyAdversarialBounties` `threadHash` (`:170`) key on hashes of off-chain IDs. The same forum thread will exist on both chains with different records. Not exploitable, but every proof/evidence link must carry the chain id or the "verifiable track record" claim becomes ambiguous. Update the proof pages when marking X Layer as legacy.
- **L-2 — No block-count clocks. Verified safe for Base's ~2s blocks.** Every deadline in the set uses `block.timestamp` (`BobbyTrackRecord.sol:178/224/226`, `BobbyConvictionOracle.sol:135/140`, `BobbyAdversarialBounties.sol:229/269/295`, `HardnessRegistry.sol:409/410/447/541/564`, `BobbyIntentEscrow.sol:310/311/361`). Grep for `block.number` returns nothing in `src/`. Windows (1h–90d) are unaffected by block time.
- **L-3 — EIP-712 cross-chain replay is genuinely prevented in `BobbyIntentEscrow`. Verified good.** `DOMAIN_SEPARATOR` binds `block.chainid` and `address(this)` at construction (`:208-214`), and `executeIntent` additionally hard-checks `block.chainid != chainIdExpected` (`:303`). Tests `test_domainReplayDifferentChainFailsAtBadChain` and `test_domainReplayDifferentContractFails` pass. An X Layer intent signature is inert on Base. This is the pattern the rest of the set (H-2) should copy.
- **L-4 — `BobbyAdversarialBounties.receive()` reverts** (`:408-410`). Good hygiene, but it also means the Base deployment can never be topped up or rescued out-of-band; combined with C-1 there is no admin sweep path. Consider an owner `rescue()` limited to funds not attributable to an unsettled bounty.
- **L-5 — TrackRecord state loss is larger than the plan implies.** 2038 commitments vs **1** resolved trade — the on-chain "win rate" is 100% off a single sample, and 2037 commitments are past `MAX_COMMITMENT_TTL` (30 days, `:74`). They can be cleaned permissionlessly via `expireCommitment` (`:280`) but at 2037 × gas. Whatever is shown on the legacy proof pages should state the real resolved count, not the commitment count.

---

## Severity count

| Severity | Count |
|---|---|
| Critical | 3 |
| High | 6 |
| Medium | 7 |
| Low / verified | 5 |
| **Total findings** | **21** |

---

## Pre-deploy checklist for Base (ordered)

**Phase A — decide, before writing any code**
1. Settle C-2: is the Base protocol denominated in **ETH** or **USDC**? Every item below forks on this answer. Write the decision into `docs/plan-migracion-base.md`.
2. Produce a USD price table (MCP call, signal read, debate fee, min bounty, registration stake) and derive the integer literal for the chosen asset and decimals. (H-1)
3. Deploy a Safe on Base and record its address as the intended `owner` of all 8 contracts. (H-5)

**Phase B — contract changes**
4. If USDC: add the token path to `BobbyAdversarialBounties`, `HardnessRegistry`, `BobbyAgentEconomyV2` — `transferFrom` in, checked-return `transfer` out, remove `payable`/`receive()`/refund logic. (C-2)
5. Replace all fee/stake literals per the price table; convert `REGISTRATION_STAKE` and both `ABSOLUTE_MIN_BOUNTY`s from `constant` to owner-settable-with-floor. (H-1)
6. Bind `chainId` into the `challengeId` scheme in `BobbyAgentEconomyV2` and in the backend's payment verification. (H-2)
7. Fix `BobbyAgentRegistry.tokenURI` text (M-1); sweep NatSpec for "X Layer"/"OKB"/196 (M-2); rename `priceWei`/`reward` comments (M-7).
8. Document and pin the `sizeUsd` unit in `BobbyIntentEscrow`; choose `maxSizeUsd` in that unit; add a unit-scale test. (M-3)
9. Complete R3 sign-off on `BobbyIntentEscrow` and remove the DO-NOT-DEPLOY banner, or explicitly defer it out of the cutover. (C-3)
10. Real, key-controlled addresses (or an explicit burn decision) for `alphaHunter`/`redTeam`. (M-6)

**Phase C — tooling**
11. `foundry.toml`: `src = "src"`, delete root duplicate `.sol` files and `verify/*.flat.sol`, add `base`/`base_sepolia` RPCs, add `[etherscan]` with `BASESCAN_API_KEY`, raise `optimizer_runs` to 200 with a size-scoped exception for HardnessRegistry. (H-6, M-4, M-5)
12. Author `script/DeployBase.s.sol` covering **all 8** contracts, starting with `require(block.chainid == 8453)`, ending with post-deploy assertions and a JSON address dump. Restore TrackRecord/ConvictionOracle deployment from source control. (H-3, C-3)
13. Rewrite the run-line NatSpec in every script (no `rpc.xlayer.tech`, no hardcoded treasury address). (H-6)
14. Delete the hardcoded contract-address fallbacks in `api/_lib/chains.ts`; fail fast on missing env. (H-4)

**Phase D — verify before mainnet**
15. `forge build --sizes` — every contract under 24,576 with margin recorded.
16. `forge test` green (baseline today: 117/117).
17. Full deploy + wire + smoke on **Base Sepolia** with the Safe as owner; confirm `owner()`, `bobby()`, `chainIdExpected()`, `resolverThreshold()`, `hardnessScorer()` on every deployed instance.
18. Confirm Basescan verification succeeded for all 8 before any real funds move.
19. Replay test: take a signed X Layer intent payload and assert it reverts on Base; take a consumed X Layer `challengeId` and assert the backend rejects it against Base. (L-3, H-2)

---

## Funds and state stranded on X Layer

**Do this BEFORE any Base cutover announcement, while the X Layer RPC and signing keys are still in routine use.**

### Must-drain (real value)
| What | Where | Amount | Exact path | Who can do it |
|---|---|---|---|---|
| 29 unsettled bounties | `0xa8005ab4…673d` | 0.029 OKB | `withdrawBounty(id)` for `id ∈ 2..30`, then `withdraw()` | treasury `0x09a8…` only |
| 1 third-party bounty | `0xa8005ab4…673d` bounty **#1** | 0.001 OKB | `withdrawBounty(1)` then `withdraw()` | **only `0x35e499A14c8c723C70DF6ccc129a544BE0cD92BC`** — contact them; no one else can recover it |
| Accrued MCP fees | `0xd9540d77…d871` | 0.002 OKB | `withdraw()` | owner `0x09a8…` |

All claim windows and grace periods are long expired, so `withdrawBounty` succeeds today and `resolveBounty` no longer can — meaning any challenger who did legitimate work on bounties 2-30 **cannot be paid**. If any of those challenges were genuine, settle the obligation off-chain or on Base; do not silently reclaim.
Verify afterwards: `cast balance` on both contracts returns `0`.

### Must-snapshot (evidence, no value)
- `BobbyTrackRecord` `0xf841b428…2395`: 2038 commitments, 2037 pending, 1 resolved trade, `wins=1`, `losses=0`, `totalPnlBps`. Export the full `TradeCommitted` / `TradeResolved` / `CommitmentExpired` log set to `proof/` before cutover — after cutover this is the *only* record; nothing migrates.
- `BobbyConvictionOracle` `0x03fa39b3…5f3a`: 11 symbols, latest signal per symbol. Export `SignalPublished` logs.
- `BobbyAdversarialBounties`: all `BountyPosted` / `ChallengeSubmitted` logs, including evidence hashes (the IPFS/Arweave content behind them must be pinned independently — the chain only stores hashes).
- `BobbyAgentEconomyV2`: `MCPPayment` / `DebateFee` logs, and the consumed `challengeId` set (needed to enforce H-2's cross-chain rejection).
- `HardnessRegistry`: **two** instances (`0xD89c…` and `0x95d0…`), both owned by `0x3135…`, neither by the treasury — resolve which is canonical and snapshot it; note that neither holds funds and neither has registered bounties, so nothing is at risk here beyond the config confusion in H-4.
- `BobbyAgentRegistry` `0x823a1670…ba8b`: the 3 agent NFTs and their stats — these are non-transferable-in-practice identity tokens; they simply cease to exist on Base.

### Explicitly lost (accept and document)
Agent reputations and win rates, all `pendingCount` commitments, `challengeConsumed` replay history, symbol signal history, agent stakes in HardnessRegistry (currently none), and NFT token IDs. Supabase rows with `chain = 196` stay as the archive per Fase −1.

---

## Verdict

**This contract set is NOT safe to redeploy on Base as-is.** Three blockers, in order:

1. **The money doesn't work.** No contract can touch an ERC-20, so a "USDC on Base" protocol does not exist in this code (C-2) — and the fee literals, reinterpreted as ETH, silently reprice the protocol by roughly two orders of magnitude with two of the key values frozen in `constant`s (H-1). Either decision — ETH or USDC — requires code changes, not config.
2. **The deployment isn't reproducible.** Three of eight contracts have no deploy script, including the V3 core that is still stamped DO-NOT-DEPLOY, and verification on Basescan is unconfigured (C-3, H-3, H-6). A hand-run cutover on a chain with real value is how mis-wired owners and unverified bytecode happen.
3. **Real user funds will be abandoned.** 0.032 OKB sits in expired, unsettleable bounties on X Layer, 0.001 of it belonging to a third party whose only recovery path runs through their own key (C-1). Walking away without draining is a permanent loss, small in dollars and large in credibility for a protocol selling verifiability.

What is genuinely solid and should be preserved as the template: `BobbyIntentEscrow`'s chain binding (immutable `chainIdExpected` + `block.chainid` in the domain separator), the absence of any block-number arithmetic across the whole set, and a clean 117/117 test run. Fix the three blockers, complete the Phase A-D checklist, prove it on Base Sepolia, and hand `owner` to a Safe before the first real dollar moves.
