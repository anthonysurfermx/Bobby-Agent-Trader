# Bobby App Product Red Team — Round 1

**Date:** 2026-08-18  
**Scope:** `feat/bobby-ios`, PR #33, and the production voice APIs  
**Method:** Kimi CLI 0.36.1 with `kimi-code/k3`, followed by independent Codex verification  
**Evidence boundary:** code and live API behavior; no iOS screenshots or videos were versioned

## Verdict

**GO for internal TestFlight only. NO-GO for external distribution or App Store
submission.**

The thesis under attack was: “Why should a user choose Bobby instead of asking
ChatGPT?” Today Bobby is a fast visual market lookup that speaks. It is not yet
the agent that proves its calls. General assistants still win on follow-ups,
context, catalysts, memory, and graceful failure.

The only structural moat is **F2: verifiable receipts**. F1 (fast visual output)
is table stakes; F3 (methodology) becomes defensible only when bound to F2; F4
(voice/personality) and F5 (proactivity) are copyable. The current iOS client
mentions proof, but does not let the user inspect a receipt or scorecard.

## Findings

| ID | Severity | Finding | Release condition |
|---|---|---|---|
| WS5-01 | P0 | The promised moat is not present in the product. Receipts, durable memory, and proactivity are absent from the current iOS UX. | A new user can see and open a receipt or scorecard in under 10 seconds; every tracked scenario has a visible state and verifiable deep link. |
| WS5-02 | P0 | The UI emits entry, stop, and target levels without persistent informational framing. It can be read as personalized investment advice. | Counsel-approved Mexico/App Store copy is visible in onboarding and on every scenario card; no personalized imperative language remains. |
| WS5-03 | P0 | IP-only quotas penalize carrier NAT, offices, and cafés, while remaining easy to evade by changing IP. The persistent limiter is read-modify-write and fail-open, so it is not a spend ceiling. | App Attest or equivalent device assurance, a signed device session, atomic device/IP quotas, and a global cost ceiling are live and tested. |
| WS5-04 | P0 | The sub-five-second experience is not guaranteed. Speech adds a fixed 1.6-second wait, asset resolution is serial, text waits for candles, and TTS waits for a complete audio file. | Instrument submit-to-price/chart/text/first-audio. Visual and text p50 are under 5 seconds and p95 under 8 seconds on Wi-Fi and 4G; provider failures show retryable states. |
| WS5-05 | P1 | HTTP status is not consistently validated. `try?` turns 429/5xx into an unknown asset or empty data, and an empty candle array can leave the chart in an indefinite loading state. | Typed error states, cancellation, timeout, retry, partial-data rendering, and status-code tests are present. |
| WS5-06 | P1 | Personalization is mostly cosmetic. `vibe` changes the greeting but is not sent to the backend. Before `42d31c8`, selected Edge voices were ignored whenever production preferred OpenAI. | Merge PR #33 with its routing regression tests; add paid-fallback telemetry and a budget circuit breaker before public launch. |
| WS5-07 | P1 | There is no real conversation. The debate request contains only a symbol; no message history, active context, or vibe reaches the server. | Implement the versioned `/api/app-chat` contract and pass the BTC -> “why?” -> “versus ETH?” acceptance path. |
| WS5-08 | P1 | “Proves its calls on-chain” is static text. The app has no TrackRecord stats or receipt client. | Make the receipt status and explorer link part of the primary result, not a settings or marketing surface. |
| WS5-09 | P1 | Speech privacy copy and implementation diverge. The code describes recognition as on-device, but does not require `requiresOnDeviceRecognition`; supported configurations may send audio to Apple for recognition. | Use an accurate permission disclosure and either require on-device recognition with a supported-device fallback or state the network-processing behavior. |
| WS5-10 | P2 | Spanish/English selection is not end-to-end: STT and TTS are hardcoded to Spanish variants. Permission denial can look like a dead microphone. | Locale reaches STT, chat, and TTS; denied/restricted permissions and offline mode have explicit UX. |

## Code evidence

- `ios/Bobby/Sources/ContentView.swift:51` starts the request pipeline, but waits
  for candles before publishing the answer. `ContentView.swift:145` renders the
  on-chain claim as static copy, and the empty-candle branch near line 195 also
  represents loading.
- `ios/Bobby/Sources/SpeechInput.swift:79` adds the fixed silence delay. The
  recognizer request does not set `requiresOnDeviceRecognition`.
- `ios/Bobby/Sources/NeuralVoice.swift:29` waits for the complete TTS response
  before playback.
- `ios/Bobby/Sources/BobbyAPI.swift:82` does not consistently validate HTTP
  status, and the `try?` calls near lines 127, 141, and 150 erase failure cause.
- `ios/Bobby/Sources/AgentProfile.swift:78` applies vibe to local greeting copy;
  the debate request in `BobbyAPI.swift` sends only the symbol.
- `api/bobby-voice-free.ts:20` permits 20 requests per 600 seconds per IP.
  `api/voice-tool.ts:176` permits 60 per minute per IP.
- `api/_lib/rate-limit-persistent.ts` uses a non-atomic read-modify-write flow
  and degrades open when persistence is unavailable.
- `ios/Bobby/project.yml` sets `CODE_SIGNING_ALLOWED: NO`; the branch is not yet
  an archive-ready TestFlight build.

## Required product copy

This is product-risk guidance, not a legal opinion. Final Spanish and App Store
metadata require review by qualified counsel.

### Onboarding

> Bobby analiza mercados con datos en vivo y muestra escenarios de referencia.
> No administra tu dinero, no ejecuta operaciones ni emite recomendaciones
> personalizadas. Tú decides y asumes el riesgo.

Button: **Entiendo y continuar**

### App Store description

> Asistente informativo de análisis de mercados. Muestra precios, gráficos y
> escenarios técnicos generales; no ofrece servicios de inversión, no custodia
> fondos y no permite operar.

### Scenario card

- Badge: **ESCENARIO TÉCNICO · REFERENCIA GENERAL**
- Footer: **Niveles calculados con datos de mercado; no consideran tu situación
  financiera.**
- Receipt: **Llamada registrada antes del resultado · verificar on-chain**

Allowed patterns:

- “El escenario técnico favorece un sesgo alcista.”
- “Nivel de referencia: $X.”
- “Si pierde $X, la tesis queda invalidada.”
- “Bobby no ejecuta; tú confirmas.”

Do not ship:

- “Compra NVDA ahora.”
- “Mete 20% de tu portafolio.”
- “Este trade es adecuado para ti.”
- “Ganancia segura” or “riesgo bajo.”
- “Te conviene entrar.”

## Abuse and cost model

The current TTS quota allows 120 requests/hour or 2,880 requests/day from one
IP if continuously saturated. An onboarding can generate roughly eight voice
previews, so three users behind the same NAT can exceed the 20-request window.
Conversely, an attacker can distribute requests over many IPs.

If Edge fails and paid OpenAI TTS becomes the fallback, the current API does not
have a global budget circuit breaker. OpenAI currently lists GPT-4o mini TTS at
$0.60 per million input text tokens and $12 per million output audio tokens.
The dollar scenarios in this review are sensitivities, not forecasts; production
telemetry must measure actual tokens, audio duration, fallback rate, and spend.

Recommended beta controls:

1. App Attest at device bootstrap, then a signed pseudonymous session token with
   timestamp and nonce checks.
2. Keep IP limits as a second layer, not as identity.
3. Suggested per-device limits: debate and TTS 30/hour and 100/day; realtime
   voice 3/hour and 10/day.
4. Set a $10/day beta ceiling for paid TTS with alerts at 50%, 80%, and 100%.
   At the ceiling, fail closed to Edge or device speech instead of paid fallback.
5. Pre-generate the onboarding voice samples as static cacheable assets.

## UX correction order

1. Resolve common aliases locally and render price immediately.
2. Publish market data and a quick brief as each arrives; draw the chart and
   synthesize voice progressively. Text must not wait for TTS or candles.
3. Replace fixed 1.6-second endpointing with measured 600-900 ms endpointing.
4. Add explicit partial, unavailable, retry, timeout, cancellation, and offline
   states.
5. Make the receipt visible and tappable in the first result.
6. Implement conversation, then catalysts and durable memory.

## Launch gates

Internal TestFlight can proceed after the build is signable and the voice-menu
fix is deployed. External distribution remains blocked until WS5-02, WS5-03,
WS5-04, and WS5-05 are closed with evidence.

Mainnet remains the release priority. After the current Base soak and ownership
handoff, the recommended order is:

1. Legal/error honesty and performance instrumentation.
2. Fast first paint.
3. Receipt card (the real moat).
4. App Attest, atomic quotas, and global cost budget.
5. Conversational app chat.
6. Premium/full-duplex voice.
7. Push and watchlists.

## Primary references

- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), especially financial-services and misleading-claims requirements.
- [CNBV: Asesores en inversiones](https://www.gob.mx/cnbv/acciones-y-programas/asesores-en-inversiones), including the Article 225 framing for habitual, professional, individualized recommendations.
- [Ley del Mercado de Valores](https://www.diputados.gob.mx/LeyesBiblio/pdf/LMV.pdf), Article 225.
- [Apple Speech recognition permission guidance](https://developer.apple.com/documentation/speech/asking-permission-to-use-speech-recognition).
- [Apple `requiresOnDeviceRecognition`](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/requiresondevicerecognition).
- [OpenAI GPT-4o mini TTS model and pricing](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts).
