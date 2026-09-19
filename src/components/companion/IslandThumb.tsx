// A still, read-only render of an island: the same isometric grid, art anchors
// and path filaments as the studio, drawn as one SVG so a gallery can show many.
// A grown island (10/12/16) packs smaller tiles into the same slab
// (src/lib/trader-land/geometry.ts); its Aura Core sits where its builder moved it.
import { CORE_FOOTPRINT, DORMANT_CORE_SCALE, landGeometry, spriteFrame } from '@/lib/trader-land/geometry';
import { landCore } from '@/lib/trader-land/growth';
import { artOf, type LandManifest, type ManifestItem, type PublicPlacement } from '@/lib/trader-land/public';

type Connector = 'NE' | 'SE' | 'SW' | 'NW';
/** Filament ends on a path slab's top face, as fractions of the face box (share card, studio). */
const connectorEnd: Record<Connector, [number, number]> = { NE: [0.75, 0.25], SE: [0.75, 0.75], SW: [0.25, 0.75], NW: [0.25, 0.25] };

type Sprite = { key: string; item: ManifestItem; col: number; row: number; rotation: number; path: boolean; state?: string; scale?: number; connectors: Connector[] };

export default function IslandThumb({ placements, manifest, size = 8, core: rawCore, title, className }: { placements: PublicPlacement[]; manifest: LandManifest; size?: number; core?: { x: number; y: number; stage: 0 | 1 } | null; title?: string; className?: string }) {
  const items = new Map(manifest.items.map((item) => [item.id, item]));
  const geom = landGeometry(size);
  const core = landCore(rawCore, geom.size);
  const u = geom.unit;
  const pathCells = new Set<string>();
  for (const p of placements) if (items.get(p.item_id)?.kind === 'path_pavement') pathCells.add(`${p.x}:${p.y}`);
  const sprites: Sprite[] = [];
  for (const p of placements) {
    const item = items.get(p.item_id);
    if (!item) continue;
    const path = item.kind === 'path_pavement';
    const connectors: Connector[] = [];
    if (path) {
      if (pathCells.has(`${p.x}:${p.y - 1}`)) connectors.push('NE');
      if (pathCells.has(`${p.x + 1}:${p.y}`)) connectors.push('SE');
      if (pathCells.has(`${p.x}:${p.y + 1}`)) connectors.push('SW');
      if (pathCells.has(`${p.x - 1}:${p.y}`)) connectors.push('NW');
      if (!connectors.length) connectors.push(...((p.rotation % 180 === 90 ? ['NW', 'SE'] : ['NE', 'SW']) as Connector[]));
    }
    sprites.push({ key: `${p.item_id}-${p.x}-${p.y}`, item, col: p.x, row: p.y, rotation: p.rotation, path, connectors });
  }
  const coreItem = items.get('aura_core');
  // A dormant core draws its stage-0 art, smaller; an awake one its stage-1 art.
  if (coreItem) sprites.push({ key: 'core', item: coreItem, col: core.x, row: core.y, rotation: 0, path: false, state: core.stage === 0 ? 'stage0' : 'stage1', scale: core.stage === 0 ? DORMANT_CORE_SCALE : 1, connectors: [] });
  const drawn = sprites.map((s) => {
    const art = artOf(s.item, s.state);
    const footprint = s.item.kind === 'core' ? CORE_FOOTPRINT : s.item.footprint;
    return { s, art, frame: spriteFrame(geom, footprint, s.col, s.row, s.rotation, art, { path: s.path, scale: s.scale }) };
  }).sort((a, b) => a.frame.depth - b.frame.depth);
  return (
    <svg viewBox="30 110 800 520" className={className} role="img" aria-label={title}>
      {title && <title>{title}</title>}
      {/* The slab never changes with the size (constant extent). */}
      <path d="M62 391 L430 575 L798 391 L798 412 L430 602 L62 412 Z" fill="#0a2527" stroke="#496b60" />
      {Array.from({ length: geom.size * geom.size }, (_, index) => {
        const col = index % geom.size, row = Math.floor(index / geom.size);
        return <polygon key={index} points={geom.diamond(col, row)} fill={(col + row) % 2 ? '#213e35' : '#244438'} stroke="#92c4a6" strokeOpacity=".17" strokeWidth={u} />;
      })}
      {drawn.map(({ s, art, frame }) => {
        const x = frame.x, y = frame.y, px = frame.size;
        const face = frame.face;
        return (
          <g key={s.key}>
            <g transform={frame.flip ? `translate(${(x + px / 2) * 2} 0) scale(-1 1)` : undefined}><image href={art.albedo.url} x={x} y={y} width={px} height={px} /></g>
            {face && s.connectors.length > 0 && (() => {
              const c = { x: face.x + face.w / 2, y: face.y + face.h / 2 };
              return <g>
                {s.connectors.map((k) => <line key={`halo-${k}`} x1={c.x} y1={c.y} x2={face.x + face.w * connectorEnd[k][0]} y2={face.y + face.h * connectorEnd[k][1]} stroke="#2cf5a4" strokeOpacity=".25" strokeWidth={13 * u} strokeLinecap="round" />)}
                {s.connectors.map((k) => <line key={k} x1={c.x} y1={c.y} x2={face.x + face.w * connectorEnd[k][0]} y2={face.y + face.h * connectorEnd[k][1]} stroke="#62ffc5" strokeWidth={4 * u} strokeLinecap="round" />)}
                <circle cx={c.x} cy={c.y} r={4 * u} fill="#baffdd" />
              </g>;
            })()}
          </g>
        );
      })}
    </svg>
  );
}

