import KineticShell from '@/components/kinetic/KineticShell';
import { Helmet } from 'react-helmet-async';
import { lang } from '@/lib/companions/i18n';

export default function BobbySupportPage() {
  const requested = new URLSearchParams(window.location.search).get('lang');
  const es = requested ? requested === 'es' : lang() === 'es';
  const t = (en: string, spanish: string) => es ? spanish : en;
  return <KineticShell activeTab="terminal" minimalNav showTicker={false} showStatus={false}><main className="min-h-screen bg-[#050505] px-6 py-16 text-white">
    <Helmet><title>{t('Bobby support and community rules', 'Soporte y reglas de Bobby')}</title></Helmet>
    <div className="mx-auto max-w-2xl space-y-8 leading-7">
      <nav className="flex gap-4 text-sm text-green-400"><a href="?lang=en">English</a><a href="?lang=es">Español</a></nav>
      <h1 className="text-3xl font-semibold">{t('How can we help?', '¿Cómo podemos ayudarte?')}</h1>
      <section className="space-y-3">
        <h2 className="text-xl">{t('Contact Bobby', 'Contacta a Bobby')}</h2>
        <p>{t('Open a support request using the link below. GitHub issues are public: include the app version and a description of the issue, never passwords, account details or private screenshots. For a privacy request, ask for a private contact channel first.', 'Abre una solicitud en el enlace de abajo. Los issues de GitHub son públicos: incluye la versión de la app y una descripción del problema, nunca contraseñas, datos de cuentas o capturas privadas. Para una solicitud de privacidad, pide primero un canal de contacto privado.')}</p>
        <a className="inline-block rounded-xl bg-green-400 px-5 py-3 font-semibold text-black" href="https://github.com/anthonysurfermx/Bobby-Agent-Trader/issues/new">{t('Open a support request', 'Abrir una solicitud de soporte')}</a>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl">{t('Trader Land community rules', 'Reglas de la comunidad de Trader Land')}</h2>
        <p>{t('Use respectful names. Hate, sexual content, threats, harassment, impersonation, scams and unwanted advertising are not allowed. Do not publish personal information or contact links. Island names are checked before publication; abusive content can be removed and its creator can lose publishing access.', 'Usa nombres respetuosos. No se permite odio, contenido sexual, amenazas, acoso, suplantación, estafas ni publicidad no solicitada. No publiques datos personales ni enlaces de contacto. Revisamos los nombres antes de publicarlos; podemos retirar contenido abusivo y restringir la publicación de su creador.')}</p>
        <p>{t('While visiting an island, choose “Report or block creator”. Reports go to Bobby’s private review queue. Blocking immediately hides that creator’s island on this device, including after renaming. “Community safety” lets you unblock them. Satoshi Nakamoto is a built-in Bobby showcase, not a user account.', 'Al visitar una isla, elige “Reportar o bloquear creador”. Los reportes llegan a la cola privada de revisión de Bobby. Bloquear oculta de inmediato la isla del creador en este dispositivo, incluso si cambia de nombre. Puedes desbloquearlo en “Seguridad de la comunidad”. Satoshi Nakamoto es una isla de muestra de Bobby, no una cuenta de usuario.')}</p>
      </section>
      <section className="space-y-3"><h2 className="text-xl">{t('Your account and data', 'Tu cuenta y tus datos')}</h2><p>{t('From the desk menu, choose “Delete account” to remove your account and synced progress. You can use Bobby without an account. Avatar narration can be muted from onboarding, the desk or the Squad gallery; the preference is remembered.', 'En el menú de la mesa, elige “Eliminar cuenta” para borrar la cuenta y el progreso sincronizado. Puedes usar Bobby sin cuenta. Puedes silenciar la narración desde el onboarding, la mesa o la galería Squad; la preferencia se recuerda.')}</p><a className="text-green-400 underline" href={`/privacy?lang=${es ? 'es' : 'en'}`}>{t('Privacy policy', 'Aviso de privacidad')}</a></section>
    </div>
  </main></KineticShell>;
}
