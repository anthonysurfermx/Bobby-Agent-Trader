# Bobby ↔ ChatGPT: selected financial context

The app lets a signed-in user transfer selected financial facts into Bobby, review them, correct them and erase them. The MCP connector can prepare a pending import and read that account’s approved context and previous Bobby analyses. It never receives ChatGPT’s complete history and it does not synchronize verified bank transactions.

## Current flow

1. The user chooses which financial facts to share in the current ChatGPT conversation.
2. ChatGPT calls `bobby_prepare_financial_context` with at most 20 small typed facts. Each summary is one line, at most 240 characters. Amounts need a currency. Unknown dates/amounts are omitted.
3. Bobby creates a temporary draft tied to the OAuth account, returning a review URL. This call does **not** save the facts as memory.
4. The user opens `/chatgpt?draft=…`, signs in to the same Bobby account and explicitly reviews/approves the facts. Another account cannot consume the draft.
5. The user can inspect, edit, pause sharing or erase financial memory in Bobby. Erasing an account also cascades its OAuth connections, authorization codes and tokens.

The standalone app import uses the same narrow JSON contract and review step. It does not upload a transcript to a model for extraction. Financial memory defaults to **off** and needs a separate, explicit opt-in in Bobby; approving an OAuth connection does not silently enable it. While paused, the connector refuses context and recommendation reads and cannot create a draft. Connecting does not automatically grant access to unrelated conversations or financial providers.

## OAuth and MCP endpoints

- MCP resource: `https://bobbyprotocol.xyz/api/chatgpt`.
- Protected-resource metadata: `/.well-known/oauth-protected-resource/api/chatgpt`.
- Issuer: `https://bobbyprotocol.xyz`.
- Authorization-server metadata: `/.well-known/oauth-authorization-server`.
- Consent UI: `/chatgpt/connect`.
- Dynamic registration: `POST /api/chatgpt?op=register`.
- Code exchange: `POST /api/chatgpt?op=token` (JSON or form URL encoded).
- OAuth token revocation: `POST /api/chatgpt?op=revoke`.
- Account connection status/revocation: `GET /api/chatgpt?op=connection`, `POST /api/chatgpt?op=revoke` with the app’s authenticated first-party request (or `DELETE …?op=connection`).

Supported scopes:

| Scope | Permission |
| --- | --- |
| `bobby.context.read` | Read reviewed financial context and previously delivered educational analyses. |
| `bobby.context.write` | Prepare temporary selected-fact drafts that require approval in Bobby. |

Authorization-code grants use PKCE **S256 only**. Codes expire after 5 minutes and are consumed atomically once; a correctly bound code replay revokes its issued token. Opaque access tokens expire after 1 hour. Only SHA-256 hashes of codes and tokens are stored. Tokens are bound to the registered client, the verified account, resource, issuer, scopes and the current unrevoked consent version. Reconsent invalidates earlier tokens. Refresh tokens and client secrets are not issued; users reconnect after expiry.

The default redirect is an exact match for `https://chatgpt.com/connector_platform_oauth_redirect`. Success responses include the canonical `iss` value. A callback-ID-specific URI can be configured with `BOBBY_CHATGPT_REDIRECT_URIS` as a comma-separated exact HTTPS allowlist. There are no host-suffix matches, callback wildcards, arbitrary redirect URLs or server fetches of client metadata. Registration rejects credentials and unsupported metadata fields.

MCP uses stateless JSON streamable HTTP with `initialize`, `ping`, `tools/list`, `tools/call` and notifications. It accepts protocol versions `2025-06-18`, `2025-03-26` and `2024-11-05`; it does not hold sessions or use server-initiated events. A 401 advertises protected-resource metadata. Tools are filtered by the actual token scopes and calls recheck them.

## Privacy and untrusted data

- Model input never selects an account, supplies an access token, or requests a raw transcript/history array. Account identity comes only from the server-verified OAuth grant.
- No original question, raw conversation, private key, credential, account/card identifier or provider payload is saved by these tools. The shared schema rejects unknown fields and common sensitive identifier formats.
- Fact summaries and prior analyses are explicitly marked as untrusted data. Tool descriptions/results prohibit interpreting them as instructions. They do not reach Bobby’s analysis model or change its verdict, sizing or execution.
- Saved facts are `user_reported`, never verified movements. Previous analyses preserve their `asOf` time and may be stale.
- Pending drafts are not returned by read tools. The app may display them only to their owning account for review.
- The tables and RPCs enable RLS and revoke direct access from `public`, `anon` and `authenticated`; server requests use the existing Bobby service role. Logs contain no personal facts, identities, codes or tokens.
- Revocation remains available even when the connector feature flag is off. It disconnects access without erasing reviewed financial facts; the user can erase those separately in Bobby.

## Activation and validation

Apply the financial-context migration and `20261004161000_chatgpt_oauth.sql` to the intended Bobby data project in order. The connector requires `BOBBY_CHATGPT=on`, the existing Bobby Supabase service-role configuration and the existing account auth configuration. No new signing secret is required. Discovery and account revocation work with the feature switch off; connector actions fail closed.

Recommendation capture also obeys the existing `BOBBY_MEMORY=on` switch, account memory setting, and the native device's separate per-account question-memory opt-in. Financial memory starts off on every account; the user enables it in the new profile screen. `financialMemoryEnabled` is that choice, `accountMemoryEnabled` is the global pause, and `enabled` is the effective combination. A global pause never prevents the user from independently disabling financial memory.

Facts stay until the user deletes them, with a cap of 50 per account. Drafts expire after 24 hours. At most 100 recommendation snapshots are kept and only the last 90 days are returned (20 per app load). The protected daily Vercel job `/api/financial-context?op=purge` removes expired drafts, snapshots and idempotency records in batches of up to 5,000, using the existing `CRON_SECRET`. Reads exclude expired data immediately; actual cleanup timing depends on successful cron execution. `asOf` is the market-data timestamp; snapshot `createdAt` is the server storage time and does not prove physical-device presentation.

Run `node --import tsx scripts/test-chatgpt-auth.mts`. Set `DATABASE_URL` to a **local scratch PostgreSQL** instance with the Bobby identity/role fixtures to additionally run actual concurrency, PKCE, expiration, account isolation, privilege, cascade and revocation checks. The script rejects remote database URLs. The app/build checks and first-party preview should also pass before deployment.

Local tests do not establish ChatGPT registration, OAuth completion on the deployed domain, connector distribution or physical-device acceptance. After an authorized deployment, verify the discovery rewrites, register a ChatGPT connector, sign in through the actual consent screen, import one selected fact, approve it in the same Bobby account, test cross-account denial, pause sharing and revoke the connection. Store the result as separate deployed evidence.

Official integration references: [authentication](https://developers.openai.com/plugins/build/auth), [minimal task-specific inputs](https://developers.openai.com/plugins/plugin-guidelines#minimal-and-purpose-driven-inputs).
