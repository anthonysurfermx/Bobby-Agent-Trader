// Renders share cards locally from the bundled art: `npx tsx scripts/render-trader-land-card.mts <outDir>`.
// Islands: Anthony Land's current layout and the fuller world-snapshot fixture.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from '@vercel/og';
import { CARD, cardElement, type CardIsland, type ManifestItem } from '../api/_lib/trader-land-card.ts';

const out = process.argv[2] ?? '.';
const pub = join(process.cwd(), 'public');
const manifest = JSON.parse(readFileSync(join(pub, 'land/v1/gate-A/asset-manifest.json'), 'utf8')) as { items: ManifestItem[] };
const items = new Map(manifest.items.map((i) => [i.id, i]));
const art = (url: string) => `data:image/png;base64,${readFileSync(join(pub, url)).toString('base64')}`;
const fixture = JSON.parse(readFileSync(join(pub, 'land/v1/world-snapshot-v01.json'), 'utf8')) as { placements: Array<{ itemId: string; col: number; row: number; orientation?: string }> };

const islands: Record<string, CardIsland> = {
  anthony: { code: 'np4dl6dyys', title: 'Anthony Land', size: 8, placements: [{ item_id: 'crypto_bay_data_dock', x: 5, y: 3, rotation: 0 }, { item_id: 'crypto_bay_water_walkway', x: 0, y: 7, rotation: 0 }] },
  full: { code: 'fixture000', title: 'Isla de la disciplina con nombre largo', size: 8, placements: fixture.placements.map((p) => ({ item_id: p.itemId, x: p.col, y: p.row, rotation: p.orientation === 'nw_se' ? 90 : 0 })) },
  untitled: { code: 'fixture001', title: null, size: 8, placements: [] },
};
for (const [name, island] of Object.entries(islands)) {
  for (const lang of ['es', 'en'] as const) {
    const started = Date.now();
    const png = Buffer.from(await new ImageResponse(cardElement(island, items, lang, art) as never, { width: CARD.width, height: CARD.height }).arrayBuffer());
    writeFileSync(join(out, `card-${name}-${lang}.png`), png);
    console.log(name, lang, png.length, 'bytes', Date.now() - started, 'ms');
  }
}
