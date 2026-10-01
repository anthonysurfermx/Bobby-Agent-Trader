// Privacy policy for the Bobby iPhone app and bobbyprotocol.xyz.
// Linked from App Store Connect and from the app — every claim here must stay
// true to the code. The per-data-type mapping lives in
// docs/app-store/build-35/APP-PRIVACY-ANSWERS.md; keep both in step.
// Scope: iOS supports typed/on-device dictated analysis, optional narration and public islands.
// Live audio streaming, wallet connections and swaps remain website-only.
// Account deletion copy must hold with or without the APPLE_SIGN_IN_* keys:
// without them the app skips Apple's sheet and shows the manual steps.
// Update EFFECTIVE_DATE whenever the substance changes.
// Language: ?lang=es|en wins (App Store Connect can link a localized URL),
// then the web's stored choice, then a Spanish browser, then English.
import type { ReactNode } from 'react';
import { Helmet } from 'react-helmet-async';
import NucleoTopBar from '@/components/protocol/NucleoTopBar';
import { useNucleoPages } from '@/hooks/useNucleoPages';
import { lang } from '@/lib/companions/i18n';

/** The policy exists in English and Spanish; a Portuguese reader gets the English text. */
type PolicyLang = 'en' | 'es';
const EFFECTIVE_DATE: Record<PolicyLang, string> = { en: 'September 30, 2026', es: '30 de septiembre de 2026' };
const APPLE_STOP_USING_URL = 'https://support.apple.com/en-us/102571';

function policyLang(): PolicyLang {
  try {
    const requested = new URLSearchParams(window.location.search).get('lang');
    if (requested === 'es' || requested === 'en') return requested;
    const stored = localStorage.getItem('bobby_lang');
    if (!stored && navigator.language?.toLowerCase().startsWith('es')) return 'es';
  } catch { /* private mode or no window */ }
  return lang() === 'es' ? 'es' : 'en';
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-[22px] text-white">{title}</h2>
      <div className="space-y-3 text-[15px] leading-7 text-white/75">{children}</div>
    </section>
  );
}

function Scope({ children }: { children: ReactNode }) {
  return <span className="mr-2 rounded-full border border-white/15 bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-white/60">{children}</span>;
}

const linkClass = 'text-white underline decoration-white/30 underline-offset-4 hover:decoration-white';

export default function PrivacyPage() {
  useNucleoPages();
  const language = policyLang();
  const tr = (en: string, es: string) => (language === 'es' ? es : en);
  const strong = (text: string) => <span className="text-white">{text}</span>;

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <NucleoTopBar />
      <Helmet>
        <html lang={language} />
        <title>{tr('Privacy Policy | Bobby', 'Aviso de privacidad | Bobby')}</title>
        <meta
          name="description"
          content={tr(
            'Privacy policy for the Bobby iPhone app and bobbyprotocol.xyz: market analysis and optional narration on iPhone, an optional Sign in with Apple account that syncs progress and Trader Land, no ads and no tracking.',
            'Aviso de privacidad de la app Bobby para iPhone y de bobbyprotocol.xyz: análisis de mercado y narración opcional en iPhone, cuenta opcional con Iniciar sesión con Apple para sincronizar tu progreso y Trader Land, sin anuncios y sin rastreo.',
          )}
        />
      </Helmet>

      <div className="mx-auto max-w-3xl px-5 py-16 lg:py-24">
        <div className="mb-2 flex items-center justify-between gap-4">
          <div className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-white/40">Bobby Protocol</div>
          <nav aria-label={tr('Language', 'Idioma')} className="flex gap-3 font-mono text-[11px] font-bold uppercase tracking-[0.14em]">
            <a href="?lang=en" aria-current={language === 'en' ? 'true' : undefined} className={language === 'en' ? 'text-white' : 'text-white/40 hover:text-white'}>EN</a>
            <a href="?lang=es" aria-current={language === 'es' ? 'true' : undefined} className={language === 'es' ? 'text-white' : 'text-white/40 hover:text-white'}>ES</a>
          </nav>
        </div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight">{tr('Privacy Policy', 'Aviso de privacidad')}</h1>
        <p className="mb-6 font-mono text-xs text-white/40">{tr('Effective', 'Vigente desde el')} {EFFECTIVE_DATE[language]}</p>
        <p className="mb-12 text-[15px] leading-7 text-white/60">
          {tr(
            'This policy covers the Bobby app for iPhone and the website bobbyprotocol.xyz. Features that exist only on the website, or only in earlier iPhone versions, are labelled that way.',
            'Este aviso cubre la app Bobby para iPhone y el sitio bobbyprotocol.xyz. Las funciones que solo existen en el sitio web, o solo en versiones anteriores de la app para iPhone, están marcadas como tales.',
          )}
        </p>

        <Section title={tr('The short version', 'En resumen')}>
          <p>
            {tr(
              'Bobby has no ads and does not track you across apps or websites. We do not sell personal data.',
              'Bobby no tiene anuncios y no te rastrea entre apps ni sitios web. No vendemos datos personales.',
            )}
          </p>
          <p>
            {tr(
              'The iPhone app (version 1.5, build 45 onward) offers typed or on-device dictated market questions, optional reply narration and Trader Land exploration. Dictation uses the microphone only while you hold the button, with your permission. The app does not connect wallets or execute trades. An optional Sign in with Apple account syncs progress and lets you publish your island; some analysis levels require an account and have usage limits.',
              'La app para iPhone (versión 1.5, build 45 en adelante) ofrece preguntas de mercado por escrito o dictadas en el dispositivo, narración opcional y exploración de Trader Land. El dictado usa el micrófono solo mientras mantienes pulsado el botón, con tu permiso. La app no conecta wallets ni ejecuta operaciones. Una cuenta opcional con Iniciar sesión con Apple sincroniza el progreso y permite publicar tu isla; algunos niveles de análisis requieren cuenta y tienen límites de uso.',
            )}
          </p>
          <p>
            {tr(
              'Only on the website can you also connect an external wallet for non-custodial Base swaps and use live voice. Bobby never receives your wallet keys, takes custody of funds, or signs a transaction for you.',
              'Solo en el sitio web puedes además conectar una wallet externa para hacer swaps no custodiales en Base y usar la voz en vivo. Bobby nunca recibe las llaves de tu wallet, no custodia fondos y no firma transacciones por ti.',
            )}
          </p>
        </Section>

        <Section title={tr('What stays on your iPhone', 'Lo que se queda en tu iPhone')}>
          <p>
            {tr(
              'Without an account, your profile and progress stay on your device: your chosen companion and its level; the name, tone, and aura you set up; your XP, streaks, and gear; the assets you asked about; your settings; and the conversation shown on the desk. Deleting the app removes them.',
              'Sin cuenta, tu perfil y tu progreso se quedan en tu dispositivo: el compañero que elegiste y su nivel; el nombre, el tono y el aura que configuraste; tu XP, rachas y accesorios; los activos por los que preguntaste; tus ajustes, y la conversación que ves en el desk. Si borras la app, se borran.',
            )}
          </p>
          <p>
            {tr(
              'If you save a companion image, iOS asks for permission to add it to your photo library. Bobby cannot read your photos.',
              'Si guardas una imagen de tu compañero, iOS te pide permiso para agregarla a tu fototeca. Bobby no puede ver tus fotos.',
            )}
          </p>
        </Section>

        <Section title={tr('Your optional account and what it syncs', 'Tu cuenta opcional y lo que sincroniza')}>
          <p>
            {tr(
              'In the iPhone app, the only way to sign in is Sign in with Apple. The app requests your name for a greeting: the given name Apple shares is stored on this iPhone, associated with that Apple ID, and is not uploaded by the app. It does not request Apple’s email scope. Our authentication provider receives your Apple identity token and creates account/session identifiers. If Apple or an existing website account supplies an email address, the authentication service and Bobby account record can retain it to identify the account. On the website, Apple and Google sign-in request more profile details; see “Website only” below.',
              'En la app para iPhone, la única forma de iniciar sesión es Iniciar sesión con Apple. La app pide tu nombre para saludarte: el nombre de pila que comparte Apple se guarda en este iPhone, asociado a ese Apple ID, y la app no lo sube al servidor. No solicita el permiso de correo de Apple. Nuestro proveedor de autenticación recibe el token de identidad de Apple y crea identificadores de cuenta y sesión. Si Apple o una cuenta existente del sitio web proporciona un correo, el servicio de autenticación y el registro de cuenta de Bobby pueden conservarlo para identificar la cuenta. En el sitio web, Apple y Google solicitan más datos del perfil; consulta “Solo en el sitio web” abajo.',
            )}
          </p>
          <p>{tr('When you sign in, Bobby stores an internal user ID together with the progress you sync:', 'Cuando inicias sesión, Bobby guarda un ID interno de usuario junto con el progreso que sincronizas:')}</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>{tr('Discipline XP, streaks, aura, awards, and gear.', 'XP de disciplina, rachas, aura, premios y accesorios.')}</li>
            <li>{tr('Your selected companion, whether you finished onboarding, and which version of the risk notice you accepted.', 'El compañero que elegiste, si terminaste la configuración inicial y qué versión del aviso de riesgo aceptaste.')}</li>
            <li>{tr('When each award happened and your time-zone offset, used to count streak days.', 'Cuándo ganaste cada premio y la diferencia de tu zona horaria con UTC, para contar los días de tu racha.')}</li>
            <li>
              {tr(
                'For each read that planted a Trader Land piece: the asset, the direction of Bobby’s analysis (long, short, or none), its price, entry, stop, and target levels, and the result when that read is reviewed against the market.',
                'Por cada lectura que sembró una pieza en Trader Land: el activo, la dirección del análisis de Bobby (alcista, bajista o ninguna), sus niveles de precio, entrada, stop y objetivo, y el resultado cuando esa lectura se revisa contra el mercado.',
              )}
            </li>
            <li>{tr('Your island’s layout, name and chosen visibility.', 'La distribución, el nombre y la visibilidad elegida de tu isla.')}</li>
          </ul>
          <p>
            {tr(
              'We use this data only to run the product: to keep your progress through reinstalls and across your devices, including bobbyprotocol.xyz if you sign in there with the same Apple ID. Your island is private until you explicitly publish it. Publishing shares only its name, layout and districts.',
              'Usamos estos datos solo para que el producto funcione: para conservar tu progreso si reinstalas la app y en todos tus dispositivos, incluido bobbyprotocol.xyz si ahí entras con el mismo Apple ID. Tu isla es privada hasta que eliges publicarla. Publicar comparte solo su nombre, distribución y distritos.',
            )}
          </p>
        </Section>

        <Section title={tr('What Bobby remembers', 'Lo que Bobby recuerda')}>
          <p>
            <Scope>{tr('Website', 'Sitio web')}</Scope>
            {tr(
              'When you are signed in with Apple or Google and ask on the website’s desk, Bobby remembers, for each asset symbol you asked about, how many times you asked, when you last asked, and the time horizon your question named (such as today or weeks), if any. It also keeps the preferences you set yourself under “What Bobby remembers” in your profile: your usual horizon, your experience, and the level of risk you prefer explained. Bobby never infers these preferences or anything else about you, and it does not store your questions.',
              'Si iniciaste sesión con Apple o Google y preguntas en el desk del sitio web, Bobby recuerda, por cada símbolo de activo que preguntaste, cuántas veces preguntaste, cuándo fue la última vez y el horizonte de tiempo que mencionó tu pregunta (como hoy o semanas), si lo hubo. También guarda las preferencias que tú eliges en “Lo que Bobby recuerda” dentro de tu perfil: tu horizonte habitual, tu experiencia y el nivel de riesgo que prefieres ver explicado. Bobby nunca deduce estas preferencias ni nada más sobre ti, y no guarda tus preguntas.',
            )}
          </p>
          <p>
            {tr(
              'Bobby uses this memory only to frame its answers for you: the analysis request then also carries a short summary of it (your first name from your Apple or Google profile when it shares one, your preferences and how often you asked about assets, including this week, and the asset’s market price when you last asked, so Bobby can say how it moved since), never your email or account identifier. That summary is sent to the AI provider that writes the answer: OpenAI or Anthropic, including when one provider takes over because the other has exhausted credit or limits requests. It never changes the verdict. It is not used for ads and is not shared or sold. An asset you do not ask about for 90 days is erased automatically. In your profile you can see all of it, correct your preferences, forget one asset or everything, or pause memory. Deleting your account deletes it too.',
              'Bobby usa esta memoria solo para darle forma a sus respuestas para ti: la solicitud de análisis lleva entonces un resumen breve (tu nombre de pila de tu perfil de Apple o Google cuando lo comparte, tus preferencias y cuántas veces preguntaste por cada activo, incluida esta semana, y el precio de mercado del activo la última vez que preguntaste, para que Bobby te diga cuánto se movió desde entonces), nunca tu correo ni el identificador de tu cuenta. Ese resumen se envía al proveedor de IA que escribe la respuesta: OpenAI o Anthropic, también cuando un proveedor sustituye al otro por crédito agotado o solicitudes limitadas. Nunca cambia el veredicto. No se usa para anuncios y no se comparte ni se vende. Un activo por el que no preguntas en 90 días se borra solo. En tu perfil puedes verla completa, corregir tus preferencias, olvidar un activo o todo, o pausar la memoria. Si borras tu cuenta, también se borra.',
            )}
          </p>
        </Section>

        <Section title={tr('Questions and market analysis', 'Preguntas y análisis de mercado')}>
          <p>
            {tr(
              'Before processing a question, the app asks for your permission to use external AI. When you ask, it sends the question text, asset, language and analysis level to our backend. Every level normally uses Anthropic (Claude). If a provider has exhausted credit or limits requests, the other provider (OpenAI or Anthropic) can perform the same analysis roles, subject to availability and the same usage limits. The providers receive your question and public market context to produce the analysis. The backend also receives the installation identifier and, when signed in, account credentials for access checks and usage limits; these identifiers are not included in the AI analysis payload. The iPhone app does not use the website account-memory summary described above.',
              'Antes de procesar una pregunta, la app pide tu permiso para usar IA externa. Cuando preguntas, envía el texto, el activo, el idioma y el nivel de análisis a nuestro backend. Todos los niveles usan normalmente Anthropic (Claude). Si un proveedor agota su crédito o limita las solicitudes, el otro (OpenAI o Anthropic) puede realizar los mismos roles de análisis, según disponibilidad y con los mismos límites de uso. Los proveedores reciben tu pregunta y el contexto público de mercado para producir el análisis. El backend también recibe el identificador de instalación y, si iniciaste sesión, credenciales de cuenta para comprobar el acceso y los límites de uso; estos identificadores no se incluyen en el contenido de análisis enviado a la IA. La app para iPhone no usa el resumen de memoria de cuenta del sitio web descrito arriba.',
            )}
          </p>
          <p>
            {tr(
              'Bobby does not store your questions, does not add them to your account, and keeps no conversation history on its servers. To work out which asset you mean, the app also sends your question to our asset search, which does not store it either. OpenAI and Anthropic process API requests and may retain them under their own service terms. Please do not include personal information, account numbers, passwords, or financial account details in your questions.',
              'Bobby no guarda tus preguntas, no las agrega a tu cuenta y no conserva historial de conversaciones en sus servidores. Para identificar de qué activo hablas, la app también envía tu pregunta a nuestro buscador de activos, que tampoco la guarda. OpenAI y Anthropic procesan las solicitudes de sus API y pueden conservarlas según sus propios términos de servicio. No incluyas datos personales, números de cuenta, contraseñas ni datos de tus cuentas financieras en tus preguntas.',
            )}
          </p>
          <p>
            {tr(
              'Prices and charts come from public market data sources and are requested with only an asset symbol and a timeframe.',
              'Los precios y las gráficas vienen de fuentes públicas de datos de mercado y se piden solo con el símbolo del activo y un plazo.',
            )}
          </p>
        </Section>

        <Section title={tr('Dictation and your AI choice', 'Dictado y tu elección sobre la IA')}>
          <p>{tr('Dictation is optional. After the microphone and speech-recognition permissions, Bobby transcribes on this iPhone only while you hold the button, for at most 60 seconds. It requires Apple’s on-device recognition; if unavailable or permission is declined, use the keyboard instead. Microphone audio is not uploaded or saved by Bobby. The resulting question text is processed like a typed question.', 'El dictado es opcional. Tras los permisos de micrófono y reconocimiento de voz, Bobby transcribe en este iPhone solo mientras mantienes pulsado el botón, durante un máximo de 60 segundos. Requiere el reconocimiento en el dispositivo de Apple; si no está disponible o rechazas el permiso, puedes usar el teclado. Bobby no sube ni guarda el audio del micrófono. El texto resultante se procesa como una pregunta escrita.')}</p>
          <p>{tr('You can withdraw AI consent from Profile → Risk notice → Withdraw AI consent. This stops future AI analysis and generated-speech requests in the app until you agree again; it does not erase requests already processed by providers. Withdrawal does not delete your account or locally saved content. The full notice includes privacy and support links. To disable microphone access separately, use iOS Settings → Bobby; to silence replies, turn narration off in Profile or Squad.', 'Puedes retirar el consentimiento de IA en Perfil → Aviso de riesgo → Retirar consentimiento de IA. Esto detiene nuevas solicitudes de análisis y voz generada en la app hasta que vuelvas a aceptar; no borra las solicitudes ya procesadas por los proveedores. Retirarlo no borra tu cuenta ni el contenido guardado localmente. El aviso completo incluye enlaces de privacidad y soporte. Para desactivar el micrófono por separado, usa Configuración de iOS → Bobby; para silenciar respuestas, desactiva la narración en Perfil o Squad.')}</p>
        </Section>

        <Section title={tr('Usage limits, security, and logs', 'Límites de uso, seguridad y registros')}>
          <p>
            {tr(
              'To prevent abuse and control costs, the analysis desk limits requests per network address. We keep only a salted cryptographic hash of your IP address, never the address itself, in counters that expire after 24 hours and are deleted within about two days. Other endpoints also use hashed counters. Their expired counters are replaced when the same identifier is used again; they do not have a scheduled deletion deadline.',
              'Para evitar abusos y controlar costos, el desk de análisis limita las solicitudes por dirección de red. Solo guardamos un hash criptográfico con sal de tu dirección IP, nunca la dirección misma, en contadores que vencen a las 24 horas y se borran en un plazo aproximado de dos días. Otros servicios también usan contadores con hashes. Sus contadores vencidos se reemplazan cuando vuelve a usarse el mismo identificador; no tienen un plazo programado de borrado.',
            )}
          </p>
          <p>
            {tr(
              'To count free reads, the app and the website send a random install identifier and, when you are signed in, your account. We store a salted hash of that identifier (never the identifier itself), a salted hash of your network, the asset you asked about and the time. Records older than 35 days are removed when the read service next runs its cleanup. The iPhone installation identifier is stored in Keychain and may survive deleting and reinstalling the app. If you have a Bobby Pro subscription, the payment/subscription provider and Bobby retain the product, status and renewal/expiry date to manage access. iPhone purchases, when offered, use Apple and RevenueCat; website billing uses its displayed provider. Bobby never receives or stores your payment card. Promotional Pro access has an expiry and is distinct from a renewing subscription.',
              'Para contar las lecturas gratis, la app y el sitio envían un identificador aleatorio de instalación y, si iniciaste sesión, tu cuenta. Guardamos un hash con sal de ese identificador (nunca el identificador), un hash con sal de tu red, el activo que preguntaste y la hora. Los registros de más de 35 días se eliminan cuando el servicio de lecturas vuelve a ejecutar su limpieza. El identificador de instalación del iPhone se guarda en Keychain y puede sobrevivir a borrar y reinstalar la app. Si tienes una suscripción Bobby Pro, el proveedor de pago o suscripción y Bobby conservan el producto, el estado y la fecha de renovación o vencimiento para administrar el acceso. Las compras en iPhone, cuando se ofrecen, usan Apple y RevenueCat; la facturación web usa el proveedor que muestra. Bobby nunca recibe ni guarda tu tarjeta. El acceso Pro promocional tiene vencimiento y es distinto de una suscripción renovable.',
            )}
          </p>
          <p>
            {tr(
              'Our hosting and authentication providers keep short-lived request, error, and sign-in security logs, which can include IP addresses and device information. The iPhone app contains no analytics, advertising, or tracking SDKs.',
              'Nuestros proveedores de hosting y autenticación conservan por poco tiempo registros de solicitudes, errores y seguridad de inicio de sesión, que pueden incluir direcciones IP y datos del dispositivo. La app para iPhone no incluye SDKs de analítica, publicidad ni rastreo.',
            )}
          </p>
        </Section>

        <Section title={tr('Deleting your account', 'Cómo borrar tu cuenta')}>
          <p>
            {tr(
              'On iPhone, tap the companion avatar at the top right to open Profile. When signed in, choose “Delete account” and confirm “Delete account permanently”. When Bobby can revoke its Sign in with Apple access automatically, the app first asks you to confirm with Apple once more. It then deletes your account, your synced progress, and your Trader Land data.',
              'En iPhone, toca el avatar del compañero arriba a la derecha para abrir Perfil. Con la sesión iniciada, elige “Borrar cuenta” y confirma “Borrar cuenta definitivamente”. Cuando Bobby puede revocar automáticamente su acceso de Iniciar sesión con Apple, la app primero te pide confirmar una vez más con Apple. Después borra tu cuenta, tu progreso sincronizado y tus datos de Trader Land.',
            )}
          </p>
          <p>
            {tr('If automatic revocation is not available, your account is still deleted and the app shows you how to stop using Sign in with Apple for Bobby yourself (Settings > your name > Sign in with Apple > Bobby > Delete), as described in ', 'Si la revocación automática no está disponible, tu cuenta se borra de todos modos y la app te muestra cómo dejar de usar Iniciar sesión con Apple en Bobby tú mismo (Configuración > tu nombre > Iniciar sesión con Apple > Bobby > Eliminar), como se explica en ')}
            <a href={APPLE_STOP_USING_URL} className={linkClass}>{tr('Apple’s instructions', 'las instrucciones de Apple')}</a>
            {tr('. If Apple cannot be reached at that moment, nothing is deleted and the app asks you to try again. Signing out alone does not delete the account.', '. Si en ese momento no es posible comunicarse con Apple, no se borra nada y la app te pide intentarlo de nuevo. Cerrar sesión no borra la cuenta.')}
          </p>
          <p>
            {tr(
              'Accounts created on the website with Google or a wallet can be deleted on request; see “Contact” below. An account created on the website with Apple is the same account the iPhone app uses with that Apple ID, so you can delete it from the app as described above, or on request.',
              'Las cuentas creadas en el sitio web con Google o con una wallet se pueden borrar a petición tuya; consulta “Contacto” más abajo. Una cuenta creada en el sitio web con Apple es la misma que usa la app para iPhone con ese Apple ID, así que puedes borrarla desde la app como se describe arriba, o a petición tuya.',
            )}
          </p>
        </Section>

        <Section title={tr('Retention', 'Conservación de datos')}>
          <p>
            {tr(
              'Data on your device stays until you remove it or delete the app. Your account and synced progress stay until you delete the account. Confirmed public-chain data and limited records needed for fraud prevention, security, audit, legal compliance, or dispute resolution may remain after account deletion. Service providers keep operational data under their own retention terms.',
              'Los datos en tu dispositivo se quedan ahí hasta que los quites o borres la app. Tu cuenta y tu progreso sincronizado se conservan hasta que borres la cuenta. Los datos públicos confirmados en blockchain y los registros limitados necesarios para prevenir fraudes, por seguridad, auditoría, cumplimiento legal o resolución de disputas pueden conservarse después de borrar la cuenta. Los proveedores de servicios conservan sus datos operativos según sus propios plazos.',
            )}
          </p>
        </Section>

        <Section title={tr('Website only', 'Solo en el sitio web')}>
          <p>
            <Scope>{tr('Website', 'Sitio web')}</Scope>
            {strong(tr('Sign in with Apple on the website. ', 'Iniciar sesión con Apple en el sitio web. '))}
            {tr(
              'The website asks Apple for your name and email address (Apple may give us a private relay address instead of your real one). Bobby uses them only to identify your account. If you use the same Apple ID in the iPhone app, they are stored with that same account.',
              'El sitio web le pide a Apple tu nombre y tu correo (Apple puede darnos una dirección de reenvío privada en lugar de tu correo real). Bobby solo los usa para identificar tu cuenta. Si usas el mismo Apple ID en la app para iPhone, se guardan en esa misma cuenta.',
            )}
          </p>
          <p>
            <Scope>{tr('Website', 'Sitio web')}</Scope>
            {strong(tr('Sign in with Google. ', 'Iniciar sesión con Google. '))}
            {tr(
              'If you use it, Google shares your name, email address, and profile picture with our authentication provider. Bobby uses them only to identify your account.',
              'Si lo usas, Google comparte tu nombre, tu correo y tu foto de perfil con nuestro proveedor de autenticación. Bobby solo los usa para identificar tu cuenta.',
            )}
          </p>
          <p>
            <Scope>{tr('Website', 'Sitio web')}</Scope>
            {strong(tr('Wallets and Base swaps. ', 'Wallets y swaps en Base. '))}
            {tr(
              'The iPhone app does not offer wallet connections or swaps. On the website, connecting a wallet is optional, and a wallet can also be your account: if you sign in with a wallet, Bobby keeps your progress and island under your public wallet address. Reown AppKit helps your chosen external wallet connect to Bobby. Bobby processes your public wallet address, a signed proof that you control it, and the quote and transaction data needed for the swap you request. Your wallet shows the final transaction and only you can sign it.',
              'La app para iPhone no ofrece conexión de wallets ni swaps. En el sitio web, conectar una wallet es opcional, y una wallet también puede ser tu cuenta: si entras con una wallet, Bobby guarda tu progreso y tu isla bajo tu dirección pública de wallet. Reown AppKit ayuda a que la wallet externa que elijas se conecte con Bobby. Bobby procesa tu dirección pública de wallet, una prueba firmada de que la controlas y los datos de cotización y de transacción necesarios para el swap que pides. Tu wallet te muestra la transacción final y solo tú puedes firmarla.',
            )}
          </p>
          <p>
            {tr(
              'For security, history, and reconciliation, we keep prepared and confirmed swap data: public wallet address, token pair, amounts, route, calldata hash, transaction hash, and confirmation details. Blockchain transactions are public and Bobby cannot erase them. Where a swap receipt is linked to an account, deleting the account removes that link; the public wallet and transaction record may remain for security, audit, and legal purposes. Country is inferred at the network edge to decide whether a restricted feature is available; Bobby does not store it in your swap receipt.',
              'Por seguridad, historial y conciliación, guardamos los datos de los swaps preparados y confirmados: dirección pública de la wallet, par de tokens, montos, ruta, hash del calldata, hash de la transacción y detalles de confirmación. Las transacciones en blockchain son públicas y Bobby no puede borrarlas. Si un comprobante de swap está vinculado a una cuenta, al borrar la cuenta se elimina ese vínculo; la dirección pública y el registro de la transacción pueden conservarse por motivos de seguridad, auditoría y legales. El país se infiere en el borde de la red para decidir si una función restringida está disponible; Bobby no lo guarda en tu comprobante de swap.',
            )}
          </p>
          <p>
            <Scope>{tr('Website', 'Sitio web')}</Scope>
            {strong(tr('Live voice. ', 'Voz en vivo. '))}
            {tr(
              'The iPhone app uses optional on-device dictation as described above, rather than a live audio-streaming conversation. On the website, microphone access is optional and requested when you start live voice. Live voice streams your audio directly to OpenAI to understand your question and generate spoken replies; the session also receives your selected voice, asset, timeframe, and relevant market context. Spoken replies can also be generated by ElevenLabs or Microsoft speech services. Bobby does not store raw audio recordings on its servers; providers keep data under their own terms. Live voice requires an account: we store account-linked session timing to enforce a 3-minute daily allowance that resets at 00:00 UTC. Time counts while the call is open, including muted time.',
              'La app para iPhone usa el dictado opcional en el dispositivo descrito arriba, en lugar de una conversación con transmisión de audio en vivo. En el sitio web, el acceso al micrófono es opcional y se pide cuando inicias la voz en vivo. La voz en vivo envía tu audio directamente a OpenAI para entender tu pregunta y generar respuestas habladas; la sesión también recibe la voz que elegiste, el activo, el plazo y el contexto de mercado relevante. Las respuestas habladas también pueden generarse con los servicios de voz de ElevenLabs o Microsoft. Bobby no guarda grabaciones de audio en sus servidores; los proveedores conservan los datos según sus propios términos. La voz en vivo requiere cuenta: guardamos la duración de las sesiones, vinculada a tu cuenta, para aplicar un límite diario de 3 minutos que se reinicia a las 00:00 UTC. El tiempo cuenta mientras la llamada está abierta, aunque tengas el micrófono silenciado.',
            )}
          </p>
          <p>
            <Scope>{tr('Website', 'Sitio web')}</Scope>
            {strong(tr('Early-access email list. ', 'Lista de acceso anticipado. '))}
            {tr(
              'If you joined it, we keep your email address, the language and page you used, the referring page, your browser’s user agent, the consent wording you saw and when, and a hashed IP address, only to send early-access updates. You can ask us to remove you at any time.',
              'Si te uniste, guardamos tu correo, el idioma y la página que usaste, la página de referencia, el agente de usuario de tu navegador, el texto de consentimiento que viste y cuándo, y un hash de tu dirección IP, solo para enviarte avisos de acceso anticipado. Puedes pedirnos que te quitemos de la lista cuando quieras.',
            )}
          </p>
          <p>
            <Scope>{tr('Website', 'Sitio web')}</Scope>
            {strong(tr('Analytics. ', 'Analítica. '))}
            {tr(
              'bobbyprotocol.xyz uses Vercel Web Analytics, a cookieless, aggregate page-view counter that does not identify visitors or track them across sites. The website sets no advertising or tracking cookies.',
              'bobbyprotocol.xyz usa Vercel Web Analytics, un contador agregado de visitas sin cookies que no identifica a los visitantes ni los rastrea entre sitios. El sitio no usa cookies de publicidad ni de rastreo.',
            )}
          </p>
        </Section>

        <Section title={tr('Avatar narration and community safety', 'Narración y seguridad de la comunidad')}>
          <p>
            {strong(tr('Public islands. ', 'Islas públicas. '))}
            {tr(
              'If you publish from iPhone or the website, its name and layout become visible in the public gallery and shared links until you make it private. Before publishing, the name is sent to OpenAI for content moderation. Your account ID, XP and readings are not published. Third parties may keep copies of previously shared previews.',
              'Si publicas desde iPhone o el sitio web, su nombre y distribución serán visibles en la galería y enlaces compartidos hasta que la vuelvas privada. Antes de publicar, enviamos el nombre a OpenAI para moderarlo. No publicamos tu identificador de cuenta, XP ni lecturas. Terceros pueden conservar copias de vistas previas ya compartidas.',
            )}
          </p>
          <p>{tr('Avatar introductions and style previews are bundled recordings and play without sending text to a provider. With voice enabled, dynamic reply text, language, avatar voice and style are sent to our speech endpoint and then OpenAI or Microsoft to generate audio. No Bobby account token or microphone audio accompanies that request. Muting stops narration and new speech requests, and is remembered on this device. Providers may retain requests under their own terms.', 'Las presentaciones de avatares y muestras de estilo son grabaciones incluidas en la app; no envían texto a un proveedor. Con la voz activa, enviamos el texto de respuesta, idioma, voz y estilo a nuestro servidor y después a OpenAI o Microsoft para generar audio. Esa solicitud no incluye un token de cuenta de Bobby ni audio del micrófono. Silenciar detiene la narración y nuevas solicitudes de voz; se recuerda en este dispositivo. Los proveedores pueden conservar solicitudes según sus términos.')}</p>
          <p>{tr('Reports include the island code, a snapshot of its name, reason and optional details. A random installation identifier is sent and stored only as a hash to limit duplicate reports. It is not an advertising identifier and is not linked to your Bobby account. Reports are kept in a private review queue. Resolved reports are eligible for deletion after 90 days; open reports remain until reviewed. Avoid personal information in reports. Creator blocks are stored only on this device and can be removed from Community safety.', 'Los reportes incluyen el código de la isla, una copia de su nombre, el motivo y detalles opcionales. Se envía un identificador aleatorio de instalación, guardado solo como hash para limitar duplicados. No es un identificador publicitario ni se vincula a tu cuenta de Bobby. Los reportes se guardan en una cola privada. Los resueltos pueden eliminarse después de 90 días; los abiertos se conservan hasta su revisión. Evita datos personales. Los bloqueos de creadores se guardan solo en este dispositivo y se quitan desde Seguridad de la comunidad.')}</p>
          <a className={linkClass} href={`/support?lang=${language}`}>{tr('Community rules and support', 'Reglas de la comunidad y soporte')}</a>
        </Section>

        <Section title={tr('Earlier iPhone versions', 'Versiones anteriores para iPhone')}>
          <p>
            {tr(
              'iPhone versions 1.1 and earlier offered voice features: live voice as described above, dictation with Apple speech recognition (on the device when supported, otherwise on Apple’s servers), and spoken replies from our speech providers. Builds 33–34 removed voice; build 35 restores output-only avatar narration. Version 1.5 restores optional on-device dictation as described above; live audio-streaming conversations remain website-only. If you still use an earlier version, the voice terms above also apply to it.',
              'Las versiones 1.1 y anteriores para iPhone ofrecían funciones de voz: la voz en vivo descrita arriba, dictado con el reconocimiento de voz de Apple (en el dispositivo cuando es posible y, si no, en los servidores de Apple) y respuestas habladas de nuestros proveedores de voz. Los builds 33–34 quitaron la voz; el build 35 recupera la narración de avatares. La versión 1.5 recupera el dictado opcional en el dispositivo descrito arriba; las conversaciones con transmisión de audio en vivo siguen siendo exclusivas del sitio web. Si todavía usas una versión anterior, los términos de voz de arriba también aplican.',
            )}
          </p>
        </Section>

        <Section title={tr('Service providers', 'Proveedores de servicios')}>
          <p>{tr('These processors act on our behalf, only to deliver the product:', 'Estos proveedores procesan datos en nuestro nombre, solo para prestar el servicio:')}</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>{strong('Apple')} — {tr('Sign in with Apple, on-device speech recognition on current iPhone versions, and the Bobby Pro App Store subscription (Apple processes the payment; we never see your card).', 'Iniciar sesión con Apple, reconocimiento de voz en el dispositivo en las versiones actuales para iPhone y la suscripción Bobby Pro del App Store (Apple procesa el pago; nunca vemos tu tarjeta).')}</li>
            <li>{strong('Supabase')} — {tr('authentication, synced progress, Trader Land, and product records.', 'autenticación, progreso sincronizado, Trader Land y registros del producto.')}</li>
            <li>{strong('OpenAI')} — {tr('fallback text analysis when Anthropic is unavailable, optional speech generation and public-name moderation; on the website, also live voice.', 'análisis de texto de respaldo cuando Anthropic no está disponible, narración opcional y moderación de nombres públicos; en el sitio web, también la voz en vivo.')}</li>
            <li>{strong('Anthropic')} — {tr('primary text analysis for the desk, including the short memory summary described above.', 'análisis de texto principal del desk, incluido el resumen breve de memoria descrito arriba.')}</li>
            <li>{strong('Vercel')} — {tr('hosts our backend and website, with standard, short-lived request logs.', 'aloja nuestro backend y el sitio web, con registros de solicitudes estándar y de corta duración.')}</li>
            <li>{strong(tr('Public market data sources', 'Fuentes públicas de datos de mercado'))} — {tr('prices and charts, requested with an asset symbol and timeframe only, without your account or wallet identifiers.', 'precios y gráficas, pedidos solo con el símbolo del activo y un plazo, sin identificadores de tu cuenta ni de tu wallet.')}</li>
            <li><Scope>{tr('Website', 'Sitio web')}</Scope>{strong('Google')} — {tr('optional sign-in and font delivery. Website font requests include standard connection metadata, without Bobby questions or account identifiers. The current iPhone interface uses system fonts.', 'inicio de sesión opcional y entrega de fuentes. Las solicitudes de fuentes del sitio incluyen datos estándar de conexión, sin preguntas ni identificadores de cuenta de Bobby. La interfaz actual para iPhone usa fuentes del sistema.')}</li>
            <li>{strong('RevenueCat')} — {tr('Bobby Pro subscription management on iPhone; it receives your Bobby account identifier and purchase information (product, dates, status — never card details) to validate, renew and restore access.', 'administración de la suscripción Bobby Pro en iPhone; recibe el identificador de tu cuenta de Bobby y datos de compra (producto, fechas, estado — nunca datos de tarjeta) para validar, renovar y restaurar el acceso.')}</li>
            <li><Scope>{tr('Website', 'Sitio web')}</Scope>{strong('Brevo')} — {tr('optional support-request notifications when configured; this integration is currently inactive.', 'notificaciones opcionales de solicitudes de soporte cuando se configure; esta integración está actualmente inactiva.')}</li>
            <li><Scope>{tr('Website', 'Sitio web')}</Scope>{strong('Reown')} — {tr('connection to your chosen external wallet. Not included in the iPhone app.', 'conexión con la wallet externa que elijas. No está incluido en la app para iPhone.')}</li>
            <li><Scope>{tr('Website', 'Sitio web')}</Scope>{strong('Base & Uniswap')} — {tr('public blockchain and swap-routing infrastructure.', 'infraestructura pública de blockchain y de enrutamiento de swaps.')}</li>
            <li>{strong('Microsoft')} — {tr('optional speech generation, including on iPhone.', 'narración opcional, también en iPhone.')}</li>
            <li><Scope>{tr('Website', 'Sitio web')}</Scope>{strong('ElevenLabs')} — {tr('speech generation on the website.', 'generación de voz en el sitio web.')}</li>
          </ul>
        </Section>

        <Section title={tr('What Bobby is not', 'Lo que Bobby no es')}>
          <p>
            {tr(
              'Bobby is market-analysis software, not a broker, exchange, custodian, or investment adviser. The iPhone app cannot trade or move funds. On the website, Bobby can prepare a non-custodial Base swap transaction, but it cannot execute it without your review and signature in your own external wallet. Bobby never receives seed phrases, private keys, exchange passwords, or custody of your assets.',
              'Bobby es software de análisis de mercado, no un bróker, un exchange, un custodio ni un asesor de inversiones. La app para iPhone no puede operar ni mover fondos. En el sitio web, Bobby puede preparar una transacción de swap no custodial en Base, pero no puede ejecutarla sin que tú la revises y la firmes en tu propia wallet externa. Bobby nunca recibe frases semilla, llaves privadas, contraseñas de exchanges ni la custodia de tus activos.',
            )}
          </p>
        </Section>

        <Section title={tr('Children', 'Menores de edad')}>
          <p>
            {tr(
              'Bobby and its tokenized-asset features are not directed at children under 18. We do not knowingly allow children to create accounts or use restricted financial features. If you believe a child provided personal data, contact us so we can investigate and delete it where applicable.',
              'Bobby y sus funciones de activos tokenizados no están dirigidos a menores de 18 años. No permitimos a sabiendas que menores creen cuentas ni usen funciones financieras restringidas. Si crees que un menor nos dio datos personales, contáctanos para investigarlo y borrarlos cuando corresponda.',
            )}
          </p>
        </Section>

        <Section title={tr('Changes', 'Cambios')}>
          <p>
            {tr(
              'If our data practices change, we will update this page and its effective date before the change ships. Material changes will also be reflected in the App Store listing’s privacy details.',
              'Si cambian nuestras prácticas de datos, actualizaremos esta página y su fecha de vigencia antes de que el cambio entre en funcionamiento. Los cambios importantes también se reflejarán en los detalles de privacidad de la ficha del App Store.',
            )}
          </p>
        </Section>

        <Section title={tr('Contact', 'Contacto')}>
          <p>
            {tr('For privacy questions or requests to access, correct or delete your data, use the ', 'Para dudas de privacidad o solicitudes de acceso, corrección o borrado de tus datos, usa el ')}
            <a href={`/support?lang=${language}#contact`} className={linkClass}>{tr('private support form', 'formulario privado de soporte')}</a>.
            {tr(' It sends your message and optional reply email to Bobby’s private support queue. It does not publish them as a GitHub issue. Include only the information needed to explain the request, never passwords or identity documents. Support requests have no automatic deletion deadline; request deletion through the same form. Public GitHub issues remain available for non-sensitive bugs.', ' Envía tu mensaje y un correo opcional para responderte a la cola privada de soporte de Bobby. No los publica como un issue de GitHub. Incluye solo lo necesario para explicar la solicitud, nunca contraseñas ni documentos de identidad. Las solicitudes de soporte no tienen un plazo automático de borrado; puedes pedir que las borremos en el mismo formulario. Los issues públicos de GitHub siguen disponibles para errores que no contengan información privada.')}
          </p>
        </Section>

        <div className="mt-16 border-t border-white/[0.06] pt-6 font-mono text-[11px] uppercase tracking-[0.14em] text-white/30">
          {tr('Bobby · analysis, not advice', 'Bobby · análisis, no asesoría')}
        </div>
      </div>
    </div>
  );
}
