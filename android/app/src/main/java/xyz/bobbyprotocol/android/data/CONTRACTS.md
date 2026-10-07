# Android data contracts

This native transport follows the release-54 iOS REST contracts, inspected at
`/Users/mrrobot/Documents/Codex/2026-10-02/pa/work/bobby-release54` on 2026-10-03.
It does not add backend routes or configure external services.

## Implemented contracts

- `bobby-asset-search`: POST questions/text in JSON only; browse query uses language/locale/country. A null resolution never guesses an instrument.
- `voice-tool`: `get_market`; `okx-candles` and `stock-candles`: actual OHLC rows, finite numbers, chronological timestamps. Equities exclude unsupported 4H.
- `desk-debate`: native device UUID, truthful `x-bobby-platform: android`, current account bearer, one refresh on 401, NDJSON plus defensive SSE support. Quotas retain status/code/payload/retry-after. Truncated or partial replies fail rather than become NO TRADE.
- `bobby-voice-free`: bounded 800-character persona narration. Audio format/provider is verified. Playback belongs to native platform services.
- `bobby-access`: read access and RevenueCat entitlement refresh (`revenuecat-sync`). Google Play purchase authorization and setup are handled separately.
- `progress`: authenticated reads and a maximum of 50 queued events per POST. The actual Android platform is sent; event IDs and queue retention belong to the native session owner.
- `trader-land`, `memory`, `briefing-settings`, `briefings`, `briefing`, `briefing-voice`, `briefing-audio`: original authenticated JSON or private audio; UUID validation; settings CAS via If-Match; voice idempotency keys.
- `account`: version 2 deletion preflight. Apple identities requiring native Apple reauthorization return a structured failure on Android rather than deleting without it.
- Google and Apple Supabase browser OAuth: PKCE, encrypted pending verifier, ten-minute callback expiry, duplicate-key rejection, exact `bobby://auth/callback` scheme/host/path, state binding, no implicit token fragments, epoch isolation. The caller opens an external browser or Custom Tab.

## Security integration

`allowsExternalProcessing` defaults to false. The native consent owner must assign
a callback that reads its current risk/processing consent. Private questions,
narration text, and memory calls are refused locally while consent is absent.
Native memory capture has an additional encrypted, account-scoped opt-in that
defaults off and cannot be enabled before processing consent. Pausing or forgetting
memory revokes this local choice before any network call, including offline.

Session tokens and OAuth verifiers are AES-GCM encrypted with a non-exportable
Android Keystore key. Session replacement/deletion, epoch changes, and OAuth
attempt cleanup persist atomically. Public identity StateFlow contains no tokens.
Private responses are discarded after an account epoch changes, including logout
and signing back into the same account. An offline refresh preserves the session;
a rejected refresh ends it. No tokens, questions, or provider responses are logged.

The Android manifest must disable backup (or exclude `bobby.secure.v1.xml`) and
register only the exact callback intent filter. Release configuration comes from
BuildConfig public client fields, never secret service-role credentials.

## External dependencies and verified source gaps

The current root checkout lacks many of the above production routes; the inspected
release-54 backend is their source contract. A compiled Android client does not
prove those routes are deployed or that Google/Apple Auth is enabled.

In the inspected release-54 source:

- `api/_lib/access.ts` accepts Android metered-read identity.
- `api/progress.ts` accepts only `ios` and `web` in its POST schema.
- `api/_lib/user-memory.ts` enables capture only for `ios` and `web`.
- `api/_lib/trader-land.ts` uses an `ios | web` close/review platform type.
- Briefing device registration supports APNS tokens and environments. Android FCM
  device binding is not implemented by this client because no FCM contract exists.

The backend must add truthful Android support before progress writes, native
memory capture, or land review work end to end. Existing GET/inbox/settings/audio
contracts remain useful. Supabase Auth must allow `bobby://auth/callback` with the
state-bearing query redirect and enable the chosen provider. No remote settings,
purchase, deletion, or production data mutation was performed during this work.

The local thesis/history ledger belongs to the native Núcleo session and must be
scoped to the identity (or a separate guest namespace). After `deleteAccount`, its
caller must forget only the deleted account's local records.
