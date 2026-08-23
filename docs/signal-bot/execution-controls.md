# Signal Bot — Execution Controls (spec v0)

**Status:** `v0 — DESIGN ONLY`. Not wired to production. No pricing, no marketing,
no live subscribers. This document freezes the control surface we must build and
test **in OKX Demo Trading** before any signal is published (even a free one).

**Scope:** the emitter side (Bobby → OKX Signal Bot webhook). OKX Signal Bot
supports **perpetual swaps only**. A published signal **cannot be deleted** and
its **fee model/amount cannot be changed** after publishing — so the first
publication is a **free/closed beta**, never the definitive product.

**Prerequisite (unchanged):** Sepolia broadcast + soak land first. This spec is
design work that runs in parallel and blocks nothing.

---

## 0. The enforce-vs-recommend boundary (read first)

Controls split into two classes. Being honest about this is part of the product.

- **Enforced (our side):** everything the emitter does before/around the webhook
  POST — instrument mapping, dedup, staleness, size gating, mandatory stop,
  reconciliation on our reference account, kill switch. We control these.
- **Recommended only (subscriber side):** the subscriber configures their **own**
  Signal Bot — leverage, margin, final order size, and whether the bot keeps
  running. We **cannot** read or touch their positions. We can design signals so
  they don't depend on a fragile leverage, and we can **stop emitting**, but we
  cannot close or halt a subscriber's existing bot/position.

---

## 1. Instrument format mapping (CORRECTION #1)

The OKX **API** instrument id (`BTC-USDT-SWAP`) is **not** assumed to be the same
string the **Signal Bot webhook** expects (it may be e.g. `BTCUSDT.P`). The exact
webhook format is **TO BE CONFIRMED against the real AlertMsg 2.0 spec during the
PoC** — do not hardcode either shape.

Requirement: an **explicit mapping function**, single source of truth, with unit
tests. No inline string manipulation at call sites.

```
toWebhookInstrument(apiInstId: string): string   // "BTC-USDT-SWAP" -> webhook form
fromWebhookInstrument(webhookSym: string): string // inverse, for reconciliation
```

- Backed by an explicit allow-list table `{BTC, ETH, SOL}` → both forms.
- Any instrument not in the table ⇒ **do not emit** + alert (see Control #1).
- **Tests (mandatory):** round-trip for each of the 3 pairs; malformed input
  rejected; unknown symbol rejected; the webhook form is verified against a real
  OKX AlertMsg payload captured in Demo before this table is trusted.

---

## 2. Deduplication key (CORRECTION #4)

Dedup must suppress **redelivery/retries**, not legitimate distinct events. A key
built from bar/timestamp alone can wrongly drop a valid **exit, reversal, or
reentry**. Use:

```
dedupKey = strategyVersion + signalId + instrument + action + eventTimestamp
```

| Field | Meaning | Why it's in the key |
|---|---|---|
| `strategyVersion` | Version of Bobby's strategy that produced the signal | A strategy upgrade must not collide with old ids |
| `signalId` | Unique id per Bobby decision (threadId or generated) | Base identity of the decision |
| `instrument` | Mapped instrument | Same decision on different pairs is distinct |
| `action` | `open_long` / `open_short` / `close` / `reverse` / `reduce` | An exit ≠ the entry that preceded it |
| `eventTimestamp` | Decision timestamp (bar-close time) | A later reentry is a new event |

- Store processed keys with a TTL window; within TTL a repeat key ⇒ discard + log.
- Distinct `action` or `eventTimestamp` ⇒ **not** a duplicate → passes through.

---

## 3. Control matrix (v0)

| # | Control | Failure prevented | Trigger | Action | Side |
|---|---|---|---|---|---|
| 1 | **Perp-only + instrument mapping** | Signal rejected/dropped by OKX | Building payload | Map via §1; not in allow-list ⇒ don't emit + alert | Enforced |
| 2 | **Deduplication** | Double entry from webhook/cron retry | Repeat `dedupKey` within TTL (§2) | Discard + log | Enforced |
| 3 | **maxLag / staleness** | Executing a stale signal after delay | `now − eventTimestamp > maxLag` | Discard + log | Enforced |
| 4 | **Size guard (min/max)** | OKX min-size rejection / overexposure | `size < minSz` **or** `size > maxCap` | **Discard + alert** (no auto-trim in v0) | Enforced |
| 5 | **Max leverage** | Leverage that liquidates the account | Subscriber bot leverage > documented ceiling | Signals reasoned in % risk, not leverage-bound size; ceiling **documented** | Recommended (subscriber) |
| 6 | **Mandatory stop** | Naked entry with no invalidation | Signal has no `stop_px` | Fail-closed: don't emit entry | Enforced (risk gate) |
| 7 | **Halt of new signals (adverse event)** | Emitting into a broken/adverse state | Reconciliation on our reference acct detects adverse event; or manual | **Stop emitting new signals** (global or per-instrument). Existing subscriber bots/positions **may keep running per OKX** — we can't stop them | Enforced (emit side only) |
| 8 | **Event reconciliation** | Divergence Bobby-believes vs OKX-real (partial fills, rejects) | Loop compares emitted state vs our reference `positions`/`fills` | On divergence ⇒ pause + alert | Enforced |
| 9 | **Global kill switch** | Cascading failure | Manual flag/env, or auto (N consecutive rejects, drawdown breach, reconciliation broken) | Stop all emission to webhook | Enforced |

### Control #4 — no auto-trim in v0 (CORRECTION #2)

Auto-trimming an over-max order changes the risk profile and can create an
unintended partial entry. **v0 behavior: `minSz` or `maxCap` breached ⇒ discard +
alert.** Size **recalculation** is a later version, gated behind its own tests.

### Control #7 — liquidation reality (CORRECTION #3)

The emitter **cannot detect each subscriber's individual liquidation** — we have
no access to their accounts. On OKX a liquidated position does **not** auto-stop
that subscriber's strategy, and **we cannot stop it for them**. What we can do:

- Detect adverse conditions on **our own reference/Demo account** (our liquidation,
  reconciliation failure, market halt).
- **Halt emission of new signals** — globally or per instrument.
- **Not** claim an instrument-level kill affects all subscriber accounts.

Wording to keep in the product copy: *"halt of new signals; existing positions/bots
may remain active per OKX."*

---

## 4. Initial thresholds (proposed, validate in Demo)

All tunable; these are starting points, not commitments.

| Param | Proposed v0 | Note |
|---|---|---|
| `maxLag` | 90 s | Delivery latency budget, not signal cadence. Tune from real webhook latency |
| `minSz` | per-instrument from OKX `lotSz`/`minSz` | Fetched, not hardcoded |
| `maxCap` | per-instrument notional cap | Config, conservative for beta |
| kill-switch: consecutive rejects | 3 | Auto-trip |
| kill-switch: drawdown | daily equity breach on reference acct | Threshold TBD |
| dedup TTL | ≥ longest expected redelivery window | Cover retry horizon |

---

## 5. What this spec is NOT

- Not wired to production. No cron, no live webhook, no env changes.
- No pricing and no fee model chosen (irreversible once published — stay free/beta).
- No Copy Trading (explicit phase 2, after demonstrated consistency).
- No legal green light. Charging for signals that execute **futures** may be
  regulated activity/advice depending on jurisdiction, structure and marketing —
  **review with a Mexican lawyer before any charge**. This is a gate, not a
  disclaimer.

---

## 6. Next step (after Sepolia soak)

Convert **each control into a Demo Trading test**. Priority order:

1. **Real payload** — capture a live AlertMsg 2.0 from Demo; confirm the true
   webhook instrument format; lock the §1 mapping table against it.
2. **Stops** — every entry carries a stop; naked entry is rejected (#6).
3. **Partial fills** — reconciliation detects and pauses (#8).
4. **Duplicates** — same `dedupKey` fires once (#2).
5. **Reversals / reentries** — distinct `action`/`eventTimestamp` pass through,
   proving dedup doesn't eat legitimate events (#2).
6. **Post-liquidation behavior** — observe what OKX actually does to a running
   bot after liquidation on the reference account; confirm emit-side halt (#7).

Only after these pass cleanly, on Demo, do we consider a free/closed beta.
