# Agent engine · door contract v1 (draft)

`/api/agent-task`, off unless `BOBBY_AGENT_ENGINE=on`. No app uses it yet. The JSON files here are **real replies** of the engine on 2026-10-11 (`claude-sonnet-5-5`, OKX and Yahoo), kept as examples of the shape; the numbers in them are that day's.

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
