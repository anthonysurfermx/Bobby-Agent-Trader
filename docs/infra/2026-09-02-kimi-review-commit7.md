• The diff is large; let me page through the rest of it.

• I have the full diff. Now let me verify the surrounding code that the diff depends on.

• Now checking cross-references: other callers of the changed async functions, remaining anon-key readers, and the frontend context.

• `useTradingRoom` exposes `wallet` — good. Now checking schema columns used by the new endpoints, the remaining touched files, and where ProactiveNotification renders.

• Checking what `profile` is in AdamsChat (used for sessionFetch) and running type checks.

• Type check and selftest pass. One last check on the actual production domains, then the telegram-webhook placement.

• All verification done. Report:

  # Review — HEAD `60c386d` on `feat/phase0-hardening`

  Verified: full diff, all touched files, schema baselines, call sites of every changed function, `npx tsc -p tsconfig.api.json --noEmit` (clean), `wallet-session-selftest.mts` (13/13 pass).

  ## A. Blockers

  **1. Gate false PASS — CLOSED.** `scripts/infra/rls-adversarial.mts` v2 no longer infers refusal from "0 rows": policy matrix read from `pg_policies` via `bobby_rls_matrix()`/`bobby_rls_status()` (rls-adversarial.mts:87-108); service-key-planted canary rows attacked with anon and re-verified intact with the service key — UPDATE must return 0 rows *and* the row must be untouched (lines 186-207); anon INSERT must be 401/403, 400 = INCONCLUSIVE = fail (line 233); service key mandatory, exit 2 = INCOMPLETE (line 56); legit signed write proven E2E with a throw-away key, including 401-without-session and 403-wallet-mismatch (lines 264-303). No false-PASS path found. Operational caveats, not verdict bugs: the gate plants a **public** canary thread/post/trade that is visible in the live forum during the run, and a service insert that fails on schema drift fails the gate (fail-closed, noisy).

  **2. Private RLS — CLOSED.** `20260902_bobby_rls_hardening.sql:96-110` moves `agent_messages`, `user_interests`, `user_digests`, `sandbox_runs` (plus `agent_profiles`, telegram, memory, etc.) to service-role-only; `forum_threads_public_read` (line 56-57) and `forum_posts_public_read` (line 62-68) expose only `coalesce(scope,'public') <> 'private'`. All browser readers migrated to session-gated APIs (`api/my-threads.ts:27`, `api/agent-messages.ts:20-36`, `api/user-interests.ts:21-35`, `api/agent-setup.ts:52-68`). Minor over-exposure: the policy treats **any** non-`'private'` scope as public while the frontend only displays null/`public` — a future `internal` scope would leak to anon.

  **3. Wallet ownership — CLOSED (EOA-only, documented).** `api/_lib/wallet-session.ts`: ecrecover over a typed message, 10-min window (line 111), HMAC token bound to wallet, 7-day TTL, constant-time MAC check, fail-closed 503 without `BOBBY_SESSION_SECRET`. `guardWrite` requires it by default and 403s a body wallet ≠ session wallet (`api/_lib/write-guard.ts:101-106,127-132`). `telegram-connect.ts:29-34` verifies `agentProfileId` belongs to the session wallet; `forum-publish.ts:63` fixes `owner_wallet` server-side. No impersonation path left among the reviewed endpoints. Limits: EIP-1271 smart wallets can't sign (admitted in handoff doc); `/api/wallet-session` has no origin check (acceptable — the signature is the proof); a captured signature is replayable for 10 min (TLS-only exposure).

  **4. Kill switch — CLOSED.** `requireWritesOpen` now heads `user-cycle.ts:672`, `forum-resolve`, `forum-morning`, `generate-activity`, `seed-macro-calendar`, `feedback`, `agent-run`, `sandbox-run`; `telegram-deliver.ts:75-80` checks freeze+canary; `telegram-webhook.ts:59-64` acks 200 and processes nothing on freeze; `user-cycle.ts:581-585` suppresses Telegram in canary; `harness-events.ts:51,151` no-ops on freeze. On-chain guards load the control before evaluating: `requireProtocolWriteSafety`/`requireLegacyXLayerMode` are now async (`protocol-write-safety.ts:141-146,160-168`), `writeFreezeSync()` fails closed on a cold lambda (`control.ts:119-123`). Grep confirms zero un-awaited callers of the changed async functions. Nits: `telegram-deliver` answers 503 *before* auth — leaks freeze state to unauthenticated callers (trivial).

  **5. Anon-key writer fallback — CLOSED.** The seven writers + `harness-events` use `bobbyServiceKeyOptional()` with an explicit 503 (e.g. `bobby-cycle.ts:654`, `feedback.ts:61-62`). Remaining `bobbyReadKey()` users are read paths only. Caveat: read paths that fall back to anon now silently return `[]` on service-only tables post-migration (`api/sandbox-runs.ts`, `AgentDashboard`) — degradation, accepted/documented except where noted in B.

  **Tweak a. Origin allowlist — CLOSED, one deploy condition.** Exact hosts only: `bobbyprotocol.xyz` + `www`, the deployment's own `VERCEL_URL`/`VERCEL_BRANCH_URL`/`VERCEL_PROJECT_PRODUCTION_URL`, `BOBBY_ALLOWED_ORIGINS`, localhost only outside production (`write-guard.ts:60-76`). Selftest confirms `evil.vercel.app` and localhost are rejected in production. **Any custom domain beyond `bobbyprotocol.xyz` (e.g. `defimexico.org`) must be added via `BOBBY_ALLOWED_ORIGINS`, or every guarded write 403s for real users.**

  **Tweak b. Control timeout — CLOSED.** 2.5 s `AbortSignal.timeout` on both the table and Edge Config fetches (`control.ts:60,81`), fail-closed.

  ## B. New bugs / regressions

  1. `src/pages/BobbyTelegramPage.tsx:106-114` — anon read of `telegram_groups` (now service-only) silently fails; group name/status degrades to placeholder after the migration. Not fixed by this commit.
  2. `src/components/agent-radar/AgentDashboard.tsx:76` — read of all wallets' `agent_messages` returns `[]` post-migration (acknowledged in handoff, still a dead panel).
  3. `AgentRadarLanding.tsx:34-37` — greetings now need a session, but this component never prompts (`auto` doesn't exist here); on a first visit without a prior chat session, greetings silently never load.
  4. `AdamsChat.tsx:2451` — forum publish keys off `profile?.walletAddress` (the *localStorage* advisor profile), not the connected address. A connected user who skipped local onboarding gets a silent 401 and the debate is not published; before this commit anonymous publish worked. Bounded UX regression.
  5. Scope policy exposes any non-`private` scope to anon while UIs filter null/`public` only (see A2).
  6. `tsconfig.api.json` still excludes 8 edited files with pre-existing errors (`bobby-cycle`, `forum-resolve`, …) — accepted per handoff, but they are un-typechecked.

  ## C. Remaining anon/no-credential access to another wallet's data

  None found, once the migration is applied. Every wallet-owned table is service-role-only; private forum threads/posts are hidden from anon; every wallet-scoped API (`agent-messages`, `user-interests`, `my-threads`, `agent-setup` GET, `guardWrite` POSTs) requires the session and scopes by the proven wallet — the body wallet is advisory and mismatches 403. `PATCH /api/agent-messages` takes `id` from the body but the PostgREST filter is `wallet_address=eq.<session>` (`agent-messages.ts:52`), so cross-wallet row touch is impossible. Remaining anon surface is by design: public track-record tables, public forum scope, `user_feedback` INSERT, `api_cache`/`indicator_cache` fresh rows, `/api/wallet-session`, and `forum-agent-register` without `owner_wallet` (rate-limited 3/h). Session tokens are 7-day bearer tokens with no per-token revocation — only secret rotation kills them.

  ## D. Deploy verdict

  **GO for Vercel preview, conditional.** Before deploying:

  1. Set on the preview env: `BOBBY_SESSION_SECRET` (≥32 chars), the service-role key, `BOBBY_CONTROL_SOURCE` if used, and `BOBBY_ALLOWED_ORIGINS` covering every custom domain users browse (own `*.vercel.app` host is automatic).
  2. Point the preview at a **non-production** Supabase project if possible — the gate plants and deletes real canary rows (including a briefly visible public forum thread), and its section-C writes a real interest row.
  3. Run `scripts/infra/rls-adversarial.mts` v2 (with `SUPABASE_SERVICE_KEY`) against the preview after the migration is applied there; require exit 0.

  **Before applying the RLS migration to the production DB (strict order):** deploy this commit to production *first* (frontend + API with `BOBBY_SESSION_SECRET`), verify a signed session flow works against prod, then apply `20260902_bobby_rls_hardening.sql`, then re-run the gate against prod. Applying the migration before the code deploy breaks all chat/forum writes and private reads (they 401 or silently empty). Also verify the six tables in the unguarded public-read loop (`agent_cycles`…`hardness_agent_proofs`) exist in the target DB — that loop has no `if exists` guard and would abort the migration. Post-migration, fix or accept the three UI degradations in B1-B3.

