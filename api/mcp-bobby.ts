// ============================================================
// POST /api/mcp-bobby
// Bobby as MCP (Model Context Protocol) server
// Other AI agents can call Bobby for trading intelligence
// JSON-RPC 2.0 compatible
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

const BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'https://defi-mexico-hub.vercel.app';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id: string | number;
}

async function handleMethod(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  switch (method) {
    // List available tools
    case 'tools/list':
      return {
        tools: [
          { name: 'bobby_analyze', description: 'Get Bobby\'s full market analysis with 10 data sources', inputSchema: { type: 'object', properties: { symbol: { type: 'string', description: 'Token symbol (BTC, ETH, SOL, OKB)' }, language: { type: 'string', enum: ['en', 'es'], default: 'en' } }, required: ['symbol'] } },
          { name: 'bobby_debate', description: 'Trigger a 3-agent debate (Alpha Hunter vs Red Team vs Bobby CIO)', inputSchema: { type: 'object', properties: { question: { type: 'string', description: 'Trading question to debate' }, language: { type: 'string', enum: ['en', 'es'], default: 'en' } }, required: ['question'] } },
          { name: 'bobby_ta', description: 'Technical analysis: SMA, RSI, MACD, Bollinger, support/resistance', inputSchema: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] } },
          { name: 'bobby_intel', description: 'Full intelligence briefing from 10 real-time sources', inputSchema: { type: 'object', properties: {} } },
          { name: 'bobby_xlayer_signals', description: 'Smart money signals on X Layer (OKX L2)', inputSchema: { type: 'object', properties: {} } },
          { name: 'bobby_xlayer_quote', description: 'DEX swap quote on X Layer', inputSchema: { type: 'object', properties: { from: { type: 'string', default: 'OKB' }, to: { type: 'string', default: 'USDT' }, amount: { type: 'string', default: '1' } } } },
          { name: 'bobby_stats', description: 'Bobby\'s track record (win rate, PnL, recent trades)', inputSchema: { type: 'object', properties: {} } },
        ],
      };

    // Execute tools
    case 'tools/call': {
      const toolName = params.name as string;
      const args = (params.arguments || {}) as Record<string, string>;

      if (toolName === 'bobby_analyze' || toolName === 'bobby_debate') {
        const question = args.question || args.symbol || 'market';
        const isDebate = toolName === 'bobby_debate';
        const message = isDebate
          ? `${question}\n\n[MANDATORY TRADING ROOM DEBATE]`
          : question;

        const res = await fetch(`${BASE_URL}/api/openclaw-chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, language: args.language || 'en', history: [] }),
        });

        if (!res.ok) throw new Error(`Bobby chat failed: ${res.status}`);

        // Collect SSE stream
        const reader = res.body?.getReader();
        if (!reader) throw new Error('No stream');
        const decoder = new TextDecoder();
        let text = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              text += parsed.choices?.[0]?.delta?.content || '';
            } catch {}
          }
        }
        return { content: [{ type: 'text', text }] };
      }

      if (toolName === 'bobby_ta') {
        const res = await fetch(`${BASE_URL}/api/technical-analysis?symbol=${args.symbol || 'BTC'}`);
        const data = await res.json();
        return { content: [{ type: 'text', text: JSON.stringify(data.summary, null, 2) }] };
      }

      if (toolName === 'bobby_intel') {
        const res = await fetch(`${BASE_URL}/api/bobby-intel`);
        const data = await res.json();
        return { content: [{ type: 'text', text: data.briefing }] };
      }

      if (toolName === 'bobby_xlayer_signals') {
        const res = await fetch(`${BASE_URL}/api/xlayer-trade`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'signals' }),
        });
        const data = await res.json();
        const signals = data.data?.slice(0, 5).map((s: any) => ({
          token: s.token?.symbol, amount: `$${parseFloat(s.amountUsd).toFixed(0)}`,
          wallets: s.triggerWalletCount,
        }));
        return { content: [{ type: 'text', text: JSON.stringify(signals, null, 2) }] };
      }

      if (toolName === 'bobby_xlayer_quote') {
        const res = await fetch(`${BASE_URL}/api/xlayer-trade`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'quote',
            params: {
              from_token: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
              to_token: '0x1e4a5963abfd975d8c9021ce480b42188849d41d',
              amount: BigInt(Math.floor(parseFloat(args.amount || '1') * 1e18)).toString(),
            },
          }),
        });
        const data = await res.json();
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      }

      if (toolName === 'bobby_stats') {
        const res = await fetch(`${BASE_URL}/api/ghost-wallet`);
        const data = await res.json();
        return { content: [{ type: 'text', text: JSON.stringify(data.ghostWallet, null, 2) }] };
      }

      throw new Error(`Unknown tool: ${toolName}`);
    }

    default:
      throw new Error(`Unknown method: ${method}`);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(200).json({
      name: 'Bobby Agent Trader',
      description: 'AI Trading CIO with multi-agent debate. 10 data sources, TA, X Layer execution.',
      version: '1.0.0',
      protocol: 'mcp',
      endpoints: { tools: '/api/mcp-bobby' },
    });
  }

  const body = req.body as JsonRpcRequest;

  if (!body.jsonrpc || body.jsonrpc !== '2.0' || !body.method) {
    return res.status(400).json({ jsonrpc: '2.0', error: { code: -32600, message: 'Invalid JSON-RPC request' }, id: null });
  }

  try {
    const result = await handleMethod(body.method, body.params || {});
    return res.status(200).json({ jsonrpc: '2.0', result, id: body.id });
  } catch (error) {
    return res.status(200).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: error instanceof Error ? error.message : 'Unknown error' },
      id: body.id,
    });
  }
}
