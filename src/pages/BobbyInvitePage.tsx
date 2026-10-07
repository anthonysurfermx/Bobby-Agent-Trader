import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { lang, speechLocale, type Lang } from '@/lib/companions/i18n';
import { storeReferral } from '@/lib/access-client';
import { APP_STORE_URL } from '@/lib/app-store';
import { IOS_INVITE_LIVE, appInviteUrl, inviteCodeFrom, inviteDevice, inviteLayout, smartBannerContent, type InviteDevice } from '@/lib/invite-link';

/**
 * /i/CODE — where a friend's invitation link lands (the link is built in api/_lib/referrals.ts).
 * The page keeps the code in this browser, exactly as /desk?ref=CODE does, shows it so it survives an install,
 * and sends a phone to the app or to the store. An iPhone with Bobby 1.8 never sees it: the same path is a
 * universal link (public/.well-known/apple-app-site-association) and opens the app directly. So the iPhones that
 * do land here have no app yet, or are inside another app's browser: the App Store is their first button, and the
 * bobbyprotocol:// link (an error in Safari when Bobby is not installed) is the second, named for who it serves.
 * Until the App Store serves 1.8 (IOS_INVITE_LIVE), an iPhone gets the web-first page instead: older versions
 * cannot accept an invitation, the web desk can.
 * Only the inviter receives something today, so nothing here promises the friend a reward.
 * One language per visit: ?lang=en|es|fr|pt|it|de, else the stored or browser language.
 */
type Copy = Record<Lang, string>;
const COPY = {
  title: { en: 'A friend invited you to Bobby', es: 'Un amigo te invitó a Bobby', fr: 'Un ami t’a invité sur Bobby', pt: 'Um amigo convidou-te para o Bobby', it: 'Un amico ti ha invitato su Bobby', de: 'Ein Freund hat dich zu Bobby eingeladen' },
  lead: {
    en: 'Ask about a stock or a crypto asset. Three AI agents debate it and tell you what to review and what to wait for.',
    es: 'Pregunta por una acción o un criptoactivo. Tres agentes de IA lo debaten y te dicen qué revisar y qué esperar.',
    fr: 'Pose une question sur une action ou un cryptoactif. Trois agents d’IA en débattent et te disent quoi réexaminer et quoi attendre.',
    pt: 'Pergunta sobre uma ação ou um criptoativo. Três agentes de IA debatem-no e dizem-te o que rever e o que esperar.',
    it: 'Chiedi di un’azione o di una criptoattività. Tre agenti IA ne discutono e ti dicono cosa riesaminare e cosa attendere.',
    de: 'Frag nach einer Aktie oder einem Krypto-Asset. Drei KI-Agenten diskutieren darüber und sagen dir, was du prüfen und was du abwarten solltest.',
  },
  disclaimer: { en: 'Education, not financial advice.', es: 'Educación, no asesoría financiera.', fr: 'Éducation, pas de conseil financier.', pt: 'Educação, não aconselhamento financeiro.', it: 'Educazione, non consulenza finanziaria.', de: 'Bildung, keine Finanzberatung.' },
  codeLabel: { en: 'Invitation code', es: 'Código de invitación', fr: 'Code d’invitation', pt: 'Código de convite', it: 'Codice invito', de: 'Einladungscode' },
  copy: { en: 'Copy code', es: 'Copiar código', fr: 'Copier le code', pt: 'Copiar código', it: 'Copia codice', de: 'Code kopieren' },
  copied: { en: 'Copied', es: 'Copiado', fr: 'Copié', pt: 'Copiado', it: 'Copiato', de: 'Kopiert' },
  open: { en: 'Already have Bobby? Open the app', es: '¿Ya tienes Bobby? Abre la app', fr: 'Tu as déjà Bobby ? Ouvre l’app', pt: 'Já tens o Bobby? Abre a app', it: 'Hai già Bobby? Apri l’app', de: 'Du hast Bobby schon? App öffnen' },
  store: { en: 'Get Bobby on the App Store', es: 'Consigue Bobby en el App Store', fr: 'Obtenir Bobby sur l’App Store', pt: 'Obter o Bobby na App Store', it: 'Scarica Bobby su App Store', de: 'Bobby im App Store laden' },
  step1: { en: 'Install Bobby and create your account.', es: 'Instala Bobby y crea tu cuenta.', fr: 'Installe Bobby et crée ton compte.', pt: 'Instala o Bobby e cria a tua conta.', it: 'Installa Bobby e crea il tuo account.', de: 'Installiere Bobby und erstelle dein Konto.' },
  step2: {
    en: 'Tap your friend’s link again, or type the code in Profile, Credits, Invite friends.',
    es: 'Toca de nuevo el link de tu amigo, o escribe el código en Perfil, Créditos, Invita amigos.',
    fr: 'Touche à nouveau le lien de ton ami, ou saisis le code dans Profil, Crédits, Inviter des amis.',
    pt: 'Toca de novo na ligação do teu amigo, ou escreve o código em Perfil, Créditos, Convidar amigos.',
    it: 'Tocca di nuovo il link del tuo amico, oppure scrivi il codice in Profilo, Crediti, Invita amici.',
    de: 'Tippe noch einmal auf den Link deines Freundes oder gib den Code unter Profil, Credits, Freunde einladen ein.',
  },
  android: {
    en: 'Type this code in Bobby under Invite friends.',
    es: 'Escribe este código en Bobby, en Invita amigos.',
    fr: 'Saisis ce code dans Bobby, sous Inviter des amis.',
    pt: 'Escreve este código no Bobby, em Convidar amigos.',
    it: 'Scrivi questo codice in Bobby, in Invita amici.',
    de: 'Gib diesen Code in Bobby unter Freunde einladen ein.',
  },
  web: { en: 'Continue on the web', es: 'Continuar en la web', fr: 'Continuer sur le web', pt: 'Continuar na web', it: 'Continua sul web', de: 'Im Web fortfahren' },
  invalidTitle: { en: 'Invitation link', es: 'Link de invitación', fr: 'Lien d’invitation', pt: 'Ligação de convite', it: 'Link di invito', de: 'Einladungslink' },
  invalid: {
    en: 'This invitation link is not valid. Ask your friend to share it again.',
    es: 'Este link de invitación no es válido. Pídele a tu amigo que lo comparta de nuevo.',
    fr: 'Ce lien d’invitation n’est pas valide. Demande à ton ami de le partager à nouveau.',
    pt: 'Esta ligação de convite não é válida. Pede ao teu amigo para a partilhar de novo.',
    it: 'Questo link di invito non è valido. Chiedi al tuo amico di condividerlo di nuovo.',
    de: 'Dieser Einladungslink ist nicht gültig. Bitte deinen Freund, ihn noch einmal zu teilen.',
  },
} satisfies Record<string, Copy>;

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#5CE1FF] focus-visible:outline-offset-2';
const primary = `min-h-[50px] w-full rounded-xl bg-[#F2EDE4] px-4 py-3 text-center text-[15px] font-medium text-[#0B0A09] no-underline flex items-center justify-center ${focus}`;
const secondary = `min-h-[50px] w-full rounded-xl border border-[rgba(242,237,228,0.14)] bg-black px-4 py-3 text-center text-[15px] font-medium text-[#F2EDE4] no-underline flex items-center justify-center ${focus}`;
const quiet = `min-h-[44px] self-start flex items-center text-[15px] text-[#F2EDE4] underline underline-offset-4 ${focus}`;

export interface InviteViewProps {
  /** A valid invite code, or null when the link carries none. */
  code: string | null;
  device: InviteDevice;
  language: Lang;
  /** Whether the iPhone app in the store accepts invitations (IOS_INVITE_LIVE). Tests pass both. */
  appInvites?: boolean;
}

/**
 * "Continue on the web": the desk, which reads the code this page stored. A browser that refuses storage cannot
 * hold an invitation on the web at all (the desk would drop a code in its address the same way), so there is no
 * second route to pretend with; the code stays on screen for the app.
 */
const WEB_HREF = '/desk';

/** The page itself, from plain values: no storage, no router, no network. */
export function InviteView({ code, device, language, appInvites = IOS_INVITE_LIVE }: InviteViewProps) {
  const t = (c: Copy) => c[language];
  const [copied, setCopied] = useState(false);
  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* no clipboard: the code on screen can be selected */ }
  };
  // The store this repository can name is Apple's. An Android phone gets no store button rather than a guessed one.
  const storeButton = device !== 'android';
  const layout = inviteLayout(device, appInvites);

  return (
    <main className="min-h-[100svh] bg-[#0B0A09] text-[#F2EDE4] flex items-center justify-center px-4 py-12" data-invite-device={device} data-invite-layout={layout}>
      <div className="w-full max-w-[380px] flex flex-col gap-4">
        <a href="/" className="text-[22px] tracking-[-0.04em] text-[#F2EDE4] no-underline mb-6 self-start">Bobby</a>

        {code ? (
          <>
            <h1 className="m-0 text-[34px] leading-[1.05] tracking-[-0.045em] font-light">{t(COPY.title)}</h1>
            <p className="m-0 text-[15px] leading-relaxed text-[#A39C91]">{t(COPY.lead)}</p>

            <div className="mt-2 rounded-xl border border-[rgba(242,237,228,0.1)] px-4 py-4 flex flex-col gap-3">
              <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[#8A8378]">{t(COPY.codeLabel)}</span>
              <span data-invite-code className="font-mono text-[30px] leading-none tracking-[0.14em] text-[#FFF8EC] select-all break-all">{code}</span>
              <button type="button" onClick={() => void copyCode()} className={secondary}>
                <span aria-live="polite">{copied ? t(COPY.copied) : t(COPY.copy)}</span>
              </button>
            </div>

            {layout === 'app' && (
              <>
                <a href={APP_STORE_URL} className={primary} data-invite-action="store">{t(COPY.store)}</a>
                <a href={appInviteUrl(code)} className={secondary} data-invite-action="open-app">{t(COPY.open)}</a>
                <ol className="m-0 mt-1 list-decimal pl-5 flex flex-col gap-2 text-[14px] leading-relaxed text-[#A39C91]">
                  <li>{t(COPY.step1)}</li>
                  <li>{t(COPY.step2)}</li>
                </ol>
                <a href={WEB_HREF} className={quiet} data-invite-action="web">{t(COPY.web)}</a>
              </>
            )}

            {layout === 'android' && (
              <>
                <p className="m-0 text-[14px] leading-relaxed text-[#A39C91]">{t(COPY.android)}</p>
                <a href={WEB_HREF} className={primary} data-invite-action="web">{t(COPY.web)}</a>
              </>
            )}

            {layout === 'web' && (
              <>
                <a href={WEB_HREF} className={primary} data-invite-action="web">{t(COPY.web)}</a>
                <a href={APP_STORE_URL} className={secondary} data-invite-action="store">{t(COPY.store)}</a>
              </>
            )}
          </>
        ) : (
          <>
            <h1 className="m-0 text-[34px] leading-[1.05] tracking-[-0.045em] font-light">{t(COPY.invalidTitle)}</h1>
            <p role="alert" className="m-0 mb-2 text-[15px] leading-relaxed text-[#A39C91]">{t(COPY.invalid)}</p>
            {storeButton && <a href={APP_STORE_URL} className={primary} data-invite-action="store">{t(COPY.store)}</a>}
            <a href={WEB_HREF} className={storeButton ? secondary : primary} data-invite-action="web">{t(COPY.web)}</a>
          </>
        )}

        <p className="m-0 mt-4 text-[13px] text-[#8A8378]">{t(COPY.disclaimer)}</p>
      </div>
    </main>
  );
}

export default function BobbyInvitePage({ appInvites = IOS_INVITE_LIVE }: { appInvites?: boolean }) {
  const params = useParams();
  const code = inviteCodeFrom(params.code);
  const language = lang();
  // The one write: the same storage the desk reads, so a friend who continues on the web is credited as before.
  // An invalid link stores nothing, and a browser that refuses storage keeps nothing (see WEB_HREF).
  useState(() => (code ? storeReferral(code) : null));
  const [device] = useState(() => inviteDevice(navigator.userAgent, navigator.maxTouchPoints));
  // Safari's banner sends an iPhone to the App Store from the top of the page. With an invitation at stake it
  // waits, like the app-first layout, for an app that can accept it.
  const banner = code && !appInvites ? null : smartBannerContent(code ? `${window.location.origin}/i/${code}` : null);

  return (
    <>
      <Helmet>
        <html lang={speechLocale()} />
        <title>{`${COPY[code ? 'title' : 'invalidTitle'][language]} | Bobby`}</title>
        <meta name="robots" content="noindex" />
        {banner && <meta name="apple-itunes-app" content={banner} />}
      </Helmet>
      <InviteView code={code} device={device} language={language} appInvites={appInvites} />
    </>
  );
}
