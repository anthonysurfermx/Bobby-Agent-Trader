// ============================================================
// Bobby Metacognition Dashboard — Self-Awareness Engine
// Shows calibration curve, debate quality, self-correction log
// Stitch "Agent Terminal" design system
// ============================================================

import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Scatter,
} from 'recharts';
import { Brain, AlertTriangle, Activity, Shield, TrendingDown } from 'lucide-react';
import KineticShell from '@/components/kinetic/KineticShell';
import { AIInsightsTerminal } from '@/components/agentic/AIInsightsTerminal';

// ---- Supabase direct (same pattern as BobbyChallengePage) ----
const SB = 'https://egpixaunlnzauztbrnuz.supabase.co';
const KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVncGl4YXVubG56YXV6dGJybnV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTc3MDQsImV4cCI6MjA3MDg3MzcwNH0.jlWxBgUiBLOOptESdBYzisWAbiMnDa5ktzFaCGskew4';
const SB_HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// ---- Types ----
interface CalibrationBucket {
  bucket: string;
  midpoint: number;
  actual: number;
  count: number;
  overconfident: boolean;
  reliable: boolean;
}

interface CalibrationData {
  curve: CalibrationBucket[];
  calibrationError: number;
  isOverconfident: boolean;
  adjustment: number;
  sampleSize: number;
  breakEvenCount: number;
}

interface Contradiction {
  id: string;
  symbol: string;
  direction: string;
  conviction_score: number;
  resolution: string;
  resolution_pnl_pct: number | null;
  created_at: string;
}

interface DebateQuality {
  specificity: number;
  data_citation: number;
  actionability: number;
  novel_insight: number;
  red_team_rigor: number;
  weakness?: string;
}

interface IntelData {
  calibration: CalibrationData;
  performance: {
    winRate: number;
    mood: string;
    isSafeMode: boolean;
    dynamicConviction: number;
  };
  fearGreed: { value: number; classification: string } | null;
  regime: string;
}

// ---- Helpers ----
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function calibrationColor(error: number): string {
  if (error < 0.1) return 'text-green-400';
  if (error < 0.2) return 'text-amber-400';
  return 'text-red-400';
}

function moodBadge(mood: string): { color: string; label: string } {
  switch (mood) {
    case 'confident': return { color: 'bg-green-500/20 text-green-400', label: 'CONFIDENT' };
    case 'cautious': return { color: 'bg-amber-500/20 text-amber-400', label: 'CAUTIOUS' };
    case 'tilted': return { color: 'bg-red-500/20 text-red-400', label: 'TILTED' };
    default: return { color: 'bg-white/10 text-white/50', label: mood.toUpperCase() };
  }
}

// ---- Skeleton ----
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-white/[0.04] rounded ${className}`} />;
}

// ---- Terminal Loading Screen ----
function MetacognitionLoader() {
  const [lines, setLines] = useState<string[]>([]);
  const steps = [
    '> INITIATING METACOGNITION SEQUENCE...',
    '> CONNECTING TO OKX OnchainOS...',
    '> LOADING OKX AGENT TRADE KIT — 70+ INDICATORS...',
    '> FETCHING RSI, MACD, BOLLINGER, SUPERTREND, AHR999...',
    '> LOADING WHALE SIGNALS + FUNDING RATES...',
    '> FETCHING POLYMARKET SMART MONEY DATA...',
    '> READING FEAR & GREED INDEX...',
    '> COMPUTING CALIBRATION CURVE...',
    '> EVALUATING DEBATE QUALITY SCORES [HAIKU_JUDGE]...',
    '> CROSS-REFERENCING 12 DATA SOURCES...',
    '> ANALYZING SELF-CORRECTION PATTERNS...',
    '> SYNTHESIZING METACOGNITION REPORT...',
  ];

  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      if (i < steps.length) {
        setLines(prev => [...prev, steps[i]]);
        i++;
      } else {
        clearInterval(timer);
      }
    }, 1500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-lg">
        <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-ping" />
            <span className="text-[10px] font-mono text-green-400/60 tracking-widest">BOBBY_METACOGNITION_ENGINE</span>
          </div>
          <div className="space-y-2 font-mono text-xs">
            {lines.map((line, idx) => (
              <motion.p
                key={idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className={idx === lines.length - 1 ? 'text-green-400' : 'text-white/30'}
              >
                {line}
              </motion.p>
            ))}
            {lines.length < steps.length && (
              <span className="text-green-400 animate-pulse">▋</span>
            )}
          </div>
          <div className="mt-4 h-1 bg-white/[0.04] rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-green-500 rounded-full"
              initial={{ width: '0%' }}
              animate={{ width: `${(lines.length / steps.length) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Chart custom tooltip ----
function CalibrationTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-[#1a1a1a] border border-white/10 rounded p-2 font-mono text-[10px]">
      <p className="text-white/60">Bucket: {d.name}</p>
      <p className="text-green-400">Perfect: {(d.perfect * 100).toFixed(0)}%</p>
      <p className="text-amber-400">Actual: {(d.actual * 100).toFixed(0)}%</p>
      <p className="text-white/40">n = {d.count}</p>
    </div>
  );
}

// ---- Quality bar component ----
function QualityBar({ label, value, max = 5, delay = 0 }: { label: string; value: number; max?: number; delay?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-3">
      <span className="text-[9px] font-mono text-white/40 w-28 shrink-0 uppercase tracking-wider">{label}</span>
      <div className="flex-1 h-2 bg-white/[0.04] rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay }}
        />
      </div>
      <span className="text-[10px] font-mono text-white/60 w-8 text-right">{value.toFixed(1)}</span>
    </div>
  );
}

// ---- Main component ----
export default function BobbyMetacognitionPage() {
  const [intel, setIntel] = useState<IntelData | null>(null);
  const [contradictions, setContradictions] = useState<Contradiction[]>([]);
  const [debateQuality, setDebateQuality] = useState<DebateQuality | null>(null);
  const [debatesScoredCount, setDebatesScoredCount] = useState(0);
  const [totalDebates, setTotalDebates] = useState(0);
  const [agreementRate, setAgreementRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch intel (calibration, performance, regime, fearGreed)
    fetch('/api/bobby-intel')
      .then(r => r.json())
      .then((d: any) => {
        if (d.ok) {
          setIntel({
            calibration: d.calibration,
            performance: d.performance,
            fearGreed: d.fearGreed,
            regime: d.regime,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Fetch recent contradictions (losses in last 72h)
    const since = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
    fetch(
      `${SB}/rest/v1/forum_threads?resolution=neq.pending&resolution=not.is.null&created_at=gte.${since}&order=created_at.desc&limit=20&select=id,symbol,direction,conviction_score,resolution,resolution_pnl_pct,created_at`,
      { headers: SB_HEADERS },
    )
      .then(r => r.json())
      .then((rows: any[]) => {
        if (Array.isArray(rows)) {
          setContradictions(rows.filter(r => r.resolution === 'loss'));
        }
      })
      .catch(() => {});

    // Fetch debate quality — last 10 scored debates, average dimensions
    fetch(
      `${SB}/rest/v1/forum_threads?debate_quality=not.is.null&order=created_at.desc&limit=10&select=debate_quality,created_at`,
      { headers: SB_HEADERS },
    )
      .then(r => r.json())
      .then((rows: any[]) => {
        if (!Array.isArray(rows) || rows.length === 0) return;
        const dims = ['specificity', 'data_citation', 'actionability', 'novel_insight', 'red_team_rigor'] as const;
        const avg: Record<string, number> = {};
        for (const d of dims) {
          const vals = rows.map(r => r.debate_quality?.[d]).filter((v: any) => typeof v === 'number');
          avg[d] = vals.length > 0 ? parseFloat((vals.reduce((s: number, v: number) => s + v, 0) / vals.length).toFixed(1)) : 0;
        }
        const weakness = rows[0]?.debate_quality?.weakness || null;
        setDebateQuality({ ...avg, weakness } as any);
        setDebatesScoredCount(rows.length);
      })
      .catch(() => {});

    // Fetch total debate count + agreement rate
    fetch(
      `${SB}/rest/v1/forum_threads?select=id,conviction_score&resolution=not.is.null`,
      { headers: SB_HEADERS },
    )
      .then(r => r.json())
      .then((rows: any[]) => {
        if (Array.isArray(rows)) {
          setTotalDebates(rows.length);
          // Agreement rate: debates where conviction >= 0.7 (agents broadly agreed)
          const highConviction = rows.filter(r => r.conviction_score && r.conviction_score >= 0.7);
          if (rows.length > 0) {
            setAgreementRate(parseFloat(((highConviction.length / rows.length) * 100).toFixed(1)));
          }
        }
      })
      .catch(() => {});
  }, []);

  // Transform calibration curve for chart
  const chartData = intel?.calibration.curve.map(c => ({
    name: c.bucket,
    perfect: c.midpoint,
    actual: c.actual,
    count: c.count,
    reliable: c.reliable,
  })) || [];

  // Real debate quality — null means no scores yet (NEVER fake data)
  const quality = debateQuality;

  const cal = intel?.calibration;
  const perf = intel?.performance;

  const fadeUp = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4 },
  };

  return (
    <KineticShell activeTab="metacognition">
      <Helmet>
        <title>Metacognition | Bobby Agent Trader</title>
      </Helmet>

      {loading ? (
        <MetacognitionLoader />
      ) : (
      <div className="max-w-6xl mx-auto px-4 py-8 pb-24 md:pb-8 space-y-6">
        {/* ========== HEADER ========== */}
        <motion.div {...fadeUp} className="flex items-center gap-3">
          <Brain className="w-6 h-6 text-green-400" />
          <div>
            <h1 className="text-xl font-black tracking-tight text-white font-mono">
              METACOGNITION MODULE
            </h1>
            <p className="text-[9px] font-mono text-green-400/40 tracking-[0.2em]">
              BOBBY_CORE_V1.0 // SELF-AWARENESS ENGINE
            </p>
          </div>
        </motion.div>

        {/* ========== ROW 1: STAT CARDS ========== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Calibration Error */}
          <motion.div {...fadeUp} transition={{ delay: 0.05 }}
            className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-4 hover:bg-white/[0.04] transition-all duration-300">
            <p className="text-[8px] font-mono text-green-400/40 tracking-widest mb-1">CALIBRATION ERROR</p>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <p className={`text-2xl font-black font-mono ${calibrationColor(cal?.calibrationError ?? 1)}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {cal?.calibrationError != null ? cal.calibrationError.toFixed(3) : '--'}
                </p>
                <p className="text-[8px] font-mono text-white/20 mt-1">
                  {cal?.isOverconfident ? 'OVERCONFIDENT' : cal?.calibrationError != null && cal.calibrationError < 0.1 ? 'WELL CALIBRATED' : 'NEEDS DATA'}
                </p>
              </>
            )}
          </motion.div>

          {/* Win Rate */}
          <motion.div {...fadeUp} transition={{ delay: 0.1 }}
            className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-4 hover:bg-white/[0.04] transition-all duration-300">
            <p className="text-[8px] font-mono text-green-400/40 tracking-widest mb-1">WIN RATE</p>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <p className="text-2xl font-black text-white font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {perf?.winRate != null ? `${perf.winRate}%` : '--'}
                </p>
                {perf?.mood && (
                  <span className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[7px] font-mono font-bold ${moodBadge(perf.mood).color}`}>
                    {moodBadge(perf.mood).label}
                  </span>
                )}
              </>
            )}
          </motion.div>

          {/* Regime */}
          <motion.div {...fadeUp} transition={{ delay: 0.15 }}
            className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-4 hover:bg-white/[0.04] transition-all duration-300">
            <p className="text-[8px] font-mono text-green-400/40 tracking-widest mb-1">MARKET REGIME</p>
            {loading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <>
                <p className="text-sm font-black text-white font-mono leading-tight">
                  {intel?.regime || '--'}
                </p>
                {intel?.fearGreed && (
                  <p className="text-[8px] font-mono text-white/30 mt-1">
                    Fear & Greed: <span className={
                      intel.fearGreed.value <= 25 ? 'text-red-400' :
                      intel.fearGreed.value >= 75 ? 'text-green-400' : 'text-amber-400'
                    }>{intel.fearGreed.value}</span> ({intel.fearGreed.classification})
                  </p>
                )}
              </>
            )}
          </motion.div>

          {/* Self-Corrections */}
          <motion.div {...fadeUp} transition={{ delay: 0.2 }}
            className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-4 hover:bg-white/[0.04] transition-all duration-300">
            <p className="text-[8px] font-mono text-green-400/40 tracking-widest mb-1">SELF-CORRECTIONS</p>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <p className="text-2xl font-black text-white font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {contradictions.length}
                </p>
                <p className="text-[8px] font-mono text-white/20 mt-1">
                  ERRORS ACKNOWLEDGED (72H)
                </p>
              </>
            )}
          </motion.div>
        </div>

        {/* ========== ROW 2: CHART + QUALITY (2-col) ========== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* LEFT: Calibration Curve */}
          <motion.div {...fadeUp} transition={{ delay: 0.25 }}
            className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[8px] font-mono text-green-400/40 tracking-widest">CALIBRATION CURVE</p>
                <p className="text-[8px] font-mono text-white/20">PREDICTED vs ACTUAL WIN RATE</p>
              </div>
              {cal && cal.sampleSize > 0 && (
                <span className="text-[8px] font-mono text-white/20">n = {cal.sampleSize}</span>
              )}
            </div>

            {loading ? (
              <Skeleton className="h-52 w-full" />
            ) : chartData.length === 0 ? (
              <div className="h-52 flex items-center justify-center">
                <p className="text-[10px] font-mono text-white/20">Collecting data... Need 5+ resolved debates.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}
                    stroke="rgba(255,255,255,0.05)"
                  />
                  <YAxis
                    domain={[0, 1]}
                    ticks={[0, 0.25, 0.5, 0.75, 1.0]}
                    tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}
                    stroke="rgba(255,255,255,0.05)"
                    tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                  />
                  <Tooltip content={<CalibrationTooltip />} />
                  <ReferenceLine y={0.5} stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                  {/* Perfect calibration diagonal */}
                  <Line
                    type="monotone"
                    dataKey="perfect"
                    stroke="#22c55e"
                    strokeWidth={1.5}
                    strokeDasharray="6 3"
                    dot={false}
                    name="Perfect"
                  />
                  {/* Bobby's actual */}
                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ r: 4, fill: '#f59e0b', stroke: '#f59e0b' }}
                    name="Bobby"
                  />
                  {/* Sample count as scatter size */}
                  <Scatter
                    dataKey="count"
                    fill="rgba(245,158,11,0.2)"
                    shape={(props: any) => {
                      const r = Math.max(3, Math.min(12, props.payload.count * 1.5));
                      return (
                        <circle
                          cx={props.cx}
                          cy={props.cy}
                          r={r}
                          fill="rgba(245,158,11,0.15)"
                          stroke="rgba(245,158,11,0.3)"
                          strokeWidth={1}
                        />
                      );
                    }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}

            {/* Legend */}
            <div className="flex gap-4 mt-2">
              <span className="flex items-center gap-1.5 text-[8px] font-mono text-white/30">
                <span className="w-3 h-px bg-green-500 inline-block" style={{ borderTop: '1.5px dashed #22c55e' }} /> PERFECT
              </span>
              <span className="flex items-center gap-1.5 text-[8px] font-mono text-white/30">
                <span className="w-3 h-0.5 bg-amber-500 inline-block rounded" /> BOBBY_ACTUAL
              </span>
            </div>
          </motion.div>

          {/* RIGHT: Debate Quality Metrics — REAL DATA ONLY */}
          <motion.div {...fadeUp} transition={{ delay: 0.3 }}
            className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[8px] font-mono text-green-400/40 tracking-widest">METACOGNITION_METRICS</p>
                <p className="text-[8px] font-mono text-white/20">
                  {quality ? `AGGREGATE AVERAGE • LAST ${debatesScoredCount} DEBATE${debatesScoredCount !== 1 ? 'S' : ''}` : 'AWAITING EVALUATION'}
                </p>
              </div>
              <span className="text-[8px] font-mono text-white/30 border border-white/10 px-2 py-0.5 rounded-sm">
                EVAL_ENGINE: HAIKU_3
              </span>
            </div>

            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-3 w-full" />)}
              </div>
            ) : quality ? (
              <div className="space-y-4">
                {debatesScoredCount < 5 && (
                  <div className="text-[9px] font-mono text-amber-400/60 bg-amber-500/[0.06] border border-amber-500/10 rounded px-2 py-1 mb-2">
                    {debatesScoredCount === 0
                      ? 'AWAITING_POST_MORTEM_EVALUATION'
                      : `PRELIMINARY_DATA • n=${debatesScoredCount}`}
                  </div>
                )}
                <QualityBar label="Specificity" value={quality.specificity} delay={0.1} />
                <QualityBar label="Data Citation" value={quality.data_citation} delay={0.2} />
                <QualityBar label="Actionability" value={quality.actionability} delay={0.3} />
                <QualityBar label="Novel Insight" value={quality.novel_insight} delay={0.4} />
                <QualityBar label="Red Team Rigor" value={quality.red_team_rigor} delay={0.5} />
              </div>
            ) : (
              <div className="space-y-4 opacity-30">
                {['Specificity', 'Data Citation', 'Actionability', 'Novel Insight', 'Red Team Rigor'].map(l => (
                  <QualityBar key={l} label={l} value={0} />
                ))}
                <p className="text-center text-[9px] font-mono text-amber-400/40 mt-3">
                  AWAITING_POST_MORTEM_EVALUATION
                </p>
                <p className="text-center text-[8px] font-mono text-white/20">
                  The AI judge evaluates debates asynchronously.
                </p>
              </div>
            )}

            {quality?.weakness && (
              <div className="mt-4 pt-3 border-t border-white/[0.06]">
                <p className="text-[8px] font-mono text-red-400/60 tracking-wider mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> LATEST_CRITICAL_WEAKNESS
                </p>
                <p className="text-[10px] font-mono text-white/60 italic border-l-2 border-red-500/30 pl-3 leading-relaxed line-clamp-2">
                  {quality.weakness}
                </p>
              </div>
            )}

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-white/[0.04]">
              <div>
                <p className="text-[8px] font-mono text-green-400/40 tracking-widest">TOTAL DEBATES</p>
                <p className="text-lg font-black text-white font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>{totalDebates}</p>
              </div>
              <div>
                <p className="text-[8px] font-mono text-green-400/40 tracking-widest">AGREEMENT RATE</p>
                <p className="text-lg font-black text-white font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {agreementRate != null ? `${agreementRate}%` : '--'}
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* ========== ROW 3: SELF-CORRECTION LOG ========== */}
        <motion.div {...fadeUp} transition={{ delay: 0.35 }}
          className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400/60" />
            <p className="text-[8px] font-mono text-green-400/40 tracking-widest">SELF-CORRECTION LOG</p>
            <p className="text-[8px] font-mono text-white/20">// RECENT LOSSES & CONTRADICTIONS</p>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-6 w-full" />)}
            </div>
          ) : contradictions.length === 0 ? (
            <div className="py-6 text-center">
              <Shield className="w-5 h-5 text-green-400/30 mx-auto mb-2" />
              <p className="text-[10px] font-mono text-green-400/40">No recent contradictions — record clean.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {contradictions.map((c, i) => (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1 - i * 0.12, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.05 }}
                  className="flex items-center gap-3 py-1.5 px-3 border-l-2 border-red-500/40 bg-red-500/[0.02] rounded-r"
                >
                  <TrendingDown className="w-3 h-3 text-red-400/60 shrink-0" />
                  <span className="text-[10px] font-mono text-white/40 shrink-0 w-14">{timeAgo(c.created_at)}</span>
                  <span className="text-[10px] font-mono text-white/70">
                    {c.direction?.toUpperCase() || 'TRADE'} {c.symbol || '?'} @ {c.conviction_score != null ? `${Math.round(c.conviction_score * 10)}/10` : '?'}
                  </span>
                  <span className="text-[10px] font-mono text-red-400 ml-auto shrink-0">
                    LOSS {c.resolution_pnl_pct != null ? `${c.resolution_pnl_pct > 0 ? '+' : ''}${c.resolution_pnl_pct.toFixed(1)}%` : ''}
                  </span>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* ========== EXPLAIN WITH AI ========== */}
        {!loading && (
          <motion.div {...fadeUp} transition={{ delay: 0.5 }}>
            <AIInsightsTerminal
              context="metacognition"
              data={{
                calibration: intel?.calibration || null,
                performance: intel?.performance || null,
                regime: intel?.regime || 'unknown',
                fearGreed: intel?.fearGreed || null,
                debateQuality: quality || null,
                debatesScoredCount,
                corrections: contradictions.slice(0, 5),
                userName: (() => { try { return localStorage.getItem('bobby_agent_name') || null; } catch { return null; } })(),
              }}
              commandLabel="bobby --explain metacognition"
              buttonLabel="EXPLAIN DASHBOARD WITH AI"
            />
          </motion.div>
        )}

        {/* ========== FOOTER: System info ========== */}
        <motion.div {...fadeUp} transition={{ delay: 0.45 }}
          className="flex flex-wrap items-center gap-4 text-[8px] font-mono text-white/15 tracking-wider">
          <span>CALIBRATION_MODULE_V2</span>
          <span>SAMPLE_SIZE: {cal?.sampleSize ?? 0}</span>
          <span>BREAK_EVEN_EXCLUDED: {cal?.breakEvenCount ?? 0}</span>
          <span>ADJUSTMENT: {cal?.adjustment?.toFixed(3) ?? '1.000'}x</span>
          <span className="flex items-center gap-1">
            <Activity className="w-2.5 h-2.5" /> LIVE
          </span>
        </motion.div>
      </div>
      )}
    </KineticShell>
  );
}

