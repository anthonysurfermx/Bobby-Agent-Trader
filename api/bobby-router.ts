// ============================================================
// POST /api/bobby-router — Hybrid intent classifier
// Layer 1: deterministic regex (free, instant)
// Layer 2: Haiku classifier (cheap, only for ambiguous)
// Returns: { intent, confidence, language, reason }
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 10 };

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

const VALID_INTENTS = [
  'greeting', 'identity', 'portfolio', 'price', 'chart',
  'market_data', 'analyze', 'trade_chat', 'onboarding',
  'safety', 'follow_up', 'help', 'off_topic',
] as const;

type Intent = typeof VALID_INTENTS[number];

interface RouterResult {
  intent: Intent;
  confidence: number;
  language: string;
  reason: string;
  source: 'regex' | 'haiku';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { message, context } = req.body as {
    message: string;
    context?: string; // last Bobby response for follow-up detection
  };

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message required' });
  }

  if (!OPENAI_API_KEY) {
    return res.status(200).json({
      intent: 'ambiguous',
      confidence: 0,
      language: 'en',
      reason: 'No API key — cannot classify',
      source: 'regex',
    });
  }

  try {
    const systemPrompt = `You are a trading platform intent classifier. Classify the user's message into exactly ONE intent.

INTENTS:
- greeting: hi, hello, thanks, bye, casual chat
- identity: who are you, what do you do
- portfolio: balance, positions, PnL, my account
- price: asking for a specific asset price (short query)
- chart: asking for technical analysis, charts, RSI, MACD, support/resistance
- market_data: funding rates, open interest, fear & greed, whale signals, Polymarket
- analyze: explicit request for full market analysis or debate
- trade_chat: opinion about a trade, should I buy/sell, market outlook, thesis, comparison
- onboarding: beginner question, "I'm new", "where do I start", small capital advice
- safety: is this safe, scam check, honeypot, rug pull
- follow_up: continuation of previous conversation (why?, and the stop?, explain more)
- help: what can you do, commands, capabilities
- off_topic: weather, sports, jokes, personal life, not related to trading/markets

EXAMPLES (from real traders):
"qué pasó con los mercados esta semana" → trade_chat (market recap)
"is this the bottom?" → trade_chat (direction question)
"wen moon" → trade_chat (crypto slang for bullish)
"funding rate de ETH?" → market_data (specific data request)
"muéstrame el chart de BTC" → chart (TA request)
"tengo 100 dólares qué hago" → onboarding (beginner)
"esto es scam?" → safety (risk check)
"por qué?" → follow_up (continuation)
"cuánto vale SOL" → price (price query)
"We're so back" → trade_chat (crypto sentiment)
"posible operación en Apple" → trade_chat (trade idea)
"se formó un máximo inferior tras la ruptura" → trade_chat (TA)
"el riesgo político es impredecible" → trade_chat (macro)
"cuéntame un chiste" → off_topic
"cómo está el clima" → off_topic

RULES:
- If it mentions markets, assets, crypto, stocks, or trading → it is NOT off_topic. But choose the MOST SPECIFIC intent (price, chart, market_data, safety) before defaulting to trade_chat.
- trade_chat is for opinions, theses, comparisons, and general market discussion — NOT for specific data requests.
- If it's in Spanish, still classify correctly
- "qué pasó con los mercados" = trade_chat
- "wen moon" = trade_chat
- "is this the bottom?" = trade_chat
- Short vague messages like "hmm", "ok", "..." = off_topic

Respond ONLY with JSON, no markdown:
{"intent":"trade_chat","confidence":0.95,"language":"es","reason":"market outlook question"}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 100,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: context
              ? `Previous Bobby response: "${context.slice(0, 200)}"\n\nUser message: "${message}"`
              : `User message: "${message}"`,
          },
        ],
      }),
    });

    if (!response.ok) {
      return res.status(200).json({
        intent: 'ambiguous' as Intent,
        confidence: 0,
        language: 'en',
        reason: 'OpenAI API error — cannot classify',
        source: 'regex',
      });
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const text = data.choices[0]?.message?.content || '';

    // Parse JSON response
    try {
      const result = JSON.parse(text);
      const intent = VALID_INTENTS.includes(result.intent) ? result.intent : 'ambiguous';
      const confidence = typeof result.confidence === 'number' ? Math.min(Math.max(result.confidence, 0), 1) : 0.5;

      // Low confidence → stay ambiguous, don't burn tokens guessing
      const finalIntent = confidence < 0.5 ? 'ambiguous' : intent;

      return res.status(200).json({
        intent: finalIntent,
        confidence,
        language: result.language || 'en',
        reason: result.reason || 'classified by Haiku',
        source: 'haiku',
      } as RouterResult);
    } catch {
      // JSON parse failed — extract intent from text
      const match = text.match(/"intent"\s*:\s*"(\w+)"/);
      const extracted = match?.[1] as Intent | undefined;
      return res.status(200).json({
        intent: extracted && VALID_INTENTS.includes(extracted) ? extracted : 'ambiguous',
        confidence: 0.4,
        language: 'en',
        reason: 'Haiku response parsed with fallback',
        source: 'haiku',
      });
    }
  } catch (error) {
    return res.status(200).json({
      intent: 'ambiguous' as Intent,
      confidence: 0,
      language: 'en',
      reason: 'Network error — cannot classify',
      source: 'regex',
    });
  }
}
