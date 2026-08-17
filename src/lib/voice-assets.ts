// ============================================================
// voice-assets — one asset universe for the whole voice desk.
//
// The chart, the voice tool endpoint and the "which ticker did the human just
// say" matcher all read from here. When these lists lived in three places they
// drifted: MarketCanvas charted MU from Yahoo while /api/voice-tool looked for
// a MU-USDT pair on OKX and reported the asset as unavailable.
//
// `venue` decides the data source: OKX for crypto, Yahoo for equities/ETFs.
// ============================================================

export type AssetVenue = 'okx' | 'equity';

export interface VoiceAsset {
  /** Ticker as Bobby and the UI say it. */
  symbol: string;
  /** Human name — also matched when the human says it out loud. */
  name: string;
  venue: AssetVenue;
  group: 'Cripto' | 'Acciones' | 'ETFs';
  /** Extra spoken forms, e.g. Spanish names or company nicknames. */
  aliases?: string[];
}

export const VOICE_ASSETS: VoiceAsset[] = [
  // --- crypto (OKX spot) ---
  { symbol: 'BTC', name: 'Bitcoin', venue: 'okx', group: 'Cripto' },
  { symbol: 'ETH', name: 'Ethereum', venue: 'okx', group: 'Cripto', aliases: ['ether'] },
  { symbol: 'SOL', name: 'Solana', venue: 'okx', group: 'Cripto' },
  { symbol: 'XRP', name: 'Ripple', venue: 'okx', group: 'Cripto' },
  { symbol: 'BNB', name: 'Binance Coin', venue: 'okx', group: 'Cripto', aliases: ['binance'] },
  { symbol: 'OKB', name: 'OKB', venue: 'okx', group: 'Cripto' },
  { symbol: 'DOGE', name: 'Dogecoin', venue: 'okx', group: 'Cripto' },
  { symbol: 'ADA', name: 'Cardano', venue: 'okx', group: 'Cripto' },
  { symbol: 'AVAX', name: 'Avalanche', venue: 'okx', group: 'Cripto' },
  { symbol: 'LINK', name: 'Chainlink', venue: 'okx', group: 'Cripto' },
  { symbol: 'DOT', name: 'Polkadot', venue: 'okx', group: 'Cripto' },
  { symbol: 'TON', name: 'Toncoin', venue: 'okx', group: 'Cripto' },
  { symbol: 'SUI', name: 'Sui', venue: 'okx', group: 'Cripto' },
  { symbol: 'NEAR', name: 'Near', venue: 'okx', group: 'Cripto' },
  { symbol: 'APT', name: 'Aptos', venue: 'okx', group: 'Cripto' },
  { symbol: 'ARB', name: 'Arbitrum', venue: 'okx', group: 'Cripto' },
  { symbol: 'OP', name: 'Optimism', venue: 'okx', group: 'Cripto' },
  { symbol: 'LTC', name: 'Litecoin', venue: 'okx', group: 'Cripto' },
  { symbol: 'ATOM', name: 'Cosmos', venue: 'okx', group: 'Cripto' },
  { symbol: 'UNI', name: 'Uniswap', venue: 'okx', group: 'Cripto' },
  { symbol: 'AAVE', name: 'Aave', venue: 'okx', group: 'Cripto' },
  { symbol: 'INJ', name: 'Injective', venue: 'okx', group: 'Cripto' },
  { symbol: 'TIA', name: 'Celestia', venue: 'okx', group: 'Cripto' },
  { symbol: 'SEI', name: 'Sei', venue: 'okx', group: 'Cripto' },
  { symbol: 'FIL', name: 'Filecoin', venue: 'okx', group: 'Cripto' },
  { symbol: 'TRX', name: 'Tron', venue: 'okx', group: 'Cripto' },
  { symbol: 'PEPE', name: 'Pepe', venue: 'okx', group: 'Cripto' },
  { symbol: 'WIF', name: 'dogwifhat', venue: 'okx', group: 'Cripto' },
  { symbol: 'SHIB', name: 'Shiba Inu', venue: 'okx', group: 'Cripto', aliases: ['shiba'] },

  // --- equities (Yahoo) ---
  { symbol: 'NVDA', name: 'Nvidia', venue: 'equity', group: 'Acciones', aliases: ['nvidia corporation'] },
  { symbol: 'AAPL', name: 'Apple', venue: 'equity', group: 'Acciones' },
  { symbol: 'MSFT', name: 'Microsoft', venue: 'equity', group: 'Acciones' },
  { symbol: 'GOOGL', name: 'Alphabet', venue: 'equity', group: 'Acciones', aliases: ['google', 'goog'] },
  { symbol: 'AMZN', name: 'Amazon', venue: 'equity', group: 'Acciones' },
  { symbol: 'META', name: 'Meta', venue: 'equity', group: 'Acciones', aliases: ['facebook'] },
  { symbol: 'TSLA', name: 'Tesla', venue: 'equity', group: 'Acciones' },
  { symbol: 'AMD', name: 'AMD', venue: 'equity', group: 'Acciones' },
  { symbol: 'AVGO', name: 'Broadcom', venue: 'equity', group: 'Acciones' },
  { symbol: 'MU', name: 'Micron', venue: 'equity', group: 'Acciones' },
  { symbol: 'TSM', name: 'TSMC', venue: 'equity', group: 'Acciones', aliases: ['tscm', 'taiwan semiconductor', 'taiwan semiconductor manufacturing'] },
  { symbol: 'INTC', name: 'Intel', venue: 'equity', group: 'Acciones' },
  { symbol: 'QCOM', name: 'Qualcomm', venue: 'equity', group: 'Acciones' },
  { symbol: 'SMCI', name: 'Supermicro', venue: 'equity', group: 'Acciones' },
  { symbol: 'ARM', name: 'Arm Holdings', venue: 'equity', group: 'Acciones' },
  { symbol: 'ORCL', name: 'Oracle', venue: 'equity', group: 'Acciones' },
  { symbol: 'CRM', name: 'Salesforce', venue: 'equity', group: 'Acciones' },
  { symbol: 'ADBE', name: 'Adobe', venue: 'equity', group: 'Acciones' },
  { symbol: 'NFLX', name: 'Netflix', venue: 'equity', group: 'Acciones' },
  { symbol: 'DIS', name: 'Disney', venue: 'equity', group: 'Acciones' },
  { symbol: 'COIN', name: 'Coinbase', venue: 'equity', group: 'Acciones' },
  { symbol: 'MSTR', name: 'Strategy', venue: 'equity', group: 'Acciones', aliases: ['microstrategy'] },
  { symbol: 'PLTR', name: 'Palantir', venue: 'equity', group: 'Acciones' },
  { symbol: 'HOOD', name: 'Robinhood', venue: 'equity', group: 'Acciones' },
  { symbol: 'LLY', name: 'Eli Lilly', venue: 'equity', group: 'Acciones' },
  { symbol: 'UNH', name: 'UnitedHealth', venue: 'equity', group: 'Acciones' },
  { symbol: 'JPM', name: 'JPMorgan', venue: 'equity', group: 'Acciones' },
  { symbol: 'GS', name: 'Goldman Sachs', venue: 'equity', group: 'Acciones', aliases: ['goldman'] },
  { symbol: 'V', name: 'Visa', venue: 'equity', group: 'Acciones' },
  { symbol: 'MA', name: 'Mastercard', venue: 'equity', group: 'Acciones' },
  { symbol: 'WMT', name: 'Walmart', venue: 'equity', group: 'Acciones' },
  { symbol: 'COST', name: 'Costco', venue: 'equity', group: 'Acciones' },
  { symbol: 'NKE', name: 'Nike', venue: 'equity', group: 'Acciones' },
  { symbol: 'XOM', name: 'Exxon', venue: 'equity', group: 'Acciones' },
  { symbol: 'CVX', name: 'Chevron', venue: 'equity', group: 'Acciones' },
  { symbol: 'BA', name: 'Boeing', venue: 'equity', group: 'Acciones' },
  { symbol: 'CAT', name: 'Caterpillar', venue: 'equity', group: 'Acciones' },
  { symbol: 'UBER', name: 'Uber', venue: 'equity', group: 'Acciones' },
  { symbol: 'ABNB', name: 'Airbnb', venue: 'equity', group: 'Acciones' },

  // --- ETFs (Yahoo) — index, sector and commodity exposure ---
  { symbol: 'SPY', name: 'S&P 500', venue: 'equity', group: 'ETFs' },
  { symbol: 'QQQ', name: 'Nasdaq 100', venue: 'equity', group: 'ETFs', aliases: ['nasdaq'] },
  { symbol: 'DIA', name: 'Dow Jones', venue: 'equity', group: 'ETFs', aliases: ['dow'] },
  { symbol: 'IWM', name: 'Russell 2000', venue: 'equity', group: 'ETFs', aliases: ['russell'] },
  { symbol: 'XLF', name: 'Financieras', venue: 'equity', group: 'ETFs' },
  { symbol: 'XLK', name: 'Tecnología', venue: 'equity', group: 'ETFs' },
  { symbol: 'XLE', name: 'Energía', venue: 'equity', group: 'ETFs' },
  { symbol: 'XLV', name: 'Salud', venue: 'equity', group: 'ETFs' },
  { symbol: 'ARKK', name: 'ARK Innovation', venue: 'equity', group: 'ETFs', aliases: ['ark'] },
  { symbol: 'GLD', name: 'Oro', venue: 'equity', group: 'ETFs', aliases: ['gold', 'xau'] },
  { symbol: 'SLV', name: 'Plata', venue: 'equity', group: 'ETFs', aliases: ['silver'] },
  { symbol: 'USO', name: 'Petróleo', venue: 'equity', group: 'ETFs', aliases: ['oil', 'crudo'] },
  { symbol: 'TLT', name: 'Bonos 20Y', venue: 'equity', group: 'ETFs', aliases: ['bonos', 'treasuries'] },
  { symbol: 'HYG', name: 'High Yield', venue: 'equity', group: 'ETFs' },
];

const BY_SYMBOL = new Map(VOICE_ASSETS.map((asset) => [asset.symbol, asset]));

const EQUITY_SYMBOLS = new Set(VOICE_ASSETS.filter((a) => a.venue === 'equity').map((a) => a.symbol));

/** Spoken form → ticker. Built from the registry so it can never drift from it. */
const SPOKEN_TO_SYMBOL: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const asset of VOICE_ASSETS) {
    map[asset.symbol] = asset.symbol;
    map[asset.name.toUpperCase()] = asset.symbol;
    for (const alias of asset.aliases ?? []) map[alias.toUpperCase()] = asset.symbol;
  }
  return map;
})();

/**
 * Tickers and names that are also ordinary words a Mexican trader says without
 * meaning the asset — "mi META es", "el USO de", "todo el DÍA", "por SALUD".
 * Matching them in a live transcript would swap the chart and wipe the debate
 * mid-sentence, so they are excluded from speech matching only. Bobby still
 * reaches these assets through set_chart, and the picker still lists them.
 */
const HOMONYMS = new Set([
  'META', 'USO', 'DIA', 'TON', 'CAT', 'ARM', 'SEI', 'SUI', 'OP', 'ADA', 'MA', 'V', 'BA', 'GS', 'UNI',
  'SALUD', 'ENERGÍA', 'TECNOLOGÍA', 'FINANCIERAS', 'NEAR', 'ARK', 'DOW',
]);

export const ASSET_GROUPS: Array<{ label: VoiceAsset['group']; assets: VoiceAsset[] }> = (
  ['Cripto', 'Acciones', 'ETFs'] as const
).map((label) => ({ label, assets: VOICE_ASSETS.filter((asset) => asset.group === label) }));

/** True when the ticker is priced from Yahoo rather than OKX. */
export function isEquitySymbol(symbol: string): boolean {
  return EQUITY_SYMBOLS.has(symbol.trim().toUpperCase());
}

export function getVoiceAsset(symbol: string): VoiceAsset | undefined {
  return BY_SYMBOL.get(symbol.trim().toUpperCase());
}

/** Coerce anything the model or a select emits into a ticker we can chart. */
export function normalizeAssetSymbol(value: unknown): string {
  const raw = String(value ?? 'BTC').trim().toUpperCase().slice(0, 128);
  if (SPOKEN_TO_SYMBOL[raw]) return SPOKEN_TO_SYMBOL[raw];
  // The model sometimes hands back a full pair ("BTC-USDT", "ETH/USD"); the
  // chart and the market endpoint both want the bare base ticker.
  const dashIndex = raw.indexOf('-');
  const slashIndex = raw.indexOf('/');
  const separatorIndex = dashIndex === -1
    ? slashIndex
    : slashIndex === -1
      ? dashIndex
      : Math.min(dashIndex, slashIndex);
  const quote = separatorIndex === -1 ? '' : raw.slice(separatorIndex + 1);
  const knownQuote = ['USD', 'USDT', 'USDC', 'PERP', 'SWAP'].some((suffix) => quote.startsWith(suffix));
  const base = separatorIndex !== -1 && knownQuote ? raw.slice(0, separatorIndex) : raw;
  if (SPOKEN_TO_SYMBOL[base]) return SPOKEN_TO_SYMBOL[base];
  return base.replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'BTC';
}

/**
 * Longest-name-first so "Binance Coin" wins over "Binance", and word-bounded so
 * "MASIVO" never matches MA. Returns null when the human named no known asset.
 */
const SPOKEN_PATTERNS: Array<[RegExp, string]> = Object.entries(SPOKEN_TO_SYMBOL)
  .filter(([spoken]) => !HOMONYMS.has(spoken) && spoken.length >= 3)
  .sort(([a], [b]) => b.length - a.length)
  .map(([spoken, symbol]) => [
    new RegExp(`(?<![\\p{L}\\p{N}])${spoken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu'),
    symbol,
  ]);

export function matchAssetInText(text: string): string | null {
  if (!text) return null;
  return SPOKEN_PATTERNS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}
