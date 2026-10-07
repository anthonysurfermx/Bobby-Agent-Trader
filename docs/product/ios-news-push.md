# Localized iOS product news

Existing iOS installs can receive the language announcement after updating to build 66 or later, signing in and explicitly enabling **Bobby news** in their profile. iOS notification permission and weekly Pro briefing consent do not imply product-news consent. Accounts start with news disabled; free and Pro accounts use the same news flow.

## Audience and messages

The admin **Notificaciones** tab previews consenting production iPhones, fixed translated copy and configuration readiness. It supports German, French, Italian, Spanish, Portuguese and Brazilian Portuguese. The saved Bobby language determines the message; country is an optional additional filter, observed from the connection when settings are saved. An unknown country is included only without a country filter.

Campaign `bobby-languages-2026-10` has deterministic groups for each set of country/language/build filters. A group freezes its recipients when first prepared. All groups share an installation-level uniqueness constraint for this announcement, so separate DE/FR sends and a later overlapping general send cannot notify an installation twice. Repeating the same group resumes pending work. Newly registered users require a new group or a future announcement; an existing group is never enlarged.

Tests target one selected account, using a persistent UUID. Retrying the same UUID resumes its frozen test. **Nueva prueba** creates an explicitly new test.

## Activation and verification

Apply `supabase/bobby-protocol/supabase/migrations/20261007171622_ios_news_push.sql`, then `20261007172958_ios_news_push_locale.sql`, then `20261007180413_ios_news_push_country_consent.sql`, before deploying the API from main. New tables and RPCs are available only to `service_role`; client identity comes from verified Apple/Google authentication. Settings updates use revision checks and explicit consent version 1. The exact regional locale is retained, and repeating an unchanged preference preserves its revision and consent timestamp.

Country is a coarse connection inference, not nationality or residence. Retain it only while current news consent is on; changing language with news off does not collect it, and withdrawal clears country, source and observation time. The native consent notice, shipped manifest, online App Store Connect declaration and six-language privacy policy must disclose this optional marketing use. See `docs/app-store/build-66/APP-PRIVACY-ANSWERS.md` for the release mapping and pending external checks. Campaign history remains for audit/deduplication until account deletion; removing country from preferences does not erase previous campaign participation.

Production needs `BOBBY_APNS_KEY_ID`, `BOBBY_APNS_TEAM_ID`, `BOBBY_APNS_PRIVATE_KEY` and `BOBBY_PUSH_TOKEN_KEY` (base64-encoded 32-byte encryption key). Keep private values in the platform's secret storage, never in source or logs. The APNs topic defaults to `xyz.bobbyprotocol.bobby`; allowed environments default to production. Use a dedicated Apple Push credential restricted to Bobby's topic and production environment.

`BOBBY_NEWS_PUSH_ENABLED=on` activates news dispatch. Missing credentials or a disabled flag leave settings readable and writable but prevent sending. Creating an Apple credential requires explicit authorization; compiling or signing the app does not configure the server connection.

For the physical test, install the compatible build, sign in, enable Bobby news and allow iOS notifications. Select that account in the panel and send a test while the app is in the background. Verify a banner in the chosen language, then tap it to open Bobby's language settings without overwriting the user's language choice. Repeat with the same UUID to verify no duplicate. Only after physical receipt is verified should the launch announcement run.

Apple HTTP 200 is recorded as accepted, not as physical receipt. An interrupted sender or ambiguous transport result becomes unknown and is never automatically resent. Consent, language, installation binding and OS permission are rechecked immediately before dispatch. A worker invocation handles at most 100 devices within a 35-second budget; repeat the same group to continue pending work or a safe explicit rejection retry. No automatic campaign schedule is installed.

## Local checks

`npm run test:push-news` covers API authentication, consent/revisions, payloads, fail-closed source validation and worker delivery decisions. `DATABASE_URL=postgres://…@127.0.0.1:…/… npm run test:push-news-pg` uses synthetic local fixtures, rejects remote databases and verifies migration privileges, transactional claims, account rebinding, withdrawals and cross-country deduplication. Both run in CI; the PostgreSQL suite has its own database.

Run `npm run build` and `npm run lint -- --quiet` before pushing. Native NewsPush, PushRegistrar, BriefingsExperience and V18Wire tests cover consent, account/locale changes and notification navigation; simulator success does not establish physical APNs receipt or TestFlight availability.
