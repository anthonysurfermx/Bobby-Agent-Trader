import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  FileCode2,
  GitBranch,
  Globe2,
  Network,
  ShieldCheck,
  TerminalSquare,
  Trophy,
} from 'lucide-react';
import settlementProof from '../../proof/settlements.json';

const GITHUB_REPO = 'https://github.com/anthonysurfermx/Bobby-Agent-Trader';
const BOUNTY_CONTRACT =
  'https://www.oklink.com/xlayer/address/0xa8005ab465a0e02cb14824cd0e7630391fba673d';
const MCP_ENDPOINT = '/api/mcp-http';
const JUDGE_MANIFEST = '/ai-judge-manifest.json';
const LIVE_TERMINAL = '/agentic-world/bobby';
const PROTOCOL_DEBATE = '/protocol#debate';

const metadata = [
  { label: 'Category', value: 'AI x DeFi / agent economy' },
  { label: 'Network', value: 'X Layer mainnet (196)' },
  { label: 'Settlement asset', value: 'OKB' },
  {
    label: 'Proof status',
    value:
      settlementProof.lastSettlement.status === 'confirmed'
        ? 'Proven X Layer settlement'
        : 'Contracts verified, settlement pending',
  },
];

const SKILL_MD = '/skill.md';
const REPUTATION_API = '/api/reputation';

const startHereActions = [
  { label: 'Open Live Terminal', href: LIVE_TERMINAL, kind: 'internal', icon: TerminalSquare },
  { label: 'Bounty Contract on OKLink', href: BOUNTY_CONTRACT, kind: 'external', icon: ShieldCheck },
  {
    label: settlementProof.lastSettlement.txHash ? 'Last Settlement TX' : 'Settlement Slot',
    href: settlementProof.lastSettlement.oklinkUrl || '#settlement',
    kind: settlementProof.lastSettlement.oklinkUrl ? 'external' : 'anchor',
    icon: Network,
  },
];

const integrationActions = [
  { label: 'MCP Endpoint', href: MCP_ENDPOINT, kind: 'external', icon: Globe2 },
  { label: 'Agent SKILL.MD', href: SKILL_MD, kind: 'external', icon: FileCode2 },
  { label: 'Reputation API', href: REPUTATION_API, kind: 'external', icon: ShieldCheck },
  { label: 'Agent Console', href: '/protocol/console', kind: 'internal', icon: TerminalSquare },
];

const deepDiveActions = [
  { label: 'GitHub Repository', href: GITHUB_REPO, kind: 'external', icon: GitBranch },
  { label: 'Protocol Heartbeat', href: '/protocol/heartbeat', kind: 'internal', icon: Network },
  { label: 'Harness Console', href: '/protocol/harness', kind: 'internal', icon: ShieldCheck },
  { label: 'Plugin Store PR', href: 'https://github.com/okx/plugin-store/pull/161', kind: 'external', icon: Trophy },
];

const judgeRows = [
  // Tier 1: on-chain proof (what a judge validates first)
  {
    label: 'Adversarial bounty contract verified',
    href: BOUNTY_CONTRACT,
    kind: 'external',
    status: 'check live',
  },
  { label: 'Live terminal', href: LIVE_TERMINAL, kind: 'internal', status: 'check live' },
  {
    label: 'x402 MCP payment on-chain',
    href: settlementProof.lastSettlement.oklinkUrl || '#settlement',
    kind: settlementProof.lastSettlement.oklinkUrl ? 'external' : 'anchor',
    status:
      settlementProof.lastSettlement.status === 'confirmed'
        ? 'check live'
        : 'awaiting first settlement',
  },
  {
    label: '3-agent debate streaming',
    href: PROTOCOL_DEBATE,
    kind: 'internal',
    status: 'check live',
  },
  {
    label: 'Protocol Heartbeat dashboard (real-time health)',
    href: '/protocol/heartbeat',
    kind: 'internal',
    status: 'check live',
  },
  { label: 'Public GitHub', href: GITHUB_REPO, kind: 'external', status: 'check live' },
  // Tier 2: agent integration surface
  {
    label: 'Agent SKILL.MD integration file',
    href: SKILL_MD,
    kind: 'api',
    status: 'check live',
  },
  {
    label: 'MCP Streamable HTTP working',
    href: MCP_ENDPOINT,
    kind: 'api',
    status: 'check live',
  },
  {
    label: 'Judge Mode manifest',
    href: JUDGE_MANIFEST,
    kind: 'api',
    status: 'check live',
  },
  {
    label: 'On-chain reputation API',
    href: REPUTATION_API,
    kind: 'api',
    status: 'check live',
  },
  {
    label: 'Sentinel agent demo (agent-to-agent MCP)',
    href: '/api/sentinel-demo',
    kind: 'api',
    status: 'check live',
  },
  // Tier 3: supporting APIs
  {
    label: 'Agent registry (machine-readable catalog)',
    href: '/api/registry',
    kind: 'api',
    status: 'check live',
  },
  {
    label: 'Live activity feed',
    href: '/api/activity',
    kind: 'api',
    status: 'check live',
  },
  {
    label: 'Smart money leaderboard (OKX OnchainOS)',
    href: '/api/smart-money-leaderboard?chains=196,1&tokens=OKB,ETH&limit=5',
    kind: 'api',
    status: 'check live',
  },
  {
    label: 'Conviction-tier stratified performance',
    href: '/api/conviction-tiers',
    kind: 'api',
    status: 'check live',
  },
];

function Panel({
  title,
  kicker,
  children,
  className = '',
}: {
  title?: string;
  kicker?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[24px] border border-white/10 bg-white/[0.03] p-5 md:p-6 ${className}`}
      style={{ backdropFilter: 'blur(16px)' }}
    >
      {kicker && (
        <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.28em] text-[#8CFFB4]/75">
          {kicker}
        </div>
      )}
      {title && <h2 className="text-xl font-bold text-white md:text-2xl">{title}</h2>}
      {children}
    </section>
  );
}

function ActionLink({
  label,
  href,
  kind,
  icon: Icon,
}: {
  label: string;
  href: string;
  kind: 'internal' | 'external' | 'anchor';
  icon: React.ElementType;
}) {
  const baseClass =
    'flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/80 transition hover:border-[#8CFFB4]/35 hover:text-white';

  if (kind === 'internal') {
    return (
      <Link to={href} className={baseClass}>
        <span className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-[#8CFFB4]" />
          {label}
        </span>
        <ExternalLink className="h-4 w-4 text-[#8CFFB4]" />
      </Link>
    );
  }

  return (
    <a
      href={href}
      target={kind === 'external' ? '_blank' : undefined}
      rel={kind === 'external' ? 'noreferrer' : undefined}
      className={baseClass}
    >
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[#8CFFB4]" />
        {label}
      </span>
      <ExternalLink className="h-4 w-4 text-[#8CFFB4]" />
    </a>
  );
}

function JudgeLink({
  label,
  href,
  kind,
  status,
}: {
  label: string;
  href: string;
  kind: 'internal' | 'external' | 'anchor' | 'api';
  status: string;
}) {
  const statusClass =
    status === 'check live'
      ? 'border-[#8CFFB4]/25 bg-[#8CFFB4]/10 text-[#8CFFB4]'
      : 'border-amber-300/20 bg-amber-300/10 text-amber-200';

  const content = (
    <>
      <div className="flex items-center gap-3">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-[#8CFFB4]" />
        <span className="text-sm leading-6 text-white/80">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className={`rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] ${statusClass}`}>
          {status}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">open</span>
      </div>
    </>
  );

  const cls =
    'flex items-center justify-between gap-4 rounded-2xl border border-white/8 bg-black/20 px-4 py-3 transition hover:border-[#8CFFB4]/30';

  // React Router links for SPA pages
  if (kind === 'internal') {
    return (
      <Link to={href} className={cls}>
        {content}
      </Link>
    );
  }

  // API endpoints and external links open in new tab
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cls}
    >
      {content}
    </a>
  );
}

export default function BobbySubmissionPage() {
  const settlement = settlementProof.lastSettlement;
  const hasSettlement = Boolean(settlement.txHash);

  return (
    <>
      <Helmet>
        <title>Bobby Protocol - Build X Season 2 Submission</title>
        <meta
          name="description"
          content="Reviewer surface for Bobby Protocol: live links, judge checklist, X Layer proof status, and settlement evidence."
        />
      </Helmet>

      <div className="min-h-screen bg-[#050505] text-white">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-20 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-[#8CFFB4]/8 blur-[140px]" />
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(140,255,180,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(140,255,180,0.22) 1px, transparent 1px)',
              backgroundSize: '30px 30px',
            }}
          />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-10">
          <header className="mb-6 flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#8CFFB4]/20 bg-[#8CFFB4]/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.24em] text-[#8CFFB4]">
                <Trophy className="h-3.5 w-3.5" />
                Build X Season 2
              </div>
              <h1 className="max-w-4xl font-['Space_Grotesk'] text-4xl font-bold leading-tight md:text-6xl">
                Bobby Protocol - Build X Season 2 Submission
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-white/65 md:text-lg">
                Bobby is the pressure-test layer for AI-driven financial decisions. Describe a trade or a vault leg,
                three agents debate it, a Judge Mode audits the debate, 11 guardrails run fail-closed, and every verdict
                lands on X Layer via commit-reveal. This page is the 60-second review surface for judges.
              </p>
              <Link
                to="/"
                className="mt-4 inline-flex items-center gap-2 font-mono text-xs text-[#8CFFB4]/60 hover:text-[#8CFFB4] transition-colors"
              >
                ← Back to Protocol Landing
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[#8CFFB4]/20 bg-[#8CFFB4]/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#8CFFB4]">
                Contracts verified on OKLink
              </span>
              <span
                className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] ${
                  hasSettlement
                    ? 'border-[#8CFFB4]/20 bg-[#8CFFB4]/10 text-[#8CFFB4]'
                    : 'border-amber-300/20 bg-amber-300/10 text-amber-200'
                }`}
              >
                {hasSettlement ? 'Proven onchain' : 'Settlement pending'}
              </span>
            </div>
          </header>

          <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <Panel kicker="Reviewer console">
              <div className="mb-4 rounded-2xl border border-[#8CFFB4]/20 bg-[#8CFFB4]/[0.04] p-4">
                <p className="text-sm leading-6 text-white/75">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8CFFB4]">60-second path →</span>{' '}
                  Open the 3 links below in order. They prove the protocol is live, verified on X Layer, and settling MCP payments on-chain.
                </p>
              </div>

              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[#8CFFB4]/80">Start here · live proof</div>
              <div className="grid gap-3 md:grid-cols-3">
                {startHereActions.map((action) => (
                  <ActionLink key={action.label} {...action} />
                ))}
              </div>

              <div className="mt-5 mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">Integration surface · for agent builders</div>
              <div className="grid gap-3 md:grid-cols-2">
                {integrationActions.map((action) => (
                  <ActionLink key={action.label} {...action} />
                ))}
              </div>

              <div className="mt-5 mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">Deep dive · source + health</div>
              <div className="grid gap-3 md:grid-cols-2">
                {deepDiveActions.map((action) => (
                  <ActionLink key={action.label} {...action} />
                ))}
              </div>
            </Panel>

            <Panel kicker="Metadata">
              <div className="grid gap-3 sm:grid-cols-2">
                {metadata.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                    <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">{item.label}</div>
                    <div className="mt-2 text-sm font-medium leading-6 text-white/80">{item.value}</div>
                  </div>
                ))}
              </div>
            </Panel>
          </section>

          <section className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <Panel title="Judging Surface" kicker="Everything clickable">
              <div className="mt-4 space-y-3">
                {judgeRows.map((row) => (
                  <JudgeLink key={row.label} {...row} />
                ))}
              </div>
            </Panel>

            <Panel title="Proven X Layer Settlement" kicker="Mainnet proof" className="scroll-mt-20" >
              <div id="settlement" className="mt-4 rounded-[20px] border border-white/10 bg-black/25 p-4">
                {hasSettlement ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-white/8 p-3">
                        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">Task ID</div>
                        <div className="mt-2 font-mono text-sm text-white/80">{settlement.taskId}</div>
                      </div>
                      <div className="rounded-xl border border-white/8 p-3">
                        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">Amount</div>
                        <div className="mt-2 font-mono text-sm text-white/80">{settlement.amountOkb} OKB</div>
                      </div>
                      <div className="rounded-xl border border-white/8 p-3">
                        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">Chain ID</div>
                        <div className="mt-2 font-mono text-sm text-white/80">{settlement.chainId}</div>
                      </div>
                      <div className="rounded-xl border border-white/8 p-3">
                        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">Timestamp</div>
                        <div className="mt-2 font-mono text-sm text-white/80">{settlement.timestamp}</div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#8CFFB4]/20 bg-[#8CFFB4]/8 p-3">
                      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8CFFB4]/80">Tx hash</div>
                      <div className="mt-2 break-all font-mono text-xs leading-6 text-[#8CFFB4]">{settlement.txHash}</div>
                    </div>
                    <a
                      href={settlement.oklinkUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl bg-[#C1FF2C] px-4 py-2 text-sm font-semibold text-[#162400] transition hover:opacity-90"
                    >
                      View on OKLink
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                ) : (
                  <div className="rounded-[20px] border border-dashed border-[#8CFFB4]/25 bg-[#8CFFB4]/6 p-5">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <CircleDashed className="h-4 w-4 text-[#8CFFB4]" />
                      Awaiting first settlement
                    </div>
                    <p className="mt-3 text-sm leading-6 text-white/60">
                      The reviewer slot is wired. Once the first paid `bobby_analyze` call settles on X Layer, update
                      `proof/settlements.json` and this panel becomes the onchain trophy.
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-white/8 p-3">
                        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">Tool</div>
                        <div className="mt-2 font-mono text-sm text-white/80">{settlement.tool}</div>
                      </div>
                      <div className="rounded-xl border border-white/8 p-3">
                        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">Amount</div>
                        <div className="mt-2 font-mono text-sm text-white/80">{settlement.amountOkb} OKB</div>
                      </div>
                      <div className="rounded-xl border border-white/8 p-3">
                        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">Chain ID</div>
                        <div className="mt-2 font-mono text-sm text-white/80">{settlement.chainId}</div>
                      </div>
                      <div className="rounded-xl border border-white/8 p-3">
                        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">Status</div>
                        <div className="mt-2 font-mono text-sm text-amber-200">{settlement.timestamp}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Panel>
          </section>

          <section className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <Panel title="Why This Matters" kicker="The pressure-test layer">
              <div className="mt-4 space-y-3">
                {[
                  'A trader describes a trade ("long BTC at 68k, 3x, stop -5%"). Three agents debate it — Alpha Hunter argues the case, Red Team attacks it, CIO allocates. Judge Mode audits the debate on six dimensions. Bobby returns EXECUTE, SKIP, or WAIT with reasoning that any reviewer can audit.',
                  'An AI agent hits the MCP endpoint with the same question. Pays 0.001 OKB via x402. Gets the same verdict, on-chain, with a commit-reveal hash written before the outcome is known. No prompt trick — a settlement.',
                  '11 guardrails run fail-closed in production. No consensus → no trade. No stop loss → no trade. 3 losses → circuit breaker. 20% drawdown → all trading halted. The harness protects capital first, generates alpha second.',
                  'Anyone can challenge Bobby by staking OKB in the adversarial bounty contract. If Bobby is wrong, the challenger wins the stake and it becomes part of Bobby\'s on-chain record. Trust is earned in mainnet, not configured in a pitch.',
                ].map((item) => (
                  <div key={item} className="rounded-2xl border border-white/8 bg-black/20 p-4 text-sm leading-6 text-white/72">
                    {item}
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Proof Inventory" kicker="Repo evidence">
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {[
                  'README documents the 3-agent debate, Judge Mode, MCP tools, X Layer contracts, and bounty loop.',
                  'ai-judge-manifest.json exists and is linked directly from this page.',
                  'api/mcp-http.ts exposes bobby_judge plus the new bounty tools.',
                  'contracts/verify/OKLINK_VERIFY.md records the manual verification path for BobbyAdversarialBounties.',
                ].map((item) => (
                  <div key={item} className="rounded-2xl border border-white/8 bg-black/20 p-4 text-sm leading-6 text-white/72">
                    <div className="flex items-start gap-3">
                      <FileCode2 className="mt-0.5 h-4 w-4 shrink-0 text-[#8CFFB4]" />
                      <span>{item}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </section>

          <section className="mt-4">
            <Panel title="11 Guardrails — Fail-Closed" kicker="Trust infrastructure">
              <p className="mt-2 text-sm text-white/50 leading-relaxed">
                Bobby is fail-closed. No consensus → no trade. No stop loss → no trade. 3 losses → circuit breaker. Every guardrail runs in production — not documentation.
              </p>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {[
                  { label: 'Conviction Gate', desc: 'No trade below 3.5/10 after adversarial debate' },
                  { label: 'Mandatory Stop Loss', desc: 'Every position requires exit plan; 3% default enforced' },
                  { label: 'Circuit Breaker', desc: '3 consecutive losses → Red Team max aggression' },
                  { label: 'Drawdown Kill Switch', desc: '20% drawdown → all trading halted' },
                  { label: 'Hard Risk Gate', desc: '$50/trade, 30% max concentration, 5 max positions' },
                  { label: 'Metacognition', desc: 'Auto-calibrates conviction when overconfident' },
                  { label: 'Commit-Reveal', desc: 'Predictions on-chain BEFORE outcome is known' },
                  { label: 'Judge Mode (6D)', desc: '6-dimension audit + 6 bias types detected' },
                  { label: 'Adversarial Bounties', desc: 'Stake OKB to prove Bobby wrong on-chain' },
                  { label: 'Yield Parking', desc: 'Low conviction → debates de-risk into stables' },
                  { label: 'EIP-191 Auth', desc: 'Signed proof required for every mutation' },
                ].map((g) => (
                  <div key={g.label} className="flex items-start gap-3 rounded-xl border border-white/8 bg-black/20 p-3">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#ff716a]" />
                    <div>
                      <span className="text-xs font-bold text-white uppercase tracking-wide">{g.label}</span>
                      <p className="text-[11px] text-white/50 leading-relaxed mt-0.5">{g.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-[#ff716a]/20 bg-[#ff716a]/[0.04] p-4">
                <p className="text-xs text-[#ff716a] font-mono uppercase tracking-widest mb-1">Fail-Closed Philosophy</p>
                <p className="text-sm text-white/60 leading-relaxed">
                  Debate doesn't converge? <strong className="text-white">Blocked.</strong> Judge can't verify? <strong className="text-white">Blocked.</strong> Drawdown exceeded? <strong className="text-white">All trading halted.</strong> The harness protects capital first, generates alpha second.
                </p>
              </div>
            </Panel>
          </section>

          <section className="mt-4">
            <Panel title="Ecosystem Integration — b1nary" kicker="Pressure-test layer for vault protocols">
              <p className="mt-2 text-sm text-white/60 leading-relaxed">
                Bobby doesn't replace execution venues — it sits in front of them. <a href="https://www.b1nary.app" target="_blank" rel="noopener noreferrer" className="text-[#8CFFB4] underline decoration-[#8CFFB4]/40 underline-offset-2">b1nary</a> is the first concrete example: an options protocol where agents sell covered puts and calls to earn premium. Every Wheel-strategy leg is a judgment call (which strike, which expiry, whether to skip). Bobby turns that judgment into an explainable verdict.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8CFFB4] mb-2">MCP tool · free</div>
                  <code className="text-sm text-white">bobby_wheel_evaluate</code>
                  <p className="mt-2 text-xs leading-relaxed text-white/60">
                    Pulls a live b1nary quote, applies 5 wheel guardrails (strike distance, expiry window, annualized yield floor, regime gate, market breaker) and returns SELL / SKIP / WAIT with reasoning. Every verdict logs to <code className="text-[#8CFFB4]">agent_events</code> as <code className="text-[#8CFFB4]">wheel_verdict</code>.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8CFFB4] mb-2">MCP tool · free</div>
                  <code className="text-sm text-white">bobby_wheel_positions</code>
                  <p className="mt-2 text-xs leading-relaxed text-white/60">
                    Read-only snapshot of a wallet's b1nary positions. Pair with <code className="text-[#8CFFB4]">bobby_wheel_evaluate</code> to monitor open legs against Bobby's current regime read.
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[0.04] p-4">
                <p className="text-xs text-amber-200 font-mono uppercase tracking-widest mb-1">Chain note</p>
                <p className="text-sm text-white/60 leading-relaxed">
                  Live read-only integration against b1nary on <strong className="text-white">Base (8453)</strong> today. X Layer execution path is pending b1nary's deployment on chain 196 — verdict logic, guardrails, and event schema are deployment-ready. Every response surfaces <code className="text-[#8CFFB4]">deployment_status: base_live_xlayer_pending</code> so reviewers and agents never confuse source of truth.
                </p>
              </div>
            </Panel>
          </section>

          <section className="mt-4">
            <Panel title="OnchainOS APIs Used" kicker="OKX OnchainOS integration">
              <div className="mt-4 space-y-3">
                {[
                  { path: '/api/v6/dex/market/signal/list', usage: 'Smart money signals — pre-debate intelligence fed to Alpha Hunter agent' },
                  { path: '/api/v6/dex/aggregator/quote', usage: 'DEX aggregator quotes — trade execution after debate consensus' },
                  { path: '/api/v5/dex/security/token-scan', usage: 'Token security scanning — bobby_security_scan MCP tool' },
                  { path: '/api/v5/aigc/mcp/indicators', usage: 'Technical indicators — bobby_ta MCP tool for chart analysis' },
                  { path: '/api/v5/dex/market/wallet-pnl', usage: 'Wallet PnL analysis — smart money leaderboard ranking' },
                  { path: '/api/v5/dex/market/top-traders', usage: 'Top traders — smart money leaderboard discovery' },
                ].map((api) => (
                  <div key={api.path} className="flex flex-col gap-1 rounded-2xl border border-white/8 bg-black/20 p-4 sm:flex-row sm:items-center sm:gap-4">
                    <code className="shrink-0 rounded-lg border border-[#8CFFB4]/20 bg-[#8CFFB4]/8 px-3 py-1 font-mono text-xs text-[#8CFFB4]">
                      {api.path}
                    </code>
                    <span className="text-sm leading-6 text-white/72">{api.usage}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </section>
        </div>
      </div>
    </>
  );
}
