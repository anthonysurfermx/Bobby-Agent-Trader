// ============================================================
// POST /api/mcp-http
// Bobby Protocol — MCP Streamable HTTP Transport
// Implements the MCP spec: initialize, tools/list, tools/call
// With x402 payment gate for premium tools
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { parseEther } from 'ethers';
import { BOBBY_PROTOCOL_BASE_URL } from './_lib/protocol-constants.js';
import { DEFAULT_CHAIN } from './_lib/chains.js';
import {
  BOBBY_ADVERSARIAL_BOUNTIES,
  BOBBY_AGENT_ECONOMY,
  PROTOCOL_CHAIN_ID,
  buildPostBountyCalldata,
  buildSubmitChallengeCalldata,
  extractPaymentTxHash,
  listRecentBounties,
  readBounty,
  readMinBounty,
  readMcpCallFee,
  verifyMcpPaymentTx,
} from './_lib/protocol-payments.js';
import { createChallenge, getLatestReceipt, storeReceipt, claimChallenge, completeChallenge, failChallenge, requestHashFor } from './_lib/mcp-challenges.js';
import { logAgentCommerceEvent } from './_lib/agent-commerce-log.js';
import { logHarnessEvent } from './_lib/harness-events.js';
import { getUniswapCompatibleQuote } from './_lib/mcp-uniswap-quote.js';
import {
  getPrices as b1naryGetPrices,
  getSpot as b1naryGetSpot,
  getCapacity as b1naryGetCapacity,
  getPositions as b1naryGetPositions,
  B1naryCircuitBreakerError,
  B1NARY_DEPLOYMENT_STATUS,
  B1NARY_SOURCE_CHAIN_ID,
  type B1naryAsset,
  type B1naryOptionType,
} from './_lib/b1nary.js';
import { evaluateWheel } from './_lib/wheel-verdict.js';
import { enforcePublicRateLimit, internalAuthHeaders } from './_lib/request-security.js';
import { bobbyDbUrl, bobbyReadKey } from './_lib/bobby-db.js';

export const config = { maxDuration: 60 };

const PROTOCOL_VERSION = '2025-03-26';
const SERVER_NAME = 'bobby-protocol';
const SERVER_VERSION = '3.0.0';
const BASE_URL = BOBBY_PROTOCOL_BASE_URL;

const PREMIUM_TOOLS = new Set(['bobby_analyze', 'bobby_debate', 'bobby_security_scan', 'bobby_wallet_portfolio', 'bobby_judge']);
// ---- Tool Definitions ----
const TOOLS = [
  { name: 'bobby_analyze', description: 'Get Bobby\'s full market analysis with conviction score. Requires the current on-chain MCP fee.', inputSchema: { type: 'object', properties: { symbol: { type: 'string', description: 'Token symbol (BTC, ETH, SOL) or a Base tokenized stock (NVDAc, AAPLc, METAc, GOOGLc)' }, language: { type: 'string', enum: ['en', 'es'], default: 'en' } }, required: ['symbol'] } },
  { name: 'bobby_debate', description: 'Trigger a 3-agent debate (Alpha Hunter vs Red Team vs CIO). Requires the current on-chain MCP fee.', inputSchema: { type: 'object', properties: { question: { type: 'string', description: 'Trading question to debate' }, language: { type: 'string', enum: ['en', 'es'], default: 'en' } }, required: ['question'] } },
  { name: 'bobby_recommend', description: 'Get Bobby\'s current actionable recommendation: symbol, direction, conviction, entry/stop/target, and guardrail status. The signal your agent needs to decide.', inputSchema: { type: 'object', properties: { symbol: { type: 'string', description: 'Token symbol (BTC, ETH, SOL). Omit for Bobby\'s best current pick.' } } } },
  { name: 'bobby_brief', description: 'One-shot compact briefing (~400 tokens). Signal + track record + guardrails in a single call. Optimized for token-constrained agents.', inputSchema: { type: 'object', properties: { symbol: { type: 'string', description: 'Token symbol. Omit for Bobby\'s current pick.' } } } },
  { name: 'bobby_ta', description: 'Technical analysis: SMA, RSI, MACD, Bollinger, support/resistance.', inputSchema: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] } },
  { name: 'bobby_intel', description: 'Full intelligence briefing from 10 real-time data sources. Use sections param to filter: prices,regime,whale,sentiment,technical,macro.', inputSchema: { type: 'object', properties: { sections: { type: 'string', description: 'Comma-separated sections to include: prices,regime,whale,sentiment,technical,macro,funding,oi,prediction,traders,security. Omit for all.' } } } },
  { name: 'bobby_uniswap_quote', description: 'Read-only quote for Coinbase B20 tokenized stocks through direct USDC pools on Uniswap V3, Base (8453). Never returns calldata.', inputSchema: { type: 'object', properties: { tokenIn: { type: 'string', default: 'USDC', description: 'USDC or a supported B20 token (AAPLc, GOOGLc, METAc, NVDAc; underlying ticker aliases accepted)' }, tokenOut: { type: 'string', default: 'NVDAc', description: 'USDC or a supported B20 token; one side must be USDC' }, amount: { type: 'string', default: '10', description: 'Human-readable exact-input amount' }, amountIn: { type: 'string', description: 'Alias for amount' }, chainId: { type: 'string', default: '8453' }, tradeType: { type: 'string', enum: ['EXACT_INPUT'], default: 'EXACT_INPUT' }, slippageBps: { type: 'number', default: 50 } }, required: ['tokenIn', 'tokenOut', 'amount'] } },
  { name: 'bobby_stats', description: 'Bobby\'s track record (win rate, PnL, recent trades).', inputSchema: { type: 'object', properties: {} } },
  { name: 'bobby_wallet_balance', description: 'Check Bobby\'s agentic wallet balance.', inputSchema: { type: 'object', properties: { chain: { type: 'string', default: 'base' } } } },
  { name: 'bobby_wallet_portfolio', description: 'Portfolio of any wallet address (multi-chain). Requires the current on-chain MCP fee.', inputSchema: { type: 'object', properties: { address: { type: 'string' }, chain: { type: 'string', default: '8453' } }, required: ['address'] } },
  { name: 'bobby_security_scan', description: 'Scan token contract for honeypot/rug risks. Requires the current on-chain MCP fee.', inputSchema: { type: 'object', properties: { address: { type: 'string' }, chain: { type: 'string', default: '1' } }, required: ['address'] } },
  { name: 'bobby_dex_trending', description: 'Hot trending tokens on-chain right now.', inputSchema: { type: 'object', properties: { chain: { type: 'string', default: '1' } } } },
  { name: 'bobby_dex_signals', description: 'Smart money / whale / KOL buy signals.', inputSchema: { type: 'object', properties: { chain: { type: 'string', default: '1' }, type: { type: 'string', default: 'smart_money' } } } },
  { name: 'bobby_judge', description: 'Judge Mode — independent audit of a 3-agent debate. Requires the current on-chain MCP fee.', inputSchema: { type: 'object', properties: { thread_id: { type: 'string', description: 'Debate thread ID (omit for latest debate)' }, language: { type: 'string', enum: ['en', 'es'], default: 'en' } } } },
  { name: 'bobby_bounty_list', description: 'List recent adversarial bounties posted against Bobby debates on X Layer.', inputSchema: { type: 'object', properties: { limit: { type: 'number', default: 10, description: 'How many recent bounties to return (max 25)' } } } },
  { name: 'bobby_bounty_get', description: 'Get a single adversarial bounty by id, including status, reward, dimension and effective expiry.', inputSchema: { type: 'object', properties: { bounty_id: { type: 'string', description: 'Bounty id (integer, 1-indexed)' } }, required: ['bounty_id'] } },
  { name: 'bobby_bounty_post', description: `Build unsigned calldata to post a new ${DEFAULT_CHAIN.nativeSymbol} bounty against a Bobby debate thread. Returns tx payload for the client to sign — never holds funds.`, inputSchema: { type: 'object', properties: { thread_id: { type: 'string', description: 'Off-chain debate thread id' }, dimension: { type: 'string', enum: ['DATA_INTEGRITY', 'ADVERSARIAL_QUALITY', 'DECISION_LOGIC', 'RISK_MANAGEMENT', 'CALIBRATION_ALIGNMENT', 'NOVELTY'] }, reward_native: { type: 'string', description: `Bounty reward in ${DEFAULT_CHAIN.nativeSymbol} (e.g. "0.01")` }, reward_okb: { type: 'string', description: 'Deprecated X Layer alias for reward_native' }, claim_window_secs: { type: 'number', default: 0, description: 'Seconds until the poster can reclaim (0 = contract default, 7 days)' } }, required: ['thread_id', 'dimension'] } },
  { name: 'bobby_bounty_challenge', description: 'Build unsigned calldata to submit a challenge (evidence hash) against an existing bounty.', inputSchema: { type: 'object', properties: { bounty_id: { type: 'string', description: 'Bounty id to challenge' }, evidence_hash: { type: 'string', description: '32-byte hex hash of the evidence blob (IPFS/Arweave CID hash)' } }, required: ['bounty_id', 'evidence_hash'] } },
  { name: 'bobby_wheel_evaluate', description: 'Pressure-test a b1nary Wheel leg (covered put or covered call) before committing collateral. Pulls live quotes from b1nary, applies Bobby guardrails (strike distance, expiry window, annualized yield floor, regime gate) and returns SELL / SKIP / WAIT verdict with explainable reasoning. Source chain: Base (8453); X Layer execution pending b1nary deployment.', inputSchema: { type: 'object', properties: { asset: { type: 'string', enum: ['eth', 'cbbtc'], description: 'Underlying asset' }, side: { type: 'string', enum: ['put', 'call'], description: 'Option side to sell' }, strike: { type: 'number', description: 'Proposed strike price' }, expiry_days: { type: 'number', description: 'Days to expiry' }, collateral: { type: 'number', description: 'Collateral amount in the leg\'s quote token (USDC for puts, underlying for calls). Defaults to 1× the leg notional.' } }, required: ['asset', 'side', 'strike', 'expiry_days'] } },
  { name: 'bobby_wheel_positions', description: 'Read-only snapshot of a wallet\'s live positions on b1nary plus Bobby\'s current regime context. Use bobby_wheel_evaluate to pressure-test new legs or rolls. Source chain: Base (8453).', inputSchema: { type: 'object', properties: { address: { type: 'string', description: 'EVM wallet address to inspect' } }, required: ['address'] } },
];

// ---- Tool Execution ----
/** Codex r2 #4: `args.symbol` was interpolated raw into two PostgREST URLs, so
 *  `NVDAc&select=id` rewrote the query. tools/call does not enforce inputSchema. */
function symbolFilterFor(raw: unknown): string {
  if (raw === undefined || raw === null || raw === '') return '';
  // Codex r4 P2: `_` and `%` are ilike wildcards — `___` matched any 3-char ticker. Neither may pass.
  if (typeof raw !== 'string' || !/^[A-Za-z0-9.-]{1,32}$/.test(raw)) {
    throw new Error('symbol must match [A-Za-z0-9.-]{1,32}');
  }
  // Codex r3 P2: `eq` is case-sensitive and stock threads are mixed-case
  // ("NVDAc"), so upper-casing made the lookup empty. `ilike` with no wildcard
  // is a case-insensitive equality — the allow-list above excludes % and _.
  return `&symbol=ilike.${encodeURIComponent(raw)}`;
}

async function executeTool(name: string, args: Record<string, any>): Promise<{ content: Array<{ type: string; text: string }> }> {
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
    const data = await res.json() as { summary?: unknown };
    return { content: [{ type: 'text', text: JSON.stringify(data.summary, null, 2) }] };
  }

  if (name === 'bobby_intel') {
    // Token-efficient: only fetch leaderboard when explicitly requested
    const sections = args.sections as string | undefined;
    const wantsLeaderboard = !sections || sections.includes('leaderboard') || sections.includes('traders');

    const promises: Promise<unknown>[] = [fetch(`${BASE_URL}/api/bobby-intel`).then(r => r.json())];
    if (wantsLeaderboard) {
      promises.push(Promise.resolve(null)); // OKX OnchainOS smart-money leaderboard retired 2026-09-03
    }

    const [intelData, lbData] = await Promise.all(promises) as [{ briefing?: string }, { leaderboard?: unknown[] } | null];
    let text = intelData.briefing || '';

    if (wantsLeaderboard && lbData?.leaderboard?.length) {
      const rows = lbData.leaderboard.slice(0, 5).map((w: any, i: number) => {
        const addr = w.address ? `${w.address.slice(0, 6)}...${w.address.slice(-4)}` : 'unknown';
        const pnl = w.pnl != null ? `${w.pnl >= 0 ? '+' : ''}${Number(w.pnl).toFixed(2)}%` : 'N/A';
        const vol = w.volume != null ? `$${Number(w.volume).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : 'N/A';
        return `  ${i + 1}. ${addr} | PnL: ${pnl} | Vol: ${vol}${w.chain ? ` | ${w.chain}` : ''}`;
      });
      text += `\n\n--- Smart Money Leaderboard ---\n${rows.join('\n')}`;
    }

    // Section filtering — agents can request only what they need
    if (sections && text) {
      const wanted = new Set(sections.split(',').map(s => s.trim().toLowerCase()));
      const sectionMap: Record<string, string> = {
        prices: 'LIVE_PRICES', regime: 'MARKET_REGIME', whale: 'WHALE_SIGNALS',
        sentiment: 'SENTIMENT', technical: 'TECHNICAL_PULSE', macro: 'MACRO_CONTEXT',
        funding: 'FUNDING_RATES', oi: 'OPEN_INTEREST', prediction: 'PREDICTION_MARKETS',
        traders: 'TOP_TRADERS_POSITIONING', security: 'TOKEN_SECURITY',
        calibration: 'CALIBRATION', conviction: 'CONVICTION_MODEL', meta: 'AGENT_META',
      };
      const filtered: string[] = [];
      for (const [key, tag] of Object.entries(sectionMap)) {
        if (wanted.has(key)) {
          const regex = new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, 'i');
          const match = text.match(regex);
          if (match) filtered.push(match[0]);
        }
      }
      if (filtered.length > 0) text = filtered.join('\n\n');
    }

    return { content: [{ type: 'text', text }] };
  }

  if (name === 'bobby_brief') {
    // One-shot compact briefing: signal + record + guardrails in ~400 tokens
    const SB_URL_MCP = bobbyDbUrl();
    const SB_KEY_MCP = bobbyReadKey();
    const symbolFilter = symbolFilterFor(args.symbol);

    const [threadRes, repRes, intelRes] = await Promise.all([
      fetch(`${SB_URL_MCP}/rest/v1/forum_threads?scope=eq.public&resolution=eq.pending&entry_price=not.is.null&order=created_at.desc&limit=1${symbolFilter}&select=symbol,direction,conviction_score,entry_price,stop_price,target_price,expires_at`, {
        headers: { apikey: SB_KEY_MCP, Authorization: `Bearer ${SB_KEY_MCP}` },
      }).then(r => r.json()).catch(() => []),
      fetch(`${BASE_URL}/api/reputation`).then(r => r.json()).catch(() => ({})),
      fetch(`${BASE_URL}/api/bobby-intel`).then(r => r.json()).catch(() => ({})),
    ]);

    const threads = threadRes as Array<Record<string, unknown>>;
    const t = threads[0] || null;
    const rep = (repRes as Record<string, unknown>).reputation as Record<string, unknown> || {};
    const trust = ((repRes as Record<string, unknown>).trustScore as Record<string, unknown>) || {};
    const intel = intelRes as Record<string, unknown>;

    // Extract regime from briefing
    const briefing = (intel.briefing || '') as string;
    const regimeMatch = briefing.match(/<MARKET_REGIME>(.*?)<\/MARKET_REGIME>/);
    const regime = regimeMatch ? regimeMatch[1] : 'unknown';

    const conv = t ? (t.conviction_score as number) || 0 : 0;
    const actionable = t && conv >= 0.35 && t.direction !== 'none';

    const brief = {
      regime,
      signal: t ? {
        symbol: t.symbol,
        direction: (t.direction as string || '').toUpperCase(),
        conviction: parseFloat((conv * 10).toFixed(1)),
        entry: t.entry_price,
        stop: t.stop_price,
        target: t.target_price,
        verdict: actionable ? 'ACTIONABLE' : 'OBSERVE',
        expires: t.expires_at,
      } : null,
      record: {
        trust_score: trust.score || 0,
        commitments: rep.totalCommitments || 0,
        win_rate: rep.winRate || 0,
      },
      guardrails: 'fail-closed: conviction>=3.5, mandatory stop, circuit breaker, 20% drawdown kill',
      mcp: `${BASE_URL}/api/mcp-http`,
    };
    return { content: [{ type: 'text', text: JSON.stringify(brief, null, 2) }] };
  }

  if (name === 'bobby_uniswap_quote') {
    const quote = await getUniswapCompatibleQuote(args);
    return { content: [{ type: 'text', text: JSON.stringify(quote, null, 2) }] };
  }

  if (name === 'bobby_recommend') {
    const SB_URL_MCP = bobbyDbUrl();
    const SB_KEY_MCP = bobbyReadKey();
    const symbolFilter = symbolFilterFor(args.symbol);
    const threadsRes = await fetch(
      `${SB_URL_MCP}/rest/v1/forum_threads?scope=eq.public&resolution=eq.pending&entry_price=not.is.null&order=created_at.desc&limit=5${symbolFilter}&select=symbol,direction,conviction_score,entry_price,stop_price,target_price,trigger_reason,created_at,expires_at,debate_quality`,
      { headers: { apikey: SB_KEY_MCP, Authorization: `Bearer ${SB_KEY_MCP}` } }
    );
    const threads = await threadsRes.json() as Array<Record<string, unknown>>;
    const latest = threads[0] || null;

    if (!latest) {
      return { content: [{ type: 'text', text: JSON.stringify({
        recommendation: 'NO_SIGNAL',
        reason: 'No active debate threads with trade parameters. Bobby is in observation mode.',
        guardrails: { conviction_gate: '3.5/10 minimum', status: 'all_armed', fail_closed: true },
        next_cycle: 'Bobby debates every 15 minutes. Check back soon.',
      }, null, 2) }] };
    }

    const conv = (latest.conviction_score as number) || 0;
    const direction = latest.direction as string || 'none';
    const actionable = conv >= 0.35 && direction !== 'none';
    const quality = latest.debate_quality as Record<string, unknown> | null;

    const rec = {
      recommendation: actionable ? 'ACTIONABLE' : 'OBSERVE',
      signal: {
        symbol: latest.symbol,
        direction: direction.toUpperCase(),
        conviction: parseFloat((conv * 10).toFixed(1)),
        conviction_label: conv >= 0.7 ? 'HIGH' : conv >= 0.35 ? 'MEDIUM' : 'LOW',
        entry_price: latest.entry_price,
        stop_loss: latest.stop_price,
        target: latest.target_price,
        risk_reward: latest.stop_price && latest.target_price && latest.entry_price
          ? parseFloat((Math.abs((latest.target_price as number) - (latest.entry_price as number)) / Math.abs((latest.entry_price as number) - (latest.stop_price as number))).toFixed(2))
          : null,
        debate_quality_score: quality?.overall_score ?? null,
        expires_at: latest.expires_at,
        generated_at: latest.created_at,
      },
      verdict: {
        status: actionable ? 'allow' : 'deny',
        reason: actionable
          ? `Conviction ${(conv * 10).toFixed(1)}/10 passed conviction gate. Stop loss at $${latest.stop_price}. Target at $${latest.target_price}.`
          : latest.trigger_reason || `Conviction ${(conv * 10).toFixed(1)}/10 below 3.5/10 threshold. Bobby recommends waiting.`,
      },
      guardrails: {
        conviction_gate: conv >= 0.35 ? 'PASSED' : 'BLOCKED',
        stop_loss: latest.stop_price ? 'SET' : 'MISSING',
        circuit_breaker: 'ARMED',
        fail_closed: true,
      },
      usage: actionable
        ? 'This signal passed Bobby\'s 11 guardrails. Your agent can use entry/stop/target to size and execute. Bobby does not execute — your agent decides.'
        : 'Bobby recommends NO TRADE at this conviction level. Check back next cycle (every 15 min).',
    };
    return { content: [{ type: 'text', text: JSON.stringify(rec, null, 2) }] };
  }

  if (name === 'bobby_stats') {
    const [repRes, cpRes] = await Promise.all([
      fetch(`${BASE_URL}/api/reputation`).then(r => r.json()).catch(() => null),
      fetch(`${BASE_URL}/api/checkpoint?hours=24`).then(r => r.json()).catch(() => null),
    ]);
    const rep = (repRes as Record<string, unknown>) || {};
    const reputation = rep.reputation as Record<string, unknown> || {};
    const trust = rep.trustScore as Record<string, unknown> || {};
    const cp = (cpRes as Record<string, unknown>) || {};
    const rd = cp.risk_decisions as Record<string, unknown> || {};
    const stats = {
      protocol: 'Bobby Protocol',
      track_record: {
        total_trades_resolved: reputation.totalTrades || 0,
        total_commitments: reputation.totalCommitments || 0,
        wins: reputation.wins || 0,
        losses: reputation.losses || 0,
        win_rate_pct: reputation.winRate || 0,
        cumulative_pnl_pct: reputation.cumulativePnlPct || 0,
        pending_resolution: reputation.pendingResolution || 0,
      },
      trust_score: trust.score || 0,
      last_24h: {
        debates: rd.total_debates || 0,
        executed: rd.executed || 0,
        blocked: rd.blocked || 0,
        block_rate_pct: rd.block_rate_pct || 0,
        avg_conviction: rd.avg_conviction || 0,
      },
      guardrails: {
        conviction_gate: '3.5/10 minimum',
        stop_loss: 'mandatory',
        circuit_breaker: '3 consecutive losses',
        drawdown_kill: '20% max',
        fail_closed: true,
      },
      mcp_endpoint: `${BASE_URL}/api/mcp-http`,
      harness_console: `${BASE_URL}/protocol/harness`,
    };
    return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
  }

  if (name === 'bobby_wallet_balance') {
    const res = await fetch(`${BASE_URL}/api/bobby-wallet`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...internalAuthHeaders() },
      body: JSON.stringify({ action: 'balance', params: { chain: args.chain || 'base' } }),
    });
    return { content: [{ type: 'text', text: JSON.stringify(await res.json(), null, 2) }] };
  }

  if (name === 'bobby_wallet_portfolio') {
    const res = await fetch(`${BASE_URL}/api/bobby-wallet`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...internalAuthHeaders() },
      body: JSON.stringify({ action: 'portfolio', params: { address: args.address, chain: args.chain || '8453' } }),
    });
    return { content: [{ type: 'text', text: JSON.stringify(await res.json(), null, 2) }] };
  }

  if (name === 'bobby_security_scan') {
    const res = await fetch(`${BASE_URL}/api/bobby-wallet`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...internalAuthHeaders() },
      body: JSON.stringify({ action: 'scan-token', params: { address: args.address, chain: args.chain || '1' } }),
    });
    return { content: [{ type: 'text', text: JSON.stringify(await res.json(), null, 2) }] };
  }

  if (name === 'bobby_dex_trending') {
    const res = await fetch(`${BASE_URL}/api/bobby-wallet`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...internalAuthHeaders() },
      body: JSON.stringify({ action: 'trending', params: { chain: args.chain || '1' } }),
    });
    return { content: [{ type: 'text', text: JSON.stringify(await res.json(), null, 2) }] };
  }

  if (name === 'bobby_dex_signals') {
    const res = await fetch(`${BASE_URL}/api/bobby-wallet`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...internalAuthHeaders() },
      body: JSON.stringify({ action: 'signals', params: { chain: args.chain || '1', type: args.type || 'smart_money' } }),
    });
    return { content: [{ type: 'text', text: JSON.stringify(await res.json(), null, 2) }] };
  }

  if (name === 'bobby_judge') {
    const res = await fetch(`${BASE_URL}/api/judge-mode`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...internalAuthHeaders() },
      body: JSON.stringify({ thread_id: args.thread_id || undefined, language: args.language || 'en' }),
    });
    const data = await res.json() as { error?: string; verdict?: any };
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

  if (name === 'bobby_bounty_list') {
    const requested = Number(args.limit || 10);
    const limit = Math.max(1, Math.min(25, Number.isFinite(requested) ? requested : 10));
    const [bounties, minInfo] = await Promise.all([listRecentBounties(limit), readMinBounty()]);
    return {
      content: [{ type: 'text', text: JSON.stringify({
        contract: BOBBY_ADVERSARIAL_BOUNTIES,
        chainId: PROTOCOL_CHAIN_ID,
        minBountyNative: minInfo.minBountyNative,
        nativeSymbol: DEFAULT_CHAIN.nativeSymbol,
        count: bounties.length,
        bounties,
      }, null, 2) }],
    };
  }

  if (name === 'bobby_bounty_get') {
    const id = String(args.bounty_id || '').trim();
    if (!id) throw new Error('bounty_id is required');
    const bounty = await readBounty(id);
    return { content: [{ type: 'text', text: JSON.stringify(bounty, null, 2) }] };
  }

  if (name === 'bobby_bounty_post') {
    const rewardNative = String(args.reward_native || args.reward_okb || '').trim();
    if (!rewardNative || !/^\d+(\.\d+)?$/.test(rewardNative)) {
      throw new Error('reward_native must be a decimal string, e.g. "0.01"');
    }
    const claimWindow = Number(args.claim_window_secs || 0);
    const built = buildPostBountyCalldata({
      threadId: String(args.thread_id || ''),
      dimension: String(args.dimension || ''),
      claimWindowSecs: Number.isFinite(claimWindow) ? claimWindow : 0,
    });
    const valueWei = parseEther(rewardNative);
    return {
      content: [{ type: 'text', text: JSON.stringify({
        kind: 'unsigned_tx',
        chainId: PROTOCOL_CHAIN_ID,
        to: built.to,
        data: built.data,
        value: `0x${valueWei.toString(16)}`,
        valueNative: rewardNative,
        nativeSymbol: DEFAULT_CHAIN.nativeSymbol,
        dimension: built.dimension,
        note: 'Sign and send from your wallet. Bobby never custodies your funds.',
      }, null, 2) }],
    };
  }

  if (name === 'bobby_bounty_challenge') {
    const bountyId = String(args.bounty_id || '').trim();
    if (!bountyId) throw new Error('bounty_id is required');
    const built = buildSubmitChallengeCalldata({
      bountyId,
      evidenceHash: String(args.evidence_hash || ''),
    });
    return {
      content: [{ type: 'text', text: JSON.stringify({
        kind: 'unsigned_tx',
        chainId: PROTOCOL_CHAIN_ID,
        to: built.to,
        data: built.data,
        value: '0x0',
        note: 'Sign and send from your wallet. Evidence must already be pinned off-chain (IPFS/Arweave) before posting.',
      }, null, 2) }],
    };
  }

  if (name === 'bobby_wheel_evaluate') {
    const asset = String(args.asset || '').toLowerCase() as B1naryAsset;
    const side = String(args.side || '').toLowerCase() as B1naryOptionType;
    if (asset !== 'eth' && asset !== 'cbbtc') throw new Error('asset must be eth or cbbtc');
    if (side !== 'put' && side !== 'call') throw new Error('side must be put or call');
    const strike = Number(args.strike);
    const expiryDays = Number(args.expiry_days);
    if (!Number.isFinite(strike) || strike <= 0) throw new Error('strike must be positive');
    if (!Number.isFinite(expiryDays) || expiryDays <= 0) throw new Error('expiry_days must be positive');

    let quotes, spot, capacity;
    try {
      [quotes, spot, capacity] = await Promise.all([
        b1naryGetPrices(asset, side),
        b1naryGetSpot(asset),
        b1naryGetCapacity(asset),
      ]);
    } catch (err) {
      if (err instanceof B1naryCircuitBreakerError) {
        const text = JSON.stringify({
          verdict: 'WAIT',
          conviction: 0,
          reasoning: 'b1nary circuit breaker is active — Bobby fails closed and will not recommend committing collateral.',
          guardrailsTriggered: ['wheel_market_breaker'],
          source_chain: B1NARY_SOURCE_CHAIN_ID,
          deployment_status: B1NARY_DEPLOYMENT_STATUS,
        }, null, 2);
        logHarnessEvent({
          run_id: `wheel-${Date.now()}`,
          agent: 'mcp',
          event_type: 'wheel_verdict',
          tool: 'bobby_wheel_evaluate',
          decision: 'deny',
          reason: 'b1nary circuit breaker active',
          policy_hits: ['wheel_market_breaker'],
          meta: { protocol: 'b1nary', source_chain: B1NARY_SOURCE_CHAIN_ID, asset, side, strike, expiry_days: expiryDays },
        });
        return { content: [{ type: 'text', text }] };
      }
      throw err;
    }

    // Find the quote nearest to the requested strike + expiry to anchor pricing.
    const candidate = quotes
      .map(q => ({ q, score: Math.abs(q.strike - strike) + Math.abs(q.expiry_days - expiryDays) * 10 }))
      .sort((a, b) => a.score - b.score)[0]?.q;

    const premium = candidate?.premium ?? 0;
    // Collateral convention: puts are USDC-collateralized at `strike × amount`,
    // calls are collateralized in the underlying (1 unit = spot-denominated).
    // If the caller didn't pass one, fall back to 1 contract's worth.
    const defaultCollateral = side === 'put' ? strike : spot.spot;
    const collateral = Number.isFinite(Number(args.collateral)) && Number(args.collateral) > 0
      ? Number(args.collateral)
      : defaultCollateral;

    const regimeRes = await fetch(`${BASE_URL}/api/bobby-intel`).then(r => r.json()).catch(() => ({})) as Record<string, unknown>;
    const briefing = typeof regimeRes.briefing === 'string' ? regimeRes.briefing : '';
    const regimeMatch = briefing.match(/<MARKET_REGIME>(.*?)<\/MARKET_REGIME>/);
    const regime = regimeMatch ? regimeMatch[1] : 'unknown';

    const verdict = evaluateWheel({
      asset,
      side,
      strike,
      spot: spot.spot,
      premium,
      collateral,
      expiryDays,
      regime,
      marketOpen: capacity.market_open,
    });

    const runId = `wheel-${Date.now()}`;
    const decision = verdict.verdict === 'SELL' ? 'allow' : verdict.verdict === 'SKIP' ? 'deny' : 'stable';
    logHarnessEvent({
      run_id: runId,
      agent: 'mcp',
      event_type: 'wheel_verdict',
      tool: 'bobby_wheel_evaluate',
      decision,
      conviction: verdict.conviction / 100,
      risk_score: 100 - verdict.conviction,
      policy_hits: verdict.guardrailsTriggered,
      reason: verdict.reasoning,
      meta: {
        protocol: 'b1nary',
        source_chain: B1NARY_SOURCE_CHAIN_ID,
        deployment_status: B1NARY_DEPLOYMENT_STATUS,
        asset,
        side,
        strike,
        expiry_days: expiryDays,
        premium,
        collateral,
        spot: spot.spot,
        annualized_bps: verdict.yield.annualized_bps,
        strike_distance_pct: verdict.strike_distance_pct,
        regime,
      },
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          verdict: verdict.verdict,
          conviction: verdict.conviction,
          reasoning: verdict.reasoning,
          guardrails_triggered: verdict.guardrailsTriggered,
          leg: {
            asset,
            side,
            strike,
            expiry_days: expiryDays,
            premium,
            collateral,
            spot: spot.spot,
            annualized_bps: verdict.yield.annualized_bps,
            strike_distance_pct: Number((verdict.strike_distance_pct * 100).toFixed(3)),
          },
          context: {
            regime,
            market_open: capacity.market_open,
            market_status: capacity.market_status,
          },
          integration: {
            protocol: 'b1nary',
            source_chain: B1NARY_SOURCE_CHAIN_ID,
            deployment_status: B1NARY_DEPLOYMENT_STATUS,
            note: 'Live read-only data from b1nary on Base. X Layer execution path pending b1nary deployment on chain 196.',
          },
        }, null, 2),
      }],
    };
  }

  if (name === 'bobby_wheel_positions') {
    const address = String(args.address || '').trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error('address must be a valid EVM address');

    let positions;
    try {
      positions = await b1naryGetPositions(address);
    } catch (err) {
      if (err instanceof B1naryCircuitBreakerError) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              address,
              positions: [],
              note: 'b1nary circuit breaker active — positions read unavailable.',
              source_chain: B1NARY_SOURCE_CHAIN_ID,
              deployment_status: B1NARY_DEPLOYMENT_STATUS,
            }, null, 2),
          }],
        };
      }
      throw err;
    }

    const regimeRes = await fetch(`${BASE_URL}/api/bobby-intel`).then(r => r.json()).catch(() => ({})) as Record<string, unknown>;
    const briefing = typeof regimeRes.briefing === 'string' ? regimeRes.briefing : '';
    const regimeMatch = briefing.match(/<MARKET_REGIME>(.*?)<\/MARKET_REGIME>/);
    const regime = regimeMatch ? regimeMatch[1] : 'unknown';

    logHarnessEvent({
      run_id: `wheel-snap-${Date.now()}`,
      agent: 'mcp',
      event_type: 'wheel_positions_snapshot',
      tool: 'bobby_wheel_positions',
      reason: `Snapshot ${positions.length} b1nary position(s) for ${address}`,
      meta: {
        protocol: 'b1nary',
        source_chain: B1NARY_SOURCE_CHAIN_ID,
        address,
        count: positions.length,
        regime,
      },
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          address,
          positions,
          count: positions.length,
          bobby_context: {
            regime,
            note: 'Snapshot only. Use bobby_wheel_evaluate to pressure-test a fresh leg, roll, or strike change.',
          },
          integration: {
            protocol: 'b1nary',
            source_chain: B1NARY_SOURCE_CHAIN_ID,
            deployment_status: B1NARY_DEPLOYMENT_STATUS,
            note: 'Positions read from b1nary on Base. Bobby context is global to the current regime, not a per-position verdict.',
          },
        }, null, 2),
      }],
    };
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
    const latestReceipt = await getLatestReceipt().catch(() => null);
    const fee = await readMcpCallFee().catch(() => null);

    return res.status(200).json({
      name: SERVER_NAME,
      version: SERVER_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      description: `Bobby Protocol — The Harness Trading Layer for AI agents. Adaptive trading control plane with adversarial debate, experiential memory, trust scoring, and on-chain settlement on ${DEFAULT_CHAIN.name}.`,
      transport: 'streamable-http',
      endpoints: {
        mcp: '/api/mcp-http',
        legacy: '/api/mcp-bobby',
      },
      pricing: {
        free: TOOLS.filter(t => !PREMIUM_TOOLS.has(t.name)).map(t => t.name),
        premium: {
          tools: Array.from(PREMIUM_TOOLS),
          price: fee ? `${fee.feeNative} ${fee.nativeSymbol}` : 'temporarily unavailable',
          priceWei: fee?.feeWei ?? null,
          protocol: 'x402',
          chainId: PROTOCOL_CHAIN_ID,
          contract: BOBBY_AGENT_ECONOMY,
        },
      },
      counts: {
        totalTools: TOOLS.length,
        freeTools: TOOLS.filter(t => !PREMIUM_TOOLS.has(t.name)).length,
        premiumTools: PREMIUM_TOOLS.size,
      },
      settlement: latestReceipt ? {
        tool: latestReceipt.tool_name,
        txHash: latestReceipt.tx_hash,
        payer: latestReceipt.payer_address,
        valueNative: latestReceipt.value_okb,
        nativeSymbol: DEFAULT_CHAIN.nativeSymbol,
        blockNumber: latestReceipt.block_number,
        explorerUrl: latestReceipt.explorer_url,
        createdAt: latestReceipt.created_at || null,
      } : null,
    });
  }

  if (!await enforcePublicRateLimit(req, res, 'mcp-http', 120, 600)) return;
  if (JSON.stringify(req.body || {}).length > 100_000) {
    return res.status(413).json(jsonrpcError(undefined, -32600, 'Request too large'));
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
  if (Array.isArray(body) && (body.length === 0 || body.length > 20)) {
    return res.status(400).json(jsonrpcError(undefined, -32600, 'Batch must contain 1-20 messages'));
  }
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
      const rawArgs = (params.arguments || {}) as Record<string, any>;
      // Strip demo attribution before passing args to the tool handler — tools
      // never need to see it. Only the generic mcp_call logger consumes it.
      const demoSource = typeof rawArgs.demo_source === 'string' ? rawArgs.demo_source : null;
      const { demo_source: _stripped, ...args } = rawArgs;
      void _stripped;

      if (!toolName) {
        return jsonrpcError(id, -32602, 'Missing tool name');
      }

      // x402 payment gate for premium tools
      let verifiedPayment: Awaited<ReturnType<typeof verifyMcpPaymentTx>> | null = null;
      let claimedChallengeId: string | null = null;

      if (PREMIUM_TOOLS.has(toolName)) {
        const txHash = extractPaymentTxHash(
          req.headers['x-402-payment']
          || req.headers['x-payment']
          || req.headers['authorization'],
        );
        const challengeIdHeader = String(req.headers['x-challenge-id'] || '').trim();

        // BP-08: the challenge is issued FOR this exact request (tool + arguments).
        const requestHash = requestHashFor(toolName, args);
        if (!txHash) {
          // No payment → create challenge, return 402
          const fee = await readMcpCallFee();
          const { challengeId, expiresAt, clientSecret } = await createChallenge(
            toolName,
            fee.feeWei,
            requestHash,
            String(req.headers['x-agent-name'] || '').trim() || undefined,
          );
          void logAgentCommerceEvent({
            source: 'mcp-http',
            tool_name: toolName,
            payment_status: 'challenge_issued',
            external_agent: String(req.headers['x-agent-name'] || '').trim() || null,
            request_ip: req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : null,
            user_agent: String(req.headers['user-agent'] || '').slice(0, 250) || null,
            metadata: {
              challengeId,
              expiresAt,
              chainId: PROTOCOL_CHAIN_ID,
              transport: 'streamable-http',
            },
          });
          return jsonrpcError(id, -32402, `Payment required. ${toolName} costs ${fee.feeNative} ${fee.nativeSymbol} on ${fee.chainName}.`, {
            challengeId,
            expiresAt,
            price: fee.feeNative,
            priceWei: fee.feeWei,
            currency: fee.nativeSymbol,
            protocol: 'x402',
            chain: `${fee.chainName} (${fee.chainId})`,
            chainId: fee.chainId,
            contract: BOBBY_AGENT_ECONOMY,
            method: 'payMCPCall(bytes32 challengeId, string toolName)',
            // BP-08: the secret is shown ONCE; only its holder, repeating the SAME request, can redeem.
            clientSecret,
            instructions: `Call payMCPCall("${challengeId}", "${toolName}") on ${BOBBY_AGENT_ECONOMY} with ${fee.feeNative} ${fee.nativeSymbol}, then retry the identical request with headers x-402-payment: <txHash>, x-challenge-id: ${challengeId} and x-challenge-secret: ${clientSecret}`,
          });
        }

        // Verify on-chain payment
        verifiedPayment = await verifyMcpPaymentTx(txHash, toolName);

        // Atomic consume challenge
        // The challenge id is READ FROM THE PAID TRANSACTION; a header may only
        // confirm it, never replace it (security review 2026-09-03). Missing id = refuse.
        const effectiveChallengeId = verifiedPayment.challengeId;
        if (challengeIdHeader && effectiveChallengeId && challengeIdHeader.toLowerCase() !== effectiveChallengeId.toLowerCase()) {
          return jsonrpcError(id, -32402, 'Challenge id does not match the paid transaction.', { protocol: 'x402' });
        }
        if (!effectiveChallengeId) return jsonrpcError(id, -32402, 'Paid transaction carries no challenge id.', { protocol: 'x402' });
        // BP-08: redemption is authorised by the client secret and bound to the identical request —
        // a public tx hash is payment evidence, never a redemption credential.
        const clientSecret = String(req.headers['x-challenge-secret'] || '').trim();
        const claim = await claimChallenge(effectiveChallengeId, txHash, verifiedPayment.payer, clientSecret, requestHash);
        if (claim.outcome === 'replay') return jsonrpcOk(id, claim.result); // already fulfilled for this client: no second execution
        if (claim.outcome === 'refused') {
          return jsonrpcError(id, -32402, claim.reason, { challengeId: effectiveChallengeId, txHash });
        }
        claimedChallengeId = effectiveChallengeId;
      }

      // Execute the tool. A paid call that fails is left retryable, never consumed.
      let result: Awaited<ReturnType<typeof executeTool>>;
      try {
        result = await executeTool(toolName, args);
      } catch (error) {
        if (claimedChallengeId) await failChallenge(claimedChallengeId, error instanceof Error ? error.message : String(error));
        throw error;
      }
      if (claimedChallengeId) await completeChallenge(claimedChallengeId, result);

      if (!PREMIUM_TOOLS.has(toolName)) {
        void logAgentCommerceEvent({
          source: 'mcp-http',
          tool_name: toolName,
          payment_status: 'free_call',
          external_agent: String(req.headers['x-agent-name'] || '').trim() || null,
          request_ip: req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : null,
          user_agent: String(req.headers['user-agent'] || '').slice(0, 250) || null,
          metadata: {
            arguments: args,
            chainId: PROTOCOL_CHAIN_ID,
            transport: 'streamable-http',
          },
        });
      }

      // Log premium tool usage
      if (verifiedPayment && PREMIUM_TOOLS.has(toolName)) {
        const proof = {
          txHash: verifiedPayment.txHash,
          challengeId: verifiedPayment.challengeId,
          blockNumber: verifiedPayment.blockNumber,
          payer: verifiedPayment.payer,
          valueNative: verifiedPayment.valueNative,
          nativeSymbol: DEFAULT_CHAIN.nativeSymbol,
          contract: BOBBY_AGENT_ECONOMY,
          chainId: PROTOCOL_CHAIN_ID,
          explorerUrl: `${DEFAULT_CHAIN.explorerUrl}/tx/${verifiedPayment.txHash}`,
        };

        // Append proof to response
        result.content.push({
          type: 'text',
          text: `\n\n---\n**On-chain proof:** ${proof.explorerUrl}\nChallenge: ${proof.challengeId} | Block: ${proof.blockNumber} | Paid: ${proof.valueNative} ${proof.nativeSymbol}`,
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
          metadata: { arguments: args, chainId: PROTOCOL_CHAIN_ID, transport: 'streamable-http' },
        });
      }

      // Log harness event for all MCP tool calls
      logHarnessEvent({
        run_id: `mcp_${Date.now()}`,
        agent: 'mcp',
        event_type: 'mcp_call',
        tool: toolName,
        decision: 'allow',
        payment_tx: verifiedPayment?.txHash,
        meta: {
          premium: PREMIUM_TOOLS.has(toolName),
          payer: verifiedPayment?.payer,
          value_native: verifiedPayment?.valueNative,
          agent_name: req.headers['x-agent-name'] || null,
          demo_source: demoSource,
        },
      });

      return isNotification ? null : jsonrpcOk(id, result);
    }

    default:
      return jsonrpcError(id, -32601, `Method not found: ${method}`);
  }
}
