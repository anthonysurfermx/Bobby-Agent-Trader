// ============================================================
// /api/identity-link — join the web (wallet) and phone (Apple) identities.
//   POST { action: 'issue' }        → { code, expiresAt }   a 6-char code bound to the
//                                     caller's identity, valid 10 minutes, single use
//   POST { action: 'claim', code }  → merges the code's identity INTO the caller's
//                                     (the caller keeps its id; progress is recomputed
//                                     from both ledgers by bobby_link_identities)
// Either side may issue or claim. Codes live in api_cache (TTL) and are
// consumed on claim. Auth: wallet session or Supabase access token.
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { requireIdentity } from './_lib/user-identity.js';
import { guardWrite } from './_lib/write-guard.js';

export const config = { maxDuration: 15 };
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('issue') }),
  z.object({ action: z.literal('claim'), code: z.string().regex(/^[A-Z0-9]{6}$/) }),
]);
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const TTL_MS = 10 * 60 * 1000;
const key = (code: string) => `identity-link:${code}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const guarded = await guardWrite(req, res, { methods: ['POST'], scope: 'identity-link', schema: Body, auth: 'none', allowNoOrigin: true, perIp: { limit: 20, windowSec: 600 }, perSubject: { key: () => null, limit: 20, windowSec: 600 } });
  if (!guarded) return;
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const body = guarded.body;
  try {
    if (body.action === 'issue') {
      const code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
      const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
      const r = await fetch(bobbyRest('api_cache?on_conflict=cache_key'), { method: 'POST', headers: bobbyServiceHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ cache_key: key(code), payload: { identity: identity.id, via: identity.via }, expires_at: expiresAt, updated_at: new Date().toISOString() }) });
      if (!r.ok) return res.status(502).json({ error: 'Could not issue a code' });
      return res.status(200).json({ ok: true, code, expiresAt, via: identity.via });
    }
    // claim: single use — read, then delete before merging
    const g = await fetch(bobbyRest(`api_cache?cache_key=eq.${encodeURIComponent(key(body.code))}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=payload`), { headers: bobbyServiceHeaders() });
    const row = ((g.ok ? await g.json() : []) as Array<{ payload: { identity: string; via: string } }>)[0];
    if (!row) return res.status(404).json({ error: 'Code unknown or expired' });
    await fetch(bobbyRest(`api_cache?cache_key=eq.${encodeURIComponent(key(body.code))}`), { method: 'DELETE', headers: bobbyServiceHeaders({ Prefer: 'return=minimal' }) });
    if (row.payload.identity === identity.id) return res.status(409).json({ error: 'That code is your own identity' });
    const rpc = await fetch(bobbyRest('rpc/bobby_link_identities'), { method: 'POST', headers: bobbyServiceHeaders(), body: JSON.stringify({ p_keep: identity.id, p_merge: row.payload.identity }) });
    const text = await rpc.text();
    if (!rpc.ok) {
      console.error('[identity-link] merge', rpc.status, text);
      return res.status(409).json({ error: /different accounts|different wallets/.test(text) ? 'Those two identities already belong to different people' : 'Could not link' });
    }
    return res.status(200).json({ ok: true, linked: JSON.parse(text), from: row.payload.via, to: identity.via });
  } catch (error) {
    console.error('[identity-link]', error);
    return res.status(500).json({ error: 'Link failed' });
  }
}
