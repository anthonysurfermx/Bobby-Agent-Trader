import type { MarketAnalysis } from './market-indicators';

export type DeskBriefLanguage = 'es' | 'en';
export type DeskBias = 'bullish' | 'bearish' | 'neutral';
export type TechnicalSnapshot = Omit<MarketAnalysis, 'ema20Series' | 'ema50Series'>;

export interface DeskBrief {
  symbol: string;
  assetType: 'crypto' | 'equity';
  timeframe: '1H';
  price: number | null;
  change24hPct: number | null;
  bias: DeskBias;
  trend: MarketAnalysis['trend'];
  momentum: MarketAnalysis['momentum'];
  rsi14: number | null;
  ema20: number | null;
  ema50: number | null;
  support: number | null;
  resistance: number | null;
  atrPct: number | null;
  summary: string;
  risk: string;
  source: 'live-candles';
  generatedAt: string;
  latencyMs: number;
}

interface BriefMarket {
  assetType?: unknown;
  price?: unknown;
  change_24h_pct?: unknown;
}

interface BuildDeskBriefInput {
  symbol: string;
  market?: BriefMarket | null;
  technicals?: TechnicalSnapshot | null;
  lang?: DeskBriefLanguage;
  latencyMs?: number;
  generatedAt?: string;
}

function finite(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function priceText(value: number | null, lang: DeskBriefLanguage): string {
  if (value === null) return lang === 'es' ? 'sin precio disponible' : 'price unavailable';
  return new Intl.NumberFormat(lang === 'es' ? 'es-MX' : 'en-US', {
    maximumFractionDigits: value < 10 ? 4 : 2,
  }).format(value);
}

export function buildDeskBrief({
  symbol,
  market,
  technicals,
  lang = 'es',
  latencyMs = 0,
  generatedAt = new Date().toISOString(),
}: BuildDeskBriefInput): DeskBrief {
  const ticker = symbol.toUpperCase();
  const technicalPrice = finite(technicals?.price);
  const marketPrice = finite(market?.price);
  const price = technicalPrice ?? marketPrice;
  const trend = technicals?.trend ?? 'lateral';
  const momentum = technicals?.momentum ?? 'neutral';
  const bias: DeskBias = trend === 'alcista' ? 'bullish' : trend === 'bajista' ? 'bearish' : 'neutral';
  const support = finite(technicals?.support);
  const resistance = finite(technicals?.resistance);
  const rsi14 = finite(technicals?.rsi14);
  const formattedPrice = priceText(price, lang);
  const formattedSupport = priceText(support, lang);
  const formattedResistance = priceText(resistance, lang);

  let summary: string;
  let risk: string;

  if (!technicals || technicalPrice === null) {
    summary = lang === 'es'
      ? `${ticker} cotiza en ${formattedPrice}. La gráfica ya está actualizada, pero todavía no hay suficientes velas para una lectura técnica responsable.`
      : `${ticker} is trading at ${formattedPrice}. The chart is current, but there are not enough candles yet for a responsible technical read.`;
    risk = lang === 'es'
      ? 'Sin estructura confirmada: evita convertir una lectura incompleta en una señal.'
      : 'No confirmed structure yet: do not turn an incomplete read into a signal.';
  } else if (bias === 'bullish') {
    summary = lang === 'es'
      ? `${ticker} está en ${formattedPrice} con estructura alcista en 1H. El soporte visible está en ${formattedSupport} y el RSI marca ${rsi14 ?? '—'}.`
      : `${ticker} is at ${formattedPrice} with a bullish 1H structure. Visible support is ${formattedSupport} and RSI reads ${rsi14 ?? '—'}.`;
    risk = lang === 'es'
      ? `La tesis pierde fuerza debajo de ${formattedSupport}; la resistencia inmediata está en ${formattedResistance}.`
      : `The thesis weakens below ${formattedSupport}; immediate resistance is ${formattedResistance}.`;
  } else if (bias === 'bearish') {
    summary = lang === 'es'
      ? `${ticker} está en ${formattedPrice} con estructura bajista en 1H. La resistencia visible está en ${formattedResistance} y el RSI marca ${rsi14 ?? '—'}.`
      : `${ticker} is at ${formattedPrice} with a bearish 1H structure. Visible resistance is ${formattedResistance} and RSI reads ${rsi14 ?? '—'}.`;
    risk = lang === 'es'
      ? `La presión bajista pierde validez arriba de ${formattedResistance}; el soporte inmediato está en ${formattedSupport}.`
      : `Bearish pressure loses validity above ${formattedResistance}; immediate support is ${formattedSupport}.`;
  } else {
    summary = lang === 'es'
      ? `${ticker} está en ${formattedPrice} y sigue lateral en 1H, entre soporte ${formattedSupport} y resistencia ${formattedResistance}. RSI: ${rsi14 ?? '—'}.`
      : `${ticker} is at ${formattedPrice} and remains range-bound on 1H, between ${formattedSupport} support and ${formattedResistance} resistance. RSI: ${rsi14 ?? '—'}.`;
    risk = lang === 'es'
      ? 'Dentro del rango hay más ruido que ventaja; espera confirmación fuera de uno de los extremos.'
      : 'Inside the range there is more noise than edge; wait for confirmation beyond either boundary.';
  }

  return {
    symbol: ticker,
    assetType: market?.assetType === 'equity' ? 'equity' : 'crypto',
    timeframe: '1H',
    price,
    change24hPct: finite(market?.change_24h_pct),
    bias,
    trend,
    momentum,
    rsi14,
    ema20: finite(technicals?.ema20),
    ema50: finite(technicals?.ema50),
    support,
    resistance,
    atrPct: finite(technicals?.atrPct),
    summary,
    risk,
    source: 'live-candles',
    generatedAt,
    latencyMs: Math.max(0, Math.round(latencyMs)),
  };
}
