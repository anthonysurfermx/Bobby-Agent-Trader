# Bobby + ChatGPT: implementation and local validation

Implemented on 4 October 2026, on branch `codex/chatgpt-financial-context`.
Baseline: `e6123bc30e2705f263922b25aeee9f6fb923f464` (the checkout containing current Android/iOS parity).
Working source: `/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/chatgpt-context`.
The original iCloud checkout was found under `/Users/mrrobot/Documents/Documentos - MacBook Pro F Society/GitHub/Bobby-Agent-Trader`.

## What users can do

- Open **ChatGPT context** from the Bobby profile on web, iOS or Android.
- Choose financial facts in a ChatGPT conversation; paste the narrow JSON export into Bobby, or let the connector prepare a pending draft.
- Review, select and correct each fact before approving the save to their signed-in Bobby account.
- Inspect, correct or delete those facts across clients, including while sharing is paused.
- Select one or more dated saved Bobby recommendations before copying/exporting them to ChatGPT, or request them through the authenticated connector. Web sharing selects none by default.
- Approve OAuth permissions, cancel the request with a validated denial callback, and later revoke the connection in Bobby.

Financial memory begins off. The independent financial preference and global account-memory pause both apply. Native recommendation capture also requires that device's existing per-account question-memory consent; web capture uses account-level memory controls. Approving OAuth does not enable financial memory. Pause blocks new imports, draft preparation, snapshot saving and ChatGPT reads/sharing while retaining private inspection, correction and deletion. Pausing closes an open web export and prevents copy/download until sharing is enabled again.

Bobby does not obtain the user's complete ChatGPT history. Reported facts are not verified transactions. Imported context is available for review and authorized recall; it does not change Bobby's market verdict or execution. Saved recommendation snapshots are previous generated analyses. `asOf` dates the market evidence; the app's `createdAt` and the connector's `storedAt` date server storage and do not prove delivery, viewing or physical-device presentation. The account retains up to 100 unexpired snapshots for 90 days; the app shows the newest 20 and a connector request can return up to 20, filtered before the limit.

## Verification

| Area | Result | Evidence and limits |
| --- | --- | --- |
| Financial API and local schema | 45 checks passed | Authentication, explicit consent, validation, pause, protected purge, minimal recommendation output and filtered account lookup. |
| Financial storage | 174 checks passed with real local PostgreSQL | Migration replay, Supabase-style privilege defaults, account isolation, simultaneous imports at the fact cap, duplicate requests, expiry, both pauses, cascade, asset forgetting, OAuth cleanup and filtering before the result limit. |
| OAuth/MCP/HTTP handler | 234 checks passed | 188 offline/handler/MCP checks plus 46 real PostgreSQL checks: PKCE, one-use exchange, replay, consent versions, expiry, revocation, ignored OAuth extensions, strict known fields, signed-out/disabled cancellation without grants, transport validation and dated minimal output. |
| API security | 51 checks passed | Existing API-origin, authorization and rate-limit regressions, including native headers. |
| Existing memory | 128 checks passed in the earlier local run | Native per-account opt-in and validated recommendation capture; not rerun for the final documentation update. |
| Desk analysis | 353 checks passed in the earlier local run | Existing analysis regression suite; not rerun for the final documentation update. |
| Web | Both browser fixture suites passed | Review/edit/select/consent/import, drafts, correction, delete-all clearing unsaved JSON, one/two recommendation selection with distinct dates, pause closing and blocking export, private management while paused, explicit conflict review/retry, account-change and delayed-reply isolation. OAuth cancel with/without an account, invalid callback refusal, approval locking and sign-in return with extension parameters. Six languages at 390 px; all remote requests mocked. |
| Build and lint | Full `npm run build` and `npm run lint` passed | Production source guard, API/admin TypeScript, API ESM import check, Vite/PWA build. Full ESLint: 0 errors, 503 warnings. |
| iOS | Simulator build and 12 tests passed | 6 parser/locale-amount tests plus 6 state/isolation/error/connection tests. No physical-device or TestFlight acceptance claim. |
| Android | Debug Kotlin compile and 11 tests passed | 7 financial policy/parser/error/connection tests plus 4 account-fence tests. No physical-device acceptance claim. |

The earlier separate full frontend TypeScript check reported existing errors in MascotScene and useBobbySession; it is not part of the successful standard build claim. The existing iOS chart browser test explicitly uses `window.NucleoReadModel`, and its earlier 126 browser assertions passed.

### Local receipts

These temporary receipts describe author-executed local checks and are not bundled deployment artifacts:

- `/private/tmp/bobby-chatgpt-server-pg-financial-remediation.log`: 174 financial PostgreSQL checks.
- `/private/tmp/bobby-chatgpt-server-pg-oauth-remediation.log`: 234 combined OAuth checks; the accompanying server remediation report records the 188 + 46 split.
- `/private/tmp/bobby-chatgpt-server-api-security-remediation.log` and `/private/tmp/bobby-chatgpt-server-financial-offline-remediation.log`: 51 and 45 checks respectively.
- `/private/tmp/bobby-context-native-decimal-ios.log`: 12 simulator tests; Android `app/build/test-results/testDebugUnitTest/TEST-…FinancialContextPolicyTest.xml` and `TEST-…AccountFenceTest.xml`: 7 + 4 tests, zero failures/errors.
- `/private/tmp/bobby-financial-context-oauth-followup-browser.log` and `/private/tmp/bobby-chatgpt-connect-remediation-browser.log`: final mocked browser suites.
- `/private/tmp/bobby-chatgpt-final-full-lint.log` and `/private/tmp/bobby-chatgpt-final-full-build.log`: complete repository lint/build after remediation.
- `/private/tmp/bobby-chatgpt-final-validation-receipt.json`: final documentation/check receipt and evidence limits.

Tests are wired into the repository CI. [Connector details and activation](chatgpt-connector.md) describes endpoints, scopes, retention and deployment checks.

## Independent review and Codex remediation

Claude and DeepSeek independently read static snapshots of candidate `cdac87d6`, before the final remediation. Their reports did not execute tests or validate production. Their review evidence is separate from Codex's subsequent triage, reproduction, implementation and executed regression receipts; a static finding or a model's review result is not a release approval.

Codex corrected confirmed findings covering recommendation selection and pause behavior, unsaved-source erasure, conflict recovery, native revocation/error handling and decimal amounts, OAuth cancellation/locking/sign-in return, extension compatibility, cleanup, storage timestamps and privacy copy. A final Codex static read of the current API, SQL, web and native diff found no confirmed grave regression or security blocker; it did not execute another suite or prove a live connector connection.

An earlier Codex review reproduced a recommendation lookup defect: an older retained NVDA recommendation disappeared from a symbol-specific query when twenty newer BTC recommendations preceded it. The connector now filters the full retained history by account and symbol in a service-only database function before applying the requested limit. The profile's newest-twenty listing stays unchanged.

The regression passes against real local PostgreSQL, including a second account with its own NVDA recommendation, both memory pause settings, expired entries, invalid limits, an invalid symbol and a wallet-only identity. Offline API and MCP checks confirm the filtered query, internal identifier removal and `storedAt` storage timestamp. OAuth denial works without a session and with `BOBBY_CHATGPT` off, after first-party origin and complete request/callback validation; it returns `access_denied`, unchanged `state` and canonical `iss`, creating no authorization code or grant. The existing protected daily financial cleanup also invokes bounded OAuth cleanup, retaining recent records for replay protection.

## Preserving and activating the change

Preserve the final reviewed tree as a commit or regenerated portable feature patch relative to the baseline above before moving the original project back to local storage. This temporary checkout shares Git objects and installed dependencies with the original iCloud checkout; moving that original changes those local references. Earlier review snapshots and patches do not include later remediation unless regenerated.

Publication is pending. Activation requires applying the two migrations in order, deploying the app/API, enabling the documented switches, and registering the connector in ChatGPT. Validate actual discovery, OAuth approval/cancellation, selected-fact review, recommendation recall, account isolation, pause and revocation on the deployed domain and physical clients before announcing availability. The checks recorded here did not apply production migrations, publish a deployment or register a ChatGPT connector. App-directory review/distribution and physical-device acceptance remain separate evidence.
