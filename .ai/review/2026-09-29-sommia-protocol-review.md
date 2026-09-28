# Sommia protocol review — independent pass

**Review target:** `d474578` (`origin/main` at review start)  
**Scope:** source, public production responses, direct Base RPC reads. No production writes or transactions were made.  
**Verdict for Thursday:** **NO-GO** until P0 is addressed and the 12:30 UTC resolver run has been verified. The on-demand desk is materially more honest than before, but the public page still overstates which procedure its guardrails cover.

## Evidence snapshot

- Production `GET /api/bobby-protocol-stats` on 2026-09-28 returned 3,227 public debates, 863 calls, 2,364 abstentions, 793 resolved, 70 pending, and 54.5% (432W / 244L / 117 flat). It also returned the 28 September public transcript below.
- Production `tools/list` returned 11 tools from `/api/mcp-bobby` and 20 from `/api/mcp-http`. Its public metadata prices premium `bobby_debate` at 0.000025 ETH (25,000,000,000,000 wei).
- Direct read-only Base RPC calls returned TrackRecord `totalTrades=1`, `totalCommitments=1`, `getVerifiedWinRate=10000`; AgentEconomy `mcpCallFee=25000000000000` and `getStats=0,0,0`. These match the public stats endpoint and the MCP metadata.
- All specified public routes returned HTTP 200: `/protocol`, `/desk`, `/protocol/docs`, `/protocol/calls`, `/risk`, `/audits`, `/bounty`, `/heartbeat`, `/console`, `/harness`, `/playbooks`, `/sandbox`.

## Findings

### P0 — the public cycle can publish personal trading instructions while `/protocol` says the guard covers every agent

**Production evidence:** the latest public Alpha transcript says, in Spanish, “abrir una posición corta”, names an entry, stop and target, says “Utilizando un apalancamiento de 3x”, and “Aprovecha esta oportunidad”. The same stats response labels it the latest public debate.

**Source evidence:** `reviewDeskOutput` is only called by `runDeskDebate` in `api/_lib/desk-debate.ts:175-194`; it rejects English and Spanish guarantee/advice patterns only. The daily cycle instead emits its own Alpha/Red/CIO transcript via `api/bobby-cycle.ts:754-905` and writes the posts around `api/bobby-cycle.ts:1087-1094`. Its structured verdict is allowed to use `action=open`, direction, entry, stop and target at `api/bobby-cycle.ts:145-191`. `/protocol` claimed “Every agent’s text is checked” at `src/pages/BobbyProtocolLanding.tsx:650-654`; `/protocol/docs` made the equivalent “Every answer” claim at `src/pages/BobbyDocsPage.tsx:293-294`.

**Impact:** this is a direct contradiction visible to a technical evaluator: a claimed safety guard does not govern the public artifact shown by the page. It is also not safe to say “the same rules” or “one procedure” for desk and cycle.

**Required decision:** either put a comparable output/compliance guard around every public-cycle and MCP transcript, or keep the corrected narrow copy and do not claim a system-wide personal-advice guard.

### P1 — a public legacy route still visibly names OKX / OKB / X Layer

`/challenge` remains a public React route (`src/App.tsx:525`) to `BobbyChallengePage`. That page renders “Historical X Layer configuration”, “OKX X LAYER (196)”, “OKX CEX API” and “OKX DEX API” in `src/pages/BobbyChallengePage.tsx:743-828`. This contradicts the “only Base / no visible OKX, OKB or X Layer” claim even though the reviewed `/protocol*` route family has been cleaned.

**Required decision:** remove, redirect, or make this historical route non-public before asserting all public surfaces are Base-only.

### P1 — resolver completion is not yet demonstrated

The resolver logic is substantially better: it requests 1H bars bounded by the call window (`api/_lib/path-resolution.ts:13-45`), excludes any bar that began before `created_at`, uses stop-first on a same-bar tie, and stores market `exitAt` rather than job time (`api/_lib/path-resolution.ts:55-77`, `api/forum-resolve.ts:83-97`). It only attempts an on-chain resolution for public calls created on or after `2026-08-18` (`api/forum-resolve.ts:101-122`).

But production still showed the original 70 pending calls. The requested post-cron audit remains open: after 12:30 UTC, read the Supabase project `qbvdqkknnuweatptjohi` and verify all eligible pending rows, `resolved_at`, outcome distribution and the public rate. Do not call the resolver manually: it writes production.

### P2 — MCP has three roles, but not the desk procedure or veto contract

`bobby_debate` in both MCP endpoints forwards to `/api/openclaw-chat`, not `/api/desk-debate` (`api/mcp-bobby.ts:92-103`, `api/mcp-http.ts:92-103`). That stream uses different prompts and output: Alpha → Red → CIO, but no structured `wait|review`, no desk `reviewDeskOutput`, no 1H per-instrument evidence contract, and no R5 direction veto (`api/openclaw-chat.ts:765-875`). The prior docs phrase “same three roles … through the conversational desk” was too easy to read as the same procedure.

### P2 — Portuguese is not covered by the desk output guard

The desk accepts `pt` (`api/desk-debate.ts:17-20`, `api/_lib/desk-debate.ts:185-193`) and explicitly instructs Brazilian Portuguese. The post-generation advice and guarantee patterns are English/Spanish (`api/_lib/desk-debate.ts:82-110`). This is a known limitation from the brief, not a newly discovered defect; it should still be fixed before a Portuguese demo or stated plainly as an unsupported guard language.

## Claim audit

| Public claim | Assessment | Evidence |
|---|---|---|
| Desk has Alpha → Red Team → CIO, with Red seeing Alpha and CIO seeing both | True | `api/_lib/desk-debate.ts:184-194` |
| Web and iPhone use `/api/desk-debate`; incomplete desk debate approves no idea | True in web source; iOS release binary not independently inspected | `src/components/nucleo/deskData.ts:81-115`; iOS R5/R6 at `ios/Bobby/Nucleo/ARCHITECTURE.md:29-31` |
| CIO cannot upgrade the desk engine | True for the web presentation gate | `src/components/nucleo/deskData.ts:96-115` |
| Desk returns 503 with no substitute verdict on failure | True | `api/desk-debate.ts:62-85`; `runAgents` returns null and web maps it to no approval at `src/components/nucleo/deskData.ts:84-115` |
| At least 59 desk bars; crypto <=3h and equities <=5d | True | `api/_lib/desk-debate.ts:15-48` |
| Daily cycle uses 70% backend / 30% CIO and requires >=3.5/10 | True | `api/bobby-cycle.ts:1013-1021`, `api/_lib/commit-policy.ts:37-83` |
| Public calls expire after 48h and grade first-touch with stop on tie | True in source; operational catch-up unverified | `api/bobby-cycle.ts:1071`, `api/_lib/path-resolution.ts:49-77` |
| Every agent / answer has the output guard | False before the copy correction in this review branch | P0 evidence above |
| MCP has 11 JSON-RPC and 20 HTTP tools | True | production `tools/list` responses |
| MCP premium fee is contract-priced | True | production metadata and direct Base `mcpCallFee()` read |

## Copy correction in this branch

Commit pending after this report narrows the false global claims to the desk, changes “Two runtimes. One procedure.” to “Two procedures”, and identifies MCP as a separate conversational flow. It does not change production behavior.

## DeepSeek second review

Not run: `DEEPSEEK_API_KEY` was absent from the environment at review start. Per the brief, I did not guess a model id or call `/models` without a key, and therefore there is no raw DeepSeek output under `.ai/review/deepseek/`.

## What to say on Thursday

Say: the web desk and iPhone use the same dedicated three-call endpoint; the browser only shows an approved idea when the CIO returns `review` in the indicator engine’s direction; desk failures fail closed; the public cycle records abstentions separately; Base contracts currently show one resolved on-chain record and zero MCP payments.

Do not say: every Bobby response has the same safety/output guard; MCP uses the same procedure as the desk; all public pages are Base-only; the 70 historical calls have been resolved; the public win rate is final after the resolver change; or that a public transcript is a personal trading instruction.

## Required follow-up after the scheduled resolver run

At least 10 minutes after the daily 12:30 UTC cron, use read-only Supabase access to count pending/resolved public `forum_threads`, inspect a sample of pre-2026-08-18 `resolved_at` values and check there were no TrackRecord writes for those rows. Then compare the production stats endpoint with the count and update this verdict.
