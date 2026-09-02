import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, RotateCw, Sparkles, Undo2 } from 'lucide-react';

type District = 'crypto_bay' | 'evidence_mines' | 'thesis_citadel' | 'risk_reef' | 'axiom_archive';
type PathOrientation = 'ne_sw' | 'nw_se';
type Variant = { url: string; w: number; h: number };
type ArtState = {
  contentBounds: [number, number, number, number];
  anchor: [number, number];
  occlusionHeight: number;
  variants: Record<string, Variant>;
  derived_seed?: Variant & { method?: string };
};
type ManifestItem = {
  id: string;
  district: District | 'core';
  kind: 'core' | 'ground' | 'path_pavement' | 'decor' | 'building' | 'landmark';
  footprint: { cols: number; rows: number };
  orientations: Record<string, { connectors: Record<string, unknown>; states: Record<string, ArtState> }>;
};
type Manifest = { gate: string; version: number; layer_encoding: Record<string, string>; items: ManifestItem[] };
type Placement = { uid: string; itemId: string; col: number; row: number; orientation?: PathOrientation };
type Snapshot = { placements: Placement[]; focusLevel: number };
type SnapshotFixture = Snapshot & {
  version: number;
  gridSize: number;
  core: { itemId: string; col: number; row: number };
  expectedPathConnectors: Record<string, Connector[]>;
};

const GRID = 8;
const TILE_W = 92;
const TILE_H = 46;
const ORIGIN_X = 430;
const ORIGIN_Y = 230;
const STORAGE_KEY = 'bobby.trader-land.runtime-v03';
const districts: District[] = ['crypto_bay', 'evidence_mines', 'thesis_citadel', 'risk_reef', 'axiom_archive'];
const districtNames: Record<District, string> = {
  crypto_bay: 'Crypto Bay', evidence_mines: 'Evidence Mines', thesis_citadel: 'Thesis Citadel',
  risk_reef: 'Risk Reef', axiom_archive: 'Axiom Archive',
};
const fallbackSnapshot: SnapshotFixture = {
  version: 1, gridSize: GRID, focusLevel: 1, core: { itemId: 'aura_core', col: 3, row: 3 },
  placements: [], expectedPathConnectors: {},
};

function iso(col: number, row: number) {
  return { x: ORIGIN_X + (col - row) * TILE_W / 2, y: ORIGIN_Y + (col + row) * TILE_H / 2 };
}

function cellsFor(item: ManifestItem, col: number, row: number) {
  const cells: string[] = [];
  for (let x = 0; x < item.footprint.cols; x += 1) {
    for (let y = 0; y < item.footprint.rows; y += 1) cells.push(`${col + x}:${row + y}`);
  }
  return cells;
}

function artFor(item: ManifestItem, seed: boolean) {
  const orientation = Object.values(item.orientations)[0];
  const state = orientation.states.stage1 ?? orientation.states.bloom ?? Object.values(orientation.states)[0];
  return {
    albedo: (seed ? state.derived_seed : undefined) ?? state.variants.albedo_512 ?? state.variants.albedo_1024,
    glow: state.variants.glow_1024,
    shadow: state.variants.shadow_1024,
    thumb: state.variants.thumb_256,
    anchor: state.anchor,
    contentBounds: state.contentBounds,
  };
}

function LuminanceLayer({ src, mode, id }: { src?: string; mode: 'shadow' | 'glow'; id: string }) {
  if (!src) return null;
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
  const values = mode === 'shadow'
    ? '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  .2126 .7152 .0722 0 0'
    : '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  .2126 .7152 .0722 0 0';
  return (
    <svg className={`absolute inset-0 h-full w-full ${mode === 'glow' ? 'mix-blend-screen' : ''}`} viewBox="0 0 1024 1024" aria-hidden="true">
      <defs><filter id={`${mode}-${safeId}`} colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values={values} /></filter></defs>
      <image href={src} width="1024" height="1024" filter={`url(#${mode}-${safeId})`} opacity={mode === 'shadow' ? '.55' : '1'} />
    </svg>
  );
}

function ArtSprite({ item, placement, seed, selected }: { item: ManifestItem; placement: Placement; seed: boolean; selected: boolean }) {
  const art = artFor(item, seed);
  const center = iso(placement.col + (item.footprint.cols - 1) / 2, placement.row + (item.footprint.rows - 1) / 2);
  const visibleWidth = Math.max(.2, art.contentBounds[2] - art.contentBounds[0]);
  const footprintWidth = TILE_W * (item.footprint.cols + item.footprint.rows) / 2;
  const size = Math.min(360, footprintWidth * .9 / visibleWidth);
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: center.x - size / 2, top: center.y - size * art.anchor[1], width: size, height: size,
        zIndex: 100 + Math.round(center.y), filter: selected ? 'drop-shadow(0 0 10px #f6c945)' : undefined,
      }}
      aria-label={item.id}
    >
      <LuminanceLayer src={art.shadow?.url} mode="shadow" id={placement.uid} />
      <img src={art.albedo.url} alt="" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
      {!seed && <LuminanceLayer src={art.glow?.url} mode="glow" id={placement.uid} />}
    </div>
  );
}

type Connector = 'NE' | 'SE' | 'SW' | 'NW';
const connectorPoint: Record<Connector, [number, number]> = {
  NE: [TILE_W / 2, 2], SE: [TILE_W - 3, TILE_H / 2], SW: [TILE_W / 2, TILE_H - 2], NW: [3, TILE_H / 2],
};

function PathFilament({ placement, placements, itemsById, selected }: { placement: Placement; placements: Placement[]; itemsById: Map<string, ManifestItem>; selected: boolean }) {
  const p = iso(placement.col, placement.row);
  const pathCells = new Set(placements.filter((candidate) => itemsById.get(candidate.itemId)?.kind === 'path_pavement').map((candidate) => `${candidate.col}:${candidate.row}`));
  const active: Connector[] = [];
  if (pathCells.has(`${placement.col}:${placement.row - 1}`)) active.push('NE');
  if (pathCells.has(`${placement.col + 1}:${placement.row}`)) active.push('SE');
  if (pathCells.has(`${placement.col}:${placement.row + 1}`)) active.push('SW');
  if (pathCells.has(`${placement.col - 1}:${placement.row}`)) active.push('NW');
  if (!active.length) active.push(...(placement.orientation === 'nw_se' ? ['NW', 'SE'] : ['NE', 'SW']) as Connector[]);
  return (
    <svg className="pointer-events-none absolute overflow-visible" style={{ left: p.x - TILE_W / 2, top: p.y - TILE_H / 2, zIndex: 560 + placement.col + placement.row }} width={TILE_W} height={TILE_H} aria-label="Procedural path connectors">
      {active.map((connector) => <line key={`halo-${connector}`} x1={TILE_W / 2} y1={TILE_H / 2} x2={connectorPoint[connector][0]} y2={connectorPoint[connector][1]} stroke="#2cf5a4" strokeOpacity=".25" strokeWidth="13" filter="blur(5px)" />)}
      {active.map((connector) => <line key={connector} x1={TILE_W / 2} y1={TILE_H / 2} x2={connectorPoint[connector][0]} y2={connectorPoint[connector][1]} stroke={selected ? '#ffe071' : '#62ffc5'} strokeWidth="4" strokeLinecap="round" />)}
      <circle cx={TILE_W / 2} cy={TILE_H / 2} r="4" fill="#baffdd" />
    </svg>
  );
}

function Diamond({ col, row, tone, z = 800 }: { col: number; row: number; tone: 'valid' | 'invalid' | 'fog'; z?: number }) {
  const p = iso(col, row);
  const color = tone === 'valid' ? '#38f6a4' : tone === 'invalid' ? '#ff5d6c' : '#07101a';
  return <div className="pointer-events-none absolute" style={{ left: p.x - TILE_W / 2, top: p.y - TILE_H / 2, width: TILE_W, height: TILE_H, clipPath: 'polygon(50% 0,100% 50%,50% 100%,0 50%)', background: color, opacity: tone === 'fog' ? .76 : .28, outline: tone === 'fog' ? undefined : `2px solid ${color}`, zIndex: z }} />;
}

function pretty(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function TraderLandGatePage() {
  const scroller = useRef<HTMLDivElement>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [fixture, setFixture] = useState<SnapshotFixture | null>(null);
  const [loadError, setLoadError] = useState('');
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [focusLevel, setFocusLevel] = useState(1);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [district, setDistrict] = useState<District>('crypto_bay');
  const [selectedId, setSelectedId] = useState('crypto_bay_data_dock');
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<PathOrientation>('ne_sw');
  const [seed, setSeed] = useState(false);
  const [hovered, setHovered] = useState<{ col: number; row: number } | null>(null);
  const [notice, setNotice] = useState('Choose a blueprint, then tap a revealed tile.');

  useEffect(() => {
    Promise.all([
      fetch('/land/v1/gate-A/asset-manifest.json'),
      fetch('/land/v1/world-snapshot-v01.json'),
    ])
      .then(async ([manifestResponse, fixtureResponse]) => {
        if (!manifestResponse.ok || !fixtureResponse.ok) throw new Error('Runtime fixture unavailable');
        return [await manifestResponse.json() as Manifest, await fixtureResponse.json() as SnapshotFixture] as const;
      })
      .then(([manifestValue, fixtureValue]) => {
        if (!manifestValue.layer_encoding || manifestValue.items.length < 27 || fixtureValue.gridSize !== GRID) throw new Error('Incomplete runtime contract');
        setManifest(manifestValue); setFixture(fixtureValue);
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          const parsed = stored ? JSON.parse(stored) as Snapshot : null;
          const initial = parsed?.placements?.length ? parsed : fixtureValue;
          setPlacements(initial.placements); setFocusLevel(initial.focusLevel);
        } catch {
          setPlacements(fixtureValue.placements); setFocusLevel(fixtureValue.focusLevel);
        }
      })
      .catch((error) => setLoadError(String(error)));
  }, []);
  useEffect(() => {
    if (fixture) localStorage.setItem(STORAGE_KEY, JSON.stringify({ placements, focusLevel }));
  }, [fixture, placements, focusLevel]);
  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollLeft = Math.max(0, (node.scrollWidth - node.clientWidth) / 2);
  }, [manifest]);

  const itemsById = useMemo(() => new Map(manifest?.items.map((item) => [item.id, item]) ?? []), [manifest]);
  const inventory = useMemo(() => manifest?.items.filter((item) => item.district === district) ?? [], [district, manifest]);
  const selected = itemsById.get(selectedId) ?? inventory[0];
  const isRevealed = useCallback((col: number, row: number) => Math.max(Math.abs(col - 3.5), Math.abs(row - 3.5)) <= focusLevel + 1.5, [focusLevel]);
  const used = useMemo(() => {
    const cells = new Set(['3:3', '3:4', '4:3', '4:4']);
    placements.forEach((placement) => {
      const item = itemsById.get(placement.itemId);
      if (item) cellsFor(item, placement.col, placement.row).forEach((cell) => cells.add(cell));
    });
    return cells;
  }, [itemsById, placements]);
  const previewCells = useMemo(() => hovered && selected ? cellsFor(selected, hovered.col, hovered.row) : [], [hovered, selected]);
  const previewValid = Boolean(hovered && selected && hovered.col + selected.footprint.cols <= GRID && hovered.row + selected.footprint.rows <= GRID && previewCells.every((cell) => {
    const [col, row] = cell.split(':').map(Number);
    return isRevealed(col, row) && !used.has(cell);
  }));

  const checkpoint = useCallback(() => setHistory((value) => [...value.slice(-9), { placements, focusLevel }]), [focusLevel, placements]);
  const place = useCallback((col: number, row: number) => {
    if (!selected) return;
    const cells = cellsFor(selected, col, row);
    const valid = col + selected.footprint.cols <= GRID && row + selected.footprint.rows <= GRID && cells.every((cell) => {
      const [cellCol, cellRow] = cell.split(':').map(Number);
      return isRevealed(cellCol, cellRow) && !used.has(cell);
    });
    if (!valid) return setNotice('Blocked · reveal the tile or clear the full footprint.');
    checkpoint();
    const next: Placement = { uid: `${selected.id}-${Date.now()}`, itemId: selected.id, col, row, ...(selected.kind === 'path_pavement' ? { orientation } : {}) };
    setPlacements((value) => [...value, next]);
    setSelectedUid(next.uid);
    setNotice('Built · visual adjacency only. No XP or trading advantage.');
  }, [checkpoint, isRevealed, orientation, selected, used]);

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return setNotice('Nothing to undo.');
    setPlacements(previous.placements); setFocusLevel(previous.focusLevel); setHistory((value) => value.slice(0, -1)); setNotice('Last world change undone.');
  };
  const restore = () => { checkpoint(); const source = fixture ?? fallbackSnapshot; setPlacements(source.placements); setFocusLevel(source.focusLevel); setSelectedUid(null); setNotice('Canonical 8×8 snapshot restored.'); };
  const reveal = () => {
    if (focusLevel >= 2) return setNotice('The full 8×8 island is already revealed.');
    checkpoint(); setFocusLevel(2); setNotice('Focus expanded the fog ring: 6×6 → 8×8.');
  };

  if (loadError) return <main className="min-h-screen bg-[#05070a] p-8 text-red-300">Trader Land contract failed closed: {loadError}</main>;
  if (!manifest || !fixture) return <main className="min-h-screen bg-[#05070a] p-8 font-mono text-emerald-300">LOADING · TRADER LAND</main>;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#05070a] text-white">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div><div className="font-mono text-[10px] font-bold uppercase tracking-[.34em] text-emerald-300">Trader Land // Runtime v01</div><h1 className="mt-2 text-3xl font-semibold">Discipline becomes a world.</h1><p className="mt-2 max-w-2xl text-sm text-white/55">Local integration vertical · no wallet, XP, API, database or production writes.</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[.035] px-4 py-3 font-mono text-[10px] uppercase tracking-[.18em] text-white/55">Focus {focusLevel}/2 · {placements.length + 1} placed · autosaved</div>
        </header>

        <section className="mt-6 grid gap-4 xl:grid-cols-[1fr_300px]">
          <div ref={scroller} className="relative overflow-auto rounded-3xl border border-emerald-400/20 bg-[radial-gradient(circle_at_50%_42%,rgba(18,93,73,.24),transparent_48%),linear-gradient(#071019,#05070a)]">
            <div className="relative mx-auto h-[720px] min-w-[860px]" data-testid="trader-land-grid">
              {Array.from({ length: GRID * GRID }, (_, index) => {
                const col = index % GRID; const row = Math.floor(index / GRID); const p = iso(col, row);
                return <button key={`${col}:${row}`} onClick={() => place(col, row)} onMouseEnter={() => setHovered({ col, row })} onMouseLeave={() => setHovered(null)} className="absolute transition hover:brightness-150 focus:outline-none" style={{ left: p.x - TILE_W / 2, top: p.y - TILE_H / 2, width: TILE_W, height: TILE_H, clipPath: 'polygon(50% 0,100% 50%,50% 100%,0 50%)', background: (col + row) % 2 ? 'rgba(24,44,53,.82)' : 'rgba(19,36,45,.82)', border: 0, zIndex: 1 + col + row }} aria-label={`Tile ${col},${row}`} />;
              })}
              {placements.map((placement) => {
                const item = itemsById.get(placement.itemId); if (!item) return null;
                return <ArtSprite key={placement.uid} item={item} placement={placement} seed={seed} selected={placement.uid === selectedUid} />;
              })}
              {placements.map((placement) => itemsById.get(placement.itemId)?.kind === 'path_pavement' ? <PathFilament key={`flow-${placement.uid}`} placement={placement} placements={placements} itemsById={itemsById} selected={placement.uid === selectedUid} /> : null)}
              <ArtSprite item={itemsById.get('aura_core')!} placement={{ uid: 'aura-core', itemId: 'aura_core', col: 3, row: 3 }} seed={seed} selected={false} />
              {Array.from({ length: GRID * GRID }, (_, index) => { const col = index % GRID; const row = Math.floor(index / GRID); return !isRevealed(col, row) ? <Diamond key={`fog-${col}:${row}`} col={col} row={row} tone="fog" z={700 + col + row} /> : null; })}
              {hovered && previewCells.map((cell) => { const [col, row] = cell.split(':').map(Number); return <Diamond key={`preview-${cell}`} col={col} row={row} tone={previewValid ? 'valid' : 'invalid'} />; })}
              <div className="pointer-events-none absolute left-[355px] top-[544px] z-[900] rounded-full border border-emerald-300/30 bg-black/70 px-3 py-1 font-mono text-[9px] uppercase tracking-[.18em] text-emerald-200">Aura Core · balance</div>
            </div>
          </div>

          <aside className="rounded-3xl border border-white/10 bg-white/[.035] p-4">
            <div className="font-mono text-[10px] uppercase tracking-[.25em] text-white/45">District blueprints</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {districts.map((value) => <button key={value} onClick={() => { setDistrict(value); const first = manifest.items.find((item) => item.district === value); if (first) setSelectedId(first.id); }} className={`rounded-xl border px-2 py-2 text-left text-[10px] ${district === value ? 'border-emerald-300 bg-emerald-300/10 text-emerald-200' : 'border-white/10 text-white/50'}`}>{districtNames[value]}</button>)}
            </div>
            <div className="mt-4 grid grid-cols-5 gap-1.5">
              {inventory.map((item) => { const art = artFor(item, false); return <button key={item.id} onClick={() => setSelectedId(item.id)} title={pretty(item.id)} className={`aspect-square overflow-hidden rounded-xl border bg-black/30 ${selected?.id === item.id ? 'border-amber-300' : 'border-white/10'}`}><img src={art.thumb?.url ?? art.albedo.url} alt={pretty(item.id)} className="h-full w-full object-contain" /></button>; })}
            </div>
            {selected && <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3"><div className="text-sm font-semibold">{pretty(selected.id.replace(`${selected.district}_`, ''))}</div><div className="mt-1 font-mono text-[9px] uppercase tracking-[.16em] text-white/40">{selected.kind} · {selected.footprint.cols}×{selected.footprint.rows}</div></div>}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setOrientation((value) => value === 'ne_sw' ? 'nw_se' : 'ne_sw')} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70"><RotateCw size={13} />{orientation}</button>
              <button onClick={() => setSeed((value) => !value)} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70"><Sparkles size={13} />{seed ? 'seed' : 'bloom'}</button>
              <button onClick={undo} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70"><Undo2 size={13} />Undo</button>
              <button onClick={restore} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70">Restore</button>
              <button onClick={reveal} className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-emerald-300 px-3 py-2 text-xs font-bold text-black"><Eye size={14} />Reveal next focus ring</button>
            </div>
            <div className="mt-4 rounded-xl border border-emerald-300/15 bg-black/30 p-3 text-xs leading-relaxed text-white/55">{notice}</div>
            <div className="mt-4 space-y-1 font-mono text-[9px] uppercase tracking-[.13em] text-white/35"><div>Paths: neighbor-derived connectors</div><div>Adjacency: visual only</div><div>Depth: normalized anchor Y</div><div>Fog: placement denied</div><div>Persistence: localStorage</div></div>
          </aside>
        </section>
      </div>
    </main>
  );
}
