// ============================================================
// GET /api/b20-quote
//   ?list=1                                   → featured tokenized stocks with status + indicative quote
//   ?token=NVDAc&amount=100&side=buy          → quote (no calldata)
//   POST {token, amount, side, slippage, recipient, attestation}
//                                             → quote + approve/swap calldata for the wallet to sign
//
// Read-only for Bobby: this endpoint never signs or broadcasts. Guards
// (allowlist, ticket limits, oracle deviation and staleness, failed risk
// reads, pause flags, transfer-policy simulation, US exclusion via the edge
// country header, EIP-712 eligibility attestation bound to the wallet) decide
// whether calldata is returned at all. Every guard fails closed.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { listB20, quoteB20, type B20Side } from './_lib/b20.js';
import { B20_TERMS_VERSION, B20_ATTESTATION_DOMAIN, B20_ATTESTATION_TYPES } from './_lib/b20-attestation.js';
import { enforcePublicRateLimit } from './_lib/request-security.js';

export const config = { maxDuration: 20 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await enforcePublicRateLimit(req, res, 'b20-quote', 60, 600)) return;

  const body = (req.method === 'POST' && req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const q: Record<string, string | undefined> = { ...(req.query as Record<string, string | undefined>) };
  for (const key of ['token', 'amount', 'side', 'slippage', 'recipient', 'list']) {
    if (body[key] !== undefined) q[key] = String(body[key]);
  }
  const attestation = body.attestation ?? q.attestation;

  // The edge stamps the viewer's country; local previews may set B20_DEV_COUNTRY.
  // No country → no calldata (the quote itself is still informational).
  const countryHeader = req.headers['x-vercel-ip-country'];
  const headerCountry = Array.isArray(countryHeader) ? countryHeader[0] : countryHeader ?? null;
  const country = headerCountry ?? (process.env.VERCEL ? null : process.env.B20_DEV_COUNTRY ?? null);

  try {
    if (q.list === '1') {
      const rows = await listB20();
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      return res.status(200).json({
        ok: true,
        chainId: 8453,
        tokens: rows,
        issuer: 'Coinbase (Regulation S, non-US only)',
        viewerCountry: country,
        attestation: { termsVersion: B20_TERMS_VERSION, domain: B20_ATTESTATION_DOMAIN, types: B20_ATTESTATION_TYPES },
        generatedAt: new Date().toISOString(),
      });
    }

    const token = String(q.token ?? '');
    const amount = Number(q.amount ?? '');
    const side: B20Side = q.side === 'sell' ? 'sell' : 'buy';
    if (!token) return res.status(400).json({ error: 'token required' });
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'amount must be a positive number' });

    const quote = await quoteB20({
      token,
      amount,
      side,
      slippagePct: q.slippage !== undefined ? Number(q.slippage) : undefined,
      recipient: q.recipient,
      attestation,
      country,
    });
    return res.status(200).json({ ok: true, ...quote, note: 'Bobby prepares, the human signs. Nothing is executed by this endpoint.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'quote failed';
    console.error('[B20Quote]', message);
    const status = /allowlist|amount|positive/.test(message) ? 400 : 502;
    return res.status(status).json({ error: message });
  }
}
