// ============================================================
// /api/memory — what Bobby remembers about a signed-in Apple/Google account, to see, correct and delete.
//   GET                          → { enabled, preferredName, prefs: {horizon, experience, risk},
//                                    assets: [{symbol, asks, lastAskedAt, lastHorizon, lastPrice, lastPriceAt}] (≤ 50),
//                                    reads: [{symbol, deliveredAt, verdict, direction, headline, why, risk, watch,
//                                    level, language, price, priceAt}] (≤ 50, all that is stored, newest first), retentionDays }
//   PATCH { horizon?, experience?, risk?, memoryEnabled?, preferredName? } → the same body after the change.
//        Explicit corrections only: each field is an enum (or a 1–40 letter name), null clears it.
//   DELETE ?symbol=NVDA          → forget one asset and Bobby's stored answers on it.
//   DELETE ?all=1                → forget everything (assets, answers, preferences, name; a paused memory stays
//        paused). Any other DELETE (no parameter, an empty or invalid symbol) is refused with 400: erasing
//        everything is never a default.
// Anonymous devices and wallet-only sessions have no memory: 401. Storage: api/_lib/user-memory.ts,
// migrations 20260929190000 / 200000 / 230000. Logs never pair a symbol with an identity.
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requestOriginHost } from './_lib/origins.js';
import { enforcePublicRateLimit } from './_lib/request-security.js';
import { resolveIdentity, type Identity } from './_lib/user-identity.js';
import { MEMORY_SYMBOL, MemoryUnavailableError, carriesAccountToken, cleanName, forgetMemory, hasMemory, listMemory, updatePrefs } from './_lib/user-memory.js';

export const config = { maxDuration: 15 };

const Patch = z.object({
  horizon: z.enum(['intraday', 'week', 'month', 'long']).nullable().optional(),
  experience: z.enum(['new', 'some', 'experienced']).nullable().optional(),
  risk: z.enum(['low', 'medium', 'high']).nullable().optional(),
  memoryEnabled: z.boolean().optional(),
  preferredName: z.string().max(80).nullable().optional().refine((v) => v === undefined || v === null || cleanName(v) !== null, 'invalid name'),
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
      if (!parsed.success) return res.status(400).json({ error: 'Send horizon, experience, risk, memoryEnabled or preferredName with an allowed value.', code: 'invalid_request' });
      await updatePrefs(identity.id, parsed.data);
    } else if (method === 'DELETE') {
      const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
      const rawSymbol = one(req.query?.symbol);
      const all = one(req.query?.all) === '1';
      if (all && rawSymbol === undefined) {
        await forgetMemory(identity.id, 'all');
      } else {
        const symbol = typeof rawSymbol === 'string' ? rawSymbol.trim().toUpperCase() : '';
        if (all || !MEMORY_SYMBOL.test(symbol)) return res.status(400).json({ error: 'Name one asset to forget, or send all=1 to forget everything.', code: 'invalid_request' });
        await forgetMemory(identity.id, { symbol });
      }
    }
    return res.status(200).json(await listMemory(identity.id));
  } catch (e) {
    console.error('[memory]', method, e instanceof MemoryUnavailableError ? 'storage unavailable' : e instanceof Error ? e.name : 'error');
    return res.status(503).json({ error: 'Memory is temporarily unavailable. Try again.', code: 'memory_unavailable' });
  }
}
