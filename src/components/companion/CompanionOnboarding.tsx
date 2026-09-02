// Companion-first onboarding, ported from CompanionOnboarding.swift +
// LoadoutStep.swift: choose your companion (it speaks when you pick it),
// choose its vibe (you hear it live), then the LOADOUT — four pieces of kit
// equip one by one with sound and vibration, the companion is ready, and
// you drop into the desk.
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Volume2 } from 'lucide-react';
import BobbyMascot3D from '@/components/kinetic/BobbyMascot3D';
import { DEFAULT_MASCOT } from '@/lib/mascot';
import { COMPANIONS, LOADOUT_GEAR, ORIGIN_STORY, VIBES, companionName, getVibe, tintFor, type Companion } from '@/lib/companions/data';
import { pick, t } from '@/lib/companions/i18n';
import { progressStore, useProgress } from '@/lib/companions/progress';
import { sfxSpawn, sfxTock } from '@/lib/companions/sfx';
import { useCompanionVoice } from '@/hooks/useCompanionVoice';

export default function CompanionOnboarding({ onDone }: { onDone: () => void }) {
  const progress = useProgress();
  const voice = useCompanionVoice();
  const starters = useMemo(() => COMPANIONS.filter((c) => c.requiredLevel === 1), []);
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<Companion>(starters.find((c) => c.id === 'byte') ?? starters[0]);
  const [vibeId, setVibeId] = useState(progress.vibeId);
  const [equipped, setEquipped] = useState<string[]>([]);
  const [burst, setBurst] = useState(false);
  const autoRef = useRef<number[]>([]);
  const tint = tintFor(selected);
  const ready = equipped.length === LOADOUT_GEAR.length;

  // Loadout: slots equip themselves one by one; any tap jumps ahead.
  useEffect(() => {
    if (step !== 2) return;
    autoRef.current.forEach(clearTimeout);
    autoRef.current = LOADOUT_GEAR.map((g, i) => window.setTimeout(() => equip(g.id), 450 + i * 620));
    return () => autoRef.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function equip(id: string) {
    setEquipped((prev) => {
      if (prev.includes(id)) { sfxTock(); return prev; }
      sfxTock();
      const next = [...prev, id];
      if (next.length === LOADOUT_GEAR.length) { sfxSpawn(); setBurst(true); setTimeout(() => setBurst(false), 1400); }
      return next;
    });
  }

  const vibe = getVibe(vibeId);

  const next = () => {
    sfxTock();
    if (step === 0) {
      progressStore.setCompanion(selected.id);
      setStep(1);
    } else if (step === 1) {
      voice.stop();
      progressStore.setVibe(vibeId);
      setStep(2);
    } else if (ready) {
      voice.stop();
      progressStore.finishOnboarding();
      onDone();
    }
  };

  const title = step === 2 ? t('BOBBY // PREPPING YOUR TRADER VIBE', 'BOBBY // PREPARANDO TU VIBRA DE TRADER') : t('BOBBY // MEET YOUR SQUAD', 'BOBBY // CONOCE AL SQUAD');

  return (
    <div className="mx-auto max-w-xl px-5 py-6 flex flex-col min-h-[calc(100vh-80px)]">
      <div className="flex items-center justify-between text-[11px] font-mono tracking-[0.2em]">
        <div className="flex items-center gap-2 text-white/75"><span className="h-1.5 w-1.5 rounded-full" style={{ background: tint, boxShadow: `0 0 8px ${tint}` }} />{title}</div>
        <div style={{ color: tint }}>0{step + 1} / 03</div>
      </div>
      <div className="mt-3 h-0.5 bg-white/[0.06] rounded-full"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${((step + 1) / 3) * 100}%`, background: tint }} /></div>

      <div className="flex-1 flex items-center justify-center py-4" style={{ background: `radial-gradient(circle at 50% 50%, ${tintFor(selected, 0.14)}, transparent 60%)` }}>
        <BobbyMascot3D look={{ ...DEFAULT_MASCOT, body: selected.palette, avatar: selected.id }} state={voice.speaking ? 'speaking' : 'idle'} level={voice.speaking ? voice.level : null} size={step === 2 ? 220 : 280} />
      </div>

      {/* No exit animation on purpose: rapid step changes must never leave a
          stale step on screen (AnimatePresence "wait" could). */}
      <div>
        <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          {step === 0 && (
            <>
              <div className="text-center">
                <div className="text-3xl font-semibold tracking-[0.15em]" style={{ color: tint }}>{selected.label}</div>
                <div className="text-[11px] font-mono tracking-[0.2em] text-white/50 mt-1">{pick(selected.role)}</div>
                <div className="text-white/80 mt-1">{pick(selected.personality)}</div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {starters.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setSelected(c); sfxTock(); void voice.speak(pick(c.selectLine), { voice: c.voicePersona, essential: false }); }}
                    className="rounded-xl p-2 border transition text-center"
                    style={{ borderColor: selected.id === c.id ? tintFor(c, 0.7) : 'rgba(255,255,255,0.06)', background: selected.id === c.id ? tintFor(c, 0.08) : 'rgba(255,255,255,0.02)' }}
                  >
                    <img src={`/mascots/${c.id === 'orb' ? 'orb' : c.id}.webp`} alt="" className="h-16 w-16 mx-auto rounded-lg object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
                    <div className="text-[10px] font-mono tracking-[0.15em] mt-1" style={{ color: selected.id === c.id ? tintFor(c) : 'rgba(255,255,255,0.6)' }}>{c.label}</div>
                  </button>
                ))}
              </div>
              <div className="text-[11px] font-mono text-white/40 text-center">{t('Tap one — it introduces itself. More of the squad unlocks as you level up.', 'Toca uno — se presenta solo. El resto del squad se desbloquea al subir de nivel.')}</div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="text-center text-2xl font-semibold text-white">{t(`How should ${selected.label} talk to you?`, `¿Cómo quieres que te hable ${selected.label}?`)}</div>
              <div className="text-center text-sm text-white/50">{t('Tap to hear it. The tone changes; the data never does.', 'Toca para escucharlo. Cambia el tono; los datos no cambian.')}</div>
              <div className="space-y-2">
                {VIBES.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => { setVibeId(v.id); sfxTock(); void voice.speak(pick(v.sample), { voice: selected.voicePersona, vibe: v.server, essential: false }); }}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl border transition text-left"
                    style={{ borderColor: vibeId === v.id ? tintFor(selected, 0.6) : 'rgba(255,255,255,0.06)', background: vibeId === v.id ? tintFor(selected, 0.07) : 'rgba(255,255,255,0.02)' }}
                  >
                    <span>
                      <span className="block font-mono text-xs tracking-[0.15em]" style={{ color: vibeId === v.id ? tint : 'white' }}>{pick(v.label).toUpperCase()}</span>
                      <span className="block text-sm text-white/60">{pick(v.desc)}</span>
                    </span>
                    {vibeId === v.id ? <Check size={16} className="text-green-400" /> : <Volume2 size={16} className="text-white/40" />}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <div className="relative space-y-3">
              {burst && <Burst tint={tint} />}
              <div className="flex items-baseline justify-between text-[11px] font-mono tracking-[0.15em]">
                <span style={{ color: ready ? '#34D399' : tint }}>{ready ? t(`${companionName(selected, 1)} IS READY`, `${companionName(selected, 1)} ESTÁ LISTO`) : t(`PREPPING ${companionName(selected, 1)}'S TRADER VIBE…`, `PREPARANDO LA VIBRA DE TRADER DE ${companionName(selected, 1)}…`)}</span>
                <span className="text-white/45">{t('LOADOUT', 'EQUIPO')} {equipped.length}/{LOADOUT_GEAR.length}</span>
              </div>
              <p className="text-center text-sm text-white/80">{pick(ORIGIN_STORY[selected.id])}</p>
              <div className="grid grid-cols-2 gap-2">
                {LOADOUT_GEAR.map((g) => {
                  const on = equipped.includes(g.id);
                  return (
                    <motion.button key={g.id} onClick={() => equip(g.id)} animate={{ scale: on ? [1, 1.06, 1] : 1 }} transition={{ duration: 0.32 }} className="text-left rounded-xl p-3 border transition" style={{ borderColor: on ? tintFor(selected, 0.55) : 'rgba(255,255,255,0.06)', background: on ? tintFor(selected, 0.08) : 'rgba(255,255,255,0.02)', boxShadow: on ? `0 0 14px ${tintFor(selected, 0.25)}` : 'none' }}>
                      <div className="flex items-center justify-between">
                        <span className="h-8 w-8 rounded-full flex items-center justify-center text-sm border" style={{ borderColor: on ? tintFor(selected, 0.7) : 'rgba(255,255,255,0.08)', color: on ? tint : 'rgba(255,255,255,0.4)' }}>{g.glyph}</span>
                        <span className="text-[9px] font-mono tracking-[0.15em]" style={{ color: on ? '#34D399' : 'rgba(255,255,255,0.35)' }}>{on ? t('EQUIPPED', 'EQUIPADO') : t('TAP', 'TOCA')}</span>
                      </div>
                      <div className="mt-2 text-[10px] font-mono tracking-[0.12em]" style={{ color: on ? 'white' : 'rgba(255,255,255,0.6)' }}>{pick(g.title)}</div>
                      <div className="text-[11px]" style={{ color: on ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.4)' }}>{pick(g.line)}</div>
                    </motion.button>
                  );
                })}
              </div>
              <div className="text-center text-[10px] font-mono text-white/40">{t('Analysis, not advice. You decide and you own the risk.', 'Análisis, no asesoría. Tú decides y asumes el riesgo.')} · <a className="underline" href="/privacy" target="_blank" rel="noreferrer">{t('Privacy Policy', 'Aviso de privacidad')}</a></div>
            </div>
          )}
        </motion.div>
      </div>

      <button
        onClick={next}
        disabled={step === 2 && !ready}
        className="mt-4 w-full py-4 px-5 rounded-xl flex items-center justify-between font-mono text-xs tracking-[0.15em] text-black transition disabled:opacity-45"
        style={{ background: tint, boxShadow: `0 6px 24px ${tintFor(selected, 0.3)}` }}
      >
        {step === 0 ? t('MAKE IT MY COMPANION', 'HACER MI COMPANION') : step === 1 ? t('NEXT', 'SIGUE') : ready ? t('DROP INTO THE DESK', 'ENTRAR AL DESK') : t('EQUIPPING…', 'EQUIPANDO…')}
        {step === 2 ? <ArrowRight size={14} /> : <Check size={14} />}
      </button>
      <div className="sr-only">{vibe.id}</div>
    </div>
  );
}

function Burst({ tint }: { tint: string }) {
  const parts = useMemo(() => Array.from({ length: 22 }, (_, i) => ({ a: (i / 22) * Math.PI * 2 + (Math.random() - 0.5) * 0.3, d: 60 + Math.random() * 90, s: 3 + Math.random() * 4 })), []);
  return (
    <div className="pointer-events-none absolute left-1/2 -top-2 z-10">
      {parts.map((p, i) => (
        <motion.span key={i} initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }} animate={{ x: Math.cos(p.a) * p.d, y: Math.sin(p.a) * p.d * 0.75 + 30, opacity: 0, rotate: 180 }} transition={{ duration: 1.1, ease: 'easeOut' }} className="absolute block rounded-sm" style={{ width: p.s, height: p.s, background: tint }} />
      ))}
    </div>
  );
}
