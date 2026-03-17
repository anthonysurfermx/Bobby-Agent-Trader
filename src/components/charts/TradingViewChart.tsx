// ============================================================
// TradingViewChart — Lightweight Charts (TradingView open source)
// Professional candlestick chart with SMA, S/R, entry/stop/target
// Interactive: zoom, pan, crosshair
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, LineStyle, CandlestickSeries, LineSeries, HistogramSeries, type IChartApi } from 'lightweight-charts';

interface ChartCandle {
  ts: number;
  o: number;
  h: number;
  l: number;
  c: number;
  vol: number;
}

interface ChartProps {
  symbol: string;
  candles?: ChartCandle[];
  sma20?: (number | null)[];
  sma50?: (number | null)[];
  support?: number[];
  resistance?: number[];
  entryPrice?: number;
  stopPrice?: number;
  targetPrice?: number;
  direction?: string;
  height?: number;
}

export function TradingViewChart({
  symbol, candles, sma20, sma50, support, resistance,
  entryPrice, stopPrice, targetPrice, direction = 'long', height = 300,
}: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [loading, setLoading] = useState(!candles);
  const [error, setError] = useState(false);
  const [data, setData] = useState<{
    candles: ChartCandle[];
    sma20: (number | null)[];
    sma50: (number | null)[];
    support: number[];
    resistance: number[];
  } | null>(candles ? { candles, sma20: sma20 || [], sma50: sma50 || [], support: support || [], resistance: resistance || [] } : null);

  // Fetch data if not provided
  useEffect(() => {
    if (candles) return;
    fetch(`/api/technical-analysis?symbol=${symbol}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && d.candles?.length > 0) {
          setData({
            candles: d.candles,
            sma20: d.indicators.sma20,
            sma50: d.indicators.sma50,
            support: d.support,
            resistance: d.resistance,
          });
        } else {
          setError(true);
        }
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, [symbol, candles]);

  // Create chart
  useEffect(() => {
    if (!containerRef.current || !data) return;

    // Clean up previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(255,255,255,0.3)',
        fontSize: 10,
        fontFamily: 'monospace',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.03)' },
      },
      crosshair: {
        mode: 0, // Normal crosshair
        vertLine: { color: 'rgba(255,255,255,0.1)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#1a1a1a' },
        horzLine: { color: 'rgba(255,255,255,0.1)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#1a1a1a' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.05)',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.05)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
      width: containerRef.current.clientWidth,
      height,
    });

    chartRef.current = chart;

    // Candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e80',
      wickDownColor: '#ef444480',
    });

    const candleData = data.candles.map(c => ({
      time: Math.floor(c.ts / 1000) as any,
      open: c.o,
      high: c.h,
      low: c.l,
      close: c.c,
    }));
    candleSeries.setData(candleData);

    // Volume (overlay with low opacity)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: 'rgba(255,255,255,0.06)',
      lastValueVisible: false,
      priceLineVisible: false,
    } as any);
    volumeSeries.setData(data.candles.map(c => ({
      time: Math.floor(c.ts / 1000) as any,
      value: c.vol,
      color: c.c >= c.o ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
    })));

    // SMA 20 (yellow)
    if (data.sma20.length > 0) {
      const sma20Series = chart.addSeries(LineSeries, {
        color: '#eab308',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      const sma20Data = data.candles.map((c, i) => ({
        time: Math.floor(c.ts / 1000) as any,
        value: data.sma20[i] || undefined,
      })).filter(d => d.value !== undefined && d.value !== null);
      sma20Series.setData(sma20Data as any);
    }

    // SMA 50 (blue)
    if (data.sma50.length > 0) {
      const sma50Series = chart.addSeries(LineSeries, {
        color: '#3b82f6',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      const sma50Data = data.candles.map((c, i) => ({
        time: Math.floor(c.ts / 1000) as any,
        value: data.sma50[i] || undefined,
      })).filter(d => d.value !== undefined && d.value !== null);
      sma50Series.setData(sma50Data as any);
    }

    // Support lines (green)
    for (const level of data.support || []) {
      candleSeries.createPriceLine({
        price: level,
        color: '#22c55e60',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `S $${level.toLocaleString()}`,
      });
    }

    // Resistance lines (red)
    for (const level of data.resistance || []) {
      candleSeries.createPriceLine({
        price: level,
        color: '#ef444460',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `R $${level.toLocaleString()}`,
      });
    }

    // Bobby's trade levels
    if (entryPrice) {
      candleSeries.createPriceLine({
        price: entryPrice,
        color: '#eab308',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: `ENTRY $${entryPrice.toLocaleString()}`,
      });
    }
    if (stopPrice) {
      candleSeries.createPriceLine({
        price: stopPrice,
        color: '#ef4444',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: `STOP $${stopPrice.toLocaleString()}`,
      });
    }
    if (targetPrice) {
      candleSeries.createPriceLine({
        price: targetPrice,
        color: '#22c55e',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: `TARGET $${targetPrice.toLocaleString()}`,
      });
    }

    chart.timeScale().fitContent();

    // Resize handler
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [data, height, entryPrice, stopPrice, targetPrice]);

  if (loading) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-[9px] font-mono text-white/15 animate-pulse">
        Loading {symbol} chart...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ height: Math.min(height, 80) }} className="flex items-center justify-center text-[9px] font-mono text-white/20 border border-white/[0.04] bg-white/[0.01] rounded">
        Chart unavailable for {symbol}
      </div>
    );
  }

  return (
    <div className="border border-white/[0.04] bg-white/[0.01] rounded overflow-hidden">
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-white/[0.04]">
        <span className="text-[11px] font-mono font-bold text-white/60">{symbol}</span>
        <span className="text-[8px] font-mono text-white/20">7D · 1H candles</span>
        <div className="flex items-center gap-2 ml-auto text-[7px] font-mono text-white/15">
          <span className="flex items-center gap-0.5"><span className="w-2 h-0.5 bg-yellow-400 inline-block" />SMA20</span>
          <span className="flex items-center gap-0.5"><span className="w-2 h-0.5 bg-blue-400 inline-block" />SMA50</span>
          {entryPrice && <span className="flex items-center gap-0.5"><span className="w-2 h-0.5 bg-yellow-500 inline-block" />Entry</span>}
        </div>
      </div>
      <div ref={containerRef} />
    </div>
  );
}
