// ============================================================
// Agentic World Landing Page — Stitch "DeFi México" design
// Showcases all 4 AI products: Bobby, Polymarket Radar,
// Leaderboard, Agent Forum
// ============================================================

import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Brain, Crosshair, BarChart3, Swords } from 'lucide-react';

export default function AgenticWorldPage() {
  // Fetch real stats
  const [stats, setStats] = useState({ trades: 0, equity: 0, return: 0, debates: 0 });

  useEffect(() => {
    fetch('/api/bobby-pnl')
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setStats(prev => ({
            ...prev,
            trades: d.summary.totalTrades,
            equity: d.summary.currentEquity,
            return: d.summary.totalReturn,
          }));
        }
      })
      .catch(() => {});

    // Fetch debate count
    const SB = 'https://egpixaunlnzauztbrnuz.supabase.co';
    const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVncGl4YXVubG56YXV6dGJybnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTc3MDQsImV4cCI6MjA3MDg3MzcwNH0.jlWxBgUiBLOOptESdBYzisWAbiMnDa5ktzFaCGskew4';
    fetch(`${SB}/rest/v1/forum_threads?select=id`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setStats(prev => ({ ...prev, debates: d.length })); })
      .catch(() => {});
  }, []);

  // Ticker tape with live prices
  const [tickers, setTickers] = useState<Array<{ symbol: string; change24h: number }>>([]);
  useEffect(() => {
    fetch('/api/okx-tickers')
      .then(r => r.json())
      .then(d => { if (d.ok) setTickers(d.tickers.slice(0, 8)); })
      .catch(() => {});
  }, []);

  const tickerItems = tickers.length > 0
    ? tickers.map(t => `$${t.symbol} ${t.change24h >= 0 ? '+' : ''}${t.change24h}%`)
    : ['SYSTEM_STATUS: LOADING...'];
  const doubled = [...tickerItems, ...tickerItems];

  const PRODUCTS = [
    {
      icon: Brain,
      name: 'THE METACOGNITIVE ROOM',
      tag: 'DEPLOY YOUR AGENT',
      tagColor: 'text-green-400',
      borderHover: 'hover:border-green-500/30',
      dotColor: 'bg-green-500',
      dotGlow: 'shadow-[0_0_10px_#4be277]',
      iconBg: 'bg-green-500/10 border-green-500/20',
      iconColor: 'text-green-400',
      description: 'Name your agent. Pick your markets. Set your frequency. Your CIO thinks while you sleep — scanning BTC, NVDA, Gold, whatever you choose. Not alerts. Not a bot. A system that debates itself before it speaks.',
      metric: stats.return !== 0 ? `${stats.return >= 0 ? '+' : ''}${stats.return}% Return` : 'LIVE',
      metricColor: 'text-green-400',
      cta: 'CREATE MY AGENT',
      ctaBg: 'bg-green-500/5 hover:bg-green-500 text-green-400 hover:text-black border-green-500/20',
      link: '/agentic-world/deploy',
    },
    {
      icon: Crosshair,
      name: 'SMART MONEY RADAR',
      tag: 'POLYMARKET INTELLIGENCE',
      tagColor: 'text-blue-400',
      borderHover: 'hover:border-blue-500/30',
      dotColor: 'bg-blue-500',
      dotGlow: 'shadow-[0_0_10px_#3b82f6]',
      iconBg: 'bg-blue-500/10 border-blue-500/20',
      iconColor: 'text-blue-400',
      description: 'See what the top 50 most profitable Polymarket traders are actually doing with their money. Not what they say — what they bet. Capital-weighted consensus, whale entry/exit alerts, Sankey flow maps.',
      metric: 'SMART MONEY',
      metricColor: 'text-blue-400',
      cta: 'OPEN RADAR',
      ctaBg: 'bg-blue-500/5 hover:bg-blue-500 text-blue-400 hover:text-black border-blue-500/20',
      link: '/agentic-world/polymarket',
    },
    {
      icon: BarChart3,
      name: 'THE $100 CHALLENGE',
      tag: 'PROOF OF INTELLIGENCE',
      tagColor: 'text-amber-400',
      borderHover: 'hover:border-amber-500/30',
      dotColor: 'bg-amber-500',
      dotGlow: 'shadow-[0_0_10px_#f59e0b]',
      iconBg: 'bg-amber-500/10 border-amber-500/20',
      iconColor: 'text-amber-400',
      description: 'Bobby started with $100 of real money. Every trade committed to X Layer BEFORE the outcome. No cherry-picking. No hindsight. The most honest track record in crypto — verifiable on-chain.',
      metric: `$${stats.equity.toFixed(2)} EQUITY`,
      metricColor: stats.return >= 0 ? 'text-green-400' : 'text-red-400',
      cta: 'SEE THE PROOF',
      ctaBg: 'bg-amber-500/5 hover:bg-amber-500 text-amber-400 hover:text-black border-amber-500/20',
      link: '/agentic-world/bobby/challenge',
    },
    {
      icon: Swords,
      name: 'THE DEBATE ARCHIVE',
      tag: 'FULL TRANSPARENCY',
      tagColor: 'text-purple-400',
      borderHover: 'hover:border-purple-500/30',
      dotColor: 'bg-purple-500',
      dotGlow: 'shadow-[0_0_10px_#a855f7]',
      iconBg: 'bg-purple-500/10 border-purple-500/20',
      iconColor: 'text-purple-400',
      description: 'Before every trade, Alpha presents a thesis. Red Team tries to kill it. The CIO weighs both and decides. Every argument is public. Every conviction score is real. Judge the logic yourself.',
      metric: `${stats.debates} DEBATES`,
      metricColor: 'text-purple-400',
      cta: 'READ THE DEBATES',
      ctaBg: 'bg-purple-500/5 hover:bg-purple-500 text-purple-400 hover:text-black border-purple-500/20',
      link: '/agentic-world/forum',
    },
  ];

  return (
    <div className="min-h-screen bg-[#050505] text-white font-['Inter']">
      <Helmet>
        <title>Deploy Your AI Trading Room | Bobby Agent Trader</title>
        <meta name="description" content="Create your personal AI Trading Room. Three agents debate the markets for you — you decide. Built on OKX X Layer." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://defimexico.org/agentic-world" />
        <meta property="og:title" content="Deploy Your AI Trading Room | Bobby Agent Trader" />
        <meta property="og:description" content="Three agents debate the markets for you — you decide. On-chain proof on OKX X Layer." />
        <meta property="og:image" content="https://defimexico.org/bobby-hero.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Deploy Your AI Trading Room | Bobby Agent Trader" />
        <meta name="twitter:description" content="Three agents debate the markets for you — you decide." />
        <meta name="twitter:image" content="https://defimexico.org/bobby-hero.png" />
      </Helmet>

      {/* CRT Scanline Overlay */}
      <div className="fixed inset-0 pointer-events-none z-[100] opacity-[0.15]"
        style={{ background: 'linear-gradient(to bottom, rgba(18,16,16,0) 50%, rgba(0,0,0,0.25) 50%), linear-gradient(90deg, rgba(255,0,0,0.06), rgba(0,255,0,0.02), rgba(0,0,255,0.06))', backgroundSize: '100% 4px, 3px 100%' }} />

      {/* Ticker Tape */}
      <div className="w-full bg-[#1c1b1b] h-8 flex items-center overflow-hidden border-b border-white/5">
        <div className="flex whitespace-nowrap gap-12 text-[10px] font-mono text-green-400/50 uppercase tracking-widest animate-marquee">
          {doubled.map((item, i) => <span key={i}>{item}</span>)}
        </div>
      </div>

      {/* Hero */}
      <section className="relative w-full py-20 md:py-32 px-6 md:px-16 lg:px-24 overflow-hidden border-b border-white/5">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-green-500/5 to-transparent pointer-events-none" />
        <div className="absolute -right-20 top-20 opacity-10 blur-3xl pointer-events-none">
          <div className="w-[400px] h-[400px] bg-green-500 rounded-full" />
        </div>

        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 max-w-5xl">
          <div className="flex items-center gap-3 mb-6">
            <span className="h-px w-12 bg-green-500" />
            <span className="font-mono text-green-400 text-xs tracking-[0.4em] uppercase">Not another trading bot — Built on OKX X Layer</span>
          </div>

          <h1 className="text-4xl md:text-6xl lg:text-8xl font-black tracking-tighter leading-none mb-4 uppercase text-transparent bg-clip-text bg-gradient-to-br from-white via-white to-white/20">
            A TRADING ROOM<br/>THAT <span className="text-green-400 italic">THINKS</span>
          </h1>
          <p className="text-lg md:text-xl text-white/60 font-bold mb-4">
            Not a bot. Not alerts. A metacognitive system where 3 AI agents debate every move before you see it.
          </p>

          <p className="text-sm md:text-base text-white/30 max-w-2xl leading-relaxed mb-12 border-l-2 border-green-500/20 pl-8">
            Alpha Hunter scans 10,000+ data points. Red Team stress-tests every thesis. Your CIO weighs both sides and decides.
            The result? Market intelligence a single human brain can't produce.
          </p>

          <div className="flex flex-wrap gap-4">
            <Link to="/agentic-world/deploy"
              className="bg-green-500 text-black px-8 md:px-10 py-4 md:py-5 text-sm font-black font-mono tracking-widest hover:scale-[1.02] active:scale-95 transition-all"
              style={{ boxShadow: '0 0 30px rgba(75,226,119,0.3)' }}>
              CREATE MY AGENT
            </Link>
            <Link to="/agentic-world/bobby/b2b"
              className="bg-blue-500/10 backdrop-blur-md border border-blue-500/30 text-blue-400 px-8 md:px-10 py-4 md:py-5 text-sm font-bold font-mono tracking-widest hover:bg-blue-500/20 transition-all">
              ADD TO MY TELEGRAM GROUP
            </Link>
          </div>
          <div className="flex gap-4 mt-3">
            <Link to="/agentic-world/bobby/challenge"
              className="text-white/30 text-[10px] font-mono tracking-wider hover:text-white/60 transition-colors">
              See Bobby's $100 Challenge →
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Social Proof Strip */}
      <section className="w-full bg-[#0e0e0e] border-b border-white/5 py-5">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row justify-between items-center gap-6">
          {[
            { value: '50+', label: 'REAL TRADERS' },
            { value: `${stats.trades}`, label: 'TRADES EXECUTED' },
            { value: 'OKX X LAYER', label: 'ON-CHAIN VERIFIED' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3">
              {i > 0 && <div className="h-4 w-px bg-white/10 hidden sm:block" />}
              <span className="font-mono text-green-400 text-xl font-bold">{item.value}</span>
              <span className="font-mono text-white/30 text-[10px] uppercase tracking-widest">{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Demo Video */}
      <section className="px-6 md:px-12 lg:px-24 pb-12 max-w-[1600px] mx-auto">
        <div className="text-center mb-6">
          <span className="text-[9px] font-mono text-white/20 tracking-widest">WATCH_THE_DEMO</span>
        </div>
        <div className="relative w-full aspect-video bg-black/50 border border-white/[0.06] rounded-xl overflow-hidden">
          <iframe
            src="https://www.youtube.com/embed/i7FzQiYnYqg"
            title="Bobby Agent Trader Demo"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
          />
        </div>
      </section>

      {/* Product Bento Grid */}
      <section className="p-6 md:p-12 lg:p-24 max-w-[1600px] mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          {PRODUCTS.map((product, i) => (
            <motion.div key={product.name} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.1 }}
              className={`group relative overflow-hidden bg-[#1c1b1b] p-8 md:p-10 border border-white/5 ${product.borderHover} transition-all duration-500 flex flex-col justify-between min-h-[350px] md:min-h-[400px]`}>
              {/* Corner dot */}
              <div className="absolute top-0 right-0 p-4">
                <div className={`w-1 h-1 ${product.dotColor} ${product.dotGlow}`} />
              </div>

              <div>
                <div className="flex items-center gap-4 mb-6 md:mb-8">
                  <div className={`w-12 h-12 md:w-14 md:h-14 ${product.iconBg} flex items-center justify-center border`}>
                    <product.icon className={`w-6 h-6 md:w-7 md:h-7 ${product.iconColor}`} />
                  </div>
                  <div>
                    <h3 className="font-black text-xl md:text-2xl tracking-tighter">{product.name}</h3>
                    <p className={`font-mono text-[10px] ${product.tagColor} tracking-[0.2em]`}>{product.tag}</p>
                  </div>
                </div>
                <p className="text-white/40 leading-relaxed max-w-sm mb-6 md:mb-8 text-sm md:text-base">
                  {product.description}
                </p>
              </div>

              <div className="flex justify-between items-end">
                <div className="font-mono">
                  <div className="text-[10px] text-white/30 uppercase mb-1">Live Status</div>
                  <div className={`text-2xl md:text-3xl font-bold ${product.metricColor} tracking-tighter`}>{product.metric}</div>
                </div>
                <Link to={product.link}
                  className={`${product.ctaBg} px-5 md:px-6 py-2.5 md:py-3 font-mono text-[10px] md:text-xs font-bold transition-all border active:scale-95`}>
                  {product.cta}
                </Link>
              </div>

              {/* Hover glow */}
              <div className={`absolute bottom-0 right-0 w-32 h-32 ${product.dotColor}/5 rounded-tl-full blur-2xl pointer-events-none group-hover:opacity-100 opacity-0 transition-all`} />
            </motion.div>
          ))}
        </div>
      </section>

      {/* Infrastructure on X Layer */}
      <section className="px-6 md:px-12 lg:px-24 py-12 border-t border-white/5">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <span className="h-px w-8 bg-green-500" />
            <span className="font-mono text-green-400 text-[10px] tracking-[0.3em] uppercase">Infrastructure on X Layer</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'SMART CONTRACTS', value: '4', sub: 'Deployed on Chain 196' },
              { label: 'MCP TOOLS', value: '12', sub: 'Free + Premium (x402)' },
              { label: 'AGENT NFTs', value: '3', sub: 'On-chain Identity' },
              { label: 'AI MODELS', value: '5', sub: 'Claude + GPT + Gemini' },
            ].map(s => (
              <div key={s.label} className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4 text-center">
                <div className="font-mono text-2xl font-black text-green-400">{s.value}</div>
                <div className="font-mono text-[8px] text-white/30 tracking-widest mt-1">{s.label}</div>
                <div className="font-mono text-[7px] text-white/15 mt-0.5">{s.sub}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
            {[
              { name: 'TrackRecord', addr: '0xf841b428e6d743187d7be2242eccc1078fde2395', desc: 'Commit-reveal predictions' },
              { name: 'ConvictionOracle', addr: '0x03fa39b3a5b316b7cacdabd3442577ee32ab5f3a', desc: 'Conviction feed for protocols' },
              { name: 'AgentEconomy', addr: '0xD9540D770C8aF67e9E6412C92D78E34bc11ED871', desc: 'Agent-to-agent payments' },
              { name: 'AgentRegistry', addr: '0x823a1670f521a35d4fafe4502bdcb3a8148bba8b', desc: 'Agent Identity NFTs' },
            ].map(c => (
              <a key={c.name} href={`https://www.oklink.com/xlayer/address/${c.addr}`} target="_blank" rel="noopener noreferrer"
                className="bg-white/[0.01] border border-white/[0.04] rounded-lg px-3 py-2 flex items-center justify-between hover:border-green-500/20 transition-all group">
                <div>
                  <div className="font-mono text-[9px] text-white/50 font-bold">{c.name}</div>
                  <div className="font-mono text-[7px] text-white/20">{c.desc}</div>
                </div>
                <span className="font-mono text-[7px] text-green-400/40 group-hover:text-green-400 transition-colors">VIEW↗</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Telegram B2B Banner */}
      <section className="px-6 md:px-12 lg:px-24 pb-12">
        <Link to="/agentic-world/bobby/b2b"
          className="block max-w-[1600px] mx-auto bg-gradient-to-r from-blue-500/10 via-green-500/5 to-blue-500/10 border border-blue-500/20 p-8 md:p-12 hover:border-blue-500/40 transition-all group">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-blue-400 text-lg">⚡</span>
                <span className="text-[9px] font-mono text-blue-400 tracking-widest uppercase">TELEGRAM GROUP INTELLIGENCE</span>
              </div>
              <h3 className="text-xl md:text-2xl font-black tracking-tight">Turn Your Trading Group Into an AI Room</h3>
              <p className="text-white/30 text-sm mt-1">Voice notes · Multi-agent debates · On-chain signals · x402 payments</p>
            </div>
            <div className="flex items-center gap-2 text-blue-400 font-mono text-sm font-bold tracking-wider group-hover:gap-3 transition-all">
              LEARN MORE →
            </div>
          </div>
        </Link>
      </section>

      {/* Minimal footer line — no infrastructure section */}

      {/* Footer */}
      <footer className="w-full bg-[#050505] py-10 border-t border-green-900/20">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="font-mono text-[10px] text-white/20 uppercase tracking-widest">
            © 2026 BOBBY AGENT TRADER — BUILT ON OKX X LAYER
          </div>
          <div className="flex gap-6">
            {[
              { label: 'TERMINAL', path: '/agentic-world/bobby' },
              { label: 'CHALLENGE', path: '/agentic-world/bobby/challenge' },
              { label: 'RADAR', path: '/agentic-world/polymarket' },
              { label: 'FORUM', path: '/agentic-world/forum' },
            ].map(link => (
              <Link key={link.label} to={link.path}
                className="font-mono text-[10px] text-white/20 uppercase tracking-widest hover:text-green-400 transition-colors">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
