// ============================================================
// Bobby AI Docs — Integration portal for AI agents & developers
// Stitch Kinetic Terminal redesign
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
        <div className="font-mono text-[8px] text-white/30 tracking-widest uppercase mb-1.5">
          {label}
        </div>
      )}
      <div
        className="bg-black/70 border border-white/[0.06] rounded-lg p-4 font-mono text-[11px] text-[#4be277] overflow-x-auto whitespace-pre leading-relaxed"
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
        className="absolute top-2 right-2 p-1.5 bg-white/5 hover:bg-white/10 rounded border border-white/10 transition-all opacity-0 group-hover:opacity-100"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-[#4be277]" /> : <Copy className="w-3.5 h-3.5 text-white/40" />}
      </button>
    </div>
  );
}

function GlassCard({
  children,
  className = '',
  glow = false,
  greenBorder = false,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  greenBorder?: boolean;
}) {
  return (
    <div
      className={`
        bg-[rgba(255,255,255,0.02)] border rounded-xl
        ${greenBorder ? 'border-[#4be277]/20 hover:border-[#4be277]/40' : 'border-white/[0.04]'}
        ${className}
      `}
      style={{
        backdropFilter: 'blur(12px)',
        ...(glow ? { boxShadow: '0 0 20px rgba(34,197,94,0.1)' } : {}),
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ icon: Icon, label, right }: { icon: React.ElementType; label: string; right?: string }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      <Icon className="w-4 h-4 text-[#4be277]" />
      <span className="font-mono text-xs text-[#4be277] tracking-widest uppercase">{label}</span>
      {right && <span className="font-mono text-[8px] text-white/20 ml-auto tracking-widest">{right}</span>}
    </div>
  );
}

function Badge({ type }: { type: 'free' | 'x402' }) {
  return type === 'free' ? (
    <span className="font-mono text-[8px] px-2 py-0.5 rounded-full bg-[#4be277]/10 text-[#4be277] border border-[#4be277]/20 tracking-widest">
      FREE
    </span>
  ) : (
    <span className="font-mono text-[8px] px-2 py-0.5 rounded-full bg-[#ffb95f]/10 text-[#ffb95f] border border-[#ffb95f]/20 tracking-widest">
      x402
    </span>
  );
}

// --------------- Data ---------------

const CONTRACTS = [
  { name: 'BobbyTrackRecord', addr: '0xf841b428e6d743187d7be2242eccc1078fde2395', desc: 'Commit-reveal predictions', purpose: 'Immutable on-chain prediction history' },
  { name: 'BobbyConvictionOracle', addr: '0x03fa39b3a5b316b7cacdabd3442577ee32ab5f3a', desc: 'Conviction feed for protocols', purpose: 'Real-time conviction data feed' },
  { name: 'BobbyAgentEconomy', addr: '0xa4704E92E9d9eCA646716C14a124907C356C78D7', desc: 'Agent-to-agent payments', purpose: 'x402 payment settlement' },
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
  { name: 'bobby_xlayer_signals', desc: 'Smart money movements on X Layer' },
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
      <GlassCard className="p-4 hover:bg-white/[0.04] transition-all group cursor-default">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
            <Icon className="w-4 h-4 text-white/40 group-hover:text-[#4be277] transition-colors" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge type={free ? 'free' : 'x402'} />
              <span className="font-mono text-[11px] text-white/80 font-bold truncate">{name}</span>
            </div>
            <p className="font-mono text-[10px] text-white/35 leading-relaxed">{desc}</p>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-white/10 group-hover:text-white/30 transition-colors shrink-0 mt-1" />
        </div>
      </GlassCard>
    </motion.div>
  );
}

// --------------- Page ---------------

export default function BobbyDocsPage() {
  let sectionIndex = 0;

  return (
    <KineticShell activeTab="docs">
      <Helmet><title>AI Docs | Bobby Agent Trader</title></Helmet>

      <div className="min-h-screen bg-[#131313] pb-20 md:pb-8">
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-10">

          {/* ===== 1. HEADER ===== */}
          <motion.div
            custom={sectionIndex++}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="text-center pt-4"
          >
            <div className="font-mono text-[9px] text-[#4be277]/60 tracking-[0.3em] uppercase mb-3">
              Bobby Agent Trader | AI Docs
            </div>
            <h1 className="font-mono text-white/90 text-lg md:text-xl tracking-wide mb-2">
              Connect your AI agent to Bobby in one command
            </h1>
            <p className="font-mono text-[11px] text-white/35 max-w-lg mx-auto">
              12 MCP tools, 4 smart contracts on X Layer, 70+ technical indicators, x402 payments
            </p>
          </motion.div>

          {/* ===== 2. HERO — INSTANT INTEGRATION ===== */}
          <motion.div custom={sectionIndex++} variants={fadeUp} initial="hidden" animate="visible">
            <GlassCard glow greenBorder className="p-6 md:p-8">
              <SectionLabel icon={Zap} label="Instant Integration" />

              <p className="font-mono text-[10px] text-white/40 mb-4 tracking-wide">
                Add Bobby to any MCP-compatible AI in one command:
              </p>

              {/* Giant glowing code block */}
              <div
                className="relative bg-black/80 border border-[#4be277]/20 rounded-xl p-5 md:p-6 mb-5"
                style={{ boxShadow: '0 0 30px rgba(75,226,119,0.08)' }}
              >
                <div className="font-mono text-[9px] text-[#4be277]/40 tracking-widest mb-2">$ TERMINAL</div>
                <div className="font-mono text-sm md:text-base text-[#4be277] break-all leading-relaxed">
                  claude mcp add bobby-trader https://bobbyprotocol.xyz/api/mcp-bobby
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText('claude mcp add bobby-trader https://bobbyprotocol.xyz/api/mcp-bobby');
                  }}
                  className="absolute top-3 right-3 p-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-all"
                >
                  <Copy className="w-4 h-4 text-white/30 hover:text-white/60" />
                </button>
              </div>

              {/* llms.txt */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mb-4">
                <span className="font-mono text-[10px] text-white/40">Or give this URL to any AI:</span>
                <a
                  href="https://bobbyprotocol.xyz/llms.txt"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[11px] text-[#4be277] hover:text-[#4be277]/80 underline underline-offset-2 decoration-[#4be277]/30 transition-colors"
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
                    className="font-mono text-[8px] text-white/30 tracking-widest px-2.5 py-1 rounded-full border border-white/[0.06] bg-white/[0.02]"
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
              <SectionLabel icon={Cpu} label="12 MCP Tools" right="24 ACTIVE ENDPOINTS" />

              {/* Free Tools */}
              <div className="font-mono text-[8px] text-[#4be277]/50 tracking-[0.2em] uppercase mb-3">
                Free Tools ({FREE_TOOLS.length})
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
              <div className="font-mono text-[8px] text-[#ffb95f]/50 tracking-[0.2em] uppercase mb-3">
                Premium Tools ({PREMIUM_TOOLS.length})
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
              <div className="font-mono text-[8px] text-white/30 tracking-[0.2em] uppercase mb-3">
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

          {/* ===== 4. SMART CONTRACTS ===== */}
          <motion.div custom={sectionIndex++} variants={fadeUp} initial="hidden" animate="visible">
            <GlassCard className="p-6 md:p-8">
              <SectionLabel icon={Shield} label="On-Chain Infrastructure" right="X LAYER (CHAIN 196)" />

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {CONTRACTS.map(c => (
                  <a
                    key={c.name}
                    href={`https://www.oklink.com/xlayer/address/${c.addr}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block group"
                  >
                    <GlassCard greenBorder className="p-4 h-full hover:bg-white/[0.03] transition-all">
                      <div className="font-mono text-[10px] text-white/70 font-bold mb-2">{c.name}</div>
                      <div className="font-mono text-[9px] text-[#4be277]/60 mb-2 truncate">{c.addr}</div>
                      <p className="font-mono text-[9px] text-white/25 mb-3">{c.purpose}</p>
                      <div className="font-mono text-[8px] text-white/15 group-hover:text-[#4be277] transition-colors tracking-widest flex items-center gap-1">
                        VIEW ON XLAYER
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
              <SectionLabel icon={Lock} label="x402 Payment Protocol" />
              <p className="font-mono text-[10px] text-white/35 mb-6">
                Premium tools require x402 payment on X Layer. Your agent pays, Bobby delivers intelligence.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Step 1 */}
                <GlassCard className="p-5 relative overflow-hidden">
                  <div className="absolute top-3 right-3 font-mono text-[32px] text-white/[0.03] font-bold leading-none">1</div>
                  <div className="font-mono text-[9px] text-[#ffb4ae] tracking-widest uppercase mb-3">Request</div>
                  <div className="bg-black/60 border border-white/[0.06] rounded-lg p-3 font-mono text-[10px] text-[#4be277] overflow-x-auto whitespace-pre leading-relaxed">
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
                  <div className="absolute top-3 right-3 font-mono text-[32px] text-white/[0.03] font-bold leading-none">2</div>
                  <div className="font-mono text-[9px] text-[#ffb95f] tracking-widest uppercase mb-3">Pay on X Layer</div>
                  <div className="bg-black/60 border border-white/[0.06] rounded-lg p-3 font-mono text-[10px] text-[#4be277] overflow-x-auto whitespace-pre leading-relaxed">
{`curl bobbyprotocol.xyz/api/
  premium-signal \\
  -H "x-payment:
    0xYOUR_TX_HASH"`}
                  </div>
                </GlassCard>

                {/* Step 3 */}
                <GlassCard className="p-5 relative overflow-hidden">
                  <div className="absolute top-3 right-3 font-mono text-[32px] text-white/[0.03] font-bold leading-none">3</div>
                  <div className="font-mono text-[9px] text-[#4be277] tracking-widest uppercase mb-3">Access Granted</div>
                  <div className="bg-black/60 border border-white/[0.06] rounded-lg p-3 font-mono text-[10px] text-[#4be277] overflow-x-auto whitespace-pre leading-relaxed">
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
              <SectionLabel icon={Terminal} label="Solidity Integration" right="CONVICTION ORACLE" />
              <CopyBlock
                label="ConvictionOracle Interface"
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
              <SectionLabel icon={Search} label="Universal Asset Search" right="CRYPTO / STOCKS / COMMODITIES" />
              <p className="font-mono text-[10px] text-white/35 mb-4">
                Search ANY asset across crypto, stocks, commodities, and forex. Returns matching tickers with metadata.
              </p>
              <CopyBlock
                label="SEARCH ENDPOINT"
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
              <GlassCard glow greenBorder className="p-6 md:p-8 hover:bg-white/[0.04] transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#4be277]/10 border border-[#4be277]/20 flex items-center justify-center shrink-0">
                    <ShoppingCart className="w-5 h-5 text-[#4be277]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[9px] text-[#4be277]/60 tracking-[0.2em] uppercase mb-1">Intelligence Protocol</div>
                    <div className="font-mono text-sm md:text-base text-white/80 font-bold mb-1">
                      10 Intelligence Protocol Use Cases
                    </div>
                    <div className="font-mono text-[10px] text-white/30">
                      How agents buy and sell intelligence on X Layer — bidirectional agent economy
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[#4be277]/40 group-hover:text-[#4be277] group-hover:translate-x-1 transition-all shrink-0" />
                </div>
              </GlassCard>
            </a>
          </motion.div>

          {/* ===== 9. FOOTER ===== */}
          <motion.div custom={sectionIndex++} variants={fadeUp} initial="hidden" animate="visible">
            <div className="border-t border-white/[0.04] pt-6 space-y-4">
              {/* Powered by */}
              <div className="flex flex-wrap items-center justify-center gap-3">
                {['OKX OnchainOS', 'Agent Trade Kit', 'X Layer', 'Claude AI'].map(tech => (
                  <span key={tech} className="font-mono text-[8px] text-white/20 tracking-widest px-2.5 py-1 rounded-full border border-white/[0.04]">
                    {tech.toUpperCase()}
                  </span>
                ))}
              </div>

              {/* Live metrics */}
              <div className="flex items-center justify-center gap-6 font-mono text-[8px] text-white/15 tracking-[0.2em]">
                <span>LATENCY: 14MS</span>
                <span className="w-1 h-1 rounded-full bg-[#4be277]/30" />
                <span>ENDPOINTS: 12</span>
                <span className="w-1 h-1 rounded-full bg-[#4be277]/30" />
                <span>TOOLS: {FREE_TOOLS.length + PREMIUM_TOOLS.length + UTILITY_TOOLS.length}</span>
              </div>

              {/* Links */}
              <div className="flex items-center justify-center gap-4">
                <a
                  href="https://github.com/anthonysurfermx/Bobby-Agent-Trader"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[9px] text-white/20 hover:text-white/40 tracking-widest transition-colors"
                >
                  GITHUB
                  <ExternalLink className="w-2.5 h-2.5 inline ml-1" />
                </a>
                <a
                  href="https://bobbyprotocol.xyz/llms.txt"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[9px] text-white/20 hover:text-white/40 tracking-widest transition-colors"
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
