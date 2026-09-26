// ============================================================
// api/challenge-scan.ts — the one-click breach scanner.
//
// Anyone can test a challenge WITHOUT a wallet: we fetch the first signed
// Pyth tick at/after the anchor they chose and eth_call the contract's own
// challengeStopBreach with it. The verdict comes from the contract, not from
// us — a success means a real challenge would reclassify the call; NoBreach()
// means the call survives that tick. Read-only; nothing is submitted.
// ============================================================
import { Contract, Interface, JsonRpcProvider } from 'ethers';

import { rpcErrorMessage } from './_lib/rpc-redact.js';

export const config = { maxDuration: 15 };

const RPC = process.env.VERIFIED_CALLS_RPC_URL || 'https://base-sepolia-rpc.publicnode.com';
const TR = process.env.VERIFIED_CALLS_ADDRESS || '0x4bfEF46d920fd67C68046901f591Fad0a2F7cadC';
// Read-only eth_call sender — must hold a little ETH because the call carries
// value (the Pyth fee). The canary recorder address is public and funded.
const CALL_FROM = process.env.VERIFIED_CALLS_SCAN_FROM || '0x821990Bda0BAa05F96506fd73ef439D0C2f17302';
const FEE_WEI = 20_000_000_000_000n; // same buffer the recorder uses; contract refunds excess
const MAX_COMMITMENT_TTL = 30 * 24 * 60 * 60;

const IFACE = new Interface([
  'function challengeStopBreach(bytes32 _debateHash, uint64 _anchorTs, bytes[] _breachUpdateData) payable',
  'error ChallengeNotVerified()',
  'error ChallengeNotApplicable()',
  'error ChallengeWindowClosed()',
  'error ChallengeAnchorOutOfRange()',
  'error AlreadyChallenged()',
  'error NoBreach()',
]);

const READER_ABI = [
  'function commitIndex(bytes32) view returns (uint256)',
  'function tradeIndex(bytes32) view returns (uint256)',
  'function getCommitment(uint256) view returns (tuple(bytes32 debateHash, uint96 entryPrice, uint96 targetPrice, uint64 committedAt, uint96 stopPrice, address recorder, uint64 minResolveAt, uint8 agent, uint8 conviction, bool resolved, uint8 mode, uint16 entryWindowSec, uint16 exitWindowSec, uint24 maxExitLagSec, uint24 challengeWindowSec, uint16 entryTolBps, uint16 exitTolBps, uint16 confMaxBps, tuple(bytes32 feedId, int64 price, uint64 conf, int32 expo, uint64 publishTime) entryEvidence, string symbol))',
  'function getTrade(uint256) view returns (tuple(bytes32 debateHash, uint96 entryPrice, uint96 exitPrice, uint64 committedAt, uint64 resolvedAt, address recorder, uint8 agent, uint8 conviction, uint8 result, uint8 mode, int256 pnlBps, uint64 exitAt, uint64 challengeDeadline, bool stopChallenged, tuple(bytes32 feedId, int64 price, uint64 conf, int32 expo, uint64 publishTime) entryEvidence, tuple(bytes32 feedId, int64 price, uint64 conf, int32 expo, uint64 publishTime) exitEvidence, string symbol))',
];

const VERDICT_ES: Record<string, string> = {
  NoBreach: 'El call aguanta: este tick no cruza el stop, el contrato revierte NoBreach().',
  ChallengeNotApplicable: 'Un call resuelto solo se puede retar si es WIN o BREAK_EVEN.',
  ChallengeWindowClosed: 'La ventana de challenge de este call ya cerró.',
  ChallengeAnchorOutOfRange: 'El anchor está fuera del rango challengeable (entre la evidencia de entrada y el exit).',
  AlreadyChallenged: 'Este call ya fue retado y registrado como LOSS.',
  ChallengeNotVerified: 'Solo los calls VERIFIED (con oráculo) se pueden retar.',
};

function toE8(price: bigint, expo: number): bigint {
  const target = -8;
  if (expo === target) return price;
  const diff = expo - target;
  return diff > 0 ? price * 10n ** BigInt(diff) : price / 10n ** BigInt(-diff);
}

export default async function handler(req: any, res: any) {
  try {
    const hash = String(req.query?.hash || '');
    const ts = Number(req.query?.ts || 0);
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash) || !Number.isInteger(ts) || ts <= 0) {
      return res.status(400).json({ error: 'expected ?hash=0x…(32 bytes)&ts=<unix seconds>' });
    }
    if (ts > Math.floor(Date.now() / 1000)) {
      return res.status(400).json({ error: 'anchor is in the future' });
    }

    const provider = new JsonRpcProvider(RPC);
    const reader = new Contract(TR, READER_ABI, provider);
    const idx: bigint = await reader.commitIndex(hash);
    if (idx === 0n) return res.status(404).json({ error: 'no commitment for that hash' });
    const c = await reader.getCommitment(idx - 1n);
    if (Number(c.mode) !== 1) {
      return res.status(400).json({ verdict: 'NOT_VERIFIED', detail: VERDICT_ES.ChallengeNotVerified });
    }

    // The contract checks these before reading a Pyth update. Mirror that
    // order so expired or already challenged canary calls never depend on a
    // Hermes credential (and the UI never offers an impossible transaction).
    let maxAnchor = Math.floor(Date.now() / 1000);
    if (c.resolved) {
      const tradeId: bigint = await reader.tradeIndex(hash);
      if (tradeId === 0n) throw new Error('resolved commitment missing trade');
      const trade = await reader.getTrade(tradeId - 1n);
      if (trade.stopChallenged) {
        return res.status(200).json({ verdict: 'ALREADY_CHALLENGED', detail: VERDICT_ES.AlreadyChallenged });
      }
      if (Number(trade.result) !== 1 && Number(trade.result) !== 4) {
        return res.status(200).json({ verdict: 'NOT_APPLICABLE', detail: VERDICT_ES.ChallengeNotApplicable });
      }
      if (maxAnchor > Number(trade.challengeDeadline)) {
        return res.status(200).json({ verdict: 'WINDOW_CLOSED', detail: VERDICT_ES.ChallengeWindowClosed });
      }
      maxAnchor = Number(trade.exitAt);
    } else if (maxAnchor > Number(c.committedAt) + MAX_COMMITMENT_TTL) {
      return res.status(200).json({ verdict: 'WINDOW_CLOSED', detail: VERDICT_ES.ChallengeWindowClosed });
    }
    if (ts < Number(c.entryEvidence.publishTime) || ts > maxAnchor) {
      return res.status(400).json({ verdict: 'ANCHOR_OUT_OF_RANGE', detail: VERDICT_ES.ChallengeAnchorOutOfRange });
    }

    // First signed tick at/after the anchor — the same deterministic tick the
    // contract will verify (Unique semantics).
    const feedId = String(c.entryEvidence.feedId);
    const headers: Record<string, string> = {};
    if (process.env.PYTH_HERMES_API_KEY) headers.Authorization = `Bearer ${process.env.PYTH_HERMES_API_KEY}`;
    const hermes = await fetch(
      `https://hermes.pyth.network/v2/updates/price/${ts}?ids[]=${feedId}&encoding=hex`,
      { headers },
    );
    if (!hermes.ok) {
      // Never return the upstream body: it can expose credential or account
      // details, and 403 alone does not identify the entitlement problem.
      return res.status(503).json({
        verdict: 'ORACLE_UNAVAILABLE',
        detail: hermes.status === 401 || hermes.status === 403
          ? 'Pyth rechazó el acceso al dato histórico. El escáner estará disponible cuando se restablezca la autorización del oráculo.'
          : 'Pyth no pudo entregar el dato histórico. Intenta de nuevo más tarde.',
      });
    }
    const j = (await hermes.json()) as {
      binary?: { data?: string[] };
      parsed?: Array<{ price?: { price?: string; expo?: number; publish_time?: number } }>;
    };
    const hex = j.binary?.data?.[0];
    const p = j.parsed?.[0]?.price;
    if (!hex || !p?.price) return res.status(502).json({ error: 'Hermes: malformed update' });
    const updateData = hex.startsWith('0x') ? hex : `0x${hex}`;
    const tickE8 = toE8(BigInt(p.price), Number(p.expo ?? -8));

    const base = {
      symbol: c.symbol,
      stopPrice: (Number(c.stopPrice) / 1e8).toFixed(2),
      tickPrice: (Number(tickE8) / 1e8).toFixed(2),
      tickPublishTime: Number(p.publish_time ?? ts),
      contract: TR,
      // Everything a challenger needs to submit the real tx themselves.
      castCommand: `cast send ${TR} "challengeStopBreach(bytes32,uint64,bytes[])" ${hash} ${ts} '[${updateData.slice(0, 18)}…]' --value 20000000000000 --rpc-url https://base-sepolia-rpc.publicnode.com --interactive`,
      updateData,
    };

    const data = IFACE.encodeFunctionData('challengeStopBreach', [hash, ts, [updateData]]);
    try {
      await provider.call({ to: TR, from: CALL_FROM, data, value: FEE_WEI });
      return res.status(200).json({
        ...base,
        verdict: 'BREACH',
        detail: c.resolved
          ? 'Breach real: un challenge con este tick RECLASIFICA el call a LOSS on-chain.'
          : 'Breach real: un challenge con este tick resuelve el call pendiente como LOSS al stop.',
      });
    } catch (e: unknown) {
      const err = e as { data?: string; info?: { error?: { data?: string } } };
      const revertData = err?.data ?? err?.info?.error?.data ?? '';
      const parsed = typeof revertData === 'string' && revertData.startsWith('0x')
        ? (() => { try { return IFACE.parseError(revertData); } catch { return null; } })()
        : null;
      const name = parsed?.name || 'UNKNOWN_REVERT';
      return res.status(200).json({
        ...base,
        verdict: name === 'NoBreach' ? 'NO_BREACH' : name,
        detail: VERDICT_ES[name] || `El contrato revirtió: ${name}`,
      });
    }
  } catch (e) {
    console.error('[ChallengeScan]', rpcErrorMessage(e));
    return res.status(502).json({ error: 'scan failed' });
  }
}
