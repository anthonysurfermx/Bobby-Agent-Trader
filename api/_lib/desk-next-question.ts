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
import type { AppLanguage } from '../../src/lib/app-language.js';

/** The bounds of `synthesis.followUp` on the wire: every shipped client decodes a string of this size. */
export const FOLLOW_UP_MIN = 6;
export const FOLLOW_UP_MAX = 160;

/** The rule as the CIO is told it, beside the description of followUp. One sentence; the check below enforces it. */
export const NEXT_QUESTION_RULE = ' followUp asks what happened, why, or what would change this read, about the asset and never about the reader: never whether or when to act (entering, exiting, adding, holding, waiting, whether it is too late or a good moment), never a statement, never with a price, a level or any number, and never with the words signal or alert.';

/** Which part of the rule a follow-up broke. A class, never the text. */
export type NextQuestionViolation = 'shape' | 'opener' | 'act' | 'number' | 'word';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Lower case, without accents: "¿Qué señales…?" is read as "que senales". */
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').replace(/ß/g, 'ss').toLowerCase();

// The desk's own timeframe names are not prices: "on the 4H chart" stays a question about the chart.
const TIMEFRAME_CODE = /(?<![\p{L}\p{N}])(?:[14][hH]|1[dDwW])(?![\p{L}\p{N}])/gu;
// One sentence: letters, spaces (the no-break ones French sets before its question mark too), commas, apostrophes
// and hyphens or dashes, an optional opening ¿ and one closing question mark.
const ONE_QUESTION = /^¿?[\p{L}\p{M}'’ \u00a0\u202f,\-\u2010\u2011\u2013\u2014]+\?$/u;
// A magnitude spelled out is still a price ("a hundred thousand"), and a percentage is still a level.
const NUMBER_WORDS = new Set(['hundred', 'thousand', 'million', 'billion', 'trillion', 'percent',
  'cien', 'ciento', 'mil', 'millon', 'millones', 'cent', 'cents', 'mille', 'millions', 'milliard', 'milliards', 'pourcent',
  'cem', 'cento', 'milhao', 'milhoes', 'bilhao', 'porcento', 'mila', 'milione', 'milioni', 'miliardo', 'percento',
  'hundert', 'tausend', 'millionen', 'milliarde', 'milliarden', 'prozent']);

// How a what-or-why question opens, per reply language, on the folded words. A question that opens any other way
// ("Is now…", "Should…", "¿Conviene…?", "When…", "Lohnt sich…") is a yes/no or a timing question and is refused
// whatever follows. An optional "and" may lead, and a preposition may stand before the question word
// ("¿De qué depende…?", "À quoi tient…", "Unter welchen Bedingungen…").
const OPENERS: Record<AppLanguage, RegExp> = {
  en: /^(?:(?:and|so|but) )?(?:what|why|which|how)\b/,
  es: /^(?:y si\b|(?:(?:y|pero|entonces) )?(?:(?:(?:a|de|en|con|para|por|sobre|hasta|desde) )?(?:que|cual|cuales)|como)\b)/,
  fr: /^(?:et si\b|(?:(?:et|mais|alors) )?(?:(?:(?:a|de|sur|pour|en|par|vers|avec|dans) )?(?:que|qu|quoi|quel|quelle|quels|quelles)|pourquoi|comment)\b)/,
  pt: /^(?:e se\b|(?:(?:e|mas|entao) )?(?:o que|(?:(?:a|de|em|com|para|por|sobre|ate|desde|do|no) )?(?:que|qual|quais)|porque|como)\b)/,
  it: /^(?:e se\b|(?:(?:e|ma|allora) )?(?:(?:(?:a|di|da|in|su|con|per) )?(?:che|cosa|quale|quali|qual)|perche|come)\b)/,
  de: /^(?:(?:und|aber) )?(?:(?:(?:an|auf|aus|bei|mit|nach|von|zu|fur|uber|unter|in|durch) )?(?:was|welche|welcher|welches|welchen|welchem)|warum|wieso|weshalb|weswegen|wie|woran|wodurch|worauf|wovon|womit|worin|wofur|wonach|woraus)\b/,
};

// The reader (or Bobby) as the subject: "should I…", "¿qué hago…?", "was soll ich…". A what-or-why question about
// the asset needs neither. Read in the reply's language only: "mes" is "my" in French and a month in Spanish,
// "i" is a pronoun in English and an article in Italian.
const PERSONAL: Record<AppLanguage, ReadonlySet<string>> = {
  en: new Set(['i', 'me', 'my', 'mine', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours']),
  es: new Set(['yo', 'me', 'mi', 'mis', 'mio', 'mia', 'mios', 'mias', 'conmigo', 'nos', 'nosotros', 'nuestro', 'nuestra', 'nuestros', 'nuestras', 'tu', 'te', 'ti', 'tus', 'tuyo', 'tuya', 'contigo', 'usted', 'ustedes']),
  fr: new Set(['je', 'j', 'me', 'm', 'moi', 'mon', 'ma', 'mes', 'nous', 'notre', 'nos', 'tu', 'te', 'toi', 'ton', 'ta', 'tes', 'vous', 'votre', 'vos']),
  pt: new Set(['eu', 'me', 'mim', 'meu', 'minha', 'meus', 'minhas', 'comigo', 'nosso', 'nossa', 'nossos', 'nossas', 'tu', 'te', 'ti', 'teu', 'tua', 'teus', 'tuas', 'contigo', 'voce', 'voces']),
  it: new Set(['io', 'mi', 'me', 'mio', 'mia', 'miei', 'mie', 'noi', 'nostro', 'nostra', 'nostri', 'nostre', 'tu', 'ti', 'te', 'tuo', 'tua', 'tuoi', 'tue', 'voi', 'vostro', 'vostra']),
  de: new Set(['ich', 'mir', 'mich', 'mein', 'meine', 'meinen', 'meinem', 'meiner', 'meines', 'wir', 'uns', 'unser', 'unsere', 'unseren', 'unserem', 'unserer', 'du', 'dir', 'dich', 'dein', 'deine', 'deinen', 'deinem', 'deiner']),
};

// Whether or when to act, in the six languages at once (a reply may borrow a word: "hold", "trade", "target").
// Where a language tells the two apart, the forms listed are the ones that act (the infinitive after "should" or
// "conviene", the first person) and the third person that describes a price is left alone ("mantiene el sesgo",
// "hält die Unterstützung"). English cannot tell them apart, so "hold" and "add" are refused outright.
const ACT_WORDS = new Set([
  // English
  'enter', 'entering', 'entry', 'entries', 'exit', 'exits', 'exiting', 'add', 'adding', 'hold', 'holding', 'wait', 'waiting',
  'trim', 'trimming', 'should', 'shall', 'ought', 'worth', 'worthwhile', 'position', 'positions', 'target', 'targets', 'chase', 'chasing', 'allocate', 'allocation', 'sizing',
  'leverage', 'cheap', 'expensive', 'bargain', 'undervalued', 'overvalued', 'opportunity', 'opportunities', 'attractive', 'upside', 'fomo',
  // Spanish
  'entro', 'entras', 'entramos', 'entrando', 'entrada', 'entradas', 'salgo', 'salida', 'salidas', 'espero', 'esperamos', 'mantengo', 'aguanto', 'invierto', 'inversion', 'inversiones',
  'opero', 'operacion', 'operaciones', 'agrego', 'anado', 'acumulo', 'posicion', 'posiciones', 'objetivo', 'objetivos', 'conviene', 'convendria', 'convenga', 'convenia',
  'debo', 'debes', 'debemos', 'deberia', 'deberias', 'deberiamos', 'puedo', 'podemos', 'hago', 'hacemos',
  'apalancamiento', 'barato', 'barata', 'ganga', 'atractivo', 'atractiva', 'infravalorado', 'infravalorada', 'sobrevalorado', 'sobrevalorada', 'oportunidad', 'oportunidades',
  // French
  'entree', 'entrees', 'sors', 'sortie', 'sorties', 'attends', 'attendons', 'attendez', 'patienter', 'trader', 'objectif', 'objectifs', 'cible', 'cibles',
  'dois', 'devrais', 'devons', 'devrions', 'devez', 'devriez', 'faut', 'levier', 'opportunite', 'opportunites', 'occasion', 'occasions', 'attrayant', 'attrayante',
  // Portuguese
  'saio', 'saida', 'saidas', 'aguardo', 'mantenho', 'invisto', 'operacao', 'operacoes', 'posicao', 'posicoes', 'alvo', 'alvos',
  'devo', 'deves', 'devemos', 'deveria', 'deverias', 'deveriamos', 'posso', 'faco', 'fazemos', 'convem', 'compensa', 'alavancagem', 'pechincha', 'oportunidade', 'oportunidades', 'atraente',
  // Italian
  'entrata', 'entrate', 'ingresso', 'ingressi', 'esco', 'usciamo', 'uscita', 'uscite', 'aspetto', 'aspettiamo', 'attendo', 'tengo', 'investo', 'posizione', 'posizioni',
  'aggiungo', 'obiettivo', 'obiettivi', 'dovrei', 'dovresti', 'dobbiamo', 'dovremmo', 'devi', 'possiamo', 'faccio', 'facciamo', 'converrebbe', 'leva', 'opportunita', 'occasione', 'occasioni', 'attraente',
  // German
  'warten', 'abwarten', 'abzuwarten', 'zuwarten', 'warte', 'halten', 'behalten', 'halte', 'aufstocken', 'nachlegen',
  'handeln', 'traden', 'positionen', 'positionieren', 'tun', 'lohnt', 'lohnen', 'lohnenswert', 'zeitpunkt',
  'hebel', 'gunstig', 'billig', 'schnappchen', 'attraktiv', 'gelegenheit', 'gelegenheiten', 'chance', 'chancen', 'unterbewertet', 'uberbewertet',
]);
// A word that begins with one of these: the infinitive with its endings ("entrar", "entraría", "einsteigen").
const ACT_STEMS = ['invest', 'accumul', 'acumul',
  'entrar', 'salir', 'esperar', 'mantener', 'aguantar', 'invertir', 'operar', 'agregar', 'anadir', 'promediar',
  'entrer', 'sortir', 'attendre', 'garder', 'conserver', 'renforcer', 'ajouter',
  'sair', 'aguardar', 'manter', 'segurar', 'adicionar',
  'uscir', 'aspettar', 'attender', 'tenere', 'aggiunger',
  'einsteig', 'einstieg', 'aussteig', 'ausstieg', 'kursziel'];
// Timing and "what to do", as runs of words.
const ACT_PHRASES = [
  'too late', 'too early', 'late to', 'early to', 'good moment', 'good time', 'right moment', 'right time', 'best moment', 'best time', 'bad moment', 'bad time',
  'time to', 'moment to', 'when to', 'when should', 'to do', 'do with', 'do now', 'do about', 'do here', 'go long', 'go short', 'going long', 'going short', 'long or short',
  'open a long', 'open a short', 'get in', 'get out', 'getting in', 'getting out', 'jump in', 'pile in', 'load up', 'cash out', 'stay in', 'stay out', 'sit out', 'sitting out', 'step in',
  'how much', 'how many', 'how long', 'how soon', 'how to', 'how high', 'how low', 'how far', 'miss out', 'missing out', 'to trade', 'a trade', 'the trade', 'this trade', 'that trade', 'trade it', 'trade this', 'trade that',
  'trade here', 'trade now', 'trade idea', 'best trade', 'good trade', 'stop loss', 'safe to', 'what price', 'which price',
  'buen momento', 'mal momento', 'mejor momento', 'momento de', 'momento para', 'hora de', 'es hora', 'demasiado tarde', 'muy tarde', 'tarde para', 'es tarde', 'demasiado pronto', 'muy pronto', 'pronto para',
  'la pena', 'que hacer', 'hacer con', 'hacer ahora', 'hacer aqui', 'ponerse largo', 'ponerse corto', 'ir largo', 'ir corto', 'largo o corto', 'abrir largo', 'abrir corto', 'cuanto tiempo', 'hasta donde', 'hasta cuando', 'que precio',
  'bon moment', 'mauvais moment', 'meilleur moment', 'moment pour', 'moment de', 'moment d', 'trop tard', 'trop tot', 'tard pour', 'tot pour', 'que faire', 'quoi faire', 'faire avec', 'faire maintenant', 'faire ici',
  'vaut le coup', 'jusqu ou', 'combien de temps', 'long ou short', 'quel prix', 'bon marche',
  'bom momento', 'mau momento', 'melhor momento', 'tarde demais', 'muito tarde', 'cedo demais', 'muito cedo', 'cedo para', 'a pena', 'que fazer', 'fazer com', 'fazer agora', 'fazer aqui', 'quanto tempo', 'ate onde', 'ate quando', 'que preco',
  'buon momento', 'brutto momento', 'cattivo momento', 'momento giusto', 'momento migliore', 'miglior momento', 'momento di', 'momento per', 'ora di', 'troppo tardi', 'tardi per', 'troppo presto', 'presto per',
  'che fare', 'cosa fare', 'da fare', 'fare con', 'fare adesso', 'fare ora', 'fare qui', 'fino a dove', 'fino a quando', 'long o short', 'che prezzo', 'quale prezzo', 'buon mercato',
  'zu spat', 'zu fruh', 'spat fur', 'fruh fur', 'gute zeit', 'zeit fur', 'zeit zum', 'zu tun', 'wie viel', 'wie viele', 'wie lange', 'wie lang', 'wie hoch', 'wie tief', 'wie weit', 'long oder short', 'welcher preis', 'welchem preis', 'welchen preis', 'welcher kurs', 'welchem kurs', 'welchen kurs',
];

// The words Bobby's copy never uses, in any language, even negated: buy, sell, profit, guaranteed, returns,
// advice, signal, alert. A next question is copy like any other.
const FORBIDDEN_WORDS = new Set([
  'buy', 'buys', 'buying', 'bought', 'buyer', 'buyers', 'sell', 'sells', 'selling', 'sold', 'seller', 'sellers',
  'profit', 'profits', 'profitable', 'profitability', 'gains', 'returns', 'advice', 'advise', 'advises', 'advised', 'advisor', 'adviser', 'advisable',
  'signal', 'signals', 'signaling', 'signalling', 'alert', 'alerts', 'alerting',
  'compra', 'compras', 'compro', 'compre', 'compres', 'compren', 'compramos', 'compran', 'comprando', 'comprado', 'comprada',
  'vende', 'vendes', 'vendo', 'venda', 'vendas', 'vendan', 'vendemos', 'venden', 'vendiendo', 'vendido', 'vendi', 'venta', 'ventas',
  'ganancia', 'ganancias', 'beneficio', 'beneficios', 'lucro', 'lucros', 'rentable', 'rentabilidad', 'retorno', 'retornos', 'rendimiento', 'rendimientos',
  'consejo', 'consejos', 'asesoria', 'asesor', 'asesoramiento', 'senal', 'senales', 'alerta', 'alertas',
  'achat', 'achats', 'vends', 'vend', 'vendez', 'vendons', 'vendeur', 'vendeurs', 'vente', 'ventes', 'benefice', 'benefices', 'rentabilite', 'rendement', 'rendements',
  'conseil', 'conseils', 'signaux', 'alerte', 'alertes',
  'ganho', 'ganhos', 'lucrativo', 'rentavel', 'rentabilidade', 'rendimento', 'rendimentos', 'conselho', 'conselhos', 'assessoria', 'sinal', 'sinais',
  'compri', 'compriamo', 'vendita', 'vendite', 'profitto', 'profitti', 'guadagno', 'guadagni', 'redditizio', 'rendimenti', 'consulenza', 'segnale', 'segnali', 'allerta', 'allerte',
  'gekauft', 'gewinn', 'gewinne', 'gewinnen', 'profite', 'profitabel', 'rendite', 'renditen', 'ertrag', 'ertrage', 'rat', 'ratschlag', 'ratschlage', 'beratung', 'anlageberatung', 'signale', 'signalen', 'alarm', 'alarme',
]);
const FORBIDDEN_STEMS = ['guarant', 'garant', 'garanz', 'recommend', 'recommand', 'recomend', 'recomiend', 'raccomand', 'aconsej', 'aconselh', 'conseill', 'consigli', 'empfehl', 'empfiehl',
  'comprar', 'vender', 'achet', 'vendre', 'acquist', 'kauf', 'verkauf', 'nachkauf', 'zukauf', 'einkauf'];

/**
 * Whether `raw` may be served as the next question for a reply in `language` about `symbol`; null when it may.
 * It must be one question that opens with a what-or-why word of that language, and must not ask whether or when
 * to act, speak of the reader, carry a number, a price or a currency, or use a word Bobby's copy never uses.
 * The asset's own ticker is set aside first, so "NOW", "ADD" or "7203.T" is never read as a word or a number.
 */
export function nextQuestionViolation(raw: unknown, language: AppLanguage, symbol?: string | null): NextQuestionViolation | null {
  if (typeof raw !== 'string') return 'shape';
  const text = raw.trim();
  if (text.length < FOLLOW_UP_MIN || text.length > FOLLOW_UP_MAX) return 'shape';
  const named = symbol ? text.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(symbol)}(?![\\p{L}\\p{N}])`, 'gu'), ' ') : text;
  const plain = named.replace(TIMEFRAME_CODE, ' ').trim();
  const words = fold(plain).match(/\p{L}+/gu) ?? [];
  const run = ` ${words.join(' ')} `;
  if (words.some(word => ACT_WORDS.has(word) || PERSONAL[language].has(word) || ACT_STEMS.some(stem => word.startsWith(stem)))
    || ACT_PHRASES.some(phrase => run.includes(` ${phrase} `))) return 'act';
  if (words.some(word => FORBIDDEN_WORDS.has(word) || FORBIDDEN_STEMS.some(stem => word.startsWith(stem)))) return 'word';
  if (/[\p{N}\p{Sc}%‰]/u.test(plain) || words.some(word => NUMBER_WORDS.has(word))) return 'number';
  if (!ONE_QUESTION.test(plain) || words.length < 3) return 'shape';
  if (!OPENERS[language].test(words.join(' '))) return 'opener';
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
