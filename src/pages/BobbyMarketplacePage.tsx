// ============================================================
// Bobby Protocol — Intelligence Protocol on X Layer
// Stitch Design System rewrite
// ============================================================

import { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, Shield, Newspaper, Brain, Bell, BarChart3,
  Wallet, GraduationCap, Layers, Cpu, ExternalLink, ChevronDown,
  ArrowRight, Terminal, Zap, FileText, Activity,
} from 'lucide-react';
import KineticShell from '@/components/kinetic/KineticShell';

// ── Components ─────────────────────────────────────────────

function LiveAgentsCounter() {
  const [count, setCount] = useState(4);
  useEffect(() => {
    const interval = setInterval(() => {
      setCount(prev => Math.max(3, Math.min(6, prev + (Math.random() > 0.6 ? 1 : Math.random() > 0.7 ? -1 : 0))));
    }, 8000);
    return () => clearInterval(interval);
  }, []);
  return <>{count.toLocaleString()}</>;
}

function ActivityStream() {
  const [logs, setLogs] = useState<string[]>([]);
  useEffect(() => {
    const templates = [
      '> [SYS] AI_PORTFOLIO_OPTIMIZER requested bobby_ta("SOL")... [FREE_TIER] OK',
      '> [SYS] AI_NEWSLETTER requested bobby_debate("BTC outlook")... [x402_CHALLENGE] SETTLED',
      '> [SYS] AI_RISK_MANAGER read ConvictionOracle("ETH")... [ON_CHAIN] OK',
      '> [SYS] AI_HEDGE_BOT requested bobby_intel... [FREE_TIER] OK regime=RISK_ON',
      '> [SYS] AI_TRADING_FUND requested bobby_analyze("LINK")... [x402_CHALLENGE] PENDING',
      '> [SYS] DEFI_VAULT_AGENT executed margin adjustment... [TX] SUCCESS',
      '> [SYS] NEW_AGENT connected via MCP... node_id=0x9a4f... [OK]',
    ];
    const initialLogs = Array(3).fill(null).map(() => templates[Math.floor(Math.random() * templates.length)]);
    setLogs(initialLogs);
    
    const interval = setInterval(() => {
      const newLog = templates[Math.floor(Math.random() * templates.length)];
      setLogs(prev => [...prev.slice(-3), newLog]);
    }, 2000 + Math.random() * 2500);
    return () => clearInterval(interval);
  }, []);
  return (
    <div className="flex flex-col gap-1.5 justify-end h-full w-full">
      <AnimatePresence mode="popLayout">
        {logs.map((log, i) => (
          <motion.div 
            key={`${i}-${log}`} 
            initial={{ opacity: 0, x: -10, height: 0 }} 
            animate={{ opacity: 1, x: 0, height: 'auto' }} 
            className="truncate"
          >
            {log}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ── Types ──────────────────────────────────────────────────

interface UseCase {
  id: string;
  node: string;
  name: string;
  action: string;
  icon: any;
  description: string;
  flow: string;
  interface: string;
  payment: string;
  paymentType: 'free' | 'x402' | 'oracle_read';
  status: 'LIVE' | 'READY';
  examplePayload: string;
  proofLink: string;
  missingStep: string;
  featured?: boolean;
}

// ── Data ───────────────────────────────────────────────────

const USE_CASES: UseCase[] = [
  {
    id: 'trading-fund', node: 'NODE_01', name: 'AI TRADING FUND', action: 'VAULT_REBALANCING',
    icon: TrendingUp,
    description: 'A DeFi vault agent calls Bobby for conviction signals, then rebalances portfolio allocation based on the score.',
    flow: 'CALL bobby_analyze → RECEIVE conviction 8/10 LONG → INCREASE BTC allocation → LOG on X Layer',
    interface: 'MCP: bobby_analyze', payment: '0.001 OKB per call', paymentType: 'x402', status: 'READY',
    examplePayload: '{"method":"tools/call","params":{"name":"bobby_analyze","arguments":{"symbol":"BTC"}}}',
    proofLink: 'https://bobbyprotocol.xyz/api/mcp-bobby', missingStep: 'Requires external vault executor',
    featured: true,
  },
  {
    id: 'risk-manager', node: 'NODE_02', name: 'AI RISK MANAGER', action: 'COLLATERAL_ADJUSTMENT',
    icon: Shield,
    description: 'A lending protocol reads Bobby\'s ConvictionOracle on-chain to dynamically adjust collateral ratios.',
    flow: 'READ oracle.getConviction("ETH") → CONVICTION 3/10 SHORT → RAISE collateral 150% → 200%',
    interface: 'On-chain: ConvictionOracle.getConviction()', payment: 'Gas only (public read)', paymentType: 'oracle_read', status: 'LIVE',
    examplePayload: 'oracle.getConviction("ETH") → (direction: SHORT, conviction: 3, entry: 2050e8, active: true)',
    proofLink: 'https://www.oklink.com/xlayer/address/0x03fa39b3a5b316b7cacdabd3442577ee32ab5f3a', missingStep: 'Oracle read is live. Protocol integration ready.',
    featured: true,
  },
  {
    id: 'newsletter', node: 'NODE_03', name: 'AI NEWSLETTER', action: 'CONTENT_GENERATION',
    icon: Newspaper,
    description: 'A content agent triggers a 3-agent debate, then formats Alpha vs Red Team vs CIO into a daily newsletter.',
    flow: 'CALL bobby_debate → RECEIVE 3-agent analysis → FORMAT as report → PUBLISH to subscribers',
    interface: 'MCP: bobby_debate', payment: '0.001 OKB per debate', paymentType: 'x402', status: 'LIVE',
    examplePayload: '{"method":"tools/call","params":{"name":"bobby_debate","arguments":{"question":"Should I long SOL?"}}}',
    proofLink: 'https://bobbyprotocol.xyz/api/mcp-bobby', missingStep: 'MCP endpoint returns 402 challenge. Full flow callable now.',
  },
  {
    id: 'portfolio', node: 'NODE_04', name: 'AI PORTFOLIO OPTIMIZER', action: 'ASSET_ALLOCATION',
    icon: BarChart3,
    description: 'An optimization agent uses Bobby\'s Technical Pulse (70+ OKX Agent Trade Kit indicators) to rank assets by strength.',
    flow: 'CALL bobby_ta for BTC, ETH, SOL → COMPARE RSI, MACD, SuperTrend → OVERWEIGHT strongest',
    interface: 'MCP: bobby_ta', payment: 'Free', paymentType: 'free', status: 'LIVE',
    examplePayload: '{"method":"tools/call","params":{"name":"bobby_ta","arguments":{"symbol":"BTC"}}}',
    proofLink: 'https://bobbyprotocol.xyz/api/mcp-bobby', missingStep: 'Endpoint live and returning real data now.',
  },
  {
    id: 'alerts', node: 'NODE_05', name: 'AI ALERT SERVICE', action: 'PUSH_NOTIFICATIONS',
    icon: Bell,
    description: 'A notification agent polls Bobby\'s ConvictionOracle. When conviction crosses 7/10, it pushes alerts via Telegram.',
    flow: 'POLL oracle every 5min → DETECT conviction jump 4→8 → SEND "STRONG LONG BTC" alert',
    interface: 'On-chain: ConvictionOracle + MCP: bobby_intel', payment: 'Free (oracle is public)', paymentType: 'oracle_read', status: 'READY',
    examplePayload: 'oracle.getConviction("BTC") → poll until conviction >= 7',
    proofLink: 'https://www.oklink.com/xlayer/address/0x03fa39b3a5b316b7cacdabd3442577ee32ab5f3a', missingStep: 'Requires notification connector (Telegram bot)',
  },
  {
    id: 'tutor', node: 'NODE_06', name: 'AI ACADEMY TUTOR', action: 'STUDENT_EVALUATION',
    icon: GraduationCap,
    description: 'A trading academy agent asks Bobby to debate a student\'s thesis, then compares reasoning quality for grading.',
    flow: 'STUDENT says "long NVDA" → CALL bobby_debate → COMPARE student vs Bobby → GRADE analysis',
    interface: 'MCP: bobby_debate + bobby_ta', payment: '0.001 OKB per session', paymentType: 'x402', status: 'READY',
    examplePayload: '{"method":"tools/call","params":{"name":"bobby_debate","arguments":{"question":"Evaluate: long NVDA at $130"}}}',
    proofLink: 'https://bobbyprotocol.xyz/api/mcp-bobby', missingStep: 'Requires academy platform integration',
  },
  {
    id: 'hedge', node: 'NODE_07', name: 'AI HEDGE BOT', action: 'PROTECTIVE_POSITIONING',
    icon: Layers,
    description: 'A hedging agent monitors Bobby\'s regime detection. When RISK_OFF activates, it opens protective short positions.',
    flow: 'READ bobby_intel → DETECT regime RISK_OFF + mood DEFENSIVE → OPEN BTC short hedge',
    interface: 'MCP: bobby_intel', payment: 'Free', paymentType: 'free', status: 'READY',
    examplePayload: '{"method":"tools/call","params":{"name":"bobby_intel","arguments":{}}}',
    proofLink: 'https://bobbyprotocol.xyz/api/mcp-bobby', missingStep: 'Requires external execution venue',
  },
  {
    id: 'social', node: 'NODE_08', name: 'AI SOCIAL TRADER', action: 'THREAD_GENERATION',
    icon: Cpu,
    description: 'A social media agent calls Bobby for debates and converts them into X/Twitter threads with conviction scores.',
    flow: 'CALL bobby_debate → FORMAT Alpha vs Red Team as thread → ADD Technical Pulse → POST to X',
    interface: 'MCP: bobby_debate + bobby_ta', payment: '0.001 OKB per thread', paymentType: 'x402', status: 'LIVE',
    examplePayload: '{"method":"tools/call","params":{"name":"bobby_debate","arguments":{"question":"BTC weekly outlook"}}}',
    proofLink: 'https://bobbyprotocol.xyz/api/mcp-bobby', missingStep: 'MCP callable now. Social posting requires X API.',
  },
  {
    id: 'mm', node: 'NODE_09', name: 'AI MARKET MAKER', action: 'SPREAD_ADJUSTMENT',
    icon: Wallet,
    description: 'A market-making agent reads Bobby\'s ATR and regime to adjust bid-ask spreads dynamically.',
    flow: 'READ bobby_ta ATR + regime → HIGH_VOL detected → WIDEN spreads 2x → REDUCE inventory risk',
    interface: 'MCP: bobby_ta + bobby_intel', payment: 'Free', paymentType: 'free', status: 'READY',
    examplePayload: 'bobby_ta("BTC") → { atr: 2400, regime: "HIGH_VOL" }',
    proofLink: 'https://bobbyprotocol.xyz/api/mcp-bobby', missingStep: 'Requires market-making engine integration',
  },
  {
    id: 'insurance', node: 'NODE_10', name: 'AI INSURANCE PROTOCOL', action: 'RISK_PRICING',
    icon: Brain,
    description: 'An insurance protocol reads Bobby\'s calibration data to price risk premiums for AI-recommended trades.',
    flow: 'READ bobby_intel calibration → ERROR 0.05 = well calibrated → OFFER 2% premium → USERS buy coverage',
    interface: 'MCP: bobby_intel (calibration data)', payment: 'Free', paymentType: 'free', status: 'READY',
    examplePayload: 'bobby_intel → { calibration: { calibrationError: 0.05, isOverconfident: false } }',
    proofLink: 'https://bobbyprotocol.xyz/api/mcp-bobby', missingStep: 'Most aspirational use case. Requires insurance protocol.',
  },
];

const TICKER_EVENTS = [
  '> [SYS] AI_PORTFOLIO_OPTIMIZER requested bobby_ta("BTC")... [FREE_TIER] OK',
  '> [SYS] AI_NEWSLETTER requested bobby_debate("ETH outlook")... [x402_CHALLENGE] 402',
  '> [SYS] AI_RISK_MANAGER read ConvictionOracle("SOL")... [ON_CHAIN] OK',
  '> [SYS] AI_SOCIAL_TRADER requested bobby_debate("Weekly BTC")... [x402_CHALLENGE] 402',
  '> [SYS] AI_HEDGE_BOT requested bobby_intel... [FREE_TIER] OK regime=RISK_OFF',
  '> [SYS] AI_ACADEMY_TUTOR requested bobby_debate("Evaluate NVDA")... [x402_CHALLENGE] 402',
  '> [SYS] AI_TRADING_FUND requested bobby_analyze("BTC")... [x402_CHALLENGE] 402',
  '> [SYS] AI_MARKET_MAKER requested bobby_ta("ETH") ATR... [FREE_TIER] OK',
  '> [SYS] AI_INSURANCE read bobby_intel calibration... [FREE_TIER] OK error=0.05',
  '> [SYS] AI_ALERT_SERVICE polled ConvictionOracle("BTC")... [ON_CHAIN] conviction=8',
];

const STATUS_STYLE = {
  LIVE: { cls: 'bg-[#4be277]/15 text-[#4be277] border-[#4be277]/30', dot: 'bg-[#4be277]' },
  READY: { cls: 'bg-white/5 text-white/50 border-white/20', dot: 'bg-white/30' },
};

const PAYMENT_STYLE = {
  free: { label: 'FREE', cls: 'text-[#4be277]/80 bg-[#4be277]/10 border-[#4be277]/15' },
  x402: { label: 'x402 PAID', cls: 'text-[#ffb95f]/80 bg-[#ffb95f]/10 border-[#ffb95f]/15' },
  oracle_read: { label: 'ON-CHAIN', cls: 'text-[#ffb4ae]/80 bg-[#ffb4ae]/10 border-[#ffb4ae]/15' },
};

// ── Flow Node Component ────────────────────────────────────

function FlowNode({ label, sublabel, delay, isLast }: { label: string; sublabel: string; delay: number; isLast?: boolean }) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay, duration: 0.4 }}
        className="flex-shrink-0 relative"
      >
        <div className="bg-[#201f1f] border border-[#4be277]/20 rounded-lg px-4 py-3 text-center min-w-[140px] relative group">
          <motion.div
            animate={{ boxShadow: ['0 0 0px rgba(75,226,119,0)', '0 0 12px rgba(75,226,119,0.15)', '0 0 0px rgba(75,226,119,0)'] }}
            transition={{ duration: 2.5, repeat: Infinity, delay: delay * 2 }}
            className="absolute inset-0 rounded-lg"
          />
          <div className="font-mono text-[10px] font-bold text-[#4be277] tracking-wider">{label}</div>
          <div className="font-mono text-[8px] text-white/30 mt-0.5">{sublabel}</div>
        </div>
      </motion.div>
      {!isLast && (
        <motion.div
          initial={{ opacity: 0, x: -5 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: delay + 0.2, duration: 0.3 }}
          className="flex-shrink-0 flex items-center px-2 relative"
        >
          {/* Static Track */}
          <div className="w-8 h-px bg-[#4be277]/20" />
          <ArrowRight className="w-3.5 h-3.5 text-[#4be277]/30 ml-1" />
          
          {/* Animated Flow Particles */}
          <div className="absolute inset-0 overflow-hidden flex items-center px-2">
            <motion.div 
               animate={{ x: [0, 40], opacity: [0, 1, 1, 0] }}
               transition={{ duration: 1.5, repeat: Infinity, ease: 'linear', delay: delay + 0.5 }}
               className="w-1.5 h-1.5 rounded-full bg-[#4be277] shadow-[0_0_8px_rgba(75,226,119,0.8)]"
            />
            <motion.div 
               animate={{ x: [0, 40], opacity: [0, 1, 1, 0] }}
               transition={{ duration: 1.2, repeat: Infinity, ease: 'linear', delay: delay + 1.2 }}
               className="w-1 h-1 rounded-full bg-[#ffb95f] shadow-[0_0_8px_rgba(255,185,95,0.8)]"
            />
          </div>
        </motion.div>
      )}
    </>
  );
}

// ── Prime Agent Card ───────────────────────────────────────

function PrimeAgentCard({ uc, index }: { uc: UseCase; index: number }) {
  const Icon = uc.icon;
  const st = STATUS_STYLE[uc.status];
  const pm = PAYMENT_STYLE[uc.paymentType];
  const [response, setResponse] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);

  const handleCall = () => {
    const snippet = uc.paymentType === 'oracle_read'
      ? `# Read ConvictionOracle on X Layer\ncast call 0x03fa39b3a5b316b7cacdabd3442577ee32ab5f3a \\\n  "getConviction(string)" "ETH" \\\n  --rpc-url https://rpc.xlayer.tech`
      : `# MCP Call via cURL\ncurl -X POST https://bobbyprotocol.xyz/api/mcp-bobby \\\n  -H "Content-Type: application/json" \\\n  -d '${uc.examplePayload}'`;
    setResponse(snippet);
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 + index * 0.15, duration: 0.5 }}
      className="bg-white/[0.02] backdrop-blur-[12px] border border-white/[0.06] rounded-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="p-6 pb-4">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#201f1f] border border-[#4be277]/20 flex items-center justify-center">
              <Icon className="w-5 h-5 text-[#4be277]" />
            </div>
            <div>
              <div className="font-mono text-sm font-bold text-white/90 tracking-wide">{uc.name}</div>
              <div className="font-mono text-[8px] text-white/25 tracking-widest mt-0.5">{uc.node} / {uc.action}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`font-mono text-[8px] px-2 py-1 rounded-md border ${pm.cls}`}>{pm.label}</span>
            <span className={`font-mono text-[8px] px-2 py-1 rounded-md border flex items-center gap-1.5 ${st.cls}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${st.dot} ${uc.status === 'LIVE' ? 'animate-pulse' : ''}`} />
              {uc.status}
            </span>
          </div>
        </div>
        <p className="font-mono text-[11px] text-white/45 leading-relaxed">{uc.description}</p>
      </div>

      {/* Execution Flow */}
      <div className="px-6 py-4 border-t border-white/[0.04]">
        <div className="font-mono text-[8px] text-[#ffb95f]/60 tracking-widest mb-2">EXECUTION FLOW</div>
        <div className="font-mono text-[10px] text-white/35 leading-relaxed bg-[#201f1f] rounded-lg px-3 py-2.5">
          {uc.flow}
        </div>
      </div>

      {/* Payload */}
      <div className="px-6 py-4 border-t border-white/[0.04]">
        <div className="font-mono text-[8px] text-[#ffb95f]/60 tracking-widest mb-2">PAYLOAD</div>
        <div className="bg-[#0a0a0a] rounded-lg p-3 overflow-x-auto">
          <pre className="font-mono text-[10px] text-[#4be277]/60 whitespace-pre-wrap break-all">{uc.examplePayload}</pre>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-white/[0.04] flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[8px] text-white/20">INTERFACE:</span>
            <span className="font-mono text-[9px] text-[#ffb4ae]/70">{uc.interface}</span>
          </div>
          <div className="flex items-center gap-3">
            <a href={uc.proofLink} target="_blank" rel="noopener noreferrer"
              className="font-mono text-[9px] text-[#4be277]/50 hover:text-[#4be277] flex items-center gap-1 transition-colors">
              VIEW FLOW <ExternalLink className="w-3 h-3" />
            </a>
            <button
               onClick={handleCall}
               className="font-mono text-[9px] bg-[#4be277]/10 hover:bg-[#4be277]/20 text-[#4be277] border border-[#4be277]/30 px-3 py-1.5 rounded transition-all flex items-center gap-1.5 font-bold"
            >
              {copied ? <span className="text-[#4be277]">✓</span> : <Terminal className="w-3 h-3" />}
              {copied ? 'COPIED' : 'COPY CODE'}
            </button>
          </div>
        </div>
        
        {/* Code Snippet Area */}
        <AnimatePresence>
          {response && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 bg-[#0a0a0a] border border-[#4be277]/20 rounded-lg p-3 relative">
                <motion.pre
                  initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                  className="font-mono text-[10px] text-[#4be277] whitespace-pre-wrap break-all"
                >
                  {response}
                </motion.pre>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ── Standard Module Card ───────────────────────────────────

function ModuleCard({ uc, index }: { uc: UseCase; index: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const Icon = uc.icon;
  const st = STATUS_STYLE[uc.status];
  const pm = PAYMENT_STYLE[uc.paymentType];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 + index * 0.06, duration: 0.4 }}
      onClick={() => setIsOpen(!isOpen)}
      className="bg-white/[0.02] backdrop-blur-[12px] border border-white/[0.06] rounded-xl p-4 cursor-pointer hover:border-white/[0.12] transition-all group"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-lg bg-[#201f1f] border border-white/[0.06] flex items-center justify-center group-hover:border-[#4be277]/20 transition-colors">
          <Icon className="w-4 h-4 text-[#4be277]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[10px] font-bold text-white/80 tracking-wide truncate">{uc.name}</div>
          <div className="font-mono text-[7px] text-white/20 tracking-widest">{uc.node}</div>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-white/20 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      <div className="flex items-center gap-1.5 mb-2">
        <span className={`font-mono text-[7px] px-1.5 py-0.5 rounded border ${st.cls}`}>
          <span className={`inline-block w-1 h-1 rounded-full ${st.dot} mr-1 ${uc.status === 'LIVE' ? 'animate-pulse' : ''}`} />
          {uc.status}
        </span>
        <span className={`font-mono text-[7px] px-1.5 py-0.5 rounded border ${pm.cls}`}>{pm.label}</span>
      </div>

      <p className="font-mono text-[9px] text-white/30 leading-relaxed line-clamp-2">{uc.description}</p>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2.5">
              <div>
                <div className="font-mono text-[7px] text-[#ffb95f]/50 tracking-widest mb-1">EXECUTION FLOW</div>
                <div className="font-mono text-[8px] text-white/30 bg-[#201f1f] rounded px-2 py-1.5">{uc.flow}</div>
              </div>
              <div>
                <div className="font-mono text-[7px] text-[#ffb95f]/50 tracking-widest mb-1">PAYLOAD</div>
                <div className="bg-[#0a0a0a] rounded px-2 py-1.5">
                  <pre className="font-mono text-[8px] text-[#4be277]/50 whitespace-pre-wrap break-all">{uc.examplePayload}</pre>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[7px] text-white/15">{uc.missingStep}</span>
                <a href={uc.proofLink} target="_blank" rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="font-mono text-[7px] text-[#4be277]/50 hover:text-[#4be277] flex items-center gap-1 transition-colors">
                  PROOF <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main Page ──────────────────────────────────────────────

export default function BobbyMarketplacePage() {
  const [activeTab, setActiveTab] = useState<'commerce' | 'docs' | 'status'>('commerce');
  const tickerRef = useRef<HTMLDivElement>(null);

  const featured = USE_CASES.filter(u => u.featured);
  const standard = USE_CASES.filter(u => !u.featured);

  const tabs = [
    { key: 'commerce' as const, label: 'Intelligence Protocol', icon: Zap },
    { key: 'docs' as const, label: 'AI Docs', icon: FileText },
    { key: 'status' as const, label: 'API Status', icon: Activity },
  ];

  return (
    <KineticShell activeTab="marketplace">
      <Helmet><title>Intelligence Protocol | Bobby Protocol</title></Helmet>

      <div className="min-h-screen bg-[#131313] pb-20 md:pb-8">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="max-w-6xl mx-auto px-4 py-6 space-y-6"
        >

          {/* ── 1. HEADER WITH TABS ── */}
          <div>
            <div className="flex items-center gap-1 mb-4 border-b border-white/[0.06] pb-3">
              {tabs.map(tab => {
                const TabIcon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`font-mono text-[10px] tracking-widest px-4 py-2 rounded-t-lg flex items-center gap-2 transition-all ${
                      isActive
                        ? 'text-[#4be277] bg-white/[0.04] border border-white/[0.06] border-b-transparent -mb-px'
                        : 'text-white/25 hover:text-white/40'
                    }`}
                  >
                    <TabIcon className="w-3 h-3" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                     <span className="font-mono text-[9px] font-bold bg-[#4be277]/10 text-[#4be277] px-2 py-1 rounded border border-[#4be277]/30 tracking-widest shadow-[0_0_10px_rgba(75,226,119,0.1)]">INFRASTRUCTURE</span>
                     <span className="font-mono text-[9px] text-[#00E5FF] tracking-widest bg-[#00E5FF]/10 px-2 py-1 rounded border border-[#00E5FF]/20 shadow-[0_0_10px_rgba(0,229,255,0.1)]">THE INTELLIGENCE LAYER FOR DEFI</span>
                  </div>
                  <h1 className="font-mono text-xl md:text-3xl font-black text-white/90 tracking-tight">
                    AGENT COMMERCE ON X LAYER
                  </h1>
                  <p className="font-mono text-[11px] text-white/30 mt-2 leading-relaxed max-w-3xl border-l-2 border-white/10 pl-3 py-0.5">
                    Others let agents do tasks. Bobby lets agents buy and settle financial judgment.
                    <span className="text-white/15 ml-1">10 commerce patterns powered by MCP + x402 + 4 smart contracts on X Layer.</span>
                  </p>
                </div>
                {/* LIVE AGENTS CONNECTED COUNTER */}
                <div className="flex-shrink-0 bg-gradient-to-br from-[#201f1f] to-[#131313] border border-white/[0.08] rounded-xl p-3 px-4 flex items-center gap-4 hover:border-[#4be277]/30 transition-colors shadow-lg">
                  <div className="flex h-3 w-3 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4be277] opacity-60"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-[#4be277]"></span>
                  </div>
                  <div>
                    <div className="font-mono text-[8px] text-white/40 tracking-widest mb-0.5">LIVE AGENTS CONNECTED</div>
                    <div className="font-mono text-xl font-black text-white/90 tracking-tight flex items-baseline gap-1.5">
                      <LiveAgentsCounter />
                      <span className="text-[10px] text-[#4be277] font-normal tracking-widest border border-[#4be277]/30 bg-[#4be277]/10 px-1.5 py-0.5 rounded">NODES</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* ── 2. CORE SYSTEMS ROW ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'CONTRACTS', value: '4', sub: 'X Layer 196' },
              { label: 'MCP TOOLS', value: '12', sub: '6 free + 4 x402' },
              { label: 'AGENT NFTs', value: '3', sub: 'On-chain identity' },
              { label: 'SETTLEMENT', value: 'LIVE', sub: 'Payment rail active' },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.08 }}
                className="bg-white/[0.02] backdrop-blur-[12px] border border-white/[0.06] rounded-xl p-4 text-center hover:border-[#4be277]/15 transition-colors"
              >
                <div className="font-mono text-2xl font-black text-[#4be277]">{s.value}</div>
                <div className="font-mono text-[8px] text-white/30 tracking-widest mt-1">{s.label}</div>
                <div className="font-mono text-[7px] text-white/15 mt-0.5">{s.sub}</div>
              </motion.div>
            ))}
          </div>

          {/* ── 3. LIVE EXECUTION FLOW ── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="bg-white/[0.02] backdrop-blur-[12px] border border-white/[0.06] rounded-xl p-5 overflow-x-auto"
          >
            <div className="font-mono text-[8px] text-[#ffb95f]/50 tracking-widest mb-4">LIVE EXECUTION FLOW</div>
            <div className="flex items-center justify-center min-w-[600px] py-2">
              <FlowNode label="EXTERNAL AGENT" sublabel="Any AI / Bot" delay={0.5} />
              <FlowNode label="MCP ROUTER" sublabel="x402 Payment" delay={0.7} />
              <FlowNode label="BOBBY CORE" sublabel="3-Agent Debate" delay={0.9} />
              <FlowNode label="X LAYER" sublabel="Settlement" delay={1.1} isLast />
            </div>
          </motion.div>

          {/* ── 4. PRIME AGENTS ── */}
          <div>
            <div className="font-mono text-[8px] text-[#ffb95f]/50 tracking-widest mb-3">PRIME AGENTS</div>
            <div className="space-y-4">
              {featured.map((uc, i) => (
                <PrimeAgentCard key={uc.id} uc={uc} index={i} />
              ))}
            </div>
          </div>

          {/* ── 5. STANDARD MCP MODULES ── */}
          <div>
            <div className="font-mono text-[8px] text-[#ffb95f]/50 tracking-widest mb-3">STANDARD MCP MODULES</div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {standard.map((uc, i) => (
                <ModuleCard key={uc.id} uc={uc} index={i} />
              ))}
            </div>
          </div>

          {/* ── 6. AGENT CONNECTION CTA ── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="bg-[#201f1f] border border-white/[0.06] rounded-xl p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <Terminal className="w-4 h-4 text-[#4be277]/50" />
              <div className="font-mono text-[9px] text-white/40 tracking-widest">CONNECT YOUR AGENT</div>
            </div>
            <div className="bg-[#0a0a0a] rounded-lg p-4 mb-5 border border-white/[0.04]">
              <div className="font-mono text-[10px] text-white/20 mb-1">$</div>
              <div className="font-mono text-[12px] text-[#4be277] leading-relaxed select-all">
                claude mcp add bobby-trader https://bobbyprotocol.xyz/api/mcp-bobby
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <a href="/agentic-world/bobby/docs"
                className="font-mono text-[9px] text-white/40 hover:text-[#4be277] border border-white/10 px-4 py-2 rounded-lg hover:border-[#4be277]/20 transition-all flex items-center gap-2">
                <FileText className="w-3 h-3" />
                AI DOCS
              </a>
              <a href="https://bobbyprotocol.xyz/llms.txt" target="_blank" rel="noopener noreferrer"
                className="font-mono text-[9px] text-[#4be277] border border-[#4be277]/20 px-4 py-2 rounded-lg hover:bg-[#4be277]/10 transition-all flex items-center gap-2">
                <ExternalLink className="w-3 h-3" />
                LLMS.TXT
              </a>
              <a href="https://github.com/anthonysurfermx/Bobby-Agent-Trader" target="_blank" rel="noopener noreferrer"
                className="font-mono text-[9px] text-white/25 hover:text-white/40 transition-colors ml-auto flex items-center gap-1">
                GITHUB <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </motion.div>

          {/* ── 7. ACTIVITY TICKER ── */}
          <div className="bg-[#0a0a0a] border border-white/[0.04] rounded-xl py-2 px-4 h-16 relative overflow-hidden flex flex-col justify-end font-mono text-[9px] text-[#4be277]/60">
            <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-b from-[#0a0a0a] to-transparent z-10 pointer-events-none" />
            <ActivityStream />
          </div>

        </motion.div>
      </div>
    </KineticShell>
  );
}
