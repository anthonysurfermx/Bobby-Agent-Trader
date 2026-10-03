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
// A short name that is an everyday word at home ("intesa" = agreement, "c'è intesa", "d'intesa"). Typed alone it is
// offered for confirmation; inside a sentence only the full name or the ticker names the company.
const HOMONYM_ALIASES = new Set(['INTESA']);
export const isRegionalHomonym = (text: string) => HOMONYM_ALIASES.has(normalize(text));
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
/**
 * Whole provider ids/name phrases win; homonyms never resolve from incidental words. A short local name
 * (SAP) resolves to the home listing only when the interface region is that market: elsewhere it stays the
 * US listing's business.
 */
export function resolveRegionalStock(text: string, language?: unknown, locale?: unknown, country?: unknown): RegionalStock | null {
  const phrase = normalize(text);
  const region = marketRegion(language, locale, country);
  // These bare words also name US ADRs or ordinary Portuguese vocabulary.
  if (phrase === 'VALE' || (phrase === 'SAP' && region !== 'DE')) return null;
  const exact = REGIONAL_STOCKS.filter(s => [s.symbol, s.name, ...s.aliases].some(v => normalize(v) === phrase));
  if (exact.length === 1) return exact[0];
  const hits = namedInSentence(phrase, region);
  return hits.length === 1 ? hits[0] : null;
}
/** Every listing a sentence names by ticker or by name. */
function namedInSentence(phrase: string, region: RegionalStock['region'] | null): RegionalStock[] {
  const tokens = new Set(phrase.split(/[^A-Z0-9.]+/).filter(Boolean));
  return REGIONAL_STOCKS.filter(s => tokens.has(s.symbol) || [s.name, ...s.aliases].some(v => {
    const term = normalize(v);
    // OR, MC, SAP and VALE are ordinary words or ambiguous tickers in sentences; a short name counts at home.
    if (term === 'VALE' || HOMONYM_ALIASES.has(term) || (term.length < 4 && term !== 'EDP' && s.region !== region)) return false;
    return tokens.has(term) || (` ${phrase} `).includes(` ${term} `);
  }));
}
/**
 * The listings a sentence names, each with where its name starts, and the sentence with those names blanked out
 * (same length, decomposed accents). The caller reads `rest` for a second asset ("Bitcoin et LVMH") instead of
 * answering for one of the two.
 */
export function regionalMentions(text: string, language?: unknown, locale?: unknown, country?: unknown): { stocks: Array<{ stock: RegionalStock; at: number }>; rest: string } {
  let rest = text.normalize('NFD');
  const stocks = namedInSentence(normalize(text), marketRegion(language, locale, country)).map(stock => {
    let at = -1;
    // Longest name first, so "Intesa Sanpaolo" goes as one name before its parts.
    for (const term of [stock.symbol, stock.name, ...stock.aliases].map(normalize).sort((a, b) => b.length - a.length)) {
      const letters = [...term].map(c => c === ' ' ? '\\s+' : c.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&') + '\\p{M}*').join('');
      rest = rest.replace(new RegExp(`(?<![\\p{L}\\p{N}])${letters}(?![\\p{L}\\p{N}])`, 'giu'), (found: string, index: number) => {
        if (at < 0 || index < at) at = index;
        return ' '.repeat(found.length);
      });
    }
    return { stock, at };
  });
  return { stocks: stocks.sort((a, b) => a.at - b.at), rest };
}
export function searchRegionalStocks(text: string, language?: unknown, locale?: unknown, country?: unknown): RegionalStock[] {
  const q = normalize(text);
  if (!q) return [...regionalDefaults(language, locale, country)];
  const exact = resolveRegionalStock(text, language, locale, country);
  const region = marketRegion(language, locale, country);
  // Search-as-you-type matches a whole id or name, or the start of one of its words from three letters on:
  // never the middle of a company name ("TON" in Vuitton, "ENS" in Siemens), which hid crypto tickers.
  const starts = (value: string) => value === q || (q.length >= 3 && (` ${value}`).includes(` ${q}`));
  return REGIONAL_STOCKS.filter(s => s === exact || [s.symbol, s.name, ...s.aliases].some(v => starts(normalize(v)) || (normalize(v).length >= 4 && normalize(v) !== 'VALE' && !HOMONYM_ALIASES.has(normalize(v)) && (` ${q} `).includes(` ${normalize(v)} `))))
    .sort((a,b) => Number(b === exact) - Number(a === exact) || Number(b.region === region) - Number(a.region === region));
}
