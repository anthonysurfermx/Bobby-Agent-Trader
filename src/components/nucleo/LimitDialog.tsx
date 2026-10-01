// The pop-up when an allowance runs out — the network loop of 2026-09-29:
//   · without an account → create your free account (Apple or Google); the question waits and runs after;
//   · with a free account → Bobby Pro, or invite a friend (five slots, Pro days for each friend who joins);
//   · Bobby Pro out of a level for the month → when it comes back, and the level below to keep going.
// Every number is the server's (the meter and /api/bobby-access `plans`).
import { useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { track } from '@/lib/track';
import { X } from 'lucide-react';
import { isPortuguese, t } from '@/lib/companions/i18n';
import type { AccessState, DeskLevel } from '@/lib/access-client';
import InvitePanel from './InvitePanel';
import { LEVEL_HUE, levelName } from './LevelControl';

export interface LimitState { kind: 'signin' | 'upgrade' | 'exhausted'; level: DeskLevel; resetsAt: string | null }

interface Props {
  limit: LimitState | null;
  state: AccessState | null;
  billing: { busy: boolean; error: string | null };
  onClose: () => void;
  onSignIn: () => void;
  onSubscribe: () => void;
  onLevel: (level: DeskLevel) => void;
}

export default function LimitDialog({ limit, state, billing, onClose, onSignIn, onSubscribe, onLevel }: Props) {
  // The paywall (or the invite offer) was shown: one funnel event per opening.
  useEffect(() => { if (limit) track('paywall_view', 'desk'); }, [limit]);
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(isPortuguese() ? 'pt-BR' : undefined, { weekday: 'long', month: 'short', day: 'numeric' }) : null);
  const free = state?.plans?.limits.free;
  const pro = state?.plans?.limits.pro;
  const name = limit ? levelName(limit.level) : '';
  const back = date(limit?.resetsAt ?? null);
  const lower: DeskLevel = limit?.level === 'maximo' ? 'profundo' : 'rapido';
  const perWeek = state?.plans?.freeReadsPerWeek ?? null;
  // Pro is offered only where it can be bought; until then the way to Pro is a friend.
  const canBuy = !!state?.payments.stripe;
  const freeReads = perWeek ? t(`${perWeek} free reads a week`, `${perWeek} lecturas gratis por semana`, `${perWeek} leituras grátis por semana`) : t('unlimited reads', 'lecturas sin límite', 'leituras sem limite');

  return (
    <Dialog.Root open={!!limit} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="n-dlg-overlay" />
        <Dialog.Content className="n-dlg" style={{ ['--lv' as string]: limit ? LEVEL_HUE[limit.level] : LEVEL_HUE.rapido }} aria-describedby={undefined}>
          <Dialog.Close className="n-dlg-x" aria-label={t('Close', 'Cerrar', 'Fechar')}><X size={15} /></Dialog.Close>
          {limit?.kind === 'signin' && (
            <>
              <div className="n-label">{t('Free account', 'Cuenta gratis', 'Conta grátis')}</div>
              <Dialog.Title className="n-dlg-title">{t('Create your free account to keep going.', 'Crea tu cuenta gratis para seguir.', 'Crie sua conta grátis para continuar.')}</Dialog.Title>
              <p className="n-dlg-copy">
                {free
                  ? t(`With an account: ${freeReads}, ${free.profundo[0]} Deep and ${free.maximo[0]} Max every week, and your XP saved on the web and the iPhone. Your question runs as soon as you are in.`,
                    `Con tu cuenta: ${freeReads}, ${free.profundo[0]} Profundo y ${free.maximo[0]} Máximo cada semana, y tu XP guardado en la web y el iPhone. Tu pregunta corre en cuanto entres.`,
                    `Com sua conta: ${freeReads}, ${free.profundo[0]} Profundo e ${free.maximo[0]} Máximo por semana, e seu XP salvo na web e no iPhone. Sua pergunta roda assim que você entrar.`)
                  : t('Your question runs as soon as you are in.', 'Tu pregunta corre en cuanto entres.', 'Sua pergunta roda assim que você entrar.')}
              </p>
              <button type="button" className="n-cta on mt-6" onClick={onSignIn}>{t('Continue with Apple or Google', 'Continuar con Apple o Google', 'Continuar com Apple ou Google')}</button>
            </>
          )}
          {limit?.kind === 'upgrade' && (
            <>
              <div className="n-label">{limit.level === 'rapido' ? t('Free reads', 'Lecturas gratis', 'Leituras grátis') : name}</div>
              <Dialog.Title className="n-dlg-title">
                {limit.level === 'rapido'
                  ? t('You used your free reads for this week.', 'Ya usaste tus lecturas gratis de esta semana.', 'Você já usou suas leituras grátis desta semana.')
                  : t(`You used your ${name} for this week.`, `Ya usaste tu ${name} de esta semana.`, `Você já usou seu ${name} desta semana.`)}
              </Dialog.Title>
              <p className="n-dlg-copy">
                {canBuy
                  ? t('Two ways to keep going.', 'Dos formas de seguir.', 'Duas formas de continuar.')
                  : t('Invite a friend and unlock Bobby Pro.', 'Invita a un amigo y desbloquea Bobby Pro.', 'Convide um amigo e desbloqueie o Bobby Pro.')}
                {back ? t(` Or wait: it comes back ${back}.`, ` O espera: vuelve el ${back}.`, ` Ou espere: volta em ${back}.`) : ''}
              </p>
              {canBuy && <><div className="n-dlg-pro">
                <div>
                  <b>Bobby Pro · {t('$5/month', '$5/mes', '$5/mês')}</b>
                  <small>{pro ? t(`Unlimited reads, ${pro.profundo[0]} Deep and ${pro.maximo[0]} Max a month.`, `Lecturas sin límite, ${pro.profundo[0]} Profundo y ${pro.maximo[0]} Máximo al mes.`, `Leituras sem limite, ${pro.profundo[0]} Profundo e ${pro.maximo[0]} Máximo por mês.`) : ''}</small>
                </div>
                <button type="button" className="n-dlg-pro-btn" disabled={billing.busy} onClick={onSubscribe}>
                  {billing.busy ? t('Opening…', 'Abriendo…', 'Abrindo…') : t('Get Pro', 'Obtener Pro', 'Assinar')}
                </button>
              </div>
              {billing.error && <p role="alert" className="mt-2 text-[13px]" style={{ color: '#FFB3B5' }}>{billing.error}</p>}
              <div className="n-dlg-or"><span>{t('or', 'o', 'ou')}</span></div></>}
              <InvitePanel state={state} onSignIn={onSignIn} />
            </>
          )}
          {limit?.kind === 'exhausted' && (
            <>
              <div className="n-label">{name}</div>
              <Dialog.Title className="n-dlg-title">{t(`You used your ${name} for this month.`, `Ya usaste tu ${name} de este mes.`, `Você já usou seu ${name} deste mês.`)}</Dialog.Title>
              <p className="n-dlg-copy">{back ? t(`It comes back ${back}.`, `Vuelve el ${back}.`, `Volta em ${back}.`) : ''} {t(`${levelName(lower)} is still yours.`, `${levelName(lower)} sigue disponible.`, `${levelName(lower)} continua disponível.`)}</p>
              <button type="button" className="n-cta on mt-6" onClick={() => { onLevel(lower); onClose(); }}>{t(`Continue with ${levelName(lower)}`, `Seguir con ${levelName(lower)}`, `Continuar com ${levelName(lower)}`)}</button>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
