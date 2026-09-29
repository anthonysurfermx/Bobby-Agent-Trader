# Bobby intelligence plan: brief for review (2026-09-29)

**Ask.** Make Bobby feel far smarter, powerful enough that a user notices, on frontier models, while keeping unit costs under control.

**Audience.** Anthony, and Codex as the second reviewer.

**Evidence.** All numbers come from runs made on 2026-09-29 against production data and the current prompts. The raw results are in `docs/ai/data/` and the scripts in `scripts/eval/`, so every table can be reproduced.

**Versions.**
- **v1** (`a510d29`): model matrix and plan. Reviewed by Codex the same day.
- **v2** (`c44d441`): Anthony's analysis-level slider, with Sonnet 5.5 as the ceiling.
- **v3** (this file) folds in Codex's review (section 8):
  - a production-path check (section 2c);
  - an evidence-sufficiency lever (L0);
  - provider-level spend caps;
  - conservative allowances until the cost is measured;
  - streaming moved into phase 1;
  - the control rebuilt in Codex's effort-popover pattern (section 4b).

## 0. TL;DR

- **Where Bobby is today.**
  - Every LLM call goes to OpenAI.
  - The `/desk` debate is 3 sequential `gpt-4o-mini` calls.
  - The only evidence is a summary of 1H candles for one instrument.
  - It has no memory and no tools, and nothing records tokens or cost.
  - Blind judges score its answers **5.8–5.95/10**, and **2.5–3.3/10 on insight**, the dimension that makes Bobby feel smart.
- **What the model alone buys.** Using the same prompts and evidence, frontier models score **7.5–8.4**. The biggest single jump is almost free: `gpt-6-luna` scores about +1.6–2.2 for about +30% cost.
- **This justifies a test of `gpt-6-luna`, not a production switch (Codex).** The matrix has two limits:
  - it is two questions, and 30 of 31 debates ended in `wait`, so the `review` path is barely exercised;
  - the eval script did not run the production path.

  **Do not flip `BOBBY_DESK_MODEL` alone.** Measured in section 2c: GPT-6 models reject production's `max_tokens` and `temperature: 0.2`, so every debate would fail.
- **The ceiling looks like the evidence, not the model.** Every frontier model ended the same way: "wait — missing daily/weekly structure, volume, news, derivatives". This is a **hypothesis until phase 2 tests 1H evidence against evidence v2 with the same model**.
- **"10× smarter" means compounding levers:**
  - **L0** says what is missing for the horizon asked;
  - **L1** richer evidence;
  - **L2** tools;
  - **L3** memory;
  - **L4** model routing by level;
  - **L5** streaming;
  - **L6** telemetry and caps.

  The model is one lever.
- **Product decision (Anthony, 2026-09-29): the user picks the analysis level, Codex-style.** A small pill in the composer ("⚡ Rápido ⌄") opens a compact card: the level name in its color, one line, a gradient bar with a star field and a white thumb.
  - The stops are **Rápido · Profundo · Máximo**.
  - Today's sphere stays exactly as it is and only takes the level's tint.
  - A very subtle FREE / PRO tag sits beside it.
  - **Sonnet 5.5 is the ceiling; Opus is not used in the product.**
  - Mockup: `docs/ai/mockups/analysis-level.html` (section 4b).

  | Level | Models | What changes | Measured $ / debate (today's evidence) |
  |---|---|---|---|
  | Rápido | `gpt-6-luna` ×3 | 1H evidence + a sufficiency note | $0.0005, ~11 s |
  | Profundo | `gpt-6-luna` debaters, `claude-sonnet-5-5` CIO (medium) | + evidence v2 + Bobby's memory | $0.005, ~11 s (projected ~$0.01 with evidence v2) |
  | Máximo | `claude-sonnet-5-5` ×3 (high) | + CIO tools + a second round + scenarios | $0.016, ~11 s (projected ~$0.05 and 30–45 s, **unmeasured**) |
  | Daily public cycle | Sonnet 5.5, synchronous API | — | unmeasured on Sonnet; measured in phase 0 |
  | Live voice | `gpt-realtime-2.1`; `run_debate` uses the selected level | — | unmeasured |
- **Money.**
  - A spend alert at $100/month and a **hard cap at $300/month set in the provider consoles** (Codex), covering every LLM call: debate, cycle, voice, the rest.
  - A kill switch that downgrades the model does not stop spend; the caps do.
  - Free worst case: about $0.40/month. Pro text worst case: about $1.46/month.
  - **Voice is the unit-economics risk.** 90 minutes a month under today's 3-minute daily cap could cost more than the $5 plan (section 5).

## 1. What Bobby runs today (verified in code and production)

| Surface | Model | Notes |
|---|---|---|
| `/desk` debate, web and iOS (`api/_lib/desk-debate.ts`) | `gpt-4o-mini` ×3, sequential | Calls OpenAI directly, not through `llm.ts`. `BOBBY_DESK_MODEL` is unset in prod. Each call sends `temperature: 0.2` and `max_tokens: 650`, and requires `finish_reason === 'stop'`. The zod schema caps each paragraph at 20–1,800 characters. The evidence is `analysisSummary()` of 1H candles. |
| Daily public cycle (`api/bobby-cycle.ts`, cron at 12:00 UTC) | Alpha and Red Team on `gpt-4o-mini`, CIO on `gpt-4o` (structured output) | Each agent reads the ~10.7k-character `bobby-intel` briefing. The function is named `callClaude()` but calls OpenAI through `llm.ts`. |
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
2. **`gpt-6-luna` is the cheapest large step.** It costs less per token than `gpt-4o-mini`. The trade-off is that latency doubles.
3. **Sonnet 5.5 at low effort** gives Opus-medium quality at about a third of the cost and half the latency. It is also the configuration both judges agree on most.
4. **Opus 5.5 needs medium effort or more to earn its price.**
   - Its thinking is always on and billed as output.
   - In the first test it truncated at `max_tokens: 650`, and all three of its cycle outputs truncated (see the cycle test below).
5. **Hybrids (a cheap debater plus an Opus CIO) did not beat Sonnet low.** A judge cannot exceed the arguments it is handed.
6. **Every model hit the same wall.** Even Opus medium ends with the same list: "faltan volumen, estructura diaria y semanal, noticias y derivados" (missing volume, daily and weekly structure, news and derivatives).

### 2b. Slider levels (second run, same method)

Script: `MATRIX_CONFIGS=A,B,E,J,K,L,M` on `scripts/eval/desk-model-matrix.mts`. Raw results: `docs/ai/data/2026-09-29-desk-slider-levels.json`.

| Config | Score | Insight | $ / debate | Latency |
|---|---|---|---|---|
| A. `gpt-4o-mini` (today) | 5.80 | 2.5 | $0.00035 | 5.3 s |
| B. `gpt-6-luna` | 8.00 | 6.0 | $0.00047 | 11.1 s |
| J. `gpt-6-luna`, `reasoning_effort: high` | 8.15 | 6.3 | $0.00059 | 13.0 s |
| M. `gpt-6-luna` debaters, Sonnet 5.5 CIO (medium) | **8.25** | 7.0 | **$0.0052** | 11.4 s |
| E. Sonnet 5.5, low effort | 8.10 | 7.5 | $0.0163 | 11.6 s |
| K. Sonnet 5.5, medium effort | 8.10 | **8.0** | $0.0165 | 12.6 s |
| L. Sonnet 5.5, high effort | 8.10 | 7.8 | $0.0157 | 11.4 s |

**Readings.**
- `gpt-6-luna` varied between runs (7.55 on the first run, 8.00 on this one), so n = 2 is noisy.
- **Raising effort does nothing with thin evidence.** Effort only pays off when there is more to reason over: more timeframes, tools, a second round.
- **M** is the best value, and that is why it is Profundo's base.
- Insight rises from **2.5 → 6.0 (Rápido) → 7–8 (Sonnet)**.

### 2c. Production-path check (added after Codex's review)

Codex pointed out that the matrix bypassed production's schema, guard and request parameters. Two checks, both reproducible:

**1. The recorded answers replayed through the real `/desk` validation.** Script: `scripts/eval/desk-guard-check.mts`. It runs offline with no API calls. It applies the same zod schema as `desk-debate.ts` and the real `reviewDeskOutput` guard, and counts calls over production's 650-token cap.

| Result (31 recorded debates) | Finding |
|---|---|
| Schema (after stripping code fences) | 0 failures |
| Guard (`reviewDeskOutput`) | **0 rejections** for any model |
| JSON wrapped in ```` ```json ```` fences | Haiku 4.5: 2 of 2 debates; Opus 5.5 medium: 1 of 2. Production's `JSON.parse` would fail on them. Sonnet 5.5 and GPT-6: none. |
| Calls over 650 output tokens | Opus only (3 calls). Sonnet 5.5 and `gpt-6-luna` stayed under the cap, with a peak of 445 on `gpt-6-luna` at high effort. |
| Verdicts | **30 `wait`, 1 `review`.** The `review` path is effectively untested. |

**2. `gpt-6-luna` with production's exact request.** One call each, 2026-09-29:
- **`max_tokens: 650`** returns 400: "'max_tokens' is not supported with this model. Use 'max_completion_tokens'". The same happens on `gpt-6-sol`.
- **`temperature: 0.2`** returns 400: "Only the default (1) value is supported".
- **`max_completion_tokens: 650`, no temperature:** works, and the internal reasoning counts inside the limit (34 of 52 tokens in the probe).

**Consequence:** setting `BOBBY_DESK_MODEL=gpt-6-luna` would make every debate return "Desk model unavailable". The switch goes through an adapter:
- `max_completion_tokens` with headroom for reasoning;
- no `temperature` for GPT-6;
- structured outputs instead of the prompt-only JSON contract.

It also needs a **paired eval on frozen evidence** through the real schema and guard (phase 1 gate).

**Daily cycle (first test, `scripts/eval/desk-cycle-cost-test.mts`).** Today's cycle (mini/mini/4o) costs $0.008.
- The Opus figure (about $0.10) came from a run where **all three Opus outputs truncated** (Codex), so it is a floor, not an estimate.
- Opus also used about 1.5–1.9× the input tokens for the same text.
- With Opus out of the product, the cycle's Sonnet cost is measured in phase 0.

**Caveats.**
- n = 2 cases, so this is directional.
- LLM judges are noisy and biased.
- Phase 0 replaces this with the eval set described in section 6.

## 3. Defining and measuring "10× smarter"

A 1–10 rubric cannot move 10×, so "10×" is a capability target measured on several layers:

| Layer | Metric | Today | Target |
|---|---|---|---|
| Answer quality (offline eval, 2 cross-provider judges; humans review every judge disagreement) | rubric average; **insight** separately; **debate quality** (does Red engage Alpha's actual argument; does the CIO weigh both) | 5.8–5.95; insight 2.5–3.3 | ≥ 8.5; insight ≥ 8 |
| Horizon sufficiency (L0) | the answer names what is missing for the horizon asked before any thesis | not checked | 100% on the insufficient-evidence cases |
| What Bobby knows per answer | evidence sources × timeframes × memory | 1 source, 1 timeframe, no memory | ≥ 4 timeframes, derivatives, macro, relative strength, Bobby's record on the symbol, the user's history (signed in) |
| Being right, which is what makes it feel powerful over time | calibration of `review` + direction against resolved outcomes (forum-resolve / TrackRecord already grade the cycle) | not measured | Brier score published; hit rate by conviction bucket |
| Product | follow-up rate, reads per week, Pro conversion, 👍/👎 | not instrumented | instrumented in phase 0 |
| Cost | $ per **accepted** answer (passed schema and guard) and per user, voice included | not measured | measured per level and tier |

## 4. The plan: the levers

### L0. Evidence sufficiency for the horizon asked (added by Codex)

- **Bobby first states what it has and what the horizon needs, then argues.** If the user asks about "this week" and the evidence is 1H candles, it says what is missing before any thesis.
- **This is cheap, it is honest, and it makes Rápido smarter immediately.**
- It is implemented as a deterministic check on the evidence (timeframes available against the horizon parsed from the question) passed to all three roles, and scored by the eval.

### L1. Evidence v2 (hypothesis: the largest gain)

The judges' own complaints are the spec. Most of it already exists in the codebase:
- **Multiple timeframes, 1H / 4H / 1D / 1W:** `api/okx-candles.ts` for crypto, `api/stock-candles.ts` (7d / 30d / 90d) for stocks.
- **Volume profile and ATR regime,** plus distance to the weekly high and low.
- **Crypto derivatives,** funding and open interest: `api/okx-perps.ts`.
- **Macro and regime,** FGI, DXY and the regime label: the `bobby-intel` briefing and `seed-macro-calendar`.
- **Relative strength** against BTC or SPY.
- **Verifiable events with source and date,** such as earnings dates and the macro calendar.

**News (decided, following Codex):** launch without paid news.
- Measure how much each source improves the eval.
- License news only when a same-model test shows an additional gain **and** the license covers use in the product (for example, NewsAPI's Developer plan does not allow production).

**Cache (Codex).**
- Key by symbol, source, timeframe and `asOf`; use **closed** candles only, with a source-specific expiry.
- Market data and the market analysis are shared across users. Personal history is added **only after the user is authenticated**.
- **Before widening reuse, review the usage rights of the current stock data sources.**

Every number keeps its provenance (source, timeframe, `asOf`). Phase 2 tests **1H evidence against evidence v2 on the same model**, because the claim that evidence gives the biggest gain is still a hypothesis.

### L2. Tools: an agentic CIO (Máximo only)

The CIO may call up to 3 tools per answer:
- `get_candles(tf)`
- `get_derivatives`
- `get_events`
- `get_bobby_record(symbol)`
- `get_levels`

These reuse the voice tool definitions (`api/_lib/voice-tools.ts`), so the desk and voice share one tool layer. Máximo's per-answer cost is only priced after it is measured with tools (Codex).

### L3. Memory: what makes it feel personal and powerful

- **Bobby's own past calls on this symbol and how they resolved** (`forum_threads.resolution*`, TrackRecord). Example: "Last time I flagged BTC long at 81k; it hit the target in 2 days."
- **The user's previous theses** (`update_thesis`, `harness-memory`). These are used **only for signed-in users**, with consent, and no personal text is ever stored in eval results. Note that `bobby_reads` stores symbols and access, not questions.
- **Follow-ups keep context** through a cached prefix.

### L4. Model routing and the provider layer

- **Keep `api/_lib/llm.ts` as Bobby's own interface** (Codex).
  - Add provider adapters (OpenAI, Anthropic) and usage logging behind flags.
  - **Connect `/desk` first**; today it calls OpenAI directly.
  - The adapter owns the per-model request shape (the GPT-6 parameters from section 2c), structured outputs, `effort` / `reasoning_effort`, prompt caching and cross-provider fallback.
  - A wholesale move to the Vercel AI Gateway is not a fix for the budget problem: the Gateway budget does not count BYOK spend and can overshoot on the call that crosses the threshold.
- **Routing is static: the level the user picks, bounded by the plan's allowance.**
  - Rápido: `gpt-6-luna`.
  - Profundo: `gpt-6-luna` debaters, Sonnet 5.5 CIO.
  - Máximo: Sonnet 5.5 at high effort.
  - A difficulty classifier is added only if the eval shows which question types improve enough to justify the cost and the wait.
- **Daily public cycle: Sonnet 5.5 on the synchronous API.** The Batch API is dropped (Codex): it is asynchronous, with up to 24 h to complete, and it saves cents on one run a day.
- **Opus is not used in the product.** `gpt-6-sol` stays a candidate for Máximo if the phase 0 eval favors it.
- **Voice:** stays on `gpt-realtime-2.1`, and `run_debate` uses the selected level. `gpt-realtime-2.1-mini` is evaluated for the free tier.

### 4b. The analysis-level control (product decision, Anthony, 2026-09-29)

**Interface.** It follows Codex's effort popover, in Núcleo's language. Mockup: `docs/ai/mockups/analysis-level.html`. It uses the real sphere and was verified on desktop and at 375 px.

- **The pill.** A small pill sits inside the question pill, before send and the mic: "⚡ Rápido ⌄". On phones it collapses to the icon and chevron.
- **The card.** A tap opens a **compact card anchored above the pill, smaller than the question pill** (about 232 × 90 px; the question pill is 620 × 58). The card holds:
  - **top row:** the level icon (bolt, layers, spark), the level name in Sora in its color, a chevron that unfolds "what Bobby does at this level", and a reset button;
  - **the bar:** a slim track with the level's gradient, a slow star field and a white thumb a little taller than the track;
  - **bottom line:** what the level does ("Más datos · 15 s") and the allowance ("2/3 · semana").
- **Colors:** pearl → cyan → violet, taken from the mic glow's own brand colors. Never green, red or amber: on this glass those mean a verdict.
- **The sphere stays exactly as it is.**
  - Only its built-in `tint()` changes, up to the shader's 0.35 cap, together with a light pool under the glass in the level's color, like the home page's rim light.
  - The shader is not modified.
  - A **very subtle FREE / PRO tag** (a 9 px mono hairline capsule) sits at about two o'clock off the glass. There is no tag for guests.
- **Model names are not shown:** the user picks depth, not a provider.
- **Accessibility:** a native range input (keyboard, `aria-valuetext`); Escape closes the card.
- **iOS:** the same popover, with a 3-step slider and haptics on each step.

**Levels.** Each one changes what Bobby does, not just the model:

| | Rápido | Profundo | Máximo |
|---|---|---|---|
| Evidence | 1H + sufficiency note (L0) | 1H/4H/1D/1W + derivatives + macro + relative strength | the same |
| Memory | — | Bobby's past calls; the user's history if signed in | the same |
| Tools | — | — | the CIO calls up to 3 |
| Debate | 1 round | 1 round | 2 rounds (Red replies) + scenarios: what would confirm it, what would invalidate it |
| Models | `gpt-6-luna` ×3 | `gpt-6-luna` ×2 + Sonnet 5.5 CIO (medium) | Sonnet 5.5 ×3 (high) |
| Target time to the first streamed word / to the verdict | < 2 s / ~10 s | < 2 s / ~15 s | < 2 s / 30–45 s |
| Est. $ / debate | ~$0.0012 | ~$0.01 | ~$0.05 (unmeasured) |

**Allowances.** These are Anthony's proposal, made conservative per Codex until the real cost is measured:

| | Rápido | Profundo | Máximo |
|---|---|---|---|
| No account | 2 (then sign in) | 1 | locked: "with your free account" |
| Free account | 10 / week (today's cap) | 3 / week | 1 / week |
| Pro ($5/month) | no visible limit (fair use: 300/month) | 60 / month | **10 included / month**; extra packs priced only after Máximo's cost is measured with tools (hard cap 30) |

- **Text worst case at the cap:**
  - no account: about $0.012 once;
  - free: about $0.40/month;
  - Pro: about **$1.46/month** (300 × $0.0012 + 60 × $0.01 + 10 × $0.05).
- **This excludes voice, payment fees and infrastructure** (Codex). Apple keeps 15–30%, so a $5 Pro nets $3.50–4.25. Voice is the real risk (section 5).
- **Running out:** when a level is used up, Bobby suggests the level below and does not block the desk.

**Server enforcement.**
- The level travels to the server (`/api/desk-debate`, `level=rapido|profundo|maximo`).
- The allowance is counted per (identity, level) in the reads ledger (`api/_lib/access.ts`). Whether that is a `level` column on `bobby_reads` or a table of its own is decided in phase 1.
- The client never decides what is allowed.
- An answer that fails the schema or the guard does not consume the allowance.

### L5. Experience: make the intelligence visible

- **Streaming ships in phase 1** (Codex). Each validated argument appears as soon as it passes the checks.
- **Show the agents' validated arguments, never their internal reasoning** (thinking).
- **Evidence cards:** which timeframes and data were used, with `asOf`.
- **"What would change my mind" levels** are drawn on the chart (the `draw_levels` tool exists).
- **The record line:** "Bobby's calls on BTC: 7/10 resolved correctly (last 90 days)".

### L6. Telemetry, guard and cost controls

- **An `llm_usage` table.** One row per call: surface, level, tier, model, effort, tokens in / out / cached / reasoning, USD, latency, stop reason, schema and guard result, and a hashed identity. Voice included (realtime usage from `response.done`).
- **Provider-level caps, set now (Codex):**
  - a dedicated OpenAI project and a dedicated Anthropic workspace for Bobby;
  - enforceable monthly limits split so the sum is ≤ $300, for example $200 OpenAI (voice included) and $100 Anthropic;
  - alerts summing to $100;
  - `llm_usage` is reconciled against both consoles weekly.
- **The level kill switch drops everyone to Rápido, but it does not stop spend.** The caps do.
- **Guard (Codex):**
  1. a structured schema;
  2. every number checked against its provenance;
  3. the current regex guard run on each complete argument before it is shown.

  A second model only audits samples and ambiguous cases; it is never the only barrier.
- **Prompt caching:** Alpha, Red and CIO share the evidence block, and the symbol-level base analysis is reused within the same closed bar.

## 5. Cost model (projections; phase 0 telemetry replaces these)

| Level | Est. $ / debate |
|---|---|
| Rápido | ~$0.0012 |
| Profundo | ~$0.01 |
| Máximo | ~$0.05 (unmeasured with tools) |
| Today (reference) | $0.00036 |

Monthly debate cost, with a mix of 75% Rápido, 20% Profundo and 5% Máximo. This is **debates only**; it excludes voice and other calls (Codex):

| Debates / month | Today | Proposed |
|---|---|---|
| 1,000 | $0.36 | ~$5 |
| 10,000 | $3.60 | ~$54 |
| 100,000 | $36 | ~$540 |

Other items:
- **Daily public cycle on Sonnet 5.5:** unmeasured. It is 3 calls a day on a ~3k-token briefing, so it should be cents a day. Measured in phase 0.
- **Voice (estimate, never measured) is the unit-economics risk:**
  - about $0.05–0.10 per minute on `gpt-realtime-2.1`;
  - today's cap of 3 minutes per day allows about 90 minutes a month, which is **about $4.50–9 for one daily voice user, more than the $5 plan**;
  - phase 0 measures the real cost per minute;
  - then per-plan monthly voice minutes are set, and `gpt-realtime-2.1-mini` (about ⅓ the audio price) is evaluated for the free tier.

## 6. Roadmap with gates

| Phase | Scope | Gate to continue |
|---|---|---|
| **0 (starts now)**: foundations, no visible change | Provider-level spend caps (Anthony, section 9). `llm_usage`, voice included. `/desk` through `llm.ts` with a per-model adapter and structured outputs. L0 sufficiency check. **Eval set:** 50–100 fixed questions on **frozen evidence snapshots**, in ES / EN / PT, including `review` cases, several horizons and insufficient-data cases; symbols chosen from `bobby_reads`; questions written to be representative or collected with consent; no personal text stored. Cross-provider judges, with humans reviewing every disagreement. Debate-quality score. CI runs a 10-question smoke eval. The cycle's Sonnet cost and voice cost per minute are measured. | The eval reproduces today's baseline (±0.3) |
| **1**: Rápido on `gpt-6-luna` + the level control + streaming | The level control and per-level ledger ship behind a flag. Profundo starts as `gpt-6-luna` + a Sonnet 5.5 CIO. Basic streaming of validated arguments. | **Launch gate (Codex):** a paired eval on frozen evidence where every answer passes the real schema and guard; the rejection rate is no worse than today; p95 latency to the verdict is within target; the score is +1.5 or more; allowances are enforced by the server |
| **2**: evidence v2 | Multi-timeframe evidence, derivatives, macro, relative strength, verifiable events; symbol cache (closed bars); evidence cards. **1H against v2 on the same model.** | Profundo's insight is 1 point or more above Rápido's |
| **3**: memory, tools, Máximo | Bobby's record per symbol plus signed-in user history; agentic CIO with a second round; Máximo opens with 10 included for Pro; daily cycle on Sonnet (synchronous) | Máximo is 0.5 or more above Profundo; calibration published; cost per accepted answer within ±25% of the model before extra packs are priced |
| **4**: voice and continuous eval | Voice `run_debate` goes through the router; realtime mini for the free tier; per-plan voice minutes; a nightly eval dashboard | — |

## 7. Risks

- **Parameter drift.** Proven in section 2c: a model swap without the adapter breaks the desk. Only the adapter changes models.
- **Safety guard.** No rejections so far across 31 debates. The guard runs on every complete argument, the rejection rate is tracked per model, and a second model audits samples. The education-only constraints do not change: no advice, no guarantees, `wait` / `review` only.
- **Latency** rises from 5 s to 10–45 s. Streaming ships with phase 1.
- **Hallucination grows with richer inputs.** Grounding is a gate, and every number is checked against its provenance.
- **Cost.** Provider-level hard caps, with `llm_usage` reconciled against the consoles. Voice is the dominant unknown.
- **Data rights.** Review the current stock data sources before reusing their data more widely.
- **Judge bias.** Already visible (section 2). Mitigated by cross-provider judges and human review of every disagreement.
- **Public copy:** the Base-only naming rule applies to any new UI text.

## 8. Codex review (2026-09-29, on `a510d29`): what was adopted

| Topic | Codex's position | Status in v3 |
|---|---|---|
| Phases 0–1 | Yes, with a launch gate for phase 1 (paired eval on frozen evidence, real schema and guard, rejection rate, p95 to the verdict); streaming moves into phase 1; `BOBBY_DESK_MODEL` alone does not reproduce the test | Adopted. The parameter mismatch was confirmed by measurement (section 2c). |
| Budget | $100 alert and $300 cap across all LLM calls, set in Bobby-dedicated provider projects / workspaces; the kill switch doesn't stop spend; the Gateway budget doesn't count BYOK | Adopted (L6); the consoles are Anthony's to set |
| Deep Dive | 5 included plus up to 15 paid, with a max of 20; the break-even points in v1 were not margins | Superseded by Máximo on Sonnet (about 2.4× cheaper than the Opus Deep Dive), with the same principle: **10 included**, packs priced only after measurement, hard cap 30 |
| News | Launch without paid news; measure each source's gain; check the license (the NewsAPI Developer plan is not for production) | Adopted (L1) |
| Eval and privacy | Judges as a signal, humans on disagreements, a debate-quality score; the same 50–100 questions and snapshots in ES / EN / PT with `review` cases, horizons and insufficient data; `bobby_reads` has no questions; no personal text stored | Adopted (sections 3 and 6) |
| Routing | Static by plan plus an explicit level; a classifier only if the eval justifies it | Adopted (L4); the level control is the explicit choice |
| LLM layer | Keep `llm.ts`, add adapters and usage logging behind flags, connect `/desk` first | Adopted (L4) |
| Evidence and cache | Key by symbol, source, timeframe and `asOf`; closed bars; per-source expiry; personal data only when signed in; review data rights | Adopted (L1) |
| Guard | Schema, number-to-provenance check, the current guard on every full argument; a second model only audits; show validated arguments, not reasoning | Adopted (L5, L6) |
| Economics | Cost per accepted answer and per user, voice included | Adopted (sections 3 and 5); voice flagged as the main risk |
| Missing lever | Evidence sufficiency for the horizon; test 1H against v2 with the same model | Adopted as L0, plus the phase 2 test |
| Daily cycle | The Opus $1.50/month was built on truncated outputs; Batch can take 24 h | Corrected: Sonnet on the synchronous API, measured in phase 0 |

**Still open for Codex:**
1. The per-level ledger: a column on `bobby_reads`, or its own table?
2. `gpt-6-sol` next to Sonnet 5.5 for Máximo, once the self-judge bias is removed by the phase 0 eval.
3. How the L0 horizon parser handles ambiguous questions ("¿conviene entrar?" with no horizon).

## 9. Decisions for Anthony

**Decided (2026-09-29):**
- an analysis-level control in 3 steps, in the Codex popover pattern;
- the real sphere tinted by level, with a subtle FREE / PRO tag;
- Sonnet 5.5 as the ceiling, with no Opus in the product;
- allowances by account type;
- phases 0 and 1 with Codex's gate;
- launch without paid news.

**Your actions:**
1. **Set the spend caps in the consoles** (account settings, so yours to change):
   - a dedicated OpenAI project and a dedicated Anthropic workspace for Bobby;
   - hard monthly limits summing to $300 (proposal: $200 OpenAI including voice, $100 Anthropic);
   - alerts summing to $100.
2. Confirm the conservative allowances in section 4b: Pro gets Profundo 60/month and Máximo 10/month included.

## Appendix: reproduce

```bash
node --env-file=.env.local node_modules/.bin/tsx scripts/eval/desk-model-matrix.mts
MATRIX_CONFIGS=A,B,E,J,K,L,M MATRIX_OUT=docs/ai/data/2026-09-29-desk-slider-levels.json node --env-file=.env.local node_modules/.bin/tsx scripts/eval/desk-model-matrix.mts
node_modules/.bin/tsx scripts/eval/desk-guard-check.mts   # offline, no API calls
node --env-file=.env.local node_modules/.bin/tsx scripts/eval/desk-cycle-cost-test.mts   # needs INTEL_JSON=<saved /api/bobby-intel response>
python3 -m http.server 4613   # then open http://localhost:4613/docs/ai/mockups/analysis-level.html (?open&level=0|1|2&tier=anon|free|pro)
```

**Raw outputs (every answer, judge scores, token counts):**
- `docs/ai/data/2026-09-29-desk-model-matrix.json`
- `docs/ai/data/2026-09-29-desk-slider-levels.json`
- `docs/ai/data/2026-09-29-opus-first-test.json`

**Price sources:**
- platform.claude.com/docs/en/about-claude/pricing
- developers.openai.com/api/docs/pricing
