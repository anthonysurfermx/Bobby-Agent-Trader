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

  const saveCredentials = (creds: OKXCredentials) => {
    setCredentials(creds);
    sessionStorage.setItem('okx_creds', JSON.stringify(creds));
    setShowCredentials(false);
  };

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
    if (!credentials) return;
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

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)',
      border: `1px solid ${isLong ? '#00ff8855' : '#ff444455'}`,
      borderRadius: 12,
      padding: 16,
      marginTop: 12,
      fontFamily: 'monospace',
    }}>
      {/* Mode Toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {(['paper', 'live'] as TradingMode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              flex: 1, padding: '4px 0', borderRadius: 4, fontSize: 10, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer',
              background: mode === m ? (m === 'paper' ? '#3388ff22' : '#ff444422') : '#ffffff08',
              border: `1px solid ${mode === m ? (m === 'paper' ? '#3388ff' : '#ff4444') : '#333'}`,
              color: mode === m ? (m === 'paper' ? '#3388ff' : '#ff4444') : '#666',
            }}
          >
            {m === 'paper' ? (isEs ? 'Paper Trading' : 'Paper Trading') : (isEs ? 'Trading Real' : 'Live Trading')}
          </button>
        ))}
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            background: isLong ? '#00ff8822' : '#ff444422',
            color: isLong ? '#00ff88' : '#ff4444',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 700,
          }}>
            {direction.toUpperCase()} {leverage}x
          </span>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>{symbol}</span>
          <span style={{ color: '#888', fontSize: 12 }}>PERP</span>
          {mode === 'paper' && <span style={{ color: '#3388ff', fontSize: 10, border: '1px solid #3388ff44', padding: '1px 6px', borderRadius: 3 }}>DEMO</span>}
          {mode === 'live' && <span style={{ color: '#ff4444', fontSize: 10, border: '1px solid #ff444444', padding: '1px 6px', borderRadius: 3 }}>LIVE</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: convColor,
            boxShadow: `0 0 8px ${convColor}`,
          }} />
          <span style={{ color: convColor, fontSize: 12, fontWeight: 600 }}>
            {isEs ? 'Convicción' : 'Conviction'}: {convPct}%
          </span>
        </div>
      </div>

      {/* Market Info */}
      {market && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 11, color: '#888' }}>
          <span>Mark: <span style={{ color: '#fff' }}>${market.markPrice.toLocaleString()}</span></span>
          <span>24h: <span style={{ color: market.change24h >= 0 ? '#00ff88' : '#ff4444' }}>{market.change24h >= 0 ? '+' : ''}{market.change24h}%</span></span>
          <span>Funding: <span style={{ color: market.fundingRate >= 0 ? '#00ff88' : '#ff4444' }}>{(market.fundingRate * 100).toFixed(4)}%</span></span>
        </div>
      )}

      {/* Bobby's Levels */}
      {(entryPrice || targetPrice || stopPrice) && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, fontSize: 11 }}>
          {entryPrice && <span style={{ color: '#888' }}>Entry: <span style={{ color: '#fff' }}>${entryPrice.toLocaleString()}</span></span>}
          {targetPrice && <span style={{ color: '#888' }}>TP: <span style={{ color: '#00ff88' }}>${targetPrice.toLocaleString()}</span></span>}
          {stopPrice && <span style={{ color: '#888' }}>SL: <span style={{ color: '#ff4444' }}>${stopPrice.toLocaleString()}</span></span>}
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {/* Leverage selector */}
        <div style={{ flex: 1 }}>
          <label style={{ color: '#888', fontSize: 10, display: 'block', marginBottom: 4 }}>
            LEVERAGE
          </label>
          <div style={{ display: 'flex', gap: 4 }}>
            {[3, 5, 10, 20, 50].map(l => (
              <button
                key={l}
                onClick={() => setLeverage(l)}
                style={{
                  flex: 1,
                  padding: '4px 0',
                  background: leverage === l ? (isLong ? '#00ff8833' : '#ff444433') : '#ffffff11',
                  border: `1px solid ${leverage === l ? (isLong ? '#00ff88' : '#ff4444') : '#333'}`,
                  borderRadius: 4,
                  color: leverage === l ? '#fff' : '#888',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {l}x
              </button>
            ))}
          </div>
        </div>

        {/* Amount input */}
        <div style={{ width: 100 }}>
          <label style={{ color: '#888', fontSize: 10, display: 'block', marginBottom: 4 }}>
            MARGIN (USDT)
          </label>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            style={{
              width: '100%',
              padding: '4px 8px',
              background: '#ffffff11',
              border: '1px solid #333',
              borderRadius: 4,
              color: '#fff',
              fontSize: 13,
              fontFamily: 'monospace',
            }}
          />
        </div>
      </div>

      {/* Notional display */}
      <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
        {isEs ? 'Exposición' : 'Notional'}: <span style={{ color: '#fff', fontWeight: 600 }}>${notional.toLocaleString()} USDT</span>
        <span style={{ color: '#666', marginLeft: 8 }}>({leverage}x × ${amount})</span>
      </div>

      {/* Execute button */}
      {!result ? (
        <button
          onClick={executePerp}
          disabled={executing || conviction < 0.3}
          style={{
            width: '100%',
            padding: '10px 0',
            background: conviction < 0.3
              ? '#333'
              : executing
                ? '#ffffff22'
                : isLong
                  ? 'linear-gradient(90deg, #00ff88, #00cc66)'
                  : 'linear-gradient(90deg, #ff4444, #cc3333)',
            border: 'none',
            borderRadius: 6,
            color: conviction < 0.3 ? '#666' : '#000',
            fontSize: 13,
            fontWeight: 700,
            cursor: conviction < 0.3 ? 'not-allowed' : 'pointer',
            fontFamily: 'monospace',
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          {executing
            ? (isEs ? 'Ejecutando...' : 'Executing...')
            : conviction < 0.3
              ? (isEs ? 'Convicción muy baja' : 'Conviction too low')
              : `${isEs ? 'EJECUTAR' : 'EXECUTE'} ${direction.toUpperCase()} ${symbol} ${leverage}x ${mode === 'paper' ? '(DEMO)' : '(LIVE)'}`
          }
        </button>
      ) : (
        <div style={{
          padding: 12,
          background: '#00ff8811',
          border: '1px solid #00ff8844',
          borderRadius: 6,
        }}>
          <div style={{ color: '#00ff88', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
            {isEs ? 'POSICIÓN ABIERTA' : 'POSITION OPENED'}
          </div>
          <div style={{ fontSize: 11, color: '#ccc' }}>
            {result.symbol} {result.direction?.toUpperCase()} {result.leverage} — {result.contracts} {isEs ? 'contratos' : 'contracts'}
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
            Order ID: {result.orderId}
          </div>
          <button
            onClick={fetchPositions}
            style={{
              marginTop: 8,
              padding: '4px 12px',
              background: '#ffffff11',
              border: '1px solid #333',
              borderRadius: 4,
              color: '#888',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            {isEs ? 'Ver posiciones' : 'View positions'}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ marginTop: 8, padding: 8, background: '#ff444411', border: '1px solid #ff444444', borderRadius: 4, color: '#ff4444', fontSize: 11 }}>
          {error}
        </div>
      )}

      {/* Open Positions */}
      {positions.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: '#888', fontSize: 10, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
            {isEs ? 'Posiciones Abiertas' : 'Open Positions'}
          </div>
          {positions.map((p, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '6px 8px', background: '#ffffff08', borderRadius: 4, marginBottom: 4, fontSize: 11,
            }}>
              <span style={{ color: '#fff' }}>{p.symbol} <span style={{ color: p.direction === 'long' ? '#00ff88' : '#ff4444' }}>{p.direction?.toUpperCase()}</span> {p.leverage}</span>
              <span style={{ color: p.unrealizedPnl >= 0 ? '#00ff88' : '#ff4444', fontWeight: 600 }}>
                {p.unrealizedPnl >= 0 ? '+' : ''}{p.unrealizedPnlPct?.toFixed(2)}% (${p.unrealizedPnl?.toFixed(2)})
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Mode info */}
      {mode === 'paper' && (
        <div style={{ marginTop: 8, padding: 6, background: '#3388ff11', borderRadius: 4, fontSize: 10, color: '#3388ff', textAlign: 'center' }}>
          {isEs ? 'Paper Trading — sin dinero real. Perfecto para practicar.' : 'Paper Trading — no real money. Perfect for practice.'}
        </div>
      )}
      {mode === 'live' && (
        <div style={{ marginTop: 8, padding: 6, background: '#ff444411', borderRadius: 4, fontSize: 10, color: '#ff4444', textAlign: 'center' }}>
          {isEs ? '⚠️ Trading Real — usa dinero real de tu cuenta OKX.' : '⚠️ Live Trading — uses real money from your OKX account.'}
        </div>
      )}
    </div>
  );
}
