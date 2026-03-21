/**
 * Bobby Agent Trader - Trading Dictionary & Intent Mappings
 * Pre-computado para el Semantic Router basado en jerga de TradingView.
 */

// 1. MID-CAP & TRENDING TICKERS (Para agregar a la regex `allAssets` actual)
export const TRENDING_TICKERS = [
  // L1/L2 & Infra
  'TIA', 'SUI', 'SEI', 'APT', 'INJ', 'KAS', 'TON', 'STX', 'AR',
  // AI & DePIN
  'TAO', 'FET', 'RNDR', 'AGIX', 'AKT',
  // DeFi & RWA
  'ONDO', 'PENDLE', 'MKR', 'AAVE', 'SNX',
  // Memecoins (Alto volumen de retail/TradingView)
  'PEPE', 'WIF', 'BONK', 'FLOKI', 'BOME', 'POPCAT'
];

// Opciones de regex combinadas para detectTokens o detectIntent
export const ASSET_REGEX_EXPANDED = new RegExp(`\\b(BTC|ETH|SOL|OKB|HYPE|XRP|UNI|MATIC|DOGE|AVAX|LINK|ADA|ATOM|ARB|OP|NVDA|AAPL|TSLA|META|GOOGL|MSFT|AMD|COIN|MSTR|SPY|QQQ|XOM|JPM|GS|${TRENDING_TICKERS.join('|')})\\b`, 'i');

// 2. SLANG A INTENT (Diccionario de Dirección y Acción)
export const INTENT_MAPPING = {
  LONG: [
    'long', 'buy', 'comprar', 'ape in', 'send it', 'moon', 'pumping', 
    'fomo', 'bull flag', 'bullish', 'accumulate', 'bag holding', 'buy the dip'
  ],
  SHORT: [
    'short', 'sell', 'vender', 'nuke', 'puke', 'ded', 'dumping', 
    'dump it', 'bear flag', 'bearish', 'distribute', 'take profit', 'tp', 'short it'
  ],
  HOLD: [
    'hodl', 'wait', 'sit on hands', 'chop', 'choppy', 'sideways', 'ranging'
  ]
};

// 3. JARGON A CONCEPTO (Para inyectar contexto y normalizar tokens de entrada)
// Si detectamos estas palabras, inyectamos un flag "[System: User is talking about SMC/TA]"
export const TA_JARGON_MAPPING: Record<string, string> = {
  'ob': 'Order Block',
  'fvg': 'Fair Value Gap',
  'sweep': 'Liquidity Sweep',
  'grab': 'Liquidity Grab',
  'stop hunt': 'Liquidity Sweep',
  'wick': 'Price Rejection (Wick)',
  'div': 'Divergence',
  'bear div': 'Bearish Divergence',
  'bull div': 'Bullish Divergence',
  's/r': 'Support and Resistance',
  'flip': 'S/R Flip',
  'retest': 'Level Retest',
  'poi': 'Point of Interest',
  'choch': 'Change of Character (Trend Reversal)',
  'bos': 'Break of Structure'
};

export const isTechnicalAnalysisIntent = (text: string): boolean => {
  const jargonRegex = /\b(ob|fvg|sweep|liquidity grab|stop hunt|bear div|bull div|choch|bos)\b/i;
  return jargonRegex.test(text);
};

// 4. 0-TOKEN FAST LANES (Rutas locales de costo $0)
export const FAST_LANE_ROUTER = {
  // A. Preguntas de Principiantes (Educación mecánica)
  newbie: {
    regex: /\b(qué es|how to|what is|how do i|explain|meaning of|cómo (?:hacer|funciona)|principiante|newbie|noob)\b/i,
    localResponse: {
      es: "Soy Bobby. Este es un entorno avanzado de trading. Si eres nuevo, te sugiero empezar usando la tarjeta de **Paper Trading** para ver cómo ejecuto y analizo el mercado sin arriesgar tu capital, o visita nuestra sección de Academy.",
      en: "I'm Bobby. This is an advanced trading environment. If you're new, I suggest starting with **Paper Trading** mode to watch how I analyze and execute without risking your capital, or visit our Academy section."
    }
  },
  
  // B. Frustración y Manejo de Emociones (Risk Management)
  frustration: {
    regex: /\b(rekt|liquidado|liquidated|scam|estafa|lost everything|perdí todo|rigged|manipulado|manipulated|blow my account)\b/i,
    localResponse: {
      es: "[Bobby CIO]: El mercado no está en tu contra, simplemente no tiene sentimientos. Revisemos tu gestión de riesgo. Baja tu apalancamiento a máximo 3x y nunca arriesgues más del 2% por trade. Respira. ¿Quieres que busque un setup seguro o prefieres descansar?",
      en: "[Bobby CIO]: The market isn't against you, it just doesn't care. Let's review your risk management. Drop your leverage to max 3x and never risk more than 2% per trade. Take a breath. Want me to scan for a safe setup or do you prefer to step away?"
    }
  },

  // C. Consultas de Balance y Estado (Acciones rápidas de UI sin LLM)
  balance: {
    regex: /\b(mi balance|cuánto tengo|my balance|portfolio|funds|fondos)\b/i,
    action: 'TRIGGER_WALLET_UI' // El frontend intercepta y abre el panel de la wallet
  }
};

/**
 * Función preliminar del Local Router Bypass 
 * Se ejecuta ANTES de llamar a OpenAI/Anthropic
 */
export function checkLocalBypass(userMessage: string, lang: string = 'en') {
  if (FAST_LANE_ROUTER.balance.regex.test(userMessage)) {
    return { action: FAST_LANE_ROUTER.balance.action };
  }
  if (FAST_LANE_ROUTER.newbie.regex.test(userMessage)) {
    return { text: FAST_LANE_ROUTER.newbie.localResponse[lang as 'es'|'en'] || FAST_LANE_ROUTER.newbie.localResponse.en, bypass: true };
  }
  if (FAST_LANE_ROUTER.frustration.regex.test(userMessage)) {
    return { text: FAST_LANE_ROUTER.frustration.localResponse[lang as 'es'|'en'] || FAST_LANE_ROUTER.frustration.localResponse.en, bypass: true };
  }
  
  return null; // Enrutar al LLM (Bobby Cycle)
}
