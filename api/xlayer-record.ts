// ============================================================
// POST /api/xlayer-record
// Commit-Reveal Track Record on X Layer
// Phase 1 (commit): Records prediction BEFORE outcome is known
// Phase 2 (resolve): Records outcome AFTER min time has elapsed
// Audited by Gemini Pro + Codex (2026-03-17)
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ethers } from 'ethers';

const XLAYER_RPC = 'https://rpc.xlayer.tech';
const CONTRACT_ADDRESS = process.env.BOBBY_CONTRACT_ADDRESS || '';
const ORACLE_ADDRESS = process.env.BOBBY_ORACLE_ADDRESS || '';
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
  'function getRecentTrades(uint256 _count) view returns (tuple(bytes32 debateHash, string symbol, uint8 agent, int256 pnlBps, uint8 conviction, uint8 result, uint256 entryPrice, uint256 exitPrice, uint256 committedAt, uint256 resolvedAt, address recorder)[])',
  'function getRecentCommitments(uint256 _count) view returns (tuple(bytes32 debateHash, string symbol, uint8 agent, uint8 conviction, uint256 entryPrice, uint256 targetPrice, uint256 stopPrice, uint256 committedAt, address recorder, bool resolved)[])',
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
        ethCall('0x5e7a3e56'),  // getWinRate()
        ethCall('0xc4e41b22'),  // totalTrades()
        ethCall('0xe8a4c04e'),  // totalCommitments() — new
        ethCall('0xf39a3c85'),  // pendingCount() — new
        ethCall('0xc09b1ab3'),  // wins()
        ethCall('0xfda49eb4'),  // losses()
        ethCall('0x8c871019'),  // totalPnlBps()
      ]);

      return res.status(200).json({
        ok: true,
        onchain: true,
        contract: CONTRACT_ADDRESS,
        chain: 'X Layer (196)',
        explorer: `https://www.oklink.com/xlayer/address/${CONTRACT_ADDRESS}`,
        version: 'v3 — Commit-Reveal (Audited by Gemini + Codex)',
        stats: {
          winRate: parseInt(winRateHex, 16) / 100,
          totalTrades: parseInt(totalHex, 16),
          totalCommitments: parseInt(commitsHex, 16),
          pendingResolution: parseInt(pendingHex, 16),
          wins: parseInt(winsHex, 16),
          losses: parseInt(lossesHex, 16),
          totalPnlBps: parseInt(pnlHex, 16),
        },
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: 'Failed to read on-chain stats' });
    }
  }

  // ─── POST: Commit or Resolve a trade ───
  if (req.method === 'POST') {
    const { action } = req.body as { action: string };

    // ── COMMIT: Record prediction before outcome ──
    if (action === 'commit') {
      const { threadId, symbol, agent, conviction, entryPrice, targetPrice, stopPrice } = req.body as {
        threadId: string; symbol: string; agent: string;
        conviction: number; entryPrice: number;
        targetPrice?: number; stopPrice?: number;
      };

      if (!threadId || !symbol || conviction == null || !entryPrice) {
        return res.status(400).json({ error: 'Missing: threadId, symbol, conviction, entryPrice' });
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

        const tx = await wallet.sendTransaction({
          to: CONTRACT_ADDRESS,
          data: txData,
          gasLimit: 300000n,
        });

        // Also publish to ConvictionOracle (non-blocking)
        let oracleTxHash: string | null = null;
        if (ORACLE_ADDRESS) {
          try {
            const oracleIface = new ethers.Interface(ORACLE_ABI);
            const dir = DIRECTION_MAP[String(req.body.direction || '').toLowerCase()] ?? 0;
            const oracleTxData = oracleIface.encodeFunctionData('publishSignal', [{
              symbol, direction: dir, conviction: convUint8, agent: agentEnum,
              entryPrice: BigInt(Math.round(entryPrice * 1e8)),
              targetPrice: BigInt(Math.round((targetPrice || 0) * 1e8)),
              stopPrice: BigInt(Math.round((stopPrice || 0) * 1e8)),
              debateHash, ttl: 86400n, // 24h
            }]);
            const oracleTx = await wallet.sendTransaction({
              to: ORACLE_ADDRESS, data: oracleTxData, gasLimit: 200000n,
            });
            oracleTxHash = oracleTx.hash;
            console.log(`[X Layer] Oracle published: ${oracleTx.hash}`);
          } catch (oracleErr: any) {
            console.warn('[X Layer] Oracle publish failed (non-critical):', oracleErr.message);
          }
        }

        return res.status(200).json({
          ok: true,
          onchain: true,
          broadcast: true,
          action: 'commit',
          message: 'Commitment broadcast to X Layer' + (oracleTxHash ? ' + Oracle updated' : ''),
          txHash: tx.hash,
          oracleTxHash,
          explorer: `https://www.oklink.com/xlayer/tx/${tx.hash}`,
          data: { debateHash, symbol, agent: agentEnum, conviction },
        });
      } catch (err: any) {
        console.error('[X Layer] Emit Error:', err);
        return res.status(500).json({ error: 'Failed to broadcast tx: ' + err.message });
      }
    }

    // ── RESOLVE: Record outcome after min time elapsed ──
    if (action === 'resolve') {
      const { threadId, pnlBps, result, exitPrice } = req.body as {
        threadId: string; pnlBps: number; result: string; exitPrice: number;
      };

      if (!threadId || result == null || !exitPrice) {
        return res.status(400).json({ error: 'Missing: threadId, result, exitPrice' });
      }

      const debateHash = toDebateHash(threadId);
      const resultEnum = RESULT_MAP[result?.toLowerCase()] ?? 0;

      // Coherence checks (mirrors contract invariants — Codex Audit)
      if (result === 'win' && pnlBps <= 0) {
        return res.status(400).json({ error: 'WIN must have positive PnL' });
      }
      if (result === 'loss' && pnlBps >= 0) {
        return res.status(400).json({ error: 'LOSS must have negative PnL' });
      }
      if (result === 'break_even' && pnlBps !== 0) {
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
          message: 'Resolution broadcast to X Layer',
          txHash: tx.hash,
          explorer: `https://www.oklink.com/xlayer/tx/${tx.hash}`,
          data: { debateHash, result: resultEnum },
        });
      } catch (err: any) {
        console.error('[X Layer] Emit Error:', err);
        return res.status(500).json({ error: 'Failed to broadcast resolve tx: ' + err.message });
      }
    }

    return res.status(400).json({ error: 'Invalid action. Use "commit" or "resolve"' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
