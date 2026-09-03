// ============================================================
// /api/base-swap — Uniswap V3 on Base, the only swap rail.
//
//   GET  ?tokenIn=USDC&tokenOut=cbBTC&amount=25[&slippagePct=0.5]
//        → quote only (no wallet, no calldata). Public, rate-limited.
//   POST { tokenIn, tokenOut, amount, slippagePct?, wallet }
//        → quote + user-signed calldata for `wallet`. Requires a wallet
//          session (proof the caller owns `wallet`), origin check, freeze
//          switch and per-IP/per-wallet limits via guardWrite.
//
// Nothing here signs. See api/_lib/base-swap.ts for the guards.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { BaseSwapError, quoteBaseSwap, toTradeExecution } from './_lib/base-swap.js';
import { enforcePublicRateLimit } from './_lib/request-security.js';
import { guardWrite, WALLET_RE } from './_lib/write-guard.js';

export const config = { maxDuration: 20 };

const AMOUNT_RE = /^\d{1,18}(\.\d{1,18})?$/;

const PostSchema = z.object({
  tokenIn: z.string().trim().min(1).max(64),
  tokenOut: z.string().trim().min(1).max(64),
  amount: z.union([z.number().positive().finite(), z.string().trim().regex(AMOUNT_RE)]),
  slippagePct: z.number().min(0.05).max(3).optional(),
  wallet: z.string().regex(WALLET_RE),
});

function statusFor(code: BaseSwapError['code']): number {
  if (code === 'no_route') return 422;
  if (code === 'rpc_failed') return 503;
  return 400;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    if (!await enforcePublicRateLimit(req, res, 'base-swap-quote', 60, 600)) return;
    const { tokenIn, tokenOut, amount, slippagePct } = req.query;
    if (typeof tokenIn !== 'string' || typeof tokenOut !== 'string' || typeof amount !== 'string' || !AMOUNT_RE.test(amount.trim())) {
      return res.status(400).json({ error: 'Required: tokenIn, tokenOut, amount (positive decimal)' });
    }
    const slip = slippagePct === undefined ? undefined : Number(slippagePct);
    if (slip !== undefined && !(Number.isFinite(slip) && slip >= 0.05 && slip <= 3)) {
      return res.status(400).json({ error: 'slippagePct must be between 0.05 and 3' });
    }
    try {
      const quote = await quoteBaseSwap({ tokenIn, tokenOut, amount: amount.trim(), slippagePct: slip });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: true, quote });
    } catch (error) {
      if (error instanceof BaseSwapError) return res.status(statusFor(error.code)).json({ ok: false, error: error.message, code: error.code });
      console.error('[BaseSwap] quote failed', error);
      return res.status(500).json({ ok: false, error: 'Quote failed' });
    }
  }

  const guarded = await guardWrite(req, res, {
    methods: ['POST'],
    scope: 'base-swap',
    schema: PostSchema,
    perIp: { limit: 20, windowSec: 600 },
    perSubject: { key: (_b, wallet) => wallet, limit: 30, windowSec: 3600 },
  });
  if (!guarded) return;
  const { body, wallet } = guarded;

  try {
    // guardWrite already proved body.wallet === session wallet; build for the proven one.
    const quote = await quoteBaseSwap({
      tokenIn: body.tokenIn,
      tokenOut: body.tokenOut,
      amount: body.amount,
      slippagePct: body.slippagePct,
      recipient: wallet ?? body.wallet,
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, quote, execution: toTradeExecution(quote) });
  } catch (error) {
    if (error instanceof BaseSwapError) return res.status(statusFor(error.code)).json({ ok: false, error: error.message, code: error.code });
    console.error('[BaseSwap] build failed', error);
    return res.status(500).json({ ok: false, error: 'Swap build failed' });
  }
}
