# Companion contract v1

`POST /api/companion-turn`: a question that names no asset gets a short educational answer, with no ticker,
no verdict and no market read spent. Agreed between Claude (server) and Codex (phones and the shared page) on
2026-10-09. The server side is `api/companion-turn.ts` and `api/_lib/companion.ts`; `scripts/test-companion.mts`
checks every file here against the server's own schemas.

| File | What it is |
|---|---|
| `request.json` | What a client sends. `speech` is the dial's choice; `context` may be sent and is ignored in v0. |
| `response-explanation.json` | The reply v0 produces. |
| `response-desk-offer.json` | In the contract, **not produced by v0**: Bobby proposes to open the desk on an asset the code resolved; the person confirms before a read is spent. |
| `response-error.json` | A failure the client may retry. Nothing was counted. |
| `response-limit.json` | The day's allowance is used (HTTP 429, with `Retry-After`). |

Rules a client can rely on:

- The endpoint answers 404 to every method while the pilot is off. Treat 404 as "no companion": keep today's
  behaviour for a question with no asset.
- Every other reply is one of the three tagged shapes (`kind`), with `allowance`. Error codes:
  `invalid_request`, `question_too_long` (400), `orientation_limit` (429), `companion_paused`,
  `companion_unavailable` (503). `error.retryable` says whether trying again can help.
- `reply.followUp` is the next question the **person** could ask, in their voice, or null. Tapping it sends it
  as a new question. It is never a question Bobby asks the person: v0 keeps no conversation.
- `nextAction` is null in v0.
- When to call it: the asset search resolved nothing for the question, or it only offered a look-alike guess
  for a whole sentence (the web's rule: a fuzzy match that needs confirmation on a question of four words or
  more, as in "Tengo 1,000 pesos al mes…" → MENGO). A search that did not answer at all is not "no asset": keep
  today's message.
- A tapped `followUp` goes straight back to this endpoint, without the asset search: it is a learning question,
  and a word such as "bitcoin" in it must not open a market read the person did not ask for.
- A turn is counted only when it was answered. `allowance.remaining` is null when the server could not say.
- Send the same `Origin` and `x-bobby-device` headers as a desk read. No account is needed.
- The answer never states a market figure, a return or a product to choose; when a model's reply does, the
  server serves a fixed sentence instead (still `kind: "explanation"`).
