// The analysis level, in the pattern of Codex's effort control: a small pill in the composer that opens a
// compact card — the level's name in its colour, one line, a bar with the level's gradient and a slow star
// field, a white thumb. Rápido / Profundo / Máximo change what Bobby does (api/_lib/desk-levels.ts); the
// allowance under the bar is the server's meter (/api/bobby-access), never a local guess.
import { useMemo, useState, type CSSProperties } from 'react';
import * as Popover from '@radix-ui/react-popover';
import * as Slider from '@radix-ui/react-slider';
import { ChevronDown, ChevronRight, Layers, RotateCcw, Sparkles, Zap } from 'lucide-react';
import { speechLocale, t } from '@/lib/companions/i18n';
import { sfxTock } from '@/lib/companions/sfx';
import type { AccessState, DeskLevel } from '@/lib/access-client';

export const LEVELS: DeskLevel[] = ['rapido', 'profundo', 'maximo'];
/** Identity hues for the glass and the card: pearl, the brand cyan, the brand violet (the mic glow's own
 *  colours). Never alpha green, red or CIO amber — on this glass those mean a verdict. */
export const LEVEL_HUE: Record<DeskLevel, string> = { rapido: '#E8DFD0', profundo: '#5CE1FF', maximo: '#9A5CFF' };
const NAME_COLOR: Record<DeskLevel, string> = { rapido: '#F2EDE4', profundo: '#8FDFFF', maximo: '#B89BFF' };
const GRADIENT: Record<DeskLevel, string> = {
  rapido: 'linear-gradient(90deg, #5E574F, #9D927F 55%, #D8CDBA)',
  profundo: 'linear-gradient(90deg, #2B4FD6, #3E8BF0 55%, #5CE1FF)',
  maximo: 'linear-gradient(90deg, #4D6BFF, #8B5CFF 55%, #B77BFF)',
};
const ICON = { rapido: Zap, profundo: Layers, maximo: Sparkles } as const;
const LEVEL_KEY = 'bobby:level:v1';

export const levelName = (l: DeskLevel) => (l === 'rapido' ? t('Quick', 'Rápido', 'Rápido') : l === 'profundo' ? t('Deep', 'Profundo', 'Profundo') : t('Max', 'Máximo', 'Máximo'));
const levelLine = (l: DeskLevel) => (l === 'rapido'
  ? t('3 agents · 10 s', '3 agentes · 10 s', '3 agentes · 10 s')
  : l === 'profundo' ? t('More data · 15 s', 'Más datos · 15 s', 'Mais dados · 15 s') : t('Two rounds · 40 s', 'Dos rondas · 40 s', 'Duas rodadas · 40 s'));

export function storedLevel(): DeskLevel {
  try { const v = localStorage.getItem(LEVEL_KEY); return v === 'profundo' || v === 'maximo' ? v : 'rapido'; } catch { return 'rapido'; }
}
export function storeLevel(l: DeskLevel) { try { localStorage.setItem(LEVEL_KEY, l); } catch { /* private mode */ } }

/** Gifts from coupons or the owner dashboard are spent after the regular allowance. */
const gift = (n: number | undefined) => (n && n > 0 ? ` +${n}` : '');
export interface Allowance { text: string; state: 'open' | 'locked' | 'empty'; resetsAt: string | null }
/** What this level has left for this reader, from the server's meters. */
export function allowanceFor(level: DeskLevel, s: AccessState | null): Allowance | null {
  if (!s) return null;
  const tier = s.levels?.tier ?? s.access.tier;
  const unit = (days: number) => (tier === 'anon' ? t('trial', 'prueba', 'teste') : days <= 7 ? t('week', 'semana', 'semana') : t('month', 'mes', 'mês'));
  if (level === 'rapido') {
    const a = s.access;
    if (a.tier === 'pro' || !a.paywall || a.remaining === null || a.limit === null) {
      const gifted = a.bonus && a.bonus > 0
        ? t(` · ${a.bonus} gifted`, ` · ${a.bonus} de regalo`, ` · ${a.bonus} de presente`)
        : '';
      return { text: t('Unlimited', 'Sin límite', 'Sem limite') + gifted, state: 'open', resetsAt: null };
    }
    return { text: `${a.remaining}/${a.limit}${gift(a.bonus)} · ${a.tier === 'anon' ? unit(30) : unit(7)}`, state: a.remaining + (a.bonus ?? 0) > 0 ? 'open' : 'empty', resetsAt: a.resetsAt };
  }
  const m = s.levels?.levels[level];
  if (!m) return null;
  if (m.limit === 0) return { text: t('With your free account', 'Con tu cuenta gratis', 'Com sua conta grátis'), state: 'locked', resetsAt: null };
  return { text: `${m.remaining}/${m.limit}${gift(m.bonus)} · ${unit(m.windowDays)}`, state: m.remaining + (m.bonus ?? 0) > 0 ? 'open' : 'empty', resetsAt: m.resetsAt };
}

const STEPS: Array<{ min: number; title: () => string; sub: () => string }> = [
  { min: 0, title: () => t('Reads the 1-hour price', 'Lee el precio en velas de 1 hora', 'Lê o preço em velas de 1 hora'), sub: () => t('Trend, RSI, support and resistance', 'Tendencia, RSI, soporte y resistencia', 'Tendência, RSI, suporte e resistência') },
  { min: 0, title: () => t('Alpha, Red Team and the CIO debate', 'Alpha, Red Team y CIO debaten', 'Alpha, Red Team e CIO debatem'), sub: () => t('And it tells you what is missing for your horizon', 'Y te dice qué falta para tu plazo', 'E diz o que falta para o seu prazo') },
  { min: 1, title: () => t('Adds higher timeframes and derivatives', 'Suma marcos de tiempo mayores y derivados', 'Soma prazos maiores e derivativos'), sub: () => t('4H · daily · weekly, funding and open interest', '4H · diario · semanal, funding e interés abierto', '4H · diário · semanal, funding e open interest') },
  { min: 1, title: () => t("Remembers Bobby's calls on the asset", 'Recuerda las llamadas de Bobby en ese activo', 'Lembra as chamadas do Bobby no ativo'), sub: () => t('What happened last time', 'Qué pasó la última vez', 'O que aconteceu da última vez') },
  { min: 2, title: () => t('A second round', 'Segunda ronda', 'Segunda rodada'), sub: () => t('Alpha answers Red Team before the CIO decides', 'Alpha le responde a Red Team antes de que decida el CIO', 'Alpha responde ao Red Team antes de o CIO decidir') },
  { min: 2, title: () => t('Scenarios', 'Escenarios', 'Cenários'), sub: () => t('What would confirm it and what would invalidate it', 'Qué lo confirma y qué lo invalida', 'O que confirma e o que invalida') },
];

interface Props {
  level: DeskLevel;
  onChange: (level: DeskLevel) => void;
  state: AccessState | null;
  disabled?: boolean;
  onSignIn: () => void;
  onInvite: () => void;
}

export default function LevelControl({ level, onChange, state, disabled, onSignIn, onInvite }: Props) {
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const idx = LEVELS.indexOf(level);
  const Icon = ICON[level];
  const allowance = allowanceFor(level, state);
  const tier = state?.levels?.tier ?? state?.access.tier ?? 'anon';
  const stars = useMemo(() => Array.from({ length: 16 }, () => {
    const z = Math.random();
    return { left: Math.random() * 96 + 1, top: Math.random() * 70 + 15, size: 1 + z * 1.3, o: 0.45 + z * 0.5, d: 2.4 + Math.random() * 3, dl: Math.random() * 5 };
  }), []);
  const pick = (l: DeskLevel) => { if (l !== level) { sfxTock(); onChange(l); } };
  const resetDate = allowance?.resetsAt ? new Date(allowance.resetsAt).toLocaleDateString(speechLocale(), { month: 'short', day: 'numeric' }) : null;

  return (
    <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setMore(false); }}>
      <Popover.Trigger asChild>
        <button type="button" className="n-lvl" disabled={disabled} aria-label={t(`Analysis level: ${levelName(level)}`, `Nivel de análisis: ${levelName(level)}`, `Nível de análise: ${levelName(level)}`)}>
          <Icon size={13} style={{ color: NAME_COLOR[level] }} aria-hidden="true" />
          <span className="n-lvl-lab">{levelName(level)}</span>
          <ChevronDown size={11} className="n-lvl-chev" aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" align="center" sideOffset={12} collisionPadding={12} className="n-lvcard"
          style={{ '--lv': LEVEL_HUE[level] } as CSSProperties} aria-label={t('Analysis level', 'Nivel de análisis', 'Nível de análise')}>
          <div className="n-lvcard-h">
            <Icon size={13} style={{ color: NAME_COLOR[level] }} aria-hidden="true" />
            <button type="button" className="n-lvcard-name" style={{ color: NAME_COLOR[level] }} aria-expanded={more} onClick={() => setMore((m) => !m)}
              title={t('What this level does', 'Qué hace este nivel', 'O que este nível faz')}>
              {levelName(level)}<ChevronRight size={11} className="n-lvcard-chev" aria-hidden="true" />
            </button>
            <button type="button" className="n-lvcard-reset" onClick={() => pick('rapido')} aria-label={t('Back to Quick', 'Volver a Rápido', 'Voltar ao Rápido')} title={t('Back to Quick', 'Volver a Rápido', 'Voltar ao Rápido')}>
              <RotateCcw size={13} />
            </button>
          </div>
          <Slider.Root className="n-lvtrack" min={0} max={2} step={1} value={[idx]} onValueChange={([v]) => pick(LEVELS[v] ?? 'rapido')}
            aria-label={t('Analysis level', 'Nivel de análisis', 'Nível de análise')}>
            <Slider.Track className="n-lvtrack-bg">
              <span className="n-lvnotch" style={{ left: 14 }} /><span className="n-lvnotch" style={{ left: '50%' }} /><span className="n-lvnotch" style={{ left: 'calc(100% - 14px)' }} />
              <span className="n-lvfill" style={{ background: GRADIENT[level], '--p': idx / 2 } as CSSProperties}>
                {stars.map((s, i) => (
                  <i key={i} style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size, '--o': s.o, '--d': `${s.d}s`, '--dl': `-${s.dl}s` } as CSSProperties} />
                ))}
              </span>
            </Slider.Track>
            <Slider.Thumb className="n-lvthumb" aria-valuetext={levelName(level)} />
          </Slider.Root>
          <div className="n-lvfoot">
            <span className="n-lvfoot-what">{allowance?.state === 'locked' ? allowance.text : levelLine(level)}</span>
            {allowance?.state === 'locked' || (allowance?.state === 'empty' && tier === 'anon')
              ? <button type="button" className="n-lvfoot-cta" onClick={() => { setOpen(false); onSignIn(); }}>{t('Create account', 'Crear cuenta', 'Criar conta')}</button>
              : allowance?.state === 'empty' && tier === 'free'
                ? <button type="button" className="n-lvfoot-cta" onClick={() => { setOpen(false); onInvite(); }}>{t('Invite a friend', 'Invitar amigo', 'Convidar amigo')}</button>
                : allowance?.state === 'empty' && resetDate
                  ? <span className="n-lvfoot-q">{t(`back ${resetDate}`, `vuelve ${resetDate}`, `volta ${resetDate}`)}</span>
                  : allowance ? <span className="n-lvfoot-q">{allowance.text}</span> : null}
          </div>
          {more && (
            <div className="n-lvrows">
              {STEPS.map((s, i) => (
                <div key={i} className={`n-lvrow ${s.min <= idx ? 'on' : 'off'}`}>
                  <i /><span><b>{s.title()}</b><small>{s.sub()}</small></span>
                </div>
              ))}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
