# The agent engine

Bobby's first engine that takes an errand and does the work: it understands what was asked, asks before anything is spent, fetches evidence with tools, computes in code, answers briefly, and can be asked again about the same result. It was started in a sprint on 2026-10-10. It is **off by default** (`BOBBY_AGENT_ENGINE`), wired to no app, and not part of iPhone 1.8.

Code: `api/_lib/agent/`, door `api/agent-task.ts`, tests `scripts/test-agent-engine.mts` (`npm run test:agent-engine`), a terminal client `scripts/agent-dev.mts`.

## What it does today

| Errand | What happens | Uses |
|---|---|---|
| "¿Qué es un ETF?" | One model call answers directly; the companion's second reader reads it. Naming an asset starts no tool. | nothing of the allowance |
| "Compara Bitcoin y Ethereum" | `resolve_assets` (free), then the model asks for `compare_assets`. The task stops and shows the person the assets, the window and "uses 1 read". | nothing until the yes |
| the person says yes | The server runs exactly the approved call: daily bars from the same sources as `/api/asset-fact`, the harness's strict reader, arithmetic in code. The model writes sentences with `{{f:id}}`; code writes the numbers. | 1 read |
| "¿Y cuál cayó más?" | Answered from the figures of the result on the table. No tool, no fetch. | nothing |
| "¿Y cuál tiene más concentración?" | No tool gives that: Bobby says it cannot establish it here, and what it can. | nothing |
| close everything, come back | The stored result is returned. No model call, no read. The same `requestId` sent again is the same task. | nothing |
| cancel, or another account | Cancel is checked after every wait: a late result is recorded for its cost and shown to nobody. Another owner gets 404 for the task. | nothing |

## The parts

- **`types.ts`** the vocabulary: task, step, evidence, figure, analysis, presentation, approval scope.
- **`store.ts`** `AgentStore`, the whole contract with storage, and two implementations: memory (the tests; every method one critical section) and a JSON file (local development). `agent-engine.sql` in this folder is the same contract as database functions: a **draft, not a migration**.
- **`state.ts`** a task's state, events and usage, derived from its steps and nothing else.
- **`provider.ts`** one model call: reserve the worst case, dispatch, exactly one HTTP attempt, settle. Outcomes `ok`, `charged`, `no_charge`, `unknown`. An `unknown` keeps its reservation and blocks a blind second attempt for that task.
- **`tools.ts`** the registry (`resolve_assets`, `compare_assets`), the universe the engine can read with evidence (14 instruments), and the arithmetic.
- **`present.ts`** placeholders to numbers, the checks on a draft, and a code-written comparison in six languages for when the model's words cannot be shown.
- **`loop.ts`** the one agent: instructions, the resumable loop, approval, limits, the second reader, the client's view.

## Invariants, each with a test

1. A task is a list of steps written once; its state is derived from them.
2. `begin` is idempotent per owner and request id; the same id with another body is refused; owners never see each other's tasks.
3. One runner at a time (lease and fence); a stale runner writes nothing.
4. A metered tool never runs without the person's yes, and the yes is bound to owner, task, assets, window and consumption. What runs is what was approved; the model is not asked again.
5. The yes and the read are one fact. Said twice, one read. A read is given back only when the server knows no evidence came back.
6. Provider money: reserved before every call at the worst case; a cap is never exceeded by reserved + settled + unknown; thirty concurrent reservations against room for ten give ten.
7. A figure is computed only from a series the strict reader accepted. A refused series gives `error`, `missing` or `stale`, a null value and a named limitation. A price that did not move is a valid zero.
8. Percent is percent; a price carries its currency; instruments of different calendars are compared on the days both traded and say so.
9. The model types no market number: a digit outside a placeholder (other than the person's own numbers, names such as "S&P 500" and the tool's window lengths) refuses the draft; a stated ordering that contradicts the figures refuses it; twice refused, code tells the comparison.
10. Cancel is honoured after every wait; a result that arrives after it is never stored as an answer.
11. Text inside a source's reply is data: an unreadable series, nothing more.

## What it does not do, and what is missing

- **Durable storage in production.** Needs the functions of `agent-engine.sql` as a migration (the owner's decision) and a store that calls them. Until then the door answers 503 unless a development store is configured.
- **The product's own allowance and money caps.** The engine counts its own reads (6 a day in the development stores) and its own dollar ceiling. Wiring `api/_lib/access.ts` (guest, weekly, Pro) is the next step and decides what "a read" costs here.
- **Work that outlives a request.** A run stops between steps when it is out of time and the next request continues it. There is no worker or queue: a task advances only when its owner asks again.
- **More tools.** No holdings or concentration of a fund, no fees, fundamentals, news or calendar, no single-asset analysis through the three-agent desk. Each is a tool with its own evidence contract.
- **A second source.** `conflicting` is in the vocabulary and no tool can produce it yet: every instrument has one source.
- **Asset resolution** is an alias table over the 14 instruments, exact after folding. The product's resolver (`src/lib/okx-asset-search.ts`) is not wired: its universe is wider than what the engine can evidence.
- **Memory between sessions.** A follow-up reads the last completed task of the same session. Nothing is kept as a goal, and nothing here needs or uses the memory consent.
- **Number words.** A model that wrote "doce por ciento" in an analysis would pass the digit rule; only the second reader stands there.
- **Languages.** Mechanisms are tested in Spanish; the code-written fallback and the limitation sentences exist in six languages; real runs in the other five are not done.
- **No client.** Nothing in the apps calls the door.

## Reproduce

```bash
npm run test:agent-engine
```

```bash
vercel env run -e production -- npx tsx scripts/agent-dev.mts /tmp/agent.json ask ana s1 "Compara Bitcoin y Ethereum"
```

```bash
vercel env run -e production -- npx tsx scripts/agent-dev.mts /tmp/agent.json approve ana <taskId>
```
