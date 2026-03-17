// ============================================================
// LLM Reasoning Loop — Claude analyzes signals and decides trades
// Uses Anthropic API with structured tool_use for decisions
// ============================================================

import type { FilteredSignal, TradeDecision, PortfolioState } from './types';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

interface ClaudeToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ClaudeResponse {
  content: Array<{ type: string; text?: string } | ClaudeToolUse>;
  stop_reason: string;
}

const EXECUTE_TOOL = {
  name: 'execute_decisions',
  description: 'Submit your final trading decisions after analysis. Call this exactly once with all your decisions.',
  input_schema: {
    type: 'object' as const,
    properties: {
      reasoning: {
        type: 'string' as const,
        description: 'Your overall market analysis and reasoning (2-3 sentences)',
      },
      trades: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            action: { type: 'string' as const, enum: ['BUY', 'SKIP'] },
            chain: { type: 'string' as const },
            token_address: { type: 'string' as const },
            token_symbol: { type: 'string' as const },
            amount_usd: { type: 'number' as const, description: 'USD amount to trade (max $50 per trade)' },
            reason: { type: 'string' as const },
            confidence: { type: 'number' as const, minimum: 0, maximum: 1 },
            signal_sources: { type: 'array' as const, items: { type: 'string' as const } },
          },
          required: ['action', 'token_symbol', 'reason', 'confidence'],
        },
      },
    },
    required: ['reasoning', 'trades'],
  },
};

export async function analyzeWithClaude(
  signals: FilteredSignal[],
  portfolio: PortfolioState,
): Promise<{ decisions: TradeDecision[]; reasoning: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[LLM] ANTHROPIC_API_KEY not set');
    return { decisions: [], reasoning: 'API key not configured' };
  }

  const now = new Date().toISOString();

  const systemPrompt = `You are an autonomous crypto trading agent called "Agent Radar".
You analyze on-chain signals and market data to make trading decisions every 8 hours.

RULES:
- Only BUY tokens with >= 2 independent signal sources OR a single very strong signal (score > 60)
- Prefer signals where soldRatioPct < 20% (wallets still holding = strong conviction)
- Max 3 trades per cycle
- Max $50 per trade (this is a conservative agent)
- Min confidence 0.7 to execute a BUY
- SKIP anything that looks like a honeypot, rug pull, or has no liquidity
- Consider the current portfolio — don't overconcentrate
- If no good opportunities exist, it's OK to SKIP everything
- Be concise in your reasoning

You MUST call the execute_decisions tool with your analysis.`;

  const userMessage = `Current time: ${now}

PORTFOLIO STATE:
- Total value: $${portfolio.totalValueUsd.toFixed(2)}
- Open positions: ${portfolio.positions.length}
- Daily P&L: $${portfolio.dailyPnlUsd.toFixed(2)}
- Trades last 24h: ${portfolio.tradesLast24h}

FILTERED SIGNALS (${signals.length} passed filters):
${signals.map((s, i) => `
[Signal ${i + 1}] Score: ${s.filterScore}/100
  Source: ${s.source} | Type: ${s.signalType}
  Token: ${s.tokenSymbol} (${s.chain})
  Address: ${s.tokenAddress || 'N/A'}
  Amount: $${s.amountUsd.toLocaleString()}
  ${s.triggerWalletCount ? `Trigger wallets: ${s.triggerWalletCount}` : ''}
  ${s.soldRatioPct !== undefined ? `Sold ratio: ${s.soldRatioPct}%` : ''}
  ${s.marketCapUsd ? `Market cap: $${(s.marketCapUsd / 1e6).toFixed(1)}M` : ''}
  ${s.confidence ? `Confidence: ${(s.confidence * 100).toFixed(0)}%` : ''}
  Reasons: ${s.reasons.join(', ')}
  ${s.metadata ? `Metadata: ${JSON.stringify(s.metadata)}` : ''}
`).join('')}

Analyze these signals and call execute_decisions with your trading decisions.`;

  try {
    const response = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        tools: [EXECUTE_TOOL],
        tool_choice: { type: 'tool', name: 'execute_decisions' },
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[LLM] Claude API error:', response.status, text);
      return { decisions: [], reasoning: `Claude API error: ${response.status}` };
    }

    const result = await response.json() as ClaudeResponse;

    // Extract the tool use block
    const toolUse = result.content.find(
      (b): b is ClaudeToolUse => b.type === 'tool_use' && b.name === 'execute_decisions'
    );

    if (!toolUse) {
      console.error('[LLM] No execute_decisions tool call found');
      return { decisions: [], reasoning: 'LLM did not produce decisions' };
    }

    const input = toolUse.input as {
      reasoning: string;
      trades: Array<{
        action: string;
        chain?: string;
        token_address?: string;
        token_symbol: string;
        amount_usd?: number;
        reason: string;
        confidence: number;
        signal_sources?: string[];
      }>;
    };

    const decisions: TradeDecision[] = (input.trades || [])
      .filter(t => t.action === 'BUY' && t.confidence >= 0.7)
      .slice(0, 3) // Hard cap at 3 trades
      .map(t => ({
        action: 'BUY' as const,
        chain: t.chain || '1',
        tokenAddress: t.token_address || '',
        tokenSymbol: t.token_symbol,
        amountUsd: Math.min(t.amount_usd || 25, 50), // Hard cap $50
        reason: t.reason,
        confidence: t.confidence,
        signalSources: t.signal_sources || [],
      }));

    return {
      decisions,
      reasoning: input.reasoning || 'No reasoning provided',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown LLM error';
    console.error('[LLM] Error:', msg);
    return { decisions: [], reasoning: `LLM error: ${msg}` };
  }
}
