import React, { useState, useEffect, useCallback } from 'react';

interface TickerPrice {
  symbol: string;
  price: number;
  change24h?: number;
  loading: boolean;
  error?: string;
}

const TRACKED_SYMBOLS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'];
const POLL_INTERVAL = 10_000;

function formatPrice(price: number, symbol: string): string {
  if (symbol.startsWith('SOL') || symbol.startsWith('ETH')) {
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function getLabel(symbol: string): string {
  return symbol.split('-')[0];
}

interface PriceTickerProps {
  onPricesUpdate?: (prices: Record<string, number>) => void;
}

export const PriceTicker: React.FC<PriceTickerProps> = ({ onPricesUpdate }) => {
  const [tickers, setTickers] = useState<TickerPrice[]>(
    TRACKED_SYMBOLS.map(s => ({ symbol: s, price: 0, loading: true }))
  );

  const fetchPrices = useCallback(async () => {
    const updated: TickerPrice[] = await Promise.all(
      TRACKED_SYMBOLS.map(async (symbol) => {
        try {
          const res = await fetch(`/api/onchainos-price?symbol=${symbol}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          return {
            symbol,
            price: data.price,
            change24h: data.high24h && data.low24h
              ? ((data.price - data.low24h) / data.low24h * 100)
              : undefined,
            loading: false,
          };
        } catch {
          return { symbol, price: 0, loading: false, error: 'Failed' };
        }
      })
    );
    setTickers(updated);

    // Notificar al parent de los precios actualizados
    if (onPricesUpdate) {
      const priceMap: Record<string, number> = {};
      updated.forEach(t => { if (t.price > 0) priceMap[t.symbol] = t.price; });
      onPricesUpdate(priceMap);
    }
  }, [onPricesUpdate]);

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchPrices]);

  return (
    <div className="flex items-center gap-4 flex-wrap">
      {tickers.map((t) => (
        <div key={t.symbol} className="flex items-center gap-1.5">
          <span className="text-cyan-400/60 text-[10px]">{getLabel(t.symbol)}</span>
          {t.loading ? (
            <span className="text-cyan-400/30 text-xs animate-pulse">---</span>
          ) : t.error ? (
            <span className="text-red-400/60 text-[10px]">ERR</span>
          ) : (
            <>
              <span className="text-foreground text-xs font-bold">
                ${formatPrice(t.price, t.symbol)}
              </span>
              {t.change24h !== undefined && (
                <span className={`text-[9px] ${t.change24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {t.change24h >= 0 ? '+' : ''}{t.change24h.toFixed(1)}%
                </span>
              )}
            </>
          )}
        </div>
      ))}
      <span className="text-cyan-400/20 text-[8px] ml-auto">live · 10s</span>
    </div>
  );
};
