// The profile: where the avatars live now. The glass is the protagonist of the desk; your
// companion, its level, gear and pet, the squad you unlock with discipline, your account,
// wallet, Trader Land and the preferences all sit behind the avatar in the top-right corner,
// the way the iPhone app keeps them behind its header face.
import { useState, type ReactNode, type RefObject } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeftRight, Brain, ChevronRight, Compass, Globe, Grid2x2, Lock, LogIn, LogOut, Map as MapIcon, Mic, RotateCcw, Share2, ShieldAlert, Sparkles, UserPlus, Volume2, VolumeX, X } from 'lucide-react';
import BobbyMascot3D from '@/components/kinetic/BobbyMascot3D';
import { DEFAULT_MASCOT } from '@/lib/mascot';
import { COMPANIONS, nextLevelFor, type Companion, type CompanionLevel, type CompanionTool } from '@/lib/companions/data';
import { LANG_NAME, lang, pick, t } from '@/lib/companions/i18n';
import { sfxTock } from '@/lib/companions/sfx';
import { ToolBelt } from '@/components/companion/CompanionOverlays';
import ProgressSync from '@/components/companion/ProgressSync';
import { useBobbyAccount } from '@/hooks/useBobbyAccount';
import { WalletBalancePill } from '@/components/companion/DeskWallet';
import { LangSegment } from './LangMenu';
import MemoryDialog from './MemoryDialog';

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
  /** Every memory state the dialog loads or changes, so the desk greeting follows the name at once. */
  onMemoryState?: (state: import('@/lib/memory-client').MemoryState | null) => void;
  /** After sign-out: refresh access and meters. */
  onSignedOut: () => void;
  onRisk: () => void;
  onToggleVoiceMode: () => void;
  onToggleSpeak: () => void;
  onToggleSounds: () => void;
  onReset: () => void;
  pro: { label: string; detail: string; action: () => void };
  /** Invite friends: five slots, Bobby Pro for each friend who joins. */
  invite: { label: string; detail: string; action: () => void };
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
  const [memoryOpen, setMemoryOpen] = useState(false);
  const { account, signOut } = useBobbyAccount();
  const next = nextLevelFor(p.xp);
  const progress = next ? Math.max(0, Math.min(1, (p.xp - p.level.minXP) / (next.minXP - p.level.minXP))) : 1;

  return (
    <motion.div key="profile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]" onClick={p.onClose}>
      <motion.aside
        initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        className="n-drawer" onClick={(e) => e.stopPropagation()} aria-label={t('Your profile', 'Tu perfil', 'Seu perfil')}
      >
        <div className="flex items-center justify-between">
          <span className="n-label">{t('Profile', 'Perfil', 'Perfil')}</span>
          <button type="button" onClick={p.onClose} className="n-iconbtn" aria-label={t('Close', 'Cerrar', 'Fechar')}><X size={16} /></button>
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
            <span className="n-label">{t('Level', 'Nivel', 'Nível')} {p.level.number} · {p.level.name}</span>
            <span className="n-label">{p.xp} XP{next ? ` / ${next.minXP}` : ''}</span>
          </div>
          <div className="mt-2 h-[3px] overflow-hidden rounded-full" style={{ background: 'rgba(242,237,228,.08)' }}>
            <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: '#F2EDE4', transition: 'width .6s ease' }} />
          </div>
          <div className="mt-2 text-[12px]" style={{ color: '#8A8378' }}>{t('Earned with discipline, never volume.', 'Se gana con disciplina, nunca con volumen.', 'Conquistado com disciplina, nunca com volume.')}</div>
        </div>
        <div className="mt-4 flex justify-center"><ToolBelt companion={p.companion} xp={p.xp} onTap={p.onTool} onPet={p.onPet} onPlus={p.onCatalog} onWorld={p.onTraderLand} /></div>

        {/* the squad: pick your avatar */}
        <div className="mt-6">
          <div className="n-label">{t('Your avatar', 'Tu avatar', 'Seu avatar')}</div>
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
              {t(`${locked.label} unlocks at level ${locked.requiredLevel}. You are level ${p.level.number}.`, `${locked.label} se desbloquea en nivel ${locked.requiredLevel}. Vas en nivel ${p.level.number}.`, `${locked.label} desbloqueia no nível ${locked.requiredLevel}. Você está no nível ${p.level.number}.`)}
            </div>
          )}
        </div>

        <div className="mt-6 space-y-1">
          <div className="n-label mb-2">{t('Account', 'Cuenta', 'Conta')}</div>
          {account ? (
            <>
              <div className="n-row">
                <span className="n-row-ico"><Globe size={16} /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px]">{account.provider === 'apple' ? t('Signed in with Apple', 'Sesión con Apple', 'Conectado com Apple') : account.provider === 'google' ? t('Signed in with Google', 'Sesión con Google', 'Conectado com Google') : t('Signed in', 'Sesión iniciada', 'Conectado')}</span>
                  {account.email && <span className="block truncate text-[12px]" style={{ color: '#8A8378' }}>{account.email}</span>}
                </span>
                <ProgressSync onChoose={p.onSignIn} />
              </div>
              <Row icon={<LogOut size={16} />} label={t('Sign out', 'Cerrar sesión', 'Sair')} detail={t('Your progress stays saved in your account', 'Tu progreso queda guardado en tu cuenta', 'Seu progresso fica salvo na sua conta')}
                onClick={() => { if (window.confirm(t('Sign out of Bobby on this browser?', '¿Cerrar sesión de Bobby en este navegador?', 'Sair do Bobby neste navegador?'))) void signOut().then(p.onSignedOut); }} />
            </>
          ) : (
            <>
              <Row icon={<LogIn size={16} />} label={t('Sign in', 'Iniciar sesión', 'Entrar')} detail={t('Google or Apple · keeps your progress', 'Google o Apple · guarda tu progreso', 'Google ou Apple · salva seu progresso')} onClick={p.onSignIn} />
              {/* ProgressSync wires the progress sync (wallet sessions too); it stays mounted, its pill hidden here. */}
              <span className="hidden"><ProgressSync onChoose={p.onSignIn} /></span>
            </>
          )}
          <Row icon={<Sparkles size={16} />} label={p.pro.label} detail={p.pro.detail} onClick={p.pro.action} />
          <Row icon={<UserPlus size={16} />} label={p.invite.label} detail={p.invite.detail} onClick={p.invite.action} />
          <Row icon={<ArrowLeftRight size={16} />} label={t('Swap on Base', 'Swap en Base', 'Swap na Base')} detail={t('Your wallet signs every swap', 'Tu wallet firma cada swap', 'Sua carteira assina cada swap')} onClick={p.onSwap}>
            <span className="flex items-center gap-2"><WalletBalancePill onClick={p.onSwap} /><ChevronRight size={16} style={{ color: '#8A8378' }} /></span>
          </Row>
          <Row icon={<MapIcon size={16} />} label="Trader Land" detail={t('Every read plants something', 'Cada lectura planta algo', 'Cada leitura planta algo')} onClick={p.onTraderLand} />
          <Row icon={<Grid2x2 size={16} />} label={t('Gear', 'Equipo', 'Equipamento')} onClick={p.onCatalog} />
          <Row icon={<Compass size={16} />} label={t('Explore markets', 'Explorar mercados', 'Explorar mercados')} onClick={p.onExplore} />
          <Row icon={<Share2 size={16} />} label={t('Share my avatar', 'Compartir mi avatar', 'Compartilhar meu avatar')} onClick={p.onShare} />
        </div>

        <div className="mt-6 space-y-1">
          <div className="n-label mb-2">{t('Preferences', 'Preferencias', 'Preferências')}</div>
          <Row icon={<Mic size={16} />} label={t('Voice', 'Voz', 'Voz')} detail={p.freeVoice ? t('Free: dictation in the browser', 'Gratis: dictado en el navegador', 'Grátis: ditado no navegador') : t('Live voice room', 'Sala de voz en vivo', 'Sala de voz ao vivo')} onClick={p.onToggleVoiceMode}>
            <span className="n-pill-sm">{p.freeVoice ? t('Free', 'Gratis', 'Grátis') : 'Live'}</span>
          </Row>
          <Row icon={p.speakEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />} label={t('Bobby speaks', 'Bobby habla', 'Bobby fala')} onClick={p.onToggleSpeak}>
            <span className="n-pill-sm">{p.speakEnabled ? t('On', 'Sí', 'Ligado') : t('Off', 'No', 'Desligado')}</span>
          </Row>
          <Row icon={p.muted ? <VolumeX size={16} /> : <Volume2 size={16} />} label={t('Sounds', 'Sonidos', 'Sons')} onClick={p.onToggleSounds}>
            <span className="n-pill-sm">{p.muted ? t('Off', 'No', 'Desligado') : t('On', 'Sí', 'Ligado')}</span>
          </Row>
          <Row icon={<Globe size={16} />} label={t('Language', 'Idioma', 'Idioma')} detail={LANG_NAME[lang()]}><LangSegment /></Row>
          <Row icon={<Brain size={16} />} label={t('What Bobby remembers', 'Lo que Bobby recuerda', 'O que o Bobby lembra')} detail={t('See, correct or erase it', 'Velo, corrígelo o bórralo', 'Veja, corrija ou apague')} onClick={() => setMemoryOpen(true)} />
          <Row icon={<ShieldAlert size={16} />} label={t('Risk notice', 'Aviso de riesgo', 'Aviso de risco')} onClick={p.onRisk} />
          <Row icon={<RotateCcw size={16} />} label={t('Reset progress on this browser', 'Reiniciar progreso en este navegador', 'Zerar o progresso neste navegador')} onClick={p.onReset} />
        </div>
        {/* Inside the drawer, so clicks in the dialog (a portal) bubble to the drawer, not the backdrop that closes it. */}
        <MemoryDialog open={memoryOpen} onOpenChange={setMemoryOpen} onSignIn={() => { setMemoryOpen(false); p.onSignIn(); }} onState={p.onMemoryState} />
      </motion.aside>
    </motion.div>
  );
}
