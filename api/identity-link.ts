// ============================================================
// /api/identity-link — RETIRED 2026-09-03 (final audit P0-1 / C-05).
//
// The pairing code was the bearer credential for merging two identities and
// was stored as the lookup key of `api_cache`, a table anon could read for
// exactly the code's validity window — so anyone holding the public anon key
// could list live codes and claim a stranger's account. The consume was also
// a non-atomic read-then-delete. iOS Build 13 removed the pairing flow, which
// leaves no counterpart for the web side to pair with.
//
// Re-introduce only with: a hashed key (never the code itself), a service-only
// atomic consume (single DELETE … RETURNING), a confirmation step on the
// ISSUING side, and an unlink path (P1-4). Migration 20260903000010 revokes
// anon/authenticated on api_cache regardless, so the SIWE nonce rows that
// share the table are no longer listable either.
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 5 };

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(410).json({ error: 'identity-link is retired (2026-09-03). Pairing codes are no longer issued or accepted.' });
}
