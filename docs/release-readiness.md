# Base mainnet release readiness

**Updated:** 2026-08-14
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
| Deploy and verify scripts V2 | Complete | `4dee332` plus upgraded Sepolia parity check | Constructor, canonical Pyth set, Safe checks and manifest reconciliation pass |
| Backend V2 adapter | In progress | Claude workstream | VERIFIED and ATTESTED writes/readbacks pass against canary |
| Pyth/Hermes production access | Human gate | Credential stays outside git | Authenticated price updates work from the production runtime before the provider cutoff |
| Safe 2-of-3 | Blocked on owner setup | [`audit/safe-setup-runbook.md`](audit/safe-setup-runbook.md) | Threshold, owners, singleton, modules, guard and final ownership verified live |
| Base Sepolia V2 canary | Pending | — | Deploy, verify, E2E lifecycle and soak complete |
| Base mainnet funding | Human gate | — | Approved treasury receives bounded deployment gas |
| Mainnet deployment | Blocked | — | Every gate in this document is checked with evidence |
| Production web/API promotion | Blocked | — | Mainnet manifest, environment and public telemetry reconcile |

## Current verification evidence

The release-preparation branch was checked locally on 2026-08-14 with:

- production web build and API typecheck passing;
- 214/214 Foundry tests passing with 1,000 fuzz runs;
- six TrackRecord V2 invariants exercised with explicit handler selectors;
- storage and struct-member layout matching the frozen snapshot;
- TrackRecord V2 runtime size of 23,499 B, leaving 1,077 B under EIP-170;
- 26/26 API security checks and 11/11 record-auth checks passing;
- 32/32 risk-gate assertions and 261/261 playbook assertions passing;
- no secrets detected by Gitleaks in the working diff or 14 unpushed commits;
- mobile and desktop browser checks passing on `/protocol`,
  `/protocol/docs` and `/protocol/architecture`, with no console errors or
  horizontal overflow.

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
11. Soak for 24–48 hours with logs and alerts enabled.

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
- [ ] API heartbeat reports chain `8453`, native symbol `ETH` and expected block.
- [ ] Security report includes commit hashes, test totals and known limitations.
- [ ] GitHub branch and CI are green before production promotion.
- [ ] Production promotion is approved separately from `git push`.
