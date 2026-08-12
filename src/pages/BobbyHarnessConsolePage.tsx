import { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import KineticShell from '../components/kinetic/KineticShell';

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
  stable: '#7da6ff',
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
    <KineticShell activeTab="harness" minimalNav>
      <Helmet>
        <title>Finance Harness Console | Bobby Protocol</title>
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#7da6ff]">Audit trail</div>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-[-0.07em] text-white">
            Finance harness console
          </h1>
          <p className="font-mono text-[10px] text-white/40 uppercase tracking-[0.15em] mt-2">
            Every decision. Every guardrail. Every proof. Auditable.
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
            This is the raw audit trail behind every Bobby verdict. <span className="text-[#7da6ff]">Trace Layer</span> streams every event Bobby emits — signals received, debates run, guardrails fired, trades executed, MCP calls paid. <span className="text-[#7da6ff]">Memory Layer</span> shows how those traces distill into long-term episodes Bobby uses to sharpen the next debate. If you want to know <em>why</em> Bobby blocked a trade or charged an agent, it happened here first.
          </p>
        </motion.div>

        {/* Stats strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3"
        >
          {[
            { label: 'Events', value: stats.total, color: '#7da6ff' },
            { label: 'Executed', value: stats.executions, color: '#6dfe9c' },
            { label: 'Blocked', value: stats.skips, color: '#ff716a' },
            { label: 'Parked', value: stats.parks, color: '#7da6ff' },
            { label: 'MCP calls', value: stats.mcpCalls, color: '#fcc025' },
            { label: 'Block rate', value: `${stats.blockRate}%`, color: '#ff716a' },
            { label: 'Avg conv', value: `${(stats.avgConv * 10).toFixed(1)}`, color: '#7da6ff' },
            { label: 'W/L', value: `${stats.wins}/${stats.losses}`, color: '#6dfe9c' },
          ].map(s => (
            <div key={s.label} className="bg-white/[0.04] border border-white/10 rounded-xl p-3 text-center">
              <div className="font-mono text-[9px] text-white/40 uppercase tracking-[0.15em]">{s.label}</div>
              <div className="text-lg font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </motion.div>

        {/* Main tabs: Events vs Memory */}
        <div className="flex gap-3 font-mono text-[10px] uppercase tracking-[0.15em] border-b border-white/10 pb-2">
          <button
            onClick={() => setActiveTab('events')}
            className={`px-4 py-2 rounded-t transition-colors ${
              activeTab === 'events'
                ? 'text-[#7da6ff] border-b-2 border-[#0052ff]'
                : 'text-white/45 hover:text-white'
            }`}
          >
            Trace Layer (L0)
          </button>
          <button
            onClick={() => setActiveTab('memory')}
            className={`px-4 py-2 rounded-t transition-colors ${
              activeTab === 'memory'
                ? 'text-[#fcc025] border-b-2 border-[#fcc025]'
                : 'text-white/45 hover:text-white'
            }`}
          >
            Memory Layer (L1) — {memories.length} episodes
          </button>
        </div>

        {activeTab === 'memory' && (
          <div className="space-y-4">
            {/* Memory stats */}
            {memoryStats && memoryStats.total_episodes > 0 && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4">
                  <div className="font-mono text-[9px] text-white/40 uppercase tracking-[0.15em] mb-2">Outcomes</div>
                  {Object.entries(memoryStats.outcome_distribution).map(([k, v]) => (
                    <div key={k} className="flex justify-between font-mono text-[11px]">
                      <span className={k === 'executed' ? 'text-[#6dfe9c]' : k === 'skip' ? 'text-[#ff716a]' : 'text-[#7da6ff]'}>{k}</span>
                      <span className="text-white">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4">
                  <div className="font-mono text-[9px] text-white/40 uppercase tracking-[0.15em] mb-2">Symbols</div>
                  {Object.entries(memoryStats.symbol_distribution).map(([k, v]) => (
                    <div key={k} className="flex justify-between font-mono text-[11px]">
                      <span className="text-white">{k}</span>
                      <span className="text-[#fcc025]">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4">
                  <div className="font-mono text-[9px] text-white/40 uppercase tracking-[0.15em] mb-2">Regimes</div>
                  {Object.entries(memoryStats.regime_distribution).map(([k, v]) => (
                    <div key={k} className="flex justify-between font-mono text-[11px]">
                      <span className="text-white">{k}</span>
                      <span className="text-[#7da6ff]">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Memory episodes */}
            <div className="bg-[#0b0b12]/80 border border-white/10 rounded-2xl overflow-hidden">
              <div className="bg-white/[0.04] px-4 py-2.5 border-b border-white/10 flex justify-between font-mono text-[10px] uppercase tracking-[0.15em] text-white/40">
                <span>memory_episodes.log</span>
                <span className="text-[#fcc025]">{memories.length} episodes</span>
              </div>
              {memories.length === 0 ? (
                <div className="p-8 text-center font-mono text-[11px] text-white/40">
                  No episodes yet. Memories are distilled automatically after each debate cycle.
                </div>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {memories.map((m) => {
                    const outcomeColor = m.outcome === 'executed' ? '#6dfe9c' : m.outcome === 'park' ? '#7da6ff' : '#ff716a';
                    return (
                      <div key={m.id} className="px-4 py-3 font-mono text-[11px]">
                        <div className="flex items-center gap-3">
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
                        <p className="text-white/55 mt-1.5 leading-relaxed">{m.lesson}</p>
                        {m.tags && m.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {(Array.isArray(m.tags) ? m.tags : []).map(t => (
                              <span key={t} className="px-2 py-0.5 rounded-md border border-white/10 bg-white/[0.04] text-[9px] text-white/45">{t}</span>
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
            <div className="border border-white/10 rounded-2xl p-5 bg-white/[0.04]">
              <h3 className="font-mono text-[10px] text-[#7da6ff] uppercase tracking-[0.18em] mb-4">
                Experiential memory architecture
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-[10px]">
                <div>
                  <div className="text-[#7da6ff] font-bold mb-1">L0 — Raw traces</div>
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
        <div className="flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-[0.15em]">
          {['all', 'decisions', 'allow', 'deny', 'stable', 'mcp'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 border rounded-lg transition-colors ${
                filter === f
                  ? 'border-[#0052ff] bg-[#0052ff] text-white'
                  : 'border-white/15 bg-white/10 backdrop-blur text-white/55 hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Event stream */}
        <div className="bg-[#0b0b12]/80 border border-white/10 rounded-2xl overflow-hidden">
          <div className="bg-white/[0.04] px-4 py-2.5 border-b border-white/10 flex justify-between font-mono text-[10px] uppercase tracking-[0.15em] text-white/40">
            <span>harness_events.log</span>
            <span className="text-[#7da6ff]">{filtered.length} events</span>
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
          className="border border-white/10 rounded-2xl p-5 bg-white/[0.04]"
        >
          <h3 className="font-mono text-[10px] text-[#7da6ff] uppercase tracking-[0.18em] mb-4">
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
    </KineticShell>
  );
}

function EventRow({ event }: { event: HarnessEvent }) {
  const [expanded, setExpanded] = useState(false);
  const decisionColor = DECISION_COLORS[event.decision || ''] || '#7da6ff';
  const icon = EVENT_ICONS[event.event_type] || '··';
  const convStr = event.conviction != null ? `${(event.conviction * 10).toFixed(1)}/10` : '—';

  return (
    <div
      className="px-4 py-3 hover:bg-white/[0.03] cursor-pointer transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      {/* Main row */}
      <div className="flex items-center gap-3 font-mono text-[11px]">
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
          className="mt-3 ml-10 space-y-2 font-mono text-[10px]"
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
                  className="text-[#7da6ff] hover:underline"
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
