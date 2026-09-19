import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requestOriginHost } from './_lib/origins.js';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { getClientIpKey } from './_lib/rate-limit.js';
import { loadDeskEvidence, runDeskDebate } from './_lib/desk-debate.js';

export const config = { maxDuration: 95 };
const Body = z.object({ symbol: z.string().regex(/^[A-Z0-9.^=-]{1,20}$/), assetType: z.enum(['equity','crypto']).optional(), question: z.string().trim().min(1).max(1200), language: z.enum(['en','es']).default('en') });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requestOriginHost(req.headers)) return res.status(403).json({ error: 'Origin not allowed' });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Provide an asset and a question up to 1200 characters.' });
  try {
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'The analysis desk is temporarily unavailable.' });
    // Atomic, cross-instance, fail-closed limits. No model calls if storage fails.
    const quota = await fetch(bobbyRest('rpc/bobby_consume_desk_quota'), {
      method: 'POST', headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ p_caller: getClientIpKey(req) }),
    });
    if (!quota.ok) throw new Error('Quota unavailable');
    if (await quota.json() !== true) {
      res.setHeader('Retry-After', '3600');
      return res.status(429).json({ error: 'The desk has reached its usage limit. Try again later.' });
    }
    const { symbol, question, language, assetType } = parsed.data;
    return res.status(200).json(await runDeskDebate(question, await loadDeskEvidence(symbol, assetType), language));
  } catch {
    // Never log private questions, model payloads, or provider credentials.
    return res.status(503).json({ error: 'The analysis could not finish. Please retry. No verdict was issued.' });
  }
}
