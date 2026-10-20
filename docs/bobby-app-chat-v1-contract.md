# Bobby App Chat v1 — API Contract

**Status:** implementation-ready  
**Owner:** Codex / backend  
**Consumer:** Bobby iOS (`feat/bobby-ios`)  
**Product SLO:** useful chart in under 1.2 seconds p50; complete turn in under 4 seconds p50

## Product boundary

`POST /api/app-chat` is a read-only conversational market orchestrator. The
server resolves conversational context and fetches canonical market evidence;
`gpt-4o-mini` only turns that evidence into concise prose. The model does not
choose tools, execute trades, move funds, or write to TrackRecord.

The first acceptance path is:

1. `How is BTC trading?`
2. `Why are you bullish?`
3. `And versus ETH?`

The second and third turns must inherit BTC without asking for the asset again.

Real news, persistent user memory, push notifications, premium TTS and on-chain
receipt cards are separate workstreams. v1 must not claim to have live news.

## Request

```http
POST /api/app-chat
Content-Type: application/json
Accept: text/event-stream
Authorization: Bearer <device-token>
X-Bobby-Device-Id: <uuid-v4 stored in Keychain>
X-Bobby-Request-Id: <uuid-v4>
```

```ts
type AppChatRequest = {
  version: 1;
  locale: 'es-MX' | 'en-US';
  vibe: 'chill' | 'directo' | 'pro';
  messages: Array<{
    id?: string;
    role: 'user' | 'assistant';
    content: string;
  }>;
  symbol?: string | null;
  contextToken?: string | null;
  client?: {
    platform: 'ios';
    appVersion: string;
    build: string;
  };
};
```

Validation is fail-closed:

- At most 8 messages, 800 characters per message and 4,000 characters total.
- Maximum body size is 16 KB.
- Only `user` and `assistant` roles are accepted; the last message must be
  `user`.
- Unknown properties and client-supplied `system`, `tool` or `technicals`
  values are rejected.
- Numbers supplied by a public client never enter the model prompt as facts.

## Conversation state

The endpoint does not persist message content. It returns a compact HMAC-SHA256
`contextToken`, bound to the device identity, with a 30-minute TTL:

```ts
type ConversationState = {
  v: 1;
  deviceHash: string;
  activeSymbol: string;
  technicals: {
    price: number | null;
    rsi14: number | null;
    ema20: number | null;
    ema50: number | null;
    support: number | null;
    resistance: number | null;
    atrPct: number | null;
    trend: 'bullish' | 'bearish' | 'sideways';
    momentum: 'overbought' | 'oversold' | 'neutral';
  };
  marketAsOf: number;
  expiresAt: number;
};
```

Context resolution order:

1. An explicit asset in the current user message.
2. The normalized `symbol` hint.
3. `activeSymbol` from a valid context token.
4. Otherwise return `asset_required`.

Technical evidence younger than 120 seconds is reused for a follow-up. A
comparison keeps the inherited asset as primary and fetches the newly mentioned
asset in parallel.

## Deterministic orchestration

Extract a shared `getMarketContext(symbol)` helper from `api/voice-tool.ts`.
Both voice and app chat must use the same asset normalization, Yahoo/OKX market
sources and `analysisSummary(analyzeCandles(candles))` calculation. Do not
self-fetch `/api/voice-tool`; that duplicates latency and rate limits.

The route is:

1. Validate request, device token and atomic quotas.
2. Resolve intent (`analysis`, `follow_up`, or `compare`) and symbols.
3. Send `meta` immediately.
4. Fetch primary and comparison market contexts in parallel.
5. Send `asset` as soon as canonical candles and technicals are available, so
   the client can draw before the language model finishes.
6. Send the signed state token.
7. Stream a short grounded answer from `gpt-4o-mini` with
   `max_tokens: 220` and `stream_options.include_usage: true`.

`bobby-intel` is optional soft context with a 700 ms deadline. Its technical
pulse is currently limited to BTC/ETH/SOL and must never replace per-asset
candle technicals. An intel timeout degrades the answer but does not block it.

## SSE response

```http
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
X-Request-Id: <uuid>
```

Events are named and ordered. The route must not mix named events with the
legacy `[DONE]` sentinel.

```text
event: meta
data: {"requestId":"...","locale":"es-MX","intent":"analysis","activeSymbol":"BTC","comparisonSymbols":[],"quota":{"remaining":49,"resetAt":178...}}

event: asset
data: {"role":"primary","symbol":"BTC","assetType":"crypto","market":{"price":64514,"change24hPct":1.6},"technicals":{"trend":"bullish","rsi14":66.4,"ema20":64264.4,"ema50":64246.7,"support":64047.5,"resistance":64521.1,"atrPct":0.17},"candles":[],"asOf":178...,"stale":false}

event: state
data: {"activeSymbol":"BTC","contextToken":"v1...."}

event: delta
data: {"text":"Bitcoin mantiene..."}

event: done
data: {"finishReason":"stop","degraded":[],"latency":{"marketMs":480,"firstTokenMs":1120,"totalMs":2780},"usage":{"inputTokens":640,"outputTokens":94}}
```

A comparison emits both `asset` events before prose. After SSE headers have
been sent, failures use an `error` event followed by `done`; they never switch
back to an HTTP JSON body. Client disconnect aborts the upstream model request.

## Language and answer rules

- The response is strictly locked to `locale`.
- The model explains server-provided technicals; it does not recompute or
  invent levels.
- A comparison names and cites both assets.
- `vibe` changes tone only, never facts.
- The first answer is at most 120 words, a follow-up 90 and a comparison 140.
- The prompt marks message history as untrusted user text.
- Copy frames output as reference analysis, never personalized advice or an
  executed transaction.

## Device identity and quotas

`X-Bobby-Device-Id` alone is not authentication.

1. iOS generates a random UUID and stores it in Keychain.
2. `POST /api/app-device`, limited by IP, returns a 30-day HMAC device token
   bound to the UUID hash.
3. `/api/app-chat` requires both values and compares tokens in constant time.
4. Logs retain only a peppered hash prefix; never UUIDs, tokens or messages.

Initial limits:

- 8 turns/minute/device and 20 turns/minute/IP.
- 50 turns/day/device and 150 turns/day/IP.
- 2,000 LLM turns/day globally.
- 3 device bootstraps/day/IP.

Device, IP and global counters must be consumed atomically in Supabase. The
existing read-modify-write `api_cache` limiter is not a hard spend ceiling. The
global LLM quota fails closed when its backend is unavailable. App Attest can
later harden bootstrap without changing the chat contract.

## Error contract

Before SSE starts:

- `400 validation_error`
- `400 asset_required`
- `401 device_token_missing`
- `401 device_token_invalid`
- `409 context_device_mismatch`
- `413 request_too_large`
- `429 quota_exceeded` with `Retry-After`
- `503 quota_backend_unavailable`
- `503 ai_unavailable`

After SSE starts:

```text
event: error
data: {"requestId":"...","code":"ai_timeout","message":"Bobby has the market data but could not finish the explanation.","retryable":true}
```

An intel failure is degradable. A market-data failure prevents Bobby from
asserting price or levels. An LLM failure after `asset` must not erase the chart.

## Observability

Reuse `recordLlmFailure` and `logHarnessEvent`. Emit
`app_chat_completed`, `app_chat_failed`, `app_chat_cancelled` and
`app_chat_quota_denied` with request id, device hash prefix, app version,
locale, vibe, intent, symbols, cache hits, degraded sources, latency, token
usage and finish reason. Do not create a conversation table or log content.

## Acceptance gates

1. BTC initial: `meta` and `asset(BTC)` precede the first `delta`; 72 ordered
   candles; technicals equal the shared indicator implementation; Spanish
   output for `es-MX`.
2. Follow-up: “Why bullish?” inherits BTC and reuses fresh technicals.
3. Comparison: “And versus ETH?” keeps BTC primary, fetches ETH in parallel,
   emits two assets and never asks for the ticker again.
4. Security: forged technicals, altered/cross-device tokens, forbidden roles
   and UUID rotation against one IP all fail as specified.
5. Streaming: split SSE chunks parse correctly; cancellation aborts OpenAI;
   post-header errors remain SSE; slow intel cannot block first paint.
6. Cost: device/IP/global counters are atomic and a dead quota backend cannot
   spend LLM budget.
7. Performance over a 20-turn smoke: chart p50 below 1.2 s, first token p50
   below 2 s, total p50 below 4 s and p95 below 8 s.

## Candidate files

- `api/app-chat.ts`, `api/app-device.ts`
- `api/_lib/app-chat-{schema,auth,context,sse}.ts`
- `api/_lib/market-context.ts`
- `api/voice-tool.ts` (shared-helper refactor only)
- `supabase/migrations/20260818_app_chat_quota.sql`
- `scripts/test-app-chat.mts`, `scripts/test-app-chat-live.mts`
- `.env.example`: `APP_CHAT_DEVICE_SECRET`, `APP_CHAT_STATE_SECRET`
- `ios/Bobby/Sources/{AppChatClient,DeviceIdentity}.swift`

