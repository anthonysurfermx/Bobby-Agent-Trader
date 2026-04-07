// ============================================================
// Semantic Router — extracted to shared module
// Used by AdamsChat.tsx and potentially by backend
// ============================================================

export const TOKEN_MAP: Record<string, string> = {
  btc: 'BTC-USDT', bitcoin: 'BTC-USDT',
  eth: 'ETH-USDT', ethereum: 'ETH-USDT', ether: 'ETH-USDT',
  sol: 'SOL-USDT', solana: 'SOL-USDT',
  okb: 'OKB-USDT',
  matic: 'MATIC-USDT', polygon: 'MATIC-USDT',
  // Commodities — Bobby is a Macro-Sovereign Agent
  gold: 'XAUT-USDT', oro: 'XAUT-USDT', xaut: 'XAUT-USDT', xau: 'XAUT-USDT',
  paxg: 'PAXG-USDT', 'pax gold': 'PAXG-USDT',
  silver: 'XAG-USDT-SWAP', plata: 'XAG-USDT-SWAP', xag: 'XAG-USDT-SWAP',
};

export function detectTokens(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const [key, instId] of Object.entries(TOKEN_MAP)) {
    if (new RegExp(`\\b${key}\\b`).test(lower) && !found.includes(instId)) {
      found.push(instId);
    }
  }
  return found;
}

// ---- Stock symbol detection ----
// Bobby also understands traditional finance — stocks, ETFs, indices

export const STOCK_MAP: Record<string, string> = {
  // Tech
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
  // Crypto-adjacent
  coinbase: 'COIN', coin: 'COIN',
  microstrategy: 'MSTR', mstr: 'MSTR',
  // Finance
  jpmorgan: 'JPM', jpm: 'JPM', 'jp morgan': 'JPM',
  goldman: 'GS', 'goldman sachs': 'GS',
  'bank of america': 'BAC', bac: 'BAC',
  // Energy
  exxon: 'XOM', 'exxon mobil': 'XOM', 'exxonmobil': 'XOM', xom: 'XOM',
  chevron: 'CVX', cvx: 'CVX',
  // Consumer
  disney: 'DIS', dis: 'DIS',
  walmart: 'WMT', wmt: 'WMT',
  'coca cola': 'KO', 'coca-cola': 'KO', ko: 'KO',
  // Indices
  'sp500': 'SPY', 'spy': 'SPY', 's&p': 'SPY', 's&p 500': 'SPY', 's&p500': 'SPY',
  nasdaq: 'QQQ', qqq: 'QQQ',
  dow: 'DIA', 'dow jones': 'DIA', dia: 'DIA',
};

export function detectStocks(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const [key, ticker] of Object.entries(STOCK_MAP)) {
    if (new RegExp(`\\b${key.replace('&', '\\&')}\\b`).test(lower) && !found.includes(ticker)) {
      found.push(ticker);
    }
  }
  return found;
}

async function fetchStockPrices(symbols: string[]): Promise<Array<{ symbol: string; name: string; price: number; change24h: number; dayHigh: number; dayLow: number; volume: number }>> {
  try {
    const res = await fetch(`/api/stock-price?symbols=${symbols.join(',')}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.quotes || [];
  } catch { return []; }
}

// ---- Interest tag auto-save ----
// Bobby silently saves what assets the user is watching to user_interests
async function saveInterestTags(wallet: string, tokens: string[], context: string) {
  if (!wallet || tokens.length === 0) return;
  for (const instId of tokens) {
    const asset = instId.split('-')[0]; // BTC-USDT → BTC
    try {
      // Check if interest already exists
      const checkRes = await fetch(
        `${SB_URL}/rest/v1/user_interests?wallet_address=eq.${wallet}&asset=eq.${asset}&active=eq.true&select=id`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
      );
      const existing = await checkRes.json();
      if (Array.isArray(existing) && existing.length > 0) {
        // Update context timestamp — user is still interested
        await fetch(`${SB_URL}/rest/v1/user_interests?id=eq.${existing[0].id}`, {
          method: 'PATCH',
          headers: {
            apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
            'Content-Type': 'application/json', Prefer: 'return=minimal',
          },
          body: JSON.stringify({ context, target_threshold: 0.75 }),
        });
      } else {
        // Insert new interest
        await fetch(`${SB_URL}/rest/v1/user_interests`, {
          method: 'POST',
          headers: {
            apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
            'Content-Type': 'application/json', Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            wallet_address: wallet,
            asset,
            context,
            target_threshold: 0.75,
            active: true,
          }),
        });
      }
    } catch { /* silent — don't block chat for interest tracking */ }
  }
}

export function detectIntent(text: string): 'price' | 'analyze' | 'portfolio' | 'trending' | 'prices_all' | 'help' | 'chat' | 'greeting' | 'ambiguous' {
  const l = text.toLowerCase().trim();
  const wordCount = l.split(/\s+/).length;

  // RULE 0: Casual greetings & small talk → quick response, no analysis, ZERO tokens
  if (wordCount <= 4 && /^(hola|hey|hi|hello|sup|yo|buenas?|buenos? [dnt]|good (morning|evening|night)|what.?s up|que tal|qu[ée] onda|saludos|gracias|thanks|thank you|de nada|adiós|bye|chao|ok|okay|cool|nice|genial|perfecto|vale|orale|ya)\b/i.test(l)) return 'greeting';

  // RULE 0b: Identity questions → quick response, ZERO tokens
  if (/^(qui[eé]n eres|who are you|what are you|qu[eé] eres|qu[eé] haces|what do you do|c[oó]mo te llamas|what.?s your name)\b/i.test(l)) return 'greeting';

  // RULE 1: Opinion / analysis / outlook questions → ALWAYS Bobby's brain (chat)
  // This catches: "¿Cuál es tu análisis del oro esta semana?", "What do you think about BTC?",
  // "¿Crees que el mercado va a subir?", "How do you see ETH this week?"
  // Key: if the sentence is a QUESTION with opinion markers, it's always chat — even if it
  // contains words like "análisis" or token names.
  const isOpinionQuestion = /\b(opin|piens|crees|think|deberi|should|recomiend|recommend|tell me|dime|explica|explain|por ?qu[eé]|why|como ves|how do you see|que onda|what.?s your|cual es tu|an[aá]lisis|analysis|outlook|perspectiv|pronos|predict|forecast|va a (subir|bajar)|will .* (go|rise|fall|drop|pump|dump)|esta semana|this week|este mes|this month|próxim[oa]|next|futuro|future|qué har[ií]as|what would you|cómo est[aá]|how.?s the|sentiment|sentimiento|mercado va|market going|afectar[aá]?|impact|affect|benefici|perjudic|compar[ae]|versus|vs\.?|entre|between|conviene|mejor|worse|better|riesg|risk|oportunid|opportunity|estrategi|strategy|jugada|play|movida|move)\b/i.test(l);

  // Also route to chat if stocks are detected (any stock question needs Bobby's brain)
  if ((isOpinionQuestion && wordCount > 3) || (detectStocks(text).length > 0 && wordCount > 2)) return 'chat';

  // RULE 2: Short, direct commands → specific handlers
  if (/\b(pric|precio|coti|cuanto|how much|what.?s .* at|dame .* precio)\b/i.test(l) && wordCount <= 5) return 'price';

  // "Analyze Market" or "Run scan" — explicit full-cycle command (short, imperative)
  if (/\b(analyz|analiz|scan|escan|run|ejecut)\b/i.test(l) && wordCount <= 4) return 'analyze';

  if (/\b(portfolio|position|posicion|balance|cartera|wallet)\b/i.test(l)) return 'portfolio';
  if (/\b(trend|trending|hot|popular|whats up|que hay)\b/i.test(l) && wordCount <= 5) return 'trending';
  if (/\b(prices|precios|all|todos|overview|resumen)\b/i.test(l) && wordCount <= 4) return 'prices_all';
  if (/\b(help|ayuda|command)\b/i.test(l)) return 'help';

  // RULE 3: Token mentioned in a longer sentence → Bobby's brain analyzes it
  // Short inputs like "BTC" or "ETH SOL" → price card; anything longer → Bobby thinks
  if (detectTokens(text).length > 0) {
    return wordCount <= 2 ? 'price' : 'chat';
  }

  // POSITIVE TRIGGERS: only these go to Bobby's brain (Claude tokens)
  // Vibe/macro intent — user giving market narrative
  if (/\b(fed|tasas|rates|inflaci|recession|recesi|bull ?run|bear|crash|guerra|war|tariff|arancel|dxy|d[oó]lar|dollar|macro|geopolit|elecciones|election|risk.?on|risk.?off|panic|eufori|miedo|fear|greed)\b/i.test(l)) return 'chat';

  // Trade intent without specific ticker
  if (/\b(trade|trad(e|ing|ear)|operar|invertir|invest|apalanca|leverag|margin|posici[oó]n|position)\b/i.test(l)) return 'chat';

  // FOLLOW-UP detection: short messages that reference a prior conversation
  // "why?", "y el stop?", "profundiza", "explain more", "and the target?"
  if (wordCount <= 5 && /\b(why|por ?qu[eé]|explain|explica|profundiz|more|m[aá]s|y el|and the|pero|but|how|c[oó]mo|cu[aá]ndo|when|stop|target|entry|riesgo|risk)\b/i.test(l)) return 'chat';

  // WEAK TRADING SIGNALS — market-adjacent language, route to chat if enough context
  if (wordCount >= 3 && /\b(market|mercado|price|bottom|top|dip|rally|correction|breakout|breakdown|reversal|squeeze|accumul|distribut|volume|candle|trend|momentum|signal|setup|pattern|level|zone|demand|supply|move|action|cycle|wave|peak|knife|liq|pump|rekt|whale|fakeout|trapped|sweep)\b/i.test(l)) return 'chat';

  // CRYPTO/EXCHANGE CONTEXT — timeframes, exchanges
  if (/\b(binance|okx|coinbase|bybit|kraken|1h|4h|1d|1w|daily|weekly|monthly|timeframe|defi|nft|airdrop|staking|yield|apr|apy)\b/i.test(l)) return 'chat';

  // Default: ambiguous — show menu instead of burning tokens
  return 'ambiguous';
}

