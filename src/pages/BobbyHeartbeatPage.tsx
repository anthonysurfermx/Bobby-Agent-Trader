import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { useProtocolTxHistory, type OnChainTx } from '@/hooks/useProtocolTxHistory';

interface HeartbeatData {
  ok: boolean;
  timestamp: string;
  cached?: boolean;
  stale?: boolean;
  error?: string;
  chain: { id: number; blockNumber: number; status: string };
  treasury: { address: string; balanceOkb: string };
  revenue: {
    totalVolumeOkb: string;
    totalPayments: number;
    totalMcpCalls: number;
    totalDebates: number;
  };
  protocolTotals: {
    bountyEscrowOkb: string;
    totalBounties: number;
    protocolNotionalOkb: string;
    totalInteractions: number;
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
    source?: string;
    tool: string;
    status: string;
    agent: string | null;
    payer: string | null;
    amountOkb: string | null;
    txHash: string | null;
    age: number;
  }>;
  recentTxs: OnChainTx[];
  health: {
    chain: string;
    cycle: string;
    contracts: string;
    overall: string;
  };
  contracts: {
    agentEconomy: { address: string };
    bounties: { address: string; totalPosted: number };
    trackRecord: { address: string };
    hardnessRegistry: { address: string };
    convictionOracle: { address: string };
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

function commerceBadge(status: string) {
  if (status === 'verified') return 'text-green-400';
  if (status === 'challenge_issued') return 'text-amber-400';
  if (status === 'free_call') return 'text-cyan-400';
  return 'text-white/50';
}

function commerceLabel(status: string) {
  if (status === 'verified') return 'PAID';
  if (status === 'challenge_issued') return '402';
  if (status === 'free_call') return 'FREE';
  return status.toUpperCase();
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

const CONTRACT_COLORS: Record<string, string> = {
  HardnessRegistry: 'text-green-400',
  AdversarialBounties: 'text-amber-400',
  TrackRecord: 'text-cyan-400',
  AgentEconomy: 'text-purple-400',
  ConvictionOracle: 'text-blue-400',
  AgentRegistry: 'text-pink-400',
};

function formatTimestamp(ts: number | null): string {
  if (!ts) return '';
  const age = Math.floor(Date.now() / 1000 - ts);
  if (age < 60) return `${age}s ago`;
  if (age < 3600) return `${Math.floor(age / 60)}m ago`;
  if (age < 86400) return `${Math.floor(age / 3600)}h ago`;
  return `${Math.floor(age / 86400)}d ago`;
}

export default function BobbyHeartbeatPage() {
  const [data, setData] = useState<HeartbeatData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [txExpanded, setTxExpanded] = useState(false);
  const {
    historyExpanded,
    setHistoryExpanded,
    historicalTxs,
    historyLoading,
    historyError,
    historyDone,
    fetchHistoricalTxs,
  } = useProtocolTxHistory();

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
              label="Settlement"
              value={`${parseFloat(data.revenue.totalVolumeOkb).toFixed(4)} OKB`}
              sub={`${data.revenue.totalPayments} MCP payments settled`}
            />
            <MetricCard
              label="Bounty Escrow"
              value={`${parseFloat(data.protocolTotals.bountyEscrowOkb).toFixed(4)} OKB`}
              sub={`${data.protocolTotals.totalBounties} bounties posted`}
            />
            <MetricCard
              label="Protocol Total"
              value={`${parseFloat(data.protocolTotals.protocolNotionalOkb).toFixed(4)} OKB`}
              sub={`${data.performance.totalTrades} trades · ${data.revenue.totalMcpCalls} MCP calls`}
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
              <div className="text-xs font-mono text-white/40 uppercase tracking-wider mb-3">Recent Agent-to-Agent Activity</div>
              {data.recentCommerce.length > 0 ? (
                <div className="space-y-2">
                  {data.recentCommerce.map((event, i) => (
                    <div key={i} className="flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-2">
                        <span className={commerceBadge(event.status)}>
                          [{commerceLabel(event.status)}]
                        </span>
                        {event.source && (
                          <span className="text-white/20 uppercase">{event.source}</span>
                        )}
                        <span className="text-white/60">{event.tool}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {event.agent && <span className="text-white/20">{event.agent}</span>}
                        {event.amountOkb && <span className="text-amber-400/70">{parseFloat(event.amountOkb).toFixed(4)} OKB</span>}
                        {event.payer && <span className="text-white/20">{event.payer}</span>}
                        {event.txHash && (
                          <a
                            href={`https://www.oklink.com/xlayer/tx/${event.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-green-400/50 hover:text-green-400"
                          >
                            ↗
                          </a>
                        )}
                        <span className="text-white/30">{formatAge(event.age)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm font-mono text-white/30">No recent free calls, x402 challenges, or paid MCP settlements yet</div>
              )}
            </motion.div>
          </div>

          {/* Live On-Chain Transaction Feed */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-xs font-mono text-white/40 uppercase tracking-wider">Live On-Chain Activity</span>
              </div>
              <span className="text-xs font-mono text-white/20">{data.recentTxs?.length || 0} txs</span>
            </div>
            {data.recentTxs && data.recentTxs.length > 0 ? (
              <>
                <div className="space-y-1.5">
                  {(txExpanded ? data.recentTxs : data.recentTxs.slice(0, 6)).map((tx, i) => (
                    <motion.a
                      key={tx.hash}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      href={`https://www.oklink.com/xlayer/tx/${tx.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between px-3 py-2 bg-white/[0.01] border border-white/[0.03] rounded-lg hover:border-green-400/30 transition group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-1.5 h-1.5 bg-green-400 rounded-full flex-shrink-0" />
                        <span className={`text-xs font-mono flex-shrink-0 ${CONTRACT_COLORS[tx.contractName] || 'text-white/60'}`}>
                          {tx.contractName}
                        </span>
                        <span className="text-xs font-mono text-white/50 flex-shrink-0">{tx.method}</span>
                        {parseFloat(tx.valueOkb) > 0 && (
                          <span className="text-xs font-mono text-amber-400/60 flex-shrink-0 hidden sm:inline">
                            {parseFloat(tx.valueOkb).toFixed(4)} OKB
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-xs font-mono text-white/20">
                          {formatTimestamp(tx.timestamp)}
                        </span>
                        <span className="text-xs font-mono text-white/15 group-hover:text-green-400 transition hidden md:inline">
                          {tx.hash.slice(0, 10)}...{tx.hash.slice(-4)} ↗
                        </span>
                      </div>
                    </motion.a>
                  ))}
                </div>
                {data.recentTxs.length > 6 && (
                  <button
                    onClick={() => setTxExpanded(!txExpanded)}
                    className="mt-3 w-full py-2 border border-white/[0.06] hover:border-green-400/30 rounded-lg bg-white/[0.01] hover:bg-white/[0.03] transition-all text-xs font-mono uppercase tracking-wider text-white/30 hover:text-green-400"
                  >
                    {txExpanded ? `Collapse` : `See all ${data.recentTxs.length} transactions`}
                  </button>
                )}
              </>
            ) : (
              <div className="text-sm font-mono text-white/30 py-4 text-center">
                Scanning recent blocks for activity...
              </div>
            )}
          </motion.div>

          {/* Historical Transaction Archive */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.37 }}
            className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-5"
          >
            <button
              onClick={() => setHistoryExpanded((current) => !current)}
              className="w-full flex items-center justify-between gap-4 text-left"
            >
              <div>
                <div className="text-xs font-mono text-white/40 uppercase tracking-wider">Historical On-Chain Archive</div>
                <div className="text-xs font-mono text-white/20 mt-1">
                  Expand to inspect the full Bobby treasury transaction history across protocol contracts.
                </div>
              </div>
              <span className="text-xs font-mono text-green-400 uppercase">
                {historyExpanded ? 'Collapse' : 'Expand'}
              </span>
            </button>

            {historyExpanded && (
              <div className="mt-4 pt-4 border-t border-white/[0.04]">
                {historyError && (
                  <div className="mb-3 text-xs font-mono text-red-400">
                    Error loading historical archive: {historyError}
                  </div>
                )}

                {historicalTxs.length > 0 ? (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-mono text-white/30 uppercase tracking-wider">
                        {historicalTxs.length} historical txs loaded
                      </span>
                      <span className="text-xs font-mono text-white/20">
                        {historyDone ? 'Archive complete' : 'Loading archive...'}
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-[32rem] overflow-y-auto pr-1">
                      {historicalTxs.map((tx, i) => (
                        <motion.a
                          key={`${tx.hash}-${tx.blockNumber}`}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: Math.min(i * 0.01, 0.2) }}
                          href={`https://www.oklink.com/xlayer/tx/${tx.hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between px-3 py-2 bg-white/[0.01] border border-white/[0.03] rounded-lg hover:border-green-400/30 transition group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full flex-shrink-0" />
                            <span className={`text-xs font-mono flex-shrink-0 ${CONTRACT_COLORS[tx.contractName] || 'text-white/60'}`}>
                              {tx.contractName}
                            </span>
                            <span className="text-xs font-mono text-white/50 flex-shrink-0">{tx.method}</span>
                            <span className="text-xs font-mono text-white/20 hidden md:inline">
                              block #{tx.blockNumber.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {parseFloat(tx.valueOkb) > 0 && (
                              <span className="text-xs font-mono text-amber-400/70 hidden sm:inline">
                                {parseFloat(tx.valueOkb).toFixed(4)} OKB
                              </span>
                            )}
                            <span className="text-xs font-mono text-white/20">
                              {formatTimestamp(tx.timestamp)}
                            </span>
                            <span className="text-xs font-mono text-white/15 group-hover:text-green-400 transition hidden md:inline">
                              {tx.hash.slice(0, 10)}...{tx.hash.slice(-4)} ↗
                            </span>
                          </div>
                        </motion.a>
                      ))}
                    </div>
                  </>
                ) : historyLoading ? (
                  <div className="text-sm font-mono text-white/30 py-4 text-center">
                    Loading historical transaction archive...
                  </div>
                ) : (
                  <div className="text-sm font-mono text-white/30 py-4 text-center">
                    No historical transactions found yet.
                  </div>
                )}

                {!historyDone && !historyLoading && (
                  <button
                    onClick={fetchHistoricalTxs}
                    className="mt-3 w-full py-2 border border-white/[0.06] hover:border-green-400/30 rounded-lg bg-white/[0.01] hover:bg-white/[0.03] transition-all text-xs font-mono uppercase tracking-wider text-white/30 hover:text-green-400"
                  >
                    Load More History
                  </button>
                )}
              </div>
            )}
          </motion.div>

          {/* Contract Status */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-5"
          >
            <div className="text-xs font-mono text-white/40 uppercase tracking-wider mb-3">Verified Contracts — X Layer (196)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {[
                { name: 'HardnessRegistry', addr: data.contracts.hardnessRegistry?.address, extra: 'signals + predictions' },
                { name: 'AgentEconomy', addr: data.contracts.agentEconomy.address, extra: `${data.revenue.totalPayments} payments` },
                { name: 'AdversarialBounties', addr: data.contracts.bounties.address, extra: `${data.contracts.bounties.totalPosted} bounties` },
                { name: 'TrackRecord', addr: data.contracts.trackRecord.address, extra: `${data.performance.totalTrades} trades` },
                { name: 'ConvictionOracle', addr: data.contracts.convictionOracle?.address, extra: 'real-time feed' },
                { name: 'AgentRegistry', addr: (data.contracts as any).agentRegistry?.address || '0x823a1670f521a35d4fafe4502bdcb3a8148bba8b', extra: 'ERC-721 identity' },
              ].filter(c => c.addr).map((contract) => (
                <div key={contract.name} className="border border-white/[0.04] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs ${CONTRACT_COLORS[contract.name] || 'text-green-400'}`}>&#10003;</span>
                    <span className={`text-xs font-mono ${CONTRACT_COLORS[contract.name] || 'text-white/60'}`}>{contract.name}</span>
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
