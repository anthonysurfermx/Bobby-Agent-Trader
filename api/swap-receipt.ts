// ============================================================
// POST /api/swap-receipt { txHash, wallet }
// Verifies a broadcast swap against Base and records it. The client never
// tells the server what happened; the chain does. Session-bound: the
// wallet in the body must be the session's, and must be the tx sender.
//   200 { ok:true, verification, receipt }   verified and recorded (or already)
//   202 { ok:false, pending:true }           not mined yet — retry
//   409                                      calldata Bobby never built, or hash conflict
//   422                                      on-chain checks failed (wrong sender/target, reverted, nothing received)
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { confirmSwapReceipt, verifySwapOnChain } from './_lib/swap-receipts.js';
import { guardWrite, WALLET_RE } from './_lib/write-guard.js';

export const config = { maxDuration: 20 };

const Schema = z.object({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  wallet: z.string().regex(WALLET_RE),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const guarded = await guardWrite(req, res, {
    methods: ['POST'],
    scope: 'swap-receipt',
    schema: Schema,
    perIp: { limit: 60, windowSec: 600 },
    perSubject: { key: (_b, wallet) => wallet, limit: 60, windowSec: 3600 },
  });
  if (!guarded) return;
  const wallet = (guarded.wallet ?? guarded.body.wallet) as `0x${string}`;
  const txHash = guarded.body.txHash as `0x${string}`;

  const verification = await verifySwapOnChain(txHash, wallet);
  if (!verification.ok && verification.reason === 'pending') {
    return res.status(202).json({ ok: false, pending: true, txHash });
  }
  if (!verification.ok) {
    return res.status(422).json({ ok: false, error: verification.reason, verification });
  }
  const receipt = await confirmSwapReceipt(verification, wallet);
  if (receipt.outcome === 'unbuilt') return res.status(409).json({ ok: false, error: 'This calldata was not built by Bobby for this wallet', verification });
  if (receipt.outcome === 'conflict') return res.status(409).json({ ok: false, error: 'This calldata was already confirmed with a different transaction', verification });
  if (receipt.outcome === 'db_error') return res.status(503).json({ ok: false, error: 'Receipt could not be recorded; the swap itself is verified on-chain', verification });
  return res.status(200).json({ ok: true, verification, receipt });
}
