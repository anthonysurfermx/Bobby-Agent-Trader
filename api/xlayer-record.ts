// ============================================================
// POST /api/xlayer-record
// Commit-Reveal Track Record on the configured protocol chain
// Phase 1 (commit): Records prediction BEFORE outcome is known
// Phase 2 (resolve): Records outcome AFTER min time has elapsed
// Audited by Gemini Pro + Codex (2026-03-17)
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ethers } from 'ethers';
import { DEFAULT_CHAIN, txUrl, addressUrl } from './_lib/chains.js';
import { requireRecordAuth } from './_lib/record-auth.js';

// Chain-aware since the Sepolia canary: RPC and addresses follow PROTOCOL_CHAIN.
// Legacy env vars remain as fallback for the X Layer production deployment.
const XLAYER_RPC = DEFAULT_CHAIN.rpcUrl;
const CONTRACT_ADDRESS = DEFAULT_CHAIN.contracts.trackRecord || process.env.BOBBY_CONTRACT_ADDRESS || '';
const ORACLE_ADDRESS = DEFAULT_CHAIN.contracts.convictionOracle || process.env.BOBBY_ORACLE_ADDRESS || '';
const ECONOMY_ADDRESS = DEFAULT_CHAIN.contracts.agentEconomy || process.env.BOBBY_ECONOMY_ADDRESS || '';
const RECORDER_KEY = process.env.BOBBY_RECORDER_KEY || '';

// Agent enum matches contract: CIO=0, ALPHA=1, REDTEAM=2
const AGENT_MAP: Record<string, number> = {
  cio: 0, alpha: 1, redteam: 2,
};

// Result enum matches contract
const RESULT_MAP: Record<string, number> = {
  pending: 0, win: 1, loss: 2, expired: 3, break_even: 4,
};

// Direction enum matches oracle contract: NEUTRAL=0, LONG=1, SHORT=2
const DIRECTION_MAP: Record<string, number> = {
  long: 1, short: 2, none: 0, neutral: 0,
};

// Economy ABI — agent-to-agent payment protocol
const ECONOMY_ABI = [
  'function payDebateFee(bytes32 debateHash) payable',
  'function getEconomyStats() view returns (uint256 _totalDebates, uint256 _totalMCPCalls, uint256 _totalSignalAccesses, uint256 _totalVolume, uint256 _totalPayments)',
  'function debateFeePerAgent() view returns (uint256)',
];

// Oracle ABI — conviction feed for other protocols
const ORACLE_ABI = [
  'function publishSignal((string symbol, uint8 direction, uint8 conviction, uint8 agent, uint96 entryPrice, uint96 targetPrice, uint96 stopPrice, bytes32 debateHash, uint256 ttl))',
  'function getConviction(string _symbol) view returns (uint8 direction, uint8 conviction, uint96 entryPrice, bool isActive)',
];

// Updated ABI — commit-reveal pattern (Codex Audit v3)
const CONTRACT_ABI = [
  // Phase 1
  'function commitTrade(bytes32 _debateHash, string _symbol, uint8 _agent, uint8 _conviction, uint96 _entryPrice, uint96 _targetPrice, uint96 _stopPrice)',
  // Phase 2
  'function resolveTrade(bytes32 _debateHash, int256 _pnlBps, uint8 _result, uint96 _exitPrice)',
  // Views
  'function getWinRate() view returns (uint256)',
  'function totalTrades() view returns (uint256)',
  'function totalCommitments() view returns (uint256)',
  'function pendingCount() view returns (uint256)',
  'function wins() view returns (uint256)',
  'function losses() view returns (uint256)',
  'function totalPnlBps() view returns (int256)',
  'function getAgentStats(uint8 _agent) view returns (uint256 _wins, uint256 _losses, uint256 _total, uint256 _winRate)',
  // Tuple order MUST mirror the storage struct layout (slot-packed since Base r4)
  'function getRecentTrades(uint256 _count) view returns (tuple(bytes32 debateHash, uint96 entryPrice, uint96 exitPrice, uint64 committedAt, uint64 resolvedAt, address recorder, uint8 agent, uint8 conviction, uint8 result, int256 pnlBps, string symbol)[])',
  'function getRecentCommitments(uint256 _count) view returns (tuple(bytes32 debateHash, uint96 entryPrice, uint96 targetPrice, uint64 committedAt, uint96 stopPrice, address recorder, uint64 minResolveAt, uint8 agent, uint8 conviction, bool resolved, string symbol)[])',
];

// Helper: eth_call to contract
async function ethCall(data: string): Promise<string> {
  const res = await fetch(XLAYER_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'eth_call',
      params: [{ to: CONTRACT_ADDRESS, data }, 'latest'],
    }),
  });
  const json = await res.json();
  return json.result || '0x';
}

// keccak256 hash — matches contract's debateHash semantics
// ethers is already imported at top — use its keccak256 directly
function toDebateHash(threadId: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(threadId));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ─── GET: Read on-chain stats ───
  if (req.method === 'GET') {
    if (!CONTRACT_ADDRESS) {
      return res.status(200).json({
        ok: true,
        onchain: false,
        message: 'Contract not deployed yet. Deploy BobbyTrackRecord.sol to X Layer.',
        abi: 'commit-reveal (Audited v3)',
      });
    }

    try {
      // Parallel RPC calls for stats
      const [winRateHex, totalHex, commitsHex, pendingHex, winsHex, lossesHex, pnlHex] = await Promise.all([
        ethCall('0x6f61e432'),  // getWinRate()
        ethCall('0xe275c997'),  // totalTrades()
        ethCall('0x78bb86d3'),  // totalCommitments()
        ethCall('0xea70b4af'),  // pendingCount()
        ethCall('0x24de908d'),  // wins()
        ethCall('0x6f22d6a5'),  // losses()
        ethCall('0x4b9290b8'),  // totalPnlBps()
      ]);

      // Economy stats (non-blocking)
      let economyStats = null;
      if (ECONOMY_ADDRESS) {
        try {
          const economyRes = await fetch(XLAYER_RPC, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0', id: 2, method: 'eth_call',
              params: [{ to: ECONOMY_ADDRESS, data: '0x2576feb5' }, 'latest'], // getEconomyStats() — keccak-derived, old 0x0afe1e28 reverted on V2
            }),
          });
          const economyJson = await economyRes.json();
          if (economyJson.result && economyJson.result !== '0x') {
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
              ['uint256', 'uint256', 'uint256', 'uint256', 'uint256'],
              economyJson.result
            );
            economyStats = {
              totalDebates: Number(decoded[0]),
              totalMCPCalls: Number(decoded[1]),
              totalSignalAccesses: Number(decoded[2]),
              totalVolume: ethers.formatEther(decoded[3]),
              totalPayments: Number(decoded[4]),
            };
          }
        } catch (e) {
          console.warn('[X Layer] Economy stats read failed (non-critical)');
        }
      }

      return res.status(200).json({
        ok: true,
        onchain: true,
        contracts: {
          trackRecord: CONTRACT_ADDRESS,
          convictionOracle: ORACLE_ADDRESS,
          agentEconomy: ECONOMY_ADDRESS,
        },
        chain: `${DEFAULT_CHAIN.name} (${DEFAULT_CHAIN.id})`,
        explorer: addressUrl(CONTRACT_ADDRESS),
        version: 'v3 — Commit-Reveal + Agent Economy (Audited by Gemini + Codex)',
        stats: {
          winRate: parseInt(winRateHex, 16) / 100,
          totalTrades: parseInt(totalHex, 16),
          totalCommitments: parseInt(commitsHex, 16),
          pendingResolution: parseInt(pendingHex, 16),
          wins: parseInt(winsHex, 16),
          losses: parseInt(lossesHex, 16),
          totalPnlBps: parseInt(pnlHex, 16),
        },
        economy: economyStats,
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: 'Failed to read on-chain stats' });
    }
  }

  // ─── POST: Commit or Resolve a trade ───
  if (req.method === 'POST') {
    // Fail-closed: signs txs with the recorder key — never publicly writable.
    if (!requireRecordAuth(req, res)) return;

    const body = (req.body || {}) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action.toLowerCase() : '';

    // ── COMMIT: Record prediction before outcome ──
    if (action === 'commit') {
      const { threadId, symbol, agent, conviction, entryPrice, targetPrice, stopPrice } = body as {
        threadId: string; symbol: string; agent: string;
        conviction: number; entryPrice: number;
        targetPrice?: number; stopPrice?: number;
      };

      const validOptionalPrice = (value: unknown) =>
        value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
      if (
        typeof threadId !== 'string' || threadId.length === 0 || threadId.length > 256 ||
        typeof symbol !== 'string' || !/^[A-Za-z0-9._:-]{1,32}$/.test(symbol) ||
        typeof agent !== 'string' || AGENT_MAP[agent.toLowerCase()] === undefined ||
        typeof conviction !== 'number' || !Number.isFinite(conviction) || conviction < 0 || conviction > 10 ||
        typeof entryPrice !== 'number' || !Number.isFinite(entryPrice) || entryPrice <= 0 ||
        !validOptionalPrice(targetPrice) || !validOptionalPrice(stopPrice)
      ) {
        return res.status(400).json({ error: 'Invalid commit payload' });
      }

      const debateHash = toDebateHash(threadId);
      const agentEnum = AGENT_MAP[agent?.toLowerCase()] ?? 0;

      if (!CONTRACT_ADDRESS || !RECORDER_KEY) {
        // Pre-deploy mode: return what WOULD be committed
        return res.status(200).json({
          ok: true,
          onchain: false,
          action: 'commit',
          message: 'Commitment prepared (contract not deployed yet)',
          data: {
            debateHash,
            symbol,
            agent: agentEnum,
            conviction,
            entryPrice: Math.round(entryPrice * 1e8),
            targetPrice: Math.round((targetPrice || 0) * 1e8),
            stopPrice: Math.round((stopPrice || 0) * 1e8),
          },
        });
      }

      try {
        const provider = new ethers.JsonRpcProvider(XLAYER_RPC);
        const wallet = new ethers.Wallet(RECORDER_KEY, provider);
        const iface = new ethers.Interface(CONTRACT_ABI);
        // Normalize conviction: if float (0.0-1.0), convert to uint8 (0-10)
        const convUint8 = conviction < 2 ? Math.round(conviction * 10) : Math.round(conviction);
        const txData = iface.encodeFunctionData('commitTrade', [
          debateHash, symbol, agentEnum, convUint8,
          BigInt(Math.round(entryPrice * 1e8)),
          BigInt(Math.round((targetPrice || 0) * 1e8)),
          BigInt(Math.round((stopPrice || 0) * 1e8))
        ]);

        // Estimate + 30% headroom — fixed limits caused an out-of-gas on the
        // first Sepolia publishSignal (new-symbol storage writes).
        // Explicit sequential nonces: the three txs fire back-to-back and the
        // RPC may not see the previous one in pending yet, which made ethers
        // reuse a nonce and silently drop the economy fee on canary-002.
        let nonce = await provider.getTransactionCount(wallet.address, 'pending');
        const commitGas = await wallet.estimateGas({ to: CONTRACT_ADDRESS, data: txData });
        const tx = await wallet.sendTransaction({
          to: CONTRACT_ADDRESS,
          data: txData,
          gasLimit: (commitGas * 13n) / 10n,
          nonce: nonce++,
        });

        // Pay debate fee via AgentEconomy (non-blocking)
        let economyTxHash: string | null = null;
        if (ECONOMY_ADDRESS) {
          try {
            const economyIface = new ethers.Interface(ECONOMY_ABI);
            const economyTxData = economyIface.encodeFunctionData('payDebateFee', [debateHash]);
            // Fee is chain-sized (OKB on X Layer, resized ETH on Base) — read it
            // from the contract instead of hardcoding a denomination.
            const economyContract = new ethers.Contract(ECONOMY_ADDRESS, ECONOMY_ABI, provider);
            const feePerAgent = (await economyContract.debateFeePerAgent()) as bigint;
            const economyGas = await wallet.estimateGas({
              to: ECONOMY_ADDRESS, data: economyTxData, value: feePerAgent * 2n,
            });
            const economyTx = await wallet.sendTransaction({
              to: ECONOMY_ADDRESS,
              data: economyTxData,
              value: feePerAgent * 2n, // two counterparties per debate
              gasLimit: (economyGas * 13n) / 10n,
              nonce: nonce++,
            });
            economyTxHash = economyTx.hash;
            console.log(`[${DEFAULT_CHAIN.name}] Debate fee paid: ${economyTx.hash}`);
          } catch (econErr: any) {
            console.warn(`[${DEFAULT_CHAIN.name}] Economy payment failed (non-critical):`, econErr.message);
          }
        }

        // Also publish to ConvictionOracle (non-blocking)
        let oracleTxHash: string | null = null;
        if (ORACLE_ADDRESS) {
          try {
            const oracleIface = new ethers.Interface(ORACLE_ABI);
            const dir = DIRECTION_MAP[String(body.direction || '').toLowerCase()] ?? 0;
            const oracleTxData = oracleIface.encodeFunctionData('publishSignal', [{
              symbol, direction: dir, conviction: convUint8, agent: agentEnum,
              entryPrice: BigInt(Math.round(entryPrice * 1e8)),
              targetPrice: BigInt(Math.round((targetPrice || 0) * 1e8)),
              stopPrice: BigInt(Math.round((stopPrice || 0) * 1e8)),
              debateHash, ttl: 86400n, // 24h
            }]);
            const oracleTx = await wallet.sendTransaction({
              to: ORACLE_ADDRESS,
              data: oracleTxData,
              gasLimit: ((await wallet.estimateGas({ to: ORACLE_ADDRESS, data: oracleTxData })) * 13n) / 10n,
              nonce: nonce++,
            });
            oracleTxHash = oracleTx.hash;
            console.log(`[${DEFAULT_CHAIN.name}] Oracle published: ${oracleTx.hash}`);
          } catch (oracleErr: any) {
            console.warn(`[${DEFAULT_CHAIN.name}] Oracle publish failed (non-critical):`, oracleErr.message);
          }
        }

        return res.status(200).json({
          ok: true,
          onchain: true,
          broadcast: true,
          action: 'commit',
          message: `Commitment broadcast to ${DEFAULT_CHAIN.name}` + (oracleTxHash ? ' + Oracle updated' : '') + (economyTxHash ? ' + Debate fee paid' : ''),
          txHash: tx.hash,
          oracleTxHash,
          economyTxHash,
          explorer: txUrl(tx.hash),
          data: { debateHash, symbol, agent: agentEnum, conviction },
        });
      } catch (err: any) {
        console.error(`[${DEFAULT_CHAIN.name}] Emit Error:`, err);
        return res.status(500).json({ error: 'Failed to broadcast tx: ' + err.message });
      }
    }

    // ── RESOLVE: Record outcome after min time elapsed ──
    if (action === 'resolve') {
      const { threadId, pnlBps, result, exitPrice } = body as {
        threadId: string; pnlBps: number; result: string; exitPrice: number;
      };

      const normalizedResult = typeof result === 'string' ? result.toLowerCase() : '';
      if (
        typeof threadId !== 'string' || threadId.length === 0 || threadId.length > 256 ||
        !['win', 'loss', 'break_even'].includes(normalizedResult) ||
        typeof pnlBps !== 'number' || !Number.isFinite(pnlBps) ||
        typeof exitPrice !== 'number' || !Number.isFinite(exitPrice) || exitPrice <= 0
      ) {
        return res.status(400).json({ error: 'Invalid resolve payload' });
      }

      const debateHash = toDebateHash(threadId);
      const resultEnum = RESULT_MAP[normalizedResult];

      // Coherence checks (mirrors contract invariants — Codex Audit)
      if (normalizedResult === 'win' && pnlBps <= 0) {
        return res.status(400).json({ error: 'WIN must have positive PnL' });
      }
      if (normalizedResult === 'loss' && pnlBps >= 0) {
        return res.status(400).json({ error: 'LOSS must have negative PnL' });
      }
      if (normalizedResult === 'break_even' && pnlBps !== 0) {
        return res.status(400).json({ error: 'BREAK_EVEN must have zero PnL' });
      }

      if (!CONTRACT_ADDRESS || !RECORDER_KEY) {
        return res.status(200).json({
          ok: true,
          onchain: false,
          action: 'resolve',
          message: 'Resolution prepared (contract not deployed yet)',
          data: {
            debateHash,
            pnlBps: Math.round(pnlBps * 100),
            result: resultEnum,
            exitPrice: Math.round(exitPrice * 1e8),
          },
        });
      }

      try {
        const provider = new ethers.JsonRpcProvider(XLAYER_RPC);
        const wallet = new ethers.Wallet(RECORDER_KEY, provider);
        const iface = new ethers.Interface(CONTRACT_ABI);
        const txData = iface.encodeFunctionData('resolveTrade', [
          debateHash, Math.round(pnlBps * 100), resultEnum, Math.round(exitPrice * 1e8)
        ]);
        const tx = await wallet.sendTransaction({
          to: CONTRACT_ADDRESS,
          data: txData
        });

        return res.status(200).json({
          ok: true,
          onchain: true,
          broadcast: true,
          action: 'resolve',
          message: `Resolution broadcast to ${DEFAULT_CHAIN.name}`,
          txHash: tx.hash,
          explorer: txUrl(tx.hash),
          data: { debateHash, result: resultEnum },
        });
      } catch (err: any) {
        console.error(`[${DEFAULT_CHAIN.name}] Emit Error:`, err);
        return res.status(500).json({ error: 'Failed to broadcast resolve tx: ' + err.message });
      }
    }

    return res.status(400).json({ error: 'Invalid action. Use "commit" or "resolve"' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
