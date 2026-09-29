# Bobby intelligence plan: brief for review (2026-09-29)

**Ask.** Make Bobby feel far smarter, powerful enough that a user notices, on frontier models, while keeping unit costs under control.

**Audience.** Anthony, and Codex as the second reviewer. Section 8 lists the questions for Codex.

**Evidence.** All numbers come from runs made on 2026-09-29 against production data and the current prompts. The raw results are in `docs/ai/data/` and the scripts in `scripts/eval/`, so every table can be reproduced.

## 0. TL;DR

- **Where Bobby is today.**
  - Every LLM call goes to OpenAI.
  - The `/desk` debate is 3 sequential `gpt-4o-mini` calls.
  - The only evidence is a summary of 1H candles for one instrument.
  - It has no memory and no tools, and nothing records tokens or cost.
  - Blind judges score its answers **5.95/10**, and **3.25/10 on insight**, the dimension that makes Bobby feel smart.
- **What the model alone buys.** Using the same prompts and evidence, frontier models score **7.5–8.4**. The biggest single jump is almost free: `gpt-6-luna` scores +1.6 for +30% cost.
- **The real ceiling is the evidence, not the model.** Every frontier model, Opus 5.5 included, ended the same way: "wait — missing daily/weekly structure, volume, news, derivatives". A better model cannot out-reason data it never receives.
- **"10× smarter" therefore means compounding six levers:**
  1. better models, routed by tier;
  2. multi-timeframe and cross-market evidence;
  3. tools the judge can call;
  4. memory of Bobby's own track record and of the user;
  5. an experience that streams the reasoning;
  6. telemetry and cost controls.

  The model is one lever of six.
- **Proposed routing:**

  | Tier | Model setup | Measured cost / debate |
  |---|---|---|
  | Free | `gpt-6-luna` | ~$0.0005 |
  | Pro | `claude-sonnet-5-5` (low effort) or `gpt-6-sol`, to be decided by the phase 0 eval | ~$0.01–0.015 |
  | Pro "Deep Dive" | `claude-opus-5-5` with tools | ~$0.05–0.12 |
  | Daily public cycle | Opus 5.5 on the Batch API | ~$1.5 / month |
  | Live voice | stays on `gpt-realtime-2.1`; the debate tool it calls gets the new brain | — |
- **Cost at 10k debates/month:** about $60/month, against about $3.60 today. A Pro user ($5/month) stays profitable up to about 250 standard debates or about 40 Deep Dives.

## 1. What Bobby runs today (verified in code and production)

| Surface | Model | Notes |
|---|---|---|
| `/desk` debate, web and iOS (`api/_lib/desk-debate.ts`) | `gpt-4o-mini` ×3, sequential | `BOBBY_DESK_MODEL` is unset in prod. Each call has `max_tokens` 650 and must end with `finish_reason === 'stop'`. The evidence is `analysisSummary()` of 1H candles. |
| Daily public cycle (`api/bobby-cycle.ts`, cron at 12:00 UTC) | Alpha and Red Team on `gpt-4o-mini`, CIO on `gpt-4o` (structured output) | Each agent reads the ~10.7k-character `bobby-intel` briefing. The function is named `callClaude()` but calls OpenAI. |
| Live voice (`api/_lib/realtime-config.ts`) | `gpt-realtime-2.1`, `gpt-4o-mini-transcribe` | Tools: `get_market`, `run_debate`, `draw_levels`, `update_thesis`… Capped at 3 minutes per identity per day (`voice-budget.ts`). |
| MCP, `explain`, judge-mode, Telegram DM | `gpt-4o` / `gpt-4o-mini` | `claude-*` ids in the code are legacy labels mapped to OpenAI. |

**Spend so far.** Spend was never recorded: `agent_cycles.cost_usd` is 0 on all 3,427 rows, `agent_events.tokens_*` is null, and the local OpenAI key lacks `api.usage.read`. The estimate from real volume is **$35–70 total**:
- 3,427 cycles, 97% of them March–June when the cron ran every few minutes, at about $0.008 each (measured);
- about 1,650 MCP calls.

Voice was never logged either. The real figure is only in the OpenAI usage dashboard.

`ANTHROPIC_API_KEY` exists in prod but nothing uses it.

## 2. Measured: frontier model matrix for the `/desk` debate

**Method.**
- **Prompts and evidence:** the exact `runDeskDebate` prompts, with live evidence from `loadDeskEvidence()`.
- **Cases:** BTC with a Spanish question, NVDA with an English one.
- **Limits:** output cap raised to 4,000 tokens so nothing truncates.
- **Scoring:** 2 blind judges from different providers (Opus 5.5 at medium effort, and `gpt-6-sol`) score the CIO answer from 1 to 10 on grounding, insight, answers-the-question, honesty and clarity.
- **Script:** `scripts/eval/desk-model-matrix.mts`.

Prices used are the official list prices of 2026-09-29, in $ per million tokens (input / output):

| Model | Input | Output |
|---|---|---|
| `gpt-4o-mini` | 0.15 | 0.60 |
| `gpt-6-luna` | 0.10 | 0.50 |
| `gpt-6-sol` | 2 | 10 |
| Haiku 4.5 | 1 | 5 |
| Sonnet 5.5 | 2 | 10 |
| Opus 5.5 | 4 | 20 |

Results, averaged over both cases:

| Config (Alpha / Red / CIO) | Score | Insight | $ / debate | Latency |
|---|---|---|---|---|
| **A. `gpt-4o-mini` (today)** | **5.95** | **3.3** | $0.00035 | 4.6 s |
| B. `gpt-6-luna` | 7.55 | 6.3 | $0.00046 | 9.6 s |
| C. `gpt-6-sol` | 8.35 | 6.8 | $0.0091 | 14.7 s |
| D. Haiku 4.5 | 7.10 | 6.3 | $0.0055 | 10.7 s |
| E. Sonnet 5.5, low effort | 8.10 | 7.8 | $0.0151 | 11.4 s |
| F. Opus 5.5, low effort | 7.45 | 7.3 | $0.0357 | 18.4 s |
| G. Opus 5.5, medium effort | 8.15 | 7.8 | $0.0486 | 25.6 s |
| H. `gpt-6-luna` debaters, Opus CIO | 7.70 | 6.3 | $0.0132 | 13.8 s |
| I. Sonnet low debaters, Opus CIO | 7.80 | 7.0 | $0.0259 | 15.4 s |

**Per-judge scores.** Judges favor their own provider, so read both columns:

| Config | Opus judge | `gpt-6-sol` judge |
|---|---|---|
| A. today | 5.4 | 6.5 |
| B. `gpt-6-luna` | 6.9 | 8.2 |
| C. `gpt-6-sol` | 7.8 | **8.9** (self-judged) |
| E. Sonnet 5.5 low | **8.0** | 8.2 (most consistent) |
| G. Opus 5.5 medium | 7.8 | 8.5 |

The `gpt-6-sol` judge scores everything about 0.8 higher, and about 1.1 higher when it judges its own output.

**Readings.**
1. **Today's desk is the weakest configuration by a wide margin.** Its insight averages 3.3, while every frontier configuration reaches 6.3–7.8. It restates RSI, support and resistance.
2. **`gpt-6-luna` is a nearly free upgrade.** It costs less per token than `gpt-4o-mini` and scores +1.6. The trade-off is that latency doubles.
3. **Sonnet 5.5 at low effort** gives Opus-medium quality and insight at about a third of the cost and half the latency. It is also the configuration both judges agree on most.
4. **Opus 5.5 at low effort underperforms Sonnet low.** Opus needs medium effort or more to earn its price.
   - Its adaptive thinking is always on and billed as output tokens.
   - At the current `max_tokens: 650` it truncated in 5 of 6 calls in the first test, which the desk would reject as "Incomplete desk argument".
5. **Hybrids (a cheap debater plus an Opus CIO) did not beat Sonnet low.** A judge cannot exceed the arguments and evidence it is handed.
6. **Every model hit the same wall.** Even Opus medium ends with the same list: "faltan volumen, estructura diaria y semanal, noticias y derivados" (missing volume, daily and weekly structure, news and derivatives).

**Daily cycle (first test, `scripts/eval/desk-cycle-cost-test.mts`).** Today's cycle (mini/mini/4o) costs $0.008. On Opus 5.5 it costs about $0.10 with uncapped output. Opus also uses about 1.5–1.9× the input tokens for the same text, because of its newer tokenizer and the Spanish text.

**Caveats.**
- n = 2 cases, so this is directional.
- LLM judges are noisy and biased.
- Phase 0 replaces this with a 50–100-question eval set and a human spot check.

## 3. Defining and measuring "10× smarter"

A 1–10 rubric cannot move 10×, so "10×" is a capability target measured on three layers:

| Layer | Metric | Today | Target |
|---|---|---|---|
| Answer quality (offline eval, 2 cross-provider judges + 20-sample human check) | rubric average; **insight** separately | 5.95; insight 3.3 | ≥ 8.5; insight ≥ 8 |
| What Bobby knows per answer | evidence sources × timeframes × memory | 1 source, 1 timeframe, no memory | ≥ 4 timeframes, derivatives, macro, relative strength, Bobby's own record on the symbol, the user's history |
| Being right, which is what makes it feel powerful over time | calibration of `review` + direction against resolved outcomes (forum-resolve / TrackRecord already grade the cycle) | not measured | Brier score published; hit rate by conviction bucket |
| Product | follow-up rate, reads per week, Pro conversion, 👍/👎 | not instrumented | instrumented in phase 0 |

## 4. The plan: six levers

### L1. Evidence v2 (the largest gain)

The judges' own complaints are the spec. Most of it already exists in the codebase:
- **Multiple timeframes, 1H / 4H / 1D / 1W:** `api/okx-candles.ts` for crypto, `api/stock-candles.ts` (7d / 30d / 90d) for stocks.
- **Volume profile and ATR regime,** plus distance to the weekly high and low.
- **Crypto derivatives,** funding and open interest: `api/okx-perps.ts`.
- **Macro and regime,** FGI, DXY and the regime label: the `bobby-intel` briefing and `seed-macro-calendar`.
- **Relative strength** against BTC or SPY.
- **Earnings dates** for stocks.
- **News headlines:** source to be decided (question for Anthony and Codex).

Evidence is **precomputed per symbol and cached until the next bar close** in `api_cache`. It is shared by every user asking about that symbol, so its cost amortizes to about zero. Each number carries provenance (source, timeframe, `asOf`), which keeps the grounding gate enforceable.

### L2. Tools: an agentic CIO

The CIO, and Deep Dive in particular, may call up to 3 tools per answer:
- `get_candles(tf)`
- `get_derivatives`
- `get_news`
- `get_bobby_record(symbol)`
- `get_levels`

These reuse the existing voice tool definitions (`api/_lib/voice-tools.ts`: `get_market`, `run_debate`, `draw_levels`), so the desk and voice share **one tool layer**.

### L3. Memory: what makes it feel personal and powerful

- **Bobby's own past calls on this symbol and how they resolved** (`forum_threads.resolution*`, TrackRecord). Example: "Last time I flagged BTC long at 81k; it hit the target in 2 days."
- **The user's previous questions and theses** (`bobby_reads`, `update_thesis`, `harness-memory`), with consent and no PII in prompts.
- **Follow-up questions keep context** through a cached prefix, so a follow-up costs a fraction of a new debate.

### L4. Model routing and a multi-provider layer

- **Extend `api/_lib/llm.ts`** to cover both OpenAI and Anthropic, with:
  - structured outputs (JSON schema), which removes the fragile 650-token cap plus `finish_reason` check;
  - `effort` / `reasoning_effort`;
  - prompt caching;
  - usage capture;
  - cross-provider fallback, which also gives resilience.

  The alternative is the Vercel AI Gateway, which provides unified observability, fallbacks and one bill (question for Codex).
- **Tiers:**
  - free: `gpt-6-luna`;
  - Pro standard: Sonnet 5.5 low or `gpt-6-sol`, decided by the phase 0 eval;
  - Pro Deep Dive: Opus 5.5 at medium or high effort with tools, capped per month;
  - daily public cycle: Opus 5.5 on the Batch API (−50%). The cycle is the public record and the showcase, and it runs once a day.
- **A difficulty router, later:** longer horizons, multi-asset questions or "why" follow-ups escalate one tier.
- **Voice:** stays on `gpt-realtime-2.1`, the only frontier speech-to-speech option. Its `run_debate` tool goes through the new router, so voice inherits the brain. Evaluate `gpt-realtime-2.1-mini` (about ⅓ the audio price) for the free tier.

### L5. Experience: make the intelligence visible

- **Stream each agent as it reasons (SSE),** so 10–25 s becomes something to watch rather than a spinner.
- **Show evidence cards:** which timeframes and data were used, with `asOf`.
- **Draw "what would change my mind" levels on the chart** (the `draw_levels` tool exists).
- **Show the record line:** "Bobby's calls on BTC: 7/10 resolved correctly (last 90 days)".

### L6. Telemetry and cost controls

- **Add an `llm_usage` table.** One row per call: surface, tier, model, effort, tokens in / out / cached, USD, latency, stop reason, a guard-rejection flag, and a hashed identity.
- **Build a cost dashboard** with a daily spend alert.
- **Prompt caching:** Alpha, Red and CIO share the evidence block (an Opus cache hit costs 0.05× input). Reuse the symbol-level Alpha/Red base analysis within the same bar, and personalize only the CIO.
- **Budgets and a kill switch:** per-tier monthly caps, and an env switch (`BOBBY_DESK_TIER_OVERRIDE`) that drops everyone to the free tier.
- **Output length is set by the prompt and schema;** `max_tokens` is sized for thinking plus the answer.

## 5. Cost model (projections; phase 0 telemetry replaces these)

Per debate, with evidence v2 (input about 3× larger) and caching:

| Tier | Model | Est. $ / debate |
|---|---|---|
| Free | `gpt-6-luna` | ~$0.0012 |
| Pro standard | Sonnet 5.5 low (or `gpt-6-sol`) | ~$0.02 |
| Pro Deep Dive | Opus 5.5 medium with ≤3 tools | ~$0.12 |
| Today (reference) | `gpt-4o-mini` | $0.00036 |

Monthly, with a mix of 80% free, 19% Pro standard and 1% Deep Dive:

| Debates / month | Today | Proposed |
|---|---|---|
| 1,000 | $0.36 | ~$6 |
| 10,000 | $3.60 | ~$60 |
| 100,000 | $36 | ~$600 |

Other items:
- **Daily public cycle on Opus 5.5 Batch:** about $0.05/day, about $1.5/month.
- **Voice (estimate, never measured):**
  - about $0.05–0.10 per minute on `gpt-realtime-2.1`;
  - at most about $0.30 per user per day under the 3-minute cap;
  - about a third of that on the mini model.
- **Pro unit economics at $5/month:** break-even is about 250 standard debates or about 40 Deep Dives. The proposal is to cap Deep Dive at 20 per month.

## 6. Roadmap with gates

| Phase | Scope | Gate to continue |
|---|---|---|
| **0 (week 1)**: foundations, no visible change | `llm_usage` telemetry; multi-provider `llm.ts` with structured outputs; an eval set of 50–100 real questions (symbols from `bobby_reads` and forum threads, no PII) with the cross-provider judges and a human spot check; CI runs a 10-question smoke eval | The eval reproduces today's baseline (±0.3) |
| **1 (weeks 1–2)**: quick win | Free tier moves to `gpt-6-luna`. Pro standard ships behind a flag (Sonnet 5.5 low vs `gpt-6-sol`, chosen by eval). | Score +1.5 or more; p95 latency ≤ 15 s with streaming; guard rejection rate no worse than today |
| **2 (weeks 2–4)**: evidence v2 + streaming UI | Multi-timeframe evidence, derivatives, macro, relative strength; symbol cache; evidence cards | Insight ≥ 7.5 on the free tier |
| **3 (weeks 4–6)**: memory, tools, Deep Dive | Bobby's record per symbol plus user history; agentic CIO; Pro Deep Dive; daily cycle on Opus Batch | Calibration published; cost per debate within ±25% of the model |
| **4**: voice and continuous eval | Voice `run_debate` goes through the router; realtime mini for the free tier; a nightly eval dashboard | — |

## 7. Risks

- **Safety guard (`reviewDeskOutput`, regex).** Frontier models write longer and more nuanced text, which risks false positives and negatives. The guard test suite must be re-run on the new outputs, and the rejection rate tracked per model. The education-only constraints do not change: no advice, no guarantees, `wait` / `review` only.
- **Latency** rises from 5 s to 10–25 s. Streaming is mandatory before any tier ships to users.
- **Hallucination grows with richer inputs.** Grounding is a gate, and provenance is required on every number.
- **Cost runaway.** Covered by per-tier budgets, the kill switch and the daily alert.
- **Judge bias.** Already visible (section 2). Mitigated by cross-provider judges and human samples.
- **Vendor concentration.** Two providers, with fallback, and data-retention settings reviewed.
- **Public copy:** the Base-only naming rule applies to any new UI text.

## 8. Questions for Codex

1. Is the rubric and judging setup sound? How should the eval set be built from real reads without leaking PII?
2. Static per-tier routing vs a difficulty classifier: where does the classifier pay for itself?
3. Extend `api/_lib/llm.ts`, or move to the AI SDK with Vercel AI Gateway (unified billing, fallbacks, observability)?
4. Evidence v2: which sources are reliable and licensed, news especially? Is caching per symbol and bar close correct, and where exactly is the boundary between the shared analysis and the personal part?
5. How to keep the regex guard sound against longer frontier outputs? Should a model-based moderation pass sit alongside the regex?
6. Pro unit economics: are the caps (Deep Dive 20/month) and the $5 price consistent with the cost model?
7. Anything missing that would move insight more than the six levers?

## 9. Decisions for Anthony

1. Approve phases 0 and 1 now (no visible change, then the free-tier upgrade)?
2. Monthly LLM budget ceiling. The proposal: alert at $100, hard cap at $300 until telemetry exists.
3. Deep Dive cap for Pro (proposal: 20/month) and whether it is a paid feature.
4. News source: pay for one, or ship evidence v2 without news first?

## Appendix: reproduce

```bash
node --env-file=.env.local node_modules/.bin/tsx scripts/eval/desk-model-matrix.mts
node --env-file=.env.local node_modules/.bin/tsx scripts/eval/desk-cycle-cost-test.mts   # needs INTEL_JSON=<saved /api/bobby-intel response>
```

**Raw outputs (every answer, judge scores, token counts):**
- `docs/ai/data/2026-09-29-desk-model-matrix.json`
- `docs/ai/data/2026-09-29-opus-first-test.json`

**Price sources:**
- platform.claude.com/docs/en/about-claude/pricing
- developers.openai.com/api/docs/pricing
