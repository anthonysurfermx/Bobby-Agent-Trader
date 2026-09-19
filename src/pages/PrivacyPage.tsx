// Privacy policy for the Bobby iPhone app and bobbyprotocol.xyz.
// Linked from App Store Connect and from the app — every claim here must stay
// true to the code. The per-data-type mapping lives in
// docs/app-store/build-34/APP-PRIVACY-ANSWERS.md; keep both in step.
// Scope rule: the iPhone app (1.2) is text-only analysis with an optional
// Sign in with Apple account. Anything else (wallets and wallet accounts,
// swaps, voice, Google sign-in, the website's Apple sign-in with name and
// email, public islands) is labelled website-only or earlier-iPhone-only.
// Account deletion copy must hold with or without the APPLE_SIGN_IN_* keys:
// without them the app skips Apple's sheet and shows the manual steps.
// Update EFFECTIVE_DATE whenever the substance changes.
// Language: ?lang=es|en wins (App Store Connect can link a localized URL),
// then the web's stored choice, then a Spanish browser, then English.
import type { ReactNode } from 'react';
import { Helmet } from 'react-helmet-async';
import { lang, type Lang } from '@/lib/companions/i18n';

const EFFECTIVE_DATE: Record<Lang, string> = { en: 'September 19, 2026', es: '19 de septiembre de 2026' };
const REPO_URL = 'https://github.com/anthonysurfermx/Bobby-Agent-Trader';
const APPLE_STOP_USING_URL = 'https://support.apple.com/en-us/102571';

function policyLang(): Lang {
  try {
    const requested = new URLSearchParams(window.location.search).get('lang');
    if (requested === 'es' || requested === 'en') return requested;
    const stored = localStorage.getItem('bobby_lang');
    if (!stored && navigator.language?.toLowerCase().startsWith('es')) return 'es';
  } catch { /* private mode or no window */ }
  return lang();
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 font-mono text-sm font-bold uppercase tracking-[0.18em] text-green-400">{title}</h2>
      <div className="space-y-3 text-[15px] leading-7 text-white/75">{children}</div>
    </section>
  );
}

function Scope({ children }: { children: ReactNode }) {
  return <span className="mr-2 rounded border border-amber-400/30 bg-amber-400/[0.06] px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-amber-300">{children}</span>;
}

const linkClass = 'text-green-400 underline decoration-green-400/40 underline-offset-4 hover:decoration-green-400';

export default function PrivacyPage() {
  const language = policyLang();
  const tr = (en: string, es: string) => (language === 'es' ? es : en);
  const strong = (text: string) => <span className="text-white">{text}</span>;

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <Helmet>
        <html lang={language} />
        <title>{tr('Privacy Policy | Bobby', 'Aviso de privacidad | Bobby')}</title>
        <meta
          name="description"
          content={tr(
            'Privacy policy for the Bobby iPhone app and bobbyprotocol.xyz: text-only analysis on iPhone, an optional Sign in with Apple account that syncs progress and Trader Land, no ads and no tracking.',
            'Aviso de privacidad de la app Bobby para iPhone y de bobbyprotocol.xyz: análisis solo por texto en iPhone, cuenta opcional con Iniciar sesión con Apple para sincronizar tu progreso y Trader Land, sin anuncios y sin rastreo.',
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
              'The iPhone app (version 1.2) is text-only market analysis. It does not connect wallets, prepare or execute swaps, request microphone access, record audio, recognize speech, or play spoken replies. An optional account, created with Sign in with Apple, syncs your progress and your Trader Land island.',
              'La app para iPhone (versión 1.2) ofrece análisis de mercado solo por texto. No conecta wallets, no prepara ni ejecuta swaps, no pide acceso al micrófono, no graba audio, no reconoce voz y no reproduce respuestas habladas. Una cuenta opcional, creada con Iniciar sesión con Apple, sincroniza tu progreso y tu isla de Trader Land.',
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
              'In the iPhone app, the only way to sign in is Sign in with Apple. The app does not request your name or email address from Apple, so from the app our authentication provider receives only an Apple account identifier and session credentials. (On the website you can also sign in with Apple, Google, or a wallet, and the website’s Apple sign-in asks for more; see “Website only” below.)',
              'En la app para iPhone, la única forma de iniciar sesión es Iniciar sesión con Apple. La app no le pide a Apple tu nombre ni tu correo, así que desde la app nuestro proveedor de autenticación solo recibe un identificador de tu cuenta de Apple y las credenciales de la sesión. (En el sitio web también puedes entrar con Apple, con Google o con una wallet, y el inicio de sesión con Apple del sitio pide más datos; consulta “Solo en el sitio web” más abajo).',
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
            <li>{tr('Your island’s layout and its private name.', 'La distribución de tu isla y su nombre privado.')}</li>
          </ul>
          <p>
            {tr(
              'We use this data only to run the product: to keep your progress through reinstalls and across your devices, including bobbyprotocol.xyz if you sign in there with the same Apple ID. In the iPhone app your island stays private; the app does not publish it.',
              'Usamos estos datos solo para que el producto funcione: para conservar tu progreso si reinstalas la app y en todos tus dispositivos, incluido bobbyprotocol.xyz si ahí entras con el mismo Apple ID. En la app para iPhone tu isla es privada; la app no la publica.',
            )}
          </p>
        </Section>

        <Section title={tr('Questions and market analysis', 'Preguntas y análisis de mercado')}>
          <p>
            {tr(
              'Before your first question, the app asks for your permission to send questions to OpenAI. When you ask, the app sends your question, the asset, and your language to our backend. The backend sends the question and public market context for that asset to OpenAI, which produces the three perspectives. This request does not include your Bobby account identifier.',
              'Antes de tu primera pregunta, la app te pide permiso para enviar tus preguntas a OpenAI. Cuando preguntas, la app envía tu pregunta, el activo y tu idioma a nuestro backend. El backend envía la pregunta y el contexto público de mercado de ese activo a OpenAI, que genera las tres perspectivas. Esta solicitud no incluye el identificador de tu cuenta de Bobby.',
            )}
          </p>
          <p>
            {tr(
              'Bobby does not store your questions, does not add them to your account, and keeps no conversation history on its servers. To work out which asset you mean, the app also sends your question to our asset search, which does not store it either. OpenAI processes API requests, and may keep them for a limited time, under its own terms. Please do not include personal information, account numbers, passwords, or financial account details in your questions.',
              'Bobby no guarda tus preguntas, no las agrega a tu cuenta y no conserva historial de conversaciones en sus servidores. Para identificar de qué activo hablas, la app también envía tu pregunta a nuestro buscador de activos, que tampoco la guarda. OpenAI procesa las solicitudes de su API, y puede conservarlas por un tiempo limitado, según sus propios términos. No incluyas datos personales, números de cuenta, contraseñas ni datos de tus cuentas financieras en tus preguntas.',
            )}
          </p>
          <p>
            {tr(
              'Prices and charts come from public market data sources and are requested with only an asset symbol and a timeframe.',
              'Los precios y las gráficas vienen de fuentes públicas de datos de mercado y se piden solo con el símbolo del activo y un plazo.',
            )}
          </p>
        </Section>

        <Section title={tr('Usage limits, security, and logs', 'Límites de uso, seguridad y registros')}>
          <p>
            {tr(
              'To prevent abuse and control costs, the analysis desk limits requests per network address. We keep only a salted cryptographic hash of your IP address, never the address itself, in counters that expire after 24 hours and are deleted within about two days. Other endpoints use the same technique.',
              'Para evitar abusos y controlar costos, el desk de análisis limita las solicitudes por dirección de red. Solo guardamos un hash criptográfico con sal de tu dirección IP, nunca la dirección misma, en contadores que vencen a las 24 horas y se borran en un plazo aproximado de dos días. Otros servicios usan la misma técnica.',
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
              'On iPhone, open the “…” menu on the desk and choose “Delete account” (or open “Progress saved · account” and choose “Delete account and synced progress”), then confirm. When Bobby can revoke its Sign in with Apple access automatically, the app first asks you to confirm with Apple once more. It then deletes your account, your synced progress, and your Trader Land data.',
              'En iPhone, abre el menú “…” del desk y elige “Eliminar cuenta” (o abre “Progreso guardado · cuenta” y elige “Borrar cuenta y progreso sincronizado”), y confirma. Cuando Bobby puede revocar automáticamente su acceso de Iniciar sesión con Apple, la app primero te pide confirmar una vez más con Apple. Después borra tu cuenta, tu progreso sincronizado y tus datos de Trader Land.',
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
              'Unlike the iPhone app, the website asks Apple for your name and email address (Apple may give us a private relay address instead of your real one). Bobby uses them only to identify your account. If you use the same Apple ID in the iPhone app, they are stored with that same account.',
              'A diferencia de la app para iPhone, el sitio web le pide a Apple tu nombre y tu correo (Apple puede darnos una dirección de reenvío privada en lugar de tu correo real). Bobby solo los usa para identificar tu cuenta. Si usas el mismo Apple ID en la app para iPhone, se guardan en esa misma cuenta.',
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
              'Bobby for iPhone 1.2 does not request microphone access, record audio, or play spoken replies. On the website, microphone access is optional and requested when you start voice. Live voice streams your audio directly to OpenAI to understand your question and generate spoken replies; the session also receives your selected voice, asset, timeframe, and relevant market context. Spoken replies can also be generated by ElevenLabs or Microsoft speech services. Bobby does not store raw audio recordings on its servers; providers keep data under their own terms. Live voice requires an account: we store account-linked session timing to enforce a 3-minute daily allowance that resets at 00:00 UTC. Time counts while the call is open, including muted time.',
              'Bobby para iPhone 1.2 no pide acceso al micrófono, no graba audio y no reproduce respuestas habladas. En el sitio web, el acceso al micrófono es opcional y se pide cuando inicias la voz. La voz en vivo envía tu audio directamente a OpenAI para entender tu pregunta y generar respuestas habladas; la sesión también recibe la voz que elegiste, el activo, el plazo y el contexto de mercado relevante. Las respuestas habladas también pueden generarse con los servicios de voz de ElevenLabs o Microsoft. Bobby no guarda grabaciones de audio en sus servidores; los proveedores conservan los datos según sus propios términos. La voz en vivo requiere cuenta: guardamos la duración de las sesiones, vinculada a tu cuenta, para aplicar un límite diario de 3 minutos que se reinicia a las 00:00 UTC. El tiempo cuenta mientras la llamada está abierta, aunque tengas el micrófono silenciado.',
            )}
          </p>
          <p>
            <Scope>{tr('Website', 'Sitio web')}</Scope>
            {strong(tr('Public islands. ', 'Islas públicas. '))}
            {tr(
              'If you publish your Trader Land island on the website, its name and layout are visible to anyone in the public gallery until you make it private again, which you can also do from the iPhone app.',
              'Si publicas tu isla de Trader Land en el sitio web, cualquier persona puede ver su nombre y su distribución en la galería pública hasta que la vuelvas privada, algo que también puedes hacer desde la app para iPhone.',
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

        <Section title={tr('Earlier iPhone versions', 'Versiones anteriores para iPhone')}>
          <p>
            {tr(
              'iPhone versions 1.1 and earlier offered voice features: live voice as described above, dictation with Apple speech recognition (on the device when supported, otherwise on Apple’s servers), and spoken replies from our speech providers. Version 1.2 removes these features. If you still use an earlier version, the voice terms above also apply to it.',
              'Las versiones 1.1 y anteriores para iPhone ofrecían funciones de voz: la voz en vivo descrita arriba, dictado con el reconocimiento de voz de Apple (en el dispositivo cuando es posible y, si no, en los servidores de Apple) y respuestas habladas de nuestros proveedores de voz. La versión 1.2 elimina estas funciones. Si todavía usas una versión anterior, los términos de voz de arriba también aplican.',
            )}
          </p>
        </Section>

        <Section title={tr('Service providers', 'Proveedores de servicios')}>
          <p>{tr('These processors act on our behalf, only to deliver the product:', 'Estos proveedores procesan datos en nuestro nombre, solo para prestar el servicio:')}</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>{strong('Apple')} — {tr('Sign in with Apple (and, in earlier iPhone versions, speech recognition).', 'Iniciar sesión con Apple (y, en versiones anteriores para iPhone, reconocimiento de voz).')}</li>
            <li>{strong('Supabase')} — {tr('authentication, synced progress, Trader Land, and product records.', 'autenticación, progreso sincronizado, Trader Land y registros del producto.')}</li>
            <li>{strong('OpenAI')} — {tr('the text analysis behind the three perspectives; on the website, also live voice.', 'el análisis de texto detrás de las tres perspectivas; en el sitio web, también la voz en vivo.')}</li>
            <li>{strong('Vercel')} — {tr('hosts our backend and website, with standard, short-lived request logs.', 'aloja nuestro backend y el sitio web, con registros de solicitudes estándar y de corta duración.')}</li>
            <li>{strong(tr('Public market data sources', 'Fuentes públicas de datos de mercado'))} — {tr('prices and charts, requested with an asset symbol and timeframe only, without your account or wallet identifiers.', 'precios y gráficas, pedidos solo con el símbolo del activo y un plazo, sin identificadores de tu cuenta ni de tu wallet.')}</li>
            <li><Scope>{tr('Website', 'Sitio web')}</Scope>{strong('Google')} — {tr('optional sign-in.', 'inicio de sesión opcional.')}</li>
            <li><Scope>{tr('Website', 'Sitio web')}</Scope>{strong('Reown')} — {tr('connection to your chosen external wallet. Not included in the iPhone app.', 'conexión con la wallet externa que elijas. No está incluido en la app para iPhone.')}</li>
            <li><Scope>{tr('Website', 'Sitio web')}</Scope>{strong('Base & Uniswap')} — {tr('public blockchain and swap-routing infrastructure.', 'infraestructura pública de blockchain y de enrutamiento de swaps.')}</li>
            <li><Scope>{tr('Website', 'Sitio web')}</Scope>{strong('ElevenLabs & Microsoft')} — {tr('speech generation for voice replies.', 'generación de voz para las respuestas habladas.')}</li>
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
            {tr('For questions about this policy or requests about your data (access, correction, or deletion), open an issue at ', 'Para dudas sobre este aviso o solicitudes sobre tus datos (acceso, corrección o eliminación), abre un issue en ')}
            <a href={REPO_URL} className={linkClass}>github.com/anthonysurfermx/Bobby-Agent-Trader</a>
            {tr(
              '. Issues there are public, so do not include personal information: say that you have a privacy request and we will reply there with a private way to continue.',
              '. Los issues son públicos, así que no incluyas datos personales: indica que tienes una solicitud de privacidad y te responderemos ahí con una forma privada de continuar.',
            )}
          </p>
        </Section>

        <div className="mt-16 border-t border-white/[0.06] pt-6 font-mono text-[11px] uppercase tracking-[0.14em] text-white/30">
          {tr('Bobby · analysis, not advice', 'Bobby · análisis, no asesoría')}
        </div>
      </div>
    </div>
  );
}
