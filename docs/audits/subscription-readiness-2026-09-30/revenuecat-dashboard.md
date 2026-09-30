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

## Apple configuration remains blocked

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
