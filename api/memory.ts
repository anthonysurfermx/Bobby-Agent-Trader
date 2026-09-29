// ============================================================
// /api/memory — what Bobby remembers about a signed-in Apple/Google account, to see, correct and delete.
//   GET                          → { enabled, prefs: {horizon, experience, risk}, assets: [{symbol, asks,
//                                    lastAskedAt, lastHorizon}] (≤ 50, newest first), retentionDays }
//   PATCH { horizon?, experience?, risk?, memoryEnabled? } → the same body after the change. Explicit
//        corrections only: each field is an enum, null clears it; nothing here is ever inferred.
//   DELETE ?symbol=NVDA          → forget one asset; DELETE with no symbol → forget everything (assets and
//        preferences; a paused memory stays paused). Answers the same body after the change.
// Anonymous devices and wallet-only sessions have no memory: 401. Storage: api/_lib/user-memory.ts,
// migration 20260929190000_user_memory.sql. Logs never pair a symbol with an identity.
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requestOriginHost } from './_lib/origins.js';
import { enforcePublicRateLimit } from './_lib/request-security.js';
import { resolveIdentity, type Identity } from './_lib/user-identity.js';
import { MEMORY_SYMBOL, MemoryUnavailableError, carriesAccountToken, forgetMemory, hasMemory, listMemory, updatePrefs } from './_lib/user-memory.js';

export const config = { maxDuration: 15 };

const Patch = z.object({
  horizon: z.enum(['intraday', 'week', 'month', 'long']).nullable().optional(),
  experience: z.enum(['new', 'some', 'experienced']).nullable().optional(),
  risk: z.enum(['low', 'medium', 'high']).nullable().optional(),
  memoryEnabled: z.boolean().optional(),
}).strict().refine((p) => Object.keys(p).length > 0, 'empty patch');

const LIMITS: Record<string, [number, number]> = { GET: [60, 60], PATCH: [30, 60], DELETE: [30, 60] };

function signInRequired(res: VercelResponse) {
  res.setHeader('WWW-Authenticate', 'Bearer realm="bobby-memory"');
  return res.status(401).json({ error: 'Sign in with Apple or Google to see what Bobby remembers.', code: 'signin_required' });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const method = req.method ?? 'GET';
  if (!(method in LIMITS)) {
    res.setHeader('Allow', 'GET, PATCH, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // Writes come only from Bobby's own origins (browsers always send Origin on PATCH/DELETE; the app sets it).
  // A same-origin GET may carry neither Origin nor Referer; it is a bearer-authenticated read, like /api/bobby-access.
  if (method !== 'GET' && !requestOriginHost(req.headers)) return res.status(403).json({ error: 'Origin not allowed' });
  const [limit, windowSec] = LIMITS[method];
  if (!await enforcePublicRateLimit(req, res, `memory-${method.toLowerCase()}`, limit, windowSec)) return;

  // Only an Apple/Google session: no token (or a wallet session) is answered without any lookup.
  if (!carriesAccountToken(req)) return signInRequired(res);
  let identity: Identity | null;
  try { identity = await resolveIdentity(req); }
  catch {
    res.setHeader('Retry-After', '5');
    return res.status(503).json({ error: 'Sign-in service is temporarily unavailable. Try again.' });
  }
  if (!hasMemory(identity)) return signInRequired(res);

  try {
    if (method === 'PATCH') {
      const parsed = Patch.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Send horizon, experience, risk or memoryEnabled with an allowed value.', code: 'invalid_request' });
      await updatePrefs(identity.id, parsed.data);
    } else if (method === 'DELETE') {
      const raw = Array.isArray(req.query?.symbol) ? req.query.symbol[0] : req.query?.symbol;
      const symbol = typeof raw === 'string' && raw.trim() ? raw.trim().toUpperCase() : null;
      if (symbol !== null && !MEMORY_SYMBOL.test(symbol)) return res.status(400).json({ error: 'That asset symbol is not valid.', code: 'invalid_request' });
      await forgetMemory(identity.id, symbol);
    }
    return res.status(200).json(await listMemory(identity.id));
  } catch (e) {
    console.error('[memory]', method, e instanceof MemoryUnavailableError ? 'storage unavailable' : e instanceof Error ? e.name : 'error');
    return res.status(503).json({ error: 'Memory is temporarily unavailable. Try again.', code: 'memory_unavailable' });
  }
}
