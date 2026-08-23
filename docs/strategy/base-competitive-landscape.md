# Base Competitive Landscape — Bobby Positioning (v0)

**Status:** strategic analysis, 2026-08-12. Source: Codex research, spot-checked
by direct fetch of each project's site (verification column below). This informs
**positioning/messaging**, not the roadmap — the technical sequence (Sepolia soak
→ TrackRecord v2 → execution controls → then any marketplace/copy layer) is
unchanged and this scan *reinforces* it.

---

## 1. Verified comparables

| Project | What it is (verified) | Custody | Track record | Real gap vs Bobby | Verified |
|---|---|---|---|---|---|
| **HyperClaw** | Perps liquidity layer on Base for autonomous agents. Leaderboard, "capital follows performance", open REST API (Ed25519), 50+ pairs incl. stocks/forex, up to 100x | **Non-custodial** — collateral held by smart contract | Leaderboard from on-chain settled trades ⇒ effectively **verified outcomes** | No proof of *process*: no reasoning trail, no adversarial review, no published rejections | ✅ fetched |
| **CIDER** | AI bot marketplace + treasury on Base ("Orchard"): fund/copy strategies, 10% performance fee + 1% platform fee, REST API + TradingView webhooks | Platform/treasury model | **Unspecified** — site does not state on-chain verification | Token-gated (funding requires staking **100k CIDER**) ⇒ tokenomics-first, different audience; unverified performance | ✅ fetched |
| **Umax** | Natural-language agent builder, swaps on Base via 0x, beta, $10 min | **Custodial** EOAs (Umax holds keys; user can sweep) | None mentioned | Custody + no verification + no reasoning | ✅ fetched |
| **BaseAgent** | Per Codex: on-chain intelligence + policy execution, generalist copilot | — | — | — | ⚠️ not verified |
| **APEX Runner** | Per Codex: multi-exchange bots w/ signals, regime, ops controls, SaaS pricing | — | — | — | ❌ **not found** — web search returns no product under this name. Needs URL from Codex or drops out of the analysis |

## 2. Corrections to the original research

1. **HyperClaw is a *stronger* comparable than framed.** Non-custodial with
   on-chain settlement means its leaderboard already constitutes verified
   *outcome* proof. Therefore "on-chain track record" alone is **not** Bobby's
   differentiator against them. The differentiation narrows to **proof of
   process**: the debate trail, the Red Team attempting to invalidate, the risk
   gate that can veto, published rejections, and the verified/attested
   separation (D-1) with entry+exit price-bound PnL (TrackRecord v2).
2. **CIDER validates demand, not the model.** A 100k-token staking gate makes it
   a token project first. Its existence proves appetite for bot
   marketplaces/copy on Base; it does not prove a SaaS-style product works there.
3. **APEX Runner is unconfirmed.** Until a URL is produced, no conclusion should
   rest on it (it was cited as "the strongest SaaS comparable" — that claim is
   currently unsupported).
4. **Beware the convenient-gap pattern.** In the original table every competitor
   lacked exactly Bobby's feature. Verification confirmed the gaps for
   Umax/CIDER but *narrowed* HyperClaw's. Competitive tables must be re-checked
   against what competitors *could ship in a sprint*, not what their landing
   page emphasizes today.

## 3. Moat analysis — copyable vs structural

**Copyable in a sprint (not a moat):**
- LLM-generated "reasoning" text attached to trades ("debate theater").
- An "explainability" tab. Any competitor can market this next week.

**Structurally hard to copy (the actual moat):**
1. **Published rejections** — Red Team vetoes and risk-gate blocks on the public
   record is *costly signaling*; platforms optimizing engagement won't show
   their strategy saying "no".
2. **Price-bound verified PnL architecture** — retrofitting oracle-verified
   entry/exit onto a self-reported system invalidates the competitor's existing
   track record (they must reset or admit prior numbers were unverified).
3. **Accumulated verified history** — proof compounds; a copier starting later
   is structurally N months behind (time moat). This is why TrackRecord v2
   outranks any marketing work.
4. **Verified vs attested separation (D-1)** — honest tiering of what is proven
   vs claimed; competitors that mix them can't un-mix without breaking claims.

## 4. Positioning

> "No solo te damos una señal: tres agentes la debaten, un CIO decide, el riesgo
> puede rechazarla y cada resultado queda explicado y auditable."

Consistent with canonical messaging ("Los agentes prometen. Bobby prueba.").
Category: **not** "AI trading agent on Base" (crowded); **proof-of-decision layer
for trading agents** — debate + risk gate + verifiable record, with execution as
a pluggable second layer (OKX Signal Bot = distribution/beta rail; Base-native
non-custodial = production rail). The Umax custody contrast and CIDER token gate
sharpen the trust pitch: **no token, no custody, only proof.**

## 5. Two honest caveats

1. **Proof raises the stakes on performance; it does not replace it.** Verified
   bad numbers are worse than unverified good ones. HyperClaw sells returns;
   Bobby selling verified reasoning only wins if the verified numbers are
   decent. Edge validation (real-capital run) remains the foundation under all
   of this.
2. **The message only works once the proof is live.** Until TrackRecord v2
   verifies entry *and* exit on mainnet with the real Safe, "Bobby prueba" is a
   promise too. No public positioning push before that layer exists.

## 6. What this changes / doesn't change

| Changes | Doesn't change |
|---|---|
| Messaging emphasis: proof-of-process > "AI agent" | Sepolia broadcast + soak first |
| Add HyperClaw/CIDER/Umax to strategic watch | Demo Trading PoC + execution-controls spec next |
| Trust pitch: non-custodial, token-free, published vetoes | TrackRecord v2 + M-02..M-05 before mainnet |
| Ask Codex for APEX Runner URL or drop it | No pricing, no marketplace, Copy Trading = phase 2 |
