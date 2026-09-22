// ============================================================
// /api/trader-land-share — the link preview of a published island.
//   GET /agentic-world/bobby/trader-land/w/:code (vercel.json rewrite)
//       → the app shell (index.html) with this island's title, description
//         and picture, so iMessage / WhatsApp / X show the island itself
//   GET /api/trader-land-share?code=<code>&img=1 → the 1200×630 PNG card
// Read-only and public like /api/trader-land-public: the card carries the
// builder's chosen title and the art positions (the island's size and its
// core, dormant or awake, where the builder put it), never who built it.
// A private or unknown code gets the untouched shell (the app explains it).
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from '@vercel/og';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { placementsFor, PUBLIC_LAND_COLUMNS, SHARE_CODE, type PublicLandRow } from './_lib/trader-land.js';
import { coreOf } from './_lib/trader-land-growth.js';
import { CARD, SITE, VISIT_PATH, cardCopy, cardElement, cardVersion, islandStats, langFrom, withIslandMeta, type CardIsland, type ManifestItem } from './_lib/trader-land-card.js';

export const config = { maxDuration: 15 };

// Bundled with the function (vercel.json includeFiles), so the card never
// depends on fetching the site's own static files.
const PUBLIC_DIR = join(process.cwd(), 'public');
let manifest: Map<string, ManifestItem> | null = null;
function manifestItems(): Map<string, ManifestItem> {
  if (!manifest) {
    const raw = JSON.parse(readFileSync(join(PUBLIC_DIR, 'land/v1/gate-A/asset-manifest.json'), 'utf8')) as { items: ManifestItem[] };
    manifest = new Map(raw.items.map((item) => [item.id, item]));
  }
  return manifest;
}
function artDataUri(url: string): string | null {
  if (!url.startsWith('/land/v1/') || url.includes('..')) return null;
  try {
    const bytes = readFileSync(join(PUBLIC_DIR, url));
    return `data:${url.endsWith('.webp') ? 'image/webp' : 'image/png'};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

async function publicIsland(code: string): Promise<CardIsland | null> {
  const r = await fetch(bobbyRest(`tl_lands?share_code=eq.${code}&visibility=eq.public&moderation_status=eq.approved&community_blocked=eq.false&select=${PUBLIC_LAND_COLUMNS}&limit=1`), { headers: bobbyServiceHeaders() });
  if (!r.ok) throw new Error(`Land read failed (${r.status})`);
  const row = ((await r.json()) as PublicLandRow[])[0];
  if (!row) return null;
  const placements = (await placementsFor([row.identity_id])).get(row.identity_id) ?? [];
  return { code, title: row.title, size: row.size, core: coreOf(row, placements.length), placements };
}

/** This deployment's public origin (production: bobbyprotocol.xyz). */
function originOf(req: VercelRequest): string {
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  const value = Array.isArray(host) ? host[0] : host;
  return value && /^[a-z0-9.-]+(:\d+)?$/i.test(value) ? `${value.startsWith('localhost') ? 'http' : 'https'}://${value}` : SITE;
}

/** The deployed app shell, read from this same deployment. */
async function appShell(origin: string): Promise<string> {
  const headers: Record<string, string> = { Accept: 'text/html' };
  // Protected preview deployments answer 401 without the automation bypass.
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const r = await fetch(`${origin}/`, { headers });
  if (!r.ok) throw new Error(`App shell ${r.status}`);
  return r.text();
}

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return res.status(405).json({ error: 'Method not allowed' }); }
  const code = typeof req.query.code === 'string' ? req.query.code.trim().toLowerCase() : '';
  const wantsImage = req.query.img === '1';
  const lang = typeof req.query.lang === 'string' && (req.query.lang === 'es' || req.query.lang === 'en') ? req.query.lang : langFrom(req.headers['accept-language']);

  if (wantsImage) {
    if (!SHARE_CODE.test(code)) return res.status(400).json({ error: 'Invalid share code' });
    try {
      const island = await publicIsland(code);
      if (!island) return res.status(404).json({ error: 'This island is not published' });
      const image = new ImageResponse(cardElement(island, manifestItems(), lang, artDataUri) as never, { width: CARD.width, height: CARD.height });
      const png = Buffer.from(await image.arrayBuffer());
      res.setHeader('Content-Type', 'image/png');
      // The URL carries a version of the island, so a changed island is a new URL.
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(png);
    } catch (error) {
      console.error('[trader-land-share] image', error);
      return res.status(500).json({ error: 'Card unavailable' });
    }
  }

  let shell: string;
  try {
    shell = await appShell(originOf(req));
  } catch (error) {
    // Never strand a visitor: the same page is served, without the card, outside this rewrite.
    console.error('[trader-land-share] shell', error);
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, SHARE_CODE.test(code) ? `/trader-land/w/${code}` : '/agentic-world/bobby/trader-land/worlds');
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Vary', 'Accept-Language');
  if (!SHARE_CODE.test(code)) return res.status(200).send(shell);
  try {
    const island = await publicIsland(code);
    if (!island) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(shell);
    }
    const items = manifestItems();
    const copy = cardCopy(island, islandStats(island, items), lang);
    const url = `${SITE}${VISIT_PATH}${code}`;
    const image = `${originOf(req)}/api/trader-land-share?code=${code}&img=1&lang=${lang}&v=${cardVersion(island, sha)}`;
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(withIslandMeta(shell, { title: copy.title, description: copy.description, url, image, alt: copy.alt, locale: lang === 'es' ? 'es_MX' : 'en_US' }));
  } catch (error) {
    // The visitor still gets the app; only the preview falls back to Bobby's.
    console.error('[trader-land-share] island', error);
    return res.status(200).send(shell);
  }
}
