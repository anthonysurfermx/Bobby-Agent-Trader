import { appLanguage, appLocale } from './app-language.js';

/** Cash-market provider identifiers, not ADRs or tokenized substitutes. No prices are stored here. */
export interface RegionalStock { symbol: string; name: string; aliases: string[]; region: 'FR' | 'PT' | 'BR' | 'IT' | 'DE'; currency: 'EUR' | 'BRL'; exchange: string }
export const REGIONAL_STOCKS: readonly RegionalStock[] = [
  { symbol: 'MC.PA', name: 'LVMH', aliases: ['louis vuitton', 'moet hennessy'], region: 'FR', currency: 'EUR', exchange: 'Euronext Paris' },
  { symbol: 'OR.PA', name: "L’Oréal", aliases: ['loreal', 'l oreal'], region: 'FR', currency: 'EUR', exchange: 'Euronext Paris' },
  { symbol: 'EDP.LS', name: 'EDP', aliases: ['energias de portugal'], region: 'PT', currency: 'EUR', exchange: 'Euronext Lisbon' },
  { symbol: 'GALP.LS', name: 'Galp Energia', aliases: ['galp'], region: 'PT', currency: 'EUR', exchange: 'Euronext Lisbon' },
  { symbol: 'PETR4.SA', name: 'Petrobras (preferred)', aliases: ['petrobras', 'petr4'], region: 'BR', currency: 'BRL', exchange: 'B3 São Paulo' },
  { symbol: 'VALE3.SA', name: 'Vale', aliases: ['vale3'], region: 'BR', currency: 'BRL', exchange: 'B3 São Paulo' },
  { symbol: 'ENEL.MI', name: 'Enel', aliases: ['enel'], region: 'IT', currency: 'EUR', exchange: 'Euronext Milan' },
  { symbol: 'ISP.MI', name: 'Intesa Sanpaolo', aliases: ['intesa', 'sanpaolo'], region: 'IT', currency: 'EUR', exchange: 'Euronext Milan' },
  { symbol: 'SAP.DE', name: 'SAP', aliases: ['sap'], region: 'DE', currency: 'EUR', exchange: 'Xetra' },
  { symbol: 'SIE.DE', name: 'Siemens', aliases: ['siemens'], region: 'DE', currency: 'EUR', exchange: 'Xetra' },
];
const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase()
  .replace(/\b(?:L|D|DELL|ALL|NELL|SULL|DALL)['’](?=[A-Z])/g, '').replace(/[’']/g, '')
  // Preserve exchange-qualified ids (SAP.DE), while sentence punctuation is a boundary.
  .replace(/[?!¿¡,:;()"“”]/g, ' ').replace(/\.(?=\s|$)/g, ' ')
  .replace(/\s+/g, ' ').trim();
export const regionalStock = (symbol: string) => REGIONAL_STOCKS.find(s => s.symbol === symbol.toUpperCase());
export const isListedStockSymbol = (symbol: string) => /^[A-Z0-9][A-Z0-9.-]{0,18}\.(?:PA|LS|SA|MI|DE)$/i.test(symbol);
export function marketRegion(language?: unknown, locale?: unknown, country?: unknown): RegionalStock['region'] | null {
  if (typeof country === 'string' && ['FR','PT','BR','IT','DE'].includes(country.toUpperCase())) return country.toUpperCase() as RegionalStock['region'];
  const lang = appLanguage(language ?? locale);
  return lang === 'fr' ? 'FR' : lang === 'it' ? 'IT' : lang === 'de' ? 'DE' : lang === 'pt' ? (appLocale(lang, locale) === 'pt-BR' ? 'BR' : 'PT') : null;
}
export function regionalDefaults(language?: unknown, locale?: unknown, country?: unknown): readonly RegionalStock[] {
  const region = marketRegion(language, locale, country);
  return region ? REGIONAL_STOCKS.filter(s => s.region === region) : [];
}
/** Whole provider ids/name phrases win; homonyms never resolve from incidental words. */
export function resolveRegionalStock(text: string): RegionalStock | null {
  const phrase = normalize(text);
  // These bare words also name US ADRs or ordinary Portuguese vocabulary.
  if (phrase === 'SAP' || phrase === 'VALE') return null;
  const exact = REGIONAL_STOCKS.filter(s => [s.symbol, s.name, ...s.aliases].some(v => normalize(v) === phrase));
  if (exact.length === 1) return exact[0];
  const tokens = new Set(phrase.split(/[^A-Z0-9.]+/).filter(Boolean));
  const hits = REGIONAL_STOCKS.filter(s => tokens.has(s.symbol) || [s.name, ...s.aliases].some(v => {
    const term = normalize(v);
    // OR, MC, SAP and VALE are ordinary words or ambiguous tickers in sentences.
    if ((term.length < 4 && term !== 'EDP') || term === 'VALE') return false;
    return tokens.has(term) || (` ${phrase} `).includes(` ${term} `);
  }));
  return hits.length === 1 ? hits[0] : null;
}
export function searchRegionalStocks(text: string, language?: unknown, locale?: unknown, country?: unknown): RegionalStock[] {
  const q = normalize(text);
  if (!q) return [...regionalDefaults(language, locale, country)];
  const exact = resolveRegionalStock(text);
  const region = marketRegion(language, locale, country);
  return REGIONAL_STOCKS.filter(s => s === exact || [s.symbol, s.name, ...s.aliases].some(v => normalize(v).includes(q) || (normalize(v).length >= 4 && normalize(v) !== 'VALE' && (` ${q} `).includes(` ${normalize(v)} `))))
    .sort((a,b) => Number(b === exact) - Number(a === exact) || Number(b.region === region) - Number(a.region === region));
}
