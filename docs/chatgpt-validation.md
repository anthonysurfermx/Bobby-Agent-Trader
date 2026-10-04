# Bobby + ChatGPT: implementation and local validation

Implemented on 4 October 2026, on branch `codex/chatgpt-financial-context`.
Baseline: `e6123bc30e2705f263922b25aeee9f6fb923f464` (the checkout containing current Android/iOS parity).
Working source: `/Users/mrrobot/Documents/GitHub/Bobby-Agent-Trader/chatgpt-context`.
The original iCloud checkout was found under `/Users/mrrobot/Documents/Documentos - MacBook Pro F Society/GitHub/Bobby-Agent-Trader`.

## What users can do

- Open **ChatGPT context** from the Bobby profile on web, iOS or Android.
- Choose financial facts in a ChatGPT conversation; paste the narrow JSON export into Bobby, or let the connector prepare a pending draft.
- Review, select and correct each fact before approving the save to their signed-in Bobby account.
- Inspect, edit, pause or delete those facts across clients.
- Bring dated saved Bobby recommendations back to ChatGPT, manually or through the authenticated connector.
- Approve OAuth permissions and later revoke the connection in Bobby.

Financial memory begins off. The independent financial preference and global account-memory pause both apply. Native recommendation capture also requires that device's existing per-account question-memory consent. Privacy controls remain accessible while memory is paused.

Bobby does not obtain the user's complete ChatGPT history. Reported facts are not verified transactions. Imported context is available for review and authorized recall; it does not change Bobby's market verdict or execution. Saved recommendation snapshots are previous validated analyses, with separate market-data and storage timestamps.

## Verification

| Area | Result | Evidence and limits |
| --- | --- | --- |
| Financial API and local schema | 33 checks passed | Authentication, explicit review, validation, pause, protected purge and minimal recommendation output. |
| Financial storage | 122 checks passed with real local PostgreSQL | Migration replay, permissions, account isolation, concurrent imports, duplicate requests, expiry, pause and account cascade. |
| OAuth/MCP | 111 checks passed | 78 offline HTTP/MCP checks and 33 real PostgreSQL checks, including PKCE, one-use exchange, replay, consent versions, expiry and revocation. |
| Existing memory | 128 checks passed | Includes native per-account opt-in and validated recommendation capture. |
| Desk analysis | 353 checks passed | Existing analysis regression suite. |
| Web | Production build, API/admin TypeScript and ESLint passed | Browser fixture exercises review, editing, selection, consent, drafts, delete, pause, export, OAuth and delayed replies on account changes. Six languages checked at 390 px. All remote requests mocked. |
| iOS | Simulator build and 7 tests passed | Parser plus queued/late-response account isolation. No physical-device or TestFlight acceptance claim. |
| Android | Debug Kotlin compile and 9 tests passed | 5 financial parser tests and 4 existing account-fence tests. No physical-device acceptance claim. |

Full frontend TypeScript separately reports existing errors in MascotScene and useBobbySession; the feature files have no reported errors. The standard production build and full ESLint pass. The existing iOS chart browser test had an undeclared browser-global lint reference; it now explicitly uses `window.NucleoReadModel`, and its 126 browser assertions pass.

Tests are wired into the repository CI. [Connector details and activation](chatgpt-connector.md) describes endpoints, scopes, retention and deployment checks.

## Preserving and activating the change

The portable patch accompanying this report contains only this feature's changes relative to the baseline above. Apply it to that compatible checkout when moving the original project back to local storage. This temporary checkout shares Git objects and installed dependencies with the original iCloud checkout; moving that original changes those local references. The patch preserves the work independently.

Activation still requires applying the two new migrations in order, deploying the app/API, enabling the documented switches, and registering the connector in ChatGPT. Validate the actual OAuth and review flow on the deployed domain and on physical devices before announcing availability. No production database, deployment or ChatGPT registration was changed during this session.
