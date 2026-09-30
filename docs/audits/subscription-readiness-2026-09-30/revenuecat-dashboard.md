# RevenueCat dashboard verification — September 30, 2026

Project: Bobby: Think Before You Trade (`2d9c569b`), verified in the user's authenticated Chrome session.

## Before remediation

- Only Test Store configured; no saved Apple app configuration.
- Default offering contained sample `monthly`, `yearly`, `lifetime` products.
- Existing entitlement `bobby_think_before_you_trade_pro` did not match the native/server `pro` identifier.
- Zero active subscriptions, no live transactions, three recent customers in the overview. Integrations showed Active 0.

## Changes saved and visibly verified

- Created entitlement **pro**, display name **Bobby Pro**: `entlcd9058220e`.
- Created **Test Store only** auto-renewing monthly product `xyz.bobbyprotocol.bobby.pro.monthly`, display name `Bobby Pro Monthly — Test Store`: `prod17c26070db`.
- Test price USD **4.99/month**, no trial. This is not the App Store selling price and cannot charge Apple customers.
- Attached that product to `pro`; confirmed persistence after reloading the product page.
- Created offering **bobby_pro**, display name **Bobby Pro — Monthly**: `ofrng5480404f89`, with exactly one `$rc_monthly` package mapped to the correct Test Store product. The original default offering was not modified or deleted. Native exact-product fallback can find the new offering; real Apple mapping remains pending.

## Initial Apple configuration handoff

Prepared a separate Chrome tab with bundle ID **xyz.bobbyprotocol.bobby**. Save was rejected because the In-App Purchase Key ID and Issuer ID are required. No Apple app configuration was saved.

User handoff requested: complete the In-App Purchase `.p8` upload, Key ID and Issuer ID directly in RevenueCat and save. The file is a private credential; no key was copied into source, chat or this report. Browser policy requires the user to handle creation of authentication credentials. Uploading the key gives RevenueCat access to verify App Store transactions.

Apple creates this key under App Store Connect → Users and Access → Integrations → In-App Purchase. RevenueCat's official instructions: https://www.revenuecat.com/docs/service-credentials/itunesconnect-app-specific-shared-secret/in-app-purchase-key-configuration

## Remaining

- Saved Apple configuration and credential validation.
- Real App Store product metadata/price, Apple product → pro and bobby_pro mappings.
- Release SDK public key and matching Purchase History declaration.
- Server subscription-read secret and authenticated webhook configuration (no active integrations observed).
- Actual Apple Sandbox lifecycle acceptance; the changes above are catalog preparation only, not a purchase test.

## Live SDK check

Launched the newly compiled Debug app on the temporary QA simulator with `-revenuecat-probe bobby-subscription-audit-20260930`. RevenueCat configured successfully, logged into that synthetic Test Store ID and returned two offerings. The exact-product fallback selected a loaded package priced **US$4.99 / month**. The original current/default offering still contains sample prices US$9.99 / US$79.99 / US$99.99; the app's intended package came from the new bobby_pro offering. No purchase was attempted; entitlements remained empty. Evidence: `revenuecat-sdk-probe.txt`.

Fresh native `BobbyAccessTests` suite: **12 tests passed, zero failures**. The earlier disk blocker is resolved. This does not establish Apple Sandbox purchase success or a paid Release build.

## Apple catalog follow-up — user completed credentials

- Reopened saved Apple app `app25c54ce720`: bundle ID `xyz.bobbyprotocol.bobby`, **Valid credentials** visibly confirmed. Private key contents were not read or copied.
- App Store Connect initially had no subscription groups or products for Bobby (Apple app ID `6804460489`).
- Created draft subscription group **Bobby Pro**, group ID `22428158`.
- Created draft **Bobby Pro Monthly**, Apple ID `6817775464`, product identifier `xyz.bobbyprotocol.bobby.pro.monthly`, duration **1 month**.
- The user explicitly approved **USD 4.99/month**. Saved Apple-calculated regional prices, including MXN 99, BRL 29.90 and EUR 5.99 in Portugal. Prices for 175 regions were calculated; this does not make the product available in those regions.
- Saved product display name **Bobby Pro** and descriptions in English (U.S.), Spanish (Mexico), Portuguese (Brazil). Accents verified in the saved descriptions.
- Saved **Bobby Pro** subscription group localizations in the same three languages, preserving the existing app name.
- Saved subscription availability for **174** existing regions, matching the app's verified availability. **China mainland** excluded and automatic future-region expansion disabled, both visually verified before saving.
- Created corresponding RevenueCat **App Store** product `prod5df5b2658e`; reloaded product page confirms **pro** entitlement and **bobby_pro** offering associations. `$rc_monthly` now maps both Test Store and Apple products.
- RevenueCat store status shows **Could not check** because the separate App Store Connect API credential is not configured. The validated In-App Purchase credential and manual product mapping do not prove StoreKit product availability or purchase success.
- No App Review submission, production purchase, deployment, push or phone installation was performed.

## Amplitude preparation

Opened RevenueCat's Amplitude integration form and populated the default purchase lifecycle event names. The integration has **not** been saved: the Amplitude project, hosting region, production API key and separate Sandbox destination remain pending.

Keep subscriber attributes disabled, use the same pseudonymous account ID as RevenueCat, and isolate Sandbox events from production metrics. Before activation, confirm the exact Amplitude destination and transmission of account identifiers, subscription events, product IDs and purchase amounts. Do not include questions, market thesis contents, email, wallet addresses or balances.

Official integration reference: https://www.revenuecat.com/docs/integrations/third-party-integrations/amplitude

## Real Apple SDK catalog probe

Made a temporary copy of the freshly compiled Debug simulator app at `/private/tmp/bobby-apple-sdk-probe/Bobby.app`, supplied the Apple **public** SDK key through an environment value into only that copy's Info.plist and signed it ad hoc for the simulator. Source configuration, the existing archive and production were unchanged.

Launched with `-revenuecat-probe bobby-apple-catalog-audit-20260930` on the owned QA simulator. RevenueCat login succeeded and returned no active entitlements. Offerings then failed because **none of the registered products could be fetched from App Store Connect**. This is a concrete remaining release gate; a saved catalog is not a working StoreKit product. The product was newly created and remains Prepare for Submission. Product metadata, commercial agreements and propagation must be checked before retrying.

No purchase was attempted. The temporary simulator app was terminated and the simulator shut down after the probe.

## Verified commercial blocker

Opened App Store Connect **Business / Agreements**. **Paid Apps Agreement: Pending User Info**; Free Apps Agreement: Active. Apple explicitly requests a bank account and missing tax information for the **U.S.** and **Mexico** questionnaires. No bank account was listed. No sensitive bank/tax data was entered, no agreement accepted, and no financial action performed.

The user must complete these financial/tax steps. The browser confirmation policy requires handoff for financial actions and sensitive high-impact decisions. The Business page was left open and the user was asked to finish the missing information before the real Apple SDK product probe is repeated. This is a verified commercial release blocker; the SDK failure may also involve new-product propagation and incomplete review metadata, so agreement activation alone is not proof of purchase readiness.
