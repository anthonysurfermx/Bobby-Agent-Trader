// ============================================================
// api/_lib/x402.ts
// Thin wrapper around @okxweb3/x402-* SDK for Vercel serverless.
//
// Purpose: lazy-init the OKX facilitator + resource server once
// per cold start, then verify a single Vercel request inside any
// handler with one call to `requirePayment(req, res, opts)`.
//
// Vercel functions are not Express, so we don't use the express
// middleware — we drive the resource server directly through the
// `x402HTTPResourceServer` lifecycle hooks.
//
// Spec: SELLER.md (typescript) — kept verbatim in BOBBY-SELLER.md.
// Network: eip155:196 only (X Layer mainnet).
// Default token: USDT0 0x779ded0c9e1022225f8e0630b35a9b54be713736 (6 decimals).
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export interface RequirePaymentOptions {
  routeKey: string;            // e.g. "POST /api/mcp-bobby#bobby_analyze"
  priceUsd?: string | number;  // "$0.01" or 0.01 — default from env
  payTo?: string;              // EVM address — default BOBBY_TREASURY_ADDRESS
  description?: string;
  maxTimeoutSeconds?: number;
}

export interface RequirePaymentResult {
  paid: boolean;
  reason?: string;
  proof?: { txHash?: string; settlement?: unknown };
}

const NETWORK = process.env.X402_NETWORK || 'eip155:196';
const SYNC_SETTLE = String(process.env.X402_SYNC_SETTLE || 'true') === 'true';
const DEFAULT_PRICE = process.env.X402_DEFAULT_PRICE_USD || '$0.01';
const PAY_TO = process.env.BOBBY_TREASURY_ADDRESS || '';
const ENABLED = String(process.env.X402_ENABLED || 'false') === 'true';

// Lazy-loaded SDK refs. Initialized on first use; survives across warm invocations.
let _facilitatorClient: any = null;
let _resourceServer: any = null;
let _initPromise: Promise<void> | null = null;

async function getResourceServer() {
  if (_resourceServer) return _resourceServer;

  // Dynamic import keeps the SDK out of cold-start when X402_ENABLED=false.
  const [{ OKXFacilitatorClient }, { x402ResourceServer }, { ExactEvmScheme }] = await Promise.all([
    import('@okxweb3/x402-core'),
    import('@okxweb3/x402-express'),
    import('@okxweb3/x402-evm/exact/server'),
  ]);

  _facilitatorClient = new OKXFacilitatorClient({
    apiKey: process.env.OKX_API_KEY!,
    secretKey: process.env.OKX_SECRET_KEY!,
    passphrase: process.env.OKX_PASSPHRASE!,
    baseUrl: process.env.X402_FACILITATOR_BASE_URL || 'https://web3.okx.com',
    syncSettle: SYNC_SETTLE,
  });

  _resourceServer = new x402ResourceServer(_facilitatorClient);
  _resourceServer.register(NETWORK, new ExactEvmScheme());

  if (!_initPromise) {
    _initPromise = _resourceServer.initialize();
  }
  await _initPromise;

  return _resourceServer;
}

/**
 * Verify and (if syncSettle) settle an x402 payment for a single Vercel request.
 *
 * Flow:
 *   1. If X402_ENABLED=false, returns `{ paid: true }` immediately (legacy gate
 *      will run upstream).
 *   2. If the request has no `payment` header, write a 402 with the challenge
 *      and return `{ paid: false }`. Caller should `return` after.
 *   3. If verification + settlement pass, return `{ paid: true, proof }`.
 *   4. On failure, write the appropriate non-200 status and return `{ paid: false }`.
 */
export async function requirePayment(
  req: VercelRequest,
  res: VercelResponse,
  opts: RequirePaymentOptions,
): Promise<RequirePaymentResult> {
  if (!ENABLED) {
    return { paid: true, reason: 'x402_disabled_via_env' };
  }
  if (!PAY_TO) {
    return { paid: false, reason: 'BOBBY_TREASURY_ADDRESS not configured' };
  }

  try {
    const server = await getResourceServer();

    const paymentOption = {
      scheme: 'exact',
      network: NETWORK,
      payTo: opts.payTo || PAY_TO,
      price: opts.priceUsd ?? DEFAULT_PRICE,
      maxTimeoutSeconds: opts.maxTimeoutSeconds ?? 300,
    };

    // The SDK's HTTP resource server is the documented driver. We re-create a
    // minimal route table per call to keep this stateless across handlers.
    const { x402HTTPResourceServer } = await import('@okxweb3/x402-express');
    const httpServer = new x402HTTPResourceServer(server, {
      [opts.routeKey]: {
        accepts: paymentOption,
        description: opts.description,
      },
    });

    // The SDK's verify+settle path mutates the response (writes 402 / 200).
    // We delegate to it and read the result back through hooks.
    const result: RequirePaymentResult = { paid: false };

    server.onAfterSettle?.(async (ctx: any) => {
      result.paid = true;
      result.proof = { txHash: ctx?.result?.txHash, settlement: ctx?.result };
    });
    server.onVerifyFailure?.(async (ctx: any) => {
      result.reason = ctx?.error?.message || 'verify_failed';
    });
    server.onSettleFailure?.(async (ctx: any) => {
      result.reason = ctx?.error?.message || 'settle_failed';
    });

    // For Vercel we cast req/res to the shape express middleware expects.
    // The SDK only reads `req.method`, `req.url`, `req.headers` and writes
    // `res.status`, `res.setHeader`, `res.end` — Vercel's signatures match.
    await new Promise<void>((resolve) => {
      (httpServer as any).handle(req, res, () => resolve());
    });

    return result;
  } catch (err: any) {
    return { paid: false, reason: err?.message || String(err) };
  }
}

/**
 * Helper for callers that prefer a guard pattern:
 *   if (await ensurePaid(req, res, opts)) return;
 * Returns `true` when a 402/error response was already written and the
 * caller should bail out; returns `false` when the request is paid and
 * the caller should continue with business logic.
 */
export async function ensurePaid(
  req: VercelRequest,
  res: VercelResponse,
  opts: RequirePaymentOptions,
): Promise<boolean> {
  const r = await requirePayment(req, res, opts);
  return !r.paid;
}

export const x402Config = {
  enabled: ENABLED,
  network: NETWORK,
  payTo: PAY_TO,
  defaultPrice: DEFAULT_PRICE,
  syncSettle: SYNC_SETTLE,
};
