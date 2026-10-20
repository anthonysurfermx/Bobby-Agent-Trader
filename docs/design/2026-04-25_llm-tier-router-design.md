# LLM Tier Router — Design Doc

**Date**: 2026-04-25
**Author**: Claude Opus 4.7 (autonomous morning session)
**Status**: Design only — no implementation in this PR.
**Estimated impact when shipped**: 60-75% LLM cost reduction + observability.

## TL;DR

Bobby V3 currently makes LLM calls from 14+ files using either Anthropic or OpenAI SDKs directly, with no central routing, no cache_control hints, no cost instrumentation. The V3 migration created an `llm_calls` table — no caller writes to it yet. This doc specifies a single `api/_lib/llm.ts` module as the canonical entry point, with model routing, prompt caching, retries, and cost logging built in. Migration is incremental: existing endpoints keep working while we cut over caller-by-caller.

## 1. Current state diagnostic

### 14 files calling LLMs directly

Anthropic callers (5): `agent-run.ts`, `bobby-cycle.ts`, `forum-generate.ts`, `forum-morning.ts`, `openclaw-chat.ts`.

OpenAI callers (15+ functions across): `agent-run.ts`, `bobby-cycle.ts`, `bobby-router.ts`, `explain.ts`, `forum-generate.ts`, `forum-morning.ts`, `hardness-test.ts`, `judge-mode.ts`, `openclaw-chat.ts`, `orchestrate.ts`, `registry.ts`, `sandbox-run.ts`, `telegram-webhook.ts`, `user-cycle.ts`.

### Pain points

- **No tier discipline**: most callers default to `gpt-4o` or `claude-sonnet-4.6`. No cost-aware routing.
- **No cache hints**: Anthropic's `cache_control: ephemeral` is unused. Repetitive system prompts (Alpha persona, risk policy, chain constants) get fully billed every cycle.
- **No parallelization**: Alpha and Red Team run serial in `bobby-cycle.ts:1100s` — could `Promise.all`.
- **No cost logging**: `llm_calls` table exists (V3 migration) but no writer. Zero visibility into per-cycle cost.
- **Failure handling scattered**: each caller does its own try/catch + `llmFailure()` (via `_lib/llm-health.ts`). Easy to miss when adding a new caller.
- **No retry logic**: rate limits (429) and 5xx errors fail the whole cycle. Lost work + wasted prompt cost.

### Estimated current cost per cycle (rough)

`bobby-cycle.ts` (every 5min, 288 cycles/day):
- 3 LLM calls per cycle (Alpha, Red, CIO/Judge), avg `gpt-4o` ~3000 tokens in / 800 out each
- Per cycle: ~$0.04
- Per day: ~$11.50
- Per month: ~$345

`agent-run.ts` (every 8h, 3 cycles/day): another ~$1/day.

`bobby-intel.ts` (snapshot every cycle): ~$0.01/cycle = ~$3/day.

**Rough total**: ~$15-20/day burning on LLM. Most of it is tier-overpay (using GPT-4o when Sonnet 4.6 or Haiku would do).

## 2. Target architecture

### Single canonical module: `api/_lib/llm.ts`

```ts
export interface LlmCallInput {
  agent: 'alpha' | 'red' | 'cio' | 'arbiter' | 'judge' | 'reflect' | 'evolve' | 'metacog' | 'intel' | 'explain' | 'forum' | 'mcp' | 'misc';
  endpoint: string;            // e.g. 'debate/cycle', 'intel/snapshot'
  cycleId?: string;
  /** caller's intent — drives tier selection unless tier is forced */
  task: 'synthesize' | 'critique' | 'decide' | 'reflect' | 'summarize' | 'extract' | 'translate' | 'route';
  /** static parts of the prompt (cached when provider supports) */
  systemBlocks: Array<{ text: string; cacheable: boolean }>;
  /** dynamic parts (never cached) */
  userInput: string;
  /** optional structured output schema (uses provider's JSON mode/function calling) */
  schema?: ZodSchema | OpenAIToolSchema;
  /** force a specific tier; otherwise router picks */
  forceTier?: 'haiku' | 'sonnet' | 'opus' | 'gpt-4o-mini' | 'gpt-4o' | 'gpt-5.5' | 'deepseek';
  /** escalation hints — drive opus/gpt-5.5 picks */
  escalation?: {
    tradeSizeUsd?: number;        // >$500 → escalate
    novelAsset?: boolean;          // first time touching a symbol → escalate
    arbiterConflict?: boolean;     // CIO vs Arbiter disagree → escalate
    lossStreak?: number;           // ≥3 consecutive losses → escalate CIO
  };
  /** retry policy override; defaults sane */
  retry?: { maxAttempts: number; backoffMs: number };
  /** abort controller for long calls */
  signal?: AbortSignal;
}

export interface LlmCallOutput<T = string> {
  text: T;
  usage: {
    tokensIn: number;
    tokensOut: number;
    cachedTokens: number;
    costUsd: number;
    latencyMs: number;
    cacheHit: boolean;
  };
  model: string;
  provider: 'anthropic' | 'openai' | 'deepseek';
  attempt: number;
}

export async function llmCall<T = string>(input: LlmCallInput): Promise<LlmCallOutput<T>>;
```

Single function. Returns text or structured (via overloads). Logs to `llm_calls` automatically. Caches automatically. Routes automatically. Retries automatically. Reports failures via existing `_lib/llm-health.ts` automatically.

### Tier routing table

The router maps `(agent, task, escalation)` → model. Default rules:

| agent | task default | escalation override |
|---|---|---|
| `intel` | Haiku 4.5 | — |
| `forum` (digest) | gpt-4o-mini | — |
| `red` | Sonnet 4.6 | Haiku if `tradeSizeUsd < 100`; Sonnet otherwise |
| `alpha` | gpt-4o (synthesis) | — |
| `arbiter` | Sonnet 4.6 (LLM fallback only — main arbiter is deterministic) | Opus on conflict |
| `cio` | **Sonnet 4.6 (default)** | **Opus 4.7 / GPT-5.5 only when** `tradeSizeUsd > 500` ∨ `novelAsset` ∨ `arbiterConflict` ∨ `lossStreak ≥ 3` |
| `reflect` (post-cycle) | Haiku 4.5 | — |
| `evolve` (24h meta-learning) | Sonnet 4.6 | — |
| `metacog` (24h bias audit) | Opus 4.7 | (1×/day, justifies cost) |
| `explain` (streaming) | Haiku 4.5 | — |
| `mcp` (response to external agent) | Haiku 4.5 / gpt-4o-mini | — |

Cardinal rule (Codex's Round 1 callout): **"No Opus por cron default."** Opus only on escalations. Estimated savings vs current state: 60-75%.

### Anthropic prompt caching strategy

Standard call layout:

```ts
messages: [
  { role: 'user', content: [
    {
      type: 'text',
      text: STATIC_PERSONA_RULES_OUTPUT_SCHEMA,
      cache_control: { type: 'ephemeral' }
    },
    {
      type: 'text',
      text: STATIC_CHAIN_CONSTANTS_RISK_POLICY,
      cache_control: { type: 'ephemeral' }
    },
    {
      type: 'text',
      text: DYNAMIC_CYCLE_INPUT  // no cache_control
    }
  ]}
]
```

Two cache breakpoints — one for persona+rules+schema, one for chain constants+risk policy. Cycles within 5 minutes hit both. 5-15 min apart hit one. Beyond that, miss both (fine).

Target hit rate: **>70%** in `bobby-cycle.ts` consecutive cycles.

### Retry + backoff

```ts
const DEFAULT_RETRY = {
  maxAttempts: 3,
  backoffMs: [500, 2000, 5000],  // exponential
  retryOn: ['429', '500', '502', '503', '504', 'timeout'],
};
```

If all 3 attempts fail, the call returns a typed error. Caller decides whether to fail the cycle or fall back. Per `_lib/llm-health.ts`, the failure is logged for ops alerting.

### Cost logging

After every successful or failed call, write to `llm_calls`:

```sql
insert into llm_calls (
  cycle_id, provider, model, agent, endpoint,
  tokens_in, tokens_out, cached_tokens, cost_usd,
  cache_hit, latency_ms, status, error
) values (...);
```

Cost per model is computed from a static price table (in code). Latency from local clock. Cache hit derived from response metadata.

Dashboard: `/admin/costs` reads `llm_calls` aggregated by model and day. Already proposed in V3 plan §5.

## 3. Migration plan

### Phase A — Build the module (no callers migrated)

1. Create `api/_lib/llm.ts` with the API above.
2. Implement Anthropic adapter (with cache_control).
3. Implement OpenAI adapter (with function-calling for schemas).
4. Implement DeepSeek adapter (cheap tier — Genesis-inspired).
5. Wire to `_lib/llm-health.ts` for failure logging.
6. Wire to `llm_calls` insert helper.
7. Unit tests for routing decisions (no real LLM calls — mock).

**Acceptance**: `import { llmCall } from '_lib/llm'` works; no existing endpoint changes.

### Phase B — Migrate one canary endpoint

Pick `api/forum-morning.ts` — it's lower-stakes than `bobby-cycle`, runs daily, easy to roll back.

Replace direct anthropic/openai SDK calls with `llmCall({ agent: 'forum', task: 'summarize', ... })`. Verify production behavior unchanged for 1 week. Confirm `llm_calls` rows accumulate.

### Phase C — Migrate the high-value endpoints

In order:
1. `bobby-cycle.ts` (highest cost — biggest win)
2. `agent-run.ts`
3. `bobby-intel.ts` (move to Haiku tier — immediate cost cut)
4. `explain.ts` (streaming variant — keep as Haiku)
5. `orchestrate.ts`, `judge-mode.ts`, `bobby-router.ts`, `user-cycle.ts`
6. `forum-generate.ts`, `forum-morning.ts` (already canary)
7. `openclaw-chat.ts`, `hardness-test.ts`, `sandbox-run.ts`
8. `telegram-webhook.ts` (whatever LLM piece it uses)
9. `registry.ts` (probably trivial)

Each migration = 1 PR. Each PR includes:
- Code change
- Smoke test (curl the endpoint, verify response unchanged in shape)
- Spot-check `llm_calls` row was written

### Phase D — Cleanup

After all callers migrated:
- Remove the direct SDK imports from old call sites.
- Add lint rule: only `_lib/llm.ts` may import `@anthropic-ai/sdk` or `openai`.
- Document the lint rule in `CLAUDE.md`.

## 4. Open questions / unknowns

1. **GPT-5.5 pricing**: assumed ≈ Opus 4.7 tier (~$15/$75 per M tokens). If significantly cheaper, the escalation rule for CIO might tilt toward GPT-5.5 for everything. Confirm at GA.

2. **DeepSeek API stability**: Genesis Protocol uses it as primary. We use it as a cheap tier. Failure rate on production cycles unknown — start it in low-stakes paths first (forum digest, intel summaries).

3. **Streaming**: `explain.ts` streams via SSE. The router should support streaming responses (current API only returns final text). Add `streaming: true` flag with iterator return type.

4. **Multi-provider failover**: if Anthropic is down, fall back to OpenAI? Adds complexity. **Recommendation: NOT in V1**. Cycle-level retry is enough; if a whole provider is down for >30min, that's an ops problem (alert + manual override).

5. **Token counting before send**: Anthropic supports `count_tokens` API. Useful to abort cycles that would exceed budget before paying for them. **Add in V2.**

6. **Prompt template versioning**: when we change the Alpha persona prompt, we want cache invalidation. Embed a version string in the cached block. Document in code.

7. **OpenAI o1-style reasoning models**: not on the routing table yet. Worth an evaluation pass — they may obviate the Opus escalations for `cio` decision tasks.

## 5. Risk flags

- **Migration pace**: rolling out caller-by-caller is slow. Tempting to big-bang it. Don't. The whole point of incremental is being able to roll back any single caller without nuking the whole system.

- **Cache eviction surprise**: Anthropic's ephemeral cache is best-effort. If Bobby's traffic pattern leaves it idle 5min+ between cycles, cache misses spike. Monitor `cache_hit` in `llm_calls`; tune the cycle interval if hit rate < 50%.

- **Cost log overhead**: a Supabase write per LLM call adds 50-200ms latency. For non-critical paths fine; for cycle hot path consider batch writes (queue + flush every N seconds) — added complexity, defer to V2 if observability is good enough without it.

- **Lock-in**: putting all calls behind one module is a future "we can't easily switch providers" risk. Counter: the abstraction IS the lock-in protection — the API surface stays even if providers change underneath.

## 6. Effort estimate

| Phase | Effort |
|---|---|
| Phase A: build module + tests | ~1 working day |
| Phase B: canary migration | ~3 hours |
| Phase C: 14 caller migrations | ~6-8 working hours total (some are trivial) |
| Phase D: cleanup + lint | ~2 hours |
| **Total** | ~2.5-3 working days |

Assumes no major mid-flight rewrite. Most of Phase C is mechanical.

## 7. Success metrics post-rollout

- **Cost / day**: from ~$15-20/day to ~$5-7/day (60-75% reduction target)
- **Cache hit rate** in `bobby-cycle.ts`: ≥70% on consecutive cycles
- **Latency p50** unchanged or improved (parallelization compensates for routing overhead)
- **`llm_calls` row count** = 1:1 with actual LLM calls (no orphans, no missed inserts)
- **Zero direct SDK imports** outside `_lib/llm.ts` (enforced by lint)

## 8. Decision needed before implementation

User confirms one of:
- **Ship Phase A this week + canary Phase B next week** → standard rollout.
- **Defer until Bobby Verifier Node ships** → avoid context split during hackathon.

My weak preference: defer until after Bobby Verifier Node primary submission (May 6). The 60-75% cost saving is real but not blocking; hackathon momentum is. Pick this up the week of May 9.

## Sources / references

- V3 plan FINAL §5 (LLM optimization): `.ai/decisions/2026-04-24_bobby-v3-plan-FINAL.md` (gitignored, on local disk)
- Round 1 Codex review item 10 (tier routing): same plan
- `api/_lib/llm-health.ts` — existing failure logger
- Migration: `supabase/migrations/20260424_bobby_v3_schema.sql` — `llm_calls` table
- Anthropic prompt caching docs: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
