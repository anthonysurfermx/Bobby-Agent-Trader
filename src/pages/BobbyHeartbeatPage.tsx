import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';

interface HeartbeatData {
  ok: boolean;
  timestamp: string;
  chain: { id: number; blockNumber: number; status: string };
  treasury: { address: string; balanceOkb: string };
  revenue: {
    totalVolumeOkb: string;
    totalPayments: number;
    totalMcpCalls: number;
    totalDebates: number;
  };
  performance: { winRate: number; totalTrades: number; totalBounties: number };
  lastCycle: {
    id: string;
    status: string;
    vibe: string;
    tradesExecuted: number;
    ageSeconds: number;
  } | null;
  recentCommerce: Array<{
    tool: string;
    status: string;
    payer: string | null;
    age: number;
  }>;
  health: {
    chain: string;
    cycle: string;
    contracts: string;
    overall: string;
  };
  contracts: {
    agentEconomy: { address: string; lastActivityBlock: number };
    bounties: { address: string; totalPosted: number };
    trackRecord: { address: string };
  };
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'healthy' || status === 'active' || status === 'operational'
    ? 'bg-green-400'
    : status === 'degraded' || status === 'overdue'
    ? 'bg-amber-400'
    : 'bg-red-400';
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${color} animate-pulse`} />
  );
}

function HealthBadge({ label, status }: { label: string; status: string }) {
  const colors = status === 'healthy' || status === 'active' || status === 'operational'
    ? 'border-green-400/30 text-green-400'
    : status === 'degraded' || status === 'overdue'
    ? 'border-amber-400/30 text-amber-400'
    : 'border-red-400/30 text-red-400';
  return (
    <div className={`border ${colors} rounded-lg px-3 py-2 flex items-center gap-2 bg-white/[0.02]`}>
      <StatusDot status={status} />
      <span className="text-xs font-mono uppercase">{label}</span>
      <span className="text-xs font-mono opacity-60">{status}</span>
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4">
      <div className="text-xs font-mono text-white/40 uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-mono text-green-400 mt-1">{value}</div>
      {sub && <div className="text-xs font-mono text-white/30 mt-1">{sub}</div>}
    </div>
  );
}

export default function BobbyHeartbeatPage() {
  const [data, setData] = useState<HeartbeatData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchHeartbeat = async () => {
    try {
      const res = await fetch('/api/protocol-heartbeat');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHeartbeat();
    const interval = setInterval(fetchHeartbeat, 15000); // Poll every 15s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <Helmet><title>Protocol Heartbeat | Bobby Agent Trader</title></Helmet>

      {/* Header */}
      <div className="border-b border-white/[0.04] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/protocol" className="text-white/40 hover:text-green-400 transition text-sm font-mono">
            &larr; PROTOCOL
          </a>
          <h1 className="text-lg font-mono text-green-400 tracking-wider">PROTOCOL HEARTBEAT</h1>
          {data?.health && <StatusDot status={data.health.overall} />}
        </div>
        <div className="text-xs font-mono text-white/30">
          Last refresh: {lastRefresh.toLocaleTimeString()}
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-green-400 font-mono animate-pulse">Connecting to X Layer...</div>
        </div>
      ) : error && !data ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-red-400 font-mono">Error: {error}</div>
        </div>
      ) : data ? (
        <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
          {/* Health Status Row */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap gap-3"
          >
            <HealthBadge label="X Layer" status={data.health.chain} />
            <HealthBadge label="Cycle" status={data.health.cycle} />
            <HealthBadge label="Contracts" status={data.health.contracts} />
            <HealthBadge label="Overall" status={data.health.overall} />
            <div className="ml-auto text-xs font-mono text-white/20 self-center">
              Block #{data.chain.blockNumber.toLocaleString()}
            </div>
          </motion.div>

          {/* Revenue + Performance Metrics */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4"
          >
            <MetricCard
              label="Treasury"
              value={`${parseFloat(data.treasury.balanceOkb).toFixed(4)} OKB`}
              sub={`${data.treasury.address.slice(0, 10)}...`}
            />
            <MetricCard
              label="Revenue"
              value={`${parseFloat(data.revenue.totalVolumeOkb).toFixed(4)} OKB`}
              sub={`${data.revenue.totalPayments} payments settled`}
            />
            <MetricCard
              label="Win Rate"
              value={`${data.performance.winRate.toFixed(1)}%`}
              sub={`${data.performance.totalTrades} trades`}
            />
            <MetricCard
              label="Bounties"
              value={data.performance.totalBounties}
              sub="posted on-chain"
            />
          </motion.div>

          {/* Activity Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Last Cycle */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-5"
            >
              <div className="text-xs font-mono text-white/40 uppercase tracking-wider mb-3">Last Debate Cycle</div>
              {data.lastCycle ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-mono text-green-400">{data.lastCycle.status}</span>
                    <span className="text-xs font-mono text-white/30">{formatAge(data.lastCycle.ageSeconds)}</span>
                  </div>
                  {data.lastCycle.vibe && (
                    <div className="text-sm font-mono text-white/60 italic">"{data.lastCycle.vibe}"</div>
                  )}
                  <div className="text-xs font-mono text-white/30">
                    {data.lastCycle.tradesExecuted} trade{data.lastCycle.tradesExecuted !== 1 ? 's' : ''} executed
                  </div>
                </div>
              ) : (
                <div className="text-sm font-mono text-white/30">No cycles recorded yet</div>
              )}
            </motion.div>

            {/* Recent MCP Commerce */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-5"
            >
              <div className="text-xs font-mono text-white/40 uppercase tracking-wider mb-3">Recent MCP Payments</div>
              {data.recentCommerce.length > 0 ? (
                <div className="space-y-2">
                  {data.recentCommerce.map((event, i) => (
                    <div key={i} className="flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-2">
                        <span className={event.status === 'confirmed' ? 'text-green-400' : 'text-amber-400'}>
                          {event.status === 'confirmed' ? '[PAID]' : '[PEND]'}
                        </span>
                        <span className="text-white/60">{event.tool}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {event.payer && <span className="text-white/20">{event.payer}</span>}
                        <span className="text-white/30">{formatAge(event.age)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm font-mono text-white/30">No commerce events yet</div>
              )}
            </motion.div>
          </div>

          {/* Proven On-Chain Transactions */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-5"
          >
            <div className="text-xs font-mono text-white/40 uppercase tracking-wider mb-3">Proven On-Chain Transactions</div>
            <div className="space-y-2">
              {[
                { label: 'x402 MCP Payment', tx: '0x6593041ea93a338916dffdb3b203d034c240ec34fb2d04cbad2acbc7e7688fdf', detail: 'bobby_analyze | 0.001 OKB' },
                { label: 'Bounty #1 Posted', tx: '0x68d4c3f69a01cc3983a1d6b0b9625f54c474a8e80df90685a5cc38f3a2355ad0', detail: 'DATA_INTEGRITY | 0.001 OKB' },
              ].map((proof) => (
                <a
                  key={proof.tx}
                  href={`https://www.oklink.com/xlayer/tx/${proof.tx}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between px-3 py-2 bg-white/[0.01] border border-white/[0.03] rounded-lg hover:border-green-400/30 transition group"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-green-400 rounded-full" />
                    <span className="text-xs font-mono text-green-400">{proof.label}</span>
                    <span className="text-xs font-mono text-white/30 hidden md:inline">{proof.detail}</span>
                  </div>
                  <span className="text-xs font-mono text-white/20 group-hover:text-green-400 transition">
                    {proof.tx.slice(0, 14)}...{proof.tx.slice(-6)} ↗
                  </span>
                </a>
              ))}
            </div>
          </motion.div>

          {/* Contract Status */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-5"
          >
            <div className="text-xs font-mono text-white/40 uppercase tracking-wider mb-3">Verified Contracts — X Layer (196)</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { name: 'AgentEconomy', addr: data.contracts.agentEconomy.address, extra: `Last block: ${data.contracts.agentEconomy.lastActivityBlock}` },
                { name: 'AdversarialBounties', addr: data.contracts.bounties.address, extra: `${data.contracts.bounties.totalPosted} bounties` },
                { name: 'TrackRecord', addr: data.contracts.trackRecord.address, extra: `${data.performance.totalTrades} trades` },
              ].map((contract) => (
                <div key={contract.name} className="border border-white/[0.04] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-green-400 text-xs">&#10003;</span>
                    <span className="text-xs font-mono text-white/60">{contract.name}</span>
                  </div>
                  <a
                    href={`https://www.oklink.com/xlayer/address/${contract.addr}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-green-400/60 hover:text-green-400 transition break-all"
                  >
                    {contract.addr.slice(0, 10)}...{contract.addr.slice(-8)}
                  </a>
                  <div className="text-xs font-mono text-white/20 mt-1">{contract.extra}</div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Protocol Stats Row */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4"
          >
            <MetricCard label="MCP Calls" value={data.revenue.totalMcpCalls} sub="total settled" />
            <MetricCard label="Debates" value={data.revenue.totalDebates} sub="3-agent adversarial" />
            <MetricCard label="Trades" value={data.performance.totalTrades} sub="commit-reveal" />
            <MetricCard label="Bounties" value={data.performance.totalBounties} sub="on-chain challenges" />
          </motion.div>

          {/* Footer */}
          <div className="text-center text-xs font-mono text-white/20 pt-4 border-t border-white/[0.04]">
            Bobby Protocol — Adversarial Trading Intelligence on X Layer
          </div>
        </div>
      ) : null}
    </div>
  );
}
