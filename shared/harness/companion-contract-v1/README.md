# Companion contract v1

`POST /api/companion-turn`: a question that names no asset gets a short educational answer, with no ticker,
no verdict and no market read spent. Agreed between Claude (server) and Codex (phones and the shared page) on
2026-10-09. The server side is `api/companion-turn.ts` and `api/_lib/companion.ts`; `scripts/test-companion.mts`
checks every file here against the server's own schemas.

| File | What it is |
|---|---|
| `request.json` | What a client sends. `speech` is the dial's choice. |
| `request-candidate.json` | The same, with the look-alike the asset search offered for the question (`candidate`). |
| `request-previous.json` | A question that only makes sense after the last one ("give me an example"), with that exchange (`previous`). |
| `response-explanation.json` | The reply to a question that names no asset. |
| `response-desk-offer.json` | The reply when the question was about the `candidate` after all: the client asks the person to confirm that asset, as it does today. Only ever sent to a request that carried a `candidate`. |
| `response-error.json` | A failure the client may retry. Nothing was counted. |
| `response-limit.json` | The day's allowance is used (HTTP 429, with `Retry-After`). |
| `questions.json` | Context v1: the questions Bobby may ask, their options and the `Skip` label, in the six languages. The same catalog as `api/_lib/companion-questions.ts`; ship it inside the app. |
| `request-context.json` | A question with what the person told Bobby (`context`). |
| `response-explanation-personalized.json` | The reply to it: the person's notes were used, and `checkIn` names the question Bobby would ask next. |
| `request-answer.json` | An answer, in the person's own words, to the question Bobby asked (`answer` instead of `question`). |
| `response-noted.json` | The reply to it: the note to keep on the device (`patch`) and the next `checkIn`. |
| `response-explanation-fact.json` | An explanation with a fact card (`fact`). Reserved: the server sends `fact: null` for now, and the card in this file is a placeholder, not a reviewed statement. |

Rules a client can rely on:

- The endpoint answers 404 to every method while the pilot is off, and 405 to a `GET` once it is on. Treat 404
  as "no companion": keep today's behaviour for a question with no asset. The web asks with a `GET` once per
  page load, so that no question is sent to a pilot that is off.
- Every other reply is one of the three tagged shapes (`kind`), with `allowance` (a fourth, `noted`, only ever
  answers a request that carried an `answer`: see context v1 below). Error codes:
  `invalid_request`, `question_too_long` (400), `orientation_limit` (429), `companion_paused`,
  `companion_unavailable` (503), and `notes_limit` (429) to an `answer` only. `error.retryable` says whether
  trying again can help.
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
- **A question that names an asset is not always a request to analyse it.** Send the asset the question names
  as `candidate` with `exact: true`. "What is Bitcoin?" is then answered as an `explanation` of what it is, in
  general terms and with no figure; "Analyze Bitcoin", "How is Nvidia doing today?" or the bare name come back
  as a `desk_offer`. Measured on 2026-10-10 in the six languages: 34 of 34 read right. The person never gets a
  market read they did not ask for, and never a choice to make before an explanation they did ask for. A client
  that knows the question is a read (its own chip, a bare ticker) need not ask.
- **`reply.gist`** (optional, at most 120 characters): the first sentence of `reply.text`, when that sentence
  can stand alone. It is always the exact start of `text`, cut by code after the second reader read the whole
  reply. A voice-first client shows it while Bobby says `text`, and the rest (`text` after the gist) when the
  person asks to read it all. When it is absent, show `text`.
- **`previous`** (optional): `{ question, reply }`, the one exchange still on the person's screen (at most 600
  and 700 characters). It lets "give me an example" refer to something. It is one exchange, never a history,
  and the server stores none of it. Send it only while that answer is on screen.
- `nextAction` is null in an `explanation`.
- A tapped `followUp` goes straight back to this endpoint, without the asset search: it is a learning question,
  and a word such as "bitcoin" in it must not open a market read the person did not ask for.
- `orientation_limit` (429) is the person's day used, or the day of their address or its network (a shared
  Wi-Fi, an office): `error.message` says which, so show it as it comes. `allowance` is always the person's own
  and can show turns remaining when it was the network's day that ran out.
- A turn is counted only when it was answered. `allowance.remaining` is null when the server could not say.
  The day is the UTC day; `Retry-After` on a 429 says how many seconds remain of it: say when in the person's
  own time ("back at 6 PM") instead of "tomorrow", which is wrong for most of the world's evenings. How many
  turns a day is the server's (ten on Haiku, five on a dearer model, or the number the owner sets): read it
  from `allowance`, never assume it.
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
- Every reply is read by a second small model before it is sent. The answer never states a market figure, a
  return, a promise or a product to choose, and never tells the person what kind of investor they are; when a
  model's reply does, the server serves a fixed sentence instead (still `kind: "explanation"`). A `followUp`
  that is not one plain question in the person's voice, or that asks what to buy, is sent as null. A reply the
  second reader could not check is never sent: the client gets `companion_unavailable`, retryable, and the
  turn is not counted. Expect about four seconds for a turn.

## Context v1: Bobby gets to know the person

Off unless the owner turns it on (`BOBBY_COMPANION_CONTEXT=on`). While it is off, everything above is the whole
contract: a `context` is accepted and ignored, an `answer` is not read, and none of the replies above has a new
key. Only the 405 changes: it says `context: false`.

How a client knows:

- The 405 a `GET` gets carries `"companion": { "context": true | false, "catalog": 1, "notices": ["memory-1"] }`
  in its JSON body. Show Bobby's questions only when `context` is true and `catalog` is the `version` of the
  `questions.json` the app ships. `notices` are the versions of the consent text the server accepts.

Rules for every client, on every platform:

- **The consent screen comes before the first question, and names the provider** (the models that read the
  notes are Anthropic's). Nothing is stored and no `context` is sent before the person accepts. Keep the notice
  version they accepted (`memory-1`) and send it as `consent.notice`.
- **The notes screen ships in the same release as the questions**: the person can see every note and where it
  came from, correct it, delete one or all, and read when it expires. Dates and expiry live on the device.
- **`Skip` on every question** (`questions.json`, `skip`). Skipping adds the question's id to `asked` and
  writes no note. Never more than one question on screen, and never one that covers Bobby's reply by itself:
  a question is an invitation under the reply, opened by the person. `asked` is the client's own list: a client
  may let a skipped question rest and offer it again later by leaving its id out, and a deleted or expired note
  makes its question askable again the same way.
- **Every question says what its answer is for** (`why`, one line under the question). The two money questions
  of day one say "that money"; their line also says which money is meant.
- **The six languages.** The question, its options and `Skip` come from the catalog in the person's language,
  word for word.
- Bobby is educational. No screen labels the person, says what suits them or ranks anything for them, and the
  notes screen shows what they said in the catalog's own words, never a profile.

The catalog (`questions.json`):

- Each question has `id`, `day` (the first return day it may be asked), `money` (it is about the person's own
  money), `source`, `text`, `why`, `options` (`id` and `label`) and `spoken`. Asked in the catalog's order.
  `why` was added without changing the catalog's version: a client that does not know it shows nothing there.
- **A tapped option needs no request at all.** The client writes the note itself:
  `{ "field": question.id, "value": option.id, "source": question.source }` (`said`, or `shown` for the
  exercise), and adds the id to `asked`. `spoken` lists values no button offers: only the server's reader
  returns them, for an answer said aloud or typed. `labels` has the words for each of them, and `unsure` at
  the top of the catalog the words for a question with no such button: show every note in the catalog's own
  words. Both were added without changing the catalog's version.

What a client sends (`request-context.json`):

- `context.version` is 1. `consent` is `{ notice, memory, money }`. `day` is the person's return day, from 1,
  counted by the client (a later day than 60 is read as 60). `asked` lists the ids already put to the person,
  answered or skipped; an id listed twice is one. `notes` holds at
  most 8, one per `field`: `field` is a question id, `value` one of that question's option ids, `spoken` values
  or `unsure`, and `source` is `said`, `confirmed`, `shown` or `inferred`.
- **Nothing else is accepted: no text, no dates, no identifiers.** An unknown key anywhere in `context`, a
  value that is not in the catalog or two notes of one field make the whole context another shape, and the
  server ignores all of it. That never fails the request: the reply is the plain one, with no `personalized`.
- The server reads a context only when `consent.memory` is true and `consent.notice` is one of `notices`. Notes
  of a `money` question are dropped unless `consent.money` is true, and Bobby does not ask those questions.
- No note, value, question id or word of an answer is kept by the server: not in a log, a usage row or an
  error. That a turn used a context, or that an answer was read, is counted as any turn is (a log line with
  no content, a usage row, a slot of the day).
- The picture reaches the model only while the second reader is on: it is what refuses a reply that labels
  the person. With it off the turn is the plain one, `personalized` is false and `checkIn` is still sent.

What comes back when the context was read (`response-explanation-personalized.json`). The three keys are sent
together on an `explanation`, and are absent from every other reply and whenever the context was not read:

- `personalized`: true when the person's notes shaped the answer. It is false when there was no note to use,
  and when the fixed sentence was served instead of the model's reply. Use it to say "uses your notes".
- `checkIn`: `{ "questionId": "…" }` or null. The ONE catalog question Bobby would ask next, chosen by code and
  never by a model: the first in the catalog's order whose `day` is not after `context.day`, that is not in
  `asked` and has no note, leaving out `money` questions without `consent.money`. Show its `text` and `options`
  from the catalog. `followUp` keeps its meaning (the PERSON's next question), and both may be present. How
  many questions to put in a day is the client's rule; when the key is absent, use the catalog's order.
- `fact`: null, or `{ "id", "text", "source", "year", "url" }`: one reviewed statement, put there by code. Show
  `text` exactly as it comes, with `source` and `year`, apart from Bobby's own words and never inside the
  spoken reply. Reserved: the server sends null until the cards exist (`response-explanation-fact.json` shows
  the shape with a placeholder).

A spoken or typed answer to Bobby's question (`request-answer.json`, `response-noted.json`):

- Send `answer: { "questionId", "text" }` INSTEAD of `question` (exactly one of the two), with the same
  `context`. `text` is at most 400 characters. It needs what reading a context needs, and an answer to a
  `money` question needs `consent.money`: without them the reply is `invalid_request`.
- The reply is `kind: "noted"`. `patch.notes` holds the note to keep (replace any note of that `field`) and
  `patch.asked` the id to add to `asked`. The value is one of that question's values or `unsure`; the server's
  small model can return nothing else, so whatever else the person said is neither kept nor returned.
  `source` is what a tap on that option would be (`said`, or `shown` for the exercise) when the reading was
  confident, and `inferred` when it was a guess: show an inferred note as one to confirm. An answer that fits nothing comes back as `unsure`, `inferred`.
- `checkIn` on a `noted` reply is the next question, counting the one just answered. `allowance` is the
  person's day of explanations as it was: noting an answer uses none of it. A person has 12 of these a day
  (`notes_limit`, HTTP 429 with `Retry-After`), and they count towards the address's, the network's and
  everyone's day.
- If an `answer` request fails for any reason, show the options, whatever the message says: a tap needs no
  server.
