# Subscription readiness remediation — 2026-09-30

## Resumen

Correcciones preparadas en la rama local `codex/subscription-readiness`. No se ha desplegado ni habilitado el cobro. RevenueCat ya está abierto y el catálogo de Test Store fue alineado y comprobado con el SDK. Sigue pendiente completar la credencial privada de Apple y configurar/probar el producto real en Apple Sandbox.

## Changes

- Native purchases require explicit Apple **and** RevenueCat server readiness. The purchase method refreshes readiness before presenting payment; unknown/unreachable state cannot authorize a purchase.
- Product selection matches the intended product identifier; a different current monthly package is not accepted.
- Only explicit server-confirmed Pro counts as purchase success. A missing access body cannot unlock Pro.
- Synchronization records successful confirmation only, deduplicates concurrent callbacks, retries transient failures up to three attempts and reconciles active entitlements at launch/login. Account-generation checks prevent stale purchase/restore results from confirming another session.
- Generic error copy no longer promises that nothing was charged when payment status is uncertain.
- Backend payment capability follows RevenueCat readiness. Subscription database failures propagate rather than treating an existing subscription as absent and overwriting it.
- Failed/malformed read metering returns 503 before AI invocation instead of allowing unmetered analysis. This deliberately trades temporary analysis availability for cost protection. Normal sign-in/subscription gates remain unchanged.
- A local SQL migration serializes the shared anonymous network quota before the device lock. It preserves existing rules, service-role execution and promotional-Pro logic. Production has NOT received this migration.
- Added an archive gate that requires the Apple public SDK key and linked, non-tracking Purchase History declaration for a paid release. It prints no keys.

## Verification

| Check | Result | Boundary |
|---|---|---|
| 10 / 100 / 1,000 synthetic subscription lifecycles | 7,770 assertions passed | Actual backend modules; mocked auth, RevenueCat HTTP and persistence |
| Database failure preserving existing subscription | Passed | Mocked database read failure; no overwrite |
| Read meter HTTP failure, transport failure, malformed result | All return 503 before AI | Actual bundled handler; mocked HTTP; zero external AI calls |
| Readiness flags and normal access gates | Passed | Mocked bundled API handlers |
| 100 concurrent clients on shared network | Exactly 15 accepted in all three repeats | Local PostgreSQL, actual migration |
| 100 concurrent clients on same device / different networks | Exactly 3 accepted in all three repeats | Local PostgreSQL |
| 100 distinct networks/devices | 100 accepted in all three repeats | Local PostgreSQL |
| 100 concurrent reads from one free account | Exactly 10 accepted in all three repeats | Local PostgreSQL, paywall on |
| Migration execution permissions | anon false / authenticated false / service role true | Local PostgreSQL |
| Four native core contracts | Passed | Extracted actual Swift source + XCTest contract bodies; lightweight macOS assertion adapter, not an iOS XCTest run |
| Native subscription XCTest suite | 12 tests passed, zero failures | Fresh simulator run after disk space was freed; no real payment or UI lifecycle test |
| Archived build 1.5 (45) paid-release gate | Correctly failed | Actual archived Info.plist key empty; Purchase History omitted |

The concurrency regression uses 1,200 synthetic requests total. The PostgreSQL process was stopped after testing. Timings and synthetic account counts are not proof of production capacity or real Apple transactions.

## Remaining launch gates

1. RevenueCat: the project is verified in Chrome, the pro entitlement and bobby_pro Test Store offering are saved, and the SDK loads the USD 4.99 test package. Complete the Apple app credentials and verify the real product `xyz.bobbyprotocol.bobby.pro.monthly`, monthly offering and entitlement `pro`. Confirm the localized price in App Store Connect. The fixture's USD 4.99 price is not a verified selling price.
2. Configure the Apple **public** SDK key for the paid Release candidate. Server-only `REVENUECAT_SECRET_KEY` and webhook Authorization must stay outside source control. Keep the current free build disabled until the paid candidate is coherent.
3. Declare linked Purchase History for App Functionality in the paid candidate manifest and App Store Connect, reconcile the SDK privacy report and update the public privacy policy as needed. Build 45 intentionally documents paid purchases as disabled; that document must change together with enabling payments.
4. Apply the reviewed migration and backend changes through the normal release process. All current fixes remain local; published behavior is unchanged.
5. Sandbox on the actual paid candidate: fresh/returning Apple login; purchase → entitlement → database → access; cancellation/pending; restore after reinstall and on second device; renewal, cancellation until expiry, expiry, refund/revocation; interrupted network after payment; authenticated webhook retries/idempotency. Do not charge a production subscription to test this.
6. Resolve general free-read policy and margins. `BOBBY_PAYWALL` remains unchanged/off. The legacy no-device compatibility path remains unchanged and can bypass general-read counting; decide its retirement separately. Premium-level consumption and general-read-before-premium accounting still need end-to-end validation.
7. Native subscription XCTest now passes after disk space was freed. A fresh paid archive and actual Sandbox lifecycle remain pending; the inspected archived build 45 still has payments disabled.

## Reproduction

From this checkout, compile backend modules with the repository esbuild binary (dependencies live at the primary checkout), using `--bundle --platform=node --format=cjs --packages=external` and output directory `/private/tmp/bobby-business-modules`:

- `api/_lib/revenuecat.ts api/_lib/user-identity.ts` together.
- `api/_lib/access.ts api/voice-tool.ts api/bobby-access.ts` together (the access module then lands in `_lib/access.js`).

Set `NODE_PATH=/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/node_modules` when running `scripts/test-revenuecat-lifecycle.cjs` and `scripts/test-subscription-api.cjs`. These harnesses mock all HTTP; unrecognized routes fail.

`python3 scripts/test-subscription-core.py` compiles isolated pure source and runs four contracts. `scripts/test-subscription-quota.py` requires a disposable, pre-seeded localhost PostgreSQL instance on port 55327 with the original metering tables/functions; it truncates synthetic read data and must never target production. The script applies the local migration to that instance only.

For a fresh archived app: `python3 scripts/check-ios-subscription-release.py /absolute/path/Bobby.app`. Exit 1 is intentional if paid release requirements are missing. This gate does not verify Dashboard/Apple/server connectivity.

## Evidence

`revenuecat-simulation.json`, `quota-regression.json`, `quota-tests.txt`, `api-regression.json`, `swift-core-tests.txt`, `archive-commerce-gate.json`, `revenuecat-dashboard.md`, `revenuecat-sdk-probe.txt`. The earlier disk-related failure log remains at `/private/tmp/bobby-subscription-tests.log`. Successful native rerun: `native-subscription-tests.txt` (full log `/private/tmp/bobby-subscription-tests-current.log`).

**Status: local repairs verified within the boundaries above; paid production release remains blocked on configuration, privacy updates and actual Sandbox acceptance.**
