// ============================================================
// /api/trader-land-public — islands their builders chose to share.
//   GET ?code=<share code> → { world, catalog }   one published island
//   GET                    → { worlds, catalog }  the latest published islands
// Public and read-only. The response carries the builder's chosen title and
// the art positions, never who built the island. An island leaves the moment
// its builder unpublishes it (visibility flips to private; the code is kept so
// a re-publish restores the same link).
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { catalog, placementsFor, publicWorld, PUBLIC_LAND_COLUMNS, SHARE_CODE, type PublicLandRow } from './_lib/trader-land.js';

export const config = { maxDuration: 10 };
const GALLERY_LIMIT = 24;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  const code = typeof req.query.code === 'string' ? req.query.code.trim().toLowerCase() : '';
  if (req.query.code !== undefined && !SHARE_CODE.test(code)) return res.status(400).json({ error: 'Invalid share code' });
  try {
    const items = await catalog();
    if (!items.length) throw new Error('Catalog unavailable');
    const byId = new Map(items.map((item) => [item.id, item]));
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=300');
    if (code) {
      const r = await fetch(bobbyRest(`tl_lands?share_code=eq.${code}&visibility=eq.public&select=${PUBLIC_LAND_COLUMNS}&limit=1`), { headers: bobbyServiceHeaders() });
      if (!r.ok) throw new Error('Land read failed');
      const row = ((await r.json()) as PublicLandRow[])[0];
      if (!row) return res.status(404).json({ error: 'This island is not published' });
      const placements = (await placementsFor([row.identity_id])).get(row.identity_id) ?? [];
      return res.status(200).json({ ok: true, world: publicWorld(row, placements, byId), catalog: items });
    }
    const r = await fetch(bobbyRest(`tl_lands?visibility=eq.public&share_code=not.is.null&order=published_at.desc.nullslast&limit=${GALLERY_LIMIT}&select=${PUBLIC_LAND_COLUMNS}`), { headers: bobbyServiceHeaders() });
    if (!r.ok) throw new Error('Gallery read failed');
    const rows = (await r.json()) as PublicLandRow[];
    const placements = await placementsFor(rows.map((row) => row.identity_id));
    return res.status(200).json({ ok: true, worlds: rows.map((row) => publicWorld(row, placements.get(row.identity_id) ?? [], byId)), catalog: items });
  } catch (error) {
    console.error('[trader-land-public]', error);
    return res.status(500).json({ error: 'Worlds unavailable' });
  }
}
