// ============================================================
// Pressure-Test Playbooks — configuration
// ------------------------------------------------------------
// Each playbook is an EXAMPLE of how a trader uses Bobby. This
// file is the single source of truth for the /protocol/playbooks
// page. Adding a playbook here is the only way it shows up in
// the UI. No playbook may be rendered without filling every slot.
// ============================================================

export type PlaybookCategory =
  | 'directional'
  | 'yield'
  | 'on-chain-flow'
  | 'risk-management'
  | 'volatility'
  | 'arbitrage';
export type DemoInputType = 'symbol' | 'chain' | 'wheel_leg' | 'none';
export type PlaybookStatus = 'live' | 'preview' | 'advanced';

export interface PlaybookToolRef {
  name: string;
  role: string;
  paid?: boolean;
}

export interface PlaybookDemoSummary {
  headline: string;
  detail: string;
}

export interface PlaybookDemo {
  tool: string;
  inputType: DemoInputType;
  inputLabel: string;
  inputPlaceholder?: string;
  defaultInput: unknown;
  buildArgs: (input: unknown) => Record<string, unknown>;
  summarize: (result: unknown) => PlaybookDemoSummary;
  sourceLabel: string;
  freshnessLabel?: string;
  ctaOverride?: string;
}

export interface Playbook {
  slug: string;
  name: string;
  category: PlaybookCategory;
  tagline: string;
  whatItIs: string;
  painWithoutBobby: string;
  tools: PlaybookToolRef[];
  guardrails: string[];
  blockRatePct: number;
  blockRateCopy: string;
  demo: PlaybookDemo | null;
  badge?: { label: string; tone: 'preview' | 'advanced' };
  status: PlaybookStatus;
}

// ── Controlled guardrail vocabulary ──
// The only guardrail slugs allowed in `Playbook.guardrails`. Any renderer
// that sees an unknown slug should silently drop it in production.
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

// ── Summarizer helpers ──
// Each demo unpacks the MCP tool's text payload. Tools return `content[0].text`
// as a JSON string — parse defensively, never assume shape.
function parseToolText(result: unknown): Record<string, unknown> | null {
  try {
    const r = result as { content?: Array<{ text?: string }> };
    const text = r?.content?.[0]?.text;
    if (typeof text !== 'string') return null;
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ── Playbook catalog ──
export const PLAYBOOKS: Playbook[] = [
  {
    slug: 'conviction-gated-swing',
    name: 'Conviction-Gated Swing Entry',
    category: 'directional',
    tagline: "Don't enter a swing on a signal that hasn't survived adversarial review.",
    whatItIs:
      "Swing trader sees a setup — price action, TA confluence, narrative alignment. Before sizing in, they want to know whether this is momentum chasing or whether a Red Team actually tried to kill the thesis. Bobby's 3-agent debate plus conviction scoring gives the trader a pre-entry gate that surfaces the counter-thesis they didn't consider.",
    painWithoutBobby:
      "Entering long on a setup that passes your personal checklist but would have been shredded by a Red Team counter-thesis. Confirmation bias is the invisible cost — you only notice it when the trade is already underwater.",
    tools: [
      { name: 'bobby_recommend', role: "Bobby's live entry signal" },
      { name: 'bobby_brief', role: 'Token-efficient context bundle' },
    ],
    guardrails: ['conviction_gate', 'mandatory_stop', 'circuit_breaker', 'metacognition'],
    blockRatePct: 60,
    blockRateCopy: 'Blocks roughly 3 in 5 low-conviction setups',
    demo: {
      tool: 'bobby_brief',
      inputType: 'symbol',
      inputLabel: 'Symbol',
      inputPlaceholder: 'BTC, ETH, SOL, OKB',
      defaultInput: 'ETH',
      buildArgs: (input) => ({ symbol: String(input || '').toUpperCase() || undefined }),
      summarize: (result) => {
        const data = parseToolText(result);
        if (!data) return { headline: 'No parseable response', detail: '' };
        const regime = typeof data.regime === 'string' ? data.regime : 'unknown';
        const signal = data.signal as Record<string, unknown> | null;
        if (!signal) {
          return {
            headline: 'Bobby: no actionable signal right now',
            detail: `Regime: ${regime}. Stand aside until a higher-conviction setup appears.`,
          };
        }
        const verdict = typeof signal.verdict === 'string' ? signal.verdict : 'OBSERVE';
        const conviction = typeof signal.conviction === 'number' ? signal.conviction : null;
        const symbol = typeof signal.symbol === 'string' ? signal.symbol : '—';
        const direction = typeof signal.direction === 'string' ? signal.direction : '—';
        return {
          headline: `${symbol} ${direction} · Bobby verdict: ${verdict}`,
          detail: `Conviction ${conviction !== null ? conviction.toFixed(1) : '—'}/10 in a ${regime} regime.`,
        };
      },
      sourceLabel: 'Bobby market snapshot',
      freshnessLabel: 'refreshed per request',
    },
    status: 'live',
  },
  {
    slug: 'smart-money-follow',
    name: 'Smart Money Follow with Contract Filter',
    category: 'on-chain-flow',
    tagline: 'Follow on-chain flow, but never touch a contract that fails a security scan.',
    whatItIs:
      "Copy-trading a smart-money wallet is a known edge, but the edge collapses the moment you buy the whale's exit dump or a contract with hidden mint / fee logic. Bobby pairs on-chain flow discovery with an optional deeper contract audit so the trader can follow flow without eating the honeypot.",
    painWithoutBobby:
      "Mimicking a wallet on token X right as that wallet is already exiting. Or buying a contract that scans as risky the moment anyone bothers to check.",
    tools: [
      { name: 'bobby_dex_signals', role: 'Cross-chain smart money flow' },
      { name: 'bobby_xlayer_signals', role: 'Smart money on X Layer' },
      { name: 'bobby_security_scan', role: 'Optional deeper audit', paid: true },
    ],
    guardrails: ['hard_risk_gate', 'metacognition'],
    blockRatePct: 25,
    blockRateCopy: 'Flags contract risk on roughly 1 in 4 trending tokens',
    demo: {
      tool: 'bobby_dex_signals',
      inputType: 'chain',
      inputLabel: 'Chain',
      inputPlaceholder: 'Chain ID (196 = X Layer, 1 = Ethereum)',
      defaultInput: '196',
      buildArgs: (input) => ({ chain: String(input || '196'), type: 'smart_money' }),
      summarize: (result) => {
        const data = parseToolText(result);
        if (!data) return { headline: 'No parseable response', detail: '' };
        const rows = Array.isArray((data as { data?: unknown[] }).data)
          ? ((data as { data: unknown[] }).data as Array<Record<string, unknown>>)
          : [];
        if (rows.length === 0) {
          return { headline: 'No smart-money signals in the current window', detail: 'Try a different chain or check back later.' };
        }
        const top3 = rows.slice(0, 3).map((s) => {
          const token = (s.token as { symbol?: string })?.symbol || '—';
          return token;
        });
        return {
          headline: `Top flow: ${top3.join(' · ')}`,
          detail: `${rows.length} signal${rows.length === 1 ? '' : 's'} observed. Run bobby_security_scan on any contract before entering.`,
        };
      },
      sourceLabel: 'OKX OnchainOS flow feed',
      freshnessLabel: 'refreshed per request',
    },
    status: 'live',
  },
  {
    slug: 'no-trade-stand-aside',
    name: 'No-Trade / Stand Aside',
    category: 'risk-management',
    tagline: "The best trade is often no trade. Bobby's job is to tell you when to stand aside.",
    whatItIs:
      "A trader pings Bobby for a setup. Instead of forcing a verdict, Bobby returns a non-actionable response when conviction doesn't clear the threshold or the regime is inhospitable to the setup. This is the playbook that demonstrates the moat: Bobby will actively recommend that you do nothing.",
    painWithoutBobby:
      "Overtrading in chop. Forcing positions because you're watching the screen, not because the market is offering anything. This is the most expensive habit in retail trading, and the one most bots and signal services will never admit to.",
    tools: [
      { name: 'bobby_recommend', role: 'Honest non-signal when nothing is actionable' },
      { name: 'bobby_brief', role: 'Context for why no trade now' },
    ],
    guardrails: ['conviction_gate', 'yield_parking', 'circuit_breaker', 'drawdown_kill_switch'],
    blockRatePct: 55,
    blockRateCopy: "Says 'stand aside' on more than half of low-conviction prompts",
    demo: {
      tool: 'bobby_recommend',
      inputType: 'symbol',
      inputLabel: 'Symbol (optional)',
      inputPlaceholder: "Leave empty for Bobby's current pick",
      defaultInput: '',
      buildArgs: (input) => {
        const v = String(input || '').trim();
        return v ? { symbol: v.toUpperCase() } : {};
      },
      summarize: (result) => {
        const data = parseToolText(result);
        if (!data) return { headline: 'No parseable response', detail: '' };
        const recommendation = typeof data.recommendation === 'string' ? data.recommendation : '';
        if (recommendation === 'ACTIONABLE') {
          const signal = (data.signal as Record<string, unknown>) || {};
          const symbol = typeof signal.symbol === 'string' ? signal.symbol : '—';
          const conviction = typeof signal.conviction === 'number' ? signal.conviction : null;
          return {
            headline: `Bobby says yes on ${symbol}`,
            detail: `Actionable with conviction ${conviction !== null ? conviction.toFixed(1) : '—'}/10. This playbook shines more when Bobby says no — try again when the market is less clear.`,
          };
        }
        return {
          headline: 'Stand aside',
          detail: 'Bobby has no actionable signal right now. Capital preservation beats forced trades.',
        };
      },
      sourceLabel: 'Bobby live signal board',
      freshnessLabel: 'refreshed per request',
    },
    status: 'live',
  },
  {
    slug: 'wheel-b1nary-preview',
    name: 'Wheel on b1nary — Preview',
    category: 'yield',
    tagline: 'Pressure-test a covered put or call before committing collateral on b1nary.',
    whatItIs:
      "The Wheel strategy — sell a put, get assigned if spot drops below strike, then sell a call above cost basis, repeat — is mechanical. But the judgment calls that decide the outcome are which strike, which expiry, and whether to skip the leg entirely. Bobby's wheel guardrails turn those judgment calls into an explainable verdict before any collateral moves.",
    painWithoutBobby:
      "Selling puts into a regime about to gap down. Selling calls too cheap during a bull leg. Expiry windows that either give up all the theta or invite gamma blow-ups at settlement.",
    tools: [
      { name: 'bobby_wheel_evaluate', role: 'Pre-entry SELL / SKIP / WAIT gate' },
      { name: 'bobby_wheel_positions', role: 'Open-leg monitor with market context' },
    ],
    guardrails: [
      'wheel_market_breaker',
      'wheel_strike_distance',
      'wheel_expiry_window',
      'wheel_premium_floor',
      'wheel_regime_gate',
    ],
    blockRatePct: 40,
    blockRateCopy: "Roughly 2 in 5 proposed legs fail Bobby's wheel guardrails",
    demo: {
      tool: 'bobby_wheel_evaluate',
      inputType: 'wheel_leg',
      inputLabel: 'Wheel leg',
      defaultInput: { asset: 'eth', side: 'put', strike: 2200, expiry_days: 3 },
      buildArgs: (input) => {
        const leg = input as { asset?: string; side?: string; strike?: number; expiry_days?: number };
        return {
          asset: String(leg?.asset || 'eth').toLowerCase(),
          side: String(leg?.side || 'put').toLowerCase(),
          strike: Number(leg?.strike) || 0,
          expiry_days: Number(leg?.expiry_days) || 0,
        };
      },
      summarize: (result) => {
        const data = parseToolText(result);
        if (!data) return { headline: 'No parseable response', detail: '' };
        const verdict = typeof data.verdict === 'string' ? data.verdict : '—';
        const conviction = typeof data.conviction === 'number' ? data.conviction : null;
        const leg = (data.leg as Record<string, unknown>) || {};
        const ctx = (data.context as Record<string, unknown>) || {};
        const apr = typeof leg.annualized_bps === 'number' ? (leg.annualized_bps as number) / 100 : null;
        const distance = typeof leg.strike_distance_pct === 'number' ? (leg.strike_distance_pct as number) : null;
        const regime = typeof ctx.regime === 'string' ? ctx.regime : 'unknown';
        return {
          headline: `Wheel verdict: ${verdict}${conviction !== null ? ` · ${conviction}/100 conviction` : ''}`,
          detail: `APR ${apr !== null ? `${apr.toFixed(1)}%` : '—'} · strike distance ${distance !== null ? `${distance.toFixed(2)}%` : '—'} · regime ${regime}.`,
        };
      },
      sourceLabel: 'b1nary · Base (8453) · live read-only',
      freshnessLabel: 'refreshed per request',
      ctaOverride: 'Pressure-test this leg',
    },
    badge: { label: 'PREVIEW · Base (8453) live · X Layer pending', tone: 'preview' },
    status: 'preview',
  },

  // ── Arbitrage ────────────────────────────────────────────
  {
    slug: 'funding-rate-harvest',
    name: 'Funding Rate Harvest',
    category: 'arbitrage',
    tagline: "Harvest persistent positive funding without eating the underlying's drawdown.",
    whatItIs:
      "When a perp's funding rate sits persistently positive (longs paying shorts), a delta-neutral leg — short perp + long spot — collects funding while staying market-neutral. Bobby's debate filters this against carry erosion, venue-specific risk, and whether the positive funding is about to flip.",
    painWithoutBobby:
      'Entering a funding trade right before funding normalizes, or under-sizing the spot leg so a squeeze forces you out at a loss bigger than all harvested funding combined.',
    tools: [
      { name: 'bobby_brief', role: 'Spot + perp context bundle' },
      { name: 'bobby_recommend', role: "Bobby's carry-trade entry signal" },
    ],
    guardrails: ['conviction_gate', 'mandatory_stop', 'hard_risk_gate', 'metacognition', 'circuit_breaker'],
    blockRatePct: 55,
    blockRateCopy: 'Blocks over half of funding trades that look "free"',
    demo: null,
    badge: { label: 'NEW · Arbitrage', tone: 'preview' },
    status: 'live',
  },

  // ── Volatility ───────────────────────────────────────────
  {
    slug: 'volatility-crush-pre-catalyst',
    name: 'Volatility Crush Pre-Catalyst',
    category: 'volatility',
    tagline: 'Sell rich premium into a scheduled catalyst — only if the market is mispricing the move.',
    whatItIs:
      "Implied vol spikes before known catalysts (ETH upgrade, macro print, unlock). Short premium captures the crush only when IV is meaningfully above realized AND Bobby's debate agrees the market is over-pricing the move. Red Team's job here is to sharpen the gamma tail risk.",
    painWithoutBobby:
      'Selling rich vol into a genuine regime shift. The "crush" never comes; gamma runs against you; one bad print vaporizes a quarter of harvested premium.',
    tools: [
      { name: 'bobby_analyze', role: 'IV vs realized vol + term structure', paid: true },
      { name: 'bobby_judge', role: 'Independent audit of the crush thesis', paid: true },
    ],
    guardrails: ['conviction_gate', 'mandatory_stop', 'drawdown_kill_switch', 'judge_mode_6d', 'metacognition'],
    blockRatePct: 65,
    blockRateCopy: '2 in 3 "rich vol" setups fail the adversarial audit',
    demo: null,
    badge: { label: 'NEW · Volatility', tone: 'preview' },
    status: 'live',
  },

  // ── Directional ──────────────────────────────────────────
  {
    slug: 'btc-eth-ratio-rotation',
    name: 'BTC-ETH Ratio Rotation',
    category: 'directional',
    tagline: "Rotate between BTC and ETH when the ratio diverges past 2σ from its mean.",
    whatItIs:
      "When the ETH/BTC ratio stretches more than 2 standard deviations from its 90-day mean, a pair trade — long the laggard, short the leader — bets on mean reversion. Bobby's debate weighs whether the divergence is a regime shift or a reversion setup, and gates on whether dynamic conviction supports entry.",
    painWithoutBobby:
      'Shorting the "leader" right as a real regime change begins. The ratio trade converts from mean reversion to trend-following at the exact wrong time.',
    tools: [
      { name: 'bobby_brief', role: 'Ratio + regime context' },
      { name: 'bobby_recommend', role: 'Pair-trade entry signal' },
    ],
    guardrails: ['conviction_gate', 'mandatory_stop', 'hard_risk_gate', 'metacognition', 'adversarial_bounties'],
    blockRatePct: 50,
    blockRateCopy: 'Half of ratio-trade setups fail when conviction is soft',
    demo: null,
    badge: { label: 'NEW · Pair trade', tone: 'preview' },
    status: 'live',
  },

  // ── Yield ────────────────────────────────────────────────
  {
    slug: 'okb-staking-yield-park',
    name: 'OKB Staking Yield Park',
    category: 'yield',
    tagline: "Park idle cash in OKB staking — only if debate says directional edge is weaker than the yield.",
    whatItIs:
      "When the debate can't reach conviction ≥3.5 on a directional trade, Bobby can park the USDT treasury in OKB staking / structured yield on OKX Earn instead of sitting idle. Yield Parking is the third outcome alongside EXECUTE and BLOCKED.",
    painWithoutBobby:
      "Cash sitting at 0% while a clear yield venue is available — or the opposite, yield-farming into a depeg because nobody pressure-tested the protocol risk.",
    tools: [
      { name: 'bobby_brief', role: 'Yield rates + protocol risk context' },
      { name: 'bobby_recommend', role: 'Park-vs-deploy decision' },
    ],
    guardrails: ['yield_parking', 'conviction_gate', 'hard_risk_gate', 'metacognition'],
    blockRatePct: 30,
    blockRateCopy: 'Most yield parks pass — this gate is a routing decision, not a veto',
    demo: null,
    badge: { label: 'NEW · Yield', tone: 'preview' },
    status: 'live',
  },

  // ── Directional (reversal) ───────────────────────────────
  {
    slug: 'mean-reversion-overshoot',
    name: 'Mean Reversion Overshoot',
    category: 'directional',
    tagline: "Catch -3σ liquidation flushes without marrying the knife.",
    whatItIs:
      "Sharp -3σ moves on price+volume with RSI below 25 often snap back within 48h. Bobby's debate validates whether the flush was liquidation-driven (reversion setup) or news-driven (continuation risk). Red Team's job is to find a reason the reversion doesn't come.",
    painWithoutBobby:
      'Buying every -3σ wick and losing 4 times before the one that works pays for it — because there was no adversarial filter on which flushes reverse.',
    tools: [
      { name: 'bobby_brief', role: 'Price/volume/RSI context' },
      { name: 'bobby_recommend', role: 'Reversion-entry signal' },
    ],
    guardrails: ['conviction_gate', 'mandatory_stop', 'drawdown_kill_switch', 'metacognition', 'adversarial_bounties'],
    blockRatePct: 70,
    blockRateCopy: '7 in 10 "falling knife" setups get rejected',
    demo: null,
    badge: { label: 'NEW · Reversion', tone: 'preview' },
    status: 'live',
  },

  // ── Risk management ──────────────────────────────────────
  {
    slug: 'stablecoin-depeg-scanner',
    name: 'Stablecoin Depeg Scanner',
    category: 'risk-management',
    tagline: 'Block every leg that touches a depegging stable before the unwind cascades.',
    whatItIs:
      "A continuous check: if USDT or USDC mid-price on OKX drops below 0.995, Bobby hard-gates every open trade that uses that stable as quote or collateral. This isn't a trade — it's a safety net. The debate here is about confidence in the depeg signal, not about whether to act.",
    painWithoutBobby:
      "Holding yield positions collateralized in a stable that's starting to wobble — the trade P&L goes to zero before you even hear about the depeg on Twitter.",
    tools: [
      { name: 'bobby_brief', role: 'Live stable mid-price + vol signal' },
      { name: 'bobby_judge', role: 'Depeg confidence audit', paid: true },
    ],
    guardrails: ['circuit_breaker', 'drawdown_kill_switch', 'hard_risk_gate', 'metacognition', 'commit_reveal'],
    blockRatePct: 95,
    blockRateCopy: 'Near-total block rate during any stable-wobble event',
    demo: null,
    badge: { label: 'NEW · Safety net', tone: 'preview' },
    status: 'live',
  },
];
