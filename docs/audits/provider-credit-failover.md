# Analysis provider credit failover

## Diagnosis
Two production /api/desk-debate calls on 2026-09-30 at 20:59:35 and 21:00:40 UTC returned 503 on deployment dpl_2JbwENEfzeZg8tHumySaNXqHr99Z. The private cost ledger contains only alpha, OpenAI gpt-6-luna, http_429, zero input/output tokens, latencies 1969/1084 ms. BTC candles were 200, 100 bars, current. No questions or account identifiers were read. Provider error subtype was not previously preserved, so old 429 records alone do not distinguish rate limiting from exhausted credit. Owner independently states OpenAI credit is exhausted and explicitly requires bidirectional failover.

## Correction
- Known provider diagnostic codes retained without prompt-bearing messages. Anthropic's 400 credit-balance error maps to insufficient_quota.
- Exhausted credit is not retried against the same provider. HTTP 429 or billing exhaustion switches the same role once to the other configured provider.
- Later roles in the same debate avoid the limited provider. No loop if both providers fail.
- Quick/Deep fallback to Anthropic Sonnet; Max fallback uses OpenAI gpt-6-sol high. Same evidence, schema, output validation, usage accounting and Bobby spend/meter limits apply.
- Missing primary key can use an available alternate. No keys refuses before spending.
- Malformed/unsafe responses never trigger failover. Legacy Quick model-access fallback remains.
- Shipped build-50 failure contract retained; localized provider-specific failure message and safe diagnostic log added.
- Support/privacy text discloses bidirectional analysis fallback.

## Verification
116 desk-level checks passed, including both directions, exhausted-provider avoidance, both-provider refusal, refunds, privacy-safe diagnostics and no extra model loop. 51 App Review regression checks passed. All transport mocked, zero paid provider probes. Production build succeeded. Source commit 23aaef0. Production deployment was rejected by automatic approval review because it required explicit deployment authorization; pending owner response.

## Limits
No new real AI question generated during this correction. Final physical read remains pending. Existing successful Anthropic ledger entries establish historical access, not current credits. Persona TTS still requires OpenAI and intentionally cannot silently change to Apple/Edge. Analysis failover does not restore OpenAI TTS credit; speech must be addressed separately with a real voice-preserving provider configuration. No final App Review submission or release performed.
