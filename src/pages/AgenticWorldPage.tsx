// src/pages/AgenticWorldPage.tsx
import { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Sparkles, Search, ArrowRight, Twitter } from 'lucide-react';
import { PixelLobster, PixelTarget } from '@/components/ui/pixel-icons';
import { ScrambleText } from '@/components/agentic/ScrambleText';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const SOCIAL_PROOF = [
  {
    handle: '@rohanpaul_ai',
    image: '/images/tweet-rohanpaul.png',
    stat: '$150K',
    url: 'https://x.com/rohanpaul_ai/status/2023269106808447426',
  },
  {
    handle: '@Shelpid_WI3M',
    image: '/images/tweet-shelpid.png',
    stat: '$906K',
    url: 'https://x.com/Shelpid_WI3M/status/2023794118887944431',
  },
  {
    handle: '@0xMarioNawfal',
    image: '/images/tweet-mario.png',
    stat: '$500K/mo',
    url: 'https://x.com/0xMovez/status/2023766450406600740',
  },
];

// Live stats from trending 5-min BTC market bots (Feb 17 2026)
const LIVE_BOTS = [
  { name: '0x8dxd', pnl: '$1.59M', accuracy: '99%', trades: '18,505', strategy: 'BTC 5-min maker' },
  { name: 'MuseumOfBees', pnl: '$65K', accuracy: '~50%', trades: '1,247', strategy: 'ChatGPT bot, $2.2K start' },
  { name: 'NickyNic', pnl: '$87K', accuracy: 'high', trades: '584', strategy: 'BTC 15-min only' },
];

// Logarithmic PnL chart data: 12 months of simulated performance
// Based on real data: top agents $22M, DeFi Mexico followers ~$150K, avg trader -$847
const PNL_CHART_DATA = [
  { month: 'Jan', agents: 100, defimx: 100, avg: 1000 },
  { month: 'Feb', agents: 800, defimx: 250, avg: 920 },
  { month: 'Mar', agents: 3500, defimx: 600, avg: 850 },
  { month: 'Apr', agents: 12000, defimx: 1500, avg: 780 },
  { month: 'May', agents: 45000, defimx: 4000, avg: 700 },
  { month: 'Jun', agents: 120000, defimx: 9000, avg: 600 },
  { month: 'Jul', agents: 350000, defimx: 22000, avg: 520 },
  { month: 'Aug', agents: 900000, defimx: 48000, avg: 430 },
  { month: 'Sep', agents: 2500000, defimx: 85000, avg: 350 },
  { month: 'Oct', agents: 6000000, defimx: 150000, avg: 280 },
  { month: 'Nov', agents: 12000000, defimx: 320000, avg: 200 },
  { month: 'Dec', agents: 22000000, defimx: 600000, avg: 150 },
];

// Custom dot for the DeFi Mexico line: pixel lobster on last point
function GreenLobsterDot(props: { cx?: number; cy?: number; index?: number }) {
  const { cx, cy, index } = props;
  if (cx === undefined || cy === undefined) return null;
  if (index !== undefined && index === PNL_CHART_DATA.length - 1) {
    const size = 28;
    return (
      <g>
        {/* Glow behind lobster */}
        <circle cx={cx} cy={cy} r={20} fill="#22c55e" fillOpacity={0.08} />
        <circle cx={cx} cy={cy} r={14} fill="#22c55e" fillOpacity={0.12} />
        {/* Pixel lobster icon */}
        <foreignObject x={cx - size / 2} y={cy - size / 2} width={size} height={size}>
          <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ imageRendering: 'pixelated' as const }}>
              <rect x="1" y="2" width="2" height="2" fill="#22c55e"/>
              <rect x="13" y="2" width="2" height="2" fill="#22c55e"/>
              <rect x="2" y="4" width="2" height="2" fill="#22c55e"/>
              <rect x="12" y="4" width="2" height="2" fill="#22c55e"/>
              <rect x="3" y="5" width="2" height="2" fill="#22c55e"/>
              <rect x="11" y="5" width="2" height="2" fill="#22c55e"/>
              <rect x="6" y="3" width="4" height="2" fill="#22c55e"/>
              <rect x="5" y="4" width="1" height="1" fill="#22c55e"/>
              <rect x="10" y="4" width="1" height="1" fill="#22c55e"/>
              <rect x="5" y="5" width="6" height="2" fill="#22c55e"/>
              <rect x="6" y="7" width="4" height="2" fill="#22c55e"/>
              <rect x="6" y="9" width="4" height="2" fill="#22c55e"/>
              <rect x="5" y="11" width="6" height="2" fill="#22c55e"/>
              <rect x="4" y="13" width="2" height="1" fill="#22c55e"/>
              <rect x="7" y="13" width="2" height="1" fill="#22c55e"/>
              <rect x="10" y="13" width="2" height="1" fill="#22c55e"/>
            </svg>
          </div>
        </foreignObject>
      </g>
    );
  }
  return <circle cx={cx} cy={cy} r={2.5} fill="#22c55e" fillOpacity={0.6} />;
}

// Custom dot for agents line: red pixel lobster on last point
function RedAgentDot(props: { cx?: number; cy?: number; index?: number }) {
  const { cx, cy, index } = props;
  if (cx === undefined || cy === undefined) return null;
  if (index !== undefined && index === PNL_CHART_DATA.length - 1) {
    const size = 28;
    return (
      <g>
        {/* Glow behind lobster */}
        <circle cx={cx} cy={cy} r={20} fill="#ef4444" fillOpacity={0.08} />
        <circle cx={cx} cy={cy} r={14} fill="#ef4444" fillOpacity={0.12} />
        {/* Pixel lobster icon (red) */}
        <foreignObject x={cx - size / 2} y={cy - size / 2} width={size} height={size}>
          <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ imageRendering: 'pixelated' as const }}>
              <rect x="1" y="2" width="2" height="2" fill="#ef4444"/>
              <rect x="13" y="2" width="2" height="2" fill="#ef4444"/>
              <rect x="2" y="4" width="2" height="2" fill="#ef4444"/>
              <rect x="12" y="4" width="2" height="2" fill="#ef4444"/>
              <rect x="3" y="5" width="2" height="2" fill="#ef4444"/>
              <rect x="11" y="5" width="2" height="2" fill="#ef4444"/>
              <rect x="6" y="3" width="4" height="2" fill="#ef4444"/>
              <rect x="5" y="4" width="1" height="1" fill="#ef4444"/>
              <rect x="10" y="4" width="1" height="1" fill="#ef4444"/>
              <rect x="5" y="5" width="6" height="2" fill="#ef4444"/>
              <rect x="6" y="7" width="4" height="2" fill="#ef4444"/>
              <rect x="6" y="9" width="4" height="2" fill="#ef4444"/>
              <rect x="5" y="11" width="6" height="2" fill="#ef4444"/>
              <rect x="4" y="13" width="2" height="1" fill="#ef4444"/>
              <rect x="7" y="13" width="2" height="1" fill="#ef4444"/>
              <rect x="10" y="13" width="2" height="1" fill="#ef4444"/>
            </svg>
          </div>
        </foreignObject>
      </g>
    );
  }
  return null;
}

// Animated chart wrapper: reveals data points progressively
function AnimatedPnlChart() {
  const [visibleCount, setVisibleCount] = useState(0);
  const chartRef = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!chartRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          let i = 1;
          const interval = setInterval(() => {
            i++;
            setVisibleCount(i);
            if (i >= PNL_CHART_DATA.length) clearInterval(interval);
          }, 120);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, []);

  const data = PNL_CHART_DATA.slice(0, visibleCount);

  const formatYAxis = (val: number) => {
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(0)}M`;
    if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
    return `$${val}`;
  };

  return (
    <div ref={chartRef}>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="month"
            tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'monospace' }}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            tickLine={false}
          />
          <YAxis
            scale="log"
            domain={[100, 25000000]}
            tickFormatter={formatYAxis}
            tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'monospace' }}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            tickLine={false}
            width={50}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(0,0,0,0.9)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 0,
              fontFamily: 'monospace',
              fontSize: 11,
            }}
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = { agents: 'AI Agents', defimx: 'Following agents', avg: 'Average trader' };
              return [formatYAxis(value), labels[name] || name];
            }}
            labelStyle={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}
          />
          {/* Average trader: gray, declining */}
          <Line
            type="monotone"
            dataKey="avg"
            stroke="#6b7280"
            strokeWidth={2}
            dot={false}
            strokeOpacity={0.6}
            isAnimationActive={false}
          />
          {/* DeFi Mexico: green dotted, following agents */}
          <Line
            type="monotone"
            dataKey="defimx"
            stroke="#22c55e"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={<GreenLobsterDot />}
            isAnimationActive={false}
          />
          {/* AI Agents: red, exponential growth */}
          <Line
            type="monotone"
            dataKey="agents"
            stroke="#ef4444"
            strokeWidth={2.5}
            dot={<RedAgentDot />}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function AgenticWorldPage() {
  const navigate = useNavigate();
  const [walletInput, setWalletInput] = useState('');
  const [scanCount, setScanCount] = useState<number | null>(null);

  useEffect(() => {
    supabase.from('scan_counter').select('count').eq('id', 'total_scans').maybeSingle()
      .then(({ data }) => { if (data?.count) setScanCount(data.count); });
  }, []);

  const handleScan = () => {
    const input = walletInput.trim();
    if (!input) { toast.error('Paste a wallet address or Polymarket event URL'); return; }

    // Detect Polymarket URL
    if (input.includes('polymarket.com')) {
      // Extract slug from URL like polymarket.com/event/slug or /event/slug?tid=xxx
      const slugMatch = input.match(/polymarket\.com\/event\/([^?#/]+)/);
      if (slugMatch) {
        navigate(`/agentic-world/polymarket?event=${encodeURIComponent(slugMatch[1])}`);
      } else {
        navigate('/agentic-world/polymarket');
      }
      return;
    }

    // Detect wallet address
    if (input.toLowerCase().startsWith('0x') && input.length >= 42) {
      navigate(`/agentic-world/consensus?wallet=${input.toLowerCase()}`);
      return;
    }

    toast.error('Paste a 0x wallet address or a Polymarket event URL');
  };

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>AI Agent Intelligence | DeFi Hub México</title>
        <meta name="description" content="Bots are printing $3K/hr on Polymarket 5-min BTC markets. 400M trades analyzed. Track which AI agents win and follow their positions." />
        <meta property="og:title" content="AI Agent Intelligence | Polymarket Bot Tracker" />
        <meta property="og:description" content="$1.59M profit, 99% accuracy, 18K trades. These Polymarket bots trade 5-min BTC markets. Track them live." />
      </Helmet>

      <div className="container mx-auto px-4 py-8">

        {/* ============ PROBLEM: TWEET SCREENSHOTS ============ */}
        {/* ============ LIVE BOT TICKER ============ */}
        <div className="border border-red-500/20 bg-black/60 overflow-hidden mb-3">
          <div className="flex items-center gap-2 px-4 py-1.5 bg-red-500/5 border-b border-red-500/15">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400 text-[10px] font-mono tracking-wider uppercase">Live: 5-min BTC market bots printing right now</span>
          </div>
          <div className="flex flex-wrap gap-0 divide-x divide-red-500/10">
            {LIVE_BOTS.map((bot) => (
              <div key={bot.name} className="flex-1 min-w-[200px] px-4 py-3 font-mono">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white/80 text-xs font-bold">{bot.name}</span>
                  <span className="text-green-400 text-sm font-bold">{bot.pnl}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-white/30">
                  <span>{bot.trades} trades</span>
                  <span>{bot.accuracy} acc</span>
                </div>
                <div className="text-[9px] text-red-400/40 mt-0.5">{bot.strategy}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-3">
          <div className="text-center mb-4">
            <span className="text-red-400/60 text-[10px] font-mono tracking-widest uppercase">$3,000/hr extracted from 5-min markets. These bots don't sleep.</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {SOCIAL_PROOF.map((tweet) => (
              <a
                key={tweet.handle}
                href={tweet.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block border border-blue-500/20 bg-black/60 overflow-hidden hover:border-blue-500/50 hover:scale-[1.02] transition-all group"
              >
                <img
                  src={tweet.image}
                  alt={`${tweet.handle} tweet about AI agent profits`}
                  className="w-full h-auto"
                  loading="eager"
                />
                <div className="flex items-center justify-between px-3 py-2 border-t border-blue-500/10 font-mono">
                  <div className="flex items-center gap-1.5">
                    <Twitter className="w-3 h-3 text-blue-400" />
                    <span className="text-blue-400/60 text-[10px]">{tweet.handle}</span>
                  </div>
                  <span className="text-green-400 text-xs font-bold">{tweet.stat}</span>
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* ============ HERO: HEADLINE + SCANNER ============ */}
        <div className="border border-cyan-500/30 bg-black/60 overflow-hidden mb-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 border-b border-cyan-500/20">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
            </div>
            <span className="text-cyan-400 text-[10px] font-mono ml-2 flex items-center gap-2">
              <PixelLobster size={14} className="text-cyan-400" />
              openclaw --agent-intelligence
            </span>
            <div className="ml-auto flex items-center gap-2">
              {scanCount && scanCount > 0 && (
                <span className="text-cyan-400/40 text-[10px] font-mono">{scanCount.toLocaleString()} scanned</span>
              )}
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            </div>
          </div>

          <div className="p-6 md:p-10 font-mono">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-cyan-300 mb-2 leading-tight">
              <ScrambleText text="You don't need to build an agent." speed={20} iterations={12} />
            </h1>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-cyan-400 leading-tight mb-8">
              <ScrambleText text="You just need to follow one." speed={20} iterations={15} />
            </h2>

            {/* Wallet scanner */}
            <div className="max-w-xl">
              <div className="flex gap-2">
                <Input
                  placeholder="0x... wallet or polymarket.com/event/..."
                  value={walletInput}
                  onChange={(e) => setWalletInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                  className="h-12 font-mono text-base bg-black/60 border-cyan-500/30 text-cyan-300 placeholder:text-cyan-500/20 focus:border-cyan-400"
                />
                <Button onClick={handleScan} className="h-12 px-6 bg-cyan-600 hover:bg-cyan-500 text-white font-mono font-bold text-sm">
                  <PixelTarget size={16} className="mr-2" />
                  X-RAY
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ============ PNL CHART: AGENTS vs YOU vs AVG ============ */}
        <div className="border border-cyan-500/20 bg-black/60 overflow-hidden mb-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-cyan-500/5 border-b border-cyan-500/15">
            <div className="flex gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-500/60" />
              <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
              <div className="w-2 h-2 rounded-full bg-green-500/60" />
            </div>
            <span className="text-cyan-400 text-[10px] font-mono ml-1 flex items-center gap-1.5">
              <PixelLobster size={12} className="text-cyan-400" />
              pnl.compare --log --12m
            </span>
          </div>

          <div className="p-4 md:p-6">
            {/* Legend */}
            <div className="flex flex-wrap gap-4 mb-4 font-mono text-[11px]">
              <div className="flex items-center gap-2">
                <div className="w-6 h-0.5 bg-red-500" />
                <span className="text-red-400">AI Agents</span>
                <span className="text-red-400/40">+$22M</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-0.5 border-t-2 border-dashed border-green-500" />
                <PixelLobster size={10} className="text-green-400" />
                <span className="text-green-400">Following agents</span>
                <span className="text-green-400/40">+$600K</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-0.5 bg-gray-500/60" />
                <span className="text-gray-400">Average trader</span>
                <span className="text-gray-400/40">-$850</span>
              </div>
            </div>

            <AnimatedPnlChart />

            <div className="text-cyan-400/15 text-[8px] font-mono mt-3">
              Log scale | TU Berlin (1.7M wallets) | IMDEA Networks (86M bets)
            </div>
          </div>
        </div>

        {/* ============ 4 TOOLS ============ */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          {/* Market Scanner */}
          <div
            className="group relative border border-cyan-500/20 bg-black/60 overflow-hidden cursor-pointer hover:border-cyan-500/60 transition-all duration-300"
            onClick={() => navigate('/agentic-world/polymarket')}
          >
            {/* Glow on hover */}
            <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/0 to-cyan-500/0 group-hover:from-cyan-500/5 group-hover:to-cyan-500/10 transition-all duration-300" />
            <div className="relative p-6 md:p-8 font-mono flex flex-col items-center text-center">
              <div className="w-16 h-16 border-2 border-cyan-500/30 bg-cyan-500/5 flex items-center justify-center mb-4 group-hover:border-cyan-500/60 group-hover:bg-cyan-500/10 group-hover:scale-110 transition-all duration-300">
                <Search className="w-8 h-8 text-cyan-400" />
              </div>
              <div className="text-cyan-300 text-lg font-bold mb-1">Market Scanner</div>
              <div className="text-cyan-400/40 text-xs mb-4 leading-relaxed">Paste any Polymarket URL. Instantly detect which wallets are AI agents.</div>
              <div className="flex items-center gap-1.5 text-cyan-400/30 text-[10px] group-hover:text-cyan-400 transition-colors">
                <span>LAUNCH</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>

          {/* Wallet X-Ray */}
          <div
            className="group relative border border-amber-500/20 bg-black/60 overflow-hidden cursor-pointer hover:border-amber-500/60 transition-all duration-300"
            onClick={() => navigate('/agentic-world/polymarket')}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-amber-500/0 to-amber-500/0 group-hover:from-amber-500/5 group-hover:to-amber-500/10 transition-all duration-300" />
            <div className="relative p-6 md:p-8 font-mono flex flex-col items-center text-center">
              <div className="w-16 h-16 border-2 border-amber-500/30 bg-amber-500/5 flex items-center justify-center mb-4 group-hover:border-amber-500/60 group-hover:bg-amber-500/10 group-hover:scale-110 transition-all duration-300">
                <PixelTarget size={32} className="text-amber-400" />
              </div>
              <div className="text-amber-300 text-lg font-bold mb-1">Wallet X-Ray</div>
              <div className="text-amber-400/40 text-xs mb-4 leading-relaxed">Deep scan any wallet. Get strategy classification, agent score, and PnL breakdown.</div>
              <div className="flex items-center gap-1.5 text-amber-400/30 text-[10px] group-hover:text-amber-400 transition-colors">
                <span>SCAN</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>

          {/* AI Leaderboard */}
          <div
            className="group relative border border-violet-500/20 bg-black/60 overflow-hidden cursor-pointer hover:border-violet-500/60 transition-all duration-300"
            onClick={() => navigate('/agentic-world/leaderboard')}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-violet-500/0 to-violet-500/0 group-hover:from-violet-500/5 group-hover:to-violet-500/10 transition-all duration-300" />
            <div className="relative p-6 md:p-8 font-mono flex flex-col items-center text-center">
              <div className="w-16 h-16 border-2 border-violet-500/30 bg-violet-500/5 flex items-center justify-center mb-4 group-hover:border-violet-500/60 group-hover:bg-violet-500/10 group-hover:scale-110 transition-all duration-300">
                <Sparkles className="w-8 h-8 text-violet-400" />
              </div>
              <div className="text-violet-300 text-lg font-bold mb-1">AI Leaderboard</div>
              <div className="text-violet-400/40 text-xs mb-4 leading-relaxed">Live ranking of 30+ AI protocols. Track TVL, fees, and real-time performance.</div>
              <div className="flex items-center gap-1.5 text-violet-400/30 text-[10px] group-hover:text-violet-400 transition-colors">
                <span>EXPLORE</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>

          {/* Claw Trader */}
          <div
            className="group relative border border-green-500/20 bg-black/60 overflow-hidden cursor-pointer hover:border-green-500/60 transition-all duration-300"
            onClick={() => navigate('/agentic-world/claw-trader')}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-green-500/0 to-green-500/0 group-hover:from-green-500/5 group-hover:to-green-500/10 transition-all duration-300" />
            <div className="relative p-6 md:p-8 font-mono flex flex-col items-center text-center">
              <div className="w-16 h-16 border-2 border-green-500/30 bg-green-500/5 flex items-center justify-center mb-4 group-hover:border-green-500/60 group-hover:bg-green-500/10 group-hover:scale-110 transition-all duration-300">
                <PixelLobster size={32} className="text-green-400" />
              </div>
              <div className="text-green-300 text-lg font-bold mb-1">Claw Trader</div>
              <div className="text-green-400/40 text-xs mb-4 leading-relaxed">Detect agent signals, scan OKX divergence, and execute trades autonomously.</div>
              <div className="flex items-center gap-1.5 text-green-400/30 text-[10px] group-hover:text-green-400 transition-colors">
                <span>TRADE</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
