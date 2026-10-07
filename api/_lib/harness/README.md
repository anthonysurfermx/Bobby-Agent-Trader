# The harness: Bobby comes back to what you asked

The design agreed on 2026-10-07 between Claude (lead), Codex and DeepSeek, at the owner's request for
"the smartest follow-up mechanism on the market". This file is the contract the code in this folder,
the iOS harness (`ios/Bobby/Sources/V18/Harness/`) and the later Android and web ports follow.

## The problem

Most people ask Bobby one question and never come back. The harness registers that first question
and comes back to it: the asset the next day, its sector the day after, the person's week on Monday,
then silence. It learns from what the person does with each follow-up.

## What "smart" means here

Not a model that maximises taps. Three things, in this order:

1. **Restraint.** The first duty is to keep the notification permission. Frequency is a rule, never
   something a learner may raise: at most one a day, four in seven days, 18 hours apart; three in a
   row unanswered means two weeks of silence, whatever is asked; a kind whose last two went
   unanswered rests.
2. **Relevance.** A follow-up is about an asset the person asked about, and when the market did
   something notable to it, that fact takes the place of the scheduled message. It never adds one.
3. **Evidence.** What counts is a useful return (the person asks, saves or acts on the follow-up
   within a day), not an open. Whether the whole mechanism works is decided by a holdout, not by
   comparing people who opened with people who did not.

## Layers

| Layer | Where it runs | State | Status |
| --- | --- | --- | --- |
| 1. The chain | The phone | On-device ledger, 300 events, 60 days, no question text | Built (iOS 1.8) |
| 2a. Market facts | Server, shared by everyone | Public, per asset per completed day | This folder: pure code and tests; no endpoint yet |
| 2b. Remote delivery | Server, per consenting installation | Two tables, short-lived | Designed; needs a migration, a deploy and new privacy disclosures |
| 3. Measured learning | Server aggregates + phone | Broad per-kind counts, holdout cohorts | Designed; needs 2b |

Layer 1 is complete on its own: it works signed out, from the first question, and sends nothing
anywhere. Its limits are the reason for the others: a local notification is written a day ahead, so
it cannot carry the real number or react to the market; each phone learns alone.

## The algorithm (`policy.ts`)

Deterministic, with small Bayesian estimates. No bandit: with little traffic, randomising sends to
learn is waste that feels like spam, and a learner rewarded for taps optimises curiosity, not trust.

- Three kinds only: `asset`, `sector`, `week`. A market fact is a variant of `asset`, not a new arm.
- Useful response per accepted follow-up, per kind. Population prior `Beta(1, 9)` (an explicit weak
  assumption, not a measured rate); pooled mean `m[k]`; personal estimate with prior strength 10 and
  a 30-day half-life on the personal evidence only (the prior is never decayed):
  `p[k] = (10·m[k] + S[k]) / (10 + S[k] + F[k])`.
- Choice at a permitted slot between the chain's candidate and at most one new market fact:
  `score = (interest / max interest) × value × (0.5 + p[kind])`, value 2.0 market, 1.0 asset,
  0.7 sector, 0.6 week. Ties favour the chain, then the newest question. The constants are versioned
  product choices, not learned truth.
- The estimate may only **suppress** a kind (five mature personal observations and `p < 0.5·m`). It
  never extends the chain.
- Time: the hour of the question, inside 09:00–21:00; after three useful visits on distinct days,
  the modal window (09–12, 12–17, 17–21) and the median hour inside it.
- Cold start with one question: that asset, the next day, at that hour. No history is needed.

## Market facts (`bars.ts`, `facts.ts`)

Two facts about a completed day, computed once per asset and shared by everyone:

1. **A larger close-to-close change than usual:** `|C_t − C_{t−1}| ≥ 1.5 × ATR20` (the 20 bars
   strictly before the day) and at least 1% (equities) or 2% (crypto).
2. **A close outside the previous 20-day range:** above the highest high or below the lowest low by
   more than `0.1 × ATR20`, reported only on the day it enters that state.

Everything fails closed: an incomplete bar, a gap, stale data, impossible OHLC, a visible corporate
action or an extreme move means there is no fact, never a guess. Wording is an absolute dated
statement ("NVDA: +3.2% at the Oct 7 close"), never "now" or "today", never an instruction.

Rejected for now: earnings dates (no licensed calendar), levels parsed from a read's text (an LLM's
prose is not a trigger specification), one-year highs and volatility percentiles (more history than
the routes supply, and weakly tied to yesterday's question).

## Remote delivery (2b), when the owner authorises it

- One owner of automatic follow-ups per phone: `local` or `remote(epoch)`. Transfer is prepare
  remote → cancel and verify local → persist → activate. A lost acknowledgment means silence, never
  two senders. No automatic fall-back to local because the server is down.
- Storage: the existing push-device registry extended to guests, plus two tables,
  `bobby_harness_state` (per installation: consent receipts, time zone, at most three asset anchors,
  kind evidence, chain progress, quiet-until) and `bobby_followups` (the outbox and the outcome log,
  with the evidence each message quoted). Identifiable rows live 14 days. No question text, ever.
- One worker, in the existing five-minute cron: expire and settle → claim due → refresh facts once
  per asset → plan and reserve → send and record. No LLM call decides or writes a follow-up.
- The default remote notification stays generic; the symbol and the number on the lock screen are a
  separate opt-in.
- Off, erase and the risk notice withdraw everything; a global flag stops reservation and sending.

## Measurement (3)

Three numbers, over matured cohorts: additional useful returns per 100 against the holdout;
follow-ups turned off or permission lost per 100, against the holdout; accepted pushes per useful
recipient. First experiment: a fixed 50/50 holdout by installation, eight weeks plus seven days.
Roughly 500 people per arm are needed to tell 10% from 16%; fewer is a feasibility result with wide
intervals, and is reported as such.

## Build order

| Step | Ships | Needs from the owner |
| --- | --- | --- |
| 1 | Layer 1 with honest consent scope and real answers only (done, iOS 1.8) | Nothing |
| 2 | Market facts on the glass: the returning line quotes the dated fact (public endpoint, no personal data) | A deploy |
| 3 | Remote delivery with dated numbers | Migration, deploy, privacy and store disclosures, a canary |
| 4 | Pooled estimates, holdout, the three dashboard numbers | Approval of the experiment and its harm margin |

Android and web follow the same pure code through `shared/harness/golden.json`: a Kotlin and a Swift
port must reproduce every case in it.
