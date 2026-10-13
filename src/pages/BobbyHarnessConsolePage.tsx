import { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import ProtocolLayout from '@/components/protocol/ProtocolLayout';

interface HarnessEvent {
  id: string;
  run_id: string;
  thread_id?: string;
  agent: string;
  event_type: string;
  tool?: string;
  symbol?: string;
  direction?: string;
  decision?: string;
  conviction?: number;
  risk_score?: number;
  policy_hits?: string[];
  reason?: string;
  payment_tx?: string;
  trade_tx?: string;
  latency_ms?: number;
  resolution?: string;
  resolution_pnl_pct?: number;
  quality_score?: number;
  entry_price?: number;
  stop_price?: number;
  target_price?: number;
  created_at: string;
}

const DECISION_COLORS: Record<string, string> = {
  allow: '#6dfe9c',
  reduce: '#fcc025',
  deny: '#ff716a',
  stable: '#d1c5e3',
};

const EVENT_ICONS: Record<string, string> = {
  execution: '>>',
  skip: '||',
  park: '%%',
  debate: '><',
  mcp_call: '[]',
  verdict: '!!',
  risk_gate: '##',
};

function fmtAgo(dateStr: string): string {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

interface MemoryObject {
  id: string;
  kind: string;
  thread_id?: string;
  symbol?: string;
  direction?: string;
  regime?: string;
  conviction?: number;
  outcome?: string;
  pnl_pct?: number;
  lesson: string;
  tags?: string[];
  created_at: string;
}

interface MemoryStats {
  total_episodes: number;
  outcome_distribution: Record<string, number>;
  symbol_distribution: Record<string, number>;
  regime_distribution: Record<string, number>;
}

export default function BobbyHarnessConsolePage() {
  const [events, setEvents] = useState<HarnessEvent[]>([]);
  const [memories, setMemories] = useState<MemoryObject[]>([]);
  const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'events' | 'memory'>('events');

  useEffect(() => {
    Promise.all([
      fetch('/api/harness-events?limit=100').then(r => r.json()).catch(() => ({ events: [] })),
      fetch('/api/harness-memory?limit=50').then(r => r.json()).catch(() => ({ memories: [], stats: null })),
    ]).then(([evData, memData]) => {
      setEvents(evData.events || []);
      setMemories(memData.memories || []);
      setMemoryStats(memData.stats || null);
      setLoading(false);
    });
  }, []);

  // Stats
  const stats = useMemo(() => {
    const total = events.length;
    const executions = events.filter(e => e.event_type === 'execution').length;
    const skips = events.filter(e => e.decision === 'deny').length;
    const parks = events.filter(e => e.decision === 'stable').length;
    const mcpCalls = events.filter(e => e.event_type === 'mcp_call').length;
    const convictions = events.map(e => e.conviction).filter((c): c is number => c != null);
    const avgConv = convictions.length > 0 ? convictions.reduce((a, b) => a + b, 0) / convictions.length : 0;
    const wins = events.filter(e => e.resolution === 'win').length;
    const losses = events.filter(e => e.resolution === 'loss').length;
    const blockRate = total > 0 ? Math.round(((skips + parks) / total) * 100) : 0;
    return { total, executions, skips, parks, mcpCalls, avgConv, wins, losses, blockRate };
  }, [events]);

  const filtered = useMemo(() => {
    if (filter === 'all') return events;
    if (filter === 'decisions') return events.filter(e => ['execution', 'skip', 'park'].includes(e.event_type));
    if (filter === 'mcp') return events.filter(e => e.event_type === 'mcp_call');
    return events.filter(e => e.decision === filter);
  }, [events, filter]);

  return (
    <ProtocolLayout
      active="harness"
      wide
      eyebrow="Protocol evidence / Finance harness"
      title="Every decision leaves a trace."
      description="Every guardrail. Every proof. Auditable. Explore the raw audit trail behind each Bobby verdict, from the first signal to the lesson that shapes the next debate."
    >
      <Helmet>
        <title>Finance Harness Console | Bobby Protocol</title>
      </Helmet>

      <div className="protocol-content space-y-8 pb-20">
        {/* Trace and memory overview */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="grid gap-8 border-y border-white/10 py-8 md:grid-cols-2 md:gap-16">
            <div>
              <div className="protocol-eyebrow">01 / Trace layer</div>
              <h2 className="mt-3 text-2xl font-light tracking-[-0.04em]">Follow what happened.</h2>
              <p className="mt-3 text-sm leading-7 text-[#a39c91]">Signals received, debates run, guardrails fired, trades executed, MCP calls paid. If you want to know why Bobby blocked a trade or charged an agent, it happened here first.</p>
            </div>
            <div>
              <div className="protocol-eyebrow">02 / Memory layer</div>
              <h2 className="mt-3 text-2xl font-light tracking-[-0.04em]">See what was learned.</h2>
              <p className="mt-3 text-sm leading-7 text-[#a39c91]">Raw traces distill into long-term episodes. Explore the outcomes, market regimes, and lessons Bobby uses to sharpen the next debate.</p>
            </div>
          </div>
        </motion.div>

        {/* Stats strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="protocol-panel grid grid-cols-2 gap-x-6 gap-y-8 p-6 md:grid-cols-4 md:p-8 lg:grid-cols-8"
        >
          {[
            { label: 'Events', value: stats.total, color: '#d1c5e3' },
            { label: 'Executed', value: stats.executions, color: '#6dfe9c' },
            { label: 'Blocked', value: stats.skips, color: '#ff716a' },
            { label: 'Parked', value: stats.parks, color: '#d1c5e3' },
            { label: 'MCP calls', value: stats.mcpCalls, color: '#fcc025' },
            { label: 'Block rate', value: `${stats.blockRate}%`, color: '#ff716a' },
            { label: 'Avg conv', value: `${(stats.avgConv * 10).toFixed(1)}`, color: '#d1c5e3' },
            { label: 'W/L', value: `${stats.wins}/${stats.losses}`, color: '#6dfe9c' },
          ].map(s => (
            <div key={s.label} className="min-w-0">
              <div className="font-mono text-[9px] text-white/40 uppercase tracking-[0.15em]">{s.label}</div>
              <div className="mt-3 text-2xl font-light tracking-[-0.04em]" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </motion.div>

        {/* Main tabs: Events vs Memory */}
        <div role="tablist" aria-label="Audit layers" className="flex flex-wrap gap-3 border-b border-white/10 pb-3">
          <button
            role="tab"
            aria-selected={activeTab === 'events'}
            onClick={() => setActiveTab('events')}
            className={`px-5 py-3 rounded-full text-sm transition-colors ${
              activeTab === 'events'
                ? 'bg-[#f2ede4] text-[#0b0a09]'
                : 'text-[#a39c91] hover:text-[#f2ede4]'
            }`}
          >
            Trace Layer (L0)
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'memory'}
            onClick={() => setActiveTab('memory')}
            className={`px-5 py-3 rounded-full text-sm transition-colors ${
              activeTab === 'memory'
                ? 'bg-[#f2ede4] text-[#0b0a09]'
                : 'text-[#a39c91] hover:text-[#f2ede4]'
            }`}
          >
            Memory Layer (L1) — {memories.length} episodes
          </button>
        </div>

        {activeTab === 'memory' && (
          <div className="space-y-4">
            {/* Memory stats */}
            {memoryStats && memoryStats.total_episodes > 0 && (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="bg-white/[0.025] border border-white/10 rounded-xl p-4">
                  <div className="font-mono text-[9px] text-white/40 uppercase tracking-[0.15em] mb-2">Outcomes</div>
                  {Object.entries(memoryStats.outcome_distribution).map(([k, v]) => (
                    <div key={k} className="flex justify-between font-mono text-[11px]">
                      <span className={k === 'executed' ? 'text-[#6dfe9c]' : k === 'skip' ? 'text-[#ff716a]' : 'text-[#d1c5e3]'}>{k}</span>
                      <span className="text-white">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-white/[0.025] border border-white/10 rounded-xl p-4">
                  <div className="font-mono text-[9px] text-white/40 uppercase tracking-[0.15em] mb-2">Symbols</div>
                  {Object.entries(memoryStats.symbol_distribution).map(([k, v]) => (
                    <div key={k} className="flex justify-between font-mono text-[11px]">
                      <span className="text-white">{k}</span>
                      <span className="text-[#fcc025]">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-white/[0.025] border border-white/10 rounded-xl p-4">
                  <div className="font-mono text-[9px] text-white/40 uppercase tracking-[0.15em] mb-2">Regimes</div>
                  {Object.entries(memoryStats.regime_distribution).map(([k, v]) => (
                    <div key={k} className="flex justify-between font-mono text-[11px]">
                      <span className="text-white">{k}</span>
                      <span className="text-[#d1c5e3]">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Memory episodes */}
            <div className="bg-[#15121c]/80 border border-white/10 rounded-[24px] overflow-hidden">
              <div className="bg-white/[0.025] px-4 py-2.5 border-b border-white/10 flex justify-between font-mono text-[10px] uppercase tracking-[0.15em] text-white/40">
                <span>Memory episodes</span>
                <span className="text-[#fcc025]">{memories.length} episodes</span>
              </div>
              {memories.length === 0 ? (
                <div className="p-8 text-center font-mono text-[11px] text-white/40">
                  No episodes yet. Memories are distilled automatically after each debate cycle.
                </div>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {memories.map((m) => {
                    const outcomeColor = m.outcome === 'executed' ? '#6dfe9c' : m.outcome === 'park' ? '#d1c5e3' : '#ff716a';
                    return (
                      <div key={m.id} className="px-4 py-3 font-mono text-[11px]">
                        <div className="flex flex-wrap items-center gap-3">
                          <span
                            className="px-2 py-0.5 rounded text-[9px] uppercase font-bold border"
                            style={{ color: outcomeColor, borderColor: `${outcomeColor}40`, backgroundColor: `${outcomeColor}10` }}
                          >
                            {m.outcome || '?'}
                          </span>
                          {m.symbol && <span className="text-white font-bold">{m.symbol} {m.direction?.toUpperCase()}</span>}
                          {m.conviction != null && (
                            <span style={{ color: m.conviction >= 0.35 ? '#6dfe9c' : '#ff716a' }}>
                              {(m.conviction * 10).toFixed(1)}/10
                            </span>
                          )}
                          {m.regime && <span className="text-white/45">{m.regime}</span>}
                          <span className="text-white/25 ml-auto">
                            {new Date(m.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-[#a39c91] mt-3 font-sans text-sm leading-7">{m.lesson}</p>
                        {m.tags && m.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {(Array.isArray(m.tags) ? m.tags : []).map(t => (
                              <span key={t} className="px-2 py-0.5 rounded-md border border-white/10 bg-white/[0.025] text-[9px] text-white/45">{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Memory architecture reference */}
            <div className="border border-white/10 rounded-[24px] p-5 bg-white/[0.025]">
              <h3 className="font-mono text-[10px] text-[#d1c5e3] uppercase tracking-[0.18em] mb-4">
                Experiential memory architecture
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-[10px]">
                <div>
                  <div className="text-[#d1c5e3] font-bold mb-1">L0 — Raw traces</div>
                  <div className="text-white/50">agent_events table. Every tool call, debate, quote, payment, rejection.</div>
                </div>
                <div>
                  <div className="text-[#fcc025] font-bold mb-1">L1 — Episodes</div>
                  <div className="text-white/50">Distilled after each cycle. Symbol, regime, conviction, outcome, lesson.</div>
                </div>
                <div>
                  <div className="text-white/35 font-bold mb-1">L2 — Heuristics</div>
                  <div className="text-white/25">Patterns from N episodes. "SOL shorts in low vol lose 80%." [Future]</div>
                </div>
                <div>
                  <div className="text-white/35 font-bold mb-1">L3 — Calibration priors</div>
                  <div className="text-white/25">Meta-learning. "Conviction 8+ overestimates in high vol." [Future]</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'events' && <>
        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2 text-xs">
          {['all', 'decisions', 'allow', 'deny', 'stable', 'mcp'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`px-4 py-2 border rounded-full capitalize transition-colors ${
                filter === f
                  ? 'border-[#f2ede4]/30 bg-[#f2ede4]/10 text-[#f2ede4]'
                  : 'border-white/10 text-[#a39c91] hover:text-[#f2ede4]'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Event stream */}
        <div className="bg-[#15121c]/80 border border-white/10 rounded-[24px] overflow-hidden">
          <div className="bg-white/[0.025] px-4 py-2.5 border-b border-white/10 flex justify-between font-mono text-[10px] uppercase tracking-[0.15em] text-white/40">
            <span>Decision & tool activity</span>
            <span className="text-[#d1c5e3]">{filtered.length} events</span>
          </div>

          {loading ? (
            <div className="p-8 text-center font-mono text-[11px] text-white/40">
              Loading harness events...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center font-mono text-[11px] text-white/40">
              No events matching filter. Run /api/harness-migrate to initialize, then wait for next cycle.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {filtered.map((event, i) => (
                <EventRow key={event.id || i} event={event} />
              ))}
            </div>
          )}
        </div>

        {/* Verdict schema reference */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="border border-white/10 rounded-[24px] p-5 bg-white/[0.025]"
        >
          <h3 className="font-mono text-[10px] text-[#d1c5e3] uppercase tracking-[0.18em] mb-4">
            Harness verdict schema
          </h3>
          <pre className="font-mono text-[11px] text-white/55 leading-relaxed overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4">
{`{
  "status": "allow | reduce | deny | stable",
  "confidence": 0.72,          // conviction normalized 0-1
  "risk_score": 28,             // 0-100 (higher = riskier)
  "policy_hits": [              // guardrails evaluated
    "conviction_gate_pass",
    "stop_loss_set",
    "risk_gate_pass"
  ],
  "reason": "Conviction 7.2/10 passed all guardrails. Trade executed."
}`}
          </pre>
          <p className="font-mono text-[10px] text-white/35 mt-3">
            Every cycle produces a verdict. Every verdict is logged. Every log is queryable via /api/harness-events.
          </p>
        </motion.div>
        </>}
      </div>
    </ProtocolLayout>
  );
}

function EventRow({ event }: { event: HarnessEvent }) {
  const [expanded, setExpanded] = useState(false);
  const decisionColor = DECISION_COLORS[event.decision || ''] || '#d1c5e3';
  const icon = EVENT_ICONS[event.event_type] || '··';
  const convStr = event.conviction != null ? `${(event.conviction * 10).toFixed(1)}/10` : '—';

  return (
    <div
      className="px-5 py-5 hover:bg-white/[0.03] cursor-pointer transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#b5a2de]"
      onClick={() => setExpanded(!expanded)}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setExpanded(!expanded);
        }
      }}
    >
      {/* Main row */}
      <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
        {/* Icon */}
        <span
          className="w-7 h-7 flex items-center justify-center rounded text-[10px] font-bold border shrink-0"
          style={{ color: decisionColor, borderColor: `${decisionColor}33` }}
        >
          {icon}
        </span>

        {/* Type + Symbol */}
        <span className="text-white/45 w-16 shrink-0 uppercase tracking-[0.1em]">{event.event_type}</span>

        {event.symbol && (
          <span className="text-white font-bold">
            {event.symbol} {event.direction?.toUpperCase()}
          </span>
        )}

        {event.tool && (
          <span className="text-[#fcc025]">{event.tool}</span>
        )}

        {/* Decision badge */}
        {event.decision && (
          <span
            className="px-2 py-0.5 rounded text-[9px] uppercase font-bold border"
            style={{
              color: decisionColor,
              borderColor: `${decisionColor}40`,
              backgroundColor: `${decisionColor}10`,
            }}
          >
            {event.decision}
          </span>
        )}

        {/* Conviction */}
        {event.conviction != null && (
          <span style={{ color: event.conviction >= 0.35 ? '#6dfe9c' : '#ff716a' }}>
            {convStr}
          </span>
        )}

        {/* Resolution */}
        {event.resolution && event.resolution !== 'pending' && (
          <span className={event.resolution === 'win' ? 'text-[#6dfe9c]' : 'text-[#ff716a]'}>
            {event.resolution.toUpperCase()}
            {event.resolution_pnl_pct != null && ` ${event.resolution_pnl_pct > 0 ? '+' : ''}${event.resolution_pnl_pct.toFixed(1)}%`}
          </span>
        )}

        {/* Time */}
        <span className="text-white/25 ml-auto shrink-0">
          {fmtAgo(event.created_at)}
        </span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-5 space-y-4 font-mono text-xs sm:ml-10"
        >
          {event.reason && (
            <div>
              <span className="text-white/40 uppercase tracking-[0.12em]">Reason: </span>
              <span className="text-white/70">{event.reason}</span>
            </div>
          )}

          {event.policy_hits && event.policy_hits.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-white/40 uppercase tracking-[0.12em]">Policy: </span>
              {event.policy_hits.map(p => (
                <span
                  key={p}
                  className={`px-1.5 py-0.5 rounded border text-[9px] ${
                    p.includes('pass') || p.includes('win')
                      ? 'border-[#6dfe9c]/20 text-[#6dfe9c]'
                      : p.includes('block') || p.includes('loss')
                      ? 'border-[#ff716a]/20 text-[#ff716a]'
                      : 'border-white/10 text-white/45'
                  }`}
                >
                  {p}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-4 text-white/40">
            {event.risk_score != null && (
              <span>Risk: <span className="text-white">{event.risk_score}/100</span></span>
            )}
            {event.entry_price != null && (
              <span>Entry: <span className="text-white">${event.entry_price}</span></span>
            )}
            {event.stop_price != null && (
              <span>Stop: <span className="text-[#ff716a]">${event.stop_price}</span></span>
            )}
            {event.target_price != null && (
              <span>Target: <span className="text-[#6dfe9c]">${event.target_price}</span></span>
            )}
            {event.latency_ms != null && (
              <span>Latency: <span className="text-white">{event.latency_ms}ms</span></span>
            )}
            {event.quality_score != null && (
              <span>Quality: <span className="text-[#fcc025]">{event.quality_score}/100</span></span>
            )}
          </div>

          {(event.trade_tx || event.payment_tx) && (
            <div className="flex flex-wrap gap-4">
              {event.trade_tx && (
                <a
                  href={`https://www.oklink.com/xlayer/tx/${event.trade_tx}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#d1c5e3] hover:underline"
                >
                  Trade TX: {event.trade_tx.slice(0, 14)}...
                </a>
              )}
              {event.payment_tx && (
                <a
                  href={`https://www.oklink.com/xlayer/tx/${event.payment_tx}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#fcc025] hover:underline"
                >
                  Payment TX: {event.payment_tx.slice(0, 14)}...
                </a>
              )}
            </div>
          )}

          <div className="text-white/20">
            ID: {event.run_id} | Thread: {event.thread_id || '—'}
          </div>
        </motion.div>
      )}
    </div>
  );
}
