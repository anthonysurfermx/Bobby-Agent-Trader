# Bobby ↔ ChatGPT: selected financial context

The app lets a signed-in user transfer selected financial facts into Bobby, review them, correct them and erase them. The MCP connector can prepare a pending import and read that account’s approved context and previous Bobby analyses. It never receives ChatGPT’s complete history and it does not synchronize verified bank transactions.

## Current flow

1. The user chooses which financial facts to share in the current ChatGPT conversation.
2. ChatGPT calls `bobby_prepare_financial_context` with at most 20 small typed facts. Each summary is one line, at most 240 characters. Amounts need a currency. Unknown dates/amounts are omitted.
3. Bobby creates a temporary draft tied to the OAuth account, returning a review URL. This call does **not** save the facts as memory.
4. The user opens `/chatgpt?draft=…`, signs in to the same Bobby account and explicitly reviews/approves the facts. Another account cannot consume the draft.
5. The user can inspect, correct or delete individual facts, pause sharing, or erase all financial context including saved recommendation snapshots. Erasing an account also cascades its OAuth connections, authorization codes and tokens.

The standalone app import uses the same narrow JSON contract and review step. It does not upload a transcript to a model for extraction. Financial memory defaults to **off** and needs a separate, explicit opt-in in Bobby; approving an OAuth connection does not silently enable it. A correction's approval button explicitly saves the revised fact to the account for authorized recall when sharing is enabled.

While paused, the connector refuses context and recommendation reads and cannot create a draft; new imports and recommendation capture also stop. Bobby retains private inspection, correction and deletion controls. The web closes an open recommendation export, clears its selection and disables sharing/copy/download. Resuming does not restore that old export. Users must select recommendations before reviewing/exporting them; none are selected by default on web. A successful erase-all clears unsaved pasted JSON, reviews, corrections and open exports as well as server records. Connecting does not grant access to unrelated conversations or financial providers.

## OAuth and MCP endpoints

- MCP resource: `https://bobbyprotocol.xyz/api/chatgpt`.
- Protected-resource metadata: `/.well-known/oauth-protected-resource/api/chatgpt`.
- Issuer: `https://bobbyprotocol.xyz`.
- Authorization-server metadata: `/.well-known/oauth-authorization-server`.
- Consent UI: `/chatgpt/connect`.
- First-party consent decision: `POST /api/chatgpt?op=authorize` with the validated OAuth fields and `approved: true` or `false`.
- Dynamic registration: `POST /api/chatgpt?op=register`.
- Code exchange: `POST /api/chatgpt?op=token` (JSON or form URL encoded).
- OAuth token revocation: `POST /api/chatgpt?op=revoke`.
- Account connection status/revocation: `GET /api/chatgpt?op=connection`, `POST /api/chatgpt?op=revoke` with the app’s authenticated first-party request (or `DELETE …?op=connection`).

Supported scopes:

| Scope | Permission |
| --- | --- |
| `bobby.context.read` | Read reviewed financial context and saved prior educational analyses with their market/storage dates. |
| `bobby.context.write` | Prepare temporary selected-fact drafts that require approval in Bobby. |

Authorization-code grants use PKCE **S256 only**. Codes expire after 5 minutes and are consumed atomically once; a correctly bound code replay revokes its issued token. Opaque access tokens expire after 1 hour. Only SHA-256 hashes of codes and tokens are stored. Tokens are bound to the registered client, the verified account, resource, issuer, scopes and the current unrevoked consent version. Reconsent invalidates earlier tokens. Refresh tokens and client secrets are not issued; users reconnect after expiry.

The default redirect is an exact match for `https://chatgpt.com/connector_platform_oauth_redirect`. Success responses include `code`, the unchanged `state` and the canonical `iss`. A callback-ID-specific URI can be configured with `BOBBY_CHATGPT_REDIRECT_URIS` as a comma-separated exact HTTPS allowlist. There are no host-suffix matches, callback wildcards, arbitrary redirect URLs or server fetches of client metadata. Callback credentials and invalid known fields are rejected. Unknown OAuth/registration extension fields are ignored without storage, external fetching or expansion of permissions; the financial input schema remains strict.

**Cancel** submits `approved: false` with a first-party origin and the complete known OAuth request. It works before sign-in and with `BOBBY_CHATGPT` off. The server validates the client, registered callback, state, resource, PKCE and requested scopes before returning `error=access_denied`, unchanged `state` and canonical `iss`; it creates no authorization code or grant. Invalid/untrusted requests do not redirect externally. The web verifies exact callback origin/path, HTTPS, response keys, state and issuer before navigating. Both decision buttons remain locked after successful approval/cancellation until unload; approval failure can be retried. Sign-in preserves only allowed OAuth/UI query fields, discards extension fields and rejects duplicate parameters before storing an internal return path.

MCP uses stateless JSON streamable HTTP with `initialize`, `ping`, `tools/list`, `tools/call` and notifications. It accepts protocol versions `2025-06-18`, `2025-03-26` and `2024-11-05`; it does not hold sessions or use server-initiated events. It handles one JSON-RPC envelope per request, validates required initialization fields, and rejects malformed/null/fractional request IDs. A 401 advertises protected-resource metadata. Tools are filtered by the actual token scopes and calls recheck them. Recommendation symbols accept ASCII case and normalize to uppercase before account-scoped lookup. Financial tool input errors explain the correction needed without writing a draft.

## Privacy and untrusted data

- Model input never selects an account, supplies an access token, or requests a raw transcript/history array. Account identity comes only from the server-verified OAuth grant.
- No original question, raw conversation, private key, credential, account/card identifier or provider payload is saved by these tools. The shared schema rejects unknown fields and common sensitive identifier formats.
- Fact summaries and prior analyses are explicitly marked as untrusted data. Tool descriptions/results prohibit interpreting them as instructions. They do not reach Bobby’s analysis model or change its verdict, sizing or execution.
- Saved facts are `user_reported`, never verified movements. Previous analyses preserve their `asOf` market-evidence time and may be stale. MCP returns `storedAt`, mapped from the internal snapshot `createdAt`; this is storage time, not proof of delivery/viewing. The app/manual export keeps `createdAt` and labels it as saved.
- Pending drafts are not returned by read tools. The app may display them only to their owning account for review.
- The tables and RPCs enable RLS and revoke direct access from `public`, `anon` and `authenticated`; server requests use the existing Bobby service role. Logs contain no personal facts, identities, codes or tokens.
- Revocation remains available even when the connector feature flag is off. It disconnects access without erasing reviewed financial facts; the user can erase those separately in Bobby.

## Activation and validation

Apply `20261004160000_financial_context.sql` and `20261004161000_chatgpt_oauth.sql` to the intended Bobby data project in order. The connector requires `BOBBY_CHATGPT=on`, the existing Bobby Supabase service-role configuration and the existing account auth configuration. No new signing secret is required. Discovery, validated cancellation and account revocation work with the feature switch off; new grants and connector actions fail closed.

Recommendation capture obeys the existing `BOBBY_MEMORY=on` switch, financial-memory preference and account-memory setting. Native capture additionally needs that device's separate per-account question-memory opt-in; web uses the account-level controls. Financial memory starts off on every account; the user enables it in the new profile screen. `financialMemoryEnabled` is that choice, `accountMemoryEnabled` is the global pause, and `enabled` is the effective combination. A global pause never prevents the user from independently disabling financial memory. Native context screens also expose connection status and explicit revocation, independently of the financial toggle.

Facts stay until the user deletes them, with a cap of 50 per account. Drafts expire after 24 hours, with at most 5 pending per account. At most 100 unexpired recommendation snapshots are retained for 90 days; the app returns the newest 20, while the connector returns up to 20 per request after account/symbol filtering. Older retained snapshots may not appear in an app listing. Forgetting an asset in the existing account-memory controls removes that account's saved recommendations for the symbol while retaining other assets/accounts and financial facts. The financial-context screen offers individual fact deletion and deletion of all financial context; it does not add an individual recommendation-delete button.

The protected daily Vercel job `/api/financial-context?op=purge`, using the existing `CRON_SECRET`, removes expired drafts, snapshots and idempotency records in bounded batches of up to 5,000. It also invokes service-only OAuth cleanup: codes expired more than 30 days ago are removed with their tokens; old revoked connections and unused client registrations are removed when no dependent codes/tokens/connections remain. Recent OAuth records are kept for replay checks. Reads exclude expired data immediately; actual cleanup timing depends on successful cron execution. Local PostgreSQL checks prove cleanup-function behavior, not production cron scheduling.

Run `node --import tsx scripts/test-chatgpt-auth.mts`. Set `DATABASE_URL` to a **local scratch PostgreSQL** instance with the Bobby identity/role fixtures to additionally run actual concurrency, PKCE, expiration, account isolation, privilege, cascade and revocation checks. The script rejects remote database URLs. With no local database, the offline run explicitly reports the PostgreSQL checks as skipped; an exit code alone does not prove those checks executed. Run `scripts/test-financial-context-pg.mts` for the financial migration tests. Run full `npm run lint` and `npm run build` before committing/publishing.

The final local receipts record 174 financial PostgreSQL checks; 234 OAuth/MCP/handler checks (188 offline + 46 PostgreSQL); 51 API-security checks; 45 financial API/schema checks; 12 iOS simulator tests; 11 Android unit tests; both mocked browser suites; and complete lint/build. [Validation and review evidence](chatgpt-validation.md) separates these Codex-executed checks/remediation from Claude/DeepSeek's earlier static snapshot reviews.

The connector is not yet published or verified as a live ChatGPT connection. Local tests do not establish ChatGPT registration, OAuth completion on the deployed domain, app-directory distribution or physical-device acceptance. After an authorized deployment, verify discovery rewrites, register a ChatGPT connector, exercise real approval and cancellation, import one selected fact, approve it in the same Bobby account, retrieve a dated saved recommendation, test cross-account denial, pause sharing while keeping private management, and revoke the connection. Store those results as separate deployed/provider/device evidence.

Official integration references: [authentication](https://developers.openai.com/plugins/build/auth), [minimal task-specific inputs](https://developers.openai.com/plugins/plugin-guidelines#minimal-and-purpose-driven-inputs).
