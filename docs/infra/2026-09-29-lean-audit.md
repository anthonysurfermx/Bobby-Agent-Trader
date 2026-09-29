# Lean infra audit — 2026-09-29

Read-only audit in 6 slices (crons, API, frontend, data, services, LLM/latency) → one plan → adversarial verification of each cut. Raw data: the workflow journal (wf_93b63a0a-bae). This document is the prioritized list; the **Estado** column says what already shipped.

## Titular

El dinero no es el problema: Bobby cuesta ≈$35–65/mes (Vercel Pro + ~$10 de Supabase + <$10 de LLM/voz; estimado, no pude ver la facturación), y el Daily Cycle solo cuesta ≈$0.25/mes. El arrastre está en tres lados. Exposición: unos 10 endpoints públicos gastan la llave de OpenAI sin ledger, entre ellos /api/openclaw-chat, que regala las tools x402 de pago, y el relay Realtime anónimo de PTS. Ruido: el polling de /protocol y el sweep por minuto son ≈94% de las invocaciones. Latencia del desk en prod: voice-tool y desk-debate corren en serie, ≈8–9 s al veredicto; el branch de niveles ya lo resuelve en parte con streaming. De 105 funciones, ~60 son legado (voice room/AdamsChat, Telegram, OKX/X Layer, DeFi México, Hardness) y pueden salir sin tocar el desk, iOS ≤43 ni x402.

- **Costo hoy:** ≈$35–65 attributable to Bobby (estimate; billing APIs returned 'Plan not found', env listing 403). Breakdown: Vercel Pro ~$20 (plan inferred from the per-minute cron, not verified); Supabase ~$10 marginal Micro compute for bobby-protocol (the org is ≈$85/mo across 7 projects, driven by the project count, not by Bobby); LLM/voice ~$3–10 (desk <$1, daily cycle ~$0.25, TTS $0.5–2, realtime voice room $1–4, PTS relay small); DigitalOcean wallet droplet $0–24 if it still runs (unverified). ≈310k function invocations/mo, ~94% of them from /protocol polling plus the per-minute sweep, all inside included quotas.
- **Costo después:** ≈$30–35 (estimate). Vercel and Supabase base stay the same. LLM/voice ≈$1–5 under hard provider caps; PR #103 adds Sonnet spend on Profundo/Máximo, bounded by LEVEL_LIMITS and llmBudget. Droplet $0. The dollar saving is small. The real gains are: about 10 anonymous paid-API endpoints removed, 105 → ~44 functions, ~85–90% fewer invocations, and a faster desk.

## Acciones (prioridad de arriba abajo)

| # | Acción | Tipo | Esfuerzo | Estado | Verificación adversarial | Decisión de Anthony |
|---|---|---|---|---|---|---|
| 1 | Close the x402 bypass: gate /api/openclaw-chat behind internal auth | fix | S | #105 (narrowed, not closed) | — | Accept that the legacy voice-room chat (AdamsChat) breaks, or retire the voice room in the same PR (action voice-room-retire). |
| 2 | Throttle /protocol and ticker polling (visibility-aware) and lengthen CDN caches | fix | S | #105 (120 s + visibility, s-maxage 60) | — | — |
| 3 | Ship PR #103: levels, live NDJSON debate, parallel read and spend guard | fix | M | #103 merged, live | — | Go/no-go to merge PR #103 to prod (levels, referral Pro grants, Sonnet spend). |
| 4 | Trim the desk read path: one metered request, no bobby-intel, in-process data, parallel evidence | fix | M | pendiente | — | — |
| 5 | Remove the anonymous PTS Realtime relay from Bobby prod | cut | S | pendiente | NO segura tal como está escrita | Is the PTS demo still shown with live voice? If yes, re-host it before deleting. |
| 6 | Slow the per-minute realtime sweep cron to every 10 minutes | fix | S | #105 (*/10) | — | — |
| 7 | Delete zero-caller functions and dead code (~15 functions, 21 dead pages, 8k+ lines) | cut | S | #105 (subset: 7 endpoints) | NO segura tal como está escrita | — |
| 8 | Remove the no-op settle-trades cron and handler | cut | S | #105 | segura | — |
| 9 | Stop preloading recharts and draco on every route | fix | S | #105 (recharts) | — | — |
| 10 | Put hard caps and a ledger on every paid model call | fix | S | pendiente | — | Create the provider keys and limits in the OpenAI and Anthropic dashboards and pick the monthly ceilings. |
| 11 | Daily Cycle: keep it through the 2026-10-01 Sommia review, then pause it together with its public dependents | pause | M | pendiente | NO segura tal como está escrita | Pause now or after the 2026-10-01 Sommia review, and accept a static public track record (heartbeat, /protocol 'last debate', bobby_judge default). |
| 12 | Retire the legacy Realtime voice room and the personal-agent stack behind it | cut | M | pendiente | NO segura tal como está escrita | Is Realtime full-duplex web voice on the companion roadmap? If not, retire it; the free Edge/OpenAI TTS voice stays. |
| 13 | Load wallet/AppKit, three.js and analytics only where needed | fix | M | pendiente | — | — |
| 14 | Desk focus: move swaps off the verdict, stop in-desk Trader Land seeds, delay gamification pop-ups | pause | M | pendiente | NO segura tal como está escrita | Keep swaps and Trader Land inside the desk or move them out (Base Batches story vs voice-first focus). |
| 15 | Clean Vercel env and dormant secrets: X Layer key, live-trading flag, legacy Supabase, stale previews, waitlist, droplet | cut | M | pendiente | NO segura tal como está escrita | All env/key deletions and revocations (Vercel, OKX, Resend, DigitalOcean) are founder actions. |
| 16 | Make /api/bobby-protocol-stats and /api/activity cheap per call | fix | M | pendiente | — | — |
| 17 | Drop the DeFi México shell from the Bobby SPA: legacy AuthProvider, legacy Supabase client, i18n, layouts, routes | cut | L | pendiente | — | OK to 404/redirect all DeFi México URLs on bobbyprotocol.xyz to defimexico.org. |
| 18 | Remove hackathon-era agentic-world / claw-trader / Polymarket / OKX surfaces and their endpoints | cut | L | pendiente | NO segura tal como está escrita | — |
| 19 | Shut down Bobby's Telegram surface and confirm the separate aigts-bot is dead | cut | S | pendiente | NO segura tal como está escrita | Confirm the Telegram bots and the Voice DM deal are dead, run getWebhookInfo/deleteWebhook, and decide aigts-bot's fate. |
| 20 | Fix x402 logging, trim dead x402 tools, and run the paid tools on the desk engine | fix | M | pendiente | — | Create the table or drop the log, and approve any change to the advertised x402 tool list or output format. |
| 21 | Decide on /protocol console, sandbox, harness, playbooks and the Hardness agent API | investigate | M | pendiente | — | Do the Sommia/Base reviewers need console, sandbox, harness and the Hardness registry API? Keep them behind x402, or cut. |
| 22 | Supabase hardening migration: grants, definer views, PTS RPCs, search_path | fix | M | pendiente | — | Approve a prod DB migration, including shutting down the PTS demo's pts_* objects. |
| 23 | Close the cut-over rollback window: disable the outbox triggers and decide the legacy project's fate | cut | S | pendiente | NO segura tal como está escrita | Declare the cut-over rollback window closed and decide the fate of the legacy project egpixaunlnzauztbrnuz. |
| 24 | Drop dead tables and indexes after the endpoint cuts | cut | S | pendiente | — | Approve irreversible table drops on prod, after the exports. |
| 25 | Make the weekly security scan green again: review, then allowlist, 3 gitleaks hits | fix | S | pendiente | — | — |

## Detalle por acción

### 1. Close the x402 bypass: gate /api/openclaw-chat behind internal auth

**Por qué.** The paid MCP tools bobby_analyze and bobby_debate (PREMIUM_TOOLS, mcp-http.ts:52) run by POSTing to /api/openclaw-chat (mcp-http.ts:94, mcp-bobby.ts:64). Grep confirms api/openclaw-chat.ts has only enforcePublicRateLimit 30/600s per IP (:919) and no requireInternalAuth. So anyone gets the paid debate for free by calling it directly: gpt-4o streaming with max_tokens 2048 (:1059), on the shared OPENAI_API_KEY, with no ledger. judge-mode.ts:169-174 already closed the same hole for bobby_judge. mcp_payment_receipts = 0, so no paying agent is affected. Confidence: high.

**Cómo.** 1) api/openclaw-chat.ts: call requireInternalAuth(req,res) first thing in the handler, the same way judge-mode.ts:173 does. 2) Add ...internalAuthHeaders() to the fetch in api/mcp-http.ts:94 and api/mcp-bobby.ts:64. 3) Confirm INTERNAL_API_SECRET is set in Production (judge-mode already depends on it). 4) Test bobby_analyze and bobby_debate end-to-end on a preview deploy. Follow-up: see x402-cleanup (move the tools to runDeskDebate, delete openclaw-chat).

**Ahorro:** $0 today; removes an uncapped abuse ceiling (~$0.02/call × up to 4,320 calls/day per IP) · **Velocidad:** none · **Riesgo:** The legacy voice-room text chat (AdamsChat.tsx:2237 → openclaw-chat) stops working. A wrong secret would break the paid tools, so test on preview first.

### 2. Throttle /protocol and ticker polling (visibility-aware) and lengthen CDN caches

**Por qué.** In 3-day prod logs, six endpoints are ~94% of invocations: bobby-protocol-stats 5,613, activity 5,491, protocol-heartbeat 5,212, protocol-tx-history 5,175, bobby-intel 4,865, against 203 hits on '/'. The traffic is a flat ~1,800/day each, which looks like an idle tab or a monitor. Verified pollers: BobbyProtocolLanding.tsx:140 and :169 (30_000 ms), BobbyHeartbeatPage.tsx:175 (15000), KineticShell.tsx:41 TICKER_REFRESH_MS=60_000 on every KineticShell page. Verified short caches: bobby-protocol-stats.ts:439 s-maxage=30, activity.ts:100 s-maxage=15, protocol-heartbeat.ts:508 s-maxage=15, protocol-tx-history.ts:359 s-maxage=60. Every stats cache miss self-fetches bobby-intel (bobby-protocol-stats.ts:212, which fans out to ~15 market APIs) and runs 6 exact counts; that is the top DB consumer (30,560 calls × 192 ms). bobby-intel's per-IP limiter (30 per 10 min, bobby-intel.ts:28) is shared with the desk's voice-tool server calls. Confidence: medium. The poller source is unknown; hits land exactly at :12/:42 each minute, which suggests an uptime monitor.

**Cómo.** 1) In the 4 pollers, skip ticks while document.visibilityState==='hidden' and refresh on visibilitychange. Raise intervals to 300_000 (landing stats and activity), 60_000 (heartbeat page) and 300_000 (KineticShell ticker). 2) Raise caches: stats s-maxage=300 with stale-while-revalidate=600; activity 120; heartbeat 60; tx-history 300. 3) In Vercel logs, check the user-agent and IP for /api/protocol-heartbeat. If it is a monitor, point it at the heartbeat endpoint only, every 5 minutes.

**Ahorro:** ~$0 direct (inside Pro included usage); cuts ~300k invocations/mo plus Base RPC eth_getLogs and external API fan-out (the cost of a metered BASE_RPC_URL is unverified) · **Velocidad:** Fewer bobby-intel cache misses and less limiter contention on the desk's voice-tool path; ~2 h per 37 days less DB CPU on Micro · **Riesgo:** /protocol counters refresh every few minutes instead of every 30 s. A third-party monitor keeps polling until someone reconfigures it.

### 3. Ship PR #103: levels, live NDJSON debate, parallel read and spend guard

**Por qué.** In prod, origin/main NucleoDesk.tsx:197 awaits voice-tool before :221 starts desk-debate. The verdict appears only after all 3 model calls, and the phases run on fake timers. Estimated p50 is ~8–9 s to the verdict and 10–12 s to the first spoken word. The branch (302579d) already fixes most of this, verified: api/desk-debate.ts:77/125 streams application/x-ndjson; deskData.ts:136 consumes it; NucleoDesk.tsx:226-229 starts the metered read and the debate together and drives phases from real events; desk-debate.ts:88/148 adds llmBudget and logLlmUsage. The PR #103 tables already exist in prod with 0 rows, so the schema is ahead of the code. One caveat: Rápido moves from 4o-mini to gpt-6-luna, which takes total time from 4.6–5.3 s to 9.6–11.1 s (docs/ai/2026-09-29-bobby-intelligence-brief.md:106-108, 144-147). Streaming has to ship with it. Confidence: high.

**Cómo.** 1) Final review of feat/analysis-levels-referrals. 2) npm run build and a preview deploy. 3) Run the desk-guard eval (scripts/eval, commit 2710109). 4) Smoke-test Rápido, Profundo and Máximo on web and on one iOS build ≤43 (iOS keeps the plain JSON reply). 5) Set the Anthropic spend limit first (see provider-spend-caps). 6) Update the public model claim at bobby-protocol-stats.ts:513-514 from levelPlan().

**Ahorro:** none (adds Sonnet spend on Profundo/Máximo, bounded by LEVEL_LIMITS and llmBudget) · **Velocidad:** On web, the first agent text arrives after the first call (~2–4 s) instead of after the whole chain. Removes the serial voice-tool → desk-debate wait on web (1.2–2.5 s p50, up to 15 s). · **Riesgo:** Touches access, quotas and referral Pro grants, which are payments-adjacent. If streaming misbehaves, Rápido's total time roughly doubles on luna.

### 4. Trim the desk read path: one metered request, no bobby-intel, in-process data, parallel evidence

**Por qué.** Even on the branch:
(a) Rápido in desk-debate is not read-metered. It only has consumeLevel (desk-debate.ts:111) and the per-IP quota RPC (:99); consumeRead lives in voice-tool.ts:305. A script can therefore call desk-debate's Rápido path directly.
(b) iOS still waits up to 10 s on the voice-tool meter before it starts desk-debate (origin/main ios/Bobby/Sources/Nucleo/NucleoDesk.swift:331 meterWaitSeconds=10, :576).
(c) voice-tool.ts:219 calls ${SELF}/api/bobby-intel only to get regime and pulse. On a cache miss that fans out to ~17 sources, and it can take up to 15 s (getJson timeout, voice-tool.ts:47).
(d) The same 1H candles are fetched 3 times over self-HTTP (deskData.ts:249, voice-tool.ts:156, _lib/desk-debate.ts:64), and analyzeCandles runs twice.
(e) Gates and evidence run one after the other, and v2 evidence waits for the 1H base before fetching the other frames (_lib/desk-debate.ts:124-131).
(f) Role prompts diverge before the evidence (_lib/desk-debate.ts:357-371), so provider prompt caching never kicks in.
Confidence: high for (a)–(e), medium for (f).

**Cómo.** 1) api/desk-debate.ts: when level==='rapido', call consumeRead(req, symbol) with the client requestId as an idempotency key (refundRead on failure). Return {technicals, technical_pulse, regime, access} in the response. Move pulseFromOkxIndicators and resolveVenue (voice-tool.ts:66-75, 192-209) into api/_lib.
2) voice-tool.ts:219: derive the regime from the okx-market BTC 24h change (detectRegime logic) instead of calling bobby-intel.
3) Replace the self-HTTP fetchCandles calls (_lib/desk-debate.ts:42-45, SELF in voice-tool.ts:22) with a shared lib that calls OKX/Yahoo directly, cached in api_cache for 5 min.
4) Start the evidence promise before the gates, and put the 1H fetch in the same Promise.all as the other frames.
5) Prompts: shared evidence first, role instruction last; add cache_control on the Anthropic calls (llm.ts:239-243).
6) iOS: drop the meterWait pre-step in the next build. Keep voice-tool run_debate for builds ≤43.

**Ahorro:** ~3–5 fewer function invocations per read; Profundo/Máximo input tokens on calls 2–4 ~50–90% cheaper once cached (estimate) · **Velocidad:** 1.2–3 s p50 off iOS time-to-debate (10–15 s in the worst case); 0.3–0.8 s off the evidence load on every level · **Riesgo:** Reads can be counted twice while old iOS builds still call voice-tool first; this needs idempotency on requestId. Reordering prompts can shift the output style, so re-run the desk-guard eval.

### 5. Remove the anonymous PTS Realtime relay from Bobby prod

**Por qué.** api/pts-realtime-session.ts mints OpenAI Realtime client_secrets (gpt-realtime-2.1-mini, :14) for anonymous callers. The only limit is 6 per 600 s per IP (:29); there is no global cap, and it runs on Bobby's OPENAI_API_KEY. The client can reshape the session, so in practice it is general-purpose realtime voice on Bobby's bill. The only caller is the separate Bobby-PTS-demo app (PTSRealtimeClient.swift). About 66 secrets were minted 2026-09-21 → 09-27 (rate-limit buckets); the pitch was 2026-09-23. Grep finds no reference in Bobby's src/ or iOS. This also breaks the memory rule 'PTS ≠ Bobby'. Confidence: high.

**Cómo.** Delete api/pts-realtime-session.ts (it has no vercel.json entry). If PTS still needs live voice, deploy it on the pts-copiloto Vercel project with its own OpenAI key and a global daily cap, and repoint PTSRealtimeClient.swift. Unset REALTIME_MODEL and REALTIME_VOICE in Bobby if nothing else reads them.

**Ahorro:** small today; removes unbounded exposure (~$0.03–0.10/min for realtime-mini; 2.1 pricing unverified) · **Velocidad:** none · **Riesgo:** The PTS demo's voice falls back to pre-rendered Edge clips (commit 5442547) until it is re-hosted.

**Verificación: NO segura tal como está escrita.** Nothing inside Bobby depends on this route. But one live consumer outside Bobby would break, and one step in the "how" would touch Bobby's own voice.

1) The Pro Trading Skills (PTS) app's live voice breaks in builds already on phones (high confidence).
- The PTS app hardcodes the URL: /Users/mrrobot/Documents/GitHub/Bobby-PTS-demo/ios/PTS/Sources/PTSRealtimeClient.swift:33 `URL(string: "https://bobbyprotocol.xyz/api/pts-realtime-session")!`.
- Those builds were made after the pitch. Commits eadeda8, 23047f4, fedc9d6 and aee8415 (2026-09-24) say "App Store build 1.0 (3)", "TestFlight 1.0 (3)" and builds 1.0 (4) and 1.0 (5), bundle mx.protradingskills.app.
- The route is still being used after the 09-23 pitch. Vercel prod runtime logs (project prj_2mZTeXALvWwHIbfA6H4hYKWeS6iR, last 7 days, path /api/pts-realtime-session) count 122 responses with status 200, 14 with 429 and 14 with 405.
- The last calls were 5 POST requests returning 200 at 2026-09-27 00:01–00:02 UTC, on deployment dpl_9bz1f89mH8aJ1EMSvJBsSHdje6wr (branch=main).
- The route is on origin/main (ca23c2a contains 89464bc), so deleting it takes effect on the next deploy from main.
- The failure is not silent. The client turns any status outside 2xx into `.server` ("Voz en vivo no disponible") and points to the reviewed answers (PTSRealtimeClient.swift, around lines 128–135). The pre-recorded backup voice (Edge es-MX Dalia clips) is described in Bobby-PTS-demo/docs/PTS-demo-runbook.md:61.
- Builds already on phones can only be repointed by shipping a new PTS build.

2) The step "Unset REALTIME_MODEL and REALTIME_VOICE" is wrong for REALTIME_VOICE (high confidence).
- Bobby's main voice route reads it: api/_lib/realtime-config.ts:16 `const fallbackVoice = process.env.REALTIME_VOICE || 'marin'`, which api/realtime-session.ts:7,49 uses and src/hooks/useRealtimeVoice.ts calls.
- scripts/test-realtime-session.mts:50 also sets it.
- Unsetting it changes Bobby's default voice whenever the requested persona voice is missing or not on the allowed list.
- Only api/pts-realtime-session.ts:14 reads REALTIME_MODEL; realtime-config.ts:3 hardcodes its model.
- I could not confirm which of these variables are set in prod: listing the Vercel project's env vars was denied (403).

3) The evidence in the proposal needs correcting (high confidence).
- "~66 secrets" undercounts. The rate-limit rows in api_cache (key `rl:pts-realtime-session:%`) total 14 buckets and 66 hits between 09-21 and 09-27, with none still active.
- Those hits include rejected requests (the highest counts per bucket are 9 and 10, above the limit of 6).
- An expired bucket row is overwritten when the same IP comes back, so older hits are lost.
- Vercel logs show at least 122 successful mints since about 09-22.
- The per-IP limit also lets requests through if the database is unreachable (api/_lib/rate-limit-persistent.ts:46,57,79), which supports the "unbounded" claim.

Checked and not affected:
- No reference in src/.
- The native Bobby iOS app is actively barred from this route: scripts/check-ios-avatar-voice-boundary.mjs:9 lists it as forbidden, and that check still passes after the deletion.
- The Android app wraps the web, and the web has no reference.
- No vercel.json function or cron entry.
- No CI npm script references it (.github/workflows/ci.yml).
- No DB trigger involved.
- No Bobby docs mention it.
- No hardened version exists: claude/pts-realtime-hardening and codex/pts-live-relay are both still at 89464bc.

**Cómo corregido:** Keep it as doNow=false, and keep the founder question as the gate. The logs show PTS live voice was in use through 2026-09-27, so the answer decides the order of steps.

(a) If PTS still needs live voice:
- Stand up the relay on the pts-copiloto Vercel project with its own OpenAI key and a global daily cap.
- Ship a new PTS TestFlight build pointing at it.
- Check that traffic has moved: Vercel runtime logs for /api/pts-realtime-session on Bobby should drop to zero or only 405 probes.
- Only then delete api/pts-realtime-session.ts from Bobby, through a PR to main (it is on origin/main at 89464bc).

(b) If the founder accepts the fallback:
- Delete the file now, knowing that PTS 1.0 (3)–(5) builds will show "Voz en vivo no disponible" and use the reviewed answers and Edge Dalia clips.

(c) Stop-gap if the cut waits:
- Add a shared cap across all callers in the same file, e.g. a second `checkPersistentLimit('pts-realtime-session', 'global', N, 86400)` (the library already supports the literal id 'global').

Env vars:
- Unset only REALTIME_MODEL.
- Do NOT unset REALTIME_VOICE. api/_lib/realtime-config.ts:16 uses it as the fallback voice for Bobby's main /api/realtime-session.

Also fix the usage figure in the write-up. Vercel logs show 122 successful mints, 14 rate-limited (429) and 14 GET probes (405) over the last 7 days, the last on 2026-09-27 00:02 UTC. The 66 from the rate-limit rows is only a lower bound.

### 6. Slow the per-minute realtime sweep cron to every 10 minutes

**Por qué.** vercel.json:167-170 (verified) runs /api/realtime-session?sweep=1 at '* * * * *'. That is 1,440 invocations a day and ~21% of all prod log lines (1,442 of ~6,900 in 24 h), which buries real errors and makes log searches time out. The sweep guards a web-only, opt-in voice room with 3 voice-budget rows ever and 0 live leases. Leases have hard deadlines, and the owner already closes calls via waitUntil (realtime-session.ts:60-61). It is also the only cron that needs a non-Hobby plan. Confidence: high.

**Cómo.** Set the schedule at vercel.json:169 to "*/10 * * * *". Optional, in a separate PR: in the sweep branch, also delete api_cache rows where expires_at < now() (273 of 277 rows are expired). If the voice room is retired (voice-room-retire), remove the cron and vercel.json:274-277 entirely.

**Ahorro:** ~$0.1–0.2; −39k invocations/mo; ~19% less log noise · **Velocidad:** Log search becomes usable again for incident debugging · **Riesgo:** A lease orphaned by a crashed instance can hold that user's voice quota for up to 10 min (3 users ever).

### 7. Delete zero-caller functions and dead code (~15 functions, 21 dead pages, 8k+ lines)

**Por qué.** I grepped src/, public/, api/ and the iOS/Núcleo sources on origin/main. The only paths iOS/Núcleo reference are desk-debate, bobby-asset-search, voice-tool, bobby-voice-free, stock-candles, progress, okx-candles, trader-land*, bobby-access, okx-tickers, account and probe. None of these endpoints has a caller:
- auto-bounty, premium-signal, deploy-hardness.
- identity-link (only a comment at ProgressSync.tsx:68).
- generate-activity (only cron-activity calls it) and cron-activity.
- forum-morning and forum-generate (both hardcode defi-mexico-hub.vercel.app, :77/:65).
- bobby-voice (ElevenLabs key unset, so it always returns 503).
- app-chat (public gpt-4o-mini, last bucket 09-21; the PTS repo has its own copy).
- og-bobby, seed-macro-calendar.
- harness-migrate (mentioned only in copy at BobbyHarnessConsolePage.tsx:336; calls rpc/exec_sql, which doesn't exist).
- bobby-wallet (its MCP tools were retired at mcp-http.ts:834-836; it falls back to plain HTTP 143.110.194.171:8789 at bobby-wallet.ts:10).
Also dead: src/lib/agent/* (6 files, no importers), api/_lib/okx-security.ts (no importers), and 21 page files nothing imports (8,043 lines). Confidence: high.

**Cómo.** 1) git rm those 15 api files, src/lib/agent/, api/_lib/okx-security.ts and the 21 unimported pages: AuthHelper, BobbyAppLanding, BobbyArchitecturePage, BobbyMarketplacePage, BobbyNetworkConsolePage, BobbySignalsPage, BobbySubmissionPage, CommunitiesPage, InvestmentOpportunitiesPageOld, the 7 PTS* pages, ReferentesPage, StartupDashboard, admin/AdminAnalytics, AdminBlogForm, AdminEventForm. Also remove the commented-out routes at App.tsx:59-61.
2) Remove the vercel.json functions keys at :190 (bobby-voice), :210 (forum-generate), :230 (forum-morning), :266 (generate-activity) and :270 (cron-activity). A stale key fails the build.
3) Fix the copy at BobbyHarnessConsolePage.tsx:336.
4) Leave ghost-wallet (advertised in skills/bobby-trader/SKILL.md:83) and forum-agent-register for the legacy-routes PR.
5) npm run build and a preview deploy.

**Ahorro:** $0 direct; removes 2 public paid-API endpoints (app-chat ceiling ~$0.8/day, ElevenLabs) and ~15 deployed functions · **Velocidad:** Shorter builds (prod build was 248 s); fewer cold-start surfaces · **Riesgo:** Old external callers of the 410 tombstones get 404 instead. vercel.json keys must match the remaining files, so build before merging.

**Verificación: NO segura tal como está escrita.** Nothing in live production usage breaks. What breaks is required CI: if you follow the "how" as written (git rm, fix vercel.json, npm run build), three suites that .github/workflows/ci.yml runs before `npm run build` will fail. Confidence: high. I checked each one on origin/main (ca23c2a).

1. **test:api-security (scripts/test-api-security.mts:62-63)** loads `import('../api/bobby-wallet.js')` inside a Promise.all and asserts on the wallet handler at :86-98 (401 unauthenticated, 400 on send). If bobby-wallet.ts is deleted, the module is not found and the whole suite crashes, including its perps, telegram-deliver and onchainos-signal checks.

2. **test:protocol-write-safety (scripts/test-protocol-write-safety.mts)** reads source files that the plan deletes:
   - :158-162 runs `readFileSync` on api/generate-activity.ts and api/auto-bounty.ts.
   - :164 runs `readFileSync('api/deploy-hardness.ts')`.
   - Deleting them throws ENOENT, so every later invariant in that file stops running: bobby-cycle no-signer, hardness registry, reown/chains.

3. **test:remediation-r2 (scripts/test-remediation-r2.mts:96-99)** loads `import('../api/identity-link.js')` in the same Promise.all as account.js, mcp-http.js, ghost-wallet.js and others. The P0-1 checks at :141-151 call it. If the module is missing, the whole suite dies. That suite includes the App Store account-deletion regressions (:102-138) and the mcp-http tests.

**Tooling and docs the plan also misses (not in CI, still stale or broken after the cut):**
- scripts/infra/freeze-behavior-selftest.mts:75-90 imports seed-macro-calendar, forum-generate, harness-migrate, forum-morning, generate-activity and auto-bounty. This is the cut-over freeze self-test.
- scripts/infra/writer-inventory.mts:50-65 lists the same files.
- scripts/infra/identity-link-probe.mts and scripts/generate-onchain-activity.sh:42 target deleted routes.
- skills/bobby-trader/SKILL.md:82 still advertises `/api/forum-generate`. Step 4 only mentions ghost-wallet at :83.
- tsconfig.api.json has stale include entries (seed-macro-calendar :57, harness-migrate :66, identity-link). These are `include` patterns, so tsc should not error, but they should be removed.
- Already stale before this PR: registry.ts:67-99 and public/skill.md:33-37 still advertise the retired wallet and dex tools.

**Checked and safe in production:**
- **Crons:** vercel.json crons (:154-173) are only bobby-cycle, settle-trades, forum-resolve and the realtime-session sweep. Prod DB qbvdqkknnuweatptjohi has no pg_cron and no pg_net.
- **vercel.json function keys:** the five keys the plan lists (:190, :210, :230, :266, :270) are the only ones pointing at deleted files.
- **app-chat:** its last api_cache buckets are from 2026-09-21 09:32 UTC (1 `app-chat:technical` row, 4 `rl:app-chat` rows). No Bobby iOS commit ever called it. The PTS app (Bobby-PTS-demo/ios/PTS) calls only stock-candles and pts-realtime-session.
- **identity-link:** in iOS history it appears only in 32648b6 and f559727 (build 13, added and removed in that same build). It already returns 410.
- **bobby-voice (the non-free one):** no iOS or web caller since 976fc5b.
- **bobby-wallet:** its MCP tools already throw at mcp-http.ts:836 and mcp-bobby.ts:53. The x402 challenge and settle path in mcp-bobby and mcp-http does not import any deleted file. premium-signal is already a 410 tombstone.
- **The 21 pages:** none has an importer. The `BobbyAppLanding` name at App.tsx:39 loads BobbyAppLandingExperience, and the AdminBlogForm importers use components/admin/AdminBlogForm. There are no import.meta.glob calls. middleware.ts and f280bed are in main.

**Not verified:** the disk filled up (ENOSPC) before I could grep for importers of src/lib/agent/* and api/_lib/okx-security.ts, so the "no importers" claim for those is still unchecked. Also, the list names 14 api files, not 15.

**Cómo corregido:** Do this as a single PR with these changes:

1. Before any `git rm`, run `git grep -nE "lib/agent|okx-security" -- src api scripts ios nucleo public middleware.ts`. It must return nothing. Then remove the 14 api files, src/lib/agent/, api/_lib/okx-security.ts and the 21 pages.

2. Update the CI suites in the same PR:
   - **scripts/test-api-security.mts:** drop the bobby-wallet import at :63 and the wallet assertions at :86-98. Keep okx-perps, telegram-deliver and onchainos-signal.
   - **scripts/test-protocol-write-safety.mts:155-166:** replace the readFileSync checks with `assert.equal(existsSync(p), false)` for api/generate-activity.ts, api/auto-bounty.ts and api/deploy-hardness.ts. "Retired writers do not exist" is a stronger invariant than "they return 410".
   - **scripts/test-remediation-r2.mts:** remove identity-link.js from the Promise.all at :96-99 and fix the destructured names to match. Replace the two P0-1 checks at :141-151 with an existsSync-false assertion.

3. Remove the deleted entries from:
   - scripts/infra/freeze-behavior-selftest.mts:75-90
   - scripts/infra/writer-inventory.mts:50-65
   - tsconfig.api.json (seed-macro-calendar, harness-migrate, identity-link)

   Delete scripts/infra/identity-link-probe.mts and scripts/generate-onchain-activity.sh.

4. Remove the vercel.json functions keys at :190, :210, :230, :266 and :270, as planned.

5. Fix the docs and copy:
   - Remove the `/api/forum-generate` row from skills/bobby-trader/SKILL.md:82.
   - Fix the copy at BobbyHarnessConsolePage.tsx:336.
   - Optionally, remove the dead bobby-wallet branches from mcp-http.ts:339-360 and mcp-bobby.ts:118-165, and the retired wallet and dex tools from registry.ts:67-99 and public/skill.md:33-37.

6. Locally, run every command the CI application job runs, not only the build:
   - `npm run test:api-security`
   - `npm run test:protocol-write-safety`
   - `npm run test:remediation-r2`
   - `npm run test:mcp-payment-transport`
   - `npm run build`
   - `npm run lint -- --quiet`

   Then do a preview deploy. Merge only when CI is green.

### 8. Remove the no-op settle-trades cron and handler

**Por qué.** Cron vercel.json:159-162 '45 12 * * *' (verified) runs api/settle-trades.ts. Prod SQL: 0 rows match its filter. agent_trades has 1 row total (the 2026-09-09 $1 NVDAc canary, with no stop/target), and settled_at has never been set. No current writer sets stop or target (agent-confirm.ts:35-43, swap-receipts.ts). The 2026-09-28 12:45:21 UTC log shows a 200 with an early return (:219). Base swaps realize PnL through confirm_swap_receipt FIFO instead. Confidence: high.

**Cómo.** 1) Delete the cron at vercel.json:159-162 and the functions entry at vercel.json:226-229. 2) Delete api/settle-trades.ts. 3) Update the comments at api/agent-run.ts:83 and :398, plus docs/infra/2026-09-02-phase0-handoff.md:28 and docs/infra/2026-09-03-cutover-prep.md:94. 4) No migration: keep the agent_trades columns. 5) npm run build.

**Ahorro:** ~$0 (30 no-op runs/mo) · **Velocidad:** none · **Riesgo:** None observed. Reinstate it if a future flow writes stop/target into agent_trades.

**Verificación:** segura. I found nothing live that this change breaks. Confidence is high. What I checked:

1. The cron's claims hold. vercel.json:159-162 is the '45 12 * * *' cron and vercel.json:226-229 is its functions entry. Both files are the same on this branch and on origin/main (ca23c2a), with no diff. Vercel runtime logs show one hit from 12:40 to 12:50 UTC on 2026-09-28: `12:45:21 GET /api/settle-trades 200`, deployment dpl_HzaLgxWcn3bCMXpE9BM3QV87VbB8, branch main. That matches the early return at api/settle-trades.ts:221-222.

2. The prod database confirms it (project qbvdqkknnuweatptjohi, SELECT only):
   - agent_trades total = 1, the most recent row from 2026-09-09 13:37:53.
   - Rows matching the handler's exact filter (confirmed, settled_at null, BUY, entry not null, stop or target set) = 0.
   - settled_at set ever = 0. stop or target set = 0. outcome set = 0.
   - agent_cycles with trades_successful > 0 = 0.
   So the job has never written anything a public page could show.

3. No current writer sets agent_trades.stop_price or target_price:
   - agent-confirm.ts:34-43 inserts no stop or target.
   - The stop/target writes in bobby-cycle.ts:1102/1351, user-cycle.ts:491 and forum-morning.ts:131 all go to forum_threads, not agent_trades.
   - confirm_swap_receipt (supabase/bobby-protocol/.../20260903000009_swap_receipts.sql) sets settled_at itself through FIFO (lines 104 and 151) and never touches stop or target.
   - In prod, no public function that mentions agent_trades references stop_price or target_price.

4. The database has no hidden dependency on it. pg_cron and pg_net are not installed in prod, and no function body mentions 'settle-trades'. The only triggers on agent_trades and agent_cycles are `bobby_outbox` journal triggers, which don't depend on this job.

5. Nothing that reads settled data depends on it. The circuit breaker at agent-run.ts:416-432 reads SELL rows with settled_at, which confirm_swap_receipt writes. agent-run.ts:496 (the daily loss budget) does the same. The win-rate code (agent-run.ts:95-98 and bobby-intel.ts:428) already treats missing trades_successful as neutral, and it is always missing today.

6. No caller exists outside vercel.json. There are no hits in src/, ios/Bobby/Sources, public/, middleware.ts or README. No GitHub workflow calls it: the only schedule is security.yml, weekly. x402 settlement is a separate path (settlePaidCall in api/_lib/mcp-challenges.ts) and isn't touched.

7. CI and the build still pass:
   - tsconfig.api.json:60 lists api/settle-trades.ts in `include`. I checked in scratchpad that tsc ignores a missing literal include entry (it exited 0), so `npm run check:api` / `npm run build` still pass.
   - ci.yml runs no script that imports this handler.

The plan does miss one thing. scripts/infra/freeze-behavior-selftest.mts:86 dynamically imports '../../api/settle-trades.ts'. It is not run in CI, but it is the phase-0 freeze gate that docs/infra/2026-09-02-phase0-handoff.md:344 tells people to run by hand. With the file gone, that script records a failure ('settle-trades: import') and exits 1.

Smaller leftovers the plan doesn't cover, all harmless:
- scripts/infra/writer-inventory.mts:56 keeps an inert key for the deleted file.
- The comment at api/_lib/request-security.ts:54-55 still names settle-trades.
- Old docs still mention it: docs/infra/2026-09-02-migration-safety-check.md:23 and :192, docs/infra/2026-09-02-phase0-handoff.md:170, docs/infra/2026-09-02-bobby-vs-defimexico-audit.md:152.
- docs/security/2026-09-03-base-uniswap-swap-rail.md describes settle-trades too. It is historical closure evidence, so leave it as is.

**Cómo corregido:** 1) In one commit, delete both the cron (vercel.json:159-162) and the functions entry (vercel.json:226-229). Vercel fails the build if a `functions` pattern matches no file, so do not delete the file and leave the entry. 2) Delete api/settle-trades.ts. 3) Delete the ['settle-trades', ...] row at scripts/infra/freeze-behavior-selftest.mts:86. Without this, the phase-0 freeze self-test fails. 4) Remove "api/settle-trades.ts" from tsconfig.api.json:60 and the 'api/settle-trades.ts' key from scripts/infra/writer-inventory.mts:56. Neither breaks anything if left, but both are stale. 5) Update the comments at api/agent-run.ts:83 and :398. The circuit breaker's input comes from confirm_swap_receipt FIFO SELL rows, and trades_successful is no longer written anywhere. Also update api/_lib/request-security.ts:54-55 to say "bobby-cycle by hand". 6) Update the docs: docs/infra/2026-09-02-phase0-handoff.md:28 and :170, docs/infra/2026-09-03-cutover-prep.md:94, docs/infra/2026-09-02-migration-safety-check.md:23 and :192. docs/infra/2026-09-02-bobby-vs-defimexico-audit.md:152 is optional. Leave docs/security/2026-09-03-base-uniswap-swap-rail.md alone, since it is historical evidence. 7) No migration. Keep the agent_trades columns and the agent_trades_cycle_id_idx index. 8) Run `npm run build` and `npx tsx scripts/infra/freeze-behavior-selftest.mts` (it should report ALL PASSED) plus `npx tsx scripts/infra/writer-inventory.mts`. After deploy, check that the Vercel project's cron list shows only bobby-cycle, forum-resolve and the realtime-session sweep.

### 9. Stop preloading recharts and draco on every route

**Por qué.** vite.config.ts:85 (verified) sets manualChunks charts:['recharts']. That pulls clsx into the charts chunk, the entry's cn() imports it, and index.html modulepreloads charts-*.js (456,676 B raw / 121,426 B gz) on /desk and /protocol. No live component uses recharts: all 30 importers are legacy, and NucleoChart is hand-rolled SVG. index.html:112 (verified) preloads /draco/draco_decoder.wasm (192,420 B) on every page, though Draco is only needed for the GLB mascots. Confidence: high.

**Cómo.** 1) vite.config.ts: delete the `charts: ['recharts']` entry, or add 'clsx' and 'tailwind-merge' to the vendor chunk. 2) index.html: delete line 112 (the draco preload). 3) npm run build and confirm dist/index.html no longer modulepreloads charts-*.js. 4) Load /desk and open the profile sheet to confirm the 3D mascot still renders.

**Ahorro:** bandwidth only · **Velocidad:** ~180 KB gz (~650 KB raw) less on first load of /desk and /protocol · **Riesgo:** Very low: build config and a preload hint only.

### 10. Put hard caps and a ledger on every paid model call

**Por qué.** One OPENAI_API_KEY is read by 18 call sites (desk, TTS, realtime, cycle, legacy anonymous endpoints). It is also set on a stale preview branch (feat/phase0-hardening). Only desk-debate writes bobby_llm_usage, which has 0 rows until PR #103 ships. llm_calls has no writer, and agent_cycles.cost_usd is always 0. bobby-voice-free's paid fallback allows 3,000 calls/day (bobby-voice-free.ts:55): ~$39/day worst case, against ~10 calls/day today. Anthropic spend (Sonnet 5.5 on Profundo/Máximo) starts with PR #103. Confidence: high.

**Cómo.** 1) OpenAI dashboard: create project keys with monthly hard limits (desk / voice / protocol+x402). Set OPENAI_API_KEY for the desk and OPENAI_VOICE_KEY for tts.ts:234 and realtime. Remove OPENAI_API_KEY from the feat/phase0-hardening preview scope. 2) Anthropic console: set a monthly spend limit before merging PR #103. 3) Code: lower the tts-global cap from 3000 to 500 at bobby-voice-free.ts:55. 4) Route bobby-cycle (llm.ts:47), judge-mode and the paid TTS path (tts.ts:220-248) through logLlmUsage, each with its own surface name.

**Ahorro:** Caps worst-case exposure (e.g. TTS ~$39/day → ~$6.5/day) and makes all spend visible · **Velocidad:** none · **Riesgo:** A cap set too low stops the desk mid-day. Give the desk key headroom and alert at 50%.

### 11. Daily Cycle: keep it through the 2026-10-01 Sommia review, then pause it together with its public dependents

**Por qué.** Crons (verified): vercel.json:155-158 bobby-cycle '0 12 * * *' and :163-166 forum-resolve '30 12 * * *'. The cost is tiny: ~$0.008/run ≈ $0.25/mo. In the last 30 days there were 29 cycles (avg 13.4 s). September had 0 Base commits and 0 Moltbook posts, and there are 0 active telegram_subscriptions. So pausing buys focus and fewer external side effects, not money.

It is NOT rendered on the web desk: 'cycle' appears nowhere in src/components/nucleo, src/components/companion or the prod desk chunk. It shows up on /protocol (BobbyProtocolLanding.tsx:395, 644, 673-680; ArchitectureFlow.tsx:17, 49), BobbyDocsPage.tsx:293 and /protocol/harness.

Things coupled to it:
- protocol-heartbeat.ts:435/490 turns 'degraded' 26 h after the last cycle.
- The x402 tool bobby_judge judges the latest public thread by default (judge-mode.ts:60-68).
- On the branch, loadBobbyRecord (_lib/desk-debate.ts:93-117) reads the cycle's threads for Profundo/Máximo evidence.

The 1,944-line handler also carries dead branches:
- A tweet titled "$100 Challenge Update" (:1647-1680); the challenge closed 2026-05-04.
- Moltbook posting (:1721-1832).
- telegram-deliver (:1682-1697).
- A yield debate (:1252-1450) that inserts into agent_yield_events/positions, tables that don't exist.

forum-resolve's first run is today at 12:30 UTC, with 70 expired pending calls to process sequentially inside maxDuration 60. Confidence: high on the facts, medium on timing.

**Cómo.** Now: watch today's 12:30 UTC forum-resolve run for a timeout.

After 10-01:
1) Remove the crons at vercel.json:155-158 and :163-166 (forum-resolve once its backlog drains) and the functions entries at :222 and :254.
2) Change protocol-heartbeat.ts:435/490 so overall health doesn't require a cycle.
3) Replace the 'daily 12:00 UTC' copy on /protocol, ArchitectureFlow and BobbyDocsPage.
4) Point bobby_judge's default at the latest desk or public thread, or require an explicit thread id.
5) Update bobby-protocol-stats.ts:513-514.

Either way: delete the Twitter, Moltbook, Telegram and yield branches, and unset MOLTBOOK_API_KEY. Keep forum_threads/posts readable; they feed desk evidence and the public record. Ask Anthony where he saw 'Daily Cycle' (likely /protocol or iOS).

**Ahorro:** ~$0.25 LLM + ~60 function runs/mo · **Velocidad:** none on the desk · **Riesgo:** /protocol's 'last debate' and the calls record go stale, and the heartbeat shows DEGRADED unless edited. Profundo/Máximo's 'Bobby's record' evidence stops growing, and the public commitment cadence stops.

**Verificación: NO segura tal como está escrita.** Verdict: pausing the cycle after 10-01 doesn't break anything live. Every consumer degrades to stale or empty data. But the plan as written (especially its "either way" deletions) has two CI couplings it doesn't mention, one factual error, and several consumers it leaves out. I'm marking it unsafe until those are fixed.

VERIFIED FACTS (high confidence):
- Cron lines hold: vercel.json:155-158 has bobby-cycle "0 12 * * *" and :163-166 has forum-resolve "30 12 * * *". Function entries are at :222 and :254.
- Prod SQL (qbvdqkknnuweatptjohi):
  - 29 agent_cycles in 30d, avg 13.4 s, last at 2026-09-28 12:00.
  - 70 pending calls with entry_price, all 70 expired: ETH 38, SOL 24, BTC 7, NVDA 1, created 06-09 to 08-17. 0 are on-chain eligible (created before ONCHAIN_V2_SINCE 2026-08-18), so the drain spends no recorder gas.
  - agent_yield_positions and agent_yield_events don't exist (to_regclass null).
  - pg_cron isn't installed. The only triggers on agent_cycles, forum_threads, forum_posts and telegram_subscriptions are the bobby_outbox journal triggers, so nothing breaks at the DB level.
- Stronger than the proposal says: all 28 public cron threads in the last 30d have conviction_score NULL, and the last priced call was 2026-08-17. The cycle has added nothing to the record for 43 days.
- "0 active" Telegram subs holds only because of expiry. The single row still has status='active', but it expired 2026-04-22 (chain 196, OKB). telegram-deliver.ts:161-165 filters expires_at >= now.

BREAK 1 (CI, high confidence): deleting the yield branch in full turns CI red.
- scripts/test-api-security.mts:219 asserts bobby-cycle.ts matches /extractPrefixedLine\(cioPost, 'VERDICT:', 4_000\)/.
- The only match is inside parseYieldVerdict (bobby-cycle.ts:474-521), the yield helper.
- test:api-security runs in .github/workflows/ci.yml.
- Deleting only the call site (:1328) passes, because no-unused-vars is 'warn' and CI lints with --quiet.
- Also: the branch is already skipped on cron (kind !== 'cron', :1258), but the agent_yield_positions query (:1246-1249) still runs on every cycle.

BREAK 2 (CI, conditional, medium-high confidence): if step 2 removes the heartbeat's agent_cycles read instead of only changing the formula, CI fails.
- The read is protocol-heartbeat.ts:322-326.
- scripts/test-remediation-r2.mts asserts scopedReads >= 4 across harness-events, protocol-heartbeat, bobby-intel and conviction-tiers.
- I count exactly 4 today: harness-events.ts:59, protocol-heartbeat.ts:323, bobby-intel.ts:412, conviction-tiers.ts:44.

BREAK 3 (CI, only if someone goes further than the proposal): deleting api/bobby-cycle.ts itself crashes three CI suites that read the file.
- test-api-security.mts:192, test-remediation-r2.mts:397 and test-protocol-write-safety.mts:168 all read it and would fail with ENOENT.
- test-protocol-write-safety also asserts the single action:'commit' plus PROTOCOL_CUTOVER_FREEZE.
- scripts/infra/preview-smoke.mts:59-60 expects POST /api/bobby-cycle to return 401 or 503, not 404.

FACTUAL ERROR: the proposal says forum-resolve runs "inside maxDuration 60". The code has 60 (forum-resolve.ts:37), but vercel.json:222-225 sets maxDuration 30. Which one Vercel applies is unverified, so the timeout risk on today's 12:30 run is higher than stated. Progress is saved per thread (PATCH each), so later runs still drain the rest.

MISSED CONSUMERS (they go stale, they don't break; high confidence):
- MCP tools in mcp-http.ts (the agent surface next to x402):
  - bobby_brief (:175-222) and bobby_recommend (:229-285) read only the latest public pending priced thread.
  - bobby_stats reads checkpoint?hours=24 (checkpoint.ts:68).
  - Because there have been no priced calls since 08-17, today's forum-resolve run makes bobby_brief and bobby_recommend return no signal whether or not the cycle is paused. The copy "Bobby debates every 15 minutes" (:252) is false either way.
- bobby-intel.ts:405-418 (recentCycles, which drives winRate/mood) feeds the desk voice-tool and the x402 tool bobby_analyze.
- voice-tool get_protocol_stats (voice-tool.ts:253) quotes on-chain commitments, so the companion will cite frozen numbers.
- bobby_judge (x402) re-runs gpt-4o on every paid call, with no cache (judge-mode.ts:192-238). With the default thread, a paid call judges an old debate again.
- Copy the proposal doesn't list:
  - BobbyProtocolLanding.tsx:621
  - BobbyHarnessConsolePage.tsx:142
  - BobbyArchitecturePage.tsx:151 ('5min', 'live' — already wrong)
  - proof/settlements.json:42 ('8h' — already wrong)

NOT A BREAK: MOLTBOOK_API_KEY is also read by cron-activity.ts:51. That function isn't in the crons list, so unsetting the key is consistent with the rest of the plan.

UNVERIFIED: "0 Base commits in Sept" and "0 Moltbook posts". Both are consistent with every conviction in the last 30d being null, but I didn't check either on-chain or on Moltbook.

Nothing in iOS depends on the cycle: git grep of ios/Bobby/Sources on origin/main shows it calls only desk-debate, bobby-access, progress, trader-land, voice-tool and similar. The web /desk doesn't show the cycle either: CompanionDeskPage → NucleoDesk, and there is no "cycle" string in src/components/nucleo or src/components/companion.

**Cómo corregido:** Keep everything running through the 2026-10-01 Sommia review.

Today: watch the 12:30 UTC forum-resolve run.
- Assume the limit may be 30 s (vercel.json:222-225), not 60.
- If it times out, re-run it manually with x-record-secret until the 70 pending calls reach 0 (SQL: resolution='pending' AND entry_price IS NOT NULL).
- Don't make "backlog drained" a condition for removing the cron. Set a cutoff date and treat anything still pending after it as unresolvable.

After 10-01, ship one PR:
1. Remove the bobby-cycle and forum-resolve crons (vercel.json:155-158, :163-166) and the function entries at :222-225 and :254-257.
   - Keep api/bobby-cycle.ts and api/forum-resolve.ts. Three CI suites and preview-smoke read the cycle file.
2. Heartbeat: at protocol-heartbeat.ts:435, make cycleHealth something like 'paused'. At :490, drop it from the 'overall' condition.
   - Keep the agent_cycles read at :322-326. Otherwise test-remediation-r2's scopedReads >= 4 check fails.
3. Update the copy on:
   - BobbyProtocolLanding.tsx:395, 621, 644 and 673-680
   - ArchitectureFlow.tsx:17 and 49
   - BobbyDocsPage.tsx:293
   - BobbyHarnessConsolePage.tsx:142
   - BobbyArchitecturePage.tsx:151
   - bobby-protocol-stats.ts:513-515 (mark cycle and resolver as paused)
   - proof/settlements.json:42
4. MCP (mcp-http.ts):
   - bobby_judge: require thread_id, or default to a desk thread, so paid calls don't keep judging the same old debate.
   - bobby_recommend and bobby_brief: change the "every 15 minutes" copy (:252, :282) to say public calls are paused, or point them at desk output.
5. Legacy branches in bobby-cycle.ts:
   - Delete the tweet (:1647-1679), telegram-deliver (:1681-1696) and Moltbook (:1698-1839) branches.
   - For yield, delete the branch (:1236-1461) together with parseYieldVerdict (:474-521), and in the same PR remove or replace the test-api-security.mts:219 assertion.
   - Alternatively, keep parseYieldVerdict and delete only the call site.
   - Run npm run test:api-security, test:remediation-r2, test:protocol-write-safety and build before pushing.
6. Unset MOLTBOOK_API_KEY. cron-activity also reads it, but that function isn't scheduled.

Decisions for Anthony:
- Accept a frozen public record: heartbeat, /protocol 'last debate', desk Profundo/Máximo 'Bobby's record', and the voice stats.
- Note that it has already been frozen since 2026-08-17: every cycle in the last 30 days abstained with null conviction.
- Ask where he saw "Daily Cycle". It isn't in iOS sources or the web desk on origin/main, only in /protocol, the docs and the harness page.

### 12. Retire the legacy Realtime voice room and the personal-agent stack behind it

**Por qué.** The desk profile's 'Voice' toggle (NucleoProfile.tsx:144; NucleoDesk.tsx:119, 372-374) navigates to /agentic-world/bobby/voice-room. That route loads BobbyAgentTraderPage (AdamsChat/VoiceRoom, 192 KB chunk), which uses useRealtimeVoice → /api/realtime-session (gpt-realtime-2.1). Usage: 3 voice-budget rows ever, rl:voice-call 2 hits in 7 days, and iOS never calls it.

The same UI keeps these alive: openclaw-chat (legacy chat), bobby-router, agent-run (1024 MB/120 s), user-cycle, agent-setup, agent-confirm (writes agent_trades), agent-messages (last insert 2026-04-22), my-threads, user-interests, bobby-digest (only caller AdamsChat.tsx:1364), feedback (Brevo, key unset), forum-publish and telegram-connect. That is 4 public OpenAI paths and ~2,500 lines. It is also the only reason the per-minute sweep exists. Confidence: high on usage; keeping or cutting it is a product decision.

**Cómo.** 1) Remove the Voice row and the navigate branch in NucleoProfile/NucleoDesk.
2) Delete the route at App.tsx:474-481, BobbyAgentTraderPage, components/adams and hooks/useRealtimeVoice.ts.
3) Delete api/realtime-session.ts and api/_lib/{realtime-config,voice-budget,voice-call-owner}.ts, the sweep cron at vercel.json:167-170 and the functions entry at :274-277.
4) Delete the 12 personal-agent/chat endpoints listed above, plus vercel.json :182 (agent-run) and :258 (bobby-digest).
5) Remove DeployAgentPage, the KineticShell 'MY AGENT' button, FeedbackWidget and ProactiveNotification.
6) Unlink /agentic-world/bobby/agents from the /protocol footer (BobbyProtocolLanding.tsx:849), or drop its my-threads call.
7) Unset BREVO_API_KEY.

**Ahorro:** ~$1–4 realtime (low confidence) + ~43k invocations/mo; removes 4–5 public OpenAI spend paths · **Velocidad:** Less profile code on the desk; lightweight-charts and a 192 KB chunk leave the build · **Riesgo:** Loses the only full-duplex voice on web. The 2 agent_profiles owners, inactive since March/April, lose their personal agents.

**Verificación: NO segura tal como está escrita.** As written, this plan breaks the x402 paid tools, the live /desk swap card and the build, the CI suites, and probably Bobby Live in the current App Store build.

1) x402 agent payments break (confidence: high). The paid MCP tools bobby_analyze and bobby_debate (PREMIUM_TOOLS, api/mcp-http.ts:52, gated by x402 at :849-930) do their work by POSTing to `${BASE_URL}/api/openclaw-chat` (api/mcp-http.ts:94). The legacy api/mcp-bobby.ts:64 does the same. If openclaw-chat is deleted, every premium call fails after the payment check. That is the agent revenue path the founder said to keep. Prod (qbvdqkknnuweatptjohi): mcp_payment_challenges holds 435 bobby_analyze, 3 bobby_debate and 1 bobby_judge challenges, all 'pending', the latest on 2026-09-28 20:34. mcp_payment_receipts has 0 rows, so nobody has paid yet, but the funnel is live. The CI suite test:mcp-payment-transport stubs /api/openclaw-chat (scripts/test-mcp-payment-transport.mts:48), so CI would stay green and hide the break. Public docs also advertise the endpoint (skills/bobby-trader/SKILL.md:79).

2) Deleting src/components/adams breaks the live /desk and the build (confidence: high). NucleoDesk.tsx:22 imports DeskSwap, and components/companion/DeskSwap.tsx:17 imports SwapConfirm from '@/components/adams/SwapConfirm'. That is the real-money Base swap card on web /desk. Other live imports from the same folder:
- components/nucleo/deskData.ts:7 imports the ChartLevel type from adams/MarketCanvas.
- kinetic/BobbyMascot.tsx:14 and BobbyMascot3D.tsx:12 import OrbState from adams/VoiceOrb.
- The CI suite test:remediation-r2 reads src/components/adams/SwapConfirm.tsx (scripts/test-remediation-r2.mts:239).

vite build would fail with "Could not resolve". The claimed saving on lightweight-charts is also only partial: src/components/charts/TradingViewChart.tsx still uses it, and AgentForumPage imports that chart.

3) CI goes red (confidence: high). test:api-security reads api/agent-setup.ts and api/user-cycle.ts and asserts on their content (scripts/test-api-security.mts:187, 189, 211, 213-214). test:remediation-r2 reads api/my-threads.ts (:326) and api/agent-run.ts (:388-389). Both suites run in .github/workflows/ci.yml.

4) The live iOS build probably still calls /api/realtime-session (confidence: medium). The claim "iOS never calls it" is only true of the HEAD sources. The field build 1.1 (26), on branch ios/release-24 at 6d656ed with project.yml MARKETING_VERSION 1.1 and CURRENT_PROJECT_VERSION 26, calls it: RealtimeVoice.swift:199 POSTs `api/realtime-session` with a Bearer token, and ContentView.swift:70 and :384 start it. Its microphone permission text says audio goes to OpenAI in real time. Memory notes say 1.1 (26) went live on 2026-09-18, and 1.5 (40/41) was only uploaded, not submitted, as of 2026-09-26. So 1.1 (26) is most likely still the App Store version, and its Bobby Live would fail. Realtime usage is recent: voice-budget:v1 and rl:voice-call were last written on 2026-09-28 at 19:46 and 19:43 UTC.

5) Other live callers the plan misses (confidence: high on the calls, medium on how many people reach them):
- my-threads is also called by AgentForumPage.tsx:394. /agentic-world/forum is linked from Navbar.tsx:77, MainLayout.tsx:83, BobbyB2BPage.tsx:67 and BobbyLandingPage.tsx:35.
- user-interests is called by src/lib/router/detectIntent.ts:128.
- agent-run is called by components/agent-radar/AgentDashboard.tsx:486.
- agent-messages is called by components/agent-radar/AgentRadarLanding.tsx:38.
- The adams folder is also imported by PTSChatOnly.tsx and PTSTerminalPage.tsx. They have no routes, but they would be left dangling.

I could not confirm whether detectIntent and agent-radar are reachable: the disk filled up (ENOSPC) and stopped the final greps.

6) Docs claims left stale: BobbyArchitecturePage.tsx:150 lists agent-run as a live 8h main cycle, okx-skills/bobby-debate/SKILL.md:53 and skills/agent-radar/SKILL.md:43 curl /api/agent-run, and the /protocol footer links to /agentic-world/bobby/agents (BobbyProtocolLanding.tsx:849).

7) Minor: the plan cites NucleoDesk.tsx:119 and 372-374, but this worktree (feat/analysis-levels-referrals) has the navigate at line 436. On origin/main it is at 326-327, next to the freeVoice flag at 116. Its "last insert 2026-04-22" for agent_messages checks out: 356 rows, none in the last 30 days.

Checked and fine: the only cron tied to this stack is realtime-session?sweep=1 (vercel.json:167-170). agent-run (:182) and bobby-digest (:258) have only a functions entry, no cron. The daily bobby-cycle cron (vercel.json:155-157) still writes user_digests (28 'scheduled' rows in 30 days, last on 2026-09-28 12:01), and the only UI reader of bobby-digest is AdamsChat.tsx:1364, so cutting the reader breaks nothing public. user_feedback has 0 rows, so dropping FeedbackWidget and the feedback endpoint is safe. I did not audit DB triggers on agent_profiles, agent_messages or agent_trades.

**Cómo corregido:** Do this in phases instead of one sweep.

Phase A (safe now):
- Remove the desk Voice row and the navigate to voice-room (NucleoProfile.tsx:141-144, NucleoDesk.tsx:436 on HEAD).
- Remove the /agentic-world/bobby/voice-room route (App.tsx:474-481), BobbyAgentTraderPage, and only these adams files: VoiceRoom, LiveOrb, AdamsChat, ProactiveNotification, FeedbackWidget. Remove src/hooks/useRealtimeVoice.ts too.
- Before deleting anything else in adams, move the shared pieces out:
  - SwapConfirm.tsx goes to src/components/companion/. Update DeskSwap.tsx:17 and the path in scripts/test-remediation-r2.mts:239.
  - The ChartLevel type goes to src/lib or nucleo. Update deskData.ts:7.
  - The OrbState type goes to src/lib. Update BobbyMascot.tsx and BobbyMascot3D.tsx.
  - Delete or re-point PTSChatOnly and PTSTerminalPage.
- Then run npm run build plus the full CI list from ci.yml.

Phase B (personal-agent endpoints):
- Delete agent-setup, user-cycle, agent-confirm, agent-messages, my-threads, user-interests, bobby-router, bobby-digest, feedback, forum-publish and telegram-connect together with DeployAgentPage and the KineticShell MY AGENT button.
- In the same PR:
  - Edit scripts/test-api-security.mts:187-214 to drop the agent-setup and user-cycle assertions.
  - Edit scripts/test-remediation-r2.mts:326 (my-threads) and :388-389 (agent-run).
  - Remove or gate the calls in AgentForumPage.tsx:394, BobbyAgentsPage.tsx:34, detectIntent.ts:128, AgentRadarLanding.tsx:38 and AgentDashboard.tsx:486.
  - Unlink /agentic-world/bobby/agents from BobbyProtocolLanding.tsx:849.
  - Fix the docs claims in BobbyArchitecturePage.tsx:150 and the SKILL.md files.
  - Update scripts/infra/preview-smoke.mts, freeze-behavior-selftest.mts and writer-inventory.mts.
- agent-run can go in this phase too once AgentDashboard is removed; it has no cron.

Keep api/openclaw-chat.ts (and api/_lib/transcript-receipt.ts if still imported) until mcp-http.ts:94 and mcp-bobby.ts:64 are re-pointed for bobby_analyze and bobby_debate. The new target should be the desk-debate engine (api/_lib/desk-debate.ts) or an internal-auth-only entry point. After that, update the openclaw-chat stub in test-mcp-payment-transport.mts:48 to the new target, and run one real x402 challenge→pay→redeem check. Only then delete openclaw-chat.

Phase C (realtime): keep api/realtime-session.ts, api/_lib/{realtime-config,voice-budget,voice-call-owner}.ts and the per-minute sweep until iOS 1.5+ is approved and 1.1 (26) is no longer what App Store users run. Alternatively, replace the handler with a small stub that returns 410 {error:'voice_retired'} and handles the iOS stop action, confirm that 1.1 (26) shows that error cleanly, and then drop the sweep cron (vercel.json:167-170) and the functions entry (:274-277). Unset BREVO_API_KEY last. Confirm first in App Store Connect which build is live.

### 13. Load wallet/AppKit, three.js and analytics only where needed

**Por qué.** Web3ContextProvider wraps every route (App.tsx:194-198), and src/config/reown.ts:38-51 calls createAppKit at import time with analytics:true and 6 networks. The prod entry index-Do1KwEzA.js is 2,011,513 B raw / 550,644 B gz. On the /desk risk screen, before any wallet action, the browser called api.web3modal.org ×3, pulse.walletconnect.org, cca-lite.coinbase.com ×5 and fonts.reown.com ×7, which is third-party telemetry before consent. It also prefetched the AppKit swap/send/onramp chunks.

three.js (~553 KB raw) and BobbyMascot3D load at desk mount through static imports (NucleoProfile.tsx:8, CompanionOverlays.tsx:5), yet the 3D avatar only renders in the profile sheet. The hidden `<ProgressSync/>` at NucleoDesk.tsx:731 puts useAppKit on the desk mount path. @vercel/analytics (App.tsx:215) and speed-insights (main.tsx:10) ship on every page, while the pageviews API returned 'Web Analytics not found'. Confidence: high for the measurements, medium for the target size.

**Cómo.** 1) Remove Web3ContextProvider from RootLayout. Add a React.lazy WalletBoundary (config/reown + WagmiProvider + QueryClientProvider) only around DeskSwap/SwapSheet, wallet SIWE sign-in, /protocol/calls and Trader Land.
2) reown.ts: set features.analytics:false and drop polygon, arbitrum and optimism (and mainnet unless ENS is needed).
3) ProgressSync.tsx and SignInPrompt.tsx open the wallet through the boundary. Replace the hidden ProgressSync with a plain useProgressSyncCredential hook.
4) React.lazy NucleoProfile and CompanionOverlays, with /mascots/{id}.webp as the placeholder.
5) Check the Vercel dashboard; remove Web Analytics and Speed Insights if nobody reads them.

**Ahorro:** Possible Speed Insights/Analytics add-on fee (unverified); bandwidth · **Velocidad:** Desk static JS from ~4.3 MB raw / 1.23 MB gz to ~1.1–1.2 MB raw / ~350 KB gz, together with legacy-web-shell-cut (estimate, medium confidence); zero third-party calls on first load · **Riesgo:** Wallet SIWE sign-in and the swap sheet must still work inside the boundary. Test Apple, Google and wallet sign-in plus a swap quote on a preview.

### 14. Desk focus: move swaps off the verdict, stop in-desk Trader Land seeds, delay gamification pop-ups

**Por qué.** Under every LONG verdict the desk renders DeskSwapCard (NucleoDesk.tsx:649-653), plus a WalletBalancePill in the header (:504) and SwapSheet (:797). bobby_swap_receipts has 1 row ever (the 2026-09-09 $1 canary), and this UI forces wagmi/AppKit into the desk bundle. After each read, LandSeedCard (:660) fetches a 67 KB manifest and /api/trader-land (8 lands and 6 placements in total). ToolUnlockOverlay (:812) can force the profile sheet open over a first verdict. Per memory, the founder's direction is a voice AI companion, not a trading app. Confidence: medium (product call).

**Cómo.** 1) Remove swapCard, WalletBalancePill and SwapSheet from NucleoDesk.tsx, and the 'Swap on Base' row from NucleoProfile.tsx:133-135. If swaps must stay, move them to a lazy /swap route; the api/base-swap and llms.txt contract stays unchanged.
2) Stop rendering LandSeedCard in the desk. Keep the /trader-land routes by direct link for the 8 lands; iOS is unaffected.
3) Lazy-load gear, pets, evolution, catalog and share in the profile, and hold drop/evolution overlays until N reads.
4) Keep the companion picker, voice persona and discipline XP (the daily cap of 3 must stay compatible with iOS).

**Ahorro:** $0 · **Velocidad:** Fewer chunks at desk mount (wallet, land manifest, overlays); a cleaner first verdict · **Riesgo:** The Base Batches / Builder Quest 'swap on LONG' demo loses its in-desk entry, and Trader Land users lose their in-desk path.

**Verificación: NO segura tal como está escrita.** Verdict: nothing technical breaks, but step 1 as written would falsify a submitted Base Batches claim, and several premises in the proposal are wrong. Confidence is high unless noted.

What checks out:
- iOS is unaffected. It loads a bundled Nucleo engine (ios/Bobby/Sources/Nucleo/NucleoWebView.swift:90, loadFileURL), not the React /desk. BobbyApp.swift:2 says "no wallet, no swaps".
- x402, the MCP tools and api/base-swap are untouched. No cron or DB trigger is involved.
- No CI test breaks. .github/workflows/ci.yml runs test:desk-audit, which imports src/lib/desk-swap-validation.ts, so that file must stay. It also runs test:trader-land-api, which tests the API only. No CI test reads NucleoDesk.tsx or NucleoProfile.tsx source. scripts/test-trader-land-growth.tsx renders LandSeedCard on its own, and CI doesn't run it.
- Prod DB counts (qbvdqkknnuweatptjohi), all confirmed:
  - bobby_swap_receipts: 1 confirmed row, 2026-09-09 13:37 UTC.
  - tl_lands: 8. tl_placements: 6.

What would actually break or be contradicted:
1. **Base Batches claim.** The submitted application (docs/base-batches-004-application.md:161-169, 188-191, 279-280, untracked in the main checkout) says users "swap Base assets ... through Uniswap V3" on the Desk at bobbyprotocol.xyz/desk. Removing every swap entry makes that claim false at the live URL before Demo Day (Nov 17). On mobile, the NucleoProfile row (HEAD :133-135) is the only way into the swap sheet besides the LONG card. The header pill (NucleoDesk.tsx:567) is desktop-only. There is no /swap route in src/App.tsx today.
2. **Step 3 contradicts live copy.** NucleoDesk.tsx:501 tells users "first read drops the first tool". Drops live only in React state (NucleoDesk.tsx:143, 323). Holding them for N reads means they are lost on reload, and meanwhile that gear is hidden from the sphere (the attachments filter at :517-520). It also breaks web/iOS parity: the iOS design is gear every 100 XP, the first one after the first read.
3. **Possible lint failure (unverified).** If LandSeedCard is removed but the `landEvent` state stays (:141, :214, :321, :349, :421), the unused variable may fail `npm run lint -- --quiet` in CI. I couldn't check the eslint config because the disk filled up (ENOSPC).

Wrong premises in the proposal:
- **Line numbers match neither branch.** HEAD: pill :567, swapCard :755-765, LandSeedCard :766, SwapSheet :912, ToolUnlockOverlay :927. origin/main: :459, :576-586, :587, :738, :753.
- **"Forces wagmi/AppKit into the desk bundle" is false.** App.tsx:193-217 wraps every route in Web3ContextProvider (WagmiProvider), and src/config/reown.ts:38 calls createAppKit when the module loads. The entry chunk dist/assets/index-CNAr7L7y.js (2.0 MB) already contains createAppKit. Removing the swap UI only takes DeskSwap/SwapConfirm code out of the 165 KB CompanionDeskPage chunk. The speed gain is overstated.
- **"67 KB manifest" is overstated.** It is 67,198 bytes raw but 4,087 bytes gzipped. It is fetched once per page session (module-level manifestPromise, src/lib/trader-land/public.ts:43-54), and only after a read.
- **"Trader Land users lose their in-desk path" is false.** The profile tool belt and the Trader Land row (NucleoProfile.tsx:101, :136) stay. Seeds are planted server-side by /api/progress, and the horizon extend also exists at TraderLandGatePage.tsx:594. All 43 tl_inventory seeds are at horizon 24 h, so no one has ever used the in-desk 3d/7d picker. Trader Land is still active, though: 12 seeds from 3 identities in the last 7 days, the latest today at 09:26 UTC.
- **"Forces the profile sheet open" is overstated.** ToolUnlockOverlay is a full-screen overlay (z-50) that covers the first verdict. The profile only opens after the user taps "Equip it" (CompanionOverlays.tsx:50).

**Cómo corregido:** 1) **Swaps: founder decision, and keep swapping reachable.**
   - Low-risk version: drop only the DeskSwapCard under the LONG verdict (NucleoDesk.tsx:755-765). Keep the SwapSheet entries (desktop pill :567, profile row NucleoProfile.tsx:133-135) so the Base Batches claim stays true.
   - Load DeskSwap.tsx with React.lazy so SwapConfirm leaves the desk chunk.
   - Don't claim a wagmi/AppKit saving: they're loaded at the root (App.tsx:197, reown.ts:38). Moving them out would mean scoping Web3ContextProvider to wallet routes, which is a separate and larger change.
   - If he removes swaps entirely: first edit docs/base-batches-004-application.md and add a routed /swap page that renders SwapSheet.
   - Keep src/lib/desk-swap-validation.ts either way, because test:desk-audit in CI imports it.

2) **LandSeedCard: safe to remove from the desk.**
   - Also remove the landEvent state and setters (:141, :214, :321, :349, :421) so lint stays clean.
   - Keep the component file for scripts/test-trader-land-growth.tsx.
   - Optionally show a one-line toast ("planted a seed") so the profile copy "Every read plants something" (NucleoProfile.tsx:136) stays true.
   - The extend action stays available at /trader-land (TraderLandGatePage.tsx:594).

3) **Overlays: don't hold drops for N reads.**
   - Instead, show ToolUnlockOverlay/EvolutionOverlay only after the verdict is dismissed or the user asks again, or use a small non-modal chip.
   - If the rule changes, update the copy at NucleoDesk.tsx:501.
   - Leave XP, drop thresholds and the daily cap of 3 untouched (shared with iOS through /api/progress).
   - Lazy-loading GearCatalog, ToolDetail and the share flow is fine.

4) **Before doing anything**, fix the line references to HEAD, and run `npm run build` plus `npm run lint -- --quiet` and `test:desk-audit` before any merge.

### 15. Clean Vercel env and dormant secrets: X Layer key, live-trading flag, legacy Supabase, stale previews, waitlist, droplet

**Por qué.** `vercel env ls` (names only) shows 92 prod names; 33 are read by no runtime code. These include DEX_ALLOWED_ROUTERS/SPENDERS_196/8453 (per docs/security/2026-09-03-base-uniswap-swap-rail.md:64) and 29 deploy-script parameters.

Prod still holds:
- BOBBY_RECORDER_KEY, an X Layer private key used only off Base (protocol-write-safety.ts:58).
- ENABLE_LIVE_TRADING, read by onchainos-signal.ts:66 and onchainos-status.ts:44; onchainos-status reports it publicly.
- The legacy SUPABASE_URL, SB_URL, SUPABASE_SERVICE_KEY and SUPABASE_SERVICE_ROLE_KEY. They are 174 days old, predate bobby-protocol, and act as a silent fallback in api/_lib/bobby-db.ts:38-45.

44 vars sit on already-merged preview branches: feat/phase0-hardening (service-role, OpenAI and Anthropic keys), feat/trackrecord-v2 (BASE_SEPOLIA_RECORDER_KEY) and feat/base-migration.

OKX_* are set only in Development. So the pending OKX key revocation is not blocked by prod, and bobby-intel's whale-signal block (bobby-intel.ts:101-130, 716-830) already returns [] in prod.

The waitlist endpoints (bobby-early-access.ts, waitlist-export.ts) have no caller; there is 1 row plus an Apps Script pull. Memory says the full-access Resend key leaked into settings.local.json. bobby-wallet falls back to a DigitalOcean droplet whose billing is unverified.

Confidence: high for the env names. Medium for the OKX point: the API slice believed prod still uses those keys.

**Cómo.** Founder, in Vercel:
- Delete the 33 unused prod names.
- Delete BOBBY_RECORDER_KEY after sweeping any funds and confirming PROTOCOL_CHAIN is Base.
- Delete ENABLE_LIVE_TRADING.
- Delete the 4 legacy SUPABASE_* after the bobby-db.ts fallback is removed in code.
- Delete all branch-scoped Preview vars of the 3 merged branches.
- Delete OKX_* from Development, then revoke the key at OKX.

Code:
- Delete the bobby-intel whale blocks and the legacy fallbacks in api/_lib/bobby-db.ts.
- Export the 1 bobby_early_access row, disable the Apps Script trigger, delete bobby-early-access.ts and waitlist-export.ts, and unset WAITLIST_*.

Also:
- Revoke the leaked full-access Resend key.
- Check the DigitalOcean account and destroy the droplet if it is running.

**Ahorro:** $0–24 if the droplet is still billed (unverified); otherwise risk reduction · **Velocidad:** none · **Riesgo:** Deleting a name that something still reads. Grep each name before removing it, and keep the values in a password manager.

**Verificación: NO segura tal como está escrita.** Nothing user-facing breaks if the steps are done precisely. Prod is origin/main: /api/bobby-health shows sha ca23c2a, ref main, db ref qbvdqkknnuweatptjohi. As written, though, the proposal has one unacknowledged break and several factual errors.

1. BREAK (high confidence): deleting the 4 legacy SUPABASE_* vars and removing the bobby-db.ts fallback retires the documented DB rollback.
   - docs/infra/2026-09-03-cutover-prep.md:152 and :169 define the rollback as: replay-outbox, then "unset BOBBY_SUPABASE_*", then redeploy, then unfreeze legacy.
   - That relies on the fallback in bobby-db.ts:37-45 (BOBBY_SUPABASE_URL → SUPABASE_URL → … → SB_URL; service key BOBBY_* → SUPABASE_SERVICE_ROLE_KEY → SUPABASE_SERVICE_KEY). It also relies on those 4 prod vars, created 174 days ago and set only in Production.
   - The live /api/bobby-health control note still says "legacy frozen as rollback target".
   - Prod itself is unaffected: BOBBY_SUPABASE_URL, BOBBY_SUPABASE_SERVICE_ROLE_KEY and BOBBY_SUPABASE_ANON_KEY are all set in Production and win the lookup.
   - No other runtime code reads the legacy names. src/lib/agent/runner.ts:12-13 reads them directly, but nothing imports it.
   - CI is unaffected: ci.yml sets dummy BOBBY_SUPABASE_*.
   - Development has only the legacy SUPABASE_*/SB_URL and no BOBBY_*. After the fallback is removed, a local `vercel env pull` fails loudly. Today it silently points at the legacy DB.

2. COUNT IS WRONG (high confidence): 32 prod names are unread, not 33, and the proposal never lists them.
   - I grepped the 92 prod names (from `vercel env ls production`) against api/, src/, middleware.ts, vite.config.ts and vercel.json.
   - The 32 are the 4 DEX_ALLOWED_* names plus 28 deploy-script parameters.
   - Several names that look like deploy parameters are read at runtime with silent defaults, and must stay:
     - V2_ENTRY_TOL_BPS, V2_EXIT_TOL_BPS, V2_ENTRY_WINDOW_SEC (trackrecord-v2-recorder.ts:35-39; they must match what the contract enforces)
     - BASE_PROTOCOL_DEPLOYMENT_BLOCK (chains.ts:117, protocol-write-safety.ts:129)
     - BASE_HARDNESS_SERVICE_PRICE_WEI (hardness-registry.ts:36)
     - TREASURY_ADDRESS_BASE, BASE_RPC_URL, XLAYER_RECORD_SECRET (record-auth.ts)
     - BOBBY_CONTRACT_ADDRESS, BOBBY_ORACLE_ADDRESS, BOBBY_ECONOMY_ADDRESS (protocol-record.ts:30-32)
     - the BASE_SEPOLIA_* addresses
   - If the 33rd name is one of these, deleting it silently changes the Base TrackRecord recorder or hardness pricing.

3. DROPLET CLAIM IS WRONG (high confidence).
   - services/executor/README.md:3 (commit 41c72eb, 2026-08-10) says the DO droplet was already deleted, and project memory says 143.110.194.171 is DEAD. The saving is $0.
   - The real issue is the hardcoded fallback at bobby-wallet.ts:10: WALLET_SERVER_URL is not set in prod, so it points at a dead IP that DigitalOcean can reassign to someone else.
   - 5 x402-paid MCP tools already route to that dead upstream (mcp-http.ts:339-380: bobby_wallet_balance, bobby_wallet_portfolio, bobby_security_scan, bobby_dex_trending, bobby_dex_signals; the same in mcp-bobby.ts:118+).
   - mcp_payment_receipts in prod has 0 rows. The x402 code paths (protocol-payments, mcp-challenges, mcp-http, mcp-bobby, agent-auth) read only BOBBY_PROTOCOL_BASE_URL, so x402 is untouched by the env cleanup.

4. ENABLE_LIVE_TRADING: deleting it is safe, but the proposal's reasoning is inaccurate. onchainos-status.ts:21-28 returns tradingEnabled:false before it ever reads the flag, because prod has no OKX creds. The flag only gates executeTrade in onchainos-signal.ts:66, and deleting it means the trade is simulated.

5. BOBBY_RECORDER_KEY: safe. protocol-write-safety.ts:58 is unreachable, because chains.ts:196-197 throws on PROTOCOL_CHAIN=xlayer and only base or base-sepolia resolve. The same key still exists in Development and in the feat/base-migration Preview scope.

6. OKX (high confidence): OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE, OKX_PROJECT_ID and OKX_CEX_* are set only in Development. bobby-intel.ts:103-107, 716-720, 756-760 and 800-804 return [] in prod.
   - Unverified: the key being revoked may be the same one used by the founder's local okx-agent-trade-kit MCP (the trading copilot in CLAUDE.md).

7. WAITLIST (high confidence): no caller in origin/main src, public, iOS or scripts; bobby_early_access has 1 row (last 2026-09-07). Deleting it leaves stale references:
   - scripts/infra/freeze-behavior-selftest.mts:80 imports the file (manual script, not in CI).
   - tsconfig.api.json:53 lists it in "include". A missing include path is not a tsc error (medium confidence).
   - PrivacyPage.tsx:265 still describes the list.
   - The Apps Script pull would get 404s.

8. RESEND: prod RESEND_API_KEY is the sending-only "Bobby" key (per memory), so it is not the leaked full-access key; revoking the leaked key does not touch Bobby. The same Resend account has other verified domains (essentiallygem.com, makaisurf.app), so check whether other projects use the full-access key first. Web magic-link login exists (auth.service.ts:259 signInWithOtp); the Supabase SMTP provider is unverified.

9. Preview: confirmed 44 branch-scoped vars (19 on feat/phase0-hardening, 14 on feat/trackrecord-v2, 11 on feat/base-migration). iOS BobbyAPI.swift:277 targets bobbyprotocol.xyz, so no preview URL is live. Env changes only apply to new deployments.

**Cómo corregido:** 1. Delete exactly these 32 prod names, and no others:
   - DEX_ALLOWED_ROUTERS_196, DEX_ALLOWED_SPENDERS_196, DEX_ALLOWED_ROUTERS_8453, DEX_ALLOWED_SPENDERS_8453
   - V2_CONF_MAX_BPS, V2_CHALLENGE_WINDOW_SEC, V2_MAX_EXIT_LAG_SEC, V2_EXIT_WINDOW_SEC
   - CHALLENGE_BOND_WEI, BOUNTY_TREASURY_ADDRESS, ESCROW_MAX_SIZE_USD, REGISTRATION_STAKE_WEI, ABSOLUTE_MIN_BOUNTY_WEI, MIN_BOUNTY_WEI, FEE_DEBATE_PER_AGENT_WEI, FEE_MCP_CALL_WEI
   - RESOLVER_THRESHOLD, RESOLVER_ADDRESSES, RESOLVER_ADDRESS, HARDNESS_SCORER_ADDRESS, KEEPER_ADDRESS, ARBITER_ADDRESS
   - CIO_ADDRESS, RED_ADDRESS, ALPHA_ADDRESS, BOBBY_ADDRESS, BASE_RECORDER_ADDRESS, DEPLOYER_ADDRESS
   - OWNER_SAFE_OWNERS, OWNER_SAFE_SINGLETON, OWNER_SAFE_CODEHASH, OWNER_SAFE_ADDRESS

   First copy their values into deploy/base-mainnet.env or a password manager; check-mainnet-readiness.mts and DeployBase.s.sol still need them.

2. Explicitly keep:
   - V2_ENTRY_TOL_BPS, V2_EXIT_TOL_BPS, V2_ENTRY_WINDOW_SEC
   - BASE_PROTOCOL_DEPLOYMENT_BLOCK, BASE_HARDNESS_SERVICE_PRICE_WEI
   - TREASURY_ADDRESS_BASE, BASE_RPC_URL, XLAYER_RECORD_SECRET
   - BOBBY_CONTRACT_ADDRESS, BOBBY_ORACLE_ADDRESS, BOBBY_ECONOMY_ADDRESS
   - the BASE_SEPOLIA_* addresses

3. Delete ENABLE_LIVE_TRADING and BOBBY_RECORDER_KEY from Production and Development, after sweeping funds from the recorder address. PROTOCOL_CHAIN cannot be xlayer anyway (chains.ts:196).

4. Delete the branch-scoped Preview vars of feat/phase0-hardening, feat/trackrecord-v2 and feat/base-migration (44 vars).

5. Legacy Supabase: make it an explicit decision to retire the rollback before doing anything.
   - Retire it in the docs: cutover-prep.md:152 and :169.
   - Update the bobby_control note shown by /api/bobby-health.
   - Only then remove the fallback in bobby-db.ts and delete SUPABASE_URL, SB_URL, SUPABASE_SERVICE_KEY and SUPABASE_SERVICE_ROLE_KEY from Production and Development.
   - Add BOBBY_SUPABASE_* to the Development scope so local dev keeps working.
   - Keep the legacy key in a password manager; defimexico.org still uses that project.

6. OKX: before revoking the key, confirm it is not the one the founder's local okx-agent-trade-kit MCP uses. Then delete OKX_* and OKX_CEX_* from Development and remove the bobby-intel OKX blocks. test-remediation-r2.mts:404 only checks the agent_cycles reads, so it is unaffected.

7. Waitlist:
   - Export the 1 row and disable the Apps Script trigger.
   - Delete bobby-early-access.ts and waitlist-export.ts.
   - Remove tsconfig.api.json:53 and freeze-behavior-selftest.mts:80.
   - Update PrivacyPage.tsx:265.
   - Unset WAITLIST_EXPORT_TOKEN, WAITLIST_NOTIFY_EMAIL, BOBBY_EARLY_ACCESS_MIRROR_NEWSLETTER and RESEND_API_KEY.

8. Resend: revoke the leaked full-access key only after confirming that the essentiallygem.com and makaisurf.app projects do not use it.

9. Droplet: drop "destroy the droplet"; it is already gone. Instead, remove the hardcoded 143.110.194.171 fallback at bobby-wallet.ts:10 (fail closed when WALLET_SERVER_URL is unset). Then either delist or repoint the 5 x402-paid MCP tools at mcp-http.ts:339-380 and mcp-bobby.ts:118+. That keeps x402 honest.

10. Env changes only take effect on the next deploy. Run `npm run build` and CI, then redeploy, then check /api/bobby-health, /protocol and a desk debate.

### 16. Make /api/bobby-protocol-stats and /api/activity cheap per call

**Por qué.** On every cache miss, bobby-protocol-stats.ts:212 (verified) self-fetches /api/bobby-intel with 'Cache-Control: no-cache'. Lines :349-368 run six count=exact queries on forum_threads filtered on trigger_data->>demo_source, which detoasts ~31 MB of jsonb. pg_stat_statements shows 30,560 calls × 192 ms mean (5,879 s) since 2026-08-23, the #1 DB consumer on a Micro instance. activity.ts:42-43 self-fetches protocol-heartbeat and protocol-tx-history with no-cache, so one poll becomes 3–5 invocations. The underlying numbers change once a day. Confidence: high.

**Cómo.** 1) At bobby-protocol-stats.ts:212, read the api_cache 'intel:snapshot' row directly instead of calling over HTTP. 2) Replace the six counts with one grouped query and cache the result in api_cache for 1 h. 3) In activity.ts, import the heartbeat and tx-history functions instead of calling them over HTTP. 4) Keep the response shapes identical and verify /protocol, /record and the KineticShell ticker. Optional later (DB migration): a partial index on forum_threads(resolution) where scope='public' and entry_price is not null.

**Ahorro:** $0 (removes the most likely trigger for a compute upgrade); ~1.2 s of DB time per cache miss · **Velocidad:** Faster /protocol first paint on a cold cache · **Riesgo:** A drift in response shape breaks /protocol cards, so snapshot the JSON before and after.

### 17. Drop the DeFi México shell from the Bobby SPA: legacy AuthProvider, legacy Supabase client, i18n, layouts, routes

**Por qué.** The prod entry bundle inlines the legacy project URL https://egpixaunlnzauztbrnuz.supabase.co and its anon key, from the fallback at src/lib/supabase.ts:5-6 (VITE_SUPABASE_URL was unset at build). The legacy AuthProvider (App.tsx:198; useAuth.tsx:107, 148, 218) runs getSession and onAuthStateChange on every route against a project that is INACTIVE (paused), and AuthCallback.tsx:48 still falls back to it.

main.tsx:5 eagerly loads i18next plus the DeFi México locales; the 58 KB i18n chunk is modulepreloaded everywhere. App.tsx:15-17 eagerly imports MainLayout, AdminLayout and UserLayout. Nothing live links to the DeFi México routes (App.tsx ~583-860, /admin, /user, /login through /check-email); defimexico.org lives in its own repo. index.html:61 loads Inter, JetBrains, Press Start and Space Grotesk, while the desk uses Sora/Geist. About 21 MB of public assets serve only these pages. Confidence: high.

**Cómo.** 1) Remove AuthProvider from RootLayout and keep only the bobbySupabase path in AuthCallback.tsx.
2) Delete the DeFi México, admin, user and email-auth routes and pages, plus components/layout, games/mercado-lp, components/charts, src/lib/supabase.ts, useAuth, auth.service and ProtectedRoute.
3) Drop the i18n import, the i18next deps and the i18n manualChunk.
4) Replace index.html:61 with the Sora/Geist set.
5) Add a vercel.json redirect /defi-mexico/:path* → https://defimexico.org.
6) Delete Cover.png, market-plaza.png, maincover.jpeg and the other assets used only by these pages.
7) After grepping, remove recharts, react-i18next, react-hook-form, react-icons, dompurify and the zero-importer deps (axios, date-fns, @supabase/auth-ui-react, formidable, lovable-tagger).
8) Test the full sign-in path: /signin → Apple/Google → /auth/callback → /desk.

**Ahorro:** $0 (removes the last live dependency on the legacy Supabase project) · **Velocidad:** Part of the entry-chunk diet: the ~2 MB raw entry shrinks toward the ~1.1–1.2 MB raw desk target (with web3-lazy-boundary) · **Riesgo:** Old DeFi México and blog URLs 404 unless redirected. Any Bobby page still importing useAuth breaks, so grep first.

### 18. Remove hackathon-era agentic-world / claw-trader / Polymarket / OKX surfaces and their endpoints

**Por qué.** These routes are live but nothing links to them:
- /agentic-world: hub, leaderboard, polymarket (3,476-line page), consensus, claw-trader, claw-trader-chat, forum, deploy.
- /agentic-world/bobby/{analytics, history, portfolio, telegram, metacognition, docs, b2b}.
- /mascots, /app-v1, /app-a, /app-b, /app-world.

Their endpoints:
- Polymarket: chat-analyze, discover-markets, scan-traders and explain (public gpt-4o-mini, 300/day global). vercel.json:7-18 also proxies /api/polymarket-{gamma,data,clob} openly to Polymarket, with cache headers at :105-150.
- OKX/OnchainOS: okx-perps (vercel.json:250), okx-onchain, okx-signal, smart-money-leaderboard, onchainos-price, onchainos-signal, and onchainos-status, which publicly discloses tradingEnabled, MAX_POSITION_USDC and whether credentials are set (:16-56).
- conviction-tiers, bobby-signals, bobby-asset-cache (a writer), and ghost-wallet (vercel.json:234; listed in skills/bobby-trader/SKILL.md:83).

Most show no rate-limit buckets since 2026-09-03. Confidence: high.

**Cómo.** 1) Delete those routes and pages. Keep redirects /bobby and /agentic-world/bobby → /desk and /agentic-world/bobby/history → /record, and keep /app.
2) Delete the endpoints above, the vercel.json keys at :234 and :250, the Polymarket rewrites and headers, and the matching proxies in vite.config.ts.
3) Update skills/bobby-trader/SKILL.md:83, and check ai-judge-manifest.json and public/llms.txt for these paths.
4) KineticShellInner's non-nucleo mode can then go.
5) Unset OKX_CEX_*, OKX_DEMO_*, MAX_POSITION_USDC and MIN_DIVERGENCE_THRESHOLD.

**Ahorro:** $0 direct; removes ~20 functions, one public LLM path and an open proxy · **Velocidad:** Shorter builds; lightweight-charts and the Polymarket chunks leave the bundle · **Riesgo:** Hackathon-era external links 404, and the judge manifest may reference some of these paths.

**Verificación: NO segura tal como está escrita.** Not safe as written. Nothing here is critical to revenue or to the product, but three concrete things break and the headline claim "nothing links to them" is false.

1. CI goes red (high confidence). .github/workflows/ci.yml runs test:api-security, test:protocol-write-safety and test:remediation-r2. All three load files the plan deletes, and step 1-5 never touches these tests.
- scripts/test-api-security.mts:62-67 dynamically imports api/okx-perps.js and api/onchainos-signal.js.
- scripts/test-api-security.mts:190-194 reads api/okx-signal.ts and api/explain.ts. It also reads src/services/polymarket.service.ts and src/components/agent-radar/AnalyzePanel.tsx, which would go with the Polymarket page.
- scripts/test-protocol-write-safety.mts:204 reads api/okx-perps.ts with readFileSync and asserts the 410 retirement.
- scripts/test-remediation-r2.mts:96-99 imports api/ghost-wallet.js and api/bobby-signals.js (checks at :182 and :184). Line :404 reads api/conviction-tiers.ts.
- Outside CI, scripts/infra/freeze-behavior-selftest.mts:92 imports bobby-asset-cache and scripts/infra/writer-inventory.mts:64 lists it (migration tooling).

2. A live page links to a route being cut (high confidence). The home at public/home/index.html:387 links to /protocol. The /protocol footer (src/pages/BobbyProtocolLanding.tsx:848) has "Analytics" pointing to /agentic-world/bobby/analytics. After the cut that link lands on NotFound. The footer's "Agents" link (:849) points to /agentic-world/bobby/agents, which is not on the cut list, so it has to stay.

3. The /squad short link becomes a 404 (high confidence). src/App.tsx:520-522 redirects 'squad' to '/mascots', and /mascots is being deleted. The page route is separate from the static public/mascots/*.webp files, which the live desk uses (NucleoDesk.tsx:571, NucleoProfile.tsx:114, CompanionOverlays.tsx). An implementer who reads "delete /mascots" as that folder would break /desk avatars.

4. Dead links from still-routed or still-running code (medium confidence; each is low traffic):
- Telegram. api/telegram-webhook.ts:100 and :159 send the x402 group-activation link /agentic-world/bobby/telegram?activate=..., and api/telegram-deliver.ts:123 sends the "Upgrade to Premium" link to the same page. :54, :70 and :71 link to forum and b2b. Prod DB shows the flow is dormant: telegram_groups has 2 rows (latest 2026-03-22), telegram_subscriptions has 1 row that expired 2026-04-22, and telegram_connections has 0. It is a user-side x402 flow, not the agent-side x402 you are keeping.
- DeFi México nav. MainLayout.tsx:83-84 and Navbar.tsx:77 link to /agentic-world/forum and /agentic-world/leaderboard from routed /defi-mexico, /blog and similar pages.
- The /user dashboard. It is routed (App.tsx:1059) and linked from Navbar.tsx:336. UserDashboard.tsx:10 and :44 call polymarketService.getAgentMetrics, which uses the /api/polymarket-data proxy the plan deletes.
- The voice room. /agentic-world/bobby/voice-room is reached from the live desk (NucleoDesk.tsx:436, the dictation button when free voice is off). It renders AdamsChat, which has Links to /agentic-world/forum, /agentic-world/polymarket and /agentic-world/bobby/b2b (AdamsChat.tsx:2837, 3017, 3396, 3400). I did not check under what conditions those links render.

Verified safe:
- Crons: vercel.json:154-171 has only bobby-cycle, settle-trades, forum-resolve and the realtime-session sweep, so none feed on these endpoints.
- No server-side import of any cut module. Only the tests above load them.
- /desk data (src/components/nucleo/deskData.ts) uses bobby-asset-search and voice-tool, not the cut endpoints.
- iOS and Android on origin/main reference only /agentic-world/bobby/trader-land/w/:code (ios/Bobby/Sources/TraderLandGateHarness.swift:1557-1558), which is not on the cut list. It and its rewrite (vercel.json:20-22) must stay. ios/ is sparse-excluded in this worktree, so I checked it with git grep origin/main.
- ai-judge-manifest.json does not mention any of these paths. public/llms.txt:76 lists /agentic-world/bobby, which is kept.
- Rate-limit claim confirmed in prod api_cache: the last rl:okx-perps and rl:smart-money-leaderboard rows are from 2026-09-03, and there are no buckets for explain or chat-analyze since then.
- indicator_cache, the bobby-asset-cache writer's table, has 0 rows.
- KineticShellInner (non-nucleo) is used only by BobbyMarketplacePage:463, BobbySignalsPage:501 and BobbyChallengePage:278 (via PTSChallengePage), and none of them is routed.
- tsconfig.api.json:67 and :72 list bobby-asset-cache.ts and okx-onchain.ts under "include". A missing include path should not fail tsc (medium confidence).

Partly unverified: /private/tmp ran out of space (ENOSPC) mid-audit and shell greps stopped working. Late checks used Read and SQL only. I did not verify the claim that lightweight-charts leaves the bundle: MarketCanvas, which the voice room uses, may still import it.

**Cómo corregido:** Do the cut in one PR, with these changes on top of steps 1-5:

(a) Tests, all in the same PR:
- In scripts/test-api-security.mts, drop the okx-perps and onchainos-signal imports and their assertions (:62-67 and wherever perpsHandler and onchainSignalHandler are used). Also drop the readFile of okx-signal.ts, explain.ts, polymarket.service.ts and AnalyzePanel.tsx (:190-194) and their matching asserts.
- In scripts/test-protocol-write-safety.mts, delete the perpsSource block at :204-207.
- In scripts/test-remediation-r2.mts, remove ghost-wallet and bobby-signals from the import at :96-99 and their checks at :182 and :184, and remove api/conviction-tiers.ts from the list at :404.
- Update scripts/infra/writer-inventory.mts:64 and freeze-behavior-selftest.mts:92.
- Gate: npm run test:api-security, test:protocol-write-safety and test:remediation-r2 pass, then npm run build and lint.

(b) Redirects instead of 404s:
- In App.tsx, send /agentic-world/bobby/analytics, /metacognition and /portfolio to /record, /agentic-world/bobby/docs to /protocol/docs, and /agentic-world/bobby/b2b, /agentic-world/forum and /agentic-world to /desk.
- Point /mascots and /squad at /desk. Do not touch public/mascots/*.webp.
- Point /app-v1, /app-a, /app-b and /app-world at /app. Keep BobbyAppLandingWorld and components/app-landing/*.
- Remove or retarget the "Analytics" link in the BobbyProtocolLanding.tsx:848 footer.

(c) Keep explicitly:
- /agentic-world/bobby/voice-room (the desk links to it at NucleoDesk.tsx:436).
- /agentic-world/bobby/agents (/protocol footer) and /agentic-world/bobby/console.
- All /agentic-world/bobby/trader-land* routes and the vercel.json:20-22 rewrite (iOS share URLs).
- The /bobby rewrite (vercel.json:4-5).

(d) Clean up links:
- AdamsChat Links to forum, polymarket and b2b (:2837, 3017, 3396, 3400).
- MainLayout.tsx:83-84 and Navbar.tsx:77.
- The Polymarket section of UserDashboard.tsx (or retire /user).
- skills/bobby-trader/SKILL.md:83 and :125-126, AGENTS.md:21 and CLAUDE.md, which still describe explain.ts.
- The tsconfig.api.json entries at :67 and :72.

(e) Telegram: either retire the group-activation branch in telegram-webhook.ts (:80-125 and :150-161) together with the paywall link at telegram-deliver.ts:123, or keep /agentic-world/bobby/telegram. The flow is dormant (last group 2026-03-22, the only subscription expired 2026-04-22), so retiring it is reasonable, but it has to be one decision, not a 404.

(f) Unset OKX_CEX_*, OKX_DEMO_*, MAX_POSITION_USDC and MIN_DIVERGENCE_THRESHOLD in Vercel only after deploying and grepping api/ for remaining readers. api/bobby-wallet.ts and telegram-deliver are still imported in the same test, so confirm neither reads OKX_CEX_*.

### 19. Shut down Bobby's Telegram surface and confirm the separate aigts-bot is dead

**Por qué.** api/telegram-webhook.ts is a public inbound webhook that holds the bot tokens (TELEGRAM_BOT_TOKEN and *_GTS in prod) and runs Gemini/OpenAI DM analysis (_lib/dm-analysis.ts). bobby-cycle.ts:1684 calls telegram-deliver daily. Data: telegram_subscriptions 1, telegram_groups 2, telegram_activation_sessions 10, all last written 2026-03-23; telegram_connections 0.

The separate aigts-bot project has its own '0 13 * * *' cron, but it logged 0 runtime lines in the last 24 h and nothing at 13:00 on 09-20 or 09-28. docs/infra/2026-09-03-cutover-prep.md:95 calls it 'dead by decision', while memory still calls it the live bot. Confidence: high on the Bobby side, medium on aigts.

**Cómo.** 1) Founder runs getWebhookInfo for both bots. If the GTS webhook points at aigts-bot, leave it alone. Then run deleteWebhook for Bobby's bot.
2) Delete api/telegram-{webhook,access,deliver,connect}.ts, api/_lib/telegram*.ts, api/_lib/dm-analysis.ts, the telegram-deliver call (bobby-cycle.ts:1682-1697 and user-cycle.ts:586), and BobbyTelegramPage.
3) Unset the 4 TELEGRAM_* vars in Bobby Prod and Dev.
4) aigts-bot: check Settings → Cron Jobs; if it is dead, disable its cron and webhook (reversible). Delete the project only on Anthony's explicit word.
5) Drop the 4 telegram_* tables later (dead-tables-drop).

**Ahorro:** $0 direct (cents of Gemini) · **Velocidad:** none · **Riesgo:** 1 subscriber and 2 groups stop receiving digests, and the 'Voice DM deal' flow breaks if it is still live.

**Verificación: NO segura tal como está escrita.** Verdict: the cut is right in principle, but the plan as written is not safe. Step 2 would turn CI red and break the documented deploy gates and the build. Step 1 could cut off a Telegram consumer nobody has identified yet. The shell hit ENOSPC partway through the audit, so the last few checks used Read, SQL and Vercel tools only.

WHAT BREAKS
1. CI goes red. High confidence. .github/workflows/ci.yml runs `npm run test:api-security`. scripts/test-api-security.mts:62-66 imports '../api/telegram-deliver.js' inside a Promise.all, and :137-142 asserts on it. Deleting api/telegram-deliver.ts makes the import reject and the whole suite fail. The plan never mentions this test.
2. The build fails if BobbyTelegramPage is deleted without touching App.tsx. High confidence. src/App.tsx:93 has `lazy(() => import('@/pages/BobbyTelegramPage'))` and :946-953 has the route 'agentic-world/bobby/telegram'. Vite cannot resolve the missing module, so `npm run build` (which CI and Vercel both run) fails.
3. The phase-0 and production gates break. High confidence.
   - scripts/infra/freeze-behavior-selftest.mts imports telegram-connect (:72), telegram-deliver (:81) and telegram-access (:87), which count as failures. It then does an unguarded `await import('../../api/telegram-webhook.ts')` at :109, which crashes the script.
   - scripts/infra/preview-smoke.mts:53 POSTs /api/telegram-connect and expects 401/503 and 403/503. It will get 404, print SMOKE FAILED and exit 1.
   - Both are the gates the docs tell you to run: docs/infra/2026-09-02-production-runbook.md:30 and phase0-handoff.md:344/448.
4. Step 1 is risky. Medium confidence. docs/infra/2026-09-02-bobby-vs-defimexico-audit.md:74 and :250-253 found that @Bobbyagentraderbot's webhook points to a VPS (103.114.43.97.sslip.io/api/hook/…), not to bobbyprotocol.xyz. It also says bobbyprotocol.xyz/api/telegram-webhook "no recibe nada". The VPS owner is unknown (the doc guesses OpenClaw, aigts-bot or the Claude Code Telegram channel). Running deleteWebhook on Bobby's bot without conditions would disconnect whatever runs on that VPS.
5. The Voice DM deal (a paying influencer) may be served by Bobby itself. Medium confidence.
   - api/_lib/telegram-bots.ts:6-7 and :38-43 route the GTS bot (@aigts_bot, TELEGRAM_BOT_TOKEN_GTS) through Bobby's /api/telegram-webhook?bot=gts. api/_lib/dm-analysis.ts only exists for that path.
   - Memory (project_voice_dm_deal, 06-07/06-10) says the live copy is the separate aigts-bot project. But the plan only covers "GTS points at aigts-bot". If GTS points at bobbyprotocol.xyz?bot=gts, deleting the webhook kills the deal.
6. Dead UI would stay reachable. These do not crash but leave broken paths:
   - src/components/adams/AdamsChat.tsx:2988-3015 has a "ROUTE INTEL TO TELEGRAM" button that calls /api/telegram-connect. It is mounted by BobbyAgentTraderPage at /agentic-world/bobby/voice-room (App.tsx:475-481). After the cut it silently does nothing.
   - AgentWizard.tsx:709 (/agentic-world/deploy) and api/agent-setup.ts:52 VALID_DELIVERY still offer 'telegram'.
   - BobbyB2BPage (/agentic-world/bobby/b2b, App.tsx:870) has t.me/Bobbyagentraderbot?startgroup call-to-action links.
   - Stale config and docs: tsconfig.api.json:50,55,56 list the deleted files. I believe tsc ignores missing entries in `include` (medium confidence). CLAUDE.md still says "Bot: Telegram via webhook".

WHAT DOES NOT BREAK
- iOS: `grep -rli telegram ios` returns nothing.
- Agent-side x402: telegram-access.ts:1-29 is its own OKB-on-X-Layer gate for Telegram groups. It shares no import with the MCP payment libraries.
- Public pages and stats: no api/src file outside api/telegram-* reads the telegram_* tables.
- Database: no functions or views mention telegram. The only triggers are bobby_outbox capture triggers on the 4 tables, which matter only for the later drop.
- Crons: none in vercel.json targets a Telegram endpoint. The crons are bobby-cycle 0 12, forum-resolve 30 12, settle-trades 45 12, and the realtime sweep.
- api/feedback.ts no longer uses Telegram, despite its header comment; it sends email through Brevo.

CORRECTIONS TO THE PROPOSAL'S FACTS
- "1 subscriber and 2 groups stop receiving digests" is wrong.
  - The one telegram_subscriptions row has expires_at 2026-04-22. telegram-deliver.ts:161-165 only delivers to rows with expires_at >= now, so no group gets anything today.
  - telegram_connections has 0 rows, and 0 of the 2 agent_profiles have telegram delivery (last run 2026-03-25).
  - Row counts are 1/2/10/0, last written 2026-03-22 and 03-23 (confirmed on qbvdqkknnuweatptjohi).
- Bobby prod runtime logs over the last 24h have zero lines matching "telegram", even though bobby-cycle ran at 12:00:41 on 09-28 (bobby_control: canary=false, write_freeze=false).
- The user-cycle block runs from 579 to 599, not just line 586. The bobby-cycle block is 1681-1697.
- aigts-bot: 0 runtime log lines grouped by path. Vercel only keeps about 1 day of runtime logs on Pro, so "7d" really means at most 24h. Project metadata shows live:false, and the latest production deployment is dpl_HCbLC7QdCzUryVG9Rjck1KuH5tBP from about 2026-06-10. Confidence that it is dead: medium.
- I could not list the env vars (Vercel returned 403), so the claim that TELEGRAM_*_GTS is set in prod is unverified.

**Cómo corregido:** 1) Founder, read-only first: run getWebhookInfo on both bots without sharing the tokens.
   - Only run deleteWebhook on a bot whose URL is bobbyprotocol.xyz/api/telegram-webhook (with or without ?bot=...).
   - If @Bobbyagentraderbot still points at the 103.114.43.97 VPS, leave it alone and first identify what runs there (OpenClaw, aigts-bot or the Claude Code channel).
   - If GTS points at bobbyprotocol.xyz/...?bot=gts, stop. Bobby is serving the Voice DM deal, so get Anthony's explicit word that the deal is over before going further.

2) One PR with CI green. Delete these:
   - api/telegram-{webhook,access,deliver,connect}.ts
   - api/_lib/telegram.ts, api/_lib/telegram-bots.ts, api/_lib/dm-analysis.ts
   - the delivery blocks in api/bobby-cycle.ts:1681-1697 and api/user-cycle.ts:579-599 (leftover unused locals are fine; noUnusedLocals is false)
   - src/pages/BobbyTelegramPage.tsx

   In the same PR, also edit:
   - App.tsx: remove the lazy import at :93 and the route at :946-953, or change the route to a Navigate to /agentic-world/bobby.
   - AdamsChat.tsx:2988-3015: remove the Telegram button.
   - Remove 'telegram' from AgentWizard.tsx:709 and from api/agent-setup.ts:52 VALID_DELIVERY.
   - BobbyB2BPage: remove the t.me/Bobbyagentraderbot call-to-action links, or retire the route.
   - scripts/test-api-security.mts: remove the telegram-deliver import at :62-66 and the block at :137-142.
   - scripts/infra/freeze-behavior-selftest.mts: remove :72, :81, :87 and :105-113, and drop the TELEGRAM env setup at :17 and :107.
   - scripts/infra/preview-smoke.mts:53: remove '/api/telegram-connect'.
   - scripts/infra/writer-inventory.mts: remove :45-46 and :59-61.
   - tsconfig.api.json: remove :50, :55 and :56.
   - scripts/audit-mobile.mjs:56.
   - CLAUDE.md: the "Bot: Telegram" and api/telegram-*.ts lines.

   Locally, run `npm run build`, `npm run lint -- --quiet` and every test:* script that ci.yml runs, plus freeze-behavior-selftest. After deploying, run preview-smoke against the preview URL and then against prod.

3) Unset TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_BOT_TOKEN_GTS and TELEGRAM_WEBHOOK_SECRET_GTS in Bobby Prod and Dev only after the code that reads them is gone. The legacy defi-mexico-hub project also holds TELEGRAM_* (audit doc :74, :268); leave it for its own decision.

4) aigts-bot: confirm in Settings → Cron Jobs and in the webhook info. If it is dead, pause the project or remove its cron (both reversible). Delete the project only on Anthony's explicit word.

5) When the tables are dropped later (the dead-tables-drop item), also update:
   - scripts/infra/rls-adversarial.mts:143-145 and :242 (it probes telegram_connections, so the gate would fail)
   - scripts/migration/tables.ts:74-78
   - the bobby_outbox triggers on the 4 tables

### 20. Fix x402 logging, trim dead x402 tools, and run the paid tools on the desk engine

**Por qué.** Every paid MCP call tries to insert into agent_commerce_events (api/_lib/agent-commerce-log.ts:36; read at :71 by activity.ts and protocol-heartbeat.ts). The table exists in neither database, so each call logs an error and the commerce feed is always empty (7 x402 MCP calls in 30 days). mcp-http.ts:339-380 and mcp-bobby.ts:117-160 still hold handlers for the retired bobby_wallet_* and bobby_security_scan tools, which fetch the dead /api/bobby-wallet. The tool code is duplicated between mcp-bobby.ts and mcp-http.ts. mcp_payment_challenges has 439 rows, all pending; receipts are 0. Confidence: high.

**Cómo.** 1) Either create public.agent_commerce_events (RLS on, service_role only, revoke anon and authenticated) with mcp__supabase__apply_migration, or remove the logAgentCommerceEvent and listAgentCommerceEvents calls.
2) Remove the dead wallet handlers and any leftover TOOLS entries. Update public/llms.txt and skill.md if the tool list changes.
3) Repoint bobby_analyze and bobby_debate (mcp-http.ts:88-100, mcp-bobby.ts:60-70) to in-process loadDeskEvidence + runDeskDebate on Rápido models, logged to bobby_llm_usage, keeping the response field names.
4) Then delete api/openclaw-chat.ts, vercel.json:186-189 and OPENCLAW_GATEWAY_URL/TOKEN.
5) Later, collapse mcp-bobby into mcp-http behind a rewrite that keeps the /api/mcp-bobby path.

**Ahorro:** Removes a second debate engine (1,094 lines) and its unledgered gpt-4o spend · **Velocidad:** The paid tools inherit the desk's latency improvements · **Riesgo:** The paid tools' output format changes for external agents. llms.txt and skill.md are public contracts, so never rename the paths.

### 21. Decide on /protocol console, sandbox, harness, playbooks and the Hardness agent API

**Por qué.** These are off the top nav but still public:
- /protocol/console: BobbyAgentConsolePage → api/orchestrate.ts, public gpt-4o-mini at 10/h per IP; footer link BobbyProtocolLanding.tsx:836.
- /protocol/sandbox: api/sandbox-run.ts (729 lines), public, up to 180 s of LLM; 1 run in 30 days; footer link :837.
- /protocol/harness, which describes the daily-cycle trace (BobbyHarnessConsolePage.tsx:142), and /protocol/playbooks.

The Hardness layer: api/hardness-test.ts (4 free gpt-4o-mini calls, advertised in registry.ts:193 and agent-identity.ts:29), agents/* ×4, network/* ×2, registry, sentinel-demo and agent-identity. hardness_agents, sessions and proofs all have 0 rows, and hardness_agent_proofs is readable by anon. All of this is free LLM work sitting next to the paid x402 rail. Confidence: medium.

**Cómo.** If the reviewers don't need them: delete the 4 routes/pages and the 13 endpoints, and unlink BobbyProtocolLanding.tsx:836-837 and KineticShell.tsx:20, 226. Update docs/hardness-finance-architecture.md. Grep docs, llms.txt and ai-judge-manifest.json first. If they stay: put orchestrate, sandbox-run and hardness-test behind x402 or internal auth (reuse the judge-mode/mcp-http pattern), and keep sandbox-runs as read-only history.

**Ahorro:** $0 today; removes 3 public LLM paths · **Velocidad:** none · **Riesgo:** Breaks documented agent-facing examples and the /protocol demo pages if reviewers rely on them.

### 22. Supabase hardening migration: grants, definer views, PTS RPCs, search_path

**Por qué.** 46 older public tables still grant anon and authenticated DELETE, INSERT, UPDATE and TRUNCATE (information_schema.role_table_grants). RLS blocks the DML but not TRUNCATE. Advisor findings:
- agent_cycles_public and agent_trades_public are SECURITY DEFINER views (ERROR).
- 5 PTS demo RPCs (pts_add_comment, pts_delete_comment, pts_signal_feed, pts_signal_summary, pts_toggle_like) are anon-executable SECURITY DEFINER in Bobby's prod DB for a separate app; pg_stat shows ~4,383 RPC calls.
- bobby_control_touch and set_updated_at have a mutable search_path.
- Leaked-password protection is off.
- user_feedback_anon_insert lets anyone insert.
Newer tables already have these grants revoked (memory: revoke from anon/authenticated, not only PUBLIC). Confidence: high.

**Cómo.** One migration, YYYYMMDD_revoke_legacy_grants.sql:
1) revoke all on each legacy table from anon, authenticated.
2) Re-grant SELECT only where a public-read policy exists: agent_events, agent_positions, agent_signals, forum_threads, forum_posts, hardness_agent_proofs, indicator_cache, tl_items.
3) Set security_invoker=on on the 2 views, or drop them together with the legacy pages that use them (AgentDashboard, BobbyAgentsPage, BobbyChallengePage).
4) Set search_path on the 2 functions.
5) Drop the pts_* functions and tables after PTS moves out.
6) Tighten agent_events_public_read so it hides meta.
Outside the migration, enable leaked-password protection in Auth. Then smoke-test /protocol, /record and the Trader Land public pages.

**Ahorro:** $0 · **Velocidad:** none · **Riesgo:** A browser read that relied on a grant loses access. Keep SELECT wherever a public-read policy exists and smoke-test the public pages.

### 23. Close the cut-over rollback window: disable the outbox triggers and decide the legacy project's fate

**Por qué.** 37 public tables still fire bobby_outbox_capture() on every write into migration_outbox: 3,929 rows (4.7 MB), 152 in the last 14 days, 3,893 never replayed. The replay target, egpixaunlnzauztbrnuz, is INACTIVE (paused) on the free 'DeFi Mexico' org. Tables added later (bobby_reads, bobby_identities, tl_*, the access tables) have no trigger. So rollback is already impossible and would be incomplete anyway. The cut-over and the rollback drill both happened on 2026-09-03. Confidence: high.

**Cómo.** 1) Founder confirms the rollback window is closed. 2) Run `select public.bobby_outbox_disable();` via mcp__supabase__execute_sql; it drops the 37 triggers. 3) Export migration_outbox to CSV. 4) A later migration drops migration_outbox and the functions bobby_outbox_capture/enable/disable/status. 5) Archive scripts/migration/replay-outbox.mts. 6) For egpix: take a final pg_dump and decide whether defi-mexico-hub needs it restored; otherwise let it lapse. A paused free project is restorable only for a limited time (exact window unverified).

**Ahorro:** $0 (removes one extra insert per write on 37 tables) · **Velocidad:** Halves write I/O on those 37 tables · **Riesgo:** Gives up a rollback path that cannot work while the target is paused. The migration tooling (verify.mts, selftest) must be updated.

**Verificación: NO segura tal como está escrita.** Verdict: step 2 on its own (dropping the capture triggers) breaks nothing live. High confidence. The plan as a whole is not safe as written: four of its claims or steps are wrong, and the legacy "let it lapse" branch can destroy data that cannot be recovered.

NOTHING LIVE BREAKS (verified):
- No live code uses the outbox. `grep migration_outbox|bobby_outbox` over api/, src/, ios/Bobby/Sources, public/, middleware.ts and vercel.json finds nothing. No public or docs page makes a rollback claim.
- In the prod DB (qbvd), only the 4 outbox functions reference the table. No view depends on it, and there is no pg_cron (`cron.job` does not exist).
- The trigger is `AFTER … FOR EACH ROW` and `return null` (20260903000003_migration_outbox.sql:28-42). Dropping it cannot change any write. On the x402 tables (mcp_payment_challenges, mcp_payment_receipts) it only stops the journal copy, and removes one way a write could fail.
- CI: ci.yml and package.json run nothing under scripts/migration/ (selftest, verify, replay). The Postgres tests read named migration files (test-rls-lockdown-pg.mts:29-33), not the outbox migration.
- iOS: no Supabase host anywhere in ios/Bobby/Sources.

WHAT IS WRONG OR MISSING:
1. The table count is wrong. pg_trigger shows 35 armed tables, not 37; tables.ts:39-79 approves 36. bobby_control was left out on purpose: its row is marked `replay_target='skipped:control-plane:never-replay'`. So replay-outbox.mts already refuses to start (it would report `missing=[bobby_control]`), even before the paused target.
2. The speed gain is overstated. In 14 days there were 152 journal rows, about 11 a day: the 12:00 UTC cycle writes to agent_cycles, forum_threads/posts and user_digests, plus 34 agent_events and 5 mcp_payment_challenges. "Halves write I/O" is true per row but too small to measure. This is cleanup, not a speed win.
3. It removes the only record of who wrote what. docs/security/2026-09-28-audit-response.md:34-38 used this journal yesterday to answer "was the P0 anon write on agent_cycles exploited?". API logs keep only 24 hours. Dropping the table leaves no row-level write history for the next incident, and the CSV export only preserves the past. The export also holds full row copies (bobby_early_access, user_feedback), so it must not land in the repo.
4. The pg_dump step cannot run as written. `get_project egpixaunlnzauztbrnuz` shows status INACTIVE (org srwrvqrzfybfwfducprz), so you cannot pg_dump it without resuming it first. A pg_dump also misses Storage buckets.
   - Supabase docs: a paused free project has a 90-day one-click restore window. After that, the backup file and Storage can still be downloaded. The pause date is unknown.
   - Keeping it paused costs $0, so there is no saving from deciding quickly.
5. egpix is the only copy of defimexico.org's data. The DeFi México tables (startups, events, courses, blog, …) were deliberately not migrated (tables.ts:19). defi-mexico-hub/src/lib/supabase.ts:5 falls back to egpix. Letting it lapse without a full dump (auth and Storage included) loses them for good.
6. Bobby's own prod bundle still points at egpix. bobbyprotocol.xyz/assets/index-Do1KwEzA.js contains `const WP="https://egpixaunlnzauztbrnuz.supabase.co"`, which comes from src/lib/supabase.ts:5. That client backs the AuthProvider in RootLayout (src/App.tsx:198) and the DeFi México pages. These already fail because the project is paused. Bobby login is not affected: it uses bobbySupabase first (AuthCallback.tsx:100-108).
7. Docs to update once this is done: supabase/bobby-protocol/README.md:31 says the outbox is active for rollback; the runbook in docs/infra/2026-09-03-cutover-prep.md; CLAUDE.md:37 still lists egpix as the Supabase project.

**Cómo corregido:** Split this into two decisions.

A) Close the journal (safe, cost S):
1. The founder declares the rollback window closed. Rollback is already impossible: the target is paused and replay refuses because the armed tables (35) don't match the approved list (36).
2. Run `set lock_timeout='5s'; select public.bobby_outbox_disable();` via execute_sql, outside 12:00–13:00 UTC (bobby-cycle runs at 12:00, settle-trades at 12:45). DROP TRIGGER takes an ACCESS EXCLUSIVE lock on all 35 tables in one transaction. Expect a return value of 35, and `bobby_outbox_status()` should then return 0 rows.
3. Keep the journal. Leave migration_outbox as a frozen archive (4.7 MB, $0) until the 2026-09-28 P0 is closed. If it is exported, store it privately outside the repo. If the founder wants to keep the write history, re-arm a slim trigger on agent_cycles, agent_trades, forum_threads, forum_posts and mcp_payment_* only, as an audit log with a retention period, rather than dropping all 35. Record the decision in the audit-response doc.
4. In a later migration, drop bobby_outbox_capture, enable, disable and status, plus the table if the founder agrees. Deliberately keep or drop bobby_sequence_check.
5. Archive replay-outbox.mts, the `verify --expect-outbox` option and the selftest outbox cases (none of them run in CI). Update supabase/bobby-protocol/README.md:31, the runbook in docs/infra/2026-09-03-cutover-prep.md and CLAUDE.md:37.

B) Legacy egpix (founder only, separate decision):
1. Leave it paused; that costs $0. Check the pause date in the dashboard.
2. Before the 90-day restore window ends, get a full copy. Either resume it, take a full dump (public + auth schemas + Storage buckets) and pause it again, or accept the backup download the dashboard offers after 90 days.
3. Delete it only after the founder confirms defimexico.org (defi-mexico-hub) is retired.
4. In Bobby, remove the legacy client: the egpix fallback in src/lib/supabase.ts:5 and the AuthProvider in RootLayout (App.tsx:198).
5. Remove the legacy SUPABASE_URL and VITE_SUPABASE_URL values from Vercel, so bobby-db.ts and bobby-db-client.ts can never fall back to egpix.

### 24. Drop dead tables and indexes after the endpoint cuts

**Por qué.** Tables with 0 rows and no live writer: agent_signals, agent_market_snapshots, agent_position_rechecks, agent_source_health, cycle_transitions, llm_calls, trade_intents, swap_receipts, bobby_pre_calls, agent_positions, agent_config, agent_macro_events, indicator_cache, user_feedback, telegram_connections. agent_memory also has 0 rows but carries a 1.6 MB ivfflat index and is the only user of the vector extension in public. hardness_* ×4 have 0 rows.

Stale tables: telegram_* (last write 2026-03-23), agent_messages (last write 2026-04-22), memory_objects.

agent_trades_cycle_id_idx duplicates idx_agent_trades_cycle. These account for most of the 40 unused-index advisor findings and still carry outbox triggers. The DB is 140 MB in total; forum_* (108 MB) stays. Confidence: medium, since it depends on the endpoint cuts landing first.

**Cómo.** Wait 2–4 weeks after the endpoint PRs ship. Then:
1) Export each table.
2) Update bobby_sequence_check and bobby_link_identities (which references bobby_pre_calls).
3) Run one migration that drops these tables, drops agent_memory plus `drop extension vector`, and drops agent_trades_cycle_id_idx.
Keep bobby_lot_fills and forum_publish_receipts only if swaps and debate publishing stay. If Trader Land stays, add indexes on tl_inventory(event_id) and tl_inventory(item_id).

**Ahorro:** $0 (storage is tiny) · **Velocidad:** none · **Riesgo:** Irreversible without the exports. agent_profiles may still feed src/lib/mascot.ts, so keep it.

### 25. Make the weekly security scan green again: review, then allowlist, 3 gitleaks hits

**Por qué.** .github/workflows/security.yml:7-8 runs weekly at '17 9 * * 1' and has failed 4 weeks in a row (2026-09-07, 09-14, 09-21, 09-28; run 36459763325). The failure is gitleaks 'leaks found: 3', on two STORAGE_KEY constants and one Swift storageKey, which look like false positives; CodeQL passes. A permanently red check hides a real leak when one happens. Actions minutes are free because the repo is public. Confidence: high.

**Cómo.** Inspect the 3 findings in the run log. If they are key-name constants, add their fingerprints to .gitleaksignore, or add a gitleaks.toml allowlist for storage-key constant names. Keep the weekly schedule.

**Ahorro:** $0 · **Velocidad:** none · **Riesgo:** If one hit is a real secret, allowlisting hides it. Review each value before allowlisting.
