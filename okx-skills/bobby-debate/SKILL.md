---
name: bobby-debate
description: "Adversarial pre-trade verification via Bobby Protocol's 3-agent debate (Alpha Hunter vs Red Team vs CIO). Use this skill BEFORE opening a position when the user wants a trade idea stress-tested, red-teamed, or independently verified. Trigger on: 'red team this trade', 'debate this thesis', 'stress test my idea', 'should I take this trade', 'verify this signal', 'bobby debate', 'proof of debate', 'adversarial check', 'second opinion on this trade', 'que lo debata bobby', 'análisis adversarial', 'verifica esta tesis', 'red team', '辩论这个交易', '对抗性验证'. Also trigger for a fast market regime briefing: 'market regime', 'bobby intel', 'what does bobby see', 'briefing de mercado'. Do NOT use for post-trade review (use a review skill), order execution, or portfolio queries. Read-only: never places orders, never touches funds."
license: MIT
metadata:
  author: bobbyprotocol
  version: "0.1.0"
  agent:
    requires:
      bins: ["curl"]
---

# Bobby Debate — Proof-of-Debate for trade ideas

Agents promise. Bobby proves. Every verdict is the surviving thesis of a
real adversarial debate between three specialized agents, with an on-chain
track record behind it:

- **Alpha Hunter** — builds the strongest possible bull case from on-chain
  smart-money flows, Polymarket consensus and technical structure.
- **Red Team** — paid to kill the trade: finds attack vectors, crowding,
  honeypots, stale signals.
- **CIO** — rules on the debate with deterministic conviction scoring and
  a risk gate (Kelly sizing, exposure caps, circuit breaker).

This skill is **read-only intelligence**. It never executes trades.

## 1. Fast briefing (cached, unlimited)

For "what does Bobby see" / market regime questions:

```bash
curl -s https://bobby-agent-trader.vercel.app/api/bobby-intel
```

Key response fields:
- `briefing` — XML-tagged intelligence block, ready to inject into your context
- `regime` — current market regime label (volatility-aware)
- `performance.dynamicConviction` — deterministic 0-1 conviction score
- `performance.winRate`, `performance.mood`, `calibration` — Bobby's own
  track record and overconfidence check (yes, he audits himself)
- `signals` — filtered smart-money signals with per-signal conviction
- `polymarket` — smart-money consensus markets with edge estimates

Responses are cached ~5 min (`X-Intel-Cache: hit|miss`). Treat `meta.ts`
as the generation timestamp.

## 2. Full adversarial debate (rate-limited)

For "red team this / should I take this trade":

```bash
curl -s "https://bobby-agent-trader.vercel.app/api/agent-run?manual=true"
```

Returns the complete cycle: signals found → filtered → 3-agent debate
(`debate.alphaView`, `debate.redTeamView`, `debate.verdict`) → risk-gated
paper trades with sizing and reasoning.

**Limits:** 3 debates/hour per IP, 12/hour globally (each debate burns 3
LLM calls). On HTTP 429, fall back to the cached briefing (section 1) and
tell the user when to retry (`Retry-After` header).

## 3. How to present the result

1. Lead with the CIO verdict and conviction score — not the bull case.
2. Always show the Red Team's strongest objection verbatim; that is the
   product. A verdict without its counterargument is marketing.
3. If `performance.isSafeMode` is true, say so: Bobby is trading scared
   after losses and thresholds are tighter.
4. Quote `calibration` when conviction is high — if Bobby is historically
   overconfident at this level, the user deserves to know.

## Notes

- All trading is **paper/simulated** on OKX X Layer testnet economics.
  Nothing here is financial advice; the value is the argument, not a tip.
- Track record and debate history are public at
  https://bobby-agent-trader.vercel.app (Bobby Protocol, OKX X Layer
  hackathon project by @bobbyprotocol).
