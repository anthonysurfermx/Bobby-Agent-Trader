import { useState, type FormEvent } from 'react';
import KineticShell from '@/components/kinetic/KineticShell';
import { Helmet } from 'react-helmet-async';
import { lang } from '@/lib/companions/i18n';

type SupportRequest = { message: string; email: string; language: 'en' | 'es'; kind: string };

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
  const es = requested ? requested === 'es' : lang() === 'es';
  const t = (en: string, spanish: string) => es ? spanish : en;
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [kind, setKind] = useState('support');
  const [status, setStatus] = useState<'idle' | 'sending' | 'saved' | 'error'>('idle');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'sending' || message.trim().length < 3) return;
    setStatus('sending');
    try {
      await sendSupportRequest({ message, email, kind, language: es ? 'es' : 'en' });
      setStatus('saved');
      setMessage('');
    } catch { setStatus('error'); }
  }
  const fieldClass = 'mt-2 w-full rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-white outline-none focus:border-[#A795EF]';
  return <KineticShell activeTab="terminal" minimalNav showTicker={false} showStatus={false} nucleo><main className="min-h-screen bg-[#050505] px-4 py-16 text-white sm:px-6">
    <Helmet><title>{t('Bobby support and community rules', 'Soporte y reglas de Bobby')}</title><html lang={es ? 'es' : 'en'} /></Helmet>
    <div className="mx-auto max-w-2xl space-y-8 leading-7">
      <nav aria-label={t('Language', 'Idioma')} className="flex gap-4 font-mono text-[11px] uppercase tracking-[0.14em] text-white/40"><a href="?lang=en" aria-current={!es ? 'page' : undefined} className={es ? 'hover:text-white' : 'text-white'}>English</a><a href="?lang=es" aria-current={es ? 'page' : undefined} className={es ? 'text-white' : 'hover:text-white'}>Español</a></nav>
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
          <p id="support-data-note" className="text-sm text-white/60">{t('Include your app version and only the details needed to explain the request. Sending shares these fields with the private support service. Read our ', 'Incluye la versión de la app y solo los detalles necesarios para explicar la solicitud. Al enviar, compartes estos campos con el servicio privado de soporte. Lee el ')}<a className="underline underline-offset-4" href={`/privacy?lang=${es ? 'es' : 'en'}`}>{t('privacy policy', 'aviso de privacidad')}</a>.</p>
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
        <h2 className="text-xl">{t('Questions, dictation and AI consent', 'Preguntas, dictado y consentimiento de IA')}</h2>
        <p>{t('Type a question, or hold the question button to dictate after granting microphone and speech permissions. Dictation stays on this iPhone; the resulting text goes to the analysis service with your AI consent. If recognition is unavailable or permission is declined, type instead. Every level normally uses Anthropic (Claude). When provider credit is exhausted or requests are limited, OpenAI can take over the same analysis roles, and the other way round, subject to availability. Generated reply narration uses OpenAI or Microsoft and can be muted in Profile or Squad.', 'Escribe una pregunta o mantén pulsado el botón para dictar tras conceder los permisos de micrófono y voz. El dictado se procesa en este iPhone; el texto resultante llega al servicio de análisis con tu consentimiento de IA. Si el reconocimiento no está disponible o rechazas el permiso, escribe. Todos los niveles usan normalmente Anthropic (Claude). Si se agota el crédito del proveedor o se limitan solicitudes, OpenAI puede realizar los mismos roles de análisis, y viceversa, según disponibilidad. La narración de respuestas usa OpenAI o Microsoft y se puede silenciar en Perfil o Squad.')}</p>
        <p>{t('To withdraw AI consent, open Profile → Risk notice → Withdraw AI consent. Future analysis and generated-speech requests stop until you agree again. Withdrawal does not erase data already processed by providers; use the private form above for a data request.', 'Para retirar el consentimiento de IA, abre Perfil → Aviso de riesgo → Retirar consentimiento de IA. Se detienen nuevas solicitudes de análisis y voz generada hasta que vuelvas a aceptar. Retirarlo no borra los datos ya procesados por los proveedores; usa el formulario privado de arriba para una solicitud de datos.')}</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl">{t('Your account and data', 'Tu cuenta y tus datos')}</h2>
        <p>{t('Tap the companion avatar at the top right to open Profile. Sign in with Apple is optional; its given name stays on this iPhone for a greeting. When signed in, choose “Delete account” and confirm “Delete account permanently” to remove your account, synced progress and Trader Land data. Apple may ask you to authorize once more. Signing out does not delete the account.', 'Toca el avatar del compañero arriba a la derecha para abrir Perfil. Iniciar sesión con Apple es opcional; su nombre de pila se guarda en este iPhone para saludarte. Con sesión iniciada, elige “Borrar cuenta” y confirma “Borrar cuenta definitivamente” para borrar la cuenta, el progreso sincronizado y los datos de Trader Land. Apple puede pedirte autorizar una vez más. Cerrar sesión no borra la cuenta.')}</p>
        <p>{t('Guest Quick reads have a limited allowance. Deep and Max availability follows the usage limits shown in the app. Bobby Pro is an optional auto-renewing monthly subscription bought through Apple: unlimited Quick reads (fair use) plus 60 Deep and 10 Max every 30 days. It renews until you cancel it in Settings › Apple Account › Subscriptions; deleting your Bobby account does not cancel it. To restore it on a new iPhone, open Profile → Restore Purchases. Optional invitations can earn promotional Pro access with an expiry; that is not an Apple subscription.', 'Las lecturas Rápidas de invitado tienen un cupo limitado. La disponibilidad de Profundo y Máximo sigue los límites que muestra la app. Bobby Pro es una suscripción mensual opcional con renovación automática que se compra con Apple: lecturas Rápidas ilimitadas (uso justo) más 60 Profundo y 10 Máximo cada 30 días. Se renueva hasta que la canceles en Ajustes › Cuenta de Apple › Suscripciones; borrar tu cuenta de Bobby no la cancela. Para restaurarla en otro iPhone, abre Perfil → Restaurar compras. Las invitaciones opcionales pueden dar acceso Pro promocional con vencimiento; eso no es una suscripción de Apple.')}</p>
        <a className="text-white underline" href={`/privacy?lang=${es ? 'es' : 'en'}`}>{t('Privacy policy', 'Aviso de privacidad')}</a>
      </section>
    </div>
  </main></KineticShell>;
}
