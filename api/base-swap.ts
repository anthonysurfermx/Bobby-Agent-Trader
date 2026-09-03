// ============================================================
// /api/base-swap — the ONLY swap entrypoint: Uniswap v3 on Base.
//   POST { action: 'quote', tokenIn, tokenOut, amountIn, slippageBps? }
//        → quote + steps (approve calldata if needed, Permit2 typed data to sign)
//   POST { action: 'build', quote, permit?: { message, signature } }
//        → simulated Universal Router calldata + disclosure; a swap_receipts row
//   POST { action: 'confirm', receiptId, txHash }   → records the broadcast hash
// Auth: wallet session (the session wallet is the owner of every step).
// Kill switch: BASE_SWAPS_ENABLED=true is required or the endpoint answers 503
// — swaps stay closed until the fork tests and Codex's review pass.
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { build, quote, simulate, steps, swapsEnabled, SwapRefusal, type Quote } from './_lib/base-swap.js';
import { guardWrite } from './_lib/write-guard.js';

export const config = { maxDuration: 20 };
const Sym = z.string().regex(/^[A-Za-z]{2,10}$/);
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('quote'), tokenIn: Sym, tokenOut: Sym, amountIn: z.string().regex(/^\d{1,40}$/), slippageBps: z.number().int().min(1).max(300).default(50) }),
  z.object({ action: z.literal('build'), quote: z.object({ chainId: z.literal(8453), tokenIn: Sym, tokenOut: Sym, amountIn: z.string().regex(/^\d{1,40}$/), amountOut: z.string(), minOut: z.string().regex(/^\d{1,40}$/), fee: z.number().int(), slippageBps: z.number().int(), gasEstimate: z.string(), quotedAt: z.string() }), permit: z.object({ message: z.any(), signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/) }).nullable().default(null) }),
  z.object({ action: z.literal('confirm'), receiptId: z.string().uuid(), txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }),
]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const guarded = await guardWrite(req, res, { methods: ['POST'], scope: 'base-swap', schema: Body, perIp: { limit: 60, windowSec: 600 }, perSubject: { key: (_b, w) => w, limit: 120, windowSec: 3600 } });
  if (!guarded || !guarded.wallet) return;
  if (!swapsEnabled()) return res.status(503).json({ ok: false, error: 'Swaps are not enabled on this deployment (BASE_SWAPS_ENABLED)', code: 'swaps_disabled' });
  const owner = guarded.wallet as `0x${string}`;
  const body = guarded.body;
  try {
    if (body.action === 'quote') {
      const q = await quote(body.tokenIn, body.tokenOut, BigInt(body.amountIn), body.slippageBps);
      const s = await steps(owner, q);
      return res.status(200).json({ ok: true, quote: q, steps: s });
    }
    if (body.action === 'build') {
      const q = body.quote as Quote;
      if (Date.now() - Date.parse(q.quotedAt) > 2 * 60_000) return res.status(409).json({ ok: false, error: 'Quote is older than two minutes — quote again', code: 'quote_stale' });
      // Re-quote and refuse if the market moved past the caller's minimum: the minimum received is never taken from the client alone.
      const fresh = await quote(q.tokenIn, q.tokenOut, BigInt(q.amountIn), q.slippageBps);
      if (BigInt(fresh.amountOut) < BigInt(q.minOut)) return res.status(409).json({ ok: false, error: 'Market moved below the quoted minimum — quote again', code: 'quote_moved' });
      const tx = build(owner, { ...q, fee: fresh.fee === q.fee ? q.fee : q.fee }, body.permit as { message: any; signature: `0x${string}` } | null);
      await simulate(owner, tx);
      const r = await fetch(bobbyRest('swap_receipts?select=id'), { method: 'POST', headers: bobbyServiceHeaders({ Prefer: 'return=representation' }), body: JSON.stringify({ wallet_address: owner, chain_id: 8453, engine: 'uniswap-v3-universal-router', token_in: q.tokenIn, token_out: q.tokenOut, amount_in: q.amountIn, quoted_out: q.amountOut, min_out: q.minOut, fee_tier: q.fee, router: tx.to, calldata_hash: (await import('node:crypto')).createHash('sha256').update(tx.data).digest('hex'), deadline: new Date(tx.deadline * 1000).toISOString(), status: 'built' }) });
      const receiptId = r.ok ? ((await r.json()) as Array<{ id: string }>)[0]?.id : null;
      return res.status(200).json({ ok: true, receiptId, tx, disclosure: tx.disclosure });
    }
    const u = await fetch(bobbyRest(`swap_receipts?id=eq.${body.receiptId}&wallet_address=eq.${owner}`), { method: 'PATCH', headers: bobbyServiceHeaders({ Prefer: 'return=representation' }), body: JSON.stringify({ tx_hash: body.txHash, status: 'broadcast', broadcast_at: new Date().toISOString() }) });
    const rows = u.ok ? ((await u.json()) as unknown[]) : [];
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Receipt not found for this wallet' });
    return res.status(200).json({ ok: true });
  } catch (e) {
    if (e instanceof SwapRefusal) return res.status(e.code === 'simulation_reverted' ? 409 : 400).json({ ok: false, error: e.message, code: e.code });
    console.error('[base-swap]', e);
    return res.status(500).json({ ok: false, error: 'Swap engine failed' });
  }
}
