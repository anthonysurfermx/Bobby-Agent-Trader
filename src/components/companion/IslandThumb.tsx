// A still, read-only render of an island: the same isometric grid, art anchors
// and path filaments as the studio, drawn as one SVG so a gallery can show many.
import { artOf, type LandManifest, type ManifestItem, type PublicPlacement } from '@/lib/trader-land/public';

const TILE_W = 92;
const TILE_H = 46;
const ORIGIN_X = 430;
const ORIGIN_Y = 230;
const iso = (col: number, row: number) => ({ x: ORIGIN_X + (col - row) * TILE_W / 2, y: ORIGIN_Y + (col + row) * TILE_H / 2 });
const diamond = (col: number, row: number) => {
  const { x, y } = iso(col, row);
  return `${x},${y - TILE_H / 2} ${x + TILE_W / 2},${y} ${x},${y + TILE_H / 2} ${x - TILE_W / 2},${y}`;
};
type Connector = 'NE' | 'SE' | 'SW' | 'NW';
const connectorOffset: Record<Connector, [number, number]> = { NE: [TILE_W / 4, -TILE_H / 4], SE: [TILE_W / 4, TILE_H / 4], SW: [-TILE_W / 4, TILE_H / 4], NW: [-TILE_W / 4, -TILE_H / 4] };

type Sprite = { key: string; item: ManifestItem; col: number; row: number; flipped: boolean; depth: number };

export default function IslandThumb({ placements, manifest, size = 8, title, className }: { placements: PublicPlacement[]; manifest: LandManifest; size?: number; title?: string; className?: string }) {
  const items = new Map(manifest.items.map((item) => [item.id, item]));
  const n = Math.max(1, Math.min(16, size));
  const sprites: Sprite[] = [];
  const pathCells = new Set<string>();
  for (const p of placements) {
    const item = items.get(p.item_id);
    if (!item) continue;
    const flipped = p.rotation % 180 === 90;
    const cols = flipped ? item.footprint.rows : item.footprint.cols;
    const rows = flipped ? item.footprint.cols : item.footprint.rows;
    if (item.kind === 'path_pavement') pathCells.add(`${p.x}:${p.y}`);
    sprites.push({ key: `${p.item_id}-${p.x}-${p.y}`, item, col: p.x, row: p.y, flipped, depth: iso(p.x + (cols - 1) / 2, p.y + (rows - 1) / 2).y });
  }
  const core = items.get('aura_core');
  if (core) sprites.push({ key: 'core', item: core, col: 3, row: 3, flipped: false, depth: iso(3.5, 3.5).y });
  sprites.sort((a, b) => a.depth - b.depth);
  return (
    <svg viewBox="30 110 800 520" className={className} role="img" aria-label={title}>
      {title && <title>{title}</title>}
      <path d="M62 391 L430 575 L798 391 L798 412 L430 602 L62 412 Z" fill="#0a2527" stroke="#496b60" />
      {Array.from({ length: n * n }, (_, index) => <polygon key={index} points={diamond(index % n, Math.floor(index / n))} fill={(index + Math.floor(index / n)) % 2 ? '#213e35' : '#244438'} stroke="#92c4a6" strokeOpacity=".17" />)}
      {placements.filter((p) => items.get(p.item_id)?.kind === 'path_pavement').map((p) => {
        const c = iso(p.x, p.y);
        const active: Connector[] = [];
        if (pathCells.has(`${p.x}:${p.y - 1}`)) active.push('NE');
        if (pathCells.has(`${p.x + 1}:${p.y}`)) active.push('SE');
        if (pathCells.has(`${p.x}:${p.y + 1}`)) active.push('SW');
        if (pathCells.has(`${p.x - 1}:${p.y}`)) active.push('NW');
        if (!active.length) active.push(...((p.rotation % 180 === 90 ? ['NW', 'SE'] : ['NE', 'SW']) as Connector[]));
        return (
          <g key={`path-${p.x}-${p.y}`}>
            {active.map((k) => <line key={`halo-${k}`} x1={c.x} y1={c.y} x2={c.x + connectorOffset[k][0]} y2={c.y + connectorOffset[k][1]} stroke="#2cf5a4" strokeOpacity=".25" strokeWidth="13" strokeLinecap="round" />)}
            {active.map((k) => <line key={k} x1={c.x} y1={c.y} x2={c.x + connectorOffset[k][0]} y2={c.y + connectorOffset[k][1]} stroke="#62ffc5" strokeWidth="4" strokeLinecap="round" />)}
            <circle cx={c.x} cy={c.y} r="4" fill="#baffdd" />
          </g>
        );
      })}
      {sprites.map((s) => {
        const art = artOf(s.item);
        const isCore = s.item.kind === 'core';
        const cols = s.flipped ? s.item.footprint.rows : s.item.footprint.cols;
        const rows = s.flipped ? s.item.footprint.cols : s.item.footprint.rows;
        const c = isCore ? iso(s.col + .5, s.row + .5) : iso(s.col + (cols - 1) / 2, s.row + (rows - 1) / 2);
        const visible = Math.max(.2, art.contentBounds[2] - art.contentBounds[0]);
        const px = Math.min(360, isCore ? TILE_W * 1.8 / visible : TILE_W * (s.item.footprint.cols + s.item.footprint.rows) / 2 * .9 / visible);
        const x = isCore ? c.x - px / 2 : c.x - px * art.anchor[0];
        const y = c.y - px * art.anchor[1];
        return <g key={s.key} transform={s.flipped ? `translate(${c.x * 2} 0) scale(-1 1)` : undefined}><image href={art.albedo.url} x={x} y={y} width={px} height={px} /></g>;
      })}
    </svg>
  );
}
