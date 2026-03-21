// ============================================================
// PerpsTradeCard — Execute leveraged perpetual trades from Bobby
// Dual mode: Paper Trading (demo) and Live Trading (real money)
// Paper: uses Bobby's server-side demo keys, no user auth needed
// Live: uses Bobby's server-side live keys (user confirms trade)
// ============================================================

import { useState, useEffect } from 'react';

type TradingMode = 'paper' | 'live';

interface PerpsTradeCardProps {
  symbol: string;
  direction: 'long' | 'short';
  conviction: number; // 0-1
  entryPrice?: number;
  targetPrice?: number;
  stopPrice?: number;
  language?: string;
  tradingMode?: TradingMode; // From user onboarding preference
}

interface MarketInfo {
  markPrice: number;
  change24h: number;
  volume24h: number;
  fundingRate: number;
  maxLeverage: number;
}

export default function PerpsTradeCard({
  symbol, direction, conviction, entryPrice, targetPrice, stopPrice, language = 'en',
  tradingMode: initialMode = 'paper',
}: PerpsTradeCardProps) {
  const [leverage, setLeverage] = useState(5);
  // Smart default: ETH/SOL need ~$5, BTC needs ~$15 with 5x
  const getDefaultAmount = (sym: string) => {
    if (sym === 'BTC') return '8';
    return '5';
  };
  const [amount, setAmount] = useState(getDefaultAmount(symbol));
  const [mode, setMode] = useState<TradingMode>(initialMode);
  const [market, setMarket] = useState<MarketInfo | null>(null);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [positions, setPositions] = useState<any[]>([]);

  const isEs = language === 'es';
  const convPct = Math.round(conviction * 100);
  const convColor = conviction >= 0.7 ? '#00ff88' : conviction >= 0.4 ? '#ffaa00' : '#ff4444';

  // Load trading mode preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('bobby_trading_mode');
    if (saved === 'live' || saved === 'paper') setMode(saved);
  }, []);

  // Fetch market info
  useEffect(() => {
    fetch('/api/okx-perps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'market_info', params: { symbol } }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          // Dynamically enforce minimum margin based on 0.01 contract size
          if (data.markPrice > 0) {
            const minEth = 0.01;
            const minMargin = Math.ceil((minEth * data.markPrice) / 5) + 1; // 5x default leverage + $1 buffer
            setAmount(prev => parseFloat(prev) < minMargin ? minMargin.toString() : prev);
          }
          setMarket({
            markPrice: data.markPrice,
            change24h: data.change24h,
            volume24h: data.volume24h,
            fundingRate: data.fundingRate,
            maxLeverage: 125,
          });
        }
      })
      .catch(() => {});
  }, [symbol]);



  const executePerp = async () => {
    // In live mode, confirm with user before executing
    if (mode === 'live') {
      const confirmed = window.confirm(
        isEs
          ? `⚠️ TRADING REAL: ¿Confirmas abrir ${direction.toUpperCase()} ${symbol} ${leverage}x con $${amount} USDT de margen? Esto usa dinero real.`
          : `⚠️ LIVE TRADING: Confirm opening ${direction.toUpperCase()} ${symbol} ${leverage}x with $${amount} USDT margin? This uses real money.`
      );
      if (!confirmed) return;
    }

    setExecuting(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/okx-perps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'open_position',
          params: {
            symbol,
            direction,
            leverage,
            amount: parseFloat(amount),
            mode, // 'paper' or 'live'
          },
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setResult(data);

        // Set TP/SL if Bobby provided them
        if (targetPrice || stopPrice) {
          await fetch('/api/okx-perps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'set_tpsl',
              params: { symbol, direction, takeProfit: targetPrice, stopLoss: stopPrice, mode },
            }),
          });
        }
      } else {
        setError(data.error || 'Order failed');
      }
    } catch (err) {
      setError('Connection failed');
    } finally {
      setExecuting(false);
    }
  };

  const fetchPositions = async () => {
    try {
      const res = await fetch('/api/okx-perps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'positions', params: { mode } }),
      });
      const data = await res.json();
      if (data.ok) setPositions(data.positions || []);
    } catch {}
  };

  const notional = parseFloat(amount) * leverage;
  const isLong = direction === 'long';

  // Risk/Reward calculation
  const rrRatio = (entryPrice && targetPrice && stopPrice)
    ? ((targetPrice - entryPrice) / (entryPrice - stopPrice)).toFixed(1)
    : null;
  const estPnl = market ? (notional * (isLong ? 1 : -1) * ((targetPrice || market.markPrice * 1.05) - market.markPrice) / market.markPrice).toFixed(2) : null;

  return (
    <div className="mt-3 border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm rounded-lg font-mono overflow-hidden">
      {/* Progress bar — conviction as visual fill */}
      <div className="h-1 bg-white/[0.04]">
        <div className={`h-full transition-all ${conviction >= 0.7 ? 'bg-green-500' : conviction >= 0.4 ? 'bg-amber-500' : 'bg-red-500'}`}
          style={{ width: `${convPct}%` }} />
      </div>

      <div className="p-4">
        {/* Mode toggle — minimal */}
        <div className="flex gap-1 mb-3">
          {(['paper', 'live'] as TradingMode[]).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 py-1 text-[9px] font-bold tracking-[1px] rounded transition-all ${
                mode === m
                  ? m === 'paper' ? 'bg-blue-500/15 border border-blue-500/30 text-blue-400' : 'bg-red-500/15 border border-red-500/30 text-red-400'
                  : 'bg-white/[0.03] border border-white/[0.06] text-white/30 hover:text-white/50'
              }`}>
              {m === 'paper' ? 'PAPER TRADING' : 'TRADING REAL'}
            </button>
          ))}
        </div>

        {/* Symbol display — Stitch "big ticker" style */}
        <div className="flex items-baseline gap-3 mb-3">
          <span className="text-white text-2xl font-bold tracking-tight">{symbol}/USDT</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${isLong ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
            {direction.toUpperCase()}
          </span>
          <span className="text-white/60 text-sm font-bold">{leverage}.0x <span className="text-white/30 text-xs">LEVERAGE</span></span>
        </div>

        {/* Entry / Size / Stop / Target — 2x2 grid */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-4">
          {market && (
            <div>
              <span className="text-[8px] text-white/25 tracking-[1px]">ENTRY_PRICE ●</span>
              <p className="text-white text-sm font-bold">{(entryPrice || market.markPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
            </div>
          )}
          <div>
            <span className="text-[8px] text-white/25 tracking-[1px]">POSITION_SIZE</span>
            <p className="text-white text-sm font-bold">{amount} USDT</p>
          </div>
          {stopPrice && (
            <div>
              <span className="text-[8px] text-red-400/50 tracking-[1px]">STOP_LOSS ●</span>
              <p className="text-red-400 text-sm font-bold">{stopPrice.toLocaleString()}</p>
            </div>
          )}
          {targetPrice && (
            <div>
              <span className="text-[8px] text-green-400/50 tracking-[1px]">TAKE_TARGET ●</span>
              <p className="text-green-400 text-sm font-bold">{targetPrice.toLocaleString()}</p>
            </div>
          )}
        </div>

        {/* Risk metrics footer */}
        <div className="flex items-center gap-4 text-[9px] text-white/30 mb-4 font-mono">
          {rrRatio && <span>R:R/REWARD: <span className="text-white/60">{rrRatio}</span></span>}
          {estPnl && <span>EST. PNL: <span className={parseFloat(estPnl) >= 0 ? 'text-green-400' : 'text-red-400'}>+${estPnl}</span></span>}
          {market && <span>FUNDING: <span className={market.fundingRate >= 0 ? 'text-green-400/60' : 'text-red-400/60'}>{(market.fundingRate * 100).toFixed(4)}%</span></span>}
        </div>

        {/* Leverage selector */}
        <div className="flex gap-1 mb-3">
          {[3, 5, 10, 20, 50].map(l => (
            <button key={l} onClick={() => setLeverage(l)}
              className={`flex-1 py-1.5 text-[10px] font-bold rounded transition-all ${
                leverage === l
                  ? isLong ? 'bg-green-500/20 border border-green-500/40 text-green-400' : 'bg-red-500/20 border border-red-500/40 text-red-400'
                  : 'bg-white/[0.03] border border-white/[0.06] text-white/30 hover:text-white/50'
              }`}>
              {l}x
            </button>
          ))}
        </div>

        {/* Execute button — "TRANSMIT_ORDER_SIGNAL" */}
        {!result ? (
          <button onClick={executePerp} disabled={executing || conviction < 0.3}
            className={`w-full py-3 rounded text-sm font-bold tracking-[2px] transition-all active:scale-[0.98] ${
              conviction < 0.3 ? 'bg-white/[0.04] text-white/15 cursor-not-allowed'
                : executing ? 'bg-white/[0.08] text-white/40'
                : 'bg-gradient-to-r from-green-500 to-green-600 text-black hover:brightness-110'
            }`}>
            {executing ? (isEs ? 'TRANSMITIENDO...' : 'TRANSMITTING...')
              : conviction < 0.3 ? (isEs ? 'CONVICCIÓN INSUFICIENTE' : 'INSUFFICIENT CONVICTION')
              : `TRANSMIT_ORDER_SIGNAL ›› ${mode === 'paper' ? 'DEMO' : 'LIVE'}`}
          </button>
        ) : (
          <div className="p-3 bg-green-500/[0.06] border border-green-500/20 rounded">
            <div className="text-green-400 font-bold text-xs mb-1">{isEs ? 'POSICIÓN ABIERTA' : 'POSITION OPENED'}</div>
            <div className="text-[10px] text-white/60">{result.symbol} {result.direction?.toUpperCase()} {result.leverage}</div>
            <div className="text-[9px] text-white/30 mt-1">Order: {result.orderId}</div>
          </div>
        )}

        {/* Error */}
        {error && <div className="mt-2 p-2 bg-red-500/[0.06] border border-red-500/20 rounded text-red-400 text-[10px]">{error}</div>}

        {/* Mode indicator */}
        <div className={`mt-2 py-1 text-center text-[8px] tracking-[1px] rounded ${
          mode === 'live' ? 'bg-red-500/[0.06] text-red-400/60' : 'bg-blue-500/[0.06] text-blue-400/60'
        }`}>
          {mode === 'live' ? (isEs ? '⚠ TRADING REAL — DINERO REAL' : '⚠ LIVE TRADING — REAL MONEY') : (isEs ? 'PAPER TRADING — SIN RIESGO' : 'PAPER TRADING — ZERO RISK')}
        </div>
      </div>
    </div>
  );
}
