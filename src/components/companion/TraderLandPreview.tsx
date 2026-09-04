import { useId, useState } from 'react';
import { ArrowUpRight, Move, RotateCw, Undo2 } from 'lucide-react';
import { t } from '@/lib/companions/i18n';

export const TRADER_LAND_URL = '/agentic-world/bobby/trader-land';

// Art anchors and bounds match the shipped gate-A manifest. This small preview
// does not load the editor, request an account, or mutate a visitor's island.
const pieces = [
  { id: 'aura_core', col: 3, row: 3, cols: 2, rows: 2, anchor: [.499, .8901], width: .5181, state: 'stage1' },
  { id: 'crypto_bay_context_buoy', col: 5, row: 1, cols: 1, rows: 1, anchor: [.4985, .7314], width: .3677, state: 'bloom' },
  { id: 'evidence_mines_crystal_vein_rock', col: 1, row: 3, cols: 1, rows: 1, anchor: [.4971, .8008], width: .5337, state: 'bloom' },
  { id: 'axiom_archive_aura_flower', col: 1, row: 5, cols: 1, rows: 1, anchor: [.4995, .771], width: .3203, state: 'bloom' },
  { id: 'risk_reef_dual_orbit_antenna', col: 6, row: 3, cols: 1, rows: 1, anchor: [.4976, .7251], width: .3593, state: 'bloom' },
];
const iso = (col: number, row: number) => ({ x: 430 + (col - row) * 46, y: 230 + (col + row) * 23 });
const diamond = (col: number, row: number) => {
  const { x, y } = iso(col, row);
  return `${x},${y - 23} ${x + 46},${y} ${x},${y + 23} ${x - 46},${y}`;
};

export default function TraderLandPreview() {
  const titleId = useId();
  const [pose, setPose] = useState({ moved: false, rotated: false });
  const [previous, setPrevious] = useState<typeof pose | null>(null);
  const change = (key: keyof typeof pose) => {
    setPrevious(pose);
    setPose({ ...pose, [key]: !pose[key] });
  };
  const selected = {
    id: 'crypto_bay_candle_tower', col: pose.moved ? 4 : 2, row: 6,
    cols: pose.rotated ? 1 : 2, rows: pose.rotated ? 2 : 1,
    anchor: [.499, .8242], width: .5039, state: 'bloom',
  };
  const scene = [...pieces, selected].sort((a, b) => (a.col + a.row + (a.cols + a.rows) / 2) - (b.col + b.row + (b.cols + b.rows) / 2));

  return (
    <figure className="overflow-hidden rounded-[1.75rem] border border-[#b9e6c9]/20 bg-[#101e1b] shadow-[0_32px_100px_#0005]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4 text-xs">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#d6eddc]">BOBBY WORLD / 01</span>
        <span className="flex items-center gap-2 text-[#b7d5bf]"><span className="h-1.5 w-1.5 rounded-full bg-[#b5e89c]" />{t('Interactive preview', 'Vista interactiva')}</span>
      </div>
      <svg viewBox="30 110 800 520" className="w-full bg-[radial-gradient(ellipse_at_center,#20423755,transparent_70%)]" role="img" aria-labelledby={titleId}>
        <title id={titleId}>{t('Trader Land island with the Aura Core and a movable Candle Tower', 'Isla de Trader Land con el Aura Core y una Candle Tower que puedes mover')}</title>
        <path d="M62 391 L430 575 L798 391 L798 412 L430 602 L62 412 Z" fill="#0a2527" stroke="#496b60" />
        {Array.from({ length: 64 }, (_, index) => <polygon key={index} points={diamond(index % 8, Math.floor(index / 8))} fill={(index + Math.floor(index / 8)) % 2 ? '#213e35' : '#244438'} stroke="#92c4a6" strokeOpacity=".17" />)}
        {Array.from({ length: 2 }, (_, index) => <polygon key={`footprint-${index}`} points={diamond(selected.col + (pose.rotated ? 0 : index), selected.row + (pose.rotated ? index : 0))} fill="#b6ee9e" fillOpacity=".24" stroke="#c5f2b1" strokeWidth="2" />)}
        {scene.map((piece) => {
          const center = iso(piece.col + (piece.cols - 1) / 2, piece.row + (piece.rows - 1) / 2);
          const size = Math.min(360, 92 * (piece.cols + piece.rows) / 2 * .9 / piece.width);
          const flipped = piece.id === selected.id && pose.rotated;
          return <g key={piece.id} transform={flipped ? `translate(${center.x * 2} 0) scale(-1 1)` : undefined}><image href={`/land/v1/gate-A/${piece.id}/ne/${piece.state}_albedo_512.webp`} x={center.x - size * piece.anchor[0]} y={center.y - size * piece.anchor[1]} width={size} height={size} /></g>;
        })}
      </svg>
      <div className="mx-4 mb-4 rounded-2xl border border-[#bbdbac]/20 bg-[#1d3025] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-[#eff6df]">Candle Tower</span>
          <span className="text-xs text-[#b7d5bf]" role="status">{selected.cols} × {selected.rows} · {t('Try the controls', 'Prueba los controles')}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => change('moved')} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#d1edb8] px-2 text-xs font-semibold text-[#17251a]"><Move size={15} />{t('Move', 'Mover')}</button>
          <button onClick={() => change('rotated')} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-2 text-xs text-[#e6eddf]"><RotateCw size={15} />{t('Rotate', 'Girar')}</button>
          <button disabled={!previous} onClick={() => { if (previous) setPose(previous); setPrevious(null); }} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-2 text-xs text-[#e6eddf] disabled:opacity-35"><Undo2 size={15} />{t('Undo', 'Deshacer')}</button>
        </div>
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-4 text-xs text-[#a9b9ad]">
        <span>{t('A composition with real game pieces. Nothing is saved here.', 'Una composición con piezas reales. Aquí no se guarda nada.')}</span>
        <a href={TRADER_LAND_URL} className="inline-flex min-h-11 items-center gap-2 font-semibold text-[#d1edb8]">{t('Open the full island', 'Abrir la isla completa')}<ArrowUpRight size={16} /></a>
      </figcaption>
    </figure>
  );
}
