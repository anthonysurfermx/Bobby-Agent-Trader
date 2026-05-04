# BobbyIntentEscrow.sol — Round 3 Audit Brief

**Date**: 2026-05-04
**Branch**: `feat/onchainos-payments-foundation`
**Status**: DRAFT — input for the third (and final) audit round before any testnet deploy

## Goal

Align Bobby's V3 Intent Escrow state machine with **OKX OnchainOS Optimistic Escrow** so:

1. The contract is *interop-ready* with the OKX `escrow` intent (`@okxweb3/x402-evm`).
2. An OKX Agentic Wallet can read Bobby escrow state without translation.
3. R3 hardening + this rename happen in a single audit pass — no separate retro.

## Current state machine (Round 2 final)

`contracts/src/BobbyIntentEscrow.sol:101`:
```solidity
enum TradeState { NONE, EXECUTED, RESOLVED }
```

Three states cover the optimistic happy path. Disputes are handled via
`overrideResolution()` inside a single `RESOLVED` terminal state — the dispute
window exists but there is no dedicated `Disputing` state in the enum.

## Target state machine (OKX 6-state)

```solidity
enum TradeState {
    Created,      // intent struct stored, signatures verified, awaiting execution
    Submitted,    // CIO + Arbiter sigs accepted, transition recorded, optimistic
    Disputing,    // override window opened by trader (challenge raised)
    Completed,    // pnl recorded, settlement final
    Refunded,     // dispute resolved in trader's favor — trader made whole
    Terminated   // owner-cancelled or expired before submission
}
```

## Rename + transition map

| Current      | OKX equivalent | Rename action                                           |
| ------------ | -------------- | ------------------------------------------------------- |
| `NONE`       | `Created`      | rename + emit `IntentCreated` on initial store          |
| (none)       | `Submitted`    | new state — assigned by `executeIntent()`               |
| `EXECUTED`   | (deprecated)   | maps to `Submitted` post-rename                         |
| (none)       | `Disputing`    | new state — entered when `openChallenge()` is called    |
| `RESOLVED`   | `Completed`    | optimistic terminal path                                |
| (none)       | `Refunded`     | terminal path when dispute resolves in trader's favor   |
| (none)       | `Terminated`   | owner cancellation or expiry sweep                      |

**Critical invariant** (must hold across the rename):
- A nonce can never produce two terminal states for the same `(signer, nonce)` pair.
  Existing tests `test_nonceCannotExecuteTwice` and `test_keeperCannotCreateTerminalStateWithoutCioAndArbiter` already enforce this on the 3-state enum — port them to the 6-state enum.

## R3 scope (asks for the auditor)

1. **State-machine equivalence proof** — model the target as a finite-state
   automaton; verify that for every reachable state in the 3-state version
   there is exactly one corresponding state in the 6-state version, and that
   no new transitions admit additional terminal paths.
2. **Dispute window** — re-audit `overrideResolution()` against the explicit
   `Disputing → Completed | Refunded` transition, including:
   - reentrancy on dispute open
   - challenge griefing economics (deposit / fee model)
   - timing oracle (block.timestamp manipulation under PoA on X Layer 196)
3. **Event compatibility** — confirm event topic hashes match what the
   `@okxweb3/x402-evm/escrow/server` indexer expects (verify by deploying to
   a fork and decoding events with the SDK).
4. **Replay across forks** — `chainIdExpected` is immutable since R2-003;
   re-test that a replayed signature on a different `chainId` reverts.
5. **Override window math** — the constant ceilings introduced in R2 (max
   size, max slippage) must remain unchanged or be justified line-by-line.
6. **Fuzz — port** — every `BobbyIntentEscrowInvariantTest.t.sol` test must
   pass on the 6-state version with at least equivalent run counts (256+).

## Out of scope for R3

- New features beyond the rename + the invariants above.
- Pyth oracle migration (slated for a later round; R2-001 keeps the override gate).
- `markFailed()` reintroduction (Round 1 F-001/F-002 explicitly removed it; do not undo).
- Any deploy-related work — R3 is audit-only.

## After R3 passes

1. Apply rename in a single PR titled `feat(escrow): align state machine to OKX 6-state for OnchainOS interop`.
2. Run all 25 invariant tests on the new enum.
3. Deploy to X Layer **testnet** only. Wire the address into
   `BobbyIntentEscrow.deployed.json` and the `OnchainOSPayments` integration
   shim (Phase 2 of `project_onchainos_payments.md`).
4. Mainnet deploy is a separate decision — requires R3 sign-off + a
   mainnet-only audit checklist with at least 2 reviewers.

## Memory rule reminder

Per `feedback_smart_contract_security.md`: **3-round audit before any .sol
deploy**. R1 + R2 are done. This brief opens R3. Until R3 passes, there are
no changes to the contract source — only this document and accompanying
test fixtures.
