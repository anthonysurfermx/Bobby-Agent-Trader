// ============================================================
// IntelligenceFeed — Visible metacognition: Alpha vs Red Team vs Bobby CIO
// Shows the internal debate that leads to Bobby's trading decisions
// "If the debate happens in the backend, it doesn't exist for the judge."
// ============================================================

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Brain, Sword, Shield, Gavel, Activity, TrendingUp } from 'lucide-react';

export interface DebateData {
  alphaView: string;
  redTeamView: string;
  judgeVerdict: string;
  selfOptimized?: boolean;
  sizingMethod?: string;
}

export interface MetacognitionData {
  winRate: number;
  mood: 'confident' | 'cautious' | 'defensive';
  isSafeMode: boolean;
}

export interface SignalData {
  token: string;
  chain: string;
  score: number;
  reasons: string[];
}

export interface PolyData {
  title: string;
  traders: number;
  consensus: string;
  price: string;
  edge: string;
}

interface IntelligenceFeedProps {
  debate: DebateData;
  metacognition?: MetacognitionData;
  topSignals?: SignalData[];
  polymarket?: PolyData[];
  isLive?: boolean; // true = animate entries one by one
}

const CHAIN_NAME: Record<string, string> = { '1': 'ETH', '501': 'SOL', '8453': 'Base', '196': 'X Layer' };

export function IntelligenceFeed({ debate, metacognition, topSignals, polymarket, isLive = false }: IntelligenceFeedProps) {
  const [expanded, setExpanded] = useState(true);

  const moodColor = metacognition?.mood === 'confident'
    ? 'text-green-400' : metacognition?.mood === 'cautious'
    ? 'text-amber-400' : 'text-red-400';

  const moodBorder = metacognition?.mood === 'confident'
    ? 'border-green-500/20' : metacognition?.mood === 'cautious'
    ? 'border-amber-500/20' : 'border-red-500/20';

  const moodBg = metacognition?.mood === 'confident'
    ? 'bg-green-500/5' : metacognition?.mood === 'cautious'
    ? 'bg-amber-500/5' : 'bg-red-500/5';

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="w-full max-w-2xl mx-auto"
    >
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center justify-between px-4 py-2.5 border ${moodBorder} ${moodBg} backdrop-blur-sm transition-colors hover:bg-white/[0.03]`}
      >
        <div className="flex items-center gap-2">
          <Brain className={`w-3.5 h-3.5 ${moodColor}`} />
          <span className="text-[10px] font-mono font-bold tracking-[2px] text-white/60 uppercase">
            Intelligence Console
          </span>
          {metacognition && (
            <span className={`text-[9px] font-mono ${moodColor} ml-2`}>
              {metacognition.mood.toUpperCase()} {metacognition.isSafeMode ? '/ SAFE MODE' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {metacognition && (
            <span className="text-[9px] font-mono text-white/30">
              WR {metacognition.winRate.toFixed(0)}%
            </span>
          )}
          {expanded ? <ChevronUp className="w-3 h-3 text-white/30" /> : <ChevronDown className="w-3 h-3 text-white/30" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className={`border border-t-0 ${moodBorder} ${moodBg} backdrop-blur-sm`}>

              {/* SIGNALS DETECTED */}
              {topSignals && topSignals.length > 0 && (
                <FeedSection
                  icon={<Activity className="w-3 h-3 text-cyan-400" />}
                  label="SIGNALS DETECTED"
                  delay={isLive ? 0.2 : 0}
                >
                  {topSignals.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
                      <span className="text-cyan-400/60">[{CHAIN_NAME[s.chain] || s.chain}]</span>
                      <span className="text-white/70">{s.token}</span>
                      <span className="text-white/30">score:{s.score}</span>
                      <span className="text-white/20">{s.reasons.join(', ')}</span>
                    </div>
                  ))}
                </FeedSection>
              )}

              {/* ALPHA HUNTER */}
              <FeedSection
                icon={<Sword className="w-3 h-3 text-green-400" />}
                label="ALPHA HUNTER"
                color="green"
                delay={isLive ? 0.8 : 0}
              >
                <p className="text-[11px] font-mono text-green-300/70 leading-relaxed whitespace-pre-line">
                  {debate.alphaView}
                </p>
              </FeedSection>

              {/* RED TEAM */}
              <FeedSection
                icon={<Shield className="w-3 h-3 text-red-400" />}
                label="RED TEAM"
                color="red"
                delay={isLive ? 1.5 : 0}
              >
                <p className="text-[11px] font-mono text-red-300/70 leading-relaxed whitespace-pre-line">
                  {debate.redTeamView}
                </p>
              </FeedSection>

              {/* BOBBY CIO — THE VERDICT */}
              <FeedSection
                icon={<Gavel className="w-3 h-3 text-amber-400" />}
                label="BOBBY CIO — VERDICT"
                color="amber"
                delay={isLive ? 2.2 : 0}
              >
                <p className="text-[11px] font-mono text-amber-200/80 leading-relaxed whitespace-pre-line">
                  {debate.judgeVerdict}
                </p>
              </FeedSection>

              {/* POLYMARKET CONSENSUS */}
              {polymarket && polymarket.length > 0 && (
                <FeedSection
                  icon={<TrendingUp className="w-3 h-3 text-purple-400" />}
                  label="POLYMARKET CONSENSUS"
                  delay={isLive ? 2.8 : 0}
                >
                  {polymarket.map((m, i) => (
                    <div key={i} className="text-[10px] font-mono space-y-0.5">
                      <div className="text-purple-300/70 truncate">"{m.title}"</div>
                      <div className="text-white/30 pl-2">
                        {m.traders} traders → {m.consensus} | {m.price} | edge {m.edge}
                      </div>
                    </div>
                  ))}
                </FeedSection>
              )}

              {/* SIZING + SELF-OPTIMIZATION */}
              <div className="px-4 py-2 flex items-center gap-3 text-[9px] font-mono text-white/20 border-t border-white/[0.03]">
                {debate.sizingMethod && <span>sizing: {debate.sizingMethod}</span>}
                {debate.selfOptimized && <span className="text-green-400/40">prompt self-optimized</span>}
                {metacognition?.isSafeMode && <span className="text-red-400/50">SAFE MODE — reduced exposure</span>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ---- Feed Section sub-component ----
function FeedSection({
  icon,
  label,
  color = 'white',
  delay = 0,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  color?: string;
  delay?: number;
  children: React.ReactNode;
}) {
  const labelColor = color === 'green' ? 'text-green-400/60'
    : color === 'red' ? 'text-red-400/60'
    : color === 'amber' ? 'text-amber-400/60'
    : color === 'purple' ? 'text-purple-400/60'
    : 'text-white/40';

  return (
    <motion.div
      initial={delay > 0 ? { opacity: 0, x: -8 } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="px-4 py-3 border-t border-white/[0.03] space-y-1.5"
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span className={`text-[9px] font-mono font-bold tracking-[1.5px] uppercase ${labelColor}`}>
          {label}
        </span>
      </div>
      <div className="pl-5 space-y-1">
        {children}
      </div>
    </motion.div>
  );
}
