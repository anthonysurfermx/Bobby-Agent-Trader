# Landing copy — EN (v5 spine, two pages)
**Date:** 2026-08-22 · Derived from `core-message.md` v5. All product copy is English from here on.

---

## Why two pages

The old landing carried a section titled *"One protocol. Two ways in. For people. For agents."*
That headline was the page confessing it could not choose. Splitting is not a nice-to-have —
it is the fix for the exact failure we diagnosed.

| | **bobby (app)** | **Bobby Protocol** |
|---|---|---|
| Reader | Someone who already asks an AI about their assets | Developers, agent builders, integrators |
| Job of the page | Get onto the waitlist / TestFlight | Establish credibility, enable integration |
| Register | Direct, second person, product | Institutional, impersonal, standards document |
| Proof shown | The record, in plain numbers | The record + contracts + methodology + MCP |
| Owns v5's opening | **Yes** — v5 is anchored in "you already ask an AI" | No — opens on the rules |

**Naming:** the app is **Bobby**. The layer underneath is **Bobby Protocol**. The app is what
you use; the protocol is why you can trust it. Never use them interchangeably.

**The bridge, one direction only:** the app page ends with a single line pointing to the
protocol. The protocol page carries the app as one card, not a co-equal hero. Two CTAs of
equal weight on one screen is what broke the original page.

---

# PAGE 1 — bobby (the app)

## Hero
```
Eyebrow:  COMING SOON TO IPHONE
H1:       Asking an AI about your asset
          is no longer an edge.
Sub:      Everyone has that answer now, from the same models, in the same
          confident voice. Bobby gives you what comes after it: the answer gets
          challenged, and the call goes on the record before the market settles it.
CTA-1:    Get early access
CTA-2:    TestFlight soon
Foot:     Talk to it about BTC, NVDA or gold. It answers out loud.
```

## 01 — The two eras
```
Eyebrow:  01 / THE TWO ERAS
H2:       The first era was asking.
          The second is verifying.
Body:     Two years ago, a reasoned read on an asset in thirty seconds was a
          privilege. Today it's free, on any phone. Access to analysis stopped
          being scarce. What's scarce now is knowing whether the answer was any good.
```

| | **Asking** | **Verifying** |
|---|---|---|
| Who answers | A model | A procedure |
| When it's recorded | Never | Before the outcome |
| If it's wrong | Nothing happens | It stays on the record |
| What you get | An opinion | A verdict with an invalidation price |
| Can it be audited | No | Yes |

```
Note:     Bobby runs on the same models everyone else uses. The difference isn't
          the model — it's the procedure around it.
```

## 02 — What you actually get
```
Eyebrow:  02 / WHAT YOU GET

A voice, not a chatbot
Ask about BTC, NVDA or gold out loud. Bobby answers in the voice and vibe you gave it.

Every call goes on the record
Before you know how it turned out. The wins and the misses land in the same place.

It's allowed to say no
Most of the time the honest answer is "there's no trade here." Bobby will say it.
```

## 03 — How a call is made
```
Eyebrow:  03 / HOW A CALL IS MADE
H2:       Four stages.
          The order is the guarantee.

01 CASE          The idea is stated with its reasoning: what's expected, why, over what horizon.
02 REFUTATION    A second system works against it — the data that breaks it, the precedent
                 where it already failed, the scenario nobody considered.
03 RISK GATE     Fixed rules can veto the trade even when the analysis is favorable.
                 The veto isn't appealable.
04 VERDICT       What to do, the price at which the idea is invalidated, and the
                 condition that cancels it.
```

## 04 — The record
```
Eyebrow:  04 / THE RECORD
H2:       864 calls published before
          anyone knew the outcome.

Resolved              794
— Right               433
— Wrong               244
— No material move    117
Pending                70
Hit rate on resolved  54.5%

Note:     Hit rate is computed over the 794 resolved calls and counts flat outcomes
          in the denominator. Pending calls are not dropped from the count. Misses
          are published exactly like the wins.
CTA:      See the record
```

## 05 — What it doesn't do
```
Eyebrow:  05 / WHAT IT DOESN'T DO
H2:       Bobby never touches your money.

— It holds no funds and connects to no accounts.
— It places no orders. Execution is yours.
— It is not investment advice and promises no returns.
— A favorable verdict is not a buy recommendation. It's the record of an idea
  that survived its own refutation.
```

## Closing
```
Lockup:   Refuted before execution. Published before the outcome.
Bridge:   Every call Bobby makes is recorded by Bobby Protocol →
```

---

# PAGE 2 — Bobby Protocol (the layer)

Same spine, institutional register, no second person.

## Hero
```
Eyebrow:  BOBBY PROTOCOL · THE VERIFICATION LAYER FOR FINANCIAL INTELLIGENCE
H1:       No decision is approved
          without being refuted.
Sub:      Every idea follows a fixed procedure — case, refutation, risk gate and
          verdict — and the verdict is published before any outcome exists to
          justify it.
CTA-1:    Inspect a verdict
CTA-2:    Read the docs
Foot:     Refuted before execution. Published before the outcome.
```

## 01 — The two rules
```
I.   No idea is approved without an independent system working against it.
II.  No verdict is published after its outcome is known.
```

## 02 — The flaw it corrects
```
H2:       No model keeps score of
          how often it was right.

— It always answers. It rarely concludes there is no trade.
— It sounds equally certain when it's right and when it's wrong.
— It doesn't remember last week, and nobody writes it down.
— It's optimized to sound useful, not to be correct.

Close:    A judgment declared after the outcome is not a judgment. It's the same
          principle that requires a clinical trial's hypothesis to be registered
          before the experiment.
```

## 03 — Architecture
Keep the existing pipeline diagram (Signal → Alpha / Red Team → CIO → risk gate → record).
Retitle the section from *"One pipeline, end to end"* to the procedure language:
```
Eyebrow:  03 / THE PROCEDURE
H2:       Four checks before capital moves.
```

## 04 — Integration (agents only — this page owns it)
```
Eyebrow:  04 / INTEGRATION
H2:       Give any agent a second layer.
Body:     Connect over MCP. Request conviction, inspect proof, and build the
          verification step into an existing execution workflow.
```

## 05 — The record
Same table and the same methodology note as the app page. This page additionally links to
the contracts.

## 06 — Scope and limits
Same four lines as the app page, third person.

## App card (one card, not a hero)
```
Label:    THE APP
Title:    bobby, on iPhone
Body:     The same record, in a voice you can talk to.
CTA:      See the app →
```

---

## Numbers, one condition before publishing

The 864 / 794 / 433 / 244 / 117 figures are real (`/api/bobby-protocol-stats` →
`debateActivity`, 2026-08-22). They live in the database and in the **X Layer** contracts —
last on-chain activity 2026-04-14. The **Base** contracts are deployed and at **zero**
(`totalCommitments: 0`).

So either phrase it as *"864 calls on record — history on X Layer, migrating to Base"* and
link X Layer, or publish the figures without the words "on-chain" until Base carries its own
volume. Showing 864 calls next to a link to an empty contract is the exact practice the
protocol says it exists to end.

The session extract used as a format sample must come from a real debate before it ships —
`no-hardcode` rule.

---

## Register split (decided 2026-08-23)

The "more formal, more serious" note applies to **Bobby Protocol**, not to the app. That is the
whole reason for splitting. The app reader is Gen Z: color, motion, phones, its own vocabulary.

| | **Bobby (app)** | **Bobby Protocol** |
|---|---|---|
| Palette | Violet `#7c52ff` + Base blue `#2f6bff`, glows, gradient type | Blue only, no glow, hairline rules |
| Motion | Marquee, hover lifts, interactive aura orb | Static, one architecture video |
| Voice | Short, direct, second person — "Say the ticker out loud" | Impersonal, rule-shaped |
| Proof | Same numbers, same methodology note | Same numbers + contracts |

**What stays identical on both, non-negotiable:** the two-eras thesis, the four stages, the record
with its methodology note, and scope-and-limits. The spine does not change with the skin — only the
delivery does. Loosening the tone is never a licence to loosen the claims.

### Sections shipped on `/app`
Hero (phones + aura glow) → marquee → 01 The two eras → **02 Your aura** → 03 What you get →
04 How a call is made → 05 The record → 06 What it does not do → closing + bridge to `/protocol`.

**02 Your aura** is the section that carries the Gen Z register:
```
H2:    It looks like you, / not like a bank app.
Body:  Describe your agent in your own words and the orb absorbs the color live. Hold to
       forge, and the whole interface takes your energy. The verdicts stay serious — the
       skin is yours.
Chips: azul voltaje · violeta after midnight · verde hacker · dorado golden hour · rojo sin miedo
       (the iOS build's own preset names — clicking one recolors the section live)
```
That last clause — *the verdicts stay serious, the skin is yours* — is the line that lets the app be
playful without costing the protocol its credibility. Keep it.

**Open question:** the aura names are Spanish on an English page. Kept on purpose — they are the
app's real vocabulary and read as brand, not as an untranslated string. Translate only if the iOS
build renames them.

---

## Addendum 2026-09-03 — consumer one-liner (locked)

Use this wherever Bobby has to be explained in one sentence to a consumer (video, ads, social bio,
App Store subtitle). Source of truth: `core-message.md` §12.

```
ES:  ChatGPT te responde. Bobby comprueba el mercado antes de responder.
EN:  ChatGPT answers. Bobby checks the market first.
```

Rules: always name the market; say the order (Bobby answers too, after checking); no protocol
words on the consumer surface; write lines that flow like speech.
