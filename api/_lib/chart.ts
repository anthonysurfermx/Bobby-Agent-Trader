// ============================================================
// api/_lib/chart.ts — TradingView-style chart image (chart-img.com)
// ------------------------------------------------------------
// Renders a real TradingView Advanced Chart as a PNG via the
// chart-img.com API. Additive: returns null on any failure
// (missing key, rate limit, bad symbol) so the DM flow still
// delivers the verdict + voice without a chart.
//
// Requires CHARTIMG_API_KEY. Free key: https://chart-img.com
// ============================================================

const ENDPOINT = 'https://api.chart-img.com/v2/tradingview/advanced-chart';

// Most majors live on BINANCE in TradingView; OKB is OKX-native.
function tvSymbol(symbol: string): string {
  const ex = (process.env.CHART_EXCHANGE || (symbol === 'OKB' ? 'OKX' : 'BINANCE')).toUpperCase();
  return `${ex}:${symbol}USDT`;
}

export interface ChartImage {
  image: Buffer;
  mime: string;
}

/** Fetch a TradingView chart PNG for `symbol`, or null if unavailable. */
export async function getChartImage(symbol: string): Promise<ChartImage | null> {
  const key = process.env.CHARTIMG_API_KEY;
  if (!key) return null;

  const interval = process.env.CHART_INTERVAL || '4h';
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: tvSymbol(symbol),
        interval,
        theme: 'dark',
        width: 800,
        height: 500,
        studies: [{ name: 'Volume' }],
      }),
    });
    if (!res.ok) {
      console.error('[chart] chart-img', res.status, (await res.text()).slice(0, 160));
      return null;
    }
    const image = Buffer.from(await res.arrayBuffer());
    if (image.length === 0) return null;
    return { image, mime: 'image/png' };
  } catch (err) {
    console.error('[chart] error', err instanceof Error ? err.message : err);
    return null;
  }
}
