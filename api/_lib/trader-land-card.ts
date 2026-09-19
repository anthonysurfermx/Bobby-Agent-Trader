// ============================================================
// Trader Land share card — what a link preview (iMessage, WhatsApp, X,
// Telegram…) shows for a published island: its own title, what it holds and
// a picture of the island itself, instead of the site-wide Bobby metadata.
// Pure: the handler (api/trader-land-share.ts) does the I/O. The island is
// drawn with the shared geometry (src/lib/trader-land/geometry.ts), so an
// island of any size keeps the same extent and the core sits where the land
// keeps it, dormant or awake.
// ============================================================
import { DORMANT_CORE_SCALE, SLAB, landGeometry, spriteFrame as frameOf, type LandGeometry } from '../../src/lib/trader-land/geometry.js';

export const SITE = 'https://bobbyprotocol.xyz';
export const VISIT_PATH = '/agentic-world/bobby/trader-land/w/';
export const CARD = { width: 1200, height: 630 } as const;

/** Catalog ids whose art is registered under another manifest id (mirrors src/lib/trader-land/public.ts). */
const ART_ALIASES: Record<string, string> = { axiom_archive_return_path: 'axiom_archive_return_path_curve' };
export const artId = (itemId: string) => ART_ALIASES[itemId] ?? itemId;

export interface ManifestVariant { url: string; w: number; h: number }
export interface ManifestState { anchor: [number, number]; contentBounds: [number, number, number, number]; variants: Record<string, ManifestVariant> }
export interface ManifestItem { id: string; district: string; kind: string; footprint: { cols: number; rows: number }; orientations: Record<string, { states: Record<string, ManifestState> }> }
export interface CardPlacement { item_id: string; x: number; y: number; rotation: number }
export interface CardCore { x: number; y: number; stage: number }
export interface CardIsland { code: string; title: string | null; size: number; placements: CardPlacement[]; core?: CardCore | null }

/** The island's core; an island read from an older server has today's: 3,3, awake. */
export function cardCore(island: CardIsland): CardCore {
  const core = island.core;
  return core && Number.isInteger(core.x) && Number.isInteger(core.y) ? { x: core.x, y: core.y, stage: core.stage === 0 ? 0 : 1 } : { x: 3, y: 3, stage: 1 };
}

export function artState(item: ManifestItem, stage?: number): ManifestState | null {
  const orientation = Object.values(item.orientations)[0];
  if (!orientation) return null;
  if (stage === 0 && orientation.states.stage0) return orientation.states.stage0;
  return orientation.states.stage1 ?? orientation.states.bloom ?? Object.values(orientation.states)[0] ?? null;
}

// ---------- words ----------
export type Lang = 'es' | 'en';
export function langFrom(acceptLanguage: string | undefined): Lang {
  return /^\s*es\b/i.test(acceptLanguage ?? '') ? 'es' : 'en';
}

export function islandStats(island: CardIsland, items: Map<string, ManifestItem>) {
  const districts = new Set<string>();
  for (const p of island.placements) { const item = items.get(artId(p.item_id)); if (item) districts.add(item.district); }
  return { pieces: island.placements.length, districts: districts.size };
}

export function cardCopy(island: CardIsland, stats: { pieces: number; districts: number }, lang: Lang) {
  const es = lang === 'es';
  const name = island.title ?? (es ? 'Una isla de Trader Land' : 'A Trader Land island');
  const pieces = `${stats.pieces} ${es ? (stats.pieces === 1 ? 'pieza' : 'piezas') : (stats.pieces === 1 ? 'piece' : 'pieces')}`;
  const districts = `${stats.districts} ${es ? (stats.districts === 1 ? 'distrito' : 'distritos') : (stats.districts === 1 ? 'district' : 'districts')}`;
  const holds = stats.pieces ? `${pieces} · ${districts}` : (es ? 'Recién fundada' : 'Just founded');
  return {
    title: island.title ? `${island.title} · Trader Land` : name,
    name,
    holds,
    description: es
      ? `${holds}. Cada pieza nace de una lectura con tesis en Bobby: disciplina, no volumen. Visita la isla.`
      : `${holds}. Every piece grows from a read with a thesis on Bobby: discipline, not volume. Visit the island.`,
    tagline: es ? 'Construida con disciplina, no con volumen.' : 'Built with discipline, not volume.',
    alt: es ? `${name}, una isla de Trader Land` : `${name}, a Trader Land island`,
  };
}

/** Changes whenever what the picture shows changes (a moved or waking core too), so previews never keep an old island. */
export function cardVersion(island: CardIsland, hash: (value: string) => string): string {
  const shape = island.placements.map((p) => `${p.item_id}@${p.x},${p.y},${p.rotation}`).sort().join('|');
  const core = cardCore(island);
  return hash(`${island.title ?? ''}#${island.size}#core@${core.x},${core.y},${core.stage}#${shape}`).slice(0, 12);
}

// ---------- the page ----------
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export interface PageMeta { title: string; description: string; url: string; image: string; alt: string; locale: string }

/** The site's index.html with this island's title, description, URL and preview image. */
export function withIslandMeta(html: string, meta: PageMeta): string {
  const e = escapeHtml;
  let out = html.replace(/<title>[^<]*<\/title>/, `<title>${e(meta.title)}</title>`);
  const tag = (attr: 'name' | 'property', key: string, value: string) => {
    const re = new RegExp(`<meta\\s+${attr}="${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s+content="[^"]*"\\s*/?>`);
    out = out.replace(re, `<meta ${attr}="${key}" content="${e(value)}" />`);
  };
  tag('name', 'title', meta.title);
  tag('name', 'description', meta.description);
  tag('property', 'og:url', meta.url);
  tag('property', 'og:title', meta.title);
  tag('property', 'og:description', meta.description);
  for (const key of ['og:image', 'og:image:url', 'og:image:secure_url']) tag('property', key, meta.image);
  tag('property', 'og:image:alt', meta.alt);
  tag('property', 'og:locale', meta.locale);
  tag('name', 'twitter:url', meta.url);
  tag('name', 'twitter:title', meta.title);
  tag('name', 'twitter:description', meta.description);
  tag('name', 'twitter:image', meta.image);
  tag('name', 'twitter:image:alt', meta.alt);
  out = out.replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${e(meta.url)}" />`);
  return out;
}

// ---------- the picture ----------
// The island is drawn in the studio's canvas units (the 860×720 island
// canvas; an 8×8 has tile 92×46 and origin 430,230 — iOS LandSpriteGeometry,
// web IslandThumb) and scaled into the card. A grown island packs smaller
// tiles into the same slab (landGeometry).
/** The part of the canvas the island and its tallest pieces occupy. */
const VIEW = { x: 40, y: 96, w: 780, h: 530 };

type El = { type: string; key?: string; props: Record<string, unknown> };
const el = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): El => ({ type, props: { style, children, ...extra } });

type Connector = 'NE' | 'SE' | 'SW' | 'NW';

interface Sprite { item: ManifestItem; state: ManifestState; col: number; row: number; rotation: number; flip: boolean; scale: number; depth: number; path: boolean; connectors: Connector[] }

/** Paint-ordered sprites, anchored on the footprint's bottom vertex like the apps. */
export function islandSprites(island: CardIsland, items: Map<string, ManifestItem>, geom: LandGeometry = landGeometry(island.size)): Sprite[] {
  const pathCells = new Set<string>();
  for (const p of island.placements) if (items.get(artId(p.item_id))?.kind === 'path_pavement') pathCells.add(`${p.x}:${p.y}`);
  const sprites: Sprite[] = [];
  const add = (item: ManifestItem, state: ManifestState | null, col: number, row: number, rotation: number, scale = 1) => {
    if (!state) return;
    const flip = rotation % 180 === 90;
    const connectors: Connector[] = [];
    if (item.kind === 'path_pavement') {
      if (pathCells.has(`${col}:${row - 1}`)) connectors.push('NE');
      if (pathCells.has(`${col + 1}:${row}`)) connectors.push('SE');
      if (pathCells.has(`${col}:${row + 1}`)) connectors.push('SW');
      if (pathCells.has(`${col - 1}:${row}`)) connectors.push('NW');
      if (!connectors.length) connectors.push(...(flip ? ['NW', 'SE'] as Connector[] : ['NE', 'SW'] as Connector[]));
    }
    const depth = frameOf(geom, item.footprint, col, row, rotation, state).depth;
    sprites.push({ item, state, col, row, rotation, flip, scale, depth, path: item.kind === 'path_pavement', connectors });
  };
  for (const p of island.placements) { const item = items.get(artId(p.item_id)); if (item) add(item, artState(item), p.x, p.y, p.rotation); }
  const core = items.get('aura_core');
  if (core) {
    const at = cardCore(island);
    // Dormant: the stage-0 art, static, at DORMANT_CORE_SCALE of its awake size.
    add(core, artState(core, at.stage), at.x, at.y, 0, at.stage === 0 ? DORMANT_CORE_SCALE : 1);
  }
  return sprites.sort((a, b) => a.depth - b.depth);
}

function spriteFrame(geom: LandGeometry, s: Sprite) {
  const f = frameOf(geom, s.item.footprint, s.col, s.row, s.rotation, s.state, { path: s.path, scale: s.scale });
  return { frame: { x: f.x, y: f.y, size: f.size }, face: f.face };
}

/**
 * The 1200×630 card as a Satori element tree. `art(url)` resolves a manifest
 * url to something an <img> can load (a data URI read from the bundle).
 */
export function cardElement(island: CardIsland, items: Map<string, ManifestItem>, lang: Lang, art: (url: string) => string | null): El {
  const stats = islandStats(island, items);
  const copy = cardCopy(island, stats, lang);
  const geom = landGeometry(island.size);
  const sprites = islandSprites(island, items, geom);
  const n = geom.size;

  // The island box on the right of the card.
  const box = { x: 430, y: 34, w: 750, h: 562 };
  const scale = Math.min(box.w / VIEW.w, box.h / VIEW.h);
  const ox = box.x + (box.w - VIEW.w * scale) / 2 - VIEW.x * scale;
  const oy = box.y + (box.h - VIEW.h * scale) / 2 - VIEW.y * scale;
  const X = (u: number) => ox + u * scale;
  const Y = (v: number) => oy + v * scale;

  const { left, bottom, right, depth: SLAB_DEPTH } = SLAB;
  const grid = Array.from({ length: n * n }, (_, i) => ({ type: 'polygon', props: { points: geom.diamond(i % n, Math.floor(i / n)), fill: 'none', stroke: 'rgba(255,255,255,0.05)', 'stroke-width': geom.unit } }));
  const shadows = sprites.map((s) => {
    const cols = s.flip ? s.item.footprint.rows : s.item.footprint.cols;
    const rows = s.flip ? s.item.footprint.cols : s.item.footprint.rows;
    return { type: 'polygon', props: { points: geom.diamond(s.col, s.row, cols, rows), fill: 'rgba(0,0,0,0.45)' } };
  });
  const ground = el('svg', { position: 'absolute', left: 0, top: 0 }, [
    { type: 'polygon', props: { points: `${left.x},${left.y} ${bottom.x},${bottom.y} ${bottom.x},${bottom.y + SLAB_DEPTH} ${left.x},${left.y + SLAB_DEPTH}`, fill: '#0c0e13' } },
    { type: 'polygon', props: { points: `${bottom.x},${bottom.y} ${right.x},${right.y} ${right.x},${right.y + SLAB_DEPTH} ${bottom.x},${bottom.y + SLAB_DEPTH}`, fill: '#050608' } },
    { type: 'polygon', props: { points: geom.diamond(0, 0, n, n), fill: '#111319', stroke: 'rgba(125,166,255,0.22)', 'stroke-width': 1 } },
    ...grid,
    ...shadows,
  ], { width: CARD.width, height: CARD.height, viewBox: `${-ox / scale} ${-oy / scale} ${CARD.width / scale} ${CARD.height / scale}` });

  const layers: El[] = [];
  sprites.forEach((s, index) => {
    const variant = s.state.variants.albedo_1024 ?? s.state.variants.albedo_512;
    const src = variant ? art(variant.url) : null;
    const { frame, face } = spriteFrame(geom, s);
    if (src) {
      layers.push(el('img', { position: 'absolute', left: X(frame.x), top: Y(frame.y), width: frame.size * scale, height: frame.size * scale, ...(s.flip ? { transform: 'scaleX(-1)' } : {}) }, undefined, { src, width: Math.round(frame.size * scale), height: Math.round(frame.size * scale), key: `s${index}` }));
    }
    if (face) {
      const c = { x: face.x + face.w / 2, y: face.y + face.h / 2 };
      const ends: Record<Connector, { x: number; y: number }> = {
        NE: { x: face.x + face.w * 0.75, y: face.y + face.h * 0.25 }, SE: { x: face.x + face.w * 0.75, y: face.y + face.h * 0.75 },
        SW: { x: face.x + face.w * 0.25, y: face.y + face.h * 0.75 }, NW: { x: face.x + face.w * 0.25, y: face.y + face.h * 0.25 },
      };
      layers.push(el('svg', { position: 'absolute', left: 0, top: 0 }, [
        ...s.connectors.map((k) => ({ type: 'line', props: { x1: c.x, y1: c.y, x2: ends[k].x, y2: ends[k].y, stroke: '#61ffc4', 'stroke-width': 4 * geom.unit, 'stroke-linecap': 'round' } })),
        { type: 'circle', props: { cx: c.x, cy: c.y, r: 4 * geom.unit, fill: '#baffdd' } },
      ], { width: CARD.width, height: CARD.height, viewBox: `${-ox / scale} ${-oy / scale} ${CARD.width / scale} ${CARD.height / scale}`, key: `f${index}` }));
    }
  });

  const text = el('div', { position: 'absolute', left: 64, top: 0, bottom: 0, width: 420, display: 'flex', flexDirection: 'column', justifyContent: 'center' }, [
    el('div', { display: 'flex', alignItems: 'center', marginBottom: 26 }, [
      el('div', { width: 10, height: 10, borderRadius: 5, background: '#2168ff', boxShadow: '0 0 14px #2168ff', marginRight: 12 }),
      el('div', { fontSize: 18, letterSpacing: 4, color: 'rgba(242,244,248,0.5)' }, 'TRADER LAND · BOBBY'),
    ]),
    el('div', { fontSize: copy.name.length > 18 ? 58 : 70, lineHeight: 1.04, letterSpacing: -2, color: '#f2f4f8', marginBottom: 26 }, copy.name),
    el('div', { fontSize: 28, color: '#7da6ff', marginBottom: 14 }, copy.holds),
    el('div', { fontSize: 22, lineHeight: 1.35, color: 'rgba(242,244,248,0.55)' }, copy.tagline),
  ]);

  return el('div', {
    width: CARD.width, height: CARD.height, display: 'flex', position: 'relative', overflow: 'hidden',
    background: 'radial-gradient(ellipse 620px 420px at 800px 380px, rgba(33,104,255,0.16), rgba(3,3,5,0) 70%), #030305',
  }, [ground, ...layers, text]);
}
