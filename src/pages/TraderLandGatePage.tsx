import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Compass, Copy, ExternalLink, Globe, Hand, HelpCircle, Layers3, LoaderCircle, Maximize, Minus, Move, Plus, RotateCw, Share2, Sparkles, Undo2, Volume2, VolumeX, X } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useAppKit } from '@reown/appkit/react';
import { useBobbySession } from '@/hooks/useBobbySession';
import { Helmet } from 'react-helmet-async';
import { t } from '@/lib/companions/i18n';
import { draggedGridPosition } from '@/lib/trader-land-gestures';
import { CATALOG_ALIASES, STUDIO_PATH, WORLDS_PATH, shareUrl, withCatalogAliases } from '@/lib/trader-land/public';
import './trader-land.css';

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
  capabilities?: { move?: boolean };
  share?: { public: boolean; code: string | null; title: string | null; publishedAt: string | null };
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

function footprint(item: ManifestItem, orientation?: PathOrientation) {
  return orientation === 'nw_se' ? { cols: item.footprint.rows, rows: item.footprint.cols } : item.footprint;
}

function cellsFor(item: ManifestItem, col: number, row: number, orientation?: PathOrientation) {
  const area = footprint(item, orientation);
  const cells: string[] = [];
  for (let x = 0; x < area.cols; x += 1) {
    for (let y = 0; y < area.rows; y += 1) cells.push(`${col + x}:${row + y}`);
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
  const area = footprint(item, placement.orientation);
  const center = iso(placement.col + (area.cols - 1) / 2, placement.row + (area.rows - 1) / 2);
  const visibleWidth = Math.max(.2, art.contentBounds[2] - art.contentBounds[0]);
  const footprintWidth = TILE_W * (item.footprint.cols + item.footprint.rows) / 2;
  const size = Math.min(360, footprintWidth * .9 / visibleWidth);
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: center.x - size * (placement.orientation === 'nw_se' ? 1 - art.anchor[0] : art.anchor[0]), top: center.y - size * art.anchor[1], width: size, height: size, transform: placement.orientation === 'nw_se' ? 'scaleX(-1)' : undefined,
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
  const voices = useRef(new Set<HTMLAudioElement>());
  const cue = useCallback((name: SoundCue) => {
    if (!enabled || document.hidden) return;
    const audio = new Audio(`/land/v1/audio/${name}.m4a`);
    audio.volume = .35;
    voices.current.add(audio);
    audio.onended = () => voices.current.delete(audio);
    void audio.play().catch(() => voices.current.delete(audio));
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    const audio = new Audio('/land/v1/audio/aura_core_loop.m4a');
    audio.loop = true; audio.volume = .12; loop.current = audio;
    void audio.play().catch(() => undefined);
    const visibility = () => {
      if (document.hidden) { audio.pause(); voices.current.forEach((voice) => voice.pause()); }
      else void audio.play().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      audio.pause(); loop.current = null;
      voices.current.forEach((voice) => voice.pause()); voices.current.clear();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [enabled]);
  return { enabled, toggle: () => setEnabled((value) => !value), cue };
}

type Connector = 'NE' | 'SE' | 'SW' | 'NW';
const connectorPoint: Record<Connector, [number, number]> = {
  NE: [TILE_W * .75, TILE_H * .25], SE: [TILE_W * .75, TILE_H * .75], SW: [TILE_W * .25, TILE_H * .75], NW: [TILE_W * .25, TILE_H * .25],
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
    <svg className="pointer-events-none absolute overflow-visible" style={{ left: p.x - TILE_W / 2, top: p.y - TILE_H / 2, zIndex: 101 + Math.round(p.y) }} width={TILE_W} height={TILE_H} aria-label="Procedural path connectors">
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


type Draft = { inventoryId: string; placementId?: string; col: number; row: number; orientation: PathOrientation };
type Camera = { x: number; y: number; scale: number };
type Fixture = { placements: Placement[] };
const DEMO_KEY = 'bobby.trader-land.studio-demo.v1';
const districtColors: Record<District, string> = { crypto_bay: '#56d9e8', evidence_mines: '#a7f38a', thesis_citadel: '#8ba8ff', risk_reef: '#c3a1ff', axiom_archive: '#f5d68b' };
const districtTraits: Record<District, [string, string]> = { crypto_bay: ['Patience', 'Paciencia'], evidence_mines: ['Clarity', 'Claridad'], thesis_citadel: ['Risk', 'Riesgo'], risk_reef: ['Contradiction', 'Contradicción'], axiom_archive: ['Closure', 'Cierre'] };
function itemName(item: ManifestItem) { return pretty(item.id.replace(item.district + '_', '')); }
function demoWorld(manifest: Manifest, fixture: Fixture): World {
  // Alias ids exist only so account pieces resolve; the practice collection shows each artwork once.
  const inventory: WorldInventory[] = manifest.items.filter((item) => item.kind !== 'core' && !(item.id in CATALOG_ALIASES)).map((item) => ({
    id: 'demo-' + item.id, item_id: item.id, state: 'bloomed', source: 'demo', placed: false,
    item: { id: item.id, world: item.district, attribution: '', kind: item.kind, footprint_w: item.footprint.cols, footprint_h: item.footprint.rows, route_index: null, art_url: null },
  }));
  const placements = fixture.placements.map((p) => {
    let entry = inventory.find((i) => i.item_id === p.itemId && !i.placed);
    if (!entry) { const original = inventory.find((i) => i.item_id === p.itemId); if (!original) return null; entry = { ...original, id: 'demo-' + p.uid }; inventory.push(entry); }
    entry.placed = true;
    return { id: p.uid, inventory_id: entry.id, x: p.col, y: p.row, rotation: p.orientation === 'nw_se' ? 90 : 0 };
  }).filter(Boolean) as ApiPlacement[];
  return { xp: 0, aura: 0, land: { size: GRID }, route: { index: 0, total: 8, complete: false, next: null }, inventory, placements };
}
function withPlacements(world: World, placements: ApiPlacement[]): World {
  return { ...world, placements, inventory: world.inventory.map((entry) => ({ ...entry, placed: placements.some((p) => p.inventory_id === entry.id) })) };
}
// A published island as the studio understands it: every placed piece is a
// bloomed, placed inventory entry; nothing can be edited.
type PublicWorldPayload = { code: string; title: string | null; size: number; publishedAt: string | null; placements: Array<{ item_id: string; x: number; y: number; rotation: number }>; stats: { pieces: number; districts: string[] } };
function visitorWorld(payload: PublicWorldPayload): World {
  const inventory: WorldInventory[] = payload.placements.map((p, index) => ({ id: `visit-${index}`, item_id: p.item_id, state: 'bloomed', source: 'visit', placed: true, item: null }));
  const placements: ApiPlacement[] = payload.placements.map((p, index) => ({ id: `visit-${index}`, inventory_id: `visit-${index}`, x: p.x, y: p.y, rotation: p.rotation }));
  return { xp: 0, aura: 0, land: { size: payload.size }, capabilities: { move: false }, route: { index: 0, total: 0, complete: false, next: null }, inventory, placements };
}

export default function TraderLandGatePage() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [demo, setDemo] = useState<World | null>(null);
  const [remote, setRemote] = useState<World | null>(null);
  const [error, setError] = useState('');
  const [artError, setArtError] = useState('');
  const [busy, setBusy] = useState(false);
  const [district, setDistrict] = useState<District>('crypto_bay');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [undoWorld, setUndoWorld] = useState<World | null>(null);
  const [undoAction, setUndoAction] = useState<Record<string, unknown> | null>(null);
  const [notice, setNotice] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [help, setHelp] = useState(false);
  // Visitor mode: /trader-land/w/:code shows someone else's published island, read-only.
  const { code: visitorCode } = useParams<{ code?: string }>();
  const visitor = Boolean(visitorCode);
  const [visited, setVisited] = useState<World | null>(null);
  const [visitorMeta, setVisitorMeta] = useState<{ title: string | null; publishedAt: string | null; pieces: number; districts: string[] } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTitle, setShareTitle] = useState('');
  const [copied, setCopied] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 900, height: 600 });
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const cameraRef = useRef(camera);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ start: { x: number; y: number }; dragged: boolean; piece: boolean; handle: boolean; origin?: { col: number; row: number }; targetId?: string } | null>(null);
  const lock = useRef(false);
  const requestEpoch = useRef(0);
  const { wallet, ready, ensureSession, headers } = useBobbySession({ auto: false });
  const { open } = useAppKit();
  const { enabled: soundEnabled, toggle: toggleSound, cue } = useLandSound();
  const isDemo = !ready && !visitor;
  const editingBlocked = visitor || busy || (!isDemo && Boolean(error));
  const world = visitor ? visited : isDemo ? demo : remote;
  // Older deployments cannot move pieces atomically. Enable only when advertised by the server.
  const canMove = !visitor && (isDemo || world?.capabilities?.move === true);
  const items = useMemo(() => new Map(manifest?.items.map((item) => [item.id, item]) ?? []), [manifest]);
  const baseScale = Math.min(size.width / 830, size.height / 640, 1.5);
  const effectiveScale = baseScale * camera.scale;
  const placements = useMemo<Placement[]>(() => world?.placements.flatMap((p) => {
    const entry = world.inventory.find((i) => i.id === p.inventory_id);
    return entry && items.has(entry.item_id) ? [{ uid: p.id, itemId: entry.item_id, col: p.x, row: p.y, orientation: p.rotation % 180 === 90 ? 'nw_se' as const : 'ne_sw' as const }] : [];
  }) ?? [], [world, items]);
  const selected = world?.inventory.find((entry) => entry.id === selectedId);
  const selectedItem = selected ? items.get(selected.item_id) : undefined;
  const draftItem = draft ? items.get(world?.inventory.find((entry) => entry.id === draft.inventoryId)?.item_id ?? '') : undefined;
  const occupied = useMemo(() => {
    const cells = new Set(['3:3', '3:4', '4:3', '4:4']);
    placements.filter((p) => p.uid !== draft?.placementId).forEach((p) => cellsFor(items.get(p.itemId)!, p.col, p.row, p.orientation).forEach((cell) => cells.add(cell)));
    return cells;
  }, [placements, items, draft?.placementId]);
  const draftCells = draft && draftItem ? cellsFor(draftItem, draft.col, draft.row, draft.orientation) : [];
  const validDraft = Boolean(draft && draftItem && draftCells.every((cell) => {
    const [col, row] = cell.split(':').map(Number);
    return col >= 0 && row >= 0 && col < GRID && row < GRID && !occupied.has(cell);
  }));
  const visibleInventory = world?.inventory.filter((entry) => items.get(entry.item_id)?.district === district) ?? [];
  const available = world?.inventory.filter((entry) => !entry.placed && entry.state === 'bloomed').length ?? 0;
  const updateCamera = useCallback((next: Camera) => {
    const bounded = { ...next, scale: Math.min(2.6, Math.max(.7, next.scale)), x: Math.min(size.width * .7, Math.max(-size.width * .7, next.x)), y: Math.min(size.height * .7, Math.max(-size.height * .7, next.y)) };
    cameraRef.current = bounded; setCamera(bounded);
  }, [size]);
  const resetView = () => updateCamera({ x: 0, y: 0, scale: 1 });

  useEffect(() => {
    const controller = new AbortController();
    Promise.all(['/land/v1/gate-A/asset-manifest.json', '/land/v1/world-snapshot-v01.json'].map(async (url) => {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(t('The island could not load. Please reload.', 'No se pudo cargar la isla. Recarga la página.'));
      return response.json();
    })).then(([loaded, fixture]: [Manifest, Fixture]) => {
      let art = loaded;
      if (!art.layer_encoding || !art.items.find((item) => item.id === 'aura_core')) throw new Error('Incomplete art catalog');
      art = { ...art, items: withCatalogAliases(art.items) };
      const initial = demoWorld(art, fixture);
      try {
        const saved = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null') as ApiPlacement[] | null;
        if (Array.isArray(saved)) {
          const used = new Set(['3:3', '3:4', '4:3', '4:4']);
          const ids = new Set<string>();
          const clean = saved.filter((p) => {
            const item = art.items.find((i) => i.id === initial.inventory.find((entry) => entry.id === p.inventory_id)?.item_id);
            if (!item || ids.has(p.inventory_id) || !Number.isInteger(p.x) || !Number.isInteger(p.y) || ![0,90,180,270].includes(p.rotation)) return false;
            const cells = cellsFor(item,p.x,p.y,p.rotation % 180 === 90 ? 'nw_se' : 'ne_sw');
            if (cells.some((key) => { const [x,y]=key.split(':').map(Number); return x<0 || y<0 || x>=GRID || y>=GRID || used.has(key); })) return false;
            cells.forEach((cell) => used.add(cell)); ids.add(p.inventory_id); return true;
          });
          setDemo(withPlacements(initial, clean));
        } else setDemo(initial);
      } catch { setDemo(initial); }
      setManifest(art);
    }).catch((err) => { if (!controller.signal.aborted) setArtError(String(err.message || err)); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!demo || visitor) return;
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(demo.placements)); } catch { setNotice(t('This browser cannot save your demo.', 'Este navegador no puede guardar tu demo.')); }
  }, [demo, visitor]);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(node); return () => observer.disconnect();
  }, [manifest]);
  useEffect(() => {
    if (visitor) return;
    requestEpoch.current += 1; const epoch = requestEpoch.current;
    setRemote(null); setDraft(null); setSelectedId(null); setUndoWorld(null); setUndoAction(null); setError('');
    if (!ready) { setBusy(false); return; }
    setBusy(true);
    fetch('/api/trader-land', { headers: headers() }).then(async (response) => {
      const value = await response.json();
      if (!response.ok || !Array.isArray(value.inventory) || !Array.isArray(value.placements)) throw new Error(value.error || 'Could not load your world');
      if (epoch === requestEpoch.current) setRemote(value);
    }).catch((err) => { if (epoch === requestEpoch.current) setError(err.message); }).finally(() => { if (epoch === requestEpoch.current) setBusy(false); });
    return () => { requestEpoch.current += 1; };
  // The identity is the invalidation boundary; headers reads the current token.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, wallet]);
  useEffect(() => {
    setVisited(null); setVisitorMeta(null);
    if (!visitorCode) return;
    const controller = new AbortController();
    setBusy(true); setError(''); setDraft(null); setSelectedId(null);
    fetch(`/api/trader-land-public?code=${encodeURIComponent(visitorCode)}`, { signal: controller.signal, headers: { Accept: 'application/json' } }).then(async (response) => {
      const value = await response.json().catch(() => ({}));
      if (!response.ok || !value.world || !Array.isArray(value.world.placements)) throw new Error(response.status === 404 ? t('This island is not published or does not exist.', 'Esta isla no está publicada o no existe.') : (value.error || t('The island could not load.', 'No se pudo cargar la isla.')));
      const payload = value.world as PublicWorldPayload;
      setVisited(visitorWorld(payload)); setVisitorMeta({ title: payload.title, publishedAt: payload.publishedAt, pieces: payload.stats?.pieces ?? payload.placements.length, districts: payload.stats?.districts ?? [] });
    }).catch((err) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err)); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [visitorCode]);
  useEffect(() => { setShareTitle(remote?.share?.title ?? ''); }, [remote?.share?.title]);
  const mutate = async (action: Record<string, unknown>): Promise<World | null> => {
    if (visitor || lock.current || error || (action.action === 'move' && !canMove)) return null;
    lock.current = true; setBusy(true); setError('');
    const epoch = requestEpoch.current;
    try {
      const response = await fetch('/api/trader-land', { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(action) });
      const value = await response.json();
      if (!response.ok || !Array.isArray(value.inventory) || !Array.isArray(value.placements)) throw new Error(value.error || 'Could not save your world');
      if (epoch !== requestEpoch.current) return null;
      setRemote(value); return value;
    } catch (err) { if (epoch === requestEpoch.current) setError(err instanceof Error ? err.message : String(err)); return null; }
    finally { lock.current = false; if (epoch === requestEpoch.current) setBusy(false); }
  };
  const startDraft = (entry: WorldInventory) => {
    if (editingBlocked || !world || entry.state !== 'bloomed') return;
    const item = items.get(entry.item_id); if (!item) return;
    const existing = world.placements.find((p) => p.inventory_id === entry.id);
    if (existing && !canMove) return;
    let position = { col: existing?.x ?? 1, row: existing?.y ?? 1 };
    if (!existing) {
      const candidates=Array.from({length:GRID*GRID},(_,index)=>({col:index%GRID,row:Math.floor(index/GRID)}))
        .sort((a,b)=>(a.col-1)**2+(a.row-5)**2-((b.col-1)**2+(b.row-5)**2));
      for (const {col,row} of candidates) {
        const area=cellsFor(item,col,row);
        if (col+item.footprint.cols<=GRID && row+item.footprint.rows<=GRID && area.every((cell)=>!occupied.has(cell))) { position={col,row}; break; }
      }
    }
    setSelectedId(entry.id);
    if (size.width < 761) setLibraryOpen(false);
    setDraft({ inventoryId: entry.id, placementId: existing?.id, ...position, orientation: existing?.rotation % 180 === 90 ? 'nw_se' : 'ne_sw' });
    setNotice(''); cue('placement_tick');
  };
  const confirm = async () => {
    if (!validDraft || !draft || !world || editingBlocked) return;
    const previous = world;
    const original = previous.placements.find((p) => p.id === draft.placementId);
    const p = { id: draft.placementId ?? 'demo-' + crypto.randomUUID(), inventory_id: draft.inventoryId, x: draft.col, y: draft.row, rotation: draft.orientation === 'nw_se' ? 90 : 0 };
    if (isDemo) {
      setUndoWorld(previous);
      setDemo(withPlacements(previous,[...previous.placements.filter((entry)=>entry.id!==p.id),p]));
    } else {
      const next = await mutate(draft.placementId ? { action:'move',placementId:draft.placementId,x:p.x,y:p.y,rotation:p.rotation } : { action:'place',inventoryId:draft.inventoryId,x:p.x,y:p.y,rotation:p.rotation });
      if (!next) return;
      const created = next.placements.find((entry)=>entry.inventory_id===p.inventory_id);
      setUndoAction(original ? { action:'move',placementId:original.id,x:original.x,y:original.y,rotation:original.rotation } : { action:'remove',placementId:created?.id });
    }
    setDraft(null); setLibraryOpen(true); cue('placement_confirm'); setNotice(t('Piece placed. Make it yours.', 'Pieza colocada. Dale tu estilo.'));
  };
  const returnPiece = async () => {
    if (!selected || !world || editingBlocked) return;
    const placement = world.placements.find((p)=>p.inventory_id===selected.id); if (!placement) return;
    if (isDemo) { setUndoWorld(world); setDemo(withPlacements(world,world.placements.filter((p)=>p.id!==placement.id))); }
    else {
      if (!await mutate({ action:'remove',placementId:placement.id })) return;
      setUndoAction({ action:'place',inventoryId:placement.inventory_id,x:placement.x,y:placement.y,rotation:placement.rotation });
    }
    setDraft(null); cue('placement_tick'); setNotice(t('Returned to your collection.', 'Devuelta a tu colección.'));
  };
  const undo = async () => {
    if (editingBlocked || draft) return;
    if (isDemo && undoWorld) { setDemo(undoWorld); setUndoWorld(null); }
    else if (!isDemo && undoAction) { if (!await mutate(undoAction)) return; setUndoAction(null); }
    setNotice(t('Last change undone.', 'Último cambio deshecho.'));
  };
  const publish = async () => {
    const next = await mutate({ action: 'publish', title: shareTitle.trim() });
    if (next?.share?.public) { cue('placement_confirm'); setNotice(t('Your island is public. Share the link.', 'Tu isla es pública. Comparte el enlace.')); }
  };
  const unpublish = async () => {
    if (await mutate({ action: 'unpublish' })) { setCopied(false); setNotice(t('Your island is private again.', 'Tu isla vuelve a ser privada.')); }
  };
  const copyLink = async () => {
    const code = world?.share?.code; if (!code) return;
    try { await navigator.clipboard.writeText(shareUrl(code)); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
    catch { setNotice(t('Copy the link manually.', 'Copia el enlace manualmente.')); }
  };
  const localPoint = (clientX: number, clientY: number) => {
    const rect = viewport.current!.getBoundingClientRect(); const current=cameraRef.current;
    return { x:(clientX-rect.left-size.width/2-current.x)/(baseScale*current.scale)+430, y:(clientY-rect.top-size.height/2-current.y)/(baseScale*current.scale)+335 };
  };
  const tileAt = (clientX: number, clientY: number) => {
    const p=localPoint(clientX,clientY), dx=(p.x-ORIGIN_X)/(TILE_W/2),dy=(p.y-ORIGIN_Y)/(TILE_H/2);
    return {col:Math.round((dx+dy)/2),row:Math.round((dy-dx)/2)};
  };
  const chooseCell = (col:number,row:number,targetId?:string) => {
    if (editingBlocked || col<0 || row<0 || col>=GRID || row>=GRID) return;
    if (draft) { setDraft({...draft,col,row}); return; }
    const placed = targetId ? placements.find((p)=>p.uid===targetId) : placements.find((p)=>cellsFor(items.get(p.itemId)!,p.col,p.row,p.orientation).includes(col+':'+row));
    const entry=world?.inventory.find((i)=>i.id===world.placements.find((p)=>p.id===placed?.uid)?.inventory_id);
    setSelectedId(entry?.id??null);
    if(entry) {setDistrict(items.get(entry.item_id)!.district as District);setLibraryOpen(true);cue('placement_tick');}
  };
  const zoomAt = (factor:number,x:number,y:number) => {
    const current=cameraRef.current, next=Math.min(2.6,Math.max(.7,current.scale*factor)), ratio=next/current.scale;
    updateCamera({scale:next,x:x-(x-current.x)*ratio,y:y-(y-current.y)*ratio});
  };
  useEffect(() => {
    const node=viewport.current; if(!node)return;
    const wheel=(event:WheelEvent)=>{event.preventDefault();const rect=node.getBoundingClientRect();zoomAt(Math.exp(-event.deltaY*.002),event.clientX-rect.left-size.width/2,event.clientY-rect.top-size.height/2);};
    node.addEventListener('wheel',wheel,{passive:false});return()=>node.removeEventListener('wheel',wheel);
  // The native listener prevents browser page zoom over the canvas.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[size,manifest,updateCamera]);
  const pointerDown = (event:React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-land-ui]') || event.button>0)return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
    const point=tileAt(event.clientX,event.clientY);
    const handle=Boolean((event.target as HTMLElement).closest('[data-draft-handle]'));
    gesture.current={start:{x:event.clientX,y:event.clientY},dragged:pointers.current.size>1,piece:Boolean(draft && (handle || draftCells.includes(point.col+':'+point.row))),handle,origin:draft?{col:draft.col,row:draft.row}:undefined,targetId:(event.target as HTMLElement).closest<HTMLElement>('[data-placement]')?.dataset.placement};
  };
  const pointerMove = (event:React.PointerEvent<HTMLDivElement>) => {
    const previous=pointers.current.get(event.pointerId),g=gesture.current;if(!previous || !g)return;
    const before=[...pointers.current.values()];pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});const after=[...pointers.current.values()];
    if(after.length===2) {
      const d0=Math.hypot(before[0].x-before[1].x,before[0].y-before[1].y),d1=Math.hypot(after[0].x-after[1].x,after[0].y-after[1].y);
      const oldMid={x:(before[0].x+before[1].x)/2,y:(before[0].y+before[1].y)/2},newMid={x:(after[0].x+after[1].x)/2,y:(after[0].y+after[1].y)/2};
      const rect=viewport.current!.getBoundingClientRect();zoomAt(d1/Math.max(1,d0),oldMid.x-rect.left-size.width/2,oldMid.y-rect.top-size.height/2);
      updateCamera({...cameraRef.current,x:cameraRef.current.x+newMid.x-oldMid.x,y:cameraRef.current.y+newMid.y-oldMid.y});g.dragged=true;g.piece=false;return;
    }
    if(Math.hypot(event.clientX-g.start.x,event.clientY-g.start.y)>7)g.dragged=true;
    if(!g.dragged)return;
    if(g.piece && draft && g.origin) {
      if(editingBlocked)return;
      setDraft({...draft,...draggedGridPosition(g.origin,event.clientX-g.start.x,event.clientY-g.start.y,effectiveScale)});
    }
    else updateCamera({...cameraRef.current,x:cameraRef.current.x+event.clientX-previous.x,y:cameraRef.current.y+event.clientY-previous.y});
  };
  const pointerUp = (event:React.PointerEvent<HTMLDivElement>) => {
    const g=gesture.current;
    if(!pointers.current.has(event.pointerId))return;
    pointers.current.delete(event.pointerId);
    if(event.type!=='pointercancel' && g && !g.dragged && !g.handle) {const point=tileAt(event.clientX,event.clientY);chooseCell(point.col,point.row,g.targetId);}
    if(!pointers.current.size)gesture.current=null;
    else if(g)g.dragged=true;
  };
  const rotate = () => { if(draft && !busy)setDraft({...draft,orientation:draft.orientation==='ne_sw'?'nw_se':'ne_sw'}); };
  const keyboard = (event:React.KeyboardEvent) => {
    if((event.target as HTMLElement).closest('[data-land-ui]'))return;
    if(event.key==='Escape'){if(!busy){setDraft(null);setLibraryOpen(true);setSelectedId(null);}return;}
    if(event.key.toLowerCase()==='r'){event.preventDefault();rotate();return;}
    if(event.key==='Enter' && draft){event.preventDefault();void confirm();return;}
    const delta:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    if(delta[event.key]){event.preventDefault();const [x,y]=delta[event.key];if(draft && !busy)setDraft({...draft,col:Math.max(0,Math.min(7,draft.col+x)),row:Math.max(0,Math.min(7,draft.row+y))});else updateCamera({...cameraRef.current,x:cameraRef.current.x-x*35,y:cameraRef.current.y-y*35});}
  };
  if(artError)return <main className="land-loading"><p role="alert">{artError}</p><button onClick={()=>window.location.reload()}>{t('Reload','Recargar')}</button><Link to="/agentic-world/bobby">{t('Back to desk','Volver al desk')}</Link></main>;
  if(!manifest)return <main className="land-loading"><LoaderCircle className="animate-spin"/><h1>Trader Land</h1><p>{t('Waking up your island…','Despertando tu isla…')}</p></main>;
  const core=items.get('aura_core')!;
  const selectedPlacement=world?.placements.find((p)=>p.inventory_id===selectedId);
  const draftSize=draftItem?footprint(draftItem,draft?.orientation):null;
  const draftCenter=draft&&draftSize?iso(draft.col+(draftSize.cols-1)/2,draft.row+(draftSize.rows-1)/2):null;
  return (
    <main className="land-studio">
      <Helmet><title>Trader Land · Bobby</title><meta name="description" content="Build your island, one thoughtful decision at a time."/></Helmet>
      <header className="land-header">
        <Link className="land-icon" to={visitor?WORLDS_PATH:'/agentic-world/bobby'} aria-label={visitor?t('Back to worlds','Volver a mundos'):t('Back to desk','Volver al desk')}><ArrowLeft size={20}/></Link>
        <div className="land-wordmark"><span className="land-eyebrow">BOBBY WORLD</span><h1>{visitor?(visitorMeta?.title||t('Community island','Isla de la comunidad')):'Trader Land'}</h1></div>
        <div className="land-header-divider"/>
        <span className="land-mode"><i/>{visitor?t('Visiting','Visitando'):isDemo?t('Playground','Zona de prueba'):t('My island','Mi isla')}</span>
        <div className="land-header-right">
          {!isDemo && !visitor && world && <span className="land-xp">{world.xp} XP <span>· {world.aura} aura</span></span>}
          <Link className="land-icon" to={WORLDS_PATH} aria-label={t('Worlds','Mundos')} title={t('Worlds','Mundos')}><Globe size={19}/></Link>
          {!visitor && <button className="land-icon" onClick={()=>{setShareOpen(!shareOpen);setHelp(false);}} aria-label={t('Share island','Compartir isla')} aria-expanded={shareOpen} title={t('Share island','Compartir isla')}><Share2 size={19}/></button>}
          <button className="land-icon" onClick={toggleSound} aria-label={t('Toggle sound','Activar o silenciar sonido')} aria-pressed={soundEnabled}>{soundEnabled?<Volume2 size={19}/>:<VolumeX size={19}/>}</button>
          <button className="land-icon" onClick={()=>{setHelp(!help);setShareOpen(false);}} aria-label={t('How to play','Cómo jugar')} aria-expanded={help}><HelpCircle size={20}/></button>
        </div>
      </header>
      <div className={'land-workspace '+(!libraryOpen?'library-closed':'')}>
        <section className="land-map" ref={viewport} aria-label={t('Interactive island','Isla interactiva')} tabIndex={0} onKeyDown={keyboard} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
          <div className="land-map-caption" data-land-ui>
            <span className="land-eyebrow">{visitor?t('COMMUNITY ISLAND','ISLA DE LA COMUNIDAD'):t('FIRST LIGHT · ISLAND 01','PRIMERA LUZ · ISLA 01')}</span>
            <h2>{visitor?(visitorMeta?.title||t('Someone else\'s world.','El mundo de alguien más.')):draft?t('Find its place.','Encuentra su lugar.'):t('A little world. All yours.','Un pequeño mundo. Muy tuyo.')}</h2>
            <p>{visitor?t('Explore it. Nothing here can be changed.','Explórala. Aquí nada se puede cambiar.'):draft?t('Drag the piece or tap a tile. Confirm when it feels right.','Arrastra la pieza o toca una casilla. Confirma cuando esté lista.'):t('Every thoughtful decision leaves something behind.','Cada decisión consciente deja una huella.')}</p>
          </div>
          <div className="land-scene" data-testid="trader-land-grid" style={{left:size.width/2+camera.x,top:size.height/2+camera.y,transform:`scale(${effectiveScale}) translate(-430px,-335px)`}}>
            <svg className="land-island-base" width="860" height="720" aria-hidden="true"><defs><linearGradient id="land-edge" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#244547"/><stop offset="1" stopColor="#081a23"/></linearGradient></defs><path d="M62 391 L430 575 L798 391 L798 412 L430 602 L62 412 Z" fill="url(#land-edge)" stroke="#41665f" strokeOpacity=".4"/><path d="M62 391 L430 575 L798 391" fill="none" stroke="#94e7ca" strokeOpacity=".4"/></svg>
            {Array.from({length:64},(_,index)=>{
              const col=index%8,row=Math.floor(index/8),p=iso(col,row),key=col+':'+row;
              const occupiedHere=occupied.has(key);
              return <button key={key} tabIndex={-1} onClick={(event)=>{if(event.detail===0)chooseCell(col,row);}} className={'land-tile '+(draft&&!occupiedHere?'land-tile-available':'')} style={{left:p.x-46,top:p.y-23,background:(col+row)%2?'#193331':'#1c3935'}} aria-label={t(`Tile ${col+1}, ${row+1}`,`Casilla ${col+1}, ${row+1}`)} data-testid={`land-tile-${col}-${row}`}><svg viewBox="0 0 92 46" aria-hidden="true"><path d="M46 1 L91 23 L46 45 L1 23 Z" fill="none" stroke="#81c3ac" strokeOpacity={draft?.3:.13}/>{draft&&!occupiedHere&&<circle cx="46" cy="23" r="2" fill="#8edbb7" opacity=".6"/>}</svg></button>;
            })}
            {placements.filter((p)=>p.uid!==draft?.placementId).map((p)=>{
              const item=items.get(p.itemId)!;const entry=world!.inventory.find((i)=>i.id===world!.placements.find((a)=>a.id===p.uid)?.inventory_id);
              const area=footprint(item,p.orientation), center=iso(p.col+(area.cols-1)/2,p.row+(area.rows-1)/2);
              return <div key={p.uid}><ArtSprite item={item} placement={p} seed={entry?.state==='seed'} selected={entry?.id===selectedId}/>{!draft&&<button className="land-object-hit" aria-label={itemName(item)} data-placement={p.uid} style={{left:center.x-30,top:center.y-70,width:60,height:85,zIndex:Math.round(center.y)+102}} onClick={(event)=>{if(event.detail===0)chooseCell(p.col,p.row,p.uid);}}/>}</div>;
            })}
            {placements.filter((p)=>p.uid!==draft?.placementId&&items.get(p.itemId)?.kind==='path_pavement').map((p)=><PathFilament key={'path-'+p.uid} placement={p} placements={placements} itemsById={items} selected={false}/>)}
            <AnimatedAuraCore item={core} placement={{uid:'aura-core',itemId:'aura_core',col:3,row:3}} seed={false} pulse={0}/>
            {draft && draftItem && <>
              {draftCells.map((cell)=>{const [col,row]=cell.split(':').map(Number),p=iso(col,row);return <svg key={cell} className="land-footprint" style={{left:p.x-46,top:p.y-23,zIndex:850}} width="92" height="46" viewBox="0 0 92 46"><path d="M46 2 L90 23 L46 44 L2 23 Z" fill={validDraft?'#64ffb6':'#ff627a'} fillOpacity=".22" stroke={validDraft?'#9fffcc':'#ff8f9e'} strokeWidth="2"/>{!validDraft&&<path d="M39 19 L53 27 M53 19 L39 27" stroke="#ffbdc7" strokeWidth="2"/>}</svg>;})}
              <div className="land-ghost" style={{opacity:.8}}><ArtSprite item={draftItem} placement={{uid:'draft',itemId:draftItem.id,col:draft.col,row:draft.row,orientation:draft.orientation}} seed={false} selected/></div>
            </>}
          </div>
          {draftCenter && <button data-draft-handle data-testid="land-draft-handle" className="land-draft-handle" disabled={editingBlocked} aria-label={t('Drag preview; arrow keys also move it','Arrastra la vista previa; las flechas también la mueven')} title={t('Drag to move','Arrastra para mover')} style={{left:size.width/2+camera.x+(draftCenter.x-430)*effectiveScale,top:size.height/2+camera.y+(draftCenter.y-335)*effectiveScale+28}} onClick={()=>viewport.current?.focus()}><Move size={20}/></button>}
          <div className="land-camera" data-land-ui>
            <button className="land-icon" onClick={()=>zoomAt(1/1.2,0,0)} aria-label={t('Zoom out','Alejar')}><Minus size={18}/></button>
            <button className="land-zoom-value" onClick={resetView} aria-label={t('Center island','Centrar isla')}>{Math.round(camera.scale*100)}%</button>
            <button className="land-icon" onClick={()=>zoomAt(1.2,0,0)} aria-label={t('Zoom in','Acercar')}><Plus size={18}/></button>
            <span/><button className="land-icon" onClick={resetView} aria-label={t('Fit island','Ajustar isla')}><Maximize size={18}/></button>
          </div>
          <div className="land-map-bottom" data-land-ui>
            {draft ? <div className="land-placement-bar">
              <div className={'land-placement-status '+(!validDraft?'invalid':'')}>{validDraft?<Check size={17}/>:<X size={17}/>}<span>{validDraft?t('Ready to place','Lista para colocar'):t('Needs more room','Necesita espacio')}<small>{draft.col+1} / {draft.row+1}</small></span></div>
              <button className="land-icon" disabled={busy} onClick={()=>{setDraft(null);setLibraryOpen(true);}} aria-label={t('Cancel placement','Cancelar colocación')}><X size={20}/></button>
              <button className="land-icon" disabled={busy} onClick={rotate} aria-label={t('Rotate piece','Girar pieza')}><RotateCw size={20}/></button>
              <button className="land-primary" disabled={!validDraft||editingBlocked} onClick={()=>void confirm()}>{busy?<LoaderCircle size={18} className="animate-spin"/>:<Check size={18}/>}<span>{t('Place','Colocar')}</span></button>
            </div> : <div className="land-explore-bar"><span><Hand size={15}/>{t('Drag to explore · scroll to zoom','Arrastra para explorar · pellizca para acercar')}</span>{!visitor && <button className="land-subtle" disabled={editingBlocked||!(isDemo?undoWorld:undoAction)} onClick={()=>void undo()}><Undo2 size={17}/>{t('Undo','Deshacer')}</button>}</div>}
            {notice && <div role="status" className="land-notice">{notice}</div>}
            {error && <div role="alert" className="land-error">{error}<button onClick={()=>window.location.reload()} aria-label={t('Reload saved island','Recargar isla guardada')}><RotateCw size={16}/></button></div>}
          </div>
          {!world && <div className="land-load-overlay">{busy?<><LoaderCircle className="animate-spin"/><p>{visitor?t('Loading the island…','Cargando la isla…'):t('Loading your island…','Cargando tu isla…')}</p></>:<><p>{error||t('Your island is unavailable.','Tu isla no está disponible.')}</p><button className="land-primary" onClick={()=>window.location.reload()}>{t('Retry','Reintentar')}</button></>}</div>}
          {help && <div className="land-help" data-land-ui role="region" aria-label={t('How to play','Cómo jugar')}><button className="land-icon" onClick={()=>setHelp(false)} aria-label={t('Close help','Cerrar ayuda')}><X size={18}/></button><h3>{t('Make room for your ideas.','Dale espacio a tus ideas.')}</h3><p>{t('Choose a piece from your collection. Tap a tile, rotate, then confirm. Tap a built piece to move it or return it to your collection.','Elige una pieza de tu colección. Toca una casilla, gira y confirma. Toca una pieza construida para moverla o devolverla a tu colección.')}</p><p>{t('Drag the ground to explore. Pinch or scroll to zoom. Keyboard: arrows to move, R to rotate, Enter to place, Esc to cancel.','Arrastra el suelo para explorar. Pellizca o usa la rueda para acercar. Teclado: flechas para mover, R para girar, Enter para colocar y Esc para cancelar.')}</p></div>}
          {shareOpen && !visitor && <div className="land-help land-share" data-land-ui role="region" aria-label={t('Share island','Compartir isla')}>
            <button className="land-icon" onClick={()=>setShareOpen(false)} aria-label={t('Close','Cerrar')}><X size={18}/></button>
            {isDemo ? <>
              <h3>{t('Share your earned island.','Comparte tu isla ganada.')}</h3>
              <p>{t('The practice island lives only in this browser. Sign in to publish the island you build with real decisions and get a link anyone can visit.','La isla de práctica vive solo en este navegador. Inicia sesión para publicar la isla que construyes con decisiones reales y obtener un enlace que cualquiera puede visitar.')}</p>
              <div className="land-selected-actions"><button className="land-primary" disabled={busy} onClick={()=>{void (wallet?ensureSession():open()).catch((err:unknown)=>setError(err instanceof Error?err.message:String(err)));}}>{t('Open my earned island','Abrir mi isla ganada')}</button><Link className="land-subtle" to={WORLDS_PATH}>{t('See worlds','Ver mundos')}</Link></div>
            </> : <>
              <h3>{world?.share?.public?t('Your island is public.','Tu isla es pública.'):t('Share your island.','Comparte tu isla.')}</h3>
              <p>{world?.share?.public?t('Anyone with the link can visit it and it appears in Worlds. Hide it whenever you want.','Cualquiera con el enlace puede visitarla y aparece en Mundos. Ocúltala cuando quieras.'):t('Publish it so others can visit it and it appears in Worlds. You can hide it at any time.','Publícala para que otros la visiten y aparezca en Mundos. Puedes ocultarla cuando quieras.')}</p>
              <label className="land-share-field"><span>{t('Island name (optional)','Nombre de la isla (opcional)')}</span><input value={shareTitle} maxLength={40} onChange={(event)=>setShareTitle(event.target.value)} placeholder={t('e.g. Patience Bay','p. ej. Bahía Paciente')} /></label>
              {world?.share?.public && world.share.code && <div className="land-share-link"><code>{shareUrl(world.share.code)}</code><button className="land-subtle" onClick={()=>void copyLink()}>{copied?<><Check size={15}/>{t('Copied','Copiado')}</>:<><Copy size={15}/>{t('Copy link','Copiar enlace')}</>}</button><a className="land-subtle" href={shareUrl(world.share.code)} target="_blank" rel="noreferrer"><ExternalLink size={15}/>{t('View as visitor','Ver como visitante')}</a></div>}
              <div className="land-selected-actions"><button className="land-primary" disabled={editingBlocked||Boolean(draft)} onClick={()=>void publish()}>{busy?<LoaderCircle size={18} className="animate-spin"/>:<Share2 size={17}/>}<span>{world?.share?.public?t('Save name','Guardar nombre'):t('Publish','Publicar')}</span></button>{world?.share?.public && <button className="land-subtle" disabled={editingBlocked} onClick={()=>void unpublish()}>{t('Hide','Ocultar')}</button>}</div>
            </>}
          </div>}
        </section>
        {visitor ? <aside className="land-library" aria-label={t('About this island','Sobre esta isla')}>
          <div className="land-library-title"><span><Globe size={20}/>{t('Community island','Isla de la comunidad')}</span></div>
          <div className="land-library-content">
            <div className="land-district-heading"><h3>{visitorMeta?.title||t('Untitled island','Isla sin nombre')}</h3><span>{visitorMeta?`${visitorMeta.pieces} ${t('pieces','piezas')} · ${visitorMeta.districts.length} ${t(visitorMeta.districts.length===1?'world':'worlds',visitorMeta.districts.length===1?'mundo':'mundos')}`:''}</span></div>
            {visitorMeta && visitorMeta.districts.length>0 && <div className="land-visitor-districts">{visitorMeta.districts.map((value)=><span key={value} style={{'--district-color':districtColors[value as District]??'#7da6ff'} as React.CSSProperties}><i/>{districtNames[value as District]??pretty(value)}</span>)}</div>}
            <div className="land-collection-footer"><span><Sparkles size={16}/>{t('Built with discipline','Construida con disciplina')}</span><p>{t('Every piece here came from a real decision: a completed read, a respected no-trade or a closed thesis. Nothing is bought.','Cada pieza nació de una decisión real: una lectura completa, un no-trade respetado o una tesis cerrada. Nada se compra.')}</p><Link className="land-primary land-primary-link" to={STUDIO_PATH}>{t('Build mine','Construir la mía')}</Link><Link className="land-text-link" to={WORLDS_PATH}>{t('See more worlds','Ver más mundos')}</Link></div>
          </div>
        </aside> : <aside className={'land-library '+(!libraryOpen?'collapsed':'')} aria-label={t('Piece collection','Colección de piezas')}>
          <button className="land-library-title" onClick={()=>setLibraryOpen(!libraryOpen)} aria-expanded={libraryOpen}><span><Layers3 size={20}/>{t('Your collection','Tu colección')}<small>{available}</small></span><ChevronDown size={18}/></button>
          {libraryOpen && <div className="land-library-content">
            <div className="land-districts" role="tablist" aria-label={t('Districts','Distritos')}>{districts.map((value,index)=><button key={value} role="tab" aria-selected={district===value} aria-label={districtNames[value]} title={districtNames[value]} style={{'--district-color':districtColors[value]} as React.CSSProperties} className={district===value?'active':''} onClick={()=>{setDistrict(value);if(!draft)setSelectedId(null);}}><span>0{index+1}</span><i/></button>)}</div>
            <div className="land-district-heading"><h3>{districtNames[district]}</h3><span>{t(...districtTraits[district])}</span></div>
            <div className="land-inventory" role="tabpanel" aria-label={districtNames[district]}>{visibleInventory.map((entry)=>{
              const item=items.get(entry.item_id)!;const art=artFor(item,entry.state==='seed');
              return <button key={entry.id} disabled={busy||Boolean(draft)} className={'land-piece '+(entry.id===selectedId?'selected':'')+(entry.placed?' placed':'')} onClick={()=>{setSelectedId(entry.id);cue('placement_tick');}} aria-label={itemName(item)+(entry.placed?t(', on island',', en la isla'):entry.state==='seed'?t(', seed',', semilla'):t(', available',', disponible'))} aria-pressed={entry.id===selectedId}>
                <img src={art.thumb?.url??art.albedo.url} alt="" draggable={false}/><span>{itemName(item)}</span><small>{entry.placed?<><Check size={11}/>{t('On island','En la isla')}</>:entry.state==='seed'?t('Growing','Creciendo'):`${item.footprint.cols} × ${item.footprint.rows}`}</small>
              </button>;
            })}{!visibleInventory.length&&<p className="land-empty">{t('Your next discoveries will find a home here. Return to the desk to continue your route.','Tus próximos descubrimientos encontrarán un hogar aquí. Vuelve al desk para continuar tu ruta.')}</p>}</div>
            <div className="land-collection-footer">{isDemo?<><span><Compass size={16}/>{t('Your practice island','Tu isla de práctica')}</span><p>{t('Try every piece. This layout stays in this browser, separate from your earned collection.','Prueba todas las piezas. Este diseño se guarda en este navegador, separado de tu colección ganada.')}</p><button className="land-text-link" disabled={busy} onClick={()=>{void (wallet?ensureSession():open()).catch((err:unknown)=>setError(err instanceof Error?err.message:String(err)));}}>{t('Open my earned island','Abrir mi isla ganada')} <ArrowLeft size={14} style={{transform:'rotate(180deg)'}}/></button></>:<><span><Sparkles size={16}/>{t('Built with discipline','Construida con disciplina')}</span><p>{t('Keep learning and reviewing your decisions to grow your collection.','Sigue aprendiendo y revisando tus decisiones para hacer crecer tu colección.')}</p><Link className="land-text-link" to="/agentic-world/bobby">{t('Continue my discovery route','Continuar mi ruta de descubrimiento')}</Link></>}</div>
          </div>}
          {libraryOpen && selectedItem && selected && <div className="land-selected-detail"><div><span className="land-eyebrow">{selectedPlacement?t('ON YOUR ISLAND','EN TU ISLA'):t('BLUEPRINT','PLANO')}</span><h3>{itemName(selectedItem)}</h3><p>{footprint(selectedItem,draft?.orientation).cols} × {footprint(selectedItem,draft?.orientation).rows} {t('tiles','casillas')}</p>{selectedPlacement&&!canMove&&<p>{t('Moving saved pieces is coming soon.','Mover piezas sincronizadas estará disponible pronto.')}</p>}</div><div className="land-selected-actions"><button className="land-primary" disabled={editingBlocked||Boolean(draft)||selected.state!=='bloomed'||Boolean(selectedPlacement&&!canMove)} onClick={()=>startDraft(selected)}>{selectedPlacement?<Move size={17}/>:<Plus size={17}/>} {selectedPlacement?t('Move','Mover'):selected.state==='seed'?t('Growing','Creciendo'):t('Build','Construir')}</button>{selectedPlacement&&!draft&&<button className="land-subtle" disabled={editingBlocked} onClick={()=>void returnPiece()}>{t('Store','Guardar')}</button>}</div></div>}
        </aside>}
      </div>
    </main>
  );
}
