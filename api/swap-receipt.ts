// ============================================================
// /api/swap-receipt — verified Base swap receipts, one history for web + iOS.
//
//   GET                       → this identity's confirmed swaps (wallet
//                               session or Supabase bearer, see user-identity)
//   POST { txHash, wallet }   → verifies the broadcast swap against Base and
//                               records it. The client never tells the server
//                               what happened; the chain does. Session-bound:
//                               the wallet in the body must be the session's
//                               and must be the transaction sender.
//   200 { ok:true, verification, receipt }   verified and recorded (or already)
//   202 { ok:false, pending:true }           not mined yet — retry
//   409                                      calldata Bobby never built, or hash conflict
//   422                                      on-chain checks failed (sender/target/status/output)
//   503                                      verified on-chain but the database is unavailable
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { confirmSwapReceipt, SWAP_RECEIPTS_TABLE, verifySwapOnChain } from './_lib/swap-receipts.js';
import { requireIdentity, resolveIdentity } from './_lib/user-identity.js';
import { guardWrite, WALLET_RE } from './_lib/write-guard.js';

export const config = { maxDuration: 20 };

const Schema = z.object({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  wallet: z.string().regex(WALLET_RE),
  platform: z.enum(['web', 'ios']).optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const identity = await requireIdentity(req, res);
    if (!identity) return;
    const filters = identity.wallet
      ? `or=(identity_id.eq.${identity.id},wallet_address.eq.${identity.wallet.toLowerCase()})`
      : `identity_id=eq.${identity.id}`;
    const r = await fetch(bobbyRest(`${SWAP_RECEIPTS_TABLE}?${filters}&status=eq.confirmed&order=confirmed_at.desc&limit=100&select=id,wallet_address,chain_id,engine,router_address,token_in_symbol,token_out_symbol,token_in_address,token_out_address,amount_in_raw,quoted_out_raw,min_amount_out_raw,amount_out_raw,route,tx_hash,block_number,block_timestamp,platform,confirmed_at`), { headers: bobbyServiceHeaders() });
    if (!r.ok) return res.status(502).json({ error: 'Could not read swap history' });
    return res.status(200).json({ ok: true, receipts: await r.json() });
  }

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
  // Identity is attached when known (Apple / linked wallet); the wallet session alone is enough to record.
  const identity = await resolveIdentity(req).catch(() => null);

  const verification = await verifySwapOnChain(txHash, wallet);
  if (!verification.ok && verification.reason === 'pending') {
    return res.status(202).json({ ok: false, pending: true, txHash });
  }
  if (!verification.ok) {
    return res.status(422).json({ ok: false, error: verification.reason, verification });
  }
  const receipt = await confirmSwapReceipt(verification, wallet, { identityId: identity?.id ?? null, platform: guarded.body.platform });
  if (receipt.outcome === 'unbuilt') return res.status(409).json({ ok: false, error: 'This calldata was not built by Bobby for this wallet', verification });
  if (receipt.outcome === 'conflict') return res.status(409).json({ ok: false, error: 'This calldata was already confirmed with a different transaction', verification });
  if (receipt.outcome === 'db_error') return res.status(503).json({ ok: false, error: 'Receipt could not be recorded; the swap itself is verified on-chain', verification });
  return res.status(200).json({ ok: true, verification, receipt });
}
