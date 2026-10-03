import { appLocale, type AppLanguage } from './app-language';
import type { MarketAnalysis } from './market-indicators';

export type DeskBriefLanguage = AppLanguage;
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
  locale?: string;
  latencyMs?: number;
  generatedAt?: string;
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function priceText(value: number | null, lang: DeskBriefLanguage, locale?: string): string {
  if (value === null) return ({ en: 'price unavailable', es: 'sin precio disponible', fr: 'prix indisponible', pt: 'preço indisponível', it: 'prezzo non disponibile', de: 'Kurs nicht verfügbar' })[lang];
  return new Intl.NumberFormat(appLocale(lang, locale), {
    maximumFractionDigits: value < 10 ? 4 : 2,
  }).format(value);
}

export function buildDeskBrief({
  symbol,
  market,
  technicals,
  lang = 'es',
  locale,
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
  const formattedPrice = priceText(price, lang, locale);
  const formattedSupport = priceText(support, lang, locale);
  const formattedResistance = priceText(resistance, lang, locale);

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

  if (lang !== 'en' && lang !== 'es') {
    const values = { fr: {
      absent: `${ticker} : prix disponible ${formattedPrice}. Les données ne suffisent pas pour une lecture technique fiable.`,
      bullish: `${ticker} : ${formattedPrice}, structure haussière en 1H. Support visible : ${formattedSupport}. RSI : ${rsi14 ?? '—'}.`,
      bearish: `${ticker} : ${formattedPrice}, structure baissière en 1H. Résistance visible : ${formattedResistance}. RSI : ${rsi14 ?? '—'}.`,
      neutral: `${ticker} : ${formattedPrice}, structure latérale en 1H entre ${formattedSupport} et ${formattedResistance}. RSI : ${rsi14 ?? '—'}.`,
      absentRisk: 'Structure non confirmée : une lecture incomplète ne constitue pas un signal.',
      bullishRisk: `La thèse s’affaiblit sous ${formattedSupport} ; résistance immédiate : ${formattedResistance}.`,
      bearishRisk: `La pression baissière s’affaiblit au-dessus de ${formattedResistance} ; support immédiat : ${formattedSupport}.`,
      neutralRisk: 'Le mouvement dans l’intervalle reste incertain ; aucune confirmation hors des limites.',
    }, pt: {
      absent: `${ticker}: preço disponível ${formattedPrice}. Não há dados suficientes para uma leitura técnica responsável.`,
      bullish: `${ticker}: ${formattedPrice}, estrutura ascendente em 1H. Suporte visível: ${formattedSupport}. RSI: ${rsi14 ?? '—'}.`,
      bearish: `${ticker}: ${formattedPrice}, estrutura descendente em 1H. Resistência visível: ${formattedResistance}. RSI: ${rsi14 ?? '—'}.`,
      neutral: `${ticker}: ${formattedPrice}, estrutura lateral em 1H entre ${formattedSupport} e ${formattedResistance}. RSI: ${rsi14 ?? '—'}.`,
      absentRisk: 'Estrutura não confirmada: uma leitura incompleta não constitui um sinal.',
      bullishRisk: `A tese perde força abaixo de ${formattedSupport}; resistência imediata: ${formattedResistance}.`,
      bearishRisk: `A pressão descendente perde força acima de ${formattedResistance}; suporte imediato: ${formattedSupport}.`,
      neutralRisk: 'O movimento dentro do intervalo permanece incerto; sem confirmação fora dos limites.',
    }, it: {
      absent: `${ticker}: prezzo disponibile ${formattedPrice}. I dati non bastano per una lettura tecnica responsabile.`,
      bullish: `${ticker}: ${formattedPrice}, struttura rialzista a 1H. Supporto visibile: ${formattedSupport}. RSI: ${rsi14 ?? '—'}.`,
      bearish: `${ticker}: ${formattedPrice}, struttura ribassista a 1H. Resistenza visibile: ${formattedResistance}. RSI: ${rsi14 ?? '—'}.`,
      neutral: `${ticker}: ${formattedPrice}, struttura laterale a 1H tra ${formattedSupport} e ${formattedResistance}. RSI: ${rsi14 ?? '—'}.`,
      absentRisk: 'Struttura non confermata: una lettura incompleta non costituisce un segnale.',
      bullishRisk: `La tesi si indebolisce sotto ${formattedSupport}; resistenza immediata: ${formattedResistance}.`,
      bearishRisk: `La pressione ribassista si indebolisce sopra ${formattedResistance}; supporto immediato: ${formattedSupport}.`,
      neutralRisk: 'Il movimento nell’intervallo resta incerto; nessuna conferma oltre i limiti.',
    }, de: {
      absent: `${ticker}: verfügbarer Preis ${formattedPrice}. Die Daten reichen nicht für eine verantwortungsvolle technische Analyse.`,
      bullish: `${ticker}: ${formattedPrice}, bullische Struktur im 1H-Zeitrahmen. Sichtbare Unterstützung: ${formattedSupport}. RSI: ${rsi14 ?? '—'}.`,
      bearish: `${ticker}: ${formattedPrice}, bärische Struktur im 1H-Zeitrahmen. Sichtbarer Widerstand: ${formattedResistance}. RSI: ${rsi14 ?? '—'}.`,
      neutral: `${ticker}: ${formattedPrice}, Seitwärtsstruktur im 1H-Zeitrahmen zwischen ${formattedSupport} und ${formattedResistance}. RSI: ${rsi14 ?? '—'}.`,
      absentRisk: 'Keine bestätigte Struktur: eine unvollständige Analyse ist kein Signal.',
      bullishRisk: `Die These wird unter ${formattedSupport} schwächer; unmittelbarer Widerstand: ${formattedResistance}.`,
      bearishRisk: `Der bärische Druck wird über ${formattedResistance} schwächer; unmittelbare Unterstützung: ${formattedSupport}.`,
      neutralRisk: 'Die Bewegung innerhalb der Spanne bleibt unsicher; keine Bestätigung außerhalb der Grenzen.',
    } }[lang];
    const state = !technicals || technicalPrice === null ? 'absent' : bias;
    summary = values[state]; risk = values[`${state}Risk` as 'absentRisk' | 'bullishRisk' | 'bearishRisk' | 'neutralRisk'];
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
