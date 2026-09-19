import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Copy, ExternalLink, Globe, Hand, HelpCircle, Layers3, LoaderCircle, Maximize, Minus, Move, Plus, RotateCw, Share2, Sparkles, Sprout, Undo2, Volume2, VolumeX, X } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useAppKit } from '@reown/appkit/react';
import { Helmet } from 'react-helmet-async';
import { isSpanish, t } from '@/lib/companions/i18n';
import { findBaseToken } from '@/lib/base-swap/tokens';
import { canvasPoint, draggedGridPosition } from '@/lib/trader-land-gestures';
import { CATALOG_ALIASES, STUDIO_PATH, WORLDS_PATH, shareUrl, withCatalogAliases } from '@/lib/trader-land/public';
import { CAMERA_ZOOM, CORE_FOOTPRINT, DORMANT_CORE_SCALE, coreCells, footprintCells, landGeometry, maxZoom, spriteFrame, type LandGeometry } from '@/lib/trader-land/geometry';
import { CORE_UID, FALLBACK_CORE, FIT_ZOOM, NO_SHORTEN, TRADER_LAND_CLIENT_HEADER, coreHitBox, coreStateLabel, draftFits, extendChoices, extendErrorMessage, extendedNotice, findSpawn, grewNotice, growthLabel, horizonLabel, horizonOptionLabel, isExtendRefusal, landChanged, landCore, occupiedCells, pieceHitBox, pieceName, studioHomeZoom, type Extended, type Grew, type Horizon, type HorizonHours, type LandCore, type LandGrowth, type PieceSummary, type TierInfo } from '@/lib/trader-land/growth';
import { useLandCredential } from '@/lib/trader-land/useLandCredential';
import LandGrowthGuide from '@/components/companion/LandGrowthGuide';
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
type CatalogItem = { id: string; world: string; attribution: string; kind: string; footprint_w: number; footprint_h: number; name?: unknown; route_index: number | null; tier?: string | null; art_url: string | null };
// A seed waits on the thesis it was read with: the server says when it can be reviewed (see api/_lib/thesis-rules.ts).
type SeedThesis = { symbol: string; isEquity: boolean; direction: 'long' | 'short' | 'none'; price: number | null; entry: number | null; stop: number | null; target: number | null };
type SeedReview = { thesis: SeedThesis | null; readAt: string | null; reviewAt: string; ready: boolean };
// The season collection: pieces earned only by reviewed theses executed on Base (api/_lib/trader-land-season.ts).
type SeasonProgress = { id: string; name: { en: string; es: string }; rule: { en: string; es: string }; total: number; earned: number; owned: string[]; next: string | null; complete: boolean };
type Execution = { receiptId: string; txHash: string | null; tokenIn: string; tokenOut: string; at: string | null; xp: number; aura: number };
type ClosedThesis = { inventoryId: string; itemId: string; outcome: 'hit' | 'invalidated' | 'expired'; symbol: string | null; direction: string | null; referencePx: number | null; closePx: number | null; movePct: number | null; xp: number; aura: number; executed?: Execution | null; season?: { piece: { id: string } | null; progress: SeasonProgress } | null };
// `horizon` (Growth v1): how long the seed's thesis plays out, which decides the tier it blooms into.
type WorldInventory = { id: string; item_id: string; state: 'seed' | 'bloomed'; source: string; placed: boolean; item: CatalogItem | null; review?: SeedReview | null; horizon?: Horizon | null };
type ApiPlacement = { id: string; inventory_id: string; x: number; y: number; rotation: number };
type World = {
  xp: number;
  aura: number;
  /** size 8/10/12/16; `core` and `growth` come from a Growth v1 server (absent = 3,3 core, awake, no growth) */
  land: { size: number; core?: LandCore | null; growth?: LandGrowth | null };
  capabilities?: { move?: boolean; close?: boolean; extend?: boolean; moveCore?: boolean; grow?: boolean };
  share?: { public: boolean; code: string | null; title: string | null; publishedAt: string | null };
  /** legacy Discovery Route, still sent for iOS build 31; the web reads `tiers` */
  route?: { index: number; total: number; complete: boolean; next: { id: string } | null };
  /** what the next seed of each horizon blooms into (common, building, landmark) */
  tiers?: TierInfo[];
  review?: { windowHours: number; ready: number };
  season?: SeasonProgress;
  /** present on the response to a `close` action */
  closed?: ClosedThesis;
  /** present on the response to a `place` from a client that declared growth support */
  grew?: Grew | null;
  /** present on the response to an `extend` action */
  extended?: Extended;
  /** present on the response to a `move_core` action */
  coreMoved?: { x: number; y: number };
  inventory: WorldInventory[];
  placements: ApiPlacement[];
};

const districts: District[] = ['crypto_bay', 'evidence_mines', 'thesis_citadel', 'risk_reef', 'axiom_archive'];
const districtNames: Record<District, string> = {
  crypto_bay: 'Crypto Bay', evidence_mines: 'Evidence Mines', thesis_citadel: 'Thesis Citadel',
  risk_reef: 'Risk Reef', axiom_archive: 'Axiom Archive',
};
/** The practice island never grows and its core never moves (contract §1.6). */
const PRACTICE_SIZE = 8;

function footprint(item: ManifestItem, orientation?: PathOrientation) {
  return orientation === 'nw_se' ? { cols: item.footprint.rows, rows: item.footprint.cols } : item.footprint;
}

function cellsFor(item: ManifestItem, col: number, row: number, orientation?: PathOrientation) {
  return footprintCells(item.footprint, col, row, orientation === 'nw_se' ? 90 : 0);
}

/** `stateName` picks a specific art state: the dormant Aura Core draws 'stage0'. */
function artFor(item: ManifestItem, seed: boolean, stateName?: string) {
  const orientation = Object.values(item.orientations)[0];
  const state = (stateName ? orientation.states[stateName] : undefined) ?? orientation.states.stage1 ?? orientation.states.bloom ?? Object.values(orientation.states)[0];
  return {
    albedo: (seed ? state.derived_seed : undefined) ?? state.variants.albedo_512 ?? state.variants.albedo_1024,
    glow: state.variants.glow_1024,
    shadow: state.variants.shadow_1024,
    thumb: state.variants.thumb_256,
    anchor: state.anchor,
    contentBounds: state.contentBounds,
  };
}
const rotationOf = (orientation?: PathOrientation) => (orientation === 'nw_se' ? 90 : 0);

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

// The art's anchor sits on the footprint's BOTTOM vertex, the same rule as
// iOS LandSpriteGeometry and the share card (geometry.ts spriteFrame).
function ArtSprite({ item, placement, seed, selected, geom, stateName, scale, testId }: { item: ManifestItem; placement: Placement; seed: boolean; selected: boolean; geom: LandGeometry; stateName?: string; scale?: number; testId?: string }) {
  const art = artFor(item, seed, stateName);
  const frame = spriteFrame(geom, item.footprint, placement.col, placement.row, rotationOf(placement.orientation), art, { scale });
  return (
    <div
      className="pointer-events-none absolute"
      data-testid={testId}
      style={{
        left: frame.x, top: frame.y, width: frame.size, height: frame.size, transform: frame.flip ? 'scaleX(-1)' : undefined,
        zIndex: 100 + Math.round(frame.depth), filter: selected ? 'drop-shadow(0 0 10px #f6c945)' : undefined,
      }}
      aria-label={item.id}
    >
      <LuminanceLayer src={art.shadow?.url} mode="shadow" id={placement.uid} />
      <img src={art.albedo.url} alt="" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
      {!seed && <LuminanceLayer src={art.glow?.url} mode="glow" id={placement.uid} />}
    </div>
  );
}

/** The Aura Core: dormant (stage 0) is its stage-0 art, static and smaller; awake (stage 1) is the animated layers. */
function AuraCore({ item, core, geom, selected }: { item: ManifestItem; core: LandCore; geom: LandGeometry; selected: boolean }) {
  const layers = item.animation_layers;
  const placement: Placement = { uid: CORE_UID, itemId: item.id, col: core.x, row: core.y };
  if (core.stage === 0 || !layers) return <ArtSprite item={item} placement={placement} seed={false} selected={selected} geom={geom} stateName={core.stage === 0 ? 'stage0' : 'stage1'} scale={core.stage === 0 ? DORMANT_CORE_SCALE : 1} testId={core.stage === 0 ? 'dormant-aura-core' : undefined} />;
  // The animation layers are cut from the stage-1 art, so they share its frame.
  const art = artFor(item, false, 'stage1');
  const frame = spriteFrame(geom, CORE_FOOTPRINT, core.x, core.y, 0, art);
  return (
    <div className="pointer-events-none absolute" data-testid="animated-aura-core" style={{ left: frame.x, top: frame.y, width: frame.size, height: frame.size, zIndex: 100 + Math.round(frame.depth), filter: selected ? 'drop-shadow(0 0 10px #f6c945)' : undefined }}>
      <LuminanceLayer src={art.shadow?.url} mode="shadow" id="aura-core-shadow" />
      <img src={layers.layers.body.url} alt="" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
      <img src={layers.layers.ring_back.url} alt="" className="aura-ring aura-ring-back absolute inset-0 h-full w-full object-contain" draggable={false} />
      <div className="aura-sphere absolute inset-0">
        <img src={layers.layers.sphere.url} alt="" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
      </div>
      <img src={layers.layers.ring_front.url} alt="" className="aura-ring aura-ring-front absolute inset-0 h-full w-full object-contain" draggable={false} />
      <LuminanceLayer src={art.glow?.url} mode="glow" id="aura-core-glow" />
      {Array.from({ length: 7 }, (_, index) => (
        <span key={index} className="aura-mote absolute rounded-full bg-emerald-200 shadow-[0_0_8px_#46ffc0]" style={{ left: `${layers.sphere_centre[0] * 100}%`, top: `${layers.sphere_centre[1] * 100}%`, width: (index % 3 === 0 ? 5 : 3) * geom.unit, height: (index % 3 === 0 ? 5 : 3) * geom.unit, animationDelay: `${index * -1.13}s`, ['--orbit' as string]: `${(layers.sphere_radius * (1.7 + index * .12) * 100).toFixed(1)}%` }} />
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
/** Filament ends on the slab's top face, as fractions of the face box (the share card uses the same). */
const connectorEnd: Record<Connector, [number, number]> = { NE: [.75, .25], SE: [.75, .75], SW: [.25, .75], NW: [.25, .25] };

function PathFilament({ placement, placements, itemsById, selected, geom }: { placement: Placement; placements: Placement[]; itemsById: Map<string, ManifestItem>; selected: boolean; geom: LandGeometry }) {
  const item = itemsById.get(placement.itemId);
  if (!item) return null;
  const frame = spriteFrame(geom, item.footprint, placement.col, placement.row, rotationOf(placement.orientation), artFor(item, false), { path: true });
  const face = frame.face;
  if (!face) return null;
  const pathCells = new Set(placements.filter((candidate) => itemsById.get(candidate.itemId)?.kind === 'path_pavement').map((candidate) => `${candidate.col}:${candidate.row}`));
  const active: Connector[] = [];
  if (pathCells.has(`${placement.col}:${placement.row - 1}`)) active.push('NE');
  if (pathCells.has(`${placement.col + 1}:${placement.row}`)) active.push('SE');
  if (pathCells.has(`${placement.col}:${placement.row + 1}`)) active.push('SW');
  if (pathCells.has(`${placement.col - 1}:${placement.row}`)) active.push('NW');
  if (!active.length) active.push(...(placement.orientation === 'nw_se' ? ['NW', 'SE'] : ['NE', 'SW']) as Connector[]);
  // Stroke widths scale with the tile (8/N) so filaments never swamp a grown island's small tiles.
  const u = geom.unit, cx = face.w / 2, cy = face.h / 2;
  return (
    <svg className="pointer-events-none absolute overflow-visible" style={{ left: face.x, top: face.y, zIndex: 101 + Math.round(frame.depth) }} width={face.w} height={face.h} aria-label="Procedural path connectors">
      {active.map((connector) => <line key={`halo-${connector}`} x1={cx} y1={cy} x2={face.w * connectorEnd[connector][0]} y2={face.h * connectorEnd[connector][1]} stroke="#2cf5a4" strokeOpacity=".25" strokeWidth={13 * u} filter={`blur(${5 * u}px)`} />)}
      {active.map((connector) => <line key={connector} x1={cx} y1={cy} x2={face.w * connectorEnd[connector][0]} y2={face.h * connectorEnd[connector][1]} stroke={selected ? '#ffe071' : '#62ffc5'} strokeWidth={4 * u} strokeLinecap="round" />)}
      <circle cx={cx} cy={cy} r={4 * u} fill="#baffdd" />
    </svg>
  );
}

function pretty(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}


/** `inventoryId === CORE_UID` is the Aura Core being moved (it has no inventory row). */
type Draft = { inventoryId: string; placementId?: string; col: number; row: number; orientation: PathOrientation };
type Camera = { x: number; y: number; scale: number };
type Fixture = { placements: Placement[] };
const DEMO_KEY = 'bobby.trader-land.studio-demo.v1';
const districtColors: Record<District, string> = { crypto_bay: '#56d9e8', evidence_mines: '#a7f38a', thesis_citadel: '#8ba8ff', risk_reef: '#c3a1ff', axiom_archive: '#f5d68b' };
function itemName(item: ManifestItem) { return pretty(item.id.replace(item.district + '_', '')); }
function when(iso: string) { return new Date(iso).toLocaleString(isSpanish() ? 'es-MX' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
/** One line on what a seed is waiting on, from the server's review record. */
function seedLine(review: SeedReview) {
  const read = review.thesis ? `${review.thesis.symbol} ${review.thesis.direction === 'none' ? t('no edge', 'sin sesgo') : review.thesis.direction}${review.thesis.entry ?? review.thesis.price ? ` @ ${review.thesis.entry ?? review.thesis.price}` : ''}` : t('Read without a saved thesis', 'Lectura sin tesis guardada');
  const timing = review.ready ? t('Ready to review.', 'Lista para revisar.') : `${t('Review from', 'Revisable desde')} ${when(review.reviewAt)}.`;
  // Only assets Bobby can swap on Base can be executed; the server decides at review time whether they were.
  const base = review.thesis && review.thesis.direction !== 'none' ? findBaseToken(review.thesis.symbol) : null;
  const onBase = base && !base.stable ? ` ${t('Executable on Base for the season bonus.', 'Ejecutable en Base para el bono de temporada.')}` : '';
  return `${read} · ${timing}${onBase}`;
}
function outcomeLabel(outcome: ClosedThesis['outcome']) {
  return outcome === 'hit' ? t('target reached', 'objetivo alcanzado') : outcome === 'invalidated' ? t('invalidation hit', 'invalidación tocada') : t('window closed without touching a level', 'venció sin tocar niveles');
}
function closeNotice(closed: ClosedThesis, item?: ManifestItem, seasonItem?: ManifestItem) {
  const piece = item ? itemName(item) : t('Your piece', 'Tu pieza');
  const move = closed.movePct !== null ? ` (${closed.movePct > 0 ? '+' : ''}${closed.movePct}%)` : '';
  const head = closed.symbol ? `${closed.symbol} ${closed.direction && closed.direction !== 'none' ? closed.direction : ''}: ${outcomeLabel(closed.outcome)}${move}. ` : '';
  const executed = closed.executed ? ` ${t('Executed on Base', 'Ejecutada en Base')} (+${closed.executed.xp} XP · +${closed.executed.aura} Aura).` : '';
  const season = closed.season?.piece ? ` ${t('Season piece', 'Pieza de temporada')}: ${seasonItem ? itemName(seasonItem) : pretty(closed.season.piece.id)}.` : '';
  return `${head}${piece} ${t('bloomed.', 'floreció.')} +${closed.xp} XP · +${closed.aura} Aura.${executed}${season}`;
}
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
  return { xp: 0, aura: 0, land: { size: PRACTICE_SIZE, core: FALLBACK_CORE }, inventory, placements };
}
function withPlacements(world: World, placements: ApiPlacement[]): World {
  return { ...world, placements, inventory: world.inventory.map((entry) => ({ ...entry, placed: placements.some((p) => p.inventory_id === entry.id) })) };
}
// A published island as the studio understands it: every placed piece is a
// bloomed, placed inventory entry; nothing can be edited. It is drawn at its
// own size with its own core (fallback 3,3 awake for an older server).
type PublicWorldPayload = { code: string; title: string | null; size: number; publishedAt: string | null; core?: LandCore | null; placements: Array<{ item_id: string; x: number; y: number; rotation: number }>; stats: { pieces: number; districts: string[] } };
function visitorWorld(payload: PublicWorldPayload): World {
  const inventory: WorldInventory[] = payload.placements.map((p, index) => ({ id: `visit-${index}`, item_id: p.item_id, state: 'bloomed', source: 'visit', placed: true, item: null }));
  const placements: ApiPlacement[] = payload.placements.map((p, index) => ({ id: `visit-${index}`, inventory_id: `visit-${index}`, x: p.x, y: p.y, rotation: p.rotation }));
  return { xp: 0, aura: 0, land: { size: payload.size, core: payload.core ?? null }, capabilities: { move: false }, inventory, placements };
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
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [tool, setTool] = useState<'explore' | 'build'>('explore');
  // A seed's horizon extension waits here for its confirm step ("You can't shorten it later").
  const [extendAsk, setExtendAsk] = useState<{ inventoryId: string; hours: HorizonHours } | null>(null);
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
  // Wallet session, else the Apple/Google session: whoever syncs progress on the desk builds here.
  const { wallet, signedIn, known, identity, ensureSession, headers } = useLandCredential();
  const { open } = useAppKit();
  const { enabled: soundEnabled, toggle: toggleSound, cue } = useLandSound();
  const isDemo = !visitor && known && !signedIn;
  // Until the Apple/Google session is looked up we do not know whose island to draw.
  const identifying = !visitor && !known;
  const editingBlocked = visitor || busy || (!isDemo && Boolean(error));
  const world = visitor ? visited : isDemo ? demo : remote;
  // Older deployments cannot move pieces atomically. Enable only when advertised by the server.
  const canMove = !visitor && (isDemo || world?.capabilities?.move === true);
  // Reviewing a thesis is a server verdict on a real seed; the demo has none to review.
  const canClose = !visitor && !isDemo && world?.capabilities?.close === true;
  // Growth v1 actions, only against a server that advertises them.
  const canExtend = !visitor && !isDemo && world?.capabilities?.extend === true;
  // The Aura Core is selectable on an account island; the practice and visited islands keep it as scenery.
  const coreSelectable = !visitor && !isDemo && Boolean(world);
  const canMoveCore = coreSelectable && world?.capabilities?.moveCore === true;
  const readySeeds = useMemo(() => world?.inventory.filter((entry) => entry.state === 'seed' && entry.review?.ready) ?? [], [world]);
  const items = useMemo(() => new Map(manifest?.items.map((item) => [item.id, item]) ?? []), [manifest]);
  // The island's geometry: a grown island packs smaller tiles into the same slab (geometry.ts).
  const geom = useMemo(() => landGeometry(isDemo ? PRACTICE_SIZE : world?.land.size ?? PRACTICE_SIZE), [isDemo, world?.land.size]);
  const core = useMemo<LandCore>(() => (isDemo ? FALLBACK_CORE : landCore(world?.land.core, geom.size)), [isDemo, world?.land.core, geom.size]);
  const coreItem = items.get('aura_core');
  const baseScale = Math.min(size.width / 830, size.height / 640, 1.5);
  const effectiveScale = baseScale * camera.scale;
  const zoomLimit = maxZoom(geom.size);
  const placements = useMemo<Placement[]>(() => world?.placements.flatMap((p) => {
    const entry = world.inventory.find((i) => i.id === p.inventory_id);
    return entry && items.has(entry.item_id) ? [{ uid: p.id, itemId: entry.item_id, col: p.x, row: p.y, orientation: p.rotation % 180 === 90 ? 'nw_se' as const : 'ne_sw' as const }] : [];
  }) ?? [], [world, items]);
  const selected = world?.inventory.find((entry) => entry.id === selectedId);
  const selectedItem = selected ? items.get(selected.item_id) : undefined;
  const coreDraft = draft?.inventoryId === CORE_UID;
  const draftItem = draft ? (coreDraft ? coreItem : items.get(world?.inventory.find((entry) => entry.id === draft.inventoryId)?.item_id ?? '')) : undefined;
  // Taken cells: every piece but the one being drafted, and the core unless the core is the draft.
  const occupied = useMemo(() => occupiedCells(
    placements.filter((p) => p.uid !== draft?.placementId).map((p) => ({ footprint: items.get(p.itemId)!.footprint, col: p.col, row: p.row, rotation: rotationOf(p.orientation) })),
    coreDraft ? null : core,
  ), [placements, items, draft?.placementId, coreDraft, core]);
  const coreCellSet = useMemo(() => new Set(coreCells(core)), [core]);
  const draftCells = draft && draftItem ? cellsFor(draftItem, draft.col, draft.row, draft.orientation) : [];
  const validDraft = Boolean(draft && draftItem && draftFits(draftCells, geom.size, occupied));
  const visibleInventory = world?.inventory.filter((entry) => items.get(entry.item_id)?.district === district) ?? [];
  const available = world?.inventory.filter((entry) => !entry.placed && entry.state === 'bloomed').length ?? 0;
  const updateCamera = useCallback((next: Camera) => {
    const scale = Math.min(zoomLimit, Math.max(CAMERA_ZOOM.min, next.scale));
    // Deeper zoom needs a longer leash to reach the island's corners.
    const reach = Math.max(.7, .45 * scale);
    const bounded = { scale, x: Math.min(size.width * reach, Math.max(-size.width * reach, next.x)), y: Math.min(size.height * reach, Math.max(-size.height * reach, next.y)) };
    cameraRef.current = bounded; setCamera(bounded);
  }, [size, zoomLimit]);
  // Home: 1.25 from 12×12 up for the builder, so 1×1 tiles stay tappable; a visitor sees the whole island.
  const resetView = () => updateCamera({ x: 0, y: 0, scale: studioHomeZoom(geom.size, visitor) });
  const fitView = () => updateCamera({ x: 0, y: 0, scale: FIT_ZOOM });
  // A new island size gets its own home view.
  const homedSize = useRef<number>(PRACTICE_SIZE);
  useEffect(() => {
    if (homedSize.current === geom.size) return;
    homedSize.current = geom.size;
    updateCamera({ x: 0, y: 0, scale: studioHomeZoom(geom.size, visitor) });
  }, [geom.size, visitor, updateCamera]);
  // A selected seed's review can open while the studio is open: draw it again then, so its extend options go.
  const [, setClock] = useState(0);
  const selectedReviewAt = world?.inventory.find((entry) => entry.id === selectedId && entry.state === 'seed')?.horizon?.reviewAt;
  useEffect(() => {
    const wait = Date.parse(selectedReviewAt ?? '') - Date.now();
    if (!(wait > 0) || wait > 2 ** 31 - 1) return;
    const timer = window.setTimeout(() => setClock((tick) => tick + 1), wait + 50);
    return () => window.clearTimeout(timer);
  }, [selectedReviewAt]);

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
          const used = new Set(coreCells(FALLBACK_CORE));
          const ids = new Set<string>();
          const clean = saved.filter((p) => {
            const item = art.items.find((i) => i.id === initial.inventory.find((entry) => entry.id === p.inventory_id)?.item_id);
            if (!item || ids.has(p.inventory_id) || !Number.isInteger(p.x) || !Number.isInteger(p.y) || ![0,90,180,270].includes(p.rotation)) return false;
            const cells = cellsFor(item,p.x,p.y,p.rotation % 180 === 90 ? 'nw_se' : 'ne_sw');
            if (cells.some((key) => { const [x,y]=key.split(':').map(Number); return x<0 || y<0 || x>=PRACTICE_SIZE || y>=PRACTICE_SIZE || used.has(key); })) return false;
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
    setRemote(null); setDraft(null); setSelectedId(null); setUndoWorld(null); setUndoAction(null); setExtendAsk(null); setError('');
    if (!signedIn) { setBusy(false); return; }
    setBusy(true);
    fetch('/api/trader-land', { headers: { ...headers(), ...TRADER_LAND_CLIENT_HEADER } }).then(async (response) => {
      const value = await response.json();
      if (!response.ok || !Array.isArray(value.inventory) || !Array.isArray(value.placements)) throw new Error(value.error || 'Could not load your world');
      if (epoch === requestEpoch.current) setRemote(value);
    }).catch((err) => { if (epoch === requestEpoch.current) setError(err.message); }).finally(() => { if (epoch === requestEpoch.current) setBusy(false); });
    return () => { requestEpoch.current += 1; };
  // The identity is the invalidation boundary; headers reads the current token.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);
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
  // `refusal` takes the refusals an action expects (an extend after its review opened): the caller
  // explains them as a notice and the studio stays usable, instead of the page-level error that
  // blocks every edit until a reload.
  const mutate = async (action: Record<string, unknown>, refusal?: { expected: (status: number) => boolean; explain: (status: number, error: unknown) => void }): Promise<World | null> => {
    if (visitor || lock.current || error || (action.action === 'move' && !canMove)) return null;
    lock.current = true; setBusy(true); setError('');
    const epoch = requestEpoch.current;
    const before = remote;
    const apply = (value: World) => {
      setRemote(value);
      // A grown island shifted every coordinate and a moved core changed what is free:
      // the open draft and the undo step no longer describe this land.
      if (landChanged(before?.land, value.land)) { setDraft(null); setUndoAction(null); }
    };
    try {
      const response = await fetch('/api/trader-land', { method: 'POST', headers: { ...headers(), ...TRADER_LAND_CLIENT_HEADER, 'Content-Type': 'application/json' }, body: JSON.stringify(action) });
      const value = await response.json().catch(() => ({}));
      if (refusal?.expected(response.status)) {
        // Read the world again so the refused piece shows its real state (review open, bloomed, gone).
        const fresh = await fetch('/api/trader-land', { headers: { ...headers(), ...TRADER_LAND_CLIENT_HEADER } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (epoch !== requestEpoch.current) return null;
        if (fresh && Array.isArray(fresh.inventory) && Array.isArray(fresh.placements)) apply(fresh);
        refusal.explain(response.status, value.error);
        return null;
      }
      if (!response.ok || !Array.isArray(value.inventory) || !Array.isArray(value.placements)) throw new Error(value.error || 'Could not save your world');
      if (epoch !== requestEpoch.current) return null;
      apply(value);
      return value;
    } catch (err) { if (epoch === requestEpoch.current) setError(err instanceof Error ? err.message : String(err)); return null; }
    finally { lock.current = false; if (epoch === requestEpoch.current) setBusy(false); }
  };
  const startDraft = (entry: WorldInventory) => {
    if (editingBlocked || !world || entry.state !== 'bloomed') return;
    const item = items.get(entry.item_id); if (!item) return;
    const existing = world.placements.find((p) => p.inventory_id === entry.id);
    if (existing && !canMove) return;
    let position = { col: existing?.x ?? 1, row: existing?.y ?? 1 };
    if (!existing) position = findSpawn(geom.size, item.footprint, occupied) ?? position;
    setSelectedId(entry.id);
    setTool('build');
    requestAnimationFrame(() => viewport.current?.focus());
    if (size.width < 761) setLibraryOpen(false);
    setDraft({ inventoryId: entry.id, placementId: existing?.id, ...position, orientation: existing?.rotation % 180 === 90 ? 'nw_se' : 'ne_sw' });
    setNotice(''); cue('placement_tick');
  };
  // The Aura Core moves like a piece (no Store, no Rotate): a 2×2 draft with uid 'aura-core'.
  const startCoreDraft = () => {
    if (editingBlocked || !canMoveCore || !world) return;
    setSelectedId(CORE_UID);
    setTool('build');
    requestAnimationFrame(() => viewport.current?.focus());
    if (size.width < 761) setLibraryOpen(false);
    setDraft({ inventoryId: CORE_UID, placementId: CORE_UID, col: core.x, row: core.y, orientation: 'ne_sw' });
    setNotice(''); cue('placement_tick');
  };
  const chooseCore = () => {
    // Practice and visited islands keep the core as scenery: a tap there just clears the selection.
    if (!coreSelectable) { setSelectedId(null); return; }
    if (tool === 'build' && canMoveCore) { startCoreDraft(); return; }
    setSelectedId(CORE_UID); setLibraryOpen(true); cue('placement_tick');
  };
  const confirm = async () => {
    if (!validDraft || !draft || !world || editingBlocked) return;
    if (draft.inventoryId === CORE_UID) {
      // The response carries the moved core; mutate() clears draft and undo because the land changed.
      if (!await mutate({ action: 'move_core', x: draft.col, y: draft.row })) return;
      setDraft(null); setLibraryOpen(true); cue('placement_confirm'); setNotice(t('Aura Core moved.', 'Aura Core movido.'));
      return;
    }
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
      // A placement that grew the island shifted every coordinate: there is nothing safe to undo.
      if (!landChanged(previous.land, next.land)) setUndoAction(original ? { action:'move',placementId:original.id,x:original.x,y:original.y,rotation:original.rotation } : { action:'remove',placementId:created?.id });
      const woke = landCore(previous.land.core, previous.land.size).stage === 0 && landCore(next.land.core, next.land.size).stage === 1;
      if (next.grew || woke) { setDraft(null); setLibraryOpen(true); cue('placement_confirm'); setNotice(next.grew ? grewNotice(next.grew) : t('The Aura Core woke up.', 'El Aura Core despertó.')); return; }
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
    else if (!isDemo && undoAction) {
      const next = await mutate(undoAction); if (!next) return;
      setUndoAction(null);
      // Undoing a return places the piece again, which can grow the island.
      if (next.grew) { setNotice(grewNotice(next.grew)); return; }
    }
    setNotice(t('Last change undone.', 'Último cambio deshecho.'));
  };
  const publish = async () => {
    const next = await mutate({ action: 'publish', title: shareTitle.trim() });
    if (next?.share?.public) { cue('placement_confirm'); setNotice(t('Your island is public. Share the link.', 'Tu isla es pública. Comparte el enlace.')); }
  };
  const unpublish = async () => {
    if (await mutate({ action: 'unpublish' })) { setCopied(false); setNotice(t('Your island is private again.', 'Tu isla vuelve a ser privada.')); }
  };
  // Review a seed: the server compares its thesis with the public price, blooms it and pays the close.
  const closeThesis = async (entry: WorldInventory) => {
    if (!canClose || draft || entry.state !== 'seed' || !entry.review?.ready) return;
    const next = await mutate({ action: 'close', inventoryId: entry.id, tzOffsetMin: new Date().getTimezoneOffset(), platform: 'web' });
    if (!next?.closed) return;
    cue('bloom_complete');
    const seasonPiece = next.closed.season?.piece ? items.get(next.closed.season.piece.id) : undefined;
    setNotice(closeNotice(next.closed, items.get(entry.item_id), seasonPiece));
  };
  // Extend a seed's horizon (upward only, before its review opens): the server re-points it to the next piece of the longer tier.
  const extendSeed = async () => {
    if (!extendAsk || !canExtend || draft) return;
    const ask = extendAsk;
    // not_upward / not_found / not_seed / review_open are answers, not failures: say why, keep building.
    const next = await mutate({ action: 'extend', inventoryId: ask.inventoryId, hours: ask.hours }, { expected: isExtendRefusal, explain: (status, refused) => setNotice(extendErrorMessage(status, refused)) });
    setExtendAsk(null);
    if (!next?.extended) return;
    cue('seed_reveal');
    setNotice(extendedNotice(next.extended.horizon.hours, tierPieceName(next.extended.item)));
  };
  /** Name of a server piece: the art catalog's when it has the piece, else the server's. */
  const tierPieceName = (piece: PieceSummary) => { const item = items.get(piece.id); return item ? itemName(item) : pieceName(piece, isSpanish()); };
  const jumpToReady = () => {
    const first = readySeeds[0]; if (!first) return;
    const district = items.get(first.item_id)?.district;
    if (district && district !== 'core') setDistrict(district);
    setSelectedId(first.id); setLibraryOpen(true); cue('placement_tick');
  };
  const copyLink = async () => {
    const code = world?.share?.code; if (!code) return;
    try { await navigator.clipboard.writeText(shareUrl(code)); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
    catch { setNotice(t('Copy the link manually.', 'Copia el enlace manualmente.')); }
  };
  // Screen → island canvas → cell, with the island's own tile size.
  const tileAt = (clientX: number, clientY: number) => {
    const p=canvasPoint(clientX,clientY,viewport.current!.getBoundingClientRect(),size,cameraRef.current,baseScale);
    return geom.cellAt(p.x,p.y);
  };
  const chooseCell = (col:number,row:number,targetId?:string) => {
    if (editingBlocked || col<0 || row<0 || col>=geom.size || row>=geom.size) return;
    if (draft) { setDraft({...draft,col,row}); return; }
    if (targetId===CORE_UID || (!targetId && coreCellSet.has(col+':'+row))) { chooseCore(); return; }
    const placed = targetId ? placements.find((p)=>p.uid===targetId) : placements.find((p)=>cellsFor(items.get(p.itemId)!,p.col,p.row,p.orientation).includes(col+':'+row));
    const entry=world?.inventory.find((i)=>i.id===world.placements.find((p)=>p.id===placed?.uid)?.inventory_id);
    setSelectedId(entry?.id??null);
    if(entry && tool === 'build' && canMove) { startDraft(entry); return; }
    if(entry) {setDistrict(items.get(entry.item_id)!.district as District);setLibraryOpen(true);cue('placement_tick');}
  };
  const zoomAt = (factor:number,x:number,y:number) => {
    const current=cameraRef.current, next=Math.min(zoomLimit,Math.max(CAMERA_ZOOM.min,current.scale*factor)), ratio=next/current.scale;
    updateCamera({scale:next,x:x-(x-current.x)*ratio,y:y-(y-current.y)*ratio});
  };
  useEffect(() => {
    const node=viewport.current; if(!node)return;
    const wheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement).closest('[data-land-ui]')) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1;
      if (event.ctrlKey || event.metaKey) {
        const rect = node.getBoundingClientRect();
        zoomAt(Math.exp(-event.deltaY * unit * .002), event.clientX - rect.left - size.width / 2, event.clientY - rect.top - size.height / 2);
      } else {
        updateCamera({ ...cameraRef.current, x: cameraRef.current.x - event.deltaX * unit, y: cameraRef.current.y - event.deltaY * unit });
      }
    };
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
      setDraft({...draft,...draggedGridPosition(g.origin,event.clientX-g.start.x,event.clientY-g.start.y,effectiveScale,geom)});
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
  // The core has one orientation.
  const rotate = () => { if(draft && !busy && draft.inventoryId!==CORE_UID)setDraft({...draft,orientation:draft.orientation==='ne_sw'?'nw_se':'ne_sw'}); };
  const keyboard = (event:React.KeyboardEvent) => {
    if((event.target as HTMLElement).closest('[data-land-ui]'))return;
    if(event.key==='Escape'){if(!busy){setDraft(null);setLibraryOpen(true);setSelectedId(null);}return;}
    if(event.key==='+' || event.key==='='){event.preventDefault();zoomAt(1.2,0,0);return;}
    if(event.key==='-'){event.preventDefault();zoomAt(1/1.2,0,0);return;}
    if(event.key==='0'){event.preventDefault();resetView();return;}
    if(event.key.toLowerCase()==='r'){event.preventDefault();rotate();return;}
    if(event.key==='Enter' && draft){event.preventDefault();void confirm();return;}
    const delta:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    if(delta[event.key]){event.preventDefault();const [x,y]=delta[event.key];if(draft && !busy)setDraft({...draft,col:Math.max(0,Math.min(geom.size-1,draft.col+x)),row:Math.max(0,Math.min(geom.size-1,draft.row+y))});else updateCamera({...cameraRef.current,x:cameraRef.current.x-x*35,y:cameraRef.current.y-y*35});}
  };
  if(artError)return <main className="land-loading"><p role="alert">{artError}</p><button onClick={()=>window.location.reload()}>{t('Reload','Recargar')}</button><Link to="/desk">{t('Back to desk','Volver al desk')}</Link></main>;
  if(!manifest)return <main className="land-loading"><LoaderCircle className="animate-spin"/><h1>Trader Land</h1><p>{t('Waking up your island…','Despertando tu isla…')}</p></main>;
  const coreArt=coreItem!;
  const selectedPlacement=world?.placements.find((p)=>p.inventory_id===selectedId);
  const coreSelected=selectedId===CORE_UID&&coreSelectable;
  const draftSize=draftItem?footprint(draftItem,draft?.orientation):null;
  const draftCenter=draft&&draftSize?geom.iso(draft.col+(draftSize.cols-1)/2,draft.row+(draftSize.rows-1)/2):null;
  // The core's tappable box is its art's visible content, so it scales with the island; it sits under every piece's (growth.ts CORE_HIT_Z).
  const coreState=artFor(coreArt,false,core.stage===0?'stage0':'stage1');
  const coreHit=coreHitBox(spriteFrame(geom,CORE_FOOTPRINT,core.x,core.y,0,coreState,{scale:core.stage===0?DORMANT_CORE_SCALE:1}),coreState.contentBounds);
  const extendOptions=selected?.state==='seed'&&canExtend?extendChoices(selected.horizon,world?.tiers):[];
  const pendingExtend=extendAsk&&extendAsk.inventoryId===selected?.id?extendOptions.find((choice)=>choice.hours===extendAsk.hours)??null:null;
  // The island's own name leads once its builder gave it one (share panel); visitors see the builder's title.
  const islandName=visitor?visitorMeta?.title??null:isDemo?null:remote?.share?.title??null;
  return (
    <main className="land-studio">
      <Helmet><title>{`${islandName??'Trader Land'} · Bobby`}</title><meta name="description" content="Build your island, one thoughtful decision at a time."/></Helmet>
      <header className="land-header">
        <Link className="land-icon" to={visitor?WORLDS_PATH:'/desk'} aria-label={visitor?t('Back to worlds','Volver a mundos'):t('Back to desk','Volver al desk')}><ArrowLeft size={20}/></Link>
        <div className="land-wordmark"><h1>{islandName||(visitor?t('Community island','Isla de la comunidad'):'Trader Land')}</h1></div>
        <span className="land-mode"><i/>{visitor?t('Visiting','Visitando'):signedIn?t('My island','Mi isla'):t('Practice','Práctica')}</span>
        <div className="land-header-right">
          <Link className="land-icon" to={`${WORLDS_PATH}#comunidad`} aria-label={t('Explore islands','Ver islas')} title={t('Explore islands','Ver islas')}><Globe size={19}/></Link>
          {!visitor && <button className="land-icon" onClick={()=>{setShareOpen(!shareOpen);setHelp(false);}} aria-label={t('Share island','Compartir isla')} aria-expanded={shareOpen} title={t('Share island','Compartir isla')}><Share2 size={19}/></button>}
          <button className="land-icon" onClick={toggleSound} aria-label={t('Toggle sound','Activar o silenciar sonido')} aria-pressed={soundEnabled}>{soundEnabled?<Volume2 size={19}/>:<VolumeX size={19}/>}</button>
          <button className="land-icon" onClick={()=>{setHelp(!help);setShareOpen(false);}} aria-label={t('How to play','Cómo jugar')} aria-expanded={help}><HelpCircle size={20}/></button>
        </div>
      </header>
      <div className={'land-workspace '+(!visitor&&!libraryOpen?'library-closed':'')}>
        <section className="land-map" ref={viewport} aria-label={t('Interactive island','Isla interactiva')} tabIndex={0} onKeyDown={keyboard} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
          <div className="land-scene" data-testid="trader-land-grid" style={{left:size.width/2+camera.x,top:size.height/2+camera.y,transform:`scale(${effectiveScale}) translate(-430px,-335px)`}}>
            <svg className="land-island-base" width="860" height="720" aria-hidden="true"><defs><linearGradient id="land-edge" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#244547"/><stop offset="1" stopColor="#081a23"/></linearGradient></defs><path d="M62 391 L430 575 L798 391 L798 412 L430 602 L62 412 Z" fill="url(#land-edge)" stroke="#41665f" strokeOpacity=".4"/><path d="M62 391 L430 575 L798 391" fill="none" stroke="#94e7ca" strokeOpacity=".4"/></svg>
            {Array.from({length:geom.size*geom.size},(_,index)=>{
              const col=index%geom.size,row=Math.floor(index/geom.size),p=geom.iso(col,row),key=col+':'+row;
              const occupiedHere=occupied.has(key);
              return <button key={key} tabIndex={-1} onClick={(event)=>{if(event.detail===0)chooseCell(col,row);}} className={'land-tile '+(draft&&!occupiedHere?'land-tile-available':'')} style={{left:p.x-geom.tileW/2,top:p.y-geom.tileH/2,width:geom.tileW,height:geom.tileH,background:(col+row)%2?'#193331':'#1c3935'}} aria-label={t(`Tile ${col+1}, ${row+1}`,`Casilla ${col+1}, ${row+1}`)} data-testid={`land-tile-${col}-${row}`}><svg viewBox="0 0 92 46" aria-hidden="true"><path d="M46 1 L91 23 L46 45 L1 23 Z" fill="none" stroke="#81c3ac" strokeOpacity={draft?.3:.13}/>{draft&&!occupiedHere&&<circle cx="46" cy="23" r="2" fill="#8edbb7" opacity=".6"/>}</svg></button>;
            })}
            {placements.filter((p)=>p.uid!==draft?.placementId).map((p)=>{
              const item=items.get(p.itemId)!;const entry=world!.inventory.find((i)=>i.id===world!.placements.find((a)=>a.id===p.uid)?.inventory_id);
              // The hit box sits on the footprint's bottom vertex like the art, and scales with the tile.
              const hit=pieceHitBox(geom,footprint(item,p.orientation),p.col,p.row);
              return <div key={p.uid}><ArtSprite item={item} placement={p} seed={entry?.state==='seed'} selected={entry?.id===selectedId} geom={geom}/>{!draft&&<button className="land-object-hit" aria-label={itemName(item)} data-placement={p.uid} data-testid={`land-piece-hit-${p.col}-${p.row}`} style={{left:hit.left,top:hit.top,width:hit.width,height:hit.height,zIndex:hit.zIndex}} onClick={(event)=>{if(event.detail===0)chooseCell(p.col,p.row,p.uid);}}/>}</div>;
            })}
            {placements.filter((p)=>p.uid!==draft?.placementId&&items.get(p.itemId)?.kind==='path_pavement').map((p)=><PathFilament key={'path-'+p.uid} placement={p} placements={placements} itemsById={items} selected={false} geom={geom}/>)}
            {!coreDraft&&<AuraCore item={coreArt} core={core} geom={geom} selected={coreSelected}/>}
            {!coreDraft&&!draft&&coreSelectable&&<button className="land-object-hit" aria-label="Aura Core" data-placement={CORE_UID} data-testid="land-core-hit" style={{left:coreHit.left,top:coreHit.top,width:coreHit.width,height:coreHit.height,zIndex:coreHit.zIndex}} onClick={(event)=>{if(event.detail===0)chooseCell(core.x,core.y,CORE_UID);}}/>}
            {draft && draftItem && <>
              {draftCells.map((cell)=>{const [col,row]=cell.split(':').map(Number),p=geom.iso(col,row);return <svg key={cell} className="land-footprint" style={{left:p.x-geom.tileW/2,top:p.y-geom.tileH/2,zIndex:850}} width={geom.tileW} height={geom.tileH} viewBox="0 0 92 46"><path d="M46 2 L90 23 L46 44 L2 23 Z" fill={validDraft?'#64ffb6':'#ff627a'} fillOpacity=".22" stroke={validDraft?'#9fffcc':'#ff8f9e'} strokeWidth="2"/>{!validDraft&&<path d="M39 19 L53 27 M53 19 L39 27" stroke="#ffbdc7" strokeWidth="2"/>}</svg>;})}
              <div className="land-ghost" style={{opacity:.8}}>{coreDraft?<ArtSprite item={draftItem} placement={{uid:'draft',itemId:draftItem.id,col:draft.col,row:draft.row}} seed={false} selected geom={geom} stateName={core.stage===0?'stage0':'stage1'} scale={core.stage===0?DORMANT_CORE_SCALE:1}/>:<ArtSprite item={draftItem} placement={{uid:'draft',itemId:draftItem.id,col:draft.col,row:draft.row,orientation:draft.orientation}} seed={false} selected geom={geom}/>}</div>
            </>}
          </div>
          {draftCenter && <button data-draft-handle data-testid="land-draft-handle" className="land-draft-handle" disabled={editingBlocked} aria-label={t('Drag preview; arrow keys also move it','Arrastra la vista previa; las flechas también la mueven')} title={t('Drag to move','Arrastra para mover')} style={{left:size.width/2+camera.x+(draftCenter.x-430)*effectiveScale,top:size.height/2+camera.y+(draftCenter.y-335)*effectiveScale+28}} onClick={()=>viewport.current?.focus()}><Move size={20}/></button>}
          <div className="land-camera" data-land-ui>
            <button className="land-icon" onClick={()=>zoomAt(1/1.2,0,0)} aria-label={t('Zoom out','Alejar')}><Minus size={18}/></button>
            <button className="land-zoom-value" onClick={resetView} aria-label={t('Center island','Centrar isla')}>{Math.round(camera.scale*100)}%</button>
            <button className="land-icon" onClick={()=>zoomAt(1.2,0,0)} aria-label={t('Zoom in','Acercar')}><Plus size={18}/></button>
            <span/><button className="land-icon" onClick={fitView} aria-label={t('Fit island','Ajustar isla')}><Maximize size={18}/></button>
          </div>
          <div className="land-map-bottom" data-land-ui>
            {!visitor && <div className="land-tools" role="group" aria-label={t('Map tools','Herramientas del mapa')}>
              <button aria-pressed={tool==='explore'} disabled={busy} onClick={()=>{setTool('explore');setDraft(null);setLibraryOpen(false);viewport.current?.focus();}}><Hand size={16}/>{t('Explore','Explorar')}</button>
              <button aria-pressed={tool==='build'} disabled={editingBlocked} onClick={()=>{setTool('build');setLibraryOpen(true);viewport.current?.focus();}}><Plus size={16}/>{t('Build','Construir')}</button>
            </div>}

            {draft ? <div className="land-placement-bar">
              <div className={'land-placement-status '+(!validDraft?'invalid':'')}>{validDraft?<Check size={17}/>:<X size={17}/>}<span>{validDraft?t('Ready to place','Lista para colocar'):t('Needs more room','Necesita espacio')}</span></div>
              <button className="land-icon" disabled={busy} onClick={()=>{setDraft(null);setLibraryOpen(true);}} aria-label={t('Cancel placement','Cancelar colocación')}><X size={20}/></button>
              {!coreDraft&&<button className="land-icon" disabled={busy} onClick={rotate} aria-label={t('Rotate piece','Girar pieza')}><RotateCw size={20}/></button>}
              <button className="land-primary" disabled={!validDraft||editingBlocked} onClick={()=>void confirm()}>{busy?<LoaderCircle size={18} className="animate-spin"/>:<Check size={18}/>}<span>{draft.placementId?t('Save move','Guardar cambio'):t('Place','Colocar')}</span></button>
            </div> : <div className="land-explore-bar">{coreSelectable && world && <span className="land-growth-status" data-testid="land-growth-status">{growthLabel(geom.size,world.land.growth)} · {coreStateLabel(core,placements.length)}</span>}{!visitor && Boolean(isDemo?undoWorld:undoAction) && <button className="land-subtle" disabled={editingBlocked} onClick={()=>void undo()}><Undo2 size={17}/>{t('Undo','Deshacer')}</button>}</div>}
            {notice && <div role="status" className="land-notice">{notice}</div>}
            {error && <div role="alert" className="land-error">{error}<button onClick={()=>window.location.reload()} aria-label={t('Reload saved island','Recargar isla guardada')}><RotateCw size={16}/></button></div>}
          </div>
          {!world && <div className="land-load-overlay">{busy||identifying?<><LoaderCircle className="animate-spin"/><p>{visitor?t('Loading the island…','Cargando la isla…'):t('Loading your island…','Cargando tu isla…')}</p></>:<><p>{error||t('Your island is unavailable.','Tu isla no está disponible.')}</p><button className="land-primary" onClick={()=>window.location.reload()}>{t('Retry','Reintentar')}</button></>}</div>}
          {help && <div className="land-help" data-land-ui role="region" aria-label={t('How to play','Cómo jugar')}><button className="land-icon" onClick={()=>setHelp(false)} aria-label={t('Close help','Cerrar ayuda')}><X size={18}/></button><h3>{t('How to play','Cómo jugar')}</h3><p>{t('Choose a piece from your collection. Tap a tile, rotate, then confirm. Tap a built piece to move it or return it to your collection.','Elige una pieza de tu colección. Toca una casilla, gira y confirma. Toca una pieza construida para moverla o devolverla a tu colección.')}{coreSelectable?' '+t('Tap the Aura Core to move it.','Toca el Aura Core para moverlo.'):''}</p><p>{t('Drag the ground to explore. Scroll to pan. Pinch or Ctrl + scroll to zoom. Keyboard: arrows to move, + / − to zoom, 0 to center, R to rotate, Enter to place, Esc to cancel.','Arrastra el suelo para explorar. Desplaza para mover la vista. Pellizca o usa Ctrl + rueda para zoom. Teclado: flechas para mover, + / − para zoom, 0 para centrar, R para girar, Enter para colocar y Esc para cancelar.')}</p>
            {world && !visitor && <LandGrowthGuide practice={isDemo} available={available}
              seeds={world.inventory.filter((entry)=>entry.state==='seed').length}
              reviewReady={canClose?readySeeds.length:0}
              size={isDemo?undefined:geom.size} growth={world.land.growth} core={coreSelectable?core:null} pieces={placements.length}
              nextByHorizon={(world.tiers??[]).flatMap((tier)=>tier.next?[{hours:tier.hours,name:tierPieceName(tier.next)}]:[])}
              waitingUntil={(() => { const date = world.inventory.filter((entry)=>entry.state==='seed' && entry.review && !entry.review.ready).map((entry)=>entry.review!.reviewAt).sort()[0]; return date ? when(date) : undefined; })()}
              disabled={editingBlocked} onReview={()=>{setHelp(false);jumpToReady();}}
              onBuild={()=>{setHelp(false);const entry=world.inventory.find((entry)=>!entry.placed&&entry.state==='bloomed'&&items.has(entry.item_id));if(entry){setDistrict(items.get(entry.item_id)!.district as District);startDraft(entry);}}}
              onSignIn={()=>{void(wallet?ensureSession():open()).catch((err:unknown)=>setError(err instanceof Error?err.message:String(err)));}} />}</div>}
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
            <div className="land-collection-footer"><Link className="land-primary land-primary-link" to={STUDIO_PATH}>{t('Build mine','Construir la mía')}</Link><Link className="land-text-link" to={WORLDS_PATH}>{t('See more worlds','Ver más mundos')}</Link></div>
          </div>
        </aside> : <aside className={'land-library '+(!libraryOpen?'collapsed':'')} aria-label={t('Piece collection','Colección de piezas')}>
          <button className="land-library-title" onClick={()=>setLibraryOpen(!libraryOpen)} aria-expanded={libraryOpen}><span><Layers3 size={20}/>{t('Collection','Colección')}</span><ChevronDown size={18}/></button>
          {libraryOpen && <div className="land-library-content">


            {canClose && readySeeds.length>0 && !draft && <button type="button" className="land-review-banner" onClick={jumpToReady}><Sprout size={15}/>{readySeeds.length===1?t('1 thesis ready to review','1 tesis lista para revisar'):`${readySeeds.length} ${t('theses ready to review','tesis listas para revisar')}`}</button>}
            <div className="land-districts" role="tablist" aria-label={t('Districts','Distritos')}>{districts.map((value,index)=><button key={value} role="tab" aria-selected={district===value} aria-label={districtNames[value]} title={districtNames[value]} style={{'--district-color':districtColors[value]} as React.CSSProperties} className={district===value?'active':''} onClick={()=>{setDistrict(value);if(!draft)setSelectedId(null);}}><span>0{index+1}</span><i/></button>)}</div>
            <div className="land-district-heading"><h3>{districtNames[district]}</h3></div>
            <div className="land-inventory" role="tabpanel" aria-label={districtNames[district]}>{visibleInventory.map((entry)=>{
              const item=items.get(entry.item_id)!;const art=artFor(item,entry.state==='seed');
              const ready=entry.state==='seed'&&Boolean(entry.review?.ready);
              return <button key={entry.id} disabled={busy||Boolean(draft)} className={'land-piece '+(entry.id===selectedId?'selected':'')+(entry.placed?' placed':'')+(ready?' ready':'')} onClick={()=>{if(entry.state==='bloomed'&&!entry.placed){startDraft(entry);}else{setSelectedId(entry.id);cue('placement_tick');}}} aria-label={itemName(item)+(entry.placed?t(', on island',', en la isla'):ready?t(', ready to review',', lista para revisar'):entry.state==='seed'?t(', seed',', semilla'):t(', available',', disponible'))} aria-pressed={entry.id===selectedId}>
                <img src={art.thumb?.url??art.albedo.url} alt="" draggable={false}/><span>{itemName(item)}</span><small>{entry.placed?<><Check size={11}/>{t('On island','En la isla')}</>:ready?<><Sprout size={11}/>{t('Ready to review','Lista para revisar')}</>:entry.state==='seed'?(entry.horizon?`${t('Growing','Creciendo')} · ${horizonLabel(entry.horizon.hours)}`:t('Growing','Creciendo')):entry.source==='season'?<><Sparkles size={11}/>{t('Season','Temporada')} · {item.footprint.cols} × {item.footprint.rows}</>:`${item.footprint.cols} × ${item.footprint.rows}`}</small>
              </button>;
            })}{!visibleInventory.length&&<p className="land-empty">{t('No pieces yet. Explore the desk to earn them.','Aún no hay piezas. Explora el desk para conseguirlas.')}</p>}</div>
            {!isDemo&&world?.season&&<details className="land-season" aria-label={isSpanish()?world.season.name.es:world.season.name.en}><summary>{t('Season progress','Progreso de temporada')}</summary><h4>{isSpanish()?world.season.name.es:world.season.name.en}<small>{world.season.earned} / {world.season.total}</small></h4><p>{isSpanish()?world.season.rule.es:world.season.rule.en}</p>{world.season.complete?<p className="land-season-next"><Check size={12}/>{t('Season complete.','Temporada completa.')}</p>:world.season.next&&items.get(world.season.next)&&<p className="land-season-next"><Sprout size={12}/>{t('Next piece','Siguiente pieza')}: {itemName(items.get(world.season.next)!)}</p>}</details>}
            <div className="land-collection-footer">{isDemo?<button className="land-text-link" disabled={busy} onClick={()=>{void (wallet?ensureSession():open()).catch((err:unknown)=>setError(err instanceof Error?err.message:String(err)));}}>{t('Sign in to save your earned island','Inicia sesión para guardar tu isla ganada')}</button>:<Link className="land-text-link" to="/desk">{t('Back to desk','Volver al desk')}</Link>}</div>
          </div>}
          {libraryOpen && coreSelected && coreItem && <div className="land-selected-detail" data-testid="land-core-detail"><div><span className="land-eyebrow">{t('ON YOUR ISLAND','EN TU ISLA')}</span><h3>Aura Core</h3><p>2 × 2 {t('tiles','casillas')} · {coreStateLabel(core,placements.length)}</p>{!canMoveCore&&<p>{t('Moving the Aura Core is coming soon.','Mover el Aura Core estará disponible pronto.')}</p>}</div><div className="land-selected-actions"><button className="land-primary" disabled={editingBlocked||Boolean(draft)||!canMoveCore} onClick={startCoreDraft}><Move size={17}/> {t('Move','Mover')}</button></div></div>}
          {libraryOpen && selectedItem && selected && <div className="land-selected-detail"><div>
            <span className="land-eyebrow">{selectedPlacement?t('ON YOUR ISLAND','EN TU ISLA'):selected.state==='seed'?t('SEED','SEMILLA'):t('BLUEPRINT','PLANO')}</span><h3>{itemName(selectedItem)}</h3><p>{footprint(selectedItem,draft?.orientation).cols} × {footprint(selectedItem,draft?.orientation).rows} {t('tiles','casillas')}</p>
            {/* The seed's horizon and the tier it blooms into; longer horizons stay open until its review does. */}
            {selected.state==='seed'&&selected.horizon&&<p className="land-horizon" data-testid="land-seed-horizon">{t('Horizon','Horizonte')}: {horizonOptionLabel(selected.horizon.hours)}</p>}
            {selected.state==='seed'&&selected.review&&<p className="land-thesis">{seedLine(selected.review)}</p>}{selected.state==='seed'&&!selected.review&&<p>{t('This seed blooms when you review its thesis.','Esta semilla florece cuando revisas su tesis.')}</p>}{selectedPlacement&&!canMove&&<p>{t('Moving saved pieces is coming soon.','Mover piezas sincronizadas estará disponible pronto.')}</p>}
            {pendingExtend ? <div className="land-extend-confirm" role="group" aria-label={t('Confirm the new horizon','Confirma el nuevo horizonte')}>
              <p><strong>{horizonOptionLabel(pendingExtend.hours)}</strong>{pendingExtend.piece?` · ${tierPieceName(pendingExtend.piece)}`:''}</p>
              <p>{NO_SHORTEN()}</p>
              <div className="land-selected-actions"><button className="land-primary" disabled={editingBlocked||Boolean(draft)} onClick={()=>void extendSeed()}>{busy?<LoaderCircle size={17} className="animate-spin"/>:<Check size={17}/>} {t('Extend','Extender')}</button><button className="land-subtle" disabled={busy} onClick={()=>setExtendAsk(null)}>{t('Cancel','Cancelar')}</button></div>
            </div> : extendOptions.length>0 && <div className="land-extend-options" role="group" aria-label={t('Give it more time','Dale más tiempo')}>
              <span className="land-eyebrow">{t('GIVE IT MORE TIME','DALE MÁS TIEMPO')}</span>
              {extendOptions.map((choice)=><button key={choice.hours} className="land-subtle" disabled={editingBlocked||Boolean(draft)} onClick={()=>setExtendAsk({inventoryId:selected.id,hours:choice.hours})}><span>{horizonOptionLabel(choice.hours)}</span>{choice.piece&&<small>{tierPieceName(choice.piece)}</small>}</button>)}
            </div>}
          </div><div className="land-selected-actions">{selected.state==='seed'?<button className="land-primary" disabled={editingBlocked||Boolean(draft)||!canClose||!selected.review?.ready} onClick={()=>void closeThesis(selected)}>{busy?<LoaderCircle size={17} className="animate-spin"/>:<Sprout size={17}/>} {selected.review?.ready?t('Review thesis','Revisar tesis'):t('Growing','Creciendo')}</button>:<button className="land-primary" disabled={editingBlocked||Boolean(draft)||Boolean(selectedPlacement&&!canMove)} onClick={()=>startDraft(selected)}>{selectedPlacement?<Move size={17}/>:<Plus size={17}/>} {selectedPlacement?t('Move','Mover'):t('Build','Construir')}</button>}{selectedPlacement&&!draft&&<button className="land-subtle" disabled={editingBlocked} onClick={()=>void returnPiece()}>{t('Store','Guardar')}</button>}</div></div>}
        </aside>}
      </div>
    </main>
  );
}
