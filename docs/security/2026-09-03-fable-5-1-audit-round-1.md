# Fable 5.1 audit — round 1 of 3

Date: 2026-09-03  
Web/API baseline: `origin/main@e20d2b8`  
iOS baseline: `origin/ios/apple-login@f559727` (Build 13)  
Audit branch: `codex/fable-5-1-audit-r1`  
Production actions: read-only. No deployment, migration, database write, feature-flag change, Safe transaction, or on-chain transaction was performed.

## Verdict

**NO-GO for enabling real-money stock swaps or accepting funds in the current HardnessRegistry and AdversarialBounties contracts.**

Fable's earlier report remains materially correct on the production web/API baseline. The three P0 findings are still open. Two iOS findings are closed in Build 13, and one receipt-verification claim needs a narrower description: the server does decode allow-listed token movements from the mined receipt, but the client still does not decode the exact calldata before asking the wallet to sign it.

The production health endpoint reports `main@e20d2b8`, so the audited web tree is the deployed tree. The dynamic control record reported `writeFreeze=false`; this audit did not expose or change the separate stock-swap enable flag.

## Disposition

| Finding | Round-1 status | Evidence |
|---|---|---|
| P0-1: anonymous access to `api_cache` | **OPEN — confirmed live** | Anonymous PostgREST query returned HTTP 200 and a row. The exact migration still grants `anon`/`authenticated` SELECT on every unexpired row. Credential-bearing `identity-link:*` and wallet-session nonce writers use this table. No secret or row value was printed or claimed. |
| P0-2: anonymous access to `agent_trades` | **OPEN — confirmed live** | Anonymous PostgREST query returned HTTP 200. The sample contained zero rows, but the live authorization path is open and the migration remains `USING (true)`. |
| P0-3: agent self-resolves reputation | **OPEN — reproduced** | `FinalAuditPoCTest` reproduces a registered agent self-resolving an impossible WIN and obtaining a perfect record. `resolvePrediction` is unchanged. |
| P1-1: amount edit leaves stale swap calldata | **OPEN — confirmed statically** | `SwapExecutor` binds the amount field only to `setAmount`; it neither clears nor fingerprints the existing quote. `executeSwap` later sends `quote.tx.swap`. |
| P1-2: final client disclosure is not decoded from calldata | **OPEN, wording narrowed** | `SwapConfirm` displays server-side disclosure and sends `execution.swapTx` without decoding and matching its fields immediately before signing. However, `verifySwapOnChain` does decode allow-listed `Transfer`/WETH `Withdrawal` logs from the mined receipt and rejects a receipt with no allow-listed output to the wallet. |
| P1-3/C-01: public service-role paths cross private-thread RLS | **OPEN — confirmed statically/live** | `judge-mode` and the previously enumerated public readers remain unscoped. `/api/harness-events?limit=1` returned HTTP 200 in production. Judge Mode was not invoked because it can write and spend model resources. |
| P1-4: destructive iOS identity linking | **CLOSED IN BUILD 13** | Build 13 removes the iOS identity-link/pairing flow rather than presenting the destructive merge. No identity-link reference remains in the iOS sources. The web API and database merge design remain in scope independently. |
| P1-5: substantive CSP is report-only | **OPEN — confirmed live** | Enforced CSP contains only `frame-ancestors`, `base-uri`, `object-src`, and `form-action`. `script-src`/`connect-src` remain in `Content-Security-Policy-Report-Only`, including `unsafe-inline` and broad HTTPS/WSS connectivity. |
| P1-6: bounty resolver conflict of interest | **OPEN — reproduced** | `FinalAuditPoCTest` reproduces the resolver challenging, awarding to itself, withdrawing, and preventing poster reclaim. |
| P1-7: agent stake has no withdrawal route | **OPEN — confirmed statically** | No unregister/stake-withdraw path was added to the deployed contract baseline. |
| P1-8: iOS privacy manifest contradicts collection | **CLOSED IN BUILD 13** | Build 13 requests no Apple email scope and declares User ID and Product Interaction collection for App Functionality in `PrivacyInfo.xcprivacy`. |
| C-02: TrackRecordV2 uses stale active Pyth | **OPEN — confirmed live** | `activePyth()` returned `0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a`; the repository's canonical active address remains `0xbC16aee60f64864882BC6C4E428e148Fc0E272F5`. |
| C-03: PostgREST query injection in harness memory | **OPEN — confirmed live, redacted** | Injecting `&select=id&limit=1` through `kind` returned HTTP 200, one row, and only the `id` key. No identifier value was retained in this report. |
| C-04: identity merge orphans receipt identity metadata | **OPEN — confirmed statically** | The merge RPC still deletes the merged identity without first re-parenting `bobby_swap_receipts`; the later FK uses `ON DELETE SET NULL`. |
| C-05: identity-link consume is non-atomic | **OPEN — confirmed statically** | The API still performs read, ignored DELETE, and merge as separate operations rather than an atomic service-only consume. |

## Build 13 result

Build 13 is materially safer than the iOS commit audited by Fable:

- Trader Land is included in the normal app runtime.
- Sign in with Apple requests no email scope.
- Identity-link/pairing UI and code were removed.
- The privacy manifest declares the server-synchronized account/progress categories.
- The project version is `13`.

The archive/upload result was already verified separately: Build 13 uploaded successfully to App Store Connect and entered processing. Those iOS closures do not remediate the production web/API P0s.

## Reproducible gate

Executed after the evidence pass:

- `npm run test:base-swap` — pass
- `npm run test:risk-gate` — 42/42
- `npm run test:protocol-write-safety` — pass
- `npm run test:api-security` — 47/47 (dummy non-routable Supabase import-time values; no external write)
- `npm run build` — pass
- `forge test --match-contract FinalAuditPoCTest -vv` — PoCs reproduced; no source recompilation required

Passing these gates does not cover the vulnerable RLS policies, the contract authorization model, the live Pyth configuration, or client-side calldata/display binding. Those require explicit remediation and negative regression tests.

## Required closure order

1. Immediately revoke anonymous/authenticated access to `api_cache` and `agent_trades`; expose deliberately shaped public views where required.
2. Disable or remove the identity-link endpoint until credentials are service-only and consumption/merge is atomic and recoverable.
3. Invalidate/fingerprint quotes on every editable field and decode the exact approval/swap calldata before signing.
4. Require ownership/internal authorization on Judge Mode and eliminate service-role reads from public endpoints; fix and regression-test PostgREST encoding.
5. Replace the non-upgradeable HardnessRegistry and AdversarialBounties designs before accepting funds or reputation claims.
6. Independently verify the official Base Pyth address, execute the delayed Safe-controlled activation procedure, and rerun the full deployment verifier.
7. Promote a tested restrictive CSP from report-only to enforcing.

## Round 2 target

Round 2 should review the remediation diff and require exploit-to-regression closure for every P0 plus P1-1, P1-3/C-01, C-02, and C-03. It must not accept policy text, empty-table samples, or a green generic suite as substitutes for targeted negative tests.
