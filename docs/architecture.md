# Bobby Protocol — Architecture & Status

**As of 2026-08-12** · branch `codex/security-r12` · r10.2 audited (152/152 Foundry, API hardening 26/26)

Legend: **●** live · **◐** canary/partial · **○** decided or spec'd, not built · **✕** gate (NO-GO until closed)

---

## 1. System overview

```mermaid
flowchart TB
    subgraph DATA["Market data in"]
        OKX["OKX market data<br/>prices · funding · candles"]
        NEWS["News / macro calendar"]
    end

    subgraph BRAIN["Debate engine — Vercel serverless ●"]
        RUN["agent-run.ts<br/>main cycle · 8h"]
        CYCLE["bobby-cycle.ts<br/>user debate · 5min cron"]
        INTEL["bobby-intel.ts<br/>fast snapshot ~10s"]
        EXPLAIN["explain.ts<br/>SSE streaming analysis"]
    end

    subgraph LLM["LLM providers"]
        GPT["OpenAI GPT-4o<br/>3-agent debate · function calls"]
        HAIKU["Claude Haiku<br/>explain streaming"]
    end

    subgraph STORE["Supabase — Postgres + RLS ●"]
        TABLES["agent_cycles · agent_trades<br/>agent_signals · agent_positions<br/>forum_threads · forum_posts"]
    end

    subgraph SURFACE["User surfaces ●"]
        WEB["React + KineticShell<br/>11+ Bobby views"]
        TG["Telegram bot<br/>webhook + payments"]
        VOICE["Voice Live Desk<br/>OpenAI Realtime WebRTC"]
    end

    subgraph CHAIN["On-chain proof layer"]
        XL["X Layer 196 ●<br/>production"]
        SEP["Base Sepolia 84532 ◐<br/>canary"]
        MAIN["Base mainnet 8453 ✕<br/>NO-GO"]
    end

    subgraph EXEC["Execution rails"]
        SIM["Paper / simulated ●<br/>current mode"]
        EXECUTOR["services/executor · Fly.io ○<br/>built, not deployed"]
        SIGBOT["OKX Signal Bot webhook ○<br/>spec v0 only"]
        V4["Uniswap v4 treasury rail ○<br/>decided 2026-08-12, not built"]
    end

    DATA --> BRAIN
    BRAIN <--> LLM
    BRAIN --> STORE
    STORE --> SURFACE
    BRAIN --> CHAIN
    BRAIN --> EXEC
```

**Rule of the house:** Bobby trades paper/simulated only. Real broadcasts, deploys
and env changes are executed by Anthony — the agent prepares, never fires.

## 2. The debate cycle (the product)

```mermaid
flowchart LR
    SIG["Signal in"] --> FILTER["Filter"]
    FILTER --> AH["Alpha Hunter<br/>proposes the trade"]
    AH --> RT["Red Team<br/>attacks the thesis"]
    RT --> CIO["CIO<br/>verdict"]
    CIO --> GATE{"Risk gate"}
    GATE -->|"veto"| REJ["Rejection recorded<br/>publicly — costly signaling,<br/>part of the moat"]
    GATE -->|"pass"| COMMIT["Commitment hash<br/>on-chain BEFORE execution"]
    COMMIT --> EXECU["Execute<br/>paper/sim today"]
    EXECU --> RESOLVE["Resolve<br/>entry & exit price-bound"]
    RESOLVE --> TR["TrackRecord<br/>verified ≠ attested · D-1"]
```

Each role maps to a distinct on-chain address (manifest `roles`): `alpha`, `red`,
`cio`, `keeper`, `arbiter`, plus a 2-of-3 `resolvers` quorum. Positioning: this
proof-of-*process* (debate trail + published vetoes + price-bound results) is the
differentiator vs Base agent competitors — see
[base-competitive-landscape.md](strategy/base-competitive-landscape.md).

## 3. Chains & deployment pipeline

```mermaid
flowchart LR
    XL["X Layer 196 ●<br/>LIVE — bobbyprotocol.xyz<br/>2,038+ commitments"] --> SEP["Base Sepolia 84532 ◐<br/>7 contracts r8 live + verified<br/>r10.2 redeploy: ONE SIGNATURE AWAY"] --> MAIN["Base mainnet 8453 ✕<br/>NO-GO — next tech round"]

    subgraph SEPSTEPS["Sepolia — runbook steps after signature"]
        direction LR
        S1["1 · Anthony signs<br/>broadcast"] --> S2["2 · Live-verify<br/>7 new addresses"] --> S3["3 · Update<br/>Vercel vars"] --> S4["4 · API<br/>smoke test"] --> S5["5 · Canary soak<br/>24–48h"]
    end

    subgraph GATES["Mainnet gates (all must close)"]
        direction LR
        G1["Safe 2-of-3 real<br/>pin codehash + singleton"] --- G2["TrackRecord v2<br/>entry+exit verified · Pyth rec."] --- G3["M-02..M-05"] --- G4["Audit the new round<br/>3-round rule"]
    end

    SEP -.-> SEPSTEPS
    MAIN -.-> GATES
```

## 4. Component status

| Component | State | Next step |
|---|---|---|
| Debate engine (agent-run / bobby-cycle / bobby-intel / explain) | ● live | — |
| Frontend (KineticShell, 11+ views) + Telegram + Voice | ● live | — |
| Supabase (Postgres + RLS) | ● live | — |
| X Layer record API (auth fail-closed, hardened) | ● code ready | Prod still runs pre-hardening build — guard activates when Anthony promotes a deploy |
| Base Sepolia contracts (r8, block 45364125) | ◐ canary live, superseded | Full r10.2 redeploy pending Anthony's signature |
| r10.2 contracts + SafeOwnerGate (152/152 tests, Codex-approved) | ◐ ready to broadcast | **Anthony signs → steps 2–5** |
| Executor service (`services/executor/`, Fly.io) | ○ built | `fly deploy` by Anthony |
| OKX Signal Bot rail | ○ spec v0 | [execution-controls.md](signal-bot/execution-controls.md) → Demo Trading PoC after soak |
| Uniswap v4 treasury rail (V4Quoter + Universal Router, hookless pools) | ○ decided 2026-08-12 | Implement in mainnet round ([plan](plan-migracion-base.md)) |
| TrackRecord v2 (entry+exit price-bound, Pyth recommended) | ○ design | Next tech round — mainnet gate |
| Safe 2-of-3 (owner on 8453) | ✕ gate | Create, audit, pin codehash + singleton |
| M-02..M-05 | ✕ gate | Next audit round |
| Copy Trading / paid signals | ✕ phase 2 | Only after stable execution + net-of-fees track record + legal review |

## 5. The 7 contracts (Sepolia manifest `84532.json`)

| Contract | Role |
|---|---|
| `BobbyTrackRecord` | Win/loss record, price-bound resolution (v2 will verify entry **and** exit) |
| `BobbyConvictionOracle` | Signal/conviction commitments published pre-execution |
| `BobbyAgentEconomyV2` | Debate fees & protocol economy stats |
| `BobbyAgentRegistry` | Agent identities + registration stake |
| `BobbyIntentEscrow` | Intent attestation ledger — **never** mixed with price-verified stats (D-1) |
| `BobbyAdversarialBounties` | Bounties for adversarial findings |
| `HardnessRegistry` | Debate hardness scoring |

---

**Current bottleneck, in one line:** the Sepolia canary is one signature away
(Anthony's broadcast); everything else on that track is prepared. Mainnet remains
correctly NO-GO behind the gates above.
