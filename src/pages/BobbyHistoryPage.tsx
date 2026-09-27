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
        if (!response.ok) throw new Error('The verified record is temporarily unavailable.');
        const data = await response.json() as RecordResponse;
        if (!data.ok || data.scope !== (view === 'mine' ? 'identity' : 'public-aggregate')) {
          throw new Error('The verified record is temporarily unavailable.');
        }
        if (active) setRecord(data);
      } catch (cause) {
        if (active && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'The verified record is temporarily unavailable.');
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
  const returnText = hasCapital && hasValuation ? `${summary!.totalReturn >= 0 ? '+' : ''}${summary!.totalReturn.toFixed(2)}%` : '—';

  return (
    <div className="px-4 pt-10 sm:px-6 md:px-8 md:pt-14 max-w-7xl mx-auto pb-20">
      <Helmet><title>Verified Record | Bobby Protocol</title></Helmet>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-4xl md:text-6xl font-black tracking-tight">Verified <span className="text-white/20">/</span> Record</h1>
        <p className="text-[10px] font-mono text-white/40 mt-2">
          {view === 'public'
            ? 'Bobby protocol trades from confirmed, explicitly public cycles on Base.'
            : 'Your own confirmed Base swap receipts. Only you can see these details.'}
        </p>
        <div className="flex flex-wrap gap-2 mt-5 font-mono text-[10px]">
          <button type="button" onClick={() => chooseView('public')}
            className={`px-4 py-2 rounded-full border ${view === 'public' ? 'border-white bg-white text-black' : 'border-white/15 text-white/40 hover:text-white'}`}>
            PUBLIC BOBBY RECORD
          </button>
          <button type="button" onClick={() => chooseView('mine')}
            className={`px-4 py-2 rounded-full border ${view === 'mine' ? 'border-white bg-white text-black' : 'border-white/15 text-white/40 hover:text-white'}`}>
            MY RECEIPTS
          </button>
        </div>
      </motion.div>

      {loading ? (
        <div className="text-center py-20 text-[10px] font-mono text-white/40 animate-pulse">LOADING VERIFIED RECORD...</div>
      ) : authNeeded ? (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded p-8 text-center font-mono text-sm text-white/60">
          {wallet ? 'Sign with your connected wallet to see your private receipts.' : 'Connect a wallet or sign in to see your private receipts.'}
          {wallet && <button type="button" onClick={() => void ensureSession()}
            className="block mx-auto mt-5 px-4 py-2 rounded bg-white text-black text-[10px] font-bold">SIGN TO VIEW</button>}
          {!wallet && <Link to="/signin" className="block mx-auto mt-5 w-fit px-4 py-2 rounded bg-white text-black text-[10px] font-bold">SIGN IN</Link>}
        </div>
      ) : error ? (
        <div role="alert" className="bg-red-500/5 border border-red-500/20 rounded p-8 text-center font-mono text-sm text-red-300">{error}</div>
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'CLOSED_TRADES', value: String(summary.closedTrades) },
              { label: 'OPEN_POSITIONS', value: String(summary.openPositions) },
              { label: 'WIN_RATE', value: summary.closedTrades > 0 ? `${summary.winRate.toFixed(1)}%` : '—' },
              { label: 'TOTAL_RETURN', value: returnText },
            ].map(stat => (
              <div key={stat.label} className="bg-white/[0.02] border border-white/[0.04] p-5 rounded">
                <span className="text-[9px] font-mono text-white/30 tracking-widest">{stat.label}</span>
                <div className="text-xl md:text-2xl font-mono font-bold mt-1 text-white/80">{stat.value}</div>
              </div>
            ))}
          </div>

          {summary.truncated && <div role="alert" className="mb-6 font-mono text-[10px] text-amber-400">The ledger exceeds the current reporting limit. Totals may be incomplete.</div>}
          {!hasValuation && summary.openPositions > 0 && <div className="mb-6 font-mono text-[10px] text-amber-400">A current price is unavailable for an open position, so total return is hidden.</div>}

          {view === 'mine' && opened.length > 0 && (
            <section className="bg-white/[0.02] border border-white/[0.04] rounded mb-8 overflow-hidden">
              <h2 className="px-4 py-3 font-mono text-[10px] text-white/50 border-b border-white/[0.04]">OPEN POSITIONS</h2>
              <div className="overflow-x-auto"><table className="w-full text-left font-mono text-[10px]">
                <thead className="bg-[#1c1b1b] text-white/40"><tr><th className="p-3 font-normal">OPENED</th><th className="p-3 font-normal">ASSET</th><th className="p-3 font-normal text-right">COST</th><th className="p-3 font-normal text-right">ENTRY</th><th className="p-3 font-normal text-right">MARK</th><th className="p-3 font-normal text-right">UNREALIZED PNL</th></tr></thead>
                <tbody className="divide-y divide-white/[0.03]">{opened.map((position, index) => <tr key={`${position.symbol}-${position.openTime}-${index}`}>
                  <td className="p-3 text-white/40">{new Date(position.openTime).toLocaleString()}</td>
                  <td className="p-3 font-bold text-white/80">{position.symbol}</td>
                  <td className="p-3 text-right">${position.amountUsd.toFixed(2)}</td>
                  <td className="p-3 text-right">${position.entryPrice.toFixed(4)}</td>
                  <td className="p-3 text-right">{position.markPrice == null ? '—' : `$${position.markPrice.toFixed(4)}`}</td>
                  <td className="p-3 text-right">{position.markPrice == null ? '—' : `${position.unrealizedPnl >= 0 ? '+' : ''}$${position.unrealizedPnl.toFixed(4)}`}</td>
                </tr>)}</tbody>
              </table></div>
            </section>
          )}

          <section className="bg-white/[0.02] border border-white/[0.04] rounded overflow-hidden">
            <h2 className="px-4 py-3 font-mono text-[10px] text-white/50 border-b border-white/[0.04]">CLOSED TRADES</h2>
            {view === 'public' ? (
              <p className="p-6 font-mono text-[11px] text-white/40">
                {summary.closedTrades === 0 && summary.openPositions === 0
                  ? 'No confirmed public protocol trades yet. Agent theses and simulated signals are separate from this record.'
                  : 'Only aggregate performance is public. Individual receipts stay private.'}
              </p>
            ) : closed.length === 0 ? (
              <p className="p-6 font-mono text-[11px] text-white/40">
                {summary.openPositions > 0 ? 'No closed trades yet. Your open position appears above.' : 'You have no confirmed trades yet.'}
              </p>
            ) : (
              <>
                <div className="overflow-x-auto"><table className="w-full text-left font-mono text-[10px]">
                  <thead className="bg-[#1c1b1b] text-white/40"><tr><th className="p-3 font-normal">CLOSED</th><th className="p-3 font-normal">ASSET</th><th className="p-3 font-normal text-right">ENTRY</th><th className="p-3 font-normal text-right">EXIT</th><th className="p-3 font-normal text-right">PNL</th><th className="p-3 font-normal">RESULT</th></tr></thead>
                  <tbody className="divide-y divide-white/[0.03]">{visibleClosed.map((trade, index) => <tr key={`${trade.symbol}-${trade.closeTime}-${index}`}>
                    <td className="p-3 text-white/40">{trade.closeTime ? new Date(trade.closeTime).toLocaleString() : '—'}</td>
                    <td className="p-3 font-bold text-white/80">{trade.symbol}</td>
                    <td className="p-3 text-right">${trade.entryPrice.toFixed(4)}</td>
                    <td className="p-3 text-right">${trade.exitPrice.toFixed(4)}</td>
                    <td className={`p-3 text-right ${trade.realizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{trade.realizedPnl >= 0 ? '+' : ''}${trade.realizedPnl.toFixed(4)} ({trade.pnlPct.toFixed(1)}%)</td>
                    <td className="p-3">{trade.result}</td>
                  </tr>)}</tbody>
                </table></div>
                {pageCount > 1 && <div className="flex justify-between items-center p-3 border-t border-white/[0.04] font-mono text-[9px] text-white/40">
                  <span>SHOWING {page * PER_PAGE + 1}–{Math.min((page + 1) * PER_PAGE, closed.length)} OF {closed.length}</span>
                  <div className="flex gap-2"><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="disabled:opacity-30">PREV</button><button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)} className="disabled:opacity-30">NEXT</button></div>
                </div>}
                {summary.closedTrades > closed.length && <p className="p-3 border-t border-white/[0.04] font-mono text-[10px] text-white/40">Showing the latest {closed.length} of {summary.closedTrades} closed trades.</p>}
              </>
            )}
          </section>
          <p className="mt-5 font-mono text-[10px] text-white/30">
            {view === 'public'
              ? 'Public figures exclude personal wallet receipts and private agent cycles.'
              : 'Your receipts are private. Open positions are not counted as wins or losses.'}
          </p>
        </>
      ) : (
        <div className="text-center py-20 text-white/40 text-sm font-mono">The verified record is unavailable.</div>
      )}
    </div>
  );
}
