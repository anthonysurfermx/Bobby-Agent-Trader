// ============================================================
// POST /api/mcp-http
// Bobby Protocol — MCP Streamable HTTP Transport
// Implements the MCP spec: initialize, tools/list, tools/call
// With x402 payment gate for premium tools
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
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
} from './_lib/mcp-challenges.js';
import { logAgentCommerceEvent } from './_lib/agent-commerce-log.js';

export const config = { maxDuration: 60 };

const PROTOCOL_VERSION = '2025-03-26';
const SERVER_NAME = 'bobby-protocol';
const SERVER_VERSION = '3.0.0';
const BASE_URL = 'https://bobbyprotocol.xyz';

const PREMIUM_TOOLS = new Set(['bobby_analyze', 'bobby_debate', 'bobby_security_scan', 'bobby_wallet_portfolio', 'bobby_judge']);
const X402_PRICE_OKB = '0.001';

// ---- Tool Definitions ----
const TOOLS = [
  { name: 'bobby_analyze', description: 'Get Bobby\'s full market analysis with conviction score. PAID: 0.001 OKB.', inputSchema: { type: 'object', properties: { symbol: { type: 'string', description: 'Token symbol (BTC, ETH, SOL, OKB)' }, language: { type: 'string', enum: ['en', 'es'], default: 'en' } }, required: ['symbol'] } },
  { name: 'bobby_debate', description: 'Trigger a 3-agent debate (Alpha Hunter vs Red Team vs CIO). PAID: 0.001 OKB.', inputSchema: { type: 'object', properties: { question: { type: 'string', description: 'Trading question to debate' }, language: { type: 'string', enum: ['en', 'es'], default: 'en' } }, required: ['question'] } },
  { name: 'bobby_ta', description: 'Technical analysis: SMA, RSI, MACD, Bollinger, support/resistance.', inputSchema: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] } },
  { name: 'bobby_intel', description: 'Full intelligence briefing from 10 real-time data sources.', inputSchema: { type: 'object', properties: {} } },
  { name: 'bobby_xlayer_signals', description: 'Smart money signals on X Layer (OKX L2).', inputSchema: { type: 'object', properties: {} } },
  { name: 'bobby_xlayer_quote', description: 'DEX swap quote on X Layer.', inputSchema: { type: 'object', properties: { from: { type: 'string', default: 'OKB' }, to: { type: 'string', default: 'USDT' }, amount: { type: 'string', default: '1' } } } },
  { name: 'bobby_stats', description: 'Bobby\'s track record (win rate, PnL, recent trades).', inputSchema: { type: 'object', properties: {} } },
  { name: 'bobby_wallet_balance', description: 'Check Bobby\'s agentic wallet balance.', inputSchema: { type: 'object', properties: { chain: { type: 'string', default: 'xlayer' } } } },
  { name: 'bobby_wallet_portfolio', description: 'Portfolio of any wallet address (multi-chain). PAID: 0.001 OKB.', inputSchema: { type: 'object', properties: { address: { type: 'string' }, chain: { type: 'string', default: '196' } }, required: ['address'] } },
  { name: 'bobby_security_scan', description: 'Scan token contract for honeypot/rug risks. PAID: 0.001 OKB.', inputSchema: { type: 'object', properties: { address: { type: 'string' }, chain: { type: 'string', default: '1' } }, required: ['address'] } },
  { name: 'bobby_dex_trending', description: 'Hot trending tokens on-chain right now.', inputSchema: { type: 'object', properties: { chain: { type: 'string', default: '1' } } } },
  { name: 'bobby_dex_signals', description: 'Smart money / whale / KOL buy signals.', inputSchema: { type: 'object', properties: { chain: { type: 'string', default: '1' }, type: { type: 'string', default: 'smart_money' } } } },
  { name: 'bobby_judge', description: 'Judge Mode — independent audit of a 3-agent debate. Scores quality, detects biases, recommends execute/pass/reduce. PAID: 0.001 OKB.', inputSchema: { type: 'object', properties: { thread_id: { type: 'string', description: 'Debate thread ID (omit for latest debate)' }, language: { type: 'string', enum: ['en', 'es'], default: 'en' } } } },
];

// ---- Tool Execution ----
async function executeTool(name: string, args: Record<string, string>): Promise<{ content: Array<{ type: string; text: string }> }> {
  if (name === 'bobby_analyze' || name === 'bobby_debate') {
    const question = args.question || args.symbol || 'market';
    const message = name === 'bobby_debate'
      ? `${question}\n\n[MANDATORY TRADING ROOM DEBATE]`
      : question;

    const res = await fetch(`${BASE_URL}/api/openclaw-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, language: args.language || 'en', history: [] }),
    });
    if (!res.ok) throw new Error(`Bobby analysis failed: ${res.status}`);

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

  if (name === 'bobby_ta') {
    const res = await fetch(`${BASE_URL}/api/technical-analysis?symbol=${args.symbol || 'BTC'}`);
    const data = await res.json();
    return { content: [{ type: 'text', text: JSON.stringify(data.summary, null, 2) }] };
  }

  if (name === 'bobby_intel') {
    const res = await fetch(`${BASE_URL}/api/bobby-intel`);
    const data = await res.json();
    return { content: [{ type: 'text', text: data.briefing }] };
  }

  if (name === 'bobby_xlayer_signals') {
    const res = await fetch(`${BASE_URL}/api/xlayer-trade`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'signals' }),
    });
    const data = await res.json();
    const signals = data.data?.slice(0, 5).map((s: any) => ({
      token: s.token?.symbol, amount: `$${parseFloat(s.amountUsd).toFixed(0)}`, wallets: s.triggerWalletCount,
    }));
    return { content: [{ type: 'text', text: JSON.stringify(signals, null, 2) }] };
  }

  if (name === 'bobby_xlayer_quote') {
    const res = await fetch(`${BASE_URL}/api/xlayer-trade`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'quote',
        params: {
          from_token: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          to_token: '0x1e4a5963abfd975d8c9021ce480b42188849d41d',
          amount: BigInt(Math.floor(parseFloat(args.amount || '1') * 1e18)).toString(),
        },
      }),
    });
    return { content: [{ type: 'text', text: JSON.stringify(await res.json(), null, 2) }] };
  }

  if (name === 'bobby_stats') {
    const res = await fetch(`${BASE_URL}/api/bobby-pnl`);
    const data = await res.json();
    return { content: [{ type: 'text', text: JSON.stringify(data.summary, null, 2) }] };
  }

  if (name === 'bobby_wallet_balance') {
    const res = await fetch(`${BASE_URL}/api/bobby-wallet`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'balance', params: { chain: args.chain || 'xlayer' } }),
    });
    return { content: [{ type: 'text', text: JSON.stringify(await res.json(), null, 2) }] };
  }

  if (name === 'bobby_wallet_portfolio') {
    const res = await fetch(`${BASE_URL}/api/bobby-wallet`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'portfolio', params: { address: args.address, chain: args.chain || '196' } }),
    });
    return { content: [{ type: 'text', text: JSON.stringify(await res.json(), null, 2) }] };
  }

  if (name === 'bobby_security_scan') {
    const res = await fetch(`${BASE_URL}/api/bobby-wallet`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'scan-token', params: { address: args.address, chain: args.chain || '1' } }),
    });
    return { content: [{ type: 'text', text: JSON.stringify(await res.json(), null, 2) }] };
  }

  if (name === 'bobby_dex_trending') {
    const res = await fetch(`${BASE_URL}/api/bobby-wallet`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'trending', params: { chain: args.chain || '1' } }),
    });
    return { content: [{ type: 'text', text: JSON.stringify(await res.json(), null, 2) }] };
  }

  if (name === 'bobby_dex_signals') {
    const res = await fetch(`${BASE_URL}/api/bobby-wallet`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'signals', params: { chain: args.chain || '1', type: args.type || 'smart_money' } }),
    });
    return { content: [{ type: 'text', text: JSON.stringify(await res.json(), null, 2) }] };
  }

  if (name === 'bobby_judge') {
    const res = await fetch(`${BASE_URL}/api/judge-mode`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread_id: args.thread_id || undefined, language: args.language || 'en' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Judge Mode failed');
    const v = data.verdict;
    const summary = [
      `**Judge Mode Verdict** — Score: ${v.overall_score}/100`,
      `Recommendation: ${v.recommendation.toUpperCase()}`,
      `Conviction: ${v.conviction_assessment}`,
      '',
      `Dimensions: Data ${v.dimensions.data_integrity}/5 | Adversarial ${v.dimensions.adversarial_quality}/5 | Logic ${v.dimensions.decision_logic}/5 | Risk ${v.dimensions.risk_management}/5 | Calibration ${v.dimensions.calibration_alignment}/5 | Novelty ${v.dimensions.novelty}/5`,
      '',
      `Biases: ${v.biases_detected.length ? v.biases_detected.join(', ') : 'None detected'}`,
      v.red_flags.length ? `Red Flags: ${v.red_flags.join('; ')}` : '',
      '',
      v.rationale,
    ].filter(Boolean).join('\n');
    return { content: [{ type: 'text', text: summary }] };
  }

  throw new Error(`Unknown tool: ${name}`);
}

// ---- JSON-RPC Router ----
interface JsonRpcMessage {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id?: string | number;
}

function jsonrpcOk(id: string | number | undefined, result: unknown) {
  return { jsonrpc: '2.0' as const, result, id };
}

function jsonrpcError(id: string | number | undefined, code: number, message: string, data?: unknown) {
  return { jsonrpc: '2.0' as const, error: { code, message, data }, id };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // GET → server metadata (discovery)
  if (req.method === 'GET') {
    return res.status(200).json({
      name: SERVER_NAME,
      version: SERVER_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      description: 'Bobby Protocol — Adversarial intelligence for the agent economy. 3-agent debate, conviction scoring, on-chain settlement on X Layer.',
      transport: 'streamable-http',
      endpoints: {
        mcp: '/api/mcp-http',
        legacy: '/api/mcp-bobby',
      },
      pricing: {
        free: TOOLS.filter(t => !PREMIUM_TOOLS.has(t.name)).map(t => t.name),
        premium: {
          tools: Array.from(PREMIUM_TOOLS),
          price: `${X402_PRICE_OKB} OKB`,
          priceWei: PREMIUM_MCP_FEE_WEI.toString(),
          protocol: 'x402',
          chainId: XLAYER_CHAIN_ID,
          contract: BOBBY_AGENT_ECONOMY,
        },
      },
    });
  }

  if (req.method === 'DELETE') {
    // Session termination — stateless server, just acknowledge
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json(jsonrpcError(undefined, -32600, 'Method not allowed'));
  }

  // Accept application/json (single message) or could be batch
  const body = req.body as JsonRpcMessage | JsonRpcMessage[];
  const messages = Array.isArray(body) ? body : [body];
  const results: unknown[] = [];

  for (const msg of messages) {
    if (!msg.jsonrpc || msg.jsonrpc !== '2.0' || !msg.method) {
      results.push(jsonrpcError(msg.id, -32600, 'Invalid JSON-RPC 2.0 request'));
      continue;
    }

    try {
      const result = await handleMessage(msg, req);
      if (result !== null) results.push(result);
    } catch (err: any) {
      results.push(jsonrpcError(msg.id, -32603, err.message || 'Internal error'));
    }
  }

  // If single request, return single response; if batch, return array
  if (!Array.isArray(body)) {
    // Notifications (no id) get no response
    if (results.length === 0) return res.status(204).end();
    return res.status(200).json(results[0]);
  }

  return res.status(200).json(results.filter(Boolean));
}

async function handleMessage(msg: JsonRpcMessage, req: VercelRequest): Promise<unknown> {
  const { method, params = {}, id } = msg;

  // Notifications (no id) — process but don't return response
  const isNotification = id === undefined;

  switch (method) {
    // ---- Initialize ----
    case 'initialize': {
      const result = {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: {
          name: SERVER_NAME,
          version: SERVER_VERSION,
        },
      };
      return isNotification ? null : jsonrpcOk(id, result);
    }

    // ---- Notifications (client → server) ----
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null; // Acknowledge silently

    // ---- Ping ----
    case 'ping':
      return isNotification ? null : jsonrpcOk(id, {});

    // ---- List Tools ----
    case 'tools/list': {
      return isNotification ? null : jsonrpcOk(id, { tools: TOOLS });
    }

    // ---- Call Tool ----
    case 'tools/call': {
      const toolName = params.name as string;
      const args = (params.arguments || {}) as Record<string, string>;

      if (!toolName) {
        return jsonrpcError(id, -32602, 'Missing tool name');
      }

      // x402 payment gate for premium tools
      let verifiedPayment: Awaited<ReturnType<typeof verifyMcpPaymentTx>> | null = null;

      if (PREMIUM_TOOLS.has(toolName)) {
        const txHash = extractPaymentTxHash(
          req.headers['x-402-payment']
          || req.headers['x-payment']
          || req.headers['authorization'],
        );
        const challengeIdHeader = String(req.headers['x-challenge-id'] || '').trim();

        if (!txHash) {
          // No payment → create challenge, return 402
          const { challengeId, expiresAt } = await createChallenge(
            toolName,
            PREMIUM_MCP_FEE_WEI.toString(),
            undefined,
            String(req.headers['x-agent-name'] || '').trim() || undefined,
          );
          return jsonrpcError(id, -32402, `Payment required. ${toolName} costs ${X402_PRICE_OKB} OKB on X Layer.`, {
            challengeId,
            expiresAt,
            price: X402_PRICE_OKB,
            priceWei: PREMIUM_MCP_FEE_WEI.toString(),
            currency: 'OKB',
            protocol: 'x402',
            chain: `X Layer (${XLAYER_CHAIN_ID})`,
            chainId: XLAYER_CHAIN_ID,
            contract: BOBBY_AGENT_ECONOMY,
            method: 'payMCPCall(bytes32 challengeId, string toolName)',
            instructions: `Call payMCPCall("${challengeId}", "${toolName}") on ${BOBBY_AGENT_ECONOMY} with ${X402_PRICE_OKB} OKB, then retry with headers x-402-payment: <txHash> and x-challenge-id: ${challengeId}`,
          });
        }

        // Verify on-chain payment
        verifiedPayment = await verifyMcpPaymentTx(txHash, toolName);

        // Atomic consume challenge
        const effectiveChallengeId = challengeIdHeader || verifiedPayment.challengeId;
        if (effectiveChallengeId) {
          const { consumed } = await atomicConsumeChallenge(effectiveChallengeId, txHash, verifiedPayment.payer);
          if (!consumed) {
            return jsonrpcError(id, -32402, 'Challenge already consumed, expired, or not found. Request a new challenge.', {
              challengeId: effectiveChallengeId, txHash,
            });
          }
        }
      }

      // Execute the tool
      const result = await executeTool(toolName, args);

      // Log premium tool usage
      if (verifiedPayment && PREMIUM_TOOLS.has(toolName)) {
        const proof = {
          txHash: verifiedPayment.txHash,
          challengeId: verifiedPayment.challengeId,
          blockNumber: verifiedPayment.blockNumber,
          payer: verifiedPayment.payer,
          valueOkb: verifiedPayment.valueOkb,
          contract: BOBBY_AGENT_ECONOMY,
          chainId: XLAYER_CHAIN_ID,
          explorerUrl: `https://www.oklink.com/xlayer/tx/${verifiedPayment.txHash}`,
        };

        // Append proof to response
        result.content.push({
          type: 'text',
          text: `\n\n---\n**On-chain proof:** ${proof.explorerUrl}\nChallenge: ${proof.challengeId} | Block: ${proof.blockNumber} | Paid: ${proof.valueOkb} OKB`,
        });

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
          source: 'mcp-http',
          tool_name: toolName,
          payment_tx_hash: verifiedPayment.txHash,
          payment_amount_wei: verifiedPayment.valueWei,
          payer_address: verifiedPayment.payer,
          external_agent: String(req.headers['x-agent-name'] || '').trim() || null,
          request_ip: req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : null,
          user_agent: String(req.headers['user-agent'] || '').slice(0, 250) || null,
          metadata: { arguments: args, chainId: XLAYER_CHAIN_ID, transport: 'streamable-http' },
        });
      }

      return isNotification ? null : jsonrpcOk(id, result);
    }

    default:
      return jsonrpcError(id, -32601, `Method not found: ${method}`);
  }
}
