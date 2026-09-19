// ============================================================
// Trader Land share card — what a link preview (iMessage, WhatsApp, X,
// Telegram…) shows for a published island: its own title, what it holds and
// a picture of the island itself, instead of the site-wide Bobby metadata.
// Pure: the handler (api/trader-land-share.ts) does the I/O.
// ============================================================

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
export interface CardIsland { code: string; title: string | null; size: number; placements: CardPlacement[] }

export function artState(item: ManifestItem): ManifestState | null {
  const orientation = Object.values(item.orientations)[0];
  if (!orientation) return null;
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

/** Changes whenever what the picture shows changes, so previews never keep an old island. */
export function cardVersion(island: CardIsland, hash: (value: string) => string): string {
  const shape = island.placements.map((p) => `${p.item_id}@${p.x},${p.y},${p.rotation}`).sort().join('|');
  return hash(`${island.title ?? ''}#${island.size}#${shape}`).slice(0, 12);
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
// The island is drawn in the studio's canvas units (tile 92×46, origin 430,230,
// iOS LandSpriteGeometry / web IslandThumb) and scaled into the card.
const TILE_W = 92;
const TILE_H = 46;
const ORIGIN = { x: 430, y: 230 };
const SLAB_DEPTH = 22;
const CORE = { col: 3, row: 3 };
/** The part of the canvas the island and its tallest pieces occupy. */
const VIEW = { x: 40, y: 96, w: 780, h: 530 };
const iso = (col: number, row: number) => ({ x: ORIGIN.x + (col - row) * TILE_W / 2, y: ORIGIN.y + (col + row) * TILE_H / 2 });

type El = { type: string; key?: string; props: Record<string, unknown> };
const el = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): El => ({ type, props: { style, children, ...extra } });

type Connector = 'NE' | 'SE' | 'SW' | 'NW';

interface Sprite { item: ManifestItem; state: ManifestState; col: number; row: number; flip: boolean; depth: number; path: boolean; connectors: Connector[] }

/** Paint-ordered sprites, anchored on the footprint's bottom vertex like the apps. */
export function islandSprites(island: CardIsland, items: Map<string, ManifestItem>): Sprite[] {
  const pathCells = new Set<string>();
  for (const p of island.placements) if (items.get(artId(p.item_id))?.kind === 'path_pavement') pathCells.add(`${p.x}:${p.y}`);
  const sprites: Sprite[] = [];
  const add = (item: ManifestItem, col: number, row: number, rotation: number) => {
    const state = artState(item);
    if (!state) return;
    const flip = rotation % 180 === 90;
    const cols = flip ? item.footprint.rows : item.footprint.cols;
    const rows = flip ? item.footprint.cols : item.footprint.rows;
    const center = iso(col + (cols - 1) / 2, row + (rows - 1) / 2);
    const connectors: Connector[] = [];
    if (item.kind === 'path_pavement') {
      if (pathCells.has(`${col}:${row - 1}`)) connectors.push('NE');
      if (pathCells.has(`${col + 1}:${row}`)) connectors.push('SE');
      if (pathCells.has(`${col}:${row + 1}`)) connectors.push('SW');
      if (pathCells.has(`${col - 1}:${row}`)) connectors.push('NW');
      if (!connectors.length) connectors.push(...(flip ? ['NW', 'SE'] as Connector[] : ['NE', 'SW'] as Connector[]));
    }
    sprites.push({ item, state, col, row, flip, depth: center.y + TILE_H * (cols + rows) / 4, path: item.kind === 'path_pavement', connectors });
  };
  for (const p of island.placements) { const item = items.get(artId(p.item_id)); if (item) add(item, p.x, p.y, p.rotation); }
  const core = items.get('aura_core');
  if (core) add(core, CORE.col, CORE.row, 0);
  return sprites.sort((a, b) => a.depth - b.depth);
}

function spriteFrame(s: Sprite) {
  const cols = s.flip ? s.item.footprint.rows : s.item.footprint.cols;
  const rows = s.flip ? s.item.footprint.cols : s.item.footprint.rows;
  const center = iso(s.col + (cols - 1) / 2, s.row + (rows - 1) / 2);
  const ground = center.y + TILE_H * (cols + rows) / 4;
  const [x0, y0, x1] = s.state.contentBounds;
  const visible = Math.max(0.2, x1 - x0);
  const size = Math.min(360, TILE_W * (s.item.footprint.cols + s.item.footprint.rows) / 2 * 0.9 / visible);
  const midX = center.x + (s.flip ? -1 : 1) * size * (0.5 - s.state.anchor[0]);
  const midY = ground + size * (0.5 - s.state.anchor[1]);
  const frame = { x: midX - size / 2, y: midY - size / 2, size };
  let face: { x: number; y: number; w: number; h: number } | null = null;
  if (s.path) {
    const width = visible * size;
    const contentMid = (x0 + s.state.contentBounds[2]) / 2;
    const x = s.flip ? frame.x + size - size * contentMid : frame.x + size * contentMid;
    face = { x: x - width / 2, y: frame.y + y0 * size, w: width, h: width / 2 };
  }
  return { frame, face };
}

const diamond = (col: number, row: number, cols = 1, rows = 1) => {
  const hw = TILE_W / 2, hh = TILE_H / 2;
  const top = iso(col, row), right = iso(col + cols - 1, row), bottom = iso(col + cols - 1, row + rows - 1), left = iso(col, row + rows - 1);
  return `${top.x},${top.y - hh} ${right.x + hw},${right.y} ${bottom.x},${bottom.y + hh} ${left.x - hw},${left.y}`;
};

/**
 * The 1200×630 card as a Satori element tree. `art(url)` resolves a manifest
 * url to something an <img> can load (a data URI read from the bundle).
 */
export function cardElement(island: CardIsland, items: Map<string, ManifestItem>, lang: Lang, art: (url: string) => string | null): El {
  const stats = islandStats(island, items);
  const copy = cardCopy(island, stats, lang);
  const sprites = islandSprites(island, items);
  const n = Math.max(1, Math.min(16, island.size || 8));

  // The island box on the right of the card.
  const box = { x: 430, y: 34, w: 750, h: 562 };
  const scale = Math.min(box.w / VIEW.w, box.h / VIEW.h);
  const ox = box.x + (box.w - VIEW.w * scale) / 2 - VIEW.x * scale;
  const oy = box.y + (box.h - VIEW.h * scale) / 2 - VIEW.y * scale;
  const X = (u: number) => ox + u * scale;
  const Y = (v: number) => oy + v * scale;

  const left = { x: 62, y: 391 }, bottom = { x: 430, y: 575 }, right = { x: 798, y: 391 };
  const grid = Array.from({ length: n * n }, (_, i) => ({ type: 'polygon', props: { points: diamond(i % n, Math.floor(i / n)), fill: 'none', stroke: 'rgba(255,255,255,0.05)', 'stroke-width': 1 } }));
  const shadows = sprites.map((s) => {
    const cols = s.flip ? s.item.footprint.rows : s.item.footprint.cols;
    const rows = s.flip ? s.item.footprint.cols : s.item.footprint.rows;
    return { type: 'polygon', props: { points: diamond(s.col, s.row, cols, rows), fill: 'rgba(0,0,0,0.45)' } };
  });
  const ground = el('svg', { position: 'absolute', left: 0, top: 0 }, [
    { type: 'polygon', props: { points: `${left.x},${left.y} ${bottom.x},${bottom.y} ${bottom.x},${bottom.y + SLAB_DEPTH} ${left.x},${left.y + SLAB_DEPTH}`, fill: '#0c0e13' } },
    { type: 'polygon', props: { points: `${bottom.x},${bottom.y} ${right.x},${right.y} ${right.x},${right.y + SLAB_DEPTH} ${bottom.x},${bottom.y + SLAB_DEPTH}`, fill: '#050608' } },
    { type: 'polygon', props: { points: diamond(0, 0, n, n), fill: '#111319', stroke: 'rgba(125,166,255,0.22)', 'stroke-width': 1 } },
    ...grid,
    ...shadows,
  ], { width: CARD.width, height: CARD.height, viewBox: `${-ox / scale} ${-oy / scale} ${CARD.width / scale} ${CARD.height / scale}` });

  const layers: El[] = [];
  sprites.forEach((s, index) => {
    const variant = s.state.variants.albedo_1024 ?? s.state.variants.albedo_512;
    const src = variant ? art(variant.url) : null;
    const { frame, face } = spriteFrame(s);
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
        ...s.connectors.map((k) => ({ type: 'line', props: { x1: c.x, y1: c.y, x2: ends[k].x, y2: ends[k].y, stroke: '#61ffc4', 'stroke-width': 4, 'stroke-linecap': 'round' } })),
        { type: 'circle', props: { cx: c.x, cy: c.y, r: 4, fill: '#baffdd' } },
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
