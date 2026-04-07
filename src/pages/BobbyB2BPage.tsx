// ============================================================
// Bobby B2B Landing — Stitch "Telegram Group Intelligence"
// Targets trading community leaders and group admins
// x402 payment flow for group activation
// ============================================================

import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Mic, MessageSquare, Signal, Radar, Shield, CreditCard, ChevronDown, TrendingUp, AlertTriangle, BarChart3 } from 'lucide-react';

const AGENTS = [
  {
    name: 'Alpha Hunter', color: 'text-green-400', bgHover: 'hover:bg-green-500/5',
    iconBg: 'bg-green-500/20 border-green-500/30', Icon: TrendingUp,
    desc: 'Scans markets and social sentiment to identify breakouts before they happen.',
    bars: [1, 3, 5, 2, 4, 1, 3, 5, 2, 4],
  },
  {
    name: 'Red Team', color: 'text-red-400', bgHover: 'hover:bg-red-500/5',
    iconBg: 'bg-red-500/20 border-red-500/30', Icon: AlertTriangle,
    desc: 'The ultimate skeptic. Analyzes liquidity, contract safety, and whale manipulation risks.',
    bars: [4, 2, 6, 3, 1, 4, 2, 6, 3, 1],
  },
  {
    name: 'Bobby CIO', color: 'text-amber-400', bgHover: 'hover:bg-amber-500/5',
    iconBg: 'bg-amber-500/20 border-amber-500/30', Icon: BarChart3,
    desc: 'The final word. Balances both arguments for clear entry/exit points and risk management.',
    bars: [2, 5, 3, 6, 2, 5, 3, 6, 2, 5],
  },
];

const FEATURES = [
  { Icon: Mic, title: 'Voice Notes', desc: 'Agents send real-time audio analysis directly into the group.' },
  { Icon: MessageSquare, title: 'Multi-Agent Debates', desc: 'Watch Alpha and Red Team clash while CIO decides the play.' },
  { Icon: Signal, title: 'Real-Time Signals', desc: 'Formatted alerts for entries, TPs, and stop losses without lag.' },
  { Icon: Radar, title: 'Market Scanning', desc: 'Deep scanning across DEXs and CEXs, identifying liquidity shifts.' },
  { Icon: Shield, title: 'On-Chain Proof', desc: 'Every signal logged on X Layer blockchain. 100% accountability.' },
  { Icon: CreditCard, title: 'x402 Payments', desc: 'Seamless community billing through the x402 protocol on X Layer.' },
];

const FAQ = [
  { q: 'Is this a trading bot?', a: 'Bobby is an intelligence layer, not an execution bot. It provides institutional-grade analysis, sentiment tracking, and risk assessment to help your group make better decisions. Zero custody.' },
  { q: 'What markets are covered?', a: 'Crypto (BTC, ETH, SOL, and more), US stocks (NVDA, TSLA, AAPL), and commodities (Gold, Silver). Configurable per group.' },
  { q: 'Is it safe for my group?', a: 'Bobby only requires permission to read and send messages. It cannot access wallets or private data. All signals are verifiable on-chain.' },
  { q: 'How do I pay?', a: 'Payment via x402 protocol on OKX X Layer. Connect your Web3 wallet, pay 8 USDT, and Bobby activates instantly. Zero gas on X Layer.' },
];

export default function BobbyB2BPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-white font-['Inter']">
      <Helmet>
        <title>Bobby Agent Trader for Telegram Groups | AI Trading Intelligence</title>
        <meta name="description" content="Turn your Telegram group into an AI Trading Room. Three agents debate every market move. Voice notes, signals, on-chain proof." />
        <meta property="og:title" content="Bobby Agent Trader — Telegram Group Intelligence" />
        <meta property="og:description" content="Three agents debate. Your community watches. Voice notes, signals, on-chain proof." />
        <meta property="og:image" content="https://defimexico.org/bobby-hero.png" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>

      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-black/80 backdrop-blur-md border-b border-green-500/10 flex justify-between items-center px-6 md:px-8 py-3">
        <Link to="/agentic-world" className="font-mono font-bold text-lg tracking-tighter text-green-500">BOBBY AGENT</Link>
        <div className="hidden md:flex gap-6 items-center text-[10px] font-mono uppercase tracking-widest">
          <Link to="/agentic-world/bobby" className="text-white/50 hover:text-green-400 transition-colors">TERMINAL</Link>
          <Link to="/agentic-world/bobby/challenge" className="text-white/50 hover:text-green-400 transition-colors">CHALLENGE</Link>
          <Link to="/agentic-world/forum" className="text-white/50 hover:text-green-400 transition-colors">FORUM</Link>
        </div>
        <a href="https://t.me/Bobbyagentraderbot?startgroup=true" target="_blank" rel="noopener noreferrer"
          className="bg-green-500 text-black px-4 py-2 font-bold text-[10px] tracking-widest active:scale-95 transition-all">
          ADD TO TELEGRAM
        </a>
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center pt-20 pb-12 overflow-hidden"
        style={{ backgroundImage: 'linear-gradient(to right, rgba(34,197,94,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(34,197,94,0.04) 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#050505]/80 to-[#050505]" />

        <div className="max-w-7xl mx-auto px-6 md:px-8 relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="inline-flex items-center gap-2 mb-6 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="font-mono text-[9px] uppercase tracking-widest text-green-400">System Online</span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black leading-tight tracking-tight mb-6">
              Turn Your Telegram Group Into an <span className="text-green-400 italic">AI Trading Room</span>
            </h1>
            <p className="text-white/40 text-lg max-w-xl mb-10 leading-relaxed">
              Three agents debate every market move. Your community watches in real-time. Voice notes, signals, and verifiable on-chain proof.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a href="https://t.me/Bobbyagentraderbot?startgroup=true" target="_blank" rel="noopener noreferrer"
                className="bg-green-500 text-black px-8 py-4 font-bold text-sm tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all"
                style={{ boxShadow: '0 0 30px rgba(34,197,94,0.3)' }}>
                ADD BOBBY TO YOUR GROUP →
              </a>
              <Link to="/agentic-world/bobby" className="bg-white/[0.04] border border-white/10 text-white px-8 py-4 font-bold text-sm tracking-widest text-center hover:bg-white/[0.08] transition-all">
                SEE DEMO
              </Link>
            </div>
          </motion.div>

          {/* Mock Telegram Chat */}
          <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}
            className="bg-white/[0.02] backdrop-blur-sm border border-white/[0.06] rounded-xl overflow-hidden shadow-2xl hidden lg:block">
            <div className="bg-[#1c1b1b] p-4 flex items-center gap-3 border-b border-white/5">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">⚡</div>
              <div>
                <div className="text-sm font-bold">Alpha Trading Group</div>
                <div className="text-[10px] text-white/30">1,402 members, 88 online</div>
              </div>
            </div>
            <div className="h-[400px] p-5 space-y-4 overflow-hidden">
              {/* Alpha message */}
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-green-500 flex-shrink-0 flex items-center justify-center text-[8px] font-bold text-black">AH</div>
                <div className="bg-white/[0.04] p-3 rounded-xl rounded-tl-none max-w-[80%] border-l-2 border-green-500">
                  <div className="text-[9px] font-bold text-green-400 mb-1">ALPHA HUNTER <span className="text-white/20 font-normal">12:44</span></div>
                  <p className="text-[11px] text-white/50 leading-relaxed">Large whale accumulation on $SOL. Institutional volume +14% in 5m. Bullish divergence on 15m RSI.</p>
                </div>
              </div>
              {/* Voice note */}
              <div className="flex gap-3 justify-end">
                <div className="bg-blue-500/10 p-3 rounded-xl rounded-tr-none w-[65%] border border-blue-500/20">
                  <div className="flex items-center gap-3">
                    <span className="text-blue-400 text-2xl">▶</span>
                    <div className="flex-1 flex items-end gap-[2px] h-6">
                      {[2, 5, 8, 4, 6, 3, 7, 5, 8, 4].map((h, i) => (
                        <div key={i} className="flex-1 bg-blue-400/60 rounded-sm" style={{ height: `${h * 3}px` }} />
                      ))}
                    </div>
                    <span className="text-[9px] text-blue-400 font-mono">0:24</span>
                  </div>
                </div>
              </div>
              {/* Red Team message */}
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-red-500 flex-shrink-0 flex items-center justify-center text-[8px] font-bold text-white">RT</div>
                <div className="bg-white/[0.04] p-3 rounded-xl rounded-tl-none max-w-[80%] border-l-2 border-red-500">
                  <div className="text-[9px] font-bold text-red-400 mb-1">RED TEAM <span className="text-white/20 font-normal">12:45</span></div>
                  <p className="text-[11px] text-white/50 leading-relaxed">Counter: Funding rates overheating. Liquidations likely if we don't hold $148. Wait for retest.</p>
                </div>
              </div>
              <div className="text-[9px] font-mono text-green-400/60 animate-pulse">BOT IS TYPING...</div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Ticker */}
      <div className="w-full bg-[#1c1b1b] border-y border-white/5 py-2 overflow-hidden">
        <div className="flex whitespace-nowrap gap-12 font-mono text-[10px] animate-marquee">
          {['BTC +2.4%', 'ETH -0.1%', 'SOL -1.2%', 'X-LAYER GAS: LOW', 'ACTIVE GROUPS: 50+', 'BTC +2.4%', 'ETH -0.1%', 'SOL -1.2%'].map((t, i) => (
            <span key={i} className={t.includes('+') ? 'text-green-400/60' : t.includes('-') ? 'text-red-400/60' : 'text-white/30'}>{t}</span>
          ))}
        </div>
      </div>

      {/* 3 Agents */}
      <section className="py-20 max-w-7xl mx-auto px-6 md:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-black tracking-tight mb-3">The Neural Committee</h2>
          <p className="text-white/30 font-mono text-[10px] uppercase tracking-widest">Three Perspectives. One Profitable Consensus.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {AGENTS.map(agent => (
            <div key={agent.name} className={`bg-white/[0.02] backdrop-blur-sm border border-white/[0.06] p-8 ${agent.bgHover} transition-all`}>
              <div className={`w-12 h-12 ${agent.iconBg} flex items-center justify-center mb-6 border`}>
                <agent.Icon className={`w-5 h-5 ${agent.color}`} />
              </div>
              <h3 className={`font-bold text-xl mb-2 ${agent.color}`}>{agent.name}</h3>
              <p className="text-white/40 text-sm mb-6 leading-relaxed">{agent.desc}</p>
              <div className={`flex items-center gap-[2px] h-5 ${agent.color}`}>
                {agent.bars.map((h, i) => (
                  <div key={i} className="w-[3px] rounded-sm bg-current" style={{ height: `${h * 3}px`, opacity: 0.6 }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 bg-[#0e0e0e]">
        <div className="max-w-7xl mx-auto px-6 md:px-8">
          <h2 className="text-2xl md:text-3xl font-black mb-12">Engineered for Dominance</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/[0.04]">
            {FEATURES.map(f => (
              <div key={f.title} className="p-8 bg-[#0e0e0e] hover:bg-white/[0.02] transition-colors">
                <f.Icon className="w-5 h-5 text-green-400 mb-4" />
                <h4 className="font-bold mb-2">{f.title}</h4>
                <p className="text-white/40 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-20 max-w-7xl mx-auto px-6 md:px-8">
        <h2 className="text-2xl md:text-3xl font-black mb-14">Deployment Sequence</h2>
        <div className="flex flex-col md:flex-row gap-8">
          {[
            { n: '01', title: 'Add Bot', desc: 'Invite @Bobbyagentraderbot to your group.' },
            { n: '02', title: 'Pay via x402', desc: '8 USDT on X Layer. Instant activation.' },
            { n: '03', title: 'Start Debating', desc: 'Agents begin monitoring. Use /analyze to trigger.' },
          ].map(step => (
            <div key={step.n} className="flex-1 relative">
              <div className="font-mono text-4xl font-bold text-white/5 absolute -top-4 -left-2">{step.n}</div>
              <h4 className="font-bold text-xl mb-3 relative z-10">{step.title}</h4>
              <p className="text-white/40 text-sm leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-16 border-y border-white/5 bg-[#0e0e0e]">
        <div className="max-w-7xl mx-auto px-6 md:px-8 grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          {[
            { value: '50+', label: 'Real Traders' },
            { value: '100+', label: 'Debates Generated' },
            { value: 'X LAYER', label: 'Built on OKX' },
          ].map(s => (
            <div key={s.label}>
              <div className="font-mono text-3xl font-black text-green-400 mb-1">{s.value}</div>
              <div className="text-[9px] uppercase tracking-widest text-white/30">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 flex justify-center px-6">
        <div className="bg-white/[0.02] backdrop-blur-sm border border-white/[0.06] w-full max-w-lg p-10 text-center relative overflow-hidden rounded">
          <div className="absolute top-0 right-0 p-3">
            <span className="bg-green-500 text-black font-mono text-[8px] px-2 py-1 uppercase tracking-wider">B2B Standard</span>
          </div>
          <h3 className="text-2xl font-black mb-2">Simple Intelligence</h3>
          <p className="text-white/40 text-sm mb-6">Access all 3 agents for your entire community.</p>
          <div className="mb-6">
            <span className="font-mono text-5xl font-bold text-green-400">$8</span>
            <span className="font-mono text-lg text-white/30 italic"> USD / 30 DAYS</span>
          </div>
          <ul className="text-left space-y-3 mb-8 text-sm border-y border-white/[0.06] py-6">
            {['Unlimited market debates', 'Real-time voice notes', 'Custom market selection', 'X Layer on-chain proof'].map(f => (
              <li key={f} className="flex items-center gap-3 text-white/60">
                <span className="text-green-400 text-xs">✓</span> {f}
              </li>
            ))}
          </ul>
          <a href="https://t.me/Bobbyagentraderbot?startgroup=true" target="_blank" rel="noopener noreferrer"
            className="block w-full bg-green-500 text-black py-4 font-bold tracking-widest active:scale-95 transition-all text-center"
            style={{ boxShadow: '0 0 20px rgba(34,197,94,0.3)' }}>
            ACTIVATE NOW
          </a>
        </div>
      </section>

      {/* Active Communities */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-6 md:px-8">
          <div className="text-center mb-12">
            <span className="text-[9px] font-mono text-white/20 tracking-widest block mb-3">ACTIVE_DEPLOYMENTS</span>
            <h2 className="text-2xl md:text-3xl font-black mb-3">Bobby is already live in these communities</h2>
            <p className="text-white/40 text-sm">Real groups. Real debates. 24/7 autonomous intelligence.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* DeFi México */}
            <a href="https://t.me/defi_mexico" target="_blank" rel="noopener noreferrer"
              className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-6 hover:bg-white/[0.04] transition-all duration-300 group">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center text-xl">
                  🇲🇽
                </div>
                <div>
                  <h3 className="font-bold text-lg group-hover:text-green-400 transition-colors">DeFi México</h3>
                  <span className="text-[9px] font-mono text-green-400/60 tracking-widest">ACTIVE • SPANISH</span>
                </div>
                <span className="ml-auto text-[8px] font-mono text-white/20 tracking-widest bg-green-500/10 border border-green-500/20 px-2 py-1 rounded">LIVE</span>
              </div>
              <p className="text-white/50 text-sm leading-relaxed mb-3">
                The largest DeFi community in Mexico. Bobby delivers daily market debates, whale signal alerts, and macro analysis in Spanish.
              </p>
              <div className="flex gap-4 text-[9px] font-mono text-white/25 tracking-widest">
                <span>DEBATES: DAILY</span>
                <span>LANG: ES</span>
                <span>AGENTS: 3</span>
              </div>
            </a>

            {/* DeFai */}
            <a href="https://t.me/defienespanol" target="_blank" rel="noopener noreferrer"
              className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-6 hover:bg-white/[0.04] transition-all duration-300 group">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-xl">
                  🤖
                </div>
                <div>
                  <h3 className="font-bold text-lg group-hover:text-amber-400 transition-colors">DeFai</h3>
                  <span className="text-[9px] font-mono text-amber-400/60 tracking-widest">ACTIVE • BILINGUAL</span>
                </div>
                <span className="ml-auto text-[8px] font-mono text-white/20 tracking-widest bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded">LIVE</span>
              </div>
              <p className="text-white/50 text-sm leading-relaxed mb-3">
                AI-focused DeFi community. Bobby provides bilingual analysis bridging traditional finance and crypto-native audiences.
              </p>
              <div className="flex gap-4 text-[9px] font-mono text-white/25 tracking-widest">
                <span>DEBATES: DAILY</span>
                <span>LANG: EN/ES</span>
                <span>AGENTS: 3</span>
              </div>
            </a>
          </div>

          <div className="text-center mt-8">
            <a href="https://t.me/Bobbyagentraderbot?startgroup=true" target="_blank" rel="noopener noreferrer"
              className="inline-block text-[10px] font-mono text-green-400/60 tracking-widest hover:text-green-400 transition-colors border-b border-green-400/20 hover:border-green-400/60 pb-1">
              ADD BOBBY TO YOUR GROUP →
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 bg-[#0e0e0e]">
        <div className="max-w-3xl mx-auto px-6 md:px-8">
          <h2 className="text-2xl md:text-3xl font-black mb-10 text-center">System Logs & Intel</h2>
          <div className="space-y-3">
            {FAQ.map((faq, i) => (
              <details key={i} className="bg-white/[0.02] backdrop-blur-sm border border-white/[0.06] rounded group" open={i === 0}>
                <summary className="p-5 cursor-pointer flex justify-between items-center list-none">
                  <span className="font-bold text-sm">{faq.q}</span>
                  <ChevronDown className="w-4 h-4 text-white/30 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="px-5 pb-5 text-sm text-white/40 leading-relaxed">{faq.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 md:px-8 border-t border-green-900/20">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <div className="text-green-500 font-bold font-mono text-lg mb-1">BOBBY AGENT</div>
            <div className="font-mono text-[9px] uppercase tracking-widest text-white/25">© 2026 Bobby Agent Trader · Built on OKX X Layer</div>
          </div>
          <div className="flex gap-6">
            {['TERMINAL', 'TELEGRAM', 'GITHUB'].map(link => (
              <span key={link} className="font-mono text-[9px] uppercase tracking-widest text-white/25 hover:text-green-400 transition-colors cursor-pointer">{link}</span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
