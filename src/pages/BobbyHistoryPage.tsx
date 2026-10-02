import { t, speechLocale } from '@/lib/companions/i18n';
import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import KineticShell from '@/components/kinetic/KineticShell';
import { useTradingRoom } from '@/hooks/useTradingRoom';
import { useBobbySession } from '@/hooks/useBobbySession';
import { clearSession, sessionHeaders } from '@/lib/bobby-session';
import { bobbySupabase } from '@/lib/bobby-db-client';
import { Link } from 'react-router-dom';

interface ClosedTrade {
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  realizedPnl: number;
  pnlPct: number;
  closeTime: string | null;
  result: 'WIN' | 'LOSS' | 'BREAK_EVEN';
}

interface OpenPosition {
  symbol: string;
  amountUsd: number;
  entryPrice: number;
  markPrice: number | null;
  unrealizedPnl: number;
  openTime: string;
}

interface Summary {
  capitalRequired: number;
  currentEquity: number;
  totalReturn: number;
  realizedPnl: number;
  closedTrades: number;
  openPositions: number;
  wins: number;
  losses: number;
  winRate: number;
  valuationComplete: boolean;
  truncated: boolean;
}

interface RecordResponse {
  ok: boolean;
  scope: 'public-aggregate' | 'identity';
  summary: Summary;
  openPositions: OpenPosition[];
  closedPositions: ClosedTrade[];
}

type View = 'public' | 'mine';
const PER_PAGE = 10;

const fixed = (value: number, digits: number) => value.toLocaleString(speechLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });

export default function BobbyHistoryPage() {
  return <KineticShell activeTab="history" showSidebar nucleo><HistoryContent /></KineticShell>;
}

function HistoryContent() {
  const { wallet, hasAgent, roomMode, setRoomMode } = useTradingRoom();
  const { ready, ensureSession } = useBobbySession({ auto: false });
  const [view, setView] = useState<View>('public');
  const [record, setRecord] = useState<RecordResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [authNeeded, setAuthNeeded] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);

  // The shell owns the workspace switch for deployed personal agents.
  useEffect(() => {
    if (hasAgent) setView(roomMode === 'personal' ? 'mine' : 'public');
  }, [hasAgent, roomMode]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setRecord(null);
    setError('');
    setAuthNeeded(false);
    setPage(0);

    const load = async () => {
      try {
        let headers: Record<string, string> = {};
        if (view === 'mine') {
          // A connected wallet requires its own signed session. A site
          // account is only used when no wallet is connected.
          if (wallet) headers = sessionHeaders(wallet);
          else {
            const { data } = await bobbySupabase().auth.getSession();
            if (data.session?.access_token) headers = { Authorization: `Bearer ${data.session.access_token}` };
          }
          if (Object.keys(headers).length === 0) {
            if (active) setAuthNeeded(true);
            return;
          }
        }

        const response = await fetch(`/api/bobby-pnl?scope=${view === 'mine' ? 'mine' : 'public'}`, {
          headers, signal: controller.signal, cache: 'no-store',
        });
        if (response.status === 401) {
          if (wallet && view === 'mine') clearSession(wallet);
          if (active) setAuthNeeded(true);
          return;
        }
        if (!response.ok) throw new Error(t("The verified record is temporarily unavailable.", "El historial verificado no está disponible por ahora."));
        const data = await response.json() as RecordResponse;
        if (!data.ok || data.scope !== (view === 'mine' ? 'identity' : 'public-aggregate')) {
          throw new Error(t("The verified record is temporarily unavailable.", "El historial verificado no está disponible por ahora."));
        }
        if (active) setRecord(data);
      } catch (cause) {
        if (active && !controller.signal.aborted) setError(t('The verified record is temporarily unavailable.', 'El historial verificado no está disponible por ahora.'));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; controller.abort(); };
  }, [view, wallet, ready]);

  const chooseView = (next: View) => {
    setView(next);
    if (hasAgent) setRoomMode(next === 'mine' ? 'personal' : 'global');
  };

  const summary = record?.summary;
  const closed = record?.closedPositions ?? [];
  const opened = record?.openPositions ?? [];
  const pageCount = Math.ceil(closed.length / PER_PAGE);
  const visibleClosed = closed.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const hasCapital = Boolean(summary && summary.capitalRequired > 0);
  const hasValuation = Boolean(summary?.valuationComplete);
  const returnText = hasCapital && hasValuation ? `${summary!.totalReturn >= 0 ? '+' : ''}${fixed(summary!.totalReturn, 2)}%` : '—';

  return (
    <div className="px-4 pt-10 sm:px-6 md:px-8 md:pt-14 max-w-7xl mx-auto pb-20">
      <Helmet><title>{t('Verified Record', 'Historial verificado')} | Bobby Protocol</title></Helmet>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-4xl md:text-6xl font-black tracking-tight">{t('Verified / Record', 'Historial / Verificado')}</h1>
        <p className="text-[10px] font-mono text-white/40 mt-2">
          {view === 'public'
            ? t("Bobby protocol trades from confirmed, explicitly public cycles on Base.", "Operaciones del protocolo Bobby de ciclos confirmados y explícitamente públicos en Base.")
            : t("Your own confirmed Base swap receipts. Only you can see these details.", "Tus comprobantes de swaps confirmados en Base. Solo tú puedes ver estos detalles.")}
        </p>
        <div className="flex flex-wrap gap-2 mt-5 font-mono text-[10px]">
          <button type="button" onClick={() => chooseView('public')}
            className={`px-4 py-2 rounded-full border ${view === 'public' ? 'border-white bg-white text-black' : 'border-white/15 text-white/40 hover:text-white'}`}>
            {t("PUBLIC BOBBY RECORD", "HISTORIAL PÚBLICO DE BOBBY")}</button>
          <button type="button" onClick={() => chooseView('mine')}
            className={`px-4 py-2 rounded-full border ${view === 'mine' ? 'border-white bg-white text-black' : 'border-white/15 text-white/40 hover:text-white'}`}>
            {t("MY RECEIPTS", "MIS COMPROBANTES")}</button>
        </div>
      </motion.div>

      {loading ? (
        <div className="text-center py-20 text-[10px] font-mono text-white/40 animate-pulse">{t("LOADING VERIFIED RECORD...", "CARGANDO HISTORIAL VERIFICADO…")}</div>
      ) : authNeeded ? (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded p-8 text-center font-mono text-sm text-white/60">
          {wallet ? t("Sign with your connected wallet to see your private receipts.", "Firma con tu wallet conectada para ver tus comprobantes privados.") : t("Connect a wallet or sign in to see your private receipts.", "Conecta una wallet o inicia sesión para ver tus comprobantes privados.")}
          {wallet && <button type="button" onClick={() => void ensureSession()}
            className="block mx-auto mt-5 px-4 py-2 rounded bg-white text-black text-[10px] font-bold">{t("SIGN TO VIEW", "FIRMA PARA VER")}</button>}
          {!wallet && <Link to="/signin" className="block mx-auto mt-5 w-fit px-4 py-2 rounded bg-white text-black text-[10px] font-bold">{t("SIGN IN", "INICIAR SESIÓN")}</Link>}
        </div>
      ) : error ? (
        <div role="alert" className="bg-red-500/5 border border-red-500/20 rounded p-8 text-center font-mono text-sm text-red-300">{error}</div>
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: t("CLOSED TRADES", "OPERACIONES CERRADAS"), value: String(summary.closedTrades) },
              { label: t("OPEN POSITIONS", "POSICIONES ABIERTAS"), value: String(summary.openPositions) },
              { label: t("WIN RATE", "TASA DE ACIERTOS"), value: summary.closedTrades > 0 ? `${fixed(summary.winRate, 1)}%` : '—' },
              { label: t("TOTAL RETURN", "RENDIMIENTO TOTAL"), value: returnText },
            ].map(stat => (
              <div key={stat.label} className="bg-white/[0.02] border border-white/[0.04] p-5 rounded">
                <span className="text-[9px] font-mono text-white/30 tracking-widest">{stat.label}</span>
                <div className="text-xl md:text-2xl font-mono font-bold mt-1 text-white/80">{stat.value}</div>
              </div>
            ))}
          </div>

          {summary.truncated && <div role="alert" className="mb-6 font-mono text-[10px] text-amber-400">{t("The ledger exceeds the current reporting limit. Totals may be incomplete.", "El registro supera el límite actual del informe. Los totales pueden estar incompletos.")}</div>}
          {!hasValuation && summary.openPositions > 0 && <div className="mb-6 font-mono text-[10px] text-amber-400">{t("A current price is unavailable for an open position, so total return is hidden.", "No hay precio actual para una posición abierta; se oculta el rendimiento total.")}</div>}

          {view === 'mine' && opened.length > 0 && (
            <section className="bg-white/[0.02] border border-white/[0.04] rounded mb-8 overflow-hidden">
              <h2 className="px-4 py-3 font-mono text-[10px] text-white/50 border-b border-white/[0.04]">{t("OPEN POSITIONS", "POSICIONES ABIERTAS")}</h2>
              <div className="overflow-x-auto"><table className="w-full text-left font-mono text-[10px]">
                <thead className="bg-[#1c1b1b] text-white/40"><tr><th className="p-3 font-normal">{t("OPENED", "ABIERTA")}</th><th className="p-3 font-normal">{t("ASSET", "ACTIVO")}</th><th className="p-3 font-normal text-right">{t("COST", "COSTO")}</th><th className="p-3 font-normal text-right">{t("ENTRY", "ENTRADA")}</th><th className="p-3 font-normal text-right">{t("MARK", "PRECIO ACTUAL")}</th><th className="p-3 font-normal text-right">{t("UNREALIZED PNL", "P/G NO REALIZADA")}</th></tr></thead>
                <tbody className="divide-y divide-white/[0.03]">{opened.map((position, index) => <tr key={`${position.symbol}-${position.openTime}-${index}`}>
                  <td className="p-3 text-white/40">{new Date(position.openTime).toLocaleString(speechLocale())}</td>
                  <td className="p-3 font-bold text-white/80">{position.symbol}</td>
                  <td className="p-3 text-right">${fixed(position.amountUsd, 2)}</td>
                  <td className="p-3 text-right">${fixed(position.entryPrice, 4)}</td>
                  <td className="p-3 text-right">{position.markPrice == null ? '—' : `$${fixed(position.markPrice, 4)}`}</td>
                  <td className="p-3 text-right">{position.markPrice == null ? '—' : `${position.unrealizedPnl >= 0 ? '+' : ''}$${fixed(position.unrealizedPnl, 4)}`}</td>
                </tr>)}</tbody>
              </table></div>
            </section>
          )}

          <section className="bg-white/[0.02] border border-white/[0.04] rounded overflow-hidden">
            <h2 className="px-4 py-3 font-mono text-[10px] text-white/50 border-b border-white/[0.04]">{t("CLOSED TRADES", "OPERACIONES CERRADAS")}</h2>
            {view === 'public' ? (
              <p className="p-6 font-mono text-[11px] text-white/40">
                {summary.closedTrades === 0 && summary.openPositions === 0
                  ? t("No confirmed public protocol trades yet. Agent theses and simulated signals are separate from this record.", "Aún no hay operaciones públicas confirmadas del protocolo. Las tesis de agentes y señales simuladas están separadas de este historial.")
                  : t("Only aggregate performance is public. Individual receipts stay private.", "Solo el rendimiento agregado es público. Los comprobantes individuales siguen privados.")}
              </p>
            ) : closed.length === 0 ? (
              <p className="p-6 font-mono text-[11px] text-white/40">
                {summary.openPositions > 0 ? t("No closed trades yet. Your open position appears above.", "Aún no hay operaciones cerradas. Tu posición abierta aparece arriba.") : t("You have no confirmed trades yet.", "Aún no tienes operaciones confirmadas.")}
              </p>
            ) : (
              <>
                <div className="overflow-x-auto"><table className="w-full text-left font-mono text-[10px]">
                  <thead className="bg-[#1c1b1b] text-white/40"><tr><th className="p-3 font-normal">{t("CLOSED", "CERRADA")}</th><th className="p-3 font-normal">{t("ASSET", "ACTIVO")}</th><th className="p-3 font-normal text-right">{t("ENTRY", "ENTRADA")}</th><th className="p-3 font-normal text-right">{t("EXIT", "SALIDA")}</th><th className="p-3 font-normal text-right">PNL</th><th className="p-3 font-normal">{t("RESULT", "RESULTADO")}</th></tr></thead>
                  <tbody className="divide-y divide-white/[0.03]">{visibleClosed.map((trade, index) => <tr key={`${trade.symbol}-${trade.closeTime}-${index}`}>
                    <td className="p-3 text-white/40">{trade.closeTime ? new Date(trade.closeTime).toLocaleString() : '—'}</td>
                    <td className="p-3 font-bold text-white/80">{trade.symbol}</td>
                    <td className="p-3 text-right">${fixed(trade.entryPrice, 4)}</td>
                    <td className="p-3 text-right">${fixed(trade.exitPrice, 4)}</td>
                    <td className={`p-3 text-right ${trade.realizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{trade.realizedPnl >= 0 ? '+' : ''}${fixed(trade.realizedPnl, 4)} ({fixed(trade.pnlPct, 1)}%)</td>
                    <td className="p-3">{trade.result === 'BREAK_EVEN' ? t('BREAK EVEN', 'SIN GANANCIA NI PÉRDIDA') : trade.result === 'WIN' ? t('WIN', 'GANANCIA') : t('LOSS', 'PÉRDIDA')}</td>
                  </tr>)}</tbody>
                </table></div>
                {pageCount > 1 && <div className="flex justify-between items-center p-3 border-t border-white/[0.04] font-mono text-[9px] text-white/40">
                  <span>{t(`SHOWING ${page * PER_PAGE + 1}–${Math.min((page + 1) * PER_PAGE, closed.length)} OF ${closed.length}`, `MOSTRANDO ${page * PER_PAGE + 1}–${Math.min((page + 1) * PER_PAGE, closed.length)} DE ${closed.length}`)}</span>
                  <div className="flex gap-2"><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="disabled:opacity-30">{t("PREV", "ANTERIOR")}</button><button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)} className="disabled:opacity-30">{t("NEXT", "SIGUIENTE")}</button></div>
                </div>}
                {summary.closedTrades > closed.length && <p className="p-3 border-t border-white/[0.04] font-mono text-[10px] text-white/40">{t(`Showing the latest ${closed.length} of ${summary.closedTrades} closed trades.`, `Mostrando las últimas ${closed.length} de ${summary.closedTrades} operaciones cerradas.`)}</p>}
              </>
            )}
          </section>
          <p className="mt-5 font-mono text-[10px] text-white/30">
            {view === 'public'
              ? t("Public figures exclude personal wallet receipts and private agent cycles.", "Las cifras públicas excluyen comprobantes de wallets personales y ciclos privados de agentes.")
              : t("Your receipts are private. Open positions are not counted as wins or losses.", "Tus comprobantes son privados. Las posiciones abiertas no cuentan como ganancias ni pérdidas.")}
          </p>
        </>
      ) : (
        <div className="text-center py-20 text-white/40 text-sm font-mono">{t("The verified record is unavailable.", "El historial verificado no está disponible.")}</div>
      )}
    </div>
  );
}
