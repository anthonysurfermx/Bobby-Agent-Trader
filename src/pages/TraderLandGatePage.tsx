import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Minus, Plus, RotateCw, Sparkles, Undo2, Volume2, VolumeX, Waves } from 'lucide-react';

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
  animation_layers?: {
    layers: Record<'body' | 'ring_back' | 'sphere' | 'ring_front', Variant>;
    sphere_centre: [number, number];
    sphere_radius: number;
  };
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

function AnimatedAuraCore({ item, placement, seed, pulse }: { item: ManifestItem; placement: Placement; seed: boolean; pulse: number }) {
  const art = artFor(item, seed);
  const layers = item.animation_layers;
  const center = iso(placement.col + .5, placement.row + .5);
  const visibleWidth = Math.max(.2, art.contentBounds[2] - art.contentBounds[0]);
  const size = Math.min(360, TILE_W * 1.8 / visibleWidth);
  if (seed || !layers) return <ArtSprite item={item} placement={placement} seed={seed} selected={false} />;
  return (
    <div className="pointer-events-none absolute" data-testid="animated-aura-core" style={{ left: center.x - size / 2, top: center.y - size * art.anchor[1], width: size, height: size, zIndex: 100 + Math.round(center.y) }}>
      <LuminanceLayer src={art.shadow?.url} mode="shadow" id="aura-core-shadow" />
      <img src={layers.layers.body.url} alt="" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
      <img src={layers.layers.ring_back.url} alt="" className="aura-ring aura-ring-back absolute inset-0 h-full w-full object-contain" draggable={false} />
      <div className="aura-sphere absolute inset-0" key={pulse}>
        <img src={layers.layers.sphere.url} alt="" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
      </div>
      <img src={layers.layers.ring_front.url} alt="" className="aura-ring aura-ring-front absolute inset-0 h-full w-full object-contain" draggable={false} />
      <LuminanceLayer src={art.glow?.url} mode="glow" id="aura-core-glow" />
      {Array.from({ length: 7 }, (_, index) => (
        <span key={index} className="aura-mote absolute rounded-full bg-emerald-200 shadow-[0_0_8px_#46ffc0]" style={{ left: `${layers.sphere_centre[0] * 100}%`, top: `${layers.sphere_centre[1] * 100}%`, width: index % 3 === 0 ? 5 : 3, height: index % 3 === 0 ? 5 : 3, animationDelay: `${index * -1.13}s`, ['--orbit' as string]: `${(layers.sphere_radius * (1.7 + index * .12) * 100).toFixed(1)}%` }} />
      ))}
    </div>
  );
}

type SoundCue = 'land_enter_vrum' | 'aura_core_loop' | 'orbit_whoosh_a' | 'orbit_whoosh_b' | 'orbit_whoosh_c' | 'seed_reveal' | 'placement_tick' | 'placement_invalid' | 'placement_confirm' | 'bloom_complete' | 'fog_reveal' | 'five_attributes_chord';

function useLandSound() {
  const [enabled, setEnabled] = useState(false);
  const loop = useRef<HTMLAudioElement | null>(null);
  const cue = useCallback((name: SoundCue) => {
    if (!enabled) return;
    const audio = new Audio(`/land/v1/audio/${name}.m4a`);
    audio.volume = name.startsWith('orbit_') ? .35 : .48;
    void audio.play().catch(() => undefined);
  }, [enabled]);
  const toggle = useCallback(() => {
    setEnabled((current) => {
      if (current) { loop.current?.pause(); loop.current = null; return false; }
      const entrance = new Audio('/land/v1/audio/land_enter_vrum.m4a'); entrance.volume = .5; void entrance.play().catch(() => undefined);
      const ambience = new Audio('/land/v1/audio/aura_core_loop.m4a'); ambience.loop = true; ambience.volume = .16; loop.current = ambience;
      window.setTimeout(() => void ambience.play().catch(() => undefined), 420);
      return true;
    });
  }, []);
  useEffect(() => () => loop.current?.pause(), []);
  return { enabled, toggle, cue };
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
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [corePulse, setCorePulse] = useState(0);
  const [loadMetric, setLoadMetric] = useState('measuring…');
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ distance: number; midpoint: { x: number; y: number } } | null>(null);
  const dragged = useRef(false);
  const { enabled: soundEnabled, toggle: toggleSound, cue } = useLandSound();

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
  useEffect(() => {
    if (!manifest) return;
    const timer = window.setTimeout(() => {
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const art = resources.filter((entry) => entry.name.includes('/land/v1/gate-A/'));
      const bytes = art.reduce((sum, entry) => sum + (entry.transferSize || entry.encodedBodySize || 0), 0);
      setLoadMetric(`${art.length} art requests · ${(bytes / 1024 / 1024).toFixed(1)} MB transferred`);
    }, 1200);
    return () => window.clearTimeout(timer);
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
    if (dragged.current) { dragged.current = false; return; }
    if (!selected) return;
    const cells = cellsFor(selected, col, row);
    const valid = col + selected.footprint.cols <= GRID && row + selected.footprint.rows <= GRID && cells.every((cell) => {
      const [cellCol, cellRow] = cell.split(':').map(Number);
      return isRevealed(cellCol, cellRow) && !used.has(cell);
    });
    if (!valid) { cue('placement_invalid'); return setNotice('Blocked · reveal the tile or clear the full footprint.'); }
    checkpoint();
    const next: Placement = { uid: `${selected.id}-${Date.now()}`, itemId: selected.id, col, row, ...(selected.kind === 'path_pavement' ? { orientation } : {}) };
    setPlacements((value) => [...value, next]);
    setSelectedUid(next.uid);
    cue('placement_confirm');
    setNotice('Built · visual adjacency only. No XP or trading advantage.');
  }, [checkpoint, cue, isRevealed, orientation, selected, used]);

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return setNotice('Nothing to undo.');
    setPlacements(previous.placements); setFocusLevel(previous.focusLevel); setHistory((value) => value.slice(0, -1)); setNotice('Last world change undone.');
  };
  const restore = () => { checkpoint(); const source = fixture ?? fallbackSnapshot; setPlacements(source.placements); setFocusLevel(source.focusLevel); setSelectedUid(null); setNotice('Canonical 8×8 snapshot restored.'); };
  const reveal = () => {
    if (focusLevel >= 2) { cue('placement_invalid'); return setNotice('The full 8×8 island is already revealed.'); }
    checkpoint(); setFocusLevel(2); cue('fog_reveal'); window.setTimeout(() => cue('five_attributes_chord'), 700); setNotice('Focus expanded the fog ring: 6×6 → 8×8.');
  };

  const clampZoom = (value: number) => Math.min(1.8, Math.max(.68, value));
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const pointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId); pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); dragged.current = false;
  };
  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId); if (!previous) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const values = [...pointers.current.values()];
    if (values.length === 1) {
      const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) dragged.current = true;
      setPan((value) => ({ x: value.x + dx, y: value.y + dy }));
    } else if (values.length >= 2) {
      const distance = Math.hypot(values[1].x - values[0].x, values[1].y - values[0].y);
      const midpoint = { x: (values[0].x + values[1].x) / 2, y: (values[0].y + values[1].y) / 2 };
      if (gesture.current) { setZoom((value) => clampZoom(value * distance / Math.max(1, gesture.current!.distance))); setPan((value) => ({ x: value.x + midpoint.x - gesture.current!.midpoint.x, y: value.y + midpoint.y - gesture.current!.midpoint.y })); }
      gesture.current = { distance, midpoint }; dragged.current = true;
    }
  };
  const pointerUp = (event: React.PointerEvent<HTMLDivElement>) => { pointers.current.delete(event.pointerId); if (pointers.current.size < 2) gesture.current = null; window.setTimeout(() => { dragged.current = false; }, 0); };

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
          <div ref={scroller} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onWheel={(event) => { if (event.ctrlKey || event.metaKey) { event.preventDefault(); setZoom((value) => clampZoom(value - event.deltaY * .004)); } }} className="relative overflow-hidden rounded-3xl border border-emerald-400/20 bg-[radial-gradient(circle_at_50%_42%,rgba(18,93,73,.24),transparent_48%),linear-gradient(#071019,#05070a)] touch-none">
            <div className="absolute right-3 top-3 z-[1000] flex gap-1 rounded-xl border border-white/10 bg-black/70 p-1">
              <button aria-label="Zoom out" onClick={() => setZoom((value) => clampZoom(value - .15))} className="p-2 text-white/70"><Minus size={14} /></button>
              <button aria-label="Reset view" onClick={resetView} className="px-2 font-mono text-[9px] text-white/55">{Math.round(zoom * 100)}%</button>
              <button aria-label="Zoom in" onClick={() => setZoom((value) => clampZoom(value + .15))} className="p-2 text-white/70"><Plus size={14} /></button>
            </div>
            <div className="relative mx-auto h-[720px] min-w-[860px] will-change-transform" data-testid="trader-land-grid" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '50% 45%' }}>
              {Array.from({ length: GRID * GRID }, (_, index) => {
                const col = index % GRID; const row = Math.floor(index / GRID); const p = iso(col, row);
                return <button key={`${col}:${row}`} onClick={() => place(col, row)} onMouseEnter={() => setHovered({ col, row })} onMouseLeave={() => setHovered(null)} className="absolute transition hover:brightness-150 focus:outline-none" style={{ left: p.x - TILE_W / 2, top: p.y - TILE_H / 2, width: TILE_W, height: TILE_H, clipPath: 'polygon(50% 0,100% 50%,50% 100%,0 50%)', background: (col + row) % 2 ? 'rgba(24,44,53,.82)' : 'rgba(19,36,45,.82)', border: 0, zIndex: 1 + col + row }} aria-label={`Tile ${col},${row}`} />;
              })}
              {placements.map((placement) => {
                const item = itemsById.get(placement.itemId); if (!item) return null;
                return <ArtSprite key={placement.uid} item={item} placement={placement} seed={seed} selected={placement.uid === selectedUid} />;
              })}
              {placements.map((placement) => itemsById.get(placement.itemId)?.kind === 'path_pavement' ? <PathFilament key={`flow-${placement.uid}`} placement={placement} placements={placements} itemsById={itemsById} selected={placement.uid === selectedUid} /> : null)}
              <AnimatedAuraCore item={itemsById.get('aura_core')!} placement={{ uid: 'aura-core', itemId: 'aura_core', col: 3, row: 3 }} seed={seed} pulse={corePulse} />
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
              {inventory.map((item) => { const art = artFor(item, false); return <button key={item.id} onClick={() => { setSelectedId(item.id); cue('placement_tick'); }} title={pretty(item.id)} className={`aspect-square overflow-hidden rounded-xl border bg-black/30 ${selected?.id === item.id ? 'border-amber-300' : 'border-white/10'}`}><img src={art.thumb?.url ?? art.albedo.url} alt={pretty(item.id)} className="h-full w-full object-contain" /></button>; })}
            </div>
            {selected && <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3"><div className="text-sm font-semibold">{pretty(selected.id.replace(`${selected.district}_`, ''))}</div><div className="mt-1 font-mono text-[9px] uppercase tracking-[.16em] text-white/40">{selected.kind} · {selected.footprint.cols}×{selected.footprint.rows}</div></div>}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setOrientation((value) => value === 'ne_sw' ? 'nw_se' : 'ne_sw')} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70"><RotateCw size={13} />{orientation}</button>
              <button onClick={() => setSeed((value) => { cue(value ? 'bloom_complete' : 'seed_reveal'); return !value; })} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70"><Sparkles size={13} />{seed ? 'seed' : 'bloom'}</button>
              <button onClick={undo} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70"><Undo2 size={13} />Undo</button>
              <button onClick={restore} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70">Restore</button>
              <button onClick={reveal} className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-emerald-300 px-3 py-2 text-xs font-bold text-black"><Eye size={14} />Reveal next focus ring</button>
              <button onClick={toggleSound} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70">{soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}Sound {soundEnabled ? 'on' : 'off'}</button>
              <button onClick={() => { setCorePulse((value) => value + 1); cue((['orbit_whoosh_a', 'orbit_whoosh_b', 'orbit_whoosh_c'] as SoundCue[])[corePulse % 3]); }} className="flex items-center justify-center gap-2 rounded-xl border border-emerald-300/30 px-3 py-2 text-xs text-emerald-200"><Waves size={13} />Pulse core</button>
            </div>
            <div className="mt-4 rounded-xl border border-emerald-300/15 bg-black/30 p-3 text-xs leading-relaxed text-white/55">{notice}</div>
            <div className="mt-4 space-y-1 font-mono text-[9px] uppercase tracking-[.13em] text-white/35"><div>Paths: neighbor-derived connectors</div><div>Adjacency: visual only</div><div>Depth: normalized anchor Y</div><div>Fog: placement denied</div><div>Persistence: localStorage</div><div>View: pinch / drag / wheel</div><div>Load: {loadMetric}</div></div>
          </aside>
        </section>
      </div>
      <style>{`
        @keyframes aura-float { 0%,100% { transform: translateY(-2%); } 50% { transform: translateY(2%); } }
        @keyframes aura-ring-back { 0%,100% { transform: scaleX(.985) scaleY(1.01); opacity:.76; } 50% { transform: scaleX(1.015) scaleY(.99); opacity:1; } }
        @keyframes aura-ring-front { 0%,100% { transform: scaleX(1.01) scaleY(.99); opacity:.88; } 50% { transform: scaleX(.99) scaleY(1.012); opacity:1; } }
        @keyframes aura-orbit { from { transform: translate(-50%,-50%) rotate(0deg) translateX(var(--orbit)); opacity:.25; } 50% { opacity:1; } to { transform: translate(-50%,-50%) rotate(360deg) translateX(var(--orbit)); opacity:.25; } }
        .aura-sphere { animation: aura-float 7s ease-in-out infinite; filter: drop-shadow(0 0 10px rgba(64,255,179,.7)); }
        .aura-ring-back { animation: aura-ring-back 8s ease-in-out infinite; transform-origin: 50% 32%; }
        .aura-ring-front { animation: aura-ring-front 6.8s ease-in-out infinite; transform-origin: 50% 32%; }
        .aura-mote { animation: aura-orbit 7.9s linear infinite; transform-origin: 0 0; }
        @media (prefers-reduced-motion: reduce) { .aura-sphere,.aura-ring,.aura-mote { animation: none !important; } }
      `}</style>
    </main>
  );
}
