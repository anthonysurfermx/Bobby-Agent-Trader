# IMPLEMENTATION SPEC v2.1: Pressure-Test Playbooks Page

Target branch: `feat/playbooks-page` (post-deadline — do NOT merge before April 15 23:59 UTC)

## Naming rule (global)
- Use **playbooks**, never **strategies**, anywhere visible to users.
- Internal code identifiers use `playbook` too.
- Use **pressure-test**, not `run` / `execute` / `start`, in CTAs.

## Tool count accuracy
Targeted update only — do NOT sweep every `21` in the repo. Update public MCP-facing surfaces where the count is stated:
- [api/registry.ts](api/registry.ts)
- [public/skill.md](public/skill.md)
- [api/mcp-http.ts](api/mcp-http.ts) server metadata response if it states a count
- Any copy on Submission page / landing that names an exact count

Leave historical copy, blog, and non-MCP docs alone unless they explicitly name the MCP surface.

## Route + shell wiring
- New route: `/protocol/playbooks`
- Wrap in `<KineticShell activeTab="playbooks">`
- Add tab entry to `NAV_ITEMS` in [KineticShell.tsx](src/components/kinetic/KineticShell.tsx) with id `playbooks`, label `Playbooks`, path `/protocol/playbooks`
- **Realign the `activeTab` type to all real tabs.** The current `activeTab` union in [KineticShell.tsx:14](src/components/kinetic/KineticShell.tsx#L14) is already out of sync with tabs the repo actually uses (e.g. `docs`, `marketplace`, `harness`). Don't patch in `'playbooks'` only — derive the union from `NAV_ITEMS` so drift stops:
  ```typescript
  type ActiveTabId = (typeof NAV_ITEMS)[number]['id'];
  // activeTab?: ActiveTabId;
  ```
  This fixes the bug for `playbooks` and every other currently-unlisted tab in one move.
- Add lazy import + route entry in [App.tsx](src/App.tsx) matching the pattern of other protocol pages

## Page structure (inspiration: OKX Trading Bot; estética: Stitch Kinetic Terminal)

**Header**
- Title: `Pressure-Test Playbooks`
- Subtitle: `Example plays showing where Bobby's harness prevents a specific failure mode. Not trading advice.`
- Disclaimer pill: `Examples of how traders use Bobby before committing capital`

**Filter/sort rail** (horizontal, Stitch green-on-dark)
- Categories: `All · Directional · Yield · On-chain flow · Risk management`
- Sort options: `Default · Most restrictive · Most permissive`
- Sort is numeric — ordered by `blockRatePct DESC` for "Most restrictive", `ASC` for "Most permissive". See Data file for the field.

**Playbook grid**
- 4 cards in P0, plus a 5th slot rendered as "Advanced — Breakout Audit" in a `Coming soon` disabled state
- Each card shows:
  - Name
  - Tagline (1 line)
  - Category chip
  - **Bobby block rate** badge (uses `blockRatePct`)
  - **Guardrails fired** count (from `guardrails.length`)
  - Primary CTA: `Pressure-test this playbook →`
- No APR, no "expected return", no PnL — those belong to bots, not to us

**Detail view**
- Expand-in-place (not modal, not separate route) — keeps the URL stable
- Five sections in this exact order:
  1. **What it is**
  2. **Where it hurts without Bobby**
  3. **Which Bobby tools apply** — chip list with role per tool; paid tools marked `Optional deeper audit`
  4. **Live pressure-test** — input + CTA → result card (see Demo output below)
  5. **Guardrails that fire** — pulled from the controlled guardrail vocabulary (see below)

## The four playbooks

### 1. Conviction-Gated Swing Entry
- **slug**: `conviction-gated-swing`
- **category**: `directional`
- **tagline**: `Don't enter a swing on a signal that hasn't survived adversarial review.`
- **whatItIs**: Swing trader sees a setup (price + TA + narrative). Before sizing in, they want to know whether this is momentum chasing, or whether a Red Team actually tried to kill the thesis.
- **painWithoutBobby**: Entering long on a setup that passes your checklist but would have been shredded by a counter-thesis. Confirmation bias is the invisible cost.
- **tools**:
  - `bobby_recommend` — role: `Bobby's live entry signal`
  - `bobby_brief` — role: `Token-efficient context bundle`
- **demo**:
  - tool: `bobby_brief`
  - inputType: `symbol`
  - defaultInput: `ETH`
  - inputPlaceholder: `BTC, ETH, SOL, OKB`
  - sourceLabel: `Bobby market snapshot`
  - summarize: pull `regime`, `signal.verdict`, `signal.conviction` from the response; headline reflects ACTIONABLE vs non-actionable
- **guardrails**: `conviction_gate`, `mandatory_stop`, `circuit_breaker`, `metacognition`
- **blockRatePct**: `60`
- **blockRateCopy**: `Blocks roughly 3 in 5 low-conviction setups`

### 2. Smart Money Follow with Contract Filter
- **slug**: `smart-money-follow`
- **category**: `on-chain-flow`
- **tagline**: `Follow on-chain flow, but never touch a contract that fails a security scan.`
- **whatItIs**: Copy-trading a smart-money wallet is a known edge, but it collapses the moment you buy the whale's exit or a contract with hidden mint / fee logic.
- **painWithoutBobby**: Mimicking a wallet on token X right as the wallet exits, or buying a contract that scans as risky.
- **tools**:
  - `bobby_dex_signals` — role: `Cross-chain smart money flow`
  - `bobby_xlayer_signals` — role: `Smart money on X Layer`
  - `bobby_security_scan` — role: `Optional deeper audit`, paid: true
- **demo**:
  - tool: `bobby_dex_signals`
  - inputType: `chain`
  - defaultInput: `196`
  - inputPlaceholder: `Chain ID (196 = X Layer, 1 = Ethereum)`
  - sourceLabel: `OKX OnchainOS flow feed`
  - summarize: extract top 3 signals (token, amount, wallet count) into the headline
- **guardrails**: `hard_risk_gate`
- **blockRatePct**: `25`
- **blockRateCopy**: `Flags contract risk on roughly 1 in 4 trending tokens`

Rationale for demo tool: `bobby_xlayer_signals` doesn't accept a `chain` input (see [api/mcp-http.ts:225-234](api/mcp-http.ts#L225-L234)), so the demo uses `bobby_dex_signals` which does accept `chain`. The X Layer tool remains listed in `tools` with its role label — it's still part of the playbook's capability surface, just not the primary demo call.

### 3. No-Trade / Stand Aside
- **slug**: `no-trade-stand-aside`
- **category**: `risk-management`
- **tagline**: `The best trade is often no trade. Bobby's job is to tell you when to stand aside.`
- **whatItIs**: A trader pings Bobby for a setup. Instead of forcing a verdict, Bobby returns a non-actionable response when conviction doesn't clear threshold or the regime is inhospitable.
- **painWithoutBobby**: Overtrading in chop. Forcing positions because you're watching the screen, not because the market is offering anything. This is the most expensive habit in retail trading.
- **tools**:
  - `bobby_recommend` — role: `Honest non-signal when nothing is actionable`
  - `bobby_brief` — role: `Context for why no trade now`
- **demo**:
  - tool: `bobby_recommend`
  - inputType: `symbol`
  - defaultInput: `` (empty)
  - inputPlaceholder: `Leave empty for Bobby's current pick`
  - sourceLabel: `Bobby live signal board`
  - summarize: inspect `recommendation` field from payload. If it equals `ACTIONABLE`, headline notes "Actionable — but this playbook shines when Bobby says no." If it is anything else (null / missing / any non-`ACTIONABLE` value), headline is `Stand aside`. Do not hardcode any other verdict label — route by `ACTIONABLE` vs not.
- **guardrails**: `conviction_gate`, `yield_parking`, `circuit_breaker`, `drawdown_kill_switch`
- **blockRatePct**: `55`
- **blockRateCopy**: `Says 'stand aside' on more than half of low-conviction prompts`
- **Note**: This playbook is the moat. Keep its copy deliberately proud — "we will actively recommend you do nothing" is the differentiator from every bot marketplace.

### 4. Wheel on b1nary — Preview
- **slug**: `wheel-b1nary-preview`
- **category**: `yield`
- **tagline**: `Pressure-test a covered put or call before committing collateral on b1nary.`
- **whatItIs**: The Wheel strategy (sell put → if assigned, sell call → repeat) is mechanical, but the judgment calls — which strike, which expiry, whether to skip — decide the outcome.
- **painWithoutBobby**: Selling puts into a regime about to gap down. Selling calls too cheap in a bull. Expiry windows that give up theta or invite gamma.
- **tools**:
  - `bobby_wheel_evaluate` — role: `Pre-entry SELL / SKIP / WAIT gate`
  - `bobby_wheel_positions` — role: `Open-leg monitor with market context`
- **demo**:
  - tool: `bobby_wheel_evaluate`
  - inputType: `wheel_leg`
  - defaultInput: `{ asset: 'eth', side: 'put', strike: 2200, expiry_days: 3 }`
  - sourceLabel: `b1nary · Base (8453) · live read-only`
  - summarize: extract `verdict`, `conviction`, `leg.annualized_bps`, `leg.strike_distance_pct`, `context.regime` into the headline
- **guardrails**: `wheel_market_breaker`, `wheel_strike_distance`, `wheel_expiry_window`, `wheel_premium_floor`, `wheel_regime_gate`
- **blockRatePct**: `40`
- **blockRateCopy**: `Roughly 2 in 5 proposed legs fail Bobby's wheel guardrails`
- **CTA override**: `Pressure-test this leg` (structured demos read better with the noun `leg`)
- **Badge**: `PREVIEW · Base (8453) live · X Layer pending` — amber-300 tone, same pattern as the Submission page chain note

### 5. Breakout Audit — Advanced (placeholder only)
- Card renders disabled with chip `Advanced — Coming soon`
- No demo wired
- Rationale: requires `bobby_analyze` + `bobby_judge` (both premium). Premium-first is wrong for first contact.

## Controlled guardrail vocabulary

Every string in a playbook's `guardrails` field MUST come from this list. No invented names. If a new guardrail is needed, add it here first.

Trader-facing guardrails (derived from the 11 existing, named in trader language):
- `conviction_gate`
- `mandatory_stop`
- `circuit_breaker`
- `drawdown_kill_switch`
- `hard_risk_gate`
- `metacognition`
- `commit_reveal`
- `judge_mode_6d`
- `adversarial_bounties`
- `yield_parking`

Wheel-specific (live in production):
- `wheel_market_breaker`
- `wheel_strike_distance`
- `wheel_expiry_window`
- `wheel_premium_floor`
- `wheel_regime_gate`

**Explicitly excluded** from the trader-facing list: `eip_191_auth`. It's payment/auth plumbing, not a trader-facing guardrail. If a playbook needs to reference it, do so in a technical footnote on the page, never in the `guardrails` chip list.

The UI renderer maps each slug to a human label via a dictionary in `src/data/playbooks.ts`. Keep labels short and trader-native — e.g. `conviction_gate` → `Conviction Gate`, `wheel_premium_floor` → `Wheel Premium Floor`.

## Data file

Path: `src/data/playbooks.ts`

```typescript
export type PlaybookCategory = 'directional' | 'yield' | 'on-chain-flow' | 'risk-management';
export type DemoInputType = 'symbol' | 'chain' | 'wheel_leg' | 'none';
export type PlaybookStatus = 'live' | 'preview' | 'advanced';

export interface PlaybookToolRef {
  name: string;            // MCP tool name (exact)
  role: string;            // one-line human label
  paid?: boolean;          // true → render as "Optional deeper audit"
}

export interface PlaybookDemo {
  tool: string;                                              // MCP tool fired on CTA
  inputType: DemoInputType;
  inputLabel: string;
  inputPlaceholder?: string;
  defaultInput: unknown;
  buildArgs: (input: unknown) => Record<string, unknown>;    // builds MCP args from input
  summarize: (result: unknown) => {
    headline: string;
    detail: string;
  };
  sourceLabel: string;           // human label for data source; rendered verbatim
  freshnessLabel?: string;       // optional e.g. "updated every 5 min"
  ctaOverride?: string;          // optional override for CTA copy (e.g. "Pressure-test this leg")
}

export interface Playbook {
  slug: string;
  name: string;
  category: PlaybookCategory;
  tagline: string;
  whatItIs: string;
  painWithoutBobby: string;
  tools: PlaybookToolRef[];
  guardrails: string[];          // MUST be from controlled vocabulary
  blockRatePct: number;          // 0-100, used for sort + badge
  blockRateCopy: string;         // human badge text
  demo: PlaybookDemo | null;     // null = placeholder card
  badge?: { label: string; tone: 'preview' | 'advanced' };
  status: PlaybookStatus;
}

export const GUARDRAIL_LABELS: Record<string, string> = {
  conviction_gate: 'Conviction Gate',
  mandatory_stop: 'Mandatory Stop Loss',
  circuit_breaker: 'Circuit Breaker',
  drawdown_kill_switch: 'Drawdown Kill Switch',
  hard_risk_gate: 'Hard Risk Gate',
  metacognition: 'Metacognition',
  commit_reveal: 'Commit-Reveal',
  judge_mode_6d: 'Judge Mode (6D)',
  adversarial_bounties: 'Adversarial Bounties',
  yield_parking: 'Yield Parking',
  wheel_market_breaker: 'Wheel Market Breaker',
  wheel_strike_distance: 'Wheel Strike Distance',
  wheel_expiry_window: 'Wheel Expiry Window',
  wheel_premium_floor: 'Wheel Premium Floor',
  wheel_regime_gate: 'Wheel Regime Gate',
};

export const PLAYBOOKS: Playbook[] = [
  // four populated entries in the order above; fifth as placeholder
];
```

Every field is load-bearing. A playbook that can't fill every field is not ready to ship.

## Components

Path: `src/pages/BobbyPlaybooksPage.tsx`
- Default export, wrapped in `<KineticShell activeTab="playbooks">`
- `<Helmet>` title: `Pressure-Test Playbooks | Bobby Agent Trader`
- Reads `PLAYBOOKS`, renders `<PlaybookCard>` grid; manages filter + sort state locally

Path: `src/components/playbooks/PlaybookCard.tsx`
- Collapsed: name + tagline + category chip + block-rate badge + guardrails count + primary CTA
- Expanded (local state): renders the five detail sections
- CTA label: `Pressure-test this playbook` unless `demo.ctaOverride` is set

Path: `src/components/playbooks/PlaybookLiveDemo.tsx`
- Takes `PlaybookDemo`
- Renders input typed per `inputType` (symbol = text, chain = text or select, wheel_leg = 4 structured fields)
- On CTA click: POST to `/api/mcp-http` via JSON-RPC `tools/call` with `demo_source: 'playbooks_page'` in args
- Result pane:
  - **Headline first** (from `summarize`)
  - Timestamp (client-side `new Date().toISOString()`)
  - `sourceLabel` rendered verbatim
  - `freshnessLabel` if present
  - JSON raw payload in a collapsible section, collapsed by default
- Loading copy: `Bobby is pressure-testing this setup...`
- Error state: show the exact tool error + link to Harness Console root (no deep-link promise)

Path: `src/components/playbooks/PlaybookGuardrailList.tsx`
- Takes `string[]` of guardrail slugs
- Looks up human labels via `GUARDRAIL_LABELS`
- Silently drops unknown slugs in production (log a console.warn in dev) — keeps the data file as single source of truth

## Demo attribution (minimal backend change)

P0 approach — keep it narrow:
- Frontend sends `demo_source: 'playbooks_page'` in every JSON-RPC `params.arguments`
- In [api/mcp-http.ts](api/mcp-http.ts) at the top of `executeTool`, extract `demo_source` from args into a local variable, then strip it before passing args to individual tool handlers
- Propagate `demoSource` only to the generic `mcp_call` log at the end of `executeTool` (the catch-all that already exists around line 964). That already covers every tool.
- Do NOT add `demo_source` to the per-tool `logHarnessEvent` calls that already exist for wheel tools. Those emit with their own meta, and trying to thread a new field through every path is the scope creep this spec rejects.
- Net result: the generic `mcp_call` event will carry `meta.demo_source`; the specific `wheel_verdict` / `wheel_positions_snapshot` events will not. That's acceptable because those specific events are trivial to filter out by `event_type` when demo attribution matters.

Downstream query audit — only what actually reads `agent_events`:
- [api/bobby-protocol-stats.ts](api/bobby-protocol-stats.ts) — confirmed reads `agent_events` (around line 315). **Must filter demo traffic here.**
- [api/reputation.ts](api/reputation.ts) — does NOT read `agent_events`. No change required from this spec.
- [api/activity.ts](api/activity.ts) — does NOT read `agent_events`; composes `agent_commerce_events`, heartbeat, and bounties. No change required from this spec.

Other surfaces that read `agent_events` should get the same filter if they exist — implementer must grep for `agent_events` queries beyond `bobby-protocol-stats.ts` and apply the filter to any public-metrics surface found. Verify-if-needed, don't assume.

If any query reads `agent_commerce_events` and includes demo-originated payments as part of public metrics, that needs a separate audit — outside the scope of this spec.

**Filter rule (semantic, not literal SQL):** when a query over `agent_events` contributes to public metrics, exclude rows where `meta->>'demo_source' = 'playbooks_page'`. Implementer picks the exact SQL form that reads cleanest in context; the constraint is the exclusion, not the expression.

Ship this change in the same PR as the page.

## Styling rules
- Stitch tokens only: `bg-white/[0.02]`, `border-white/[0.04]`, `text-green-400` primary, `text-amber-200` for PREVIEW, `text-[#ff716a]` guardrail accent
- No new colors
- Framer Motion for card expansion: 150ms height+opacity, no spring overshoot
- Respect existing ticker + nav; do not add a second sticky header
- No Recharts — page has no charts in P0

## Copy rules (global)
- Never use `Run` / `Execute` / `Start` / `Trade` as imperatives in CTAs
- Always surface: timestamp, `sourceLabel`, freshness (when configured)
- Never show APR / expected return / PnL
- Never promise a deep-link to a specific Harness Console event
- Disclaimers: top of page and bottom of each demo result — `Examples of how traders use Bobby before committing capital. Not trading advice.`
- When Bobby's `bobby_recommend` response is `recommendation: 'ACTIONABLE'`, do not pretend otherwise — acknowledge the actionable signal and frame the playbook as "this is when Bobby says yes; the value shows more when Bobby says no"

## Acceptance checklist
- [ ] Route renders at `/protocol/playbooks`
- [ ] KineticShell has `Playbooks` tab selected on the page
- [ ] All four playbooks render collapsed + expanded
- [ ] Each demo fires a real MCP call, renders human headline first, JSON collapsible below
- [ ] Every demo request includes `demo_source: 'playbooks_page'`
- [ ] Generic `mcp_call` event carries `meta.demo_source`
- [ ] `reputation.ts`, `activity.ts`, `bobby-protocol-stats.ts` exclude demo traffic from public metrics
- [ ] Wheel playbook carries amber `PREVIEW · Base (8453) live · X Layer pending` badge
- [ ] Wheel CTA reads `Pressure-test this leg`
- [ ] Breakout card disabled `Advanced — Coming soon`
- [ ] No guardrail slug outside the controlled vocabulary appears in any playbook
- [ ] `eip_191_auth` nowhere in the trader-facing guardrail chip list
- [ ] Sort "Most restrictive / permissive" orders numerically by `blockRatePct`
- [ ] Each demo **result pane** (not the collapsed card) displays `sourceLabel` verbatim from config
- [ ] Targeted `21 → 22` count updates in MCP-facing surfaces only
- [ ] `npm run build` passes
- [ ] No new Supabase migration
- [ ] No new API endpoint

## Non-goals
- No strategy/playbook performance tracking
- No user accounts or saved playbooks
- No backtest visualization
- No leaderboard
- No notifications
- No social share buttons
- No i18n — English only in P0
- No deep-link to specific Harness Console events
- No repo-wide sed replace of `21 tools`

## Timing
- Do not merge before April 15 23:59 UTC
- Build on `feat/playbooks-page` April 16-18
- Merge after mobile + desktop QA and confirmation that no existing public metric regressed from the `demo_source` filter
