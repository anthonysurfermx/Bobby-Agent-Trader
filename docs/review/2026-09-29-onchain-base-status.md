# Bobby Protocol — on-chain status on Base mainnet (8453)

Audit date: 2026-09-29, ~12:40 UTC. Repo: main @ 458872a (committed tree only; the worktree's uncommitted edits were not audited). Read-only: public Base RPC (`https://mainnet.base.org`, block ~51,948,165), Base Blockscout API, and the public prod endpoints on bobbyprotocol.xyz. No transactions were sent and no secrets were read.

## TL;DR

- All 7 contracts are deployed, have code, are source-verified, and are owned by the 2-of-3 Safe `0x8BE6…53b4` (no pending owner). The Safe has 3 owners and a threshold of 2. **This part holds up.**
- **The protocol has not written to Base since 2026-08-22 12:31 UTC.** Its whole on-chain history is 1 announce, 1 commit and 1 resolve on TrackRecordV2 (plus 1 orphan announce). Economy, Bounties, Oracle, Hardness, Registry and Escrow have zero protocol activity since deploy. Daily debates (863 "commitments") live only in Supabase, and the cycle commits on-chain only in `live` mode.
- **P0:** the "Live on-chain activity" feed on `/protocol/heartbeat` lists 7 **X Layer** tx hashes from 2026-04-14 and links them to basescan.org. Every link 404s ("tx not found" on Base). One click falsifies it.
- The resolver cron ran and cleared the backlog: `pending: 0`, `decisionsResolved 863 = commitmentsCreated 863`. That is off-chain. It sent no on-chain resolves (recorder nonce is still 4).
- The recorder wallet `0xDf47…F4EC` holds 0.001245 ETH. At 0.006 gwei that covers about 1,000 commit/resolve txs, so gas is not a blocker. The keeper and resolver quorum wallets have 0 ETH and have never transacted.
- Naming: no user-visible OKX/OKB/X Layer/196 in routed pages, `llms.txt`, `skill.md`, the agent card or the protocol APIs. The OKX mentions left in `src/` are in unrouted pages only.

## 1. Contracts (from `contracts/deployments/8453.json`, which matches `api/_lib/chains.ts:67-73` and `src/config/chains.ts:66`)

| Contract | Address | Code | Verified (Blockscout) | owner() | Last protocol activity |
|---|---|---|---|---|---|
| TrackRecordV2 | `0x822DB0DbbCAB398e610fcBA86DA9BB92d2493321` | 24,094 B | yes | Safe | **2026-08-22 12:31:01 UTC** `resolveTrade` 0xfb77d944… (blk 50,306,257); commit 0xf36ae578… 11:08:09 |
| AgentEconomyV2 | `0x009de59e0e7f4109fF9E89E744A4412082AD2aaF` | 3,334 B | yes | Safe | only deploy + transferOwnership (2026-08-21). totalDebates/MCP calls/payments = 0 |
| AdversarialBounties | `0x73fD6c77ff0403Ea071e8721c76f88cE34ac9968` | 7,206 B | yes | Safe | only deploy + transferOwnership (2026-08-21). nextBountyId = 1, 0 posted |
| ConvictionOracle | `0x27f51D711171c830dd796D4B03914a8C6c46D75e` | 5,851 B | yes | Safe | only deploy + transferOwnership. symbolCount = 0 |
| HardnessRegistry | `0x15800F40b8988765AD3F46030B73bC8109A793f5` | 16,861 B | yes | Safe | deploy + setHardnessScorer + transferOwnership (2026-08-21). agentRegistered = false |
| AgentRegistry (ERC-721) | `0xB3137D7afE26fbdBcAA95573C7A20be896efde93` | 4,881 B | yes | Safe | only deploy + transferOwnership. agents = 0 |
| IntentEscrow | `0x5D9d534419421B7Edfe9Bb509E4c48512256BC97` | 5,681 B | yes | Safe | only deploy + transferOwnership |
| Safe (owner/treasury) | `0x8BE60853F27b944e11486285d95c3e06596553b4` | proxy | — | threshold 2 of [0x566C…27D7, 0x1ed2…1843, 0x7b0c…b514] | nonce 3; last exec 2026-09-08 20:53 UTC. Balance 0 ETH |

Evidence: `cast code` / `cast call owner()(address)` / `pendingOwner()` (all 0x0), `getThreshold()` = 2, `getOwners()`; Blockscout `/api/v2/addresses/<a>/transactions` and `/api/v2/smart-contracts/<a>` (`is_fully_verified: true` for all 7). The Basescan page for TrackRecord also shows the name `BobbyTrackRecordV2`.

### Wallets

| Role | Address | ETH | Nonce | Note |
|---|---|---|---|---|
| Recorder / bobby / hardnessScorer | 0xDf475D7D3e97c8988Fdff5AF7887403e4295F4EC | 0.001245 | 4 | the only writer that has ever acted; ~1k txs of runway at the current gas price |
| Deployer | 0xC3F836EC06A2202af23e59997A613CA0722F35d1 | 0.000814 | 75 | no longer owner of anything |
| Keeper | 0x01b2a464b6Dc0Dc57Fd912d877a7C05502cf3D2e | 0 | 0 | never used |
| Resolver (quorum) | 0xba1475d05a48C2eE602dd4cDcDA84e724f9b9854 | 0 | 0 | never used |
| Arbiter (quorum) | 0xf6C939182f0AA4e67D9cc953d12e58b71FAA6F26 | 0 | 0 | never used |
| Safe owners alpha/red/cio | 0x566C… / 0x1ed2… / 0x7b0c… | 0.0018 / 0.0012 / 0.0013 | 1 each | signed the Safe txs |

## 2. Write paths

| Path | Trigger | Status | Last on-chain tx | Evidence |
|---|---|---|---|---|
| Proof-of-debate commit (announce → Pyth anchor → `commitTrade`) | `api/bobby-cycle.ts:1177` → `/api/protocol-record` → `api/_lib/trackrecord-v2-recorder.ts:139` | **Dormant by design.** `api/_lib/commit-policy.ts:44` commits only when `mode=live` and the CIO executes with conviction ≥ 0.35. Today's cycle: `direction null, conviction 0`. | 2026-08-22 11:08:09 UTC (0xf36ae578…) | TrackRecord `totalCommitments = 1`; Blockscout |
| Resolve (`resolveTrade`) | `api/forum-resolve.ts:105-121` (cron 12:30 UTC) | The off-chain resolver ran: `pending 0`, `863/863 resolved`, and the ~70 backlog is gone. **No on-chain resolves were sent**: recorder nonce is still 4, so none reverted and no gas was burned. | 2026-08-22 12:31:01 UTC (0xfb77d944…) | `/api/bobby-protocol-stats` `debateActivity`; `cast nonce` |
| Heartbeat | `/api/protocol-heartbeat` | `ok`, chain healthy, **`health.contracts: "dormant"`**, treasury 0.0 ETH; `recentTxs` are X Layer (see P0-1) | n/a (read-only) | payload 12:39:42Z |
| Checkpoint | `/api/checkpoint` | ok; `on_chain.total_commitments 1, total_debates 0, treasury 0.0` | n/a | payload 12:41:46Z |
| Tx archive | `/api/protocol-tx-history` | **Prod scans from `startBlock 51,053,893` (2026-09-08 19:52 UTC), not the deploy block 50,275,770.** The only real protocol txs (blocks 50,302,801–50,306,257) are outside the window, so the archive always ends with 0 items. | — | payload: `startBlock 51053893, count 0` |
| MCP / economy settlement | AgentEconomyV2 | never paid | none | `totalPayments 0` |
| Bounties / Oracle / Hardness / Registry / Escrow | — | no writer wired (HardnessRegistry sync removed on purpose, `bobby-cycle.ts:1148-1152`) | none | stats payload |
| Verified calls table | `/api/verified-calls` | serves the **Base Sepolia canary** (84532, `0x4bfE…7cadC`, 5 calls), labelled "Canary" in the UI | Sepolia | payload 12:44:58Z |

## 3. Problems, by priority

### P0 — an evaluator sees it broken or false

1. **Heartbeat "Live on-chain activity" shows X Layer hashes as Base txs.** `api/protocol-heartbeat.ts:225-268` reads `agent_events?event_type=eq.onchain_tx` with no chain filter or date floor, so it returns the 2026-04-14 X Layer rows. The feed sets `blockNumber: 0` and `contract: ''`. The page renders them as `${explorerUrl}/tx/${tx.hash}` (`src/pages/BobbyHeartbeatPage.tsx:366`) → basescan.org says "not found". Verified: `cast tx 0x700f2ea1… --rpc-url mainnet.base.org` gives "tx not found", while the same hash on the X Layer RPC is block 57,392,237.
   **Smallest fix:** in `fetchRecentTxs`, add `&created_at=gte.2026-08-21T00:00:00Z` (or a `meta->>chain_id=eq.8453` filter). Better: build `recentTxs` from the TrackRecord/Blockscout logs, which yields the 4 real 08-22 txs. An empty feed is better than a false one.
2. **Nothing has happened on-chain for 38 days, while the copy implies a running on-chain pipeline.** `BobbyProtocolLanding.tsx:593` shows `chain base · 8453 · 1 on-chain` next to "daily cycle", and `:705` says "calls the cycle commits live are also anchored on-chain". Both are technically true, but the cycle is not in live mode and 0 of the 863 public calls since 08-22 went on-chain. An evaluator who opens TrackRecord on Basescan sees 1 commit from August and nothing else.
   **Smallest fix (copy):** state it in one line on `/protocol`: "On-chain anchoring runs in live mode only; mainnet has 1 committed call (22 Aug 2026). The daily public calls are graded off-chain." Link the 08-22 commit and resolve txs. **Alternative (product):** commit the daily public call on-chain in paper mode too. The recorder has ~1k txs of gas. This is an owner decision.

### P1 — weak and questionable

3. **The archive can never show the real txs.** Prod `BASE_PROTOCOL_DEPLOYMENT_BLOCK` resolves to 51,053,893 (payload `startBlock`), which is after the only protocol txs; the code default is 50,275,770 (`api/_lib/chains.ts:117`). Paging 4,000 blocks per request also means ~224 clicks to reach "Archive complete", ending with 0 items. **Fix:** set the env to `50275770` or remove it, and seed the first page with the known TrackRecord txs.
4. **Metric labelled "Commitments 863 created"** (`BobbyProtocolLanding.tsx:765`) sits next to "Contracts live". Anyone comparing it with TrackRecord `totalCommitments = 1` sees an 863-vs-1 mismatch. The provenance note (`:287`) explains it, but at the bottom. **Fix:** rename the metric "Public calls (off-chain)" and add an "On-chain commits: 1" tile.
5. **"Verified calls" nav leads to testnet data.** `/protocol/calls` → `/api/verified-calls` is the frozen Sepolia canary. It is labelled, but a Somnia evaluator will read it as "their verified record is testnet". **Fix:** add the mainnet row (commit 0xf36ae578…, resolve 0xfb77d944…) above the canary table, or rename the nav item "Canary ledger (Sepolia)".
6. **`/api/checkpoint` says `decision: "EXECUTE"` with `direction: null, conviction: 0` and `executed: 1`** for a cycle that did nothing. This reads as a broken risk gate. **Fix:** derive `decision` from the cycle's actual verdict/commitState (`not_required` → "STAND_ASIDE").
7. **Reputation trust score** (`/api/reputation`): `track_record raw 100` comes from n=1 (1 win on-chain), and `performance.winRate 100` appears in the heartbeat. Both are statistically meaningless and look inflated. **Fix:** gate below n≥10, as the landing already does with `WIN_RATE_MIN_SAMPLE`.
8. **Quorum/keeper wallets are unfunded and unused** (resolver 0xba14…, arbiter 0xf6C9…, keeper 0x01b2…: 0 ETH, nonce 0). If docs present "2-of-3 resolver quorum" or "keeper" as live mechanisms, they are not exercised on mainnet. Either say "configured, not yet exercised" or remove the claim.

### P2 — polish

9. `/api/bobby-protocol-stats` `debateActivity.lastOnchainActivity = 2026-04-14T10:08:04Z` comes from the same unfiltered `agent_events` query (`api/bobby-protocol-stats.ts:429-436`) and is X Layer-era. Not rendered today, but it is in the public JSON. Use the same filter as fix 1; the real value is 2026-08-22T12:31:01Z.
10. Heartbeat `recentCommerce` rows are `status: "paid"` with `payer: null, amountNative: null, txHash: null` (sandbox pressure tests). Rename the status to `sandbox` or drop "paid".
11. `api/forum-resolve.ts:105` POSTs an on-chain resolve for every public thread since 2026-08-18, but almost none were committed on-chain. The recorder rejects them before sending (nonce is unchanged, so no gas burned), but it is ~70 failing calls per day in logs. Filter on `thread.onchain_commit_tx IS NOT NULL` (or equivalent).
12. The desk/cycle LLM text sometimes cites "datos de OKX" as the candle source (seen in debate outputs). Nothing in the protocol endpoints today, but check `api/desk-debate.ts` prompts for the vendor name if Base-only naming must extend to generated copy.
13. The Safe (the "treasury" shown on the heartbeat and landing) holds 0 ETH. That is fine, but "Treasury 0.0 ETH" is a weak tile. Label it "Owner Safe", or hide the balance.

## 4. Naming (Base-only)

`git grep -iE "OKX|OKB|X ?Layer|xlayer|196"` over HEAD `src/pages`, `src/components` and `public` hits only unrouted files: BobbySubmissionPage, BobbyMarketplacePage, BobbyChallengePage, BobbyArchitecturePage, BobbyNetworkConsolePage, PolymarketTrackerPage, ExecutionTimeline, WalletConnect, AgentRadarLanding, YieldBanner, AIAgentSkillsTable, SkillsComparisonSection. All of their routes redirect (`/submission` → `/protocol`, `/challenge` → `/protocol/calls`, `/marketplace` → `/protocol/docs`). The live `llms.txt`, `skill.md`, `.well-known/agent-card.json`, `/api/mcp-http`, `/api/reputation`, `/api/protocol-heartbeat`, `/api/bobby-protocol-stats` and `/api/checkpoint` all have 0 hits. Every address they publish matches `8453.json`. The only naming leak is P0-1: the heartbeat feed contains X Layer hashes, though not the words.

## Commands used (abridged)

```
cast code|call owner()|pendingOwner()|nonce|balance  --rpc-url https://mainnet.base.org
cast call <safe> getThreshold()/getOwners()/nonce()
cast tx <hash> blockNumber  (Base vs https://rpc.xlayer.tech)
curl https://base.blockscout.com/api/v2/addresses/<a>/transactions
curl https://base.blockscout.com/api/v2/smart-contracts/<a>
curl https://bobbyprotocol.xyz/api/{protocol-heartbeat,bobby-protocol-stats,protocol-tx-history,checkpoint,verified-calls,reputation,mcp-http}
git grep over HEAD (src/pages, src/components, public, api)
```
