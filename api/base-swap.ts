// ============================================================
// /api/base-swap — Uniswap V3 on Base, the only swap rail.
//
//   GET  ?tokenIn=USDC&tokenOut=NVDAc&amount=25[&slippagePct=0.5]
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
import { recordBuiltSwap } from './_lib/swap-receipts.js';
import { verifyIntent } from './_lib/dex-execution.js';
import { resolveIdentity } from './_lib/user-identity.js';
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
  stockEligibilityConfirmed: z.boolean().optional(),
  /** The agent cycle whose intent this builds; only with a matching intentToken. */
  cycleId: z.string().uuid().optional(),
  intentToken: z.string().min(16).max(256).optional(),
  intentExpiresAt: z.number().int().positive().optional(),
  intentJti: z.string().regex(/^[0-9a-f]{32}$/).optional(),
});

/** ISO country stamped by Vercel's edge; absent locally, which fails closed for stocks. */
function viewerCountry(req: VercelRequest): string | null {
  const h = req.headers['x-vercel-ip-country'];
  return typeof h === 'string' && h ? h : null;
}

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

  // A cycle id is a public UUID. Linking a build to it requires the token the
  // cycle minted for THIS wallet, THIS pair and THIS amount, unexpired.
  // Anything else is refused outright rather than silently unlinked.
  if (body.cycleId) {
    const amount = typeof body.amount === 'number' ? body.amount.toFixed(2) : body.amount;
    const ok = body.intentExpiresAt !== undefined && body.intentJti !== undefined && verifyIntent(
      { cycleId: body.cycleId, wallet: (wallet ?? body.wallet).toLowerCase(), tokenIn: body.tokenIn, tokenOut: body.tokenOut, amount, expiresAt: body.intentExpiresAt, jti: body.intentJti },
      body.intentToken,
    );
    if (!ok) return res.status(403).json({ ok: false, error: 'cycleId does not carry a valid intent token for this wallet, pair and amount', code: 'intent_invalid' });
  }

  try {
    // guardWrite already proved body.wallet === session wallet; build for the proven one.
    const quote = await quoteBaseSwap({
      tokenIn: body.tokenIn,
      tokenOut: body.tokenOut,
      amount: body.amount,
      slippagePct: body.slippagePct,
      recipient: wallet ?? body.wallet,
      stockEligibilityConfirmed: body.stockEligibilityConfirmed,
      country: viewerCountry(req),
    });
    // What was built is written down before it is handed out, so a later
    // receipt can only confirm calldata this server produced.
    let receipt: { recorded: boolean; reason?: string } = { recorded: false, reason: 'no swap calldata in this response' };
    if (quote.tx?.swap && quote.tx.calldataHash && quote.recipient) {
      const identity = await resolveIdentity(req).catch(() => null);
      receipt = await recordBuiltSwap({
        wallet: quote.recipient,
        identityId: identity?.id ?? null,
        cycleId: body.cycleId ?? null,
        intentJti: body.cycleId ? body.intentJti ?? null : null,
        platform: 'web',
        tokenIn: { symbol: quote.tokenIn.symbol, address: quote.tokenIn.address },
        tokenOut: { symbol: quote.tokenOut.symbol, address: quote.tokenOut.address },
        amountInRaw: quote.amountInRaw,
        quotedOutRaw: quote.amountOutRaw,
        minOutRaw: quote.minAmountOutRaw,
        route: quote.route.description,
        router: quote.venue.router,
        calldataHash: quote.tx.calldataHash,
        deadline: quote.deadline,
      });
      if (receipt.recorded && receipt.reason) quote.warnings.push(receipt.reason);
      if (!receipt.recorded && receipt.reason === 'intent already used') {
        return res.status(409).json({ ok: false, error: 'This intent already produced a confirmed swap; run a new cycle', code: 'intent_consumed' });
      }
      if (!receipt.recorded) {
        // Fail closed: calldata that the store did not see cannot be confirmed
        // later, so it is not handed out. The quote itself stays visible.
        console.error('[BaseSwap] built swap not recorded:', receipt.reason);
        quote.txWithheld.push(`receipt store unavailable (${receipt.reason ?? 'unknown'}); calldata withheld`);
        quote.tx = null;
      }
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, quote, execution: toTradeExecution(quote), receipt });
  } catch (error) {
    if (error instanceof BaseSwapError) return res.status(statusFor(error.code)).json({ ok: false, error: error.message, code: error.code });
    console.error('[BaseSwap] build failed', error);
    return res.status(500).json({ ok: false, error: 'Swap build failed' });
  }
}
