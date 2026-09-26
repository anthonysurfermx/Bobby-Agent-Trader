// The profile: where the avatars live now. The glass is the protagonist of the desk; your
// companion, its level, gear and pet, the squad you unlock with discipline, your account,
// wallet, Trader Land and the preferences all sit behind the avatar in the top-right corner,
// the way the iPhone app keeps them behind its header face.
import { useState, type ReactNode, type RefObject } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeftRight, ChevronRight, Globe, Grid2x2, Lock, Map as MapIcon, Mic, RotateCcw, Share2, ShieldAlert, Volume2, VolumeX, X } from 'lucide-react';
import BobbyMascot3D from '@/components/kinetic/BobbyMascot3D';
import { DEFAULT_MASCOT } from '@/lib/mascot';
import { COMPANIONS, nextLevelFor, type Companion, type CompanionLevel, type CompanionTool } from '@/lib/companions/data';
import { isSpanish, pick, t } from '@/lib/companions/i18n';
import { sfxTock } from '@/lib/companions/sfx';
import { ToolBelt } from '@/components/companion/CompanionOverlays';
import ProgressSync from '@/components/companion/ProgressSync';
import { WalletBalancePill } from '@/components/companion/DeskWallet';

interface Props {
  companion: Companion;
  displayName: string;
  level: CompanionLevel;
  xp: number;
  mascotState: 'idle' | 'listening' | 'speaking' | 'thinking';
  voiceLevel: number | null;
  attachments: Array<{ url: string; slot: string; spin?: boolean; glow?: string }>;
  equip: { url: string; token: number };
  stageRef: RefObject<HTMLDivElement>;
  freeVoice: boolean;
  muted: boolean;
  speakEnabled: boolean;
  onClose: () => void;
  onPickCompanion: (c: Companion) => void;
  onTool: (tool: CompanionTool) => void;
  onPet: () => void;
  onCatalog: () => void;
  onSwap: () => void;
  onTraderLand: () => void;
  onExplore: () => void;
  onShare: () => void;
  onSignIn: () => void;
  onRisk: () => void;
  onToggleVoiceMode: () => void;
  onToggleSpeak: () => void;
  onToggleSounds: () => void;
  onReset: () => void;
}

function Row({ icon, label, detail, onClick, children }: { icon: ReactNode; label: string; detail?: string; onClick?: () => void; children?: ReactNode }) {
  const body = (
    <>
      <span className="n-row-ico">{icon}</span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[15px]" style={{ color: '#F2EDE4' }}>{label}</span>
        {detail && <span className="mt-0.5 block text-[12px]" style={{ color: '#8A8378' }}>{detail}</span>}
      </span>
      {children ?? (onClick ? <ChevronRight size={16} style={{ color: '#8A8378' }} /> : null)}
    </>
  );
  return onClick
    ? <button type="button" className="n-row" onClick={() => { sfxTock(); onClick(); }}>{body}</button>
    : <div className="n-row">{body}</div>;
}

export default function NucleoProfile(p: Props) {
  const [locked, setLocked] = useState<Companion | null>(null);
  const next = nextLevelFor(p.xp);
  const progress = next ? Math.max(0, Math.min(1, (p.xp - p.level.minXP) / (next.minXP - p.level.minXP))) : 1;

  return (
    <motion.div key="profile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]" onClick={p.onClose}>
      <motion.aside
        initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        className="n-drawer" onClick={(e) => e.stopPropagation()} aria-label={t('Your profile', 'Tu perfil')}
      >
        <div className="flex items-center justify-between">
          <span className="n-label">{t('Profile', 'Perfil')}</span>
          <button type="button" onClick={p.onClose} className="n-iconbtn" aria-label={t('Close', 'Cerrar')}><X size={16} /></button>
        </div>

        {/* your avatar */}
        <div ref={p.stageRef} className="relative mx-auto mt-1" style={{ width: 220, height: 220 }}>
          <BobbyMascot3D look={{ ...DEFAULT_MASCOT, body: p.companion.palette, avatar: p.companion.id }} state={p.mascotState} level={p.voiceLevel} size={220} attachments={p.attachments} equipUrl={p.equip.url} equipToken={p.equip.token} />
        </div>
        <div className="text-center">
          <div className="n-display text-[28px] leading-tight">{p.displayName}</div>
          <div className="mt-1 text-[13px]" style={{ color: '#A39C91' }}>{pick(p.companion.role)}</div>
        </div>
        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <span className="n-label">{t('Level', 'Nivel')} {p.level.number} · {p.level.name}</span>
            <span className="n-label">{p.xp} XP{next ? ` / ${next.minXP}` : ''}</span>
          </div>
          <div className="mt-2 h-[3px] overflow-hidden rounded-full" style={{ background: 'rgba(242,237,228,.08)' }}>
            <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: '#F2EDE4', transition: 'width .6s ease' }} />
          </div>
          <div className="mt-2 text-[12px]" style={{ color: '#8A8378' }}>{t('Earned with discipline, never volume.', 'Se gana con disciplina, nunca con volumen.')}</div>
        </div>
        <div className="mt-4 flex justify-center"><ToolBelt companion={p.companion} xp={p.xp} onTap={p.onTool} onPet={p.onPet} onPlus={p.onCatalog} onWorld={p.onTraderLand} /></div>

        {/* the squad: pick your avatar */}
        <div className="mt-6">
          <div className="n-label">{t('Your avatar', 'Tu avatar')}</div>
          <div className="n-squad mt-3">
            {COMPANIONS.map((c) => {
              const unlocked = p.level.number >= c.requiredLevel;
              const active = c.id === p.companion.id;
              return (
                <button key={c.id} type="button" title={c.label} aria-pressed={active}
                  onClick={() => { sfxTock(); if (unlocked) { setLocked(null); p.onPickCompanion(c); } else setLocked(c); }}
                  className={`n-face ${active ? 'on' : ''} ${unlocked ? '' : 'locked'}`}>
                  <img src={`/mascots/${c.id}.webp`} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
                  {!unlocked && <span className="n-face-lock"><Lock size={11} /></span>}
                  <span className="n-face-name">{c.label}</span>
                </button>
              );
            })}
          </div>
          {locked && (
            <div className="mt-2 text-[13px]" style={{ color: '#A39C91' }}>
              {t(`${locked.label} unlocks at level ${locked.requiredLevel}. You are level ${p.level.number}.`, `${locked.label} se desbloquea en nivel ${locked.requiredLevel}. Vas en nivel ${p.level.number}.`)}
            </div>
          )}
        </div>

        <div className="mt-6 space-y-1">
          <div className="n-label mb-2">{t('Account', 'Cuenta')}</div>
          <div className="n-row"><span className="n-row-ico"><Globe size={16} /></span><span className="flex-1 text-[15px]">{t('Save your progress', 'Guarda tu progreso')}</span><ProgressSync onChoose={p.onSignIn} /></div>
          <Row icon={<ArrowLeftRight size={16} />} label={t('Swap on Base', 'Swap en Base')} detail={t('Your wallet signs every swap', 'Tu wallet firma cada swap')} onClick={p.onSwap}>
            <span className="flex items-center gap-2"><WalletBalancePill onClick={p.onSwap} /><ChevronRight size={16} style={{ color: '#8A8378' }} /></span>
          </Row>
          <Row icon={<MapIcon size={16} />} label="Trader Land" detail={t('Every read plants something', 'Cada lectura planta algo')} onClick={p.onTraderLand} />
          <Row icon={<Grid2x2 size={16} />} label={t('Gear', 'Equipo')} onClick={p.onCatalog} />
          <Row icon={<Grid2x2 size={16} />} label={t('Explore markets', 'Explorar mercados')} onClick={p.onExplore} />
          <Row icon={<Share2 size={16} />} label={t('Share my avatar', 'Compartir mi avatar')} onClick={p.onShare} />
        </div>

        <div className="mt-6 space-y-1">
          <div className="n-label mb-2">{t('Preferences', 'Preferencias')}</div>
          <Row icon={<Mic size={16} />} label={t('Voice', 'Voz')} detail={p.freeVoice ? t('Free: dictation in the browser', 'Gratis: dictado en el navegador') : t('Live voice room', 'Sala de voz en vivo')} onClick={p.onToggleVoiceMode}>
            <span className="n-pill-sm">{p.freeVoice ? t('Free', 'Gratis') : 'Live'}</span>
          </Row>
          <Row icon={p.speakEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />} label={t('Bobby speaks', 'Bobby habla')} onClick={p.onToggleSpeak}>
            <span className="n-pill-sm">{p.speakEnabled ? t('On', 'Sí') : t('Off', 'No')}</span>
          </Row>
          <Row icon={p.muted ? <VolumeX size={16} /> : <Volume2 size={16} />} label={t('Sounds', 'Sonidos')} onClick={p.onToggleSounds}>
            <span className="n-pill-sm">{p.muted ? t('Off', 'No') : t('On', 'Sí')}</span>
          </Row>
          <Row icon={<Globe size={16} />} label={isSpanish() ? 'English' : 'Español'} onClick={() => { try { localStorage.setItem('bobby_lang', isSpanish() ? 'en' : 'es'); } catch { /* private mode */ } window.location.reload(); }} />
          <Row icon={<ShieldAlert size={16} />} label={t('Risk notice', 'Aviso de riesgo')} onClick={p.onRisk} />
          <Row icon={<RotateCcw size={16} />} label={t('Reset progress on this browser', 'Reiniciar progreso en este navegador')} onClick={p.onReset} />
        </div>
      </motion.aside>
    </motion.div>
  );
}
