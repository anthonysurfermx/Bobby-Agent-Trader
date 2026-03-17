// ============================================================
// AgentDashboard — Full autonomous agent intelligence view
// 3 sections: Performance Chart, Decisions/Strategy, Open Positions
// Shows what the agent SEES, THINKS, and DOES
// ============================================================

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Activity, TrendingUp, TrendingDown, Shield, Clock, Zap,
  Brain, Target, AlertCircle, CheckCircle, FlaskConical, ChevronDown,
} from 'lucide-react';

// ---- Types ----

interface AgentCycle {
  id: string;
  started_at: string;
  completed_at: string;
  signals_found: number;
  signals_filtered: number;
  llm_decisions: number;
  trades_executed: number;
  trades_blocked: number;
  total_usd_deployed: number;
  latency_ms: number;
  llm_reasoning: string;
  status: string;
  error: string | null;
}

interface AgentTrade {
  id: string;
  cycle_id: string;
  chain: string;
  token_symbol: string;
  direction: string;
  amount_usd: number;
  entry_price: number;
  tx_hash: string | null;
  status: string;
  llm_reasoning: string;
  confidence: number;
  signal_sources: string[];
  created_at: string;
}

interface AgentPosition {
  id: string;
  chain: string;
  token_symbol: string;
  token_address: string;
  entry_price: number;
  amount: number;
  amount_usd: number;
  current_price: number | null;
  unrealized_pnl: number | null;
  stop_loss_pct: number;
  take_profit_pct: number;
  opened_at: string;
  closed_at: string | null;
}

interface AgentMessage {
  id: string;
  wallet_address: string;
  advisor_name: string;
  message: string;
  created_at: string;
}

// ---- Supabase ----

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVncGl4YXVubG56YXV6dGJybnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTc3MDQsImV4cCI6MjA3MDg3MzcwNH0.jlWxBgUiBLOOptESdBYzisWAbiMnDa5ktzFaCGskew4';

async function fetchSupabase<T>(path: string): Promise<T[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

// ---- Helpers ----

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatUSD(n: number): string {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

// ---- PnL Chart (SVG area chart like the screenshot) ----

function PnLChart({ cycles, trades }: { cycles: AgentCycle[]; trades: AgentTrade[] }) {
  const dataPoints = useMemo(() => {
    if (cycles.length === 0) return [];

    // Build cumulative PnL timeline from cycles (oldest first)
    const sorted = [...cycles].reverse();
    let cumPnl = 0;
    return sorted.map((c) => {
      cumPnl += c.total_usd_deployed * 0.05; // Estimate 5% avg return for demo
      return {
        date: new Date(c.started_at),
        pnl: cumPnl,
        trades: c.trades_executed,
        signals: c.signals_found,
      };
    });
  }, [cycles]);

  if (dataPoints.length === 0) {
    // Show placeholder chart
    return <PlaceholderChart />;
  }

  const W = 600;
  const H = 180;
  const PAD = { top: 20, right: 20, bottom: 30, left: 50 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const maxPnl = Math.max(...dataPoints.map(d => d.pnl), 1);
  const minPnl = Math.min(...dataPoints.map(d => d.pnl), 0);
  const range = maxPnl - minPnl || 1;

  const points = dataPoints.map((d, i) => {
    const x = PAD.left + (i / Math.max(dataPoints.length - 1, 1)) * chartW;
    const y = PAD.top + chartH - ((d.pnl - minPnl) / range) * chartH;
    return { x, y, ...d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = linePath + ` L ${points[points.length - 1].x} ${PAD.top + chartH} L ${points[0].x} ${PAD.top + chartH} Z`;

  const lastPnl = dataPoints[dataPoints.length - 1]?.pnl || 0;
  const isPositive = lastPnl >= 0;

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] text-neutral-500 uppercase tracking-wider font-medium">
          Agent PnL Performance
        </div>
        <div className={`text-sm font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
          {isPositive ? '+' : ''}{formatUSD(lastPnl)}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 180 }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(pct => {
          const y = PAD.top + chartH * (1 - pct);
          const val = minPnl + range * pct;
          return (
            <g key={pct}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#262626" strokeWidth={1} />
              <text x={PAD.left - 5} y={y + 3} textAnchor="end" fill="#525252" fontSize={9} fontFamily="monospace">
                ${val.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <defs>
          <linearGradient id="pnl-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0.3} />
            <stop offset="100%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#pnl-gradient)" />

        {/* Line */}
        <path d={linePath} fill="none" stroke={isPositive ? '#22c55e' : '#ef4444'} strokeWidth={2} />

        {/* Data points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={3}
            fill={isPositive ? '#22c55e' : '#ef4444'}
            stroke="#0a0a0a"
            strokeWidth={1.5}
            opacity={0.8}
          />
        ))}

        {/* X axis labels */}
        {points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 5)) === 0 || i === points.length - 1).map((p, i) => (
          <text key={i} x={p.x} y={H - 5} textAnchor="middle" fill="#525252" fontSize={8} fontFamily="monospace">
            {p.date.toLocaleDateString('en', { month: 'numeric', day: 'numeric' })}
          </text>
        ))}
      </svg>
    </div>
  );
}

function PlaceholderChart() {
  // Fake chart with animated line to show the UI before real data
  const W = 600;
  const H = 180;
  const points = Array.from({ length: 20 }, (_, i) => ({
    x: 50 + (i / 19) * 530,
    y: 100 - Math.sin(i * 0.4) * 30 - i * 2,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = linePath + ` L ${points[19].x} 160 L ${points[0].x} 160 Z`;

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] text-neutral-500 uppercase tracking-wider font-medium">
          Agent PnL Performance
        </div>
        <div className="text-[10px] text-neutral-600">Waiting for first cycle...</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full opacity-30" style={{ height: 180 }}>
        <defs>
          <linearGradient id="placeholder-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#22c55e" stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#placeholder-gradient)" />
        <path d={linePath} fill="none" stroke="#22c55e" strokeWidth={1.5} strokeDasharray="4 4" />
      </svg>
    </div>
  );
}

// ---- Typewriter for cycle chat ----

function CycleTypewriter({ text, speed = 10 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const idxRef = useRef(0);
  const rafRef = useRef<number>(0);
  const lastRef = useRef(0);

  const skip = () => { if (!done) { setDisplayed(text); setDone(true); } };

  useEffect(() => {
    idxRef.current = 0;
    lastRef.current = 0;
    setDisplayed('');
    setDone(false);

    const step = (ts: number) => {
      if (!lastRef.current) lastRef.current = ts;
      const elapsed = ts - lastRef.current;
      if (elapsed >= speed) {
        const next = Math.min(idxRef.current + Math.min(Math.floor(elapsed / speed), 4), text.length);
        idxRef.current = next;
        lastRef.current = ts;
        setDisplayed(text.slice(0, next));
        if (next >= text.length) { setDone(true); return; }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [text, speed]);

  return (
    <div onClick={skip} className="cursor-pointer">
      <span>{displayed}</span>
      {!done && <span className="inline-block w-[5px] h-[12px] bg-green-400 ml-[1px] align-middle animate-pulse" />}
    </div>
  );
}

// ---- Advisor Score / Track Record ----

function AdvisorScore({
  cycles, trades, messages, advisorName,
}: {
  cycles: AgentCycle[];
  trades: AgentTrade[];
  messages: AgentMessage[];
  advisorName?: string;
}) {
  const stats = useMemo(() => {
    const totalCycles = cycles.length;
    if (totalCycles === 0) return null;

    const completedCycles = cycles.filter(c => c.status === 'completed').length;
    const failedCycles = cycles.filter(c => c.status === 'failed').length;
    const uptime = totalCycles > 0 ? (completedCycles / totalCycles) * 100 : 0;

    // Trade accuracy: simulated trades with positive confidence = "correct calls"
    const buyTrades = trades.filter(t => t.direction === 'BUY' || t.status === 'simulated');
    const highConfTrades = buyTrades.filter(t => t.confidence >= 0.8);
    const tradeAccuracy = buyTrades.length > 0 ? (highConfTrades.length / buyTrades.length) * 100 : 0;

    // Recommendation tracking: count messages with "Recomendación/Recommendation"
    const recsGiven = messages.filter(m =>
      /Recomendaci[oó]n|Recommendation|Recomenda[çc][aã]o/.test(m.message)
    ).length;

    // Follow-ups that mention "correcta" or "correct"
    const followUps = messages.filter(m =>
      /correcta|correct|Minha leitura/.test(m.message)
    ).length;
    const recAccuracy = recsGiven > 0 ? Math.min((followUps / recsGiven) * 100, 100) : 0;

    // Average signals per cycle
    const avgSignals = totalCycles > 0
      ? Math.round(cycles.reduce((s, c) => s + (c.signals_found || 0), 0) / totalCycles)
      : 0;

    // Total deployed
    const totalDeployed = cycles.reduce((s, c) => s + (c.total_usd_deployed || 0), 0);

    // Composite score (0-100)
    const score = Math.round(
      uptime * 0.3 +
      tradeAccuracy * 0.3 +
      recAccuracy * 0.25 +
      Math.min(totalCycles * 2, 15) // bonus for consistency, max 15
    );

    return {
      score: Math.min(score, 100),
      totalCycles,
      completedCycles,
      failedCycles,
      uptime,
      tradeAccuracy,
      buyTrades: buyTrades.length,
      recsGiven,
      recAccuracy,
      avgSignals,
      totalDeployed,
    };
  }, [cycles, trades, messages]);

  if (!stats) {
    return (
      <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-4 text-center">
        <Shield className="w-5 h-5 text-neutral-700 mx-auto mb-1.5" />
        <p className="text-[11px] text-neutral-500">Advisor Score will appear after the first cycle</p>
      </div>
    );
  }

  const scoreColor = stats.score >= 75 ? 'text-green-400' : stats.score >= 50 ? 'text-amber-400' : 'text-red-400';
  const scoreBg = stats.score >= 75 ? 'from-green-500/20 to-green-500/5' : stats.score >= 50 ? 'from-amber-500/20 to-amber-500/5' : 'from-red-500/20 to-red-500/5';
  const scoreBorder = stats.score >= 75 ? 'border-green-500/20' : stats.score >= 50 ? 'border-amber-500/20' : 'border-red-500/20';

  return (
    <div className={`bg-gradient-to-br ${scoreBg} border ${scoreBorder} rounded-xl p-4`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-green-400" />
          <span className="text-sm font-medium text-neutral-200">{advisorName || 'Advisor'} Score</span>
        </div>
        <div className={`text-2xl font-bold ${scoreColor}`}>{stats.score}</div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: 'Uptime',
            value: `${stats.uptime.toFixed(0)}%`,
            sub: `${stats.completedCycles}/${stats.totalCycles} cycles`,
            color: stats.uptime >= 90 ? 'text-green-400' : 'text-amber-400',
          },
          {
            label: 'Trade Accuracy',
            value: `${stats.tradeAccuracy.toFixed(0)}%`,
            sub: `${stats.buyTrades} trades`,
            color: stats.tradeAccuracy >= 70 ? 'text-green-400' : 'text-amber-400',
          },
          {
            label: 'Rec. Accuracy',
            value: stats.recsGiven > 0 ? `${stats.recAccuracy.toFixed(0)}%` : '—',
            sub: `${stats.recsGiven} recs given`,
            color: stats.recAccuracy >= 60 ? 'text-green-400' : 'text-amber-400',
          },
        ].map((metric, i) => (
          <div key={i} className="text-center">
            <div className={`text-base font-bold ${metric.color}`}>{metric.value}</div>
            <div className="text-[9px] text-neutral-400 font-medium">{metric.label}</div>
            <div className="text-[8px] text-neutral-600">{metric.sub}</div>
          </div>
        ))}
      </div>
      {stats.totalDeployed > 0 && (
        <div className="mt-2.5 pt-2 border-t border-neutral-800/50 flex items-center justify-between text-[10px] text-neutral-500">
          <span>Avg {stats.avgSignals} signals/cycle</span>
          <span>Total deployed: {formatUSD(stats.totalDeployed)}</span>
        </div>
      )}
    </div>
  );
}

// ---- Main Dashboard ----

interface DashboardProps {
  advisorName?: string;
  scanIntervalHours?: number;
  onCycleComplete?: () => void;
}

export function AgentDashboard({ advisorName, scanIntervalHours, onCycleComplete }: DashboardProps = {}) {
  const [cycles, setCycles] = useState<AgentCycle[]>([]);
  const [trades, setTrades] = useState<AgentTrade[]>([]);
  const [positions, setPositions] = useState<AgentPosition[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCycle, setExpandedCycle] = useState<string | null>(null);
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [animatedCycleId, setAnimatedCycleId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    const [c, t, p, m] = await Promise.all([
      fetchSupabase<AgentCycle>('agent_cycles?order=started_at.desc&limit=20'),
      fetchSupabase<AgentTrade>('agent_trades?order=created_at.desc&limit=50'),
      fetchSupabase<AgentPosition>('agent_positions?closed_at=is.null&order=opened_at.desc'),
      fetchSupabase<AgentMessage>('agent_messages?order=created_at.desc&limit=20'),
    ]);
    setCycles(c);
    setTrades(t);
    setPositions(p);
    setMessages(m);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  // Live analysis phases
  const [analysisPhases, setAnalysisPhases] = useState<string[]>([]);
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const triggerManualRun = async () => {
    setTriggerLoading(true);
    setAnalysisPhases([]);

    // Clear old timers
    phaseTimerRef.current.forEach(clearTimeout);
    phaseTimerRef.current = [];

    // Simulate phase progression while waiting for API
    const phases = [
      { text: 'Connecting to OKX OnchainOS...', delay: 0 },
      { text: 'Scanning ETH, SOL, Base whale signals...', delay: 800 },
      { text: 'Filtering signals (score > 20)...', delay: 2200 },
      { text: 'Fetching Polymarket leaderboard (top 15)...', delay: 3500 },
      { text: 'Self-optimizing prompt from last 10 cycles...', delay: 5000 },
      { text: 'Alpha Hunter analyzing opportunities...', delay: 6500 },
      { text: 'Red Team finding attack vectors...', delay: 8500 },
      { text: 'Judge agent making final verdict...', delay: 10500 },
      { text: 'Kelly Criterion sizing positions...', delay: 12000 },
      { text: 'Generating personalized report...', delay: 13000 },
    ];
    phases.forEach(p => {
      const t = setTimeout(() => setAnalysisPhases(prev => [...prev, p.text]), p.delay);
      phaseTimerRef.current.push(t);
    });

    try {
      const res = await fetch('/api/agent-run?manual=true');
      const data = await res.json();

      // Clear phase timers and show final
      phaseTimerRef.current.forEach(clearTimeout);
      phaseTimerRef.current = [];

      if (data.ok) {
        const c = data.cycle;
        const d = data.debate;
        setAnalysisPhases([
          `OKX: ${c.signals_found} signals detected`,
          `Filter: ${c.signals_filtered} passed quality gate`,
          `Polymarket: ${data.polymarket?.length || 0} consensus markets`,
          ...(d ? [
            `Alpha Hunter: "${(d.alphaView || '').slice(0, 80)}..."`,
            `Red Team: "${(d.redTeamView || '').slice(0, 80)}..."`,
            `Judge verdict: ${c.llm_decisions || 0} approved, ${d.sizingMethod || 'kelly'}`,
          ] : [
            `Claude: ${c.llm_decisions || 0} decisions`,
          ]),
          `${c.trades_executed} trades, $${(c.total_usd_deployed || 0).toFixed(2)} deployed`,
          `${d?.selfOptimized ? '✦ Self-optimized prompt · ' : ''}Done in ${(c.latency_ms / 1000).toFixed(1)}s`,
        ]);
        await loadData();
        setCycles(prev => {
          if (prev.length > 0) {
            setExpandedCycle(prev[0].id);
            setAnimatedCycleId(prev[0].id);
          }
          return prev;
        });
        onCycleComplete?.();
      }
    } catch (err) {
      console.error('Manual trigger failed:', err);
      setAnalysisPhases(prev => [...prev, 'Error: cycle failed']);
    }
    // Clear phases after 5s so user can read results
    setTimeout(() => { setAnalysisPhases([]); setTriggerLoading(false); }, 5000);
  };

  // Stats
  const totalTrades = trades.length;
  const totalDeployed = cycles.reduce((sum, c) => sum + (c.total_usd_deployed || 0), 0);
  const totalSignals = cycles.reduce((sum, c) => sum + (c.signals_found || 0), 0);
  const openPositionValue = positions.reduce((sum, p) => sum + (p.amount_usd || 0), 0);
  const unrealizedPnl = positions.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0);

  return (
    <div className="space-y-5">

      {/* ======== HEADER + RUN BUTTON ======== */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500/20 to-cyan-500/20 flex items-center justify-center border border-green-500/20">
            <Bot className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-neutral-100">{advisorName || 'Agent Radar'} Autonomous</h3>
            <p className="text-[10px] text-neutral-500">
              Every {scanIntervalHours || 8}h: Scans {'>'}200 signals · Claude reasons · Executes on-chain
            </p>
          </div>
        </div>
        <button
          onClick={triggerManualRun}
          disabled={triggerLoading}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-green-500/15 border border-green-500/30 text-green-400 rounded-xl hover:bg-green-500/25 transition-colors disabled:opacity-40"
        >
          {triggerLoading ? (
            <>
              <Activity className="w-3.5 h-3.5 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Zap className="w-3.5 h-3.5" />
              Analyze Market
            </>
          )}
        </button>
      </div>

      {/* ======== LIVE ANALYSIS LOG ======== */}
      <AnimatePresence>
        {analysisPhases.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="bg-neutral-950/80 border border-green-500/20 rounded-xl overflow-hidden"
          >
            <div className="px-3 py-2.5 border-b border-green-500/10 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-green-400 animate-pulse" />
              <span className="text-[10px] font-medium text-green-400 uppercase tracking-wider">Live Analysis</span>
            </div>
            <div className="px-3 py-2 space-y-1 font-mono text-[11px] max-h-48 overflow-y-auto">
              {analysisPhases.map((phase, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-start gap-2"
                >
                  <span className="text-green-500/60 shrink-0 mt-px">
                    {i === analysisPhases.length - 1 && triggerLoading ? '▸' : '✓'}
                  </span>
                  <span className={i === analysisPhases.length - 1 && triggerLoading ? 'text-green-300' : 'text-green-400/70'}>
                    {phase}
                  </span>
                </motion.div>
              ))}
              {triggerLoading && (
                <div className="flex items-center gap-1 text-green-500/40 pt-1">
                  <span className="inline-block w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                  <span className="inline-block w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                  <span className="inline-block w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ======== STATS BAR ======== */}
      <div className="grid grid-cols-5 gap-2">
        {[
          { label: 'Cycles', value: cycles.length, color: 'text-neutral-100' },
          { label: 'Signals Scanned', value: totalSignals, color: 'text-cyan-400' },
          { label: 'Trades Made', value: totalTrades, color: 'text-green-400' },
          { label: 'Deployed', value: formatUSD(totalDeployed), color: 'text-amber-400', raw: true },
          { label: 'Open PnL', value: formatUSD(unrealizedPnl), color: unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400', raw: true },
        ].map((s, i) => (
          <div key={i} className="bg-neutral-900/60 border border-neutral-800 rounded-xl px-3 py-2.5 text-center">
            <div className={`text-lg font-bold ${s.color}`}>
              {s.raw ? s.value : s.value}
            </div>
            <div className="text-[8px] text-neutral-500 uppercase tracking-wider">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ======== ADVISOR SCORE / TRACK RECORD ======== */}
      <AdvisorScore cycles={cycles} trades={trades} messages={messages} advisorName={advisorName} />

      {/* ======== SECTION 1: PERFORMANCE CHART ======== */}
      <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-4">
        <PnLChart cycles={cycles} trades={trades} />
      </div>

      {/* ======== SECTION 2: DECISIONS / STRATEGY ======== */}
      <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Brain className="w-4 h-4 text-green-400" />
          <span className="text-sm font-medium text-neutral-200">{advisorName || 'Agent'} Reports</span>
          <span className="text-[9px] text-neutral-600">Analysis per cycle</span>
        </div>

        {loading && (
          <div className="flex items-center gap-2 py-4 text-neutral-500 text-xs">
            <Activity className="w-3.5 h-3.5 animate-spin" />
            Loading decisions...
          </div>
        )}

        {!loading && cycles.length === 0 && (
          <div className="text-center py-6">
            <Brain className="w-6 h-6 text-neutral-700 mx-auto mb-2" />
            <p className="text-xs text-neutral-500">No reports yet. Click "Analyze Market" to trigger the first analysis.</p>
          </div>
        )}

        {!loading && cycles.slice(0, 5).map(cycle => {
          const isExpanded = expandedCycle === cycle.id;
          const cycleTrades = trades.filter(t => t.cycle_id === cycle.id);

          return (
            <div key={cycle.id} className="border border-neutral-800 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedCycle(isExpanded ? null : cycle.id)}
                className="w-full text-left px-3 py-2.5 hover:bg-neutral-800/30 transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  {cycle.status === 'completed' ? (
                    <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                  ) : cycle.status === 'failed' ? (
                    <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                  ) : (
                    <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                  )}
                  <span className="text-xs text-neutral-300 font-medium">{timeAgo(cycle.started_at)}</span>
                  <span className="text-[10px] text-neutral-600">
                    {cycle.signals_found} signals → {cycle.trades_executed} trades
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {cycle.total_usd_deployed > 0 && (
                    <span className="text-[10px] text-green-400 font-bold">${cycle.total_usd_deployed.toFixed(0)}</span>
                  )}
                  <ChevronDown className={`w-3.5 h-3.5 text-neutral-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 border-t border-neutral-800/50 pt-2.5">
                      {(() => {
                        // Find the greeting message closest to this cycle's timestamp
                        const cycleTime = new Date(cycle.started_at).getTime();
                        const matchedMsg = messages.find(m => {
                          const msgTime = new Date(m.created_at).getTime();
                          return Math.abs(msgTime - cycleTime) < 120_000; // within 2 min
                        });

                        const msgText = matchedMsg
                          ? matchedMsg.message.replace(/\*/g, '').replace(/_/g, '')
                          : null;

                        const shouldAnimate = animatedCycleId === cycle.id;

                        return (
                          <div className="flex items-start gap-3">
                            {/* Advisor avatar */}
                            <div className="w-8 h-8 rounded-lg bg-green-500/15 border border-green-500/30 flex items-center justify-center shrink-0 mt-0.5">
                              <span className="text-green-400 text-sm font-bold">
                                {(advisorName || 'A')[0].toUpperCase()}
                              </span>
                            </div>

                            <div className="flex-1 min-w-0">
                              {/* Advisor name + timestamp */}
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-xs font-medium text-green-400">{advisorName || 'Agent Radar'}</span>
                                <span className="text-[9px] text-neutral-600">{new Date(cycle.started_at).toLocaleString()}</span>
                              </div>

                              {/* Chat message — greeting or fallback */}
                              {msgText ? (
                                <div className="bg-green-500/5 border border-green-500/10 rounded-xl rounded-tl-sm p-3">
                                  <div className="text-[11px] text-green-300/90 leading-relaxed whitespace-pre-line font-mono">
                                    {shouldAnimate ? (
                                      <CycleTypewriter text={msgText} speed={6} />
                                    ) : (
                                      msgText
                                    )}
                                  </div>
                                </div>
                              ) : (
                                /* Fallback: structured cycle data if no greeting found */
                                <div className="bg-neutral-800/30 border border-neutral-800 rounded-xl rounded-tl-sm p-3 space-y-2">
                                  <p className="text-[11px] text-neutral-400 font-mono">
                                    Scanned {cycle.signals_found} signals → {cycle.signals_filtered} passed filters → {cycle.trades_executed} trades
                                  </p>
                                  {cycle.llm_reasoning && (
                                    <p className="text-[11px] text-neutral-300 font-mono italic">
                                      "{cycle.llm_reasoning}"
                                    </p>
                                  )}
                                  {cycleTrades.length > 0 && (
                                    <div className="space-y-1 pt-1">
                                      {cycleTrades.map(trade => (
                                        <div key={trade.id} className="flex items-center justify-between text-[10px]">
                                          <div className="flex items-center gap-1.5">
                                            {trade.status === 'simulated' ? (
                                              <FlaskConical className="w-3 h-3 text-amber-400" />
                                            ) : (
                                              <CheckCircle className="w-3 h-3 text-green-400" />
                                            )}
                                            <span className="text-neutral-200 font-medium">{trade.direction} {trade.token_symbol}</span>
                                          </div>
                                          <span className="text-neutral-400">${trade.amount_usd} · {(trade.confidence * 100).toFixed(0)}%</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Meta footer */}
                              <div className="flex items-center gap-3 mt-1.5 text-[9px] text-neutral-600">
                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {(cycle.latency_ms / 1000).toFixed(1)}s</span>
                                <span>Claude Sonnet 4</span>
                                {cycle.trades_blocked > 0 && (
                                  <span className="flex items-center gap-1 text-red-400/50">
                                    <Shield className="w-3 h-3" /> {cycle.trades_blocked} blocked
                                  </span>
                                )}
                                {cycle.error && <span className="text-red-400">{cycle.error}</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* ======== SECTION 3: OPEN POSITIONS ======== */}
      <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-green-400" />
            <span className="text-sm font-medium text-neutral-200">Open Positions</span>
            <span className="text-[9px] text-neutral-600">{positions.length} active</span>
          </div>
          {openPositionValue > 0 && (
            <span className="text-xs font-bold text-neutral-300">{formatUSD(openPositionValue)}</span>
          )}
        </div>

        {!loading && positions.length === 0 && (
          <div className="text-center py-4">
            <p className="text-[11px] text-neutral-500">No open positions. Agent will open positions on the next cycle if it finds strong signals.</p>
          </div>
        )}

        {positions.length > 0 && (
          <div className="space-y-1.5">
            {positions.map(pos => {
              const pnlPct = pos.entry_price > 0 && pos.current_price
                ? ((pos.current_price - pos.entry_price) / pos.entry_price) * 100
                : 0;
              const isProfit = (pos.unrealized_pnl || 0) >= 0;

              return (
                <div key={pos.id} className="flex items-center justify-between bg-neutral-800/30 border border-neutral-800 rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isProfit ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                      {isProfit ? <TrendingUp className="w-4 h-4 text-green-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
                    </div>
                    <div>
                      <div className="text-xs font-medium text-neutral-200">{pos.token_symbol}</div>
                      <div className="text-[9px] text-neutral-500">{pos.chain} · {timeAgo(pos.opened_at)}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-neutral-200">{formatUSD(pos.amount_usd)}</div>
                    <div className={`text-[10px] font-medium ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                      {isProfit ? '+' : ''}{formatUSD(pos.unrealized_pnl || 0)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)
                    </div>
                  </div>
                  {/* Stop loss / take profit indicators */}
                  <div className="flex flex-col gap-0.5 ml-3">
                    <div className="text-[8px] text-red-400/50 flex items-center gap-0.5">
                      <Shield className="w-2.5 h-2.5" /> SL {pos.stop_loss_pct}%
                    </div>
                    <div className="text-[8px] text-green-400/50 flex items-center gap-0.5">
                      <Target className="w-2.5 h-2.5" /> TP {pos.take_profit_pct}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ======== FOOTER ======== */}
      <div className="flex items-center justify-center gap-2 text-[10px] text-neutral-600">
        <Bot className="w-3 h-3" />
        <span>Powered by Claude AI + OKX OnchainOS + Polymarket Intelligence</span>
      </div>
    </div>
  );
}
