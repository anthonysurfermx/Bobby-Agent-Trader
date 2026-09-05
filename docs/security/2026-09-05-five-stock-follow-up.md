# Five-stock candidate and native simulator verification

Release status: **NO-GO for production; twenty-stock integration incomplete.**

## Changes

The shared web/API list and the native picker/signing list now include SPCXc,
using the official Coinbase B20 address and Chainlink feed. Its independent
ticket cap is 10 USDC; the other four stocks retain their existing limits.
The native cap is local policy, not a server-provided permission to increase it.
Both clients additionally bind USD notional to the validated stablecoin amount.
The browser now refuses absent or non-finite price-impact measurements.

The change preserves Coinbase B20 for Builder Quest and does not enable the
execution feature flag. There was no wallet signature, approval, swap, production
deployment or migration. Ondo candidates are still excluded from the Base rail.

## Live read evidence

The production quote implementation returned a 10 USDC SPCXc buy quote with
0.6151% impact, and an independent sell quote with 1.0011% impact. Both references
were usable, issuer/transfer pauses were false and token/registry multipliers
agreed. The buy differed from the oracle by 2.1520%; the server's existing warning
is preserved. These measurements are point-in-time quotes, not guaranteed prices
or sequential executions. They do not prove a particular wallet's eligibility.

`evidence/2026-09-05-spcx-admission.json` contains the complete quote responses,
timestamp, caps and reference metadata. Both responses contain no transaction.

## Native verification

The clean iOS branch is `codex/stock-expansion-ios`, commit `9e390a1`, based on
`91ab7c2`. It includes the preceding issuer-oracle fix and the five-stock change.
Unrelated changes in the existing iOS worktree were not imported or committed.
The complete native patch is `evidence/2026-09-05-ios-five-stocks.patch`.

An unsigned simulator build failed inside Reown with keychain OSStatus -34018.
The correctly signed simulator build passed **20/20 BobbyTests**, with zero
failures. This runs in the app host with the Reown SDK initialized; it is not a
real-wallet or physical-device transaction test. The separate pure-guard macOS
harness also passed 20/20, but that is supplemental evidence.

Reproduce after creating/booting a suitable simulator and generating the project:

```sh
xcodegen generate --spec ios/Bobby/project.yml
xcodebuild test -project ios/Bobby/Bobby.xcodeproj -scheme Bobby \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -parallel-testing-enabled NO -only-testing:BobbyTests \
  CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-
```

The successful run used simulator `8FD146F1-BD78-4E51-8435-D3FE66895E14` and
`/tmp/bobby-stocks-ios-signed.log`. `-only-testing:BobbyTests` intentionally
does not claim execution of the screenshot/UI suites.

## Web/API verification

Swap, admission, ticker, remediation, RPC-redaction, MCP payment transport, API
security, protocol write safety and asset discovery regressions pass. Build
(including API typecheck) and lint pass. The parity checker compares the actual
native picker and address registry against the shared web/API list:

```sh
npx tsx scripts/check-stock-client-parity.mts /path/to/ios/Bobby
```

No Solidity or schema changes were made in this follow-up; the previous 286-test
Foundry result and unchanged runtime hash remain scoped to the same contracts.

## Remaining scope

Five Coinbase stocks now have an implemented candidate route. The other five
commercial Coinbase listings have no direct USDC pool in our checked Uniswap V3
fee tiers. They require another venue or future liquidity. Ten additional Ondo
identities are recorded, but an Ethereum/issuer adapter and its validations are
still missing; adding addresses to the Base router would not implement them.

Ondo's current [API overview](https://docs.ondo.finance/api-reference/overview)
describes a separate attestation/contract integration. Its
[eligibility requirements](https://docs.ondo.finance/ondo-stocks/eligibility)
also differ from Coinbase's and need their own enforcement before admission.
Issuer authorization alone is not evidence of a completed integration.

GitHub authentication remains invalid, so final candidate CI cannot be published
from this session. Actual-history Supabase migration preflight/cutover and the
independent third release review remain outstanding. The native unit test result
does not turn these unresolved requirements into GO 3/3.
