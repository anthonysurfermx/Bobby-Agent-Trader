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
import { sendWithNonceRetry, waitForSuccessfulReceipt } from './_lib/chain-tx.js';
import {
  PRICE_MODE,
  PYTH_ABI,
  TRACK_RECORD_V2_ABI,
  canonicalizeTrackSymbol,
  feedForSymbol,
  fetchHermesPriceUpdate,
  hermesUrlForPyth,
  isTrackRecordV2,
  modeForSymbol,
  numberToE8,
  pnlBpsFromOracle,
  pythPriceToE8,
  resultFromPnlBps,
  toV1DebateHash,
  toV2DebateHash,
  type PriceMode,
} from './_lib/track-record-v2.js';
import {
  assertProviderChain,
  recorderKeyEnvForChain,
  requireProtocolWriteSafety,
} from './_lib/protocol-write-safety.js';

// Chain-aware since the Sepolia canary: RPC and addresses follow PROTOCOL_CHAIN.
// Legacy env vars remain as fallback for the X Layer production deployment.
const XLAYER_RPC = DEFAULT_CHAIN.rpcUrl;
const CONTRACT_ADDRESS = DEFAULT_CHAIN.contracts.trackRecord || process.env.BOBBY_CONTRACT_ADDRESS || '';
const ORACLE_ADDRESS = DEFAULT_CHAIN.contracts.convictionOracle || process.env.BOBBY_ORACLE_ADDRESS || '';
const ECONOMY_ADDRESS = DEFAULT_CHAIN.contracts.agentEconomy || process.env.BOBBY_ECONOMY_ADDRESS || '';
const RECORDER_KEY_ENV = recorderKeyEnvForChain(DEFAULT_CHAIN.id);
const RECORDER_KEY = process.env[RECORDER_KEY_ENV] || '';
const USE_TRACK_RECORD_V2 = isTrackRecordV2(DEFAULT_CHAIN.id);

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
const TRACK_RECORD_V1_ABI = [
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

function debateHashFor(threadId: string, symbol: string, mode: PriceMode): string {
  return USE_TRACK_RECORD_V2
    ? toV2DebateHash(threadId, symbol, mode)
    : toV1DebateHash(threadId);
}

async function readV2Stats() {
  const provider = new ethers.JsonRpcProvider(XLAYER_RPC);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, TRACK_RECORD_V2_ABI, provider);
  const [totalTrades, totalCommitments, pendingCount, scorecard, winsAttested, lossesAttested, pnlAttested, attestedWinRate] =
    await Promise.all([
      contract.totalTrades(),
      contract.totalCommitments(),
      contract.pendingCount(),
      contract.getVerifiedScorecard(),
      contract.winsAttested(),
      contract.lossesAttested(),
      contract.totalPnlBpsAttested(),
      contract.getAttestedWinRate(),
    ]);

  return {
    winRate: Number(scorecard.winRateBps) / 100,
    totalTrades: Number(scorecard.resolved),
    totalCommitments: Number(scorecard.resolved) + Number(scorecard.expired) + Number(scorecard.pending),
    pendingResolution: Number(scorecard.pending),
    wins: Number(await contract.winsVerified()),
    losses: Number(await contract.lossesVerified()),
    totalPnlBps: Number(await contract.totalPnlBpsVerified()),
    verified: {
      winRateBps: Number(scorecard.winRateBps),
      decided: Number(scorecard.decided),
      resolved: Number(scorecard.resolved),
      expired: Number(scorecard.expired),
      pending: Number(scorecard.pending),
      resolutionBps: Number(scorecard.resolutionBps),
    },
    attested: {
      winRateBps: Number(attestedWinRate),
      wins: Number(winsAttested),
      losses: Number(lossesAttested),
      totalPnlBps: Number(pnlAttested),
    },
    allModes: {
      totalTrades: Number(totalTrades),
      totalCommitments: Number(totalCommitments),
      pending: Number(pendingCount),
    },
  };
}

async function readV1Stats() {
  const provider = new ethers.JsonRpcProvider(XLAYER_RPC);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, TRACK_RECORD_V1_ABI, provider);
  const [winRate, totalTrades, totalCommitments, pendingCount, wins, losses, totalPnlBps] =
    await Promise.all([
      contract.getWinRate(),
      contract.totalTrades(),
      contract.totalCommitments(),
      contract.pendingCount(),
      contract.wins(),
      contract.losses(),
      contract.totalPnlBps(),
    ]);
  return {
    winRate: Number(winRate) / 100,
    totalTrades: Number(totalTrades),
    totalCommitments: Number(totalCommitments),
    pendingResolution: Number(pendingCount),
    wins: Number(wins),
    losses: Number(losses),
    totalPnlBps: Number(totalPnlBps),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ─── GET: Read on-chain stats ───
  if (req.method === 'GET') {
    if (!CONTRACT_ADDRESS) {
      return res.status(200).json({
        ok: true,
        onchain: false,
        message: `TrackRecord is not configured for ${DEFAULT_CHAIN.name}.`,
        abi: USE_TRACK_RECORD_V2 ? 'TrackRecordV2 oracle-verified' : 'TrackRecordV1 legacy',
      });
    }

    try {
      // Never send v1 selectors to V2. The V2 public score is verified-only;
      // attested data remains a separate disclosure and is never combined.
      const trackStats = USE_TRACK_RECORD_V2
        ? await readV2Stats()
        : await readV1Stats();

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
          const economyJson = await economyRes.json() as { result?: string };
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
        version: USE_TRACK_RECORD_V2
          ? 'v2 — Oracle-verified + attested ledgers'
          : 'v1 — Commit-Reveal legacy',
        stats: trackStats,
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
    if (!requireProtocolWriteSafety(res, ['trackRecord'])) return;

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

      let canonicalSymbol: string;
      try {
        canonicalSymbol = USE_TRACK_RECORD_V2 ? canonicalizeTrackSymbol(symbol) : symbol;
      } catch (error) {
        return res.status(400).json({ error: (error as Error).message });
      }
      const mode = modeForSymbol(canonicalSymbol);
      if (USE_TRACK_RECORD_V2 && mode === PRICE_MODE.VERIFIED && (!stopPrice || stopPrice <= 0)) {
        return res.status(400).json({ error: 'Verified commitments require a positive stop price' });
      }
      const requestedDirection = typeof body.direction === 'string' ? body.direction.toLowerCase() : '';
      if (USE_TRACK_RECORD_V2 && !['long', 'short'].includes(requestedDirection)) {
        return res.status(400).json({ error: 'V2 commitments require an explicit long or short direction' });
      }
      if (USE_TRACK_RECORD_V2 && ['long', 'short'].includes(requestedDirection)) {
        const inferredDirection = stopPrice && stopPrice > 0
          ? (stopPrice < entryPrice ? 'long' : 'short')
          : targetPrice && targetPrice > 0
            ? (targetPrice > entryPrice ? 'long' : 'short')
            : '';
        if (inferredDirection && inferredDirection !== requestedDirection) {
          return res.status(400).json({ error: 'Direction contradicts the committed stop/target levels' });
        }
      }

      const debateHash = debateHashFor(threadId, canonicalSymbol, mode);
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
            symbol: canonicalSymbol,
            mode,
            agent: agentEnum,
            conviction,
            entryPrice: numberToE8(entryPrice).toString(),
            targetPrice: targetPrice ? numberToE8(targetPrice).toString() : '0',
            stopPrice: stopPrice ? numberToE8(stopPrice).toString() : '0',
          },
        });
      }

      try {
        const provider = new ethers.JsonRpcProvider(XLAYER_RPC);
        await assertProviderChain(provider, DEFAULT_CHAIN.id);
        const wallet = new ethers.Wallet(RECORDER_KEY, provider);
        const iface = new ethers.Interface(USE_TRACK_RECORD_V2 ? TRACK_RECORD_V2_ABI : TRACK_RECORD_V1_ABI);
        // Normalize conviction: if float (0.0-1.0), convert to uint8 (0-10)
        const convUint8 = conviction <= 1 ? Math.round(conviction * 10) : Math.round(conviction);
        const entryPriceE8 = numberToE8(entryPrice);
        const targetPriceE8 = targetPrice ? numberToE8(targetPrice) : 0n;
        const stopPriceE8 = stopPrice ? numberToE8(stopPrice) : 0n;

        let pythFee = 0n;
        let entryUpdate: Awaited<ReturnType<typeof fetchHermesPriceUpdate>> | null = null;
        let txData: string;
        if (USE_TRACK_RECORD_V2) {
          const evidence: string[] = [];
          const track = new ethers.Contract(CONTRACT_ADDRESS, TRACK_RECORD_V2_ABI, provider);
          const symbolHash = ethers.keccak256(ethers.toUtf8Bytes(canonicalSymbol));
          const onchainFeed = String(await track.feedOf(symbolHash)).toLowerCase();
          const expectedFeed = (feedForSymbol(canonicalSymbol) || ethers.ZeroHash).toLowerCase();
          if (onchainFeed !== expectedFeed) {
            throw new Error('Backend feed configuration does not match TrackRecordV2');
          }
          const existing = await track.commitIndex(debateHash) as bigint;
          if (existing !== 0n) {
            const commitment = await track.getCommitment(existing - 1n);
            const sameCommitment =
              String(commitment.symbol) === canonicalSymbol &&
              Number(commitment.mode) === mode &&
              Number(commitment.agent) === agentEnum &&
              Number(commitment.conviction) === convUint8 &&
              BigInt(commitment.entryPrice) === entryPriceE8 &&
              BigInt(commitment.targetPrice) === targetPriceE8 &&
              BigInt(commitment.stopPrice) === stopPriceE8;
            if (!sameCommitment) {
              return res.status(409).json({ error: 'Debate hash is already bound to different commitment data' });
            }
            return res.status(200).json({
              ok: true,
              onchain: true,
              broadcast: false,
              confirmed: true,
              idempotent: true,
              action: 'commit',
              message: 'Commitment was already confirmed on-chain',
              data: { debateHash, symbol: canonicalSymbol, mode, agent: agentEnum, conviction },
            });
          }
          if (mode === PRICE_MODE.VERIFIED) {
            const feedId = feedForSymbol(canonicalSymbol);
            if (!feedId) throw new Error('Verified symbol is missing a configured Pyth feed');
            const activePyth = await track.activePyth() as string;
            if (activePyth === ethers.ZeroAddress) throw new Error('TrackRecordV2 has no active Pyth oracle');
            const latestBlock = await provider.getBlock('latest');
            if (!latestBlock) throw new Error('Could not read latest block for entry evidence');
            // Ask for the first tick near, but not after, the chain head. Using
            // Hermes `/latest` can race ahead of the EVM block timestamp.
            const requestedPublishTime = Math.max(1, Number(latestBlock.timestamp) - 2);
            entryUpdate = await fetchHermesPriceUpdate({
              feedId,
              kind: 'timestamp',
              publishTime: requestedPublishTime,
              hermesUrl: hermesUrlForPyth(DEFAULT_CHAIN.id, activePyth),
            });
            if (entryUpdate.publishTime < requestedPublishTime ||
                entryUpdate.publishTime > Number(latestBlock.timestamp)) {
              throw new Error('Hermes entry update falls outside the near-block window');
            }
            evidence.push(entryUpdate.updateData);
            const pyth = new ethers.Contract(activePyth, PYTH_ABI, provider);
            pythFee = await pyth.getUpdateFee(evidence) as bigint;
          }
          txData = iface.encodeFunctionData('commitTrade', [
            debateHash,
            canonicalSymbol,
            agentEnum,
            convUint8,
            entryPriceE8,
            targetPriceE8,
            stopPriceE8,
            mode,
            evidence,
          ]);
        } else {
          txData = iface.encodeFunctionData('commitTrade', [
            debateHash,
            canonicalSymbol,
            agentEnum,
            convUint8,
            entryPriceE8,
            targetPriceE8,
            stopPriceE8,
          ]);
        }

        // Estimate + 30% headroom — fixed limits caused an out-of-gas on the
        // first Sepolia publishSignal (new-symbol storage writes). API success
        // requires a receipt, not merely a transaction hash.
        const commitGas = await wallet.estimateGas({ to: CONTRACT_ADDRESS, data: txData, value: pythFee });
        const tx = await sendWithNonceRetry(wallet, provider, {
          to: CONTRACT_ADDRESS,
          data: txData,
          value: pythFee,
          gasLimit: (commitGas * 13n) / 10n,
        });
        await waitForSuccessfulReceipt(tx);

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
            const economyTx = await sendWithNonceRetry(wallet, provider, {
              to: ECONOMY_ADDRESS,
              data: economyTxData,
              value: feePerAgent * 2n, // two counterparties per debate
              gasLimit: (economyGas * 13n) / 10n,
            });
            await waitForSuccessfulReceipt(economyTx);
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
              symbol: canonicalSymbol, direction: dir, conviction: convUint8, agent: agentEnum,
              entryPrice: entryPriceE8,
              targetPrice: targetPriceE8,
              stopPrice: stopPriceE8,
              debateHash, ttl: 86400n, // 24h
            }]);
            const oracleTx = await sendWithNonceRetry(wallet, provider, {
              to: ORACLE_ADDRESS,
              data: oracleTxData,
              gasLimit: ((await wallet.estimateGas({ to: ORACLE_ADDRESS, data: oracleTxData })) * 13n) / 10n,
            });
            await waitForSuccessfulReceipt(oracleTx);
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
          confirmed: true,
          action: 'commit',
          message: `Commitment confirmed on ${DEFAULT_CHAIN.name}` + (oracleTxHash ? ' + Oracle updated' : '') + (economyTxHash ? ' + Debate fee paid' : ''),
          txHash: tx.hash,
          oracleTxHash,
          economyTxHash,
          explorer: txUrl(tx.hash),
          data: {
            debateHash,
            symbol: canonicalSymbol,
            mode,
            agent: agentEnum,
            conviction,
            ...(entryUpdate ? { oraclePublishTime: entryUpdate.publishTime } : {}),
          },
        });
      } catch (err: any) {
        console.error(`[${DEFAULT_CHAIN.name}] Emit Error:`, err);
        const configError = /PYTH_HERMES_API_KEY|active Pyth|Active Pyth|configured Pyth feed|feed configuration|Pyth configuration/.test(String(err?.message));
        return res.status(configError ? 503 : 500).json({
          error: configError ? String(err.message) : 'Failed to broadcast commitment',
        });
      }
    }

    // ── RESOLVE: Record outcome after min time elapsed ──
    if (action === 'resolve') {
      const { threadId, symbol, pnlBps, result, exitPrice } = body as {
        threadId: string; symbol?: string; pnlBps: number; result: string; exitPrice: number;
      };

      const normalizedResult = typeof result === 'string' ? result.toLowerCase() : '';
      if (
        typeof threadId !== 'string' || threadId.length === 0 || threadId.length > 256 ||
        (USE_TRACK_RECORD_V2 && (typeof symbol !== 'string' || symbol.length === 0)) ||
        !['win', 'loss', 'break_even'].includes(normalizedResult) ||
        typeof pnlBps !== 'number' || !Number.isFinite(pnlBps) ||
        typeof exitPrice !== 'number' || !Number.isFinite(exitPrice) || exitPrice <= 0
      ) {
        return res.status(400).json({ error: 'Invalid resolve payload' });
      }

      let canonicalSymbol = typeof symbol === 'string' ? symbol : '';
      try {
        if (USE_TRACK_RECORD_V2) canonicalSymbol = canonicalizeTrackSymbol(canonicalSymbol);
      } catch (error) {
        return res.status(400).json({ error: (error as Error).message });
      }
      const mode = USE_TRACK_RECORD_V2 ? modeForSymbol(canonicalSymbol) : PRICE_MODE.ATTESTED;
      const debateHash = debateHashFor(threadId, canonicalSymbol, mode);
      let resultEnum = RESULT_MAP[normalizedResult];

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
            ...(USE_TRACK_RECORD_V2 ? { symbol: canonicalSymbol, mode } : {}),
          },
        });
      }

      try {
        const provider = new ethers.JsonRpcProvider(XLAYER_RPC);
        await assertProviderChain(provider, DEFAULT_CHAIN.id);
        const wallet = new ethers.Wallet(RECORDER_KEY, provider);
        const iface = new ethers.Interface(USE_TRACK_RECORD_V2 ? TRACK_RECORD_V2_ABI : TRACK_RECORD_V1_ABI);
        let txData: string;
        let pythFee = 0n;
        let oracleResolution: { pnlBps: bigint; result: string; exitPriceE8: bigint; publishTime: number } | null = null;

        if (USE_TRACK_RECORD_V2) {
          const track = new ethers.Contract(CONTRACT_ADDRESS, TRACK_RECORD_V2_ABI, provider);
          const stored = await track.commitIndex(debateHash) as bigint;
          if (stored === 0n) return res.status(404).json({ error: 'No V2 commitment found for thread, symbol, and mode' });

          const commitment = await track.getCommitment(stored - 1n);
          if (Number(commitment.mode) !== mode || String(commitment.symbol) !== canonicalSymbol) {
            return res.status(409).json({ error: 'Stored commitment mode or symbol does not match the request' });
          }
          if (commitment.resolved) {
            const storedTrade = await track.tradeIndex(debateHash) as bigint;
            if (storedTrade === 0n) throw new Error('Resolved commitment is missing its trade');
            const trade = await track.getTrade(storedTrade - 1n);
            const resultName = ['pending', 'win', 'loss', 'expired', 'break_even'][Number(trade.result)] || 'unknown';
            return res.status(200).json({
              ok: true,
              onchain: true,
              broadcast: false,
              confirmed: true,
              idempotent: true,
              action: 'resolve',
              message: 'Commitment was already resolved on-chain',
              data: {
                debateHash,
                symbol: canonicalSymbol,
                mode,
                result: Number(trade.result),
                oracleResult: resultName,
                oraclePnlBps: BigInt(trade.pnlBps).toString(),
                oracleExitPriceE8: BigInt(trade.exitPrice).toString(),
                oraclePublishTime: Number(trade.exitEvidence.publishTime),
              },
            });
          }

          const latestBlock = await provider.getBlock('latest');
          if (!latestBlock) throw new Error('Could not read latest block');
          const exitAt = Number(latestBlock.timestamp);
          const maxCommitmentTtl = Number(await track.MAX_COMMITMENT_TTL());
          if (exitAt >= Number(commitment.committedAt) + maxCommitmentTtl) {
            const expireData = iface.encodeFunctionData('expireCommitment', [debateHash]);
            const expireGas = await wallet.estimateGas({ to: CONTRACT_ADDRESS, data: expireData });
            const expireTx = await sendWithNonceRetry(wallet, provider, {
              to: CONTRACT_ADDRESS,
              data: expireData,
              gasLimit: (expireGas * 13n) / 10n,
            });
            await waitForSuccessfulReceipt(expireTx);
            return res.status(200).json({
              ok: true,
              onchain: true,
              broadcast: true,
              confirmed: true,
              action: 'expire',
              message: `Commitment expired on ${DEFAULT_CHAIN.name}`,
              txHash: expireTx.hash,
              explorer: txUrl(expireTx.hash),
              data: {
                debateHash,
                symbol: canonicalSymbol,
                mode,
                result: RESULT_MAP.expired,
                oracleResult: 'expired',
                oraclePnlBps: '0',
                oracleExitPriceE8: BigInt(commitment.entryPrice).toString(),
                oraclePublishTime: 0,
              },
            });
          }
          if (exitAt < Number(commitment.minResolveAt)) {
            return res.status(409).json({
              error: 'Too soon to resolve',
              minResolveAt: Number(commitment.minResolveAt),
            });
          }

          const evidence: string[] = [];
          let reportedPnlBps = BigInt(Math.round(pnlBps * 100));
          let exitPriceE8 = numberToE8(exitPrice);
          let oraclePublishTime = 0;

          if (mode === PRICE_MODE.VERIFIED) {
            const feedId = feedForSymbol(canonicalSymbol);
            if (!feedId) throw new Error('Verified symbol is missing a configured Pyth feed');
            if (String(commitment.entryEvidence.feedId).toLowerCase() !== feedId.toLowerCase()) {
              throw new Error('Stored commitment feed does not match backend feed configuration');
            }
            const activePyth = await track.activePyth() as string;
            if (activePyth === ethers.ZeroAddress) throw new Error('TrackRecordV2 has no active Pyth oracle');
            const lowerBound = Math.max(
              Number(commitment.committedAt),
              Number(commitment.entryEvidence.publishTime),
              exitAt - Number(commitment.exitWindowSec),
            );
            // Resolve against a near-exit tick. Requesting lowerBound directly
            // would deterministically select the oldest admissible price.
            const requestedPublishTime = Math.max(lowerBound, exitAt - 5);
            const update = await fetchHermesPriceUpdate({
              feedId,
              kind: 'timestamp',
              publishTime: requestedPublishTime,
              hermesUrl: hermesUrlForPyth(DEFAULT_CHAIN.id, activePyth),
            });
            if (update.publishTime < requestedPublishTime || update.publishTime > exitAt) {
              throw new Error('Hermes update falls outside the commitment exit window');
            }
            evidence.push(update.updateData);
            exitPriceE8 = update.priceE8;
            oraclePublishTime = update.publishTime;

            const entryOracleE8 = pythPriceToE8(
              BigInt(commitment.entryEvidence.price),
              Number(commitment.entryEvidence.expo),
            );
            const isLong = BigInt(commitment.stopPrice) < BigInt(commitment.entryPrice);
            reportedPnlBps = pnlBpsFromOracle(isLong, entryOracleE8, exitPriceE8);
            const derivedResult = resultFromPnlBps(reportedPnlBps);
            if (derivedResult !== normalizedResult) {
              return res.status(409).json({
                error: 'Requested result contradicts the verified Pyth outcome',
                oracleResult: derivedResult,
                oraclePnlBps: reportedPnlBps.toString(),
              });
            }
            resultEnum = RESULT_MAP[derivedResult];

            const pyth = new ethers.Contract(activePyth, PYTH_ABI, provider);
            pythFee = await pyth.getUpdateFee(evidence) as bigint;
            oracleResolution = {
              pnlBps: reportedPnlBps,
              result: derivedResult,
              exitPriceE8,
              publishTime: oraclePublishTime,
            };
          }

          txData = iface.encodeFunctionData('resolveTrade', [
            debateHash,
            reportedPnlBps,
            resultEnum,
            exitPriceE8,
            exitAt,
            evidence,
          ]);
        } else {
          txData = iface.encodeFunctionData('resolveTrade', [
            debateHash,
            Math.round(pnlBps * 100),
            resultEnum,
            numberToE8(exitPrice),
          ]);
        }

        const gas = await wallet.estimateGas({ to: CONTRACT_ADDRESS, data: txData, value: pythFee });
        const tx = await sendWithNonceRetry(wallet, provider, {
          to: CONTRACT_ADDRESS,
          data: txData,
          value: pythFee,
          gasLimit: (gas * 13n) / 10n,
        });
        await waitForSuccessfulReceipt(tx);

        return res.status(200).json({
          ok: true,
          onchain: true,
          broadcast: true,
          confirmed: true,
          action: 'resolve',
          message: `Resolution confirmed on ${DEFAULT_CHAIN.name}`,
          txHash: tx.hash,
          explorer: txUrl(tx.hash),
          data: {
            debateHash,
            symbol: canonicalSymbol || undefined,
            mode: USE_TRACK_RECORD_V2 ? mode : undefined,
            result: resultEnum,
            ...(oracleResolution ? {
              oracleResult: oracleResolution.result,
              oraclePnlBps: oracleResolution.pnlBps.toString(),
              oracleExitPriceE8: oracleResolution.exitPriceE8.toString(),
              oraclePublishTime: oracleResolution.publishTime,
            } : {}),
          },
        });
      } catch (err: any) {
        console.error(`[${DEFAULT_CHAIN.name}] Emit Error:`, err);
        const configError = /PYTH_HERMES_API_KEY|active Pyth|Active Pyth|configured Pyth feed|feed configuration|Pyth configuration/.test(String(err?.message));
        return res.status(configError ? 503 : 500).json({
          error: configError ? String(err.message) : 'Failed to broadcast resolution',
        });
      }
    }

    return res.status(400).json({ error: 'Invalid action. Use "commit" or "resolve"' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
