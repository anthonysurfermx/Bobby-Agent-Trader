# BRIEF FOR CODEX: Strategies Section — The Missing Piece

## Context

Bobby Protocol already serves two audiences cleanly:

- **Humans**: landing page, Harness Console, Submission page, visible track record
- **Agents**: 21 MCP tools at `/api/mcp-http`, machine-readable registry, x402 payment rail

The gap Anthony surfaced: **a trader with 5 years on CEX/DEX reads the Bobby landing and still can't tell what to *do* with it.** The infrastructure is correct, the positioning is correct, but there is no bridge between "Adaptive Financial Control Plane" and "here is how I, a trader, use this Monday morning."

The b1nary integration we just shipped (`bobby_wheel_evaluate`, `bobby_wheel_positions`) hints at the answer — a concrete strategy with a concrete tool mapping. But one integration isn't enough. Traders need to see **multiple strategies**, each mapped to Bobby's superpowers, each showing the specific failure mode Bobby prevents.

## The Core Risk to Avoid

A naive "Strategies" section becomes a bot marketplace — "click here to run the Wheel, click here to run Mean Reversion." That path:

- Competes directly with 3Commas, Gainium, Kryll, which have custodial execution we don't have
- Dilutes the positioning ("pressure-test layer") that we deliberately chose with Codex's input on the b1nary brief
- Implies Bobby executes, when the honest story is Bobby *decides* and the agent/human executes

**The right framing**: Bobby is not a strategy engine. Bobby is the judgment layer that makes any strategy safer to run. Every entry in the Strategies section should answer "which of Bobby's existing superpowers does this strategy consume, and what specific failure does Bobby prevent for this play."

## Product Positioning for the Section

> "Every strategy has a blind spot. Bobby is the pressure-test in front of the blind spot."

Concrete framing per strategy:

1. **What it is** (1 paragraph, CEX/DEX-native language)
2. **Where it hurts without Bobby** (the typical failure mode — catching a falling knife, selling calls into a squeeze, FOMO'ing into a rug)
3. **Which Bobby tools map to this strategy** (explicit MCP tool names, already live)
4. **Live example** (the tool actually runs against current market data)
5. **Guardrails that fire** (which of the 11 existing guardrails apply)

This is not marketing copy. It is a usage manual that happens to be interactive.

## Scope Proposal — Four Playbooks

Do NOT try to cover every possible strategy. Pick four that each demonstrate a different class of Bobby capability, so the section teaches the *pattern* of using Bobby, not a list:

### 1. Swing Trading with Conviction Gate
- Demonstrates: the 3-agent debate + conviction scoring
- Tools: `bobby_recommend`, `bobby_brief`, `bobby_debate`
- Failure mode it prevents: entering on a signal that looks good to Alpha Hunter but fails Red Team
- Guardrails: conviction ≥ 3.5, mandatory stop, circuit breaker

### 2. Smart Money Copy with Trust Filter
- Demonstrates: on-chain intelligence + reputation layer
- Tools: `bobby_xlayer_signals`, `bobby_dex_signals`, `bobby_security_scan`
- Failure mode: copying a whale that's actually a honeypot operator or exit-dumping on retail
- Guardrails: security scan, regime filter

### 3. Breakout with Adversarial Check
- Demonstrates: Red Team + Judge Mode
- Tools: `bobby_analyze`, `bobby_judge`, `bobby_ta`
- Failure mode: buying the breakout right before the fakeout
- Guardrails: Judge Mode audit, metacognition (auto-calibration when overconfident)

### 4. The Wheel on b1nary (preview)
- Demonstrates: the full integration pattern we just shipped
- Tools: `bobby_wheel_evaluate`, `bobby_wheel_positions`
- Failure mode: selling puts into a regime where spot is about to gap down
- Guardrails: the 5 wheel-specific guardrails
- Chain note: explicit "Base today, X Layer pending" framing already in place

Four playbooks covers: directional long (swing), directional long w/ social signal (copy), breakout (momentum), and yield/options (wheel). That's the full trader palette without trying to be a cookbook.

## Architecture Proposal

### Page placement
New route: `/strategies` wrapped in `KineticShell` with `activeTab="strategies"`. Add the tab to `KineticShell.tsx`.

### Component structure
- `StrategiesPage.tsx` — page shell, lists all playbooks, handles selected state
- `StrategyPlaybook.tsx` — one playbook card, takes playbook config + renders sections
- `StrategyLiveDemo.tsx` — the "Try it" runner: input field (symbol / wallet / strike), button, result pane
- `src/data/strategies.ts` — config for the four playbooks (metadata, tool mapping, copy)

No new backend. Every "Try it" button calls existing MCP tools via `/api/mcp-http` — that's the whole point. Zero new endpoints.

### Data flow per playbook
1. User clicks "Try it" on the playbook
2. Frontend makes a JSON-RPC call to `/api/mcp-http` with the right tool + args
3. Result renders in a glass card below — JSON pretty-printed for transparency, plus a human-readable verdict summary pulled from the result
4. Link at the bottom: "See this verdict on the Harness Console" → deep-link to the event

This keeps the Strategies page as **living proof** of the protocol rather than decorative copy. Every visit produces real agent_events.

### Styling
- Stitch tokens already established: `bg-white/[0.02]`, `border-white/[0.04]`, `text-green-400`
- Each playbook in a glass card with 5 sections (what / pain / tools / demo / guardrails)
- Sticky side-rail with playbook names for navigation within the page

## What Belongs in Each Playbook (content template)

```typescript
interface Playbook {
  slug: string;                    // 'swing-with-conviction', 'smart-money-copy', etc.
  name: string;
  tagline: string;                 // 1 line, CEX/DEX-native
  audience: string[];              // ['swing traders', 'discretionary', ...]
  whatItIs: string;                // paragraph
  painWithoutBobby: string;        // specific failure mode
  toolsUsed: Array<{
    name: string;                  // 'bobby_recommend'
    role: string;                  // 'Pre-entry signal'
    premium: boolean;
  }>;
  guardrailsThatFire: string[];    // names from the 11
  demoInput: {
    type: 'symbol' | 'wallet' | 'wheel_leg';
    defaultValue: string;
    placeholder: string;
  };
  demoCall: {
    tool: string;                  // which MCP tool the button fires
    argsBuilder: (input: string) => Record<string, unknown>;
    resultSummary: (result: unknown) => string;  // one-line human verdict
  };
}
```

This structure is intentionally rigid — every playbook fills every slot. If a playbook can't fill a slot, it doesn't belong in the section.

## Open Questions for Codex

1. **Four playbooks vs. fewer-deeper**: Is 4 the right count, or would 3 with a "coming soon: 4 more" teaser be stronger? Tradeoff: breadth-of-use-cases vs. depth-of-each-demo. My lean is 4 because each demonstrates a distinct Bobby capability class.

2. **Live demo risk**: every "Try it" button hits real MCP tools and emits real agent_events. That's great for proof but means public visitors can spam and inflate event counts. Do we:
   - (a) allow freely, accept spam as "active usage"
   - (b) rate-limit per IP on the frontend
   - (c) attribute demo events with `meta.demo_source: 'strategies_page'` so we can filter them out of the real track record

   My lean is (c) — keeps the integrity of the trust score while letting the page be a genuine proof surface.

3. **Premium tools in demos**: `bobby_debate`, `bobby_analyze`, `bobby_judge`, `bobby_security_scan`, `bobby_wallet_portfolio` are all gated by x402 payments (0.001 OKB). Do we:
   - (a) exclude premium tools from live demos (use free proxies like `bobby_brief`)
   - (b) show the unsigned-tx flow and let the user actually pay
   - (c) maintain a "demo mode" that bypasses payment for this page only

   My lean is (a). Option (b) derails trader attention into wallet plumbing; option (c) creates a second code path that'll drift. The four picked strategies all have free tools that demonstrate the pattern.

4. **b1nary playbook chain framing**: The Wheel playbook will show `deployment_status: base_live_xlayer_pending`. Is that honest-enough to include pre-deadline, or does including it make judges think we're shipping vapor? My lean: include it, the transparency is the feature — but explicitly mark it "PREVIEW — live on Base" in the playbook badge so no one misreads.

5. **Strategy curation authority**: Bobby is positioned as neutral infrastructure. Listing four "official" strategies on our own site implies endorsement. Is that a positioning problem? Alternative framing: "Four strategies our users build — not a recommendation." My lean: explicit disclaimer at the top of the page, keep the four examples.

6. **Target trader level**: Anthony's self-description is "5 years on CEX/DEX, still doesn't know what Bobby does for me." That's a sophisticated retail trader, not a fund manager and not a first-time user. All copy should assume: knows what RSI / strike / stop loss / regime mean; does NOT know MCP / x402 / adversarial debate. Too basic and we patronize; too deep and we lose the audience. Please call out any playbook copy that misses this level.

7. **What am I not seeing**: trading strategies are load-bearing territory — one piece of wrong advice in a tagline and we look amateur to the exact audience we're trying to reach. What specific copy risks or UX patterns would you flag?

## Timing

The hackathon deadline is 2026-04-15 23:59 UTC (≈28h out as of this brief). This section is **not** a submission requirement — it's post-submission polish that makes the product legible to retail humans.

Shipping order preference:
- **Before deadline**: finish video + Google Form + X post (per project memory)
- **After deadline / weekend**: build this Strategies section, 4 playbooks, on its own branch, ship when polished

Please critique whether that ordering is right. If this section would *actually help* submission reviewers understand Bobby (judges include traders, not just infra people), arguing to prioritize it before deadline is fair — but the trade-off is video + submission logistics slip, which is worse.

My lean: ship video + form first, then build this with care on April 16-18. The section deserves real design attention; rushing it to T-28h risks shipping something that undercuts the positioning we just ironed out.

Critique hard. If any of these four strategies is a bad pick, or if the whole framing of "playbooks not bot-marketplace" is wrong, say so. I'd rather throw this brief away than ship a section that dilutes the trust narrative.
