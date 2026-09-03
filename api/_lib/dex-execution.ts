// ============================================================
// dex-execution — the agent cycle's bridge to the swap rail. Base-only,
// Uniswap V3, Coinbase B20 tokenized stocks.
//
// The cycle produces an INTENT, never calldata: a quote-only preview (no
// recipient, no attestation, nothing recorded). The human reads it on the
// card, attests eligibility, and only then /api/base-swap builds, simulates
// and records the transaction for their wallet — with the cycle id carried
// along so the confirmed receipt lands on this cycle.
// ============================================================

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { BaseSwapError, quoteBaseSwap, type BaseSwapQuote } from './base-swap.js';
import { BASE_SWAP_CHAIN_ID, findBaseToken } from '../../src/lib/base-swap/tokens.js';

/** The only chain the agent trades on, as the string the trade rows carry. */
export const TRADE_CHAIN_ID = String(BASE_SWAP_CHAIN_ID);
/** Hard ceiling on what a debate may ask for, before the rail's own per-ticket cap. */
const AGENT_MAX_TICKET_USD = 10_000;

export const INTENT_TTL_SEC = 60 * 60;

export interface TradeIntent {
  tokenIn: 'USDC';
  tokenOut: string;
  /** Human amount of USDC. */
  amount: string;
  cycleId: string;
  /** Wallet the cycle ran for; only its session may build this intent. */
  wallet: string;
  /** Unix seconds; the token below stops verifying after this. */
  expiresAt: number;
  /** Single-use id: one confirmed swap per intent (the store enforces it). */
  jti: string;
  /**
   * HMAC over (cycleId, wallet, tokenIn, tokenOut, amount, expiresAt) with the
   * session secret. /api/base-swap only links a build to a cycle when this
   * verifies for the SESSION wallet — a cycle id alone proves nothing.
   */
  intentToken: string;
  /** Quote-only preview: amounts, route, reference, warnings. No calldata. */
  preview: Pick<BaseSwapQuote, 'amountIn' | 'amountOut' | 'minAmountOut' | 'executionPrice' | 'priceImpactPct' | 'route' | 'venue' | 'stockReference' | 'warnings' | 'txWithheld' | 'limits'>;
}

export interface PreparedIntent {
  ok: boolean;
  intent?: TradeIntent;
  status?: 'aborted_stale_quote' | 'aborted_exec_error';
  reason?: string;
}

function intentSecret(): Buffer | null {
  const raw = (process.env.BOBBY_SESSION_SECRET || '').trim();
  return raw.length >= 32 ? Buffer.from(raw, 'utf8') : null;
}

export interface IntentFields { cycleId: string; wallet: string; tokenIn: string; tokenOut: string; amount: string; expiresAt: number; jti: string }

function intentPayload(f: IntentFields): string {
  return [f.cycleId, f.wallet.toLowerCase(), f.tokenIn.toUpperCase(), f.tokenOut, f.amount, String(f.expiresAt), f.jti].join('|');
}

/** Null when the server has no secret: intents then carry no token and cannot be linked. */
export function signIntent(f: IntentFields): string | null {
  const secret = intentSecret();
  if (!secret) return null;
  return createHmac('sha256', secret).update(intentPayload(f)).digest('base64url');
}

/** True only for an unexpired token minted by this server for exactly these fields. */
export function verifyIntent(f: IntentFields, token: string | null | undefined, now = Math.floor(Date.now() / 1000)): boolean {
  if (!token || f.expiresAt <= now) return false;
  const expected = signIntent(f);
  if (!expected) return false;
  const a = Buffer.from(expected); const b = Buffer.from(String(token));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** USDC → `tokenSymbol` for `amountUsd`, as an intent for a human to act on. */
export async function prepareBaseIntent(opts: { tokenSymbol: string; amountUsd: number; cycleId: string; wallet: string }): Promise<PreparedIntent> {
  const { tokenSymbol, amountUsd, cycleId, wallet } = opts;
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) return { ok: false, status: 'aborted_exec_error', reason: 'invalid wallet' };
  const token = findBaseToken(tokenSymbol);
  if (!token) return { ok: false, status: 'aborted_exec_error', reason: `${tokenSymbol} is not on the Base allow-list` };
  if (token.assetClass !== 'tokenized-stock') {
    return { ok: false, status: 'aborted_exec_error', reason: `${tokenSymbol} is outside the Base tokenized-stock execution focus` };
  }
  if (!Number.isFinite(amountUsd) || amountUsd <= 0 || amountUsd > AGENT_MAX_TICKET_USD) {
    return { ok: false, status: 'aborted_exec_error', reason: `invalid amountUsd ${amountUsd}` };
  }
  try {
    const amount = amountUsd.toFixed(2);
    const q = await quoteBaseSwap({ tokenIn: 'USDC', tokenOut: token.symbol, amount });
    if (!(Number(q.amountOut) > 0)) return { ok: false, status: 'aborted_stale_quote', reason: 'quote returned no output' };
    // Guards that need no wallet already apply to the preview (ticket cap, impact, reference, pause).
    if (q.txWithheld.length) return { ok: false, status: 'aborted_exec_error', reason: q.txWithheld.join('; ') };
    const expiresAt = Math.floor(Date.now() / 1000) + INTENT_TTL_SEC;
    const jti = randomBytes(16).toString('hex');
    const intentToken = signIntent({ cycleId, wallet, tokenIn: 'USDC', tokenOut: token.symbol, amount, expiresAt, jti });
    if (!intentToken) return { ok: false, status: 'aborted_exec_error', reason: 'intent signing is not configured (BOBBY_SESSION_SECRET)' };
    return {
      ok: true,
      intent: {
        tokenIn: 'USDC',
        tokenOut: token.symbol,
        amount,
        cycleId,
        wallet: wallet.toLowerCase(),
        expiresAt,
        jti,
        intentToken,
        preview: {
          amountIn: q.amountIn, amountOut: q.amountOut, minAmountOut: q.minAmountOut, executionPrice: q.executionPrice,
          priceImpactPct: q.priceImpactPct, route: q.route, venue: q.venue, stockReference: q.stockReference,
          warnings: q.warnings, txWithheld: q.txWithheld, limits: q.limits,
        },
      },
    };
  } catch (error) {
    if (error instanceof BaseSwapError && error.code === 'no_route') return { ok: false, status: 'aborted_stale_quote', reason: error.message };
    return { ok: false, status: 'aborted_exec_error', reason: error instanceof Error ? error.message : String(error) };
  }
}
