import { matchInvestorEdgeCasePolicy } from './investor-edge-cases.js';

export type AdviceMode = 'trade' | 'invest' | 'hybrid';

export interface AdviceModeDetection {
  mode: AdviceMode;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  riskProfile: 'conservative' | 'balanced' | 'aggressive' | null;
  horizon: 'short_term' | 'medium_term' | 'long_term' | null;
  beginnerFriendly: boolean;
  wantsYield: boolean;
  mentionsPortfolio: boolean;
}

const HARD_TRADE_PATTERNS = [
  /\b(long|short|entry|entries|stop(?:\s*loss)?|take\s*profit|tp|sl|leverage|leveraged|perp|perps|futures?)\b/i,
  /\b(scalp|intraday|day\s*trade|swing\s*trade|breakout|breakdown|support|resistance)\b/i,
  /\b(operar|operacion|tradear|shortear|apalancad[oa]|entrada|salida|stop loss|take profit)\b/i,
];

const SOFT_TRADE_PATTERNS = [
  /\b(should\s+i\s+(?:buy|sell|long|short|enter)|buy\s+now|sell\s+now)\b/i,
  /\b(today|tomorrow|this\s+week|esta\s+semana|hoy|mañana|1h|4h|1d|weekly)\b/i,
  /\b(setup|trigger|catalyst|momentum|risk\/reward|r\/r)\b/i,
];

const HARD_INVEST_PATTERNS = [
  /\b(invest|investing|investment|portfolio|allocation|rebalance|retirement|savings|save|wealth)\b/i,
  /\b(invertir|inversion|portafolio|cartera|asignaci[oó]n|rebalancear|ahorros|patrimonio|porcentaje|acumular|acumulaci[oó]n|jubilarm[ea]|sueldo|salario)\b/i,
  /\b(long\s*term|long-term|for\s+years|10\s+years|retire|retiro|largo\s+plazo)\b/i,
];

const SOFT_INVEST_PATTERNS = [
  /\b(dca|dollar\s*cost|diversif|core\s+position|passive\s+income|compound|etf|index\s+fund)\b/i,
  /\b(yield|staking|apy|apr|lend|lending|vault|aave|lido|stablecoin)\b/i,
  /\b(diversific\w*|ingreso\s+pasivo|rendimiento|staking|fondos?\s+indexados?|cash\s+vs\s+invertido|cash\s+vs\s+invertir|bitcoin\s+vs\s+ethereum|btc\s+vs\s+eth)\b/i,
  /\b(crypto\s+or\s+stocks|acciones\s+o\s+crypto|stocks?\s+vs\s+crypto)\b/i,
];

const BEGINNER_PATTERNS = [
  /\b(beginner|new\s+to\s+this|where\s+do\s+i\s+start|first\s+time|getting\s+started)\b/i,
  /\b(principiante|soy\s+nuevo|soy\s+nueva|apenas\s+voy\s+empezando|empiezo|empezar\s+en)\b/i,
  /\b(tengo\s+\$?\d[\d,.]*\s*(?:usd|usdt|dolares|dólares|pesos)?\s*(?:para|y)\s*(?:invertir|empezar))\b/i,
  /\b(por\s+d[oó]nde\s+empiezo|c[oó]mo\s+empiezo|quiero\s+empezar)\b/i,
];

const CONSERVATIVE_PATTERNS = [
  /\b(low\s*risk|conservative|capital\s*preservation|safe|safer|protect)\b/i,
  /\b(bajo\s+riesgo|conservador|conservadora|seguro|proteger\s+(?:mi\s+)?capital|proteger(?:me)?|inflaci[oó]n|miedo\s+de\s+perder|perder\s+mi\s+dinero)\b/i,
];

const BALANCED_PATTERNS = [
  /\b(medium\s*risk|balanced|moderate)\b/i,
  /\b(riesgo\s+medio|balanceado|balanceada|moderado|moderada)\b/i,
];

const AGGRESSIVE_PATTERNS = [
  /\b(high\s*risk|aggressive|speculative|yolo)\b/i,
  /\b(alto\s+riesgo|agresivo|agresiva|especulativ[oa]|degen)\b/i,
];

const SHORT_HORIZON_PATTERNS = [
  /\b(today|tomorrow|this\s+week|next\s+week|intraday|short\s*term)\b/i,
  /\b(hoy|mañana|esta\s+semana|la\s+pr[oó]xima\s+semana|corto\s+plazo)\b/i,
];

const MEDIUM_HORIZON_PATTERNS = [
  /\b(this\s+month|next\s+month|next\s+few\s+months|quarter)\b/i,
  /\b(este\s+mes|pr[oó]ximos?\s+meses|trimestre|mediano\s+plazo)\b/i,
];

const LONG_HORIZON_PATTERNS = [
  /\b(long\s*term|for\s+years|5\s+years|10\s+years|retirement|hold\s+for\s+years)\b/i,
  /\b(largo\s+plazo|por\s+a[nñ]os|5\s+a[nñ]os|10\s+a[nñ]os|retiro|jubilarme)\b/i,
];

function scoreMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((score, pattern) => score + (pattern.test(text) ? 1 : 0), 0);
}

export function detectAdviceMode(rawText: string): AdviceModeDetection {
  const text = rawText.trim();
  const edgeCasePolicy = matchInvestorEdgeCasePolicy(text);
  const tradeScore = (scoreMatches(text, HARD_TRADE_PATTERNS) * 2) + scoreMatches(text, SOFT_TRADE_PATTERNS);
  const investScore = (scoreMatches(text, HARD_INVEST_PATTERNS) * 2) + scoreMatches(text, SOFT_INVEST_PATTERNS);
  const wantsYield = /\b(yield|staking|apy|apr|lend|lending|aave|lido|vault|rendimiento|staking)\b/i.test(text);
  const mentionsPortfolioBase = /\b(portfolio|allocation|cartera|portafolio|allocations?|porcentaje|cash|invertid[oa]s?|diversific\w*|acumular|acumulaci[oó]n)\b/i.test(text);
  const horizonBase =
    LONG_HORIZON_PATTERNS.some((pattern) => pattern.test(text))
      ? 'long_term'
      : MEDIUM_HORIZON_PATTERNS.some((pattern) => pattern.test(text))
        ? 'medium_term'
        : SHORT_HORIZON_PATTERNS.some((pattern) => pattern.test(text))
          ? 'short_term'
          : null;

  const isBeginner = BEGINNER_PATTERNS.some((p) => p.test(text));
  const isConservative = CONSERVATIVE_PATTERNS.some((p) => p.test(text));

  let mode: AdviceMode = 'trade';
  if (investScore >= 2 && tradeScore >= 2 && Math.abs(investScore - tradeScore) <= 1) {
    mode = 'hybrid';
  } else if (investScore > tradeScore) {
    mode = 'invest';
  } else if (tradeScore === 0 && horizonBase === 'long_term') {
    mode = 'invest';
  } else if (tradeScore === 0 && investScore === 0) {
    // When no explicit signals, suitability-style questions should still route to invest mode.
    mode = (isBeginner || isConservative || wantsYield || mentionsPortfolioBase) ? 'invest' : 'trade';
  }

  if (edgeCasePolicy) {
    mode = edgeCasePolicy.forcedMode;
  }

  const delta = Math.abs(investScore - tradeScore);
  const confidence: AdviceModeDetection['confidence'] =
    Math.max(investScore, tradeScore) >= 4 || delta >= 3
      ? 'high'
      : Math.max(investScore, tradeScore) >= 2
        ? 'medium'
        : 'low';

  const reasons: string[] = [];
  const horizon = edgeCasePolicy?.horizon ?? horizonBase;
  const mentionsPortfolio = edgeCasePolicy ? true : mentionsPortfolioBase;
  if (mode === 'trade' || mode === 'hybrid') {
    if (HARD_TRADE_PATTERNS.some((pattern) => pattern.test(text))) reasons.push('explicit trade execution language');
    if (SOFT_TRADE_PATTERNS.some((pattern) => pattern.test(text))) reasons.push('short-horizon market timing language');
  }
  if (mode === 'invest' || mode === 'hybrid') {
    if (HARD_INVEST_PATTERNS.some((pattern) => pattern.test(text))) reasons.push('portfolio / long-term investing language');
    if (SOFT_INVEST_PATTERNS.some((pattern) => pattern.test(text))) reasons.push('allocation / yield / diversification language');
    if (horizon === 'long_term' && !reasons.includes('portfolio / long-term investing language')) reasons.push('long-horizon accumulation language');
  }
  if (edgeCasePolicy) reasons.unshift(`edge-case policy: ${edgeCasePolicy.id}`);

  const riskProfileBase =
    AGGRESSIVE_PATTERNS.some((pattern) => pattern.test(text))
      ? 'aggressive'
      : CONSERVATIVE_PATTERNS.some((pattern) => pattern.test(text))
        ? 'conservative'
        : BALANCED_PATTERNS.some((pattern) => pattern.test(text))
          ? 'balanced'
          : null;
  const riskProfile = edgeCasePolicy?.riskProfile ?? riskProfileBase;

  return {
    mode,
    confidence,
    reasons,
    riskProfile,
    horizon,
    beginnerFriendly: BEGINNER_PATTERNS.some((pattern) => pattern.test(text)),
    wantsYield,
    mentionsPortfolio,
  };
}
