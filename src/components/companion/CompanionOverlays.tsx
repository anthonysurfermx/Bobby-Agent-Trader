// The moments: evolution card, loot drop, gear belt, NO TRADE halo.
// Ported from EvolutionOverlay / ToolUnlockOverlay / ToolBelt / NoTrade card in iOS.
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Lock, Map as MapIcon, PawPrint, Plus, ShieldCheck, Sparkles } from 'lucide-react';
import { COMPANIONS, PET_UNLOCK_XP, SLOT_LABEL, type Companion, type CompanionLevel, type CompanionPet, type CompanionTool, companionName, glyphSprite, petArt, petFor, petUnlocked, tintFor, toolArt, toolHasArt, toolSlot, toolTierLabel, toolUnlockXP, toolsFor, LEVEL_TONE } from '@/lib/companions/data';
import BobbyMascot3D from '@/components/kinetic/BobbyMascot3D';
import { DEFAULT_MASCOT } from '@/lib/mascot';
import { pick, t } from '@/lib/companions/i18n';
import { sfxLevelUp, sfxLoot } from '@/lib/companions/sfx';

const GOLD = '#F5C542';

/** Trader Land — the Focus-Tree-style world we build next. Teaser only. */
export const WORLD_MAP_ART = '/world/bobby-world.jpg';
const WORLD_REGIONS = ['CRYPTO BAY', 'GOLD MINES', 'WALL STREET CITADEL', 'RISK REEF'];

export function EvolutionOverlay({ companion, level, onDone }: { companion: Companion; level: CompanionLevel; onDone: () => void }) {
  useEffect(() => { sfxLevelUp(); }, []);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(11,10,9,.97)' }}>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(50% 40% at 50% 42%, #15121C, transparent 72%)' }} />
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.3, duration: 0.6 }} className="relative flex max-w-md flex-col items-center px-8 text-center">
        <img src={`/mascots/${companion.id}.webp`} alt="" className="h-28 w-28 rounded-full object-cover" style={{ boxShadow: '0 0 0 1px rgba(242,237,228,.14), 0 0 60px -10px rgba(242,237,228,.35)' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
        <div className="n-label mt-7">{t('Your avatar evolved', 'Tu avatar evolucionó')}</div>
        <div className="n-display mt-3 text-[44px] leading-none" style={{ color: '#FFF8EC' }}>{companionName(companion, level.number)}</div>
        <div className="n-label mt-4" style={{ color: '#A39C91' }}>{t('Level', 'Nivel')} {level.number} · {level.name}</div>
        <div className="mt-4 text-[15px] leading-relaxed" style={{ color: '#A39C91' }}>{t('Earned with discipline, never with volume.', 'Ganado con disciplina, nunca con volumen.')}{pick(LEVEL_TONE[level.number] ?? { en: '', es: '' })}</div>
        <button onClick={onDone} className="n-cta on mt-8 max-w-[260px]">{t('Continue', 'Continuar')}</button>
      </motion.div>
    </motion.div>
  );
}

export function ToolUnlockOverlay({ companion, tool, onDone }: { companion: Companion; tool: CompanionTool; onDone: () => void }) {
  const golden = tool.tier === 3;
  const tint = golden ? GOLD : '#F2EDE4';
  useEffect(() => { sfxLoot(golden); }, [golden]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(11,10,9,.97)' }}>
      <div className="absolute inset-0" style={{ background: golden ? 'radial-gradient(45% 36% at 50% 40%, rgba(246,185,78,.16), transparent 72%)' : 'radial-gradient(50% 40% at 50% 40%, #15121C, transparent 72%)' }} />
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.35, duration: 0.6 }} className="relative flex max-w-md flex-col items-center px-8 text-center">
        <div className="n-label" style={{ color: golden ? GOLD : undefined }}>{golden ? t('Golden gear unlocked', 'Equipo dorado desbloqueado') : t('New gear unlocked', 'Nuevo equipo desbloqueado')}</div>
        <div className="mt-6 grid h-52 w-52 place-items-center overflow-hidden rounded-full" style={{ background: 'radial-gradient(circle at 50% 40%, rgba(242,237,228,.07), rgba(242,237,228,.015) 70%)', boxShadow: `0 0 0 1px ${tint}33, 0 0 60px -12px ${tint}66` }}>
          {toolHasArt(tool) ? <img src={toolArt(tool)} alt="" className="h-48 w-48 object-contain" /> : <span className="text-7xl" style={{ color: tint }}>{tool.glyph}</span>}
        </div>
        <div className="n-display mt-6 text-[32px] leading-tight" style={{ color: '#FFF8EC' }}>{pick(tool.name)}</div>
        <div className="mt-2 flex items-center justify-center gap-2 text-[14px]" style={{ color: '#A39C91' }}><img src={`/mascots/${companion.id}.webp`} alt="" className="h-6 w-6 rounded-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />{t(`for ${companionName(companion, 1)}`, `para ${companionName(companion, 1)}`)} · {pick(toolTierLabel(tool.tier))} · {toolUnlockXP(tool.tier)} XP</div>
        <div className="mt-4 max-w-sm text-[15px] leading-relaxed" style={{ color: '#A39C91' }}>{pick(tool.lore)}</div>
        <button onClick={onDone} className="n-cta on mt-8 max-w-[260px]">{t('Equip it', 'Equiparlo')}</button>
      </motion.div>
    </motion.div>
  );
}

export function ToolBelt({ companion, xp, onTap, onPet, onPlus, onWorld }: { companion: Companion; xp: number; onTap?: (tool: CompanionTool) => void; onPet?: () => void; onPlus?: () => void; onWorld?: () => void }) {
  const pet = petFor(companion.id);
  const hasPet = petUnlocked(xp);
  return (
    <div className="flex items-center justify-center gap-3">
      {toolsFor(companion.id).map((tool) => {
        const unlocked = xp >= toolUnlockXP(tool.tier);
        const golden = tool.tier === 3;
        const tint = golden ? GOLD : tintFor(companion);
        return (
          <button
            key={tool.tier}
            onClick={() => onTap?.(tool)}
            title={unlocked ? pick(tool.name) : `${pick(tool.name)} · ${toolUnlockXP(tool.tier)} XP`}
            className="h-11 w-11 rounded-full flex items-center justify-center overflow-hidden transition"
            style={{
              background: unlocked ? `${tint}22` : 'rgba(255,255,255,0.035)',
              border: `1px solid ${unlocked ? `${tint}99` : 'rgba(255,255,255,0.08)'}`,
              boxShadow: unlocked && golden ? `0 0 14px ${GOLD}55` : 'none',
            }}
          >
            {unlocked ? (toolHasArt(tool) ? <img src={toolArt(tool)} alt="" className="h-9 w-9 object-contain" /> : <span className="text-base" style={{ color: tint }}>{tool.glyph}</span>) : <Lock size={13} className="text-white/35" />}
          </button>
        );
      })}
      {pet && (
        <button onClick={onPet} title={hasPet ? pick(pet.name) : `${pick(pet.name)} · ${PET_UNLOCK_XP} XP`} className="h-11 w-11 rounded-full flex items-center justify-center" style={{ background: hasPet ? tintFor(companion, 0.13) : 'rgba(255,255,255,0.035)', border: `1px solid ${hasPet ? tintFor(companion, 0.6) : 'rgba(255,255,255,0.08)'}` }}>
          {hasPet ? (petArt(companion.id) ? <img src={petArt(companion.id)!} alt="" className="h-9 w-9 object-contain" /> : <span className="text-lg">{pet.emoji}</span>) : <PawPrint size={13} className="text-white/35" />}
        </button>
      )}
      <button onClick={onPlus} title={t('What else you can earn', 'Qué más puedes conseguir')} className="h-11 w-11 rounded-full flex items-center justify-center border border-dashed border-white/20 text-white/50"><Plus size={14} /></button>
      {/* The world slot: the map we are building next, fog of war and all. */}
      <button onClick={onWorld} title="Trader Land" className="relative h-11 w-11 rounded-full flex items-center justify-center overflow-visible" style={{ border: `1px solid ${GOLD}99`, backgroundImage: `url(${WORLD_MAP_ART})`, backgroundSize: '300%', backgroundPosition: '50% 58%' }}>
        <span className="absolute inset-0 rounded-full bg-black/45" />
        <motion.span className="absolute inset-0 rounded-full" style={{ border: `1px solid ${GOLD}` }} animate={{ scale: [1, 1.45], opacity: [0.8, 0] }} transition={{ repeat: Infinity, duration: 1.7, ease: 'easeOut' }} />
        <MapIcon size={14} className="relative" style={{ color: GOLD }} />
      </button>
    </div>
  );
}

/** The popup: an Age-of-Empires-style world under fog of war, SOON, and the
 *  promise that discipline XP carries over. Nothing here is playable yet. */
export function WorldMapTeaser({ xp, level, onClose }: { xp: number; level: number; onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3 overflow-y-auto" onClick={onClose}>
      <motion.div initial={{ scale: 0.92, y: 18 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', bounce: 0.35, duration: 0.6 }} className="relative w-full max-w-md rounded-3xl overflow-hidden bg-[#07090c] my-auto" style={{ border: `1px solid ${GOLD}40`, boxShadow: `0 0 60px ${GOLD}22` }} onClick={(e) => e.stopPropagation()}>
        <div className="relative aspect-[3/4] overflow-hidden">
          <motion.img src={WORLD_MAP_ART} alt="" className="absolute inset-0 h-full w-full object-cover" animate={{ scale: [1.08, 1, 1.08] }} transition={{ repeat: Infinity, duration: 18, ease: 'easeInOut' }} />
          <motion.div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 30% 22%, rgba(130,140,160,0.38), transparent 55%)' }} animate={{ x: [-24, 24, -24], y: [0, 14, 0] }} transition={{ repeat: Infinity, duration: 14, ease: 'easeInOut' }} />
          <div className="absolute inset-x-0 top-0 p-4 flex items-center justify-between">
            <div className="text-[10px] font-mono tracking-[0.3em] text-white/85 bg-black/45 backdrop-blur px-3 py-1 rounded-full">{t('TRADER LAND', 'TRADER LAND')}</div>
            <button onClick={onClose} aria-label="close" className="h-9 w-9 rounded-full bg-black/55 text-white/85">✕</button>
          </div>
          <div className="absolute inset-x-0 bottom-0 p-5 pt-20 bg-gradient-to-t from-[#07090c] via-[#07090c]/85 to-transparent">
            <motion.div animate={{ scale: [1, 1.07, 1] }} transition={{ repeat: Infinity, duration: 1.6 }} className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-mono tracking-[0.3em] text-black" style={{ background: GOLD, boxShadow: `0 0 24px ${GOLD}88` }}><Lock size={11} /> {t('SOON', 'PRONTO')}</motion.div>
            <div className="mt-3 text-2xl font-semibold text-white leading-tight">{t('Your world is built with discipline.', 'Tu mundo se construye con disciplina.')}</div>
            <div className="mt-2 text-sm text-white/75">{t('Every full read and every NO TRADE raises your base camp. Regions open with XP, never with volume.', 'Cada lectura completa y cada NO TRADE levanta tu campamento. Las regiones se abren con XP, nunca con volumen.')}</div>
          </div>
        </div>
        <div className="p-5 pt-4 space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-3">
            <div><div className="text-[10px] font-mono tracking-[0.2em] text-white/50">{t('ALREADY COUNTED', 'YA CUENTA')}</div><div className="text-white font-semibold">{xp} XP · {t('level', 'nivel')} {level}</div></div>
            <div className="text-[10px] font-mono tracking-[0.15em]" style={{ color: GOLD }}>{t('CARRIES OVER', 'SE CONSERVA')}</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {WORLD_REGIONS.map((name) => (
              <div key={name} className="flex items-center gap-2 rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2 text-[10px] font-mono tracking-[0.12em] text-white/55"><Lock size={10} />{name}</div>
            ))}
          </div>
          <button onClick={onClose} className="w-full py-3 rounded-full font-mono text-xs tracking-[0.2em] text-black" style={{ background: GOLD }}>{t('BACK TO THE DESK', 'VOLVER AL DESK')}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Unlocked gear worn on the body: floating around the 3D canvas, the
 *  golden one as a halo above the head, the pet at the feet (the panda spins). */
export function WornGear({ companion, xp, size }: { companion: Companion; xp: number; size: number }) {
  const worn = toolsFor(companion.id).filter((tool) => xp >= toolUnlockXP(tool.tier));
  const pet = petUnlocked(xp) ? petFor(companion.id) : null;
  const spots: Record<number, { left: string; top: string }> = { 1: { left: '78%', top: '54%' }, 2: { left: '8%', top: '30%' }, 3: { left: '50%', top: '-2%' } };
  const item = Math.round(size * 0.24);
  return (
    <div className="pointer-events-none absolute inset-0">
      {worn.map((tool) => {
        const golden = tool.tier === 3;
        const tint = golden ? GOLD : tintFor(companion);
        return (
          <motion.div key={tool.tier} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1, y: [0, -6, 0] }} transition={{ scale: { type: 'spring', bounce: 0.5 }, y: { repeat: Infinity, duration: 2.2 + tool.tier * 0.3, ease: 'easeInOut' } }} className="absolute rounded-full overflow-hidden flex items-center justify-center" style={{ left: spots[tool.tier].left, top: spots[tool.tier].top, width: item * (golden ? 1.2 : 1), height: item * (golden ? 1.2 : 1), transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.7)', border: `1px solid ${tint}99`, boxShadow: golden ? `0 0 26px ${GOLD}77` : `0 0 10px ${tint}44` }}>
            {toolHasArt(tool) ? <img src={toolArt(tool)} alt="" className="h-full w-full object-contain" /> : <span style={{ color: tint, fontSize: item * 0.5 }}>{tool.glyph}</span>}
          </motion.div>
        );
      })}
      {pet && (
        <motion.div initial={{ scale: 0 }} animate={pet.spins ? { scale: 1, rotate: 360 } : { scale: 1, y: [0, -8, 0] }} transition={pet.spins ? { rotate: { repeat: Infinity, duration: 2.2, ease: 'linear' } } : { y: { repeat: Infinity, duration: 1.6, repeatDelay: 1.2 } }} className="absolute" style={{ left: '12%', top: '80%', fontSize: item * 0.9, lineHeight: 1 }}>
          {pet.emoji}
        </motion.div>
      )}
    </div>
  );
}

/** The "+" slot: your pet and the other companions' gear, priced in XP. */
/** One thing you can still earn, with the companion that wears it. */
export type CatalogItem = { kind: 'tool'; tool: CompanionTool; companion: Companion } | { kind: 'pet'; pet: CompanionPet; companion: Companion };

/** Hold (or tap) a row to open the worn preview. Long press = 380 ms of pointer down. */
function useLongPress(onFire: () => void) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const clear = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } };
  return {
    onPointerDown: () => { fired.current = false; clear(); timer.current = window.setTimeout(() => { fired.current = true; onFire(); }, 380); },
    onPointerUp: () => { clear(); if (!fired.current) onFire(); },
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  };
}

function CatalogRow({ art, glyph, title, subtitle, needXP, needLevel, tint, xp, item, onPreview }: { art: string | null; glyph: string | null; title: string; subtitle: string; needXP: number; needLevel: number | null; tint: string; xp: number; item: CatalogItem; onPreview: (item: CatalogItem) => void }) {
  const have = xp >= needXP && needLevel === null;
  const missing = Math.max(0, needXP - xp);
  const press = useLongPress(() => onPreview(item));
  return (
    <div {...press} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onPreview(item); }} className="flex items-center gap-3 py-2 cursor-pointer select-none rounded-lg -mx-1 px-1 hover:bg-white/[0.03]" style={{ WebkitTouchCallout: 'none', touchAction: 'manipulation' }}>
      <div className="h-10 w-10 rounded-full flex items-center justify-center overflow-hidden shrink-0" style={{ background: `${tint}${have ? '29' : '0f'}`, border: `1px solid ${tint}${have ? 'b3' : '40'}`, filter: have ? 'none' : 'grayscale(0.8)' }}>
        {art ? <img src={art} alt="" className="h-9 w-9 object-contain" /> : <span style={{ color: tint }}>{glyph}</span>}
      </div>
      <div className="flex-1 min-w-0"><div className="text-white text-sm font-semibold">{title}</div><div className="text-white/55 text-xs truncate">{subtitle}</div></div>
      <div className="text-right shrink-0">{have ? <div className="text-[10px] font-mono text-green-400 tracking-[0.15em]">{t('YOURS', 'TUYO')}</div> : <><div className="font-mono text-xs" style={{ color: tint }}>+{missing} XP</div>{needLevel !== null && <div className="text-[9px] font-mono text-white/40">{t(`LVL ${needLevel}`, `NVL ${needLevel}`)}</div>}</>}</div>
    </div>
  );
}

/** The preview: the companion wearing the item in 3D, what it is, where it
 *  sits and what it takes. Works for every companion, art or glyph. */
export function ItemPreview({ item, xp, level, onClose }: { item: CatalogItem; xp: number; level: number; onClose: () => void }) {
  const companion = item.companion;
  const golden = item.kind === 'tool' && item.tool.tier === 3;
  const tint = golden ? GOLD : tintFor(companion);
  const needXP = item.kind === 'tool' ? toolUnlockXP(item.tool.tier) : PET_UNLOCK_XP;
  const needLevel = level < companion.requiredLevel ? companion.requiredLevel : null;
  const have = xp >= needXP && needLevel === null;
  const missing = Math.max(0, needXP - xp);
  const title = item.kind === 'tool' ? pick(item.tool.name) : pick(item.pet.name);
  const subtitle = item.kind === 'tool' ? `${pick(toolTierLabel(item.tool.tier))} · ${pick(SLOT_LABEL[toolSlot(item.tool)])}` : item.pet.spins ? t('PET · SPINS NEXT TO YOU', 'MASCOTA · GIRA A TU LADO') : t('PET · AT THE FEET', 'MASCOTA · A LOS PIES');
  const lore = item.kind === 'tool' ? pick(item.tool.lore) : item.pet.spins ? t('Spins next to you on the desk.', 'Gira a tu lado en el desk.') : t("Lives at your companion's feet.", 'Vive a los pies de tu companion.');
  const attachments = item.kind === 'tool'
    ? [{ url: toolHasArt(item.tool) ? toolArt(item.tool) : glyphSprite(item.tool.glyph, tint), slot: toolSlot(item.tool) as string, glow: golden ? GOLD : undefined }]
    : [{ url: petArt(companion.id) ?? glyphSprite(item.pet.emoji, tint), slot: 'pet', spin: item.pet.spins }];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 p-0 md:p-4" onClick={onClose}>
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="w-full max-w-md bg-[#0a0a0c] border border-white/[0.06] rounded-t-3xl md:rounded-3xl p-5 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between text-[10px] font-mono tracking-[0.2em]">
          <div className="flex items-center gap-2" style={{ color: tintFor(companion) }}><img src={`/mascots/${companion.id}.webp`} alt="" className="h-6 w-6 rounded-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />{t(`WORN BY ${companion.label}`, `LO LLEVA ${companion.label}`)}</div>
          <div className="text-white/45">PREVIEW</div>
        </div>
        <div className="relative mx-auto mt-3 rounded-2xl overflow-hidden" style={{ width: 300, height: 300, background: `radial-gradient(circle at 50% 45%, ${tint}30, transparent 65%)`, border: `1px solid ${tint}55` }}>
          <BobbyMascot3D look={{ ...DEFAULT_MASCOT, body: companion.palette, avatar: companion.id }} state="idle" size={300} attachments={attachments} />
          {!have && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-black/80 px-3 py-1.5 text-[10px] font-mono tracking-[0.15em] text-white/90" style={{ border: `1px solid ${tint}80` }}>
              <Lock size={10} />{needLevel !== null ? t(`LEVEL ${needLevel} · +${missing} XP`, `NIVEL ${needLevel} · +${missing} XP`) : t(`+${missing} XP TO GO`, `FALTAN ${missing} XP`)}
            </div>
          )}
        </div>
        <div className="mt-4 text-2xl font-semibold text-white">{title}</div>
        <div className="mt-1 text-[10px] font-mono tracking-[0.2em]" style={{ color: tint }}>{subtitle}</div>
        <div className="mt-2 text-sm text-white/75">{lore}</div>
        <div className="mt-3 text-[10px] font-mono tracking-[0.1em]" style={{ color: have ? '#4ade80' : 'rgba(255,255,255,0.4)' }}>{have ? t('YOURS', 'TUYO') : t('Discipline only: full reads and coming back. Never volume.', 'Solo disciplina: lecturas completas y volver. Nunca volumen.')}</div>
      </motion.div>
    </motion.div>
  );
}

export function GearCatalog({ current, xp, level, onClose }: { current: Companion; xp: number; level: number; onClose: () => void }) {
  const [preview, setPreview] = useState<CatalogItem | null>(null);
  const myPet = petFor(current.id);
  // Escape closes the preview first, then the catalog: the order of two stacked sheets.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key !== 'Escape') return; if (preview) setPreview(null); else onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview, onClose]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/95 overflow-y-auto">
      {/* The way out stays put: the shell nav sits at z-50 and used to cover this
          header, and the list itself is taller than any screen. */}
      <div className="sticky top-0 z-10 border-b border-white/[0.06] bg-black/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <button onClick={onClose} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white/[0.05] pl-2 pr-3.5 font-mono text-[10px] tracking-[0.2em] text-white/80 hover:bg-white/[0.09]" aria-label={t('Back to the desk', 'Volver al desk')}><ChevronLeft size={14} />DESK</button>
          <div className="min-w-0 text-center"><div className="text-white font-mono text-xs tracking-[0.2em]">{t('STILL TO EARN', 'POR CONSEGUIR')}</div><div className="truncate text-[9px] font-mono text-white/40 tracking-[0.15em]">{t('DISCIPLINE XP ONLY · NEVER VOLUME', 'SOLO XP DE DISCIPLINA · NUNCA VOLUMEN')}</div></div>
          <button onClick={onClose} className="h-9 w-9 shrink-0 rounded-full bg-white/[0.05] text-white/70 hover:bg-white/[0.09]" aria-label={t('Close', 'Cerrar')}>✕</button>
        </div>
      </div>
      <div className="mx-auto max-w-2xl p-4 pb-10 space-y-4">
        <div className="text-[10px] font-mono tracking-[0.1em] text-white/45">{t('Hold any item to see it worn.', 'Mantén presionado un item para verlo puesto.')}</div>
        {/* Your own companion used to show only the pet here, so your own three
            pieces were the one gear in the game you could never hold to see
            worn — the belt opens the flat card, not the 3D preview. */}
        <div className="rounded-xl p-3 bg-white/[0.02] border border-white/[0.05]">
          <div className="flex items-center gap-2 mb-1"><img src={`/mascots/${current.id}.webp`} alt="" className="h-7 w-7 rounded-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} /><span className="text-[10px] font-mono tracking-[0.2em] text-white/50">{t('YOUR GEAR', 'TU EQUIPO')}</span></div>
          {toolsFor(current.id).map((tool) => <CatalogRow key={`mine-${tool.tier}`} art={toolHasArt(tool) ? toolArt(tool) : null} glyph={tool.glyph} title={pick(tool.name)} subtitle={pick(tool.lore)} needXP={toolUnlockXP(tool.tier)} needLevel={null} tint={tool.tier === 3 ? GOLD : tintFor(current)} xp={xp} item={{ kind: 'tool', tool, companion: current }} onPreview={setPreview} />)}
          {myPet && <CatalogRow art={petArt(current.id)} glyph={myPet.emoji} title={pick(myPet.name)} subtitle={myPet.spins ? t('Spins next to you on the desk.', 'Gira a tu lado en el desk.') : t("Lives at your companion's feet.", 'Vive a los pies de tu companion.')} needXP={PET_UNLOCK_XP} needLevel={null} tint={tintFor(current)} xp={xp} item={{ kind: 'pet', pet: myPet, companion: current }} onPreview={setPreview} />}
        </div>
        <div className="text-[10px] font-mono tracking-[0.2em] text-white/50">{t("OTHER COMPANIONS' GEAR", 'EQUIPO DE OTROS COMPAÑEROS')}</div>
        {COMPANIONS.filter((c) => c.id !== current.id).map((c) => {
          const needLevel = level < c.requiredLevel ? c.requiredLevel : null;
          const pet = petFor(c.id);
          return (
            <div key={c.id} className="rounded-xl p-3 bg-white/[0.02] border border-white/[0.05]">
              <div className="flex items-center gap-2 mb-1"><img src={`/mascots/${c.id}.webp`} alt="" className="h-7 w-7 rounded-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} /><span className="font-mono text-xs tracking-[0.15em]" style={{ color: tintFor(c) }}>{c.label}</span>{needLevel !== null && <span className="text-[9px] font-mono text-white/40 tracking-[0.1em]">{t(`LEVEL ${needLevel} TO UNLOCK`, `NIVEL ${needLevel} PARA DESBLOQUEAR`)}</span>}</div>
              {toolsFor(c.id).map((tool) => <CatalogRow key={`${c.id}-${tool.tier}`} art={toolHasArt(tool) ? toolArt(tool) : null} glyph={tool.glyph} title={pick(tool.name)} subtitle={pick(tool.lore)} needXP={toolUnlockXP(tool.tier)} needLevel={needLevel} tint={tool.tier === 3 ? GOLD : tintFor(c)} xp={xp} item={{ kind: 'tool', tool, companion: c }} onPreview={setPreview} />)}
              {pet && <CatalogRow key={`${c.id}-pet`} art={petArt(c.id)} glyph={pet.emoji} title={pick(pet.name)} subtitle={t('Pet', 'Mascota')} needXP={PET_UNLOCK_XP} needLevel={needLevel} tint={tintFor(c)} xp={xp} item={{ kind: 'pet', pet, companion: c }} onPreview={setPreview} />}
            </div>
          );
        })}
        <button onClick={onClose} className="w-full py-3 rounded-full font-mono text-xs tracking-[0.2em] text-black" style={{ background: tintFor(current) }}>{t('BACK TO THE DESK', 'VOLVER AL DESK')}</button>
      </div>
      <AnimatePresence>{preview && <ItemPreview item={preview} xp={xp} level={level} onClose={() => setPreview(null)} />}</AnimatePresence>
    </motion.div>
  );
}

export function ToolDetail({ companion, tool, xp, onClose }: { companion: Companion; tool: CompanionTool; xp: number; onClose: () => void }) {
  const unlocked = xp >= toolUnlockXP(tool.tier);
  const golden = tool.tier === 3;
  const tint = golden ? GOLD : tintFor(companion);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/70" onClick={onClose}>
      <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }} className="w-full max-w-md bg-[#0a0a0c] border border-white/[0.06] rounded-t-2xl md:rounded-2xl p-6 text-center space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto h-36 w-36 rounded-full flex items-center justify-center overflow-hidden" style={{ background: `${tint}${unlocked ? '1f' : '0a'}`, border: `1px solid ${tint}${unlocked ? '99' : '33'}`, filter: unlocked ? 'none' : 'grayscale(1)' }}>
          {unlocked && toolHasArt(tool) ? <img src={toolArt(tool)} alt="" className="h-32 w-32 object-contain" /> : unlocked ? <span className="text-5xl" style={{ color: tint }}>{tool.glyph}</span> : <Lock className="text-white/40" size={40} />}
        </div>
        <div className="text-2xl font-semibold text-white">{unlocked ? pick(tool.name) : '???'}</div>
        <div className="text-[10px] font-mono tracking-[0.15em] text-white/50">
          {unlocked ? `${pick(toolTierLabel(tool.tier))} · ${companionName(companion, 1)}` : t(`${pick(toolTierLabel(tool.tier))} · UNLOCKS AT ${toolUnlockXP(tool.tier)} XP · YOU HAVE ${xp}`, `${pick(toolTierLabel(tool.tier))} · SE DESBLOQUEA A ${toolUnlockXP(tool.tier)} XP · LLEVAS ${xp}`)}
        </div>
        <div className="text-sm text-white/75">{unlocked ? pick(tool.lore) : tool.tier === 1 ? t('Drops after your first full read.', 'Cae después de tu primera lectura completa.') : t('Discipline only: reads and coming back. Never volume.', 'Solo disciplina: lecturas y volver. Nunca volumen.')}</div>
      </motion.div>
    </motion.div>
  );
}

export function NoTradeCard({ symbol, reason, xp, onClose, compact = false }: { symbol: string; reason: string; xp: number; onClose: () => void; compact?: boolean }) {
  if (compact) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="relative rounded-2xl border border-sky-300/25 bg-sky-300/[0.05] p-4">
        <button onClick={onClose} className="absolute right-3 top-3 h-8 w-8 rounded-full bg-white/[0.05] text-white/60" aria-label="close">✕</button>
        <div className="font-mono text-sm tracking-[0.18em] text-sky-200">NO TRADE</div>
        <div className="mt-2 pr-8 text-sm text-white/70">{reason}</div>
        {xp > 0 && <div className="mt-3 font-mono text-[10px] tracking-[0.12em] text-amber-300">+{xp} XP</div>}
      </motion.div>
    );
  }
  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="rounded-2xl px-6 pt-5 pb-6 border border-sky-300/30 relative overflow-hidden" style={{ background: 'radial-gradient(circle at 50% 30%, rgba(125,211,252,0.14), rgba(255,255,255,0.02) 55%, transparent 80%)' }}>
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-mono tracking-[0.25em] text-sky-300">HALO // RISK GATE</div>
          <button onClick={onClose} className="h-7 w-7 rounded-full bg-white/[0.05] text-white/60 text-xs font-mono" aria-label="close">✕</button>
        </div>
        {/* The halo: HALO's own face inside the ring, the shield as its badge — the same beat as the iOS card. */}
        <div className="relative mx-auto mt-6 h-36 w-36">
          <div className="absolute inset-0 rounded-full" style={{ boxShadow: '0 0 48px rgba(125,211,252,0.35)' }} />
          <div className="absolute inset-0 rounded-full border-[5px] border-white/85 overflow-hidden bg-black/60">
            <img src="/mascots/halo.webp" alt="" className="h-full w-full object-cover scale-110" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
          </div>
          <div className="absolute left-1/2 -bottom-4 -translate-x-1/2 h-11 w-11 rounded-full bg-[#0b1220] border border-sky-300/60 flex items-center justify-center" style={{ boxShadow: '0 0 18px rgba(125,211,252,0.55)' }}>
            <ShieldCheck className="text-sky-300" size={22} />
          </div>
        </div>
        <div className="mt-8 text-center text-4xl md:text-5xl font-mono tracking-[0.22em] text-sky-200">NO TRADE</div>
        <div className="mt-3 text-center text-white text-lg md:text-xl font-medium">{t('No setup yet. Capital protected.', 'Sin setup todavía. Capital protegido.')}</div>
        <div className="mt-1 text-center text-white/55 text-xs font-mono">{reason}</div>
        <div className="mt-5 flex items-center justify-between text-[11px] font-mono border border-white/[0.08] rounded-lg px-3 py-2 bg-black/30">
          <span className="text-amber-300 flex items-center gap-1"><Sparkles size={12} /> {xp > 0 ? t(`+${xp} DISCIPLINE XP`, `+${xp} XP DE DISCIPLINA`) : t('DAILY CAP REACHED', 'TOPE DIARIO ALCANZADO')}</span>
          <span className="text-white/40">{symbol}</span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
