// Privacy policy for the Bobby iPhone app and bobbyprotocol.xyz.
// Linked from App Store Connect and from the app — every claim here must stay
// true to the code. The per-data-type mapping lives in
// docs/app-store/build-35/APP-PRIVACY-ANSWERS.md; keep both in step.
// Scope: iOS supports typed or dictated analysis, optional narration and public islands. From 1.7 dictation is
// recognized on the iPhone when the language is installed, otherwise by Apple's speech service (NucleoSpeech.swift);
// previews without a bundled clip use the device voice before AI consent and the network voice after it (NeuralVoice.swift).
// Live audio streaming, wallet connections and swaps remain website-only.
// Build 53 adds Bobby Pro market briefings and the account memory screen on iPhone. Build 54 adds a
// separate, account-scoped native desk memory opt-in that is off by default on each iPhone;
// the briefings copy must match docs/product/pro-market-briefings-implementation.md (D1, D2, D10, D11)
// and api/_lib/briefings/config.ts (RETENTION, PUSH_COPY). Native desk memory requires the local opt-in,
// BOBBY_MEMORY=on, and the account's server memory preference enabled.
// Account deletion copy must hold with or without the APPLE_SIGN_IN_* keys:
// without them the app skips Apple's sheet and shows the manual steps.
// Update EFFECTIVE_DATE whenever the substance changes.
// Language: a supported ?lang value wins, then the saved choice and browser locale.
import type { ReactNode } from 'react';
import { Helmet } from 'react-helmet-async';
import NucleoTopBar from '@/components/protocol/NucleoTopBar';
import { useNucleoPages } from '@/hooks/useNucleoPages';
import { lang, LANGS, LANG_NAME, htmlLang, translateText, type Lang } from '@/lib/companions/i18n';
import { appLanguage, isAppLanguage } from '@/lib/app-language';
import { clientLanguagePath } from '@/lib/client-language';

type PolicyLang = Lang;
const EFFECTIVE_DATE: Record<PolicyLang, string> = {
  en: 'October 3, 2026', es: '3 de octubre de 2026', fr: '3 octobre 2026',
  pt: '3 de outubro de 2026', it: '3 ottobre 2026', de: '3. Oktober 2026',
};
const APPLE_STOP_USING_URL = 'https://support.apple.com/en-us/102571';

function policyLang(): PolicyLang {
  try {
    const requested = new URLSearchParams(window.location.search).get('lang');
    if (isAppLanguage(requested?.toLowerCase().split(/[-_]/)[0])) return appLanguage(requested);
  } catch { /* private mode or no window */ }
  return lang();
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
  const tr = (en: string, es: string) => (language === 'es' ? es : translateText(language, en));
  const strong = (text: string) => <span className="text-white">{text}</span>;

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <NucleoTopBar />
      <Helmet>
        <html lang={htmlLang()} />
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
          <nav aria-label={tr('Language', 'Idioma')} className="flex flex-wrap gap-3 font-mono text-[11px] font-bold uppercase tracking-[0.14em]">
            {LANGS.map(code => <a key={code} href={`?lang=${code}`} title={LANG_NAME[code]} aria-current={language === code ? 'true' : undefined} className={language === code ? 'text-white' : 'text-white/40 hover:text-white'}>{code.toUpperCase()}</a>)}
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
              'The iPhone app (version 1.5, build 45 onward) offers typed or dictated market questions, optional reply narration and Trader Land exploration. Dictation uses the microphone only while you hold the button, with your permission. From version 1.7, it is transcribed on your iPhone when the language is installed; otherwise, and only after you allow it, Apple’s speech service transcribes it. Bobby does not store the audio, and you can always type instead. The app does not connect wallets or execute trades. An optional Sign in with Apple account syncs progress and lets you publish your island; some analysis levels require an account and have usage limits. Bobby Pro subscribers can also opt in to scheduled market briefings with notifications.',
              'La app para iPhone (versión 1.5, build 45 en adelante) ofrece preguntas de mercado por escrito o dictadas, narración opcional y exploración de Trader Land. El dictado usa el micrófono solo mientras mantienes pulsado el botón, con tu permiso. Desde la versión 1.7, se transcribe en tu iPhone si el idioma está instalado; si no, y solo después de que lo permitas, lo transcribe el servicio de voz de Apple. Bobby no guarda el audio y siempre puedes escribir. La app no conecta wallets ni ejecuta operaciones. Una cuenta opcional con Iniciar sesión con Apple sincroniza el progreso y permite publicar tu isla; algunos niveles de análisis requieren cuenta y tienen límites de uso. Quienes tienen Bobby Pro también pueden activar resúmenes de mercado programados con notificaciones.',
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
              'When you are signed in with Apple or Google and ask on the website’s desk, Bobby remembers, for each asset symbol you asked about, how many times you asked, the first and last ask dates, recent ask dates, the last public market price, and the time horizon your last question named (such as today or weeks), if any. It also keeps the preferences you set yourself under “What Bobby remembers” in your profile: your usual horizon, your experience, and the level of risk you prefer explained. Bobby does not infer these profile preferences or store your full questions.',
              'Si iniciaste sesión con Apple o Google y preguntas en el desk del sitio web, Bobby recuerda, por cada símbolo de activo que preguntaste, cuántas veces preguntaste, las fechas de la primera y última consulta, fechas recientes de consulta, el último precio público de mercado y el horizonte de tiempo que mencionó tu última pregunta (como hoy o semanas), si lo hubo. También guarda las preferencias que tú eliges en “Lo que Bobby recuerda” dentro de tu perfil: tu horizonte habitual, tu experiencia y el nivel de riesgo que prefieres ver explicado. Bobby no deduce estas preferencias de perfil ni guarda tus preguntas completas.',
            )}
          </p>
          <p>
            {tr(
              'Bobby uses this memory only to frame its answers for you: the analysis request then also carries a short summary of it (your first name from your Apple or Google profile when it shares one, your preferences and how often you asked about assets, including this week, and the asset’s market price when you last asked, so Bobby can say how it moved since), never your email or account identifier. That summary is sent to the AI provider that writes the answer: OpenAI or Anthropic, including when one provider takes over because the other has exhausted credit or limits requests. It never changes the verdict. It is not used for ads and is not shared or sold. An asset you do not ask about for 90 days is erased automatically. In your profile you can see all of it, correct your preferences, forget one asset or everything, or pause memory. Deleting your account deletes it too.',
              'Bobby usa esta memoria solo para darle forma a sus respuestas para ti: la solicitud de análisis lleva entonces un resumen breve (tu nombre de pila de tu perfil de Apple o Google cuando lo comparte, tus preferencias y cuántas veces preguntaste por cada activo, incluida esta semana, y el precio de mercado del activo la última vez que preguntaste, para que Bobby te diga cuánto se movió desde entonces), nunca tu correo ni el identificador de tu cuenta. Ese resumen se envía al proveedor de IA que escribe la respuesta: OpenAI o Anthropic, también cuando un proveedor sustituye al otro por crédito agotado o solicitudes limitadas. Nunca cambia el veredicto. No se usa para anuncios y no se comparte ni se vende. Un activo por el que no preguntas en 90 días se borra solo. En tu perfil puedes verla completa, corregir tus preferencias, olvidar un activo o todo, o pausar la memoria. Si borras tu cuenta, también se borra.',
            )}
          </p>
          <p>
            {tr(
              'In the iPhone app, Profile → Memory shows this same account memory and lets you correct preferences, forget one asset or everything, or pause memory across the account. From build 54, “Include iPhone questions” is a separate choice, off by default on each iPhone, even if web memory is on. Only after you turn it on for the signed-in account, and while account memory is enabled, answered iPhone desk questions can add the asset symbol, count and dates of asks, last named horizon and last public market price to memory for up to 90 days. Bobby does not save the full question or your name in memory. Turning the iPhone choice off stops later iPhone requests on that device from using memory; pausing account memory stops it across web and iPhone. When enabled, the iPhone desk may send the same short memory summary described above to the AI provider writing your answer. Briefings use a separate memory consent and never send your memory to an AI provider; see “Market briefings and notifications (Bobby Pro)” below.',
              'En la app para iPhone, Perfil → Memoria muestra esta misma memoria de tu cuenta y te permite corregir preferencias, olvidar un activo o todo, o pausar la memoria en toda la cuenta. Desde el build 54, “Incluir preguntas del iPhone” es una elección aparte, desactivada de forma predeterminada en cada iPhone, aunque la memoria web esté activa. Solo después de activarla para la cuenta con sesión iniciada, y mientras la memoria de la cuenta esté activa, las preguntas respondidas en el desk del iPhone pueden sumar a la memoria el símbolo del activo, número y fechas de consultas, último horizonte indicado y último precio público de mercado, hasta por 90 días. Bobby no guarda la pregunta completa ni tu nombre en la memoria. Desactivar esta opción impide que las solicitudes posteriores del iPhone usen memoria en ese dispositivo; pausar la memoria de la cuenta la detiene en web y iPhone. Cuando está activa, el desk del iPhone puede enviar al proveedor de IA que escribe tu respuesta el mismo resumen breve de memoria descrito arriba. Los resúmenes de mercado usan un consentimiento de memoria aparte y nunca envían tu memoria a un proveedor de IA; consulta “Resúmenes de mercado y notificaciones (Bobby Pro)” más abajo.',
            )}
          </p>
        </Section>

        <Section title={tr('Questions and market analysis', 'Preguntas y análisis de mercado')}>
          <p>
            {tr(
              'Before processing a question, the app asks for your permission to use external AI. When you ask, it sends the question text, asset, language and analysis level to our backend. Every level normally uses Anthropic (Claude). If a provider has exhausted credit or limits requests, the other provider (OpenAI or Anthropic) can perform the same analysis roles, subject to availability and the same usage limits. The providers receive your question and public market context to produce the analysis. The backend also receives the installation identifier and, when signed in, account credentials for access checks and usage limits; these identifiers are not included in the AI analysis payload. If you separately enable iPhone memory, the provider writing the answer may also receive the short memory summary described above; without that choice, the iPhone desk does not use or add to account memory.',
              'Antes de procesar una pregunta, la app pide tu permiso para usar IA externa. Cuando preguntas, envía el texto, el activo, el idioma y el nivel de análisis a nuestro backend. Todos los niveles usan normalmente Anthropic (Claude). Si un proveedor agota su crédito o limita las solicitudes, el otro proveedor (OpenAI o Anthropic) puede realizar los mismos roles de análisis, según disponibilidad y con los mismos límites de uso. Los proveedores reciben tu pregunta y el contexto público de mercado para producir el análisis. El backend también recibe el identificador de instalación y, si iniciaste sesión, credenciales de cuenta para comprobar el acceso y los límites de uso; estos identificadores no se incluyen en el contenido de análisis enviado a la IA. Si activas por separado la memoria del iPhone, el proveedor que escribe la respuesta puede recibir también el resumen breve de memoria descrito arriba; sin esa elección, el desk del iPhone no usa ni agrega datos a la memoria de la cuenta.',
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
          <p>{tr('Dictation is optional and typing is always available. Bobby listens only while you hold the button, for at most 60 seconds, once you have allowed the microphone and speech recognition in iOS. From iPhone version 1.7, your speech is transcribed on the iPhone when Apple’s recognition for the app language is installed on it; otherwise, and only after you have allowed speech recognition, the audio goes to Apple’s speech service, which transcribes it in the same language and handles it under its own terms. Bobby does not store the audio and does not receive it on its servers. In versions 1.5 and 1.6, dictation ran only on the iPhone. If recognition is unavailable or you decline the permission, use the keyboard. The resulting question text is processed like a typed question. On the website, dictation uses your browser’s speech recognition, as before; the browser may send audio to its own speech service.', 'El dictado es opcional y siempre puedes escribir. Bobby escucha solo mientras mantienes pulsado el botón, durante un máximo de 60 segundos, una vez que permites el micrófono y el reconocimiento de voz en iOS. Desde la versión 1.7 para iPhone, tu voz se transcribe en el iPhone si el reconocimiento de Apple para el idioma de la app está instalado en él; si no, y solo después de que hayas permitido el reconocimiento de voz, el audio va al servicio de voz de Apple, que lo transcribe en ese mismo idioma y lo trata según sus propios términos. Bobby no guarda el audio ni lo recibe en sus servidores. En las versiones 1.5 y 1.6, el dictado funcionaba solo en el iPhone. Si el reconocimiento no está disponible o rechazas el permiso, usa el teclado. El texto resultante se procesa como una pregunta escrita. En el sitio web, el dictado usa el reconocimiento de voz de tu navegador, como antes; el navegador puede enviar audio a su propio servicio de voz.')}</p>
          <p>{tr('You can withdraw AI consent from Profile → Risk notice → Withdraw AI consent. This stops future AI analysis and generated-speech requests in the app until you agree again; it does not erase requests already processed by providers. Withdrawal does not delete your account or locally saved content. The full notice includes privacy and support links. To disable microphone access separately, use iOS Settings → Bobby; to silence replies, turn narration off in Profile or Squad.', 'Puedes retirar el consentimiento de IA en Perfil → Aviso de riesgo → Retirar consentimiento de IA. Esto detiene nuevas solicitudes de análisis y voz generada en la app hasta que vuelvas a aceptar; no borra las solicitudes ya procesadas por los proveedores. Retirarlo no borra tu cuenta ni el contenido guardado localmente. El aviso completo incluye enlaces de privacidad y soporte. Para desactivar el micrófono por separado, usa Configuración de iOS → Bobby; para silenciar respuestas, desactiva la narración en Perfil o Squad.')}</p>
        </Section>

        <Section title={tr('Market briefings and notifications (Bobby Pro)', 'Resúmenes de mercado y notificaciones (Bobby Pro)')}>
          <p>
            {tr(
              'Starting with iPhone build 53, a signed-in Bobby Pro subscriber can choose in Profile → Market briefings up to three scheduled briefings: market opening (08:00 New York time), market close and weekly. Each one is off until you turn it on; a schedule that is not offered yet is shown as pending. Notifications also need your permission in iOS, which you can withdraw at any time in iOS Settings.',
              'A partir del build 53 para iPhone, quien tiene Bobby Pro y la sesión iniciada puede elegir en Perfil → Resúmenes de mercado hasta tres resúmenes programados: apertura del mercado (08:00, hora de Nueva York), cierre del mercado y semanal. Cada uno está desactivado hasta que lo activas; un horario que todavía no se ofrece aparece como pendiente. Las notificaciones también necesitan tu permiso en iOS, que puedes retirar cuando quieras en Configuración de iOS.',
            )}
          </p>
          <p>{tr('For each account that uses briefings, Bobby stores:', 'Por cada cuenta que usa los resúmenes, Bobby guarda:')}</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>{tr('Your three briefing choices, the briefing language, the companion you selected (which sets the narration voice) and the assets you follow (up to six).', 'Tus tres elecciones de resúmenes, el idioma, el compañero que elegiste (que define la voz de la narración) y los activos que sigues (hasta seis).')}</li>
            <li>{tr('Your consent choices: whether briefings may use your memory and whether they may be narrated, the version of each notice you accepted and when you accepted it.', 'Tus elecciones de consentimiento: si los resúmenes pueden usar tu memoria y si pueden narrarse, la versión de cada aviso que aceptaste y cuándo lo aceptaste.')}</li>
            <li>{tr('Your reports: their text, period and schedule, and the market evidence they were built from (prices, data timestamps, sources and their freshness). When a report used your memory, Bobby also records that it did and which assets from your memory it used, so it can withdraw that report if you change your mind.', 'Tus reportes: su texto, periodo y horario, y la evidencia de mercado con la que se hicieron (precios, horas de los datos, fuentes y qué tan recientes eran). Cuando un reporte usó tu memoria, Bobby también registra que la usó y qué activos de tu memoria tomó, para poder retirarlo si cambias de opinión.')}</li>
            <li>{tr('For each iPhone where you enable briefing notifications: a random installation identifier, the Apple push token encrypted (plus a keyed fingerprint of it to prevent duplicate registrations), the notification permission iOS reports, the app build, the push environment, a hash of a device credential kept in the iPhone’s Keychain, and delivery records (when each notification was queued, accepted by Apple or failed, and Apple’s response code).', 'Por cada iPhone donde activas las notificaciones de resúmenes: un identificador aleatorio de instalación, el token de notificaciones de Apple cifrado (más una huella con clave para evitar registros duplicados), el permiso de notificaciones que reporta iOS, el build de la app, el entorno de notificaciones, un hash de una credencial del dispositivo guardada en el Keychain del iPhone y los registros de entrega (cuándo se puso en cola cada notificación, cuándo la aceptó Apple o falló, y el código de respuesta de Apple).')}</li>
            <li>{tr('Encrypted receipts of recent requests, kept for 24 hours so a retried request is not applied twice.', 'Comprobantes cifrados de solicitudes recientes, que se guardan 24 horas para que una solicitud repetida no se aplique dos veces.')}</li>
          </ul>
          <p>
            {tr(
              'The lock-screen notification is generic: it says only “Bobby has your market briefing ready” and carries an opaque report reference, with no name, asset symbols, prices or other figures. Apple delivers it through the Apple Push Notification service, which receives the push token and that generic content. Bobby can confirm only that Apple accepted a notification, not that it reached your iPhone. Opening a briefing always checks again that you are signed in to the account that owns it and that it has Pro.',
              'La notificación de la pantalla bloqueada es genérica: solo dice “Bobby tiene tu resumen de mercado listo” y lleva una referencia opaca al reporte, sin nombre, símbolos de activos, precios ni otras cifras. Apple la entrega mediante su servicio de notificaciones push (APNs), que recibe el token y ese contenido genérico. Bobby solo puede confirmar que Apple aceptó una notificación, no que llegó a tu iPhone. Al abrir un resumen siempre se vuelve a comprobar que iniciaste sesión con la cuenta dueña del reporte y que esa cuenta tiene Pro.',
            )}
          </p>
          <p>
            {tr(
              'Report text is shared market content composed for your account. The market overview, asset sections, risks and agenda are written once per briefing period and language from public market data, by Anthropic or OpenAI, or formatted directly from the data when they are unavailable, and the same text serves every subscriber who receives those sections. The AI providers receive public market data and the list of assets to cover, with no account identifier, name, preference or memory summary. Bobby then assembles your report on its own servers by selecting the sections for the assets you follow. Prices and other figures in a report come from the market data, not from the AI.',
              'El texto de los reportes es contenido de mercado compartido, armado para tu cuenta. El panorama del mercado, las secciones de activos, los riesgos y la agenda se escriben una vez por periodo e idioma a partir de datos públicos de mercado, con Anthropic u OpenAI, o se formatean directamente con los datos cuando esos proveedores no están disponibles, y el mismo texto sirve a todas las personas suscritas que reciben esas secciones. Los proveedores de IA reciben datos públicos de mercado y la lista de activos que hay que cubrir, sin identificador de cuenta, nombre, preferencias ni resumen de memoria. Después, Bobby arma tu reporte en sus propios servidores eligiendo las secciones de los activos que sigues. Los precios y demás cifras de un reporte vienen de los datos de mercado, no de la IA.',
            )}
          </p>
          <p>
            {tr(
              'Only if you give the separate memory consent and your memory is on, Bobby may use the memory described in “What Bobby remembers” to shape your report: adding sections for assets you ask about often and adjusting how much explanation you get to the experience and risk preference you chose. That selection happens on Bobby’s servers; your memory and your name are never sent to an AI provider for briefings. This personalization is enabled separately and may still be off even when you have given the consent.',
              'Solo si das el consentimiento aparte de memoria y tu memoria está activa, Bobby puede usar la memoria descrita en “Lo que Bobby recuerda” para darle forma a tu reporte: agregar secciones de activos por los que preguntas seguido y ajustar cuánta explicación recibes según la experiencia y la preferencia de riesgo que elegiste. Esa selección ocurre en los servidores de Bobby; tu memoria y tu nombre nunca se envían a un proveedor de IA para los resúmenes. Esta personalización se habilita por separado y puede seguir desactivada aunque hayas dado el consentimiento.',
            )}
          </p>
          <p>
            {tr(
              'If you allow narration (a separate audio consent), the app requests briefing audio with your account token. Bobby’s server checks that the report is yours, that you have Pro and that the consent is current, and sends only the shared report text, its language and the voice to OpenAI to synthesize the audio. No account token, name or other personal data is sent to OpenAI. Because the narrated text is shared, the same audio can serve several subscribers; it is kept in private storage and served only to signed-in owners of a report that uses it, never at a public link. Narration does not include your name: any greeting with your name uses the name stored on your iPhone, which is not uploaded.',
              'Si permites la narración (un consentimiento de audio aparte), la app pide el audio del resumen con el token de tu cuenta. El servidor de Bobby comprueba que el reporte es tuyo, que tienes Pro y que el consentimiento está vigente, y envía a OpenAI solo el texto compartido del reporte, su idioma y la voz para sintetizar el audio. A OpenAI no se envía ningún token de cuenta, nombre ni otro dato personal. Como el texto narrado es compartido, el mismo audio puede servir a varias personas suscritas; se guarda en un almacenamiento privado y solo se entrega con la sesión iniciada a quien es dueño de un reporte que lo usa, nunca en un enlace público. La narración no incluye tu nombre: si un saludo usa tu nombre, es el que está guardado en tu iPhone, que no se sube.',
            )}
          </p>
          <p>
            {tr(
              'Retention values in effect at launch: reports, 90 days; narration audio, 14 days; notification delivery records, 30 days; registrations of iPhones that were removed or that Apple reports as no longer valid, 30 days after that; request receipts, 24 hours; shared market evidence and text, 120 days. Records of each AI or speech request and its cost contain no personal data and are kept up to 400 days. If these values change, we will update this page.',
              'Plazos de conservación vigentes al lanzamiento: reportes, 90 días; audio de narración, 14 días; registros de entrega de notificaciones, 30 días; registros de iPhones que se quitaron o que Apple reporta como no válidos, 30 días después de eso; comprobantes de solicitudes, 24 horas; evidencia y texto de mercado compartidos, 120 días. Los registros de cada solicitud de IA o de voz y su costo no contienen datos personales y se conservan hasta 400 días. Si estos plazos cambian, actualizaremos esta página.',
            )}
          </p>
          <p>
            {tr(
              'Turning a briefing off stops future reports of that kind and cancels its notifications not yet sent; reports you already received stay readable while you have Pro, until they expire. If Pro ends, no new reports are prepared or sent and saved reports cannot be opened. Withdrawing the memory consent or pausing memory withdraws memory-based reports that have not been delivered yet; deleting your memory also removes memory-based reports already delivered, and forgetting one asset removes the reports that used it. Deleting your account deletes your briefing settings, reports, iPhone registrations and delivery records. Shared market text and audio contain nothing about you and expire on the schedule above.',
              'Desactivar un resumen detiene los reportes futuros de ese tipo y cancela sus notificaciones aún no enviadas; los reportes que ya recibiste se pueden leer mientras tengas Pro, hasta que venzan. Si Pro termina, no se preparan ni se envían reportes nuevos y los reportes guardados no se pueden abrir. Retirar el consentimiento de memoria o pausar la memoria retira los reportes basados en memoria que aún no se entregan; borrar tu memoria también elimina los reportes basados en memoria ya entregados, y olvidar un activo elimina los reportes que lo usaron. Borrar tu cuenta borra tus ajustes de resúmenes, reportes, registros de iPhone y registros de entrega. El texto y el audio de mercado compartidos no contienen nada sobre ti y vencen según los plazos de arriba.',
            )}
          </p>
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
          <p>
            {tr(
              'To understand how people find and use Bobby, the website records first-party usage events (page visits, App Store link clicks, sign-in starts and the free-limit screen) with the same salted install hash, the section of the site, the referring site’s domain, and the approximate country and state or region our host derives from the request (the IP address itself is not stored with these events). Our servers also record the outcome of each analysis request (response emitted by the server, failed, or stopped by a sign-in, payment or level limit), on the website and in the iPhone app. Our server forwards these same events to Amplitude, our product-analytics processor, to chart funnels and retention: the salted install hash, your Bobby account identifier when signed in, the event, its time and the fields listed above — never your IP address, email, questions or device details. Our server also sends production subscription events (purchase, renewal, cancellation and refund), linked to the same Bobby account identifier, with the product, billing provider, time, amount and currency to measure conversion and revenue. Team traffic and automated crawlers are excluded. No cookies, advertising identifiers or analytics SDKs run in the website or the app; website traffic is also counted in aggregate by our host (Vercel Web Analytics). Account creation, read and subscription dates are reviewed in aggregate to measure activation and retention.',
              'Para entender cómo la gente encuentra y usa Bobby, el sitio registra eventos de uso propios (visitas a páginas, clics al enlace de App Store, inicios de sesión y la pantalla de límite gratis) con el mismo hash con sal del identificador de instalación, la sección del sitio, el dominio del sitio de origen y el país y estado o región aproximados que nuestro proveedor de hosting deriva de la solicitud (la dirección IP no se guarda con estos eventos). Nuestros servidores también registran el resultado de cada solicitud de análisis (respuesta emitida por el servidor, fallida o detenida por un límite de inicio de sesión, pago o nivel), en el sitio web y en la app para iPhone. Nuestro servidor envía estos mismos eventos a Amplitude, nuestro proveedor de analítica de producto, para graficar embudos y retención: el hash con sal de la instalación, el identificador de tu cuenta de Bobby si iniciaste sesión, el evento, su hora y los campos de arriba — nunca tu dirección IP, correo, preguntas ni datos del dispositivo. Nuestro servidor también envía eventos de suscripción de producción (compra, renovación, cancelación y reembolso), vinculados al mismo identificador de cuenta de Bobby, con el producto, proveedor de cobro, hora, importe y moneda para medir conversión e ingresos. El tráfico del equipo y los rastreadores automáticos quedan fuera. No corren cookies, identificadores publicitarios ni SDKs de analítica en el sitio ni en la app; nuestro proveedor de hosting también cuenta el tráfico del sitio de forma agregada (Vercel Web Analytics). Las fechas de creación de cuenta, lecturas y suscripción se revisan de forma agregada para medir activación y retención.',
            )}
          </p>
          <p>{tr(
            'Instrumented versions of the website and iPhone app also send first-party operational reports to Bobby for aggregate product analytics and operational monitoring: foreground/background changes, periodic signals while active, the start of an analysis, and whether its response was received and presented by the client. Reports include a random session identifier, event identifiers and times, platform, and the app version/build when available; the server associates them with the salted installation hash and an authenticated account when signed in. Response confirmations use a server-issued receipt, without including the question or response text. An active signal expires after 90 seconds; it is a client report, not proof of a person being online or reading the answer. A WebView process termination can be reported separately for technical diagnostics; it is not a native app crash report. Older versions without these reports remain unmeasured. No crash-reporting or advertising SDK is added for these reports. Operational report cleanup is scheduled daily to remove events older than 35 days and current presence and version/build coverage rows older than 7 days, in bounded batches. Account deletion removes the account link; the salted installation/session report may remain until its retention period ends.',
            'Las versiones instrumentadas del sitio web y de la app para iPhone también envían a Bobby reportes operativos propios para analítica agregada del producto y monitoreo operativo: cambios entre primer y segundo plano, señales periódicas mientras están activas, el inicio de un análisis y si el cliente recibió y mostró su respuesta. Incluyen un identificador aleatorio de sesión, identificadores y horas de eventos, plataforma y versión/build de la app cuando estén disponibles; el servidor los asocia al hash con sal de la instalación y a una cuenta autenticada si iniciaste sesión. Las confirmaciones de respuesta usan un comprobante emitido por el servidor, sin incluir la pregunta ni el texto de la respuesta. Una señal activa vence a los 90 segundos; es un reporte del cliente, no prueba de una persona conectada ni de que leyó la respuesta. La terminación de un proceso WebView puede reportarse aparte para diagnóstico técnico; no es un reporte de crash nativo de la app. Las versiones anteriores sin estos reportes siguen sin medirse. Estos reportes no incorporan un SDK de crashes ni de publicidad. La limpieza de reportes operativos está programada cada día para eliminar eventos con más de 35 días y filas de presencia actual y cobertura de versión/build con más de 7 días, por lotes acotados. Borrar la cuenta elimina el vínculo con ella; el reporte con hash de instalación/sesión puede permanecer hasta que termine ese plazo.',
          )}</p>
        </Section>

        <Section title={tr('Deleting your account', 'Cómo borrar tu cuenta')}>
          <p>
            {tr(
              'On iPhone, tap the companion avatar at the top right to open Profile. When signed in, choose “Delete account” and confirm “Delete account permanently”. When Bobby can revoke its Sign in with Apple access automatically, the app first asks you to confirm with Apple once more. It then deletes your account, your synced progress, your Trader Land data, and your market briefing settings, reports and iPhone notification registrations.',
              'En iPhone, toca el avatar del compañero arriba a la derecha para abrir Perfil. Con la sesión iniciada, elige “Borrar cuenta” y confirma “Borrar cuenta definitivamente”. Cuando Bobby puede revocar automáticamente su acceso de Iniciar sesión con Apple, la app primero te pide confirmar una vez más con Apple. Después borra tu cuenta, tu progreso sincronizado, tus datos de Trader Land y tus ajustes, reportes y registros de notificaciones de iPhone de los resúmenes de mercado.',
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
              'Data on your device stays until you remove it or delete the app. Your account and synced progress stay until you delete the account. Market briefing records have their own retention periods, listed in “Market briefings and notifications (Bobby Pro)”. Confirmed public-chain data and limited records needed for fraud prevention, security, audit, legal compliance, or dispute resolution may remain after account deletion. Service providers keep operational data under their own retention terms.',
              'Los datos en tu dispositivo se quedan ahí hasta que los quites o borres la app. Tu cuenta y tu progreso sincronizado se conservan hasta que borres la cuenta. Los registros de los resúmenes de mercado tienen sus propios plazos, indicados en “Resúmenes de mercado y notificaciones (Bobby Pro)”. Los datos públicos confirmados en blockchain y los registros limitados necesarios para prevenir fraudes, por seguridad, auditoría, cumplimiento legal o resolución de disputas pueden conservarse después de borrar la cuenta. Los proveedores de servicios conservan sus datos operativos según sus propios plazos.',
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
              'The iPhone app uses the optional dictation described above, rather than a live audio-streaming conversation. On the website, microphone access is optional and requested when you start live voice. Live voice streams your audio directly to OpenAI to understand your question and generate spoken replies; the session also receives your selected voice, asset, timeframe, and relevant market context. Spoken replies can also be generated by ElevenLabs or Microsoft speech services. Bobby does not store raw audio recordings on its servers; providers keep data under their own terms. Live voice requires an account: we store account-linked session timing to enforce a 3-minute daily allowance that resets at 00:00 UTC. Time counts while the call is open, including muted time.',
              'La app para iPhone usa el dictado opcional descrito arriba, en lugar de una conversación con transmisión de audio en vivo. En el sitio web, el acceso al micrófono es opcional y se pide cuando inicias la voz en vivo. La voz en vivo envía tu audio directamente a OpenAI para entender tu pregunta y generar respuestas habladas; la sesión también recibe la voz que elegiste, el activo, el plazo y el contexto de mercado relevante. Las respuestas habladas también pueden generarse con los servicios de voz de ElevenLabs o Microsoft. Bobby no guarda grabaciones de audio en sus servidores; los proveedores conservan los datos según sus propios términos. La voz en vivo requiere cuenta: guardamos la duración de las sesiones, vinculada a tu cuenta, para aplicar un límite diario de 3 minutos que se reinicia a las 00:00 UTC. El tiempo cuenta mientras la llamada está abierta, aunque tengas el micrófono silenciado.',
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
          <p>{tr('Avatar introductions and style previews use bundled recordings where available. From iPhone version 1.7, previews without a bundled recording (currently those in French, Portuguese, Italian and German) use the iPhone’s own voice until you give AI consent, and no text leaves the device; after consent, the preview text is sent to our speech endpoint to generate the avatar’s voice, as described next, and the iPhone’s voice is used only if that request fails. In earlier versions, those previews always used the iPhone’s voice. On the website, previews without bundled recordings can request generated speech only after AI consent. With voice enabled and consent, dynamic reply text, language, avatar voice and style are sent to our speech endpoint and then OpenAI or Microsoft to generate audio. No Bobby account token or microphone audio accompanies that request. Bobby Pro briefing narration is different: those audio requests carry your account token to Bobby’s server, which checks access and sends only the shared report text, language and voice to OpenAI (see “Market briefings and notifications (Bobby Pro)”). Muting stops narration and new speech requests, and is remembered on this device. Providers may retain requests under their own terms.', 'Las presentaciones de avatares y muestras de estilo usan grabaciones incluidas cuando están disponibles. Desde la versión 1.7 para iPhone, las muestras sin grabación incluida (hoy, las de francés, portugués, italiano y alemán) usan la voz del propio iPhone hasta que das tu consentimiento de IA, y ningún texto sale del dispositivo; después del consentimiento, el texto de la muestra se envía a nuestro servidor de voz para generar la voz del avatar, como se describe a continuación, y la voz del iPhone solo se usa si esa solicitud falla. En versiones anteriores, esas muestras siempre usaban la voz del iPhone. En el sitio web, las muestras sin grabación incluida solo pueden solicitar voz generada después del consentimiento de IA. Con la voz activa y consentimiento, enviamos el texto de respuesta, idioma, voz y estilo a nuestro servidor y después a OpenAI o Microsoft para generar audio. Esa solicitud no incluye un token de cuenta de Bobby ni audio del micrófono. La narración de los resúmenes de Bobby Pro es distinta: esas solicitudes de audio llevan el token de tu cuenta al servidor de Bobby, que comprueba el acceso y envía a OpenAI solo el texto compartido del reporte, el idioma y la voz (consulta “Resúmenes de mercado y notificaciones (Bobby Pro)”). Silenciar detiene la narración y nuevas solicitudes de voz; se recuerda en este dispositivo. Los proveedores pueden conservar solicitudes según sus términos.')}</p>
          <p>{tr('Reports include the island code, a snapshot of its name, reason and optional details. A random installation identifier is sent and stored only as a hash to limit duplicate reports. It is not an advertising identifier and is not linked to your Bobby account. Reports are kept in a private review queue. Resolved reports are eligible for deletion after 90 days; open reports remain until reviewed. Avoid personal information in reports. Creator blocks are stored only on this device and can be removed from Community safety.', 'Los reportes incluyen el código de la isla, una copia de su nombre, el motivo y detalles opcionales. Se envía un identificador aleatorio de instalación, guardado solo como hash para limitar duplicados. No es un identificador publicitario ni se vincula a tu cuenta de Bobby. Los reportes se guardan en una cola privada. Los resueltos pueden eliminarse después de 90 días; los abiertos se conservan hasta su revisión. Evita datos personales. Los bloqueos de creadores se guardan solo en este dispositivo y se quitan desde Seguridad de la comunidad.')}</p>
          <a className={linkClass} href={clientLanguagePath('/support')}>{tr('Community rules and support', 'Reglas de la comunidad y soporte')}</a>
        </Section>

        <Section title={tr('Earlier iPhone versions', 'Versiones anteriores para iPhone')}>
          <p>
            {tr(
              'iPhone versions 1.1 and earlier offered voice features: live voice as described above, dictation with Apple speech recognition (on the device when supported, otherwise on Apple’s servers), and spoken replies from our speech providers. Builds 33–34 removed voice; build 35 restores output-only avatar narration. Versions 1.5 and 1.6 restored optional dictation that ran only on the iPhone; from version 1.7 it works as described above: on the iPhone when the language is installed, otherwise through Apple’s speech service. Live audio-streaming conversations remain website-only. If you still use an earlier version, the voice terms above also apply to it.',
              'Las versiones 1.1 y anteriores para iPhone ofrecían funciones de voz: la voz en vivo descrita arriba, dictado con el reconocimiento de voz de Apple (en el dispositivo cuando es posible y, si no, en los servidores de Apple) y respuestas habladas de nuestros proveedores de voz. Los builds 33–34 quitaron la voz; el build 35 recupera la narración de avatares. Las versiones 1.5 y 1.6 recuperaron un dictado opcional que funcionaba solo en el iPhone; desde la versión 1.7 funciona como se describe arriba: en el iPhone si el idioma está instalado y, si no, mediante el servicio de voz de Apple. Las conversaciones con transmisión de audio en vivo siguen siendo exclusivas del sitio web. Si todavía usas una versión anterior, los términos de voz de arriba también aplican.',
            )}
          </p>
        </Section>

        <Section title={tr('Service providers', 'Proveedores de servicios')}>
          <p>{tr('These processors act on our behalf, only to deliver the product:', 'Estos proveedores procesan datos en nuestro nombre, solo para prestar el servicio:')}</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>{strong('Apple')} — {tr('Sign in with Apple; speech recognition for dictation on iPhone (from version 1.7: on the device when the language is installed, otherwise Apple’s speech service receives the audio to transcribe it); and the Bobby Pro App Store subscription (Apple processes the payment; we never see your card).', 'Iniciar sesión con Apple; el reconocimiento de voz del dictado en iPhone (desde la versión 1.7: en el dispositivo si el idioma está instalado; si no, el servicio de voz de Apple recibe el audio para transcribirlo); y la suscripción Bobby Pro del App Store (Apple procesa el pago; nunca vemos tu tarjeta).')}</li>
            <li>{strong(tr('Apple Push Notification service', 'Servicio de notificaciones push de Apple (APNs)'))} — {tr('delivers Bobby Pro briefing notifications to your iPhone; it receives the device push token and the generic notification text, never your name, assets or report content.', 'entrega en tu iPhone las notificaciones de los resúmenes de Bobby Pro; recibe el token de notificaciones del dispositivo y el texto genérico de la notificación, nunca tu nombre, tus activos ni el contenido del reporte.')}</li>
            <li>{strong('Supabase')} — {tr('authentication, synced progress, Trader Land, market briefings (including private storage of briefing audio), and product records.', 'autenticación, progreso sincronizado, Trader Land, resúmenes de mercado (incluido el almacenamiento privado del audio de los resúmenes) y registros del producto.')}</li>
            <li>{strong('OpenAI')} — {tr('fallback text analysis when Anthropic is unavailable, optional speech generation (including Bobby Pro briefing narration from shared report text), shared briefing text when Anthropic is unavailable, and public-name moderation; on the website, also live voice.', 'análisis de texto de respaldo cuando Anthropic no está disponible, narración opcional (incluida la de los resúmenes de Bobby Pro a partir del texto compartido del reporte), texto compartido de los resúmenes cuando Anthropic no está disponible y moderación de nombres públicos; en el sitio web, también la voz en vivo.')}</li>
            <li>{strong('Anthropic')} — {tr('primary text analysis for the desk, including the short memory summary described above, and the shared text of Bobby Pro market briefings (which carries no account data).', 'análisis de texto principal del desk, incluido el resumen breve de memoria descrito arriba, y el texto compartido de los resúmenes de mercado de Bobby Pro (que no lleva datos de tu cuenta).')}</li>
            <li>{strong('Vercel')} — {tr('hosts our backend and website, with standard, short-lived request logs.', 'aloja nuestro backend y el sitio web, con registros de solicitudes estándar y de corta duración.')}</li>
            <li>{strong('Amplitude')} — {tr('product analytics: receives, from our server only, the pseudonymous usage events described above (install hash, account identifier, event, time, site section, referring domain, campaign tag, approximate country and region), plus production subscription events, product, billing provider, amount and currency to measure funnels, retention and revenue. No SDK runs in the website or app, and it never receives your IP address, email or questions.', 'analítica de producto: recibe, solo desde nuestro servidor, los eventos de uso seudónimos descritos arriba (hash de instalación, identificador de cuenta, evento, hora, sección del sitio, dominio de origen, etiqueta de campaña, país y región aproximados), junto con eventos de suscripción de producción, producto, proveedor de cobro, importe y moneda para medir embudos, retención e ingresos. No corre ningún SDK en el sitio ni en la app, y nunca recibe tu dirección IP, correo ni preguntas.')}</li>
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
            <a href={clientLanguagePath('/support#contact')} className={linkClass}>{tr('private support form', 'formulario privado de soporte')}</a>.
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
