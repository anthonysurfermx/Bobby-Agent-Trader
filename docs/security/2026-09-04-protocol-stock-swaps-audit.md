# Bobby Protocol and tokenized-stock swaps — expanded security review

Date: 2026-09-04. Status: **NO-GO; first expanded source-review pass.**

Reviewed web/backend/contracts: `security/remediation-r2` at
`02a0a7aa51b129f89089be121d047a00dfb78452`. Reviewed native client:
`codex/ios-base-swaps` at `b3f9b2b254416cf7947e87e6f13618e015b89775`.
The native client is in a separate checkout; the web branch has no `ios/` tree.
Findings below refer to those exact revisions. No production setting, deployed
contract, wallet transaction, or application source was changed during this pass.

The user requested review of Bobby Protocol and the complete stock-swap feature
on web and iOS. The implemented stock rail is **Coinbase B20 on Base 8453**, with
USDC pairs for AAPLc, GOOGLc, METAc and NVDAc, using Uniswap V3 SwapRouter02.
It is not an implementation of every product marketed as xStocks. The separate
Universal Router worktree is not the release candidate reviewed here.

Coinbase describes B20 and the multiplier on its [Tokenize page](https://www.coinbase.com/en-au/tokenize).
The pinned router, factory and quoter were cross-checked against
[Uniswap's Base deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments)
and the read-only venue smoke test. These checks do not approve jurisdictional
eligibility, issuer upgrades, or live user execution.

## Findings

Severity describes the impact under the stated precondition. A source-confirmed
missing validation is not evidence of a production compromise. No exploit
payloads, mainnet vulnerability reproductions, or third-party offensive testing
were performed.

### BP-01 — P1: web signing guards do not bind displayed amounts to raw units

Evidence: `src/lib/base-swap/calldata-guard.ts:64`, `:97`, `:138`;
`src/components/agent-radar/SwapExecutor.tsx:130`, `:166`, `:174`, `:301`;
`src/components/adams/SwapConfirm.tsx:190`, `:232`.

The browser compares decoded approval/swap amounts to raw-unit fields supplied
by the same API response. The human sees separate decimal fields.
`quoteMatchesAmount` only compares the decimal input with the typed amount;
neither signing card derives raw input from the user's amount and pinned token
decimals or validates the displayed minimum against `minAmountOutRaw`.
The guard also does not independently derive the minimum from quoted output and
the user's selected slippage. Router and recipient checks remain useful, but
they do not close this amount-consent boundary.

Precondition/impact: an inconsistent or compromised quote response can reach the
wallet with economic terms different from those displayed by Bobby. A wallet
confirmation is still required. This is not a claim that an unauthenticated
caller controls another user's response or can sign for them.

Required correction: validate the complete quote using integer units before
display and immediately before approval/swap; bind requested pair, amount and
slippage; require nonzero outputs; compare human/raw fields; calculate minimum
received locally; apply local deadline and ticket-policy ceilings. Pass those
validated values to calldata decoding in both signing surfaces.

Closure evidence: rejection tests for inconsistent display/raw amounts and
slippage, plus a normal approve/requote/swap journey through each card.

### BP-02 — P1: iOS validates an allowed pair, not the pair selected by the user

Evidence in the native revision: `ios/Bobby/Sources/BaseSwap.swift:121`;
`ios/Bobby/Sources/BaseSwapView.swift:310`, `:319`, `:335`, `:345`, `:360`.

`validateQuote` receives amount, slippage and wallet, but not the requested input
and output tokens. It checks that the returned pair is some allowed USDC/stock
pair. The calldata guard subsequently compares against that returned quote.
Meanwhile, the form's receive label uses the locally selected `tokenOut`.
There is no binding from that selection to the returned pair in any of the four
quote-validation call sites.

Precondition/impact: a mismatched quote response can offer a trade in another
allowed stock while the form still labels the selected stock. Correct amount,
recipient and router validation does not establish consent to the asset.
This is a client boundary defect, not an observed issuer or server compromise.

Required correction: pass immutable requested input/output tokens into quote
validation; compare exact pinned identity and direction at response acceptance
and immediately before signing, including after approval. Invalidate the quote
when wallet/account/chain or request generation changes.

Closure evidence: wrong-stock and reversed-direction responses are rejected even
when the response is internally consistent and every address is allow-listed.

### BP-03 — P2: V2 deployment parameters narrow before validation and are not pinned in the manifest

Evidence: `contracts/script/DeployBase.s.sol:147` and `_writeManifest`;
`contracts/script/VerifyBaseDeployment.s.sol:_verifyTrackRecordV2Oracle`;
`contracts/src/BobbyTrackRecordV2.sol:1310`.

Seven `V2_*` environment values are cast from `uint256` to `uint16`/`uint24`
before the constructor validates them. The constructor therefore sees only the
truncated value and cannot prove that the operator's original value was valid.
Its on-chain bounds still apply: this is configuration-integrity failure, not a
bypass of those contract bounds. Unlike fees and bounty bonds, the selected V2
verification parameters are not persisted in the deployment manifest or compared
to `params()` by the live verifier/readiness chain.

Required correction: check full-width values before narrowing, validate the
parameter relationships before broadcast, serialize every verification parameter
and compare the deployed values with the reviewed manifest. Keep constructor
validation as defense in depth.

Closure evidence: valid defaults and valid overrides survive the full path;
out-of-width values fail before broadcast; manifest omissions and live parameter
drift fail verification. This finding prevents awarding the pending third clean
deployment review. Runtime source remains unchanged.

### BP-04 — P2: malformed dynamic controls are interpreted as writes-open

Evidence: `api/_lib/control.ts:57`, `:74`, `:84`, `:87`;
`api/_lib/write-guard.ts:76`.

Dynamic control reads reject transport errors, but successful JSON is not
schema-validated. `fromEdgeConfig` accepts an object without boolean
`write_freeze`/`canary` fields and maps both to false using `=== true`.
The table reader applies the same coercion. Thus malformed control data can be
treated as an explicit decision to open writes, contradicting fail-closed
behavior. A normal typed Postgres row mitigates the table variant; Edge Config
does not supply that schema guarantee.

Required correction: require explicit boolean fields, reject arrays/missing or
invalid values, and return frozen+canary on validation failure. Document and test
whether environment freeze flags override or are superseded by dynamic flags.
The current source deliberately selects one control source; an unconditional
environment emergency override must not be assumed by operations.

Closure evidence: only a well-formed explicit false opens writes; malformed,
missing, null, string-valued and unreadable controls keep writes frozen.

### BP-05 — P2: native wallet responses are not correlated with the pending RPC

Evidence in the native revision: `ios/Bobby/Sources/WalletBridge.swift:275`,
`:382`, `:405`. Installed Reown 2.3.2 exposes `id`, `topic`, and `chainId` on
`W3MResponse`; the subscriber discards them and forwards only `result`.

The app's UUID protects the timeout task but is not the JSON-RPC request ID.
The next response can complete whichever continuation is pending, including a
late response after a previous request timed out. Signature/hash shape checks
do not correlate two requests of the same kind. Receipt verification mitigates
false final recording, but the approval/session workflow can still associate a
response with the wrong action.

Required correction: retain the SDK RPC ID, session topic, chain and expected
method/account with the request; ignore unrelated/late responses; cancel pending
work on disconnect or account/session replacement. Retain final on-chain receipt
checks independently.

Closure evidence: normal response succeeds; late, duplicate, wrong-topic,
wrong-chain and disconnected-session responses cannot complete a newer request.

### BP-06 — P2: the contracts CI size step prevents later security checks from running

Evidence: `.github/workflows/ci.yml:42` executes `forge build --sizes` before
`forge test` and the storage-layout check. On the reviewed revision the exact
size command exits 1 because the `DeployerEoa` test harness exceeds EIP-170.
All seven deployable production contracts are below EIP-170.

The earlier review notes acknowledged this local exception, but the workflow
does not encode it. The first failed step therefore prevents the later test and
layout steps from executing in a normal CI job.

Required correction: enforce size limits on the explicit production-contract
inventory, separately compile the harness, and run tests/layout checks without
silencing genuine production-size failures. Also include the swap, remediation,
ABI and database suites in the release verification workflow.

Closure evidence: the actual CI job reaches tests and layout verification, and an
oversized production artifact still makes the release gate fail.

## Additional integrity and dependency work

- Receipt verification checks wallet sender, router, successful execution and
  calldata hash against a stored build. It records a block number, but does not
  retain or verify a canonical block hash or reconcile reorganized receipts.
  Before treating the ledger as final accounting, define provisional versus
  finalized status and a reconciliation policy. No reorganization was induced.
- `npm audit --omit=dev --json` reports **22 moderate package entries, no high or
  critical entries** for this local dependency tree. These include transitive
  wallet dependencies and are not 22 distinct demonstrated protocol exploits.
  Reachability and safe upgrade testing remain open; do not use `audit fix
  --force` as release evidence. This result is distinct from GitHub's earlier
  default-branch advisory count.
- The issuer metadata exposes paused features even when transfers are permitted.
  The read-only smoke returned `pausedFeatures=32` and `transferPaused=false`
  for NVDAc. This is a deployment-time dependency to monitor, not evidence that
  Bobby can override issuer policy.

## Coverage and release evidence

| Area | Evidence obtained in this pass | Still required |
|---|---|---|
| Bounty reward/bond liabilities and terminal states | Source review plus 81/81 existing bounty, final-regression and deployment-gate tests; full Foundry suite 269/269 across 14 suites; no new liability finding | Correct BP-03/BP-06 and repeat the pending deployment review |
| All seven production artifacts | Source/script/compiler diff from round 8 empty; every runtime below EIP-170 | Compare constructor-patched deployed runtime and final ownership to the finalized manifest |
| Backend authorization and existing remediations | API security 47/47; remediation 30/30; record-auth and protocol write-safety pass | Live auth/RLS/configuration evidence against the actual release environment |
| Swap math, risk and routing | Base-swap tests pass; risk gate 42 assertions; ticker routing 52 equities + 9 speech cases | Close BP-01/BP-02; signed canary and observed receipts |
| Oracle adapter | TrackRecord V2 library 50/50; commit-policy pass | Live canonical Pyth activation and deployment parameter checks |
| Public Base data | Read-only smoke passed for all four stock pairs, venue getters, country gates, feature switch and empty-wallet refusal | Real approval/swap/revoke after release prerequisites are met |
| Web release | API typecheck and production build pass; generated Hardness ABI 159/159 | Rendered signing-flow verification after fixes, production configuration and canary |
| Native client | Source review of quote guards, signing bridge, UI, API receipts, Keychain and privacy manifest; existing simulator tests 9/9 | Close BP-02/BP-05; physical-device wallet return/cancel/relaunch and signed archive |
| Database ledger | Migration 0009/0010 source reviewed for service-only writes, receipt uniqueness and transactional FIFO | Scratch-Postgres suites and current deployed policy/function inspection |

The first native test invocation disabled code signing and the test host trapped
in Reown's pairing/key creation before XCTest could run. Repeating the same suite
with normal simulator signing passed **9/9**, with zero failures or skipped tests.
The unsigned-host failure is not classified as a protocol vulnerability. Simulator
unit tests do not establish physical-wallet or App Store release readiness.

The local predeploy check remains **0 PASS / 31 NO-GO** because the required
deployment environment is absent. Those missing runtime prerequisites are not
31 additional security vulnerabilities. No placeholder production configuration
was supplied to make the check green.

This pass does not certify the entire protocol as vulnerability-free. It has not
completed a fresh line-by-line review of every remaining API/contract, issuer
implementation, live Supabase policy, deployed contract, or physical-device path.
The expanded audit stays open until those coverage gaps and findings are closed.
Existing green tests are regression evidence, not substitutes for missing checks.

Launch also requires the real deployment environment, finalized receipt manifest,
Safe handoff/Pyth actions, approved issuer-country policy and the final-bytecode
canary. iOS additionally retains the signed archive, device and App Store tasks in
its own release checklist. The first expanded pass provides no launch approval.
