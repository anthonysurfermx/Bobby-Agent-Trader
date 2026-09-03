// ============================================================
// Bobby AI Docs — Integration portal for AI agents & developers
// Base-native dark design
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
import { BOBBY_BASE_MAINNET, bobbyBaseAddressUrl } from '@/config/chains';

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

function Badge() {
  return (
    <span className="font-mono text-[9px] px-2 py-0.5 rounded-full bg-[#0052ff]/20 text-[#7da6ff] border border-[#0052ff]/40 tracking-[0.15em]">
      PUBLIC
    </span>
  );
}

// --------------- Data ---------------

const CONTRACTS = [
  { name: 'BobbyTrackRecord V2', addr: BOBBY_BASE_MAINNET.contracts.trackRecord, purpose: 'Future-anchored, Pyth-verified decision history' },
  { name: 'BobbyConvictionOracle', addr: BOBBY_BASE_MAINNET.contracts.convictionOracle, purpose: 'Conviction commitments before execution' },
  { name: 'BobbyAgentEconomyV2', addr: BOBBY_BASE_MAINNET.contracts.agentEconomy, purpose: 'Native-fee protocol economy' },
  { name: 'BobbyAdversarialBounties', addr: BOBBY_BASE_MAINNET.contracts.adversarialBounties, purpose: 'On-chain rewards for breaking a thesis' },
  { name: 'HardnessRegistry', addr: BOBBY_BASE_MAINNET.contracts.hardnessRegistry, purpose: 'Difficulty-weighted decision scoring' },
  { name: 'BobbyAgentRegistry', addr: BOBBY_BASE_MAINNET.contracts.agentRegistry, purpose: 'Staked on-chain agent identities' },
  { name: 'BobbyIntentEscrow', addr: BOBBY_BASE_MAINNET.contracts.intentEscrow, purpose: 'Attested intent ledger, isolated from verified calls' },
];

const TOOL_ICONS: Record<string, React.ElementType> = {
  bobby_stats: BarChart3,
  bobby_ta: TrendingUp,
  bobby_intel: Eye,
  bobby_dex_trending: Zap,
  bobby_dex_signals: MessageSquare,
  bobby_uniswap_quote: Globe,
  bobby_analyze: Cpu,
  bobby_debate: MessageSquare,
  bobby_security_scan: AlertTriangle,
  bobby_wallet_portfolio: Wallet,
  bobby_wallet_balance: Wallet,
};

const PUBLIC_TOOLS = [
  { name: 'bobby_analyze', desc: 'Full multi-source market analysis with AI synthesis' },
  { name: 'bobby_debate', desc: '3-agent adversarial debate (Alpha Hunter vs Red Team vs CIO)' },
  { name: 'bobby_stats', desc: 'Track record, win rate, PnL — live performance metrics' },
  { name: 'bobby_ta', desc: 'Technical analysis with RSI, MACD, Bollinger Bands, SuperTrend' },
  { name: 'bobby_intel', desc: 'Full 12-source intelligence briefing in 10 seconds' },
  { name: 'bobby_wallet_balance', desc: 'Read-only balance for a Base wallet' },
  { name: 'bobby_wallet_portfolio', desc: 'Read-only portfolio breakdown and analysis' },
  { name: 'bobby_security_scan', desc: 'Token contract safety audit and risk scoring' },
  { name: 'bobby_dex_trending', desc: 'Trending tokens on-chain across DEXs' },
  { name: 'bobby_dex_signals', desc: 'Whale and KOL buy/sell signals' },
  { name: 'bobby_uniswap_quote', desc: 'Uniswap V3 quote on Base from Bobby\'s own quoter call' },
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

function ToolCard({ name, desc }: { name: string; desc: string }) {
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
              <Badge />
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
              Base mainnet proofs, 11 MCP tools, self-custodial quotes and a chain-ordered receipt ledger
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
              <SectionLabel icon={Cpu} label="11 public MCP tools" right="live schema via tools/list" />

              {/* Public tools */}
              <div className="font-mono text-[10px] text-[#7da6ff] tracking-[0.18em] uppercase mb-3">
                Public tools ({PUBLIC_TOOLS.length})
              </div>
              <motion.div
                variants={stagger}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-6"
              >
                {PUBLIC_TOOLS.map(t => (
                  <ToolCard key={t.name} name={t.name} desc={t.desc} />
                ))}
              </motion.div>
            </GlassCard>
          </motion.div>

          {/* ===== 4. BASE V2 PROOF ENGINE ===== */}
          <motion.div custom={sectionIndex++} variants={fadeUp} initial="hidden" animate="visible">
            <GlassCard glow accentBorder className="p-6 md:p-8">
              <SectionLabel icon={Shield} label="TrackRecord V2 proof engine" right="Base mainnet · deployed" />
              <p className="mb-7 max-w-3xl text-sm leading-7 text-white/60">
                V2 fixes the time of entry before its price exists, verifies entry and exit through Pyth/Hermes, and keeps price-verified outcomes separate from attested claims. Five adversarial rounds found and closed four P1 integrity issues before the release was frozen.
              </p>

              <div className="grid gap-3 md:grid-cols-3">
                {[
                  ['01 · FUTURE ANCHOR', 'announceCommit fixes entryAt in the future. Same-block, tick-shopping and retrospective anchor selection revert.'],
                  ['02 · ORACLE EVIDENCE', 'Unique Pyth updates prove the exact entry and exit instants. The recorder retries Hermes only inside the valid window.'],
                  ['03 · OPEN RESOLUTION', 'Permissionless challenge, expiry and separate VERIFIED / ATTESTED ledgers prevent unproven claims from inflating the record.'],
                ].map(([title, text]) => (
                  <div key={title} className="rounded-xl border border-[#0052ff]/25 bg-[#0052ff]/[0.07] p-5">
                    <div className="font-mono text-[10px] font-bold tracking-[0.15em] text-[#7da6ff]">{title}</div>
                    <p className="mt-3 text-xs leading-6 text-white/60">{text}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <a href={bobbyBaseAddressUrl(BOBBY_BASE_MAINNET.contracts.trackRecord)} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-white/10 bg-black/30 p-4 transition hover:border-[#0052ff]/50">
                  <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">TrackRecord V2 · Base mainnet</div>
                  <div className="mt-2 truncate font-mono text-[11px] text-[#7da6ff]">{BOBBY_BASE_MAINNET.contracts.trackRecord}</div>
                </a>
                <a href={bobbyBaseAddressUrl(BOBBY_BASE_MAINNET.safe)} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-white/10 bg-black/30 p-4 transition hover:border-[#0052ff]/50">
                  <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">Production Safe · 2 of 3</div>
                  <div className="mt-2 truncate font-mono text-[11px] text-[#7da6ff]">{BOBBY_BASE_MAINNET.safe}</div>
                </a>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/10 pt-5 font-mono text-[10px] uppercase tracking-[0.12em]">
                <span className="rounded-full border border-[#0052ff]/40 bg-[#0052ff]/10 px-3 py-1 text-[#7da6ff]">Base mainnet live</span>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-emerald-300">Dynamic write controls</span>
                <span className="text-white/35">Safe-owned · runtime verified · public heartbeat</span>
              </div>
            </GlassCard>
          </motion.div>

          {/* ===== 5. BASE MAINNET SMART CONTRACTS ===== */}
          <motion.div custom={sectionIndex++} variants={fadeUp} initial="hidden" animate="visible">
            <GlassCard className="p-6 md:p-8">
              <SectionLabel icon={Shield} label="Base mainnet contracts" right="7 deployed · chain 8453" />

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {CONTRACTS.map(c => (
                  <a
                    key={c.name}
                    href={bobbyBaseAddressUrl(c.addr)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block group"
                  >
                    <GlassCard accentBorder className="p-5 h-full hover:bg-white/[0.07] transition-all">
                      <div className="font-mono text-[11px] text-white/85 font-bold mb-2 tracking-[-0.01em]">{c.name}</div>
                      <div className="font-mono text-[10px] text-[#7da6ff] mb-3 truncate">{c.addr}</div>
                      <p className="text-xs text-white/60 leading-6 mb-4">{c.purpose}</p>
                      <div className="font-mono text-[10px] text-white/40 group-hover:text-[#7da6ff] transition-colors tracking-[0.15em] uppercase flex items-center gap-1.5">
                        View on Basescan
                        <ExternalLink className="w-2.5 h-2.5" />
                      </div>
                    </GlassCard>
                  </a>
                ))}
              </div>
            </GlassCard>
          </motion.div>

          {/* ===== 6. BASE SWAP RECEIPT LEDGER ===== */}
          <motion.div custom={sectionIndex++} variants={fadeUp} initial="hidden" animate="visible">
            <GlassCard className="p-6 md:p-8">
              <SectionLabel icon={Wallet} label="Base execution receipt ledger" right="Self-custody · FIFO" />
              <p className="text-sm leading-7 text-white/60 mb-7 max-w-2xl">
                Bobby never holds funds or exchange credentials. It can quote a bounded Uniswap route on Base, hand approved calldata to the user's wallet, and record only confirmed on-chain receipts. Tokenized-stock calldata remains disabled until the legal and operations gates are explicitly approved.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Step 1 */}
                <GlassCard className="p-5 relative overflow-hidden">
                  <div className="absolute top-3 right-3 font-mono text-[32px] text-white/[0.06] font-bold leading-none">1</div>
                  <div className="font-mono text-[10px] text-white/50 tracking-[0.15em] uppercase mb-3">Quote</div>
                  <div className="bg-black/60 border border-white/10 rounded-xl p-3.5 font-mono text-[10px] text-[#7da6ff] overflow-x-auto whitespace-pre leading-relaxed">
{`curl 'bobbyprotocol.xyz/api/base-swap?\
tokenIn=USDC&tokenOut=NVDAc&amount=10'

→ 200 {
  ok: true,
  quote: { route: "USDC → NVDAc" }
}
# GET never returns wallet calldata.`}
                  </div>
                </GlassCard>

                {/* Step 2 */}
                <GlassCard className="p-5 relative overflow-hidden">
                  <div className="absolute top-3 right-3 font-mono text-[32px] text-white/[0.06] font-bold leading-none">2</div>
                  <div className="font-mono text-[10px] text-[#ffb95f] tracking-[0.15em] uppercase mb-3">Wallet approval</div>
                  <div className="bg-black/60 border border-white/10 rounded-xl p-3.5 font-mono text-[10px] text-[#7da6ff] overflow-x-auto whitespace-pre leading-relaxed">
{`# POST requires:
• wallet session proof
• origin + rate-limit checks
• eligibility + country gate
• exact ops switch

# Only the user's wallet signs.`}
                  </div>
                </GlassCard>

                {/* Step 3 */}
                <GlassCard className="p-5 relative overflow-hidden">
                  <div className="absolute top-3 right-3 font-mono text-[32px] text-white/[0.06] font-bold leading-none">3</div>
                  <div className="font-mono text-[10px] text-[#7da6ff] tracking-[0.15em] uppercase mb-3">Confirmed receipt</div>
                  <div className="bg-black/60 border border-white/10 rounded-xl p-3.5 font-mono text-[10px] text-[#7da6ff] overflow-x-auto whitespace-pre leading-relaxed">
{`receipt.status = "confirmed"
ledger.order = block + tx index
matching = FIFO rebuild per pair
pnl.scope = wallet

# Concurrent confirms serialize.`}
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
    { symbol: "PEPE", source: "public-market", volume_24h: "12.4M" }
  ]
}`}
              />
            </GlassCard>
          </motion.div>

          {/* ===== 8. CTA — PUBLIC PROOFS ===== */}
          <motion.div custom={sectionIndex++} variants={fadeUp} initial="hidden" animate="visible">
            <a href="/protocol/calls" className="block group">
              <GlassCard glow accentBorder className="p-6 md:p-8 hover:bg-white/[0.07] transition-all">
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 rounded-xl bg-[#0052ff]/20 border border-[#0052ff]/40 flex items-center justify-center shrink-0">
                    <ShoppingCart className="w-5 h-5 text-[#7da6ff]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[10px] text-[#7da6ff] tracking-[0.18em] uppercase mb-2">Public proof ledger</div>
                    <div className="text-lg md:text-xl text-white font-extrabold tracking-[-0.05em] mb-1.5">
                      Inspect verified calls
                    </div>
                    <div className="text-sm leading-6 text-white/60">
                      Committed before outcome, resolved with evidence, and anchored to Base.
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
                {['Base', 'MCP', 'Uniswap V3', 'Supabase'].map(tech => (
                  <span key={tech} className="font-mono text-[10px] text-white/40 tracking-[0.15em] px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.04]">
                    {tech.toUpperCase()}
                  </span>
                ))}
              </div>

              {/* Live metrics */}
              <div className="flex items-center justify-center gap-6 font-mono text-[10px] text-white/35 tracking-[0.18em]">
                <span>LATENCY: 14MS</span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#0052ff]" />
                <span>CHAIN: 8453</span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#0052ff]" />
                <span>PUBLIC MCP TOOLS: 11</span>
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
