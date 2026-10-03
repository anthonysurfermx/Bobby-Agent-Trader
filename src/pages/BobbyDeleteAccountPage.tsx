import { useState, type FormEvent } from 'react';
import { Helmet } from 'react-helmet-async';
import KineticShell from '@/components/kinetic/KineticShell';
import { lang } from '@/lib/companions/i18n';
import { sendSupportRequest } from '@/pages/BobbySupportPage';

export default function BobbyDeleteAccountPage() {
  const requested = new URLSearchParams(window.location.search).get('lang');
  const es = requested ? requested === 'es' : lang() === 'es';
  const android = new URLSearchParams(window.location.search).get('platform') === 'android';
  const t = (en: string, spanish: string) => es ? spanish : en;
  const [account, setAccount] = useState('');
  const [provider, setProvider] = useState('unknown');
  const [email, setEmail] = useState('');
  const [details, setDetails] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'saved' | 'error'>('idle');
  const canSubmit = confirmed && account.trim().length >= 3 && email.trim().length > 0 && status !== 'sending' && status !== 'saved';
  const fieldClass = 'mt-2 w-full rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-white outline-none focus:border-green-400';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setStatus('sending');
    try {
      await sendSupportRequest({
        kind: 'account_deletion', language: es ? 'es' : 'en', email,
        message: `Bobby account deletion request\nAccount identifier: ${account.trim()}\nSign-in method: ${provider}\nRequested: delete the Bobby account and associated account data. Store subscriptions are managed separately.\nAdditional details: ${details.trim() || 'None'}`,
      });
      setStatus('saved');
      setAccount(''); setEmail(''); setDetails(''); setConfirmed(false);
    } catch { setStatus('error'); }
  }

  const content = <main className="min-h-screen bg-[#050505] px-4 py-16 text-white sm:px-6">
      <Helmet><title>{t('Delete your Bobby account', 'Borrar tu cuenta Bobby')}</title><html lang={es ? 'es' : 'en'} /></Helmet>
      <div className="mx-auto max-w-2xl space-y-8 leading-7">
        <nav aria-label={t('Language', 'Idioma')} className="flex gap-4 font-mono text-[11px] uppercase tracking-[0.14em] text-white/40">
          <a href={android ? "?lang=en&platform=android" : "?lang=en"} aria-current={!es ? 'page' : undefined} className={es ? 'hover:text-white' : 'text-white'}>English</a>
          <a href={android ? "?lang=es&platform=android" : "?lang=es"} aria-current={es ? 'page' : undefined} className={es ? 'text-white' : 'hover:text-white'}>Español</a>
        </nav>
        <h1 className="text-4xl md:text-5xl">{t('Delete your Bobby account', 'Borrar tu cuenta Bobby')}</h1>
        <p>{t('Request deletion of your Bobby account and its associated data here, even if you no longer have the app. This private request does not require a new account or a public GitHub issue.', 'Solicita aquí el borrado de tu cuenta Bobby y sus datos asociados, aunque ya no tengas la app. Esta solicitud privada no requiere una cuenta nueva ni un issue público en GitHub.')}</p>

        <section className="space-y-3" aria-labelledby="deletion-scope">
          <h2 id="deletion-scope" className="text-xl">{t('What deletion means', 'Qué implica el borrado')}</h2>
          <p>{t('Account deletion removes the Bobby account, synced progress, Trader Land account data, memory and account-linked briefing records. Public blockchain transactions cannot be erased. Limited records needed for security, fraud prevention, audit, legal compliance or disputes may remain under the retention terms in the privacy policy. Providers may retain operational data under their own terms.', 'El borrado elimina la cuenta Bobby, progreso sincronizado, datos de cuenta de Trader Land, memoria e informes vinculados a la cuenta. Las transacciones públicas de blockchain no pueden borrarse. Pueden permanecer los registros limitados necesarios por seguridad, prevención de fraude, auditoría, cumplimiento legal o disputas, según los plazos del aviso de privacidad. Los proveedores pueden conservar datos operativos según sus términos.')}</p>
          <p>{t('Where Bobby applies Google Play and website card purchase checks, limited private purchase records remain after the account link is removed, to reconcile payments, prevent duplicate charges and resolve disputes. Unresolved purchases can retain encrypted Google Play purchase tokens and card Checkout request details. Verified terminal outcomes remove those encrypted tokens and full Checkout details; limited hashed ownership, provider references and verification evidence remain without an automatic deletion deadline in this protocol. See the privacy policy for the retained data and use the private form below for a retention request.', 'Cuando Bobby aplica controles de compra de Google Play y tarjeta del sitio web, conserva registros privados limitados de compra después de eliminar el vínculo con la cuenta, para conciliar pagos, evitar cargos duplicados y resolver disputas. Las compras sin resolver pueden conservar tokens Google Play cifrados y detalles de la solicitud de Checkout con tarjeta. Los resultados finales verificados eliminan esos tokens cifrados y el detalle completo de Checkout; las referencias limitadas de titularidad protegidas con hash, proveedor y verificación permanecen sin un plazo de borrado automático definido en este protocolo. Consulta los datos conservados en el aviso de privacidad y usa el formulario privado de abajo para una solicitud sobre su conservación.')}</p>
          <p>{t('Deleting Bobby does not cancel Google Play or Apple subscriptions; manage them separately with the purchasing store account. For directly billed website-card subscriptions, the in-app deletion service attempts to stop open Checkout and card billing before removing the account; a potentially chargeable card operation whose closure cannot be confirmed can prevent deletion. Other billing providers need their own management process. You can submit this private request before cancelling; receiving it does not cancel billing or confirm completed deletion.', 'Borrar Bobby no cancela las suscripciones de Google Play o Apple; adminístralas por separado con la cuenta de la tienda que compró. En las suscripciones del sitio web cobradas directamente con tarjeta, el servicio de borrado de la app intenta detener Checkout abierto y el cobro antes de eliminar la cuenta; una operación con tarjeta que aún pueda cobrar y cuyo cierre no se confirme puede impedir el borrado. Otros proveedores de cobro necesitan su propio proceso de administración. Puedes enviar esta solicitud privada antes de cancelar; recibirla no cancela la facturación ni confirma que el borrado terminó.')}</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <a className="underline underline-offset-4" href="https://play.google.com/store/account/subscriptions" target="_blank" rel="noopener noreferrer">{t('Google Play subscriptions', 'Suscripciones de Google Play')}</a>
            <a className="underline underline-offset-4" href="https://support.apple.com/en-us/118428" target="_blank" rel="noopener noreferrer">{t('Apple subscriptions', 'Suscripciones de Apple')}</a>
            <a className="underline underline-offset-4" href={`/privacy?lang=${es ? 'es' : 'en'}${android ? '&platform=android' : ''}`}>{t('Privacy and retention', 'Privacidad y conservación')}</a>
          </div>
        </section>

        <section id="request" className="space-y-3" aria-labelledby="deletion-request">
          <h2 id="deletion-request" className="text-xl">{t('Send a private deletion request', 'Enviar una solicitud privada de borrado')}</h2>
          <p>{t('Bobby needs enough information to locate your account and verify that it belongs to you before removing account data. Provide the sign-in email or Bobby account identifier and a reply email. Never include passwords, seed phrases, private keys, card numbers or identity documents.', 'Bobby necesita localizar tu cuenta y comprobar que te pertenece antes de eliminar datos de cuenta. Indica el correo de inicio de sesión o identificador de cuenta Bobby y un correo para responderte. Nunca incluyas contraseñas, frases semilla, llaves privadas, números de tarjeta ni documentos de identidad.')}</p>
          <form onSubmit={submit} className="space-y-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
            <label className="block" htmlFor="delete-account-id">{t('Bobby sign-in email or account ID', 'Correo de inicio de sesión o ID de cuenta Bobby')}
              <input id="delete-account-id" className={fieldClass} value={account} onChange={event => setAccount(event.target.value)} required minLength={3} maxLength={200} autoComplete="off" disabled={status === 'sending' || status === 'saved'} />
            </label>
            <label className="block" htmlFor="delete-account-provider">{t('How you signed in', 'Cómo iniciaste sesión')}
              <select id="delete-account-provider" className={fieldClass} value={provider} onChange={event => setProvider(event.target.value)} disabled={status === 'sending' || status === 'saved'}>
                <option value="unknown">{t('Not sure', 'No estoy seguro')}</option><option value="google">Google</option><option value="apple">Apple</option><option value="wallet">{t('Website wallet account', 'Cuenta de wallet del sitio web')}</option>
              </select>
            </label>
            <label className="block" htmlFor="delete-account-reply">{t('Reply email', 'Correo para responderte')}
              <input id="delete-account-reply" type="email" className={fieldClass} value={email} onChange={event => setEmail(event.target.value)} required maxLength={200} autoComplete="email" disabled={status === 'sending' || status === 'saved'} />
            </label>
            <label className="block" htmlFor="delete-account-details">{t('Additional details (optional)', 'Detalles adicionales (opcionales)')}
              <textarea id="delete-account-details" className={fieldClass} rows={3} value={details} onChange={event => setDetails(event.target.value)} maxLength={1000} disabled={status === 'sending' || status === 'saved'} />
            </label>
            <label className="flex items-start gap-3" htmlFor="delete-account-confirm">
              <input id="delete-account-confirm" type="checkbox" className="mt-2 h-4 w-4 shrink-0 accent-green-400" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} required disabled={status === 'sending' || status === 'saved'} />
              <span>{t('I request deletion of my Bobby account and associated account data. I understand store subscriptions are managed separately.', 'Solicito el borrado de mi cuenta Bobby y datos de cuenta asociados. Entiendo que las suscripciones se administran por separado.')}</span>
            </label>
            <p className="text-sm text-white/60">{t('Sending shares these fields with Bobby’s private support service. A saved receipt confirms the request was received; it does not mean deletion is complete. If we cannot confirm the request was saved, it remains here for you to retry.', 'Al enviar, compartes estos campos con el servicio privado de soporte de Bobby. El recibo confirma que se recibió la solicitud; no significa que el borrado esté completo. Si no podemos confirmar que se guardó, la solicitud queda aquí para que lo intentes de nuevo.')}</p>
            <button type="submit" disabled={!canSubmit} className="min-h-12 rounded-xl bg-green-400 px-5 py-3 font-semibold text-[#050505] disabled:opacity-50">{status === 'sending' ? t('Sending…', 'Enviando…') : t('Request account deletion', 'Solicitar borrado de cuenta')}</button>
            <p role={status === 'error' ? 'alert' : 'status'} aria-live="polite" className={status === 'error' ? 'text-red-300' : 'text-green-300'}>
              {status === 'saved' ? t('Your deletion request was saved privately. Account deletion is not yet confirmed. Bobby must verify ownership and process the request.', 'Tu solicitud de borrado se guardó de forma privada. El borrado de cuenta todavía no está confirmado. Bobby debe verificar la titularidad y procesar la solicitud.') : status === 'error' ? t('We could not confirm that your request was saved. Your information remains in this form; please try again.', 'No pudimos confirmar que se guardara tu solicitud. Tu información sigue en este formulario; vuelve a intentarlo.') : ''}
            </p>
          </form>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl">{t('In the app', 'Desde la app')}</h2>
          <p>{t('Android: open Profile → Delete account → Confirm. For Apple accounts, follow the separate manual Apple revocation instructions after Bobby confirms deletion. If deletion cannot be completed in the app, use the private request above. On iPhone, open Profile → Delete account and confirm; Apple may require a fresh authorization. Signing out or uninstalling does not delete a synced account.', 'Android: abre Perfil → Eliminar cuenta → Confirmar. En cuentas Apple, sigue las instrucciones separadas de revocación manual después de que Bobby confirme el borrado. Si no puedes completarlo en la app, usa la solicitud privada de arriba. En iPhone, abre Perfil → Borrar cuenta y confirma; Apple puede pedir una autorización nueva. Cerrar sesión o desinstalar no borra una cuenta sincronizada.')}</p>
          <p>{t('If Apple access is not revoked automatically, follow Apple’s instructions to stop using Sign in with Apple for Bobby. This step is separate from requesting removal of Bobby account data.', 'Si el acceso de Apple no se revoca automáticamente, sigue las instrucciones de Apple para dejar de usar Iniciar sesión con Apple para Bobby. Este paso es independiente de solicitar el borrado de los datos de cuenta Bobby.')} <a href="https://support.apple.com/en-us/102571" className="underline underline-offset-4" target="_blank" rel="noopener noreferrer">{t('Apple instructions', 'Instrucciones de Apple')}</a></p>
          <a href={`/support?lang=${es ? 'es' : 'en'}${android ? '&platform=android' : ''}#contact`} className="underline underline-offset-4">{t('Other support or data requests', 'Otras solicitudes de soporte o datos')}</a>
        </section>
      </div>
    </main>;
  return android ? <div className="min-h-screen bg-[#050505] text-white"><header className="border-b border-white/[0.06] px-6 py-4 font-mono text-sm">Bobby</header>{content}</div> : <KineticShell activeTab="terminal" minimalNav showTicker={false} showStatus={false} nucleo>{content}</KineticShell>;
}
