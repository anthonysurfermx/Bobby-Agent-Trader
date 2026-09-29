// Invite a friend: five slots, your link, and what each friend gives you. A slot fills when a friend
// creates a new account through your link (the server's rule, api/_lib/referrals.ts); every filled slot
// adds Bobby Pro days to yours. The numbers come from /api/bobby-access, never from here.
import { useState } from 'react';
import { Check, Copy, Plus, Share2 } from 'lucide-react';
import { isPortuguese, t } from '@/lib/companions/i18n';
import { sfxSuccess, sfxTock } from '@/lib/companions/sfx';
import type { AccessState } from '@/lib/access-client';

export function rewardLabel(days: number): string {
  if (days % 30 === 0) {
    const months = days / 30;
    return months === 1 ? t('1 month', '1 mes', '1 mês') : t(`${months} months`, `${months} meses`, `${months} meses`);
  }
  return t(`${days} days`, `${days} días`, `${days} dias`);
}

interface Props { state: AccessState | null; onSignIn: () => void }

export default function InvitePanel({ state, onSignIn }: Props) {
  const [copied, setCopied] = useState(false);
  const terms = state?.plans?.referral ?? null;
  const referral = state?.referral ?? null;
  const max = referral?.max ?? terms?.maxFriends ?? 5;
  const reward = rewardLabel(referral?.rewardDays ?? terms?.rewardDays ?? 30);
  const accepted = referral?.accepted ?? 0;
  const proUntil = referral?.proUntil ? new Date(referral.proUntil).toLocaleDateString(isPortuguese() ? 'pt-BR' : undefined, { month: 'long', day: 'numeric' }) : null;
  const link = referral?.url ?? '';
  const shortLink = link.replace(/^https?:\/\//, '');

  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); sfxSuccess(); window.setTimeout(() => setCopied(false), 1800); } catch { /* no clipboard: the link is selectable */ }
  };
  const share = async () => {
    if (!link) return;
    sfxTock();
    const text = t('Bobby: three AI agents debate any stock or crypto before you decide.', 'Bobby: tres agentes de IA debaten cualquier acción o cripto antes de que decidas.', 'Bobby: três agentes de IA debatem qualquer ação ou cripto antes de você decidir.');
    try {
      if (navigator.share) await navigator.share({ title: 'Bobby', text, url: link });
      else await copy();
    } catch { /* cancelled */ }
  };

  return (
    <div className="n-invite">
      <div className="n-invite-h">
        <span className="n-label">{t('Invite friends', 'Invita amigos', 'Convide amigos')}</span>
        <span className="n-label">{accepted}/{max}</span>
      </div>
      <p className="n-invite-copy">
        {t(`Each friend who creates an account through your link gives you ${reward} of Bobby Pro. Up to ${max} friends.`,
          `Cada amigo que crea su cuenta con tu link te da ${reward} de Bobby Pro. Hasta ${max} amigos.`,
          `Cada amigo que cria a conta pelo seu link te dá ${reward} de Bobby Pro. Até ${max} amigos.`)}
      </p>
      <div className="n-slots" role="list" aria-label={t(`${accepted} of ${max} friends joined`, `${accepted} de ${max} amigos se unieron`, `${accepted} de ${max} amigos entraram`)}>
        {Array.from({ length: max }, (_, i) => (
          <span key={i} role="listitem" className={`n-slot ${i < accepted ? 'on' : ''}`} aria-label={i < accepted ? t('Friend joined', 'Amigo unido', 'Amigo entrou') : t('Open slot', 'Espacio libre', 'Espaço livre')}>
            {i < accepted ? <Check size={14} /> : <Plus size={13} />}
          </span>
        ))}
      </div>
      {proUntil && <div className="n-invite-pro">{t(`Bobby Pro until ${proUntil}`, `Bobby Pro hasta el ${proUntil}`, `Bobby Pro até ${proUntil}`)}</div>}
      {state?.signedIn && link ? (
        <div className="n-invite-link">
          <span className="n-invite-url" title={link}>{shortLink}</span>
          <button type="button" className="n-invite-btn" onClick={() => void copy()} aria-label={t('Copy link', 'Copiar link', 'Copiar link')}>{copied ? <Check size={14} /> : <Copy size={14} />}</button>
          <button type="button" className="n-invite-btn on" onClick={() => void share()}><Share2 size={14} />{t('Share', 'Compartir', 'Compartilhar')}</button>
        </div>
      ) : state?.signedIn ? (
        <p className="n-invite-copy">{t('Your link is on its way. Try again in a moment.', 'Tu link está en camino. Inténtalo en un momento.', 'Seu link está a caminho. Tente em instantes.')}</p>
      ) : (
        <button type="button" className="n-cta on mt-4" onClick={onSignIn}>{t('Create your account to get your link', 'Crea tu cuenta para tener tu link', 'Crie sua conta para ter seu link')}</button>
      )}
    </div>
  );
}
