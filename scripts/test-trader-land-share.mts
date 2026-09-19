// ============================================================
// scripts/test-trader-land-share.mts
// Tests for the link preview of a published island:
//   · api/_lib/trader-land-card.ts — copy, version (size + core), meta
//     injection + escaping, the picture's geometry at every island size and
//     the core where the land keeps it, dormant or awake
//   · api/trader-land-share.ts     — page/image/fallback paths, with the
//     database and the app shell stubbed (no network, no production data)
// Run: `npx tsx scripts/test-trader-land-share.mts`
// ============================================================
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { artState, cardCopy, cardCore, cardVersion, escapeHtml, islandSprites, islandStats, langFrom, withIslandMeta, type CardIsland, type ManifestItem } from '../api/_lib/trader-land-card.ts';
import { DORMANT_CORE_SCALE, landGeometry, spriteFrame } from '../src/lib/trader-land/geometry.ts';

const failures: string[] = [];
let passed = 0;
const assert = (cond: unknown, msg: string) => {
  if (cond) passed++;
  else { failures.push(msg); console.error('  ✗', msg); }
};
const sha = (v: string) => createHash('sha256').update(v).digest('hex');

const shell = readFileSync('index.html', 'utf8');
const manifest = JSON.parse(readFileSync('public/land/v1/gate-A/asset-manifest.json', 'utf8')) as { items: ManifestItem[] };
const items = new Map(manifest.items.map((i) => [i.id, i]));
const anthony: CardIsland = { code: 'np4dl6dyys', title: 'Anthony Land', size: 8, placements: [{ item_id: 'crypto_bay_data_dock', x: 5, y: 3, rotation: 0 }, { item_id: 'axiom_archive_return_path', x: 0, y: 7, rotation: 0 }] };

// ---------- words ----------
assert(langFrom('es-MX,es;q=0.9') === 'es' && langFrom('en-US') === 'en' && langFrom(undefined) === 'en' && langFrom('fr, es') === 'en', 'langFrom picks the first preference');
const stats = islandStats(anthony, items);
assert(stats.pieces === 2 && stats.districts === 2, `stats count pieces and districts through the art alias (${JSON.stringify(stats)})`);
const es = cardCopy(anthony, stats, 'es');
assert(es.title === 'Anthony Land · Trader Land' && es.name === 'Anthony Land', 'title carries the island name');
assert(es.holds === '2 piezas · 2 distritos', `Spanish plural (${es.holds})`);
assert(cardCopy(anthony, { pieces: 1, districts: 1 }, 'en').holds === '1 piece · 1 district', 'English singular');
const untitled = cardCopy({ ...anthony, title: null }, { pieces: 0, districts: 0 }, 'es');
assert(untitled.title === 'Una isla de Trader Land' && untitled.holds === 'Recién fundada', 'untitled, empty island still reads well');

// ---------- version ----------
const v1 = cardVersion(anthony, sha);
assert(v1 === cardVersion({ ...anthony, placements: [...anthony.placements].reverse() }, sha), 'version ignores placement order');
assert(v1 !== cardVersion({ ...anthony, placements: [{ ...anthony.placements[0], x: 6 }, anthony.placements[1]] }, sha), 'moving a piece changes the version');
assert(v1 !== cardVersion({ ...anthony, title: 'Otra' }, sha), 'renaming changes the version');
assert(v1 === cardVersion({ ...anthony, core: { x: 3, y: 3, stage: 1 } }, sha), 'an island without a core (older server) is the 3,3 awake core');
assert(v1 !== cardVersion({ ...anthony, core: { x: 0, y: 5, stage: 1 } }, sha), 'moving the core changes the version');
assert(v1 !== cardVersion({ ...anthony, core: { x: 3, y: 3, stage: 0 } }, sha), 'a dormant core changes the version');
assert(v1 !== cardVersion({ ...anthony, size: 10 }, sha), 'a grown island changes the version');

// ---------- picture geometry ----------
{
  // An 8×8 card draws exactly what it drew before growth: tile 92×46, origin 430,230.
  const dock = items.get('crypto_bay_data_dock')!;
  const state = artState(dock)!;
  const [x0, , x1] = state.contentBounds;
  const oldSize = Math.min(360, 92 * 2 / 2 * 0.9 / Math.max(0.2, x1 - x0));
  const oldCenter = { x: 430 + (5 - 3) * 46, y: 230 + (5 + 3) * 23 };
  const oldGround = oldCenter.y + 46 * 2 / 4;
  const f = spriteFrame(landGeometry(8), dock.footprint, 5, 3, 0, state);
  assert(Math.abs(f.size - oldSize) < 1e-9 && Math.abs(f.x - (oldCenter.x + oldSize * (0.5 - state.anchor[0]) - oldSize / 2)) < 1e-9 && Math.abs(f.y - (oldGround + oldSize * (0.5 - state.anchor[1]) - oldSize / 2)) < 1e-9, '8×8 frames are unchanged');

  const coreSprite = (island: CardIsland) => islandSprites(island, items).find((sp) => sp.item.id === 'aura_core')!;
  const awake = coreSprite(anthony);
  assert(awake.col === 3 && awake.row === 3 && awake.scale === 1 && awake.state === artState(items.get('aura_core')!, 1), 'no core in the payload: 3,3, stage-1 art, full size');
  const dormant = coreSprite({ ...anthony, core: { x: 0, y: 5, stage: 0 } });
  const stage0 = Object.values(items.get('aura_core')!.orientations)[0].states.stage0;
  assert(dormant.col === 0 && dormant.row === 5, 'the core is drawn where the land keeps it');
  assert(dormant.state === stage0 && dormant.scale === DORMANT_CORE_SCALE, 'a dormant core uses the stage-0 art at 72 %');
  const geom10 = landGeometry(10);
  const grown: CardIsland = { ...anthony, size: 10, core: { x: 4, y: 4, stage: 1 }, placements: anthony.placements.map((p) => ({ ...p, x: p.x + 1, y: p.y + 1 })) };
  const sprites10 = islandSprites(grown, items);
  const dock10 = sprites10.find((sp) => sp.item.id === 'crypto_bay_data_dock')!;
  assert(dock10.col === 6 && dock10.row === 4 && Math.abs(dock10.depth - spriteFrame(geom10, dock.footprint, 6, 4, 0, state).depth) < 1e-9, 'a 10×10 island paints with the 10×10 geometry');
  assert(geom10.tileW < 92 && Math.abs(geom10.diamond(0, 0, 10, 10).split(' ')[0].split(',').map(Number)[1] - 207) < 1e-9, 'smaller tiles, same slab');
  assert(sprites10.every((sp, i) => i === 0 || sprites10[i - 1].depth <= sp.depth), 'paint order by depth');
  assert(cardCore({ code: 'x', title: null, size: 8, placements: [], core: { x: 1, y: 2, stage: 7 } }).stage === 1, 'any stage but 0 is awake');
}

// ---------- meta injection ----------
const meta = { title: es.title, description: es.description, url: 'https://bobbyprotocol.xyz/agentic-world/bobby/trader-land/w/np4dl6dyys', image: 'https://bobbyprotocol.xyz/api/trader-land-share?code=np4dl6dyys&img=1&lang=es&v=abc', alt: es.alt, locale: 'es_MX' };
const page = withIslandMeta(shell, meta);
const metaOf = (attr: string, key: string) => page.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1];
assert(page.includes('<title>Anthony Land · Trader Land</title>'), 'document title replaced');
for (const key of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:url', 'og:image:secure_url', 'og:image:alt', 'og:locale']) {
  assert(metaOf('property', key) !== undefined, `${key} present`);
}
for (const key of ['title', 'description', 'twitter:title', 'twitter:description', 'twitter:url', 'twitter:image', 'twitter:image:alt']) {
  assert(metaOf('name', key) !== undefined, `${key} present`);
}
assert(metaOf('property', 'og:title') === 'Anthony Land · Trader Land' && metaOf('name', 'twitter:title') === 'Anthony Land · Trader Land', 'og/twitter titles are the island');
assert(metaOf('property', 'og:image') === meta.image.replace(/&/g, '&amp;') && metaOf('name', 'twitter:image') === meta.image.replace(/&/g, '&amp;'), 'images point to the island card');
assert(page.includes(`<link rel="canonical" href="${meta.url}" />`), 'canonical is the island URL');
const leftovers = [...page.matchAll(/<meta (?:name|property)="(?:og:|twitter:)(?:title|description|image|url)[^"]*" content="([^"]*)"/g)].filter((m) => /Refuted before execution|bobby-social-base/.test(m[1]));
assert(leftovers.length === 0, `no site-wide preview left in og/twitter tags (${leftovers.map((m) => m[0]).join(' | ')})`);
assert(page.includes('<div id="root">') || page.includes('id="root"'), 'the app shell is intact');

// A hostile island name cannot break out of the attribute or the title.
const hostile = withIslandMeta(shell, { ...meta, title: '"><script>alert(1)</script>', alt: "x' onload='y" });
assert(!hostile.includes('<script>alert(1)</script>'), 'title is escaped');
assert(hostile.includes('&quot;&gt;&lt;script&gt;'), 'escape keeps the text visible');
assert(!/content="x' onload='y"/.test(hostile), 'single quotes are escaped');
assert(escapeHtml(`&<>"'`) === '&amp;&lt;&gt;&quot;&#39;', 'escapeHtml covers the five characters');

// ---------- handler ----------
process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-key';
type Row = { identity_id: string; size: number; theme: string; title: string | null; published_at: string | null; share_code: string | null; core_x: number; core_y: number; core_stage: number };
let lands: Row[] = [{ identity_id: '11111111-1111-1111-1111-111111111111', size: 8, theme: 'default', title: 'Anthony Land', published_at: '2026-09-18T00:00:00Z', share_code: 'np4dl6dyys', core_x: 0, core_y: 5, core_stage: 0 }];
let shellStatus = 200;
const requested: string[] = [];
globalThis.fetch = (async (input: string | URL) => {
  const url = String(input);
  requested.push(url);
  if (url === 'https://bobbyprotocol.xyz/') return new Response(shell, { status: shellStatus, headers: { 'content-type': 'text/html' } });
  if (url.startsWith('https://db.test/rest/v1/tl_lands')) {
    const code = url.match(/share_code=eq\.([a-z0-9]+)/)?.[1];
    return Response.json(lands.filter((l) => l.share_code === code && url.includes('visibility=eq.public')));
  }
  if (url.startsWith('https://db.test/rest/v1/tl_placements')) {
    return Response.json([
      { identity_id: lands[0].identity_id, x: 5, y: 3, rotation: 0, tl_inventory: { item_id: 'crypto_bay_data_dock' } },
      { identity_id: lands[0].identity_id, x: 0, y: 7, rotation: 0, tl_inventory: { item_id: 'crypto_bay_water_walkway' } },
    ]);
  }
  return new Response('not stubbed', { status: 599 });
}) as typeof fetch;

const { default: handler } = await import('../api/trader-land-share.ts');
function call(query: Record<string, string>, headers: Record<string, string> = {}) {
  const out: { status: number; headers: Record<string, string>; body: unknown; redirect?: string } = { status: 0, headers: {}, body: undefined };
  const res = {
    setHeader(k: string, v: string) { out.headers[k.toLowerCase()] = v; return res; },
    status(code: number) { out.status = code; return res; },
    send(body: unknown) { out.body = body; return res; },
    json(body: unknown) { out.body = body; return res; },
    redirect(code: number, url: string) { out.status = code; out.redirect = url; return res; },
  };
  const req = { method: 'GET', query, headers: { host: 'bobbyprotocol.xyz', 'accept-language': 'es-MX,es;q=0.9', ...headers } };
  return (handler as (req: unknown, res: unknown) => Promise<unknown>)(req, res).then(() => out);
}

const visit = await call({ code: 'np4dl6dyys' });
assert(visit.status === 200 && visit.headers['content-type']?.startsWith('text/html'), 'a published island serves the shell');
const html = String(visit.body);
assert(html.includes('<title>Anthony Land · Trader Land</title>'), 'served page carries the island title');
assert(/og:image" content="https:\/\/bobbyprotocol\.xyz\/api\/trader-land-share\?code=np4dl6dyys&amp;img=1&amp;lang=es&amp;v=[0-9a-f]{12}"/.test(html), 'served og:image is the versioned island card');
const servedPlacements = [{ item_id: 'crypto_bay_data_dock', x: 5, y: 3, rotation: 0 }, { item_id: 'crypto_bay_water_walkway', x: 0, y: 7, rotation: 0 }];
const withCore = cardVersion({ code: 'np4dl6dyys', title: 'Anthony Land', size: 8, core: { x: 0, y: 5, stage: 0 }, placements: servedPlacements }, sha);
assert(html.includes(`v=${withCore}"`), 'the served version carries the land\'s core (moved, dormant)');
assert(requested.some((u) => u.includes('tl_lands') && u.includes('core_x,core_y,core_stage')), 'the public land read selects the core');
assert(html.includes('2 piezas · 1 distrito'), 'served description counts the real placements');
assert(visit.headers['vary'] === 'Accept-Language', 'language varies the cache');

const english = await call({ code: 'np4dl6dyys' }, { 'accept-language': 'en-US' });
assert(String(english.body).includes('2 pieces · 1 district'), 'English visitors get English copy');

const privateIsland = await call({ code: 'zzzzzzzzzz' });
assert(privateIsland.status === 200 && String(privateIsland.body) === shell, 'an unknown or private code gets the untouched shell');
const junk = await call({ code: '../../etc' });
assert(junk.status === 200 && String(junk.body) === shell && !requested.some((u) => u.includes('etc')), 'a malformed code never reaches the database');

const image = await call({ code: 'np4dl6dyys', img: '1', lang: 'es' });
const png = image.body as Buffer;
assert(image.status === 200 && image.headers['content-type'] === 'image/png', `the card renders (${image.status})`);
assert(Buffer.isBuffer(png) && png.subarray(1, 4).toString() === 'PNG' && png.length > 50_000, 'the card is a real PNG with the art in it');
assert(/s-maxage=604800/.test(image.headers['cache-control'] ?? ''), 'the versioned card caches long');
lands = [{ ...lands[0], size: 12, core_x: 5, core_y: 5, core_stage: 1 }];
const grownImage = await call({ code: 'np4dl6dyys', img: '1', lang: 'en' });
assert(grownImage.status === 200 && Buffer.isBuffer(grownImage.body) && (grownImage.body as Buffer).length > 50_000, `a 12×12 island renders its card (${grownImage.status})`);
lands = [{ ...lands[0], size: 8, core_x: 0, core_y: 5, core_stage: 0 }];
const noImage = await call({ code: 'zzzzzzzzzz', img: '1' });
assert(noImage.status === 404, 'no card for an unpublished island');
const badImage = await call({ code: 'nope', img: '1' });
assert(badImage.status === 400, 'no card for a malformed code');

shellStatus = 503;
const down = await call({ code: 'np4dl6dyys' });
assert(down.status === 302 && down.redirect === '/trader-land/w/np4dl6dyys', 'if the shell cannot load, the visitor still reaches the island');

lands = [];
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
