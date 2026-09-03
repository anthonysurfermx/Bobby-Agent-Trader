import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, LoaderCircle, Minus, Plus, RotateCw, Sparkles, Trash2, Volume2, VolumeX, Waves } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppKit } from '@reown/appkit/react';
import { useBobbySession } from '@/hooks/useBobbySession';

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
type CatalogItem = { id: string; world: string; attribution: string; kind: string; footprint_w: number; footprint_h: number; route_index: number | null; art_url: string | null };
type WorldInventory = { id: string; item_id: string; state: 'seed' | 'bloomed'; source: string; placed: boolean; item: CatalogItem | null };
type ApiPlacement = { id: string; inventory_id: string; x: number; y: number; rotation: number };
type World = {
  xp: number;
  aura: number;
  land: { size: number };
  route: { index: number; total: number; complete: boolean; next: { id: string } | null };
  inventory: WorldInventory[];
  placements: ApiPlacement[];
};

const GRID = 8;
const TILE_W = 92;
const TILE_H = 46;
const ORIGIN_X = 430;
const ORIGIN_Y = 230;
const districts: District[] = ['crypto_bay', 'evidence_mines', 'thesis_citadel', 'risk_reef', 'axiom_archive'];
const districtNames: Record<District, string> = {
  crypto_bay: 'Crypto Bay', evidence_mines: 'Evidence Mines', thesis_citadel: 'Thesis Citadel',
  risk_reef: 'Risk Reef', axiom_archive: 'Axiom Archive',
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
  const [loadError, setLoadError] = useState('');
  const [world, setWorld] = useState<World | null>(null);
  const [busy, setBusy] = useState(false);
  const [district, setDistrict] = useState<District>('crypto_bay');
  const [selectedInventoryId, setSelectedInventoryId] = useState<string | null>(null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<PathOrientation>('ne_sw');
  const [hovered, setHovered] = useState<{ col: number; row: number } | null>(null);
  const [notice, setNotice] = useState('Choose an unlocked piece, then tap a free tile.');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [corePulse, setCorePulse] = useState(0);
  const [loadMetric, setLoadMetric] = useState('measuring…');
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ distance: number; midpoint: { x: number; y: number } } | null>(null);
  const dragged = useRef(false);
  const { enabled: soundEnabled, toggle: toggleSound, cue } = useLandSound();
  const { wallet, ready, ensureSession, headers } = useBobbySession({ auto: false });
  const { open } = useAppKit();

  useEffect(() => {
    fetch('/land/v1/gate-A/asset-manifest.json')
      .then(async (response) => {
        if (!response.ok) throw new Error('Art manifest unavailable');
        return response.json() as Promise<Manifest>;
      })
      .then((value) => {
        if (!value.layer_encoding || value.items.length < 27) throw new Error('Incomplete art contract');
        setManifest(value);
      })
      .catch((error) => setLoadError(String(error)));
  }, []);

  const requestWorld = useCallback(async (body?: Record<string, unknown>) => {
    setBusy(true);
    setLoadError('');
    try {
      const response = await fetch('/api/trader-land', {
        method: body ? 'POST' : 'GET',
        headers: { ...headers(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const json = await response.json().catch(() => ({})) as World & { error?: string };
      if (!response.ok) throw new Error(json.error || 'Trader Land request failed');
      setWorld(json);
      return json;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setBusy(false);
    }
  // `headers` reads the current session from storage on each request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, wallet]);

  useEffect(() => {
    if (ready) void requestWorld();
    else setWorld(null);
  }, [ready, requestWorld]);

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
  const placements = useMemo<Placement[]>(() => world?.placements.map((placement) => {
    const inventory = world.inventory.find((candidate) => candidate.id === placement.inventory_id);
    return { uid: placement.id, itemId: inventory?.item_id ?? '', col: placement.x, row: placement.y, orientation: placement.rotation === 90 || placement.rotation === 270 ? 'nw_se' : 'ne_sw' };
  }).filter((placement) => placement.itemId) ?? [], [world]);
  const inventory = useMemo(() => world?.inventory.filter((entry) => entry.item?.world === district) ?? [], [district, world]);
  const selectedInventory = world?.inventory.find((entry) => entry.id === selectedInventoryId) ?? inventory.find((entry) => entry.state === 'bloomed' && !entry.placed) ?? inventory[0];
  const selected = selectedInventory ? itemsById.get(selectedInventory.item_id) : undefined;
  useEffect(() => {
    if (!selectedInventoryId && selectedInventory) setSelectedInventoryId(selectedInventory.id);
  }, [selectedInventory, selectedInventoryId]);
  const used = useMemo(() => {
    const cells = new Set(['3:3', '3:4', '4:3', '4:4']);
    placements.forEach((placement) => {
      const item = itemsById.get(placement.itemId);
      if (item) cellsFor(item, placement.col, placement.row).forEach((cell) => cells.add(cell));
    });
    return cells;
  }, [itemsById, placements]);
  const previewCells = useMemo(() => hovered && selected ? cellsFor(selected, hovered.col, hovered.row) : [], [hovered, selected]);
  const previewValid = Boolean(hovered && selected && selectedInventory?.state === 'bloomed' && !selectedInventory.placed && hovered.col + selected.footprint.cols <= GRID && hovered.row + selected.footprint.rows <= GRID && previewCells.every((cell) => !used.has(cell)));

  const place = useCallback(async (col: number, row: number) => {
    if (dragged.current) { dragged.current = false; return; }
    if (!selected || !selectedInventory || busy) return;
    if (selectedInventory.state !== 'bloomed') { cue('placement_invalid'); setNotice('That piece is still a seed. Keep learning to bloom it.'); return; }
    if (selectedInventory.placed) { cue('placement_invalid'); setNotice('That piece is already in your Land.'); return; }
    const cells = cellsFor(selected, col, row);
    const valid = col + selected.footprint.cols <= GRID && row + selected.footprint.rows <= GRID && cells.every((cell) => !used.has(cell));
    if (!valid) { cue('placement_invalid'); setNotice('Blocked · clear the full footprint and try another tile.'); return; }
    const next = await requestWorld({ action: 'place', inventoryId: selectedInventory.id, x: col, y: row, rotation: orientation === 'nw_se' ? 90 : 0 });
    if (!next) { cue('placement_invalid'); return; }
    const placed = next.placements.find((entry) => entry.inventory_id === selectedInventory.id);
    setSelectedUid(placed?.id ?? null);
    cue('placement_confirm');
    setNotice('Built and saved to your shared Bobby identity.');
  }, [busy, cue, orientation, requestWorld, selected, selectedInventory, used]);

  const remove = useCallback(async (placementId: string) => {
    if (busy) return;
    const next = await requestWorld({ action: 'remove', placementId });
    if (!next) { cue('placement_invalid'); return; }
    setSelectedUid(null);
    cue('placement_tick');
    setNotice('Piece returned to your inventory and synced.');
  }, [busy, cue, requestWorld]);

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

  if (!manifest) return <main className="min-h-screen bg-[#05070a] p-8 font-mono text-emerald-300">{loadError ? `TRADER LAND · ${loadError}` : 'LOADING · TRADER LAND'}</main>;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#05070a] text-white">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link to="/desk" className="mb-4 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.18em] text-white/45 hover:text-white"><ArrowLeft size={13} />Back to desk</Link>
            <div className="font-mono text-[10px] font-bold uppercase tracking-[.34em] text-emerald-300">Trader Land // Shared world</div>
            <h1 className="mt-2 text-3xl font-semibold">Your discipline becomes a world.</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/55">Every piece is earned through the same XP and Discovery Route on web and iOS. Placement never changes a trade or creates an advantage.</p>
          </div>
          {world && <div className="rounded-2xl border border-white/10 bg-white/[.035] px-4 py-3 font-mono text-[10px] uppercase tracking-[.18em] text-white/55">{world.xp} XP · {world.aura} aura · route {world.route.index}/{world.route.total} · {placements.length} placed</div>}
        </header>

        {!ready && (
          <section className="mt-10 rounded-3xl border border-emerald-400/20 bg-emerald-400/[.04] p-8 text-center">
            <Sparkles className="mx-auto text-emerald-300" size={28} />
            <h2 className="mt-4 text-xl font-semibold">Load your Trader Land</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-white/55">Use the same Bobby identity you link with the iOS app. Your XP, inventory and placements stay server-authoritative and follow you between both experiences.</p>
            <button onClick={() => void (wallet ? ensureSession() : open())} className="mt-5 rounded-xl bg-emerald-300 px-5 py-3 font-mono text-xs font-bold uppercase tracking-[.15em] text-black">{wallet ? 'Verify and load' : 'Connect to continue'}</button>
          </section>
        )}

        {ready && busy && !world && <div className="mt-10 flex items-center justify-center gap-2 font-mono text-xs text-emerald-300"><LoaderCircle className="animate-spin" size={16} />LOADING YOUR LAND</div>}
        {ready && loadError && <div className="mt-5 rounded-xl border border-red-400/25 bg-red-400/[.05] p-3 text-sm text-red-200">{loadError} <button onClick={() => void requestWorld()} className="ml-2 underline">Retry</button></div>}

        {world && <section className="mt-6 grid gap-4 xl:grid-cols-[1fr_320px]">
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
                const owned = world.inventory.find((entry) => entry.item_id === placement.itemId && world.placements.some((placed) => placed.id === placement.uid && placed.inventory_id === entry.id));
                return <ArtSprite key={placement.uid} item={item} placement={placement} seed={owned?.state === 'seed'} selected={placement.uid === selectedUid} />;
              })}
              {placements.map((placement) => itemsById.get(placement.itemId)?.kind === 'path_pavement' ? <PathFilament key={`flow-${placement.uid}`} placement={placement} placements={placements} itemsById={itemsById} selected={placement.uid === selectedUid} /> : null)}
              <AnimatedAuraCore item={itemsById.get('aura_core')!} placement={{ uid: 'aura-core', itemId: 'aura_core', col: 3, row: 3 }} seed={false} pulse={corePulse} />
              {hovered && previewCells.map((cell) => { const [col, row] = cell.split(':').map(Number); return <Diamond key={`preview-${cell}`} col={col} row={row} tone={previewValid ? 'valid' : 'invalid'} />; })}
              <div className="pointer-events-none absolute left-[355px] top-[544px] z-[900] rounded-full border border-emerald-300/30 bg-black/70 px-3 py-1 font-mono text-[9px] uppercase tracking-[.18em] text-emerald-200">Aura Core · balance</div>
            </div>
          </div>

          <aside className="rounded-3xl border border-white/10 bg-white/[.035] p-4">
            <div className="font-mono text-[10px] uppercase tracking-[.25em] text-white/45">District blueprints</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {districts.map((value) => <button key={value} onClick={() => { setDistrict(value); const first = world.inventory.find((entry) => entry.item?.world === value); setSelectedInventoryId(first?.id ?? null); }} className={`rounded-xl border px-2 py-2 text-left text-[10px] ${district === value ? 'border-emerald-300 bg-emerald-300/10 text-emerald-200' : 'border-white/10 text-white/50'}`}>{districtNames[value]}</button>)}
            </div>
            <div className="mt-4 grid grid-cols-5 gap-1.5">
              {inventory.map((entry) => { const item = itemsById.get(entry.item_id); if (!item) return null; const art = artFor(item, entry.state === 'seed'); return <button key={entry.id} onClick={() => { setSelectedInventoryId(entry.id); cue('placement_tick'); }} title={`${pretty(item.id)} · ${entry.state}${entry.placed ? ' · placed' : ''}`} className={`relative aspect-square overflow-hidden rounded-xl border bg-black/30 ${selectedInventory?.id === entry.id ? 'border-amber-300' : 'border-white/10'} ${entry.state === 'seed' || entry.placed ? 'opacity-50' : ''}`}><img src={art.thumb?.url ?? art.albedo.url} alt={pretty(item.id)} className="h-full w-full object-contain" /><span className="absolute bottom-0 inset-x-0 bg-black/75 py-0.5 font-mono text-[7px] uppercase">{entry.placed ? 'placed' : entry.state}</span></button>; })}
            </div>
            {!inventory.length && <div className="mt-4 rounded-xl border border-white/10 p-4 text-xs text-white/45">No pieces from this district yet. Continue the Discovery Route on the desk.</div>}
            {selected && selectedInventory && <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3"><div className="text-sm font-semibold">{pretty(selected.id.replace(`${selected.district}_`, ''))}</div><div className="mt-1 font-mono text-[9px] uppercase tracking-[.16em] text-white/40">{selected.kind} · {selected.footprint.cols}×{selected.footprint.rows} · {selectedInventory.placed ? 'placed' : selectedInventory.state}</div></div>}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setOrientation((value) => value === 'ne_sw' ? 'nw_se' : 'ne_sw')} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70"><RotateCw size={13} />{orientation}</button>
              {selectedInventory?.placed ? <button onClick={() => { const placed = world.placements.find((entry) => entry.inventory_id === selectedInventory.id); if (placed) void remove(placed.id); }} disabled={busy} className="flex items-center justify-center gap-2 rounded-xl border border-red-400/25 px-3 py-2 text-xs text-red-200 disabled:opacity-40"><Trash2 size={13} />Return piece</button> : <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/45"><Sparkles size={13} />{selectedInventory?.state ?? 'locked'}</div>}
              <button onClick={toggleSound} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70">{soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}Sound {soundEnabled ? 'on' : 'off'}</button>
              <button onClick={() => { setCorePulse((value) => value + 1); cue((['orbit_whoosh_a', 'orbit_whoosh_b', 'orbit_whoosh_c'] as SoundCue[])[corePulse % 3]); }} className="flex items-center justify-center gap-2 rounded-xl border border-emerald-300/30 px-3 py-2 text-xs text-emerald-200"><Waves size={13} />Pulse core</button>
            </div>
            <div className="mt-4 rounded-xl border border-emerald-300/15 bg-black/30 p-3 text-xs leading-relaxed text-white/55">{notice}</div>
            <div className="mt-4 space-y-1 font-mono text-[9px] uppercase tracking-[.13em] text-white/35"><div>Inventory: earned from Discovery Route</div><div>Authority: Bobby shared database</div><div>Identity: same web + iOS progress</div><div>Placement: server validated</div><div>View: pinch / drag / wheel</div><div>Load: {loadMetric}</div></div>
          </aside>
        </section>}
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
