// GET /api/my-threads — the session wallet's PRIVATE debates (personal agent
// cycles). Private threads are no longer readable with the anon key, so the
// browser reads them here, scoped to the proven wallet.
//   ?limit=N (≤50) &agent_profile_id=<uuid> (extra filter, still owner-bound)
//   &include=posts (attach the agent posts of each thread)
//   &select=compact (id, topic, symbol, direction, conviction_score, status, created_at)
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { requireWalletSession } from './_lib/wallet-session.js';

export const config = { maxDuration: 10 };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const session = requireWalletSession(req, res);
  if (!session) return;
  const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit ?? '10'), 10) || 10));
  const profileId = typeof req.query.agent_profile_id === 'string' && UUID_RE.test(req.query.agent_profile_id) ? req.query.agent_profile_id : null;
  const includePosts = req.query.include === 'posts';
  const compact = req.query.select === 'compact';
  const select = compact ? 'id,topic,symbol,direction,conviction_score,status,created_at' : '*';
  const filter = `scope=eq.private&owner_wallet=eq.${session.wallet}${profileId ? `&agent_profile_id=eq.${profileId}` : ''}`;
  try {
    const r = await fetch(bobbyRest(`forum_threads?${filter}&order=created_at.desc&limit=${limit}&select=${select}`), { headers: bobbyServiceHeaders() });
    if (!r.ok) return res.status(502).json({ error: 'Could not load threads' });
    const threads = (await r.json()) as Array<Record<string, unknown> & { id: string }>;
    if (includePosts && threads.length > 0) {
      const ids = threads.map((t) => t.id).join(',');
      const p = await fetch(bobbyRest(`forum_posts?thread_id=in.(${ids})&order=created_at.asc`), { headers: bobbyServiceHeaders() });
      const posts = p.ok ? ((await p.json()) as Array<{ thread_id: string }>) : [];
      for (const t of threads) t.posts = posts.filter((post) => post.thread_id === t.id);
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(threads);
  } catch (error) {
    console.error('[my-threads]', error);
    return res.status(500).json({ error: 'Threads read failed' });
  }
}
