# Base mainnet release readiness

**Updated:** 2026-08-15
**Target:** Base mainnet (`8453`)
**Deployment state:** **NO-GO until every blocking gate below is closed**

This is the operational source of truth for the Base launch. A green build, an
audited source commit or a deployed testnet contract is evidence for one gate;
none of them independently authorize mainnet.

## Executive status

| Workstream | State | Evidence | Exit condition |
|---|---|---|---|
| TrackRecord V2 contract | Complete | `53d1f4c`; P1 regression LONG/SHORT | Source hash remains unchanged through deployment |
| P1 invariant coverage | Complete | `763d765`; mutation reintroducing exploit makes invariant fail | Included in CI and final test run |
| ABI and storage layout | Complete | 126-entry ABI match; struct-member layout gate | Deploy, backend and published ABI use the same artifact |
| Contract size | Watch | 23,499 B runtime; 1,077 B below EIP-170 | No unreviewed runtime growth |
| Deploy and verify scripts V2 | Complete | `4461f80`; exact params, Safe owner set, receipt evidence and Pyth recovery checks | Constructor, canonical Pyth set, Safe checks and manifest reconciliation pass |
| Backend V2 adapter | Code complete; canary pending | Chain-aware ABI/Pyth adapter; 53 focused checks | VERIFIED and ATTESTED writes/readbacks pass against the live canary |
| Cutover write safety | Code complete; external review clean | Global freeze, chain-specific recorder keys, two-key Base latch, RPC chain assertion; no open P0/P1/P2 | Live frozen-write smoke pass |
| Precommit execution binding | Code complete; migrations pending | Permanent `debate_hash` claim, deterministic OKX `clOrdId`, concurrent regression, forward-only provenance repair | Apply migrations `202608150001` and `202608150002`, pass the claims RPC gate, and prove one commitment cannot open two live orders |
| Stop-breach watcher | Pending | Contract challenge path is tested; production worker is not wired | Historical stop scan runs before publishing WIN and challenges genuine breaches |
| Pyth/Hermes production access | Human gate | Credential stays outside git | Authenticated price updates work from the production runtime before the provider cutoff |
| Safe 2-of-3 | Blocked on owner setup | [`audit/safe-setup-runbook.md`](audit/safe-setup-runbook.md) | Threshold, owners, singleton, modules, guard and final ownership verified live |
| Base Sepolia V2 canary | Pending | — | Deploy, verify, E2E lifecycle and soak complete |
| Base mainnet funding | Human gate | — | Approved treasury receives bounded deployment gas |
| Mainnet deployment | Blocked | — | Every gate in this document is checked with evidence |
| Production web/API promotion | Blocked | — | Mainnet manifest, environment and public telemetry reconcile |
| X Layer quiescence | Pending | Backend freeze exists; external/stale writers are not stopped by config alone | Disable crons/webhooks/deployments, revoke secrets/writer, drain in-flight work and prove a quiet period |
| X Layer history archive | Baseline captured | Block `68,036,174`; SHA-256 `eecdee90…106de`; state-only provenance | Capture confirmed final block, prefer complete events, verify deterministically and anchor digest externally |

## Current verification evidence

The release-preparation branch was checked locally through 2026-08-15 with:

- production web build and API typecheck passing;
- 217/217 Foundry tests passing with 1,000 fuzz runs;
- six TrackRecord V2 invariants exercised with explicit handler selectors;
- storage and struct-member layout matching the frozen snapshot;
- TrackRecord V2 runtime size of 23,499 B, leaving 1,077 B under EIP-170;
- 26/26 API security checks and 11/11 record-auth checks passing;
- 53/53 TrackRecord V2 adapter checks passing;
- 32/32 risk-gate assertions and 261/261 playbook assertions passing;
- independent adversarial reviews of the API execution path and final release
  gates reporting no open P0, P1 or P2 findings after remediation;
- no secrets detected by Gitleaks in the candidate source diff (ignored build
  artifacts excluded);
- mobile and desktop browser checks passing on `/protocol`,
  `/protocol/docs` and `/protocol/architecture`, with no console errors or
  horizontal overflow.

The adapter now keeps the V1 X Layer path isolated from the V2 Base path,
selects the Hermes endpoint from the contract's active canonical Pyth address,
anchors entry/exit evidence to near-block ticks, requires explicit LONG/SHORT
intent, waits for a successful core transaction
receipt before the forum persists a resolution, retries known recorder-wallet
nonce races, commits only after the live risk gate passes, prevents paper or
user-managed orders from spending the recorder wallet, and exposes VERIFIED
and ATTESTED statistics separately. These are code-level results; they do not
replace the real Sepolia rehearsal.

The reconciled cutover layer additionally requires a chain-specific recorder
key, confirms the RPC chain id before signing, separates trading and protocol
automation secrets, and requires both `PROTOCOL_WRITES_ENABLED=true` and an
exact `PROTOCOL_WRITE_CHAIN_ID`. `PROTOCOL_CUTOVER_FREEZE=true` is evaluated by
the common write guard as well as the live trading path, so a direct
authenticated TrackRecord request cannot bypass the maintenance freeze.

This protects the candidate backend only. It does not stop a wallet, an old
deployment, an external scheduler, a queued transaction or a leaked legacy
secret. Launch therefore also requires the operational quiescence gate below.

Live Bobby orders additionally consume their on-chain `debateHash` exactly once
in `trade_execution_claims`. The unique database claim is acquired before the
OKX request, binds chain/symbol/direction/size/leverage and persists the OKX
order id. A deterministic `clOrdId` reconciles a lost HTTP response, while a
concurrent loser never submits another order. Resolved commitments and pending
commitments older than 15 minutes are rejected. The migration must be applied
and exercised in the canary; source code alone does not create this guarantee.

The mainnet checker is a **configuration/evidence checker**, not launch
authorization. Canary/cutover now perform an authenticated Hermes fetch and a
service-role RPC round trip that proves the claims ledger's RLS/grants and
atomic insert-update-delete path, but those checks run from the operator
machine and do not prove Vercel runtime egress, the Sepolia soak, the
historical stop-breach watcher, the final archive digest/anchor, bounded
funding or the human Safe ceremony. Production unfreeze requires explicit
human approval after every release gate is reconciled.

`npm audit --omit=dev` currently reports 11 moderate findings and no high or
critical production findings. They all trace to old `uuid` versions inside the
wallet/OKX dependency graph. The automated full fix upgrades `wagmi` across a
breaking major version, so it must not be applied blindly before launch. Track
this as dependency debt and retest wallet connection and signing before any
coordinated upgrade.

## TrackRecord V2 security baseline

The release candidate must retain these properties:

- Entry and exit evidence are verified against the snapshotted Pyth feed.
- Stop and target sit on the correct side of both the reported entry and oracle
  entry.
- Stop-loss PnL derives from the oracle entry.
- VERIFIED and ATTESTED outcomes use separate counters and public rates.
- A verified stop breach is permissionless during its valid challenge window.
- The storage-layout snapshot includes struct members, not only top-level slots.
- Reintroducing the reported-entry/oracle-entry exploit makes the invariant
  suite fail.

Any change to `BobbyTrackRecordV2.sol`, its constructor, ABI, storage layout,
Pyth parsing or challenge lifecycle reopens contract review.

## Pyth configuration

Base is in the Pyth Core migration window scheduled for 2026-08-18. New
integrations should use the upgraded Pyth contract while retaining only an
explicitly approved recovery address. Source: [Pyth EVM contract
addresses](https://docs.pyth.network/price-feeds/core/contract-addresses/evm).

For Base mainnet, deployment code must pin the official chain-specific set:

| Role | Address |
|---|---|
| Active upgraded Pyth | `0xbC16aee60f64864882BC6C4E428e148Fc0E272F5` |
| Pre-approved current Pyth | `0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a` |

The deploy script must reject:

- unknown addresses on `8453`;
- duplicate or zero addresses;
- an address without bytecode;
- a list with fewer than two approved recovery options;
- an ordering that makes the legacy address active for a new deployment.

Two Pyth contracts improve migration recovery; they are not independent oracle
providers and must not be described as oracle decentralization.

## Safe ownership gate

Mainnet succeeds only when each ownable contract reports:

- `owner == expectedSafe`;
- `pendingOwner == address(0)`;
- Safe threshold is at least 2;
- Safe owner count is at least 3;
- Safe singleton/code identity matches the pinned deployment policy;
- no unexpected module or guard is enabled;
- deployer and hot keeper are not the final owner.

A proposed ownership transfer is not completion. The Safe must accept it before
the deployment can pass verification.

## Base Sepolia rehearsal

The final canary must use the same source, constructor shape, role separation
and backend adapter intended for mainnet.

Required evidence:

1. Deploy and verify all seven contracts.
2. Reconcile bytecode, constructor arguments and manifest addresses.
3. Complete ownership handoff and verify the final state.
4. Commit one VERIFIED LONG and one VERIFIED SHORT with real Pyth updates.
5. Resolve one WIN and one LOSS.
6. Prove an early resolution reverts.
7. Prove the fabricated-loss configuration reverts at commit.
8. Complete a genuine stop-breach challenge.
9. Complete one ATTESTED lifecycle and confirm it does not affect VERIFIED
   statistics.
10. Confirm public API and website read back the same chain state.
11. Exercise the automated historical stop-breach watcher before allowing a
    provisional WIN to become public/final.
12. Soak for 24–48 hours with logs and alerts enabled.

## Mainnet launch sequence

```text
freeze source + artifacts
  → run CI and independent diff review
  → create and verify Safe
  → fund bounded deployer balance
  → dry-run deployment against fork
  → deploy seven contracts
  → verify source and constructor arguments
  → accept ownership in Safe
  → run live deployment verifier
  → update backend environment
  → run read-only smoke tests
  → disable every X Layer producer and revoke stale access
  → drain in-flight operations and prove a quiet period
  → capture/verify the confirmed X Layer archive and anchor its digest
  → enable bounded writes
  → update public website and manifests
  → publish deployment evidence
```

## Rollback and stop conditions

Stop the release if any of the following occurs:

- source, ABI or bytecode differs from the reviewed artifact;
- any contract exceeds its expected size or verification fails;
- a role, owner, Pyth address or feed ID differs from the manifest;
- backend writes target more than one chain during cutover;
- any legacy X Layer writer, deployment, cron or webhook remains capable of
  submitting after the quiet period begins;
- public telemetry labels legacy X Layer data as Base data;
- canary results cannot be reproduced from explorer and Pyth evidence;
- secrets appear in git status, build output or deployment artifacts;
- a P0/P1 security finding remains open.

Rollback means pausing new commits where supported, restoring the last known
read-only public configuration, preserving all evidence, and publishing the
failed gate. It does not mean deleting or rewriting on-chain history.

## Publication checklist

- [ ] Mainnet manifest committed without secrets.
- [ ] Explorer links point to verified Base contracts.
- [ ] README and website no longer say mainnet is gated.
- [ ] X Layer remains labeled legacy/archive.
- [ ] X Layer producers are disabled, stale secrets/access are revoked,
      in-flight operations are drained and the quiet period has zero writes.
- [ ] Final X Layer archive uses a confirmed/final block, is replay-verified,
      states whether event provenance is complete and has an externally signed
      or Safe-anchored digest.
- [ ] API heartbeat reports chain `8453`, native symbol `ETH` and expected block.
- [ ] Security report includes commit hashes, test totals and known limitations.
- [ ] GitHub branch and CI are green before production promotion.
- [ ] Production promotion is approved separately from `git push`.
