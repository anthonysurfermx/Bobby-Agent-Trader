// Pin the owner-review copy and exercise the lazy privacy anchor after commit.
// React renders the real page/Section and production i18n; browser effects use an inert DOM.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'parse5';

const expected = {
  "paragraphs": {
    "en": [
      "The iPhone app (version 1.5, build 45 onward) offers typed or dictated market questions, optional reply narration and Trader Land exploration. Dictation uses the microphone only after you tap the microphone button and until you send or cancel, with your permission. From version 1.7, it is transcribed on your iPhone when the language is installed; otherwise, and only after you allow it, Apple’s speech service transcribes it. Bobby does not store the audio, and you can always type instead. The app does not connect wallets or execute trades. An optional Sign in with Apple account syncs progress and lets you publish your island; some analysis levels require an account and have usage limits. Bobby Pro subscribers can also opt in to scheduled market briefings with notifications.",
      "Dictation is optional and typing is always available. From iPhone version 1.8, Bobby listens only after you tap the microphone button and until you send or cancel; it stops by itself after a few seconds without words and after 60 seconds at most. Pressing and holding the button still works: Bobby then listens while you hold. In earlier versions Bobby listened only while you held the button. All of this applies once you have allowed the microphone and speech recognition in iOS. From iPhone version 1.7, your speech is transcribed on the iPhone when Apple’s recognition for the app language is installed on it; otherwise, and only after you have allowed speech recognition, the audio goes to Apple’s speech service, which transcribes it in the same language and handles it under its own terms. Bobby does not store the audio and does not receive it on its servers. In versions 1.5 and 1.6, dictation ran only on the iPhone. If recognition is unavailable or you decline the permission, use the keyboard. The resulting question text is processed like a typed question. On the website, dictation uses your browser’s speech recognition, as before; the browser may send audio to its own speech service.",
      "Bobby may ask whether you want it to remember what you tell it. Only if you accept, it asks you a question now and then (for example, what you want to learn or when you might need your money) and notes your answer: the option you chose, whether you said it, confirmed it or Bobby worked it out from your words, and when it expires. The notes are stored on your iPhone, not on Bobby’s servers or in your account. With each question Bobby explains, a short summary of those notes travels to Bobby’s server and to Anthropic, only to answer that question; Bobby’s server does not store it, and Anthropic processes it under its own terms. If you answer in your own words, typed or dictated, the AI reads them once to pick an option and Bobby does not keep your words. Notes about money and notes Bobby worked out expire after 7 days; the others after 30. In Profile → Memory you can see each note, correct it, delete it, delete them all, or turn memory off, which deletes them too. They stay on the iPhone when you sign out and are deleted if a different account signs in. Bobby works the same if you never accept."
    ],
    "es": [
      "La app para iPhone (versión 1.5, build 45 en adelante) ofrece preguntas de mercado por escrito o dictadas, narración opcional y exploración de Trader Land. El dictado usa el micrófono solo desde que tocas el botón del micrófono y hasta que envías o cancelas, con tu permiso. Desde la versión 1.7, se transcribe en tu iPhone si el idioma está instalado; si no, y solo después de que lo permitas, lo transcribe el servicio de voz de Apple. Bobby no guarda el audio y siempre puedes escribir. La app no conecta wallets ni ejecuta operaciones. Una cuenta opcional con Iniciar sesión con Apple sincroniza el progreso y permite publicar tu isla; algunos niveles de análisis requieren cuenta y tienen límites de uso. Quienes tienen Bobby Pro también pueden activar resúmenes de mercado programados con notificaciones.",
      "El dictado es opcional y siempre puedes escribir. Desde la versión 1.8 para iPhone, Bobby escucha solo desde que tocas el botón del micrófono y hasta que envías o cancelas; se detiene solo tras unos segundos sin palabras y, como máximo, a los 60 segundos. Mantener pulsado el botón sigue funcionando: entonces Bobby escucha mientras lo mantienes. En versiones anteriores Bobby escuchaba solo mientras mantenías pulsado el botón. Todo esto aplica una vez que permitiste el micrófono y el reconocimiento de voz en iOS. Desde la versión 1.7 para iPhone, tu voz se transcribe en el iPhone si el reconocimiento de Apple para el idioma de la app está instalado en él; si no, y solo después de que hayas permitido el reconocimiento de voz, el audio va al servicio de voz de Apple, que lo transcribe en ese mismo idioma y lo trata según sus propios términos. Bobby no guarda el audio ni lo recibe en sus servidores. En las versiones 1.5 y 1.6, el dictado funcionaba solo en el iPhone. Si el reconocimiento no está disponible o rechazas el permiso, usa el teclado. El texto resultante se procesa como una pregunta escrita. En el sitio web, el dictado usa el reconocimiento de voz de tu navegador, como antes; el navegador puede enviar audio a su propio servicio de voz.",
      "Bobby puede preguntarte si quieres que recuerde lo que le cuentas. Solo si aceptas, te hace de vez en cuando una pregunta (por ejemplo, qué quieres aprender o cuándo podrías necesitar tu dinero) y apunta tu respuesta: la opción que elegiste, si la dijiste, la confirmaste o Bobby la dedujo de tus palabras, y cuándo caduca. Los apuntes se guardan en tu iPhone, no en los servidores de Bobby ni en tu cuenta. Con cada pregunta que Bobby te explica viaja un resumen corto de esos apuntes al servidor de Bobby y a Anthropic, solo para responder esa pregunta; el servidor de Bobby no lo guarda y Anthropic lo procesa según sus propios términos. Si respondes con tus propias palabras, escritas o dictadas, la IA las lee una vez para elegir una opción y Bobby no guarda tus palabras. Los apuntes sobre dinero y los que Bobby dedujo caducan a los 7 días; los demás, a los 30. En Perfil → Memoria puedes ver cada apunte, corregirlo, borrarlo, borrarlos todos o apagar la memoria, que también los borra. Se quedan en el iPhone cuando cierras sesión y se borran si entra otra cuenta. Bobby funciona igual si nunca aceptas."
    ],
    "fr": [
      "L’app iPhone (version 1.5, à partir du build 45) permet de poser des questions sur les marchés au clavier ou par dictée, d’écouter les réponses si tu le souhaites et d’explorer Trader Land. La dictée utilise le microphone uniquement à partir du moment où tu touches le bouton du micro et jusqu’à l’envoi ou l’annulation, avec ta permission. À partir de la version 1.7, elle est transcrite sur ton iPhone si la langue est installée ; sinon, et seulement après ton autorisation, le service de reconnaissance vocale d’Apple la transcrit. Bobby ne conserve pas l’audio et tu peux toujours écrire. L’app ne connecte pas de portefeuilles et n’exécute pas de transactions. Un compte facultatif via Se connecter avec Apple synchronise ta progression et permet de publier ton île ; certains niveaux d’analyse nécessitent un compte et ont des limites d’utilisation. Les abonnés Bobby Pro peuvent aussi activer des rapports de marché programmés avec notifications.",
      "La dictée est facultative et tu peux toujours écrire. À partir de la version 1.8 pour iPhone, Bobby écoute uniquement à partir du moment où tu touches le bouton du micro et jusqu’à l’envoi ou l’annulation ; il s’arrête tout seul après quelques secondes sans paroles et au bout de 60 secondes maximum. Maintenir le bouton fonctionne toujours : Bobby écoute alors tant que tu le maintiens. Dans les versions précédentes, Bobby écoutait uniquement tant que tu maintenais le bouton. Tout cela s’applique une fois le microphone et la reconnaissance vocale autorisés dans iOS. À partir de la version 1.7 pour iPhone, ta voix est transcrite sur l’iPhone si la reconnaissance d’Apple pour la langue de l’app y est installée ; sinon, et seulement après que tu as autorisé la reconnaissance vocale, l’audio est envoyé au service de reconnaissance vocale d’Apple, qui le transcrit dans la même langue et le traite selon ses propres conditions. Bobby ne conserve pas l’audio et ne le reçoit pas sur ses serveurs. Dans les versions 1.5 et 1.6, la dictée fonctionnait uniquement sur l’iPhone. Si la reconnaissance est indisponible ou si tu refuses l’autorisation, utilise le clavier. Le texte obtenu est traité comme une question saisie au clavier. Sur le site, la dictée utilise la reconnaissance vocale de ton navigateur, comme auparavant ; le navigateur peut envoyer l’audio à son propre service vocal.",
      "Bobby peut te demander si tu veux qu’il se souvienne de ce que tu lui racontes. Seulement si tu acceptes, il te pose de temps en temps une question (par exemple, ce que tu veux apprendre ou quand tu pourrais avoir besoin de ton argent) et note ta réponse : l’option que tu as choisie, si tu l’as dite, confirmée ou si Bobby l’a déduite de tes mots, et quand elle expire. Les notes sont enregistrées sur ton iPhone, pas sur les serveurs de Bobby ni dans ton compte. À chaque question que Bobby t’explique, un court résumé de ces notes est envoyé au serveur de Bobby et à Anthropic, uniquement pour répondre à cette question ; le serveur de Bobby ne le conserve pas et Anthropic le traite selon ses propres conditions. Si tu réponds avec tes propres mots, écrits ou dictés, l’IA les lit une fois pour choisir une option et Bobby ne garde pas tes mots. Les notes sur l’argent et celles que Bobby a déduites expirent au bout de 7 jours ; les autres, au bout de 30. Dans Profil → Mémoire, tu peux voir chaque note, la corriger, la supprimer, les supprimer toutes ou désactiver la mémoire, ce qui les supprime aussi. Elles restent sur l’iPhone quand tu te déconnectes et sont supprimées si un autre compte se connecte. Bobby fonctionne de la même façon si tu n’acceptes jamais."
    ],
    "pt": [
      "A app para iPhone (versão 1.5, a partir do build 45) permite escrever ou ditar perguntas sobre os mercados, ouvir as respostas opcionalmente e explorar Trader Land. O ditado usa o microfone apenas desde que tocas no botão do microfone e até enviares ou cancelares, com a tua autorização. A partir da versão 1.7, é transcrito no teu iPhone se o idioma estiver instalado; caso contrário, e só depois de o autorizares, é transcrito pelo serviço de reconhecimento de voz da Apple. O Bobby não guarda o áudio e podes sempre escrever. A app não liga carteiras nem executa transações. Uma conta opcional com Iniciar sessão com Apple sincroniza o progresso e permite publicar a tua ilha; alguns níveis de análise exigem uma conta e têm limites de utilização. Os assinantes de Bobby Pro também podem ativar relatórios de mercado programados com notificações.",
      "O ditado é opcional e podes sempre escrever. A partir da versão 1.8 para iPhone, o Bobby escuta apenas desde que tocas no botão do microfone e até enviares ou cancelares; para sozinho após alguns segundos sem palavras e, no máximo, aos 60 segundos. Manter o botão premido continua a funcionar: nesse caso o Bobby escuta enquanto o manténs. Nas versões anteriores, o Bobby escutava apenas enquanto mantinhas o botão premido. Tudo isto se aplica depois de autorizares o microfone e o reconhecimento de voz no iOS. A partir da versão 1.7 para iPhone, a tua voz é transcrita no iPhone se o reconhecimento da Apple para o idioma da app estiver instalado nele; caso contrário, e só depois de teres autorizado o reconhecimento de voz, o áudio é enviado para o serviço de reconhecimento de voz da Apple, que o transcreve no mesmo idioma e o trata segundo os seus próprios termos. O Bobby não guarda o áudio nem o recebe nos seus servidores. Nas versões 1.5 e 1.6, o ditado funcionava apenas no iPhone. Se o reconhecimento não estiver disponível ou recusares a autorização, usa o teclado. O texto resultante é processado como uma pergunta escrita. No site, o ditado usa o reconhecimento de voz do teu navegador, como antes; o navegador pode enviar áudio para o seu próprio serviço de voz.",
      "O Bobby pode perguntar-te se queres que se lembre do que lhe contas. Só se aceitares, faz-te de vez em quando uma pergunta (por exemplo, o que queres aprender ou quando poderás precisar do teu dinheiro) e anota a tua resposta: a opção que escolheste, se a disseste, a confirmaste ou se o Bobby a deduziu das tuas palavras, e quando expira. As anotações são guardadas no teu iPhone, não nos servidores do Bobby nem na tua conta. Com cada pergunta que o Bobby te explica, um resumo curto dessas anotações é enviado ao servidor do Bobby e à Anthropic, apenas para responder a essa pergunta; o servidor do Bobby não o guarda e a Anthropic processa-o segundo os seus próprios termos. Se responderes com as tuas próprias palavras, escritas ou ditadas, a IA lê-as uma vez para escolher uma opção e o Bobby não guarda as tuas palavras. As anotações sobre dinheiro e as que o Bobby deduziu expiram ao fim de 7 dias; as restantes, ao fim de 30. Em Perfil → Memória podes ver cada anotação, corrigi-la, apagá-la, apagá-las todas ou desligar a memória, o que também as apaga. Ficam no iPhone quando sais da conta e são apagadas se entrar outra conta. O Bobby funciona da mesma forma se nunca aceitares."
    ],
    "it": [
      "L’app per iPhone (versione 1.5, dal build 45) offre domande sui mercati scritte o dettate, lettura vocale facoltativa delle risposte ed esplorazione di Trader Land. La dettatura usa il microfono solo da quando tocchi il pulsante del microfono e fino a quando invii o annulli, con il tuo permesso. Dalla versione 1.7 viene trascritta sul tuo iPhone se la lingua è installata; altrimenti, e solo dopo la tua autorizzazione, la trascrive il servizio di riconoscimento vocale di Apple. Bobby non conserva l’audio e puoi sempre scrivere. L’app non collega wallet né esegue operazioni. Un account facoltativo con Accedi con Apple sincronizza i progressi e permette di pubblicare la tua isola; alcuni livelli di analisi richiedono un account e hanno limiti di utilizzo. Gli abbonati a Bobby Pro possono anche attivare rapporti di mercato programmati con notifiche.",
      "La dettatura è facoltativa e puoi sempre scrivere. Dalla versione 1.8 per iPhone, Bobby ascolta solo da quando tocchi il pulsante del microfono e fino a quando invii o annulli; si ferma da solo dopo alcuni secondi senza parole e al massimo dopo 60 secondi. Tenere premuto il pulsante funziona ancora: in quel caso Bobby ascolta mentre lo tieni premuto. Nelle versioni precedenti Bobby ascoltava solo mentre tenevi premuto il pulsante. Tutto questo vale dopo che hai autorizzato il microfono e il riconoscimento vocale in iOS. Dalla versione 1.7 per iPhone, la tua voce viene trascritta sull’iPhone se il riconoscimento Apple per la lingua dell’app vi è installato; altrimenti, e solo dopo che hai autorizzato il riconoscimento vocale, l’audio viene inviato al servizio di riconoscimento vocale di Apple, che lo trascrive nella stessa lingua e lo tratta secondo i propri termini. Bobby non conserva l’audio e non lo riceve sui propri server. Nelle versioni 1.5 e 1.6 la dettatura funzionava solo sull’iPhone. Se il riconoscimento non è disponibile o neghi il permesso, usa la tastiera. Il testo risultante viene elaborato come una domanda digitata. Sul sito, la dettatura usa il riconoscimento vocale del tuo browser, come prima; il browser può inviare l’audio al proprio servizio vocale.",
      "Bobby può chiederti se vuoi che ricordi quello che gli racconti. Solo se accetti, ti fa ogni tanto una domanda (per esempio, che cosa vuoi imparare o quando potresti aver bisogno dei tuoi soldi) e annota la tua risposta: l’opzione che hai scelto, se l’hai detta, confermata o se Bobby l’ha dedotta dalle tue parole, e quando scade. Gli appunti sono conservati sul tuo iPhone, non sui server di Bobby né nel tuo account. Con ogni domanda che Bobby ti spiega, un breve riepilogo di quegli appunti viene inviato al server di Bobby e ad Anthropic, solo per rispondere a quella domanda; il server di Bobby non lo conserva e Anthropic lo elabora secondo i propri termini. Se rispondi con parole tue, scritte o dettate, l’IA le legge una volta per scegliere un’opzione e Bobby non conserva le tue parole. Gli appunti sui soldi e quelli che Bobby ha dedotto scadono dopo 7 giorni; gli altri, dopo 30. In Profilo → Memoria puoi vedere ogni appunto, correggerlo, eliminarlo, eliminarli tutti o disattivare la memoria, che li elimina anche. Restano sull’iPhone quando esci e vengono eliminati se accede un altro account. Bobby funziona allo stesso modo se non accetti mai."
    ],
    "de": [
      "Die iPhone-App (Version 1.5, ab Build 45) bietet getippte oder diktierte Marktfragen, optionale Sprachausgabe und die Erkundung von Trader Land. Das Diktieren nutzt das Mikrofon mit deiner Erlaubnis nur ab dem Moment, in dem du die Mikrofontaste antippst, bis du sendest oder abbrichst. Ab Version 1.7 wird das Diktat auf deinem iPhone transkribiert, wenn die Sprache installiert ist; andernfalls transkribiert es Apples Spracherkennungsdienst, und zwar erst nach deiner Erlaubnis. Bobby speichert die Audiodaten nicht, und du kannst jederzeit tippen. Die App verbindet keine Wallets und führt keine Transaktionen aus. Ein optionales Konto über Mit Apple anmelden synchronisiert deinen Fortschritt und ermöglicht die Veröffentlichung deiner Insel; einige Analysestufen benötigen ein Konto und haben Nutzungslimits. Bobby-Pro-Abonnenten können außerdem geplante Marktberichte mit Benachrichtigungen aktivieren.",
      "Das Diktieren ist optional, und du kannst jederzeit tippen. Ab iPhone-Version 1.8 hört Bobby nur zu, nachdem du die Mikrofontaste angetippt hast, und bis du sendest oder abbrichst; nach einigen Sekunden ohne Worte und spätestens nach 60 Sekunden hört Bobby von selbst auf. Gedrückthalten funktioniert weiterhin: Dann hört Bobby zu, solange du die Taste hältst. In früheren Versionen hörte Bobby nur zu, solange du die Taste gedrückt hieltest. Das alles gilt erst, nachdem du in iOS Mikrofon und Spracherkennung erlaubt hast. Ab iPhone-Version 1.7 wird das Gesprochene auf dem iPhone transkribiert, wenn Apples Spracherkennung für die Sprache der App dort installiert ist; andernfalls, und nur nachdem du die Spracherkennung erlaubt hast, gehen die Audiodaten an Apples Spracherkennungsdienst, der sie in derselben Sprache transkribiert und nach seinen eigenen Bedingungen verarbeitet. Bobby speichert die Audiodaten nicht und erhält sie nicht auf seinen Servern. In den Versionen 1.5 und 1.6 lief das Diktieren ausschließlich auf dem iPhone. Ist die Erkennung nicht verfügbar oder verweigerst du die Erlaubnis, nutze die Tastatur. Der entstandene Text wird wie eine getippte Frage verarbeitet. Auf der Website nutzt das Diktieren die Spracherkennung deines Browsers, wie bisher; der Browser kann Audio an seinen eigenen Sprachdienst senden.",
      "Bobby kann dich fragen, ob es sich merken soll, was du ihm erzählst. Nur wenn du zustimmst, stellt es dir hin und wieder eine Frage (zum Beispiel, was du lernen möchtest oder wann du dein Geld brauchen könntest) und notiert deine Antwort: die Option, die du gewählt hast, ob du sie selbst genannt oder bestätigt hast oder Bobby sie aus deinen Worten abgeleitet hat, und wann sie abläuft. Die Notizen werden auf deinem iPhone gespeichert, nicht auf Bobbys Servern oder in deinem Konto. Bei jeder Frage, die Bobby dir erklärt, wird eine kurze Zusammenfassung dieser Notizen an Bobbys Server und an Anthropic gesendet, nur um diese Frage zu beantworten; Bobbys Server speichert sie nicht, und Anthropic verarbeitet sie nach seinen eigenen Bedingungen. Wenn du mit deinen eigenen Worten antwortest, getippt oder diktiert, liest die KI sie einmal, um eine Option zu wählen, und Bobby speichert deine Worte nicht. Notizen über Geld und Notizen, die Bobby abgeleitet hat, verfallen nach 7 Tagen; die anderen nach 30. Unter Profil → Gedächtnis kannst du jede Notiz ansehen, korrigieren, löschen, alle löschen oder das Gedächtnis ausschalten, wodurch sie ebenfalls gelöscht werden. Sie bleiben auf dem iPhone, wenn du dich abmeldest, und werden gelöscht, wenn sich ein anderes Konto anmeldet. Bobby funktioniert genauso, wenn du nie zustimmst."
    ]
  },
  "titles": {
    "en": "Bobby’s notes (iPhone, from version 1.8)",
    "es": "Los apuntes de Bobby (iPhone, desde la versión 1.8)",
    "fr": "Les notes de Bobby (iPhone, à partir de la version 1.8)",
    "pt": "As anotações do Bobby (iPhone, a partir da versão 1.8)",
    "it": "Gli appunti di Bobby (iPhone, dalla versione 1.8)",
    "de": "Bobbys Notizen (iPhone, ab Version 1.8)"
  }
};
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const languages = ['en', 'es', 'fr', 'pt', 'it', 'de'];
const dates = ['October 11, 2026', '11 de octubre de 2026', '11 octobre 2026', '11 de outubro de 2026', '11 ottobre 2026', '11. Oktober 2026'];
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('ok - ' + name); };
function elements(node) { return [node, ...(node.childNodes ?? []).flatMap(elements)]; }
function text(node) { return node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join(''); }
function attribute(node, key) { return node.attrs?.find(a => a.name === key)?.value; }
function browser(url) {
  const location = new URL(url), effects = [], frames = new Map(), listeners = new Map(), loaded = new Map();
  let nextFrame = 0, mounted = false, scrolls = 0, lookups = 0;
  const context = vm.createContext({
    console, URL, URLSearchParams, Intl, navigator: { language: 'de-DE' },
    // A query must override an unrelated saved language.
    localStorage: { getItem: key => key === 'bobby_lang' ? 'fr' : null },
    window: { location, addEventListener: (event, fn) => listeners.set(event, fn), removeEventListener: (event, fn) => { assert.equal(listeners.get(event), fn); listeners.delete(event); } },
    document: { getElementById: id => { lookups++; assert.equal(id, 'notes'); return mounted ? { scrollIntoView: () => scrolls++ } : null; } },
    requestAnimationFrame: fn => { const id = ++nextFrame; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
  });
  const stubs = {
    react: { useEffect: fn => effects.push(fn) }, 'react/jsx-runtime': jsx,
    'react-helmet-async': { Helmet: () => null },
    '@/components/protocol/NucleoTopBar': { default: () => null },
    '@/hooks/useNucleoPages': { useNucleoPages() {} },
  };
  function load(file) {
    if (loaded.has(file)) return loaded.get(file);
    const module = { exports: {} };
    const source = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const request = name => {
      if (name in stubs) return stubs[name];
      const target = name.startsWith('@/') ? 'src/' + name.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(file), name));
      return load(target + '.ts');
    };
    vm.runInContext('(function(require,module,exports){' + source + '\n})', context, { filename: file })(request, module, module.exports);
    loaded.set(file, module.exports);
    return module.exports;
  }
  const html = renderToStaticMarkup(load('src/pages/PrivacyPage.tsx').default());
  const nodes = elements(parse(html));
  // This is the commit boundary: the Section's actual DOM id now exists.
  mounted = nodes.some(node => node.tagName === 'section' && attribute(node, 'id') === 'notes');
  function flushFrames() { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); }
  return { html, nodes, effects, frames, listeners, location, flushFrames, scrolls: () => scrolls, lookups: () => lookups };
}
const rendered = [];
for (const [index, language] of languages.entries()) {
  const b = browser('https://bobbyprotocol.xyz/privacy?lang=' + language + '#notes');
  const paragraphs = b.nodes.filter(n => n.tagName === 'p').map(text);
  const actual = expected.paragraphs[language].map(value => paragraphs.find(p => p.startsWith(value.split('. ')[0] + '.')));
  check(language + ': all three full paragraphs match the reviewer copy', () => assert.deepEqual(actual, expected.paragraphs[language]));
  const sections = b.nodes.filter(n => n.tagName === 'section');
  const position = sections.findIndex(n => attribute(n, 'id') === 'notes');
  check(language + ': unique notes anchor, localized title and exactly one paragraph', () => {
    assert.equal(sections.filter(n => attribute(n, 'id') === 'notes').length, 1);
    assert.equal(text(elements(sections[position]).find(n => n.tagName === 'h2')), expected.titles[language]);
    assert.equal(elements(sections[position]).filter(n => n.tagName === 'p').length, 1);
  });
  check(language + ': notes directly follows the existing version 1.8 memory section', () => {
    assert.ok(position > 0);
    const previous = elements(sections[position - 1]).filter(n => n.tagName === 'p').at(-1);
    const beginning = { en: 'From version 1.8', es: 'Desde la versión 1.8', fr: 'À partir de la version 1.8', pt: 'A partir da versão 1.8', it: 'Dalla versione 1.8', de: 'Ab Version 1.8' };
    assert.ok(text(previous).startsWith(beginning[language]), text(previous));
  });
  check(language + ': effective date is October 11', () => assert.ok(paragraphs.some(p => p.endsWith(dates[index]))));
  check(language + ': deep link waits until after commit and one frame to scroll', () => {
    assert.equal(b.scrolls(), 0); assert.equal(b.lookups(), 0);
    b.cleanup = b.effects[0]();
    assert.equal(b.scrolls(), 0); assert.equal(b.lookups(), 0); assert.equal(b.frames.size, 1);
    b.flushFrames(); assert.equal(b.scrolls(), 1);
  });
  check(language + ': later hash navigation scrolls and cleanup cancels pending work', () => {
    b.location.hash = ''; b.listeners.get('hashchange')(); b.flushFrames(); assert.equal(b.scrolls(), 1);
    b.location.hash = '#notes'; b.listeners.get('hashchange')(); b.flushFrames(); assert.equal(b.scrolls(), 2);
    b.listeners.get('hashchange')(); assert.equal(b.frames.size, 1);
    b.cleanup(); assert.equal(b.frames.size, 0); assert.equal(b.listeners.size, 0);
    b.flushFrames(); assert.equal(b.scrolls(), 2);
  });
  rendered.push({ language, paragraphs: actual, title: expected.titles[language], date: dates[index] });
}
check('plain /privacy#notes respects the saved language and scrolls after rendering', () => {
  const b = browser('https://bobbyprotocol.xyz/privacy#notes');
  assert.ok(b.html.includes(expected.titles.fr));
  const cleanup = b.effects[0](); b.flushFrames(); assert.equal(b.scrolls(), 1); cleanup();
});
check('without a notes hash, the page leaves scroll position alone', () => {
  const b = browser('https://bobbyprotocol.xyz/privacy?lang=en');
  const cleanup = b.effects[0](); b.flushFrames(); assert.equal(b.scrolls(), 0); cleanup();
});
const outputFlag = process.argv.indexOf('--rendered');
if (outputFlag !== -1) {
  const output = path.resolve(process.argv[outputFlag + 1]);
  const preface = '# Privacy page · iPhone 1.8 · owner review\n\nRendered from PrivacyPage.tsx with the production translation catalogue using React renderToStaticMarkup. Copy only; no deployment or owner approval is implied.\n\nAnchor verification: the regression test renders the real Section id, then runs the post-commit effect and queued animation frame for /privacy#notes and all six /privacy?lang=xx#notes URLs. It also checks later hash changes and effect cleanup. This verifies scrollIntoView invocation in an inert DOM; no live browser or iPhone scroll was exercised.\n';
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, preface + rendered.map(({ language, paragraphs, title, date }) => '\n## ' + language + '\n\nEffective date: ' + date + '\n\n### Microphone · short version\n\n' + paragraphs[0] + '\n\n### Microphone · dictation\n\n' + paragraphs[1] + '\n\n### ' + title + '\n\nAnchor: `/privacy?lang=' + language + '#notes`\n\n' + paragraphs[2] + '\n').join(''));
  console.log('Rendered reviewer copy: ' + output);
}
console.log(checks + ' privacy 1.8 checks passed');
