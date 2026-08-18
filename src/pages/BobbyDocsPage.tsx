// ============================================================
// Bobby AI Docs — Integration portal for AI agents & developers
// okx.ai-inspired dark design, Base blue accent
// ============================================================

import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import {
  Copy, Check, ExternalLink, Terminal, Cpu, Zap, Shield,
  ChevronRight, Search, ShoppingCart, Globe, BarChart3,
  AlertTriangle, Wallet, MessageSquare, TrendingUp, Lock, Eye
} from 'lucide-react';
import KineticShell from '@/components/kinetic/KineticShell';

// --------------- Shared Components ---------------

function CopyBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group">
      {label && (
        <div className="font-mono text-[10px] text-white/40 tracking-[0.15em] uppercase mb-2">
          {label}
        </div>
      )}
      <div
        className="bg-black/60 border border-white/10 rounded-xl p-4 font-mono text-[11px] text-[#7da6ff] overflow-x-auto whitespace-pre leading-relaxed"
        style={{ backdropFilter: 'blur(12px)' }}
      >
        {code}
      </div>
      <button
        onClick={() => {
          navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="absolute top-2 right-2 p-1.5 bg-white/10 hover:bg-white/20 rounded-lg border border-white/15 backdrop-blur transition-all opacity-0 group-hover:opacity-100"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-[#7da6ff]" /> : <Copy className="w-3.5 h-3.5 text-white/50" />}
      </button>
    </div>
  );
}

function GlassCard({
  children,
  className = '',
  glow = false,
  accentBorder = false,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  accentBorder?: boolean;
}) {
  return (
    <div
      className={`
        bg-white/[0.04] border rounded-2xl
        ${accentBorder ? 'border-[#0052ff]/40 hover:border-[#0052ff]/70' : 'border-white/10'}
        ${className}
      `}
      style={{
        backdropFilter: 'blur(12px)',
        ...(glow ? { boxShadow: '0 20px 60px rgba(0,82,255,0.18)' } : {}),
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ icon: Icon, label, right }: { icon: React.ElementType; label: string; right?: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-6">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#0052ff]/20 text-[#7da6ff]">
        <Icon className="w-3.5 h-3.5" />
      </span>
      <span className="font-mono text-xs font-bold text-[#7da6ff] tracking-[0.15em] uppercase">{label}</span>
      {right && <span className="font-mono text-[10px] text-white/35 ml-auto tracking-[0.15em] uppercase">{right}</span>}
    </div>
  );
}

function Badge({ type }: { type: 'free' | 'x402' }) {
  return type === 'free' ? (
    <span className="font-mono text-[9px] px-2 py-0.5 rounded-full bg-[#0052ff]/20 text-[#7da6ff] border border-[#0052ff]/40 tracking-[0.15em]">
      FREE
    </span>
  ) : (
    <span className="font-mono text-[9px] px-2 py-0.5 rounded-full bg-[#ffb95f]/10 text-[#ffb95f] border border-[#ffb95f]/20 tracking-[0.15em]">
      x402
    </span>
  );
}

// --------------- Data ---------------

const CONTRACTS = [
  { name: 'BobbyTrackRecord', addr: '0xf841b428e6d743187d7be2242eccc1078fde2395', desc: 'Commit-reveal predictions', purpose: 'Immutable on-chain prediction history' },
  { name: 'BobbyConvictionOracle', addr: '0x03fa39b3a5b316b7cacdabd3442577ee32ab5f3a', desc: 'Conviction feed for protocols', purpose: 'Real-time conviction data feed' },
  { name: 'BobbyAgentEconomy', addr: '0xD9540D770C8aF67e9E6412C92D78E34bc11ED871', desc: 'Agent-to-agent payments', purpose: 'x402 payment settlement' },
  { name: 'BobbyAgentRegistry', addr: '0x823a1670f521a35d4fafe4502bdcb3a8148bba8b', desc: 'Agent Identity NFTs', purpose: 'On-chain agent identity layer' },
];

const TOOL_ICONS: Record<string, React.ElementType> = {
  bobby_stats: BarChart3,
  bobby_ta: TrendingUp,
  bobby_intel: Eye,
  bobby_dex_trending: Zap,
  bobby_dex_signals: MessageSquare,
  bobby_xlayer_signals: Globe,
  bobby_analyze: Cpu,
  bobby_debate: MessageSquare,
  bobby_security_scan: AlertTriangle,
  bobby_wallet_portfolio: Wallet,
  bobby_asset_search: Search,
  bobby_conviction_oracle: Lock,
};

const FREE_TOOLS = [
  { name: 'bobby_stats', desc: 'Track record, win rate, PnL — live performance metrics' },
  { name: 'bobby_ta', desc: 'Technical analysis with RSI, MACD, Bollinger Bands, SuperTrend' },
  { name: 'bobby_intel', desc: 'Full 12-source intelligence briefing in 10 seconds' },
  { name: 'bobby_dex_trending', desc: 'Trending tokens on-chain across DEXs' },
  { name: 'bobby_dex_signals', desc: 'Whale and KOL buy/sell signals' },
  { name: 'bobby_xlayer_signals', desc: 'Smart money movements across Base markets' },
];

const PREMIUM_TOOLS = [
  { name: 'bobby_analyze', desc: 'Full multi-source market analysis with AI synthesis' },
  { name: 'bobby_debate', desc: '3-agent adversarial debate (Alpha Hunter vs Red Team vs CIO)' },
  { name: 'bobby_security_scan', desc: 'Token contract safety audit and risk scoring' },
  { name: 'bobby_wallet_portfolio', desc: 'Multi-chain portfolio breakdown and analysis' },
];

const UTILITY_TOOLS = [
  { name: 'bobby_asset_search', desc: 'Universal search: crypto, stocks, commodities, forex' },
  { name: 'bobby_conviction_oracle', desc: 'Read on-chain conviction data from Solidity' },
];

// --------------- Animation Variants ---------------

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: 'easeOut' },
  }),
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const cardItem = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

// --------------- Tool Card ---------------

function ToolCard({ name, desc, free }: { name: string; desc: string; free: boolean }) {
  const Icon = TOOL_ICONS[name] || Cpu;
  return (
    <motion.div variants={cardItem}>
      <GlassCard className="p-4 hover:border-[#0052ff]/50 hover:bg-white/[0.07] transition-all group cursor-default">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0 mt-0.5">
            <Icon className="w-4 h-4 text-white/50 group-hover:text-[#7da6ff] transition-colors" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <Badge type={free ? 'free' : 'x402'} />
              <span className="font-mono text-xs text-white/85 font-bold truncate">{name}</span>
            </div>
            <p className="text-xs text-white/60 leading-6">{desc}</p>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-white/15 group-hover:text-[#7da6ff] transition-colors shrink-0 mt-1" />
        </div>
      </GlassCard>
    </motion.div>
  );
}

// --------------- Page ---------------

export default function BobbyDocsPage() {
  let sectionIndex = 0;

  return (
    <KineticShell activeTab="docs" minimalNav>
      <Helmet><title>AI Docs | Bobby Agent Trader</title></Helmet>

      <div className="min-h-screen bg-[#050505] pb-20 md:pb-8">
        <div className="max-w-5xl mx-auto px-4 py-10 space-y-12 md:py-14 md:space-y-14">

          {/* ===== 1. HEADER ===== */}
          <motion.div
            custom={sectionIndex++}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="text-center pt-4"
          >
            <div className="font-mono text-[10px] font-bold text-[#7da6ff] tracking-[0.22em] uppercase mb-4">
              Bobby Agent Trader / AI Docs
            </div>
            <h1 className="text-white text-3xl md:text-5xl font-extrabold tracking-[-0.07em] leading-[1.02] mb-4">
              Connect your AI agent to Bobby in one command
            </h1>
            <p className="text-sm md:text-base leading-7 text-white/60 max-w-xl mx-auto">
              Base-first agent infrastructure, 12 MCP tools, 70+ technical indicators, x402 payments
            </p>
          </motion.div>

          {/* ===== 2. HERO — INSTANT INTEGRATION ===== */}
          <motion.div custom={sectionIndex++} variants={fadeUp} initial="hidden" animate="visible">
            <GlassCard glow accentBorder className="p-6 md:p-8">
              <SectionLabel icon={Zap} label="Instant integration" />

              <p className="text-sm leading-7 text-white/60 mb-5">
                Add Bobby to any MCP-compatible AI in one command:
              </p>

              {/* Primary code block */}
              <div
                className="relative bg-black/60 border border-white/10 rounded-xl p-5 md:p-6 mb-6"
                style={{ boxShadow: '0 20px 60px rgba(0,82,255,0.14)' }}
              >
                <div className="font-mono text-[10px] text-white/40 tracking-[0.15em] uppercase mb-2.5">$ Terminal</div>
                <div className="font-mono text-sm md:text-base text-[#7da6ff] break-all leading-relaxed">
                  claude mcp add bobby-trader https://bobbyprotocol.xyz/api/mcp-bobby
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText('claude mcp add bobby-trader https://bobbyprotocol.xyz/api/mcp-bobby');
                  }}
                  className="absolute top-3 right-3 p-2 bg-white/10 hover:bg-white/20 rounded-lg border border-white/15 backdrop-blur transition-all"
                >
                  <Copy className="w-4 h-4 text-white/50 hover:text-white/80" />
                </button>
              </div>

              {/* llms.txt */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mb-5">
                <span className="text-sm leading-7 text-white/60">Or give this URL to any AI:</span>
                <a
                  href="https://bobbyprotocol.xyz/llms.txt"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[11px] text-[#7da6ff] hover:text-white underline underline-offset-2 decoration-[#0052ff]/50 transition-colors"
                >
                  https://bobbyprotocol.xyz/llms.txt
                  <ExternalLink className="w-3 h-3 inline ml-1 -mt-0.5" />
                </a>
              </div>

              {/* Compatible AIs */}
              <div className="flex flex-wrap gap-2">
                {['Claude Code', 'ChatGPT', 'Gemini', 'Cursor', 'Copilot', 'Codex'].map(ai => (
                  <span
                    key={ai}
                    className="font-mono text-[10px] text-white/50 tracking-[0.15em] px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.06]"
                  >
                    {ai.toUpperCase()}
                  </span>
                ))}
              </div>
            </GlassCard>
          </motion.div>

          {/* ===== 3. MCP TOOLS GRID ===== */}
          <motion.div custom={sectionIndex++} variants={fadeUp} initial="hidden" animate="visible">
            <GlassCard className="p-6 md:p-8">
              <SectionLabel icon={Cpu} label="12 MCP tools" right="24 active endpoints" />

              {/* Free Tools */}
              <div className="font-mono text-[10px] text-[#7da6ff] tracking-[0.18em] uppercase mb-3">
                Free tools ({FREE_TOOLS.length})
              </div>
              <motion.div
                variants={stagger}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-6"
              >
                {FREE_TOOLS.map(t => (
                  <ToolCard key={t.name} name={t.name} desc={t.desc} free />
                ))}
              </motion.div>

              {/* Premium Tools */}
              <div className="font-mono text-[10px] text-[#ffb95f]/70 tracking-[0.18em] uppercase mb-3">
                Premium tools ({PREMIUM_TOOLS.length})
              </div>
              <motion.div
                variants={stagger}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-6"
              >
                {PREMIUM_TOOLS.map(t => (
                  <ToolCard key={t.name} name={t.name} desc={t.desc} free={false} />
                ))}
              </motion.div>

              {/* Utility */}
              <div className="font-mono text-[10px] text-white/40 tracking-[0.18em] uppercase mb-3">
                Utility ({UTILITY_TOOLS.length})
              </div>
              <motion.div
                variants={stagger}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className="grid grid-cols-1 md:grid-cols-2 gap-2.5"
              >
                {UTILITY_TOOLS.map(t => (
                  <ToolCard key={t.name} name={t.name} desc={t.desc} free />
                ))}
              </motion.div>
            </GlassCard>
          </motion.div>

          {/* ===== 3.5 PROOF ENGINE — V2 LIFECYCLE ===== */}
          <motion.div custom={sectionIndex++} variants={fadeUp} initial="hidden" animate="visible">
            <GlassCard glow accentBorder className="p-6 md:p-8">
              <SectionLabel icon={Eye} label="Proof engine — TrackRecord V2" right="Base Sepolia · release candidate" />

              <p className="text-sm leading-7 text-white/60 mb-2 max-w-2xl">
                Agents promise. Bobby proves. Every VERIFIED prediction is committed{' '}
                <span className="text-white/85 font-semibold">before the outcome exists</span> and both its entry
                and exit prices are proven with signed Pyth oracle updates — never self-reported. Anyone can
                challenge an ignored stop. Nothing can be backdated, cherry-picked or deleted.
              </p>
              <p className="font-mono text-[10px] text-white/35 tracking-[0.15em] uppercase mb-7">
                Hardened through 5 adversarial audit rounds · 4 P1s found &amp; closed
              </p>

              {/* The three phases of temporal custody */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-7">
                <GlassCard className="p-5">
                  <div className="font-mono text-[10px] text-[#7da6ff] tracking-[0.15em] uppercase mb-2">Phase 1 · Anchor</div>
                  <div className="font-mono text-[12px] text-white/85 font-bold mb-2">The anchor is fixed before its price exists</div>
                  <p className="text-xs text-white/60 leading-6">
                    <code className="text-[#7da6ff]">announceCommit</code> locks a future instant on-chain
                    (announcement + 10s). Its price tick doesn&apos;t exist yet — so it cannot be known, shopped
                    or backdated. The commit must then carry the <em>first</em> signed tick at/after that exact
                    instant, enforced by Pyth&apos;s unique-parse rule.
                  </p>
                </GlassCard>
                <GlassCard className="p-5">
                  <div className="font-mono text-[10px] text-[#7da6ff] tracking-[0.15em] uppercase mb-2">Phase 2 · Watch</div>
                  <div className="font-mono text-[12px] text-white/85 font-bold mb-2">Anyone can enforce the stop</div>
                  <p className="text-xs text-white/60 leading-6">
                    While the trade lives, <code className="text-[#7da6ff]">challengeStopBreach</code> is
                    permissionless: present one signed tick that crossed the committed stop and the trade is
                    reclassified to LOSS — irreversibly, with oracle-derived PnL. Hiding a stop-out is not an option.
                  </p>
                </GlassCard>
                <GlassCard className="p-5">
                  <div className="font-mono text-[10px] text-[#7da6ff] tracking-[0.15em] uppercase mb-2">Phase 3 · Prove the exit</div>
                  <div className="font-mono text-[12px] text-white/85 font-bold mb-2">Outcome derives from the oracle</div>
                  <p className="text-xs text-white/60 leading-6">
                    <code className="text-[#7da6ff]">resolveTrade</code> proves the declared exit instant with a
                    signed benchmark update. WIN/LOSS is classified oracle-vs-oracle — the reported price is only
                    tolerated within ±1%. Unresolved trades expire publicly into the coverage ratio.
                  </p>
                </GlassCard>
              </div>

              {/* Split ledgers + guarantees */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-7">
                <GlassCard className="p-5">
                  <div className="font-mono text-[11px] text-white/85 font-bold mb-2 tracking-[-0.01em]">Two ledgers, never blended</div>
                  <p className="text-xs text-white/60 leading-6">
                    <span className="text-[#7da6ff] font-semibold">VERIFIED</span> (BTC · ETH · SOL): entry and
                    exit proven by Pyth — the strong claim.{' '}
                    <span className="text-white/75 font-semibold">ATTESTED</span> (everything else):
                    self-reported, clearly labeled. There is deliberately no combined win rate — that would be
                    lying with averages. The scorecard also publishes resolution coverage: how many promises
                    actually closed.
                  </p>
                </GlassCard>
                <GlassCard className="p-5">
                  <div className="font-mono text-[11px] text-white/85 font-bold mb-2 tracking-[-0.01em]">Why cheating reverts</div>
                  <ul className="text-xs text-white/60 leading-6 space-y-1 list-none m-0 p-0">
                    <li><span className="text-[#ff716a] font-mono text-[10px]">×</span> Anchor in the observed past → <code className="text-[#7da6ff]">EntryAnchorMismatch</code></li>
                    <li><span className="text-[#ff716a] font-mono text-[10px]">×</span> Tick predating the announcement → unique-parse reject</li>
                    <li><span className="text-[#ff716a] font-mono text-[10px]">×</span> A later, nicer tick in the window → unique-parse reject</li>
                    <li><span className="text-[#ff716a] font-mono text-[10px]">×</span> Aged announcement → <code className="text-[#7da6ff]">EntryTooStale</code></li>
                    <li><span className="text-[#ff716a] font-mono text-[10px]">×</span> Same-block announce+commit → <code className="text-[#7da6ff]">EntryInFuture</code></li>
                  </ul>
                </GlassCard>
              </div>

              {/* Live release candidate */}
              <a
                href="https://sepolia.basescan.org/address/0x4bfEF46d920fd67C68046901f591Fad0a2F7cadC"
                target="_blank"
                rel="noopener noreferrer"
                className="block group"
              >
                <GlassCard accentBorder className="p-5 hover:bg-white/[0.07] transition-all">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div>
                      <div className="font-mono text-[11px] text-white/85 font-bold tracking-[-0.01em]">BobbyTrackRecordV2</div>
                      <div className="font-mono text-[10px] text-[#7da6ff] truncate">0x4bfEF46d920fd67C68046901f591Fad0a2F7cadC</div>
                    </div>
                    <div className="font-mono text-[10px] text-white/40 tracking-[0.15em] uppercase ml-auto flex items-center gap-1.5 group-hover:text-[#7da6ff] transition-colors">
                      Live on Base Sepolia · canary soak
                      <ExternalLink className="w-2.5 h-2.5" />
                    </div>
                  </div>
                </GlassCard>
              </a>
            </GlassCard>
          </motion.div>

          {/* ===== 4. SMART CONTRACTS ===== */}
          <motion.div custom={sectionIndex++} variants={fadeUp} initial="hidden" animate="visible">
            <GlassCard className="p-6 md:p-8">
              <SectionLabel icon={Shield} label="Legacy on-chain deployment" right="X Layer archive · chain 196" />

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {CONTRACTS.map(c => (
                  <a
                    key={c.name}
                    href={`https://www.oklink.com/xlayer/address/${c.addr}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block group"
                  >
                    <GlassCard accentBorder className="p-5 h-full hover:bg-white/[0.07] transition-all">
                      <div className="font-mono text-[11px] text-white/85 font-bold mb-2 tracking-[-0.01em]">{c.name}</div>
                      <div className="font-mono text-[10px] text-[#7da6ff] mb-3 truncate">{c.addr}</div>
                      <p className="text-xs text-white/60 leading-6 mb-4">{c.purpose}</p>
                      <div className="font-mono text-[10px] text-white/40 group-hover:text-[#7da6ff] transition-colors tracking-[0.15em] uppercase flex items-center gap-1.5">
                        View legacy deployment
                        <ExternalLink className="w-2.5 h-2.5" />
                      </div>
                    </GlassCard>
                  </a>
                ))}
              </div>
            </GlassCard>
          </motion.div>

          {/* ===== 5. x402 PAYMENT PROTOCOL ===== */}
          <motion.div custom={sectionIndex++} variants={fadeUp} initial="hidden" animate="visible">
            <GlassCard className="p-6 md:p-8">
              <SectionLabel icon={Lock} label="x402 payment protocol" />
              <p className="text-sm leading-7 text-white/60 mb-7 max-w-2xl">
                The current product direction is Base-first. The payment example below documents the legacy X Layer rail while the Base deployment is cut over.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Step 1 */}
                <GlassCard className="p-5 relative overflow-hidden">
                  <div className="absolute top-3 right-3 font-mono text-[32px] text-white/[0.06] font-bold leading-none">1</div>
                  <div className="font-mono text-[10px] text-white/50 tracking-[0.15em] uppercase mb-3">Request</div>
                  <div className="bg-black/60 border border-white/10 rounded-xl p-3.5 font-mono text-[10px] text-[#7da6ff] overflow-x-auto whitespace-pre leading-relaxed">
{`curl bobbyprotocol.xyz/api/premium-signal

→ 402 {
  amount: "0.001 OKB",
  chain: 196,
  protocol: "x402"
}`}
                  </div>
                </GlassCard>

                {/* Step 2 */}
                <GlassCard className="p-5 relative overflow-hidden">
                  <div className="absolute top-3 right-3 font-mono text-[32px] text-white/[0.06] font-bold leading-none">2</div>
                  <div className="font-mono text-[10px] text-[#ffb95f] tracking-[0.15em] uppercase mb-3">Legacy payment rail</div>
                  <div className="bg-black/60 border border-white/10 rounded-xl p-3.5 font-mono text-[10px] text-[#7da6ff] overflow-x-auto whitespace-pre leading-relaxed">
{`curl bobbyprotocol.xyz/api/
  premium-signal \\
  -H "x-payment:
    0xYOUR_TX_HASH"`}
                  </div>
                </GlassCard>

                {/* Step 3 */}
                <GlassCard className="p-5 relative overflow-hidden">
                  <div className="absolute top-3 right-3 font-mono text-[32px] text-white/[0.06] font-bold leading-none">3</div>
                  <div className="font-mono text-[10px] text-[#7da6ff] tracking-[0.15em] uppercase mb-3">Access granted</div>
                  <div className="bg-black/60 border border-white/10 rounded-xl p-3.5 font-mono text-[10px] text-[#7da6ff] overflow-x-auto whitespace-pre leading-relaxed">
{`→ 200 {
  signal: { ... },
  verification: {
    status: "verified"
  }
}`}
                  </div>
                </GlassCard>
              </div>
            </GlassCard>
          </motion.div>

          {/* ===== 6. SOLIDITY INTEGRATION ===== */}
          <motion.div custom={sectionIndex++} variants={fadeUp} initial="hidden" animate="visible">
            <GlassCard className="p-6 md:p-8">
              <SectionLabel icon={Terminal} label="Solidity integration" right="Conviction oracle" />
              <CopyBlock
                label="ConvictionOracle interface"
                code={`interface IBobbyOracle {
    function getConviction(string calldata symbol)
        external view returns (
            uint8 direction,   // 0=NEUTRAL, 1=LONG, 2=SHORT
            uint8 conviction,  // 0-10 scale
            uint96 entryPrice, // in wei
            bool active        // false if expired
        );
}

// Usage
IBobbyOracle oracle = IBobbyOracle(
    0x03fa39b3a5b316b7cacdabd3442577ee32ab5f3a
);
(uint8 dir, uint8 conv, uint96 entry, bool active)
    = oracle.getConviction("BTC");`}
              />
            </GlassCard>
          </motion.div>

          {/* ===== 7. UNIVERSAL ASSET SEARCH ===== */}
          <motion.div custom={sectionIndex++} variants={fadeUp} initial="hidden" animate="visible">
            <GlassCard className="p-6 md:p-8">
              <SectionLabel icon={Search} label="Universal asset search" right="Crypto / stocks / commodities" />
              <p className="text-sm leading-7 text-white/60 mb-5 max-w-2xl">
                Search ANY asset across crypto, stocks, commodities, and forex. Returns matching tickers with metadata.
              </p>
              <CopyBlock
                label="Search endpoint"
                code={`curl https://bobbyprotocol.xyz/api/bobby-asset-search?q=PEPE

→ 200 {
  results: [
    { symbol: "PEPE", name: "Pepe", type: "crypto", price: 0.0000089 },
    { symbol: "PEPE/USDT", exchange: "okx", volume_24h: "12.4M" }
  ]
}`}
              />
            </GlassCard>
          </motion.div>

          {/* ===== 8. CTA — AGENT COMMERCE ===== */}
          <motion.div custom={sectionIndex++} variants={fadeUp} initial="hidden" animate="visible">
            <a href="/agentic-world/bobby/marketplace" className="block group">
              <GlassCard glow accentBorder className="p-6 md:p-8 hover:bg-white/[0.07] transition-all">
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 rounded-xl bg-[#0052ff]/20 border border-[#0052ff]/40 flex items-center justify-center shrink-0">
                    <ShoppingCart className="w-5 h-5 text-[#7da6ff]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[10px] text-[#7da6ff] tracking-[0.18em] uppercase mb-2">Intelligence protocol</div>
                    <div className="text-lg md:text-xl text-white font-extrabold tracking-[-0.05em] mb-1.5">
                      10 Intelligence Protocol use cases
                    </div>
                    <div className="text-sm leading-6 text-white/60">
                      How agents buy and sell intelligence through Bobby's agent-native payment rail
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[#7da6ff]/60 group-hover:text-[#7da6ff] group-hover:translate-x-1 transition-all shrink-0" />
                </div>
              </GlassCard>
            </a>
          </motion.div>

          {/* ===== 9. FOOTER ===== */}
          <motion.div custom={sectionIndex++} variants={fadeUp} initial="hidden" animate="visible">
            <div className="border-t border-white/10 pt-8 space-y-5">
              {/* Powered by */}
              <div className="flex flex-wrap items-center justify-center gap-3">
                {['Base', 'MCP', 'x402', 'Claude AI'].map(tech => (
                  <span key={tech} className="font-mono text-[10px] text-white/40 tracking-[0.15em] px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.04]">
                    {tech.toUpperCase()}
                  </span>
                ))}
              </div>

              {/* Live metrics */}
              <div className="flex items-center justify-center gap-6 font-mono text-[10px] text-white/35 tracking-[0.18em]">
                <span>LATENCY: 14MS</span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#0052ff]" />
                <span>ENDPOINTS: 12</span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#0052ff]" />
                <span>TOOLS: {FREE_TOOLS.length + PREMIUM_TOOLS.length + UTILITY_TOOLS.length}</span>
              </div>

              {/* Links */}
              <div className="flex items-center justify-center gap-4">
                <a
                  href="https://github.com/anthonysurfermx/Bobby-Agent-Trader"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[10px] text-white/40 hover:text-[#7da6ff] tracking-[0.15em] transition-colors"
                >
                  GITHUB
                  <ExternalLink className="w-2.5 h-2.5 inline ml-1" />
                </a>
                <a
                  href="https://bobbyprotocol.xyz/llms.txt"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[10px] text-white/40 hover:text-[#7da6ff] tracking-[0.15em] transition-colors"
                >
                  LLMS.TXT
                  <ExternalLink className="w-2.5 h-2.5 inline ml-1" />
                </a>
              </div>
            </div>
          </motion.div>

        </div>
      </div>
    </KineticShell>
  );
}
