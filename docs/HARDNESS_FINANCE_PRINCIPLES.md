# Hardness Finance — 20 Design Principles

Bobby Protocol's architecture follows these 20 principles for building
robust financial orchestration infrastructure for AI agents.

## I. Harness Architecture

1. **Strict Control Loop** — perceive→retrieve→plan→act→observe cycle in every bobby-cycle
2. **Termination & Resource Limits** — step counts, recursion depth, cost ceilings per session
3. **Execution Sandboxing** — isolated debate chamber (Alpha can't see Red's reasoning)
4. **Dynamic Context Budget** — HardnessContext loads only relevant market data per decision

## II. Financial Integrity (Guardrails)

5. **Asset-Liability Matching** — pull-payment pattern, no custody, no liquidity mismatch
6. **Artisan, Not Factory** — every prediction passes through full harness, no shortcuts
7. **Clarity of Purpose** — stress-test decisions, not make them. Bobby governs, agents decide
8. **Face the Tiger** — corrections loop, self-awareness of past mistakes, transparent failures

## III. Externalized State (Memory)

9. **Open, Non-Proprietary Memory** — Supabase + on-chain, no vendor lock-in
10. **Hierarchical Memory** — hot (real-time cycle) / warm (sessions) / cold (track record)
11. **Experience Distillation** — past failures become calibration data for future decisions
12. **Execution Traces** — every session persisted: request, context, debate, judge, proof

## IV. Expertise & Protocols

13. **Staged Skill Loading** — tools described by name, loaded on demand (MCP pattern)
14. **MCP Standard** — 15 tools over Streamable HTTP, JSON-RPC 2.0, x402 payment
15. **Intent Normalization** — HardnessSpec schema validates before entering sandbox
16. **Normative Constraints** — riskPolicy embedded in every agent's profile

## V. Governance & Observability

17. **Human Approval Gates** — high-risk actions require human confirmation
18. **Structured Observability** — causal traces linking action→antecedent→outcome
19. **Model Transferability** — intelligence in infrastructure, not model weights
20. **Stratified Policy Config** — user/project/org-level policies applied at runtime

## Implementation Status

| Principle | Status | Where |
|-----------|--------|-------|
| 1 | Implemented | bobby-cycle.ts |
| 2 | Implemented | orchestrate.ts (session limits) |
| 3 | Implemented | orchestrate.ts (isolated debate) |
| 4 | Partial | HardnessContext in types |
| 5 | Implemented | pull-payment in contracts |
| 6 | Implemented | all predictions go through harness |
| 7 | Implemented | positioning + architecture |
| 8 | Implemented | corrections block in cycle |
| 9 | Implemented | Supabase + X Layer |
| 10 | Partial | hot/cold separation |
| 11 | Partial | contradictions in cycle |
| 12 | Implemented | hardness_agent_sessions |
| 13 | Partial | MCP tool discovery |
| 14 | Implemented | api/mcp-http.ts |
| 15 | Implemented | HardnessSpec validation |
| 16 | Implemented | riskPolicy per agent |
| 17 | Partial | advisory mode |
| 18 | Partial | session traces |
| 19 | Implemented | OpenAI + Claude interchangeable |
| 20 | Implemented | per-agent riskPolicy |
