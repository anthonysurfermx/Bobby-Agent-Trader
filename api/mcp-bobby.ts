// ============================================================
// POST /api/mcp-bobby
// Bobby as MCP (Model Context Protocol) server
// Other AI agents can call Bobby for trading intelligence
// JSON-RPC 2.0 compatible
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

import { logAgentCommerceEvent } from './_lib/agent-commerce-log.js';
import {
  BOBBY_AGENT_ECONOMY,
  PREMIUM_MCP_FEE_WEI,
  XLAYER_CHAIN_ID,
  extractPaymentTxHash,
  verifyMcpPaymentTx,
} from './_lib/xlayer-payments.js';
import {
  createChallenge,
  atomicConsumeChallenge,
  storeReceipt,
  getChallenge,
} from './_lib/mcp-challenges.js';

const BASE_URL = 'https://bobbyprotocol.xyz';

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
          { name: 'bobby_wallet_balance', description: 'Check Bobby\'s agentic wallet balance on any chain', inputSchema: { type: 'object', properties: { chain: { type: 'string', default: 'xlayer' } } } },
          { name: 'bobby_wallet_portfolio', description: 'Get portfolio of any wallet address (multi-chain)', inputSchema: { type: 'object', properties: { address: { type: 'string' }, chain: { type: 'string', default: '196' } }, required: ['address'] } },
          { name: 'bobby_security_scan', description: 'Scan a token contract for honeypot, rug pull, and safety risks', inputSchema: { type: 'object', properties: { address: { type: 'string' }, chain: { type: 'string', default: '1' } }, required: ['address'] } },
          { name: 'bobby_dex_trending', description: 'Hot trending tokens on-chain right now', inputSchema: { type: 'object', properties: { chain: { type: 'string', default: '1' } } } },
          { name: 'bobby_dex_signals', description: 'Smart money / whale / KOL buy signals', inputSchema: { type: 'object', properties: { chain: { type: 'string', default: '1' }, type: { type: 'string', default: 'smart_money' } } } },
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
        const res = await fetch(`${BASE_URL}/api/bobby-pnl`);
        const data = await res.json();
        return { content: [{ type: 'text', text: JSON.stringify(data.summary, null, 2) }] };
      }

      // Agentic Wallet tools (via droplet onchainos service)
      if (toolName === 'bobby_wallet_balance') {
        const res = await fetch(`${BASE_URL}/api/bobby-wallet`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'balance', params: { chain: args.chain || 'xlayer' } }),
        });
        return { content: [{ type: 'text', text: JSON.stringify(await res.json(), null, 2) }] };
      }

      if (toolName === 'bobby_wallet_portfolio') {
        const res = await fetch(`${BASE_URL}/api/bobby-wallet`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'portfolio', params: { address: args.address, chain: args.chain || '196' } }),
        });
        return { content: [{ type: 'text', text: JSON.stringify(await res.json(), null, 2) }] };
      }

      if (toolName === 'bobby_security_scan') {
        const res = await fetch(`${BASE_URL}/api/bobby-wallet`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'scan-token', params: { address: args.address, chain: args.chain || '1' } }),
        });
        return { content: [{ type: 'text', text: JSON.stringify(await res.json(), null, 2) }] };
      }

      if (toolName === 'bobby_dex_trending') {
        const res = await fetch(`${BASE_URL}/api/bobby-wallet`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'trending', params: { chain: args.chain || '1' } }),
        });
        return { content: [{ type: 'text', text: JSON.stringify(await res.json(), null, 2) }] };
      }

      if (toolName === 'bobby_dex_signals') {
        const res = await fetch(`${BASE_URL}/api/bobby-wallet`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'signals', params: { chain: args.chain || '1', type: args.type || 'smart_money' } }),
        });
        return { content: [{ type: 'text', text: JSON.stringify(await res.json(), null, 2) }] };
      }

      throw new Error(`Unknown tool: ${toolName}`);
    }

    default:
      throw new Error(`Unknown method: ${method}`);
  }
}

// ---- x402 Payment Gate ----
// Premium tools require x402 payment authorization
// Free tools: tools/list, bobby_intel, bobby_stats, bobby_ta
// Premium tools: bobby_debate, bobby_analyze, bobby_security_scan
const PREMIUM_TOOLS = new Set(['bobby_debate', 'bobby_analyze', 'bobby_security_scan', 'bobby_wallet_portfolio']);
const X402_PRICE_OKB = '0.001';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(200).json({
      name: 'Bobby Protocol',
      description: 'Intelligence Protocol on X Layer — 3-agent debate, conviction scoring, adversarial correction. x402 payment for premium tools.',
      version: '3.0.0',
      protocol: 'mcp',
      endpoints: { tools: '/api/mcp-bobby' },
      pricing: {
        free: ['tools/list', 'bobby_intel', 'bobby_stats', 'bobby_ta', 'bobby_xlayer_signals', 'bobby_dex_trending', 'bobby_dex_signals', 'bobby_xlayer_quote', 'bobby_wallet_balance'],
        premium: {
          tools: Array.from(PREMIUM_TOOLS),
          price: `${X402_PRICE_OKB} OKB per call`,
          priceWei: PREMIUM_MCP_FEE_WEI.toString(),
          protocol: 'x402',
          chainId: XLAYER_CHAIN_ID,
          settlementContract: BOBBY_AGENT_ECONOMY,
          settlementMethod: 'payMCPCall(bytes32 challengeId, string toolName)',
        },
      },
    });
  }

  const body = req.body as JsonRpcRequest;

  if (!body.jsonrpc || body.jsonrpc !== '2.0' || !body.method) {
    return res.status(400).json({ jsonrpc: '2.0', error: { code: -32600, message: 'Invalid JSON-RPC request' }, id: null });
  }

  // x402 payment check for premium tools (V2: challenge-based, replay-resistant)
  let verifiedPayment: Awaited<ReturnType<typeof verifyMcpPaymentTx>> | null = null;
  if (body.method === 'tools/call') {
    const toolName = (body.params as Record<string, unknown>)?.name as string;
    if (PREMIUM_TOOLS.has(toolName)) {
      const txHash = extractPaymentTxHash(
        req.headers['x-402-payment']
        || req.headers['x-payment']
        || req.headers['authorization'],
      );
      const challengeIdHeader = String(req.headers['x-challenge-id'] || '').trim();

      if (!txHash) {
        // No payment: create a new challenge and return 402
        try {
          const { challengeId, expiresAt } = await createChallenge(
            toolName,
            PREMIUM_MCP_FEE_WEI.toString(),
            undefined,
            String(req.headers['x-agent-name'] || '').trim() || undefined,
          );
          void logAgentCommerceEvent({
            source: 'mcp',
            tool_name: toolName,
            payment_status: 'challenge_issued',
            external_agent: String(req.headers['x-agent-name'] || '').trim() || null,
            request_ip: req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : null,
            user_agent: String(req.headers['user-agent'] || '').slice(0, 250) || null,
            metadata: {
              challengeId,
              expiresAt,
              chainId: XLAYER_CHAIN_ID,
              paymentContract: BOBBY_AGENT_ECONOMY,
            },
          });
          return res.status(402).json({
            jsonrpc: '2.0',
            error: {
              code: -32402,
              message: `Payment required. ${toolName} costs ${X402_PRICE_OKB} OKB on X Layer.`,
              data: {
                challengeId,
                expiresAt,
                price: X402_PRICE_OKB,
                priceWei: PREMIUM_MCP_FEE_WEI.toString(),
                currency: 'OKB',
                protocol: 'x402',
                chain: `X Layer (${XLAYER_CHAIN_ID})`,
                chainId: XLAYER_CHAIN_ID,
                settlementContract: BOBBY_AGENT_ECONOMY,
                settlementMethod: 'payMCPCall(bytes32 challengeId, string toolName)',
                instructions: `Call payMCPCall("${challengeId}", "${toolName}") on ${BOBBY_AGENT_ECONOMY} with ${X402_PRICE_OKB} OKB. Then retry with x-402-payment: <txHash> and x-challenge-id: ${challengeId}`,
              },
            },
            id: body.id,
          });
        } catch (err: any) {
          console.error('[MCP] Failed to create challenge:', err);
          return res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Failed to create payment challenge' },
            id: body.id,
          });
        }
      }

      // Has payment: verify on-chain + atomic consume in DB
      try {
        verifiedPayment = await verifyMcpPaymentTx(txHash, toolName);
      } catch (error: any) {
        return res.status(402).json({
          jsonrpc: '2.0',
          error: {
            code: -32402,
            message: error?.message || 'Payment verification failed',
            data: { protocol: 'x402', txHash, chain: `X Layer (${XLAYER_CHAIN_ID})` },
          },
          id: body.id,
        });
      }

      // Atomic consume: only one request can consume the challenge (Codex R1 P0)
      const effectiveChallengeId = challengeIdHeader || verifiedPayment.challengeId;
      if (effectiveChallengeId) {
        const { consumed } = await atomicConsumeChallenge(
          effectiveChallengeId,
          txHash,
          verifiedPayment.payer,
        );
        if (!consumed) {
          return res.status(402).json({
            jsonrpc: '2.0',
            error: {
              code: -32402,
              message: 'Challenge already consumed, expired, or not found. Request a new challenge.',
              data: { challengeId: effectiveChallengeId, txHash },
            },
            id: body.id,
          });
        }
      }
    }
  }

  try {
    const result = await handleMethod(body.method, body.params || {});

    if (body.method === 'tools/call') {
      const toolName = (body.params as Record<string, unknown>)?.name as string;
      const args = ((body.params as Record<string, unknown>)?.arguments || {}) as Record<string, unknown>;
      if (toolName && !PREMIUM_TOOLS.has(toolName)) {
        void logAgentCommerceEvent({
          source: 'mcp',
          tool_name: toolName,
          payment_status: 'free_call',
          external_agent: String(req.headers['x-agent-name'] || '').trim() || null,
          request_ip: req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : null,
          user_agent: String(req.headers['user-agent'] || '').slice(0, 250) || null,
          metadata: {
            arguments: args,
            chainId: XLAYER_CHAIN_ID,
            paymentContract: BOBBY_AGENT_ECONOMY,
          },
        });
      }
      if (toolName && PREMIUM_TOOLS.has(toolName) && verifiedPayment) {
        // Store verified receipt for Judge Mode + audit trail
        void storeReceipt({
          txHash: verifiedPayment.txHash,
          challengeId: verifiedPayment.challengeId,
          payerAddress: verifiedPayment.payer,
          toolName,
          blockNumber: verifiedPayment.blockNumber,
          valueWei: verifiedPayment.valueWei,
          valueOkb: verifiedPayment.valueOkb,
        });
        void logAgentCommerceEvent({
          source: 'mcp',
          tool_name: toolName,
          payment_tx_hash: verifiedPayment.txHash,
          payment_amount_wei: verifiedPayment.valueWei,
          payer_address: verifiedPayment.payer,
          external_agent: String(req.headers['x-agent-name'] || '').trim() || null,
          request_ip: req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : null,
          user_agent: String(req.headers['user-agent'] || '').slice(0, 250) || null,
          metadata: {
            arguments: args,
            chainId: XLAYER_CHAIN_ID,
            paymentContract: BOBBY_AGENT_ECONOMY,
            challengeId: verifiedPayment.challengeId,
          },
        });
      }
    }

    return res.status(200).json({ jsonrpc: '2.0', result, id: body.id });
  } catch (error) {
    return res.status(200).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: error instanceof Error ? error.message : 'Unknown error' },
      id: body.id,
    });
  }
}
