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
  stable: '#60a5fa',
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

export default function BobbyHarnessConsolePage() {
  const [events, setEvents] = useState<HarnessEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetch('/api/harness-events?limit=100')
      .then(r => r.json())
      .then(data => {
        setEvents(data.events || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
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
    <KineticShell activeTab="harness">
      <Helmet>
        <title>Finance Harness Console | Bobby Protocol</title>
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tighter text-white">
            Finance Harness Console
          </h1>
          <p className="font-mono text-[11px] text-[#adaaaa] uppercase tracking-widest mt-1">
            Every decision. Every guardrail. Every proof. Auditable.
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
            { label: 'EVENTS', value: stats.total, color: '#6dfe9c' },
            { label: 'EXECUTED', value: stats.executions, color: '#6dfe9c' },
            { label: 'BLOCKED', value: stats.skips, color: '#ff716a' },
            { label: 'PARKED', value: stats.parks, color: '#60a5fa' },
            { label: 'MCP CALLS', value: stats.mcpCalls, color: '#fcc025' },
            { label: 'BLOCK RATE', value: `${stats.blockRate}%`, color: '#ff716a' },
            { label: 'AVG CONV', value: `${(stats.avgConv * 10).toFixed(1)}`, color: '#fcc025' },
            { label: 'W/L', value: `${stats.wins}/${stats.losses}`, color: '#6dfe9c' },
          ].map(s => (
            <div key={s.label} className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3 text-center">
              <div className="font-mono text-[9px] text-[#adaaaa] uppercase tracking-widest">{s.label}</div>
              <div className="text-lg font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </motion.div>

        {/* Filter tabs */}
        <div className="flex gap-2 font-mono text-[10px] uppercase tracking-widest">
          {['all', 'decisions', 'allow', 'deny', 'stable', 'mcp'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 border rounded transition-colors ${
                filter === f
                  ? 'border-[#6dfe9c]/40 text-[#6dfe9c] bg-[#6dfe9c]/[0.05]'
                  : 'border-white/[0.06] text-[#adaaaa] hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Event stream */}
        <div className="bg-black border border-[#494847]/20 rounded-lg overflow-hidden">
          <div className="bg-[#131313] px-4 py-2 border-b border-[#494847]/20 flex justify-between font-mono text-[10px] text-[#adaaaa]">
            <span>harness_events.log</span>
            <span className="text-[#6dfe9c]">{filtered.length} events</span>
          </div>

          {loading ? (
            <div className="p-8 text-center font-mono text-[11px] text-[#adaaaa]">
              :: LOADING HARNESS EVENTS ::
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center font-mono text-[11px] text-[#adaaaa]">
              No events matching filter. Run /api/harness-migrate to initialize, then wait for next cycle.
            </div>
          ) : (
            <div className="divide-y divide-[#494847]/10">
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
          className="border border-white/[0.06] rounded-lg p-5 bg-white/[0.01]"
        >
          <h3 className="font-mono text-[11px] text-[#fcc025] uppercase tracking-widest mb-3">
            :: HARNESS VERDICT SCHEMA ::
          </h3>
          <pre className="font-mono text-[11px] text-[#adaaaa] leading-relaxed overflow-x-auto">
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
          <p className="font-mono text-[10px] text-[#adaaaa]/60 mt-3">
            Every cycle produces a verdict. Every verdict is logged. Every log is queryable via /api/harness-events.
          </p>
        </motion.div>
      </div>
    </KineticShell>
  );
}

function EventRow({ event }: { event: HarnessEvent }) {
  const [expanded, setExpanded] = useState(false);
  const decisionColor = DECISION_COLORS[event.decision || ''] || '#adaaaa';
  const icon = EVENT_ICONS[event.event_type] || '··';
  const convStr = event.conviction != null ? `${(event.conviction * 10).toFixed(1)}/10` : '—';

  return (
    <div
      className="px-4 py-3 hover:bg-white/[0.01] cursor-pointer transition-colors"
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
        <span className="text-[#adaaaa] w-16 shrink-0 uppercase">{event.event_type}</span>

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
        <span className="text-[#adaaaa]/40 ml-auto shrink-0">
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
              <span className="text-[#adaaaa]">REASON: </span>
              <span className="text-white/70">{event.reason}</span>
            </div>
          )}

          {event.policy_hits && event.policy_hits.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-[#adaaaa]">POLICY: </span>
              {event.policy_hits.map(p => (
                <span
                  key={p}
                  className={`px-1.5 py-0.5 rounded border text-[9px] ${
                    p.includes('pass') || p.includes('win')
                      ? 'border-[#6dfe9c]/20 text-[#6dfe9c]'
                      : p.includes('block') || p.includes('loss')
                      ? 'border-[#ff716a]/20 text-[#ff716a]'
                      : 'border-white/10 text-[#adaaaa]'
                  }`}
                >
                  {p}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-4 text-[#adaaaa]">
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
                  className="text-[#6dfe9c] hover:underline"
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

          <div className="text-[#adaaaa]/30">
            ID: {event.run_id} | Thread: {event.thread_id || '—'}
          </div>
        </motion.div>
      )}
    </div>
  );
}
