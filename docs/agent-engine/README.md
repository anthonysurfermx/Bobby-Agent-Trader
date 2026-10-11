# The agent engine

Bobby's first engine that takes an errand and does the work: it understands what was asked, asks before anything is spent, fetches evidence with tools, computes in code, answers briefly, and can be asked again about the same result. It was started in a sprint on 2026-10-10. It is **off by default** (`BOBBY_AGENT_ENGINE`), wired to no app, and not part of iPhone 1.8.

Code: `api/_lib/agent/`, door `api/agent-task.ts`, tests `scripts/test-agent-engine.mts` (`npm run test:agent-engine`), a terminal client `scripts/agent-dev.mts`.

## What it does today

| Errand | What happens | Uses |
|---|---|---|
| "¿Qué es un ETF?" | One model call answers directly; the companion's second reader reads it. Naming an asset starts no tool. | nothing of the allowance |
| "Compara Bitcoin y Ethereum" | `resolve_assets` (free), then the model asks for `read_assets`. The task stops and shows the person the assets, the window and "uses 1 read". | nothing until the yes |
| the person says yes | The server runs exactly the approved call: daily bars from the same sources as `/api/asset-fact`, the harness's strict reader, arithmetic in code. The model writes sentences with `{{f:id}}`; code writes the numbers. | 1 read |
| "¿Y cuál cayó más?" | Answered from the figures of the result on the table. No tool, no fetch. | nothing |
| "¿Y cuál tiene más concentración?" | No tool gives that: Bobby says it cannot establish it here, and what it can. | nothing |
| close everything, come back | The stored result is returned. No model call, no read. The same `requestId` sent again is the same task. | nothing |
| cancel, or another account | Cancel is checked after every wait: a late result is recorded for its cost and shown to nobody. Another owner gets 404 for the task. | nothing |

## The parts

- **`types.ts`** the vocabulary: task, step, evidence, figure, analysis, presentation, approval scope.
- **`store.ts`** `AgentStore`, the whole contract with storage, and two implementations: memory (the tests; every method one critical section) and a JSON file (local development).
- **`store-pg.ts`** the same contract on Postgres: one database function per method (`agent-engine.sql` in this folder), so one transaction each. `scripts/test-agent-engine-pg.mts` applies that SQL to a **local scratch database** and checks the invariants with real concurrent transactions (twenty copies of a request, ten yeses against one read left, thirty reservations against room for ten, eight claims of one task) and one whole errand through the loop. The SQL is a **draft, not a migration**: nothing applies it anywhere shared.
- **`state.ts`** a task's state, events and usage, derived from its steps and nothing else.
- **`provider.ts`** one model call: reserve the worst case, dispatch, exactly one HTTP attempt, settle. Outcomes `ok`, `charged`, `no_charge`, `unknown`. An `unknown` keeps its reservation and blocks a blind second attempt for that task.
- **`tools.ts`** the registry (`resolve_assets`, `read_assets`), the universe the engine can read with evidence (14 instruments), and the arithmetic.
- **`present.ts`** placeholders to numbers, the checks on a draft, and a code-written comparison in six languages for when the model's words cannot be shown.
- **`loop.ts`** the one agent: instructions, the resumable loop, approval, limits, the second reader, the client's view.

## Invariants, each with a test

1. A task is a list of steps written once; its state is derived from them.
2. `begin` is idempotent per owner and request id; the same id with another body is refused; owners never see each other's tasks.
3. One runner at a time (lease and fence); a stale runner writes nothing.
4. A metered tool never runs without the person's yes, and the yes is bound to owner, task, assets, window and consumption. What runs is what was approved; the model is not asked again.
5. The yes and the read are one fact. Said twice, one read. A read is given back only in the same write as the fact that justifies it: a metered tool that brought no figure, or a cancel that ends the errand before any metered tool finished.
6. Provider money: reserved before every call at the worst case; a cap is never exceeded by reserved + settled + unknown; thirty concurrent reservations against room for ten give ten.
7. A figure is computed only from a series the strict reader accepted. A refused series gives `error`, `missing` or `stale`, a null value and a named limitation. A price that did not move is a valid zero.
8. Percent is percent; a price carries its currency; instruments of different calendars are compared on the days both traded and say so.
9. The model states no number of its own. What is read is its own words, folded (look-alike digits, accents, case). Code writes every figure (`{{f:id}}`), every date (`{{d:id}}`, `{{from:id}}`, `{{to:id}}`) and the window's length (`{{days}}`). Refused: anything glued to a placeholder, two placeholders that would join into one number, a window length that does not count days ("60 mil", "un 60"), a percentage of the model's own in digits or in words, an emoji, and any other number that is not part of a name ("S&P 500", "24/7") or a whole number the person wrote. The person's own percentage may be said back; a piece of their number, or a number inside a name they wrote, lends nothing. An ordering the model states must be listed as a claim; a claim that contradicts the figures, or that cannot be checked, refuses the draft. Twice refused, code tells the figures (two or three instruments, in six languages); an answer that needed no figures says only that it could not be given.
12. Everything of the model's that reaches a person is read by the second reader: the text, the limitations it wrote, the next question, and a text that calls itself a clarification. Only a text code wrote is not, and the task records which.
13. A read is never spent on nothing that could have been shown: when the answering call fails after the read, code tells the figures; when nothing came back with a value, or the errand is cancelled before the tool finished, the read goes back.
14. A cancel wins: once the store accepted it, nothing that would end or advance the errand is stored (an answer, an error, a request for approval, the start of metered work: `tool_started` is its own step so a cancel can beat it before any source is asked). A cancel a runner never completed is completed by the store, or by the next person who looks (GET).
15. The two stores answer alike. Every difference a differential review found between the memory store and the Postgres functions is a check that runs against both (`npm run test:agent-engine-pg`).
10. Cancel is honoured after every wait; a result that arrives after it is never stored as an answer.
11. Text inside a source's reply is data: an unreadable series, nothing more.

## What it does not do, and what is missing

- **Durable storage in production.** The store, its SQL and the transport that calls it exist: `BOBBY_AGENT_STORE=postgres` makes the door call the functions through PostgREST with the service role. The SQL passes on a local Postgres (51 checks, including that neither API role can call a function or read a table, whatever the defaults grant). What is missing is the owner's decision to make it a migration, and with it how long a person's question is kept. Until then those functions do not exist and the door answers 503.
- **The product's own allowance and money caps.** The engine counts its own reads (6 a day in the development stores) and its own dollar ceiling. Wiring `api/_lib/access.ts` (guest, weekly, Pro) is the next step and decides what "a read" costs here.
- **Work that outlives a request.** A run stops between steps when it is out of time and the next request continues it. There is no worker or queue: a task advances only when its owner asks again.
- **More tools.** No holdings or concentration of a fund, no fees, fundamentals, news or calendar, no single-asset analysis through the three-agent desk. Each is a tool with its own evidence contract.
- **A second source.** `conflicting` is in the vocabulary and no tool can produce it yet: every instrument has one source.
- **Asset resolution** is an alias table over the 14 instruments, exact after folding. The product's resolver (`src/lib/okx-asset-search.ts`) is not wired: its universe is wider than what the engine can evidence.
- **Memory between sessions.** A follow-up reads the last completed task of the same session. Nothing is kept as a goal, and nothing here needs or uses the memory consent.
- **Number words.** A percentage in words is refused by code; a bare number word ("doce puntos", "twice as much") in an analysis is not, nor is the person's own number said back with another meaning ("subió 1000 dólares"). The second reader's "figure" class cannot be used on an analysis because it also fires on evidenced numbers. An ordering the model states without listing it as a claim is not checked.
- **The door's guards.** The address bounds errands started and reads taken in a day. The companion's other guards (a per-minute line, a count per network, a shared day of turns) are not here.
- **A second run's time.** A call starts only if the run has time for it; nothing reconciles an attempt left `dispatched` by a function that was killed (the SQL draft names the job).
- **Languages.** Mechanisms are tested in Spanish; the code-written fallback and the limitation sentences exist in six languages; real runs in the other five are not done.
- **No client.** Nothing in the apps calls the door.

## Reproduce

```bash
npm run test:agent-engine
```

```bash
DATABASE_URL=postgres://postgres@127.0.0.1:54329/agent_engine_test npm run test:agent-engine-pg
```

```bash
vercel env run -e production -- npx tsx scripts/agent-dev.mts /tmp/agent.json ask ana s1 "Compara Bitcoin y Ethereum"
```

```bash
vercel env run -e production -- npx tsx scripts/agent-dev.mts /tmp/agent.json approve ana <taskId>
```
