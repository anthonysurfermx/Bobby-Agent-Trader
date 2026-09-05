# Stock expansion and independent local verification

Status: **NO-GO for production and for 20 executable stocks.**

## Scope and provenance

User authorization covers additional issuers while preserving Coinbase B20 for
Builder Quest. This pass starts from candidate `cfc5dd1` and iOS `91ab7c2`.
The unrelated iOS working-tree changes are not part of this patch. No production
database migration, deployment, flag change, wallet approval or swap was executed.

The security branch still points to `08e33d3`, but the integration candidate has
already passed remote [CI](https://github.com/anthonysurfermx/Bobby-Agent-Trader/actions/runs/33958547688)
and [Security](https://github.com/anthonysurfermx/Bobby-Agent-Trader/actions/runs/33958547695)
at `cfc5dd1`. Those runs precede the client changes below and cannot approve them.

## Client correction

The server already withholds transactions when the issuer oracle is paused or
unusable. Both client validators now additionally require `issuerPaused === false`,
`usable === true` and a recognized usable status (`fresh` or `market-closed`).
Unknown/missing values stop validation. The browser also requires explicit transfer
availability. iOS keeps its existing age, price deviation and transfer checks.
The web and iOS fixtures cover these states and retain the market-closed case.

This is a bounded defensive review and regression run. It does not supply three
independent approvals, a completed third audit or a production migration verdict.

## Twenty distinct stock identities, separate from execution admission

`src/lib/base-swap/stock-candidates.json` pins ten Coinbase and ten Ondo identities,
with chain, issuer, source and admission state. All twenty symbol/decimal pairs
were read on their declared chains. No candidate is implicitly added to the
execution allow-list. The new offline CI test prevents Ondo identities from
resolving through the Base rail and counts distinct underlying stocks.

The [commercial Base catalog](https://www.base.org/stocks) lists ten stocks;
the [technical documentation](https://docs.base.org/specifications/b20/tokenized-stocks-on-base)
also names COINc, CRCLc and INTCc. This pass uses the ten commercial listings.
Ondo identities come from its [official version 11 token list](https://github.com/ondoprotocol/ondo-global-markets-token-list/blob/main/tokenlist.json).
Its available EVM networks in that source are Ethereum and BNB Chain, not Base.

| Issuer / chain | Underlying stocks | Current route evidence |
| --- | --- | --- |
| Coinbase / Base | AAPL, GOOGL, META, NVDA | Read-only 10 USDC buy and sell quotes returned on the pinned V3 route |
| Coinbase / Base | SPCX | Quotes returned; ticket-cap depth, impact and full policy admission remain pending |
| Coinbase / Base | AMZN, MSFT, MSTR, SNDK, TSLA | No USDC pool in the canonical factory at fees 100, 500, 3000 or 10000 |
| Ondo / Ethereum | AMD, ADBE, CRM, NFLX, COIN, PYPL, UBER, JPM, V, DIS | Identity verified; issuer oracle, eligible venue, liquidity, chain adapter and client support pending |

See `evidence/2026-09-05-stock-admission.json` for per-token block hashes, numbers,
oracle snapshots and pool reads. `activeLiquidityRaw` is an onchain liquidity
quantity, not USD TVL. The buy and sell quotes are independent reads at the same
block, not a sequential executed round trip. Public RPC failures during the first
attempt were not counted as absent liquidity; the final evidence uses successful
identity reads and explicit factory lookups. Quotes do not prove wallet-specific
transfer eligibility or execution at the policy's maximum ticket size.

Recheck with:

```sh
npx tsx scripts/check-stock-admission.mts /tmp/stock-admission.json
npm run test:stock-admission
```

## Validation and remaining release requirements

The local application baseline passed swap, ticker, remediation, RPC-redaction,
MCP payment transport, API security, protocol write safety, progress atomic API
and thesis provenance regressions, plus build and lint. All four PostgreSQL suites
passed in a fresh localhost-only PostgreSQL 17 cluster; atomic progress reports
20 scenarios. Both ABI suites pass on local Anvil. The seven production contracts
pass EIP-170 and the storage layout matches the committed baseline.

HardnessRegistry runtime hash is unchanged:
`0x3449ac0707c855588a1a0df8d45bddbd04aabfb1e35cb66f7a704006b043e0d5`.

Foundry completed: 286 reported passing tests, 14 suites, 1,000 fuzz runs and no
failures. Default opt-in Pyth fork test returns are not live-fork coverage.
Final web swap/admission/ticker regressions, production build and lint pass.
The dependency audit reports zero high/critical and 22 moderate findings.

The iOS app and test bundles compile, but simulator installation/test launch
failed with Mach error -308 (`ipc/mig server died`). This is not a passing
simulator test run. The separate macOS harness passed all 19 unit tests with no
failures, copying the unchanged pure guard implementations and substituting
only localization; it does not validate Reown transport,
app lifecycle or real-device signing. Run it with `python3 scripts/test-ios-stock-guards.py
/path/to/ios/Bobby`. The iOS source patch is preserved in
`evidence/2026-09-05-ios-oracle-guard.patch` and applied locally in the iOS worktree.

Production remains blocked by actual-history migration preflight and coordinated
writer cutover, final-patch CI, independent review and completed iOS validation.
The configured Supabase MCP migration tools are unavailable in this session.
Additional-issuer authorization does not establish issuer-specific eligibility,
oracle correctness or a working swap adapter. The four-stock runtime allow-list
and the default-disabled stock execution flag remain unchanged.

Publishing this patch failed: HTTPS Git authentication could not obtain a
username, including a retry using the configured `gh auth git-credential` helper.
The commit is local; there is no final-patch remote CI verdict or production change.
Weekly usage displayed 12% at entry and 15% at the final budget checkpoint.
These are account-wide percentages, not exact per-task token accounting.
