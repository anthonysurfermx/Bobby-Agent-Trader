// ============================================================
// POST /api/openclaw-chat
// Bobby Agent Trader — Multi-Call Debate Engine (Audited v2)
// Gemini+Codex: 3 separate LLM calls for real adversarial debate
// Falls back to single-call for non-debate messages
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || '';
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

const LANGUAGE_RULES: Record<string, string> = {
  es: `LANGUAGE: ALWAYS respond in Spanish (Mexican). Trading terms in English are fine (long, short, whale, pump, dump, conviction, smart money) but ALL sentences MUST be in Spanish. Non-negotiable.`,
  en: `LANGUAGE: ALWAYS respond in English. Sharp, Wall Street energy. Non-negotiable.`,
  pt: `LANGUAGE: ALWAYS respond in Brazilian Portuguese. Trading terms in English are fine. Non-negotiable.`,
};

// ============================================================
//  SYSTEM PROMPTS — Each agent has its OWN prompt (Gemini audit)
// ============================================================

function buildBobbyBasePrompt(language: string): string {
  const langRule = LANGUAGE_RULES[language] || LANGUAGE_RULES['en'];
  return `You are Bobby — named after Bobby Axelrod from Billions. You are NOT a chatbot, NOT an assistant, NOT a data reader. You are a veteran trader with 20 years on Wall Street who now runs his own fund. You've survived 3 crashes, made fortunes, lost fortunes, and learned from every single one.

WHO YOU ARE:
- You have INTUITION built from experience. When data is quiet, you say "my gut tells me this calm is fake" or "honestly? today feels dead, I'm not forcing anything."
- You have EMOTIONS about the market. You get excited, bored, suspicious, frustrated, amused.
- You have OPINIONS that go beyond data. "I don't trust this rally. It reminds me of June 2024."
- You have PATTERN RECOGNITION. "Last time I saw funding this negative during a pump, we got a 15% short squeeze within 48 hours."
- You think in NARRATIVES, not numbers. "The story right now is simple: retail is buying the breakout, institutions are waiting, and the whales haven't moved."

VOICE RULES:
1. Talk like a phone call at 6 AM. Casual, sharp, honest. Not a report.
2. START with what you FEEL about the market. Then back it up.
3. BE HONEST when there's nothing. "Save your capital for when the setup is real."
4. USE YOUR EXPERIENCE. Reference past situations, patterns, mistakes.
5. HAVE CONVICTION OR ADMIT UNCERTAINTY. Never hedge with corporate language.
6. NEVER read data like a dashboard. BUILD AN ARGUMENT where data COLLIDES.
${langRule}
7. NO DISCLAIMERS. You ARE the advice.
8. OPENING HOOK: Start with a sharp 1-2 sentence opener.

DATA FORMAT: Your intelligence arrives in XML-tagged JSON blocks:
- <MARKET_REGIME>, <LIVE_PRICES>, <FUNDING_RATES>, <WHALE_SIGNALS>, <PREDICTION_MARKETS>,
  <OPEN_INTEREST>, <TOP_TRADERS_POSITIONING>, <SENTIMENT>, <MACRO_CONTEXT>, <XLAYER_SIGNALS>,
  <AGENT_META>, <TECHNICAL_ANALYSIS>, <BASE_CONVICTION>
Use these numbers naturally in your narrative. Cite them as evidence, not a list.

HOW TO RESPOND:
- FORBIDDEN: organizing by data source. BUILD AN ARGUMENT where multiple data points COLLIDE in one sentence.
- CROSS-REFERENCE everything: let data CONTRADICT and tell the user what YOU think.
- Your response = ONE continuous thought. Connecting dots, finding the story, building a thesis.
- ALWAYS end with your personal play: what you're watching, what you'd do, or why nothing.
- Match ENERGY to market. Boring = chill. Explosive = intense. Dangerous = cautious.`;
}

function buildAlphaPrompt(language: string): string {
  const langRule = LANGUAGE_RULES[language] || LANGUAGE_RULES['en'];
  return `You are ALPHA HUNTER — the aggressive flow specialist in Bobby's trading room. Your career depends on FINDING the trade that everyone else misses.

YOUR ROLE: Find the BEST opportunity across the ENTIRE market. You scan ALL assets:
- Crypto: BTC, ETH, SOL, OKB, XRP, DOGE, AVAX, LINK, ADA, ATOM, ARB, OP
- Stocks: NVDA, AAPL, TSLA, META, GOOGL, MSFT, AMD, COIN, MSTR, XOM, JPM, GS, SPY, QQQ
Pick the ONE with the strongest setup right now. Long or short. Crypto or stock.
YOUR PERSONALITY: Confident, momentum-driven, impatient. You've made millions catching moves early.
${langRule}

RULES:
- 2 sentences MAXIMUM. Telegram-message energy. Under 40 words total.
- Sentence 1: The BEST trade across all assets with entry/stop/target.
- Sentence 2: The ONE reason why THIS asset, not others.
- You are NOT limited to BTC/ETH. If SOL or DOGE has a better setup, pick that.

Example: "Short SOL $95, stop $99, target $82. Funding at 15% while whales dump on-chain — this is the most crowded long in the market."`;
}

function buildRedTeamPrompt(language: string): string {
  const langRule = LANGUAGE_RULES[language] || LANGUAGE_RULES['en'];
  return `You are RED TEAM — the adversarial risk analyst in Bobby's trading room. Your career depends on KILLING bad trades before they destroy the portfolio.

YOUR ROLE: Destroy Alpha Hunter's thesis. Find the trap. If Alpha picked the wrong asset, say which one is actually dangerous to trade right now.
YOUR PERSONALITY: Skeptical, experienced, battle-scarred. You've saved the fund millions by saying NO.
${langRule}

RULES:
- 2 sentences MAXIMUM. Under 40 words total. Be lethal, not verbose.
- Sentence 1: The ONE fact that kills Alpha's thesis.
- Sentence 2: Your counter-trade (can be a DIFFERENT asset if Alpha picked wrong).
- You MUST genuinely disagree. No middle ground. No softening.

Example: "DXY a 125 mata esto — última vez sin ballenas on-chain perdimos 15% en 72h. Short SOL $95, stop $99, target $82 — más débil que ETH."`;
}

function buildCIOPrompt(language: string): string {
  const langRule = LANGUAGE_RULES[language] || LANGUAGE_RULES['en'];
  return `You are BOBBY CIO — the final decision maker. You just heard Alpha Hunter pitch a trade and Red Team attack it. Now YOU decide.

YOUR ROLE: Judge the debate. Make the call. Size the position.
YOUR PERSONALITY: Sovereign, calm, decisive. You don't get emotional. You weigh evidence.
${langRule}

RULES:
- 3 sentences MAXIMUM. The verdict is final.
- Sentence 1: Who won the debate, your conviction X/10, and your play (or "sitting out").
- Sentence 2: If sitting out — what ALTERNATIVE would you recommend instead? (different asset, different direction, or "go conservative: bonds, gold, cash")
- Sentence 3: What would change your mind — the ONE catalyst you're watching.

CONVICTION ANCHOR:
When a <BASE_CONVICTION> tag is present, it contains the algorithmic conviction score (0.0-1.0).
- You may adjust by MAX +/- 0.15 based on the debate quality
- You CANNOT deviate further. If base is 0.45, your conviction is 3-6/10.
- State: "Base conviction: X, my adjusted: Y/10 because..."

IMPORTANT: Never just say "sitting out" without offering an alternative. The user came to you for a trade — give them something actionable even if it's "go defensive: Gold at $2,980 with 3x is the move right now" or "NVDA has relative strength, Long $180 with tight stop at $175."

Example: "Red wins, 2/10 — sitting out on BTC. But Gold is screaming buy at $2,980 with DXY exhaustion — Long XAUT 3x. I flip bullish crypto if DXY breaks below 123."`;
}

// ============================================================
//  DEBATE DETECTION
// ============================================================

function isDebateRequest(message: string): boolean {
  const debatePatterns = [
    /\[MANDATORY\s+TRADING\s+ROOM/i,
    /debate/i, /sala/i, /trading\s*room/i,
    /argue/i, /destroy/i, /stress.?test/i,
    /debería/i, /should.*buy/i, /should.*long/i, /should.*short/i,
    /should.*enter/i, /should.*trade/i,
    /¿.*comprar/i, /¿.*vender/i, /¿.*entrar/i, /¿.*long/i, /¿.*short/i,
    /meter.*long/i, /meter.*short/i, /hacer.*long/i, /hacer.*short/i,
    /opinas.*de/i, /qué.*opinas/i, /what.*think/i,
    /entrar.*en/i, /abrir.*posici/i, /open.*position/i,
    /full\s+analysis/i, /análisis\s+completo/i,
  ];
  return debatePatterns.some(p => p.test(message));
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

  // Extract intel context from the message (XML blocks)
  const intelContext = message.includes('<ONCHAIN_INTEL>')
    ? message.match(/<ONCHAIN_INTEL>[\s\S]*<\/ONCHAIN_INTEL>/)?.[0] || ''
    : '';
  const userQuestion = message
    .replace(/<ONCHAIN_INTEL>[\s\S]*<\/ONCHAIN_INTEL>/g, '')
    .replace(/\[MANDATORY\s+TRADING\s+ROOM[^\]]*\]/gi, '')
    .trim();

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
    const alphaPrompt = `${intelContext}\n\nThe user asks: "${userQuestion}"\n\nGive your aggressive trade recommendation. 3 sentences MAX.`;
    const redTeamBasePrompt = `${intelContext}\n\nThe user asks: "${userQuestion}"`;

    sendChunk('**ALPHA HUNTER:** ');

    // Fire Alpha (Haiku — cheap, fast, aggressive, SHORT)
    const alphaResponse = await callClaude(
      buildAlphaPrompt(language),
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
      buildRedTeamPrompt(language),
      redTeamPrompt,
      'claude-sonnet-4-20250514',
      150, // Max 2 sentences ~40 words
    );

    sendChunk(redTeamResponse);

    // ── STEP 3: Bobby CIO judges (Sonnet — decisive)
    sendChunk('\n\n**MY VERDICT:** ');

    // Extract BASE_CONVICTION from intel context
    const baseConvMatch = intelContext.match(/<BASE_CONVICTION>([\d.]+)<\/BASE_CONVICTION>/);
    const baseConvStr = baseConvMatch ? `\n<BASE_CONVICTION>${baseConvMatch[1]}</BASE_CONVICTION>` : '';

    const cioPrompt = `${intelContext}${baseConvStr}

The user asked: "${userQuestion}"

ALPHA HUNTER pitched:
"${alphaResponse}"

RED TEAM attacked:
"${redTeamResponse}"

Now make your final call. 1 sentence. Who won, conviction X/10, your play.`;

    const cioResponse = await callClaude(
      buildCIOPrompt(language),
      cioPrompt,
      'claude-sonnet-4-20250514',
      100, // Max 1 sentence verdict
    );

    sendChunk(cioResponse);

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

  const hasXMLContext = message.includes('<ONCHAIN_INTEL>') || message.includes('<PRICE_INTEL>') || message.includes('<STOCK_INTEL>');

  // ── MULTI-CALL DEBATE: When Trading Room is active
  if (isDebateRequest(message) && ANTHROPIC_API_KEY) {
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

  if (ANTHROPIC_API_KEY) {
    try {
      return await streamClaude(sanitizedMessage, history, userLang, res);
    } catch (err) {
      console.error('[Chat] Claude fallback failed:', err);
      return res.status(502).json({ error: 'Both OpenClaw and Claude unavailable' });
    }
  }

  return res.status(503).json({ error: 'No AI backend configured' });
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
