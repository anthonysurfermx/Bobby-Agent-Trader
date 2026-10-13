import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import ProtocolLayout from '@/components/protocol/ProtocolLayout';
import { useProtocolLanguage } from '@/components/protocol/useProtocolLanguage';
import { motion } from 'framer-motion';
import { useProtocolTxHistory, type OnChainTx } from '@/hooks/useProtocolTxHistory';
import { DEFAULT_CHAIN } from '@/config/chains';

interface HeartbeatData {
  ok: boolean;
  timestamp: string;
  cached?: boolean;
  stale?: boolean;
  error?: string;
  chain: { id: number; name?: string; nativeSymbol?: string; explorerUrl?: string; blockNumber: number; status: string };
  treasury: { address: string; balanceNative: string };
  revenue: {
    totalVolumeNative: string;
    nativeSymbol?: string;
    totalPayments: number;
    totalMcpCalls: number;
    totalDebates: number;
  };
  protocolTotals: {
    bountyEscrowNative: string;
    totalBounties: number;
    protocolNotionalNative: string;
    totalInteractions: number;
  };
  performance: { winRate: number | null; totalTrades: number | null; totalBounties: number | null };
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
    amountNative: string | null;
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
    <div className={`border ${colors} rounded-full px-4 py-3 flex items-center justify-between gap-2 bg-[#F2EDE4]/[0.025]`}>
      <StatusDot status={status} />
      <span className="text-[10px] font-mono uppercase tracking-[0.15em]">{label}</span>
      <span className="text-[10px] font-mono uppercase tracking-[0.15em] opacity-60">{status}</span>
    </div>
  );
}

function commerceBadge(status: string) {
  if (status === 'verified') return 'text-green-400';
  if (status === 'challenge_issued') return 'text-amber-400';
  if (status === 'free_call') return 'text-[#c6b9d5]';
  return 'text-[#A39C91]';
}

function commerceLabel(status: string) {
  if (status === 'verified') return 'PAID';
  if (status === 'challenge_issued') return '402';
  if (status === 'free_call') return 'FREE';
  return status.toUpperCase();
}

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="protocol-panel p-5 md:p-7">
      <div className="text-[10px] font-mono text-[#A39C91] uppercase tracking-[0.15em]">{label}</div>
      <div className="text-2xl font-light text-[#F2EDE4] mt-5 tracking-[-0.04em]">{value}</div>
      {sub && <div className="text-xs text-[#8A8378] mt-3 leading-5">{sub}</div>}
    </div>
  );
}

const CONTRACT_COLORS: Record<string, string> = {
  HardnessRegistry: 'text-[#d6c6ed]',
  AdversarialBounties: 'text-amber-400',
  TrackRecord: 'text-[#c6b9d5]',
  AgentEconomy: 'text-[#d0bddf]',
  ConvictionOracle: 'text-[#b4a9c0]',
  AgentRegistry: 'text-[#d9c1ca]',
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
  const { t, locale } = useProtocolLanguage();
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

  // Chain-aware labels — served by the API, fallback to the live chain (Base)
  const chainName = data?.chain?.name || DEFAULT_CHAIN.name;
  const chainId = data?.chain?.id ?? DEFAULT_CHAIN.id;
  const sym = data?.chain?.nativeSymbol || data?.revenue?.nativeSymbol || DEFAULT_CHAIN.tokens.native;
  const explorerUrl = data?.chain?.explorerUrl || DEFAULT_CHAIN.explorerUrl;

  return (
    <ProtocolLayout active="heartbeat" wide>
      <Helmet><title>{t("Protocol Heartbeat | Bobby Agent Trader", "Pulso del protocolo | Bobby Agent Trader", "Pulso do protocolo | Bobby Agent Trader")}</title></Helmet>

      <div className="protocol-content">
        <header className="protocol-hero">
          <p className="protocol-eyebrow">{t("Protocol / Live heartbeat", "Protocolo / Pulso en vivo", "Protocolo / Pulso ao vivo")}</p>
          <h1 className="protocol-title">{t("A protocol", "Un protocolo", "Um protocolo")}<br /><span className="text-[#A39C91]">{t("with a pulse.", "con pulso.", "com pulso.")}</span></h1>
          <p className="protocol-lead">{t("Chain health, agent activity and settlement. A live view of the infrastructure behind every call.", "Estado de la red, actividad de agentes y liquidaciones. Una vista en vivo de la infraestructura detrás de cada señal.", "Estado da rede, atividade dos agentes e liquidações. Uma visão ao vivo da infraestrutura por trás de cada sinal.")}</p>
          <div className="mt-7 flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8A8378]">
            {data?.health && <StatusDot status={data.health.overall} />}
            <span>{chainName}{t(" / Chain ", " / Red ", " / Rede ")}{chainId}</span>
            <span className="text-[#F2EDE4]/15">·</span>
            <span>{t("Last refresh ", "Última actualización ", "Última atualização ")}{lastRefresh.toLocaleTimeString()}</span>
          </div>
        </header>

      {loading && !data ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-[#d6c6ed] font-mono text-xs uppercase tracking-[0.15em] animate-pulse">{t("Connecting on-chain...", "Conectando a la cadena...", "Conectando à rede...")}</div>
        </div>
      ) : error && !data ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-red-400 font-mono">{t("Error: ", "Error: ", "Erro: ")}{error}</div>
        </div>
      ) : data ? (
        <div className="space-y-8">
          {/* Hero blurb — what am I looking at? */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="protocol-panel p-6 md:p-8"
          >
            <div className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#d6c6ed]">{t("Live protocol health", "Estado del protocolo en vivo", "Estado do protocolo ao vivo")}</div>
            <p className="text-sm leading-6 text-[#A39C91]">{t(" Live ", " Estado de ", " Estado da ")}{chainName}{t(" health for Bobby Protocol. Four signals — ", " en vivo para Bobby Protocol. Cuatro señales: ", " ao vivo para Bobby Protocol. Quatro sinais: ")}<span className="text-[#d6c6ed]">{chainName}{t(" chain", " red", " rede")}</span>, <span className="text-[#d6c6ed]">{t("debate cycle", "ciclo de debate", "ciclo de debate")}</span>, <span className="text-[#d6c6ed]">{t("on-chain contracts", "contratos on-chain", "contratos on-chain")}</span>{t(", and ", ", y ", ", e ")}<span className="text-[#d6c6ed]">{t("overall", "general", "geral")}</span>{t(" — roll up below. Green = operational. Amber = degraded (watch). Red = halted (Bobby stops trading until resolved). Treasury balance, MCP settlements, and bounty escrow below update every 60s and back up the numbers you see on the landing page. ", " — se resumen abajo. Verde = operativo. Ámbar = degradado (vigilar). Rojo = detenido (Bobby deja de operar hasta que se resuelva). El saldo de tesorería, las liquidaciones MCP y las garantías de recompensas se actualizan cada 60 s y respaldan las cifras de la portada. ", " — são resumidos abaixo. Verde = operacional. Âmbar = degradado (observar). Vermelho = parado (Bobby interrompe as operações até a resolução). O saldo da tesouraria, as liquidações MCP e as garantias de recompensas são atualizados a cada 60 s e respaldam os números da página inicial. ")}</p>
          </motion.div>

          {/* Health Status Row */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <HealthBadge label={chainName} status={data.health.chain} />
            <HealthBadge label="Cycle" status={data.health.cycle} />
            <HealthBadge label="Contracts" status={data.health.contracts} />
            <HealthBadge label="Overall" status={data.health.overall} />
            <div className="text-[11px] font-mono text-[#8A8378] sm:col-span-2 lg:col-span-4">{t(" Block #", " Bloque #", " Bloco #")}{data.chain.blockNumber.toLocaleString()}
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
              value={`${parseFloat(data.treasury.balanceNative).toFixed(4)} ${sym}`}
              sub={`${data.treasury.address.slice(0, 10)}...`}
            />
            <MetricCard
              label="Settlement"
              value={`${parseFloat(data.revenue.totalVolumeNative).toFixed(4)} ${sym}`}
              sub={`${data.revenue.totalPayments} MCP payments settled`}
            />
            <MetricCard
              label="Bounty Escrow"
              value={`${parseFloat(data.protocolTotals.bountyEscrowNative).toFixed(4)} ${sym}`}
              sub={`${data.protocolTotals.totalBounties} bounties posted`}
            />
            <MetricCard
              label="Protocol Total"
              value={`${parseFloat(data.protocolTotals.protocolNotionalNative).toFixed(4)} ${sym}`}
              sub={`${data.performance.totalTrades ?? 'n/a'} trades · ${data.revenue.totalMcpCalls} MCP calls`}
            />
          </motion.div>

          {/* Activity Row */}
          <div className="grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr] gap-6">
            {/* Last Cycle */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="protocol-panel p-6 md:p-8"
            >
              <div className="protocol-section-title mb-6">{t("Last debate cycle", "Último ciclo de debate", "Último ciclo de debate")}</div>
              {data.lastCycle ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-mono text-green-400">{data.lastCycle.status}</span>
                    <span className="text-xs font-mono text-[#A39C91]">{formatAge(data.lastCycle.ageSeconds)}</span>
                  </div>
                  {data.lastCycle.vibe && (
                    <div className="text-sm font-mono text-[#A39C91] italic">"{data.lastCycle.vibe}"</div>
                  )}
                  <div className="text-xs font-mono text-[#A39C91]">
                    {data.lastCycle.tradesExecuted}{t(" trade", " operación", " operação")}{data.lastCycle.tradesExecuted !== 1 ? 's' : ''}{t(" executed ", " ejecutadas ", " executadas ")}</div>
                </div>
              ) : (
                <div className="text-sm font-mono text-[#A39C91]">{t("No cycles recorded yet", "Aún no hay ciclos registrados", "Ainda não há ciclos registrados")}</div>
              )}
            </motion.div>

            {/* Recent MCP Commerce */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="protocol-panel p-6 md:p-8"
            >
              <div className="protocol-section-title mb-6">{t("Agent-to-agent activity", "Actividad entre agentes", "Atividade entre agentes")}</div>
              {data.recentCommerce.length > 0 ? (
                <div className="space-y-2">
                  {data.recentCommerce.map((event, i) => (
                    <div key={i} className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F2EDE4]/[0.06] py-3 text-xs font-mono last:border-0">
                      <div className="flex items-center gap-2">
                        <span className={commerceBadge(event.status)}>
                          [{commerceLabel(event.status)}]
                        </span>
                        {event.source && (
                          <span className="text-[#A39C91] uppercase">{event.source}</span>
                        )}
                        <span className="text-[#A39C91]">{event.tool}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        {event.agent && <span className="text-[#A39C91]">{event.agent}</span>}
                        {event.amountNative && <span className="text-amber-400/70">{parseFloat(event.amountNative).toFixed(4)} {sym}</span>}
                        {event.payer && <span className="text-[#A39C91]">{event.payer}</span>}
                        {event.txHash && (
                          <a
                            href={`${explorerUrl}/tx/${event.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#d6c6ed]/60 hover:text-[#d6c6ed]"
                          >
                            ↗
                          </a>
                        )}
                        <span className="text-[#A39C91]">{formatAge(event.age)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm font-mono text-[#A39C91]">{t("No recent free calls, x402 challenges, or paid MCP settlements yet", "Aún no hay consultas gratuitas, desafíos x402 ni liquidaciones MCP pagadas recientes", "Ainda não há consultas gratuitas, desafios x402 ou liquidações MCP pagas recentes")}</div>
              )}
            </motion.div>
          </div>

          {/* Live On-Chain Transaction Feed */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="protocol-panel p-6 md:p-8"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-[#bba2d5] rounded-full animate-pulse " />
                <span className="protocol-section-title">{t("On-chain activity", "Actividad on-chain", "Atividade on-chain")}</span>
              </div>
              <span className="text-xs font-mono text-[#A39C91]">{data.recentTxs?.length || 0}{t(" txs", " transacciones", " transações")}</span>
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
                      href={`${explorerUrl}/tx/${tx.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 bg-[#F2EDE4]/[0.02] border border-[#F2EDE4]/[0.06] rounded-2xl hover:border-[#d6c6ed]/30 transition group"
                    >
                      <div className="flex flex-wrap items-center gap-3 min-w-0">
                        <span className="w-1.5 h-1.5 bg-[#bba2d5] rounded-full flex-shrink-0" />
                        <span className={`text-xs font-mono flex-shrink-0 ${CONTRACT_COLORS[tx.contractName] || 'text-[#A39C91]'}`}>
                          {tx.contractName}
                        </span>
                        <span className="text-xs font-mono text-[#A39C91] flex-shrink-0">{tx.method}</span>
                        {parseFloat(tx.valueNative) > 0 && (
                          <span className="text-xs font-mono text-amber-400/60 flex-shrink-0 hidden sm:inline">
                            {parseFloat(tx.valueNative).toFixed(4)} {sym}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-xs font-mono text-[#A39C91]">
                          {formatTimestamp(tx.timestamp)}
                        </span>
                        <span className="text-xs font-mono text-[#A39C91] group-hover:text-[#d6c6ed] transition hidden md:inline">
                          {tx.hash.slice(0, 10)}...{tx.hash.slice(-4)} ↗
                        </span>
                      </div>
                    </motion.a>
                  ))}
                </div>
                {data.recentTxs.length > 6 && (
                  <button
                    onClick={() => setTxExpanded(!txExpanded)}
                    className="protocol-button-secondary mt-5 w-full"
                  >
                    {txExpanded ? `Collapse` : `See all ${data.recentTxs.length} transactions`}
                  </button>
                )}
              </>
            ) : (
              <div className="text-sm font-mono text-[#A39C91] py-4 text-center">{t(" Scanning recent blocks for activity... ", " Buscando actividad en bloques recientes... ", " Buscando atividade em blocos recentes... ")}</div>
            )}
          </motion.div>

          {/* Historical Transaction Archive */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.37 }}
            className="protocol-panel p-6 md:p-8"
          >
            <button
              onClick={() => setHistoryExpanded((current) => !current)}
              className="w-full flex items-center justify-between gap-4 text-left"
            >
              <div>
                <div className="protocol-section-title">{t("The transaction archive", "El archivo de transacciones", "O arquivo de transações")}</div>
                <div className="text-xs font-mono text-[#A39C91] mt-1">{t(" Expand to inspect the full Bobby treasury transaction history across protocol contracts. ", " Expande para examinar el historial completo de transacciones de la tesorería de Bobby en los contratos del protocolo. ", " Expanda para examinar o histórico completo de transações da tesouraria do Bobby nos contratos do protocolo. ")}</div>
              </div>
              <span className="text-[10px] font-mono text-[#d6c6ed] uppercase tracking-[0.15em]">
                {historyExpanded ? 'Collapse' : 'Expand'}
              </span>
            </button>

            {historyExpanded && (
              <div className="mt-4 pt-4 border-t border-white/10">
                {historyError && (
                  <div className="mb-3 text-xs font-mono text-red-400">{t(" Error loading historical archive: ", " Error al cargar el archivo histórico: ", " Erro ao carregar o arquivo histórico: ")}{historyError}
                  </div>
                )}

                {historicalTxs.length > 0 ? (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-mono text-[#A39C91] uppercase tracking-[0.15em]">
                        {historicalTxs.length}{t(" historical txs loaded ", " transacciones históricas cargadas ", " transações históricas carregadas ")}</span>
                      <span className="text-xs font-mono text-[#A39C91]">
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
                          href={`${explorerUrl}/tx/${tx.hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 bg-[#F2EDE4]/[0.02] border border-[#F2EDE4]/[0.06] rounded-2xl hover:border-[#d6c6ed]/30 transition group"
                        >
                          <div className="flex flex-wrap items-center gap-3 min-w-0">
                            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full flex-shrink-0" />
                            <span className={`text-xs font-mono flex-shrink-0 ${CONTRACT_COLORS[tx.contractName] || 'text-[#A39C91]'}`}>
                              {tx.contractName}
                            </span>
                            <span className="text-xs font-mono text-[#A39C91] flex-shrink-0">{tx.method}</span>
                            <span className="text-xs font-mono text-[#A39C91] hidden md:inline">{t(" block #", " bloque #", " bloco #")}{tx.blockNumber.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {parseFloat(tx.valueNative) > 0 && (
                              <span className="text-xs font-mono text-amber-400/70 hidden sm:inline">
                                {parseFloat(tx.valueNative).toFixed(4)} {sym}
                              </span>
                            )}
                            <span className="text-xs font-mono text-[#A39C91]">
                              {formatTimestamp(tx.timestamp)}
                            </span>
                            <span className="text-xs font-mono text-[#A39C91] group-hover:text-[#d6c6ed] transition hidden md:inline">
                              {tx.hash.slice(0, 10)}...{tx.hash.slice(-4)} ↗
                            </span>
                          </div>
                        </motion.a>
                      ))}
                    </div>
                  </>
                ) : historyLoading ? (
                  <div className="text-sm font-mono text-[#A39C91] py-4 text-center">{t(" Loading historical transaction archive... ", " Cargando el archivo histórico de transacciones... ", " Carregando o arquivo histórico de transações... ")}</div>
                ) : (
                  <div className="text-sm font-mono text-[#A39C91] py-4 text-center">{t(" No historical transactions found yet. ", " Aún no se encontraron transacciones históricas. ", " Ainda não foram encontradas transações históricas. ")}</div>
                )}

                {!historyDone && !historyLoading && (
                  <button
                    onClick={fetchHistoricalTxs}
                    className="protocol-button-secondary mt-5 w-full"
                  >{t(" Load More History ", " Cargar más historial ", " Carregar mais histórico ")}</button>
                )}
              </div>
            )}
          </motion.div>

          {/* Contract Status */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="protocol-panel p-6 md:p-8"
          >
            <div className="protocol-section-title mb-6">{t("Verified contracts — ", "Contratos verificados — ", "Contratos verificados — ")}{chainName} ({chainId})</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { name: 'HardnessRegistry', addr: data.contracts.hardnessRegistry?.address, extra: 'signals + predictions' },
                { name: 'AgentEconomy', addr: data.contracts.agentEconomy.address, extra: `${data.revenue.totalPayments} payments` },
                { name: 'AdversarialBounties', addr: data.contracts.bounties.address, extra: `${data.contracts.bounties.totalPosted} bounties` },
                { name: 'TrackRecord', addr: data.contracts.trackRecord.address, extra: `${data.performance.totalTrades ?? 'n/a'} trades` },
                { name: 'ConvictionOracle', addr: data.contracts.convictionOracle?.address, extra: 'real-time feed' },
                { name: 'AgentRegistry', addr: (data.contracts as any).agentRegistry?.address || '0x823a1670f521a35d4fafe4502bdcb3a8148bba8b', extra: 'ERC-721 identity' },
              ].filter(c => c.addr).map((contract) => (
                <div key={contract.name} className="border border-[#F2EDE4]/[0.08] bg-[#F2EDE4]/[0.02] rounded-[20px] p-5 transition hover:border-[#d6c6ed]/30">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs ${CONTRACT_COLORS[contract.name] || 'text-[#d6c6ed]'}`}>&#10003;</span>
                    <span className={`text-xs font-mono ${CONTRACT_COLORS[contract.name] || 'text-[#A39C91]'}`}>{contract.name}</span>
                  </div>
                  <a
                    href={`${explorerUrl}/address/${contract.addr}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-[#d6c6ed]/70 hover:text-[#d6c6ed] transition break-all"
                  >
                    {contract.addr.slice(0, 10)}...{contract.addr.slice(-8)}
                  </a>
                  <div className="text-xs font-mono text-[#A39C91] mt-1">{contract.extra}</div>
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
            <MetricCard label="Trades" value={data.performance.totalTrades ?? 'n/a'} sub="commit-reveal" />
            <MetricCard label="Bounties" value={data.performance.totalBounties ?? 'n/a'} sub="on-chain challenges" />
          </motion.div>

        </div>
      ) : null}
      </div>
    </ProtocolLayout>
  );
}
