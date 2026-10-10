// ============================================================
// What may be shown of a companion reply (api/_lib/companion.ts). No market evidence reaches that call and the
// reader has never invested, so the text is refused whole when it:
//   · states a market figure the person did not write: a number, a percentage or an amount, in digits or in
//     words ("diez por ciento al año", "one hundred thousand dollars"), money that "doubles every seven
//     years", or how a market is doing now;
//   · promises safety or gains ("no puedes perder", "always goes up", "völlig sicher"), on top of the desk's
//     own guard;
//   · recommends something to put money in, in the first person ("te recomiendo…", "mon conseil : …", "ich
//     würde … empfehlen"), or tells the person to do it ("compra un ETF cada mes", "you should start with…").
// A refused text is replaced by a fixed sentence. The next question is held to more: one question and nothing
// else, in the person's voice, never about buying, selling or which is best; a bad one is dropped and the text
// served.
//
// Every list is written for the six languages of the app (en, es, fr, pt, it, de) and
// scripts/test-companion.mts holds sentences in each of them for each rule. The rules are lists, and lists
// miss. They prefer to refuse: a refused good reply costs the person one fixed sentence, a shown bad one is
// Bobby promising a newcomer something. Three things are let through on purpose, because refusing them lost
// the most useful replies: a warning about a promise ("desconfía de quien te prometa ganancias
// garantizadas"), advice to learn ("te recomiendo empezar por entender…") and names that carry a number
// (S&P 500, 401(k)). Softer steering ("a good place to start is…") is held by the instructions alone; how
// often it gets through is what the model comparison counts (scripts/eval-companion.mts).
// ============================================================
import type { AppLanguage } from '../../src/lib/app-language.js';
import { publicTextViolation } from './desk-debate.js';

export type CompanionRejection = 'advice' | 'guarantee' | 'figure' | 'shape';

/** Lower case, no accents, straight apostrophes: every list below is written that way. */
const fold = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/ß/g, 'ss').replace(/[’‘`´]/g, "'");
const sentencesOf = (text: string) => text.split(/(?<=[.!?…])\s+/u).filter((s) => s.trim());
const wordsAfter = (text: string, from: number, n: number) => text.slice(from).trim().split(/\s+/).slice(0, n).join(' ');
const wordsBefore = (text: string, to: number, n: number) => text.slice(0, to).trim().split(/\s+/).slice(-n).join(' ');
const source = (parts: string[]) => `(?<![a-z])(?:${parts.join('|')})(?![a-z])`;
/** For .test(). */
const alt = (...parts: string[]) => new RegExp(source(parts));
/** For .matchAll(). */
const altAll = (...parts: string[]) => new RegExp(source(parts), 'g');

// ---------- a figure the person did not write ----------
// Names that carry a number are names: "the S&P 500", "a 401(k)", "24 hours a day", "step 1".
const NAMED_NUMBER = /(?<![a-z0-9])(?:s&p\s*500|(?:nasdaq|russell|dax|cac|ftse(?:\s+mib)?|ibex|euro\s*stoxx|stoxx|nikkei|dow(?:\s+jones)?|msci\s+world)[\s-]*\d{2,4}|401\s*\(?k\)?|403\s*\(?b\)?|web\s?3|24\s*(?:\/\s*7|horas|hours|heures|ore|stunden)|(?:paso|step|etape|passo|schritt)\s+\d{1,2})(?![a-z0-9])/g;
const NUMERAL = /\d+(?:[.,]\d+)*/g;
const numerals = (folded: string) => (folded.replace(NAMED_NUMBER, ' ').match(NUMERAL) ?? []).map((n) => n.replace(/\D/g, ''));
const PERCENT_MARK = /[%‰]/, MONEY_MARK = /[$€£¥₿]/;
const PERCENT_WORD = /(?<![a-z])(?:por\s?ciento|per\s?cent|percent|pour\s?cent|per\s?cento|prozent|por\s+cento|puntos?\s+porcentuales|percentage\s+points?|prozentpunkte?|punti\s+percentuali|points?\s+de\s+pourcentage|pontos?\s+percentuais)(?![a-z])/;
// Number words, with what each is worth: an amount in words is read back into the number it says.
const UNITS: Record<string, number> = {
  dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  doscientos: 200, trescientos: 300, quinientos: 500, duzentos: 200, trezentos: 300, quinhentos: 500,
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8, neuf: 9, dix: 10, vingt: 20, trente: 30, cinquante: 50,
  dois: 2, duas: 2, quatro: 4, sete: 7, oito: 8, nove: 9, dez: 10, vinte: 20, trinta: 30, cinquenta: 50,
  due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, dieci: 10, venti: 20, trenta: 30, cinquanta: 50,
  zwei: 2, drei: 3, vier: 4, funf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, zwanzig: 20, dreissig: 30, funfzig: 50,
};
const TIMES: Record<string, number> = {
  cien: 100, ciento: 100, hundred: 100, cent: 100, cents: 100, cem: 100, cento: 100, hundert: 100,
  mil: 1e3, thousand: 1e3, mille: 1e3, mila: 1e3, tausend: 1e3,
  millon: 1e6, millones: 1e6, million: 1e6, millions: 1e6, milhao: 1e6, milhoes: 1e6, milione: 1e6, milioni: 1e6, millionen: 1e6,
  billion: 1e9, milliard: 1e9, milliards: 1e9, milliarden: 1e9,
};
// Italian and German write a number as one word ("centomila", "hunderttausend"); so do Spanish hundreds.
const ONE_WORD = '[a-z]+mila|[a-z]+tausend|[a-z]+hundert|[a-z]+cento|[a-z]+cientos';
const NUMBER_WORD = `(?:${[...Object.keys(UNITS), ...Object.keys(TIMES)].join('|')}|${ONE_WORD})`;
const CURRENCY = '(?:dolares|dolar|dollars?|dollari|dollaro|pesos?|euros?|libras?|pounds?|reais|reales|francs?|franken|sterline|yen|usd|mxn|eur|bucks)';
const WORDED_AMOUNT = new RegExp(`(?<![a-z])(${NUMBER_WORD}(?:\\s+(?:${NUMBER_WORD}|y|and|et|e|und))*)\\s+(?:de\\s+|of\\s+|d'|di\\s+)?${CURRENCY}(?![a-z])`, 'g');
/** "cien mil" → 100000, "two thousand five hundred" → 2500. A word it cannot read counts for nothing. */
function worded(words: string): string {
  let total = 0, part = 0;
  for (const word of words.split(/\s+/)) {
    if (word in UNITS) part += UNITS[word];
    else if (TIMES[word] === 100) part = (part || 1) * 100;
    else if (word in TIMES) { total += (part || 1) * TIMES[word]; part = 0; }
  }
  return String(total + part);
}
const THOUSAND = 'k|mil|thousand|mille|mila|tausend', MILLION = 'millones|millon|millions?|milhoes|milhao|milioni|milione|millionen';
/** The numbers the person wrote, as digits: "1,000", "10k", "10 mil", "mil", "diez mil". */
export function theirNumbers(question: string): Set<string> {
  const q = fold(question), out = new Set(numerals(q));
  for (const m of q.matchAll(new RegExp(`(\\d+(?:[.,]\\d+)*)\\s*(${THOUSAND}|${MILLION})(?![a-z])`, 'g'))) {
    const n = Number(m[1].replace(/[.,](?=\d{3}(?!\d))/g, '').replace(',', '.'));
    if (Number.isFinite(n)) out.add(String(Math.round(n * (new RegExp(`^(?:${MILLION})$`).test(m[2]) ? 1e6 : 1e3))));
  }
  for (const m of q.matchAll(new RegExp(`(?<![a-z])${NUMBER_WORD}(?:\\s+(?:${NUMBER_WORD}|y|and|et|e|und))*(?![a-z])`, 'g'))) out.add(worded(m[0]));
  return out;
}
// A return said without a number, and how a market is doing now: neither can be known here.
const MULTIPLIES = /(?<![a-z])(?:duplica\w*|triplica\w*|dobla\w*|doubl(?:es?|ed|ing|ent)|tripl(?:es?|ed|ing|ent)|verdoppel\w*|verdreifach\w*|raddoppi\w*|dobra\w*)(?![a-z])[^.!?]{0,60}(?<![a-z])(?:cada|every|each|in|en|within|tous\s+les|chaque|ogni|alle|a\s+cada|em|binnen)\s+(?:[a-z]+\s+){0,2}?(?:anos?|years?|ans?|anni|jahren?|months?|meses|mois|mesi|monaten?)(?![a-z])/;
const NOW = "(?:right\\s+now|today|currently|these\\s+days|at\\s+the\\s+moment|hoy|ahora\\s+mismo|actualmente|en\\s+este\\s+momento|aujourd'hui|actuellement|en\\s+ce\\s+moment|oggi|adesso|attualmente|in\\s+questo\\s+momento|heute|derzeit|momentan|aktuell|gerade|zurzeit|hoje|atualmente|neste\\s+momento|agora)";
const MOVES = `(?:${[
  'record\\s+(?:highs?|lows?)|all[- ]time\\s+(?:highs?|lows?)|rising|falling|climbing|dropping|soaring|crashing|trad(?:es?|ing)\\s+(?:at|near|around)|pays?\\s+(?:about|around|over|more)|yields?\\s+(?:about|around|over)|is\\s+worth\\s+(?:about|around|over|more\\s+than)',
  '(?:maximos?|minimos?)\\s+historicos?|en\\s+(?:maximos|minimos)|subiendo|bajando|cayendo|cotiza[n]?|pagan?\\s+(?:un|una|cerca|alrededor|mas|menos)|rinde[n]?|vale[n]?\\s+(?:cerca|alrededor|mas\\s+de|unos)',
  'sommets?\\s+historiques?|plus\\s+hauts?\\s+historiques?|records?\\s+historiques?|en\\s+hausse|en\\s+baisse|grimpe(?:nt)?|chute(?:nt)?|vaut\\s+(?:pres|environ|plus)|rapporte(?:nt)?\\s+(?:environ|pres|plus)',
  'em\\s+(?:maximos|minimos|alta|queda)|subindo|caindo|a\\s+subir|a\\s+cair|rende[m]?\\s+(?:cerca|perto|quase|mais)|vale[m]?\\s+(?:perto|quase|mais\\s+de)',
  '(?:massimi|minimi)\\s+storici|in\\s+rialzo|in\\s+ribasso|sta(?:nno)?\\s+(?:salendo|scendendo|crollando)|vale\\s+(?:circa|quasi|piu)|rende\\s+(?:circa|quasi|piu)',
  'allzeithoch\\w*|rekordhoch\\w*|rekordtief\\w*|hochststand\\w*|steig(?:t|en)|fall(?:t|en)|kostet\\s+(?:etwa|fast|rund|uber)|bring(?:t|en)\\s+(?:etwa|fast|rund|uber)',
].join('|')})`;
// (The move must stand within a few words of the "now": "prices rise and fall, so today many people…" is not a quote.)
// Said without "now": a level only a quote can show, or a move that "keeps" going. "Prices can keep falling" is neither.
const STANDS_OR_KEEPS = [
  'at\\s+(?:record|all[- ]time)\\s+highs?', '(?:en|em)\\s+maximos(?:\\s+historicos)?', 'aux?\\s+(?:sommets|plus\\s+hauts)\\s+historiques?', 'ai\\s+massimi(?:\\s+storici)?', 'auf\\s+(?:einem\\s+)?(?:allzeithoch|rekordhoch)',
  '(?<!(?:can|could|may|might|puede[n]?|podria[n]?|pode[m]?)\\s)(?:sigue[n]?|keeps?|continues?|continua[nm]?)\\s+(?:subiendo|bajando|climbing|rising|falling|going\\s+up|subindo|caindo)',
  '(?<!(?:peut|peuvent|puo|possono|pode|podem)\\s)(?:continue(?:nt)?\\s+(?:de\\s+|a\\s+)?(?:monter|grimper|baisser)|continua(?:no)?\\s+a\\s+(?:salire|scendere)|continua[m]?\\s+a\\s+(?:subir|cair))', '(?:steigt|fallt)\\s+weiter', 'weiter\\s+(?:steigt|fallt)',
].join('|');
const MARKET_NOW = new RegExp(`(?<![a-z])(?:${NOW}(?![a-z])[^.!?]{0,30}(?<![a-z])${MOVES}|${MOVES}(?![a-z])[^.!?]{0,30}(?<![a-z])${NOW}|${STANDS_OR_KEEPS})(?![a-z])`);

/**
 * A number the person did not write: digits, a percentage or currency mark, an amount in words, a multiple, or
 * how a market is doing now. Exact where a model is not: it knows that "mil pesos" and "1,000 pesos" are the
 * same amount and that two thousand is not.
 */
export function statesAFigure(text: string, question: string): boolean {
  const t = fold(text), q = fold(question), theirs = theirNumbers(question);
  if (numerals(t).some((n) => !theirs.has(n))) return true;
  if ((PERCENT_MARK.test(t) || PERCENT_WORD.test(t)) && !(PERCENT_MARK.test(q) || PERCENT_WORD.test(q))) return true;
  // A currency mark beside the person's own number is their amount written another way ("500 pesos" → "$500").
  const marks = t.replace(/[$€£¥]\s?(\d+(?:[.,]\d+)*)|(\d+(?:[.,]\d+)*)\s?[$€£¥]/g, (m, a?: string, b?: string) => (theirs.has((a ?? b ?? '').replace(/\D/g, '')) ? ' ' : m));
  if (MONEY_MARK.test(marks) && !MONEY_MARK.test(q)) return true;
  // An amount in words is theirs when they wrote those words, or that number ("1,000 pesos" → "mil pesos").
  if ([...t.matchAll(WORDED_AMOUNT)].some((m) => !q.includes(m[0]) && !theirs.has(worded(m[1])))) return true;
  return MULTIPLIES.test(t) || MARKET_NOW.test(t);
}

// ---------- a promise ----------
// What a model says to reassure a beginner. Read on the folded text, except where an accent is the word
// (French "sûr" folds into the preposition "sur").
// "You can't lose": the promise is made of a negation, so only a negation BEFORE it undoes it ("that does not
// mean you can't lose").
const NEVER_LOSES = altAll(
  "(?:can'?t|cannot|can\\s+not|never|won'?t|will\\s+not|don'?t|doesn'?t|impossible\\s+to)\\s+(?:ever\\s+|really\\s+|actually\\s+)?lose(?!\\s+(?:sight|more\\s+than|track|sleep|everything\\s+if))",
  'no\\s+(?:puedes|se\\s+puede|podras|vas\\s+a)\\s+perder(?!\\s+(?:de\\s+vista|mas\\s+de|el\\s+sueno|todo\\s+si))', 'nunca\\s+(?:pierdes|se\\s+pierde|perderas|vas\\s+a\\s+perder|puedes\\s+perder)(?!\\s+de\\s+vista)',
  'no\\s+(?:pierdes|se\\s+pierde|perderas)\\s+(?:nunca|nada|dinero|tu\\s+dinero)', 'imposible\\s+perder', 'sin\\s+posibilidad\\s+de\\s+perder',
  "ne\\s+(?:peux|peut|pouvez|risques?|risquez)\\s+(?:pas|rien|jamais)(?:\\s+de)?\\s+perdre(?!\\s+(?:de\\s+vue|plus\\s+que))", 'ne\\s+(?:perds|perd|perdez|perdras)\\s+(?:jamais|rien)', 'impossible\\s+de\\s+perdre',
  'nao\\s+(?:podes|pode|da\\s+para|vais|vai|tem\\s+como|ha\\s+como)\\s+perder(?!\\s+(?:de\\s+vista|mais\\s+do\\s+que))', 'nunca\\s+(?:perdes|perde|se\\s+perde|vais\\s+perder|vai\\s+perder)(?!\\s+de\\s+vista)', 'impossivel\\s+perder',
  'non\\s+(?:puoi|si\\s+puo|potete|rischi)\\s+(?:mai\\s+)?(?:di\\s+)?perdere(?!\\s+(?:di\\s+vista|piu\\s+di))', 'non\\s+(?:perdi|si\\s+perde|perderai)\\s+(?:mai|nulla|niente)', 'impossibile\\s+perdere',
  '(?:kannst\\s+du|kann\\s+man|du\\s+kannst|man\\s+kann)(?:\\s+[a-z]+){0,3}?\\s+(?:kein\\s+geld|nichts|nicht|nie)\\s+verlieren', 'verlierst\\s+(?:du\\s+)?(?:nie|niemals|nichts|kein\\s+geld)', 'unmoglich\\s+zu\\s+verlieren');
// "Always goes up", "completely safe", "you will earn for sure". A negation before OR inside the match undoes it
// ("la bolsa no siempre sube", "die Börse steigt nicht immer").
const PROMISE: RegExp[] = [
  altAll('always\\s+(?:go(?:es)?\\s+(?:back\\s+)?up|rises?|recovers?|wins?|grows?|pays?(?:\\s+off)?|comes?\\s+back|bounces?\\s+back|ends?\\s+up\\s+higher|makes?\\s+money)', '(?:go(?:es)?\\s+up|rises?|grows?|wins?)\\s+(?:every\\s+time|without\\s+fail|no\\s+matter\\s+what)',
    'siempre\\s+(?:va[n]?\\s+a\\s+)?(?:sube[n]?|subir|gana[ns]?|ganar|se\\s+recupera[n]?|crece[n]?|crecer|termina[n]?\\s+(?:subiendo|ganando)|paga[n]?|da[n]?\\s+ganancias|vuelve[n]?\\s+a\\s+subir)', '(?:sube[n]?|ganas?|crece[n]?)\\s+siempre',
    '(?:monte|montent|gagnes?|remonte|grimpe)\\s+toujours', 'toujours\\s+(?:gagnant|a\\s+la\\s+hausse|rentable)', 'fini(?:t|ssent)\\s+toujours\\s+par\\s+(?:monter|remonter|gagner)',
    'sempre\\s+(?:vai\\s+)?(?:sobe[m]?|subir|ganha[ms]?|ganhar|se\\s+recupera[m]?|cresce[m]?|volta[m]?\\s+a\\s+subir)', '(?:sobe[m]?|ganhas?|cresce[m]?)\\s+sempre',
    '(?:sale|salgono|guadagni|cresce|crescono|risale|risalgono)\\s+sempre', 'sempre\\s+(?:in\\s+crescita|sale|risale|salgono)',
    '(?:steigt|steigen|gewinnt|erholt\\s+sich|wachst)(?:\\s+[a-z]+){0,3}?\\s+immer(?!\\s+(?:mal|wieder))', 'immer\\s+(?:steigt|gewinnt|wieder\\s+steigt|nach\\s+oben)'),
  altAll('(?:totally|completely|perfectly|absolutely|entirely|fully|100\\s?%)\\s+safe', 'safe\\s+(?:investments?|bets?|way\\s+to\\s+(?:grow|make|earn|invest|build))', '(?:is|are)\\s+safe\\s+money',
    '(?:totalmente|completamente|absolutamente|del\\s+todo|cien\\s+por\\s+ciento|100\\s?%)\\s+segur[oa]s?', '(?:dinero|inversion(?:es)?|ganancias?|rendimientos?|apuesta)\\s+segur[oa]s?',
    '(?:dinheiro|investimentos?|ganhos?|aposta)\\s+segur[oa]s?', '(?:totalmente|completamente|assolutamente|del\\s+tutto)\\s+sicur[oaie]', '(?:investiment[oi]|soldi|guadagn[oi]|denaro)\\s+sicur[oi]',
    '(?:vollig|vollkommen|absolut|komplett|hundertprozentig|total)\\s+sicher[a-z]{0,2}', 'sichere[snrm]?\\s+(?:geld|anlage|geldanlage|investment|investition|rendite|gewinn\\w*)'),
  altAll("(?:earn|make|gain|profit|grow|win)(?![a-z])[^.!?;]{0,30}(?<![a-z])for\\s+sure", 'for\\s+sure(?![a-z])[^.!?;]{0,30}(?<![a-z])(?:earn|make\\s+money|gain|profit)', "(?:will|you'll)\\s+(?:definitely|certainly|surely)\\s+(?:earn|make|gain|grow|go\\s+up|rise|win|profit)", '(?:is|are)\\s+(?:sure|certain|bound)\\s+to\\s+(?:go\\s+up|rise|grow|pay|win|recover)',
    'seguro\\s+que\\s+(?:ganas|ganaras|sube|subira|crece|crecera|recuperas)', '(?:ganas|ganaras|vas\\s+a\\s+ganar)\\s+(?:seguro|con\\s+seguridad|si\\s+o\\s+si|siempre)', 'si\\s+o\\s+si\\s+(?:ganas|sube|subira|crece)',
    'com\\s+certeza\\s+(?:ganhas?|vais\\s+ganhar|vai\\s+ganhar|sobe|vai\\s+subir)', '(?:ganhas?|vais\\s+ganhar|vai\\s+ganhar)\\s+(?:com\\s+certeza|de\\s+certeza|sempre)',
    '(?:di\\s+sicuro|sicuramente|certamente)\\s+(?:guadagni|guadagnerai|sale|salira|crescera)', '(?:guadagni|guadagnerai)\\s+(?:di\\s+sicuro|sicuramente|sempre)',
    '(?:garantiert|bestimmt|sicher|auf\\s+jeden\\s+fall)\\s+(?:gewinn\\w*|steig\\w*)', '(?:gewinnst|verdienst)\\s+(?:du\\s+)?(?:garantiert|bestimmt|sicher|auf\\s+jeden\\s+fall|immer)'),
];
const PROMISE_ACCENTED = /(?<![\p{L}])(?:(?:totalement|complètement|parfaitement|absolument|entièrement|tout\s+à\s+fait)\s+sûr[es]{0,2}|(?:argent|placement|investissement|gain)s?\s+sûr[es]{0,2}|à\s+coup\s+sûr|sans\s+(?:aucun\s+)?danger|(?:gagnes|gagneras|gagnez)\s+(?:forcément|toujours|à\s+tous\s+les\s+coups))(?![\p{L}])/giu;
// "…always goes up and down" is not a promise.
const AND_DOWN = /^\s+(?:y|o|e|and|or|et|ou|und|oder)\s+(?:baja\w*|cae\w*|down|falls?|drops?|descend\w*|baisse\w*|desce\w*|cai\w*|scende\w*|fallt|sinkt)/;
// "Sin duda" and "without a doubt" strengthen a claim: "sin" and "without" are not read as negations here.
const NEGATIONS = "not|never|nothing|nobody|none|isn't|aren't|doesn't|don't|won't|wouldn't|can't|cannot|nunca|nada|nadie|ningun\\w*|ni|tampoco|ne|n'|pas|aucune?|jamais|rien|non|nessun\\w*|mai|nicht|nie|niemals|niemand|kein\\w*|nichts|nao|nenhum\\w*|nem|ninguem";
// Portuguese "no" is "in the" ("no longo prazo"), not a negation.
const NEGATION_PT = alt(NEGATIONS), NEGATION_ELSE = alt(`no|${NEGATIONS}`);
const negationIn = (language: AppLanguage) => (language === 'pt' ? NEGATION_PT : NEGATION_ELSE);
const NEGATED_AFTER = /(?<![a-z])(?:kein\w*|nicht|nichts|niemals|pas)(?![a-z])/;
// A warning about a promise, or a myth being named: the promise is someone else's.
const WARNING = alt(
  "scams?|frauds?|fraudulent|red\\s+flags?|warning\\s+signs?|be\\s+(?:wary|careful|skeptical|suspicious)|beware|watch\\s+out|(?:anyone|whoever|someone|somebody|people)\\s+(?:who\\s+)?promis\\w+|too\\s+good\\s+to\\s+be\\s+true|myths?|(?:not|isn't)\\s+true",
  'estafas?|fraudes?|desconfi\\w+|cuidado\\s+con|senal(?:es)?\\s+(?:de\\s+alerta|clara)|quien(?:es)?\\s+(?:te\\s+)?(?:promet\\w+|ofre[cz]\\w+)|alguien\\s+(?:te\\s+)?(?:promet\\w+|ofre[cz]\\w+)|te\\s+(?:prometen|ofrecen|ofrezcan|prometan)|mitos?|no\\s+es\\s+cierto|demasiado\\s+buen[oa]',
  "arnaques?|escroquer\\w+|mefi\\w+|attention\\s+(?:a|aux)|signal\\s+d'alarme|(?:quiconque|celui\\s+qui|ceux\\s+qui|quelqu'un)\\s+(?:qui\\s+)?(?:te\\s+|vous\\s+)?promet\\w*|si\\s+(?:quelqu'un|on)\\s+(?:te\\s+|vous\\s+)?promet\\w*|mythes?|trop\\s+beau",
  'golpes?|burlas?|cuidado\\s+com|sinal\\s+de\\s+alerta|quem\\s+(?:te\\s+|lhe\\s+)?(?:promet\\w+|oferec\\w+)|alguem\\s+(?:te\\s+|lhe\\s+)?(?:promet\\w+|oferec\\w+)|bom\\s+demais',
  "truff[ae]|frod[ei]|diffida\\w*|attenzione\\s+a|campanell[oi]\\s+d'allarme|chi\\s+(?:ti\\s+)?(?:promette|offre)|qualcuno\\s+(?:ti\\s+)?(?:promette|offre)|falso\\s+mito|troppo\\s+bello",
  'betrug\\w*|abzocke|misstrau\\w*|vorsicht|warnsignal\\w*|warnzeichen|wer\\s+(?:dir\\s+)?[^.!?]{0,40}verspricht|jemand\\s+[^.!?]{0,40}verspricht|mythos|zu\\s+schon,?\\s+um\\s+wahr');
const I_PROMISE = /(?<![a-z])(?:i\s+promise|te\s+(?:lo\s+)?prometo|je\s+(?:te\s+)?(?:le\s+)?promets|eu\s+prometo|prometo-te|ti\s+prometto|te\s+lo\s+prometto|ich\s+verspreche)(?![a-z])/;
const warns = (folded: string) => WARNING.test(folded) && !I_PROMISE.test(folded);

function promises(sentence: string, language: AppLanguage): boolean {
  const s = fold(sentence), NEGATION = negationIn(language);
  if (warns(s)) return false;
  for (const m of s.matchAll(NEVER_LOSES)) if (!NEGATION.test(wordsBefore(s, m.index ?? 0, 6))) return true;
  for (const pattern of PROMISE) {
    for (const m of s.matchAll(pattern)) {
      const at = m.index ?? 0;
      const end = at + m[0].length;
      if (AND_DOWN.test(s.slice(end)) || NEGATION.test(m[0])) continue;
      // The negation can follow: "una inversión segura no existe", "eine sichere Anlage gibt es nicht".
      if (NEGATION.test(wordsAfter(s, end, 2)) || NEGATED_AFTER.test(wordsAfter(s, end, 4))) continue;
      if (!NEGATION.test(wordsBefore(s, at, 6))) return true;
    }
  }
  const lower = sentence.normalize('NFC').toLowerCase();
  return [...lower.matchAll(PROMISE_ACCENTED)].some((m) => !NEGATION.test(fold(wordsBefore(lower, m.index ?? 0, 6))));
}

// ---------- a recommendation, an instruction ----------
// Something a person can put money in. The words every language uses, then each language's own staples.
const PRODUCT_WORDS = 'etfs?|s&p\\s*500|nasdaq|msci\\s+world|bitcoin|btc|ethereum|ether|cripto\\w*|crypto\\w*|krypto\\w*|brokers?|apps?|index\\s+funds?|mutual\\s+funds?|funds?|stocks?|shares|bonds?|treasur\\w+|platforms?'
  + '|cetes|afores?|fondos?|acciones|bonos?|plataformas?|certificados?|pagares?|udibonos|sofipos?|letras\\s+del\\s+tesoro'
  + '|fonds|obligations|courtiers?|plateformes?|livrets?|assurance[- ]vie|scpi|sicav'
  + '|acoes|obrigacoes|fundos?|corretoras?|tesouro\\s+direto|cdbs?|poupanca|ppr'
  + '|azioni|obbligazioni|fondi|piattaforme|btp|conto\\s+deposito'
  + '|aktien|anleihen|plattform\\w*|tagesgeld\\w*|festgeld\\w*|sparpl[a]n\\w*';
// Words that are a product in one language and an everyday word in another: French "actions", English "IRA".
const PRODUCT_OWN: Partial<Record<AppLanguage, string>> = { fr: 'actions|pea', en: 'roth|iras?|cds?|money\\s+market', it: 'bot|pac' };
const PRODUCT = Object.fromEntries((['en', 'es', 'fr', 'pt', 'it', 'de'] as const).map((language) => [language, alt(PRODUCT_WORDS + (PRODUCT_OWN[language] ? `|${PRODUCT_OWN[language]}` : ''))])) as Record<AppLanguage, RegExp>;
// Money set aside for a bad month is not a product, though five languages call it a "fund".
const SET_ASIDE = /(?<![a-z])(?:emergency\s+funds?|rainy[- ]day\s+funds?|fondos?\s+(?:de|para)\s+(?:emergencias?|imprevistos|ahorro)|fonds\s+d'urgence|fundos?\s+de\s+(?:emergencia|reserva)|fond[oi]\s+(?:di|d')\s*emergenza)(?![a-z])/g;
/** The folded text with those set aside, for the question "is a product named here?". */
const named = (folded: string) => folded.replace(SET_ASIDE, ' ');
// Advice to learn is not advice to buy: "te recomiendo empezar por entender…", "I suggest reading about…".
const LEARNING = alt(
  'learn(?:ing)?|understand(?:ing)?|read(?:ing)?|get(?:ting)?\\s+to\\s+know|think(?:ing)?|ask(?:ing)?\\s+yourself|figur(?:e|ing)\\s+out|tak(?:e|ing)\\s+(?:your\\s+)?time|go(?:ing)?\\s+slow\\w*',
  'entender|entiendas|comprender|comprendas|aprender|aprendas|conocer|conozcas|leer|leas|informarte|investigar|investigues|estudiar|pensar|pienses|preguntarte|tener\\s+claro|definir',
  'comprendre|apprendre|lire|te\\s+renseigner|reflechir|te\\s+demander|te\\s+former',
  'compreender|perceber|ler|estudar|informar-te|se\\s+informar|pesquisar',
  'capire|capendo|comprendere|imparare|imparando|leggere|informarti|studiare|chiederti|riflettere',
  'verstehen|lernen|lesen|informieren|nachzudenken|nachdenken|fragen');
const I_RECOMMEND = altAll(
  '(?:yo\\s+)?(?:te\\s+)?(?:recomiendo|aconsejo|sugiero|recomendaria|aconsejaria|sugeriria)', 'mi\\s+(?:recomendacion|consejo|sugerencia)',
  "i(?:\\s+would|\\s+do|'d)?(?:\\s+(?:[a-z]+ly|always|also|just|still)){0,2}\\s+(?:recommend|suggest|advise)", 'my\\s+(?:advice|recommendation|suggestion|tip|pick)',
  'je\\s+(?:te\\s+|vous\\s+)?(?:recommande|conseille|suggere|recommanderais|conseillerais|suggererais)', 'ma\\s+(?:recommandation|suggestion)', 'mon\\s+conseil',
  '(?:eu\\s+)?(?:te\\s+)?(?:recomendo|aconselho|sugiro|recomendaria|aconselharia|sugeriria)(?:-te|-lhe)?', '(?:a\\s+)?minha\\s+(?:recomendacao|sugestao|dica)', '(?:o\\s+)?meu\\s+conselho',
  '(?:io\\s+)?(?:ti\\s+)?(?:consiglio|raccomando|suggerisco|consiglierei|raccomanderei|suggerirei)', 'il\\s+mio\\s+(?:consiglio|suggerimento)', 'la\\s+mia\\s+raccomandazione',
  'ich\\s+(?:empfehle|rate)', 'ich\\s+wurde(?![a-z])[^.!?]{0,60}(?<![a-z])(?:empfehlen|raten)', 'mein\\s+(?:rat|tipp)', 'meine\\s+empfehlung');
/** A first-person recommendation whose object, within a few words, is something to put money in. */
function recommends(text: string, language: AppLanguage): boolean {
  const t = named(fold(text)), NEGATION = negationIn(language);
  for (const m of t.matchAll(I_RECOMMEND)) {
    const at = m.index ?? 0, end = at + m[0].length;
    // "No te recomiendo ninguna plataforma", "ich empfehle keine…": declining is not recommending.
    if (NEGATION.test(wordsBefore(t, at, 3)) || NEGATED_AFTER.test(wordsAfter(t, end, 3))) continue;
    if (LEARNING.test(wordsAfter(t, end, 4))) continue;
    if (PRODUCT[language].test(named(`${m[0]} ${wordsAfter(t, end, 6)}`))) return true;
  }
  return false;
}
const FILLER = '(?:(?:just|simply|then|first|so|now|instead|always|solo|simplemente|primero|luego|mejor|entonces|ensuite|puis|depois|poi|dann|einfach)\\s+){0,2}';
const DO_IT = new RegExp(`^["'¡\\s]*${FILLER}(?:${[
  'buy|invest\\s+in|put\\s+(?:your|some|a\\s+little|a\\s+bit\\s+of)\\s+(?:money|savings|cash)\\s+in(?:to)?|hold\\s+(?:it|them|on\\s+to)|start\\s+with',
  'compra|invierte\\s+en|mete\\s+(?:tu|el)\\s+dinero\\s+en|pon\\s+(?:tu|el)\\s+dinero\\s+en|empieza\\s+con|quedate\\s+con|apuesta\\s+por',
  'achete[z]?|investis(?:sez)?\\s+dans|commence[z]?\\s+(?:par|avec)|mets\\s+ton\\s+argent\\s+dans|place\\s+ton\\s+argent\\s+(?:dans|sur)',
  'compre|investe\\s+em|invista\\s+em|comeca\\s+com|comece\\s+com|poe\\s+o\\s+(?:teu\\s+)?dinheiro\\s+em|coloque\\s+(?:o\\s+)?seu\\s+dinheiro\\s+em|aposta\\s+em',
  'acquista|investi\\s+in|inizia\\s+con|comincia\\s+con|metti\\s+i\\s+(?:tuoi\\s+)?soldi\\s+in|punta\\s+su',
  'kaufe?|investiere?\\s+in|fang\\s+mit|starte\\s+mit|beginne\\s+mit|lege?\\s+dein\\s+geld\\s+in|setz(?:e)?\\s+auf',
].join('|')})(?![a-z])`);
const YOU_SHOULD = altAll(
  "you\\s+(?:should|must|need\\s+to|ought\\s+to|have\\s+to|want\\s+to|might\\s+want\\s+to|could\\s+just|can\\s+just|'d\\s+better|better)\\s+(?:[a-z]+\\s+){0,2}?(?:buy|invest\\s+in|start\\s+with|put\\s+(?:your\\s+|some\\s+)?(?:money|savings)|hold|go\\s+with)",
  '(?:deberias|deberiais|debes|tienes\\s+que|te\\s+conviene|necesitas|lo\\s+mejor\\s+es|lo\\s+ideal\\s+es|te\\s+diria\\s+que|mejor)\\s+(?:[a-z]+\\s+){0,2}?(?:invertir\\s+en|comprar|empezar\\s+con|(?:meter|poner)\\s+(?:tu\\s+|el\\s+)?dinero|empieces\\s+con|compres|inviertas\\s+en|(?:metas|pongas)\\s+(?:tu\\s+|el\\s+)?dinero)',
  'te\\s+conviene\\s+(?:mas\\s+)?(?:un|una|el|la|los|las)',
  "(?:tu\\s+(?:devrais|dois)|vous\\s+(?:devriez|devez)|il\\s+(?:te\\s+|vous\\s+)?faut|le\\s+mieux\\s+est\\s+d[e'])\\s*(?:[a-z']+\\s+){0,2}?(?:investir\\s+dans|acheter|commencer\\s+(?:par|avec)|placer\\s+ton\\s+argent)",
  '(?:(?:voce|tu)\\s+)?(?:deves|deve|devias|deverias?|precisas?\\s+de|tens\\s+de|tem\\s+que|o\\s+melhor\\s+e|o\\s+ideal\\s+e|convem)\\s+(?:[a-z]+\\s+){0,2}?(?:investir\\s+em|comprar|comecar\\s+com|(?:colocar|por)\\s+(?:o\\s+)?(?:teu\\s+|seu\\s+)?dinheiro)',
  '(?:dovresti|devi|ti\\s+conviene|la\\s+cosa\\s+migliore\\s+e|conviene)\\s+(?:[a-z]+\\s+){0,2}?(?:investire\\s+in|comprare|acquistare|iniziare\\s+con|cominciare\\s+con|mettere\\s+i\\s+(?:tuoi\\s+)?soldi)',
  '(?:du\\s+solltest|du\\s+musst|am\\s+besten)(?![a-z])[^.!?]{0,40}(?<![a-z])(?:kaufen|investieren|anfangen|starten|beginnen|anlegen|kaufst|investierst|fangst|startest|beginnst)');
// "Start with what a stock is", "empieza con lo básico": an idea, not a product.
const AN_IDEA = /^(?:what|how|why|the\s+basics|a\s+question|que\s+(?:es|son)|como\s+funciona\w*|por\s+que|lo\s+basico|una\s+pregunta|ce\s+qu|les\s+bases|une\s+question|o\s+(?:que|basico)|uma\s+pergunta|che\s+cos|le\s+basi|una\s+domanda|was\s+(?:ein|ist)|den\s+grundlagen|einer\s+frage)(?![a-z])/;
/** The person told to put money in something: an imperative that opens a clause, or "you should…", beside a product. */
function instructs(sentence: string, language: AppLanguage): boolean {
  const s = named(fold(sentence)), NEGATION = negationIn(language);
  if (!PRODUCT[language].test(s)) return false;
  const explains = (text: string, from: number) => LEARNING.test(wordsAfter(text, from, 4)) || AN_IDEA.test(wordsAfter(text, from, 4));
  for (const m of s.matchAll(YOU_SHOULD)) if (!NEGATION.test(wordsBefore(s, m.index ?? 0, 3)) && !explains(s, (m.index ?? 0) + m[0].length)) return true;
  // Where an imperative can open: the sentence, and each clause after a colon, a semicolon, a comma or "and then".
  return s.split(/[:;]\s+|,\s+(?:(?:y|and|et|e|und)\s+)?|\s+(?:y|and|et|e|und)\s+(?=(?:luego|then|despues|ensuite|puis|depois|poi|dann)\s)/).some((clause) => { const m = DO_IT.exec(clause); return m !== null && !explains(clause, m[0].length); });
}

// ---------- the desk's own guard, read for a beginner ----------
// A call to act that opens a sentence is advice at the desk ("Entra…", "Take advantage…"); here the same verbs
// open explanations ("Entra en juego el riesgo"), so one with nothing of the market after it is let through.
const CALL_TO_ACT = /^(?:Aprovecha|Aprovechen|Abre|Abran|Entra|Entren|Take\s+advantage|Aproveite|Abra)(?![\p{L}])/u;
const TRADE_WORD = /(?<![a-z])(?:posicion\w*|largos?|cortos?|long|short|trades?|operacion\w*|dip|caida|oportunidad\w*|opportunit\w+|mercado|market)(?![a-z])/;
function deskViolation(sentence: string, language: AppLanguage): 'advice' | 'guarantee' | null {
  let found = publicTextViolation(sentence);
  if (found === 'advice' && CALL_TO_ACT.test(sentence.trimStart()) && !PRODUCT[language].test(named(fold(sentence))) && !TRADE_WORD.test(fold(sentence))) {
    found = publicTextViolation(sentence.trimStart().replace(CALL_TO_ACT, (word) => word.toLowerCase()));
  }
  return found === 'guarantee' && warns(fold(sentence)) ? null : found;
}

function textViolation(text: string, question: string, language: AppLanguage): Exclude<CompanionRejection, 'shape'> | null {
  for (const sentence of sentencesOf(text)) {
    const desk = deskViolation(sentence, language);
    if (desk) return desk;
    if (promises(sentence, language)) return 'guarantee';
    if (instructs(sentence, language)) return 'advice';
  }
  if (recommends(text, language)) return 'advice';
  return statesAFigure(text, question) ? 'figure' : null;
}

// ---------- the next question ----------
// One question and nothing else. A statement with a question mark, or a question after a sentence, is not one.
const ONE_QUESTION = /^¿?[^.!?¡¿？:;…]+[?？]$/u;
// Whether, what or when to buy or sell, which is best, what something will do: never Bobby's chip.
const ASKS_TO_ACT = alt(
  'buy\\w*|sell\\w*|purchas\\w*(?!\\s+power)|(?<!poder\\s+de\\s+)compr(?:a|ar|o|e|as|an|amos|ando|ado|are|i)(?:l[oa]s?)?|vend(?:o|e|er|es|a|en|emos|iendo|re|s|ez|ere|i)(?:l[oa]s?)?|achet\\w*|achat\\w*|kauf\\w*|verkauf\\w*|acquist\\w*',
  'best|better|mejor(?:es)?|meilleure?s?|mieux|melhor(?:es)?|miglior[ei]?|meglio|beste[nrs]?|besser',
  'should\\s+i|shall\\s+i|deberia|debo|conviene|convem|devrais-je|dois-je|est-ce\\s+que\\s+je\\s+(?:dois|devrais)|faut-il|devo|deveria|dovrei|soll(?:te)?\\s+ich|muss\\s+ich',
  'worth|vale\\s+la\\s+pena|vale\\s+a\\s+pena|vaut|lohnt', 'how\\s+much\\s+should|cuanto\\s+(?:debo|deberia|invierto)',
  '(?:which|cual|quel(?:le)?s?|welche[rsnm]?|quale|quali|qual)\\s+(?:[a-z]+\\s+){0,2}?(?:one|stock|fund|etf|broker|app|platform|accion|fondo|plataforma|action|fonds|courtier|aktie|azione|acao|fundo|corretora)',
  'will\\s+[a-z]+\\s+(?:go|rise|fall|recover)|va\\s+a\\s+(?:subir|bajar)|subira|bajara|va\\s+(?:monter|baisser)|montera|vai\\s+(?:subir|cair)|salira|scendera|wird\\s+[a-z ]{0,20}(?:steigen|fallen)',
  'get\\s+rich|hacerme\\s+rico|devenir\\s+riche|ficar\\s+rico|diventare\\s+ricco|reich\\s+werden|turn\\s+[a-z0-9 ]+\\s+into');
// The chip is the person's voice: a question put TO the person ("¿Cuánto dinero tienes?") is Bobby asking.
const ASKS_THE_PERSON: Record<AppLanguage, RegExp> = {
  en: alt('you|your|yours|yourself'), es: alt('tienes|quieres|puedes|sabes|has|tu|tus|ti|te|usted|ustedes'), fr: alt('tu|ton|ta|tes|toi|vous|votre|vos'),
  pt: alt('tu|teu|tua|teus|tuas|voce|seu|sua|tens|queres|podes'), it: alt('tu|tuo|tua|tuoi|tue|hai|vuoi|puoi|ti'), de: alt('du|dein\\w*|dir|dich|hast|willst|kannst|mochtest'),
};
/** The shape of a next question, whatever it asks: one question, short enough for a chip, with no figure. */
export const nextQuestionShape = (next: string, question: string) => next.length >= 6 && next.length <= 140 && ONE_QUESTION.test(next) && !statesAFigure(next, question);

function usableNext(next: string, question: string, language: AppLanguage): boolean {
  if (next.length < 6 || next.length > 140 || !ONE_QUESTION.test(next)) return false;
  const folded = fold(next);
  if (ASKS_TO_ACT.test(folded) || ASKS_THE_PERSON[language].test(folded)) return false;
  return textViolation(next, question, language) === null;
}

/**
 * What may be shown of a model's reply. The text is refused whole; a next question that breaks the same rules,
 * or is not one question in the person's voice, is dropped and the text served.
 */
export function reviewCompanionReply(question: string, raw: { text: string; followUp: string }, language: AppLanguage = 'en'): { text: string; followUp: string | null } | { rejected: CompanionRejection } {
  const text = raw.text.trim();
  const rejected = textViolation(text, question, language);
  if (rejected) return { rejected };
  const next = raw.followUp.trim();
  return { text, followUp: usableNext(next, question, language) ? next : null };
}
