// The moments: evolution card, loot drop, gear belt, NO TRADE halo.
// Ported from EvolutionOverlay / ToolUnlockOverlay / ToolBelt / NoTrade card in iOS.
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, PawPrint, Plus, ShieldCheck, Sparkles } from 'lucide-react';
import { COMPANIONS, PET_UNLOCK_XP, type Companion, type CompanionLevel, type CompanionTool, companionName, petArt, petFor, petUnlocked, tintFor, toolArt, toolHasArt, toolTierLabel, toolUnlockXP, toolsFor, LEVEL_TONE } from '@/lib/companions/data';
import { pick, t } from '@/lib/companions/i18n';
import { sfxLevelUp, sfxLoot } from '@/lib/companions/sfx';

const GOLD = '#F5C542';

export function EvolutionOverlay({ companion, level, onDone }: { companion: Companion; level: CompanionLevel; onDone: () => void }) {
  useEffect(() => { sfxLevelUp(); }, []);
  const tint = tintFor(companion);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85">
      <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 45%, ${tintFor(companion, 0.25)}, transparent 55%)` }} />
      <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.4, duration: 0.6 }} className="relative text-center space-y-3 px-8">
        <div className="text-[11px] font-mono tracking-[0.3em]" style={{ color: tint }}>{t('EVOLVED', 'EVOLUCIONÓ')}</div>
        <div className="text-4xl font-semibold text-white">{companionName(companion, level.number)}</div>
        <div className="text-[11px] font-mono tracking-[0.2em] text-white/60">{t('LEVEL', 'NIVEL')} {level.number} · {level.name}</div>
        <div className="text-sm text-white/70">{t('Earned with discipline, never with volume.', 'Ganado con disciplina, nunca con volumen.')}{pick(LEVEL_TONE[level.number] ?? { en: '', es: '' })}</div>
        <button onClick={onDone} className="mt-4 px-8 py-3 rounded-full font-mono text-xs tracking-[0.2em] text-black" style={{ background: tint }}>{t('CONTINUE', 'CONTINUAR')}</button>
      </motion.div>
    </motion.div>
  );
}

export function ToolUnlockOverlay({ companion, tool, onDone }: { companion: Companion; tool: CompanionTool; onDone: () => void }) {
  const golden = tool.tier === 3;
  const tint = golden ? GOLD : tintFor(companion);
  useEffect(() => { sfxLoot(golden); }, [golden]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85">
      <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 45%, ${golden ? 'rgba(245,197,66,0.28)' : tintFor(companion, 0.28)}, transparent 55%)` }} />
      <motion.div initial={{ scale: 0.6, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', bounce: 0.45, duration: 0.65 }} className="relative text-center space-y-3 px-8">
        <div className="text-[11px] font-mono tracking-[0.3em]" style={{ color: tint }}>{golden ? t('GOLDEN GEAR UNLOCKED', 'EQUIPO DORADO DESBLOQUEADO') : t('NEW GEAR UNLOCKED', 'NUEVO EQUIPO DESBLOQUEADO')}</div>
        <div className="mx-auto h-56 w-56 rounded-full flex items-center justify-center overflow-hidden" style={{ background: `${tint}1a`, boxShadow: `0 0 40px ${tint}66`, border: `1px solid ${tint}80` }}>
          {toolHasArt(tool) ? <img src={toolArt(tool)} alt="" className="h-52 w-52 object-contain" /> : <span className="text-7xl" style={{ color: tint }}>{tool.glyph}</span>}
        </div>
        <div className="text-3xl font-semibold text-white">{pick(tool.name)}</div>
        <div className="flex items-center justify-center gap-2 text-sm text-white/80"><img src={`/mascots/${companion.id}.webp`} alt="" className="h-6 w-6 rounded-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />{t(`equipped on ${companionName(companion, 1)}`, `equipado en ${companionName(companion, 1)}`)}</div>
        <div className="text-[11px] font-mono tracking-[0.2em] text-white/60">{pick(toolTierLabel(tool.tier))} · {toolUnlockXP(tool.tier)} XP</div>
        <div className="text-sm text-white/75 max-w-sm mx-auto">{pick(tool.lore)}</div>
        <button onClick={onDone} className="mt-3 px-8 py-3 rounded-full font-mono text-xs tracking-[0.2em] text-black" style={{ background: tint }}>{t('EQUIP IT', 'EQUIPARLO')}</button>
      </motion.div>
    </motion.div>
  );
}

export function ToolBelt({ companion, xp, onTap, onPet, onPlus }: { companion: Companion; xp: number; onTap?: (tool: CompanionTool) => void; onPet?: () => void; onPlus?: () => void }) {
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
    </div>
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
export function GearCatalog({ current, xp, level, onClose }: { current: Companion; xp: number; level: number; onClose: () => void }) {
  const row = (key: string, art: string | null, glyph: string | null, title: string, subtitle: string, needXP: number, needLevel: number | null, tint: string) => {
    const have = xp >= needXP && needLevel === null;
    const missing = Math.max(0, needXP - xp);
    return (
      <div key={key} className="flex items-center gap-3 py-2">
        <div className="h-10 w-10 rounded-full flex items-center justify-center overflow-hidden shrink-0" style={{ background: `${tint}${have ? '29' : '0f'}`, border: `1px solid ${tint}${have ? 'b3' : '40'}`, filter: have ? 'none' : 'grayscale(0.8)' }}>
          {art ? <img src={art} alt="" className="h-9 w-9 object-contain" /> : <span style={{ color: tint }}>{glyph}</span>}
        </div>
        <div className="flex-1 min-w-0"><div className="text-white text-sm font-semibold">{title}</div><div className="text-white/55 text-xs truncate">{subtitle}</div></div>
        <div className="text-right shrink-0">{have ? <div className="text-[10px] font-mono text-green-400 tracking-[0.15em]">{t('YOURS', 'TUYO')}</div> : <><div className="font-mono text-xs" style={{ color: tint }}>+{missing} XP</div>{needLevel !== null && <div className="text-[9px] font-mono text-white/40">{t(`LVL ${needLevel}`, `NVL ${needLevel}`)}</div>}</>}</div>
      </div>
    );
  };
  const myPet = petFor(current.id);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/95 overflow-y-auto">
      <div className="mx-auto max-w-2xl p-4 space-y-4">
        <div className="flex items-center justify-between"><div><div className="text-white font-mono tracking-[0.2em]">{t('STILL TO EARN', 'POR CONSEGUIR')}</div><div className="text-[10px] font-mono text-white/40 tracking-[0.15em]">{t('DISCIPLINE XP ONLY · NEVER VOLUME', 'SOLO XP DE DISCIPLINA · NUNCA VOLUMEN')}</div></div><button onClick={onClose} className="h-9 w-9 rounded-full bg-white/[0.05] text-white/70">✕</button></div>
        {myPet && (<div className="rounded-xl p-3 bg-white/[0.02] border border-white/[0.05]"><div className="text-[10px] font-mono tracking-[0.2em] text-white/50 mb-1">{t('YOUR PET', 'TU MASCOTA')}</div>{row('mypet', petArt(current.id), myPet.emoji, pick(myPet.name), myPet.spins ? t('Spins next to you on the desk.', 'Gira a tu lado en el desk.') : t("Lives at your companion's feet.", 'Vive a los pies de tu companion.'), PET_UNLOCK_XP, null, tintFor(current))}</div>)}
        <div className="text-[10px] font-mono tracking-[0.2em] text-white/50">{t("OTHER COMPANIONS' GEAR", 'EQUIPO DE OTROS COMPAÑEROS')}</div>
        {COMPANIONS.filter((c) => c.id !== current.id).map((c) => {
          const needLevel = level < c.requiredLevel ? c.requiredLevel : null;
          const pet = petFor(c.id);
          return (
            <div key={c.id} className="rounded-xl p-3 bg-white/[0.02] border border-white/[0.05]">
              <div className="flex items-center gap-2 mb-1"><img src={`/mascots/${c.id}.webp`} alt="" className="h-7 w-7 rounded-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} /><span className="font-mono text-xs tracking-[0.15em]" style={{ color: tintFor(c) }}>{c.label}</span>{needLevel !== null && <span className="text-[9px] font-mono text-white/40 tracking-[0.1em]">{t(`LEVEL ${needLevel} TO UNLOCK`, `NIVEL ${needLevel} PARA DESBLOQUEAR`)}</span>}</div>
              {toolsFor(c.id).map((tool) => row(`${c.id}-${tool.tier}`, toolHasArt(tool) ? toolArt(tool) : null, tool.glyph, pick(tool.name), pick(tool.lore), toolUnlockXP(tool.tier), needLevel, tool.tier === 3 ? GOLD : tintFor(c)))}
              {pet && row(`${c.id}-pet`, petArt(c.id), pet.emoji, pick(pet.name), t('Pet', 'Mascota'), PET_UNLOCK_XP, needLevel, tintFor(c))}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

export function ToolDetail({ companion, tool, xp, onClose }: { companion: Companion; tool: CompanionTool; xp: number; onClose: () => void }) {
  const unlocked = xp >= toolUnlockXP(tool.tier);
  const golden = tool.tier === 3;
  const tint = golden ? GOLD : tintFor(companion);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 flex items-end md:items-center justify-center bg-black/70" onClick={onClose}>
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

export function NoTradeCard({ symbol, reason, xp, onClose }: { symbol: string; reason: string; xp: number; onClose: () => void }) {
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
