# Brief for the independent third round — Codex + Kimi K3 (CLI)

Target: `security/remediation-r2` @ `58cd10e` (code) — all fourteen findings of
`docs/security/2026-09-04-protocol-stock-swaps-audit.md` carry closure evidence in
`docs/security/2026-09-03-remediation-r2.md` (rounds 12, 12b, 12c). iOS: `ios/apple-login` @ `91ab7c2`.
This round decides GO/NO-GO for (a) the third clean deployment review and (b) enabling
Base stock swaps via Bobby Protocol. Nothing below deploys, migrates, flips a flag, signs or uploads.

## Ground rules

1. Pin first: `HardnessRegistry` runtime keccak must be
   `0x3449ac0707c855588a1a0df8d45bddbd04aabfb1e35cb66f7a704006b043e0d5` (23,471 B). Any other
   hash is a reset of the deployment review count. Production contract source under
   `contracts/src/` is unchanged since round 8; rounds 12/12b/12c touched only `script/` and `test/`.
2. Re-derive, do not trust the tables: for every BP-xx, read the fix, write your own exploit
   attempt against the pre-fix behaviour described in the finding, and confirm the listed test
   would have caught it. A closure whose test passes for the wrong reason is a NO-GO item.
3. Report in the report's format (finding → fix → evidence → verdict), NO-GO by default, with
   the exact command that demonstrates any reopened item.

## Commands to execute (all must be green before reading the code)

```
npm ci
cd contracts && forge build && bash script/check-sizes.sh && forge test --fuzz-runs 1000 && bash script/check-layout.sh && cd ..
npm run gen:hardness-abi && git diff --exit-code api/_lib/hardness-registry.abi.ts api/_lib/adversarial-bounties.abi.ts
npm run test:hardness-abi-anvil && npm run test:bounties-abi-anvil
DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres npm run test:rls-lockdown-pg
DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres npm run test:swap-ledger-pg
DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres npm run test:agent-registry-pg
CI=true npx tsx scripts/test-rls-lockdown-pg.mts   # must exit 1 without DATABASE_URL
npm run test:remediation-r2 && npm run test:rpc-redaction && npm run test:base-swap && npm run test:stock-ticker-routing
BOBBY_SUPABASE_URL=https://dummy.supabase.co BOBBY_SUPABASE_SERVICE_ROLE_KEY=x BOBBY_SUPABASE_ANON_KEY=x npm run test:api-security
npm run test:protocol-write-safety && npm run check:api && npm run lint -- --quiet && npm run build
```
Expected: Foundry 283/283 (14 suites, DeploymentGates 34), remediation-r2 45/45, rpc-redaction 12/12,
api-security 47/47, sizes 7/7, layout OK. iOS: `xcodebuild test -project ios/Bobby/Bobby.xcodeproj
-scheme Bobby -destination 'platform=iOS Simulator,name=iPhone 17 Pro'` → 18/18.

## What to attack, per finding

| # | Where | Attack to attempt |
|---|---|---|
| BP-01 | `src/lib/base-swap/quote-guard.ts`, both cards | A quote whose raw integers disagree with the displayed decimals, or whose min-out is not `amountOutRaw·(10000−bps)/10000`; a response for a different pair than requested; a recipient ≠ wallet. |
| BP-02 | `ios/Bobby/Sources/BaseSwap.swift`, `BaseSwapView.swift` | Change the stock/side between quote request and response; change the wallet after approval. |
| BP-03 | `contracts/script/V2ParamsGate.sol`, `DeployBase.s.sol`, `VerifyBaseDeployment.s.sol`, `scripts/check-mainnet-readiness.mts` | `V2_ENTRY_WINDOW_SEC=65596` (narrows to 60), `V2_CHALLENGE_WINDOW_SEC=$((604800+16777216))` (narrows to 7 days), `=172800` (== timelock); a manifest without `v2Params` on 8453; `setParams` drift after review; readiness with a `V2_*` missing. Confirm `narrow` is the only path into the constructor. |
| BP-04 | `api/_lib/control.ts` | Malformed control JSON shapes; env `false` vs dynamic freeze. |
| BP-05 | `ios/Bobby/Sources/WalletBridge.swift`, `RPCCorrelator.swift` | Late/duplicate/wrong-topic/wrong-chain/id-less responses; a tx hash answering a signature request. |
| BP-06 | `.github/workflows/ci.yml`, `contracts/script/check-sizes.sh`, the three `*-pg.mts` scripts | Add a contract to `DeployBase.Deployed` without listing it in `check-sizes.sh` — the gate must not silently pass it; run any pg script with `CI=true` and no `DATABASE_URL`. Confirm every job step actually executes on a PR. |
| BP-07 | `api/_lib/protocol-payments.ts`, `api/mcp-http.ts`, `scripts/test-bounties-abi-anvil.mts` | Build a challenge for a bounty posted before an owner `setChallengeBond`; a zero evidence hash; a bounty in each of the six states — compare `nextDeadline` to the contract's own clocks. |
| BP-08 | `api/_lib/mcp-challenges.ts`, both MCP transports | Redeem with the tx hash but the wrong client secret / different request hash; replay after completion; retry after a tool failure. |
| BP-09 | `api/_lib/cycle-provenance.ts`, migration `0011`, readers | A manual wallet cycle must never surface through `agent_cycles_public` / `agent_trades_public`. |
| BP-10 | migration `0012`, `api/agents/register.ts`, `api/agents/transfer.ts` | Register with a stale `row_version`; change owner through registration; replay a transfer request id. Apply `0012` on a table that already has a text `version` column (production shape) and confirm both functions use `row_version`. |
| BP-11 | `api/_lib/chains.ts`, `api/_lib/trackrecord-stats-adapter.ts`, `api/reputation.ts`, `api/protocol-heartbeat.ts` | Set `PROTOCOL_CHAIN=base` and record which selectors are requested; force `0x` results and check for zeros under `ok:true` anywhere in the payload. |
| BP-12 | `api/_lib/rpc-redact.ts` + the four readers | `BASE_RPC_URL` with userinfo/path/query secrets; every failure path; grep bodies AND stdout/stderr for any fragment. Also check `api/_lib/hardness-registry.ts` and `protocol-record.ts` logs. |
| BP-13 | `api/orchestrate.ts` (`finalizeAction`, `resolveSizing`, `confirmProof`, zod schemas) | No size + score 100; default policy + size; `requireOnchainProof` with a submitted-but-unmined hash; paper mode; blocked symbol; CIO/Judge outside schema; quantity/notional disagreeing; the high-risk gate with a large entry price and a small notional. |
| BP-14 | `api/_lib/base-swap.ts` `evaluateStockReference` | Issuer paused with a fresh round; unreadable registry; multiplier mismatch. |

## Round 13 re-verification (after the first third-round pass)

The first pass reopened BP-01/03/06/08/12 and found the readiness↔finalize receipt mismatch;
all are fixed (report, "Round 13"). Re-attack these first, on the fixed commit:
- BP-01: a response whose full `quote` is honest but whose `execution.quote` / `disclosure` lies
  (min received, amounts, deadline, router) must be refused by `SwapConfirm`'s build and by
  `validated()`; the rendered MIN RECEIVED must come from the validated quote.
- BP-08: with a uuid-typed `challenge_id`, pay with the 402's `challengeIdBytes32`, retry with the
  uuid header (and without a header) → executed once, then replayed; a bytes32 without the zero
  tail must be refused before any database read. Run `npm run test:mcp-payment-transport`.
- BP-03: `V2_ENTRY_WINDOW_SEC=3O` (and `-5`, `""`, `1e80`) must make the DeployBase simulation
  revert before any transaction; on 8453 an unset `V2_*` must revert. Run the fork simulation.
- BP-06: cite the GitHub run id of this branch's CI (all jobs, all steps); add an eighth `new X(`
  to a scratch copy of `DeployBase.s.sol` and confirm `check-sizes.sh` exits 1.
- Readiness: `npm run test:protocol-write-safety` executes `--phase=postdeploy` on a
  finalize-shaped manifest (GO) and on a stripped one (NO-GO).
- BP-12: with a keyed `BASE_RPC_URL`, drive HTTP 500 HTML bodies, ethers `requestUrl:` and viem
  `URL:` shaped errors, bare-key and percent-encoded echoes through the readers,
  `/api/base-swap` (txWithheld), `/api/protocol-record` and `/api/verified-calls`; capture logs
  with `util.format`.
- BP-07 / BP-09 / BP-11: the handler-level bounty test, the reader scan (mutate the heartbeat
  read), stale-cache replay and `bobby-protocol-stats` under an unreadable ledger.

Commands added since the first pass: `npm run test:mcp-payment-transport`; `test:rpc-redaction`
now 28 checks; `forge test --match-contract DeploymentGatesTest` now 37.

## Deployment review checklist (third clean review)

DeployBase config → manifest → `VerifyBaseDeployment` → `check:mainnet:predeploy` coherence
(now including `v2Params`, `treasury`, `challengeBondWei`); `BountyEconomicsGate` and
`V2ParamsGate` both run pre-broadcast; production sizes; both generated ABIs equal their
artifacts; layout baseline; the runbook's operator steps match the scripts. Record GO 3/3 only
if the runtime hash is unchanged and no item reopens.
