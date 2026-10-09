# Companion contract v1

`POST /api/companion-turn`: a question that names no asset gets a short educational answer, with no ticker,
no verdict and no market read spent. Agreed between Claude (server) and Codex (phones and the shared page) on
2026-10-09. The server side is `api/companion-turn.ts` and `api/_lib/companion.ts`; `scripts/test-companion.mts`
checks every file here against the server's own schemas.

| File | What it is |
|---|---|
| `request.json` | What a client sends. `speech` is the dial's choice; `context` may be sent and is ignored in v0. |
| `request-candidate.json` | The same, with the look-alike the asset search offered for the question (`candidate`). |
| `response-explanation.json` | The reply to a question that names no asset. |
| `response-desk-offer.json` | The reply when the question was about the `candidate` after all: the client asks the person to confirm that asset, as it does today. Only ever sent to a request that carried a `candidate`. |
| `response-error.json` | A failure the client may retry. Nothing was counted. |
| `response-limit.json` | The day's allowance is used (HTTP 429, with `Retry-After`). |

Rules a client can rely on:

- The endpoint answers 404 to every method while the pilot is off, and 405 to a `GET` once it is on. Treat 404
  as "no companion": keep today's behaviour for a question with no asset. The web asks with a `GET` once per
  page load, so that no question is sent to a pilot that is off.
- Every other reply is one of the three tagged shapes (`kind`), with `allowance`. Error codes:
  `invalid_request`, `question_too_long` (400), `orientation_limit` (429), `companion_paused`,
  `companion_unavailable` (503). `error.retryable` says whether trying again can help.
- `reply.followUp` is the next question the **person** could ask, in their voice, or null. Tapping it sends it
  as a new question. It is never a question Bobby asks the person: v0 keeps no conversation.
- When to call it: the asset search resolved nothing for the question, or it only offered a look-alike guess
  for a whole sentence (the web's rule: a fuzzy match that needs confirmation on a question of four words or
  more). A search that did not answer at all is not "no asset": keep today's message.
- A look-alike guess is sometimes a coincidence ("Tengo 1,000 pesos al mes…" → MENGO) and sometimes the asset
  the person meant ("qué opinas de ethereun hoy" → ETH), and no rule on the letters tells them apart. Send the
  guess as `candidate` (`symbol`, and `name` when you have it). The reply is then an `explanation`, or a
  `desk_offer` whose `nextAction.symbol` is the candidate you sent: show your own "did you mean…?"
  confirmation for it. Never open the desk or spend a read without the person's confirmation
  (`requiresConfirmation` is always true). A `desk_offer` does not use the person's allowance.
- If the day's explanations are used up (`orientation_limit`) and you hold a look-alike, show your
  confirmation for it rather than the limit: the person may have asked about that asset.
- `nextAction` is null in an `explanation`.
- A tapped `followUp` goes straight back to this endpoint, without the asset search: it is a learning question,
  and a word such as "bitcoin" in it must not open a market read the person did not ask for.
- A turn is counted only when it was answered. `allowance.remaining` is null when the server could not say.
  The day is the UTC day; `Retry-After` on a 429 says how many seconds remain of it.
- `companion_unavailable` with `retryable: true` also covers storage that could not answer and two turns of
  the same person sent at once. Offer "try again" with the same question; for a tapped `followUp`, try again
  straight to this endpoint.
- Send the same `Origin` and `x-bobby-device` headers as a desk read. No account is needed.
- **Six languages, on every platform.** Send `language` (`en`, `es`, `fr`, `pt`, `it`, `de`) and `locale`. Every
  text the server returns is in that language and addresses the person informally, as the app does (tú, tu,
  você in Brazil, du): the reply, the `followUp`, `error.message` and the sentence of a `desk_offer`. Show
  `error.message` as it comes. Whatever a client adds around this stage itself (a "try again" button, its
  "did you mean…?" confirmation) must exist in the six languages too; the web's are in
  `src/lib/companions/web-translations-extra.json`. The rules that decide what a reply may say are written and
  tested per language (`api/_lib/companion-review.ts`).
- The answer never states a market figure, a return, a promise or a product to choose; when a model's reply
  does, the server serves a fixed sentence instead (still `kind: "explanation"`). A `followUp` that is not one
  plain question in the person's voice, or that asks what to buy, is sent as null.
