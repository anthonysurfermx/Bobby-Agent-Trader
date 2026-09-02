// ============================================================
// GET /api/b20-quote
//   ?list=1                                   → featured tokenized stocks with status + indicative quote
//   ?token=NVDAc&amount=100&side=buy          → quote (no calldata)
//   ...&recipient=0x…&slippage=0.5&attest=1   → quote + approve/swap calldata for the wallet to sign
//
// Read-only for Bobby: this endpoint never signs or broadcasts. Guards
// (allowlist, ticket limits, oracle deviation, pause flags, US exclusion via
// the edge country header, eligibility attestation) decide whether calldata
// is returned at all.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { listB20, quoteB20, type B20Side } from './_lib/b20.js';
import { enforcePublicRateLimit } from './_lib/request-security.js';

export const config = { maxDuration: 20 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!await enforcePublicRateLimit(req, res, 'b20-quote', 60, 600)) return;

  const q = req.query as Record<string, string | undefined>;
  const countryHeader = req.headers['x-vercel-ip-country'];
  const country = Array.isArray(countryHeader) ? countryHeader[0] : countryHeader ?? null;

  try {
    if (q.list === '1') {
      const rows = await listB20();
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      return res.status(200).json({ ok: true, chainId: 8453, tokens: rows, issuer: 'Coinbase (Regulation S, non-US only)', generatedAt: new Date().toISOString() });
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
      attested: q.attest === '1',
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
