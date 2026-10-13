// ============================================================
// Bobby Trade History — Stitch "AGENT_TERMINAL // TRADE_HISTORY"
// Full table with agent-coded rows, terminal log, agent focus card
// All data REAL from /api/bobby-pnl
// ============================================================

import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import ProtocolLayout from '@/components/protocol/ProtocolLayout';
import { useProtocolLanguage } from '@/components/protocol/useProtocolLanguage';

interface Trade {
  symbol: string; direction: string; entryPrice: number; exitPrice: number;
  realizedPnl: number; pnlPct: number; leverage: string; closeTime: string; result: string;
}

interface Summary {
  startingCapital: number; currentEquity: number; totalReturn: number;
  totalTrades: number; wins: number; losses: number; winRate: number;
}

export default function BobbyHistoryPage() {
  const { t, locale } = useProtocolLanguage();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const perPage = 10;

  useEffect(() => {
    fetch('/api/bobby-pnl')
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setSummary(d.summary);
          setTrades(d.closedPositions || []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const paged = trades.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(trades.length / perPage);

  // Terminal log entries from real trades
  const logEntries = trades.slice(0, 6).map(t => {
    const time = new Date(t.closeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const type = t.result === 'WIN' ? 'EXEC' : 'WARN';
    const msg = t.result === 'WIN'
      ? `TAKE_PROFIT ${t.symbol} ${t.direction.toUpperCase()} +$${t.realizedPnl.toFixed(4)}`
      : `STOP_LOSS ${t.symbol} ${t.direction.toUpperCase()} ${t.realizedPnl.toFixed(4)}`;
    return { time, type, msg };
  });

  return (
    <ProtocolLayout active="record" wide>
      <Helmet><title>{t("Trade History | Bobby Agent Trader", "Historial de operaciones | Bobby Agent Trader", "Histórico de operações | Bobby Agent Trader")}</title></Helmet>

      <div className="protocol-content">
        <motion.header initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="protocol-hero">
          <p className="protocol-eyebrow">{t("Evidence / Track record", "Evidencia / Historial", "Evidência / Histórico")}</p>
          <h1 className="protocol-title">{t("The record.", "El historial.", "O histórico.")}<br /><span className="text-[#A39C91]">{t("In full view.", "A la vista de todos.", "À vista de todos.")}</span></h1>
          <p className="protocol-lead">{t(" Bobby's confirmed Base receipt ledger. Every closed position, entry, exit and result in one place. Agent theses and simulated signals appear in ", " El registro de recibos confirmados de Bobby en Base. Cada posición cerrada, entrada, salida y resultado en un lugar. Las tesis de agentes y señales simuladas aparecen en ", " O registro de recibos confirmados do Bobby na Base. Cada posição fechada, entrada, saída e resultado em um só lugar. As teses dos agentes e os sinais simulados aparecem em ")}<a href="/agentic-world/forum" className="text-[#F2EDE4] underline decoration-[#F2EDE4]/30 underline-offset-4 hover:decoration-[#F2EDE4]">{t("Debates", "Debates", "Debates")}</a>.
          </p>
          <div className="mt-6 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8A8378]">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-300" />{t(" Confirmed receipts / Base ", " Recibos confirmados / Base ", " Recibos confirmados / Base ")}</div>
        </motion.header>

        {loading ? (
          <div className="text-center py-20"><span className="text-[10px] font-mono text-[#A39C91] animate-pulse">{t("LOADING HISTORY...", "CARGANDO HISTORIAL...", "CARREGANDO HISTÓRICO...")}</span></div>
        ) : summary ? (
          <>
            {/* Stats Overview */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { label: 'Total return', value: `${summary.totalReturn >= 0 ? '+' : ''}${summary.totalReturn}%`, color: summary.totalReturn >= 0 ? 'text-green-400' : 'text-red-400' },
                { label: 'Win rate', value: `${summary.winRate.toFixed(1)}%`, color: 'text-white' },
                { label: 'Equity', value: `$${summary.currentEquity.toFixed(2)}`, color: 'text-green-400' },
                { label: 'Total trades', value: String(summary.totalTrades), color: 'text-white' },
              ].map(stat => (
                <div key={stat.label} className="protocol-panel p-5 md:p-7">
                  <span className="text-[10px] font-mono uppercase text-[#8A8378] tracking-[0.14em]">{stat.label}</span>
                  <div className={`text-2xl md:text-3xl font-light tracking-[-0.04em] mt-5 ${stat.color}`}>{stat.value}</div>
                </div>
              ))}
            </motion.div>

            {/* Trades Table */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
              className="protocol-panel overflow-hidden mb-8">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#F2EDE4]/[0.08] p-6 md:p-8">
                <h2 className="protocol-section-title">{t("Closed positions", "Posiciones cerradas", "Posições fechadas")}</h2>
                <span className="protocol-eyebrow">{trades.length}{t(" recorded", " registradas", " registradas")}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left font-mono text-xs">
                  <thead className="bg-[#F2EDE4]/[0.025] text-[#8A8378] text-[10px] tracking-[0.1em]">
                    <tr>
                      <th className="px-5 py-4 font-normal">{t("TIMESTAMP", "FECHA", "DATA")}</th>
                      <th className="px-5 py-4 font-normal">{t("ASSET", "ACTIVO", "ATIVO")}</th>
                      <th className="px-5 py-4 font-normal">{t("DIRECTION", "DIRECCIÓN", "DIREÇÃO")}</th>
                      <th className="px-5 py-4 font-normal">{t("LEVERAGE", "APALANCAMIENTO", "ALAVANCAGEM")}</th>
                      <th className="px-5 py-4 font-normal text-right">{t("ENTRY", "ENTRADA", "ENTRADA")}</th>
                      <th className="px-5 py-4 font-normal text-right">{t("EXIT", "SALIDA", "SAÍDA")}</th>
                      <th className="px-5 py-4 font-normal text-right">PNL%</th>
                      <th className="px-5 py-4 font-normal text-right">PNL $</th>
                      <th className="px-5 py-4 font-normal">{t("STATUS", "ESTADO", "ESTADO")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F2EDE4]/[0.06]">
                    {paged.map((t, i) => (
                      <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-4 text-[#A39C91]">
                          {new Date(t.closeTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
                          {new Date(t.closeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-5 py-4 font-bold text-[#F2EDE4]">{t.symbol}/USDT</td>
                        <td className={`px-5 py-4 font-bold ${t.direction === 'long' ? 'text-green-400' : 'text-red-400'}`}>
                          {t.direction.toUpperCase()}
                        </td>
                        <td className="px-5 py-4 text-[#A39C91]">{t.leverage}</td>
                        <td className="px-5 py-4 text-right text-[#A39C91] tabular-nums">{t.entryPrice.toFixed(2)}</td>
                        <td className="px-5 py-4 text-right text-[#A39C91] tabular-nums">{t.exitPrice.toFixed(2)}</td>
                        <td className={`px-5 py-4 text-right tabular-nums ${t.pnlPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {t.pnlPct >= 0 ? '+' : ''}{t.pnlPct.toFixed(1)}%
                        </td>
                        <td className={`px-5 py-4 text-right tabular-nums ${t.realizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {t.realizedPnl >= 0 ? '+' : ''}${t.realizedPnl.toFixed(4)}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold ${
                            t.result === 'WIN' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                          }`}>{t.result}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              <div className="p-5 border-t border-[#F2EDE4]/[0.08] flex flex-wrap items-center justify-between gap-4">
                <span className="text-[9px] font-mono text-[#A39C91]">
                  {trades.length > 0
                    ? `SHOWING ${page * perPage + 1}-${Math.min((page + 1) * perPage, trades.length)} OF ${trades.length} TRADES`
                    : 'NO TRADES RECORDED'}
                </span>
                <div className="flex gap-2">
                  <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                    className="protocol-button-secondary disabled:opacity-30">{t(" PREV ", " ANTERIOR ", " ANTERIOR ")}</button>
                  <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
                    className="protocol-button-secondary disabled:opacity-30">{t(" NEXT ", " SIGUIENTE ", " PRÓXIMA ")}</button>
                </div>
              </div>
            </motion.div>

            {/* Bottom: Terminal Log + Agent Focus */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Terminal Output Log */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                className="lg:col-span-2 protocol-panel p-6 md:p-8 overflow-hidden">
                <h2 className="protocol-section-title mb-6">{t("Recent activity", "Actividad reciente", "Atividade recente")}</h2>
                <div className="font-mono text-[11px] space-y-4 overflow-x-auto">
                  {logEntries.map((entry, i) => (
                    <div key={i} className="flex gap-3 min-w-max">
                      <span className="text-[#A39C91] w-16 flex-shrink-0">{entry.time}</span>
                      <span className={`w-10 flex-shrink-0 ${entry.type === 'EXEC' ? 'text-green-400' : 'text-amber-400'}`}>[{entry.type}]</span>
                      <span className="text-[#A39C91]">{entry.msg}</span>
                    </div>
                  ))}
                  <div className="flex gap-3 min-w-max border-t border-[#F2EDE4]/[0.08] pt-4">
                    <span className="text-[#A39C91] w-16">--:--:--</span>
                    <span className="text-green-400 w-10">[INFO]</span>
                    <span className="text-green-400/40">{t("Awaiting the next cycle", "Esperando el siguiente ciclo", "Aguardando o próximo ciclo")}</span>
                  </div>
                </div>
              </motion.div>

              {/* Agent Focus Card */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
                className="protocol-panel p-6 md:p-8">
                <p className="protocol-eyebrow mb-3">{t("Agent focus / Bobby CIO", "Agente destacado / Bobby CIO", "Agente em foco / Bobby CIO")}</p>
                <h2 className="protocol-section-title mb-6">{t("Performance", "Rendimiento", "Desempenho")}</h2>
                <div className="space-y-4 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-[#A39C91]">{t("WIN RATE", "TASA DE ACIERTO", "TAXA DE ACERTO")}</span>
                    <span className="text-green-400 font-bold">{summary.winRate.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#A39C91]">{t("TOTAL RETURN", "RETORNO TOTAL", "RETORNO TOTAL")}</span>
                    <span className={summary.totalReturn >= 0 ? 'text-green-400' : 'text-red-400'}>{summary.totalReturn}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#A39C91]">{t("TRADES", "OPERACIONES", "OPERAÇÕES")}</span>
                    <span className="text-[#A39C91]">{summary.totalTrades}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#A39C91]">{t("BIAS", "SESGO", "VIÉS")}</span>
                    <span className={summary.winRate >= 60 ? 'text-green-400' : summary.winRate >= 40 ? 'text-amber-400' : 'text-red-400'}>
                      {summary.winRate >= 60 ? 'AGGRESSIVE' : summary.winRate >= 40 ? 'ADAPTIVE' : 'DEFENSIVE'}
                    </span>
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        ) : (
          <div className="protocol-panel px-6 py-20 text-center"><p className="protocol-section-title">{t("No history available", "No hay historial disponible", "Nenhum histórico disponível")}</p><p className="mt-3 text-sm text-[#A39C91]">{t("Confirmed receipts will appear here once they are recorded.", "Los recibos confirmados aparecerán aquí cuando se registren.", "Os recibos confirmados aparecerão aqui quando forem registrados.")}</p></div>
        )}
      </div>
    </ProtocolLayout>
  );
}
