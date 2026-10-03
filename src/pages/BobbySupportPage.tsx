import { useState, type FormEvent } from 'react';
import KineticShell from '@/components/kinetic/KineticShell';
import { Helmet } from 'react-helmet-async';
import { lang, LANGS, LANG_NAME, htmlLang, translateText, type Lang } from '@/lib/companions/i18n';
import { appLanguage, isAppLanguage } from '@/lib/app-language';
import { clientLanguagePath } from '@/lib/client-language';

type SupportRequest = { message: string; email: string; language: Lang; kind: string };

/** A successful HTTP response alone is not proof that the private queue saved the request. */
export async function sendSupportRequest(request: SupportRequest): Promise<void> {
  const response = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'general', message: request.message.trim(), page: '/support',
      ...(request.email.trim() ? { user_email: request.email.trim() } : {}),
      context: { language: request.language, request_kind: request.kind },
    }),
    signal: AbortSignal.timeout(15000),
  });
  const receipt = await response.json().catch(() => null) as { ok?: boolean; saved?: boolean } | null;
  if (!response.ok || receipt?.ok !== true || receipt.saved !== true) {
    throw new Error('Support request was not confirmed as saved');
  }
}

export default function BobbySupportPage() {
  const requested = new URLSearchParams(window.location.search).get('lang');
  const language = isAppLanguage(requested?.toLowerCase().split(/[-_]/)[0]) ? appLanguage(requested) : lang();
  const t = (en: string, spanish: string) => language === 'es' ? spanish : translateText(language, en);
  const android = new URLSearchParams(window.location.search).get('platform') === 'android';
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [kind, setKind] = useState('support');
  const [status, setStatus] = useState<'idle' | 'sending' | 'saved' | 'error'>('idle');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'sending' || message.trim().length < 3) return;
    setStatus('sending');
    try {
      await sendSupportRequest({ message, email, kind, language });
      setStatus('saved');
      setMessage('');
    } catch { setStatus('error'); }
  }
  const fieldClass = 'mt-2 w-full rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-white outline-none focus:border-[#A795EF]';
  const content = <main className="min-h-screen bg-[#050505] px-4 py-16 text-white sm:px-6">
    <Helmet><title>{t('Bobby support and community rules', 'Soporte y reglas de Bobby')}</title><html lang={htmlLang()} /></Helmet>
    <div className="mx-auto max-w-2xl space-y-8 leading-7">
      <nav aria-label={t('Language', 'Idioma')} className="flex flex-wrap gap-4 font-mono text-[11px] uppercase tracking-[0.14em] text-white/40">{LANGS.map(code => <a key={code} href={`?lang=${code}${android ? '&platform=android' : ''}`} aria-current={language === code ? 'page' : undefined} className={language === code ? 'text-white' : 'hover:text-white'}>{LANG_NAME[code]}</a>)}</nav>
      <h1 className="text-4xl md:text-5xl">{t('How can we help?', '¿Cómo podemos ayudarte?')}</h1>
      <section id="contact" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl">{t('Contact Bobby privately', 'Contacta a Bobby en privado')}</h2>
        <p>{t('Use this form for app support, privacy requests or community safety concerns. Your message and optional reply email go to Bobby’s private support queue; they are not published. If you want a reply, include an email address. Do not send passwords, financial account numbers or identity documents.', 'Usa este formulario para soporte de la app, solicitudes de privacidad o dudas de seguridad de la comunidad. Tu mensaje y un correo opcional para responderte llegan a la cola privada de soporte de Bobby; no se publican. Si quieres una respuesta, incluye un correo. No envíes contraseñas, números de cuentas financieras ni documentos de identidad.')}</p>
        <form className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5" onSubmit={submit}>
          <label className="block" htmlFor="support-kind">{t('Request', 'Solicitud')}
            <select id="support-kind" className={fieldClass} value={kind} onChange={event => setKind(event.target.value)} disabled={status === 'sending'}>
              <option value="support">{t('App support', 'Soporte de la app')}</option>
              <option value="privacy">{t('Privacy or data request', 'Privacidad o solicitud de datos')}</option>
              <option value="community">{t('Community safety', 'Seguridad de la comunidad')}</option>
            </select>
          </label>
          <label className="block" htmlFor="support-email">{t('Reply email (optional)', 'Correo para responderte (opcional)')}
            <input id="support-email" className={fieldClass} type="email" autoComplete="email" maxLength={200} value={email} onChange={event => setEmail(event.target.value)} disabled={status === 'sending'} />
          </label>
          <label className="block" htmlFor="support-message">{t('How can we help?', '¿Cómo podemos ayudarte?')}
            <textarea id="support-message" className={fieldClass} rows={5} minLength={3} maxLength={2000} required value={message} onChange={event => setMessage(event.target.value)} disabled={status === 'sending'} aria-describedby="support-data-note" />
          </label>
          <p id="support-data-note" className="text-sm text-white/60">{t('Include your app version and only the details needed to explain the request. Sending shares these fields with the private support service. Read our ', 'Incluye la versión de la app y solo los detalles necesarios para explicar la solicitud. Al enviar, compartes estos campos con el servicio privado de soporte. Lee el ')}<a className="underline underline-offset-4" href={android ? `/privacy?lang=${language}&platform=android` : clientLanguagePath('/privacy')}>{t('privacy policy', 'aviso de privacidad')}</a>.</p>
          <button className="rounded-xl bg-[#F2EDE4] px-5 py-3 font-semibold text-[#0D0B15] disabled:opacity-50" type="submit" disabled={status === 'sending' || message.trim().length < 3}>{status === 'sending' ? t('Sending…', 'Enviando…') : t('Send private request', 'Enviar solicitud privada')}</button>
          <p role={status === 'error' ? 'alert' : 'status'} aria-live="polite" className={status === 'error' ? 'text-[#FF8F9A]' : 'text-[#80D9E8]'}>
            {status === 'saved' ? t('Your request was saved to Bobby’s private support queue.', 'Tu solicitud se guardó en la cola privada de soporte de Bobby.') : status === 'error' ? t('We could not confirm your request was saved. Your message is still here; please try again.', 'No pudimos confirmar que se guardara tu solicitud. Tu mensaje sigue aquí; vuelve a intentarlo.') : ''}
          </p>
        </form>
        <p className="text-sm text-white/60">{t('For non-sensitive bugs, you can also open a ', 'Para errores sin información privada, también puedes abrir un ')}<a className="text-white underline underline-offset-4" href="https://github.com/anthonysurfermx/Bobby-Agent-Trader/issues/new">{t('public GitHub issue', 'issue público de GitHub')}</a>. {t('GitHub issues are visible to everyone; do not put personal data there.', 'Los issues de GitHub son visibles para todos; no pongas datos personales ahí.')}</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl">{t('Trader Land community rules', 'Reglas de la comunidad de Trader Land')}</h2>
        <p>{t('Use respectful names. Hate, sexual content, threats, harassment, impersonation, scams and unwanted advertising are not allowed. Do not publish personal information or contact links. Island names are checked with OpenAI before publication; abusive content can be removed and its creator can lose publishing access.', 'Usa nombres respetuosos. No se permite odio, contenido sexual, amenazas, acoso, suplantación, estafas ni publicidad no solicitada. No publiques datos personales ni enlaces de contacto. Revisamos los nombres con OpenAI antes de publicarlos; podemos retirar contenido abusivo y restringir la publicación de su creador.')}</p>
        <p>{t('While visiting an island, choose “Report or block creator”. Reports go to Bobby’s private review queue. Blocking immediately hides that creator’s island on this device, including after renaming. “Community safety” lets you unblock them. Satoshi Nakamoto is a built-in Bobby showcase, not a user account.', 'Al visitar una isla, elige “Reportar o bloquear creador”. Los reportes llegan a la cola privada de revisión de Bobby. Bloquear oculta de inmediato la isla del creador en este dispositivo, incluso si cambia de nombre. Puedes desbloquearlo en “Seguridad de la comunidad”. Satoshi Nakamoto es una isla de muestra de Bobby, no una cuenta de usuario.')}</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl">{t('Android app support', 'Soporte de la app Android')}</h2>
        <p>{t('On Android, type a question or choose optional on-device dictation. Dictation requires a supported Android 12 or newer recognizer and microphone permission; if unavailable, type instead. Microphone audio stays on the device. The resulting text reaches the analysis service only with your AI consent. Withdraw it from Profile → Risk notice to stop future analysis and generated speech. Manage microphone and notification permissions in Android settings.', 'En Android, escribe una pregunta o elige el dictado opcional en el dispositivo. El dictado requiere un reconocedor compatible de Android 12 o posterior y permiso de micrófono; si no está disponible, escribe. El audio del micrófono se queda en el dispositivo. El texto resultante llega al servicio de análisis solo con tu consentimiento de IA. Retíralo desde Perfil → Aviso de riesgo para detener análisis y voz generada futuros. Administra los permisos de micrófono y notificaciones en los ajustes de Android.')}</p>
        <p>{t('From Profile, use “Report AI content” to send an offensive-content report without leaving the app. Only your own written report and selected reason are sent; your questions, account and email are not automatically attached. A saved acknowledgement means the report reached the private queue for review.', 'Desde Perfil, usa «Reportar contenido de IA» para enviar un reporte sin salir de la app. Solo se envía lo que escribas y el motivo elegido; tus preguntas, cuenta y correo no se adjuntan automáticamente. El recibo confirma que el reporte llegó a la cola privada para revisión.')}</p>
        <p>{t('Optional Google or Apple sign-in opens the browser authorization flow. To remove a signed-in account, open Profile → Delete account → Confirm. For Apple accounts, Android provides separate manual Apple revocation instructions after Bobby confirms deletion. Signing out or uninstalling does not delete synced account data. If you no longer have the app or cannot complete deletion there, use the private account-deletion request below.', 'El inicio de sesión opcional con Google o Apple abre la autorización en el navegador. Para borrar una cuenta con sesión iniciada, abre Perfil → Eliminar cuenta → Confirmar. En cuentas Apple, Android muestra las instrucciones separadas de revocación manual después de que Bobby confirme el borrado. Cerrar sesión o desinstalar no elimina los datos sincronizados. Si ya no tienes la app o no puedes completar el borrado allí, usa la solicitud privada de cuenta de abajo.')}</p>
        <p>{t('Deleting the Bobby account does not cancel a store subscription. If Google Play billed you, manage or cancel it directly in Google Play with the purchasing Google account. Restore an existing eligible purchase from Bobby’s Pro screen while signed in to the correct Bobby account. For directly billed website-card subscriptions, the in-app deletion service attempts to stop card billing and open Checkout before deleting the account, and can stop deletion if a potentially chargeable operation remains unverified. If another provider billed you or a deletion fails, contact support with the provider name; do not include card or account secrets.', 'Borrar la cuenta Bobby no cancela una suscripción de la tienda. Si Google Play te cobró, adminístrala o cancélala directamente en Google Play con la cuenta Google que compró. Restaura una compra existente elegible desde la pantalla Pro de Bobby con la cuenta Bobby correcta. En las suscripciones del sitio web cobradas directamente con tarjeta, el servicio de borrado de la app intenta detener el cobro y Checkout abierto antes de borrar la cuenta, y puede detener el borrado si una operación con posible cargo sigue sin verificarse. Si te cobró otro proveedor o falla el borrado, indica el proveedor a soporte; no incluyas datos de tarjeta ni secretos de cuenta.')}</p>
        <p>{t('Account deletion can leave limited private purchase records where Bobby applies its Google Play and website card purchase checks. Unresolved payments keep the references needed for reconciliation and duplicate-charge prevention; verified terminal outcomes remove encrypted purchase tokens and full Checkout request details. Limited ownership and verification evidence remains as explained in Privacy and retention. A pending purchase, sign-out or deletion is not confirmation that billing has stopped. For an unresolved purchase or retention request, use the private form above and include only the provider name and the details needed to explain the issue.', 'El borrado de cuenta puede conservar registros privados limitados de compra cuando Bobby aplica controles de Google Play y tarjeta del sitio web. Los pagos sin resolver conservan las referencias necesarias para conciliarlos y evitar cargos duplicados; los resultados finales verificados eliminan tokens cifrados de compra y el detalle completo de la solicitud de Checkout. Permanece la evidencia limitada de titularidad y verificación explicada en Privacidad y conservación. Una compra pendiente, cerrar sesión o borrar la cuenta no confirma que se haya detenido la facturación. Para una compra sin resolver o una solicitud sobre conservación, usa el formulario privado de arriba e incluye solo el proveedor y los detalles necesarios para explicar el problema.')}</p>
        <p>{t('Market briefing reminders are optional background inbox checks scheduled by Android. Enable them in briefing settings and grant notification permission if you want them. Delivery time depends on your device settings. In Profile → Memory, “Remember questions from this device” is a separate choice, off by default; turning it off stops new native desk memory use and contributions.', 'Los avisos de informes son consultas opcionales de la bandeja en segundo plano programadas por Android. Actívalos en la configuración de informes y concede el permiso si los quieres. La hora depende del dispositivo. En Perfil → Memoria, «Recordar preguntas de este dispositivo» es una opción separada y desactivada por defecto; al desactivarla se detiene el uso y aporte de memoria de las nuevas preguntas del desk nativo.')}</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <a className="text-white underline underline-offset-4" href="https://play.google.com/store/account/subscriptions" target="_blank" rel="noopener noreferrer">{t('Manage Google Play subscriptions', 'Administrar suscripciones de Google Play')}</a>
          <a className="text-white underline underline-offset-4" href={clientLanguagePath(android ? '/delete-account?platform=android' : '/delete-account')}>{t('Request account deletion', 'Solicitar borrado de cuenta')}</a>
          <a className="text-white underline underline-offset-4" href={clientLanguagePath(android ? '/privacy?platform=android' : '/privacy')}>{t('Privacy and retention', 'Privacidad y conservación')}</a>
        </div>
      </section>
      {!android && <>
      <section className="space-y-3">
        <h2 className="text-xl">{t('Questions, dictation and AI consent', 'Preguntas, dictado y consentimiento de IA')}</h2>
        <p>{t('Type a question, or hold the question button to dictate after granting microphone and speech permissions. Dictation stays on this iPhone; the resulting text goes to the analysis service with your AI consent. If recognition is unavailable or permission is declined, type instead. Every level normally uses Anthropic (Claude). When provider credit is exhausted or requests are limited, OpenAI can take over the same analysis roles, and the other way round, subject to availability. Generated reply narration uses OpenAI or Microsoft and can be muted in Profile or Squad.', 'Escribe una pregunta o mantén pulsado el botón para dictar tras conceder los permisos de micrófono y voz. El dictado se procesa en este iPhone; el texto resultante llega al servicio de análisis con tu consentimiento de IA. Si el reconocimiento no está disponible o rechazas el permiso, escribe. Todos los niveles usan normalmente Anthropic (Claude). Si se agota el crédito del proveedor o se limitan solicitudes, OpenAI puede realizar los mismos roles de análisis, y viceversa, según disponibilidad. La narración de respuestas usa OpenAI o Microsoft y se puede silenciar en Perfil o Squad.')}</p>
        <p>{t('To withdraw AI consent, open Profile → Risk notice → Withdraw AI consent. Future analysis and generated-speech requests stop until you agree again. Withdrawal does not erase data already processed by providers; use the private form above for a data request.', 'Para retirar el consentimiento de IA, abre Perfil → Aviso de riesgo → Retirar consentimiento de IA. Se detienen nuevas solicitudes de análisis y voz generada hasta que vuelvas a aceptar. Retirarlo no borra los datos ya procesados por los proveedores; usa el formulario privado de arriba para una solicitud de datos.')}</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl">{t('Your account and data', 'Tu cuenta y tus datos')}</h2>
        <p>{t('Tap the companion avatar at the top right to open Profile. Sign in with Apple is optional; its given name stays on this iPhone for a greeting. When signed in, choose “Delete account” and confirm “Delete account permanently” to remove your account, synced progress and Trader Land data. Apple may ask you to authorize once more. Signing out does not delete the account.', 'Toca el avatar del compañero arriba a la derecha para abrir Perfil. Iniciar sesión con Apple es opcional; su nombre de pila se guarda en este iPhone para saludarte. Con sesión iniciada, elige “Borrar cuenta” y confirma “Borrar cuenta definitivamente” para borrar la cuenta, el progreso sincronizado y los datos de Trader Land. Apple puede pedirte autorizar una vez más. Cerrar sesión no borra la cuenta.')}</p>
        <p>{t('Guest Quick reads have a limited allowance. Deep and Max availability follows the usage limits shown in the app. Bobby Pro is an optional auto-renewing monthly subscription bought through Apple: unlimited Quick reads (fair use) plus 60 Deep and 10 Max every 30 days. It renews until you cancel it in Settings › Apple Account › Subscriptions; deleting your Bobby account does not cancel it. To restore it on a new iPhone, open Profile → Restore Purchases. Optional invitations can earn promotional Pro access with an expiry; that is not an Apple subscription.', 'Las lecturas Rápidas de invitado tienen un cupo limitado. La disponibilidad de Profundo y Máximo sigue los límites que muestra la app. Bobby Pro es una suscripción mensual opcional con renovación automática que se compra con Apple: lecturas Rápidas ilimitadas (uso justo) más 60 Profundo y 10 Máximo cada 30 días. Se renueva hasta que la canceles en Ajustes › Cuenta de Apple › Suscripciones; borrar tu cuenta de Bobby no la cancela. Para restaurarla en otro iPhone, abre Perfil → Restaurar compras. Las invitaciones opcionales pueden dar acceso Pro promocional con vencimiento; eso no es una suscripción de Apple.')}</p>
        <a className="text-white underline" href={android ? `/privacy?lang=${language}&platform=android` : clientLanguagePath('/privacy')}>{t('Privacy policy', 'Aviso de privacidad')}</a>
      </section>
      </>}
    </div>
  </main>;
  return android ? <div className="min-h-screen bg-[#050505] text-white"><header className="border-b border-white/[0.06] px-6 py-4 font-mono text-sm">Bobby</header>{content}</div> : <KineticShell activeTab="terminal" minimalNav showTicker={false} showStatus={false} nucleo>{content}</KineticShell>;
}
