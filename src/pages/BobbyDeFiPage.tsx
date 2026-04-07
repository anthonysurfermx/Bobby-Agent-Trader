// ============================================================
// Bobby DeFi Invest — Yield farming & DeFi product discovery
// Powered by OKX OnchainOS okx-defi-invest skill
// Supports: Aave, Lido, Compound, PancakeSwap, Uniswap, NAVI, Kamino
// ============================================================

import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import {
  TrendingUp, Search, Shield, Zap, ExternalLink, AlertTriangle,
  ArrowRight, Wallet, Layers, DollarSign, Clock, Globe,
} from 'lucide-react';
import KineticShell from '@/components/kinetic/KineticShell';

interface DeFiProduct {
  investmentId: string;
  platform: string;
  chain: string;
  token: string;
  apy: number;
  tvl: number;
  productGroup: string;
}

// Top DeFi yields (fetched from OKX API or cached)
const SAMPLE_YIELDS: DeFiProduct[] = [
  { investmentId: '9502', platform: 'Aave V3', chain: 'Ethereum', token: 'USDC', apy: 3.2, tvl: 3520000000, productGroup: 'LENDING' },
  { investmentId: '9501', platform: 'Aave V3', chain: 'Ethereum', token: 'USDT', apy: 2.8, tvl: 2100000000, productGroup: 'LENDING' },
  { investmentId: '8100', platform: 'Lido', chain: 'Ethereum', token: 'ETH', apy: 3.4, tvl: 28500000000, productGroup: 'SINGLE_EARN' },
  { investmentId: '7200', platform: 'Compound V3', chain: 'Ethereum', token: 'USDC', apy: 2.5, tvl: 1800000000, productGroup: 'LENDING' },
  { investmentId: '6300', platform: 'PancakeSwap', chain: 'BSC', token: 'CAKE', apy: 12.5, tvl: 450000000, productGroup: 'SINGLE_EARN' },
  { investmentId: '5400', platform: 'Kamino', chain: 'Solana', token: 'USDC', apy: 8.2, tvl: 320000000, productGroup: 'LENDING' },
  { investmentId: '4500', platform: 'NAVI', chain: 'Sui', token: 'USDC', apy: 6.1, tvl: 180000000, productGroup: 'LENDING' },
  { investmentId: '3600', platform: 'BENQI', chain: 'Avalanche', token: 'AVAX', apy: 4.8, tvl: 290000000, productGroup: 'SINGLE_EARN' },
];

const CHAINS = ['All', 'Ethereum', 'BSC', 'Solana', 'Sui', 'Avalanche', 'Arbitrum', 'Base', 'X Layer'];
const TYPES = ['All', 'LENDING', 'SINGLE_EARN', 'DEX_POOL'];

function formatTVL(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${(v / 1e3).toFixed(0)}K`;
}

export default function BobbyDeFiPage() {
  const [chain, setChain] = useState('All');
  const [type, setType] = useState('All');
  const [search, setSearch] = useState('');
  const agentName = localStorage.getItem('bobby_agent_name') || 'Bobby';
  const isPTS = agentName === 'DANY';

  const filtered = SAMPLE_YIELDS.filter(p => {
    if (chain !== 'All' && p.chain !== chain) return false;
    if (type !== 'All' && p.productGroup !== type) return false;
    if (search && !p.token.toLowerCase().includes(search.toLowerCase()) && !p.platform.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => b.apy - a.apy);

  return (
    <KineticShell activeTab="terminal">
      <Helmet><title>DeFi Invest | {isPTS ? 'Dany' : 'Bobby'} Agent Trader</title></Helmet>

      <div className="min-h-screen pb-20 md:pb-8" style={{ background: '#050505' }}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-5xl mx-auto px-4 py-6 space-y-5">

          {/* HEADER */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Layers className="w-5 h-5 text-green-400" />
              <h1 className="font-mono text-xl font-black text-white/90 tracking-tight">DEFI INVEST</h1>
              <span className="font-mono text-[8px] text-green-400/60 border border-green-500/20 px-2 py-0.5 rounded-sm ml-auto">PWR: OKX ONCHAINOS</span>
            </div>
            <p className="font-mono text-[11px] text-white/35 leading-relaxed">
              {isPTS
                ? `Descubre e invierte en productos DeFi en más de 20 cadenas. Aave, Lido, Compound, PancakeSwap, Kamino, NAVI y más. ${agentName} analiza rendimientos y recomienda las mejores oportunidades ajustadas por riesgo.`
                : `Discover and invest in DeFi products across 20+ chains. Aave, Lido, Compound, PancakeSwap, Kamino, NAVI and more. ${agentName} analyzes yields and recommends the best risk-adjusted opportunities.`}
            </p>
          </div>

          {/* STATS */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { icon: Globe, label: 'CHAINS', value: '20+', sub: isPTS ? 'Soportadas' : 'Supported' },
              { icon: Layers, label: isPTS ? 'PROTOCOLOS' : 'PROTOCOLS', value: '50+', sub: isPTS ? 'Integrados' : 'Integrated' },
              { icon: DollarSign, label: 'TVL', value: '$35B+', sub: isPTS ? 'Rastreado' : 'Across all' },
              { icon: Shield, label: isPTS ? 'ACCIONES' : 'ACTIONS', value: '4', sub: isPTS ? 'Depositar/Retirar/Reclamar/Buscar' : 'Deposit/Withdraw/Claim/Search' },
            ].map(s => (
              <div key={s.label} className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3 text-center" style={{ backdropFilter: 'blur(12px)' }}>
                <s.icon className="w-4 h-4 text-green-400 mx-auto mb-1" />
                <div className="font-mono text-lg font-black text-green-400">{s.value}</div>
                <div className="font-mono text-[7px] text-white/25 tracking-widest">{s.label}</div>
              </div>
            ))}
          </div>

          {/* FILTERS */}
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1 bg-white/[0.02] border border-white/[0.04] rounded-lg px-3 py-1.5">
              <Search className="w-3 h-3 text-white/20" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={isPTS ? "Buscar token o protocolo..." : "Search token or protocol..."}
                className="bg-transparent font-mono text-[10px] text-white/70 placeholder:text-white/15 outline-none w-40"
              />
            </div>
            <div className="flex gap-1 overflow-x-auto">
              {CHAINS.map(c => (
                <button key={c} onClick={() => setChain(c)}
                  className={`font-mono text-[8px] px-2 py-1 rounded shrink-0 transition-all ${chain === c ? 'bg-green-500/15 text-green-400 border border-green-500/30' : 'bg-white/[0.02] text-white/30 border border-white/[0.04] hover:text-white/50'}`}>
                  {c}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {TYPES.map(t => (
                <button key={t} onClick={() => setType(t)}
                  className={`font-mono text-[8px] px-2 py-1 rounded shrink-0 transition-all ${type === t ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : 'bg-white/[0.02] text-white/30 border border-white/[0.04] hover:text-white/50'}`}>
                  {t === 'All' ? 'All' : t === 'LENDING' ? 'Lending' : t === 'SINGLE_EARN' ? 'Staking' : 'LP Pools'}
                </button>
              ))}
            </div>
          </div>

          {/* YIELDS TABLE */}
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl overflow-hidden" style={{ backdropFilter: 'blur(12px)' }}>
            <div className="grid grid-cols-6 gap-2 px-4 py-2 border-b border-white/[0.04] font-mono text-[8px] text-white/25 tracking-widest">
              <span>PROTOCOL</span>
              <span>CHAIN</span>
              <span>TOKEN</span>
              <span className="text-right">APY</span>
              <span className="text-right">TVL</span>
              <span className="text-right">TYPE</span>
            </div>
            {filtered.map((p, i) => (
              <motion.div
                key={p.investmentId}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="grid grid-cols-6 gap-2 px-4 py-3 border-b border-white/[0.02] hover:bg-white/[0.03] transition-all cursor-pointer group"
              >
                <span className="font-mono text-[10px] text-white/60 font-bold">{p.platform}</span>
                <span className="font-mono text-[10px] text-white/40">{p.chain}</span>
                <span className="font-mono text-[10px] text-green-400 font-bold">{p.token}</span>
                <span className={`font-mono text-[10px] text-right font-bold ${p.apy > 10 ? 'text-amber-400' : 'text-green-400'}`}>
                  {p.apy.toFixed(1)}%
                  {p.apy > 50 && <AlertTriangle className="w-3 h-3 inline ml-1 text-red-400" />}
                </span>
                <span className="font-mono text-[10px] text-white/30 text-right">{formatTVL(p.tvl)}</span>
                <span className="font-mono text-[7px] text-white/20 text-right">
                  {p.productGroup === 'LENDING' ? 'LEND' : p.productGroup === 'SINGLE_EARN' ? 'STAKE' : 'LP'}
                </span>
              </motion.div>
            ))}
            {filtered.length === 0 && (
              <div className="px-4 py-8 text-center font-mono text-[10px] text-white/20">{isPTS ? 'No se encontraron productos' : 'No products found'}</div>
            )}
          </div>

          {/* HOW IT WORKS */}
          <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-5" style={{ backdropFilter: 'blur(12px)' }}>
            <div className="font-mono text-[9px] text-green-400/60 tracking-widest mb-3">HOW_DEFI_INVEST_WORKS</div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {(isPTS ? [
                { step: '01', title: 'BUSCAR', desc: 'Encuentra los mejores rendimientos en más de 20 cadenas y 50+ protocolos', icon: Search },
                { step: '02', title: 'ANALIZAR', desc: `${agentName} evalúa riesgo, TVL, historial de APY y seguridad de contratos inteligentes`, icon: Shield },
                { step: '03', title: 'INVERTIR', desc: `Depósito en un clic. ${agentName} maneja aprobaciones y orquestación multi-paso`, icon: Zap },
                { step: '04', title: 'GANAR', desc: 'Rastrea posiciones, reclama recompensas, retira cuando quieras', icon: TrendingUp },
              ] : [
                { step: '01', title: 'SEARCH', desc: 'Find the best yields across 20+ chains and 50+ protocols', icon: Search },
                { step: '02', title: 'ANALYZE', desc: `${agentName} evaluates risk, TVL, APY history, and smart contract safety`, icon: Shield },
                { step: '03', title: 'INVEST', desc: `One-click deposit. ${agentName} handles approvals and multi-step orchestration`, icon: Zap },
                { step: '04', title: 'EARN', desc: 'Track positions, claim rewards, withdraw anytime', icon: TrendingUp },
              ]).map(s => (
                <div key={s.step} className="p-3 bg-black/20 rounded-lg">
                  <s.icon className="w-4 h-4 text-green-400 mb-2" />
                  <div className="font-mono text-[8px] text-white/20 mb-1">{s.step}</div>
                  <div className="font-mono text-[10px] text-white/60 font-bold mb-1">{s.title}</div>
                  <div className="font-mono text-[8px] text-white/25">{s.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-5 text-center">
            <div className="font-mono text-[10px] text-white/40 mb-2">
              {isPTS ? `Pídele a ${agentName} que encuentre los mejores rendimientos para ti` : `Ask ${agentName} to find the best yields for you`}
            </div>
            <a href={isPTS ? '/demopts/terminal' : '/agentic-world/bobby'} className="inline-flex items-center gap-2 px-6 py-2.5 bg-green-500 text-black font-mono text-[11px] font-bold tracking-wider rounded hover:bg-green-400 transition-all">
              {isPTS ? 'ABRIR TERMINAL' : 'OPEN TERMINAL'} <ArrowRight className="w-3 h-3" />
            </a>
          </div>

          {/* FOOTER */}
          <div className="flex flex-wrap gap-3 text-[7px] font-mono text-white/10 tracking-wider">
            <span>OKX_ONCHAINOS</span>
            <span>okx-defi-invest v2.2.2</span>
            <span>20+ CHAINS</span>
            <span>50+ PROTOCOLS</span>
          </div>
        </motion.div>
      </div>
    </KineticShell>
  );
}
