import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCw, Sparkles, Undo2 } from 'lucide-react';

type Orientation = 'ne_sw' | 'nw_se';
type PieceId = 'rock' | 'antenna' | 'workshop' | 'citadel' | 'path';
type Placement = { uid: string; piece: PieceId; col: number; row: number; orientation?: Orientation };

const GRID = 8;
const STORAGE_KEY = 'bobby.trader-land.gate-a.v1';
const TILE_W = 92;
const TILE_H = 46;
const ORIGIN_X = 430;
const ORIGIN_Y = 76;

const pieces: Record<Exclude<PieceId, 'path'>, { label: string; url: string; glow: string; shadow: string; cols: number; rows: number }> = {
  rock: { label: 'Evidence rock', url: '/land/v1/gate-A/evidence_mines_crystal_vein_rock/ne/bloom_albedo_1024.png', glow: '/land/v1/gate-A/evidence_mines_crystal_vein_rock/ne/bloom_glow_1024.png', shadow: '/land/v1/gate-A/evidence_mines_crystal_vein_rock/ne/shadow_1024.png', cols: 1, rows: 1 },
  antenna: { label: 'Risk antenna', url: '/land/v1/gate-A/risk_reef_dual_orbit_antenna/ne/bloom_albedo_1024.png', glow: '/land/v1/gate-A/risk_reef_dual_orbit_antenna/ne/bloom_glow_1024.png', shadow: '/land/v1/gate-A/risk_reef_dual_orbit_antenna/ne/shadow_1024.png', cols: 1, rows: 1 },
  workshop: { label: 'Evidence workshop', url: '/land/v1/gate-A/evidence_mines_evidence_workshop/ne/bloom_albedo_1024.png', glow: '/land/v1/gate-A/evidence_mines_evidence_workshop/ne/bloom_glow_1024.png', shadow: '/land/v1/gate-A/evidence_mines_evidence_workshop/ne/shadow_1024.png', cols: 2, rows: 1 },
  citadel: { label: 'Thesis citadel', url: '/land/v1/gate-A/thesis_citadel_three_gate_citadel/ne/bloom_albedo_1024.png', glow: '/land/v1/gate-A/thesis_citadel_three_gate_citadel/ne/bloom_glow_1024.png', shadow: '/land/v1/gate-A/thesis_citadel_three_gate_citadel/ne/shadow_1024.png', cols: 2, rows: 2 },
};

const initial: Placement[] = [
  { uid: 'workshop', piece: 'workshop', col: 1, row: 2 },
  { uid: 'antenna', piece: 'antenna', col: 5, row: 1 },
  { uid: 'rock', piece: 'rock', col: 1, row: 5 },
  { uid: 'citadel', piece: 'citadel', col: 5, row: 5 },
  { uid: 'path-a', piece: 'path', col: 3, row: 2, orientation: 'ne_sw' },
  { uid: 'path-b', piece: 'path', col: 4, row: 3, orientation: 'nw_se' },
];

function iso(col: number, row: number) {
  return { x: ORIGIN_X + (col - row) * TILE_W / 2, y: ORIGIN_Y + (col + row) * TILE_H / 2 };
}

function footprint(piece: PieceId) {
  return piece === 'path' ? { cols: 1, rows: 1 } : pieces[piece].cols === 2
    ? { cols: pieces[piece].cols, rows: pieces[piece].rows }
    : { cols: 1, rows: 1 };
}

function occupied(p: Placement) {
  const fp = footprint(p.piece);
  const cells: string[] = [];
  for (let x = 0; x < fp.cols; x += 1) for (let y = 0; y < fp.rows; y += 1) cells.push(`${p.col + x}:${p.row + y}`);
  return cells;
}

function ProceduralPath({ placement, selected }: { placement: Placement; selected: boolean }) {
  const p = iso(placement.col, placement.row);
  const diagonal = placement.orientation === 'nw_se';
  return (
    <svg
      className="absolute overflow-visible"
      style={{ left: p.x - TILE_W / 2, top: p.y - TILE_H / 2, zIndex: 50 + placement.col + placement.row }}
      width={TILE_W}
      height={TILE_H}
      viewBox={`0 0 ${TILE_W} ${TILE_H}`}
      aria-label={`Procedural path ${placement.orientation}`}
    >
      <polygon points={`0,${TILE_H / 2} ${TILE_W / 2},0 ${TILE_W},${TILE_H / 2} ${TILE_W / 2},${TILE_H}`} fill="#111922" stroke={selected ? '#f5c542' : '#26384a'} strokeWidth="2" />
      <line x1={diagonal ? 6 : TILE_W / 2} y1={diagonal ? TILE_H / 2 : 3} x2={diagonal ? TILE_W - 6 : TILE_W / 2} y2={diagonal ? TILE_H / 2 : TILE_H - 3} stroke="#2cf5a4" strokeOpacity=".22" strokeWidth="13" filter="blur(5px)" />
      <line x1={diagonal ? 6 : TILE_W / 2} y1={diagonal ? TILE_H / 2 : 3} x2={diagonal ? TILE_W - 6 : TILE_W / 2} y2={diagonal ? TILE_H / 2 : TILE_H - 3} stroke="#54ffc0" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function ShadowLayer({ src, filterId }: { src: string; filterId: string }) {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1024 1024" aria-hidden="true">
      <defs>
        <filter id={filterId} colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  .2126 .7152 .0722 0 0"
          />
        </filter>
      </defs>
      <image href={src} width="1024" height="1024" filter={`url(#${filterId})`} opacity=".55" />
    </svg>
  );
}

function GlowLayer({ src, filterId }: { src: string; filterId: string }) {
  return (
    <svg className="absolute inset-0 h-full w-full mix-blend-screen" viewBox="0 0 1024 1024" aria-hidden="true">
      <defs>
        <filter id={filterId} colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  .2126 .7152 .0722 0 0"
          />
        </filter>
      </defs>
      <image href={src} width="1024" height="1024" filter={`url(#${filterId})`} />
    </svg>
  );
}

function Sprite({ placement, seed, selected }: { placement: Placement; seed: boolean; selected: boolean }) {
  if (placement.piece === 'path') return <ProceduralPath placement={placement} selected={selected} />;
  const meta = pieces[placement.piece];
  const fp = footprint(placement.piece);
  const anchor = iso(placement.col + (fp.cols - 1) / 2, placement.row + (fp.rows - 1) / 2);
  const size = placement.piece === 'citadel' ? 230 : placement.piece === 'workshop' ? 190 : 132;
  const url = placement.piece === 'rock' && seed
    ? '/land/v1/gate-A/evidence_mines_crystal_vein_rock/ne/seed_albedo_1024.png'
    : meta.url;
  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: anchor.x - size / 2, top: anchor.y - size * 0.79, width: size, height: size, zIndex: 100 + Math.round(anchor.y), filter: selected ? 'drop-shadow(0 0 9px #f5c542)' : undefined }}
      aria-label={meta.label}
    >
      <ShadowLayer src={meta.shadow} filterId={`shadow-${placement.uid.replace(/[^a-zA-Z0-9_-]/g, '')}`} />
      <img src={url} alt="" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
      {!seed && <GlowLayer src={meta.glow} filterId={`glow-${placement.uid.replace(/[^a-zA-Z0-9_-]/g, '')}`} />}
    </div>
  );
}

export default function TraderLandGatePage() {
  const stageScroller = useRef<HTMLDivElement>(null);
  const [placements, setPlacements] = useState<Placement[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || initial; } catch { return initial; }
  });
  const [history, setHistory] = useState<Placement[][]>([]);
  const [selected, setSelected] = useState<PieceId>('path');
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<Orientation>('ne_sw');
  const [seed, setSeed] = useState(false);
  const [notice, setNotice] = useState('Tap a free tile to place the selected blueprint.');

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(placements)); }, [placements]);
  useEffect(() => {
    const scroller = stageScroller.current;
    if (scroller) scroller.scrollLeft = Math.max(0, (scroller.scrollWidth - scroller.clientWidth) / 2);
  }, []);

  const used = useMemo(() => new Set(placements.flatMap(occupied)), [placements]);
  const place = useCallback((col: number, row: number) => {
    const fp = footprint(selected);
    const desired: string[] = [];
    for (let x = 0; x < fp.cols; x += 1) for (let y = 0; y < fp.rows; y += 1) desired.push(`${col + x}:${row + y}`);
    if (col + fp.cols > GRID || row + fp.rows > GRID || desired.some((cell) => used.has(cell)) || (col >= 3 && col <= 4 && row >= 3 && row <= 4)) {
      setNotice('Invalid position · footprint overlaps another piece or the Aura Core.');
      return;
    }
    setHistory((value) => [...value.slice(-9), placements]);
    const next = { uid: `${selected}-${Date.now()}`, piece: selected, col, row, ...(selected === 'path' ? { orientation } : {}) };
    setPlacements((value) => [...value, next]);
    setSelectedUid(next.uid);
    setNotice('Placed · snapshot persisted locally. Undo remains available.');
  }, [orientation, placements, selected, used]);

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return setNotice('Nothing to undo.');
    setPlacements(previous);
    setHistory((value) => value.slice(0, -1));
    setNotice('Placement undone and persisted.');
  };

  const reset = () => {
    setHistory((value) => [...value.slice(-9), placements]);
    setPlacements(initial);
    setSelectedUid(null);
    setNotice('Gate snapshot restored.');
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#05070a] text-white">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-[.34em] text-emerald-300">Trader Land // Gate A</div>
            <h1 className="mt-2 text-3xl font-semibold">One snapshot. Same rules everywhere.</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/55">Local-only integration harness · no wallet, XP, API or production writes.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[.035] px-4 py-3 font-mono text-[10px] uppercase tracking-[.18em] text-white/55">8×8 · {placements.length + 1} placed · autosaved</div>
        </header>

        <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_260px]">
          <div ref={stageScroller} className="relative overflow-auto rounded-3xl border border-emerald-400/20 bg-[radial-gradient(circle_at_50%_42%,rgba(18,93,73,.23),transparent_48%),linear-gradient(#071019,#05070a)]">
            <div className="relative mx-auto h-[520px] min-w-[860px]" data-testid="trader-land-grid">
              {Array.from({ length: GRID * GRID }, (_, index) => {
                const col = index % GRID; const row = Math.floor(index / GRID); const p = iso(col, row);
                const blocked = col >= 3 && col <= 4 && row >= 3 && row <= 4;
                return (
                  <button
                    key={`${col}:${row}`}
                    onClick={() => place(col, row)}
                    className="absolute transition hover:brightness-150 focus:outline-none"
                    style={{ left: p.x - TILE_W / 2, top: p.y - TILE_H / 2, width: TILE_W, height: TILE_H, clipPath: 'polygon(50% 0,100% 50%,50% 100%,0 50%)', background: blocked ? 'rgba(44,245,164,.12)' : (col + row) % 2 ? 'rgba(24,44,53,.8)' : 'rgba(19,36,45,.8)', border: 0, zIndex: 1 + col + row }}
                    aria-label={`Tile ${col},${row}`}
                  />
                );
              })}
              {placements.map((placement) => <Sprite key={placement.uid} placement={placement} seed={seed} selected={placement.uid === selectedUid} />)}
              <div className="pointer-events-none absolute" style={{ left: iso(3.5, 3.5).x - 124, top: iso(3.5, 3.5).y - 196, width: 248, height: 248, zIndex: 100 + Math.round(iso(3.5, 3.5).y) }}>
                <ShadowLayer src="/land/v1/gate-A/aura_core/ne/shadow_1024.png" filterId="shadow-aura-core" />
                <img src="/land/v1/gate-A/aura_core/ne/stage1_albedo_1024.png" alt="Aura Core" className="absolute inset-0 h-full w-full object-contain drop-shadow-[0_0_18px_rgba(44,245,164,.35)]" />
                <GlowLayer src="/land/v1/gate-A/aura_core/ne/stage1_glow_1024.png" filterId="glow-aura-core" />
              </div>
            </div>
          </div>

          <aside className="rounded-3xl border border-white/10 bg-white/[.035] p-4">
            <div className="font-mono text-[10px] uppercase tracking-[.25em] text-white/45">Blueprint inventory</div>
            <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1">
              {(['path', 'rock', 'antenna', 'workshop', 'citadel'] as PieceId[]).map((piece) => (
                <button key={piece} onClick={() => setSelected(piece)} className={`rounded-xl border px-3 py-2 text-left text-xs transition ${selected === piece ? 'border-emerald-300 bg-emerald-300/10 text-emerald-200' : 'border-white/10 bg-black/20 text-white/65'}`}>{piece}</button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setOrientation((value) => value === 'ne_sw' ? 'nw_se' : 'ne_sw')} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70"><RotateCw size={13} />{orientation}</button>
              <button onClick={() => setSeed((value) => !value)} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70"><Sparkles size={13} />{seed ? 'seed' : 'bloom'}</button>
              <button onClick={undo} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70"><Undo2 size={13} />Undo</button>
              <button onClick={reset} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70">Restore</button>
            </div>
            <div className="mt-4 rounded-xl border border-emerald-300/15 bg-black/30 p-3 text-xs leading-relaxed text-white/55">{notice}</div>
            <div className="mt-4 space-y-1 font-mono text-[9px] uppercase tracking-[.13em] text-white/35">
              <div>Procedural connectors: NE/SW · NW/SE</div>
              <div>Depth: anchor Y</div>
              <div>Persistence: localStorage</div>
              <div>Failures return inventory</div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
