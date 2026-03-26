// ============================================================
// Bobby Dev Docs — Integration portal for AI agents & developers
// One link to rule them all: defimexico.org/llms.txt
// ============================================================

import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Copy, Check, ExternalLink, Terminal, Cpu, Zap, Shield, BookOpen } from 'lucide-react';
import KineticShell from '@/components/kinetic/KineticShell';

function CopyBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group">
      {label && <div className="font-mono text-[8px] text-white/30 tracking-widest mb-1">{label}</div>}
      <div className="bg-black/60 border border-white/10 rounded-lg p-3 font-mono text-[11px] text-green-400 overflow-x-auto whitespace-pre">
        {code}
      </div>
      <button
        onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        className="absolute top-2 right-2 p-1.5 bg-white/5 hover:bg-white/10 rounded border border-white/10 transition-all opacity-0 group-hover:opacity-100"
      >
        {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-white/40" />}
      </button>
    </div>
  );
}

const CONTRACTS = [
  { name: 'BobbyTrackRecord', addr: '0xf841b428e6d743187d7be2242eccc1078fde2395', desc: 'Commit-reveal predictions' },
  { name: 'BobbyConvictionOracle', addr: '0x03fa39b3a5b316b7cacdabd3442577ee32ab5f3a', desc: 'Conviction feed for protocols' },
  { name: 'BobbyAgentEconomy', addr: '0xa4704E92E9d9eCA646716C14a124907C356C78D7', desc: 'Agent-to-agent payments' },
  { name: 'BobbyAgentRegistry', addr: '0x823a1670f521a35d4fafe4502bdcb3a8148bba8b', desc: 'Agent Identity NFTs' },
];

const MCP_TOOLS = [
  { name: 'bobby_stats', desc: 'Track record, win rate, PnL', free: true },
  { name: 'bobby_ta', desc: 'Technical analysis (RSI, MACD, BB, SuperTrend)', free: true },
  { name: 'bobby_intel', desc: 'Full 12-source intelligence briefing', free: true },
  { name: 'bobby_dex_trending', desc: 'Trending tokens on-chain', free: true },
  { name: 'bobby_dex_signals', desc: 'Whale / KOL buy signals', free: true },
  { name: 'bobby_xlayer_signals', desc: 'Smart money on X Layer', free: true },
  { name: 'bobby_analyze', desc: 'Full market analysis', free: false },
  { name: 'bobby_debate', desc: '3-agent adversarial debate', free: false },
  { name: 'bobby_security_scan', desc: 'Token safety audit', free: false },
  { name: 'bobby_wallet_portfolio', desc: 'Multi-chain portfolio analysis', free: false },
];

export default function BobbyDocsPage() {
  return (
    <KineticShell activeTab="terminal">
      <Helmet><title>Dev Docs | Bobby Agent Trader</title></Helmet>

      <div className="min-h-screen bg-[#050505] pb-20 md:pb-8">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto px-4 py-6 space-y-6">

          {/* HERO */}
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <BookOpen className="w-5 h-5 text-green-400" />
              <h1 className="font-mono text-lg text-white/90 tracking-wide">BOBBY_DEV_DOCS</h1>
              <span className="font-mono text-[8px] text-green-400/60 border border-green-500/20 px-2 py-0.5 rounded-sm ml-auto">v3.0 — X LAYER</span>
            </div>
            <p className="font-mono text-[11px] text-white/50 leading-relaxed">
              Connect your AI agent to Bobby in one command. 12 MCP tools, 4 smart contracts on X Layer, 70+ technical indicators, x402 payments.
            </p>
          </div>

          {/* ONE-LINK INTEGRATION */}
          <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-green-400" />
              <span className="font-mono text-xs text-green-400 tracking-widest">INSTANT_INTEGRATION</span>
            </div>
            <p className="font-mono text-[10px] text-white/40 mb-3">Give this link to your AI (Claude, Gemini, Codex, Cursor) and it will know everything about Bobby:</p>
            <CopyBlock code="https://defimexico.org/llms.txt" label="LLM_CONTEXT_FILE" />
            <p className="font-mono text-[8px] text-white/20 mt-2">Works with: Claude Code, Cursor, Windsurf, Copilot, Codex, Gemini CLI — any AI that reads URLs</p>
          </div>

          {/* QUICK START */}
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Terminal className="w-4 h-4 text-green-400" />
              <span className="font-mono text-xs text-white/60 tracking-widest">QUICK_START</span>
            </div>

            <CopyBlock
              label="ADD BOBBY TO CLAUDE CODE"
              code={`claude mcp add bobby-trader https://defimexico.org/api/mcp-bobby`}
            />

            <CopyBlock
              label="CALL BOBBY VIA API"
              code={`curl -X POST https://defimexico.org/api/mcp-bobby \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"bobby_ta","arguments":{"symbol":"BTC"}},"id":1}'`}
            />

            <CopyBlock
              label="SEARCH ANY ASSET (70+ INDICATORS)"
              code={`curl https://defimexico.org/api/bobby-asset-search?q=PEPE`}
            />

            <CopyBlock
              label="READ CONVICTION ORACLE (SOLIDITY)"
              code={`IBobbyOracle oracle = IBobbyOracle(0x03fa39b3a5b316b7cacdabd3442577ee32ab5f3a);
(uint8 dir, uint8 conv, uint96 entry, bool active) = oracle.getConviction("BTC");
// dir: 0=NEUTRAL, 1=LONG, 2=SHORT | conv: 0-10 | active: false if expired`}
            />
          </div>

          {/* MCP TOOLS */}
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Cpu className="w-4 h-4 text-green-400" />
              <span className="font-mono text-xs text-white/60 tracking-widest">MCP_TOOLS</span>
              <span className="font-mono text-[8px] text-white/20 ml-auto">{MCP_TOOLS.length} AVAILABLE</span>
            </div>
            <div className="space-y-1">
              {MCP_TOOLS.map(tool => (
                <div key={tool.name} className="flex items-center gap-2 py-1.5 border-b border-white/[0.03] last:border-0">
                  <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded ${tool.free ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400'}`}>
                    {tool.free ? 'FREE' : 'x402'}
                  </span>
                  <span className="font-mono text-[10px] text-white/70 font-bold">{tool.name}</span>
                  <span className="font-mono text-[9px] text-white/30 ml-auto">{tool.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* SMART CONTRACTS */}
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-green-400" />
              <span className="font-mono text-xs text-white/60 tracking-widest">SMART_CONTRACTS</span>
              <span className="font-mono text-[8px] text-white/20 ml-auto">X LAYER (CHAIN 196)</span>
            </div>
            <div className="space-y-2">
              {CONTRACTS.map(c => (
                <a
                  key={c.name}
                  href={`https://www.oklink.com/xlayer/address/${c.addr}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-2.5 bg-black/30 rounded border border-white/5 hover:border-green-500/20 transition-all group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[10px] text-white/70 font-bold">{c.name}</div>
                    <div className="font-mono text-[8px] text-white/25 truncate">{c.addr}</div>
                  </div>
                  <div className="font-mono text-[8px] text-white/20">{c.desc}</div>
                  <ExternalLink className="w-3 h-3 text-white/15 group-hover:text-green-400 transition-colors shrink-0" />
                </a>
              ))}
            </div>
          </div>

          {/* x402 PAYMENT */}
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-6 space-y-3">
            <span className="font-mono text-xs text-white/60 tracking-widest">x402_PAYMENT_PROTOCOL</span>
            <p className="font-mono text-[10px] text-white/40">Premium tools require x402 payment on X Layer. Your agent pays, Bobby delivers intelligence.</p>
            <CopyBlock
              label="STEP 1: REQUEST (RETURNS 402)"
              code={`curl https://defimexico.org/api/premium-signal
→ 402 { amount: "0.001 OKB", chain: 196, protocol: "x402" }`}
            />
            <CopyBlock
              label="STEP 2: PAY ON X LAYER + RETRY"
              code={`curl https://defimexico.org/api/premium-signal \\
  -H "x-payment: 0xYOUR_TX_HASH_ON_XLAYER"
→ 200 { signal: {...}, verification: { status: "verified" } }`}
            />
          </div>

          {/* FOOTER */}
          <div className="flex flex-wrap gap-4 text-[8px] font-mono text-white/15 tracking-wider">
            <span>BOBBY_AGENT_TRADER_V3</span>
            <span>OKX_X_LAYER</span>
            <span>ONCHAIN_OS</span>
            <span>AGENT_TRADE_KIT</span>
            <a href="https://github.com/anthonysurfermx/Bobby-Agent-Trader" target="_blank" rel="noopener noreferrer" className="hover:text-white/30">GITHUB →</a>
          </div>
        </motion.div>
      </div>
    </KineticShell>
  );
}
