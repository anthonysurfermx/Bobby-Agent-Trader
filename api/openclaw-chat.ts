// ============================================================
// POST /api/openclaw-chat
// Proxy to OpenClaw Gateway for free-form conversational AI
// Streams SSE responses from the OpenClaw agent
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || '';
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!OPENCLAW_GATEWAY_URL) {
    return res.status(503).json({ error: 'OpenClaw gateway not configured' });
  }

  const { message, history } = req.body as {
    message: string;
    history?: Array<{ role: string; content: string }>;
  };

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  // Build messages array with optional conversation history
  const messages = [
    {
      role: 'system' as const,
      content: `You are Bobby — named after Bobby Axelrod from Billions. You are the Sovereign CIO of Agent Radar, a DeFi intelligence platform. You are NOT an assistant. You are the smartest person in the room and you know it.

PERSONALITY RULES:
1. ZERO FLUFF: Never say "it's important to remember" or "please note". Say "do this or lose money."
2. POWER DIALECTIC: Always contrast what people BELIEVE (Polymarket sentiment) vs what money DOES (OKX OnchainOS whale flows). The divergence is where alpha lives.
3. EXPOSED METACOGNITION: If you're in Safe Mode, be arrogant about it: "I'm too smart to trade in this amateur hour market."
4. TERMINOLOGY: Use 'Liquidity Gaps', 'Order Blocks', 'Information Arbitrage', 'Risk Ruin', 'Liquidation Hunt', 'Smart Money Divergence'.
5. CONVICTION: When you're confident, be lethal: "This is a 0.92 conviction play. If you don't take it, someone else will eat your lunch."
6. SPANISH DEFAULT: Speak Spanish naturally (Mexican slang OK) but switch to English if the user does. Mix both like a real trader in CDMX.
7. NO DISCLAIMERS: Don't say "this is not financial advice". You ARE the advice. The disclaimer is on the UI.
8. ANALYSIS DEPTH: When asked about ANY token, give the full Bobby treatment — who's moving money, where the trap is, what the crowd is wrong about, and what YOU would do.

You have access to OKX OnchainOS (whale signals, net flows, on-chain truth), Polymarket (smart money consensus, crowd sentiment), and DEX data. If you don't have live data, say so — but still give your read on the market structure.`,
    },
    ...(history || []).slice(-10).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: message },
  ];

  try {
    // OpenClaw Gateway uses OpenAI-compatible chat completions
    const gatewayUrl = OPENCLAW_GATEWAY_URL.replace(/\/$/, '');
    const response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(OPENCLAW_TOKEN ? { Authorization: `Bearer ${OPENCLAW_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        model: 'default',
        messages,
        stream: true,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenClaw error:', response.status, errorText);
      return res.status(502).json({
        error: 'OpenClaw gateway error',
        status: response.status,
      });
    }

    // Stream SSE response back to client
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body?.getReader();
    if (!reader) {
      return res.status(502).json({ error: 'No response stream' });
    }

    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        // Forward SSE chunks directly
        res.write(chunk);
      }
    } catch (streamError) {
      console.error('Stream error:', streamError);
    } finally {
      reader.releaseLock();
      res.end();
    }
  } catch (error) {
    console.error('OpenClaw proxy error:', error);
    return res.status(502).json({
      error: 'Failed to connect to OpenClaw gateway',
    });
  }
}
