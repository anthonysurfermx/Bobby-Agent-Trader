/**
 * Shared symbol and intent detection logic used by the chat UI and router benchmark.
 */

export const TOKEN_MAP = {
  btc: 'BTC-USDT', bitcoin: 'BTC-USDT',
  eth: 'ETH-USDT', ethereum: 'ETH-USDT', ether: 'ETH-USDT',
  sol: 'SOL-USDT', solana: 'SOL-USDT',
  okb: 'OKB-USDT',
  matic: 'MATIC-USDT', polygon: 'MATIC-USDT',
  gold: 'XAUT-USDT', oro: 'XAUT-USDT', xaut: 'XAUT-USDT', xau: 'XAUT-USDT',
  paxg: 'PAXG-USDT', 'pax gold': 'PAXG-USDT',
  silver: 'XAG-USDT-SWAP', plata: 'XAG-USDT-SWAP', xag: 'XAG-USDT-SWAP',
};

/**
 * @param {string} text
 * @returns {string[]}
 */
export function detectTokens(text) {
  const lower = text.toLowerCase();
  const found = [];
  for (const [key, instId] of Object.entries(TOKEN_MAP)) {
    if (new RegExp(`\\b${key}\\b`).test(lower) && !found.includes(instId)) {
      found.push(instId);
    }
  }
  return found;
}

export const STOCK_MAP = {
  nvidia: 'NVDA', nvda: 'NVDA',
  apple: 'AAPL', aapl: 'AAPL',
  tesla: 'TSLA', tsla: 'TSLA',
  meta: 'META', facebook: 'META',
  google: 'GOOGL', googl: 'GOOGL', alphabet: 'GOOGL',
  amazon: 'AMZN', amzn: 'AMZN',
  microsoft: 'MSFT', msft: 'MSFT',
  amd: 'AMD',
  intel: 'INTC', intc: 'INTC',
  palantir: 'PLTR', pltr: 'PLTR',
  netflix: 'NFLX', nflx: 'NFLX',
  coinbase: 'COIN', coin: 'COIN',
  microstrategy: 'MSTR', mstr: 'MSTR',
  jpmorgan: 'JPM', jpm: 'JPM', 'jp morgan': 'JPM',
  goldman: 'GS', 'goldman sachs': 'GS',
  'bank of america': 'BAC', bac: 'BAC',
  exxon: 'XOM', 'exxon mobil': 'XOM', exxonmobil: 'XOM', xom: 'XOM',
  chevron: 'CVX', cvx: 'CVX',
  disney: 'DIS', dis: 'DIS',
  walmart: 'WMT', wmt: 'WMT',
  'coca cola': 'KO', 'coca-cola': 'KO', ko: 'KO',
  sp500: 'SPY', spy: 'SPY', 's&p': 'SPY', 's&p 500': 'SPY', 's&p500': 'SPY',
  nasdaq: 'QQQ', qqq: 'QQQ',
  dow: 'DIA', 'dow jones': 'DIA', dia: 'DIA',
};

/**
 * @param {string} text
 * @returns {string[]}
 */
export function detectStocks(text) {
  const lower = text.toLowerCase();
  const found = [];
  for (const [key, ticker] of Object.entries(STOCK_MAP)) {
    if (new RegExp(`\\b${key.replace('&', '\\&')}\\b`).test(lower) && !found.includes(ticker)) {
      found.push(ticker);
    }
  }
  return found;
}

/**
 * @typedef {'price' | 'analyze' | 'portfolio' | 'trending' | 'prices_all' | 'help' | 'chat' | 'greeting' | 'ambiguous'} RouterIntent
 */

/**
 * Deterministic intent detector currently used by the Bobby chat UI.
 *
 * @param {string} text
 * @returns {RouterIntent}
 */
export function detectIntent(text) {
  const l = text.toLowerCase().trim();
  const wordCount = l.split(/\s+/).filter(Boolean).length;

  if (wordCount <= 4 && /^(hola|hey|hi|hello|sup|yo|buenas?|buenos? [dnt]|good (morning|evening|night)|what.?s up|que tal|qu[ée] onda|saludos|gracias|thanks|thank you|de nada|adiós|bye|chao|ok|okay|cool|nice|genial|perfecto|vale|orale|ya)\b/i.test(l)) return 'greeting';

  if (/^(qui[eé]n eres|who are you|what are you|qu[eé] eres|qu[eé] haces|what do you do|c[oó]mo te llamas|what.?s your name)\b/i.test(l)) return 'greeting';

  const isOpinionQuestion = /\b(opina[sr]?|piensa[sr]?|crees?|thinks?|deber[ií]a|should|recomiend[ao]?|recommend|tell me|dime|explica|explain|por ?qu[eé]|why|como ves|how do you see|que onda|what.?s your|cual es tu|an[aá]lisis|analysis|outlook|perspectiv|pronos|predict|forecast|va a (subir|bajar)|will .* (go|rise|fall|drop|pump|dump)|esta semana|this week|este mes|this month|próxim[oa]|next|futuro|future|qu[eé] har[ií]as|what would you|c[oó]mo est[aá]|how.?s the|sentiment|sentimiento|mercado va|market going|afectar[aá]?|impact|affect|benefici|perjudic|compar[ae]|versus|vs\.?|entre|between|conviene|mejor|worse|better|riesg|risk|oportunid|opportunity|estrategi|strategy|jugada|play|movida|move|qu[eé] opinas|what do you think)\b/i.test(l);

  if ((isOpinionQuestion && wordCount > 3) || (detectStocks(text).length > 0 && wordCount > 2)) return 'chat';

  if (/\b(pric|precio|coti|cuanto|how much|what.?s .* at|dame .* precio)\b/i.test(l) && wordCount <= 5) return 'price';

  if (/\b(analyz|analiz|scan|escan|run|ejecut)\b/i.test(l) && wordCount <= 4) return 'analyze';

  if (/\b(portfolio|position|posicion|balance|cartera|wallet)\b/i.test(l)) return 'portfolio';
  if (/\b(trend|trending|hot|popular|whats up|que hay)\b/i.test(l) && wordCount <= 5) return 'trending';
  if (/\b(prices|precios|all|todos|overview|resumen)\b/i.test(l) && wordCount <= 4) return 'prices_all';
  if (/\b(help|ayuda|command)\b/i.test(l)) return 'help';

  if (detectTokens(text).length > 0) {
    return wordCount <= 2 ? 'price' : 'chat';
  }

  if (/\b(fed|tasas|rates|inflaci|recession|recesi|bull ?run|bear|crash|guerra|war|tariff|arancel|dxy|d[oó]lar|dollar|macro|geopolit|elecciones|election|risk.?on|risk.?off|panic|eufori|miedo|fear|greed)\b/i.test(l)) return 'chat';
  if (/\b(trade|trad(e|ing|ear)|operar|invertir|invest|apalanca|leverag|margin|posici[oó]n|position)\b/i.test(l)) return 'chat';
  if (wordCount <= 5 && /\b(why|por ?qu[eé]|explain|explica|profundiz|more|m[aá]s|y el|and the|pero|but|how|c[oó]mo|cu[aá]ndo|when|stop|target|entry|riesgo|risk)\b/i.test(l)) return 'chat';
  if (wordCount >= 3 && /\b(markets?|mercados?|prices?|bottom|top|dip|rally|correction|correcci[oó]n|breakout|breakdown|reversal|squeeze|accumul|distribut|volume|volumen|candle|trend|momentum|signal|se[ñn]al|setup|pattern|patr[oó]n|level|nivel|zone|zona|demand|supply|oferta|demanda|move|movimiento|action|acci[oó]n|cycle|ciclo|wave|onda|peak|pico|knife|liq|pump|rekt|whale|fakeout|trapped|sweep|semana|week|hoy|today|ayer|yesterday|esta semana|this week|qu[eé] pas[oó]|what happened)\b/i.test(l)) return 'chat';
  if (/\b(binance|okx|coinbase|bybit|kraken|1h|4h|1d|1w|daily|weekly|monthly|timeframe|defi|nft|airdrop|staking|yield|apr|apy|crypto|blockchain|web3|token|altcoin|memecoin|shitcoin|hodl|wagmi|ngmi|gm|wen|ser|fren|degen|rug|moon|lambo|diamond hands|paper hands|bags?|portfolio|gains|losses|pnl|roi)\b/i.test(l)) return 'chat';

  return 'ambiguous';
}
