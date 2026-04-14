# Bobby Protocol — The 10-minute explainer

> If you only have 10 seconds: Bobby is the pressure-test layer for AI-driven financial decisions. You describe a trade, three agents debate it, a Judge audits the debate, 11 guardrails run fail-closed, and the verdict lands on X Layer before the outcome is known. It does not execute. It does not custody. It tells you whether the decision survives adversarial review — and logs the answer on-chain so you can prove later that you knew.

---

## 1. Monday morning

You are a sophisticated trader. Not a degen — someone who has spent five years on CEXes and DEXes and now runs a few AI agents on the side. It is 9:04 AM. You are looking at BTC at 68,100 and you want to go long with 3x leverage, stop at -5%. Your gut says yes. Your PnL this week says maybe. Your last three "gut says yes" trades closed in the red.

You could:

- **Ask ChatGPT.** It will agree with you. It has no skin in the game and no memory of the last three trades.
- **Ask your Discord.** Someone will say "bullish AF" and someone else will say "short it." No audit trail. No accountability.
- **Backtest.** Takes an hour, won't capture regime, and you already know the answer you want.

Now imagine a fourth option: you paste the trade into Bobby. Three specialized agents argue about it in front of you — one builds the case, one attacks it, one sizes the position inside your risk budget. A Judge audits the debate on six dimensions and detects if any of the three is drifting into confirmation bias. Eleven guardrails run in production code — no consensus, no trade; no stop loss, no trade; three losses in a row, circuit breaker kicks in. Seventy seconds later you have a verdict — EXECUTE, SKIP, or WAIT — with reasoning any reviewer can audit, and a hash of that verdict lands on X Layer *before* the market tells you whether you were right.

You are not asking Bobby to trade. You are asking Bobby whether this trade survives adversarial review. The trade, or the no-trade, is still yours.

## 2. Monday morning, but you are an AI agent

Swap the human for an agent. A vault protocol on Base is about to sell a cash-secured put on ETH. It has a strike, an expiry, a delta target. Its internal heuristics say "sell." But selling the wrong put in the wrong regime is how vaults blow up.

The agent makes one MCP call to `bobby_wheel_evaluate`. It pays 0.001 OKB via x402 if it wants the premium path. Bobby pulls the live b1nary quote, runs five wheel guardrails — strike distance, expiry window, annualized yield floor, regime gate, market breaker — and returns `SELL`, `SKIP`, or `WAIT` with the reasoning and a `deployment_status` flag so the agent never confuses live from pending. Every verdict is logged as a `wheel_verdict` event the agent's operator can audit later.

The agent did not pay for an answer. It paid for an adversarial review of its own answer. That is the product.

## 3. The infrastructure underneath

Five pieces, permissionless, live on X Layer:

- **3-agent debate** — Alpha Hunter (case for), Red Team (case against), CIO (sizing + risk). Claude Haiku for speed, ~15 seconds end-to-end.
- **Judge Mode** — Claude Sonnet audits the debate on 6 dimensions (rigor, balance, coverage, bias, calibration, decisiveness) and detects 6 bias types.
- **11 guardrails** — Conviction gate, mandatory stop loss, circuit breaker, drawdown kill switch, hard risk gate, metacognition, commit-reveal, Judge Mode, adversarial bounties, yield parking, EIP-191 auth. Fail-closed in production.
- **Commit-reveal** — every verdict is hashed on-chain before the outcome is known. You cannot retroactively claim "I said that."
- **Adversarial bounties** — anyone can stake OKB to prove Bobby wrong. If Bobby is wrong, the challenger wins the stake and it becomes part of Bobby's on-chain record.

The primitives — `TrackRecord`, `ConvictionOracle`, `AdversarialBounties`, `HardnessRegistry`, `AgentRegistry`, `AgentEconomy` — are six verified contracts on X Layer. They are permissionless: any agent can use them, not just Bobby. Bobby happens to be the first registered agent; it is not the only possible one.

## 4. What this is not

- Not a trading bot. Bobby does not execute. Bobby does not custody.
- Not a wrapper around an LLM. The LLM runs a three-agent debate, not a one-shot answer.
- Not a prompt trick. The 11 guardrails are real code paths. Try to bypass one and you get a `blocked` event, not a soft warning.
- Not "AI for traders" in the retail sense. Bobby is infrastructure. The UI happens to be a terminal because that is how infrastructure gets shown. The real interface is the MCP endpoint any agent can call.

## 5. Why this exists

Every AI agent that touches money today has the same failure mode: it is confidently wrong and nobody audits it before capital moves. The existing response is either "add more prompts" or "add more humans in the loop." Both scale badly.

Bobby's bet: the audit itself is the product. A review that is adversarial, six-dimensional, on-chain, and challengeable by a stake is more expensive than a prompt and less expensive than a DAO. It is the first layer that makes an AI agent's financial decisions legibly worth trusting — or legibly worth rejecting. Either outcome is better than the current default, which is shipping into production and finding out.

If you are a trader, Bobby is a second opinion that never agrees with you out of politeness. If you are an agent builder, Bobby is the pressure-test call you add before collateral moves. If you are a protocol, Bobby is the guardrail layer you bolt on so your users can audit *why* a vault leg was entered, not just *that* it was.

## 6. Where to see it

- Landing: [bobbyprotocol.xyz](https://bobbyprotocol.xyz)
- Live terminal: `/agentic-world/bobby` — try the "Pressure-test" quick action
- Submission review: `/submission` — 60-second path for judges
- Agent integration: [`/skill.md`](https://bobbyprotocol.xyz/skill.md) — the one-file MCP contract
- Heartbeat: `/protocol/heartbeat` — live X Layer health
- Harness console: `/protocol/harness` — every trace, every memory, auditable

---

*This doc is the source of truth for Bobby's positioning. Landing copy, X threads, cold emails, conference abstracts all derive from it. If a sentence anywhere else contradicts this doc, fix the other sentence, not this one.*
