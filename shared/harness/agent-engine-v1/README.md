# Agent engine · door contract v1 (draft)

`/api/agent-task`, off unless `BOBBY_AGENT_ENGINE=on`. No app uses it yet. The JSON files here are **real replies** of the engine on 2026-10-11 (`claude-sonnet-5-5`, OKX and Yahoo), kept as examples of the shape; the numbers in them are that day's.

They were recorded at `658c9e46`. Since the independent evaluation of 2026-10-11 the day-to-day figure is `move_*` (the average size of the daily changes) and no longer `volatility_*` (a standard deviation), and a coin read beside a stock is measured on its own days: the shape is the same, those ids and values are not. They are recorded again when the fix round has been measured.

## Requests

| File | What it does |
|---|---|
| `request-ask.json` | Starts an errand. One `requestId` (UUID) per errand: the same id with the same words returns the same task, finished or not; the same id with other words is refused (409 `request_id_reused`). |
| `request-follow-up.json` | The same, with `follow: true`: the errand is about the answer still on screen (the last finished task of this `sessionId`). |
| `request-approve.json` | The person's yes to exactly what the task showed: its `taskId` and the `digest` of `approval`. Another scope is refused (409 `approval_mismatch`). |
| `{ "op": "deny" \| "cancel", "taskId" }` | A no ends the errand. A cancel wins over a result that crosses it. |
| `GET ?id=<taskId>` | The task as it is now. Coming back never calls a model and never uses a read. |

Send `Origin` and `x-bobby-device` as for the companion. The server derives whose task it is; a body cannot name an owner, a model, a plan or a limit.

## Replies

Every reply is the task's view:

- `state`: `created`, `running`, `waiting_approval`, `completed`, `failed`, `cancel_requested`, `cancelled`.
- `events`: the real work so far, in order (`received`, `tool_started`/`tool_finished` with the tool's name, `approval_pending`, `clarification_needed`, `answer`, `error`). No thoughts, no percentages.
- `approval` (while waiting): `action`, `assets`, `windowDays`, `consumption.reads` and the `digest` to send back. **Show it before anything is spent.**
- `result` (when completed): `kind` (`explanation`, `analysis`, `clarification`, `unavailable`), `gist` (the sentence in front; always the exact start of `text`), `text`, `figures` (ids used), `references` (source, instrument, reference date, quality), `limitations`, `next` (one question the person could ask, or null: null means show nothing), `composedByCode` (true when code wrote the text because the model's could not be shown), and for an analysis `analysis` with every figure and its evidence.
- `error` (when failed): `code` and `retryable`. A failed task is final: `retryable` says a **new** request can help.
- `allowance`: `{ kind: "reads", remaining }`. Never tell the person what a failure cost: show this.

| File | Case |
|---|---|
| `response-explanation.json` | "¿Qué es un ETF?": answered directly, nothing spent. |
| `response-waiting-approval.json` | "Compara Bitcoin y Ethereum": stops and shows what it would read and use. |
| `response-analysis.json` | After the yes: figures written by code, evidence, limits. |
| `response-follow-up.json` | "¿Y cuál cayó más?": from the same figures, no read. |
| `response-cannot-establish.json` | "¿Y cuál tiene más concentración?": what cannot be established here, said. |
| `response-single-instrument.json` | "¿Cómo le fue a Nvidia…?": one instrument, 60 days. |

Errors of the door itself: 404 (off, or a task that is not this owner's), 400 `invalid_request`, 409 (`request_id_reused`, `approval_mismatch`, `not_waiting`, `not_possible`), 429 (`reads_limit`, `too_many_errands`), 503 (`engine_storage_unavailable`, `engine_unavailable`).

## Since 2026-10-13 (the example files predate this; re-record them before a client is written against them)

- **`resume`** (boolean, on every view): true when the errand is neither over nor being run by anyone. It goes on only when the same request is sent again (the ask with its `requestId`, or the same approve). A `GET` never moves an errand, so a client that only looks would wait for ever.
- **`error.message`**: one plain sentence in the person's language for every errand that ends without an answer. The door's own refusals that a person can meet carry `error.message` too: 400 `empty_question` (nothing was said), 400 `question_too_long` (over 1,200 characters), 429 `too_many_errands`, 429 `reads_limit`, 503 `engine_unavailable`, 503 `engine_storage_unavailable`. The others (`invalid_request`, `not_found`, the 409s) are the app's to handle and carry a code only.
- **`error.retryable`** is now also true for `budget_work_unresolved`, `budget_task_cap` and `budget_budget_exhausted`: a new request can help once the work in flight is back or the day turns.
- A **deny** or a **cancel** sent twice answers the same view the second time (200), and a deny that arrives after a yes whose read has not run yet cancels the errand and gives the read back.
- **`result.next`** may be code's own chip: when more was asked than is said aloud (six figures at most), the text says what else was read and `next` is the question that asks for it. That follow-up costs nothing.
- **A follow-up has an age.** `follow: true` hands on the figures of the last answer only while they are less than a day old. After that the errand is told what was read and when, has none of the figures, and must read again (a new card).
- **The figures.** Every figure of an instrument now counts the same days: the change over the window is the last close over the close right before the window (its first day counts, as it does for the worst day, the best day and the average move), and the largest fall may start at that close. `days` is the same on all of them. A correlation is given to the model with what its size means, and code's own words say it too.
- A word the person's own words leave open (`coin`, a lone `sol`, `meta`, `apple`) gets no card: the read is refused as `ambiguous_name` and the answer is a question that names both readings.

