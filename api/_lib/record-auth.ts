// ============================================================
// Shared auth guard for endpoints that sign on-chain transactions
// or mutate the track record (xlayer-record, forum-resolve).
//
// FAIL-CLOSED by design: if XLAYER_RECORD_SECRET is not configured
// in the environment, mutations are refused with 503 — a missing
// env var on a fresh deploy must never silently reopen the endpoint.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, timingSafeEqual } from 'node:crypto';

export const RECORD_SECRET_HEADER = 'x-record-secret';

function secretsMatch(provided: string, expected: string): boolean {
  const providedDigest = createHash('sha256').update(provided).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

/**
 * Guards a mutating request. Returns true if the caller is authorized;
 * otherwise writes the error response and returns false.
 */
export function requireRecordAuth(req: VercelRequest, res: VercelResponse): boolean {
  const secret = process.env.XLAYER_RECORD_SECRET || '';
  if (!secret) {
    res.status(503).json({ error: 'Internal authentication not configured' });
    return false;
  }
  const provided = req.headers[RECORD_SECRET_HEADER];
  if (typeof provided !== 'string' || !secretsMatch(provided, secret)) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

/** Header object for internal server-to-server calls to guarded endpoints. */
export function recordAuthHeaders(): Record<string, string> {
  const secret = process.env.XLAYER_RECORD_SECRET || '';
  return secret ? { [RECORD_SECRET_HEADER]: secret } : {};
}
