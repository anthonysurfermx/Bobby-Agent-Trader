import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { CONTEXT_INPUT_BYTES, CONTEXT_IMPORT_LIMIT, FinancialItemSchema } from '../shared/financial-context.js';
import { requestOriginHost } from './_lib/origins.js';
import { enforcePublicRateLimit, requireInternalAuth } from './_lib/request-security.js';
import { carriesAccountToken, hasMemory } from './_lib/user-memory.js';
import { resolveIdentity } from './_lib/user-identity.js';
import { dismissContextDraft, FinancialContextConflictError, forgetFinancialContext, importFinancialContext, listFinancialContext, purgeFinancialContext, setFinancialContextEnabled, updateFinancialItem } from './_lib/financial-context.js';

export const config = { maxDuration: 15 };
const Import = z.object({ action: z.literal('import'), items: z.array(FinancialItemSchema).min(1).max(CONTEXT_IMPORT_LIMIT), consent: z.literal(true), requestId: z.string().uuid(), draftId: z.string().uuid().optional() }).strict();
const Patch = z.union([
  z.object({ enabled: z.boolean() }).strict(),
  z.object({ id: z.string().uuid(), item: FinancialItemSchema, consent: z.literal(true) }).strict(),
]);
const Delete = z.union([
  z.object({ id: z.string().uuid() }).strict(),
  z.object({ draftId: z.string().uuid() }).strict(),
  z.object({ scope: z.literal('all') }).strict(),
]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const method = req.method ?? 'GET';
  if (req.query?.op === 'purge') {
    if (method !== 'GET') return res.status(405).json({ code: 'method_not_allowed' });
    if (!requireInternalAuth(req, res)) return;
    try { await purgeFinancialContext(); return res.status(200).json({ ok: true }); }
    catch { return res.status(503).json({ code: 'context_unavailable' }); }
  }
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) {
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ code: 'method_not_allowed' });
  }
  if (method !== 'GET' && !requestOriginHost(req.headers)) return res.status(403).json({ code: 'origin_not_allowed' });
  if (!await enforcePublicRateLimit(req, res, `financial-context-${method.toLowerCase()}`, method === 'GET' ? 60 : 20, 60)) return;
  if (!carriesAccountToken(req)) return res.status(401).json({ code: 'signin_required' });
  let identity;
  try { identity = await resolveIdentity(req); }
  catch { return res.status(503).json({ code: 'signin_unavailable' }); }
  if (!hasMemory(identity)) return res.status(401).json({ code: 'signin_required' });
  try {
    if (method === 'POST' || method === 'PATCH') {
      if (Buffer.byteLength(JSON.stringify(req.body ?? {})) > CONTEXT_INPUT_BYTES) return res.status(413).json({ code: 'context_too_large' });
      if (method === 'POST') {
        const parsed = Import.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ code: 'invalid_context' });
        await importFinancialContext(identity.id, parsed.data.items, parsed.data.requestId, parsed.data.draftId);
      } else {
        const parsed = Patch.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ code: 'invalid_context' });
        if ('enabled' in parsed.data) await setFinancialContextEnabled(identity.id, parsed.data.enabled);
        else if ('id' in parsed.data) await updateFinancialItem(identity.id, parsed.data.id, parsed.data.item);
      }
    } else if (method === 'DELETE') {
      const parsed = Delete.safeParse(req.query ?? {});
      if (!parsed.success) return res.status(400).json({ code: 'invalid_context' });
      if ('draftId' in parsed.data) await dismissContextDraft(identity.id, parsed.data.draftId);
      else await forgetFinancialContext(identity.id, 'id' in parsed.data ? parsed.data.id : null);
    }
    return res.status(200).json(await listFinancialContext(identity.id));
  } catch (error) {
    if (error instanceof FinancialContextConflictError) return res.status(409).json({ code: error.code });
    console.error('[financial-context]', method, 'storage_unavailable');
    return res.status(503).json({ code: 'context_unavailable' });
  }
}
