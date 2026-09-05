# Unified web, API and native release candidate

Status: **NO-GO for production; stock expansion remains incomplete.**

The candidate now contains the actual native source from `2efd395`, alongside
web/API source, rather than only a native patch in an evidence directory. The
114 existing native files were imported without unrelated worktree changes.
The shared `public/land` resources agree with that native branch. Native source
is excluded from Vercel's upload; it is built independently with Xcode.

SwiftPM's 31 resolved package versions are checked in, and the native test runner
requires that resolution. GitHub CI now runs the actual app-hosted BobbyTests
suite on macOS 26 / Xcode 26.2 and checks catalog parity in the application job.
The simulator is selected for the active SDK, not an arbitrary installed runtime.
Missing simulators, empty test results and failed tests fail the job. No Apple
distribution credential is required: the simulator uses ad-hoc signing.

Local verification: Xcode 26.1.1, **23 passed / zero failed** using
`bash scripts/test-ios-simulator.sh`, automatic compatible-simulator selection,
locked packages and the unified source tree. Log: `/tmp/bobby-ios-unified-locked.log`.
The web production build and five-stock identity/picker parity check pass.
Gitleaks reports no findings with the repository configuration. Its only new
exception is the exact existing public Bobby Supabase anon JWT, whose claims
identify role `anon` and project `qbvdqkknnuweatptjohi`; no service-role key or
general JWT exception was added. This does not certify the live database's RLS.

The unified commit `7d8221f550f3af72363d33796e9cd2cfcc194180` passed all four
remote CI jobs (application, integration, contracts, iOS) and Security:
- CI: https://github.com/anthonysurfermx/Bobby-Agent-Trader/actions/runs/33973447378
- Security: https://github.com/anthonysurfermx/Bobby-Agent-Trader/actions/runs/33973447369
- PR CI: https://github.com/anthonysurfermx/Bobby-Agent-Trader/actions/runs/33973453021

Native CI passed all 23 tests. Forge 1.8.1 reports 278 cases versus the local
1.5.1 count of 286: the newer runner groups six TrackRecord invariants and four
Escrow invariants into two cases. All 286 passing function names match by suite
and function; this does not establish identical random execution sequences.
The opt-in live Pyth fork checks were not run.

Those run IDs validate `7d8221f`, not subsequent adapter changes. Simulator unit
tests are not App Store approval, a distribution
archive, physical-device wallet validation, or GO 3/3.

## Additional venue discovery

The official Aerodrome deployment list identifies three Slipstream factories
and the V2 factory. `scripts/check-aerodrome-stock-pools.mts` queries all their
published variants at one Base block and records explicit missing/unverified
results. The latest Slipstream factory has direct USDC pools for all ten
commercial Coinbase stocks. The earlier Uniswap result was venue-specific;
it did not establish that those five stocks had no liquidity anywhere.

Evidence: `evidence/2026-09-05-aerodrome-stock-pools.json`.
Sources: https://github.com/aerodrome-finance/slipstream/blob/main/README.md and
https://github.com/aerodrome-finance/contracts/blob/main/README.md.

`scripts/check-aerodrome-stock-quotes.mts` independently verifies the latest
quoter's factory, each pool's registration and identity, token metadata, issuer
pause/multiplier, the official feed, and 10/100-USDC buy and independent sell
quotes at a pinned block. Evidence:
`evidence/2026-09-05-aerodrome-stock-quotes.json`.

All ten stocks had a quoting pool at tick spacing 10, but **MSFTc is inadmissible
under the existing 5% reference-deviation limit**: buy deviation was about
33.4% at 10 USDC and 35.5% at 100 USDC against the 499.778 USD reference.
Its low measured impact is not a substitute for the oracle check. The other
nine tick-spacing-10 pools had buy impact below 0.06% and buy reference deviation
below 1.6% in this observation. Wider-spacing pools demonstrate why existence
is insufficient: AAPLc/200 had roughly 85.5% buy impact at 10 USDC; GOOGLc/500
could not quote. These are point-in-time independent quotes, not executed
round trips or wallet eligibility checks. The SPCXc production code cap remains
10 USDC even though this diagnostic also measures a 100-USDC quote.

Pool existence grants no execution admission. Aerodrome uses a different router,
tick-spacing parameters, dynamic fees and calldata shape. Its depth, reference
price and transfer policy must pass, and all three client guards must validate
the new route before execution can be enabled. The implemented execution catalog
is still five Coinbase stocks. The ten Ondo candidates remain a separate issuer
and chain integration, not Base-routable assets.

## Preparatory Aerodrome codec

`src/lib/base-swap/aerodrome-codec.ts` pins the Gauges V3 router/factory/quoter
and encodes the official eight-field `exactInputSingle` call. Its deadline is
inside the tuple, and tick spacing 10 is not presented as a Uniswap fee. The
scope is AMZNc, MSTRc, SNDKc and TSLAc, in direct pairs with Base USDC. These four
identities remain outside `BASE_SWAP_TOKENS`; MSFTc remains excluded.

The guard binds the complete canonical calldata to caller-owned intent,
including chain, tokens, recipient, raw amounts and a fresh bounded deadline.
It rejects extra calldata and native value. Approvals bind the input token,
exact amount and pinned Aerodrome spender; revocations require zero. It is not
an eligibility, oracle, ticket-size, impact, balance or simulation gate.

Local verification: `npm run test:aerodrome-codec` passes strict TypeScript and
12 offline tests, including independent ethers ABI encoding/decoding of buy,
sell, approval and revoke for all four stocks. Existing Base swap regressions,
stock admission and five-stock web/API/iOS parity checks pass, as do production
build and lint. The test is included in CI; the run IDs above predate it.

`scripts/check-aerodrome-venue.mts` verified deployed code, both immutable
factory references, router WETH9 and registered tick spacing at Base block
50916097. Evidence: `evidence/2026-09-05-aerodrome-venue.json`. This read-only
observation records runtime code hashes and grants no execution admission.

Remaining integration: route-aware quotes and allowances/simulation in the
server; venue-aware quote and approval context in both web execution screens;
an independent native decoder and wallet journey; fresh pool/oracle/transfer
checks; then synchronized catalog admission. The codec is not imported by an
execution endpoint or wallet UI. No additional stock can currently be traded
through Bobby as a consequence of this change.

Production database verification is still pending. Supabase OAuth succeeded,
but the current task has no Supabase tools loaded. No production query,
migration, deployment, signature or trade occurred in this work.
