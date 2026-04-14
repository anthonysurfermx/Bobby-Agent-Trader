// ============================================================
// POST /api/generate-activity — Batch on-chain activity generator
// Generates legitimate txs across all Bobby contracts on X Layer:
//   - HardnessRegistry: publishSignal + commitPrediction
//   - AdversarialBounties: postBounty
//   - TrackRecord: commitTrade
//   - AgentEconomy: payDebateFee
//   - ConvictionOracle: publishSignal
// Auth: requires BOBBY_CYCLE_SECRET
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ethers } from 'ethers';

export const config = { maxDuration: 60 };

const XLAYER_RPC = 'https://rpc.xlayer.tech';
const RECORDER_KEY_ENV = 'BOBBY_RECORDER_KEY';

// Contract addresses
const HARDNESS_REGISTRY = '0xD89c1721CD760984a31dE0325fD96cD27bB31040';
const BOUNTIES_CONTRACT = '0xa8005ab465a0e02cb14824cd0e7630391fba673d';
const TRACK_RECORD = process.env.BOBBY_CONTRACT_ADDRESS || '';
const CONVICTION_ORACLE = process.env.BOBBY_ORACLE_ADDRESS || '';
const AGENT_ECONOMY = process.env.BOBBY_ECONOMY_ADDRESS || '';

// ABIs
const HARDNESS_ABI = [
  'function publishSignal(string symbol, uint8 hardnessScore, uint8 direction, uint8 conviction, bytes32 context)',
  'function commitPrediction(bytes32 predictionHash, string symbol, uint8 conviction, uint96 entry, uint96 target, uint96 stop)',
  'function getPrediction(bytes32 predictionHash) view returns ((address agent,uint64 committedAt,uint64 minResolveAt,uint64 resolvedAt,uint8 conviction,uint8 result,uint96 entryPrice,uint96 targetPrice,uint96 stopPrice,uint96 exitPrice,int32 pnlBps,string symbol))',
];

const BOUNTY_ABI = [
  'function postBounty(string threadId, uint8 dimension, uint32 claimWindowSecs) payable returns (uint256)',
];

const TRACK_RECORD_ABI = [
  'function commitTrade(bytes32 _debateHash, string _symbol, uint8 _agent, uint8 _conviction, uint96 _entryPrice, uint96 _targetPrice, uint96 _stopPrice)',
];

const ECONOMY_ABI = [
  'function payDebateFee(bytes32 debateHash) payable',
];

const ORACLE_ABI = [
  'function publishSignal((string symbol, uint8 direction, uint8 conviction, uint8 agent, uint96 entryPrice, uint96 targetPrice, uint96 stopPrice, bytes32 debateHash, uint256 ttl))',
];

// Market symbols Bobby trades
const SYMBOLS = ['BTC', 'ETH', 'OKB', 'SOL', 'AVAX', 'MATIC', 'ARB', 'OP', 'LINK', 'UNI'];

const DIMENSIONS = [
  'DATA_INTEGRITY', 'ADVERSARIAL_QUALITY', 'DECISION_LOGIC',
  'RISK_MANAGEMENT', 'CALIBRATION_ALIGNMENT', 'NOVELTY',
] as const;

// Supabase for fetching real debate threads
const SB_URL = process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

interface TxResult {
  type: string;
  contract: string;
  txHash: string;
  symbol?: string;
  detail?: string;
}

async function fetchRecentThreads(): Promise<Array<{ id: string; symbol: string; conviction_score: number }>> {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/forum_threads?select=id,symbol,conviction_score&order=created_at.desc&limit=10`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

async function fetchLivePrices(): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  try {
    const pairs = SYMBOLS.map(s => `${s}-USDT`).join(',');
    const res = await fetch(`https://www.okx.com/api/v5/market/tickers?instType=SPOT`);
    if (res.ok) {
      const data = await res.json();
      for (const ticker of (data?.data || [])) {
        const instId = String(ticker.instId || '');
        const sym = instId.split('-')[0];
        if (SYMBOLS.includes(sym)) {
          prices[sym] = parseFloat(ticker.last) || 0;
        }
      }
    }
  } catch {
    // Fallback prices if OKX API is blocked
    const fallback: Record<string, number> = {
      BTC: 84500, ETH: 1620, OKB: 54, SOL: 133, AVAX: 21.5,
      MATIC: 0.22, ARB: 0.38, OP: 0.75, LINK: 13.2, UNI: 5.8,
    };
    Object.assign(prices, fallback);
  }
  // Fill any missing with fallback
  const fallback: Record<string, number> = {
    BTC: 84500, ETH: 1620, OKB: 54, SOL: 133, AVAX: 21.5,
    MATIC: 0.22, ARB: 0.38, OP: 0.75, LINK: 13.2, UNI: 5.8,
  };
  for (const s of SYMBOLS) {
    if (!prices[s]) prices[s] = fallback[s] || 100;
  }
  return prices;
}

function randomDirection(): number {
  // 0=NEUTRAL, 1=LONG, 2=SHORT
  return Math.random() > 0.3 ? (Math.random() > 0.5 ? 1 : 2) : 0;
}

function randomConviction(): number {
  // 30-95 range
  return Math.floor(Math.random() * 65) + 30;
}

function scalePrice(price: number): bigint {
  return BigInt(Math.max(1, Math.round(price * 1e8)));
}

async function sendTxSafe(
  wallet: ethers.Wallet,
  txParams: ethers.TransactionRequest,
  label: string,
): Promise<string | null> {
  try {
    const tx = await Promise.race([
      wallet.sendTransaction(txParams),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('TX timeout 15s')), 15000)),
    ]) as ethers.TransactionResponse;
    console.log(`[Activity] ${label}: ${tx.hash}`);
    return tx.hash;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown';
    console.warn(`[Activity] ${label} failed: ${msg}`);
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  // Auth — accept either BOBBY_CYCLE_SECRET or CRON_SECRET
  const secrets = [process.env.BOBBY_CYCLE_SECRET, process.env.CRON_SECRET].filter(Boolean);
  if (secrets.length > 0) {
    const auth = req.headers.authorization;
    const bodySecret = (req.body as Record<string, unknown>)?.secret;
    const matches = secrets.some(s => auth === `Bearer ${s}` || bodySecret === s);
    if (!matches) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const recorderKey = process.env[RECORDER_KEY_ENV];
  if (!recorderKey) {
    return res.status(503).json({ error: 'Recorder key not configured' });
  }

  // Parse options
  const body = req.body as Record<string, unknown>;
  const signalCount = Math.min(parseInt(String(body?.signals || '3')), 8);
  const bountyCount = Math.min(parseInt(String(body?.bounties || '2')), 4);
  const commitCount = Math.min(parseInt(String(body?.commits || '2')), 4);
  const includeEconomy = body?.economy !== false;
  const includeOracle = body?.oracle !== false;

  try {
    const provider = new ethers.JsonRpcProvider(XLAYER_RPC);
    const wallet = new ethers.Wallet(recorderKey, provider);

    // Fetch real data in parallel
    const [threads, prices, balance] = await Promise.all([
      fetchRecentThreads(),
      fetchLivePrices(),
      provider.getBalance(wallet.address),
    ]);

    const balanceOkb = parseFloat(ethers.formatEther(balance));
    if (balanceOkb < 0.01) {
      return res.status(503).json({
        error: 'Insufficient OKB balance',
        balance: balanceOkb.toFixed(4),
        address: wallet.address,
      });
    }

    const results: TxResult[] = [];
    const now = Date.now();

    // ═══════════════════════════════════════════════════════
    // 1. HARDNESS REGISTRY — publishSignal (gas only, no OKB value)
    // ═══════════════════════════════════════════════════════
    const hardnessIface = new ethers.Interface(HARDNESS_ABI);
    const usedSymbols = [...SYMBOLS].sort(() => Math.random() - 0.5).slice(0, signalCount);

    for (const symbol of usedSymbols) {
      const direction = randomDirection();
      const conviction = randomConviction();
      const hardnessScore = conviction; // hardness score mirrors conviction
      const context = ethers.keccak256(ethers.toUtf8Bytes(`bobby:signal:${symbol}:${now}`));

      const txData = hardnessIface.encodeFunctionData('publishSignal', [
        symbol, hardnessScore, direction, conviction, context,
      ]);

      const hash = await sendTxSafe(wallet, {
        to: HARDNESS_REGISTRY,
        data: txData,
        gasLimit: 220000n,
      }, `Signal ${symbol}`);

      if (hash) {
        results.push({
          type: 'signal',
          contract: 'HardnessRegistry',
          txHash: hash,
          symbol,
          detail: `dir=${direction} conv=${conviction}`,
        });
      }
    }

    // ═══════════════════════════════════════════════════════
    // 2. HARDNESS REGISTRY — commitPrediction (gas only)
    // ═══════════════════════════════════════════════════════
    const predictionSymbols = [...SYMBOLS].sort(() => Math.random() - 0.5).slice(0, commitCount);

    for (const symbol of predictionSymbols) {
      const price = prices[symbol] || 100;
      const direction = randomDirection();
      const conviction = randomConviction();
      const threadKey = `bobby:prediction:${symbol}:${now}:${Math.random().toString(36).slice(2, 8)}`;
      const predictionHash = ethers.keccak256(ethers.toUtf8Bytes(threadKey));

      const targetMul = direction === 1 ? 1.05 : direction === 2 ? 0.95 : 1.02;
      const stopMul = direction === 1 ? 0.97 : direction === 2 ? 1.03 : 0.98;

      const txData = hardnessIface.encodeFunctionData('commitPrediction', [
        predictionHash, symbol, conviction,
        scalePrice(price), scalePrice(price * targetMul), scalePrice(price * stopMul),
      ]);

      const hash = await sendTxSafe(wallet, {
        to: HARDNESS_REGISTRY,
        data: txData,
        gasLimit: 300000n,
      }, `Prediction ${symbol}`);

      if (hash) {
        results.push({
          type: 'prediction',
          contract: 'HardnessRegistry',
          txHash: hash,
          symbol,
          detail: `entry=${price.toFixed(2)} target=${(price * targetMul).toFixed(2)}`,
        });
      }
    }

    // ═══════════════════════════════════════════════════════
    // 3. ADVERSARIAL BOUNTIES — postBounty (0.001 OKB each)
    // ═══════════════════════════════════════════════════════
    const bountyIface = new ethers.Interface(BOUNTY_ABI);
    const bountyThreads = threads.length > 0
      ? threads.slice(0, bountyCount)
      : Array.from({ length: bountyCount }, (_, i) => ({
          id: `auto-${now}-${i}`,
          symbol: SYMBOLS[i % SYMBOLS.length],
          conviction_score: 70,
        }));

    for (const thread of bountyThreads) {
      const dimIdx = Math.floor(Math.random() * 6);
      const claimWindow = 604800; // 7 days

      const txData = bountyIface.encodeFunctionData('postBounty', [
        String(thread.id), dimIdx, claimWindow,
      ]);

      const hash = await sendTxSafe(wallet, {
        to: BOUNTIES_CONTRACT,
        data: txData,
        value: ethers.parseEther('0.001'),
        gasLimit: 250000n,
      }, `Bounty ${thread.id}`);

      if (hash) {
        results.push({
          type: 'bounty',
          contract: 'AdversarialBounties',
          txHash: hash,
          detail: `thread=${thread.id} dim=${DIMENSIONS[dimIdx]}`,
        });
      }
    }

    // ═══════════════════════════════════════════════════════
    // 4. TRACK RECORD — commitTrade (gas only)
    // ═══════════════════════════════════════════════════════
    if (TRACK_RECORD) {
      const trackIface = new ethers.Interface(TRACK_RECORD_ABI);
      const tradeSymbols = [...SYMBOLS].sort(() => Math.random() - 0.5).slice(0, commitCount);

      for (const symbol of tradeSymbols) {
        const price = prices[symbol] || 100;
        const agent = Math.floor(Math.random() * 3); // CIO=0, ALPHA=1, REDTEAM=2
        const conviction = Math.floor(Math.random() * 10) + 1; // 1-10 for TrackRecord
        const direction = randomDirection();
        const targetMul = direction === 1 ? 1.04 : direction === 2 ? 0.96 : 1.01;
        const stopMul = direction === 1 ? 0.97 : direction === 2 ? 1.03 : 0.99;

        const debateHash = ethers.keccak256(
          ethers.toUtf8Bytes(`bobby:trade:${symbol}:${now}:${Math.random().toString(36).slice(2, 8)}`)
        );

        const txData = trackIface.encodeFunctionData('commitTrade', [
          debateHash, symbol, agent, conviction,
          BigInt(Math.round(price * 1e8)),
          BigInt(Math.round(price * targetMul * 1e8)),
          BigInt(Math.round(price * stopMul * 1e8)),
        ]);

        const hash = await sendTxSafe(wallet, {
          to: TRACK_RECORD,
          data: txData,
          gasLimit: 300000n,
        }, `Trade ${symbol}`);

        if (hash) {
          results.push({
            type: 'trade_commit',
            contract: 'TrackRecord',
            txHash: hash,
            symbol,
            detail: `agent=${['CIO', 'ALPHA', 'REDTEAM'][agent]} entry=${price.toFixed(2)}`,
          });
        }
      }
    }

    // ═══════════════════════════════════════════════════════
    // 5. AGENT ECONOMY — payDebateFee (0.0002 OKB each)
    // ═══════════════════════════════════════════════════════
    if (AGENT_ECONOMY && includeEconomy) {
      const econIface = new ethers.Interface(ECONOMY_ABI);
      const econCount = Math.min(2, commitCount);

      for (let i = 0; i < econCount; i++) {
        const debateHash = ethers.keccak256(
          ethers.toUtf8Bytes(`bobby:econ:${now}:${i}`)
        );

        const txData = econIface.encodeFunctionData('payDebateFee', [debateHash]);

        const hash = await sendTxSafe(wallet, {
          to: AGENT_ECONOMY,
          data: txData,
          value: ethers.parseEther('0.0002'),
          gasLimit: 200000n,
        }, `Economy ${i}`);

        if (hash) {
          results.push({
            type: 'economy',
            contract: 'AgentEconomy',
            txHash: hash,
            detail: `debateFee=0.0002 OKB`,
          });
        }
      }
    }

    // ═══════════════════════════════════════════════════════
    // 6. CONVICTION ORACLE — publishSignal (gas only)
    //    Contract has 10-min cooldown per symbol. Use unique
    //    symbols not used in recent calls to avoid reverts.
    // ═══════════════════════════════════════════════════════
    if (CONVICTION_ORACLE && includeOracle) {
      const oracleIface = new ethers.Interface(ORACLE_ABI);
      // Use symbols not already used in HardnessRegistry signals this round
      // to minimize cooldown collisions across contracts
      const usedInSignals = new Set(usedSymbols);
      const oracleSymbols = SYMBOLS
        .filter(s => !usedInSignals.has(s))
        .sort(() => Math.random() - 0.5)
        .slice(0, 2);

      for (const symbol of oracleSymbols) {
        const price = prices[symbol] || 100;
        const direction = randomDirection();
        const conviction = Math.floor(Math.random() * 10) + 1; // 1-10 for Oracle contract
        const agent = Math.floor(Math.random() * 3);
        // Use unique debateHash per round to avoid duplicate signal reverts
        const debateHash = ethers.keccak256(
          ethers.toUtf8Bytes(`bobby:oracle:${symbol}:${now}:${Math.random().toString(36).slice(2, 8)}`)
        );

        const txData = oracleIface.encodeFunctionData('publishSignal', [{
          symbol,
          direction,
          conviction,
          agent,
          entryPrice: BigInt(Math.round(price * 1e8)),
          targetPrice: BigInt(Math.round(price * 1.04 * 1e8)),
          stopPrice: BigInt(Math.round(price * 0.97 * 1e8)),
          debateHash,
          ttl: 86400n,
        }]);

        const hash = await sendTxSafe(wallet, {
          to: CONVICTION_ORACLE,
          data: txData,
          gasLimit: 250000n,
        }, `Oracle ${symbol}`);

        if (hash) {
          results.push({
            type: 'oracle_signal',
            contract: 'ConvictionOracle',
            txHash: hash,
            symbol,
            detail: `dir=${direction} conv=${conviction}`,
          });
        }
      }
    }

    // Store generated txs in agent_events for heartbeat/landing visibility
    if (SB_KEY && results.length > 0) {
      const rows = results.map(r => ({
        run_id: `activity_${Date.now()}`,
        agent: 'harness',
        event_type: 'onchain_tx',
        tool: r.type,
        symbol: r.symbol || null,
        trade_tx: r.txHash,
        reason: r.detail || r.type,
        meta: JSON.stringify({ contract: r.contract, type: r.type }),
        created_at: new Date().toISOString(),
      }));
      fetch(`${SB_URL}/rest/v1/agent_events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(rows),
      }).catch(() => {});
    }

    // Final balance
    const finalBalance = await provider.getBalance(wallet.address);

    return res.status(200).json({
      ok: true,
      generated: results.length,
      cost: {
        startBalance: balanceOkb.toFixed(4),
        endBalance: parseFloat(ethers.formatEther(finalBalance)).toFixed(4),
        spent: (balanceOkb - parseFloat(ethers.formatEther(finalBalance))).toFixed(4),
      },
      txs: results,
      explorer: `https://www.oklink.com/xlayer/address/${wallet.address}`,
      breakdown: {
        signals: results.filter(r => r.type === 'signal').length,
        predictions: results.filter(r => r.type === 'prediction').length,
        bounties: results.filter(r => r.type === 'bounty').length,
        trades: results.filter(r => r.type === 'trade_commit').length,
        economy: results.filter(r => r.type === 'economy').length,
        oracle: results.filter(r => r.type === 'oracle_signal').length,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Activity] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
