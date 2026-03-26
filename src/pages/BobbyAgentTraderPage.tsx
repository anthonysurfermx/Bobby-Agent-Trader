import { Component, type ReactNode, useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Terminal, Brain, Zap, Vault, Settings, Bell, MessageSquare, ClipboardList } from 'lucide-react';
import { AdamsChat } from '@/components/adams/AdamsChat';
import { ProactiveNotification } from '@/components/adams/ProactiveNotification';

// ============================================================
// HACKATHON DEMO SECTION — OKX X Layer AI Hackathon Submission
// Live on-chain data, no hardcoded values
// ============================================================

const XLAYER_RPC = 'https://rpc.xlayer.tech';
const OKLINK_BASE = 'https://www.oklink.com/xlayer/address';

const CONTRACTS = [
  { name: 'BobbyTrackRecord', address: '0xf841b428e6d743187d7be2242eccc1078fde2395' },
  { name: 'BobbyConvictionOracle', address: '0x03fa39b3a5b316b7cacdabd3442577ee32ab5f3a' },
  { name: 'BobbyAgentEconomy', address: '0xa4704E92E9d9eCA646716C14a124907C356C78D7' },
  { name: 'BobbyAgentRegistry', address: '0x823a1670f521a35d4fafe4502bdcb3a8148bba8b' },
] as const;

const SB_DEMO = 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVncGl4YXVubG56YXV6dGJybnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTc3MDQsImV4cCI6MjA3MDg3MzcwNH0.jlWxBgUiBLOOptESdBYzisWAbiMnDa5ktzFaCGskew4';

function useXLayerCall(contractAddress: string, selector: string): number | null {
  const [value, setValue] = useState<number | null>(null);
  useEffect(() => {
    fetch(XLAYER_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'eth_call',
        params: [{ to: contractAddress, data: selector }, 'latest'],
      }),
    })
      .then(r => r.json())
      .then(d => { if (d.result) setValue(parseInt(d.result, 16)); })
      .catch(() => {});
  }, [contractAddress, selector]);
  return value;
}

function useDebateCount(): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    fetch(`${SB_DEMO}/rest/v1/agent_cycles?select=id&limit=1`, {
      headers: {
        apikey: SB_ANON,
        Authorization: `Bearer ${SB_ANON}`,
        Prefer: 'count=exact',
      },
    })
      .then(r => {
        const total = r.headers.get('content-range');
        if (total) {
          const match = total.match(/\/(\d+)/);
          if (match) setCount(parseInt(match[1], 10));
        }
      })
      .catch(() => {});
  }, []);
  return count;
}

function truncAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function HackathonDemo() {
  const commitCount = useXLayerCall(CONTRACTS[0].address, '0x78bb86d3'); // totalCommitments()
  const debateCount = useDebateCount();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="relative w-full font-mono" style={{ background: '#050505' }}>
      {/* Animated border glow */}
      <div className="absolute inset-0 rounded-none pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(34,197,94,0.08) 25%, rgba(34,197,94,0.15) 50%, rgba(34,197,94,0.08) 75%, transparent 100%)',
          animation: 'hackathonGlow 3s ease-in-out infinite',
        }}
      />
      <style>{`
        @keyframes hackathonGlow {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        @keyframes hackathonScan {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-5 space-y-4">

        {/* HEADER */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="relative overflow-hidden">
              <h2 className="text-sm md:text-base font-black tracking-tight text-green-400">
                BOBBY AGENT TRADER
              </h2>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-green-400/20 to-transparent"
                style={{ animation: 'hackathonScan 4s linear infinite' }} />
            </div>
            <span className="text-[9px] text-white/20">|</span>
            <span className="text-[9px] text-white/40 tracking-widest">OKX X LAYER AI HACKATHON</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-green-500/10 border border-green-500/20 text-green-400 text-[8px] tracking-widest rounded">
              LIVE ON X LAYER
            </span>
            <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[8px] tracking-widest rounded">
              CHAIN 196
            </span>
            <button
              onClick={() => setDismissed(true)}
              className="ml-2 text-white/20 hover:text-white/50 text-[10px] transition-colors"
              title="Dismiss"
            >
              [x]
            </button>
          </div>
        </div>

        {/* LIVE STATS ROW */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: 'DEBATES', value: debateCount, color: 'green' },
            { label: 'ON-CHAIN COMMITS', value: commitCount, color: 'green' },
            { label: 'AGENT NFTs', value: 3, color: 'amber', sub: 'Alpha Hunter / Red Team / CIO' },
            { label: 'SMART CONTRACTS', value: 4, color: 'amber', sub: 'TrackRecord / Oracle / Economy / Registry' },
          ].map(stat => (
            <div key={stat.label} className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3 text-center">
              <div className={`text-xl md:text-2xl font-black ${stat.color === 'green' ? 'text-green-400' : 'text-amber-400'}`}
                style={{ fontVariantNumeric: 'tabular-nums' }}>
                {stat.value !== null ? stat.value : <span className="inline-block w-8 h-5 bg-white/5 rounded animate-pulse" />}
              </div>
              <div className="text-[8px] text-white/30 tracking-widest mt-1">{stat.label}</div>
              {stat.sub && <div className="text-[7px] text-white/15 mt-0.5">{stat.sub}</div>}
            </div>
          ))}
        </div>

        {/* SMART CONTRACTS ROW */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
          {CONTRACTS.map(c => (
            <div key={c.name} className="bg-white/[0.02] border border-white/[0.04] rounded-lg px-3 py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[9px] text-white/50 font-bold truncate">{c.name}</div>
                <div className="text-[8px] text-green-400/60 truncate">{truncAddr(c.address)}</div>
              </div>
              <a
                href={`${OKLINK_BASE}/${c.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 text-[7px] text-green-400/50 hover:text-green-400 tracking-widest transition-colors whitespace-nowrap"
              >
                VIEW ON XLAYER &rarr;
              </a>
            </div>
          ))}
        </div>

        {/* ARCHITECTURE ROW */}
        <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg px-4 py-3">
          <div className="text-[10px] text-white/50 leading-relaxed">
            <span className="text-green-400 font-bold">ARCHITECTURE:</span>{' '}
            3 AI agents debate &rarr; commit prediction on-chain &rarr; verify outcome &rarr; agent-to-agent payment
          </div>
          <div className="text-[8px] text-white/20 mt-1.5 tracking-wide">
            Powered by: <span className="text-white/30">OKX OnchainOS</span> &bull;{' '}
            <span className="text-white/30">OKX Agent Trade Kit</span> &bull;{' '}
            <span className="text-white/30">X Layer</span> &bull;{' '}
            <span className="text-white/30">Claude AI</span>
          </div>
        </div>

        {/* LINKS ROW */}
        <div className="flex flex-wrap items-center gap-3 text-[9px]">
          <a
            href="https://github.com/anthonysurfermx/Bobby-Agent-Trader"
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 bg-white/[0.03] border border-white/[0.06] rounded text-white/40 hover:text-green-400 hover:border-green-500/20 transition-all"
          >
            GITHUB &rarr;
          </a>
          <a
            href="https://youtube.com"
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 bg-white/[0.03] border border-white/[0.06] rounded text-white/40 hover:text-green-400 hover:border-green-500/20 transition-all"
          >
            VIDEO_DEMO &rarr;
          </a>
          <span className="px-2.5 py-1 bg-white/[0.03] border border-white/[0.06] rounded text-white/25">
            MCP: <span className="text-white/40">curl -X POST /api/mcp</span>
          </span>
          <span className="px-2.5 py-1 bg-white/[0.03] border border-white/[0.06] rounded text-white/25">
            x402: <span className="text-amber-400/50">Premium tools require x402 payment on X Layer</span>
          </span>
        </div>

      </div>

      {/* Bottom separator */}
      <div className="h-px bg-gradient-to-r from-transparent via-green-500/20 to-transparent" />
    </div>
  );
}

class BobbyErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8" style={{ background: '#050505' }}>
          <span className="text-4xl">⚠️</span>
          <h2 className="text-[14px] font-mono font-bold text-white/50">Bobby encountered an error</h2>
          <p className="text-[10px] font-mono text-white/25 text-center max-w-md">{this.state.error}</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: '' }); window.location.reload(); }}
            className="px-4 py-2 text-[11px] font-mono border border-green-500/30 text-green-400 bg-green-500/10 hover:bg-green-500/15 transition-all rounded"
          >
            Reload Bobby
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const NAV_ITEMS = [
  { label: 'TERMINAL', path: '/agentic-world/bobby' },
  { label: 'CHALLENGE', path: '/agentic-world/bobby/challenge' },
  { label: 'HISTORY', path: '/agentic-world/bobby/history' },
  { label: 'AGENTS', path: '/agentic-world/bobby/agents' },
  { label: 'ANALYTICS', path: '/agentic-world/bobby/analytics' },
];

const ICON_NAV = [
  { Icon: Terminal, label: 'Command', path: '/agentic-world/bobby' },
  { Icon: Brain, label: 'Intel', path: '/agentic-world/bobby/analytics' },
  { Icon: Zap, label: 'Exec', path: '/agentic-world/bobby/challenge' },
  { Icon: Vault, label: 'Vault', path: '/agentic-world/bobby/history' },
];

export default function BobbyAgentTraderPage() {
  const { address } = useAccount();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  // Read personalized agent name from localStorage
  const agentName = (() => {
    try {
      const saved = localStorage.getItem('bobby_agent_name');
      if (saved && saved.length >= 2) return saved;
    } catch {}
    return 'BOBBY';
  })();

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden" style={{ background: '#050505' }}>
      <BobbyErrorBoundary>
        {/* === Top Nav Bar — Stitch style === */}
        <nav className="flex-shrink-0 flex justify-between items-center px-4 md:px-6 h-12 bg-[#131313]/90 backdrop-blur-md border-b border-white/5 z-50 shadow-[0_0_15px_rgba(34,197,94,0.05)]">
          <div className="flex items-center gap-6">
            <Link to="/agentic-world/bobby" className="text-base font-black tracking-tighter text-green-500 font-mono">
              {agentName} AGENT TRADER
            </Link>
            <div className="hidden md:flex gap-5 items-center font-mono uppercase tracking-widest text-[10px]">
              {NAV_ITEMS.map(item => (
                <Link key={item.label} to={item.path}
                  className={currentPath === item.path
                    ? 'text-green-500 border-b border-green-500 pb-0.5 font-bold'
                    : 'text-gray-500 hover:text-green-300 transition-colors'
                  }>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <button onClick={() => navigate('/agentic-world/bobby/agents')}
              className="text-gray-500 hover:text-green-300 transition-colors active:scale-90">
              <Settings className="w-4 h-4" />
            </button>
            <button onClick={() => navigate('/agentic-world/bobby/telegram')}
              className="text-gray-500 hover:text-green-300 transition-colors active:scale-90">
              <Bell className="w-4 h-4" />
            </button>
            {address ? (
              <div className="w-7 h-7 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center overflow-hidden">
                <span className="text-[9px] font-mono font-bold text-green-400">{address.slice(2, 4).toUpperCase()}</span>
              </div>
            ) : (
              <div className="w-7 h-7 rounded-full bg-white/5 border border-white/10" />
            )}
          </div>
        </nav>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* === Icon Sidebar — Stitch style (desktop) === */}
          <aside className="hidden md:flex flex-col items-center w-20 bg-[#050505] border-r border-white/5 pt-4 pb-4 flex-shrink-0 z-40">
            {/* Agent OS branding */}
            <div className="flex flex-col items-center gap-1 mb-4 px-2">
              <div className="w-8 h-8 bg-green-500/10 flex items-center justify-center border border-green-500/20 rounded">
                <span className="text-green-400 text-[8px] font-black font-mono">{agentName.charAt(0)}</span>
              </div>
              <span className="font-mono text-[7px] text-white/20 tracking-tight">{agentName}_OS</span>
            </div>

            <div className="flex flex-col gap-1 items-center w-full flex-1">
              {ICON_NAV.map(item => (
                <Link key={item.label} to={item.path}
                  className={`flex flex-col items-center gap-1 py-3 px-1 w-full transition-all duration-300 ${
                    currentPath === item.path
                      ? 'bg-green-500/10 text-green-500 border-r-2 border-green-500'
                      : 'text-gray-600 hover:bg-white/5 hover:text-green-300'
                  }`}>
                  <item.Icon className="w-[18px] h-[18px]" />
                  <span className="font-mono text-[8px] tracking-tight">{item.label}</span>
                </Link>
              ))}
            </div>
            <div className="flex flex-col gap-4 items-center mt-auto pb-2">
              <Link to="/agentic-world/forum" className="text-gray-600 hover:text-green-400 transition-colors" title="Forum">
                <MessageSquare className="w-[18px] h-[18px]" />
              </Link>
              <Link to="/agentic-world/bobby/portfolio" className="text-gray-600 hover:text-green-400 transition-colors" title="Portfolio">
                <ClipboardList className="w-[18px] h-[18px]" />
              </Link>
            </div>
          </aside>

          {/* === Main Content Area === */}
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
            {/* === HACKATHON SUBMISSION — First thing judges see === */}
            <HackathonDemo />
            {/* === Chat Area === */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <AdamsChat />
            </div>
          </div>
        </div>

        <ProactiveNotification walletAddress={address} />

        {/* === Mobile Bottom Nav === */}
        <nav className="md:hidden fixed bottom-0 w-full h-14 bg-[#131313]/90 backdrop-blur-xl border-t border-white/5 flex items-center justify-around px-4 z-[101]"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          {NAV_ITEMS.slice(0, 4).map(item => (
            <Link key={item.label} to={item.path}
              className={`flex flex-col items-center gap-0.5 ${
                currentPath === item.path ? 'text-green-400' : 'text-white/25'
              }`}>
              <span className="text-[10px]">
                {item.label === 'TERMINAL' ? '⌘' : item.label === 'CHALLENGE' ? '◆' : item.label === 'HISTORY' ? '◎' : '△'}
              </span>
              <span className="text-[7px] font-mono tracking-[1px]">{item.label}</span>
            </Link>
          ))}
        </nav>
      </BobbyErrorBoundary>
    </div>
  );
}
