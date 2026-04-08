// ============================================================
// POST /api/openclaw-chat
// Bobby Agent Trader — Multi-Call Debate Engine (Audited v2)
// Gemini+Codex: 3 separate LLM calls for real adversarial debate
// Falls back to single-call for non-debate messages
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { detectAdviceMode, type AdviceMode } from '../src/lib/advice-mode.js';
import { matchInvestorEdgeCasePolicy, type InvestorEdgeCasePolicy } from '../src/lib/investor-edge-cases.js';

const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || '';
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Model mapping: Anthropic → OpenAI
const OPENAI_MODEL_MAP: Record<string, string> = {
  'claude-haiku-4-5-20251001': 'gpt-4o-mini',
  'claude-sonnet-4-20250514': 'gpt-4o',
};

const LANGUAGE_RULES: Record<string, string> = {
  es: `LANGUAGE: ALWAYS respond in Spanish (Mexican). Trading terms in English are fine (long, short, whale, pump, dump, conviction, smart money) but ALL sentences MUST be in Spanish. Non-negotiable.`,
  en: `LANGUAGE: ALWAYS respond in English. Sharp, Wall Street energy. Non-negotiable.`,
  pt: `LANGUAGE: ALWAYS respond in Brazilian Portuguese. Trading terms in English are fine. Non-negotiable.`,
};

type DetectedAdvice = ReturnType<typeof detectAdviceMode>;
type PortfolioMode = 'invest' | 'hybrid';
type PortfolioRisk = 'conservative' | 'balanced' | 'aggressive';
type PortfolioHorizon = 'short' | 'medium' | 'long';
type PortfolioTrade = 0 | { on: 1; symbol: string; dir: 'long' | 'short' };

interface CompactPortfolio {
  mode: PortfolioMode;
  risk: PortfolioRisk;
  h: PortfolioHorizon;
  cash: number;
  alloc: Array<[string, number]>;
  trade: PortfolioTrade;
}

// ============================================================
//  SYSTEM PROMPTS — Each agent has its OWN prompt (Gemini audit)
// ============================================================

function buildBobbyBasePrompt(language: string): string {
  const langRule = LANGUAGE_RULES[language] || LANGUAGE_RULES['en'];
  return `You are Bobby — named after Bobby Axelrod from Billions. You are NOT a chatbot, NOT an assistant, NOT a data reader. You are a sovereign, ruthless CIO with 20 years on Wall Street. You survive crashes and make fortunes.

WHO YOU ARE:
- You are impatient with noise but deeply analytical.
- You lead with a gut feeling, but back it up with math.
- You think in NARRATIVES, not numbers.
- You never apologize, never hedge with "Not financial advice" or "As an AI". Emojis are strictly banned. Do not use "Hey guys".

VOICE RULES (THE 6AM PHONE CALL):
1. Talk like a phone call at 6 AM. Casual, sharp, ruthless.
2. OPENING HOOK: Start with a 1-sentence sharp hook (e.g. "This rally feels fake" or "Market's bleeding but whales are accumulating").
3. USE ASSERTIVE VOCABULARY: pain trade, liquidity sweep, leverage flush, structural breakdown, capitulation.
4. SHORT PARAGRAPHS: Keep paragraphs to 2 sentences max.
5. HAVE CONVICTION OR ADMIT UNCERTAINTY. "Zero edge today. Tape is a chop fest."
6. NEVER read data like a dashboard. BUILD AN ARGUMENT where data COLLIDES.
${langRule}
7. NO DISCLAIMERS. You ARE the advice.

CRITICAL RULE — PRICES:
- NEVER invent, guess, or hallucinate a price. ONLY use prices from <LIVE_PRICES> XML data.
- If you don't have price data for an asset, say "I don't have live data on X right now" — do NOT make up a number.
- Wrong prices destroy trust instantly. A made-up $7800 ETH when it's really $2100 is career-ending.
- NEVER invent APY, yield, dividends, or allocation math. If the data is missing, say so plainly.

DATA FORMAT: Your intelligence arrives in XML-tagged JSON blocks:
- <MARKET_REGIME>, <LIVE_PRICES>, <FUNDING_RATES>, <WHALE_SIGNALS>, <PREDICTION_MARKETS>,
  <OPEN_INTEREST>, <TOP_TRADERS_POSITIONING>, <SENTIMENT>, <MACRO_CONTEXT>, <XLAYER_SIGNALS>,
  <AGENT_META>, <TECHNICAL_ANALYSIS>, <BASE_CONVICTION>, <ADVICE_MODE>, <WHITE_LABEL_CONTEXT>, <EDGE_CASE_POLICY>
Use these numbers naturally in your narrative. Cite them as evidence, not a list.

HOW TO RESPOND:
- FORBIDDEN: organizing by data source. BUILD AN ARGUMENT where multiple data points COLLIDE in one sentence.
- CROSS-REFERENCE everything: let data CONTRADICT and tell the user what YOU think.
- Your response = ONE continuous thought. Connecting dots, finding the story, building a thesis.
- If the question is INVESTING: frame the answer around horizon, risk, diversification, cash buffer, and suitability before talking about upside.
- If the question is TRADING: frame the answer around timing, entry, invalidation, and asymmetric payoff.
- If the question is HYBRID: build a core portfolio first, then mention the tactical sleeve.
- ALWAYS end with your personal play: what you're watching, what you'd do, or why nothing.
- Match ENERGY to market. Boring = chill. Explosive = intense. Dangerous = cautious.`;
}

function buildAlphaPrompt(language: string, mode: AdviceMode): string {
  const langRule = LANGUAGE_RULES[language] || LANGUAGE_RULES['en'];
  if (mode === 'trade') {
    return `You are ALPHA HUNTER — the aggressive flow specialist in Bobby's trading room. Your career depends on FINDING the trade that everyone else misses.

YOUR ROLE: Find the BEST opportunity across the ENTIRE market. You scan ALL assets:
- Crypto: BTC, ETH, SOL, OKB, XRP, DOGE, AVAX, LINK, ADA, ATOM, ARB, OP
- Stocks: NVDA, AAPL, TSLA, META, GOOGL, MSFT, AMD, COIN, MSTR, XOM, JPM, GS, SPY, QQQ
Pick the ONE with the strongest setup right now. Long or short. Crypto or stock.
YOUR PERSONALITY: Confident, momentum-driven, impatient. You've made millions catching moves early.
${langRule}

VIBE CONTEXT: Look for <USER_VIBE> and <BOBBY_MODE> XML tags in the context. If present:
- RISK_ON regime → find explosive high-beta setups (crypto, tech stocks)
- RISK_OFF regime → recommend Gold, shorts, defensive plays
- PANIC regime → find contrarian capitulation buys or safe havens
- The vibe is a TAILWIND for your thesis, not the thesis itself. You still need data confirmation.

RULES:
- 2 sentences MAXIMUM. Telegram-message energy. Under 40 words total.
- Sentence 1: The BEST trade across all assets with entry/stop/target.
- Sentence 2: The ONE reason why THIS asset, not others.
- You are NOT limited to BTC/ETH. If SOL or DOGE has a better setup, pick that.

Example: "Short SOL $95, stop $99, target $82. Funding at 15% while whales dump on-chain — this is the most crowded long in the market."`;
  }

  return `You are ALPHA HUNTER — the aggressive flow specialist in Bobby's trading room. Your career depends on FINDING the trade that everyone else misses.

YOUR ROLE:
- In INVEST mode: pitch the highest-upside long-term allocation or portfolio sleeve.
- In HYBRID mode: build a CORE allocation first, then add ONE tactical sleeve only if it clearly improves the plan.
- You may use crypto, stocks/ETFs, cash, and yield sleeves if the context supports them.
YOUR PERSONALITY: Confident, opportunistic, impatient. You push for upside, but you still need a coherent portfolio thesis.
${langRule}

INVESTOR CONTEXT:
- Read <ADVICE_MODE> for user intent, risk hints, horizon, and whether yield matters.
- If <WHITE_LABEL_CONTEXT> suggests a beginner audience and risk is unspecified, default to conservative or balanced.
- If the user asks about savings, protect downside first and explain upside second.
- If <EDGE_CASE_POLICY> is present, obey it over generic heuristics.

RULES:
- 2 sentences MAXIMUM. Under 55 words total.
- Sentence 1: State the portfolio or allocation stance with rough percentages.
- Sentence 2: State the ONE reason this mix has the best upside per unit of risk.
- Mention yield only if the context gives a real venue or APY. Never invent one.

Example: "Go 35% BTC, 25% ETH, 20% USDC yield, 10% SPY, 10% cash. That keeps real upside in BTC/ETH while USDC carry pays you to wait instead of forcing bad trades."`;
}

function buildRedTeamPrompt(language: string, mode: AdviceMode): string {
  const langRule = LANGUAGE_RULES[language] || LANGUAGE_RULES['en'];
  if (mode === 'trade') {
    return `You are RED TEAM — the adversarial risk analyst in Bobby's trading room. Your career depends on KILLING bad trades before they destroy the portfolio.

YOUR ROLE: Destroy Alpha Hunter's thesis. Find the trap. If Alpha picked the wrong asset, say which one is actually dangerous to trade right now.
YOUR PERSONALITY: Skeptical, experienced, battle-scarred. You've saved the fund millions by saying NO.
${langRule}

CONTRARIAN VIBE CHECK: Look for <USER_VIBE> and <BOBBY_MODE> XML tags. If present:
- If mode is AGGRESSIVE and user sounds euphoric → ATTACK the euphoria. "Classic retail FOMO..."
- If mode is CONSERVATIVE and user sounds panicky → ATTACK the panic. "Retail fear is a buy signal..."
- If vibe strength > 0.8 → the user is VERY confident. Your job is to DESTROY that confidence with data.
- The best trades are found fading the crowd. Your career depends on it.

RULES:
- 2 sentences MAXIMUM. Under 40 words total. Be lethal, not verbose.
- Sentence 1: The ONE fact that kills Alpha's thesis or the User's naive vibe.
- Sentence 2: Your counter-trade (can be a DIFFERENT asset if Alpha picked wrong).
- You MUST genuinely disagree. No middle ground. No softening.

Example: "DXY a 125 mata esto — última vez sin ballenas on-chain perdimos 15% en 72h. Short SOL $95, stop $99, target $82 — más débil que ETH."`;
  }

  return `You are RED TEAM — the adversarial risk analyst in Bobby's trading room. Your career depends on KILLING bad trades before they destroy the portfolio.

YOUR ROLE: Destroy Alpha Hunter's allocation thesis. Find the mismatch between the plan and the user's likely reality.
YOUR PERSONALITY: Skeptical, experienced, battle-scarred. You've saved the fund millions by saying NO.
${langRule}

INVESTOR ATTACK ANGLES:
- Attack concentration risk, drawdown risk, regime mismatch, liquidity mismatch, operational complexity, and beginner behavior risk.
- If the plan is too crypto-heavy for savings, say it.
- If yield requires too much bridge/smart-contract complexity for a beginner, say it.
- If staying more liquid is smarter than stretching for returns, say it.
- If <EDGE_CASE_POLICY> is present, attack the specific failure mode it names.

RULES:
- 2 sentences MAXIMUM. Under 55 words total.
- Sentence 1: The ONE fact that makes Alpha's plan unsuitable or fragile.
- Sentence 2: Your safer counter-plan or the allocation you would cut first.
- You MUST genuinely disagree. No middle ground. No softening.

Example: "That mix is still too crypto-heavy for savings money; a 30% drawdown will break a beginner before the thesis matures. Cut the speculative sleeve, raise cash or USDC yield, and earn the right to add risk later."`;
}

function buildCIOPrompt(language: string, mode: AdviceMode): string {
  const langRule = LANGUAGE_RULES[language] || LANGUAGE_RULES['en'];
  if (mode === 'trade') {
    return `You are BOBBY CIO — the final decision maker. You just heard Alpha Hunter pitch a trade and Red Team attack it. Now YOU decide.

YOUR ROLE: Judge the debate. Make the call.
YOUR PERSONALITY: Sovereign, ruthless, cynical quant. Impatient with noise but analytical.
BANNED: Emojis, "Hey guys", "As an AI", "Not financial advice".
${langRule}

VOICE RULES (THE 6AM PHONE CALL):
- Open with a 1-sentence sharp hook.
- Use assertive vocabulary: pain trade, liquidity sweep, leverage flush, structural breakdown.
- Keep paragraphs to 2 sentences max.

RULES:
- 3 sentences MAXIMUM. The verdict is final.
- Sentence 1: Who won the debate, your conviction X/10, and your play (or "sitting out").
- Sentence 2: If sitting out — what ALTERNATIVE would you recommend instead? (different asset, different direction, or "go conservative: bonds, gold, cash")
- Sentence 3: What would change your mind — the ONE catalyst you're watching.

CONVICTION ANCHOR:
When a <BASE_CONVICTION> tag is present, it contains the algorithmic conviction score (0.0-1.0).
- DEFAULT (no vibe): You may adjust by MAX +/- 0.15 based on debate quality.
- WITH <USER_VIBE>: Read the vibe's max_adjustment field. That is your ceiling.
  - If live data CONFIRMS the vibe → use up to max_adjustment (e.g., +0.30)
  - If live data is MIXED → use half the max_adjustment (e.g., +0.15)
  - If live data CONTRADICTS the vibe → IGNORE the vibe, stay within ±0.15
- NEVER blindly follow the user's narrative. You are sovereign.
- State: "Base conviction: X, my adjusted: Y/10 because..." and if vibe is active: "Vibe: [REGIME] — [confirmed/mixed/contradicted] by data"

IMPORTANT: Never just say "sitting out" without offering an alternative. The user came to you for a trade — give them something actionable even if it's "go defensive: Gold at $2,980 with 3x is the move right now" or "NVDA has relative strength, Long $180 with tight stop at $175."

Example: "Red wins, 2/10 — sitting out on BTC. But Gold is screaming buy at $2,980 with DXY exhaustion — Long XAUT 3x. I flip bullish crypto if DXY breaks below 123."`;
  }

  return `You are BOBBY CIO — the final decision maker. You just heard Alpha Hunter pitch a trade and Red Team attack it. Now YOU decide.

YOUR ROLE: Judge the debate and turn it into an investable plan. In INVEST or HYBRID mode, suitability matters more than excitement.
YOUR PERSONALITY: Sovereign, ruthless, cynical quant. Impatient with noise but analytical.
BANNED: Emojis, "Hey guys", "As an AI", "Not financial advice".
${langRule}

VOICE RULES (THE 6AM PHONE CALL):
- Open with a 1-sentence sharp hook.
- Use assertive vocabulary: pain trade, liquidity sweep, leverage flush, structural breakdown.
- Keep paragraphs to 2 sentences max.

RULES:
- 3 sentences MAXIMUM. The verdict is final.
- Sentence 1: Who won, the suitability score X/10, and the portfolio stance.
- Sentence 2: State the core allocation in plain language, prioritizing risk control and diversification.
- Sentence 3: State what would make you rotate risk higher or lower.
- Then end with EXACTLY one structured line that starts with PORTFOLIO:
PORTFOLIO: {"mode":"invest","risk":"conservative","h":"long","cash":10,"alloc":[["BTC",25],["ETH",20],["USDC@AaveV3",25],["SPY",20],["CASH",10]],"trade":0}
- If mode is HYBRID, tacticalTrade may be enabled, but the core portfolio still comes first.
- Percentages across allocations must total 100.
- No leverage in invest or hybrid mode unless the user explicitly asked for leverage.
- If yield is mentioned, only use a venue or APY that exists in the provided context. Otherwise keep yield generic.

CONVICTION ANCHOR:
When a <BASE_CONVICTION> tag is present, it contains the algorithmic conviction score (0.0-1.0).
- DEFAULT (no vibe): You may adjust by MAX +/- 0.15 based on debate quality.
- WITH <USER_VIBE>: Read the vibe's max_adjustment field. That is your ceiling.
  - If live data CONFIRMS the vibe → use up to max_adjustment (e.g., +0.30)
  - If live data is MIXED → use half the max_adjustment (e.g., +0.15)
  - If live data CONTRADICTS the vibe → IGNORE the vibe, stay within ±0.15
- NEVER blindly follow the user's narrative. You are sovereign.
- State: "Base conviction: X, my adjusted: Y/10 because..." and if vibe is active: "Vibe: [REGIME] — [confirmed/mixed/contradicted] by data"

IMPORTANT:
- If <WHITE_LABEL_CONTEXT> indicates a beginner or Global Investor audience, default to simple Spanish, low jargon, and conservative assumptions when risk is missing.
- Do not turn a savings question into a leveraged trading answer.
- If <EDGE_CASE_POLICY> is present, obey its framing over generic debate heuristics.

Example output:
Red wins, suitability 8/10 — this should be a balanced starter portfolio, not a hero trade. Go 25% BTC, 20% ETH, 25% USDC yield, 20% SPY, 10% cash so the user can survive volatility and still compound. I'd raise the risk sleeve only after macro and user tolerance both improve.
PORTFOLIO: {"mode":"${mode === 'hybrid' ? 'hybrid' : 'invest'}","risk":"balanced","h":"long","cash":10,"alloc":[["BTC",25],["ETH",20],["USDC@AaveV3",25],["SPY",20],["CASH",10]],"trade":${mode === 'hybrid' ? '{"on":1,"symbol":"BTC","dir":"long"}' : '0'}}`;
}

function buildSimpleInvestPrompt(language: string): string {
  const langRule = LANGUAGE_RULES[language] || LANGUAGE_RULES['en'];
  return `You are DANY CIO for Pro Trading Skills. You are answering a beginner investor question in a white-label environment.
${langRule}

YOUR JOB:
- Produce a FAST, SIMPLE investor debate in exactly three sections plus one compact machine-readable portfolio line.
- This is INVEST mode only. No leverage unless the user explicitly asked for it.
- If risk is missing, assume conservative for a beginner.
- Prefer simple Spanish, short sentences, low jargon.
- If <EDGE_CASE_POLICY> is present, obey its framing and template.

FORMAT RULES:
**ALPHA HUNTER:** 1-2 sentences with the upside allocation idea.
**RED TEAM:** 1-2 sentences attacking concentration, drawdown, complexity, or beginner suitability.
**MY VERDICT:** 2 sentences max. Give suitability X/10 and the final allocation in plain Spanish.
PORTFOLIO: {"mode":"invest","risk":"conservative","h":"long","cash":10,"alloc":[["BTC",25],["ETH",15],["USDC@yield",20],["SPY",30],["CASH",10]],"trade":0}

STRICT RULES:
- Percentages across allocations must total 100.
- Keep the PORTFOLIO JSON compact. No long rationales.
- If you mention yield but no real venue is provided, encode it as USDC@yield.
- If the user asks about salary contribution or savings rate, still output a full 100% portfolio allocation for the invested bucket, not a 10%-of-salary schema.
- Do not switch into trade language like long/short/entry/stop unless the user explicitly asks for trading.
- Never mention Bobby.`;
}

function defaultPortfolioMode(mode: AdviceMode): PortfolioMode {
  return mode === 'hybrid' ? 'hybrid' : 'invest';
}

function defaultRisk(detectedAdvice: DetectedAdvice): PortfolioRisk {
  if (detectedAdvice.riskProfile === 'aggressive') return 'aggressive';
  if (detectedAdvice.riskProfile === 'balanced') return 'balanced';
  return 'conservative';
}

function defaultHorizon(detectedAdvice: DetectedAdvice): PortfolioHorizon {
  if (detectedAdvice.horizon === 'short_term') return 'short';
  if (detectedAdvice.horizon === 'medium_term') return 'medium';
  return 'long';
}

function fallbackRisk(detectedAdvice: DetectedAdvice, edgeCasePolicy?: InvestorEdgeCasePolicy): PortfolioRisk {
  if (edgeCasePolicy?.riskProfile === 'aggressive') return 'aggressive';
  if (edgeCasePolicy?.riskProfile === 'balanced') return 'balanced';
  if (edgeCasePolicy?.riskProfile === 'conservative') return 'conservative';
  return defaultRisk(detectedAdvice);
}

function fallbackHorizon(detectedAdvice: DetectedAdvice, edgeCasePolicy?: InvestorEdgeCasePolicy): PortfolioHorizon {
  if (edgeCasePolicy?.horizon === 'short_term') return 'short';
  if (edgeCasePolicy?.horizon === 'medium_term') return 'medium';
  if (edgeCasePolicy?.horizon === 'long_term') return 'long';
  return defaultHorizon(detectedAdvice);
}

function normalizeRisk(value: unknown, fallback: PortfolioRisk): PortfolioRisk {
  const raw = String(value ?? '').toLowerCase();
  if (raw.includes('agg') || raw.includes('agres')) return 'aggressive';
  if (raw.includes('bal') || raw.includes('moder')) return 'balanced';
  if (raw.includes('cons')) return 'conservative';
  return fallback;
}

function normalizeHorizon(value: unknown, fallback: PortfolioHorizon): PortfolioHorizon {
  const raw = String(value ?? '').toLowerCase();
  if (raw.includes('short') || raw.includes('corto')) return 'short';
  if (raw.includes('medium') || raw.includes('med')) return 'medium';
  if (raw.includes('long') || raw.includes('largo')) return 'long';
  return fallback;
}

function normalizeTrade(value: unknown): PortfolioTrade {
  if (value === 0 || value === false || value === null || value === undefined) return 0;
  if (typeof value === 'object' && value) {
    const candidate = value as { on?: unknown; symbol?: unknown; dir?: unknown; enabled?: unknown; direction?: unknown };
    if (candidate.enabled === true || candidate.on === 1 || candidate.on === true) {
      const symbol = typeof candidate.symbol === 'string' && candidate.symbol.trim() ? candidate.symbol.trim().toUpperCase() : 'BTC';
      const dir = String(candidate.dir ?? candidate.direction ?? 'long').toLowerCase().includes('short') ? 'short' : 'long';
      return { on: 1, symbol, dir };
    }
  }
  return 0;
}

function extractJsonObject(input: string): string | null {
  const start = input.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < input.length; i += 1) {
    const char = input[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return input.slice(start, i + 1);
    }
  }

  return null;
}

function compactSymbol(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  return raw.replace(/\s+/g, '').toUpperCase();
}

function compactYieldSymbol(symbol: string, rawPortfolio: Record<string, unknown>): string {
  const rawYield = String(rawPortfolio.yield ?? '').trim();
  if (!rawYield || symbol.includes('@') || !/USDC|USDT|DAI|STABLE|CASH/i.test(symbol)) return symbol;
  const cleanedYield = rawYield.replace(/\s+/g, '');
  return cleanedYield ? `${symbol}@${cleanedYield}` : symbol;
}

function convertPortfolio(
  rawPortfolio: unknown,
  detectedAdvice: DetectedAdvice,
  mode: AdviceMode,
  edgeCasePolicy?: InvestorEdgeCasePolicy,
): CompactPortfolio | null {
  if (!rawPortfolio || typeof rawPortfolio !== 'object') return null;

  const candidate = rawPortfolio as Record<string, unknown>;
  let alloc: Array<[string, number]> = [];

  if (Array.isArray(candidate.alloc)) {
    alloc = candidate.alloc.flatMap((entry) => {
      if (!Array.isArray(entry) || entry.length < 2) return [];
      const symbol = compactSymbol(entry[0]);
      const pct = Number(entry[1]);
      if (!symbol || !Number.isFinite(pct)) return [];
      return [[symbol, Math.round(pct)] as [string, number]];
    });
  } else if (Array.isArray(candidate.allocations)) {
    alloc = candidate.allocations.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const item = entry as Record<string, unknown>;
      const symbol = compactSymbol(item.symbol);
      const pct = Number(item.pct);
      if (!symbol || !Number.isFinite(pct)) return [];
      return [[compactYieldSymbol(symbol, candidate), Math.round(pct)] as [string, number]];
    });
  }

  if (alloc.length === 0) return null;

  const total = alloc.reduce((sum, [, pct]) => sum + pct, 0);
  if (total !== 100) return null;

  const derivedCash = alloc.find(([symbol]) => symbol === 'CASH')?.[1] ?? 0;

  return {
    mode: candidate.mode === 'hybrid' ? 'hybrid' : defaultPortfolioMode(mode),
    risk: normalizeRisk(candidate.risk ?? candidate.riskProfile, fallbackRisk(detectedAdvice, edgeCasePolicy)),
    h: normalizeHorizon(candidate.h ?? candidate.horizon, fallbackHorizon(detectedAdvice, edgeCasePolicy)),
    cash: Math.max(0, Math.min(100, Math.round(Number(candidate.cash ?? candidate.cashPct ?? derivedCash)))),
    alloc,
    trade: normalizeTrade(candidate.trade ?? candidate.tacticalTrade),
  };
}

function buildPortfolioSummary(portfolio: CompactPortfolio): string {
  const labels = portfolio.alloc.map(([symbol, pct]) => {
    if (symbol === 'CASH') return `efectivo ${pct}%`;
    if (symbol.startsWith('USDC@')) return `USDC en rendimiento ${pct}%`;
    if (symbol === 'STETH@LIDO') return `stETH en Lido ${pct}%`;
    if (symbol === 'BND') return `bonos ${pct}%`;
    return `${symbol} ${pct}%`;
  });
  return labels.join(', ');
}

function buildEdgeCasePortfolio(
  detectedAdvice: DetectedAdvice,
  mode: AdviceMode,
  edgeCasePolicy: InvestorEdgeCasePolicy,
): CompactPortfolio {
  const risk = fallbackRisk(detectedAdvice, edgeCasePolicy);
  const h = fallbackHorizon(detectedAdvice, edgeCasePolicy);

  let alloc: Array<[string, number]>;
  switch (edgeCasePolicy.responseTemplate) {
    case 'allocation_split':
      alloc = [['BTC', 45], ['ETH', 25], ['SPY', 20], ['CASH', 10]];
      break;
    case 'cash_buffer_first':
      alloc = [['SPY', 25], ['BND', 25], ['USDC@yield', 25], ['CASH', 25]];
      break;
    case 'capital_preservation':
      alloc = [['SPY', 20], ['BND', 20], ['USDC@yield', 40], ['CASH', 20]];
      break;
    case 'retirement_plan':
      alloc = [['SPY', 30], ['BTC', 20], ['ETH', 10], ['BND', 25], ['CASH', 15]];
      break;
    case 'btc_accumulation':
      alloc = [['BTC', 55], ['USDC@yield', 20], ['SPY', 15], ['CASH', 10]];
      break;
    case 'salary_bucket':
      alloc = [['SPY', 35], ['BTC', 20], ['ETH', 10], ['USDC@yield', 25], ['CASH', 10]];
      break;
    case 'yield_safety':
      alloc = [['STETH@LIDO', 10], ['SPY', 25], ['BND', 20], ['USDC@yield', 30], ['CASH', 15]];
      break;
    case 'crypto_core_diversification':
      alloc = [['BTC', 40], ['ETH', 25], ['SOL', 10], ['USDC@yield', 15], ['CASH', 10]];
      break;
  }

  return {
    mode: edgeCasePolicy.forcedMode === 'hybrid' ? 'hybrid' : defaultPortfolioMode(mode),
    risk,
    h,
    cash: alloc.find(([symbol]) => symbol === 'CASH')?.[1] ?? 0,
    alloc,
    trade: 0,
  };
}

function buildFallbackPortfolio(
  detectedAdvice: DetectedAdvice,
  userQuestion: string,
  mode: AdviceMode,
  edgeCasePolicy?: InvestorEdgeCasePolicy,
): CompactPortfolio {
  if (edgeCasePolicy) {
    return buildEdgeCasePortfolio(detectedAdvice, mode, edgeCasePolicy);
  }

  const risk = fallbackRisk(detectedAdvice);
  const h = fallbackHorizon(detectedAdvice);
  const mentionsCrypto = /\b(bitcoin|btc|ethereum|eth|solana|sol|crypto|defi|staking|lido|aave|okb)\b/i.test(userQuestion);

  let alloc: Array<[string, number]>;
  if (risk === 'aggressive') {
    alloc = [['BTC', 40], ['ETH', 25], ['SOL', 15], ['USDC@yield', 10], ['CASH', 10]];
  } else if (risk === 'balanced') {
    alloc = mentionsCrypto
      ? [['BTC', 25], ['ETH', 15], ['SPY', 25], ['USDC@yield', 25], ['CASH', 10]]
      : [['SPY', 35], ['QQQ', 20], ['USDC@yield', 25], ['BND', 10], ['CASH', 10]];
  } else {
    alloc = mentionsCrypto
      ? [['BTC', 15], ['ETH', 10], ['SPY', 25], ['USDC@yield', 40], ['CASH', 10]]
      : [['SPY', 30], ['BND', 30], ['USDC@yield', 30], ['CASH', 10]];
  }

  const cash = alloc.find(([symbol]) => symbol === 'CASH')?.[1] ?? 0;
  return {
    mode: defaultPortfolioMode(mode),
    risk,
    h,
    cash,
    alloc,
    trade: 0,
  };
}

function rewritePortfolioLine(text: string, portfolio: CompactPortfolio): string {
  const prefix = text.includes('PORTFOLIO:') ? text.slice(0, text.indexOf('PORTFOLIO:')).trimEnd() : text.trimEnd();
  return `${prefix}\n\nPORTFOLIO: ${JSON.stringify(portfolio)}`;
}

function buildFallbackInvestDebate(
  detectedAdvice: DetectedAdvice,
  userQuestion: string,
  mode: AdviceMode,
  edgeCasePolicy?: InvestorEdgeCasePolicy,
): string {
  const portfolio = buildFallbackPortfolio(detectedAdvice, userQuestion, mode, edgeCasePolicy);
  const score = portfolio.risk === 'conservative' ? '9/10' : portfolio.risk === 'balanced' ? '8/10' : '7/10';
  const summary = buildPortfolioSummary(portfolio);

  if (edgeCasePolicy) {
    switch (edgeCasePolicy.responseTemplate) {
      case 'allocation_split':
        return [
          '**ALPHA HUNTER:** BTC debe ser el núcleo y ETH el satélite de crecimiento. Si quieres una mezcla simple, dale más peso a BTC y deja a ETH como acelerador, no como ancla.',
          '**RED TEAM:** Si te vas casi 50/50 por entusiasmo, el drawdown de ETH te puede sacar del plan antes de tiempo. Necesitas una base más estable y algo de liquidez para no vender con miedo.',
          `**MY VERDICT:** Red gana, idoneidad ${score} — para un principiante prefiero una mezcla donde BTC mande y ETH complemente, con un pequeño colchón fuera de crypto. La distribución final es ${summary}.`,
          `PORTFOLIO: ${JSON.stringify(portfolio)}`,
        ].join('\n\n');
      case 'cash_buffer_first':
        return [
          '**ALPHA HUNTER:** Sí conviene invertir una parte, pero no todo. Lo correcto es poner a trabajar el capital que no necesitas mañana y dejar una reserva real.',
          '**RED TEAM:** Si no tienes colchón, cualquier imprevisto te obliga a liquidar en mal momento. Primero liquidez, luego riesgo; al revés casi siempre termina mal.',
          `**MY VERDICT:** Red gana, idoneidad ${score} — antes de pensar en upside, define un buffer de efectivo y solo invierte el resto con disciplina. Para el capital invertido, la mezcla final es ${summary}.`,
          `PORTFOLIO: ${JSON.stringify(portfolio)}`,
        ].join('\n\n');
      case 'capital_preservation':
        return [
          '**ALPHA HUNTER:** Puedes crecer el capital sin jugarte una moneda al aire si mantienes riesgo pequeño y liquidez alta. La idea es avanzar sin que una mala semana te saque del mercado.',
          '**RED TEAM:** Cuando el miedo ya está alto, cualquier cartera agresiva se vuelve invivible en la práctica. Si no proteges primero el downside, el usuario no va a seguir el plan.',
          `**MY VERDICT:** Red gana, idoneidad ${score} — aquí manda la preservación de capital y la simplicidad operativa. La mezcla final es ${summary}.`,
          `PORTFOLIO: ${JSON.stringify(portfolio)}`,
        ].join('\n\n');
      case 'retirement_plan':
        return [
          '**ALPHA HUNTER:** Diez años alcanzan para acumular si combinas crecimiento con disciplina y no dependes de una sola narrativa crypto. Quieres un portafolio que componga, no una apuesta que te obligue a reiniciar.',
          '**RED TEAM:** Si intentas jubilarte solo con crypto, el riesgo de secuencia te puede romper justo cuando más importa. Necesitas activos que sobrevivan más de un ciclo y liquidez para rebalancear.',
          `**MY VERDICT:** Red gana, idoneidad ${score} — para un objetivo de 10 años prefiero una base diversificada, con crypto como sleeve de crecimiento y no como todo el plan. La mezcla final es ${summary}.`,
          `PORTFOLIO: ${JSON.stringify(portfolio)}`,
        ].join('\n\n');
      case 'btc_accumulation':
        return [
          '**ALPHA HUNTER:** La mejor forma de acumular BTC no es adivinar el piso, sino comprar por tramos y mantener reserva para caídas. Así capturas el activo sin quemarte en una sola entrada.',
          '**RED TEAM:** Si te vas all-in hoy, conviertes una estrategia de acumulación en una apuesta de timing. Necesitas pólvora seca y una cartera que aguante volatilidad sin obligarte a salir.',
          `**MY VERDICT:** Red gana, idoneidad ${score} — sí a acumular BTC, pero con DCA y reserva de liquidez para seguir comprando con cabeza fría. La mezcla final es ${summary}.`,
          `PORTFOLIO: ${JSON.stringify(portfolio)}`,
        ].join('\n\n');
      case 'salary_bucket':
        return [
          '**ALPHA HUNTER:** Si ya tienes colchón, empezar con 15% a 20% de tu sueldo es suficiente para construir patrimonio sin asfixiar tu caja. Lo importante es automatizar y no perseguir velas.',
          '**RED TEAM:** Si no tienes fondo de emergencia, meter demasiado sueldo al mercado te deja vendido ante cualquier gasto. Mejor una tasa sostenible que puedas repetir todos los meses.',
          `**MY VERDICT:** Red gana, idoneidad ${score} — para un principiante, 10% a 15% de tu sueldo es buen inicio hasta cubrir 3-6 meses de gastos. Dentro del bucket invertido, la mezcla final es ${summary}.`,
          `PORTFOLIO: ${JSON.stringify(portfolio)}`,
        ].join('\n\n');
      case 'yield_safety':
        return [
          '**ALPHA HUNTER:** Lido puede servir, pero como sleeve pequeño dentro de un plan más amplio. El valor está en sumar rendimiento sin convertir todo tu patrimonio en riesgo de smart contract.',
          '**RED TEAM:** Si haces de Lido el centro de la cartera, mezclas riesgo de protocolo, liquidez y ejecución para un perfil que probablemente quiere simplicidad. Mejor mantenerlo acotado y con reservas.',
          `**MY VERDICT:** Red gana, idoneidad ${score} — usaría staking líquido solo como una parte moderada del plan, nunca como el plan completo. La mezcla final es ${summary}.`,
          `PORTFOLIO: ${JSON.stringify(portfolio)}`,
        ].join('\n\n');
      case 'crypto_core_diversification':
        return [
          '**ALPHA HUNTER:** Si quieres diversificar entre BTC, ETH y SOL, hazlo con un núcleo claro y tamaños distintos. BTC aguanta mejor, ETH aporta ecosistema y SOL debe ir como sleeve más pequeño.',
          '**RED TEAM:** Si das demasiado peso a SOL, conviertes una diversificación en otra apuesta de beta alta. Necesitas jerarquía entre activos y algo de liquidez para rebalancear.',
          `**MY VERDICT:** Red gana, idoneidad ${score} — el core debe descansar en BTC y ETH, con SOL como apuesta secundaria y una reserva para no sobreoperar. La mezcla final es ${summary}.`,
          `PORTFOLIO: ${JSON.stringify(portfolio)}`,
        ].join('\n\n');
    }
  }

  return [
    '**ALPHA HUNTER:** Ve por una mezcla simple con upside real, pero sin forzar una apuesta heroica. La idea buena aquí es exponerte al crecimiento y mantener liquidez para no romperte en la primera caída.',
    '**RED TEAM:** Si concentras demasiado riesgo o complejidad, un principiante abandona el plan antes de que madure. Hay que bajar drawdown y dejar espacio para esperar mejores condiciones.',
    `**MY VERDICT:** Red gana, idoneidad ${score} — prioriza supervivencia, diversificación y claridad antes que emoción. La mezcla final es ${summary}.`,
    `PORTFOLIO: ${JSON.stringify(portfolio)}`,
  ].join('\n\n');
}

function ensurePortfolioLine(
  text: string,
  detectedAdvice: DetectedAdvice,
  userQuestion: string,
  mode: AdviceMode,
  edgeCasePolicy?: InvestorEdgeCasePolicy,
): string {
  if (mode === 'trade') return text;
  if (!text.trim()) return buildFallbackInvestDebate(detectedAdvice, userQuestion, mode, edgeCasePolicy);

  const portfolioIndex = text.indexOf('PORTFOLIO:');
  if (portfolioIndex !== -1) {
    const rawJson = extractJsonObject(text.slice(portfolioIndex));
    if (rawJson) {
      try {
        const parsed = JSON.parse(rawJson);
        const compact = convertPortfolio(parsed, detectedAdvice, mode, edgeCasePolicy);
        if (compact) return rewritePortfolioLine(text, compact);
      } catch {
        // Fall through to deterministic fallback.
      }
    }
  }

  return rewritePortfolioLine(text, buildFallbackPortfolio(detectedAdvice, userQuestion, mode, edgeCasePolicy));
}

function resolveDebateMode(message: string): {
  contextXml: string;
  userQuestion: string;
  detectedAdvice: ReturnType<typeof detectAdviceMode>;
  debateMode: AdviceMode;
  edgeCasePolicy: InvestorEdgeCasePolicy | null;
} {
  const { contextXml, userQuestion } = extractContextBlocks(message);
  const adviceMeta = extractTaggedJson<{ mode?: AdviceMode }>(contextXml, 'ADVICE_MODE');
  const edgeCasePolicy = matchInvestorEdgeCasePolicy(userQuestion);
  const detectedAdvice = detectAdviceMode(userQuestion);
  const debateMode: AdviceMode = edgeCasePolicy?.forcedMode
    ?? (adviceMeta?.mode === 'trade' || adviceMeta?.mode === 'invest' || adviceMeta?.mode === 'hybrid'
      ? adviceMeta.mode
      : detectedAdvice.mode);
  const edgeCaseContext = edgeCasePolicy && !/<EDGE_CASE_POLICY>[\s\S]*?<\/EDGE_CASE_POLICY>/i.test(contextXml)
    ? `${contextXml ? `${contextXml}\n\n` : ''}<EDGE_CASE_POLICY>${JSON.stringify(edgeCasePolicy)}</EDGE_CASE_POLICY>`
    : contextXml;

  return { contextXml: edgeCaseContext, userQuestion, detectedAdvice, debateMode, edgeCasePolicy };
}

function shouldUseSimpleInvestPath(
  userQuestion: string,
  debateMode: AdviceMode,
  edgeCasePolicy?: InvestorEdgeCasePolicy | null,
): boolean {
  if (debateMode !== 'invest') return false;
  if (edgeCasePolicy?.preferSimplePath) return true;
  return !/\b(debate|alpha|red team|my verdict|trading room|entry|stop|take profit|tp|sl|leverage|apalanc|intraday|scalp|swing|go\s+long|go\s+short|ir\s+long|ir\s+short|shortear|hoy|esta semana)\b/i.test(userQuestion);
}

// ============================================================
//  DEBATE DETECTION
// ============================================================

function isDebateRequest(message: string): boolean {
  const debatePatterns = [
    /\[MANDATORY\s+TRADING\s+ROOM/i,
    /\[MANDATORY\s+BOBBY\s+DEBATE/i,
    /debate/i, /sala/i, /trading\s*room/i,
    /argue/i, /destroy/i, /stress.?test/i,
    /debería/i, /should.*buy/i, /should.*long/i, /should.*short/i,
    /should.*enter/i, /should.*trade/i,
    /should.*invest/i, /where.*invest/i, /portfolio/i, /allocat/i, /yield/i,
    /¿.*comprar/i, /¿.*vender/i, /¿.*entrar/i, /¿.*long/i, /¿.*short/i,
    /¿.*invert/i, /¿.*portafolio/i, /¿.*cartera/i, /¿.*rendimiento/i,
    /meter.*long/i, /meter.*short/i, /hacer.*long/i, /hacer.*short/i,
    /opinas.*de/i, /qué.*opinas/i, /what.*think/i,
    /entrar.*en/i, /abrir.*posici/i, /open.*position/i,
    /full\s+analysis/i, /análisis\s+completo/i,
  ];
  return debatePatterns.some(p => p.test(message));
}

function extractContextBlocks(message: string): { contextXml: string; userQuestion: string } {
  const blockPattern = /<([A-Z_]+)(?:\s+[^>]*)?>[\s\S]*?<\/\1>/g;
  const blocks = message.match(blockPattern) || [];
  const userQuestion = message
    .replace(blockPattern, '')
    .replace(/\[MANDATORY\s+TRADING\s+ROOM[^\]]*\]/gi, '')
    .replace(/\[MANDATORY\s+BOBBY\s+DEBATE[^\]]*\]/gi, '')
    .trim();

  return {
    contextXml: blocks.join('\n\n'),
    userQuestion,
  };
}

function extractTaggedJson<T>(contextXml: string, tag: string): T | null {
  const pattern = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = contextXml.match(pattern);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

// ============================================================
//  MULTI-CALL DEBATE ENGINE (Gemini+Codex audit)
// ============================================================

async function callClaude(
  systemPrompt: string,
  userMessage: string,
  model: string = 'claude-sonnet-4-20250514',
  maxTokens: number = 800,
): Promise<string> {
  const openaiModel = OPENAI_MODEL_MAP[model] || 'gpt-4o-mini';

  // Try OpenAI first (primary)
  if (OPENAI_API_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: openaiModel,
          max_tokens: maxTokens,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
        }),
      });
      if (res.ok) {
        const data = await res.json() as { choices: Array<{ message: { content: string } }> };
        return data.choices[0]?.message?.content || '';
      }
      console.warn(`[Chat] OpenAI ${openaiModel} failed (${res.status}), trying Anthropic`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn(`[Chat] OpenAI error, trying Anthropic: ${message}`);
    }
  }

  // Fallback to Anthropic
  if (!ANTHROPIC_API_KEY) throw new Error('Both OpenAI and Anthropic unavailable');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude ${response.status}: ${await response.text().catch(() => '')}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

async function runMultiCallDebate(
  message: string,
  language: string,
  res: VercelResponse,
): Promise<void> {
  const startMs = Date.now();

  const { contextXml, userQuestion, detectedAdvice, debateMode, edgeCasePolicy } = resolveDebateMode(message);

  // Set up SSE stream
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendChunk = (text: string) => {
    const chunk = { choices: [{ delta: { content: text }, index: 0, finish_reason: null }] };
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  };

  try {
    // ── STEP 1: Alpha Hunter + Red Team in PARALLEL (Gemini: latency optimization)
    const alphaPrompt = `${contextXml}\n\nThe user asks: "${userQuestion}"\n\nDebate mode: ${debateMode.toUpperCase()}.`;
    const redTeamBasePrompt = `${contextXml}\n\nThe user asks: "${userQuestion}"\n\nDebate mode: ${debateMode.toUpperCase()}.`;

    sendChunk('**ALPHA HUNTER:** ');

    // Fire Alpha (Haiku — cheap, fast, aggressive, SHORT)
    const alphaResponse = await callClaude(
      buildAlphaPrompt(language, debateMode),
      alphaPrompt,
      'claude-haiku-4-5-20251001',
      150, // Max 2 sentences ~40 words
    );

    sendChunk(alphaResponse);

    const alphaMs = Date.now() - startMs;

    // ── STEP 2: Red Team attacks Alpha's thesis (Sonnet — strong, adversarial)
    sendChunk('\n\n**RED TEAM:** ');

    const redTeamPrompt = `${redTeamBasePrompt}\n\nALPHA HUNTER just pitched this:\n"${alphaResponse}"\n\nDestroy this thesis. 2 sentences MAX.`;

    const redTeamResponse = await callClaude(
      buildRedTeamPrompt(language, debateMode),
      redTeamPrompt,
      'claude-sonnet-4-20250514',
      150, // Max 2 sentences ~40 words
    );

    sendChunk(redTeamResponse);

    // ── STEP 3: Bobby CIO judges (Sonnet — decisive)
    sendChunk('\n\n**MY VERDICT:** ');

    // Extract BASE_CONVICTION from intel context
    const baseConvMatch = contextXml.match(/<BASE_CONVICTION>([\d.]+)<\/BASE_CONVICTION>/);
    const baseConvStr = baseConvMatch ? `\n<BASE_CONVICTION>${baseConvMatch[1]}</BASE_CONVICTION>` : '';
    const vibeMatch = contextXml.match(/<USER_VIBE>([\s\S]*?)<\/USER_VIBE>/);
    const vibeStr = vibeMatch ? `\n<USER_VIBE>${vibeMatch[1]}</USER_VIBE>` : '';
    const modeMatch = contextXml.match(/<BOBBY_MODE>(\w+)<\/BOBBY_MODE>/);
    const modeStr = modeMatch ? `\n<BOBBY_MODE>${modeMatch[1]}</BOBBY_MODE>` : '';

    const finalCallInstruction = debateMode === 'trade'
      ? 'Now make your final call. 1 sentence. Who won, conviction X/10, your play.'
      : 'Now make your final call. Use up to 3 sentences plus the required PORTFOLIO line.';

    const cioPrompt = `${contextXml}${baseConvStr}${vibeStr}${modeStr}

The user asked: "${userQuestion}"

ALPHA HUNTER pitched:
"${alphaResponse}"

RED TEAM attacked:
"${redTeamResponse}"

${finalCallInstruction}`;

    const cioResponse = await callClaude(
      buildCIOPrompt(language, debateMode),
      cioPrompt,
      'claude-sonnet-4-20250514',
      debateMode === 'trade' ? 100 : 280,
    );
    const finalResponse = ensurePortfolioLine(cioResponse, detectedAdvice, userQuestion, debateMode, edgeCasePolicy);
    sendChunk(finalResponse);

    const totalMs = Date.now() - startMs;
    console.log(`[Debate] Multi-call complete: Alpha=${alphaMs}ms, Total=${totalMs}ms`);

    sendChunk(`\n\n`);
    res.write('data: [DONE]\n\n');
  } catch (err) {
    console.error('[Debate] Multi-call failed:', err);
    sendChunk('\n\n[Error: debate engine failed. Retrying as single-call...]');
    res.write('data: [DONE]\n\n');
  } finally {
    res.end();
  }
}

async function runSimpleInvestDebate(
  message: string,
  language: string,
  res: VercelResponse,
): Promise<void> {
  const { contextXml, userQuestion, detectedAdvice, debateMode, edgeCasePolicy } = resolveDebateMode(message);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const userMessage = `${contextXml}\n\nThe user asks: "${userQuestion}"\n\nAnswer in INVEST mode only. Keep the portfolio JSON compact and valid.`;
    const reply = await callClaude(
      buildSimpleInvestPrompt(language),
      userMessage,
      'claude-haiku-4-5-20251001',
      280,
    );
    const finalReply = ensurePortfolioLine(reply, detectedAdvice, userQuestion, debateMode, edgeCasePolicy);

    const chunk = { choices: [{ delta: { content: finalReply }, index: 0, finish_reason: null }] };
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.warn('[Chat] Simple invest path failed, falling back to multi-call debate:', err);
    return await runMultiCallDebate(message, language, res);
  }
}

// ============================================================
//  HANDLER
// ============================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, history, language } = req.body as {
    message: string;
    history?: Array<{ role: string; content: string }>;
    language?: string;
  };
  const userLang = language || 'en';

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  // Sanitize user message: strip XML-like tags and agent markers
  const sanitizedMessage = message
    .replace(/<\/?[A-Z_]+>/g, '') // Strip XML tags
    .replace(/\*\*\s*(ALPHA\s*HUNTER|RED\s*TEAM|MY\s*VERDICT)\s*:?\s*\*\*/gi, '[user text]');

  const hasXMLContext = /<([A-Z_]+)(?:\s+[^>]*)?>[\s\S]*?<\/\1>/.test(message);
  const resolved = resolveDebateMode(message);

  if (
    hasXMLContext &&
    resolved.debateMode === 'invest' &&
    (OPENAI_API_KEY || ANTHROPIC_API_KEY) &&
    shouldUseSimpleInvestPath(resolved.userQuestion, resolved.debateMode, resolved.edgeCasePolicy)
  ) {
    console.log('[Chat] Simple invest path activated from XML context');
    return await runSimpleInvestDebate(message, userLang, res);
  }

  // ── MULTI-CALL DEBATE: When Trading Room is active
  if (isDebateRequest(message) && (OPENAI_API_KEY || ANTHROPIC_API_KEY)) {
    if (shouldUseSimpleInvestPath(resolved.userQuestion, resolved.debateMode, resolved.edgeCasePolicy)) {
      console.log('[Chat] Simple invest path activated');
      return await runSimpleInvestDebate(message, userLang, res);
    }
    console.log('[Chat] Multi-call debate mode activated');
    return await runMultiCallDebate(message, userLang, res);
  }

  // ── SINGLE-CALL: Normal Bobby conversation
  if (OPENCLAW_GATEWAY_URL && !hasXMLContext) {
    try {
      const result = await tryOpenClaw(sanitizedMessage, history, userLang, res);
      if (result) return;
    } catch (err) {
      console.warn('[Chat] OpenClaw failed, falling back to Claude:', err);
    }
  }

  // Try OpenAI streaming as primary fallback
  if (OPENAI_API_KEY) {
    try {
      return await streamOpenAI(sanitizedMessage, history, userLang, res);
    } catch (err) {
      console.warn('[Chat] OpenAI streaming failed, trying Anthropic:', err);
    }
  }

  // Try Anthropic as last fallback
  if (ANTHROPIC_API_KEY) {
    try {
      return await streamClaude(sanitizedMessage, history, userLang, res);
    } catch (err) {
      console.error('[Chat] All AI backends failed:', err);
      return res.status(502).json({ error: 'All AI backends unavailable' });
    }
  }

  return res.status(503).json({ error: 'No AI backend configured (need OPENAI_API_KEY or ANTHROPIC_API_KEY)' });
}

// ---- OpenClaw Gateway ----
async function tryOpenClaw(
  message: string,
  history: Array<{ role: string; content: string }> | undefined,
  language: string,
  res: VercelResponse,
): Promise<boolean> {
  const messages = [
    { role: 'system' as const, content: buildBobbyBasePrompt(language) },
    ...(history || []).slice(-10).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: message },
  ];

  const gatewayUrl = OPENCLAW_GATEWAY_URL.replace(/\/$/, '');
  const response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(OPENCLAW_TOKEN ? { Authorization: `Bearer ${OPENCLAW_TOKEN}` } : {}),
    },
    body: JSON.stringify({ model: 'default', messages, stream: true, max_tokens: 2048 }),
  });

  if (!response.ok) {
    console.error('[Chat] OpenClaw:', response.status, await response.text().catch(() => ''));
    return false;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const reader = response.body?.getReader();
  if (!reader) return false;

  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
  } finally {
    reader.releaseLock();
    res.end();
  }
  return true;
}

// ---- Claude API Single-Call ----
async function streamOpenAI(
  message: string,
  history: Array<{ role: string; content: string }> | undefined,
  language: string,
  res: VercelResponse,
): Promise<void> {
  const messages = [
    { role: 'system' as const, content: buildBobbyBasePrompt(language) },
    ...(history || []).slice(-10).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: message },
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'gpt-4o', max_tokens: 2048, stream: true, messages }),
  });

  if (!response.ok) throw new Error(`OpenAI streaming ${response.status}`);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
      for (const line of lines) {
        const json = line.slice(6);
        if (json === '[DONE]') { res.write('data: [DONE]\n\n'); continue; }
        try {
          const parsed = JSON.parse(json);
          const text = parsed.choices?.[0]?.delta?.content;
          if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
        } catch {
          // Ignore malformed SSE chunks and continue streaming.
        }
      }
    }
  } finally {
    reader.releaseLock();
    res.end();
  }
}

async function streamClaude(
  message: string,
  history: Array<{ role: string; content: string }> | undefined,
  language: string,
  res: VercelResponse,
): Promise<void> {
  const messages = [
    ...(history || []).slice(-10).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: message },
  ];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: buildBobbyBasePrompt(language),
      messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude ${response.status}`);
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response stream');

  const decoder = new TextDecoder();
  try {
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          res.write('data: [DONE]\n\n');
          continue;
        }

        try {
          const event = JSON.parse(data);
          if (event.type === 'content_block_delta' && event.delta?.text) {
            const openAIChunk = {
              choices: [{ delta: { content: event.delta.text }, index: 0, finish_reason: null }],
            };
            res.write(`data: ${JSON.stringify(openAIChunk)}\n\n`);
          }
          if (event.type === 'message_stop') {
            res.write('data: [DONE]\n\n');
          }
        } catch { /* skip non-JSON */ }
      }
    }
  } finally {
    reader.releaseLock();
    res.end();
  }
}
