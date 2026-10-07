// The next question the CIO writes on every read (`synthesis.followUp`): what it may ask, and what is served
// when it asks something else.
//
// The owner's rule: the next question asks what happened, why, or what would change the read. It never asks
// whether or when to act, it is never a statement, and it never carries a price or a level. Bobby wrote it and it
// sits one tap away, so a "should I…" there is Bobby steering, not the reader asking.
//
// The check is deterministic and strict on purpose. A question it refuses costs one chip: the read is served
// with a fixed question built here (nextQuestionFallback), never failed. So every list below prefers refusing a
// harmless question over letting a when-to-act question through, and nothing here is a model's judgement.
//
// What it reads, in this order: whether the question acts (a suggestion such as "why not…", a bare "why keep…",
// "how to…", a verb of entering, taking or getting rid of, timing, a person as its subject), a word Bobby's copy
// never uses (certainty, a forecast and a spelled-out link among them), a number (digits, or written out in the
// reply's language), its shape (one clause, one question, in the letters the six languages write with), how it
// opens, whether it is in the reply's language, and last whether every word of it is a word a question about a
// chart is written with (desk-next-question-lexicon.ts).
//
// That last rule is what the others cannot be: a list of what is allowed. The ways to ask whether to act are not
// a finite list, and each review of the lists of refused verbs found more that they had left out. The earlier
// rules stay because they name the class in the log and read what a word list cannot (a construction, a number,
// a language); the word list is what a verb nobody thought of meets.
//
// What it still cannot read, by construction: a question that acts with listed words alone in a construction no
// rule here names, and two close languages in a sentence whose every word they share.
import type { AppLanguage } from '../../src/lib/app-language.js';
import { listedWord } from './desk-next-question-lexicon.js';

/** The bounds of `synthesis.followUp` on the wire: every shipped client decodes a string of this size. */
export const FOLLOW_UP_MIN = 6;
export const FOLLOW_UP_MAX = 160;

/** The rule as the CIO is told it, beside the description of followUp. One sentence; the check below enforces it. */
export const NEXT_QUESTION_RULE = ' followUp asks what happened, why, or what would change this read, about the asset, named by its ticker, and never about the reader or any other person: never whether or when to act (entering, exiting, adding, holding, waiting, taking it or letting it go, what to do, whether it is too late or a good moment, which day or hour), never a suggestion (why not, how about, what if someone), never what the asset will do, never a statement, never with a price, a level or any number, in digits or in words, never calling anything sure, never with the words signal or alert, and only in the plain words of a chart, a trend and the market (an unusual word costs the question).';

/** Which part of the rule a follow-up broke. A class, never the text. */
export type NextQuestionViolation = 'shape' | 'opener' | 'language' | 'act' | 'number' | 'word' | 'unlisted';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * Lower case, without accents, in plain letters: "¿Qué señales…?" is read as "que senales", a full-width "ｂｕｙ"
 * as "buy", "ß" as "ss". After it, a letter of the six languages is one of a–z.
 */
const fold = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/ß/g, 'ss').replace(/æ/g, 'ae').replace(/œ/g, 'oe');
const wordsOf = (text: string) => text.trim().split(/\s+/);
const setOf = (text: string): ReadonlySet<string> => new Set(wordsOf(text));

/**
 * What stands where the asked asset's ticker stood. The ticker is set aside before any word is read (an asset
 * called NOW, ADD or 7203.T is neither a word nor a number), and this takes its place so that it still counts as
 * a word of the question and still stands between its neighbours. No list holds it.
 */
const ASSET = 'xassetx';

// The desk's own timeframe names are not prices: "on the 4H chart" stays a question about the chart.
const TIMEFRAME_CODE = /(?<![\p{L}\p{N}])(?:[14][hH]|1[dDwW])(?![\p{L}\p{N}])/gu;
// One sentence, read after folding: the letters a–z (the six languages have no other once their accents are
// set aside, so a Cyrillic or Greek look-alike is refused here), spaces, commas, apostrophes and hyphens or
// dashes, an optional opening ¿ and one closing question mark.
const ONE_QUESTION = /^¿?[a-z'’ ,\-‐–—]+\?$/;
// One clause: a comma joins a second one, and the second is where a statement or an instruction rides behind a
// question ("What a run, grab it before Friday?"). German alone needs its comma, before the word that opens a
// subordinate clause ("Was passiert, wenn…", "…, damit sich diese Analyse ändert?"), and gets that one only.
const SECOND_CLAUSE: Record<AppLanguage, RegExp> = {
  en: /,/, es: /,/, fr: /,/, pt: /,/, it: /,/,
  de: /,(?! (?:wenn|falls|damit|dass|ob|weil|bevor|nachdem|sobald|solange|wahrend|obwohl|um|ohne dass|was|wie|warum) )/,
};
// An exclamation with a question mark is a statement: "What a run for NVDA?".
const EXCLAIMS: Record<AppLanguage, RegExp | null> = { en: /^ (?:what|such) an? /, es: /^ (?:que|vaya) (?:gran|buen|buena|tremendo|tremenda) /, fr: /^ quel(?:le)? (?:belle|beau|sacre|sacree) /, pt: /^ que (?:grande|bela|belo) /, it: /^ che (?:bel|bella|gran) /, de: /^ was fur ein /, };
// Three or more single letters joined by hyphens: no language writes a word that way ("b-u-y"). The French
// "y a-t-il" has two.
const SPELLED_OUT = /(?<![a-z])[a-z](?:[-‐–—][a-z]){2,}(?![a-z])/;

// How a what-or-why question opens, per reply language, on the folded words. A question that opens any other way
// ("Is now…", "Should…", "¿Conviene…?", "When…", "Lohnt sich…") is a yes/no or a timing question and is refused
// whatever follows. An optional "and" may lead, and a preposition may stand before the question word
// ("¿De qué depende…?", "À quoi tient…", "Unter welchen Bedingungen…"). Italian elides its own: "cos’è", "com’è".
const OPENERS: Record<AppLanguage, RegExp> = {
  en: /^(?:(?:and|so|but) )?(?:what|why|which|how)\b/,
  es: /^(?:y si\b|(?:(?:y|pero|entonces) )?(?:(?:(?:a|de|en|con|para|por|sobre|hasta|desde) )?(?:que|cual|cuales)|como)\b)/,
  fr: /^(?:et si\b|(?:(?:et|mais|alors) )?(?:(?:(?:a|de|sur|pour|en|par|vers|avec|dans) )?(?:que|qu|quoi|quel|quelle|quels|quelles)|pourquoi|comment)\b)/,
  pt: /^(?:e se\b|(?:(?:e|mas|entao) )?(?:o que|(?:(?:a|de|em|com|para|por|sobre|ate|desde|do|no) )?(?:que|qual|quais)|porque|como)\b)/,
  it: /^(?:e se\b|(?:(?:e|ma|allora) )?(?:(?:(?:a|di|da|in|su|con|per) )?(?:che|cosa|cos|quale|quali|qual)|perche|come|com)\b)/,
  de: /^(?:(?:und|aber) )?(?:(?:(?:an|auf|aus|bei|mit|nach|von|zu|fur|uber|unter|in|durch) )?(?:was|welche|welcher|welches|welchen|welchem)|warum|wieso|weshalb|weswegen|wie|woran|wodurch|worauf|wovon|womit|worin|wofur|wonach|woraus)\b/,
};

// The reader (or Bobby) as the subject: "should I…", "¿qué hago…?", "was soll ich…", and the unnamed "one" of
// French and German ("et si on prenait…", "wenn man … nimmt"). A what-or-why question about the asset needs none
// of them. Read in the reply's language only: "mes" is "my" in French and a month in Spanish, "i" is a pronoun in
// English and an article in Italian, "on" is a pronoun in French and a preposition in English.
// A person nobody named is the reader too: "what if someone…", "¿qué debe hacer quien tiene…?", "chi possiede…".
const PERSONAL: Record<AppLanguage, ReadonlySet<string>> = {
  en: setOf('i me my mine myself we us our ours ourselves you your yours yourself someone somebody anyone anybody everyone everybody people person folks holder holders owner owners newcomer newcomers beginner beginners who whom whoever'),
  es: setOf('yo me mi mis mio mia mios mias conmigo nos nosotros nuestro nuestra nuestros nuestras tu te ti tus tuyo tuya contigo usted ustedes alguien quien quienes gente persona personas cualquiera'),
  fr: setOf('je j me m moi mon ma mes nous notre nos tu te toi ton ta tes vous votre vos on quelqu quelquun quiconque gens personne personnes celui ceux celle celles'),
  pt: setOf('eu me mim meu minha meus minhas comigo nosso nossa nossos nossas tu te ti teu tua teus tuas contigo voce voces alguem quem gente pessoa pessoas'),
  it: setOf('io mi me mio mia miei mie noi nostro nostra nostri nostre tu ti te tuo tua tuoi tue voi vostro vostra qualcuno chi chiunque gente persona persone'),
  de: setOf('ich mir mich mein meine meinen meinem meiner meines wir uns unser unsere unseren unserem unserer du dir dich dein deine deinen deinem deiner man jemand jemanden jemandem wer wem wen leute'),
};

// A suggestion opens with an allowed word and still proposes an act: "Why not take it today?", "How about…",
// "¿Qué tal…?", "Pourquoi ne pas…", "Wie wäre es mit…". `always` is the construction that is one whatever
// follows. `lead` is the one that is a suggestion only before a verb whose unnamed subject is the reader, given
// by `verb` (an infinitive, a gerund, a first person plural): "¿Y si tomamos…?" and "Perché non prendere…?" are,
// "¿Y si BTC pierde el soporte?" and "Perché non sale?" are what-or-why questions about the asset. One adverb may
// stand between ("¿Por qué no mejor…?").
const SUGGESTION: Record<AppLanguage, { always?: RegExp; lead?: RegExp; verb?: RegExp }> = {
  en: {
    always: / (?:why not|how about|how bout|what about|what say|what to|which to|how to|why to|how best|how else) /,
    lead: / what if (?:not )?([a-z]+)/g, verb: /^(?!(?:nothing|something|everything|anything)$)[a-z]+ing$/,
  },
  es: {
    always: / que tal /,
    lead: / (?:por que no|y si) (?:(?:ya|mejor|simplemente|solo|ahora|hoy|entonces|directamente) )?([a-z]+)/g,
    verb: /^[a-z]{2,}(?:(?:ar|er|ir)(?:se|me|te|nos|lo|la|los|las|le|les)?|amos|emos|imos)$/,
  },
  fr: { always: / (?:pourquoi ne pas|pourquoi pas|que diriez|que dirais|que dire d|quid d) / },
  pt: {
    always: / que tal /,
    lead: / (?:por que nao|porque nao|e se) (?:(?:ja|simplesmente|so|agora|hoje|entao) )?([a-z]+)/g,
    verb: /^[a-z]{2,}(?:ar|er|ir|armos|ermos|irmos|amos|emos|imos)$/,
  },
  it: {
    always: / (?:che ne dici|che ne dite|che ne pensi|che ne pensate|perche no) /,
    lead: / (?:perche non|e se) (?:(?:semplicemente|subito|ora|adesso|gia|oggi) )?([a-z]+)/g,
    verb: /^[a-z]{2,}(?:are|ere|ire|rre|(?:ar|er|ir)(?:lo|la|li|le|ne|si|ci|mi|ti|vi|gli)|iamo|ssimo)$/,
  },
  de: { always: / (?:warum nicht|wieso nicht|weshalb nicht|weswegen nicht|wie ware es|wie war s|wie wars) / },
};

// A question word and a bare verb, with nobody as its subject, is asked of the reader: "Why keep it?", "¿Cómo
// aprovechar la caída?", "Comment profiter…", "Perché tenersi…". English shows it by what follows "why": a verb
// where a helper, an article or the asset would stand. The others show it by the infinitive, read by its ending.
// To explain, interpret, read or understand is not to act ("Comment expliquer la baisse ?"), and a few words
// only look like infinitives.
const WHY_THEN = setOf(`is are was were did does do has have had would could might can cannot isn aren wasn weren didn doesn don hasn haven hadn wouldn couldn
  the this that these those a an its their so such some most many few all both each every no not then now there here it they more less any another other ${ASSET}`);
const BARE: Record<AppLanguage, { lead: RegExp; unless: ReadonlySet<string> } | null> = {
  en: null,
  es: { lead: /^ (?:(?:y|pero|entonces) )?(?:(?:por|para) que|como|que|cual) (?:no )?([a-z]+(?:ar|er|ir)(?:se|lo|la|los|las|le|les)?) /, unless: setOf('explicar interpretar leer entender comprender ayer cualquier primer tercer lugar poder') },
  // French: -er, -ir, -oir, and the -re infinitives by their endings ("prendre", "faire", "suivre", "mettre"); "montre" and "entre" are not.
  fr: { lead: /^ (?:(?:et|mais|alors) )?(?:pourquoi|comment|que|quoi|qu) (?:ne pas )?([a-z]+(?:er|ir|oir|dre|ire|aire|oire|vre|pre|ure|ttre|aitre|oitre)) /, unless: setOf('expliquer interpreter lire comprendre hier premier dernier') },
  pt: { lead: /^ (?:(?:e|mas|entao) )?(?:por que|porque|como|o que|que|qual) (?:nao )?([a-z]+(?:ar|er|ir)) /, unless: setOf('explicar interpretar ler entender compreender qualquer lugar poder par') },
  it: { lead: /^ (?:(?:e|ma|allora) )?(?:perche|come|che cosa|che|cosa) (?:non )?([a-z]+(?:are|ere|ire|rre)(?:si|lo|la|li|le|ne|ci)?) /, unless: setOf('spiegare interpretare leggere capire pare') },
  de: null,
};
// "Do" as something a person does: "¿qué debe hacer quien…?", "que faudrait-il faire de…", "cosa dovrebbe fare
// chi…". The same infinitive before another one is a cause, and the asset is its object: "faire baisser NVDA",
// "far salire NVDA", "hacer caer a NVDA". Read by what follows it.
const DOES: Record<AppLanguage, { verb: ReadonlySet<string>; caused: RegExp } | null> = {
  en: null, de: null,
  es: { verb: setOf('hacer'), caused: /^[a-z]+(?:ar|er|ir)$/ }, fr: { verb: setOf('faire'), caused: /^[a-z]+(?:er|ir|re)$/ },
  pt: { verb: setOf('fazer'), caused: /^[a-z]+(?:ar|er|ir)$/ }, it: { verb: setOf('fare far'), caused: /^[a-z]+(?:are|ere|ire)$/ },
};
// English: a verb in -ing, or after "to", with the asset as its object is an act named as a thing ("what would
// dropping NVDA change?", "what would it mean to trade NVDA here?"). The verbs that move a price take the asset
// as their object without anyone acting ("what is driving NVDA?", "what would it take to move NVDA?").
const MOVES_IT = setOf('move moving drive driving push pushing pull pulling lift lifting drag dragging pressure pressuring support supporting hurt hurting help helping fuel fueling fuelling hit hitting weigh weighing cause causing make making lead leading trigger triggering limit limiting capping reject rejecting slow slowing stall stalling stop stopping holding keeping');
const NOT_A_VERB = setOf('the this that these those a an its their all any both each every no other another such during something anything nothing everything');
const ACTS_ON_IT = new RegExp(` (?:to ([a-z]+)|([a-z]+ing)) (?:(?:the|this|that|these|those|some|more|any|all|a|an) )?${ASSET}(?! s )`, 'g');

// An infinitive with the asset as its object is an act named as a thing: "¿qué significaría cerrar NVDA hoy?",
// "que voudrait dire changer NVDA ?". It is the asset that acts, or is acted on by the market, only when a helper
// governs the infinitive: "podría frenar a NVDA", "ferait baisser NVDA", "potrebbe far salire NVDA", "teria de
// mudar em…". `verb` reads an infinitive by its ending; a listed word that only looks like one is in BARE.
const GOVERNED: Record<AppLanguage, { verb: RegExp; by: RegExp } | null> = {
  en: null, de: null,
  es: { verb: /^[a-z]+(?:ar|er|ir)$/, by: / (?:puede|pueden|podria|podrian|pudo|pueda|debe|deben|hace|hacen|haria|harian|hizo|hacer|suele|logra|logro|(?:tiene|tienen|tendria|tendrian|tenia|tuvo) que)$/ },
  fr: { verb: /^[a-z]+(?:er|ir|oir|dre|ire|aire|oire|vre|pre|ure|ttre|aitre|oitre)$/, by: / (?:peut|peuvent|pourrait|pourraient|pouvait|doit|doivent|devrait|devraient|fait|font|ferait|feraient|faire)$/ },
  pt: { verb: /^[a-z]+(?:ar|er|ir)$/, by: / (?:pode|podem|poderia|poderiam|podia|deve|devem|faz|fazem|faria|fariam|fez|fazer|(?:tem|teria|teriam|tinha|teve) (?:de|que))$/ },
  it: { verb: /^[a-z]+(?:are|ere|ire|rre)$/, by: / (?:puo|possono|potrebbe|potrebbero|poteva|deve|devono|dovrebbe|dovrebbero|fa|fanno|farebbe|farebbero|fare|far)$/ },
};
// To stay in the asset is to keep it, whatever the verb's form: "what does staying in NVDA mean?", "¿qué significa
// seguir en NVDA?", "bei NVDA bleiben".
const STAYS: Record<AppLanguage, RegExp> = {
  en: new RegExp(` (?:stay|staying|remain|remaining|be|being) (?:in|with|on|out of|away from) ${ASSET} `),
  es: new RegExp(` (?:seguir|quedar|permanecer|estar|continuar) (?:en|con|dentro de|fuera de|lejos de) ${ASSET} `),
  fr: new RegExp(` (?:rester|demeurer|etre) (?:sur|dans|en|avec|hors de) ${ASSET} `),
  pt: new RegExp(` (?:ficar|seguir|continuar|permanecer|estar) (?:em|com|dentro de|fora de|longe de) ${ASSET} `),
  it: new RegExp(` (?:restare|rimanere|stare|essere) (?:su|in|con|fuori da|lontano da) ${ASSET} `),
  de: new RegExp(` (?:in|bei|an|aus) ${ASSET} (?:[a-z]+ )?(?:bleiben|festhalten) `),
};
// The pick of the week: "the stock for this week", "la acción para hoy", "die Aktie für diese Woche".
const PICK: Record<AppLanguage, RegExp> = {
  en: / (?:stock|asset|coin|token|share|name|one) for (?:today|this|the|next|the coming) /,
  es: / (?:accion|activo|moneda|cripto|token) para (?:hoy|esta|este|la|el) /,
  fr: / (?:action|actif|titre|crypto|jeton) pour (?:aujourd|cette|ce|la|le) /,
  pt: / (?:acao|ativo|papel|moeda|cripto|token) para (?:hoje|esta|este|a|o) /,
  it: / (?:azione|titolo|asset|cripto|moneta|token) per (?:oggi|questa|questo|la|il) /,
  de: / (?:aktie|coin|token) fur (?:heute|diese|dieser|diesen|die|den) /,
};

// An amount of the asset is a position: "the case for more NVDA", "algo de NVDA", "etwas NVDA".
const AMOUNT_OF_IT: Record<AppLanguage, RegExp> = {
  en: new RegExp(` (?:some|more|less|fewer|any|enough|extra|much) (?:${ASSET}(?! s )|shares |stock |coins |tokens )`),
  es: new RegExp(` (?:mas|menos|algo de|poco de|tanto) ${ASSET} `),
  fr: new RegExp(` (?:plus de|moins de|peu de|davantage de|du) ${ASSET} `),
  pt: new RegExp(` (?:mais|menos|algum|pouco de) ${ASSET} `),
  it: new RegExp(` (?:piu|meno|po di|altro) ${ASSET} `),
  de: new RegExp(` (?:mehr|weniger|etwas) ${ASSET} `),
};

// Whether or when to act, in the six languages at once (a reply may borrow a word: "hold", "trade", "target").
// Where a language tells the two apart, the forms listed are the ones that act (the infinitive after "should" or
// "conviene", the first person) and the third person that describes a price is left alone ("mantiene el sesgo",
// "hält die Unterstützung"). English cannot tell them apart, so "hold" and "add" are refused outright.
// Timing is read as single words (moment, timing, late, tarde, tardi), not as fixed phrases: one adjective in
// between must not let it through.
const ACT_WORDS = setOf(`
  enter entering entry entries exit exits exiting add adding hold holding wait waiting trim trimming should shall ought worth worthwhile
  position positions target targets chase chasing allocate allocation sizing leverage cheap expensive bargain undervalued overvalued
  opportunity opportunities attractive upside fomo hodl hodling
  purchase purchases purchased purchasing acquire acquires acquired acquiring own owns owned owning grab grabs grabbing grabbed
  dump dumps dumping dumped offload offloading unload unloading liquidate liquidating ditch ditching swap swapping shorting bet bets betting scoop scoops scooped scooping
  moment moments timing late early optimal smart smarter smartest wise wiser wisest sensible prudent savvy keep keeping

  entro entras entramos entrando entrada entradas salgo espero esperamos mantengo aguanto invierto opero operacion operaciones agrego anado acumulo
  posicion posiciones objetivo objetivos conviene convendria convenga convenia debo debes debemos deberia deberias deberiamos puedo podemos hago hacemos
  apalancamiento barato barata ganga atractivo atractiva infravalorado infravalorada sobrevalorado sobrevalorada oportunidad oportunidades
  tomo tomamos adquiero apuesto apuesta apuestas momento momentos tarde temprano oportuno optimo optima

  entree entrees sors attendons attendez patienter objectif objectifs cible cibles devrais devons devrions devez devriez faut levier
  opportunite opportunites attrayant attrayante prends prenons prenez prenne miser tard opportun optimale faudrait faudra fallait judicieux judicieuse

  saio aguardo mantenho invisto operacao operacoes posicao posicoes alvo alvos devo deves devemos deveria deverias deveriamos posso faco fazemos
  convem alavancagem pechincha oportunidade oportunidades atraente aposto aposta apostas otimo otima

  entrata entrate ingresso ingressi esco usciamo aspetto aspettiamo attendo tengo investo posizione posizioni aggiungo obiettivo obiettivi
  dovrei dovresti dobbiamo dovremmo devi possiamo faccio facciamo converrebbe opportunita occasione occasioni attraente
  prendo prendiamo scommessa scommesse puntare momenti tardi opportuno ottimale conviene bisogna bisognerebbe occorre saggio

  warten abwarten abzuwarten zuwarten warte halten behalten halte aufstocken nachlegen handeln traden positionen positionieren tun lohnt lohnen lohnenswert
  zeitpunkt hebel gunstig billig schnappchen attraktiv gelegenheit gelegenheiten unterbewertet uberbewertet
  nehmen nehme mitnehmen mitzunehmen zugreifen zuschlagen besitzen abstossen loswerden veraussern liquidieren wetten wette zocken momente fruh optimalen optimaler
  machen soll sollen sollte sollten nutzen ausnutzen klug sinnvoll ratsam
`);
// A word that acts in one language and is an ordinary word in another is read only where it acts: Spanish
// "salida" and "inversión", the French verb "trader" (an English noun), "tôt" and "dois", Portuguese "saída",
// "compensa" and "cedo", Italian "uscita", "leva" (Portuguese "leads") and "presto", German "Chance" (the English
// and French "chance") and "spät".
const ACT_WORDS_IN: Record<AppLanguage, ReadonlySet<string>> = {
  en: setOf(''),
  es: setOf('salida salidas inversion inversiones pronto'),
  fr: setOf('sortie sorties trader dois attends occasion occasions tot pari'),
  pt: setOf('saida saidas compensa cedo pego'),
  it: setOf('uscita uscite leva presto'),
  de: setOf('chance chancen spat shorten'),
};
// A word that begins with one of these: the infinitive with its endings ("entrar", "entraría", "einsteigen").
const ACT_STEMS = wordsOf(`accumul acumul ideal
  entrar esperar mantener aguantar invertir operar agregar anadir promediar tomar adquir adquier agarrar soltar liquidar apostar aprovech quedarse
  entrer sortir attendre garder conserver renforcer ajouter prendr acquer acquier ramasser positionner liquider parier detenir posseder
  sair aguardar manter segurar adicionar apanhar largar possuir aproveit
  uscir aspettar attender tenere aggiunger acquisir mollar scaricar scommett possed possied sfrutt approfitt
  einsteig einstieg aussteig ausstieg kursziel erwerb erwirb`);
// The same, where the stem acts in one language only: Spanish "salir" is Italian "salire" (to rise), Italian
// "prendere" is Portuguese "prender" (to hold back), Italian "detenere" is Spanish "detener" (to stop).
const ACT_STEMS_IN: Record<AppLanguage, readonly string[]> = { en: [], es: ['salir'], fr: [], pt: ['pegar'], it: ['prender', 'detener'], de: [] };
// To invest is to act; the people who invest are part of what happened ("what are investors missing?").
const INVESTS = /^invest(?!(?:ors?|oren|isseurs?|itor[ei]|idor(?:es)?)$)/;
// Timing and "what to do", as runs of words.
const ACT_PHRASES = [
  'too late', 'too early', 'late to', 'early to', 'good moment', 'good time', 'right moment', 'right time', 'best moment', 'best time', 'bad moment', 'bad time',
  'time to', 'moment to', 'when to', 'when should', 'to do', 'do with', 'do now', 'do about', 'do here', 'go long', 'go short', 'going long', 'going short', 'long or short',
  'open a long', 'open a short', 'get in', 'get out', 'getting in', 'getting out', 'jump in', 'pile in', 'load up', 'cash out', 'stay in', 'stay out', 'sit out', 'sitting out', 'step in',
  'how much', 'how many', 'how long', 'how soon', 'how to', 'how high', 'how low', 'how far', 'miss out', 'missing out', 'to trade', 'a trade', 'the trade', 'this trade', 'that trade', 'trade it', 'trade this', 'trade that',
  'trade here', 'trade now', 'trade idea', 'best trade', 'good trade', 'stop loss', 'safe to', 'what price', 'which price',
  'to long', 'to short', 'long it', 'short it', 'a long here', 'a short here', 'snap up', 'stock up', 'good deal', 'screaming deal', 'sweet deal', 'a steal',
  'stay with', 'be in xassetx', 'being in xassetx', 'been in xassetx', 'smart move', 'right move', 'best move', 'good move', 'the day for', 'the day to', 'the week for', 'the week to', 'el dia para', 'la semana para', 'le jour pour', 'la semaine pour', 'o dia para', 'a semana para', 'il giorno per', 'la settimana per', 'der tag fur', 'die woche fur',
  'buen momento', 'mal momento', 'mejor momento', 'momento de', 'momento para', 'hora de', 'es hora', 'demasiado tarde', 'muy tarde', 'tarde para', 'es tarde', 'demasiado pronto', 'muy pronto', 'pronto para',
  'la pena', 'que hacer', 'hacer con', 'hacer ahora', 'hacer aqui', 'ponerse largo', 'ponerse corto', 'ir largo', 'ir corto', 'largo o corto', 'abrir largo', 'abrir corto', 'cuanto tiempo', 'hasta donde', 'hasta cuando', 'que precio',
  'bon moment', 'mauvais moment', 'meilleur moment', 'moment pour', 'moment de', 'moment d', 'trop tard', 'trop tot', 'tard pour', 'tot pour', 'que faire', 'quoi faire', 'faire avec', 'faire maintenant', 'faire ici',
  'vaut le coup', 'jusqu ou', 'combien de temps', 'long ou short', 'quel prix', 'bon marche',
  'bom momento', 'mau momento', 'melhor momento', 'tarde demais', 'muito tarde', 'cedo demais', 'muito cedo', 'cedo para', 'a pena', 'que fazer', 'fazer com', 'fazer agora', 'fazer aqui', 'quanto tempo', 'ate onde', 'ate quando', 'que preco',
  'buon momento', 'brutto momento', 'cattivo momento', 'momento giusto', 'momento migliore', 'miglior momento', 'momento di', 'momento per', 'ora di', 'troppo tardi', 'tardi per', 'troppo presto', 'presto per',
  'che fare', 'cosa fare', 'da fare', 'fare con', 'fare adesso', 'fare ora', 'fare qui', 'fino a dove', 'fino a quando', 'long o short', 'che prezzo', 'quale prezzo', 'buon mercato',
  'zu spat', 'zu fruh', 'spat fur', 'fruh fur', 'gute zeit', 'zeit fur', 'zeit zum', 'zu tun', 'wie viel', 'wie viele', 'wie lange', 'wie lang', 'wie hoch', 'wie tief', 'wie weit', 'long oder short', 'welcher preis', 'welchem preis', 'welchen preis', 'welcher kurs', 'welchem kurs', 'welchen kurs',
];

// "Which day is best?" is "when?" behind an allowed opener. `asked`: the question asks for a time ("which day",
// "¿qué día…?", "an welchem Tag…"; "what time frame" is a chart). `time` beside `good`, at most two words apart
// in either order, is the same thing said around it ("the best day", "il giorno migliore").
const WHEN: Record<AppLanguage, { asked: RegExp; time: ReadonlySet<string>; good: ReadonlySet<string> }> = {
  en: { asked: /^(?:(?:and|so|but) )?(?:what|which) (?:days?|times?(?! frame)|weeks?|months?|hours?|sessions?|dates?|year)\b/,
    time: setOf('day days week weeks month months hour hours session sessions time date'), good: setOf('best right good perfect better worst wrong bad great smart') },
  es: { asked: /^(?:(?:y|pero|entonces) )?(?:(?:a|de|en|con|para|por|sobre|hasta|desde) )?(?:que|cual|cuales) (?:dias?|horas?|semanas?|mes|meses|fechas?|ano)\b/,
    time: setOf('dia dias hora horas semana semanas mes meses fecha sesion jornada'), good: setOf('mejor mejores buen bueno buena perfecto perfecta adecuado adecuada correcto correcta indicado indicada peor mal malo mala') },
  fr: { asked: /^(?:(?:et|mais|alors) )?(?:(?:a|de|sur|pour|en|par|vers|avec|dans) )?(?:quel|quelle|quels|quelles) (?:jours?|journee|heures?|semaines?|mois|dates?|seance|annee)\b/,
    time: setOf('jour jours journee heure heures semaine semaines mois date seance'), good: setOf('meilleur meilleure meilleurs meilleures bon bonne parfait parfaite mauvais mauvaise pire propice') },
  pt: { asked: /^(?:(?:e|mas|entao) )?(?:(?:a|de|em|com|para|por|sobre|ate|desde|do|no) )?(?:que|qual|quais) (?:dias?|horas?|semanas?|mes|meses|datas?|altura|ano)\b/,
    time: setOf('dia dias hora horas semana semanas mes meses data sessao pregao'), good: setOf('melhor melhores bom boa perfeito perfeita pior mau certo certa adequado adequada') },
  it: { asked: /^(?:(?:e|ma|allora) )?(?:(?:a|di|da|in|su|con|per) )?(?:che|quale|quali|qual) (?:giorn[oi]|giornata|or[ae]|settiman[ae]|mes[ei]|dat[ae]|anno)\b/,
    time: setOf('giorno giorni giornata ore settimana settimane mese mesi data seduta'), good: setOf('migliore migliori miglior buon buono buona perfetto perfetta ottimo ottima giusto giusta peggiore cattivo cattiva adatto adatta') },
  de: { asked: /^(?:(?:und|aber) )?(?:(?:an|auf|aus|bei|mit|nach|von|zu|fur|uber|unter|in|durch) )?(?:welche|welcher|welches|welchen|welchem) (?:tag|tage|tagen|stunden?|wochen?|monate?|uhrzeit|datum|jahr)\b/,
    time: setOf('tag tage tagen stunde stunden woche wochen monat monate uhrzeit datum handelstag'), good: setOf('beste bester besten bestes gut gute guter guten gutes perfekt perfekte perfekter richtig richtige richtiger richtigen schlecht schlechte besser') },
};

// A word of the lists above in a use that does not act, set aside before they are read (and only before they
// are: every other rule reads the whole question). The words for "now" at the end of the question ("at the
// moment", "en ce moment", "im Moment"); a range, a channel or a consolidation left by its "exit" ("une sortie
// de range", "salir del rango", "uscita dal range"), which is a breakout; a trend's "inversión"; "its own".
const NEUTRAL: Record<AppLanguage, readonly RegExp[]> = {
  en: [/ (?:at|for) (?:the|this) moment $/, / (?:its|their|s) own(?= )/g, / right now(?= )/g,
    // The asset holds a level; nobody holds the asset: "why is NVDA holding above its average?", "what is keeping it up?".
    / (?<=(?:is|are|was|were|been|keeps|kept|still|not|isn t|xassetx) )(?:holding|keeping)(?= )/g],
  es: [/ (?:en este momento|en estos momentos|por el momento|de momento) $/,
    / (?:salidas?|salir) (?:xassetx )?(?:del|de la|de su|de) (?:rango|canal|lateral|consolidacion|triangulo|zona|banda|cuna|rectangulo)(?= )/g, / inversion de (?:la )?tendencia(?= )/g],
  fr: [/ (?:en ce moment|pour le moment) $/,
    / (?:sorties?|sortir) (?:xassetx )?(?:du|de la|de son|de sa|de ce|de cette|de|d un|d une) (?:range|canal|consolidation|triangle|zone|bande|biseau|rectangle|fourchette|intervalle)(?= )/g, / sorties? (?:par le (?:haut|bas)|haussieres?|baissieres?)(?= )/g],
  pt: [/ (?:neste momento|no momento|de momento) $/,
    / (?:saidas?|sair) (?:xassetx )?(?:do|da|de|deste|desta|do seu|da sua) (?:range|intervalo|canal|consolidacao|lateralizacao|triangulo|zona|faixa|retangulo)(?= )/g],
  it: [/ (?:in questo momento|al momento|per il momento) $/,
    / (?:uscit[ae]|uscire) (?:xassetx )?(?:dal|dalla|dallo|dall|da|dal suo|dalla sua) (?:range|canale|consolidamento|laterale|lateralita|triangolo|zona|fascia|congestione|rettangolo)(?= )/g],
  de: [/ (?:im moment|in diesem moment|zum jetzigen zeitpunkt|zum aktuellen zeitpunkt|zu diesem zeitpunkt) $/],
};

// The words Bobby's copy never uses, in any language, even negated: buy, sell, profit, guaranteed, returns,
// advice, signal, alert. A next question is copy like any other. "Guaranteed" has a family: sure, a winner,
// cannot lose, can only rise.
const FORBIDDEN_WORDS = setOf(`
  buy buys buying bought buyer buyers sell sells selling sold seller sellers
  profit profits profitable profitability gains returns advice advise advises advised advisor adviser advisable
  signal signals signaling signalling alert alerts alerting
  sure surefire certainty certainly definitely inevitable unstoppable foolproof riskless winner winners winning safe safest
  compra compras compro compre compres compren compramos compran comprando comprado comprada
  vende vendes vendo venda vendas vendan vendemos venden vendiendo vendido vendi venta ventas
  ganancia ganancias beneficio beneficios lucro lucros rentable rentabilidad retorno retornos rendimiento rendimientos
  consejo consejos asesoria asesor asesoramiento senal senales alerta alertas
  seguro segura seguros seguras ganador ganadora ganadores ganadoras infalible imparable asegurado asegurada
  achat achats vends vend vendez vendons vendeur vendeurs vente ventes benefice benefices rentabilite rendement rendements
  conseil conseils signaux alerte alertes gagnant gagnante gagnants gagnantes infaillible forcement
  ganho ganhos lucrativo rentavel rentabilidade rendimento rendimentos conselho conselhos assessoria sinal sinais
  vencedor vencedora vencedores vencedoras ganhador ganhadora certeza infalivel imparavel inevitavel
  compri compriamo vendita vendite profitto profitti guadagno guadagni redditizio rendimenti consulenza segnale segnali allerta allerte
  sicuro sicura sicuri sicure vincente vincenti certezza infallibile inarrestabile inevitabile
  gekauft gewinn gewinne gewinnen gewinner profite profitabel rendite renditen ertrag ertrage rat ratschlag ratschlage beratung anlageberatung signale signalen alarm alarme
  sicher sichere sicherer sicheres sicheren todsicher bombensicher risikolos unaufhaltsam unvermeidlich zwangslaufig
  www http https okx okb xlayer
  will wont gonna
`);
/** "certain" is sure in English and "some" in French ("certains investisseurs"). */
const FORBIDDEN_WORDS_IN: Record<AppLanguage, ReadonlySet<string>> = { en: setOf('certain'), es: setOf(''), fr: setOf(''), pt: setOf(''), it: setOf(''), de: setOf('') };
const FORBIDDEN_STEMS = ['profit', 'guarant', 'garant', 'garanz', 'recommend', 'recommand', 'recomend', 'recomiend', 'raccomand', 'aconsej', 'aconselh', 'conseill', 'consigli', 'empfehl', 'empfiehl',
  'comprar', 'vender', 'achet', 'vendre', 'acquist', 'kauf', 'verkauf', 'nachkauf', 'zukauf', 'einkauf'];
// Certainty said in several words (the asset may stand in the middle: "can NVDA only go higher"), and a link
// spelled out ("bobby dot xyz").
const FORBIDDEN_RUNS: readonly RegExp[] = [
  / can (?:xassetx |it |this |that )?only /, / (?:cannot|can t|could not|couldn t) (?:lose|fail|miss) /, / (?:bound|certain|sure|going|about|set|poised|destined|likely) to /, / (?:no brainer|sure thing|risk free|no risk|one way) /,
  / only go(?:es|ing)? /, / go(?:es|ing)? only /, / x layer /,
  // What the asset "is going to" do, in the languages that say it with a helper: a next question presupposes no move.
  / va[ns]? a /, / vai /, / vao /, / (?:va|vont) (?:xassetx )?[a-z]+(?:er|ir|re) /, / sta(?:nno)? per /, / wird /, / werden /,
  / solo (?:xassetx )?puede /, / puede solo /, / no puede (?:perder|fallar) /, / sin (?:ningun )?riesgo /,
  / ne (?:xassetx )?peut que /, / a coup sur /, / valeur sure /, / sans (?:aucun )?risque /,
  / so (?:xassetx )?pode /, / pode so /, / nao pode (?:perder|falhar) /, / sem (?:nenhum )?risco /,
  / puo solo /, / solo (?:xassetx )?puo /, / non puo (?:perdere|fallire) /, / senza (?:alcun )?risch(?:io|i) /, / colpo sicuro /,
  / kann (?:xassetx )?nur /, / nur (?:xassetx )?kann /, / ohne risiko /, / kein risiko /,
  / (?:dot|punto|ponto|point|punkt) (?:com|xyz|io|org|net|app|co|ai|me|ly|link|gg|fi|finance|fun|pro|info|es|fr|de|it|pt|br|mx|uk|us) /,
];

// A number written out is still a price ("one fifty", "doscientos", "zweihundert"), and a percentage is still a
// level. The magnitudes are read in every reply language, with English (a reply may say "ninety k"); the small
// numbers only in their own, where they are numbers: "dos" is two in Spanish and "of the" in Portuguese, "tres"
// is three in Spanish and "very" in French, "once" is eleven in Spanish, "sei" is six in Italian, "elf" eleven in
// German. The articles that are also "one" (un, una, ein, a) are never read as numbers.
const NUMBER_WORDS = setOf(`hundred thousand million billion trillion percent
  zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen
  twenty thirty forty fifty sixty seventy eighty ninety k
  cien ciento mil millon millones cent cents mille millions milliard milliards pourcent
  cem cento milhao milhoes bilhao porcento mila milione milioni miliardo percento
  hundert tausend millionen milliarde milliarden prozent`);
const NUMBER_WORDS_IN: Record<AppLanguage, ReadonlySet<string>> = {
  en: setOf('grand half'),
  es: setOf('cero dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince veinte treinta cuarenta cincuenta sesenta setenta ochenta noventa billon billones'),
  fr: setOf('deux trois quatre cinq sept huit neuf dix onze douze treize quatorze quinze seize vingt vingts trente quarante cinquante soixante'),
  pt: setOf('dois duas tres quatro cinco seis sete oito nove dez onze doze treze catorze quatorze quinze dezesseis dezasseis dezessete dezassete dezoito dezenove dezanove vinte trinta quarenta cinquenta sessenta setenta oitenta noventa bilhoes'),
  it: setOf('due tre quattro cinque sei sette otto nove dieci'),
  de: setOf('null eins zwei drei vier funf sechs sieben acht neun zehn elf zwolf'),
};
// Numbers a language writes as one word: "veinticinco", "doscientos", "duzentos", "centocinquanta",
// "fünfundneunzig", "hunderttausend". From four letters on, so the pieces that are also an article or "and"
// ("ein", "uno", "und") are never a number by themselves.
const NUMBER_COMPOUND: Record<AppLanguage, RegExp | null> = {
  en: null,
  es: /^(?:(?:dieci|veinti)(?:un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)|(?:dos|tres|cuatro|seis|ocho)cient[oa]s|(?:quinient|setecient|novecient)[oa]s)$/,
  fr: null,
  pt: /^(?:duzent|trezent|quatrocent|quinhent|seiscent|setecent|oitocent|novecent)[oa]s$/,
  it: /^(?=[a-z]{4})(?:un|uno|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|undici|dodici|tredici|quattordici|quindici|sedici|diciassette|diciotto|diciannove|venti?|trenta?|quaranta?|cinquanta?|sessanta?|settanta?|ottanta?|novanta?|cento|mille|mila)+$/,
  de: /^(?=[a-z]{4})(?:ein|eins|zwei|drei|vier|funf|sechs|sech|sieben|sieb|acht|neun|zehn|elf|zwolf|zwanzig|dreissig|vierzig|funfzig|sechzig|siebzig|achtzig|neunzig|hundert|tausend|und)+$/,
};

// The commonest function words of each language, folded. A question is read as written in the reply's language
// unless another language claims more of its words: "Was would confirm the trend here?" opens like a German
// question and has four English function words to one German. Words two languages share count for both, so a
// short sentence whose function words are all shared is not told apart (see the head of this file).
const FUNCTION_WORDS: Record<AppLanguage, ReadonlySet<string>> = {
  en: setOf(`the a an of to in on for is are was were does do did has have had would could will can what why which how if its this that these those
    with from about and or not be been at by as it there than when where who here now most more still so but after before over under into behind between`),
  es: setOf(`el la los las un una unos unas de del al a en con para por sobre entre hasta desde sin que cual cuales como si y o pero no es son esta estan este esto estos estas
    ese esa eso su sus se lo hay ha han fue ser tiene tienen mas muy ya aun hoy ahora cuando donde porque tras ante hacia segun tan tanto cada todo toda detras`),
  fr: setOf(`le la les un une des de du d l au aux en dans sur sous avec pour par vers chez que qu qui quoi quel quelle quels quelles comment pourquoi si et ou mais ne pas n
    est sont ce cet cette ces c son sa ses se s il elle ils elles y a ont ete etre plus tres deja encore maintenant quand parce apres avant entre depuis sans leur leurs t derriere`),
  pt: setOf(`o a os as um uma uns umas de do da dos das em no na nos nas com para por pelo pela sobre entre ate desde sem que qual quais como se e ou mas nao sao esta estao este
    isto isso esse essa seu sua seus suas ha tem foi ser mais muito ja ainda hoje agora quando onde porque apos ao aos tao cada todo toda num numa neste nesta`),
  it: setOf(`il lo la i gli le un uno una di del della dello dei degli delle dell a al alla allo ai agli alle all da dal dalla dallo dai dagli dalle dall in nel nella nello nei negli nelle nell
    su sul sulla sullo sui sugli sulle sull con per tra fra che cosa cos quale quali qual come com perche se e ed o ma non sono questo questa questi queste quel quello quella
    suo sua suoi sue si ci ha hanno stato essere piu molto gia ancora oggi ora adesso quando dove dopo prima senza l d dietro`),
  de: setOf(`der die das den dem des ein eine einen einem einer eines von vom zu zum zur in im an am auf aus bei beim mit nach fur uber unter durch gegen ohne um
    was warum wieso weshalb wie welche welcher welches welchen welchem wenn ob und oder aber nicht kein keine ist sind war wird werden wurde hat haben sich es er sie
    diese dieser dieses diesen diesem sein seine seinen seinem seiner ihr ihre noch schon mehr sehr heute jetzt damit dass als auch nur wann wo woran wodurch worauf so hinter`),
};
const LANGUAGES = Object.keys(FUNCTION_WORDS) as AppLanguage[];
// The accented letters each language writes with. Where two languages share every word of a short question,
// the accent still tells them apart: "tendência" and "diário" are not Spanish, "ñ" is not Portuguese.
const ACCENTED: Record<AppLanguage, string> = { en: '', es: 'áéíóúüñ', fr: 'àâæçéèêëîïôœùûüÿ', pt: 'áàâãéêíóôõúüç', it: 'àèéìíîòóùú', de: 'äöüß' };
const foreignLetter = (text: string, language: AppLanguage) => [...text.normalize('NFC').toLowerCase()].some(letter => letter > '\u007f' && /\p{L}/u.test(letter) && !ACCENTED[language].includes(letter));

// A word that is listed only in a fixed company: "what would it take", "the long term", "a time frame". Set
// aside before the word list is read; alone, "take", "long" and "time" are not on it.
const LISTED_RUNS: Record<AppLanguage, readonly RegExp[]> = {
  en: [/ (?<=it )takes?(?= )/g, / (?:long|longer|short|shorter|near|medium|mid)(?= term )/g, / time(?= frames? )/g],
  es: [], fr: [], pt: [], it: [], de: [],
};

/** Whether the question proposes an act behind an allowed opener (SUGGESTION). */
function suggests(run: string, language: AppLanguage): boolean {
  const { always, lead, verb } = SUGGESTION[language];
  if (always?.test(run)) return true;
  if (!lead || !verb) return false;
  for (const match of run.matchAll(lead)) if (match[1] !== ASSET && verb.test(match[1])) return true;
  return false;
}

/** Whether the question is a bare verb put to the reader (WHY_THEN, BARE, DOES, ACTS_ON_IT). */
function bareAct(run: string, words: readonly string[], language: AppLanguage): boolean {
  if (language === 'en') {
    const then = /^ (?:(?:and|so|but) )?why ([a-z]+) /.exec(run)?.[1];
    if ((then !== undefined && !WHY_THEN.has(then)) || AMOUNT_OF_IT.en.test(run)) return true;
    // After "to", any word but an article is read as the verb: "to back NVDA" acts as surely as "to trade NVDA".
    for (const [, base, gerund] of run.matchAll(ACTS_ON_IT)) {
      if (base ? !NOT_A_VERB.has(base) && !MOVES_IT.has(base) : !MOVES_IT.has(gerund) && !NOT_A_VERB.has(gerund)) return true;
    }
  }
  else if (AMOUNT_OF_IT[language].test(run)) return true;
  if (PICK[language].test(run) || STAYS[language].test(run)) return true;
  const bare = BARE[language], lead = bare?.lead.exec(run)?.[1];
  if (bare && lead !== undefined && !bare.unless.has(lead)) return true;
  const governed = GOVERNED[language];
  if (governed && words.some((word, at) => at > 0 && governed.verb.test(word) && listedWord(word, language) && !bare?.unless.has(word)
    && (words[at + 1] === ASSET || (words[at + 1] === 'a' && words[at + 2] === ASSET)) && !governed.by.test(` ${words.slice(0, at).join(' ')}`))) return true;
  const does = DOES[language];
  if (!does) return false;
  return words.some((word, at) => {
    if (!does.verb.has(word)) return false;
    const next = words[at + 1] === ASSET || words[at + 1] === 'a' ? words[at + 2] : words[at + 1];
    return next === undefined || does.verb.has(next) || !does.caused.test(next) || !listedWord(next, language);
  });
}

/** Whether the question asks when behind an allowed opener (WHEN). */
function asksWhen(words: readonly string[], language: AppLanguage): boolean {
  const { asked, time, good } = WHEN[language];
  if (asked.test(words.join(' '))) return true;
  return words.some((word, at) => time.has(word) && words.slice(Math.max(0, at - 2), at + 3).some(near => good.has(near)));
}

/** Single letters set apart, glued back: "b u y", "s, e, l, l". */
function gluedLetters(words: readonly string[]): string[] {
  const glued: string[] = [];
  let run = '';
  for (const word of [...words, '']) {
    if (word.length === 1) { run += word; continue; }
    if (run.length >= 3) glued.push(run);
    run = '';
  }
  return glued;
}

/** `text` with each whole occurrence of `name` replaced by the asset's placeholder; an apostrophe matches either way it is typed. */
function setAside(text: string, name: string): string {
  const pattern = escapeRegex(name).replace(/['’]/g, "['’]");
  return text.replace(new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, 'gu'), ` ${ASSET} `);
}

/** Whether a word is on any list that refuses it: such a word is never set aside as a name ("Target", "Best Buy"). */
const refusedWord = (word: string) => ACT_WORDS.has(word) || FORBIDDEN_WORDS.has(word) || NUMBER_WORDS.has(word) || FORBIDDEN_STEMS.some(stem => word.startsWith(stem)) || ACT_STEMS.some(stem => word.startsWith(stem));

/**
 * Whether `raw` may be served as the next question for a reply in `language` about `symbol`; null when it may.
 * It must be one question of one clause that opens with a what-or-why word of that language and is written in it,
 * and must not ask whether or when to act, speak of the reader or of anyone, carry a number, a price or a
 * currency, use a word Bobby's copy never uses, or hold a word that is not on the list of the words such a
 * question is written with. The asset's own ticker is set aside first, so "NOW", "ADD" or "7203.T" is never read
 * as a word or a number; so are the part of a listed ticker before its dot (PETR4 for PETR4.SA) and the asset's
 * `names` as written (Nvidia, Bitcoin), unless a name holds a word a rule refuses.
 */
export function nextQuestionViolation(raw: unknown, language: AppLanguage, symbol?: string | null, names: readonly string[] = []): NextQuestionViolation | null {
  if (typeof raw !== 'string') return 'shape';
  const text = raw.trim();
  if (text.length < FOLLOW_UP_MIN || text.length > FOLLOW_UP_MAX) return 'shape';
  const root = symbol && symbol.indexOf('.') >= 2 ? symbol.slice(0, symbol.indexOf('.')) : null;
  const aside = [symbol, root, ...[...names].sort((a, b) => b.length - a.length).filter(name => name.trim().length >= 2 && !(fold(name).match(/[a-z]+/g) ?? []).some(refusedWord))];
  const named = aside.reduce<string>((left, name) => (name ? setAside(left, name.trim()) : left), text);
  const plain = fold(named.replace(TIMEFRAME_CODE, ' ')).replace(/\s+/g, ' ').trim();
  const words = plain.match(/[a-z]+/g) ?? [];
  const run = ` ${words.join(' ')} `;
  // The act lists read the question with its harmless uses set aside; every other rule reads all of it.
  const harmless = NEUTRAL[language].reduce((left, neutral) => left.replace(neutral, ' '), run);
  const actWords = harmless.trim().split(/ +/);
  if (suggests(run, language) || bareAct(harmless, actWords, language) || asksWhen(actWords, language) || words.some(word => PERSONAL[language].has(word))
    || actWords.some(word => ACT_WORDS.has(word) || ACT_WORDS_IN[language].has(word) || INVESTS.test(word)
      || ACT_STEMS.some(stem => word.startsWith(stem)) || ACT_STEMS_IN[language].some(stem => word.startsWith(stem)))
    || ACT_PHRASES.some(phrase => run.includes(` ${phrase} `))) return 'act';
  const forbidden = (word: string) => FORBIDDEN_WORDS.has(word) || FORBIDDEN_WORDS_IN[language].has(word) || FORBIDDEN_STEMS.some(stem => word.startsWith(stem));
  if (words.some(forbidden) || FORBIDDEN_RUNS.some(said => said.test(run))
    // Letters set apart spell a word like any other: the glued run is searched for one, whole or with an ending.
    || gluedLetters(words).some(glued => [...FORBIDDEN_WORDS, ...ACT_WORDS].some(word => word.length >= 3 && glued.includes(word)))) return 'word';
  if (/[\p{N}\p{Sc}%‰]/u.test(plain)
    || words.some(word => NUMBER_WORDS.has(word) || NUMBER_WORDS_IN[language].has(word) || NUMBER_COMPOUND[language]?.test(word) === true)) return 'number';
  if (!ONE_QUESTION.test(plain) || SPELLED_OUT.test(plain) || words.length < 3 || SECOND_CLAUSE[language].test(plain) || EXCLAIMS[language]?.test(run)) return 'shape';
  if (!OPENERS[language].test(words.join(' '))) return 'opener';
  // The opening ¿ is Spanish; an accented letter belongs to the alphabet of the reply's language; and no other
  // language may claim more of the question's words than the reply's own.
  const claimed = (by: AppLanguage) => words.filter(word => FUNCTION_WORDS[by].has(word)).length;
  if ((plain.startsWith('¿') && language !== 'es') || foreignLetter(named, language) || LANGUAGES.some(other => other !== language && claimed(other) > claimed(language))) return 'language';
  // Last, the list of what is allowed: every word left once the harmless uses are set aside.
  const read = LISTED_RUNS[language].reduce((left, kept) => left.replace(kept, ' '), harmless).trim().split(/ +/);
  if (read.some(word => word !== ASSET && !listedWord(word, language))) return 'unlisted';
  return null;
}

/**
 * The question served when the model's own is refused: fixed, built from the symbol, one sentence, in the reply's
 * language. The sense is the same in all six: what would have to change in this asset for this read to change.
 * Each passes the check above and the desk's output guard, for any symbol (scripts/test-desk-levels.mts).
 */
export function nextQuestionFallback(language: AppLanguage, symbol: string): string {
  switch (language) {
    case 'es': return `¿Qué tendría que cambiar en ${symbol} para que cambie esta lectura?`;
    case 'fr': return `Qu’est-ce qui devrait changer sur ${symbol} pour que cette analyse change ?`;
    case 'pt': return `O que teria de mudar em ${symbol} para esta análise mudar?`;
    case 'it': return `Che cosa dovrebbe cambiare in ${symbol} perché questa analisi cambi?`;
    case 'de': return `Was müsste sich bei ${symbol} ändern, damit sich diese Analyse ändert?`;
    default: return `What would have to change in ${symbol} for this read to change?`;
  }
}

/**
 * The second fixed question, served when the first is the question the reader just asked (they tapped it, and
 * the model's next one was refused again): a why, where the first is a what-would-change. Held to the same
 * checks as the first. With two, a reader who keeps tapping is never handed the question they just had answered.
 */
export function nextQuestionSecond(language: AppLanguage, symbol: string): string {
  switch (language) {
    case 'es': return `¿Qué hay detrás del último movimiento de ${symbol}?`;
    case 'fr': return `Qu’est-ce qui explique le dernier mouvement de ${symbol} ?`;
    case 'pt': return `O que explica o último movimento de ${symbol}?`;
    case 'it': return `Che cosa spiega l’ultimo movimento di ${symbol}?`;
    case 'de': return `Was steckt hinter der jüngsten Bewegung bei ${symbol}?`;
    default: return `What is behind the latest move in ${symbol}?`;
  }
}

/**
 * Whether `candidate` is the question the reader just asked: the same letters and digits in the same order,
 * whatever the case, the accents, the spacing and the punctuation, with or without the symbol in front (the web
 * sends "NVDA · …" when a next question does not name its ticker). An empty text repeats nothing.
 */
export function repeatsQuestion(candidate: string, question: string, symbol: string): boolean {
  const key = (text: string) => (fold(text).match(/[\p{L}\p{N}]+/gu) ?? []).join(' ');
  const offered = key(candidate), asked = key(question);
  return offered.length > 0 && (asked === offered || asked === `${key(symbol)} ${offered}`);
}
